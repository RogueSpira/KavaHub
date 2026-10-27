// Reel Maker: short vertical videos (1080×1920) in the Kava & Co. look for Instagram Reels and Stories.
// Pick a template, fill it in (or pull from TV Screens), watch the preview, then "Make video" records
// it right here and hands it to the share sheet (Instagram, Photos…) or downloads it.
// No music is added: pick a sound inside Instagram after uploading.
import { h, clear, field, seg } from "../../js/ui.js";
import { W, H, TEMPLATES, LOOKS, drawFrame, DISPLAY } from "./draw.js";
import { Muxer, ArrayBufferTarget } from "../../vendor/mp4-muxer.mjs";
import { withDefaults, occurrences, businessDate, crewFor, keyOf } from "../../js/tv-shared.js";

const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
const LOGO = "/board/assets/mandarin-logo.png", MANNY = "/board/assets/manny.png";
const LENGTHS = [7, 10, 15];

// Images from the hub itself (uploads, board assets) can go into the video; pictures from other
// sites (like Google Drive) can't be recorded by the browser, so those are skipped.
const sameSite = (src) => typeof src === "string" && (src.startsWith("/") || src.startsWith(location.origin) || src.startsWith("blob:") || src.startsWith("data:"));
const loadImg = (src) => new Promise((res) => {
  if (!src || !sameSite(src)) { res(null); return; }
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

// Making the video. Instagram needs H.264 MP4, so every path below produces exactly that.
//  1. The browser's built-in encoder (WebCodecs): Chrome, Edge, Safari, most phones. Fast.
//  2. If that's missing or fails (e.g. Firefox), a bundled H.264 encoder that runs in the page
//     (WebAssembly). Works in every modern browser; a bit slower.
// Both draw each frame at full size off-screen, so the video never depends on playback speed.
const FPS = 30;
const frameCount = (seconds) => Math.round((seconds + 0.3) * FPS);
const tick = () => new Promise((r) => setTimeout(r, 0));

async function h264Config() {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  for (const codec of ["avc1.640034", "avc1.640033", "avc1.640032", "avc1.640028", "avc1.4d0034", "avc1.4d0028", "avc1.42003e", "avc1.420034", "avc1.42002a"]) {
    for (const hardwareAcceleration of ["no-preference", "prefer-software"]) {
      const config = { codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS, hardwareAcceleration, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch {}
    }
  }
  return null;
}
async function encodeWebCodecs(reel, assets, onProgress) {
  const config = await h264Config();
  if (!config) return null;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: W, height: H, frameRate: FPS }, fastStart: "in-memory" });
  let failed = null, chunks = 0;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        if (!chunks && !meta?.decoderConfig?.description) throw new Error("encoder gave no H.264 header");
        muxer.addVideoChunk(chunk, meta); chunks++;
      } catch (e) { failed = e; }
    },
    error: (e) => { failed = e; },
  });
  try { enc.configure(config); } catch (e) { return null; }
  const D = reel.seconds, frames = frameCount(D), us = 1e6 / FPS;
  for (let i = 0; i < frames && !failed; i++) {
    drawFrame(g, Math.min(i / FPS, D), reel, assets);
    const frame = new VideoFrame(c, { timestamp: Math.round(i * us), duration: Math.round(us) });
    try { enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 }); } catch (e) { failed = e; }
    frame.close();
    while (enc.encodeQueueSize > 6 && !failed) await new Promise((r) => setTimeout(r, 5));
    if (i % 6 === 0) { onProgress(i / frames); await tick(); }
  }
  if (!failed) await enc.flush().catch((e) => { failed = e; });
  try { enc.close(); } catch {}
  if (failed || chunks < frames * 0.9) { console.warn("Built-in H.264 encoder didn't work, using the bundled one", failed); return null; }
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

let hmeLoading = null;
function loadHme() {
  if (window.HME) return Promise.resolve(window.HME);
  hmeLoading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/vendor/h264-mp4-encoder.web.js";
    s.onload = () => (window.HME ? res(window.HME) : rej(new Error("Video encoder didn't load")));
    s.onerror = () => { hmeLoading = null; rej(new Error("Couldn't load the video encoder. Check the connection and try again.")); };
    document.head.append(s);
  });
  return hmeLoading;
}
async function encodeWasm(reel, assets, onProgress) {
  const HME = await loadHme();
  const enc = await HME.createH264MP4Encoder();
  enc.width = W; enc.height = H; enc.frameRate = FPS;
  enc.speed = 10; enc.quantizationParameter = 24; enc.groupOfPictures = FPS * 2;
  enc.initialize();
  try {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    const D = reel.seconds, frames = frameCount(D);
    for (let i = 0; i < frames; i++) {
      drawFrame(g, Math.min(i / FPS, D), reel, assets);
      enc.addFrameRgba(g.getImageData(0, 0, W, H).data);
      onProgress(i / frames);
      await tick();
    }
    enc.finalize();
    const bytes = enc.FS.readFile(enc.outputFilename);
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    try { enc.FS.unlink(enc.outputFilename); } catch {}
    try { enc.delete(); } catch {}
  }
}

