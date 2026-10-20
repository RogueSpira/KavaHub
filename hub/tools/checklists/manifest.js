export default {
  id: "checklists",
  name: "Opening & Closing",
  icon: "✅",
  blurb: "Opening, Shift Change and Closing checklists",
  accent: "lime",
  status: "live",
  levels: { use: "Check off today's lists, see last night's close", manage: "Edit the lists and see the full history" },
  load: () => import("./index.js"),
};
