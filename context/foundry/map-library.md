# Map library — where the battlemaps are and how to find one

**Read this when:** looking for a battlemap ("find me a map for…", "do I have a…"), working out
which maps go together (tiles, floors, variants), or filing a new pack into the library.
**Not this file:** getting a chosen map into a scene → [`foundry-ops`](ops.md) (creating scenes) and
[`scene-links.md`](scene-links.md) (floors and moves between them); the never-built reorganisation
plan → [`../plans/map-library-design-2026.md`](../plans/map-library-design-2026.md) (history).

Checked 2026-10-17 against the cloud listing: **1,371 images** in `OneDrive/DnD/Maps`.

---

## Where the maps are

The library lives in OneDrive at **`DnD/Maps`**. Reach it through **rclone** with the `onedrive:` remote
(the same one the Foundry backups use, see [`ops.md`](ops.md) §3):

```bash
rclone lsf -R --files-only onedrive:DnD/Maps | grep -i dock    # search by name, nothing downloaded
rclone lsd onedrive:DnD/Maps/Battlemaps                        # browse one level
```

- **Don't read the Windows path** (`/mnt/c/Users/AtJos/OneDrive/DnD/Maps`). On BOSS those are cloud-only
  placeholders and the OneDrive app isn't running, so every read fails with an I/O error. rclone works.
- **Don't download the library to search it.** The filenames below and `rclone lsf` are enough to shortlist
  candidates. Fetch only the few you want to look at (see "Looking at a candidate").
- On the Mac the same folder is `~/Library/CloudStorage/OneDrive-Personal/DnD/Maps`. The DriveThruRPG
  originals (print files and products not yet copied to OneDrive) were in `~/Documents/DriveThruRPG/` on
  the Mac. That's where the older "~1,750 maps" figure came from. Not checked from BOSS. Ask the
  `mac-pentaryn` session if you need it.
- What is in Foundry is separate: `Data/assets/maps/roll20/` (6 Ardenhaven maps, see
  `foundry/roll20-maps.json`) and `Data/assets/maps/space-journey/` (2). Only maps picked for a campaign
  are copied in, into `assets/maps/<world-id>/`, because everything under `Data/` shows in every world's
  file picker.

## Layout

```
DnD/Maps/
├── Battlemaps/                                  148  named maps, see the catalog below
│   ├── Cities and Settlements/
│   │   ├── Towns/                                38  the town kit + Mapvember buildings + streets
│   │   ├── Tower-City/                           26  one vertical city, many levels
│   │   ├── Abandoned-Village/                     9
│   │   ├── Dwarf-City-Wall/                      11
│   │   ├── island-village/                       19
│   │   ├── logging-camp/                          9
│   │   ├── snaketown/                             8
│   │   ├── snaketown-tower/                       3
│   │   └── harpy-village/                         3
│   ├── Building Interiors/Dwarf-Fortress/         1
│   └── Wilderness-Maps/druid-circle/             21
├── Castle & Fort Maps/                        1,217  "Castle Maps - <n> - DnDMasterDesigns.jpeg", no captions
├── _ardenhaven-next-picks/                        5  picks for Ardenford (already used for its Roll20 maps)
├── Castle Maps - 220 - DnDMasterDesigns.jpeg          a stray copy of #220
├── Battlemaps-…zip, Castle & Fort Maps.zip            the same images zipped. Don't unpack them
└── BattlemapsLink.pdf, DownloadMapsHere.pdf           download-link sheets, not maps
```

Filenames carry a 6–8 digit upload id before `.jpg` (`Town-Streets-17538848.jpg`). Ignore it when matching
names. Nearly every Battlemap is **2048×2048**. The exceptions: Dwarf-Fortress and Harpy-Cliffs are
3500×3500, Snaketown is 1600×1600, and `Snaketown-Tower-for-Roll20` is 7500×7500.

## How the maps go together

There are three kinds of relationship. Know which one you have before you build a scene:

| Kind | What it means | How to use it in Foundry |
|---|---|---|
| **Tiles** | Separate pieces that sit side by side to make a bigger area | Place them as tiles on one large scene |
| **Floors** | The same footprint at different heights (exterior/roof, interior, upstairs, basement) | One scene per floor, linked with [`scene-links.md`](scene-links.md) |
| **Variants** | The same map with different lighting, weather, season or grid | Pick one, or swap the background for a time-of-day change |

### Tiles — the only real building blocks

**The town kit** (`Battlemaps/Cities and Settlements/Towns/`). One artist, all 2048×2048, the same
look, and roads, walls and water run off the edges:

- **Town walls:** `Town-Walls-B`, `-C`, `-E`, `Walls-X-A`. Corners and straight runs of a town wall
  with round towers and square gatehouses.
