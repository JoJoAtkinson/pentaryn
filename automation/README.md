---
created: 2026-08-21
last_modified: 2026-10-10
tags: ["automation", "foundry", "launchd"]
status: active
---

# Foundry VTT auto-update — Saturdays at 04:06

Keeps Foundry, its 27 modules and the `dnd5e` system on the latest stable, unattended,
backed by the OneDrive snapshots `make vtt-down` already writes. The bet is deliberate:
**everything is backed up before anything is touched, so being on the edge is cheap.**

Runs as a launchd LaunchAgent on the **primary host** (the Mac) — survives reboots, needs
no terminal open, and lands after the weekly token reset. On the alt host (BOSS) it refuses:
`vtt-update.sh` checks `python -m scripts.foundry.host require-primary` first and exits 0
with a log line, and `apply.gate()` aborts too (`PENTARYN_ROLE_OVERRIDE=primary` passes both;
`make vtt-update-install` refuses off macOS). **04:06**, because a full run (~3 GB backup, core
download and install, a browser smoke test per world) takes 20–40 minutes: starting at
four means it is done, or visibly finishing, by the time anyone opens a laptop.

```
GATE → BACKUP → SCAN → [ADJUDICATE] → [ESCALATE] → APPLY → SMOKE → RECOVER? → [REPORT] → NOTIFY → RESTORE
python  python  python    claude        claude      python  python   python     claude    python    python
```

The bracketed steps are the only ones that need Claude, and **all of them fail soft**: out
of tokens, every `review` item simply stays held, anything that touches code we adjusted
is held for the week, the other safe updates still land, a plain table report is still
written, and the notification still fires.

---

## One-time setup

```bash
make foundry-admin-push        # secret → Infisical + login keychain
make foundry-down              # server configuration needs no world active (also takes the shutdown snapshot, uploaded in the background)
make foundry-admin-configure   # tell Foundry to use it, and turn UPnP off
make vtt-update-install        # build the notifier, install both launchd jobs
python -m scripts.foundry.update.cli notify --demo   # approve the permission prompt
```

Then, by hand, because nothing can do these for you:

1. **System Settings → Notifications → Ardenhaven VTT** — set the style to **Alerts**
   (banners disappear after a few seconds), and turn on *Play sound* and
   *Show on Lock Screen*.
2. Nothing else. Focus is deliberately left alone — these are normal notifications and
   are meant to wait for you.

Three classes, all ordinary Notification Center posts that respect Focus:
✅ *done* (silent) · ⚠️ *needs you* (sound) · ❌ *rolled back* (sound). They post through
`Ardenhaven VTT.app` so they carry Foundry's icon and get their own settings row.

### Why there is an admin password now

Foundry's `sessions.authenticateAdmin` returns *success* when no admin password is set —
but never sets `session.admin` in that branch. Most of the setup API only checks the
returned success, so it works fine. Two things check `session.admin` directly, and both
matter here:

* `sessions.loginAsUser`, which lets the smoke-test browser log in as the Gamemaster
  **without that user's password**. It 403s (`USERS.LoginAsGMRequired`) without one —
  verified against this server.
* `POST /setup {action:"worldShutdown"}` (14.369+; `POST /join {action:"shutdown"}`
  before), the only scripted way to deactivate a world gracefully rather than quitting
  the app.

So one admin secret buys a smoke test that stores no *user* credential anywhere. It
lives in Infisical (`FOUNDRY_VTT_GRANDMASTER_PW`, project `project-joe`, env `dev`,
path `/`) and is mirrored into the macOS login keychain by `make foundry-admin-push`,
because the Infisical CLI's session is an interactive login that expires —
it already had, on this machine, while this was being built. A weekly job that stops
working the first time a token lapses is a trap, not automation.

`make foundry-admin-key` puts it on the clipboard for the setup screen without
displaying it.

### What changed about the tunnel

`make tunnel-up` used to run `cloudflared tunnel run --url http://localhost:30000`,
which publishes **every** route Foundry serves — `/setup`, `/auth` and `/update`
included. It now uses [`foundry/cloudflared/config.yml`](../foundry/cloudflared/config.yml),
whose ingress rules 403 those paths at the edge. Administration is reachable only from
the local port; the tunnel carries players.

Two consequences worth knowing:

* The GM's in-game **"Return to Setup" stops working through the tunnel** (it posts to
  `/setup`). Use `make vtt-down` locally. Delete the first ingress rule to get it back.
* `make foundry-admin-configure` also sets **`upnp: false`**. With UPnP on, Foundry asks
  the router to map port 30000 on every start — so "the tunnel is down" would not have
  meant "unreachable", and a direct connection would bypass the ingress rules entirely.

---

## Day to day

