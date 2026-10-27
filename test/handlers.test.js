import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApi, readMedia } from "../netlify/lib/handlers.js";
import { fakeFirestore, fakeAuth, fakeBlobs } from "./fake-firestore.js";

function setup() {
  const db = fakeFirestore();
  const media = fakeBlobs();
  const fetched = [];
  const fetchFn = async (url) => {
    fetched.push(url);
    if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) {
      const id = url.split("/files/")[1].split("?")[0];
      return { ok: true, status: 200, json: async () => (id.startsWith("inFolder") ? { parents: ["FOLDER12345"], mimeType: id.includes("Doc") ? "application/pdf" : "image/jpeg" } : { parents: ["otherFolder99"], mimeType: "image/jpeg" }) };
    }
    const pic = url.includes("notpic") ? null : Buffer.from("drive-jpeg");
    return { ok: !url.includes("missing"), status: url.includes("missing") ? 404 : 200, arrayBuffer: async () => (pic || Buffer.from("<html>")),
      headers: { get: (k) => (k === "content-type" ? (pic ? "image/jpeg" : "text/html; charset=utf-8") : null) } };
  };
  const call = makeApi({ db, auth: fakeAuth, now: () => new Date(), env: { PIN_PEPPER: "test-pepper", SETUP_CODE: "kava" }, media, fetchFn });
  const loc = "mandarin";
  const api = (action, data = {}, token = null) => call(action, { loc, ...data }, token);
  return { db, api, loc, media, fetched };
}
const rejects = (p, status, re) => assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)));

async function bootstrapped() {
  const t = setup();
  const { token } = await t.api("setupOwner", { setupCode: "kava", name: "Rogue", pin: "2580" });
  t.owner = token;
  return t;
}

test("setup: wrong code refused, then works once, then never again", async () => {
  const t = setup();
  assert.deepEqual(await t.api("setupStatus"), { needsSetup: true });
  await rejects(t.api("setupOwner", { setupCode: "nope", name: "Rogue", pin: "2580" }), 403);
  const { token } = await t.api("setupOwner", { setupCode: "kava", name: "Rogue", pin: "2580" });
  assert.equal(JSON.parse(token).loc, "mandarin");
  assert.deepEqual(await t.api("setupStatus"), { needsSetup: false });
  await rejects(t.api("setupOwner", { setupCode: "kava", name: "Eve", pin: "9182" }), 409);
  const roles = await t.db.collection("locations/mandarin/roles").get();
  assert.deepEqual(roles.docs.map((d) => d.id).sort(), ["kavatender", "manager", "owner"]);
});

test("PINs are never stored in plain form", async () => {
  const t = await bootstrapped();
  for (const [path, data] of t.db._docs) {
    assert.ok(!path.includes("2580") && !JSON.stringify(data).includes("2580"), `found PIN in ${path}`);
  }
});

