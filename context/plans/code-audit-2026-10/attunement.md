---
title: "Code audit 2026-10 — pentaryn-attunement"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-attunement

**Read this when:** you are about to refactor, harden or document pentaryn-attunement and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> **Re-anchored to 4e64f47 on 2026-10-11.** Every `Where`/line below is now a HEAD line (`git show 4e64f47:foundry/module/pentaryn-attunement/…`; the working tree equals HEAD for this module). The usability re-run (17275c9, ledger U-8-5) added `guardItemTooltipPosition` (attunement.mjs:886–896, called first in the ready tick at :867), which pushed the tail of the file down by 21 lines; everything above :866 kept its snapshot line. Tally: 9 re-anchored, 0 resolved, 0 obsolete, 1 new (items-journal-39).
>
> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-attunement

**Purpose.**

Draws attunement slots in the character sheet sidebar, with a stable stored slot order and over-cap warnings. It warns on every write path but never vetoes. It also handles 'away bonds', which let confiscated attuned items keep their slot and come home attuned through stash(). It patches CONFIG.DND5E.armorProficienciesMap so rings, wands and wondrous items stop reading 'Not Proficient'.

**Health.**

One 921-line file (900 at the snapshot; +21 for the U-8-5 tooltip guard) mixes pure logic, DOM, hooks and the API. The design comments are excellent. 35 node fixtures cover computeSlots, homeSlots and patchProficiencyMap, but the suite works only by stubbing Hooks and importing the entry point. The bond restore, stash planning and over-cap maths are untested, and there are two different over-cap formulas. Strings are inline (STRINGS), and two comments about them contradict each other. The README is good, but its fixture count is stale (says 31, actual 35) and it has no API section. The size is reasonable; the bloat risk is low.

**LLM interface.**

Today an LLM calls game.pentaryn.attunement.{report, computeSlots, stash, releaseAway, away} through eval-js. Only report() accepts a name or id. The rest need a resolved Actor document, so every call costs an extra resolve step. report() prints console.table on every call and returns undefined when the actor is missing. stash() returns only a count, so callers re-find the created items by name. The API is published at ready plus setTimeout(0), which is why logged scripts poll `for (i<30 && !game.pentaryn?.attunement?.stash)`. Target state: an attunement-core.mjs seam, a resolver at the API boundary (document, id, uuid or name), describe() and VERSION, report(target,{quiet}), stash(...,{detail:true}), and an `attunement` block in a future game.pentaryn.inspect(actor) aggregator.

**How to extend.**

Today a new rule (for example an attunement prerequisite check) would have to go into attunement.mjs's 'Enforcement' section, next to the DOM code. Once attunement-core.mjs exists (items-journal-8), pure rules go there with fixtures in test/run.mjs, and glue stays in attunement.mjs. Two things are unclear today. First, whether Item Piles behaviour belongs here or in dropbin: the repair is split, and the adjustments.yml row points at the wrong file. Second, which over-cap count is authoritative (att.value or the item filter).

## Status (wave 2, 2026-10-11)

