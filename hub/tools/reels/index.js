// Reel Maker: short vertical videos (1080×1920) in the Kava & Co. look for Instagram Reels and Stories.
// Pick a template, fill it in (or pull from TV Screens), watch the preview, then "Make video" records
// it right here and hands it to the share sheet (Instagram, Photos…) or downloads it.
// No music is added: pick a sound inside Instagram after uploading.
import { h, clear, field, seg } from "../../js/ui.js";
import { W, H, TEMPLATES, LOOKS, drawFrame, DISPLAY } from "./draw.js";
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

// Best video format this device can record. Instagram needs MP4.
function pickFormat() {
  const MR = window.MediaRecorder;
  if (!MR) return null;
  const ok = (t) => { try { return MR.isTypeSupported(t); } catch { return false; } };
  // H.264 MP4 is what Instagram wants. Safari's plain "video/mp4" is H.264; Chrome's may not be.
  for (const type of ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.4d002a", "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1"]) if (ok(type)) return { type, ext: "mp4", h264: true };
  if (ok("video/mp4")) return { type: "video/mp4", ext: "mp4", h264: !ok("video/webm") };
  for (const type of ["video/webm;codecs=vp9", "video/webm"]) if (ok(type)) return { type, ext: "webm", h264: false };
  return null;
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
  const canvas = h("canvas", { width: W, height: H, class: "rm-canvas" });
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
    if (src) loadImg(src).then((img) => { if (photoUrl === src) assets.photo = img; });
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
  let start = performance.now(), playing = true, raf = 0, recording = false;
  const restart = () => { start = performance.now(); playing = true; };
  function loop(now) {
    if (!recording) {
      let t = (now - start) / 1000;
      if (t > reel.seconds + 0.8) { start = now; t = 0; } // loop with a short pause on the end card
      drawFrame(g, Math.min(t, reel.seconds), reel, assets);
    }
    raf = requestAnimationFrame(loop);
  }

  /* ---------- export ---------- */
  async function makeVideo() {
    const fmt = pickFormat();
    if (!fmt || !canvas.captureStream) { status.textContent = "This browser can't record video. Try Safari on the iPad or Chrome on a computer."; return; }
    if (assets.photo == null && photoUrl) await new Promise((r) => setTimeout(r, 300));
    makeBtn.disabled = true; playBtn.disabled = true; clear(result);
    recording = true;
    const stream = canvas.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: fmt.type, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    const D = reel.seconds;
    rec.start(250);
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const t = (now - t0) / 1000;
        drawFrame(g, Math.min(t, D), reel, assets);
        status.textContent = `Recording… ${Math.min(100, Math.round((t / D) * 100))}% (it plays through once in real time)`;
        if (t < D + 0.25) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    rec.stop(); await done;
    stream.getTracks().forEach((tr) => tr.stop());
    recording = false; makeBtn.disabled = false; playBtn.disabled = false; restart();
    const blob = new Blob(chunks, { type: fmt.type.split(";")[0] });
    const name = `kava-${reel.template}-${(reel.data.title || "reel").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.${fmt.ext}`;
    const file = new File([blob], name, { type: blob.type });
    const url = URL.createObjectURL(blob);
    status.textContent = `Done · ${(blob.size / 1e6).toFixed(1)} MB · ${fmt.ext.toUpperCase()}`;
    const canShare = navigator.canShare?.({ files: [file] });
    add(result,
      h("video", { class: "rm-video", src: url, controls: true, playsinline: true, muted: true, loop: true }),
      h("div", { class: "sq-actions" },
        canShare ? h("button", { class: "btn primary", type: "button", onclick: async () => {
          try { await navigator.share({ files: [file], title: reel.data.title || "Kava & Co." }); } catch (e) { if (e.name !== "AbortError") ctx.toast(e.message, "err"); }
        } }, "📤 Share (Instagram, Photos…)") : null,
        h("a", { class: "btn", href: url, download: name }, "⬇ Download")),
      !fmt.h264 ? h("p", { class: "modal-err" }, fmt.ext === "mp4"
        ? "This browser recorded the video in a format Instagram may not accept. If the upload fails, make it on the iPad or an iPhone (Safari)."
        : "This browser saved a WEBM video, which Instagram won't take. Make it on the iPad or an iPhone (Safari) to get an MP4.") : null);
    ctx.log("Made a reel", `${TEMPLATES[reel.template].name}: ${reel.data.title || ""}`);
  }

  fillDefaults(); build(); raf = requestAnimationFrame(loop);
  const stopTv = ctx.api.watchTv((d) => { tv = d || {}; paintPulls(); });
  return () => { cancelAnimationFrame(raf); stopTv(); if (photoSource === "upload" && photoUrl) URL.revokeObjectURL(photoUrl); };
}
