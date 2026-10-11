---
title: Addon blueprint — design record (2026-10)
status: built
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, audit]
---

# Addon blueprint — how it was designed and built (2026-10)

**Read this when:** you want to know why Pentaryn modules are shaped the way the blueprint says —
the decisions, what was rejected, and the sources. **Not this file:** to build or migrate a module,
read the use-doc [`../foundry/addon-blueprint.md`](../foundry/addon-blueprint.md). This is history;
never load it to operate the tooling.

Companion files: [`addon-blueprint-2026-10/conformance-baseline.md`](addon-blueprint-2026-10/conformance-baseline.md)
(the "before" scores), [`addon-blueprint-2026-10/README.md`](addon-blueprint-2026-10/README.md) (the
migration index and the one sequence) and the superseded
[`addon-blueprint-2026-10/migration-order.md`](addon-blueprint-2026-10/migration-order.md).

## 1. Why

The 2026-10 code audit found 328 verified findings (305 + 23 gap-fill stubs) across 19 in-house modules, the Python tooling and
the MCP fork. Most of the module findings were the same handful of problems repeated: 19 copies of a
frozen-root publish guard, four hook idioms, five patch idioms, six settings fallback readers, 44
i18n helper copies (most invisible to the i18n gate), seven different "who writes" predicates, and
APIs an LLM could only discover by `Object.keys(game.pentaryn…)`. Fixing 305 findings one by one
would re-create the drift. So the fix phase gets a **blueprint** first: one module shape, one shared
kit, one API contract, one test standard, a generator for new modules, and a scorer that says how far
each existing module is from it.

The workflow ran in three stages — Design (spec + a 26-item adversarial review), this **Build**
stage (new files only, while another workflow live-tested combat/transform/aoe and a third wrote the
audit docs), and a later Fix stage that migrates modules.

## 2. Sources

Primary — read on 2026-10-10:

| Source | What it settled |
|---|---|
| Foundry 14.369.0 `client/game.mjs:74` | `_loc` is a non-configurable global bound to `i18n.localize`, which interpolates in v14 → D1 (no kit i18n file) |
| `client/helpers/client-settings.mjs:271` | the exact unregistered-setting error the stub reproduces |
| `common/abstract/document.mjs:949` | the exact inactive-flag-scope error; why `readFlag` reads data instead of `getFlag` |
| `client/client.mjs:68` | `_del` is a client global `ForcedDeletion`; `-=key` is deprecated (helpers.mjs:454-462) |
| `common/utils/{helpers,semaphore,logging}.mjs` | native `debounce`, `throttle`, `escapeHTML`, `Semaphore`, `logCompatibilityWarning` → D17 |
| `scripts/foundry/ops/modules.py` | gates parse → imports → i18n → node-test; `../` outside the module fails (→ vendored kit); node-test runs exactly `test/run.mjs` (→ D10) |
| `scripts/foundry/ops/jsscan.py:389, :472` | the wrapper regex only sees a single-arrow wrapper in the same file; a literal `PENTARYN_X.` is a definite reference anywhere (→ D1, D4) |
| `scripts/foundry/update/adjustments.py:41-46, :107-144` | the exposure grep covers `scripts/foundry/**/*.py` and every module `.mjs`; why package names live in `packages.json` and only `patch-libwrapper.mjs` names lib-wrapper |
| `scripts/foundry/update/escalate.py:592` | `make_checks` harvests `^foundry-…-check:` lines; walls uses `foundry-walls-test` |
| `scripts/check_context.py:61` | every context file needs a `**Read this when:**` line; local links must resolve |
| The frozen audit snapshot | every anchor in the review disposition (ties `describe: Describe.toggle` :336, prompts `cropsAs` :274-275, walls `await wasmReady` :274-277, the three label shapes) |
| Node 26 `node:test` | `--test` with a glob runs each file in its own process; `t.mock.timers`; `node:assert/strict` |

Secondary — community convention, consulted to check the canonical choices:

- Foundry community wiki, getting started with development — the `game.modules.get(id).api`
  convention for module APIs: <https://foundryvtt.wiki/en/development/getting-started-with-development>
- Foundry API reference, public vs private API (only public members get deprecation periods; why
  every private-member touch needs an adjustments row): <https://foundryvtt.com/api/>
