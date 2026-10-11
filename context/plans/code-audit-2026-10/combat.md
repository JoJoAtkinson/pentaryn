---
title: "Code audit 2026-10 — pentaryn-combat"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-combat

> **Re-anchored to 28ccc87 on 2026-10-11.** Every finding's Where, Anchor and Current now cite HEAD 28ccc87 (the usability re-run commits 17275c9 and 4f9224f changed every file of this module except shapes.mjs and offhand.mjs). Each finding carries a **Status (28ccc87)** line; additions to Proposed and the test recipe are marked *Re-anchor addendum*. Resolved or obsolete: none (the re-run fixed no audited item, though it changed -31's import and documented part of -15). Three new findings, combat-riders-36…-38, are in the last section. Measured at 28ccc87: 30 world settings (26 at the snapshot; the summary below said 27), 81 combat-core exports (68), 320 core fixtures (283), 7 custom events (5), 27 empty catches (19). Conformance is unchanged at 45.2 % (19/42).

**Read this when:** you are about to refactor, harden or document pentaryn-combat and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to HEAD 28ccc87 (re-anchored 2026-10-11; they referred to the frozen audit snapshot before); re-locate each change by its **anchor** if the live file has drifted again. Write the characterisation test first, run it green, refactor, re-run.

> **WAIT module.** This module's files were uncommitted/in flux when the snapshot was taken (another workflow is live-testing it). Every change here runs in Wave 8, only after that workflow is idle on this module, and only after re-anchoring every line. At 28ccc87 the files are committed, but pentaryn-combat is still listed in `scripts/foundry/blueprint/wait.json`: re-anchor again if HEAD has moved on this module.

## Summary

### pentaryn-combat

**Purpose.**

Melee and turn flow on the Argon Combat HUD. Full Attack runs multi-swing sequences with a swing strip, pause bar and roll-window docking. Swing pips count swings. Bonus/Special follow-ups (Off-hand, Nick, Flurry, Martial Arts, Hew, Pole Strike). Once-per-turn riders (Sneak Attack, Frenzy, Colossus Slayer, Divine Strike) are offered on attack cards, with an Auto mode. Also a Reckless toggle, TWF/GWM damage, off-hand fixes and the weapon-set seed. Turn flow (turnflow.mjs) covers Argon's Dash/Dodge/Disengage/Hide/Shove, Opportunity Attack, Esc on roll dialogs, cancelled-card cleanup, death saves at 0 HP, portrait conditions, HUD follow, Steady Aim and self effects, drawer placement, and core canvas/chat guards. There are 30 world settings at 28ccc87 (26 at the snapshot), each default on. The re-run added spell pips, Quickened Spell, helper-token control, Enter-to-use in usage windows, end-of-combat flag cleanup and Argon movement/tooltip/drawer fixes.

**Health.**

Organisation:
- The core/glue split is good. combat-core.mjs is pure and has 283 fixtures.
- The glue is large and untested: hud.mjs 970 lines (884 at the snapshot), turnflow.mjs 841 (607), sequence 437 (379), riders 501 (461), shapes 292.
- combat-core.mjs (1240 lines; 1025 at the snapshot) is organised by usability-run area ('Area 2 fixer pass 2') rather than by domain.
- turnflow.mjs mixes combat rules with general table UX and core-bug guards, and is loaded through a hidden side-effect import in hud.mjs:24.

Duplicated helpers inside the module:
- mainPanel, releaseTargets and prototype-getter walks.
- Roll-dialog lookup and resolver lookup.
- The weapon damage label.
- The T() i18n helper, 5 times.
- weaponLike and isWeaponAttack are identical.

Other issues:
- 25 swallowed catches at the snapshot; 35 at 28ccc87 (27 empty or comment-only, 8 `.catch(() => null|{})`).
- 4 different prototype-patch idioms.
- Hook registration is half guarded (setup with try/catch in combat.mjs) and half not (module scope in hud.mjs and turnflow.mjs).

Performance: fullAttackState and combatContext are recomputed many times per flag write, and rider offers are computed for every historical attack card.

Docs:
- The README is rich but has drifted: no turnflow in Files, a stale fixture count, 9 of 23 API members listed, and missing flags.
- melee.md contradicts code on stacked off-hand weapons.
- The custom pentarynCombat.* events are undocumented.
- adjustments.yml misses combat's dnd5e chat-message-type dependency.

**LLM interface.**

Today:
- An LLM reaches the module only through eval-js and game.pentaryn.combat.<fn>(Actor).
- Every method needs a live Actor document. There is no id, name or uuid resolver, so api.plan(undefined) throws a TypeError at combat.mjs:219-221.
- There is no describe() or version, no settings listing, and no read of the Bonus-bar follow-ups (followUpsNow lives in hud.mjs).
- The log shows LLMs falling back to raw flags: flags.pentaryn-combat.turn 45x, swing 18x, and writing `-=turn`/`==turn` to reset.

Should be:
- game.pentaryn.combat.inspect(ref): one read-only call returning turn, stale key, plan, pips, followUps, riders and modes, reckless, running and settings.
- describe(): methods, settings keys, user flags, flag scope, events and patches.
- settings(): live values.
- resolveActor at the API boundary.
- An optional decision trace (trace()) so 'why did the pip not drop' is answerable in one call.

**How to extend.**

Where a new feature goes today:
- A new rule goes in combat-core.mjs and gets a fixture in test/run.mjs.
- Foundry data shaping goes in shapes.mjs.
- A new HUD button goes in hud.mjs: argonClasses plus compose*Bar plus a signature in SIGS.
- A new turn-flow behaviour goes in turnflow.mjs.
- A new behaviour toggle needs four edits: a DEFAULTS entry in settings.mjs, lang Setting.<key>.Name/Hint, a README Adjustments row, and an adjustments.yml row.
- A new turn rider needs a TURN_RIDERS row, lang Rider.Name/Rule/ToggleHint keys, and possibly a riderEligibility `needs` branch.
- A new follow-up kind needs core.followUps, a runFollowUp branch, and lang FollowUp/FollowUpText/Kind keys.

What is unclear:
- Which file loads what: side-effect imports, and the hook-order dependence on transform.
- How to add a domain to the core without growing a single 1000-line file.
- That template-built i18n keys are invisible to the i18n gate.
- That custom events exist for other modules (transform) to listen to.

There is no 'Extending' section and no completeness test that would catch a missed step.

## Findings index

| Id | Category | Impact | Effort | Title | Status at 28ccc87 |
|---|---|---|---|---|---|
| combat-riders-1 | Performance gains | high | M | Memoise fullAttackState / combatContext / weaponsOf / featuresOf per tick | open · re-anchored |
| combat-riders-2 | Performance gains | medium | S | Check the turn stamp and permission before computing rider offers | open · re-anchored, extended |
| combat-riders-35 | Performance gains | low | S | Install the picker-cue pointer listeners and body MutationObserver only while skipPickerGuide is on | open · re-anchored, extended |
| combat-riders-6 | Maintainability gains | medium | M | Split hud.mjs (970 lines, 11 concerns) into hud/ files; pin hook order with a manifest test | open · re-anchored, extended |
| combat-riders-7 | Maintainability gains | medium | M | turnflow.mjs: split into turnflow/ by concern; record that a separate module needs a settings migration | open · re-anchored, extended |
| combat-riders-20 | Maintainability gains | medium | M | Split combat-core.mjs (1240 lines, 81 exports) into core/ by domain behind a barrel | open · re-anchored, extended |
| combat-riders-34 | Maintainability gains | low | S | Remove dead exports and a dead CSS rule | open · re-anchored |
| combat-riders-18 | Defragmentation | high | L | Argon injection across combat, transform and riders: implicit hook order, Reaction-slot double relabel, forked tooltip helpers | open · re-anchored, extended |
| combat-riders-5 | Defragmentation | medium | S | Collapse in-module duplicate helpers into argon-util.mjs, dialogs.mjs, i18n.mjs | open · re-anchored, extended |
| combat-riders-17 | Defragmentation | medium | S | combat/riders.mjs vs pentaryn-riders: rename, document the split, guard the two identity tables | open · re-anchored |
| combat-riders-21 | Defragmentation | medium | S | One planFor / multiattackFor / rememberedWeapon in shapes.mjs instead of hand copies | open · re-anchored, extended |
| combat-riders-3 | Defragmentation | low | S | One settlePips() helper; drop the 'call twice' copies made redundant by the prototype settle patch | open · re-anchored |
| combat-riders-4 | Defragmentation | low | S | weaponLike (combat.mjs) and isWeaponAttack (riders.mjs) are the same predicate: one export in shapes.mjs | open · re-anchored, extended |
| combat-riders-9 | Logging / auditability gains | medium | S | Replace swallowed catches with a debug-gated log.mjs (silent by default) | open · re-anchored, extended |
| combat-riders-10 | Logging / auditability gains | medium | S | Opt-in decision trace ring buffer (why a swing counted, why a rider was or was not offered) | open · re-anchored, extended |
| combat-riders-8 | Hardening | medium | S | One idempotent wrapMethod() for the prototype patches, with a recorded patch list | open · re-anchored, extended |
| combat-riders-22 | Hardening | medium | S | Move fullAttackPlan's logic into the core and pin the Multiattack + Action Surge inconsistency | open · re-anchored |
| combat-riders-30 | Hardening | medium | S | Guard every module-scope hook with one on(name, label, fn) wrapper that passes return values through | open · re-anchored, extended |
| combat-riders-29 | Hardening | low | S | Prune session-long maps whose stale entries are never read | open · re-anchored |
| combat-riders-33 | Hardening | low | S | Escape message-flag and actor-data strings before innerHTML (auto note, rider button) | open · re-anchored, extended |
| combat-riders-14 | Extendability | medium | S | Name the custom pentarynCombat.* events in one EVENTS table and document their payloads | open · re-anchored, extended |
| combat-riders-28 | Extendability | medium | S | 'Extending' section plus a completeness test for template-built i18n keys and follow-up kinds | open · re-anchored, recipe corrected |
| combat-riders-11 | LLM interface | high | M | game.pentaryn.combat.inspect(ref): one read-only call for turn, plan, pips, follow-ups, riders, settings | open · re-anchored, extended |
| combat-riders-12 | LLM interface | high | S | Resolve actor refs (doc / token / uuid / id / name) at the API boundary of combat and riders | open · re-anchored |
| combat-riders-13 | LLM interface | high | M | describe() and settings() on both namespaces, generated from existing tables | open · re-anchored |
| combat-riders-15 | Documentation / skills | medium | S | Fix README / melee.md / module.json drift (files, fixture count, API, flags, stacked off-hand) | open · re-anchored |
| combat-riders-31 | Documentation / skills | medium | S | Make side-effect entry points discoverable and graph-checked (turnflow in combat; rituals, concentration, argon-tidy in riders) | open · re-anchored, partly changed |
| combat-riders-36 | Defragmentation | medium | S | Combat re-derives pentaryn-aoe internals: the cancelled-placement test and the handle-token flag | new |
| combat-riders-37 | Hardening | medium | S | Timer-sequenced behaviour: name every delay and pin the ordering between them | new |
| combat-riders-38 | Performance gains | low | S | End-of-combat flag cleanup writes once per key, then scans every world actor again | new |

## Performance gains

### combat-riders-1 — Memoise fullAttackState / combatContext / weaponsOf / featuresOf per tick

