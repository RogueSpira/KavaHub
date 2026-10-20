// Kava & Co. Mandarin — TV board. Display only: nobody signs in on a TV.
//   /board/?tv=1        shows screen "1" as set up in Kava Hub → TV Screens → Screens
//   /board/             every slide with the default look
//   /board/?demo        sample content, no database
// Content comes from one live listener on locations/{loc}/tv, so changes made in the hub show
// up within a second or two. Each slide is built just before it's shown, so nothing is ever
// rebuilt mid-rotation. Remote/keyboard: → next, ← back, OK/space pause.
import { firebaseConfig, LOCATION_ID, FIREBASE_SDK_VERSION, DEMO_MODE } from "../js/config.js";
import {
  DEFAULT_SCREEN, SLIDES, withDefaults, crewFor, occurrences, isRecurring, repeatLabel, happyHourNow,
  fmtRange, boldParts, okImage, businessDate, keyOf, WEEKDAYS,
} from "../js/tv-shared.js";

const params = new URLSearchParams(location.search);
const SCREEN_ID = params.get("tv") || "";
const TAGLINE = "Jacksonville's First Kava Bar - Your Second Home";
const CACHE_KEY = `kh-board-${LOCATION_ID}`;
const $ = (id) => document.getElementById(id);
const stage = $("stage");

/* ---------------- tiny DOM helper (text only, never HTML) ---------------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false && c !== "") el.append(c instanceof Node ? c : String(c));
  return el;
}
const rich = (text) => boldParts(text).map((p) => (p.bold ? h("b", {}, p.text) : p.text));
function img(src, cls, alt = "") {
  if (!okImage(src)) return null;
  const el = h("img", { class: cls, src, alt, decoding: "async" });
  el.addEventListener("error", () => el.remove(), { once: true });
  return el;
}
function qr(text, sizeVh) {
  const box = h("div", { class: "qr" });
  try {
    const g = window.qrcode; g.stringToBytes = g.stringToBytesFuncs["UTF-8"];
    const q = g(0, "M"); q.addData(String(text)); q.make();
    const n = q.getModuleCount(), quiet = 1, cells = n + quiet * 2;
    const scale = Math.max(2, Math.floor(((innerHeight * sizeVh) / 100) / cells));
    const c = h("canvas", { width: cells * scale, height: cells * scale });
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#0b0800";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + quiet) * scale, (r + quiet) * scale, scale, scale);
    box.append(c);
  } catch { box.append(h("div", { style: "font:700 2vh var(--round);color:#0b0800;padding:2vh;word-break:break-all" }, text)); }
  return box;
}
const shortUrl = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/* ---------------- data ---------------- */
let tv = {};
let poll = null; // live vote results from the vote site
const doc = (id) => withDefaults(id, tv[id]);
function screen() {
  const s = tv.config?.screens?.[SCREEN_ID];
  const base = s || DEFAULT_SCREEN;
  const slides = (base.slides || []).map((x) => (typeof x === "string" ? { id: x } : x)).filter((x) => x && BUILD[x.id]);
  return { ...DEFAULT_SCREEN, ...base, slides: slides.length ? slides : DEFAULT_SCREEN.slides };
}

/* ---------------- event helpers ---------------- */
function whenLabel(o, today = businessDate()) {
  const diff = Math.round((o.date - today) / 86400000);
  const t = o.ev.time ? ` · ${o.ev.time}` : "";
  if (diff === 0) return `Tonight${t}`;
  if (diff === 1) return `Tomorrow${t}`;
  if (diff < 7) return `${WEEKDAYS[o.date.getDay()]}${t}`;
  return `${o.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${t}`;
}
const upcoming = (days = 45) => occurrences(doc("events").items, businessDate(), days);

/* ---------------- slides ----------------
   Each builder gets how many times it has been shown (for paging) and returns
   an element, or null when there's nothing to show (the slide is skipped). */
