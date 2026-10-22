// Real backend: Firebase Auth + Firestore, plus the Netlify Function for PINs and people.
// Every screen talks to the backend only through the functions exported here
// (the demo backend in demo.js exports the same set), so tools never touch
// Firebase directly and the two can be swapped.
import { firebaseConfig, LOCATION_ID, API_URL, FIREBASE_SDK_VERSION } from "../config.js";

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const [{ initializeApp }, A, F] = await Promise.all([
  import(`${CDN}/firebase-app.js`),
  import(`${CDN}/firebase-auth.js`),
  import(`${CDN}/firebase-firestore.js`),
]);

const app = initializeApp(firebaseConfig);
// In-memory sign-in: reloading the page or auto-lock always returns to the PIN pad.
const auth = A.initializeAuth(app, { persistence: A.inMemoryPersistence });
const db = F.getFirestore(app);

const loc = LOCATION_ID;
// Calls the Netlify Function. Signed-in calls carry the Firebase ID token so the
// server knows who is asking.
async function call(action, data) {
  const headers = { "Content-Type": "application/json" };
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  let res;
  try {
    res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ action, loc, ...data }) });
  } catch { throw new Error("Can't reach the server. Check the Wi-Fi and try again."); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error) throw new Error(body.error);
    if (res.status === 404) throw new Error("The hub's server function isn't deployed (404). Check that netlify.toml is at the top of the GitHub repo.");
    throw new Error(`Server error ${res.status}. Check Netlify → Logs → Functions → hub.`);
  }
  return body;
}
// Show an estimated time for our own just-saved changes instead of a blank.
const EST = { serverTimestamps: "estimate" };
const tsToDate = (v) => v?.toDate?.() || v || null;
const col = (p) => F.collection(db, `locations/${loc}/${p}`);
const docRef = (p) => F.doc(db, `locations/${loc}${p ? "/" + p : ""}`);

/* ---------- auth ---------- */
export const mode = "firebase";
export const setupStatus = () => call("setupStatus", {});
export async function setupOwner({ setupCode, name, pin }) {
  const { token } = await call("setupOwner", { setupCode, name, pin });
  await A.signInWithCustomToken(auth, token);
}
export async function login(pin) {
  const { token } = await call("pinLogin", { pin });
  await A.signInWithCustomToken(auth, token);
}
export const logout = () => A.signOut(auth);

// Calls cb(session | null) whenever sign-in, your user record, your role,
// any role, the tile settings or location settings change.
export function onSession(cb) {
  let unsubs = [];
  const stop = () => { unsubs.forEach((u) => u()); unsubs = []; };
  const offAuth = A.onAuthStateChanged(auth, (u) => {
    stop();
    if (!u) { cb(null); return; }
    const s = { uid: u.uid, me: null, roles: null, tools: null, location: null };
    const emit = () => {
      if (!s.me || !s.roles || !s.tools || !s.location) return;
      if (s.me.active !== true) { logout(); return; }
      cb({ ...s, role: s.roles[s.me.roleId] || { name: s.me.roleId, perms: {} } });
    };
    const onErr = (e) => { console.warn("[hub] listener error", e); logout(); };
    unsubs.push(F.onSnapshot(docRef(`users/${u.uid}`), (d) => { s.me = d.exists() ? { uid: d.id, ...d.data() } : { active: false }; emit(); }, onErr));
    unsubs.push(F.onSnapshot(col("roles"), (q) => { s.roles = Object.fromEntries(q.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); emit(); }, onErr));
    unsubs.push(F.onSnapshot(col("tools"), (q) => { s.tools = Object.fromEntries(q.docs.map((d) => [d.id, d.data()])); emit(); }, onErr));
    unsubs.push(F.onSnapshot(docRef(""), (d) => { s.location = { id: loc, ...d.data() }; emit(); }, onErr));
  });
  return () => { stop(); offAuth(); };
}