- **Harbour:** `Town-Street-Docks-Day-1` … `-4` (with `-Night-1` … `-3`). Piers, a bay and waterfront.
- **Town edge:** `town-forest-day-1` … `-4` (with `-night-1` … `-4`). Houses that thin out into woods
  and ravines.
- **Inner town:** `Town-Streets-1` (with `-1-night`). Dense blocks of houses.

Every tile has a dark vignette around its border, so the joins show a dark seam. The edges don't
continue pixel for pixel, so **nobody has worked out which tile goes next to which**. Lay them out
and look. Crop or fade the vignettes if the seams matter.

`Town-Streets-2` and `Town-Streets-Draft` are a different, close-up scale. They are **not** part of the kit.

**Snaketown** (`snaketown/`): `west-snaketown`, `snaketown-mage-guild`, `Southeast-snaketown`,
`snaketown-east-docks` (each with `-night`). Named like quarters of one swamp town on stilts, but their
edges don't line up. Treat them as four views of the same town, not as a grid.
`snaketown-tower/` is the town's tower, a separate map.

### Floors

- **Tower-City**: one vertical city.
  - From the top: `Top-Floor` / `Balcony`, then `Upper-Streets` / `Upper-Interiors`, then
    `Middle-District-1` … `-4` (each as `-Exteriors` and `-Interiors` of the same footprint), then
    `Lower Streets _1_` / `_2_` and the `50x50-tower-city-maps-*` street maps, then `Underground-1`
    / `-2` (lava and gears).
  - `Tower City Interiors _1_` / `_3_` / `_4_` are extra interiors.
  - `streets` and `streets-tower` are the same map with one quarter swapped for a tower.
- **Abandoned-Village**: `Exterior`, `1st-Floor` (with or without `-Trimmed-Trees`), `2nd-Floors` and
  `Basement`, in `Summer` and `Winter`.
- **Mapvember buildings** (`Towns/`): Warehouse (exterior, floors 1 and 2), Factory (floors 1 and 2),
  Vault (stories 1 and 2), Office (exterior and interior). Inn, Temple and Laboratory are single maps.
- **Harpy-Cliffs**: building interiors and a cave level. The files are undressed versions, with no
  furniture or clutter.

### Variants (one map each)

- `Dwarf-City-Wall`: day or night, with or without fog, with one dragon or several.
- `logging-camp`: day or night, summer or winter, with or without snow.
- `island-village`: calm or raging sea, sky, swamp or planar, with darkness or snow. `island-tower`
  is an unfinished extra.
- `druid-circle`: base, a magic circle for each element (air, earth, fire, ice, magma, water), with or
  without mist and darkness.
- `Inn-at-the-Docks-Exterior` and `Abandoned-Mining-Company-Exterior` are single maps.

## Castle & Fort Maps — 1,217 rooms with no captions

`Castle & Fort Maps/Castle Maps - <n> - DnDMasterDesigns.jpeg`, n = 1 … 1217.

- Each one is a **standalone, AI-rendered castle or keep room or floor** on a black background:
  great halls, taverns, bedrooms, offices, chambers. None of them are tiles.
- There are only five sizes: 2048×2048, 1632×2912, 2912×1632, 1856×2464 and 2464×1856.
- They are plain JPEGs: **no Foundry walls, doors or lights** (and no Universal Battlemap Import
  `.dd2vtt` files). Walls are drawn into the art, but in Foundry you wall them by hand.
- **There is no grid size you can trust.** They're AI renders. Some have faint floor tiles, but not
  at a fixed size. Set the grid by eye per map, sized so a doorway is about one 5 ft square.
  The Battlemaps, by contrast, have a real grid and a `5ft` scale marker in the corner.
- **Nothing is captioned yet**, so a name search finds nothing in this folder. To find "a throne
  room" here you have to look at images.
- If that comes up more than once, write the captions once into a committed index (a one-line
  description and tags per number). Don't caption the same images again in every session.

## Looking at a candidate

Fetch only the maps you shortlisted. Put them in the session scratchpad, shrink them, and read the
small copy:

```bash
rclone copyto "onedrive:DnD/Maps/Battlemaps/Cities and Settlements/Towns/Town-Walls-B-Compressed3133285.jpg" "$SCRATCH/m.jpg"
.venv/bin/python -c "from PIL import Image as I; i=I.open('$SCRATCH/m.jpg'); i.thumbnail((800,800)); i.save('$SCRATCH/m-small.jpg')"
```

To compare several, put them side by side in one image (a contact sheet) instead of reading each one.
A full-size map costs far more to view and shows no more at this scale.

## Filing a new pack

1. Upload the VTT-resolution images only (not the print or A1 poster files) to `onedrive:DnD/Maps/Battlemaps/<category>/<set>/`:
   `rclone copy <folder> "onedrive:DnD/Maps/Battlemaps/<category>/<set>"`.
   Keep a multi-map set in one folder. Its value is that the maps go together.
2. Add it to the layout and the right section above (tiles, floors or variants) in the same change.
