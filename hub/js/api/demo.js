// Demo backend: same functions as firebase.js, but everything lives in memory.
// Used while firebaseConfig is empty (or with ?demo in the URL) so the hub can be
// previewed and clicked through without a Firebase project. Nothing is saved.
//
// Sample PINs:  Rogue (Owner) 2580 · Josh (Manager) 3690 · Daniel 1357 · Wheatyn 2468
// Add ?demo=fresh to the URL to see the first-time setup screen instead.
import { LOCATION_ID } from "../config.js";

export const mode = "demo";
const fresh = new URLSearchParams(location.search).get("demo") === "fresh";
const now = () => new Date();
let seq = 1;
const id = (p) => `${p}-${(seq++).toString(36)}`;

const ROLES = {
  owner: { id: "owner", name: "Owner", rank: 100, system: true, perms: {} },
  manager: { id: "manager", name: "Manager", rank: 50, system: false, perms: { tv: 2, checklists: 2, knowledge: 2, suggestions: 2, admin: 0 } },
  kavatender: { id: "kavatender", name: "Kavatender", rank: 10, system: false, perms: { tv: 1, checklists: 1, knowledge: 1, suggestions: 1, admin: 0 } },
};
const store = {
  location: fresh ? null : { id: LOCATION_ID, name: "Kava & Co. Mandarin", setupDone: true, settings: { autoLockSeconds: 120 } },
  roles: fresh ? {} : structuredClone(ROLES),
  tools: fresh ? {} : Object.fromEntries(["tv", "checklists", "knowledge", "suggestions", "admin"].map((t, i) => [t, { enabled: true, order: i }])),
  users: {},
  pins: {}, // pin -> uid  (demo only; the real backend never stores PINs)
  activity: [],
};
function addUser(name, roleId, pin) {
  const uid = id("u");
  store.users[uid] = { uid, name, roleId, active: true, overrides: {}, createdAt: now(), lastLoginAt: null };
  store.pins[pin] = uid;
  return uid;
}
if (!fresh) {
  addUser("Rogue", "owner", "2580");
  addUser("Josh", "manager", "3690");
  addUser("Daniel", "kavatender", "1357");
  addUser("Wheatyn", "kavatender", "2468");
  store.activity.push({ id: id("a"), at: now(), actorName: "System", tool: "admin", action: "Demo data loaded", detail: "" });
}

/* ---------- tiny change-notification system ---------- */
const subs = new Set();
const changed = () => setTimeout(() => subs.forEach((f) => f()), 0);
const watch = (fn) => { subs.add(fn); fn(); return () => subs.delete(fn); };
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

let currentUid = null;
const me = () => store.users[currentUid];
const rankOf = (roleId) => (roleId === "owner" ? 1000 : store.roles[roleId]?.rank ?? 0);
function requireAdmin() {
  const u = me();
  if (!u || !u.active) throw new Error("Please sign in again.");
  const lvl = u.roleId === "owner" ? 2 : (u.overrides.admin ?? store.roles[u.roleId]?.perms.admin ?? 0);
  if (lvl < 2) throw new Error("You don't have access to administration.");
  return { u, isOwner: u.roleId === "owner", rank: rankOf(u.roleId) };
}
function checkPin(pin) {
  const p = String(pin ?? "");
  if (!/^\d{4}$/.test(p)) throw new Error("PIN must be exactly 4 digits.");
  if (/^(\d)\1+$/.test(p)) throw new Error("PIN can't be all the same digit.");
  if ("0123456789".includes(p) || "9876543210".includes(p)) throw new Error("PIN can't be a straight run like 1234.");
  return p;
}
function cleanName(n) {
  n = String(n || "").trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Name is required.");
  if (n.length > 40) throw new Error("Name is too long (40 characters max).");
  return n;
}
function addActivity(tool, action, detail = "") {
  const u = me();
  store.activity.unshift({ id: id("a"), at: now(), actorUid: u?.uid, actorName: u?.name || "System", tool, action, detail });
  changed();
}

