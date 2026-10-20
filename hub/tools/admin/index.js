// Administration: people & PINs, roles & access, tiles, activity log, settings.
import { h, clear, modal, confirm, field, pinField, seg, timeAgo } from "../../js/ui.js";
import { TOOLS } from "../registry.js";
import { LEVEL_NAMES, isOwner } from "../../js/perms.js";

const TABS = [
  { id: "people", label: "People" },
  { id: "access", label: "Roles & Access" },
  { id: "tiles", label: "Tiles" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings", ownerOnly: true },
];

export function mount(el, ctx) {
  const { api, toast, navigate } = ctx;
  const owner = isOwner(ctx.session());
  const tabs = TABS.filter((t) => !t.ownerOnly || owner);
  const tab = tabs.find((t) => t.id === ctx.sub[0]) ? ctx.sub[0] : "people";

  const nav = h("nav", { class: "tabs", role: "tablist" }, tabs.map((t) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(t.id === tab),
      class: `tab${t.id === tab ? " on" : ""}`, onclick: () => navigate(`${ctx.base}/${t.id}`) }, t.label)));
  const pane = h("section", { class: "pane" });
  el.append(nav, pane);

  const views = { people, access, tiles, activity, settings };
  return views[tab](pane);

  /* ---------------- helpers ---------------- */
  function roleList() { return Object.values(ctx.session().roles).sort((a, b) => (b.id === "owner") - (a.id === "owner") || b.rank - a.rank); }
  function myRank() { const s = ctx.session(); return isOwner(s) ? 1000 : s.role?.rank ?? 0; }
  function assignableRoles() { return roleList().filter((r) => owner || (r.id !== "owner" && r.rank < myRank())); }
  function roleSelect(current) {
    const sel = h("select", { class: "input" });
    for (const r of assignableRoles()) sel.append(h("option", { value: r.id, selected: r.id === current }, r.name));
    if (current && !assignableRoles().some((r) => r.id === current)) {
      sel.append(h("option", { value: current, selected: true, disabled: true }, ctx.session().roles[current]?.name || current));
    }
    return sel;
  }
  function roleName(id) { return ctx.session().roles[id]?.name || id; }

  /* ================= People ================= */
  function people(p) {
    const list = h("div", { class: "rows" });
    const addBtn = h("button", { class: "btn primary", type: "button", onclick: addPerson }, "+ Add person");
    p.append(h("div", { class: "pane-head" },
      h("p", { class: "muted" }, "Everyone signs in with their own 4-digit PIN. Each PIN must be unique."), addBtn), list);
    let users = [];
    const stop = api.watchUsers((u) => {
      if (!u) { clear(list).append(h("p", { class: "modal-err" }, "Couldn't load people.")); return; }
      users = u; paint();
    });
    function paint() {
      clear(list);
      const active = users.filter((u) => u.active), inactive = users.filter((u) => !u.active);
      for (const u of [...active, ...inactive]) {
        const custom = Object.keys(u.overrides || {}).length;
        list.append(h("button", { class: `row${u.active ? "" : " row-off"}`, type: "button", onclick: () => editPerson(u) },
          h("span", { class: "avatar" }, (u.name || "?").charAt(0).toUpperCase()),
          h("span", { class: "row-main" },
            h("span", { class: "row-title" }, u.name, u.uid === ctx.session().uid ? h("span", { class: "chip" }, "You") : null),
            h("span", { class: "row-sub" }, roleName(u.roleId), custom ? ` · ${custom} custom access` : "", ` · last in ${timeAgo(u.lastLoginAt)}`)),
          u.active ? null : h("span", { class: "chip chip-off" }, "Inactive"),
          h("span", { class: "row-go", "aria-hidden": "true" }, "›")));
      }
    }
    async function addPerson() {
      const name = h("input", { class: "input", type: "text", autocomplete: "off", placeholder: "First name" });
      const role = roleSelect("kavatender");
      const pin = pinField();
      const ok = await modal({
        title: "Add a person",
        body: h("div", { class: "form" }, field("Name", name), field("Role", role), field("PIN", pin, "They'll use this to sign in. Avoid 1234-style runs and repeats.")),
        actions: [{ label: "Cancel", kind: "ghost", value: false },
          { label: "Add person", kind: "primary", onClick: () => api.createUser({ name: name.value, roleId: role.value, pin: pin.value }) }],
      });
      if (ok) toast(`${name.value.trim()} added`);
    }
    return () => stop();
  }

  async function editPerson(u) {
    const self = u.uid === ctx.session().uid;
    const name = h("input", { class: "input", type: "text", value: u.name, autocomplete: "off" });
    const role = roleSelect(u.roleId);
    let active = u.active;
    const activeSeg = seg([{ value: true, label: "Active" }, { value: false, label: "Inactive", cls: "danger" }],
      active, (v) => { active = v; }, { disabled: self });
    const overrides = { ...(u.overrides || {}) };

    const accessRows = h("div", { class: "access-list" });
    const paintAccess = () => {
      clear(accessRows);
      const roleId = role.value;
      for (const t of TOOLS) {
        const def = roleId === "owner" ? 2 : ctx.session().roles[roleId]?.perms?.[t.id] ?? 0;
        const has = Object.prototype.hasOwnProperty.call(overrides, t.id);
        accessRows.append(h("div", { class: "access-row" },
          h("span", { class: "access-tool" }, `${t.icon} ${t.name}`),
          seg([{ value: "role", label: `Role (${LEVEL_NAMES[def]})` }, { value: 0, label: "Hidden" }, { value: 1, label: "Use" }, { value: 2, label: "Manage" }],
            has ? overrides[t.id] : "role",
            (v) => { if (v === "role") delete overrides[t.id]; else overrides[t.id] = v; }, { small: true, disabled: roleId === "owner" })));
      }
    };
    role.addEventListener("change", paintAccess);
    paintAccess();

    const pinShown = h("span", { class: "pin-shown", "aria-live": "polite" });
    const showBtn = h("button", { class: "btn", type: "button", onclick: async () => {
      if (pinShown.textContent) { pinShown.textContent = ""; showBtn.textContent = "Show PIN"; return; }
      showBtn.disabled = true;
      try { pinShown.textContent = await api.revealPin(u.uid); showBtn.textContent = "Hide"; }
      catch (e) { toast(e.message, "err"); }
      showBtn.disabled = false;
    } }, "Show PIN");
    const pinBtn = h("div", { class: "pin-actions" }, showBtn, pinShown,
      h("button", { class: "btn", type: "button", onclick: () => resetPinFor(u) }, "Reset PIN"));
    const body = h("div", { class: "form" },
      field("Name", name), field("Role", role),
      field("Status", activeSeg, self ? "You can't deactivate yourself." : "Inactive people can't sign in. Their history is kept."),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "PIN"), pinBtn),
      h("details", { class: "access-box", open: Object.keys(overrides).length > 0 },
        h("summary", {}, "Access just for this person"),
        h("p", { class: "muted small" }, "Leave on “Role” to follow their role. Pick a level to override it for this person only."),
        accessRows));
    const ok = await modal({
      title: u.name, wide: true, body,
      actions: [{ label: "Cancel", kind: "ghost", value: false },
        { label: "Save", kind: "primary", onClick: () => {
          const patch = { name: name.value, overrides: Object.fromEntries(TOOLS.map((t) => [t.id, overrides[t.id] ?? null])) };
          if (role.value !== u.roleId) patch.roleId = role.value;
          if (active !== u.active) patch.active = active;
          return api.updateUser(u.uid, patch);
        } }],
    });
    if (ok) toast("Saved");
  }

  async function resetPinFor(u) {
    const pin = pinField("New 4-digit PIN");
    const ok = await modal({
      title: `New PIN for ${u.name}`,
      body: h("div", { class: "form" }, field("New PIN", pin, "Their old PIN stops working right away.")),
      actions: [{ label: "Cancel", kind: "ghost", value: false },
        { label: "Set PIN", kind: "primary", onClick: () => api.resetPin(u.uid, pin.value) }],
    });
    if (ok) toast(`PIN updated for ${u.name}`);
  }

  /* ================= Roles & Access ================= */
  function access(p) {
    const wrap = h("div");
    p.append(h("div", { class: "pane-head" },
      h("p", { class: "muted" }, owner
        ? "What each role can do in each tool. Changes save instantly and apply to everyone with that role right away."
        : "What each role can do in each tool. Only an Owner can change this."),
      owner ? h("button", { class: "btn primary", type: "button", onclick: addRole }, "+ Add role") : null), wrap);

    let lastSig = "";
    const paint = () => {
      const roles = roleList();
      const sig = JSON.stringify(roles);
      if (sig === lastSig) return; lastSig = sig;
      clear(wrap);
      const table = h("div", { class: "grid-scroll" }, h("table", { class: "access-grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Tool"), roles.map((r) => h("th", {},
          h("span", { class: "role-head" }, r.name,
            owner && !r.system ? h("button", { class: "icon-btn small", type: "button", title: `Delete ${r.name}`, onclick: () => removeRole(r) }, "🗑") : null),
          h("span", { class: "muted small" }, r.id === "owner" ? "everything" : `rank ${r.rank}`))))),
        h("tbody", {}, TOOLS.map((t) => h("tr", {},
          h("td", {}, h("div", { class: "grid-tool" }, `${t.icon} ${t.name}`),
            h("div", { class: "muted small" }, `Use: ${t.levels.use}`), h("div", { class: "muted small" }, `Manage: ${t.levels.manage}`)),
          roles.map((r) => h("td", {}, r.id === "owner"
            ? h("span", { class: "chip" }, "Full")
            : seg([{ value: 0, label: "Hidden" }, { value: 1, label: "Use" }, { value: 2, label: "Manage" }],
              r.perms?.[t.id] ?? 0,
              async (v) => {
                try {
                  await api.setRoleAccess(r.id, t.id, v);
                  toast(`${r.name}: ${t.name} → ${LEVEL_NAMES[v]}`);
                  ctx.log("Changed role access", `${r.name}: ${t.name} → ${LEVEL_NAMES[v]}`);
                }
                catch (e) { toast(e.message, "err"); lastSig = ""; paint(); }
              }, { small: true, disabled: !owner }))))))));
      wrap.append(table);
    };
    paint();
    return ctx.onSessionChange(paint); // repaint when roles change (here or on another device)

    async function addRole() {
      const name = h("input", { class: "input", type: "text", placeholder: "e.g. Shift Lead", autocomplete: "off" });
      const rank = h("input", { class: "input", type: "number", min: "1", max: "99", value: "30" });
      const ok = await modal({
        title: "Add a role",
        body: h("div", { class: "form" }, field("Role name", name),
          field("Rank (1–99)", rank, "Higher rank = more senior. Kavatender is 10, Manager is 50. People can only manage others ranked below them.")),
        actions: [{ label: "Cancel", kind: "ghost", value: false },
          { label: "Add role", kind: "primary", onClick: () => api.createRole(name.value, parseInt(rank.value, 10)) }],
      });
      if (ok) { toast("Role added — set its access in the grid"); lastSig = ""; }
    }
    async function removeRole(r) {
      if (!(await confirm(`Delete ${r.name}?`, "Only possible when nobody has this role.", "Delete"))) return;
      try { await api.deleteRole(r.id); toast(`${r.name} deleted`); lastSig = ""; }
      catch (e) { toast(e.message, "err"); }
    }
  }

  /* ================= Tiles ================= */
  function tiles(p) {
    const list = h("div", { class: "rows" });
    p.append(h("div", { class: "pane-head" },
      h("p", { class: "muted" }, "Turn tiles on or off for everyone and set their order on the home screen.")), list);
    let lastSig = "";
    const ordered = () => {
      const cfg = ctx.session().tools || {};
      return TOOLS.map((t) => ({ t, c: cfg[t.id] || { enabled: true, order: 999 } })).sort((a, b) => a.c.order - b.c.order);
    };
    const paint = () => {
      const items = ordered();
      const sig = JSON.stringify(items.map((x) => [x.t.id, x.c.enabled, x.c.order]));
      if (sig === lastSig) return; lastSig = sig;
      clear(list);
      items.forEach(({ t, c }, i) => list.append(h("div", { class: `row static${c.enabled ? "" : " row-off"}` },
        h("span", { class: `avatar accent-${t.accent}` }, t.icon),
        h("span", { class: "row-main" }, h("span", { class: "row-title" }, t.name,
          t.status === "soon" ? h("span", { class: "chip chip-soon" }, "Soon") : null),
        h("span", { class: "row-sub" }, t.blurb)),
        h("div", { class: "row-actions" },
          h("button", { class: "icon-btn", type: "button", "aria-label": "Move up", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Move down", disabled: i === items.length - 1, onclick: () => move(i, 1) }, "↓"),
          t.id === "admin" ? h("span", { class: "chip" }, "Always on")
            : seg([{ value: true, label: "On" }, { value: false, label: "Off" }], c.enabled,
              async (v) => {
                try {
                  const list = ordered();
                  const at = list.findIndex((x) => x.t.id === t.id);
                  await api.saveTool(t.id, { enabled: v, order: at < 0 ? i : at });
                  ctx.log("Changed tile", `${t.name} turned ${v ? "on" : "off"}`);
                } catch (e) { toast(e.message, "err"); }
              }, { small: true })))));
    };
    async function move(i, d) {
      const items = ordered();
      [items[i], items[i + d]] = [items[i + d], items[i]];
      await save(items);
      ctx.log("Reordered tiles", `${items[i + d].t.name} moved ${d < 0 ? "up" : "down"}`);
    }
    async function save(items) {
      try {
        await Promise.all(items.map((x, order) => {
          const next = { enabled: x.t.id === "admin" ? true : x.c.enabled, order };
          const cur = ctx.session().tools?.[x.t.id];
          return cur && cur.enabled === next.enabled && cur.order === next.order ? null : api.saveTool(x.t.id, next);
        }));
      } catch (e) { toast(e.message, "err"); }
    }
    paint();
    return ctx.onSessionChange(paint); // repaint when tiles change
  }

  /* ================= Activity ================= */
  function activity(p) {
    const list = h("div", { class: "log" });
    p.append(h("div", { class: "pane-head" }, h("p", { class: "muted" }, "The latest 150 changes across the hub.")), list);
    const toolName = (id) => TOOLS.find((t) => t.id === id)?.name || id;
    const stop = api.watchActivity((items) => {
      clear(list);
      if (!items) { list.append(h("p", { class: "modal-err" }, "Couldn't load the activity log.")); return; }
      if (!items.length) list.append(h("p", { class: "muted" }, "Nothing yet."));
      for (const a of items) {
        list.append(h("div", { class: "log-row" },
          h("span", { class: "log-time", title: a.at ? new Date(a.at).toLocaleString() : "" }, timeAgo(a.at)),
          h("span", { class: "log-who" }, a.actorName),
          h("span", { class: "log-what" }, h("b", {}, a.action), a.detail ? ` — ${a.detail}` : ""),
          h("span", { class: "chip" }, toolName(a.tool))));
      }
    });
    return () => stop();
  }

  /* ================= Settings ================= */
  function settings(p) {
    const s = ctx.session().location?.settings || {};
    p.append(h("div", { class: "form narrow" },
      field("Auto-lock", seg(
        [{ value: 60, label: "1 min" }, { value: 120, label: "2 min" }, { value: 300, label: "5 min" }, { value: 600, label: "10 min" }, { value: 0, label: "Never" }],
        s.autoLockSeconds ?? 120,
        async (v) => {
          try {
            await api.saveSettings({ ...ctx.session().location.settings, autoLockSeconds: v });
            toast("Auto-lock updated");
            ctx.log("Changed settings", `Auto-lock: ${v ? `${v / 60} min` : "never"}`);
          }
          catch (e) { toast(e.message, "err"); }
        }), "How long the hub waits with no taps before going back to the PIN pad. Applies to every device.")));
  }
}
