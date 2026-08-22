---
title: "Foundry fire — the Fire Kit"
created: 2026-08-20
last_modified: 2026-08-20
status: active
tags: [context, foundry, tiles, fire, vfx, mass-edit, spider's-tear]
---

# Foundry fire — the Fire Kit

**Read this when:** acting on "set it on fire", "the building goes up", or "put flames here".
**Not this file:** placing anything else at a named spot → [`markers.md`](markers.md)

**Read this before acting on "set it on fire", "the building goes up", or "put flames here".**
Animated, looping, alpha-transparent fire you place as ordinary **Tiles**. No new module.
Built 2026-08-20 for **Scene 06 — The Fire** (Spider's Tear Opera House), but it is
scene-agnostic and works anywhere.

---

## The one-paragraph version

Foundry plays `.webm` video natively on the Tile layer — a fire tile is a **real placeable**:
copy/paste it, alt-drag it, scale it, rotate it, hide and reveal it. The art is 22 hand-picked
clips from the **free** JB2A library, living in a managed asset pack. On top of that sit **16
Mass Edit presets** (drag-and-drop, or paint with the brush) and **5 GM macros**. Nothing here
depends on Sequencer or Token Magic FX.

---

## Where the pieces are

| Piece | Where |
|---|---|
| The art | `Data/assets/tiles/tiles-01/fire/*.webm` — 22 clips |
| Thumbnails | `.../fire/thumbs/*.webp` — what the preset browser shows |
| Credits + full inventory | `.../fire/credits.txt` |
| Visual reference sheet | [`foundry/fire-kit-sheet.png`](../../foundry/fire-kit-sheet.png) — all 22 clips, one page |
| Source zip (source of truth) | OneDrive `DnD/foundry/assets/tiles-01.zip` |
| Presets | Compendium **Mass Edit: Presets (MAIN)** → folder **Fire Kit** |
| Macros | Macro folder **Fire Kit**, all GM-only (`ownership.default = NONE`) |

The pack came down the normal asset road — `make foundry-assets` — so it is recorded in
[`foundry/assets-manifest.json`](../../foundry/assets-manifest.json) and re-extracts on a fresh
machine. **Packs are append-only.** To add more fire art, publish `tiles-02.zip`; never edit
`tiles-01.zip` in place.

---

## Putting fire down — three ways, fastest first

### 1. The brush — this is the "spread it around" answer

Run macro **`🔥 Fire · brush`**. Click and drag across the map. Every stroke drops **the same
clip at the same size, snapped to one grid square** — `fire-small`, 1×1. Only the rotation
varies, which kills the stamped look without changing what it reads as.

Esc, or re-running the macro, stops the brush.

> ⚠️ **`random: true` in the brush settings is a trap.** It does not mean "vary the fire" — it
> means *pick a random preset from the palette on every stroke*. Load smoke and scorch into that
> palette and you get smoke in the middle of a burning room. The brush macro is deliberately
> **one preset, `random: false`, `scale: [1, 1]`**. If you widen the palette, turn random off.

**Why `fire-small` and not one of the other five flame clips** — the job is *players must know
which squares are on fire*, not photorealism. Rendered as a fully-painted floor:
`fire-05x05` is too wispy and leaves dark gaps; `fire-10x05` is sparse; `fire-mass` is a **hollow
ring** and reads as an outline, not an area; `fire-10x10` is decent but frays at the edges.
`fire-small` is dense, bright and fills its square, so one tile per square is unambiguous.
`fire-medium` is the closest runner-up — a bit chunkier and more explosion-like — if you ever want
to swap. See [`foundry/fire-kit-sheet.png`](../../foundry/fire-kit-sheet.png).

**Don't scale it up.** `fire-small` at 2×2 or 3×3 leaves dark islands between blobs — the clip
doesn't fill its own box. For a bigger area, paint more 1×1s.

### 2. Drag and drop

Tile layer → the Mass Edit **presets** button in the scene controls → folder **Fire Kit**.
Drag a preset onto the map.

### 3. Copy and paste

A placed fire tile is just a Tile. `Ctrl+C` / `Ctrl+V` on the Tile layer, or hold `Alt` and drag
to duplicate. Paste works across scenes within the same session.

---

## The presets

All sized in **grid squares** and authored against a 100 px / 5 ft grid; Mass Edit rescales them
to whatever the target scene uses. (The Opera House is 100 px; the Dragonsfall is 150 px. Both
come out the right number of feet.)

| Preset | Squares | Notes |
|---|---|---|
| `Fire · patch 1×1` | 1×1 | **The workhorse, and what the brush uses.** One clip (`fire-small`), random rotation only |
| `Fire · patch 2×1` | 2×1 | random rotation |
| `Fire · patch 2×2` | 2×2 | **The other workhorse.** random rotation |
| `Fire · blaze 3×3` | 3×3 | a dense mass — a fully-involved room |
| `Fire · line 5 / 10 / 15 / 25 ft` | 1×1 … 5×1 | **rotation 0 on purpose** — aim these along a wall |
| `Fire · ring 4×4` · `ring 9×9` | 4×4 · 9×9 | a burning perimeter |
| `Fire · flare-up (once)` | 6×6 | **loop off** — a beam gives way |
| `Fire · burst (once)` | 4×4 | **loop off** — an explosion |
| `Embers` | 3×3 | glowing cracks; put *under* flames, or leave behind after |
| `Scorch` | 3×3 | blackened ground; the aftermath |
| `Smoke · plume` | 2×2 | 3 clips, random pick |
| `Smoke · column` | 2×3 | a rising column |

⚠️ **The line presets deliberately don't spin.** Everything else randomises rotation, which is
what you want for a flame patch and exactly wrong for a 25 ft wall of fire. Rotate those by hand
to match the wall.

---

## The macros

All five are in the **Fire Kit** macro folder and are **GM-only**. Drag them to the hotbar.

| Macro | Does |
|---|---|
| `🔥 Fire · brush` | Paints `Fire · patch 1×1`, one clip, grid-snapped. See above. |
| `🔥 Fire · reveal (it takes)` | **The one that matters.** Unhides every hidden Fire Kit tile on the scene, spreading **outward from the first one you placed**, ~220 ms apart. |
| `🔥 Fire · hide all` | Hides them again. GM still sees them ghosted. |
| `🔥 Fire · flicker lights` | Toggle. Drops an **AmbientLight with the `flame` animation** on every flame tile — dim = 2× the tile's width in feet, bright = ¾, `#ff7b29`, α 0.45. Run again to clear. Skips scorch and smoke tiles. |
| `🔥 Fire · douse (delete all)` | Deletes every Fire Kit tile **and** every light this kit made, on this scene. Asks first. |

The macros find their tiles by path — `texture.src` containing `tiles-01/fire` — so they only
ever touch Fire Kit tiles and never your map art. The lights are tagged
`flags.world.firekitLight` (custom flag scopes are rejected by Foundry; `world` is the legal one).

---

## The workflow this was built for

> *"I won't have it down right away — I need it ready so I can add it in once the fire takes."*

1. **Ahead of the session**, paint the fire where it will end up: the brush, then Mass Edit's
   select tool → set `hidden: true` on the lot. Or spawn hidden and reveal later.
2. **At the table**, when the fire takes: run `🔥 Fire · reveal (it takes)`. It blooms outward
   from the seat of the fire over a few seconds.
3. Optionally run `🔥 Fire · flicker lights` for the light to match.
4. Later, `🔥 Fire · douse` clears it, or drop `Scorch` and `Embers` over the ruin.

Sound is already in the world if you want it — `mad-endlesswiz` has `Fire-Blaze.ogg` and
`Fire-Burning.ogg`, `pentaryn-seafoot-maps` has `House_Fire_Glass_Loop.wav` and
`Gentle_Fire_Loop.wav`. Drop one as an ambient sound at the seat of the fire.

---

## Gotchas

**Layering is placement order, not the preset.** Mass Edit overwrites `sort` with an incrementing
counter as it spawns, so the `sort` values baked into the presets don't survive. Place in the
order you want stacked: **scorch → embers → flames → smoke**. Whatever goes down last sits on top.

**Everything sits at `elevation: 0`**, deliberately — so fire renders *under* tokens and the party
stands in front of the flames. If you want smoke *over* the tokens, raise that tile's elevation by
hand — but check it against **Levels** first, which hides tiles outside the current floor's band.
The Opera House is a Levels scene.

**Occlusion is `NONE` on every preset.** Otherwise **Better Roofs** / roof tiles would fade the
flames out from under the party.

**A backgrounded browser tab pauses video.** If fire looks frozen while you're checking something
in another window, that's Chrome, not Foundry. It resumes on focus. This also means a scripted
check of `video.paused` from a background tab always reads `true` — don't diagnose off it.

**Video tiles cost GPU, not much CPU.** Forty flame tiles on one screen is fine; four hundred is
not. If a whole wing has to burn, reach for the line presets along the walls rather than filling
every interior square.

**`🔥 Fire · douse` deletes every Fire Kit tile on the scene**, including ones you placed by hand
and want to keep. It shows the count and asks first — read the number before saying yes.

**Scripted cleanup must pin the scene id, not use `canvas.scene`.** Learned the hard way on
2026-08-20: a test sweep matching "every fire tile on the active scene" ran while the active scene
had changed under it, and deleted four tiles Joe had just painted. They were recoverable from
`canvas.tiles.history`, which stores full document data for deletes — but the rule is to tag
throwaway tiles (`flags.world.claudeTest`) and delete only those.

---

## Licence

JB2A free library, **CC BY-NC-SA 4.0** — <https://jb2a.com>. Non-commercial. Home-table use is
fine; don't ship these in anything you sell. Full note in
`Data/assets/tiles/tiles-01/fire/credits.txt`.

**If you ever want more than 22 clips:** the full free JB2A module (1.6 GB, verified v14) installs
from `https://raw.githubusercontent.com/Jules-Bens-Aa/JB2A_DnD5e/main/module.json` and Mass Edit's
virtual directory will index all of it. The paid
[Animated Fire by Matt.M](https://foundryvtt.com/packages/animated-fire-by-mattm) adds 45 more fire
clips and its own Tile-controls button — worth it only if 22 clips start feeling repetitive.