/* ---------- auth ---------- */
export async function setupStatus() { await wait(150); return { needsSetup: !store.location }; }
export async function setupOwner({ setupCode, name, pin }) {
  await wait();
  if (!setupCode) throw new Error("That setup code isn't right.");
  if (store.location) throw new Error("This location is already set up.");
  checkPin(pin);
  store.location = { id: LOCATION_ID, name: "Kava & Co. Mandarin", setupDone: true, settings: { autoLockSeconds: 120 } };
  store.roles = structuredClone(ROLES);
  store.tools = Object.fromEntries(["tv", "checklists", "knowledge", "suggestions", "admin"].map((t, i) => [t, { enabled: true, order: i }]));
  currentUid = addUser(cleanName(name), "owner", pin);
  addActivity("admin", "Set up location", `Owner: ${name}`);
}
export async function login(pin) {
  await wait(300);
  const uid = store.pins[pin];
  if (!uid || !store.users[uid].active) throw new Error("That PIN didn't work.");
  store.users[uid].lastLoginAt = now();
  currentUid = uid;
  changed();
}
export async function logout() { currentUid = null; changed(); }

export function onSession(cb) {
  return watch(() => {
    const u = me();
    if (!u) return cb(null);
    if (!u.active) { currentUid = null; return cb(null); }
    cb(structuredClone({
      uid: u.uid, me: u, role: store.roles[u.roleId], roles: store.roles,
      tools: store.tools, location: store.location,
    }));
  });
}

/* ---------- people ---------- */
export function watchUsers(cb) {
  return watch(() => cb(structuredClone(Object.values(store.users).sort((a, b) => a.name.localeCompare(b.name)))));
}
export async function createUser({ name, roleId, pin }) {
  await wait();
  const c = requireAdmin();
  name = cleanName(name);
  if (!store.roles[roleId]) throw new Error("Pick a role.");
  if (!c.isOwner && rankOf(roleId) >= c.rank) throw new Error("You can only add people below your own role.");
  checkPin(pin);
  if (store.pins[pin]) throw new Error("That PIN is already in use. Pick a different one.");
  addUser(name, roleId, pin);
  addActivity("admin", "Added person", `${name} (${roleId})`);
}
export async function updateUser(uid, patch) {
  await wait();
  const c = requireAdmin();
  const t = store.users[uid];
  if (!t) throw new Error("That person wasn't found.");
  if (!c.isOwner && rankOf(t.roleId) >= c.rank) throw new Error("You can't change someone at or above your role.");
  const losingOwner = t.roleId === "owner" && t.active && ((patch.roleId && patch.roleId !== "owner") || patch.active === false);
  if (losingOwner && Object.values(store.users).filter((u) => u.roleId === "owner" && u.active).length <= 1) {
    throw new Error("There has to be at least one active Owner.");
  }
  if (uid === currentUid && patch.active === false) throw new Error("You can't deactivate yourself.");
  if (patch.name !== undefined) t.name = cleanName(patch.name);
  if (patch.roleId !== undefined) t.roleId = patch.roleId;
  if (patch.active !== undefined) t.active = !!patch.active;
  if (patch.overrides !== undefined) t.overrides = Object.fromEntries(Object.entries(patch.overrides).filter(([, v]) => v !== null));
  addActivity("admin", "Updated person", t.name);
}
export async function resetPin(uid, pin) {
  await wait();
  requireAdmin();
  checkPin(pin);
  if (store.pins[pin] && store.pins[pin] !== uid) throw new Error("That PIN is already in use. Pick a different one.");
  for (const [p, u] of Object.entries(store.pins)) if (u === uid) delete store.pins[p];
  store.pins[pin] = uid;
  addActivity("admin", "Reset PIN", store.users[uid].name);
}

export async function revealPin(uid) {
  await wait(200);
  const c = requireAdmin();
  const t = store.users[uid];
  if (!t) throw new Error("That person wasn't found.");
  if (!c.isOwner && rankOf(t.roleId) >= c.rank && uid !== currentUid) throw new Error("You can't view the PIN of someone at or above your role.");
  const pin = Object.entries(store.pins).find(([, u]) => u === uid)?.[0];
  if (!pin) throw new Error("No PIN on file for this person. Use Reset PIN to set one.");
  addActivity("admin", "Viewed PIN", t.name);
  return pin;
}