Applied on `migrate/wave-2` with the blueprint migration (detail: the migration guide's Result):
-8 `b1ff1cde`, `676a98de` · -9 `b1ff1cde` (`bondChanges`, `isPileActor` `5f3bf2d5`) · -10 extraction `b1ff1cde`, count check [declared] `7e18a834` ·
-11 hooks [declared] `07920a8f`, listeners [declared] `0d0c2199` · -12 `b1ff1cde` (`wouldExceed`; the divergence stays a KNOWN pin; `countMismatch` is in
`inspect().counts`, `d7a8ae2f`) · -13 `03f417f0` · -14 step 1 `b1ff1cde` (step 2 waits for Wave 7) · -16 `d7a8ae2f` · -17 `885f3423`, `10459870` ·
-39 a `b1ff1cde`, b [declared] `e1adc21c`, c `5f3bf2d5` (C33 pattern: integrator).
Standalone pass (wave 2): -10 success audit line [declared] `7cf1a4f1` (shortfall naming `73180dfd`; rollback is W2-A2) ·
-17 optional README/API parity check `6402b3fb` · -12 `report()` `countMismatch`: not added — `golden/report.json` freezes
report()'s return; the diagnostic lives in `inspect().counts.mismatch` · -39 `_positionItemTooltip` in `privateInternalPatterns`:
landed by the integrator in `scripts/foundry/blueprint/packages.json` (C33 now lists it for manual review); the
adjustments rows moved and the tooltip row renamed `attunement-item-tooltip-anchor` (`cd414590`) · -14 step 2 rides on the Wave 7 `module.json` batch.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| items-journal-13 | Performance gains | low | S | Each sheet render reconciles slots twice and re-filters the away list per away slot |
| items-journal-8 | Maintainability gains | medium | M | Split the pure half into attunement-core.mjs so tests stop stubbing Hooks and importing the entry point |
| items-journal-9 | Maintainability gains | medium | S | restoreBond mixes decision and mutation, duplicates two branches, and repeats the Item Piles check |
| items-journal-12 | Maintainability gains | medium | S | Two different over-cap counts: warnOverCap uses att.value, the strip counts items |
| items-journal-14 | Maintainability gains | low | S | Inline STRINGS with contradictory comments; only i18n path in scope without a lang file |
| items-journal-11 | Logging / auditability gains | medium | S | Async hook and listener handlers have no catch, so failures are anonymous unhandled rejections |
| items-journal-10 | Hardening | high | S | stash() deletes the owner's items without checking that the container copies were created |
| items-journal-16 | LLM interface | medium | M | Attunement API: document-only arguments, noisy report(), count-only stash(), no self-description |
| items-journal-17 | Documentation / skills | low | S | Attunement README: stale fixture count, '??=' claim, and no API section |
| items-journal-39 | Hardening | low | S | New (U-8-5): dnd5e `_positionItemTooltip` guard is a hand-assigned, untested prototype patch that runs ahead of the API publish |

## Performance gains

### items-journal-13 — Each sheet render reconciles slots twice and re-filters the away list per away slot

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:534`

**Anchor:** `const { over } = computeSlots(actor);`

**Current.**

The renderBaseActorSheet hook (900-911; 879-890 at the snapshot) calls decorateCounter (computeSlots at 534) then injectStrip -> buildStrip (computeSlots at 494). buildAwaySlot (454) calls awayOf(actor) per away slot. Sheets re-render on every item/actor update.

**Proposed.**

In the hook compute `const state = computeSlots(actor)` once and pass it: decorateCounter(actor, element, state), injectStrip(app, element, state) -> buildStrip(actor, editable, state); keep old signatures working when state is undefined. Build `awayByKey = new Map(awayOf(actor).map(a=>[a.key,a]))` once in buildStrip and pass to buildAwaySlot.

**Behaviour test recipe (write first, must pass before and after).**

Seam: computeSlots is pure and already importable. In test/run.mjs add, for each existing fixture actor, check('idempotent', computeSlots(a), computeSlots(a)) (so reusing one result is equivalent). DOM equivalence is optional and needs a document stub (createElement returning {className,classList:{add(){},toggle(){}},dataset:{},append(){},setAttribute(){}}) with game.i18n.localize=k=>k: serialise buildStrip(actor,true) and buildStrip(actor,true,computeSlots(actor)) and compare.

**Risk.** Stale state only if an await is added between computing and using it; the hook is synchronous.

## Maintainability gains

### items-journal-8 — Split the pure half into attunement-core.mjs so tests stop stubbing Hooks and importing the entry point

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:921` (snapshot :900)

**Anchor:** `export { computeSlots, homeSlots, patchProficiencyMap };`

**Current.**

Single-file module. test/run.mjs:17-19 (unchanged) sets globalThis.Hooks={on(){},once(){}} and imports attunement.mjs, so any future top-level Foundry access breaks the suite at import. awayOf (118-121), the bond decision (218-227), stash planning (135-185) and the over-cap arithmetic (721-723) are unexported and untested. Verified: the suite prints '35 fixtures passed' (re-checked at 4e64f47). Since U-8-5 the file also holds `guardItemTooltipPosition` (886–896), whose skip decision is untested too; see items-journal-39.

**Proposed.**

Create attunement-core.mjs with no globals: MODULE, SLOTS, AWAY_FLAG, BOND, AWAY, awayOf, computeSlots, homeSlots, patchProficiencyMap plus the pure functions from items-journal-9, -10, -12. attunement.mjs imports them and drops its export line (Foundry ignores exports on an entry point). test/run.mjs drops the Hooks stub and imports ../attunement-core.mjs. module.json esmodules stays ['attunement.mjs'].

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-attunement/test/run.mjs: all 35 existing checks pass unchanged against the new import path. Add check('core loads with no Foundry globals', typeof globalThis.Hooks, 'undefined'). New awayOf fixtures: awayOf({getFlag:()=>[{key:'k'},null,'x',{name:'n'}]}) -> [{key:'k'}]; awayOf({getFlag:()=>'corrupt'}) -> []; awayOf(undefined) -> []; awayOf({}) -> [].

**Risk.** A missed relative import makes the module fail to register in the browser; `make foundry-attunement-check` (imports gate) catches it and the 35 fixtures prove computeSlots/homeSlots are unchanged.

**Related:** items-journal-9, items-journal-10, items-journal-12

### items-journal-9 — restoreBond mixes decision and mutation, duplicates two branches, and repeats the Item Piles check

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:210–230`

**Anchor:** `function restoreBond(item, data, options) {`

**Current.**

The 'home' branch (220-223) and 'same actor, released' branch (224-226) repeat the attunement/equipped assignments. The rule for whether a returning item arrives attuned/equipped cannot be tested without an Item. `game.itempiles?.API?.isValidItemPile?.(actor)` is written out at 216 and 244.

**Proposed.**

Add to attunement-core.mjs `bondChanges(bond,{actorId,awayKeys,fallbackName})`: null if !bond; changes={name: bond.name ?? fallbackName}; if actorId!==bond.actor return changes; if bond.attunement!=null add 'system.attunement'; if awayKeys.includes(bond.key) add 'system.attuned'=true; if bond.equipped add 'system.equipped'=true (insertion order exactly name, attunement, attuned, equipped). restoreBond keeps its guards then `item.updateSource(bondChanges(bond,{actorId:actor.id,awayKeys:awayOf(actor).map(a=>a.key),fallbackName:item.name}))` and the options mutation. Add local `isPileActor = a => !!game.itempiles?.API?.isValidItemPile?.(a)` for 216 and 244.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs with B={actor:'A',key:'k',name:'Cloak',equipped:true,attuned:true,attunement:'required'}: (1) bondChanges(B,{actorId:'A',awayKeys:['k'],fallbackName:'x'}) -> {name:'Cloak','system.attunement':'required','system.attuned':true,'system.equipped':true}; (2) awayKeys:[] -> {name:'Cloak','system.attunement':'required','system.equipped':true}; (3) actorId:'Z' -> {name:'Cloak'}; (4) {...B,name:undefined}, actorId 'Z', fallbackName 'Cloak (Talo)' -> {name:'Cloak (Talo)'}; (5) {...B,attunement:null,equipped:false}, home -> {name:'Cloak','system.attuned':true}; (6) bondChanges(null,...) -> null. Before refactoring paste lines 218-227 into a scratch function in the test and confirm cases 1-5 against it.

**Risk.** Key order only matters to the JSON comparison; the 'home keeps equipped' behaviour is pinned by case 1.

### items-journal-12 — Two different over-cap counts: warnOverCap uses att.value, the strip counts items

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:721–725`

**Anchor:** `const value = att.value + awayOf(actor).length;`

**Current.**

warnOverCap (716-726) counts the system's prepared `system.attributes.attunement.value` plus away entries. computeSlots (281-320) counts `actor.items.filter(i => i.system?.attuned)` plus away entries. If dnd5e's value ever differs, the toast and the strip can disagree; nothing documents which count wins and neither formula is tested.

**Proposed.**

Extract `export function wouldExceed({ value, max, awayCount })` -> {exceed, after} into attunement-core.mjs and call it from warnOverCap (exceed = !(value+awayCount < max), after = value+awayCount+1). Add a comment above both that names the two sources and states plainly that they are counted differently; do not assert the reason unless verified. Additive diagnostic: report() adds `countMismatch`.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: wouldExceed({value:2,max:3,awayCount:0}) -> {exceed:false,after:3}; {value:3,max:3,awayCount:0} -> {exceed:true,after:4}; {value:2,max:3,awayCount:1} -> {exceed:true,after:4}; {value:0,max:0,awayCount:0} -> {exceed:true,after:1}. Pin the divergence: actor stub with system.attributes.attunement {value:1,max:3} and two prepared-attuned items -> computeSlots(...).value===2 while warnOverCap's input value is 1. Recorded, not fixed.

**Risk.** Only the extraction touches runtime; the four fixtures pin the `<` threshold and the +1.

### items-journal-14 — Inline STRINGS with contradictory comments; only i18n path in scope without a lang file

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:833–860`

**Anchor:** `` /** Strings live here, merged into i18n at init; `t()` falls back to them. */ ``

**Current.**

Line 833 says STRINGS are 'merged into i18n at init'; lines 849-850 say they are deliberately not routed through game.i18n, and the init hook (856-860) merges nothing and contains a stray blank line. The module has no lang/ folder or `languages` entry, unlike dropbin and journal.

**Proposed.**

Step 1 (docs only): rewrite the 833 comment to 'Strings live here; t() reads them directly (see below)' and remove the blank line in the init hook. Step 2 (optional, needs Foundry restart because module.json changes): add lang/en.json PENTARYN_ATTUNEMENT.* with the same text, add `languages` to module.json, keep STRINGS as the fallback in t().

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs (after items-journal-8 moves t() to the core): t('OverBy',{n:2}) -> '2 over the limit'; t('WouldExceed',{actor:'A',max:3,name:'N',value:4}) -> 'A is already attuned to 3 items — attuning N makes 4.'; t('Missing') -> 'Missing'; t('OverBy',{}) -> '{n} over the limit'. For step 2 add a parity check that every STRINGS key has the identical value in lang/en.json.

**Risk.** Step 1 is comments only. For step 2, game.i18n.format handles unknown placeholders differently from t(); keep the STRINGS replacer for formatting and let the parity fixture catch drift.

## Logging / auditability gains

### items-journal-11 — Async hook and listener handlers have no catch, so failures are anonymous unhandled rejections

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:916` (snapshot :895)

**Anchor:** `Hooks.on("createItem", onCreateItemBond);`

**Current.**

onCreateItemBond (236-267) awaits up to four writes; Hooks.on does not await it, so a rejection (player lacking permission, coin-purse delete racing Item Piles) is an uncaught promise with no module prefix. The same applies to confirmRelease (587), unattune (577), attuneToSlot (548) and onDrop (600), returned from the strip listeners at 641, 647, 657, 662 and 679. Only the render hook (904-911; snapshot 883-890) has try/catch.

**Proposed.**

In attunement-core.mjs (or locally) `export const safe = (label, fn, log = console.error) => (...args) => Promise.resolve().then(() => fn(...args)).catch(err => log(`${MODULE} | ${label} failed`, err));`. Register `Hooks.on('createItem', safe('bond return', onCreateItemBond))` and wrap the five listener calls. Nothing is rethrown. Do NOT wrap the synchronous preCreateItem/preUpdateItem handlers (their return values and mutations matter).

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: with a log spy, `await safe('x', async () => { throw new Error('boom') }, spy)()` resolves undefined and spy got ['pentaryn-attunement | x failed', Error('boom')]; `await safe('x', async a => a*2)(21)` resolves undefined. For listeners assert the side effect (a stub fn called with the same args) still happens.

**Risk.** Rejections are logged with context instead of surfacing as 'Uncaught (in promise)'. Foundry ignores createItem and DOM listener return values.

## Hardening

### items-journal-10 — stash() deletes the owner's items without checking that the container copies were created

**Category:** Hardening · **Impact:** high · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:186–190`

**Anchor:** `await container.createEmbeddedDocuments("Item", creates);`

**Current.**

stash() ignores the array returned by createEmbeddedDocuments and then deletes the originals from the owner (187). Foundry silently drops a document that fails validation (pentaryn-importer guards this exact mode). A dropped item is deleted from the character with no copy. Return value is creates.length, not the count created; no log line.

**Proposed.**

Extract the planning (lines 135-185) into attunement-core.mjs as `planStash(owner, itemIds, { tag, currency, randomID, setProperty })` returning {creates, away, slots}; inject randomID and setProperty because the core has no foundry global. Glue: `const made = await container.createEmbeddedDocuments('Item', plan.creates); if (made.length !== plan.creates.length) { console.error(`${MODULE} | stash: container accepted ${made.length}/${plan.creates.length}; originals NOT deleted`, {owner: owner.id, container: container.id}); throw new Error(...) }` before the delete/update; add a console.log of count and names. Success path stays byte-identical; only the failure path changes (refuses to delete).

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs planStash with counter randomID ('r1','r2',..) and setProperty=foundry.utils.setProperty reimplemented (dotted path set). owner: {name:'Talo Vesk', id:'A', system:{currency:{gp:5,sp:0}}, items: a Map subclass with get/has/filter over [Cloak {id:'c',name:'Cloak',img:'i',type:'equipment',system:{attuned:true},_source:{name:'Cloak',system:{attuned:true,equipped:true,attunement:'required'}},toObject(){return {_id:'c',name:'Cloak',type:'equipment',system:{attuned:true,equipped:true,container:'x',quantity:1}}}}, two loot 'Torch' items qty 2 and 3 with the same shape], getFlag:(m,k)=>k==='slots'?['c']:[]}. NOTE the Cloak needs prepared system.attuned:true or computeSlots will not place it. Assert creates[0].name==='Cloak (Talo)'; system.attuned/equipped false; system.container undefined; flags['pentaryn-attunement'].bond deep-equals {actor:'A',key:'r1',name:'Cloak',equipped:true,attuned:true,attunement:'required'}; torches merged into one create with quantity 5; slots deep-equals ['away:r1',null,null]; away deep-equals [{key:'r1',name:'Cloak',img:'i'}]; with currency:true the last create is 'Coin Purse (Talo)' with bond.currency {gp:5}. Glue test: container.createEmbeddedDocuments returns all creates -> owner.deleteEmbeddedDocuments called once with ['c', torch ids] and stash resolves creates.length; returns one fewer -> delete never called and stash rejects (intentional).

**Risk.** Success path pinned by the fixtures (creates, delete ids, update object). Failure path changes on purpose.

**Related:** items-journal-8, items-journal-29


### items-journal-39 — New (U-8-5): dnd5e `_positionItemTooltip` guard is a hand-assigned, untested prototype patch that runs ahead of the API publish

**Category:** Hardening · **Impact:** low · **Effort:** S

**Added:** 2026-10-11 re-anchor, for code the usability re-run added (17275c9, ledger U-8-5, module 0.2.1).

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:886–896` (call site :867)

**Anchor:** `function guardItemTooltipPosition() {`

**Current.**

```js
Hooks.once("ready", () => setTimeout(() => {
  guardItemTooltipPosition();
  const api = { report, computeSlots, stash, releaseAway, away: awayOf };
  …
function guardItemTooltipPosition() {
  const proto = game.dnd5e?.tooltips ? Object.getPrototypeOf(game.dnd5e.tooltips) : null;
  const original = proto?._positionItemTooltip;
  if (typeof original !== "function" || original.pentarynGuarded) return;
  const guarded = function (...args) {
    if (!game.tooltip?.element || !this.tooltip) return;
    return original.apply(this, args);
  };
  guarded.pentarynGuarded = true;
  proto._positionItemTooltip = guarded;
}
```

Three problems, all small. (1) It replaces a dnd5e private method by assigning through a local `proto`, the same shape the blueprint scorer cannot see (C32 only matches a literal `.prototype.x =`; `_positionItemTooltip` is not in `privateInternalPatterns`, so C33 does not list it either). The adjustments row `dnd5e-item-tooltip-anchor` (adjustments.yml:906) does exist and its marker matches. (2) The skip rule and the idempotence marker have no node test; the module's only suite imports the entry for `computeSlots`/`homeSlots`/`patchProficiencyMap`. (3) It is the first statement in the ready tick, before `game.pentaryn.attunement` is built, with no try/catch. Today nothing in it can realistically throw (every read is optional-chained), but if a dnd5e update made `game.dnd5e.tooltips` a getter that throws, or froze the prototype (assignment throws in a module's strict mode), the whole attunement API would silently never publish and `stash()`-polling scripts would time out.

**Proposed.**

Behaviour-preserving. (a) Make the predicate pure and exported: `export function tooltipAnchorMissing({ element, tooltip }) { return !element || !tooltip; }`, and have `guarded` call `tooltipAnchorMissing({ element: game.tooltip?.element, tooltip: this.tooltip })`. (b) Wrap the call site: ``try { guardItemTooltipPosition(); } catch (err) { console.warn(`${MODULE} | tooltip guard skipped`, err); }`` so the publish always runs. (c) In the blueprint migration, route it through the kit's `wrapMethod` with `adjustments: "dnd5e-item-tooltip-anchor"` (migration guide step 3) and add `_positionItemTooltip` to `privateInternalPatterns` in `scripts/foundry/blueprint/packages.json` so C33 lists it. Do not change the order (guard, then publish) or the `pentarynGuarded` marker until the `wrapMethod` move.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs (or `glue.test.mjs` after migration step 1). Stub: `class T { _positionItemTooltip(...a) { calls.push(a); return 'pos'; } }; const inst = new T(); inst.tooltip = {}; globalThis.game = { dnd5e: { tooltips: inst }, tooltip: { element: {} } };`. Export `guardItemTooltipPosition` for the test (or reach it through the step-1 seam). Assert: after one call `T.prototype._positionItemTooltip.pentarynGuarded === true`; `inst._positionItemTooltip(1,2)` returns `'pos'` and `calls` deep-equals `[[1,2]]`; with `game.tooltip.element = null` it returns `undefined` and `calls` does not grow; with `inst.tooltip = null` likewise; a second `guardItemTooltipPosition()` leaves the same function reference (idempotent); with `game.dnd5e = undefined` it returns without throwing and patches nothing. For (b): with a `game.dnd5e` whose `tooltips` getter throws, firing the ready tick still leaves `game.pentaryn.attunement` with keys `['report','computeSlots','stash','releaseAway','away']` and one `console.warn` starting `pentaryn-attunement | tooltip guard skipped` (before the fix this assertion fails — record it as the intended change).

**Risk.** (a) is a pure extraction pinned by the five stub cases. (b) changes only the failure path (a throw no longer blocks the publish). Live: hover an inventory item, then take/attune it so the row re-renders under the pointer; the console stays clean (U-8-5 retest).

**Related:** items-journal-8, items-journal-16, aoe-movement-portals-17 (same hand-wrap pattern)

## LLM interface

### items-journal-16 — Attunement API: document-only arguments, noisy report(), count-only stash(), no self-description

**Category:** LLM interface · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-attunement/attunement.mjs:866–876` (snapshot 866–875; anchor now on :868)

**Anchor:** `const api = { report, computeSlots, stash, releaseAway, away: awayOf };`

**Current.**

computeSlots, stash, releaseAway and away need Actor documents, so each LLM call needs a resolve step first. report(target) (751-760) accepts a name or id, prints console.table every call, and on a miss returns the result of console.warn (undefined, line 755). stash() returns creates.length. No version/describe. The API appears one tick after ready (setTimeout, :866), so scripts poll. Since U-8-5 the same tick first runs `guardItemTooltipPosition()` (:867) before building `api`; a throw there would skip the publish (items-journal-39).

**Proposed.**

Additive and backward compatible. (1) `resolveActor(ref)` accepting an Actor, id, 'Actor.x' uuid (fromUuidSync) or exact name; the published methods wrap it (`computeSlots: ref => computeSlots(resolveActor(ref))`, likewise away, releaseAway, stash owner/container). Internals keep taking documents. (2) report(target,{quiet=false}) skips console output when quiet; KEEP the miss return as undefined (do not change it). (3) stash(owner,container,ids,{detail:false}): when detail is true return {count, created:[ids], away:[keys]}; otherwise the number as today. (4) `VERSION` constant and describe() -> {name:'attunement', version, methods:[{name,args,returns,gmOnly}]}. Merge with the namespace change in items-journal-1 once done.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: resolveActor with stub game.actors {get:id=>map[id], getName:n=>byName[n]} and a stub fromUuidSync. An Actor-like object passes through (same reference); 'id1', 'Talo', 'Actor.id1' resolve; 'nope' -> null. For every fixture actor in the existing suite, wrapped computeSlots(actorDoc) deep-equals raw computeSlots(actorDoc). With the planStash glue stub from items-journal-10, `await stash(...)` with no options resolves to creates.length.

**Risk.** Wrappers must return identical results for document inputs (deep-equal fixtures). report() miss behaviour is intentionally left unchanged.

**Related:** items-journal-1, items-journal-28, items-journal-35

## Documentation / skills

### items-journal-17 — Attunement README: stale fixture count, '??=' claim, and no API section

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-attunement/README.md:150`

**Anchor:** `` 31 fixtures. Most cover `computeSlots` — stale flags, deleted items, duplicate ids, ``

**Current.**

README line 150 says 31 fixtures; the suite prints '35 fixtures passed'. README line 107 and attunement.mjs:806 say the patch uses `??=`, but patchProficiencyMap (821-826) does `if (map[type] == null) {...}` (equivalent). The README has no API table; return shapes and which calls write are only in prose and flag shapes (slots, away, bond) are scattered.

**Proposed.**

Replace '31 fixtures' with 'the fixtures in test/run.mjs'. Change '??=' to 'only when unset (== null)' in README line 107 and the comment at line 806. Add '## API (game.pentaryn.attunement)': method | args | returns | writes? | GM? (report: read; computeSlots: read, {slots,max,value,over}; away: read; stash: writes; releaseAway: writes) plus the three flag shapes.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Optional scripts/tests check: every key of the `const api = {` object (regex on attunement.mjs) appears in the README API table.

**Risk.** None.

## Categories checked with no finding

- **Defragmentation:** checked `attunement.mjs` (900 lines at the snapshot; 921 at 4e64f47, the extra 21 being the U-8-5 guard, items-journal-39). The actor resolver duplicated with dropbin is filed under dropbin (items-journal-28), the repeated Item Piles check is items-journal-9 (Maintainability), and the publish guard goes to the kit. Nothing attunement-only.
- **Extendability:** checked. The extension seam is `attunement-core.mjs` (items-journal-8), and the API section is items-journal-17 (Docs). Nothing separate.
- **Stylesheet:** `attunement.css` (188 lines): every sidebar rule is scoped under `.dnd5e2.sheet.actor .sidebar .pentaryn-attunement`. Two rules mark dnd5e's own counter (`.dnd5e2.sheet.actor .attunement.pentaryn-over-cap`, lines 154–159), and `.pentaryn-away-tip` (187–188) is global by necessity, as a tooltip. The prefix (`.pentaryn-attunement` / `.pentaryn-*`) is missing from the §2.1 table and has been added there. Nothing else found.
