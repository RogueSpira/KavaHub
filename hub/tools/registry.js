// ===== Tool registry =====
// Every tile on the home screen comes from this list.
// To add a new tool:
//   1. Make a folder hub/tools/<id>/ with manifest.js (copy one of the others) and index.js
//      (index.js exports mount(el, ctx) — see tools/README.md).
//   2. Add one import line below.
//   3. Deploy. The tool appears in Admin → Roles & Access, hidden from everyone
//      until you give a role (or a person) access.
import tv from "./tv/manifest.js";
import checklists from "./checklists/manifest.js";
import inventory from "./inventory/manifest.js";
import suggestions from "./suggestions/manifest.js";
import complaints from "./complaints/manifest.js";
import admin from "./admin/manifest.js";

export const TOOLS = [tv, checklists, inventory, suggestions, complaints, admin];
export const toolById = (id) => TOOLS.find((t) => t.id === id);
