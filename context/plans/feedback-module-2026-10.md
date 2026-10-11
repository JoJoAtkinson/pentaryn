---
title: Pentaryn Feedback — design record (2026-10)
status: built (not yet tested live)
last_modified: 2026-10-11
tags: [foundry, modules, feedback, bug-report, plan, mcp]
---

# Pentaryn Feedback — build-vs-adopt decision and design (2026-10)

**Read this when:** you are building `pentaryn-feedback` (the in-world bug / defect / feature
reporter) or want to know why it is shaped the way it is. **Not this file:** to *use* it — file a
report, process the queue with the LLM — read the use-doc `context/foundry/feedback.md` once it
exists. This is a plan; it is history once the module ships.

Constraints the design was written under: Joe is play-testing on the main checkout, so nothing
here was tested live. Everything is designed to be proven by `node --test`, `pytest` and the repo's
static gates, with the live checks listed as `afterSync` lines for the first sync.

---

## 1. Decision: BUILD

A survey of the module ecosystem (2026-10-11; sources at the end) found nothing that files a
report *into the world* with the context Joe wants, and nothing an LLM can read one report at a
time. The near matches all ship the report somewhere else.

Y = yes, N = no, P = partial, ? = not stated.

| Module | v14 verified | Players can file | 3 categories + hover help | Action history | Game context | Local storage, no external service | LLM one-at-a-time | Score |
|---|---|---|---|---|---|---|---|---|
| **Bug Reporter** (League of Foundry Developers) | N (verified 9, ~4.7 y old) | ? | N (free-form issue) | N | P (opted-in packages only) | N (GitHub/GitLab issues via a League API) | N | 1/7 |
| **Errors & Echoes** (rayners) | N (verified 13) | N/A (automatic, no report UI) | N | N | Y (versions, scene, browser) | N (POSTs to an external endpoint) | P (structured JSON, on someone else's server) | 1.5/7 |
| **Debug Report Generator** (`/debug`) | N (verified 10) | ? | N | N | P (environment dump) | ? (prints) | N | 0.5/7 |
| **Change Log** | Y (verified 14.360) | N/A (automatic) | N | P (actor/item/effect changes only) | N | Y (chat / journal) | N (prose chat cards) | 1.5/7 |
| **Table Barometer** | ? | Y | N (rating axes) | N | N | Y | N | 1/7 |
| **BB's Red Flag**, **Session Title Suggestions**, **Simple Requests**, **Player Approval** | v12-era | Y | N | N | N | Y (chat) | N | ~1/7 |
| **SCH Customize** / **MRKB Chat Enhancements** (chat export) | v13 | GM only | N | N | N | Y (HTML/PDF) | N | ~1/7 |

**Why not ADOPT+EXTEND the closest two.** Bug Reporter and Errors & Echoes would each need: a v14
port, a new dialog, a new store, a client-side action recorder and a Python reader — that is the
whole module, on top of code we do not own. The custom one is smaller than the adaptation, and
it can follow the addon blueprint so the kit, gates and `describe()` conventions come for free.

**What we borrow.** Errors & Echoes' capture technique (window `error` / `unhandledrejection`,
console wrap, never swallowing) and its sectioned payload with a `schemaVersion`; Bug Reporter's
"open the form pre-filled" API; Debug Report Generator's `/bug` chat command; Change Log's
own-user document-operation filter (`userId === game.user.id`).

---

## 2. Requirements → design, in one table

| Joe asked for | Design |
|---|---|
| Bug icon in the left menu, every user | `getSceneControlButtons`: a `button: true` tool in the `tokens` group (players see it), `fa-solid fa-bug` (§4.1) |
| A prompt with a text box and three categories with hover help, Bug default | ApplicationV2 dialog, radio-style category buttons with `data-tooltip` from `lang/en.json`, `bug` checked (§4.2) |
| Save the text, the category, the user and all the context | one JSON report per submission, schema v1 (§7) |
| The player's clicks and actions, logged if the server does not have them | the server has none (recon §3 confirmed: no "Updated" lines, no UI events). A per-client ring buffer of the user's own actions, attached to the report (§5) |
| Easy for the LLM to process one at a time | reports are files on disk; four `dnd-scripts` MCP tools render one report as compact markdown (§8) |
| Works when a player files it; survives the GM being offline | player → active GM relay query; when there is no GM the report queues on the player's own User flag and flushes when a GM connects (§6) |
| "Pretty light" | full tier because it stores state and has a relay, but one feature file, one dialog, one store, ~900 lines of module code before tests; no socketlib, no templates, no third-party packages |

---

## 3. Module shape

| Field | Value |
|---|---|
| id / short / namespace | `pentaryn-feedback` / `feedback` / `game.pentaryn.feedback` |
| tier | **full** (persistent state, a relay write, settings, `inspect`); kit extras `--kit election,patch` |
| i18n root / CSS prefix | `PENTARYN_FEEDBACK` / `pfb-` (not taken: `pcur-`, `pnm-`, `ppg-`, `pp-`) |
| dnd5e | yes (`dnd5e.postUseActivity` is recorded; hp in the snapshot) — keep the `relationships.systems` row (C03) |
| `socket` | `false` — queries ride core's socket |
| generator | `./.venv/bin/python scripts/foundry/blueprint/new_module.py feedback --title "Pentaryn Feedback" --description "A bug button in the left toolbar: players file a bug, defect or feature request with their recent actions and the live game context attached; the GM stores it as a file the repo's MCP tools read one at a time." --tier full --kit election,patch --out <scratch> --check`, then `--out foundry/module --install --docs` |

### 3.1 Files

