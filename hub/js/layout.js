// What the home screen shows, worked out from the tile settings in locations/{loc}/tools:
//   <toolId>        { enabled, order, folder }          a built-in tool (hub/tools/…)
//   folder-<x>      { kind: "folder", name, icon, order } a group of tiles, opened as its own screen
//   link-<x>        { kind: "link", name, icon, blurb, url, roles, enabled, order, folder }
//                   a tile that opens another site (trivia scores, KavaVote, karaoke…) in a new tab;
//                   roles = who sees it (empty = everyone; Owner always does)
// Order is per screen (home, or inside a folder). Administration is always last on the home screen.
import { TOOLS } from "../tools/registry.js";
import { levelFor, isOwner } from "./perms.js";

export const isFolderId = (id) => /^folder-/.test(id);
export const isLinkId = (id) => /^link-/.test(id);
export const FOLDER_ACCENT = "orange";

export function homeLayout(s) {
  const cfg = s?.tools || {};
  const folderIds = new Set(Object.keys(cfg).filter((id) => isFolderId(id) && cfg[id]?.kind === "folder"));
  const where = (c, id) => (id !== "admin" && c?.folder && folderIds.has(c.folder) ? c.folder : "");

  const items = [];
  for (const t of TOOLS) {
    const c = cfg[t.id] || { enabled: true, order: 999 };
    const level = levelFor(s, t.id);
    if (c.enabled === false || level < (t.minLevel || 1)) continue;
    items.push({ kind: "tool", id: t.id, t, level, order: c.order ?? 999, folder: where(c, t.id) });
  }
  for (const [id, d] of Object.entries(cfg)) {
    if (!isLinkId(id) || d?.kind !== "link" || d.enabled === false) continue;
    const roles = d.roles || [];
    if (!isOwner(s) && roles.length && !roles.includes(s?.me?.roleId)) continue;
    items.push({ kind: "link", id, d, order: d.order ?? 999, folder: where(d, id) });
  }
  const byOrder = (a, b) => (a.id === "admin") - (b.id === "admin") || a.order - b.order || String(a.id).localeCompare(b.id);

  const folders = {};
  for (const id of folderIds) {
    const kids = items.filter((x) => x.folder === id).sort(byOrder);
    folders[id] = { id, d: cfg[id], order: cfg[id].order ?? 999, items: kids };
  }
  const home = [
    ...items.filter((x) => !x.folder),
    // A folder only shows when there's something in it this person can open.
    ...Object.values(folders).filter((f) => f.items.length).map((f) => ({ kind: "folder", id: f.id, d: f.d, order: f.order, count: f.items.length })),
  ].sort(byOrder);
  return { home, folders };
}

// Which folder a tool lives in (for the Back button), or "".
export function folderOf(s, toolId) {
  const c = s?.tools?.[toolId];
  const f = c?.folder;
  return f && s.tools?.[f]?.kind === "folder" && toolId !== "admin" ? f : "";
}
