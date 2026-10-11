---
title: Migrating pentaryn-importer to the addon blueprint
status: done (offline) — live test pending
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, importer]
---

# Migrate `pentaryn-importer` to the blueprint

**Read this when:** you are about to bring `pentaryn-importer` up to the addon blueprint (fix phase
of the 2026-10 audit), or you need to know which audit findings the migration absorbs.
**Not this file:** the general procedure → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 ·
the order across modules → [`migration-order.md`](migration-order.md) · the live score → run
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module importer --markdown`.

Line numbers are **snapshot** line numbers (`audit-snapshot/pentaryn/module/pentaryn-importer/`).
On 2026-10-10 the snapshot and `foundry/module/pentaryn-importer/` were byte-identical
(`diff -rq` empty) and the module is not on the WAIT list. Re-check both before step 1:
`git diff ee505c2 -- foundry/module/pentaryn-importer` must be empty, or re-anchor every line
reference below first.

| | |
|---|---|
| Tier | `full` (writes world Actors through its API) |
| Score today | **62.2 %** (23/37 fail-class rules pass) |
| Projected after this guide | 100 % of fail-class rules except **C07** (waits for the Wave 7 `module.json` batch) |
| Steps | 9 (1 characterisation, 6 behaviour-neutral, 1 declared keystone, 1 Wave 7 batch item) |
| WAIT | **No** — touches no file of combat, transform or aoe. Its keystone change does alter *when* those modules' namespaces survive (they stop being wiped), so the live test checks them too |
| Effort | ~2 days (L): no tests exist today, so characterisation is half the work |
| Order | **First** of all 19 (migration-order #1, the keystone `items-journal-1`) |
| Prerequisites | R9 C18 lifecycle-only → n/a — **landed** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module importer --markdown`. On the snapshot it moved 62.2 % → 63.9 % (R9: C18 is n/a — no feature file is needed) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

---

## 1. Conformance today, item by item

Scored with `conformance.py --snapshot … --module importer --json` (2026-10-10).

