---
title: Migration guide — pentaryn-walls to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, walls]
---

# Migrating `pentaryn-walls` to the blueprint

**Read this when:** you are about to bring `pentaryn-walls` up to the addon blueprint in the fix
phase that follows the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the audit's finding text
→ [`../code-audit-2026-10/walls.md`](../code-audit-2026-10/walls.md) · the engine design →
[`../foundry-wall-autocomplete.md`](../foundry-wall-autocomplete.md).

> History-tree plan. Line numbers are **frozen-snapshot** lines (pentaryn `ee505c2` plus the
> uncommitted changes of 2026-10-10 20:15 EDT). On 2026-10-10 22:45 the live
> `foundry/module/pentaryn-walls/` was byte-identical to the snapshot (apart from `wasm/target/`
> build output). Re-check that in step 0. Work from `conformance.py --module walls --markdown` run
> live, never from the table below.

| | |
|---|---|
| Tier | **full**: it has a world setting and three keybindings, it writes walls, and its API writes. |
| WAIT | **No.** Not in `wait.json`. It touches no combat, transform or aoe code. |
| Score today | **59.0 %** (23/39 fail-class). The live tree scores the same. |
| Projected after this guide | 100 % of fail-class rules except **C07** and **C51**. Both wait for the Wave 7 batch (step 10: `flags.pentaryn`, `languages`, keys replacing the literal-English labels). After Wave 7, C34/C35/C38 become applicable and pass. |
| Check target | **`make foundry-walls-test`**, not `-check`. `escalate.make_checks` (escalate.py:592) harvests only `foundry-…-check:` lines, so the alias lands later (use-doc §5.6). |
| Effort | **M, about 2–2.5 days.** Most of that is characterising the glue and the declared fixes (undo, wasm levels), not the restructuring. |
| Findings | senses-walls-cursors-1 … -9, -28, -33, -36, -37 (13). -36 and -37 come from the audit gap-fill: `audit-findings.json` holds them only as note-only stubs (id, title, no file or line). Their full blocks are in `code-audit-2026-10/walls.md`. |
| Prerequisites | none beyond kit 1.0.1 (landed) — re-vendor with `vendor.py sync <short>` if the lock says 1.0.0 |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module walls --markdown`. On the snapshot it moved 59.0 % → 60.5 % (R9: C18 is n/a); C07 now says DATA migration (R3) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

The module is **disabled in the pentaryn world**. Live tests run in a scratch world, or with the
module enabled temporarily on a copy of a scene.

## 1. Conformance today, item by item

| Rule | Today | Detail (snapshot) | Step |
|---|---|---|---|
| C01 id == folder | pass | | — |
| C02 minimum 14 | warn | `"13"` | 10 (Wave 7) |
| C03 dnd5e iff touched | pass | system-agnostic | — |
| C04 languages iff i18n | pass | no lang file and no keys today | 10 |
| C05 all .mjs reachable | pass | | — |
| C06 / C06w | pass / pass | no CSS | — |
| C07 flags.pentaryn | **fail** | missing tier, namespace, cssPrefix; `flagScope: "wall-autocomplete"` | 10 (Wave 7, with a **data migration**) |
| C08 socket | pass | | — |
| C09 relationships | pass | | — |
| C10 size caps | warn | `pentaryn-walls.mjs` 282/150, `wall-engine.mjs` 1081/500 (core cap 600), `README.md` 283/250 | 5 (entry), 9 (README). The engine stays a warning (§4). |
| C11 pure core | **fail** | no `*-core.mjs`. `wall-engine.mjs` is pure but named as glue. | 2, 3 |
| C12 MODULE once | **fail** | `MODULE` defined 0×, `MODULE_ID` at `pentaryn-walls.mjs:19` | 2 |
| C13 no extra .md | pass | | — |
| C14 kit | **fail** | | 1 |
| C15 `import * as` | pass | | — |
| C16 import direction | pass | `backend-wasm.mjs`, `backends.mjs`, `wall-engine.mjs` unclassified | 3 (they become core / adapter) |
| C17 module-scope hooks in entry | pass | both hooks are in the entry | — |
| C18 features | **fail** | | 5 |
| C19 emitted names | pass | none | — |
| C20 hooks golden | **fail** | | 1 |
| C21 settings calls | **fail** | `pentaryn-walls.mjs:41` (`get`), `:207` (`register`) | 4 |
| C22 SETTINGS | **fail** | | 4 |
| C23 foreign settings | pass | | — |
| C24 empty catch | **fail** | `pentaryn-walls.mjs:107` (`catch { /* pings are a nicety */ }`) | 6 |
| C25 console prefix | pass | | — |
| C26 publish timers | pass | publishes after `await wasmReady`, not a timer | — |
| C27 api-manifest | **fail** | | 5 |
| C28 describe/surface goldens | **fail** | | 1 (surface), 5 (describe) |
| C29 inspect | n/a | writes no actor/token flags (it writes Wall flags) | — |
| C30 queries | pass | none | — |
| C31 writes ok/fail | manual | `run`/`undo` return legacy shapes; `undo` throws (use-doc §5.1 legacy) | 5 (documented `legacy:true`) |
| C32 patches | pass | none | — |
| C33 private internals | n/a | none | — |
| C34 / C35 lang | n/a | no lang file | 10 |
| C36 hard-coded English | warn | 8 literals: `:45, 148, 209, 220, 224, 231, 240, 248` | 10 (finding -36) |
| C37 / C37w / C38 CSS | pass / pass / n/a | | 10 (`pw-` declared) |
| C39 run.mjs + ModuleSpec | pass | `config.py:192` | — |
| C40 tier tests | **fail** | no `core/glue/hooks/api/i18n.test` | 1, 7 |
| C41 VERSION pinned | **fail** | | 1 |
| C42 synthetic fixtures | n/a | (`test/fixtures.mjs` is synthetic) | 1 (moves under `test/fixtures/`) |
| C43 fixed run.mjs | **fail** | 147-line fixture runner | 1 |
| C44 README | **fail** | missing the fixed sections; "44 fixtures" count | 9 (finding -8) |
| C45 CHANGELOG | **fail** | | 9 |
| C46 route | pass | `context/foundry/README.md:65` | — |
| C47 package rows | pass | no third-party package | — |
| C48 reserved names | pass | | — |
| C49 hot hooks | pass | no hot hooks | — |
| C50 publish timing | n/a | not yet | 5 (`when: "ready:gm:wasm"`) |
| C51 literal setting keys | n/a | | 4 → fails until 10 (literal **English** today, not keys) |
| C52 | pass | | — |

## 2. Target layout vs today

```
pentaryn-walls/                    today (snapshot)                          →  target
  module.json                      26 lines                                    + languages, flags.pentaryn, minimum 14 (Wave 7)
  pentaryn-walls.mjs  ENTRY        281: glue, API, settings, keys, publish     ≈ 90: wiring only (D11: entry keeps its filename)
  walls-core.mjs      PURE (new)   —                                           barrel: constants, HOOKS, readyLine, reportHtml,
                                                                                undoHtml, planUndo, exclusive; re-exports core/*
  core/engine.mjs                  ← wall-engine.mjs (1080, pure)              git mv; exports wallCategory
  core/backends.mjs                ← backends.mjs (103, registry + compare)    git mv; WASM_STATUS removed
  backend-wasm.mjs    ADAPTER      133                                         imports ./walls-core.mjs; loadErrorMessage()
  wall-engine.wasm                 compiled engine (unchanged path, loaded relative to backend-wasm.mjs)
  wasm/                            Rust source                                  unchanged (shipping it is finding -28, tooling)
  settings.mjs        (new)        —                                           SETTINGS [backend], KEYBINDINGS [run, undo, preview]
  actions.mjs         FEATURE (new) —                                          preview/run/undo/makeMacro/analyze, busy guard, report glue
  api-manifest.mjs, api.mjs (new)  —                                           legacy rows + analyze
  lib/                (new)        —                                           full tier + election
  lang/en.json        (new, Wave 7)
  README.md (282 → ≲250, fixed order), CHANGELOG.md (new)
  test/run.mjs                     147-line fixture runner                     fixed body
  test/fixtures.mjs                584-line corpus                             → test/fixtures/corpus.mjs
  test/fixtures/runner.mjs (new)   runCorpus(run) — the old runner's loop, importable
  test/corpus.mjs     (CLI)        —                                           manual runner: -v, substring, --backend (not *.test)
  test/bench.mjs                   66                                          stays (`make foundry-walls-bench` runs this path, modules.py)
  test/{core,glue,hooks,api,i18n,corpus,engine-golden}.test.mjs (new)
  test/golden/{hooks,describe,surface,engine,glue}.json (new)
```

**Old → new map (snapshot lines).**

| Old | Lines | Anchor | New |
|---|---|---|---|
| header + imports | 1–17 | `* Wall autocomplete — Foundry glue.` | entry header (file map) |
| `MODULE_ID` | 19 | `const MODULE_ID = "pentaryn-walls";` | `walls-core.mjs` `MODULE` |
| `targetScene`, `readWalls` | 21–34 | `function targetScene(sceneId)` | `actions.mjs` (scene adapter functions, private) |
| `pickBackend` | 40–51 | `function pickBackend(requested)` | `actions.mjs`; the setting comes from `settings.setting("backend")` |
| `evaluate` | 53–63 | `function evaluate(scene, opts = {})` | `actions.mjs` |
| `report` HTML lines | 70–93 | `lines.push(\`<p><strong>Wall autocomplete — ${scene.name}` | `walls-core.mjs` `reportHtml(sceneName, result, {committed, backend, ms})` → string |
| `report` effects | 95–108 | `ChatMessage.create({` | `actions.mjs` (chat, console group/table, pings) |
| `preview`, `run` | 115–133 | `async function preview({sceneId, ...opts} = {})` | `actions.mjs` |
| `undo` selection | 146–167 | `const stamped = scene.walls.filter(w => w.getFlag(FLAG_SCOPE, "run"));` | `walls-core.mjs` `planUndo(walls, {all})` (step 8a, **declared**) |
| `undo` chat HTML | 168–176 | `content: \`<p><strong>Wall autocomplete — undo</strong></p>\`` | `walls-core.mjs` `undoHtml(…)` |
| `undo` writes + toast | 164–165, 177–178 | `if (restores.length) await scene.updateEmbeddedDocuments` | `actions.mjs` |
| `makeMacro` | 185–198 | `async function makeMacro(action = "preview", slot)` | `actions.mjs` |
| setting `backend` | 206–214 | `game.settings.register(MODULE_ID, "backend", {` | `settings.mjs` `SETTINGS` row (literal English until Wave 7) |
| keybinding busy guard | 216–227 | `let busy = false;` | `walls-core.mjs` `exclusive(fn, {onBusy})` (pure) plus the keybinding wrapper in `actions.mjs` |
| keybindings run/undo/preview | 229–252 | `game.keybindings.register(MODULE_ID, "run", {` | `settings.mjs` `KEYBINDINGS` rows; `onDown` is bound by the entry from `ctx.exposed` |
| `publishAPI` | 255–272 | `function publishAPI() {` | entry → `publishNamespace(NS, api, {moduleId: MODULE, when: "ready:gm:wasm"})` |
| ready | 274–281 | `Hooks.once("ready", async () => {` | entry `onReady` (async, GM-only, `await wasmReady`); text from `readyLine()` |
| `wall-engine.mjs` | 1–1080 | — | `core/engine.mjs`. `category` (`:191`) exported as `wallCategory`. `FLAG_SCOPE` (`:65`) stays here. |
| `backends.mjs` registry | 13–28 | `const REGISTRY = new Map();` | `core/backends.mjs` |
| `backends.mjs` `WASM_STATUS` | 30–45 | `export const WASM_STATUS = Object.freeze({` | deleted (finding -7) |
| `backends.mjs` `canonical`/`compare` | 51–103 | `export function canonical(result) {` | `core/backends.mjs`; `kind` → `wallCategory` (finding -4) |
| `backend-wasm.mjs` | 1–133 | — | stays at the root as the adapter (WebAssembly, fetch, `node:fs`); imports from `./walls-core.mjs` |
| `test/run.mjs` loop | 33–144 | `for (const fx of FIXTURES) {` | `test/fixtures/runner.mjs` `runCorpus(runEngine, {only})` → `[{name, problems, res}]` |
| `test/run.mjs` CLI | 14–31, 146–147 | `const backendName = ` | `test/corpus.mjs` (manual CLI, keeps `-v`, substring, `--backend=`) |
| `test/fixtures.mjs` | 1–584 | `export const FIXTURES = [` | `test/fixtures/corpus.mjs`. `kindOf` (`:25`) re-exports `wallCategory` (finding -4). |

Why `core/` and not one big `walls-core.mjs`: the core cap is 600 lines (C10 warning), and the
import table allows core to import only `core/*`. So the 1080-line engine must sit in `core/`
behind the barrel, and so must the backend registry, which `backend-wasm.mjs` (the adapter) imports.
Leaving the engine as `wall-engine.mjs` at the root would make the barrel import glue (C16).

## 3. Ordered steps

The same rules apply as for every module. A step is behaviour-neutral unless it is marked
**[declared]**. The characterisation tests come first, against unchanged code. The refactor diff
never touches `test/golden/` or the characterisation tests.

### Step 0 — pre-flight (no edits)

- `wait.json` has no `pentaryn-walls`.
- `git diff ee505c2..HEAD -- foundry/module/pentaryn-walls`. It was empty apart from `wasm/target`
  on 2026-10-10.
- `conformance.py --module walls --markdown`. Then `node test/run.mjs` and
  `node test/run.mjs --backend=wasm` from the module folder. Both are green today on the 49-fixture
  corpus.

### Step 1 — characterise · absorbs: none · C14, C20, C28 (surface), C40, C41, C43

1. `vendor.py sync walls --tier full --kit election`. Election supplies `isAnyGM()` for the
   GM-only publish (`:275`).
2. Additive barrel **`walls-core.mjs`**:
   `export * from "./wall-engine.mjs"; export { register, get, list, available, canonical, compare } from "./backends.mjs";`
   plus `MODULE = "pentaryn-walls"`, `SHORT = NS = "walls"`, `VERSION = "0.2.0"`,
   `CONTRACT = "pentaryn-walls/api@1"`, `I18N = "PENTARYN_WALLS"`, `CSS = "pw-"`,
   `HOOKS = Object.freeze({})`. The barrel temporarily imports root files (a C16 debt that step 3
   clears). Nothing in runtime imports the barrel yet. **Every new test imports through the barrel
   or the entry, so the file moves in step 3 never touch a test.**
3. Move the corpus: `git mv test/fixtures.mjs test/fixtures/corpus.mjs`, with its import of
   `../wall-engine.mjs` changed to `../../walls-core.mjs`. Extract the runner loop
   (`test/run.mjs:33–144`) verbatim into `test/fixtures/runner.mjs` `runCorpus(run, {only, verbose})`.
   Keep the CLI as `test/corpus.mjs`. `bench.mjs` imports through the barrel.
4. `test/run.mjs` gets the fixed body, `LEGACY = []`.
5. **`test/corpus.test.mjs`**: one `node:test` subtest per fixture per available backend (`js`, and
   `wasm` when `available()`). It is green on both today. Add the two **levels** fixtures from
   finding -2 (`levels - different levels never interact` → `creates: 0`;
   `levels - same-level gap fills` → `creates: 1`, every create `levels` deep-equals `["L1"]`).
   They pass on js. On wasm they **fail today** and are marked `// KNOWN: wasm ignores levels (-2)`
   through `t.todo`. This gates `--backend=wasm` in `node test/run.mjs` itself, which replaces the
   audit's suggested `modules.py` gate edit.
6. **`test/engine-golden.test.mjs`** (finding -5 recipe): for every fixture plus `bench` rooms 3/5/8/10
   with `runId: "golden"`, compute `sha256(JSON.stringify({creates, updates, refusals, lints, log, report}))`
   on the js backend → `golden/engine.json`. Also record `canonical()` for every fixture on both
   backends. Expect `updateRules` to differ on W1/W2 (finding -3).
7. **`test/core.test.mjs`**: import `../walls-core.mjs` bare (the purity proof; the barrel pulls the
   engine and registry, neither of which touches a Foundry global). Add a table for `snapResolution`
   and `resolveConfig`, and the finding -4 table run through `kindOf` against the kind
   `canonical()` derives:
   `{}`→solid · all-0→blank · `{sight:0}`→invisible · `{sight:10}`→terrain · `{sight:30}`/`{sight:40}`→window ·
   `{move:0}`→ethereal · `{sight:20,move:0}`→ethereal · `{sight:0,move:0}`→invisible.
   Add `VERSION === module.json.version`.
8. **`test/glue.test.mjs`**: `installFoundry({ user: makeUser({ isGM: true }) })`. Spies:
   `ChatMessage.create`, `ChatMessage.getWhisperRecipients("GM") → [gm]`, `Macro.create`,
   `game.user.assignHotbarMacro`, `game.macros`, `canvas.ping`, `console.group/table/groupEnd/log/error`,
   `ui.notifications`. Scene stub: `{ id, name: "S", grid: { size: 100 }, walls: StubCollection }`.
   Each wall doc has `toObject()` and a `getFlag(scope, key)` that **throws Foundry's
   inactive-scope error for `"wall-autocomplete"`**, as Foundry 14 does (pentaryn-importer.mjs:87–96
   documents it). Use `updateEmbeddedDocuments`, `createEmbeddedDocuments` and
   `deleteEmbeddedDocuments` that log to `F.calls`. The real `.wasm` loads through the node `fs`
   path. Cases:
   - (a) `fire("init")` registers setting `pentaryn-walls.backend` with **exactly** today's object: the literal name `"Engine backend"`, the hint text including "44 fixtures", the `choices` map, `scope: "world"`, `config: true`, `default: "auto"`. It also registers three keybindings (`run`, `undo`, `preview`) with today's name, hint, `editable`, `restricted: true`, in that order.
   - (b) `fire("ready")` as GM and await: `Object.keys(game.pentaryn.walls)` deep-equals `["preview","run","undo","makeMacro","runEngine","backends"]`. One `console.log` with the exact text `pentaryn-walls | ready — backends: js, wasm. Alt+W run, Alt+Z undo, Alt+Shift+W preview. API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()`.
   - (c) the same as a **player**: no `game.pentaryn.walls`, no log line.
   - (d) frozen root: `game.pentaryn = Object.freeze({x:1})` before ready → a new object with `x` and `walls`.
   - (e) `preview()` on a fixture scene: exactly one `ChatMessage.create` with `whisper: [gm.id]` and `content` equal to the pinned HTML in `golden/glue.json`. Run with a fixed `runId` and replace `ms` in the content with `/\d+ ms/` before pinning. One `canvas.ping` per refusal. `console.table` is called. It returns the engine result, and no scene write appears in `F.calls`.
   - (f) `run()`: `F.calls` order is `updateEmbeddedDocuments("Wall")` before `createEmbeddedDocuments("Wall")`, then the chat message.
   - (g) `undo()` on a scene with a stamped wall: **`// KNOWN:`** it rejects with the stub's inactive-scope error (finding -1). On a scene with no walls it returns `{deleted:0, restored:0, run:null}` and shows the info toast `"Wall autocomplete: nothing of mine on this scene to undo."`.
   - (h) keybinding guard: the `run` `onDown` with `run` pending returns `true` and warns `"Wall autocomplete is already running."`. A rejecting action logs `console.error("pentaryn-walls |", err)` and shows `ui.notifications.error("Wall autocomplete: <message>", {permanent: true})`. After it settles, a third press runs.
   - (i) `makeMacro("bogus")` throws `unknown action "bogus"`. `makeMacro("run")` creates `Walls: run` once (a second call reuses it), assigns the hotbar, and shows `Macro "Walls: run" ready on the hotbar.`.
   - (j) `pickBackend` with `"wasm"` unavailable shows `ui.notifications.warn('Wall autocomplete: backend "wasm" unavailable, using JavaScript.')`. Make wasm unavailable by importing a copy without the `.wasm` (finding -37 recipe).
   - `pinJSON("hooks", F.hooks)` → `golden/hooks.json`. Today it is `[once init, once ready]`.
   - Assert `F.utilsSource === "foundry"`.
9. **Undo oracle** (for step 8a): `test/fixtures/legacy-undo.mjs` is today's `:146–167` selection logic
   ported over plain objects (`w.flags?.["wall-autocomplete"]?.run` …) as `legacyPlan`, using the
   finding -1 fixture walls a–e.
10. `GOLDEN_UPDATE=1` on each new test file, against **unchanged** runtime code. **Checkpoint:** Joe
    reviews and approves the characterisation commit.

### Step 2 — constants into the core barrel · C11 (partial), C12

- `pentaryn-walls.mjs:19` `MODULE_ID` is deleted. Every use takes `MODULE` from `walls-core.mjs`.
  That is 8 uses: `:41, 100, 207, 223, 229, 238, 246, 278`. The literal `"pentaryn-walls: no scene …"`
  error text at `:23` stays as it is.
- Add the pure helpers, copied from today's glue with the same text: `reportHtml` (`:70–93`),
  `undoHtml` (`:168–175`), and `readyLine(names)` (`:278–280`, with no suffix yet). Also add
  `exclusive(fn, {onBusy})`, the pure form of `:218–227` with the same return and finally
  semantics. The keybinding wrapper keeps `return true` and the error toast.
- The glue calls these helpers. Tests before: glue (b), (e), (g-empty), (h). Add `core.test` tables
  for `reportHtml`, `undoHtml` and `readyLine` that equal the glue goldens.

### Step 3 — engine and registry into `core/` · absorbs: **-4**, **-7**, **-8** (code-comment half) · C11, C16

- `git mv wall-engine.mjs core/engine.mjs` and `git mv backends.mjs core/backends.mjs`. In the
  barrel, `export * from "./core/engine.mjs"` and the same for `./core/backends.mjs`.
  `backend-wasm.mjs:13–14` and `bench.mjs` import from the barrel.
- **-4:** `export { category as wallCategory }` from `core/engine.mjs` (`:191`, a body identical to
  the other two copies). `core/backends.mjs` `canonical` uses it instead of `kind` (`:57–65`), and
  `test/fixtures/corpus.mjs` `kindOf` becomes `export { wallCategory as kindOf }`.
- **-7:** delete `WASM_STATUS` and its placeholder header (`backends.mjs:30–45`). Replace it with a
  three-line note that `backend-wasm.mjs` registers `wasm` and `pickBackend` falls back to js.
  `bench.mjs:42` text becomes `"(wasm unavailable: load failed)"`. **Declared (console-only, dev
  script):** the bench line wording changes.
- **-8 (code half):** `core/engine.mjs:8` and the entry header `:12` point at
  `context/plans/foundry-wall-autocomplete.md`. Remove the "44" from the code comment at
  `test/run.mjs:19` (that file is now the runner).
- **The wasm path does not change.** `backend-wasm.mjs` stays at the root, so
  `new URL("./wall-engine.wasm", import.meta.url)` and `modules.py:648` (`dest = src / "wall-engine.wasm"`)
  both still hold.

Tests before: `engine-golden` (every hash), `corpus` (both backends), `core` (the -4 table). The
grep `grep -rn WASM_STATUS foundry/module scripts` must be empty.

### Step 4 — settings and keybinding tables · C21, C22 (C51 waits for Wave 7)

- `settings.mjs`:
  - `SETTINGS = [{ key: "backend", scope: "world", config: true, type: String, default: "auto", name: "Engine backend", hint: "<today's hint, verbatim>", choices: { auto: "…", wasm: "…", js: "…" }, doc }]`.
  - `KEYBINDINGS = [{ key: "run", … }, { key: "undo", … }, { key: "preview", … }]`, each with today's literal name/hint, `editable`, `restricted: true` and an `action` field.
  - `registerSettings({ log, onKey })` maps each row to `onDown: onKey(row.action)` before `defineKeybindings`.
- The literal **English** labels keep the registration byte-identical while the module has no
  `languages` entry. Foundry would show a raw key otherwise. So **C51 stays failing until step 10**,
  where the literals become `PENTARYN_WALLS.settings.backend.name` and so on, together with the
  `module.json` `languages` line.
- Keybindings must register at `init` (`client-keybindings.mjs:156`). The entry's `onInit` calls
  `registerSettings({ log, onKey: action => keybindingGuard(ctx.exposed[action]) })`. The features
  are installed synchronously in the entry body, so `ctx.exposed` is filled before `init`.
- `pickBackend` (`:41`) reads `setting("backend")`. `settingReader` returns `"auto"` if `get` throws,
  where today the error propagates. The setting is always registered at init, so that branch is
  unreachable. Note it, don't declare it.

Tests before: glue (a), (h), (j).

### Step 5 — feature, API manifest, entry, publish · absorbs: — · C10 (entry), C18, C27, C28, C50, C31 (documented)

- **`actions.mjs`** (feature): snapshot `:21–198` minus what moved to core in step 2. It exports
  `install(reg, ctx)`, which registers **no hooks**: walls has none besides init and ready, and those
  stay in the entry. `install` calls `ctx.expose({ preview, run, undo, makeMacro, keybindingGuard })`.
  It also exports `uninstall()`, which resets the busy flag.
- **`api-manifest.mjs`**: one row per published path, keeping today's signatures:
  - `preview({sceneId, ...opts})` → engine result. `gm:true`, `writes:true` (a whispered ChatMessage), `sideEffects: ["ChatMessage (GM whisper)", "canvas.ping", "console.table"]`.
  - `run({sceneId, ...opts})` → engine result. `gm:true`, `writes:true`, `sideEffects: ["Wall update batch", "Wall create batch", "ChatMessage (GM whisper)"]`.
  - `undo({sceneId, all})` → `{deleted, restored, run}`. `legacy:true`, `throws: ["Error"]` (use-doc §5.1 "walls throw").
  - `makeMacro(action, slot)` → Macro. `legacy:true`, positional.
  - `runEngine(walls, opts)` → result. Pure, `legacy:true`.
  - `backends()` → available backends. `legacy:true`; today it is the `available` function.
  - `flags: { writes: ["flags.wall-autocomplete.{generated,run,rule,priorC}"], reads: ["flags.wall-autocomplete.keepOpen"] }`.
- **`api.mjs`**: `buildApiFor(ctx)` maps each path to `ctx.exposed.*`, plus `runEngine` and
  `available` from the barrel, with `members: { settings: settingsSnapshot, trace, uninstall }`.
- **Entry** `pentaryn-walls.mjs`, about 90 lines: header file map, `FEATURES = [actions]`, `ctx`,
  `install()` synchronous in the body, `Hooks.once("init", onInit)`, and
  `Hooks.once("ready", onReady)` where
  `onReady = async () => { if (!isAnyGM()) return; await wasmReady; ctx.api = buildApiFor(ctx); publishNamespace(NS, ctx.api, { moduleId: MODULE, when: "ready:gm:wasm" }); console.log(\`${MODULE} | ${readyLine(…)}\`); }`.
  Same predicate (`game.user.isGM` = `isAnyGM`), same await, same log text. C50 passes because
  `when` ≠ `"ready"` and the publish sits after an `await`.
- **Additive surface (declared, harmless):** `game.modules.get("pentaryn-walls").api` (GM only) and
  the kit members `describe/version/contract/settings/trace/uninstall`. Fire `pentaryn-walls.ready`
  and `pentaryn.ready` (with `when: "ready:gm:wasm"`). The API object is now **frozen**.
- New **`test/hooks.test.mjs`**: `golden/hooks.json` stays `[once init, once ready]`. `reg.ids()` is
  empty. `actions.mjs` exports `install`/`uninstall`.
- New **`test/api.test.mjs`**: pin `normaliseDescribe(describe())` → `golden/describe.json`. Rows ↔
  impl must match. `surfaceOf(api)` must be a superset of today's six keys. The `surface.json` from
  step 1 was pinned against today's object; regenerate it here as a **reviewed** golden change
  whose only diff is the kit members.

Tests before: all of glue (a)–(j), `hooks.json`, and the step 1 `surface.json`.

### Step 6 — the one empty catch · C24

`:107` `catch { /* pings are a nicety */ }` → `catch (e) { ctx.log.debug("ping", e); }`. The debug
line is gated by `CONFIG.debug["pentaryn-walls"]`, so it is silent by default and neutral. Test
before: glue (e) with `canvas.ping` throwing still makes exactly one chat message and returns.

### Step 7 — remaining test files · C40

`test/i18n.test.mjs` asserts every `SETTINGS`/`KEYBINDINGS` row's `name`/`hint` resolves. Until
step 10 it asserts the **literal English** equals the step 1 golden and is marked
`// KNOWN: no lang file (-36)`. Step 10 switches it to key lookup with the same rendered text.

