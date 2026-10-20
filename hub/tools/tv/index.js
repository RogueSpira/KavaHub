// TV Screens: everything the TVs in the bar show (the board itself lives at /board/).
//   #/tool/tv                   Today — tap who's opening and closing
//   #/tool/tv/events            Events (with repeats and flyers)
//   #/tool/tv/content[/<id>]    Slide content: Who's Working roster, happy hour, specials, ticker…
//   #/tool/tv/screens           Manage: which slides each TV shows, order, timing, colors
//   #/tool/tv/perms             Manage: which roles may change each part
//   #/tool/tv/import            Manage: one-time move from the old Google Sheets
// Use = see today, and change the parts your role is given in Permissions (Who's Working by default).
// Manage = change everything.
import { h, clear, modal, confirm, field, seg } from "../../js/ui.js";
import { shrinkImage } from "../../js/images.js";
import {
  SECTIONS, sectionById, SLIDES, slideById, DEFAULT_PERMS, withDefaults, crewFor, businessKey, businessDate, keyOf,
  dateOfKey, WEEKDAYS, NTH, occurrences, repeatLabel, isRecurring, okImage, timeMinutes, fmtTime,
} from "../../js/tv-shared.js";

const BOARD = "/board/";
// Like el.append, but skips empty bits (null/false) and flattens lists.
const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };

export function mount(el, ctx) {
  const manage = ctx.level >= 2;
  const [view = "today", arg] = ctx.sub;
  let tv = null, failed = false, paintView = () => {};

  const roleId = () => ctx.session()?.me?.roleId;
  // Mirrors the database rules: Manage → everything; otherwise the roles ticked in Permissions
  // (before Permissions is ever saved, anyone with Use can change Who's Working).
  const canEdit = (section) => manage || (ctx.level >= 1 && (tv?.config ? (tv.config.perms?.[section] || []).includes(roleId()) : section === "crew"));
  const store = { get tv() { return tv; }, get failed() { return failed; }, canEdit, manage };

  const nav = h("nav", { class: "tabs", role: "tablist" });
  const pane = h("section", { class: "pane" });
  add(el, nav, pane);

  function tabs() {
    const t = [["today", "Today"]];
    if (tv && canEdit("events")) t.push(["events", "Events"]);
    if (tv && SECTIONS.some((s) => s.id !== "events" && canEdit(s.id))) t.push(["content", "Slides"]);
    if (manage) t.push(["screens", "Screens"], ["perms", "Permissions"], ["import", "Import"]);
    return t;
  }
  function paintNav() {
    const t = tabs();
    clear(nav);
    if (t.length < 2) { nav.hidden = true; return; }
    nav.hidden = false;
    for (const [id, label] of t) add(nav, h("button", { type: "button", role: "tab", "aria-selected": String(view === id), class: `tab${view === id ? " on" : ""}`,
      onclick: () => ctx.navigate(id === "today" ? ctx.base : `${ctx.base}/${id}`) }, label));
  }
  paintNav();

  if (view === "events") paintView = guard(pane, store, () => canEdit("events"), () => eventsView(pane, ctx, store));
  else if (view === "content" && arg) paintView = guard(pane, store, () => canEdit(arg) && sectionById(arg), () => (arg === "crew" ? crewEditor : sectionEditor)(pane, ctx, store, arg));
  else if (view === "content") paintView = guard(pane, store, () => true, () => contentList(pane, ctx, store));
  else if (manage && view === "screens") paintView = guard(pane, store, () => true, () => screensView(pane, ctx, store));
  else if (manage && view === "perms") paintView = guard(pane, store, () => true, () => permsView(pane, ctx, store));
  else if (manage && view === "import") paintView = guard(pane, store, () => true, () => importView(pane, ctx, store));
  else paintView = todayView(pane, ctx, store);
  paintView();
  // Subscribe last: the demo backend answers straight away.
  const stop = ctx.api.watchTv((data, err) => { if (err) failed = true; tv = data || {}; paintNav(); paintView(); });
  return () => stop();
}

// Waits for the data, checks access, then builds the view once and hands over its paint().
function guard(pane, store, allowed, make) {
  let inner = null;
  return () => {
    if (inner) return inner();
    clear(pane);
    if (store.failed) { add(pane, h("p", { class: "modal-err" }, "Couldn't load the TV settings. The database rules may need updating.")); return; }
    if (!store.tv) { add(pane, h("p", { class: "loading" }, "Loading…")); return; }
    if (!allowed()) { add(pane, h("p", { class: "muted empty" }, "You don't have access to change this part of the TVs.")); return; }
    inner = make() || (() => {});
    inner();
  };
}
const nameOf = (ctx) => ctx.session()?.me?.name || "Someone";
const saved = (ctx, what) => { ctx.toast("Saved — the TVs update in a few seconds"); ctx.log("Changed TV content", what); };
const fail = (ctx, e) => ctx.toast(e?.message?.includes("permission") ? "You don't have access to change that." : (e?.message || "Couldn't save."), "err");

function boardLinks(tv) {
  const screens = Object.entries(tv?.config?.screens || {});
  const links = screens.length ? screens.map(([id, s]) => [`${BOARD}?tv=${encodeURIComponent(id)}`, `📺 ${s.name || `TV ${id}`}`]) : [[BOARD, "📺 Open the TV board"]];
  return h("div", { class: "tv-links" }, links.map(([href, label]) => h("a", { class: "btn small ghost", href, target: "_blank", rel: "noopener" }, label, " ↗")));
}

/* ======================================================================
   Photo picker used everywhere: shows the picture, Upload / Remove.
   ====================================================================== */