| Rule | Today | Detail | Cleared by |
|---|---|---|---|
| C01 id = folder | pass | | — |
| C02 minimum 14 (warn) | **warn** | `compatibility.minimum` is `"13"` (`transform-creatures-24`) | step 9 (Wave 7) |
| C03 dnd5e relationship | pass | `relationships.systems` dnd5e present | — |
| C04 languages | pass | no i18n used | — |
| C05 reachable | pass | single file | keep: every new file imported from the entry chain |
| C06 styles exist | pass | no styles | — |
| C07 `flags.pentaryn` | **fail** | missing tier, namespace, flagScope, cssPrefix | step 9 (Wave 7); see §6 decision on `flagScope` |
| C08 socket | pass | | — |
| C09 packages in relationships | pass | | — |
| C10 size (warn) | **warn** | `pentaryn-importer.mjs` 1243/150; `README.md` 263/250 | steps 2–5 (entry ~70 lines), step 8 (README) |
| C11 pure core | **fail** | no `*-core.mjs` | step 2 |
| C12 one `MODULE` | **fail** | `MODULE_ID` at :103, no `MODULE` | step 2 |
| C13 no stray `.md` | pass | | — |
| C14 vendored kit | **fail** | no `lib/kit.lock.json` | step 1 |
| C15 `import * as` | pass | | keep: named imports only |
| C16 import direction | pass | | keep: the layout in §2 obeys it |
| C17 module-scope hooks in entry | pass | | — |
| C18 features export install/uninstall | **fail** | no feature files | step 5 (no feature needed: see §2 note) |
| C19 emitted hook names | pass | emits none | — |
| C20 `golden/hooks.json` | **fail** | | step 1 |
| C21 settings only in settings.mjs | pass | no settings | — |
| C22 SETTINGS exported | n/a | no settings | — |
| C23 no foreign settings | pass | | — |
| C24 no empty catch | pass | | — |
| C25 console prefix / makeLog | **fail** | `TAG = "[pentaryn-importer]"` at :211–215; `console.log` block in `reportSummary` :1202–1220 | step 4 (**declared**: console prefix) |
| C26 publish timers | pass | publishes synchronously at ready | keep |
| C27 api-manifest + buildApi | **fail** | | step 6 |
| C28 describe/surface goldens | **fail** | | step 6 (pinned in step 1 for the legacy root keys) |
| C29 inspect when writing actor flags | n/a | scorer: "writes no flags of its own" (it writes the generator's `flags.pentaryn.*`, §6) | optional `inspect` row, step 6 |
| C30 queries guarded | pass | no queries | — |
| C31 writes ok/fail (manual) | manual | `import()` throws on refusal and returns `{ok:false, failed}` per actor — a legacy two-channel shape, kept and documented in the manifest (`legacy: true`, `throws`) | step 6 |
| C32 patches via wrapMethod | pass | no patches | — |
| C33 private access | n/a | | — |
| C34/C35 lang nesting, i18n coverage | n/a | no lang file | — |
| C36 hard-coded UI English (warn) | **warn** | 5 literals (:697, :728, :744, :792, :890) — all inside assertion messages shown via `shout()`. Kept: the toast is a GM-only diagnostic whose text is pinned verbatim | not cleared; listed as accepted in the plan |
| C37/C38 CSS | pass / n/a | no CSS | — |
| C39 test/run.mjs + node-test gate | **fail** | no `test/`; `ModuleSpec("pentaryn-importer", check=_STATIC)` (config.py:311) | step 1 (+ the config.py edit, pending wiring §12 of the use-doc) |
| C40 tier test files | **fail** | missing core, glue, hooks, api, i18n tests | steps 1 and 6 |
| C41 VERSION test | **fail** | | step 2 (`core.test`, once the core exists) |
| C42 synthetic fixtures (manual) | n/a | | step 1: fixtures are synthetic (never a real `actors.json`) |
| C43 LEGACY suites | n/a | no suite | — |
| C44 README order | **fail** | 13 sections missing | step 8 |
| C45 CHANGELOG | **fail** | changelog is a README section (:225–231) | step 8 |
| C46 routing | pass | routed via `foundry/CONTRACT.md` | step 8 adds a direct row |
| C47 adjustments rows | pass | `dnd5e-importer-gate` (files: the entry + `build_actors.py`; marker `targetSystemVersion`) | step 4 must re-point its `files` (see step 4) |
| C48 reserved names | pass | | keep: kit `contract` ≠ the actors.json contract (§6) |
| C49 hot hooks | pass | | — |
| C50 publish timing | n/a | | step 6 (`when: "ready"`) |
| C51 settings labels | n/a | | — |
| C52 legacyName has until | pass | | — |

---

## 2. Target layout

```
foundry/module/pentaryn-importer/
  module.json                 unchanged until the Wave 7 batch (step 9)
  pentaryn-importer.mjs       ENTRY (~70 lines): file map, log, Hooks.once("ready", onReady) — publish only
  importer-core.mjs           PURE: constants, error classes, formula lint, payload shaping, valuesMatch,
                              assertionMessage, versionProblems, (later) indexBySlug
  documents-adapter.mjs       ADAPTER: fetch, module expectations, refuse/shout, version gate wrapper,
                              Actor/Item writes, readback assertions, reportSummary
  api-manifest.mjs            PURE rows: import (legacy), selftest, optional inspect
  api.mjs                     API: importActors orchestrator, impl map, selftest, buildApiFor, legacyRoot
  lib/                        vendored kit, tier full (+ lock)
  test/run.mjs, test/kit/, test/{core,glue,hooks,api,i18n}.test.mjs,
  test/fixtures/{manifests.mjs,legacy-importer.mjs}, test/golden/{hooks,describe,surface,root}.json
  README.md (use-doc §7 order), CHANGELOG.md
```

No feature file: the importer registers exactly one hook (`ready`) and that is publish, which the
blueprint keeps in the entry. C18 then needs either one trivial feature or a scorer exemption for
modules whose only hook is the entry's lifecycle hook — **raise with the Fix-stage lead** (see §8).
Do not invent a feature file just to pass C18.

| Old (snapshot lines) | New file | Notes |
|---|---|---|
| 1–97 header doc | `importer-core.mjs` top comment | It documents `FLAG_SCOPE`/`getProperty`/`getFlag`; it moves with the constants it justifies. Entry keeps a 10-line file map |
| 103 `MODULE_ID` | `importer-core.mjs` `export const MODULE = "pentaryn-importer"` | `MODULE_ID` name removed (C12); API keeps publishing `moduleId` (legacy root key) |
| 106–111 `FLAG_SCOPE`, `CONTRACT_ID`, `DEFAULT_TIMEOUT_MS` | `importer-core.mjs` | `CONTRACT_ID` stays the **actors.json** contract `pentaryn/actors.json@1`. New `CONTRACT = "pentaryn-importer/api@1"` is the kit API contract — two different things (§6) |
| 113–162 `FORMULA_OK`, `FORMULA_GLOBS`, `FORMULA_PATTERNS` | `importer-core.mjs` | verbatim |
| 164–170 `STRIPPED_ACTOR_KEYS`, `STRIPPED_ITEM_KEYS` | `importer-core.mjs` `STRIPPED_KEYS` + both old names as aliases | step 3 (`items-journal-3`) |
| 172–207 `PentarynError`, `PentarynAbort`, `PentarynAssertionError` | `importer-core.mjs` | **Not** the kit's `PentarynError` (lib/errors.mjs). Never import both under one name; `instanceof` at :1127–1130 depends on these classes |
| 209–225 `TAG`, `log`/`warn`/`err`, `shout` | `documents-adapter.mjs` (`refuse`, `failAssertion`, `shout` over kit `makeLog`) | step 4; toast text keeps the `[pentaryn-importer] ` prefix byte-identical |
| 231–283 `isPlainObject`, `normalise`, `cloneJson`, `walkStrings`, `walkLeaves` | `importer-core.mjs` | verbatim (comment at :242–243 fixed separately, `items-journal-6`) |
| 289–338 `fetchJsonWithTimeout` | `documents-adapter.mjs` | verbatim |
| 344–360 `moduleExpectations` | `documents-adapter.mjs` | verbatim |
| 362–453 `assertVersionGate` | core `versionProblems(manifest, expected, live)` ← body :373–437; adapter `assertVersionGate` = problems → `refuse` → log line :449–452 | step 2 (`items-journal-2`) |
| 459–482 `lintFormulas` | `importer-core.mjs` | `foundry.utils.getProperty` at :474 → core `getPath` (plain JSON only) |
| 484–502 `assertNoBadFormulas` | `documents-adapter.mjs` | uses `refuse` (step 3) |
| 508–571 `preparePayload`, `toUpdatePayload`, `toCreatePayload` | `importer-core.mjs` | `getProperty` at :532 → `getPath` |
| 577–617 `valuesMatch`, `assertionMessage` | `importer-core.mjs` | verbatim |
| 619–818 `assertValue` … `runExpectedAssertions` | `documents-adapter.mjs` | keeps `foundry.utils.getProperty` (walks live Documents) |
| 824–927 `findActorBySlug`, `storedHash`, `isManagedItem`, `replaceItems`, `stampContentHash` | `documents-adapter.mjs` | verbatim |
| 929–1189 typedefs + `importActors` | `api.mjs` | orchestrator, ~215 lines; api.mjs stays ≲300 |
| 1191–1226 `reportSummary` | `documents-adapter.mjs` | console lines via `log` (step 4) |
| 1228–1242 ready hook | entry `onReady` → `buildApiFor(ctx)`, `publishNamespace("importer", api, {moduleId: MODULE})`, then `Object.assign(game.pentaryn, legacyRoot(api))` | step 7 (**declared keystone**) |

---

## 3. Steps

Each step is one commit. Gate after every step: `make foundry-importer-check` (static gates), then
from the module folder `node test/run.mjs`, plus `vendor.py check importer` and
`conformance.py --module importer` until those are wired into the make target. The refactor steps
(2–6) must leave `git diff --stat -- test/golden test/*.test.mjs` empty.

### Step 1 — Characterise (tests and goldens only; checkpoint)

Absorbs: test parts of `items-journal-2`, `-3`, `-5`, `-1`. Clears C14, C20, C39 (with the
config.py edit), C40 (core/glue/hooks/i18n).

1. `./.venv/bin/python scripts/foundry/blueprint/vendor.py sync importer --tier full`.
2. `test/run.mjs` = the fixed body (use-doc §6); `LEGACY = []`.
3. `test/fixtures/legacy-importer.mjs` — **verbatim copy** of snapshot :103–617 (constants, error
   classes, utilities, `lintFormulas`, `preparePayload`, `toUpdatePayload`, `toCreatePayload`,
   `valuesMatch`, `assertionMessage`), plus `export`s. It is the oracle: core tests run the same
   table against it and (from step 2) against `importer-core.mjs`, over one table (use-doc §8 step 3).
4. `test/core.test.mjs` (cases from `items-journal-2`, `-3`):
   - `valuesMatch`: `(3,'3')→true`, `(3,'3.0')→true`, `(3,'x')→false`, `(3,Infinity)→false`,
     `(true,'true')→false`, `(null,undefined)→true`, `(null,0)→false`, `('DC 13','DC 13 ')→true`,
     `('a  b','a b')→true`, `('x',undefined)→false`.
   - `lintFormulas([{flags:{pentaryn:{slug:'s'}},system:{attributes:{hp:{formula:'2d8+@abilities.con.mod'},movement:{walk:'30',units:'ft'}}},items:[{system:{activities:{abc:{attack:{bonus:'+4'}}}}}]}])`
     deep-equals `[{slug:'s',path:'system.attributes.hp.formula',value:'2d8+@abilities.con.mod'}]`.
   - `preparePayload({name:'X',img:'i',_id:'1',expected:{actor:{}},prototypeToken:{texture:{src:'a'},width:1},items:[{name:'I',img:'j',_id:'2',expected:{}}],flags:{pentaryn:{slug:'x'}}})`:
     `data` lacks img/_id/expected/items; `data.prototypeToken` deep-equals `{width:1}`;
     `items[0]` deep-equals `{name:'I'}`; `expected` deep-equals `{actor:{}}`; slug `'x'`.
     Missing slug → throws with `err.name === 'PentarynAbort'`.
   - `toUpdatePayload({system:{attributes:{hp:{value:5,max:9}}},flags:{pentaryn:{contentHash:'h',slug:'x'}}})`
     → hp `{max:9}`, `flags.pentaryn` `{slug:'x'}`; `toCreatePayload` keeps hp.value, drops contentHash.
   - `FORMULA_PATTERNS.length === 25`; `STRIPPED_ACTOR_KEYS` and `STRIPPED_ITEM_KEYS` deep-equal
     `['expected','_id','img','folder','_stats','ownership']`.
   - `assertionMessage({slug:'s',action:'a',activityId:'id1',path:'p',expected:1,actual:2,hint:'h'})`
     === `'READBACK ASSERTION FAILED — aborting the whole run.\n  where:    actor "s" → item "a" → activity id1\n  path:     p\n  expected: 1\n  actual:   2\n  hint:     h'`.
   - Hostile: `lintFormulas([])→[]`; `preparePayload({flags:{pentaryn:{slug:5}}})` throws Abort;
     `valuesMatch(0,'')` (pin whatever today returns, `// KNOWN:` if surprising).
   - The `VERSION === module.json.version` assertion is added in step 2, when the core exists.
5. `test/glue.test.mjs` — `installFoundry({user:{isGM:true}, modules:[{id:'pentaryn-importer', flags:{pentaryn:{contract:'pentaryn/actors.json@1',targetSystem:'dnd5e',targetSystemVersion:'6.0',generation:14}}}], system:{id:'dnd5e',version:'6.0.6'}})`,
   `game.release.generation = 14`, `game.world.id = 'w'`, a `globalThis.fetch` stub, then import the
   entry and `F.fire("ready")`. Pin **effects**:
   - `utilsSource === "foundry"`.
   - Dry run on a valid empty manifest (`{$contract:'pentaryn/actors.json@1',targetSystem:'dnd5e',targetSystemVersion:'6.0',generation:14,actors:[]}`):
     `JSON.stringify(await game.pentaryn.import({dryRun:true}))` pinned to `golden/dryrun.json`;
     console lines captured (`console.log`/`group`) pinned verbatim, including the `[pentaryn-importer]` prefix
     (step 4 updates exactly this pin — it is the declared console change).
   - Version gate: manifest with `targetSystemVersion:'5.3'` → rejects with `name === 'PentarynAbort'`;
     the message text pinned verbatim; exactly one `ui.notifications.error` whose text starts with
     `'[pentaryn-importer] '` and options deep-equal `{permanent:true, console:false}`.
   - Lint failure: an actor with `system.attributes.hp.formula:'@x'` → Abort, message pinned.
   - Non-GM (`game.user.isGM=false`) → Abort `'Refusing to import: only a GM can create or update world Actors.'`.
   - Concurrency, **today's behaviour** (`items-journal-4`): two overlapping `import({dryRun:true})`
     calls with a fetch that resolves on a 10 ms timer both resolve `ok:true` — a `// KNOWN:` row.
6. `test/hooks.test.mjs` — `golden/hooks.json` = `["once:ready"]` (recorded with the stub on
   2026-10-10). Drop the template's "only lifecycle hooks at module scope" assertion; it is true here
   but the template text is wrong for migrating modules.
7. Root-namespace characterisation (`items-journal-1`), in `glue.test` (`golden/root.json`):
   - `game.pentaryn` undefined before ready → after ready `Object.keys(game.pentaryn)` is
     `['import','moduleId','contract','_internals']`, `contract === 'pentaryn/actors.json@1'`,
     `moduleId === 'pentaryn-importer'`, `Object.isFrozen(game.pentaryn) === true`,
     `Object.isFrozen(game.pentaryn._internals) === true`, `_internals` keys
     `['fetchJsonWithTimeout','lintFormulas','valuesMatch','normalise']`.
   - `game.pentaryn = {aoe:{x:1}}` before ready → after ready `aoe` is **gone** (`// KNOWN:` — this
     is the bug step 7 fixes, and the row step 7 rewrites under its declared-change commit).
   - Paste the attunement guard (snapshot attunement.mjs:868–873) verbatim into the test; run it
     after ready → both `attunement` and `import` present (spread branch). Run it before → `attunement`
     lost (`// KNOWN:`).
8. `test/i18n.test.mjs` (tier full requires it): assert the module has no `lang/` and no
   `PENTARYN_` literal (`sourceScan`) — the importer is console/toast-only by design (C36 note).
9. `GOLDEN_UPDATE=1 node test/run.mjs` against **unchanged** code, then `node test/run.mjs` green.
10. **Checkpoint:** the diff is `lib/`, `test/` only. the agent commits it as the checkpoint; review happens at merge.
11. Pending wiring (outside the module, listed in use-doc §12): `config.py:311`
    `check=(*_STATIC, "node-test")`. Until it lands, run `node test/run.mjs` by hand (C39 stays red in
    the scorer until then).

### Step 2 — Extract `importer-core.mjs` (behaviour-neutral)

Absorbs `items-journal-2`. Clears C11, C12, C41.

- Move the rows of §2 marked `importer-core.mjs` verbatim; add `MODULE`, `SHORT = "importer"`,
  `NS = "importer"`, `VERSION = "1.1.0"`, `CONTRACT = "pentaryn-importer/api@1"`, `HOOKS = {}`,
  `I18N = "PENTARYN_IMPORTER"`, `CSS = "pim-"`.
- `getPath(obj, path)` (local, dotted, plain JSON) replaces `foundry.utils.getProperty` at :474 and
  :532 **only**; every Document read keeps `foundry.utils.getProperty`.
- `versionProblems(manifest, expected, live)` with `live = {systemId, systemVersion, generation, version}`
  returns the `problems` array of :373–437 (same order, same strings). The entry-side
  `assertVersionGate` builds `live` from `game.system`/`game.release`/`game.version` and keeps the
  throw/notify/log of :439–452.
- Test first (`core.test`): `versionProblems` with manifest/expected `targetSystemVersion:'6.0'`,
  live `{systemId:'dnd5e',systemVersion:'6.0.6',generation:14,version:'14.369'}` → `[]`; manifest
  `'5.3'` (expected stays `'6.0'`) → length 2, both strings equal today's template text verbatim
  (paste them from :406–419). `VERSION === JSON.parse(module.json).version`. Core imported bare first
  (no globals) proves C11. The oracle table now runs against both files.
- Proof: `core.test` and `glue.test` green, goldens untouched.

### Step 3 — `refuse` / `failAssertion` / `STRIPPED_KEYS` (behaviour-neutral)

Absorbs `items-journal-3`.

- `refuse(ErrorClass, message)` = `shout(message); throw new ErrorClass(message)`; `failAssertion(ctx)`
  = `refuse(PentarynAssertionError, assertionMessage(ctx))`. Use `refuse(PentarynAbort, …)` at :445,
  :500, :987 and `failAssertion`/`refuse(PentarynAssertionError, …)` at the 7 assertion sites :625,
  :668, :701, :746, :794, :894, :1110. **Leave :1029 as is** (shouts and rethrows a `preparePayload` Abort).
- Test first: a `sourceScan` assertion that the source has exactly 3 `refuse(PentarynAbort` and 7
  assertion-site calls; the step-1 glue pins (gate/lint/non-GM toasts and messages) must not move.
- Risk to watch: swapping an Abort for an AssertionError changes what the per-actor catch at
  :1127–1130 rethrows — the class at each site stays exactly as listed.

### Step 4 — `documents-adapter.mjs` + `api.mjs` split, logging through the kit

Absorbs: structural part of `items-journal-2`; clears C25, C10 (entry).

- 4a (neutral): move the adapter rows of §2 verbatim; `importActors` + typedefs into `api.mjs`.
  Named imports only (C15). Gate: every step-1 test green, goldens untouched.
- `foundry/adjustments.yml` in the **same change set** as 4a: row `dnd5e-importer-gate` `files` currently lists
  `pentaryn-importer.mjs` (marker `targetSystemVersion`). After steps 2 and 4a that literal lives in
  `importer-core.mjs` (`versionProblems`) and `documents-adapter.mjs` (`moduleExpectations`), not in the ~70-line
  entry, so replace the entry path with those two files (keep `scripts/foundry/build_actors.py`). Schedule for
  the window when `adjustments.yml` is idle (same one-batch rule as attunement step 3).
- 4b (**declared, console only** — Joe's rule: console-only text is fine at his table): replace
  `TAG`/`log`/`warn`/`err` with `makeLog(MODULE)` → console lines become `pentaryn-importer | …`
  instead of `[pentaryn-importer] …`. **Toast text stays byte-identical** (`shout` still passes
  `` `[pentaryn-importer] ${message}` `` to `ui.notifications.error` with `{permanent:true, console:false}`;
  the deleteJson and summary toasts at :1167 and :1217–1225 likewise). Update only the console pins of
  `glue.test`, in a commit whose message names this declared change. Nothing in the repo parses the
  console prefix (grep 2026-10-10: only the audit doc mentions it).

### Step 5 — Entry wiring

Clears C10 (entry ≲150). The entry: file-map header, `makeLog`, `hookRegistry`, a `ctx`,
`Hooks.once("ready", onReady)`. No install call (no features). `golden/hooks.json` must still be
`["once:ready"]`.

### Step 6 — `api-manifest.mjs` + `buildApi` (behaviour-neutral for the legacy root)

Absorbs `items-journal-5` (additive `importer` namespace and `describe()`). Clears C27, C28, C40 (api), C50.

- Rows: `import` — `params:[{name:"options", type:"ImportOptions", resolve:false}]`,
  `returns:"ImportResult"`, `gm:true`, `writes:true`, `legacy:true`,
  `throws:["PentarynAbort","PentarynAssertionError"]`, `sideEffects:["creates/updates world Actors","replaces managed Items","stamps flags.pentaryn.contentHash","permanent toasts"]`,
  `doc` = README "For an LLM" text (dry run first; Abort = nothing written; Assertion = a partial batch).
  `selftest`. Optional new read `inspect(ref)` → `{slug, contentHash, managed:[names], unmanaged:[names]}`
  via `toPlain` (additive; C29 is n/a so it is not required).
- `unlisted`: `moduleId` (string), `actorsContract` (= `CONTRACT_ID`), `_internals` (the frozen object
  of :1239, same four functions). Non-function members go through `unlisted` — `buildApi` only checks
  rows for functions.
- **Do not** put the actors.json contract under `contract`: on the namespace `contract` is reserved
  and means the API contract (`pentaryn-importer/api@1`). The old meaning survives at the root key
  `game.pentaryn.contract` (step 7).
- Tests first (`api.test`): rows ↔ impl; `normaliseDescribe(describe())` → `golden/describe.json`;
  `surfaceOf` → `golden/surface.json`; `importer.import === <the root import>` after step 7.
- In this step the entry still publishes the legacy root exactly as :1233–1240 (frozen) **and**
  sets `game.modules.get(MODULE).api = api` (additive). Root goldens untouched.

### Step 7 — The keystone: merge into `game.pentaryn` instead of replacing and freezing (**declared**)

Absorbs `items-journal-1`. Unblocks (later, in other modules' own migrations) the removal of 18
guard copies and setTimeout(0) wrappers, and `foundry/lib/publish.mjs`'s COMPAT block
(`until: items-journal-1`).

- `onReady`: `ctx.api = buildApiFor(ctx)` (drift → `log.error`, return); `publishNamespace("importer", ctx.api, {moduleId: MODULE})`;
  then `Object.assign(game.pentaryn, legacyRoot(ctx.api))` where `legacyRoot` (api.mjs) returns
  `{import: importActors, moduleId: MODULE, contract: CONTRACT_ID, _internals: Object.freeze({fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise})}`
  and the `log` line of :1241 verbatim.
- The root is **not** frozen any more. `_internals` stays frozen. Root keys and `installRoot`'s
  non-enumerable helpers coexist: `namespaces()` filters on `typeof value.contract === "string"`, so
  the root's own `contract` string and `import` function are never mistaken for namespaces.
- Rewrite the step-1 `// KNOWN:` rows in `golden/root.json` in this commit, message
  `[declared] importer merges into game.pentaryn (items-journal-1)`:
  (1) `root={}` → keys include `import, moduleId, contract, _internals, importer`; `Object.isFrozen(root) === false`;
  (2) `root={aoe:{x:1}}` → `aoe` preserved; (3) attunement guard after → both present (else branch);
  (4) guard before → both present; (5) a kit module publishing before and after → both present.
- Live test: §5, D-I1.

### Step 8 — Docs

Absorbs `items-journal-6` (README parts c, d), and the README side of `-5`. Clears C44, C45, C10 (README).

- README to the use-doc §7 order. Content map: Install (:29–55) → *Sync*; Use/Options/Return value
  (:56–153) → *API — game.pentaryn.importer* (the manifest rows are the source of truth; keep the
  options table); guarantees/idempotence (:154–184) → *Data written*; Deviations (:185–211) →
  *Pitfalls* (getFlag scope note, `FLAG_SCOPE` ≠ module id, cloneJson trap); Errors (:212–224) →
  *API* (two-channel contract); Verification status (:232–262) → `context/plans/` history.
  The Gate 2 walkthrough (:110–131) goes to a new use-doc `context/foundry/importer.md`
  (*At the table / For the GM / API quick calls / Known gaps*), keeping the README under 250 lines.
- `CHANGELOG.md` from README :225–231; examples use `<world>` not `ardenhaven`; front matter status
  no longer `draft`.
- Routing: add a row for the importer to `context/foundry/README.md` "Route by task".
- Comment fixes in code (`items-journal-6` a, b, e: :9 playbook path → `context/plans/foundry-content-pipeline.md`,
  :242–243 cloneJson comment says JSON round-trip — **do not** switch to `structuredClone`, :123 a column-0 `*` that should be ` *` (the finding says :122; the snapshot has it at :123))
  ride in this commit; comments only.

### Step 9 — Wave 7 `module.json` batch item (restart)

- Add the blueprint keys **into the existing `flags.pentaryn` object** — the version gate reads
  `flags.pentaryn.{contract,targetSystem,targetSystemVersion,generation}` through
  `moduleExpectations()` (:351). Replacing the object breaks every import.
  Add: `tier:"full"`, `namespace:"importer"`, `flagScope:"pentaryn-importer"` (see §6),
  `cssPrefix:"pim-"`, `afterSync:[…]`. `generation: 14` already exists with the same meaning.
- `compatibility.minimum: "14"` (`transform-creatures-24`; C02).
- Restart Foundry; the glue test's module flags stub gains the same keys.

---

## 4. Findings that stay standalone (not structural)

| Finding | Why standalone | When |
|---|---|---|
| `items-journal-4` re-entrancy guard | **Declared** hardening (a concurrent second call throws `PentarynAbort`) | after step 7; its step-1 `// KNOWN:` row flips in that commit |
| `items-journal-7` `indexBySlug` | Performance; changes the per-entry lookup path. Pure `indexBySlug` goes in the core with the `items-journal-7` fixtures (`.get('a').id==='1'`, `has(undefined)===false`, `size===1`) and the duplicate-slug characterisation (`created=['a']`, `updated=['a']`) | after step 7 |
| `items-journal-6` (a, b, e) | comment-only | in step 8 |
| `python-tooling-53` | `pipeline.stage` install is tooling, not the module | python-tooling plan |
| `senses-walls-cursors-34`, `transform-creatures-16` | the other modules' guard copies; they *become removable* after step 7 but are removed in each module's own migration | per module |

## 5. Declared behaviour changes — live test

| # | Change | How to see it at the table |
|---|---|---|
| D-I1 | `game.pentaryn` is merged into, not replaced and frozen (`items-journal-1`) | After a full reload as GM: `Object.isFrozen(game.pentaryn) === false`; `Object.keys(game.pentaryn)` lists every enabled module's namespace (including the WAIT modules combat, transform, aoe and the synchronous publishers transform, names, pings, ties, walls, lookup) **and** `import, moduleId, contract, _internals, importer`; `await game.pentaryn.import({dryRun:true})` and `make foundry-import`'s instructions still work; repeat as a player (no import call) to see namespaces present |
| D-I2 | Console prefix `[pentaryn-importer]` → `pentaryn-importer \|` | Console only; toasts unchanged. No table check needed beyond a glance during D-I1 |
| D-I3 | (standalone `items-journal-4`) concurrent `import()` refused | Run two `game.pentaryn.import({dryRun:true})` without awaiting: second rejects `PentarynAbort`; a third after both settle succeeds |
| D-I4 | New canonical `game.modules.get("pentaryn-importer").api` and alias `game.pentaryn.importer`, hooks `pentaryn-importer.ready` / `pentaryn.ready` fire | additive; `game.pentaryn.importer.describe().version === "1.1.0"` |

## 6. Decisions for Joe

1. **`flagScope` for the importer.** C07 wants `flagScope == module id`. The importer owns no flags
   of its own; it writes the generator's contract scope `flags.pentaryn.{slug,contentHash,action,…}`
   (CONTRACT.md §9.2, header :85–96). Recommended: `flagScope: "pentaryn-importer"` (true: nothing
   is written under it) and list `flags.pentaryn.*` in the manifest's `flags.writes`, documented as a
   contract scope that is **never** migrated (moving it would change every `contentHash`/slug lookup
   and force a full re-import). The alternative — `flagScope: "pentaryn"` — fails C07 forever.
   **Decided 2026-10-11 (Joe, D5): `flags.pentaryn.*` is the generator's contract scope.** The importer
   declares `flagScope: "pentaryn-importer"` in the Wave 7 batch and documents `flags.pentaryn.*` as a
   contract scope that is never migrated (README *Data written*; CONTRACT.md §9.2). No data moves.
2. Console prefix change D-I2 (recommended: accept; console-only).

## 7. WAIT

No. The importer touches no file of combat, transform or aoe and needs no re-anchor against the
live-test workflow. Its keystone (step 7) changes those modules' runtime outcome only in the
"was wiped" direction — include them in D-I1's check.

## 8. Effort, and blueprint gaps found while planning

Effort: step 1 ~0.75 day (no tests today), steps 2–6 ~0.75 day, steps 7–8 ~0.5 day; step 9 rides
the Wave 7 batch. **~2 days.**

Gaps to raise with the blueprint owner (not fixed here — no edits to existing files):
- **C18 with no features.** A module whose only hook is the entry's `ready` cannot pass C18 without
  a pointless feature file. Suggest: C18 → n/a when the entry's `import * as` list is empty and the
  module registers only lifecycle hooks.
- The template `hooks.test.mjs` asserts "only lifecycle hooks at module scope"; migrating modules
  (synchronous install, use-doc §6) cannot meet it. Migration guides drop that assertion.

## 9. Deploy and rollback

The importer is **not** deployed by `module-sync` (`ops module-sync` refuses it: a second copy would
land where Foundry loads modules from). It ships with the actor pipeline, `ops stage`
(`make foundry-sync`), whose default world is `space-journey` — **always pass `WORLD=pentaryn`**
(or the world under test). `stage` also rebuilds `foundry/build/actors.json` and **stages it into
`Data/worlds/<world>/`, which is public over the tunnel**, so every stage is followed by
`make foundry-clean`. Only the lifecycle commands allowed to agents are used
(`make foundry-down`, `foundry-up`, `foundry-backup`, `login`); never `vtt-up`.

**Deploy (code only — no `module.json` change until the Wave 7 batch, so a reload is enough):**

1. A world snapshot if a real import may follow: `make foundry-backup` **refuses while Foundry is up**, so
   take it before `make foundry-up` (or `make foundry-down` → backup → `make foundry-up`). The deploy and
   a dry run write no world data.
2. `make foundry-sync WORLD=pentaryn` — expect `▸ target world: pentaryn`, `✓ module → …/Data/modules/pentaryn-importer`,
   `✓ actors.json staged`. Then `git status --short foundry/build/actors.json`: a diff there is
   generator drift, not this migration — stop and report it.
3. If no dry run is wanted now: `make foundry-clean WORLD=pentaryn` **immediately** (deletes the
   staged JSON; with the tunnel up it also proves a public 404).
4. Reload the one GM tab (`localhost:30000/game`, it hosts the MCP bridge). New files
   (`importer-core.mjs`, `documents-adapter.mjs`, `api-manifest.mjs`, `api.mjs`, `lib/`) load
   through the unchanged `esmodules` entry; no restart.
5. Smoke through `eval-js` (GM):
   `({ frozen: Object.isFrozen(game.pentaryn), keys: Object.keys(game.pentaryn), ok: game.pentaryn.importer.selftest().ok, v: game.pentaryn.importer.describe().version, same: game.pentaryn.importer.import === game.pentaryn.import })`
   → `frozen: false`; `keys` has every enabled module's namespace (combat, transform and aoe
   included) **and** `import, moduleId, contract, _internals, importer`; `ok: true`; `v: "1.1.0"`; `same: true`.
6. Dry run (D-I1, D-I3), only while the JSON is staged (step 2 without step 3):
   `await game.pentaryn.import({ dryRun: true })` → `ok: true`; then two calls without awaiting →
   the second rejects `PentarynAbort` ("An import is already running…"); then
   **`make foundry-clean WORLD=pentaryn`**. `make foundry-import` is not usable by an agent: with no
   terminal it skips the prompt and deletes the JSON before the import can run.
7. Console glance (D-I2): the importer's lines read `pentaryn-importer | …`; toasts unchanged.
8. Player view: one player tab on `zz<n>.localhost` (`make login`), `Object.keys(game.pentaryn)` lists
   the namespaces; close the tab after.

**Rollback** (fix forward first; this is the last resort). The deploy writes no world data and
migrates nothing, so rolling back is redeploying the old code:

1. `git revert --no-edit <commits>` newest first — the importer's are listed in the Result table
   below (`566895f` … `b757a8a`; the checkpoint `cb81c20`/`051737b` and `5730eea` can stay: tests
   and the gate only). Reverting `754aa94` also restores the `dnd5e-importer-gate` row's `files`.
2. `make foundry-sync WORLD=pentaryn`, then `make foundry-clean WORLD=pentaryn`, then reload the GM tab.
3. Check: `game.pentaryn.importer` is gone and `game.pentaryn.import` works; the root is the
   importer's frozen object again, or a guard's unfrozen copy of it once a later module republished
   (the old behaviour). Other modules need no change either way: their guard copies handle both a
   frozen and an open root.

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **97.6 %** (41 / 42 fail-class rules) — `conformance.py --module importer --markdown`, 2026-10-11 (offline; not yet deployed) |
| Date | 2026-10-11 |
| Commits | characterisation: `051737b`, `cb81c20` (checkpoint), `5730eea` (gate) · refactor: `b757a8a` (2), `f55d256` (3), `754aa94` (4a + adjustments row), `bd83c80` (4b **[declared]** D-I2), `e34372a` (5), `d3658a6` (6), `c0c3f97` (7 **[declared]** keystone D-I1), `28f3726` (C50: `Hooks.once`), `412d23b` (module index), `e612a79` (8) · standalone: `60bef2a` (`items-journal-4` **[declared]** D-I3), `566895f` (`items-journal-7`) |
| Declared changes handed to the live-test workflow | D-I1, D-I2, D-I3 (and the additive D-I4) — §5, deploy steps §9 |
| `module.json` edits appended to `wave7-restart-batch.md` | already listed (importer row); the glue test reads the real `module.json` flags, so the batch needs no test edit |
| Adjustments rows appended to `adjustments-batch.md` | the `dnd5e-importer-gate` files move landed with 4a (marked there) |
| Still failing, and why | **C07** only — `flags.pentaryn` tier/namespace/flagScope/cssPrefix wait for the Wave 7 restart batch. Warnings: C02 (minimum 13, Wave 7), C10 (`api.mjs` 361/300, `documents-adapter.mjs` 537/500 — the readback assertions and the orchestrator moved verbatim), C36 (assertion-message English, accepted §1), C59 (per-actor awaited writes, by design: each actor is asserted before the next) |
| Departures from this guide | step 4b also prefixes the in-group summary lines (C25 counts them) and keeps `console.log` level through a sink; step 5's `reg.once` became `Hooks.once` (`28f3726`) because C50 reads only that form; step 6 adds no `inspect` (no new features), and `selftest` checks module.api, the root's `import`, the gate flags and (from step 7) `game.pentaryn.importer`; step 7 merges the legacy keys **before** `publishNamespace`, so a `pentaryn.ready` listener already sees `import`; the step-2/3 tests went into new files (`version-gate.test`, `sites.test`) so the frozen `core.test` text never changed; C18 is n/a in the scorer now (the §8 gap is closed) |
