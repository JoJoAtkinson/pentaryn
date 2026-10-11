---
title: "Code audit 2026-10 — pentaryn-importer"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-importer

**Read this when:** you are about to refactor, harden or document pentaryn-importer and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-importer

**Purpose.**

Stage 2 of the actors.json pipeline. It upserts generated NPC Actors, gated three ways on version (manifest, module.json flags, live game), runs an @ref formula lint, checks readback assertions on displayed labels, and stamps contentHash last. It never recreates an Actor and never writes img, texture or hp.value.

**Health.**

The code is the most defensive in the repo. Errors are typed, logging goes through a TAG and log/warn/err helpers, and the result object is structured. But it has no tests at all (ModuleSpec check=_STATIC): `_internals` is exported, but no runner exists. One 1242-line file mixes pure logic and Foundry I/O. The 'shout then throw' sequence is pasted 9 times, and two strip-key arrays are identical. Doc drift: it cites a nonexistent playbooks/foundry-vtt.md five times, the cloneJson comment contradicts its code, and the README is still status: draft and says 'not run against a live Foundry'. Its ready hook replaces and freezes the shared game.pentaryn namespace. That is the root cause of 19 guard copies and setTimeout ordering in other modules.

**LLM interface.**

game.pentaryn.import(options) returns a clear ImportResult on success and throws PentarynAbort or PentarynAssertionError on refusal. It lives at the top level of the shared namespace beside moduleId, contract and _internals, so an LLM enumerating Object.keys(game.pentaryn) sees importer internals mixed with module namespaces. Target state: keep the top-level aliases, and also publish game.pentaryn.importer = {import, contract, describe, _internals}. Merge into game.pentaryn instead of freezing it. Add a re-entrancy guard so an LLM retry cannot run two imports at once.

**How to extend.**

Contract changes go in CONTRACT.md first. Then edit FORMULA_GLOBS, the payload strip lists or the assertion blocks in pentaryn-importer.mjs. Today there is no test to prove a change preserves behaviour. After items-journal-2, pure changes go in importer-core.mjs with fixtures in test/run.mjs, and config.py adds node-test to the importer's checks.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| items-journal-7 | Performance gains | low | S | findActorBySlug scans every world actor once per manifest entry |
| items-journal-2 | Maintainability gains | high | M | Importer has no test runner: extract importer-core.mjs and gate it with node-test |
| items-journal-3 | Defragmentation | medium | S | 'shout(message); throw new X(message)' is pasted ten times; strip-key arrays are identical |
| items-journal-4 | Hardening | medium | S | importActors is not re-entrant: two concurrent calls race on the same actors |
| items-journal-1 | Extendability | high | S | Importer replaces and freezes the shared game.pentaryn namespace; merge instead |
| items-journal-5 | LLM interface | medium | S | Importer's keys sit at the top of the shared namespace; give it an 'importer' sub-namespace and describe() |
| items-journal-6 | Documentation / skills | low | S | Importer cites a nonexistent playbook path, a comment contradicts its code, README is stale |

## Performance gains

### items-journal-7 — findActorBySlug scans every world actor once per manifest entry

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:834`

**Anchor:** `` return game.actors.find(a => foundry.utils.getProperty(a, `flags.${FLAG_SCOPE}.slug`) === slug); ``

**Current.**

findActorBySlug (833-835) is called per manifest entry (~1042) and walks game.actors with getProperty: O(entries x world actors). The per-item identity check at 1092-1095 does the same over actor.items.

**Proposed.**

Add pure `indexBySlug(actors)` to importer-core.mjs: Map of slug -> first actor (first wins, same as Array.find; skip falsy slugs). Build once before the manifest loop (~1022) and replace findActorBySlug(slug) with bySlug.get(slug); after a create (~1065) call bySlug.set(slug, actor) if absent so a duplicate slug later in the manifest finds it.

**Behaviour test recipe (write first, must pass before and after).**

importer-core test: indexBySlug([{id:'1',flags:{pentaryn:{slug:'a'}}},{id:'2',flags:{pentaryn:{slug:'a'}}},{id:'3',flags:{}}]).get('a').id==='1'; has(undefined)===false; size===1. Optional heavier characterisation (needs the stub set from items-journal-4 plus an ActorClass.create stub pushing into a fake game.actors): a manifest listing slug 'a' twice yields created=['a'] and updated=['a'] before and after.

**Risk.** A cached index misses actors created concurrently by something else; items-journal-4 removes the concurrent-import case.

**Related:** items-journal-4

## Maintainability gains

### items-journal-2 — Importer has no test runner: extract importer-core.mjs and gate it with node-test

**Category:** Maintainability gains · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:1239`

**Anchor:** `_internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise })`

**Current.**