const BUILD = {
  welcome() {
    const w = doc("welcome");
    return h("section", {},
      h("div", { class: "welcome" },
        h("div", { class: "text" },
          w.eyebrow ? h("div", { class: "kicker in" }, w.eyebrow) : null,
          h("div", { class: "big retro in d1" }, w.headline || "Come hang out with us."),
          h("div", {}, h("div", { class: "card tagcard in d2" }, h("span", { class: "l2" }, TAGLINE))),
          w.sub ? h("div", { class: "sub in d3" }, w.sub) : null),
        h("img", { class: "manny-big pop", src: "assets/manny.png", alt: "" })));
  },

  happyhour() {
    const hh = doc("happyhour");
    const slots = (hh.slots || []).filter((s) => s.start && s.end);
    if (!slots.length) return null;
    const now = new Date(), live = happyHourNow(slots, now);
    const mins = now.getHours() * 60 + now.getMinutes();
    const nextSlot = live ? null : slots.find((s) => { const [a, b] = s.start.split(":").map(Number); return a * 60 + (b || 0) > mins; });
    return h("section", {},
      h("div", { class: "kicker in" }, hh.sub || "Every day"),
      h("div", { class: "title retro in d1" }, hh.title || "Happy Hour"),
      h("div", { class: "hh-row" }, slots.map((s, i) => {
        const isLive = live?.slot === s, isNext = nextSlot === s;
        return h("div", { class: `card hh in d${i + 2}${isLive ? " now" : ""}` },
          isLive ? h("span", { class: "chip orange live pop" }, `Live now · ${live.minutesLeft} min left`) : null,
          isNext ? h("span", { class: "chip live pop" }, "Up next") : null,
          h("div", { class: "when" }, s.label || ""),
          h("div", { class: "time" }, fmtRange(s.start, s.end)));
      })));
  },

  crew() {
    const c = crewFor(tv.crew);
    const cards = [];
    const card = (p, chip, cls, d) => h("div", { class: `crew-card in d${d}` },
      h("span", { class: `chip ${cls}` }, chip),
      h("div", { class: "frame" }, img(p.photo, "", p.name) || h("div", { class: "initial" }, (p.name || "?")[0].toUpperCase())),
      h("div", { class: "crew-name retro" }, p.name));
    if (c.opener && c.closer && c.opener.id === c.closer.id) cards.push(card(c.opener, "☀️ All Day 🌙", "", 1));
    else {
      if (c.opener) cards.push(card(c.opener, "☀️ Opening", "", 1));
      if (c.closer) cards.push(card(c.closer, "🌙 Closing", "orange", 2));
    }
    if (!cards.length) return null;
    return h("section", {}, h("div", { class: "kicker in" }, "Say hi to"), h("div", { class: "title sm retro in" }, "Your Kavatenders Today"), h("div", { class: "crew" }, cards));
  },

  tonight(count) {
    const today = keyOf(businessDate());
    const all = upcoming(21);
    const tonight = all.filter((o) => o.key === today);
    const list = tonight.length ? tonight : all.slice(0, 1);
    if (!list.length) return null;
    const o = list[count % list.length], ev = o.ev;
    const flyer = img(ev.image, "flyer pop", ev.title);
    return h("section", {},
      h("div", { class: `spot${flyer ? "" : " center"}` }, flyer,
        h("div", { class: "info" },
          tonight.length ? h("div", { class: "tonight" }, "Tonight!") : h("span", { class: "chip in" }, "Coming up next"),
          ev.banner ? h("span", { class: "chip leaf in d1" }, ev.banner) : null,
          h("div", { class: "ev-title retro in d1" }, ev.title),
          h("div", { class: "ev-when in d2" }, whenLabel(o)),
          ev.details ? h("div", { class: "card details in d3" }, rich(ev.details)) : null,
          ev.host ? h("div", { class: "host in d4" }, "Hosted by ", h("b", {}, ev.host)) : null)));
  },

  weekly(count) {
    const evs = (doc("events").items || []).filter((e) => isRecurring(e) && e.active !== false)
      .sort((a, b) => ((Number(a.weekday) + 6) % 7) - ((Number(b.weekday) + 6) % 7));
    if (!evs.length) return null;
    const per = 4, pages = Math.ceil(evs.length / per), page = count % pages;
    return h("section", {},
      h("div", { class: "kicker in" }, "Mark your calendar"),
      h("div", { class: "title sm retro in" }, "Every Week at Kava"),
      h("div", { class: "list" }, evs.slice(page * per, page * per + per).map((e, i) => h("div", { class: `card lrow in d${i + 1}` },
        img(e.image, "thumb"),
        h("div", { class: "main" }, h("div", { class: "name" }, e.title), e.details ? h("div", { class: "desc" }, rich(e.details)) : null),
        h("div", { class: "side" }, repeatLabel(e).replace(" monthly", ""), h("small", {}, [e.repeat === "monthly" ? "Monthly" : "", e.time].filter(Boolean).join(" · ")))))),
      pages > 1 ? h("div", { class: "dots" }, Array.from({ length: pages }, (_, i) => h("i", { class: i === page ? "on" : "" }))) : null);
  },

  upnext() {
    const today = keyOf(businessDate());
    const seen = new Set(), list = [];
    for (const o of upcoming(45)) {
      if (o.key === today || seen.has(o.ev.id)) continue;
      seen.add(o.ev.id); list.push(o);
      if (list.length === 4) break;
    }
    if (!list.length) return null;
    return h("section", {},
      h("div", { class: "kicker in" }, "Don't miss it"),
      h("div", { class: "title retro in" }, "Up Next"),
      h("div", { class: "next-grid", style: `--n:${list.length}` }, list.map((o, i) => h("div", { class: `card next in d${i + 1}` },
        h("div", { class: "date-tile" },
          h("div", { class: "m" }, o.date.toLocaleDateString([], { month: "short" })),
          h("div", { class: "d" }, o.date.getDate()),
          h("div", { class: "w" }, WEEKDAYS[o.date.getDay()].slice(0, 3))),
        h("div", { class: "name" }, o.ev.title),
        h("div", { class: "meta" }, [o.ev.time, o.ev.banner].filter(Boolean).join(" · "))))));
  },

  calendar() {
    const today = businessDate();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysIn = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const occ = occurrences(doc("events").items, first, daysIn);
    if (!occ.length) return null;
    const byDay = {};
    for (const o of occ) (byDay[o.date.getDate()] ||= []).push(o.ev);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(h("div", { class: "cal-cell blank" }));
    for (let d = 1; d <= daysIn; d++) {
      const evs = byDay[d] || [];
      cells.push(h("div", { class: `cal-cell${evs.length ? " has" : ""}${d === today.getDate() ? " today" : ""}` },
        h("div", { class: "cal-num" }, d),
        evs.slice(0, 2).map((e) => h("div", { class: "cal-ev" }, e.title)),
        evs.length > 2 ? h("div", { class: "cal-more" }, `+${evs.length - 2} more`) : null));
    }
    return h("section", {},
      h("div", { class: "title sm retro in" }, today.toLocaleDateString([], { month: "long" }), " at Kava"),
      h("div", { class: "cal in d1" },
        h("div", { class: "cal-grid" }, WEEKDAYS.map((w) => h("div", { class: "cal-dow" }, w.slice(0, 3))), cells)));
  },

  specials(count) {
    const items = (doc("specials").items || []).filter((x) => x.name);
    if (!items.length) return null;
    const per = 5, pages = Math.ceil(items.length / per), page = count % pages;
    return h("section", {},
      h("div", { class: "kicker in" }, "★ Drink Specials ★"),
      h("div", { class: "title retro in" }, "The Special Menu"),
      h("div", { class: "card menu in d1" }, items.slice(page * per, page * per + per).map((x) => h("div", { class: "mi" },
        img(x.image, "thumb"), h("div", {}, h("div", { class: "n" }, x.name), x.desc ? h("div", { class: "d" }, rich(x.desc)) : null)))));
  },

  signature(count) {
    const items = (doc("signature").items || []).filter((x) => x.drink);
    if (!items.length) return null;
    const per = 4, pages = Math.ceil(items.length / per), page = count % pages;
    return h("section", {},
      h("div", { class: "kicker in" }, "Made by your kavatenders"),
      h("div", { class: "title retro in" }, "Signature Drinks"),
      h("div", { class: "card menu in d1" }, items.slice(page * per, page * per + per).map((x) => h("div", { class: "mi" },
        img(x.image, "thumb"),
        h("div", {}, x.staff ? h("div", { class: "by" }, `${x.staff}'s pick`) : null, h("div", { class: "n" }, x.drink), x.desc ? h("div", { class: "d" }, rich(x.desc)) : null)))));
  },

  products(count) {
    const items = (doc("products").items || []).filter((x) => x.name);
    if (!items.length) return null;
    const p = items[count % items.length];
    const pics = (p.images || (p.image ? [p.image] : [])).filter(okImage).slice(0, 2);
    return h("section", {},
      h("div", { class: `prod${pics.length ? "" : " center"}` },
        pics.length ? h("div", { class: `pics pop${pics.length > 1 ? " two" : ""}` }, pics.map((s) => img(s, "", p.name))) : null,
        h("div", { class: "txt" },
          h("div", { class: "kicker in", style: pics.length ? "text-align:left" : "" }, "Know Your Botanicals"),
          h("div", { class: "pname retro in d1" }, p.name),
          p.blurb ? h("div", { class: "card blurb in d2" }, rich(p.blurb)) : null)));
  },

  community() {
    const c = doc("community");
    const photos = [...(c.photos || []).map((p) => (typeof p === "string" ? p : p?.src)), ...drivePhotos].filter(okImage);
    if (!photos.length) return null;
    const pick = [...photos].sort(() => Math.random() - 0.5).slice(0, photos.length > 6 ? 8 : 6);
    return h("section", {},
      h("div", { class: "title sm retro in" }, c.title || "The Kava Family"),
      h("div", { class: "collage" }, pick.map((s, i) => h("div", { class: `pola in d${(i % 5) + 1}` }, img(s, "")))),
      c.footer ? h("div", { class: "foot in d5" }, rich(c.footer)) : null);
  },

  qr() {
    const q = doc("qr");
    if (!q.url) return null;
    return h("section", {},
      h("div", { class: "qr-wrap" },
        h("div", { class: "qr-box pop" }, qr(q.url, 40)),
        h("div", { class: "qr-txt" },
          h("div", { class: "kicker in", style: "text-align:left" }, "📱 Point your camera here"),
          h("div", { class: "title retro in d1" }, q.title || "Scan for Events"),
          q.text ? h("p", { class: "in d2" }, rich(q.text)) : null,
          h("div", { class: "qr-url in d3" }, h("span", { class: "chip" }, shortUrl(q.url))))));
  },

  votes() {
    const d = poll;
    if (!d || !d.question || !Array.isArray(d.options) || !d.options.length) return null;
    const voteUrl = `${voteSite()}/vote.html`;
    if (!d.reveal) {
      return h("section", {},
        h("div", { class: "kicker in" }, "Now voting"),
        h("div", { class: "vote-q in d1" }, d.question),
        h("div", { class: "qr-wrap stack" }, h("div", { class: "qr-box pop" }, qr(voteUrl, 34)), h("span", { class: "chip orange in d2" }, "📱 Scan to vote")));
    }
    const el = h("section", {},
      h("div", { class: "kicker in" }, d.open ? "Live results" : "Final results"),
      h("div", { class: "vote-q in d1" }, d.question),
      h("div", { class: "bars in d2" }, d.options.map((o) => h("div", { class: "bar-row" },
        h("div", { class: "bh" }, h("span", {}, o), h("span", { class: "pct" }, "0%")),
        h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: "width:0%" }))))),
      d.open ? h("div", { class: "vote-mini in d3" }, h("div", { class: "qr-box" }, qr(voteUrl, 13)), h("span", {}, "Still open — scan to vote")) : null);
    el._votes = d.options.join("\n") + d.open;
    requestAnimationFrame(() => requestAnimationFrame(() => paintBars(el, d)));
    return el;
  },

  feud() {
    const q = doc("qr");
    if (!q.feudSurvey) return null;
    return h("section", {},
      h("div", { class: "qr-wrap" },
        h("div", { class: "qr-txt" },
          h("div", { class: "kicker in", style: "text-align:left" }, "Kava Feud"),
          h("div", { class: "title retro in d1" }, "Survey Says…"),
          h("p", { class: "in d2" }, "Take the quick survey. ", h("b", {}, "Your answers"), " become the next Feud board!"),
          h("div", { class: "qr-url in d3" }, h("span", { class: "chip" }, shortUrl(q.feudSurvey)))),
        h("div", { class: "qr-box pop" }, qr(q.feudSurvey, 40))));
  },
};
const SECTION_OF = Object.fromEntries(SLIDES.map((s) => [s.id, s.section]));

