// Draws a menu as a printable page in the Kava & Co. express-menu style
// (cream page, pale lime band, navy boxes, pink item names, orange price badges).
// Everything is sized in em off the page's font size, so fitIt() can shrink a long
// menu until it fits on one page.
import { h } from "../../js/ui.js";

export const PAPERS = {
  letter: { label: "Full page (8.5 × 11)", w: 8.5, h: 11, base: 13 },
  half: { label: "Half page, 2 per sheet (5.5 × 8.5)", w: 5.5, h: 8.5, base: 9.5 },
};
// The official Mandarin wordmark (same file the TV board uses).
export const LOGO = "/board/assets/mandarin-logo.png";
export const DEFAULT_ADDRESS = "11018 Old Saint Augustine Rd · Mandarin";
export const DEFAULT_TAGLINE = "Jacksonville's First Kava Bar";
export const THEMES = { dark: "Dark (brand look)", light: "Light (uses less ink)" };
// Menus saved before the tagline changed.
const tagOf = (t) => (t == null || /^coffee\s*&\s*cocktails$/i.test(String(t).trim()) ? DEFAULT_TAGLINE : t);

const money = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : s;
};
const badge = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s.replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return s;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
};

export function renderMenu(menu) {
  const m = menu || {};
  const paper = PAPERS[m.paper] ? m.paper : "letter";
  const sections = (m.sections || []).filter((s) => s.title || (s.items || []).some((i) => i.name));
  const tag = tagOf(m.tagline);
  return h("div", { class: `mm-page mm-${paper}${m.theme === "light" ? " mm-light" : ""}` },
    h("div", { class: "mm-frame" },
      m.address ?? DEFAULT_ADDRESS ? h("div", { class: "mm-addr" }, m.address ?? DEFAULT_ADDRESS) : null,
      h("div", { class: "mm-head" },
        h("img", { class: "mm-logo", src: LOGO, alt: "Kava & Co. Mandarin" }),
        tag ? h("div", { class: "mm-tag" }, tag) : null),
      m.event ? h("div", { class: "mm-event" }, m.event) : null,
      sections.map(section),
      m.footer ? h("div", { class: "mm-foot" }, m.footer) : null,
      h("div", { class: "mm-zero" }, "Good vibes · Zero proof")));
}

function section(s) {
  const items = (s.items || []).filter((i) => i.name);
  if (s.type === "sized") {
    const sizes = (s.sizes || []).filter(Boolean);
    const cols = `minmax(0, 1fr) repeat(${sizes.length || 1}, 4.1em)`;
    return h("section", { class: "mm-sec" },
      h("div", { class: "mm-sec-title" }, s.title),
      s.subtitle ? h("div", { class: "mm-sub" }, s.subtitle) : null,
      h("div", { class: "mm-sized-head", style: { gridTemplateColumns: cols } },
        h("span", { class: "mm-note" }, s.note || ""),
        sizes.map((z, i) => h("span", { class: `mm-size${i === 0 ? " first" : ""}` }, z))),
      items.map((it) => h("div", { class: "mm-row mm-sized", style: { gridTemplateColumns: cols } },
        h("div", { class: "mm-item" }, h("div", { class: "mm-name" }, it.name, it.featured ? h("span", { class: "mm-feat" }, "★ Try it") : null),
          it.desc ? h("div", { class: "mm-desc" }, it.desc) : null),
        sizes.map((_, i) => h("span", { class: `mm-p${i === 0 ? " first" : ""}` }, money(it.prices?.[i]))))));
  }
  return h("section", { class: "mm-sec" },
    h("div", { class: "mm-sec-title" }, s.title),
    s.subtitle ? h("div", { class: "mm-sub" }, s.subtitle) : null,
    items.map((it) => h("div", { class: "mm-row mm-list" },
      h("div", { class: "mm-item" }, h("div", { class: "mm-name" }, it.name, it.featured ? h("span", { class: "mm-feat" }, "★ Try it") : null),
        it.desc ? h("div", { class: "mm-desc" }, it.desc) : null),
      it.price ? h("span", { class: "mm-badge" }, badge(it.price)) : null)));
}

// Sizes the text so the whole menu fits on one page.
// Short menus grow a little (up to 30%) so the page doesn't look empty.
export function fitIt(page, paper) {
  const base = (PAPERS[paper] || PAPERS.letter).base;
  const frame = page.querySelector(".mm-frame");
  const cs = getComputedStyle(page);
  const avail = page.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const fits = () => frame.scrollHeight <= avail + 1;
  let fs = base;
  page.style.fontSize = `${fs}pt`;
  let guard = 80;
  if (fits()) {
    while (fs < base * 1.3 && guard--) { page.style.fontSize = `${fs + 0.25}pt`; if (!fits()) break; fs += 0.25; }
    page.style.fontSize = `${fs}pt`;
  }
  while (!fits() && fs > 6 && guard--) {
    fs -= 0.25;
    page.style.fontSize = `${fs}pt`;
  }
  page.dataset.shrunk = fs < base ? "1" : "";
  return fs;
}
