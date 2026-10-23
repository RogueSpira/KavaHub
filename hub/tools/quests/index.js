// Side Quests: jobs that aren't part of the daily lists (deep cleans, organizing, the spots we never get to).
//   #/tool/quests            the board — sign off a quest with a note and a photo
//   #/tool/quests/leaders    leaderboard
//   #/tool/quests/mine       your sign-offs and stars
//   #/tool/quests/review     Manage: approve or send back sign-offs
//   #/tool/quests/edit       Manage: add, change, close quests
// Each approved sign-off earns the quest's stars (1 unless set higher). Every 5 blue stars become 1 green star.
// A quest can be set to unlock on a date; until then it shows as "Coming up" and can't be signed off.
import { h, clear, modal, confirm, field, seg, timeAgo } from "../../js/ui.js";
import { shrinkImage } from "../../js/images.js";
import { businessKey, dateOfKey } from "../../js/tv-shared.js";

const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
const GREEN_EVERY = 5;

export function mount(el, ctx) {
  const manage = ctx.level >= 2;
  const view = ctx.sub[0] || "board";
  let quests = null, subs = null, failed = false, people = null, period = "month";
  const pane = h("section", { class: "pane" });
  const nav = h("nav", { class: "tabs", role: "tablist" });
  add(el, nav, pane);

  const views = { board, leaders: board, mine, review: manage ? review : null, stars: manage ? starsView : null, edit: manage ? editor : null };
  const paintView = (views[view] || board)();
  function paintNav() {
    const pending = (subs || []).filter((s) => s.status === "pending").length;
    const tabs = [["board", "Quests & Leaderboard"], ["mine", "My stars"]];
    if (manage) tabs.push(["review", pending ? `Review (${pending})` : "Review"], ["stars", "Stars"], ["edit", "Edit quests"]);
    clear(nav);
    for (const [id, label] of tabs) add(nav, h("button", { type: "button", role: "tab", "aria-selected": String(view === id),
      class: `tab${view === id || (id === "board" && view === "leaders") ? " on" : ""}${id === "review" && pending ? " sq-tab-alert" : ""}`,
      onclick: () => ctx.navigate(id === "board" ? ctx.base : `${ctx.base}/${id}`) }, label));
  }
  const repaint = () => { paintNav(); paintView(); };
  repaint();
  const stops = [
    ctx.api.watchQuests((list, err) => { if (err) failed = true; quests = list || []; repaint(); }),
    ctx.api.watchQuestSubs((list, err) => { if (err) failed = true; subs = list || []; repaint(); }),
    // Managers get the full staff list so they can give stars to anyone.
    manage ? ctx.api.watchUsers((list) => { people = (list || []).filter((u) => u.active !== false); repaint(); }) : () => {},
  ];
  return () => stops.forEach((s) => s());

  /* ---------- shared bits ---------- */
  function notReady() {
    if (failed) { add(clear(pane), h("p", { class: "modal-err" }, "Couldn't load Side Quests. The database rules may need updating.")); return true; }
    if (!quests || !subs) { add(clear(pane), h("p", { class: "loading" }, "Loading…")); return true; }
    return false;
  }
  // (function declarations, not consts: they're used by the first paint above, before this point runs)
  function isLocked(q) { return !!q.unlockOn && q.unlockOn > businessKey(); }
  function unlockLabel(q) { return dateOfKey(q.unlockOn).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); }
  function myUid() { return ctx.session()?.uid; }
  function myName() { return ctx.session()?.me?.name; }

  /* =========================== BOARD =========================== */
  function board() {
    return () => {
      if (notReady()) return;
      const open = quests.filter((q) => q.open);
      const ready = open.filter((q) => !isLocked(q)), locked = open.filter(isLocked).sort((a, b) => a.unlockOn.localeCompare(b.unlockOn));
      add(clear(pane), h("div", { class: "sq-split" },
        h("div", { class: "sq-col-quests" },
          h("h3", { class: "sq-h" }, "🗺️ Side Quests"),
          ready.length ? h("div", { class: "sq-list" }, ready.map(questCard))
            : h("div", { class: "card empty-card" }, h("p", {}, "No side quests right now."), manage ? h("button", { class: "btn primary", type: "button", onclick: () => ctx.navigate(`${ctx.base}/edit`) }, "Add quests") : null),
          locked.length ? [h("h3", { class: "tv-h3" }, "🔒 Coming up"), h("div", { class: "sq-list" }, locked.map(questCard))] : null),
        leaderPanel()));
    };
  }
  function questCard(q) {
    const mine = subs.find((s) => s.questId === q.id && s.uid === myUid() && s.status === "pending");
    const other = !q.repeat && subs.find((s) => s.questId === q.id && s.status === "pending" && s.uid !== myUid());
    const last = subs.find((s) => s.questId === q.id && s.status === "approved");
    const locked = isLocked(q);
    let action;
    if (locked) action = h("span", { class: "chip chip-soon" }, `Unlocks ${unlockLabel(q)}`);
    else if (mine) action = h("div", { class: "sq-actions" }, h("span", { class: "chip chip-soon" }, "Waiting for approval"),
      h("button", { class: "btn small ghost", type: "button", onclick: () => withdraw(mine) }, "Take back"));
    else if (other) action = h("span", { class: "muted small" }, `${other.name} is waiting on approval`);
    else action = h("button", { class: "btn primary", type: "button", onclick: () => signOff(q) }, "✓ I did it");
    return h("article", { class: `card sq-quest${locked ? " locked" : ""}` },
      h("div", { class: "sq-quest-main" },
        h("div", { class: "sq-quest-title" }, q.title, worthChip(q.stars), q.repeat ? h("span", { class: "chip chip-ok" }, "Repeats") : null),
        q.details ? h("p", { class: "sq-quest-details" }, q.details) : null,
        q.repeat && last ? h("p", { class: "muted small" }, `Last done by ${last.name} · ${timeAgo(last.at)}`) : null),
      action);
  }
  async function withdraw(s) {
    if (!(await confirm("Take back this sign-off?", "It comes off the review list. You can sign off again later.", "Take back"))) return;
    try { await ctx.api.withdrawQuestSub(s.id); ctx.toast("Taken back"); } catch (e) { ctx.toast(e.message, "err"); }
  }
  async function signOff(q) {
    let photo = "", uploading = false;
    const note = h("textarea", { class: "input textarea", rows: "3", maxlength: "500", placeholder: "Anything worth knowing? (optional)" });
    const pic = h("div", { class: "sq-photo" });
    const status = h("span", { class: "muted small" });
    const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      uploading = true; status.textContent = "Uploading photo…";
      try { photo = await ctx.api.uploadImage("quests", await shrinkImage(f)); status.textContent = ""; }
      catch (err) { status.textContent = `Couldn't upload: ${err.message}`; }
      uploading = false; paintPic();
    } });
    function paintPic() {
      add(clear(pic), photo ? h("img", { class: "sq-photo-img", src: photo, alt: "" }) : null,
        h("div", { class: "sq-photo-btns" }, h("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, photo ? "Retake" : "📷 Add a photo"),
          photo ? h("button", { class: "btn ghost small", type: "button", onclick: () => { photo = ""; paintPic(); } }, "Remove") : null, status), fileIn);
    }
    paintPic();
    await modal({ title: q.title, body: h("div", { class: "form" },
      q.details ? h("p", { class: "muted" }, q.details) : null,
      field("Photo", pic, `Show it off. A manager will check it before you get your ${worth(q.stars) > 1 ? `${worth(q.stars)} stars` : "star"}.`), field("Note", note)),
    actions: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Sign off", kind: "primary", onClick: async () => {
      if (uploading) throw new Error("Wait for the photo to finish uploading.");
      await ctx.api.submitQuest(ctx.session(), q, { note: note.value.trim(), photo });
      ctx.log("Signed off side quest", q.title); ctx.toast("Sent for approval ⭐");
      return true;
    } }] });
  }

  /* =========================== LEADERBOARD (beside the quests) =========================== */
  function leaderPanel() {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const by = new Map();
    for (const s of subs) {
      if (s.status !== "approved" || (period === "month" && !(s.at && s.at >= monthStart))) continue;
      const r = by.get(s.uid) || { uid: s.uid, name: s.name, n: 0 };
      r.n += starValue(s); by.set(s.uid, r);
    }
    const rows = [...by.values()].filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const medal = ["🥇", "🥈", "🥉"];
    let place = 0, prev = null;
    return h("aside", { class: "card sq-leaders" },
      h("div", { class: "sq-leaders-head" }, h("h3", { class: "sq-h" }, "🏆 Leaderboard"),
        seg([{ value: "month", label: "This month" }, { value: "all", label: "All time" }], period, (v) => { period = v; paintView(); }, { small: true })),
      rows.length ? h("div", { class: "sq-board" }, rows.map((r, i) => {
        if (r.n !== prev) { place = i + 1; prev = r.n; }
        const st = starsFor(r.n);
        const attrs = { class: `sq-row${r.uid === myUid() ? " me" : ""}${place === 1 ? " first" : ""}` };
        const kids = [h("span", { class: "sq-place" }, medal[place - 1] || `#${place}`),
          h("span", { class: "sq-name" }, r.name), st.el, h("span", { class: "sq-total" }, r.n)];
        return manage ? h("button", { type: "button", ...attrs, title: `Give ${r.name} stars`, onclick: () => giveStars(r.uid) }, kids) : h("div", attrs, kids);
      })) : h("p", { class: "muted small sq-empty" }, period === "month" ? "No stars yet this month. First one takes the lead!" : "No stars yet."),
      h("p", { class: "muted small sq-rule" }, `Finish a quest, earn its stars. Every ${GREEN_EVERY} blue ★ turn into a green ★.`),
      manage ? h("div", { class: "sq-actions" },
        h("button", { class: "btn small", type: "button", onclick: () => giveStars(null) }, "＋ Give or take stars"),
        h("button", { class: "btn small ghost", type: "button", onclick: () => ctx.navigate(`${ctx.base}/stars`) }, "Edit everyone's stars")) : null);
  }
  // Manage: add (or take away) stars by hand, with a reason everyone sees in their history.
  // Everyone who can get stars: the staff list (Manage), plus anyone who already has stars.
  function roster() {
    const known = new Map((people || []).map((u) => [u.uid, u.name]));
    for (const s of subs || []) if (!known.has(s.uid)) known.set(s.uid, s.name);
    return [...known].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function totalFor(uid) { return Math.max(0, (subs || []).filter((s) => s.uid === uid).reduce((t, s) => t + starValue(s), 0)); }
  // Quick add/remove for one person (from the leaderboard): type any amount.
  async function giveStars(uid) {
    const list = roster();
    if (!list.length) { ctx.toast("No one to give stars to yet.", "err"); return; }
    const who = h("select", { class: "input" }, list.map((p) => h("option", { value: p.uid, selected: p.uid === uid }, p.name)));
    const amount = h("input", { class: "input sq-amount", type: "number", inputmode: "numeric", min: "1", max: "500", value: "", placeholder: "0" });
    const now = h("span", { class: "muted small" });
    const showNow = () => { now.textContent = `Has ${totalFor(who.value)} ★ now`; };
    who.addEventListener("change", showNow); showNow();
    const bump = (d) => { amount.value = String(Math.max(0, Math.min(500, (parseInt(amount.value, 10) || 0) + d))); };
    const reason = h("input", { class: "input", maxlength: "100", placeholder: "e.g. Stars from the whiteboard" });
    const go = async (sign) => {
      const n = parseInt(amount.value, 10);
      if (!(n >= 1 && n <= 500)) throw new Error("Enter a number from 1 to 500.");
      const p = list.find((x) => x.uid === who.value);
      if (sign < 0 && n > totalFor(p.uid)) throw new Error(`${p.name} only has ${totalFor(p.uid)} ★.`);
      await saveChange(p, sign * n, reason.value.trim());
      return true;
    };
    await modal({ title: "Give or take stars", body: h("div", { class: "form" },
      field("Who", who), now,
      field("How many", h("div", { class: "sq-stepper" },
        h("button", { class: "icon-btn", type: "button", "aria-label": "Less", onclick: () => bump(-1) }, "−"), amount,
        h("button", { class: "icon-btn", type: "button", "aria-label": "More", onclick: () => bump(1) }, "+"),
        [5, 10, 25].map((n) => h("button", { class: "btn small ghost", type: "button", onclick: () => bump(n) }, `+${n}`)))),
      field("Reason (optional)", reason, "They'll see this in My stars.")),
    wide: true,
    actions: [{ label: "Cancel", kind: "ghost", value: false },
      { label: "− Take away", kind: "danger", onClick: () => go(-1) },
      { label: "+ Add stars", kind: "primary", onClick: () => go(1) }] });
  }
  async function saveChange(p, diff, reason) {
    await ctx.api.giveStars(ctx.session(), { uid: p.uid, name: p.name, stars: diff, reason: reason || (diff > 0 ? "Stars added by a manager" : "Stars taken away by a manager") });
    ctx.log(diff > 0 ? "Gave stars" : "Took stars", `${p.name}: ${diff > 0 ? "+" : ""}${diff}${reason ? ` (${reason})` : ""}`);
    ctx.toast(diff > 0 ? `+${diff} ★ for ${p.name}` : `${diff} ★ for ${p.name}`);
  }

  /* =========================== STARS (Manage): the whiteboard =========================== */
  // Everyone in a fixed A–Z list with their total. Change the number (type it or use − / +),
  // then save once. Nothing moves around while you edit.
  function starsView() {
    const draft = new Map(); // uid -> new total
    let reason = "", saving = false;
    const paint = () => {
      if (notReady()) return;
      // Don't redraw under someone's fingers while they're typing a number.
      if (pane.contains(document.activeElement) && document.activeElement.tagName === "INPUT") { pane.dataset.stale = "1"; return; }
      const list = roster();
      const changes = list.filter((p) => draft.has(p.uid) && draft.get(p.uid) !== totalFor(p.uid));
      const reasonIn = h("input", { class: "input", maxlength: "100", value: reason, placeholder: "Reason (optional), e.g. Moved over from the whiteboard", oninput: (e) => { reason = e.target.value; } });
      const save = h("button", { class: "btn primary", type: "button", disabled: !changes.length || saving, onclick: doSave },
        changes.length ? `Save changes (${changes.length})` : "No changes");
      add(clear(pane),
        h("p", { class: "muted tv-lead" }, "Set each person's total (all time). Type the new number or use − and +, then save."),
        list.length ? h("div", { class: "card sq-wb" }, list.map((p) => {
          const cur = totalFor(p.uid), val = draft.has(p.uid) ? draft.get(p.uid) : cur, diff = val - cur;
          const input = h("input", { class: "input sq-wb-input", type: "number", inputmode: "numeric", min: "0", max: "9999", value: String(val), "aria-label": `${p.name}'s stars`,
            oninput: (e) => { const v = parseInt(e.target.value, 10); if (v >= 0) draft.set(p.uid, v); else draft.delete(p.uid); },
            onchange: () => { delete pane.dataset.stale; paint(); },
            onblur: () => { if (pane.dataset.stale) { delete pane.dataset.stale; setTimeout(paint, 0); } } });
          const step = (d) => { draft.set(p.uid, Math.max(0, val + d)); paint(); };
          return h("div", { class: `sq-wb-row${diff ? " changed" : ""}` },
            h("span", { class: "sq-wb-name" }, p.name),
            starsFor(cur).el,
            h("span", { class: "sq-wb-cur muted" }, `${cur} now`),
            h("div", { class: "sq-stepper" },
              h("button", { class: "icon-btn", type: "button", "aria-label": "One less", disabled: val <= 0, onclick: () => step(-1) }, "−"),
              input,
              h("button", { class: "icon-btn", type: "button", "aria-label": "One more", onclick: () => step(1) }, "+")),
            h("span", { class: `sq-wb-diff${diff > 0 ? " up" : diff < 0 ? " down" : ""}` }, diff ? `${diff > 0 ? "+" : ""}${diff}` : ""));
        })) : h("p", { class: "muted empty" }, "No one on the staff list yet."),
        h("div", { class: "sq-wb-bar" }, reasonIn,
          changes.length ? h("button", { class: "btn ghost", type: "button", onclick: () => { draft.clear(); paint(); } }, "Undo changes") : null, save));
    };
    async function doSave() {
      const list = roster().filter((p) => draft.has(p.uid) && draft.get(p.uid) !== totalFor(p.uid));
      if (!list.length) return;
      saving = true; paint();
      try {
        for (const p of list) await saveChange(p, draft.get(p.uid) - totalFor(p.uid), reason.trim());
        draft.clear(); reason = "";
      } catch (e) { ctx.toast(e.message || "Couldn't save.", "err"); }
      saving = false; paint();
    }
    return paint;
  }

  /* =========================== MY STARS =========================== */
  function mine() {
    return () => {
      if (notReady()) return;
      const my = subs.filter((s) => s.uid === myUid());
      const n = Math.max(0, my.reduce((t, s) => t + starValue(s), 0));
      const st = starsFor(n);
      add(clear(pane),
        h("div", { class: "card sq-me big" }, h("span", {}, myName()), st.el, h("span", { class: "muted small" }, `${n} star${n === 1 ? "" : "s"} · ${GREEN_EVERY - (n % GREEN_EVERY)} more for your next green ★`)),
        my.length ? h("div", { class: "sq-list" }, my.map((s) => h("div", { class: "card sq-sub" },
          s.photo ? h("img", { class: "sq-thumb", src: s.photo, alt: "", onclick: () => bigPhoto(s) }) : null,
          h("div", { class: "sq-quest-main" },
            h("div", { class: "sq-quest-title" }, s.kind === "manual" ? `🎁 ${s.questTitle}` : s.questTitle),
            h("span", { class: "muted small" }, s.kind === "manual" ? `From ${s.reviewedBy} · ${timeAgo(s.at)}` : timeAgo(s.at)),
            s.status === "rejected" && s.reviewNote ? h("p", { class: "sq-review-note" }, `${s.reviewedBy}: ${s.reviewNote}`) : null),
          statusChip(s)))) : h("p", { class: "muted empty" }, "Nothing signed off yet. Check the Quests tab!"));
    };
  }
  function statusChip(s) {
    if (s.kind === "manual") return h("span", { class: `chip ${s.stars < 0 ? "chip-off" : "chip-ok"}` }, `${s.stars > 0 ? "+" : ""}${s.stars} ★`);
    if (s.status === "approved") return h("span", { class: "chip chip-ok" }, `${"★".repeat(Math.min(worth(s.stars), 5))} Approved`);
    if (s.status === "rejected") return h("span", { class: "chip chip-off" }, "Not yet");
    return h("span", { class: "chip chip-soon" }, "Waiting");
  }

  /* =========================== REVIEW (Manage) =========================== */
  function review() {
    return () => {
      if (notReady()) return;
      const pending = subs.filter((s) => s.status === "pending").sort((a, b) => a.at - b.at);
      const recent = subs.filter((s) => s.status !== "pending" && s.reviewedAt).sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 10);
      add(clear(pane),
        pending.length ? h("div", { class: "sq-list" }, pending.map((s) => {
          const q = quests.find((x) => x.id === s.questId);
          return h("article", { class: "card sq-review" },
            s.photo ? h("img", { class: "sq-review-img", src: s.photo, alt: "", onclick: () => bigPhoto(s) }) : h("div", { class: "sq-review-img none" }, "No photo"),
            h("div", { class: "sq-quest-main" },
              h("div", { class: "sq-quest-title" }, s.questTitle, worthChip(s.stars)),
              h("span", { class: "muted small" }, `${s.name} · ${timeAgo(s.at)}`),
              s.note ? h("p", { class: "sugg-quote" }, s.note) : null,
              h("div", { class: "sq-actions" },
                h("button", { class: "btn primary", type: "button", onclick: () => decide(s, q, "approved") }, "★ Approve"),
                h("button", { class: "btn ghost", type: "button", onclick: () => decide(s, q, "rejected") }, "Not yet"))));
        })) : h("div", { class: "card empty-card" }, h("p", {}, "Nothing waiting for review. 🎉")),
        recent.length ? h("details", { class: "sq-recent" }, h("summary", {}, "Recently reviewed & stars given (change or undo)"), h("div", { class: "rows" }, recent.map((s) => h("div", { class: "row" },
          h("span", { class: "row-main" }, h("span", { class: "row-title" }, `${s.name} — ${s.kind === "manual" ? `🎁 ${s.questTitle}` : s.questTitle}`),
            h("span", { class: "row-sub" }, `${s.kind === "manual" ? "Given" : s.status === "approved" ? "Approved" : "Sent back"} by ${s.reviewedBy} · ${timeAgo(s.reviewedAt)}`)),
          statusChip(s),
          s.kind === "manual"
            ? h("button", { class: "btn small ghost", type: "button", onclick: async () => {
              if (!(await confirm("Undo these stars?", `${s.name} loses the ${s.stars > 0 ? "+" : ""}${s.stars} ★ from “${s.questTitle}”.`, "Undo"))) return;
              try { await ctx.api.withdrawQuestSub(s.id); ctx.log("Undid stars", `${s.name}: ${s.questTitle}`); ctx.toast("Undone"); } catch (e) { ctx.toast(e.message, "err"); }
            } }, "Undo")
            : h("button", { class: "btn small ghost", type: "button", onclick: () => decide(s, quests.find((x) => x.id === s.questId), s.status === "approved" ? "rejected" : "approved") },
              s.status === "approved" ? "Change to Not yet" : "Change to Approved"))))) : null);
    };
  }
  async function decide(s, q, status) {
    let reviewNote = "";
    if (status === "rejected") {
      const why = h("textarea", { class: "input textarea", rows: "3", maxlength: "300", placeholder: "What still needs doing? (optional — they'll see this)" });
      const ok = await modal({ title: `Send back to ${s.name}?`, body: h("div", { class: "form" }, field("Reason", why)),
        actions: [{ label: "Cancel", kind: "ghost", value: false }, { label: "Send back", kind: "primary", value: true }] });
      if (ok !== true) return;
      reviewNote = why.value.trim();
    }
    try {
      // Approving a one-time quest takes it off the board.
      await ctx.api.reviewQuestSub(ctx.session(), s, { status, reviewNote, closeQuest: status === "approved" && q && !q.repeat && q.open });
      ctx.log(status === "approved" ? "Approved side quest" : "Sent back side quest", `${s.name}: ${s.questTitle}`);
      ctx.toast(status === "approved" ? `${"★".repeat(Math.min(worth(s.stars), 5))} for ${s.name}!` : `Sent back to ${s.name}`);
    } catch (e) { ctx.toast(e.message || "Couldn't save.", "err"); }
  }
  function bigPhoto(s) {
    modal({ title: `${s.name} — ${s.questTitle}`, wide: true, body: h("img", { class: "sq-big", src: s.photo, alt: "" }) });
  }

  /* =========================== EDIT QUESTS (Manage) =========================== */
  function editor() {
    return () => {
      if (notReady()) return;
      const sorted = [...quests].sort((a, b) => Number(b.open) - Number(a.open) || (a.unlockOn || "").localeCompare(b.unlockOn || "") || a.title.localeCompare(b.title));
      add(clear(pane),
        h("div", { class: "pane-head" }, h("p", { class: "muted" }, "One-time quests come off the board once approved. Repeating ones stay up."),
          h("button", { class: "btn primary", type: "button", onclick: () => editQuest(null) }, "+ New quest")),
        sorted.length ? h("div", { class: "rows" }, sorted.map((q) => {
          const done = subs.filter((s) => s.questId === q.id && s.status === "approved").length;
          return h("button", { type: "button", class: `row${q.open ? "" : " row-off"}`, onclick: () => editQuest(q) },
            h("span", { class: "row-main" },
              h("span", { class: "row-title" }, q.title,
                worthChip(q.stars), q.repeat ? h("span", { class: "chip chip-ok" }, "Repeats") : null,
                !q.open ? h("span", { class: "chip chip-off" }, done ? "Done" : "Closed") : null,
                q.open && isLocked(q) ? h("span", { class: "chip chip-soon" }, `Unlocks ${unlockLabel(q)}`) : null),
              h("span", { class: "row-sub" }, [q.details, done ? `${done}× approved` : ""].filter(Boolean).join(" · "))),
            h("span", { class: "row-go" }, "›"));
        })) : h("p", { class: "muted empty" }, "No quests yet."));
    };
  }
  async function editQuest(q) {
    const title = h("input", { class: "input", maxlength: "120", value: q?.title || "", placeholder: "e.g. Deep clean the walk-in fridge" });
    const details = h("textarea", { class: "input textarea", rows: "3", maxlength: "1000", placeholder: "What 'done' looks like (optional)" }, q?.details || "");
    const unlock = h("input", { class: "input", type: "date", value: q?.unlockOn || "" });
    let repeat = !!q?.repeat, open = q ? q.open : true, stars = worth(q?.stars);
    const actions = [];
    if (q) actions.push({ label: "Delete", kind: "ghost", onClick: async () => {
      if (!(await confirm(`Delete “${q.title}”?`, "It comes off the board. Stars already earned stay.", "Delete"))) return false;
      await ctx.api.deleteQuest(q.id); ctx.log("Deleted side quest", q.title); ctx.toast("Quest deleted");
      return true;
    } });
    actions.push({ label: "Cancel", kind: "ghost", value: false }, { label: q ? "Save" : "Add quest", kind: "primary", onClick: async () => {
      const t = title.value.trim();
      if (!t) throw new Error("Give the quest a name.");
      await ctx.api.saveQuest(ctx.session(), q?.id, { title: t, details: details.value.trim(), repeat, open, stars, unlockOn: unlock.value || "" });
      ctx.log(q ? "Edited side quest" : "Added side quest", t); ctx.toast(q ? "Saved" : "Quest added");
      return true;
    } });
    await modal({ title: q ? "Edit quest" : "New quest", body: h("div", { class: "form" },
      field("Quest", title), field("Details", details),
      field("Worth", seg([1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} ★` })), stars, (v) => { stars = v; }), "Harder jobs can be worth more. Most are 1."),
      field("Type", seg([{ value: false, label: "One time" }, { value: true, label: "Repeats" }], repeat, (v) => { repeat = v; }),
        "One time: off the board once approved. Repeats: stays up and can earn stars again and again."),
      field("Unlocks on (optional)", unlock, "Shows as “Coming up” until this date, e.g. taking down holiday decorations. Leave blank to open now."),
      field("On the board", seg([{ value: true, label: "Open" }, { value: false, label: "Closed", cls: "danger" }], open, (v) => { open = v; }))),
    actions });
  }
}

// How many stars a record is worth: the quest's stars when it was signed off (1 for older ones);
// a hand-given entry = its own number (can be negative).
export const starValue = (s) => (s.status !== "approved" ? 0 : Number.isInteger(s.stars) ? s.stars : 1);
// A quest's worth: 1–5 stars, 1 if not set.
export const worth = (n) => (Number.isInteger(n) && n >= 1 ? Math.min(n, 5) : 1);
// Small "★★★" tag for quests worth more than 1.
export const worthChip = (n) => (worth(n) > 1 ? h("span", { class: "chip sq-worth" }, `${"★".repeat(worth(n))} ${worth(n)} stars`) : null);

// Stars: blue ★ for each one earned; every 5 blue become 1 green ★.
export function starsFor(n) {
  const green = Math.floor(n / GREEN_EVERY), blue = n % GREEN_EVERY;
  const el = h("span", { class: "sq-stars", "aria-label": `${green} green stars and ${blue} blue stars` },
    green > 6 ? [h("span", { class: "star green" }, "★"), h("span", { class: "star-x" }, `×${green}`)] : Array.from({ length: green }, () => h("span", { class: "star green" }, "★")),
    Array.from({ length: blue }, () => h("span", { class: "star blue" }, "★")),
    !n ? h("span", { class: "star empty" }, "☆") : null);
  return { el, green, blue };
}