/* ---------- roles ---------- */
export async function saveRole(roleId, { name, perms }) {
  await wait(120);
  if (me()?.roleId !== "owner" || roleId === "owner") throw new Error("Only an Owner can change roles.");
  Object.assign(store.roles[roleId], { name, perms });
  changed();
}
export async function createRole(name, rank) {
  await wait();
  if (me()?.roleId !== "owner") throw new Error("Only an Owner can change roles.");
  name = cleanName(name);
  const rid = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (store.roles[rid]) throw new Error("A role with that name already exists.");
  store.roles[rid] = { id: rid, name, rank: Math.max(1, Math.min(99, rank | 0 || 20)), system: false, perms: {} };
  addActivity("admin", "Added role", name);
  return { id: rid };
}
export async function deleteRole(roleId) {
  await wait();
  if (me()?.roleId !== "owner") throw new Error("Only an Owner can change roles.");
  if (Object.values(store.users).some((u) => u.roleId === roleId)) throw new Error("Move everyone off this role before deleting it.");
  const n = store.roles[roleId]?.name;
  delete store.roles[roleId];
  addActivity("admin", "Deleted role", n);
}

/* ---------- tiles & settings ---------- */
export async function saveTool(toolId, cfg) { await wait(80); requireAdmin(); store.tools[toolId] = { enabled: !!cfg.enabled, order: cfg.order | 0 }; changed(); }
export async function saveSettings(settings) { await wait(80); if (me()?.roleId !== "owner") throw new Error("Only an Owner can change settings."); store.location.settings = settings; changed(); }

/* ---------- activity ---------- */
export function watchActivity(cb) { return watch(() => cb(structuredClone(store.activity.slice(0, 150)))); }
export async function log(_session, tool, action, detail = "") { addActivity(tool, action, detail); }

/* ---------- Suggestion Box ---------- */
const sugg = fresh ? [] : [
  { id: id("s"), text: "Could we get a second blender for the smoothie rush on weekends?", authorUid: null, authorName: "Daniel", createdAt: new Date(Date.now() - 3 * 864e5), status: "planned", response: "Yes — ordering one this week.", respondedBy: "Rogue", respondedAt: new Date(Date.now() - 2 * 864e5) },
  { id: id("s"), text: "Board game night on Tuesdays? Slow night, could bring people in.", authorUid: null, authorName: "Wheatyn", createdAt: new Date(Date.now() - 864e5), status: "new" },
];
function suggAuthorFix() { for (const s of sugg) if (!s.authorUid) s.authorUid = Object.values(store.users).find((u) => u.name === s.authorName)?.uid; }
suggAuthorFix();
export function watchSuggestions(cb) { return watch(() => cb(structuredClone(sugg))); }
export async function addSuggestion(session, text) {
  await wait(150);
  sugg.unshift({ id: id("s"), text, authorUid: session.uid, authorName: session.me.name, createdAt: now(), status: "new" });
  changed();
}
export async function respondSuggestion(session, sid, { status, response }) {
  await wait(150);
  const s = sugg.find((x) => x.id === sid);
  Object.assign(s, { status, response, respondedBy: session.me.name, respondedAt: now() });
  changed();
}
export async function deleteSuggestion(sid) {
  await wait(120);
  const i = sugg.findIndex((x) => x.id === sid);
  if (i >= 0) sugg.splice(i, 1);
  changed();
}

