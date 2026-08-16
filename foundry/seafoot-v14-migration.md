---
title: "Seafoot 520-map library — v9 → v14 migration"
created: 2026-08-13
last_modified: 2026-08-13
status: complete
tags: [foundry, maps, migration, seafoot]
---

# Migrating 520 pre-built scenes from Foundry v9 to v14

## What we have

The Quarantine bundle ships **520 complete Foundry modules**, one per map, each containing a
compendium of fully-built scenes:

| Per scene | Typical |
|---|---|
| Walls | ~600 |
| Lights | ~20 |
| Ambient sounds | ~30 |
| Grid / dimensions | 150 px, 4500×3000 |

Delivered twice — 507 individual `.rar` files and a consolidated 6-part `.zip` set. **The zip set is
canonical; the `.rar`s are redundant.**

## Why it can't just be installed

```json
"minimumCoreVersion": "9",  "compatibleCoreVersion": "9"
"packs": [{ "path": "packs/<name>.db", "type": "Scene" }]
```

Two blockers:

1. **NeDB pack format.** Foundry deprecated NeDB in v11 and removed it in v12; v14 reads LevelDB only.
   The `.db` files are line-delimited JSON and won't load as compendiums.
2. **520 separate modules.** Even if they loaded, 520 entries would make the module manager unusable
   and slow every world's startup.

## The target end state

**One module**, installed once, available to every world:

```
Data/modules/pentaryn-seafoot-maps/
├── module.json           # targets v14, declares one LevelDB pack
├── maps/                 # 520 × 150-dpi VTT images (~2.6 GB)
├── audio/                # ambient loops referenced by the scenes
└── packs/scenes/         # LevelDB compendium — 520+ migrated scenes
```

Result: open the compendium, drag a scene into any world, and it arrives with its walls, lights and
sound emitters already placed.

## The migration approach: let Foundry do the schema work

The v9 → v14 Scene schema changed substantially — `img` became `background.src`, the flat grid fields
(`grid`, `gridType`, `gridDistance`, `gridUnits`, `gridAlpha`, `gridColor`) collapsed into a `grid`
object, and `globalLight` / `globalLightThreshold` / `darkness` moved under `environment`.

**Hand-writing that migration across 520 scenes would be fragile.** Instead we feed the v9 documents
straight to `Scene.create()` inside a running v14 client and let Foundry's own `migrateData()` shims
do the conversion — the same code path Foundry uses when it upgrades an old world. Foundry then
writes the result to a LevelDB compendium natively.

That converts *and* persists in one step, with zero bespoke schema code.

## Steps

1. **Extract** the 6-part zip to a staging area. → 520 module folders.
2. **Consolidate assets** — copy every `maps/*.jpg` and `audio/**/*.wav` into the new module's
   folders, flattening the per-module nesting and recording the path rewrite for each.
3. **Build the module skeleton** — `module.json` targeting v14 with one declared LevelDB pack.
4. **Install and enable** it in a scratch world.
5. **Prove on one scene** — parse one `.db`, rewrite `modules/<old>/maps/x.jpg` →
   `modules/pentaryn-seafoot-maps/maps/x.jpg`, `Scene.create()`, confirm walls/lights/sounds survive
   and the image renders.
6. **Run the batch** — all 520, in chunks, into the compendium. Log every failure by name.
7. **Verify** — count scenes, spot-check wall/light/sound totals against the source `.db`, confirm no
   broken image paths.
8. **Version the source** — `fvtt package unpack` the finished pack to YAML in the repo so the
   compendium is reproducible without re-running any of this.
9. **Reclaim space** — with the module built and verified, the 507 redundant `.rar`s and the print
   files (300dpi, A1 posters, PDFs) become deletable.

## Verification contract

The migration is only complete when, for a random sample of 10 scenes:

- wall / light / sound counts match the source `.db` exactly
- `background.src` resolves to a file that exists
- grid size and dimensions match the source
- the scene opens in v14 without console errors

## Notes

- Audio paths inside scenes reference `modules/<old-name>/audio/...` and need the same rewrite as
  images.
- Scene `_id` values from v9 are reused where valid; collisions are re-minted.
- Nothing is deleted until step 9, and only after step 7 passes.


---

## Outcome

Complete and verified. **687 scenes, 15 folders, 277,037 walls, 7,445 lights, 12,342 sound
emitters** — every total matching the source exactly, zero missing backgrounds, zero broken paths.

```
Data/modules/pentaryn-seafoot-maps/     1.9 GB
├── maps/          1.7 GB   674 images (7 deduped)
├── audio/          75 MB   35 loops (from 1,411 duplicate copies)
├── thumbs/         40 MB   676 previews, 300x100
├── packs/scenes/   23 MB   native v14 LevelDB
└── _packsrc/               per-document JSON — the reproducible source
```

## What actually had to be discovered

The plan assumed Foundry's own `migrateData()` would handle v9 -> v14. **It doesn't** — v9 is too
many versions back and the shims are gone. Four things had to be worked out empirically, none of
them documented:

1. **v14 moved the background onto an embedded `Level` document.** There is no `background` field on
   the Scene schema at all. The embedded document is named `Level` (not `SceneLevel`).
2. **The grid is load-bearing for wall alignment.** Foundry snaps the padding offset to whole grid
   squares, so a scene authored at grid 150 that imports at the default 100 shifts its background by
   50 px against the wall coordinates. Every wall on all 687 maps would have been subtly misaligned.
3. **The CLI requires `_key` on every embedded document**, not just the top-level one —
   `!scenes.walls!<sceneId>.<wallId>`. Without it you get `LEVEL_INVALID_KEY` naming no field.
   Bisecting field-by-field found it: `levels`, `sounds` and `walls` failed individually while 24
   other fields passed.
4. **`Scene.create()` and pack migration read the background from opposite places** — and this is
   the one that cost the most time:

   | Document shape | `Scene.create()` | Pack migration |
   |---|---|---|
   | `background: {src}` at scene level | fails | **works** |
   | `img` (v9 flat) | fails | **works** |
   | `levels[0].background.src` | **works** | fails |
   | both | **works** | **works** |

   So the migration emits **both**. Determined by packing four probe scenes into the compendium and
   reading which survived a restart.

## Do not drive bulk imports through the client

`Scene.createDocuments()` against a compendium hit, in order: 60-second timeouts mid-batch, duplicate
creation (the timed-out call kept running server-side while the resumed run re-added what it thought
was missing — 774 scenes instead of 687), and an intermittent race in Foundry's socket handler where
even a bare minimal document failed roughly five times in six.

**Use `fvtt package pack`.** Quit Foundry first — it holds a LevelDB lock. The whole 687-scene pack
builds in seconds and is deterministic.

## Applies to the other purchase

Heroic Maps' *Catacombs of Blackthorne Wood* is the same pattern: `minimumCoreVersion 0.8.9`,
NeDB pack, 6 scenes, ~4,000 walls, **grid 140**. Same migration, same grid trap.
