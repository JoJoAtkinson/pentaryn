---
title: Migration guide — pentaryn-combat to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, pentaryn-combat]
---

# Migrating `pentaryn-combat` to the addon blueprint

> **Migrated in the wave-4 code phase (2026-10-11, `migrate/wave-4`): see Result.** Nothing is live yet.

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

> **Re-anchored again for wave 4 (2026-10-11, base `a5a1a906`):** since 28ccc87 only PT1-6 touched the
> module (`d7a7c7b6`, `99102603`): `hud.mjs:157` `TT` gained `pentaryn-combat-tt` (same line), and
> `styles/combat.css` gained 15 lines after `:47` (already reflected below). No `.mjs` line moved, so
> every JS anchor in this guide holds. Live score at the base: 50.0 % (23/46): the scorer now has 46
> fail-class rules (42 when §1 was written) and the 23 failing are exactly §1's (C59 is a new warning).
> Checkpoint below.

**Read this when:** you are about to restructure `foundry/module/pentaryn-combat` to the blueprint,
or you need to know which 2026-10 audit findings (`combat-riders-*`) the restructure absorbs and
which stay separate fixes. **Not this file:** the general procedure is in
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8. The rules and kit are
in the same file and in `foundry/lib/README.md`. The order across modules is in
[`migration-order.md`](migration-order.md).

> **Re-anchored to 28ccc87 on 2026-10-11.** Every line number in this file now cites HEAD
> 28ccc87 (the usability re-run commits 17275c9 and 4f9224f; the working tree equals HEAD for this
> module). The snapshot numbers (pentaryn `ee505c2` plus the uncommitted changes of 2026-10-10
> 20:15 EDT, `…/scratchpad/audit-snapshot/pentaryn/module/pentaryn-combat`) are superseded; where a
> step quotes one for history it says "snapshot". `turnflow.mjs` is committed now. The re-run grew
> `combat-core.mjs` 1025 → 1240 lines (68 → 81 exports), `hud.mjs` 884 → 970, `turnflow.mjs`
> 607 → 841, `sequence.mjs` 379 → 437, `riders.mjs` 461 → 501, `strip.mjs` 306 → 361 and the
> settings 26 → 30; `shapes.mjs` and `offhand.mjs` are unchanged. The audit file
> [`../code-audit-2026-10/combat.md`](../code-audit-2026-10/combat.md) was re-anchored in the same
> pass and gained combat-riders-36…-38 (§4).

> **WAIT: yes.** `pentaryn-combat` is listed in `scripts/foundry/blueprint/wait.json` (melee
> live-test workflow). It is also the last module in the migration order, and `argon-kit` is
> written here first (Wave 8.6). **Every step below must be re-anchored against the live tree
> again if HEAD has moved on this module since 28ccc87.**

Re-anchor procedure, run once before step 1 and again before any step that waits more than a day:

```sh
git diff 28ccc87 -- foundry/module/pentaryn-combat            # plus `git status` for untracked files
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module pentaryn-combat --markdown
```

For each step, grep its **anchor** strings (quoted below) in the live file. Do not trust a line
number. If an anchor has gone, re-read the finding's Current text in
[`../code-audit-2026-10/combat.md`](../code-audit-2026-10/combat.md) (re-anchored to 28ccc87; the
`…/blueprint-inputs/audit-findings.json` copy still holds the snapshot text) and re-decide.

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | K5 `buildApi` freezes a copy — **landed** (kit 1.0.1) |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **Re-scored live at 28ccc87 on 2026-10-11** (`conformance.py --module pentaryn-combat`): 45.2 % (19/42), the same rules fail as on the snapshot; the details below are the live ones. |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance at 28ccc87 (live, re-scored 2026-10-11): 45.2 % (19 of 42 fail-class rules pass)

Scored with `conformance.py --module pentaryn-combat` against the live module folder. Tier: full.
The snapshot score was the same 45.2 % (19/42) with the same failing set; only the details moved.

| Rule | Status | Detail (28ccc87) | Cleared by step |
|---|---|---|---|
| C01 id == folder | pass | | — |
| C02 minimum 14 (warn) | pass | | — |
| C03 dnd5e relationship | pass | | — |
| C04 languages | pass | | — |
| C05 all `.mjs` reachable | pass | `turnflow.mjs` is reached from `hud.mjs:24`, now a named import (`placeOpenDrawers`) whose module body still registers its hooks | keep passing (S6) |
| C06 styles exist | pass | | — |
| C06w styles under `styles/` (warn) | pass | | — |
| **C07** `flags.pentaryn` | **fail** | no tier/namespace/cssPrefix; `flagScope: "combat"` | S15 (Wave 7 restart batch) |
| C08 socket | pass | | — |
| C09 recommends/reasons | pass | | — |
| C10 sizes (warn) | warn | combat-core 1241/600, combat.mjs 280/150, hud.mjs 971/150, riders.mjs 502/500 (new: over the feature cap), turnflow 842/500 | S6, S12 |
| C11 pure core | pass | | keep (S2, S12) |
| **C12** one `MODULE` | **fail** | `const MOD` ×8 (combat-core:30, combat:33, hud:26, offhand:21, riders:22, sequence:20, shapes:8, turnflow:25) | S2, S3 |
| C13 no stray `.md` | pass | | — |
| **C14** kit vendored | **fail** | no `lib/kit.lock.json` | S1 |
| **C15** `import * as` | **fail** | `sequence.mjs:17 import * as strip` | S3 |
| C16 import direction | pass* | *passes only because offhand/riders/sequence/turnflow are "glue" (unclassified) | S6 (classified, `graph-allow.json`) |
| **C17** hooks only in entry | **fail** | 41 module-scope `Hooks.on/once` by the scanner's count (32 at the snapshot) in hud.mjs (18 lines + 3 loops), turnflow.mjs (19 lines + 1 loop), strip.mjs (:275-278) | S6 |
| **C18** features export install/uninstall | **fail** | no feature files | S6 |
| **C19** emitted names | **fail** | `pentarynCombat.*` ×10 emits: combat:89, 90, 127 (`reaction`, new), 137, 149, 165 (`otherAction`, new); sequence:306, 359, 398, 408 | S9 (declared B2) |
| **C20** `golden/hooks.json` | **fail** | | S1 |
| **C21** settings get/register only in settings.mjs | **fail** | hud:214, hud:254, riders:377, turnflow:196 | S5 |
| **C22** `SETTINGS` exported | **fail** | `DEFAULTS` object only (30 keys) | S5 |
| **C23** no foreign pentaryn settings | **fail** | `riders.mjs:377` reads `pentaryn-aoe.autoDamageOnHit` | S11 (**blocked on aoe publishing `settings()`**) |
| **C24** no empty catch | **fail** | 27 sites (19 at the snapshot): hud:41, 96, 251, 531, 765, 832, 933, 938, 956, 963; riders:36, 189, 426, 446; sequence:178; settings:59; strip:240, 241, 272; turnflow:34, 593, 719, 730, 738, 753, 787, 824 | S4 |
| C25 console prefix | pass | | — |
| **C26** no readiness timers | **fail** | `turnflow.mjs:291` `setTimeout(…,150)` in `controlToken`. Not flagged but of the same kind: the 300/1200 ms HUD-follow recheck (`turnflow.mjs:227`, delays from `core.hudFollowPlan`), see combat-riders-37 | S6c |
| **C27** api-manifest + buildApi | **fail** | | S7 |
| **C28** describe/surface goldens | **fail** | | S7 |
| **C29** inspect() when writing actor flags | **fail** | writes `flags.pentaryn-combat.turn/last/reaction/swing…`, no `inspect` | S7 |
| C30 queries guarded | pass | no queries | — |
| C31 writes ok/fail (manual) | manual | all 23 members are legacy shapes | S7 (rows `legacy:true`) |
| **C32** patches via wrapMethod | **fail** | turnflow:462, 463 (portrait), 498 (PreciseText destroy), 518 (PreciseText x/y accessors, new), 536, 561 hand patches (the pip settle at :797-812 is the sixth; the scan misses it); 34 combat adjustments rows (25 at the snapshot) name no wrapMethod | S6c, S13 |
| C33 private access rows (manual) | manual | hud: `ui.ARGON._` ×3, `panel._buttons` ×9, `CONFIG.ARGON` ×2, `_on*` ×4; turnflow: `ui.ARGON._` ×2, `CONFIG.ARGON` ×2, `_on*` ×4 (plus `_hudState` :776 and `components.movement` :820-825, which the scan does not count); 35 rows for this module | S13 |
| C34 nested lang, one root | pass | | — |
| **C35** no two-branch i18n wrapper, ≥ 90 % definite | **fail** | `T()` wrapper ×5 (hud:28, riders:23, sequence:21, strip:12, turnflow:26); 38 % (68/178) | S4 |
| C36 hard-coded English (warn) | warn | combat-core:491, 495, 497 | S12 (manual review) |
| C37 CSS prefix | pass | | — |
| C37w `!important` (warn) | warn | 2 (`combat.css:46`, `:202`) | `:46` goes with the dead rule (S10); `:202` stays (removing it is declared B5) |
| C38 cssPrefix unique | n/a | no cssPrefix yet | S15 (`pc-`) |
| C39 run.mjs + node-test | pass | | — |
| **C40** tier test files | **fail** | no core/glue/hooks/api/i18n `.test.mjs` | S1, S7 |
| **C41** VERSION test | **fail** | | S2 |
| C42 fixtures synthetic (manual) | n/a | no `test/fixtures` | S1 |
| **C43** fixed run.mjs / LEGACY | **fail** | self-running `check()` suite (320 fixtures) | S1 |
| **C44** README order | **fail** | 12 sections missing or out of order | S14 |
| **C45** CHANGELOG | **fail** | | S14 |
| C46 routed use-doc | pass | `context/foundry/melee.md` | — |
| C47 adjustments rows per package | pass | | — |
| C48 reserved names | pass | none of the 23 members is reserved | — |
| C49 hot hooks (warn) | pass | `renderActionPanelArgonComponent` handlers do no world iteration (now three combat listeners: turnflow:168, hud:739, hud:931) | keep (`// hot:` comments in S6b) |
| C50 publish timing | n/a | | S7 (`when: "ready"`) |
| C51 literal setting labels | n/a | | S5 |
| C52 `legacyName` has `until` | pass | no HOOKS table yet | S9 |

