# Changelog — Pentaryn Tool Cursors (`pentaryn-cursors`)

## Unreleased — 2026-10-12 (addon blueprint, Stage 5)

- The build tool and the icon sources leave the module (guide steps 7–8; C05, C13, C24, C25):
  `tools/build.mjs` → `scripts/foundry/cursors/build.mjs` (gains `--check-sources`),
  `assets/src/` (with `CREDITS.md` and every credited `alt-*`) → `scripts/foundry/cursors/src/`,
  `DESIGN.md` → `context/plans/cursors-design.md`. No runtime file changes; the module folder
  simply stops shipping `tools/` and `assets/src/`.
- [declared] `uninstall()` keeps the board clear (cursors-rob-3): the wrapped tool `onChange`s,
  the spell-area preview listeners, the `#board` observer and the setting's `onChange` are inert
  while uninstalled, and the pending `canvasReady`/`ready` ticks are cancelled. A hot re-import's
  `install()` re-arms them.

## Unreleased — 2026-10-11 (addon blueprint, wave 1)

The version stays 0.2.0 until the Wave 7 `module.json` restart batch.

- Rebuilt on the addon blueprint (tier `small`, kit `settings` + `api` vendored in `lib/`):
  `board.mjs` feature with `install`/`uninstall`, `settings.mjs` table, `api-manifest.mjs`/`api.mjs`,
  the entry is wiring only. Hook order unchanged.
- **[declared C-1]** `game.pentaryn.cursors` is published synchronously at `ready` (one tick earlier),
  also as `game.modules.get("pentaryn-cursors").api`, and gains `describe/version/contract/settings/
  trace/uninstall` plus the read-only `status()`.
- **[declared C-2]** one console warning per page when Foundry's `setCursor` or
  `canvas.regions._placementContext` is missing after `canvasReady`.
- `lang/en.json` nested under `PENTARYN_CURSORS` (same strings).
- [declared] Kit 1.0.2 (wave 2, J10): a frozen `game.pentaryn` is no longer rebuilt; the `ready`
  publish throws into Foundry's hook error report and leaves the root as it was. Nothing freezes the
  root since the importer's keystone, so a live world sees no difference.

## 0.2.0

- Spell-area glyph for dnd5e 6: detects a placement through core `RegionLayer#placeRegions`
  (`_placementContext` plus its preview in `canvas.regions.preview`).

## 0.1.0

- Tool cursors for Target, Ruler, spell-area preview, Journal notes and drawing tools; one client setting.
- Repairs a `#board` cursor another script blanked (Monk's Active Tiles), by re-issuing Foundry's
  current mode.