function photoInput(ctx, value, onChange, { label = "Add photo", round = false } = {}) {
  const wrap = h("div", { class: "tv-photo" });
  const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    status.textContent = "Uploading…"; btn.disabled = true;
    try { const src = await ctx.api.uploadImage("tv", await shrinkImage(f)); value = src; onChange(src); paint(); }
    catch (err) { status.textContent = `Couldn't upload: ${err.message}`; }
    btn.disabled = false;
  } });
  const status = h("span", { class: "muted small" });
  const btn = h("button", { class: "btn small", type: "button", onclick: () => fileIn.click() });
  function paint() {
    status.textContent = "";
    btn.textContent = value ? "Change" : `📷 ${label}`;
    add(clear(wrap), 
      okImage(value) ? h("img", { class: `tv-thumb${round ? " round" : ""}`, src: value, alt: "" }) : h("div", { class: `tv-thumb empty${round ? " round" : ""}` }, "🖼️"),
      h("div", { class: "tv-photo-btns" }, btn, value ? h("button", { class: "btn small ghost", type: "button", onclick: () => { value = ""; onChange(""); paint(); } }, "Remove") : null, status),
      fileIn);
  }
  paint();
  return wrap;
}
const avatar = (p, cls = "") => (p && okImage(p.photo)
  ? h("img", { class: `tv-face-img ${cls}`, src: p.photo, alt: "" })
  : h("span", { class: `tv-face-img initial ${cls}` }, p ? (p.name || "?")[0].toUpperCase() : "—"));

/* ======================================================================
   TODAY — who's opening and closing (one tap), and what's on tonight
   ====================================================================== */
function todayView(pane, ctx, store) {
  return () => {
    clear(pane);
    if (store.failed) { add(pane, h("p", { class: "modal-err" }, "Couldn't load the TV settings. The database rules may need updating.")); return; }
    const tv = store.tv;
    if (!tv) { add(pane, h("p", { class: "loading" }, "Loading…")); return; }
    const key = businessKey(), crew = withDefaults("crew", tv.crew), now = crewFor(tv.crew);
    const day = dateOfKey(key), edit = store.canEdit("crew");
    const todayEntry = crew.days?.[key];
    const weekly = crew.weekly?.[day.getDay()] || {};

    add(pane, h("h2", { class: "cl-date" }, `Today · ${day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}`));
    if (!crew.roster.length) {
      add(pane, h("div", { class: "card empty-card" }, h("p", {}, "No kavatenders have been added to the TVs yet."),
        edit ? h("button", { class: "btn primary", type: "button", onclick: () => ctx.navigate(`${ctx.base}/content/crew`) }, "Add kavatenders") : null));
    } else {
      add(pane, h("p", { class: "muted tv-lead" }, edit ? "Tap a face to change who the TVs show today. It goes back to the weekly schedule tomorrow." : "Who the TVs show today."));
      const grid = h("div", { class: "tv-slots" });
      for (const [slot, label] of [["opener", "☀️ Opening"], ["closer", "🌙 Closing"]]) {
        const cur = now[slot];
        const fromToday = todayEntry && todayEntry[slot] !== undefined;
        add(grid, h("div", { class: "card tv-slot" },
          h("div", { class: "tv-slot-head" }, h("span", { class: "tv-slot-label" }, label),
            h("span", { class: "muted small" }, fromToday ? `Changed by ${todayEntry.by || "someone"}` : "Weekly schedule")),
          h("div", { class: "tv-slot-now" }, avatar(cur, "big"), h("span", { class: "tv-slot-name" }, cur ? cur.name : "Nobody")),
          edit ? h("div", { class: "tv-faces" },
            crew.roster.map((p) => h("button", { type: "button", class: `tv-face${cur?.id === p.id ? " on" : ""}`, "aria-pressed": String(cur?.id === p.id),
              onclick: () => setSlot(slot, p.id, p.name) }, avatar(p), h("span", {}, p.name))),
            h("button", { type: "button", class: `tv-face${!cur ? " on" : ""}`, onclick: () => setSlot(slot, null, "nobody") }, h("span", { class: "tv-face-img initial" }, "—"), h("span", {}, "Nobody"))) : null));
      }
      add(pane, grid);
      if (edit && todayEntry) add(pane, h("button", { class: "btn ghost small tv-reset", type: "button", onclick: resetToday }, "↺ Go back to the weekly schedule for today"));
    }

    // What's on tonight / next
    const occ = occurrences(withDefaults("events", tv.events).items, businessDate(), 14);
    const tonight = occ.filter((o) => o.key === key), next = occ.find((o) => o.key !== key);
    add(pane, h("div", { class: "card tv-tonight" },
      h("h3", {}, "On the TVs"),
      tonight.length ? tonight.map((o) => h("p", {}, h("b", {}, "Tonight: "), `${o.ev.title}${o.ev.time ? ` · ${o.ev.time}` : ""}`)) : h("p", { class: "muted" }, "Nothing on tonight."),
      next ? h("p", { class: "muted" }, `Next: ${next.ev.title} · ${next.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`) : null),
      boardLinks(tv));

    async function setSlot(slot, id, name) {
      const entry = { opener: todayEntry?.opener !== undefined ? todayEntry.opener : (weekly.opener || null),
        closer: todayEntry?.closer !== undefined ? todayEntry.closer : (weekly.closer || null),
        [slot]: id, by: nameOf(ctx), at: new Date().toISOString() };
      try {
        await ctx.api.mergeTv("crew", { days: { [key]: entry } });
        ctx.toast(`${slot === "opener" ? "Opening" : "Closing"}: ${id ? name : "nobody"}`);
        ctx.log("Changed today's crew", `${slot === "opener" ? "Opening" : "Closing"}: ${id ? name : "nobody"}`);
        // Tidy up changes older than two weeks.
        const old = Object.keys(crew.days || {}).filter((k) => k < keyOf(new Date(day.getTime() - 14 * 864e5)));
        for (const k of old) ctx.api.clearTvField("crew", `days.${k}`).catch(() => {});
      } catch (e) { fail(ctx, e); }
    }
    async function resetToday() {
      try { await ctx.api.clearTvField("crew", `days.${key}`); ctx.toast("Back to the weekly schedule"); ctx.log("Changed today's crew", "Back to the weekly schedule"); }
      catch (e) { fail(ctx, e); }
    }
  };
}

