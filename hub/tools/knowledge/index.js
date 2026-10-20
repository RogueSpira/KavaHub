// Knowledge Bank: how-to guides, recipes and general knowledge.
// Use = read and search · Manage = write, edit and delete articles.
//   #/tool/knowledge            list
//   #/tool/knowledge/a/<id>     read an article
//   #/tool/knowledge/new        write a new article (Manage)
//   #/tool/knowledge/edit/<id>  edit (Manage)
import { h, clear, confirm, field, timeAgo } from "../../js/ui.js";
import { render, snippet, FORMAT_HELP } from "./format.js";
import { shrinkImage } from "../../js/images.js";

const DEFAULT_CATEGORIES = ["How-To", "Recipes", "Knowledge"];
const MAX_BODY = 20000;

export function mount(el, ctx) {
  const manage = ctx.level >= 2;
  const [view, id] = ctx.sub;
  let articles = null, failed = false, paintView = () => {};
  const stop = ctx.api.watchArticles((list, err) => { if (err) failed = true; articles = list || []; paintView(); });

  if (view === "a" && id) paintView = articleView(el, ctx, id, () => articles, () => failed, manage);
  else if (manage && view === "new") paintView = editorView(el, ctx, null, () => articles);
  else if (manage && view === "edit" && id) paintView = editorView(el, ctx, id, () => articles);
  else paintView = listView(el, ctx, () => articles, () => failed, manage);
  paintView();
  return () => stop();
}

const categoriesOf = (articles) => {
  const set = new Set(DEFAULT_CATEGORIES);
  for (const a of articles || []) if (a.category) set.add(a.category);
  return [...set];
};

/* ---------------- list ---------------- */
function listView(el, ctx, getArticles, getFailed, manage) {
  let query = "", cat = "All";
  const search = h("input", { class: "input kb-search", type: "search", placeholder: "Search guides, recipes, anything…", autocomplete: "off",
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); paint(); } });
  const chips = h("div", { class: "kb-cats" });
  const list = h("div", { class: "kb-list" });
  el.append(h("div", { class: "kb-top" }, search,
    manage ? h("button", { class: "btn primary", type: "button", onclick: () => ctx.navigate(`${ctx.base}/new`) }, "+ New article") : null),
    chips, list);

  function paint() {
    const articles = getArticles();
    clear(list);
    if (getFailed()) { list.append(h("p", { class: "modal-err" }, "Couldn't load the Knowledge Bank. The database rules may need updating.")); return; }
    if (!articles) { list.append(h("p", { class: "loading" }, "Loading…")); return; }
    const cats = ["All", ...categoriesOf(articles).filter((c) => articles.some((a) => a.category === c))];
    if (!cats.includes(cat)) cat = "All";
    clear(chips);
    if (cats.length > 2) for (const c of cats) {
      const n = c === "All" ? articles.length : articles.filter((a) => a.category === c).length;
      chips.append(h("button", { type: "button", class: `kb-cat${c === cat ? " on" : ""}`, onclick: () => { cat = c; paint(); } }, `${c} `, h("span", { class: "muted" }, n)));
    }
    const shown = articles.filter((a) => (cat === "All" || a.category === cat)
      && (!query || `${a.title}\n${a.category}\n${a.body}`.toLowerCase().includes(query)));
    if (!articles.length) {
      list.append(h("div", { class: "card empty-card" }, h("p", {}, "The Knowledge Bank is empty."),
        manage ? h("button", { class: "btn primary", type: "button", onclick: () => ctx.navigate(`${ctx.base}/new`) }, "Write the first article")
          : h("p", { class: "muted" }, "Managers can add how-to guides, recipes and more.")));
      return;
    }
    if (!shown.length) { list.append(h("p", { class: "muted empty" }, `Nothing matches “${query}”.`)); return; }
    for (const a of shown) {
      list.append(h("button", { type: "button", class: "card kb-item", onclick: () => ctx.navigate(`${ctx.base}/a/${a.id}`) },
        h("span", { class: "kb-item-top" }, h("span", { class: "kb-item-title" }, a.title), a.category ? h("span", { class: "chip" }, a.category) : null),
        h("span", { class: "kb-item-snip" }, snippet(a.body)),
        h("span", { class: "muted small" }, `Updated ${timeAgo(a.updatedAt)}${a.updatedBy ? ` by ${a.updatedBy}` : ""}`)));
    }
  }
  return paint;
}