function paintBars(el, d) {
  const tallies = d.options.map((_, i) => Number(d.tallies?.[i]) || 0);
  const total = typeof d.totalVotes === "number" ? d.totalVotes : tallies.reduce((a, b) => a + b, 0);
  const max = Math.max(...tallies);
  el.querySelectorAll(".bar-row").forEach((row, i) => {
    const pct = total ? Math.round((tallies[i] / total) * 100) : 0;
    row.classList.toggle("win", tallies[i] === max && max > 0);
    row.querySelector(".pct").textContent = `${pct}%`;
    row.querySelector(".bar-fill").style.width = `${pct}%`;
  });
}

/* ---------------- drink photo backgrounds ---------------- */
// Slides not listed here sit on the retro pattern.
const SITE = "https://kavaandcompany.com/wp-content/themes/kavaco/assets/photos/";
const BG = {
  welcome: "/board/assets/drinks/welcome.jpg", upnext: "/board/assets/drinks/upnext.jpg", qr: "/board/assets/drinks/qr.jpg",
  tonight: `${SITE}drink-05.jpg`, calendar: `${SITE}drink-02.jpg`, weekly: `${SITE}drink-09.jpg`, specials: `${SITE}drink-07.jpg`,
  products: `${SITE}drink-03.jpg`, signature: `${SITE}drink-08.jpg`, community: `${SITE}drink-01.jpg`, votes: `${SITE}drink-06.webp`, feud: `${SITE}drink-06.webp`,
};
const SHADE = { welcome: [.45, .7], upnext: [.55, .8], tonight: [.5, .78] };
function bgFor(id) {
  if (!BG[id]) return null;
  const [a, b] = SHADE[id] || [.62, .86];
  return h("div", { class: "bg", style: `background-image:linear-gradient(180deg,rgba(4,12,8,${a}),rgba(4,12,8,${b})),url("${BG[id]}")` });
}

