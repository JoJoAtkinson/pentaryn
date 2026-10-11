---
title: "Code audit 2026-10 — pentaryn-prompts"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-prompts

**Read this when:** you are about to refactor, harden or document pentaryn-prompts and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-prompts

**Purpose.**

Prompt markers. The GM drops one of six hidden marker tokens (tiny to xxl) and types a few words in an ApplicationV2 dialog. A side panel shows what the marker can see. Later, one gather call hands an LLM every prompt as tagged text: distances, bands, bearings, LOS and door classification, encounters, built packs, door lines, XP budgets and optional map crops. One replace call turns each marker into the real thing (stock actor plus patch, npc via the bridge, a level-N PHB character via dnd5e advancements, hotspot, note, light, tile, or none), stamps provenance, deletes the marker and reads back.

**Health.**

Well built at the core, too big at the edges.
- Core and tests: the pure cores (geometry-core, build-core, npc-core, readback-core) carry the contract under 403 node checks and a gather-text snapshot.
- Docs: the README (239 lines) and the playbook (476) are thorough and current.
- Oversized files: geometry-core.mjs is 1,453 lines with 77 exports across about 10 concerns. character.mjs is 955 lines and mixes compendium lookup with the advancement engine. replace.mjs#planOne is one 270-line switch. build-core.mjs is a grab bag (abilities, languages, attunement, crops decision, spec-file paths).
- Duplication: four size-word maps and two CR parsers. Pool matching is written twice inside character.mjs.
- Settings: two `setting()` readers whose fallbacks disagree with the registered defaults (gather's gatherChars fallback is 160; the registered default is 400).
- Untested glue: no tests exercise the glue files, although all but three import cleanly in node.
- Swallowed errors: 26 catch sites drop errors silently, including four core-API fallbacks in model.mjs that would hide an API drift after an update.
- Performance: the hover tooltip rebuilds a full scene model, with door classification, just to print a count.

**LLM interface.**

Today there are two paths in.
- The typed MCP tool prompt-markers (list, gather, crops, replace, show) goes through GM-guarded CONFIG.queries. It is the only module with a typed path.
- The fallback is eval-js against game.pentaryn.prompts, which has 13 keys, status().version and no describe().
- The readback `text` is identical on both paths. That is a good pattern for other modules to copy.

Weak spots:
- The fork's zod schemas are a hand-kept copy of what the module accepts, and they have drifted. `character.folder`, `{kind:'npc', actorId}`, gather `from` and crops 'on'/'off' are accepted by the module and refused by the tool. hotspot `description` is optional in the module and required by the tool.
- The gather trailer tells the LLM to page with `scenes:[next]`, which differs from the module's `from` paging.
- Read helpers are missing, so LLMs read raw flags to find markers and provenance (49 times in the log).

Target state:
- describe() on the namespace.
- Read-only helpers on the API: isPrompt, markerSize, promptText, provenanceOf.
- game.modules.get('pentaryn-prompts').api.
- A drift test pinning zod against a module-exported key table.
- One action table in the fork.

**How to extend.**

Where things go today:
- A new replacement kind goes into replace.mjs#planOne as a switch case (:158–426), plus KINDS (:33).
- Its zod With* schema goes in the fork (prompt-markers.ts:148–304).
- Then the README kinds list, the playbook, and a test in test/eval*-fixes.mjs.
- A new query needs prompts.mjs#registerQueries (:271), plus five tables in the fork (QUERIES, TIMEOUTS, ACTIONS, SCHEMAS, DEFINITION) and the switch at :879.
- A new gather fact goes into model.mjs#sceneItems, then geometry-core buildView and renderGather, then the snapshot.

What is unclear:
- Which -core file a new pure helper belongs in, given that build-core holds crops and spec-file paths.
- That patch.mjs depends on character.mjs (for findItem).
- That three places hold the encounter link distance of 30 ft (LEGEND text, groupScene default, buildView default).

No 'Extending' section exists. Findings prompts-lookup-11, -12, -27 and -30 fix this.

Cross-listed: the fork-side findings for the `prompt-markers` tool (`prompts-lookup-11`, `prompts-lookup-12`) live in [`mcp-fork.md`](mcp-fork.md).

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| prompts-lookup-7 | Performance gains | medium | S | Hover tooltip: count sight lines without the door/wall classification |
| prompts-lookup-8 | Performance gains | medium | M | Memoize the per-scene model between dialog panel, hover tooltip and debounced refreshes |
| prompts-lookup-23 | Performance gains | low | S | sceneItems: index hosts by markerId, memoize scaffold checks, stop recounting prompt tokens in gather |
| prompts-lookup-16 | Maintainability gains | medium | S | settings.mjs with a DEFAULTS table and one setting() reader; surface the gatherChars 160 vs 400 discrepancy |
| prompts-lookup-20 | Maintainability gains | medium | M | Split the 1,453-line geometry-core (77 exports, ~10 concerns) behind a re-exporting barrel |
| prompts-lookup-21 | Maintainability gains | low | S | Name the encounter and formation link distances once (LINK_FT, FORMATION_FT) |
| prompts-lookup-31 | Maintainability gains | medium | S | typeahead's ticket and keystroke state machine is pure but cannot be imported in node |
| prompts-lookup-33 | Maintainability gains | low | S | The orphan-text toast is hard-coded English |
| prompts-lookup-10 | Defragmentation | medium | M | Extract the advancement-pool name matcher (written twice) and move pack lookup out of character.mjs |
| prompts-lookup-9 | Defragmentation | low | S | One size-word table and one CR parser in geometry-core |
| prompts-lookup-22 | Defragmentation | low | S | One wall-segment builder for los.mjs and model.mjs#sceneMeta |
| prompts-lookup-24 | Defragmentation | low | S | One tokenDataFrom helper for the four actor-to-token-data clones |
| prompts-lookup-28 | Defragmentation | low | S | Two HTML-to-text converters across prompts and lookup: pin the divergence, cross-reference, do not merge |
| prompts-lookup-17 | Logging / auditability gains | medium | S | Warn once when a core token API falls back; debug-log other swallowed errors |
| prompts-lookup-18 | Logging / auditability gains | medium | S | Replace summary log line, per-phase gather timings with manifest size, structured fields in the fork log |
| prompts-lookup-14 | Hardening | medium | S | replaceMany: check replacements is an array before iterating it; add a node fake harness for the glue files |
| prompts-lookup-15 | Hardening | low | S | Crop image fetch: build relative URLs with foundry.utils.getRoute and log failures |
| prompts-lookup-32 | Hardening | low | S | typeahead: a permanent global keyup listener, a swallow set never cleared, and API calls arm capture on the bridge client |
| prompts-lookup-13 | Extendability | medium | M | Replace the 270-line planOne switch with a per-kind planner registry |
| prompts-lookup-19 | LLM interface | medium | S | Expose existing read helpers and a describe() on game.pentaryn.prompts, plus the module api |
| prompts-lookup-27 | Documentation / skills | low | S | README error-code list, the orphaned languageKeys docblock, and an 'Extending' section |

## Performance gains

### prompts-lookup-7 — Hover tooltip: count sight lines without the door/wall classification

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/model.mjs:330–332`

**Anchor:** `export function seesCount(tokenDoc) {`

**Current.**

onHoverToken (prompts.mjs) calls seesCount on every marker hover. seesCount runs panelFor(tokenDoc,{rows:0}), which for every other item within unseenWithinFt that is not seen also evaluates the lazy `r.los` door-pass classification (model.mjs panelFor loop) although the tooltip prints only panelSplit's `total`, which is just the count of isSeen rows. los.mjs documents ~0.7 ms per blocked pair on a 1,578-wall map.

**Proposed.**

1. Extract panelFor's loop into pure `panelRels(items,rel,key,unseenWithinFt)` in geometry-core next to panelSplit; panelFor calls panelSplit(panelRels(...),...).
2. Add pure `seenCount(items,rel,key)` counting items (other than key) whose rel is non-null and isSeen(rel).
3. seesCount becomes `seenCount` over sceneModel(scene,{builtWithoutProvenance:true}), keeping the try/catch returning null. The scene model itself is still built (the saving is the classification only).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs (or new test/perf-fixes.mjs wired like eval3-fixes). (1) For F.warrenScene(), F.commonScene(true), F.commonScene(false) and every prompt key k: seenCount(sc.items,sc.rel,k) === panelSplit(panelRels(sc.items,sc.rel,k,60),{rows:0,unseenWithinFt:60}).total; before extraction compare against a pasted copy of today's panelFor loop. (2) Classification skipped: build rel with makeRel(items,{gridSize:F.G,sight:{visible:..., classify:()=>{n++;return 'wall'}}}); seenCount leaves n === 0 while panelRels(...,60) gives n > 0 on a board with a closed door.

**Risk.** panelSplit.total counts los==='LOS' which equals isSeen; test (1) pins equality on three boards including a closed door.

**Related:** prompts-lookup-8

### prompts-lookup-8 — Memoize the per-scene model between dialog panel, hover tooltip and debounced refreshes

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-prompts/dialog.mjs:446–448`

**Anchor:** `      p = panelFor(tok, { rows: setting("panelRows", 12), unseenWithinFt: setting("unseenWithinFt", 60) });`

**Current.**

Dialog open, every refreshPanels (debounced 250 ms, fired by any wall/token/note change) and every marker hover rebuild sceneModel(scene) from scratch: every token's actor folder chain (isScaffold), every region testPoint per item, and makeRel's sight caches are discarded each time.

**Proposed.**

Add a small ModelCache in model.mjs: get(scene,opts) returns the cached {model,gen} while generation(scene.id) is unchanged. Bump generation from hooks registered in prompts.mjs for create/update/delete of Token (ALL updates), Wall, Note, AmbientLight, Tile, Region, plus updateScene, updateActor, updateFolder and updateJournalEntryPage (names/descriptions feed the panel). Use the cache in panelFor and seesCount only; gather() keeps calling sceneModel directly so LLM-facing manifests are always fresh. Export the hook list as INVALIDATING_HOOKS.

**Behaviour test recipe (write first, must pass before and after).**

New foundry/module/pentaryn-prompts/test/cache-fixes.mjs, wired from run.mjs: ModelCache with injected builder b=scene=>({n:++built}) and a generation map: get(s1) twice gives built 1; after bump('s1') get gives built 2; s2 independent; differing opts are separate entries. Equality: panelSplit(panelRels(cached.items,cached.rel,k,60),...) deep-equals the uncached result on F.commonScene(false). Pin INVALIDATING_HOOKS as an array literal.

**Risk.** A stale GM-side panel if a relevant change misses the hooks; GM-only UI and gather is excluded. Live-check one panel after a door toggle and an actor rename before shipping.

**Related:** prompts-lookup-7

### prompts-lookup-23 — sceneItems: index hosts by markerId, memoize scaffold checks, stop recounting prompt tokens in gather

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/model.mjs:225–230`

**Anchor:** `    const host = prov.markerId ? items.find(it => !it.isPrompt && it.kind !== "light" && it.prov?.markerId === prov.markerId`

**Current.**

Each provenance-bearing light linearly scans all items for its host (O(lights x items)); isScaffold (:22-31) walks each token's actor folder chain per model build even for many tokens sharing one actor; gather calls promptTokens per scene in pickScenes (gather.mjs:47), the paging loop (:97) and sceneItems, and replace.mjs:583 remainingFor repeats it.

**Proposed.**

1. Before the lights loop build `hostByMarker` Map from the items present at that point (tokens, hotspots, notes; tiles are pushed AFTER lights so they are not hosts today) with key `${markerId}\u0000${call ?? ''}`, FIRST item wins (matches items.find). Look hosts up from it.
2. Memoize isScaffold per actor id in a Map local to the sceneItems call.
3. In gather compute prompt counts once per scene and reuse in the paging loop.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/glue-fixes.mjs (fake harness, extended with actors/folders). Scene: two hotspot tokens with prov {markerId:'m1',call:'pm-a'} and {markerId:'m2',call:null}; three lights with prov {markerId:'m1',call:'pm-a'} (attaches to first hotspot), {markerId:'m2',call:'pm-b'} (call mismatch, own item) and no markerId (own item). Assert before and after that sceneItems(scene).map(i=>[i.key,i.kind,i.light??null]) deep-equals the recorded array, the first hotspot's light is 'dim 10 ft', and two 'light' items exist. Add a duplicate-host case (two items with the same markerId+call) to pin first-wins. Scaffold: actor in folder 'Temp Markers' excluded, goblin in 'Monsters' kept. Paging: extract pure pageScenes(list,counts,maxPrompts): counts [40,30,5] max 60 gives take [s1], next 's2'; [70] gives take [s1], next null.

**Risk.** Host match must keep call-equality semantics and first-wins; both pinned.

**Related:** prompts-lookup-8

## Maintainability gains

### prompts-lookup-16 — settings.mjs with a DEFAULTS table and one setting() reader; surface the gatherChars 160 vs 400 discrepancy

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/prompts.mjs:22–53`

**Anchor:** `function registerSettings() {`

**Current.**

Settings are registered inline (prompts.mjs:22-53) and read through two identical local setting() helpers (dialog.mjs:27, gather.mjs:13). gather.mjs:83 falls back to gatherChars 160 while the registered default is 400 (prompts.mjs:29) and renderGather's own default is 400. The fallback only fires if the setting is unregistered or reads throw.

**Proposed.**

New settings.mjs exporting DEFAULTS (read the exact current values from registerSettings when writing), registerSettings reading from DEFAULTS, and `setting(key,fallback=DEFAULTS[key])` with the same try/catch semantics. dialog.mjs and gather.mjs import it. gather.mjs:83 keeps passing 160 explicitly with a TODO until Joe decides.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs: DEFAULTS deep-equals the values captured from today's registerSettings. With a fake game.settings.register recording calls, run the OLD registerSettings (before the move) and the new one and assert the recorded (key, scope, config, type, default, range, choices) arrays are identical. With game.settings.get throwing: setting('gatherChars') === 400 and setting('gatherChars',160) === 160.

**Risk.** Registration must stay identical (settings persist by key); the recorded-registration comparison pins every field.

**Related:** prompts-lookup-14

### prompts-lookup-20 — Split the 1,453-line geometry-core (77 exports, ~10 concerns) behind a re-exporting barrel

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-prompts/geometry-core.mjs:12–1453`

**Anchor:** `export const MODULE = "pentaryn-prompts";`

**Current.**

geometry-core.mjs (77 exports, verified) mixes sizes/footprints, bands/bearings, grid distance, the pure LOS ray test, grouping/ids, hashes/call ids, text helpers, the gather renderer, XP budgets, door lines, placement/panel helpers, buildView/makeRel and error codes. build-core.mjs (482 lines, 33 exports, verified) is a second grab bag. A builder must read both to know where a pure helper goes.

**Proposed.**

Split into size-core, grid-core, sight-core, group-core, text-core, gather-text-core, xp-core, errors-core (membership as in the original plan; dependency order size, grid, sight, text, xp, then group, then gather-text, acyclic). geometry-core.mjs becomes `export * from` each plus MODULE and VERSION so every importer and test is unchanged. Move cropsDecision and specFileUrl out of build-core keeping re-exports. Add a 'Where pure code goes' table to the README.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs, before the split: assert Object.keys(await import('../geometry-core.mjs')).sort() deep-equals the 77 names printed by `node -e "import('./geometry-core.mjs').then(m=>console.log(JSON.stringify(Object.keys(m).sort())))"` today, and the same for build-core's 33. All existing checks and test/snapshots/two-scenes.txt must pass unchanged without UPDATE_SNAPSHOTS. Each new file must load in node with game/canvas/foundry undefined.

**Risk.** Circular imports between new cores; the export-surface test catches dropped exports and the snapshot catches rendering changes.

**Related:** prompts-lookup-9, prompts-lookup-21

### prompts-lookup-21 — Name the encounter and formation link distances once (LINK_FT, FORMATION_FT)

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/geometry-core.mjs:653–654`

**Anchor:** `  "Encounter E# = linked by <=30 ft with LOS; a hostile built creature in it brings its pack (the hostile built creatures linked the same way).",`

**Current.**

The 30 ft encounter link and 15 ft formation link appear in the LEGEND text (:653-654), groupScene's defaults (linkFt = 30, formationFt = 15) and buildView's defaults, plus README. Changing one leaves the LLM-facing legend wrong.

**Proposed.**

Add `export const LINK_FT = 30, FORMATION_FT = 15;` near BANDS; build the two LEGEND lines from them with template literals; use them as groupScene/buildView defaults.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs: before the change pin check('LEGEND unchanged', LEGEND, <today's string copied verbatim>); the two-scenes snapshot covers renderGather. Defaults: groupScene on two prompts 30 ft apart groups them together, 35 ft apart gives two groups; formation at 15 ft yes, 20 ft no (use F.prompt fixtures at grid offsets, gridFt 5).

**Risk.** Whitespace drift in the template fails the LEGEND check and the snapshot.

**Related:** prompts-lookup-20

### prompts-lookup-31 — typeahead's ticket and keystroke state machine is pure but cannot be imported in node

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/typeahead.mjs:17–107`

**Anchor:** `window.addEventListener("keyup", onKeyUp, true);`

**Current.**

`typeahead.mjs` (107 lines, imported by `prompts.mjs:13` and `dialog.mjs:22`) holds a pure state machine:
- Tickets live in a `Map` in start order, and keys go to the newest pending ticket.
- Escape closes with `save`, Shift+Escape with `discard`, Cmd/Ctrl+Enter with `save`; plain Enter adds a newline.
- Backspace drops one code point (`Array.from`).
- Modifier keys and Cmd/Ctrl shortcuts pass through to the browser; keys typed while `isComposing` are swallowed but not recorded.
- After 3,500 ms a ticket is cancelled, and its text is an orphan. Orphan text goes to the sink, or to a toast cut to 120 characters.

Line 70 calls `window.addEventListener` at import, so `test/run.mjs` (node) cannot import the file, and none of these rules has a fixture. It is the only prompts file that decides what text the user sees and has no test coverage. Imported by `prompts.mjs` and `dialog.mjs` only through `start`/`take`/`cancel`/`setOrphanSink`.

**Proposed.**

Move the logic verbatim into `typeahead-core.mjs`: `createTypeahead({ setTimer, clearTimer, timeoutMs = 3500, onOrphan })`, returning `{ start, take, cancel, isCapturing, setOrphanSink, keyDown(ev) → swallow:boolean, keyUp(code) → swallow:boolean }`. Here `ev` is a plain `{key, code, metaKey, ctrlKey, shiftKey, isComposing}`. `typeahead.mjs` keeps the two window listeners (same capture flag, keyup still installed at import), calls `preventDefault()` + `stopImmediatePropagation()` when the core says swallow, and re-exports the same functions, so `prompts.mjs` and `dialog.mjs` are untouched.

**Behaviour test recipe (write first, must pass before and after).**

Characterise the current file first, without extraction: in a new `test/typeahead.mjs` (imported from `test/run.mjs`), set `globalThis.window = { addEventListener: (t, f) => (L[t] = f), removeEventListener() {} }`, `globalThis.ui = { notifications: { warn: s => toasts.push(s) } }` and fake `setTimeout`/`clearTimeout`. Then dynamic-import `../typeahead.mjs` and drive `L.keydown`/`L.keyup` with `{key, code, metaKey, ctrlKey, shiftKey, isComposing, preventDefault(){}, stopImmediatePropagation(){}}`. Pin:
- `t1 = start()`; type `one`; `t2 = start()`; type `two` → `take(t1)` is `{text:'one', close:null}` and `take(t2)` is `{text:'two', close:null}`; `isCapturing()` is false.
- Shift alone and Cmd+c are not swallowed (`preventDefault` not called). Cmd+Enter → close `save`. Shift+Escape → `discard`.
- Backspace after `👍a` leaves `👍`. ArrowLeft is swallowed and the text is unchanged. `{key:'x', isComposing:true}` is swallowed and the text is unchanged.
- With no ticket, keydown is not swallowed. A code swallowed on keydown is swallowed exactly once on keyup, even after `take()`.
- Firing the 3,500 ms timer with text `'  hi '` and no sink → one toast `Typed before a prompt box opened and not used: "hi"`. With a sink returning true → no toast. Whitespace-only text → neither. `take(999)` → `{text:'', close:null}`.

After the extraction, run the same table against `createTypeahead` directly and keep the stub-window run as well.

**Risk.** Verbatim move; the stub-window run pins the old file before anything moves.

**Related:** prompts-lookup-32, prompts-lookup-33

### prompts-lookup-33 — The orphan-text toast is hard-coded English

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/typeahead.mjs:84`

**Anchor:** ``  ui.notifications?.warn(`Typed before a prompt box opened and not used: "${text.trim().slice(0, 120)}"`);``

**Current.**

The one user-facing string in `typeahead.mjs` bypasses `lang/en.json` (nested `PENTARYN_PROMPTS.*`, already declared in `module.json:10`), so the i18n gate, which checks keys only, cannot see it. Every other prompts notification goes through `game.i18n`.

**Proposed.**

Add `PENTARYN_PROMPTS.typeahead.orphan`: `Typed before a prompt box opened and not used: "{text}"`. Call `game.i18n.format("PENTARYN_PROMPTS.typeahead.orphan", { text: text.trim().slice(0, 120) })` with the literal key, so `jsscan` resolves it. Do not route it through a prefix helper imported from another file: the aoe-movement-portals-3 drop note explains why that blinds the gate.

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs`: load `lang/en.json`, implement `format` as `{k}` substitution, and assert the result for `{text: 'hello world'}` equals `Typed before a prompt box opened and not used: "hello world"`, byte-identical to today's literal; repeat for a 200-character input (cut at 120). `make foundry-prompts-check` (i18n gate) resolves the new key. The typeahead stub run from prompts-lookup-31 gets a `game.i18n.format` stub, and its toast assertion stays the same string.

**Risk.** None; no module.json change.

**Related:** prompts-lookup-31



## Defragmentation

### prompts-lookup-10 — Extract the advancement-pool name matcher (written twice) and move pack lookup out of character.mjs

**Category:** Defragmentation · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-prompts/character.mjs:212–216`

**Anchor:** `          const tail = n => String(n).split(/:\s*/).pop();`

**Current.**

The three-step pool match (exact uuid in pool, then sameName on full name, then sameName on the tail after ':') is written in collectAdvancements (:212-216) and uuidsFor (:542-547), each computing findIndex twice per word. findItem, suggest, notFound, PACKS and indexOf (:26-88) are generic compendium lookups that patch.mjs:29 and replace.mjs:28 import from the 955-line character builder. findItem's inline type map (:59) has no 'feat' (matches any item type) while suggest's TYPE_OF (:70) filters feats; undocumented.

**Proposed.**

1. Add `poolIndex(word,pool,names)` to build-core.mjs returning the matched index or -1 with today's order; use it in both places.
2. Leave poolName (:138, swallows fromUuid errors via docAt) and namesFor (:549, does not) alone: they are NOT strictly equivalent on the rejection path, so do not merge them.
3. Move PACKS, indexOf, findItem, suggest, notFound to a new packs.mjs; character.mjs re-exports findItem and notFound; switch patch.mjs/replace.mjs imports.
4. Name the inline map FIND_TYPE with a comment that feat is deliberately absent (origin feats live in other item types).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/eval3-fixes.mjs. poolIndex with pool ['Compendium.a.Item.1','Compendium.a.Item.2'], names ['Divine Order: Protector','Divine Order: Thaumaturge']: 'Compendium.a.Item.2' gives 1; 'Protector' gives 0; 'thaumaturge' gives 1; 'Divine Order: Protector' gives 0; 'Order Divine: Protector' gives 0; 'Nope' gives -1; also assert equality with a pasted copy of the :214-216 expression over the same table. findItem type behaviour with stubs globalThis.game={packs:{get:id=>id==='dnd-players-handbook.feats'?{getIndex:async()=>[{_id:'x',name:'Tough',type:'equipment'}],getDocument:async id=>({id})}:null}}: await findItem('Tough','feat') resolves {id:'x'} (no type filter), await suggest('Tuff','feat') returns [] (filtered). indexCache is module-level, so use distinct pack ids or run in a fresh import.

**Risk.** A move with re-exports; import breakage shows at load. The reference-expression test pins match order; the stub test pins the feat asymmetry.

**Related:** prompts-lookup-9

### prompts-lookup-9 — One size-word table and one CR parser in geometry-core

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/replace.mjs:37`

**Anchor:** `const NPC_SIZE = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg", huge: "huge", gargantuan: "grg", grg: "grg" };`

**Current.**

The full size-word map exists in replace.mjs:37 (NPC_SIZE), patch.mjs:45 (exported SIZE_WORDS, identical), pentaryn-lookup.mjs (SIZE_KEYS) and, as a deliberate subset (tiny/small/sm/medium/med/large/lg), character.mjs:376. CR parsing is byte-identical in replace.mjs:440 crNumber and pentaryn-lookup crNum. The fork repeats the word lists (prompt-markers.ts NPC_SIZES/SIZE_WORDS) and npc-core.mjs:13 has NPC_SIZES.

**Proposed.**

In geometry-core.mjs next to DND_SIZE_WIDTH export SIZE_WORDS (full map), PC_SIZE_WORDS (the 7-key subset) and parseCr (crNumber's body). replace.mjs drops NPC_SIZE/crNumber and imports them; patch.mjs re-exports SIZE_WORDS from geometry-core so its surface is unchanged; character.mjs uses PC_SIZE_WORDS. pentaryn-lookup keeps its own copy (modules cannot import each other) with a comment naming prompts' geometry-core as the twin.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs, before the change: add `export` to NPC_SIZE and crNumber in replace.mjs (no-behaviour edit) and import patch.mjs SIZE_WORDS. For w in ['tiny','small','sm','medium','med','large','lg','huge','gargantuan','grg','Huge','x','']: new SIZE_WORDS[w.toLowerCase()] ?? null equals old NPC_SIZE and patch values. PC_SIZE_WORDS.huge === undefined and PC_SIZE_WORDS.small === 'sm'. For cr in ['1/4',0.25,'3',3,'',null,undefined,'x',' 1 / 2 ','1/8'] parseCr(cr) equals old crNumber(cr): [0.25,0.25,3,3,null,null,null,null,0.5,0.125].

**Risk.** Widening character sizes by accident; the PC_SIZE_WORDS.huge assertion catches it.

**Related:** prompts-lookup-6, prompts-lookup-11

### prompts-lookup-22 — One wall-segment builder for los.mjs and model.mjs#sceneMeta

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/los.mjs:23–34`

**Anchor:** `function wallsFor(scene, levelId) {`

**Current.**

Scene walls become wallSegment records in los.mjs wallsFor (with level filter, all walls) and model.mjs sceneMeta (:269-274: only walls with w.sight truthy, no level filter, plus a separate doors list), using the same pixels-per-foot formula and field mapping. The TODO(levels) lives in one copy only.

**Proposed.**

Export `wallSegmentsOf(scene,{levelId=null,sightOnly=false}={})` from los.mjs; wallsFor becomes wallSegmentsOf(scene,{levelId}); sceneMeta's walls become wallSegmentsOf(scene,{sightOnly:true}); the doors list stays in sceneMeta.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs with a plain scene stub {dimensions:{size:100,distancePixels:20,sceneWidth:1000,sceneHeight:800,sceneX:0,sceneY:0,distance:5},grid:{distance:5},walls:[w1 sight 20 threshold {sight:2}, w2 sight 0, d1 door 1 sight 20 levels Set(['L2'])],...}. sceneMeta also calls heightWarning(scene): run it first and extend the stub until it passes. Before the change record sceneMeta(stub).walls and .doors as golden values (w1 threshold should be 40, w2 excluded, d1 included in both). After: same goldens, plus wallSegmentsOf(stub,{levelId:'L1'}) excludes d1 and includes w1 and w2.

**Risk.** The two callers filter differently (sight truthy vs not); the sightOnly flag and golden arrays pin both.

**Related:** prompts-lookup-20

### prompts-lookup-24 — One tokenDataFrom helper for the four actor-to-token-data clones

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/prompts.mjs:88–93`

**Anchor:** `  const td = await actor.getTokenDocument({ x: m.x - w / 2, y: m.y - w / 2 }, { parent: canvas.scene });`

**Current.**

Four sites run getTokenDocument, toObject, delete _id, Object.assign: prompts.mjs:88-93 (position passed to getTokenDocument is unsnapped, final x/y are snapped, level set only if canvas.level.id), dialog.mjs:378-381 (final x/y rounded, elevation and level assigned UNCONDITIONALLY even when null), replace.mjs:357-361 and :467-471 (x/y same as passed, level only if marker.level, no elevation). The differences are easy to lose.

**Proposed.**

Add to markers.mjs `tokenDataFrom(actor,scene,{at,x,y,extra={}})` where `at` is the position handed to getTokenDocument and x,y are the final coordinates; it returns toObject() without _id with Object.assign(data,{x,y},extra). Callers keep their own conditional level/elevation logic and pass it via extra (dialog passes elevation and level unconditionally, replace sets level conditionally after). The helper must not normalise level or elevation.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs with fake actor {getTokenDocument:async(pos,{parent})=>({toObject:()=>({_id:'z',name:'A',x:pos.x,y:pos.y,width:1,flags:{}})})}: tokenDataFrom(actor,scene,{at:{x:1,y:2},x:10,y:20,extra:{elevation:5,level:'L1',hidden:true}}) deep-equals {name:'A',x:10,y:20,width:1,flags:{},elevation:5,level:'L1',hidden:true} with no _id; extra {level:null} yields an own property level === null (dialog behaviour) while a caller that passes no level key gets none. Dialog/prompts/replace call sites need live or fake-harness checks.

**Risk.** Level/elevation semantics differ per caller; the two level assertions pin both.

### prompts-lookup-28 — Two HTML-to-text converters across prompts and lookup: pin the divergence, cross-reference, do not merge

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/geometry-core.mjs:571–584`

**Anchor:** `export function stripHtml(html) {`

**Current.**

prompts stripEnrichers/stripHtml (geometry-core.mjs:561-584) and lookup-core toPlainText (:36-75) do the same job under different contracts, and modules cannot import each other. Measured today: '<p>a</p><p>b</p>' gives 'a\nb' vs 'a b'; '&amp;Reference[prone]' gives '&Reference[prone]' vs 'prone'; '[[/r 2d6]]' gives '2d6' vs 'r 2d6'; 'A &mdash; B &#39;c&#39;' gives 'A &mdash; B 'c'' vs 'A - B 'c'' (em dash decoded); '<script>x</script>y' gives 'xy' vs 'y'; '@Embed[Compendium.p.RollTable.t rollable]{T}' gives '' vs the embed untouched. The @Embed regexes also differ (model.mjs EMBED_RE captures {label}). Risk is someone 'fixing' one to match the other.

**Proposed.**

1. Comment header on each function naming the other and its contract.
2. The same input table in both test suites, each pinning its own measured output.
3. Merge only if a shared pentaryn-lib module is ever created.

**Behaviour test recipe (write first, must pass before and after).**

Add the 7-input table to foundry/module/pentaryn-prompts/test/run.mjs (stripHtml) and foundry/module/pentaryn-lookup/test/run.mjs (toPlainText) with the measured outputs above: prompts ['a\nb','Cover','&Reference[prone]','2d6','A &mdash; B \'c\'','xy',''], lookup ['a b','Cover','prone','r 2d6','A — B \'c\'','y','@Embed[Compendium.p.RollTable.t rollable]{T}'] for inputs ['<p>a</p><p>b</p>','@UUID[Compendium.x]{Cover}','&amp;Reference[prone]','[[/r 2d6]]','A &mdash; B &#39;c&#39;','<script>x</script>y','@Embed[Compendium.p.RollTable.t rollable]{T}'].

**Risk.** Tests only; they lock each contract so a unification is a deliberate diff.

**Related:** prompts-lookup-20

## Logging / auditability gains

### prompts-lookup-17 — Warn once when a core token API falls back; debug-log other swallowed errors

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/model.mjs:145–151`

**Anchor:** `  try { size = tok.getSize?.(); } catch { /* fall back below */ }`

**Current.**

tokenGeometry swallows failures of getSize, getMovementOrigin, getVisibilityTestPoints and getOccupiedGridSpaceOffsets (:145-151), and regionNames, toHexCubes, gridDiagonals do the same. After a core update renames one, distances and LOS silently switch to pure approximations. los.mjs:85-90 already warns once for its own fallback. Also character.mjs findItem throws 'BAD_SPEC: <uuid> is not an item' (:56) which a `.catch(() => null)` turns into a misleading 'no spell' problem.

**Proposed.**

Add pure log.mjs: makeLog(module,sink=console) returning drift(where,err) (console.warn once per `where`) and debug(where,err) (console.debug only when CONFIG.debug[module]). Call drift in the core-API catches and debug in the other swallowed catches, keeping every fallback and return value. Export tokenGeometry for tests.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs: sink collects warn/debug. L.drift('Token#getSize',new Error('x')) twice gives one warn with message 'pentaryn-prompts | Token#getSize: core API failed, using the fallback'; L.debug with no CONFIG gives 0 entries, with globalThis.CONFIG={debug:{'pentaryn-prompts':true}} gives 1. Behaviour pin (before and after): tokenGeometry({x:0,y:0,width:1,height:1,elevation:0,getSize(){throw 1},getMovementOrigin(){throw 1}},100) returns rect {x:0,y:0,w:100,h:100}, centre {x:50,y:50,elevation:0}, origin equal to centre, coreSquares false, squares [{i:0,j:0}].

**Risk.** Logging only; fallbacks unchanged and pinned by the tokenGeometry test. One warn per site per page, debug off by default.

**Related:** prompts-lookup-18, prompts-lookup-15

### prompts-lookup-18 — Replace summary log line, per-phase gather timings with manifest size, structured fields in the fork log

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/replace.mjs:699–700`

**Anchor:** `  return { dryRun: false, call: callOut, text: renderReplace({ dryRun: false, call: callOut, rows: results, remaining, encounters }),`

**Current.**

gather logs one line (gather.mjs:123) with prompts, scenes, crops and total ms but not manifest size (the manifest is written to a world setting on every gather and broadcast, ring of 5) or a phase split. replaceMany logs nothing on success. The fork's only log is `prompt-markers ${action}` (prompt-markers.ts:878) with no call id, counts or duration.

**Proposed.**

1. Pure gatherLogLine(stats) producing today's exact text plus ' · model N ms, embeds N, render N, crops N, manifest N B'; use it at gather.mjs:123.
2. Pure replaceLogLine({call,dryRun,ok,failed,created,ms}) logged before the return at replace.mjs:699 and the dry-run return (~:623).
3. Fork: after each response log.info('prompt-markers done',{action,call:res?.call,counts:res?.counts,ms,module:res?.version}).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs: gatherLogLine({call:'pm-1',prompts:3,scenes:1,crops:0,ms:12,phases:[5,1,4,2],bytes:2048}) starts with exactly 'pentaryn-prompts | gather pm-1: 3 prompts on 1 scene(s), 0 crop(s), 12 ms' (today's text) and ends ' - model 5 ms, embeds 1, render 4, crops 2, manifest 2048 B' with the same separator char used in code; replaceLogLine pinned similarly. Fork prompt-markers.test.ts: mock logger.child().info and assert one 'prompt-markers done' call with objectContaining({action:'gather'}) for the existing gather fixture.

**Risk.** Logging only; return values untouched. JSON.stringify of the manifest costs one pass per gather.

**Related:** prompts-lookup-17

## Hardening

### prompts-lookup-14 — replaceMany: check replacements is an array before iterating it; add a node fake harness for the glue files

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/replace.mjs:597–598`

**Anchor:** `  for (const r of replacements ?? []) if (r?.ring) ringData(r.ring, null);   // BAD_SPEC on a bad tier, before anything runs`

**Current.**

The ring pre-check at :597 iterates `replacements` before :598 checks Array.isArray. replaceMany({replacements:{a:1}}) therefore throws a bare TypeError (object is not iterable) instead of 'BAD_SPEC: replacements must be a non-empty array'. The fork's zod blocks it but the eval-js path does not. The glue files (replace, gather, model, markers, patch, character, npc, crops, los) import in node, yet only -core files are tested.

**Proposed.**

1. Swap lines 597 and 598 so the array check runs first.
2. Add test/fakes.mjs (~40 lines): Coll extends Map (find/filter/contents), fakeScene({id,tokens,walls,notes,lights,tiles,size:100}) with createEmbeddedDocuments (records data, assigns ids, returns docs with flags), deleteEmbeddedDocuments, getEmbeddedDocument, and installGame({scenes,actors,settings}) setting globalThis.game, CONST.TOKEN_DISPOSITIONS, CONST.DOCUMENT_OWNERSHIP_LEVELS.

**Behaviour test recipe (write first, must pass before and after).**

New foundry/module/pentaryn-prompts/test/glue-fixes.mjs called from run.mjs. Install fake game with settings.get throwing; fake scene s1 with marker m1 {flags:{'pentaryn-prompts':{marker:'mid',prompt:'a lantern'}}}. Pin (capture the exact strings by running first): (a) two specs on the same marker in a dry run give text beginning 'replace (by marker) - dry run: 1 ok, 1 failed' and a row noting 'm1 is replaced twice in this call'; (b) replaceMany({replacements:[]}) rejects 'BAD_SPEC: replacements must be a non-empty array'; (c) a spec with ring:'gold' rejects 'BAD_SPEC: ring must be pc|foe|named|mook|none, got gold'; (d) replaceMany({replacements:{a:1}}) records a TypeError before the fix and rejects with a BAD_SPEC code after; flip that assertion in the same commit.

**Risk.** Only the non-array error path changes; (a)-(c) pin that valid input and other error orders are unchanged.

**Related:** prompts-lookup-13, prompts-lookup-16

### prompts-lookup-15 — Crop image fetch: build relative URLs with foundry.utils.getRoute and log failures

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/crops.mjs:19–22`

**Anchor:** ``       const res = await fetch(src.startsWith("http") || src.startsWith("/") ? src : `/${src}`); ``

**Current.**

bitmap() builds `/${src}` for relative asset paths; under a route prefix every background/token image 404s and the catch returns null silently, so crops render as grey boxes with no warning. replace.mjs already uses foundry.utils.getRoute for the spec file. This fixes a latent bug only under a route prefix; unprefixed URLs stay byte-identical.

**Proposed.**

Extract pure exported `assetUrl(src,getRoute)`: absolute http(s):, data:, blob: and leading-slash sources pass through unchanged (leading-slash stays as-is to keep today's behaviour), otherwise getRoute(src). On a non-ok response or throw, debug-log `${MODULE} | crop image ${src} not loaded` via the debug helper from prompts-lookup-17, still returning null.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs with getRoute = p => '/' + p: 'maps/a.webp' gives '/maps/a.webp'; '/maps/a.webp' gives '/maps/a.webp'; 'https://x/y.png' unchanged (today's results). With getRoute = p => '/foundry/' + p: 'maps/a.webp' gives '/foundry/maps/a.webp' (the fix). bitmap is not exported today: export it and assert `await bitmap('a.webm', new Map())` is null (VIDEO guard) without touching fetch.

**Risk.** No route prefix: identical URLs (pinned). data:/blob: previously produced a broken '/data:' URL, now fetched as-is (bug fix).

**Related:** prompts-lookup-17

### prompts-lookup-32 — typeahead: a permanent global keyup listener, a swallow set never cleared, and API calls arm capture on the bridge client

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/typeahead.mjs:24, 55–70`; `foundry/module/pentaryn-prompts/prompts.mjs:79`

**Anchor:** `const swallowedUps = new Set();`

**Current.**

1. Line 70 installs a capturing `keyup` listener at import. It is never removed and is not tied to any hook registry: there is no `uninstall`, unlike aoe's `hookIds`/`uninstall`.
2. `swallowedUps` keeps the code of every key swallowed on keydown until that key's keyup arrives. If the keyup never reaches `window` (focus leaves the browser window while the key is held), the code stays. The next keyup of that physical key, outside any capture, is then swallowed once, before core's KeyboardManager sees it.
3. `placeAtCursor`'s API path (`prompts.mjs:79`, `ticket ??= Typeahead.start();   // the API path too`) arms capture for up to 3.5 s on whichever client runs the call, and there is no opt-out (`{ticket: null}` is reassigned by `??=`). When an LLM places a marker through eval-js on the GM bridge client and that client is Joe's browser, his keystrokes there go into the marker's buffer. The README's API section does not say this.

**Proposed.**

1. Export `uninstall()`, which removes both listeners and clears the state (for tests and the kit's hook registry).
2. **[declared]** Clear `swallowedUps` on `window` `blur`. Only the stale-keyup case changes.
3. Docs only: a README API line saying that `placeAtCursor` and the drop path arm keyboard capture for up to 3.5 s on the calling client. An opt-out flag would be a feature and is not proposed here.

**Behaviour test recipe (write first, must pass before and after).**

On the prompts-lookup-31 harness:
- `keyDown({key:'a', code:'KeyA'})` while capturing; fire the stub `blur`; then `keyUp('KeyA')`. Today this returns swallow = true: write that as a KNOWN assert and flip it in the declared commit.
- `uninstall()`: the stub window records `removeEventListener('keydown', f, true)` and `('keyup', f, true)`; a second `uninstall()` is a no-op; after it, `start()` then a keydown is not captured until the module re-installs.

**Risk.** Low; the blur clear touches only a key whose keyup was lost.

**Related:** prompts-lookup-31, aoe-movement-portals-12 (hook registry template)


## Extendability

### prompts-lookup-13 — Replace the 270-line planOne switch with a per-kind planner registry

**Category:** Extendability · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-prompts/replace.mjs:158–426`

**Anchor:** `async function planOne(e) {`

**Current.**

planOne is one switch over eight kinds with closures (plan.exec) capturing local state; KINDS (:33) is a separate frozen list whose order is user-visible (BAD_SPEC message at :53 joins it with '|'). Adding a kind means editing the middle of a 743-line file; no test exercises planOne.

**Proposed.**

Create kinds/actor.mjs (actor+npc), kinds/character.mjs, kinds/hotspot.mjs, kinds/note.mjs, kinds/simple.mjs (light, tile, none), each exporting plan(e,ctx) with today's case body unchanged. replace.mjs: `const PLANNERS = {actor,npc,character,hotspot,note,light,tile,none}`; `export const KINDS = Object.freeze(Object.keys(PLANNERS))` in today's order; planOne builds the shared header and delegates. Add an 'Extending: a new replacement kind' README section.

**Behaviour test recipe (write first, must pass before and after).**

Depends on the fake harness in prompts-lookup-14 (test/fakes.mjs). Characterisation FIRST, with golden strings captured by running the current code (do not hand-type them): KINDS deep-equals ['actor','npc','character','hotspot','note','light','tile','none']; with a fake scene s1 holding marker m1 run replaceMany({replacements:[{sceneId:'s1',markerId:'m1',with:X}],dryRun:true}) for X in {kind:'light',config:{dim:10}}, {kind:'tile',src:'a.webp'}, {kind:'none',reason:'r'}, {kind:'note',name:'N',html:'<p>x</p>'} and save .text and .results[0] as golden; {kind:'x'} yields a BAD_SPEC row containing 'with.kind must be one of actor|npc|character|hotspot|note|light|tile|none'. Real-run light against the fake: created AmbientLight data has the marker centre x/y and provenance.markerId 'm1', and the marker is deleted. Actor/npc/character need bridge+dnd5e stubs: keep those bodies byte-identical in the move (diff the text) and live-test.

**Risk.** Closure capture moves when case bodies become functions; golden dry-run text and the real-run light pin catch placement/provenance changes.

**Related:** prompts-lookup-14, prompts-lookup-11, prompts-lookup-27

## LLM interface

### prompts-lookup-19 — Expose existing read helpers and a describe() on game.pentaryn.prompts, plus the module api

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/prompts.mjs:317–340`

**Anchor:** `    const api = {`

**Current.**

The api has 13 keys (gather,list,crops,show,replace,replaceMany,open,place,ensureMarkers,model,manifests,status,version) and no method manifest. LLMs hand-roll reads of raw flags (the audit cites 27 raw marker-flag and 22 provenance reads in eval.jsonl; not re-verified) although isPromptToken, markerSizeOfToken, promptText (markers.mjs), provenanceOf, promptTokens (model.mjs), resolveScene and manifestFor (gather.mjs) already exist. The playbook trap that `replace` takes ONE spec and `replaceMany` the batch has no in-API statement.

**Proposed.**

Add read-only aliases isPrompt, markerSize, promptText, provenanceOf, markersOn(sceneRef) and manifest, plus `describe: () => DESCRIBE` from a new api-manifest.mjs (args and returns per key, with replace noted as 'ONE replacement - use replaceMany for a batch'). Export API_KEYS from api-manifest.mjs. Also set game.modules.get(MODULE).api = api.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-prompts/test/run.mjs: Object.keys(DESCRIBE.methods).sort() equals API_KEYS.sort() and API_KEYS equals today's 13 keys plus the new aliases; prompts.mjs asserts in a dev check that Object.keys(api) equals API_KEYS (prompts.mjs is not node-importable, so the equality is checked by a regex-free lint: export a `buildApi(deps)` seam if a node test of the real object is wanted). markersOn against the fake harness (prompts-lookup-14): a scene with marker m1 'a lantern' (mid) and an ordinary token returns [{id:'m1',size:'mid',text:'a lantern'}].

**Risk.** Additive keys only; existing keys unchanged.

**Related:** prompts-lookup-2, prompts-lookup-11

## Documentation / skills

### prompts-lookup-27 — README error-code list, the orphaned languageKeys docblock, and an 'Extending' section

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-prompts/README.md:89–90`

**Anchor:** `` args as above. Errors are `Error("<CODE>: detail")`: `TEXT_CHANGED`, `MARKER_GONE`, `CALL_UNKNOWN`, ``

**Current.**

The README error list (:89-90) omits DRY_RUN_REQUIRED, which is in CODES (geometry-core.mjs:1439) and thrown at replace.mjs:628 (README mentions it only in prose at :171), and the fork-only MODULE_MISSING and TIMEOUT (prompt-markers.ts:618,:624). The JSDoc for languageKeys (build-core.mjs:259-264) sits above LANGUAGE_ALIASES instead of languageKeys. No section says where a new kind, query, gather fact or pure helper goes.

**Proposed.**

List all eight CODES plus the two fork codes in the error sentence and say which path throws each; move the docblock directly above `export function languageKeys`; add '## Extending' (new kind per prompts-lookup-13, new query per -12, new gather fact via model.mjs sceneItems/buildView/renderGather and the snapshot with UPDATE_SNAPSHOTS, where pure code goes per -20, tests and fixtures); add a routing row for prompts and lookup in context/foundry/README.md.

**Behaviour test recipe (write first, must pass before and after).**

Doc guard in foundry/module/pentaryn-prompts/test/run.mjs: take the README text from 'Errors are' to the next blank line and assert, for every c in CODES, that the paragraph includes '`' + c + '`'. Today this fails only for DRY_RUN_REQUIRED (a whole-file includes check would pass already because of :171, so it must scope to that paragraph). Test-only.

**Risk.** None; docs and a test only.

**Related:** prompts-lookup-13, prompts-lookup-12, prompts-lookup-20

## Files added to the audit after the first pass

- `typeahead.mjs` (107 lines): prompts-lookup-31, -32, -33.
- `readback-core.mjs` (185 lines): reviewed. It is pure and node-tested through `test/eval2-fixes.mjs`, `test/eval3-fixes.mjs` and `test/usability-fixes.mjs`, all three run by `test/run.mjs:413–415`. Its header documents both row shapes, real run and dry run. Nothing found.
- `styles/prompts.css` (49 lines): reviewed. Every rule is scoped under `.pentaryn-prompts` or `.pentaryn-prompts-tip` with the `.pp-` prefix, as the §2.1 prefix table expects. Nothing found.