```
pentaryn-feedback/
  module.json              flags.pentaryn: tier full, namespace feedback, cssPrefix pfb-, afterSync (§10)
  feedback.mjs             ENTRY: wiring only (template body; FEATURES = [recorder, reporter])
  feedback-core.mjs        PURE: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS,
                           CATEGORIES, LIMITS, clip(), redact(), ringPush(), validateReport(),
                           normaliseReport(), reportPath(), queueTrim(), STATUSES, nextStatus()
  settings.mjs             SETTINGS: historySize, captureConsole
  api-manifest.mjs         rows: inspect, selftest, open, submit (relay), list, get, resolve
  api.mjs                  impls; buildApiFor(ctx); inspect(); selftest()
  recorder.mjs             FEATURE: the action ring, the error ring, the console/notify wraps,
                           the body click listener; install(reg, ctx) / uninstall()
  reporter.mjs             FEATURE: the toolbar tool, the /bug chat command, submit(), the
                           offline queue (user flag) and its flush, GM-side ingest
  snapshot.mjs             ADAPTER: snapshot(g) → plain context JSON (the only file reading
                           canvas/ui/game beyond the hooks)
  files.mjs                ADAPTER: the file store — ensureDir(), put(path, json), get(path),
                           list(dir) over FilePicker + fetch; injectable for tests
  dialog.mjs               WIDGET: ReportDialog (ApplicationV2, _renderHTML builds DOM)
  lib/                     vendored kit + kit.lock.json
  lang/en.json             PENTARYN_FEEDBACK.*
  styles/feedback.css      .pfb-* only
  test/                    run.mjs, core/glue/hooks/api/i18n tests, golden/, fixtures/, kit/
  README.md, CHANGELOG.md
```

Import direction (C16): `reporter` → `dialog`, `snapshot`, `files`, core, settings, lib;
`recorder` → core, settings, lib; `api` → `files`, `snapshot`, core, settings, manifest, lib and
`ctx.exposed` for anything a feature owns (`recorder` exposes `actions()`, `errors()`; `reporter`
exposes `open()`, `pending()`); `dialog` → core, lib; `snapshot`/`files` → core, lib.

### 3.2 Settings (`settings.mjs`)

| key | scope | type | default | notes |
|---|---|---|---|---|
| `historySize` | world | Number | 200 | actions kept per client; read on every push (live, no reload), clamped 20..1000 |
| `captureConsole` | world | Boolean | true | wrap `console.error` / `console.warn`; `requiresReload` (the wrap installs at `setup`) |

No store rows: the report store is files, not settings (blueprint §5.3: never bulk data in world
settings). No keybinding.

### 3.3 Repo wiring

- `scripts/foundry/ops/config.py` `MODULES["feedback"] = ModuleSpec("pentaryn-feedback", check=(*_STATIC, "node-test", *_BLUEPRINT))` (after_sync comes from `module.json`).
- `foundry/adjustments.yml` rows (§5.6 of the blueprint): `feedback-console-error`,
  `feedback-console-warn` (wrapMethod on `console`), `feedback-notifications-notify` (wrapMethod on
  `foundry.applications.ui.Notifications.prototype.notify`). The `getSceneControlButtons`,
  `chatMessage`, `error`, `userConnected` hooks are public: no rows. The body click listener is
  not a wrap: no row.
- `context/foundry/README.md`: the "Route by task" row + `make foundry-module-index`.
- `CLAUDE.md` route row: "A player's bug / defect / feature report — list, read one, resolve" → `context/foundry/feedback.md`.
- `scripts/feedback_reports.py` (new, §8) + `scripts/tests/test_feedback_reports.py`.
- `scripts/foundry/blueprint/packages.json`: untouched (no third-party package).

---

## 4. UI

### 4.1 The toolbar button

```js
reg.on("getSceneControlButtons", controls => {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools.feedback = {
    name: "feedback", order: 90, button: true,
    title: "PENTARYN_FEEDBACK.Control.Title",      // "Report a bug or idea"
    icon: "fa-solid fa-bug",
    onChange: () => void open(),
  };
}, { guard: false, label: "getSceneControlButtons: feedback" });
```

Shape is v14's (`scene-controls.mjs:13-32`); `visible` is left unset so every user sees it (ties'
review tool sets `visible: game.user.isGM`; we do not). A `button` tool runs `onChange(event,
true)` without changing the active tool (`:593-603`). Known gap: core returns early when
`!canvas.ready`, so with no scene viewed the button is dead; `/bug` in chat and
`game.pentaryn.feedback.open()` are the two other doors, and the README's Pitfalls says so.

### 4.2 The dialog (`dialog.mjs`)

`ReportDialog extends foundry.applications.api.ApplicationV2`, `_renderHTML()` builds DOM the way
`pentaryn-ties/look.mjs:222` does (no Handlebars template, no extra file). One instance at a time
(`open()` re-renders the existing one and focuses the textarea). `await app.render({force: true})`
before touching `element` (§5.9).

Layout, top to bottom, every string from `lang/en.json` (C36):

1. Intro line: "Tell us what happened. Your last few minutes of actions and the game state are
   attached so it can be reproduced."
