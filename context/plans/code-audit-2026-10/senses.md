---
title: "Code audit 2026-10 — pentaryn-senses"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-senses

> **Re-anchored to 4e64f47 on 2026-10-11.** Since the snapshot, commit 17275c9 (usability re-run) changed only `light.mjs` (818 → 847 lines), `light-core.mjs` (283 → 299), `lang/en.json`, `styles/light.css`, `test/light.mjs`, `module.json` (0.4.0 → 0.4.1) and `README.md` in this module. `senses.mjs`, `chain.mjs`, `chain-core.mjs`, `glow.mjs` and `migrate.mjs` are byte-identical, so every anchor in them keeps its line. `light.mjs` offsets from the snapshot: +0 up to `:187`, +3 after it (Argon collapse in `pick`), +15 after `:314` (`announce`, `ensureTorchActivity`), +21 after `:630` (outshone flame in `decorateSheet`), +29 after `:725` (new `createItem` hook). Each **Where** below gives the 4e64f47 line and the snapshot line. Nothing was resolved or made obsolete by the re-run. -25 and -29 are extended, and **-38** is new. Node suite now 156 checks (was 151).

**Read this when:** you are about to refactor, harden or document pentaryn-senses and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-senses

**Purpose.**

Lights carried by items (shards, plus lit torches/lamps/lanterns/candles with a hood), the Light cantrip (On me / Pick a target / End; the GM reconciles the token light or an AmbientLight from a flag on the Light item), the 'Broken glow' light animation (shader plus a wandering wave), token chains (an iron chain drawn between two tokens, with Token HUD link/break), and a one-shot reset of the darkvision sight stored by the retired 0.3 sync (dnd5e 6 senseVisionSync).

**Health.**