/* ---------------- read ---------------- */
function articleView(el, ctx, id, getArticles, getFailed, manage) {
  const body = h("div");
  el.append(h("button", { class: "btn ghost small", type: "button", onclick: () => ctx.navigate(ctx.base) }, "← All articles"), body);
  return () => {
    const articles = getArticles();
    clear(body);
    if (getFailed()) { body.append(h("p", { class: "modal-err" }, "Couldn't load this article.")); return; }
    if (!articles) { body.append(h("p", { class: "loading" }, "Loading…")); return; }
    const a = articles.find((x) => x.id === id);
    if (!a) { body.append(h("p", { class: "muted empty" }, "This article was deleted or moved.")); return; }
    body.append(h("article", { class: "card kb-article" },
      h("div", { class: "kb-article-head" },
        h("div", {}, a.category ? h("span", { class: "chip kb-article-cat" }, a.category) : null, h("h2", { class: "kb-article-title" }, a.title),
          h("p", { class: "muted small" }, `Updated ${timeAgo(a.updatedAt)}${a.updatedBy ? ` by ${a.updatedBy}` : ""}`)),
        manage ? h("div", { class: "kb-article-actions" },
          h("button", { class: "btn small", type: "button", onclick: () => ctx.navigate(`${ctx.base}/edit/${a.id}`) }, "Edit"),
          h("button", { class: "btn small ghost", type: "button", onclick: async () => {
            if (!(await confirm(`Delete “${a.title}”?`, "This removes it for everyone. It can't be undone.", "Delete"))) return;
            try { await ctx.api.deleteArticle(a.id); ctx.log("Deleted article", a.title); ctx.toast("Article deleted"); ctx.navigate(ctx.base); }
            catch (e) { ctx.toast(e.message || "Couldn't delete.", "err"); }
          } }, "Delete")) : null),
      render(a.body)));
  };
}