2. **Category** — three `<label class="pfb-cat">` wrapping `<input type="radio" name="category">`,
   `bug` checked by default. Each label carries `data-tooltip` + `data-tooltip-direction="UP"` with
   the exact help text (core's TooltipManager renders `data-tooltip` on hover and focus):

   | key | label | tooltip (`PENTARYN_FEEDBACK.Category.<key>.Help`) |
   |---|---|---|
   | `feature` | Feature | 100% new: it does not exist yet, like a new tab or a new subsystem. |
   | `bug` | Bug | It is just broken. If you don't know which to pick, Bug is a good default. |
   | `defect` | Defect | It works, just not the way you expect, so it comes across as a bug. If you don't know, pick Bug. |

   The order on screen is Bug · Defect · Feature (default first). The same help text is repeated
   under the row as a one-line hint for the selected category, so touch users without hover see it.
3. **Textarea** (`maxlength` = `LIMITS.text` = 4000), placeholder "What were you trying to do, what
   happened, what did you expect?". Submit is disabled while the trimmed text is empty.
4. `<details class="pfb-attach">` "What gets attached" — a short list built from the live snapshot
   summary: "your name and role · scene <name> · <n> recent actions · <n> recent errors · <n> of
   your chat messages · open windows · module versions". Nothing from other players' chat; no
   whispers; no setting values.
5. Buttons: **Send report** (`data-action="submit"`), **Cancel** (`data-action="cancel"`).

The decision logic is pure and in core: `draftFrom({ category, text })` → `{ category, text }`
(unknown category → `bug`; text clipped). The dialog only reads the form and calls
`reporter.submit(draft)`. On success: `ui.notifications.info("Thanks — report <id6> saved.")`; on
queue: "No GM is online; your report will be sent when one connects." (both localised).

### 4.3 Other doors

- `/bug <text>` in chat (`chatMessage` hook, returns `false` so nothing is posted): opens the dialog
  with the text pre-filled. `/bug` alone opens it empty.
- `game.pentaryn.feedback.open({ category?, text? })` for macros and other modules — the Bug
  Reporter idea. A later follow-up may add a "Report this" button to error notifications; not now.

### 4.4 GM notice

When the relay stores a report, the active GM client shows one `ui.notifications.info` ("<user>
filed a <category> report (<id6>)") and the kit audit line `log.info` (cross-user write, §5.1a).
Nothing is posted to chat.

---

## 5. Capture: what the client records

All of it lives in `recorder.mjs`, installs at `setup` on every client (players included), and
is read only when a report is built. Every handler is synchronous, pushes one small plain object
and returns; nothing is serialised until submit. Nothing runs on `pointermove`, `hoverToken`,
`refreshToken`, `updateToken` (position spam) or `renderChatLog`.

### 5.1 The action ring

`ringPush(ring, entry, max)` in core: push, then `splice(0, ring.length - max)`. `max` is the
`historySize` setting read on each push (the kit's `settingReader` is live). Entries are
`{ t, kind, ...fields }` with `t = Date.now()`; every string field goes through `clip(s, 120)`.

| kind | hook / source | fields | note |
|---|---|---|---|
| `scene` | `canvasReady` | `id, name` | |
| `tool` | `renderSceneControls` | `control, tool` | only when the pair changed |
| `tab` | `changeSidebarTab` | `tab` | |
| `control` | `controlToken` | `token, actor, on` | |
| `target` | `targetToken` | `token, on` | only this user's targeting (`user.id === game.user.id`) |
| `app` | `renderApplicationV2` / `closeApplicationV2` (AppV2 fires `render<Class>` for every class in the chain, `application.mjs:1728-1730`) plus `renderApplication` / `closeApplication` for legacy V1 | `op, cls, id, title` | skipped: our own dialog, `ChatLog`, `SceneControls`, `Hotbar`, `Players`, `Notifications`; a render of an already-open app is one entry per 2 s per id |
| `click` | one `document.body` `click` listener, capture phase | `action, cls, id, text` | only when `event.target.closest("[data-action]")` exists; `cls`/`id` from `closest(".application")`; `text` = the button's trimmed text or `aria-label`, clipped to 40; never an input value |
| `doc` | `createX` / `updateX` / `deleteX` for Actor, Item, Token, Combat, Combatant, ActiveEffect, Scene, JournalEntry | `op, type, id, name, keys` | only `userId === game.user.id`; `keys` = top-level keys of `changes` (and `system.*` one level), ≤ 8; values never recorded |
| `chat` | `createChatMessage` | `id, flavor, total, whisper` | only the user's own; `flavor` clipped to 80; `total` = first roll's total; `whisper` is a boolean, content never recorded |
| `use` | `dnd5e.postUseActivity` | `item, activity, actor` | names only |
| `combat` | `updateCombat` (round/turn changed) | `round, turn, combatant` | |
| `notify` | wrap `Notifications.prototype.notify` | `level, text` | the user's notifications; `text` clipped to 120 |

Cost: one Map lookup and one push per event; the `click` listener does one `closest()`. The ring
is ≤ 1000 small objects. `renderApplicationV2` can fire often for a sheet that re-renders on every
HP tick, hence the per-id 2 s throttle (a timestamp map, not `setTimeout`).

### 5.2 The error ring (50 entries)

| source | how | entry |
|---|---|---|
| `window` | `addEventListener("error")` and `("unhandledrejection")`, no `preventDefault` | `{ t, source: "window"|"promise", message, stack }` |
| `hooks` | `reg.on("error", (location, error, data) => …)` — core's own hook (`helpers/hooks.mjs:187`) | `{ t, source: "hooks", location, message, stack }` |
| `console` | `wrapMethod(MODULE, { target: console, name: "error", marker, adjustments: "feedback-console-error" }, (wrapped, ...args) => { try { record(args) } catch {} return wrapped(...args); })`; same for `warn`; installed only when `captureConsole` is on | `{ t, source: "console.error"|"console.warn", message }` |

`message` is `clip(String(x), 300)`; `stack` keeps the first 4 lines, each clipped to 200, after
`redact()`. The same error reaching the ring twice within 1 s from two sources is kept once (same
`message`): the hooks path logs through `console.error` too.

### 5.3 Redaction (`redact(s)` in core, applied to every free-text field)

- `clip()` first, so the regex never sees more than the cap.
- `/(token|key|secret|password|authorization|bearer)\s*[=:]\s*\S+/gi` → `$1=[redacted]`.
- Anything that looks like a URL query string (`?…=…`) loses its query.
- Never recorded at all: other users' chat text, whisper contents, setting values, form input
  values, journal page text, the user's password/access key (not reachable anyway), cookies.

### 5.4 The context snapshot (`snapshot.mjs`, `snapshot(g = globalThis)`)

A pure-ish adapter: reads globals, returns plain JSON, never throws (every section is in its own
`try` and reports `{ error: message }` on failure so a broken section never blocks a report).

| section | source | shape |
|---|---|---|
| `world` | `game.world`, `game.system`, `game.version` | `{ id, title, system, systemVersion, coreVersion }` |
| `user` | `game.user` | `{ id, name, role, isGM, character: { id, name } \| null }` |
| `scene` | `canvas.scene`, `game.scenes.active`, `game.scenes.viewed` | `{ viewed: {id,name}\|null, active: {id,name}\|null, canvasReady }` |
| `tokens` | `canvas.tokens.controlled`, `game.user.targets` | `{ controlled: [{ id, name, actorId, actorName, actorType, hp }], targeted: [...] }`, ≤ 10 each; `hp` = `{ value, max }` from `actor.system.attributes.hp` when present |
| `combat` | `game.combat` | `{ id, round, turn, combatant, started, sceneId } \| null` |
| `windows` | `foundry.applications.instances` (`applications/_module.mjs:36`) + `Object.values(ui.windows)` for V1 | `[{ id, cls, title }]` ≤ 20, title clipped to 60 |
| `modules` | `game.modules` active | `[{ id, version }]`, every active module (the GM wants exact versions) |
| `client` | `navigator`, `window`, `game.i18n.lang` | `{ ua (clipped 120), viewport: "WxH", lang, tz }` |
| `chat` | `game.messages` last 10 by this user | `[{ t, id, flavor, total, whisper }]` (the ring's `chat` shape) |

`errors` and `actions` are added by `reporter.submit()` from the recorder's rings, newest last.

---

## 6. Storage and delivery

### 6.1 Where a report lives: **one JSON file per report on the server's disk**

`Data/pentaryn-feedback/<worldId>/<reportId>.json`, written by the active GM's client with
`FilePicker.upload("data", dir, file, {}, { notify: false })` (dropbin's mirror, `dropbin.mjs:87-99`;
prompts' `gather.mjs:153-164` does the `createDirectory` first and ignores "already exists").

| store | player can write | survives restart | Python reads it without the bridge | bulk-safe | status edits from both sides |
|---|---|---|---|---|---|
| world setting (serialStore) | no (relay) | yes | only via a mirror file | **no** — every client downloads every setting at login; 50 reports × 30 KB is a 1.5 MB login tax | relay + mirror race |
| JournalEntry per report | no (relay; `keepId` idempotent) | yes | **no** — LevelDB is locked while Foundry runs; needs a new typed tool in the MCP fork (another repo) and a live server | fine | fork only |
| ChatMessage whispered to GM | **yes** (a player may create a chat message) | yes | no (same LevelDB problem) and it clutters the log | fine | no |
| **file per report under `Data/`** | no (relay) | yes | **yes** — `scripts/feedback_reports.py` reads the directory with the repo's own `FOUNDRY_DATA` path, Foundry up or down | yes, nothing is sent to clients | both sides read-modify-write the one file; rare and documented |

Files win because the review loop is the point: Joe's rule is "use the MCP tool", and the
`dnd-scripts` server runs in this repo on the same machine as Foundry. No fork change, no live
server needed to triage, no login-time cost, and a report is one `cat` away when something goes
wrong. The cost is that only a GM client can write (hence the relay) and the GM API's `list`
goes through `FilePicker.browse` + `fetch` (Foundry serves `Data/` statically; the GM-side read
uses `fetch(path, { cache: "no-store" })`).

Idempotency across two GM tabs (the bridge tab plus a browser, §5.9.2): both tabs receive the
relay and both upload `<id>.json` built from the request alone, so the bytes are identical and the
second upload is a no-op. The report id is minted on the **player's** client
(`foundry.utils.randomID(16)`), so a retry after a timeout resubmits the same id and overwrites
with the same content rather than duplicating.

Privacy note for the README: anything under `Data/` is served by URL without login while the
tunnel is up (importer `api.mjs:258`). Foundry does not list directories, ids are 16 random
characters, and the report holds nothing that is not already the player's own (§5.3). Acceptable
for Joe's table ("players are not console readers"); say it plainly in Pitfalls.

### 6.2 The relay (`api-manifest.mjs` row `submit`, `relay: true`)

```js
// player (or the GM's own client, where queryGM runs the handler locally)
const r = await queryGM(`${MODULE}.submit`, report, { timeout: 10000 });

// active GM, every GM tab (wrapped by `relayed`)
async function submit(report, { user }) {
  const v = validateReport(report);                       // core: shape, caps, category ∈ CATEGORIES
  if (!v.ok) return fail("BAD_ARGS", v.reason);
  const safe = normaliseReport(report, { user });         // core: user fields come from ctx.user, not the payload
  await files.put(reportPath(safe.world.id, safe.id), safe);   // upload; createDirectory once per session
  log.info(`report ${safe.id} from ${user.name} (${safe.category})`);   // audit line
  notifyGM(safe);
  return ok({ id: safe.id, path: reportPath(safe.world.id, safe.id) });
}
```

`normaliseReport` sets `user = { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role }`
(a payload cannot file as someone else), `status = "open"`, `history = []`, `receivedAt`, clips
every string again on the GM side (a hand-built payload still cannot exceed the caps), and drops
unknown top-level keys. Oversize payloads (`JSON.stringify(report).length > LIMITS.bytes` =
256 KB) are refused with `BAD_ARGS` before anything is written.

### 6.3 No GM online: the offline queue

`submit()` on the reporter's client:

1. Build the report (§7).
2. `queryGM(...)`. On `ok` → done.
3. On `NO_GM`, a timeout, or any thrown error → `enqueue(report)`: append to
   `game.user.getFlag(MODULE, "queue") ?? []`, `queueTrim(queue, 5)` (oldest dropped, the user is
   told), `game.user.setFlag(MODULE, "queue", queue)`. A player may write their own User document
   (ties and combat already do `game.user.setFlag`), no GM needed.
4. Flush: on `ready` and on `userConnected(user, active)` when `user.isGM && active`, the
   reporter re-sends each queued report (same id, so a duplicate send is harmless) and removes it
   from the flag on `ok`. One flush at a time (a module-scope promise); an in-flight flush when
   another GM connects is skipped.
5. GM-side ingest, for the player who logged off with a queue: at `ready` and on `userConnected`
   (either side), the active GM scans `game.users` for `flags.pentaryn-feedback.queue`, writes each
   report through the same `submit` impl (with `user` = that User), then `user.unsetFlag(MODULE,
   "queue")`. Two GM tabs doing this write the same files; the second `unsetFlag` is a no-op.

The queue is capped at 5 × ≤ 256 KB on a User document, which every client receives; in practice a
report is ~20–40 KB and the queue is empty whenever a GM is around.

### 6.4 Status changes

`status` moves `open → triaged → resolved | wontfix` (any status may also go straight to
`resolved`/`wontfix`; `nextStatus(cur, req)` in core refuses anything else, and refuses to reopen
without `force`). Every change appends `{ t, status, note, by }` to `history`.

- Python `feedback_resolve` (§8) does the read-modify-write under `fcntl.flock` on `<file>.lock`
  (blueprint §5.9 Python rule).
- GM API `resolve(id, { status, note })`: `fetch` the file, apply `nextStatus`, `files.put` it back,
  `by = "gm:<name>"`. Last writer wins between a GM click and a Python edit on the same report in
  the same second — stated in the README; the review loop is the normal path.

---

## 7. The report (schema v1)

```jsonc
{
  "schemaVersion": 1,
  "id": "k3Yx9Qp2LmN7aB4c",            // randomID(16), minted on the reporter's client
  "t": 1760209331000, "iso": "2026-10-11T19:02:11.000Z",
  "receivedAt": 1760209331420,          // GM side
  "category": "bug",                    // "bug" | "defect" | "feature"
  "text": "Loot all did nothing on the second corpse",   // ≤ 4000
  "status": "open",                     // open | triaged | resolved | wontfix
  "history": [],                        // [{ t, status, note, by }]
  "user":   { "id": "…", "name": "Caven", "role": 1, "isGM": false, "character": { "id": "…", "name": "Caven" } },
  "world":  { "id": "pentaryn", "title": "Pentaryn", "system": "dnd5e", "systemVersion": "6.0.6", "coreVersion": "14.369" },
  "scene":  { "viewed": { "id": "…", "name": "Underdark Gate" }, "active": { "id": "…", "name": "Underdark Gate" }, "canvasReady": true },
  "tokens": { "controlled": [{ "id": "…", "name": "Caven", "actorId": "…", "actorName": "Caven", "actorType": "character", "hp": { "value": 12, "max": 27 } }], "targeted": [] },
  "combat": { "id": "…", "round": 3, "turn": 2, "combatant": "Caven", "started": true, "sceneId": "…" },
  "windows": [{ "id": "ActorSheet5eCharacter-Actor-…", "cls": "ActorSheet5eCharacter", "title": "Caven" }],
  "modules": [{ "id": "pentaryn-dropbin", "version": "0.4.0" }, …],
  "client":  { "ua": "…", "viewport": "1920x1080", "lang": "en", "tz": "America/Los_Angeles" },
  "chat":    [{ "t": …, "id": "…", "flavor": "Longsword — Attack", "total": 17, "whisper": false }],
  "errors":  [{ "t": …, "source": "hooks", "location": "Hooks.#call", "message": "…", "stack": "…" }],
  "actions": [{ "t": …, "kind": "click", "action": "lootAll", "cls": "ItemPileInventoryApp", "id": "…", "text": "Loot all" }, …],
  "module":  { "id": "pentaryn-feedback", "version": "0.1.0" }
}
```

`LIMITS` (core): `text 4000`, `field 120`, `message 300`, `stackLines 4`, `actionsMax 1000`,
`errorsMax 50`, `chatMax 10`, `windowsMax 20`, `tokensMax 10`, `queueMax 5`, `bytes 262144`.

---

## 8. The review side: `scripts/feedback_reports.py` (dnd-scripts MCP)

In-process tools (`MCP_TOOLS` + `MCP_HANDLERS`, like `scripts/dnd_roller.py`), `MCP_GROUPS =
["all", "foundry"]`. The directory is `FEEDBACK_DIR = $PENTARYN_FEEDBACK_DIR` or
`~/Library/Application Support/FoundryVTT/Data/pentaryn-feedback` (the same root
`scripts/foundry/ops/config.py` and `cloud.py` derive; the env override is what the tests use).
Every world subfolder is scanned unless `world` is given.

| tool | input | output |
|---|---|---|
| `feedback_list` | `status` ("open" default, or "triaged" / "resolved" / "wontfix" / "all"), `world?`, `limit` (50) | a markdown table, oldest first: `id6 · category · status · user · world · when (relative) · first 60 chars` + a count line |
| `feedback_next` | `status` ("open"), `world?` | the oldest matching report rendered in full (below), or "No open reports." |
| `feedback_get` | `id` (full or a unique prefix) | the report rendered in full; `raw: true` returns the JSON |
| `feedback_resolve` | `id`, `status` ("triaged" / "resolved" / "wontfix" / "open" with `force`), `note` | the updated header + history; refuses an illegal transition with the reason |

Annotations: the first three `readOnlyHint: true`; `feedback_resolve` `readOnlyHint: false,
destructiveHint: false, idempotentHint: true` (same status + note twice is one history line — the
handler skips an identical consecutive entry).

### 8.1 The compact rendering (`render_markdown(report, now)`)

```
# Feedback k3Yx9Q · bug · open
Caven (player) · world pentaryn · scene Underdark Gate (viewed = active) · 2026-10-11 19:02 (3 h ago)
combat: round 3, turn 2 — Caven · controlled: Caven (hp 12/27) · targeted: —

## Report
Loot all did nothing on the second corpse

## Context
- windows: ActorSheet5eCharacter "Caven", ItemPileInventoryApp "Corpse of Skeleton"
- client: 1920x1080 · en · Chrome 130 (from ua)
- modules: dnd5e 6.0.6 · core 14.369 · pentaryn-dropbin 0.4.0, pentaryn-aoe 0.3.1, … (pentaryn-* then the rest, one line)
- chat (last 10): -04:12 Longsword — Attack (17) · -03:40 Longsword — Damage (9) · …
- errors (2):
  -00:03 hooks TypeError: Cannot read properties of undefined (reading 'transferEverything')
         at lootAll (pentaryn-dropbin/loot.mjs:88)

## Timeline (oldest → newest; mm:ss before the report)
-02:14  tool tokens/select
-01:50  app ItemPileInventoryApp "Corpse of Skeleton"
-01:48  click lootAll "Loot all" in ItemPileInventoryApp
-01:48  doc update Actor Caven [items]
-00:31  app ItemPileInventoryApp "Corpse of Skeleton"
-00:03  click lootAll "Loot all" in ItemPileInventoryApp
-00:03  error (see above)
-00:00  report filed

## History
(none)
```

Rules: one line per action, relative `-mm:ss` to `report.t`, newest **last**; errors are
interleaved into the timeline by time and listed in full under Context; module list is pentaryn
modules first; the whole thing for a 200-action report is ~250 lines, so `feedback_next` fits one
tool result. A `feedback_list` row uses the first 6 characters of the id; `feedback_get` accepts
a unique prefix.

### 8.2 CLI

`./.venv/bin/python scripts/feedback_reports.py {list|next|get <id>|resolve <id> <status> [note]}`
for use without the server. No Makefile target: the MCP tool is the rule.

---

## 9. The GM-side API (`api-manifest.mjs`)

| path | params | returns | gm | writes | query/relay | notes |
|---|---|---|---|---|---|---|
| `inspect` | `ref` (user: User, id or exact name), `{ as? }` | `{ user, pending, actions? , errors? }` | false | false | query | `pending` = queued-report ids on that user's flag; `actions`/`errors` only for `game.user` itself (the rings are client-local) |
| `selftest` | — | `{ ok, checks }` | false | false | — | tool present in `ui.controls.controls.tokens.tools`; rings installed; console wrapped iff setting; dir reachable (GM) |
| `open` | `{ category?, text? }` | `{ ok: true }` | false | false | — | opens the dialog pre-filled |
| `submit` | `report` | `{ ok, id, path } \| { ok: false, code, reason }` | false | true | **relay** | §6.2 |
| `list` | `{ status?, world? }` | `{ reports: [{ id, t, category, status, user, world, text60 }] }` | true | false | query | `files.list` + a header fetch per file |
| `get` | `{ id }` | the report JSON | true | false | query | |
| `resolve` | `{ id, status, note, dryRun? }` | `{ ok, id, status, history } \| fail` | true | true | query | §6.4 |

`flags: { writes: ["flags.pentaryn-feedback.queue"] (User), reads: [] }`. `HOOKS`: `filed`
(`pentaryn-feedback.filed`, `(report)` on the GM after a store), `queued` (on the reporter).
Nothing listens to them yet; they exist for a future "Report this" affordance.

---

## 10. Tests

### 10.1 node (`test/*.test.mjs`, one process per file through `test/run.mjs`)

| file | pins |
|---|---|
| `core.test.mjs` | `CATEGORIES` = exactly `bug`, `defect`, `feature` with `default === "bug"`; `draftFrom` falls back to `bug` and clips; `clip`/`redact` table (secrets, query strings, caps); `ringPush` keeps the newest `max`; `queueTrim(5)`; `validateReport` (missing fields, bad category, oversize, unknown keys); `normaliseReport` replaces `user` with the sender's; `reportPath`; `nextStatus` transition table; `VERSION === module.json.version` |
| `glue.test.mjs` | the toolbar tool (golden `toolbar.json`: shape, no `visible`, `button: true`, order 90); recorder: `F.fire` each hook → the expected ring entry, another user's `updateActor` ignored, the per-id render throttle, a `body` click with and without `data-action`, `error` hook and `window` events land in the error ring, console wrap records **and** calls through (stub console), `captureConsole: false` installs no wrap; `/bug text` opens the dialog pre-filled (dialog stubbed via `ctx.exposed.open`); submit: `queryGM` ok → no flag; `NO_GM` → flag queue holds the report, cap 5; `userConnected(gm, true)` → re-sent, flag cleared; GM ingest at `ready` scans users and clears |
| `hooks.test.mjs` | `reg.ids()` labels (golden `hooks.json`) |
| `api.test.mjs` | `describe` / `surface` / `queries` goldens (one `relay` row, three `query` rows); `submit` via the registered `CONFIG.queries` handler with a fake `files` adapter: spoofed `user` replaced, oversize refused, file path and bytes; `list`/`get`/`resolve` against the fake adapter; `resolve` refuses `resolved → open` without `force`; `inspect` depth ≤ 4 |
| `i18n.test.mjs` | every key used exists; the three `Category.*.Help` strings are the exact sentences in §4.2 |

Stubs: `installFoundry({ user, users, scenes, messages, modules, settings })` from the vendored
test kit; `canvas`, `ui.controls`, `foundry.applications.instances`, `navigator` and `window`
listeners are set on `globalThis` by a small `test/fixtures/client.mjs` after install; `files.mjs`
takes `{ upload, browse, fetch, createDirectory }` so the api tests pass an in-memory map;
`queryGM` is exercised through the stub's `game.users.activeGM` (`isSelf` true/false) and a fake
`gm.query`.

**Not unit-testable without Foundry, and how it is covered instead:** the ApplicationV2 render
itself (a client class, not in `common/`), `data-tooltip` hover, the real `FilePicker.upload`/
`createDirectory` behaviour and the static `fetch` of `Data/`, the `canvas.ready` gate on the
toolbar click, socket timing of the relay across two GM tabs. These are the `afterSync` lines:
`game.pentaryn.feedback.selftest()`; file a report as the GM, then as a player (a second browser);
`ls "~/Library/Application Support/FoundryVTT/Data/pentaryn-feedback/<world>"`; then
`feedback_next` from Claude Code; then log the player out with a GM-less queue and back in with a
GM to see it flush.

### 10.2 pytest (`scripts/tests/test_feedback_reports.py`)

Fixture dir `scripts/tests/fixtures/feedback/{pentaryn,space-journey}/*.json` (three reports:
open/triaged/resolved, one with 200 actions and two errors). Cases: list filters and sorts oldest
first, `limit`; `next` picks the oldest open across worlds and `world` narrows; `get` by prefix,
ambiguous prefix refused; `render_markdown` — header line, relative times, newest-last timeline,
errors interleaved, pentaryn modules first, line count under 300; `resolve` writes status +
history under flock, rejects a bad transition, identical consecutive note is one line, unknown id;
server discovery registers the four tools in-process (the `test_server_discovery` pattern);
`test_foundry_ops` already fails when a module folder has no ModuleSpec.

### 10.3 Gates

`make foundry-feedback-check` (parse, imports, i18n, node-test, vendor, conformance),
`make foundry-lib-check`, `make test`, `make check-context`, and
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module feedback --markdown` at 100 %.

---

## 11. Build order (for the agents that follow)

1. Generate into scratch with `--check`, then `--install --docs` (§3). Commit the pristine scaffold.
2. `feedback-core.mjs` + `core.test.mjs` (replace `noteText` and friends; the blueprint's example
   checklist). Commit.
3. `snapshot.mjs`, `files.mjs`, `recorder.mjs` + glue tests. Commit.
4. `dialog.mjs`, `reporter.mjs` (toolbar, `/bug`, submit, queue, ingest) + glue tests, `lang/en.json`,
   `styles/feedback.css`. Commit.
5. `api-manifest.mjs`, `api.mjs`, goldens one file at a time, `adjustments.yml` rows. Commit.
6. `scripts/feedback_reports.py` + fixtures + pytest. Commit.
7. ModuleSpec row, README (C44 order), CHANGELOG, `context/foundry/feedback.md` (how Joe runs the
   loop: `feedback_next` → fix → `feedback_resolve`), routing rows, `make foundry-module-index`,
   all gates green. Commit.

Review checklist to run against the result: blueprint §5.9.4, plus: no handler in `recorder.mjs`
awaits or serialises; `submit` on the GM side builds the file from the request only; the player
never calls `game.settings.set`; no English string outside `lang/en.json`; the three help texts
match §4.2 verbatim.

---

## 12. Open questions and things deliberately left out

- **"Report this" on error notifications** — the kit's `log.notify` or a `renderNotifications`
  affordance; follow-up, not v0.1.
- **Screenshots** — `canvas.app.renderer.extract` could attach a WebP; skipped (size, privacy,
  and the timeline usually says more).
- **Status sync back to the player** ("your report was fixed") — out of scope; Joe tells them.
- **Per-user opt-out of capture** — not needed at Joe's table; the README states what is captured.
- **Group name** for `MCP_GROUPS` — `"foundry"` is new; nothing filters on it today, `"all"` is what
  matters.

## 13. Build record (2026-10-11) — what changed from the design above

Built on `feature/pentaryn-feedback` while Joe was play-testing; nothing was synced or tested live.
Where the build differs from §§3–10, this section wins.

| Design said | Built | Why |
|---|---|---|
| `submit` is a `relay: true` row; the payload goes to the GM, `normaliseReport` takes `user` from `ctx.user` | `submit` is a client-side API method. The reporter writes the report to its **own** User flag (`flags.pentaryn-feedback.queue.<id>`) and calls the relay row **`ingest({ userId, ids })`**; the active GM reads that user's queue, files it and deletes the keys | kit 1.0.1's `registerQueries` calls a row's implementation with the payload only — core's query context (the sender) never reaches it, so a relay impl cannot know who sent it. The User document's owner is server-authenticated (only that user or a GM can write it), so the queue's owner *is* the reporter. One path now covers online and offline; it is also less code |
| Offline queue = a separate path: `queueTrim` on an array, player-side flush on `userConnected(gm)` | The queue is an object keyed by id (targeted `_del` per key, so a GM deletion never races a player's add); no player-side flush — the active GM files every user's queue at `ready`, on `userConnected`, and on `updateUser` (a new queue key; the safety net if the query overtakes the flag broadcast) | per-key writes cannot lose a concurrent add; the GM can read any user's flag, so nothing has to be pushed |
| GM writes `<id>.json` built from the request | GM **looks first** and uploads only when the file is missing | a resend after a timeout (the report was filed but the answer was lost) must never reset a status Joe already set. Two GM tabs can both upload; the copies differ only in `receivedAt` |
| `snapshot.mjs`, `files.mjs` | `snapshot-adapter.mjs`, `files-adapter.mjs` | conformance classifies adapters by file name (`ADAPTER_NAME`); `api.mjs` may import an adapter but not an unclassified ("glue") file (C16) |
| no `updateToken` listener | `updateToken` is recorded like the other document types (own changes, keys only) | a committed token move is useful context and costs one id compare; the per-frame hooks (`refreshToken`, `pointermove`, …) are still not listened to |
| `selftest` checks the report folder is reachable (GM) | not checked | `selftest()` stays synchronous; the disk path is an `afterSync` line |
| Python `by` unspecified | `by = "claude-code"`; the GM API writes `gm:<name>` | |

Kit gap worth a later kit change (not made here — it would touch every migrated module's `lib/`
while another workflow is live): pass the query context to relay rows (`fn(data, ctx)`), so a
relay can check `ctx.user` as `relayed`'s doc comment promises.

Tests: node (`test/run.mjs`: core, glue, hooks, api, i18n, console, adapters) and pytest
(`scripts/tests/test_feedback_reports.py`, fixtures written by the module's own core; one test
compares the Python and JS status tables).

## Sources

- Foundry 14.369 client: `applications/ui/scene-controls.mjs:13-32, 383-413, 593-603`;
  `applications/api/application.mjs:417, 575-581, 1728-1730`; `applications/_module.mjs:36`;
  `applications/sidebar/sidebar.mjs:254`; `applications/ui/notifications.mjs:30, 108`;
  `canvas/placeables/tokens/targets.mjs:65`; `documents/collections/users.mjs:137`;
  `helpers/hooks.mjs:187`; `common/utils/helpers.mjs:1259` (`randomID`).
- Repo: `context/foundry/addon-blueprint.md` (§2 tiers, §3 generator, §5.1a API contract, §5.3
  settings, §5.6 adjustments, §5.9 async rules, §6 tests, §11 conformance); `foundry/lib/{queries,
  settings,patch,election}.mjs`; `foundry/module/pentaryn-dropbin/dropbin.mjs:87-99` (file mirror);
  `foundry/module/pentaryn-prompts/gather.mjs:153-164` (createDirectory); `pentaryn-ties/look.mjs:222`
  (AppV2 `_renderHTML`); `pentaryn-ties/attributes.mjs:596` (a player writing their own User flag);
  `scripts/mcp/server.py:509-600` (in-process tool discovery); `scripts/dnd_roller.py:541-683`
  (tool declaration shape); `scripts/foundry/ops/config.py:41-43, 98-130, 164-176`.
- Market survey: <https://github.com/League-of-Foundry-Developers/bug-reporter> ·
  <https://foundryvtt.com/packages/bug-reporter> · <https://foundryvtt.com/packages/errors-and-echoes> ·
  <https://github.com/rayners/fvtt-errors-and-echoes> · <https://foundryvtt.com/packages/debug-report> ·
  <https://foundryvtt.com/packages/change-log> · <https://www.foundryvtt-hub.com/?s=bug+report> ·
  <https://foundryvtt.com/packages/table-barometer> · <https://foundryvtt.com/packages/bb-redflag> ·
  <https://foundryvtt.com/packages/asc-session-title-suggestions> ·
  <https://foundryvtt.com/packages/simple-requests> · <https://foundryvtt.com/packages/player-approval> ·
  <https://foundryvtt.com/packages/sch-customize> · <https://foundryvtt.com/packages/mrkb-chat-enhancements>

## Live test checklist (run after play testing)

Nothing in this module has run in Foundry yet. Do these in order, on a world you can afford to
poke at. Branch `feature/pentaryn-feedback` must be merged (or checked out) in the main checkout
first.

1. **Sync.** `make foundry-feedback-sync` (runs the static gates, then installs the module into
   Foundry's `Data/modules`). Never run it mid-session.
2. **Restart Foundry** (module.json is read at startup, and this is a first install), enable
   "Pentaryn Feedback" in the world's module list, reload every client.
3. **Self-test as the GM**, with a scene open: `game.pentaryn.feedback.selftest()` returns every
   check ok.
4. **GM files one of each category.** Click the bug icon in the token tools (or type `/bug`).
   Hover Feature, Bug and Defect and read the tooltips; confirm Bug is preselected. File one
   Bug, one Defect, one Feature, each with a short text.
5. **Check the files landed:**
   `ls ~/Library/Application\ Support/FoundryVTT/Data/pentaryn-feedback/<world>/` shows three
   `<id>.json` files.
6. **Player path (second browser, logged in as a player).** Do a few things first (open a sheet,
   roll, move a token), then file one of each category. Confirm each shows a "filed" toast and
   a new file appears.
7. **Offline path.** Log the GM out, have a player file one (toast says queued), log the GM back
   in: the file appears and the player's flag queue is emptied.
8. **Process them with the MCP tools** from Claude Code, one at a time:
   - `feedback_list` shows the six-plus reports, oldest first.
   - `feedback_next` renders the oldest open one: who, scene, text, context, timeline of the
     player's recent actions. Check the timeline matches what the player did in step 6.
   - Fix or decide, then `feedback_resolve` (status `triaged`, `resolved` or `wontfix`, with a
     note); repeat `feedback_next` until it reports none open.
9. **Rate limit and size cap** (optional): file several reports quickly and confirm the
   rate-limit notice appears rather than a flood of files.

If something fails, `game.pentaryn.feedback.selftest()` output plus the browser console is the
first thing to look at; the per-module `afterSync` lines in `module.json` are the same steps.
