export default {
  id: "suggestions",
  name: "Suggestion Box",
  icon: "💡",
  blurb: "Ideas to make Mandarin better",
  accent: "gold",
  status: "live",
  levels: { use: "Post suggestions and see the board", manage: "Set status, respond, remove posts" },
  load: () => import("./index.js"),
};
