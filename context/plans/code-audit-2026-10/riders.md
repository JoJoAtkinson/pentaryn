---
title: "Code audit 2026-10 — pentaryn-riders"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-riders

**Read this when:** you are about to refactor, harden or document pentaryn-riders and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Re-anchored to `28ccc87` on 2026-10-11.** Every **Where**/**Anchor** below now points at HEAD `28ccc87` (the working tree equals HEAD for this module; riders has not changed since the usability re-run commit `17275c9`). Snapshot line numbers are kept in brackets. The re-run (ledger U-5-11, U-5-15, U-5-16, U-5-17, U-6-4, U-6-6 to U-6-11, U-6-14 in [`../usability-changes-2026-10.md`](../usability-changes-2026-10.md)) added:
> - **`cast-flow.mjs` (new, 301 lines)**, a fourth side-effect import (riders.mjs:50): summon sidebar keep (:56-82), restore-slot default (:84-104), settings `castDefaults` + `arcaneRecovery` (:106-121), Place Summons default with a hand wrap of `SummonActivity#_prepareUsageConfig` (:123-158), usage-dialog first click (:160-189), wildcard summon preview with a hand wrap of `SummonActivity#getPlacement` (:191-214), and the Arcane Recovery picker dialog (:216-301).
> - **`argon-tidy.mjs`** parts 3–4 (:59-113): a `targets` accessor and a `getTooltipData` wrap on Argon dnd5e's closure-private item-button prototype, and a global `TextEditor.implementation.enrichHTML` wrap; the area collapse now also fires on `dnd5e.preSummon` (:51-57).
> - **`concentration.mjs`** part 3 (:105-161): setting `concentrationAutoBreak`, a `createChatMessage` auto-break and a DC/result line on concentration save cards.
> - **`rituals.mjs`** part 3: setting `longCasts` and a "Longer casts" group inside `addRituals` (:85-115).
> - Pure helpers in **`table-core.mjs`** (63 → 199 lines) and **`rituals-core.mjs`** (62 → 92), fixture-tested.
>
> riders.mjs itself only gained the cast-flow import (+3 lines after :47); everything below it shifted by +3.

| Id | Re-anchor status (HEAD `28ccc87`) |
|---|---|
| combat-riders-23 | re-anchored — concentration.mjs:74-87 (snapshot :58-71); still open |
| combat-riders-25 | re-anchored — riders.mjs:625-665 (snapshot :622-662); still open and **extended**: 8 settings in 4 files, a fourth side-effect import, a fourth read idiom |
| combat-riders-26 | re-anchored — riders.mjs:313-380 (snapshot :310-377); still open and **extended**: two copies of the slot-table builder in cast-flow.mjs, and the concentration card line recomputes `concentrationResult` |
| combat-riders-27 | re-anchored — riders.mjs:640-649 (snapshot :637-646); still open |
| combat-riders-32 | re-anchored — riders.mjs:654-665 (snapshot :651-662); still open and **extended**: `settings()` must list 8 keys; `arcaneRecoveryDialog` is exported but not on the API |
| combat-riders-16 | re-anchored — adjustments.yml:145-154 (unchanged position); riders half still open (none of its five rows exists; the re-run added ten other riders rows at adjustments.yml:719-861) and **extended**: concentration.mjs now reads dnd5e 6 save-message shapes |
| combat-riders-39 | **new** — five hand-installed patches in cast-flow.mjs and argon-tidy.mjs, none in a patch record (conformance C32 sees none of them) |
| combat-riders-40 | **new** — three comment-only catches in the re-run code (conformance C24 now fails) |
| combat-riders-41 | **new** (2026-10-11, wave-1 J8) — the Battle Medic relay writes once per GM tab: two tabs on the GM account heal twice and spend two Hit Dice |

Resolved by the re-run: none. Obsolete: none.

**Status (wave 4, 2026-10-11, branch `migrate/wave-4`, code phase; live checks pending):**

| Id | Status |
|---|---|
| combat-riders-23 | fixed `[declared, edge]` `6516b872` (isConcentration early return) |
| combat-riders-25 | fixed: one MODULE `111ac454`, settings table `d70ed29b`, entry split `b81fa95d` |
| combat-riders-26 | fixed `d6dbb324` (core/hit-dice.mjs, slotsFrom, concentrationResult reuse) |
| combat-riders-27 | fixed `[declared, console only]` `50d4f655` |
| combat-riders-32 | fixed `3dacbbe1` (inspect, settings(), describe(), arcaneRecovery) |
| combat-riders-39 | fixed `b81fa95d` (patches.mjs, wrapMethod; rows renamed per D2 — adjustments.yml edits with the integrator) |
| combat-riders-40 | fixed `0f1c1822` |
| combat-riders-41 | fixed `[declared]` `c8ce8381` (claim first on the patient) |
| combat-riders-16 (riders half) | rows and files moves written up for the integrator (adjustments.yml is shared) |
| combat-riders-12 / -13 / -17 / -31 (riders halves) | -12 `[declared]` `32a0a8e6`; -13 `3dacbbe1`; -17 README table `d42a1164` (combat README / melee.md mirror with the integrator); -31 `b81fa95d` + `d42a1164` |

Id note: the new findings are -39 and -40 because combat.md already uses combat-riders-36, -37 and -38 (the shared numbering continues across both files).

## Summary

### pentaryn-riders

**Purpose.**

Automates feature riders that dnd5e leaves to the player:
- Elemental Adept min2 plus resistance-ignore preset in the damage tray.
- Elemental Affinity +CHA, once per casting.
- Potent Spellcasting +WIS on cantrips.
- Healer r1 on spell healing, and a Battle Medic activity with a GM relay query.
- Hit Dice -/+ on the character sheet.

Has also absorbed unrelated table fixes:
- Ritual Adept 'Rituals (no slot)' group on Argon plus slot unticked by default.
- Concentration summons removed when concentration ends, plus the Break Concentration label.
- Argon tidy-ups: shared-uses badges, panel collapse on area placement, tooltip click-through CSS.

**Health.**

Organisation:
- Three pure cores (riders-core 540, rituals-core 92, table-core 199 at `28ccc87`; snapshot 540/62/63) are well tested. The RULES table is data-driven and the README has an 'Adding a rider' section.
- riders.mjs (665 lines at `28ccc87`, 662 in the snapshot) holds 6 concerns: roll riders, tray preset, Hit Dice, Battle Medic and its query, the sheet -/+, and the console API/publish.
- Its pure kernels (hdPools, battleMedicBlock, the featuresOf type resolution) are not extracted or tested.
- Settings are registered in three files with three read idioms. MOD is declared in three places. *(`28ccc87`: eight settings in four files — cast-flow.mjs adds a fourth idiom, `on(key)`; see combat-riders-25.)*
- The module name no longer describes argon-tidy or concentration. *(`28ccc87`: nor cast-flow — summons, usage dialogs, Arcane Recovery.)*

Performance:
- The concentration cleanup scans every scene's tokens on every Actor effect deletion.
- The once-per-casting guard scans the whole chat log on each damage roll.

adjustments.yml has no rows for the damage-tray getTargetOptions, postDamageRollConfiguration term editing, the Hit Dice sheet DOM, or the battleMedic query. The routing doc folds the module into a 'Table-feedback' row.

**LLM interface.**

Today:
- An LLM uses eval-js with game.pentaryn.riders.report(actor?), featuresOf(actor), which returns live Item documents, and setType/installBattleMedic/battleMedic(healer, Token).
- No name or uuid resolution. Passing an Actor to battleMedic gives a misleading 'no Hit Dice' warning.
- No settings listing: the log shows a guessed key `ritualAdept` instead of `rituals`.
- No describe().
- No read for the concentration summons a given effect keeps.

Should be:
- riders.inspect(ref) returning plain rows: features, types and status, Battle Medic state, Hit Dice summary, settings.
- describe() and settings().
- resolveActor at the boundary, with the same helper shape as combat.

**How to extend.**

Where a new feature goes today:
- A new damage or healing rider is a RULES row in riders-core.mjs plus a fixture. This is documented and works well.
- Anything else (another Argon tidy-up, another dnd5e fix) has been added as a new side-effect import in riders.mjs, with settings registered in that file. The re-run did it again: `cast-flow.mjs` (riders.mjs:50), with two settings and two prototype wraps of its own.

What is unclear:
- Whether a new 'table fix' belongs here or in combat/turnflow (both do Argon patches and dnd5e chat-card tweaks).
- How to register a setting consistently.
- That combat has its own, separate 'riders' concept with its own TURN_RIDERS table and different identity matching.

There is no decision table telling a builder which module owns which kind of rider or Argon fix.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| combat-riders-23 | Performance gains | low | S | Concentration cleanup: skip non-concentration effects before scanning every scene's tokens |
| combat-riders-25 | Maintainability gains | medium | M | pentaryn-riders: settings table, one MOD, and split the 662-line entry by concern |
| combat-riders-26 | Maintainability gains | medium | S | Extract the untested pure kernels of riders.mjs (Hit Dice pools, Battle Medic gate, report rows) into riders-core |
| combat-riders-27 | Logging / auditability gains | low | S | Audit line for the Battle Medic GM relay and for refused queries |
| combat-riders-32 | LLM interface | medium | S | riders.inspect(ref) returning plain rows; describe()/settings(); reuse report's row builder |
| combat-riders-16 | Documentation / skills | medium | S | adjustments.yml gaps: combat's chat-message-type reads; riders' tray, roll-config, sheet DOM and query rows |
| combat-riders-39 | Hardening | medium | S | Route the re-run's five hand patches (SummonActivity ×2, Argon item button ×2, TextEditor.enrichHTML) through wrapMethod/defineAccessor with a patch record |
| combat-riders-40 | Logging / auditability gains | low | S | Three comment-only catches in the re-run code: log them at debug |
| combat-riders-41 | Hardening | medium | S | Battle Medic relay runs in every GM tab: claim first so one tab heals and spends the Hit Die |

## Performance gains

### combat-riders-23 — Concentration cleanup: skip non-concentration effects before scanning every scene's tokens

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/concentration.mjs:74–87` (snapshot :58–71)

**Anchor:** `Hooks.on("deleteActiveEffect", (effect, options, userId) => {`

**Current.**

For every ActiveEffect deleted on any Actor, the active GM loops `for (const scene of game.scenes)` (concentration.mjs:80) and runs summonTokenIds over scene.tokens: O(scenes x tokens) per deletion. Combat deletes effects constantly (Dodge/Dash/Disengage sweeps, Reckless off, Steady Aim end). table-core.mjs concentrationEffectFor only ever treats effects carrying the concentrating status as concentration.

**Proposed.**

Add pure isConcentration(effect, status) to table-core.mjs (same Set-or-array handling as concentrationEffectFor). In the hook, after the enabled/parent checks: `const status = CONFIG.specialStatusEffects?.CONCENTRATING ?? 'concentrating'; if (!isConcentration(effect, status)) return;`. Note in the README that an effect whose status was stripped before deletion no longer triggers cleanup.

**Behaviour test recipe (write first, must pass before and after).**

Add to test/table.mjs: isConcentration({statuses:new Set(['concentrating'])},'concentrating') true; {statuses:['dodging']} false; {} false. Equivalence: tokens [{id:'t1',flags:{'pentaryn-riders':{concentration:'Actor.a.ActiveEffect.c1'}}},{id:'t2'}]: summonTokenIds(tokens,'Actor.a.ActiveEffect.dodge') -> [] and (tokens,'Actor.a.ActiveEffect.c1') -> ['t1'] (confirm the stamp flag path in summonTokenIds first). Existing table fixtures still pass.

**Risk.** A concentration effect whose concentrating status was removed by an update before deletion would no longer clean its summons; dnd5e does not do that.

**Re-anchor note (`28ccc87`).** Unchanged by the re-run. The new auto-break (concentration.mjs:132-142, U-6-6) ends concentration through `actor.endConcentration()`, which deletes the concentration effect and so runs this hook too — the early return is unaffected (that effect carries the status). `isConcentration` goes next to the new `concentrationResult` in table-core.mjs (:142-147).

**Related:** combat-riders-25

## Maintainability gains

### combat-riders-25 — pentaryn-riders: settings table, one MOD, and split the 662-line entry by concern

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-riders/riders.mjs:625–665` (snapshot :622–662); also `cast-flow.mjs:106–121`, `concentration.mjs:42–57, 107–109`, `rituals.mjs:36–68`

**Anchor:** `Hooks.once("init", () => {`

**Current.**

Settings are registered in three files with three read idioms: riders.mjs:622-633 (enabled, hdControls; read raw with game.settings.get, throws if unregistered), rituals.mjs and concentration.mjs (rituals, concentrationSummons; local try/catch->false enabled(), e.g. concentration.mjs:31-33). MOD is declared in riders-core.mjs:24, table-core.mjs:6 and as a literal in rituals.mjs. riders.mjs holds roll riders, card note, tray preset, Hit Dice, Battle Medic + query, sheet -/+, console API and publish.

**Current at `28ccc87` (extension).** Now **eight** settings in **four** files, with four read idioms:

| File | Settings (registration line) | Read |
|---|---|---|
| rituals.mjs | `rituals` (:58), `longCasts` (:63) | `enabled()` :40-42, `longEnabled()` :44-46 — try/catch → false |
| concentration.mjs | `concentrationSummons` (:47), `concentrationAutoBreak` (:52) | `enabled()` :42-44, `autoBreakOn()` :107-109 — try/catch → false |
| cast-flow.mjs | `castDefaults` (:109), `arcaneRecovery` (:114) | `on(key)` :121 — try/catch → false (a fourth idiom) |
| riders.mjs | `enabled` (:626), `hdControls` (:631) | raw `game.settings.get` :148, :295, :434, :442, :499 — throws |

MOD: riders-core.mjs:24, table-core.mjs:6, the literal at rituals.mjs:36, and `const MOD = core.MOD` at riders.mjs:52 (cast-flow, argon-tidy and concentration import table-core's). riders.mjs now side-effect-imports four files (:43, :45, :48, :50). cast-flow.mjs (301 lines) mixes six concerns of its own (summon sidebar, restore-slot default, cast defaults + Place Summons patch, usage-dialog first click, wildcard preview patch, Arcane Recovery dialog).

**Proposed.**

1. riders/settings.mjs: DEFAULTS table, registerSettings(), setting(key) returning the per-key onError value where present (rituals/longCasts/concentrationSummons/concentrationAutoBreak/castDefaults/arcaneRecovery false) and rethrowing otherwise (enabled/hdControls), preserving today's semantics. 2. table-core.mjs: `export { MOD } from './riders-core.mjs'`; rituals.mjs imports MOD. 3. Split riders.mjs into damage-riders.mjs, card-note.mjs, tray-preset.mjs, hit-dice.mjs, battle-medic.mjs, api.mjs; riders.mjs imports in today's order (rituals, concentration, argon-tidy, cast-flow first). cast-flow.mjs keeps its six parts as one feature (≤ 500 lines); its two prototype wraps leave for patches.mjs (combat-riders-39) and its two slot-table builders become one (combat-riders-26). 4. Update adjustments.yml rows listing riders.mjs. Do after the live-test workflow is idle.

**Behaviour test recipe (write first, must pass before and after).**

Add to test/table.mjs: check('MOD shared', tableCore.MOD, ridersCore.MOD). New test/settings.mjs with a game.settings stub (register records keys in order; get throws for unregistered): first record today's real registration order by importing riders.mjs under a Hooks stub and firing init (imports of rituals/concentration/cast-flow register their init hooks before riders.mjs's own, so the expected order at `28ccc87` is rituals, longCasts, concentrationSummons, concentrationAutoBreak, castDefaults, arcaneRecovery, enabled, hdControls; verify by running) and pin it. Before register: setting('rituals'), setting('longCasts'), setting('concentrationAutoBreak'), setting('castDefaults'), setting('arcaneRecovery') -> false, setting('enabled') throws. A hook-manifest test for riders records the same ordered hook list before and after the split.

**Risk.** Settings registration order is visible in Configure Settings; the pinned order test keeps it.

**Related:** combat-riders-26, combat-riders-23

### combat-riders-26 — Extract the untested pure kernels of riders.mjs (Hit Dice pools, Battle Medic gate, report rows) into riders-core

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/riders.mjs:313–380` (snapshot :310–377); also `cast-flow.mjs:92–96, 220–227`, `concentration.mjs:149–154`

**Anchor:** `function hdPools(actor) {`

**Current.**

Pure logic lives inside Foundry glue with no fixtures: hdPools (313-326: NPC vs class pools, 'd8'->8), hdSummary (328-331), battleMedicBlock (373-380: refusal reasons), isBattleMedic's name rule (361-365), featuresOf's per-item type merge (~82-102), applyRiders' rollInfo derivation (157-161), report's row status strings (587-619) which an LLM reads. (Snapshot lines were 3 lower throughout.)

*Extension at `28ccc87`:* the re-run put its own pure logic in table-core.mjs with fixtures (good), but left two glue copies:
- cast-flow.mjs builds the actor's slot table twice, differently: the restore-slot default (:92-96) walks `actor.system.spells` by `spell[1-9]` key and keys by `s.level`; the Arcane Recovery dialog's `slotTable` (:220-227) loops level 1-9 and coerces `Number(...) || 0`.
- concentration.mjs's card line (:149-154) recomputes "known DC" and "failed" inline instead of using `concentrationResult` (table-core.mjs:142-147), which already returns `{dc, failed}`.

**Proposed.**

Add to riders-core.mjs: hdPoolsFrom({isNPC, hd, classes}), hdSummaryOf(pools), battleMedicBlockReason({hasTargetActor, hasHd, canSpend, ownsTarget, gmOnline}) returning null or a key, and reportRow(...). riders.mjs maps Documents to these inputs and localises. Copy literals exactly. Extension: one `slotsFrom(spells)` in table-core.mjs (`{[level]: {value, max}}` for spell1–spell9, numbers coerced) used by both cast-flow call sites; the concentration card line reads `{dc, failed}` from `concentrationResult`.

**Behaviour test recipe (write first, must pass before and after).**

Add to riders test/run.mjs, after reading the current functions to derive the exact inputs and recording outputs by running them through a thin stub first: NPC {isNPC:true, hd:{denomination:'d8',value:3,spent:1}} -> one pool faces 8; two-class PC -> two pools and summary; denomination 'x' -> faces 0; block reasons for no target, no hd, all spent, not owner with no GM, owner (null). reportRow for a typed rule with no types pins the current status string (the literal beginning 'NO TYPE'). Same assertions run against the extracted functions after the change. Extension, in test/table.mjs: slotsFrom({spell1:{level:1,value:1,max:4}, spell3:{level:3,value:'0',max:'2'}, pact:{level:3,value:0,max:1}}) -> {1:{value:1,max:4}, 3:{value:0,max:2}} (pact ignored), and assert restoreSlotScaling / arcaneRecoveryDefault give the same answers fed from it as from today's two builders. Concentration line: for (total 8, dc 10), (12, 10), (10, 10), (8, null) the old inline (failed, key) pair equals concentrationResult's `failed` mapped to failed/failedEnded/success — pin before the change.

**Risk.** String literals must be copied exactly; fixtures pin them.

**Related:** combat-riders-25, combat-riders-32

## Hardening

### combat-riders-39 — Route the re-run's five hand patches (SummonActivity ×2, Argon item button ×2, TextEditor.enrichHTML) through wrapMethod/defineAccessor with a patch record

*Added 2026-10-11 at the re-anchor to `28ccc87`; the code is from the usability re-run (`17275c9`: U-5-11, U-5-15, U-6-7, U-6-14).*

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/cast-flow.mjs:137–158` (also `cast-flow.mjs:193–214`, `argon-tidy.mjs:63–80`, `argon-tidy.mjs:83–113`)

**Anchor:** `    proto._prepareUsageConfig = function _prepareUsageConfig(config = {}) {`

**Current.**

The snapshot had one hand patch (the Rituals `_renderInner` wrap, rituals.mjs:117-126, already planned for `wrapMethod` in the migration guide S5). The re-run added five more, each with its own ad-hoc marker and install path:

| # | Target | Where | Marker | Adjustments row |
|---|---|---|---|---|
| 1 | `CONFIG.DND5E.activityTypes.summon.documentClass.prototype._prepareUsageConfig` (assignment, at `ready`) | cast-flow.mjs:137-158 | `proto._prPlaceDefault` | dnd5e-summon-place-default |
| 2 | the same prototype's `getPlacement` (assignment, at `ready`) | cast-flow.mjs:193-214 | `proto._prWildcard` | dnd5e-summon-wildcard-preview |
| 3 | Argon dnd5e's closure-private item-button prototype: the `targets` getter replaced with `Object.defineProperty` (lazily, from the first `renderItemButtonArgonComponent`) | argon-tidy.mjs:83-95, 107-113 | `proto._prTidy` | argon-metamagic-no-picker |
| 4 | the same prototype's `getTooltipData` (assignment) | argon-tidy.mjs:96-104 | `proto._prTidy` (shared with 3) | argon-tooltip-item-rolldata |
| 5 | `foundry.applications.ux.TextEditor.implementation.enrichHTML`, a **world-global static**, replaced for every caller (at `ready`) | argon-tidy.mjs:63-80 | `wrapped._prItemRollData` | argon-tooltip-item-rolldata |

None is listed anywhere a reader (or `describe()`) can enumerate, and none has an uninstall. Conformance C32 does not see any of them: its detector reports only `rituals.mjs:122`, because these assign through a local `proto`/`TE` variable rather than `X.prototype.y =`. Two smaller hazards come with the shapes:
- #3 and #4 share one marker, so a future partial revert of one silently disables the other.
- #3 is installed on the prototype of whichever item button renders first. When that is a subclass (pentaryn-combat's own buttons subclass Argon's, as the comment at argon-tidy.mjs:109-110 notes), the base class is wrapped later by a second call. That works today only because `_prTidy` is read through the prototype chain.

**Proposed.**

Move all five into `patches.mjs` beside the Rituals wrap (migration guide S5). Each becomes a `wrapMethod(MODULE, { target, name, label, marker, adjustments }, fn)` (#1, #2, #4, #5) or a `defineAccessor(...)` (#3), with the body copied verbatim and the adjustments row id named.
- Keep the marker **strings** `_prPlaceDefault`, `_prWildcard` and `_prItemRollData` in patches.mjs, because they are the adjustments rows' markers. Move the rows' `files` in the same change (guide S8).
- #1, #2 and #5 install at `ready`, as today.
- #3 and #4 stay lazy (the class is reachable only through a rendered instance), but they call the idempotent `wrapMethod` per prototype instead of sharing the `_prTidy` flag.

`describe().patches` then lists six records. Behaviour is unchanged.

**Behaviour test recipe (write first, must pass before and after).**

Write test/patches.test.mjs (or add to glue.test) under `installFoundry()` stubs:
- **Place Summons default.** A SummonActivity stub whose `_prepareUsageConfig(config)` returns `{create: {summons: undefined}}`, with `this.canSummon = true`, `this.availableProfiles = [{}]`, `canvas.scene = {}` and setting `castDefaults` true.
  - Fire `ready` twice: each method is wrapped once, and the second fire is a no-op.
  - `_prepareUsageConfig({})` gives `create.summons === true`.
  - `({create: false})` and `({create: {summons: false}})` leave it unchanged. With `castDefaults` false it is unchanged.
- **Wildcard preview.** The same stub's `getPlacement(token)` records `token.texture.src`. Call `getPlacement({texture: {src: "t/skeleton-*.webp"}, parent: actor, clone(d){…}})`:
  - With `game.user.can("FILES_BROWSE") === true` and `actor.getTokenImages() → ["t/skeleton-*.webp", "t/skeleton-2.webp"]`, the original receives `t/skeleton-2.webp`.
  - With FILES_BROWSE false, it receives `actor.img`.
  - A plain path passes through unchanged.
- **Argon button.** A base button class with `get targets() { return 5 }` and an `async getTooltipData()` that calls `TextEditor.implementation.enrichHTML("x", {relativeTo: this.item})`, plus a subclass. Render the subclass first, then the base, through `Hooks.call("renderItemButtonArgonComponent", btn)`:
  - For `item.system.identifier = "careful-spell"`, both report `targets === null`. For `"fire-bolt"`, both report 5.
  - Inside `getTooltipData`, enrichHTML receives `rollData` equal to `item.getRollData()`. Outside it, it does not.
  - `getTooltipData` is wrapped once per prototype chain: one enrich call per tooltip.

Pin these before the move. After the move, also assert that `describe().patches.map(p => p.adjustments)` contains the four row ids above plus `riders-argon-ritual-adept-list`.

**Risk.** Install timing must stay at `ready` (#1, #2, #5) and at first render (#3, #4); the pins cover it. A `wrapMethod` on a static (`enrichHTML`) must keep `this` as `TE`; the test calls it through `TE.enrichHTML(...)`.

**Related:** combat-riders-8 (combat's wrapMethod), combat-riders-25, combat-riders-16

### combat-riders-41 — Battle Medic relay runs in every GM tab: claim first so one tab heals and spends the Hit Die

*Added 2026-10-11 from the wave-1 report's J8 (blueprint §5.9.5). Joe's decision: a new audit id, fixed (claim first) when riders migrates, as a `[declared]` commit after its structural refactor. Not changed now. Sibling: items-journal-40 (journal `ensure`).*

**Category:** Hardening · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/riders.mjs:640–649` (the handler); the caller is `runBattleMedic`, `riders.mjs:417`

**Anchor:** `  CONFIG.queries[QUERY] = async (data, { user } = {}) => {`

**Current.**

The server sends a query to every socket of the recipient user and keeps the first answer (blueprint §5.9.1, Queries). The handler's gate is `game.user.isGM && game.users.activeGM?.isSelf`, which is true in **every** tab of the active GM's account. With the MCP bridge tab and a GM browser tab both open (the normal state at Joe's table), a player's Battle Medic relay runs `applyBattleMedic` twice: `spendHitDie` takes two Hit Dice and `applyDamage(-amount)` heals twice. The player's toast shows the first tab's numbers only. Unverified live; the code path has no idempotency guard (no request id, no claim).

**Proposed.**

When riders migrates (its relay moves to the kit's `relayed` query through the API manifest, C56):
1. The healer's client adds a request id to the payload (`requestId: foundry.utils.randomID()`).
2. The handler claims that id first (`lib/election.mjs`, one tab wins per id) and only the winner calls `applyBattleMedic`. The winner records its result on the target in the same update batch as the heal (`flags.pentaryn-riders.relay.<requestId>`, pruned to the last few).
3. Per §5.9.2 the losing tab answers first, so it must not answer with nothing: it waits (bounded, under the 8 s query timeout) for the recorded result to arrive by broadcast and returns it.

The heal, the Hit Die spent and the return shape for a single tab are unchanged. This is a behaviour change with two tabs (one heal instead of two), so it lands as a `[declared]` commit.

**Behaviour test recipe (write first, must pass before and after).**

In the riders glue harness, register the handler in two fake GM "tabs" (two module loads sharing one fake actor store, both `activeGM.isSelf`). Fire one relay payload into both concurrently:
- Before the fix (pinned as `KNOWN combat-riders-41`): the target loses 2 Hit Dice and gains two heals.
- After the fix (the pin flips in the `[declared]` commit): the target loses 1 Hit Die and gains one heal, and both handlers resolve to the same `{ faces, healed, hp, … }`.

A single-tab relay's return value and thrown refusal messages are identical before and after.

**Risk.** Medium: a wrong claim key could drop a legitimate second heal. Key the claim on the request id, never on the target or the healer.

**Related:** combat-riders-27 (audit line on the relay), combat-riders-25, items-journal-40, transform-creatures-37 (the same two-GM-tab shape in pings)

## Logging / auditability gains

### combat-riders-27 — Audit line for the Battle Medic GM relay and for refused queries

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/riders.mjs:640–649` (snapshot :637–646)

**Anchor:** `  CONFIG.queries[QUERY] = async (data, { user } = {}) => {`

**Current.**

The GM-side query handler writes another player's HP and Hit Dice but logs nothing on success; refusals ('sender does not own the healer', 'healer has no Healer feat', 'unknown actor') are thrown back to the sender only. The healer client logs `Battle Medic write failed` (riders.mjs:420; snapshot ~:417) without uuids. Concentration cleanup, by contrast, logs console.info.

**Proposed.**

In the handler log on success: console.info(`${MOD} | battle medic relay: ${user?.name} healed ${target.name} ${result.healed}`, {healer: healer.uuid, target: target.uuid, amount: data?.amount}); before each throw log the same prefix with the reason; include uuids in runBattleMedic's catch warning. Thrown messages and return shape unchanged.

**Behaviour test recipe (write first, must pass before and after).**

test/battle-medic.mjs with stubs (game.user.isGM true, fromUuid resolving fake actors with testUserPermission, a fake target whose applyDamage changes hp). Record the current return value for {amount:99, faces:8, prof:2} and the thrown messages ('sender does not own the healer') as oracles before editing; with a fake console assert exactly one info line on success and one warn per refusal; returns and thrown messages identical before and after.

**Risk.** Logging only; messages and return pinned.

*Re-anchor note (`28ccc87`):* unchanged by the re-run. The re-run's own writes are audited on screen (Arcane Recovery posts a chat line, cast-flow.mjs:283-286; the auto-break marks the card `broken`, concentration.mjs:140) — nothing to add for them here.

**Related:** combat-riders-9, combat-riders-40

### combat-riders-40 — Three comment-only catches in the re-run code: log them at debug

*Added 2026-10-11 at the re-anchor to `28ccc87`; the code is from the usability re-run (`17275c9`: U-5-15, U-5-16, U-6-6).*

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/argon-tidy.mjs:73` (also `cast-flow.mjs:78`, `concentration.mjs:125`)

**Anchor:** `    } catch { /* enrich as asked */ }`

**Current.**

The snapshot's riders code had no comment-only catches, so C24 passed. The re-run added three that leave no trace when they fire, which is why conformance C24 now fails:
- argon-tidy.mjs:73 `catch { /* enrich as asked */ }` sits inside the **global** `enrichHTML` wrap. A throw from `item.getRollData()` silently drops the tooltip fix, and Scorching Ray reads "1 ray" again (U-5-15).
- cast-flow.mjs:78 `catch { /* leave it */ }` guards the sidebar restore after a summon import. A throw leaves the player on the Actors tab with no clue (U-5-16).
- concentration.mjs:125 `catch { /* old card */ }` guards the read of `system.canBreakConcentration`. A throw makes `canBreak` false, so a failed save **silently stops auto-breaking** (U-6-6).

Other catches return a value (`return false` or `images = []`), and C24 accepts them: cast-flow.mjs:121 and :205, concentration.mjs:43 and :108, rituals.mjs:41 and :45. They are the settings readers of combat-riders-25.

**Proposed.**

Each becomes `catch (err) { log.debug("<what was skipped>", err); }`, using the kit's debug-gated logger (silent by default, as combat-riders-9 proposes for combat). Until the kit logger is vendored (guide S1), use `console.debug(`${MOD} | …`, err)`. Control flow is unchanged: each still falls through to the same default.

**Behaviour test recipe (write first, must pass before and after).**

Use a fake console:
1. A TE stub, and an item whose `getRollData` throws, inside a wrapped `getTooltipData`. `enrichHTML` still returns the original's output with the caller's options (no `rollData`), and nothing is thrown.
2. `ui.sidebar.changeTab` throws after a `dnd5e.preSummon` and a `changeSidebarTab("actors")`. No throw escapes the timer.
3. A concentration save message whose `system` getter throws on `canBreakConcentration`. `resultOf` returns `autoBreak: false`, and `endConcentration` is not called.

Before the change, each case prints zero console lines. After it, each prints exactly one `debug` line and zero `warn` lines. Return values are identical.

**Risk.** Logging only.

**Related:** combat-riders-9, combat-riders-27

## LLM interface

### combat-riders-32 — riders.inspect(ref) returning plain rows; describe()/settings(); reuse report's row builder

**Category:** LLM interface · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-riders/riders.mjs:654–665` (snapshot :651–662)