**Category:** Performance gains · **Impact:** high · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; body unchanged, hud.mjs:141-158 at the snapshot)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:166–183`

**Anchor:** `function fullAttackState(actor) {`

**Current.**

fullAttackState (hud.mjs:166-183) calls combatContext twice (directly and via turnOf), featuresOf twice (countFor weapon and countFor null), weaponsOf three times, and for NPCs/forms multiattackOf up to three times (multiattack() at hud.mjs:161-163 and countFor via usesMultiattack). It is read by both Argon pip getters (overridePips, hud.mjs:461-490), every FullAttackButton getter, actionSig (hud.mjs:497) and composeActionBar (hud.mjs:536). One turn-flag write fans out through the updateActor hook (hud.mjs:812-826) into refreshAll (hud.mjs:803-810) + checkBars + recheckSlots: roughly 10-20 full recomputations, plus bonusSig/specialSig/followUpsNow repeating turnOf/weaponsOf/featuresOf. Since the snapshot the re-run added restorePips (hud.mjs:914-929), called from a second renderActionPanelArgonComponent listener (hud.mjs:931-934) once for each of the Action, Bonus and Reaction panels and 0 ms after a new round (hud.mjs:936-939); each call reads combatContext and turnOf again.

**Proposed.**

1. Move fullAttackState into shapes.mjs as computeFullAttackState(actor) (needs setting() from settings.mjs) so it is testable without hud.mjs DOM side effects. 2. Add memoTick(fn) to shapes.mjs: Map keyed by actor.uuid, first write schedules queueMicrotask(() => cache.clear()). 3. hud.mjs uses fullAttackState = memoTick(computeFullAttackState), plus memoised combatContext/weaponsOf/featuresOf for HUD paths only; api.plan / api.inspect / riders keep the un-memoised functions. Do NOT memoise anything reachable between an actor.update await and its follow-up read (sequence.mjs, updateTurn callers).

*Re-anchor addendum (28ccc87):* restorePips (hud.mjs:914-929) is a HUD path too and may use the memoised combatContext/turnOf; the Reaction relight in the updateActor hook (hud.mjs:815-819) reads no actor state and needs nothing.

**Behaviour test recipe (write first, must pass before and after).**

New test/glue.mjs importing a test/foundry-stubs.mjs (game.settings.get throws so setting() returns DEFAULTS; game.combats = [] and a variant with a fake started Combat {id:'c1',round:1,combatant:{id:'cb1',actor},combatants:[{actor}]}). Fake actors: Fighter (Extra Attack feat; Longsword weapon equipped with attack activity, properties Set['ver'], mastery 'sap'; Dagger lgt/fin/thr 'nick'); NPC with Multiattack feat 'makes two [[/item .bite]] attacks' + Bite feat. Characterise first, before the change: for each actor and turn flags {none, after 1 main swing, after surge}, JSON of computeFullAttackState(actor) minus ctx.combat equals the recorded literal. After: memo(actor) deepEquals compute(actor); two calls in one sync block return the same object (===); after await Promise.resolve() a fresh object; a spy around featuresOf counts 1 call for 5 fullAttackState calls in one tick; api.plan stays un-memoised (spy count equals call count).

*Re-anchor addendum (28ccc87):* Also: three restorePips calls in one tick (one per panel render) call combatContext once with the memo on (spy), and the repainted pips equal the un-memoised path's.

**Risk.** Stale value if code mutates an actor synchronously (updateSource) and reads in the same tick; microtask ordering means a continuation queued before the clear microtask could still see the cache, so keep memo out of write-then-read paths. The >1-tick test and the HUD-only scope bound it.

**Related:** combat-riders-21, combat-riders-11

### combat-riders-2 — Check the turn stamp and permission before computing rider offers

**Category:** Performance gains · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; lines unchanged; the re-run makes it hotter)

**Where:** `foundry/module/pentaryn-combat/riders.mjs:167–169`

**Anchor:** `  const { actor, offers } = offersFor(message);`

**Current.**

renderOffer (riders.mjs:162-197) runs on every dnd5e.renderChatMessage (registered in installRiders, riders.mjs:484-488), including old attack cards at chat log render. It calls offersFor(message) (featuresOf, turnOf/combatContext, weaponShape, isRaging/isReckless, allyAdjacent measurePath over canvas.tokens.placeables) at line 167 and only afterwards discards on missing permission (168) or stale stamp (169 `stamp !== combatContext(actor).key`). Since the snapshot the re-run added rerenderShowing (riders.mjs:437-449), run on every combatTurnChange and deleteCombat (riders.mjs:489-490): it re-renders every card on this client that still shows a rider button or an Undo. Those are exactly the cards whose stamp is now stale, so every turn change pays a full offersFor per such card before the stale check throws the result away.

**Proposed.**

Reorder inside renderOffer after the stamp check: `const actor = attackActivity(message)?.actor; if (!actor || !(game.user.isGM || message.isAuthor || actor.isOwner)) return; if (stamp !== combatContext(actor).key) return; const { offers } = offersFor(message);` offersFor derives actor from the same attackActivity(message)?.actor, so the actor is identical. offersFor is a pure read. In rerenderCards (riders.mjs ~402-409) compute combatContext(a).key once per distinct actor via a Map instead of per message.

*Re-anchor addendum (28ccc87):* rerenderCards is now riders.mjs:411-430 (per-message combatContext(a).key at riders.mjs:423).

**Behaviour test recipe (write first, must pass before and after).**

New test/glue.mjs with stubs. Fake attack message {type:'attack', getFlag(MOD,'turnKey') -> 'c1:1:old', system.activity resolved by attackActivity to a Rogue activity with Sneak Attack feat + damage activity}; html stub with querySelector/append recording appended nodes; canvas.tokens.placeables as a counting getter. Characterise before: stale stamp appends nothing; current stamp + owner appends one `.pentaryn-combat-riders` row with button data-rider 'sneak-attack' (pin innerHTML); non-owner player appends nothing. After: identical outcomes, and the placeables access counter is 0 for stale-stamp and non-owner cases.

*Re-anchor addendum (28ccc87):* Also: a fake combatTurnChange with two stale cards showing a `.pentaryn-combat-riders` row: after the 50 ms timer both cards are re-rendered (ui.chat.updateMessage spy called twice, as today), the rows are gone, and the placeables counter is 0 after the change.

**Risk.** Both early-return paths produce no DOM change, order is irrelevant to output. attackActivity already catches internally.

**Related:** combat-riders-1

### combat-riders-35 — Install the picker-cue pointer listeners and body MutationObserver only while skipPickerGuide is on

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; lines were ~240-250); extended with the new always-on pointerover listener

**Where:** `foundry/module/pentaryn-combat/hud.mjs:265–275`

**Anchor:** `let pointer = null;`

**Current.**

At module load every client adds two capture-phase document listeners (pointermove, pointerdown; hud.mjs:266-267) storing the pointer position, and at ready a MutationObserver on document.body childList for the whole session (hud.mjs:268-275). They matter only while the pentaryn-combat-picker-cue body class is on (applyPickerGuide, hud.mjs:246-256). transform/hud.mjs adds another capture pointermove. Since the snapshot the re-run added a third always-on capture listener, pointerover at hud.mjs:98 (dropStrayTooltip, hud.mjs:84-97, Area 10, no setting). That one is a bug fix every client needs, so this finding does not gate it, but it is part of the same document-listener list.

**Proposed.**

Move listener/observer install into applyPickerGuide (hud.mjs ~221): install when the setting turns on, remove and disconnect when it turns off; keep the observer's body-class check as a second guard. The setting defaults on, so default behaviour is the same.

*Re-anchor addendum (28ccc87):* applyPickerGuide is at hud.mjs:246. The pointerover listener (hud.mjs:98) stays installed in every case; when hud/picker.mjs gets an install() (combat-riders-6), move the pointerover registration into hud/tooltips.mjs install() at the same position, not into the picker gate.

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs with a stub document (add/removeEventListener recorders, body.classList), a MutationObserver stub recording observe/disconnect, and game.settings returning skipPickerGuide true/false. Setting on (default): after ready, listeners [pointermove, pointerdown] registered and observer observing body (the current state); setting off then applyPickerGuide: removed and disconnected. Placement fixture: cue on, pointer {x:100,y:50}, added node class 'ech-target-picker' with empty style gets the left/top the current code computes (record the literals from the current code first).

*Re-anchor addendum (28ccc87):* The recorded document listener list (registration order) now includes `pointerover` from hud.mjs:98 before `pointermove`/`pointerdown`, and it stays registered with skipPickerGuide off.

**Risk.** After toggling the setting on mid-session the first picker may have no pointer yet; the opening click's pointerdown covers it.

**Related:** combat-riders-6

## Maintainability gains

### combat-riders-6 — Split hud.mjs (970 lines, 11 concerns) into hud/ files; pin hook order with a manifest test

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; file grew 884 → 970 lines and gained two concerns)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:1–970`

**Anchor:** `// Pentaryn Combat — the Argon Combat HUD.`

**Current.**

hud.mjs (970 lines, 884 at the snapshot) holds tooltip hygiene (now with dropStrayTooltip and its module-scope capture pointerover listener, hud.mjs:84-98), badge/button plumbing, Full Attack state, Argon target-picker reuse, the picker tutorial/cursor cue (module-scope document listeners and body MutationObserver, hud.mjs:265-275), four Argon button classes (argonClasses, hud.mjs:283-457), the pip override, bar signatures/composition, the re-run's repaint of Argon's own Action/Bonus/Reaction pips for spells and Reactions (otherAction/reaction listeners and restorePips, hud.mjs:890-939), and 18 module-scope Hooks.on/once lines plus three hook loops. It imports turnflow.mjs at line 24, now as a named import (`placeOpenDrawers`, called from applyButtons at hud.mjs:142). It registers two renderActionPanelArgonComponent listeners (hud.mjs:739 composition, hud.mjs:931 restorePips) and two updateCombat listeners (hud.mjs:841, hud.mjs:936). The module-scope DOM work makes it unimportable in node.

**Proposed.**

Create hud/buttons.mjs (argonClasses + button classes), hud/bars.mjs (composeActionBar/Bonus/Special, followUps wiring, gatePoleStrike, hideDuplicateSlots, pulseNew, SIGS, checkBars), hud/pips.mjs (overridePips), hud/picker.mjs, plus argon-util.mjs (combat-riders-5). hud.mjs keeps the turnflow.mjs import first and the Hooks.on registrations in the same order. Add new files to adjustments.yml `files` for rows that list hud.mjs; markers `_pentarynPips`, `rangepicker`, `argon-onSetChangeUpdateItem` must still appear in a listed file. Coordinate timing with the live-test workflow, which edits hud.mjs.

*Re-anchor addendum (28ccc87):* Also hud/pips.mjs takes restorePips and the otherAction/reaction listeners (hud.mjs:890-939), and hud/tooltips.mjs takes dropStrayTooltip and its pointerover listener (hud.mjs:84-98). Keep both renderActionPanelArgonComponent listeners as two registrations in today's positions (turnflow.mjs:168 first, then hud.mjs:739, then hud.mjs:931), and both updateCombat listeners likewise. The rows added by the re-run that list hud.mjs (combat-argon-item-button-spell-pips, combat-argon-stray-tooltip, combat-argon-drawer-restore-place) need their `files` updated too: grep adjustments.yml for their markers before moving code.

**Behaviour test recipe (write first, must pass before and after).**

Add test/hooks-manifest.mjs on test/foundry-stubs.mjs: Hooks.on/once/callAll push [name, source-tag] to an ordered list; document.addEventListener and MutationObserver are recorders; import combat.mjs then hud.mjs (module.json esmodules order). First run records the ordered hook-name list and document listener types and pastes them as the literal oracle (do not trust a count in this document). Assert equality before and after the split. Also run make foundry-adjustments-check and make foundry-combat-check.

*Re-anchor addendum (28ccc87):* At 28ccc87 the recorded manifest must show, for renderActionPanelArgonComponent, three combat listeners in the order turnflow.mjs:168, hud.mjs:739, hud.mjs:931, and for updateCombat hud.mjs:841 before hud.mjs:936.

**Risk.** Hook order between turnflow, hud and transform for renderActionPanelArgonComponent; the manifest catches reorders, adjustments-check catches orphaned markers.

**Related:** combat-riders-7, combat-riders-18, combat-riders-31

### combat-riders-7 — turnflow.mjs: split into turnflow/ by concern; record that a separate module needs a settings migration

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; file now committed in 17275c9/4f9224f and grew 607 → 841 lines, four new concerns)

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:1–841`

**Anchor:** `// Pentaryn Combat — turn flow on the Argon HUD (usability re-run, Area 1).`

