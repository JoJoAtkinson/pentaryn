---
created: 2026-08-21
last-modified: 2026-08-21
tags: ["#automation", "#foundry", "#launchd"]
status: active
---

# Foundry VTT auto-update — Saturdays at 04:06

Keeps Foundry, its 27 modules and the `dnd5e` system on the latest stable, unattended,
backed by the OneDrive snapshots `make vtt-down` already writes. The bet is deliberate:
**everything is backed up before anything is touched, so being on the edge is cheap.**

Runs as a launchd LaunchAgent — survives reboots, needs no terminal open, and lands
after the weekly token reset. **04:06**, because a full run (2.5 GB backup, core
download and install, a browser smoke test per world) takes 20–40 minutes: starting at
four means it is done, or visibly finishing, by the time anyone opens a laptop.

```
GATE → BACKUP → SCAN → [ADJUDICATE] → APPLY → SMOKE → RECOVER? → [REPORT] → NOTIFY → RESTORE
python  python  python    claude      python  python   python     claude    python    python
```

The two bracketed steps are the only ones that need Claude, and **both fail soft**: out
of tokens, every `review` item simply stays held, the safe updates still land, a plain
table report is still written, and the notification still fires.

---

## One-time setup

```bash
make foundry-admin-push        # secret → Infisical + login keychain
make foundry-down              # server configuration needs no world active
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
* `POST /join {action:"shutdown"}`, the only scripted way to deactivate a world
  gracefully rather than quitting the app.

So one admin secret buys a smoke test that stores no *user* credential anywhere. It
lives in Infisical (`FOUNDRY_ADMIN_PASSWORD`) and is mirrored into the macOS login
keychain, because the Infisical CLI's session is an interactive login that expires —
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
| `make vtt-update-dry` | What *would* change, with release notes. Read-only, **safe with the world up and players connected.** |
| `make vtt-update-now` | A full run, now. Ignores the pause switch, the time window and the connected-user gate. |
| `make vtt-update-status` | What the last (or current) run is doing. |
| `make vtt-update-pause` / `-resume` | Skip scheduled runs without uninstalling. |
| `make vtt-update-install` / `-uninstall` | The launchd jobs. |

Reports land in [`foundry/logs/auto-updates/`](../foundry/logs/auto-updates/) — one
markdown write-up and one machine-readable JSON per run — and are committed and pushed.

### It leaves the table down

A finished run **shuts everything down**: world deactivated, Foundry quit, tunnel closed.
Nobody is playing at four in the morning, and leaving a public tunnel up all week is
exposure for nothing. Bring it back with `make vtt-up` when you want to play; the
notification and the log both say so.

The shutdown deliberately skips the parting backup `make vtt-down` takes. The run already
snapshotted before touching anything, and that snapshot is the week's rollback point — a
second one minutes later would fall inside the 5-day coalescing window and **replace** it
with post-update state, destroying the restore point on the very run that made it.

A run that *crashes* is the exception: it hands back whatever it found, because it may
have been started by hand while the table was in use. Set
`lifecycle.shutdown_when_done: false` to make every run behave that way.

### Backups and what they cost

A snapshot is ~2.5 GB, almost all of it premium map art in `Data/modules`, so retention
is built around size rather than a count (`scripts/foundry/cloud.py`):

* **10 rolling snapshots**, in `world-backups/`.
* A snapshot taken **within 5 days** of the newest one *replaces* it. A day of editing
  costs one snapshot, not six — otherwise an afternoon of `vtt-up`/`vtt-down` cycles
  would evict weeks of real history from a ten-deep window. The Saturday run always
  lands outside that window, so it always adds one.
* When Foundry moves to a **new generation** (14 → 15), the last snapshot taken while
  you were still on the old one is copied to `major-release/` and **never pruned**.
  Leaving a generation behind should be a decision you can unmake months later.
  `make foundry-restore` lists these alongside the rolling ones.

Snapshots are named `world-<stamp>-fvtt<version>.tar.gz`, so each one says which Foundry
wrote it — that is what makes the generation rule work without a separate index.

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
| **review** | Any **major** bump · a package never seen by a previous run · anything Foundry's own `previewCompatibility` flags. Claude reads the release notes and decides. |
| **hold** | Core **generation** change (14 → 15) — Foundry's own `willDisableModules` · anything needing a core upgrade we are not doing · anything whose upstream will not resolve. |

`dnd5e` is treated like any other module, by choice: a system update runs an
irreversible world migration, and the rolling OneDrive snapshots are the answer to that.
Every report for a system bump leads with its `make foundry-restore SNAP=…` line.

Collision detection is not hand-rolled. Foundry already implements it —
`previewCompatibility` re-resolves every installed package against the repository *at
the target core release*, `checkPackage` reports per-system compatibility, and each
candidate manifest declares its own `requires`/`conflicts`.

### The adjudicator is sandboxed

Release notes are text written by strangers and fed to a model, so `claude -p` runs with
`--strict-mcp-config --mcp-config '{"mcpServers":{}}'` and an explicit deny list for the
built-in tools. This repo's MCP config includes a Foundry server with `eval-js` and an
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
inside the update cannot report. It distinguishes three states from
`.state/vtt-update.status`, which is written at start and updated every phase:

* **still running** — a core download plus two world smoke tests can legitimately still
  be going. It says so and leaves it alone.
* **died** — it **restores service first** (world, tunnel) and then notifies. A
  notification about a table that is still down is not much use.
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