### Step 8 — declared fixes (each its own commit, after structure is green)

| Sub-step | Finding | Change | Test (written first) |
|---|---|---|---|
| 8a | **-1** (+ the walls half of **-10**) | `planUndo(walls, {all})` in `walls-core.mjs`. It reads flags with `readFlag(w, FLAG_SCOPE, …)` on `w.toObject()`, which never throws, and keeps today's ISO string sort (`.sort().at(-1)`), the generated-wins-over-`priorC` split and the `remaining` count. Restores write `{ _id, c: priorC, ["flags.wall-autocomplete"]: _del }` instead of `"flags.-=wall-autocomplete": null` (the same deletion; `-=` is deprecated in v14). **[declared]** undo goes from *throws* to *works*. Confirm the v14 `getFlag` throw live before merging (the finding's note). | `core.test` from the -1 recipe: `{all:false}` → latest `2026-01-02T00:00:00Z`, generated `["b"]`, restores `[{_id:"c", c:[0,0,80,0], …}]`, remaining 1. `{all:true}` → generated `["a","b"]`. `[]` → stamped 0. Deep-equal against `legacyPlan`. Round trip over `FIXTURES[0]` with `runId: "r1"`: generated == creates.length, restores == updates.length. Glue (g) flips from KNOWN-throws to the `{deleted, restored, run}` result. Golden updated in the same declared commit. |
| 8b | **-9** | `busy` moves to module scope in `actions.mjs`. `preview/run/undo` are wrapped in `exclusive()` for API and macro callers too; they return `null` plus the same warn while busy. The keybindings keep `return true` and the error toast. Add `.catch(e => console.error(\`${MODULE} |\`, e))` to both `ChatMessage.create` calls (`:95`, `:168`), which are awaited **[declared]**. | `core.test` `exclusive`: two un-awaited calls → the second returns `null` and `onBusy` is called once; after resolve a third runs; a throwing fn releases. Glue (h) is unchanged. A new glue case: API `run()` during a keybinding run → `null`. |
| 8c | **-2** | At the top of `runWasm` (`backend-wasm.mjs:59`): `if (walls.some(w => (w.levels ?? []).length)) return runEngine(walls, opts);`. **[declared]** Levels scenes get js-identical results; level-less scenes are unchanged. | `corpus.test` levels fixtures: the wasm `t.todo` becomes a pass. `engine-golden` hashes are unchanged (level-less). `bench.mjs` output is identical. |
| 8d | **-37** | `backend-wasm.mjs` exports `loadErrorMessage()`. `readyLine(names, wasmError)` appends ` (wasm unavailable: <msg>)` when wasm is registered but unavailable. **[declared, console-only]** | `core.test`: `readyLine(["js","wasm"], null)` equals the step 1 text; `readyLine(["js"], "ENOENT")` is that text plus the suffix. The healthy case gives `loadErrorMessage() === null`. The copied-without-wasm case contains `ENOENT`. |
| 8e | **-33** | Additive row `analyze({sceneId, ...opts})` → `{sceneId, sceneName, backend, ms, ...result}`, calling only `evaluate()`. Not declared (additive, read-only). `describe()` comes from the kit. | glue: `analyze()` makes 0 `ChatMessage.create` and 0 `canvas.ping` calls, and its `creates/updates/refusals` deep-equal `runEngine(readWalls(scene), {gridSize: 100, runId})`. |
| 8f | **-3** | `canonical()` gains order-independent `createLevels`, `updateRules`. The `backend-wasm.mjs` header documents what wasm does not reproduce (`rule`, `kind`, `sources`, `log`). Diagnostic only. | The step 1 `canonical()` goldens get an **additive** field; creates/updates/refusals stay identical for every fixture. `updateRules` is not gated until wasm emits it. |

