export default {
  id: "admin",
  name: "Administration",
  icon: "🛠️",
  blurb: "People, PINs, roles & access, tiles and the activity log",
  accent: "purple",
  status: "live",
  minLevel: 2, // only shown to people with Manage access
  levels: { use: "(no effect — needs Manage)", manage: "Add people, reset PINs, change access" },
  load: () => import("./index.js"),
};
