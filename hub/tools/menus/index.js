// Menu Maker: build an express menu (event nights, drinks to push), see it in our branding,
// and print it ready to laminate.
//   #/tool/menus              saved menus
//   #/tool/menus/new/<tpl>    start a new one (tpl: express | blank)
//   #/tool/menus/edit/<id>    edit
// Use = make, edit and print menus, delete your own · Manage = also delete anyone's.
import { h, clear, confirm, field, seg, timeAgo } from "../../js/ui.js";
import { renderMenu, fitIt, PAPERS, THEMES, DEFAULT_ADDRESS, DEFAULT_TAGLINE, LOGO } from "./render.js";

const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
const uid = () => Math.random().toString(36).slice(2, 9);
const MAX_SECTIONS = 8, MAX_ITEMS = 14;

export const TEMPLATES = {
  express: {
    label: "Express menu", blurb: "Lattes by size + signature cocktails, like the one on the bar",
    make: () => ({
      title: "Express menu", event: "", address: DEFAULT_ADDRESS, tagline: DEFAULT_TAGLINE, footer: "", paper: "letter", theme: "dark",
      sections: [
        { id: uid(), type: "sized", title: "Lattes", subtitle: "", note: "12oz = hot only", sizes: ["12oz", "16oz", "20oz", "24oz"], items: [
          { id: uid(), name: "Latte", desc: "", prices: ["4.50", "5.00", "5.50", "6.00"] },
          { id: uid(), name: "Chai Latte", desc: "Our blend of chai spices.", prices: ["4.50", "5.00", "5.50", "6.00"] },
          { id: uid(), name: "Matcha Latte", desc: "Basically delicious caffeinated grass milk. Lightly sweet.", prices: ["4.50", "5.00", "5.50", "6.00"] },
        ] },
        { id: uid(), type: "list", title: "Signature Cocktails", subtitle: "Made with your choice of Kava, Kratom, Kanna, Delta or CBD.", items: [
          { id: uid(), name: "Mango Tango", desc: "Raspberry, Mango.", price: "10" },
          { id: uid(), name: "Hibiscus Lemonade", desc: "Hibiscus, Lemon, Agave.", price: "10" },
          { id: uid(), name: "Pina Colada", desc: "Pineapple, Coconut Creme.", price: "11" },
        ] },
      ],
    }),
  },
  blank: {
    label: "Blank menu", blurb: "One drinks section to start from",
    make: () => ({ title: "", event: "", address: DEFAULT_ADDRESS, tagline: DEFAULT_TAGLINE, footer: "", paper: "letter", theme: "dark",
      sections: [{ id: uid(), type: "list", title: "Tonight's Drinks", subtitle: "", items: [{ id: uid(), name: "", desc: "", price: "" }] }] }),
  },
};

export function mount(el, ctx) {
  document.fonts?.load?.("16px 'Bungee Menu'").catch(() => {}); // so Print can go straight to the dialog
  new Image().src = LOGO;
  const [view, arg] = ctx.sub;
  let menus = null, failed = false;
  let paint = () => {};
  if (view === "edit" && arg) paint = editor(el, ctx, () => menus, () => failed, arg, null);
  else if (view === "new") paint = editor(el, ctx, () => menus, () => failed, null, (TEMPLATES[arg] || TEMPLATES.express).make());
  else paint = list(el, ctx, () => menus, () => failed);
  paint();
  const stop = ctx.api.watchMenus((l, err) => { if (err) failed = true; menus = l || []; paint(); });
  return () => stop();
}

