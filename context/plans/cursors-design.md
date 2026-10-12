---
title: Tool-cursor set — design (pentaryn-cursors, plan C4b)
created: 2026-10-08
last_modified: 2026-10-12
tags: ["plan", "foundry", "pentaryn-cursors"]
status: built (pentaryn-cursors 0.1.0); history, not instructions
---

# pentaryn-cursors — tool-cursor set (design)

**Read this when:** building or changing the cursor set. Plan: `context/plans/table-feedback-2026-10-08.md`
§C4b. The table problem: players could not tell which scene tool they were on, so pins "stopped
working" and AoE placement was "fiddly". The fix is not to change any tool; it is to make the active
tool visible on the mouse pointer itself, so the GM can ask "do you have the arrow?"

Moved here from `foundry/module/pentaryn-cursors/DESIGN.md` on 2026-10-12 (cursors guide step 8,
C13). Since then the build tool is `scripts/foundry/cursors/build.mjs` and the icon sources and
`CREDITS.md` are in `scripts/foundry/cursors/src/` (step 7); the paths below are as designed.

## Rules

1. **Select is the plain system arrow on every layer.** No asset. Arrow = "I can click and move
   things" = home. Over a clickable thing it is the plain system hand. Nothing else is ever an arrow.
2. **Every other tool is a coloured glyph that matches the button the player pressed.** The ruler
   cursor is the ruler button's glyph; the drawing cursor is the pencil button's glyph. Self-
   discoverable: the pointer looks like the thing you clicked.
3. **One glyph per job, not per tool.** All five drawing tools share the pencil; the dnd5e template
   preview and any future AoE tool share the area glyph. Fewer cursors, fewer things to learn.
4. **Hotspot is where the action happens**: centre for a reticle, tip for a pin or pencil, the near
   end for a ruler. A player who clicks "where the picture points" is right.
5. Canvas only. Windows, sidebar and HUD keep Foundry's normal cursors.

## The set

