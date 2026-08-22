---
created: 2026-08-13
last-modified: 2026-08-15
tags: ["#playbook", "#foundry", "#vtt", "#ops", "#onedrive", "#secrets"]
status: active
---

# Foundry VTT — Operations

**Read this when:** running Foundry day to day — starting or stopping the server and tunnel, OneDrive sync, the license key, installing a module, or checking what is exposed publicly.
**Not this file:** building content programmatically → [`../plans/foundry-content-pipeline.md`](../plans/foundry-content-pipeline.md) · the unattended updater → [`automated-updates.md`](automated-updates.md)

> Running the thing. Starting and stopping the server and the tunnel, keeping OneDrive
> and local disk in their lanes, getting the license key without leaking it, installing
> modules, and not leaving campaign files hanging on a public URL.

**Four Foundry playbooks — open the right one.**

| You want to… | Playbook |
| ------------ | -------- |
| Start/stop the server, the tunnel, sync assets, restore a world, install a module, check what's exposed | **this one** |
| Build world *content* — actor generation from `actions.jsonl`, the importer module, the write paths that fail silently, Gates 0–4 | [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) |
| Complete hand-drawn walls | [`foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md) |
| Extend the MCP bridge's tool surface | [`foundry-mcp-fork.md`](../plans/foundry-mcp-fork.md) — design only |

Where this one and `foundry-vtt.md` overlap — the actors import pipeline and its Gate 2 — this playbook covers the
*operational* half (what deletes the staged file, what proves it's gone) and links out for the rest.

---

## I want to X → do Y

| I want to… | Do |
| ---------- | -- |
| Play tonight | `make vtt-up` → players at <https://vtt.atjoseph.com> → `make vtt-down` after |
| Know if anything's running | `make vtt` — Foundry, tunnel pid, and public reachability, three separate probes |
| Add art (tokens/maps/tiles/portraits/audio) | Drop `<kind>-<nn>.zip` in `OneDrive/DnD/foundry/assets/`, then `make foundry-assets` (or just `make vtt-up`) |
| Snapshot the world right now | `make vtt-down` first, then `make foundry-backup` — it **refuses** while the server is up |
| Roll back a broken world | `make foundry-restore` to list, `make foundry-restore SNAP=<name>` to do it. Never automatic — see §3 |
| See what's in the cloud store | `make foundry-cloud` |
| Install or update a module | Setup screen (resolves dependencies) **or** unzip the release into `Data/modules/<id>/` and restart — §5. Never from inside a running world |
| Push a local module to Foundry | `make foundry-sync` (importer) · `make foundry-walls-sync` (walls) · `make foundry-ties-sync` (ties) |
| Import actors | [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) Stages 1–2, then `make foundry-import` (🔴 read §1's red box first — it stages into the wrong world today) |
| Prove nothing's exposed | `make foundry-verify` |
| Check the license key resolves | `make foundry-check` — prints length and format, never the value |
| First-run activation only | `make foundry-key` → pastes to clipboard → `pbcopy </dev/null` after |
| Debug a dead tunnel | `make tunnel-logs` |

---

## 1. Topology

Foundry is a **desktop app on this Mac**. There is no server, no container, no cloud host.
Players reach it through a Cloudflare tunnel that exists only while you're running.

```
players ──https──▶ vtt.atjoseph.com ──cloudflared (named tunnel "ardenhaven")──▶ localhost:30000
                                                                                     │
                                          ~/Library/Application Support/FoundryVTT/  │
                                            Config/  Data/  Logs/  ◀─────────────────┘
                                                     ├── worlds/   space-journey · ardenhaven
                                                     ├── modules/  21 (see §5)
                                                     ├── systems/  dnd5e 5.3.3
                                                     └── assets/   maps · tokens · splash
```

| | |
| --- | --- |
| App | `Foundry Virtual Tabletop` in `/Applications` — launched via `open -a` |
| Local URL | <http://localhost:30000> |
| Public URL | <https://vtt.atjoseph.com> |
| Tunnel | `cloudflared`, named tunnel `ardenhaven`, pidfile `.run/cloudflared.pid`, log `.run/cloudflared.log` (both gitignored) |
| Data root | `~/Library/Application Support/FoundryVTT/Data` |
| Core | **v14.365** |
| System | **dnd5e 5.3.3** |
| Live world | **`space-journey`** (verified live 2026-08-13) |

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
`space-journey`, and three things make a repeat visible rather than silent:

* every pipeline run prints `▸ target world: <name>` before it copies anything;
* a missing world directory is a hard stop that lists the worlds actually on disk —
  `mkdir -p` would otherwise invent `worlds/typo/` and everything downstream would
  look like it worked;
* the staged path and the probed URL are asserted to name the same world, in
  `scripts/tests/test_foundry_ops.py`.

Override for a one-off with `make foundry-import WORLD=ardenhaven`. Both worlds still
exist on disk, so "the directory exists" alone can't catch a wrong-but-real name — the
printed line is what you check.

*(The **tunnel** is also named `ardenhaven`. That one is cosmetic and fine.)*

---

## 2. Lifecycle — and why the order is the order

```
make vtt-up      foundry-backup-safe → foundry-assets → foundry-up → tunnel-up
make vtt-down    tunnel-down → foundry-down → foundry-backup REASON=shutdown
make vtt         status only (alias: vtt-status)
```

The order is not arbitrary. Each step needs the previous one's state:

| # | Step | Why here |
| - | ---- | -------- |
| 1 | `foundry-backup-safe` | A LevelDB world copies consistently **only while stopped**. Snapshotting on *start* as well as stop is what catches a crash or force-quit that skipped the shutdown hook. `-safe` = `--if-stopped`: skips quietly if the server is already up, so `make vtt-up` on a live server doesn't abort before starting the tunnel |
| 2 | `foundry-assets` | New pack folders are on disk before anyone asks for them. A soft constraint — Foundry serves `Data/` per-request, so a later unpack would still be served — but unpacking while the server is down is free and cannot race |
| 3 | `foundry-up` | `open -a`, then polls `localhost:30000` for 40 s. The origin must answer before anything points at it |
| 4 | `tunnel-up` | **Last, because this is the step that makes `Data/` public** (§6). Refuses early if `~/.cloudflared/cert.pem` is missing or the named tunnel doesn't exist → `make tunnel-setup` |

`vtt-down` reverses it exactly: close the public surface first, stop the app, *then* snapshot —
because the snapshot is the step that requires "stopped".

| Target | Does |
| ------ | ---- |
| `make foundry-up` / `foundry-down` | App only. `foundry-down` is `osascript quit`, falling back to `pkill` |
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
| OneDrive sync | [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) |
| The weekly updater | [`scripts/foundry/update/`](../../scripts/foundry/update/) |

`python -m scripts.foundry.ops --help` lists the whole surface; `make help` lists the
handful worth remembering.

---

## 3. The OneDrive contract

> Source: [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) — read its module docstring.

**One direction each way, and the two never touch the same files.** That single rule is the whole
design; everything below follows from it.

```
OneDrive/DnD/foundry/
  README.txt        explains itself to whoever opens it in six months
  assets/           YOU put zips here      → flows DOWN into Data/assets/
  world-backups/    automatic, rolling     ← flows UP on every stop and start
  system-backup/    automatic, one copy    ← refreshed only on a version change
```

| Target | Direction | What it does |
| ------ | --------- | ------------ |
| `make foundry-assets` | ⬇ down | Unpacks any new `<kind>-<nn>.zip` into `Data/assets/<kind>/<kind>-<nn>/`. Hash-tracked in `foundry/assets-manifest.json`, extracted once, never overwritten |
| `make foundry-backup` | ⬆ up | Tars `Data/worlds` + `Config` + `Data/modules` (~4 MB) to a timestamped snapshot. Keeps the last 100; skips when the content digest is unchanged |
| `make foundry-backup-safe` | ⬆ up | Same, `--if-stopped` — the lifecycle variant |
| `make foundry-restore` | manual | No `SNAP` → lists snapshots. `SNAP=<name>` → restores, **archiving current state first**, and demands you type `restore` |
| `make foundry-cloud` | — | Status: packs, snapshots, whether the server is up |

Kinds are fixed: `tokens · maps · tiles · portraits · audio`. Anything else is refused by name.

### The rules that keep it safe

- **Packs are append-only.** Never edit a published zip; add `<kind>-<nn+1>.zip`. A zip whose hash
  changed after extraction is **refused with a message**, not silently re-applied.
- **One folder per pack**, so cross-pack collisions are structurally impossible and deleting a pack
  is one `rm -rf`.
- **Filenames kebab-case at extraction only** — before any Foundry document references them. Never
  rename inside an extracted pack; fix it in the next zip.
- **Backup and restore hard-refuse while Foundry is running.** *(`foundry-assets` does not check —
  it only ever creates new pack folders nothing references yet, so there's nothing to race.)*
- **Art never goes in git.** OneDrive holds the bytes; `foundry/assets-manifest.json` holds the
  inventory and is committed.

### 🔴 Restore is never automatic, and never will be

Not an omission — a deliberate refusal, for two independent reasons:

1. **Rolling backups make automatic restore *more* dangerous, not less.** With 100 snapshots on
   hand, "an older snapshot silently overwrote a newer world" becomes a thing that can happen a
   hundred different ways.
2. **You cannot let a sync client near a live world.** `Data/worlds/<world>/data/` is a live
   LevelDB. A sync daemon reads `.ldb` files mid-compaction and uploads inconsistent snapshots,
   then resolves conflicts by writing *conflict copies* into the directory — junk inside a live
   database. LevelDB's single-writer `LOCK` means neither side detects the other, **so nothing
   ever errors**; the world simply fails to open, weeks later, with no event to blame.

Measured on this machine: a read through `~/Library/CloudStorage` **hung for 30 s** while the
OneDrive daemon was busy, against **6 ms** direct. That is also why assets are unpacked to local
disk rather than symlinked — the stall is the File Provider daemon, not the symlink.

A *stopped* database copies consistently every time. That is the entire trick.

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
| `mad-endlesswiz2` | 13.0.1 | Foundry store, Setup screen |
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
| Scenes & tokens | `list-scenes`, `switch-scene`, `place-tokens`, `move-token`, `toggle-token-condition` |
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
| **Syncing a live world silently corrupts it** | LevelDB single-writer `LOCK` means no side detects the other. Nothing errors. The world fails to open **weeks later**. This is why restore is manual and why only stopped databases are copied |
| **`Data/` is public with no auth while the tunnel is up** | `.json` files are served. `make foundry-clean` is a required step, not tidying |
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
| **`~/Library/CloudStorage` reads can hang 30 s** | The OneDrive File Provider daemon, not the path. Never read assets through it at runtime |

---

## Related

- [`foundry-vtt.md`](../plans/foundry-content-pipeline.md) — the content pipeline: decisions D1–D10, actor generation, importer module, Gates 0–4
- [`foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md) · [`pentaryn-walls` README](../../foundry/module/pentaryn-walls/README.md)
- [`foundry-npc-ties.md`](../plans/foundry-npc-ties.md) · [`pentaryn-ties` README](../../foundry/module/pentaryn-ties/README.md)
- [`foundry-mcp-fork.md`](../plans/foundry-mcp-fork.md) — bridge fork design (not implemented)
- [`scripts/foundry/README.md`](../../scripts/foundry/README.md) — license key, make-target table
- [`foundry/CONTRACT.md`](../../foundry/CONTRACT.md) — the `actors.json` generator ⇄ importer contract (§12 for who deletes the staged file)
- [`scripts/foundry/cloud.py`](../../scripts/foundry/cloud.py) — the OneDrive implementation; its docstring is the rationale
