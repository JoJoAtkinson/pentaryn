---
title: "Foundry automated updates — context"
last_modified: 2026-10-10
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

## 🔴 The interpreter needs a TCC grant, or the job hangs instead of running

**2026-08-22.** The Saturday job fired on schedule at 04:06:05 and then sat for
**5h17m01s** blocked on a modal TCC consent dialog nobody could see: WindowServer
denied `UserNotificationCenter` the right to come to the front, so the prompt existed
and was never displayed. The `caffeinate` assertion held continuously from 04:06:05 to
09:23:06 — the process was alive and stuck, not deferred. The Mac was plugged in and
awake all night (`pmset -g log`: zero sleep events).

The gate then declined it and reported "a run launchd deferred from a sleeping Mac" —
a hardcoded string asserting a cause nothing had measured. Both halves are fixed:
the gate now reads the launch time exported by the wrapper and distinguishes deferred
from blocked, and the wrapper caps interpreter startup at 60s so this fails fast.

**The grant itself is still outstanding and only Joe can do it.** `tccd` did not log
the service name and the dialog text is `<private>`, but the shape matches the known
case: `.venv/bin/python` is a uv-managed CPython running with `WorkingDirectory`
inside `~/Documents`.

    System Settings → Privacy & Security → Full Disk Access → +
    /Users/joe/.local/share/uv/python/cpython-3.14.6-macos-aarch64-none/bin/python3.14

Add the **resolved** binary, not the `.venv/bin/python` symlink — TCC keys on the real
executable. Confirm with `make vtt-update-dry`. Until it is granted, every Saturday
run fails at the 60-second preflight with that path in the log.

## What went wrong on 10-03, and the 2026-10-10 fixes

The 10-03 run installed Dice So Nice and Multi Token Edit, then crashed with
`'list' object has no attribute 'get'`: `smoke.package_warnings()` read `packageWarnings`
from `getPackages`, which returns a plain list. It now reads them from the `getSetupData`
payload (`FoundryAdmin.setup_data()`), and a crash records its traceback, lists packages left
live and untested, and notifies "update FAILED, nothing rolled back" instead of "rolled back".
Core 14.369 then changed the server: scripted POSTs need a same-origin `Origin` header, `/setup`
answers 400 while a world runs, `/auth` answers 401 on a wrong password, and the graceful world
shutdown is `POST /setup {worldShutdown}`. `admin.py` handles all of it (and `make vtt-login`).
Escalation (tiers, models, cost) is in the next sections. **Re-armed 2026-10-10**
(`make vtt-update-resume`); `make vtt-update-dry` shows only the deliberate hold (the pinned bridge; dnd5e 6.x is no longer held, 6.0.6 was installed by hand 2026-10-10). `launchctl` still shows last exit 1 until the next Saturday run replaces
the 10-03 failure.

**TCC grant: still outstanding as far as anyone can tell.** Only a launchd-started run
exercises it, so it stays unconfirmed until the first Saturday after this re-arm. If that run
fails at the 60-second preflight, Joe must add the resolved python binary (above).

## What it is

A launchd LaunchAgent that keeps Foundry, its 27 modules and the `dnd5e` system on the
latest stable, unattended, with a backup before anything is touched and a rollback that
matches what actually broke.

```
GATE → BACKUP → SCAN → [ADJUDICATE] → [ESCALATE] → APPLY → SMOKE → RECOVER? → [REPORT] → NOTIFY → RESTORE
python  python  python    claude       claude×0–n   python  python   python     claude    python    python
```

