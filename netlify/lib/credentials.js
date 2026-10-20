// Reads the Firebase service-account credentials from environment variables.
import { ApiError } from "./handlers.js";

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

