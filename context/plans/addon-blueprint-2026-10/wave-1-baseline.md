# Wave 1 baseline (2026-10-11, branch migrate/wave-1)

Live: Foundry v14.369, world pentaryn, dnd5e 6.0.6. World backup taken before the wave:
`world-2026-10-11-093631-fvtt14.369.tar.gz` (3234.6 MB, reason migrate-wave-1). After `make foundry-up` and
`make login WORLD=pentaryn`, one GM tab connected: `game.pentaryn` exists, 19 pentaryn-* modules active.
Browser console was not readable from the login tab; only a live-eval check was done (no red errors observed in the
bridge, none reported).

All existing tests pass on today's code. No baseline failures, nothing fixed.

`node test/run.mjs` = `node foundry/module/<m>/test/run.mjs`. Make check = `make foundry-<m>-check`
(walls: `foundry-walls-test`; importer and pings have no make target). Coverage = line / branch / funcs %
from `node --test --experimental-test-coverage test/run.mjs` (ties: the three test files). Suites are
self-running scripts, so node:test reports no pass/fail counts; coverage is a gap finder only.

| Module | run.mjs | make check | Conformance | Coverage (line/branch/funcs) |
|---|---|---|---|---|
| aoe | 160 pass | pass | 45.2 % (19/42) | - |
| attunement | 35 pass | pass | 56.4 % (22/39) | 49.19 / 100 / 26.47 |
| combat | 320 pass | pass | 45.2 % (19/42) | - |
| creatures | 73 pass | pass | 53.7 % (22/41) | - |
| cursors | 84 pass | pass | 53.7 % (22/41) | 100 / 96.77 / 100 |
| dropbin | 40 pass | pass | 50.0 % (21/42) | 96.38 / 97.87 / 83.33 |
| importer | none (no test dir) | none | 63.9 % (23/36) | 0 (no tests) |
| journal | 81 pass | pass | 46.3 % (19/41) | 98.16 / 79.63 / 97.06 |
| lookup | 43 pass | pass | 64.9 % (24/37) | 98.97 / 81.95 / 92.86 |
| movement | 89 pass | pass | 53.7 % (22/41) | 100 / 94.06 / 100 |
| names | none (no test dir) | pass (parse/imports/i18n only) | 64.1 % (25/39) | 0 (no tests) |
| pings | none (no test dir) | none | 62.2 % (23/37) | 0 (no tests) |
| portals | 52 pass | pass | 51.3 % (20/39) | - |
| prompts | 415 pass | pass | 50.0 % (21/42) | 98.92 / 79.59 / 97.33 |
| riders | 103 + 22 + 39 pass | pass | 45.2 % (19/42) | - |
| senses | 31 + 100 + 25 pass | pass | 43.9 % (18/41) | - |
| ties | known 183, look 9, reach all passed (test/*.mjs, not run by make; ties check = parse/imports/i18n pass) | pass | 43.9 % (18/41) | 61.44 / 84.58 / 53.65 |
| transform | 147 pass | pass | 48.8 % (20/41) | - |
| walls | 49 pass | pass (foundry-walls-test) | 60.5 % (23/38) | 86.02 / 88.25 / 86.46 |

Coverage was only requested for wave-1 and wave-2 modules; "-" = not measured.

Conformance: all 19 modules score as tier "full" today. Most common failing rules: C07, C14, C20, C27, C28, C40,
C44, C45 (19 modules each). Full per-module failing lists: `python3 scripts/foundry/blueprint/conformance.py --markdown`.

Notes
- importer, names and pings have no tests at all; characterisation per their guides will create the first ones.
- attunement has low function coverage (26 %) and ties 54 %: the gaps to fill when characterising.

## Live goldens and performance baseline (before any refactor)

One eval-js script per module in `scripts/foundry/live-goldens/<m>.js` (importer, names, pings, cursors,
ties, prompts). Each is the body of an async function: paste it as the `script` of the foundry `eval-js`
MCP tool (timeoutMs 60000) on the GM tab. It drives the module's real glue in the live world, returns a
JSON **string** (the eval bridge truncates nested objects at a fixed depth, so an object result comes back
as `[max depth]`), and deletes its `ZZ …` scratch documents in `finally`. Outputs of the 2026-10-11 run:
`.state/live-goldens/before/<m>.json` (git-ignored). Every run ended with `zzLeft: 0`.

`golden` is deterministic: ids are replaced by labels (`<scene>`, `<actor>`, `<tokFull>`, `<marker-mid>`, …),
`t` / `at` / `age` / `ms` / `generatedAt` are dropped and ISO dates in gather text become `<date>`.
Two things in it are world content and may drift without a code change: ties' picked registry entry
(first id in sort order, today `araethilion`, `loreCount` 1, registry 28 entries) and the root key list.

Side effects that cannot be undone from outside the module: pings leaves its scratch records (1 + 5 timing
pings per run) in the world's ping ring, named "ZZ live-goldens pings" — the module keeps a private buffer,
so restoring the setting would be overwritten by the next flush, and `clear()` would drop real history.
names raises its own "Token labels updated" toasts on the GM screen. prompts' `lastCalls` ring is saved and
written back (verified `ringRestored: true`); cursors restores the GM's control and tool.

### Timings (median per call, GM tab, Chrome, document visible)

`performance.now()` is ~0.1 ms coarse in the GM tab, so fast calls are timed as `reps` back-to-back calls
per sample (`n` samples). Round trips include the script's own 10 ms polling.

| Module | What | n × reps | Median ms |
|---|---|---|---|
| importer | `import({dryRun:true})` default path (404 abort) | 5 × 1 | 1.3 |
| importer | `import({dryRun:true})` synthetic 3-actor manifest | 5 × 1 | 0.3 |
| names | rename → every label written → toast (round trip) | 5 × 1 | 39.3 |
| names | `relabel` | 9 × 10000 | 0.0001 |
| names | `sync` with nothing to relabel (scans every scene) | 5 × 20 | 0.005 |
| pings | patched `handlePing` (1 record + 49 de-duplicated) | 5 × 50 | < 0.004 |
| pings | `last()` | 9 × 200 | 0.001 |
| pings | `recent(10)` | 9 × 50 | 0.002 |
| cursors | `refresh()` (target tool) | 9 × 100 | 0.007 |
| cursors | tool switch via `ui.controls.activate` until `current()` changes | 6 × 1 | 0.1 |
| ties | `attributes.resolve(title)` | 9 × 200 | 0.040 |
| ties | `attributes.describe(id)` | 9 × 200 | 0.055 |
| ties | `attributes.of(actor)` (3 rows) | 9 × 100 | 0.058 |
| ties | `attributes.ids(actor)` | 9 × 100 | 0.001 |
| ties | `attributes.list()` | 9 × 200 | 0.018 |
| prompts | `gather` 1 scene, 1 prompt, 1 built, crops off | 5 × 1 | 1.4 |
| prompts | `model(sceneId)` | 9 × 5 | 0.08 |
| prompts | `status()` | 9 × 50 | 0.038 |
| prompts | `list()` (every world scene) | 9 × 5 | 0.02 |

### What the live run shows (summary)

- importer: default-path dry run throws `PentarynAbort` "HTTP 404 Not Found for /worlds/pentaryn/actors.json…"
  (nothing staged; this path raises no toast). Synthetic manifest via a one-URL fetch shim: created
  `zz-golden-new`, updated `zz-golden-changed`, skipped `zz-golden-same`, `assertions: 0`,
  `deleteJson.required: false`; `only` selects 1, `force` turns the skip into an update; nothing written.
- names: two unlinked tokens (full label, short label) → `Token labels updated to "ZZ Brakka, Golden Elder" (3).`,
  one toast, labels `ZZ Brakka, Golden Elder` / `ZZ Brakka`; img-only and same-name updates → 0 toasts;
  a nickname (`Fishface`) is left alone and the count drops to 2.
- pings: record `{userId, userName, sceneId, sceneName, x:1050, y:850}` decorated to image `{50,50}`,
  gridSquare `{0,0}`, snapped `{1000,800}`; a same-spot repeat inside 400 ms is de-duplicated.
- cursors: select → `null` and no variables; target / ruler / note / draw → the key, `data-pentaryn-cursor`, and
  the four variables as `image-set(url("/modules/pentaryn-cursors/assets/cursors/<key>[-pointer].png") 1x, …@2x 2x) <hx> <hy>, <fallback>`.
- ties: surface 25 top-level keys, known 11, study 35, attributes 27. `attributes.lookup` and `study.examine`
  (D1) do not exist yet. Linking `Araethilion` to a ZZ npc → `ids` `[type:humanoid, size:med, araethilion]`,
  `of()` authored first.
- prompts: `status()` version 0.4.3, npcBridge true, doubleClick `libWrapper`, party "none set". Gather →
  counts `{scenes 1, prompts 1, built 1, encounters 1, alone 0}`, `E1: p1 + built t1`, `<sees>t1 10 E reach</sees>`,
  the description stripped of HTML and cut at a sentence with ` [...]`.

### Stub-fidelity findings (live result vs what the unit tests or the guides' planned stubs assume)

| # | Module | Live result | Stub / test assumption | Consequence for characterisation |
|---|---|---|---|---|
| SF1 | importer (all) | After every module's ready, `game.pentaryn` is **not** frozen and is extensible. Publish order: `import, moduleId, contract, _internals` (importer), then `rules` (pentaryn-lookup rebuilds by spread into a plain object), then names, pings, senses `chain`, ties, …, riders. | importer guide step 1 pins the root as frozen after ready. | Assert "frozen" only right after importer's ready in the glue test; never in a whole-boot test. The guide's `// KNOWN:` wipe row ("`aoe` set before ready is gone") never happens live, because importer's ready runs first. |
| SF2 | all six | `game.modules.get(<id>).api` is `undefined` for every module. | — | Matches today's code; step 5/6 goldens should pin it flipping. |
| SF3 | pings | Read lag is **state-dependent**. `game.settings.get("pentaryn-pings","log")` returns the same cached array on every call, and `buffer` is that array from `ready` until the first flush (which replaces it — verified) or the first cap trim (`slice`). In the first run (ring 49 < max 50) `last()` returned the unflushed ping at once; in the second (ring at cap) it lagged until the 250 ms flush. | Guide step 1 (-39): "`recent(1)` is still empty before the flush" as a fixed `// KNOWN:` row. | A stub whose `settings.get` returns a copy shows lag always; live shows none until the first flush or cap. Pin both cases, with a `settings.get` stub that returns the stored reference. |
| SF4 | pings | `handlePing` is patched on `ControlsLayer.prototype` (depth 1 from the instance) and the original returns a Promise. With `options.scene` not the viewed scene, core draws nothing, but the module still records (it records before calling the original). | Guide stub: `prototype.handlePing` that records its calls. | Make the stub `async`. The ping is recorded even when core ignores it, so pin that. |
| SF5 | pings | Foundry's `scene.dimensions` for 4000×3000, padding 0.25, grid 100: `sceneX 1000, sceneY 800` = the module's `imageOffset`. | Guide fixture `{x:1000, y:800}`. | Confirmed: the fixture is right. |
| SF6 | names | Tokens of a fresh npc are unlinked (`actorLink:false`, synthetic actors). Renaming the base actor relabels every unlinked token carrying its `actorId` (count = prototype + 2). | Guide `// KNOWN:` sibling row (N-L1, left for the live test). | Live confirms today's behaviour: two unlinked siblings are both relabelled. The decision stays N-L1. |
| SF7 | names | A same-name `actor.update({name})` and an img-only update raise no toast and relabel nothing. The run does not show whether Foundry dropped the unchanged `name` from the diff or the handler's `changes.name !== actor.name` guard stopped it. | Guide glue stub fires `preUpdateActor` with `{name:"Bob"}` unchanged and expects options untouched. | Outcome agrees. If the glue test wants to know which layer stops it, it needs one live probe of `preUpdateActor`'s `changes`. |
| SF8 | cursors | Chrome supports `image-set()` in `cursor`, so live always takes the image-set branch. `#board` is a `CANVAS`, its `style.cursor` stays `var(--cursor-default)` for every tool, and `:root --cursor-default` is `default`. `ui.controls.activate` updates `current()` before its promise resolves (the onChange wrapper, not `renderSceneControls`). | `test/run.mjs` covers both branches of `cursorValues`. The guide's glue stub has `currentCursor: null`. | No gap in the core tests. The glue test should pin the image-set branch as the live one and drive tool changes through `onChange`. |
| SF9 | ties | `attributes.describe` returns two shapes: an authored entry is the whole registry record spread (24 keys, including `createdAt`, `modifiedAt`, `reviewedAt`, `reviewedSnapshot`, `touched`, `whenKnown`, `whenCarried`), while a derived/unauthored id gets 10 keys. Derived titles come from `CONFIG.DND5E` (`size:med` → "Medium", category "Size"; `type:humanoid` → "Humanoid", category "Creature type"). | The ties tests cover `deriveAttributes`/`attributeIdsFor` (pure) only; no test pins `describeAttribute`'s shape or `derivedTitle`. A stub without `CONFIG.DND5E` would title-case "Med". | D1's `attributes.lookup` alias must return the same two shapes. Characterise both shapes with a `CONFIG.DND5E` stub. |
| SF10 | ties | Top-level `ties.describe` is the description-card toggle, a different thing from `ties.attributes.describe`. | — | Relevant to D1: the rename is `attributes.describe` → `attributes.lookup` only; the top-level `describe` is not part of it. |
| SF11 | prompts | Live scenes use Foundry's default padding 0.25 (2000×1500 → `sceneX 500, sceneY 400`); `at=` / `atFt` subtract it (marker at canvas 1000,900 → `28,28 ft`). | `test/fixtures.mjs`: "no padding (sceneX = sceneY = 0)". | The node suite never exercises the padding offset. Add one padded fixture when characterising the model glue. |
| SF12 | prompts | Built descriptions are HTML (`<p>` paragraphs joined with `\n`). `model()` keeps the raw HTML (893 chars), and the gather text strips it, joins paragraphs with ` / ` and cuts at the last sentence end ≤ chars + ` [...]`. | Fixtures use plain-text descriptions. | The HTML-strip path is unpinned by the suite. Pin it before D6 changes the suffix. |
| SF13 | prompts | The gather's `chars` default has three sources: the world setting `gatherChars` = 400 (registered default 400), `gather.mjs`'s fallback `setting("gatherChars", 160)`, and `renderGather`'s default 400. Live uses 400. | Tests call `renderGather(view)` (400). | D6 unifies these. Today's 160 fallback is reachable only if the setting read throws. |
| SF14 | prompts | The call id is a 16-bit FNV hash (`pm-xxxx`) of scene + marker + prompt text only, so `chars` 400 and 160 give the same call. The ring de-duplicates by call, so the second gather replaced the first manifest. | — | Pin it: a re-gather with other options overwrites the earlier manifest. |
| SF15 | prompts | A dnd5e 6.0.6 npc created bare is CR 1 (XP 200), AC 10, and its token is hostile; the marker token gets `hidden`, `lockSize`, tint `#ffffff` and nameplate `✎ <first 40 chars>…` from `preCreateToken`. | Fixtures set these explicitly. | No gap; recorded for the glue stubs. |

## After Stage 0 (2026-10-11, integration)

Scored with `./.venv/bin/python scripts/foundry/blueprint/conformance.py --json` at the integration
commit that added C53–C61 (playbook §5.9). Three columns so the moves can be told apart:

- **Wave start**: the table above (rules C01–C52, before any lane).
- **Stage 0, C01–C52**: after lanes A, B and C (kit vendored and checkpoints for six modules; D2, D4
  and D7 scorer changes), same rule set — the like-for-like move.
- **Stage 0, C01–C61**: the same tree with the async rules. C53, C55, C56 and C58 are fail-class
  and pass when a module has nothing to check (no veto listener, query, `CONFIG.queries` write or
  `serialStore`), so most modules gain 4 passes and their percentage rises without a code change.
  C57 is n/a without a module socket channel. C54, C59, C60 and C61 are warnings and never move
  the score.

| Module | Wave start | Stage 0, C01–C52 | Stage 0, C01–C61 | New-rule hits |
|---|---|---|---|---|
| aoe | 45.2 % (19/42) | 45.2 % (19/42) | **50.0 % (23/46)** | C59 warn |
| attunement | 56.4 % (22/39) | 64.1 % (25/39) | **67.4 % (29/43)** | — |
| combat | 45.2 % (19/42) | 45.2 % (19/42) | **50.0 % (23/46)** | C59 warn |
| creatures | 53.7 % (22/41) | 53.7 % (22/41) | **57.8 % (26/45)** | — |
| cursors | 53.7 % (22/41) | 53.7 % (22/41) | **57.8 % (26/45)** | — |
| dropbin | 50.0 % (21/42) | 57.1 % (24/42) | **60.9 % (28/46)** | C59 warn |
| importer | 63.9 % (23/36) | 63.9 % (23/36) | **67.5 % (27/40)** | C59 warn |
| journal | 46.3 % (19/41) | 56.1 % (23/41) | **57.8 % (26/45)** | C56 fail |
| lookup | 64.9 % (24/37) | 73.0 % (27/37) | **75.6 % (31/41)** | — |
| movement | 53.7 % (22/41) | 63.4 % (26/41) | **66.7 % (30/45)** | — |
| names | 64.1 % (25/39) | 64.1 % (25/39) | **67.4 % (29/43)** | — |
| pings | 62.2 % (23/37) | 62.2 % (23/37) | **65.9 % (27/41)** | — |
| portals | 51.3 % (20/39) | 53.8 % (21/39) | **58.1 % (25/43)** | C59 warn |
| prompts | 50.0 % (21/42) | 54.8 % (23/42) | **56.5 % (26/46)** | C56 fail, C59 warn |
| riders | 45.2 % (19/42) | 45.2 % (19/42) | **47.8 % (22/46)** | C56 fail, C59 warn |
| senses | 43.9 % (18/41) | 46.3 % (19/41) | **51.1 % (23/45)** | — |
| ties | 43.9 % (18/41) | 50.0 % (21/42) | **55.3 % (26/47)** | C59 warn |
| transform | 48.8 % (20/41) | 48.8 % (20/41) | **53.3 % (24/45)** | C59 warn |
| walls | 60.5 % (23/38) | 68.4 % (26/38) | **71.4 % (30/42)** | — |

New-rule hits, for the module guides (all existing behaviour, none fixed here):

- **C56 fail** — hand-written `CONFIG.queries`: journal `journal.mjs:547`, prompts `prompts.mjs:272-277`
  (five `guarded` rows), riders `riders.mjs:640`. Each goes through manifest `query: true` /
  `relay: true` rows when that module's API step lands.
- **C59 warn** (per-document await in a loop) — aoe, combat, dropbin, importer, portals, prompts,
  riders, ties, transform; review each at that module's refactor (some are deliberate sequencing).
  A per-parent loop that awaits `parent.*EmbeddedDocuments` is the batch §5.9 prescribes and passes;
  the first count (11 modules, with names and senses) wrongly flagged those.
- C53, C54, C55, C57, C58, C60 and C61: no hits. Both existing `.query(` callers pass `timeout: 8000`;
  the two `createItem`/`createChatMessage` writers (attunement, riders) use the initiator gate
  `userId !== game.user.id`, which C61 accepts. That gate picks one *user*, not one tab (the 4373c04
  message's "counts as one client" means one user): every tab of the initiating user passes, so a
  GM-made change runs those reactions in both the MCP bridge tab and a GM browser tab. Like
  `isActiveGM`, it needs a claim where two tabs on one account matter; review this at the attunement
  and riders refactors (§5.9.4).
