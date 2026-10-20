// Kava Hub server logic: checking PINs, signing people in, and changing users/roles.
// Runs inside the Netlify Function (netlify/functions/hub.mjs). The database, auth and
// secrets are passed in, so the same code runs against an in-memory database in tests.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { validatePin, pinKey } from "./pin.js";
import { DEFAULT_ROLES, DEFAULT_TOOLS, DEFAULT_SETTINGS } from "./defaults.js";

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new ApiError(status, msg); };

const LOC_RE = /^[a-z][a-z0-9-]{1,30}$/;
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;

// deps: { db, auth: { verifyIdToken, createCustomToken }, now: () => timestamp value, env: { PIN_PEPPER, SETUP_CODE } }
export function makeApi({ db, auth, now, env }) {
  /* ---------------- helpers ---------------- */
  const locRef = (loc) => db.doc(`locations/${loc}`);
  const userRef = (loc, uid) => db.doc(`locations/${loc}/users/${uid}`);
  const roleRef = (loc, id) => db.doc(`locations/${loc}/roles/${id}`);
  const pinRef = (key) => db.doc(`pinIndex/${key}`);
  const newUid = (loc) => `${loc}-${randomBytes(9).toString("base64url")}`;
  const key = (loc, pin) => pinKey(env.PIN_PEPPER, loc, pin);

  function cleanLoc(loc) {
    const l = String(loc || "").trim().toLowerCase();
    if (!LOC_RE.test(l)) fail(400, "Unknown location.");
    return l;
  }
  function cleanName(name) {
    const n = String(name || "").trim().replace(/\s+/g, " ");
    if (!n) fail(400, "Name is required.");
    if (n.length > 40) fail(400, "Name is too long (40 characters max).");
    return n;
  }
  function checkPin(pin) {
    const err = validatePin(pin);
    if (err) fail(400, err);
    return String(pin);
  }
  function sameString(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
  }
  function cleanOverrides(overrides) {
    if (overrides == null) return undefined;
    if (typeof overrides !== "object" || Array.isArray(overrides)) fail(400, "Bad access overrides.");
    const out = {};
    for (const [tool, lvl] of Object.entries(overrides)) {
      if (!ID_RE.test(tool)) fail(400, `Unknown tool "${tool}".`);
      if (lvl === null) continue; // null = follow the role
      if (![0, 1, 2].includes(lvl)) fail(400, "Access must be hidden, use or manage.");
      out[tool] = lvl;
    }
    return out;
  }

  async function logActivity(loc, actor, action, detail = "") {
    await db.collection(`locations/${loc}/activity`).add({
      at: now(), actorUid: actor?.uid || null, actorName: actor?.name || "System",
      tool: "admin", action, detail: String(detail).slice(0, 300),
    });
  }

  // Works out who is calling from their Firebase sign-in token.
  async function caller(idToken) {
    if (!idToken) fail(401, "Please sign in again.");
    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch { fail(401, "Your sign-in expired. Please sign in again."); }
    const loc = decoded.loc;
    if (!loc) fail(403, "No location on this sign-in.");
    const snap = await userRef(loc, decoded.uid).get();
    if (!snap.exists || snap.get("active") !== true) fail(403, "This account is not active.");
    const me = { uid: decoded.uid, ...snap.data() };
    const role = (await roleRef(loc, me.roleId).get()).data() || {};
    const isOwner = me.roleId === "owner";
    const adminLevel = isOwner ? 2 : (me.overrides?.admin ?? role.perms?.admin ?? 0);
    return { loc, me, isOwner, rank: isOwner ? 1000 : (role.rank ?? 0), adminLevel };
  }
  async function requireAdmin(idToken) {
    const c = await caller(idToken);
    if (c.adminLevel < 2) fail(403, "You don't have access to administration.");
    return c;
  }
  async function rankOfRole(loc, roleId) {
    if (!ID_RE.test(String(roleId || ""))) fail(400, "Pick a role.");
    const r = await roleRef(loc, roleId).get();
    if (!r.exists) fail(400, "That role doesn't exist.");
    return roleId === "owner" ? 1000 : (r.get("rank") ?? 0);
  }
  async function activeOwnerCount(loc) {
    const q = await db.collection(`locations/${loc}/users`)
      .where("roleId", "==", "owner").where("active", "==", true).get();
    return q.size;
  }

  /* ---------------- actions ---------------- */
  const actions = {
    // Public: does this location still need its first owner?
    async setupStatus(data) {
      const loc = cleanLoc(data.loc);
      const snap = await locRef(loc).get();
      return { needsSetup: !(snap.exists && snap.get("setupDone") === true) };
    },

    // One-time: creates the location, default roles/tiles, and the first Owner.
    async setupOwner(data) {
      const loc = cleanLoc(data.loc);
      if (!env.SETUP_CODE || !sameString(data.setupCode || "", env.SETUP_CODE)) fail(403, "That setup code isn't right.");
      const name = cleanName(data.name);
      const pin = checkPin(data.pin);
      const uid = newUid(loc);
      const k = key(loc, pin);
      await db.runTransaction(async (tx) => {
        const l = await tx.get(locRef(loc));
        if (l.exists && l.get("setupDone") === true) fail(409, "This location is already set up.");
        tx.set(locRef(loc), {
          name: String(data.locationName || "Kava & Co. Mandarin").slice(0, 60),
          settings: DEFAULT_SETTINGS, setupDone: true, createdAt: now(),
        });
        for (const [id, role] of Object.entries(DEFAULT_ROLES)) tx.set(roleRef(loc, id), role);
        for (const [id, cfg] of Object.entries(DEFAULT_TOOLS)) tx.set(db.doc(`locations/${loc}/tools/${id}`), cfg);
        tx.set(userRef(loc, uid), { name, roleId: "owner", active: true, overrides: {}, createdAt: now(), lastLoginAt: now() });
        tx.set(pinRef(k), { loc, uid });
      });
      await logActivity(loc, { uid, name }, "Set up location", `Owner: ${name}`);
      return { token: await auth.createCustomToken(uid, { loc }) };
    },

    async pinLogin(data) {
      const loc = cleanLoc(data.loc);
      const pin = String(data.pin ?? "");
      let uid = null, ok = false;
      if (!validatePin(pin)) {
        const idx = await pinRef(key(loc, pin)).get();
        if (idx.exists && idx.get("loc") === loc) {
          uid = idx.get("uid");
          const u = await userRef(loc, uid).get();
          ok = u.exists && u.get("active") === true;
        }
      }
      if (!ok) fail(403, "That PIN didn't work.");
      await userRef(loc, uid).update({ lastLoginAt: now() });
      return { token: await auth.createCustomToken(uid, { loc }) };
    },

    async adminCreateUser(data, idToken) {
      const c = await requireAdmin(idToken);
      const name = cleanName(data.name);
      const roleId = String(data.roleId || "");
      const roleRank = await rankOfRole(c.loc, roleId);
      if (!c.isOwner && roleRank >= c.rank) fail(403, "You can only add people below your own role.");
      const pin = checkPin(data.pin);
      const k = key(c.loc, pin);
      const uid = newUid(c.loc);
      await db.runTransaction(async (tx) => {
        const taken = await tx.get(pinRef(k));
        if (taken.exists) fail(409, "That PIN is already in use. Pick a different one.");
        tx.set(pinRef(k), { loc: c.loc, uid });
        tx.set(userRef(c.loc, uid), { name, roleId, active: true, overrides: {}, createdAt: now(), lastLoginAt: null });
      });
      await logActivity(c.loc, c.me, "Added person", `${name} (${roleId})`);
      return { uid };
    },

    async adminUpdateUser(data, idToken) {
      const c = await requireAdmin(idToken);
      const uid = String(data.uid || "");
      if (!uid.startsWith(`${c.loc}-`)) fail(404, "That person wasn't found.");
      const ref = userRef(c.loc, uid);
      const snap = await ref.get();
      if (!snap.exists) fail(404, "That person wasn't found.");
      const target = snap.data();
      const targetRank = await rankOfRole(c.loc, target.roleId);
      if (!c.isOwner && targetRank >= c.rank) fail(403, "You can't change someone at or above your role.");

      const patch = {}, changes = [];
      if (data.name !== undefined) { patch.name = cleanName(data.name); if (patch.name !== target.name) changes.push("name"); }
      if (data.roleId !== undefined && data.roleId !== target.roleId) {
        const newRank = await rankOfRole(c.loc, data.roleId);
        if (!c.isOwner && newRank >= c.rank) fail(403, "You can only assign roles below your own.");
        patch.roleId = data.roleId; changes.push(`role → ${data.roleId}`);
      }
      if (data.active !== undefined && (data.active === true) !== target.active) {
        if (uid === c.me.uid && data.active !== true) fail(400, "You can't deactivate yourself.");
        patch.active = data.active === true; changes.push(patch.active ? "reactivated" : "deactivated");
      }
      const ov = cleanOverrides(data.overrides);
      if (ov !== undefined) {
        patch.overrides = ov;
        if (JSON.stringify(ov) !== JSON.stringify(target.overrides || {})) changes.push("access");
      }
      const losingOwner = target.roleId === "owner" && target.active === true
        && ((patch.roleId && patch.roleId !== "owner") || patch.active === false);
      if (losingOwner && (await activeOwnerCount(c.loc)) <= 1) fail(409, "There has to be at least one active Owner.");

      await ref.update(patch);
      if (changes.length) await logActivity(c.loc, c.me, "Updated person", `${patch.name || target.name}: ${changes.join(", ")}`);
      return { ok: true };
    },

    async adminResetPin(data, idToken) {
      const c = await requireAdmin(idToken);
      const uid = String(data.uid || "");
      if (!uid.startsWith(`${c.loc}-`)) fail(404, "That person wasn't found.");
      const snap = await userRef(c.loc, uid).get();
      if (!snap.exists) fail(404, "That person wasn't found.");
      const targetRank = await rankOfRole(c.loc, snap.get("roleId"));
      if (!c.isOwner && targetRank >= c.rank && uid !== c.me.uid) fail(403, "You can't change someone at or above your role.");
      const pin = checkPin(data.pin);
      const k = key(c.loc, pin);
      const old = await db.collection("pinIndex").where("uid", "==", uid).get();
      await db.runTransaction(async (tx) => {
        const taken = await tx.get(pinRef(k));
        if (taken.exists && taken.get("uid") !== uid) fail(409, "That PIN is already in use. Pick a different one.");
        old.docs.forEach((d) => { if (d.id !== k) tx.delete(d.ref); });
        tx.set(pinRef(k), { loc: c.loc, uid });
      });
      await logActivity(c.loc, c.me, "Reset PIN", snap.get("name"));
      return { ok: true };
    },

    async adminCreateRole(data, idToken) {
      const c = await requireAdmin(idToken);
      if (!c.isOwner) fail(403, "Only an Owner can change roles.");
      const name = cleanName(data.name);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
      if (!ID_RE.test(id)) fail(400, "Role name needs to start with a letter.");
      const rank = Math.max(1, Math.min(99, parseInt(data.rank, 10) || 20));
      await db.runTransaction(async (tx) => {
        const r = await tx.get(roleRef(c.loc, id));
        if (r.exists) fail(409, "A role with that name already exists.");
        tx.set(roleRef(c.loc, id), { name, rank, system: false, perms: {} });
      });
      await logActivity(c.loc, c.me, "Added role", name);
      return { id };
    },

    async adminDeleteRole(data, idToken) {
      const c = await requireAdmin(idToken);
      if (!c.isOwner) fail(403, "Only an Owner can change roles.");
      const id = String(data.roleId || "");
      if (id === "owner") fail(409, "The Owner role can't be deleted.");
      if (!ID_RE.test(id)) fail(404, "That role wasn't found.");
      const r = await roleRef(c.loc, id).get();
      if (!r.exists) fail(404, "That role wasn't found.");
      const inUse = await db.collection(`locations/${c.loc}/users`).where("roleId", "==", id).limit(1).get();
      if (!inUse.empty) fail(409, "Move everyone off this role before deleting it.");
      await r.ref.delete();
      await logActivity(c.loc, c.me, "Deleted role", r.get("name"));
      return { ok: true };
    },
  };

  // Entry point used by the Netlify Function.
  return async function handle(action, data, idToken) {
    const fn = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
    if (!fn) fail(404, "Unknown action.");
    if (!env.PIN_PEPPER) fail(500, "Server is missing PIN_PEPPER.");
    return fn(data || {}, idToken);
  };
}