/* =========================== saved menus =========================== */
function list(el, ctx, getMenus, getFailed) {
  const body = h("div");
  add(el, h("div", { class: "pane-head" }, h("p", { class: "muted" }, "Make a quick menu for event nights or drinks you want to push. It comes out in our branding, ready to print and laminate."),
    h("div", { class: "sq-actions" }, Object.entries(TEMPLATES).map(([k, t]) => h("button", { class: `btn${k === "express" ? " primary" : ""}`, type: "button", title: t.blurb,
      onclick: () => ctx.navigate(`${ctx.base}/new/${k}`) }, `+ ${t.label}`)))), body);
  return () => {
    const menus = getMenus();
    clear(body);
    if (getFailed()) { add(body, h("p", { class: "modal-err" }, "Couldn't load menus. The database rules may need updating.")); return; }
    if (!menus) { add(body, h("p", { class: "loading" }, "Loading…")); return; }
    if (!menus.length) { add(body, h("div", { class: "card empty-card" }, h("p", {}, "No menus yet. Start with the Express menu above."))); return; }
    const me = ctx.session();
    const grid = h("div", { class: "mm-list-grid" });
    for (const m of menus) {
      const thumb = h("div", { class: "mm-thumb" });
      const page = renderMenu(m);
      const k = 184 / (PAPERS[m.paper]?.h || 11) / 96;
      add(thumb, h("div", { class: "mm-thumb-in", style: { transform: `translateX(-50%) scale(${k})` } }, page));
      const canDelete = ctx.level >= 2 || m.createdUid === me?.uid;
      add(grid, h("div", { class: "card mm-card" },
        h("button", { type: "button", class: "mm-card-open", onclick: () => ctx.navigate(`${ctx.base}/edit/${m.id}`), style: { all: "unset", cursor: "pointer", display: "grid", gap: "8px" } },
          thumb, h("span", { class: "mm-card-title" }, m.title || "Untitled menu"),
          h("span", { class: "muted small" }, [m.event, `Updated ${timeAgo(m.updatedAt)}${m.updatedBy ? ` by ${m.updatedBy}` : ""}`].filter(Boolean).join(" · "))),
        h("div", { class: "sq-actions" },
          h("button", { class: "btn small primary", type: "button", onclick: () => printMenu(m) }, "🖨 Print"),
          h("button", { class: "btn small ghost", type: "button", onclick: async () => {
            try {
              const copy = JSON.parse(JSON.stringify({ ...m, title: `${m.title || "Menu"} (copy)` }));
              const id = await ctx.api.saveMenu(ctx.session(), null, clean(copy));
              ctx.toast("Copied"); ctx.navigate(`${ctx.base}/edit/${id}`);
            } catch (e) { ctx.toast(e.message || "Couldn't copy.", "err"); }
          } }, "Copy"),
          canDelete ? h("button", { class: "btn small ghost", type: "button", onclick: async () => {
            if (!(await confirm(`Delete “${m.title || "this menu"}”?`, "It's removed for everyone.", "Delete"))) return;
            try { await ctx.api.deleteMenu(m.id); ctx.log("Deleted menu", m.title || ""); ctx.toast("Deleted"); } catch (e) { ctx.toast(e.message, "err"); }
          } }, "Delete") : null)));
    }
    add(body, grid);
    // Thumbnails: shrink text the same way the printed page will.
    const fitAll = () => grid.querySelectorAll(".mm-page").forEach((p, i) => fitIt(p, menus[i]?.paper));
    requestAnimationFrame(fitAll);
    document.fonts?.load?.("16px 'Bungee Menu'").then(fitAll).catch(() => {});
  };
}

