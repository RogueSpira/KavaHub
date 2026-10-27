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
        body: h("div", { class: "form" }, field("Name", name), field("Role", role), field("PIN", pin, "Same as their POS PIN. They'll use it to sign in.")),
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
  // Home screen layout: order, on/off, folders ("Maker Tools", "Event Tools"…), and link tiles that
  // open other sites (trivia scores, KavaVote, karaoke…). Administration always stays last on Home.
  function tiles(p) {
    const body = h("div");
    p.append(h("div", { class: "pane-head" },
      h("p", { class: "muted" }, "Order, turn on/off and group the tiles on the home screen. Folders open as their own screen. Link tiles open another site in a new tab."),
      h("div", { class: "sq-actions" },
        h("button", { class: "btn", type: "button", onclick: () => editFolder(null) }, "+ New folder"),
        h("button", { class: "btn primary", type: "button", onclick: () => editLink(null) }, "+ Add link tile"))), body);
    let lastSig = "";
    const rid = (pre) => `${pre}-${Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "") || "x1y2"}`;
    const cfgAll = () => ctx.session().tools || {};
    function entries() {
      const cfg = cfgAll();
      const folderIds = Object.keys(cfg).filter((id) => id.startsWith("folder-") && cfg[id]?.kind === "folder");
      const where = (c, id) => (id !== "admin" && c?.folder && folderIds.includes(c.folder) ? c.folder : "");
      const list = [];
      for (const t of TOOLS) { const c = cfg[t.id] || { enabled: true, order: 999 }; list.push({ kind: "tool", id: t.id, t, c, order: c.order ?? 999, folder: where(c, t.id) }); }
      for (const [id, c] of Object.entries(cfg)) if (id.startsWith("link-") && c?.kind === "link") list.push({ kind: "link", id, c, order: c.order ?? 999, folder: where(c, id) });
      for (const id of folderIds) list.push({ kind: "folder", id, c: cfg[id], order: cfg[id].order ?? 999, folder: "" });
      const sort = (a, b) => (a.id === "admin") - (b.id === "admin") || a.order - b.order || a.id.localeCompare(b.id);
      return { list, folderIds, inside: (fid) => list.filter((x) => x.kind !== "folder" && x.folder === fid).sort(sort), home: list.filter((x) => !x.folder).sort(sort) };
    }
    const nameOf = (x) => (x.kind === "tool" ? x.t.name : x.c.name);
    const iconOf = (x) => (x.kind === "tool" ? x.t.icon : x.c.icon || (x.kind === "folder" ? "📁" : "🔗"));

    const paint = () => {
      const E = entries();
      const sig = JSON.stringify(E.list.map((x) => [x.id, x.c, x.folder]));
      if (sig === lastSig) return; lastSig = sig;
      clear(body);
      const folderOpts = [["", "Home screen"], ...E.folderIds.map((id) => [id, `📁 ${cfgAll()[id].name}`])];
      const row = (x, i, arr) => {
        const locked = x.id === "admin";
        const enabled = x.c.enabled !== false;
        const move = locked || x.kind === "folder" ? null : h("select", { class: "input tiles-move", "aria-label": `Where ${nameOf(x)} goes`,
          onchange: (e) => moveTo(x, e.target.value) }, folderOpts.map(([v, l]) => h("option", { value: v, selected: v === x.folder }, l)));
        return h("div", { class: `row static${enabled ? "" : " row-off"}` },
          h("span", { class: `avatar accent-${x.kind === "tool" ? x.t.accent : x.kind === "folder" ? "orange" : "aqua"}` }, iconOf(x)),
          h("span", { class: "row-main" },
            h("span", { class: "row-title" }, nameOf(x),
              x.kind === "folder" ? h("span", { class: "chip" }, "Folder") : null,
              x.kind === "link" ? h("span", { class: "chip" }, "Link") : null,
              x.t?.status === "soon" ? h("span", { class: "chip chip-soon" }, "Soon") : null),
            h("span", { class: "row-sub" }, x.kind === "tool" ? x.t.blurb : x.kind === "link"
              ? [x.c.url.replace(/^https:\/\//, ""), (x.c.roles || []).length ? `Only: ${x.c.roles.map((r) => ctx.session().roles[r]?.name || r).join(", ")}` : "Everyone"].join(" · ")
              : `${E.inside(x.id).length} tile${E.inside(x.id).length === 1 ? "" : "s"} inside`)),
          h("div", { class: "row-actions" },
            move,
            locked ? h("span", { class: "chip" }, "Always last") : [
              h("button", { class: "icon-btn", type: "button", "aria-label": "Move up", disabled: i === 0, onclick: () => reorder(arr, i, -1) }, "↑"),
              h("button", { class: "icon-btn", type: "button", "aria-label": "Move down", disabled: i >= arr.length - 1 || arr[i + 1]?.id === "admin", onclick: () => reorder(arr, i, 1) }, "↓")],
            x.kind === "folder" ? h("button", { class: "btn small ghost", type: "button", onclick: () => editFolder(x) }, "Edit") : null,
            x.kind === "link" ? h("button", { class: "btn small ghost", type: "button", onclick: () => editLink(x) }, "Edit") : null,
            locked ? h("span", { class: "chip" }, "Always on") : x.kind === "folder" ? null
              : seg([{ value: true, label: "On" }, { value: false, label: "Off" }], enabled, async (v) => {
                try { await api.saveTool(x.id, { enabled: v }); ctx.log("Changed tile", `${nameOf(x)} turned ${v ? "on" : "off"}`); } catch (e) { toast(e.message, "err"); }
              }, { small: true })));
      };
      body.append(h("h3", { class: "tv-h3" }, "🏠 Home screen"), h("div", { class: "rows" }, E.home.map(row)));
      for (const fid of E.folderIds.sort((a, b) => (cfgAll()[a].order ?? 999) - (cfgAll()[b].order ?? 999))) {
        const kids = E.inside(fid);
        body.append(h("h3", { class: "tv-h3" }, `${cfgAll()[fid].icon || "📁"} ${cfgAll()[fid].name}`),
          kids.length ? h("div", { class: "rows" }, kids.map(row)) : h("p", { class: "muted small" }, "Empty — use the “Home screen” menu on any tile to move it in here. Empty folders don't show on the home screen."));
      }
    };
    // Save the order of one screen (home or a folder); only writes what changed.
    async function saveOrder(arr) {
      try {
        await Promise.all(arr.map((x, order) => (x.order === order ? null : api.saveTool(x.id, x.kind === "tool" ? { order, enabled: x.c.enabled !== false } : { order }))));
      } catch (e) { toast(e.message, "err"); }
    }
    async function reorder(arr, i, d) {
      const list = arr.filter((x) => x.id !== "admin");
      const j = i + d; if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await saveOrder(list);
      ctx.log("Reordered tiles", `${nameOf(list[j])} moved ${d < 0 ? "up" : "down"}`);
    }
    async function moveTo(x, fid) {
      const E = entries();
      const target = fid ? E.inside(fid) : E.home.filter((y) => y.id !== "admin");
      const order = target.length ? Math.max(...target.map((y) => y.order)) + 1 : 0;
      try {
        await api.saveTool(x.id, x.kind === "tool" ? { folder: fid, order, enabled: x.c.enabled !== false } : { folder: fid, order });
        ctx.log("Moved tile", `${nameOf(x)} → ${fid ? cfgAll()[fid].name : "Home screen"}`);
      } catch (e) { toast(e.message, "err"); }
    }
    async function editFolder(x) {
      const name = h("input", { class: "input", maxlength: "30", value: x?.c.name || "", placeholder: "e.g. Event Tools" });
      const icon = h("input", { class: "input", maxlength: "8", value: x?.c.icon || "📁", style: { width: "90px", fontSize: "24px", textAlign: "center" } });
      const actions = [];
      if (x) actions.push({ label: "Delete", kind: "ghost", onClick: async () => {
        if (!(await confirm(`Delete the “${x.c.name}” folder?`, "Its tiles move back to the home screen.", "Delete"))) return false;
        const E = entries();
        let order = Math.max(-1, ...E.home.filter((y) => y.id !== "admin" && y.kind !== "folder").map((y) => y.order));
        for (const k of E.inside(x.id)) await api.saveTool(k.id, k.kind === "tool" ? { folder: "", order: ++order, enabled: k.c.enabled !== false } : { folder: "", order: ++order });
        await api.deleteTile(x.id); ctx.log("Deleted folder", x.c.name); toast("Folder deleted");
        return true;
      } });
      actions.push({ label: "Cancel", kind: "ghost", value: false }, { label: x ? "Save" : "Add folder", kind: "primary", onClick: async () => {
        const n = name.value.trim(); if (!n) throw new Error("Give the folder a name.");
        const E = entries();
        const order = x ? x.order : Math.max(-1, ...E.home.filter((y) => y.id !== "admin").map((y) => y.order)) + 1;
        await api.saveTool(x?.id || rid("folder"), { kind: "folder", name: n, icon: icon.value.trim() || "📁", order });
        ctx.log(x ? "Edited folder" : "Added folder", n); toast(x ? "Saved" : "Folder added — move tiles into it with the “Home screen” menu");
        return true;
      } });
      await modal({ title: x ? "Edit folder" : "New folder", body: h("div", { class: "form" },
        h("div", { class: "tiles-name-row" }, field("Icon", icon, "Any emoji"), field("Name", name))), actions });
    }
    const PRESETS = [
      { name: "Trivia Scores", icon: "🏆", blurb: "Score tracker & game board", url: "https://kavatriviascores.netlify.app" },
      { name: "KavaVote", icon: "🗳️", blurb: "Live voting", url: "https://kavavote.netlify.app" },
      { name: "Feud Survey", icon: "📋", blurb: "Survey for Kava Feud", url: "https://kavafeud.netlify.app/feud-survey.html" },
      { name: "Karaoke Queue", icon: "🎤", blurb: "Karaoke night sign-ups", url: "https://kavakaraoke.netlify.app" },
    ];
    async function editLink(x) {
      const c = x?.c || {};
      const name = h("input", { class: "input", maxlength: "40", value: c.name || "", placeholder: "e.g. Trivia Scores" });
      const icon = h("input", { class: "input", maxlength: "8", value: c.icon || "🔗", style: { width: "90px", fontSize: "24px", textAlign: "center" } });
      const blurb = h("input", { class: "input", maxlength: "80", value: c.blurb || "", placeholder: "Short line under the name (optional)" });
      const url = h("input", { class: "input", type: "url", maxlength: "300", value: c.url || "", placeholder: "https://…" });
      const E = entries();
      const folder = h("select", { class: "input" }, [["", "Home screen"], ...E.folderIds.map((id) => [id, `📁 ${cfgAll()[id].name}`])]
        .map(([v, l]) => h("option", { value: v, selected: v === (x?.folder ?? "") }, l)));
      const roles = new Set(c.roles || []);
      const roleBoxes = h("div", { class: "tv-import-picks" }, roleList().filter((r) => r.id !== "owner").map((r) =>
        h("label", { class: "tv-check" }, h("input", { type: "checkbox", checked: roles.has(r.id), onchange: (e) => (e.target.checked ? roles.add(r.id) : roles.delete(r.id)) }), h("span", {}, r.name))));
      const presets = x ? null : h("div", { class: "sq-actions" }, PRESETS.map((pr) => h("button", { class: "btn small ghost", type: "button", onclick: () => {
        name.value = pr.name; icon.value = pr.icon; blurb.value = pr.blurb; url.value = pr.url;
      } }, `${pr.icon} ${pr.name}`)));
      const actions = [];
      if (x) actions.push({ label: "Delete", kind: "ghost", onClick: async () => {
        if (!(await confirm(`Delete the “${c.name}” tile?`, "It comes off everyone's home screen. The site itself isn't touched.", "Delete"))) return false;
        await api.deleteTile(x.id); ctx.log("Deleted link tile", c.name); toast("Tile deleted");
        return true;
      } });
      actions.push({ label: "Cancel", kind: "ghost", value: false }, { label: x ? "Save" : "Add tile", kind: "primary", onClick: async () => {
        const n = name.value.trim(), u = url.value.trim();
        if (!n) throw new Error("Give the tile a name.");
        if (!/^https:\/\/[^ ]+$/.test(u)) throw new Error("The link needs to start with https://");
        const fid = folder.value;
        const order = x && fid === x.folder ? x.order : (fid ? E.inside(fid) : E.home.filter((y) => y.id !== "admin")).reduce((m, y) => Math.max(m, y.order), -1) + 1;
        await api.saveTool(x?.id || rid("link"), { kind: "link", name: n, icon: icon.value.trim() || "🔗", blurb: blurb.value.trim(), url: u, roles: [...roles], enabled: c.enabled !== false, order, folder: fid });
        ctx.log(x ? "Edited link tile" : "Added link tile", `${n} (${u})`); toast(x ? "Saved" : "Tile added");
        return true;
      } });
      await modal({ title: x ? "Edit link tile" : "Add link tile", wide: true, body: h("div", { class: "form" },
        presets ? field("Quick fill", presets, "Then change the link if you want a specific page (like the host page).") : null,
        h("div", { class: "tiles-name-row" }, field("Icon", icon, "Any emoji"), field("Name", name)),
        field("Link", url), field("Short line (optional)", blurb), field("Where", folder),
        field("Who sees it", roleBoxes, "Leave all unticked for everyone. The Owner always sees it. The other site keeps its own PIN/password.")), actions });
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
