// Kava Hub — app shell: PIN pad, first-time setup, home tiles, tool host, auto-lock.
import api from "./api/index.js";
import { h, clear, toast } from "./ui.js";
import { TOOLS, toolById } from "../tools/registry.js";
import { levelFor } from "./perms.js";
import { DEMO_MODE, PIN_LENGTH } from "./config.js";

const root = document.getElementById("app");
let session = null;
let needsSetup = false;
let current = { key: null, cleanup: null }; // what's on screen

/* ================= tiles the signed-in person can see ================= */
export function visibleTools(s = session) {
  return TOOLS
    .map((t) => ({ t, cfg: s.tools?.[t.id] || { enabled: true, order: 999 }, level: levelFor(s, t.id) }))
    .filter(({ t, cfg, level }) => cfg.enabled && level >= (t.minLevel || 1))
    .sort((a, b) => a.cfg.order - b.cfg.order);
}

/* ================= routing ================= */
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "tool" && parts[1]) return { toolId: parts[1], sub: parts.slice(2) };
  return { toolId: null, sub: [] };
}
export const navigate = (path) => { location.hash = path; };
window.addEventListener("hashchange", () => render());

/* ================= render ================= */
function unmount() {
  try { current.cleanup?.(); } catch (e) { console.warn(e); }
  current = { key: null, cleanup: null };
}

function render(force = false) {
  let key, build;
  if (!session) {
    key = needsSetup ? "setup" : "pin";
    build = needsSetup ? setupScreen : pinScreen;
  } else {
    const r = parseRoute();
    const entry = r.toolId && visibleTools().find((x) => x.t.id === r.toolId);
    if (r.toolId && !entry) { navigate("#/"); return; }
    key = entry ? `tool:${entry.t.id}:${entry.level}:${r.sub.join("/")}` : `home:${homeSignature()}`;
    build = entry ? () => toolScreen(entry, r.sub) : homeScreen;
  }
  if (!force && key === current.key) { refreshChrome(); return; }
  unmount();
  clear(root);
  current.key = key;
  const out = build();
  current.cleanup = out?.cleanup || null;
}

// Re-render home only when what it shows changes.
const homeSignature = () => JSON.stringify([session.me.name, session.role?.name, visibleTools().map((x) => x.t.id)]);

/* ================= shared chrome ================= */
function demoBanner() {
  if (!DEMO_MODE) return null;
  return h("div", { class: "demo-banner" },
    h("b", {}, "Demo mode"), " — sample data, nothing is saved. PINs: Rogue 2580 · Josh 3690 · Daniel 1357 · Wheatyn 2468");
}

function topbar({ back } = {}) {
  return h("header", { class: "topbar" },
    h("div", { class: "topbar-left" },
      back ? h("button", { class: "btn ghost back-btn", type: "button", onclick: () => navigate("#/") }, "← Home") : null,
      h("img", { class: "topbar-logo", src: "icons/logo.png", alt: "Kava & Co. Mandarin" })),
    h("div", { class: "topbar-right" },
      h("div", { class: "who" },
        h("span", { class: "who-name", id: "who-name" }, session.me.name),
        h("span", { class: "who-role", id: "who-role" }, session.role?.name || "")),
      h("button", { class: "btn lock-btn", type: "button", onclick: lockNow, title: "Lock (back to the PIN pad)" }, "🔒 Lock")));
}
function refreshChrome() {
  if (!session) return;
  const n = document.getElementById("who-name"), r = document.getElementById("who-role");
  if (n) n.textContent = session.me.name;
  if (r) r.textContent = session.role?.name || "";
}

/* ================= PIN pad ================= */
function pinScreen() {
  let digits = "";
  let busy = false;
  const dots = h("div", { class: "pin-dots", "aria-hidden": "true" });
  const msg = h("div", { class: "pin-msg", role: "alert" });
  const pad = h("div", { class: "pin-pad" });

  const paint = () => {
    clear(dots);
    for (let i = 0; i < PIN_LENGTH; i++) dots.append(h("span", { class: i < digits.length ? "on" : "" }));
  };
  const press = async (k) => {
    if (busy) return;
    if (k === "clear") digits = "";
    else if (k === "back") digits = digits.slice(0, -1);
    else if (digits.length < PIN_LENGTH) digits += k;
    msg.textContent = "";
    paint();
    if (digits.length === PIN_LENGTH) {
      busy = true; card.classList.add("busy");
      try {
        await api.login(digits);
        // onSession takes over from here
      } catch (e) {
        msg.textContent = e.message || "That PIN didn't work.";
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
        digits = ""; paint();
      } finally { busy = false; card.classList.remove("busy"); }
    }
  };
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"]) {
    const label = k === "clear" ? "Clear" : k === "back" ? "⌫" : k;
    pad.append(h("button", { class: `pin-key${k.length > 1 ? " pin-key-fn" : ""}`, type: "button",
      "aria-label": k === "back" ? "Delete" : label, onclick: () => press(k) }, label));
  }
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("back");
    else if (e.key === "Escape") press("clear");
  };
  document.addEventListener("keydown", onKey);

  const card = h("div", { class: "pin-card" },
    h("img", { class: "pin-logo", src: "icons/logo.png", alt: "Kava & Co. Mandarin" }),
    h("div", { class: "pin-title" }, "Enter your PIN"),
    dots, msg, pad);
  paint();
  root.append(demoBanner() || "", h("main", { class: "pin-screen" }, card));
  return { cleanup: () => document.removeEventListener("keydown", onKey) };
}

