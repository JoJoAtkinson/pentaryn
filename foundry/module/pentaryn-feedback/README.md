# Pentaryn Feedback (`pentaryn-feedback`)

**Read this when:** you are changing or calling `pentaryn-feedback`. **Not this file:** filing or working reports → `context/foundry/feedback.md` · why it is shaped this way → `context/plans/feedback-module-2026-10.md` · how every addon is built → `context/foundry/addon-blueprint.md`

A bug button in the left toolbar: players file a bug, defect or feature request with their recent
actions and the live game context attached; the GM's client stores it as a file the repo's MCP
tools read one at a time.

## What the player sees

- A **bug** button (`fa-solid fa-bug`, "Report a bug or idea") in the **token** tools of the left
  toolbar, for every user. It is a button: clicking it does not change the active tool.
- The dialog: one intro line; three categories — **Bug** (selected by default) · **Defect** ·
  **Feature** — each with a hover tooltip, and the selected one's help repeated under the row for
  touch screens:
  - Bug — "It is just broken. If you don't know which to pick, Bug is a good default."
  - Defect — "It works, just not the way you expect, so it comes across as a bug. If you don't know, pick Bug."
  - Feature — "100% new: it does not exist yet, like a new tab or a new subsystem."
- A text box (4000 characters), a "What gets attached" fold-out, **Send report** (disabled while
  empty) and **Cancel**.
- One toast: "Thanks — report <id> saved." or, with no GM online, "…will be sent when one connects."
- `/bug <text>` in chat opens the dialog pre-filled and posts nothing.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `historySize` | world | `200` | Actions each client keeps for its next report, clamped 20..1000. Read on every push: no reload. |
| `captureConsole` | world | `true` | Also record `console.error` / `console.warn` lines. The wrap installs at `setup`: **reload** after a change. |

## API — game.pentaryn.feedback

Canonical: `game.modules.get("pentaryn-feedback").api`; `game.pentaryn.feedback` is the same object.
Ask it: `game.pentaryn.feedback.describe()` (offline: `test/golden/describe.json`).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `inspect(ref, { as })` | — | — | async. A user ref → `{ user, pending, reports, actions, errors }`; an Actor or Token (what the root `game.pentaryn.inspect` passes) → `{ actor, users, pending, reports, actions, errors }` for its players (non-GM owners and whoever has it as their character; none → empty lists, not an error). `pending` (queued ids) for a GM or that user only; `reports` (summaries, oldest first, last 20) on a GM client only; the rings only for the calling user |
| `selftest()` | — | — | `{ ok, checks }` — published, bug button present, recorder installed, console wrap matches the setting |
| `open({ category, text })` | — | — | opens the dialog pre-filled |
| `submit({ category, text }, { dryRun })` | — | own User flag | `{ ok, id, status: "filed" \| "queued" }` / `fail` |
| `ingest({ userId, ids })` | active GM | report files, the user's flag | `{ ok, filed, refused, done }` — the relay query; a non-GM sender asking for someone else's queue gets `fail("REFUSED", …)` |
| `list({ status, limit })` | yes | — | `{ reports: [{ id, t, category, status, user, world, text60 }], count }`, oldest first |
| `get({ id })` | yes | — | the report; `id` may be a unique prefix; throws `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS` |
| `resolve({ id, status, note, force, dryRun })` | yes | the report file | `{ ok, id, status, history }` / `fail("REFUSED", …)` |

Queries: `pentaryn-feedback.ingest` (relay: that user or a GM may send it, the active GM runs it) and `inspect`,
`list`, `get`, `resolve` (GM sender). Status rules (`nextStatus` in core): open → triaged; any →
resolved / wontfix; the same status adds a note; back to open, or resolved → triaged, needs `force`.

## Data written

| Where | What | Who writes |
|---|---|---|
| `Data/pentaryn-feedback/<worldId>/<id>.json` | one report, schema v1 (`buildReport` / `normaliseReport` in core) | the active GM's client, `FilePicker.upload` |
| `flags.pentaryn-feedback.queue.<id>` on a **User** | a report waiting to be filed | the reporter on their own User; the active GM deletes the key once the file exists |

A report holds: id, time, category, text, status + history, the reporter (from the User document
whose queue held it — never from the payload), world, scene (viewed/active), controlled and
targeted tokens with hp, combat round/turn, open windows, active module versions, client (UA,
viewport, language, time zone), the reporter's own last 10 chat cards (flavor and roll total;
whisper as a yes/no), the error ring and the action ring. Never: other users' chat, whisper or
chat content, setting values, form input values, journal text. Every string is clipped and passed
through `redact()` (secret-looking `key=value`, Bearer tokens, URL query strings).

Nothing in world settings (blueprint §5.3).

## Flags other modules read

