// Tile definition for "Inventory Requests". Not built yet: shows a "Coming soon" screen.
// When this tool is built, add an index.js here, point load() at it and set status to "live".
export default {
  id: "inventory",
  name: "Inventory Requests",
  icon: "📦",
  blurb: "Ask for supplies before they run out",
  accent: "orange",
  status: "soon",
  levels: { use: "Submit requests", manage: "Mark requests ordered or received" },
  load: () => import("../_shared/soon.js"),
};