- Foundry KB, module development (manifest fields: `esmodules`, `styles`, `languages`, `socket`,
  `relationships`, `flags`): <https://foundryvtt.com/article/module-development/>
- libWrapper (registration by dotted path, `WRAPPER`/`MIXED`/`OVERRIDE`, falling back when the
  library is absent): <https://github.com/ruipin/fvtt-lib-wrapper>
- Node.js test runner docs: <https://nodejs.org/api/test.html>

## 3. Decisions that amend the audit design

| # | Audit design said | Blueprint says | Why |
|---|---|---|---|
| D1 | `lib/i18n.mjs makeT(prefix)` | full-key literals through native `_loc`; no kit i18n file | a factory or imported helper hides every key from the i18n gate (aoe/prompts/creatures/riders already blind: 47+28+2+12 keys) |
| D2 | `publishNamespace(root, ns, api)` → `game.pentaryn.<ns>` | `game.modules.get(id).api` canonical, `game.pentaryn.<ns>` alias, `<id>.ready` + `pentaryn.ready`; the frozen-root guard and one re-alias tick live only in `lib/publish.mjs` until items-journal-1; late publishes record `when` | Foundry convention; survives the importer's replace-and-freeze; walls and prompts keep their timing |
| D3 | `lib/test-harness.mjs` with `check()/summary()` | `test/kit/{foundry-stub,harness}.mjs` from `foundry/lib/test-kit/`; `node:test`, one process per file | process isolation ends the riders/senses masking; runtime `lib/` stays runtime-only |
| D4 | settings keys `settings.<key>.{name,hint}` | new: `Setting.<key>.Name/Hint`; migrating modules keep theirs via literal per-row keys | three label shapes exist; literal rows migrate all of them without touching `lang/en.json` |
| D5 | `API_TABLE` with functions | `api-manifest.mjs` pure data + separate impl map; feature contributions; `buildApi` throws on drift and reserved names; frozen | node-importable, describable offline, drift fails before sync |
| D6 | — | `HOOKS` table + `emit()`; `legacyName` + `until` double-fires | combat's `pentarynCombat.*` has outside listeners; a rename is shimmed |
| D7 | `argon-kit` in Wave 1 | deferred to Wave 8.6; signatures fixed only | its source is in flux; vendoring everywhere would mark every module exposed to Argon |
| D8 | `ModuleSpec.lib=(…)` | `lib/kit.lock.json` is the only kit list; `module.json` never changes on a kit bump | a kit bump must not be a 19-module restart batch |
| D9 | styles as `[{src}]` | bare strings until `modules.py:170` reads `{src}` | the imports gate would `TypeError` on a dict |
| D10 | `test/hooks.mjs`, `test/api.mjs` | `test/*.test.mjs` under one `run.mjs` | the gate runs exactly `test/run.mjs` |
| D11 | — | entry = `esmodules[0]` whatever its name; all non-test, non-lib files reachable | renaming four entries is restart churn; combat/transform two-entry collapse waits for the order fixture |
| D12 | — | named imports between module files; `import * as` only for features and core barrels | jsscan checks a namespace import for file existence only |
| D13 | playbook at `context/foundry/modules.md`, hand CSS registry | `context/foundry/addon-blueprint.md`; CSS registry = `flags.pentaryn.cssPrefix` + C38 | derived data, not a hand list; the workflow's write-allow list fixed the path |
| D14 | one `pentaryn-api` fork tool with substring `$actor` | split `pentaryn-read` / `pentaryn-write`; refs via exact-match `resolveRef` | a write needs its own approval surface; substring matching must not reach a write path |
| D15 | per-module `queries.mjs` | queries from manifest rows (`query: true`, `wire`) via `registerQueries` | one table |
| D16 | one module shape | two tiers, `small` and `full` | names/pings/cursors should not carry ten kit files |
| D17 | kit `i18n`, 4-fn `flags`, 4-fn `perf` | no `i18n`; `flags` = `readFlag`, `flagPath`; `perf` = `memo`, `coalesce`, `perFrame` | prefer native over our patches |
| D18 | — | structural rules only in `conformance.py`; node tests cover behaviour | two implementations of C01–C09 would drift |

## 4. Review disposition (Design stage)

All 26 review items were accepted after re-verification against the snapshot. Partial rejections:

