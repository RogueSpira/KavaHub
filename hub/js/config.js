// ===== Kava Hub configuration =====
// 1. Paste your Firebase web app config here (Firebase console → Project settings → Your apps).
//    Set to null to run in DEMO MODE with sample data (or add ?demo to the URL).
export const firebaseConfig = {
  apiKey: "AIzaSyCe2FE8x2vscdUnPSUY1fCEsEHtwqfV5PE",
  authDomain: "kavahub-eff1b.firebaseapp.com",
  projectId: "kavahub-eff1b",
  storageBucket: "kavahub-eff1b.firebasestorage.app",
  messagingSenderId: "532917204126",
  appId: "1:532917204126:web:6080d1c1a60c137ff0f78f",
};
/* example:
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "…",
  appId: "…",
};
*/

// 2. Which location this hub belongs to. Each location's data is kept separate,
//    so another Kava & Co. location could later run its own copy (e.g. ?loc=southside).
const params = new URLSearchParams(location.search);
export const LOCATION_ID = (params.get("loc") || "mandarin").toLowerCase();

// The Netlify Function that checks PINs and manages people (netlify/functions/hub.mjs).
export const API_URL = "/.netlify/functions/hub";

// Firebase JS SDK version loaded from Google's CDN.
export const FIREBASE_SDK_VERSION = "12.19.0";

export const DEMO_MODE = !firebaseConfig || params.has("demo");
export const PIN_LENGTH = 4;