/* ======================================================================
   EVENTS
   ====================================================================== */
const to24 = (t) => { if (!t) return ""; const m = timeMinutes(t); return m >= 24 * 60 ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const newId = (title) => `${String(title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "event"}-${Math.random().toString(36).slice(2, 7)}`;

function eventsView(pane, ctx, store) {
  let showPast = false;
  const paint = () => {
    const items = withDefaults("events", store.tv.events).items || [];
    const todayKey = businessKey();
    const recurring = items.filter(isRecurring).sort((a, b) => ((+a.weekday + 6) % 7) - ((+b.weekday + 6) % 7) || timeMinutes(a.time) - timeMinutes(b.time));
    const once = items.filter((e) => e.repeat === "once").sort((a, b) => (a.date || "").localeCompare(b.date || "") || timeMinutes(a.time) - timeMinutes(b.time));
    const upcoming = once.filter((e) => (e.date || "") >= todayKey), past = once.filter((e) => (e.date || "") < todayKey).reverse();
    const next = Object.fromEntries(occurrences(items, businessDate(), 70).reverse().map((o) => [o.ev.id, o.date]));

    const row = (e) => h("button", { type: "button", class: `row tv-ev${e.active === false ? " row-off" : ""}`, onclick: () => editEvent(ctx, store, e) },
      okImage(e.image) ? h("img", { class: "tv-ev-thumb", src: e.image, alt: "" }) : h("span", { class: "tv-ev-thumb empty" }, "📅"),
      h("span", { class: "row-main" },
        h("span", { class: "row-title" }, e.title, e.active === false ? h("span", { class: "chip chip-off" }, "Off") : null),
        h("span", { class: "row-sub" }, [repeatLabel(e), e.time, e.banner].filter(Boolean).join(" · ")),
        isRecurring(e) && next[e.id] && e.active !== false ? h("span", { class: "muted small" }, `Next: ${next[e.id].toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`) : null),
      h("span", { class: "row-go" }, "›"));

    add(clear(pane), 
      h("div", { class: "pane-head" }, h("p", { class: "muted" }, "Everything on the Tonight, Every Week, Up Next and Calendar slides."),
        h("button", { class: "btn primary", type: "button", onclick: () => editEvent(ctx, store, null) }, "+ New event")),
      h("h3", { class: "tv-h3" }, "Repeating"),
      recurring.length ? h("div", { class: "rows" }, recurring.map(row)) : h("p", { class: "muted small" }, "No weekly or monthly events."),
      h("h3", { class: "tv-h3" }, "Coming up"),
      upcoming.length ? h("div", { class: "rows" }, upcoming.map(row)) : h("p", { class: "muted small" }, "No one-time events coming up."),
      past.length ? h("div", { class: "tv-past" },
        h("button", { class: "btn ghost small", type: "button", onclick: () => { showPast = !showPast; paint(); } }, showPast ? "Hide past events" : `Show past events (${past.length})`),
        showPast ? [h("div", { class: "rows" }, past.map(row)),
          h("button", { class: "btn small ghost", type: "button", onclick: async () => {
            if (!(await confirm(`Delete ${past.length} past event${past.length === 1 ? "" : "s"}?`, "They're already off the TVs. This just tidies the list.", "Delete"))) return;
            try { await ctx.api.saveTv("events", { items: (withDefaults("events", store.tv.events).items || []).filter((e) => !(e.repeat === "once" && (e.date || "") < todayKey)) }); saved(ctx, "Cleared past events"); }
            catch (e) { fail(ctx, e); }
          } }, "Delete past events")] : null) : null);
  };
  return paint;
}

async function editEvent(ctx, store, ev) {
  const e = ev ? structuredClone(ev) : { repeat: "once", date: businessKey(), weekday: 4, nth: 1, time: "8:00 PM", active: true };
  const title = h("input", { class: "input", maxlength: "80", value: e.title || "", placeholder: "e.g. Trivia Night" });
  const date = h("input", { class: "input", type: "date", value: e.date || businessKey() });
  const wd = h("select", { class: "input" }, WEEKDAYS.map((w, i) => h("option", { value: i, selected: Number(e.weekday) === i }, w)));
  const nth = h("select", { class: "input" }, [1, 2, 3, 4, -1].map((n) => h("option", { value: n, selected: Number(e.nth ?? 1) === n }, NTH[n])));
  const time = h("input", { class: "input", type: "time", value: to24(e.time) });
  const banner = h("input", { class: "input", maxlength: "40", value: e.banner || "", placeholder: "Short tag, e.g. Live Music" });
  const details = h("textarea", { class: "input textarea", rows: "3", maxlength: "400", placeholder: "Theme, prizes, what to bring…" }, e.details || "");
  const host = h("input", { class: "input", maxlength: "60", value: e.host || "", placeholder: "Optional" });
  const from = h("input", { class: "input", type: "date", value: e.from || "" });
  const until = h("input", { class: "input", type: "date", value: e.until || "" });
  let image = e.image || "", active = e.active !== false, repeat = e.repeat || "once";

  const whenBox = h("div", { class: "form" });
  function paintWhen() {
    add(clear(whenBox), 
      repeat === "once" ? field("Date", date) : null,
      repeat === "monthly" ? h("div", { class: "tv-two" }, field("Which", nth), field("Day", wd)) : null,
      repeat === "weekly" ? field("Day", wd) : null,
      repeat !== "once" ? h("div", { class: "tv-two" }, field("Starts (optional)", from), field("Ends (optional)", until)) : null);
  }
  paintWhen();
  const body = h("div", { class: "form" },
    field("Title", title),
    field("How often", seg([{ value: "once", label: "One time" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "Once a month" }], repeat, (v) => { repeat = v; paintWhen(); })),
    whenBox,
    h("div", { class: "tv-two" }, field("Time", time), field("Tag", banner)),
    field("Details", details, "Wrap words in **double stars** to make them gold on the TV."),
    field("Host", host),
    field("Flyer or photo", photoInput(ctx, image, (v) => { image = v; }, { label: "Add flyer" })),
    field("Show on the TVs", seg([{ value: true, label: "On" }, { value: false, label: "Off", cls: "danger" }], active, (v) => { active = v; })));

  const actions = [];
  if (ev) actions.push({ label: "Delete", kind: "ghost", onClick: async () => {
    if (!(await confirm(`Delete “${ev.title}”?`, "It comes off the TVs right away.", "Delete"))) return false;
    await writeEvents(ctx, store, (items) => items.filter((x) => x.id !== ev.id));
    ctx.log("Deleted event", ev.title); ctx.toast("Event deleted");
    return true;
  } });
  actions.push({ label: "Cancel", kind: "ghost", value: false }, { label: ev ? "Save" : "Add event", kind: "primary", onClick: async () => {
    const t = title.value.trim();
    if (!t) throw new Error("Give the event a title.");
    if (repeat === "once" && !date.value) throw new Error("Pick a date.");
    if (repeat !== "once" && from.value && until.value && until.value < from.value) throw new Error("The end date is before the start date.");
    const out = { id: ev?.id || newId(t), title: t, repeat, active };
    if (repeat === "once") out.date = date.value;
    else { out.weekday = Number(wd.value); if (repeat === "monthly") out.nth = Number(nth.value); if (from.value) out.from = from.value; if (until.value) out.until = until.value; }
    if (time.value) out.time = fmtTime(time.value);
    for (const [k, inp] of [["banner", banner], ["details", details], ["host", host]]) if (inp.value.trim()) out[k] = inp.value.trim();
    if (image) out.image = image;
    await writeEvents(ctx, store, (items) => (ev ? items.map((x) => (x.id === ev.id ? out : x)) : [...items, out]));
    ctx.log(ev ? "Edited event" : "Added event", t); ctx.toast(ev ? "Saved — the TVs update in a few seconds" : "Event added");
    return true;
  } });
  await modal({ title: ev ? "Edit event" : "New event", body, actions, wide: true });
}
// Always starts from the latest list, so two people editing different events don't undo each other.
async function writeEvents(ctx, store, change) {
  const items = withDefaults("events", store.tv.events).items || [];
  await ctx.api.saveTv("events", { items: change(items) });
}

/* ======================================================================
   SLIDES (content) — list of parts this person may change
   ====================================================================== */
function contentList(pane, ctx, store) {
  return () => {
    const tv = store.tv;
    const summary = {
      crew: () => `${withDefaults("crew", tv.crew).roster.length} kavatenders`,
      happyhour: () => `${(withDefaults("happyhour", tv.happyhour).slots || []).length} times a day`,
      specials: () => `${withDefaults("specials", tv.specials).items.length} specials`,
      signature: () => `${withDefaults("signature", tv.signature).items.length} drinks`,
      products: () => `${withDefaults("products", tv.products).items.length} botanicals`,
      community: () => { const c = withDefaults("community", tv.community); return [c.driveFolder ? "Google Drive folder" : "", c.photos.length ? `${c.photos.length} added here` : ""].filter(Boolean).join(" + ") || "No photos"; },
      ticker: () => `${withDefaults("ticker", tv.ticker).items.length} messages`,
      welcome: () => withDefaults("welcome", tv.welcome).headline || "",
      qr: () => (withDefaults("qr", tv.qr).url || "").replace(/^https?:\/\//, ""),
    };
    const list = SECTIONS.filter((s) => s.id !== "events" && store.canEdit(s.id));
    add(clear(pane), h("div", { class: "rows" }, list.map((s) => h("button", { type: "button", class: "row", onclick: () => ctx.navigate(`${ctx.base}/content/${s.id}`) },
      h("span", { class: "tv-sec-icon" }, s.icon),
      h("span", { class: "row-main" }, h("span", { class: "row-title" }, s.name), h("span", { class: "row-sub" }, summary[s.id]?.() || s.blurb)),
      h("span", { class: "row-go" }, "›")))));
  };
}

/* ---------------- Who's Working: roster + weekly pattern ---------------- */
function crewEditor(pane, ctx, store) {
  const start = withDefaults("crew", store.tv.crew);
  const roster = structuredClone(start.roster || []);
  const weekly = structuredClone(start.weekly || {});
  const rosterBox = h("div", { class: "tv-items" }), weekBox = h("div", { class: "tv-week" });
  const save = h("button", { class: "btn primary", type: "button", onclick: doSave }, "Save");

  function paintRoster() {
    clear(rosterBox);
    roster.forEach((p, i) => add(rosterBox, h("div", { class: "card tv-item tv-person" },
      photoInput(ctx, p.photo, (v) => { p.photo = v; }, { round: true }),
      h("input", { class: "input", maxlength: "30", value: p.name || "", placeholder: "Name", oninput: (e) => { p.name = e.target.value; paintWeek(); } }),
      h("button", { class: "icon-btn", type: "button", "aria-label": `Remove ${p.name}`, onclick: async () => {
        if (!(await confirm(`Remove ${p.name || "this person"}?`, "They'll come off the weekly schedule too.", "Remove"))) return;
        roster.splice(i, 1);
        for (const d of Object.values(weekly)) for (const k of ["opener", "closer"]) if (d[k] === p.id) d[k] = null;
        paintRoster(); paintWeek();
      } }, "✕"))));
    add(rosterBox, h("button", { class: "btn", type: "button", onclick: () => {
      const base = "new"; let id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      roster.push({ id, name: "", photo: "" }); paintRoster(); paintWeek();
      rosterBox.querySelectorAll("input.input")[roster.length - 1]?.focus();
    } }, "+ Add a kavatender"));
  }
  function paintWeek() {
    clear(weekBox);
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const cur = weekly[d] || {};
      const sel = (k) => h("select", { class: "input", onchange: (e) => { weekly[d] = { ...(weekly[d] || {}), [k]: e.target.value || null }; } },
        h("option", { value: "" }, "—"), roster.filter((p) => p.name.trim()).map((p) => h("option", { value: p.id, selected: cur[k] === p.id }, p.name)));
      add(weekBox, h("div", { class: "tv-week-row" }, h("span", { class: "tv-week-day" }, WEEKDAYS[d]), field("☀️ Opening", sel("opener")), field("🌙 Closing", sel("closer"))));
    }
  }
  async function doSave() {
    const clean = roster.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
    // Give new people a readable id from their name.
    const used = new Set(clean.filter((p) => !p.id.startsWith("new-")).map((p) => p.id));
    for (const p of clean) if (p.id.startsWith("new-")) {
      let id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "staff", n = 2;
      while (used.has(id)) id = `${id.replace(/-\d+$/, "")}-${n++}`;
      for (const d of Object.values(weekly)) for (const k of ["opener", "closer"]) if (d[k] === p.id) d[k] = id;
      used.add(id); p.id = id;
    }
    const ids = new Set(clean.map((p) => p.id));
    const week = {};
    for (let d = 0; d < 7; d++) { const w = weekly[d] || {}; week[d] = { opener: ids.has(w.opener) ? w.opener : null, closer: ids.has(w.closer) ? w.closer : null }; }
    save.disabled = true;
    try {
      await ctx.api.mergeTv("crew", { roster: clean.map(({ id, name, photo }) => ({ id, name, photo: photo || "" })), weekly: week });
      saved(ctx, "Who's Working"); ctx.navigate(`${ctx.base}/content`);
    } catch (e) { fail(ctx, e); save.disabled = false; }
  }

  add(clear(pane), backTo(ctx), h("h2", { class: "cl-date" }, "🧑‍🍳 Who's Working"),
    h("h3", { class: "tv-h3" }, "Kavatenders"), h("p", { class: "muted small tv-lead" }, "Names and photos shown on the TVs. A tall photo (portrait) looks best."), rosterBox,
    h("h3", { class: "tv-h3" }, "Weekly schedule"), h("p", { class: "muted small tv-lead" }, "Who the TVs show each day unless someone changes it on the Today tab."), weekBox,
    h("div", { class: "cl-edit-actions tv-save" }, h("span", { class: "spacer" }), save));
  paintRoster(); paintWeek();
  return null;
}
const backTo = (ctx) => h("button", { class: "btn ghost small", type: "button", onclick: () => ctx.navigate(`${ctx.base}/content`) }, "← All slides");

/* ---------------- everything else: one form per section ---------------- */
// fields: [key, label, type, hint?]   type: text | textarea | time | image | images | url
const SPECS = {
  welcome: { fields: [["eyebrow", "Small line on top", "text"], ["headline", "Big headline", "text"], ["sub", "Line under the tagline (optional)", "text"]],
    note: "The tagline “Jacksonville's First Kava Bar - Your Second Home” always shows." },
  happyhour: { fields: [["title", "Title", "text"], ["sub", "Small line on top", "text"]],
    list: { key: "slots", noun: "time", max: 6, required: "start", item: [["label", "Name", "text"], ["start", "Starts", "time"], ["end", "Ends", "time"]] },
    note: "While a happy hour is on, the TVs show a “Live now” countdown." },
  specials: { list: { key: "items", noun: "special", max: 20, item: [["name", "Drink", "text"], ["desc", "Description", "text"], ["image", "Photo (optional)", "image"]] } },
  signature: { list: { key: "items", noun: "drink", max: 20, item: [["drink", "Drink", "text"], ["staff", "Whose drink", "text"], ["desc", "What's in it", "text"], ["image", "Photo (optional)", "image"]] } },
  products: { list: { key: "items", noun: "botanical", max: 20, item: [["name", "Name", "text"], ["blurb", "About it", "textarea"], ["images", "Photos (up to 2)", "images"]] },
    note: "One shows each time the slide comes around." },
  ticker: { list: { key: "items", noun: "message", max: 30, strings: true, item: [["text", "Message", "text"]] },
    note: "Wrap words in **double stars** to make them gold." },
  community: { fields: [["title", "Title", "text"], ["footer", "Line at the bottom", "text", "e.g. Send your photos to **Christian@kavaandcompany.com**"],
    ["driveFolder", "Google Drive folder (link or ID)", "text", "Photos in this folder show up on the TVs on their own (checked every 30 minutes). The folder must be shared with anyone who has the link."]],
    photos: true, note: "Photos come from the Google Drive folder, plus any you add below." },
  qr: { fields: [["title", "Events QR title", "text"], ["text", "Events QR text", "textarea"], ["url", "Events QR link", "url"],
    ["voteSite", "Live vote site", "url", "Used by the Live Vote Results slide"], ["feudSurvey", "Feud survey link", "url", "Used by the Feud Survey QR slide"]] },
};
const BLANK = { welcome: { eyebrow: "", headline: "", sub: "" }, happyhour: { title: "", sub: "", slots: [] }, community: { title: "", footer: "", driveFolder: "", photos: [] }, qr: {} };

function sectionEditor(pane, ctx, store, id) {
  const sec = sectionById(id), spec = SPECS[id];
  const data = structuredClone({ ...(BLANK[id] || {}), ...withDefaults(id, store.tv[id]) });
  const L = spec.list;
  if (L) data[L.key] = (data[L.key] || []).map((x) => (L.strings ? { text: x } : x));
  const save = h("button", { class: "btn primary", type: "button", onclick: doSave }, "Save");
  const listBox = h("div", { class: "tv-items" }), photoBox = h("div", { class: "tv-photos" });

  const input = (obj, [key, , type], onInput) => {
    if (type === "image") return photoInput(ctx, obj[key], (v) => { obj[key] = v; });
    if (type === "images") {
      const box = h("div", { class: "tv-imgs" });
      const paint = () => {
        obj[key] = (obj[key] || []).filter(Boolean);
        add(clear(box), obj[key].map((src, i) => photoInput(ctx, src, (v) => { obj[key][i] = v; if (!v) paint(); })),
          obj[key].length < 2 ? photoInput(ctx, "", (v) => { if (v) { obj[key].push(v); paint(); } }) : null);
      };
      paint(); return box;
    }
    const attrs = { class: "input", value: obj[key] || "", oninput: (e) => { obj[key] = e.target.value; onInput?.(); } };
    if (type === "textarea") return h("textarea", { class: "input textarea", rows: "3", oninput: attrs.oninput }, obj[key] || "");
    if (type === "time") return h("input", { ...attrs, type: "time" });
    if (type === "url") return h("input", { ...attrs, type: "url", placeholder: "https://…" });
    return h("input", { ...attrs, type: "text", maxlength: "200" });
  };

  function paintList() {
    const items = data[L.key];
    clear(listBox);
    items.forEach((it, i) => add(listBox, h("div", { class: "card tv-item" },
      h("div", { class: "tv-item-fields" }, L.item.map((f) => field(f[1], input(it, f)))),
      h("div", { class: "tv-item-btns" },
        h("button", { class: "icon-btn", type: "button", "aria-label": "Move up", disabled: i === 0, onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); paintList(); } }, "↑"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Move down", disabled: i === items.length - 1, onclick: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); paintList(); } }, "↓"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Remove", onclick: () => { items.splice(i, 1); paintList(); } }, "✕")))));
    if (items.length < L.max) add(listBox, h("button", { class: "btn", type: "button", onclick: () => {
      items.push(Object.fromEntries(L.item.map(([k, , t]) => [k, t === "images" ? [] : ""]))); paintList();
      listBox.querySelectorAll(".tv-item")[items.length - 1]?.querySelector("input,textarea")?.focus();
    } }, `+ Add a ${L.noun}`));
    if (!items.length) listBox.prepend(h("p", { class: "muted small" }, `No ${L.noun}s yet — the slide is skipped until there's one.`));
  }
  function paintPhotos() {
    const photos = data.photos = (data.photos || []).map((p) => (typeof p === "string" ? p : p?.src)).filter(Boolean);
    const status = h("span", { class: "muted small" });
    const fileIn = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: async (e) => {
      const files = [...e.target.files]; e.target.value = "";
      for (const [n, f] of files.entries()) {
        status.textContent = `Uploading ${n + 1} of ${files.length}…`;
        try { photos.push(await ctx.api.uploadImage("tv", await shrinkImage(f))); }
        catch (err) { ctx.toast(`Couldn't upload a photo: ${err.message}`, "err"); }
      }
      paintPhotos();
    } });
    add(clear(photoBox), 
      h("div", { class: "tv-photo-grid" }, photos.map((src, i) => h("div", { class: "tv-photo-cell" },
        okImage(src) ? h("img", { src, alt: "", loading: "lazy" }) : h("span", { class: "muted small" }, "?"),
        h("button", { class: "icon-btn small", type: "button", "aria-label": "Remove photo", onclick: () => { photos.splice(i, 1); paintPhotos(); } }, "✕")))),
      h("div", { class: "kb-photo-bar" }, h("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, "📷 Add photos"), status, fileIn));
  }
  async function doSave() {
    const out = { ...data };
    for (const [k, , type] of spec.fields || []) if (type !== "image" && typeof out[k] === "string") out[k] = out[k].trim();
    if (L) {
      const keyField = L.required || L.item[0][0];
      let items = out[L.key].map((it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])))
        .filter((it) => it[keyField]);
      if (id === "happyhour") {
        if (items.some((s) => !s.start || !s.end)) { ctx.toast("Every happy hour needs a start and end time.", "err"); return; }
        if (items.some((s) => s.end <= s.start)) { ctx.toast("A happy hour ends before it starts.", "err"); return; }
        items = items.sort((a, b) => a.start.localeCompare(b.start));
      }
      out[L.key] = L.strings ? items.map((it) => it.text) : items;
    }
    if (id === "community" && out.driveFolder) {
      const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(out.driveFolder) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(out.driveFolder) || /^([A-Za-z0-9_-]{10,})$/.exec(out.driveFolder);
      if (!m) { ctx.toast("That doesn't look like a Google Drive folder link.", "err"); return; }
      out.driveFolder = m[1];
    }
    if (id === "qr") for (const k of ["url", "voteSite", "feudSurvey"]) if (out[k] && !/^https:\/\//.test(out[k])) { ctx.toast("Links need to start with https://", "err"); return; }
    save.disabled = true;
    try { await ctx.api.saveTv(id, out); saved(ctx, sec.name); ctx.navigate(`${ctx.base}/content`); }
    catch (e) { fail(ctx, e); save.disabled = false; }
  }

  add(clear(pane), backTo(ctx), h("h2", { class: "cl-date" }, `${sec.icon} ${sec.name}`),
    spec.note ? h("p", { class: "muted small tv-lead" }, spec.note) : null,
    spec.fields ? h("div", { class: "form tv-form" }, spec.fields.map((f) => field(f[1], input(data, f), f[3]))) : null,
    L ? listBox : null, spec.photos ? [h("h3", { class: "tv-h3" }, "Photos"), photoBox] : null,
    h("div", { class: "cl-edit-actions tv-save" }, h("span", { class: "spacer" }), save));
  if (L) paintList();
  if (spec.photos) paintPhotos();
  return null;
}