### Step 9 — docs · absorbs: **-8** (README/manifest half) · C10 (README), C44, C45

- README in the fixed order (use-doc §7), at most 250 lines. The long authoring material (`:43–153` *Use*,
  *Hotkeys*, *Two authoring styles*, *Order of operations*, *What to draw*; `:154–191` *Layout*,
  *Safety*; `:192–282` compiled backend and performance) moves to a new use-doc,
  **`context/foundry/walls.md`** (frontmatter, `**Read this when:**`). The README keeps
  *Extending*: "Adding a rule" (`enumerate()` + `PRIORITY` + fixture + the mirrored rule in
  `wasm/src/lib.rs`, or delegate to js as 8c does for levels) and "Adding a backend" (`register({name, run, available})`).
  Replace every "44 fixtures" with "the fixture corpus (`test/fixtures/corpus.mjs`)", which C44
  forbids counting. Add a `**Read this when:**` line.
- New `CHANGELOG.md`. Re-point the routing row (`context/foundry/README.md:65`) to the use-doc.
- `module.json` `description` drops `playbooks/…` and the "44" in step 10, because it is a restart
  field.

### Step 10 — Wave 7 restart batch · absorbs: **-36** · C02, C04, C07, C34, C35, C36, C51

In the **single** Wave 7 batch:

1. `module.json`: `"languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }]`;
   `"compatibility": { "minimum": "14", "verified": "14.369" }`; `description` fix (-8);
   `"flags": { "pentaryn": { "tier": "full", "namespace": "walls", "flagScope": "pentaryn-walls", "cssPrefix": "pw-", "generation": 14, "afterSync": [the two lines from config.py:196–197] } }`.
   `pw-` is unused across modules.
2. `lang/en.json` (-36), nested, strings verbatim:
   `PENTARYN_WALLS.settings.backend.{name,hint}`, `…settings.backend.choices.{auto,wasm,js}`,
   `…keys.{run,undo,preview}.{name,hint}`,
   `…notify.{backendUnavailable,nothingToUndo,undone,macroReady,busy,failed}`. `SETTINGS` and
   `KEYBINDINGS` rows swap their literal English for these full-key literals. The six toasts become
   `_loc("PENTARYN_WALLS.notify.…", data)`. Test first, from the -36 recipe:
   `undone {created:2, restored:1}` → `Undid 2 created, 1 restored.`;
   `backendUnavailable {want:"wasm"}` → `Wall autocomplete: backend "wasm" unavailable, using JavaScript.`;
   `failed {message:"x"}` → `Wall autocomplete: x`; and every other key against the step 1 glue
   goldens.
