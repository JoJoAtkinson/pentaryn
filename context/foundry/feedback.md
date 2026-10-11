---
title: Pentaryn Feedback — bug, defect and feature reports
status: active
last_modified: 2026-10-11
tags: [foundry, module, pentaryn-feedback, bug-report, mcp]
---

# Pentaryn Feedback

**Read this when:** a player filed a bug / defect / feature report and you are reading, triaging or
resolving it — or you are checking that the bug button works. **Not this file:** the module's code
structure → [`../../foundry/module/pentaryn-feedback/README.md`](../../foundry/module/pentaryn-feedback/README.md) ·
why it is built this way (and the market survey) → [`../plans/feedback-module-2026-10.md`](../plans/feedback-module-2026-10.md).

> **Not yet tested live** (built during a play test). Before relying on it, run the module's
> `afterSync` checks once: `make foundry-feedback-sync`, restart, enable, then the lines it prints.

## At the table

1. The player clicks the **bug** button in the left toolbar (token tools — the top group), or
   types `/bug` (optionally `/bug the door will not open`) in chat.
2. They pick **Bug** (default), **Defect** or **Feature** — hovering each explains it:
   - **Bug** — it is just broken. If unsure, Bug is a good default.
   - **Defect** — it works, just not the way they expect, so it comes across as a bug.
   - **Feature** — 100% new: does not exist yet (a new tab, a new subsystem).
3. They describe it and press **Send report**. Their last few minutes of actions and the game
   state go with it; "What gets attached" in the dialog lists exactly what. A reload (F5) before
   reporting keeps the history in that browser tab; the timeline shows `page reloaded` where it happened.
4. Toast: "Thanks — report abc123 saved." With no GM online: "…will be sent when one connects" —
   it waits on their user and is filed the next time a GM is on.

The button needs a scene open (Foundry disables the toolbar without one); `/bug` always works.

## For the GM

Each report lands on the server's disk as one file:

    ~/Library/Application Support/FoundryVTT/Data/pentaryn-feedback/<world>/<id>.json

The GM's client writes it (players cannot upload), shows a one-line toast ("Caven's player filed a
Bug report (abc123)"), and logs an audit line. Nothing is posted to chat. Foundry need not be
running to read them.

### Working the queue with Claude (the normal path)

Use the `dnd-scripts` MCP tools — never `cat` the files:

| Tool | Use |
|---|---|
| `feedback_next` | the oldest **open** report, in full. Start here. |
| `feedback_resolve(id, status, note)` | `triaged` (seen / reproduced), `resolved` (fixed — say where), `wontfix` (say why). A 6-character id prefix is enough. |
| `feedback_list(status)` | the queue as a table (`open` default, `triaged`, `resolved`, `wontfix`, `all`) |
| `feedback_get(id, raw)` | one report again; `raw: true` for the stored JSON |

The loop: `feedback_next` → read the **Report** text, then the **Timeline** bottom-up (the last
clicks and errors before "report filed" are usually the bug) → find and fix it → `feedback_resolve`
with a note naming the commit or file → `feedback_next` until "No open reports."

How to read a rendered report:

- **Header** — who (role, character), world, scene, when; combat round and controlled tokens with hp.
- **Context** — open windows, browser, module versions (pentaryn first), their last chat rolls,
  and every error with its first stack lines.
- **Timeline** — one line per action, `-mm:ss` before the report, oldest first, errors interleaved:
  `click lootAll "Loot all" in ItemPileInventoryApp`, `doc update Actor Caven [items]`,
  `error hooks @Hooks.#call TypeError: …`.
- **History** — every status change with its note.

Status rules: open → triaged; any → resolved or wontfix; the same status again just adds a note;
back to open needs `force: true`. Repeating the same status and note is a no-op.

CLI fallback (no MCP server): `./.venv/bin/python scripts/feedback_reports.py next`.

## Settings that matter

| Setting | Default | When to change it |
|---|---|---|
| Feedback: actions kept per player (`historySize`) | 200 | Raise (up to 1000) if reports cut off before the cause; applies at once. A report over 256 KB drops its oldest actions (then errors) to fit, and the rendered report says how many (`truncated`). |
| Feedback: attach console errors (`captureConsole`) | on | Turn off only if console noise swamps reports; needs a reload. |

## API quick calls

```js
game.pentaryn.feedback.selftest()                              // with a scene open: every check ok
game.pentaryn.feedback.open({ category: "feature", text: "…" }) // the dialog, pre-filled
await game.pentaryn.feedback.list({ status: "open" })           // GM
await game.pentaryn.feedback.get({ id: "abc123" })              // GM, prefix ok
await game.pentaryn.feedback.resolve({ id: "abc123", status: "triaged", note: "…" })
game.pentaryn.feedback.inspect(game.user)                       // my queue and recent actions
```

## Known gaps

- Not tested live yet; the `afterSync` lines in `module.json` are the first-sync checklist.
- The toolbar button does nothing with no scene viewed (core's `canvas.ready` gate) — use `/bug`.
- Reports are under `Data/`, which Foundry serves by URL while the tunnel is up (ids are random,
  folders are not listed, content is the reporter's own and redacted).
- A player is not told when their report is resolved; tell them.
- No screenshot is attached; no "Report this" button on error toasts yet.
