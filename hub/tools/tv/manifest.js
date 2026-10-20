// Tile definition for "TV Screens" — controls the TV board at /board/.
export default {
  id: "tv",
  name: "TV Screens",
  icon: "📺",
  blurb: "Who's working, events, specials, ticker and what each TV shows",
  accent: "aqua",
  status: "live",
  levels: { use: "Set today's opener and closer, plus any parts given in TV Screens → Permissions", manage: "Change everything: events, slides, screens and permissions" },
  load: () => import("./index.js"),
};
