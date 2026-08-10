---
created: 2026-08-09
last-modified: 2026-08-09
tags: ["#playbook", "#roll20", "#vtt", "#maps"]
status: active
---

# Roll20 Map Prep

> Getting a battlemap into Roll20 on a correctly-sized grid. Written after doing it
> five times by browser automation on the **Ardenhaven** campaign — including the
> parts that went wrong.

**Campaign reference:** Ardenhaven = campaign ID `21523572`.
Editor URL: `https://app.roll20.net/editor/setcampaign/21523572`

---

## TL;DR — the working recipe

The order matters. **Set the page size first, then drop the image and hit "Fit to Page."**
That one trick removes all manual alignment.

1. **Upload the images** — *human does this.* Art Library → My Library → Upload. (See
   [Why upload can't be automated](#why-upload-cant-be-automated).)
2. **Create a blank page** — Page Toolbar → Create Page → **Create Blank Page**.
3. **Set the page size in cells** *before* placing anything — gear on the page card →
   Page Settings → Width/Height in `cells`.
4. **Select the MAP layer** in the left LAYERS rail.
5. **Drag the art** from the Art Library panel onto the canvas.
6. Roll20 asks **"Change size for VTT?"** → click **Fit to Page**.

Done. The image now fills the page exactly and the grid lines up.

---

## Grid math

Roll20's default cell is **70 px**. A page of `N × N` cells is therefore `70N × 70N` px.

Work out how many 5-ft squares a map is *supposed* to be, then set the page to that many
cells. Never try to match pixels directly.

| Source map | Native px | Squares | Page setting | Result |
| ---------- | --------- | ------- | ------------ | ------ |
| 2048 × 2048 battlemap set | 41 px/square | 50 × 50 | `50 × 50 cells` | upscaled to 3500², slight softness |
| 3500 × 3500 battlemap set | 70 px/square | 50 × 50 | `50 × 50 cells` | **1:1, pixel-perfect** |
| DnDMasterDesigns castle set | *ungridded* | unknown | estimate, then eyeball | needs a manual nudge |

**3500 px is the sweet spot** — it's exactly 50 cells at Roll20's native 70 px, so no
resampling at all.

### Measuring an unknown map's grid

If a pack ships a `-gridlines` variant, you can measure the period instead of guessing.
Average each pixel column's brightness, high-pass it (subtract a ±6 px local mean) to
isolate thin lines, then autocorrelate over candidate lags.

Read the result carefully: **peaks appear at harmonics.** A 2048 px map returns strong
peaks at 41 / 82 / 123 / 164 px — the *fundamental* (41) is the answer, giving 50 squares.

A genuinely ungridded map scores ~0.1 where a gridded one scores ~19. That two-orders-of-
magnitude gap is a reliable "this map has no grid" detector — don't try to force a number
out of it, just fit it by eye against a doorway.

`sips -s format bmp` + a stdlib BMP parse is enough; no Pillow or ImageMagick needed
(neither is installed on this machine).

---

## UI map — where things are

### Page Toolbar

Opened by the toolbar button at the **top-right of the canvas area**.

- Page cards sit in a grid; the folder tile is first.
- **Hover a card** to reveal two controls in its top-right corner:
  - **⋮ kebab** ≈ card-centre-x **+16 px**
  - **⚙ gear** ≈ card-centre-x **+47 px** — this opens **Page Settings**
  - both at roughly card-image-top **+15 px**
- **Clicking a card body** switches the *GM view* to that page. It does **not** move the
  players — the player ribbon at the top stays where it is. Safe to click around.

### Page Settings modal

| Field | Notes |
| ----- | ----- |
| Page Name | free text |
| Width / Height | in `cells` — the field you want. The `px` field updates automatically |
| Cell Size | `70 px/cell` default — leave it |
| Scale | `5` + `Feet` — already correct by default |
| Grid | on, `Square`, `D&D 5e / 4e` diagonals — already correct by default |

Only Name and Width/Height ever need touching.

### Layers rail (bottom-left)

`TOKENS · GM · MAP · FORE · LIGHT`. **Select MAP before dropping a battlemap**, or it
lands on the token layer and players can shove it around.

### Art Library panel

Right sidebar → Art Library tab → **My Library**.

- The search box searches your uploads *and* premium/web. Your own files appear under
  **"From your Library"**.
- Roll20 **transcodes uploads to `.webp`** — search for the stem, not the extension.
  `harbor-smugglers-cave.jpg` becomes `harbor-smugglers-cave.webp`.
- Panel hint: *"Drag to place art, **Alt-drag** to retain dimensions."* Plain drag +
  "Fit to Page" is what you want for battlemaps; Alt-drag is for props and tokens.

---

## Why upload can't be automated

This is a hard wall, not a missing trick.

The Art Library's **Upload** button opens a **native OS file picker** — outside the page,
undriveable by browser automation, and liable to wedge the session if triggered.

There is no hidden image `<input type="file">` to target instead. The *only* file input
in the whole DOM is the jukebox's Dropzone, which declares `accept="audio/*,.ogg"` and
posts to `/audio_library/upload`. Pushing images into it silently fails — the files land
in the element and Dropzone discards them (`files.length` goes straight back to `0`), so
it looks like it worked when nothing happened. **Verify uploads by searching the library,
never by assuming the tool call succeeded.**

So the split is:

- **Human:** drag a folder of images into Art Library → Upload. Thirty seconds.
- **Agent:** everything downstream — pages, sizing, placement, naming.

Staging helps: curate and rename the files into one folder first (`~/Downloads/<batch>/`)
so it's a single select-all-and-drag.

---

## Can the Mod Scripts API do this instead?

Short answer: **no, and not just because of the subscription.** Three independent walls.

**1. Mod Scripts are Pro-only.** The feature is "exclusive to Pro subscribers, or to
players in a Game created by a subscriber." This account is **Plus Yearly** — so the API
isn't available at all today.

**2. Even on Pro, you cannot create pages.** `createObj` accepts only
`graphic`, `text`, `path`, `character`, `ability`, `attribute`, `handout`, `rollabletable`,
`tableitem`, `macro`. Passing `page` throws *"Tried to create an invalid object type."*
Pages must be made in the UI regardless of tier.

**3. Even on Pro, you cannot upload.** `imgsrc` must already point at a Roll20-hosted
library image — `https://s3.amazonaws.com/files.d20.io/images/…` **including the `?`
query string**, which is mandatory. External URLs and Marketplace art are rejected. So
the upload step stays manual no matter what.

That leaves exactly one step the API could take over: **placing and sizing a graphic on an
already-created page**, via
`createObj('graphic', { _pageid, imgsrc, left, top, width, height, layer: 'map' })`.

But "Fit to Page" already does that correctly in two clicks. **The API would automate the
one step that isn't the bottleneck.** Not worth a Pro upgrade for map prep alone — revisit
only if you're placing dozens of graphics per page, where exact `left`/`top` in a loop
beats dragging.

Note: the `Player_API` wiki page is the `player` *object* inside Mod scripts (names,
colours, online state) — not a REST API. **Roll20 has no public REST API** for campaign
management.

---

## Automation gotchas

Learned the hard way. The mistakes here cost real cleanup.

### Menus animate — never blind-click a fresh one

The **Create Page** dropdown fades in over ~2–3 s. A click fired at fixed coordinates
during the animation lands on whatever is underneath.

This is how eight junk `My Random Dungeon Scrawl` pages and eight stray browser tabs got
created: the intended target was *Create Blank Page* (right column) but the click landed
on *Generate Random* (left column, Dungeon Scrawl), which spawns an external tab **and** a
campaign page, every time.

**Rule: open the menu, screenshot, confirm the item's real position, then click.** Do not
put "open menu" and "click item" in the same blind batch.

The Create Page menu has two columns and they are not equivalent:

| Column | Items | Safe? |
| ------ | ----- | ----- |
| **Connect To Our Free Map Maker** | Create New, Generate Random, Connect Existing | ⚠️ external Dungeon Scrawl tabs + pages |
| **Create In Roll20** | **Create Blank Page** ✅, Upload Background | ⚠️ *Upload Background* opens a native picker |

### Coordinates drift

The browser window resized itself mid-session (1398 → 1442 → 1452 px wide) and every
cached coordinate shifted. Re-screenshot after anything that could reflow — page switches,
modal opens, window changes.

### Batch, but put screenshots at the seams

`browser_batch` is a big speedup for a *known* sequence (fill four fields and save). It is
actively dangerous across a state change. Good seam points: after opening a menu, after
switching pages, after a "Fit to Page" re-render.

Symptom of over-batching: the later actions in a batch silently no-op because the page was
still re-rendering. If a batch's outcome looks half-applied, that's why — redo the tail
steps individually rather than re-running the whole batch.

### Reviewing many images cheaply

To eyeball hundreds of candidate maps without burning a screenshot per image, build an
HTML contact sheet with base64-inlined thumbnails and screenshot *that* — ~24 maps per
image instead of one.

`file://` URLs are blocked by the browser extension. Serve the directory over
`http://localhost:<port>` with `python3 -m http.server` and navigate there instead.

---

## Source map library

Local map collection lives in OneDrive (Files-On-Demand — `du` reports 0 B until hydrated;
read every file once to pull it down):

```
~/Library/CloudStorage/OneDrive-Personal/DnD/Maps/
├── Battlemaps/                    156 files, 2048² and 3500², all 50×50 squares
│   ├── Cities and Settlements/    Tower-City, Towns, snaketown, logging-camp, island-village
│   ├── Wilderness-Maps/           druid-circle
│   └── Building Interiors/        Dwarf-Fortress
├── Castle & Fort Maps/            1,217 .jpeg — DnDMasterDesigns, ungridded, mixed sizes
└── *.pdf                          Google Drive links back to the original sources
```

**Gaps:** no dry caves, no classic corridor dungeons. 88 % of the collection is the castle
/ fort set. Use the source PDFs' Drive links to fill that.

**Known redundancy:** `plague-village/` is a byte-identical copy of `logging-camp/`
(md5-verified). The two `.zip`s duplicate the extracted folders beside them — ~744 MB.

---

## Ardenhaven pages built with this playbook

| Page | Size | Map | Hooks into |
| ---- | ---- | --- | ---------- |
| Ardenford — Middle Tier Streets | 50 × 50 | Tower-City Middle District 1 | *Quiet Lesson* (CR2), 12 Switchback Steps |
| The Old Lumber Camp — Spiders | 50 × 50 | Logging-Camp-Day | *Notice #2* (CR1), giant spiders, 80 gp |
| Deep Fall — The Ancient Halls | 50 × 50 | Dwarf-Fortress | Deep Fall Ruins / sealed sub-levels |
| The Harbour Undercave | 50 × 50 | Harpy-Cliffs Cave Level | *Distilled Alcohol* (CR2), Willowglass |
| Stone Breach — The Approach | 29 × 52 | Castle Maps 1125 | Stone Breach Ruins |