| Command | What it does |
|---|---|
| `make vtt-update-dry` | What *would* change, with release notes, and what escalation would look at (no LLM). Read-only, **safe with the world up and players connected.** |
| `make foundry-adjustments-check` | The adjustments registry still matches the code it names. |
| `make vtt-update-now` | A full run, now. Ignores the pause switch, the time window and the connected-user gate. |
| `make vtt-update-status` | What the last (or current) run is doing. |
| `make vtt-update-pause` / `-resume` | Skip scheduled runs without uninstalling. |
| `make vtt-update-install` / `-uninstall` | The launchd jobs. |

Reports land in [`foundry/logs/auto-updates/`](../foundry/logs/auto-updates/) — one
markdown write-up and one machine-readable JSON per run — and are committed and pushed
after the notification has gone out. A git step that hangs gives up (2 min; the push
5 min) and the run log says the report was written but not pushed.

### Escalation: when a run thinks harder

Most Saturdays nothing we wrote leans on what is updating, and the run behaves exactly as
it always has. When an update touches a package in
[`foundry/adjustments.yml`](../foundry/adjustments.yml) — Argon, Item Piles, Dice So Nice,
dnd5e, the core admin API — or one our code greps for, a cheap Haiku call reads the notes
and decides whether an Opus impact analysis is needed. Python sets the minimum (a core
bump always gets one) and the maximum (the policy, the clock, a dollar budget).

What you see:

* **"plan ready: foundry/logs/auto-updates/plans/<run>-<package>.md"** in the notification.
  The analysis held that package and wrote the steps to take it by hand: impact per area,
  the fixes with the check that proves each, a **Still needed?** table for every
  adjustment of ours (Argon first — keep / fix / retire / investigate), how to verify, how
  to roll back. It is committed with the report. A model wrote it from release notes; read
  each step before running it, and don't hand it to an agent as instructions.
* **"HELD · core: escalation: …"** — the reason is the analysis's, or `deferred: out of
  time` / `out of budget` when the window or the budget ran short, or `triage unavailable`
  when the cheap call failed on a package it was the only check for (policy
  `on_triage_failure: hold_exposed`), or `triage flagged a possible prompt injection` —
  read that package's release notes yourself.
* **`LLM cost this run: $0.42 (adjudicator $0.05, T0 $0.00, T1 $0.37)`** at the end of
  every report. A held major (dnd5e 6.x) is analysed once and its plan reused for up to
  four weeks while it stays held on the same major — about one Opus call a month, not one
  per upstream patch. An analysis that fails twice for the same versions is not retried
  until they change.

Turn it off with `escalation.enabled: false`; skip every LLM step for one run with
`--skip-llm`. Engineering detail:
[`context/foundry/automated-updates.md`](../context/foundry/automated-updates.md#escalation-tiered-llm-review-v1-2026-10-10).

### It leaves the table down

A finished run **shuts everything down**: world deactivated, Foundry quit, tunnel closed.
Nobody is playing at four in the morning, and leaving a public tunnel up all week is
exposure for nothing. Bring it back with `make vtt-up` when you want to play; the
notification and the log both say so.

The shutdown deliberately skips the parting backup `make foundry-down` (so `vtt-down`) takes; it
stops Foundry itself, never through make. The run already
snapshotted before touching anything, and that snapshot is the week's rollback point — a
second one minutes later would fall inside the 5-day coalescing window and **replace** it
with post-update state, destroying the restore point on the very run that made it.

A run that *crashes* is the exception: it hands back whatever it found, because it may
have been started by hand while the table was in use. Set
`lifecycle.shutdown_when_done: false` to make every run behave that way.

### Backups and what they cost

A snapshot is ~2.5–3.2 GB, almost all of it premium map art in `Data/modules`, so retention
is built around size rather than a count (`scripts/foundry/cloud.py`), **per host** — the
Mac and BOSS share the folder and each manages only its own snapshots:

* **10 rolling snapshots per host**, in `world-backups/`. Legacy untagged ones are never
  pruned automatically (`make foundry-prune-untagged`).
* A snapshot taken **within 5 days** of this host's newest one *replaces* it. A day of editing
  costs one snapshot, not six — otherwise an afternoon of `vtt-up`/`vtt-down` cycles
  would evict weeks of real history from a ten-deep window. The Saturday run always
  lands outside that window, so it always adds one.
* When Foundry moves to a **new generation** (14 → 15), the last snapshot this host took
  while still on the old one is copied to `major-release/` and **never pruned**.
  Leaving a generation behind should be a decision you can unmake months later.
  `make foundry-restore` lists these alongside the rolling ones.

Snapshots are named `world-<UTC stamp>-fvtt<version>-<host>.tar.gz`, so each one says which
Foundry and which machine wrote it — that is what makes the generation rule and per-host
retention work without a separate index. The run's rollback point is this host's own state
(`recover.newest_world_snapshot()`), never the other machine's newer snapshot.

Policy lives in [`foundry/update-policy.yml`](../foundry/update-policy.yml): the
channel, what may auto-apply, pinned packages, retention, the smoke settings and the
time window. It is the only file you should need to edit.

---

## What decides what

Deterministic rules first, in `risk.py`. They can only ever *hold* something; the LLM
can only move things out of `review`, never out of `hold`.

| Bucket | Rule |
|---|---|
| **auto** | Patch/minor bump of anything — `dnd5e` included — with compatible core and system, no declared conflicts with what is installed, no missing dependency. Core **build** bumps inside generation 14 with a clean compatibility preview. |
| **review** | Any **major** bump · a package never seen by a previous run. Claude reads the release notes and decides. |
| **hold** | Core **generation** change (14 → 15) — compared in `risk.classify_core`, since Foundry disables every module not re-verified for the new generation · a core build bump whose compatibility preview (`previewCompatibility`) flags a blocking package, or whose preview could not be obtained (`risk.classify_core`) · anything needing a core upgrade we are not doing · anything whose upstream will not resolve. |

`dnd5e` is treated like any other module, by choice: a system update runs an
irreversible world migration, and the rolling OneDrive snapshots are the answer to that.
Every report for a system bump leads with its `make foundry-restore SNAP=…` line.

Collision detection is not hand-rolled. Foundry already implements it —
`previewCompatibility` re-resolves every installed package against the repository *at
the target core release*, `checkPackage` reports per-system compatibility, and each
candidate manifest declares its own `requires`/`conflicts`.

### The adjudicator is sandboxed

Release notes are text written by strangers and fed to a model, so `claude -p` runs with
`--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, `--tools ""` and an explicit deny
list for the built-in tools, from an empty temp directory, with `--restricted` so no
settings-file hooks run. The same fences apply to the triage, analysis and report calls —
all of them go through `scripts/foundry/update/llm.py`, which refuses to give a tool to
any call that carries third-party text. This repo's MCP config includes a Foundry server with `eval-js` and an
Infisical server one call from a secret. A prompt-injected release note gets to
influence one enum value and nothing else. Unparseable output, an unexpected id, a
timeout — all mean *hold everything*.

