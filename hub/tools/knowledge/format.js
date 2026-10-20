// Simple formatting for Knowledge Bank articles. Builds real DOM nodes (never raw HTML),
// so nothing typed into an article can run as code.
//
//   # Heading  /  ## Smaller heading
//   - bullet          1. numbered step
//   **bold**   *italic*   [link text](https://…)   bare https://… links
//   ![caption](picture address)   on its own line = a photo (added with the Add photo button)
//   blank line = new paragraph
import { h } from "../../js/ui.js";

export const FORMAT_HELP = [
  ["📷 Add photo", "a picture (or paste / drag one into the article)"],
  ["## Heading", "a section heading"],
  ["- item", "a bullet point"],
  ["1. step", "a numbered step"],
  ["**bold**", "bold text"],
  ["*italic*", "italic text"],
  ["[text](https://…)", "a link"],
];

// Inline: **bold**, *italic*, [text](url), bare urls.
function inline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h("strong", {}, m[2]));
    else if (m[3]) out.push(h("em", {}, m[4]));
    else if (m[5]) out.push(link(m[7], m[6]));
    else if (m[8]) out.push(link(m[8], m[8]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const link = (href, label) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, label);

// Pictures we'll show: ones uploaded to the hub, https links, and (demo only) in-page pictures.
const okImage = (src) => /^\/\.netlify\/functions\/hub\?media=[a-z0-9.-]+$/.test(src) || /^https:\/\//.test(src) || /^data:image\/(jpeg|png|webp|gif);base64,/.test(src);

export function render(body) {
  const root = h("div", { class: "kb-body" });
  const lines = String(body || "").replace(/\r/g, "").split("\n");
  let para = [], list = null, listType = null;
  const flushPara = () => { if (para.length) { root.append(h("p", {}, inline(para.join(" ")))); para = []; } };
  const flushList = () => { if (list) { root.append(list); list = null; listType = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/)) && okImage(m[2])) {
      flushPara(); flushList();
      const img = h("img", { src: m[2], alt: m[1] || "Photo", loading: "lazy" });
      root.append(h("figure", { class: "kb-photo" },
        m[2].startsWith("data:") ? img : h("a", { href: m[2], target: "_blank", rel: "noopener noreferrer" }, img),
        m[1] ? h("figcaption", {}, m[1]) : null));
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); flushList();
      root.append(h(m[1].length === 1 ? "h2" : "h3", {}, inline(m[2])));
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      if (listType !== "ul") { flushList(); list = h("ul"); listType = "ul"; }
      list.append(h("li", {}, inline(m[1])));
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (listType !== "ol") { flushList(); list = h("ol"); listType = "ol"; }
      list.append(h("li", {}, inline(m[1])));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return root;
}

// Plain-text snippet for the article list.
export function snippet(body, n = 140) {
  const t = String(body || "")
    .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .replace(/^#{1,3}\s+/gm, "").replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}
