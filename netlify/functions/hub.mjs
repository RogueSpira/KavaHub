// Netlify Function: POST /.netlify/functions/hub  { action, loc, ...data }
// Signed-in calls send "Authorization: Bearer <Firebase ID token>".
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   FIREBASE_SERVICE_ACCOUNT  the entire service-account key file, pasted as-is
//                             (raw JSON or base64 both work)
//   PIN_PEPPER   long random string; never change it once people have PINs
//   SETUP_CODE   phrase typed once on the first-time setup screen
// (The older three-variable form FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
//  FIREBASE_PRIVATE_KEY also still works.)
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore } from "firebase-admin/firestore";
import { makeApi, ApiError } from "../lib/handlers.js";

// Reads the Firebase service-account credentials from the environment.
export function readServiceAccount(env) {
  const raw = (env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT isn't a valid key file. Paste the whole file again.");
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT is missing parts of the key file. Paste the whole file again.");
    }
    return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    // Netlify stores the key on one line; turn the literal "\n"s back into line breaks.
    return { projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  throw new ApiError(500, "Server is missing its Firebase settings (FIREBASE_SERVICE_ACCOUNT).");
}

let handle; // reused across warm invocations
function init() {
  if (handle) return handle;
  const app = getApps()[0] || initializeApp({ credential: cert(readServiceAccount(process.env)) });
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
