---
title: "Code audit 2026-10 — pentaryn-cursors"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-cursors

**Read this when:** you are about to refactor, harden or document pentaryn-cursors and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-cursors

**Purpose.**

Per-client map cursor showing the active scene tool (target, ruler, spell-area placement, journal pin, drawing tools). It sets the four --cursor-* variables inline on #board, re-issues Foundry's cursor mode when another script blanks it, and builds its PNG set offline with tools/build.mjs.

**Health.**

Small, clean and well-tested: cursors-core is pure with 84 checks, including asset existence and size and manifest/lang checks. The README has a 'Read this when' line and a 'To add a key' recipe. Gaps: it leans on core internals (`renderer.events.currentCursor`, `RegionLayer._placementContext`, wrapping each control/tool `onChange`) that are not registered in adjustments.yml. Hooks are raw, with no uninstall. The init sequence is duplicated between ready and canvasReady. Sync ships tools/, test/, DESIGN.md and the unused assets/src/alt-* SVGs.

**LLM interface.**

`game.pentaryn.cursors.{refresh,current,keys,keyFor}` through eval-js; enough for diagnosis. A `status()` returning {enabled, key, control, tool, placementActive, imageSet} would answer 'why is my cursor wrong' in one call instead of three evals.

**How to extend.**

Clear and documented: add the key to KEYS and a line to keyFor() in cursors-core.mjs, drop the SVG in assets/src/, run tools/build.mjs, add a row to the test table (README:78). A new trigger source (like the region preview watcher) goes in cursors.mjs next to watchPreview(), and its core dependency should get an adjustments row.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| senses-walls-cursors-31 | Maintainability gains | low | S | Canvas attach sequence duplicated across canvasReady and ready; hooks not uninstallable |
| senses-walls-cursors-30 | Hardening | medium | S | Cursor resync/placement detection rely on unregistered core internals |
| senses-walls-cursors-32 | LLM interface | low | S | Diagnosing a wrong cursor needs several evals; add one read-only status() |
| senses-walls-cursors-35 | Documentation / skills | low | S | cursors' DESIGN.md is a plan doc inside the module; the dead-code table wrongly lists its credited alternates |

## Maintainability gains