**Anchor:** `Hooks.once("ready", () => setTimeout(() => {`

**Current.**

api.featuresOf(actor) returns live Item documents (heavy through eval-js). report() (587-619) builds the plain row an LLM needs but prints console.table and has no uuid support. There is no way to read the settings without knowing their keys — **eight** at `28ccc87` (rituals, longCasts, concentrationSummons, concentrationAutoBreak, castDefaults, arcaneRecovery, enabled, hdControls; four in the snapshot) — and no read of which tokens a concentration effect keeps. The re-run's `export { arcaneRecoveryDialog }` (cast-flow.mjs:301) is reachable by nothing: no API member, and an eval-js caller cannot import it.

**Proposed.**

1. Refactor report into rowsFor(actor) (existing loop body, reportRow from combat-riders-26) and report(ref) = console.table(rows) with identical output. 2. Add inspect(ref) -> {actor:{name,uuid}, rows, hd, settings, concentrationSummons: [{scene, token, effect}]}. 3. Add describe() and settings() mirroring combat-riders-13; settings() returns all eight keys with value and scope. 4. Additive: `arcaneRecovery(ref)` on the API, calling `arcaneRecoveryDialog(actor)` (owner client only; returns the chosen `{level: n}` or null), so an LLM or macro can open the picker without spending a use.

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs (riders) with stubs and a fake actor holding 'Elemental Adept (Fire)' feat, an 'Elemental Affinity' feat with no type and a 'Healer' feat without a Battle Medic activity. Characterise report(actor) rows before the refactor by running it and pasting the actual rows as the oracle (includes the NO TYPE and battleMedic status strings). Identical after. inspect(actor).rows deepEquals report rows; JSON round-trip equality. settings() keys equal the registration-order list pinned by combat-riders-25. `arcaneRecovery` with a stub DialogV2.wait returning {2:1} on a wizard 4 with spell2 {value:0,max:2} calls actor.update with `system.spells.spell2.value: 1` — the same write the hook path makes.