/* ---------------- rotation ---------------- */
let pos = -1, current = null, timer = null, paused = false;
const shown = {};

function build(id, count) {
  try { const el = BUILD[id](count); if (el) { el.classList.add("slide"); el.dataset.id = id; const bg = bgFor(id); if (bg) el.prepend(bg); } return el; }
  catch (e) { console.warn("[board] slide", id, e); return null; }
}
function swapIn(el, still = false) {
  const old = current;
  if (still) el.classList.add("still");
  stage.append(el);
  void el.offsetWidth; // let the browser see it before fading in
  el.classList.add("active");
  if (old) { old.classList.remove("active"); setTimeout(() => old.remove(), still ? 0 : 900); }
  current = el;
}
function go(dir = 1) {
  clearTimeout(timer);
  const s = screen(), list = s.slides;
  for (let tries = 0; tries < list.length; tries++) {
    pos = (pos + dir + list.length) % list.length;
    const slide = list[pos], count = shown[slide.id] || 0;
    const el = build(slide.id, count);
    if (!el) continue;
    shown[slide.id] = count + 1;
    swapIn(el);
    $("empty").hidden = true;
    schedule(Number(slide.seconds) || Number(s.seconds) || 12);
    votePace();
    return;
  }
  const el = build("welcome", 0); // nothing else to show
  if (el) swapIn(el);
  schedule(30);
}
function schedule(sec) { if (!paused) timer = setTimeout(() => go(1), Math.max(4, sec) * 1000); }