3. **Flag-scope data migration (blueprint B6, plan §9.6) [declared].** `FLAG_SCOPE`
   `"wall-autocomplete"` → `"pentaryn-walls"` is a data change on every Wall the engine stamped,
   plus the author-facing hint flag `keepOpen`.
   - A new `migrations.mjs`: GM-only, version-keyed, idempotent. For each scene, walls with
     `flags["wall-autocomplete"]` get `{ "flags.pentaryn-walls": <copy>, "flags.wall-autocomplete": _del }`
     in one batch per scene, recorded through a hidden `migrationVersion` `store: true` row.
   - Through one release, `planUndo` and `marshal` (`backend-wasm.mjs:51`, `keepOpen`) and the engine's
     `toSeg` (`wall-engine.mjs:166–184`, `keepOpen`/`generated`) accept **both** scopes. New stamps use the new scope.
   - Fixtures cover a pre-migration wall, a post-migration wall and a mixed scene.
   - README and the use-doc tell authors `flags.pentaryn-walls.keepOpen`.
   - A restart is needed (module.json). A live test runs undo on a scene stamped before the migration.

### Step 11 — wiring and re-score

`make foundry-walls-test` (not `-check`), `vendor.py check walls`, `conformance.py --module walls`.
Live smoke after the sync, in a scratch world with the module enabled:
`game.pentaryn.walls.describe().version`, `preview()` on a test scene, `run()` then `undo()` twice
(peel back), and the Alt+W, Alt+Z and Alt+Shift+W keys.

