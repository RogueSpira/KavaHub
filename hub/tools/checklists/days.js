// Shared helpers for the Opening & Closing checklists.

export const LISTS = [
  { id: "opening", name: "Opening", icon: "☀️" },
  { id: "shift", name: "Shift Change", icon: "🔄" },
  { id: "closing", name: "Closing", icon: "🌙" },
];
export const listMeta = (id) => LISTS.find((l) => l.id === id);

// The "business day" rolls over at 5 AM, so a close that finishes after midnight
// still counts as the night before.
export const ROLLOVER_HOUR = 5;

const pad = (n) => String(n).padStart(2, "0");
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function businessKey(now = new Date()) {
  return keyOf(new Date(now.getTime() - ROLLOVER_HOUR * 3600 * 1000));
}
export function dayStartOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
export function prevKey(key) {
  const d = dayStartOf(key);
  d.setDate(d.getDate() - 1);
  return keyOf(d);
}
export function dayLabel(key, opts = { weekday: "long", month: "short", day: "numeric" }) {
  return dayStartOf(key).toLocaleDateString([], opts);
}
export function timeLabel(d) {
  if (!d) return "";
  d = d.toDate ? d.toDate() : new Date(d);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Which list to show first, by time of day.
export function defaultList(now = new Date()) {
  const h = now.getHours();
  if (h >= ROLLOVER_HOUR && h < 12) return "opening";
  if (h >= 12 && h < 18) return "shift";
  return "closing";
}

// Summary of one day's run of a list. `run` is the saved day doc (or null),
// `template` the current list (used for today, when nothing is saved yet).
export function summarize(run, template) {
  const items = run?.items?.length ? run.items : (template?.items || []);
  const checks = run?.checks || {};
  const done = items.filter((i) => checks[i.id]).length;
  return { items, checks, done, total: items.length, skipped: items.filter((i) => !checks[i.id]) };
}

export const newItemId = () => Math.random().toString(36).slice(2, 10);