**Projected after S1–S14 (before Wave 7):** every fail-class rule passes except C07 (module.json
batch) and C23 (aoe has not published a `settings()` member yet). C38, C50 and C51 become
applicable and pass.

---

## 2. Target layout vs today

Module id, namespace (`combat`), flag scope (`pentaryn-combat`, which the code already uses:
`combat-core.mjs:30`), i18n root `PENTARYN_COMBAT` and the setting keys `pentaryn-combat.<key>`
all stay the same. **Two entries stay** (D11): `combat.mjs` = `esmodules[0]` and `hud.mjs` =
`esmodules[1]`. Collapsing them into one is Wave 8 work. It needs the cross-module order fixture
(`foundry/lib/test/fixtures/hook-order.mjs`) because hoisted imports would move hud's
registrations ahead of combat.mjs's body. It is declared change B3 and is **not** part of this
guide.

### 2.1 Old file → new file (28ccc87 line ranges)

| Old (28ccc87 lines) | Content | New file (role) |
|---|---|---|
| `combat.mjs:1-33` | header, imports, `const MOD` | `combat.mjs` ENTRY: file map, `FEATURES` order, ctx, phase wiring |
| `combat.mjs:35-177` | swing counting (`lastTag`, `mySwings`, `weaponLike`, `kindOf`, `onPreRollAttack`, `onPostRollAttack`, `onPostUseActivity` incl. the re-run's Quickened Spell / Reaction / Quickened-cast branches :114-140, `onUpdateActor`) | `counting.mjs` (feature; installed inside `setup`, as today) |
| `combat.mjs:48-52` `weaponLike` + `riders.mjs:45-49` `isWeaponAttack` | the same predicate | `shapes.mjs` `isWeaponAttack` (combat-riders-4) |
| `combat.mjs:179-196` | `onPreRollDamage` (TWF/GWM) | `weapon-bonus.mjs` (feature; `setup`) |
| `combat.mjs:198-211` | `fixFeats` | `api.mjs` impl |
| `combat.mjs:215-247` | `const api = {…}` (23 members) | `api-manifest.mjs` rows + `api.mjs` impl + feature contributions |
| `combat.mjs:249-253` | `publish()` frozen-root guard | `lib/publish.mjs` `publishNamespace` |
| `combat.mjs:255-277` | `init`/`setup`/`ready`; the setup `postUseActivity` registration carries the re-run's cancelled-area skip (:262-265) | ENTRY wiring; `seedAll` keeps its one-tick deferral; the skip → `core.areaPlacementSkipped` (combat-riders-36) |
| `combat.mjs:279` | `export { attackActivityOf }` (dead) | deleted (combat-riders-34) |
| `hud.mjs:1-33` | header, imports, `import { placeOpenDrawers } from "./turnflow.mjs"` (:24) | `hud.mjs` ENTRY #2: installs the turnflow features, then the hud features, synchronously, in today's order |
| `hud.mjs:35-157` | tooltip helpers, `dropStrayTooltip` + its capture `pointerover` listener (:84-98, new), `paintBadge`, `applyButtons` (calls `placeOpenDrawers`, :142), `itemButtonClass`, `mainPanel`, `TT` | `argon.mjs` ADAPTER, using the fixed argon-kit signatures (`dropTooltip()`, `paintBadge(button, left, emptyClass)`, `applyButtons(panel, buttons, {attachDetached})`, `itemButtonClass()`, `mainPanel(label)`, `settlePips(panel)`); the `pointerover` listener → `hud/tooltips.mjs` `install` |
| `hud.mjs:104-106` | tooltip-drop hook loop (5 hooks) | `hud/tooltips.mjs` feature |
| `hud.mjs:159-209` | `multiattack`, `fullAttackState`, `weaponTile`, `chooseWeapon` | `shapes.mjs` `planFor(actor, {multiattackOn})` (combat-riders-21) + `hud/bars.mjs` (UI parts) |
| `hud.mjs:211-236` | `argonPickerOn`, `releaseTargets`, `registerTargetPicker(...)` | `hud/picker.mjs` feature; `releaseTargets` → `argon.mjs` (one copy, combat-riders-5) |
| `hud.mjs:238-279` | picker tutorial and cursor cue (module-scope `document` listeners :266-267, MutationObserver :268-275) | `hud/picker.mjs` (listeners installed in `install`) |
| `hud.mjs:281-457` | `argonClasses()` (four button classes) | `hud/buttons.mjs` (ui) |
| `hud.mjs:459-490` | `overridePips` | `hud/pips.mjs` (ui) |
| `hud.mjs:492-547` | `SIGS`, `checkBars`, `composeActionBar` | `hud/bars.mjs` |
| `hud.mjs:549-735` | `followUpsNow` (now tags `via`, :568-570), Pole Strike gate, Bonus/Special bars, `hideDuplicateSlots`, `pulseNew` | `hud/bars.mjs`; `followUpsNow` body → `shapes.mjs` `followUpsFor(actor, {bonusFree})` (combat-riders-11) |
| `hud.mjs:737-889, 940-970` | the hud hooks, `rerender`, `refreshAll`, `forgetButtons`, `refillWeaponSlots` | `hud/bars.mjs` `install()`; registration order kept literally |
| `hud.mjs:890-939` | spell pips: `pentarynCombat.otherAction` / `.reaction` listeners, `restorePips`, its `renderActionPanelArgonComponent` (:931) and `updateCombat` (:936) listeners (new) | `hud/pips.mjs` `install()`, registered at the same position between the bar hooks (the hooks golden pins it) |
| `turnflow.mjs:18-35` | imports, `MOD`, `T`, `mainPanel`, `paint` | removed (`argon.mjs` `mainPanel`, `settlePips`) |
| `turnflow.mjs:37-175` | Argon special actions + Reaction slot + the **one** `renderActionPanelArgonComponent` listener (:168) | `turnflow/action-buttons.mjs` (keep **one** listener: splitting it changes the per-hook listener list) |
| `turnflow.mjs:177-247, 286-297` | sweeps (now also Reckless expiry), `releaseTargets` copy, `argonOn`, `combatTurnChange` (Reaction reset :210, `closeDrawersOf` :212, `hudFollowPlan` + rechecks :215-229), `followTo`, `controlToken` | `turnflow/boundaries.mjs` |
| `turnflow.mjs:248-285` | end-of-combat cleanup: per-combatant sweep + `clearCombatFlags`, `sweepOrphanFlags`, `once(ready)` sweep, second `deleteCombat` (new) | `turnflow/cleanup.mjs` (registered between boundaries' `deleteCombat` and `controlToken`, as today) |
| `turnflow.mjs:299-330` | helper-token re-select on `deleteToken` (new, `helperTokenControl`) | `turnflow/helper-token.mjs` |
| `turnflow.mjs:332-410` | Esc keydown (:344), Enter-uses keydown + `pressUse` (:356-390, new, `enterUses`), cancelled-card tidy (:392) | `turnflow/dialogs.mjs` (Esc listener, then Enter listener: same `keydown` order) |
| `turnflow.mjs:412-437` | death saves at 0 HP | `turnflow/death.mjs` |
| `turnflow.mjs:439-482` | portrait conditions (`patchPortrait`, hand patch :458-481) | `turnflow/portrait.mjs` (feature; exposes `portraitExtrasFor`) + `patches.mjs` (the wrap) |
| `turnflow.mjs:484-563` | PreciseText `destroy` and `x`/`y` (new) / createScrollingText / ChatLog.notify guards (two `init` hooks) | `patches.mjs` |
| `turnflow.mjs:565-607` | manual dice: resolver focus (:587), digit keydown (:597) | `turnflow/dialogs.mjs` (after the Esc and Enter listeners: same `keydown` order) |
| `turnflow.mjs:609-678` | self effects (dnd5e 6 `getEffect()`), Steady Aim (:663, :669) | `turnflow/effects.mjs` |
| `turnflow.mjs:680-788` | drawer placement (per-instance `panel.toggle` wrap), `placeWhenLaidOut`, exported `placeOpenDrawers`, `closeDrawersOf` (new) | `turnflow/drawers.mjs` (hud's `placeOpenDrawers` import points here) |
| `turnflow.mjs:790-812` | `ActionPanel.prototype.updateActionUse` settle patch (`_pcSettles`) | `patches.mjs` |
| `turnflow.mjs:814-841` | Argon movement readout redraw: effect-hook loop, `updateActor`, `combatTurnChange` (new) | `turnflow/movement.mjs` |
| `combat-core.mjs:1-1240` | pure core, 81 exports | `combat-core.mjs` barrel + `core/{identity,count,weapons,sequence,turn,followups,turn-riders,damage,multiattack,turnflow,layout}.mjs` (combat-riders-20 lists homes for the 13 new exports); adds `MODULE`, `SHORT`, `NS`, `VERSION`, `CONTRACT`, `I18N`, `CSS`, `HOOKS` |
| `settings.mjs:12-48` `DEFAULTS` | 30 boolean world settings | `settings.mjs` `SETTINGS` rows (literal `name`/`hint`), `DEFAULTS` derived |
| `settings.mjs:50-71` | `registerSettings`, `setting` | `defineSettings`, `settingReader` (kit) |
| `settings.mjs:73-91` | quick / rider-mode user flags | unchanged (user flags) |
| `offhand.mjs:25-34` | `resetOffhandMode` (writes dnd5e item flag) | `shapes.mjs` (adapter write) |
| `offhand.mjs:36-72` | weapon-set seed (`flags.enhancedcombathud.weaponSets`) | `argon.mjs` (adapter: `readSets`, `seedWeaponSets`, `seedAll({enabled})`) |
| `offhand.mjs:74-80` | `createActor` hook | `offhand.mjs` feature (`setup`) |
| `riders.mjs:1-501` | once-per-turn attack-card riders (now with the Undone strike-through, `rerenderShowing`) | **renamed** `turn-riders.mjs` feature (combat-riders-17); `isReckless`, `riderActivity`, `riderDiceFor` (:64-72, :100-114, pure reads) → `shapes.mjs`; `report` → contribution |
| `sequence.mjs:1-414` | Full Attack runner (now with `swapExtras`, `closeSwingWindow`, `tidyOrigins`), follow-ups, strip driving, roll tagging | `sequence.mjs` feature (runner; contributes `fullAttack`, `followUp`, `running`, `abort` rows); `tidyOrigins` shares `dialogs` `tidyUsageCard` (combat-riders-5) |
| `sequence.mjs:421-435` | `fullAttackPlan` | `core/sequence.mjs` `fullAttackPlanFrom(...)` + a thin wrapper in `sequence.mjs` (combat-riders-22) |
| `sequence.mjs:437` | `export { weaponShape }` (dead) | deleted (combat-riders-34) |
| `strip.mjs:1-138, 280-361` | swing strip, weapon picker | `strip.mjs` (ui) |
| `strip.mjs:139-278` | roll-window docking, focus (`focusRollWindow`, :201-237, new), `keepOnScreen` (:255-263, new) and its four module-scope hooks (:275-278) | `roll-dock.mjs` feature, installed **first** in `combat.mjs`'s body (today these four register while combat.mjs's import graph evaluates, before its body; nothing in between registers a hook); `focusRollWindow` stays exported for sequence |
| `shapes.mjs` | Foundry → plain data | `shapes.mjs` ADAPTER (no `settings.mjs` import: callers pass setting values in) |
| — | — | `api-manifest.mjs`, `api.mjs`, `patches.mjs`, `lib/*`, `lib/kit.lock.json`, `test/{core,glue,hooks,api,i18n}.test.mjs`, `test/golden/*`, `test/fixtures/*`, `test/graph-allow.json`, `CHANGELOG.md` |
| `test/run.mjs` (713 lines, `check()` suite) | 320 core fixtures | `test/core-fixtures.mjs`, listed in `LEGACY`; `test/run.mjs` becomes the fixed body |

### 2.2 Install order (the hooks golden pins this)

Per-hook listener order is the only order Foundry exposes. These three stay byte-identical:

1. **Module evaluation, combat.mjs graph:** `roll-dock.install` (today `strip.mjs:275-278`), then
   `combat.mjs` body `once(init)`, `once(setup)`, `once(ready)`.
2. **Module evaluation, hud.mjs graph:** turnflow features in 28ccc87 order (action-buttons,
   boundaries `combatTurnChange` + `deleteCombat`, cleanup `once(ready)` + `deleteCombat`,
   boundaries `controlToken`, helper-token `deleteToken`, dialogs (Esc, Enter-uses keydown,
   tidy), death, portrait `once(ready)`, patches `once(init)`×2, dialogs (resolver), effects,
   drawers, patches `once(ready)` pip settle, movement), then hud features (tooltips `pointerover`
   :98 and loop :104, picker `once(ready)` ×2 + setting hooks :277, bars :739-889, pips :892-936,
   bars :943-967).
3. **`setup`:** counting (preRollAttackV2, postRollAttack, postUseActivity), weapon-bonus
   (preRollDamageV2), counting (updateActor), turn-riders (`riders.mjs:472-500`, now incl.
   `combatTurnChange`/`deleteCombat` for `rerenderShowing`), offhand
   (createActor).

A turnflow feature cannot have one file per concern if that would interleave one hook name
differently. Today `turnflow.mjs` registers the two `once("init")` patches between the Esc /
Enter-uses listeners and the resolver listener, and `deleteCombat` twice (boundaries :248, cleanup
:283) with `once(ready)` between them, and the hook-name order above is what must hold. So
`patches.mjs` exposes `installInit(reg)` and `installReady(reg)` separately, and the entry calls
them at today's positions.

### 2.3 Allowed exceptions (`test/graph-allow.json`)

The runner (`sequence.mjs`) and `turn-riders.mjs` are features that other features call directly
today. The target is a `ctx.exposed` accessor. Until then, these rows document the exceptions:
`hud/bars.mjs → sequence.mjs`, `hud/buttons.mjs → sequence.mjs`, `hud/picker.mjs → sequence.mjs`
(`registerTargetPicker`), `turnflow/action-buttons.mjs → sequence.mjs` (`expectRoll`,
`forgetRoll`, `running`), `counting.mjs → sequence.mjs` (`taggedKind`, `forgetRoll`),
`hud/buttons.mjs → turn-riders.mjs` (`setReckless`) and, since the re-run, `argon.mjs` (or
`hud/bars.mjs`, wherever `applyButtons` lands) `→ turnflow/drawers.mjs` (`placeOpenDrawers`). Each row carries a `reason`. The API never
imports a feature: `fullAttack`, `followUp`, `running`, `abort`, `offers`, `rollRider`,
`setReckless` and `report` come in as **contributions** from `sequence.mjs` / `turn-riders.mjs`
`install()`.

---

## 3. Steps

Every step is behaviour-neutral unless it is marked **[declared]**. Each step lists the
characterisation test to write **before** the code move, run green against the unchanged code
(`GOLDEN_UPDATE=1` for that file only). The refactor diff must leave `test/golden/` and the
characterisation tests untouched. Gates after each step: `make foundry-combat-check`,
`vendor.py check pentaryn-combat`, `conformance.py --module pentaryn-combat`, and
`make foundry-adjustments-check` whenever a marker moves.

### S0 — Re-anchor (WAIT gate)
Run the procedure at the top. Re-score live. **Done once on 2026-10-11 against 28ccc87** (§1 and
§2.1 carry those ranges); repeat only the diff against 28ccc87 if HEAD has moved on this module.
**Absorbs:** none.

### S1 — Vendor, test layout, characterisation (checkpoint commit)
- `vendor.py sync pentaryn-combat --tier full --kit election,patch,perf` (no `patch-libwrapper`,
  no `argon-kit`: deferred, D7).
- Move `test/run.mjs` → `test/core-fixtures.mjs` without changing its content. Write the fixed
  `run.mjs` (use-doc §6) with `LEGACY = ["test/core-fixtures.mjs"]`.
- New fixtures: `test/fixtures/dom.mjs` (a `document` with `add/removeEventListener` recorders,
  `body.classList`, `hidden`, and `MutationObserver` / `customElements` recorders),
  `test/fixtures/argon.mjs` (`ui.ARGON` with `_actor`, `_token`, `_tooltip`, `components`,
  `collapseAllPanels`; `CONFIG.ARGON.MAIN.ActionPanel`, `BUTTONS.*`, `PORTRAIT.PortraitPanel`
  classes), `test/fixtures/actors.mjs` (Fighter with Extra Attack, Longsword `ver`/sap and
  Dagger `lgt fin thr`/nick; Rogue with a Nick pair and Sneak Attack; Monk with focus 0 and 2;
  NPC with Multiattack "makes two [[/item .bite]] attacks"; a polymorphed character), all built
  with `makeDoc`.
- `test/fixtures/legacy-*.mjs` oracles, copied verbatim from the code at migration time (28ccc87
  lines): `weaponLike` (combat:48-52), `isWeaponAttack` (riders:45-49), `followUpsNow`
  (hud:551-583, including the `via` tagging), `api.plan` (combat:218-224), `fullAttackState`
  (hud:166-183), `fullAttackPlan` (sequence:421-435), `renderAutoNote` string building, live and
  Undone branches (riders:325-345), the `damageLabel` pieces of `weaponTile` (hud:185-194) and
  `swapTile` (sequence:171-181), and both cancelled-usage-card tests (turnflow:392-410,
  sequence:211-228).
- Characterisation tests:
  - **`hooks.test.mjs`:** import `combat.mjs` then `hud.mjs` under `installFoundry()` plus the dom
    and argon fixtures, then `fire("init")`, `fire("setup")`, `fire("ready")`. Pin `F.hooks` to
    `golden/hooks.json`, but filter the lifecycle `once` listeners (`init`, `setup`, `ready`) and
    pin their **effects** in `glue.test` instead, so consolidating lifecycle listeners later
    leaves the golden untouched. Also pin the `document` listener list as recorded (at 28ccc87:
    three `keydown` from turnflow — Esc :344, Enter-uses :378, digits :597 — then `pointerover`
    :98, `pointermove`, `pointerdown` from hud) and the observer target (combat-riders-6 / -7 / -31
    oracle).
  - **`glue.test.mjs`:** `utilsSource === "foundry"`. Settings registered in `DEFAULTS` order
    (30 keys at 28ccc87) with `PENTARYN_COMBAT.Setting.<key>.Name/Hint`. The publish result
    `game.pentaryn.combat` key list goes to `golden/surface-legacy.json` (23 members, `core`
    included). Pin every `console.warn/error` text the hooks emit on a forced throw
    (`pentaryn-combat | swing tag skipped`, `… | HUD composition failed`, …). Pin `F.calls` for
    one Full Attack on the Fighter in a started fake Combat `{id:"c1", round:1, combatant:{id:"cb1"}}`.
  - **`core.test.mjs` (export surface):** `Object.keys(await import("../combat-core.mjs")).sort()`
    equals the recorded names (81 at 28ccc87; combat-riders-20).
  - **`events` source scan** in `hooks.test`: `/pentarynCombat\.[a-zA-Z]+/g` over all `*.mjs`
    gives exactly `{usage, offhand, bonusSpent, bonusAction, reaction, otherAction, sequenceEnd}`
    (combat-riders-14; five at the snapshot).
  - **`graph`** in `hooks.test`: `reachable(importGraph(...), ["combat.mjs","hud.mjs"])` covers
    every non-test `.mjs`. The DFS order is pinned as first recorded (combat-riders-31).
  - **`i18n.test.mjs`:** today's template-built key families all exist in `lang/en.json`:
    `Setting.<30 keys>.Name/Hint`, `Rider.Name|Rule|Check.<sneak-attack|frenzy|colossus-slayer|divine-strike>`,
    `Rider.ToggleHint|Mode.<ask|auto>`, `FollowUp.<offhand|nick|flurry|martial-arts|hew|pole-strike>`,
    `FollowUpText.<offhand|offhand-dual-wielder|nick|flurry|martial-arts|hew|pole-strike>`,
    `Kind.<nick|offhand|bonus|main|pole-strike>`, `Turn.Effect.<dash|disengage>` (combat-riders-28).
    The snapshot claim that FollowUp and Kind both cover all eight kinds was wrong: derive each
    family from the values the code passes before pinning. A source scan shows every `followUps`
    kind has a `runFollowUp` branch.
- **Checkpoint:** stop. The diff is `lib/`, `test/` and `golden/` only. The agent commits it as the checkpoint.
- **Absorbs:** C14, C20, C40 (partly), C43; the test halves of combat-riders-6, -7, -14, -20, -28, -31.

### S2 — Core constants
- `combat-core.mjs:30` `export const MOD = "pentaryn-combat"` becomes
  `export const MODULE = "pentaryn-combat"` plus `export { MODULE as MOD }`. The alias keeps
  `game.pentaryn.combat.core.MOD` readable for macros, and C12's `const MOD =` regex does not
  match it.
- Add `SHORT = "combat"`, `NS = "combat"`, `VERSION` (=== module.json, live value),
  `CONTRACT = "pentaryn-combat/api@1"`, `I18N = "PENTARYN_COMBAT"`, `CSS = "pc-"`, and
  `HOOKS = {}`. HOOKS stays empty until S9: a row only becomes real when `emit` fires it.
- **Test first:** `core.test` asserts `VERSION === manifestOf(...).version` and that the export
  surface equals the S1 list plus the new constants (an explicit additive delta in the test).
- **Absorbs:** C41, half of C12.

### S3 — One `MODULE`, named imports, dead exports
- Replace `const MOD = core.MOD` in combat:33, hud:26, offhand:21, riders:22, sequence:20,
  shapes:8 and turnflow:25 with `import { MODULE } from "./combat-core.mjs"`, renaming the uses.
  `sequence.mjs:17` `import * as strip` becomes named imports (`show`, `update`, `hide`,
  `picking`, `waitChoice`, `choose`, `onceCancel`, `pickWeapon`, as used).
- Delete `combat.mjs:279` `export { attackActivityOf }` and `sequence.mjs:437`
  `export { weaponShape }`. Drop imports left unused.
- **Test first:** the S1 hooks and surface goldens, plus a source-grep test (`test/dead` case in
  `hooks.test`): nothing imports from `./combat.mjs`, and nothing imports `weaponShape` from
  `./sequence.mjs` (combat-riders-34).
- **Absorbs:** C12, C15; combat-riders-34 (JS part).

### S4 — Log and i18n literals
- `const log = makeLog(MODULE)` in each file that logs. Every
  `console.warn(\`${MOD} | <text>\`, err)` becomes `log.warn("<text>", err)`. The text stays
  byte-identical (`log.warn` prints `${moduleId} | ${event}`). `console.error` at hud:748 becomes
  `log.error`, and `console.info` at offhand:57 becomes `log.info`.
- The 27 empty or comment-only catches (19 at the snapshot) and the `.catch(() => null|{})` sites
  become `log.swallow(op, fn, fallback)` or `catch (err) { log.debug(op, err) }`. Each site keeps
  its return value. At 28ccc87 the empty or comment-only catches are hud :41, 96, 251, 531, 765,
  832, 933, 938, 956, 963; riders :36, 189, 426, 446; sequence :178; settings :59; strip :240,
  241, 272; turnflow :34, 593, 719, 730, 738, 753, 787, 824. The eight `.catch(() => null|{})`
  are offhand :78, combat :126, hud :62, sequence :200, :351 and turnflow :210, 428, 434 (the
  snapshot's turnflow :218 deleteCombat sweep now warns, :257). Catches that already return or
  assign a value (`catch { return null|false|1; }`, e.g. shapes :115, :135, :285, turnflow :47,
  :196, hud :214, :480, sequence :148) pass C24 and may stay as they are. Converting them to
  `log.swallow` is optional, and each must keep its value. Debug output is gated
  on `CONFIG.debug["pentaryn-combat"]`, so it is silent by default.
- The five `T()` wrappers (hud:28, riders:23, sequence:21, strip:12, turnflow:26) become
  `_loc("PENTARYN_COMBAT.…", data)`, which is native in v14 and interpolates when `data` is
  given. Template-built keys become **literal key tables** in core
  (`FOLLOWUP_KEY = { offhand: "PENTARYN_COMBAT.FollowUp.offhand", … }`, the same for `Kind`,
  `FollowUpText` (with its `offhand-dual-wielder` variant, hud:414), `Turn.Effect`, `Rider.Check`, `Rider.Name`, `Rider.Rule`, `Rider.ToggleHint`, `Rider.Mode`).
  That makes every key a definite reference for the i18n gate.
- **Test first:** in `glue.test`, a fake console proves `log.warn("swing tag skipped", e)` prints
  `pentaryn-combat | swing tag skipped` once. With the debug flag unset, `swallow` returns its
  fallback and prints nothing; with it set, debug prints one line (combat-riders-9 test). A
  per-site fallback table is checked: each converted catch returns what the pre-change body
  returned for a throwing input. `i18n.test` pins `_loc(key)` output equal to the old
  `T(key)`/`T(key, data)` for the S1 key list, and that every literal-table value exists.
- **Absorbs:** C24, C35; combat-riders-9; combat-riders-5 (the `T()` part); the `trace` half of
  combat-riders-10 (`log.trace` ring, published in S7).

### S5 — Settings rows
- `settings.mjs` gets `export const SETTINGS = [...]`, one row per `DEFAULTS` key **in today's
  order**: `{ key, scope:"world", config:true, type:Boolean, default:true,
  name:"PENTARYN_COMBAT.Setting.<key>.Name", hint:"PENTARYN_COMBAT.Setting.<key>.Hint",
  onChange, doc }`. The `doc` text comes from today's inline comment.
  `DEFAULTS = Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.default])))`.
  `registerSettings()` = `defineSettings(MODULE, SETTINGS, { i18nRoot: I18N })`, and
  `setting = settingReader(MODULE, SETTINGS)` (same try → default fallback as `settings.mjs:65-71`).
- `onChange` today calls `ui.ARGON.render()` only when `ui.ARGON._actor` is bound (the re-run's
  guard: an unbound HUD threw) inside an empty catch (:59), but `settings.mjs`
  may not touch Argon. Instead, `registerSettings({ onChange })` takes a callback that the entry
  passes in (`argon.renderHud()`, adapter, keeping the `_actor` guard, `log.swallow`).
- Foreign **Argon** settings move behind
  `argonSetting(key, onError)` in `settings.mjs`, with today's per-site fallbacks: `rangepicker`
  → `false` (hud:214), `alwaysOn` → `false` (turnflow:196), and `targetPickerGuideShown`
  get/set inside the existing warn (hud:254).
- `riders.mjs:377` (`pentaryn-aoe.autoDamageOnHit`) is **not** moved here. That is C23 (S11).
- **Test first:** `glue.test` checks that registration order and every option object match the
  S1 pin, except `onChange` identity. A stub `game.settings.get` that throws makes `setting(k)`
  return the default. `argonSetting("rangepicker")` returns `false` when it throws. `i18n.test`
  confirms every row's literal `name`/`hint` exists (C51).
- **Absorbs:** C21 (3 of 4 sites), C22, C51; combat-riders-13 (the settings half).

### S6 — Entry wiring and features (four sub-steps, one commit each)
Shared rules: every registration goes through `reg.on/once(name, fn, { guard: false, label })`.
`guard: false` keeps today's unguarded behaviour; S11 turns guards on. Each feature exports
`install(reg, ctx)` and `uninstall()`. `uninstall` removes its `document` listeners, its
MutationObserver and its session maps. `ctx` carries `log`, `setting`, `emit`, `exposed` and
`expose`. Every handler on `renderActionPanelArgonComponent` and on `pointermove` gets a
`// hot: <cache>` comment (C49).

- **S6a — `combat.mjs` entry.** Body order: `rollDock.install(reg, ctx)` (from strip:139-278),
  then `reg.once("init")` (settings), then `reg.once("setup")` (counting, weapon-bonus,
  counting's updateActor, turn-riders, offhand, in §2.2 order), then `reg.once("ready")` (S7
  publishes here; `seedAll` stays deferred one tick). `riders.mjs` → `turn-riders.mjs` (`git mv`,
  then imports; the `combat-dnd5e-roll-hooks` row's `files` changes in S13). `offhand.mjs:25-72`
  moves to the adapters (§2.1).
  *Test first:* the S1 goldens (hooks, surface-legacy, glue warns, F.calls) are unchanged.
  `counting`'s truth table: for `{kind ∈ main|offhand|bonus|nick}` × tagged/untagged, the
  `updateTurn` spy calls equal the S1 recording.
- **S6b — `hud.mjs` entry + hud features + `argon.mjs`.** `hud.mjs` keeps only imports and
  `install` calls. The `turnflow.mjs` features are imported and installed **first** (today :24 is
  evaluated before hud's body). Module-scope DOM work (hud:266-275) moves into
  `hud/picker.mjs install()`, and the `pointerover` listener (hud:98) into `hud/tooltips.mjs
  install()`, both at the same moment. The two `renderActionPanelArgonComponent` listeners
  (bars :739, pips :931) stay two registrations in that order. Adjustments markers that must still
  appear in a listed file: `overridePips`, `maxActions`, `PickerProbe`, `_onPreLeftClick`,
  `forgetButtons`, `argon-onSetChangeUpdateItem`, `_itemButtons`, `hideDuplicateSlots`,
  `_isWeaponSet`, `ech-target-picker`, `MutationObserver`, `refreshOwnTooltip`,
  `bindTooltipLeave`, `renderActionPanelArgonComponent`, `CONFIG.ARGON`, plus the markers of the
  rows the re-run added for hud.mjs (combat-argon-item-button-spell-pips, combat-argon-stray-tooltip,
  combat-argon-drawer-restore-place; read them from adjustments.yml first).
  *Test first:* the hooks golden, the document-listener pin, and a fake-panel render pipeline.
  `panel {label:"DND5E.Action", _buttons:[weapon-set slot, item button], element}` is rendered
  through every recorded `renderActionPanelArgonComponent` listener in order for Fighter, Rogue
  and NPC, and the resulting `_buttons` kind/id order is pinned (`golden/argon-bars.json`).
  Absorbs combat-riders-6.
- **S6c — `turnflow/*` + `patches.mjs`.** Same split as §2.1. The single
  `renderActionPanelArgonComponent` listener stays single. The `controlToken` timer
  (turnflow:289-297, `setTimeout(…,150)`) becomes
  `const followLeft = foundry.utils.debounce(bindLeft, 150)`. The end state is identical: today
  every timer re-reads `canvas.tokens.controlled` when it fires, the first one that passes binds
  the token, and later ones see `ui.ARGON._token === left[0]` and return (C26). The 300/1200 ms
  combat-start rechecks (turnflow:227-229) and the other timers keep their delays here; naming
  them is combat-riders-37 (§4). The hand patches move into `patches.mjs` through the kit:

  | Site (28ccc87) | Kit call | Marker kept (adjustments row) | Watch |
  |---|---|---|---|
  | turnflow:458-481 `PortraitPanel.prototype.getEffects` | `wrapMethod(MODULE, {target: P.prototype, name:"getEffects", marker:"_pcConditions", adjustments:"combat-argon-portrait-conditions"}, …)` | `patchPortrait`, `PortraitPanel` (keep the function name `patchPortrait` at the call site) | the marker moves from the prototype to the replacement function; nothing else reads `P.prototype._pcConditions` (grep live first) |
  | turnflow:495-505 `PreciseText.prototype.destroy` | `defineAccessor(MODULE, P.prototype, "destroy", {writable:true, value: function destroy(…)}, {marker:"_pentarynPreciseText", adjustments:"combat-core-scrolling-text-guard"})` | `PreciseText` | **keep the `!Object.hasOwn(P.prototype,"destroy")` guard at the call site**: `defineAccessor` has none, and the guard is what skips the patch if core ever defines `destroy` there |
  | turnflow:506-526 `PreciseText.prototype.x` / `.y` (new in the re-run, U-6-15) | `defineAccessor(MODULE, P.prototype, axis, {get, set, enumerable: d.enumerable, configurable: true}, {marker:"_pentarynPreciseXY", adjustments:"combat-core-scrolling-text-teardown"})` per axis, `d` found by today's prototype-chain walk | `combat-core-scrolling-text-teardown` row's markers (read them first) | **keep the `!Object.hasOwn(P.prototype,"y")` guard at the call site**; the getter returns 0 whenever `transform` is null, whatever the setting — pin that |
  | turnflow:527-536 `InterfaceCanvasGroup.prototype.createScrollingText` | `wrapMethod(…, {marker:"_pentaryn", adjustments:"combat-core-scrolling-text-guard"})` | `createScrollingText` | the replacement's `name` is no longer `createScrollingText` (nothing reads it) |
  | turnflow:549-563 `ChatLog.prototype.notify` | `wrapMethod(…, {marker:"_pentaryn", adjustments:"combat-core-chat-notify-hidden-tab"})` | `ChatLog`, `notify` | same marker as above but a different target, so `wrapMethod`'s (moduleId, marker, target) key keeps them apart |
  | turnflow:797-812 `ActionPanel.prototype.updateActionUse` | `wrapMethod(…, {marker:"_pcSettles", adjustments:"combat-argon-pip-settle"})` | `_pcSettles` | the wrapper calls `wrapped()` twice exactly as today; it returns the first call's result |

  Per-instance wraps (`btn._onLeftClick`, `panel.toggle` with `_pcNear`, `getTooltipData`) stay
  as they are. They are not prototype patches, and their rows already exist.
  *Test first:* `test/patches` cases in `hooks.test`. Pure node classes
  `class P { f(a){return a+1} }` prove the wrap applies once and that a second `install` is a
  no-op (marker), and that `this` is preserved. For each of the five sites, a stub class
  reproduces today's behaviour before and after:
  `destroy` on an already-destroyed instance with the setting on returns `undefined`, and with it
  off calls the original. `createScrollingText` with `document.hidden` true returns a resolved
  promise. `notify(msg, {newMessage:true})` while hidden passes `newMessage:false`. On the
  settle panel, a fake `ActionPanel` with Argon's bug reproduced (rebuild when
  `container.length !== maxActions`) gives the same used-flags for `maxActions` 1→2, 2→2, 2→4
  and an element-less panel (combat-riders-3 oracle). `addPortraitExtras` with effects
  `[{uuid:"a",active:true,isTemporary:false,statuses:["prone"]}]` and list `[]` pushes one entry
  `a`; with list `[{uuid:"a"}]` it pushes nothing (combat-riders-8). On a destroyed PreciseText stub
  (`transform: null`) with the setting on, `y = 5` is ignored and `y` reads 0; with it off the
  original setter runs. `describe().patches` lists six records (seven with both axes counted
  separately: record which), each with a non-empty `adjustments`.
  Absorbs C26, C32 (code half), combat-riders-7, combat-riders-8.
- **S6d — `sequence.mjs` runner feature.** `install` sets `ctx.expose({ running })` and returns
  the contribution rows `fullAttack`, `followUp`, `running` and `abort`. The temporary hooks
  (sequence:73, :115-116, and turnflow's `pressUse` `renderActivityUsageDialog` hook, :364-376) go through `reg.on`/`reg.off` with labels. Emits stay literal until S9.
  *Test first:* glue `F.calls` for a two-swing Full Attack, a stop mid-sequence (now also: Stop
  with the swing's roll window open closes it, and the stopped run's unrolled usage card is tidied
  400 ms later) and a follow-up (Off-hand, Flurry with Focus), all equal to S1.
- **Absorbs (S6 overall):** C17, C18, C26, C32 (code), C16 classification; combat-riders-6, -7,
  -8, -17 step 1 (rename), -31 (load order is now explicit in the entry's `FEATURES` lists).

### S7 — API manifest, publish, inspect
- `api-manifest.mjs`: one row per current member (23, unchanged by the re-run), all `legacy: true` with the exact current
  signatures:
  `count(actor, weaponId)`, `plan(actor, weaponId=null)`, `turn(actor)`, `newTurn(actor)` (writes),
  `multiattack(actor)`, `weapons(actor)`, `quick()`, `setQuick(on)` (writes, user flag),
  `riderMode(key)`, `setRiderMode(key, mode)` (writes), `fixFeats(actor, {apply})`,
  `seedWeaponSets(actor)` and `seedAll()` (gm, writes). Contributions: `offers`, `rollRider`,
  `reckless`, `setReckless`, `report` (turn-riders) and `fullAttack`, `followUp`, `running`,
  `abort` (sequence). That is 23 members with `core`.
  `core` goes in `unlisted` with a **plain frozen copy** `Object.freeze({ ...core })`. Do not
  pass the module namespace: `buildApi`'s `freezeDeep` would throw on it. First assert in the
  test that every object or array export of core is already frozen, so `freezeDeep` does not
  freeze a table the module still mutates.
- New rows (additive): `inspect(ref, opts)` (combat-riders-11). It returns
  `{actor: refOf, key, inCombat, isOwnTurn, turn, stored, stale, plan, pips, spentPips, reaction,
  followUps, riders, reckless, running, settings}` (`reaction` = the re-run's
  `flags.pentaryn-combat.reaction` plus `core.reactionSpent`) through `toPlain`, depth ≤ 4. `followUps` uses
  `followUpsFor(actor, {bonusFree: !turn.bonusUsed})` and is documented as an approximation
  without the Argon panel. Also `selftest()`, `coversMultiattack(ref)` (the three checks of
  transform/hud.mjs:526-534, so transform can stop reading combat's settings:
  transform-creatures-13 step 3), and kit members `settings()`, `trace()`, `uninstall()`,
  `describe()`.
- `publishNamespace("combat", api, { moduleId: MODULE })` runs synchronously at `ready`. The
  one-tick re-alias stays in `lib/publish.mjs`. `seedAll` keeps
  `setTimeout(() => { if (isActiveGM()) seedAll(...) }, 0)`, the same deferral and predicate as
  combat:274-277 (C26 only forbids it around publish).
- **Test first:** `api.test` checks that `surfaceOf(api)` ⊇ `golden/surface-legacy.json` (S1) and
  that each legacy member is called with the same arguments and returns the same result as the
  pre-change code for the fixtures. Cases: `plan(Fighter)`, `plan(NPC, "bite")`, `count`, `turn`,
  `report()` rows, `fixFeats(actor)` report. `inspect(Fighter).plan` deep-equals `plan(Fighter)`,
  `.turn` deep-equals `turn(Fighter)`, the depth is ≤ 4, and a JSON round-trip is equal.
  `followUpsFor` equals the legacy `followUpsNow` oracle for
  `bonusPanel.currentActions ∈ {1, 0}` and for no panel out of combat, on: no swings, after a
  Light main swing, after Nick, Monk focus 0 and focus 2. New goldens written here (additive, not
  a refactor diff): `golden/describe.json` (normalised) and `golden/surface.json`.
- **Absorbs:** C27, C28, C29, C31 (rows documented), C50; combat-riders-11, -13 (the
  describe/settings half), the `api.trace` half of -10, and -21 (`api.plan` =
  `planFor(a, w).plan`, pinned against both oracles with and without an explicit `weaponId`).

### S8 — Seams inside the module (behaviour-neutral helpers)
- `shapes.mjs`: `isWeaponAttack` replaces `weaponLike` (combat:48; call sites :79, 123, 145, 153)
  and `isWeaponAttack` (riders:45) (combat-riders-4). `multiattackFor`, `rememberedWeapon`,
  `rememberWeapon` and `planFor` cover the raw `getFlag(MOD,"last")` reads at combat:222, hud:170,
  hud:362, shapes:122 and riders:464, and the writes at hud:207 and sequence:351
  (combat-riders-21). `sequence.mjs:261` calls `setQuickMode(on)`.
- `argon.mjs`: one `mainPanel`, one `releaseTargets`, `protoDescriptor`, `dropTooltip`, and
  `settlePips` (one call when `_pcSettles` is installed, else two) for hud:488-489, hud:809 and
  turnflow:33-35 (combat-riders-3, -5); `dropArgonTooltip` for hud:84-97 and turnflow:711-720.
- `dialogs` helpers: `rollDialogOf(target, {buttonOnly})` (strip:36-40 uses `true`,
  turnflow:334-342 uses `false`), `topRollWindow()` (strip:205-208 and rollDialogOf's fallback),
  `openResolvers()` (sequence:106-111, turnflow:571-580), `tidyUsageCard(msg, {sequence})`
  (turnflow:392-410, sequence:211-228) and `damageLabel(activity)` (combat-riders-5).
- `core/sequence.mjs`: `fullAttackPlanFrom({weapons, weaponId, turn, inCombat, multiattack,
  count, pick, enhancedDualWielding})` gets the exact body of sequence:422-434 (combat-riders-22).
- `core`: `areaPlacementSkipped({wanted, placed, onScene})` for combat:264 and `shapes.mjs`
  `isAoeHandle(flags)` for turnflow:316 (combat-riders-36, the behaviour-neutral half).
- **Test first:** a 60-case truth table for `weaponLike` vs `isWeaponAttack`: `type` ∈
  {attack, save, damage} × `classification` ∈ {weapon, unarmed, spell, null} × `item.type` ∈
  {weapon, spell, feat, consumable, undefined}, plus a null activity. Pins:
  `{attack,null,"weapon"}` true, `{attack,"spell","weapon"}` false. `damageLabel` on
  `{labels:{damage:[{label:"1d8 + 3 Slashing"}]}}`, `{labels:{damages:[{formula:"1d6"}]}}` and
  `{}` equals the recorded legacy strings. `protoDescriptor(new B(), "x")` returns A's getter.
  `rollDialogOf` with `buttonOnly:true` on a non-button target returns null.
  `fullAttackPlanFrom` fixtures (record by running first), with the row
  `// KNOWN: Multiattack ignores Action Surge`: multiattack `{plan:[{itemId:"bite",count:2}]}`
  with swings 2 and surges 1 in combat gives `{swings:[], count:2, left:0, weaponId:"bite"}`.
  With swings 0 it gives two swings. A PC with `weaponId: "scimitar"` and count 2 gives scimitar
  ×2 plus a dagger Nick off-hand. `pipState` on the surged turn is pinned as recorded
  (re-checked at 28ccc87: `{max:4, current:2}` with an empty plan). `areaPlacementSkipped`
  equals combat:264's inline expression over all 8 input combinations; `tidyUsageCard` equals both
  legacy tidy decisions.
- **Absorbs:** combat-riders-3, -4, -5, -21, -22 (the move; the bug stays, see §4), -36 (the
  move; reading aoe's decision stays in §4).

### S9 — Events table **[declared B2]**
- `HOOKS` rows in core:
  `usage: { name:"pentaryn-combat.usage", legacyName:"pentarynCombat.usage", until:"pentaryn-combat <next minor after this release>", pre:false, args:"(activity, kind)" }`.
  The other six rows follow the same pattern: `offhand` `(actor, {bySequence})`,
  `bonusSpent` `(actor, kind)`, `bonusAction` `(actor, activity)`, `reaction` `(actor, activity)`
  and `otherAction` `(actor, activity)` (both new in the re-run) and `sequenceEnd` `(actor)`.
  Every literal `Hooks.callAll("pentarynCombat.*")` (combat:89, 90, 127, 137, 149, 165;
  sequence:306, 359, 398, 408) becomes `ctx.emit(key, …)`. hud's own listeners (hud:836, 862, 872,
  882, 892, 901, 943) move to the **new** names. If they listened on both,
  they would run twice, because `emit` fires both names.
- Adjustments: the `combat-argon-item-button-bonus-pip` row's marker `pentarynCombat.bonusAction`
  now lives in `combat-core.mjs`. Update the row's `files` in the S13 batch.
- **Test first:** the S1 events scan stays green, except that the literal set now appears only in
  core. A stub `Hooks` test shows that one `emit("usage", a, "main")` fires `pentaryn-combat.usage`
  then `pentarynCombat.usage` with the same arguments. After `until`, it warns once.
- **Declared:** the event order changes for outside listeners (new name first). Live test: a macro
  on `pentarynCombat.usage` still fires once per sequence swing.
- **Absorbs:** C19, C52; combat-riders-14.

### S10 — Dead CSS rule
Delete `styles/combat.css:44-47` `.extended-combat-hud .pentaryn-combat-hidden` (no JS adds the
class). That also removes one `!important`. **Test first:**
`grep -rn pentaryn-combat-hidden foundry/module` finds only `combat.css`.
**Absorbs:** combat-riders-34 (the CSS part).

### S11 — Hardening inside the API and hooks **[declared, console or failure path only]**
- Turn `guard: true` on for the registrations that S6 kept unguarded (hud:812-967,
  turnflow:199/248/282/283/289/312/835-841, riders:489-500, and the hooks that combat.mjs's setup
  wraps inline today). Return values
  pass through, so a `false` veto still reaches Foundry. A sync throw is logged as
  `pentaryn-combat | <label>` instead of Foundry's `Error thrown in hooked function`. A rejection
  inside a handler is logged, where today it is unhandled (combat-riders-30).
- New rows (`inspect`, `coversMultiattack`) already resolve refs through `resolveRef`. Legacy rows
  keep `legacy:true`, but the 13 actor-taking ones also get `withRef(…, "actor", {required:false})`.
  With that, `plan(undefined)` returns `null` instead of throwing a `TypeError` at
  `combat.mjs:219-221`, and an id, UUID or exact name now works (combat-riders-12).
- **C23:** replace `riders.mjs:376-379` with
  `apiOf("pentaryn-aoe")?.settings?.().autoDamageOnHit`, keeping the `false` fallback. This is
  **blocked until pentaryn-aoe publishes `settings()`** (aoe migration, also WAIT). Until then
  C23 stays failing and is listed as such.
- **Test first:** `hooks.test` checks `on("x", fn)` with `fn = () => false` returns false through
  the guard. A throwing fn returns `undefined` and logs one `pentaryn-combat | lbl` line. An async
  throw raises no `unhandledRejection`. `api.test` resolver table: Actor, Token
  (`{actor, documentName:"Token"}`), UUID, id and exact name each return the actor. A substring
  gives `NOT_FOUND` (null for legacy rows). `undefined` gives null. Nothing falls back to
  `canvas.scene`.
- **Absorbs:** combat-riders-30, -12 (combat half); C23 when unblocked.

### S12 — Core split
`combat-core.mjs` becomes a barrel, `export * from "./core/<topic>.mjs"` plus the constants, with
the files listed in §2.1 and their contents moved unchanged. Read C36's three literals
(combat-core:491, 495, 497) and either key them or note them as intentional (they are hint
fragments). The `combat-dnd5e-steady-aim-effect` row's marker `steadyAimChanges` moves to
`core/damage.mjs`, and its `files` row changes in S13.
**Test first:** the S1 export-surface pin (81 names at 28ccc87 plus the S2 additions) and the
legacy fixtures (320 at 28ccc87). `node --check` passes on each `core/*.mjs`, and `core.test` imports each one bare.
**Absorbs:** C10 (core), combat-riders-20.

### S13 — Adjustments batch (only while `foundry/adjustments.yml` is idle)
In one append-and-edit batch:
- Update `files` for every combat row whose marker moved (34 `combat-*` rows at 28ccc87, 25 at the
  snapshot, plus the shared `dnd5e-cancelled-area-refund`). hud rows go to `hud/*.mjs` or
  `argon.mjs`; turnflow rows go to `turnflow/*.mjs` or `patches.mjs`; `combat-dnd5e-roll-hooks`
  gets `turn-riders.mjs`; `combat-argon-item-button-bonus-pip` gets `combat-core.mjs`;
  `combat-dnd5e-steady-aim-effect` gets `core/damage.mjs`; `combat-dnd5e-roll-dialog-dock` gets
  `roll-dock.mjs`; `combat-argon-weapon-set-seed` and `combat-dnd5e-offhand-mode-reset` get
  `argon.mjs`/`shapes.mjs`; the re-run's turnflow rows (combat-helper-token-control,
  combat-dnd5e-usage-enter-uses, combat-core-scrolling-text-teardown, combat-argon-drawer-restore-place,
  combat-argon-movement-redraw, combat-argon-drawer-turn-close) go to their `turnflow/*.mjs` or
  `patches.mjs` file. Correct `dnd5e-cancelled-area-refund`'s `what` (combat does not read
  `refundCancelledArea`; combat-riders-36) and add the aoe → combat contract row it names.
- Add pentaryn-combat to `dnd5e-chat-message-types` (`modules`, `files`
  `turn-riders.mjs`/`turnflow/dialogs.mjs`, `check` += `make foundry-combat-check`). Add a new row
  `combat-core-flag-forced-replacement` (markers `ForcedReplacement`, `==turn`; shapes 216-220).
  Add `transform-reads-combat-multiattack` (transform-creatures-13 step 2).
- **Test first:** in a scratch copy, misspell one moved marker and confirm
  `make foundry-adjustments-check` fails. Grep each new marker in its file before adding the row.
- **Absorbs:** C32 (rows ↔ patches), C33 (manual list reviewed); combat-riders-16 (combat half).

### S14 — Docs
- README rewritten in the use-doc §7 order (What the player sees · Settings · API — game.pentaryn.combat ·
  Data written · Flags other modules read · Events · Patches and adjustments · Two sessions / who
  writes · Extending · Pitfalls · Files · Tests · Sync). It must stay ≤ 250 lines. Today's 166
  lines keep their content: the "Adjustments" settings table becomes "Settings", and "Known gaps"
  becomes Pitfalls. Cover the missing flags (reckless effect flag, Steady Aim `special:
  steady-aim`, `.attack` on rider damage messages; the re-run already added `reaction`, the orphan
  sweep and `undone`). List the seven events. Files lists both
  entries' load order. Extending gives four checklists: new setting, new turn rider, new
  follow-up kind, new special action. Add a "Which riders module?" table. Give no fixture counts.
- `CHANGELOG.md`.
- `context/foundry/melee.md:21`: the stacked off-hand sentence becomes "a stack of 2+ on one item
  line counts as two weapons for Light/Nick" (combat-riders-15). Add the "Which riders module?"
  table (combat-riders-17 step 2). Comment the tooltip CSS coupling in `combat.css` and
  `hud/tooltips.mjs` (transform-creatures-14 step 1).
- `context/foundry/argon.md` is phase 1 of combat-riders-18 (every Argon hook and prototype touch
  by module and order, with the Reaction-slot double relabel). Its routing row goes in
  `context/foundry/README.md`.
- **Test first:** in `hooks.test` (docs case), every manifest row path appears in the README API
  section, and every root `.mjs` appears under Files (combat-riders-15). This fails before the
  rewrite.
- **Absorbs:** C44, C45; combat-riders-15, -17 step 2, -28 (README part), -18 phase 1, -31 (docs part).

### S15 — Wave 7 restart batch (module.json; with the other 18 modules, once)
`flags.pentaryn = { tier:"full", namespace:"combat", flagScope:"pentaryn-combat", cssPrefix:"pc-",
generation:14, afterSync:[…] }`, and `compatibility.verified: "14.369"`. **The flagScope change is
metadata only, not a data migration:** the code has always written `flags.pentaryn-combat.*`
(combat-core:30). The stale `"combat"` value is read by nothing (combat-riders-13). Restart.
**Absorbs:** C07, C38; combat-riders-13 (the module.json half).

---

## 4. Findings that are NOT structural (standalone fixes, after or between the steps)

| Finding | Fix | Why standalone | Test (from the finding) |
|---|---|---|---|
| combat-riders-1 | memoise `fullAttackState`/`combatContext`/`weaponsOf`/`featuresOf` per microtask on HUD paths only (a local `memoTick` keyed by `actor.uuid`; kit `memo` is TTL-based). Never inside an `actor.update` → read path (sequence, `updateTurn`) | performance; depends on S8's `planFor` | `memo(a)` deep-equals `compute(a)`; same object within one tick; fresh after `await Promise.resolve()`; one `featuresOf` call per 5 reads; `api.plan` stays unmemoised |
| combat-riders-2 | in `renderOffer`, check permission and the stale turn stamp **before** `offersFor`; compute `combatContext(a).key` once per actor in `rerenderCards` | performance | stale stamp and non-owner: no DOM change and `canvas.tokens.placeables` read 0 times; current stamp: one `.pentaryn-combat-riders` row, innerHTML pinned |
| combat-riders-29 | prune `writeChains` on settle (identity check), and `autoApplied` (4 s) / `expected` (120 s) through a pure `pruneOlder` on `updateCombat` | session-map hygiene (use-doc §5.4 rule, not layout) | `pruneOlder` fixtures; two quick `updateTurn`s apply in order and then leave no chain |
| combat-riders-33 | `foundry.utils.escapeHTML` (or strip's `esc`, whose output is pinned) on `a.dice`, `a.key`, `o.dice` in the auto note and offer button | security hardening **[declared]**: crafted markup now renders as text | `autoNoteHtml` equals the legacy string for normal values; `'<img src=x onerror=1>'` comes out escaped |
| combat-riders-35 | install the picker-cue pointer listeners and observer only while `skipPickerGuide` is on | performance **[declared, minor]**: the first pick after switching the setting on mid-session may have no pointer yet | default on: listeners and observer present as today; off: removed and disconnected; cue placement literals pinned |
| combat-riders-22 (bug half) | Multiattack + Action Surge gives an empty plan while the pips show swings left | real rule bug, behaviour change | the `// KNOWN:` fixture from S8 flips; route to the live-test workflow |
| combat-riders-10 (rest) | `trace()` calls at each decision point (classification, follow-up branches, auto-rider skips, offer early returns) | additive diagnostics on top of S7's `trace` member | flag unset → `trace()` stays `[]`; 250 pushes keep the last 200 |
| transform-creatures-14 step 2 | copy the `.pentaryn-tt` tooltip block into `combat.css` | visible only with transform off; schedule deliberately | — |
| combat-riders-36 (rest) | after S8's move, read pentaryn-aoe's own decision (a published `placementCancelled`/`refunded` member or a `pentaryn-aoe.refunded` event) so combat skips the Action pip exactly when aoe refunded | **[declared]** behaviour change across two WAIT modules: today combat also skips the pip when aoe's `refundCancelledArea` is off and the slot stays spent | the `KNOWN:` fixture from S8 flips; live test: Fireball cancelled with refund off spends the Action pip |
| combat-riders-37 | a frozen `DELAYS` table in core for every setTimeout delay (300/1200 HUD-follow recheck, 150, 250 < 400 tidy, 1500 orphan sweep, 400 Enter-uses fallback, 150 focus retry, 50 movement, 500 seed); event-driven replacements are declared | hardening; S6c already handles the one C26 flags | `DELAYS` frozen; `tidyAfterSequence > tidyLook`; a setTimeout recorder sees the same delays before and after |
| combat-riders-38 | one `actor.update` per actor for the end-of-combat flag cleanup and the orphan sweep (same deletion form as `unsetFlag`) | performance; the 1500 ms timer and the ready sweep stay | same final flags and return count; writes drop from one per key to one per actor; the riders listener still sees `-=turn` |

---

## 5. Declared behaviour changes (each goes to the live-test workflow)

| # | Change | Step | What to watch at the table |
|---|---|---|---|
| B2 | `pentarynCombat.*` events also fire as `pentaryn-combat.*` (new name first) until `until` | S9 | Full Attack, Off-hand pip, Bonus pip and the end of a sequence each behave once, not twice. A test macro on the old name still fires |
| D-c1 | hook guards on (labelled log line instead of Foundry's hook error; async rejections caught) | S11 | console only; no UI difference (console-only is fine at this table) |
| D-c2 | legacy API members resolve id/UUID/name and return `null` on a miss instead of throwing a `TypeError` | S11 | eval-js: `game.pentaryn.combat.plan("Name")` works; `plan()` returns null |
| D-c3 | escaped rider dice/key in chat-card HTML | §4 combat-riders-33 | Sneak Attack auto note and offer button look identical |
| D-c4 | picker-cue listeners present only while the setting is on | §4 combat-riders-35 | Argon target picker label sits at the pointer with the setting on |
| B3 (not here) | collapsing `combat.mjs` + `hud.mjs` into one entry, and moving install to `setup` | Wave 8, needs `hook-order.mjs` | — |
| B5 (not here) | removing the remaining `!important` (`combat.css:202`) | own decision | — |
| (fix) | Multiattack + Action Surge plan | §4 | an NPC with Multiattack that surges gets its second set of swings |
| D-c5 | combat reads pentaryn-aoe's refund decision instead of re-deriving it (combat-riders-36) | §4 | a cancelled Fireball with `refundCancelledArea` off now spends the Action pip; with it on, nothing changes |

Not declared, and verified as neutral in the steps above: S6c's `controlToken` debounce (same end
state); publishing at `ready` instead of one tick later (the kit keeps the re-alias tick, and
`game.modules.get("pentaryn-combat").api` plus `pentaryn-combat.ready` are additive); and the
marker move from `PortraitPanel.prototype._pcConditions` to the wrapper function. **Grep the live
tree and the world macros for `_pcConditions` before S6c.** If anything reads it, keep it set on
the prototype as well.

---

## 6. Effort

| Step | Size | Agent-days (Opus build + Sonnet verify) |
|---|---|---|
| S0 re-anchor | S | 0.25 (done 2026-10-11 against 28ccc87; repeat only if HEAD moves) |
| S1 characterisation (fixtures, oracles, six test files, goldens) | L | 2.5 |
| S2–S5 constants, imports, log/i18n, settings | M | 1.5 |
| S6a–d entry wiring, features, patches | L | 3 |
| S7 API manifest, inspect, publish | M | 1.25 |
| S8 seams | M | 1 |
| S9 events (declared) | S | 0.5 + live test |
| S10–S11 CSS, hardening | S | 0.75 + live test |
| S12 core split | M | 0.75 |
| S13 adjustments batch | S | 0.5 |
| S14 docs | M | 0.75 |
| S15 Wave 7 | S | (shared batch) |
| §4 standalone fixes | M | 2 (three more since the re-anchor: -36 rest, -37, -38) |
| **Total** | | **≈ 14 agent-days** of work, over at least 4 live-test round trips (B2, D-c1/2, D-c3/4, the surge fix). Calendar time depends on when the WAIT lifts. argon-kit extraction (Wave 8.6) is extra: ≈ 1 day, then vendoring into transform/riders |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | 91.7 % (44 / 48 fail-class rules) on `migrate/wave-4` — `conformance.py --module pentaryn-combat --markdown`; 93.8 % (45 / 48) once the S13 adjustments edits land (checked on a snapshot copy) |
| Date | 2026-10-11 (code phase; nothing live) |
| Commits | argon-kit `87be8cd4` (written first, 8.6) · vendor `eaff3e00` · S2 `49750dbc` · S3 `796b1bc1` · S4 `e45b8484` · S5 `33faf80b` · S6a `91dd98db` · S6c `8a29ed7f` · S6b `3a29eb4f` · S6d `bb0d66fd` · S8 `7d386862` (+ `7c3dbf90` followUpsFor) · S7 [declared W2-K1] `d54ad23d` · S9 [declared B2] `cac1b85b` · S10 `ea181b22` · S11 [declared D-c1] `0fea9208`, [declared D-c2] `26cdb801` · S12 `1514cd22` · S14 `b936d9f6`, `df18b89f` · C10 split `e723fb44` · standalone: -22 [declared] `f709a285`, W4-C1 [declared] `affd3273`, -33 [declared D-c3] `de84b8a5`, -35 [declared D-c4] `9448deea`, -29 `3fc1643c`, -2 `c69a5e22` + `1992dadb`, -37 `87366619`, -38 [declared] `06755b88`, -10 `1ba641d2` · review: -33 follow-up [declared D-c3] (rider name escaped) `51912021`, mocked timers in four tests `e7cb12b1`; records `caae2696`, `9a873c05` (W4-C7), `a495c0c4` (W4-C8) |
| Declared changes handed to the live-test workflow | W2-K1, B2, D-c1, D-c2, D-c3, D-c4, -22 surge fix, W4-C1, -38 (wave-4 report, combat live checks) |
| `module.json` edits appended to `wave7-restart-batch.md` | no — returned to the integrator (shared file): flags.pentaryn, version 0.3.0, compatibility.verified, styles += `lib/argon-tooltip.css`, and the `description` turn-flow sentence (combat-riders-15; exact text in the wave-4 report, "Integrator — combat") |
| Adjustments rows appended to `adjustments-batch.md` | no — returned to the integrator (shared file); the exact `foundry/adjustments.yml` edits were checked on a copy (0 problems) |
| Still failing, and why | C07 (module.json, Wave 7); C21 + C23 (`turn-riders.mjs` reads pentaryn-aoe's `autoDamageOnHit`: aoe's kit `settings()` is published at ready, but chat cards first render before ready, so the C23-clean read answers wrong at load — Open for Joe); C32 until the S13 adjustments edits land. Warnings: C10 `turn-riders.mjs` 520/500, C36 three rider hint fragments (intentional), C37w one `!important` (B5) |

**Wave 4 code phase (2026-10-11).** Deviations from the steps above, each recorded in its commit:
weapon-bonus stays in `counting.mjs` (it reads counting's `lastTag`); the docking state stays in
`strip.mjs` and `roll-dock.mjs` owns its four registrations; `offhand.mjs` keeps the seed (an adapter
may not import `shapes.mjs`); `turnflow/boundaries.mjs` keeps the end-of-combat cleanup and orphan
sweep (one hook-name order); the pip handlers live in `hud/pips-bar.mjs` but `hud/bars.mjs` registers
them; hud's listeners stay on the legacy `pentarynCombat.*` names until `until` (emit fires both);
the core barrel imports and re-exports by name (the scanner sees no edge in `export * from`); C23 is
not taken (above). Frozen-test changes: import / file paths only, the S2/S4/S8 additive core-surface
deltas, layout goldens (emits, graph, module-scope hooks, i18n templates and literal keys), the S3
dead-export pins, strip.test importing the entry, and the named pins of each `[declared]` commit.
combat-riders-1 (memoise per task) was tried and reverted: two frozen hud.test pins read stale values.

**S1 checkpoint (wave 4, 2026-10-11): `6e802ebb`** — `test(combat): characterisation checkpoint`, on
`migrate/wave-4`; tests and goldens only (no `lib/`: the kit is vendored by the kit step, C14 still
fails). `12e86e58` before it: `test/run.mjs` is the fixed body with `LEGACY = ["test/core-fixtures.mjs"]`
(the old suite moved byte for byte), `test/kit/` = `foundry/lib/test-kit` 1.0.2, `core.test.mjs`.

- Files: `hooks`, `glue`, `core`, `counting`, `shapes`, `sequence`, `strip`, `riders`, `hud`, `turnflow`,
  `turnflow-player`, `api`, `i18n`, `failure-paths`, `publish-frozen`, `publish-open` `.test.mjs`;
  fixtures `dom`, `argon`, `world`, `actors`, `legacy-combat` (the S1 oracles, verbatim); 100 goldens
  (`hooks.json` 62 rows, `surface-legacy.json` 23 members, `argon-bars.json`, `document-listeners.json`,
  `graph.json`, `core-exports.json` 81 names, …). Mocked timers (setTimeout + Date) throughout.
- Results: node:test 179 (175 pass, 4 todo, 0 fail); legacy 326 fixtures pass; `make foundry-combat-check`
  green; pytest 1199 passed (unchanged).
- Coverage (node:test, module files, `lib/` and `test/` excluded): before — no node:test suite (the
  legacy suite loaded `combat-core.mjs` only: 99.76 / 89.21 / 99.32); at the checkpoint 99.78 / 87.01 /
  98.92 L / B / F over all 10 files (combat.mjs, settings, offhand, shapes, strip, turnflow, sequence,
  hud 100 % lines; riders 99.80; combat-core 99.19, the rest of it is the legacy suite's).
- Conformance: 50.0 % (23/46) → 58.7 % (27/46); C20, C40, C41, C43 now pass.
- KNOWN pins, each with a todo test that flips it: **combat-riders-22** (`sequence.test`: Multiattack +
  Action Surge plans nothing; §4), **combat-riders-12** (`api.test` + `golden/api-bad-*.json`: legacy
  members throw or read nothing on a bad ref; S11, D-c2), **W4-C1** (new: Adv/Dis pressed on the strip
  while a swing's roll window is open is cleared by that swing's `rolled`, so the next swing rolls
  without it; `sequence.test`; recorded under Open for Joe in `wave-4-report.md`), and `VERSION ===
  module.json` (todo until S2).
- Seen, pinned, not a todo: a Martial Arts / Hew / Pole Strike follow-up emits
  `pentarynCombat.bonusSpent` twice (once from the roll's counting, once from `runFollowUp`); hud's
  listener is idempotent. S9 should keep the count or note the change.
- Fixture notes for S6–S12: `test/fixtures/world.mjs`'s `actor.update` applies `_replace` (v14
  ForcedReplacement) before the update hooks fire; activities fire dnd5e's hooks in dnd5e's order.
  Goldens hold message ids, so a test added to a frozen file mid-refactor would shift them: add new
  tests in new files.

Fixed outside the migration, on `fix/playtest-2026-10-11` (module 0.2.5): **PT1-6** — the Full
Attack tooltip subtitle ("2 of 2 swings left this turn, + Nick: Scimitar") was cut at both edges.
`hud.mjs` `TT` now adds a combat-own class `pentaryn-combat-tt` beside the shared `pentaryn-tt`, and
`styles/combat.css` has `.ech-tooltip.pentaryn-combat-tt .ech-tooltip-subtitle` (wraps to the tooltip
width, centred on the header/body seam, no `!important`, C37-clean), placed after the S10 dead rule
so S10's line range still holds (the B5 `!important` moved from `:187` to `:202`; refs above updated); fixtures 378-383 pin it. S3/S4 keep `TT` as is (it may become a
core constant); it is not part of the `.pentaryn-tt` block transform-creatures-14 step 2 copies.