| Item | Rejected part | Why |
|---|---|---|
| 1 | `Symbol.for("pentaryn.kit")` as the kit marker | the `contract` string survives JSON, needs no realm agreement, and is required anyway |
| 12 | `api → feature` for named `read*` exports | a name-pattern exception makes the graph rule non-mechanical; `ctx.expose()` gives the same capability |
| 14 | `perf` keeps only `memo`, `coalesce` | `perFrame` kept: core `throttle` is time-based and the hot-hook rule needs a frame coalescer; `debounce` dropped |
| 15 | small tier = core.test + manifest.test | `manifest.test` dropped (D18); small = `core.test` + `glue.test`, glue pins hooks |
| 25 | move the per-module work list into the use-doc | the procedure moved (use-doc §8); the table is scorer output, kept here as history |
| 7 | "narrow wave rule (c)" | not needed: the kit list left `module.json` entirely (D8) |
| 17 | drop the `compatibility.minimum` check | kept as a warning (C02) so the scorer lists it |

## 5. Alternatives rejected

| Alternative | Why not |
|---|---|
| A `pentaryn-lib` Foundry library module now | adds a load-order dependency and a module every world must enable; vendoring has no runtime coupling. Phase-2 option once every module conforms (§9.1) |
| Symlinks or a bundler for shared code | the sync copies, never links (a stale copy must be visible); a bundler would hide the imports gate's view and add a build step to every module |
| Keep `check()/summary()` self-running suites | one process for every case let an earlier failure mask a later one (riders, senses); `node:test` gives isolation, mocks and a standard reporter |
| Quench (in-Foundry test runner) | needs a running world; the gates must run with Foundry stopped. Live smoke is `describe()` + `selftest()` |
| `string.Template` / a templating engine in the generator | `$` is everywhere in JS; literal `__TOKEN__` replacement plus line blocks is enough and greppable |
| Moving every migrated module's hooks to `setup` | reorders listeners against unmigrated modules (vetoes, Argon render order) — a declared change needing the order fixture first |
| Substring ref matching in module APIs | convenient for reads, dangerous for writes; one resolver for both means none |
| `game.pentaryn.<ns>` as canonical | the importer replaces and freezes it; `module.api` survives whatever the load order |

## 6. The spec as built (summary)

The full specification is the use-doc plus the code; this is the map.

- **Layout and roles** (§1 of the spec): entry / core / api-manifest / api / settings / feature /
  adapter / ui / lib / test, with the import-direction table, size caps as warnings, naming rules
  and the reserved API member names.
- **Kit** (§2): `errors, log, hooks, settings, resolve, api, queries, publish, election, patch,
  patch-libwrapper, flags, perf` + test kit; `kit.json` with deps, tiers and `packages`; vendoring
  and the sha256 identity gate.
- **API contract** (§3): canonical `module.api`; `describe()` JSON (golden normalised without
  version/kit/published/patch routes); `inspect()` depth ≤ 4; coded errors vs ok/fail; queries
  from manifest rows; audit lines for cross-user writes.
- **Rules** (§4): lifecycle, settings, logging, performance, Argon/dnd5e, adjustments rows,
  flags, i18n and CSS.
- **Testing** (§5): the fixed `run.mjs`, the stub importing Foundry's own `common/`, the required
  test files per tier, the characterisation protocol with Joe's approval checkpoint.
- **Docs** (§6): README fixed order, use-doc and plan shapes, routing, the LLM discovery path
  (CLAUDE.md row → context index → `describe()` → README Extending → manifest row).
- **Generator** (§7) and **conformance** C01–C52 (§8).

The design spec itself was a workflow artifact and is **not in the repo**. The migration guides,
`foundry/lib/api.mjs` and the template were written against its section numbers; most of those
citations were rewritten to the use-doc in the gap-fill pass (§7.5), and this table resolves any
that remain:

