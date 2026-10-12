# Changelog — Wall Autocomplete (`pentaryn-walls`)

## Unreleased — blueprint migration (wave 2, 2026-10-11)

`module.json` stays 0.2.0. The Wave 7 restart batch (wave 5, 2026-10-12) added the blueprint keys
(`flagScope` stays `wall-autocomplete`), `languages`, `minimum: "14"`, `verified: "14.369"` and the
description fix; the flag-scope migration is **parked** while walls stays off (Joe).

- **[declared] Refusal pings stay on the GM's screen** (`walls-edge-1`): each refused endpoint is
  drawn locally with `canvas.controls.drawPing(…, {style: PULSE})` instead of `canvas.ping`, which
  broadcast to every player and, with Alt+Shift held from the preview key, became a pull that
  panned their views. Players now see nothing, as the README says; pentaryn-pings no longer
  records them.
- **[declared] Labels and toasts from `lang/en.json`** (`senses-walls-cursors-36`, W2-WALLS-1): the
  setting, its choices and the three keybindings register `PENTARYN_WALLS.*` keys; the backend hint
  says "the same fixture corpus" instead of "the same 44 fixtures" (-8).
- **[declared] Toasts through `log.notify`** (W2-WALLS-3): each adds `{console: false}` and logs one
  `pentaryn-walls | …` line; a failed keybinding action logs `keybinding action failed` with the error.

- **[declared] `undo()` works** (`senses-walls-cursors-1`). It read the run stamps with
  `getFlag("wall-autocomplete", …)`, which Foundry 14 rejects (not a package id), so undo threw on
  any scene with walls. Restores now delete the flag with `_del` instead of `-=`.
- **[declared] One run at a time for every caller** (`senses-walls-cursors-9`): while
  preview/run/undo is running, a macro or API call warns and returns `null` (the keys already
  refused). The chat cards are awaited; a failed card is logged, never thrown.
- **[declared] The compiled engine hands Levels scenes to the JavaScript engine**
  (`senses-walls-cursors-2`): no more joins across Levels, and created walls keep their level.
  The chat card and `analyze().backend` then say `js`, the engine that ran.
- **[declared] The ready line says why wasm is missing** (`senses-walls-cursors-37`):
  `(wasm unavailable: …)`. The bench prints `(wasm unavailable: load failed)` (`-7`).
- **[declared] The API is kit-built**: frozen, `describe()`/`version`/`contract`/`settings()`/
  `trace()`/`uninstall()` beside the six legacy keys, also `game.modules.get("pentaryn-walls").api`;
  the publish fires `pentaryn-walls.ready` and `pentaryn.ready`.
- Stamps are read under `flags.pentaryn-walls` as well as `flags.wall-autocomplete` (no data uses
  the new scope yet); the Wave 7 flag-scope migration is written and tested but not wired.
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