1242 lines holding the version gate (372-438), @ref lint (455-503), payload stripping (528-580) and readback comparison (valuesMatch 590s) with no tests and no test/ dir. scripts/foundry/ops/config.py:311 registers `ModuleSpec("pentaryn-importer", check=_STATIC)` (static gates only). The pure functions share a file with fetch/game/ui code, so node cannot import them.

**Proposed.**

Create importer-core.mjs with no Foundry globals: CONTRACT_ID, FORMULA_OK, FORMULA_GLOBS, FORMULA_PATTERNS, STRIPPED_KEYS, PentarynError/Abort/AssertionError, isPlainObject, normalise, cloneJson, walkStrings, walkLeaves, valuesMatch, assertionMessage, lintFormulas, preparePayload, toUpdatePayload, toCreatePayload, a local `getPath(obj,path)` replacing foundry.utils.getProperty at lines 474 and 532 only, and a new `versionProblems(manifest, expected, live)` extracted from assertVersionGate (live={systemId,systemVersion,generation,version}). assertVersionGate becomes: problems=versionProblems(...); if (problems.length) { shout(...); throw }. Keep foundry.utils.getProperty in the Document glue (assertValue callers at 652, 727, 736-805, 1092-1102), which walks live documents. Add test/run.mjs and change config.py:311 to check=(*_STATIC, "node-test").

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-importer/test/run.mjs importing ../importer-core.mjs. Write the assertions first against pasted copies of the current functions, then switch the import. valuesMatch: (3,'3')->true, (3,'3.0')->true, (3,'x')->false, (3,Infinity)->false, (true,'true')->false, (null,undefined)->true, (null,0)->false, ('DC 13','DC 13 ')->true, ('a  b','a b')->true, ('x',undefined)->false. lintFormulas([{flags:{pentaryn:{slug:'s'}},system:{attributes:{hp:{formula:'2d8+@abilities.con.mod'},movement:{walk:'30',units:'ft'}}},items:[{system:{activities:{abc:{attack:{bonus:'+4'}}}}}]}]) -> exactly [{slug:'s',path:'system.attributes.hp.formula',value:'2d8+@abilities.con.mod'}]. preparePayload({name:'X',img:'i',_id:'1',expected:{actor:{}},prototypeToken:{texture:{src:'a'},width:1},items:[{name:'I',img:'j',_id:'2',expected:{}}],flags:{pentaryn:{slug:'x'}}}) -> data lacks img/_id/expected/items, data.prototypeToken deep-equals {width:1}, items[0] deep-equals {name:'I'}, expected deep-equals {actor:{}}, slug 'x'; missing slug throws err.name==='PentarynAbort'. toUpdatePayload({system:{attributes:{hp:{value:5,max:9}}},flags:{pentaryn:{contentHash:'h',slug:'x'}}}) -> hp {max:9}, flags.pentaryn {slug:'x'}. versionProblems with manifest{$contract:'pentaryn/actors.json@1',targetSystem:'dnd5e',targetSystemVersion:'6.0',generation:14,actors:[]}, expected{contract:'pentaryn/actors.json@1',targetSystem:'dnd5e',targetSystemVersion:'6.0',generation:14}, live{systemId:'dnd5e',systemVersion:'6.0.6',generation:14} -> []. Same but manifest.targetSystemVersion='5.3' (expected stays '6.0') -> length 2 (live-minor mismatch and module.json mismatch); assert both strings equal the current template text verbatim. FORMULA_PATTERNS.length===25 (counted in snapshot).

**Risk.** getProperty -> getPath only for plain JSON dotted paths; Document readback glue keeps foundry.utils.getProperty. Message strings are pinned verbatim by the fixtures. A missed import in the entry point is caught by the existing `imports` static gate.

**Related:** items-journal-3, items-journal-7

## Defragmentation

### items-journal-3 — 'shout(message); throw new X(message)' is pasted ten times; strip-key arrays are identical

