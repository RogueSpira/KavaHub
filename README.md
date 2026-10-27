# Kava Hub — Mandarin

Staff hub for Kava & Co. Mandarin. Each person signs in with their own 4-digit PIN and
gets a home screen of tiles. Their role (plus any per-person overrides) decides which
tiles they see and whether they can **use** or **manage** each one. It runs in the
browser on the POS iPad, a tablet or a phone, and can be added to the home screen as an app.

**Tiles so far**
- **Administration:** people & PINs (admins can view a PIN; each view is logged), roles &
  access grid, tiles on/off and order, activity log, settings.
- **Opening & Closing:** Opening, Shift Change and Closing lists; each check records who and
  when; Critical / Normal / Low priorities; Submit with a warning when critical items are
  missed; last night's close for kavatenders; full history and list editing for managers.
- **Knowledge Bank:** how-to guides, recipes and knowledge with search and categories.
- **Suggestion Box:** a shared board of named suggestions with manager status and replies.
- **TV Screens:** marked "Soon". Inventory Requests and Complaints are shelved (folders kept,
  not on the home screen).

**Where it runs**
- **Netlify:** hosts the web app, plus one Netlify Function that checks PINs and handles
  adding/changing people.
- **Firebase, free Spark plan:** the database (Firestore), sign-in (Authentication) and
  the security rules.

## Try it without any setup (demo mode)

Add `?demo` to the address (or set `firebaseConfig = null` in `hub/js/config.js`) and the
hub runs on sample data in memory. Nothing is saved.

```bash
cd hub && python3 -m http.server 8000     # then open http://localhost:8000/?demo
```

Sample PINs: Rogue (Owner) **2580** · Josh (Manager) **3690** · Daniel **1357** · Wheatyn **2468**.
Add `?demo=fresh` to the URL to see the first-time setup screen.

## How it's put together

```
hub/                         the web app (Netlify publishes this folder)
  js/app.js                  PIN pad, setup, home tiles, tool host, auto-lock
  js/api/firebase.js         every read/write goes through here…
  js/api/demo.js             …or through this in-memory copy for demo mode
  tools/registry.js          the list of tiles. Adding a tool = folder + one line here
  tools/<id>/                one folder per tool (see hub/tools/README.md)
netlify/functions/hub.mjs    the server endpoint (/.netlify/functions/hub)
netlify/lib/handlers.js      server logic: setup, PIN sign-in, people & roles
firestore.rules              who can read/write what in the database
test/                        server tests (npm test)
```

**How PINs are kept safe**
- PINs are never stored as plain numbers. Each PIN becomes a keyed hash (HMAC with
  `PIN_PEPPER`, a secret only the Netlify Function knows), so the server can find who owns
  a PIN and make sure no two people share one. When an admin taps Show PIN, the server
  works the PIN back out by checking all 10,000 possibilities.
- After a correct PIN, the function signs the person into Firebase.
- From then on, the database security rules read their role and access live, so role
  changes and deactivations take effect immediately.
- Sign-in isn't remembered: reloading the page, tapping Lock, or the auto-lock timer
  (default 2 minutes, set in Admin → Settings) goes back to the PIN pad.

**Other locations later**
- All data lives under `locations/<id>/`, and every sign-in is tied to one location.
- This copy is `mandarin`. Another location would open the same app with `?loc=<their-id>`
  and run its own first-time setup. Nothing would be shared between locations.

## Going live

You need: Node 20+ on your computer, a GitHub account, a Netlify account and a Google account.

### 1. Firebase (free Spark plan, in the browser)
1. console.firebase.google.com → **Add project** (e.g. `kava-hub-mandarin`). Analytics isn't needed.
2. **Firestore Database** → Create database → **Production mode** → location `us-east1`
   (or `nam5`). The location can't be changed later.
3. **Authentication** → **Get started**. You don't need to enable any sign-in providers.
4. **Project settings → Your apps** → the **</>** (Web) icon → nickname "Kava Hub".
   - Copy the `firebaseConfig = { … }` block it shows.
5. **Project settings → Service accounts** → **Generate new private key**.
   - A JSON file downloads. Keep it private and **don't** put it in the project folder or
     on GitHub.

### 2. Point the code at your project
1. **`hub/js/config.js`:** replace `export const firebaseConfig = null;` with the config
   you copied (keep every field it gave you).
2. **`.firebaserc`:** replace `YOUR-FIREBASE-PROJECT-ID` with your project ID.

### 3. Push the code to GitHub
Create a **private** repo (e.g. `KavaHub`) and push this folder to it, the same way as
KavaVote.

### 4. Netlify site
1. Netlify → **Add new site → Import an existing project** → GitHub → pick the repo.
   - The settings come from `netlify.toml`, so leave build settings as they are.
2. Before (or right after) the first deploy, go to **Site configuration → Environment
   variables** and add these three:

   | Key | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | the **entire** service-account key file: open it in a text editor, select all, copy, paste |
   | `PIN_PEPPER` | a long random string; make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `SETUP_CODE` | any phrase; you type it once on the setup screen |

   - Save `PIN_PEPPER` somewhere safe (a password manager) and **never change it**.
     Changing it makes every PIN stop working.
   - Once these are in Netlify, you can delete the downloaded key file.
