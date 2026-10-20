// Opening & Closing: three checklists (Opening, Shift Change, Closing).
// Use    = check items off today, see last night's close.
// Manage = also edit the lists and see the full history.
import { h, clear, modal, field } from "../../js/ui.js";
import {
  LISTS, listMeta, businessKey, prevKey, dayStartOf, dayLabel, timeLabel, defaultList, summarize, newItemId,
} from "./days.js";

const emptyTemplate = (id) => ({ name: listMeta(id).name, items: [] });

export function mount(el, ctx) {
  const manage = ctx.level >= 2;
  const view = ctx.sub[0] || "today";

  if (manage) {
    const tabs = [["today", "Today"], ["history", "History"], ["edit", "Edit lists"]];
    el.append(h("nav", { class: "tabs", role: "tablist" }, tabs.map(([id, label]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(view === id), class: `tab${view === id ? " on" : ""}`,
        onclick: () => ctx.navigate(id === "today" ? ctx.base : `${ctx.base}/${id}`) }, label))));
  }
  const pane = h("section", { class: "pane" });
  el.append(pane);

  if (manage && view === "edit") return editor(pane, ctx);
  if (manage && view === "history" && ctx.sub[1]) return dayDetail(pane, ctx, ctx.sub[1]);
  if (manage && view === "history") return history(pane, ctx);
  return today(pane, ctx);
}

