---
title: Merge and go-live, 2026-10-11
tags: ["plan", "foundry", "record", "deploy"]
---

# Merge and go-live, 2026-10-11

**Read this when:** you need to know what was merged into `main` and deployed live on
2026-10-11 (wave 2, feedback, rclone, background upload), how it was checked, or what is still
open after it. History, not instructions: to operate anything, use the domain docs
([`../foundry/README.md`](../foundry/README.md), [`../foundry/ops.md`](../foundry/ops.md),
[`../foundry/feedback.md`](../foundry/feedback.md), [`../foundry/mcp-fork.md`](../foundry/mcp-fork.md)).

## 1. Merges into `main`

| Merge | What |
|---|---|
| `692e8f60` `migrate/wave-2` | Blueprint wave 2 (lookup, movement, walls, attunement, journal, dropbin; kit 1.0.2; bridge lane). Includes the play-test fixes via `931203a5` (`fix/playtest-2026-10-11`, see [`addon-blueprint-2026-10/wave-1-playtest.md`](addon-blueprint-2026-10/wave-1-playtest.md) "Fixes on fix/playtest-2026-10-11") |
| `24646fdf` `feature/pentaryn-feedback` | The bug-report module and its `feedback_*` MCP tools ([`feedback-module-2026-10.md`](feedback-module-2026-10.md)) |
| `dc3235e0` `feature/rclone-hosts` | Two hosts, one cloud over rclone ([`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md)) |
| `6e2b6628` (direct) | Boot fix: a pending "cannot tell" notice keeps local as the Enter default [declared] |
| `bb74bf6b` (direct) | `foundry-clean`'s verify reads a Cloudflare Access login redirect as Access, not as the file still served |
| `938c36d4` `feature/vtt-down-background-upload` | `make vtt-down` returns once the tar is built; a detached uploader sends it (ops.md §2). pytest 1199 passed / 2 skipped / 3 xfailed after the merge; `make check-context` only the 4 old warnings |

Fork (`foundry-vtt-mcp`, branch `pentaryn`): `59ffcf2` merges `migrate/wave-2` (bridge lane,
`pentaryn-read` / `pentaryn-write`). Version **0.8.3-pentaryn.2**.

## 2. Live deploy (world pentaryn, Mac, local, no tunnel)

- First rclone boot, `FROM=local`. First Mac snapshot over rclone:
  `world-2026-10-11-212143-fvtt14.369-mac.tar.gz`, **3.24 GB**. `make foundry-cloud` reads
  `rclone onedrive:DnD/foundry`, host mac (primary), based on that snapshot.
- 13 module syncs plus the importer, and the new bridge 0.8.3-pentaryn.2 (built 17:21, backend
  restarted 17:23; `Data/modules` copy byte-identical to the build).
- `pentaryn-feedback` enabled. `pentaryn-walls` stays off: migrated, never live-tested.
- Rollback material kept: `.state/live-rollback/wave2/` (old bridge folder), the fork's previous
  build = first parent of `59ffcf2`.

## 3. Bridge parity

Every existing read tool was called and matched eval-js; every write tool ran on throwaway
"ZZ test" documents and was cleaned up. Tool list = previous build (`59c781e`) plus
`pentaryn-read` / `pentaryn-write`. Fork tests: server 275/275, module 43/43. `pentaryn-read`
lists 10 modules (no walls); all rows, refusals (BAD_ARGS / NOT_FOUND / "eval-js only") and dry
runs behaved as designed; real writes logged to `mcp-2026-10.jsonl`. Player tab queries were
refused with NOT_GM. **No regression.**

Non-regression findings (open):
- `toggle-token-condition` without `active` fails ("active must be a boolean") — upstream bug,
  already in the old build.
- Root `inspect` with an Actor ref: feedback's entry returns BAD_ARGS (expects a User).
- `pentaryn-write` log lines have `ids: []` unless the module result has its own `ids`.
- eval-js argument errors: the action-log line has no `phase` and a raw multi-line `error`.
- `importer.import` dry run on the default path → INTERNAL (404; file is deleted after import by
  design; the importer's abort error has no code).

## 4. Modules live

- Console on three GM reloads: no pentaryn-* or bridge errors.
- Live goldens before/after (`.state/live-goldens/wave2/`): all 11 modules pass; every difference
  is declared. Two golden-script faults fixed in `825cc80e` (importer batch order, pings `ageMs`).
- Ownership-leak scan `[]` before and after.
- Play-test checks pass: pings PT3-2, transform PT3-3/4/6/7, prompts PT2-2/PT2-5, combat PT1-6,
  names PT3-9, bug-reporter button and dialog, report → `feedback_*` round trip.
- Two failures, neither a regression, then fixed (§5): dropbin PT3-1 (revived NPC stayed
  player-observable) and `/bug` in chat.

## 5. Fixes after the live check

| Commit | Fix | Re-checked live |
|---|---|---|
| `de9173ce` dropbin 0.2.3 | `fromCorpse` clears the corpse map with a ForcedDeletion (a plain null was a server no-op when the server had dropped the map) | HUD revive 4/4, heal revive 2/2, revert+heal 3/3, re-pile+heal 2/2 clean |
| `ccf8e4cf` feedback 0.1.1 | `/bug` parses Foundry 14's `<p>`-wrapped chat HTML | `/bug ZZ live check` opens the dialog |
| `7d855259` prompts 0.4.5 | A cut token-own biography points at the token, not the base actor | pointer returns the token's text |
| `42dec260` | Module index updated | — |

## 6. What remains

- **BOSS go-live** per [`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md) §15. BOSS's
  rclone `onedrive:` remote already works.
- **Untagged snapshots:** 10 untagged snapshots sit in `world-backups/`; pruning them is Joe's call.
- **Walls:** migrated in wave 2, never live-tested, off. Do not sync or enable it without Joe.
- **Foundry 14.369 server bug** (found during the PT3-1 fix): on a scene created since the server
  last started, a token's first delta change is broadcast but not kept server-side. A kill can be
  lost on reload. Options: report upstream, or restart/warm up new scenes before play.
- **space-journey** was launched briefly by a `make login` without WORLD (no one joined); check it
  before next use if that matters.
- Ping history: golden runs pushed real ping records out of the 50-entry log; the pings golden
  should save and restore the log.
- ties' `game.pentaryn.ties.describe` is the GM description-card toggle, not the kit `describe()`;
  rename at ties' migration.
- Gather pointer for a token's own description is an eval-js expression; a fork tool (or
  `get-character` accepting a token uuid) would be cleaner.
- The open rows in [`addon-blueprint-2026-10/wave-2-report.md`](addon-blueprint-2026-10/wave-2-report.md)
  "Open for Joe" (W2-K1, W2-B1, W2-B2, W2-A1, W2-WALLS-1..3, W2-MOV-1, W2-A2, W2-J1..J3, …).
  W2-B2 (read log lines in `mcp-<YYYY-MM>.jsonl`) is live as planned and awaits confirmation.
- Not checked live: feedback offline queue (needs every GM client gone), tool filter
  `FOUNDRY_MCP_TOOL_FILTER` (needs a backend restart), tool-list poll/schema hash, F3 month change.