n/a — no other module reads `flags.pentaryn-feedback.*`.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-feedback.queued` | `(report)` | on the reporter's client, after the report is on their flag |
| `pentaryn-feedback.filed` | `(report)` | on the filing GM client, after the file is written |
| `pentaryn-feedback.ready` | `(api)` | the API is published |

Listens to (pinned in `test/golden/hooks.json`): `canvasReady`, `renderSceneControls`,
`changeSidebarTab`, `controlToken`, `targetToken`, `renderApplicationV2` / `closeApplicationV2` /
`renderApplication` / `closeApplication`, `create|update|delete` × Actor, Item, Token, Combat,
Combatant, ActiveEffect, Scene, JournalEntry (own changes only), `createChatMessage`,
`dnd5e.postUseActivity`, `updateCombat`, `error`, `getSceneControlButtons`, `chatMessage`,
`userConnected`, `updateUser`, `ready`. Plus `window` `error` / `unhandledrejection` and one
capture-phase `click` listener on `document.body`.

## Patches and adjustments

| Row (`foundry/adjustments.yml`) | Patch |
|---|---|
| `feedback-console-error` | `wrapMethod` on `console.error` (marker `__pentarynFeedback_error`), only when `captureConsole` |
| `feedback-console-warn` | `wrapMethod` on `console.warn` (marker `__pentarynFeedback_warn`), only when `captureConsole` |
| `feedback-notifications-notify` | `wrapMethod` on `foundry.applications.ui.Notifications.prototype.notify` (marker `__pentarynFeedbackNotify`) |

Every wrap records, then calls the original with the same arguments and returns its value. The
wraps stay in place after `uninstall()` and record nothing until the next install.

## Two sessions / who writes

- **Recording** is per client, in memory plus a copy in that tab's `sessionStorage` (keyed by world +
  user, written at most once a second and on `pagehide`), so a reload keeps the history and the
  timeline shows a `reload` entry. Window errors are caught from file load, before `setup`. Nothing
  is shared until a report is built; `uninstall()` clears the stored copy.
- **Filing** is one path, online or not: the reporter writes the report to its **own** User flag
  (the server lets only that user, or a GM, write it — so the queue's owner *is* the reporter),
  then `queryGM("pentaryn-feedback.ingest", { userId, ids }, { timeout: 10000 })`.
- The **active GM** files a user's queue on that query, on `updateUser` (a new queue key), on
  `userConnected`, and at `ready` (every user). Per tab, one ingest per user at a time.
- A queue entry that fails `validateReport` (including a `t` no Date can hold) or cannot be
  normalised is **dropped** with a `refused report` warning, and the rest of the queue is filed; a
  failed upload instead stays queued for the next ingest.
- **Two GM tabs** (bridge + browser) both file: each looks for the file first and uploads only if it
  is missing; both write the same bytes (no per-tab `receivedAt`: it is `null`, the file's mtime is
  the filing time) under `game.world.id` (never the payload's world), so the second write is harmless
  and a resend never resets a status Joe already set. Both delete the same flag keys, and a tab that
  finds the entry already gone answers `done`.
- **Rate limits**: a client queues at most one report per user per 5 s (`REFUSED`, with a toast);
  the GM tab files at most 5 per user at once, then one per 5 s (core `admit`). Reports over that
  stay on the queue and a timer files them when the bucket refills.
- **Status edits** happen on both sides: the Python `feedback_resolve` (under `flock`) and the GM
  `resolve()`. They are not coordinated with each other — the last writer in the same second wins.

## Extending

1. A pure rule → `feedback-core.mjs` with a row in `test/core.test.mjs`.
2. A new recorded kind → a `reg.on` in `recorder.mjs` (sync, one push, no await), a case in
   `test/glue.test.mjs`, a line format in `scripts/feedback_reports.py` `action_line`.
3. A report field → `buildReport` + `normaliseReport` + `REPORT_KEYS` in core, the Python renderer,
   and bump `SCHEMA_VERSION` on both sides if a reader would misread an old file. A new list
   section also goes in `LIST_KEYS` (validateReport's shape check).
4. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the diff.

## Pitfalls

- **The button is dead with no scene viewed**: core's SceneControls returns early when
  `!canvas.ready`. `/bug` and `game.pentaryn.feedback.open()` still work.
- **Anything under `Data/` is served by URL** while the tunnel is up. Ids are 16 random
  characters, Foundry does not list folders, and a report holds only the reporter's own activity
  (redacted). Acceptable at this table; never put a secret in a report field.
- A queued report rides on the User document every client receives: the queue is capped at 5
  (oldest dropped, the player is told) and each report at 256 KB.
- The kit's `registerQueries` (1.2.0) passes core's ctx to a relay row's implementation, so
  `ingest` refuses a non-GM sender asking for another user's queue. A call with no ctx (the
  bridge's socket path, or a local call) is not checked, and the filed identity still comes from
  the queue's User document, never from the query.
- `lib/` and `test/kit/` are vendored: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: a change needs a restart.

## Files

| File | Role |
|---|---|
| `feedback.mjs` | entry: wiring, features in load order |
| `feedback-core.mjs` | pure: categories, LIMITS, clip/redact, rings, report schema, queue trim, status rules |
| `settings.mjs` | `historySize`, `captureConsole` |
| `api-manifest.mjs` / `api.mjs` | API rows / implementations, `inspect`, `selftest`, GM list/get/resolve |
| `recorder.mjs` | feature: the action and error rings, the three wraps, the click listener |
| `reporter.mjs` | feature: bug button, `/bug`, submit, the queue, the GM's filing |
| `dialog.mjs` | widget: the ApplicationV2 dialog (`buildHTML` is a plain string function) |
| `snapshot-adapter.mjs` | adapter: live game → context JSON, each section isolated |
| `files-adapter.mjs` | adapter: the report files (FilePicker upload, static fetch, browse) |
| `lib/` | vendored kit (`lib/kit.lock.json`: tier full + election, patch) |
| `test/` | node:test suites, goldens, fixtures, vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python -m pytest -q scripts/tests/test_feedback_reports.py
make foundry-feedback-check
```

Not covered in node (live only, the `afterSync` lines): the real ApplicationV2 render and tooltip
hover, `FilePicker.upload` / `createDirectory` and the static fetch of `Data/`, the `canvas.ready`
gate on the button, socket timing of the relay across two GM tabs.

## Sync

`make foundry-feedback-sync`. First install: restart Foundry, enable 'Pentaryn Feedback', reload,
then `game.pentaryn.feedback.selftest()` with a scene open. After that `.mjs`, `.css` and `lang/`
changes need a reload only.
