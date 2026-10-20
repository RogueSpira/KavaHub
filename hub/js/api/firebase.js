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
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}
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
  return F.onSnapshot(F.query(col("users"), F.orderBy("name")), (q) => cb(q.docs.map((d) => ({ uid: d.id, ...d.data() }))));
}
export const createUser = (d) => call("adminCreateUser", d);
export const updateUser = (uid, patch) => call("adminUpdateUser", { uid, ...patch });
export const resetPin = (uid, pin) => call("adminResetPin", { uid, pin });

/* ---------- roles ---------- */
export const saveRole = (roleId, { name, perms }) => F.updateDoc(docRef(`roles/${roleId}`), { name, perms });
export const createRole = (name, rank) => call("adminCreateRole", { name, rank });
export const deleteRole = (roleId) => call("adminDeleteRole", { roleId });

/* ---------- tiles & settings ---------- */
export const saveTool = (toolId, cfg) => F.setDoc(docRef(`tools/${toolId}`), { enabled: !!cfg.enabled, order: cfg.order | 0 });
export const saveSettings = (settings) => F.updateDoc(docRef(""), { settings });

/* ---------- activity ---------- */
export function watchActivity(cb, max = 150) {
  return F.onSnapshot(F.query(col("activity"), F.orderBy("at", "desc"), F.limit(max)),
    (q) => cb(q.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, at: x.at?.toDate?.() || null }; })));
}
export async function log(session, tool, action, detail = "") {
  try {
    await F.addDoc(col("activity"), {
      at: F.serverTimestamp(), actorUid: session.uid, actorName: session.me.name,
      tool, action, detail: String(detail).slice(0, 300),
    });
  } catch (e) { console.warn("[hub] activity log failed", e); }
}