**Current.**

turnflow.mjs (841 lines; 607 and untracked at the snapshot) holds about 15 unrelated features: Argon special actions (37-123), the Reaction OA slot (125-175), turn-boundary sweeps, target release and HUD follow with followTo and timed rechecks (177-246), end-of-combat flag cleanup and the orphan-flag sweep (248-285, new), controlToken follow (286-297), helper-token re-select on deleteToken (299-330, setting helperTokenControl, new), Esc on roll dialogs (332-354), Enter-uses in usage windows (356-390, setting enterUses, new), cancelled-card tidy (392-410), death saves at 0 HP (412-437), portrait conditions (439-482), core PreciseText destroy and x/y, createScrollingText and ChatLog.notify guards (484-563), manual-dice digit focus (565-607), self effects and Steady Aim (609-678), drawer placement plus re-placement and turn-boundary close (680-788), the Argon pip settle (790-812) and Argon's movement readout redraw (814-841, new). Much of it is general table UX and core-bug workarounds, not melee.

**Proposed.**

Keep it in pentaryn-combat (settings are keyed `pentaryn-combat.<key>`; a new module id is a data migration = behaviour change). Split into turnflow/special-actions.mjs, reaction.mjs, boundaries.mjs, dialogs.mjs, death.mjs, portrait.mjs, core-guards.mjs, effects.mjs, drawers.mjs, argon-pips.mjs; turnflow.mjs becomes imports in today's order. Add context/plans/combat-turnflow-split.md noting a future pentaryn-table module needs a settings-migration shim for escRollDialog, scrollingTextGuard, drawerNearButton, portraitConditions, hudFollows, clearTargetsAfterTurn. Update adjustments.yml `files` for the combat-argon-* / combat-core-* / combat-dnd5e-self-effect-apply / -steady-aim-effect rows, then run make foundry-adjustments-check. Do this only after the live-test workflow stops editing turnflow.mjs (file is untracked and in flux).

*Re-anchor addendum (28ccc87):* New files for the re-run's additions: turnflow/cleanup.mjs (clearCombatFlags, sweepOrphanFlags and their hooks), turnflow/helper-token.mjs, turnflow/enter-uses.mjs (or inside dialogs.mjs, keeping its keydown listener between the Esc and digit listeners), turnflow/movement.mjs; drawer re-placement and closeDrawersOf go with drawers.mjs, and hud.mjs's named import of placeOpenDrawers points at drawers.mjs. The settings-migration shim list grows by helperTokenControl and enterUses. Rows to update in adjustments.yml also include combat-helper-token-control, combat-dnd5e-usage-enter-uses, combat-core-scrolling-text-teardown, combat-argon-drawer-restore-place, combat-argon-movement-redraw and combat-argon-drawer-turn-close.

**Behaviour test recipe (write first, must pass before and after).**

The hook-manifest test (combat-riders-6) must list identical hook names in identical order (renderActionPanelArgonComponent, combatTurnChange, deleteCombat, controlToken, closeAttackRollConfigurationDialog, dnd5e.preApplyDamage, renderRollResolver, dnd5e.postUseActivity, dnd5e.postRollAttack, renderButtonPanelButtonArgonComponent, and the once(init/ready) hooks); document keydown listener count unchanged. Pure pieces already covered by core fixtures must still pass: run `node test/run.mjs` (283 at snapshot).

*Re-anchor addendum (28ccc87):* At 28ccc87 the turnflow registrations, in order, are: renderActionPanelArgonComponent, combatTurnChange, deleteCombat, once(ready) orphan sweep, deleteCombat, controlToken, deleteToken, closeAttackRollConfigurationDialog, dnd5e.preApplyDamage, once(ready) patchPortrait, once(init) ×2, renderRollResolver, dnd5e.postUseActivity, dnd5e.postRollAttack, renderButtonPanelButtonArgonComponent, once(ready) pip settle, createActiveEffect, deleteActiveEffect, updateActiveEffect, updateActor, combatTurnChange (record them, do not trust this list). There are three document keydown listeners (Esc turnflow.mjs:344, Enter-uses :378, digits :597), plus the temporary renderActivityUsageDialog hook pressUse adds and removes. `node test/run.mjs` reports 320 fixtures at 28ccc87 (283 at the snapshot).

**Risk.** Hook order is the main risk; the manifest covers it. Collision with live edits.

**Related:** combat-riders-6, combat-riders-8

### combat-riders-20 — Split combat-core.mjs (1240 lines, 81 exports) into core/ by domain behind a barrel

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; core grew 1025 → 1240 lines, 68 → 81 exports, three more area sections)

**Where:** `foundry/module/pentaryn-combat/combat-core.mjs:894`

**Anchor:** `/* ── usability run, Area 2 (fixer pass 2) ─────────────────────────────────── */`

**Current.**

The pure core grows by usability-run area: 'usability run, Area 2 (fixer pass 2)' at 894 and 'usability Area 3 re-run (fixer pass 2)' at 938, and since the snapshot 'usability Area 5 re-run: spells spend their pip; Quickened Spell' at 1038, 'usability Area 10 (melee build-review live checks), fixer pass' at 1113 and 'usability re-run, Area 10 follow-up (2026-10-11)' at 1177. It mixes layout math (dockRect, drawerLeft, clampToView), turn-boundary logic (expiringAt, staleCombatFlags, orphanCombatFlags, hudFollowPlan), pip rules (pipFor, spentPips, reactionSpent, recordQuickened, recordQuickenedCast), Steady Aim rules, chat-card rules (deltasConsumed, riderRolled) and Argon slot visibility. 1240 lines, 81 exports. A builder cannot tell where a new rule goes.

**Proposed.**

Create core/ files (contents moved as-is): identity.mjs (normalizeName, slugify, featureSet), count.mjs, weapons.mjs, sequence.mjs, turn.mjs, followups.mjs, turn-riders.mjs, damage.mjs (RECKLESS_*, damageBonuses, steadyAim*), multiattack.mjs, turnflow.mjs, layout.mjs. combat-core.mjs becomes `export * from './core/...'` plus MOD; no importer changes. Update the adjustments row listing combat-core.mjs (marker steadyAimChanges must be found, add core/damage.mjs).

*Re-anchor addendum (28ccc87):* Homes for the 13 exports added by the re-run: pipFor, recordQuickened, recordQuickenedCast, spentPips, reactionSpent → turn.mjs (or a new pips.mjs); staleCombatFlags, orphanCombatFlags, hudFollowPlan, deltasConsumed → turnflow.mjs; replanExtras → sequence.mjs; clampToView → layout.mjs; offhandVia → followups.mjs; riderRolled → turn-riders.mjs.

**Behaviour test recipe (write first, must pass before and after).**

Before splitting add to test/run.mjs `check('export surface', Object.keys(core).sort(), [<the 68 names>])` (generated by running Object.keys once). It must pass before and after. All 283 fixtures pass after; `node --check` on each new file; core/ files import nothing from Foundry.

*Re-anchor addendum (28ccc87):* The export surface at 28ccc87 is 81 names (68 at the snapshot): generate the list again, do not reuse the snapshot list. 320 fixtures pass at 28ccc87.

**Risk.** Circular imports (identity and turn must stay leaves); the export-surface check catches a dropped export.

**Related:** combat-riders-7, combat-riders-28

### combat-riders-34 — Remove dead exports and a dead CSS rule

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; unchanged apart from line numbers)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:279`

**Anchor:** `export { attackActivityOf };`

**Current.**

combat.mjs:279 `export { attackActivityOf };` (nothing imports from ./combat.mjs; re-verified by grep at 28ccc87); sequence.mjs:437 `export { weaponShape };` (hud.mjs:19, combat.mjs:29 and turnflow.mjs:23 import other names from sequence.mjs; riders.mjs and sequence.mjs itself take weaponShape from shapes.mjs); styles/combat.css:44-47 `.extended-combat-hud .pentaryn-combat-hidden` (no JS in the module adds that class; grep for -hidden in *.mjs finds nothing).

**Proposed.**

Delete the two re-exports and the CSS rule; keep the imports still used by api.plan (chosenWeapon, attackActivityOf if used there; drop only imports left unused).

**Behaviour test recipe (write first, must pass before and after).**

Source-grep test (test/dead.mjs): no file in the module imports from "./combat.mjs", and none imports weaponShape from "./sequence.mjs"; `grep -rn pentaryn-combat-hidden foundry/module` returns only combat.css before and nothing after; make foundry-combat-check and node test/run.mjs pass.

**Risk.** An external macro importing the module entry is not reachable; low.

**Related:** combat-riders-20

## Defragmentation

### combat-riders-18 — Argon injection across combat, transform and riders: implicit hook order, Reaction-slot double relabel, forked tooltip helpers

**Category:** Defragmentation · **Impact:** high · **Effort:** L · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; one more listener on the shared hook, one more tooltip-hygiene copy)

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:135–166`

**Anchor:** `function wrapReactionSlot(btn) {`

**Current.**

Four listeners now mutate the same Argon panels in renderActionPanelArgonComponent: combat turnflow.mjs:168, combat hud.mjs:739 (composition), combat hud.mjs:931 (restorePips, added by the re-run) and transform hud.mjs:581. Their order comes only from ES import order and module load order. The Reaction slot is relabelled twice: turnflow.mjs:138-145 overrides the label getter ('Opportunity Attack: {weapon}'), and transform/hud.mjs:594-600 (renderItemButtonArgonComponent) overwrites the title text with PENTARYN_TRANSFORM.Hud.OpportunityAttack for polymorphed actors. Helpers are forked between combat hud.mjs and transform hud.mjs (dropTooltip, paintBadge, applyButtons, itemButtonClass). Argon tooltip hygiene now lives in five places across three modules: the re-run added combat's dropStrayTooltip (hud.mjs:84-98). The re-run also added Argon private-state touches that argon.md must list: ui.ARGON._hudState (turnflow.mjs:776, closeDrawersOf), ui.ARGON.components.movement.updateMovement (turnflow.mjs:820-825), ui.ARGON._tooltip._triggerElement/_locked/_destroy (hud.mjs:86-94) and ui.ARGON.bind (turnflow.mjs:243).

**Proposed.**

Phase 1 (no behaviour change): add context/foundry/argon.md (routing row in context/foundry/README.md) listing every Argon hook and prototype touched, by module, file:line, and execution order, with the Reaction-slot double relabel as a known overlap. Make combat's argon-util.mjs (combat-riders-5) parameterised (paintBadge takes the empty class; applyButtons takes {attachDetached}) so a later vendor into transform is byte-identical. Phase 2 (a plan doc only, not part of this audit): a pentaryn-argon registerBarComposer library.

**Behaviour test recipe (write first, must pass before and after).**