**Risk.** Report output is pinned; the rest is additive.

**Related:** combat-riders-12, combat-riders-13, combat-riders-26

## Documentation / skills

### combat-riders-16 — adjustments.yml gaps: combat's chat-message-type reads; riders' tray, roll-config, sheet DOM and query rows

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **WAIT** (file in flux at snapshot: re-anchor against the live tree first)

**Where:** `foundry/adjustments.yml:145–154` (row unchanged at `28ccc87`)

**Anchor:** `  - id: dnd5e-chat-message-types`

**Current.**

Row dnd5e-chat-message-types lists modules [pentaryn-aoe, pentaryn-senses, pentaryn-riders] but pentaryn-combat reads the same dnd5e 6 message shapes (combat riders.mjs getAssociatedActivity/system.activity/system.targets/_source.system.origin; turnflow.mjs message.type 'usage', system.origin, system.deltas). pentaryn-riders has no rows for damage-application getTargetOptions/targetList, dnd5e.postDamageRollConfiguration term editing, dnd5e.preCalculateDamage options mutation, the character sheet `.meter.hit-dice` DOM injection, or the CONFIG.queries `pentaryn-riders.battleMedic` relay. Combat's turn-flag write through ForcedReplacement (shapes.mjs ~216-220) has no row either.

*Extension at `28ccc87`:* the re-run added ten riders rows (adjustments.yml:719-861: argon-metamagic-no-picker, argon-tooltip-item-rolldata, dnd5e-summon-keeps-sidebar, dnd5e-restore-slot-default, dnd5e-summon-place-default, dnd5e-usage-dialog-first-click, dnd5e-summon-wildcard-preview, riders-arcane-recovery-picker, riders-argon-long-casts, dnd5e-concentration-auto-break) but none of the five above. And concentration.mjs part 3 now reads dnd5e 6 save-message shapes (`m.type === "save"`, `system.type === "concentration"`, `system.canBreakConcentration`, `system.canResist`, `system.outcome`, `rolls[0].options.target`; concentration.mjs:111, 125, 140, 149-153) and writes `system.outcome = "broken"` — `dnd5e-chat-message-types` still lists only riders.mjs for this module.