test("login: right PIN works, wrong / malformed PIN fails, inactive person can't sign in", async () => {
  const t = await bootstrapped();
  const { token } = await t.api("pinLogin", { pin: "2580" });
  assert.ok(JSON.parse(token).uid.startsWith("mandarin-"));
  await rejects(t.api("pinLogin", { pin: "9999" }), 403, /didn't work/);
  await rejects(t.api("pinLogin", { pin: "12" }), 403, /didn't work/);

  const { uid } = await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  assert.ok((await t.api("pinLogin", { pin: "1357" })).token);
  await t.api("adminUpdateUser", { uid, active: false }, t.owner);
  await rejects(t.api("pinLogin", { pin: "1357" }), 403);
  // many wrong tries are fine (no lockout)
  for (let i = 0; i < 20; i++) await rejects(t.api("pinLogin", { pin: "4826" }), 403);
  assert.ok((await t.api("pinLogin", { pin: "2580" })).token);
});

test("a PIN at one location doesn't sign in at another", async () => {
  const t = await bootstrapped();
  await rejects(t.api("pinLogin", { loc: "southside", pin: "2580" }), 403);
});

test("create person: PIN rules and uniqueness", async () => {
  const t = await bootstrapped();
  await t.api("adminCreateUser", { name: "A", roleId: "kavatender", pin: "1234" }, t.owner); // POS PINs: any 4 digits are fine
  await rejects(t.api("adminCreateUser", { name: "A", roleId: "kavatender", pin: "777" }, t.owner), 400);   // still has to be 4 digits
  await t.api("adminCreateUser", { name: "B", roleId: "kavatender", pin: "7777" }, t.owner);
  await rejects(t.api("adminCreateUser", { name: "A", roleId: "kavatender", pin: "2580" }, t.owner), 409, /already in use/);
  await rejects(t.api("adminCreateUser", { name: "", roleId: "kavatender", pin: "3690" }, t.owner), 400);
  await rejects(t.api("adminCreateUser", { name: "A", roleId: "nope", pin: "3690" }, t.owner), 400);
  await t.api("adminCreateUser", { name: "Josh", roleId: "manager", pin: "3690" }, t.owner);
});

test("admin actions need sign-in and admin access", async () => {
  const t = await bootstrapped();
  await rejects(t.api("adminCreateUser", { name: "A", roleId: "kavatender", pin: "3690" }), 401);
  await rejects(t.api("adminCreateUser", { name: "A", roleId: "kavatender", pin: "3690" }, "garbage"), 401);
  await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  const daniel = (await t.api("pinLogin", { pin: "1357" })).token;
  await rejects(t.api("adminCreateUser", { name: "B", roleId: "kavatender", pin: "4826" }, daniel), 403, /administration/);
  // a token for another location is refused
  const forged = JSON.stringify({ uid: JSON.parse(t.owner).uid, loc: "southside" });
  await rejects(t.api("adminCreateUser", { name: "B", roleId: "kavatender", pin: "4826" }, forged), 403);
});

test("deactivated admin is cut off immediately, even with a live token", async () => {
  const t = await bootstrapped();
  const { uid } = await t.api("adminCreateUser", { name: "Josh", roleId: "manager", pin: "3690" }, t.owner);
  await t.api("adminUpdateUser", { uid, overrides: { admin: 2 } }, t.owner);
  const josh = (await t.api("pinLogin", { pin: "3690" })).token;
  await t.api("adminCreateUser", { name: "Wheatyn", roleId: "kavatender", pin: "2468" }, josh);
  await t.api("adminUpdateUser", { uid, active: false }, t.owner);
  await rejects(t.api("adminCreateUser", { name: "X", roleId: "kavatender", pin: "4826" }, josh), 403, /not active/);
});

test("non-owner admins only manage people ranked below them", async () => {
  const t = await bootstrapped();
  const { uid: joshUid } = await t.api("adminCreateUser", { name: "Josh", roleId: "manager", pin: "3690" }, t.owner);
  const { uid: amyUid } = await t.api("adminCreateUser", { name: "Amy", roleId: "manager", pin: "4826" }, t.owner);
  await t.api("adminUpdateUser", { uid: joshUid, overrides: { admin: 2 } }, t.owner);
  const josh = (await t.api("pinLogin", { pin: "3690" })).token;
  const ownerUid = JSON.parse(t.owner).uid;

  const { uid: danUid } = await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, josh);
  await rejects(t.api("adminCreateUser", { name: "M", roleId: "manager", pin: "2468" }, josh), 403);
  await rejects(t.api("adminCreateUser", { name: "O", roleId: "owner", pin: "2468" }, josh), 403);
  await rejects(t.api("adminUpdateUser", { uid: danUid, roleId: "owner" }, josh), 403);
  await rejects(t.api("adminUpdateUser", { uid: amyUid, active: false }, josh), 403);
  await rejects(t.api("adminUpdateUser", { uid: ownerUid, active: false }, josh), 403);
  await rejects(t.api("adminUpdateUser", { uid: joshUid, overrides: { tv: 2 } }, josh), 403); // can't raise himself
  await rejects(t.api("adminResetPin", { uid: ownerUid, pin: "9182" }, josh), 403);
  await t.api("adminResetPin", { uid: joshUid, pin: "9182" }, josh); // own PIN is fine
  await t.api("adminUpdateUser", { uid: danUid, overrides: { inventory: 2 } }, josh);
  await rejects(t.api("adminCreateRole", { name: "Lead" }, josh), 403, /Owner/);
});

test("always at least one active Owner, and you can't deactivate yourself", async () => {
  const t = await bootstrapped();
  const ownerUid = JSON.parse(t.owner).uid;
  await rejects(t.api("adminUpdateUser", { uid: ownerUid, active: false }, t.owner), 400, /yourself/);
  await rejects(t.api("adminUpdateUser", { uid: ownerUid, roleId: "manager" }, t.owner), 409, /at least one active Owner/);
  const { uid: gio } = await t.api("adminCreateUser", { name: "Gio", roleId: "owner", pin: "4826" }, t.owner);
  await t.api("adminUpdateUser", { uid: ownerUid, roleId: "manager" }, t.owner); // now allowed
  const gioTok = (await t.api("pinLogin", { pin: "4826" })).token;
  await rejects(t.api("adminUpdateUser", { uid: gio, active: false }, gioTok), 400);
});

test("reset PIN: old PIN stops working, new one works, can't steal a taken PIN", async () => {
  const t = await bootstrapped();
  const { uid } = await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  await rejects(t.api("adminResetPin", { uid, pin: "2580" }, t.owner), 409);
  await t.api("adminResetPin", { uid, pin: "4826" }, t.owner);
  await rejects(t.api("pinLogin", { pin: "1357" }), 403);
  assert.equal(JSON.parse((await t.api("pinLogin", { pin: "4826" })).token).uid, uid);
  await t.api("adminResetPin", { uid, pin: "4826" }, t.owner); // same PIN again is fine
  const idx = await t.db.collection("pinIndex").where("uid", "==", uid).get();
  assert.equal(idx.size, 1);
});

test("roles: create, refuse duplicate, refuse delete while in use, delete when empty", async () => {
  const t = await bootstrapped();
  const { id } = await t.api("adminCreateRole", { name: "Shift Lead", rank: 30 }, t.owner);
  assert.equal(id, "shift-lead");
  await rejects(t.api("adminCreateRole", { name: "Shift Lead" }, t.owner), 409);
  const { uid } = await t.api("adminCreateUser", { name: "Wheatyn", roleId: "shift-lead", pin: "2468" }, t.owner);
  await rejects(t.api("adminDeleteRole", { roleId: "shift-lead" }, t.owner), 409, /Move everyone/);
  await rejects(t.api("adminDeleteRole", { roleId: "owner" }, t.owner), 409);
  await t.api("adminUpdateUser", { uid, roleId: "kavatender" }, t.owner);
  await t.api("adminDeleteRole", { roleId: "shift-lead" }, t.owner);
  assert.equal((await t.db.doc("locations/mandarin/roles/shift-lead").get()).exists, false);
});

test("activity log records admin actions", async () => {
  const t = await bootstrapped();
  await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  const log = await t.db.collection("locations/mandarin/activity").get();
  const actions = log.docs.map((d) => d.get("action")).sort();
  assert.deepEqual(actions, ["Added person", "Set up location"]);
});

test("unknown actions and bad input are refused cleanly", async () => {
  const t = await bootstrapped();
  await rejects(t.api("constructor"), 404);
  await rejects(t.api("nope"), 404);
  await rejects(t.api("pinLogin", { loc: "../etc", pin: "2580" }), 400);
  await rejects(t.api("adminUpdateUser", { uid: "../../pinIndex/x", name: "x" }, t.owner), 404);
  await rejects(t.api("adminUpdateUser", { uid: JSON.parse(t.owner).uid, overrides: { tv: 7 } }, t.owner), 400);
});

test("show PIN: admins see PINs (incl. after reset), rank rules apply, viewing is logged", async () => {
  const t = await bootstrapped();
  const { uid: danUid } = await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  assert.equal((await t.api("adminRevealPin", { uid: danUid }, t.owner)).pin, "1357");
  await t.api("adminResetPin", { uid: danUid, pin: "0482" }, t.owner);
  assert.equal((await t.api("adminRevealPin", { uid: danUid }, t.owner)).pin, "0482");
  const ownerUid = JSON.parse(t.owner).uid;
  assert.equal((await t.api("adminRevealPin", { uid: ownerUid }, t.owner)).pin, "2580");

  const { uid: joshUid } = await t.api("adminCreateUser", { name: "Josh", roleId: "manager", pin: "3690" }, t.owner);
  await t.api("adminUpdateUser", { uid: joshUid, overrides: { admin: 2 } }, t.owner);
  const josh = (await t.api("pinLogin", { pin: "3690" })).token;
  assert.equal((await t.api("adminRevealPin", { uid: danUid }, josh)).pin, "0482");
  assert.equal((await t.api("adminRevealPin", { uid: joshUid }, josh)).pin, "3690");
  await rejects(t.api("adminRevealPin", { uid: ownerUid }, josh), 403);

  const dan = (await t.api("pinLogin", { pin: "0482" })).token;
  await rejects(t.api("adminRevealPin", { uid: danUid }, dan), 403);
  await rejects(t.api("adminRevealPin", { uid: danUid }), 401);

  const log = await t.db.collection("locations/mandarin/activity").get();
  assert.equal(log.docs.filter((d) => d.get("action") === "Viewed PIN").length, 5);
});


test("pictures: Manage on the tool can upload; others can't; bad input refused; stored and readable", async () => {
  const t = await bootstrapped();
  const png = "data:image/png;base64," + Buffer.from("fake-png-bytes").toString("base64");
  const { src } = await t.api("mediaUpload", { tool: "knowledge", data: png }, t.owner);
  const id = src.split("media=")[1];
  assert.match(id, /^mandarin\.[a-z0-9]{24}$/);
  const pic = await readMedia(t.media, id);
  assert.equal(pic.type, "image/png");
  assert.equal(Buffer.from(pic.data).toString(), "fake-png-bytes");

  await t.api("adminCreateUser", { name: "Daniel", roleId: "kavatender", pin: "1357" }, t.owner);
  const dan = (await t.api("pinLogin", { pin: "1357" })).token;
  await rejects(t.api("mediaUpload", { tool: "knowledge", data: png }, dan), 403);           // kavatender = Use only
  assert.ok((await t.api("mediaUpload", { tool: "quests", data: png }, dan)).src);          // Side Quests photos: Use is enough
  await rejects(t.api("mediaUpload", { tool: "knowledge", data: png }), 401);                // not signed in
  await rejects(t.api("mediaUpload", { tool: "admin", data: png }, t.owner), 400);           // not a picture tool
  await rejects(t.api("mediaUpload", { tool: "knowledge", data: "data:text/html;base64,PGI+" }, t.owner), 400);
  await rejects(t.api("mediaUpload", { tool: "knowledge", data: "hello" }, t.owner), 400);
  const big = "data:image/jpeg;base64," + Buffer.alloc(4 * 1024 * 1024 + 10).toString("base64");
  await rejects(t.api("mediaUpload", { tool: "knowledge", data: big }, t.owner), 413);

  assert.equal(await readMedia(t.media, "../secret"), null);
  assert.equal(await readMedia(t.media, "mandarin.doesnotexist0000"), null);
});

test("copying a Google Drive picture into the hub", async () => {
  const t = await bootstrapped();
  const { src } = await t.api("mediaCopy", { tool: "tv", url: "https://lh3.googleusercontent.com/d/abc123=w1600" }, t.owner);
  const pic = await readMedia(t.media, src.split("media=")[1]);
  assert.equal(pic.type, "image/jpeg");
  assert.equal(Buffer.from(pic.data).toString(), "drive-jpeg");
  await rejects(t.api("mediaCopy", { tool: "tv", url: "https://evil.example.com/x.jpg" }, t.owner), 400);
  await rejects(t.api("mediaCopy", { tool: "tv", url: "https://lh3.googleusercontent.com.evil.com/x" }, t.owner), 400);
  await rejects(t.api("mediaCopy", { tool: "tv", url: "http://lh3.googleusercontent.com/d/x" }, t.owner), 400);
  await rejects(t.api("mediaCopy", { tool: "tv", url: "https://lh3.googleusercontent.com/d/missing" }, t.owner), 502);
  await rejects(t.api("mediaCopy", { tool: "tv", url: "https://lh3.googleusercontent.com/d/notpic" }, t.owner), 415);
  await rejects(t.api("mediaCopy", { tool: "tv", url: "https://lh3.googleusercontent.com/d/abc" }), 401);
  assert.equal(t.fetched.length, 3);
});

test("drivePhoto: only photos in the community folder, for people with Reel Maker", async () => {
  const t = await bootstrapped();
  await rejects(t.api("drivePhoto", { id: "inFolderPhoto1" }, t.owner), 409); // no folder set yet
  await t.db.doc("locations/mandarin/tv/community").set({ driveFolder: "FOLDER12345" });
  const pic = await t.api("drivePhoto", { id: "inFolderPhoto1" }, t.owner);
  assert.equal(pic.type, "image/jpeg");
  assert.equal(Buffer.from(pic.data, "base64").toString(), "drive-jpeg");
  assert.ok(t.fetched.some((u) => u.startsWith("https://lh3.googleusercontent.com/d/inFolderPhoto1=w")));
  await rejects(t.api("drivePhoto", { id: "elsewherePhoto1" }, t.owner), 404);
  await rejects(t.api("drivePhoto", { id: "inFolderDoc123" }, t.owner), 415);
  await rejects(t.api("drivePhoto", { id: "../../etc" }, t.owner), 400);
  await rejects(t.api("drivePhoto", { id: "inFolderPhoto1" }), 401);
});