/* =========================== editor =========================== */
function editor(el, ctx, getMenus, getFailed, id, fresh) {
  let draft = fresh, loaded = !!fresh, dirty = !!fresh, savedId = id;
  const form = h("div", { class: "mm-edit" });
  const previewBox = h("div", { class: "mm-preview-box" });
  const fitNote = h("div", { class: "muted small" });
  const tool = h("div", { class: "mm-tool", "data-pane": "edit" },
    form, h("div", { class: "mm-preview" }, previewBox, fitNote));
  const saveBtn = h("button", { class: "btn primary", type: "button", onclick: save }, "Save");
  const status = h("span", { class: "muted small" });
  const mobileTabs = h("div", { class: "mm-mobile-tabs" }, seg([{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }], "edit",
    (v) => { tool.dataset.pane = v; if (v === "preview") refresh(); }, { small: true }));
  add(el, h("div", { class: "pane-head" },
    h("button", { class: "btn ghost small", type: "button", onclick: leave }, "← All menus"), mobileTabs), tool,
  h("div", { class: "mm-bar" }, status, h("span", { class: "spacer" }),
    h("button", { class: "btn", type: "button", onclick: () => printMenu(draft) }, "🖨 Print"), saveBtn));

  const touch = () => { dirty = true; status.textContent = "Unsaved changes"; refresh(); };
  let previewTimer;
  function refresh() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (!draft) return;
      const page = renderMenu(draft);
      const paper = PAPERS[draft.paper] || PAPERS.letter;
      const wrap = h("div", { class: "mm-scale" }, page);
      clear(previewBox).append(wrap);
      const k = Math.min(1, (previewBox.clientWidth - 28) / (paper.w * 96));
      wrap.style.transform = `scale(${k})`;
      previewBox.style.height = `${paper.h * 96 * k + 28}px`;
      const fs = fitIt(page, draft.paper);
      fitNote.textContent = fs < paper.base ? `Text shrunk a little to fit on one page.${fs < paper.base * 0.7 ? " That's a lot of menu — consider a second section page or fewer items." : ""}` : "";
      fitNote.className = fs < paper.base * 0.7 ? "mm-shrunk" : "muted small";
    }, 120);
  }
  addEventListener("resize", refresh);
  // Redraw once the menu font has loaded so the fit is measured with the real letters.
  document.fonts?.load?.("16px 'Bungee Menu'").then(() => refresh()).catch(() => {});

  function leave() {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    removeEventListener("resize", refresh);
    ctx.navigate(ctx.base);
  }
  async function save() {
    const t = (draft.title || "").trim() || draft.event?.trim() || "Untitled menu";
    draft.title = t;
    saveBtn.disabled = true; status.textContent = "Saving…";
    try {
      const newId = await ctx.api.saveMenu(ctx.session(), savedId, clean(draft));
      ctx.log(savedId ? "Edited menu" : "Made menu", t);
      dirty = false; status.textContent = "Saved"; ctx.toast("Menu saved");
      if (!savedId) { savedId = newId; history.replaceState(null, "", `${ctx.base}/edit/${newId}`); }
    } catch (e) { status.textContent = ""; ctx.toast(e.message || "Couldn't save.", "err"); }
    saveBtn.disabled = false;
  }

  /* ---- the form ---- */
  const txt = (obj, key, attrs = {}) => h("input", { class: "input", value: obj[key] ?? "", ...attrs, oninput: (e) => { obj[key] = e.target.value; touch(); } });
  const sectionsBox = h("div", { class: "mm-edit" });
  function build() {
    add(clear(form),
      h("div", { class: "card form" },
        field("Menu name (for finding it later)", txt(draft, "title", { maxlength: "80", placeholder: "e.g. Halloween trivia express menu" })),
        field("Event banner (optional)", txt(draft, "event", { maxlength: "60", placeholder: "e.g. Trivia Night Specials" }), "Shows as a pink banner under the logo."),
        field("Paper", seg(Object.entries(PAPERS).map(([k, p]) => ({ value: k, label: p.label })), draft.paper || "letter", (v) => { draft.paper = v; touch(); })),
        field("Look", seg(Object.entries(THEMES).map(([k, l]) => ({ value: k, label: l })), draft.theme === "light" ? "light" : "dark", (v) => { draft.theme = v; touch(); })),
        h("details", {}, h("summary", { class: "muted", style: { cursor: "pointer" } }, "Header & footer text"),
          h("div", { class: "form", style: { marginTop: "10px" } },
            field("Top line", txt(draft, "address", { maxlength: "120" })),
            field("Under the logo", txt(draft, "tagline", { maxlength: "60" })),
            field("Bottom line (optional)", txt(draft, "footer", { maxlength: "160", placeholder: "e.g. Ask us about the full menu!" }))))),
      sectionsBox,
      h("div", { class: "mm-add-row" },
        h("button", { class: "btn", type: "button", onclick: () => addSection("list") }, "+ Section with one price"),
        h("button", { class: "btn", type: "button", onclick: () => addSection("sized") }, "+ Section with sizes")));
    paintSections();
    refresh();
  }
  function addSection(type) {
    if (draft.sections.length >= MAX_SECTIONS) { ctx.toast(`Up to ${MAX_SECTIONS} sections.`, "err"); return; }
    draft.sections.push(type === "sized"
      ? { id: uid(), type, title: "", subtitle: "", note: "", sizes: ["12oz", "16oz", "20oz"], items: [{ id: uid(), name: "", desc: "", prices: [] }] }
      : { id: uid(), type, title: "", subtitle: "", items: [{ id: uid(), name: "", desc: "", price: "" }] });
    touch(); paintSections();
    sectionsBox.lastElementChild?.querySelector("input")?.focus();
  }
  function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; arr.splice(j, 0, arr.splice(i, 1)[0]); touch(); paintSections(); }

  function paintSections() {
    clear(sectionsBox);
    draft.sections.forEach((s, si) => {
      const items = h("div", { class: "mm-edit" });
      const paintItems = () => {
        clear(items);
        s.items.forEach((it, ii) => {
          const priceBits = s.type === "sized"
            ? h("div", { class: "mm-prices" }, (s.sizes || []).map((z, zi) => h("label", {}, z || "?", h("input", { class: "input", inputmode: "decimal", value: it.prices?.[zi] ?? "", placeholder: "0.00",
              oninput: (e) => { it.prices = it.prices || []; it.prices[zi] = e.target.value; touch(); } }))))
            : h("input", { class: "input mm-price", inputmode: "decimal", value: it.price ?? "", placeholder: "$ Price", "aria-label": "Price", oninput: (e) => { it.price = e.target.value; touch(); } });
          add(items, h("div", { class: "mm-item-row" },
            h("div", { class: "mm-item-top" },
              txt(it, "name", { maxlength: "40", placeholder: "Drink name" }),
              s.type === "list" ? priceBits : null,
              h("button", { class: "icon-btn small", type: "button", "aria-label": "Move up", disabled: ii === 0, onclick: () => { move(s.items, ii, -1); } }, "↑"),
              h("button", { class: "icon-btn small", type: "button", "aria-label": "Move down", disabled: ii === s.items.length - 1, onclick: () => { move(s.items, ii, 1); } }, "↓"),
              h("button", { class: "icon-btn small", type: "button", "aria-label": "Remove drink", onclick: () => { s.items.splice(ii, 1); touch(); paintItems(); } }, "✕")),
            txt(it, "desc", { maxlength: "120", placeholder: "Description (optional), e.g. Raspberry, Mango." }),
            s.type === "sized" ? priceBits : null,
            h("label", { class: "mm-feat-toggle" }, h("input", { type: "checkbox", checked: !!it.featured, onchange: (e) => { it.featured = e.target.checked; touch(); } }), "★ Highlight this one")));
        });
        if (s.items.length < MAX_ITEMS) add(items, h("button", { class: "btn small", type: "button", onclick: () => {
          s.items.push(s.type === "sized" ? { id: uid(), name: "", desc: "", prices: [] } : { id: uid(), name: "", desc: "", price: "" });
          touch(); paintItems(); [...items.querySelectorAll(".mm-item-row")].pop()?.querySelector("input")?.focus();
        } }, "+ Add a drink"));
      };
      paintItems();
      const sizesIn = s.type === "sized" ? h("input", { class: "input", value: (s.sizes || []).join(", "), placeholder: "12oz, 16oz, 20oz, 24oz",
        onchange: (e) => { s.sizes = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5); touch(); paintItems(); } }) : null;
      add(sectionsBox, h("div", { class: "card mm-sec-card" },
        h("div", { class: "mm-sec-card-head" },
          txt(s, "title", { maxlength: "40", placeholder: s.type === "sized" ? "Section title, e.g. Lattes" : "Section title, e.g. Signature Cocktails" }),
          h("span", { class: "chip mm-type" }, s.type === "sized" ? "Sizes" : "One price"),
          h("button", { class: "icon-btn small", type: "button", "aria-label": "Move section up", disabled: si === 0, onclick: () => move(draft.sections, si, -1) }, "↑"),
          h("button", { class: "icon-btn small", type: "button", "aria-label": "Move section down", disabled: si === draft.sections.length - 1, onclick: () => move(draft.sections, si, 1) }, "↓"),
          h("button", { class: "icon-btn small", type: "button", "aria-label": "Remove section", onclick: async () => {
            if (!(await confirm("Remove this section?", `“${s.title || "Untitled"}” and its drinks come off the menu.`, "Remove"))) return;
            draft.sections.splice(si, 1); touch(); paintSections();
          } }, "✕")),
        txt(s, "subtitle", { maxlength: "120", placeholder: "Line under the title (optional), e.g. Made with your choice of Kava, Kratom…" }),
        s.type === "sized" ? h("div", { class: "tv-two" }, field("Sizes (comma between)", sizesIn), field("Small note (optional)", txt(s, "note", { maxlength: "40", placeholder: "e.g. 12oz = hot only" }))) : null,
        items));
    });
  }

  return () => {
    if (loaded) { if (!form.firstChild) build(); return; }
    const menus = getMenus();
    if (getFailed()) { add(clear(form), h("p", { class: "modal-err" }, "Couldn't load this menu.")); return; }
    if (!menus) { add(clear(form), h("p", { class: "loading" }, "Loading…")); return; }
    const m = menus.find((x) => x.id === id);
    if (!m) { add(clear(form), h("p", { class: "muted empty" }, "This menu was deleted.")); return; }
    loaded = true;
    draft = JSON.parse(JSON.stringify({ title: m.title, event: m.event, address: m.address, tagline: m.tagline, footer: m.footer, paper: m.paper, theme: m.theme || "dark", sections: m.sections || [] }));
    if (/^coffee\s*&\s*cocktails$/i.test(String(draft.tagline || "").trim())) draft.tagline = DEFAULT_TAGLINE;
    for (const s of draft.sections) { s.id ||= uid(); s.items = s.items || []; }
    status.textContent = "";
    build();
  };
}

