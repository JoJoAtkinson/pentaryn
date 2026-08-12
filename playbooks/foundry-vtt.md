---
created: 2026-08-10
last-modified: 2026-08-10
tags: ["#playbook", "#foundry", "#vtt", "#mcp", "#maps"]
status: draft
---

# Foundry VTT — Programmatic Campaign Pipeline

> Getting **Ardenhaven** into Foundry so that NPCs, scenes, walls and lights are built
> from the repo rather than by clicking. Written after establishing — the hard way —
> which write paths actually work on **v14.365 / dnd5e 5.3.3**, and which fail *silently*.

**Status: NOT YET EXECUTED.** This is the plan for review. Nothing past Stage 0 has been run.

---

## 🔴 Read this first — two things that will bite

**1. `Data/` is served over HTTP with no authentication.** Verified in the installed v14
server (`dist/server/express.mjs`): `express.static(paths.data)` serves the *entire* Data
directory. The only 403s are LevelDB internals and `signature.json` — **`.json` files are
served**. So anything you copy under `Data/` is downloadable by anyone who can reach
`https://vtt.atjoseph.com` — which is exactly your players, exactly while they're connected.
Stage 2 therefore uses **copy in → import → delete**, and campaign notes never go under `Data/`.

**2. `allowWriteOperations` does not gate the tools this pipeline uses.** `manage-actors` and
`manage-world-items` are gated **only** by "is the connected Foundry user a GM"
(`validateGMAccess`, `queries.ts:17`). The `allowWriteOperations` setting is only consulted for
compendium-based creation, journal creation and scene/token ops. Don't mistake that toggle for
a safety net on the generic write path.

---

## Decisions made for you (review these first)

A review agent made these calls. Each has a reversal trigger — the thing that should
make you change your mind later.

| # | Decision | Why | Reverse if |
| - | -------- | --- | ---------- |
| **D1** | **Do not fork `foundry-vtt-mcp`.** Install upstream, pin **v0.8.3**. | Every reason to fork dissolved: flat to-hit is handled by generic passthroughs (D2), walls/lights/scenes by the UVTT path (D4). That leaves zero must-have reasons against permanent rebase liability on a 10,233-line `data-access.ts` and a 49-case hand-written switch. | A workflow is genuinely blocked by an unexposed internal — `addActorsToScene` (placing a token for an existing actor) is the likely first. Then fork, one commit per concern, and open the PRs so the fork trends back to empty. |
| **D2** | For dnd5e items with pre-baked numbers, use **only** `manage-actors` create and `manage-world-items` add-to-actor. **Never** `dnd5e-add-feature`. | Both forward `system` verbatim (`data-access.ts:9623ff`, `4612ff`), routing around the hardcoded `flat: false`. The dnd5e adapter has no `normalizePayload`, so nothing rewrites the payload. | Ad-hoc authoring gets frequent enough that hand-writing activity JSON is error-prone → send the ~10-line `flatToHit` PR upstream. |
| **D3** | Actor pipeline = **Python generator → committed JSON → small personal Foundry module** doing validated `Document.create`. MCP is the *interactive* layer only. | The importer must be reproducible, idempotent and testable. An LLM driving MCP calls is none of those, and every failure mode here is **silent**. | After two months it's <20 actors and never re-run → it was over-built; collapse to a one-time import and delete. |
| **D4** | ~~Auto-Wall → UVTT → `dd-import`~~ **REVERSED 2026-08-11.** Draw walls, doors and lights **by hand in Foundry's own tools**. | The reversal trigger fired as written: CV output on these painterly maps needed more cleanup than doing it by hand. Three scenes, drawn once — the pipeline never paid for itself. Auto-Wall and `dd-import` to be uninstalled. | A future batch of maps large enough that hand-drawing is genuinely infeasible, **or** crisp vector-style maps (Dungeondraft exports) where CV actually works. Accept the cost below before reversing back. |
| **D5** | Scenes are **live-world documents**. No compendium/Adventure packs. **Delete and recreate** the 3 hand-written scenes. | Packs are a distribution format; you have one world and one GM. The existing 3 bypassed validation *and* version-stamping, and have no walls, lights or grid — nothing worth preserving. | Scenes accumulate placed tokens, journal pins or fog worth keeping → round-trip those specific ones instead. |
| **D6** | **Ignore ComfyUI map generation** — never run its setup. Separately, set `FOUNDRY_CONNECTION_TYPE=websocket`. | A 1,379-image curated library beats SDXL output on quality and infinitely on prep time; your bottleneck is walls and grids, not map supply. *(The env var is unrelated to ComfyUI — it selects the transport to the Foundry module. Set it to keep that on localhost.)* | A set-piece the library can't cover *and* an idle weekend. Even then, evaluate hosted generators first. |
| **D7** | Register the MCP server at **project scope** (`.mcp.json`), exactly one registration. | Repo-visible and version-controlled. The earlier name-conflict came from *dual* registration, not from project scope. | See **O1** — the macOS installer creates a second, invisible registration. |
| **D8** | Everything lives in `pentaryn`. **No submodules, no vendoring.** | Nothing to vendor without a fork. Generated JSON is the golden-file surface for pytest and the diffable record of what was imported. | Module iteration gets frequent enough that copy-staleness bites → switch to a symlink. |
| **D9** | Set the grid in **Foundry's Scene Config → Grid → Grid Configuration** (was: in Auto-Wall; moot after D4's reversal). Size a **door** to one square. | These maps are **gridless** — "programmatic grid detection" is a category error. Choosing square size is a scale judgement, ~90 seconds per map. Measure against the *building*, not the frame: `alchemist-shop.jpg` at 45 px/cell gives an 8×9 shop, which is unplayable; ~23 px/cell gives 16×18. | A future batch of 50+ *gridded* maps. Three gridless ones never will. |
| **D10** | **Gate every stage.** Do not proceed past a failure. | Both verified failure modes are silent. "It didn't error" is worthless — each gate must *positively confirm* the thing it protects. | Never for the gates themselves; individual assertions can relax after passing unchanged across three sessions. |

