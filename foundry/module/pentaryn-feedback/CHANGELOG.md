# Changelog — Pentaryn Feedback (`pentaryn-feedback`)

## Unreleased — 2026-10-12 (W3L live-check fix; `module.json` stays 0.1.2, code-only sync)

- **[declared] One table of recorder action kinds** (feedback-EXT-6): the kinds the recorder
  pushes were scattered literals, and the Python renderer test's case list had fallen behind (no
  `tool`, `use`, `combat` or `notify`). Core now exports a frozen `ACTION_KINDS`; `core.test` scans
  `recorder.mjs` and core for every `kind: "…"` literal against it, and the Python test reads it
  from `feedback-core.mjs` and fails on a kind `action_line` has no case for. No timeline change.
- **[declared] Windows without an id are throttled per class** (feedback-EC-5 + perf-4): the
  render throttle keyed on `row.id ?? row.cls`, but `clip()` had already turned a null id into
  `""`, so every id-less window shared one empty key and a second id-less window opened inside
  2 s was dropped from the action log. Both the throttle and the close now key on
  `row.id || row.cls`.
- **[declared] "What gets attached" lists every section a report carries** (feedback-EXT-7): the
  fold-out left out the world/system/Foundry versions, the selected and targeted tokens, the combat
  round/turn and the browser details. Rows now come from `ATTACH_ROWS` in `dialog.mjs`, one per
  section (four new `Dialog.Attach.*` keys; `attachSummary` adds the token counts), and a test
  refuses a section in `OBJECT_SECTIONS`/`LIST_SECTIONS` (or the two rings) without a row.
- **[declared] The GM's report list reads files in parallel** (feedback-async-3 + perf-2):
  `readAll` awaited one GET per report file before starting the next, so `list`/`inspect` cost one
  round trip per filed report. It now keeps up to `LIMITS.readsInFlight` (6) GETs in flight and
  stores each result by index, so the order, EC-3's skip rules and their warn lines (in file
  order) are unchanged. No per-tab cache.
- **[declared] The report store logs through the module** (feedback-M10): `fileStore` took a
  `log` option nobody passed, so its `createDirectory` and `browse` debug lines never fired. The
  entry's setup now wires `useStore(fileStore({ log }))` when no store is active yet (a test's
  memory store is kept). The lines stay debug level — console only, with
  `CONFIG.debug["pentaryn-feedback"] = true`.
- **[declared] The API manifest builds its strings from core** (feedback-EXT-1-followup): the
  report-file path, queue flag and the category/status unions in `api-manifest.mjs` were literals;
  they now come from `STORE_DIR`, `FLAG_SCOPE`, `QUEUE_KEY`, `CATEGORY_KEYS` and `STATUSES`, so a
  core rename can no longer leave describe() stale. `golden/describe.json` is byte-identical; a
  source test refuses the literals coming back.
- **[declared] A hot patch mid-filing no longer files a report twice** (feedback-async-4):
  `uninstall()` cleared the per-user ingest chains while one could still be writing, so the
  re-install's `ready` ingest read the same queue entry and uploaded it again (a second toast,
  audit line and bucket token). `uninstall()` now leaves the chains alone (each removes itself when
  it settles), so the new ingest waits for the one in flight; retries, buckets and the reporter's
  gap are still cleared.
- **[declared] Escape closes a dialog opened while the last one was still closing**
  (feedback-async-1): `open()` during the old dialog's close animation built a new dialog, and the
  old close then deleted the new one's `foundry.applications.instances` entry, so Escape no longer
  closed it. `ReportDialog.close()` now keeps its promise and `open()` waits for it before deciding
  whether to reuse or build. The node stub closes synchronously, so the glue test models Foundry's
  async close; still wants one live check (bug button, Escape, bug button mid-fade, Escape).
- **[declared] A null argument gets a fail(), not a TypeError** (feedback-rob-2): `submit(null)`,
  `submit(draft, null)`, `ingest(null)` and `resolve(null)` threw while destructuring despite "never
  throws"; each entry now treats null as `{}`, so the call answers BAD_ARGS / NOT_GM / NOT_FOUND.
- **[declared] `inspect` reaches an Actor from a string**, which is all the MCP bridge can send:
  `pentaryn-read {ns:"feedback", path:"inspect", ref:"Actor.<id>"}` answered `expected User, got Actor`,
  and an actor's name `NOT_FOUND: user <name>`. A string ref is still a user first; otherwise an
  Actor/Token uuid, or an actor id or exact name, means that actor's players. The manifest `ref` type
  adds `uuid` and its doc says so (describe() golden updated for those two strings).
