// Tile definition for "Suggestion Box". Not built yet: shows a "Coming soon" screen.
// When this tool is built, add an index.js here, point load() at it and set status to "live".
export default {
  id: "suggestions",
  name: "Suggestion Box",
  icon: "💡",
  blurb: "Ideas to make Mandarin better",
  accent: "gold",
  status: "soon",
  levels: { use: "Submit suggestions", manage: "Read and respond to suggestions" },
  load: () => import("../_shared/soon.js"),
};