// Phone photos can be 12+ megapixels; drawing that 30 times a second is slow. Keep a copy that's
// just big enough for a 1080-wide video.
function shrink(img, max = 1500) {
  if (!img) return null;
  const w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  if (k >= 1) return img;
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function mount(el, ctx) {
  let tv = null;
  const reel = { template: "drink", look: "cream", seconds: 10, data: {} };
  const assets = { logo: null, manny: null, photo: null };
  let photoUrl = "", photoSource = "";
  Promise.all([loadImg(LOGO), loadImg(MANNY)]).then(([l, m]) => { assets.logo = l; assets.manny = m; });
  document.fonts?.load?.(`80px ${DISPLAY.split(",")[0]}`).catch(() => {});

  const fillDefaults = () => {
    const tpl = TEMPLATES[reel.template];
    reel.data = Object.fromEntries(tpl.fields.map(([k, , ex]) => [k, ex]));
    if (tpl.list) reel.data.items = [
      { name: "Mango Tango", desc: "Raspberry, mango", price: "$10" },
      { name: "Hibiscus Lemonade", desc: "Hibiscus, lemon, agave", price: "$10" },
      { name: "Pina Colada", desc: "Pineapple, coconut creme", price: "$11" },
    ];
    reel.data.end = tpl.end;
    setPhoto(null);
  };

  /* ---------- layout ---------- */
  const form = h("div", { class: "mm-edit" });
  // The preview draws at half size (4× fewer pixels) so typing stays smooth; the video is full size.
  const PREVIEW = 0.5;
  const canvas = h("canvas", { width: W * PREVIEW, height: H * PREVIEW, class: "rm-canvas" });
  const g = canvas.getContext("2d");
  const playBtn = h("button", { class: "btn small", type: "button", onclick: () => { start = performance.now(); playing = true; } }, "↺ Play again");
  const makeBtn = h("button", { class: "btn primary", type: "button", onclick: makeVideo }, "🎬 Make video");
  const status = h("div", { class: "muted small" });
  const result = h("div", { class: "rm-result" });
  const tool = h("div", { class: "mm-tool", "data-pane": "edit" }, form,
    h("div", { class: "mm-preview" }, h("div", { class: "rm-stage" }, canvas), h("div", { class: "sq-actions" }, playBtn, makeBtn), status, result));
  const mobileTabs = h("div", { class: "mm-mobile-tabs" }, seg([{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }], "edit",
    (v) => { tool.dataset.pane = v; }, { small: true }));
  add(el, h("div", { class: "pane-head" }, h("p", { class: "muted" }, "Make a short vertical video for Reels or Stories. Add your music in Instagram after uploading."), mobileTabs), tool);

  /* ---------- the form ---------- */
  const pullBox = h("div");
  function build() {
    const tpl = TEMPLATES[reel.template];
    add(clear(form),
      h("div", { class: "card form" },
        field("Template", h("div", { class: "rm-templates" }, Object.entries(TEMPLATES).map(([k, t]) => h("button", { type: "button", class: `rm-tpl${k === reel.template ? " on" : ""}`,
          onclick: () => { if (k === reel.template) return; reel.template = k; fillDefaults(); build(); restart(); } }, h("span", { class: "rm-tpl-icon" }, t.icon), t.name)))),
        field("Background", h("div", { class: "rm-looks" }, Object.entries(LOOKS).map(([k, l]) => h("button", { type: "button", class: `rm-look${k === reel.look ? " on" : ""}`,
          onclick: (e) => { reel.look = k; e.currentTarget.parentElement.querySelectorAll(".rm-look").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); restart(); } },
          h("span", { class: "rm-swatch", style: { background: l.swatch } }), l.name)))),
        field("Length", seg(LENGTHS.map((s) => ({ value: s, label: `${s} sec` })), reel.seconds, (v) => { reel.seconds = v; restart(); }))),
      pullBox,
      h("div", { class: "card form" },
        tpl.fields.map(([k, label]) => field(label, input(k, k === "desc" ? "textarea" : "text"))),
        tpl.photo ? field(tpl.photo, photoPicker()) : null,
        tpl.list ? listEditor(tpl.list) : null,
        field("Last screen says", input("end", "text"), "Shows over the logo at the very end.")));
    paintPulls();
  }
  function input(k, kind) {
    const attrs = { class: kind === "textarea" ? "input textarea" : "input", maxlength: k === "desc" ? "140" : "60",
      oninput: (e) => { reel.data[k] = e.target.value; } };
    return kind === "textarea" ? h("textarea", { ...attrs, rows: "2" }, reel.data[k] || "") : h("input", { ...attrs, value: reel.data[k] || "" });
  }
  function listEditor(spec) {
    const box = h("div", { class: "mm-edit" });
    const paint = () => {
      clear(box);
      reel.data.items.forEach((it, i) => add(box, h("div", { class: "mm-item-row" },
        h("div", { class: "mm-item-top" },
          h("input", { class: "input", value: it.name || "", maxlength: "30", placeholder: "Drink", oninput: (e) => { it.name = e.target.value; } }),
          h("input", { class: "input mm-price", value: it.price || "", maxlength: "8", placeholder: "$ Price", oninput: (e) => { it.price = e.target.value; } }),
          h("button", { class: "icon-btn small", type: "button", "aria-label": "Remove", onclick: () => { reel.data.items.splice(i, 1); paint(); } }, "✕")),
        h("input", { class: "input", value: it.desc || "", maxlength: "50", placeholder: "Short description (optional)", oninput: (e) => { it.desc = e.target.value; } }))));
      if (reel.data.items.length < spec.max) add(box, h("button", { class: "btn small", type: "button", onclick: () => { reel.data.items.push({ name: "", desc: "", price: "" }); paint(); } }, "+ Add a drink"));
    };
    paint();
    return field(spec.label, box);
  }
  function photoPicker() {
    const wrap = h("div", { class: "tv-photo" });
    const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      setPhoto(URL.createObjectURL(f), "upload"); paintPhoto();
    } });
    const paintPhoto = () => add(clear(wrap),
      photoUrl ? h("img", { class: "tv-thumb", src: photoUrl, alt: "" }) : h("div", { class: "tv-thumb empty" }, "🖼️"),
      h("div", { class: "tv-photo-btns" }, h("button", { class: "btn small", type: "button", onclick: () => fileIn.click() }, photoUrl ? "Change" : "📷 Add photo"),
        photoUrl ? h("button", { class: "btn small ghost", type: "button", onclick: () => { setPhoto(null); paintPhoto(); } }, "Remove") : null), fileIn);
    paintPhoto();
    return wrap;
  }
  function setPhoto(src, from = "") {
    if (photoUrl.startsWith("blob:") && photoSource === "upload") URL.revokeObjectURL(photoUrl);
    photoUrl = src || ""; photoSource = from; assets.photo = null;
    if (src) loadImg(src).then((img) => { if (photoUrl === src) assets.photo = shrink(img); });
  }

  /* ---------- pull from TV Screens ---------- */
  function paintPulls() {
    clear(pullBox);
    if (!tv) return;
    const t = reel.template;
    const pickRow = (label, options, onPick) => options.length ? add(pullBox, h("div", { class: "card form" }, field(label,
      h("select", { class: "input", onchange: (e) => { const o = options[Number(e.target.value)]; if (o) { onPick(o); build(); restart(); } } },
        h("option", { value: "" }, "Choose…"), options.map((o, i) => h("option", { value: i }, o.label)))))) : null;
    if (t === "event") {
      const occ = occurrences(withDefaults("events", tv.events).items, businessDate(), 30);
      const seen = new Set();
      const opts = occ.filter((o) => (seen.has(o.ev.id) ? false : seen.add(o.ev.id))).slice(0, 15).map((o) => ({
        label: `${o.ev.title} · ${o.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`, o }));
      pickRow("Fill from an upcoming event", opts, ({ o }) => {
        const ev = o.ev, isToday = o.key === keyOf(businessDate());
        reel.data.title = ev.title;
        reel.data.when = `${o.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${ev.time ? ` · ${ev.time}` : ""}`;
        reel.data.kicker = isToday ? "Tonight" : `This ${o.date.toLocaleDateString([], { weekday: "long" })}`;
        const theme = ev.themes ? Object.values(ev.themes)[0] : "";
        reel.data.desc = (ev.details || (theme ? `This month's theme: ${theme}` : "") || "").replace(/\*\*/g, "");
        if (ev.image && sameSite(ev.image)) setPhoto(ev.image, "hub");
      });
    } else if (t === "specials") {
      const sp = withDefaults("specials", tv.specials).items || [];
      if (sp.length) add(pullBox, h("div", { class: "card" }, h("button", { class: "btn small", type: "button", onclick: () => {
        reel.data.items = sp.slice(0, 5).map((x) => ({ name: x.name, desc: (x.desc || "").replace(/\*\*/g, ""), price: "" }));
        build(); restart();
      } }, `Fill from TV specials (${Math.min(5, sp.length)})`), h("p", { class: "muted small", style: { marginTop: "8px" } }, "Then add the prices.")));
    } else if (t === "staff") {
      const roster = withDefaults("crew", tv.crew).roster || [];
      const today = crewFor(tv.crew);
      pickRow("Fill from Who's Working", roster.map((p) => ({ label: `${p.name}${today.opener?.id === p.id || today.closer?.id === p.id ? " (working today)" : ""}`, p })), ({ p }) => {
        reel.data.title = p.name;
        if (p.photo && sameSite(p.photo)) setPhoto(p.photo, "hub");
      });
    } else if (t === "drink") {
      const items = [...(withDefaults("signature", tv.signature).items || []).map((x) => ({ label: `${x.drink} (${x.staff || "signature"})`, name: x.drink, desc: x.desc, image: x.image })),
        ...(withDefaults("specials", tv.specials).items || []).map((x) => ({ label: `${x.name} (special)`, name: x.name, desc: x.desc, image: x.image }))];
      pickRow("Fill from TV specials / signature drinks", items, (x) => {
        reel.data.title = x.name; reel.data.desc = (x.desc || "").replace(/\*\*/g, "");
        if (x.image && sameSite(x.image)) setPhoto(x.image, "hub");
      });
    }
  }

  /* ---------- preview loop ---------- */
  // ~30 fps is plenty for a preview. Skips drawing while the preview is hidden (phone Edit tab,
  // another browser tab) or while the video is being made.
  let start = performance.now(), playing = true, raf = 0, busy = false, last = 0, quietUntil = 0;
  // While someone is typing, hold the preview still so every keystroke gets the whole CPU;
  // it catches up a moment after they pause.
  form.addEventListener("input", () => { quietUntil = performance.now() + 300; });
  const restart = () => { start = performance.now(); playing = true; };
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (busy || document.hidden || now - last < 32 || now < quietUntil || !canvas.offsetParent) return;
    last = now;
    let t = (now - start) / 1000;
    if (t > reel.seconds + 0.8) { start = now; t = 0; } // loop with a short pause on the end card
    g.setTransform(PREVIEW, 0, 0, PREVIEW, 0, 0);
    drawFrame(g, Math.min(t, reel.seconds), reel, assets, PREVIEW);
  }

  /* ---------- export ---------- */
  async function makeVideo() {
    if (busy) return;
    if (assets.photo == null && photoUrl) await new Promise((r) => setTimeout(r, 300));
    await document.fonts?.ready;
    busy = true; makeBtn.disabled = true; playBtn.disabled = true; clear(result);
    const progress = (p) => { status.textContent = `Making the video… ${Math.round(p * 100)}% (keep this screen open)`; };
    let blob = null;
    try {
      blob = await encodeWebCodecs(reel, assets, progress).catch((e) => { console.warn(e); return null; });
      if (!blob) blob = await encodeWasm(reel, assets, progress);
    } catch (e) {
      console.error(e);
      status.textContent = `Couldn't make the video: ${e.message || e}`;
    }
    busy = false; makeBtn.disabled = false; playBtn.disabled = false; restart();
    if (blob) showResult(blob);
  }
  function showResult(blob) {
    const name = `kava-${reel.template}-${(reel.data.title || "reel").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.mp4`;
    const file = new File([blob], name, { type: blob.type });
    const url = URL.createObjectURL(blob);
    status.textContent = `Done · ${(blob.size / 1e6).toFixed(1)} MB · MP4 (H.264, ready for Instagram)`;
    const canShare = navigator.canShare?.({ files: [file] });
    add(result,
      h("video", { class: "rm-video", src: url, controls: true, playsinline: true, muted: true, loop: true }),
      h("div", { class: "sq-actions" },
        canShare ? h("button", { class: "btn primary", type: "button", onclick: async () => {
          try { await navigator.share({ files: [file], title: reel.data.title || "Kava & Co." }); } catch (e) { if (e.name !== "AbortError") ctx.toast(e.message, "err"); }
        } }, "📤 Share (Instagram, Photos…)") : null,
        h("a", { class: "btn", href: url, download: name }, "⬇ Download")));
    ctx.log("Made a reel", `${TEMPLATES[reel.template].name}: ${reel.data.title || ""}`);
  }

  fillDefaults(); build(); raf = requestAnimationFrame(loop);
  const stopTv = ctx.api.watchTv((d) => { tv = d || {}; paintPulls(); });
  return () => { cancelAnimationFrame(raf); stopTv(); if (photoSource === "upload" && photoUrl) URL.revokeObjectURL(photoUrl); };
}
