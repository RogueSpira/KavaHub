// Tile definition for "Side Quests": extra jobs outside the daily lists, with stars and a leaderboard.
export default {
  id: "quests",
  name: "Side Quests",
  icon: "⭐",
  blurb: "Extra jobs around the shop. Finish one, earn a star",
  accent: "purple",
  status: "live",
  levels: { use: "See the board, sign off quests (with a photo), see the leaderboard", manage: "Add quests and approve sign-offs" },
  load: () => import("./index.js"),
};
