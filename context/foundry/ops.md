---
created: 2026-08-13
last_modified: 2026-10-11
tags: ["playbook", "foundry", "vtt", "ops", "onedrive", "secrets"]
status: active
---

# Foundry VTT — Operations

**Read this when:** running Foundry day to day — starting or stopping the server and tunnel, OneDrive sync and the boot choice between the Mac and BOSS, the license key, installing a module, or checking what is exposed publicly.
**Not this file:** building content programmatically → [`../plans/foundry-content-pipeline.md`](../plans/foundry-content-pipeline.md) · the unattended updater → [`automated-updates.md`](automated-updates.md)

> Running the thing. Starting and stopping the server and the tunnel, keeping OneDrive
> and local disk in their lanes, getting the license key without leaking it, installing
> modules, and not leaving campaign files hanging on a public URL.

**Four Foundry playbooks — open the right one.**

| You want to… | Playbook |
| ------------ | -------- |
| Start/stop the server, the tunnel, sync assets, restore a world, install a module, check what's exposed | **this one** |
| Whitelist a player's Gmail (**two lists: Google test users + Cloudflare policy**), the Google login in front of the tunnel | [`cloudflare-access.md`](cloudflare-access.md) |
| Build world *content* — actor generation from `actions.jsonl`, the importer module, the write paths that fail silently, Gates 0–4 | [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) |
| Complete hand-drawn walls | [`foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md) |
| Extend the MCP bridge's tool surface | [`mcp-fork.md`](mcp-fork.md) · design history: [`foundry-mcp-fork.md`](../plans/foundry-mcp-fork.md) |

Where this one and `foundry-vtt.md` overlap — the actors import pipeline and its Gate 2 — this playbook covers the
*operational* half (what deletes the staged file, what proves it's gone) and links out for the rest.

---

## I want to X → do Y

| I want to… | Do |
| ---------- | -- |
| Play tonight | `make vtt-up` → players at <https://vtt.atjoseph.com> → `make vtt-down` after (returns at once; the snapshot uploads in the background — `make foundry-cloud` shows it, and don't sleep the laptop until it says done; `WAIT=1` waits instead) |
| Get **yourself** into the world, no dropdown, no typed password | `make login` — §2's login box |
| Know if anything's running | `make vtt` — Foundry, tunnel pid, and public reachability, three separate probes |
| Add art (tokens/maps/tiles/portraits/audio) | Drop `<kind>-<nn>.zip` in `OneDrive/DnD/foundry/assets/`, then `make foundry-assets` (or just `make vtt-up`) |
| Snapshot the world right now | `make vtt-down` first, then `make foundry-backup` — it **refuses** while the server is up |
| Roll back a broken world | `make foundry-restore` to list, `make foundry-restore SNAP=<name>` to do it. Never silent — see §3 |
| Boot BOSS (the alt) from the Mac's latest world | `make vtt-up` on BOSS → Enter at the boot question (§3). `FROM=latest` without asking, `FROM=local` to keep BOSS's own |
| Keep the local world when the cloud is newer | `k` at the boot question (remembered until something newer appears), or `make vtt-up FROM=local` |
| See what's in the cloud store | `make foundry-cloud` |
| Install or update a module | Setup screen (resolves dependencies) **or** unzip the release into `Data/modules/<id>/` and restart — §5. Never from inside a running world |
| Push a local module to Foundry | `make foundry-<short>-sync` (e.g. `make foundry-walls-sync`) · the importer only through `make foundry-sync WORLD=<world>` (it also stages `actors.json` — `make foundry-clean` after). The copy is built in `FoundryVTT/.pentaryn-sync/` and swapped in whole, so a failed copy leaves the old install serving. Which build is live: `Data/modules/<id>/.pentaryn-sync.json` (module, version, digest, git, dirty, synced_at — a dotfile, not served); every install also appends a line to `foundry/logs/ops-YYYY-MM.jsonl` |
| Import actors | [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) Stages 1–2, then `make foundry-import` (🔴 read §1's red box first — it stages into the wrong world today) |
| Prove nothing's exposed | `make foundry-verify` |
| Check the license key resolves | `make foundry-check` — prints length and format, never the value |
| First-run activation only | `make foundry-key` → copies to the clipboard (pbcopy / clip.exe / xclip) → clear the clipboard after |
| Debug a dead tunnel | `make tunnel-logs` |

---

## 1. Topology

Foundry runs on the **primary host — the Mac today** — as a desktop app. There is no server, no
container, no cloud host. Players reach it through a Cloudflare tunnel that exists only while
you're running. An **alt host** (BOSS, Foundry in WSL) shares the world through the OneDrive
snapshots (§3) for building and testing; it never runs the tunnel or the updater.
`scripts/foundry/host.py` answers which machine this is and where its Foundry lives.

```
players ──https──▶ vtt.atjoseph.com ──cloudflared (named tunnel "ardenhaven")──▶ localhost:30000
                                                                                     │
                                          ~/Library/Application Support/FoundryVTT/  │
                                            Config/  Data/  Logs/  ◀─────────────────┘
                                                     ├── worlds/   space-journey · ardenford · ardenhaven · pentaryn
                                                     ├── modules/  21 (see §5)
                                                     ├── systems/  dnd5e 5.3.3
                                                     └── assets/   maps · tokens · splash
```

| | |
| --- | --- |
| App | `Foundry Virtual Tabletop` in `/Applications` — launched via `open -a` (through `host.py`; BOSS uses `PENTARYN_START_CMD`) |
| Local URL | <http://localhost:30000> |
| Public URL | <https://vtt.atjoseph.com> |
| Tunnel | `cloudflared`, named tunnel `ardenhaven`, pidfile `.run/cloudflared.pid`, log `.run/cloudflared.log` (both gitignored) |
| Data root | `~/Library/Application Support/FoundryVTT` (`host.FOUNDRY_DATA`; `Data/` beneath it is `ops/config.py`'s `FOUNDRY_DATA_DIR`) |
| Core | **v14.365** |
| System | **dnd5e 5.3.3** |
| Live world | **whichever one is launched** — four worlds now exist, so never infer it. `python -m scripts.foundry.ops status` names it, or ask the client for `game.world.id`. `space-journey` was the live world through 2026-09-17; `ardenford` was created that day (see *Creating a new world*, below); `pentaryn` was created 2026-10-04 and is live (see [`../pentaryn.md`](../pentaryn.md)) |

### The actor pipeline targets `space-journey` — and says so out loud

This used to be the most dangerous line in this document. `FOUNDRY_WORLD_DIR`,
`FOUNDRY_ACTORS_STAGED` and `FOUNDRY_ACTORS_URL` were hardcoded in the Makefile to
`worlds/ardenhaven` while the live world was `space-journey`, so `make foundry-import`
staged `actors.json` into a world nobody was playing: the import found nothing, **and**
Gate 2 asserted its 404 against the *unused* world's URL. Every light green, nothing
imported, nothing meaningfully verified. A gate that passes for the wrong reason is
worse than one that fails.

**Fixed 2026-08-22.** The world is now one constant in
[`scripts/foundry/ops/config.py`](../../scripts/foundry/ops/config.py), defaulting to
`space-journey` (confirmed live 2026-08-22 — see §1), and three things make a repeat
visible rather than silent:

* every pipeline run prints `▸ target world: <name>` before it copies anything;
* a missing world directory is a hard stop that lists the worlds actually on disk —
  `mkdir -p` would otherwise invent `worlds/typo/` and everything downstream would
  look like it worked;
* the staged path and the probed URL are asserted to name the same world, in
  `scripts/tests/test_foundry_ops.py`.

Override for a one-off with `make foundry-import WORLD=ardenhaven`. All three worlds still
exist on disk, so "the directory exists" alone can't catch a wrong-but-real name — the
printed line is what you check.

*(The **tunnel** is also named `ardenhaven`. That one is cosmetic and fine.)*

### Creating a new world — the Setup screen is not the only path

World creation is a plain HTTP route, `POST /create` with `action: "createWorld"`
(`dist/server/views/create.mjs`). It needs an admin-authenticated session and **no world
active**, which is exactly the state `FoundryAdmin` already knows how to reach — so a new
world can be stood up from a script without touching the browser:

```python
from scripts.foundry.update.admin import FoundryAdmin
from scripts.foundry.admin_password import foundry_admin_password
admin = FoundryAdmin(admin_password=foundry_admin_password())
admin.authenticate()
admin.session.post(f"{admin.base_url}/create", json={
    "action": "createWorld", "id": "<slug>", "title": "<Title>",
    "system": "dnd5e", "launch": True})
```

`launch: True` runs `firstLaunch()`, which creates every collection LevelDB **and** a
default Gamemaster user. Without it you get `world.json` and empty directories, and the
databases appear only on the first real launch.

**Copying a world's add-on setup is a settings copy, not a package install.** Which
modules are on is the world-scoped setting `core.moduleConfiguration` — a plain
`{id: true}` map in `worlds/<id>/data/settings`. Copy it and the new world comes up with
the same modules enabled, no Manage Modules step. This is the same trick §5 describes for
the Argon pair.

🔴 **Do the copy while both worlds are closed.** `settings` is a LevelDB; a live world
holds the lock, and `world.setup()` reads `core.moduleConfiguration` *before* it connects
any packs, so the setting has to be on disk before the launch that should honour it.
Reading and writing it is `classic-level` out of Foundry's own `node_modules`, keys
`!settings!<id>`, values the same document shape you read back.

The chicken-and-egg this avoids: `eval-js` runs inside a loaded client, so it cannot turn
on `foundry-mcp-bridge` in a world where the bridge is off. Pre-seed the setting on disk,
then launch, and the bridge is live on the first connection.

**Worth copying with it** (all verified 2026-09-17 when `ardenford` was built from
`space-journey`): `core.permissions`, `core.prototypeTokenOverrides` (this is where the
world-wide `lockRotation` lives — see the token conventions in
[`README.md`](README.md)), and any per-module settings you have tuned, e.g.
`pentaryn-ties.*` and `enhancedcombathud*`.

**Not worth copying:** `core.compendiumConfiguration`. Its values are Folder ids that
exist only in the source world, and the dnd5e system recreates the same sidebar folders
in any new world anyway. The one thing to re-apply by hand is a deliberately unlocked
pack (`pentaryn-seafoot-maps.scenes` is unlocked in both worlds).

---

## 2. Lifecycle — and why the order is the order

```
make vtt-up      foundry-boot → foundry-backup-safe → foundry-assets-safe → foundry-up → tunnel-up
make vtt-down    tunnel-down → foundry-down → foundry-backup REASON=shutdown BACKGROUND=1   (WAIT=1: no BACKGROUND)
make vtt         status only (alias: vtt-status)
```

The order is not arbitrary. Each step needs the previous one's state:

| # | Step | Why here |
| - | ---- | -------- |
| 0 | `foundry-boot` | **The boot choice** (§3): when the cloud's newest snapshot — from either machine — is newer than what this world is based on, say so and offer it (Enter = take it). First, so a restore happens while nothing is running, and so the backup after it digest-skips instead of uploading 3 GB that was just replaced. No terminal → never restores, one notice line. `FROM=latest\|local\|<name>` decides without asking |
| 1 | `foundry-backup-safe` | A LevelDB world copies consistently **only while stopped**. Snapshotting on *start* as well as stop is what catches a crash or force-quit that skipped the shutdown hook. `-safe` = `--if-stopped`: skips quietly if the server is already up, so `make vtt-up` on a live server doesn't abort before starting the tunnel; a cloud that is down (or a failed upload) is a warning naming any tar left on disk, exit 0 — `vtt-down` tries again |
| 2 | `foundry-assets-safe` | New pack folders are on disk before anyone asks for them. A soft constraint — Foundry serves `Data/` per-request, so a later unpack would still be served — but unpacking while the server is down is free and cannot race. `-safe` = `--if-reachable`: a cloud that is down is a warning, exit 0; a badly named or edited pack still stops the start |
| 3 | `foundry-up` | `host.start()` (`open -a` on the Mac), then polls `localhost:30000` for 40 s. The origin must answer before anything points at it |
| 4 | `tunnel-up` | **Last, because this is the step that makes `Data/` public** (§6). Primary host only — on the alt it prints why and exits 0, so Foundry is up with no tunnel. Refuses early if `~/.cloudflared/cert.pem` is missing or the named tunnel doesn't exist → `make tunnel-setup` |

`vtt-down` reverses it exactly: close the public surface first, stop the app, *then* snapshot —
because the snapshot is the step that requires "stopped".

**The upload runs in the background.** `vtt-down` builds the tar while Foundry is stopped (that
part needs "stopped", so it finishes before the command returns), then hands the ~3 GB upload to
a detached process and prints one line: the name, `make foundry-cloud` for progress, and *don't
sleep the laptop until it finishes* (on the Mac `caffeinate` holds off idle sleep while it runs,
but closing the lid still sleeps). `make vtt-down WAIT=1` is the old blocking behaviour. The
queue, the locks and the status file live in `FOUNDRY_DATA/.pentaryn-tmp/`
([`uploadq.py`](../../scripts/foundry/uploadq.py)); the uploader's own output is `upload.log`
there, and each upload adds `cloud-upload` lines (queued, uploading, done/failed) to
`foundry/logs/ops-YYYY-MM.jsonl`.

| While an upload is running or queued… | What happens |
| ------------------------------------- | ------------ |
| `make foundry-cloud` | First line: `upload  in progress: <name>`, or `pending: <name>` (not running — interrupted), or `last: <name> done/FAILED` |
| `make vtt-up` | The boot step **keeps local** without asking (the cloud does not show this world's newest state yet). The pre-launch backup skips while an upload runs; an interrupted one is restarted in the background, so the launch never waits for it |
| A second `make vtt-down` | Unchanged world → nothing new is built. Changed → a new tar is queued **behind** the first, based on it; both go up in order. Never a duplicate |
| `make foundry-backup`, `foundry-restore`, `FROM=latest\|<name>`, the updater | Wait for the running upload ("waiting for the background upload of …"), upload anything still queued, then do their own work — so the based-on record is never stale and a restore is never overwritten by an upload finishing after it |
| The upload fails or the machine sleeps/crashes | The tar and its job stay queued in `.pentaryn-tmp/`; the based-on record has **not** moved. The next backup of any kind (or `make vtt-down`) retries it; a `.partial` left in the cloud is swept after a day as before |

| Target | Does |
| ------ | ---- |
| `make foundry-up` / `foundry-down` | App only (plus the boot choice before `foundry-up`). Via `host.py`: `foundry-down` is `osascript quit`, falling back to `pkill` on the Mac; `PENTARYN_STOP_CMD` on BOSS |
| `make foundry-boot` | The boot choice alone — `FROM=` to decide it |
| `make tunnel-up` / `tunnel-down` | Tunnel only. `tunnel-up` starts cloudflared detached, writes the pidfile, and checks it survived 3 s |
| `make tunnel-logs` | Last 40 lines of the cloudflared log |
| `make tunnel-setup` | **One-time**: `cloudflared tunnel login`, create the tunnel, route DNS. Idempotent |
| `make vtt` | Three independent probes: local HTTP · pidfile `kill -0` · public HTTP 200/302 |

### Where the logic lives

The Makefile is a list of commands, not an implementation. Each target is one line
that calls Python:

| Layer | Module |
| ----- | ------ |
| Server, tunnel, status | [`scripts/foundry/ops/service.py`](../../scripts/foundry/ops/service.py) |
| Actor pipeline (stage → import → clean → verify) | [`scripts/foundry/ops/pipeline.py`](../../scripts/foundry/ops/pipeline.py) |
| Module check + install | [`scripts/foundry/ops/modules.py`](../../scripts/foundry/ops/modules.py) |
| Paths, world name, module registry | [`scripts/foundry/ops/config.py`](../../scripts/foundry/ops/config.py) |
| OneDrive sync — policy | [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) |
| OneDrive sync — rclone or folder | [`scripts/foundry/storage.py`](../../scripts/foundry/storage.py) |
| Which machine, role, paths, start/stop | [`scripts/foundry/host.py`](../../scripts/foundry/host.py) |
| The boot choice and its state file | [`scripts/foundry/boot.py`](../../scripts/foundry/boot.py), [`bootstate.py`](../../scripts/foundry/bootstate.py) |
| The weekly updater | [`scripts/foundry/update/`](../../scripts/foundry/update/) |

`python -m scripts.foundry.ops --help` lists the whole surface; `make help` lists the
handful worth remembering.

### Getting *into* the world — `make login`

`vtt-up` gets the server and the tunnel running. It does not get **you** in: that was still
the setup screen, then Launch World, then the user dropdown, then the GM's password.

```
make login              ↑/↓ pick a campaign, ↑/↓ pick a user, land in the world
make vtt-login          the same target under its longer name
make login WORLD=ardenhaven USER_NAME=Kyle     fully specified — no prompts
make login USER_NAME=Talo LOGIN_HOST=127.0.0.1 NO_OPEN=1
                        a player tab beside the GM's: 127.0.0.1 is its own cookie host, so the
                        GM's localhost session survives; NO_OPEN prints the one-shot URL instead
```

At a terminal it asks two questions, both pre-answered with the sensible default so enter
is usually enough:

```
▸ Which campaign? (↑/↓, enter)
 » Space Journey  (space-journey, dnd5e, last played 2026-08-22)  ← running
   ardenhaven  (ardenhaven, dnd5e, last played 2026-08-21)
▸ Log in as? (↑/↓, enter)
 » Gamemaster  (Gamemaster)
   Kristine  (Player)
   Kyle  (Player)
```

Picking a *different* campaign from the running one deactivates it first, which disconnects
everyone — so it asks, and the confirmation names how many players are connected. Passing
`--world`/`WORLD=` skips the picker; without a terminal (a script, a cron job, a pipe) it
never prompts at all and stays in whatever is already serving, because silently switching a
live world is not something an unattended run may do. Logging in as a player is the fast way
to check what they can actually see.

It is **not** part of `vtt-up`, deliberately: `vtt-up` also runs unattended from the Saturday
updater, and popping a browser window open there would be wrong. Run both — order doesn't
matter, `login` starts the app itself if it has to.

**No GM password is stored anywhere.** The one secret involved is the *server admin*
password (§4), and it never leaves the Python process — the browser is handed a session id,
not a credential. That works because Foundry's `sessions.loginAsUser` lets an
admin-authenticated session log in as any user without that user's own password. It is also
why `make foundry-admin-configure` is a prerequisite: with no admin password set,
`authenticateAdmin` returns success but never sets `session.admin`, and `loginAs` 403s with
`USERS.LoginAsGMRequired`.

Three Foundry facts make this work, and the first one is the trap:

| | |
| - | - |
| **`POST /auth` cannot authenticate while a world is live** | `auth.mjs`: `const t = !game.world && sessions.authenticateAdmin(...).success`. The `&&` short-circuits, so `authenticateAdmin` is **never called** and the route redirects back to `/auth` — indistinguishable from a wrong password. Don't debug the password; it's the route |
| **`POST /setup` authenticates unconditionally** | `setup.mjs` runs `authenticateAdmin` *before* its world-active test and only gates the package *actions* on it. So posting the admin password to `/setup` elevates the session and then 403s the action. The 403 is the expected outcome, not an error. Safe only because the body carries neither `shutdown` nor `editWorld` — both are handled above that 403 |
| **The session cookie ignores ports** | Foundry issues `session=…; HttpOnly; SameSite=Strict`, so no page script can install it. But cookies are scoped to a *host*, not host:port (RFC 6265 §8.5) — so a one-shot local server on an ephemeral port can `Set-Cookie` and 302 the browser into `/game`, and Foundry on :30000 accepts it |

The world list is read from each `world.json` on disk (Foundry's own list comes from a
`/setup` socket handler that returns `{}` once a world is active). **`lastPlayed` in those
files is a raw JavaScript `Date.toString()`, not ISO** — sort it as a string and you order by
weekday name, which on a two-world list looks entirely plausible and is wrong.

The user list comes from `getJoinData` over socket.io's polling transport, because Foundry
serves exactly one HTTP API route (`/api/status`) and it carries neither users nor the admin
flag. That is why no GM id is pinned in config — rebuild the world and the login still finds
the Gamemaster — and it is also how `FoundryAdmin.authenticate()` verifies an admin handshake
while a world is up (`isAdmin` in the same payload).

Rationale in full: [`scripts/foundry/ops/login.py`](../../scripts/foundry/ops/login.py) for
the browser handoff, [`scripts/foundry/update/admin.py`](../../scripts/foundry/update/admin.py)
for the Foundry client. Security review: §6.

---

## 3. The OneDrive contract — two machines, one cloud

> Source: [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) (policy — read its module
> docstring), [`storage.py`](../../scripts/foundry/storage.py) (rclone or folder),
> [`host.py`](../../scripts/foundry/host.py) (which machine, which role),
> [`boot.py`](../../scripts/foundry/boot.py) (the boot choice). Design history:
> [`../plans/rclone-two-hosts-2026-10.md`](../plans/rclone-two-hosts-2026-10.md).

**One direction each way, and the two never touch the same files.** That single rule is the whole
design; everything below follows from it.

Two machines share the cloud folder: the **primary** (the Mac — where you play, where the tunnel
and the Saturday updater run) and an **alt** (BOSS, Foundry in WSL — for building addons and
testing in parallel). Both reach `OneDrive/DnD/foundry` through **rclone** (an `onedrive:` remote),
or, on a Mac with no remote, through the OneDrive app's folder. There is no lease or lock: each
machine archives its own world, tagged with its name, and prunes only its own.

```
OneDrive/DnD/foundry/
  README.txt        explains itself to whoever opens it in six months
  assets/           YOU put zips here      → flows DOWN into Data/assets/
  world-backups/    automatic, per host    ← flows UP on every stop and start
                      world-<UTC stamp>-fvtt<ver>-<host>.tar.gz          (2026-10-11 on)
                      world-<stamp>[-fvtt<ver>].tar.gz                   untagged, older — nobody's
                      world-…-<host>.safety.tar.gz                       what a restore replaced
                      *.partial                                          an upload in progress, never a snapshot
  major-release/    automatic, never pruned — the last snapshot each host took on a Foundry generation it left
  system-backup/    automatic, shared      ← one tar per system version, last 3 kept
```

| Target | Direction | What it does |
| ------ | --------- | ------------ |
| `make foundry-boot` | ⬇ maybe | **The boot choice** (below). Part of `vtt-up` and `foundry-up`; `FROM=latest\|local\|<name>` decides without asking |
| `make foundry-assets` | ⬇ down | Unpacks any new `<kind>-<nn>.zip` into `Data/assets/<kind>/<kind>-<nn>/`. Tracked in `foundry/assets-manifest.json` (sha256, bytes, mtime); a zip whose size and mtime match is skipped **without a download** |
| `make foundry-backup` | ⬆ up | Tars `Data/worlds` + `Config` + `Data/modules` (**~2.5–3.3 GB** — `Data/modules` is ~2.7 GB of premium map art; the first rclone snapshot, 2026-10-11, was 3.24 GB) in `FOUNDRY_DATA/.pentaryn-tmp/`, uploads it as `<name>.partial`, renames, size-checks. Keeps **10 per host** (plus that host's last 3 restore `.safety` copies, counted apart); a snapshot within 5 days of this host's newest **replaces** it; skips when the local tree digest is unchanged |
| `make foundry-backup-safe` | ⬆ up | Same, `--if-stopped` — the lifecycle variant |
| `make foundry-restore` | manual | No `SNAP` → lists every host's snapshots (name, host, UTC time, version, size). `SNAP=<name>` (any host's, or `major-release/`) → download, **archive current state first**, clear, extract; demands you type `restore` |
| `make foundry-cloud` | — | Status: this host's background upload (in progress / pending / last result), storage (rclone/folder + root), host and role, what this world is based on, newest per host, untagged count |
| `make foundry-prune-untagged` | manual | Lists the untagged (pre-2026-10-11) snapshots and deletes them **only** on a typed `delete`. Nothing else ever deletes them |

Kinds are fixed: `tokens · maps · tiles · portraits · audio`. Anything else is refused by name.

### The boot choice — never silent, default latest

`make vtt-up` (and `foundry-up`, and `make login`) first asks one question, **only when** the
newest snapshot in `world-backups/` — from either machine — is newer than what this machine's
world is *based on*:

```
  ▸ cloud has a newer world snapshot than this machine's world:

      cloud    world-2026-10-11-030412-fvtt14.369-mac.tar.gz   mac   2026-10-11 03:04 UTC   14.369   3.1 GB
      local    based on world-2026-10-09-221500-fvtt14.369-boss.tar.gz   boss   2026-10-09 22:15 UTC
  …
  boot from [latest] or keep local?  (Enter = latest, l/latest, k/local, or a number)  >
```

- **Enter** downloads the newest (~3 GB), archives the local world first (as a `.safety` snapshot,
  unless it is unchanged since a snapshot still in the cloud, or one the restored snapshot's
  lineage contains), clears, extracts. The machine's own `Config/options.json`
  (its `dataPath`), `admin.txt` and `license.json` are **kept** across every restore.
- **`k`** boots the local world and remembers the answer until a snapshot newer than the one you
  declined appears — by its listing mtime, so if the declined one is later coalesced or pruned
  away, an older snapshot left behind does not ask again.
- **Diverged** — the newer snapshot's lineage does not contain what this world is based on (the
  other machine started from an older world, or kept local and edited). It is still offered, but
  the prompt says `diverged — does not contain <based-on>` and **Enter keeps local**; `l` (or
  `FROM=latest`) takes it, archiving this world first. Each snapshot's lineage is a tiny
  `world-backups/<name>.parent` sidecar written before the upload completes; a snapshot without
  one (untagged, legacy) is treated as newer, as before. "Diverged" needs proof: a world backed
  up with no based-on record (lost state file, first run) writes `"ancestors": null`, and every
  chain carries `origin_before` — the mtime of its unknown root. A based-on snapshot at or before
  that edge reads "cannot tell", which counts as newer (Enter = latest), never diverged.
- **No terminal** (launchd, an agent, `ssh boss 'make …'` without `-t`): never restores. It boots
  local and prints one line: `▸ boot: cloud snapshot … is newer than this world …; booting LOCAL.
  To use it: make foundry-up FROM=latest   (or: make foundry-restore SNAP=…)`. The snapshot is
  remembered as **pending** in the state file, so the backup that follows (which makes the local
  world the newest) cannot bury it: every later boot repeats the notice, and the next boot at a
  terminal asks, until it is answered or restored.
- **Cloud unreachable** (no rclone, no network, a 60 s listing timeout): boots local with a warning
  and exits 0, and so do the pre-launch backup and the asset step after it — `make vtt-up` never
  blocks on the cloud. Only a bad `FROM=<name>` or a failed chosen restore stops the start.

"Based on" is `FOUNDRY_DATA/pentaryn-boot.json` (beside `Config/`, outside every snapshot): which
snapshot this world came from, its listing mtime, and the tree digest. It is written by this
machine's own backup, by every restore, and by a `k` answer; the no-terminal notice records only
the pending snapshot, never an answer.
"Newer" compares the **listing mtime**, never the name's stamp across machines. So the alt is asked
about the primary's newest; the primary is asked only when the alt has actually uploaded since.
With **no record** (first run, or the file is missing or unreadable) the only clock is the local
files: the newest snapshot is offered as newer only if it is later than the newest file under
`worlds/`, `Config/` and `modules/`. Otherwise the prompt says it **cannot tell which is newer** and
Enter keeps local (`l` still takes it). The legacy `world-backups/.last-digest` marker is retired
only by the primary's own backup, so the alt backing up first never stops the Mac adopting it.
Restore `.safety` copies and `major-release/` are never offered as "newer".

### The rules that keep it safe

- **Restore downloads first.** Nothing local is touched until the chosen bytes are on this disk; a
  failed download changes nothing. Then the safety backup, then clear, then extract — so neither
  coalescing nor pruning can delete the snapshot being restored.
- **Each host prunes, coalesces and promotes only its own snapshots.** The other machine's
  snapshot from yesterday is never replaced by this one. Untagged snapshots belong to nobody.
- **The digest is local.** Neither host skips a backup because the other uploaded identical bytes;
  after a restore, this host's next backup digest-skips instead of re-uploading 3 GB.
- **A `.partial` is never a snapshot.** Uploads land as `<name>.partial` and are renamed when
  complete; one older than 24 h is swept as a crash leftover (younger ones may be the other
  machine mid-upload). A failed upload leaves the tar **queued** in `FOUNDRY_DATA/.pentaryn-tmp/`
  and the next backup retries it before anything else. The temp dir needs ~2× a snapshot free;
  backup checks.
- **The based-on record moves only when an upload completes**, background or not.
- **Packs are append-only.** Never edit a published zip; add `<kind>-<nn+1>.zip`. A zip whose hash
  changed after extraction is **refused with a message**, not silently re-applied.
- **One folder per pack**, so cross-pack collisions are structurally impossible.
- **Filenames kebab-case at extraction only** — never rename inside an extracted pack.
- **Backup and restore hard-refuse while Foundry is running.** (The background *upload* of an
  already-built tar does not care: it reads only the tar.)
- **Art never goes in git.** OneDrive holds the bytes; `foundry/assets-manifest.json` holds the
  inventory and is committed.
- **Only the primary runs the tunnel and the updater.** On the alt `tunnel-up` prints why and
  exits 0 (`vtt-up` still brings Foundry up); the updater aborts. `PENTARYN_ROLE_OVERRIDE=primary`
  passes both, deliberately. Nothing else is gated.

### Why the world is copied, never synced

`Data/worlds/<world>/data/` is a live LevelDB. A sync daemon reads `.ldb` files mid-compaction and
uploads inconsistent snapshots, then resolves conflicts by writing *conflict copies* into the
directory — junk inside a live database. LevelDB's single-writer `LOCK` means neither side detects
the other, **so nothing ever errors**; the world simply fails to open, weeks later. A *stopped*
database copies consistently every time. That is the entire trick, and why a restore only ever
happens before Foundry starts.

Measured on this machine: a read through `~/Library/CloudStorage` **hung for 30 s** while the
OneDrive daemon was busy, against **6 ms** direct. rclone talks to the OneDrive API instead and
never touches the File Provider; assets are still unpacked to local disk, never read in place.

### Which machine, which role — `~/.config/pentaryn/env`

Every value has a default; the real environment wins over the file. The full key list, with
defaults, is [`scripts/foundry/host.env.example`](../../scripts/foundry/host.env.example).

| Key | Mac default | Notes |
| --- | --- | --- |
| `PENTARYN_HOST` | `mac` | The tag in snapshot names. BOSS: `boss` |
| `PENTARYN_PRIMARY_HOST` | `mac` | Must agree on both machines. Switching primary = edit it on both |
| `PENTARYN_CLOUD` | rclone `onedrive:DnD/foundry` if that remote exists, else the OneDrive app folder | `mac-folder` forces the folder; a path → that folder |
| `FOUNDRY_DATA` | `~/Library/Application Support/FoundryVTT` | The **root** (Config/ Data/ Logs/), not `Data/` |
| `FOUNDRY_APP_ROOT` | `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app` | |
| `PENTARYN_KEEP_SNAPSHOTS` | 10 | This host's retention |

The Mac needs no file at all. `python -m scripts.foundry.host show` prints what it resolved.

### Setting up rclone on the Mac (one time)

Until this is done the Mac keeps using the OneDrive app's folder, exactly as before; the day it
is done, the Mac switches to rclone on its own (`make foundry-cloud` shows which).

**Done on the Mac 2026-10-11:** `make foundry-cloud` reads `rclone onedrive:DnD/foundry`, and the
first Mac snapshot over rclone is `world-2026-10-11-212143-fvtt14.369-mac.tar.gz`. BOSS's
`onedrive:` remote works too; BOSS's go-live is still to do (rclone plan §15).

1. `brew install rclone` (already present: `/opt/homebrew/bin/rclone`).
2. `rclone config`, then:
   - `n` — new remote · name: **`onedrive`** (the code looks for exactly this name)
   - storage: **Microsoft OneDrive** (`onedrive`)
   - `client_id` and `client_secret`: **leave blank** (Enter)
   - region: **`global`** (Microsoft Cloud Global)
   - edit advanced config: **`n`**
   - use web browser to automatically authenticate: **`y`** — sign in with the Microsoft account
     that owns the `DnD` folder, in the browser window it opens
   - type of connection: **OneDrive Personal or Business** · pick the one drive it lists
   - "Drive OK?" **`y`** · keep this remote: **`y`** · `q` to quit
3. Check it reaches the folder: `rclone lsd onedrive:DnD/foundry` should list `assets`,
   `major-release`, `system-backup`, `world-backups`.
4. `make foundry-cloud` → the first line reads `cloud rclone onedrive:DnD/foundry`.

rclone stores its token in its own config (`rclone config file` says where). **Never** copy that
file into the repo, a log, the env file or a chat; nothing here reads it or passes `--config`.
If a call fails with an auth error, `rclone config reconnect onedrive:` re-runs the browser login.

---

## 4. Secrets

`FOUNDRY_VTT_LICENSE_KEY` lives in **Infisical**. It is not in this repo, not in a `.env`, not in
the Makefile, and must never be.

```python
from scripts.foundry.license_key import foundry_license_key, LicenseKeyUnavailable
key = foundry_license_key()   # env var if injected, else the infisical CLI
```

| Rule | |
| ---- | - |
| Never write the value to a file, a log, or stdout | — |
| Never pass it as a command-line argument | visible in `ps` |
| Read at point of use | don't cache it in a module global |
| Infisical auth failure | **stop** and tell Joe to run `infisical login`. Do **not** prompt for the value, do **not** hardcode it |

`make foundry-check` verifies retrieval and prints length and format only. `make foundry-key`
copies to the clipboard for Foundry's **first-run activation screen** — the only time the key is
needed; Foundry stores it afterwards and `make vtt-up` never asks again. Clear the clipboard after
with `pbcopy </dev/null`.

Full detail: [`scripts/foundry/README.md`](../../scripts/foundry/README.md).

---

## 5. Modules

**21 active** (verified live 2026-08-15, `game.modules` on the running world — v14.365 / dnd5e
5.3.3). Grouped by purpose:

**Ours** — hand-built in this repo under `foundry/module/`, copied in by a make target:

| id | version | Source |
| -- | ------- | ------ |
| `pentaryn-importer` | 1.0.0 | `make foundry-sync` copies it in |
| `pentaryn-walls` | 0.2.0 | `make foundry-walls-sync` copies it in ([README](../../foundry/module/pentaryn-walls/README.md)) |
| `pentaryn-ties` | 0.1.0 | `make foundry-ties-sync` copies it in. Directed NPC relationships on actor flags: Ties tab on actor sheets, GM-only canvas overlay on a rebindable keybinding (default `8`). [README](../../foundry/module/pentaryn-ties/README.md) · [design doc](../plans/foundry-npc-ties.md) |

**The bridge:**

| id | version | Source |
| -- | ------- | ------ |
| `foundry-mcp-bridge` | 0.8.3 | Upstream, installed via Setup screen. Pinned — see [D1](../plans/foundry-content-pipeline.md) |

**Combat HUD** — Argon, a per-character action bar for guest players:

| id | version | Source |
| -- | ------- | ------ |
| `enhancedcombathud` | 5.0.1 | Argon – Combat HUD (CORE). GitHub release zip, filesystem drop — path B below |
| `enhancedcombathud-dnd5e` | 5.2.2 | Argon – Combat HUD (DND5E). Same drop. Needs `dnd5e ≥ 5.0.0` and `enhancedcombathud ≥ 3.0.4` |

Argon switches itself on only when a combat reaches round 1, turn 0 (`openCombatStart`), and
`alwaysOn` is a client setting that defaults to off. So a player who logs in **after** combat
has started gets no HUD on select. They click the Argon toggle in the token scene controls, or
turn on *Always On* in their client settings. This is upstream design and was the same on dnd5e
5.3.3 (checked on 6.0.6, 2026-10-10).

**GM view:**

| id | version | Source |
| -- | ------- | ------ |
| `gm-vision` | 2.0.5 | dev7355608/gm-vision GitHub release zip, filesystem drop — path B. **Ctrl+G** toggles a GM-only lit view (darkness, fog, hidden tokens); players unaffected. No dependencies. Enabled in `pentaryn` only (2026-10-04) |

**Multi-level rendering stack** — why the Spider's Tear Opera House works as a genuine
three-level scene (§9):

| id | version | Source |
| -- | ------- | ------ |
| `levels` | 7.0.3 | Setup screen |
| `wall-height` | 7.0.8 | Setup screen |
| `betterroofs` | 4.0.2 | Setup screen |

**Premium content & map packs** — bought from the Foundry store / DriveThruRPG:

| id | version | Source |
| -- | ------- | ------ |
| `pentaryn-seafoot-maps` | 1.0.0 | Seafoot Games maps (DriveThruRPG), packaged as a local module. **687-scene compendium with walls/lighting/sounds authored — import the packed Scene, never the raw `.jpg` (§8)** |
| `eledryll-maps-castle-life-bundle-1` | 1.14.3 | Foundry store, Setup screen |
| `eledryll-spiders-tear-opera-house` | 1.1.0 | Foundry store, Setup screen. Ships its own pre-built three-level scene (§8) |
| `mad-endlesswiz` | 14.1.0 | Foundry store, Setup screen |
| `mad-endlesswiz2` | 14.1.0 | Foundry store, Setup screen |
| `theripper-premium-hub` | 6.0.1 | Foundry store, Setup screen |
| `dnd-players-handbook` | 2.2.0 | Official PHB premium module, Foundry store, Setup screen |

**Infrastructure & dependencies** — pulled in by the above:

| id | version | Source |
| -- | ------- | ------ |
| `lib-wrapper` | 1.13.5.1 | Setup screen — library dependency of half the list |
| `scene-packer` | 2.8.12 | Setup screen — how the map packs deliver their compendium scenes |
| `monks-active-tiles` | 14.01 | Setup screen — tile triggers used by packed scenes |
| `tile-scroll` | 5.0.0 | Setup screen — animated tiles in the premium maps |
| `multi-token-edit` | 3.2.5 | Setup screen — mass placeable editing |

⚠ **This list drifts every time a map pack is bought.** Re-derive it in one `eval-js` call and
update this table + §1's count:

```js
game.modules.contents.filter(m => m.active).map(m => m.id + "@" + m.version).sort()
```

The Argon pair went in by filesystem drop, with `core.moduleConfiguration` pre-set to `true` for
both via the bridge's `eval-js`. Foundry scans `Data/modules` **only at server startup**, so a
module dropped while the server is up stays invisible until the next restart; after that restart
the pre-set flags mean they load enabled, no Manage Modules step needed.

Local modules are **copied, never symlinked** (D8) — a stale copy in `Data/modules/` is meant to be
a real, visible failure mode. Re-run the sync target after every change.

### 🔴 Module installation is not reachable from a running world — ever

**This is the finding to remember.** The MCP bridge is a client running *inside* a loaded world, and
Foundry gates package installation to the **Setup context with the world closed**. There is no tool,
no `eval-js` trick, and no API call that installs a module from inside a session.

Verified empirically on v14.365, `space-journey`, 2026-08-13:

| Probe | Result |
| ----- | ------ |
| `foundry.applications.setup` | `{}` — no keys |
| `typeof globalThis.Setup` | `"undefined"` |
| `GET /setup/packages` | **404** |
| `POST /setup` | **403** |
| `game.view` | `"game"` (not `"setup"`) |

Re-verify any time with one `eval-js` call:

```js
return { view: game.view, hasSetup: typeof globalThis.Setup !== "undefined",
         setupApps: Object.keys(foundry.applications.setup ?? {}),
         pkgs: (await fetch("/setup/packages")).status };
```

**So installing or updating always happens outside the running world — two paths:**

**A. Setup screen.** *Game Settings → Return to Setup → Add-on Modules → Install Module*, paste
the manifest URL. The only path that resolves dependencies and validates compatibility.
⚠ Use the **raw** manifest URL. A GitHub *blob* URL serves HTML and fails to install.

**B. Filesystem drop.** A Foundry module is just a directory under `Data/modules/<id>/` with a
`module.json` — this is exactly what `make foundry-sync`, `make foundry-walls-sync` and
`make foundry-ties-sync` do for our own modules, and how the Argon pair went in. An established idiom here, not a hack. For a
GitHub-released module:

1. Resolve version and download URL from the releases API:
   `https://api.github.com/repos/<owner>/<repo>/releases/latest` → the `module.zip` asset
   (Argon: `https://github.com/theripper93/<id>/releases/download/<ver>/module.zip`).
   ⚠ Don't try `https://foundryvtt.com/api/packages/<id>/` or
   `https://foundryvtt.com/_manifest/<id>/` — **both 404** (tried 2026-08-13).
2. Check `compatibility` and `relationships` in the fetched `module.json` **before** copying
   anything into place.
3. Unpack into `Data/modules/<id>/`.

⚠ **The tradeoff:** a drop skips Foundry's dependency resolution — *you* are the resolver.
`enhancedcombathud-dnd5e` declares `dnd5e ≥ 5.0.0` (`relationships.systems`) and
`enhancedcombathud ≥ 3.0.4` (`relationships.requires`); install the CORE module yourself or the
DND5E one is dead weight.

**Either path bounces Foundry:** the Setup screen requires the world closed, and a drop isn't
seen until the next restart (the `Data/modules` scan runs at server startup).

**After any install:** the module still has to be enabled per-world. Either *Game Settings →
Manage Modules* after relaunch, or pre-set `core.moduleConfiguration.<id> = true` — live via the
bridge's `eval-js` (as done for Argon), or offline in `data/settings` with Foundry stopped
(foundry-vtt.md's worked example; the offline `value` field is a **JSON string, not an object**).
A module on disk but not enabled is invisible, silently.

**Related boundary, same shape:** Foundry's client API has **no file-delete**. `FilePicker` exposes
`browse`, `upload`, `createDirectory`, `configurePath` — and nothing else. That is exactly why
`make foundry-import`, not the importer module, is what removes the staged `actors.json`
(`foundry/CONTRACT.md` §12). When something can't be done from inside the world, this is usually why.

---

## 6. The security gate

**While the tunnel is up, `Data/` is served over HTTP with no authentication.** Verified in the
installed v14 server (`dist/server/express.mjs`, re-read 2026-08-13): `express.static(paths.data)`
serves the entire Data directory; the only 403s are database internals (`.db`, `.ldb`,
`LOCK`, `MANIFEST-*`, `CURRENT`, `LOG*`) and `signature.json`. **`.json` files are served.**

So anything under `Data/` is downloadable by anyone who can reach `https://vtt.atjoseph.com` —
which is exactly your players, exactly while they're connected. Campaign notes never go under
`Data/`, and the staged `actors.json` must not linger there.

| Target | Does |
| ------ | ---- |
| `make foundry-clean-only` | Deletes the staged `actors.json`. No verification |
| `make foundry-clean` | Delete, then verify |
| `make foundry-verify` | **Probes the site root first**, then asserts `actors.json` returns 404 |

`make foundry-import` deletes the staged file on **all three** exit paths — answered, no terminal,
Ctrl-C — because a target whose whole job is "don't leave a public file lying around" must not have
an exit that leaves it lying around. Answering "n" only skips the 404 assertion.

**Why two probes, in that order:** a 404 from a *down* tunnel proves nothing. The gate has to
positively confirm the file is gone (D10), so it establishes the tunnel is up and only then requires
404. With the tunnel up, **only 404 passes** — a 403 (Cloudflare bot-challenging curl's UA), a 302
interstitial, a 5xx: none of them show what a player's browser would get.

Full Gate 2 detail: [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) Stage 2.

### 🔴 The edge blocks four paths — and `/join` is not one of them

`foundry/cloudflared/config.yml` 403s `^/(setup|auth|update|license)`, and its header claims
the result is that "administration is reachable only from the local port, by construction."
**That is not quite true, and the gap is in `/join`.** Measured through the live tunnel on
2026-08-22:

```
POST https://vtt.atjoseph.com/setup                        → 403   (blocked at the edge)
POST https://vtt.atjoseph.com/join {action: "shutdown",
                                    adminPassword: "wrong"} → 401  ERROR.InvalidAdminCredentials
```

That 401 came from Foundry, not Cloudflare — the request reached the server. `join.mjs`'s
`shutdown` branch calls `sessions.authenticateAdmin` with no world-active guard, so the admin
password is **guessable from the internet**, and a correct guess both deactivates the world
and leaves that remote session admin-flagged (which then unlocks `loginAs` on the same route).
Foundry ships no rate limiting — `express.mjs` and `sessions.mjs` contain no such thing.

**Closed on 14.369:** `join.mjs` no longer has a `shutdown` branch (the action is ignored,
200 `{}`); the graceful shutdown moved to `POST /setup {action:"worldShutdown"}`, which the
edge 403s. Re-measure through the tunnel before relying on that, and re-open this box if a
core rollback puts 14.367 back.

This predates `vtt-login` and is unrelated to it; `vtt-login` uses `/setup` over loopback.
What holds the line today is password entropy: 22 characters (`make foundry-admin-check`
prints the length, never the value), which is not brute-forceable. The ingress `path` is a
path regex and cannot see a POST body, so this cannot be fixed in `config.yml` — the options
are keeping the password long, or a Cloudflare rate-limiting rule on `/join`.

### What `vtt-login` does and does not expose

Reviewed 2026-08-22. Nothing it adds is reachable from outside:

- The handoff server binds **loopback only** on an ephemeral port, answers **one** request at
  a 128-bit nonce path, and is gone within 90 s. The tunnel never routes it.
- The admin password goes from Infisical/keychain straight into one loopback POST body. Never
  argv, never a file, never a log, never the browser.
- The browser receives a session id — and that session is **admin-flagged**, which a human
  logging in through the `/join` dropdown is not. It is `HttpOnly`, `SameSite=Strict`, scoped
  to `localhost`, and so can never be sent to `vtt.atjoseph.com`. Foundry offers no way to
  drop the flag while a world is active (`adminLogout` is behind the same `!game.world` gate),
  so this is inherent, not a shortcut. It expires with Foundry's own 24 h cookie lifetime.

---

## 7. Driving the world — MCP bridge

Per the golden rule in [`CLAUDE.md`](../../CLAUDE.md) / [`context/world/README.md`](../world/README.md): **when a request
maps to an MCP tool, use the tool — don't shell out to the underlying script.**

The `foundry` server is registered once, at project scope in `.mcp.json`, with
`FOUNDRY_CONNECTION_TYPE=websocket`. It's a stdio wrapper proxying to a singleton backend on TCP
`31414`, which hosts the WebSocket server on `31415`. A stale backend outlives its clients **by
design** — if tools go dead, look for an orphaned `backend.js` before anything else.

⚠ The macOS DMG installer writes a **second, invisible** registration into Claude Desktop's config
that `claude mcp list` will never show. Check both places if names conflict.

Tool families available (~40 tools; don't enumerate, just look):

| Family | Examples |
| ------ | -------- |
| Actors | `manage-actors`, `list-characters`, `get-character`, `dnd5e-create-npc`, ownership |
| Items | `manage-world-items`, `search-character-items`, `use-item` |
| Scenes & tokens | `list-scenes`, `switch-scene`, `move-token`, `toggle-token-condition` |
| Compendium | `search-compendium`, `get-compendium-entry-full`, `create-actor-from-compendium` |
| Journals & quests | `list-journals`, `search-journals`, `create-quest-journal`, `link-quest-to-npc` |
| Rolls | `request-player-rolls` |
| World | `get-world-info`, `get-current-scene`, `get-available-conditions` |

**`eval-js` is the escape hatch** for things with no purpose-built tool — it runs **as the GM inside
the live world**, `game`/`canvas`/`ui` in scope, top-level `await` works, and every call is logged
with its stated purpose so recurring uses can be promoted into real tools. Reach for a real tool
first: `eval-js` has no schema and no validation.

⚠ `allowWriteOperations` is **not** a safety net on the generic write path. `manage-actors` and
`manage-world-items` check only "is the connected user a GM". The toggle gates compendium-based
creation, journal creation and scene/token ops only.

---

## 8. Never build a map scene from the raw image — import the packed Scene

**`pentaryn-seafoot-maps` ships a compendium of 687 fully-built Scene documents** (`Seafoot Maps`,
`pentaryn-seafoot-maps.scenes`) with **walls, ambient sounds and lighting already authored**. The
`maps/` directory next to it holds the same art as bare `.jpg` files.

Pointing a new scene at the `.jpg` gets you a background and **nothing else** — no walls, no sounds,
no lighting. It looks finished and it is not. Measured on the same three maps:

| Map | From the `.jpg` | From the compendium |
| --- | --------------- | ------------------- |
| Catacombs of Silence | 0 walls | **1463 walls, 39 sounds** |
| Fairfield Market | 0 walls | **160 walls, 2 sounds** |
| Cliff Trade Road | 0 walls | **21 walls, 11 sounds** |

**Clicking rather than scripting is no safer** — it's the same trap with a mouse. What matters is
*what you pick*, not how:

| You pick | You get |
| -------- | ------- |
| The `.jpg` in the FilePicker (Scene Config → Background Image) | Background only. No walls, no sounds |
| **Compendium tab → `Seafoot Maps` → drag the scene out** (or right-click → Import) | Everything |

**Coverage, measured 2026-08-15:** 674 image files against 687 packed scenes, and of 60 packed
scenes sampled, **none had zero walls**. Treat the compendium as complete. About a dozen images have
no packed counterpart — `spider-forest-and-infested-tower` (×3), `desert-campsite-and-ruins`
(+night), `snowy-campsite-and-ruins` (+night), `abandoned-mountain-lair`,
`adventurers-manor-upper-floor`, `kings-forest-ruins`, `three-kings-tomb-desert`,
`undercity-cult-lair` — those are the only ones that would need hand-walling.

**Import the packed document instead:**

```js
const pack = game.packs.get("pentaryn-seafoot-maps.scenes");
const idx  = await pack.getIndex();
const doc  = await pack.getDocument(idx.find(e => e.name === "Catacombs of Silence")._id);
const data = doc.toObject();
delete data._id;
Object.assign(data, { name: "1. …", folder: folderId, navigation: true, navName: "…" });
data.tokens = [];                     // drop the pack's demo tokens
const scene = await Scene.create(data);
await scene.update({ thumb: (await scene.createThumbnail()).thumb });
```

This also sets width/height/grid correctly for you — no measuring, and no getting the 30×40
double-height maps wrong.

**To recover a scene already built the wrong way**, re-create it from the pack and replay the token
placements in *grid* coordinates (`(t.x - dimensions.sceneX) / grid.size`), because the padding
offset differs between the two scenes. Then Recycle the original.

Other map modules do the same thing — `eledryll-spiders-tear-opera-house` ships its own pre-built
three-level scene with 720 walls and 160 lights. **Check for a Scene pack before touching an image.**

---

## 9. Creating scenes on v14 — the background moved onto a level

**`Scene#background` no longer exists in the v14.365 schema.** It survives only as a read-side
compatibility shim that reflects the initial level. The real storage is:

```
scene.levels[0].background.src
```

`levels` is a **plain schema array**, not an embedded collection — `updateEmbeddedDocuments("SceneLevel", …)`
throws *"SceneLevel is not a valid embedded Document within the Scene Document."*

The failure mode is nasty because **nothing errors.** `Scene.create({background: {src}})`,
`scene.update({"background.src": …})` and even the in-memory `updateSource()` all accept the write,
return success, and leave `src` as `null`. The scene renders blank. Verified on v14.365, 2026-08-14.

**The pattern that works** — create, then rewrite the levels array:

```js
const s = await Scene.create({
  name, folder, width: 4500, height: 3000, padding: 0.25,
  grid: { type: 1, size: 150, distance: 5, units: "ft" }
});
const levels = s.toObject().levels;      // one "defaultLevel0000" entry exists already
levels[0].name = "<level name>";
levels[0].background.src = "modules/<pack>/maps/<file>.jpg";
await s.update({ levels });
await s.update({ thumb: (await s.createThumbnail()).thumb });   // otherwise no nav-bar thumbnail
```

### 🔴 Write `levels` **before** you place tokens

`scene.update({levels})` replaces the level *document*, and every token carries a `level` reference
to the one it was placed on. Rewrite `levels` after placing tokens and they all point at a level id
that no longer exists. Nothing complains until you next move one, and then the error names nothing
useful:

```
Error: level must exist
  at #cleanAndValiateMovementWaypoints
```

v14 routes every token x/y change through a movement pipeline that resolves the level first, so
**orphaned tokens render fine and are simply unmovable.** There is no repair path — delete and
recreate them:

```js
const byName = {}; for (const t of s.tokens) byName[t.name] = t.actorId;
await s.deleteEmbeddedDocuments("Token", s.tokens.map(t => t.id));
// …then re-create from actor.getTokenDocument({x, y}) at the new positions
```

Audit any scene with `s.tokens.filter(t => t.level && t.level !== s.toObject().levels[0]._id)`.

Cloning an existing scene (`scene.clone({...}, {save: true})`) also carries the background across,
since it copies the whole `levels` array — but the clone's src then can't be *changed* by the same
route, so build fresh and write `levels` rather than clone-and-retarget.

Multi-floor maps are the reason the field moved: `1. Spiders Tear Opera House - Night` legitimately
has three levels. Anything that walks scenes should read `levels[]`, not `background`.

### Two related coordinate facts

- **`list-scenes` reports *padded* dimensions.** A 4500×3000 map shows as 6900×4500 — that's
  `width + 2×padding` with the padding rounded up to a whole grid square (0.25 × 4500 = 1125 → 1200).
  The Seafoot 150-dpi maps are all 4500×3000 with 150 px squares = a 30×20 grid.
- **Token x/y include the padding offset.** Place from `scene.dimensions.sceneX/sceneY`, not from 0 —
  the map's top-left corner is at (1200, 750) on a standard Seafoot scene.

---

## Gotchas — what will actually bite

| Gotcha | Shape of the failure |
| ------ | -------------------- |
| **Syncing a live world silently corrupts it** | LevelDB single-writer `LOCK` means no side detects the other. Nothing errors. The world fails to open **weeks later**. This is why only stopped databases are copied, and why a restore happens only at boot, before Foundry starts |
| **BOSS and the Mac both played since the last sync** | Allowed — there is no lock. Each archived its own world; the next boot on either asks about the other's newer snapshot. Nothing is lost (a restore archives local first), but nothing merges either: pick one |
| **`Data/` is public with no auth while the tunnel is up** | `.json` files are served. `make foundry-clean` is a required step, not tidying |
| **`POST /auth` "rejects" a correct admin password while a world is up** | It never checked it. `auth.mjs` short-circuits on `!game.world`. Use `/setup`, which authenticates unconditionally — §2's login box |
| **A scripted POST gets 400 "The request could not be processed." (14.369+)** | Core's same-origin guard: any POST without a matching `Origin`/`Sec-Fetch-Site` is refused before the route runs. `FoundryAdmin` sends `Origin: http://127.0.0.1:30000`; a hand-rolled `curl` must add `-H "Origin: http://127.0.0.1:30000"`. Before the fix it surfaced as "the configured password … differ" from `make vtt-login` |
| **Never turn on Setup → Configuration → SSL Certificate** | 14.369 can serve HTTPS natively. Cloudflare already terminates TLS; switching it on breaks every `http://127.0.0.1:30000` caller — the updater, the smoke test, `vtt-login` — and the tunnel's origin config |
| **A second Gamemaster login does not kick the first (14.369)** | Measured 2026-10-10: the smoke test logged in as Gamemaster from its own Chrome while the bridge tab was logged in as Gamemaster; the bridge stayed connected and `eval-js` kept answering. `loginAs` only logs out *its own* session (`sessions.logoutWorld`); core deactivates other sessions only on a password change |
| **A down tunnel makes every 404 check pass** | Always probe the site root first. `make foundry-verify` does; a hand-rolled `curl` won't |
| **Module install can't be driven from inside the world** | Not a missing tool — a Foundry architecture boundary. `foundry.applications.setup` is `{}` inside a world. The filesystem drop is scriptable from the shell; the Setup screen needs a human |
| **A dropped module is invisible until restart + enable** | The `Data/modules` scan runs at server startup, and enablement is per-world (`core.moduleConfiguration` / Manage Modules). Fails by doing nothing at all |
| **Filesystem module drop skips dependency resolution** | You are the resolver — `enhancedcombathud-dnd5e` needs its CORE module. Check `relationships` in `module.json` before copying |
| **The Makefile still says `ardenhaven`** | Live world is `space-journey`. `make foundry-import` stages into the wrong world and the 404 gate passes for the wrong reason — every light green, nothing imported (§1's red box) |
| **`make foundry-backup` refuses while running** | By design. Not a bug — `make vtt-down` first. `foundry-backup-safe` skips silently instead, which is only correct in the lifecycle chain |
| **A republished asset zip is refused** | Packs are append-only. Bump the number; don't edit in place |
| **A scene built from the raw map `.jpg` has no walls** | The art lives in `maps/` *and* in a 687-scene compendium with walls/sounds/lights authored. Point at the image and you silently get a background and nothing else. See §8 |
| **`scene.background.src` writes vanish on v14** | `background` is not in the v14 Scene schema — it's a v13 read shim. Creates and updates are dropped **silently**, no error, and the scene renders blank. See §9 |
| **Orphaned MCP backend on :31414** | Outlives its clients by design. Symptom is tools that hang or return stale state |
| **Stale module copy in `Data/modules/`** | Copy, not symlink, is deliberate — but it means "I changed the source and nothing happened" is a real outcome. Re-run the sync target |
| **A test player tab ignores clicks and hovers** | Chrome pauses rendering and the ticker in a hidden or unfocused tab, and the extension's CDP mouse events often never reach Foundry (`canvas.mousePosition` stays stale). Take a screenshot to wake the tab, or dispatch `PointerEvent`/`MouseEvent('dblclick')` on `canvas.app.view` at `canvas.clientCoordinatesFromCanvas(...)`. Log test players in via `127.0.0.1:30000` (`#join-game-form`) so their session doesn't collide with the GM's on `localhost` |
| **Closing Chrome kills the GM bridge** | `eval-js` and the other `foundry` tools go dead. Reopen Chrome, then `make vtt-login WORLD=<id>` |
| **A player test writes real knowledge** | An inspect from a test login rolls on the GM client and writes `beliefs`/`granted` flags plus chat cards. Snapshot first; `unsetFlag` and delete the messages after |
| **`~/Library/CloudStorage` reads can hang 30 s** | The OneDrive File Provider daemon, not the path. Never read assets through it at runtime. rclone (§3) avoids the daemon entirely |
| **A 3 GB snapshot needs ~6 GB free locally** | The tar is built in `FOUNDRY_DATA/.pentaryn-tmp/` before upload; a restore downloads there first. Backup checks and refuses with the numbers |

---

## Related

- [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) — the content pipeline: decisions D1–D10, actor generation, importer module, Gates 0–4
- [`foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md) · [`pentaryn-walls` README](../../foundry/module/pentaryn-walls/README.md)
- [`foundry-npc-ties.md`](../plans/foundry-npc-ties.md) · [`pentaryn-ties` README](../../foundry/module/pentaryn-ties/README.md)
- [`foundry-mcp-fork.md`](../plans/foundry-mcp-fork.md) — bridge fork design (history); operating the fork: [`mcp-fork.md`](mcp-fork.md)
- [`scripts/foundry/README.md`](../../scripts/foundry/README.md) — license key, make-target table
- [`foundry/CONTRACT.md`](../../foundry/CONTRACT.md) — the `actors.json` generator ⇄ importer contract (§12 for who deletes the staged file)
- [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) — the OneDrive implementation; its docstring is the rationale
- [`rclone-two-hosts-2026-10.md`](../plans/rclone-two-hosts-2026-10.md) — the two-host design (history) and the BOSS hand-off
