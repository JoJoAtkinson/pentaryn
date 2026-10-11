---
title: "Code audit 2026-10 — pentaryn-walls"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-walls

**Read this when:** you are about to refactor, harden or document pentaryn-walls and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-walls

**Purpose.**

GM tool that deterministically completes hand-drawn walls. A pure geometry engine (wall-engine.mjs, rules W1/W2/F1/F2/E1 plus X1 trim and lint) has a JS reference backend and a compiled Rust/WASM backend about 12x faster, chosen through a small backend registry. Foundry glue offers preview/run/undo/makeMacro, Alt+W/Alt+Z/Alt+Shift+W keybindings and a GM-whispered chat report. Disabled in the pentaryn world.

**Health.**

The engine is well-factored and heavily commented: 49 fixtures, idempotence checks, a cross-backend compare and a bench. The glue is small. Real defects: (1) `undo()` uses `getFlag` with the non-package scope 'wall-autocomplete', which Foundry rejects (baseline §5.2), so undo throws whenever the scene has walls. (2) The wasm backend ignores `levels`: confirmed divergence on a two-level probe, and created walls always get `levels: []`. `canonical()`/`compare()` cannot see either problem. (3) The busy guard protects only keybindings. Maintainability: `category()` is triplicated (engine, backends, fixtures), `WASM_STATUS` is a stale placeholder, the seg-construction is repeated three times, and the hot-path `obstacles()` allocates an array per call. Docs: every code comment and the manifest point to a non-existent `playbooks/foundry-wall-autocomplete.md` (the plan is at context/plans/foundry-wall-autocomplete.md), and '44 fixtures' is stated six times (there are 49). Sync ships wasm/src, Cargo files and wasm/target (404 KB) into Data/modules.

**LLM interface.**

GM-only `game.pentaryn.walls.{preview,run,undo,makeMacro,runEngine,backends}` through eval-js. `preview()` is not a pure read: it posts a whispered chat card, pings and console.tables. Return shapes: run/preview return the engine result (no backend or ms), and undo returns {deleted, restored, run} or throws. Should be: a side-effect-free `analyze({sceneId})` that returns {result, backend, ms, sceneId}, plus `describe()`. No MCP tool is needed while the module is disabled.

**How to extend.**

A new rule goes in wall-engine.mjs enumerate() plus PRIORITY, a fixture in test/fixtures.mjs, and the mirrored rule in wasm/src/lib.rs (or wasm delegates to JS for that case). A new backend is `register({name, run, available})` in its own backend-*.mjs. That is clear, but neither path is written down outside code comments, and the checks gate only `--backend=js`. Proposed: gate `--backend=wasm` in the node-test, and add a 'Adding a rule / a backend' section to the README.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| senses-walls-cursors-5 | Performance gains | medium | S | Hot-path obstacles() allocates a filtered array (and often a Set) per call |
| senses-walls-cursors-6 | Maintainability gains | low | S | Segment construction repeated three ways (lintOnly, analyze, runEngine) |
| senses-walls-cursors-28 | Maintainability gains | low | S | Sync ships Rust sources, wasm/target build output, tests, tools and design docs into Data/modules |
| senses-walls-cursors-36 | Maintainability gains | low | S | walls has no lang file: the setting, three keybindings and six toasts are hard-coded English |
| senses-walls-cursors-4 | Defragmentation | low | S | Wall-category logic copied three times (engine, backends, fixtures) |
| senses-walls-cursors-7 | Defragmentation | low | S | Dead, contradictory WASM_STATUS placeholder ('not yet built') |
| senses-walls-cursors-37 | Logging / auditability gains | low | S | In 'auto' backend mode a wasm load failure is invisible |
| senses-walls-cursors-1 | Hardening | high | S | undo() calls getFlag with a non-package scope (wall-autocomplete) and throws |
| senses-walls-cursors-2 | Hardening | high | S | wasm backend ignores wall levels; results diverge from JS reference and creates lose their level |
| senses-walls-cursors-9 | Hardening | medium | S | Busy guard covers only keybindings; API/macro calls can overlap and chat writes are unawaited |
| senses-walls-cursors-3 | Hardening | low | S | canonical()/compare() is blind to levels and rule stamp so backend drift is invisible |
| senses-walls-cursors-33 | LLM interface | low | S | preview() is not a pure read (chat card, pings, console); results omit backend and timing |
| senses-walls-cursors-8 | Documentation / skills | medium | S | References to nonexistent playbooks/ path and stale '44 fixtures' count |