/* =============================== TODAY =============================== */
function today(pane, ctx) {
  const { api, toast } = ctx;
  let key = businessKey();
  let current = defaultList();
  let templates = null, runs = null, lastNight = undefined, failed = false;
  const unsubs = [];

  const lastCard = h("div");
  const tabsEl = h("div", { class: "cl-tabs", role: "tablist" });
  const body = h("div");
  pane.append(h("h2", { class: "cl-date" }, dayLabel(key)), lastCard, tabsEl, body);

  const tpl = (id) => (templates && templates[id]) || emptyTemplate(id);
  // Today's rows = the current list, plus anything checked earlier today that has since been removed from the list.
  function rowsFor(id) {
    const items = tpl(id).items;
    const checks = runs?.[id]?.checks || {};
    const extra = Object.entries(checks).filter(([k]) => !items.some((i) => i.id === k)).map(([k, c]) => ({ id: k, text: c.text, removed: true }));
    const done = items.filter((i) => checks[i.id]).length;
    return { items, extra, checks, done, total: items.length };
  }

  function paint() {
    if (failed) { clear(body).append(h("p", { class: "modal-err" }, "Couldn't load the checklists. The database rules may need updating.")); return; }
    if (!templates || !runs) { clear(body).append(h("p", { class: "loading" }, "Loading…")); return; }
    paintLastNight();
    clear(tabsEl);
    for (const l of LISTS) {
      const r = rowsFor(l.id);
      const complete = r.total > 0 && r.done === r.total;
      tabsEl.append(h("button", { type: "button", role: "tab", "aria-selected": String(l.id === current),
        class: `cl-tab${l.id === current ? " on" : ""}${complete ? " complete" : ""}`,
        onclick: () => { current = l.id; paint(); } },
        h("span", { class: "cl-tab-name" }, `${l.icon} ${tpl(l.id).name || l.name}`),
        h("span", { class: "cl-tab-count" }, r.total ? (complete ? "✓ Done" : `${r.done} / ${r.total}`) : "—")));
    }
    clear(body);
    const r = rowsFor(current);
    if (!r.total && !r.extra.length) {
      body.append(h("div", { class: "card empty-card" },
        h("p", {}, `The ${tpl(current).name} list is empty.`),
        ctx.level >= 2 ? h("button", { class: "btn primary", type: "button", onclick: () => ctx.navigate(`${ctx.base}/edit`) }, "Set up the lists") : h("p", { class: "muted" }, "Ask a manager to add items.")));
      return;
    }
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    body.append(h("div", { class: "cl-progress", "aria-label": `${r.done} of ${r.total} done` },
      h("div", { class: "cl-progress-bar", style: { width: `${pct}%` } })));
    if (r.done === r.total && r.total) body.append(h("div", { class: "cl-complete" }, `🎉 ${tpl(current).name} list complete`));
    const list = h("div", { class: "cl-list" });
    for (const it of r.items) list.append(row(it, r.checks[it.id]));
    for (const it of r.extra) list.append(row(it, r.checks[it.id]));
    body.append(list);
  }

  function row(item, check) {
    const btn = h("button", { type: "button", class: `cl-row${check ? " checked" : ""}`, role: "checkbox", "aria-checked": String(!!check),
      onclick: () => toggle(item, !check) },
      h("span", { class: "cl-box", "aria-hidden": "true" }, check ? "✓" : ""),
      h("span", { class: "cl-text" }, item.text, item.removed ? h("span", { class: "chip" }, "Removed from list") : null),
      check ? h("span", { class: "cl-who" }, `${check.by} · ${timeLabel(check.at)}`) : null);
    return btn;
  }

  async function toggle(item, checked) {
    const t = tpl(current);
    const before = rowsFor(current);
    try {
      await api.setChecklistItem(ctx.session(), {
        dateKey: key, dayStart: dayStartOf(key), listId: current, listName: t.name, items: t.items,
      }, item, checked);
      if (checked && !item.removed && before.done + 1 === before.total) {
        toast(`${t.name} list complete 🎉`);
        ctx.log(`Completed ${t.name} list`, dayLabel(key));
      }
    } catch (e) { toast(e.message || "Couldn't save that.", "err"); }
  }

  function paintLastNight() {
    clear(lastCard);
    if (lastNight === undefined) return;
    const yKey = prevKey(key);
    const s = summarize(lastNight, null);
    const card = h("details", { class: `card cl-last${lastNight && s.skipped.length ? " warn" : ""}` });
    let summary;
    if (!lastNight) summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — `, h("span", { class: "warn-text" }, "the closing list wasn't started."));
    else if (!s.skipped.length) summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — `, h("span", { class: "ok-text" }, `all ${s.total} done ✓`));
    else summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — ${s.done} of ${s.total} done, `,
      h("span", { class: "warn-text" }, `${s.skipped.length} skipped:`),
      h("span", { class: "cl-skipped-names" }, s.skipped.map((i) => h("span", { class: "chip chip-soon" }, i.text))));
    card.append(h("summary", {}, h("span", { class: "cl-last-sum" }, summary, lastNight ? h("span", { class: "muted small cl-last-hint" }, "Tap to see the whole list") : null)));
    if (lastNight) card.append(readOnlyList(lastNight));
    lastCard.append(card);
  }

  function subscribe() {
    unsubs.splice(0).forEach((u) => u());
    templates = null; runs = null; lastNight = undefined;
    unsubs.push(api.watchChecklistTemplates((t, err) => { if (err) failed = true; templates = t || {}; paint(); }));
    unsubs.push(api.watchChecklistDay(key, (d, err) => { if (err) failed = true; runs = d || {}; paint(); }));
    unsubs.push(api.watchChecklistDay(prevKey(key), (d, err) => { if (err) return; lastNight = d?.closing || null; paint(); }));
  }
  subscribe();
  paint();

  // Roll over to the new business day if the hub is left open overnight.
  const iv = setInterval(() => {
    if (businessKey() !== key) {
      key = businessKey();
      pane.querySelector(".cl-date").textContent = dayLabel(key);
      current = defaultList();
      subscribe();
    }
  }, 60 * 1000);
  return () => { clearInterval(iv); unsubs.forEach((u) => u()); };
}

/* Read-only view of a saved list run: who checked what, and what was skipped. */
function readOnlyList(run) {
  const s = summarize(run, null);
  const list = h("div", { class: "cl-list readonly" });
  for (const it of s.items) {
    const c = s.checks[it.id];
    list.append(h("div", { class: `cl-row${c ? " checked" : " skipped"}` },
      h("span", { class: "cl-box", "aria-hidden": "true" }, c ? "✓" : "!"),
      h("span", { class: "cl-text" }, it.text),
      h("span", { class: "cl-who" }, c ? `${c.by} · ${timeLabel(c.at)}` : "Skipped")));
  }
  for (const [k, c] of Object.entries(s.checks)) {
    if (s.items.some((i) => i.id === k)) continue;
    list.append(h("div", { class: "cl-row checked" }, h("span", { class: "cl-box" }, "✓"),
      h("span", { class: "cl-text" }, c.text), h("span", { class: "cl-who" }, `${c.by} · ${timeLabel(c.at)}`)));
  }
  return list;
}

/* =============================== HISTORY (manage) =============================== */
function history(pane, ctx) {
  let days = 30;
  const rangeBtns = h("div", { class: "seg seg-sm" });
  const list = h("div", { class: "rows" });
  pane.append(h("div", { class: "pane-head" }, h("p", { class: "muted" }, "Every day's lists: who checked what, and what was skipped. Tap a day for details."), rangeBtns), list);
  let stop = null;
  function load() {
    clear(rangeBtns);
    for (const n of [30, 90, 365]) rangeBtns.append(h("button", { type: "button", class: `seg-btn${n === days ? " on" : ""}`, onclick: () => { days = n; load(); } }, `${n} days`));
    stop?.();
    const since = dayStartOf(businessKey()); since.setDate(since.getDate() - days);
    clear(list).append(h("p", { class: "loading" }, "Loading…"));
    stop = ctx.api.watchChecklistHistory(since, (runs, err) => {
      clear(list);
      if (err || !runs) { list.append(h("p", { class: "modal-err" }, "Couldn't load history.")); return; }
      const byDate = new Map();
      for (const r of runs) { if (!byDate.has(r.date)) byDate.set(r.date, {}); byDate.get(r.date)[r.listId] = r; }
      if (!byDate.size) { list.append(h("p", { class: "muted empty" }, "Nothing checked off yet.")); return; }
      for (const [date, lists] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
        list.append(h("button", { type: "button", class: "row", onclick: () => ctx.navigate(`${ctx.base}/history/${date}`) },
          h("span", { class: "row-main" }, h("span", { class: "row-title" }, dayLabel(date)),
            h("span", { class: "cl-chips" }, LISTS.map((l) => {
              const r = lists[l.id];
              if (!r) return h("span", { class: "chip chip-off" }, `${l.name}: not started`);
              const s = summarize(r, null);
              return h("span", { class: `chip ${s.skipped.length ? "chip-soon" : "chip-ok"}` }, `${l.name}: ${s.done}/${s.total}`);
            }))),
          h("span", { class: "row-go", "aria-hidden": "true" }, "›")));
      }
    });
  }
  load();
  return () => stop?.();
}

function dayDetail(pane, ctx, dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { ctx.navigate(`${ctx.base}/history`); return; }
  const body = h("div", { class: "cl-detail" }, h("p", { class: "loading" }, "Loading…"));
  pane.append(h("button", { class: "btn ghost small", type: "button", onclick: () => ctx.navigate(`${ctx.base}/history`) }, "← All days"),
    h("h2", { class: "cl-date" }, dayLabel(dateKey)), body);
  const stop = ctx.api.watchChecklistDay(dateKey, (d, err) => {
    clear(body);
    if (err || !d) { body.append(h("p", { class: "modal-err" }, "Couldn't load that day.")); return; }
    for (const l of LISTS) {
      const r = d[l.id];
      const s = summarize(r, null);
      body.append(h("section", { class: "card cl-day-card" },
        h("h3", {}, `${l.icon} ${r?.listName || l.name}`,
          h("span", { class: `chip ${!r ? "chip-off" : s.skipped.length ? "chip-soon" : "chip-ok"}` }, !r ? "Not started" : `${s.done} / ${s.total}`)),
        r ? readOnlyList(r) : null));
    }
  });
  return () => stop();
}

/* =============================== EDITOR (manage) =============================== */
function editor(pane, ctx) {
  const { api, toast } = ctx;
  let templates = null, current = "opening", draft = null, dirty = false;
  const listSel = h("div", { class: "seg" });
  const body = h("div", { class: "cl-editor" });
  pane.append(h("div", { class: "pane-head" },
    h("p", { class: "muted" }, "Changes apply from the next check-off. Past days keep the list as it was."), listSel), body);

  function pickList(id) {
    if (dirty && !window.confirm("You have unsaved changes to this list. Discard them?")) return;
    current = id; draft = null; dirty = false; paint();
  }
  function paint() {
    clear(listSel);
    for (const l of LISTS) listSel.append(h("button", { type: "button", class: `seg-btn${l.id === current ? " on" : ""}`, onclick: () => pickList(l.id) }, `${l.icon} ${l.name}`));
    if (!templates) { clear(body).append(h("p", { class: "loading" }, "Loading…")); return; }
    if (!draft) draft = structuredClone(templates[current] || emptyTemplate(current));
    clear(body);
    const name = h("input", { class: "input", type: "text", value: draft.name, maxlength: "40",
      oninput: (e) => { draft.name = e.target.value; markDirty(); } });
    const rows = h("div", { class: "cl-edit-rows" });
    draft.items.forEach((it, i) => {
      const input = h("input", { class: "input", type: "text", value: it.text, maxlength: "200", "aria-label": `Item ${i + 1}`,
        oninput: (e) => { it.text = e.target.value; markDirty(); },
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); addItem(i + 1); } } });
      rows.append(h("div", { class: "cl-edit-row" },
        h("span", { class: "cl-edit-num" }, i + 1), input,
        h("button", { class: "icon-btn", type: "button", "aria-label": "Move up", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Move down", disabled: i === draft.items.length - 1, onclick: () => move(i, 1) }, "↓"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Delete item", onclick: () => { draft.items.splice(i, 1); markDirty(); paint(); } }, "✕")));
    });
    if (!draft.items.length) rows.append(h("p", { class: "muted" }, "No items yet. Add them one at a time, or paste a whole list."));
    const save = h("button", { class: "btn primary", type: "button", disabled: !dirty, onclick: doSave }, "Save list");
    body.append(
      field("List name", name),
      h("div", { class: "field" }, h("span", { class: "field-label" }, `Items (${draft.items.length})`), rows),
      h("div", { class: "cl-edit-actions" },
        h("button", { class: "btn", type: "button", onclick: () => addItem(draft.items.length) }, "+ Add item"),
        h("button", { class: "btn", type: "button", onclick: pasteMany }, "Paste several"),
        h("span", { class: "spacer" }),
        dirty ? h("button", { class: "btn ghost", type: "button", onclick: () => { draft = null; dirty = false; paint(); } }, "Undo changes") : null,
        save));
    function markDirty() { if (!dirty) { dirty = true; save.disabled = false; } }
  }
  function addItem(at) {
    draft.items.splice(at, 0, { id: newItemId(), text: "" });
    dirty = true; paint();
    body.querySelectorAll(".cl-edit-row input")[at]?.focus();
  }
  function move(i, d) { [draft.items[i], draft.items[i + d]] = [draft.items[i + d], draft.items[i]]; dirty = true; paint(); }
  async function pasteMany() {
    const ta = h("textarea", { class: "input textarea", rows: "8", placeholder: "One item per line" });
    const ok = await modal({ title: "Paste several items", body: h("div", { class: "form" }, field("Items", ta, "Each line becomes an item at the end of the list.")),
      actions: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Add items", kind: "primary", value: true }] });
    if (!ok) return;
    const lines = ta.value.split("\n").map((s) => s.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean).map((s) => s.slice(0, 200));
    draft.items.push(...lines.map((text) => ({ id: newItemId(), text })));
    dirty = true; paint();
  }
  async function doSave() {
    const items = draft.items.map((i) => ({ id: i.id, text: i.text.trim() })).filter((i) => i.text);
    const name = (draft.name || "").trim() || listMeta(current).name;
    if (items.length > 150) { toast("Lists can have up to 150 items.", "err"); return; }
    try {
      await api.saveChecklistTemplate(current, { name, items });
      draft = null; dirty = false;
      toast(`${name} list saved`);
      ctx.log("Edited checklist", `${name}: ${items.length} items`);
    } catch (e) { toast(e.message || "Couldn't save.", "err"); }
  }
  const stop = api.watchChecklistTemplates((t) => { templates = t || {}; if (!dirty) draft = null; paint(); });
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);
  return () => { stop(); window.removeEventListener("beforeunload", beforeUnload); };
}
