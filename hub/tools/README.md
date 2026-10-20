# Building a tool (tile)

Each tile on the home screen is a folder in `hub/tools/<id>/`.

```
hub/tools/inventory/
  manifest.js   ← what the tile looks like and what access levels mean
  index.js      ← the tool itself: export function mount(el, ctx)
```

## manifest.js

```js
export default {
  id: "inventory",                 // lowercase, letters/numbers/dashes; also the permission key
  name: "Inventory Requests",
  icon: "📦",
  blurb: "Ask for supplies before they run out",
  accent: "orange",                // lime | orange | aqua | gold | magenta | purple
  status: "live",                  // "soon" shows a Coming soon badge
  minLevel: 1,                     // optional: 2 = only people with Manage see the tile
  levels: { use: "Submit requests", manage: "Mark requests ordered or received" },
  load: () => import("./index.js"),
};
```

Then add one import line to `hub/tools/registry.js`.

## index.js

```js
import { h } from "../../js/ui.js";

export function mount(el, ctx) {
  // ctx.level       0 hidden · 1 use · 2 manage (for this tool, for whoever is signed in)
  // ctx.session()   { uid, me: {name, roleId, ...}, role, roles, location, tools }
  // ctx.sub         extra URL parts, e.g. #/tool/inventory/new → ["new"]
  // ctx.navigate()  go to another screen, e.g. ctx.navigate(`${ctx.base}/new`)
  // ctx.log(action, detail)   add a line to the activity log
  // ctx.toast(msg)  little confirmation message
  el.append(h("p", {}, `Hi ${ctx.session().me.name}`));
  return () => { /* optional cleanup: stop listeners when leaving the tool */ };
}
```

## Data and security

Store the tool's data under `locations/{loc}/tools-data/<id>/...` and add a matching
block in `firestore.rules` using `can(loc, '<id>', 1)` for use and `can(loc, '<id>', 2)`
for manage. The rules are what actually protect the data. Hiding a button is only
cosmetic.

Add any data functions the tool needs to **both** `hub/js/api/firebase.js` and
`hub/js/api/demo.js`, so the tool works in demo mode too.
