// Starting data written when the owner first sets up a location.
// Access levels: 0 = hidden, 1 = use, 2 = manage.
// Tool ids must match the `id` in each hub/tools/<id>/manifest.js.
export const TOOL_IDS = ["tv", "checklists", "knowledge", "suggestions", "admin"];

export const DEFAULT_ROLES = {
  owner: {
    name: "Owner",
    rank: 100,
    system: true, // full access to everything; can't be edited or deleted
    perms: {},
  },
  manager: {
    name: "Manager",
    rank: 50,
    system: false,
    perms: { tv: 2, checklists: 2, knowledge: 2, suggestions: 2, admin: 0 },
  },
  kavatender: {
    name: "Kavatender",
    rank: 10,
    system: false,
    perms: { tv: 1, checklists: 1, knowledge: 1, suggestions: 1, admin: 0 },
  },
};

export const DEFAULT_TOOLS = Object.fromEntries(
  TOOL_IDS.map((id, i) => [id, { enabled: true, order: i }])
);

export const DEFAULT_SETTINGS = { autoLockSeconds: 120, timezone: "America/New_York" };
