// Draws one frame of a reel onto a 1080×1920 canvas at time t (seconds).
// Layout first, animation second: every block (small line, photo, name, pill, description) is
// measured at its final size and stacked top-to-bottom inside a safe area, so nothing can overlap.
// Animation only fades/slides blocks into their spot. The photo takes whatever height is left.
export const W = 1080, H = 1920;
export const DISPLAY = "'Bungee Menu', 'Bungee', sans-serif";
export const BODY = "'DM Sans', 'Segoe UI', sans-serif";
const B = { ink: "#071417", panel: "#123035", navy: "#0C2A30", cream: "#FFF3E0", dim: "#DFE9DC", neon: "#34E209", lime: "#C0FF5B", teal: "#45DBE0", orange: "#F36F03", orange2: "#FF8A2A" };

// Content lives between TOP and BOTTOM. Instagram covers the very bottom with its caption and
// buttons, so the address line sits at FOOT, above that.
// Canvas shadows ignore scaling, so a preview drawn at half size passes scale 0.5 and every
// blur/offset is scaled to match (which also makes the preview much cheaper to draw).
let PX = 1;
const TOP = 500, BOTTOM = 1540, FOOT = 1630, GAP = 34;

/* ---------- looks (from the brand kit) ---------- */
export const LOOKS = {
  cream: {
    name: "Cream", swatch: "#FFF3E0",
    bg: ["#FFF8EC", "#FFEBD2", "#FFD9B0"], rays: ["rgba(243,111,3,.10)", "rgba(52,226,9,.06)"],
    title: B.navy, titleShadow: B.orange, kicker: "#D45A00", body: "#24414A", tag: "#D45A00",
    ring: B.orange, ringGlow: "rgba(243,111,3,.35)", photoBg: "#FCE7CF",
    row: "#FFFFFF", rowLine: B.navy, rowName: B.navy, rowDesc: "#4A6168",
    foot: "#24414A", foot2: "#D45A00", pill: B.orange, pillText: B.ink, pill2: B.navy, pill2Text: B.cream,
    end: "#FFF3E0", endTitle: B.navy, endText: "#24414A", endHandle: "#D45A00",
  },
  sunset: {
    name: "Sunset", swatch: "#F36F03",
    bg: ["#FFB066", "#FF8A2A", "#E65C00"], rays: ["rgba(255,243,224,.16)", "rgba(255,207,58,.12)"],
    title: B.cream, titleStroke: B.ink, titleShadow: B.ink, kicker: B.ink, body: B.ink, tag: B.ink,
    ring: B.cream, ringGlow: "rgba(255,243,224,.5)", photoBg: "#FFD3A6",
    row: B.cream, rowLine: B.ink, rowName: B.navy, rowDesc: "#4A3A2C",
    foot: B.ink, foot2: B.navy, pill: B.ink, pillText: B.cream, pill2: B.cream, pill2Text: B.ink, badge: B.lime,
    end: "#F36F03", endTitle: B.cream, endText: B.ink, endHandle: B.ink,
  },
  lagoon: {
    name: "Lagoon", swatch: "#45DBE0",
    bg: ["#9FF0F2", "#45DBE0", "#1BA8AE"], rays: ["rgba(255,243,224,.18)", "rgba(192,255,91,.12)"],
    title: B.cream, titleStroke: B.ink, titleShadow: B.ink, kicker: B.ink, body: B.ink, tag: B.navy,
    ring: B.cream, ringGlow: "rgba(255,243,224,.5)", photoBg: "#BDF5F6",
    row: B.cream, rowLine: B.ink, rowName: B.navy, rowDesc: "#2C4A4F",
    foot: B.ink, foot2: B.navy, pill: B.orange, pillText: B.ink, pill2: B.ink, pill2Text: B.cream,
    end: "#45DBE0", endTitle: B.cream, endText: B.ink, endHandle: B.ink,
  },
  lime: {
    name: "Lime", swatch: "#8EEA3A",
    bg: ["#E6FFB8", "#B8F75A", "#5CCB2A"], rays: ["rgba(255,243,224,.22)", "rgba(69,219,224,.10)"],
    title: B.cream, titleStroke: B.ink, titleShadow: B.ink, kicker: B.ink, body: B.ink, tag: B.navy,
    ring: B.cream, ringGlow: "rgba(255,243,224,.55)", photoBg: "#E9FFC8",
    row: B.cream, rowLine: B.ink, rowName: B.navy, rowDesc: "#2F4A2A",
    foot: B.ink, foot2: B.navy, pill: B.orange, pillText: B.ink, pill2: B.ink, pill2Text: B.lime,
    end: "#B8F75A", endTitle: B.cream, endText: B.ink, endHandle: B.ink,
  },
  night: {
    name: "Night", swatch: "#071417",
    bg: ["#1A2C33", "#0C2A30", "#071417"], rays: ["rgba(243,111,3,.07)", "rgba(192,255,91,.045)"],
    title: B.neon, titleGlow: "rgba(52,226,9,.7)", kicker: B.lime, body: B.cream, tag: B.orange2,
    ring: B.teal, ringGlow: "rgba(69,219,224,.6)", photoBg: B.panel,
    row: "rgba(18,48,53,.95)", rowLine: B.teal, rowName: B.cream, rowDesc: B.dim,
    foot: B.dim, foot2: B.teal, pill: B.orange, pillText: B.ink, pill2: B.teal, pill2Text: B.ink,
    end: "#071417", endTitle: B.neon, endText: B.cream, endHandle: B.orange2,
  },
};