/* ---------- Opening & Closing checklists ---------- */
const clTemplates = fresh ? {} : {
  opening: { name: "Opening", items: ["Turn on lights, music and TVs", "Count the drawer", "Make the first kava batch", "Check fridge temps", "Wipe down the bar and tables", "Unlock the door and flip the sign"].map((text, i) => ({ id: `o${i}`, text, priority: i === 1 || i === 3 ? "critical" : "normal" })) },
  shift: { name: "Shift Change", items: ["Count the drawer", "Restock cups and lids", "Check kava levels — make a batch if under half", "Hand off notes to next kavatender"].map((text, i) => ({ id: `s${i}`, text })) },
  closing: { name: "Closing", items: ["Last call announced", "Clean and sanitize the shells and pitchers", "Wipe down the bar", "Keg count", "Turn off the TVs", "Take out trash and recycling", "Sweep and mop", "Count the drawer and drop", "Lights off, lock up"].map((text, i) => ({ id: `c${i}`, text, priority: ["Keg count", "Count the drawer and drop", "Lights off, lock up"].includes(text) ? "critical" : text === "Turn off the TVs" ? "low" : "normal" })) },
};
const clDays = {}; // `${date}_${listId}` -> run
{
  const { businessKey, prevKey, dayStartOf } = await import("../../tools/checklists/days.js");
  if (!fresh) {
    const y = prevKey(businessKey()), t = businessKey();
    const at = (key, h, m) => { const d = dayStartOf(key); d.setHours(h, m); return d; };
    const run = (date, listId, who, doneIdx, hour) => {
      const tpl = clTemplates[listId];
      const checks = {};
      doneIdx.forEach((i, n) => { const it = tpl.items[i]; checks[it.id] = { text: it.text, by: who, byUid: null, at: at(date, hour, 5 + n * 4) }; });
      clDays[`${date}_${listId}`] = { date, listId, listName: tpl.name, dayStart: dayStartOf(date), items: structuredClone(tpl.items), checks };
    };
    run(y, "opening", "Josh", [0, 1, 2, 3, 4, 5], 9);
    run(y, "shift", "Daniel", [0, 1, 2, 3], 15);
    run(y, "closing", "Wheatyn", [0, 1, 2, 5, 7, 8], 22);
    run(t, "opening", "Daniel", [0, 1, 2], 9);
  }
}
export function watchChecklistTemplates(cb) { return watch(() => cb(structuredClone(clTemplates))); }
export async function saveChecklistTemplate(listId, { name, items }) {
  await wait(150);
  clTemplates[listId] = { name, items: items.map(({ id, text, priority }) => ({ id, text, priority: priority || "normal" })) };
  changed();
}
export function watchChecklistDay(dateKey, cb) {
  return watch(() => cb(structuredClone({
    opening: clDays[`${dateKey}_opening`] || null, shift: clDays[`${dateKey}_shift`] || null, closing: clDays[`${dateKey}_closing`] || null,
  })));
}
export async function setChecklistItem(session, { dateKey, dayStart, listId, listName, items }, item, checked) {
  await wait(80);
  const k = `${dateKey}_${listId}`;
  const r = clDays[k] || (clDays[k] = { date: dateKey, listId, listName, dayStart, items: [], checks: {} });
  r.items = structuredClone(items); r.listName = listName;
  if (checked) r.checks[item.id] = { text: item.text, by: session.me.name, byUid: session.uid, at: now() };
  else delete r.checks[item.id];
  changed();
}
export function watchChecklistHistory(since, cb) {
  return watch(() => cb(structuredClone(Object.values(clDays).filter((r) => r.dayStart >= since).sort((a, b) => b.dayStart - a.dayStart))));
}

/* ---------- Knowledge Bank ---------- */
const kb = fresh ? [] : [
  { title: "Making a kava batch (sample)", category: "How-To", body: "## What you need\n- 1 strainer bag\n- Warm water (not hot)\n- Kava root powder\n\n## Steps\n1. Measure the powder into the strainer bag.\n2. Add warm water to the bucket.\n3. Knead the bag for **10 minutes**, squeezing firmly.\n4. Wring out the bag and discard the pulp.\n\n**Tip:** label the batch with the time it was made." },
  { title: "Mango Tango (sample)", category: "Recipes", body: "## Ingredients\n- 8 oz kava\n- 2 oz mango juice\n- Splash of lime\n\n## Build\n1. Fill a shell with ice.\n2. Add kava, then mango juice.\n3. Top with lime and stir.\n\nServe with a lime wheel." },
  { title: "What is kava? (sample)", category: "Knowledge", body: "Kava is a drink made from the root of the *Piper methysticum* plant, traditional across the Pacific Islands.\n\nMore background: https://en.wikipedia.org/wiki/Kava" },
].map((a, i) => ({ id: `kb${i}`, ...a, createdBy: "Rogue", updatedBy: "Rogue", createdAt: new Date(Date.now() - (5 - i) * 864e5), updatedAt: new Date(Date.now() - (5 - i) * 864e5) }));
export function watchArticles(cb) { return watch(() => cb(structuredClone([...kb].sort((a, b) => a.title.localeCompare(b.title))))); }
export async function saveArticle(session, aid, { title, category, body }) {
  await wait(150);
  if (aid) { Object.assign(kb.find((a) => a.id === aid), { title, category, body, updatedAt: now(), updatedBy: session.me.name }); changed(); return aid; }
  const a = { id: id("kb"), title, category, body, createdAt: now(), createdBy: session.me.name, updatedAt: now(), updatedBy: session.me.name };
  kb.push(a); changed(); return a.id;
}
export async function deleteArticle(aid) { await wait(100); const i = kb.findIndex((a) => a.id === aid); if (i >= 0) kb.splice(i, 1); changed(); }
