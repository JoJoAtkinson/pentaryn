# Changelog — Pentaryn Feedback (`pentaryn-feedback`)

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
