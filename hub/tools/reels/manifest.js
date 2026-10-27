// Tile definition for "Reel Maker": branded vertical videos for Instagram Reels & Stories.
export default {
  id: "reels",
  name: "Reel Maker",
  icon: "🎬",
  blurb: "Short branded videos for Instagram Reels & Stories",
  accent: "orange",
  status: "live",
  levels: { use: "Make and download reels", manage: "Same as Use (nothing is stored)" },
  load: () => import("./index.js"),
};
