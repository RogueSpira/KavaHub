// Access levels, worked out the same way as firestore.rules.
export const HIDDEN = 0, USE = 1, MANAGE = 2;
export const LEVEL_NAMES = ["Hidden", "Use", "Manage"];

export const isOwner = (session) => session?.me?.roleId === "owner";

// Effective access for one tool: Owner = manage; else a personal override; else the role's setting.
export function levelFor(session, toolId) {
  if (!session) return HIDDEN;
  if (isOwner(session)) return MANAGE;
  const ov = session.me.overrides || {};
  if (Object.prototype.hasOwnProperty.call(ov, toolId)) return ov[toolId];
  return session.role?.perms?.[toolId] ?? HIDDEN;
}