/* ======================================================================
   SCREENS (Manage) — slides, order, timing and colors per TV
   ====================================================================== */
function screensView(pane, ctx, store) {
  const cfg = withDefaults("config", store.tv.config);
  const screens = structuredClone(cfg.screens || {});
  const box = h("div", { class: "tv-screens" });
  const save = h("button", { class: "btn primary", type: "button", onclick: doSave }, "Save screens");

  function paint() {
    clear(box);
    const ids = Object.keys(screens).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!ids.length) add(box, h("p", { class: "muted" }, "No TVs set up yet. Until you add one, every TV shows all the slides in green."));
    for (const id of ids) {
      const s = screens[id];
      s.slides = (s.slides || []).map((x) => (typeof x === "string" ? { id: x } : x)).filter((x) => slideById(x.id));
      const onIds = s.slides.map((x) => x.id);
      const rows = [...s.slides.map((x) => ({ ...x, on: true })), ...SLIDES.filter((x) => !onIds.includes(x.id)).map((x) => ({ id: x.id, on: false }))];
      const slideList = h("div", { class: "tv-slide-list" }, rows.map((r) => {
        const pos = s.slides.findIndex((x) => x.id === r.id);
        return h("div", { class: `tv-slide${r.on ? "" : " off"}` },
          h("label", { class: "tv-check" }, h("input", { type: "checkbox", checked: r.on, onchange: (e) => {
            if (e.target.checked) s.slides.push({ id: r.id }); else s.slides = s.slides.filter((x) => x.id !== r.id);
            paint();
          } }), h("span", {}, slideById(r.id).name)),
          r.on ? h("input", { class: "input tv-secs", type: "number", min: "4", max: "120", inputmode: "numeric", placeholder: String(s.seconds || 12), value: r.seconds || "",
            "aria-label": "Seconds", title: "Seconds for this slide (blank = the TV's default)", oninput: (e) => { const v = Number(e.target.value); if (v) s.slides[pos].seconds = v; else delete s.slides[pos].seconds; } }) : null,
          r.on ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Move up", disabled: pos === 0, onclick: () => { s.slides.splice(pos - 1, 0, s.slides.splice(pos, 1)[0]); paint(); } }, "↑") : null,
          r.on ? h("button", { class: "icon-btn small", type: "button", "aria-label": "Move down", disabled: pos === s.slides.length - 1, onclick: () => { s.slides.splice(pos + 1, 0, s.slides.splice(pos, 1)[0]); paint(); } }, "↓") : null);
      }));
      add(box, h("div", { class: "card tv-screen" },
        h("div", { class: "tv-screen-head" },
          h("input", { class: "input tv-screen-name", value: s.name || "", maxlength: "30", placeholder: `TV ${id}`, oninput: (e) => { s.name = e.target.value; } }),
          h("a", { class: "btn small ghost", href: `${BOARD}?tv=${encodeURIComponent(id)}`, target: "_blank", rel: "noopener" }, "Open ↗"),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Remove this TV", onclick: async () => {
            if (!(await confirm(`Remove ${s.name || `TV ${id}`}?`, "That TV will go back to showing every slide.", "Remove"))) return;
            delete screens[id]; paint();
          } }, "✕")),
        h("p", { class: "muted small" }, "Address for this TV: ", h("b", {}, `${location.host}${BOARD}?tv=${id}`)),
        h("div", { class: "tv-two" },
          field("Colors", seg([{ value: "green", label: "🌿 Jungle" }, { value: "orange", label: "🌙 Night" }], s.theme === "orange" ? "orange" : "green", (v) => { s.theme = v; })),
          field("Seconds per slide", h("input", { class: "input", type: "number", min: "4", max: "120", inputmode: "numeric", value: s.seconds || 12, oninput: (e) => { s.seconds = Math.max(4, Math.min(120, Number(e.target.value) || 12)); } }))),
        field("Slides (in order)", slideList, "Slides with nothing to show (no events tonight, no photos…) are skipped automatically.")));
    }
  }
  async function doSave() {
    save.disabled = true;
    try {
      const latest = withDefaults("config", store.tv.config);
      const clean = Object.fromEntries(Object.entries(screens).map(([id, s]) => [id, { name: (s.name || "").trim() || `TV ${id}`, theme: s.theme === "orange" ? "orange" : "green", seconds: Number(s.seconds) || 12, slides: s.slides }]));
      await ctx.api.saveTv("config", { perms: latest.perms || DEFAULT_PERMS, ...latest, screens: clean });
      saved(ctx, "Screens");
    } catch (e) { fail(ctx, e); }
    save.disabled = false;
  }
  add(clear(pane), 
    h("div", { class: "pane-head" }, h("p", { class: "muted" }, "Pick what each TV shows. Each TV opens its own address."),
      h("button", { class: "btn", type: "button", onclick: () => {
        const n = Math.max(0, ...Object.keys(screens).map(Number).filter((x) => !isNaN(x))) + 1;
        screens[String(n)] = { name: `TV ${n}`, theme: "green", seconds: 12, slides: SLIDES.filter((x) => x.id !== "feud").map((x) => ({ id: x.id })) };
        paint();
      } }, "+ Add a TV")),
    box, h("div", { class: "cl-edit-actions tv-save" }, h("span", { class: "spacer" }), save));
  paint();
  return null;
}