| Spec § | Where it lives now |
|---|---|
| §1 (layout, import direction, names) | use-doc §2 |
| §2.x (kit, vendoring, the idiom table) | use-doc §4 (§2.2 guard idioms → use-doc §4.3) |
| §3.1 (method shape, refs) | use-doc §5.1 |
| §3.2 (`describe()` JSON) | use-doc §5.1a "`describe()` keys" |
| §3.3 / §3.4 (ref scope from the call's opts; reads throw, writes return ok/fail) | use-doc §5.1 |
| §3.5 (queries from manifest rows) | use-doc §5.1a (`query`, `queryName`, `relay`) |
| §3.6 (audit lines for cross-user writes) | use-doc §5.1 "Audit lines" |
| §4.1 (lifecycle; migrating modules install synchronously) | use-doc §5.2 (new modules: §4.1) |
| §4.2 (settings) | use-doc §5.3 |
| §4.3 (logging, pruning session maps) | use-doc §5.4 |
| §4.4 (performance) | use-doc §5.5 |
| §4.5 (Argon / dnd5e hygiene) | use-doc §5.2 |
| §4.6 (adjustments rows) | use-doc §5.6 |
| §4.7 (flags, cross-module flag reads) | use-doc §5.8 |
| §4.8 (i18n, CSS) | use-doc §5.7 |
| §5.x (testing; §5.2 the fixed `run.mjs`; §5.4 the test files per tier; §5.5 characterisation) | use-doc §6 (characterisation: use-doc §8 step 3) |
| §6.1 (README section order) | use-doc §7 |
| §7 (generator) | use-doc §3, §3.1 |
| §8 (conformance table) | use-doc §11 |
| §10 (future edits) | [migration README §7](addon-blueprint-2026-10/README.md) (W1–W9) |
| §11.n (decisions for Joe) | this file §9, item n |

## 7. Build-stage record

Created (new files only; nothing existing was edited, nothing under `foundry/module/`):

- `foundry/lib/` — 13 kit files, `kit.json`, README, `test-kit/{foundry-stub,harness}.mjs`,
  `test/run.mjs`, 14 test files, `test/fixtures/hook-order.mjs`.
- `foundry/blueprint/` — README, `template/pentaryn-__SHORT__/` (both tiers), `template/docs/`.
- `scripts/foundry/blueprint/` — `new_module.py`, `vendor.py`, `conformance.py`, `packages.json`,
  README, tests (`test_new_module.py`, `test_vendor.py`, `test_conformance.py`).
- this file, the use-doc, the baseline and the migration order.

### 7.1 Where the build departs from the spec, and why

| Spec | Built | Why |
|---|---|---|
| "Renders by literal replacement" only | literal replacement **plus** `@if full\|small\|dnd5e\|nodnd5e` line blocks; `module.json` edited structurally | one template serves both tiers and `--no-dnd5e`; otherwise C03 ("dnd5e iff touched") cannot be green in both modes |
| small kit = errors, log, hooks, publish | the same, closed over deps → `resolve` comes along | `publish` depends on `resolve` in `kit.json` (root `inspect` resolves the ref once) |
| small tier carries `lang/en.json` | small has no `lang/` and no `languages` | C04 requires languages iff something localises; the small template localises nothing |
| `buildApi(manifest, impl, {contributions, extras})` | also `members: {settings, trace, uninstall}` | the reserved names split three ways: `describe/version/contract` built by the kit; `settings/trace/uninstall` supplied as members; `inspect/selftest` allowed only as the module's own top-level rows. That is what lets the template have `inspect`/`selftest` rows while ties' `describe` card still throws |
| `installRoot` → `namespaces/describe/inspect` | also `published()`; `inspect` resolves the ref once before fanning out | one ambiguity error instead of one per module; `published()` records `when` across a root replacement (stored under `Symbol.for("pentaryn.kit.published")` on globalThis) |
| `serialStore.write` | resolves to the stored value, or `null` when this client may not write | a refusal is expected, so it does not throw |
| `resolveRef` (2) "string with `.` → uuid" | a string with `.` that is not uuid-shaped and not found falls through to names | names like "Mr. Brine" |
| `wrapMethod(…, make)` | `make` is a libWrapper-style `function (wrapped, ...args)` for both routes | one wrapper body whichever route registers it |
| `emitter` "past until → warnOnce" | `until` is `"<module id> <version>"`, compared with `game.modules.get(id).version` (or `opts.version`); the legacy name still fires | the warning tells the next editor to remove it; behaviour does not change by surprise |
| C08 `game.socket.emit("module.` | any `game.socket.emit/on` on a `module.*` literal or an identifier bound to one, or a socket registrar (from `packages.json`) | ties uses a `CHANNEL` constant; dropbin uses a registrar library — both were false failures |
| C03 detection | code patterns + dnd5e flags (`flags?.dnd5e`, `getFlag("dnd5e", …)`) + `Token5e/Item5e` | creatures and portals read dnd5e flags; comments do not count |
| C39 / C46 | n/a for a module not under `foundry/module/` (scratch or generated) | they check repo wiring that a scratch module cannot have; the generator prints those follow-ups |
| §6.1 "lint C45" for README order | README order is **C44**, CHANGELOG **C45** (the §8 table's numbering) | the spec numbered it twice; the table wins |
| `new_module.py` flags | adds `--install`, `--no-run`, `--modules-root`, `--app-root`, `--docs-root` | `--install` is the explicit opt-in for `foundry/module/`; the others make it testable in a temp dir |
| task text: `foundry/blueprint/skeleton/` with `__MODULE_ID__`-style tokens | `foundry/blueprint/template/pentaryn-__SHORT__/` with the spec's tokens | the spec's §7/§9 paths and token names are the detailed ones; both are under the allowed `foundry/blueprint/**` |
| hot-hook names, readiness tokens | in `packages.json` | `renderActionPanelArgonComponent` contains an exposure alias (`ArgonComponent`); a literal in `conformance.py` would mark the scanner exposed |

### 7.2 Results at build time (after the review fixes in §7.3)

- `node foundry/lib/test/run.mjs` — 66 tests at this point (69 after §7.4, 79 after §7.5), all
  pass (Foundry `common/` imported from 14.369.0).
- `./.venv/bin/python -m pytest -q scripts/foundry/blueprint/tests` — 60 at this point (65 after
  §7.4, 77 after §7.5), all pass.
- Generated `demo` (full) and `demo` (small) into the scratchpad with `--check`: parse, imports,
  i18n and node-test gates green, kit identical, conformance 100 % (43/43 and 35/35 fail-class
  rules; C39 is n/a outside `foundry/module/`). Full `--no-dnd5e` also green.
- Snapshot baseline: 43.9 %–64.1 % per module, average 53.8 % (see the baseline file).

### 7.3 Review fixes (Build stage, second pass)

A review of the first build found these; each is fixed and has a test.

| Defect | Fix |
|---|---|
| `buildApi`'s ref binding ignored the call's `opts.sceneId`/`opts.base` | `bind()` resolves per call from the argument after the ref; kit test with two same-named tokens on two scenes |
| a write row threw `NOT_FOUND`/`AMBIGUOUS` on a bad ref | write rows return `toFail(err)` for a coded resolve error (spec §3.4); template + kit tests |
| template `inspect` ignored `opts.as` | implemented: note/lastSeen GM-only, `hp` needs OBSERVER |
| `vendor.py sync --all` would vendor into all 19 unmigrated modules | `--all` = modules with a lock; the rest are skipped (and `check --all` skips them) |
| `conformance.py` always exited 0 | exit 1 when any fail-class rule fails (2 for an unknown module) |
| a crashing rule became `manual` and lifted the score | a crashed fail-class rule is `fail` |
| C19 never read `HOOKS` rows | C19 checks every `name:` in the exported `HOOKS` object |
| small `describe()` lacked most §3.2 keys | full key set, empty lists; glue test pins the key list in both tiers |
| the entry could not be hot-patched after `ready` | named phase functions, run at once when `game.ready`; glue test re-imports the entry; C50 recognises a named ready handler |
| the stub let a listener's throw escape | `Hooks` catches like Foundry's `Hooks.#call` (warn, error hook, continue); the glue test now throws inside the module's own handler; `fire("ready")` sets `game.ready` |
| `--force` reset the lock, dropped `--kit` extras and rewrote goldens | keeps the lock, re-vendors from it, runs without `GOLDEN_UPDATE` |
| the playbook pointed at a WAIT list the scorer never printed | `scripts/foundry/blueprint/wait.json`, printed as WAIT in every output format |
| the playbook did not document `--kit` and the other flags | use-doc §3.1, §4.1, §4.4, §8 step 3.3 |
| C39 counted as a pass outside `foundry/module/` | n/a there (still fails without `test/run.mjs`) |
| `packages.json` aliases had drifted from `adjustments.yml` | copied across; the registry's aliases are merged at run time; a test pins packages.json ⊇ registry |
| C36/C49 were warn only | `warn+manual`: a hit appears under Warnings and Manual |

Rescoring the snapshot after these fixes changed no score; only the Manual column gained C36/C49.

### 7.4 Review fixes (Build stage, third pass)

| Defect | Fix |
|---|---|
| `defineKeybindings` re-registered on a hot patch; Foundry 14 throws "You cannot register a Keybinding after the init hook" once `game.keybindings.bindings` exists, so `onSetup`/`onReady` never ran | skips a row whose action exists and registers nothing once `bindings` is set (`log.debug`); the stub keeps `actions`/`bindings` and throws Foundry's message after `setup`; kit tests; the full template gains one example keybinding (`toggleEnabled`) and the glue hot-patch case runs through it (fails with both guards removed) |
| the hot-patch procedure claimed a "fresh copy" | `?v=2` changes the entry URL only; its static imports are the cached instances. Use-doc §4.1, the entry header and the glue test now say it re-runs the wiring only; code edits need a reload |
| the printed `after_sync=(…)` used U+2026 (a SyntaxError when pasted) | the real tuple, `repr()` of each `flags.pentaryn.afterSync` line; a test parses the printed lines with `ast` |
| `--install --check` failed C39/C46 on a correct scaffold | `run_checks` scores as not installed and prints C39/C46 as pending follow-ups; use-doc §3.1 and step 10 say so; a test runs `--install --check` into a fake module root |
| no map of where the example is wired in | use-doc §3 step 4: "Example code to replace" table per file + per-file golden regeneration |
| `--docs` wrote `inspect` into a small module's use-doc | `write_docs` applies the tier's `@if` blocks; `inspect`/`selftest` lines are full-only; test both tiers |
| C40 skipped `i18n.test` for a full module without settings; nothing checked the small tier's hooks pin | C40 requires it for every full module; C20 applies to both tiers (small: `golden/hooks.json` and glue.test's `pinJSON("hooks"`) |
| the use-doc never said how to emit an event | use-doc §5.2 "Emitting events": `HOOKS` row shape, naming, `pre` + veto through `emit`, `legacyName`/`until`, README table and `describe.json` re-pin |

Rescoring the snapshot after these fixes changed no score or failing set (C40 already failed every
module on the missing hooks/api tests; unmarked modules default to `full`, so C20 is unchanged).

### 7.5 Gap-fill pass (Build stage, completeness review)

A completeness review of the build and the 19 guides found 21 gaps. Fixed in new files only:

| Gap | Fix |
|---|---|
| guides cite a spec not in the repo | the §6 "Spec § → where it lives now" table; spec citations in the guides, README, `api.mjs`, the template and `conformance.py` rewritten to use-doc sections |
| manifest/`describe()` contract only in a JSDoc | use-doc §5.1a: manifest fields, row fields, `describe()` keys, `inspect(ref, {as})`, `publishNamespace` options with the senses `chain` alias |
| no flags rule | use-doc §5.8 |
| small tier unscoreable until Wave 7 | `vendor.py sync --tier X` writes `tier` into `lib/kit.lock.json`; `Module.tier` = flags → lock → full; tests in `test_vendor.py`, `test_conformance.py` |
| no fork guide; no tooling map | [`migrate-mcp-fork.md`](addon-blueprint-2026-10/migrate-mcp-fork.md), [`tooling-lane.md`](addon-blueprint-2026-10/tooling-lane.md); `forkQueries`/`contractDrift` in the test kit |
| kit amendments K1, K3–K8 marked "not applied" | landed as **kit 1.0.1** (additive): getter route, `guarded` ctx + `sender:"any"`, `relayed`, unlisted copies, multi-key `serialStore`, guard level, `queryName`. K2 waits for D1 |
| scorer fixes R2–R9 marked "not applied" | landed in `conformance.py` + `packages.json`, each with a test. R1 waits for D2; R7's movement half (`ignoreTokens`) waits for D4 |
| shared-file batches scattered over 19 guides | [`wave7-restart-batch.md`](addon-blueprint-2026-10/wave7-restart-batch.md), [`adjustments-batch.md`](addon-blueprint-2026-10/adjustments-batch.md) |
| use-doc contradictions (§8 step 3.3 whole-suite `GOLDEN_UPDATE`, C20 "[full]", `requiresReload`, `selftest` on small, B6 wording, WAIT rows, "small + opt-in kit") | fixed in the use-doc |
| guide headers | `status: plan` everywhere, a Prerequisites row, a "re-score after the R fixes" line, a `## Result (fill when done)` section |

Gates after the pass: `node foundry/lib/test/run.mjs` 79 pass; blueprint pytest 77 pass; generated
`demo` full and small with `--check` (and full `--no-dnd5e`): every gate green, kit identical,
conformance 100 % (43/43 full, 36/36 small).

**Re-scoring the snapshot after R2–R9** (fail-class pass/total; only these modules changed):

| Module | Before | After | Why |
|---|---|---|---|
| aoe | 50.0 % (21/42) | 47.6 % (20/42) | R2: `setTimeout(publish, 0)` now fails C26 |
| dropbin | 53.7 % (22/41) | 50.0 % (21/42) | R2: `setTimeout(publishAPI, 0)` fails C26; R8: computed token-flag writes make C29 apply (fails) |
| journal | 48.8 % (20/41) | 46.3 % (19/41) | R7: `renderItemSheet5e` / `system.identified` are dnd5e use; C03 fails until the Wave 7 relationship |
| prompts | 51.2 % (21/41) | 50.0 % (21/42) | R8: C29 applies (token flags); its guide's `inspect` row clears it |
| importer | 62.2 % (23/37) | 63.9 % (23/36) | R9: C18 n/a (lifecycle hooks only) |
| lookup | 63.2 % (24/38) | 64.9 % (24/37) | R9: C18 n/a |
| pings | 60.5 % (23/38) | 62.2 % (23/37) | R9: C18 n/a |
| walls | 59.0 % (23/39) | 60.5 % (23/38) | R9: C18 n/a |

C33 (manual) now lists private internals for aoe, creatures, cursors, movement and senses (R6); C07's
detail says "DATA migration" for walls only and "manifest-only" for the rest (R3); C48 lists ties'
`study.inspect` and `attributes.describe` (R4). No other status changed. The guides' §1 tables
were scored before these fixes; each guide says so in its header.

## 8. Declared behaviour changes (each goes to the live-test workflow)

| # | Change |
|---|---|
| B1 | ties `describe` → `describeCard` (shim on `ties.describeCard` only); `ties.describe()` returns the manifest |
| B2 | combat events renamed with legacy double-fire until a stated `until` |
| B3 | hook registration moved to `setup` (new modules only) and the combat/transform entry collapse |
| B4 | `requiresReload: true` replacing hand-written reload prompts |
| B5 | removing the 9 existing `!important` overrides (combat/senses/transform) |
| B6 | walls flag-scope data migration (Wave 7); aoe, senses, cursors, attunement, dropbin, journal, ties: manifest-only |
| B7 | missing golden files fail |
| B8 | `toPlain` on query results (Documents → refs; depth uncapped) — expected no-op, pinned by `golden/queries.json` first |

## 9. Decisions for Joe

1. Vendored kit (byte-identical copies) rather than a `pentaryn-lib` library module; the library
   module is the phase-2 option.
2. Substring-free `resolveRef` for module APIs while the bridge's own tools keep substring matching.
3. Split read/write fork tools and compact read logging (`mcp-*.jsonl` grows).
4. The test kit imports Foundry's `common/` from the installed app at test time; a shim fallback is
   a test failure unless `PENTARYN_TEST_SHIMS=1`.
5. Missing golden files fail (changes what a fresh checkout of prompts does).
6. `flagScope` correction for walls as a Wave 7 data migration (aoe, senses, cursors, attunement,
   dropbin, journal, ties: manifest-only — their code already writes under the module id).
7. Argon composition order across combat/transform/riders — Wave 8.6, needs a table session.
8. Ties `describe` → `describeCard`.
9. Walls stays GM-only, published after `wasmReady` — recorded as `when`, not changed.
10. Combat's `pentarynCombat.*` events double-fire under both names for one release.

## 10. Future edits (listed, not made)

The pending wiring table is [migration README §7](addon-blueprint-2026-10/README.md) (W1–W9; the
use-doc §12 points there) — config/modules/cli gates, Makefile targets, the
exposure skip for `scripts/foundry/blueprint/`, `escalate.make_checks`, `pyproject` testpaths, the
CLAUDE.md and `context/foundry/README.md` routing rows, the Wave 7 restart batch and the fork tools.
