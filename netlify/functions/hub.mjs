// Netlify Function: POST /.netlify/functions/hub  { action, loc, ...data }
// Signed-in calls send "Authorization: Bearer <Firebase ID token>".
// GET ?media=<id> serves a stored picture (Netlify Blobs store "hub-media").
// Any other GET returns a health check (no secrets — just whether each setting is present).
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   FIREBASE_SERVICE_ACCOUNT  the entire service-account key file, pasted as-is
//   PIN_PEPPER                long random string; never change it once people have PINs
//   SETUP_CODE                phrase typed once on the first-time setup screen
import { getStore } from "@netlify/blobs";
import { makeApi, ApiError, readMedia, MEDIA_ID_RE } from "../lib/handlers.js";
import { readServiceAccount } from "../lib/credentials.js";

const mediaStore = () => getStore({ name: "hub-media", consistency: "strong" });

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
  // Phone notifications (web push). Loaded here so a problem with it can't affect sign-in.
  let webpush = null;
  try { webpush = (await import("web-push")).default; } catch (e) { console.warn("web-push unavailable:", e.message); }
  handle = makeApi({
    db,
    auth: { verifyIdToken: (t) => auth.verifyIdToken(t), createCustomToken: (u, c) => auth.createCustomToken(u, c) },
    now: () => new Date(),
    env: { PIN_PEPPER: process.env.PIN_PEPPER, SETUP_CODE: process.env.SETUP_CODE },
    // Connect to Blobs only when a picture is used, so a storage problem can't affect sign-in.
    media: {
      set: (...a) => mediaStore().set(...a),
      getWithMetadata: (...a) => mediaStore().getWithMetadata(...a),
    },
    push: webpush && {
      generateKeys: () => webpush.generateVAPIDKeys(),
      send: (subscription, body, keys) => webpush.sendNotification(subscription, body, {
        vapidDetails: { subject: "https://kavahub.netlify.app", publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24, urgency: "high",
      }),
    },
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
    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("media");
      if (id !== null) {
        if (!MEDIA_ID_RE.test(id)) return new Response("Not found", { status: 404 });
        const pic = await readMedia(mediaStore(), id);
        if (!pic) return new Response("Not found", { status: 404 });
        return new Response(pic.data, { status: 200, headers: {
          "Content-Type": pic.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff",
        } });
      }
      return json(200, await health());
    }
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
