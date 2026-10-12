---
title: "Code audit 2026-10 — pentaryn-transform"
status: active
last_modified: 2026-10-12
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-transform

**Read this when:** you are about to refactor, harden or document pentaryn-transform and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> **Re-anchored to 28ccc87 on 2026-10-11.** The usability re-run (17275c9) is committed and the working tree equals HEAD for this module. The audit snapshot already held the re-run's transform code (U-4-5 body-swap guard, U-4-10 Chalice pulse, `isBodySwap` + fixture 141), so `hud.mjs`, `starry.mjs`, `transform.mjs`, `transform-core.mjs`, `test/run.mjs`, `module.json`, `README.md` and `WILDSHAPE-DESIGN.md` are byte-identical to the snapshot: every **Where** line and anchor below is also a HEAD line (each anchor re-checked with `git show HEAD:`). The only in-module drift is `styles/transform.css` (+1 line, `flex-wrap: nowrap` at :42), which moves transform-creatures-14 to :70–113. Cross-module references drifted in combat, senses and creatures and are updated in -12, -14, -16 and -21. Result: 24 re-anchored (1 line moved), 0 resolved, 0 obsolete, 0 new ids; transform-creatures-12 extended (combat's fork diverged further in the re-run). Conformance re-score at HEAD: 48.8 % (20/41), same failing set.

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **WAIT module.** This module's files were uncommitted/in flux when the snapshot was taken (another workflow is live-testing it). Every change here runs in Wave 8, only after that workflow is idle on this module, and only after re-anchoring every line.

