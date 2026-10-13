# Changelog — Pentaryn Feedback (`pentaryn-feedback`)

## Unreleased — 2026-10-12 (W3L live-check fix; `module.json` stays 0.1.2, code-only sync)

- **[declared] `inspect` reaches an Actor from a string**, which is all the MCP bridge can send:
  `pentaryn-read {ns:"feedback", path:"inspect", ref:"Actor.<id>"}` answered `expected User, got Actor`,
  and an actor's name `NOT_FOUND: user <name>`. A string ref is still a user first; otherwise an
  Actor/Token uuid, or an actor id or exact name, means that actor's players. The manifest `ref` type
  adds `uuid` and its doc says so (describe() golden updated for those two strings).
- **[declared] One bad queue entry no longer blocks a player's queue for good** (rob-1/EC-1): a
  finite `t` outside the Date range passed `validateReport` and then threw in `normaliseReport`,
  so every later ingest of that user failed. `validateReport` now refuses such a `t`, and ingest
  drops any entry that cannot be normalised with a `refused report` warning and files the rest.
- **[declared] The `ingest` relay checks its sender** (feedback-async-2): kit 1.2.0 forwards core's
  query ctx to relay rows, so a non-GM player asking to file another user's queue now gets
  `fail("REFUSED", "only that user or a GM may ask to file their queue")`. The user themselves, a
  GM, and a call with no ctx (the bridge's socket path, a local call) behave as before. The
  manifest doc says so (describe() golden updated for that string); the README pitfall naming kit
  1.1.0 is rewritten for 1.2.0.

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