---

## Recovery is by failure class, not a ladder

The intuitive design — reinstall the old module, then try a snapshot, then try
everything — is wrong here, and the reason is worth knowing.

**Launching a world migrates it.** `world.mjs setup()` runs `migrateCore()` when the
core is newer and `migrateSystem()` when the system is, in place, across every document,
*before* the smoke test can say anything. Putting the old code back afterwards does not
undo it; it produces a world whose data is in the new shape and whose `world.json`
claims a version that is no longer installed.

| Failure | What is restored |
|---|---|
| a module | that package only, from Foundry's own per-package backup. World untouched. |
| the system | the world's data **and** the system code, from the OneDrive snapshot plus the set-aside system mirror. |
| the core | the whole app payload **and** the world data. |

Every rung finishes by reading the disk. Foundry's setup API is fire-and-forget —
`createSnapshot`, `restoreSnapshot`, `restoreBackup` and `launchWorld` all return `{}`
immediately and report errors only over socket.io — so "the call did not error" proves
nothing.

---

## The watchdog

A second job at 06:12 Saturday, on its own timer rather than as the last line of the
updater: one of the things it exists to catch is *"the update never ran"*, which a check
inside the update cannot report. It distinguishes four states from
`.state/vtt-update.status`, which is written at start and updated every phase:

* **still running** — a core download plus two world smoke tests can legitimately still
  be going. It says so and leaves it alone.
* **died** — it **restores service first** (world, tunnel) and then notifies. A
  notification about a table that is still down is not much use.
* **failed without a report** — the run recorded `failed` but never got as far as writing
  its report (and so never sent its own notification). It notifies as a failure. A failed
  run that did write its report already told you, so the watchdog stays quiet.
* **killed by the backstop** — `vtt-update.sh` kills a run still going after 130 minutes
  (90 + escalation's 40; SIGTERM, then SIGKILL ten seconds later — on the TERM the run
  ends its own `claude -p` and browser smoke children and releases its lock) and then
  cleans up itself — status marked, service restored, a dead run's lock removed so
  `make vtt-up` works, "update run killed" notification — because that kill can land
  after 06:12. The watchdog says nothing more about it.
* **never fired** — usually the Mac was powered off. launchd catches up a *sleeping*
  Mac, not a powered-off one; nothing can fix that from here, so it just tells you.

## Known limits, stated plainly

* A Mac that is **powered off** at 04:06 gets no run and no catch-up. The watchdog
  reports it at 06:12 if the Mac is on by then; otherwise you find out next week.
* Focus suppresses these like any other notification, by design. If you want a run to
  reach you through a Focus, add *Ardenhaven VTT* to that Focus's allowed apps.
* The browser smoke test drives real Chrome in your GUI session, off-screen. If you are
  at the machine at 04:06 you may see a window flicker.
* Premium packages have no public release notes, so a major bump of one will usually be
  held for you to look at — there is nothing for the adjudicator to read.
