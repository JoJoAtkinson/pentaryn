# Changelog — Pentaryn Tool Cursors (`pentaryn-cursors`)

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

## 0.2.0

- Spell-area glyph for dnd5e 6: detects a placement through core `RegionLayer#placeRegions`
  (`_placementContext` plus its preview in `canvas.regions.preview`).

## 0.1.0

- Tool cursors for Target, Ruler, spell-area preview, Journal notes and drawing tools; one client setting.
- Repairs a `#board` cursor another script blanked (Monk's Active Tiles), by re-issuing Foundry's
  current mode.
