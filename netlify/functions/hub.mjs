// Netlify Function: POST /.netlify/functions/hub  { action, loc, ...data }
// Signed-in calls send "Authorization: Bearer <Firebase ID token>".
// GET returns a health check (no secrets — just whether each setting is present).
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   FIREBASE_SERVICE_ACCOUNT  the entire service-account key file, pasted as-is
//   PIN_PEPPER                long random string; never change it once people have PINs
//   SETUP_CODE                phrase typed once on the first-time setup screen
import { makeApi, ApiError } from "../lib/handlers.js";
import { readServiceAccount } from "../lib/credentials.js";

let handle; // reused across warm invocations
async function init() {
  if (handle) return handle;
  let admin;
  try {
    // Loaded here (not at the top) so a loading problem comes back as a readable error.
    const [app, auth, fs] = await Promise.all([
      import("firebase-admin/app"), import("firebase-admin/auth"), import("firebase-admin/firestore"),
    ]);
    admin = { ...app, ...auth, ...fs };
  } catch (e) {
    throw new ApiError(500, `Server couldn't load Firebase (${e.message}).`);
  }
  const creds = readServiceAccount(process.env);
  let app, db, auth;
  try {
    app = admin.getApps()[0] || admin.initializeApp({ credential: admin.cert(creds) });
    db = admin.initializeFirestore(app, { preferRest: true });
    auth = admin.getAuth(app);
  } catch (e) {
    throw new ApiError(500, `Server couldn't start Firebase (${e.message}). Check FIREBASE_SERVICE_ACCOUNT.`);
  }
  handle = makeApi({
    db,
    auth: { verifyIdToken: (t) => auth.verifyIdToken(t), createCustomToken: (u, c) => auth.createCustomToken(u, c) },
    now: () => new Date(),
    env: { PIN_PEPPER: process.env.PIN_PEPPER, SETUP_CODE: process.env.SETUP_CODE },
  });
  return handle;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function health() {
  let firebaseAdmin = "ok";
  try { await import("firebase-admin/app"); } catch (e) { firebaseAdmin = `failed: ${e.message}`; }
  let serviceAccount = "missing";
  try { readServiceAccount(process.env); serviceAccount = "ok"; } catch (e) { serviceAccount = e.message; }
  return {
    ok: firebaseAdmin === "ok" && serviceAccount === "ok" && !!process.env.PIN_PEPPER && !!process.env.SETUP_CODE,
    node: process.version,
    firebaseAdmin,
    serviceAccount,
    pinPepper: process.env.PIN_PEPPER ? "set" : "missing",
    setupCode: process.env.SETUP_CODE ? "set" : "missing",
  };
}

export default async (req) => {
  try {
    if (req.method === "GET") return json(200, await health());
    if (req.method !== "POST") return json(405, { error: "Use POST." });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
    const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;
    const { action, ...data } = body || {};
    const run = await init();
    return json(200, await run(String(action || ""), data, idToken));
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.message });
    console.error("[hub] unexpected error", e);
    return json(500, { error: `Something went wrong on the server (${e?.message || e}).` });
  }
};
