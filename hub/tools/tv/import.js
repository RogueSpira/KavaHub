// One-time move from the old Google Sheets board into Kava Hub.
// fetchSheets() reads the old sheets straight from Google (they're shared "anyone with the link"),
// and convert() turns them into the new TV sections. convert() is plain data in, data out, so it's tested.
import { keyOf, WEEKDAYS, SLIDES, monthKey } from "../../js/tv-shared.js";

export const SHEET_IDS = {
  schedule: "1lbk-O6Qb5t_1KBA9Tgxji_sa39i6AM_3s1uRV4FLezI",
  events: "1U6c4x_pwu2lVmrOmiBpg9pdCj-r8b7CDOHgMzOeUZ_8",
  employees: "1LT-47KZFGmYwrQAVvNxV7A53VGC3byV70gCLTwDlFTk",
  specials: "13GGDgt5jwGHXZ8xOy7E3YVOelV4ntiSAKdqz9PFdHNk",
  screens: "1wr2USTjviFs5j52F1hfZfMk0plNP89qFje8gxwuS3yM",
  ticker: "1oZAN7E9dKQo5y6vkgJLNx-hDSnfK5G9jpWiyNFGhGz8",
  products: "1vTk7iFpMkr3WG1TV1yyfAzwwTsBn3-I_AN49lJj37SU",
  signature: "1n_vS_MBhTpATXZaORPPT7ncKk3eHrZtw3Dv8ZkVgq4Y",
};
export const COMMUNITY_FOLDER = "1t6FrOFtB-I-MdaJaKMP5Z3oQyRdiDb3E";

// Quote-aware CSV parser (handles commas inside cells like "Mon, July 27").
export function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  row.push(field); rows.push(row);
  return rows;
}

