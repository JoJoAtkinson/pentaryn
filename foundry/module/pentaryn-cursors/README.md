# Pentaryn Tool Cursors

**Read this when:** a player can't tell which scene tool they are on, a map cursor looks wrong, or
you are changing the cursor set. Design and the why behind each glyph: [`DESIGN.md`](DESIGN.md).

The mouse pointer **over the map** shows the active tool, so "pins stopped working" becomes "you
have the pencil, click the arrow". Nothing about any tool changes; only what the pointer looks like.

| Pointer | When | Over something clickable |
|---|---|---|
| plain system arrow | **Select** on any layer, any toggle/button, GM layers (walls, lights, …) | system hand |
| red crosshair (Ember `#FF5252`) | Tokens → **Target** | white crosshair, red edge |
| gold ruler (Brass `#FFD43B`) | Tokens → **Ruler** | white ruler, gold edge |
| cyan converging chevrons (Glow `#4DD9FF`) | a **spell area** being placed (dnd5e 6 places it as a Region), whatever tool was on | white, cyan edge |
| pink map pin (Rose `#FF6AD5`) | Notes → **Journal** (place a pin) | white pin, pink edge |
| green pencil (Moss `#69E05A`) | Drawings → rectangle / ellipse / polygon / freehand / text | white pencil, green edge |

- The click lands where the picture points: centre of the crosshair and chevrons, tip of the pin
  and pencil, the top-right end of the ruler.
- Dragging and panning keep Foundry's grab hands. Windows, the sidebar and the HUD keep Foundry's
  normal cursors — only the `#board` canvas changes.
- **Setting (per browser):** *Configure Settings → Pentaryn Tool Cursors → Tool cursors on the map*.
  Off = the arrow for every tool. For anyone whose OS or browser fights custom cursors.
- **Console:** `game.pentaryn.cursors.current()` (key or `null`), `.refresh()`, `.keys`,
  `.keyFor({control, tool, templatesActive})`. `document.getElementById("board").dataset.pentarynCursor`
  shows the key too.

## How it works

Foundry sets `#board.style.cursor = "var(--cursor-default)"` (and `-pointer`, `-default-down`,
`-pointer-down`), with the variables on `:root` from `CONFIG.cursors`. The module sets those four
variables **inline on `#board`** for the active key, which overrides `:root` for the canvas only;
the root variables (which style the whole UI) are never touched, and nothing in PIXI is patched.
The image URLs are absolute (`foundry.utils.getRoute("modules/pentaryn-cursors")…`) because a
`url()` inside a custom property resolves against the page where `var()` is substituted, not
against a stylesheet; that is also why there is no `.css` file. `image-set()` 1×/2× is used only
where `CSS.supports` accepts it in `cursor`; otherwise the 32-px PNG.

The key is recomputed on: every control's and modal tool's `onChange` (wrapped in
`getSceneControlButtons`, because switching tool inside a control does not re-render the controls),
`renderSceneControls`, `activateCanvasLayer`, `canvasReady`, and a child being added to or removed
from `canvas.regions.preview`. `canvasTearDown` clears.

**The spell-area glyph (dnd5e 6, 0.2.0).** dnd5e 6 places every activity area through core
`RegionLayer#placeRegions` (`TemplatePlacement#_place`); `AbilityTemplate` and
`canvas.templates.preview` are no longer used, so 0.1.0's check never fired on 6. The glyph now shows
while the region layer has a `_placementContext` **and** that context's preview Region is in
`canvas.regions.preview` (`placementActive` in `cursors-core.mjs`). Both, because a GM drag-drawing a
region also fills the preview container without a context, and on cancel the preview leaves the
container while the context is still set. The preview joins the container on the first pointer
move, so the glyph appears as soon as the mouse moves after *Place*.

**Other scripts blanking the cursor.** Foundry's `setCursor` writes `#board.style.cursor` only when
its mode changes, so anything that sets it to `""` leaves the map on the system arrow (every tool
glyph and Foundry's own hands gone) until the mode next changes. Monk's Active Tiles does this on
every `canvasReady` and on hover-out of a pointer tile. The module therefore watches `#board`'s
`style` attribute and, when the cursor is blank, re-issues Foundry's current mode (also a tick after
`canvasReady`). `pentaryn-portals` writes the cursor only for the GM's `move` over a badge in edit
mode and puts the prior value back; don't add a module that blanks it on every pointer move.

Purely per-client: no documents, no world settings, no sockets, no GM relay.

## Files

- `cursors-core.mjs` — pure: `KEYS` (the set: colour, source, hotspot, fallback keyword),
  `keyFor()`, `cursorValues()`. `node test/run.mjs` proves the table and that every built image
  exists at 32 and 64 px.
- `cursors.mjs` — hooks, setting, `game.pentaryn.cursors`.
- `assets/src/` — unmodified icon sources and alternates (see Credits).
- `assets/cursors/` — built: `<key>.png`, `<key>@2x.png`, `<key>-pointer.png`, `<key>-pointer@2x.png`,
  plus the outlined `.svg` they were rasterised from. **Committed; do not hand-edit.**
- `tools/build.mjs` — rebuild after changing a glyph or colour in `KEYS`:
  `cd "$(mktemp -d)" && npm i @resvg/resvg-js@2.6.2 && node <repo>/foundry/module/pentaryn-cursors/tools/build.mjs`.
  It fits each glyph to 26×26, adds the 2 px dark outline and 1 px white halo, measures the hotspot
  from the fitted glyph and **fails unless it equals `KEYS[key].hotspot`** (so a new glyph can't
  ship with a stale hotspot — update `KEYS` to the printed value if the new one is right).

To add a key (e.g. a GM wall cursor): add it to `KEYS` and a line to `keyFor()`, drop the source SVG
in `assets/src/`, run the build, add the row to the test table.

Install: copy/sync the folder to `Data/modules/pentaryn-cursors` and enable it in the world; first
install needs a Foundry restart (module.json is read at startup).

## Credits

The cursor shapes are the artists' work, recoloured, outlined and rasterised by `tools/build.mjs`.

| Cursor | Icon | Artist | Licence |
|---|---|---|---|
| target | [Crosshair](https://game-icons.net/1x1/delapouite/crosshair.html) | [Delapouite](https://delapouite.com), game-icons.net | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| aoe | [Convergence target](https://game-icons.net/1x1/delapouite/convergence-target.html) | Delapouite, game-icons.net | CC BY 3.0 |
| note | [Position marker](https://game-icons.net/1x1/delapouite/position-marker.html) | Delapouite, game-icons.net | CC BY 3.0 |
| ruler | `ruler` (solid) | [Font Awesome Free 6.7.2](https://fontawesome.com), Fonticons, Inc. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| draw | `pencil` (solid) | Font Awesome Free 6.7.2, Fonticons, Inc. | CC BY 4.0 |

Unused alternates in `assets/src/alt-*` (Lorc's [Compass](https://game-icons.net/1x1/lorc/compass.html)
and [Quill](https://game-icons.net/1x1/lorc/quill.html), Delapouite's
[Measure tape](https://game-icons.net/1x1/delapouite/measure-tape.html) and
[Pencil](https://game-icons.net/1x1/delapouite/pencil.html), CC BY 3.0; Font Awesome Free `bullseye`,
CC BY 4.0) are credited in [`assets/src/CREDITS.md`](assets/src/CREDITS.md).