Mostly well-organised. The pure halves (light-core 283, chain-core 58, migrate's planSightReset) are node-tested (151 checks at the snapshot; 156 at 4e64f47, the 5 new ones pin `lightingItemId`). The glue keeps its writes on the active GM and wraps its hooks. Weak spots: (1) senses.mjs mixes the entry/publish code with the carried-light feature, and its `lightUpdate` (the trickiest light-ownership rule) is untested and inline. (2) glow.mjs has no tests, even though its determinism is what keeps every client in sync. (3) Three hook idioms (raw Hooks.on in senses.mjs, two copied `on()` wrappers), three 'who writes' predicates, four module-id constants and three flag-deletion syntaxes, all inside one module. (4) Hot hooks scan the whole world: syncLight walks scenes × tokens on every actor/item/effect change, deleteToken/deleteItem rebuild allSources/litBy over every scene, and chain's refreshToken rebuilds chainPairs per event when no chain is drawn. (5) The module bundles unrelated features (chain is not a sense), publishes two namespaces (`senses`, `chain`), and has a design plan (LIGHT-DESIGN.md) inside the module folder, which then ships to Data/modules. Docs: the README is good per feature, but context/foundry/README.md:202 still says 'token vision follows sheet Darkvision'.

**LLM interface.**

Today: eval-js → `game.pentaryn.senses.{syncLight,carriedLight,resetSight,syncAll,setupLight,light.*}` and `game.pentaryn.chain.{link,break,links,repaint}`. There is no read API for light state, so an LLM reads `flags['pentaryn-senses'].{itemLight,itemLightPrior,spellLight,lightCast,lit,hooded,chain}` raw (96 raw senses flag reads in eval.jsonl). `light.reconcile` resolves to undefined. `chain.link/break` accept only a document or an id on the viewed scene. Should be: `senses.inspect(ref)` that returns one plain object (token light, ownership flags, carried light, spell-light source/prior, chain ends) for a token/actor id, uuid or name; `senses.light.status(item)` that returns {cast, litBy}; `reconcile` that returns a summary; `senses.chain` as an alias of `game.pentaryn.chain` that accepts uuids; and a `describe()` manifest. All of these are additive reads on top of the existing pure functions.

**How to extend.**

A new light source profile goes in light-core.mjs LIGHT_PROFILES/ALIASES (or a `lightItem` flag on the item) plus a row in test/light.mjs. A new feature (like chain or glow) today becomes a side-effect import at the top of senses.mjs, with its own `on()` copy, publish guard and `MODULE` constant. That is unclear and drifts. Proposed: senses.mjs becomes a feature index (`carried.mjs`, `light.mjs`, `chain.mjs`, `glow.mjs`, `migrate.mjs`, each exporting install/uninstall/api), with a shared module-local `hooks.mjs`/`util.mjs`/`ids.mjs`, a 'Files / where things go' table in the README, and a `test/<feature>.mjs` chained from test/run.mjs.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| senses-walls-cursors-11 | Performance gains | medium | M | syncLight scans every token on every scene per actor; syncAll is O(actors x scenes x tokens) |
| senses-walls-cursors-13 | Performance gains | medium | S | Every token/item/actor deletion on the GM rescans all tokens and lights on every scene |
| senses-walls-cursors-19 | Performance gains | medium | S | refreshToken rebuilds chainPairs over every scene token per event when no chain is drawn |
| senses-walls-cursors-20 | Performance gains | low | M | paint() destroys and recreates TilingSprites per chain on every animation frame |
| senses-walls-cursors-22 | Performance gains | low | S | Glow epoch cache thrashes past 16 sources; re-init cadence scales with speed |
| senses-walls-cursors-12 | Maintainability gains | medium | S | Carried-light ownership rule (itemLight/itemLightPrior/spellLight) is untested inline glue |
| senses-walls-cursors-21 | Maintainability gains | medium | S | Broken-glow wave is untested though cross-client determinism is its contract |
| senses-walls-cursors-18 | Maintainability gains | low | S | Module id defined four times; light-core imports it from chain-core |
| senses-walls-cursors-24 | Maintainability gains | low | S | Chain HUD labels and notifications hard-coded English despite lang file |
| senses-walls-cursors-16 | Defragmentation | medium | S | Three hook-registration idioms in one module |
| senses-walls-cursors-34 | Defragmentation | low | S | Two copies of the frozen-namespace publish guard with different timing |
| senses-walls-cursors-14 | Logging / auditability gains | medium | M | Light reconcile is silent; api.reconcile resolves to undefined |
| senses-walls-cursors-15 | Logging / auditability gains | low | S | Debounced syncLight failures are unhandled rejections with no module prefix |
| senses-walls-cursors-10 | Hardening | medium | S | Three flag-deletion syntaxes; chain.mjs and walls use only legacy '-=' |
| senses-walls-cursors-29 | Hardening | medium | S | Senses leans on core/dnd5e internals not registered in adjustments.yml |
| senses-walls-cursors-17 | Hardening | low | S | Three different 'who writes' predicates; light.mjs isGM means 'active GM' |
| senses-walls-cursors-38 | Hardening | low | S | New `createItem` torch hook (4e64f47) also writes compendium items and is untested glue |
| senses-walls-cursors-23 | Extendability | medium | M | senses.mjs is both entry point and carried-light feature; features bolted on by side-effect import |
| senses-walls-cursors-25 | LLM interface | high | M | No read API for light state; LLM reads six flag paths by hand |
| senses-walls-cursors-26 | LLM interface | low | S | Chain API lives in a separate namespace and resolves only viewed-scene ids |
| senses-walls-cursors-27 | Documentation / skills | medium | S | Routing docs describe retired darkvision sync, bury senses in a bundle row; plan docs ship in modules |

## Performance gains

### senses-walls-cursors-11 — syncLight scans every token on every scene per actor; syncAll is O(actors x scenes x tokens)

**Category:** Performance gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-senses/senses.mjs:76–87` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  for (const scene of game.scenes) {`

**Current.**

syncLight(actor) loops all scenes and tokens to find the actor's tokens; runs 250ms after every updateActor/item/effect change and sequentially for all actors in syncAll at ready.

**Proposed.**

Add tokensByActor(scenes) index built once in syncAll; syncLight accepts optional {index} and iterates index.get(actor.id) preserving scene/token order and per-scene batching. Single-actor schedule() calls keep the full scan.

**Behaviour test recipe (write first, must pass before and after).**

Extract planning half as pure planSyncLight(actor, scenes, {carried, update}) in new carried-core.mjs. test/carried.mjs with stub scenes (s1: t1 actor A linked, t2 actor B; s2: t3 actor A unlinked with stub actor items) asserts plan from full scan deep-equals plan via index for A and B, including scene/token order; also 100 seeded random worlds (mulberry32 as glow.mjs).

**Risk.** Only updateEmbeddedDocuments call order could differ; randomized equivalence pins it.

**Related:** senses-walls-cursors-12, senses-walls-cursors-25

### senses-walls-cursors-13 — Every token/item/actor deletion on the GM rescans all tokens and lights on every scene

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/light.mjs:789–793` (snapshot `:760–764`; +29 at 4e64f47)

**Anchor:** `    for (const s of sourcesUnder(allSources(), token.uuid)) queue(s);`

**Current.**

deleteToken (4e64f47 `:789`, snapshot 760) and deleteActor (`:793`, snapshot 764) run allSources(); deleteItem runs anyLitBy->litBy, the same full scan. Bulk deletions are routine. Linked tokens can never match token.uuid-prefixed sources.

**Proposed.**

(a) Guard the deleteToken sourcesUnder scan with if (!token.actorLink) (exact equivalence). (b) Burst memo sourcesNow() cleared by queueMicrotask, used in deleteToken, deleteActor, deleteItem (readSpellCast(item) || sourcesNow().has(item.uuid)). Keep litBy for reconcile/end.

**Behaviour test recipe (write first, must pass before and after).**

Extract pure collectSources(scenes) and litByIn(scenes, source) into light-core.mjs. test/light.mjs scenes: s with token t1 spellLight source 'Scene.s.Token.u.Actor.u.Item.i', t2 plain, light l1 source 'Actor.a.Item.j'. Assert collectSources == Set of the two; for every source litByIn(...).length>0 === collectSources.has(s) including absent 'Actor.z.Item.k'; sourcesUnder(set,'Scene.s.Token.u') -> the first source; 'Scene.s.Token.t1' -> [].

**Risk.** Stale memo is a superset only; extra reconcile is idempotent/debounced.

**Related:** senses-walls-cursors-14

### senses-walls-cursors-19 — refreshToken rebuilds chainPairs over every scene token per event when no chain is drawn

**Category:** Performance gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/chain.mjs:285–287` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  on("refreshToken", () => {`

**Current.**

When state.layer is null the handler calls links()->chainPairs(scene.tokens.contents), reading every token's flags per refreshToken event (per token per frame during movement).

**Proposed.**

Cache pairs per scene id, invalidated in create/deleteToken, canvasReady, canvasTearDown and updateToken when flags.pentaryn-senses changes; refreshToken uses cached length. links(scene) with explicit scene still computes fresh.

**Behaviour test recipe (write first, must pass before and after).**

Extract pairsCache() in chain-core.mjs {get(sceneId, docsFn), invalidate()}. test/run.mjs with counting docsFn: get twice -> one call; invalidate then get -> two; different scene recomputes; results deep-equal chainPairs(docs); fixtures through cache equal direct calls.

**Risk.** A missed invalidation would show stale chains; inputs change only via the invalidating hooks.

**Related:** senses-walls-cursors-20

### senses-walls-cursors-20 — paint() destroys and recreates TilingSprites per chain on every animation frame

**Category:** Performance gains · **Impact:** low · **Effort:** M

**Where:** `foundry/module/pentaryn-senses/chain.mjs:180–192` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  for (const child of c.removeChildren()) child.destroy();`

**Current.**

Each paint removes/destroys all children and rebuilds shadow+chain TilingSprites via drawLink and sets canvas.primary.sortDirty each frame.

**Proposed.**

Keep Map<pairKey,{shadow,link}>, update properties in place, create missing/destroy vanished, set sortDirty only when elevation changes. Factor geometry into pure linkSpriteSpecs(a,b,thickness,TILE_H) in chain-core.mjs.

**Behaviour test recipe (write first, must pass before and after).**

chain-core test: linkSpriteSpecs({x:0,y:0},{x:300,y:400},28,96) -> main width 500, height 28, rotation atan2(400,300), scale 28/96; shadow offset/tint 0/alpha 0.45 computed from today's drawLink arithmetic; length<1 -> null. Stub PIXI/canvas test: two paint() calls with same pairs construct 0 sprites on the second and end in identical state.

**Risk.** Visual only; spec function pins geometry.

**Related:** senses-walls-cursors-19

### senses-walls-cursors-22 — Glow epoch cache thrashes past 16 sources; re-init cadence scales with speed

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/glow.mjs:87–124` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `    if (epochs.size > 16) epochs.delete(epochs.keys().next().value);`

**Current.**

epochs FIFO map capped at 16 keyed seedKey:epochStart; with 17+ sources buildEpoch re-runs per source per frame. The 50ms re-init throttle uses speed-scaled time so cadence exceeds the README's ~20 Hz at speed>5.

**Proposed.**

(a) Key cache by seedKey with one epoch per source and LRU cap 64; output identical. (b) Extract shouldReinit(st,radius,now) into glow-core, correct README wording; no cadence change.

**Behaviour test recipe (write first, must pass before and after).**

test/glow.mjs: interleave waveLevel over 40 keys x 5 timestamps and compare each to a fresh single-key computation; exported buildEpoch counter <= 40 after change (200 today). shouldReinit: applied null->true; |dRadius|<3->false; dNow<50->false; else true.

**Risk.** Output pinned by finding 21 golden values.

**Related:** senses-walls-cursors-21

## Maintainability gains

### senses-walls-cursors-12 — Carried-light ownership rule (itemLight/itemLightPrior/spellLight) is untested inline glue

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/senses.mjs:44–63` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `function lightUpdate(doc, light) {`

**Current.**

lightUpdate yields to spellLight, stores prior only when bright/dim>0, skips if matching, restores prior ?? DARK. Uses foundry.utils so cannot be node-tested; interacts with creatures lightUpdate and light.mjs reconcile with no written ordering contract.

**Proposed.**

Move to light-core.mjs as itemLightUpdate(doc, light, {flatten, clone, del}); senses.mjs keeps a 1-line wrapper passing foundry.utils.flattenObject/deepClone and globalThis._del. Document ownership order in the light-core header.

**Behaviour test recipe (write first, must pass before and after).**

test/light.mjs 'itemLightUpdate' block with a vendored flattenObject in test/_foundry-utils.mjs and clone=structuredClone. Cases: spellLight -> null; light equal and itemLight true -> null; itemLight false with doc.light {bright:5,dim:10} -> light, itemLight true, itemLightPrior {5,10}; same with 0/0 -> no prior key; light null with itemLight true and prior -> light=prior, itemLight false, prior null; with del=SENTINEL -> prior SENTINEL; no prior -> DARK; itemLight false -> null. Composition with spellLightUpdate/restoredLight. Port the current body verbatim first and assert identical outputs.

**Risk.** Shim vs core flattenObject edge cases; vendoring core's implementation in the test only.

**Related:** senses-walls-cursors-10, senses-walls-cursors-11, senses-walls-cursors-25

### senses-walls-cursors-21 — Broken-glow wave is untested though cross-client determinism is its contract

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/glow.mjs:162` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `Hooks.once("init", register);`

**Current.**

glow.mjs exports waveLevel/brightnessFor/LIMITS for offline checks but no test imports them; top-level Hooks.once throws in node without a stub; any refactor of rng/hashString/buildEpoch could desync clients silently.

**Proposed.**

Move LIMITS, rng, hashString, nextPeak/Trough/Half, buildEpoch, waveLevel, brightnessFor to pure glow-core.mjs; glow.mjs keeps shader/register and re-exports core.

**Behaviour test recipe (write first, must pass before and after).**

test/glow.mjs importing glow-core.mjs. Golden values captured from current glow.mjs BEFORE the move (stub globalThis.Hooks={once(){}}): waveLevel('tok1',t) for t in [0,350,1000,60000,119999,120000,240123] rounded 1e-9, hashString('tok1:0'), brightnessFor(0)===0.3, brightnessFor(1)===0.85. Invariants: levels in [0,1], continuity at epoch boundaries, same key same value on repeat with cleared cache.

**Risk.** Pure move; golden values pin output.

**Related:** senses-walls-cursors-22

### senses-walls-cursors-18 — Module id defined four times; light-core imports it from chain-core

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/senses.mjs:32` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `const SCOPE = "pentaryn-senses";`

**Current.**

senses.mjs SCOPE, migrate.mjs MODULE, chain-core.mjs MODULE, light-core.mjs imports MODULE from chain-core.mjs (line 12). Per-file esc and L helpers duplicate shared ones.

**Proposed.**

New pure ids.mjs exporting MODULE and a FLAGS table; all files import from it, chain-core/light-core keep re-exporting MODULE. Put esc and L in util.mjs with exact current bodies.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: assert (await import('../ids.mjs')).MODULE === 'pentaryn-senses' and chain-core/light-core/migrate MODULE strictly equal; test/util.mjs: esc('<a href="x">\'&"</a>') pins light.mjs's current output, esc(null) === ''. Existing checks stay green.

**Risk.** Import graph only.

**Related:** senses-walls-cursors-17

### senses-walls-cursors-24 — Chain HUD labels and notifications hard-coded English despite lang file

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/chain.mjs:223–234` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `    hudButton(col, "ps-chain-btn", "fa-solid fa-link-slash", "Break chain", async () => {`

**Current.**

'Break chain', 'The chain on X breaks.', 'Chain to X', 'X is chained to Y.' and light.mjs:301 (snapshot :291–292) GM-only warning bypass lang/en.json. The strings 4e64f47 added (`Light.HoodLowered`, `Light.HoodRaised`, `Light.Outshone`) are in en.json, so this finding did not grow.

**Proposed.**

Add PENTARYN_SENSES.Chain.{Break,Breaks,LinkTo,Linked} and Light.SetupGMOnly keys with exact English; use util L helper.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: load lang/en.json, format new keys with {name:'Hulk',anchor:'Stake'} and assert 'The chain on Hulk breaks.', 'Chain to Stake', 'Hulk is chained to Stake.'; scan *.mjs L("PENTARYN_SENSES...") keys all exist in en.json.

**Risk.** Text identical; i18n gate checks keys.

**Related:** senses-walls-cursors-18

## Defragmentation

### senses-walls-cursors-16 — Three hook-registration idioms in one module

**Category:** Defragmentation · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/light.mjs:691–700` (snapshot `:670–679`; +21 at 4e64f47)

**Anchor:** `function on(name, fn) {`

**Current.**

light.mjs on() passes return value (dnd5e.preUseActivity false) and records ids; chain.mjs:243 is a copy that drops the return value; senses.mjs uses raw Hooks.on/once, not uninstallable; chain.mjs Hooks.once('ready') is outside state.hooks. Same pattern again at pentaryn-aoe/hooks.mjs.

**Proposed.**

New pentaryn-senses/hooks.mjs hookRegistry(label) with on/once/off/ids and wrap that returns fn's value and attaches .catch(warn) for thenables. light, chain, senses each create one registry.

**Behaviour test recipe (write first, must pass before and after).**

New test/hooks.mjs with stub globalThis.Hooks {on,once,off,call}: handler returning false -> call result false; throwing handler -> console.warn with 'pentaryn-senses | light dnd5e.preUseActivity' and undefined return; rejected promise -> warn, no unhandledRejection; off() removes all ids; confirm chain handlers return nothing meaningful so pass-through is safe.

**Risk.** Chain handlers begin passing return values; none return meaningful values.

**Related:** senses-walls-cursors-15, senses-walls-cursors-34

### senses-walls-cursors-34 — Two copies of the frozen-namespace publish guard with different timing

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/chain.mjs:263–271` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `function publish() {`

**Current.**

senses.mjs ready and chain.mjs each carry the importer guard; light.mjs republishes on hot import by assignment, which throws if the namespace is frozen (caught, republish lost).

**Proposed.**

One module-local publish(ns, api) in util.mjs with the guard exactly as today; senses ready composes and calls it; light/chain hot paths reuse it.

**Behaviour test recipe (write first, must pass before and after).**

test/util.mjs: publish into undefined game.pentaryn -> {senses:api}; extensible {x:1} -> same object gains senses; Object.freeze({x:1}) -> new object with x and senses, old untouched, no throw; then publish 'chain' into the result -> both keys present.

**Risk.** Guard semantics pinned by three-state test.

**Related:** senses-walls-cursors-23, senses-walls-cursors-26

## Logging / auditability gains

### senses-walls-cursors-14 — Light reconcile is silent; api.reconcile resolves to undefined

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-senses/light.mjs:390–482` (snapshot `:375–467`; +15 at 4e64f47; `reconcile` 390–467, `queue` 470–477, `run` 479–482)

**Anchor:** `async function reconcile(source) {`

**Current.**

reconcile makes up to five kinds of writes and logs none; only failures warn; run() resolves to undefined, so neither GM nor LLM can tell which branch fired.

**Proposed.**

Build and return a summary {source, desired, restored, removed, lit, created, released, cleared} from data already computed; run() resolves to it; add gated debug line (CONFIG.debug.pentarynSenses) and a ring buffer state.recent (last 20) exposed as api.recent().

**Behaviour test recipe (write first, must pass before and after).**

Add test/light.mjs cases for a pure summarise(plan, extras) helper (plan with restore:[{scene,id}], create:{...} -> {restored:1, removed:0, lit:null, created:true,...}). For glue, a stub game/scenes test via an exported __test.reconcile asserting recorded writes are identical with debug on/off and that the return matches the writes.

**Risk.** Only the resolved value changes (undefined -> object); sweep awaits state.chain only.

**Related:** senses-walls-cursors-15, senses-walls-cursors-16

### senses-walls-cursors-15 — Debounced syncLight failures are unhandled rejections with no module prefix

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/senses.mjs:95` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  pending.set(actor.id, setTimeout(() => { pending.delete(actor.id); syncLight(actor); }, 250));`

**Current.**

schedule fires syncLight(actor) from setTimeout without catch; failures become anonymous Uncaught (in promise). Raw Hooks.on registrations at 104-110 are not try/catch wrapped.

**Proposed.**

syncLight(actor).catch(e => console.warn(`${SCOPE} | carried light ${actor.name} (${actor.id})`, e)); register hooks through the hook registry from finding 16.

**Behaviour test recipe (write first, must pass before and after).**

Node test with a stub actor whose syncLight throws, fake setTimeout capturing the callback; call schedule(actor), run the callback; assert console.warn once with prefix 'pentaryn-senses | carried light' and zero unhandledRejection events. Requires exporting schedule/syncLight via __test or the carried.mjs split (finding 23).

**Risk.** Logging only.

**Related:** senses-walls-cursors-16, senses-walls-cursors-23

## Hardening

### senses-walls-cursors-10 — Three flag-deletion syntaxes; chain.mjs and walls use only legacy '-='

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/chain.mjs:69` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** ``   const updates = [...ids].map(_id => ({ _id, [`flags.${MODULE}.-=${CHAIN_FLAG}`]: null })); ``

**Current.**

light.mjs:44 unset() (unchanged line at 4e64f47) uses globalThis._del else '-='; senses.mjs lightUpdate writes globalThis._del ?? null; chain.mjs:69 and pentaryn-walls.mjs:161 use only '-='.

**Proposed.**

Move unset(path) into a new pentaryn-senses/util.mjs as unsetPath(path, del = globalThis._del); use in light.mjs and chain.mjs. Keep senses.mjs's null fallback as an explicit documented variant. Walls gets a local copy.

**Behaviour test recipe (write first, must pass before and after).**

New test/util.mjs chained from test/run.mjs: unsetPath('flags.pentaryn-senses.chain', undefined) -> {'flags.pentaryn-senses.-=chain':null}; with sentinel -> {'flags.pentaryn-senses.chain':SENTINEL}; dotless 'a' -> {'.-=a':null}. First port light.mjs's body verbatim and assert identical outputs.

**Risk.** On v14 chain breaks switch to _del (same deletion); tests pin both branches.

**Related:** senses-walls-cursors-1, senses-walls-cursors-12

### senses-walls-cursors-29 — Senses leans on core/dnd5e internals not registered in adjustments.yml

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/glow.mjs:131–160` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  class BrokenGlowIlluminationShader extends shaders.TorchIlluminationShader {`

**Current.**

adjustments.yml has only the darkvision-reset row and the light.mjs entry in dnd5e-chat-message-types. Unregistered: glow shader chunk splicing, Token#_preview and SORT_LAYERS in chain.mjs, dnd5e create.summons / placeSummons / icon-row DOM in light.mjs (4e64f47 `:706`, `:560`; snapshot `:685`, `:545`), teleport options.replacements (`:775`, snapshot `:746`).

*Extended at 4e64f47:* `pick()` now calls Argon's `ui.ARGON?.collapseAllPanels?.()` (`light.mjs:190`, a call into another module's undocumented UI object). That one **is** registered, as row `senses-light-pick-collapse-hud` (`foundry/adjustments.yml:862`, marker `collapseAllPanels`). The scorer fails it under C32 because no `wrapMethod` names it (it is a call, not a patch; see the migration guide, step 12). No new row is needed for it. The rows proposed below are still missing.

**Proposed.**

Add rows core-light-animation-shader, core-token-preview-private, dnd5e-light-summon-suppress, core-teleport-replacements with files, markers and check targets.

**Behaviour test recipe (write first, must pass before and after).**

make foundry-adjustments-check passes with new rows (verifies files/markers). Negative control: misspell one marker in a scratch copy and confirm failure.

**Risk.** Registry only.

**Related:** senses-walls-cursors-30

### senses-walls-cursors-17 — Three different 'who writes' predicates; light.mjs isGM means 'active GM'

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/light.mjs:41` · *4e64f47: unchanged line (above the first drift at `:187`)*

**Anchor:** `const isGM = () => !!game.users?.activeGM?.isSelf;`

**Current.**

senses.mjs isWriter = activeGM?.isSelf ?? game.user.isGM; light.mjs isGM = activeGM?.isSelf only; chain.mjs and parts of light.mjs use game.user.isGM (light.mjs `:300` setup, `:678` HUD orphan at 4e64f47). The new `createItem` torch hook (`:751–756`) uses `isGM()` (active GM), the same as the other GM-side hooks, so it adds no fourth predicate. A second GM's 'End light' click passes the HUD check but reconcile returns silently.

**Proposed.**

Add isActiveGM/isAnyGM/isWriter to util.mjs with identical truth tables; rename light.mjs isGM to isActiveGM (pure rename); make each call site explicit. Optionally add console.debug at the no-op.

**Behaviour test recipe (write first, must pass before and after).**

test/util.mjs with four stub games ({activeGM self,isGM}, {activeGM other,isGM}, {activeGM null,isGM true}, {activeGM null,isGM false}): isActiveGM -> [true,false,false,false], isWriter -> [true,false,true,false], isAnyGM -> [true,true,true,false]. Grep check that light.mjs has no 'const isGM ='.

**Risk.** Pure rename; truth tables pinned.

**Related:** senses-walls-cursors-18

### senses-walls-cursors-38 — New `createItem` torch hook (4e64f47) also writes compendium items and is untested glue

*Added at the 2026-10-11 re-anchor. The code is new in 17275c9 (usability Area 6 re-run, W11).*

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/light.mjs:751–754` (hook) and `:313–329` (`ensureTorchActivity`)

**Anchor:** `  on("createItem", (item) => {`

**Current.**

```js
on("createItem", (item) => {
  if (!isGM()) return;
  ensureTorchActivity(item).catch(e => warn("torch on create", e));
});
```

`ensureTorchActivity` (factored out of `setup()`) adds the Light activity to any torch that lacks one. `setup()` walks `allItems({ worldItems: true })`: world items, actors and unlinked tokens, with no compendium packs. The hook has no such limit. Foundry fires `createItem` for documents created inside a compendium too, so a Torch created in or imported into a pack also reaches it. An unlocked world pack is then rewritten by the active GM, and a locked pack throws inside `item.update`, which `ensureTorchActivity`'s own catch logs as `pentaryn-senses | light setup <uuid>` (the hook's `.catch(warn("torch on create"))` never fires, because `ensureTorchActivity` does not reject). Verify this live before changing it. Neither the hook nor `ensureTorchActivity`'s `has`/`sort` logic has a test. Only `torchActivityData` (pure) is covered in `test/light.mjs`.

**Proposed.**

Give the hook the same scope as `setup()`: `if (!isGM() || item.pack) return;` (**[declared]**: compendium torches stop gaining the activity on create, though they still gain it on import into the world). Extract the decision half as a pure `torchActivityPlan(item, { label, density })` in `light-core.mjs`, which returns `null` or `{ path, data }`. `ensureTorchActivity` then only writes.

**Behaviour test recipe (write first, must pass before and after).**

`test/light.mjs` (pure half) with stub items. `activities` is a Map with `.has`, `.values()` and `.size`:
- A torch with no activities gives `{ path: "system.activities.<TORCH_ACTIVITY_ID>", data.sort: 0 }`.
- A torch with activities whose sorts are [100000, 300000] gives `sort === 300000 + density`.
- A torch already holding `TORCH_ACTIVITY_ID` gives `null`.
- A torch with an activity flagged `flags.pentaryn-senses.lightToggle` gives `null`.
- A lantern or a non-light item gives `null`.
- `quantity: 0` still gives a plan, as it does today. Pin that.

Glue (migration guide glue case **(k)**): stub `Hooks`/`game` with the active GM, then `fire("createItem", torch)`. Expect exactly one `item.update` whose key is `system.activities.<id>`. Firing it again on the updated item gives 0 updates. A non-active GM gives 0. A torch with `pack: "world.gear"` gives 1 today, marked `// KNOWN:`, and 0 after the change. A throwing `update` gives one `console.warn("pentaryn-senses | light setup <uuid>", err)`, a `false` return and no unhandled rejection.

**Risk.** Low. The proposed guard only narrows the writes. A GM who *wants* pack torches to have the button can run `setupLight()` after importing them, as before 17275c9.

**Related:** senses-walls-cursors-16, senses-walls-cursors-17, senses-walls-cursors-14

## Extendability

### senses-walls-cursors-23 — senses.mjs is both entry point and carried-light feature; features bolted on by side-effect import

**Category:** Extendability · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-senses/senses.mjs:8–131` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `// The broken glowstone light animation rides along; imported so adding it needed no module.json change.`

**Current.**

senses.mjs holds carried-light code, API publish and ready orchestration; glow, chain, light are side-effect imports each self-installing differently. No file map in README.

**Proposed.**

Shrink senses.mjs to a feature index; move carried-light to carried.mjs; each feature exports {install, uninstall, api}; senses composes game.pentaryn.senses and keeps game.pentaryn.chain alias and ready ordering. Add README Files table and 'Adding a feature' recipe. Do after findings 15/16 to limit churn.

**Behaviour test recipe (write first, must pass before and after).**

test/index.mjs with stub Hooks/game: import current senses.mjs first and capture sorted hook-name census plus game.pentaryn.senses keys; after refactor assert identical census, keys superset [syncLight,carriedLight,resetSight,light,setupLight,syncAll], game.pentaryn.chain exists, and the ready chain calls resetSight, syncAll, sweep in that order (spies).

**Risk.** Hook order for preUseActivity pinned by census and ready-order spy.

**Related:** senses-walls-cursors-16, senses-walls-cursors-25, senses-walls-cursors-26

## LLM interface

### senses-walls-cursors-25 — No read API for light state; LLM reads six flag paths by hand

**Category:** LLM interface · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-senses/senses.mjs:115–125` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `  const api = { syncLight, carriedLight, resetSight, light: lightApi, setupLight: lightApi.setup, syncAll: async () => {`

**Current.**

*Extended at 4e64f47:* light-core now has a pure `lightingItemId(items)` (`light-core.mjs:154`), which says which carried item's light the token shows (the sheet dims the others as "outshone"). `inspect` should report it as `actor.lightingItem`, because "why did lowering the hood change nothing?" is the question it answers.

Explaining a dark/lit token requires eval reading token.light, three senses flags, actor item flags, lightCast and AmbientLights across scenes; no resolver by id/uuid/name.

**Proposed.**

Add read-only game.pentaryn.senses.inspect(ref) (token/actor/id/uuid/name) returning token, actor carried/carriers, chain, lightSpells; light.status(itemRef); describe() listing methods, args, GM requirement, return shape. Built from existing pure readers. Additive and read-only (an explicitly requested LLM-interface improvement, not a behaviour change).

**Behaviour test recipe (write first, must pass before and after).**

Pure inspectShape({token,actor,items,scenes}) in light-core.mjs; test/light.mjs fixtures: token itemLight true prior {5,10}; actor with lit hooded lantern and shard -> carried is strongest, carriers kinds ['lit','shard'], hooded true, lightingItem === the shard's id (agrees with lightingItemId); Light item cast on {scene:'s',token:'t'} -> lightSpells[0].litBy [{kind:'token',scene:'s',id:'t'}]; deep-freeze inputs to prove no mutation.

**Risk.** Additive, read-only.

**Related:** senses-walls-cursors-26, senses-walls-cursors-12, senses-walls-cursors-14

### senses-walls-cursors-26 — Chain API lives in a separate namespace and resolves only viewed-scene ids

**Category:** LLM interface · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-senses/chain.mjs:37–72` · *4e64f47: unchanged (file not touched since the snapshot)*

**Anchor:** `const docOf = t => {`

**Current.**

Published as game.pentaryn.chain, not under senses; docOf resolves strings only against canvas.scene, so uuids/other-scene ids return null and link() silently returns false.

**Proposed.**

Add game.pentaryn.senses.chain alias to the same object; extend docOf to accept Token uuids via fromUuidSync; optional linkInfo() returning a reason without changing link()'s boolean; links() accepts a scene id.

**Behaviour test recipe (write first, must pass before and after).**

Extract pure resolveTokenRef(ref,{viewed,fromUuid}) in chain-core.mjs: object with .document -> document; doc -> itself; 'abc' found in viewed.tokens -> doc (these first three pin today's docOf); 'Scene.s.Token.t' with fromUuid {documentName:'Token'} -> it; {documentName:'Actor'} -> null; null -> null.

**Risk.** Additive alias; resolver only adds successes.

**Related:** senses-walls-cursors-25, senses-walls-cursors-23

## Documentation / skills

### senses-walls-cursors-27 — Routing docs describe retired darkvision sync, bury senses in a bundle row; plan docs ship in modules

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `context/foundry/README.md:202–205` · *4e64f47: unchanged (`context/foundry/README.md` not touched since the snapshot)*

**Anchor:** ``   nicknames kept), `-cursors` (tool cursors), `-movement` (ghost toggle, owned-on-top), `-creatures` (creature light, Your creatures strip), `-riders` (Elemental Adept/Affinity, Battle Medic, Hit Dice -/+), `-portals`, `-aoe` (draggable/deletable spell areas, area saves with a GM Apply, damage on hit), `-senses` (token vision follows sheet Darkvision; an item flagged ``

**Current.**

README.md:202 (still at 4e64f47) describes the retired darkvision sync and omits Light cantrip/torches/chains; routing row (line 67) lumps senses into 'Table-feedback modules'. LIGHT-DESIGN.md and cursors DESIGN.md are plan docs inside modules and are copied by modules.py sync. config.py comment about node-test coverage is stale (`scripts/foundry/ops/config.py:190`, unchanged at 4e64f47).

**Proposed.**

Rewrite the senses clause; add a routing row for lights on tokens -> pentaryn-senses/README.md; move LIGHT-DESIGN.md to context/plans/senses-light-cantrip.md and cursors/DESIGN.md to context/plans/cursors-design.md with one-line pointers; fix the config.py comment.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Add pytest in scripts/tests/test_module_checks.py asserting no DESIGN.md/*-DESIGN.md under foundry/module/*/ (fails today) and every module README is linked from context/foundry/README.md. Run check_lore_links/fix_md_links after.

**Risk.** None at runtime; relative links need updating.

**Related:** senses-walls-cursors-8, senses-walls-cursors-28, senses-walls-cursors-35 (the cursors half: DESIGN.md move and keeping the credited `alt-*` SVGs)

## Files named only in passing before

- `styles/light.css` (36 lines): reviewed. Every rule is under `.dnd5e2 .items-section .item .item-row > .ps-light-controls`, plus `#board.ps-picking`, all with the `.ps-` prefix. Nothing found. *4e64f47:* 45 lines. It adds a larger hit box on `.item-control` and a `.ps-light-toggle.lit.outshone` rule, both under the same prefix. The `!important` (C37w) moved to `:44`. Still nothing found.
