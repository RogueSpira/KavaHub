// Tile definition for "Menu Maker": quick branded menus for event nights, ready to print.
export default {
  id: "menus",
  name: "Menu Maker",
  icon: "🧾",
  blurb: "Express menus in our branding, ready to print and laminate",
  accent: "magenta",
  status: "live",
  levels: { use: "Make, edit and print menus", manage: "Also delete anyone's menus" },
  load: () => import("./index.js"),
};
