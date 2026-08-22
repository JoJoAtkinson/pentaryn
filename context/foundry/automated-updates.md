---
title: "Foundry automated updates — context"
last_modified: 2026-08-21
status: active
tags: [context, foundry, automation, launchd, updates]
---

# Foundry automated updates — context

**Read this when:** extending, debugging or reasoning about the Saturday auto-updater — before touching any of it.
**Not this file:** just running it (commands, setup, retention) → [`../../automation/README.md`](../../automation/README.md)

**Everything a fresh session needs to extend, debug or reason about the Saturday-04:06
auto-updater.** Built 2026-08-21. Operator-facing docs are
[`automation/README.md`](../../automation/README.md); this file is the engineering context —
the decisions, the traps, and the facts about Foundry's internals that the design rests on.

Read this first, then open only the module you are changing.

---

## What it is

A launchd LaunchAgent that keeps Foundry, its 27 modules and the `dnd5e` system on the
latest stable, unattended, with a backup before anything is touched and a rollback that
matches what actually broke.

```
GATE → BACKUP → SCAN → [ADJUDICATE] → APPLY → SMOKE → RECOVER? → [REPORT] → NOTIFY → RESTORE
python  python  python    claude      python  python   python     claude    python    python
```

**The two bracketed steps are the only LLM steps and both fail closed.** No tokens ⇒
`review` items stay held, safe updates still land, a plain-table report is still written,
the notification still fires. That split was a hard requirement, not a nicety.

Jobs: `com.pentaryn.vtt-update` (Sat 04:06) · `com.pentaryn.vtt-update-watchdog` (Sat 06:12).
Both installed and loaded. `launchctl list | grep pentaryn.vtt`.

---

## Files

| Path | What lives there |
|---|---|
| `scripts/foundry/update/admin.py` | Foundry's local admin HTTP API + app process lifecycle. **Start here** — the API's quirks are documented in its module docstring. |
| `scripts/foundry/update/inventory.py` | On-disk scan of `Data/{modules,systems}`; classifies tracked / protected / local / forked. |
| `scripts/foundry/update/upstream.py` | Version resolution + release notes (manifest, GitHub, GitLab, r2, Forge). Semver-ish comparison lives here. |
| `scripts/foundry/update/risk.py` | The deterministic `auto`/`review`/`hold` table, policy loading, the "seen" state. |
| `scripts/foundry/update/plan.py` | Assembles `plan.json`. Standalone vs Foundry-assisted modes. |
| `scripts/foundry/update/forks.py` | `gh`-driven fork drift. Report only, never merges. |
| `scripts/foundry/update/adjudicate.py` | Sandboxed `claude -p` that grades `review` items. |
| `scripts/foundry/update/apply.py` | Orchestration: gate, backup, apply, phase/status, restore service. |
| `scripts/foundry/update/smoke.py` | Server checks + the puppeteer browser check, per world. |
| `scripts/foundry/update/recover.py` | The failure-class recovery matrix + backup artefacts. |
| `scripts/foundry/update/report.py` | Scrubbing, LLM prose, plain fallback, git commit/push. |
| `scripts/foundry/update/state.py` | mkdir lock, run status file, entry state. |
| `scripts/foundry/update/notify.py` | The three notification classes. |
| `scripts/foundry/update/cli.py` | `scan` `run` `status` `notify` `admin-configure` `recover-service`. |
| `scripts/foundry/admin_password.py` | The admin secret: env → Infisical → macOS keychain. |
| `scripts/foundry/cloud.py` | **Pre-existing**, modified. OneDrive backup/restore, retention. |
| `automation/bin/*.sh` | launchd entrypoints + `foundry-admin-push.sh`. |
| `automation/launchd/*.plist` | The two jobs. |
| `automation/notifier/` | `Ardenhaven VTT.app` source + build script. |
| `automation/smoke/smoke.mjs` | The puppeteer-core browser smoke test. |
| `foundry/update-policy.yml` | **The only file you should normally edit.** |
| `foundry/cloudflared/config.yml` | Tunnel ingress; blocks the admin surface. |
| `foundry/logs/auto-updates/` | Per-run `.md` + `.json`, committed and pushed. |

Runtime state (all gitignored) lives in `.state/`: `vtt-update.lock/` (a **directory** —
macOS has no `flock`), `vtt-update.status`, `vtt-update.entry`, `vtt-update.seen.json`,
`vtt-update-cache/`, `core-rollback/`, `system-aside/`, `logs/`.

---

## Foundry internals this depends on

