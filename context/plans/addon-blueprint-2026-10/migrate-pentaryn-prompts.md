---
title: Migration guide — pentaryn-prompts to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, migration, pentaryn-prompts]
---

# Migrating `pentaryn-prompts` to the blueprint

**Read this when:** you are about to bring `pentaryn-prompts` (`game.pentaryn.prompts`, the
`pentaryn-prompts.*` queries behind the fork's `prompt-markers` tool) up to the addon blueprint,
in the fix phase that follows the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the order across modules →
[`migration-order.md`](migration-order.md) (prompts is #14) · the audit findings in full →
[`../code-audit-2026-10/prompts.md`](../code-audit-2026-10/prompts.md) · how Claude uses the module →
[`../../foundry/prompt-markers.md`](../../foundry/prompt-markers.md).

Line numbers come from the frozen snapshot
(`…/scratchpad/audit-snapshot/pentaryn/module/pentaryn-prompts/`, taken 2026-10-10 20:15 at
`ee505c2` + uncommitted). On 2026-10-10 the live `foundry/module/pentaryn-prompts/` was
byte-identical to it (`diff -rq` empty). The audit noted prompts was being edited by the
live-test workflow earlier that day (mcp-fork-15 risk). Before you start:
- run `git diff ee505c2 -- foundry/module/pentaryn-prompts`;
- read `scripts/foundry/blueprint/wait.json`;
- run `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module prompts --markdown`.

If anything moved, re-anchor every line number below by its quoted anchor.

**WAIT: no.** Prompts imports nothing from `pentaryn-combat`, `-transform` or `-aoe`, and none of
them reads its flags. It is not in `wait.json`. It does have three outside contracts that every step must keep:
1. The MCP fork's `prompt-markers` tool calls `pentaryn-prompts.{list,gather,crops,replace,show}`
   and parses their payloads and `CODE: detail` error prefixes.
2. `test/scenarios.mjs` is imported live from `/modules/pentaryn-prompts/test/scenarios.mjs`, and it
   imports `./fixtures.mjs`, so that file **stays where it is**.
3. Eval-js scripts use `game.pentaryn.prompts.*`.

**Tier: full.** Prompts has world settings, a store (`lastCalls`), writes (markers, replacements),
queries and a prototype patch. Kit: tier `full` + `patch`, `patch-libwrapper` (lib-wrapper is in
`relationships.recommends`, so `vendor.py` allows it), and `perf` (only for the step-17 model
cache). It does not need `election`: every site keeps its own `game.user?.isGM` predicate.

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | K8 row `queryName` — **landed** (kit 1.0.1): give the `replaceMany` row `query: true, queryName: "replace"` instead of step 13's hand-registered `replace` exception, and step 14's "`describe().queries` + `replace`" becomes plain `describe().queries`; K10 hooks.test migration mode / adapter exception — open (the `ctx` sharing line landed in use-doc §4.1) |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module prompts --markdown`. On the snapshot it moved 51.2 % → 50.0 % (R8: C29 applies — token flags — and fails until the `inspect` row lands) |
| Note-only findings | prompts-lookup-31, -32, -33 are gap-fill stubs: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/prompts.md`](../code-audit-2026-10/prompts.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today — 51.2 % (21 / 41 fail-class rules)

From `conformance.py --snapshot <snapshot> --module pentaryn-prompts --json`.

| Rule | Status | Detail today | Cleared by |
|---|---|---|---|
| C01 | pass | | |
| C02 minimum 14 | pass | | |
| C03 dnd5e | pass | | |
| C04 languages | pass | | |
| C05 reachable | pass | | every new file is imported from the entry chain |
| C06 / C06w styles | pass | `styles/prompts.css` | |
| C07 `flags.pentaryn` | **fail** | missing tier, namespace, cssPrefix (`flagScope`, `generation` present) | Wave 7 batch (W1) |
| C08 socket | pass | | |
| C09 relationships | pass | lib-wrapper, item-piles carry reasons | |
| C10 size caps | **warn** | `character.mjs` 956/500, `geometry-core.mjs` 1454/600, `prompts.mjs` 352/150, `replace.mjs` 744/500 | step 9 (core split), step 12 (entry). `character-adapter` and `replace` stay warnings (§2) |
| C11 pure core | pass | | every new `core/*.mjs` loads with no globals (core.test) |
| C12 MODULE once | pass | `geometry-core.mjs:12` | moves to `prompts-core.mjs`, re-exported (step 8) |
| C13 stray .md | pass | | |
| C14 kit | **fail** | no `lib/kit.lock.json` | step 1 |
| C15 `import * as` | **fail** | `dialog.mjs:22`, `prompts.mjs:13` `import * as Typeahead` | step 11 (named imports from `typeahead-adapter.mjs`) |
| C16 import direction | **fail** | `dialog.mjs` (ui) → `markers.mjs`, `model.mjs` (glue), → `typeahead.mjs` (feature); 9 unclassified glue files | steps 10-12 (roles in §2), 2 `graph-allow.json` rows |
| C17 module-scope hooks | pass | all in `prompts.mjs` | features register through `reg` (step 12) |
| C18 install/uninstall | **fail** | `typeahead.mjs` has neither | step 11 |
| C19 emitted names | pass | emits none (`renderPromptDialog` is core's AppV2 hook) | |
| C20 golden/hooks.json | **fail** | | step 2 |
| C21 settings calls | **fail** | `dialog.mjs:28`, `gather.mjs:14`, `model.mjs:290`, `prompts.mjs:23,33,38,42,46,52,82,340` | step 5 |
| C22 SETTINGS | **fail** | | step 5 |
| C23 foreign settings | pass | (`core.gridDiagonals` is core's, allowed) | |
| C24 empty catch | **fail** | 15 sites: `character.mjs:102,420,921`, `gather.mjs:150,151,225`, `model.mjs:50,145,149,150,151`, `prompts.mjs:128,305`, `replace.mjs:101,432` | step 7 |
| C25 console prefix | pass | | `log.warn/error` keep the same text |
| C26 publish timers | **fail** | `prompts.mjs:316` `setTimeout(…, 0)` around publish | step 13 **[declared] DP1** |
| C27 api-manifest | **fail** | | step 13 |
| C28 describe/surface goldens | **fail** | | step 13 (additive goldens) |
| C29 inspect | n/a | the scorer sees no own-flag write; prompts **does** write `flags.pentaryn-prompts.{marker,prompt,provenance}` | step 13 adds `inspect` anyway (prompts-lookup-19) |
| C30 queries guarded | pass | `guarded()` `prompts.mjs:262` | step 13 → kit `registerQueries` + kit `guarded` |
| C31 | manual | | §2 manifest notes: writes (`replaceMany`, `place`, `ensureMarkers`) are legacy-shaped, throwing `CODE:` errors that the fork parses; documented `legacy: true`, not converted |
| C32 patches | **fail** | `prompts.mjs:169` `libWrapper.register` | step 6 |
| C33 private internals | manual | `prompts.mjs` `_onClickLeft2` ×2; `dialog.mjs` `_onRender`/`_onPosition` | dblclick → adjustments row (step 6); dialog hits are overrides on its own `ApplicationV2` subclass, noted in README, no row |
| C34 lang root | pass | `PENTARYN_PROMPTS` | |
| C35 i18n coverage | **fail** | definite 36 % (16/44): the `t()` two-branch wrapper at `prompts.mjs:18`, `dialog.mjs:25` | step 4 |
| C36 hard-coded English | pass (scorer) | `typeahead.mjs:84` toast is hard-coded (prompts-lookup-33) | step 4 |
| C37 / C37w CSS | pass | | |
| C38 cssPrefix unique | n/a | (C07) | W1 declares `pp-`; portals moves to `ppt-` (portals guide) |
| C39 run.mjs + node-test | pass | | |
| C40 tier tests | **fail** | missing core, glue, hooks, api, i18n tests | steps 2, 3, 13, 14 |
| C41 VERSION test | pass | `test/eval2-fixes.mjs` | re-asserted in `core.test` |
| C42 synthetic fixtures | n/a | | new fixtures under `test/fixtures/` |
| C43 fixed run.mjs | **fail** | | step 1 |
| C44 README order | **fail** | 12 sections missing | step 18 |
| C45 CHANGELOG | **fail** | | step 18 |
| C46 routing | pass | `context/foundry/prompt-markers.md` | |
| C47 adjustments per package | **fail** | no row for `item-piles`, `lib-wrapper` | step 6 (rows appended in the batch, use-doc §5.6) |
| C48 reserved names | **fail** | `prompts.mjs:344` `version` | step 13 (the kit builds `version` from the same `VERSION`) |
| C49 hot hooks | pass | `hoverToken` → `seesCount` iterates scene tokens (not `game.*`) | add `// hot:` comment with step 17 |
| C50 publish `when` | n/a | | step 13 |
| C51 literal labels | n/a | | step 5 |
| C52 | pass | | |

**Target after steps 1-18:** every fail-class rule passes except C07 (Wave 7). That is 40 of 41
fail-class rules, ≈ 98 % (the denominator grows when C38, C50 and C51 leave n/a), and 100 %
after W1. The warnings left are C10 for `character-adapter.mjs` (≈ 890 lines) and `replace.mjs`
(≈ 700); split those only with a reason (§4).

---

## 2. Target layout vs today

```
foundry/module/pentaryn-prompts/
  module.json                 unchanged until Wave 7 (W1)
  prompts.mjs                 ENTRY (esmodules[0], name kept — D11). File map, FEATURES, ctx, onInit/onReady. ≈ 120 lines
  prompts-core.mjs            PURE. MODULE, SHORT "prompts", NS "prompts", VERSION, CONTRACT "pentaryn-prompts/api@1",
                              I18N "PENTARYN_PROMPTS", CSS "pp-", HOOKS = {}, SPEC_DIR, CROP_DIR, KINDS, PATCH_KEYS
  geometry-core.mjs           PURE barrel: `export *` from core/*.mjs + MODULE/VERSION re-export (every importer unchanged)
  core/size.mjs grid.mjs sight.mjs group.mjs text.mjs gather-text.mjs xp.mjs doors.mjs placement.mjs view.mjs errors.mjs markers.mjs drop.mjs
  build-core.mjs npc-core.mjs readback-core.mjs   PURE (unchanged roles)
  typeahead-core.mjs          PURE: createTypeahead(...) state machine (prompts-lookup-31)
  settings.mjs                SETTINGS, keybindingRows(handlers), registerSettings, setting(key, fallback), coreSetting, the lastCalls store
  api-manifest.mjs            PURE rows (one table; queries registered from it)
  api.mjs                     GLUE: buildApiFor(ctx); impl for model, status, ensureMarkers, manifests, inspect, markersOn, manifest, selftest
  ── features (entry `import * as`, export install/uninstall), in FEATURES order = today's hook order ──
  marker-guard.mjs            preCreateToken hiding
  placement.mjs               P key / drop → box: placeAtCursor, pendingDrops, onCreateToken; contributes `place`, `open`
  hud-button.mjs              renderTokenHUD button
  tooltip.mjs                 hoverToken/canvasPan/renderPromptDialog/canvasTearDown/deleteToken wiring
  panels.mjs                  wall/token/note → PromptDialog.refreshPanels
  patches.mjs                 setup → wrapMethod(Token#_onClickLeft2); ctx.expose({ doubleClick })
  typeahead.mjs               window listeners on/off, orphan sink → PromptDialog
  gather.mjs                  contributes gather, crops, list, show (no hooks)
  replace.mjs                 contributes replace, replaceMany (no hooks)
  ── adapters (Foundry/third-party ↔ plain) ──
  markers-adapter.mjs         markerSizeOfToken, isPromptToken, markerActor(Ids), ensureMarkers, onPreCreateToken, tokenDataFrom
  scene-adapter.mjs           model.mjs + los.mjs merged (sceneModel, panelFor, seesCount, wallSegmentsOf, makeSight…)
  crops-adapter.mjs           crops.mjs
  packs-adapter.mjs           PACKS, indexOf, findItem, suggest, notFound (out of character.mjs, prompts-lookup-10)
  character-adapter.mjs       character.mjs less the pack lookup
  actor-patch-adapter.mjs     patch.mjs (the actor patch, not a prototype patch)
  npc-adapter.mjs             npc.mjs
  typeahead-adapter.mjs       the singleton createTypeahead instance + window listen/unlisten; today's start/take/cancel/isCapturing/setOrphanSink surface
  ── ui ──
  dialog.mjs                  PromptDialog (ApplicationV2)
  tip-ui.mjs                  the hover tip DOM: showTip/hideTip/tipFor
  lib/                        vendored kit + kit.lock.json
  lang/en.json styles/prompts.css templates/prompt-dialog.hbs assets/   unchanged (lang gains one key, step 4)
  test/run.mjs                fixed body; LEGACY = ["test/legacy-run.mjs"]
  test/legacy-run.mjs         today's run.mjs (eval2/eval3/usability suites + snapshots) — kept as the core oracle
  test/{core,glue,hooks,api,i18n,contract}.test.mjs
  test/fixtures.mjs           STAYS (scenarios.mjs imports it live); new builders under test/fixtures/
  test/golden/{hooks,legacy-surface,queries,describe,surface,settings,core-exports}.json
  test/kit/  test/graph-allow.json  test/snapshots/  test/scenarios.mjs
  README.md  CHANGELOG.md
```

**Imports, checked by C16.** The entry may import anything except `test/`. Features import ui,
adapters, settings, core and lib. Ui imports adapters, settings, core and lib. Adapters import
core and lib. `api.mjs` imports adapters, settings, `api-manifest`, core and lib. It never
imports a feature: `place`, `open`, `gather`, `crops`, `list`, `show`, `replace` and
`replaceMany` reach the API as **impl-only contributions**
(`install()` returns `{ rows: [], impl }`). Their rows stay in `api-manifest.mjs`, so queries
come from one table (`buildApi` accepts a contribution with no rows whose impl matches manifest
rows).

**`test/graph-allow.json` — two debts, each named:**
```json
{ "allow": [
  { "from": "character-adapter.mjs", "to": "packs-adapter.mjs", "why": "character builder resolves items through the pack lookup (adapter stack)" },
  { "from": "actor-patch-adapter.mjs", "to": "packs-adapter.mjs", "why": "patch addItems resolves items through the pack lookup (adapter stack)" }
] }
```
Two cross-file needs that would have been debts are designed out instead:
- `replace` → `gather` (`manifestFor`) moves the `lastCalls` ring into `settings.mjs`.
- `scene-adapter` → `markers-adapter` puts `markerSizeOf(tok, actors)` in `core/markers.mjs` and
  passes `game.actors`.

**Blueprint gap to report:** the flat "adapter → core, lib" rule has no notion of an adapter
stack. Prompts' actor builder (packs ← character/actor-patch) is one.

### Old → new map

| Snapshot lines | Anchor | Goes to | Step |
|---|---|---|---|
| `prompts.mjs` 10-16 | `import { MODULE, VERSION, SIZE_KEYS …` | entry imports | 12 |
| `prompts.mjs` 18 | `const t = (key, data) => (data ? game.i18n.format(` | deleted; call sites (84, 198, 241, 252) → `_loc("PENTARYN_PROMPTS.<key>", data)` | 4 |
| `prompts.mjs` 22-53 | `function registerSettings() {` | `settings.mjs` `SETTINGS` rows (literal keys) + `registerSettings()` = `defineSettings` | 5 |
| `prompts.mjs` 55-75 | `function registerKeybindings() {` | `settings.mjs` `keybindingRows({ place, edit })` (literal `PENTARYN_PROMPTS.keybind.*` keys) → `defineKeybindings`; `onDown` bodies → `placement.mjs` `onPlaceKey`/`onEditKey` | 5, 12 |
| `prompts.mjs` 78-104 | `async function placeAtCursor(sizeKey, { ticket = null } = {})` | `placement.mjs`; 88-93 → `markers-adapter.tokenDataFrom` (prompts-lookup-24) | 12, 15 |
| `prompts.mjs` 108-129 | `const pendingDrops = [];` / `function onDropCanvasData` | `placement.mjs` | 12 |
| `prompts.mjs` 136-144 | `function matchesDrop(doc, d)` | `core/drop.mjs` `matchesDrop(doc, d, now)` (pure; `Date.now()` injected) | 8 |
| `prompts.mjs` 146-153 | `function onCreateToken(doc, options, userId)` | `placement.mjs` | 12 |
| `prompts.mjs` 157-189 | `function patchDoubleClick()` | `patches.mjs` via `wrapMethod` + `libWrapperRoute` | 6 |
| `prompts.mjs` 191-214 | `function onRenderTokenHUD(app, element)` | `hud-button.mjs` | 12 |
| `prompts.mjs` 218-254 | `let tip = null;` … `function onHoverToken` | DOM (218-225, 231-253) → `tip-ui.mjs`; the hook logic (227-230) → `tooltip.mjs` | 12 |
| `prompts.mjs` 262-269 | `function guarded(fn) {` | deleted → kit `lib/queries.mjs` `guarded` (verbatim but for the injectable global) | 13 |
| `prompts.mjs` 271-278 | `function registerQueries() {` | manifest rows `query: true` (+ `wire` for gather/crops), plus the `replace` exception (§3 step 13) | 13 |
| `prompts.mjs` 282-286 | `Hooks.once("init", () => {` | entry `onInit` (registered **first**, as today) | 12 |
| `prompts.mjs` 289-302 | `Hooks.on("preCreateToken", …` … `Hooks.on("deleteToken", doc => {` | features, same order (step 12 table) | 12 |
| `prompts.mjs` 305-308 | `const refreshPanels = doc =>` | `panels.mjs` | 12 |
| `prompts.mjs` 310 | `Hooks.once("setup", () => patchDoubleClick());` | `patches.mjs` `install` → `reg.once("setup", …)` | 6, 12 |
| `prompts.mjs` 311 | `Typeahead.setOrphanSink(text => PromptDialog.takeOrphan(text));` | `typeahead.mjs` feature `install` | 11 |
| `prompts.mjs` 313-351 | `Hooks.once("ready", async () => {` | entry `onReady`: build, `publishNamespace`, then `await ensureMarkers()` (same `console.error` text); api object 317-345 → manifest + `api.mjs` + contributions | 13 |
| `geometry-core.mjs` 12-15 | `export const MODULE = "pentaryn-prompts";` / `VERSION` | `prompts-core.mjs`; barrel re-exports | 8 |
| `geometry-core.mjs` 18-57 | `CREATURE_KINDS`, `SIZES` … `footprintSquares` | `core/size.mjs` (+ `SIZE_WORDS`, `PC_SIZE_WORDS`, `parseCr`, prompts-lookup-9) | 9 |
| `geometry-core.mjs` 59-191 | `BANDS` … `gaplessDistanceFt` | `core/grid.mjs` | 9 |
| `geometry-core.mjs` 193-347 | `SENSE` … `isSeen` | `core/sight.mjs` | 9 |
| `geometry-core.mjs` 349-520 | `groupScene`, `components`, `assignIds` | `core/group.mjs` | 9 |
| `geometry-core.mjs` 522-644 | `fnv1a` … `idCompare` (hashes, text helpers, `stripHtml`) | `core/text.mjs` | 9 |
| `geometry-core.mjs` 646-922 | `LEGEND`, `SEES_CAP`, `renderGather` … `itemsText` | `core/gather-text.mjs` | 9 |
| `geometry-core.mjs` 924-999 | `ENCOUNTER_XP` … `difficulty` | `core/xp.mjs` | 9 |
| `geometry-core.mjs` 1001-1111 | `export function doorLines(` | `core/doors.mjs` | 9 |
| `geometry-core.mjs` 1113-1187 | `placementFor` … `dialogPosition` (+ `panelRels`, `seenCount` later, prompts-lookup-7) | `core/placement.mjs` | 9 |
| `geometry-core.mjs` 1189-1437 | `buildView`, `makeRel`, `testPoints` | `core/view.mjs` | 9 |
| `geometry-core.mjs` 1439-1453 | `export const CODES = Object.freeze(["TEXT_CHANGED"` / `codedError` / `errorCode` | `core/errors.mjs`. **Prompts keeps its own `codedError`**: a plain `Error` with `.code`, domain `CODES`. It is not swapped for the kit's `PentarynError` | 9 |
| `markers.mjs` 10-16, 18-21, 34-37 | `FOLDER_NAME`, tints, `art`, `actorName`, `markerSizeOfActor`, `promptText` | `core/markers.mjs` + `markerSizeOf(tok, actors)` (the body of 24-30 with `game.actors` injected) | 10 |
| `markers.mjs` 23-32, 39-151 | `markerSizeOfToken`, `isPromptToken`, `markerActor`, `markerActorIds`, `ensureMarkers`, `onPreCreateToken` | `markers-adapter.mjs` (`markerSizeOfToken = tok => markerSizeOf(tok, game.actors)`) | 10 |
| `model.mjs` 1-367 + `los.mjs` 1-103 | `export function sceneModel(` / `export function makeSight(` | `scene-adapter.mjs` (≈ 470 lines). `model.mjs:290` `game.settings.get("core","gridDiagonals")` → `settings.coreSetting("gridDiagonals", 0)` | 5, 10 |
| `gather.mjs` 13-15 | `const setting = (key, fallback) =>` | `settings.mjs` `setting(key, fallback)` | 5 |
| `gather.mjs` 59-73 | `export function manifests()` / `manifestFor` / `storeManifest` | `settings.mjs` (the `lastCalls` store: same read, same plain `game.settings.set`, **not** `serialStore` yet) | 5 |
| `gather.mjs` rest | `export async function gather(opts = {})` … | `gather.mjs` **feature** (`install` returns impl) | 12 |
| `crops.mjs` 1-190 | `export async function renderCrops(` | `crops-adapter.mjs` | 10 |
| `character.mjs` 26-88 | `const PACKS = {` … `export async function notFound(` | `packs-adapter.mjs`; `character-adapter.mjs` re-exports `findItem`, `notFound` | 10 |
| `character.mjs` rest | `export async function resolveCharacter(w)` … | `character-adapter.mjs` | 10 |
| `patch.mjs` 1-276 | `export async function checkPatch(patch)` | `actor-patch-adapter.mjs`; `known` at 66-67 → `prompts-core.mjs` `PATCH_KEYS`; `SIZE_WORDS` at 45 re-exported from `core/size.mjs` | 9, 10 |
| `npc.mjs` 1-118 | `export async function checkNpc(w)` | `npc-adapter.mjs` | 10 |
| `replace.mjs` 33 | `export const KINDS = Object.freeze([` | `prompts-core.mjs`; `replace.mjs` imports **and re-exports** it | 9 |
| `replace.mjs` 37, 440-445 | `const NPC_SIZE = {` / `function crNumber(cr)` | `core/size.mjs` `SIZE_WORDS`, `parseCr` | 9 |
| `replace.mjs` 704 | `export const SPEC_DIR = "pentaryn-prompts-specs";` | `prompts-core.mjs` (`api.status` needs it); `replace.mjs` re-exports | 8 |
| `replace.mjs` rest | `export async function replaceMany(input, opts = {})` | `replace.mjs` **feature** (`install` returns impl) | 12 |
| `typeahead.mjs` 17-107 | `const TIMEOUT_MS = 3500;` | logic → `typeahead-core.mjs` `createTypeahead`; window listeners + instance → `typeahead-adapter.mjs`; `typeahead.mjs` becomes the feature (install/uninstall) | 11 |
| `dialog.mjs` 22, 25, 27-29 | `import * as Typeahead` / `const t =` / `const setting =` | named imports from `typeahead-adapter.mjs`; `_loc` literals; `setting` from `settings.mjs` | 4, 5, 11 |
| `test/run.mjs` 1-418 | `Fixtures for geometry-core.mjs` | `test/legacy-run.mjs` (body unchanged; `HERE`-relative snapshot paths still resolve) | 1 |

---

## 3. Ordered steps

Each step is one commit-sized change. It is behaviour-neutral unless marked **[declared]**.
"Char. test" means the characterisation test written and passing against the **unchanged** code
**before** the step. Write goldens one file at a time with `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`.
Never run `GOLDEN_UPDATE=1` on the legacy suite or `UPDATE_SNAPSHOTS=1` during a refactor step.
Agents commit each characterisation checkpoint (review happens at merge).

### Step 1 — vendor the kit, fixed `run.mjs`
- `vendor.py sync prompts --tier full --kit patch,patch-libwrapper,perf`. Then `vendor.py check prompts` exits 0.
- `git mv test/run.mjs test/legacy-run.mjs`. Write the fixed `test/run.mjs` (use-doc §6) with
  `LEGACY = ["test/legacy-run.mjs"]`.
- Absorbs: C14, C43.
- Char. test: `node test/run.mjs` prints `pentaryn-prompts core: 403 passed, 0 failed` from the legacy
  suite (the snapshot count; re-read it live). `test/snapshots/two-scenes.txt` is untouched.

### Step 2 — characterise glue, surface, settings, queries (checkpoint)
New `test/fixtures/world.mjs` built with the kit stub:
- a GM user;
- scene `s1` (`dimensions.size 100`, `grid.distance 5`, two walls, one closed door) holding
  marker tokens `m1` (mid, prompt `"a lantern"`) and `m2` (sm, prompt `"goblin boss"`), plus one
  ordinary token;
- the six `Prompt · <size>` actors in the `Prompt Markers` folder.

Then:
- `test/glue.test.mjs`: install the stub, then import `../prompts.mjs`. Pin `F.hooks` →
  `golden/hooks.json`. Today, in order: `once init`, `on preCreateToken`, `on dropCanvasData`,
  `on createToken`, `on renderTokenHUD`, `on hoverToken`, `on canvasPan`, `on renderPromptDialog`,
  `on canvasTearDown`, `on deleteToken`, `on createWall`, `on updateWall`, `on deleteWall`,
  `on createToken`, `on deleteToken`, `on createNote`, `on deleteNote`, `on updateToken`,
  `once setup`, `once ready` (20 rows; normalise to `{kind, name}`).
  - Record the window listeners: `keyup` added at import (capture `true`).
  - `F.fire("init")`: pin `F.calls` `settings.register` ids in order, and each recorded config →
    `golden/settings.json`. That is `panelRows`, `panelChars`, `gatherChars`, `unseenWithinFt`,
    `cropMaxPerCall`, `cropLongSidePx`, `cropsDefault`, `party`, `deleteEmptyOnClose`,
    `defaultSize`, `lastCalls`, with name/hint/scope/config/type name/default/range/choices. Then
    `keybindings.register` `place`, `edit` with their name keys.
  - `CONFIG.queries` keys: `pentaryn-prompts.{list,gather,crops,replace,show}`.
  - `F.fire("setup")`: lib-wrapper inactive, so `_onClickLeft2` on the stub `CONFIG.Token.objectClass.prototype`
    is replaced. Then `F.fire("ready")` and flush timers (`t.mock.timers` or `await new Promise(r => setTimeout(r, 0))`):
    `game.pentaryn.prompts` is present under both load orders (`game.pentaryn` undefined; a frozen
    `{ importer: {} }`). `status().doubleClick === "direct"`.
  - console texts byte-identical. Make `ensureMarkers` throw → `pentaryn-prompts | ensureMarkers failed`.
    With a stub libWrapper active whose `register` throws, you get
    `pentaryn-prompts | libWrapper registration failed, wrapping by hand`. With the prototype
    method missing, you get `pentaryn-prompts | Token#_onClickLeft2 not found; double-click will open the sheet`.
  - `golden/legacy-surface.json` holds the sorted keys and typeof of `game.pentaryn.prompts`: 13 keys,
    `gather list crops show replace replaceMany open place ensureMarkers model manifests status`
    are functions, and `version` is the string `"0.4.1"`.
- `test/api.test.mjs`: `characterise("queries", …)` → `golden/queries.json`, calling
  `CONFIG.queries[name](data, { user: gm })` for:
  - `list({})`;
  - `gather({ crops: "off" })`, which records that the payload has no `cropsAs` key in the
    manifest (`cropsAs: "base64"` was applied by the wire);
  - `crops({ call: "nope" })`, which rejects `CALL_UNKNOWN: …`;
  - `replace({ replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "light", config: { dim: 10 } } }], dryRun: true })`;
  - `replace({ replacements: [] })`, which rejects `BAD_SPEC: replacements must be a non-empty array`;
  - `show({ sceneId: "s1", markerId: "m1" })`, with a stub `canvas.ping` recording the call.

  A non-GM sender `{ user: { isGM: false, name: "P" } }` rejects with message `NOT_GM: P is not a GM`
  and `.code === "NOT_GM"`. A non-GM client rejects `NOT_GM: this client is not a GM`. Pin the
  message and code only, never the class.
- `test/core.test.mjs`: import `../geometry-core.mjs` bare. Pin
  `Object.keys(await import("../geometry-core.mjs")).sort()` (77 names) and `build-core` (33 names)
  → `golden/core-exports.json` (prompts-lookup-20's surface test). Pin `VERSION ===` module.json
  version, and the `stripHtml` seven-input table from prompts-lookup-28 with its measured outputs.
- Absorbs: prompts-lookup-28 (prompts half), and the char. half of -16, -19, -20 and -12 (module
  side). The fake harness of prompts-lookup-14 is replaced by the kit stub and `fixtures/world.mjs`.
- **Checkpoint:** review the `test/` diff; commit it as the checkpoint.

### Step 3 — characterise the pieces later steps move
All in `core.test.mjs` / `glue.test.mjs`, against unchanged code. To reach non-exported
functions, add `export` to them. That edit changes no behaviour and goes in this commit:
`NPC_SIZE` and `crNumber` (`replace.mjs:37,440`), `tokenGeometry` (`model.mjs`), `bitmap`
(`crops.mjs`), and `wallsFor` (`los.mjs:23`).
- prompts-lookup-9: for w in `["tiny","small","sm","medium","med","large","lg","huge","gargantuan","grg","Huge","x",""]`,
  `NPC_SIZE[w.toLowerCase()] ?? null` equals `patch.SIZE_WORDS[...]`. For cr in
  `["1/4",0.25,"3",3,"",null,undefined,"x"," 1 / 2 ","1/8"]`, `crNumber` gives
  `[0.25,0.25,3,3,null,null,null,null,0.5,0.125]`. The character subset (`character.mjs:376`) has
  no `huge` key.
- prompts-lookup-17: `tokenGeometry({x:0,y:0,width:1,height:1,elevation:0,getSize(){throw 1},getMovementOrigin(){throw 1}},100)`
  gives rect `{x:0,y:0,w:100,h:100}`, centre `{x:50,y:50,elevation:0}`, origin = centre,
  `coreSquares: false`, squares `[{i:0,j:0}]`.
- prompts-lookup-22: a `sceneMeta(stub)` scene with three walls: w1 (sight 20, threshold
  `{sight:2}`), w2 (sight 0), and door d1 (sight 20, `levels: Set(["L2"])`). Golden `.walls` /
  `.doors`: w1 threshold 40, w2 excluded, d1 in both. Extend the stub until `heightWarning` passes.
  `wallsFor(stub, "L1")` excludes d1 and includes w1 and w2.
- prompts-lookup-24: dialog, prompts and replace token-data shapes. Fake actor
  `getTokenDocument: async (pos) => ({ toObject: () => ({ _id: "z", name: "A", x: pos.x, y: pos.y, width: 1, flags: {} }), getSnappedPosition: p => p })`:
  - `placeAtCursor` (via `api.place`) creates data with snapped x/y and `elevation`, and `level`
    only when `canvas.level.id` is set.
  - dialog `#onSize` sets elevation and level **unconditionally** (`level: null` is an own property).
  - replace sets level only when the marker has one, and no elevation.

  Pin each through `F.calls` `createEmbeddedDocuments` data.
- prompts-lookup-31: the stub-window typeahead table from the finding (tickets newest-first;
  Shift alone / Cmd+c pass; Cmd+Enter → save; Shift+Escape → discard; Backspace after `👍a` leaves
  `👍`; ArrowLeft and `isComposing` swallowed; a keyup is swallowed exactly once; the 3,500 ms orphan →
  toast `Typed before a prompt box opened and not used: "hi"`; a sink returning true → no toast;
  `take(999)` → `{text:"", close:null}`). **KNOWN** rows (prompts-lookup-32): keyup after `blur`
  is still swallowed; there is no `uninstall`.
- prompts-lookup-15: `bitmap("a.webm", new Map())` is null without touching fetch; the today URL
  rule maps `maps/a.webp` → `/maps/a.webp`, `/maps/a.webp` unchanged, `https://x/y.png` unchanged.
  **KNOWN**: `data:x` → `/data:x`.
- prompts-lookup-14: `replaceMany({ replacements: { a: 1 } })` rejects a bare `TypeError` (**KNOWN**).
  A dry run with two specs on `m1` gives text starting `replace (by marker) — dry run: 1 ok, 1 failed`
  and a row noting `m1 is replaced twice in this call` (capture the exact strings by running).
  `ring: "gold"` rejects `BAD_SPEC: ring must be pc|foe|named|mook|none, got gold`.
- prompts-lookup-13: `KINDS` deep-equals `["actor","npc","character","hotspot","note","light","tile","none"]`.
  Dry-run `.text` and `.results[0]` for `{kind:"light",config:{dim:10}}`, `{kind:"tile",src:"a.webp"}`,
  `{kind:"none",reason:"r"}` and `{kind:"note",name:"N",html:"<p>x</p>"}` go in
  `golden/replace-dry.json`. `{kind:"x"}` gives a BAD_SPEC row containing
  `with.kind must be one of actor|npc|character|hotspot|note|light|tile|none`. A real-run light
  creates AmbientLight data at the marker centre with `provenance.markerId "m1"`, and the marker is
  deleted.
- prompts-lookup-10: `poolIndex` reference over the finding's table, against a pasted copy of
  `character.mjs:214-216`. Then the `findItem("Tough","feat")` / `suggest("Tuff","feat")`
  asymmetry with a stub pack (use distinct pack ids; `indexCache` is module-level).
- prompts-lookup-21: `LEGEND` pinned verbatim. `groupScene` groups prompts 30 ft apart together and
  35 ft apart into two groups. Formation holds at 15 ft and breaks at 20 ft.
- prompts-lookup-23: the `sceneItems` host table from the finding (call-equality, first-wins,
  scaffold folder) and `pageScenes`-equivalent paging through `gather`'s `next`.
- mcp-fork-15 / prompts-lookup-11: the `checkPatch` `known` list (`patch.mjs:66-67`), sorted, deep-equals
  `["ac","addItems","biography","cr","creatureType","disposition","hp","img","itemUpdates","languages","name","recharge","removeItems","set","size","speed","traits"]`.
  `checkPatch({ bogus: 1 })` rejects `BAD_SPEC` with `known:` in the message.
- **Checkpoint** as in step 2.

### Step 4 — i18n literals (C35, C36)
- Delete `t` at `prompts.mjs:18` and `dialog.mjs:25`. Each call `t("x.y")` becomes
  `_loc("PENTARYN_PROMPTS.x.y")` and `t("x.y", data)` becomes `_loc("PENTARYN_PROMPTS.x.y", data)`:
  4 sites in `prompts.mjs` (84, 198, 241, 252) and 15 in `dialog.mjs`. The rendered strings are
  identical: v14 `localize` interpolates (game.mjs:74).
- `typeahead.mjs:84`: add `PENTARYN_PROMPTS.typeahead.orphan`
  = `Typed before a prompt box opened and not used: "{text}"` to `lang/en.json`. Call
  `_loc("PENTARYN_PROMPTS.typeahead.orphan", { text: text.trim().slice(0, 120) })`.
- Absorbs: prompts-lookup-33, C35.
- Char. test (before): `i18n.test.mjs` loads `lang/en.json` and stubs `_loc` as lookup + `{k}`
  substitution. For every literal key the gate finds, the key exists. The orphan toast for
  `{text:"hello world"}` equals today's literal, and a 200-character input is cut at 120. The step 3
  typeahead table's toast assertion still holds (same string). `make foundry-prompts-check` i18n
  gate reports definite coverage ≥ 90 %.

### Step 5 — `settings.mjs` (C21, C22, C51)
- `SETTINGS` rows in today's order. Each carries a literal `name`/`hint`
  (`PENTARYN_PROMPTS.settings.<key>.name` / `.hint`), the same scope/config/type/default/range,
  and `doc`.
  - `cropsDefault.choices` is the literal object `{ auto: "PENTARYN_PROMPTS.settings.cropsDefault.auto", … }`.
  - `defaultSize.choices = Object.fromEntries(SIZE_KEYS.map(k => [k, k]))`. Use the **object**,
    never an array: the kit derives label keys for array choices.
  - `lastCalls` is `{ key: "lastCalls", store: true, type: Array, default: [] }`.
- `registerSettings()` = `defineSettings(MODULE, SETTINGS, { i18nRoot: "PENTARYN_PROMPTS", labels: { section: "settings", name: "name", hint: "hint" } })`.
  The literals win anyway.
- `keybindingRows({ place, edit })` returns the two rows: literal
  `PENTARYN_PROMPTS.keybind.place` / `placeHint`, `editable`, `restricted: true`, and the
  `onDown` passed in. Register through `defineKeybindings`.
- `setting(key, fallback)` keeps today's **local** semantics:
  `try { return game.settings.get(MODULE, key) ?? fallback } catch { return fallback }`. The kit's
  `settingReader` would return the row default instead. `gather.mjs:83` used to pass 160 where the
  default is 400 (prompts-lookup-16); D6 (decided 2026-10-11, landed in wave 1) made it pass the shared
  `GATHER_CHARS` (400, `geometry-core.mjs`), the same constant the `gatherChars` row registers, so the
  local and kit semantics now agree for it. The `catch` carries a `log.debug`, so C24 passes.
- `coreSetting(key, fallback)` serves `model.mjs:290`. `manifests()`, `manifestFor(call)` and
  `storeManifest(m)` move here from `gather.mjs:59-73`, bodies verbatim.
- `prompts.mjs:82` uses `setting("defaultSize")` with no fallback, exactly as today: a throw still
  propagates. Write it `game.settings.get` inside `settings.mjs` as `settingStrict(key)`.
- `prompts.mjs:340` party: `setting("party", "none set") || "none set"` gives the same results as
  today's try/`||`/catch.
- Absorbs: prompts-lookup-16, C21, C22, C51.
- Char. test: `golden/settings.json` from step 2, unchanged after the move. Add the finding's
  cases: with `game.settings.get` throwing, `setting("gatherChars", 160) === 160` and
  `setting("gatherChars", 400) === 400`. Add `i18n.test` C51 rows: every row's literal name/hint
  exists in `lang/en.json`.

### Step 6 — the double-click patch through `wrapMethod` (C32, C47)
`patches.mjs` holds the patch:

```js
let handle = null;
export function install(reg, ctx) {
  reg.once("setup", () => patchDoubleClick(ctx), { guard: false, label: "setup: dblclick" });
}

function patchDoubleClick(ctx) {
  const proto = (CONFIG.Token.objectClass ?? foundry.canvas.placeables.Token).prototype;
  const viaLW = !!(game.modules.get("lib-wrapper")?.active && globalThis.libWrapper);
  if (!viaLW && typeof proto._onClickLeft2 !== "function") {
    ctx.log.warn("Token#_onClickLeft2 not found; double-click will open the sheet");
    return (handle = null);
  }
  handle = wrapMethod(MODULE, {
    target: proto, name: "_onClickLeft2", label: "Token#_onClickLeft2",
    path: "CONFIG.Token.objectClass.prototype._onClickLeft2", type: "MIXED",
    marker: "__pentarynPromptsClick", adjustments: "prompts-token-dblclick",
  }, function (wrapped, event) {
    if (intercept(this)) return;
    return wrapped(event);
  }, { via: libWrapperRoute({ log: ctx.log }), log: ctx.log });
  ctx.expose({ doubleClick: () => handle?.via ?? null });   // "libWrapper" | "direct" | null — today's values
}
```

- Keep `type: "MIXED"`; the route defaults to `"WRAPPER"`. The route's failure warn is
  byte-identical to today's (`… | libWrapper registration failed, wrapping by hand`).
- Append rows to `foundry/adjustments.yml` in the batch (use-doc §5.6). Each has
  `check: make foundry-prompts-check`:
  - `prompts-token-dblclick`: packages `[lib-wrapper, core]`, files
    `[foundry/module/pentaryn-prompts/patches.mjs]`, markers
    `["__pentarynPromptsClick", "_onClickLeft2"]`, `retire_class: guarded`.
  - `prompts-item-piles-hotspot`: packages `[item-piles]`, files `[replace.mjs, scene-adapter.mjs]`,
    markers `["flags.item-piles.data", "Hotspot · Look (template)"]`.
- Absorbs: C32, C47, C33 (dblclick part).
- Char. test: step 2's console pins and `status().doubleClick === "direct"`. In `api.test`, every
  `patches()` record has a non-empty `adjustments`. **[declared] DP4**: the new marker makes a hot
  re-import idempotent. The edge case (libWrapper active and the method missing) now warns once
  instead of twice.

### Step 7 — no comment-only catch (C24)
- The 15 sites get `catch (err) { log.debug("<site>", err); … }`, with the fallback bodies
  unchanged. `model.mjs:145-151` (the core-token-API fallbacks) use
  `log.warnOnce("Token#getSize", "Token#getSize: core API failed, using the fallback", err)` and its
  siblings. That is prompts-lookup-17's drift warning through the kit's `warnOnce`, not a new
  `log.mjs`. Adapters may import only core and lib (C16), so each adapter makes its own
  `const log = makeLog(MODULE)` from `lib/log.mjs`. It has the same id and prefix, and the debug
  gate `CONFIG.debug["pentaryn-prompts"]` is shared. Features and ui use `ctx.log`.
- Absorbs: prompts-lookup-17 (whole), C24.
- Char. test: the step 3 `tokenGeometry` pin is unchanged. New (additive): with
  `CONFIG.debug["pentaryn-prompts"]` off, `tokenGeometry` with a throwing `getSize` called twice
  gives one `console.warn`, `pentaryn-prompts | Token#getSize: core API failed, using the fallback`
  (**[declared] DP9**, console only). The debug lines appear only when the flag is on.

### Step 8 — `prompts-core.mjs`, constants out of feature files
- Create `prompts-core.mjs` with `MODULE`, `VERSION` (moved from `geometry-core.mjs:12-15`;
  geometry-core re-exports them), `SHORT`, `NS`, `CONTRACT`, `I18N`, `CSS`, `HOOKS = Object.freeze({})`,
  `SPEC_DIR` (from `replace.mjs:704`), `CROP_DIR` (from `gather.mjs:140`), `KINDS` (from
  `replace.mjs:33`; replace re-exports it) and `PATCH_KEYS` (from the `known` list at `patch.mjs:66-67`;
  `checkPatch` uses it).
- Create `core/drop.mjs` `matchesDrop(doc, d, now)` from `prompts.mjs:136-144`.
- Absorbs: mcp-fork-15 (module half), prompts-lookup-11 (module half: `PATCH_KEYS` is the live
  source; fold `SPEC_KEYS` per kind in here when the fork side is done), C12 stays.
- Char. test: the step 3 `KINDS`/`known` pins; `golden/core-exports.json` (the barrel must still
  export `MODULE`, `VERSION`). `matchesDrop`: a table over actor mismatch, a window edge (3000 ms
  in, 3001 ms out), the scene mismatch, a non-finite drop point → true, and the tolerance edge
  `g * max(1, width)`. Compare against a pasted copy of today's function (oracle).

### Step 9 — split `geometry-core.mjs` behind the barrel
- Move the ranges in §2 into `core/{size,grid,sight,group,text,gather-text,xp,doors,placement,view,errors}.mjs`.
  The dependency order is acyclic: size → grid → sight → text → xp → group → doors → placement →
  view → gather-text. `geometry-core.mjs` becomes `export * from "./core/<x>.mjs"` for each,
  plus `export { MODULE, VERSION } from "./prompts-core.mjs"`.
- Add `SIZE_WORDS`, `PC_SIZE_WORDS` and `parseCr` to `core/size.mjs`. `replace.mjs` drops
  `NPC_SIZE`/`crNumber`; `patch.mjs` re-exports `SIZE_WORDS`; `character.mjs:376` uses
  `PC_SIZE_WORDS`.
- Name `LINK_FT = 30` and `FORMATION_FT = 15` in `core/group.mjs`, and build the two `LEGEND` lines
  (`:653-654`) from them.
- Move `cropsDecision` and `specFileUrl` out of `build-core.mjs` into `core/text.mjs`, keeping the
  `build-core` re-exports.
- Absorbs: prompts-lookup-20, prompts-lookup-9, prompts-lookup-21, C10 (core).
- Char. test: `golden/core-exports.json` must be unchanged (77 and 33 names). The legacy suite
  (403) and `two-scenes.txt` must pass without `UPDATE_SNAPSHOTS`. Each `core/*.mjs` imports bare
  in `core.test` with `game`, `canvas` and `foundry` undefined. Step 3's -9 and -21 pins hold,
  plus `PC_SIZE_WORDS.huge === undefined` and `PC_SIZE_WORDS.small === "sm"`.

### Step 10 — adapters (renames and the two merges)
- Splits:
  - `markers.mjs` → `core/markers.mjs` (pure) + `markers-adapter.mjs`.
  - `model.mjs` + `los.mjs` → `scene-adapter.mjs`. Inside it, one `wallSegmentsOf(scene, { levelId = null, sightOnly = false })`
    replaces `wallsFor` (`los.mjs:23-34`) and the `sceneMeta` walls (`model.mjs:269-274`) (prompts-lookup-22).
  - `character.mjs` → `packs-adapter.mjs` (`:26-88`) + `character-adapter.mjs`, which re-exports
    `findItem`/`notFound`. `findItem`'s inline type map at `:59` becomes a named `FIND_TYPE` with
    the "no `feat`, deliberately" comment.
- Renames: `patch.mjs` → `actor-patch-adapter.mjs`, `npc.mjs` → `npc-adapter.mjs`,
  `crops.mjs` → `crops-adapter.mjs`. Update every importer.
- Leave `graph-allow.json` with exactly the two rows in §2.
- Absorbs: prompts-lookup-10 (pack move + `FIND_TYPE`; `poolIndex` is standalone), prompts-lookup-22,
  C16 (adapters).
- Char. test: the step 3 -22 goldens and the -10 asymmetry pins. `golden/queries.json`,
  `replace-dry.json` and `hooks.json` are unchanged. Check `git diff --stat -- test/golden` is empty.

### Step 11 — typeahead: core + adapter + feature (C15, C18)
- `typeahead-core.mjs` gets `createTypeahead({ setTimer, clearTimer, timeoutMs = 3500, onOrphan })`
  → `{ start, take, cancel, isCapturing, setOrphanSink, keyDown(ev) → swallow, keyUp(code) → swallow }`.
  The logic is verbatim from `typeahead.mjs:17-107`.
- `typeahead-adapter.mjs` holds the instance, calls `preventDefault()` + `stopImmediatePropagation()`
  when the core says swallow, and exports today's `start`/`take`/`cancel`/`isCapturing`/`setOrphanSink`,
  plus `listenKeyup()`/`unlistenAll()`. The keydown listener is still added and removed by
  capture state (`:61-66`).
- `typeahead.mjs` (feature): `install(reg, ctx)` calls `listenKeyup()` and
  `setOrphanSink(text => PromptDialog.takeOrphan(text))`. `uninstall()` calls `unlistenAll()`
  (prompts-lookup-32 item 1).
- `dialog.mjs:22` and the placement feature use named imports from the adapter.
- Absorbs: prompts-lookup-31, prompts-lookup-32 (items 1 and 3: `uninstall` and the README line
  about API capture), C15, C18.
- Char. test: the step 3 stub-window table, run against the new files (same results), **and**
  directly against `createTypeahead` with plain events. New: `uninstall()` records
  `removeEventListener("keydown", f, true)` and `("keyup", f, true)`, and a second call is a no-op.
  The KNOWN blur row stays KNOWN (step 16 flips it).

### Step 12 — features, entry ≤ 150 lines (C10, C16, C17)
- Entry body, in this order:
  1. `Hooks.once("init", onInit)`. It stays the **first** hook, as today. `onInit` runs
     `registerSettings()`, `registerKeybindings(keybindingRows({ place: onPlaceKey, edit: onEditKey }))`
     and `registerQueries` (step 13).
  2. `install()` over `FEATURES = [typeahead, markerGuard, placement, hudButton, tooltip, panels, patches, gather, replace]`.
  3. `Hooks.once("ready", onReady)`.
- `F.hooks` must come out identical to `golden/hooks.json`:
  - `marker-guard`: `preCreateToken`.
  - `placement`: `dropCanvasData`, `createToken`.
  - `hud-button`: `renderTokenHUD`.
  - `tooltip`: `hoverToken`, `canvasPan`, `renderPromptDialog`, `canvasTearDown`, and the
    **one combined** `deleteToken` handler (`tipFor` + `PromptDialog.onTokenDeleted`, today's
    `:299-302`). Do not split it.
  - `panels`: the seven `refreshPanels` hooks in the order of `:307`, then `updateToken`.
  - `patches`: `once setup`.
  - `typeahead`, `gather`, `replace`: none.
- Every `reg.on` passes `{ guard: false }` where today's handler has no try/catch
  (`dropCanvasData` has one, `createToken`, `hoverToken`, …). The kit guard would replace Foundry's
  "Error thrown in hooked function" with our own line. That is console-only, but it is a change,
  listed as optional **DP10**. Handlers that already catch keep their own `log.warn` text.
- `placement.install` returns `{ rows: [], impl: { place: placeAtCursor, open } }`. The body of
  `open` is `prompts.mjs:320-325`.
- `gather.install` returns `{ rows: [], impl: { gather, crops, list, show } }`, and
  `replace.install` returns `{ rows: [], impl: { replace, replaceMany } }`.
- `tooltip` imports `tip-ui.mjs` (`showTip`, `hideTip`, `tipFor`). `placement` calls `hideTip`
  from `tip-ui.mjs` (`:117`).
- Absorbs: C10 (entry), C16 (features/ui), C17, C18.
- Char. test: `golden/hooks.json` unchanged. Step 2 glue cases unchanged: drop → createToken
  opens the dialog with the drop's client coordinates and ticket; a non-matching createToken does
  not; HUD button added once; hover builds the tip and `deleteToken` of the hovered token removes
  it. `hooks.test`: every feature exports `install`/`uninstall`; `uninstall()` leaves `reg.ids()`
  empty and the window listeners removed.

### Step 13 — manifest, `api.mjs`, kit queries, publish (C26, C27, C28, C48, C50) **[declared] DP1-DP3**
- `api-manifest.mjs` rows:
  - **Legacy** (`legacy: true`, today's signatures; no param may be named `ref`):
    - `gather` (`query: true`, `wire: d => ({ cropsAs: "base64", ...d })`);
    - `crops` (`query: true`, same `wire`);
    - `list` (`query: true`);
    - `show` (`query: true`);
    - `replace` (`params: [{ name: "spec" }, { name: "opts" }]`, doc "ONE replacement — use
      replaceMany for a batch");
    - `replaceMany` (`writes: true`, `gm: true`);
    - `open` (`tokenOrId`);
    - `place` (`sizeKey`, `{ ticket }`);
    - `ensureMarkers` (`writes: true`);
    - `model` (`sceneId`, throws `SCENE_UNKNOWN`);
    - `manifests`;
    - `status`.
  - **New, read-only** (prompts-lookup-19):
    - `inspect` (own row, `params: [{ name: "ref", kind: "token" }, { name: "opts" }]`) →
      `{ token: Ref, marker: { size, text } | null, provenance: {...} | null }`, depth ≤ 4;
    - `markersOn` (`sceneId`) → `[{ id, size, text }]`;
    - `manifest` (`call`) → `manifestFor(call)`;
    - `selftest` → `{ ok, checks }`: the six marker actors exist, `doubleClick` is not null,
      `CONFIG.queries["pentaryn-prompts.gather"]` is a function, and `status().version === module.json`
      version.
  - `version` is no longer a row: the kit builds `api.version` from `MANIFEST.version` (= `VERSION`,
    the same `"0.4.1"`).
- **The `replace` query exception.** Today `CONFIG.queries["pentaryn-prompts.replace"]` calls
  **`replaceMany(data)`** (`:276`), while `api.replace` is the single-spec wrapper (`replace.mjs:739`).
  The kit names a query after its row path, so it cannot express that. Mark `replaceMany` as
  `query: false`. In `onInit`, register the one exception by hand **through the kit `guarded`**,
  which C30 accepts:
  `CONFIG.queries[\`${MODULE}.replace\`] = guarded(data => ctx.api.replaceMany(data));` with a comment
  naming the kit gap (a future `row.queryName`). The fork's `QUERIES.replace` keeps working
  unchanged.
- `api.mjs` `buildApiFor(ctx)` is `buildApi(MANIFEST, { model, status, ensureMarkers, manifests, inspect, markersOn, manifest, selftest }, { contributions: ctx.contributions, members: { settings: () => settingsSnapshot(MODULE, SETTINGS), trace: () => ctx.log.traces(), uninstall: ctx.uninstall }, extras: () => ({ settings: SETTINGS, hooks: ctx.reg.ids(), patches: patches(), queries: [...], published: publishedOf(NS) }) })`.
  `status()` is `prompts.mjs:336-343` verbatim, with `clickPatchedWith` → `ctx.exposed.doubleClick()`.
- Entry `onReady`: `try { ctx.api = buildApiFor(ctx) } catch (err) { log.error("API manifest drift — not published", err); return; }`,
  then `publishNamespace(NS, ctx.api, { moduleId: MODULE })` **synchronously** (`when: "ready"`;
  the kit's re-alias tick covers the importer), then `try { await ensureMarkers() } catch (err) { log.error("ensureMarkers failed", err) }`.
  The `setTimeout` at `:316` goes.
- `onInit`: `registerQueries(MANIFEST, () => ctx.api, { log })` plus the `replace` exception.
- Absorbs: prompts-lookup-19, prompts-lookup-12 (module side: the manifest *is* the query
  table), mcp-fork-24 (kit `guarded`), C26, C27, C28, C30, C48, C50.
- Char. test: `golden/legacy-surface.json` ⊆ the new surface, same `typeof`, and
  `api.version === "0.4.1"`. `golden/queries.json` is unchanged (B8: `toPlain` must be a no-op on
  all five payloads; if a payload changes, stop and declare it). The NOT_GM message and code are
  unchanged. Then, as **additive** goldens in this step's own commit: `golden/surface.json`,
  `golden/describe.json` (normalised; `patches[].via` dropped), and `api.test` cases:
  - rows ↔ impl;
  - `describe().queries` = `["pentaryn-prompts.gather","pentaryn-prompts.crops","pentaryn-prompts.list","pentaryn-prompts.show"]`,
    plus the hand-registered `replace` listed in `extras`;
  - `inspect("m1", { sceneId: "s1" })` depth ≤ 4, and `inspect("m")` (substring) rejects `NOT_FOUND`;
  - `markersOn("s1")` deep-equals `[{ id: "m1", size: "mid", text: "a lantern" }, { id: "m2", size: "sm", text: "goblin boss" }]`;
  - `Object.isFrozen(api)`;
  - `module.api === game.pentaryn.prompts`;
  - the ready hooks fired.

### Step 14 — `contract.test.mjs` (fork parity, module side)
- Reads `${FOUNDRY_MCP_FORK ?? "~/Documents/GitHub/foundry-vtt-mcp"}/packages/mcp-server/src/fork/tools/prompt-markers.ts`
  and skips with a printed note when the file is absent. It regex-extracts `QUERIES` values,
  `NPC_SIZES`, `FEATURE_TYPES`, every `kind: z.literal('x')` and the Patch `z.object` keys. It
  asserts:
  - the `QUERIES` values equal the registered query names (`describe().queries` + `replace`);
  - the kinds equal `KINDS`;
  - the sizes and feature types equal `npc-core`'s;
  - the patch keys minus `PATCH_KEYS` equal a `KNOWN_DRIFT` table, computed on first run and
    expected to include `character: ["folder"]` and `gather: ["from"]` per prompts-lookup-11.
- Absorbs: mcp-fork-15 (module half), prompts-lookup-11 (module half), prompts-lookup-12 (module
  half), use-doc §6 `contract.test`. The fork-side halves stay in the fork's migration.

### Step 15 — `tokenDataFrom` (prompts-lookup-24)
- `markers-adapter.tokenDataFrom(actor, scene, { at, x, y, extra = {} })` returns `toObject()` minus `_id`,
  with `Object.assign(data, { x, y }, extra)`. It never normalises level or elevation.
- The four call sites are `placement.mjs` (ex `prompts.mjs:88-93`), `dialog.mjs:378-381` and
  `replace.mjs:357-361, 467-471`. Each keeps its own conditional level/elevation logic and passes
  it through `extra`.
- Char. test: the step 3 -24 pins (all three shapes) unchanged, plus the finding's direct
  `tokenDataFrom` table (own `level: null` when passed, absent when not).

### Step 16 — typeahead blur **[declared] DP5**
- Clear `swallowedUps` on `window` `blur` (prompts-lookup-32 item 2). Flip the step 3 KNOWN row in
  the same commit.

### Step 17 — performance (standalone, §4) **[declared] DP8**
- prompts-lookup-7 (`panelRels`/`seenCount` in `core/placement.mjs`), then prompts-lookup-8
  (`ModelCache` in `scene-adapter`, generation bumped from a `cache.mjs` feature's hooks →
  **new hooks change `golden/hooks.json`**: a declared golden edit in its own commit, appended
  **after** the existing rows so today's order is a prefix). Add `// hot: ModelCache` on the
  `hoverToken` handler (C49). Then prompts-lookup-23.

### Step 18 — docs
- README in use-doc §7 order, with the content moved into those sections:
  - What the player sees: from "Using it (GM)".
  - Settings: the `SETTINGS` table.
  - API: from `describe()`, with the error codes paragraph listing all eight `CODES` plus the
    fork's `MODULE_MISSING`/`TIMEOUT` and which path throws each (prompts-lookup-27).
  - Data written: marker/prompt/provenance flags, the `lastCalls` store, the spec and crop
    directories.
  - Flags other modules read: none; note portals' and aoe's own Marker predicates
    (aoe-movement-portals-38).
  - Events: none; Hooks: `golden/hooks.json`.
  - Patches and adjustments: the two rows.
  - Two sessions / who writes: GM-only; queries GM-guarded; placing a marker arms capture on the
    calling client for 3.5 s.
  - **Extending**: new kind (the `PLANNERS` table, step 19), new query (manifest row), new gather
    fact (`scene-adapter` `sceneItems` → `core/view.mjs` `buildView` → `core/gather-text.mjs`
    `renderGather` + snapshot via `UPDATE_SNAPSHOTS=1` in the legacy suite), where pure code goes
    (the `core/` table).
  - Pitfalls: the `replace` query vs the `replace` method; no param named `ref`;
    `test/fixtures.mjs` is imported live by `scenarios.mjs`.
  - Files, Tests (no fixture counts), Sync.
- Move the `languageKeys` docblock (`build-core.mjs:259-264`) above `export function languageKeys`.
- Write `CHANGELOG.md`.
- Outside the module: the `typeahead.mjs` mention at `context/foundry/prompt-markers.md:445` →
  `typeahead-adapter.mjs`.
- Absorbs: prompts-lookup-27, C44, C45.
- Char. test: the prompts-lookup-27 doc guard (every `CODES` entry inside the "Errors are"
  paragraph). It fails today only for `DRY_RUN_REQUIRED`.

### Step 19 — planner registry inside `replace.mjs` (optional, extendability)
- Case bodies of `planOne` (`replace.mjs:158-426`) → named functions `planActor`, `planCharacter`,
  `planHotspot`, `planNote`, `planLight`, `planTile` and `planNone`, all in the same file.
  `const PLANNERS = { actor: planActor, npc: planActor, … }`. `KINDS` stays the core constant,
  and a test asserts `Object.keys(PLANNERS)` equals `KINDS` in order.
- They stay in one file on purpose. Splitting them into `kinds/*.mjs` would add four adapter →
  adapter `graph-allow` debts (the kinds → character/actor-patch/npc/packs adapters).
- Absorbs: prompts-lookup-13.
- Char. test: the step 3 `replace-dry.json` and real-run light pins unchanged. The actor, npc and
  character bodies need bridge and dnd5e stubs: keep them byte-identical (diff the moved text) and
  live-test them.

---

## 4. Findings that stay standalone (not structural)

| Finding | Why standalone | When / marker |
|---|---|---|
| prompts-lookup-7 | perf: count sight lines without door classification; the `panelRels` extraction is pure but exists only for the perf change | after step 13 (step 17). Char.: for `F.warrenScene()`, `F.commonScene(true/false)` and every prompt key, `seenCount === panelSplit(panelRels(…,60),{rows:0,unseenWithinFt:60}).total` (against a pasted copy of today's `panelFor` loop first); a counting `classify` stays at 0 in `seenCount` and > 0 through `panelRels` on a closed-door board |
| prompts-lookup-8 | perf with a staleness risk (GM panel) | step 17, **[declared] DP8**. Char.: `ModelCache` with an injected builder (`get` twice → built 1; after `bump("s1")` → 2; `s2` independent; differing opts separate); cached vs uncached `panelSplit` deep-equal on `F.commonScene(false)`; `INVALIDATING_HOOKS` pinned as a literal |
| prompts-lookup-23 | perf (host index, scaffold memo, prompt counts) | step 17. Char.: step 3's -23 pins |
| prompts-lookup-14 | failure-path hardening: array check before the ring pre-check (`replace.mjs:597-598`) | any time after step 3, **[declared] DP6**. Flip the KNOWN `TypeError` row to `BAD_SPEC: replacements must be a non-empty array` in the same commit; (a)-(c) unchanged |
| prompts-lookup-15 | bug fix under a route prefix (`crops.mjs:19`): `assetUrl(src, getRoute)` | after step 10, **[declared] DP7**. Char.: with `getRoute = p => "/" + p` all of today's URLs are identical; with `"/foundry/" + p`, `maps/a.webp` → `/foundry/maps/a.webp`; flip the KNOWN `data:` row |
| prompts-lookup-18 | logging lines (`gatherLogLine`, `replaceLogLine`) | any time after step 9. Char.: the `gatherLogLine` prefix equals today's text `pentaryn-prompts \| gather pm-1: 3 prompts on 1 scene(s), 0 crop(s), 12 ms` exactly; console-only (**DP9**) |
| prompts-lookup-10 (`poolIndex` half) | defrag inside `build-core` | any time after step 3; char. per step 3 |
| prompts-lookup-28 | tests only | step 2 |
| mcp-fork-2, mcp-fork-10, mcp-fork-20 | fork-side or routing docs; prompts only needs `CONFIG.queries["pentaryn-prompts.*"]` to stay plain functions (mcp-fork-2's identity assertion) and `rechargeData` exportable for parity (mcp-fork-10, optional) | fork migration / docs pass |
| aoe-movement-portals-38 | docs (who decides "Marker"): prompts' `isScaffold` (`model.mjs:21-31` → `scene-adapter`) is pinned in step 3 (-23 scaffold cases); the table lives in `context/foundry/markers.md` | docs pass |

---

## 5. Declared behaviour changes (each goes to the live-test workflow)

| # | Change | Live test |
|---|---|---|
| DP1 | Publish moves from `ready` + `setTimeout 0` to synchronous in `ready`. It is one macrotask earlier, and still before `ensureMarkers` finishes. New: `module.api`, the `pentaryn-prompts.ready` and `pentaryn.ready` hooks, the kit members, `game.pentaryn.describe()` | After a reload with pentaryn-importer active: `game.pentaryn.prompts.status()` returns `version "0.4.1"`, `doubleClick` `"libWrapper"` (lib-wrapper is active at the table), and six marker ids |
| DP2 | The API object is frozen; assigning onto `game.pentaryn.prompts` throws | `Object.isFrozen(game.pentaryn.prompts)` |
| DP3 | Queries go through the kit. A query before `ready` returns `NOT_READY` (today it ran). Results pass through `toPlain` (B8, pinned no-op). Errors from `guarded` are `PentarynError` (same message and `.code`) | Through the MCP `prompt-markers` tool: `list`, then `gather` on a scene with two markers (`crops: "auto"` returns images), then a `replace` dry run, then `show`. Each output is unchanged from a pre-migration run of the same scene |
| DP4 | The double-click wrap carries a marker (`__pentarynPromptsClick`), so a hot re-import no longer stacks a second direct wrap. A missing method under libWrapper now warns once | Double-click a marker: the box opens. Double-click an ordinary token: its sheet opens |
| DP5 | Typeahead clears its swallowed-key set on window blur | Drop a marker, hold a key, Cmd-Tab away and back, release: the next press of that key reaches Foundry |
| DP6 | `replaceMany` with a non-array `replacements` throws `BAD_SPEC` instead of `TypeError` | `game.pentaryn.prompts.replaceMany({replacements:{a:1}})` rejects `BAD_SPEC: …` |
| DP7 | Crop images load under a route prefix; `data:`/`blob:` sources are fetched as-is | `gather({crops:"on"})` on a scene shows real crops, not grey boxes (identical when there is no prefix) |
| DP8 | The per-scene model is cached between the side panel, the hover tip and refreshes | With a box open: toggle a door, then rename an actor in view. The panel updates both times. Hovering a marker shows the same "sees N" as before |
| DP9 | Console only: a warn-once when a core token API falls back, debug lines behind `CONFIG.debug["pentaryn-prompts"]`, and the gather/replace summary lines. Joe's rule: console-only is fine | none |
| DP10 | (optional, not scheduled) turn the kit hook guard on for handlers that have no try/catch. A handler throw is then logged as `pentaryn-prompts \| …` instead of Foundry's "Error thrown in hooked function" | none (console) |
| W1 | Wave 7 restart batch: `flags.pentaryn` gains `tier: "full"`, `namespace: "prompts"`, `cssPrefix: "pp-"`, `afterSync: ["Reload, then game.pentaryn.prompts.selftest()"]` (`flagScope`, `generation` exist) | needs a Foundry **restart**; `conformance.py --module prompts` → C07, C38 pass |

---

## 6. Effort

| Steps | Effort |
|---|---|
| 1-3 vendor + characterisation (the stub world, queries golden, ~12 tables) | L — 1½-2 days |
| 4-7 i18n, settings, patch, catches | M — ¾ day |
| 8-11 core constants, core split, adapters, typeahead | M/L — 1-1½ days |
| 12-14 features/entry, manifest/api/queries/publish, fork contract test | L — 1½ days |
| 15-16, 18 tokenDataFrom, blur, docs | S/M — ½ day |
| 17, 19 perf + planner registry (optional, standalone) | M — 1 day |
| **Total** | **≈ 5-7 agent-days** for the structural part (steps 1-16, 18), +1 day for 17/19. Two live-test sessions: DP1-DP4 + DP6/DP7 after step 13; DP5, DP8 after step 17 |

After every step, run `node test/run.mjs` from `foundry/module/pentaryn-prompts/`. From the repo root, run:
- `./.venv/bin/python scripts/foundry/blueprint/vendor.py check prompts`
- `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module prompts --markdown`
- `make foundry-prompts-check`

`git diff --stat -- foundry/module/pentaryn-prompts/test/golden test/legacy-run.mjs` must be empty
on every refactor step: 4-12, 15, 18 and 19. Steps 13 and 17 add or extend goldens in their own
commits, with the reason in the commit message.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module prompts --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