- **[declared] One bad queue entry no longer blocks a player's queue for good** (rob-1/EC-1): a
  finite `t` outside the Date range passed `validateReport` and then threw in `normaliseReport`,
  so every later ingest of that user failed. `validateReport` now refuses such a `t`, and ingest
  drops any entry that cannot be normalised with a `refused report` warning and files the rest.
- **[declared] selftest checks both console wraps** (feedback-EXT-2): it hard-coded
  `feedback-console-error` and never looked at `console.warn`. The recorder now exports
  `CONSOLE_PATCHES` and exposes it as `ctx.exposed.consolePatches`; the check, renamed
  "console wraps match captureConsole", passes only when every wrap's adjustments row is present
  exactly when `captureConsole` is on, and its detail is `{ captureConsole, wraps: { "console.error",
  "console.warn" } }` (each true when wrapped). describe() is unchanged.
- **[declared] Every error message in a report is redacted** (feedback-M2): the recorder's own
  failures and a failed snapshot section or row (`sectionErrors`, a window row's `error`) were only
  clipped, so `token=…`, Bearer tokens and URL query strings survived there; they now go through
  `redact()` like the error ring. The player's report text and document/user names stay clip-only,
  and the README privacy line, the core header and the `redact()` doc now say exactly that.
- **[declared] A failed folder create no longer breaks every later upload in that tab**
  (feedback-rob-3/EC-4): `ensureDir` remembered a folder as made even when `createDirectory`
  failed for a reason other than "already exists", so each later `put()` skipped the mkdir and its
  upload was refused until reload. A folder is now remembered only when the create succeeds or the
  error says `EEXIST` / "already exists"; any other failure is retried on the next `put()`.
- **[declared] One bad report file no longer breaks `list` or `inspect`** (feedback-EC-3, rob-4,
  perf-5): `readAll` promised "unreadable files skipped", but a corrupt file or a GET answering
  403/500 made `list()` reject and set `inspect`'s `reports` to null, and an array-valued file
  listed as a row of nulls. Each file is now read in its own try/catch, only a non-array object
  is kept, and every skipped path logs one `pentaryn-feedback | report file … skipped` warning;
  `count` counts only the readable reports. `inspect`'s remaining null case (the folder listing
  itself failing) also warns now.

## 0.1.2 — 2026-10-11 (live-check fix)

- **[declared] `inspect` accepts an Actor or Token**, as `journal.inspect` does: the root
  `game.pentaryn.inspect("Talo")` passes an Actor, and feedback answered
  `BAD_ARGS: expected User, got Actor`. An Actor means its players — every non-GM user who owns it
  or has it as their assigned character — and returns `{ actor, users, pending, reports, actions,
  errors }`; an Actor with no player gives empty lists, not an error.
- **[declared] `inspect` is async and adds `reports`**: summaries of the reports those users filed
  (oldest first, the last 20), read from the report files, so only on a GM client and for a GM
  viewer (`null` otherwise). A user ref keeps its other fields.

## 0.1.1 — 2026-10-11

- `/bug` in chat opens the dialog again on Foundry 14: the chat input is a ProseMirror editor, so the
  `chatMessage` hook gets `<p>/bug …</p>`. `parseBugCommand` now reads the line's text content
  (`chatText`: `<br>` and paragraph breaks become newlines, tags drop, entities decode), as core's
  ChatLog.parse does. A line that does not start with a tag is still read as plain text.

## 0.1.0 — 2026-10-11

- First version, generated from the Pentaryn addon blueprint (tier `full`, kit + `election`, `patch`).
- Bug button in the token tools (every user), `/bug <text>`, and `open()` / `submit()` in the API.
- Dialog with Bug (default) · Defect · Feature, each with hover help; "What gets attached" list.
- Per-client recorder: action ring (`historySize`, 20..1000) and error ring (50) — scene, tool,
  tab, token control/target, windows, `[data-action]` clicks, own document changes (keys only),
  own chat cards, dnd5e activity use, combat turns, notifications; window errors, rejected
  promises, core's `error` hook, `console.error` / `console.warn` (`captureConsole`).
- Filing: the report waits on the reporter's own User flag, the active GM writes
  `Data/pentaryn-feedback/<world>/<id>.json` (relay `ingest`, or at ready / userConnected /
  updateUser when no GM was online) and clears the flag.
- GM API `list`, `get`, `resolve`; the repo's `scripts/feedback_reports.py` MCP tools
  (`feedback_list`, `feedback_next`, `feedback_get`, `feedback_resolve`) read the same files.
- Not tested live yet (built during a play test): see the `afterSync` lines in `module.json`.