/* ======================================================================
   PERMISSIONS (Manage) — which roles may change each part
   ====================================================================== */
function permsView(pane, ctx, store) {
  return () => {
    const s = ctx.session();
    const roles = Object.values(s?.roles || {}).filter((r) => r.id !== "owner").sort((a, b) => (b.rank || 0) - (a.rank || 0));
    const cfg = store.tv.config;
    const perms = cfg ? (cfg.perms || {}) : DEFAULT_PERMS;
    const toggle = async (sec, roleId, on) => {
      const next = { ...perms, [sec]: on ? [...new Set([...(perms[sec] || []), roleId])] : (perms[sec] || []).filter((x) => x !== roleId) };
      try { await ctx.api.saveTv("config", { screens: {}, ...(cfg || {}), perms: next }); ctx.log("Changed TV permissions", `${sectionById(sec).name}: ${roleId} ${on ? "can" : "can't"} change`); }
      catch (e) { fail(ctx, e); }
    };
    add(clear(pane), 
      h("p", { class: "muted tv-lead" }, "Who can change each part of the TVs. Anyone with Manage on TV Screens can always change everything, and a role needs at least Use on TV Screens (Admin → Roles & Access) to get any of these."),
      h("div", { class: "card", style: { padding: 0, overflowX: "auto" } }, h("table", { class: "access-grid tv-perms" },
        h("thead", {}, h("tr", {}, h("th", {}, "Part of the TV"), roles.map((r) => h("th", {}, r.name)))),
        h("tbody", {}, SECTIONS.map((sec) => h("tr", {},
          h("td", {}, h("b", {}, `${sec.icon} ${sec.name}`), h("span", { class: "muted small", style: { display: "block" } }, sec.blurb)),
          roles.map((r) => {
            const lvl = r.perms?.tv || 0;
            if (lvl >= 2) return h("td", { class: "muted small" }, "✓ Always");
            if (lvl < 1) return h("td", { class: "muted small" }, "No TV access");
            const on = (perms[sec.id] || []).includes(r.id);
            return h("td", {}, seg([{ value: true, label: "Can change" }, { value: false, label: "No" }], on, (v) => toggle(sec.id, r.id, v), { small: true }));
          })))))));
  };
}

