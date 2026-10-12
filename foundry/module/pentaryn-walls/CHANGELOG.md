# Changelog — Wall Autocomplete (`pentaryn-walls`)

## Unreleased — blueprint migration (wave 2, 2026-10-11)

`module.json` stays 0.2.0. The Wave 7 restart batch (wave 5, 2026-10-12) added the blueprint keys
(`flagScope` stays `wall-autocomplete`), `languages`, `minimum: "14"`, `verified: "14.369"` and the
description fix; the flag-scope migration is **parked** while walls stays off (Joe).

- **[declared] An unknown `sceneId` says so** (`walls-rob-7`): `preview`/`run`/`analyze`/`undo`
  given a `sceneId` that matched no scene threw "no scene — open one, or pass a sceneId.", advice
  the caller had already followed. They now throw `pentaryn-walls: no scene with id "<sceneId>".`;
  the old message stays for no `sceneId` and no viewed scene.
- **[declared] `preview`/`run`/`analyze`/`undo(null)` mean the defaults** (`walls-rob-5`): a `null`
  argument hit the parameter destructuring and rejected with a `TypeError`. Each action now reads
  `arg ?? {}`, so `null` is the same as calling with no argument (the viewed scene, the settings).
- **[declared] The GM report card escapes the scene name** (`walls-edge-7`): `reportHtml` put
  `scene.name` into the card raw, so a name with `<`, `&` or quotes rendered as markup. It now goes
  through a small pure escape in `walls-core` (same table as `foundry.utils.escapeHTML`, which node
  lacks). Plain names render byte-identical; the glue golden is unchanged.

- **[declared] `run()`'s ABI doc in `wasm/src/lib.rs` matches the marshaller** (`walls-M2`): it named
  8 input fields and a 4-int header; it now names all 11 (`…keepOpen,light,sound,move`), the 5-int header
  with `components`, the 8-wide create rows and the component rows, still in three lines, so
  `wall-engine.wasm` rebuilds byte-identical (sha `df378076`). Comments only; no behaviour change.
- **[declared] One hotbar macro per action, however many calls race** (`walls-async-2`): two
  overlapping `makeMacro` calls (the same tab or two GM tabs) each created a `Walls: <action>` macro.
  The macro now has a fixed id per action (`pwmacro<action>`, padded to 16) created with `keepId`;
  the call that loses the id re-reads the winner's macro. A macro made earlier is still found by name.
- **[declared] The API manifest names every flag a run writes** (`walls-M11`): `describe()` listed
  `run`'s writes as `generated`/`run`/`rule`/`moves`, missing the `kind` and `sources` stamped on created
  walls; it now lists `generated`, `run`, `rule`, `kind`, `sources` and `moves.<run>` (`priorC` is
  read-only since `walls-edge-2`). `undo`'s side effects now list the update batch before the delete
  batch, the order it commits them. Manifest and `describe.json` only; no behaviour change.
- **[declared] `compare()` survives js throwing** (`walls-rob-2`): when the js reference threw and
  another backend did not, the field diff read js's missing result and threw a TypeError. It now
  reports `identical: false`, `diff: "js threw: <message>"`; a backend's own throw is reported as before.
- **[declared] The engine no longer carries a wall `threshold`** (`walls-EXT-3`): it was dead
  code — the wall reader never passed one, and the only preset that sets one (window) infers
  solid. Dropped from the segment shape, the grown-wall profile and the create payload; goldens
  are unchanged.
- **[declared] The compiled engine honours the iteration cap** (`walls-rob-1`): a run that hit the
  cap on wasm committed its partial result where js throws. It now throws js's exact
  `hit the <iterCap>-iteration cap; nothing was committed.` and writes nothing.
- **[declared] A `weldEps`/`pinEps` override runs on the JavaScript engine** (`walls-EXT-1`): the
  compiled engine hard-codes both, so it ignored the override while the card echoed it. The wasm
  row's `accepts(walls, opts)` now refuses such opts, and the card names js, the backend that ran.
- **[declared] Undo keeps each run's history** (`walls-edge-2`): a later run that trimmed or moved a
  generated wall overwrote its `run`/`priorC` stamp, so undoing run 2 deleted run 1's wall. A created
  wall now keeps its creating `run`; every trim/weld/move writes `moves.<run>` = the prior coordinates
  (first per run, never overwritten), on both backends. Undo restores each wall with a
  `moves.<latest>` entry and deletes only walls the latest run created; legacy flat stamps still undo.
  Run ids are stamped with `,` for the `.` so `moves.<run>` is one flag key.
- **[declared] Refusal pings only on the viewed scene** (`walls-rob-3`): `preview`/`run` with another
  scene's `sceneId` pinged that scene's coordinates on the canvas the GM was looking at. Markers are
  now drawn only when `canvas.scene` is the reported scene; the chat card and console table still
  list every refusal.
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
