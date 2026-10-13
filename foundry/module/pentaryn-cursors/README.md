# Pentaryn Tool Cursors (`pentaryn-cursors`)

**Read this when:** a player can't tell which scene tool they are on, a map cursor looks wrong, or
you are changing the cursor set. **Not this file:** design and the why behind each glyph →
[`context/plans/cursors-design.md`](../../../context/plans/cursors-design.md) · how every addon is built → `context/foundry/addon-blueprint.md`.

The mouse pointer **over the map** shows the active tool, so "pins stopped working" becomes "you
have the pencil, click the arrow". Nothing about any tool changes; only what the pointer looks like.
Tier `small` + kit `settings`, `api`. Exposes `game.pentaryn.cursors`.

## What the player sees

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

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `enabled` | client | `true` | *Configure Settings → Pentaryn Tool Cursors → Tool cursors on the map*. Off = the arrow for every tool, and a blanked `#board` cursor is no longer repaired. For anyone whose OS or browser fights custom cursors. Read live: no reload. |

## API — game.pentaryn.cursors

Canonical: `game.modules.get("pentaryn-cursors").api`; `game.pentaryn.cursors` is the same object,
published synchronously at `ready` (`pentaryn-cursors.ready` fires with it). Ask it what it offers:
`game.pentaryn.cursors.describe()` (offline: `test/golden/describe.json`).

- `current()` — the key on `#board` now, or `null`. `refresh()` — recompute and apply; returns the key (`null`, writing nothing, after `uninstall()`).
- `keys` — the frozen `KEYS` table. `keyFor({control, tool, templatesActive})` — pure, ignores the setting; no state (or `null`) gives `null`.
- `status()` — one read-only diagnosis of a wrong cursor:
  `{ enabled, key, control, tool, placementActive, boardCursor, dataset, imageSet, expected }`.
  `expected` is `keyFor`'s answer; `key` is what should be on the board (`null` while the setting is off).
  It writes nothing.
- Kit members: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.
  `uninstall()` clears the board and keeps it clear: the wrapped `onChange`s, the preview listeners,
  the `#board` observer and any pending tick do nothing until a hot re-import installs again.

`document.getElementById("board").dataset.pentarynCursor` shows the key too.

## Data written

n/a — purely per-client: no documents, no world settings, no flags, no sockets, no GM relay. It
writes only four inline style properties and one `data-` attribute on this browser's `#board`.

## Flags other modules read

n/a — no flags.

## Events

n/a — emits none of its own (the kit fires `pentaryn-cursors.ready` and `pentaryn.ready` at publish).
Listens to: `getSceneControlButtons`, `renderSceneControls`, `activateCanvasLayer`, `canvasReady`,
`canvasTearDown`, plus `init` and `ready` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

Foundry sets `#board.style.cursor = "var(--cursor-default)"` (and `-pointer`, `-default-down`,
`-pointer-down`), with the variables on `:root` from `CONFIG.cursors`. The module sets those four
variables **inline on `#board`**, which overrides `:root` for the canvas only; nothing in PIXI is
patched. The image URLs are absolute (`foundry.utils.getRoute("modules/pentaryn-cursors")…`)
because a `url()` inside a custom property resolves against the page where `var()` is substituted;
that is also why there is no `.css` file. `image-set()` 1×/2× is used only where `CSS.supports`
accepts it in `cursor`.

Core internals it relies on (adjustments row `core-board-cursor-vars` in `foundry/adjustments.yml`;
it takes the package prefix because it is not a `wrapMethod` patch):

- `canvas.app.renderer.events.currentCursor` / `setCursor` — the resync (see Pitfalls).
- `canvas.regions._placementContext` — the spell-area check. Both must hold: the context **and**
  its preview Region in `canvas.regions.preview` (`placementActive` in core), because a GM
  drag-drawing a region fills the container without a context, and on cancel the preview leaves
  while the context is still set. Shared with aoe's `placementInProgress` (adjustments row `core-region-placement-escape`, finding aoe-movement-portals-39).
- Every scene control's and modal tool's `onChange` is wrapped in `getSceneControlButtons`
  (switching tool inside a control does not re-render the controls). The wrap runs the original,
  then `refresh()`; a `Symbol.for("pentaryn-cursors.wrapped")` marker stops a second wrap.

If `setCursor` or `_placementContext` is gone after `canvasReady`, the console shows one
`pentaryn-cursors | core internals missing: …` warning per page.

## Two sessions / who writes

n/a — each client computes its own cursor; nothing crosses the wire.

## Extending

To add a key (e.g. a GM wall cursor): add it to `KEYS` and a line to `keyFor()` in
`cursors-core.mjs`, drop the source SVG in `scripts/foundry/cursors/src/` (credit it in its
`CREDITS.md`), run the build (Files), and add the row to
the `keyFor` table in `test/core.test.mjs`. The build fails unless the measured hotspot equals
`KEYS[key].hotspot`, so a new glyph can't ship with a stale one — update `KEYS` to the printed
value if the new one is right. A failed build writes no file at all, so `assets/cursors/` is never
left half rebuilt.

The key list is pinned exactly in several more places; miss one and the suite goes red with no
hint why. A new key also has to change:

- `test/core.test.mjs` — the "KEYS are exactly the five" check (rename it too).
- `test/glue.test.mjs` — case (b), `Object.keys(a.keys)`.
- `test/golden/surface.json` — seven `keys.<key>.*` rows per key (pinned by `test/api.test.mjs`).
  Re-pin with `GOLDEN_UPDATE=1 node --test test/api.test.mjs`, read the diff, and commit it as a
  declared change (blueprint §9).
- `test/fixtures/live-before.json` — `env.keys` is a live capture: re-capture it from Foundry, do
  not hand-edit it.
- Player-facing copies, which list the cursors by colour: the "What the player sees" table and
  the Credits table here, `scripts/foundry/cursors/src/CREDITS.md`, `lang/en.json`
  `PENTARYN_CURSORS.Setting.enabled.Hint`, and the `module.json` description.

## Pitfalls

- **Other scripts blanking the cursor.** Foundry's `setCursor` writes `#board.style.cursor` only
  when its mode changes, so anything that sets it to `""` leaves the map on the system arrow (every
  tool glyph and Foundry's own hands gone) until the mode next changes. Monk's Active Tiles does
  this on every `canvasReady` and on hover-out of a pointer tile. The module watches `#board`'s
  `style` attribute and, when the cursor is blank, re-issues Foundry's current mode (also a tick
  after `canvasReady`). `pentaryn-portals` writes the cursor only for the GM's `move` over a badge
  in edit mode and puts the prior value back; don't add a module that blanks it on every pointer move.
- During a senses Light pick, `body.ps-picking #board { cursor: crosshair !important }`
  (pentaryn-senses `styles/light.css`) overrides these variables: the pick crosshair wins, as meant.
- The spell-area glyph appears on the first pointer move after *Place*: that is when the preview
  Region joins `canvas.regions.preview`.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.

## Files

| File | Role |
|---|---|
| `cursors.mjs` | entry (esmodules[0]): wiring, load order, publish at `ready` |
| `cursors-core.mjs` | pure: `KEYS` (colour, source, hotspot, fallback), `keyFor`, `cursorValues`, `placementActive`, `probeInternals`, `statusOf` |
| `settings.mjs` | the `SETTINGS` table (one client row), `setting()` |
| `board.mjs` | the feature: `#board` vars, resync, preview watch, `onChange` wraps |
| `api-manifest.mjs`, `api.mjs` | API rows and implementations |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `assets/cursors/` | built `<key>.png`, `@2x`, `-pointer`, `-pointer@2x`, and the outlined `.svg` they came from. **Committed; do not hand-edit.** |
| `scripts/foundry/cursors/src/` (repo, not shipped) | unmodified icon sources and credited alternates (`CREDITS.md`) |
| `scripts/foundry/cursors/build.mjs` (repo, not shipped) | rebuild after changing a glyph or colour in `KEYS`: `cd "$(mktemp -d)" && npm i @resvg/resvg-js@2.6.2 && node <repo>/scripts/foundry/cursors/build.mjs`. Fits each glyph to 26×26, adds the 2 px dark outline and 1 px white halo, measures the hotspot. `--check-sources` (no resvg) proves every `KEYS` source exists, every `extreme` is one of `EXTREMES` and every hotspot is two integers in 0..31 (the full build runs the same `checkKeys` first); `scripts/tests/test_cursors_build.py` runs it and `test/build-check.test.mjs` pins `checkKeys`. |
| `test/` | node:test suites, goldens, fixtures, vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check cursors
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module cursors
```

`test/glue.test.mjs` drives the entry through its hooks only; `test/live.test.mjs` replays the
live golden of the five tool switches.

## Sync

`make foundry-cursors-sync`. First install: restart Foundry (module.json is read at startup),
enable 'Pentaryn Tool Cursors', reload. After that `.mjs` and `lang/` changes need a reload only.
Check what is live with `game.pentaryn.cursors.describe().version` and `game.pentaryn.cursors.status()`.

## Credits

The cursor shapes are the artists' work, recoloured, outlined and rasterised by `scripts/foundry/cursors/build.mjs`.

| Cursor | Icon | Artist | Licence |
|---|---|---|---|
| target | [Crosshair](https://game-icons.net/1x1/delapouite/crosshair.html) | [Delapouite](https://delapouite.com), game-icons.net | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| aoe | [Convergence target](https://game-icons.net/1x1/delapouite/convergence-target.html) | Delapouite, game-icons.net | CC BY 3.0 |
| note | [Position marker](https://game-icons.net/1x1/delapouite/position-marker.html) | Delapouite, game-icons.net | CC BY 3.0 |
| ruler | `ruler` (solid) | [Font Awesome Free 6.7.2](https://fontawesome.com), Fonticons, Inc. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| draw | `pencil` (solid) | Font Awesome Free 6.7.2, Fonticons, Inc. | CC BY 4.0 |

Alternates in `scripts/foundry/cursors/src/alt-*` (Lorc's [Compass](https://game-icons.net/1x1/lorc/compass.html)
and [Quill](https://game-icons.net/1x1/lorc/quill.html), Delapouite's
[Measure tape](https://game-icons.net/1x1/delapouite/measure-tape.html) and
[Pencil](https://game-icons.net/1x1/delapouite/pencil.html), CC BY 3.0; Font Awesome Free `bullseye`,
CC BY 4.0) are deliberate, credited alternates — not dead code — listed in
[`scripts/foundry/cursors/src/CREDITS.md`](../../../scripts/foundry/cursors/src/CREDITS.md).