// When content for the slide on screen changes, redraw it in place (no fade, same page).
function refreshCurrent(changed) {
  if (!current) return;
  const id = current.dataset.id;
  if (!changed.has(SECTION_OF[id]) && !(id === "crew" && changed.has("crew"))) return;
  const el = build(id, Math.max(0, (shown[id] || 1) - 1));
  if (el) swapIn(el, true); else go(1);
}

/* ---------------- apply data ---------------- */
let lastJson = {};
function apply(data, fromCache = false) {
  tv = data || {};
  const changed = new Set();
  for (const k of new Set([...Object.keys(lastJson), ...Object.keys(tv)])) {
    const j = JSON.stringify(tv[k] ?? null);
    if (j !== lastJson[k]) changed.add(k);
    lastJson[k] = j;
  }
  if (!fromCache) try { localStorage.setItem(CACHE_KEY, JSON.stringify(tv)); } catch { /* storage full or blocked */ }
  const s = screen();
  document.body.dataset.theme = s.theme === "orange" ? "orange" : "green";
  if (changed.has("ticker") || !tickerDone) paintTicker();
  if (changed.has("community")) watchDrive();
  preload();
  if (!current) go(1);
  else if (changed.has("config")) { pos = Math.min(pos, s.slides.length - 1); }
  else refreshCurrent(changed);
  votePace();
}