| Key | When (control · tool, or layer) | Glyph | Source | Colour | Hotspot (32×32) |
|---|---|---|---|---|---|
| `select` | `*.select` (tokens, notes, drawings); any toggle/button tool; no match | — | system `default` / `pointer` | — | — |
| `target` | `tokens.target` | crosshair ring + centre dot | `target--delapouite-crosshair.svg` | **Ember** `#FF5252` | `16 16` (centre) |
| `ruler` | `tokens.ruler` | diagonal ruler with ticks | `ruler--fa-free-ruler.svg` | **Brass** `#FFD43B` | `25 6` (centre of the bar's top-right end face; was estimated `27 5`, measured at build) |
| `aoe` | `canvas.activeLayer === canvas.templates` (dnd5e `drawPreview` / `pentaryn-aoe` placement), any tool | four chevrons converging on an empty centre | `aoe--delapouite-convergence-target.svg` | **Glow** `#4DD9FF` | `16 16` (centre; the open middle shows the exact point) |
| `note` | `notes.journal` (TRUSTED+; place a pin) | map pin | `note--delapouite-position-marker.svg` | **Rose** `#FF6AD5` | `16 28` (pin tip) |
| `draw` | `drawings.rect` `.ellipse` `.polygon` `.freehand` `.text` (TRUSTED+) | pencil | `draw--fa-free-pencil.svg` | **Moss** `#69E05A` | `3 28` (pencil tip, bottom-left; was `4 28`, measured at build) |

Not in the set, on purpose:
- `tokens.unconstrainedMovement` (GM), `tokens.echtoggle` (Argon), `tokens.ptAttrReview` (ties) are
  toggles/buttons; the active *tool* does not change when they are pressed, so neither does the cursor.
- Pings are a long-press, not a tool. Nothing to show.
- `grab` / `grabbing` (dragging a token or panning) stay the system hands for every tool. The thing
  being dragged already says what is going on.
- Walls, lighting, sounds, tiles, regions are GM-only layers; the GM gets the arrow there. Add keys
  later if the GM wants them; the mechanism is per-key and does not care.
- Notes `select` is the arrow even though a pin can be clicked from it. Arrow means "clickable"
  everywhere; that is the point.

### Why these glyphs (and the alternates kept in `assets/src/alt-*`)

Judged on a 32-px render on `#1A1D24` (the colour of an unlit Underdark map) and on white:
- **Crosshair** (Delapouite) over FA `bullseye`: the bullseye becomes a solid disc at 32 px; the
  crosshair stays a reticle. The plan asked for a crosshair.
- **FA `ruler`** over Delapouite `measure-tape`: the tape's curl and ticks turn to mush at 32 px; the
  FA bar reads, and it is the Ruler button's own glyph (`fa-solid fa-ruler`).
- **Convergence target** over Lorc `compass`: the plan said "compass", but the compass rose is a
  burst at 32 px and reads as navigation, not "put the area here". Four chevrons closing on an empty
  centre say exactly that, and the empty centre shows the point the template will originate from.
  **Joe's call** — `alt-aoe--lorc-compass.svg` is kept if he wants the compass anyway.
- **FA `pencil`** over Delapouite `pencil`: the Delapouite one is a thin diagonal that nearly vanishes
  at 32 px; FA's is bolder and is the Drawings control's own glyph (`fa-solid fa-pencil`).
- **Position marker** for pins: unambiguous "put a marker here", tip is a natural hotspot.
- Quill (`alt-text--lorc-quill.svg`) is there if Joe wants the text tool distinct from shapes.
  Default is no: one pencil for all drawing.

Credits and licences: `assets/src/CREDITS.md` (game-icons.net CC BY 3.0: Delapouite, Lorc;
Font Awesome Free 6.7.2 CC BY 4.0). Attribution must be copied into the README when the module ships.

## Colours

Underdark maps are near-black with cold blue-grey and purple; the Foundry UI is dark too. Each tool
colour is a high-luminance hue, and the five hues sit ~60–70° apart so no two are confusable:

| Name | Hex | Hue | Contrast on `#1A1D24` | Contrast on white |
|---|---|---|---|---|
| Ember (target) | `#FF5252` | 0° | 5.3 : 1 | 3.2 : 1 |
| Brass (ruler) | `#FFD43B` | 47° | 11.8 : 1 | 1.4 : 1 |
| Glow (aoe) | `#4DD9FF` | 193° | 10.2 : 1 | 1.7 : 1 |
| Rose (note) | `#FF6AD5` | 317° | 6.6 : 1 | 2.5 : 1 |
| Moss (draw) | `#69E05A` | 113° | 10.0 : 1 | 1.7 : 1 |

The low numbers on white do not matter because every cursor carries a dark outline, and the high
numbers on dark do not depend on the outline. Both together make the cursor read on any map:

- **fill:** tool colour
- **outline:** `#101216`, 2 px (at 32 px) on the glyph's own edge, `paint-order: stroke` so it does
  not eat the fill
- **halo:** white `#FFFFFF` at 70 % alpha, 1 px outside the outline (a second copy of the path
  behind, stroked 4 px). On a black map the halo is what separates Ember from the dark; on a pale
  map the outline does the same job.

### Pointer state

`pointer` (over a token, pin, drawing, template the tool can act on) is the **lit** version of the
same glyph: fill `#FFFFFF`, outline in the tool colour (2 px), same halo and hotspot. "It lit up"
is the whole message; no second shape to learn. `default-down` and `pointer-down` reuse the
`default` and `pointer` images unchanged.

### Visual spec

- Canvas 32×32 px, transparent background.
- Glyph scaled uniformly so its bounding box fits a 26×26 box, centred on (16, 16), *before*
  outline and halo are added (they then stay inside the 32 box). game-icons SVGs already pad to
  ~28/32; FA SVGs are tightly cropped (0 0 512 512 is the glyph), which is why the fit step exists.
- Hotspots above are computed from the glyph bounding box after that fit, rounded to the pixel:
  crosshair and convergence centre `(16,16)`; marker tip `(16,28)` (fitted bbox x 8.5–23.5,
  y 3–29); pencil tip `(4,28)` (fitted bbox 3–29, tip is the bottom-left corner of the bar);
  ruler `(27,5)` (the centre of the bar's top-right end face). The build script recomputes them
  from the fitted path extremes and fails if they drift by more than 1 px.
- Emit each cursor at **1× (32×32)** and **2× (64×64)** PNG. Hotspot stays in CSS px.

## Files

```
foundry/module/pentaryn-cursors/
  module.json            id pentaryn-cursors, esmodules ["cursors.mjs"], styles ["cursors.css"]
  cursors.mjs            hooks + game.pentaryn.cursors, ~80 lines
  cursors-core.mjs       pure: keyFor({control, tool, layerIsTemplates}) → key | null; node-tested
  cursors.css            one rule block per key
  lang/en.json           setting labels
  README.md              use-doc + the credits table
  test/run.mjs           keyFor() table test
  tools/build.mjs        node script: src SVG → outlined SVG → PNG at 1×/2× (uses a resvg/sharp
                         dev dependency, run by hand; outputs are committed)
  assets/src/            originals + CREDITS.md (this design's choice and alternates)
  assets/cursors/        target.png target@2x.png target-pointer.png … (built)
```

## As built (0.1.0) — where the build departs from this spec

- **No `cursors.css`; the variables are set inline on `#board` by `cursors.mjs`.** A `url()` inside
  a custom property is resolved against the base URL where `var()` is *substituted* — here Foundry's
  inline `style.cursor` on `#board`, i.e. the page — not against the stylesheet that declared it.
  The CSS-relative URLs below would therefore have pointed at `/game/assets/cursors/…`. The module
  instead writes the four variables inline with absolute URLs from
  `foundry.utils.getRoute("modules/pentaryn-cursors")` (route prefix still works) and keeps
  `data-pentaryn-cursor` on `#board` for inspection. `image-set()` is chosen by `CSS.supports`.
- **Hotspots are measured, not estimated.** `tools/build.mjs` finds them from the fitted glyph's own
  pixels (crosshair/chevrons: bbox centre; pin: lowest point; pencil: furthest down-left; ruler:
  centre of the furthest up-right face) and fails unless they equal `KEYS` exactly. Ruler `25 6`,
  pencil `3 28`; the rest match the table.
- `keyFor` also returns `null` for `tokens.*` tools not in the set (no accidental match across
  controls); `renderSceneControls` is a fourth refresh signal; control `onChange` is wrapped too.
- Outlined SVGs are written next to the PNGs in `assets/cursors/` for review.

## Mechanism (as designed — verified against v14.367 sources; see "As built" for the URL change)

**Where cursors come from.** `Game#configureCursors` (`client/game.mjs:1905-1922`) writes
`--cursor-default`, `--cursor-pointer`, `--cursor-default-down`, `--cursor-pointer-down`,
`--cursor-grab`, `--cursor-grab-down`, `--cursor-text`, `--cursor-text-down` on `:root` from
`CONFIG.cursors`. The PIXI event system is told (`client/canvas/board.mjs:1024-1026`) that mode
`default` means the string `var(--cursor-default)` and so on, and `setCursor` ends with
`this.domElement.style.cursor = style` — the `domElement` is the `#board` canvas
(`board.mjs:735`). The same `--cursor-*` variables are used by `foundry2.css` for buttons, links
and windows, so **do not change the root variables** — that would recolour the whole UI.

**The trick:** a custom property set on `#board` wins over `:root` for the canvas only, and an
inline `style.cursor = "var(--cursor-default)"` re-resolves live when the attribute changes. So
the module never talks to PIXI, never calls `configureCursors`, never patches anything:

```css
/* cursors.css — URLs relative to this file, so a Foundry route prefix still works */
#board[data-pentaryn-cursor="target"] {
  --cursor-default:      url("assets/cursors/target.png") 16 16, crosshair;
  --cursor-default-down: url("assets/cursors/target.png") 16 16, crosshair;
  --cursor-pointer:      url("assets/cursors/target-pointer.png") 16 16, crosshair;
  --cursor-pointer-down: url("assets/cursors/target-pointer.png") 16 16, crosshair;
}
@supports (cursor: image-set(url("a.png") 1x)) {
  #board[data-pentaryn-cursor="target"] {
    --cursor-default: image-set(url("assets/cursors/target.png") 1x,
                                url("assets/cursors/target@2x.png") 2x) 16 16, crosshair;
    /* …same for the other three */
  }
}
```

The keyword after the image is the fallback if the image fails to load: `crosshair` for target
and aoe, `cell` for ruler, `copy` for note, `crosshair` for draw. Not `auto`: a dropped image must
still look "not the arrow".

**When to recompute the key.** Three signals, all hooks:
- `getSceneControlButtons(controls)` — runs each time SceneControls prepares its data. For every
  non-toggle, non-button tool in every control, wrap `tool.onChange` so it calls `refresh()` after
  the original. This is necessary because a tool-only change inside the same control does **not**
  re-render SceneControls (`scene-controls.mjs:245-257` only flips `aria-pressed`), it only calls
  `tool.onChange(event, active)` via `#onToolChange` (`:510-512`). Control changes do re-render.
- `activateCanvasLayer(layer)` (`interaction-layer.mjs:94`) — catches the dnd5e template preview:
  `drawPreview()` calls `canvas.templates.activate()`, but the `templates` control is hidden in v14
  (`templates.mjs: visible: false, tools: {}`), so `ui.controls.control` stays `tokens` and
  `ui.controls.tool` stays whatever it was. Hence the `aoe` key reads **the layer, not the tool**,
  and takes precedence. When the preview ends dnd5e re-activates the initial layer, which fires the
  hook again and the key drops back. *Superseded on dnd5e 6 (0.2.0): placement is core
  `RegionLayer#placeRegions`, detected from `canvas.regions._placementContext` plus
  `canvas.regions.preview`; see README "The spell-area glyph".*
- `canvasReady` — set the initial key; `canvasTearDown` — clear the attribute.

```js
// cursors-core.mjs
export function keyFor({ control, tool, templatesActive }) {
  if (templatesActive) return "aoe";
  const k = `${control}.${tool}`;
  if (k === "tokens.target") return "target";
  if (k === "tokens.ruler") return "ruler";
  if (k === "notes.journal") return "note";
  if (control === "drawings" && ["rect", "ellipse", "polygon", "freehand", "text"].includes(tool)) return "draw";
  return null;                       // select, toggles, buttons, GM layers → system arrow
}
// cursors.mjs
function refresh() {
  const board = canvas?.app?.view; if (!board) return;
  const key = enabled() && keyFor({
    control: ui.controls.control?.name, tool: ui.controls.tool?.name,
    templatesActive: canvas.activeLayer === canvas.templates
  });
  if (key) board.dataset.pentarynCursor = key; else delete board.dataset.pentarynCursor;
}
```

`ui.controls.control` / `ui.controls.tool` are the v13+ getters (`scene-controls.mjs:179-191`);
`activeTool` is deprecated.

**API** (`game.pentaryn.cursors`, registered on `ready` the way `pentaryn-senses` does, merging
into a frozen `game.pentaryn` if another module froze it): `refresh()`, `current()` → key or null,
`keys` (the table above, for the test and the README). One **client** setting
`pentaryn-cursors.enabled` (default true) for anyone whose OS/browser fights custom cursors; it
calls `refresh()` on change. No world settings, no sockets, no document writes — this module is
purely per-client and needs no GM relay.

## Known limits

- Browsers cap custom cursors at 128×128 and may refuse them near screen edges when larger than
  32 CSS px; 32 px with a 2× raster is the safe ceiling, which is why the plan said 32.
- Safari and Firefox ignore `image-set()` in `cursor` in some versions; the `@supports` block is
  the upgrade path and the plain 1× rule is the floor.
- The cursor cannot change for the dnd5e **token-targeting in a chat card** flow or any other
  place that is not the canvas; that is correct, those are windows.
- One-shot tools dropping back to Select after use (plan §C4b "optional") is **not** here; it is a
  behaviour change and Joe wanted to try the cursors alone first. If wanted later it is a
  `tool.onChange` wrapper in the same `getSceneControlButtons` hook, nothing new.

## Acceptance (for the playtest agent)

As a **player** on an Underdark scene: Select → arrow; hover own token → hand. Target → Ember
crosshair; hover a token → white crosshair with Ember edge. Ruler → Brass ruler. Cast *Fireball*
from the sheet → Glow chevrons while the template follows the mouse, arrow again the moment it is
placed or cancelled (right-click, or Escape via pentaryn-aoe Part E; without that module only right-click cancels). With TRUSTED: Notes → Journal tool → Rose pin; Drawings → any shape →
Moss pencil; Drawings → Select → arrow. Open any window over the map → normal cursor inside it.
Turn the client setting off → every tool shows the arrow. Throughout, nothing in the sidebar or
any window changes.