**Category:** Defragmentation · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:622–627`

**Anchor:** `function assertValue(ctx) {`

**Current.**

Verified sites of shout(message) followed by a throw: 445 (PentarynAbort, version gate), 500 (Abort, lint), 987 (Abort, non-GM) and PentarynAssertionError at 625, 668, 701, 746, 794, 894, 1110 (7 assertion sites). Line 1029 shouts and rethrows a preparePayload Abort. STRIPPED_ACTOR_KEYS (169) and STRIPPED_ITEM_KEYS (170) are the same literal array.

**Proposed.**

Add `function refuse(ErrorClass, message){ shout(message); throw new ErrorClass(message); }` and `function failAssertion(ctx){ refuse(PentarynAssertionError, assertionMessage(ctx)); }`. Use failAssertion at the 7 assertion sites (builders that already call assertionMessage inline), refuse(PentarynAbort, message) at 445, 500, 987. Leave 1029 as is. Replace the two arrays with one STRIPPED_KEYS and keep both old names as aliases. Do not change message text. The helpers stay in the entry point (they need ui); the class definitions move to the core per items-journal-2.

**Behaviour test recipe (write first, must pass before and after).**

In test/run.mjs import the entry point under stubs (globalThis.Hooks={once(){},on(){}}, globalThis.ui={notifications:{error(m,o){calls.push([m,o])}}}, console.error spy, game stub if needed) and import STRIPPED_KEYS/assertionMessage from the core. Call failAssertion({slug:'s',action:'a',activityId:'id1',path:'p',expected:1,actual:2,hint:'h'}) in try/catch: err.name==='PentarynAssertionError', err.message === 'READBACK ASSERTION FAILED — aborting the whole run.\n  where:    actor "s" → item "a" → activity id1\n  path:     p\n  expected: 1\n  actual:   2\n  hint:     h'. Exactly one notification whose text starts with '[pentaryn-importer] ' and options deep-equal {permanent:true, console:false}. refuse(PentarynAbort,'m') throws err.name==='PentarynAbort'. STRIPPED_KEYS deep-equals ['expected','_id','img','folder','_stats','ownership']. Mapping guard: a source-grep assertion that the file contains 3 `refuse(PentarynAbort` and 7 `failAssertion(` call sites.

**Risk.** Swapping Abort for AssertionError changes which errors the per-actor catch at ~1127-1130 rethrows. Keep the class at each site exactly as listed; the grep-count assertion keeps the mapping honest.

**Related:** items-journal-2

## Hardening

### items-journal-4 — importActors is not re-entrant: two concurrent calls race on the same actors

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:975`

**Anchor:** `async function importActors(options = {}) {`

**Current.**

Nothing prevents a second import() while the first is awaiting fetch/Actor.update/replaceItems (e.g. an LLM retry after an eval-js timeout). Both read the same stored contentHash (stamped only at stampContentHash, ~1120) and both replace the managed items, which can leave duplicate managed items and a confusing readback failure.

**Proposed.**

Module-level `let running = false;`. After the GM check in importActors: `if (running) throw new PentarynAbort('An import is already running; await it or reload.');` then wrap the remaining body in try { running = true; ... } finally { running = false; }. Intentional behaviour change for the concurrent case only; sequential calls are unchanged. Optional read-only `running()` for LLM polling.

**Behaviour test recipe (write first, must pass before and after).**

In test/run.mjs (entry point under stubs): game {user:{isGM:true}, world:{id:'w'}, modules:{get:()=>({flags:{pentaryn:expected}})}, system:{id:'dnd5e',version:'6.0.6'}, release:{generation:14}, actors:[]}, foundry.utils.getRoute=p=>'/'+p, getDocumentClass stub, globalThis.fetch resolving after a 10 ms timer with a valid empty-actors manifest. Characterise first: `const a=importActors({dryRun:true}); const b=importActors({dryRun:true})` both resolve ok:true today. After the change: await b rejects with name 'PentarynAbort', (await a).ok===true, and a third sequential call succeeds. A single sequential call returns a result whose JSON.stringify is identical before and after.

**Risk.** The only observable change is a concurrent second call throwing. If the first call throws, finally resets the flag, so a failed run never blocks later ones (add a fixture for that).

## Extendability

### items-journal-1 — Importer replaces and freezes the shared game.pentaryn namespace; merge instead

**Category:** Extendability · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:1233–1241`

**Anchor:** `game.pentaryn = Object.freeze({`

**Current.**

The importer's ready hook (1232-1242) assigns a new frozen object to game.pentaryn, wiping anything published earlier. Every other module copies a guard (`if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, <ns>: api }`) and defers with setTimeout(0): attunement.mjs:862-875, dropbin.mjs:266-291, journal.mjs:595-605, creatures.mjs:341-356, ties:461-464, movement:404-425, transform:777-785, names:51-58, riders:649. Verified by grep: no code reads Object.isFrozen/isExtensible except those guards. APIs are therefore absent for one tick after ready.

**Proposed.**

Extract `publishImporter(root)` (exported, callable from the ready hook): `root.pentaryn ??= {}; Object.assign(root.pentaryn, { import: importActors, moduleId: MODULE_ID, contract: CONTRACT_ID, _internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise }) });`. Keep _internals frozen, stop freezing the namespace. Guards then always take the else branch; delete them and the setTimeout wrappers later, one module per commit, each with its own check run. Optional: Hooks.callAll('pentaryn.published', ns, api).

**Behaviour test recipe (write first, must pass before and after).**

New foundry/module/pentaryn-importer/test/run.mjs (see items-journal-2) with the check(name,got,want) idiom. Cases: (1) root={} -> Object.keys(root.pentaryn) equals ['import','moduleId','contract','_internals'], contract==='pentaryn/actors.json@1', moduleId==='pentaryn-importer', Object.isFrozen(root.pentaryn._internals)===true (pin before the change by running the current hook body against a stub game). (2) root={pentaryn:{aoe:{x:1}}} -> aoe preserved and import is a function (today aoe is lost). (3) paste the attunement.mjs:868-873 guard verbatim and run it after publishImporter: both attunement and import present. (4) guard first, publishImporter second: both present.

**Risk.** Object.isFrozen(game.pentaryn) becomes false; nothing reads it. Console scripts doing game.pentaryn = {...} are unaffected. Cases 3/4 prove both publish orders keep every key.

**Related:** items-journal-16, items-journal-5

## LLM interface

### items-journal-5 — Importer's keys sit at the top of the shared namespace; give it an 'importer' sub-namespace and describe()

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:1235–1239`

**Anchor:** `import: importActors,`

**Current.**

game.pentaryn.import, .moduleId, .contract and ._internals are top-level siblings of aoe, ties, journal. import() throws on refusal (PentarynAbort/PentarynAssertionError) but returns {ok:false, failed:[...]} for per-actor failures; that two-channel contract is documented only in the README Errors section.

**Proposed.**

Additive only. Also publish `importer: { import: importActors, contract: CONTRACT_ID, moduleId: MODULE_ID, describe, _internals }` and keep the top-level aliases. describe() returns a static object {name:'importer', contract, version:'1.1.0' (matches module.json), methods:[{name:'import', args:'{path?,dryRun?,only?,force?,timeout?,unmanagedItems?}', returns:'ImportResult', throws:['PentarynAbort','PentarynAssertionError'], gmOnly:true}]}. Add a 'For an LLM' README paragraph: run dryRun first; Abort means nothing written, Assertion means a partial batch.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: after publishImporter(root): root.pentaryn.importer.import === root.pentaryn.import, importer.contract === root.pentaryn.contract, describe().methods[0].name==='import'; JSON.stringify(describe()) compared to a pinned literal so edits are deliberate. Also check describe().version === the version in module.json (read with fs).

**Risk.** Purely additive; the aliases keep `game.pentaryn.import()` and make foundry-import working.

**Related:** items-journal-1

## Documentation / skills

### items-journal-6 — Importer cites a nonexistent playbook path, a comment contradicts its code, README is stale

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-importer/pentaryn-importer.mjs:9`

**Anchor:** `` * The rationale for the pipeline shape is `playbooks/foundry-vtt.md` (D3, D8, D10). ``

**Current.**

(a) Line 9 cites `playbooks/foundry-vtt.md`, which does not exist (no playbooks/ dir in the repo); lines 347, 847, 1147, 1192 say only 'playbook D8 / Stage 2'. The README line 16 correctly points to context/plans/foundry-content-pipeline.md. (b) Comment at 242-243 says 'structuredClone is both faster...' but cloneJson (245) is JSON.parse(JSON.stringify()). (c) README front matter says `status: draft` and lines 239-247 say it 'has not been run against a live Foundry' while line 18/228 record dnd5e 6.0.6 verification and a 1.1.0 changelog. (d) README examples hard-code the 'ardenhaven' world (lines 12, 51, 73, 83, 84, 101, 137-145) though the code defaults to worlds/<game.world.id>/actors.json. (e) Broken ` *` comment line at 122.

**Proposed.**

Replace the line-9 path (and the bare 'playbook' mentions) with context/plans/foundry-content-pipeline.md, keeping D-numbers. Fix the cloneJson comment to say JSON round-trip; do NOT change the code (structuredClone keeps undefined/Date and would change payloads). Update README status and verification section; use `<world>` in examples. Fix line 122 to ` *`.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Add scripts/tests/test_docs_links.py: every backticked repo-relative path ending in .md/.mjs/.json in foundry/module/*/README.md and in /** header comments of module .mjs files must exist on disk, with an allowlist for Data/ and world paths. Today it would flag playbooks/foundry-vtt.md (and playbooks/foundry-wall-autocomplete.md in pentaryn-walls, which also does not exist in the repo: add to the allowlist or fix). Run in the live tree.

**Risk.** None at runtime. The trap is 'fixing' cloneJson to structuredClone.

## Categories checked with no finding

- **Logging / auditability:** checked. The importer has TAG-prefixed `log`/`warn`/`err` helpers (`pentaryn-importer.mjs:213–215`) and `shout()` for permanent toasts (222–224). It prints a full console summary per run (1192–1214: created, updated, skipped, and failed with `console.table`), and every abort carries the assertion that failed. Nothing found.