// Only what gets saved.
function clean(d) {
  const str = (v, n) => String(v ?? "").trim().slice(0, n);
  return {
    title: str(d.title, 80) || "Untitled menu", event: str(d.event, 80), address: str(d.address, 120), tagline: str(d.tagline, 60), footer: str(d.footer, 160),
    paper: PAPERS[d.paper] ? d.paper : "letter", theme: d.theme === "light" ? "light" : "dark",
    sections: (d.sections || []).slice(0, MAX_SECTIONS).map((s) => ({
      id: str(s.id, 12) || uid(), type: s.type === "sized" ? "sized" : "list", title: str(s.title, 40), subtitle: str(s.subtitle, 120),
      ...(s.type === "sized" ? { note: str(s.note, 40), sizes: (s.sizes || []).map((z) => str(z, 10)).filter(Boolean).slice(0, 5) } : {}),
      items: (s.items || []).filter((i) => str(i.name, 40)).slice(0, MAX_ITEMS).map((i) => ({
        id: str(i.id, 12) || uid(), name: str(i.name, 40), desc: str(i.desc, 120), featured: !!i.featured,
        ...(s.type === "sized" ? { prices: (s.sizes || []).map((_, zi) => str(i.prices?.[zi], 10)) } : { price: str(i.price, 10) }),
      })),
    })),
  };
}

