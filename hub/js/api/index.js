// Picks the backend: real Firebase, or the in-memory demo when no config is set.
import { DEMO_MODE } from "../config.js";

const api = DEMO_MODE ? await import("./demo.js") : await import("./firebase.js");
export default api;