/* ---------- people ---------- */
export function watchUsers(cb) {
  return F.onSnapshot(F.query(col("users"), F.orderBy("name")), (q) => cb(q.docs.map((d) => ({ uid: d.id, ...d.data(EST) }))),
    (e) => { console.warn("[hub] people", e); cb(null, e); });
}
export const createUser = (d) => call("adminCreateUser", d);
export const updateUser = (uid, patch) => call("adminUpdateUser", { uid, ...patch });
export const resetPin = (uid, pin) => call("adminResetPin", { uid, pin });
export const revealPin = async (uid) => (await call("adminRevealPin", { uid })).pin;

/* ---------- roles ---------- */
// Changes one tool's access for one role (only that field, so quick back-to-back changes never overwrite each other).
export const setRoleAccess = (roleId, toolId, level) => F.updateDoc(docRef(`roles/${roleId}`), { [`perms.${toolId}`]: level });
export const createRole = (name, rank) => call("adminCreateRole", { name, rank });
export const deleteRole = (roleId) => call("adminDeleteRole", { roleId });

/* ---------- tiles & settings ---------- */
export const saveTool = (toolId, cfg) => F.setDoc(docRef(`tools/${toolId}`), { enabled: !!cfg.enabled, order: cfg.order | 0 });
export const saveSettings = (settings) => F.updateDoc(docRef(""), { settings });

/* ---------- activity ---------- */
export function watchActivity(cb, max = 150) {
  return F.onSnapshot(F.query(col("activity"), F.orderBy("at", "desc"), F.limit(max)),
    (q) => cb(q.docs.map((d) => { const x = d.data(EST); return { id: d.id, ...x, at: x.at?.toDate?.() || null }; })),
    (e) => { console.warn("[hub] activity", e); cb(null, e); });
}
export async function log(session, tool, action, detail = "") {
  try {
    await F.addDoc(col("activity"), {
      at: F.serverTimestamp(), actorUid: session.uid, actorName: session.me.name,
      tool, action, detail: String(detail).slice(0, 300),
    });
  } catch (e) { console.warn("[hub] activity log failed", e); }
}

/* ---------- Suggestion Box ---------- */
const suggCol = () => col("tools-data/suggestions/items");
export function watchSuggestions(cb) {
  return F.onSnapshot(F.query(suggCol(), F.orderBy("createdAt", "desc"), F.limit(300)),
    (q) => cb(q.docs.map((d) => { const x = d.data(EST); return { id: d.id, ...x, createdAt: tsToDate(x.createdAt), respondedAt: tsToDate(x.respondedAt) }; })),
    (e) => { console.warn("[hub] suggestions listener", e); cb(null, e); });
}
export const addSuggestion = (session, text) => F.addDoc(suggCol(), {
  text, authorUid: session.uid, authorName: session.me.name, createdAt: F.serverTimestamp(), status: "new",
});
export const respondSuggestion = (session, id, { status, response }) => F.updateDoc(F.doc(suggCol(), id), {
  status, response, respondedBy: session.me.name, respondedAt: F.serverTimestamp(),
});
export const deleteSuggestion = (id) => F.deleteDoc(F.doc(suggCol(), id));

/* ---------- Opening & Closing checklists ---------- */
const CL = "tools-data/checklists";
const CL_LISTS = ["opening", "shift", "closing"];
function dayDoc(d) {
  if (!d.exists()) return null;
  const x = d.data(EST);
  const checks = {};
  for (const [k, c] of Object.entries(x.checks || {})) checks[k] = { ...c, at: tsToDate(c.at) };
  const submitted = x.submitted ? { ...x.submitted, at: tsToDate(x.submitted.at) } : null;
  return { ...x, checks, submitted, dayStart: tsToDate(x.dayStart) };
}
export function watchChecklistTemplates(cb) {
  return F.onSnapshot(col(`${CL}/lists`),
    (q) => cb(Object.fromEntries(q.docs.map((d) => [d.id, d.data()]))),
    (e) => { console.warn("[hub] checklist lists", e); cb(null, e); });
}
export const saveChecklistTemplate = (listId, { name, items }) =>
  F.setDoc(docRef(`${CL}/lists/${listId}`), { name, items: items.map(({ id, text, priority }) => ({ id, text, priority: priority || "normal" })) });

