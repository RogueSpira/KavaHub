// Small UI helpers shared by every screen and tool.

// h("div", {class:"x", onclick: fn}, "text", childNode, [more]) — builds DOM safely
// (text is always inserted as text, never as HTML).
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}
function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

/* ---------- toast ---------- */
export function toast(msg, kind = "ok") {
  let host = document.getElementById("toasts");
  if (!host) { host = h("div", { id: "toasts" }); document.body.append(host); }
  const t = h("div", { class: `toast toast-${kind}`, role: "status" }, msg);
  host.append(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3000);
}

/* ---------- modal ---------- */
// modal({ title, body: Node, actions: [{label, kind, onClick: async () => true|false}] })
// onClick returning false keeps the modal open (e.g. on a validation error).
export function modal({ title, body, actions = [], wide = false }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    const err = h("div", { class: "modal-err", role: "alert" });
    const btns = actions.map((a) => {
      const b = h("button", { class: `btn ${a.kind || ""}`, type: "button" }, a.label);
      b.addEventListener("click", async () => {
        err.textContent = "";
        if (!a.onClick) return close(a.value ?? null);
        btns.forEach((x) => (x.disabled = true));
        try {
          const r = await a.onClick();
          if (r !== false) return close(r ?? a.value ?? true);
        } catch (e) { err.textContent = e.message || String(e); }
        btns.forEach((x) => (x.disabled = false));
      });
      return b;
    });
    const box = h("div", { class: `modal${wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-head" }, h("h2", {}, title),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => close(null) }, "✕")),
      h("div", { class: "modal-body" }, body), err,
      btns.length ? h("div", { class: "modal-actions" }, btns) : null);
    const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(null); } }, box);
    document.body.append(back);
    document.addEventListener("keydown", onKey);
    setTimeout(() => box.querySelector("input,select,textarea")?.focus(), 30);
  });
}

export async function confirm(title, message, okLabel = "Yes", kind = "danger") {
  const r = await modal({ title, body: h("p", {}, message),
    actions: [{ label: "Cancel", kind: "ghost", value: false }, { label: okLabel, kind, value: true }] });
  return r === true;
}

/* ---------- form bits ---------- */
export function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input,
    hint ? h("span", { class: "field-hint" }, hint) : null);
}

// A 4-digit PIN entry box that brings up the number pad on iPad/phone.
export function pinField(placeholder = "4 digits") {
  return h("input", { class: "input pin-input", type: "text", inputmode: "numeric", pattern: "[0-9]*",
    maxlength: "4", autocomplete: "off", placeholder,
    oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); } });
}

// Segmented control: seg([{value,label}], current, onChange)
export function seg(options, current, onChange, { small = false, disabled = false } = {}) {
  const wrap = h("div", { class: `seg${small ? " seg-sm" : ""}`, role: "radiogroup" });
  const render = (val) => {
    clear(wrap);
    for (const o of options) {
      wrap.append(h("button", {
        type: "button", role: "radio", "aria-checked": String(o.value === val),
        class: `seg-btn${o.value === val ? " on" : ""} ${o.cls || ""}`, disabled,
        onclick: () => { if (o.value !== val) { render(o.value); onChange(o.value); } },
      }, o.label));
    }
  };
  render(current);
  return wrap;
}

export function timeAgo(d) {
  if (!d) return "never";
  d = d.toDate ? d.toDate() : new Date(d); // Firestore Timestamp or Date
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