**Proposed.**

Add pentaryn-combat to the dnd5e-chat-message-types `modules`, add combat riders.mjs and turnflow.mjs to `files` and make foundry-combat-check to `check`. New rows: riders-dnd5e-damage-tray-preset (markers getTargetOptions, dnd5e.preCalculateDamage), riders-dnd5e-roll-term-riders (postDamageRollConfiguration, resetFormula), riders-dnd5e-sheet-hit-dice (meter.hit-dice, renderCharacterActorSheet), riders-core-query-battle-medic (CONFIG.queries), combat-core-flag-forced-replacement (ForcedReplacement, ==turn). Pick retire_class values by copying neighbouring rows' vocabulary. Extension: add `foundry/module/pentaryn-riders/concentration.mjs` to `dnd5e-chat-message-types.files` (the row's markers are matched across its files, so no new marker is needed; confirm by running the check).

**Behaviour test recipe (write first, must pass before and after).**

Run make foundry-adjustments-check: each new row's files exist and its markers are found in those files (grep each marker first in the snapshot to prevent a failing row). Negative check in a scratch copy: misspell one marker and confirm the check fails. Python: add an assertion in scripts/tests/test_module_checks.py that every pentaryn module whose JS references `message.system` or `dnd5e.renderChatMessage` appears in dnd5e-chat-message-types.modules.