Extend the hook manifest (combat-riders-6) in scripts/tests (node) to import combat.mjs, hud.mjs and ../pentaryn-transform/hud.mjs under the same stub Hooks and pin the listener order for 'renderActionPanelArgonComponent' as [turnflow, combat hud, transform hud] and for 'renderItemButtonArgonComponent'. Fake-panel pipeline: panel {label:'DND5E.Action', _buttons:[weapon-set slot, item button], element stub}; call the recorded listeners in order for a polymorphed fake actor and pin the resulting _buttons kinds/ids order. Reaction-slot fixture: record the title text and button.label produced by both listeners today as literals and assert they are unchanged.

*Re-anchor addendum (28ccc87):* At 28ccc87, pin the renderActionPanelArgonComponent order as [turnflow:168, combat hud:739, combat hud:931, transform hud:581].

**Risk.** Phase 1 is docs + parameterised helpers pinned by the pipeline fixture. Phase 2 changes ordering semantics and needs the fixture suite first.

**Related:** combat-riders-5, combat-riders-6, combat-riders-8

### combat-riders-5 — Collapse in-module duplicate helpers into argon-util.mjs, dialogs.mjs, i18n.mjs

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: the re-run added three more copies)

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:28–30`

**Anchor:** `function mainPanel(label) {`

**Current.**

Copies inside combat: mainPanel (hud.mjs:153, turnflow.mjs:28); releaseTargets (hud.mjs:218, turnflow.mjs:189, identical bodies); prototype descriptor walks (hud.mjs:463-469 `find`, turnflow.mjs:127-133 `protoGetter`, and since the re-run the PreciseText x/y walk at turnflow.mjs:511-514); the damage-label join (hud.mjs weaponTile 185-194, sequence.mjs swapTile 171-181); Argon tooltip drop (hud.mjs:37-42 dropTooltip, turnflow.mjs:711-720 dropDrawerTooltip, and since the re-run hud.mjs:84-97 dropStrayTooltip, which repeats dropDrawerTooltip's `_destroy(true)` + null-out + deactivate body); the open RollResolver lookup (sequence.mjs:106-111, turnflow.mjs:571-580); the roll-dialog lookup, now four variants (strip.mjs:36-40 rollDialogOf, buttons only; turnflow.mjs:334-342 rollDialogFor, any element plus top-z fallback; strip.mjs:205-208 topRollWindow, top-z by DOM, new; sequence.mjs:191-205 closeSwingWindow, application instances matched by the swing's activity uuid, new); the cancelled-usage-card test, now twice (turnflow.mjs:392-410 in closeAttackRollConfigurationDialog and sequence.mjs:211-228 tidyOrigins, new: same `rolled` scan, core.orphanUsage call, core.deltasConsumed and delete-with-warn); and the T() helper five times (hud.mjs:28, riders.mjs:23, sequence.mjs:21, strip.mjs:12, turnflow.mjs:26). (The re-run did dedupe one helper on its own: turnflow's consumedAny became core.deltasConsumed.)

**Proposed.**

New files: argon-util.mjs (mainPanel, releaseTargets, protoDescriptor(obj,name), dropTooltip, settlePips); dialogs.mjs (rollDialogOf(target,{buttonOnly}), openResolvers(), damageLabel(activity)); i18n.mjs (export const T). strip keeps its semantics via buttonOnly:true, turnflow via false. argon-util imports nothing but settings.mjs so a byte-identical vendor copy in transform stays possible. Do the dedupe per helper in separate commits.

*Re-anchor addendum (28ccc87):* dialogs.mjs also gets topRollWindow() (used by rollDialogOf's fallback and strip's focusRollWindow) and tidyUsageCard(msg, {sequence}) (used by both tidy sites, each passing today's `sequence` value: `!!running()` in turnflow, `false` in sequence); argon-util.mjs gets dropArgonTooltip(t) used by dropDrawerTooltip and dropStrayTooltip, each keeping its own guard.

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs: damageLabel with {labels:{damage:[{label:'1d8 + 3 Slashing'}]}}, {labels:{damages:[{formula:'1d6'}]}}, {} must equal the strings currently produced by weaponTile.damage and swapTile.stats (record literal outputs from the existing code first, copied into the test as the oracle). protoDescriptor: class A { get x(){return 1} }; class B extends A {} returns A's getter for a B instance. rollDialogOf with stub elements: {buttonOnly:true} on a non-button target returns null (strip), {buttonOnly:false} with body focused returns top-z dialog (turnflow). Hook manifest test (combat-riders-6) unchanged.

*Re-anchor addendum (28ccc87):* Also: tidyUsageCard over mine × ageMs {1000, 400000} × rolled × consumed × sequence equals the decision both old call sites make (copy both bodies into the test as oracles); topRollWindow() with three stub windows of z-index 10/30/20 returns the 30 one, the same element rollDialogFor(document.body) returns; dropArgonTooltip on a locked tooltip changes nothing in dropStrayTooltip's path (the `_locked` guard stays at its call site).

**Risk.** Choosing the wrong variant for a call site (strip must stay buttons-only or Esc in a text field closes the dialog); buttonOnly fixtures pin both.

**Related:** combat-riders-3, combat-riders-4, combat-riders-18

### combat-riders-17 — combat/riders.mjs vs pentaryn-riders: rename, document the split, guard the two identity tables

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; header unchanged; riders.mjs is now 501 lines, over the 500 feature cap)

**Where:** `foundry/module/pentaryn-combat/riders.mjs:1–16`

**Anchor:** ` * Once-per-turn riders — Sneak Attack, Frenzy, Colossus Slayer, Divine Strike — offered on the`

**Current.**

Two modules each have a 'riders' concept. Combat (riders.mjs + TURN_RIDERS at combat-core.mjs:490) offers once-per-turn weapon damage on attack cards, matching by identifier or slugify(name). pentaryn-riders (RULES at riders-core.mjs:59) edits spell damage terms, matching identifier/source/normalizeName with all parentheticals stripped. Combat's normalizeName (combat-core.mjs:35) strips only a trailing parenthetical. Both intercept damage rolls and both insert a p.supplement note after `:scope > section.icon-row` (combat: riders.mjs:366-368). Nothing prevents a future row from landing in both tables and double-applying. The combat-dnd5e-roll-hooks row's `files` list is at adjustments.yml:336.

**Proposed.**

Do not merge (settings, user flags, flag scopes differ = migration). 1. Rename combat's riders.mjs to turn-riders.mjs, update imports and the adjustments.yml combat-dnd5e-roll-hooks `files` list (line ~336), and log labels. 2. Add a 'Which riders module?' table to both READMEs and context/foundry/melee.md (attack-card offer, once per turn, weapon hit = combat TURN_RIDERS; automatic edit of spell damage/healing terms = pentaryn-riders RULES). 3. Same-named helper insertCardNote(html,node) in both with identical bodies. 4. Guard test below. Do the rename only when the live-test workflow is not editing the file.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_rider_tables.py running `node --input-type=module -e` that imports both cores by absolute path and prints JSON of TURN_RIDERS.map(r=>r.key + identifiers) and RULES.flatMap(r=>[...r.match.identifiers, ...r.match.names.map(core.slugify)]). Assertions: TURN_RIDERS keys pinned to ['sneak-attack','frenzy','colossus-slayer','divine-strike']; intersection with RULES identifiers/slugs empty; normalizeName contract differences pinned: combat 'Elemental Adept (Fire)' -> 'elemental adept', riders 'A (x) B' -> 'a b', combat 'A (x) B' -> 'a (x) b' (run each once to record the actual literal). After the rename: hook manifest (combat-riders-6) unchanged and make foundry-combat-check passes.

**Risk.** Rename touches imports in combat.mjs and hud.mjs plus one adjustments row; the imports gate and adjustments-check catch misses.

**Related:** combat-riders-16, combat-riders-18, combat-riders-28

### combat-riders-21 — One planFor / multiattackFor / rememberedWeapon in shapes.mjs instead of hand copies

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; one more raw read found)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:218–224`

**Anchor:** `  plan: (actor, weaponId = null) => {`

**Current.**

'Uses Multiattack and the setting is on' appears at combat.mjs:221 (`(actor.type === "npc" || actor.isPolymorphed) && setting("multiattack")`, equivalent to shapes.mjs usesMultiattack), shapes.mjs:156 and hud.mjs multiattack() (161-163). api.plan re-implements the plan half of fullAttackState (hud.mjs:166-183). The remembered weapon `getFlag(MOD,'last')?.weapon` is read raw at combat.mjs:222, hud.mjs:170, hud.mjs:362, shapes.mjs:122 and riders.mjs:464 (report; also at the snapshot, missed then) and written at hud.mjs:207 and sequence.mjs:351. The quick user flag is written raw at sequence.mjs:261 (the strip's onQuick) bypassing settings.mjs setQuickMode (settings.mjs:80).

**Proposed.**

In shapes.mjs add multiattackFor(actor), rememberedWeapon(actor), rememberWeapon(actor,id), planFor(actor, weaponId=null) returning {plan, ma, weaponId, count}. api.plan = (a,w)=>planFor(a,w).plan; fullAttackState uses planFor; sequence.mjs:261 (was :208) calls setQuickMode(on). Note api.plan resolves weaponId via chosenWeapon even for Multiattack actors while fullAttackState passes null there; the plan output is the same because fullAttackPlan ignores weaponId in the multiattack branch, which the fixtures must pin.

*Re-anchor addendum (28ccc87):* sequence.mjs:261 (was :208) calls setQuickMode(on); riders.mjs:464 uses rememberedWeapon(actor).

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs with stubs: Fighter (Extra Attack, Longsword+Dagger), Rogue (Nick pair), NPC (Multiattack 'two bite'), polymorphed character; turn states {fresh, 1 swing, surge}. Copy the old api.plan and old fullAttackState(actor).plan into the test as oracles and assert planFor(actor).plan deepEquals both, also with an explicit weaponId argument. setQuickMode(true) writes game.user.setFlag('pentaryn-combat','quick',true), same args as the old inline call (spy).

**Risk.** The api.plan vs fullAttackState weaponId difference; NPC + explicit weaponId fixture pins it.

**Related:** combat-riders-1, combat-riders-22

### combat-riders-3 — One settlePips() helper; drop the 'call twice' copies made redundant by the prototype settle patch

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; the three double-call sites are unchanged)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:488–489`

**Anchor:** `  panel.updateActionUse();`

**Current.**

Three places call Argon's updateActionUse twice: hud.mjs:488-489 (overridePips), hud.mjs:809 (refreshAll `action.updateActionUse(); action.updateActionUse();`), turnflow.mjs:33-35 (paint()). turnflow.mjs:797-812 patches ActionPanel.prototype.updateActionUse to re-run when the .actions-uses-container child count changed (marker _pcSettles), so those callers can run up to four passes. The re-run added six single calls on Argon's own Action/Bonus/Reaction panels (hud.mjs:818, 897, 906, 921, 926, 928); they rely on the patch alone and need no change.

**Proposed.**

Add settlePips(panel) (new argon-util.mjs, see combat-riders-5): if Object.getPrototypeOf(panel)?.updateActionUse?._pcSettles then one call, else two calls. Replace the three sites. Keep the _pcSettles marker and the comment (adjustments.yml row combat-argon-pip-settle checks them). Caveat to pin: the patch compares children counts from this.element, so when element is null both counts are null and it does not re-run; the fake-panel test must include an element-less panel to confirm the end state is unchanged.

**Behaviour test recipe (write first, must pass before and after).**

New test/argon-pips.mjs with a node fake `class ActionPanel` reproducing Argon's bug (rebuild container when container.length !== maxActions, painting used flags only when count unchanged; expose element.querySelector('.actions-uses-container').children). Extract the turnflow wrapper body into an exported installSettlePatch(proto) first (pure move). Characterise: for (maxActions 1->2, used), (2->2), (2->4), and an element-less panel, the final container used-flags after current path (patched + two calls) equal flags after settlePips (patched + one call); unpatched + two calls equals unpatched settlePips.

**Risk.** If the patch is not installed at ready, settlePips falls back to two calls (no change). The element-less case is the edge to pin.

**Related:** combat-riders-5, combat-riders-8

### combat-riders-4 — weaponLike (combat.mjs) and isWeaponAttack (riders.mjs) are the same predicate: one export in shapes.mjs

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; one more call site)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:48–52`

**Anchor:** `function weaponLike(activity) {`

**Current.**

combat.mjs:48-52 weaponLike and riders.mjs:45-49 isWeaponAttack encode the same rule (attack activity, not a spell, classification weapon/unarmed or item.type weapon) with different control flow. Verified logically equivalent. Call sites: combat.mjs:79, 123 (the re-run's Reaction branch), 145, 153 and riders.mjs:122. Note combat-core.mjs:98/101/767 and shapes.mjs:46 use an unrelated `weaponLike` property on weapon shapes; do not rename that.

**Proposed.**

Add `export function isWeaponAttack(activity)` to shapes.mjs using the riders.mjs body; import it in combat.mjs (replace the three weaponLike calls) and riders.mjs; delete both local copies.

*Re-anchor addendum (28ccc87):* Four combat.mjs call sites now (79, 123, 145, 153).

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs: copy both bodies verbatim as oldA/oldB. Truth table over type in {attack,save,damage} x classification in {weapon,unarmed,spell,null} x item.type in {weapon,spell,feat,consumable,undefined} (60 cases) plus activity null/undefined. Assert oldA(x)===oldB(x) for all; after the change assert shapes.isWeaponAttack equals oldB for all. Spot pins: {attack,null,'weapon'} true; {attack,'spell','weapon'} false; {attack,null,'feat'} false.

**Risk.** None if the truth table holds; it is exhaustive over the inputs both functions read.

**Related:** combat-riders-5

## Logging / auditability gains

### combat-riders-9 — Replace swallowed catches with a debug-gated log.mjs (silent by default)

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: 19 → 27 empty catches, 6 → 8 `.catch(() => …)` sites, one site fixed)

**Where:** `foundry/module/pentaryn-combat/offhand.mjs:78`

**Anchor:** `    setTimeout(() => seedWeaponSets(actor).catch(() => null), 500);`

**Current.**

At 28ccc87 the module has 27 empty or comment-only catches (conformance C24): hud.mjs:41, 96, 251, 531, 765, 832, 933, 938, 956, 963; riders.mjs:36, 189, 426, 446; sequence.mjs:178; settings.mjs:59; strip.mjs:240, 241, 272; turnflow.mjs:34, 593, 719, 730, 738, 753, 787, 824. New since the snapshot: hud 96, 933, 938; riders 446; strip 241; turnflow 753, 787, 824. It also has eight `.catch(() => null|{})` sites: offhand.mjs:78 (weapon-set seed), combat.mjs:126 (Reaction flag write, new), hud.mjs:62 (tooltip refresh), sequence.mjs:200 (closeSwingWindow's app.close, new), sequence.mjs:351 (last-weapon write), turnflow.mjs:210 (Reaction reset at turn start, new), turnflow.mjs:428/434 (death cards). The deleteCombat sweep's `.catch(() => {})` (turnflow.mjs:218 at the snapshot) was replaced by a labelled warn in the re-run (turnflow.mjs:257). Catches that return or assign a value (shapes.mjs:115/135/285, turnflow.mjs:47/151/196/241, hud.mjs:214/480/588, sequence.mjs:148/198) pass C24. No flag turns any of them on while chasing a live bug; only the importer has a log helper.

**Proposed.**

Add log.mjs: `const on = () => !!globalThis.CONFIG?.debug?.['pentaryn-combat']`; `warn(op, err, ctx)` always prints `pentaryn-combat | <op>`; `debug(op, data)` prints only when on(); `swallow = (op, value = null) => err => { debug(op, err); return value; }`. Replace `.catch(() => null)` with `.catch(swallow('op'))`, `.catch(() => {})` with `.catch(swallow('op', undefined))`, and empty catch blocks with `catch (err) { debug('op', err) }`. Preserve every handler's return value. Document CONFIG.debug['pentaryn-combat']=true in the README.

**Behaviour test recipe (write first, must pass before and after).**

test/log.mjs (node, injected fake console): with CONFIG.debug unset, swallow('x')(new Error('e')) returns null and prints nothing; swallow('x', undefined) returns undefined; warn('op', err, {actor:{name:'A'}}) prints exactly one line starting 'pentaryn-combat | op'; with the flag set, debug prints one line. Grep gate before/after: `grep -nE "catch\(\(\) *=> *(null|\{\})\)" foundry/module/pentaryn-combat/*.mjs` returns the current list before and none after.

*Re-anchor addendum (28ccc87):* At 28ccc87 the grep gate returns the eight sites above before the change.

**Risk.** Return values (null vs undefined) of replaced handlers must match; fixtures pin both. Console output unchanged by default.

**Related:** combat-riders-10, combat-riders-30

### combat-riders-10 — Opt-in decision trace ring buffer (why a swing counted, why a rider was or was not offered)

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; more silent decision points)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:55–60`

**Anchor:** `function kindOf(activity, attackMode) {`

**Current.**

Swing classification (kindOf, combat.mjs:55-60, used at :79), onPostUseActivity branches (combat.mjs:104-167; the re-run added Quickened Spell, Reaction and Quickened-cast branches at 114-140), the re-run's cancelled-area early return in the postUseActivity hook (combat.mjs:262-265), autoRiders skips (riders.mjs:301-305), renderOffer early returns (riders.mjs:163-172), the pip null fallback (hud.mjs:474-481) and restorePips (hud.mjs:914-929) decide silently, so LLMs reconstruct decisions from raw flags.

**Proposed.**

Add trace.mjs: bounded ring buffer (MAX 200) written only when CONFIG.debug['pentaryn-combat'] is set; `trace(op,data)` and `traceLog()` (returns a copy). Call at onPostRollAttack after classification {actor, activity uuid, kind, tagged, key}, each onPostUseActivity branch, autoRiders per offer {rider, applied, why}, renderOffer returns. Expose api.trace = traceLog (read-only addition).

*Re-anchor addendum (28ccc87):* Also trace the cancelled-area skip {activity uuid, reason:'area-cancelled'} and the Reaction / Quickened branches.

**Behaviour test recipe (write first, must pass before and after).**

test/trace.mjs: flag unset -> trace() leaves traceLog() []; flag set, 250 pushes -> 200 entries, first entry is #50; mutating a traceLog() result does not affect the next call. Glue test: with the flag off, onPostUseActivity on a fake surge activity produces the same updateTurn spy calls as before the change.

**Risk.** None with the flag off beyond a property check per call.

**Related:** combat-riders-9, combat-riders-11

## Hardening

### combat-riders-8 — One idempotent wrapMethod() for the prototype patches, with a recorded patch list

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: one more hand patch, an accessor pair)

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:493–563`

**Anchor:** `Hooks.once("init", () => {`

**Current.**

Prototype patches use different idioms: PreciseText.prototype.destroy (defineProperty + Object.hasOwn guard, turnflow.mjs:495-505), PreciseText.prototype.x/y (since the re-run, U-6-15: a prototype-chain descriptor walk, then defineProperty of a get/set accessor pair behind an `!Object.hasOwn(P.prototype, "y")` guard, turnflow.mjs:506-526), InterfaceCanvasGroup.createScrollingText (_pentaryn marker on function, 527-536), ChatLog.notify (_pentaryn marker, 549-563), PortraitPanel.getEffects (_pcConditions marker on prototype, 458-481), ActionPanel.updateActionUse (_pcSettles, 797-812). Per-instance wraps also exist (btn._onLeftClick, panel.toggle, getTooltipData). pentaryn-riders/rituals.mjs uses a Symbol.for WRAPPED marker. Nothing lists what is patched at runtime.

**Proposed.**

Add patch.mjs: `export const PATCHES = []; export function wrapMethod(proto, name, make, { marker, define = false })` that no-ops if the method is missing or already carries marker, else installs make(own) (via defineProperty with the existing descriptor when define:true, to keep PreciseText unchanged), tags the marker, and pushes {target, name, marker} to PATCHES. Use it for the scrolling-text, notify, getEffects, updateActionUse sites, keeping existing marker names (adjustments.yml markers `_pcSettles`, `patchPortrait`, `PortraitPanel`). Expose PATCHES via api.describe().patches (combat-riders-13).

*Re-anchor addendum (28ccc87):* The x/y pair needs an accessor form: `defineAccessor(proto, name, {get, set}, {marker})` keeping the `enumerable` copied from the found descriptor and `configurable: true`, with the `Object.hasOwn(P.prototype, "y")` guard kept at the call site. PATCHES then has six records.

**Behaviour test recipe (write first, must pass before and after).**

test/patch.mjs, pure node: class P { f(a){return a+1} }; wrapMethod(P.prototype,'f',own=>function(a){return own.call(this,a)*2},{marker:'_pcX'}). Assert new P().f(1)===4; second wrapMethod returns false and f(1) still 4; P.prototype.f._pcX===true; PATCHES length 1 name 'f'; `this` preserved; missing method returns false; define:true path yields a property with the same writable/configurable flags as the original defineProperty call. Extract the getEffects body to addPortraitExtras(list, effects, tooltipFor) and pin: effects [{uuid:'a',active:true,isTemporary:false,statuses:['prone']}] with list [] pushes one entry uuid 'a'; with list [{uuid:'a'}] pushes nothing.

*Re-anchor addendum (28ccc87):* x/y accessor: a stub base class with `get y(){return this._y} set y(v){this._y=v}` two prototypes up; after the patch, an instance with `transform: null` and the setting on ignores `y = 5` and reads 0; with the setting off the original setter runs; an instance with a transform reads and writes through. The getter returns 0 whenever transform is null, whatever the setting (pin that: it is today's behaviour).

**Risk.** PreciseText uses defineProperty; assignment would change the descriptor, hence the define option. adjustments-check verifies markers.

**Related:** combat-riders-3, combat-riders-13, combat-riders-18

### combat-riders-22 — Move fullAttackPlan's logic into the core and pin the Multiattack + Action Surge inconsistency

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; body byte-identical to the snapshot; the surge gap re-verified at 28ccc87)

**Where:** `foundry/module/pentaryn-combat/sequence.mjs:421–435`

**Anchor:** `export function fullAttackPlan(actor, { weaponId = null, turn = null, inCombat = false, multiattack = null, count = 1, pick = null } = {}) {`

**Current.**

fullAttackPlan (sequence.mjs:421-435, body unchanged since the snapshot) is pure except weaponsOf(actor) and actor.getFlag('dnd5e','enhancedDualWielding'), but lives in sequence.mjs and is untested. In the Multiattack branch `done = turn.attackAction.swings` and planSequence slices off every swing made; after Multiattack plus an Action Surge (surges 1, swings 2) the plan is [] while pipState (count=ma.total, attackActions = 1 + surges) shows pips left. Re-checked on 28ccc87's core: freshTurn with swings 2 and surges 1 gives attackActions 2, planSequence({multiattack:[{itemId:'bite',count:2}], done:2}) [] and pipState {max:4, current:2}. The PC branch uses swingsLeft, which honours surges. Likely a bug; NOT to be changed here, route to the live-test workflow.

**Proposed.**

Add fullAttackPlanFrom({weapons, weaponId, turn, inCombat, multiattack, count, pick, enhancedDualWielding}) to combat-core (or core/sequence.mjs) with the exact body of sequence.mjs:364-376; sequence.mjs keeps a wrapper supplying weaponsOf(actor) and the dnd5e flag. Add characterisation fixtures with the comment 'KNOWN: Multiattack ignores Action Surge'.

*Re-anchor addendum (28ccc87):* The body to move is sequence.mjs:422-434.

**Behaviour test recipe (write first, must pass before and after).**

Add to test/run.mjs. Record actual outputs by running the current code first, then pin: multiattack {plan:[{itemId:'bite',count:2}]}, turn = freshTurn(K) with attackAction.swings 2, surges 1, inCombat true -> {swings:[], count:2, left:0, weaponId:'bite'}; same with swings 0 -> two swings; PC weapons [longsword, dagger, scimitar], weaponId 'scimitar', count 2, fresh turn, inCombat -> scimitar main x2 plus dagger offhand nick (verify the exact list by running); pipState({count:2, turn:<surged, 2 swings>, inCombat:true}) pinned as recorded (documents the disagreement). Pass before and after the move.

**Risk.** The move is mechanical and fixture-pinned. Fixing the surge gap is a behaviour change and out of scope.

**Related:** combat-riders-21

### combat-riders-30 — Guard every module-scope hook with one on(name, label, fn) wrapper that passes return values through

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: about a dozen more unguarded registrations)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:812–826`

**Anchor:** `Hooks.on("updateActor", (actor, changes) => {`

**Current.**

combat.mjs:259-271 guards its roll hooks inside setup (the postUseActivity one now runs the re-run's cancelled-area check inline before its guarded call); most module-scope registrations are unguarded: hud.mjs updateActor 812, sequenceEnd 836, updateCombat 841, deleteCombat 854, updateItem 855, effect hooks 857-859, usage 862, bonusSpent 872, bonusAction 882, and since the re-run otherAction 892, reaction 901 and updateCombat 936 (renderActionPanelArgonComponent 931 has its own try), offhand 943, renderItemButtonArgonComponent 955 (inner try), updateToken 967; turnflow.mjs combatTurnChange 199, deleteCombat 248, controlToken 289, and since the re-run once(ready) 282, deleteCombat 283, deleteToken 312 (inner try), effect hooks 835-837, updateActor 838, combatTurnChange 841; riders.mjs (inside installRiders, called from setup without a try) combatTurnChange/deleteCombat 489-490 (new), updateActor 491, the effect-hook loop 495-500. Exceptions surface as generic hook errors without a `pentaryn-combat |` label; rejections inside setTimeout callbacks (hud.mjs:854, turnflow.mjs:227-229) are unhandled.

**Proposed.**

Add hooks.mjs `on(name,label,fn)` that registers Hooks.on(name, (...a) => { try { const r = fn(...a); if (r?.catch) r.catch(err => warn(label, err)); return r; } catch (err) { warn(label, err); } }). Apply to the unguarded registrations in the same order. Return values MUST pass through (veto semantics, e.g. pentaryn-riders dnd5e.preUseActivity returns false).

**Behaviour test recipe (write first, must pass before and after).**

test/hooks.mjs with a stub Hooks: on('x','lbl',()=>false) stores a listener that returns false; a throwing fn returns undefined and the fake console gets one warn starting 'pentaryn-combat | lbl'; an async throwing fn is caught (assert no unhandledRejection via process.on). Hook manifest (combat-riders-6) unchanged: same names, same order.

**Risk.** Swallowing a throw Foundry would otherwise surface; the labelled warn replaces it. Veto passthrough pinned.

**Related:** combat-riders-9, combat-riders-6

### combat-riders-29 — Prune session-long maps whose stale entries are never read

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; unchanged)

**Where:** `foundry/module/pentaryn-combat/shapes.mjs:208`

**Anchor:** `const writeChains = new Map();`

**Current.**

Maps that grow for the whole session: writeChains (shapes.mjs:208, one promise per actor uuid ever written), autoApplied (riders.mjs:286, entries older than AUTO_GUARD_MS never consulted), expected (sequence.mjs:32; taggedKind ignores entries older than 120 s). Small but unbounded. (The re-run's per-sequence `current.created` set, sequence.mjs:255, is dropped with the sequence and is not one of them.)

**Proposed.**

updateTurn: after writeChains.set(id, next) add `next.finally(() => { if (writeChains.get(id) === next) writeChains.delete(id); })` (turnSettled then resolves immediately for a settled chain). Add pure pruneOlder(map, now, maxAge, at = v => v) in combat-core and call it from the existing updateCombat hook (hud.mjs ~806) for autoApplied (4000) and expected (120000, v => v.at). Leave lastTag alone: capping it could drop a tag a later Damage button needs, which is a behaviour change.

*Re-anchor addendum (28ccc87):* Call pruneOlder from the first updateCombat hook (hud.mjs:841).

**Behaviour test recipe (write first, must pass before and after).**

Add to test/run.mjs: pruneOlder(new Map([['a',1000],['b',9000]]),10000,4000) leaves ['b']; with an accessor, entries {at:1} are dropped. In test/glue.mjs with a fake actor whose update resolves after a tick: two quick updateTurn calls apply in order and the second sees the first's result (spy writes [turn1, turn2], turn2.attackAction.swings === 2); after both settle writeChains has no entry and `await turnSettled(actor)` resolves immediately.

**Risk.** Deleting a chain while a newer one is queued; the identity check get(id)===next prevents it, and the ordering test pins serialisation.

**Related:** combat-riders-1

### combat-riders-33 — Escape message-flag and actor-data strings before innerHTML (auto note, rider button)

**Category:** Hardening · **Impact:** low · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: the re-run's Undone branch adds two more unescaped insertions, and the Undo markup changed)

**Where:** `foundry/module/pentaryn-combat/riders.mjs:325–345`

**Anchor:** `  const parts = auto.map(a => {`

**Current.**

renderAutoNote (riders.mjs:316-369) builds innerHTML from flags.pentaryn-combat.auto[].dice and .key (written by the rolling client). The live branch puts a.key unescaped into the Undo button's data-undo (riders.mjs:343, now a `<button type="button" class="pentaryn-combat-undo">`, an `<a>` at the snapshot) and a.dice into the text (344). The re-run's Undone branch (riders.mjs:331-340) puts a.dice inside `<s>` and inserts `text`, an i18n format of numbers taken from the message's roll terms, also unescaped. renderOffer puts o.dice (actor scale value/formula, owner-editable) into button innerHTML (riders.mjs:191). A player-owned message or actor can inject markup on the GM client. The new message flag `undone` (riders.mjs:356-360) is only read with includes() and does not reach the HTML. strip.mjs:21-23 already has esc(). Legitimate values contain no HTML-special characters.

**Proposed.**

Move esc() from strip.mjs:21-23 to i18n.mjs (or argon-util.mjs) and export it; use esc(a.dice), esc(a.key) in the auto note and esc(o.dice) in renderOffer. Extract the string building into a pure autoNoteHtml(auto, {nameOf, undoable, undoLabel, undoHint, esc}) in combat-core for testing.

*Re-anchor addendum (28ccc87):* autoNoteHtml takes both branches: autoNoteHtml(auto, {nameOf, live, undone, rolledText, undoable, undoLabel, undoHint, esc}), with riderRolled computed by the caller and passed in.

**Behaviour test recipe (write first, must pass before and after).**

In test/run.mjs with esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`): autoNoteHtml([{key:'sneak-attack',dice:'3d6',attack:'m1'}], {nameOf:()=>'Sneak Attack', undoable:()=>true, undoLabel:'Undo', undoHint:'h', esc}) must equal the string the current code builds for the same inputs (` + Sneak Attack 3d6 <a data-undo="sneak-attack" data-tooltip="h">Undo</a>` joined with ' · ' for several; capture the old output verbatim first). dice '<img src=x onerror=1>' yields '&#60;img...'.

*Re-anchor addendum (28ccc87):* The snapshot recipe's oracle string (`<a data-undo=…>`) is obsolete: re-record the live-branch string from 28ccc87 (`+ Sneak Attack 3d6 <button type="button" class="pentaryn-combat-undo" data-undo="sneak-attack" data-tooltip="h"><i class="fa-solid fa-rotate-left"></i> Undo</button>`, verify by running) and add an Undone-branch fixture: undone ['sneak-attack'], one roll with a 3d6 term totalling 12 and a card total of 23, captured verbatim from the current code before the change.

**Risk.** Normal-value output is byte-identical; only crafted markup changes (now rendered as text).

**Related:** combat-riders-5

## Extendability

### combat-riders-14 — Name the custom pentarynCombat.* events in one EVENTS table and document their payloads

**Category:** Extendability · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: 5 → 7 events)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:89–90`

**Anchor:** `  if (kind === "offhand") Hooks.callAll("pentarynCombat.offhand", actor, { bySequence: !!tagged });`

**Current.**

Seven custom events as string literals (five at the snapshot): pentarynCombat.usage (sequence.mjs:306), .offhand (combat.mjs:89), .bonusSpent (combat.mjs:90, sequence.mjs:398, 408), .bonusAction (combat.mjs:137, 149), .reaction (combat.mjs:127, new, payload (actor, activity)), .otherAction (combat.mjs:165, new, payload (actor, activity)), .sequenceEnd (sequence.mjs:359); listened at hud.mjs:836, 862, 872, 882, 892, 901, 943. Payloads differ and none are in the README.

**Proposed.**

Add events.mjs `export const EVENTS = Object.freeze({USAGE, OFFHAND, BONUS_SPENT, BONUS_ACTION, SEQUENCE_END})` with a JSDoc payload line each; replace literals at every callAll/Hooks.on site; add an 'Events' README section; list in describe() (combat-riders-13).

*Re-anchor addendum (28ccc87):* EVENTS gains REACTION and OTHER_ACTION.

**Behaviour test recipe (write first, must pass before and after).**

test/events.mjs (node source scan): read every *.mjs in the module dir; collect matches of /pentarynCombat\.[a-zA-Z]+/g before the change and pin the set {usage, offhand, bonusSpent, bonusAction, sequenceEnd}. After: no 'pentarynCombat.' literal outside events.mjs and Object.values(EVENTS).sort() equals the pinned set. Hook manifest (combat-riders-6) unchanged.

*Re-anchor addendum (28ccc87):* The pinned set at 28ccc87 is {usage, offhand, bonusSpent, bonusAction, reaction, otherAction, sequenceEnd}.

**Risk.** A typo in a constant silently breaks a listener; the pinned-set and manifest tests catch it.

**Related:** combat-riders-13, combat-riders-15

### combat-riders-28 — 'Extending' section plus a completeness test for template-built i18n keys and follow-up kinds

**Category:** Extendability · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; recipe corrected: the snapshot's key-family claim did not hold)

**Where:** `foundry/module/pentaryn-combat/settings.mjs:50–62`

**Anchor:** `export function registerSettings() {`

**Current.**

Adding a toggle, turn rider, follow-up or special action takes 3-5 coordinated edits, and template-built keys are invisible to the i18n gate: PENTARYN_COMBAT.Setting.${key}.Name/Hint (settings.mjs:54-55), Rider.Name/Rule/Check.${key} (hud.mjs:697, riders.mjs:155-157, 191), Rider.Mode/ToggleHint.${mode} (hud.mjs:700-702), FollowUp.${kind} (hud.mjs:386, 407, 413; sequence.mjs:381), FollowUpText.${kind}, now with a composed `offhand-dual-wielder` variant (hud.mjs:414, re-run U-10-12), Kind.${kind} (strip.mjs:64, 185), Turn.Effect.${kind} (turnflow.mjs:53). runFollowUp (sequence.mjs:380-413) returns {status:'unknown'} for a kind core.followUps can emit with no branch. pentaryn-riders has an 'Adding a rider' section; combat has none.

**Proposed.**

Add README '## Extending' with four checklists (new setting; new turn rider; new follow-up kind; new special action) naming each file to touch, and test/i18n-complete.mjs wired from test/run.mjs.

**Behaviour test recipe (write first, must pass before and after).**

test/i18n-complete.mjs (node; reads ../lang/en.json and imports combat-core.mjs and settings.mjs). Verified in the snapshot to pass today: every DEFAULTS key has Setting.<k>.Name and .Hint; TURN_RIDERS keys sneak-attack, frenzy, colossus-slayer, divine-strike each have Rider.Name and Rider.Rule; Rider.ToggleHint/Mode for ask and auto; FollowUp and Kind keys for offhand, nick, flurry, martial-arts, hew, pole-strike, bonus, main; Turn.Effect for dash, disengage. Also source-scan sequence.mjs that every followUps kind appears in a runFollowUp kind check.

*Re-anchor addendum (28ccc87):* Corrected at 28ccc87 against lang/en.json: every one of the 30 DEFAULTS keys (26 at the snapshot, not 27) has Setting.<k>.Name and .Hint. FollowUp has offhand, nick, flurry, martial-arts, hew, pole-strike (+ NoFocus); Kind has nick, offhand, bonus, main, pole-strike; FollowUpText has offhand, offhand-dual-wielder, nick, flurry, martial-arts, hew, pole-strike. The snapshot recipe's 'FollowUp and Kind keys for all eight kinds' fails (FollowUp.bonus/main and Kind.flurry/martial-arts/hew do not exist), so derive each family from the values the code actually passes (source scan, or the core enums) before pinning; if a Kind is reachable with no key, that is a bug for the live-test workflow, not a test to weaken.

**Risk.** None; additive test and docs.

**Related:** combat-riders-15, combat-riders-20, combat-riders-17

## LLM interface

### combat-riders-11 — game.pentaryn.combat.inspect(ref): one read-only call for turn, plan, pips, follow-ups, riders, settings

**Category:** LLM interface · **Impact:** high · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; extended: followUpsNow now tags `via`, and there is more per-actor state to report)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:551–583`

**Anchor:** `function followUpsNow(actor, bonusPanel) {`

**Current.**

To learn what a character can do now an LLM calls plan, then turn, then raw flags and settings. Bonus-bar follow-ups cannot be read through the API because followUpsNow lives in hud.mjs (551-583) and depends on the Argon panel's currentActions (bonusFree = !ctx.inCombat || !bonusPanel || bonusPanel.currentActions !== 0, hud.mjs:556). Since the re-run it also tags each Off-hand entry with `via` (core.offhandVia, hud.mjs:568-570) for its tooltip. The re-run added per-actor state no API member returns: flags.pentaryn-combat.reaction ({combatId}, written at combat.mjs:126, reset at turnflow.mjs:210, read through core.reactionSpent), turn.quickened, and the damage-message flag `undone`. api.turn returns a fresh turn when the stored key is stale without saying so.

**Proposed.**

1. Move the body of followUpsNow to shapes.mjs as followUpsFor(actor, { bonusFree }); hud.mjs keeps a wrapper computing bonusFree exactly as today. 2. Add api.inspect(ref) returning plain JSON: actor {name, uuid}, key, inCombat, isOwnTurn, turn, stored flag, stale, plan (api.plan), pips (core.pipState), followUps (bonusFree derived from !turn.bonusUsed, documented as an approximation without the Argon panel), riders (ridersFor/riderDiceFor/riderMode/used), reckless, running, settings snapshot.

*Re-anchor addendum (28ccc87):* followUpsFor keeps the `via` tagging. inspect also returns `reaction: {flag, spent: core.reactionSpent(flag, combat?.id)}` and `spentPips: core.spentPips(turn)` (turn.quickened is already inside `turn`).

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs with Fighter/Rogue/Monk fakes. Characterise first: copy the old followUpsNow into the test, run with fake bonusPanel {currentActions:1} and {currentActions:0} in combat, and out of combat with no panel, for: no swings; after a Light main swing; after a Nick; Monk with focus 0 (disabled Flurry entry) and focus 2. Assert followUpsFor(actor,{bonusFree}) deepEquals it for the derived bonusFree. inspect(actor).plan deepEquals api.plan(actor); .turn deepEquals api.turn(actor); JSON.parse(JSON.stringify(inspect(actor))) deepEquals inspect(actor).

*Re-anchor addendum (28ccc87):* followUpsFor output, `via` included, deep-equals the old followUpsNow for a Dual Wielder with a non-Light off-hand and for a Light pair after Nick.

**Risk.** hud behaviour must remain identical; both currentActions fixtures pin the bonusFree derivation. inspect is additive.

**Related:** combat-riders-12, combat-riders-13, combat-riders-1

### combat-riders-12 — Resolve actor refs (doc | token | uuid | id | name) at the API boundary of combat and riders

**Category:** LLM interface · **Impact:** high · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; unchanged)

**Where:** `foundry/module/pentaryn-combat/combat.mjs:215–247`

**Anchor:** `const api = {`

**Current.**

Every combat API member assumes an Actor document: api.plan(undefined) throws a TypeError at its first unguarded dereference (combat.mjs:219-221: combatContext(actor), then `actor.type`); countFor dereferences actor.items/getFlag. Only riders report accepts a name. Passing an Actor where pentaryn-riders.battleMedic expects a Token yields a misleading 'no Hit Dice' warning.

**Proposed.**

Add resolveActor(ref) to shapes.mjs (Actor as-is; Token/TokenDocument -> .actor; string -> fromUuidSync, game.actors.get, game.actors.getName; else throw Error('pentaryn-combat: no actor for ' + String(ref))). Add withActor(fn) and wrap count, plan, turn, newTurn, multiattack, weapons, fullAttack, followUp, reckless, setReckless, fixFeats, seedWeaponSets, inspect. Copy the helper to pentaryn-riders (riders/resolve.mjs, no cross-module import) for featuresOf, report, setType, retireManual, installBattleMedic, spendHitDie, restoreHitDie, hdPools. Leave battleMedic's token argument semantics alone (a separate additive change if wanted).

**Behaviour test recipe (write first, must pass before and after).**

test/glue.mjs with stubs (class Actor {} so instanceof works; game.actors.get/getName; globalThis.fromUuidSync): resolveActor(a)===a; resolveActor({actor:a, documentName:'Token'})===a; uuid, id and name each ===a; resolveActor('nope') throws message starting 'pentaryn-combat: no actor'. Characterise: withActor(api.plan)(a) deepEquals the unwrapped api.plan(a) for Fighter and NPC fakes.

**Risk.** Invalid inputs get a clear Error instead of a TypeError (error-path message change only). All valid-input returns are unchanged.

**Related:** combat-riders-11, combat-riders-26

### combat-riders-13 — describe() and settings() on both namespaces, generated from existing tables

**Category:** LLM interface · **Impact:** high · **Effort:** M · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; 30 settings now)

**Where:** `foundry/module/pentaryn-combat/settings.mjs:12–48`

**Anchor:** `export const DEFAULTS = Object.freeze({`

**Current.**

No namespace describes itself. Eval-log failures include guessed setting keys (`pentaryn-riders.ritualAdept` is not registered; the real key is `rituals`). DEFAULTS (settings.mjs:12-48) now holds 30 keys (26 at the snapshot; the re-run added spellPips, quickenedSpell, helperTokenControl, enterUses). module.json declares flags.pentaryn.flagScope 'combat' (pentaryn-combat/module.json:22) and 'riders' (pentaryn-riders/module.json:16) but the real flag scopes are pentaryn-combat and pentaryn-riders; no code reads the module.json value.

**Proposed.**

Add api-manifest.mjs with a static METHODS array [{name,args,returns,writes,gm}]. Extract the api object literal (combat.mjs:186-218) into buildApi(deps) in api.mjs. Add api.describe() -> {module, version, flagScope, methods, settings: Object.keys(DEFAULTS), userFlags, events (combat-riders-14), patches (combat-riders-8)} and api.settings() -> Object.fromEntries(keys.map(k=>[k, setting(k)])). Same for pentaryn-riders (settings enabled, hdControls, rituals, concentrationSummons). Correct both module.json flagScope values.

*Re-anchor addendum (28ccc87):* The api object literal to extract is combat.mjs:215-247.

**Behaviour test recipe (write first, must pass before and after).**

test/api-manifest.mjs: buildApi(stubs); assert METHODS.map(m=>m.name).sort() deepEquals Object.keys(buildApi(stubs)).filter(k=>!['core','describe','settings'].includes(k)).sort() (drift guard); settings() with a game.settings stub returning false for 'fullAttack' equals {...DEFAULTS, fullAttack:false}. Python: extend scripts/tests/test_module_checks.py to assert each module.json flagScope equals the MOD literal in its core file for pentaryn-combat and pentaryn-riders.

**Risk.** Additive; buildApi must keep identical object keys, which the manifest test pins.

**Related:** combat-riders-11, combat-riders-14, combat-riders-15

## Documentation / skills

### combat-riders-15 — Fix README / melee.md / module.json drift (files, fixture count, API, flags, stacked off-hand)

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; partly addressed by the re-run's README edits, the drift items remain)

**Where:** `foundry/module/pentaryn-combat/README.md:158–166`

**Anchor:** `## Files`

**Current.**

The README Files paragraph (README.md:160-163) still omits turnflow.mjs; README.md:165 now says '298 fixtures' (249 at the snapshot) but `node test/run.mjs` reports 320 at 28ccc87; the API block (README.md:115-128) still lists 9 of the 23 api members. The re-run documented the new settings and the reaction, sweep and undone rows under Data written, but it still misses the reckless effect flag, the Steady Aim effect `special: steady-aim` and `.attack` on rider damage messages (death.failure is now documented at README.md:110). context/foundry/melee.md:21 still says a stacked pair 'gets no off-hand because the follow-up needs a different item id', while combat-core.mjs:129-133 partnerWeapon accepts the same item with quantity >= 2. module.json's description still lists only melee features (no turn flow, spell pips, Quickened Spell or helper-token control).

**Proposed.**

README: add turnflow.mjs and its sections to Files; replace the fixture count with 'see node test/run.mjs'; list all api members with return shapes (or generate from METHODS, combat-riders-13); add the missing flags. melee.md:21: replace with 'a stack of 2+ on one item line counts as two weapons for Light/Nick'. module.json: append a turn-flow summary to the description.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Add test/docs.mjs wired into test/run.mjs: parse README for `game.pentaryn.combat.(\w+)` and assert every METHODS name (or every key of the api literal until METHODS exists) appears; assert every *.mjs at the module root appears in the Files paragraph. It fails before the doc fix (lists turnflow.mjs and the missing members) and passes after.

**Risk.** None at runtime; the docs test guards future drift.

**Related:** combat-riders-13, combat-riders-16, combat-riders-28

### combat-riders-31 — Make side-effect entry points discoverable and graph-checked (turnflow in combat; rituals, concentration, argon-tidy in riders)

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **WAIT** (re-anchored to 28ccc87 on 2026-10-11; pentaryn-combat is still in wait.json)

**Status (28ccc87):** open (re-anchored; partly changed: turnflow is now a named import, the load-order constraint is unchanged)

**Where:** `foundry/module/pentaryn-combat/hud.mjs:22–24`

**Anchor:** `// Turn flow (special actions, Opportunity Attack, Esc, death saves, portrait, follow): its own hooks.`

**Current.**

module.json esmodules list only combat.mjs and hud.mjs (and riders.mjs for pentaryn-riders). turnflow.mjs is still loaded from hud.mjs:22-24, but since the re-run as a named import (`import { placeOpenDrawers } from "./turnflow.mjs"`, used in applyButtons, hud.mjs:142) rather than a bare side-effect import, so an import scan now sees a used edge. Its ~22 hook registrations (19 module-scope lines plus a three-hook loop) and three document keydown listeners still happen as an evaluation side effect, and the import position (before hud's body) is still load-bearing; the comment at hud.mjs:22 does not say so. pentaryn-riders' side-effect imports (rituals.mjs, concentration.mjs, argon-tidy.mjs) are re-anchored in riders.md. A file never imported would pass every gate.

**Proposed.**

1. Comment at each import site stating the order constraint. 2. README Files states load order. 3. Orphan/graph test. 4. Document the convention (new feature file imported from the entry file, listed in README Files, registered in adjustments.yml when it patches a third party) in context/foundry/ builder docs.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_module_graph.py using scripts/foundry/ops/jsscan.imports_of (exists at jsscan.py:303). For pentaryn-combat and pentaryn-riders: start from module.json esmodules, follow relative imports, assert the reachable set equals every *.mjs under the module dir except test/**, and pin the DFS order for combat as recorded when first run (starts combat.mjs, combat-core.mjs, settings.mjs, shapes.mjs ...). Passes today, fails when a file is added but never imported.

**Risk.** None; docs plus an additive test.

**Related:** combat-riders-6, combat-riders-7, combat-riders-25

## Added at the re-anchor to 28ccc87 (2026-10-11)

Findings the usability re-run introduced (new code with the same kind of problem as an audited one, not covered by extending an existing finding). Same fields and rules as above.

### combat-riders-36 — Combat re-derives pentaryn-aoe internals: the cancelled-placement test and the handle-token flag

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **WAIT** (added at the re-anchor to 28ccc87 on 2026-10-11; pentaryn-combat and pentaryn-aoe are both in wait.json)

**Status (28ccc87):** new — introduced by the usability re-run (17275c9).

**Where:** `foundry/module/pentaryn-combat/combat.mjs:262–265`

**Anchor:** `    // An area spell whose placement was cancelled was not cast (pentaryn-aoe refunds it): no pip, no Action.`

**Current.**

combat.mjs:262-265 (the dnd5e.postUseActivity registration inside setup) skips onPostUseActivity when `usage?.create?.measuredTemplate && activity?.target?.template?.type && !(results?.templates?.length) && canvas?.scene`. That is a hand copy of part of pentaryn-aoe's refund test (pentaryn-aoe/refund.mjs:31-61, core.placementCancelled at pentaryn-aoe/core.mjs:446). aoe refunds only when its setting refundCancelledArea is on, the usage message is the user's own, something was consumed or an effect began, and the user may create regions. Combat skips the Action pip whenever its partial copy matches, including the cases where aoe did not refund (setting off, nothing consumed, no REGION_CREATE): the slot stays spent and no Action is counted. The adjustments row dnd5e-cancelled-area-refund says combat counts no Action "(setting refundCancelledArea)", but combat never reads that setting. Second copy: turnflow.mjs:316 reads `doc.flags["pentaryn-aoe"].handle` raw; aoe's own reader is isHandle (pentaryn-aoe/areas.mjs:28). C23 checks only settings reads, so the scorer misses both (riders.mjs:377's aoe settings read is the C23 case).

**Proposed.**

Behaviour-neutral first: 1. Move combat's expression into combat-core as `areaPlacementSkipped({ wanted, placed, onScene })` with today's exact semantics and a comment naming pentaryn-aoe/refund.mjs as the rule it mirrors; combat.mjs:264 calls it. 2. Add `isAoeHandle(flags)` to shapes.mjs (`!!flags?.["pentaryn-aoe"]?.handle`) and use it at turnflow.mjs:316. 3. Record the contract as a cross-module row in adjustments-batch.md (like transform-reads-combat-multiattack) and correct the dnd5e-cancelled-area-refund row's `what` text. Later, as a declared change once both WAIT modules migrate: read aoe's own decision (a published `placementCancelled`/`refunded` API member or a `pentaryn-aoe.refunded` event) so combat skips the pip exactly when aoe refunded; hand the "aoe refund off → no pip spent" divergence to the live-test workflow.

**Behaviour test recipe (write first, must pass before and after).**

Core: areaPlacementSkipped over wanted ∈ {true,false} × placed ∈ {0,1} × onScene ∈ {true,false} equals the inline expression copied verbatim from combat.mjs:264 (8 cases; pin {wanted:true, placed:0, onScene:true} → true). Glue with stubs: activity {target:{template:{type:"sphere"}}, actor}, usage {create:{measuredTemplate:true}}, results {templates:[]}, canvas.scene set → the updateTurn spy is not called; results {templates:[{}]} → called once. isAoeHandle({"pentaryn-aoe":{handle:true}}) true, ({}) false, (undefined) false; the deleteToken handler with a stub handle token gives the same `control` spy calls before and after. A fixture commented `KNOWN: combat skips the pip when aoe's refundCancelledArea is off` pins today's divergence.

**Risk.** The move is mechanical and truth-table pinned. Reading aoe's decision is a behaviour change and waits for both modules.

**Related:** combat-riders-13, combat-riders-17; C23 (riders.mjs:377)

### combat-riders-37 — Timer-sequenced behaviour: name every delay and pin the ordering between them

**Category:** Hardening · **Impact:** medium · **Effort:** S · **WAIT** (added at the re-anchor to 28ccc87 on 2026-10-11)

**Status (28ccc87):** new — most of these timers came with the usability re-run.

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:223–229`

**Anchor:** `  for (const ms of plan.recheck) setTimeout(() => {`

**Current.**

Several features rely on setTimeout delays chosen to land after something else, and the relations live only in comments: turnflow.mjs:227-229 looks again at 300 and 1200 ms after combat start to follow the HUD once Argon's own bind is done (the delays come from core.hudFollowPlan, combat-core.mjs:1187, so the C26 scan, which reads literal delays, misses this readiness wait); turnflow.mjs:291 the controlToken bind at 150 ms (C26 flags this one; S6c turns it into a debounce); sequence.mjs:356 tidyOrigins at 400 ms, which must run after the closeAttackRollConfigurationDialog tidy's own 250 ms look (turnflow.mjs:400): two literals in two files with a must-exceed relation; turnflow.mjs:284 the orphan-flag sweep 1500 ms after deleteCombat, after the per-combatant cleanup chain (turnflow.mjs:248-259) has had time to run; turnflow.mjs:375 pressUse's 400 ms fallback; strip.mjs:236 the 150 ms focus retry; turnflow.mjs:832 the 50 ms movement redraw; hud.mjs:938 restorePips 0 ms after Argon's own updateCombat handler; offhand.mjs:78 the 500 ms weapon-set seed after createActor.

**Proposed.**

Behaviour-neutral: a frozen `DELAYS` table in combat-core, one entry per site with a one-line reason (`hudFollowRecheck: [300, 1200]`, `followLeft: 150`, `tidyLook: 250`, `tidyAfterSequence: 400`, `orphanSweep: 1500`, `useFallback: 400`, `focusRetry: 150`, `movementRedraw: 50`, `seedAfterCreate: 500`); every setTimeout reads its entry and hudFollowPlan returns `DELAYS.hudFollowRecheck`. Event-driven replacements (an Argon bind signal instead of the 300/1200 ms look, awaiting the cleanup chain instead of 1500 ms) are declared changes for the live-test workflow. Tooling lane, optional: let C26 resolve a delay read from a core table so the readiness waits are visible to the scorer.

**Behaviour test recipe (write first, must pass before and after).**

Core: `Object.isFrozen(DELAYS)`; `DELAYS.tidyAfterSequence > DELAYS.tidyLook`; `hudFollowPlan({enabled:true, owner:true, onScene:true, argonOn:false, combatStart:true}).recheck` deep-equals [300, 1200] (today's literal). Glue with a setTimeout recorder: a sequence ending with one created usage card schedules one 400 ms timer; a deleteCombat on the GM schedules one 1500 ms timer; a combat-start combatTurnChange for an owned token schedules [300, 1200]; pressing Enter in a usage-window number box schedules one 400 ms timer. The recorded delay list is equal before and after. Source gate after the change: no numeric literal ≥ 50 as a setTimeout delay in the module outside combat-core's DELAYS.

**Risk.** None at runtime if every value is copied; the recorder pins them.

**Related:** combat-riders-30, combat-riders-7; C26 (migration S6c)

### combat-riders-38 — End-of-combat flag cleanup writes once per key, then scans every world actor again

**Category:** Performance gains · **Impact:** low · **Effort:** S · **WAIT** (added at the re-anchor to 28ccc87 on 2026-10-11)

**Status (28ccc87):** new — introduced by the usability re-run (17275c9, 4f9224f).

**Where:** `foundry/module/pentaryn-combat/turnflow.mjs:261–285`

**Anchor:** `async function clearCombatFlags(actor, combatId) {`

**Current.**

On deleteCombat the active GM runs, per combatant, sweep(turnEnd) → sweep(turnStart) → clearCombatFlags (turnflow.mjs:248-264), which awaits one actor.unsetFlag per stale key (turn, reaction): up to two Actor updates per actor. 1500 ms later sweepOrphanFlags (turnflow.mjs:271-280, scheduled at 283-285) walks every world actor and unsets each orphan key the same way, one awaited write per key; it also runs on every GM load (turnflow.mjs:282). Each unsetFlag is a separate update round trip and fires every updateActor listener: hud.mjs:812 (refreshAll, checkBars, recheckSlots for the HUD actor), riders.mjs:491 (rerenderCards on `-=turn`) and turnflow.mjs:838. After a combat in which six PCs took Reactions that is up to 12 writes for the cleanup alone.

**Proposed.**

One helper `dropCombatFlags(actor, keys)` that removes all of an actor's stale keys in a single actor.update, using the same deletion form Document#unsetFlag uses in the live core (read it first; riders.mjs:491 listens for `flags.pentaryn-combat.-=turn`, so the change object must keep that shape). clearCombatFlags and sweepOrphanFlags both call it. Keep the 1500 ms timer and the ready sweep: removing either is a behaviour change.

**Behaviour test recipe (write first, must pass before and after).**

Glue with stub actors whose update/unsetFlag are spies: A {turn:{key:"c1:1:x"}, reaction:{combatId:"c1"}}, B {turn:{key:"nocombat"}}, C {reaction:{combatId:"gone"}}; live combats ["c2"]; the stub user is the active GM. Before: sweepOrphanFlags() resolves 3 and records 3 unsetFlag calls. After: it still resolves 3, the final flags are equal (A has neither key, B keeps its turn, C has no reaction), and the actor writes drop to 2 (one per actor). The change object seen by a stub updateActor listener for A contains the `-=turn` path the riders listener tests. clearCombatFlags(A, "c1") likewise ends with the same flags in one write.

**Risk.** Using a different deletion form than unsetFlag would stop the riders listener from firing; the change-object assertion pins it.

**Related:** combat-riders-1, combat-riders-37
