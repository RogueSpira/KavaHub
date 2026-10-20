// Placeholder screen for tools that have a tile but aren't built yet.
import { h } from "../../js/ui.js";

export function mount(el, ctx) {
  const t = ctx.tool;
  el.append(h("div", { class: "soon" },
    h("div", { class: `soon-icon accent-${t.accent}` }, t.icon),
    h("h2", {}, t.name),
    h("p", {}, t.blurb),
    h("div", { class: "chip chip-soon" }, "Coming soon"),
    h("p", { class: "muted small" }, `Your access: ${["hidden", "use", "manage"][ctx.level]}.`)));
}