### senses-walls-cursors-31 — Canvas attach sequence duplicated across canvasReady and ready; hooks not uninstallable

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-cursors/cursors.mjs:148–157`

**Anchor:** `Hooks.once("ready", () => setTimeout(() => {`

**Current.**

canvasReady and ready each run guardBoard, watchPreview, refresh and resync; five raw Hooks.on registrations have no ids/uninstall.

**Proposed.**

Factor attach() and call from both; keep setTimeout wrapping only publish; track hook ids with an additive uninstall().

**Behaviour test recipe (write first, must pass before and after).**

Node test with stub Hooks/game/canvas/ui/foundry.utils.getRoute/MutationObserver importing cursors.mjs: fire init, ready, flush timers, canvasReady. Assert observe called once for the #board stub, preview.on twice per container, api keys [refresh,current,keys,keyFor] (+uninstall), and board CSS vars equal cursorValues('target','/modules/pentaryn-cursors',false). Capture counts on current file first. Cursors currently has only test/run.mjs for the core, so this is a new harness file.

**Risk.** Order within attach unchanged; stub counts pin it.

**Related:** senses-walls-cursors-16, senses-walls-cursors-32

## Hardening

### senses-walls-cursors-30 — Cursor resync/placement detection rely on unregistered core internals

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-cursors/cursors.mjs:55–59`

**Anchor:** `  const mode = events.currentCursor;`

**Current.**

resync writes renderer.events.currentCursor, previewActive reads canvas.regions._placementContext, wrapOnChange replaces control/tool onChange; none registered in adjustments.yml; failures silently revert to arrow.

**Proposed.**

Add row core-board-cursor-vars (markers `currentCursor`, `setCursor`, the onChange wrap) with native_when; register the `_placementContext` read by widening the existing row core-region-placement-escape instead (aoe-movement-portals-39), so one core internal has one row. Add one-time console.warn when setCursor or _placementContext is missing after canvasReady via probeInternals.

**Behaviour test recipe (write first, must pass before and after).**

make foundry-adjustments-check for the row. Extract probeInternals({events,regions}) into cursors-core.mjs; test/run.mjs: full stubs -> []; empty -> ['setCursor','_placementContext']; use the 'in' operator because the value is null when idle.

**Risk.** Registry plus diagnostic warn only.

**Related:** senses-walls-cursors-29, aoe-movement-portals-39

## LLM interface

### senses-walls-cursors-32 — Diagnosing a wrong cursor needs several evals; add one read-only status()

**Category:** LLM interface · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-cursors/cursors.mjs:149`

**Anchor:** `  const api = { refresh, current: () => current, keys: KEYS, keyFor };`

**Current.**

enabled setting, ui.controls names, placement state, board cursor/dataset and image-set support are computed internally then discarded.

**Proposed.**

Add read-only status() returning {enabled,key,control,tool,placementActive,boardCursor,dataset,imageSet,expected}; mention in README.

**Behaviour test recipe (write first, must pass before and after).**

Stub test as in finding 31: control 'drawings', tool 'rect' -> expected and key 'draw'; setting false -> enabled false, key null, expected 'draw'; assert status() makes zero style.setProperty calls.

**Risk.** Additive read.

**Related:** senses-walls-cursors-31

## Documentation / skills

### senses-walls-cursors-35 — cursors' DESIGN.md is a plan doc inside the module; the dead-code table wrongly lists its credited alternates

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-cursors/DESIGN.md` (244 lines); `foundry/module/pentaryn-cursors/README.md:4, 96–100`

**Anchor:** ``Unused alternates in `assets/src/alt-*` (Lorc's [Compass](https://game-icons.net/1x1/lorc/compass.html)``

**Current.**

`DESIGN.md` (244 lines; it opens "Read this when: building or changing the cursor set. Plan: context/plans/table-feedback-2026-10-08.md §C4b") is a design and plan document. It lives in the module folder, is linked from `README.md:4`, and is copied into `Data/modules` on every sync. The routing rule (CLAUDE.md: plans in `context/plans/`, use-docs in the domain folder) says it belongs in `context/plans/`. senses-walls-cursors-27 covers this, filed under senses.

The master §1.4 dead-code table also lists the `assets/src/alt-*` SVGs to retire. They are deliberate alternates: `README.md:96–100` names them, and `assets/src/CREDITS.md` carries their CC BY 3.0 / 4.0 credits. They are not dead code and must stay with their credits. Their shipping into `Data/` is the deferred sync-exclusion decision (python-tooling-5 step b, senses-walls-cursors-28).

**Proposed.**

Move `DESIGN.md` to `context/plans/cursors-design.md` and change `README.md:4` to point there (the cursors half of senses-walls-cursors-27; land them together). Keep the `alt-*` SVGs. Remove them from §1.4. Done in the master plan with this finding.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. The pytest from senses-walls-cursors-27 in `scripts/tests/test_module_checks.py` (no `DESIGN.md` / `*-DESIGN.md` under `foundry/module/*/`) covers the move. Add an assertion that every `assets/src/alt-*.svg` filename stem appears in `assets/src/CREDITS.md`, so a later "dead asset" sweep cannot strip credited files. Run `check_lore_links` / `fix_md_links` after the move.

**Risk.** None at runtime.

**Related:** senses-walls-cursors-27, senses-walls-cursors-28

## Categories checked with no finding

- **Performance:** checked the hot paths. The `#board` MutationObserver (`guardBoard`, `cursors.mjs:62–70`) watches only the `style` attribute, and `resync()` returns at once unless the cursor was blanked. `refresh()` runs on a control or tool change, a layer activation, and a preview being added or removed, never per frame. Nothing found.
- **Defragmentation:** `previewActive()` overlaps aoe's `placementInProgress`. That is filed as aoe-movement-portals-39 (pin both, share one adjustments row, do not merge). The setting fallback and the publish guard go to the kit. Nothing cursors-only.
- **Logging / auditability:** every catch warns with the `pentaryn-cursors |` prefix (lines 68, 84 and 107), except `enabled()` (15, falls back to true) and the image-set probe (22, falls back to false), which are deliberate fallbacks. Nothing found.
- **Extendability:** the README has a "To add a key" recipe (README:78–79), backed by the `KEYS` table and the build's hotspot check (`tools/build.mjs:114–122`). Nothing found.
