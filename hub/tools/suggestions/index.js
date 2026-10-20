// Suggestion Box: a shared board of ideas, each posted under the person's name.
// Use = post + see the board · Manage = set status, respond, remove any post.
import { h, clear, modal, confirm, field, seg, timeAgo } from "../../js/ui.js";

const STATUSES = [
  { value: "new", label: "New", cls: "st-new" },
  { value: "reviewing", label: "Looking into it", cls: "st-reviewing" },
  { value: "planned", label: "Planned", cls: "st-planned" },
  { value: "done", label: "Done", cls: "st-done" },
  { value: "declined", label: "Not right now", cls: "st-declined" },
];
const statusOf = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];
const OPEN = new Set(["new", "reviewing", "planned"]);
const MAX = 1000;

export function mount(el, ctx) {
  const { api, toast } = ctx;
  const me = ctx.session();
  const manage = ctx.level >= 2;
  let items = [], filter = "open";

  /* ---- composer ---- */
  const text = h("textarea", { class: "input textarea", rows: "3", maxlength: String(MAX), placeholder: "Share an idea to make Mandarin better…" });
  const count = h("span", { class: "muted small" }, `0 / ${MAX}`);
  const post = h("button", { class: "btn primary", type: "button", disabled: true }, "Post");
  text.addEventListener("input", () => { count.textContent = `${text.value.length} / ${MAX}`; post.disabled = !text.value.trim(); });
  post.addEventListener("click", async () => {
    const t = text.value.trim();
    if (!t) return;
    post.disabled = true;
    try {
      await api.addSuggestion(ctx.session(), t);
      ctx.log("Posted suggestion", t.slice(0, 80));
      text.value = ""; count.textContent = `0 / ${MAX}`; toast("Posted — thanks!");
    } catch (e) { toast(e.message || "Couldn't post that.", "err"); post.disabled = false; }
  });
  const composer = h("div", { class: "card composer" }, text,
    h("div", { class: "composer-foot" }, h("span", { class: "muted small" }, "Posting as ", h("b", {}, me.me.name), " · ", count), post));

  /* ---- board ---- */
  const filterSeg = seg([{ value: "open", label: "Open" }, { value: "closed", label: "Done & closed" }, { value: "all", label: "All" }],
    filter, (v) => { filter = v; paint(); }, { small: true });
  const board = h("div", { class: "sugg-list" });
  el.append(composer, h("div", { class: "pane-head sugg-head" }, h("h2", { class: "sub-h" }, "The board"), filterSeg), board);

  function paint() {
    clear(board);
    if (items === null) { board.append(h("p", { class: "modal-err" }, "Couldn't load suggestions. The database rules may need updating.")); return; }
    const shown = items.filter((s) => filter === "all" || (filter === "open" ? OPEN.has(s.status) : !OPEN.has(s.status)));
    if (!shown.length) { board.append(h("p", { class: "muted empty" }, filter === "open" ? "No open suggestions. Be the first!" : "Nothing here yet.")); return; }
    for (const s of shown) board.append(card(s));
  }

  function card(s) {
    const st = statusOf(s.status);
    const mine = s.authorUid === me.uid;
    const canDelete = manage || (mine && s.status === "new");
    return h("article", { class: "card sugg" },
      h("div", { class: "sugg-top" },
        h("span", { class: "avatar sm" }, (s.authorName || "?").charAt(0).toUpperCase()),
        h("span", { class: "sugg-who" }, h("b", {}, s.authorName), mine ? h("span", { class: "chip" }, "You") : null,
          h("span", { class: "muted small" }, ` · ${timeAgo(s.createdAt)}`)),
        h("span", { class: `chip sugg-status ${st.cls}` }, st.label)),
      h("p", { class: "sugg-text" }, s.text),
      s.response ? h("div", { class: "sugg-resp" },
        h("span", { class: "sugg-resp-who" }, `${s.respondedBy || "Manager"} replied`, s.respondedAt ? ` · ${timeAgo(s.respondedAt)}` : ""),
        h("p", {}, s.response)) : null,
      (manage || canDelete) ? h("div", { class: "sugg-actions" },
        manage ? h("button", { class: "btn small", type: "button", onclick: () => respond(s) }, s.response ? "Update status / reply" : "Set status / reply") : null,
        canDelete ? h("button", { class: "btn small ghost", type: "button", onclick: () => remove(s) }, mine && !manage ? "Delete" : "Remove") : null) : null);
  }

  async function respond(s) {
    let status = s.status;
    const reply = h("textarea", { class: "input textarea", rows: "3", maxlength: String(MAX), placeholder: "Optional — everyone will see this reply" });
    reply.value = s.response || "";
    const ok = await modal({
      title: "Set status / reply",
      body: h("div", { class: "form" },
        h("blockquote", { class: "sugg-quote" }, s.text, h("span", { class: "muted small" }, ` — ${s.authorName}`)),
        field("Status", seg(STATUSES.map(({ value, label }) => ({ value, label })), status, (v) => { status = v; }, { small: true })),
        field("Reply", reply)),
      actions: [{ label: "Cancel", kind: "ghost", value: false },
        { label: "Save", kind: "primary", onClick: () => api.respondSuggestion(ctx.session(), s.id, { status, response: reply.value.trim() }) }],
    });
    if (ok) { toast("Saved"); ctx.log("Updated suggestion", `${s.authorName}'s idea → ${statusOf(status).label}`); }
  }

  async function remove(s) {
    if (!(await confirm("Remove this suggestion?", `“${s.text.slice(0, 120)}${s.text.length > 120 ? "…" : ""}”`, "Remove"))) return;
    try { await api.deleteSuggestion(s.id); toast("Removed"); ctx.log("Removed suggestion", `${s.authorName}: ${s.text.slice(0, 60)}`); }
    catch (e) { toast(e.message || "Couldn't remove that.", "err"); }
  }

  const stop = api.watchSuggestions((list) => { items = list; paint(); });
  return () => stop();
}