/* ======================================================================
   IMPORT (Manage) — bring everything over from the old Google Sheets
   ====================================================================== */
function importView(pane, ctx, store) {
  const status = h("div");
  const go = h("button", { class: "btn primary", type: "button", onclick: read }, "Read the Google Sheets");
  add(clear(pane), h("div", { class: "card tv-import" },
    h("h3", {}, "Move from Google Sheets"),
    h("p", { class: "muted" }, "Reads the old TV sheets (schedule, events, staff photos, specials, signature drinks, botanicals, ticker and screens) and shows what it found before anything changes. Pictures stored in Google Drive are copied into the hub, so only Community Photos keep coming from the Drive folder."),
    go, status));

  async function read() {
    go.disabled = true; add(clear(status), h("p", { class: "loading" }, "Reading the sheets…"));
    try {
      const { fetchSheets, convert, copyDrivePictures } = await import("./import.js");
      const { rows, failed } = await fetchSheets();
      const { sections, notes } = convert(rows);
      const names = { crew: "Who's Working", events: "Events", specials: "Drink Specials", signature: "Signature Drinks", products: "Know Your Botanicals", ticker: "Ticker", community: "Community Photos", screens: "Screens" };
      const keys = Object.keys(sections);
      const picked = new Set(keys);
      clear(status);
      if (failed.length) add(status, h("p", { class: "modal-err" }, `Couldn't read: ${failed.join(", ")}. Those parts are left as they are.`));
      if (!keys.length) { add(status, h("p", {}, "Nothing to bring over.")); go.disabled = false; return; }
      add(status, h("ul", { class: "cl-warn-list norm" }, notes.map((n) => h("li", {}, n))),
        h("p", { class: "field-label" }, "Bring over:"),
        h("div", { class: "tv-import-picks" }, keys.map((k) => h("label", { class: "tv-check" },
          h("input", { type: "checkbox", checked: true, onchange: (e) => (e.target.checked ? picked.add(k) : picked.delete(k)) }), h("span", {}, names[k] || k)))),
        h("p", { class: "muted small" }, "This replaces what's in those parts now. Today's crew changes are kept."),
        h("button", { class: "btn primary", type: "button", onclick: async (e) => {
          const btn = e.target; btn.disabled = true;
          try {
            const chosen = Object.fromEntries([...picked].map((k) => [k, sections[k]]));
            const { failed: lost } = await copyDrivePictures(chosen, (url) => ctx.api.copyImage("tv", url),
              (n, total) => { btn.textContent = `Copying pictures ${n} of ${total}…`; });
            btn.textContent = "Saving…";
            const tv = store.tv;
            for (const k of picked) {
              if (k === "screens") await ctx.api.saveTv("config", { perms: DEFAULT_PERMS, ...(tv.config || {}), screens: sections.screens });
              else if (k === "crew") await ctx.api.mergeTv("crew", sections.crew);
              else await ctx.api.saveTv(k, { ...(tv[k] || {}), ...sections[k] });
            }
            ctx.log("Imported from Google Sheets", [...picked].map((k) => names[k] || k).join(", "));
            if (lost.length) {
              btn.textContent = "Imported";
              add(status, h("p", { class: "modal-err" }, `Imported, but these pictures couldn't be copied from Google Drive (add them again by hand): ${lost.join(", ")}.`));
              return;
            }
            ctx.toast("Imported — check the Events and Slides tabs");
            ctx.navigate(ctx.base);
          } catch (err) { fail(ctx, err); btn.disabled = false; btn.textContent = "Import"; }
        } }, "Import"));
    } catch (e) { add(clear(status), h("p", { class: "modal-err" }, e.message || "Couldn't read the sheets.")); }
    go.disabled = false;
  }
  return null;
}
