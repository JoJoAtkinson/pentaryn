---
title: "Monday updater on BOSS — the whole stack, after the backup"
status: shipped
created: 2026-10-17
last_modified: 2026-10-17
tags: [plan, foundry, automation, updates, boss]
---

# Monday updater on BOSS

**Read this when:** you want to know why the BOSS updater runs on Mondays inside the nightly
and how host dependencies got into it. Never load this to operate it. The use-doc is
[`../foundry/automated-updates.md`](../foundry/automated-updates.md), and the commands are in
[`../../automation/README.md`](../../automation/README.md).

## What Joe asked (2026-10-17)

- Update **once a week, on Monday**. Games are at the end of the week and at weekends, so
  Monday is the day nobody plays. Check and update in the same run; there is no nightly check.
- Run **after the world has been backed up**, so anything that breaks can be restored.
- Check and validate **everything the game runs on**, not just Foundry and its packages:
  Node.js, cloudflared and the rest.

## State before (measured 2026-10-17)

- The updater (`scripts/foundry/update/`) handles Foundry core, the modules and dnd5e: gate,
  backup, scan, LLM review, apply, browser smoke test, rollback, report. It has never run on
  BOSS (`no run has been recorded yet`, no pause file).
- On the Mac it was a Saturday 04:06 launchd job. The jobs are unloaded, a pause file has sat
  there since 10-10, and the last two real runs (09-26, 10-03) crashed partway (the bug is fixed
  since). The Mac never needs the jobs again: `apply.gate()` refuses to run off the primary.
- BOSS blockers:
  1. The gate refuses while any user is connected, and the headless GM is always connected.
  2. The smoke test launches a headed Chrome. At 03:00 under Task Scheduler S4U there is no
     display.
  3. Notifications print to the log off the Mac.
- `claude -p` works from a bare scheduled-job environment on BOSS. It authenticates with Joe's
  OAuth login in `~/.claude/.credentials.json`; Linux has no keychain.

## Host inventory (BOSS, 2026-10-17)

| Component | Where | How it updates | Rolls back by |
|---|---|---|---|
| Node.js 24.21.0 | nvm, `~/.nvm/versions/node/v24.21.0` | `nvm install <v>`, newest **within Foundry's `engines.node`** (`>=24.13.1 <25` for 14.369) | the stable symlink back to the old version, which nvm keeps |
| Foundry service's node | `foundryvtt.service` `ExecStart` hard-codes the versioned path | migrated once to the symlink `~/.local/share/pentaryn/node/bin/node` | the symlink |
| cloudflared 2026.10.0 | apt (cloudflare repo) | `apt-get install --only-upgrade` | `apt-get install cloudflared=<old>` from the apt cache |
| infisical 0.43.141 | apt | same | same |
| gh 2.102.0 | apt | same | same |
| rclone 1.75.2 | standalone `/usr/local/bin/rclone` | `rclone selfupdate --stable` | the old binary, copied aside first |
| chrome-headless-shell | `~/.cache/pentaryn-chrome/` (the headless GM) | `@puppeteer/browsers install chrome-headless-shell@stable` into a new dir | `PENTARYN_HEADLESS_CHROME` back to the old dir |
| Other Ubuntu packages | apt | `apt-get upgrade` (no dist-upgrade, no removals) | none (Ubuntu LTS stable updates) |
| claude CLI 2.1.302 | `~/.local/bin/claude` | updates itself | check only |
| Python deps (uv), headless-gm and fork npm deps | lockfiles | not automatic | report only |
| WSL kernel, Windows | Windows side | not from WSL | report only |

## Decisions

| Decision | Rejected | Why |
|---|---|---|
| Run inside the 03:00 nightly on Mondays, after its stop + backup + upload | a separate 03:30 timer | one job means one lock and no overlap. The updater's own backup then finds "no change since the last snapshot" |
| Stop the headless GM for the update, start it after | teach the gate to subtract the bot | the bot would hold a session through `/setup` and the core restart. Stopped, the users=0 gate means humans only |
| Policy window earliest 03:00 (was 03:30) | | the run now starts right after the nightly's backup (~03:06) |
| Node only within Foundry's declared `engines.node` | latest LTS | Foundry states what it supports. Crossing a major is a core decision |
| Foundry service runs node through a stable symlink | rewrite the unit on each update | an update and a rollback are then one symlink swap, and the unit file never changes again |
| Game-path apt packages roll back individually; other apt updates are applied without rollback | report-only for the OS | Joe: everything it takes to run the game. Ubuntu LTS `-updates` is low risk, and the validation catches breakage |
| Validation checklist on every Monday run, even with no updates | only after updates | it is the weekly proof the whole stack still works |
| Smoke test headless with SwiftShader on Linux without a display | install an X server | the bot already runs Chrome headless on BOSS |
| A run's outcome reaches Joe as a GM-whispered chat message posted by the headless GM | Windows toast | S4U has no desktop to toast on, and Joe reads Foundry anyway |

## Phases

1. **Schedule and BOSS blockers.** The nightly's Monday branch, the bot stop/start, headless
   smoke, window, notification hand-off. Tests: `test_vtt_nightly.py`, smoke unit tests.
2. **`hostdeps.py`.** Inventory, upstream versions, buckets (auto / review / hold), apply with
   per-component rollback. It plugs into `plan.build` (decisions with `type: "host"`), `apply` and
   `report`.
3. **`verify.py`.** The validation checklist: node within engines, world serves, tunnel answers,
   rclone reaches the backup remote, Infisical resolves the admin password, `claude -p` answers,
   the bot is CONNECTED and the broker probe passes. A failure after a host update rolls back that
   component.
4. **Docs.** `automated-updates.md`, `automation/README.md`, `ops.md`.

## Live-test notes

- 2026-10-17, on BOSS:
  - `hostdeps.plan` read every component in about 2 s: node 24.21.0 → 24.22.0, cloudflared
    2026.10.0 → .1, infisical 0.43.141 → 0.44.2 and 4 Ubuntu packages pending; rclone, chrome
    and claude current.
  - `verify.run_all` passed 12/12 in about 5 s, including a real `claude -p`, and
    `https://vtt.atjoseph.com` answered with Access's 302.
  - `vtt-update.sh --dry --force --skip-llm` ran through the wrapper with rc 0, with no
    caffeinate failure.
  - A queued notice was whispered into the pentaryn chat by the bot.
- **Not yet exercised live:** a real apply (the first Monday, 2026-10-19 03:00). Watch
  `make vtt-nightly-log`, `.state/logs/vtt-update-2026-10-19.log`, the report in
  `foundry/logs/auto-updates/`, and the whisper in chat.