### Deliberately cut

- **Forking first** — momentum accumulated from the `flat` bug and missing wall tools. Both dissolved. This was the single biggest over-engineering risk.
- **Adventure / compendium packs** — distribution machinery for an audience of one, riding the CLI path that already failed silently.
- **Direct LevelDB writes for game content** — not merely heavy, **wrong**. Retire that path in `build_scenes.py`. See the nuance below; the ban is narrower than "never touch LevelDB".
- **ComfyUI** — solves a problem you don't have.
- **Elaborate sync framework** — `contentHash` + replace-embedded-Items is the ceiling.

**Kept despite looking like ceremony:** readback assertions and version-gating. They are the *only* defence against the verified silent failures, and each is a few lines.

### When direct LevelDB writes are actually acceptable

The ban has **two independent reasons**, and they cover different things. Conflating them
produces a rule that is both too strict and too vague.

| Reason | Applies to | Consequence |
| ------ | ---------- | ----------- |
| **Validation & version-stamping** | *Content documents* — Actors, Items, Scenes, Journals | Bypassing loses schema validation, default-filling and the `_stats` version stamp. Nothing will ever migrate a badly-written document, because it is stamped as current. **Always use the API.** |
| **You cannot stop the server** | *Anything during a session* | LevelDB is single-writer, so an offline write means shutting Foundry down mid-play. **Always use the API.** |

What is left over — **config and bootstrap writes, made while Foundry is stopped** — carries
neither risk and is fine. There is no schema to violate in a settings map, and you were
restarting anyway.

**Worked example (2026-08-10):** enabling the MCP bridge module. Foundry's setup UI requires the
Admin Access Key, i.e. typing a password. Instead: stop Foundry → back up the world → set
`core.moduleConfiguration` in `data/settings` to `{"foundry-mcp-bridge":true}` → restart.
⚠️ Its `value` is a **JSON string, not an object** — preserve that shape or the field corrupts.

The test to carry forward: **"is this content, and could I be mid-session?"** If either is yes,
use the API. If both are no, Foundry is stopped, and you have a backup — write it.

---

## Open items