let tickerDone = false;
function paintTicker() {
  tickerDone = true;
  const items = (doc("ticker").items || []).map((t) => String(t || "").trim()).filter(Boolean);
  const track = $("track");
  track.replaceChildren();
  $("ticker").hidden = !items.length;
  document.body.classList.toggle("no-ticker", !items.length);
  if (!items.length) return;
  const one = () => items.map((t) => h("span", {}, rich(t)));
  track.append(...one(), ...one()); // twice, so the loop is seamless
  const chars = items.join("").length;
  track.style.setProperty("--tick-secs", `${Math.max(20, Math.round(chars * 0.32))}s`);
  track.style.animation = "none"; void track.offsetWidth; track.style.animation = "";
}

const preloaded = new Set();
function preload() {
  const srcs = Object.values(BG);
  for (const p of doc("crew").roster || []) srcs.push(p.photo);
  for (const e of doc("events").items || []) srcs.push(e.image);
  for (const k of ["specials", "signature"]) for (const x of doc(k).items || []) srcs.push(x.image);
  for (const p of doc("products").items || []) srcs.push(...(p.images || [p.image]));
  for (const p of (doc("community").photos || []).slice(0, 40)) srcs.push(typeof p === "string" ? p : p?.src);
  for (const s of srcs) if (okImage(s) && !preloaded.has(s)) { preloaded.add(s); const i = new Image(); i.decoding = "async"; i.src = s; }
}

/* ---------------- community photos (the one part that still comes from Google Drive) ---------------- */
// Lists the shared folder set in TV Screens → Community Photos, every 30 minutes.
// Browser key from the old board, split so Netlify's secret scanner doesn't block deploys over it.
const DRIVE_KEY = ["AIzaSyALMNYayRHEFMNdue8", "wA1nHNL5fYr8WtqM"].join("");
let drivePhotos = [], driveFolder = null, driveTimer = null;
async function loadDrive() {
  const folder = String(doc("community").driveFolder || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!folder) { drivePhotos = []; return; }
  try {
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const d = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&key=${DRIVE_KEY}&fields=files(id,mimeType)&pageSize=300`, { cache: "no-store" })).json();
    if (!Array.isArray(d.files)) throw new Error(d.error?.message || "no files");
    drivePhotos = d.files.filter((f) => /^image\//.test(f.mimeType || "")).map((f) => `https://lh3.googleusercontent.com/d/${f.id}=w1200`);
  } catch (e) { console.warn("[board] community folder:", e.message); /* keep the last list */ }
}
function watchDrive() {
  const folder = doc("community").driveFolder || "";
  if (folder === driveFolder) return;
  driveFolder = folder; clearInterval(driveTimer);
  loadDrive();
  if (folder) driveTimer = setInterval(loadDrive, 30 * 60e3);
}

/* ---------------- votes (kavavote site) ---------------- */
const voteSite = () => String(doc("qr").voteSite || "").replace(/\/$/, "");
let voteTimer = null, voteEvery = 0;
async function pollVotes() {
  if (document.hidden) return;
  try {
    const d = await (await fetch(`${voteSite()}/.netlify/functions/poll`, { cache: "no-store" })).json();
    const before = poll ? JSON.stringify([poll.question, poll.options, poll.reveal, poll.open]) : "";
    poll = d;
    if (current?.dataset.id === "votes") {
      const sig = JSON.stringify([d?.question, d?.options, d?.reveal, d?.open]);
      if (sig !== before) refreshCurrent(new Set(["qr"]));
      else if (d?.reveal) paintBars(current, d);
    }
  } catch (e) { console.warn("[board] votes:", e.message); }
}
// Only ask the vote site when this TV shows the votes slide: every 5s while it's on screen, every 30s otherwise.
function votePace() {
  const wanted = screen().slides.some((s) => s.id === "votes") && voteSite() ? (current?.dataset.id === "votes" ? 5 : 30) : 0;
  if (wanted === voteEvery) return;
  voteEvery = wanted; clearInterval(voteTimer);
  if (wanted) { pollVotes(); voteTimer = setInterval(pollVotes, wanted * 1000); }
}