// Live view of one business day: { opening, shift, closing } (each null until something is checked).
export function watchChecklistDay(dateKey, cb) {
  const out = {}; const seen = new Set();
  const unsubs = CL_LISTS.map((id) => F.onSnapshot(docRef(`${CL}/days/${dateKey}_${id}`),
    (d) => { out[id] = dayDoc(d); seen.add(id); if (seen.size === CL_LISTS.length) cb({ ...out }); },
    (e) => { console.warn("[hub] checklist day", e); cb(null, e); }));
  return () => unsubs.forEach((u) => u());
}
export function setChecklistItem(session, { dateKey, dayStart, listId, listName, items }, item, checked) {
  return F.setDoc(docRef(`${CL}/days/${dateKey}_${listId}`), {
    date: dateKey, listId, listName, dayStart,
    items: items.map(({ id, text, priority }) => ({ id, text, priority: priority || "normal" })),
    checks: { [item.id]: checked
      ? { text: item.text, by: session.me.name, byUid: session.uid, at: F.serverTimestamp() }
      : F.deleteField() },
    lastItem: item.id,
    updatedAt: F.serverTimestamp(),
  }, { merge: true });
}
// Submit a list: records who submitted, when, and what was left undone.
export function submitChecklist(session, { dateKey, dayStart, listId, listName, items, hasRun }, { done, total, skippedCritical }) {
  return F.setDoc(docRef(`${CL}/days/${dateKey}_${listId}`), {
    date: dateKey, listId, listName, dayStart,
    items: items.map(({ id, text, priority }) => ({ id, text, priority: priority || "normal" })),
    ...(hasRun ? {} : { checks: {} }),
    submitted: { by: session.me.name, byUid: session.uid, at: F.serverTimestamp(), done, total, skippedCritical },
    updatedAt: F.serverTimestamp(),
  }, { merge: true });
}
// Managers: every saved list run since a date, newest first.
export function watchChecklistHistory(since, cb) {
  return F.onSnapshot(F.query(col(`${CL}/days`), F.where("dayStart", ">=", since), F.orderBy("dayStart", "desc"), F.limit(400)),
    (q) => cb(q.docs.map(dayDoc)),
    (e) => { console.warn("[hub] checklist history", e); cb(null, e); });
}

/* ---------- Knowledge Bank ---------- */
const kbCol = () => col("tools-data/knowledge/articles");
const kbDoc = (d) => { const x = d.data(EST); return { id: d.id, ...x, createdAt: tsToDate(x.createdAt), updatedAt: tsToDate(x.updatedAt) }; };
export function watchArticles(cb) {
  return F.onSnapshot(F.query(kbCol(), F.orderBy("title"), F.limit(1000)),
    (q) => cb(q.docs.map(kbDoc)),
    (e) => { console.warn("[hub] knowledge", e); cb(null, e); });
}
export async function saveArticle(session, id, { title, category, body }) {
  const by = session.me.name;
  if (id) {
    await F.updateDoc(F.doc(kbCol(), id), { title, category, body, updatedAt: F.serverTimestamp(), updatedBy: by });
    return id;
  }
  const ref = await F.addDoc(kbCol(), {
    title, category, body, createdAt: F.serverTimestamp(), createdBy: by, updatedAt: F.serverTimestamp(), updatedBy: by,
  });
  return ref.id;
}
export const deleteArticle = (id) => F.deleteDoc(F.doc(kbCol(), id));

/* ---------- pictures (stored in Netlify Blobs by the hub's server function) ---------- */
// dataUrl comes from shrinkImage(). Returns the address to use in the article.
export const uploadImage = async (tool, dataUrl) => (await call("mediaUpload", { tool, data: dataUrl })).src;
// Copies a Google Drive picture into the hub's storage (used by the TV import). Returns the new address.
export const copyImage = async (tool, url) => (await call("mediaCopy", { tool, url })).src;