/* ---------- easing & timing ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const prog = (t, at, dur = 0.6) => clamp((t - at) / dur);

/* ---------- text measuring ---------- */
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Wraps text to fit maxW in at most maxLines, shrinking the font if needed. Returns lines + size.
// Results are cached: the same text is laid out 30 times a second, and measuring is the slow part.
const fitCache = new Map();
function fit(g, str, font, size, maxW, maxLines, min = Math.round(size * 0.5)) {
  const key = `${str}\u0001${font}\u0001${size}\u0001${maxW}\u0001${maxLines}\u0001${min}`;
  const hit = fitCache.get(key);
  if (hit) return hit;
  const out = fitUncached(g, str, font, size, maxW, maxLines, min);
  if (fitCache.size > 400) fitCache.clear();
  // Don't keep results measured before the brand font finished loading.
  if (document.fonts?.check?.(`20px ${DISPLAY}`) !== false) fitCache.set(key, out);
  return out;
}
function fitUncached(g, str, font, size, maxW, maxLines, min) {
  let s = size, lines = [];
  const words = String(str || "").split(/\s+/).filter(Boolean);
  for (; s >= min; s -= 2) {
    g.font = font.replace("{s}", s);
    lines = []; let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW)) break;
  }
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\W*\S*$/, "")}…`; }
  return { lines, size: s, font: font.replace("{s}", s) };
}
// A text block measured up front: { h, draw(y) }.
function textBlock(g, str, { font, size, maxW = W - 180, maxLines = 2, lineH = 1.1, upper = false, color, glow, stroke, shadow, align = "center", x = W / 2, min }) {
  const s = upper ? String(str || "").toUpperCase() : String(str || "");
  if (!s.trim()) return null;
  const f = fit(g, s, font, size, maxW, maxLines, min);
  const lh = f.size * lineH;
  return {
    h: f.lines.length * lh,
    draw(y) {
      g.font = f.font; g.textAlign = align; g.textBaseline = "alphabetic";
      f.lines.forEach((l, i) => {
        const yy = y + f.size * 0.88 + i * lh;
        if (shadow) { g.fillStyle = shadow; g.fillText(l, x + f.size * 0.06, yy + f.size * 0.06); }
        if (stroke) { g.lineWidth = Math.max(6, f.size * 0.09); g.strokeStyle = stroke; g.lineJoin = "round"; g.strokeText(l, x, yy); }
        g.save(); if (glow) { g.shadowColor = glow; g.shadowBlur = (f.size * 0.45) * PX; }
        g.fillStyle = color; g.fillText(l, x, yy); g.restore();
      });
    },
  };
}
function pillBlock(g, label, { size = 44, bg, fg }) {
  if (!String(label || "").trim()) return null;
  const f = fit(g, label, `{s}px ${DISPLAY}`, size, W - 260, 1);
  g.font = f.font;
  const w = g.measureText(label).width + f.size * 1.6, hgt = f.size * 1.75;
  return {
    h: hgt,
    draw(y) {
      roundRect(g, (W - w) / 2, y, w, hgt, hgt / 2); g.fillStyle = bg; g.fill();
      g.font = f.font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = fg; g.fillText(label, W / 2, y + hgt / 2 + 3);
    },
  };
}

/* ---------- pieces ---------- */
function cover(g, img, x, y, w, h, zoom = 1) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih) * zoom, dw = iw * k, dh = ih * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function photo(g, L, img, x, y, w, h, t, circle) {
  g.save();
  g.shadowColor = L.ringGlow; g.shadowBlur = (50) * PX;
  if (circle) { g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 + 12, 0, Math.PI * 2); } else roundRect(g, x - 12, y - 12, w + 24, h + 24, 56);
  g.fillStyle = L.ring; g.fill(); g.shadowBlur = 0;
  if (circle) { g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); } else roundRect(g, x, y, w, h, 46);
  g.fillStyle = L.photoBg; g.fill(); g.clip();
  if (img) cover(g, img, x, y, w, h, 1.03 + Math.min(0.07, t * 0.007));
  else { g.font = `${Math.min(w, h) * 0.3}px ${BODY}`; g.textAlign = "center"; g.textBaseline = "middle"; g.globalAlpha = 0.5; g.fillText("🥥", x + w / 2, y + h / 2); }
  g.restore();
}
function badge(g, L, label, cx, cy, r) {
  g.save(); g.translate(cx, cy); g.rotate(-0.12);
  g.shadowColor = "rgba(0,0,0,.25)"; g.shadowBlur = (24) * PX; g.shadowOffsetY = (8) * PX;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = L.badge || B.orange; g.fill();
  g.shadowColor = "transparent";
  g.setLineDash([14, 10]); g.lineWidth = 6; g.strokeStyle = B.ink; g.beginPath(); g.arc(0, 0, r - 15, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  const f = fit(g, label, `{s}px ${DISPLAY}`, r * 0.6, r * 1.45, 1);
  g.font = f.font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = B.ink; g.fillText(label, 0, 4);
  g.restore();
}
// Fade + slide a block into place starting at `at`.
function enter(g, t, at, fn, { dist = 60, pop = null } = {}) {
  const p = prog(t, at, pop ? 0.55 : 0.6);
  if (!p) return;
  g.save(); g.globalAlpha = easeOut(p);
  // pop = { cx, cy }: grow out of that point with a little bounce
  if (pop) { const s = back(p); g.translate(pop.cx, pop.cy); g.scale(s, s); g.translate(-pop.cx, -pop.cy); } else g.translate(0, (1 - easeOut(p)) * dist);
  fn(); g.restore();
}

function background(g, L, t) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, L.bg[0]); grd.addColorStop(0.5, L.bg[1]); grd.addColorStop(1, L.bg[2]);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, 430); g.rotate(t * 0.06);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-95, -2300); g.lineTo(95, -2300); g.closePath();
    g.fillStyle = L.rays[i % 2]; g.fill();
  }
  g.restore();
}
function header(g, L, t, a) {
  const p = easeOut(prog(t, 0.05, 0.7));
  g.save(); g.globalAlpha = p; g.translate(0, (1 - p) * -50);
  if (a.logo) { const w = 760, h = w * (a.logo.naturalHeight / a.logo.naturalWidth); g.drawImage(a.logo, (W - w) / 2, 130, w, h); }
  const tag = textBlock(g, "Jacksonville's First Kava Bar", { font: `{s}px ${DISPLAY}`, size: 38, maxLines: 1, upper: true, color: L.tag });
  tag?.draw(370);
  g.restore();
}
function footer(g, L, t) {
  const p = easeOut(prog(t, 0.4, 0.8));
  g.save(); g.globalAlpha = p;
  textBlock(g, "11018 Old Saint Augustine Rd · Mandarin", { font: `700 {s}px ${BODY}`, size: 32, maxLines: 1, upper: true, color: L.foot })?.draw(FOOT);
  g.restore();
}
function manny(g, t, a, D) {
  if (!a.manny) return;
  const k = easeOut(prog(t, D - 3.6, 0.5)) * (1 - easeOut(prog(t, D - 1.9, 0.5)));
  if (!k) return;
  const h = 480, w = h * (a.manny.naturalWidth / a.manny.naturalHeight);
  g.save(); g.translate(W - w * 0.6 * k + 40, H - 600); g.rotate(-0.35 + 0.08 * Math.sin(t * 5)); g.drawImage(a.manny, 0, 0, w, h); g.restore();
}
function endCard(g, L, t, a, D, line) {
  const p = easeOut(prog(t, D - 1.6, 0.6));
  if (!p) return;
  g.save(); g.globalAlpha = p;
  g.fillStyle = L.end; g.fillRect(0, 0, W, H);
  background(g, L, t); g.globalAlpha = p;
  if (a.logo) { const w = 880, h = w * (a.logo.naturalHeight / a.logo.naturalWidth); g.drawImage(a.logo, (W - w) / 2, 620 - (1 - p) * 40, w, h); }
  const title = textBlock(g, line || "Pull up tonight", { font: `{s}px ${DISPLAY}`, size: 86, maxLines: 2, upper: true, color: L.endTitle, glow: L.titleGlow, stroke: L.titleStroke, shadow: L.titleShadow });
  let y = 1000; title?.draw(y); y += (title?.h || 0) + 40;
  textBlock(g, "11018 Old Saint Augustine Rd · Mandarin", { font: `700 {s}px ${BODY}`, size: 38, maxLines: 2, upper: true, color: L.endText })?.draw(y);
  textBlock(g, "@kavaandco.mandarin", { font: `{s}px ${DISPLAY}`, size: 46, maxLines: 1, color: L.endHandle })?.draw(y + 90);
  g.restore();
}


/* ---------- photo card for the kavatender reel ---------- */
// Draws the photo inside a shape (with a colored rim) inside the box x,y,w,h.
function shaped(g, L, t, img, pathFn, box) {
  g.save();
  pathFn(); g.shadowColor = L.ringGlow; g.shadowBlur = (50) * PX;
  g.lineWidth = 26; g.lineJoin = "round"; g.strokeStyle = L.ring; g.stroke(); g.shadowBlur = 0;
  pathFn(); g.fillStyle = L.photoBg; g.fill(); g.clip();
  const [x, y, w, h] = box;
  if (img) cover(g, img, x, y, w, h, 1.04 + Math.min(0.07, t * 0.007));
  else { g.font = `${Math.min(w, h) * 0.3}px ${BODY}`; g.textAlign = "center"; g.textBaseline = "middle"; g.globalAlpha = 0.5; g.fillText("🥥", x + w / 2, y + h / 2); }
  g.restore();
}
const SHAPES = {
  // A photo card, slightly turned, with two colored cards fanned out behind it.
  tilt(g, L, t, img, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, sway = Math.sin(t * 0.9) * 0.008;
    const card = (rot, color, dx) => { g.save(); g.translate(cx + dx, cy); g.rotate(rot); roundRect(g, -w / 2, -h / 2, w, h, 40); g.fillStyle = color; g.fill(); g.restore(); };
    card(0.07, L === LOOKS.lagoon ? B.lime : B.teal, 26); card(-0.09, L === LOOKS.sunset ? B.lime : B.orange, -22);
    g.save(); g.translate(cx, cy); g.rotate(-0.03 + sway); g.translate(-cx, -cy);
    shaped(g, { ...L, ring: B.cream }, t, img, () => roundRect(g, x, y, w, h, 40), [x, y, w, h]);
    g.restore();
  },
};
// The name on a tilted color band that runs across the bottom of the photo, past its edges.
function ribbon(g, L, t, name, cy) {
  const label = String(name || "").toUpperCase().trim();
  if (!label) return;
  const band = L === LOOKS.sunset ? B.ink : B.orange;
  g.save(); g.translate(W / 2, cy); g.rotate(-0.07 + Math.sin(t * 1.1) * 0.006);
  g.shadowColor = "rgba(0,0,0,.28)"; g.shadowBlur = (30) * PX; g.shadowOffsetY = (10) * PX;
  const bh = 170;
  g.beginPath(); g.moveTo(-W * 0.62, -bh / 2); g.lineTo(W * 0.62, -bh / 2 - 6); g.lineTo(W * 0.6, bh / 2); g.lineTo(-W * 0.6, bh / 2 + 6); g.closePath();
  g.fillStyle = band; g.fill(); g.shadowColor = "transparent";
  const f = fit(g, label, `{s}px ${DISPLAY}`, 132, W - 160, 1, 40);
  g.font = f.font; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = Math.max(6, f.size * 0.09); g.lineJoin = "round"; g.strokeStyle = B.ink; g.strokeText(label, 0, 6);
  g.fillStyle = B.ink; g.fillText(label, f.size * 0.06, 6 + f.size * 0.06);
  g.fillStyle = B.cream; g.fillText(label, 0, 6);
  g.restore();
}

/* ---------- stacked layout for the photo templates ---------- */
// blocks: [{ key, block | photo: { aspect, circle }, at }]. Measures all text, gives the photo the
// rest of the room (within limits), and centers the whole stack in the safe area.
function stack(g, L, t, a, items, d) {
  const measured = items.filter((x) => x.photo || x.block);
  const textH = measured.filter((x) => x.block).reduce((s, x) => s + x.block.h, 0);
  const gaps = GAP * (measured.length - 1);
  const ph = measured.find((x) => x.photo);
  let photoH = 0, photoW = 0;
  if (ph) {
    const room = BOTTOM - TOP - textH - gaps;
    photoH = clamp(room, 300, ph.photo.circle ? 560 : 700);
    photoW = ph.photo.circle ? photoH : Math.min(W - 220, photoH * ph.photo.aspect);
  }
  const total = textH + gaps + photoH;
  let y = TOP + Math.max(0, (BOTTOM - TOP - total) / 2);
  for (const x of measured) {
    const yy = y;
    if (x.photo) {
      const px = (W - photoW) / 2;
      enter(g, t, x.at, () => photo(g, L, a.photo, px, yy, photoW, photoH, t, x.photo.circle), { dist: 80 });
      if (d.price && !x.photo.circle) { const bx = px + photoW - 96, by = yy + photoH - 96; enter(g, t, x.at + 1.6, () => badge(g, L, d.price, bx, by, 100), { pop: { cx: bx, cy: by } }); }
      y += photoH + GAP;
    } else {
      enter(g, t, x.at, () => x.block.draw(yy), { pop: x.pop ? { cx: W / 2, cy: yy + x.block.h / 2 } : null });
      y += x.block.h + GAP;
    }
  }
}

/* ---------- templates ---------- */
const titleStyle = (L, size, lines = 2) => ({ font: `{s}px ${DISPLAY}`, size, maxLines: lines, upper: true, color: L.title, glow: L.titleGlow, stroke: L.titleStroke, shadow: L.titleShadow });
const kickerStyle = (L) => ({ font: `{s}px ${DISPLAY}`, size: 42, maxLines: 1, upper: true, color: L.kicker });
const bodyStyle = (L, lines = 2) => ({ font: `500 {s}px ${BODY}`, size: 42, maxLines: lines, lineH: 1.25, color: L.body, maxW: W - 220 });

export const TEMPLATES = {
  drink: {
    name: "Drink spotlight", icon: "🥥",
    fields: [["kicker", "Small line on top", "Try it tonight"], ["title", "Drink name", "Mango Tango"], ["desc", "Description", "Raspberry, mango and your choice of kava or kratom."], ["price", "Price (optional)", "$10"]],
    photo: "Drink photo", end: "Come try it",
    draw(g, L, t, d, a) {
      stack(g, L, t, a, [
        { block: textBlock(g, d.kicker, kickerStyle(L)), at: 0.5 },
        { photo: { aspect: 0.95 }, at: 0.7 },
        { block: textBlock(g, d.title, titleStyle(L, 92)), at: 1.3 },
        { block: textBlock(g, d.desc, bodyStyle(L)), at: 1.8 },
      ], d);
    },
  },
  event: {
    name: "Event promo", icon: "🎉",
    // Starts empty (the examples only show as hints) so no made-up event can end up in a real post.
    // Fill it in, or pick an event from TV Screens.
    blank: true,
    fields: [["kicker", "Small line on top", "This Friday"], ["title", "Event", "Event name"], ["when", "Date & time", "Fri · 8 PM"], ["desc", "Details", "What's happening"]],
    photo: "Flyer or photo", end: "See you there",
    draw(g, L, t, d, a) {
      stack(g, L, t, a, [
        { block: textBlock(g, d.kicker, kickerStyle(L)), at: 0.5 },
        { photo: { aspect: 1 }, at: 0.7 },
        { block: textBlock(g, d.title, titleStyle(L, 88)), at: 1.3 },
        { block: pillBlock(g, d.when, { size: 42, bg: L.pill, fg: L.pillText }), at: 1.9, pop: true },
        { block: textBlock(g, d.desc, bodyStyle(L)), at: 2.4 },
      ], { ...d, price: "" });
    },
  },
  specials: {
    name: "Tonight's specials", icon: "📋",
    fields: [["kicker", "Small line on top", "Happy hour 9–10 PM"], ["title", "Title", "Tonight's Specials"]],
    list: { label: "Drinks", max: 5, addLabel: "+ Add a drink",
      top: [["name", "Drink", 30], ["price", "$ Price", 8, "mm-price"]], below: ["desc", "Short description (optional)", 50],
      sample: [{ name: "Mango Tango", desc: "Raspberry, mango", price: "$10" }, { name: "Hibiscus Lemonade", desc: "Hibiscus, lemon, agave", price: "$10" }, { name: "Pina Colada", desc: "Pineapple, coconut creme", price: "$11" }] },
    photo: null, end: "Pull up tonight",
    draw(g, L, t, d) {
      const kicker = textBlock(g, d.kicker, kickerStyle(L));
      const title = textBlock(g, d.title, titleStyle(L, 90));
      const items = (d.items || []).filter((i) => i.name).slice(0, 5);
      let y = TOP;
      if (kicker) { enter(g, t, 0.5, () => kicker.draw(TOP)); y += kicker.h + GAP; }
      if (title) { const yy = y; enter(g, t, 0.8, () => title.draw(yy)); y += title.h + GAP + 6; }
      const rowGap = 22;
      const rowH = items.length ? Math.min(176, (BOTTOM - y - rowGap * (items.length - 1)) / items.length) : 0;
      items.forEach((it, i) => {
        const ry = y + i * (rowH + rowGap), at = 1.4 + i * 0.45;
        const hasDesc = !!it.desc && rowH >= 130;
        const nameB = textBlock(g, it.name, { font: `{s}px ${DISPLAY}`, size: Math.min(54, rowH * 0.36), maxLines: 1, upper: true, color: L.rowName, align: "left", x: 136, maxW: W - 470 });
        const descB = hasDesc ? textBlock(g, it.desc, { font: `500 {s}px ${BODY}`, size: Math.min(34, rowH * 0.22), maxLines: 1, color: L.rowDesc, align: "left", x: 136, maxW: W - 470 }) : null;
        enter(g, t, at, () => {
          roundRect(g, 90, ry, W - 180, rowH, 34); g.fillStyle = L.row; g.fill(); g.lineWidth = 5; g.strokeStyle = L.rowLine; g.stroke();
          const inner = (nameB?.h || 0) + (descB ? descB.h + 6 : 0);
          let ty = ry + (rowH - inner) / 2;
          nameB?.draw(ty); if (descB) descB.draw(ty + nameB.h + 6);
        }, { dist: 0 });
        if (it.price) enter(g, t, at + 0.3, () => badge(g, L, it.price, W - 190, ry + rowH / 2, Math.min(74, rowH / 2 + 4)), { pop: { cx: W - 190, cy: ry + rowH / 2 } });
      });
    },
  },
  week: {
    name: "This week at Mandarin", icon: "📅",
    fields: [["kicker", "Small line on top", ""], ["title", "Title", "This Week at Mandarin"]],
    list: { label: "Days", max: 7, addLabel: "+ Add a day",
      top: [["day", "Day", 12, "rm-day"], ["name", "What's happening", 40, "rm-grow"]], below: ["time", "Time (optional)", 30], photo: true,
      sample: [] }, // filled from TV Screens, never made-up events
    photo: null, end: "See you this week",
    // One row per day: a day block on the left (weekday + date), the event and time beside it.
    draw(g, L, t, d, a) {
      const kicker = textBlock(g, d.kicker, kickerStyle(L));
      const title = textBlock(g, d.title, titleStyle(L, 86));
      const items = (d.items || []).filter((i) => i.name || i.day).slice(0, 7);
      let y = TOP;
      if (kicker) { enter(g, t, 0.5, () => kicker.draw(TOP)); y += kicker.h + GAP; }
      if (title) { const yy = y; enter(g, t, 0.8, () => title.draw(yy)); y += title.h + GAP + 6; }
      const rowGap = 18;
      const rowH = items.length ? Math.min(170, (BOTTOM - y - rowGap * (items.length - 1)) / items.length) : 0;
      const step = items.length > 5 ? 0.3 : 0.4;
      items.forEach((it, i) => {
        const ry = y + i * (rowH + rowGap), at = 1.3 + i * step;
        const [wd, ...rest] = String(it.day || "").trim().split(/\s+/);
        // The event's photo (if it has one) sits at the right end of the row.
        const pic = it.image ? a?.items?.get(it.image) : null;
        const ps = rowH - 20, px = W - 90 - 10 - ps;
        const bw = Math.min(190, rowH * 1.25), bx = 90, tx = bx + bw + 30, maxW = (pic ? px - 20 : W - 90 - 30) - tx;
        const dayB = textBlock(g, wd || "", { font: `{s}px ${DISPLAY}`, size: Math.min(48, rowH * 0.34), maxLines: 1, upper: true, color: L.pillText, x: bx + bw / 2, maxW: bw - 20 });
        const dateB = rest.length ? textBlock(g, rest.join(" "), { font: `700 {s}px ${BODY}`, size: Math.min(30, rowH * 0.2), maxLines: 1, color: L.pillText, x: bx + bw / 2, maxW: bw - 20 }) : null;
        const nameB = textBlock(g, it.name, { font: `{s}px ${DISPLAY}`, size: Math.min(50, rowH * (rowH >= 115 ? 0.27 : 0.32)), maxLines: rowH >= 115 ? 2 : 1, lineH: 1.05, min: 26, upper: true, color: L.rowName, align: "left", x: tx, maxW });
        const timeB = it.time && rowH >= 100 ? textBlock(g, it.time, { font: `700 {s}px ${BODY}`, size: Math.min(32, rowH * 0.21), maxLines: 1, color: L.rowDesc, align: "left", x: tx, maxW }) : null;
        enter(g, t, at, () => {
          roundRect(g, bx, ry, W - 180, rowH, 34); g.fillStyle = L.row; g.fill(); g.lineWidth = 5; g.strokeStyle = L.rowLine; g.stroke();
          roundRect(g, bx + 10, ry + 10, bw - 20, rowH - 20, 26); g.fillStyle = L.pill; g.fill();
          const dh = (dayB?.h || 0) + (dateB ? dateB.h + 4 : 0);
          let dy = ry + (rowH - dh) / 2; dayB?.draw(dy); if (dateB) dateB.draw(dy + (dayB?.h || 0) + 4);
          const th = (nameB?.h || 0) + (timeB ? timeB.h + 8 : 0);
          const ty = ry + (rowH - th) / 2; nameB?.draw(ty); if (timeB) timeB.draw(ty + (nameB?.h || 0) + 8);
          if (pic) { g.save(); roundRect(g, px, ry + 10, ps, ps, 26); g.clip(); cover(g, pic, px, ry + 10, ps, ps); g.restore(); }
        }, { dist: 0 });
      });
      if (!items.length) enter(g, t, 1.2, () => textBlock(g, "Nothing on the calendar yet", bodyStyle(L))?.draw(TOP + 400));
    },
  },
  recap: {
    name: "Monthly recap", icon: "📸",
    fields: [["kicker", "Small line on top", "Community recap"], ["title", "Title", "This Month at Mandarin"]],
    photo: null, end: "Thanks for hanging with us", lengths: [10, 15, 20, 30], seconds: 20,
    // A pile of polaroids: each community photo drops onto the stack in turn, slightly tilted.
    draw(g, L, t, d, a, D = 20) {
      const kicker = textBlock(g, d.kicker, kickerStyle(L));
      const title = textBlock(g, d.title, titleStyle(L, 88));
      let y = TOP - 10;
      if (kicker) { enter(g, t, 0.4, () => kicker.draw(y)); y += kicker.h + 18; }
      if (title) { const yy = y; enter(g, t, 0.6, () => title.draw(yy)); y += title.h + 40; }
      const pics = (d.photos || []).map((k) => a?.items?.get(k)).filter(Boolean);
      if (!pics.length) { enter(g, t, 1, () => textBlock(g, "Pick photos from the community folder", bodyStyle(L))?.draw(y + 300)); return; }
      // Card size: as big as fits between the title and the footer.
      const room = BOTTOM + 40 - y, pad = 30, foot = 120;
      const cardH = Math.min(1000, room), cardW = Math.min(800, (cardH - pad - foot) * 0.92 + pad * 2);
      const cx = W / 2, cy = y + cardH / 2;
      const start = 1.1, end = Math.max(start + 1, D - 1.8), per = (end - start) / pics.length;
      const tilt = (i) => (((i * 37) % 11) - 5) * 0.022;
      const drift = (i) => (((i * 53) % 9) - 4) * 9;
      const shown = pics.map((_, i) => start + i * per).filter((at) => t >= at).length;
      // The last few photos stay visible underneath; the newest drops in on top.
      for (let i = Math.max(0, shown - 4); i < shown; i++) {
        const p = clamp((t - (start + i * per)) / 0.45);
        const s = 1 + (1 - easeOut(p)) * 0.25;
        g.save();
        g.globalAlpha = Math.min(1, p * 2.2);
        g.translate(cx + drift(i), cy + (1 - easeOut(p)) * -60); g.rotate(tilt(i)); g.scale(s, s);
        g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 40 * PX; g.shadowOffsetY = 14 * PX;
        roundRect(g, -cardW / 2, -cardH / 2, cardW, cardH, 14); g.fillStyle = "#FFFDF7"; g.fill();
        g.shadowColor = "transparent";
        const pw = cardW - pad * 2, ph = cardH - pad - foot;
        g.save(); roundRect(g, -cardW / 2 + pad, -cardH / 2 + pad, pw, ph, 6); g.clip();
        cover(g, pics[i], -cardW / 2 + pad, -cardH / 2 + pad, pw, ph, 1.02 + Math.min(0.05, Math.max(0, t - (start + i * per)) * 0.02));
        g.restore();
        // A strip of orange tape on top, and the handle on the polaroid's chin.
        g.fillStyle = "rgba(243,111,3,.55)"; g.save(); g.translate(0, -cardH / 2 + 4); g.rotate(-0.06); g.fillRect(-90, -22, 180, 44); g.restore();
        g.font = `700 38px ${BODY}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = B.navy;
        g.fillText("@kavaandco.mandarin", 0, cardH / 2 - foot / 2);
        g.restore();
      }
    },
  },
  staff: {
    name: "Meet your kavatender", icon: "🧑‍🍳",
    fields: [["kicker", "Small line on top", "Meet your kavatender"], ["title", "Name", "Your Name"], ["desc", "Fun fact / favorite drink", "Ask me about my favorite drink!"]],
    photo: "Today's photo (snap a fresh one!)", end: "Come say hi",
    // The photo is the star: a tilted photo card (with two colored cards fanned behind it) and the name on a tilted ribbon across its
    // bottom edge. The fun fact sits under it; leave it blank and the photo grows.
    draw(g, L, t, d, a) {
      const desc = textBlock(g, d.desc, { font: `500 {s}px ${BODY}`, size: 36, maxLines: 2, lineH: 1.2, color: L.body, maxW: W - 200 });
      const kick = pillBlock(g, d.kicker, { size: 42, bg: L.pill, fg: L.pillText });
      const under = desc ? desc.h + 18 : 0;
      const x = 90, y = 480, w = W - 180, h = 1590 - y - under - 120;
      const ribbonY = y + h - 30;

      enter(g, t, 0.6, () => SHAPES.tilt(g, L, t, a.photo, x, y, w, h), { dist: 80 });
      if (kick) enter(g, t, 0.95, () => { g.save(); g.translate(W / 2, y); g.rotate(0.05); g.translate(-W / 2, -y); kick.draw(y - kick.h / 2 - 6); g.restore(); }, { pop: { cx: W / 2, cy: y } });
      enter(g, t, 1.3, () => ribbon(g, L, t, d.title, ribbonY), { pop: { cx: W / 2, cy: ribbonY } });
      const ty = ribbonY + 120;
      if (desc) { const yy = ty; enter(g, t, 1.9, () => desc.draw(yy), { dist: 30 }); }
    },
  },
};

// One whole frame.
export function drawFrame(g, t, reel, assets, scale = 1) {
  PX = scale;
  const tpl = TEMPLATES[reel.template] || TEMPLATES.drink;
  const L = LOOKS[reel.look] || LOOKS.cream;
  const D = reel.seconds || 10;
  g.save();
  background(g, L, t);
  header(g, L, t, assets);
  tpl.draw(g, L, t, reel.data || {}, assets, D);
  footer(g, L, t);
  manny(g, t, assets, D);
  endCard(g, L, t, assets, D, reel.data?.end || tpl.end);
  const fin = 1 - prog(t, 0, 0.35);
  if (fin > 0) { g.fillStyle = `rgba(255,243,224,${fin})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