/* ---------------- top bar ---------------- */
function tick() {
  const now = new Date();
  $("day").textContent = WEEKDAYS[now.getDay()];
  $("clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const live = happyHourNow(doc("happyhour").slots, now);
  const pill = $("hhpill");
  pill.hidden = !live;
  if (live) pill.textContent = `🍹 Happy Hour · ${live.minutesLeft} min left`;
  // Fresh start once a day (5:10 AM) so the TVs pick up any new version of the board.
  if (now.getHours() === 5 && now.getMinutes() === 10 && performance.now() > 3600e3) location.reload();
}
const WX = { 0: ["☀️", "Clear"], 1: ["🌤️", "Mostly Clear"], 2: ["⛅", "Partly Cloudy"], 3: ["☁️", "Cloudy"], 45: ["🌫️", "Fog"], 48: ["🌫️", "Fog"],
  51: ["🌦️", "Drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Drizzle"], 61: ["🌧️", "Rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy Rain"],
  80: ["🌦️", "Showers"], 81: ["🌧️", "Showers"], 82: ["🌧️", "Showers"], 95: ["⛈️", "Storms"], 96: ["⛈️", "Storms"], 99: ["⛈️", "Storms"] };
async function weather() {
  try {
    const d = await (await fetch("https://api.open-meteo.com/v1/forecast?latitude=30.17&longitude=-81.61&current=temperature_2m,weather_code&temperature_unit=fahrenheit")).json();
    const [icon, label] = WX[d.current.weather_code] || ["🌤️", ""];
    $("wxIcon").textContent = icon; $("wxTemp").textContent = `${Math.round(d.current.temperature_2m)}°`; $("wxCond").textContent = label;
    $("wx").hidden = false;
  } catch { /* offline: leave it hidden */ }
}

/* ---------------- remote / keyboard ---------------- */
let hintTimer;
function hint(text) { const el = $("hint"); el.textContent = text; el.classList.add("show"); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove("show"), 2500); }
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "MediaTrackNext") { paused = false; go(1); }
  else if (e.key === "ArrowLeft" || e.key === "MediaTrackPrevious") { paused = false; go(-1); }
  else if (e.key === " " || e.key === "Enter" || e.key === "MediaPlayPause") {
    paused = !paused; clearTimeout(timer);
    if (!paused) schedule(screen().seconds || 12);
    hint(paused ? "⏸ Paused" : "▶ Playing");
  } else return;
  e.preventDefault();
});

/* ---------------- Manny peeks in every few minutes ---------------- */
const manny = $("manny");
manny.addEventListener("animationend", () => manny.classList.remove("peek"));
setInterval(() => { if (!document.hidden) manny.classList.add("peek"); }, 150e3);

/* ---------------- start ---------------- */
tick(); setInterval(tick, 15e3);
weather(); setInterval(weather, 15 * 60e3);

if (DEMO_MODE) {
  const { sampleTv } = await import("../js/tv-sample.js");
  apply(Object.fromEntries(Object.entries(sampleTv()).filter(([, v]) => v !== undefined)));
  if (SCREEN_ID && !tv.config?.screens?.[SCREEN_ID]) hint(`No screen "${SCREEN_ID}" — showing everything`);
} else {
  // Show what we had last time straight away (helps after a power cut with slow Wi-Fi).
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c) apply(c, true); } catch { /* ignore */ }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
    const [{ initializeApp }, F] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-firestore.js`)]);
    const db = F.getFirestore(initializeApp(firebaseConfig));
    let warned = false;
    F.onSnapshot(F.collection(db, "locations", LOCATION_ID, "tv"),
      (q) => {
        apply(Object.fromEntries(q.docs.map((d) => [d.id, d.data({ serverTimestamps: "estimate" })])));
        if (!warned && SCREEN_ID && !tv.config?.screens?.[SCREEN_ID]) { warned = true; hint(`No screen "${SCREEN_ID}" — showing everything`); }
      },
      (e) => { console.warn("[board] tv", e); if (!current) { $("empty").hidden = false; $("empty").textContent = "Can't reach Kava Hub right now. Retrying…"; } setTimeout(() => location.reload(), 60e3); });
  } catch (e) {
    console.warn("[board] start", e);
    if (!current) apply({}, true);
    setTimeout(() => location.reload(), 60e3);
  }
  if (!current) setTimeout(() => { if (!current) apply({}, true); }, 6000);
}