/* ---------- TV Screens (locations/{loc}/tv/{docId}) ---------- */
// Everything the TVs show, as { docId: data }.
export function watchTv(cb) {
  return F.onSnapshot(col("tv"),
    (q) => cb(Object.fromEntries(q.docs.map((d) => [d.id, d.data(EST)]))),
    (e) => { console.warn("[hub] tv", e); cb(null, e); });
}
// Replace one section's content (lists are saved whole).
export const saveTv = (docId, data) => F.setDoc(docRef(`tv/${docId}`), data);
// Change part of a section without touching the rest (e.g. today's crew).
export const mergeTv = (docId, data) => F.setDoc(docRef(`tv/${docId}`), data, { merge: true });
// Remove a field inside a section, e.g. clear today's crew change: path "days.2026-10-20".
export const clearTvField = (docId, path) => F.updateDoc(docRef(`tv/${docId}`), { [path]: F.deleteField() });

/* ---------- Side Quests ---------- */
// items: the quests on the board · subs: "I did it" sign-offs waiting for / after review.
const SQ = "tools-data/quests";
export function watchQuests(cb) {
  return F.onSnapshot(F.query(col(`${SQ}/items`), F.orderBy("createdAt", "desc")),
    (q) => cb(q.docs.map((d) => { const x = d.data(EST); return { id: d.id, ...x, createdAt: tsToDate(x.createdAt), updatedAt: tsToDate(x.updatedAt), unlockAt: tsToDate(x.unlockAt) }; })),
    (e) => { console.warn("[hub] quests", e); cb(null, e); });
}
// unlockOn: "2026-11-01" or "" — opens at 5 AM that day (the start of the business day).
const unlockAtOf = (key) => { if (!key) return null; const [y, m, d] = key.split("-").map(Number); return F.Timestamp.fromDate(new Date(y, m - 1, d, 5)); };
export async function saveQuest(session, qid, { title, details, repeat, open, unlockOn = "" }) {
  const data = { title, details, repeat: !!repeat, open: open !== false, unlockOn, unlockAt: unlockAtOf(unlockOn), updatedAt: F.serverTimestamp(), updatedBy: session.me.name };
  if (qid) { await F.updateDoc(docRef(`${SQ}/items/${qid}`), data); return qid; }
  const ref = await F.addDoc(col(`${SQ}/items`), { ...data, createdAt: F.serverTimestamp(), createdBy: session.me.name });
  return ref.id;
}
export const setQuestOpen = (session, qid, open) => F.updateDoc(docRef(`${SQ}/items/${qid}`), { open, updatedAt: F.serverTimestamp(), updatedBy: session.me.name });
export const deleteQuest = (qid) => F.deleteDoc(docRef(`${SQ}/items/${qid}`));
export function watchQuestSubs(cb) {
  return F.onSnapshot(F.query(col(`${SQ}/subs`), F.orderBy("at", "desc"), F.limit(3000)),
    (q) => cb(q.docs.map((d) => { const x = d.data(EST); return { id: d.id, ...x, at: tsToDate(x.at), reviewedAt: tsToDate(x.reviewedAt) }; })),
    (e) => { console.warn("[hub] quest sign-offs", e); cb(null, e); });
}
export const submitQuest = (session, quest, { note, photo }) => F.addDoc(col(`${SQ}/subs`), {
  questId: quest.id, questTitle: quest.title, uid: session.uid, name: session.me.name,
  note: note || "", photo: photo || "", at: F.serverTimestamp(), status: "pending",
});
// Approve or send back. Approving a one-time quest also takes it off the board.
export async function reviewQuestSub(session, sub, { status, reviewNote, closeQuest }) {
  const b = F.writeBatch(db);
  b.update(docRef(`${SQ}/subs/${sub.id}`), { status, reviewNote: reviewNote || "", reviewedBy: session.me.name, reviewedAt: F.serverTimestamp() });
  if (closeQuest) b.update(docRef(`${SQ}/items/${sub.questId}`), { open: false, updatedAt: F.serverTimestamp(), updatedBy: session.me.name });
  await b.commit();
}
export const withdrawQuestSub = (sid) => F.deleteDoc(docRef(`${SQ}/subs/${sid}`));
