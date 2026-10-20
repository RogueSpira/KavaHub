export default {
  id: "knowledge",
  name: "Knowledge Bank",
  icon: "📚",
  blurb: "How-to guides, recipes and everything worth knowing",
  accent: "orange",
  status: "live",
  levels: { use: "Read and search articles", manage: "Write, edit and delete articles" },
  load: () => import("./index.js"),
};