**O1 — The MCP server is not on npm, and the macOS installer sabotages D7.** `npm view
foundry-mcp-server` returns an unrelated package. Two install paths exist, and **the DMG
silently writes a `foundry-mcp` entry into `~/Library/Application Support/Claude/claude_desktop_config.json`**
(`installer/build-mac-pkg.js:130–200`) — a registration `claude mcp list` will never show — and
can pull in ComfyUI against D6. **Use clone-and-build** (Stage 0), and check both config
locations for duplicates.

**O2 — Importer choice was wrong in the first draft; corrected.** Myxelium's
`quick-battlemap-importer` documents images + Dungeon Alchemist JSON, **not UVTT**, and lists
v14 as supported-but-unverified. The canonical tool is Moo Man's
[**Universal Battlemap Importer** (`dd-import`)](https://foundryvtt.com/packages/dd-import/),
v6.1.1, **verified Foundry 14** — and Auto-Wall's own author deprecated their companion module
pointing at it. Stage 3 still tests the chain before real work, but `dd-import` is the primary.

*Resolved:* the Auto-Wall desktop app **does** exist for macOS (native `.dmg`, OpenCV/PyQt6) and
**does** export UVTT with walls, doors and lights. D4 and D9's premises hold.

---

## Target final state

- `make vtt-up` brings up Foundry + tunnel; players connect at `https://vtt.atjoseph.com`
- MCP bridge connected, so Claude can query and nudge the **live** world during prep
- NPCs rebuilt from `combat-runner/actions.jsonl` by one deterministic, idempotent command
- Three scenes with correct grids, walls, doors and lights — recreated through validated paths
- Every input (actor JSON, UVTT) committed and diffable; nothing authored only inside the world DB

---

## Stage 0 — MCP bridge: install and smoke test

**Foundry module:** install `foundry-mcp-bridge` from Foundry's own package browser
(v0.8.3, `minimum: 13 / verified: 14 / maximum: 14`).
⚠️ Upstream's INSTALLATION.md gives a GitHub **blob** URL, which serves HTML and won't install.

**MCP server — clone and build** (satisfies the v0.8.3 pin and keeps everything visible).
Requires **Node ≥18, npm ≥9**:

```bash
git clone https://github.com/adambdooley/foundry-vtt-mcp.git ~/Documents/GitHub/foundry-vtt-mcp
cd ~/Documents/GitHub/foundry-vtt-mcp && git checkout v0.8.3 && npm install && npm run build
```

Entry point is `<clone>/packages/mcp-server/dist/index.js`.

```jsonc
// .mcp.json  — path is machine-specific; that's expected (O1)
{ "mcpServers": { "foundry": {
    "command": "node",
    "args": ["/Users/joe/Documents/GitHub/foundry-vtt-mcp/packages/mcp-server/dist/index.js"],
    "env": { "FOUNDRY_CONNECTION_TYPE": "websocket" }
} } }
```

Confirm **exactly one** registration — check *both* places:
```bash
claude mcp list                                                    # expect: foundry (project)
grep -c foundry ~/Library/Application\ Support/Claude/claude_desktop_config.json 2>/dev/null   # expect: 0
```

> The server is a thin stdio wrapper proxying to a **singleton backend** on TCP `31414`
> (`index.ts:25`, `backend.ts:50`), which hosts the WebSocket server on `31415`. A stale backend
> outlives clients **by design** — if tools go dead, look for an orphaned `backend.js` first.

### ✅ Gate 0 — MCP smoke test

Foundry up, module enabled, then:

**1. Read** — `get-world-info` and `list-characters`. Confirm world `ardenhaven`, system `dnd5e 5.3.3`.

**2. Write probe — two calls** (`manage-actors` create takes `name/type/img/system` only; items go
through `manage-world-items`):

```jsonc
// call 1 — manage-actors, action: "create"
{ "name": "zz-smoke", "type": "npc",
  "system": { "attributes": { "hp": { "vaule": 7 } } } }   // deliberate typo: "vaule"

// call 2 — manage-world-items, action: "add-to-actor"
{ "name": "Smoke Blade", "type": "weapon",
  "system": {
    "proficient": 0,
    "activities": { "aaaaaaaaaaaaaaaa": {
      "_id": "aaaaaaaaaaaaaaaa", "type": "attack",
      "attack": { "ability": "", "bonus": "4", "flat": true,
                  "type": { "value": "melee", "classification": "weapon" } }
    } }
  } }
```

Read both back and confirm **both**:
- `system.attributes.hp.vaule` is **gone** — silently stripped, not rejected. *This is why every write gets a readback.*
- The sheet shows **exactly +4**. A fresh NPC has +0 ability mods and +2 proficiency, so a
  failed `flat` flag shows **+6**. **Anything but +4 → stop**; D2's passthrough assumption is
  wrong and D1 needs revisiting.

**3. Permission** — toggle `allowWriteOperations` off and confirm a *gated* write refuses
(`create-actor-from-compendium`, or journal creation). **Do not test this with `manage-actors`** —
it is GM-gated only and will succeed with the toggle off, which is correct behaviour, not a failure.
Toggle back on.

**4. Clean up** — delete `zz-smoke`.

---

## Stage 1 — Actor generator

`scripts/foundry/build_actors.py` *(to be created)*: reads `actions.jsonl` + the
`#combat-runner` markdown, emits `foundry/build/actors.json`, committed to the repo.

Manifest carries `targetSystem: "dnd5e"`, `targetSystemVersion: "5.3"`, `generation: 14`.
Every actor gets `flags.pentaryn = {slug, contentHash}`.

**Emit the minimum.** Every field you write is a field that can drift.

**dnd5e 5.x traps to encode:**
- `attack.flat = true` on every attack — your bonuses are pre-baked
- `proficient: 0` at item level — otherwise proficiency stacks on top
- Activity ids are **16-char** random strings (the server uses `randomID(16)`)
- Save DCs in **flat/custom** mode, not ability-derived
- Set `details.cr` correctly regardless; other numbers derive from it
- Lint `@refs` against a whitelist — see the `@ref` trap below

### ✅ Gate 1
Golden-file pytest passes · every `actions.jsonl` row maps to an Item or is skipped **with a
logged reason** · `python scripts/combat_actions_db.py validate` clean.

---

## Stage 2 — Importer module

`foundry/module/pentaryn-importer/` *(to be created)*. `make foundry-sync` *(to be created)*
copies the module into `Data/modules/` (**copy, don't symlink**).

**🔴 Back up first — before the first import, and before any deletion:**
```bash
make vtt-down   # LevelDB is single-writer; Foundry must be stopped
cp -R ~/Library/Application\ Support/FoundryVTT/Data/worlds/ardenhaven ~/backups/ardenhaven-$(date +%F)
```

**JSON handling — copy in, import, delete.** Because `Data/` is world-readable over the tunnel
(see the red box at the top), `actors.json` must not linger there:

1. `make foundry-sync` copies `foundry/build/actors.json` → `Data/worlds/ardenhaven/`
2. Run the import
3. **Delete the file from `Data/`** — `make foundry-clean` does this, and asserts the 404

`make foundry-import` runs all three: sync, prompt while you run `game.pentaryn.import()` in the
console, then clean and verify. **The module cannot do step 3** — Foundry's client API has no
file-delete (`FilePicker` exposes only `browse`, `upload`, `createDirectory`, `configurePath`), so
it warns permanently and the make target is the deleting agent. See CONTRACT.md §12.

Module exposes `game.pentaryn.import()`. No UI, no settings, no hooks.

- `fetchJsonWithTimeout(..., {cache: "no-cache"})` — **without `no-cache` you will import stale JSON**
- **Version gate** — refuse unless `game.system.version` major.minor matches the manifest
- **Upsert** by `flags.pentaryn.slug`; skip when `contentHash` is unchanged
- **Replace embedded Items** — never recreate Actors; recreating breaks tokens already placed on scenes
- **Per-actor try/catch** — one `ValidationError` must not abort the run
- **Readback assertions** — compare **displayed labels** (`activity.labels.toHit`, save DC label), not
  recomputed maths. Reimplementing dnd5e's derivation in the assert just moves the bug.

### ✅ Gate 2
Import one NPC · readback assertions pass · abort-on-first-mismatch works · **prototype token
config correct** (vision, bars, size, disposition — wrong defaults surface mid-session and no
other gate catches them) · then re-run the full import and assert **zero changes** (idempotence).

**Then confirm the JSON is gone** — `make foundry-verify`, or by hand:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://vtt.atjoseph.com/                                # tunnel up? 200/302
curl -s -o /dev/null -w '%{http_code}\n' https://vtt.atjoseph.com/worlds/ardenhaven/actors.json   # expect 404
```
Both probes, in that order. A 404 from a *down* tunnel proves nothing — per **D10** the gate has to
positively confirm the file is gone, so it establishes the tunnel is up first and then requires a
404. With the tunnel up, anything other than 404 (a 403 bot-challenge against curl's UA, a 302, a
5xx) fails: none of them show what a player's browser would get.

---

## Stage 3 — Walls, doors, lights

> ⚙️ **Independent of Stages 1–2** and the riskiest external link. Worth running **first or in
> parallel** so a chain failure doesn't strand finished actor work behind it.

**Done by hand in Foundry**, per D4's reversal (2026-08-11). Per scene:

1. **Scene Config → Grid → Grid Configuration** — size a *door* to one square. Measure against
   the **building**, not the frame (D9). `alchemist-shop.jpg` wants ~23 px/cell, not 45.
2. **Walls layer** — trace the building's outer shell and interior partitions.
3. **Door walls** for openings; **Terrain/window walls** where sight passes but movement doesn't.
4. **Lighting layer** — hearths, lanterns, candles. Enable **Token Vision** in Scene Config.
5. Step through as a player token and check what's visible from each room.

### ⚠️ The cost of this reversal — know it before you rely on it

The UVTT path produced a **committed, re-importable artifact**: if a scene got mangled you
re-imported the file and were back. Hand-drawn walls live **only in the world database**.

Consequences to accept:
- A corrupted or deleted scene means **re-drawing by hand** — the repo cannot rebuild it.
- `~/backups/ardenhaven-*.tar.gz` is now the *only* recovery path for wall/light work.
  **Back up after any significant drawing session**, not just before writes.
- Scenes are no longer reproducible from the repo, so `foundry/uvtt/` stays empty and the
  "everything in git" property of this pipeline covers **actors only**, not scenes.

That's a real loss, deliberately accepted: three scenes drawn once, versus a CV pipeline that
needed more cleanup than the hand-drawing it was meant to replace.

## OneDrive — the source of truth

OneDrive holds everything Foundry needs; local disk holds only what Foundry serves.
**One direction each way, so the two can never fight over the same file.**

```
OneDrive/DnD/foundry/
  README.txt          explains the below, for whoever opens the folder in six months
  assets/             YOU put zips here      → flows DOWN into Foundry on start
  world-backups/      automatic, rolling     ← flows UP on every stop and start
  system-backup/      automatic, one copy    ← refreshed only on a version change
```

| Target | Direction | What |
| --- | --- | --- |
| `make foundry-assets` | down | Unpacks any new `<kind>-<nn>.zip`. Hash-tracked, extracted once, never overwritten. |
| `make foundry-backup` | up | Snapshots world + Config + modules (~4 MB). Keeps the last 100, skips if unchanged. |
| `make foundry-restore` | manual | Lists snapshots; `SNAP=<name>` restores one, archiving current state first. |
| `make foundry-cloud` | — | Status: packs, snapshots, whether the server is up. |

Both are wired into the lifecycle: `vtt-up` snapshots then unpacks before launching,
`vtt-down` snapshots after stopping. Backing up on *start* as well as stop is what
catches a crash or force-quit that skipped the shutdown hook.

### Why not just sync the whole data directory

`Data/worlds/<world>/data/` is a live **LevelDB**. A sync client reads `.ldb` files
mid-compaction and uploads inconsistent snapshots, and resolves conflicts by writing
*conflict copies* into the directory — junk inside a live database. LevelDB's
single-writer `LOCK` means neither side detects the other, so nothing errors; the world
simply fails to open, weeks later. Foundry's own static route hard-403s
`.ldb`/`LOCK`/`MANIFEST` for related reasons.

Measured on this machine: a read through `~/Library/CloudStorage` **hung for 30 s** while
the OneDrive daemon was busy, against **6 ms** for the same file read directly. That is
also why assets are unpacked to local disk rather than symlinked — the stall is caused by
the File Provider daemon, not the symlink, so a direct path would hang identically.

A *stopped* database copies consistently every time. That is the whole trick.

### The rules that keep it safe

- **Packs are append-only.** Never edit a published zip; add `<kind>-<nn+1>.zip`. A zip
  whose hash changed after extraction is **refused**, not silently re-applied.
- **Each pack gets its own folder** (`tokens-01.zip` → `assets/tokens/tokens-01/`), so
  cross-pack collisions are structurally impossible and deleting a pack is one `rm -rf`.
- **Filenames normalise to kebab-case at extraction only** — before any Foundry document
  references them. Never rename inside an extracted pack; fix it in the next zip.
- **Restore is never automatic.** Rolling backups make an automatic restore *more*
  dangerous, not less: an older snapshot silently overwriting a newer world is now a
  thing that can happen a hundred ways.
- **Both write paths refuse while Foundry is running.** The lifecycle hook skips quietly
  instead; a manual run fails loudly.
- **Art never goes in git.** OneDrive holds the bytes; `foundry/assets-manifest.json`
  holds the inventory, and is committed.

### Division of labour
| Task | Who |
| ---- | --- |
| Draw walls, doors, lights | **you, in Foundry's tools** |
| *"That segment is a door, that's an archway"* | Claude can advise from the map image |
| Place encounter tokens | **Claude + MCP** |

### ✅ Gate 3
Per scene, in the Foundry console:
```js
const s = game.scenes.getName("The Common Room");
s.levels.size >= 1 && !!s.firstLevel.background.src   // expect true
```
Plus by eye: walls block movement · doors toggle · lights emit · grid matches the map.
**Only then delete the hand-written original** (and only after the Stage 2 backup exists).

---

## Stage 4 — Table readiness

### ✅ Gate 4
`make vtt-up` · connect as a **player** over `https://vtt.atjoseph.com` · confirm scene loads
and token vision behaves · `make vtt-down`.

---

## Reference — traps, all verified the hard way

| Trap | Behaviour |
| ---- | --------- |
| **`Data/` served with no auth** | `express.static(paths.data)`; only LevelDB internals and `signature.json` are 403. `.json` is served. Public while the tunnel is up |
| **`allowWriteOperations` doesn't gate the passthroughs** | `manage-actors` / `manage-world-items` check only `game.user.isGM`. The toggle guards compendium/journal/scene ops only |
| **LevelDB is single-writer** | Offline edits need Foundry fully stopped, else `LEVEL_ITERATOR_NOT_OPEN` |
| **`fvtt package pack` targets `packs/`, not `data/`** | Pointed at world data it produced an **empty DB with no error** |
| **v14 restructured Scenes** | `background` moved onto the level (`common/documents/level.mjs:86`); top-level `background` survives only as a migration shim. Via the API `levels` is an embedded collection — the separate `!scenes.levels!…` keys are the raw-LevelDB view |
| **Unknown keys are silently stripped** | A typo'd field path imports "successfully" with a default value |
| **`@ref` typos survive validation** | Validation replaces `@terms` with `1`, so typos **pass**. Evaluation resolves unknown refs to `0`, so they **roll as zero** |
| **`dnd5e-add-feature` hardcodes `flat: false`** | `data-access.ts:8545` and `9054`, plus `proficient: 1` at 8502/9014. A pre-baked +4 gains ability mod **and** proficiency |
| **Foundry's API is client-side only** | No built-in REST. External access needs a bridge |
| **macOS DMG writes an invisible MCP registration** | Into Claude Desktop's config; `claude mcp list` won't show it |

---

## Related

- [roll20-map-prep.md](roll20-map-prep.md) — the predecessor; grid math and the source map library inventory still apply
- [`scripts/foundry/README.md`](../scripts/foundry/README.md) — license key retrieval, make targets
- `combat-runner/gui/README.md` — the at-table combat runner these actors mirror
