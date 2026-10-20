// Netlify Function: POST /.netlify/functions/hub  { action, loc, ...data }
// Signed-in calls send "Authorization: Bearer <Firebase ID token>".
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  ← from the service-account key file
//   PIN_PEPPER   long random string; never change it once people have PINs
//   SETUP_CODE   phrase typed once on the first-time setup screen
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore } from "firebase-admin/firestore";
import { makeApi, ApiError } from "../lib/handlers.js";

let handle; // reused across warm invocations
function init() {
  if (handle) return handle;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new ApiError(500, "Server is missing its Firebase settings.");
  }
  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Netlify stores the key on one line; turn the literal "\n"s back into line breaks.
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  const db = initializeFirestore(app, { preferRest: true }); // faster cold starts
  const auth = getAuth(app);
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

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;
  try {
    const { action, ...data } = body || {};
    return json(200, await init()(String(action || ""), data, idToken));
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.message });
    console.error("[hub] unexpected error", e);
    return json(500, { error: "Something went wrong on the server. Try again." });
  }
};