/* ---------------- write / edit ---------------- */
function editorView(el, ctx, id, getArticles) {
  let loaded = false, previewing = false;
  const title = h("input", { class: "input", type: "text", maxlength: "120", placeholder: "e.g. How to change the CO2 tank" });
  const listId = `kb-cats-${Math.random().toString(36).slice(2, 7)}`;
  const datalist = h("datalist", { id: listId });
  const category = h("input", { class: "input", type: "text", maxlength: "40", list: listId, placeholder: "How-To, Recipes, Knowledge… or type a new one" });
  const bodyIn = h("textarea", { class: "input textarea kb-editor-body", rows: "16", maxlength: String(MAX_BODY),
    placeholder: "Write the article here.\n\n## Ingredients\n- 8 oz kava\n- 2 oz mango juice\n\n## Steps\n1. Fill a shell with ice\n2. …" });
  const preview = h("div", { class: "card kb-preview" });
  const previewBtn = h("button", { class: "btn", type: "button", onclick: () => { previewing = !previewing; paintPreview(); } }, "Preview");
  const save = h("button", { class: "btn primary", type: "button", onclick: doSave }, id ? "Save changes" : "Publish article");
  // Photos: pick one (on an iPad this offers the camera too), paste, or drag onto the article.
  let uploading = 0;
  const photoStatus = h("span", { class: "muted small", "aria-live": "polite" });
  const fileIn = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true,
    onchange: (e) => { addPhotos([...e.target.files]); e.target.value = ""; } });
  const photoBtn = h("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, "📷 Add photo");
  const err = h("div", { class: "modal-err", role: "alert" });
  const help = h("details", { class: "kb-help" }, h("summary", {}, "Formatting tips"),
    h("div", { class: "kb-help-grid" }, FORMAT_HELP.map(([code, what]) => [h("code", {}, code), h("span", {}, what)])));

  el.append(h("button", { class: "btn ghost small", type: "button", onclick: () => ctx.navigate(id ? `${ctx.base}/a/${id}` : ctx.base) }, "← Cancel"),
    h("h2", { class: "cl-date" }, id ? "Edit article" : "New article"),
    h("div", { class: "form kb-form" }, datalist, field("Title", title), field("Category", category),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Article"),
        h("div", { class: "kb-photo-bar" }, photoBtn, fileIn, photoStatus), bodyIn, help), preview,
      err, h("div", { class: "cl-edit-actions" }, previewBtn, h("span", { class: "spacer" }), save)));

  bodyIn.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile());
    if (files.length) { e.preventDefault(); addPhotos(files); }
  });
  bodyIn.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) e.preventDefault(); });
  bodyIn.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addPhotos(files); }
  });

  // Puts the photo on its own line where the cursor is.
  function insertAtCursor(text) {
    const start = bodyIn.selectionStart ?? bodyIn.value.length, end = bodyIn.selectionEnd ?? start;
    const before = bodyIn.value.slice(0, start), after = bodyIn.value.slice(end);
    const pre = before && !before.endsWith("\n") ? "\n" : "", post = after.startsWith("\n") ? "" : "\n";
    bodyIn.value = before + pre + text + post + after;
    const pos = (before + pre + text + post).length;
    bodyIn.setSelectionRange(pos, pos);
  }
  async function addPhotos(files) {
    for (const f of files) {
      uploading++; save.disabled = true; photoStatus.textContent = "Uploading photo…"; err.textContent = "";
      try {
        const src = await ctx.api.uploadImage("knowledge", await shrinkImage(f));
        insertAtCursor(`![](${src})`);
        if (previewing) paintPreview();
      } catch (e) { err.textContent = `Couldn't add that photo: ${e.message}`; }
      uploading--;
      if (!uploading) { save.disabled = false; photoStatus.textContent = "Photo added. Type a caption between the [ ] if you like."; }
    }
  }

  function paintPreview() {
    previewBtn.textContent = previewing ? "Back to editing" : "Preview";
    bodyIn.style.display = previewing ? "none" : "";
    preview.style.display = previewing ? "" : "none";
    clear(preview).append(render(bodyIn.value || "_Nothing written yet._"));
  }
  paintPreview();

  async function doSave() {
    err.textContent = "";
    const t = title.value.trim(), c = category.value.trim(), b = bodyIn.value.trim();
    if (!t) { err.textContent = "Give the article a title."; return; }
    if (!b) { err.textContent = "The article is empty."; return; }
    if (uploading) { err.textContent = "Wait for the photo to finish uploading."; return; }
    save.disabled = true;
    try {
      const saved = await ctx.api.saveArticle(ctx.session(), id, { title: t, category: c, body: b });
      ctx.log(id ? "Edited article" : "Added article", t);
      ctx.toast(id ? "Saved" : "Published");
      ctx.navigate(`${ctx.base}/a/${saved}`);
    } catch (e) { err.textContent = e.message || "Couldn't save."; save.disabled = false; }
  }

  return () => {
    const articles = getArticles();
    clear(datalist);
    for (const c of categoriesOf(articles)) datalist.append(h("option", { value: c }));
    if (loaded || !articles) return;
    loaded = true;
    if (id) {
      const a = articles.find((x) => x.id === id);
      if (!a) { err.textContent = "This article no longer exists."; save.disabled = true; return; }
      title.value = a.title; category.value = a.category || ""; bodyIn.value = a.body;
    }
  };
}
