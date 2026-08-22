# Map library — storage, organisation, and findability

**Read this when:** finding one battlemap out of ~1,750, or filing a new pack into the library.
**Not this file:** getting a found map into a scene → [`../plans/foundry-content-pipeline.md`](../plans/foundry-content-pipeline.md)

How ~1,750 battlemaps are stored, and how a specific one gets found in under a minute.

Extends the existing convention: **OneDrive is source of truth; assets down, world up.**

---

## The decisions

### 1. The Library App is being retired. The download folder becomes ordinary files.

The DriveThruRPG Library App is **x86_64-only** (verified: no arm64 slice, running under Rosetta on an
Apple-silicon Mac). Apple pares Rosetta back after macOS 27, so the app has a visible expiry date and
is being removed once the sync is reconciled.

**Consequence: `~/Documents/DriveThruRPG/` stops being a managed cache and becomes just a folder.**
Nothing tracks state in it, so nothing is at risk from touching it. That simplifies everything
downstream:

- The extract **moves** files rather than copying them — no ~70 GB of duplication.
- The "never edit this folder" rule disappears.
- Once emptied of anything useful, the print-file residue can be deleted outright rather than kept
  in a cache that no longer serves a purpose.

**Keep the installer.** `DriveThruRPG_3.6.3.dmg` is already in `~/Downloads` — archive it to OneDrive
alongside the maps. A future re-install then doesn't depend on the vendor still hosting an Intel build
after they ship an Apple-silicon one (or don't).

**What is lost by removing the app:** automatic update detection (publishers revise files) and
one-click downloads of future purchases. Both fall back to the website, which is tedious but works —
and at 535 products already synced, the marginal cost is low.

### 2. OneDrive organises by scene type, not by publisher.

Nobody ever needs "a Seafoot map." They need *a gallows*. Publisher and product survive as metadata in
the manifest, where they're searchable, rather than as directory levels you have to remember.

Two exceptions, both deliberate:

- **`sets/`** — coherent multi-map *locations* stay together, because their value is the adjacency.
  `Tower-City` is 26 maps of one vertical city; splitting it across `scenes/streets/` and
  `scenes/interiors/` destroys what makes it useful.
- **`unsorted/`** — the 1,217 numbered castle maps live here until captioned, then get filed.

### 3. Print files stay behind. No deletion, no copying.

Roughly 90% of the 58 GB is `*_300dpi_VTT.jpg`, `*_A1_Poster.jpg` and print PDFs — ~110 MB per product
against ~4 MB of actually-usable VTT image.

They are **not deleted** (they're part of the purchase and occasionally you'll want to print), and they
are **not synced to OneDrive** (they'd dominate the quota for files that will never load in a VTT).
They simply stay in the app cache, which is where they already are. This decision costs zero work.

**Extraction rule:** only web-resolution VTT files are pulled forward — `*_72dpi_VTT.*`, or the
smallest image per product when the naming doesn't follow that pattern.

### 4. Foundry gets a curated per-campaign copy, never a mirror.

Everything under Foundry's `Data/` is visible to **every world** — there is no per-world asset scoping.
Dumping 1,750 maps in makes the file picker unusable for all campaigns at once.

So assets are namespaced by world and staged deliberately:

```
Data/assets/maps/<world-id>/     ← this campaign's picks
Data/assets/maps/_common/        ← things every campaign wants
```

`_ardenhaven-next-picks/` already hinted at this workflow; it becomes `_staging/ardenhaven/` and gets a
sync script rather than manual copying.

### 5. Findability is a manifest plus a generated contact sheet.

Naming conventions don't scale to 1,750 files and nobody maintains them. Two artefacts do the work:

- **`foundry/map-index.json`** — follows the `roll20-maps.json` precedent. Per map: slug, path,
  publisher, product, dimensions, grid size where known, file size, tags, and a one-line caption.
- **`_index/contact-sheet.html`** — a generated static page: thumbnail grid, live filter box, click to
  copy the path. This is the thing that actually answers *"do I own a gallows?"* in ten seconds.

**The 1,217 unnamed castle maps get captioned by AI vision in bulk** — a one-line description plus tags
per image, written into the manifest. That is the single highest-value job in this plan: it converts
88% of the library from invisible to searchable.

---

## Directory tree

```
~/Library/CloudStorage/OneDrive-Personal/DnD/Maps/
├── _index/
│   ├── contact-sheet.html          # generated: thumbnails + filter box
│   └── thumbs/                     # 400px webp, ~30 KB each (~50 MB total)
├── _staging/
│   ├── ardenhaven/                 # was _ardenhaven-next-picks
│   └── space-journey/              # symlinks or copies of chosen maps
├── sets/                           # multi-map locations that belong together
│   ├── tower-city/                 # 26 — streets, districts, underground, top floor
│   ├── abandoned-village/          # summer + winter, exterior/1st/2nd/basement
│   ├── snaketown/
│   ├── island-village/
│   ├── logging-camp/               # NB: delete plague-village — it's a subset of this
│   ├── dwarf-city-wall/
│   ├── druid-circle/
│   └── harpy-cliffs/
├── scenes/                         # single-purpose maps, filed by what they are
│   ├── execution/                  # gallows, scaffolds, plazas
│   ├── tavern-inn/
│   ├── throne-court/
│   ├── prison-dungeon/
│   ├── crypt-catacomb/
│   ├── sewer/
│   ├── arena/
│   ├── temple/
│   ├── shop-interior/
│   ├── town-street/
│   ├── docks-ship/
│   ├── wilderness/
│   └── tower/
├── modules/                        # Foundry module packages (.rar/.zip) — NOT loose images
└── unsorted/
    └── castle-fort/                # the 1,217, until captioned and filed

~/Documents/DriveThruRPG/           # plain folder once the app is removed; source for the move
└── <Publisher>/<Product>/          # full-fat originals incl. all print files

~/Documents/GitHub/pentaryn/
├── foundry/map-index.json          # the manifest
└── scripts/foundry/
    ├── dtrpg_progress.sh           # (exists) sync monitor
    ├── map_extract.py              # cache → OneDrive, VTT files only
    ├── map_index.py                # build/refresh the manifest + thumbnails
    ├── map_caption.py              # AI captions for unnamed maps
    └── map_stage.py                # OneDrive staging → Foundry Data/assets
```

---

## Workflow: "I need maps for next session"

1. Open `_index/contact-sheet.html`, type what you want — *gallows*, *two-level tavern*, *sewer*.
2. Filter narrows live across captions, tags, product names and publishers.
3. Click a result to copy its path.
4. Drop chosen maps into `_staging/<campaign>/`.
5. Run `map_stage.py --campaign <world-id>` — copies them to `Data/assets/maps/<world-id>/`.
6. In Foundry, create scenes from those files. Grid sizes come from the manifest where known.
7. Anything used repeatedly across campaigns gets promoted to `_common/`.

## Workflow: "a new purchase arrives"

1. Let the Library App sync into its own folder. Don't intervene.
2. Run `map_extract.py` — pulls VTT-resolution files only into `scenes/` or `sets/`, and routes
   `.rar`/`.zip` module packages to `modules/` instead.
3. Run `map_index.py` — refreshes the manifest, generates thumbnails, rebuilds the contact sheet.
4. Anything it can't classify lands in `unsorted/` for captioning.

---

## Build order

**Order matters now that the app is going away:** retry the failed `Part_4.zip` from the app's error
list *while the app is still installed*, then remove the app, then reorganise. Doing it in the other
order makes the retry much harder.

**Before the sync finishes** — nothing that touches files:

1. **Write `map_extract.py`.** It's the gate everything else waits on, and it needs the finished tree to
   run against anyway.
2. **Delete `plague-village/`.** Verified: all 8 of its files are byte-identical to their counterparts
   in `logging-camp/`, which also has one file it lacks. It is a strict subset with a misleading name —
   there is no actual plague-village map set in the library. Remove it before indexing so those maps
   aren't captioned twice.

**After the sync completes:**

3. **Extract by moving, not copying.** 76 GB becomes ~5 GB of VTT-ready images in OneDrive with no
   duplication, because nothing manages the source folder any more. Biggest single win.
4. **Separate the modules.** `.rar`/`.zip` products install into Foundry as modules — they must not sit
   in an assets folder pretending to be maps.
5. **Index and thumbnail.** Cheap, mechanical, and makes the library visible for the first time.
6. **Caption the 1,217.** Slowest step, highest value, and it runs unattended. Do it last because
   nothing else depends on it — and the moment it lands, 88% of the library stops being dead weight.
7. **Stage Space Journey's ten scenes** and build them out.