## Performance gains

### senses-walls-cursors-5 — Hot-path obstacles() allocates a filtered array (and often a Set) per call

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/wall-engine.mjs:467–476`

**Anchor:** `function obstacles(segs, exclude = new Set()) {`

**Current.**

pathClear, W2 scan, castRay and diagnose call obstacles(), building a new filtered array each time; pathClear runs per F1 pair / F2 leg. JS path is the fallback and (after finding 2) the levels path.

**Proposed.**

Replace with inline loops (skip degenerate/excluded) at each call site keeping segs iteration order so strict t<best.t / d2<best.d2 tie-breaks are unchanged; hoist coll2 out of the F1 inner loop; reuse one Set per dangling vertex in W2.

**Behaviour test recipe (write first, must pass before and after).**

Add test/golden.mjs: run runEngine over every fixture and bench rooms(3/5/8/10) with runId 'golden', sha256 JSON.stringify({creates,updates,refusals,lints,log,report}) into test/snapshots/golden.json (written when missing/UPDATE_SNAPSHOTS set, asserted otherwise). Commit snapshot from current code; after refactor every hash matches and node test/bench.mjs still prints identical.

**Risk.** Iteration-order tie-breaks; golden hashes over full results catch drift.

**Related:** senses-walls-cursors-6

## Maintainability gains

### senses-walls-cursors-6 — Segment construction repeated three ways (lintOnly, analyze, runEngine)

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/wall-engine.mjs:884–931`

**Anchor:** `  return lint(walls.map(toSeg).map((s, i) => ({...s, c: [...s.c], idx: i})), cfg);`

**Current.**

lintOnly (884) and analyze (889) double-map walls.map(toSeg).map(copy+idx); runEngine uses walls.map(toSeg) (914) then reindexes per level group.

**Proposed.**

Add toSegs(walls) and reindex(segs) helpers with a comment that idx must equal array position; use in the three places.

**Behaviour test recipe (write first, must pass before and after).**

Covered by golden hashes from finding 5 plus node test/run.mjs --backend=wasm (exercises lintOnly/analyze via runWasm). Must match before/after.

**Risk.** Object copies only.

**Related:** senses-walls-cursors-5

### senses-walls-cursors-28 — Sync ships Rust sources, wasm/target build output, tests, tools and design docs into Data/modules

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `scripts/foundry/ops/modules.py:306`

**Anchor:** `    shutil.copytree(spec.src, spec.dst)`

**Current.**

module-sync copies the entire module folder, including walls wasm/ (src, Cargo, target) while only wall-engine.wasm at the module root is loaded, cursors tools/ and assets/src, and test/ dirs.

**Proposed.**

Add ship_ignore to ModuleSpec with a custom ignore callable (path-aware); default excludes test, tools; walls adds wasm, cursors adds assets/src. Keep README and runtime-loaded paths.

**Behaviour test recipe (write first, must pass before and after).**

scripts/tests/test_foundry_ops.py: build tmp module tree {module.json, a.mjs, wall-engine.wasm, wasm/target/x.rlib, wasm/src/lib.rs, test/run.mjs, assets/cursors/a.png, assets/src/alt.svg, DESIGN.md, README.md}; first pin today's copy-everything behaviour with current code, then update expectation to exactly {module.json,a.mjs,wall-engine.wasm,assets/cursors/a.png,README.md}.

**Risk.** Excluding a runtime-loaded file would break a module; test asserts esmodules/styles/languages/assets/.wasm survive.

**Related:** senses-walls-cursors-27

### senses-walls-cursors-36 — walls has no lang file: the setting, three keybindings and six toasts are hard-coded English

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/pentaryn-walls.mjs:45, 148, 177, 196, 205–250`

**Anchor:** `    name: "Wall autocomplete: run",`

**Current.**

`module.json` declares no `languages`. The backend setting (lines 208–209), the run/undo/preview keybindings (230–248) and the toasts at 45, 148, 177, 196, 220 and 224 are literal English, so the i18n gate has nothing to check. §2.1's standard (no hard-coded English in the UI) names walls among the modules without a lang file, but walls had no finding id. The other three without one are portals (aoe-movement-portals-29), pings (transform-creatures-35) and attunement (items-journal-14).

**Proposed.**

Add `lang/en.json`, nested, with the strings verbatim: `PENTARYN_WALLS.{settings.backend.{name,hint}, keys.{run,undo,preview}.{name,hint}, notify.{backendUnavailable,nothingToUndo,undone,macroReady,busy,failed}}`. Add the `module.json` `languages` entry (restart batch, Wave 7). Replace the literals with `game.i18n.localize`/`format`, using literal keys so `jsscan` sees them.

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs`: load `lang/en.json` and assert that every key renders to today's literal:
- `undone {created: 2, restored: 1}` → `Undid 2 created, 1 restored.`
- `backendUnavailable {want: "wasm"}` → `Wall autocomplete: backend "wasm" unavailable, using JavaScript.`
- `failed {message: "x"}` → `Wall autocomplete: x`
- and so on for the rest.

`make foundry-walls-check` must pass the i18n gate.

**Risk.** The `module.json` change needs a restart. The text is identical.

**Related:** aoe-movement-portals-29, transform-creatures-35, items-journal-14


## Defragmentation

### senses-walls-cursors-4 — Wall-category logic copied three times (engine, backends, fixtures)

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/backends.mjs:57–65`

**Anchor:** `  const kind = c => {`

**Current.**

Same branch logic at wall-engine.mjs:191 function category (unexported), backends.mjs:57 const kind, test/fixtures.mjs:25 kindOf.

**Proposed.**

Export category as wallCategory from wall-engine.mjs; backends.mjs imports it; fixtures.mjs re-exports as kindOf.

**Behaviour test recipe (write first, must pass before and after).**

Before the change, in test/run.mjs table-check inputs ({}->solid; all-0 sight/light/sound/move->blank; {sight:0}->invisible; {sight:10}->terrain; {sight:30},{sight:40}->window; {move:0}->ethereal; {sight:20,move:0}->ethereal; {sight:0,move:0}->invisible) asserting kindOf(x) equals the kind canonical() derives for a create with those fields; repeat against exported wallCategory after. All fixtures pass.

**Risk.** Identical pure bodies; table pins every branch.

### senses-walls-cursors-7 — Dead, contradictory WASM_STATUS placeholder ('not yet built')

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/backends.mjs:42–45`

**Anchor:** `export const WASM_STATUS = Object.freeze({`

**Current.**

backends.mjs exports WASM_STATUS {built:false} and says wasm is not built, but backend-wasm.mjs registers a working default backend. grep confirms nothing else references WASM_STATUS. bench.mjs:42 prints '(wasm not built)'.

**Proposed.**

Delete WASM_STATUS and the placeholder comment; replace with a 3-line note that backend-wasm.mjs registers wasm and pickBackend falls back to js; change bench.mjs:42 text to '(wasm unavailable: load failed)'.

**Behaviour test recipe (write first, must pass before and after).**

grep -rn WASM_STATUS module/ scripts/ is empty after deletion; node test/run.mjs, --backend=wasm, and bench.mjs outputs unchanged except the bench note text.

**Risk.** No runtime reader.

## Logging / auditability gains

### senses-walls-cursors-37 — In 'auto' backend mode a wasm load failure is invisible

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/backend-wasm.mjs:35–38`; `foundry/module/pentaryn-walls/pentaryn-walls.mjs:46–49, 277–279`

**Anchor:** `    loadError = err;`

**Current.**

`load()` stores the error in a module variable and returns `null`. `pickBackend("auto")` (`pentaryn-walls.mjs:46–49`) silently falls back to JS, and the ready line (277–279) prints only `backends: js`. The stored `loadError` surfaces only when someone forces backend `wasm` and runs (`backend-wasm.mjs:60`). A broken or missing `wall-engine.wasm` after a sync costs about 12x speed (README benchmark) and leaves no trace of why.

**Proposed.**

Export `loadErrorMessage()` from `backend-wasm.mjs`. When `wasm` is registered but unavailable, the ready line appends ` (wasm unavailable: <message>)`. No toast and no behaviour change.

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs` (node):
- Extract the ready text into a pure `readyLine(names, wasmError)` and pin `readyLine(["js", "wasm"], null)` to today's exact string; `readyLine(["js"], "ENOENT")` is that string plus the suffix.
- Healthy case: after `await ready`, `loadErrorMessage()` is `null`.
- Failure case: copy `backend-wasm.mjs`, `backends.mjs` and `wall-engine.mjs` (no `.wasm`) into `os.tmpdir()` and import from there; `available()` is false and `loadErrorMessage()` contains `ENOENT`.

**Risk.** Console text only.

**Related:** senses-walls-cursors-2, senses-walls-cursors-33

## Hardening

### senses-walls-cursors-1 — undo() calls getFlag with a non-package scope (wall-autocomplete) and throws

**Category:** Hardening · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/pentaryn-walls.mjs:146–167`

**Anchor:** `  const stamped = scene.walls.filter(w => w.getFlag(FLAG_SCOPE, "run"));`

**Current.**

undo() reads run stamps via w.getFlag(FLAG_SCOPE, ...) at 146,151,152,158,160. FLAG_SCOPE is 'wall-autocomplete' (wall-engine.mjs:65), not an active package id; pentaryn-importer.mjs:87-96 documents that Document#getFlag throws for such scopes. Runs write raw flags so succeed, but undo cannot read them.

**Proposed.**

Extract pure planUndo(walls,{all}) into wall-engine.mjs (or undo-core.mjs) reading w.flags?.[FLAG_SCOPE]?.run/.generated/.priorC from plain objects; returns {stamped, latest, generated:[ids], restores:[{_id,c,'flags.-=wall-autocomplete':null}], remaining} with the same string sort (.sort().at(-1)) and filtering. undo() calls planUndo(scene.walls.map(w=>w.toObject()),{all}) and keeps writes/chat text. Do NOT rename FLAG_SCOPE (data migration). Note: this changes throw -> works (intended fix); live workflow should confirm getFlag throws on v14 first.

**Behaviour test recipe (write first, must pass before and after).**

New foundry/module/pentaryn-walls/test/undo.mjs chained from test/run.mjs. Fixture walls: a{run:'2026-01-01T00:00:00Z',generated:true}, b{run:'2026-01-02T00:00:00Z',generated:true}, c{c:[0,0,50,0],run:'2026-01-02T00:00:00Z',rule:'X1',priorC:[0,0,80,0]}, d no flags, e generated no run (all under flags['wall-autocomplete']). Assert planUndo({all:false}): latest '2026-01-02T00:00:00Z', generated ['b'], restores [{_id:'c',c:[0,0,80,0],'flags.-=wall-autocomplete':null}], remaining 1; {all:true}: generated ['a','b']; [] -> stamped length 0. Round trip: runEngine(FIXTURES[0].walls,{runId:'r1'}), fold creates/updates as run.mjs applied() does, assert planUndo generated count == creates.length and restores count == updates.length. Port current filter/sort as legacyPlan and deep-equal.

**Risk.** Selection (ISO string sort), generated-wins-over-priorC split and remaining count are pinned by the test.

**Related:** senses-walls-cursors-10

### senses-walls-cursors-2 — wasm backend ignores wall levels; results diverge from JS reference and creates lose their level

**Category:** Hardening · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/backend-wasm.mjs:42–80`

**Anchor:** `function marshal(walls) {`

**Current.**

runEngine partitions by JSON(levels) (wall-engine.mjs:~916-923) and stamps creates with group levels. marshal() sends no levels and runWasm hardcodes levels: [] (line 79). pickBackend('auto') prefers wasm, so scenes using Levels get cross-level joins and level-less creates. No fixture sets levels.

**Proposed.**

At top of runWasm: if (walls.some(w => (w.levels ?? []).length)) return runEngine(walls, opts); (import runEngine). Level-less scenes unchanged; add fixtures so both backends are gated. This fixes a divergence (intended) rather than altering correct behaviour.

**Behaviour test recipe (write first, must pass before and after).**

test/fixtures.mjs: add {name:'levels - different levels never interact', walls:[two collinear stubs with levels:['L1'] and ['L2']], expect:{creates:0}} and {name:'levels - same-level gap fills', two collinear stubs both levels:['L1'], expect:{creates:1}} plus a run.mjs check that every create's levels deep-equals ['L1']. node test/run.mjs passes both today; node test/run.mjs --backend=wasm fails both; after the change both pass. All existing fixtures stay green on both backends; node test/bench.mjs still prints identical (level-less). Add --backend=wasm to the node-test gate in scripts/foundry/ops/modules.py (_check_node_test).

**Risk.** Level-less path untouched (guard false); bench proves it.

**Related:** senses-walls-cursors-3

### senses-walls-cursors-9 — Busy guard covers only keybindings; API/macro calls can overlap and chat writes are unawaited

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/pentaryn-walls.mjs:218–229`

**Anchor:** `  let busy = false;`

**Current.**

busy lives in the init hook wrapping the keybinding handlers. makeMacro macros call game.pentaryn.walls.run()/undo() directly (line 188) and bypass it. ChatMessage.create in report()/undo() is unawaited without catch.

**Proposed.**

Move busy to module scope and wrap exported preview/run/undo in an exclusive() helper (returns null + warning when busy); keybindings call the wrapped functions inside the existing error toast. Add .catch(console.error) to both ChatMessage.create calls. Note: API callers now get null during an active run (previously a possible double-run).

**Behaviour test recipe (write first, must pass before and after).**

Extract exclusive(fn,{onBusy}) into walls-util.mjs (no Foundry imports). New test/util.mjs: fn awaiting a manual promise; two un-awaited calls -> second returns null and onBusy called once; after resolve a third runs; a throwing fn releases busy. Port the current guard body to pin keybinding behaviour (second press returns true and warns).

**Risk.** Concurrent API callers get null; none known.

### senses-walls-cursors-3 — canonical()/compare() is blind to levels and rule stamp so backend drift is invisible

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/backends.mjs:52–71`

**Anchor:** `export function canonical(result) {`

**Current.**

canonical compares only coordinates, wall kind and refusal positions; wasm writes levels:[], rule 'X1' on all updates, log:[] and omits kind/sources flags, none of which compare() sees.

**Proposed.**

Add order-independent fields createLevels and updateRules to canonical(); document in backend-wasm.mjs header that rule/kind/sources/log are not reproduced. No runtime write changes.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: add opt-in --compare mode running compare() over all fixtures and printing differing fields. Record today's output first (expect updateRules differ on W1/W2 fixtures); assert creates/updates/refusals identical for every fixture. Do not gate new fields until wasm output is extended.

**Risk.** Diagnostic only; compare() is used only by test/bench.mjs.

**Related:** senses-walls-cursors-2

## LLM interface

### senses-walls-cursors-33 — preview() is not a pure read (chat card, pings, console); results omit backend and timing

**Category:** LLM interface · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/pentaryn-walls.mjs:115–120`

**Anchor:** `async function preview({sceneId, ...opts} = {}) {`

**Current.**

preview runs the engine then report(): whispered ChatMessage, canvas.ping per refusal, console tables. backend and ms are computed in evaluate() but dropped.

**Proposed.**

Add read-only analyze({sceneId,...opts}) returning {sceneId,sceneName,backend,ms,...result} calling only evaluate(); add describe() stating side effects of preview/run/undo/analyze/makeMacro; document in README.

**Behaviour test recipe (write first, must pass before and after).**

Stub scene {walls:[objects with toObject()],grid:{size:100},name:'S'} and settings backend 'js': analyze() makes 0 ChatMessage.create and 0 canvas.ping calls and its creates/updates/refusals deep-equal runEngine(readWalls(scene),{gridSize:100,runId}) with injected runId.

**Risk.** Additive; existing calls unchanged.

**Related:** senses-walls-cursors-2

## Documentation / skills

### senses-walls-cursors-8 — References to nonexistent playbooks/ path and stale '44 fixtures' count

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-walls/pentaryn-walls.mjs:12`

**Anchor:** ` * See playbooks/foundry-wall-autocomplete.md.`

**Current.**

pentaryn-walls.mjs:12, wall-engine.mjs:8, module.json:4, README reference playbooks/foundry-wall-autocomplete.md; only context/plans/foundry-wall-autocomplete.md exists. '44' fixture count appears in README, the backend setting hint, module.json and test/run.mjs:19 comment.

**Proposed.**

Point references at context/plans/foundry-wall-autocomplete.md and README.md; replace the count with 'the fixture corpus (test/fixtures.mjs)'; add a 'Read this when' line to README.

**Behaviour test recipe (write first, must pass before and after).**

Add to scripts/tests/test_module_checks.py an assertion that every playbooks/ reference under foundry/module/ resolves to an existing file (fails today). node test/run.mjs unaffected.

**Risk.** Settings-hint copy changes visibly (text only).

**Related:** senses-walls-cursors-27

## Categories checked with no finding

- **Extendability:** checked how a new engine backend is added. `backends.mjs register({name, run, available})` adds it, `compare()` runs every registered backend against the JS reference, and the README "Compiled backend (side-by-side)" section plus the fixture runner document the steps. A new rule goes in `wall-engine.mjs` with a fixture in `test/fixtures.mjs`. Nothing found.
