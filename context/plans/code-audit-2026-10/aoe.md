---
title: "Code audit 2026-10 — pentaryn-aoe"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-aoe

**Read this when:** you are about to refactor, harden or document pentaryn-aoe and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Status (wave 4, 2026-10-11, branch `migrate/wave-4`, not merged):** all 16 findings landed in
> the blueprint migration (record: `../addon-blueprint-2026-10/migrate-pentaryn-aoe.md` Result).
> -2 `c0a75a64` · -4 `03322772` + `0f83d5fe` (D-A1) · -5 `4bc7d44c` · -6 `f54ba674` · -7 `5009afc4`
> (D-A6) · -8 `130fb3c3` · -9 `515776c0`, `84c847df`, `097c9e67` · -10 `4644e577`, `0cbbab0e` ·
> -11, -12 `47bc85c7` (README; the use-doc rows are an integrator edit) · -13 `87959748` · -14
> `7198fe70` · -15 `515776c0` + `18addee4` (D-A2) · -30 `41b51b43` · -39 `0b9b13fd` (+ the
> `core-region-placement-escape` widening, integrator) · -40 checkpoint `7a12ffad` · -44 `515776c0`
> + `0d51383e` (D-A7). Line numbers below are the pre-migration ones.

> **Re-anchored to `28ccc87` on 2026-10-11.** Every **Where**/**Anchor** below now points at HEAD `28ccc87` (the working tree equals HEAD for this module; the only commit touching it since the snapshot is `17275c9`, module 0.3.0 → 0.3.1). Snapshot lines are kept in brackets where they moved. The usability re-run added Part F `refund.mjs` (67 lines, U-5-12) and Part G `aim.mjs` (87 lines, U-6-5); Careful Spell (`carefulKey`/`carefulFor`/`onCarefulUsed`, resolve.mjs:224–261, U-5-11) with its `deleteCombat` clean-up (resolve.mjs:466–476, U-9-8); same-usage superseding (`core.supersedes`, U-5-13); the players' status line and hidden NPC save rows (`decoratePlayer`, tray.mjs:89–110, U-5-14); untargeted touch spells on the caster (`core.selfApplyReason`, U-6-3); no same-spell stacking (`onPreCreateEffect`/`spellOf`, effects.mjs:114–143, U-6-4); and 6 booleans in settings.mjs. `areas.mjs`, `hooks.mjs`, `escape.mjs` and `attacks.mjs` are byte-identical to the snapshot. Offsets: `aoe.mjs` +1 after :10, +3 after :30, +5 after :64; `settings.mjs` +8 after :22, +9 after :27; `resolve.mjs` +1 after :22, +2 after :75, +47 after :215; `effects.mjs` +2 after :9, +35 after :109; `tray.mjs` +1 after :13, +4 after :32, +5 after :75, +28 after :83; `core.mjs` unchanged up to :271, then +54 (selfApplyReason, sameSpellEffect, aim helpers) and a new block :369–459. The node suite prints 160 passed (snapshot 135). Tally: **15 re-anchored, 0 resolved, 0 obsolete, 1 new (aoe-movement-portals-44)**; -2, -8, -9, -10, -11, -12, -13 and -15 are extended to cover the re-run code. Not raised as a finding: in core.mjs the JSDoc for `carefulApplies` (:418–424) sits above `carefulStale`'s own JSDoc and body (:425–432), so `carefulApplies` (:434) reads undocumented.

| Id | Re-anchor status (HEAD `28ccc87`) |
|---|---|
| aoe-movement-portals-2 | re-anchored — resolve.mjs:79 (snapshot :77); extended: `describeToken` now also emits `disposition`, read by `core.carefulTargets` |
| aoe-movement-portals-14 | re-anchored — effects.mjs:264 (snapshot :229); `selfReason` :156, re-check :268 |
| aoe-movement-portals-13 | re-anchored — settings.mjs:33–37 (snapshot :25–28); extended: BOOLS now 16 names, DEFAULTS 17 keys |
| aoe-movement-portals-40 | re-anchored — escape.mjs unchanged; range corrected to :29–74 (`trampoline` itself :50); tests now test/run.mjs:183–189 |
| aoe-movement-portals-4 | re-anchored — resolve.mjs:414, tray.mjs:26, tray.mjs:68; areas.mjs:392 unchanged |
| aoe-movement-portals-5 | re-anchored — resolve.mjs:89–110, effects.mjs:59/173/160; areas.mjs:287 unchanged |
| aoe-movement-portals-39 | re-anchored — core.mjs:228–230 unchanged; tests test/run.mjs:183–189 |
| aoe-movement-portals-8 | re-anchored — resolve.mjs:478–488 (snapshot :417–427); extended: `carefulFor` (:238–249) and `onCarefulUsed` (:251–260) add silent early returns |
| aoe-movement-portals-9 | re-anchored — areas.mjs:371 unchanged; extended: three new swallowed rejections (resolve.mjs:246, refund.mjs:44, :45); literal prefixes now hooks.mjs:27,30, areas.mjs:361, resolve.mjs:48 (the new code builds `${MODULE} | …` instead) |
| aoe-movement-portals-7 | re-anchored — unchanged at areas.mjs:77–95 |
| aoe-movement-portals-6 | re-anchored — resolve.mjs:37–51 (snapshot :36–50) |
| aoe-movement-portals-15 | re-anchored — unchanged at areas.mjs:429–440; uninstall now aoe.mjs:37–42; extended: aim.mjs's prototype wrap has the same gap (see -44) |
| aoe-movement-portals-12 | re-anchored — README.md:7–20 (table gained Parts F and G); extended: the recipe must say how a Part F-style synchronous veto listener registers |
| aoe-movement-portals-30 | re-anchored — unchanged at hooks.mjs:55–64; its tests now test/run.mjs:242–265 |
| aoe-movement-portals-10 | re-anchored — aoe.mjs:44–47 (snapshot :41–44); extended: a resolution now carries `careful` and rows `protected`, and core has `playerStatus` |
| aoe-movement-portals-11 | re-anchored — context/foundry/aoe.md:60–82 unchanged; extended: now 8 of 17 settings missing, and two more flags (`careful`, `npcSave`) |
| aoe-movement-portals-44 | **new** (re-run code, U-6-5) — aim.mjs's `RegionLayer.prototype.placeRegions` wrap is never removed, and a hot-patched copy cannot take it over, so Part G silently stops after a hot patch |

> **WAIT module.** This module's files were uncommitted/in flux when the snapshot was taken (another workflow is live-testing it). Every change here runs in Wave 8, only after that workflow is idle on this module, and only after re-anchoring every line.

## Summary

### pentaryn-aoe

**Purpose.**

Spell-area regions get shared ownership and a draggable handle token with a delete cascade (Part A). Save spells resolve NPC saves, a player request card and a GM Apply tray on the damage message (Part B, tray). Damage rolls automatically on a hit (Part C). Self-cast effects apply themselves, and unapplied Effects trays are highlighted (Part D). Escape cancels a region placement (Part E).

**Health.**

The best-organised module of the three:
- 10 files split by Part (12 at 28ccc87: + Part F `refund.mjs`, Part G `aim.mjs`).
- A pure core.mjs with 135 node checks (160 at 28ccc87).
- A settings table with a fallback reader.
- A hook registry with uninstall and guard().
- An election primitive (claimMessage) that the node tests cover.
- Docs are good: README, context/foundry/aoe.md, and the plan.

Gaps:
- The glue is untested apart from claimMessage. guard(), mutate(), describeToken() and guardArgonBind() are all importable but unpinned.
- Small helpers are duplicated inside the module: `t` ×4 (×5 since `refund.mjs`), `esc` ×2, damage hydration ×2, target resolvers ×3.
- Multi-session hardening covers resolve and selfApply, but not the save-matching path or the handle actor.
- aoe.md omits 2 of the 11 settings (8 of 17 at 28ccc87) and 15 of the 20 API methods.
- Nothing exposes the resolution state, so callers read raw flags.

**LLM interface.**

Today:
- Calls go through eval-js to game.pentaryn.aoe (20 methods, no describe/version).
- The action log shows 175 aoe calls. 33 of them read `flags["pentaryn-aoe"].resolution` raw to answer "what did the tray do".
- Return shapes are mixed: resolution|null, a count, `{orphansDeleted…}`, and ChatMessage|Notification|null.
- Calls default to the bridge tab's canvas.scene.

Should be:
- A `resolution(msg)` read.
- `latestResolution({scene})`.
- `summary(msg)`, which flattens the rows.
- `trace()` of recent pipeline decisions.
- `describe()` listing methods with arguments, returns and GM requirements.
- An API table in the README.
- Later, a GM-guarded `CONFIG.queries["pentaryn-aoe.resolution"]` (prompts.mjs:261 pattern), so a typed fork tool can replace eval-js.

**How to extend.**

New behaviour goes in a new `<part>.mjs` that exports `install<Part>()`:
- Register its hooks only through hooks.mjs `on()`/`guard()`.
- Add it to `installHooks()` (aoe.mjs:60; snapshot :57) and its exports to `api` (aoe.mjs:44; snapshot :41).
- Add settings to settings.mjs DEFAULTS, with `PENTARYN_AOE.Setting.<key>.*` lang keys.
- Put the pure decisions in core.mjs, with fixtures in test/run.mjs.

What is unclear today:
- None of this is written down; the README lists files, not steps.
- Whether a broadcast-hook job needs `claimMessage`.
- Where shared message/target resolvers live (three copies today).

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| aoe-movement-portals-2 | Performance gains | low | S | describeToken scans game.actors once per token in the area |
| aoe-movement-portals-14 | Performance gains | low | S | Fresh usage cards resolve their effects twice per render |
| aoe-movement-portals-13 | Maintainability gains | low | S | BOOLS re-lists the DEFAULTS keys by hand |
| aoe-movement-portals-40 | Maintainability gains | low | S | escape.mjs's trampoline, slot and register-once logic are untested |
| aoe-movement-portals-4 | Defragmentation | low | S | Damage hydration and the apply-count filter are re-implemented outside core |
| aoe-movement-portals-5 | Defragmentation | low | M | Three resolvers for recorded {actor, token} targets and three for a message's activity, with different legacy handling |
| aoe-movement-portals-39 | Defragmentation | low | S | Two predicates for "a region placement is following the mouse" read the same core internal; one adjustments row covers only one |
| aoe-movement-portals-8 | Logging / auditability gains | medium | M | The resolve pipeline stops silently at many early returns; no trace of why a tray did not appear |
| aoe-movement-portals-9 | Logging / auditability gains | low | S | Swallowed backstop-delete error, unhandled rejections in tray and eraser click handlers, guard() untested |
| aoe-movement-portals-7 | Hardening | medium | S | Two GM sessions at ready can each create an "Area handle" actor |
| aoe-movement-portals-6 | Hardening | low | S | mutate's per-message queue map never shrinks and keeps every resolution object alive |
| aoe-movement-portals-15 | Hardening | low | S | uninstall() leaves the Argon bind wrap installed; guardArgonBind is untested |
| aoe-movement-portals-44 | Hardening | low | S | New (U-6-5): aim.mjs wraps RegionLayer.prototype.placeRegions by hand; uninstall never removes it and a hot-patched copy cannot take it over, so Self cones stop aiming after a hot patch |
| aoe-movement-portals-12 | Extendability | medium | S | No written recipe for adding a Part; aoe's hook and election primitives should be the template |
| aoe-movement-portals-30 | Extendability | low | S | claimMessage is the repo's only tested two-session election; generalise it to any document |
| aoe-movement-portals-10 | LLM interface | high | S | No read API for the tray state; return shapes are mixed and undocumented |
| aoe-movement-portals-11 | Documentation / skills | medium | S | Use-doc misses 2 of 11 settings and 15 of 20 API methods; the cross-module flag contract is undocumented |

## Performance gains

### aoe-movement-portals-2 — describeToken scans game.actors once per token in the area

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/resolve.mjs:79` (snapshot :77)

**Anchor:** `    isHandleActor: !!aoeFlags(actor).handleActor || token.actorId === handleActor()?.id,`

**Current.**

handleActor() (areas.mjs:37-39) is game.actors.find(a => aoeFlags(a).handleActor), O(actors). describeToken (resolve.mjs:65) calls it once per token via `const described = tokens.map(describeToken)` (resolve.mjs:176; snapshot :174). A Fireball over 15 tokens in a 400-actor world runs 15 full scans on the GM client inside createChatMessage.

*Since the re-run (17275c9):* `describeToken` also returns `disposition: token.disposition ?? null` (resolve.mjs:77), and the same `described` array now also feeds `carefulFor` → `core.carefulTargets` (resolve.mjs:179). The scan count is unchanged; the fix below covers both consumers because both read the one `described` array.

**Proposed.**

Signature export function describeToken(token, { handleActorId = handleActor()?.id ?? null } = {}). Line 77 becomes isHandleActor: !!aoeFlags(actor).handleActor || (!!handleActorId && token.actorId === handleActorId). In resolve() compute const handleActorId = handleActor()?.id ?? null once and call tokens.map(tk => describeToken(tk, { handleActorId })). Other callers keep the default.

**Behaviour test recipe (write first, must pass before and after).**

Add to foundry/module/pentaryn-aoe/test/run.mjs (resolve.mjs imports cleanly in node, verified in snapshot). Stubs: globalThis.game = { actors: { find(fn) { calls++; return [{ id: 'HA', flags: { 'pentaryn-aoe': { handleActor: true } } }].find(fn); } }, itempiles: undefined }; globalThis.CONFIG = { DND5E: { abilities: {} } }. Fixtures: t1 { id:'t1', actorId:'HA', actor:{type:'npc',flags:{}}, texture:{} }; t2 { id:'t2', actorId:'gob', actor:{uuid:'Actor.gob',type:'npc',system:{attributes:{hp:{max:7,value:7}}},flags:{}}, texture:{src:'g.webp'}, flags:{} }; t3 with actor:null. Pin JSON.stringify(describeToken(t)) for each BEFORE the change (t1.isHandleActor true, t2 false, t3 false; at 28ccc87 each pin includes `disposition: null`, or give t2 `disposition: -1` and pin that); after the change outputs identical with the default and with { handleActorId: 'HA' }; calls === 0 when the id is passed, 1 per call with the default. Do NOT use a token with undefined actorId in the pin (old code returns true for undefined===undefined when no handle actor exists; real TokenDocuments carry null).

**Risk.** Only divergence is a token whose actorId is undefined while no handle actor exists (old: true, new: false); TokenDocument.actorId is null, never undefined, so unreachable in play. The pinned outputs catch anything else.

**Related:** aoe-movement-portals-8

### aoe-movement-portals-14 — Fresh usage cards resolve their effects twice per render

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/effects.mjs:264` (snapshot :229)

**Anchor:** `      const autoSoon = setting("autoApplySelf") && !flag?.auto && age < AUTO_GRACE && !!(await selfReason(message));`

**Current.**

For a card under an hour old, decorate() runs selfReason(message) (which calls cardEffects -> async message.system.getEffects(), a pack fetch for dnd5e.effects) and then light(message) -> pendingFor -> cardEffects again. Every flag write re-renders the card on every client, repeating both fetches. NOTE: selfReason (effects.mjs:156; snapshot :123) already accepts an optional pre-resolved effects list; only pendingFor (effects.mjs:79) lacks it. Since 17275c9 `selfReason` also passes `rangeUnits` and the `untargetedSelf` setting to `selfApplyReason`; that does not change the fetch count.

**Proposed.**

Give pendingFor an optional list: export async function pendingFor(message, { effects = null } = {}) { age early-return unchanged; effects ??= await cardEffects(message); rest unchanged }. In decorate's IIFE: const effects = await cardEffects(message) (after the age/setting checks), call selfReason(message, effects), and pass { effects } through light(msg, effects) to pendingFor. The setTimeout re-check (line 268; snapshot :233) keeps calling light(live) with no list so it fetches fresh as today. pendingFor is on the public api; the new parameter is optional.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs; effects.mjs imports cleanly in node. Stubs: globalThis.game = { settings:{ get(){ throw 0; } }, messages:{ get: () => null } }; globalThis.fromUuidSync = () => null; message { id:'u1', type:'usage', timestamp: Date.now(), flags:{}, system:{ effects:['e1'], targets:[], getEffects: async () => { n++; return [{ id:'e1', uuid:'Item.x.ActiveEffect.e1', type:'base' }]; } }, getAssociatedActor: () => ({ uuid:'Actor.me' }), getAssociatedActivity: () => ({ type:'utility', target:{ affects:{ type:'self' } } }) }. Assert await pendingFor(message) deep-equals ['e1'] with n === 1; pendingFor(message, { effects: await cardEffects(message) }) deep-equals ['e1'] and adds no fetch beyond that cardEffects call; an old card (timestamp 0) gives [] with n unchanged. Pin the first and last assertions before the change.

**Risk.** A cached list is stale only within one render pass; the 15 s re-check still fetches fresh. Pinned pendingFor outputs unchanged.

## Maintainability gains

### aoe-movement-portals-13 — BOOLS re-lists the DEFAULTS keys by hand

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/settings.mjs:33–37` (snapshot :25–28)

**Anchor:** `const BOOLS = [`

**Current.**

Adding a boolean setting needs two edits: the DEFAULTS entry (lines 11-31; snapshot 11-23) and the hand-kept BOOLS array (33-37). Forget the second and the setting is never registered while setting() still returns its default, so nothing visibly fails.

*Since the re-run (17275c9):* the usability re-run did exactly this twice-over edit for six booleans (`carefulSpell`, `refundCancelledArea`, `playerStatus`, `untargetedSelf`, `noSpellStacking`, `aimSelfAreas`), so DEFAULTS has 17 keys and BOOLS 16 names. Both lists still agree, in the same order.

**Proposed.**

const BOOLS = Object.keys(DEFAULTS).filter(k => typeof DEFAULTS[k] === 'boolean'); This keeps declaration order (the settings-menu order).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs: import { DEFAULTS } from ../settings.mjs and export BOOLS for the test. Pin BEFORE the change that BOOLS deep-equals ['handleTokens','removeAreaButton','instantCleanup','concentrationCleanup','resolveSaves','autoApplyNpc','promptPlayers','autoDamageOnHit','autoApplySelf','highlightUnapplied','carefulSpell','refundCancelledArea','playerStatus','untargetedSelf','noSpellStacking','aimSelfAreas'] (16 names at 28ccc87); it must be identical after. Assert typeof DEFAULTS.npcSaveRollMode === 'string' (stays out of BOOLS).

**Risk.** Menu order would shift if the derived order differed; the pinned literal proves it does not.

**Related:** aoe-movement-portals-21

### aoe-movement-portals-40 — escape.mjs's trampoline, slot and register-once logic are untested

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/escape.mjs:29–74` (unchanged since the snapshot; `trampoline` itself is :50)

**Anchor:** `function trampoline(context) {`

**Current.**

`escape.mjs` (74 lines, Part E) registers one PRIORITY Escape keybinding. Its `onDown` is a trampoline into a global `Symbol.for("pentaryn-aoe.cancelTemplate")` slot, so a hot-reloaded copy can take over (`registerEscape`, 55–69). `disableEscape` empties the slot only if it still holds this copy's handler (72–74). `aoe.mjs:39` (snapshot :36) calls it from `uninstall()`, so aoe-movement-portals-15's uninstall gap does not extend to Escape: only the keybinding entry remains, and Foundry cannot unregister that. (Part G's placement wrap does not have this slot design; see -44.)

Only `placementInProgress` is tested (`test/run.mjs:183–189`; snapshot :182–188). `onEscape` (consume only during a placement, still consume when `_cancelPlacement` throws), `trampoline` (only a handler returning exactly `true` consumes), the register-once guard (`game.keybindings.actions?.has`) and the slot-ownership rule have no fixture, and `onEscape`/`trampoline` are not exported.

**Proposed.**

Export `_internals = { onEscape, trampoline, SLOT }` (documented as test-only). No behaviour change.

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs` (the escape.mjs imports are pure: `core.mjs` has no imports). Stubs:
- `globalThis.game = { keybindings: { actions: new Map(), register(m, k, o) { this.actions.set(m + "." + k, o); regs.push(o); } } }`
- `CONST = { KEYBINDING_PRECEDENCE: { PRIORITY: 0 } }`
- `canvas = { regions: { _placementContext: {}, _cancelPlacement() { n++; } } }`

Assertions:
- `registerEscape()` twice → one registration, with `editable [{key:'Escape'}]` and precedence PRIORITY.
- `trampoline()` → true and `n === 1`.
- With `_placementContext = null` → false and `n` unchanged.
- With `_cancelPlacement` throwing → still true, and a `console.error` spy saw `pentaryn-aoe | cancel placement`.
- Slot set to `() => "yes"` → false.
- `disableEscape()` keeps a slot holding another function and deletes one holding `onEscape` (then `trampoline()` → false).

**Risk.** Test-only export.

**Related:** aoe-movement-portals-15, aoe-movement-portals-39


## Defragmentation

### aoe-movement-portals-4 — Damage hydration and the apply-count filter are re-implemented outside core

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/resolve.mjs:414` (snapshot :367)

**Anchor:** `  const damages = res.damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }));`

**Current.**

res.damages is turned back into dnd5e's shape (properties as a Set) twice: resolve.mjs:414 (applyRows; snapshot :367) and tray.mjs:26 (preview; snapshot :25). tray.mjs:68 (snapshot :64) recomputes the Apply count with an inline filter identical to core.applicableRows(rows) (core.mjs:119-122). areas.mjs:392 inlines isTemplateRegion(r) && regionFromSpell(r.flags?.dnd5e, { itemUuid }), which is spellAreas({ itemUuid }, s) (areas.mjs:269-274; regionFromSpell defaults activityUuid to null, so the predicates are equivalent).

**Proposed.**

Add to core.mjs: export function hydrateDamages(damages) { return (damages ?? []).map(d => ({ ...d, properties: new Set(d.properties ?? []) })); }. Use it at resolve.mjs:414 and tray.mjs:26. tray.mjs:68 -> const n = applicableRows(res.rows).length (import from core). areas.mjs:392 -> const ids = spellAreas({ itemUuid }, s).map(r => r.id).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs. hydrateDamages: input [{value:5,type:'fire',properties:['mgc']},{value:2,type:'cold'}]; assert out[0].properties instanceof Set, [...out[0].properties] equals ['mgc'], [...out[1].properties] equals [], out[0].value===5, input not mutated (Array.isArray(input[0].properties)), hydrateDamages(undefined) equals []. Apply count: on the existing `live` fixture (test/run.mjs:85 at 28ccc87) assert live.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined).length === applicableRows(live).length (2), plus a row with multiplier undefined. spellAreas equivalence: import ../areas.mjs (imports cleanly), build a scene stub { regions: { filter: fn => regs.filter(fn) } } from the v6(...) fixtures in the regionFromSpell block plus a non-template region; assert spellAreas({ itemUuid: spell.itemUuid }, scene).map(r=>r.id) equals the ids from the old inline filter.

**Risk.** hydrateDamages adds tolerance for a missing damages array where the old code threw inside guard; strict improvement, pinned by the test.

**Related:** aoe-movement-portals-5

### aoe-movement-portals-5 — Three resolvers for recorded {actor, token} targets and three for a message's activity, with different legacy handling

**Category:** Defragmentation · **Impact:** low · **Effort:** M · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/resolve.mjs:89–110` (snapshot :87–108)

**Anchor:** `function tokensForTargets(targets, scene) {`

**Current.**

Recorded targets: resolve.mjs:89 tokensForTargets (token, then tg.actor ?? tg.uuid, legacy uuid supported); effects.mjs:59 targetActors (token's actor, then tg.actor, no legacy uuid; snapshot :57); effects.mjs:173 targetActorUuid (token's actor uuid, then tg.actor; snapshot :138). Activity lookups: resolve.mjs:108 activityOf (getAssociatedActivity ?? fromUuidSync(system.activity.uuid)); areas.mjs:287 the same inline (guarded by an early return on missing uuid); effects.mjs:160 getAssociatedActivity only (snapshot :127). A dnd5e change to system.targets must be fixed in three places. (The re-run's `spellOf`, effects.mjs:134–143, resolves an applied effect's source item, not a recorded target, and is out of scope here.)

**Proposed.**

New foundry/module/pentaryn-aoe/messages.mjs (glue; uses fromUuidSync): recordedTarget(tg) returning { token, actor, actorUuid } using exactly the token-then-tg.actor chain, and activityOf(message) moved from resolve.mjs. Rewrite targetActors and targetActorUuid on top of recordedTarget with each one's exact fallbacks (targetActors must NOT gain the legacy uuid). tokensForTargets keeps its scene logic and its own tg.uuid fallback. areas.mjs:287 calls activityOf. effects.mjs:160 stays on getAssociatedActivity only.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs. Export targetActors, targetActorUuid, tokensForTargets as _-prefixed test seams. Registry stub: globalThis.fromUuidSync = u => reg[u] ?? null with reg = { T1: { actor: { uuid:'Actor.a1', effects:[] } }, 'Actor.a2': { uuid:'Actor.a2', effects:[] }, 'Actor.a3': { uuid:'Actor.a3', effects:[] } }. Targets [{token:'T1',actor:'Actor.x'},{actor:'Actor.a2'},{uuid:'Actor.a3'},{token:'gone',actor:'Actor.a2'}]. Pin BEFORE: targetActors uuids [Actor.a1, Actor.a2, Actor.a2] (legacy ignored); targetActorUuid per target [Actor.a1, Actor.a2, null, Actor.a2]; tokensForTargets resolves the legacy entry via tg.uuid (give the scene stub tokens.find / actor.token). Same assertions after the change.

**Risk.** Legacy uuid support differs per call site; merging naively changes which migrated 5.3.3 cards resolve or self-apply. The pinned per-site fallback sets lock this.

**Related:** aoe-movement-portals-4

### aoe-movement-portals-39 — Two predicates for "a region placement is following the mouse" read the same core internal; one adjustments row covers only one

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/core.mjs:228–230` (unchanged at 28ccc87); `foundry/module/pentaryn-cursors/cursors.mjs:73–76` (cursors lines as at the snapshot; re-anchor with the cursors guide)

**Anchor:** `export function placementInProgress(layer) {`

**Current.**

- **aoe:** `placementInProgress(layer)` = `!!layer?._placementContext && typeof layer._cancelPlacement === "function"`. It decides whether Escape is consumed (`escape.mjs:40`).
- **cursors:** `previewActive()` = `placementActive(layer?.preview?.children, layer?._placementContext?.preview)` (`cursors-core.mjs:58–61`). It decides the `aoe` cursor.

The two answer different questions. aoe asks "can I cancel?"; cursors asks "is the preview on the layer yet?". The preview joins `canvas.regions.preview` only on the first pointer move (`cursors.mjs:131`). So they must not be merged: §1.3 policy says so, and cross-module imports are banned anyway.

Both read core's private `_placementContext`, but adjustments row `core-region-placement-escape` (`adjustments.yml:211–215`, markers `_placementContext` and `_cancelPlacement`) lists only aoe's files. senses-walls-cursors-30 proposes a second row for cursors that would carry the same marker.

**Proposed.**

1. Do not merge the predicates. Add a cross-reference comment at each definition, naming the other and stating the difference.
2. Widen `core-region-placement-escape` to `modules: [pentaryn-aoe, pentaryn-cursors]`, adding `foundry/module/pentaryn-cursors/cursors.mjs` to its files: one internal, one row. senses-walls-cursors-30's new row keeps only the cursors-only internals (`events.currentCursor`, `setCursor`, the control/tool `onChange` wrap).
3. Pin both truth tables on one shared input table.

**Behaviour test recipe (write first, must pass before and after).**

Use the same four layer shapes in both modules' `test/run.mjs`:
- **A:** `{_placementContext: {preview: P}, _cancelPlacement: fn, preview: {children: [P]}}`
- **B:** same as A, but `children: []` (the context is set and the preview is not drawn yet)
- **C:** `{_placementContext: null, _cancelPlacement: fn, preview: {children: []}}`
- **D:** `undefined`

Expected results:
- **aoe:** `placementInProgress` → A true, B true, C false, D false. A, C and D are already pinned at `test/run.mjs:185–189` (snapshot :184–188); add B.
- **cursors:** `placementActive(l?.preview?.children, l?._placementContext?.preview)` → A true, B false, C false, D false.

`make foundry-adjustments-check` passes with the widened row.

**Risk.** Comments, tests and a registry row. WAIT: aoe `core.mjs` and `adjustments.yml` were in flux at the snapshot. At 28ccc87 the row is still `adjustments.yml:211–215` with only aoe's files. Part G (`aim.mjs`) also takes part in a placement, but through the public `placeRegions` `onMove` option, not `_placementContext`, so it does not join this row.

**Related:** senses-walls-cursors-30, aoe-movement-portals-40


## Logging / auditability gains

### aoe-movement-portals-8 — The resolve pipeline stops silently at many early returns; no trace of why a tray did not appear

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** M · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/resolve.mjs:478–488` (snapshot :417–427)

**Anchor:** `  on("createChatMessage", guard("createChatMessage", async (message) => {`

**Current.**

The tray can fail to appear for many reasons with no log: in the createChatMessage hook (not active GM, not damage, resolveSaves off, already resolved, activity has no save, lost the claim, resolved meanwhile), in resolve() (resolve.mjs:156-160, snapshot :154-158: not active GM, wrong type, no save) and in applyRows (408-412, snapshot :361-365: not GM, no res; superseded toasts). aoe has no debug switch, so diagnosing means reading flags["pentaryn-aoe"].resolution by hand.

*Since the re-run (17275c9):* Careful Spell adds two more silent decisions. `carefulFor` (resolve.mjs:238–249) returns `null` without a word when `carefulSpell` is off, the caster has no `careful` flag, or `carefulApplies` refuses it (wrong combat turn, older than 10 minutes, bound to another usage card), and that `null` is what decides whether allies get the "protected" row. `onCarefulUsed` (:251–260) stops silently when the item is not `careful-spell` or the actor is not owned. "Why was my ally not protected?" has the same no-trace problem as "why did no tray appear?".

**Proposed.**

hooks.mjs: const TRACE = []; export function trace(job, messageId, outcome, extra) { pushRing(TRACE, { ts: Date.now(), job, messageId, outcome, ...extra }, 50); if (CONFIG.debug?.['pentaryn-aoe']) console.debug(...); } and export const traces = () => TRACE.slice(). Pure pushRing(buf, item, max) in core.mjs (push, then splice from the front while buf.length > max). Call trace() at each early return, including `carefulFor`'s three (`trace("careful", usage, "off"|"no-flag"|"not-applicable", { combatKey })`; it returns `null` today, so `trace(...); return null;`). IMPORTANT: preserve each path's current return value. Hook-body paths return undefined, so `return trace(...)` is fine there; resolve() and applyRows return null today, so write `trace(...); return null;` there, never `return trace(...)`. Expose trace: traces on the api.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs. pushRing: b=[]; for i<5 pushRing(b,i,3) gives [2,3,4]; pushRing(b,9,0) gives []. trace() with globalThis.CONFIG = {}: after two calls traces().length === 2 and console.debug (spy) not called; with CONFIG.debug = {'pentaryn-aoe':true} one console.debug per call. Return-value pin (add BEFORE editing): call resolve('x') with game = { users:{activeGM:{isSelf:false}} } and applyRows('x') with game = { user:{isGM:false} }; both must still resolve to null after the change. Re-run the existing claimMessage block unchanged. Careful pin (28ccc87): `carefulFor` is not exported; either export it as `_internals.carefulFor` with the other seams, or drive it through `resolve()` — with `game.settings.get` throwing (defaults: `carefulSpell` true) and a caster whose `flags["pentaryn-aoe"].careful` is absent, the resolution's `careful` is `null`; with `{ at: Date.now(), key: null, usage: null }` and no started combat it is `{ names: [...], max }`. Both pins must hold after trace() lands.

**Risk.** Accidentally converting `return null` into `return trace(...)` would change api return shapes; the null pins catch it. Ring buffer is bounded at 50.

**Related:** aoe-movement-portals-10, aoe-movement-portals-9

### aoe-movement-portals-9 — Swallowed backstop-delete error, unhandled rejections in tray and eraser click handlers, guard() untested

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/areas.mjs:371`

**Anchor:** `    else if (game.users.activeGM?.isSelf) setTimeout(() => deleteHandlesOf(region).catch(() => {}), 1500);`

**Current.**

areas.mjs:371 (unchanged at 28ccc87) discards every error from the GM's delayed handle delete. The tray's change and click listeners (tray.mjs:125-145, snapshot :97-117) call resolve/applyRows/rollNpcSaves/rollForPlayer/pingPlayers without a catch, so a thrown rollSavingThrow/applyDamage becomes an untagged Uncaught (in promise). The eraser handler (areas.mjs:300-314) has try/finally but no catch. Literal 'pentaryn-aoe' prefixes are hardcoded at hooks.mjs:27 and 30, areas.mjs:361, resolve.mjs:48 (snapshot :47). guard() (hooks.mjs:23-33), through which every hook goes, has no test.

*Since the re-run (17275c9), three more swallows:*
- `resolve.mjs:246` — ``if (usage && !flag.usage) await caster.update({ [`flags.${MODULE}.careful.usage`]: usage }).catch(() => null)``. If binding the Careful use to its usage card fails, a later different spell can still take the protection (`carefulApplies` only checks `usage` when it is set), with no log.
- `refund.mjs:44` — `e.delete().catch(() => null)` on the concentration this cast began.
- `refund.mjs:45` — `message.delete().catch(() => message.update({ "system.deltas": null }).catch(() => null))`: if both fail, the refunded card keeps its Refund button and can be refunded a second time, with no log.

(The new `${MODULE} | replace …` warn at effects.mjs:130 and refund.mjs:61/64 already build the prefix from `MODULE`.)

**Proposed.**

areas.mjs:371 -> .catch(err => /does not exist/i.test(err?.message ?? '') ? null : console.warn(`${MODULE} | backstop handle delete`, err)). tray.mjs: wrap both listeners in guard('tray change', ...) and guard('tray click', async ...). areas.mjs:300: wrap the eraser listener in guard('remove all templates', ...). hooks.mjs: import MODULE from core and use it for the four literals. Optionally wrap preCreateCombatant (areas.mjs:375) in guard (guard passes a synchronous false through). Re-run code: resolve.mjs:246 -> `.catch(err => console.warn(\`${MODULE} | careful bind usage\`, err))`; refund.mjs:44 -> the same "does not exist" filter, else `console.warn(\`${MODULE} | refund end concentration\`, err)`; refund.mjs:45 -> keep the update fallback, and on the inner catch `console.warn(\`${MODULE} | refund card cleanup\`, err)`. Return values stay `undefined`/`null` as today (each result is awaited and discarded).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs: import { guard } from ../hooks.mjs, spy console.error. Assert guard('x', () => false)() === false; guard('x', () => 7)() === 7; a sync throw returns undefined with one console.error whose first arg is 'pentaryn-aoe | x'; async rejection returns undefined and after a microtask logs the same prefix; guard('x', async () => 5)() returns undefined. Pin before touching call sites; must still pass after MODULE replaces the literal. Re-run sites: export `refund` from refund.mjs as `_internals.refund` and call it with `activity = { refund: async () => {}, actor: { effects: { has: () => true } }, target: { template: { type: 'sphere' } }, item: { name: 'Fireball' } }`, `usageConfig = { create: { measuredTemplate: true } }`, `results = { templates: [], effects: [{ id: 'c', parent: activity.actor, statuses: new Set(['concentrating']), delete: async () => { throw new Error('boom'); } }], message }` where `globalThis.ChatMessage = class {}` and `message = Object.assign(new ChatMessage(), { id: 'm1', system: { deltas: { actor: [{}] } }, ... })` with `delete: async () => { throw new Error('gone'); }`, `update: async () => { throw new Error('nope'); }`; stubs `canvas = { scene: {} }`, `game.user.can = () => true`, `game.messages.has = () => true`, `ui.notifications.info` spy, `CONFIG.specialStatusEffects = {}`, `game.i18n = { format: k => k, localize: k => k }`. Pin BEFORE: resolves `true`, one info toast, no console output. AFTER: still `true` and one toast, plus exactly two `console.warn` calls whose first argument starts `pentaryn-aoe | refund`.

**Risk.** guard returns undefined for async fns; browser listeners ignore return values, so wrapping them changes nothing visible. The 'does not exist' filter only lowers log noise.

**Related:** aoe-movement-portals-8, aoe-movement-portals-27

## Hardening

### aoe-movement-portals-7 — Two GM sessions at ready can each create an "Area handle" actor

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/areas.mjs:77–95` (unchanged at 28ccc87; areas.mjs is byte-identical to the snapshot)

**Anchor:** `export async function ensureHandleActor() {`

**Current.**

readyAreas (areas.mjs:414) runs on every client where activeGM.isSelf, i.e. both the bridge tab and a GM browser tab on one account. When no handle actor exists both reach Actor.implementation.create (line 85). Handle tokens are protected by a deterministic _id with keepId (createHandle, areas.mjs:156-171), the actor is not, so a fresh or actor-deleted world can get two actors and handleActor() (first find hit) may flip between them across reloads.

**Proposed.**

const HANDLE_ACTOR_ID = 'pentarynAoeHndl0' (exactly 16 alphanumerics, verified). Create with Actor.implementation.create({ _id: HANDLE_ACTOR_ID, ...same data }, { keepId: true }) inside try/catch; on /already exists/i return handleActor(), else rethrow (same pattern as createHandle lines 160-171). Existing worlds keep their actor because handleActor() finds it by flag first and create is never reached.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs, import ../areas.mjs. Stubs: globalThis.game = { user:{isGM:true}, actors:{find:()=>null}, folders:{find:()=>null} }; globalThis.CONST = { TOKEN_DISPLAY_MODES:{HOVER:30,NONE:0}, TOKEN_DISPOSITIONS:{SECRET:-2} }; globalThis.foundry = { utils:{ isEmpty:o=>!Object.keys(o).length, getProperty:(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o) } }; globalThis.Actor = { implementation:{ create: async (data,opts)=>{ captured.push([data,opts]); return {id:data._id??'rand',...data}; } } }. BEFORE: pin JSON.stringify of captured[0][0] minus _id (name 'Area handle', type npc, img, folder null, ownership {default:3}, system, prototypeToken, flags) and captured[0][1] === undefined. AFTER: same data plus _id 'pentarynAoeHndl0' and opts.keepId === true; /^[A-Za-z0-9]{16}$/ matches the constant; with create throwing new Error('Actor x already exists') and find returning the flagged actor on the second call, ensureHandleActor resolves to that actor.

**Risk.** A foreign document already using that id would make create fail; negligible, and on the already-exists path the actor is looked up by flag (null if unflagged, same as today's no-actor state).

**Related:** aoe-movement-portals-30

### aoe-movement-portals-6 — mutate's per-message queue map never shrinks and keeps every resolution object alive

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/resolve.mjs:37–51` (snapshot :36–50)

**Anchor:** `const queues = new Map();`

**Current.**

queues.set(messageId, next) (line 49; snapshot :48) stores a promise resolving to the full resolution object written back. Nothing deletes the entry, so every resolved and every superseded damage message (supersedeOlder calls mutate on each) stays in memory with its rows for the whole session.

**Proposed.**

Keep the serialisation, drop the tail once it settles: after queues.set add next.finally(() => { if (queues.get(messageId) === next) queues.delete(messageId); }); (next already has a .catch so it never rejects). Export const pendingWrites = () => queues.size for debugging and tests.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs. Stubs: globalThis.foundry = { utils: { deepClone: structuredClone } }; const msg = { id:'m', flags:{'pentaryn-aoe':{resolution:{rows:[],n:0}}}, async update(u){ await null; this.flags['pentaryn-aoe'].resolution = u['flags.pentaryn-aoe.resolution']; } }; globalThis.game = { messages: { get: () => msg } }. Import { mutate } from ../resolve.mjs. Fire without awaiting: a = mutate('m', r => { r.n++; return r; }); b = mutate('m', r => { r.n *= 10; return r; }). Assert (await b).n === 10 and msg resolution n === 10 (order preserved, pin BEFORE the change). After the change: await a; await b; await new Promise(r => setTimeout(r)) then pendingWrites() === 0; a third mutate still sees n=10 and makes it 11.

**Risk.** Deleting while a later call is queued would break ordering; the === next identity check prevents it and the ordering assertion proves it.

### aoe-movement-portals-15 — uninstall() leaves the Argon bind wrap installed; guardArgonBind is untested

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/areas.mjs:429–440` (unchanged at 28ccc87)

**Anchor:** `export function guardArgonBind() {`

**Current.**

guardArgonBind replaces ui.ARGON.bind with an instance wrapper marked _aoeGuard. uninstall() (aoe.mjs:37-42; snapshot :34-39) removes hooks and the Escape slot but never restores bind. After a hot-patch uninstall Argon keeps calling a closure from the removed copy, and a second hot-patch sees _aoeGuard and keeps the old closure, so a fixed isHandleTarget never takes effect without a reload. No test.

**Proposed.**

areas.mjs: let argonOriginal = null; set argonOriginal = own before wrapping; add export function unguardArgonBind() { const hud = ui.ARGON; if (hud?.bind?._aoeGuard && argonOriginal) hud.bind = argonOriginal; argonOriginal = null; } and call it from uninstall() in aoe.mjs:37.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs, import { guardArgonBind, unguardArgonBind } from ../areas.mjs. const orig = function (t) { return 'bound:' + (t?.id ?? ''); }; globalThis.ui = { ARGON:{ bind: orig } }. Pin current: guardArgonBind() === true; ui.ARGON.bind._aoeGuard === true; ui.ARGON.bind({ document:{ flags:{ 'pentaryn-aoe':{ handle:true } } } }) is a Promise resolving to undefined; ui.ARGON.bind({ id:'x', flags:{} }) === 'bound:x'; a second guardArgonBind() returns true without double-wrapping (same function reference); globalThis.ui = {} makes it return false. After the change: unguardArgonBind(); ui.ARGON.bind === orig.

**Risk.** Only the hot-patch uninstall path changes; normal loads never call uninstall. Pinned tests prove the guard itself is unchanged.

*Since the re-run (17275c9):* Part G (`aim.mjs:62–82`) added a second hand-made wrap with the same uninstall gap, on a core prototype instead of an Argon instance, and with a worse hot-patch outcome (the feature stops instead of keeping old code). It is filed separately as aoe-movement-portals-44 so the two land with one pattern (kit `wrapMethod` + unwrap in `uninstall`).

**Related:** aoe-movement-portals-20, aoe-movement-portals-44

### aoe-movement-portals-44 — New (U-6-5): aim.mjs wraps RegionLayer.prototype.placeRegions by hand; uninstall never removes it and a hot-patched copy cannot take it over, so Self cones stop aiming after a hot patch

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (re-run code, 17275c9; aoe is still in `wait.json`)

**Where:** `foundry/module/pentaryn-aoe/aim.mjs:62–82`

**Anchor:** `function wrapPlacement() {`

**Current.**

Part G (U-6-5) replaces core's `RegionLayer.prototype.placeRegions` with a function that consumes the module-level `armed` (aim.mjs:25, set by the `dnd5e.preCreateMeasuredTemplate` hook at :36–45) and passes an `onMove` that keeps a Self cone or line on the caster. Three problems, all on the documented hot-patch path (`aoe.mjs:76–85 install()`, behind `globalThis.__pentarynAoeHot`), none on a normal load:
- `uninstall()` (aoe.mjs:37–42) never restores the prototype method: there is no unwrap at all.
- The "already wrapped" guard is a global `Symbol.for("pentaryn-aoe.aimWrapped")` set on the prototype (:26, :65, :81). A hot-patched copy's `installAim()` sees it and returns without wrapping, but registers its own preCreate hook, which arms the **new** copy's `armed`. The installed wrapper is the **old** copy's closure and reads the old `armed`, which nothing sets any more. Result: after a hot patch, Self cones and lines silently go back to core's placement (origin under the pointer, facing east) until a full reload, which is exactly the U-6-5 bug.
- The wrap is a raw prototype assignment, not the kit's `wrapMethod`, so adjustments row `aoe-self-area-aim` (adjustments.yml:785) fails C32 ("no wrapMethod patch naming it"), and the wrap carries no record for `patches()`.

escape.mjs solved the same "a hot copy must take over" problem with a global slot (`SLOT`, escape.mjs:29). aoe-movement-portals-15 is the same uninstall gap on Argon's `bind`.

**Proposed.**

In the S6 step (with -15), behaviour-neutral on a normal load:
1. Route the wrap through kit `wrapMethod(MODULE, { target: RegionLayer.prototype, name: "placeRegions", label: "RegionLayer#placeRegions", marker: WRAPPED, adjustments: "aoe-self-area-aim" }, function (wrapped, data, options = {}) { …today's body… })`, keep the handle, and add `export function uninstallAim() { handle?.unwrap(); handle = null; armed = null; }`.
2. Call `uninstallAim()` from `uninstall()` (S5: `aim.uninstall`).
3. With the old wrap removed on uninstall, the new copy's `installAim()` finds no marker and wraps with its own closure, so its own `armed` is read. No global slot is needed once unwrap exists. (If `wrapMethod` refuses to wrap over a foreign wrapper that sits on top of ours, fall back to keeping `armed` in a `Symbol.for("pentaryn-aoe.aimArmed")` slot on `globalThis`, as escape.mjs does.)

**[declared] D-A7**, hot-patch path only: after `uninstall()`, `RegionLayer.prototype.placeRegions` is core's again, and a hot-patched copy aims Self cones.

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs` (or `glue.test.mjs` after S1). aim.mjs imports `core.mjs` (pure), `settings.mjs` and `hooks.mjs`; all import cleanly in node. Stubs:
- `const seen = []; class RegionLayer { placeRegions(data, options) { seen.push(options); return "placed"; } }; const orig = RegionLayer.prototype.placeRegions;`
- `globalThis.foundry = { canvas: { layers: { RegionLayer } } }`
- `const hooks = []; globalThis.Hooks = { on: (n, f) => hooks.push([n, f]), off() {} }`
- `globalThis.game = { settings: { get() { throw 0; } } }` (so `aimSelfAreas` reads its default, true)
- `globalThis.CONFIG = { DND5E: { areaTargetTypes: { cone: { template: "cone" } } } }`
- `globalThis.canvas = { scene: { id: "s1", tokens: { get: () => ({ x: 0, y: 0, width: 1, height: 1 }) } }, grid: { size: 100 } }`
- `const activity = { range: { units: "self" }, target: { template: { type: "cone" } }, getUsageToken: () => ({ document: { id: "tk", parent: { id: "s1" } } }) }`
- `const arm = () => hooks.filter(([n]) => n === "dnd5e.preCreateMeasuredTemplate").at(-1)[1](activity)`

Assertions on unchanged code (pin these BEFORE the change):
1. One copy: `const A = await import("../aim.mjs?copy=1"); A.installAim(); arm(); new RegionLayer().placeRegions({}, {})` → `typeof seen[0].onMove === "function"`; calling it with `{ shape: { type: "cone", updateSource(u) { upd = u; } }, position: { x: 300, y: 50 } }` returns `false` and `upd` deep-equals `aimFromCaster({ x: 50, y: 50 }, 50, 50, { x: 300, y: 50 })` (= `{ x: 100, y: 50, rotation: 0 }`).
2. Not armed (no `arm()` before the call) → `seen.at(-1).onMove === undefined`.
3. A non-Self activity (`range.units: "ft"`) → not armed.

Hot-patch case (today: FAILS the expectation, so pin today's value and flip it with the fix): `hooks.length = 0` (simulates `offAll`); `const B = await import("../aim.mjs?copy=2"); B.installAim(); arm(); new RegionLayer().placeRegions({}, {})`. Today `seen.at(-1).onMove === undefined` (the bug); after the fix, with `A.uninstallAim()` called first, it is a function, and after `A.uninstallAim()` alone `RegionLayer.prototype.placeRegions === orig`.

**Risk.** Normal loads wrap once at setup, exactly as today; the pinned one-copy cases prove the aim itself is unchanged. Only the hot-patch path changes, and only from "silently off" to "works".

**Related:** aoe-movement-portals-15, aoe-movement-portals-40

## Extendability

### aoe-movement-portals-12 — No written recipe for adding a Part; aoe's hook and election primitives should be the template

**Category:** Extendability · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/README.md:7–20` (snapshot :7–18; the table gained `refund.mjs` F and `aim.mjs` G)

**Anchor:** `| File | Part | |`

**Current.**

The README file table explains what exists, not how to add a Part F: new hooks must go through on()/guard() so uninstall() removes them; installHooks and api wiring in aoe.mjs; settings DEFAULTS plus lang keys; when a broadcast-hook job must call claimMessage. hooks.mjs (on/offAll/guard/claimMessage) is the cleanest of the repo's hook-registry idioms (others: senses/light.mjs:691 (snapshot :670), senses/chain.mjs:243) and nothing points builders to it.

*Since the re-run (17275c9):* two Parts were added (F `refund.mjs`, G `aim.mjs`) without a recipe, and each picked its own registration style: `refund.mjs:53` registers through raw `on()` with **no** `guard()` (a synchronous `dnd5e.postUseActivity` listener whose literal `false` must reach `Hooks.call`; its own try/catch logs instead), and `aim.mjs:62–82` patches a core prototype by hand (-44). Both are legitimate needs the recipe must cover: "a listener that vetoes returns synchronously and is registered unguarded, with its own try/catch" and "a prototype patch goes through `wrapMethod` and is undone in `uninstall`".

**Proposed.**

Add README '## Adding a part' with five steps: (1) <part>.mjs exporting install<Part>() with every hook via on(name, guard(label, fn)); (2) pure decisions in core.mjs with fixtures in test/run.mjs; (3) settings in settings.mjs DEFAULTS plus PENTARYN_AOE.Setting.<key>.Name/Hint in lang/en.json; (4) broadcast-hook jobs on the GM: gate with activeGM.isSelf then await claimMessage(doc, '<job>'); (5) wire into aoe.mjs installHooks() and api, add an adjustments.yml row if it touches a third-party internal, run make foundry-aoe-check; (6) exceptions, with refund.mjs and aim.mjs as the examples: a veto listener returns a literal `false` synchronously and registers with `on()` alone (its own try/catch, logging with the `${MODULE} |` prefix); a prototype patch uses `wrapMethod` and its unwrap runs from `uninstall()`. In context/foundry/README.md cite hooks.mjs as the reference hook-registry implementation.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Optional guard in foundry/module/pentaryn-aoe/test/run.mjs: import ../hooks.mjs plus ../areas.mjs, ../resolve.mjs, ../tray.mjs, ../effects.mjs, ../attacks.mjs, and since 17275c9 ../refund.mjs and ../aim.mjs (all import cleanly in node; refund/aim reference `ChatMessage`/`foundry` only inside functions) and assert hookIds().length === 0, pinning that hooks register only inside install*() and never at module scope.

**Risk.** None.

**Related:** aoe-movement-portals-11, aoe-movement-portals-30

### aoe-movement-portals-30 — claimMessage is the repo's only tested two-session election; generalise it to any document

**Category:** Extendability · **Impact:** low · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/hooks.mjs:55–64` (unchanged at 28ccc87)

**Anchor:** `export async function claimMessage(message, key) {`

**Current.**

claimMessage stamps the client's socket id in a flag, waits 750 ms and re-reads through game.messages.get. It needs only doc.update, doc.id and a re-read, yet is message-only. Elsewhere two-session guards are improvised (portals relies on keepId refusal, aoe-movement-portals-28; ties/study.mjs:158-211 stakes a row; other modules use activeGM.isSelf).

**Proposed.**

hooks.mjs: export async function claimDocument(doc, key, { scope = MODULE, settleMs = CLAIM_SETTLE_MS, reread = d => d.collection?.get?.(d.id) ?? d } = {}) with the same body and path flags.${scope}.claims.${key}; keep export const claimMessage = (m, key) => claimDocument(m, key, { reread: d => game.messages.get(d.id) ?? {} }) so call sites and behaviour are unchanged. Record claimDocument as the reference election in the module-template docs; other modules would vendor the file until a shared lib exists.

**Behaviour test recipe (write first, must pass before and after).**

The existing claimMessage block in foundry/module/pentaryn-aoe/test/run.mjs (lines 242-265 at 28ccc87, snapshot 215-238: two clients one winner, last writer wins, late client stands down, winner asking again wins, separate job key is a separate claim, no socket id acts) must pass unchanged. Add a claimDocument run on a non-message doc { id:'t1', flags:{}, collection:{ get:()=>doc }, update } with scope 'pentaryn-portals' and settleMs 0: the two-client case writes to flags.pentaryn-portals.claims.follow and exactly one wins.

**Risk.** claimMessage's re-read stays game.messages.get(id) ?? {} (pinned by existing tests); the message claims flag scope stays pentaryn-aoe via the default scope.

**Related:** aoe-movement-portals-28, aoe-movement-portals-7

## LLM interface

### aoe-movement-portals-10 — No read API for the tray state; return shapes are mixed and undocumented

**Category:** LLM interface · **Impact:** high · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/module/pentaryn-aoe/aoe.mjs:44–47` (snapshot :41–44)

**Anchor:** `const api = {`

**Current.**

The 20-method api (areasFor ... uninstall, counted in the snapshot) has writers and finders but no read of the resolution, the module's main state, so callers read flags["pentaryn-aoe"].resolution directly. Return shapes differ: resolve and applyRows return resolution|null (applyRows null for not-GM, missing and superseded alike), pingPlayers ChatMessage|Notification|null, removeArea a number, sweep a counts object. removeArea and sweep default to canvas.scene, which from the MCP bridge is the bridge tab's view. No describe() or version.

*Since the re-run (17275c9):* the api is still the same 20 methods, but the state they hide grew. A resolution now carries `careful: { names, max } | null` (resolve.mjs:190) and rows can carry `protected: true` with `save.careful: true` (core `protectRows`, core.mjs:406–416); NPC save messages carry `flags.pentaryn-aoe.npcSave`; actors carry `flags.pentaryn-aoe.careful` `{ at, key, usage }`. The players' status line is computed by the pure `core.playerStatus(res)` (core.mjs:454–459) but is not reachable from the api, so "what does the caster see?" also needs a raw flag read.

**Proposed.**

Additive read-only entries, existing ones untouched: resolution(messageOrId) returning a deepClone of the flag or null; latestResolution({ sceneId } = {}) scanning game.messages.contents.slice(-60) (same window as resolve.mjs:354, snapshot :307) for the newest non-superseded resolution; summary(messageOrId) built by a new pure core.summariseResolution(res) returning { item: res.itemName, ability, dc, onSave, region, superseded, applicable: applicableRows(res.rows).length, rows: res.rows.map(r => ({ id, name, kind, apply, save: r.save ? { total, success } : null, multiplier, applied, hp: r.hp ?? null, caster, protected: !!r.protected })), careful: res.careful ?? null, playerStatus: playerStatus(res) } (the last three since 17275c9); isHandle(tokenOrDoc) exposing isHandleTarget; describe() returning { id, version, methods: [{ name, args, returns, who }] }. Document the existing return shapes in the README API table (aoe-movement-portals-11) instead of changing them.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-aoe/test/run.mjs. summariseResolution on the existing `res` fixture (buildRows on toks, ~line 91; yields 6 rows g1,g2,cv,mr,dead,hid) plus { itemName:'Fireball', dc:15, onSave:'half', region:'r1', superseded:false }, with g1 filled via fillSave(row, {total:18, success:true}, 'half'). Assert rows.length === 6; rows[0] deep-equals { id:'g1', name:'Goblin 1', kind:'auto', apply:true, save:{total:18,success:true}, multiplier:0.5, applied:false, hp:null, caster:false, protected:false }; applicable === 1; careful === null; playerStatus === 'waiting'; after protectRows(res.rows, ['g2'], 'half') the g2 summary row has protected:true, save.success true and multiplier 0; input not mutated (JSON before equals after). Pin the 20 current api key names (Object.keys of the api object, via a test export; still 20 at 28ccc87).

**Risk.** Additive; the pinned key-list test prevents an accidental rename. latestResolution reuses the existing 60-message window.

**Related:** aoe-movement-portals-11, aoe-movement-portals-8

## Documentation / skills

### aoe-movement-portals-11 — Use-doc misses 2 of 11 settings and 15 of 20 API methods; the cross-module flag contract is undocumented

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `context/foundry/aoe.md:60–82` (unchanged at 28ccc87)

**Anchor:** `## Settings (world, Configure Settings → Pentaryn AoE)`

**Current.**

aoe.md settings table lists 9 of the 11 DEFAULTS in settings.mjs; autoApplySelf and highlightUnapplied (lang keys exist) are missing. The Console block shows 5 of 20 api methods and the module README has no API section. flags["pentaryn-aoe"].handle / .handleActor are read by other modules (pentaryn-creatures/creatures.mjs:35 isProp, pentaryn-senses/light.mjs:170) but the aoe README presents them as internal state.

*Since the re-run (17275c9):* DEFAULTS has 17 keys, so aoe.md now misses **8 of 17**: the two above plus `carefulSpell`, `refundCancelledArea`, `playerStatus`, `untargetedSelf`, `noSpellStacking`, `aimSelfAreas` (all have `PENTARYN_AOE.Setting.<key>.Name` keys, lang/en.json:64–75). aoe.md was not touched by the re-run, so Parts F (refund) and G (aim) and the Careful Spell / status-line behaviour are documented only in the module README (README.md:44–53 and the file table). Two new flags: `flags.pentaryn-aoe.careful` on actors (written by the caster's client, cleared by the GM on `deleteCombat`) and `flags.pentaryn-aoe.npcSave` on messages (read by `tray.mjs:96` on player clients); neither is read by another module today. pentaryn-portals' `spreadArrival` is now a third reader of `.handle` (aoe-movement-portals-43).

**Proposed.**

1) aoe.md settings table: add rows 'Apply self-cast effects automatically | on' and 'Highlight effects not yet applied | on', plus the six re-run rows (all default on): 'Careful Spell protects allies in the area', 'Refund a cancelled area', 'Tell the caster when damage is waiting for the GM', 'A touch spell cast at nobody goes on the caster', 'The same spell does not stack', 'Self cones and lines start at the caster'; and a short Parts F/G section. 2) Module README: add '## API (game.pentaryn.aoe)' with one row per method (args, exact return including null cases, who may call, side effects, default scene), covering all 20 plus the reads from aoe-movement-portals-10. 3) Module README: '## Flags other modules read (stable contract)' listing .handle, .handleActor, .region with readers (creatures.mjs:35, senses/light.mjs:170, portals `spreadArrival`, core.isHandleTarget); '## Data written' adds `.careful` (actor) and `.npcSave` (message) as module-internal. 4) aoe.md Console points to the README table.

**Behaviour test recipe (write first, must pass before and after).**

Docs-drift guard: new scripts/tests/test_aoe_docs.py (pytest; scripts/tests exists). Read foundry/module/pentaryn-aoe/settings.mjs, extract DEFAULTS keys with re.findall(r'^\s{2}(\w+):', block) between 'export const DEFAULTS = {' and '};'; load lang/en.json; for every key assert en['PENTARYN_AOE.Setting.<key>.Name'] occurs in context/foundry/aoe.md (fails at 28ccc87 for 8 keys: autoApplySelf, highlightUnapplied and the six re-run settings; passes after). Second assert: every key of the api object in aoe.mjs (regex between 'const api = {' and '};') appears in the module README.

**Risk.** Docs only.

**Related:** aoe-movement-portals-10, aoe-movement-portals-12

## Files added to the audit after the first pass

- `escape.mjs` (74 lines, Part E): aoe-movement-portals-39 and -40. Its uninstall path is already covered: `aoe.mjs:39` (snapshot :36) calls `disableEscape()`, and only the keybinding entry stays registered, because Foundry has no unregister.
- `aoe.css` (64 lines): reviewed. Every rule is scoped under `.pentaryn-aoe-tray` with `.pa-*` children, or targets `effect-application.pentaryn-aoe-unapplied` / `.chat-card .pentaryn-aoe-applied`. It follows the §2.1 prefix table. Nothing found.

## Files added by the usability re-run (re-anchor, 28ccc87)

- `refund.mjs` (67 lines, Part F, U-5-12): reviewed. Its synchronous, unguarded `dnd5e.postUseActivity` listener is deliberate (a literal `false` must reach `Hooks.call`) and has its own try/catch; it registers **after** resolve's guarded Careful listener on the same hook, so the Careful arm runs first. Findings: two swallowed rejections (folded into -9), and its registration style belongs in -12's recipe. A fifth copy of the `t()` wrapper (refund.mjs:22).
- `aim.mjs` (87 lines, Part G, U-6-5): the hand-made prototype wrap is aoe-movement-portals-44; the style note is in -12.
- `aoe.css` +5 lines: `.pentaryn-aoe-tray .pa-careful` is scoped; `.chat-message .pa-status` and `.chat-message .pa-status i` (aoe.css:68–69) style the line on the caster's own card, outside the tray. Today they fail scorer rule C37; they pass once Wave 7 declares `cssPrefix: "pa-"` (the rule accepts `.pa-` anywhere in the selector). No finding: the class is prefixed, and it is the manifest that is missing.
