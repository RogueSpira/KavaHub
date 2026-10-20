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
  manager: { id: "manager", name: "Manager", rank: 50, system: false, perms: { tv: 2, checklists: 2, inventory: 2, suggestions: 2, complaints: 2, admin: 0 } },
  kavatender: { id: "kavatender", name: "Kavatender", rank: 10, system: false, perms: { tv: 1, checklists: 1, inventory: 1, suggestions: 1, complaints: 1, admin: 0 } },
};
const store = {
  location: fresh ? null : { id: LOCATION_ID, name: "Kava & Co. Mandarin", setupDone: true, settings: { autoLockSeconds: 120 } },
  roles: fresh ? {} : structuredClone(ROLES),
  tools: fresh ? {} : Object.fromEntries(["tv", "checklists", "inventory", "suggestions", "complaints", "admin"].map((t, i) => [t, { enabled: true, order: i }])),
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
  store.tools = Object.fromEntries(["tv", "checklists", "inventory", "suggestions", "complaints", "admin"].map((t, i) => [t, { enabled: true, order: i }]));
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
