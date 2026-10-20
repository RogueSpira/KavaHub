// Tile definition for "Opening & Closing". Not built yet: shows a "Coming soon" screen.
// When this tool is built, add an index.js here, point load() at it and set status to "live".
export default {
  id: "checklists",
  name: "Opening & Closing",
  icon: "✅",
  blurb: "Run the opening and closing checklists",
  accent: "lime",
  status: "soon",
  levels: { use: "Fill out checklists", manage: "Edit checklist templates and review past runs" },
  load: () => import("../_shared/soon.js"),
};