**The bracketed steps are the only LLM steps and all of them fail closed.** No tokens ⇒
`review` items stay held, packages that touch code we adjusted are held (escalation's
`hold_exposed`), other safe updates still land, a plain-table report is still written,
the notification still fires. That split was a hard requirement, not a nicety.
Escalation (2026-10-10) is described in [its own section](#escalation-tiered-llm-review-v1-2026-10-10).

Jobs: `com.pentaryn.vtt-update` (Sat 04:06) · `com.pentaryn.vtt-update-watchdog` (Sat 06:12).
Both installed and loaded. `launchctl list | grep pentaryn.vtt`.

---

## Files

| Path | What lives there |
|---|---|
| `scripts/foundry/update/admin.py` | Foundry's local admin HTTP API + app process lifecycle. **Start here** — the API's quirks are documented in its module docstring. |
| `scripts/foundry/update/inventory.py` | On-disk scan of `Data/{modules,systems}`; classifies tracked / protected / local / forked. |
| `scripts/foundry/update/upstream.py` | Version resolution + release notes (manifest, GitHub, GitLab, r2, Forge). Semver-ish comparison lives here. A failed, stalled (timeout) or missing `gh` returns `None` — the package is unresolved (HOLD), as on a 404, never a crashed run. A manifest payload that is not a JSON object is treated the same; a `compatibility`/`relationships` that is not an object is ignored (ROB-11). |
| `scripts/foundry/update/risk.py` | The deterministic `auto`/`review`/`hold` table, policy loading, the "seen" state. A `requires`/`conflicts`/`systems` entry that is not an object holds the package with reason `malformed manifest` (ROB-11). |
| `scripts/foundry/update/plan.py` | Assembles `plan.json`. Standalone vs Foundry-assisted modes. |
| `scripts/foundry/update/forks.py` | `gh`-driven fork drift. Report only, never merges. A stalled or missing `gh` reads as no forks, not a crash. |
| `scripts/foundry/update/adjudicate.py` | Sandboxed `claude -p` that grades `review` items. |
| `scripts/foundry/update/llm.py` | **The one way to call `claude -p`.** Builds the sandboxed argv, refuses tools for untrusted input, heartbeats the status file, enforces timeout/budget, parses cost. |
| `scripts/foundry/update/escalate.py` | Triage (T0) and impact analysis (T1): facts, floor/ceiling, validators, source bundle, analysis cache, plan writer. |
| `scripts/foundry/update/adjustments.py` | Loads/checks `foundry/adjustments.yml`; the exposure grep. |
| `scripts/foundry/update/apply.py` | Orchestration: gate, backup, apply, phase/status, restore service. |
| `scripts/foundry/update/smoke.py` | Server checks + the puppeteer browser check, per world. |
| `scripts/foundry/update/recover.py` | The failure-class recovery matrix + backup artefacts. The world rollback point is this host's based-on snapshot (else its own newest), downloaded to temp before extracting. |
| `scripts/foundry/update/report.py` | Scrubbing, LLM prose, plain fallback, git commit/push. |
| `scripts/foundry/update/state.py` | mkdir lock, run status file, entry state. |
| `scripts/foundry/update/children.py` | Registry of the run's `claude -p` / `node` children; on SIGTERM `cli run` terminates them and exits 143 through its `finally` blocks (AC-6). |
| `scripts/foundry/update/notify.py` | The three notification classes. Prints instead of posting off the Mac. |
| `scripts/foundry/update/cli.py` | `scan` `run` `status` `notify` `admin-configure` `recover-service`. |
| `scripts/foundry/admin_password.py` | The admin secret: env → Infisical → macOS keychain. |
| `scripts/foundry/cloud.py` | **Pre-existing**, modified. OneDrive backup/restore, per-host retention. I/O through `storage.py` (rclone or folder). |
| `scripts/foundry/host.py` | Which machine, its role (`primary`/`alt`), paths, start/stop. `apply.gate()` and `vtt-update.sh` refuse to run off the primary. |
| `automation/bin/*.sh` | launchd entrypoints + `foundry-admin-push.sh`. |
| `automation/launchd/*.plist` | The two jobs. |
| `automation/notifier/` | `Ardenhaven VTT.app` source + build script. |
| `automation/smoke/smoke.mjs` | The puppeteer-core browser smoke test. |
| `foundry/update-policy.yml` | **The only file you should normally edit.** |
| `foundry/adjustments.yml` | Every place our code leans on a third-party package. `make foundry-adjustments-check`. |
| `foundry/logs/auto-updates/plans/` | Ready-to-run plans the analysis tier wrote; committed with the report. |
| `foundry/cloudflared/config.yml` | Tunnel ingress; blocks the admin surface. |
| `foundry/logs/auto-updates/` | Per-run `.md` + `.json`, committed and pushed. |

Runtime state (all gitignored) lives in `.state/`: `vtt-update.lock/` (a **directory** —
macOS has no `flock`; a lock with no `owner.json` counts as held for its first 60 s, since
its owner may be between `mkdir` and the write, and any failure breaking a stale lock
reports it held rather than crashing), `vtt-update.status`, `vtt-update.entry`, `vtt-update.seen.json`,
`vtt-update-cache/`, `vtt-update-analysis/` (T1 cache, one JSON per package × key),
`vtt-update-dry-plans/` (plans from dry runs), `core-rollback/`, `system-aside/`, `logs/`.
The rollback tars in `core-rollback/` and `system-aside/` are written as `<name>.partial`
and renamed only once complete, so an interrupted stash leaves nothing at the final name
and the next run takes a fresh copy instead of trusting a truncated one.

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
| `POST /setup {action:"worldShutdown"}` | Graceful world deactivate (14.369+) — **needs an admin password**. Before 14.369 this was `POST /join {action:"shutdown"}`, which 14.369 silently ignores (200 `{}`); `deactivate_world()` tries both. |

**Every POST needs a same-origin `Origin` header on 14.369+.** `express.mjs` answers a POST
whose `Sec-Fetch-Site`/`Origin` does not match the server with **400 "The request could not
be processed."** before any route runs. `FoundryAdmin` sends `Origin: <base_url>` on every
request; a hand-rolled `curl`/`requests` call must too. On 2026-10-10 the missing header made
every package action 400 while `authenticate()` reported success.

### Seven traps, each of which cost real debugging time

1. **Every `/setup` and `/update` package action is gated on `!game.world`** — refused while a
   world is active (`/setup`: 400 on 14.369, 403 before; `/update`: 403). A non-admin session
   gets 401 from `/setup` on 14.369 (403 before). The run has to park the server at the setup
   screen first.

   But the **admin handshake is not** — `setup.mjs` runs `sessions.authenticateAdmin`
   *before* it computes `c`, and gates only the action on the result. So `/setup` is the
   one route that can establish an admin session at any time. `/auth` cannot: it reads
   `!game.world && sessions.authenticateAdmin(...)`, so with a world up the `&&`
   short-circuits and the password is **never checked**. `FoundryAdmin.authenticate()` picks
   the route by world state for this reason, and on `/auth` counts **only a redirect to
   `/setup`** as success — 14.369 answers a bad password with a 401 re-render, a world that
   came up meanwhile with a redirect to `/join`, a missing `Origin` with a 400.

2. **`POST /setup {shutdown:true}` does not work from a script.** It calls
   `world.deactivate(req, {asAdmin: c})` with that same always-false `c`, and `world.mjs`
   bails to `{redirect:"/join"}` because a scripted session has no `req.user`. Use
   `POST /setup {action:"worldShutdown", adminPassword}` (14.369+; `POST /join
   {action:"shutdown"}` before) or just quit the app.

3. **`authenticateAdmin` returns success without setting `session.admin`** when no admin
   password is configured:
   ```js
   if (session.admin || !pw) return {success: true, session};   // admin stays false
   ```
   Most of the setup API only checks the returned success, so it *appears* to work. But
   `loginAsUser` and the graceful world shutdown check `session.admin` directly. **This is the whole
   reason `FOUNDRY_VTT_GRANDMASTER_PW` exists.**

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
| The updater shells out to `scripts.foundry.cloud backup`, the same call `make vtt-down` makes (vtt-down adds `--background`; the updater's is blocking, waits for any upload still running, and uploads anything still queued first) | One implementation of the retention rules. A creative session and the Saturday run produce snapshots under identical coalescing, rolling and promotion behaviour; only the `--reason` log label differs. A non-zero exit is a hard failure — otherwise the run would find an *older* snapshot and believe it had a fresh restore point. |
| The updater runs **only on the primary host** (2026-10-11) | Two machines share the cloud (the Mac and BOSS — [`ops.md`](ops.md) §3). `apply.gate()` aborts off-primary even with `--force`, and `vtt-update.sh` checks first so a stray plist on the alt logs and exits 0. `PENTARYN_ROLE_OVERRIDE=primary` passes both, deliberately. The run sets `PENTARYN_BOOT_DONE=skip`, so its Foundry restarts never run the boot choice — a restore mid-update would invalidate its own rollback point. |
| The rollback point is **this host's** state | `recover.newest_world_snapshot()` returns the snapshot the local world is based on (after `back_up` that is the current state, whatever host's name it carries), else this host's own newest — never the other machine's newer one. |

### Backup retention (reworked 2026-08-21; per host since 2026-10-11)

A world snapshot is **~45 MB** (worlds + Config) since module bundles; modules and systems are
content-addressed bundles in `bundles/`, uploaded only when they change ([`ops.md`](ops.md) §3).
Snapshots from before that are **~2.5–3.2 GB** (they hold `Data/modules`). The retention below
was sized for those and still applies to every snapshot:

* **10** rolling snapshots **per host** (was 100 — a 250 GB ceiling). Each machine prunes only
  its own; legacy untagged snapshots are never pruned automatically.
* A snapshot taken **within `COALESCE_WINDOW_DAYS` (5)** of this host's newest **replaces** it,
  so a dev session costs one snapshot rather than six. Never another host's. The new tar is
  written **before** the old one is deleted — never leave a window with no restore point.
* On a Foundry **generation** change, the last snapshot this host took on the old generation
  is copied to `major-release/` and never pruned. Detected at backup time by comparing the
  installed generation against this host's newest snapshot's, so it also catches an upgrade
  done by hand through Foundry's setup screen.
* Snapshots are named `world-<UTC stamp>-fvtt<version>-<host>.tar.gz`; the version suffix is
  what makes the generation rule work without a separate index, the host suffix what scopes
  every rule above. Older names (no host, or no version) parse as "untagged" and "unknown
  version", treated as *nobody's* and *cannot tell*.
* System mirrors (`system-backup/`, `KEEP_SYSTEM_MIRRORS`, `mirror_systems()`) are retired:
  systems are bundles now, and a bundle any retained snapshot names is never swept. The
  rollback's own system copy is still the local aside (`.state/system-aside/`), and the world
  rollback never downloads or requires a system bundle.

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
* `FOUNDRY_VTT_GRANDMASTER_PW`: env → Infisical → **macOS login keychain**. The keychain tier
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

## Escalation: tiered LLM review (v1, 2026-10-10)

Design and rationale: [`../plans/smarter-updater.md`](../plans/smarter-updater.md). v1
builds T0 triage and T1 analysis; T2 decide (Fable) and T3 fix (Opus, worktree) are
designed but not built — `max_tier` above `analyze` is clamped with a reason in the record.

**What it does.** After adjudication, on the final `auto` set plus held packages that need
a plan, Python computes **facts** (adjustments rows, exposure grep, bump, note-keyword
*counts*, last outcome from previous run records, whether a cached analysis exists). From
facts alone it computes a **floor** (`escalate.package_floor`: a core bump, or an exposed
package whose notes are not a clean patch, or a held major we adjusted with no cached
plan → `analyze`) and a **ceiling** (`max_tier`, lowered when `window.latest − now −
reserve_minutes`, the step's own `max_minutes` (40), or `budget_usd_per_run` cannot fit
it). Haiku triage is offered only what it can change — `auto` packages with adjustments or
exposure, plus held packages whose floor demands a plan — reads their notes and picks a
tier; Python clamps it into `[floor, ceiling]`. At `analyze`, Opus `high` gets one
call per package: facts, the registry rows, the notes, and a **source bundle** Python built
from the files the rows name plus the exposure files (60 KB/file, ±80-line trim, 400 KB
total, line-numbered). Its validated answer can move the package `auto → hold` and writes a
plan to `foundry/logs/auto-updates/plans/<run_id>-<pkg>.md`.

**What it can never do:** move anything into `auto`. `escalate.hold()` is the only bucket
move in the module. Held packages are excluded from `save_seen` as before.

**Trust boundary.** Every call goes through `llm.call`. `untrusted_input=True` (the
default) makes `llm.build_command` raise `UnsafeCall` if the spec grants any tool. Tool-less
argv: `--tools "" --disallowed-tools <list> --strict-mcp-config --mcp-config
'{"mcpServers":{}}' --permission-mode dontAsk --permission-prompts none
--no-session-persistence --restricted` (probed on CLI 2.1.296: the init event lists
`tools: ["StructuredOutput"]`, `mcp_servers: []`),
`--effort` and `--max-budget-usd` always set, `--system-prompt` carries the rules, the
data goes on stdin, cwd is a fresh temp dir (no `CLAUDE.md`). Output passes a validator
(`validate_triage`, `validate_analysis`): enums, length caps (over-long = **reject**), the
offered-id allow-list (also sent as a schema `enum`), URL stripping, identifier-only `api`,
cited files must be in the bundle, fix files must be in the cited area, tests must be a
real `make foundry-*-check` / `pytest scripts/tests/…` (anything else becomes `none`),
`unattended_fix_ok` recomputed. `handoff_brief()` is the only view a future tool-using
tier gets — validated fields only, never `evidence.notes` or the triage digest.

Strings a remote manifest controls — the target version, the notes URL, the decision
reasons that interpolate them — and the adjudicator's free-text rationale never reach the
FACTS block or a plan raw: `safe_version` (a version shape or `(unparseable version)`),
`safe_url` (http(s), no whitespace or markdown) and `plain` (one line, URLs/backticks/
angle brackets defanged). Plans get the report's IP scrub and pipe-escaped table cells:
they are committed to a public repo and presented as runnable.

**`--bare` is NOT used, on purpose.** Probed 2026-10-10: `--bare` reads auth only from
`ANTHROPIC_API_KEY`; with this Mac's OAuth login every call returns `Not logged in`.
`--restricted` ignores user/project/local settings files (so their hooks) and works with
OAuth. `llm.isolation: bare` exists for when the job gets its own API key.

**Fail-closed table** (all tested in `scripts/tests/test_update_escalation.py`):

| Failure | Result |
|---|---|
| no CLI / non-zero exit / timeout / bad JSON / unknown id in triage | tier = floor; `hold_exposed` holds the exposed `auto` packages whose floor is `none` (triage was their only check); a package whose floor is `analyze` is left to T1, which holds on its own failure |
| injection flag in triage | `hold_exposed` holds every offered `auto` package; **no T1 runs** — no Opus on flagged text, no plan written from it |
| T1 failure, rejection or injection flag | that package held; nothing cached; the attempt is counted (if a model actually ran) and after `analysis_attempts` (2) the same key is not retried — held "not retried until either changes" |
| out of time or run budget | package held "deferred: …", no call made |
| Python exception inside escalation | caught; traceback in `escalation.traceback`; exposed floor packages held |
| `--skip-llm` | escalation not run at all; record byte-identical to before |

**Cache.** `.state/vtt-update-analysis/<pkg>--<key>.json`, key = sha256(id, installed,
target, the package's registry rows, the full bytes of every bundle file, `PROMPT_VERSION`).
Editing a file the analyst read, editing a row, a new upstream version or a prompt change
all miss — for a package about to be installed. A **held** package (which will not be
installed; its analysis only feeds a plan) also reuses the newest analysis of the same
installed version against the same target *major* for `held_reuse_days` (28), so a major held for months costs about one Opus call a month rather than one per upstream patch
or per edit to the seven files it reads; the plan says which pair it analysed. A held
major with a reusable analysis costs **nothing**: no triage, no T1, the report links the
existing plan. Failed attempts live beside the cache as `<pkg>--<key>.failures`. Dry runs
populate the cache but write plans to `.state/vtt-update-dry-plans/` and commit nothing.

**Cost and time.** Every call records model (resolved from `modelUsage`), effort, cost and
seconds; `report.llm_calls()` gathers adjudicator + escalation + report, and every report
ends with `LLM cost this run: $… (…)`. The status file is rewritten every 60 s during a
call (`escalate/triage`, `escalate/analyze <pkg>`), so the watchdog's 20-minute rule holds.

`--max-budget-usd` is enforced **after** the turn (probed 2026-10-10): a call that lands
over its cap is billed and comes back `error_max_budget_usd` with no answer. So every
`budget_usd` is a runaway guard set well above the expected cost — adjudicator $1.50
(typical $0.05–0.15; it had no cap before), triage $0.25 (Haiku ~$0.002, Sonnet fallback
~$0.04), analysis $2.50 per call / $5 per run (expected $0.4–1.2; a core bundle is ~250 KB).
A call killed on timeout reports no cost; budgets *charge* it its cap (`llm.charged`) and
the cost line adds "+ up to $X unreported".

**Time.** The step stops at the earlier of `window.latest − reserve_minutes` and its own
`max_minutes` (40). `vtt-update.sh`'s backstop is 90 min + `max_minutes` = 7 800 s
(`escalate.wrapper_timeout()`) — not a flat three hours, which put the kill (07:06) after
the 06:12 watchdog with nothing left to notice it. `max_minutes` is clamped to 90 so the
backstop always fires before the lock is old enough to read as stale (3 h); a clamp is
listed in the run's `ceiling_reasons`. The kill is SIGTERM, then SIGKILL ten seconds
later; on the TERM, `cli run` terminates every `claude -p` and `node` smoke child it
registered (`children.py`) and exits 143 through its `finally` blocks, so nothing is
orphaned and the lock is released (AC-6). And whoever kills the run now cleans
up after it: on a 143/137 exit the wrapper runs `cli killed`, which marks the status
`failed`/`killed`, restores service from the entry state, removes the lock if its owner is
dead (`make vtt-up` refuses while it exists) and notifies. The watchdog stays quiet about
a `killed` run; its own dead-run path now also removes a dead owner's lock. And it only
*suspects* death (20 min of status silence), so `recover-service` checks first: while the
lock owner's pid is alive it prints `run <pid> still alive — not restoring service`, leaves
world, tunnel and entry state alone, and the watchdog sends "update run is slow" instead of
"died". A hung-but-alive run is the backstop's to clean up (`cli killed`).

**Adjustments registry.** `foundry/adjustments.yml`: `packages`, `modules`, `files`,
`markers` (strings that must still be in the files), `what`, `why`, `native_when`,
`retire_class`, `check`, plus per-package `aliases` for the exposure grep. Add a row
whenever our code starts leaning on a package; `make foundry-adjustments-check` (and the
`test_the_real_registry_matches_the_code` test) fails when a row rots. Core and dnd5e are
excluded from exposure — every file mentions `dnd5e` — so for those the rows are all.

Exposure costs money (an exposed non-clean update floors at an Opus call), so it matches
**code, not prose**: comments and docstrings are stripped; the id is matched
case-sensitively and must stand alone; an id that is also a JS identifier (`levels`,
`socketlib`) must be quoted, a path segment or a `flags.` scope; and
`scripts/foundry/update/` is not searched (it names packages as examples). A plain
substring match had `levels` "exposed" in ten files via `DOCUMENT_OWNERSHIP_LEVELS` and
`multi-token-edit` via an `upstream.py` docstring — three of the last six Saturdays would
have bought an analysis for nothing. Aliases stay plain substrings.

**Preview without spending.** `make vtt-update-dry` now ends with an `ESCALATION (preview,
no LLM)` block: per package bucket, floor, adjustments, exposure count, keyword counts,
last outcome, cached-analysis flag. A `review` item is previewed as `hold`.

**Policy keys** (`foundry/update-policy.yml`): `llm.{isolation,adjudicator,report}`,
`escalation.{enabled,max_tier,on_triage_failure,reserve_minutes,forced_minutes,
max_minutes,budget_usd_per_run,analysis_attempts,held_reuse_days,tiers.*,unattended_fix,
unattended_retire}`, `adjustments`. The report
writer moved to `sonnet`/`medium`; set `llm.report.model: opus` to revert.

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
   If the graceful deactivate is refused it restarts the app instead; if *that* fails
   (a wedged Electron makes `quit_app`/`start_app` time out), the world is recorded as
   a failed smoke (`could not return to setup: <exc>`) and the run still recovers.

5. **`/auth` reports a correct admin password as wrong whenever a world is live.**
   Not a wrong password and not a lapsed secret — the route short-circuits on
   `!game.world` and never calls `authenticateAdmin`, then redirects back to `/auth`,
   which is byte-identical to how it rejects. The updater escaped this only because it
   always authenticated while parked at the setup screen; any path that authenticated
   after a launch — `run_browser`'s `fa.authenticate()` on a fresh client, `_post`'s
   403 retry via `reauthenticate()` — got "the one supplied did not match" and sent you
   off to re-sync a secret that was fine. `authenticate()` now uses `/setup` when a
   world is active and verifies the result against `isAdmin` in the `getJoinData`
   socket payload, which is Foundry's own report of the flag rather than a guess from a
   status code. Found 2026-08-22 while building `make login`.

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
| Foundry core | **14.367** at the 2026-08 build (14.369 since the attended 2026-10-10 update) |
| dnd5e | 5.3.3 at the 2026-08 build; 6.0.6 since 2026-10-10 |
| Worlds | `space-journey` and `ardenhaven`, both migrated to 14.367, both smoke-clean |
| Browser smoke | Re-verified live 2026-08-22 against `space-journey`: logged in as Gamemaster, `gameReady` and `canvasReady` true, scene "1. The Library (The Parley)", 28 modules active, zero client errors. It does get past the join screen and does exercise the world |
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
* **Costs tokens**: `run` without `--skip-llm` calls the adjudicator (Opus, only when
  something is in `review`), triage (Haiku, only when a touched package is exposed), the
  analysis (Opus, only at tier `analyze` and on a cache miss) and the report (Sonnet). The
  report's last line is the measured total. `--skip-llm` skips all of them, holds every
  `review` item and writes the fallback report.
* **Changing a prompt or a schema in `escalate.py`** → bump `PROMPT_VERSION` so cached
  analyses written under the old rules are not reused.

## Known loose ends

* `scripts/foundry/license_key.py` has the same interactive-hang risk as `admin_password.py`
  did (no `stdin=DEVNULL`, no timeout). Not in the updater's path, so left alone.
* `.state/vtt-update.seen.json` now holds 27 packages. Only `mad-endlesswiz2` is unseen
  (it is held, and held packages are deliberately excluded so they keep being reviewed).
* `pentaryn-seafoot-maps` is installed in `Data/modules` but absent from `foundry/module/`;
  the drift check reports it every run until that is reconciled.
* `mad-endlesswiz2` 13.0.1 → 14.1.0 was held (a major bump of premium content with no public
  release notes for the adjudicator to read) and has since been installed by hand; all 25
  scenes using it were checked.
