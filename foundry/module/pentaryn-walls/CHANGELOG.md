# Changelog — Wall Autocomplete (`pentaryn-walls`)

## Unreleased — blueprint migration (wave 2, 2026-10-11)

`module.json` stays 0.2.0 until the Wave 7 restart batch adds the blueprint keys, `languages`,
`minimum: "14"` and the flag-scope migration.

- **[declared] `undo()` works** (`senses-walls-cursors-1`). It read the run stamps with
  `getFlag("wall-autocomplete", …)`, which Foundry 14 rejects (not a package id), so undo threw on
  any scene with walls. Restores now delete the flag with `_del` instead of `-=`.
- **[declared] One run at a time for every caller** (`senses-walls-cursors-9`): while
  preview/run/undo is running, a macro or API call warns and returns `null` (the keys already
  refused). The chat cards are awaited; a failed card is logged, never thrown.
- **[declared] The compiled engine hands Levels scenes to the JavaScript engine**
  (`senses-walls-cursors-2`): no more joins across Levels, and created walls keep their level.
- **[declared] The ready line says why wasm is missing** (`senses-walls-cursors-37`):
  `(wasm unavailable: …)`. The bench prints `(wasm unavailable: load failed)` (`-7`).
- **[declared] The API is kit-built**: frozen, `describe()`/`version`/`contract`/`settings()`/
  `trace()`/`uninstall()` beside the six legacy keys, also `game.modules.get("pentaryn-walls").api`;
  the publish fires `pentaryn-walls.ready` and `pentaryn.ready`.
- New: `analyze()`, the engine's answer with no side effect (`senses-walls-cursors-33`);
  `canonical(r, {extended: true})` shows level and rule drift between backends (`-3`).
- Internals: the engine and registry moved to `core/` behind `walls-core.mjs`; one wall-category
  rule (`-4`); settings, keybindings, the actions feature, the API manifest and a wiring-only entry
  (blueprint); the stale `WASM_STATUS` placeholder is gone (`-7`); hot obstacle scans no longer copy
  the segment list per call (`-5`, about 10x fewer array copies); one segment-construction path
  (`-6`). Docs split: this README (structure, API) and `context/foundry/walls.md` (how to draw and
  run it) (`-8`).

## 0.2.0 — 2026-08-12

- Compiled (WASM) engine on by default, with full report parity; generated walls inherit their
  source's wall type; undo is scoped to one run and restores trimmed walls.

## 0.1.0 — 2026-08-11

- Deterministic wall autocomplete: rules W1/W2/F1/F2/E1, X1 trim, lint; backend registry and bench.
