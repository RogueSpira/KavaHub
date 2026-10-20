// Opening & Closing: three checklists (Opening, Shift Change, Closing).
// Use    = check items off today, see last night's close.
// Manage = also edit the lists and see the full history.
import { h, clear, modal, field } from "../../js/ui.js";
import {
  LISTS, listMeta, businessKey, prevKey, dayStartOf, dayLabel, timeLabel, defaultList, summarize, newItemId,
  PRIORITIES, priorityOf,
} from "./days.js";

const emptyTemplate = (id) => ({ name: listMeta(id).name, items: [] });
// Small tag shown next to Critical and Low items (Normal items get none).
function priorityTag(item) {
  const p = priorityOf(item);
  if (p === "critical") return h("span", { class: "chip pr-critical" }, "Critical");
  if (p === "low") return h("span", { class: "chip pr-low" }, "Low");
  return null;
}

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
      const sub = runs?.[l.id]?.submitted;
      tabsEl.append(h("button", { type: "button", role: "tab", "aria-selected": String(l.id === current),
        class: `cl-tab${l.id === current ? " on" : ""}${sub || complete ? " complete" : ""}`,
        onclick: () => { current = l.id; paint(); } },
        h("span", { class: "cl-tab-name" }, `${l.icon} ${tpl(l.id).name || l.name}`),
        h("span", { class: "cl-tab-count" }, sub ? "✓ Submitted" : r.total ? (complete ? "All checked" : `${r.done} / ${r.total}`) : "—")));
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
    const sub = runs?.[current]?.submitted;
    if (sub) body.append(h("div", { class: `cl-submitted${sub.skippedCritical?.length ? " crit" : ""}` },
      `✓ Submitted by ${sub.by} · ${timeLabel(sub.at)}`,
      sub.skippedCritical?.length ? h("span", { class: "crit-text" }, ` — ${sub.skippedCritical.length} critical not done`) : ""));
    const list = h("div", { class: "cl-list" });
    for (const it of r.items) list.append(row(it, r.checks[it.id]));
    for (const it of r.extra) list.append(row(it, r.checks[it.id]));
    body.append(list);
    body.append(h("div", { class: "cl-submitbar" },
      h("span", { class: "cl-submit-status" }, `${r.done} of ${r.total} done`),
      h("button", { class: "btn primary big cl-submit-btn", type: "button", onclick: submit },
        sub ? `Submit ${tpl(current).name} again` : `Submit ${tpl(current).name} list`)));
  }

  // Submit: warns first if anything Critical (or Normal) is unchecked; Low items never block.
  async function submit() {
    const t = tpl(current), r = rowsFor(current);
    const skipped = r.items.filter((i) => !r.checks[i.id]);
    const crit = skipped.filter((i) => priorityOf(i) === "critical");
    const normal = skipped.filter((i) => priorityOf(i) === "normal");
    const low = skipped.filter((i) => priorityOf(i) === "low");
    const listOf = (items, cls) => h("ul", { class: `cl-warn-list ${cls}` }, items.map((i) => h("li", {}, i.text)));
    if (crit.length || normal.length) {
      const body = h("div", { class: "form" },
        crit.length ? h("div", {}, h("p", { class: "crit-text" }, `${crit.length} critical ${crit.length === 1 ? "item isn't" : "items aren't"} done:`), listOf(crit, "crit")) : null,
        normal.length ? h("div", {}, h("p", { class: "warn-text" }, `${normal.length} ${normal.length === 1 ? "item isn't" : "items aren't"} checked:`), listOf(normal, "norm")) : null,
        low.length ? h("p", { class: "muted small" }, `${low.length} low-priority ${low.length === 1 ? "item" : "items"} unchecked (that's okay).`) : null,
        h("p", {}, crit.length ? "Go back and finish them, or submit anyway and they'll be flagged for the next shift and managers." : "Go back and finish them, or submit anyway."));
      const ok = await modal({
        title: crit.length ? "⚠ Critical items not done" : "Some items aren't checked",
        body,
        actions: [
          { label: "Go back", kind: "primary", value: false },
          { label: "Submit anyway", kind: crit.length ? "danger" : "", value: true },
        ],
      });
      if (ok !== true) return;
    }
    try {
      await api.submitChecklist(ctx.session(), {
        dateKey: key, dayStart: dayStartOf(key), listId: current, listName: t.name, items: t.items, hasRun: !!runs?.[current],
      }, { done: r.done, total: r.total, skippedCritical: crit.map((i) => i.text) });
      toast(`${t.name} list submitted${crit.length ? " — critical items flagged" : " ✓"}`, crit.length ? "info" : "ok");
      ctx.log(`Submitted ${t.name} list`, `${r.done}/${r.total} done${crit.length ? `; critical not done: ${crit.map((i) => i.text).join(", ")}` : ""}`.slice(0, 300));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { toast(e.message || "Couldn't submit.", "err"); }
  }

  function row(item, check) {
    const btn = h("button", { type: "button", class: `cl-row pr-${priorityOf(item)}${check ? " checked" : ""}`, role: "checkbox", "aria-checked": String(!!check),
      onclick: () => toggle(item, !check) },
      h("span", { class: "cl-box", "aria-hidden": "true" }, check ? "✓" : ""),
      h("span", { class: "cl-text" }, item.text, priorityTag(item), item.removed ? h("span", { class: "chip" }, "Removed from list") : null),
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
      if (checked && !item.removed && before.done + 1 === before.total && !runs?.[current]?.submitted) {
        toast(`All checked — tap Submit at the bottom 🎉`);
      }
    } catch (e) { toast(e.message || "Couldn't save that.", "err"); }
  }

  function paintLastNight() {
    clear(lastCard);
    if (lastNight === undefined) return;
    const yKey = prevKey(key);
    const s = summarize(lastNight, null);
    const level = !lastNight ? "warn" : s.skippedCritical.length ? "critical" : s.skippedOther.length ? "warn" : "";
    const card = h("details", { class: `card cl-last${level ? " " + level : ""}` });
    let summary;
    if (!lastNight) summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — `, h("span", { class: "warn-text" }, "the closing list wasn't started."));
    else if (!s.skipped.length) summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — `, h("span", { class: "ok-text" }, `all ${s.total} done ✓`));
    else {
      const names = (list, cls) => h("span", { class: "cl-skipped-names" }, list.map((i) => h("span", { class: `chip ${cls}` }, i.text)));
      summary = h("span", {}, h("b", {}, "Last night's close"), ` · ${dayLabel(yKey, { weekday: "short", month: "short", day: "numeric" })} — ${s.done} of ${s.total} done`,
        s.skippedCritical.length ? h("span", { class: "cl-skip-line" }, h("span", { class: "crit-text" }, `⚠ ${s.skippedCritical.length} critical skipped:`), names(s.skippedCritical, "pr-critical")) : null,
        s.skippedOther.length ? h("span", { class: "cl-skip-line" }, h("span", { class: "warn-text" }, `${s.skippedOther.length} skipped:`), names(s.skippedOther, "chip-soon")) : null,
        s.skippedLow.length ? h("span", { class: "cl-skip-line" }, h("span", { class: "muted" }, `${s.skippedLow.length} low-priority skipped:`), names(s.skippedLow, "pr-low")) : null);
    }
    const subLine = !lastNight ? null : lastNight.submitted
      ? h("span", { class: "muted small" }, `Submitted by ${lastNight.submitted.by} · ${timeLabel(lastNight.submitted.at)}`)
      : h("span", { class: "warn-text small" }, "Not submitted");
    card.append(h("summary", {}, h("span", { class: "cl-last-sum" }, summary, subLine, lastNight ? h("span", { class: "muted small cl-last-hint" }, "Tap to see the whole list") : null)));
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
// inProgress = it's still that business day, so unchecked items aren't "skipped" yet.
function readOnlyList(run, inProgress = false) {
  const s = summarize(run, null);
  const list = h("div", { class: "cl-list readonly" });
  for (const it of s.items) {
    const c = s.checks[it.id];
    const p = priorityOf(it);
    list.append(h("div", { class: `cl-row pr-${p}${c ? " checked" : inProgress ? "" : " skipped"}` },
      h("span", { class: "cl-box", "aria-hidden": "true" }, c ? "✓" : inProgress ? "" : p === "low" ? "–" : "!"),
      h("span", { class: "cl-text" }, it.text, priorityTag(it)),
      h("span", { class: "cl-who" }, c ? `${c.by} · ${timeLabel(c.at)}` : inProgress ? "Not done yet" : p === "critical" ? "Skipped — critical" : "Skipped")));
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
              if (!r) return h("span", { class: `chip ${date === businessKey() ? "" : "chip-off"}` }, `${l.name}: not started`);
              const s = summarize(r, null);
              if (date === businessKey() && s.skipped.length) return h("span", { class: "chip" }, `${l.name}: ${s.done}/${s.total} so far`);
              const cls = s.skippedCritical.length ? "pr-critical" : s.skippedOther.length ? "chip-soon" : "chip-ok";
              return h("span", { class: `chip ${cls}` }, `${s.skippedCritical.length ? "⚠ " : ""}${l.name}: ${s.done}/${s.total}`);
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
    const live = dateKey === businessKey();
    for (const l of LISTS) {
      const r = d[l.id];
      const s = summarize(r, null);
      const flagged = !live && s.skippedCritical.length;
      body.append(h("section", { class: "card cl-day-card" },
        h("h3", {}, `${l.icon} ${r?.listName || l.name}`,
          h("span", { class: `chip ${!r ? (live ? "" : "chip-off") : live && s.skipped.length ? "" : flagged ? "pr-critical" : s.skippedOther.length ? "chip-soon" : "chip-ok"}` },
            !r ? "Not started" : `${s.done} / ${s.total}${live && s.skipped.length ? " so far" : ""}`),
          flagged ? h("span", { class: "crit-text small" }, `⚠ ${s.skippedCritical.length} critical skipped`) : null),
        r ? h("p", { class: `small ${r.submitted ? "muted" : live ? "muted" : "warn-text"}` },
          r.submitted ? `Submitted by ${r.submitted.by} · ${timeLabel(r.submitted.at)}` : live ? "Not submitted yet" : "Not submitted") : null,
        r ? readOnlyList(r, live) : null));
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
    h("p", { class: "muted" }, "Set each item's priority: Critical items are flagged in red if skipped, Low items are fine if forgotten. Changes apply from the next check-off; past days keep the list as it was."), listSel), body);

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
      const pr = h("select", { class: `input cl-pr-select pr-${priorityOf(it)}`, "aria-label": `Priority for item ${i + 1}`,
        onchange: (e) => { it.priority = e.target.value; e.target.className = `input cl-pr-select pr-${it.priority}`; markDirty(); } },
        PRIORITIES.map((o) => h("option", { value: o.value, selected: priorityOf(it) === o.value }, o.label)));
      rows.append(h("div", { class: "cl-edit-row" },
        h("span", { class: "cl-edit-num" }, i + 1), input, pr,
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
    draft.items.splice(at, 0, { id: newItemId(), text: "", priority: "normal" });
    dirty = true; paint();
    body.querySelectorAll(".cl-edit-row input")[at]?.focus();
  }
  function move(i, d) { [draft.items[i], draft.items[i + d]] = [draft.items[i + d], draft.items[i]]; dirty = true; paint(); }
  async function pasteMany() {
    const ta = h("textarea", { class: "input textarea", rows: "8", placeholder: "One item per line" });
    const ok = await modal({ title: "Paste several items", body: h("div", { class: "form" }, field("Items", ta, "Each line becomes an item at the end of the list. Start a line with ! to make it Critical, or ~ to make it Low.")),
      actions: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Add items", kind: "primary", value: true }] });
    if (!ok) return;
    // A line starting with "!" becomes Critical; "~" becomes Low.
    const lines = ta.value.split("\n").map((s) => s.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean);
    draft.items.push(...lines.map((line) => {
      const priority = line.startsWith("!") ? "critical" : line.startsWith("~") ? "low" : "normal";
      return { id: newItemId(), text: line.replace(/^[!~]\s*/, "").slice(0, 200), priority };
    }).filter((i) => i.text));
    dirty = true; paint();
  }
  async function doSave() {
    const items = draft.items.map((i) => ({ id: i.id, text: i.text.trim(), priority: priorityOf(i) })).filter((i) => i.text);
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
