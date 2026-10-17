---
title: "Furniture & props — dressing a room with tiles"
status: active
last_modified: 2026-10-17
tags: [foundry, tiles, assets, props]
---

# Furniture & props

**Read this when:** furnishing a room — chairs, tables, beds, shelves, barrels, rugs, clutter —
or adding a new free asset pack for it.
**Not this file:** the asset zip pipeline in general → [`ops.md`](ops.md) §3 · inspectable/lootable
things → the `hotspot` / `note` kinds in [`prompt-markers.md`](prompt-markers.md).

## What is installed (2026-10-17)

| Where | What | Native scale | How it is backed up |
|---|---|---|---|
| `Data/assets/tiles/tiles-03/fa/` | Forgotten Adventures free !Core pack, kept folders only: `furniture`, `clutter`, `decor`, `lightsources`, `workplace-equipment`, `burial-and-graves`, `combat`, `drow-settlement`, `dwarf-settlement` (65,240 WebP; 532 MB zip) | 200 px / square — the filename ends in the footprint (`…-3x2.webp`) | `tiles-03.zip` in `OneDrive/DnD/foundry/assets/` |
| `Data/assets/tiles/tiles-02/tomcartos/` | Tom Cartos free *Basics* + *Dungeon Delvers* (302 PNG) | 300 px / square | `tiles-02.zip` in the same folder |
| `Data/modules/fa-nexus/` | **FA Nexus 0.5.3** (v14) — FA's in-Foundry browser: search, drag, drops a **Tile**. Free tier, no login | — | a module bundle, like every module |
| `Data/fa-nexus-assets/` | What FA Nexus downloads as you place things (`useDirectCloudUrls` is off, so scenes never hot-link FA) | — | rides in every world snapshot as a loose `Data/` file (`scripts/foundry/cloud.py`, `LOOSE_SKIP_TOP`) |

So nothing here lives only on one machine: the packs come down on the next `foundry-up` on any
host, the module and the Nexus downloads come back with a restore.

Licences: FA — personal use, `LICENSE.txt` beside the art; Tom Cartos — CC BY-NC-SA. Fine for the
home game; **never** ship either in a shared module, scene-packer export or public repo.

## Sizing on a 150 px grid

- FA: tile size = the `AxB` in the filename × 150 (a `…-3x2` table is 450 × 300).
- Tom Cartos: tile size = native pixels ÷ 2 (a 150 px barrel is 75 px, half a square).

## Placing props

- **FA Nexus** (scene controls → the FA Nexus button): search "chair", drag onto the map.
- **Anything in the packs**: Tiles layer → Browse, `assets/tiles/tiles-03/fa/…`, drag in.
- Props are **tiles at elevation 0**; stack with `sort` (floor < rug < table < chairs). Keep them
  out of the overhead/roof range so BetterRoofs and Levels never fade them.
- Rotate with Shift/Ctrl + wheel; **lock** finished pieces from the Tile HUD.
- Players cannot select or drag tiles. Tiles are lit like the map: unlit room, unseen furniture.

## An eye on a prop

Drop the existing eye on it — a `note` (readable) or a `hotspot` (loot), see
[`prompt-markers.md`](prompt-markers.md) — and select both when moving.
When the loot is the thing the prop shows (instruments on a table, a sword on a rack), set each
item's `img` to that prop's tile graphic, so the icon players loot is the picture they clicked
(Joe, 2026-10-17). No props module on purpose
(Joe, 2026-10-17): build one only if moving and cleaning up eyes gets tedious.

## Batches placed by Claude

Props placed in bulk carry `flags.pentaryn.props = {batch, group}`. Remove a whole batch with
`scene.deleteEmbeddedDocuments("Tile", scene.tiles.filter(t => t.flags.pentaryn?.props?.batch === "<batch>").map(t => t.id))`.

- `character-props-2026-10-17` — 72 tiles beside the characters on `reclaimed-ruins` (35, 8 groups)
  and its middle floor (37, 10 groups); Joe prunes by hand.
- `dragon-victims-2026-10-17` — 24 tiles on `reclaimed-ruins — top floor`: six corpse vignettes
  (Tom Cartos bones and blood pools, FA broken gear) around Skorchvane.
- `gold-hoard-2026-10-17` — 17 tiles on the same floor: FA gold coin and treasure piles under
  Solvaeryx and the five loot eyes.
- `music-store-2026-10-17` — 12 FA instrument tiles in Ysolde Vane's shop room on the same floor.

**Place Claude's props unlocked** (`locked: false`). Joe arranges them by hand afterwards, and a
locked tile won't drag — he hit that with the corpse batch on 2026-10-17.

## Test scene

`Props Test` (`uWXQmgpNOH9lenGk`, pentaryn, not in navigation): a walled 12 × 9 room built from
both packs. Safe to delete.

## Adding another pack

Zip it as the next `tiles-NN.zip` with a `credits.txt`, drop it in `OneDrive/DnD/foundry/assets/`
(`rclone copy … onedrive:DnD/foundry/assets/`), run `make foundry-assets`. The unpack kebab-cases
every path (`Display Case_A9_3x1.webp` → `display-case-a9-3x1.webp`).