Source is readable at
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/dist/` (minified-ish
ES modules, but greppable). **Re-verify against that source before changing behaviour** —
most of what follows is undocumented and was established by reading it.

### The admin API

| Call | Notes |
|---|---|
| `GET /api/status` | Unauthenticated. `users` = live connections (15 s heartbeat), and is **absent entirely** when no world is active — absent ≠ zero. |
| `POST /setup {action:"checkPackage"}` | Foundry's own update check. Resolves the package's **declared** manifest URL. |
| `POST /setup {action:"installPackage"}` | Refuses incompatible installs, downgrades, missing deps. Handles premium via the licence. |
| `POST /setup {createBackup / restoreBackup / listBackups / createSnapshot / restoreSnapshot / deleteSnapshot}` | Per-package and whole-install backups. |
| `POST /setup {action:"launchWorld"}` | **Destructive** — see migration below. |
| `POST /setup {action:"adminConfigure"}` | Server config. |
| `POST /update {action:"updateCheck"}` | Licence-authenticated core check. |
| `POST /update {action:"previewCompatibility"}` | The collision check, done by Foundry. |
| `POST /update {action:"updateDownload"}` | Downloads, installs, restarts. |
| `POST /join {action:"loginAs"}` | Log in as any user with no user password — **needs `session.admin`**. |
| `POST /join {action:"shutdown"}` | Graceful world deactivate — **needs an admin password**. |

### Seven traps, each of which cost real debugging time

1. **Every `/setup` and `/update` package action is gated on `!game.world`** — 403 while a
   world is active (`setup.mjs`: `c = !game.world && adminOk`). The run has to park the
   server at the setup screen first.

2. **`POST /setup {shutdown:true}` does not work from a script.** It calls
   `world.deactivate(req, {asAdmin: c})` with that same always-false `c`, and `world.mjs`
   bails to `{redirect:"/join"}` because a scripted session has no `req.user`. Use
   `POST /join {action:"shutdown"}` (needs the admin password) or just quit the app.

3. **`authenticateAdmin` returns success without setting `session.admin`** when no admin
   password is configured:
   ```js
   if (session.admin || !pw) return {success: true, session};   // admin stays false
   ```
   Most of the setup API only checks the returned success, so it *appears* to work. But
   `loginAsUser` and `/join {shutdown}` check `session.admin` directly. **This is the whole
   reason `FOUNDRY_ADMIN_PASSWORD` exists.**

4. **Launching a world migrates it, in place, irreversibly.** `world.mjs setup()` runs
   `migrateCore()` when the core is newer and `migrateSystem()` when the system is —
   across every document and world pack, stamping the new version into `world.json` —
   *before* the smoke test can pass or fail. This is why recovery is failure-class-based
   and why a system/core rollback must restore **data**, not just code. dnd5e's heavy
   migration is additionally **client-side**, fired when a GM browser connects; the
   browser smoke test exists partly to pull that inside the backed-up window.

5. **Most write actions are fire-and-forget.** `createSnapshot`, `restoreSnapshot`,
   `restoreBackup`, `launchWorld` and `installPackage` return `{}` immediately and report
   errors only over socket.io. `installPackage` resolves on *fetch*, and an install-step
   failure resolves `{}` and appears only in `packageWarnings`. **Never treat a 200 as
   done — poll the disk.** Helpers: `wait_for_package_version`, `wait_for_world`,
   `wait_for_snapshot`, `_await_backups`.

6. **`packageWarnings` must be read before any world is launched** — `setup.mjs`'s socket
   handler returns `{}` once `game.world` is set.

7. **The admin password lives in `Config/admin.txt`, not `options.json`.** And
   `updateServerConfiguration` only calls `options.save()` when some *other* field also
   changed — so setting the password alone looks like it did nothing to options.json.
   Changing an existing password requires proving the old one first via
   `POST /setup {action:"adminPassword"}`.

### Other measured facts

* `Logs/error.log` **does not exist** — logs are `error.YYYY-MM-DD.log`, created only when
  an error occurs.
* `updateCheck` returns the target `ReleaseData`, **not** `hasUpdate`/`willDisableModules`
  (those live on `updater.availability`, socket-only). Compare generations yourself.
* **`previewCompatibility` vends `availability` as an INTEGER**, not a code name
  (`common/constants.mjs` → `PACKAGE_AVAILABILITY_CODES`, 0–11; the map is mirrored in
  `risk.AVAILABILITY`). Matching only on strings — as the first version of `risk.py` did —
  makes every preview come back clean and lets a core update through unchecked.
  `UNVERIFIED_GENERATION` (4) must **not** block: `wall-height` declares 13–13 and has
  been running on core 14 all along. A preview that could not be obtained is treated as
  a hold, never as clean.
* `core/update.mjs install()` rm-rf's `dist/public/templates` then copies the **entire**
  archive over the app dir — so a core rollback tar must cover all of `Resources/app`
  (~287 MB), not those three directories.
* `restart()` respawns with `env: {restart: 1}` — the environment is *replaced*. Never
  rely on env vars surviving a core update.
* The app bundle is user-owned, writable, notarized, and has already been updated in place
  at least once with Gatekeeper still accepting it.

---

## Design decisions and why

| Decision | Why |
|---|---|
| Deterministic rules can only **hold**; the LLM can only move things out of `review` | The LLM must never be able to widen what gets applied. |
| A package **never seen before** goes to `review` | A module installed on Thursday shouldn't auto-update Saturday before anyone has looked once. Held packages are **excluded** from the seen file so they keep getting reviewed. |
| Dry runs never write `vtt-update.seen.json` | Otherwise a dry run silently disarms the guard above. |
| `dnd5e` treated like any other module | Joe's call: the rolling snapshots are the safety net for its irreversible migration. |
| Core **generation** change always holds | Foundry's own `willDisableModules`. That is a hands-on migration. |
| Adjudicator and report run with **no tools and no MCP** | Release notes are attacker-controlled text and this repo's MCP config has `eval-js` and Infisical one call away. `--strict-mcp-config --mcp-config '{"mcpServers":{}}' --disallowed-tools …`. |
| Per-package `createBackup`, not a full snapshot | A full snapshot copies 2.7 GB of unchanged premium art weekly. Per-package is 3 s and is exactly what `recover_module` restores from. `retention.full_snapshot: true` re-enables the full one. |
| Both worlds smoked, sequentially | `ardenhaven` and `space-journey` migrate independently, each on its own launch. Smoking one leaves the other to migrate unobserved. |
| Chrome runs **headful, off-screen** | Foundry's canvas is WebGL; headless SwiftShader is a different renderer than the players use. A LaunchAgent runs in the GUI session, so a real window is available. |
| Notifications respect Focus | Joe explicitly did not want them to pierce it. `notify(modal=True)` still exists and raises a Focus-proof alert window; no class uses it. |
| Report is committed with an explicit pathspec, never `-A`, never a checkout | The worktree is routinely dirty with campaign work. |
| A finished run shuts the server and tunnel down (`lifecycle.shutdown_when_done`) | Nobody plays at 04:00; leaving a public tunnel up all week is exposure for nothing. It skips the parting backup `vtt-down` takes — a second snapshot minutes after the run's own would land inside the 5-day coalescing window and REPLACE the week's only pre-update restore point. A *crashed* run still restores what it found instead, since it may have been started by hand mid-session. |
| The updater shells out to `scripts.foundry.cloud backup`, the same call `make vtt-down` makes | One implementation of the retention rules. A creative session and the Saturday run produce snapshots under identical coalescing, rolling and promotion behaviour; only the `--reason` log label differs. A non-zero exit is a hard failure — otherwise the run would find an *older* snapshot and believe it had a fresh restore point. |

### Backup retention (reworked 2026-08-21 at Joe's request)

A snapshot is **~2.5 GB** — `Data/modules` is 2.7 GB of premium map art, not the "2.5 MB"
`cloud.py` used to claim. So:

* **10** rolling snapshots (was 100 — a 250 GB ceiling).
* A snapshot taken **within `COALESCE_WINDOW_DAYS` (5)** of the newest **replaces** it, so a
  dev session costs one snapshot rather than six. The new tar is written **before** the old
  one is deleted — never leave a window with no restore point.
* On a Foundry **generation** change, the last snapshot taken while on the old generation is
  copied to `major-release/` and never pruned. Detected at backup time by comparing the
  installed generation against the newest snapshot's, so it also catches an upgrade done by
  hand through Foundry's setup screen.
* Snapshots are named `world-<stamp>-fvtt<version>.tar.gz`; the version suffix is what makes
  the generation rule work without a separate index. Older un-suffixed snapshots parse as
  "unknown version" and are treated as *cannot tell*, never as a generation change.
* `KEEP_SYSTEM_MIRRORS = 3`: `mirror_systems()` used to delete every older system tar before
  writing the new one, which destroyed the only copy of the version a system rollback needs,
  at exactly the moment it was needed.

---

## Security posture

* **Admin surface is localhost-only by construction.** `foundry/cloudflared/config.yml`
  403s `/setup`, `/auth`, `/update`, `/license` at the tunnel edge (verified live). The
  Makefile's `tunnel-up` now passes `--config`; the old `--url` form published everything.
  Known consequence: the GM's in-game **"Return to Setup" no longer works through the
  tunnel** (it posts to `/setup`).
* **`upnp: false`** — with it on, Foundry asks the router to map port 30000 on every start,
  so "the tunnel is down" would not mean "unreachable" and a direct connection would bypass
  the ingress rules entirely.
* **No user password is stored anywhere.** The smoke test authenticates as server admin over
  127.0.0.1 and uses `loginAs`. The session cookie reaches Node in a 0600 temp file, never
  argv.
* `FOUNDRY_ADMIN_PASSWORD`: env → Infisical → **macOS login keychain**. The keychain tier
  exists because the Infisical CLI's session is an interactive login that expires — it was
  already expired on this machine — and because it **hangs on an interactive prompt** when
  it does, so the subprocess uses `stdin=DEVNULL` and a 30 s timeout. A weekly job that
  stops working when a token lapses is a trap.
* The committed run record is scrubbed of protected packages' signed `download` URLs and of
  IPv4/IPv6 addresses from error logs and browser console text. The IPv6 pattern
  deliberately matches only `::`-compressed and full 8-group forms so it does not eat
  timestamps like `17:21:33`.
* `make vtt-up` / `vtt-down` refuse while `.state/vtt-update.lock` is held.

---

## Verified end to end (2026-08-21)

Gates (users connected, time window) · scan → adjudicate → bucketing · a **real install of
`multi-token-edit` 3.2.5 → 3.3.1** · a **real core update, 14.365 → 14.367** · the **core
rollback**, unplanned but complete (app payload + world data restored, `/api/status`
verified back at 14.365) · per-package backup (3.1 s) · multi-world browser smoke on both
worlds · tunnel ingress 403s · lock and `make` guard · watchdog clean-finish path ·
`recover-service` · report scrubbing, fallback, commit **and push** · retention coalescing
and generation promotion (synthetic) · 284 existing tests still pass.

**Still not exercised:** a real *system* (dnd5e) update and its rollback; the watchdog's
dead-run branch; `recover_module`'s `restoreBackup` path.

### Four bugs the live runs found, all fixed

Every one of these was invisible to unit tests and would have silently broken production:

1. **`updateCheck` has no `version` field.** It serialises as `{generation, build,
   channel, suffix, node_version, time, flags, notes}` — `ReleaseData.version` is a
   getter, and getters do not survive `res.json()`. Keying on `version` made every check
   report "no core update available", forever, while the licence server was offering
   14.367. See `plan._normalise_release`.
2. **`previewCompatibility` returns integer availability codes**, not names — so a
   string-only match found no blockers and every preview looked clean. See
   `risk.AVAILABILITY`.
3. **A core update restarts the server, killing the session.** Sessions are in-memory, so
   every admin call afterwards 403s. The first live attempt updated to 14.367
   successfully, then could not launch a world, and rolled the whole thing back. Fixed by
   a transparent single re-auth on 403 in `admin._post`, plus an explicit
   `reauthenticate()` after `apply_core`.
4. **Only one world can be active at a time**, and `launchWorld` is a /setup action that
   403s while one is — so every world after the first failed to launch. `smoke._return_to_setup`
   deactivates first, and waits `SETTLE_SECONDS` because the world's LevelDB closes
   *after* `/api/status` reports inactive (otherwise the next launch logs
   `LEVEL_DATABASE_NOT_OPEN` and the error-log check blames the update).

Also fixed: the entrypoint log recorded only `outcome: recovered` — never *what* was
rolled back, from which snapshot, or whether the rollback itself worked. It raised
exactly the question it could not answer, and you had to open the JSON run record to
find out a core update had been reverted. `cli.cmd_run` now logs applied and failed
packages and every verified recovery step.

Also fixed: `restore_service` built an **unauthenticated** client, so it could not relaunch
the world once an admin password existed — a run genuinely left the table down before this
was caught. Anything that acts now goes through `apply._admin_client()`.

### Smoke baselines — why a broken world does not veto updates

`.state/vtt-smoke-baseline.json` records each world's client-error fingerprint (digits
masked, since line and column offsets move between builds). A world fails only on **new**
faults. First sighting records rather than accuses; a clean run refreshes the baseline so
a fault that has since been fixed stops being tolerated; `game.ready` never becoming true
fails regardless of any baseline.

This exists because `ardenhaven` was throwing on every single load, and without it that
one world would have rolled back every good update forever.

**Both worlds are clean as of 2026-08-21 and both baselines are empty** — see the walls
fix below. Do not read a non-empty baseline as normal; it means something is broken and
merely tolerated.

### The `ardenhaven` breakage (found by the smoke test, fixed)

The smoke test earned its place on day one. `ardenhaven` threw
`Cannot add property walls, object is not extensible` on every load — and the cause was
ours, not Foundry's:

`pentaryn-importer` creates `game.pentaryn` and **freezes** it in its ready hook. Module
ready-hooks fire in alphabetical order of module id, so `pentaryn-walls` always runs
after it, and a bare `game.pentaryn.walls = {...}` throws in strict mode — **taking the
rest of the hook down with it**, so the module had no API and no log line at all in any
world where both were enabled.

`dropbin`, `pings` and `ties` all already carried the rebuild-the-object guard; `walls`
was the only one of the five missing it. Fixed in commit `e422878` with the same pattern.

**The root cause is still there:** the importer replacing and freezing a *shared*
namespace is what forced four separate modules to work around it. Making it merge
instead of replace would end that class of bug — deliberately not done, to keep the fix
minimal, but it is the right next move if a fifth module ever trips on it.

---

## State at the end of the build session (2026-08-21, ~19:20)

Written down because the next session starts cold, and several of these are things you
would otherwise have to go and rediscover.

| | |
|---|---|
| Foundry core | **14.367** (updated by the updater itself, from 14.365) |
| dnd5e | 5.3.3 |
| Worlds | `space-journey` and `ardenhaven`, both migrated to 14.367, both smoke-clean |
| Server | **left down** — that is the new intended end state; `make vtt-up` to play |
| Tunnel | down, with the ingress rules in place (`/setup` etc. 403 publicly) |
| Git | everything merged and pushed to **`main`**; the working branch `foundry-vtt-pipeline` points at the same commit. HEAD is on `main`, so future auto-update reports commit there |
| Schedule | `com.pentaryn.vtt-update` Sat **04:06**, watchdog Sat **06:12**, both loaded |
| Rollback point | `.state/core-rollback/app-14.365.tar.gz` (127 MB) if 14.367 misbehaves |
| Snapshots | 8 of 10 kept; tonight's five backup cycles coalesced into one |
| Infisical | session **expired** — the admin password is being read from the macOS keychain fallback. `infisical login` then `make foundry-admin-push` to resync |

**Expect the first scheduled run to be quiet.** Nothing is pending except
`mad-endlesswiz2`, which is held. It should produce a ⚠️ notification, a committed
report, and a server left shut down.

---

## If you are changing something

* **Adding a check to the risk table** → `risk.py`. It must be able to *hold* only.
* **A package resolves wrongly** → `upstream.py`. Watch for **pinned manifest URLs**
  (`multi-token-edit`, `scene-packer` point at `/releases/download/<tag>/module.json` and
  report the installed version forever); the GitHub fallback handles it, and
  `plan._apply_foundry_check` must **never** let Foundry's answer walk a target *back* —
  that bug made an install a silent no-op reported as success.
* **Changing recovery** → `recover.py`, and re-read trap 4 first. Anything touching the
  system or core must restore world data too.
* **New API call** → `admin.py`, and assume it is fire-and-forget until proven otherwise.
* **Testing** → `make vtt-update-dry` is read-only and safe with the world up. Anything
  Foundry-assisted needs the world **down**. `--force` bypasses pause/window/user gates.
* **Launching a test run from a shell** → detach it, e.g. Python
  `subprocess.Popen([...], start_new_session=True)`. A backgrounded `nohup ... &` stays in
  the calling shell's process group, so when the shell (or an agent's command timeout)
  dies, it takes the run with it — a run was lost to exactly that, mid-smoke, and looked
  like a hang. This is the same hazard the plists' **`AbandonProcessGroup`** covers under
  launchd: without it, launchd would reap the `cloudflared` the run had just restarted,
  silently killing the tunnel at the end of every successful run.
* **Costs tokens**: `run` without `--skip-llm` calls Opus twice. `--skip-llm` holds every
  `review` item and writes the fallback report.

## Known loose ends

* `scripts/foundry/license_key.py` has the same interactive-hang risk as `admin_password.py`
  did (no `stdin=DEVNULL`, no timeout). Not in the updater's path, so left alone.
* `.state/vtt-update.seen.json` now holds 27 packages. Only `mad-endlesswiz2` is unseen
  (it is held, and held packages are deliberately excluded so they keep being reviewed).
* `pentaryn-seafoot-maps` is installed in `Data/modules` but absent from `foundry/module/`;
  the drift check reports it every run until that is reconciled.
* `mad-endlesswiz2` 13.0.1 → 14.1.0 is held: a major bump of premium content with no public
  release notes for the adjudicator to read. It will stay held until updated by hand or
  moved into `packages.hold`.
