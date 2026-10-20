// Shared by the TV board (hub/board/) and the TV Screens tool in the hub.
// Everything about what the TVs show is stored under locations/{loc}/tv/{docId}:
//   config     screens (which slides, order, seconds, theme) + who may edit each section
//   crew       roster (names + photos), weekly opener/closer, and today's changes
//   events     events with structured repeats
//   welcome, happyhour, specials, signature, products, community, ticker, qr   slide content

// Content areas. Each one can be given to roles in TV Screens → Permissions.
export const SECTIONS = [
  { id: "crew", name: "Who's Working", icon: "🧑‍🍳", blurb: "Today's opener and closer, the weekly pattern, and staff photos" },
  { id: "events", name: "Events", icon: "📅", blurb: "Tonight, Every Week, Up Next and the calendar" },
  { id: "happyhour", name: "Happy Hour", icon: "⏰", blurb: "Happy hour times" },
  { id: "specials", name: "Drink Specials", icon: "🥤", blurb: "The special menu" },
  { id: "signature", name: "Signature Drinks", icon: "⭐", blurb: "Staff signature drinks" },
  { id: "products", name: "Know Your Botanicals", icon: "🌿", blurb: "Product education, one per showing" },
  { id: "community", name: "Community Photos", icon: "📸", blurb: "Photo collage of the Kava family" },
  { id: "ticker", name: "Ticker", icon: "📰", blurb: "Scrolling messages along the bottom" },
  { id: "welcome", name: "Welcome", icon: "👋", blurb: "The welcome slide" },
  { id: "qr", name: "QR & Links", icon: "🔗", blurb: "Events QR, live vote results and the Feud survey" },
];
export const SECTION_IDS = SECTIONS.map((s) => s.id);
export const sectionById = (id) => SECTIONS.find((s) => s.id === id);

// Slides a screen can show. Event slides only appear when there's something to show.
export const SLIDES = [
  { id: "welcome", name: "Welcome", section: "welcome" },
  { id: "happyhour", name: "Happy Hour", section: "happyhour" },
  { id: "crew", name: "Your Kavatenders Today", section: "crew" },
  { id: "tonight", name: "Tonight / Coming Up Next", section: "events" },
  { id: "weekly", name: "Every Week", section: "events" },
  { id: "upnext", name: "Up Next", section: "events" },
  { id: "calendar", name: "Calendar", section: "events" },
  { id: "specials", name: "Drink Specials", section: "specials" },
  { id: "signature", name: "Signature Drinks", section: "signature" },
  { id: "products", name: "Know Your Botanicals", section: "products" },
  { id: "community", name: "Community Photos", section: "community" },
  { id: "qr", name: "Scan for Events", section: "qr" },
  { id: "votes", name: "Live Vote Results", section: "qr" },
  { id: "feud", name: "Feud Survey QR", section: "qr" },
];
export const slideById = (id) => SLIDES.find((s) => s.id === id);

export const DEFAULT_SCREEN = {
  name: "Any TV", theme: "green", seconds: 12,
  slides: SLIDES.filter((s) => s.id !== "feud").map((s) => ({ id: s.id })),
};

// Who may edit each section when nothing has been set yet (Manage can always edit everything).
export const DEFAULT_PERMS = { crew: ["kavatender", "manager"] };

export const DEFAULTS = {
  welcome: { eyebrow: "Your Island Off Mandarin", headline: "Come hang out with us." },
  happyhour: {
    title: "Happy Hour", sub: "Three times a day, every day",
    slots: [
      { label: "Morning", start: "10:00", end: "11:00" },
      { label: "Afternoon", start: "14:00", end: "16:00" },
      { label: "Night", start: "21:00", end: "22:00" },
    ],
  },
  qr: {
    title: "Scan for Events", text: "Trivia, comedy, open mic, food trucks & more — the full calendar across all our locations.",
    url: "https://kavaandcompany.com/events",
    voteSite: "https://kavavote.netlify.app",
    feudSurvey: "https://kavafeud.netlify.app/feud-survey.html",
  },
  ticker: { items: [] },
  specials: { items: [] }, signature: { items: [] }, products: { items: [] },
  community: { photos: [], footer: "" },
  events: { items: [] },
  crew: { roster: [], weekly: {}, days: {} },
};
export const withDefaults = (id, doc) => ({ ...(DEFAULTS[id] || {}), ...(doc || {}) });

