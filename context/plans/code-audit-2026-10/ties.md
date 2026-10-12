---
title: "Code audit 2026-10 — pentaryn-ties"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-ties

**Read this when:** you are about to refactor, harden or document pentaryn-ties and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Re-anchored to 4e64f47 on 2026-10-11.** Since the snapshot (ee505c2) only commit 17275c9 (usability re-run, U-7-3, module 0.19.3 → 0.19.4) touched pentaryn-ties: `known-core.mjs` +41 lines at :1801 (`tablePCs`, `switchLabels`), `preview.mjs` +18 lines at :160–181 (`playerCharacters` now reads users and ownership), `README.md` +9 lines (0.19.4 section at :511), `test/known.mjs` +4 fixtures (179 → 183). Every other ties file is byte-identical to the snapshot, so their line numbers stand. Re-anchored: ties-20 (Where), ties-1, ties-9, ties-36, ties-40, ties-43, ties-44 (in-body lines and counts). Extended: ties-15 (a fourth `firstName` copy), ties-36 (new section landed mid-file), ties-43 (changelog now out of order). New: ties-46. Resolved / obsolete: none — the re-run fixed none of these findings. Live score unchanged at 43.9 % (18/41).

## Summary

### pentaryn-ties

**Purpose.**

One module holding about seven features:
- the directed ties graph (sheet tab, editor, add dialog, canvas cards and wires, relay for the reverse side);
- worn possession marks;
- the GM description card (key 9);
- the Known notebook tab;
- the study conduit: a blind GM-side roll, graded kind ladder, lore rows, hold/deliver, share/forget;
- the attribute registry, world-knowledge tree, identification cascade and Attribute Review panel;
- the GM inspect preview and the player Look window, plus item marks.
It exposes game.pentaryn.ties: about 20 top-level entries plus sub-objects known (12), study (about 40) and attributes (about 28).

**Health.**

Organisation:
- The pure core is good. known-core.mjs is Foundry-free and has 183 fixtures (179 in the snapshot). Data/UI layering is implicit but mostly respected (ties-api imports nothing).
- Five files are too large: study.mjs 2890 lines (11 sections), known-core.mjs 2433 (2392 in the snapshot), attributes.mjs 1303, attributes-ui.mjs 1043, and the entry point 1017. ties.css is 1945 lines.
- Duplication inside the module: esc ×11, t/f ×14, flagOf ×5, canSee ×3; the row-toggle binding ×6; open-state maps ×4; the pass/miss verdict ×6; three claim protocols; two live-window hook kits; three different mirror (reverse-side) semantics.
- Dead code: about 11 exports and 4 CSS rules.
Tests:
- Strong on the pure core.
- Never gated: config.py:117 runs static checks only and there is no test/run.mjs.
- The UI layer (editor, known binding, attributes-ui, tie-dialog save) is untested; the 2026-08 inert Attributes tab is the documented consequence.
Docs:
- Comments are very thorough design history, often 10–30 lines per function.
- The README is 520 lines mixing use-doc and changelog. attributes.md is 1004 lines.
- Several header comments have drifted from the published names.
Bloat risk: real. Every phase added a section to study.mjs and known-core.mjs instead of a file.

**LLM interface.**

Today:
- The only route is mcp__foundry__eval-js calling game.pentaryn.ties.*.
- Every function needs an Actor document; there is no id, name or uuid resolver.
- Reading one PC's full picture takes about 4 calls with 4 different return shapes: read → array, known.read → array, attributes.of → records, study.beliefs → rows with locale-string dates.
- There is no data read of what a PC knows about a given subject: study.look opens a window and returns null for a GM.
- attributes.of and ids are published without the kind resolver, so they silently differ from what the sheet and the planner see.
- eval.jsonl shows the cost:
  - 79 dynamic import()s of internal files (study.mjs 36, known-core.mjs 19, attributes.mjs 17, others 7);
  - calls to unpublished internals: A.describeAttribute 14, A.knowledgeTree 11, A.grantKnowledge 10, A.setKnowledge 5, S.factStatus (one failed with 'not a function');
  - raw flag reads: lore 43, attributes 19, conceal 8, studyTiers 6, plus a documented raw `granted` write recipe (attributes.md:591-596).
Should be:
- one `ties.dossier(ref)` aggregate read (ties-3), resolving id, uuid, name or token (ties-4);
- a table-driven API with `ties.help()` (ties-7);
- published aliases for the internals already in use (ties-6), and `study.knowsAbout` (ties-8);
- small named wrappers for lore rows, conceal and mark-as-learned (ties-9);
- consistent numeric timestamps (ties-10);
- optionally a GM-guarded CONFIG.queries['pentaryn-ties.dossier'] handler, so a typed fork tool can replace raw eval-js, as prompts already does.

**How to extend.**