export async function fetchSheets(fetchFn = fetch) {
  const out = {}, failed = [];
  await Promise.all(Object.entries(SHEET_IDS).map(async ([k, id]) => {
    try {
      const res = await fetchFn(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&gid=0&_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      out[k] = parseCSV(await res.text());
    } catch { out[k] = []; failed.push(k); }
  }));
  return { rows: out, failed };
}

/* ---------------- helpers ---------------- */
const blank = (r) => !r || r.every((c) => String(c).trim() === "");
const t = (v) => String(v ?? "").trim();
// Old sheets used <b>…</b> for gold text; the new board uses **…**.
export function fromHtml(s) {
  return t(s).replace(/<\s*(b|strong)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "**$2**").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
const driveId = (u) => { const m = String(u).match(/\/d\/([A-Za-z0-9_-]{20,})/) || String(u).match(/[?&]id=([A-Za-z0-9_-]{20,})/); return m ? m[1] : ""; };
export const driveImg = (id) => `https://lh3.googleusercontent.com/d/${id}=w1600`;
const KNOWN = { christian: "/board/assets/christian.jpg", josh: "/board/assets/crew/josh.jpg", daniel: "/board/assets/crew/daniel.jpg", wheatyn: "/board/assets/crew/wheatyn.jpg" };
export function imageFrom(v) {
  v = t(v); if (!v) return "";
  const low = v.toLowerCase().replace(/^crew:\s*/, "");
  if (KNOWN[low]) return KNOWN[low];
  if (/^https?:\/\//i.test(v)) { const id = driveId(v); return id ? driveImg(id) : v.replace(/^http:/i, "https:"); }
  if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return driveImg(v);
  return "";
}
const slug = (s) => t(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "x";
const ALIAS = { wheaton: "wheatyn" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
function header(rows) { return (rows[0] || []).map((c) => t(c).toLowerCase()); }
function colOf(h, ...names) { for (const n of names) { const k = h.indexOf(n); if (k >= 0) return k; } return -1; }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "2026-10-24", "10/24", "10/24/26", "Oct 24", "October 24, 2026". Dates without a year that look
// more than 75 days old are taken as next year (fixes the old board's new-year bug).
export function parseDate(s, today = new Date()) {
  s = t(s); if (!s) return null; let m, d = null, hasYear = false;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { d = new Date(+m[1], +m[2] - 1, +m[3]); hasYear = true; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/))) { let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000; hasYear = !!m[3]; d = new Date(y, +m[1] - 1, +m[2]); }
  else if ((m = s.match(/^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi < 0) return null;
    hasYear = !!m[3]; d = new Date(m[3] ? +m[3] : today.getFullYear(), mi, +m[2]);
  }
  if (!d || isNaN(d)) return null;
  if (!hasYear && today - d > 75 * 864e5) d.setFullYear(d.getFullYear() + 1);
  return d;
}
// Recurring events in the old sheet had no date; the pattern was written in the banner/time/title.
export function patternFrom(text) {
  const s = t(text).toLowerCase();
  let weekday = -1;
  WEEKDAYS.forEach((w, i) => { if (weekday < 0 && (s.includes(w.toLowerCase()) || new RegExp(`\\b${w.slice(0, 3).toLowerCase()}s?\\b`).test(s))) weekday = i; });
  if (weekday < 0) return null;
  const nth = /\blast\b/.test(s) ? -1 : /\b(first|1st)\b/.test(s) ? 1 : /\b(second|2nd)\b/.test(s) ? 2 : /\b(third|3rd)\b/.test(s) ? 3 : /\b(fourth|4th)\b/.test(s) ? 4 : 0;
  return nth ? { repeat: "monthly", weekday, nth } : { repeat: "weekly", weekday };
}

const OLD_SLIDES = { kavatenders: "crew", spotlight: "tonight", trivia: "featured", everyweek: "weekly", comingup: "upnext", happy: "happyhour", calendar2: "calendar" };
export function slideFrom(key) {
  const k = t(key).toLowerCase();
  const id = OLD_SLIDES[k] || k;
  return SLIDES.some((s) => s.id === id) ? id : null;
}

/* ---------------- convert ---------------- */
// Returns { sections: { crew, events, ... }, notes: [strings for the person importing] }
export function convert(rows, today = new Date()) {
  const notes = [], sections = {};
  const todayKey = keyOf(today);

  // Staff photos + weekly schedule → crew
  {
    const roster = [], byId = {};
    const add = (name, photo) => {
      const raw = t(name).toLowerCase(); if (!raw) return null;
      const id = slug(ALIAS[raw] || raw);
      if (!byId[id]) { byId[id] = { id, name: cap(ALIAS[raw] || t(name)), photo: imageFrom(photo) || KNOWN[id] || "" }; roster.push(byId[id]); }
      else if (photo && !byId[id].photo) byId[id].photo = imageFrom(photo);
      return id;
    };
    const eh = header(rows.employees || []), iN = colOf(eh, "name"), iP = colOf(eh, "photo");
    for (const r of (rows.employees || []).slice(1)) if (!blank(r) && iN >= 0) add(r[iN], iP >= 0 ? r[iP] : "");
    const weekly = {};
    for (const r of (rows.schedule || []).slice(1)) {
      if (blank(r)) break;
      const day = WEEKDAYS.indexOf(cap(t(r[0]).toLowerCase()));
      if (day < 0) continue;
      weekly[day] = { opener: add(r[1]) || null, closer: add(r[2]) || null };
    }
    if (roster.length || Object.keys(weekly).length) {
      sections.crew = { roster, weekly };
      notes.push(`Who's Working: ${roster.length} people, ${Object.keys(weekly).length} days of the weekly schedule.`);
      const noPhoto = roster.filter((p) => !p.photo).map((p) => p.name);
      if (noPhoto.length) notes.push(`No photo found for ${noPhoto.join(", ")} — add one in Who's Working.`);
    }
  }

  // Events
  {
    const rs = rows.events || [], eh = header(rs);
    const c = { date: colOf(eh, "date"), time: colOf(eh, "time", "when"), banner: colOf(eh, "banner", "badge"), title: colOf(eh, "header 1", "header1", "header", "title"),
      details: colOf(eh, "details", "theme"), host: colOf(eh, "host"), image: colOf(eh, "image", "flyer", "photo", "graphic"), type: colOf(eh, "type") };
    const g = (r, k) => (k >= 0 ? t(r[k]) : "");
    const items = []; let past = 0; const unsure = [];
    for (const r of rs.slice(1)) {
      if (blank(r)) continue;
      const title = fromHtml(g(r, c.title)); if (!title) continue;
      const ev = { id: `${slug(title)}-${items.length + 1}`, title, time: g(r, c.time), banner: fromHtml(g(r, c.banner)), details: fromHtml(g(r, c.details)), host: fromHtml(g(r, c.host)), image: imageFrom(g(r, c.image)), active: true };
      const d = parseDate(g(r, c.date), today);
      if (d) {
        const key = keyOf(d);
        if (key < todayKey) { past++; continue; }
        Object.assign(ev, { repeat: "once", date: key });
      } else {
        const p = patternFrom(`${ev.banner} ${ev.time} ${title}`);
        if (!p) { unsure.push(title); Object.assign(ev, { repeat: "weekly", weekday: 4, active: false }); }
        else Object.assign(ev, p);
      }
      // The old board gave Trivia its own slide with "This Month's Theme Night" (from Details).
      if (g(r, c.type).toLowerCase() === "trivia" || (/trivia/i.test(title) && ev.repeat !== "once" && !items.some((x) => x.featured))) {
        ev.featured = true;
        if (ev.details) ev.themes = { [monthKey(today)]: ev.details };
        delete ev.details;
        const wd = WEEKDAYS[ev.weekday] || "Thursday";
        ev.themeNote = `The last ${wd} each month is a costume party — dress the theme!`;
        ev.lastNote = "Tonight is the costume party — come dressed for the theme!";
      }
      for (const k of Object.keys(ev)) if (ev[k] === "") delete ev[k];
      items.push(ev);
    }
    if (items.length) sections.events = { items };
    if (items.length || past) notes.push(`Events: ${items.length} brought over${past ? `, ${past} already-past ones left out` : ""}.`);
    if (unsure.length) notes.push(`Couldn't tell which day these repeat on, so they're switched off — open each one and pick the day: ${unsure.join(", ")}.`);
  }

  // Simple lists
  const list = (key, map) => {
    const rs = rows[key] || [], hd = header(rs), out = [];
    for (const r of rs.slice(1)) { if (blank(r)) continue; const v = map(r, hd); if (v) out.push(v); }
    return out;
  };
  const specials = list("specials", (r, hd) => { const n = fromHtml(r[colOf(hd, "name")]); return n ? { name: n, desc: fromHtml(r[colOf(hd, "description")]) } : null; });
  if (specials.length) { sections.specials = { items: specials }; notes.push(`Drink Specials: ${specials.length}.`); }
  const signature = list("signature", (r, hd) => {
    const d = fromHtml(r[colOf(hd, "drink")]);
    return d ? { drink: d, staff: fromHtml(r[colOf(hd, "staff")]), desc: fromHtml(r[colOf(hd, "description")]), image: imageFrom(r[colOf(hd, "image")]) } : null;
  });
  if (signature.length) { sections.signature = { items: signature }; notes.push(`Signature Drinks: ${signature.length}.`); }
  const products = list("products", (r, hd) => {
    const n = fromHtml(r[colOf(hd, "name")]); if (!n) return null;
    const imgs = t(r[colOf(hd, "image")]).split("|").map(t).filter(Boolean);
    const i2 = t(r[colOf(hd, "image 2", "image2")]); if (i2) imgs.push(i2);
    return { name: n, blurb: fromHtml(r[colOf(hd, "blurb")]), images: imgs.map(imageFrom).filter(Boolean).slice(0, 2) };
  });
  if (products.length) { sections.products = { items: products }; notes.push(`Know Your Botanicals: ${products.length}.`); }
  {
    const items = [];
    for (const r of (rows.ticker || []).slice(1)) {
      if (blank(r)) break;
      const msg = fromHtml(r[0]);
      if (msg && !/makes text gold/i.test(msg)) items.push(msg);
    }
    if (items.length) { sections.ticker = { items }; notes.push(`Ticker: ${items.length} messages.`); }
  }
  // Community photos keep coming live from the Google Drive folder (the only part that still uses Drive).
  sections.community = { driveFolder: COMMUNITY_FOLDER, footer: "Send your photos to **Christian@kavaandcompany.com**" };
  notes.push("Community Photos: shown live from the Google Drive folder, same as now.");

  // Screens
  {
    const rs = rows.screens || [], hd = header(rs), iS = colOf(hd, "screen"), iL = colOf(hd, "slides"), iT = colOf(hd, "theme");
    const screens = {};
    for (const r of rs.slice(1)) {
      if (blank(r) || iS < 0) continue;
      const id = t(r[iS]).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20); if (!id) continue;
      const ids = [...new Set((iL >= 0 ? t(r[iL]) : "").split(",").map(slideFrom).filter(Boolean))];
      screens[id] = { v: 2, name: `TV ${id}`, theme: t(r[iT]).toLowerCase() === "orange" ? "orange" : "green", seconds: 12,
        slides: (ids.length ? ids : SLIDES.filter((s) => s.id !== "feud").map((s) => s.id)).map((x) => ({ id: x })) };
    }
    if (Object.keys(screens).length) { sections.screens = screens; notes.push(`Screens: ${Object.keys(screens).map((k) => `TV ${k}`).join(", ")}.`); }
  }
  return { sections, notes };
}

// Every Google Drive picture in the converted sections (they get copied into the hub during import).
export const isDrive = (src) => /^https:\/\/lh3\.googleusercontent\.com\//.test(String(src || ""));
export async function copyDrivePictures(sections, copy, onProgress = () => {}) {
  const jobs = [];
  for (const p of sections.crew?.roster || []) if (isDrive(p.photo)) jobs.push([p, "photo", p.name]);
  for (const e of sections.events?.items || []) if (isDrive(e.image)) jobs.push([e, "image", e.title]);
  for (const x of sections.signature?.items || []) if (isDrive(x.image)) jobs.push([x, "image", x.drink]);
  for (const x of sections.products?.items || []) (x.images || []).forEach((src, i) => { if (isDrive(src)) jobs.push([x.images, i, x.name]); });
  const failed = [];
  for (const [n, [obj, key, label]] of jobs.entries()) {
    onProgress(n + 1, jobs.length);
    try { obj[key] = await copy(obj[key]); }
    catch { failed.push(label || "a picture"); obj[key] = ""; }
  }
  for (const x of sections.products?.items || []) x.images = (x.images || []).filter(Boolean);
  return { copied: jobs.length - failed.length, failed };
}