## 4. Findings that stay standalone (not structural)

| Finding | Kind | Where |
|---|---|---|
| **-1** | hardening fix (undo works) | 8a, **declared** |
| **-2** | hardening fix (wasm + levels) | 8c, **declared** |
| **-3** | diagnostic (`canonical` fields) | 8f |
| **-5** | performance: `obstacles()` inline loops (`core/engine.mjs:467`), `coll2` hoist, one Set per vertex | after step 3, gated by `engine-golden` hashes and `bench.mjs` |
| **-6** | maintainability: `toSegs`/`reindex` (`:884`, `:889`, `:914`) | after step 3, gated by `engine-golden` + `corpus` on wasm |
| **-9** | hardening (busy guard on API) | 8b, **declared** |
| **-28** | tooling: `ship_ignore` in `scripts/foundry/ops/modules.py:561` (`install()`'s `copytree`) so `wasm/` and `test/` stop shipping | the python-tooling batch, not this module |
| **-33** | additive API `analyze()` | 8e |
| **-37** | console diagnostic | 8d |
| C10 on `core/engine.mjs` (1080 > 600) | the warning stays. A topic split (`core/engine/{geometry,model,lint,rules,apply,diagnose}.mjs`) is optional later, gated by `engine-golden`. Not needed to conform. | later |

Absorbed by structure: **-4** and **-7** (step 3), **-8** (steps 3 and 9), **-36** (step 10), and the
walls half of **-10** (8a).

## 5. Declared behaviour changes (live-test handoff)

| # | Change | Observe at the table (scratch world) |
|---|---|---|
| W-1 | `undo()` works instead of throwing (-1); restores use `_del`. | Draw stubs, Alt+W, Alt+Z: generated walls vanish and trimmed walls regain their length. Repeat to peel back. Before the fix, the console shows the `getFlag` scope error. |
| W-2 | `preview/run/undo` from the API or a macro return `null` with a warning while a run is active (-9). Chat creation is awaited. | Hold Alt+W and click the `Walls: run` macro: one run, one warning. |
| W-3 | The wasm backend delegates Levels scenes to js (-2). | A scene with two Levels: a wall on L1 is never joined to one on L2, and created walls keep their level. |
| W-4 | The ready line carries `(wasm unavailable: …)` when wasm failed to load (-37); bench wording (-7). | Console only. |
| W-5 | The flag scope moves to `pentaryn-walls` through a one-shot migration; authors' `keepOpen` moves too (B6). | Restart. Undo a run stamped before the migration. `flags.pentaryn-walls.keepOpen` honoured. |
| W-6 | The API is frozen, gains kit members and `module.api`, and fires `pentaryn-walls.ready` / `pentaryn.ready`. | `game.pentaryn.walls.describe()`; `Object.isFrozen(game.pentaryn.walls)`. |
| W-7 | The setting and keybinding labels come from `lang/en.json` (same text). | Configure Settings / Controls show the same wording. |

**WAIT:** none. No step touches pentaryn-combat, -transform or -aoe.

## 6. Effort

| Part | Estimate |
|---|---|
| Step 1 characterisation (glue stubs, runner split, golden hashes, undo oracle) | 5–6 h |
| Steps 2–7 restructure | 4 h |
| Step 8 declared fixes (a–f) | 3–4 h |
| Step 9 docs (README split into a use-doc) | 2 h |
| Step 10 Wave 7 items (lang + flag-scope migration) | 3 h |
| Gates + live test | 1 h |
| **Total** | **about 2–2.5 days (M)** |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module walls --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