/* ---------------- days ---------------- */
export const ROLLOVER_HOUR = 5; // business day changes at 5 AM, same as the checklists
const pad = (n) => String(n).padStart(2, "0");
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const businessDate = (now = new Date()) => {
  const d = new Date(now.getTime() - ROLLOVER_HOUR * 3600 * 1000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
export const businessKey = (now = new Date()) => keyOf(businessDate(now));
export const dateOfKey = (key) => { const [y, m, d] = String(key).split("-").map(Number); return new Date(y, m - 1, d); };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const NTH = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", "-1": "Last" };

/* ---------------- crew ---------------- */
// Today's opener/closer: a change made for today wins, otherwise the weekly pattern.
export function crewFor(crew, now = new Date()) {
  const c = withDefaults("crew", crew);
  const date = businessDate(now);
  const today = c.days?.[keyOf(date)];
  const weekly = c.weekly?.[date.getDay()] || {};
  const pick = (k) => (today && today[k] !== undefined ? today[k] : weekly[k]) || null;
  const person = (id) => (id ? c.roster.find((p) => p.id === id) || null : null);
  return { opener: person(pick("opener")), closer: person(pick("closer")), changed: !!today, changedBy: today?.by || null };
}

/* ---------------- events ---------------- */
// An event's repeat: { repeat: "once", date } | { repeat: "weekly", weekday } | { repeat: "monthly", weekday, nth: 1-4 | -1 }
export function occursOn(ev, date) {
  if (!ev || ev.active === false) return false;
  const key = keyOf(date);
  if (ev.until && key > ev.until) return false;
  if (ev.from && key < ev.from) return false;
  if (ev.repeat === "once") return ev.date === key;
  if (Number(ev.weekday) !== date.getDay()) return false;
  if (ev.repeat === "weekly") return true;
  if (ev.repeat === "monthly") {
    const nth = Number(ev.nth);
    if (nth === -1) { const n = new Date(date); n.setDate(n.getDate() + 7); return n.getMonth() !== date.getMonth(); }
    return Math.ceil(date.getDate() / 7) === nth;
  }
  return false;
}
// "8:00 PM" / "20:00" → minutes, for ordering events on the same day.
export function timeMinutes(t) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/i.exec(String(t || "").trim());
  if (!m) return 24 * 60;
  let h = Number(m[1]); const min = Number(m[2] || 0); const ap = m[3]?.[0].toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}
// Every occurrence from `from` for `days` days: [{ ev, date, key }], in time order.
export function occurrences(events, from = businessDate(), days = 45) {
  const out = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    for (const ev of events || []) if (occursOn(ev, d)) out.push({ ev, date: d, key: keyOf(d) });
  }
  return out.sort((a, b) => a.date - b.date || timeMinutes(a.ev.time) - timeMinutes(b.ev.time));
}
export function repeatLabel(ev) {
  if (!ev) return "";
  if (ev.repeat === "once") return ev.date ? dateOfKey(ev.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "No date";
  const wd = WEEKDAYS[Number(ev.weekday)] || "?";
  if (ev.repeat === "weekly") return `Every ${wd}`;
  if (ev.repeat === "monthly") return `${NTH[String(ev.nth)] || "?"} ${wd} monthly`;
  return "";
}
export const isRecurring = (ev) => ev?.repeat === "weekly" || ev?.repeat === "monthly";

/* ---------------- happy hour ---------------- */
const hm = (s) => { const [h, m] = String(s || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export function fmtTime(s, withAmPm = true) {
  const [h, m] = String(s || "0:0").split(":").map(Number);
  const h12 = h % 12 || 12, ap = h >= 12 ? "PM" : "AM";
  return `${h12}${m ? `:${pad(m)}` : ""}${withAmPm ? ` ${ap}` : ""}`;
}
export function fmtRange(start, end) {
  const sameHalf = (hm(start) >= 720) === (hm(end) >= 720);
  return `${fmtTime(start, !sameHalf)}–${fmtTime(end)}`;
}
// The happy hour happening right now, if any: { slot, minutesLeft }.
export function happyHourNow(slots, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const slot of slots || []) {
    const s = hm(slot.start), e = hm(slot.end);
    if (mins >= s && mins < e) return { slot, minutesLeft: e - mins };
  }
  return null;
}

/* ---------------- text ---------------- */
// Ticker / short text: **bold** becomes highlighted. Returns [{ text, bold }] (never HTML).
export function boldParts(text) {
  const out = []; const re = /\*\*([^*]+)\*\*/g; let last = 0, m;
  const s = String(text || "");
  while ((m = re.exec(s))) { if (m.index > last) out.push({ text: s.slice(last, m.index) }); out.push({ text: m[1], bold: true }); last = re.lastIndex; }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
// Pictures we'll show: uploaded to the hub, board assets, or https links.
export const okImage = (src) => typeof src === "string" && (
  /^\/\.netlify\/functions\/hub\?media=[a-z0-9.-]+$/.test(src) || /^\/board\/assets\/[a-z0-9/_.-]+$/i.test(src) || /^https:\/\//.test(src) || /^data:image\//.test(src));