**Risk.** Registry only, no runtime effect.

**Related:** combat-riders-15, combat-riders-17

## Categories checked with no finding

- **Defragmentation:** checked `riders.mjs`, `riders-core.mjs`, `table-core.mjs`, `rituals.mjs`/`rituals-core.mjs`, `concentration.mjs` and `argon-tidy.mjs`. The in-module duplication (three `MOD` constants) is combat-riders-25 (Maintainability). The cross-module overlaps are filed under combat: the combat/riders.mjs naming (combat-riders-17), Argon injection order and tooltip helpers (combat-riders-18), and `normalizeName`/`featuresOf` (§1.3, pin rather than merge). Nothing riders-only.
- **Hardening:** checked:
  - The Battle Medic relay (`riders.mjs:640–648`; snapshot :637–645): active-GM check, the sender must own the healer, the Healer feat is required, and the amount is clamped.
  - Concentration cleanup (`concentration.mjs:74–87`; snapshot :55–68): the active GM acts (or the deleting user when no GM is active), `canUserModify("delete")` is checked per token, and the delete has a `.catch`.
  - The Rituals prototype wrap (`rituals.mjs:117–126`; snapshot :86–95): a presence probe, a `WRAPPED` marker and a try/catch per call.
  - argon-tidy's two hooks: try/catch, and optional chaining on `ui.ARGON`.
  - *Re-run code at `28ccc87`:* the Arcane Recovery write (cast-flow.mjs:272-282) re-checks the choice with `arcaneRecoveryCheck` after the dialog and runs only on the owning client; the auto-break (concentration.mjs:132-142) runs only on the roller's client and only for an owner; the summon sidebar keep has a 60 s expiry (cast-flow.mjs:63, 73). The five hand patches are combat-riders-39.

  dnd5e 6.0.6 still fires `dnd5e.preCreateMeasuredTemplate` (installed `dnd5e.mjs:16344`, `TemplatePlacement.fromActivity`), so argon-tidy's area-placement collapse is live (now argon-tidy.mjs:51-57, which also covers `dnd5e.preSummon`). Nothing found; the unregistered internals are combat-riders-16 (Docs).
- **Extendability:** a new damage rider is a `RULES` row in `riders-core.mjs`, and the README's "Adding a rider" section (README:109; snapshot :104) documents the row shape. The "Which riders module?" table and the side-effect entry points are combat-riders-17 and -31 (filed under combat). Nothing found. *(At `28ccc87`, -31's riders side covers four side-effect imports: rituals, concentration, argon-tidy and cast-flow.)*
- **Files named only in passing before:** `rituals-core.mjs` (62 lines in the snapshot, 92 at `28ccc87` with `longCasts`) is pure and fixture-tested by `test/rituals.mjs`, which `test/run.mjs:256` runs; nothing found. `riders.css` (56 lines in the snapshot, 69 at `28ccc87`: `.pr-conc-result` and `.pr-ar-total` added, both `.pr-*`) is scoped under `.pr-*` / `.pentaryn-riders-note`. Its `#tooltip .ech-tooltip` rule (lines 49–56 with its comment, unchanged) deliberately styles Argon's live tooltip and is registered as adjustments row `argon-tooltip-click-through`; nothing found.
