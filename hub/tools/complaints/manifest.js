// Tile definition for "Complaints". Not built yet: shows a "Coming soon" screen.
// When this tool is built, add an index.js here, point load() at it and set status to "live".
export default {
  id: "complaints",
  name: "Complaints",
  icon: "📝",
  blurb: "Report an issue privately",
  accent: "magenta",
  status: "soon",
  levels: { use: "Submit a complaint", manage: "Read complaints and record resolutions" },
  load: () => import("../_shared/soon.js"),
};