> **Status 2026-10-12 (wave 4, branch `migrate/wave-4`, code phase).** Applied: -1 `59d560ba`; -2
> `c25e6a9b` [declared]; -3, -4 `a7d52ce3` + `395d6573` (T part `702e85a1`); -5 `a7d52ce3` +
> `9d4b0af9`; -6, -7 `a7d52ce3` + `395d6573`; -8 `6d436550` (registry, labels, uninstall); -9
> superseded (starry installed by entry 1; the Wave 8 collapse makes one entry); -10 `89fd21a0`;
> -11 `0e113e81` [declared]; -12 `d7fa35f2` (kit argon-kit); -13 step 1 `01583116`, step 3
> `eb5d576b` [declared] (combat's `coversMultiattack`), step 2 superseded; -14 transform half
> `45733d25` (`ptf-*`, the tooltip rules from `lib/argon-tooltip.css`; combat half = combat's W4-C6,
> Wave 7); -15 `0f995af9` + `01583116`; -16 `e24730aa` + `89c3b57c`; -17 `a7d52ce3` + `e24730aa`
> (`inspect(ref)`); -18, -19, -20 (README part) `977e430d`; -22 extraction `2aa03f5e`, behaviour
> half open (D8, live); -23 `796fdf63`. Integrator: -18 config.py text, -20 routing row, -21
> contract test (drafted), -24 minimum 14 (Wave 7). Record: `wave-4-report.md` § transform.

## Summary

### pentaryn-transform

**Purpose.**

Wild Shape and Starry Form as one-click Argon HUD actions. It shifts on use and refunds the use on failure. It shapes the form (strips features that spend uses or slots, adds a Return item and a timed effect) and carries uses, Hit Dice, exhaustion, inspiration and conditions back on revert. It ends the form automatically at 0 HP, on Incapacitated, on expiry and on a Long Rest, and sweeps spent form actors. It also patches two core v14 token-swap issues (unwrapping ForcedReplacement operators, and animate:false on body swaps).

**Health.**

Well-commented, with a proper pure core (transform-core.mjs, 147 passing fixtures). The glue is heavy and untested: hud.mjs (760 lines) and starry.mjs (336) contain pure logic still inline (earnsChalice, summaryInput, portraitLine, baseEffect). Hook fan-out: 39 registrations across 21 events in three files (updateWorldTime ×3, postUseActivity ×3, deleteActiveEffect ×4). starry.mjs carries game rules but is loaded only because hud.mjs imports it. Small duplicates inside the module: the Wild Shape item lookup ×4, the T helper ×3, refund ×2, the StarryOn chat line ×2. Four Argon helpers are copied into pentaryn-combat. Docs are rich but drifted: README sweep timing, the dnd5e 5.3.3 header, a stale ModuleSpec after_sync text, and a 584-line design doc in the module folder that ships to Data/.

**LLM interface.**

Today: eval-js calls game.pentaryn.transform.{shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms, starry.*}. All of them need a live Actor document. forms() returns full Actor documents, shift() needs a profile _id, and revert/shift return null for about six undocumented reasons. Reading 'is Talo shifted, into what, for how long, with how many uses' means raw flag reads (41 such calls in the action log). It should offer: one read-only status(ref) that accepts a document, id, uuid or name and returns a plain JSON summary (shifted, form, endsAt, secondsLeft, uses, starry, known forms as {id, name}); a README API table with return shapes and null reasons; and the same publish helper as the other modules.

**How to extend.**

A new druid or form rule: put the pure decision in transform-core.mjs with a fixture in test/run.mjs, and the hook glue in transform.mjs (or starry.mjs for Circle of the Stars). A new HUD element: hud.mjs, with a planner in core like planBonusBar or planWithout. Unclear today: whether a non-HUD rule belongs in starry.mjs (it only loads through hud.mjs); which of the three postUseActivity and four deleteActiveEffect handlers to extend; and that combat holds a forked copy of the Argon helpers, so a fix must be made twice.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| transform-creatures-2 | Performance gains | medium | S | World-time ticks scan every actor on every client, but only the runner can act |
| transform-creatures-1 | Performance gains | low | S | isRunner builds the owner list before checking for an active GM |
| transform-creatures-11 | Performance gains | low | S | A capture-phase pointermove listener arms a 60 ms timer on every move, even with no tooltip up |
| transform-creatures-23 | Performance gains | low | S | Tooltip counts forms by resolving every profile's actor |
| transform-creatures-5 | Maintainability gains | medium | S | The core v14 operator-unwrap patch is untested inline glue; extract its loop into core |
| transform-creatures-6 | Maintainability gains | medium | M | Pure HUD decisions live in hud.mjs with no fixtures |
| transform-creatures-8 | Maintainability gains | medium | M | 39 hook registrations over three files with no registry and no characterization of order |
| transform-creatures-7 | Maintainability gains | low | S | Starry Form effect choice, image fallback, time-left math and end-reason mapping are untested glue |
| transform-creatures-12 | Defragmentation | medium | L | Argon helpers forked into pentaryn-combat; two modules recompose the same Action panel |
| transform-creatures-3 | Defragmentation | low | S | The 'find the Wild Shape item' lookup is written four times; the tested core helper is never used at runtime |
| transform-creatures-4 | Defragmentation | low | S | Intra-module copies: T helper x3, StarryOn chat line x2, use refund x2 |
| transform-creatures-15 | Logging / auditability gains | medium | S | Silent catches and ungated console.log; no debug channel |
| transform-creatures-13 | Hardening | medium | S | Transform reads combat's private setting keys and API inside a silent catch |
| transform-creatures-16 | Hardening | medium | S | transform, names, pings publish synchronously at ready and depend on running after pentaryn-importer's ready |
| transform-creatures-21 | Hardening | medium | S | The Starry light depends on pentaryn-senses' item-flag schema with no contract test |
| transform-creatures-10 | Hardening | low | S | liveButtons is pruned only on a Wild Shape item update or a Starry change |
| transform-creatures-14 | Hardening | low | S | pentaryn-combat's tooltips are styled only by transform's CSS; transform's classes are not module-prefixed |
| transform-creatures-22 | Hardening | low | S | Starry expiry by world time scans world actors only; Wild Shape expiry also scans unlinked scene tokens |
| transform-creatures-24 | Hardening | low | S | Declared Foundry minimum 13 while the code relies on v14 and dnd5e 6 |
| transform-creatures-9 | Extendability | low | S | starry.mjs (game rules) loads only because hud.mjs imports it |
| transform-creatures-17 | LLM interface | high | M | No one-call read of a druid's shape state; LLMs fall back to raw flag reads |
| transform-creatures-18 | Documentation / skills | medium | S | README, file header and ModuleSpec text have drifted from the code |
| transform-creatures-20 | Documentation / skills | medium | S | No route for Wild Shape, pings or names in the Foundry routing table |
| transform-creatures-19 | Documentation / skills | low | S | A 584-line design plan lives in the module folder, ships to Data/, and is stale |

## Performance gains

### transform-creatures-2 — World-time ticks scan every actor on every client, but only the runner can act

**Category:** Performance gains · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:676–683`

**Anchor:** `Hooks.on("updateWorldTime", (worldTime) => {`

**Current.**

On every updateWorldTime three handlers run on every client: transform.mjs:676 copies game.actors plus unlinked scene token actors and checks isWildShapeForm on each; starry.mjs:314 calls activeStarry on every actor (its fallback effects.find(getFlag) walks every effect of actors lacking the static id); hud.mjs:662 repaints the portrait. The first two can only act via maybeAutoRevert/maybeEnd, which both require isRunner, which is false on every non-GM client when an active GM exists.

**Proposed.**

At the top of the transform.mjs:676 and starry.mjs:314 handlers: `const gm = game.users.activeGM; if (gm && !gm.isSelf) return;`. With no active GM keep today's loop (owner fallback must still run). Do NOT guard hud.mjs:662 (display only).

**Behaviour test recipe (write first, must pass before and after).**

Add `canRunAny({activeGMId,selfId})` to transform-core.mjs returning `!activeGMId || activeGMId === selfId`; use it in both handlers. In test/run.mjs: ({activeGMId:'gm',selfId:'p1'}) false; ({gm,gm}) true; ({activeGMId:null,selfId:'p1'}) true. Equivalence: for every selfId != 'gm', pickRunner({activeGMId:'gm',ownerIds:[selfId]}) === selfId is false.

**Risk.** Early exit must not apply when activeGM is null; the null case fixture pins it.

### transform-creatures-1 — isRunner builds the owner list before checking for an active GM

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:619–622`

**Anchor:** `export function isRunner(actor) {`

**Current.**

isRunner filters every user and calls actor.testUserPermission per user to build ownerIds, then pickRunner returns activeGMId whenever one exists, ignoring ownerIds (transform-core.mjs:324). Callers verified: maybeAutoRevert (transform.mjs:627), deleteActiveEffect carried path (~667), starry.mjs maybeEnd (~285) and deleteActiveEffect (~308). Each runs on every client for every effect/HP/world-time event.

**Proposed.**

Short-circuit before the scan: `const gm = game.users.activeGM; if (gm) return gm.id === game.user.id;` keep the ownerIds + pickRunner path only for the no-GM case. Identical result because pickRunner returns activeGMId first.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-transform/test/run.mjs (runs today: `node test/run.mjs`, 147 pass). Extend the pickRunner block: pickRunner({activeGMId:'gm',ownerIds:[]}), ({activeGMId:'gm',ownerIds:['a','b']}), ({activeGMId:'gm',ownerIds:['zz']}) all return 'gm'; pickRunner({activeGMId:null,ownerIds:['p2','p1']}) returns 'p1'. Add seam `runnerIs(selfId,{activeGMId,ownerIds})` to transform-core.mjs (= pickRunner(...) === selfId): false for ('p1', gm, [p1]); true for ('gm', gm, []); true for ('p1', null, ['p2','p1']). Write before the change; must pass before and after.

**Risk.** None if the GM branch compares ids exactly as pickRunner does; fixtures pin that a GM always wins.

### transform-creatures-11 — A capture-phase pointermove listener arms a 60 ms timer on every move, even with no tooltip up

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:48–52`

**Anchor:** `document.addEventListener("pointermove", () => {`

**Current.**

Installed at import on every client; while the mouse moves it always arms setTimeout(60) and dropStaleTooltip then reads game.tooltip?.element. Usually no tooltip is open or its anchor is connected.

**Proposed.**

Check synchronously before arming: `const a = game.tooltip?.element; if (!a || a.isConnected || staleCheckQueued) return;` then keep the 60 ms throttle and the re-check inside the timer. Difference: an anchor that disconnects within the 60 ms after a move is caught on the next move instead of by the pending timer (same at mouse-move granularity).

**Behaviour test recipe (write first, must pass before and after).**

Extract `shouldQueueStaleCheck({anchor,queued})` into transform-core.mjs (true only when anchor set, anchor.isConnected false, queued false). test/run.mjs: ({anchor:null}) false; ({anchor:{isConnected:true}}) false; ({anchor:{isConnected:false},queued:false}) true; ({anchor:{isConnected:false},queued:true}) false.

**Risk.** Slight latency nuance described above; low value, schedule after the higher-impact items.

### transform-creatures-23 — Tooltip counts forms by resolving every profile's actor

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:252`

**Anchor:** `subtitle: T("PENTARYN_TRANSFORM.Hud.FormsKnown", { n: forms(this.hudActor).length }),`

**Current.**

forms() (transform.mjs:112-117) calls fromUuidSync(p.uuid) once per profile for `actor` plus once more when p.name is empty. The Wild Shape tooltip uses forms(...).length only to count, so it resolves every beast actor on each hover. Getters `activity`/`wildShapeItem` re-run wildShapeActivity on every access and getTooltipData reads them several times.

**Proposed.**

In getTooltipData use `n: this.activity?.availableProfiles?.length ?? 0` (equals forms().length since forms maps availableProfiles 1:1 for the same activity). In forms() resolve once per profile (`const a = fromUuidSync(p.uuid) ?? null; name: p.name || a?.name || '?'`). Optionally cache `const act = this.activity` at the top of getTooltipData.

**Behaviour test recipe (write first, must pass before and after).**

Extract `formEntries(profiles,resolve)` into core with injected resolver. test/run.mjs with a counting resolver, 3 profiles (one with empty name): output identical to today's mapping ([{id,name,uuid,actor}]; name falls back to resolved actor name, then '?'), resolve called exactly 3 times (today 3 + 1 per empty name); `formEntries(ps,r).length === ps.length`.

**Risk.** None; name/actor precedence pinned by the fixture.

## Maintainability gains

### transform-creatures-5 — The core v14 operator-unwrap patch is untested inline glue; extract its loop into core

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:36–52`

**Anchor:** `if (original && Ops?.ForcedReplacement && !original.pentarynUnwrapped) {`

**Current.**

At import time an anonymous block wraps TokenDocument._preUpdateOperation and, when operation.recursive === false, mutates operation.updates in place unwrapping scalar/null ForcedReplacement values while leaving object fields wrapped. This is what lets a form standing in a Region revert; marked 'remove only when core changes'. No fixture covers the 'scalars and null only' decision.

**Proposed.**

Add to transform-core.mjs `export function unwrapForcedScalars(operation,{isForced,valueOf})` returning the count of keys changed: for each non-null update u and root key k where isForced(v), plain=valueOf(v); if plain===null or typeof plain!=='object' set u[k]=plain. Glue stays: `if (operation?.recursive === false) unwrapForcedScalars(operation,{isForced:v=>v instanceof Ops.ForcedReplacement,valueOf:v=>Ops.DataFieldOperator.get(v)});` then original.call(...). Keep the recursive check and the pentarynUnwrapped marker in the glue.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs with `class F{constructor(v){this.v=v}}`, isForced v=>v instanceof F, valueOf v=>v.v. `{recursive:false,updates:[{x:new F(100),y:new F(null),texture:new F({src:'a'}),name:'n'}]}` -> x===100, y===null, texture still an F, name 'n', returns 2, and the same operation object is mutated (identity). updates undefined -> 0; null entries skipped.

**Risk.** In-place mutation must be kept (core receives the same operation object); do not move the recursive check into the helper.

### transform-creatures-6 — Pure HUD decisions live in hud.mjs with no fixtures

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:737–744`

**Anchor:** `function earnsChalice(activity, usageConfig) {`

**Current.**

hud.mjs cannot load in node (CONFIG, ui.ARGON, document at import). Pure or table-injectable pieces: earnsChalice (737), summaryInput (125-154, needs CONFIG.DND5E.actorSizes/creatureTypes), portraitLine (606-620), recoveryText (156-163, needs limitedUsePeriods), describe (449-454). A tooltip/Starry regression is only found in a playtest.

**Proposed.**

Move into transform-core.mjs: earnsChalice({itemType,level,spellSlot,activityType,parts}); summaryFromSource(src,{sizes,types}); portraitText({wsName,endsAt,starryName,starrySecondsLeft,worldTime}) returning {what,left}|null (T stays in glue); recoveryLines(recovery,periods,allLabel); slotKind({isWeaponSet,isItem,isSplit,itemId,ids}). hud.mjs keeps thin adapters passing the same fields the inline code read.

**Behaviour test recipe (write first, must pass before and after).**

First copy the functions verbatim into core and write fixtures against that output, then switch callers. earnsChalice: Cure Wounds (spell, level 1, activityType 'heal') true; spellSlot false -> false; cantrip -> false; damage part types new Set(['healing']) true, ['temphp'] true, ['fire'] false; non-spell false. summaryFromSource with stub maps for a Dire Wolf-shaped source -> exact current object. portraitText: endsAt 21600 at worldTime 60 -> formatDuration(21540)='5 hours 59 minutes' (formatDuration verified); no effect -> null; starry 540 s -> '9 minutes'. recoveryLines [{period:'lr',type:'recoverAll'},{period:'sr',formula:'1'}] with periods {lr:{label:'Long Rest'},sr:{label:'Short Rest'}} -> 'Long Rest: all · Short Rest: 1'.

**Risk.** Adapter argument mapping (e.g. `a?.labels?.damage ?? item.labels?.damages`); fixtures written against current inline output catch drift.

### transform-creatures-8 — 39 hook registrations over three files with no registry and no characterization of order

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:632–635`

**Anchor:** `Hooks.on("updateActor", (actor, changes) => {`

**Current.**

Verified by running the three files under a stub: importing transform.mjs then hud.mjs (which imports starry.mjs) registers exactly 39 Hooks.on/once calls. Several events have multiple handlers whose relative order matters (deleteActiveEffect transform 654, starry 306, hud 710 loop and hud 759; dnd5e.postUseActivity transform 562, starry 252, hud 746: starry must see usageConfig.pentaryn.starry set by assumeStarry, Chalice runs after starry). Nothing records this order; nothing can uninstall them (aoe/hooks.mjs has an on()/off registry).

**Proposed.**

Step 1 (characterization only): add test/hooks.mjs, called from test/run.mjs. Before import set `globalThis.Hooks={on:(e)=>log.push(['on',e]),once:(e)=>log.push(['once',e])}; globalThis.foundry={documents:{},data:{},utils:{}}; globalThis.document={addEventListener(){}}; globalThis.CONST={}`; then `await import('../transform.mjs'); await import('../hud.mjs')` and compare the log to a pinned array. Step 2: introduce a local on(event,fn,tag) registry (aoe/hooks.mjs pattern) and route registrations through it preserving file order.

**Behaviour test recipe (write first, must pass before and after).**

Verified-feasible stub run (scratch) produced this exact order, to be pinned: preUpdateToken, dnd5e.preUseActivity, dnd5e.postUseActivity, dnd5e.transformActor, updateActor, createActiveEffect, updateActiveEffect, deleteActiveEffect, updateWorldTime, dnd5e.longRest, dnd5e.preShortRest, dnd5e.restCompleted, updateToken, deleteToken, updateActor, once ready, once ready, [starry:] dnd5e.preUseActivity, dnd5e.postUseActivity, createActiveEffect, updateActiveEffect, deleteActiveEffect, updateWorldTime, dnd5e.restCompleted, once ready, [hud:] updateToken, deleteToken, once init, renderActionPanelArgonComponent, renderItemButtonArgonComponent, renderPortraitPanelArgonComponent, updateWorldTime, renderEffectArgonComponent, updateItem, createActiveEffect, updateActiveEffect, deleteActiveEffect, dnd5e.postUseActivity, deleteActiveEffect. Assert length 39 and equality; must be identical after step 2.

**Risk.** Any reorder during the refactor fails the pinned array; the foundry.documents stub being empty skips the TokenDocument patch block, which does not register hooks.

### transform-creatures-7 — Starry Form effect choice, image fallback, time-left math and end-reason mapping are untested glue

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/starry.mjs:121–128`

**Anchor:** `function baseEffect(item, c, twinkling) {`

**Current.**

Only grantsFly and starryEffectData are tested. Untested: baseEffect (121-128: Dragon effect granting fly when Twinkling, else non-fly Dragon, else dragons[0], else effect named exactly 'Starry Form'), constellationImg (98-102 generic-image test), starrySecondsLeft (81-87), endStarry reason->chat key (~233).

**Proposed.**

Add to transform-core.mjs: pickStarryBase(effects,c,twinkling) (same regexes /dragon/i and /^starry form$/i, uses grantsFly), isGenericActivityImg(img), secondsLeft({start,seconds,now}) (null unless both finite), starryEndKey(reason). starry.mjs calls them and keeps .toObject() at the call site.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs Starry block: effects [Starry Form, Dragon (no fly), Dragon (changes [{key:'system.attributes.movement.fly'}])]: ('dragon',true) -> the fly one; ('dragon',false) -> plain Dragon; ('archer',*) -> 'Starry Form'; [] -> null; only a fly Dragon with twinkling false -> dragons[0]. isGenericActivityImg: 'icons/svg/mystery-man.svg' true; 'systems/dnd5e/icons/svg/activity/attack.svg' true; '' true; 'icons/x.webp' false. secondsLeft({start:100,seconds:600,now:400}) 300; start undefined null; negative results preserved. starryEndKey: 'incapacitated'->'StarryIncapacitated', 'expired'->'StarryExpired', 'manual'/undefined->'StarryEnd'.

**Risk.** Regexes copied exactly; secondsLeft must keep returning negatives (the world-time check is left<=0).

## Defragmentation

### transform-creatures-12 — Argon helpers forked into pentaryn-combat; two modules recompose the same Action panel

**Category:** Defragmentation · **Impact:** medium · **Effort:** L · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:457–466`

**Anchor:** `function applyButtons(panel, next, fresh) {`

**Current.**

Hand copies (combat/hud.mjs line 35 says 'copied from pentaryn-transform/hud.mjs on purpose'): dropTooltip (35 / combat 37), paintBadge (108 / combat 108; only the empty class differs — combat hardcodes `pentaryn-combat-empty`), applyButtons (457 / combat 123; combat's adds a detached-panel attach branch for U-3-7), itemButtonClass (439 / combat 145). renderActionPanelArgonComponent is handled in transform/hud.mjs:581, combat/hud.mjs:739, combat/hud.mjs:931 and combat/turnflow.mjs:168, so the final bar depends on hook order. A fix to one applyButtons does not reach the other. (Combat line numbers re-anchored to 28ccc87.)

**Extended 2026-10-11 (re-run code, 17275c9).** The fork diverged further after the snapshot: combat's applyButtons (combat/hud.mjs:123–143) now ends with `placeOpenDrawers(panel)` ("A button added in front (Pole Strike, Off-hand) moves the others: an open drawer follows its own."), which transform's copy (hud.mjs:457–466) does not have; and combat added a fourth renderActionPanelArgonComponent handler (combat/hud.mjs:931, `restorePips` on Action/BonusAction/Reaction) that writes `isActionUsed` on the same panels transform recomposes at hud.mjs:581. The superset to vendor is now attach branch + placeOpenDrawers, and the hook-order dependency spans four handlers in two modules.

**Proposed.**

One vendored file foundry/module/_shared/argon-kit.mjs (dropTooltip, paintBadge(button,left,emptyClass), applyButtons = combat's superset, itemButtonClass, slotKind) copied into each module at sync time: scripts/foundry/ops/modules.py sync gets a ModuleSpec `shared=(...)` field; jsscan treats ./argon-kit.mjs as present. Only adopt combat's attach branch and its placeOpenDrawers tail in transform after proving neither fires for (or is a no-op on) transform's panels; placeOpenDrawers stays a parameter/hook of the kit (combat passes it, transform passes nothing) until that is proven.

**Behaviour test recipe (write first, must pass before and after).**

Before merging, add to transform test/run.mjs (and combat's test) a DOM-free fake panel: `{_buttons:[a,b],element:{kids:[],isConnected:true,appendChild(x){this.kids.push(x)}},updateVisibility(){this.vis=(this.vis||0)+1}}`, buttons `{element:{remove(){this.removed=true}},render(){this.rendered=true}}`. applyButtons(panel,[b,c],[c]): a.element.removed true; kids order [b,c]; b._parent and c._parent === panel; panel._buttons is [b,c]; only c.rendered; vis 1. Run the combat superset with isConnected true (and placeOpenDrawers stubbed to a counter) and assert identical results apart from the counter; review an isConnected:false fixture and a panel with an open drawer against transform's Bonus/Action/Special panels before adopting. Hook-order characterisation: with all four renderActionPanelArgonComponent handlers registered in load order on a fake Action panel, record the final `_buttons` ids and `isActionUsed`; assert the same after the kit lands.

**Risk.** New vendoring mechanism (modules.py, jsscan, sync ignore list); if the attach branch fires on a transform panel behaviour would change. Do after combat stabilises.

### transform-creatures-3 — The 'find the Wild Shape item' lookup is written four times; the tested core helper is never used at runtime

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/starry.mjs:41–43`

**Anchor:** `export function wildShapeItemOf(actor) {`

**Current.**

transform-core.mjs:50 findWildShapeItem is imported only by test/run.mjs (checks 7, 8). The same search is hand-written at starry.mjs:42, transform.mjs:402 (metaFor), hud.mjs:476 (ownWs) and as a loop in transform.mjs:102-109 (wildShapeActivity). senses/light-core.mjs also keeps its own activityList (separate module, copy is required; note it).

**Proposed.**

starry.mjs:42 -> `return findWildShapeItem(actor?.items)`; transform.mjs:402 -> `findWildShapeItem(host.items)`; hud.mjs:476 -> `findWildShapeItem(actor.items)`; wildShapeActivity -> `const item = findWildShapeItem(original(actor)?.items); return item ? activitiesOf(item).find(isWildShapeActivity) ?? null : null;`. A Foundry Collection has .find so the helper works on it. Import it where needed.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs already pins findWildShapeItem on TALO. Add: (a) Map-like `{find:(fn)=>[...].find(fn)}` wrapping TALO returns the WS item; (b) two items both owning a wildshape activity -> the first (matches loop order); (c) undefined -> null; (d) WS activity on the second activity of an item -> that item. Extract `wildShapeActivityOf(items)` to core; pin: returns the activity object (by _id) for TALO, null for [].

**Risk.** Order: loop and Array.find both take the first item in iteration order; fixture (b) pins it.

### transform-creatures-4 — Intra-module copies: T helper x3, StarryOn chat line x2, use refund x2

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/starry.mjs:23`

**Anchor:** `const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));`

**Current.**

T is declared in transform.mjs:17, starry.mjs:23 and hud.mjs:23. The StarryOn say(...T(...)) block is built twice (starry.mjs ~217-221 HUD path, ~264-268 sheet path). Refunding one use is written twice: transform.mjs:394-398 refund(host,itemId) and starry.mjs ~257-259 inline (spent-1 guarded by Number.isFinite && >0).

**Proposed.**

Export T from transform.mjs (starry and hud already import from it, no new cycle). Add `announceStarryOn(actor,c)` in starry.mjs and call from both places. Add pure `refundUpdate(uses)` to transform-core.mjs returning {"system.uses.spent": spent-1} or null when spent is not a finite number or <=0; transform refund() and starry.mjs:257 both call item.update(refundUpdate(item.system.uses)) when non-null (export refund(item) from transform.mjs).

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: refundUpdate({spent:2}) -> {'system.uses.spent':1}; ({spent:1}) -> {...:0}; ({spent:0}) null; ({spent:-1}) null; ({spent:'1'}) null (Number.isFinite('1') is false, matching today); (undefined) null. For T/announceStarryOn run `make foundry-transform-check` (i18n gate) and compare `grep -c PENTARYN_TRANSFORM.Chat.StarryOn` distinct keys before/after.

**Risk.** String spent '1' must stay non-refundable; announceStarryOn must keep `?? 0` for left/max.

## Logging / auditability gains

### transform-creatures-15 — Silent catches and ungated console.log; no debug channel

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:492`

**Anchor:** `profile: profileId, wildShapeId: itemId, seconds, traitsHtml: await traitsHtml(source).catch(() => "")`

**Current.**

Swallowed with no trace: transform.mjs:492 (trait enrichment failure leaves the effect without traits), starry.mjs:280 `}).catch(() => null);` (a DialogV2 error is treated as 'closed' and the use is refunded), hud.mjs:39 (tooltip hygiene), hud.mjs:~533 (see -13). transform.mjs:~592 console.logs the stripped list on every linked shift on every client running the hook. Logs are ad-hoc strings without structured fields.

**Proposed.**

Add module log.mjs (~15 lines): debug(msg,data) no-op unless CONFIG.debug.pentarynTransform; warn(msg,data,err); warnOnce(key,...). Each prefixes MODULE_ID and passes one object {actor: uuid, form, reason}. Route the stripped-list line through debug(); change the silent catches to `.catch(err=>{debug('traits enrichment failed',{source:source.uuid},err); return "";})` and equivalents at starry:280 and hud:39. Return values unchanged. Document CONFIG.debug.pentarynTransform=true in the README.

**Behaviour test recipe (write first, must pass before and after).**

Pure node test in test/run.mjs: import log.mjs with globalThis.CONFIG={debug:{}} and stubbed console. debug() emits nothing when off and exactly one console.debug call [prefix, object] when on; warnOnce emits once per key. Call sites: `Promise.reject(new Error('x')).catch(...)` resolves to '' and null respectively, as the inline code does.

**Risk.** Moving console.log to debug removes a line someone may read in playtests; document the flag.

## Hardening

### transform-creatures-13 — Transform reads combat's private setting keys and API inside a silent catch

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:529–534`

**Anchor:** `if (!game.settings.get("pentaryn-combat", "fullAttack") || !game.settings.get("pentaryn-combat", "multiattack")) return null;`

**Current.**

multiattackCoveredByFullAttack (526-534) reads pentaryn-combat settings 'fullAttack'/'multiattack' and game.pentaryn.combat.multiattack(actor) result {source,total}. A rename or shape change in combat lands in the bare `catch { return null; }` and the U-4-1 dedupe silently turns off (text-only Multiattack reappears beside Full Attack) with no console trace.

**Proposed.**

(1) Replace the bare catch with a warn-once (`catch (err){ warnOnce('combat-multiattack', err); return null; }`, module-level Set of warned keys). (2) Add an adjustments.yml row 'transform-reads-combat-multiattack' with markers ['multiattackCoveredByFullAttack','pentaryn-combat'] so combat changes surface it. (3) Later publish combat.coversMultiattack(actor) wrapping the same three checks and call that.

**Behaviour test recipe (write first, must pass before and after).**

Extract `coveredMultiattackId({active,fullAttack,multiattack,ma,hasItem})` into transform-core.mjs. test/run.mjs: active false -> null; either setting false -> null; ma null -> null; ma.source 'flag' -> null; ma.total 1 -> null; hasItem false -> null; {source:'mmMulti',total:2}, hasItem true -> 'mmMulti'. warnOnce: call twice with the same key against a stubbed console.warn, count 1.

**Risk.** Return values identical; only logging added.

### transform-creatures-16 — transform, names, pings publish synchronously at ready and depend on running after pentaryn-importer's ready

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:777–787`

**Anchor:** `// pentaryn-importer creates and FREEZES game.pentaryn, so a bare assignment throws in`

**Current.**

pentaryn-importer.mjs:1233 replaces game.pentaryn with a new frozen object (no spread of existing keys) in its own ready hook. transform.mjs:779, names.mjs:52 and pings.mjs:~232 publish in a plain ready hook (no setTimeout) and survive only if their ready runs after the importer's (load order, not verified to follow module id). creatures.mjs:366 (snapshot :343) defers with setTimeout(0). starry.mjs:331-335 then extends game.pentaryn.transform in a second ready hook that works only because transform's hook was registered first.

**Proposed.**

Add a tested publishNamespace(root,ns,api) helper (copied into each module core until a shared module exists) with the same guard as today, call it from ready + setTimeout(0) like creatures. For transform build the api including starry in one place (starry exports its piece; transform attaches it at publish) so deferral does not lose api.starry. Longer term: make the importer merge instead of replace.

**Behaviour test recipe (write first, must pass before and after).**

Pure test per module core: publishNamespace({pentaryn:undefined},'x',api) -> {x:api}; with extensible {a:1} -> same object plus x; with Object.freeze({import:f}) -> new extensible object keeping import plus x; never throws. Characterize today's ordering first (importer freeze then module publish keeps the namespace; reverse loses it), then after the change assert it exists in both orders and that api.starry is present on game.pentaryn.transform.

**Risk.** Not strictly preserving: deferring by one tick changes when the API appears and fixes the reversed order. Only in-module readers (hud.mjs, starry.mjs) read game.pentaryn.transform; keep starry attachment in the same publish.

### transform-creatures-21 — The Starry light depends on pentaryn-senses' item-flag schema with no contract test

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/starry.mjs:137–138`

**Anchor:** `if (on && !has) await item.setFlag(SENSES, "light", foundry.utils.deepClone(STARRY_LIGHT));`

**Current.**

starry.mjs writes STARRY_LIGHT (transform-core.mjs ~537-540) to flags.pentaryn-senses.light on the feature item. pentaryn-senses/light-core.mjs carriedLightOf (:145 at 28ccc87; snapshot :130) now delegates to lightEntries (:127–139), which reads flagsOf(item).light when it is an object (:132) and skips items with quantity <= 0 (:130) — same contract, refactored by the re-run, still untested across modules. Neither module's tests tie them together; modules cannot import across folders (imports gate), so a senses rename/requirement change breaks Starry lighting with only a playtest to notice.

**Proposed.**

Add scripts/tests/test_module_contracts.py running `node -e` that imports both transform-core.mjs and senses/light-core.mjs (both pure). Add a README 'Contracts' note in both modules (or an adjustments.yml-style row) naming flag pentaryn-senses.light, writer starry.mjs:137, reader light-core.mjs:132 (lightEntries, via carriedLightOf :145).

**Behaviour test recipe (write first, must pass before and after).**

In the node snippet: carriedLightOf([{system:{quantity:1},flags:{'pentaryn-senses':{light:STARRY_LIGHT}}}]) deep-equals the strongest() output for one light (pin the exact current output, expected equal to STARRY_LIGHT); carriedLightOf([{system:{quantity:1},flags:{}}]) -> null; quantity 0 -> null. Run via subprocess from pytest; skip when node is missing.

**Risk.** Test only; fails loudly when senses changes.

### transform-creatures-10 — liveButtons is pruned only on a Wild Shape item update or a Starry change

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/hud.mjs:692–694`

**Anchor:** `if (!b.element.isConnected) { if (b.panel) liveButtons.delete(b); continue; }`

**Current.**

WildShapeButton (~231) and StarryFormButton (~360) add themselves to module-level liveButtons in their constructors. Disconnected buttons are pruned only in refreshLive (690-695, called from updateItem on a Wild Shape item) and onStarryChange (706). Every Argon rebuild constructs new buttons, so across a session without a Wild Shape item update the Set retains old buttons, their elements and sub-panels. composeActionBar:552 does liveButtons.has(b) per bar button. Note: refreshLive's predicate only drops entries with b.panel set, so unrendered ones stay even then.

**Proposed.**

Add `pruneLive()` using exactly refreshLive's predicate (drop entries whose element is not connected AND that have b.panel; guard `b.element?.isConnected`). Call it at the start of composeBonusBar (468) before new buttons are constructed. Leave refreshLive unchanged.

**Behaviour test recipe (write first, must pass before and after).**

Extract `pruneDisconnected(set)` into transform-core.mjs: deletes entries where `!x.element?.isConnected && x.panel`, returns the count. test/run.mjs: Set of {element:{isConnected:true},panel:{}}, {element:{isConnected:false},panel:{}}, {element:{isConnected:false},panel:undefined} -> returns 1; the connected entry and the panel-less entry remain.

**Risk.** Pruning before construction avoids touching buttons about to be created; the panel guard keeps never-rendered buttons as refreshLive does.

### transform-creatures-14 — pentaryn-combat's tooltips are styled only by transform's CSS; transform's classes are not module-prefixed

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/styles/transform.css:70–113` (snapshot :69–112; +1 from the `flex-wrap: nowrap` line at :42, 17275c9)

**Anchor:** `.ech-tooltip.pentaryn-tt {`

**Current.**

combat/hud.mjs:157 (snapshot :132) tags tooltips `const TT = ["pentaryn-tt"]`, but combat.css has no .ech-tooltip/pentaryn-tt rules (grep count 0, re-checked at 28ccc87). The pointer-events:none / max-width / detail-grid rules live only in transform.css:70-113, so with transform disabled combat tooltips can swallow clicks again. Transform's pentaryn-empty/hidden/current/picker class names are generic (scoped under .extended-combat-hud, so no collision today).

**Proposed.**

(1) Comment the coupling in transform.css above line 70 (the existing comment at :68–69) and at combat/hud.mjs:157 plus a README note in both. (2) Optionally copy the .pentaryn-tt block verbatim into combat.css (identical rules when both are on; visible only when transform is off, schedule deliberately). (3) Optionally rename transform's generic classes to pentaryn-transform-* in hud.mjs and transform.css in one commit.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_foundry_ops.py::test_css_classes_used_are_defined (repo-level tests live there; test_module_checks.py tests the checker with tmp modules). For each module collect pentaryn-* classes added by its .mjs (classList.add/toggle, TT arrays) and selectors defined in its .css; assert each is defined in its own CSS or in an allowlist {'pentaryn-tt': 'pentaryn-transform'} that pins today's cross-module dependency. For the rename, assert old->new mapping is a bijection over the selector set and class strings.

**Risk.** Option 2 alters combat tooltips when transform is disabled; a rename missing one string drops a style, which the gate catches.

### transform-creatures-22 — Starry expiry by world time scans world actors only; Wild Shape expiry also scans unlinked scene tokens

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/starry.mjs:315–320`

**Anchor:** `for (const actor of game.actors) {`

**Current.**

transform.mjs:677-678 adds unlinked token actors on the viewed scene; starry.mjs:315 iterates only game.actors, so an unlinked NPC druid's Starry Form never ends from the world-time fallback (it still ends through updateActiveEffect duration.expired while a GM is connected). Inconsistency, not to be changed in a no-behaviour pass.

**Proposed.**

Do not change behaviour. Record it in the README open-items list for the live-test workflow (unlinked druid token, Starry Form, advance time past 600 s with the expiry action off). Only the extraction is in scope: `worldTimeCandidates(actors,tokens)` in core with transform's current semantics, used by transform.mjs only; Starry keeps `[...game.actors]` until the live test decides.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: worldTimeCandidates([a1,a2],[{actorLink:true,actor:A},{actorLink:false,actor:B},{actorLink:false,actor:null}]) -> [a1,a2,B].

**Risk.** Flag only; no starry change without live confirmation.

### transform-creatures-24 — Declared Foundry minimum 13 while the code relies on v14 and dnd5e 6

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/module.json:7–8`

**Anchor:** `"minimum": "13",`

**Current.**

module.json declares compatibility.minimum 13 and dnd5e minimum 6.0 (which itself requires v14); the code relies on v14 behaviour (effect registry duration.expired at transform.mjs ~647 / starry.mjs ~298, the operator unwrap). creatures, aoe, combat and others declare 14. The same mismatch exists in other dnd5e-6 modules (attunement, lookup, dropbin, ties, senses, importer).

**Proposed.**

Set transform's compatibility.minimum to "14" (install gating only). Optionally fix the other dnd5e-6 modules in the same pass; leave names/pings (no dnd5e dependency) alone.

**Behaviour test recipe (write first, must pass before and after).**

scripts/tests/test_foundry_ops.py::test_dnd5e6_modules_require_v14: for every module.json whose relationships.systems dnd5e minimum >= 6.0 assert compatibility.minimum >= 14, with an explicit allowlist of today's violators (transform, attunement, lookup, dropbin, ties, senses, importer) so it passes now; remove entries as each is fixed.

**Risk.** Install gating only; the live world is v14.

## Extendability

### transform-creatures-9 — starry.mjs (game rules) loads only because hud.mjs imports it

**Category:** Extendability · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/module.json:15–18`

**Anchor:** `"esmodules": [`

**Current.**

module.json lists [transform.mjs, hud.mjs]. starry.mjs holds rule hooks (auto-end on incapacitated/expiry, light off on effect deletion, Long Rest end, sheet route, api.starry). They run only because hud.mjs:18 imports starry.mjs; README 'Sync' (~201-202) states 'not listed in module.json'. A reader of module.json cannot see starry exists; a hud.mjs load error silently drops the Starry rules.

**Proposed.**

List explicitly: `"esmodules": ["transform.mjs", "starry.mjs", "hud.mjs"]`. ES module caching evaluates each once; hook order stays transform -> starry -> hud (same as today). Update README Sync lines: module.json changed, one Foundry restart.

**Behaviour test recipe (write first, must pass before and after).**

Reuse the test/hooks.mjs harness (transform-creatures-8): import in the new order (transform, starry, hud) and assert the recorded sequence equals the sequence pinned for today's order (transform, hud). In test/run.mjs also read module.json and assert esmodules contains every top-level .mjs that registers Hooks (all except transform-core.mjs).

**Risk.** Needs a Foundry restart for module.json; until then the old list still works because hud imports starry.

## LLM interface

### transform-creatures-17 — No one-call read of a druid's shape state; LLMs fall back to raw flag reads

**Category:** LLM interface · **Impact:** high · **Effort:** M · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/transform.mjs:780`

**Anchor:** `const api = { shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms };`

**Current.**

The API offers actions plus forms() returning live Actor documents; every method needs a resolved Actor. Answering 'is Talo shifted, into what, for how long, uses left, Starry up?' takes several eval-js calls and knowledge of flags.pentaryn-transform.wildshape ({endsAt, profile, source, carried}, written at transform.mjs:462/609) and the static effect ids. The action log shows many such raw flag reads.

**Proposed.**

Add read-only, additive `status(ref)` to the published api; ref = Actor | id | uuid (fromUuidSync) | exact name (game.actors.getName). Returns plain JSON: {actor:{id,name,uuid}, original:{id,name}|null, shifted, form:{name,profileId,sourceUuid,endsAt,secondsLeft}|null, wildShape:{itemId,usesLeft,max}|null, starry:{constellation,secondsLeft}|null, forms:[{id,name}]} built from original(), wildShapeActivity(), forms(), usesLeft, the wildshape flag, constellationOf, starrySecondsLeft. Assembly is pure `shapeStatus(input)` in core; resolver is pure `resolveRef(ref,{byId,byUuid,byName})`. Document in the README API table. No existing method changes.

**Behaviour test recipe (write first, must pass before and after).**

test/run.mjs: shapeStatus with a plain input mirroring Talo shifted into a Dire Wolf ({shifted:true, flag:{profile:'p1',source:'Actor.x',endsAt:21600}, worldTime:60, uses:{max:3,spent:1}, starry:null, profiles:[{_id:'p1',name:'Dire Wolf'}]}) -> exact object with secondsLeft 21540, usesLeft 2, forms [{id:'p1',name:'Dire Wolf'}]; not shifted -> form null; no Wild Shape -> wildShape null, forms []. resolveRef: doc passes through; id string hits byId first; 'Actor.'-prefixed hits byUuid; otherwise byName; unknown -> null.

**Risk.** Additive and read-only (must never call shift/revert/sweep). The fixture pins the shape LLMs will depend on; version it in the README.

## Documentation / skills

### transform-creatures-18 — README, file header and ModuleSpec text have drifted from the code

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/README.md:169`

**Anchor:** `old, 12 s after token activity settles and once at ready.`

**Current.**

README:167-169 says the sweep runs '12 s after token activity settles', but transform.mjs ~735-775 uses a fixed 3 s timer that is never pushed back, a 1.5 s quick sweep on isPolymorphed loss, and a 10 s age guard. transform.mjs:4 says 'dnd5e 5.3.3 fires...' while module.json requires dnd5e 6.0. scripts/foundry/ops/config.py ~170-176 (transform after_sync) still says '0.2 adds hud.mjs ... restart' for module 0.3.2. README API section (181-186) lists names without return shapes or null reasons (revert returns null when not transformed, stale, not owned, already reverting, or dnd5e returned nothing; shift returns null on double-click, no Wild Shape, unknown profile, a block reason, or failed revert). README is organised as version notes rather than use, API, contracts, changelog.

**Proposed.**

Rewrite README:167-169 to the real timing; fix transform.mjs:4 to 'dnd5e 6'; make the config.py after_sync text version-neutral ('0.3 lists starry.mjs; module.json changes need a restart'); restructure README: Read this when, What the player sees, API table (method | args | returns | null when | GM-only), Cross-module contracts (senses light flag, combat multiattack, pentaryn-tt class), Setup facts, Changelog (current version sections moved verbatim).

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Add scripts/tests/test_foundry_ops.py::test_readme_api_lists_published_methods: regex the `const api = {...}` keys in each module's entry file plus `api.starry = {...}`, assert each key appears inside a backtick span in that module's README. For transform: shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms, starry.assume/end/active/constellation (all present in README:183-186 today, so it passes before and after).

**Risk.** None at runtime.

### transform-creatures-20 — No route for Wild Shape, pings or names in the Foundry routing table

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `context/foundry/README.md:67`

**Anchor:** `| Table-feedback modules — tool cursors, ghost movement, creature strip, rider rules (Elemental Adept, Battle Medic), Loot all, portals follow |`

**Current.**

The 'Route by task' table has no row for druid Wild Shape / Starry Form (pentaryn-transform), 'where did I ping' (pentaryn-pings, documented only in markers.md), or token labels after a rename (pentaryn-names). They appear only in the prose list near line 202. A session asked 'Talo's Wild Shape is stuck' has to guess.

**Proposed.**

Add rows: Wild Shape / Starry Form / Return / Change Form / a form left in the sidebar -> ../../foundry/module/pentaryn-transform/README.md; 'where did I ping' -> markers.md ping-log section (and the new pentaryn-pings/README.md); token labels didn't follow a rename -> pentaryn-names/README.md; and extend the creatures row with 'player can't see their summon / Your creatures strip'.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. scripts/tests/test_foundry_ops.py::test_every_module_routed: for every foundry/module/*/module.json id, assert context/foundry/README.md links that module's README or an allowlisted route doc; seed the allowlist with today's gaps so it passes now, then shrink it.

**Risk.** None.

### transform-creatures-19 — A 584-line design plan lives in the module folder, ships to Data/, and is stale

**Category:** Documentation / skills · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-transform/WILDSHAPE-DESIGN.md:2–4`

**Anchor:** `title: "Wild Shape on the HUD — design for pentaryn-transform 0.2"`

**Current.**

WILDSHAPE-DESIGN.md is a plan (frontmatter 'status: built (module 0.2.0) ... not yet synced or playtested'; names actor/user ids). CLAUDE.md puts plans in context/plans/, and context/plans/druid-wild-shape.md is the build record. ops/modules.py:306 shutil.copytree(spec.src, spec.dst) ships the whole folder to Data/modules. Pointers to it: README.md:7, transform.mjs:9, README Status line, and context/plans/druid-wild-shape.md:5. Its line references target dnd5e 5.3.3, stale under 6.0.

**Proposed.**

git mv to context/plans/wildshape-hud-design.md (or merge into druid-wild-shape.md), update all four pointers, mark 'superseded by README for use; history only'. Add DESIGN files and test/ to the sync ignore list (modules.py copytree ignore=).

**Behaviour test recipe (write first, must pass before and after).**

Docs only. scripts/tests/test_foundry_ops.py::test_no_plan_docs_in_module_dirs: no foundry/module/*/*DESIGN*.md except an allowlist seeded with pentaryn-cursors/DESIGN.md, pentaryn-senses/LIGHT-DESIGN.md and pentaryn-transform/WILDSHAPE-DESIGN.md (all three exist) so it passes now; remove the transform entry with the move. Before/after `grep -rn WILDSHAPE-DESIGN` stale-reference count must be 0.

**Risk.** Broken links, caught by the grep count.