3. Also add `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` = the `apiKey` value from
   `hub/js/config.js`. Netlify's secret scanner otherwise blocks deploys because it mistakes
   that public Firebase key for a secret. (This has to be set here; `netlify.toml` isn't enough.)
4. **Deploys → Trigger deploy → Deploy site**, so the function picks up the variables.

### 5. Publish the database rules (one time, and whenever `firestore.rules` changes)
Firebase console → **Firestore Database → Rules** → replace everything with the contents
of `firestore.rules` → **Publish**. (Or, with the Firebase CLI: `firebase deploy --only firestore:rules`.)

### 6. Allow your Netlify address in Firebase
Firebase console → **Authentication → Settings → Authorized domains** → **Add domain** →
your Netlify address (e.g. `kava-hub-mandarin.netlify.app`) plus any custom domain.

### 7. First-time setup
1. Open your Netlify address. You should see **Welcome to Kava Hub**.
2. Enter the SETUP_CODE, your name and your PIN. That creates the location, the default
   roles (Owner, Manager, Kavatender) and your Owner account. The setup screen never
   appears again.
3. Administration → People → add each staff member with their PIN.

### 8. On the iPads and phones
Safari → open the address → Share → **Add to Home Screen**.

### If something goes wrong
First open `https://<your-site>.netlify.app/.netlify/functions/hub`. It shows whether the server
loaded and which settings are present (no secret values are shown).

| What you see | Likely cause |
|---|---|
| "Server is missing its Firebase settings" | `FIREBASE_SERVICE_ACCOUNT` is missing. Add it, then redeploy. |
| "…isn't a valid key file" | Only part of the key file was pasted. Paste the whole file again and redeploy. |
| "Something went wrong on the server" | Check Netlify → Logs → Functions → `hub`. |
| Setup code "isn't right" | The code you typed doesn't match `SETUP_CODE`. Variable changes need a redeploy. |
| PIN works but the screen goes straight back to the PIN pad | The rules from step 5 aren't published, so the hub can't read your account. |
| Yellow "Demo mode" bar | The address has `?demo` in it, or `firebaseConfig` in `config.js` is `null`. |
| A device still shows the old version after an update | Close the hub and reopen it (Ctrl+F5 on a computer). |

### Updating later
- **App and server changes:** push to GitHub and Netlify redeploys automatically.
- **`firestore.rules` changes:** paste into Firebase console → Firestore → Rules → Publish.

## Menu Maker

Quick express menus for event nights. Start from the Express template (lattes by size + signature
cocktails) or a blank one, type the drinks, descriptions and prices, and hit Print. It comes out in the
Kava & Co. look on a full page, or two half-pages per sheet with a cut line. Text sizes itself to fill
one page. Menus are saved so they can be reused or copied.

## Reel Maker

Short vertical videos (1080×1920) for Instagram Reels and Stories: Drink spotlight, Event promo,
Tonight's specials and Meet your kavatender. Fill it in (or pull from TV Screens), watch the preview,
then **Make video** records it once in real time and offers Share (Instagram, Photos…) or Download.
Use Safari on the iPad or iPhone for the best result: it records H.264 MP4, which Instagram takes.
Nothing is stored. Add music inside Instagram.

## Side Quests

Extra jobs outside the daily lists. Kavatenders tap **I did it** (with an optional photo and note);
a manager approves it under **Review** and they get a ★. Every 5 ★ become a green ★. The **Leaderboard**
shows this month and all time. One-time quests come off the board once approved; repeating ones stay up.
A quest can be set to unlock on a date — it shows under "Coming up" until then.

## The TV board

The TVs open `https://kavahub.netlify.app/board/?tv=1` (or `?tv=2`, …). No PIN on the TVs — the board only reads.
Everything it shows is set in the hub under **TV Screens**:

- **Today** — tap who's opening and closing. Goes back to the weekly schedule at 5 AM.
- **Events** — one-time, weekly, or monthly (1st–4th / last weekday), with flyers.
- **Slides** — Who's Working roster and weekly schedule, happy hour, specials, signature drinks, botanicals, community photos, ticker, welcome, QR links.
- **Screens** (Manage) — which slides each TV shows, the order, seconds per slide, Jungle or Night colors.
- **Permissions** (Manage) — which roles may change each part.
- **Import** (Manage) — one-time copy from the old Google Sheets.

`/board/?demo` shows sample content. On a TV remote: → next slide, ← back, OK pauses.
The board reloads itself at 5:10 AM each day to pick up updates.

## Tests
`npm install && npm test` runs the server logic (setup, PIN sign-in, adding and changing
people, role ranks, last-Owner protection, PIN uniqueness, Show PIN) against an in-memory
stand-in for Firestore.

## Default access

| Tool | Owner | Manager | Kavatender |
|---|---|---|---|
For a brand-new location setup:

| Tool | Owner | Manager | Kavatender |
|---|---|---|---|
| TV Screens | Full | Manage | Use |
| Opening & Closing | Full | Manage | Use |
| Knowledge Bank | Full | Manage | Use |
| Suggestion Box | Full | Manage | Use |
| Administration | Full | Hidden | Hidden |

A tool added after setup starts hidden for every role except Owner, so grant it in
Admin → Roles & Access. Everything is editable there, and for one person at a time in
their People entry.