/* =========================== printing =========================== */
// Builds the sheet(s) at real size off-screen, fits the text, then opens the print dialog.
// Half-page menus print two to a landscape sheet with a light cut line.
export function printMenu(menu) {
  if (!menu) return;
  document.getElementById("mm-print")?.remove();
  document.getElementById("mm-page-style")?.remove();
  const half = menu.paper === "half";
  const host = h("div", { id: "mm-print" });
  const sheet = h("div", { class: `mm-sheet${half ? " half" : ""}` }, renderMenu(menu), half ? renderMenu(menu) : null);
  host.append(sheet);
  document.body.append(host);
  // Lay it out off-screen, wait for the menu font, size the text, then hand over to print.
  Object.assign(host.style, { display: "block", position: "absolute", left: "-20000px", top: "0" });
  const style = h("style", { id: "mm-page-style" }, `@page { size: letter ${half ? "landscape" : "portrait"}; margin: 0; }`);
  document.head.append(style);
  const done = () => {
    document.documentElement.classList.remove("mm-printing");
    host.remove(); style.remove();
    removeEventListener("afterprint", done);
  };
  const go = () => {
    host.querySelectorAll(".mm-page").forEach((p) => fitIt(p, menu.paper));
    Object.assign(host.style, { display: "", position: "", left: "", top: "" });
    document.documentElement.classList.add("mm-printing");
    addEventListener("afterprint", done);
    window.print();
  };
  // Print straight from the tap when the font is already loaded (iPads only allow printing from a tap).
  if (!document.fonts || document.fonts.check("16px 'Bungee Menu'")) go();
  else document.fonts.load("16px 'Bungee Menu'").catch(() => {}).then(go);
}