/* ================= first-time setup ================= */
function setupScreen() {
  const code = h("input", { class: "input", type: "password", autocomplete: "off", placeholder: "From the deploy instructions" });
  const name = h("input", { class: "input", type: "text", autocomplete: "off", placeholder: "Your name", value: "" });
  const pin1 = pinInput(), pin2 = pinInput();
  const msg = h("div", { class: "modal-err", role: "alert" });
  const go = h("button", { class: "btn primary big", type: "submit" }, "Create my Owner account");
  const form = h("form", { class: "setup-card", onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = "";
    if (pin1.value !== pin2.value) { msg.textContent = "The two PINs don't match."; return; }
    go.disabled = true;
    try { await api.setupOwner({ setupCode: code.value.trim(), name: name.value, pin: pin1.value }); needsSetup = false; }
    catch (err) { msg.textContent = err.message; }
    go.disabled = false;
  } },
  h("img", { class: "pin-logo", src: "icons/logo.png", alt: "" }),
  h("h1", {}, "Welcome to Kava Hub"),
  h("p", { class: "muted" }, "First-time setup. This creates the Owner account — full access, including administration."),
  lbl("Setup code", code), lbl("Your name", name), lbl("Choose a 4-digit PIN", pin1), lbl("Type the PIN again", pin2),
  msg, go);
  root.append(demoBanner() || "", h("main", { class: "pin-screen" }, form));
  function pinInput() {
    return h("input", { class: "input pin-input", type: "text", inputmode: "numeric", maxlength: "4", autocomplete: "off",
      oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); } });
  }
  function lbl(t, i) { return h("label", { class: "field" }, h("span", { class: "field-label" }, t), i); }
}

/* ================= home ================= */
function homeScreen() {
  const list = visibleTools();
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const grid = h("div", { class: "tiles" }, list.map(({ t, level }) =>
    h("button", { class: `tile accent-${t.accent}`, type: "button", onclick: () => navigate(`#/tool/${t.id}`) },
      h("span", { class: "tile-icon", "aria-hidden": "true" }, t.icon),
      h("span", { class: "tile-name" }, t.name),
      h("span", { class: "tile-blurb" }, t.blurb),
      t.status === "soon" ? h("span", { class: "chip chip-soon tile-chip" }, "Soon")
        : level >= 2 && t.id !== "admin" ? h("span", { class: "chip tile-chip" }, "Manage") : null)));
  root.append(demoBanner() || "", topbar(),
    h("main", { class: "home" },
      h("h1", { class: "hello" }, `${hello}, `, h("em", {}, session.me.name), "."),
      list.length ? grid : h("p", { class: "muted" }, "Nothing is set up for your role yet. Ask Rogue to give you access.")));
}

/* ================= a tool ================= */
function toolScreen({ t, level }, sub) {
  const body = h("div", { class: "tool-body" }, h("div", { class: "loading" }, "Loading…"));
  root.append(demoBanner() || "", topbar({ back: true }),
    h("main", { class: "tool" },
      h("div", { class: "tool-head" }, h("span", { class: `tool-icon accent-${t.accent}` }, t.icon), h("h1", {}, t.name)),
      body));
  let cleanup = null, dead = false;
  t.load().then((mod) => {
    if (dead) return;
    clear(body);
    const ctx = {
      tool: t, level, sub, api, toast, navigate,
      session: () => session,
      base: `#/tool/${t.id}`,
      log: (action, detail) => api.log(session, t.id, action, detail),
    };
    cleanup = mod.mount(body, ctx) || null;
  }).catch((e) => { clear(body).append(h("p", { class: "modal-err" }, `Couldn't open ${t.name}: ${e.message}`)); });
  return { cleanup: () => { dead = true; if (typeof cleanup === "function") cleanup(); } };
}

/* ================= auto-lock ================= */
let idleTimer = null;
function lockNow() { api.logout(); }
function resetIdle() {
  clearTimeout(idleTimer);
  const secs = session?.location?.settings?.autoLockSeconds ?? 120;
  if (session && secs > 0) idleTimer = setTimeout(() => { lockNow(); toast("Locked after no activity", "info"); }, secs * 1000);
}
["pointerdown", "keydown", "touchstart", "wheel"].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));

/* ================= start ================= */
function connectError(message) {
  clear(root);
  root.append(h("main", { class: "pin-screen" }, h("div", { class: "pin-card" },
    h("img", { class: "pin-logo", src: "icons/logo.png", alt: "Kava & Co. Mandarin" }),
    h("div", { class: "pin-title" }, "Can't connect to the server"),
    h("p", { class: "pin-msg", style: { margin: "14px 0" } }, message),
    h("button", { class: "btn primary big", type: "button", onclick: () => location.reload() }, "Try again"))));
}

async function start() {
  try { needsSetup = (await api.setupStatus()).needsSetup; }
  catch (e) {
    console.warn("[hub] setup check failed", e);
    connectError(e.message || String(e));
    return;
  }
  api.onSession((s) => {
    const was = session;
    session = s;
    if (!s && was) { navigate("#/"); }
    if (s && !was) { needsSetup = false; if (location.hash !== "#/" && location.hash) navigate("#/"); }
    resetIdle();
    render();
  });
  render();
}
start();
