// Recurring side quests. A quest with `every` set reopens on a schedule, and each time it opens
// one person can do it. Nothing runs in the background: the "round" (the date it last opened) is
// worked out from today's date, and a sign-off records which round it was for.
//   every: "day"                    every day
//   every: "week",  on: [1, 4]      on those weekdays (0 = Sunday)
//   every: "month", on: [15]        on that day of the month (31 = the last day in short months)
// Days follow the business day (rolls over at 5 AM), same as the TV board.
import { keyOf, dateOfKey, WEEKDAYS } from "../../js/tv-shared.js";

export const isRecurring = (q) => !!q && ["day", "week", "month"].includes(q.every);

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthDay = (y, m, dom) => new Date(y, m, Math.min(dom, new Date(y, m + 1, 0).getDate()));
const onDays = (q) => (Array.isArray(q.on) ? q.on.filter((n) => Number.isInteger(n)) : []);

// Does the quest open on this date?
export function opensOn(q, d) {
  if (q.every === "day") return true;
  if (q.every === "week") return onDays(q).includes(d.getDay());
  if (q.every === "month") {
    const dom = onDays(q)[0] || 1;
    return keyOf(monthDay(d.getFullYear(), d.getMonth(), dom)) === keyOf(d);
  }
  return false;
}

// The round in effect on `todayKey`: the latest opening on or before today (and not before the
// quest's start date). "" if it hasn't opened yet.
export function roundOf(q, todayKey) {
  if (!isRecurring(q)) return "";
  if (q.every === "week" && !onDays(q).length) return "";
  const today = dateOfKey(todayKey), start = q.unlockOn || "";
  let d = today;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    const k = keyOf(d);
    if (start && k < start) return "";
    if (opensOn(q, d)) return k;
  }
  return "";
}

// The next opening after `todayKey`.
export function nextRound(q, todayKey) {
  if (!isRecurring(q)) return "";
  if (q.every === "week" && !onDays(q).length) return "";
  let d = addDays(dateOfKey(todayKey), 1);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    if (q.unlockOn && keyOf(d) < q.unlockOn) continue;
    if (opensOn(q, d)) return keyOf(d);
  }
  return "";
}

const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const SHORT = WEEKDAYS.map((w) => w.slice(0, 3));

// "Every day" · "Every Mon & Thu" · "Monthly on the 15th"
export function scheduleLabel(q) {
  if (q.every === "day") return "Every day";
  if (q.every === "week") {
    const days = [...onDays(q)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (days.length === 7) return "Every day";
    if (days.length === 1) return `Every ${WEEKDAYS[days[0]]}`;
    return `Every ${days.slice(0, -1).map((d) => SHORT[d]).join(", ")} & ${SHORT[days[days.length - 1]]}`;
  }
  if (q.every === "month") { const dom = onDays(q)[0] || 1; return dom >= 31 ? "Monthly on the last day" : `Monthly on the ${ord(dom)}`; }
  return "";
}

// "tomorrow" · "Thursday" · "Nov 15"
export function whenLabel(key, todayKey) {
  const d = dateOfKey(key), days = Math.round((d - dateOfKey(todayKey)) / 86400000);
  if (days === 1) return "tomorrow";
  if (days > 1 && days < 7) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
