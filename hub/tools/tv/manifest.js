// Tile definition for "TV Screens". Not built yet: shows a "Coming soon" screen.
// When this tool is built, add an index.js here, point load() at it and set status to "live".
export default {
  id: "tv",
  name: "TV Screens",
  icon: "📺",
  blurb: "Slides, events, specials, ticker and today's kavatenders on the TVs",
  accent: "aqua",
  status: "soon",
  levels: { use: "View and fix today's crew on the TVs", manage: "Edit all TV content, screens and themes" },
  load: () => import("../_shared/soon.js"),
};