Where things go today:
- A new sheet tab: add a spec to SHEET_TABS (pentaryn-ties.mjs:557). This is the one clean extension point.
- A new study namespace: add a branch to resolveFact (study.mjs:260), as designed.
- Anything else is unclear:
  - a new GM socket action needs a third game.socket.on;
  - a new pure rule gets appended to the 2433-line known-core.mjs;
  - a new API entry is hand-added to a 150-line object literal plus two header comments that already drift;
  - a new flag name is often a string literal (conceal, #inspect, kindOf, studyTiers, beliefs).
Needed:
- a README 'Architecture' table mapping each file to its layer;
- core/ and study/ folders behind barrel files, so import paths and LLM dynamic imports keep working;
- a socket action registry (ties-38) and an API table with a manifest (ties-7);
- gated node tests (ties-1), with an import-direction check (ties-45).

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| ties-19 | Performance gains | medium | M | registry() re-clamps the whole registry on every call; describeAttribute calls it per id |
| ties-24 | Performance gains | medium | M | Worn badges: rAF scheduled on players' clients and full PIXI rebuild every frame |
| ties-20 | Performance gains | low | M | planStep re-normalises registry and ledgers on every inner call |
| ties-21 | Performance gains | low | S | runCascade recomputes loop-invariant inputs each iteration |
| ties-22 | Performance gains | low | S | Ties tab scans every actor twice per paint (inbound in build and bind) |
| ties-23 | Performance gains | low | S | Known tab reads and clamps the registry once per notebook entry |
| ties-25 | Performance gains | low | S | Wire repaint queued on every refreshToken/sightRefresh even with no cards up |
| ties-26 | Performance gains | low | S | Sheet injection runs twice per actor-sheet render |
| ties-27 | Performance gains | low | S | personalCluesHTML scans every actor per personal row; the review panel already has the carrier map |
| ties-28 | Performance gains | low | S | GM Ties tab: kind picker scans all actors twice with literal flag names |
| ties-1 | Maintainability gains | high | S | ties test suites (200 cases) never run in make foundry-ties-check |
| ties-35 | Maintainability gains | medium | L | Split study.mjs (2890 lines, ~11 concerns) into study/ behind a barrel |
| ties-36 | Maintainability gains | medium | M | Split known-core.mjs (2433 lines) into core/ files behind the same barrel |
| ties-12 | Defragmentation | medium | S | Three different reverse-side (mirror) rules; extract the pure ones to ties-core.mjs |
| ties-13 | Defragmentation | medium | M | Flat-roll miss predicate duplicated in four places (narrowed from six) |
| ties-14 | Defragmentation | medium | S | Fact-key and flag-name string literals bypass the known-core grammar |
| ties-15 | Defragmentation | medium | M | Module-local util.mjs for helpers copied across ties files |
| ties-16 | Defragmentation | medium | M | Row expand/collapse binding x6 and open-state maps x4 -> row-ui.mjs |
| ties-17 | Defragmentation | low | S | Granted-card markup duplicated between the Attributes tab and the Known tab |
| ties-18 | Defragmentation | low | S | Notes-preview, notes-prose and word-cell fragments repeated 7x |
| ties-39 | Defragmentation | low | S | The 'two GM sessions' claim protocol is implemented three times |
| ties-40 | Defragmentation | low | S | Live-refresh hook kit duplicated between the Look window and the inspect preview |
| ties-41 | Defragmentation | low | S | Card record construction duplicated between show() and restorePinned() |
| ties-42 | Defragmentation | low | S | Dead exports, dead CSS and dead branches |
| ties-33 | Logging / auditability gains | medium | S | No debug channel; silent refusals and a computed-then-discarded outcome |
| ties-34 | Logging / auditability gains | low | S | Contract-mandated empty catches give no trace when debugging |
| ties-37 | Hardening | high | S | Field-drop guard: fixtures proving reader/writer literals name every stored field |
| ties-29 | Hardening | medium | S | Private core API in the blind roll, called after the claim with no release on throw |
| ties-30 | Hardening | medium | S | Whole-setting read-modify-writes of knowledge and attribute beliefs are not serialised |
| ties-31 | Hardening | low | S | Session-lifetime maps that are never pruned |
| ties-32 | Hardening | low | S | Unescaped values interpolated into markup (describe art, item-mark class) |
| ties-46 | Hardening | low | S | Inspect window's PC roster (U-7-3) is not refreshed when a player picks a character or ownership changes |
| ties-7 | Extendability | high | M | Table-driven API with a self-describing help() manifest |
| ties-38 | Extendability | medium | S | Two socket listeners on one channel; a new GM action means a third |
| ties-45 | Extendability | medium | S | No stated layering or file map; 21 flat files with implicit dependency rules |
| ties-3 | LLM interface | high | M | One aggregate read: game.pentaryn.ties.dossier(ref) |
| ties-4 | LLM interface | high | S | API calls need Actor documents; add a ref resolver at the API boundary |
| ties-6 | LLM interface | high | S | Publish the internals LLMs already reach by dynamic import |
| ties-8 | LLM interface | high | S | Extract knowsAbout(character, subject) from the Look window and publish it |
| ties-9 | LLM interface | high | M | Named wrappers for lore rows, conceal and 'mark as learned' (today raw-flag recipes) |
| ties-5 | LLM interface | medium | S | Published attributes.of / ids omit the kind pointer that the sheet and cascade include |
| ties-10 | LLM interface | medium | S | Ledger rows return locale-string dates only; add numeric siblings |
| ties-43 | Documentation / skills | medium | M | Docs drift and use-doc/changelog mix; no API reference |
| ties-44 | Documentation / skills | low | S | Hard-coded English UI strings bypass lang/en.json and the i18n gate |

## Performance gains

### ties-19 — registry() re-clamps the whole registry on every call; describeAttribute calls it per id

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `e61d90df` — memo keyed on the setting value's identity, clone on return

**Where:** `foundry/module/pentaryn-ties/attributes.mjs:169`

**Anchor:** `export function registry() {`

**Current.**

registry() runs readRegistry/clampAttribute over every entry on each call; describeAttribute (~715) calls attributeById -> registry() for each id. Hot paths: attributesOf maps describeAttribute over carried ids; searchAttributes (~1275-1297) runs per keystroke of two search boxes (attributes-ui ~980, 1041), walking every actor then describeAttribute per id; knownWorld; chainTags per row. study.reg() (study.mjs:403) is a second unclamped reader with a different contract.

**Proposed.**

1. Memoise the clamped list keyed on the raw setting value identity, invalidated on updateSetting/createSetting/deleteSetting for pentaryn-ties.attributes. 2. registry() returns structuredClone(cached) because callers mutate (createNow list.push, repairIconsNow entry.icon=, commitNow list[i]=). 3. Add describeAttribute(id, byId=null) and pass an index from attributesOf, searchAttributes, knownWorld. 4. Leave study.reg() alone unless idempotence is proven (ties-20).

**Behaviour test recipe (write first, must pass before and after).**

test/attributes.mjs with stub game.settings over a 300-entry registry fixture and 200 stub actors (needs attributes.mjs to import under stubs): before and after, deep-equal outputs of describeAttribute(id) for every id, attributesOf(actor), searchAttributes('ha'), knownWorld(pc); mutation isolation: registry().push(x) does not change next registry().length; registry()[0].icon='z' does not leak; invalidation: change the stub setting value then fire the stub updateSetting hook and assert fresh data.

**Risk.** Stale cache if a write path bypasses settings events; keying on raw value identity plus hook invalidation, and clone-on-return, mitigate.

### ties-24 — Worn badges: rAF scheduled on players' clients and full PIXI rebuild every frame

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** items 1–2 done [declared] B7 half `697b7330` (`badgePlan`, players schedule no frame); item 3 done `6f1fca29` as a whole-plan skip (an unchanged `planKey` with a live layer is not rebuilt; any change rebuilds all, so no stale badge; no frozen golden changed)

**Where:** `foundry/module/pentaryn-ties/worn.mjs:144`

**Anchor:** `export function drawBadges() {`

**Current.**

drawBadges is hooked to refreshToken on all clients and schedules a requestAnimationFrame each time; paintBadges bails for non-GM only inside the frame (worn.mjs ~158). For the GM every frame destroys and recreates a Graphics and a PIXI.Text per marked token and calls readWorn twice per marked token.

**Proposed.**

1. Early return in drawBadges when !game.user?.isGM (players never paint). 2. Extract pure badgePlan(placeables,gridSize)->[{tokenId,x,y,r,letter}] (the math in paintBadges), reading readWorn once per token. 3. Optionally diff plan against the previous plan keyed on (x,y,r,letter) so only changed entries rebuild; canvasTearDown must clear the cache.

**Behaviour test recipe (write first, must pass before and after).**

test/worn.mjs (node, no PIXI): badgePlan with fake placeables {id,document:{x,y,flags},w}: gridSize 100 -> r=15, x=docX+w-17.25, y=docY+17.25, letter = first char of `by` uppercased, '•' when blank; compare against a copy of the current inline math. Assert drawBadges with game.user.isGM=false never calls the requestAnimationFrame stub. Needs worn.mjs to import under stubs (PIXI referenced only inside functions).

**Risk.** Diffing could leave a stale sprite if the key misses a field; items 1 and 2 are safe alone and can ship first.

### ties-20 — planStep re-normalises registry and ledgers on every inner call

**Category:** Performance gains · **Impact:** low · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `3d0adb60`

**Where:** `foundry/module/pentaryn-ties/known-core.mjs:1915` (snapshot :1874; moved by U-7-3's insert at :1801)

**Anchor:** `export function planStep({`

**Current.**

planStep reads the registry once, but identificationLadder/ancestorsOf re-run readRegistry per carried attribute, knowsAttribute/failedAttribute re-run readKnowledge per rung and identifiedState re-runs readBeliefs per rung. It runs in runCascade's loop (up to 24x), preview.simulate (12x24) and factOrder.

**Proposed.**

Normalise once inside planStep (indexRegistry, readKnowledge, readBeliefs) and let ancestorsOf, identificationLadder, identifiedState, knowsAttribute, failedAttribute accept already-read inputs via the existing asIndex pattern (known-core ~653) or internal variants. Keep public signatures.

**Behaviour test recipe (write first, must pass before and after).**

test/known.mjs: first add idempotence fixtures eq(readBeliefs(readBeliefs(x)),readBeliefs(x)), same for readKnowledge and readRegistry over existing ledgers plus a maximal-shape fixture. Copy current planStep into the test as planStepRef and assert equality over existing planner fixtures plus 200 seeded-PRNG random registries/ledgers.

**Risk.** Only valid if readers are idempotent; the idempotence fixtures prove that first and fail loudly otherwise.

### ties-21 — runCascade recomputes loop-invariant inputs each iteration

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `acca4b22`

**Where:** `foundry/module/pentaryn-ties/study.mjs:1821`

**Anchor:** `    const step = planStep({`

**Current.**

Each of up to 24 iterations calls reg(), attributeIdsOf(subject,kindActorOf) and attributeIdsOf(character,kindActorOf). The loop writes only beliefs and knowledge, never attribute links or the registry, so these three are invariant.

**Proposed.**

Hoist registry, carried and rollerCarries above the for-loop; keep knowledge() and the beliefs read per iteration. Add a comment that the cascade must never link attributes inside the loop.

**Behaviour test recipe (write first, must pass before and after).**

Extract cascadeInputs(subject,character,fixed) seam. In a stub world with a 3-rung ladder and character.rollSkill stubbed to totals [18,9]: run inspectAs before and after, deep-compare recorded update payloads and setKnowledge calls (identical); spy attributeIdsOf is called 2 times total rather than 2 per step.

**Risk.** Only invariance matters; the spy test and comment guard it.

### ties-22 — Ties tab scans every actor twice per paint (inbound in build and bind)

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `5a3c9e8b`

**Where:** `foundry/module/pentaryn-ties/editor.mjs:425`

**Anchor:** `  const replies = new Map(inbound(actor).filter(r => r.mutual).map(r => [r.id, r]));`

**Current.**

buildHTML calls inbound(actor) (editor.mjs:342) and bind calls it again (425); each reads every world actor's ties flag. Every paint, including each strength-pip click (rerender), costs 2x O(actors) for a GM. injectOneTab runs spec.build then spec.bind synchronously (pentaryn-ties.mjs:648-650).

**Proposed.**

buildHTML stores replies in a module-level WeakMap keyed by actor; bind uses lastReplies.get(actor) ?? fresh computation.

**Behaviour test recipe (write first, must pass before and after).**

test/editor.mjs with look.mjs stubs (game.user.isGM true) and game.actors.contents as a counting getter: one paint (buildHTML then bind on a fake root) reads contents once, not twice; buildHTML string unchanged (snapshot).

**Risk.** Stale map only if bind ran for a different paint than its build; both are synchronous and back-to-back.

### ties-23 — Known tab reads and clamps the registry once per notebook entry

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `ccdbc09f`

**Where:** `foundry/module/pentaryn-ties/known.mjs:658`

**Anchor:** `            registry: registryOf(),`

**Current.**

buildKnownHTML's per-entry loop calls registryOf() for every entry; a 30-entry notebook clamps the registry 30 times per paint, and the tab repaints on every hide, category change and study click.

**Proposed.**

Hoist const reg = registryOf() above the loop and pass it to visibleAttributesFor.

**Behaviour test recipe (write first, must pass before and after).**

test/look.mjs Marrith world: count game.settings.get(MODULE,'attributes') calls via a counter in the stub: before N (= entries), after 1; buildKnownHTML(marrith) string byte-identical.

**Risk.** Registry cannot change mid-paint.

### ties-25 — Wire repaint queued on every refreshToken/sightRefresh even with no cards up

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B7 `ff8f3242`

**Where:** `foundry/module/pentaryn-ties/overlay.mjs:186`

**Anchor:** `export function drawWires() {`

**Current.**

drawWires is hooked to refreshToken and sightRefresh (overlay ~516-517) on every client and schedules a frame that calls Cards.live() and dropWires() even when no card exists, the common case in play.

**Proposed.**

Add export const size = () => cards.size to popups.mjs. At the top of drawWires: if (!Cards.size() && !state.wires) return. With no cards and no layer, paintWires already ends in dropWires() with nothing to drop (verified overlay.mjs:202-206), so the early return is a no-op.

**Behaviour test recipe (write first, must pass before and after).**

test/overlay.mjs with a counting requestAnimationFrame stub and canvas {ready:true}: zero cards and state.wires null -> 100 drawWires() calls schedule 0 frames; one card -> 1 frame; a just-closed card with existing state.wires still schedules the frame so the layer is dropped.

**Risk.** Wire layer existing without cards still triggers the drop.

### ties-26 — Sheet injection runs twice per actor-sheet render

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B7 half `ade1a595`

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:1008`

**Anchor:** `for (const hook of ["renderNPCActorSheet", "renderCharacterActorSheet", "renderActorSheetV2", "renderActorSheet"]) {`

**Current.**

ApplicationV2 fires render hooks for each class in the chain, so a character sheet fires renderCharacterActorSheet and renderActorSheetV2; injectHeaderButton and injectTab run twice. The second pass exits via the ptBound/btn guards but only after mayView, settings reads and querySelector sweeps. item-marks binds only renderBaseActorSheet.

**Proposed.**

Keep the hook list. Add a per-dispatch dedupe: a module-level WeakSet of element nodes; the handler returns if the element is in the set, otherwise adds it and schedules queueMicrotask(() => set.delete(element)) so a genuine later re-render is never skipped. (The original proposal's app.renderCount does not exist; do not use it.)

**Behaviour test recipe (write first, must pass before and after).**

Node test with a Hooks stub recording handlers: fire the four handlers in chain order with the same (app, element) fake and assert the inject spy is called once; await a microtask, fire again, assert it runs again. DOM result (count of nav a[data-tab] and section[data-tab]) equals the current two-pass run.

**Risk.** Microtask scoping keeps separate renders separate; existing guards still cover correctness.

### ties-27 — personalCluesHTML scans every actor per personal row; the review panel already has the carrier map

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `f3a707a4`

**Where:** `foundry/module/pentaryn-ties/attributes-ui.mjs:303`

**Anchor:** `export function personalCluesHTML(entry) {`

**Current.**

For each open 'personal' entry personalCluesHTML walks game.actors with attributeIdsOf (306-312). review-ui calls it per open row (~451) right after carriers() (225-240) built the same id -> actors map; the Attributes tab calls it per row detail (~354).

**Proposed.**

Change to personalCluesHTML(entry, carriersOf=null) where carriersOf(id) returns actors; review-ui passes a lookup built from carriers() (storing actors, not just names); attributes-ui keeps the scan.

**Behaviour test recipe (write first, must pass before and after).**

Stub world with 3 actors carrying a 'personal' entry: HTML identical with and without the map; attributeIdsOf spy count drops from actors x openRows to 0 in the review path.

**Risk.** carriers() maps to names today; must also keep actors.

### ties-28 — GM Ties tab: kind picker scans all actors twice with literal flag names

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `6a97fae5`

**Where:** `foundry/module/pentaryn-ties/authoring.mjs:54`

**Anchor:** `  const current = actor.getFlag(MODULE, "kindOf") ?? "";`

**Current.**

kindPicker (53-82) filters game.actors then loops game.actors again reading 'kindOf' and 'studyTiers' by literal name on every GM paint of any actor's Ties tab.

**Proposed.**

One pass building both `all` and `evident`; use KIND_OF_FLAG and STUDY_TIERS_FLAG from known-core.

**Behaviour test recipe (write first, must pass before and after).**

Stub world (5 NPCs, 2 with kindOf pointing at one, 1 with studyTiers): authoringHTML(actor) string byte-identical before and after (optgroup order = filter order).

**Risk.** Insertion order preserved by one pass.

## Maintainability gains

### ties-1 — ties test suites (200 cases) never run in make foundry-ties-check

**Category:** Maintainability gains · **Impact:** high · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done outside the module before this wave: `58af29d1` (python-tooling-7) puts `node-test` in the ties ModuleSpec; `test/run.mjs` runs every suite

**Where:** `scripts/foundry/ops/config.py:117`

**Anchor:** `        check=_STATIC,`

**Current.**

The ties ModuleSpec runs only parse/imports/i18n. Sixteen other modules use check=(*_STATIC, "node-test"); ties is one of two that do not (the other is importer, config.py:181 and 311). test/known.mjs (183 cases at 4e64f47; 179 in the snapshot, U-7-3 added four `tablePCs`/`switchLabels` cases), test/look.mjs (9) and test/reach.mjs (8 cases, all-passed summary; 200 cases in all, 196 in the snapshot) pass today when run by hand but are gated by nothing. known.mjs ~line 16 says the shared runner comes 'when it lands'. context/foundry/attributes.md:955 tells the LLM to run `node test/known.mjs` by hand. _check_node_test (modules.py:259-271) fails with 'no test runner' if test/run.mjs is missing.

**Proposed.**

1. Add foundry/module/pentaryn-ties/test/run.mjs: spawnSync(process.execPath,[file],{stdio:'inherit'}) for each of known.mjs, look.mjs, reach.mjs (child processes, because look.mjs and reach.mjs install conflicting globalThis.game stubs); exit 1 if any child exits non-zero. Auto-discover other test/*.mjs files except run.mjs/stubs.mjs. 2. config.py:117 -> check=(*_STATIC, "node-test"). 3. Update the known.mjs header comment and context/foundry/attributes.md:955 to say `make foundry-ties-check`.

**Behaviour test recipe (write first, must pass before and after).**

scripts/tests/test_foundry_ops.py: add test_ties_runs_node_suite asserting 'node-test' in MODULES['ties'].check (mirror how neighbouring module specs are asserted, if any). Manual in module dir: `node test/run.mjs` must print known-core 183 passed (179 in the snapshot), look + known tab 9 passed, reach all passed, exit 0 (verified each suite passes standalone in the snapshot). Break one fixture on purpose: exit 1.

**Risk.** None at runtime (test/ is not loaded by Foundry). Make target gets ~1s slower.

### ties-35 — Split study.mjs (2890 lines, ~11 concerns) into study/ behind a barrel

**Category:** Maintainability gains · **Impact:** medium · **Effort:** L

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `29560557` (export pin), `e688e96f` (split behind `study.mjs`)

**Where:** `foundry/module/pentaryn-ties/study.mjs:2`

**Anchor:** ` * The study conduit — the GM's client throws the roll and hands back one string.`

**Current.**

One file holds the claim protocol, fact resolver, payload composition, player requests and GM conduit, approval gate, GM authoring setters, the Phase 8 cascade, tempo tell, grantKind/identification reset, share/forget/audit and socket registration. Every new phase has been appended here.

**Proposed.**

Create foundry/module/pentaryn-ties/study/ (claim, resolve, compose, conduit, gate, authoring, cascade, tempo, share, register). study.mjs becomes `export * from './study/...'` so all importers and LLM dynamic imports of /modules/pentaryn-ties/study.mjs keep working. Module-private state (SESSION, INSPECT_SESSION, inspected, scoping) moves with its section. Add every new file to module.json only if esmodules lists them individually (check first).

**Behaviour test recipe (write first, must pass before and after).**

test/study-surface.mjs, run BEFORE the split: with stubs (foundry.utils.randomID needed at import because study.mjs ~2092 runs it at module scope, plus game, CONFIG, Hooks) write Object.keys(await import('../study.mjs')).sort() to test/snapshots/study-exports.json; after the split the list must match. Also run all suites and the ties-21/29/30 tests. The modules.py imports gate catches missing re-exports.

**Risk.** Circular import could hit TDZ on module-scope consts; keep initialisers local.

### ties-36 — Split known-core.mjs (2433 lines) into core/ files behind the same barrel

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `c9276cb8` (split behind `known-core.mjs`)

**Where:** `foundry/module/pentaryn-ties/known-core.mjs:2`

**Anchor:** ` * The Known list, minus Foundry — schema, defaults, and the hardened reader.`

**Current.**

The pure core holds seven domains: Known schema, study ladder, lore rows, attribute registry/tree/review/source, ledgers and the planner, prose flattening, share status and fact order. New rules land at the bottom.

**Since the snapshot (17275c9, U-7-3):** the file is 2433 lines. The re-run added an eighth concern, the inspect window's PC roster (`tablePCs`, `switchLabels`, known-core.mjs:1801–1841), and inserted it in the middle of the ledger section, between `knowsAttribute` (:1798) and `failedAttribute` (:1843), so a new rule no longer even lands at the bottom. Excerpt (known-core.mjs:1818):

```js
export function tablePCs(actors = [], users = []) {
```

Place it in its own `core/roster.mjs` (pure; imports nothing) rather than in `core/ledgers.mjs`, and move `switchLabels` with it.

**Proposed.**

Create foundry/module/pentaryn-ties/core/ (known, study, lore, attributes, ledgers, prose, facts); known-core.mjs becomes `export * from './core/...'` so test/known.mjs and LLM dynamic imports keep working. Cross-section uses (readGranted -> isBlankProse, visibleAttributesFor -> readRegistry/identifiedState) are function-level so TDZ-safe.

**Behaviour test recipe (write first, must pass before and after).**

`node test/known.mjs` still reports 183 passed (179 in the snapshot). The export-surface snapshot must include `tablePCs` and `switchLabels`. Add an export-surface snapshot (Object.keys(await import('../known-core.mjs')).sort() written to test/snapshots before the split). Import-direction check in test/run.mjs: core/*.mjs import only core/*.mjs. The no-globals import in known.mjs doubles as TDZ/Foundry-global guard.

**Risk.** TDZ if a const is read at another file's evaluation time; today only function bodies cross sections.

## Defragmentation

### ties-12 — Three different reverse-side (mirror) rules; extract the pure ones to ties-core.mjs

**Category:** Defragmentation · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `44c8d9ea`, `8920256f` — `ties-core.mjs` `mirrorLinked` / `resolveMirror` / `seedReverse`

**Where:** `foundry/module/pentaryn-ties/tie-dialog.mjs:671`

**Anchor:** `      const resolve = (box, seeded, mineNow, revNow, prevMine) => {`

**Current.**

ties-api.setTie (247-271) overwrites the mirror's word/stance and keeps notes; relay.applyMirror (122-148) fills only blanks; tie-dialog #save (661-712) applies a linked/diverged/emptied-box rule in closures. The tie-dialog and relay logic is pure but trapped in a class and a socket handler, so it is untested.

**Proposed.**

New pure foundry/module/pentaryn-ties/ties-core.mjs (no Foundry globals): resolveMirror(box,seeded,mineNow,revNow,prevMine) (the closures linked and resolve, 661-688, verbatim) and seedReverse(rev,mine)->{word,notes,changed} (relay 143-145). tie-dialog and relay import them. Document in ties.help() that `set` force-mirrors.

**Behaviour test recipe (write first, must pass before and after).**

New test/ties-core.mjs. First copy the current closures into the test as `ref` implementations, then table-test extracted functions against them: typed new text -> {value:typed,followed:false}; untouched and seeded -> {value:revNow}; emptied a seeded box -> {value:mineNow,followed:true}; blank box with rev equal prevMine -> followed; blank box with rev diverged -> {value:revNow}; whitespace-only rev -> linked. seedReverse: blank word filled; written notes kept; both equal -> changed:false.

**Risk.** Verbatim moves; ref copies make any accidental edit fail.

### ties-13 — Flat-roll miss predicate duplicated in four places (narrowed from six)

**Category:** Defragmentation · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `f1e4891a` — `core/rules.mjs` `rolledMiss` at the four sites

**Where:** `foundry/module/pentaryn-ties/study.mjs:1346`

**Anchor:** `function rowMissed(fact, rec) {`

**Current.**

The 'rolled flat row failed' predicate (share -> never; boolean pass wins; else Math.round(total) < dc) is re-derived in rowMissed (study.mjs:1346-1351), beliefs().passOfRow (1593-1608), legacyMissCards.flatMissed (2796-2798) and known-core shareStatus.rolledMiss (2297-2298). The other two cited sites (pending() ident check ~1397 and promptCascadeDeliver ~1970) do NOT share it: they judge empty text plus total < dc + concealment for identification rows, with different null handling, so a single 'union' verdict would change behaviour there.

**Proposed.**

Extract only the flat predicate as pure rolledMiss(rec, dc) in known-core.mjs (false when !rec or rec.from; rec.pass===false when boolean; else typeof total==='number' && typeof dc==='number' && Math.round(total)<dc) and call it from the four sites, each keeping its own kind/ident/null handling around it. Leave the ident-with-concealment sites alone.

**Behaviour test recipe (write first, must pass before and after).**

In test/known.mjs add a matrix of ~12 recs (legacy no-pass with total below/at/above dc, pass true/false, share {from,prior}, total null, dc non-number). Copy the four current bodies verbatim into the test as ref functions (rowMissed/flatMissed/rolledMiss bodies; shareStatus is already exported so assert its outputs directly) and assert each adapter equals its ref on every row before and after.

**Risk.** Subtle ledger logic; the verbatim-ref matrix catches divergence. Keeping ident sites out avoids the behaviour change the original proposal risked.

### ties-14 — Fact-key and flag-name string literals bypass the known-core grammar

**Category:** Defragmentation · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `b4479e1a`

**Where:** `foundry/module/pentaryn-ties/study.mjs:1900`

**Anchor:** ``     if (pass && !hold && text.trim()) grants[`attr:${attrId}:${MEMBER_FACT}`] = { text, when: now, icon: entry.icon, source: entry.title }; ``

**Current.**

known-core owns key grammar (factKeyOf, identifiedKey, attrFactKey) but study.mjs builds attr:${attrId}:${MEMBER_FACT} by hand (1900, 2012) and tests key.endsWith(`:${MEMBER_FACT}`) (1962, 2052, 2423); attributes-ui.mjs:723 builds attr:${attrId}:${loreId}. Flag names are literals: 'conceal' (study 2083, preview 214; snapshot :196), '#inspect' (study 2096-2117), 'kindOf'/'studyTiers' (authoring 54-60), 'beliefs' (attributes 797, known 659), and 'pentaryn-ties' instead of MODULE (editor 84/474/573, tie-dialog 589, item-marks 9, known-core 690).

**Proposed.**

Add isIdentKey(key), CONCEAL_FLAG='conceal', INSPECT_CLAIM_KEY='#inspect' to known-core; replace literals with identifiedKey/attrFactKey/isIdentKey and existing KIND_OF_FLAG/STUDY_TIERS_FLAG/BELIEFS_FLAG/MODULE constants. Ensure replacements match the original strings exactly.

**Behaviour test recipe (write first, must pass before and after).**

test/known.mjs: eq(identifiedKey('species:human'),'attr:species:human:#id'); isIdentKey true for 'attr:species:human:#id', false for 'attr:a:r1' and 'lore:x:#idmiss-a'; eq(attrFactKey('a','b'),'attr:a:b'). Static guard in test/run.mjs (ties-1): grep non-core .mjs for /:\$\{MEMBER_FACT\}|`attr:\$\{/ and fail outside known-core.mjs.

**Risk.** Strings identical; fixtures pin them.

### ties-15 — Module-local util.mjs for helpers copied across ties files

**Category:** Defragmentation · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done without a util.mjs: `firstName` / `concealFor` `f6de047c`, flag reads `b0cbfeea` (kit `readFlag`), `canSee` `1d7f327d` (ties-adapter), `esc` `372071ed` (core/html.mjs), `t` / `f` `607bc494` (`_loc`)

**Where:** `foundry/module/pentaryn-ties/editor.mjs:35`

**Anchor:** `const esc = s =>`

**Current.**

Within ties: hand-rolled esc in editor 35, tie-dialog 31, known 55, worn 40, authoring 36, lore 44, attributes-ui 47, study 123; foundry.utils.escapeHTML variants in look 77, preview 80, review-ui 56; t/f pairs; flagOf in facts 23, study 220, preview 86, known 111, attributes 689; canSee in overlay 102, known 251, popups 367, ties-api 83; isApplyingGM in relay 62 and study 127 (verified identical); addTieKey (editor 83) and knownKey (known 237); defensive settings readers in overlay, study, preview, ties-api. (Per-file counts approximate; confirm each copy's escape set before migrating.)

**Since the snapshot (17275c9, U-7-3):** a new copy of preview's `firstName` (preview.mjs:96) landed inside `switchLabels` as a local `first` (known-core.mjs:1836), byte-identical in body:

```js
  const first = n => String(n ?? "").trim().split(/[\s,]/)[0] || String(n ?? "?");
```

`switchState` (preview.mjs:528; the label read is :530) now prefers `switchLabels`' output and keeps `firstName` only as a fallback, so the two copies must agree or a label would change depending on whether `playerCharacters()` ran first.

**Proposed.**

New util.mjs (imports only MODULE from ties-api.mjs) exporting esc, t, f, flagOf(doc,key), canSee(token), isApplyingGM(), boundKeyLabel(action), settingOr(key,fallback). `firstName` is pure: export it from known-core (next to `switchLabels`, which uses it) and import it in preview.mjs instead of the local copy. Migrate only copies proven byte-identical; keep escapeHTML-based esc in look/preview/review-ui. popups' canSee copy exists due to an overlay<->popups cycle that util.mjs breaks.

**Behaviour test recipe (write first, must pass before and after).**

New test/util.mjs: eq(esc(`<a href="x">'&"</a>`),'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;'); canSee: GM true -> true, player with {isVisible:false} -> false, {visible:true} without isVisible -> true; boundKeyLabel with stub keybindings.get -> [{key:'Digit5'}]->'5', [{key:'KeyQ'}]->'Q', []->'?'; settingOr with throwing settings.get -> fallback. firstName (test/known.mjs, before the swap run against preview's local copy too): 'Caven Calderon'->'Caven', 'Sergeant Vesh, Night Sergeant'->'Sergeant', '  Talo '->'Talo', ''->'', null->'?', undefined->'?'; the existing switchLabels cases stay green. Before migrating each esc copy, add a test that runs the OLD local esc and util.esc over the same hostile string. Re-run all suites and look.mjs HTML snapshots.

**Risk.** Swapping between the two esc families changes bytes for the apostrophe; only like-for-like migration.

### ties-16 — Row expand/collapse binding x6 and open-state maps x4 -> row-ui.mjs

**Category:** Defragmentation · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `3efd5a15` — `bindRowToggle` / `makeOpenState` in core/html.mjs

**Where:** `foundry/module/pentaryn-ties/known.mjs:745`

**Anchor:** `  root.querySelectorAll('[data-action="toggle"]').forEach(head => {`

**Current.**

The click/Enter/Space toggle is hand-copied in editor.mjs (~429-449, 583-602), known.mjs (745-765, 907-924), attributes-ui.mjs (688-705), lore.mjs (194-212). The per-actor expanded-set Map is copied in editor 70-76, known 71-81, attributes-ui 56-60, lore 51-56. A comment at known.mjs ~860-866 records a bug born from this copying.

**Proposed.**

New row-ui.mjs: makeOpenState() -> {for(ownerId),set,forget}; bindRowToggle(head,row,{state,ownerId,focus=null,mode:'attr'|'class'}) (mode 'attr' toggles wrap[hidden] first, 'class' toggles li.pt-open first). Encode the differences as options (focus targets; attributes-ui omits aria-expanded).

**Behaviour test recipe (write first, must pass before and after).**

test/row-ui.mjs with a tiny fake element (classList Set, attrs Map, listeners, focus spy), no jsdom: copy each of the six current closures into the test as refs; for each mode fire click, keydown Enter, keydown Space, keydown 'a'; assert identical sequences of {hidden, pt-open, aria-expanded, state.has(id), focused selector} between ref and new.

**Risk.** Focus targets and aria-expanded differ per site; encoded as options and pinned by the ref comparison.

### ties-17 — Granted-card markup duplicated between the Attributes tab and the Known tab

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `a5150027`

**Where:** `foundry/module/pentaryn-ties/attributes-ui.mjs:115`

**Anchor:** `function grantedBlock(grants) {`

**Current.**

grantedBlock (attributes-ui.mjs:115-136) re-implements known.mjs grantedRegion + grantCard (475-510) line for line; grantedRegion also re-inlines grantedHead markup. The Known copy additionally drops blank-prose cards; the duplicate lacks that, which is harmless only because readGranted already drops isBlankProse text (verified known-core.mjs:270).

**Proposed.**

Export grantedRegion from known.mjs, use it in attributes-ui detail(), have grantedRegion use grantedHead(), delete grantedBlock.

**Behaviour test recipe (write first, must pass before and after).**

test/look.mjs harness: fixtures [], [one grant with icon+source], [two grants]; assert norm(grantedBlock(g))===norm(grantedRegion(g)) with norm collapsing whitespace, BEFORE deleting grantedBlock. Add a grants list through readGranted with a '<p></p>' entry to confirm it never reaches either function.

**Risk.** Only whitespace differs.

### ties-18 — Notes-preview, notes-prose and word-cell fragments repeated 7x

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `3efd5a15`

**Where:** `foundry/module/pentaryn-ties/editor.mjs:172`

**Anchor:** `  const preview = hasNotes`

**Current.**

'Preview or (empty) line' and 'prose or (empty) block' are rebuilt in editor.mjs ~172-174, 200-205, 233-235, 293-298 and known.mjs ~378-380, 565-567; the word-or-stance-label cell in editor ~176-178, 200-202, 290-292 and replyFragment ~152-154.

**Proposed.**

Add notesPreview(text,emptyKey), notesProse(text,emptyKey), wordCell(row,{stanceClass}) to row-ui.mjs; replace the inline copies, keeping template literals verbatim.

**Behaviour test recipe (write first, must pass before and after).**

Extend test/look.mjs stubs: before refactor snapshot editor.mjs buildHTML(actor) (stub ties-api read via flags) and buildKnownHTML(marrith) as strings; assert byte-identical after.

**Risk.** Template whitespace changes alter bytes; exact-byte snapshots prevent it.

### ties-39 — The 'two GM sessions' claim protocol is implemented three times

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `0eb4f394` — `stakeAndConfirm`

**Where:** `foundry/module/pentaryn-ties/study.mjs:159`

**Anchor:** `async function claimFact(fact, characterId, now) {`

**Current.**

Stake, sleep 250ms, read back appears in claimFact's attr branch (160-165, setting plane), claimRoll (179-189, flag plane) and claimInspect (~2094-2100), each with its own release twin. aoe/hooks.mjs:55 claimMessage solves the same problem differently in another module.

**Proposed.**

Add stakeAndConfirm({write,readBack,token,settleMs=250,sleep}) -> boolean in study/claim.mjs (or study.mjs until ties-35); the three become write/readBack lambdas. Keep the three release functions.

**Behaviour test recipe (write first, must pass before and after).**

Node test with injected immediate sleep and stub write/readBack: readBack equals token -> true; differs -> false; write called exactly once before readBack (order spy); for claimRoll assert the update payload equals the current literal {'flags.pentaryn-ties.beliefs.<pc>.<key>':{claim,when}} with {render:false}.

**Risk.** Settle delay must remain 250ms; default argument pins it.

### ties-40 — Live-refresh hook kit duplicated between the Look window and the inspect preview

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `691f89e1` — `LiveHooks` in ties-adapter

**Where:** `foundry/module/pentaryn-ties/look.mjs:265`

**Anchor:** `  watch() {`

**Current.**

look.mjs (~246-307) and preview.mjs (~695-775 at 4e64f47; ~677-757 in the snapshot) each implement a LIVE_MS=150 debounce, a [name,fn] hook array with Hooks.on/off, _onFirstRender->watch / _onClose->unwatch, and flattenObject+touchesFlagScope filtering of updateActor.

**Proposed.**

New live.mjs: class LiveHooks {constructor(hooks,onFire,ms=150); start(); stop(); queue(flagFull)}; both windows delegate watch/unwatch/queueLive; predicates stay in each window.

**Behaviour test recipe (write first, must pass before and after).**

Stub Hooks.on/off recording registrations; construct each window (stub ApplicationV2), call _onFirstRender then _onClose; assert registered hook names equal today's lists (look: updateActor, createSetting, updateSetting, deleteSetting, updateToken, deleteActor; preview: updateActor, createActor, deleteActor, updateSetting, createSetting, deleteSetting, updateToken), all were Hooks.off'd, and a burst of 5 queue() calls within 150ms fires once (fake timers). Re-confirm the lists against the code at build time.

**Risk.** preview's queueLive has a `full` flag; keep as an optional argument.

### ties-41 — Card record construction duplicated between show() and restorePinned()

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `34c9144c`

**Where:** `foundry/module/pentaryn-ties/popups.mjs:339`

**Anchor:** `export function restorePinned() {`

**Current.**

popups.mjs builds the card record, close handler, layer append, cards.set and makeDraggable twice (show ~247-271, restorePinned ~371-392); restorePinned also inlines a third canSee (~367) because of the overlay<->popups cycle.

**Proposed.**

Add mount(k,rec,{pinned,at}) shared by both; restorePinned uses util.canSee once ties-15 lands (otherwise keep its local copy).

**Behaviour test recipe (write first, must pass before and after).**

test/popups.mjs with a minimal DOM fake (document.createElement/getElementById stubs) and stub game.settings: show() with 2 entries -> 2 cards; restorePinned with a saved entry -> 1 pinned card; live() output (sourceId, tieId, tokenId, pinned, colour) and savePinned payload identical before and after; close handler order remove -> savePinned -> notify.

**Risk.** Close-handler order is pinned by the payload test.

### ties-42 — Dead exports, dead CSS and dead branches

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `3b9976ba`, `b0785d60`, `d3fb7630`; the exports the frozen tests call (`knowsOf`, `hasFailed`, `hasAttributes`, `knowsIncludingCarried`) and the pinned barrel names (`rungsFor`, `IDENT_FLAG`, `STRENGTHS`, `candidates`) stay, marked @deprecated

**Where:** `foundry/module/pentaryn-ties/attributes.mjs:1229`

**Anchor:** `export function branchOf(attrId, character = null, { forGM = false } = {}) {`

**Current.**

Verified by grep as referenced nowhere outside their definition (and not published): attributes knowsOf (1023), hasFailed (1024), hasAttributes (1300), knowsIncludingCarried (1160), branchOf (1229); overlay isShowing (268); known-core rungsFor (454), IDENT_FLAG (1233); authoring hasLore (196); ties-api STRENGTHS (26) and candidates (307; known.mjs:212 says not to use it). settledAttribute IS used by test/known.mjs, so it is not dead. Dead CSS (only in ties.css): .pt-attr-failed (1506), .pt-attr-failed-tag (1511), .pv-skip (1713), .pv-kind-text (1739), .pt-review-hint (1768); no dynamic class concatenation matches them. Dead logic: mayStudy's `studied` param is voided (known-core ~913); attributes.mjs:522 `diff.length ? {changed:diff} : {unchanged:true}` is unreachable-else because diff is non-empty there (506).

**Proposed.**

Publish branchOf (ties-6). Delete the other dead exports and the five CSS rules; simplify line 522 to `{ ok: true, entry: merged, changed: diff }`. Keep mayStudy's signature (callers pass studied). Optionally keep one-release re-exports for names an external macro might import.

**Behaviour test recipe (write first, must pass before and after).**

Before deleting, run the export-surface snapshots (ties-35/36) and grep test/*.mjs for each name (none besides settledAttribute). After: all suites and the modules.py imports gate pass. For line 522 assert updateAttribute returns {ok, entry, changed} with the same keys on a changing patch.

**Risk.** An external LLM script could import a deleted name; keep a re-export for one release if concerned.

## Logging / auditability gains

### ties-33 — No debug channel; silent refusals and a computed-then-discarded outcome

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `0ff23728` — debug lines gated on `CONFIG.debug["pentaryn-ties"]`

**Where:** `foundry/module/pentaryn-ties/study.mjs:783`

**Anchor:** `async function requestFact(character, subject, spec, label) {`

**Current.**

Refusals are free-text console.warn (applyStudy refuse ~922-925, applyInspect ~1735, relay ~100, 118). Many paths return silently: requestFact (~784), inspect (~1667), requestMirror (~73), applyMirror (~96, 104, 124), runCascade guard exhaustion (~1820). tie-dialog computes `mirrored` (none/seeded/updated/kept) then discards it (~720).

**Proposed.**

New log.mjs: a client setting `debug` (default false), log.debug(event,fields) printing `pentaryn-ties | <event>` plus fields only when on, log.warn(event,fields,text). Keep existing warn text byte-identical; add debug lines at silent returns with {reason,characterId,subjectId,ns}; log `mirrored` at debug; warn when runCascade exits by guard.

**Behaviour test recipe (write first, must pass before and after).**

Stub console.warn/debug collectors. Characterise current refusal text by calling applyStudy via studyAs with a non-existent character and asserting the exact warn string before and after; with debug off assert zero debug lines; with debug on requestFact with mayWrite false emits {event:'request.refused',reason:'playerAccess'}.

**Risk.** Log text could change inadvertently; characterisation strings pin it. Debug is off by default.

### ties-34 — Contract-mandated empty catches give no trace when debugging

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `4312f33a` (`log.swallow`), `b0cbfeea`

**Where:** `foundry/module/pentaryn-ties/facts.mjs:23`

**Anchor:** `const flagOf = (doc, key) => {`

**Current.**

About 25 `catch { return fallback }` sites (ties-api, facts, known, worn, overlay, popups, attributes, study, preview, look, review-ui) implement the 'never throws' contract; when a flag or setting read fails nothing records why.

**Proposed.**

Add quiet(label, fn, fallback) to util.mjs: try fn() catch -> log.debug('swallowed',{label,err}) and return fallback. Migrate flagOf/registry/knowledge/settingOr helpers first (ties-15 consolidates most sites), keeping each site's fallback identical.

**Behaviour test recipe (write first, must pass before and after).**

test/util.mjs: quiet('x',()=>{throw new Error('e')},[]) returns [] and logs nothing with debug off, one debug line with debug on; quiet('x',()=>5,0) -> 5. Re-run all suites; outputs unchanged.

**Risk.** None if fallbacks stay identical per site.

## Hardening

### ties-37 — Field-drop guard: fixtures proving reader/writer literals name every stored field

**Category:** Hardening · **Impact:** high · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done at the wave-1 checkpoint (`test/fields.test.mjs`); untouched this wave

**Where:** `foundry/module/pentaryn-ties/known-core.mjs:1439`

**Anchor:** `     * ⚠ Decision 23's field, and the one station that erases it for the WHOLE registry if missed:`

**Current.**

clampAttribute's return literal (~1395-1459) is what saveRegistry writes back for every entry; a field it omits is erased registry-wide on the next edit (advantage already died this way, ~1441-1443). readKnown and toStoredKnown must both name imposter and hidden or a keystroke erases them (~343-347). ATTR_CONTENT_FIELDS (1468), ATTR_REVIEW_FIELDS (1474) and SNAPSHOT_FIELDS (1480) are hand-kept parallel lists; no fixture asserts coverage.

**Proposed.**

Tests only, in test/known.mjs: (a) Object.keys(clampAttribute(MAX)) is a superset of [...ATTR_CONTENT_FIELDS,...ATTR_REVIEW_FIELDS,'id','bonuses'] for a maximal valid entry MAX; (b) clampAttribute and readRegistry are idempotent on MAX; (c) for a maximal raw Known entry RAW every key of toStoredKnown([RAW])[0] survives toStoredKnown(readKnown([RAW],{resolve:()=>null})) with equal values; (d) SNAPSHOT_FIELDS subset of ATTR_CONTENT_FIELDS ONLY if that holds on today's code (check first; drop (d) if not).

**Behaviour test recipe (write first, must pass before and after).**

These are the tests; they must pass on today's code (characterisation) and fail when a future edit drops a field from one literal. Keep MAX/RAW current when fields are added.

**Risk.** None (tests only).

### ties-29 — Private core API in the blind roll, called after the claim with no release on throw

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B4 `c31bd116`, golden `c9f3e284`

**Where:** `foundry/module/pentaryn-ties/study.mjs:906`

**Anchor:** `          rollMode: foundry.dice.Roll._mapLegacyRollMode(CONST.DICE_ROLL_MODES.BLIND),`

**Current.**

throwBlind calls underscore-private foundry.dice.Roll._mapLegacyRollMode. applyStudy stakes the claim (claimFact ~964) before throwBlind (~1022) with no try/finally, so a throw strands the roll as 'already studied' until a GM reset; the registerStudy catch only logs. (foundry/adjustments.yml already tracks _mapLegacyRollMode under dnd5e-legacy-roll-modes including study.mjs, so no adjustments row is needed.)

**Proposed.**

1. Add rollModeBlind() in study.mjs: look up foundry.dice.Roll?._mapLegacyRollMode, throw a named Error if not a function, else return map(CONST.DICE_ROLL_MODES.BLIND); call it in applyStudy before claimFact and refuse cleanly (never fall back to the legacy key; the comment says that would go public). 2. Wrap the post-claim section in try/catch calling releaseFact and rethrowing. Failure-path change only; hand to the live-test workflow for confirmation.

**Behaviour test recipe (write first, must pass before and after).**

test/study-roll.mjs with stub foundry.dice.Roll: with `_mapLegacyRollMode: m => 'blind:'+m` rollModeBlind() === 'blind:blindroll' (pins mapping); without it throws the named error. Release-on-throw: stub ledger with update spy and character.rollSkill that throws; assert claim written then released (two updates, second a `-=` drop).

**Risk.** Identical on supported cores; only the failure path changes (claim released rather than stranded).

### ties-30 — Whole-setting read-modify-writes of knowledge and attribute beliefs are not serialised

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B5 `77be499b` — one kit `serialStore` per store (`settings.mjs`); a player write still returns `false` (the `null` variant in the guide was not taken)

**Where:** `foundry/module/pentaryn-ties/attributes.mjs:1033`

**Anchor:** `export async function setKnowledge(rows) {`

**Current.**

Registry writes go through serial() (~204-209) because concurrent read-modify-writes of one world setting lose an update. setKnowledge (1033-1043), clearKnowledge (1055-1066) and study.putBelief's attr branch (study.mjs ~1127-1144) do the same pattern without it, so shareFact racing a cascade's setKnowledge or deliverHeld can drop a row.

**Proposed.**

Generalise serial into serialFor(key) (one promise chain per setting key), export it, and wrap setKnowledge/clearKnowledge (KNOWLEDGE_SETTING) and the attr branch of putBelief (ATTR_BELIEFS_SETTING), moving the read inside the queued function. Never nest queued calls on the same key; document the rule. Behaviour differs only under concurrency (fixes data loss); hand to live test.

**Behaviour test recipe (write first, must pass before and after).**

Stub game.settings with an async set resolving after 10ms and updating a store. Promise.all([setKnowledge([{characterId:'a',attrId:'x'}]),setKnowledge([{characterId:'b',attrId:'y'}])]): current pins as a known-race case (only one present), new has both; sequential calls produce identical stores before and after.

**Risk.** Deadlock if a queued function awaits another queued on the same key; the documented rule and test guard it.

### ties-31 — Session-lifetime maps that are never pruned

**Category:** Hardening · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `43c4c6a5`

**Where:** `foundry/module/pentaryn-ties/study.mjs:1709`

**Anchor:** `const inspected = new Map();`

**Current.**

study.mjs inspected (one key per combat:round:combatant forever), known.mjs shownHidden (not cleared by forgetKnownActor), attributes-ui expanded/worldToggled/worldFilter and lore.mjs open are never pruned; the deleteActor hook (pentaryn-ties.mjs ~1003-1006) forgets only editor/known expanded maps.

**Proposed.**

Prune inspected keys with the combat id prefix on the existing deleteCombat hook (~837); add forgetAttributesActor(id) and forgetLoreKey(prefix), call them from deleteActor; clear shownHidden in forgetKnownActor.

**Behaviour test recipe (write first, must pass before and after).**

Export test-only _sizes() getters. combatAllows for combat c1 rounds 1-3 -> 3 keys; simulate deleteCombat(c1) -> 0; deleteActor removes expanded/shownHidden entries for that id; combatAllows still refuses a second inspect in the same round.

**Risk.** Unobservable; pruned keys belong to finished combats or deleted actors.

### ties-32 — Unescaped values interpolated into markup (describe art, item-mark class)

**Category:** Hardening · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B6 `f7aa8929`, golden `8bf658c6`

**Where:** `foundry/module/pentaryn-ties/describe.mjs:91`

**Anchor:** `    <img class="pt-describe-art" src="${art}" alt="" />`

**Current.**

describe.mjs interpolates art (actor.img or token texture) raw into DialogV2 HTML; other files escape src. item-marks.mjs:21 puts mark.icon from an item flag (player-writable on own items) into className unchecked: class injection, not XSS.

**Proposed.**

Use esc(art) (util.mjs, ties-15 or a local escape if that has not landed). In item-marks accept icon only if /^fa-[a-z0-9-]+$/ else fall back to 'fa-fire'. Grep world items for non-fa mark.icon values before shipping.

**Behaviour test recipe (write first, must pass before and after).**

Extract describeContent(art,body): 'icons/x.webp' gives the same string as now; 'a"b' yields 'a&quot;b'. item-marks decorate with a fake row: icon 'fa-skull' -> class 'pt-item-mark fa-solid fa-skull' (unchanged); icon 'x" onmouseover' -> fa-fire.

**Risk.** Normal paths unchanged; an existing non-fa icon value would fall back.

### ties-46 — Inspect window's PC roster (U-7-3) is not refreshed when a player picks a character or ownership changes

**Category:** Hardening · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared-lite] `28b913e2`, golden `313c7df8`

**Where:** `foundry/module/pentaryn-ties/preview.mjs:165`

**Anchor:** `  playerCharacters() {`

**Current.**

Added by 17275c9 (U-7-3). `playerCharacters()` (preview.mjs:165-182) now builds the share-switch row and the Simulate roller from `tablePCs` (known-core.mjs:1818), whose inputs are each player's assigned character (`u.character`), actor ownership (`a.testUserPermission(u, "OWNER")`) and `flags.dnd5e.isPolymorphed`:

```js
    const users = (game.users?.contents ?? []).map(u => ({ id: u.id, isGM: u.isGM, characterId: u.character?.id ?? null }));
```

The live hooks in `watch()` (preview.mjs:718-757) were not widened with it: there is no `updateUser` hook, and for a non-subject character `onActor` (:727-740) queues only on `name` or a `pentaryn-ties` flag key, so an `ownership.*`-only change is dropped. With the window open in player mode, a player choosing (or changing) their character, or the GM granting/revoking ownership, leaves the old switch row up; `refreshSwitches` (:599-601) would notice the `pcKey` change, but nothing calls it. Transformations are fine (createActor/deleteActor reach `onRoster`). Each refresh also runs actors x players `testUserPermission` calls; negligible at table size.

**Proposed.**

In `watch()`, add `["updateUser", (user, changes = {}) => { if ("character" in changes || "role" in changes) this.queueLive(false); }]`, and in `onActor` also queue for a character when a flattened key is `ownership` or starts with `ownership.`. `queueLive(false)` → `refreshSwitches()` → `pcKey` mismatch → `liveRender()`, the existing path. Fold the new entries into ties-40's `LiveHooks` list if that lands first.

**Behaviour test recipe (write first, must pass before and after).**

The ties-40 hook-list test gains `updateUser` in preview's expected list (this one change is the intended diff). New case with stubbed Hooks, fake timers and a window in player mode with `pcKey = "caven"`: fire `updateUser(user, { character: "talo" })` with `game.users` now assigning Talo → after 150 ms `liveRender` was called once; fire `updateUser(user, { avatar: "x" })` → not called; fire `updateActor(pc, { ownership: { uT: 3 } })` → refresh queued; fire `updateActor(pc, { system: { attributes: { hp: { value: 3 } } } })` → nothing queued (today's filtering kept). The `tablePCs` fixtures in test/known.mjs stay unchanged.

**Risk.** An extra re-render when an unrelated user's role changes; debounced, GM-only window.

## Extendability

### ties-7 — Table-driven API with a self-describing help() manifest

**Category:** Extendability · **Impact:** high · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `5c5821f4` — `api-manifest.mjs` + kit `buildApi`; `describe()` / `help()` from the kit

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:310`

**Anchor:** `function publishAPI() {`

**Current.**

publishAPI is a ~150-line nested literal of ~100 entries documented by two hand-kept comments that drift (study.mjs:1549 documents study.setTiers; the published name is tiers, pentaryn-ties.mjs:385). No namespace can describe itself; return contracts live only in comments.

**Proposed.**

New foundry/module/pentaryn-ties/api.mjs: API_TABLE rows {path,fn,gm,args,returns}; buildApi(table) producing the same nested object; help(prefix) returning [{path,args,returns,gm}]. publishAPI becomes buildApi(API_TABLE) plus api.help; the frozen-namespace guard stays. Replace duplicated header comments with a pointer to ties.help(). Keep named wrappers (edit, addTie, known.file, study.look) as named functions so fn.name survives.

**Behaviour test recipe (write first, must pass before and after).**

New test/api.mjs. BEFORE refactor: import pentaryn-ties.mjs with stubs (Hooks capturing once('ready'); game {user:{isGM:false}, settings.get throwing, keybindings.register no-op}; foundry.applications.api.ApplicationV2 class; foundry.utils.randomID, needed because study.mjs calls it at import ~line 2092), run captured ready callbacks, serialise game.pentaryn.ties to {path: fn.name||typeof} and write test/snapshots/ties-api.json. After refactor the serialisation must equal the snapshot (help is the only new key).

**Risk.** A wrong fn in a row silently rebinds a name; the per-path fn.name snapshot catches it except for anonymous arrows, hence the named-wrapper rule.

### ties-38 — Two socket listeners on one channel; a new GM action means a third

**Category:** Extendability · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** partly: the GM election is the kit's `isActiveGM` (`4502d41f`) and both callers register through `socket-adapter.mjs` `listen()`; one `game.socket.on` per caller is kept (merging them flips three frozen socket pins) — open

**Where:** `foundry/module/pentaryn-ties/relay.mjs:152`

**Anchor:** `  game.socket.on(CHANNEL, async (payload, senderId) => {`

**Current.**

relay.mjs:152 (registerRelay, MIRROR) and study.mjs:2846 (registerStudy: BUBBLE for every client, STUDY/INSPECT for the applying GM) each register game.socket.on(CHANNEL) with their own copy of isApplyingGM (relay 62, study 127, verified identical) and try/catch. The entry point registers them in separate try/catch blocks (pentaryn-ties.mjs ~494-505).

**Proposed.**

New socket.mjs: onAction(action, handler,{gmOnly=true}) installing one game.socket.on and dispatching on payload.action; gmOnly uses isApplyingGM; per-handler try/catch keeps current error texts ('conduit failed', 'relayed mirror write failed'). relay registers MIRROR; study registers STUDY, INSPECT (gmOnly) and BUBBLE (gmOnly:false). Entry point calls registerSocket once; keep per-module registration isolation.

**Behaviour test recipe (write first, must pass before and after).**

Stub game.socket.on capturing listeners and game.users.activeGM. First characterise: run registerRelay plus registerStudy with stubbed apply*/showBubble and dispatch {action:'mirror-reverse'|'study'|'inspect'|'scope-bubble'|'unknown'} with isApplyingGM true then false, recording the call matrix (bubble always; others only when applying GM; unknown never). Assert the same matrix after the refactor via a _handlers test seam.

**Risk.** Registration isolation must be preserved; per-action try/catch does that.

### ties-45 — No stated layering or file map; 21 flat files with implicit dependency rules

**Category:** Extendability · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `0d28d169` (features), `a029b6b9` (`test/graph-allow.json`), `c5b5fb7b` (file map in the README)

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:34`

**Anchor:** `import * as API from "./ties-api.mjs";`

**Current.**

Layering exists only in comments (ties-api imports nothing; known-core touches no Foundry global; attributes must not import study so a resolver is injected; popups cannot import overlay). A builder adding a feature has no map of where data, rules, conduit or UI code belongs, and nothing checks import direction.

**Proposed.**

1. README 'Architecture' table: pure (known-core/core/*, ties-core) -> data (ties-api, attributes, facts, util) -> conduit (relay, study/*, socket) -> UI (editor, tie-dialog, known, attributes-ui, lore, authoring, review-ui, preview, look, overlay, popups, worn, describe, item-marks) -> entry (pentaryn-ties, api). 2. Import-graph check in test/run.mjs: parse `from "./x.mjs"` across files, assert pure files import only pure files, data files import no UI/conduit, nothing imports pentaryn-ties.mjs; explicit allow-list for known dynamic imports. 3. module.json esmodules stays the single entry.

**Behaviour test recipe (write first, must pass before and after).**

Record today's edges as test/snapshots/import-graph.json; the check passes on today's tree and fails when a forbidden edge is added. Run the check first against the snapshot tree and tune the allow-list until it is green.

**Risk.** Tests/docs only; strictness handled by allow-list.

## LLM interface

### ties-3 — One aggregate read: game.pentaryn.ties.dossier(ref)

**Category:** LLM interface · **Impact:** high · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `7cb9e4f9` — published as `inspect(ref, { as })` (the guide's name for the dossier), with `selftest()`

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:310`

**Anchor:** `function publishAPI() {`

**Current.**

About 100 entry points but no single read answers 'tell me everything about this character'. An LLM needs ~4 eval calls (resolve actor, read(), known.read(), attributes.of(), study.beliefs()), each with a different shape, then raw flag reads for lore, conceal, studyTiers, kindOf. (Audit-reported eval.jsonl counts of 108 raw flag reads / 79 dynamic imports are not in the snapshot and were not re-verified; the structural claim stands without them.)

**Proposed.**

New foundry/module/pentaryn-ties/dossier.mjs exporting dossier(ref,{viewer=null}={}), composing existing reads only into plain JSON: actor{id,name,type,uuid}, ties=API.read, inbound=API.inbound (already GM-gated), known=Known.readKnown, attributes=attributesOf(a,kindActorOf,{viewer}), carried=attributeIdsOf(a,kindActorOf), knowledge=knownWorld(...), beliefs=Study.beliefs, kind{id,name}, studyTiers, lore=readLore(flag), conceal raw flag, granted=readGranted(flag). Publish as ties.dossier; document as first call in context/foundry/attributes.md 'Running the calls'. Optional CONFIG.queries registration is a separate follow-up, not part of this change.

**Behaviour test recipe (write first, must pass before and after).**

New test/dossier.mjs reusing test/look.mjs stub world (move StubActor/game.actors/settings/i18n stubs to test/stubs.mjs first; re-run look.mjs unchanged to prove the move). For CAVEN and MARRITH assert each dossier field deep-equals the existing function called directly on the same stubs. With game.user.isGM=false assert d.inbound deep-equals [] and d.attributes equals attributesOf with that viewer.

**Risk.** Read-only composition. Leak risk is GM-plane data to players; every component is already gated and the test asserts player-side equality with the gated functions.

### ties-4 — API calls need Actor documents; add a ref resolver at the API boundary

**Category:** LLM interface · **Impact:** high · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B2 `468c4eee`, golden `1693599c` — the legacy actor reads resolve id / name / uuid / token to the world actor

**Where:** `foundry/module/pentaryn-ties/ties-api.mjs:60`

**Anchor:** `export function baseActorOf(token) {`

**Current.**

read(actor) calls actor.getFlag inside a try and returns [] for a string (ties-api.mjs:111-118); attributes.of('Caven') throws. Every LLM session spends an eval call on game.actors.getName. Token-to-actor resolution exists in baseActorOf (ties-api.mjs:60), docOf (worn.mjs:44) and inline in pentaryn-ties.mjs (~152, 761, 787, 900).

**Proposed.**

Add asActor(ref) to ties-api.mjs: Actor -> itself; Token/TokenDocument -> baseActorOf; string -> game.actors.get(ref) ?? (ref.includes('.') ? fromUuidSync(ref) : null) ?? game.actors.getName(ref) ?? null. In publishAPI wrap only actor-taking READ entry points (read, inbound, known.read, attributes.of/ids/known/broken, study.beliefs/state/lore) as (ref,...rest)=>fn(asActor(ref) ?? ref, ...rest) so documents pass through untouched. Writes stay unwrapped.

**Behaviour test recipe (write first, must pass before and after).**

New test/asactor.mjs with stub game.actors {get,getName,contents} and stub fromUuidSync: asActor(actorObj)===actorObj; token-like {document:{actorId:'a1'}} resolves to actors.a1; 'a1' and 'Caven Ashwell' resolve; 'nope'===null. Characterisation: wrapped read(actorObj) deep-equals unwrapped read(actorObj) on look.mjs fixtures.

**Risk.** Documents pass through unchanged; only string/token inputs (previously useless) gain meaning. Id-before-name order is deterministic.

### ties-6 — Publish the internals LLMs already reach by dynamic import

**Category:** LLM interface · **Impact:** high · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `bf44258f` (+ `attributes.tree/branch/describeId`, `study.factStatus/shareFact/forgetFact/identified`); attributes.md step 5 not edited here (shared doc)

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:417`

**Anchor:** `      whoKnows: Study.factStatus,`

**Current.**

Internal file paths (study.mjs, known-core.mjs, attributes.mjs, attributes-ui.mjs) have become a de facto API via import("/modules/pentaryn-ties/..."). attributes.md step 5 instructs importing known-core.mjs for identifiedState. branchOf (attributes.mjs:1229) is written but published nowhere and imported by nothing (verified by grep). Unpublished names LLMs need: describeAttribute, knowledgeTree, grantKnowledge, setKnowledge, attributeIdsOf, factStatus/shareFact. (eval.jsonl call counts not in snapshot; unverified.)

**Proposed.**

Add reference aliases, no new logic: attributes.tree=knowledgeTree, branch=branchOf, describeId=describeAttribute, effective (ties-5); study.factStatus alongside whoKnows, shareFact/forgetFact alongside share/forget, identified=(subject,pc,attrId)=>identifiedState(subject.getFlag(MODULE,BELIEFS_FLAG)??{},pc.id,attrId). Update attributes.md step 5 to use S.identified.

**Behaviour test recipe (write first, must pass before and after).**

Once the API snapshot test exists (ties-7), assert every pre-existing key path still maps to the same function name and the new aliases are reference-equal to internals (api.attributes.tree===Attributes.knowledgeTree). S.identified deep-equals identifiedState on the Caven/Marrith fixtures in test/look.mjs.

**Risk.** Additive; aliases are references. branchOf is GM-gated by its forGM default.

### ties-8 — Extract knowsAbout(character, subject) from the Look window and publish it

**Category:** LLM interface · **Impact:** high · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `fbc7c696` — `facts.mjs` `knowsAbout`, published `study.knowsAbout`; Look HTML byte-identical

**Where:** `foundry/module/pentaryn-ties/look.mjs:153`

**Anchor:** `  shownGroups() {`

**Current.**

The player-plane answer to 'what has Caven learned about Marrith' (granted cards through the secrecy gate, visibleAttributesFor with isGM:false) exists only in LookWindow.shownGroups (153-184); the window throws for a GM (look.mjs constructor, open() returns null). An LLM running as GM must reimplement the gate from raw granted/beliefs flags.

**Proposed.**

Move the data part of shownGroups into facts.mjs as knowsAbout(character, subject) returning [{group,key,ns,attrId?,icon,source,text}] in factOrder order (including the identMissKey line and the visible-attribute filter). LookWindow.shownGroups builds groups via grantCard from it, preserving the 'blank grant draws nothing' rule. Publish study.knowsAbout.

**Behaviour test recipe (write first, must pass before and after).**

test/look.mjs (existing Caven/Marrith world): snapshot new LookWindow(marrith,caven).buildHTML() as a string before the refactor and assert byte-identical after. Add eq(knowsAbout(marrith,caven).map(c=>c.key),[VEINS,THINKING]) (Starved absent), and a held-identification case whose attr card is absent.

**Risk.** Look window's no-flicker contract needs byte-identical output; snapshot guards it. LookWindow cannot be constructed for a GM in tests unless game.user.isGM=false is stubbed.

### ties-9 — Named wrappers for lore rows, conceal and 'mark as learned' (today raw-flag recipes)

**Category:** LLM interface · **Impact:** high · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done — parts 1, 2, 4 `1d660cc8`; part 3 (`concealFor`) `f6de047c`

**Where:** `foundry/module/pentaryn-ties/attributes-ui.mjs:713`

**Anchor:** `  for (const btn of box.querySelectorAll("[data-action='attr-learned']")) {`

**Current.**

The mark-as-learned grant is built inline in a click handler (attributes-ui.mjs:713-733) and attributes.md:591-596 tells the LLM to copy it as a raw pc.update. Lore rows can be written only via the UI save closure (authoring.mjs:158-167, unsets flag when empty) or raw setFlag (attributes.md:584). conceal is a raw setFlag (attributes.md:373-374). The concealment clamp is duplicated verbatim in study.mjs:2081-2088 (inside try/catch) and preview.mjs:213-217 (snapshot :195-199; flagOf, same math).

**Proposed.**

1. attributes.mjs markLearned(character, attrRef, loreIds='all', {now=Date.now()}) holding the payload body of attributes-ui.mjs:719-730 (key attr:<id>:<loreId>, source `${title} — ${label}`); UI handler calls it with one loreId. 2. authoring.mjs writeLoreRows(actor,list) holding 158-167 (keep unset-on-empty). 3. known-core.mjs pure concealFor(raw,attrId) holding the clamp; study.concealmentFor and preview conceal call it. 4. Publish attributes.markLearned, study.loreRows, study.setLoreRows, study.conceal, study.setConceal (GM-only). 5. Rewrite attributes.md recipes at 373-374, 584, 591-596.

**Behaviour test recipe (write first, must pass before and after).**

known-core fixture concealFor: (8,'x')->8, ({x:10},'x')->10, ({default:3},'y')->3, (25,'x')->20, (-4,'x')->0, ('abc','x')->0, (null,'x')->0, ({x:'7'},'x')->7. markLearned: stub viewer {getFlag, update: capture}, registry entry {id:'a',title:'T',icon:'i',lore:[{id:'r',label:'L',text:'X'}]}, Date.now stubbed to 5; captured payload must equal {'flags.pentaryn-ties.granted':{'attr:a:r':{text:'X',when:5,icon:'i',source:'T — L'}}}. Note markLearned needs the registry stubbed (describeAttribute reads game.settings).

**Risk.** Key and source format must stay exact because grantsForEntry and the Look window join on them. The setConceal/setLoreRows publishes are additive.

### ties-5 — Published attributes.of / ids omit the kind pointer that the sheet and cascade include

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `bf44258f` — `attributes.effective` / `attributes.ofEffective`

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:427`

**Anchor:** `      of: Attributes.attributesOf,`

**Current.**

attributesOf(actor, kindResolver=null, {viewer}) (attributes.mjs:789) and attributeIdsOf(actor, kindResolver=null) (699) are published with no resolver, while the sheet, cascade, subjectFacts and review-ui pass kindActorOf. ties.attributes.ids(goblin) therefore lacks kind:<id> that the game itself uses.

**Proposed.**

Keep of/ids byte-identical. Add attributes.effective(actor)=attributeIdsOf(actor,kindActorOf) and attributes.ofEffective(actor,opts)=attributesOf(actor,kindActorOf,opts). Mark of/ids in docs as 'authored + derived, without kind pointer'. Whether to switch defaults is Joe's decision, not part of this change.

**Behaviour test recipe (write first, must pass before and after).**

Stub world (test/stubs.mjs): actor G with flags kindOf 'K' and K in game.actors. eq(ids(G).includes('kind:K'),false) pins current behaviour; eq(effective(G).includes('kind:K'),true); eq(effective(G).filter(x=>!x.startsWith('kind:')), ids(G)).

**Risk.** Additive only; the test pins ids() unchanged.

### ties-10 — Ledger rows return locale-string dates only; add numeric siblings

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done [declared] B3 `5b47b528`, goldens `9bbca55a`

**Where:** `foundry/module/pentaryn-ties/study.mjs:1415`

**Anchor:** `          when: new Date(rec.when).toLocaleString(),`

**Current.**

study.pending() (1415, 1455) and study.beliefs() (1627-1628) return when/delivered as toLocaleString() strings, so an LLM cannot sort or compare them and the format depends on the GM browser locale. Write return shapes also vary (boolean vs {ok,reason} vs entry|null) with the contract only in comments.

**Proposed.**

Additively add whenMs: rec.when and deliveredMs: rec.delivered ?? null next to the existing string fields in pending() (both planes) and beliefs(). Record each function's return contract in the ties-7 manifest. Do not change existing types.

**Behaviour test recipe (write first, must pass before and after).**

Stub actor with flags.pentaryn-ties.beliefs {pc:{kind:{text:'t',tier:20,total:21,when:1000,delivered:2000}}} and game.user.isGM true. Snapshot beliefs(actor) minus the two new keys before and after (identical); assert row.whenMs===1000 and row.deliveredMs===2000. Requires study.mjs to import with randomID stubbed.

**Risk.** Additive; callers spreading rows get two extra keys.

## Documentation / skills

### ties-43 — Docs drift and use-doc/changelog mix; no API reference

**Category:** Documentation / skills · **Impact:** medium · **Effort:** M

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `c5b5fb7b` — README in use-doc order, CHANGELOG, design notes to the migration guide's appendix

**Where:** `foundry/module/pentaryn-ties/README.md:501`

**Anchor:** `## 0.19.1 (2026-10-10, Foundry 14.369)`

**Current.**

README.md (529 lines at 4e64f47; 520 in the snapshot) mixes the use-doc with version-tagged sections and a changelog. **Since the snapshot (17275c9):** the 0.19.4 section was added at README.md:511, *above* 0.19.3 (:520), so the changelog tail now reads 0.19.1, 0.19.2, 0.19.4, 0.19.3; context/foundry/attributes.md (1004 lines) is the only API reference. Verified drift: study.mjs:1549 documents `study.setTiers` while the published name is `tiers` (pentaryn-ties.mjs:385); known.mjs:9-12 says phases 3-5 are 'not here yet'; attributes.mjs:347-353 is an orphaned JSDoc about repairIcons; lore.mjs:241 says readLore drops labelless rows while known-core.mjs:1026-1031 says a blank label is kept in storage (the comments may refer to different layers; reconcile). The entry-file header lists a subset of entries.

**Proposed.**

1. Generate context/foundry/ties-api.md from ties.help() (ties-7) with a small node script. 2. Move the README changelog to foundry/module/pentaryn-ties/CHANGELOG.md. 3. Add a README 'Architecture: which file owns what' table (ties-45). 4. Fix the drifted comments. 5. Put 'call ties.dossier first' at the top of attributes.md 'Running the calls'.

**Behaviour test recipe (write first, must pass before and after).**

Doc test in test/run.mjs: regex every `game.pentaryn.ties.[\w.]+` and S./A.-prefixed call in README.md and context/foundry/attributes.md, map onto paths in the help manifest, fail on unknown paths (would have caught study.setTiers). Uses the stubbed API from test/api.mjs; allow-list deliberate examples. Once the changelog moves (item 2), add a check that its `## x.y.z` headings are in strictly monotonic version order and the newest equals module.json `version` (catches today's 0.19.4-above-0.19.3 slip).

**Risk.** Docs only; regex may false-positive on prose.

### ties-44 — Hard-coded English UI strings bypass lang/en.json and the i18n gate

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Status (wave 3, branch `migrate/wave-3`, 2026-10-11):** done `607bc494` (`_loc` everywhere) and [declared] `a337f1fb` (the last literals; i18n key-count pin 473 → 533)

**Where:** `foundry/module/pentaryn-ties/pentaryn-ties.mjs:755`

**Anchor:** `    pv.dataset.tooltip = "Inspect (GM only): player view and simulated rolls";`

**Current.**

Literal English in pentaryn-ties.mjs:755-756, attributes-ui.mjs (~187, 190 chain tags; ~767 collision notice), review-ui.mjs (~340-341 same chain-tag wording; ~392 hold labels) and preview.mjs (~108, 115, 140, the Simulate-mode body ~344-420, ~502 at 4e64f47; ~326-402, ~484 in the snapshot). U-7-3 added no new literals. The i18n gate only checks keys that exist, so it cannot see these.

**Proposed.**

Add PENTARYN_TIES.chain.needs/needsTip/unlocks/unlocksTip shared by attributes-ui and review-ui (also dedupes them), PENTARYN_TIES.preview.* and PENTARYN_TIES.hud.inspectPreview*; replace literals with t()/f().

**Behaviour test recipe (write first, must pass before and after).**

Using look.mjs-style stubs that load lang/en.json: snapshot chainTags(row) and review-ui row() output before the change with en values set to the exact current English; assert byte-identical after.

**Risk.** en.json values must reproduce current text exactly including interpolation; snapshot enforces it.
