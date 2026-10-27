// Draws one frame of a reel onto a 1080×1920 canvas at time t (seconds).
// Same look as the menus and TV board: ink ground, orange/lime sunburst, the Mandarin wordmark,
// Bungee headlines (neon green), orange badges, cream copy. Everything is drawn from scratch each
// frame, so the preview and the exported video are identical.
export const W = 1080, H = 1920;
// Instagram puts its buttons and caption over the bottom of a reel, so everything that matters
// stays above FOOT (and the address line sits just above that area).
const FOOT = 1610;
export const DISPLAY = "'Bungee Menu', 'Bungee', sans-serif";
export const BODY = "'DM Sans', 'Segoe UI', sans-serif";
const C = { ink: "#071417", panel: "#123035", navy: "#0C2A30", cream: "#FFF3E0", dim: "#DFE9DC", neon: "#34E209", lime: "#C0FF5B", teal: "#45DBE0", orange: "#F36F03", orange2: "#FF8A2A" };

/* ---------- easing & timing ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
// 0→1 progress of something that starts at `at` and takes `dur` seconds.
const prog = (t, at, dur = 0.6) => clamp((t - at) / dur);

/* ---------- drawing helpers ---------- */
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Word-wraps text into lines that fit maxW; shrinks the font (down to min) to fit maxLines.
function fitLines(g, text, font, size, maxW, maxLines, min = size * 0.55) {
  let s = size, lines = [];
  for (; s >= min; s -= 4) {
    g.font = font.replace("{s}", s);
    lines = []; let line = "";
    for (const word of String(text || "").split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW)) break;
  }
  return { lines, size: s };
}
function text(g, str, x, y, { font, size, color, align = "center", glow, stroke, lineH = 1.08, maxW = W - 160, maxLines = 3, upper } = {}) {
  const s = upper ? String(str || "").toUpperCase() : String(str || "");
  const f = fitLines(g, s, font, size, maxW, maxLines);
  g.font = font.replace("{s}", f.size); g.textAlign = align; g.textBaseline = "alphabetic";
  const lh = f.size * lineH;
  f.lines.forEach((l, i) => {
    const yy = y + i * lh;
    if (stroke) { g.lineWidth = stroke.w; g.strokeStyle = stroke.c; g.lineJoin = "round"; g.strokeText(l, x, yy); }
    g.save();
    if (glow) { g.shadowColor = glow; g.shadowBlur = f.size * 0.45; }
    g.fillStyle = color; g.fillText(l, x, yy);
    g.restore();
  });
  return f.lines.length * lh;
}
// Draws an image to cover a box (like CSS object-fit: cover), with a slow zoom.
function cover(g, img, x, y, w, h, zoom = 1) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * k, dh = ih * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function photoFrame(g, img, x, y, w, h, t, at, { r = 48, circle = false } = {}) {
  const p = easeOut(prog(t, at, 0.7));
  if (!p) return;
  g.save();
  g.globalAlpha = p;
  const sc = 0.9 + 0.1 * p;
  g.translate(x + w / 2, y + h / 2 + (1 - p) * 60); g.scale(sc, sc); g.translate(-(x + w / 2), -(y + h / 2));
  // glow ring
  g.shadowColor = "rgba(69, 219, 224, .6)"; g.shadowBlur = 60;
  if (circle) { g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 + 14, 0, Math.PI * 2); } else roundRect(g, x - 14, y - 14, w + 28, h + 28, r + 12);
  g.fillStyle = C.teal; g.fill(); g.shadowBlur = 0;
  if (circle) { g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); } else roundRect(g, x, y, w, h, r);
  g.fillStyle = C.navy; g.fill(); g.clip();
  if (img) cover(g, img, x, y, w, h, 1.04 + Math.min(0.08, (t - at) * 0.008));
  else { g.fillStyle = C.panel; g.fillRect(x, y, w, h); g.font = `120px ${BODY}`; g.textAlign = "center"; g.fillStyle = "rgba(255,243,224,.35)"; g.fillText("🥥", x + w / 2, y + h / 2 + 40); }
  g.restore();
}
function badge(g, label, cx, cy, r, t, at) {
  const p = prog(t, at, 0.55);
  if (!p) return;
  const s = back(p) * (1 + 0.03 * Math.sin((t - at) * 4));
  g.save(); g.translate(cx, cy); g.rotate(-0.12); g.scale(s, s);
  g.shadowColor = "rgba(243, 111, 3, .7)"; g.shadowBlur = 50;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = C.orange; g.fill(); g.shadowBlur = 0;
  g.setLineDash([14, 10]); g.lineWidth = 6; g.strokeStyle = C.ink; g.beginPath(); g.arc(0, 0, r - 16, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  const f = fitLines(g, label, `{s}px ${DISPLAY}`, r * 0.62, r * 1.5, 1);
  g.font = `${f.size}px ${DISPLAY}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = C.ink; g.fillText(label, 0, 4);
  g.restore();
}
function pill(g, label, cx, cy, t, at, { bg = C.orange, fg = C.ink, size = 46 } = {}) {
  const p = prog(t, at, 0.5);
  if (!p) return;
  g.save(); g.globalAlpha = p; g.translate(cx, cy); g.scale(0.85 + 0.15 * back(p), 0.85 + 0.15 * back(p));
  g.font = `${size}px ${DISPLAY}`;
  const w = Math.min(W - 120, g.measureText(label).width + size * 1.6), h = size * 1.7;
  g.shadowColor = bg; g.shadowBlur = 40; roundRect(g, -w / 2, -h / 2, w, h, h / 2); g.fillStyle = bg; g.fill(); g.shadowBlur = 0;
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  const f = fitLines(g, label, `{s}px ${DISPLAY}`, size, w - size, 1); g.font = `${f.size}px ${DISPLAY}`; g.fillText(label, 0, 3);
  g.restore();
}
const slideUp = (g, t, at, fn, dist = 70) => {
  const p = easeOut(prog(t, at, 0.6));
  if (!p) return 0;
  g.save(); g.globalAlpha = p; g.translate(0, (1 - p) * dist); const r = fn(); g.restore(); return r;
};

/* ---------- background, header, footer, Manny ---------- */
function background(g, t) {
  const grd = g.createRadialGradient(W / 2, 520, 50, W / 2, 900, 1500);
  grd.addColorStop(0, "#14402a"); grd.addColorStop(0.45, C.navy); grd.addColorStop(1, C.ink);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // slowly turning sunburst
  g.save(); g.translate(W / 2, 470); g.rotate(t * 0.06);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-90, -2200); g.lineTo(90, -2200); g.closePath();
    g.fillStyle = i % 2 ? "rgba(243, 111, 3, .07)" : "rgba(192, 255, 91, .045)"; g.fill();
  }
  g.restore();
  // soft vignette
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function header(g, t, a) {
  const p = easeOut(prog(t, 0.05, 0.7));
  g.save(); g.globalAlpha = p; g.translate(0, (1 - p) * -50);
  if (a.logo) { const w = 800, h = w * (a.logo.naturalHeight / a.logo.naturalWidth); g.drawImage(a.logo, (W - w) / 2, 120, w, h); }
  text(g, "Jacksonville's First Kava Bar", W / 2, 420, { font: `{s}px ${DISPLAY}`, size: 40, color: C.orange2, glow: "rgba(243,111,3,.7)", upper: true, maxLines: 1 });
  g.restore();
}
function footer(g, t) {
  const p = easeOut(prog(t, 0.4, 0.8));
  g.save(); g.globalAlpha = p * 0.9;
  text(g, "11018 Old Saint Augustine Rd · Mandarin", W / 2, FOOT, { font: `700 {s}px ${BODY}`, size: 32, color: C.dim, upper: true, maxLines: 1 });
  text(g, "Good vibes · Zero proof", W / 2, FOOT + 50, { font: `700 {s}px ${BODY}`, size: 26, color: C.teal, upper: true, maxLines: 1 });
  g.restore();
}
function manny(g, t, a, D) {
  if (!a.manny) return;
  const at = D - 3.6, p = prog(t, at, 0.5), out = prog(t, D - 1.9, 0.5);
  const k = easeOut(p) * (1 - easeOut(out));
  if (!k) return;
  const h = 520, w = h * (a.manny.naturalWidth / a.manny.naturalHeight);
  g.save(); g.translate(W - w * 0.62 * k + 40, H - 520); g.rotate(-0.35 + 0.08 * Math.sin(t * 5));
  g.drawImage(a.manny, 0, 0, w, h); g.restore();
}
function endCard(g, t, a, D, line) {
  const p = easeOut(prog(t, D - 1.6, 0.6));
  if (!p) return;
  g.save(); g.globalAlpha = p;
  g.fillStyle = "rgba(7, 20, 23, .97)"; g.fillRect(0, 0, W, H);
  if (a.logo) { const w = 900, h = w * (a.logo.naturalHeight / a.logo.naturalWidth); g.drawImage(a.logo, (W - w) / 2, 640 - (1 - p) * 40, w, h); }
  text(g, line || "Pull up tonight", W / 2, 1080, { font: `{s}px ${DISPLAY}`, size: 84, color: C.neon, glow: "rgba(52,226,9,.7)", upper: true, maxLines: 2 });
  text(g, "11018 Old Saint Augustine Rd · Mandarin", W / 2, 1260, { font: `700 {s}px ${BODY}`, size: 38, color: C.cream, upper: true, maxLines: 2 });
  text(g, "@kavaandco.mandarin", W / 2, 1360, { font: `{s}px ${DISPLAY}`, size: 44, color: C.orange2, maxLines: 1 });
  g.restore();
}

/* ---------- templates ---------- */
export const TEMPLATES = {
  drink: {
    name: "Drink spotlight", icon: "🥥",
    fields: [["kicker", "Small line on top", "Try it tonight"], ["title", "Drink name", "Mango Tango"], ["desc", "Description", "Raspberry, mango and your choice of kava or kratom."], ["price", "Price (optional)", "$10"]],
    photo: "Drink photo", end: "Come try it",
    draw(g, t, d, a) {
      slideUp(g, t, 0.5, () => text(g, d.kicker, W / 2, 520, { font: `{s}px ${DISPLAY}`, size: 44, color: C.lime, upper: true, glow: "rgba(192,255,91,.6)", maxLines: 1 }));
      photoFrame(g, a.photo, 250, 575, 580, 600, t, 0.7);
      if (d.price) badge(g, d.price, 810, 1120, 110, t, 2.3);
      const th = slideUp(g, t, 1.3, () => text(g, d.title, W / 2, 1300, { font: `{s}px ${DISPLAY}`, size: 96, color: C.neon, glow: "rgba(52,226,9,.75)", upper: true, maxLines: 2 })) || 100;
      slideUp(g, t, 1.8, () => text(g, d.desc, W / 2, 1300 + th + 10, { font: `500 {s}px ${BODY}`, size: 42, color: C.cream, maxLines: 2, lineH: 1.25 }));
    },
  },
  event: {
    name: "Event promo", icon: "🎉",
    fields: [["kicker", "Small line on top", "This Friday"], ["title", "Event", "Crimson Masquerade"], ["when", "Date & time", "Fri, Oct 30 · 8 PM"], ["desc", "Details", "Victorian gothic vampire masquerade. Costumes encouraged!"]],
    photo: "Flyer or photo", end: "See you there",
    draw(g, t, d, a) {
      slideUp(g, t, 0.5, () => text(g, d.kicker, W / 2, 520, { font: `{s}px ${DISPLAY}`, size: 48, color: C.lime, upper: true, glow: "rgba(192,255,91,.6)", maxLines: 1 }));
      photoFrame(g, a.photo, 270, 570, 540, 540, t, 0.7);
      const th = slideUp(g, t, 1.3, () => text(g, d.title, W / 2, 1230, { font: `{s}px ${DISPLAY}`, size: 92, color: C.neon, glow: "rgba(52,226,9,.75)", upper: true, maxLines: 2 })) || 100;
      const py = 1230 + th + 10;
      if (d.when) pill(g, d.when, W / 2, py, t, 1.9, { size: 42 });
      slideUp(g, t, 2.4, () => text(g, d.desc, W / 2, py + (d.when ? 110 : 30), { font: `500 {s}px ${BODY}`, size: 40, color: C.cream, maxLines: 2, lineH: 1.22 }));
    },
  },
  specials: {
    name: "Tonight's specials", icon: "📋",
    fields: [["kicker", "Small line on top", "Happy hour 9–10 PM"], ["title", "Title", "Tonight's Specials"]],
    list: { label: "Drinks", max: 5, keys: [["name", "Drink"], ["desc", "Description"], ["price", "Price"]] },
    photo: null, end: "Pull up tonight",
    draw(g, t, d) {
      slideUp(g, t, 0.5, () => text(g, d.kicker, W / 2, 540, { font: `{s}px ${DISPLAY}`, size: 44, color: C.lime, upper: true, glow: "rgba(192,255,91,.6)", maxLines: 1 }));
      slideUp(g, t, 0.8, () => text(g, d.title, W / 2, 660, { font: `{s}px ${DISPLAY}`, size: 96, color: C.neon, glow: "rgba(52,226,9,.75)", upper: true, maxLines: 2 }));
      const items = (d.items || []).filter((i) => i.name).slice(0, 5);
      const rowH = Math.min(180, 820 / Math.max(1, items.length));
      items.forEach((it, i) => {
        const at = 1.4 + i * 0.45, p = easeOut(prog(t, at, 0.55));
        if (!p) return;
        const y = 760 + i * rowH;
        g.save(); g.globalAlpha = p; g.translate((1 - p) * -120, 0);
        roundRect(g, 90, y, W - 180, rowH - 30, 36); g.fillStyle = "rgba(18, 48, 53, .92)"; g.fill();
        g.lineWidth = 5; g.strokeStyle = C.teal; g.shadowColor = "rgba(69,219,224,.5)"; g.shadowBlur = 24; g.stroke(); g.shadowBlur = 0;
        const hasDesc = !!it.desc && rowH > 140;
        text(g, it.name, 140, y + (hasDesc ? 72 : rowH / 2 + 8), { font: `{s}px ${DISPLAY}`, size: 54, color: C.cream, align: "left", maxW: W - 480, maxLines: 1, upper: true });
        if (hasDesc) text(g, it.desc, 140, y + 122, { font: `500 {s}px ${BODY}`, size: 34, color: C.dim, align: "left", maxW: W - 480, maxLines: 1 });
        g.restore();
        if (it.price) badge(g, it.price, W - 190, y + (rowH - 30) / 2, Math.min(78, (rowH - 30) / 2 + 6), t, at + 0.3);
      });
    },
  },
  staff: {
    name: "Meet your kavatender", icon: "🧑‍🍳",
    fields: [["kicker", "Small line on top", "Meet your kavatender"], ["title", "Name", "Wheatyn"], ["desc", "Fun fact / favorite drink", "Go-to drink: The Wheatyn Special. Ask about the coconut cream."], ["when", "Shifts (optional)", "Tuesdays & Fridays"]],
    photo: "Their photo", end: "Come say hi",
    draw(g, t, d, a) {
      slideUp(g, t, 0.5, () => text(g, d.kicker, W / 2, 520, { font: `{s}px ${DISPLAY}`, size: 50, color: C.lime, upper: true, glow: "rgba(192,255,91,.6)", maxLines: 1 }));
      photoFrame(g, a.photo, 290, 580, 500, 500, t, 0.7, { circle: true });
      slideUp(g, t, 1.3, () => text(g, d.title, W / 2, 1220, { font: `{s}px ${DISPLAY}`, size: 120, color: C.neon, glow: "rgba(52,226,9,.75)", upper: true, maxLines: 1 }));
      if (d.when) pill(g, d.when, W / 2, 1310, t, 1.8, { size: 40, bg: C.teal });
      slideUp(g, t, 2.3, () => text(g, d.desc, W / 2, d.when ? 1430 : 1340, { font: `500 {s}px ${BODY}`, size: 42, color: C.cream, maxLines: 3, lineH: 1.22 }));
    },
  },
};

// One whole frame.
export function drawFrame(g, t, reel, assets) {
  const tpl = TEMPLATES[reel.template] || TEMPLATES.drink;
  const D = reel.seconds || 10;
  g.save();
  background(g, t);
  header(g, t, assets);
  tpl.draw(g, t, reel.data || {}, assets);
  footer(g, t);
  manny(g, t, assets, D);
  endCard(g, t, assets, D, reel.data?.end || tpl.end);
  // fade in from black at the very start
  const fin = 1 - prog(t, 0, 0.35);
  if (fin > 0) { g.fillStyle = `rgba(7,20,23,${fin})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
