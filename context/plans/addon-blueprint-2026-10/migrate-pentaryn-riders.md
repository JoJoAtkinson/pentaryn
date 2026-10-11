---
title: Migration guide — pentaryn-riders to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, pentaryn-riders]
---

# Migrating `pentaryn-riders` to the addon blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

> **Re-anchored to 28ccc87 on 2026-10-11.** Every line number below is HEAD `28ccc87` (the working
> tree equals HEAD for this module; riders has not changed since the usability re-run commit
> `17275c9`). Snapshot (`ee505c2`) numbers are kept in brackets where they help. S0 is done:
> `cast-flow.mjs` is classified (§2.1), its hooks are in the S1 pin (§2.2), and the score is live
> (§1). riders.mjs only gained the cast-flow import, so its body shifted by +3 after :47. The audit
> side is in [`../code-audit-2026-10/riders.md`](../code-audit-2026-10/riders.md): 0 resolved,
> 0 obsolete, -25/-26/-32/-16 extended, and two new findings, combat-riders-39 (five hand patches)
> and -40 (three comment-only catches).

**Read this when:** you are about to restructure `foundry/module/pentaryn-riders` to the blueprint,
or you need to know which 2026-10 audit findings the restructure absorbs. **Not this file:** for
the general procedure, see [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md)
§8. For the cross-module order, see [`migration-order.md`](migration-order.md). For combat's
once-per-turn riders, which are a different thing, see
[`migrate-pentaryn-combat.md`](migrate-pentaryn-combat.md).

> **WAIT: yes.** `pentaryn-riders` is in `scripts/foundry/blueprint/wait.json` because the melee
> live-test workflow is working on it. The module does not import combat, transform or aoe. Two
> steps still reach into WAIT neighbours:
> - S9, the "Which riders module?" table, also edits combat's README.
> - The Argon tidy-ups (`argon-tidy.mjs`, `rituals.mjs`, and the `#tooltip` CSS) are part of the
>   Wave 8.6 Argon composition with combat and transform.
>
> Line numbers below are **HEAD `28ccc87`** (re-anchored 2026-10-11). The snapshot
> (`…/scratchpad/audit-snapshot/pentaryn/module/pentaryn-riders`) equalled `ee505c2`. The re-run
> commit `17275c9` changed every source file and added `cast-flow.mjs`, and this guide now
> covers it. If the tree moves again before S1, re-run:
>
> ```sh
> git diff 28ccc87 -- foundry/module/pentaryn-riders; git status -- foundry/module/pentaryn-riders
> ./.venv/bin/python scripts/foundry/blueprint/conformance.py --module pentaryn-riders --markdown
> ```

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | K3 `guarded` ctx + `sender: "any"` — **landed** (kit 1.0.1); K5 `buildApi` freezes a copy — **landed** (kit 1.0.1) |
| Scores | §1 was re-scored **live at `28ccc87`** on 2026-10-11 (after scorer fixes R2–R9): **45.2 % (19/42)**, down from 47.6 % (20/42) on the snapshot. C24 newly fails (three comment-only catches in the re-run code). C35 now names `cast-flow.mjs:54`. |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today (live, `28ccc87`): 45.2 % (19 of 42 fail-class rules pass)

Scored on 2026-10-11 with `conformance.py --module pentaryn-riders --markdown` against the live
module folder, full tier. The snapshot scored 47.6 % (20/42). The only status change is **C24**, which
now fails. Details below are live. Where the snapshot differed, it is noted.

| Rule | Status | Detail (snapshot) | Cleared by step |
|---|---|---|---|
| C01, C03, C04, C05, C06, C08, C11, C13, C15, C19, C23, C25, C34, C39, C46, C47, C48, C52 | pass | `rituals`, `concentration`, `argon-tidy`, `cast-flow` are reached through side-effect imports at riders.mjs:43-50 | keep passing |
| C02 minimum 14 (warn) | pass | | — |
| C06w styles under `styles/` (warn) | warn | `riders.css` at root | S10 (Wave 7) |
| **C07** `flags.pentaryn` | **fail** | no tier, namespace or cssPrefix; `flagScope: "riders"` | S10 (Wave 7) |
| **C09** relationships name every package | **fail** | code names `enhancedcombathud` and `enhancedcombathud-dnd5e` in argon-tidy.mjs and rituals.mjs (snapshot: `-dnd5e` in rituals only); `relationships` lists only dnd5e | S10 (Wave 7) |
| C10 sizes (warn) | warn | riders.mjs 666/150 (cast-flow.mjs is 301 lines, under the 500 feature cap) | S5 |
| **C12** one `MODULE` | **fail** | `MOD` in riders-core:24, riders:52, rituals:36 (a literal), table-core:6 (cast-flow, argon-tidy and concentration import table-core's) | S2 |
| **C14** kit vendored | **fail** | | S1 |
| C16 import direction | pass* | *only because argon-tidy, concentration and rituals count as "glue" | S5 |
| **C17** hooks only in entry | **fail** | 22 sites. argon-tidy:38, 80, 107 (+ the :53-57 loop, which the scorer does not count); cast-flow:60, 71, 82, 86, 108, 125, 137, 164, 193, 290; concentration:46, 61, 74, 91, 132, 144; rituals:57, 72, 117 | S5 |
| **C18** features export install/uninstall | **fail** | | S5 |
| **C20** golden/hooks.json | **fail** | | S1 |
| **C21** settings only in settings.mjs | **fail** | 18 sites. cast-flow:109, 114, 121; concentration:43, 47, 52, 108; riders:148, 295, 434, 442, 499, 626, 631; rituals:41, 45, 58, 63 | S4 |
| **C22** `SETTINGS` exported | **fail** | | S4 |
| **C24** no empty or comment-only catch | **fail** (new at `28ccc87`) | argon-tidy:73, cast-flow:78, concentration:125 (combat-riders-40) | S3 |
| **C26** no publish tick | **fail** | riders.mjs:654 `setTimeout(…,0)` around the publish | S6 |
| **C27** api-manifest + buildApi | **fail** | | S6 |
| **C28** describe/surface goldens | **fail** | | S6 |
| **C29** inspect() | **fail** | writes item flags (`damageType`), message flags and token flags (`concentration`); since the re-run, also `system.outcome` on concentration save messages and spell-slot values (Arcane Recovery) | S6 |
| **C30** queries guarded | **fail** | riders.mjs:640 hand-registered `CONFIG.queries["pentaryn-riders.battleMedic"]` | S6 (kit K3 has **landed**, see S6) |
| C31 (manual) | manual | `setType`/`retireManual`/`installBattleMedic`/`spendHitDie`/`restoreHitDie` return legacy shapes | S6 (`legacy:true`) |
| **C32** patches via wrapMethod | **fail** | rituals.mjs:122 `ButtonPanelButton.prototype._renderInner`. The rows `riders-argon-ritual-adept-list`, `riders-arcane-recovery-picker` and `riders-argon-long-casts` have no patch naming them. **Scorer blind spot:** five more hand patches go undetected because they assign through a local variable: cast-flow:142 `_prepareUsageConfig`, cast-flow:199 `getPlacement`, argon-tidy:91 `targets` accessor, argon-tidy:98 `getTooltipData`, and argon-tidy:77 `TextEditor.enrichHTML` (combat-riders-39) | S5, S8 |
| C33 (manual) | manual | rituals.mjs `CONFIG.ARGON` ×1 | S8 |
| **C35** i18n ≥ 90 % definite | **fail** | 49 % (20/41). Indefinite keys: the `L(k)` prefix wrapper at riders.mjs:55 hides 12; the second `T(k)` prefix wrapper at cast-flow:246 hides 6 (`arcaneRecovery.*`); the template key at concentration:157 hides 3 (`concentration.{failed,failedEnded,success}`). The scorer also flags the two-branch `T` at cast-flow:54 (snapshot: 43 %, 9/21) | S3 |
| C36 hard-coded English (warn) | warn | riders-core:62, 74, 86, 97 (rule names) | S9 (manual: these are rule names) |
| **C37** CSS prefix | **fail** | `.pr-*` selectors (no cssPrefix declared yet; the re-run's `.pr-conc-result` and `.pr-ar-total` are `.pr-*` too), and `#tooltip.ech-tooltip-container` / `#tooltip .ech-tooltip` (Argon's DOM, riders.css:53-54) | `.pr-*` fixed by S10 (`cssPrefix:"pr-"`); `#tooltip` see §4 |
| C37w `!important` (warn) | pass | | — |
| C38 cssPrefix unique | n/a | | S10 (`pr-`) |
| **C40** tier test files | **fail** | | S1, S6 |
| **C41** VERSION test | **fail** | | S2 |
| C42 (manual) | n/a | no `test/fixtures` | S1 |
| **C43** fixed run.mjs / LEGACY | **fail** | `test/run.mjs` self-runs, then imports `test/rituals.mjs` and `test/table.mjs` | S1 |
| **C44** README order | **fail** | 12 sections missing | S9 |
| **C45** CHANGELOG | **fail** | | S9 |
| C49 hot hooks (warn) | pass | | — |
| C50, C51 | n/a | | S6, S4 |

**Projected after S1–S9 (before Wave 7):** every fail-class rule passes except C07, C09 (both
module.json, Wave 7) and C37. This assumes C24 is cleared in S3 and the five hand patches move in
S5. Moving those patches does not change the score, because the scorer does not see them today; it
is the -39 hardening. C37 is left with the two Argon `#tooltip` selectors, which need a
decision (§4). After Wave 7, only C37 remains.

---

## 2. Target layout vs today

The module id, namespace `riders`, flag scope `pentaryn-riders` (the code already writes it), the
i18n root `PENTARYN_RIDERS`, the eight setting keys (four in the snapshot), the query name
`pentaryn-riders.battleMedic` and the `PENTARYN_RIDERS.settings.<key>.name/hint` label shape (D4:
it is kept as it is) all stay. There is one entry, `riders.mjs` (`esmodules[0]`), and it keeps its
name (D11).

### 2.1 Old file → new file (HEAD `28ccc87` line ranges; [snapshot] in brackets)

| Old (`28ccc87` lines) | Content | New file (role) |
|---|---|---|
| `riders.mjs:1-40` | design header | README "What the player sees" and the entry's file-map header |
| `riders.mjs:41-55` [41-52] | imports, side-effect imports (:43, :45, :48, :50), `MOD`, `QUERY`, `PRESET`, `L` | ENTRY `riders.mjs`: `FEATURES = [rituals, concentration, argonTidy, castFlow, damageRiders, cardNote, trayPreset, battleMedic, hdSheet]`; `QUERY` → `battle-medic.mjs`; `PRESET` → `tray-preset.mjs`; `L` → `_loc` literals |
| `riders.mjs:58-103` [55-100] | `itemInfo`, `activityDamageTypes`, `featuresOf` | `shapes.mjs` ADAPTER (Item → plain rule input) |
| `riders.mjs:105-213` [102-210] | `isType`, `isHealing`, `carriedBy`, `describe(term)`, `originOf`, `usedFrom`, `applyRiders`, hook :210 | `damage-riders.mjs` feature (rename the local `describe` to `describeTerm`: not an API clash, but it confuses readers of the reserved name) |
| `riders.mjs:215-246` [212-243] | `renderNote`, hook :243 | `card-note.mjs` feature |
| `riders.mjs:248-308` [245-305] | `seedIgnore`, `trayOptionsFor`, hook :290 | `tray-preset.mjs` feature |
| `riders.mjs:310-354` [307-351] | `hdPools`, `hdSummary`, `writePool`, `spendHitDie`, `restoreHitDie` | `shapes.mjs` (document reads and writes) + `core/hit-dice.mjs` pure kernels (`hdPoolsFrom`, `hdSummaryOf`), combat-riders-26 |
| `riders.mjs:356-488` [353-485] | Battle Medic: `HEALER`, `isBattleMedic`, `soleTarget`, `battleMedicBlock`, `applyBattleMedic`, `runBattleMedic`, hooks :432 and :440, `findKit`, `installBattleMedic` | `battle-medic.mjs` feature (contributes `battleMedic` and `installBattleMedic`); `battleMedicBlockReason` → `core/hit-dice.mjs` |
| `riders.mjs:490-539` [487-536] | `decorateHitDice`, hook :536 | `hd-sheet.mjs` feature (UI on dnd5e's sheet DOM) |
| `riders.mjs:541-620` [538-617] | `setType`, `retireManual`, `report` | `api.mjs` impl; `report` row builder → `rowsFor(actor)` in `api.mjs`, using `core` `reportRow` (combat-riders-26/-32) |
| `riders.mjs:622-637` [619-634] | settings `enabled`, `hdControls` | `settings.mjs` rows |
| `riders.mjs:638-651` [635-648] | `CONFIG.queries[QUERY]` relay | `battle-medic.mjs` `relay(data, {user})`, registered through the kit (S6) |
| `riders.mjs:653-665` [650-662] | `setTimeout(0)` publish + frozen-root guard | `publishNamespace("riders", api, {moduleId})` at `ready` (entry) |
| `rituals.mjs:34-46` [27-35] | `MOD` literal, `DONE`/`WRAPPED` symbols, `enabled()`, `longEnabled()` (new) | `MODULE` import; `settingOr("rituals", false)`, `settingOr("longCasts", false)` (S4) |
| `rituals.mjs:57-68` [46-52] | settings `rituals`, `longCasts` (new) | `settings.mjs` rows |
| `rituals.mjs:70-81` [54-65] | slot unticked by default (`dnd5e.preUseActivity` :72) | `rituals.mjs` feature `install` |
| `rituals.mjs:83-115` [67-85] (`addRituals` at :85) | `addRituals(button)`, which now also adds the "Longer casts" group (:103-114, U-6-8) | `rituals.mjs` (exposes `addRituals` through `ctx.expose`) |
| `rituals.mjs:117-126` [87-96] | `ButtonPanelButton.prototype._renderInner` hand patch | `patches.mjs` `wrapMethod` (S5) |
| `concentration.mjs:42-57` [29-41] | `enabled()`, settings `concentrationSummons`, `concentrationAutoBreak` (new) | `settings.mjs` rows + `settingOr(…, false)` |
| `concentration.mjs:59-103` [43-87] | summon stamp :61, cleanup :74, break label :91 | `concentration.mjs` feature `install` (the election predicate at :77-78 stays at the call site; it is not one of the kit's) |
| `concentration.mjs:105-161` (new, U-6-6) | `autoBreakOn()`, `isConcSave`, `featureKeys`, `resultOf`, auto-break `createChatMessage` :132, DC/result line `dnd5e.renderChatMessage` :144 | `concentration.mjs` feature `install`; `featureKeys` → `shapes.mjs`; the line's inline "failed" → `concentrationResult` (combat-riders-26 ext.) |
| `argon-tidy.mjs:36-57` [23-40] | `updateItem` badge refresh :38, panel collapse loop :51-57 (now also `dnd5e.preSummon`, U-6-11) | `argon-tidy.mjs` feature; the `ui.ARGON` touches → `argon.mjs` ADAPTER (`refreshSharedUses`, `collapseAll`) |
| `argon-tidy.mjs:59-113` (new, U-5-11, U-5-15) | `tooltipItems`, `wrapEnrich` (global `TextEditor.enrichHTML` wrap at `ready` :80), `wrapButtonClass` (`targets` accessor + `getTooltipData` wrap), hook `renderItemButtonArgonComponent` :107 | the hook stays in `argon-tidy.mjs` feature; the three wraps → `patches.mjs` (`wrapMethod` ×2, `defineAccessor` ×1, combat-riders-39); `tooltipItems` stays module state, cleared in `uninstall()` |
| `cast-flow.mjs:1-54` (new) | design header, imports, `T` two-branch wrapper | **classified (S0): one FEATURE file** `cast-flow.mjs` (301 lines, under the 500 cap). Header → README; `T` → `_loc` literals (S3) |
| `cast-flow.mjs:56-82` (U-5-16) | summon sidebar keep: `summoning` state, `dnd5e.preSummon` :60, `changeSidebarTab` :71, `dnd5e.postSummon` :82 | `cast-flow.mjs` `install`; `ui.sidebar` touches → `shapes.mjs` (or a small `sidebar` helper); `summoning` cleared in `uninstall()` |
| `cast-flow.mjs:84-104` (U-5-17) | restore-slot default, `dnd5e.preUseActivity` :86 | `cast-flow.mjs` `install`; the slot map → `slotsFrom` in table-core (combat-riders-26 ext.) |
| `cast-flow.mjs:106-121` | settings `castDefaults`, `arcaneRecovery`; reader `on(key)` | `settings.mjs` rows; `settingOr(key, false)` |
| `cast-flow.mjs:123-158` (U-6-4, U-6-7) | self-only card drops stale targets (`dnd5e.preUseActivity` :125); `SummonActivity#_prepareUsageConfig` hand wrap at `ready` :137 | hook → `cast-flow.mjs` `install`; the wrap → `patches.mjs` `wrapMethod` (`adjustments: "dnd5e-summon-place-default"`, combat-riders-39) |
| `cast-flow.mjs:160-189` (U-6-9) | usage-dialog first click, `renderActivityUsageDialog` :164 | `cast-flow.mjs` `install` (UI on dnd5e's dialog DOM) |
| `cast-flow.mjs:191-214` (U-6-14) | `SummonActivity#getPlacement` hand wrap at `ready` :193 | `patches.mjs` `wrapMethod` (`adjustments: "dnd5e-summon-wildcard-preview"`, combat-riders-39) |
| `cast-flow.mjs:216-301` (U-6-10) | `ordinal`, `slotTable`, `arcaneRecoveryDialog` (DialogV2), `dnd5e.postUseActivity` :290, `export { arcaneRecoveryDialog }` | `cast-flow.mjs` `install` + `arcaneRecoveryDialog` exposed through `ctx.expose` and as additive API `arcaneRecovery(ref)` (combat-riders-32 ext.); `slotTable` → `slotsFrom` |
| `riders-core.mjs` (540) | RULES and the pure planning | `riders-core.mjs` CORE (barrel) + `MODULE`/`SHORT`/`NS`/`VERSION`/`CONTRACT`/`I18N`/`CSS`/`HOOKS = {}` + `export * from "./core/hit-dice.mjs"` |
| `rituals-core.mjs` (92 [62]), `table-core.mjs` (199 [63]) | pure (the re-run added `LONG_ACTIVATIONS`/`longCasts`; `METAMAGIC`, `skipsTargetPicker`, `restoreSlotScaling`, `placeSummonsDefault`, `isWildcardPath`, `AFTER_FAIL_FEATURES`, `concentrationResult`, `arcaneRecovery*`, `isArcaneRecovery`) | unchanged cores; `table-core` re-exports `MODULE` from `riders-core` (core → core is allowed). **Note for S6:** `METAMAGIC` is a mutable `Set` export (table-core:68), not frozen |
| `riders.css` (69 [56]) | sheet −/+, card note, break label, Argon tooltip click-through, `.pr-conc-result`, `.pr-ar-total` | `riders.css` (moves to `styles/riders.css` in Wave 7) |
| `test/run.mjs` (259), `test/rituals.mjs` (83 [63]), `test/table.mjs` (125 [66]) | self-running `check()` suites | `test/core-fixtures.mjs` (the old run.mjs **minus its two trailing imports**), `test/rituals.mjs`, `test/table.mjs` → all three in `LEGACY`; fixed `test/run.mjs` |
| — | — | `settings.mjs`, `api-manifest.mjs`, `api.mjs`, `patches.mjs`, `shapes.mjs`, `argon.mjs`, `lib/*`, `lib/kit.lock.json`, `test/{core,glue,hooks,api,i18n}.test.mjs`, `test/golden/*`, `test/fixtures/*`, `CHANGELOG.md` |

### 2.2 Install order (pinned by the hooks golden)

Today's per-hook order comes from evaluation order: `rituals` → `concentration` → `argon-tidy` →
`cast-flow` → riders' body. The sets that matter are:
- **`dnd5e.preUseActivity`** has four listeners, in this order: rituals' slot untick (rituals:72),
  cast-flow's restore-slot default (:86), cast-flow's stale-target drop (:125), then the Battle
  Medic veto (riders:432).
- **`dnd5e.renderChatMessage`** has three listeners: the break label (concentration:91), the
  concentration DC/result line (concentration:144), then the card note (riders:243).
- **`dnd5e.postUseActivity`**: Arcane Recovery (cast-flow:290) runs before Battle Medic (riders:440).

The entry installs `FEATURES` synchronously in its body, in that same order, which is the same
moment as today's module-scope registration. The four `init` listeners (rituals :57,
concentration :46, cast-flow :108, riders :625) become **one** entry `init`. The four `ready`
listeners (rituals :117, argon-tidy :80, cast-flow :137 and :193, plus the publish at riders :654)
become one entry `ready`: patches first, in today's order, then the publish. The hooks golden
therefore pins lifecycle listeners by their **effects** (settings order, query registered, patches
installed), not by count. See S1.

---

## 3. Steps

Each step lists the characterisation test to write **before** the step, run green against the
unchanged code. The refactor diff must leave `test/golden/` and those tests untouched. After each
step run `make foundry-riders-check`, `vendor.py check pentaryn-riders` and
`conformance.py --module pentaryn-riders`. When a marker moves, also run
`make foundry-adjustments-check`.

### S0 — Re-anchor (WAIT gate) — **done 2026-10-11 at `28ccc87`**
The live score is in §1, `cast-flow.mjs` is classified as one feature file (§2.1), and every §2.1
row carries HEAD line ranges. Re-run the diff at the top only if the tree moves before S1.
**Absorbs:** none.

### S1 — Vendor, test layout, characterisation (checkpoint commit; Joe approves)
- `vendor.py sync pentaryn-riders --tier full --kit patch`. Do not add `election`: the
  concentration predicate is local, and the relay's `activeGM.isSelf` check stays as written.
- Rename `test/run.mjs` → `test/core-fixtures.mjs` and drop its last two `await import(...)`
  lines. Write the fixed `run.mjs` with
  `LEGACY = ["test/core-fixtures.mjs", "test/rituals.mjs", "test/table.mjs"]`. The 164 existing
  fixtures still run, one process each, so riders' and table's failures no longer mask each other.
- `test/fixtures/actors.mjs` (built with `makeDoc`):
  - a sorcerer with "Elemental Adept (Fire)" (with a `damageType` flag) and an "Elemental
    Affinity" feat with no type and two `damage` activities;
  - a druid with Potent Spellcasting;
  - a healer with the Healer feat, no Battle Medic activity, and a kit item;
  - an NPC with `hd {denomination:"d8", value:3, spent:1}`;
  - a two-class PC.
- `test/fixtures/argon.mjs`: `CONFIG.ARGON.MAIN.BUTTONS.ButtonPanelButton` with an async
  `_renderInner`, plus `ui.ARGON.collapseAllPanels` and `itemButtons`.
- Characterisation tests:
  - **`hooks.test.mjs`:** import `riders.mjs` under `installFoundry()`. Pin the ordered `F.hooks`
    (non-lifecycle) in `golden/hooks.json`. Snapshot order:
    `dnd5e.preUseActivity` (rituals), `dnd5e.summonToken`, `deleteActiveEffect`,
    `dnd5e.renderChatMessage` (break label), `createChatMessage` (auto-break),
    `dnd5e.renderChatMessage` (DC/result line), `updateItem`,
    `dnd5e.preCreateMeasuredTemplate` (collapse), `dnd5e.preSummon` (collapse),
    `renderItemButtonArgonComponent`, `dnd5e.preSummon` (sidebar keep), `changeSidebarTab`,
    `dnd5e.postSummon`, `dnd5e.preUseActivity` (restore slot), `dnd5e.preUseActivity` (stale
    target), `renderActivityUsageDialog`, `dnd5e.postUseActivity` (Arcane Recovery),
    `dnd5e.postDamageRollConfiguration`, `dnd5e.renderChatMessage` (note),
    `dnd5e.preCalculateDamage`, `dnd5e.preUseActivity` (Battle Medic),
    `dnd5e.postUseActivity` (Battle Medic), `renderCharacterActorSheet`. That is 23 entries at
    `28ccc87` (12 in the snapshot). Confirm this by running it. (combat-riders-25, -31)
  - **`glue.test.mjs`:**
    - `utilsSource === "foundry"`.
    - After `fire("init")`, settings are registered in the order `rituals`, `longCasts`,
      `concentrationSummons`, `concentrationAutoBreak`, `castDefaults`, `arcaneRecovery`,
      `enabled`, `hdControls`, with their option objects (minus `onChange` identity) and
      `PENTARYN_RIDERS.settings.<k>.name/hint`. Confirm this order by running it
      (combat-riders-25).
    - After `fire("ready")`: `SummonActivity.prototype._prepareUsageConfig` and `getPlacement`
      are wrapped once, `TextEditor.implementation.enrichHTML._prItemRollData` is set, and
      `ButtonPanelButton.prototype._renderInner` is wrapped once (combat-riders-39 pins; the
      behaviour cases are in the finding's recipe).
    - `CONFIG.queries["pentaryn-riders.battleMedic"]` is a function.
    - After `fire("ready")` and a timer tick, the `game.pentaryn.riders` key list
      (`rules, featuresOf, report, setType, retireManual, installBattleMedic, battleMedic,
      spendHitDie, restoreHitDie, hdPools, preview, core`) goes to `golden/surface-legacy.json`.
    - The text of every `console.warn` on a forced throw (`pentaryn-riders | riders skipped`,
      `… | card note skipped`, `… | Battle Medic check skipped`, and the re-run's `… | summon
      sidebar keep skipped`, `… | restore-slot default skipped`, `… | cast defaults skipped`,
      `… | Place Summons default skipped`, `… | usage dialog first click skipped`, `… | summon
      preview image kept`, `… | Arcane Recovery picker skipped`, `… | concentration auto-break
      skipped`, `… | concentration result line skipped`, `… | tooltip roll data skipped`,
      `… | Argon button tidy skipped`, …).
    - The three comment-only catches (argon-tidy:73, cast-flow:78, concentration:125) print
      nothing today. Pin that, because S3 turns them into one `debug` line each
      (combat-riders-40).
    - Unregistered-setting behaviour. Before `init`, the six `try/catch → false` readers
      (`rituals`, `longCasts`, `concentrationSummons`, `concentrationAutoBreak`, `castDefaults`,
      `arcaneRecovery`) return `false`, and a hook reading `enabled` throws (it is caught by the
      hook's own try/catch and warned).
  - **Battle Medic relay oracle** in `glue.test` (combat-riders-27). Use stubs: GM user,
    `fromUuid` resolving the fake healer and target, `testUserPermission`, and an `applyDamage`
    that changes HP. Record the return value for `{amount:99, faces:8, prof:2}`. Record the thrown
    messages verbatim: `not the active GM`, `unknown actor`, `sender does not own the healer`,
    `healer has no Healer feat`.
  - **`report` rows oracle** (combat-riders-32): `report(sorcerer)` and `report()` rows exactly as
    returned, including `NO TYPE — setType(actor, 'fire')`, the `retireManual` hint,
    `not installed — installBattleMedic(actor)` and `installed, kit … MISSING`.
  - **Hit Dice kernels oracle** (combat-riders-26), recorded by running today's functions through
    stubs:
    - `hdPools(NPC)` gives one pool with faces 8.
    - The two-class PC gives two pools and a summary.
    - Denomination `"x"` gives faces 0.
    - `battleMedicBlock` gives a reason string for each of: no target, no Hit Dice, all spent, not
      owner with no GM. It gives `null` for the owner.
  - **`i18n.test.mjs`:** the 41 keys in `lang/en.json` (21 in the snapshot) exist, including the
    21 built ones:
    - 12 built by `L()`: `note.{bonus,min,reroll}`,
      `battleMedic.{flavor,needTarget,noHitDice,noGM,failed,done,doneShort}`, `hd.{spend,restore}`;
    - 6 built by cast-flow's `T(k)`: `arcaneRecovery.{title,intro,recover,cancel,total,done}`;
    - 3 built by the concentration template: `concentration.{failed,failedEnded,success}`.
- **Checkpoint:** the diff contains only `lib/`, `test/` and `golden/`. Joe reviews and commits.
- **Absorbs:** C14, C20, C40 (partly), C43; the test halves of combat-riders-25, -26, -27, -31, -32, -39, -40.

### S2 — One `MODULE`, core constants
- `riders-core.mjs:24` becomes `export const MODULE = "pentaryn-riders"` plus
  `export { MODULE as MOD }`. The alias keeps `game.pentaryn.riders.core.MOD` and the test
  imports working.
- Add `SHORT`, `NS = "riders"`, `VERSION`, `CONTRACT = "pentaryn-riders/api@1"`,
  `I18N = "PENTARYN_RIDERS"`, `CSS = "pr-"` and `HOOKS = {}`.
- `table-core.mjs:6` becomes `export { MODULE, MODULE as MOD } from "./riders-core.mjs"`.
- `rituals.mjs:36` and `riders.mjs:52` import `MODULE`. cast-flow, argon-tidy and concentration
  already import from table-core, so its re-export covers them.
- **Test first:** `core.test` checks that `tableCore.MODULE === ridersCore.MODULE`
  (combat-riders-25), that `VERSION === module.json.version`, and that the export surfaces of the
  three cores equal the recorded lists plus the additive constants.
- **Absorbs:** C12, C41.

### S3 — Log and i18n literals
- Each `console.warn(\`${MOD} | x\`, err)` becomes `log.warn("x", err)`, byte-identical. The
  console.info at concentration:83 becomes `log.info` with the same text, and the console.table
  stays in `report`.
- `L(k, data)` (riders.mjs:55) becomes `_loc("PENTARYN_RIDERS.<k>", data)` with full literal keys.
  `L(seesSheet ? "battleMedic.done" : "battleMedic.doneShort", …)` becomes a ternary of two
  literals.
- cast-flow's two wrappers go the same way:
  - the two-branch `T` at :54 is used once, at :66, with a full key;
  - the prefix `T(k)` at :246 becomes six `_loc("PENTARYN_RIDERS.arcaneRecovery.<k>", …)`
    literals.
- concentration:157's template key becomes a three-way ternary of literals (`…concentration.failedEnded`
  / `…failed` / `…success`).
- The three comment-only catches (argon-tidy:73, cast-flow:78, concentration:125) become
  `log.debug(...)` (C24, combat-riders-40).
- **Test first:** the S1 warn-text pin. `i18n.test` checks `_loc(fullKey, data)` equals the old
  `L(k, data)` for every call site's data shape.
- **Absorbs:** C24, C35; combat-riders-40.

### S4 — Settings rows
- `settings.mjs` defines `SETTINGS` in today's registration order:
  1. `rituals` (`name: "PENTARYN_RIDERS.settings.rituals.name"`, …)
  2. `longCasts`
  3. `concentrationSummons`
  4. `concentrationAutoBreak`
  5. `castDefaults`
  6. `arcaneRecovery`
  7. `enabled`
  8. `hdControls`, with the `onChange` that re-renders open character sheets, verbatim from
     riders.mjs:635.
- `registerSettings()` calls `defineSettings(MODULE, SETTINGS, { i18nRoot: I18N, labels: {
  section: "settings", name: "name", hint: "hint" } })`. The rows carry literal `name`/`hint`
  anyway (D4).
- Readers keep today's per-site failure semantics, which `settingReader` alone would change:
  - `settingOr(key, false)` for `rituals`, `longCasts`, `concentrationSummons`,
    `concentrationAutoBreak`, `castDefaults` and `arcaneRecovery`: try `get`, return `false` on a
    throw, and return `value !== false` otherwise (rituals:40-46, concentration:42-44 and
    107-109, cast-flow:121 `on(key)`). The kit reader would return the row's default `true`
    instead.
  - `settingRaw("enabled")` and `settingRaw("hdControls")`: rethrow (riders:148, 295, 434, 442,
    499). The enclosing hooks already catch and warn.
  - Both helpers live in `settings.mjs`, which is the only file that calls `game.settings.get`
    (C21).
- **Test first:** the S1 settings-order pin is unchanged. Unregistered stub behaviour:
  `settingOr` gives `false` and `settingRaw` throws the Foundry message. A registered `false`
  gives `false`, and a registered `true` gives `true`. `i18n.test` checks every row's literal
  label (C51).
- **Absorbs:** C21, C22, C51; combat-riders-25 step 1.

### S5 — Entry wiring, features, the one patch
- Split `riders.mjs` per §2.1 and turn `rituals`, `concentration`, `argon-tidy` and `cast-flow`
  into features with `install(reg, ctx)` / `uninstall()`.
- Every registration uses `reg.on(name, fn, { guard: false, label })`, because each handler
  already has its own try/catch. Return values pass through either way, so the Battle Medic
  `return false` veto (:436) still vetoes. The re-run's `createChatMessage` handler
  (concentration:132) is `async`. Its promise is ignored today, and `reg.on` must keep ignoring it.
- The entry body installs the features synchronously in §2.2 order. It registers one
  `reg.once("init")` (settings, then the relay; see S6) and one `reg.once("ready")` (patches, then
  publish).
- `patches.mjs` holds the rituals wrap (rituals.mjs:117-126):
  `wrapMethod(MODULE, { target: Base.prototype, name: "_renderInner", label: "ButtonPanelButton#_renderInner", marker: WRAPPED, adjustments: "riders-argon-ritual-adept-list" }, async function (wrapped, ...args) { try { ctx.exposed.addRituals?.(this); } catch (err) { log.warn("Rituals group skipped", err); } return wrapped(...args); })`.
  It runs at `ready`, as it does today.
  - `WRAPPED` stays `Symbol.for("pentaryn-riders.ritualsWrapped")`, now on the replacement
    function instead of `Base.prototype`.
  - **Grep the live tree for readers of `prototype[WRAPPED]` first.** In the snapshot, nothing
    reads it.
  - The row's markers `ButtonPanelButton`, `_spells` and `dnd5e.preUseActivity` must still appear
    in a listed file. Update `files` (rituals.mjs + patches.mjs) in S8.
- `patches.mjs` also takes the re-run's five hand patches (combat-riders-39), with bodies verbatim
  and the marker **strings** kept, because they are adjustments markers:
  - `SummonActivity#_prepareUsageConfig` (cast-flow:137-158, `_prPlaceDefault`,
    `dnd5e-summon-place-default`);
  - `SummonActivity#getPlacement` (cast-flow:193-214, `_prWildcard`,
    `dnd5e-summon-wildcard-preview`);
  - `TextEditor.implementation.enrichHTML` (argon-tidy:63-80, `_prItemRollData`,
    `argon-tooltip-item-rolldata`);
  - the Argon item button's `targets` accessor (`defineAccessor`, `argon-metamagic-no-picker`) and
    `getTooltipData` (`argon-tooltip-item-rolldata`), both installed lazily from the
    `renderItemButtonArgonComponent` hook (argon-tidy:83-113). They get one marker each, instead
    of the shared `_prTidy`.

  Grep the live tree for readers of `_prTidy`, `_prPlaceDefault`, `_prWildcard` and
  `_prItemRollData` first. At `28ccc87`, only `foundry/adjustments.yml` (as markers), the installing
  code and the action logs under `foundry/logs/` mention them.
- `uninstall()` clears the `PRESET` symbol state and any session maps (now also cast-flow's
  `summoning` and argon-tidy's `tooltipItems`).
- **Test first:** `hooks.golden` is unchanged and the S1 glue pins are unchanged. Patch tests:
  - A stub `ButtonPanelButton` whose `_renderInner` records calls is wrapped once. A second
    `install` is a no-op.
  - `addRituals` runs before the original, and its throw is warned while the original still runs.
  - `describe().patches` has six records: `riders-argon-ritual-adept-list` plus the four rows of
    combat-riders-39 (`argon-tooltip-item-rolldata` twice).
  - A veto case: with `enabled` on and no target, the fake Battle Medic activity makes
    `Hooks.call("dnd5e.preUseActivity", …)` return `false`.
- **Absorbs:** C10, C16 classification, C17, C18, C32 (code); combat-riders-25 step 3,
  combat-riders-31 (riders part), combat-riders-39.

### S6 — API manifest, publish, inspect, the relay
- `api-manifest.mjs` rows, all `legacy: true`, with the current signatures:
  - `featuresOf(actor)`. It returns live Items; documented as such.
  - `report(actor?)`.
  - `setType(target, type, ruleKey?)` (writes).
  - `retireManual(actor)` (writes).
  - `installBattleMedic(actor, {replace})` and `battleMedic(healer, token)` (writes, contributed
    by `battle-medic.mjs`).
  - `spendHitDie(actor, {faces})` and `restoreHitDie(actor)` (writes).
  - `hdPools(actor)`.
  - `preview(formula, opts)`.

  The re-run added nothing to `game.pentaryn.riders`. cast-flow's `export { arcaneRecoveryDialog }`
  (:301) is reachable by no caller.

  `rules` (already `Object.freeze`d, riders-core:59) and `core` (a plain frozen copy, not the
  module namespace) go in `unlisted`. Assert first that every object export of the three cores is
  already frozen, so `buildApi`'s `freezeDeep` does not freeze live tables. At `28ccc87` this
  assertion **fails** for table-core's `METAMAGIC`, a `new Set(...)` at :68. Either keep it out of
  `core`'s copy, or replace it with a frozen array plus `includes` (equivalent for
  `skipsTargetPicker`; pin it with the table fixtures).
- New, additive:
  - `inspect(ref, opts)` returns `{actor: refOf, rows: rowsFor(actor), hd: hdSummaryOf(...),
    settings, concentrationSummons: [{scene, token, effect}]}` (combat-riders-32). `settings`
    has all eight keys.
  - `arcaneRecovery(ref)` opens the Arcane Recovery picker for an owned wizard. It is
    `arcaneRecoveryDialog` exposed by `cast-flow.mjs` (combat-riders-32 extension).
  - `selftest()`.
  - The kit members `settings()`, `trace()`, `uninstall()` and `describe()` (combat-riders-13,
    riders half).
- `publishNamespace("riders", api, { moduleId: MODULE })` runs synchronously at `ready`. The
  `setTimeout(0)` at :654 goes, and the kit keeps its own re-alias tick (C26).
- **The relay (C30).** *(At `28ccc87`: option (a) has **landed** as kit 1.0.1, K3. The text below
  is kept as the reason.)* The kit's `guarded(fn)` called `fn(data)` and **dropped core's `{user}`
  context**, but the relay needs `user` for its ownership check (riders.mjs:645). Two options:
  - **(a) Preferred: a kit change.** **Passing `ctx` through is not enough.** `guarded` also
    rejects any sender who is not a GM (`if (sender && !sender.isGM) throw NOT_GM`), and the
    Battle Medic sender is a **player** by design (the relay checks the sender *owns the healer*).
    Plain `guarded(relay)` would reject every real call. The kit change must be: `guarded` passes
    `ctx` through as `fn(data ?? {}, ctx)` **and** takes an option for relays that accept
    non-GM senders (for example `guarded(fn, { sender: "any" })`, which keeps only the
    receiver-is-GM check). Both are additive for prompts, whose handlers ignore a second
    argument and keep the default. It goes in the kit with a test (player sender accepted with
    `sender: "any"`, rejected by default), then `vendor.py sync --all`.
  - **(b)** Keep the hand registration and accept C30 failing until (a) lands.

  With (a), the relay is registered as
  `CONFIG.queries["pentaryn-riders.battleMedic"] = guarded(relay, { sender: "any" })` inside the entry's `init`. It
  is not a manifest row: the API path `battleMedic` is the client-side runner, a different
  function. It is listed in `describe().queries` through `extras`. The inner
  `isGM && activeGM.isSelf` check stays. **[declared, failure path only]** A query that reaches a
  non-GM client now throws `NOT_GM: this client is not a GM` instead of `not the active GM`. That is
  unreachable in normal play, because the sender always targets `activeGM`. (With the default
  sender check a player's call would fail with `NOT_GM: <sender> is not a GM`, which is why the
  `sender: "any"` option is required.)
- Audit lines (use-doc §5.1 audit lines, combat-riders-27): the relay calls `log.info("battle medic relay",
  {uuid: target.uuid, ids:[healer.uuid], by: user?.id})` on success and `log.warn` with the
  reason before each throw. `runBattleMedic`'s warn gains the uuids. Thrown messages and return
  values stay the same.
- **Test first:**
  - `surfaceOf(api)` ⊇ `golden/surface-legacy.json`.
  - Each legacy member is called with the same fixtures, and its result equals the snapshot's.
    That covers the `report` rows oracle, the `hdPools` outputs, `preview("1d6[fire]",
    {rollType:"damage", types:["fire"], modifier:"min2"})`, and `setType(sorcerer, "fire")`
    returning the item names.
  - `inspect(sorcerer).rows` deep-equals the report rows, the depth is ≤ 4, and a JSON round
    trip is equal.
  - The relay oracle: same return value, same thrown messages, one `info` line on success, one
    `warn` per refusal.
  - New goldens: `golden/describe.json` (normalised) and `golden/surface.json`.
- **Absorbs:** C26, C27, C28, C29, C30 (with option a), C31 (rows documented), C50;
  combat-riders-13 (riders half), -27, -32.

### S7 — Pure kernels into core
- Add `core/hit-dice.mjs`, re-exported from the riders-core barrel so the barrel stays ≲ 600
  lines. It holds:
  - `hdPoolsFrom({isNPC, hd, classes})` (riders:313-326);
  - `hdSummaryOf(pools)` (:328-331);
  - `battleMedicBlockReason({hasTargetActor, hasHd, canSpend, ownsTarget, gmOnline})`, which
    returns `null` or an i18n key (:373-380). The caller localises it.
  - `reportRow(...)` (:587-619 loop body).
- In table-core (combat-riders-26 extension):
  - `slotsFrom(spells)` replaces cast-flow's two slot-table builders (:92-96, :220-227);
  - concentration:149-154 reads `{dc, failed}` from `concentrationResult` instead of
    recomputing them.
- Literals are copied exactly. riders.mjs maps Documents to these inputs.
- **Test first:** the S1 kernel oracles run against both the legacy functions and the new pure
  ones, from one table (use-doc §8 step 3).
- **Absorbs:** combat-riders-26.

### S8 — Adjustments batch (only while `foundry/adjustments.yml` is idle)
- Update `files` for `riders-argon-ritual-adept-list` (rituals.mjs and patches.mjs),
  `argon-shared-uses-badge` and `argon-collapse-on-area-placement` (argon-tidy.mjs and argon.mjs),
  and `dnd5e-chat-message-types` (riders file → `damage-riders.mjs`/`card-note.mjs`).
- `files` moves for the re-run's ten rows, in the same change as the S5 moves:
  - `dnd5e-summon-place-default`, `dnd5e-summon-wildcard-preview` and
    `argon-tooltip-item-rolldata` gain `patches.mjs`, because their markers `_prPlaceDefault`,
    `_prWildcard` and `_prItemRollData` move there.
  - `argon-metamagic-no-picker` keeps `skipsTargetPicker`/`METAMAGIC` in argon-tidy.mjs and
    table-core.mjs, and adds `patches.mjs`.
  - The other six keep their files: `dnd5e-summon-keeps-sidebar`, `dnd5e-restore-slot-default`,
    `dnd5e-usage-dialog-first-click`, `riders-arcane-recovery-picker`, `riders-argon-long-casts`
    and `dnd5e-concentration-auto-break`.
- C32 at `28ccc87` also fails `riders-arcane-recovery-picker` (a hook and a dialog, not a patch)
  and `riders-argon-long-casts` (it rides the Rituals `_renderInner` wrap). Pending D2:
  - name both rows from the Rituals `wrapMethod` if the kit accepts a list of `adjustments`;
  - otherwise use the interim renames `dnd5e-riders-arcane-recovery-picker` and
    `argon-riders-long-casts`.
- Add `concentration.mjs` to `dnd5e-chat-message-types.files` (combat-riders-16 extension).
- Add the riders rows from combat-riders-16:
  - `riders-dnd5e-damage-tray-preset` (markers `getTargetOptions`, `dnd5e.preCalculateDamage`);
  - `riders-dnd5e-roll-term-riders` (`postDamageRollConfiguration`, `resetFormula`);
  - `riders-dnd5e-sheet-hit-dice` (`meter.hit-dice`, `renderCharacterActorSheet`);
  - `riders-core-query-battle-medic` (`CONFIG.queries`).
- Grep each marker in its file first.
- **Test first:** misspell a marker in a scratch copy and confirm
  `make foundry-adjustments-check` fails.
- **Absorbs:** C32 (rows ↔ patches), C33 (manual list reviewed); combat-riders-16 (riders half),
  combat-riders-39 (rows).

### S9 — Docs
- README in use-doc §7 order, ≤ 250 lines. Today's 151 lines (146 in the snapshot) are reorganised:
  - "How it works" becomes "What the player sees", Data written, Two sessions (the relay) and
    Events (`n/a — emits none`).
  - "Setting up an actor" becomes "API" plus Extending.
  - "Adding a rider" stays under Extending.
  - Files carries the load order and the reason the order matters: the four
    `dnd5e.preUseActivity` listeners (rituals, then the two cast-flow defaults, then the Battle
    Medic veto), and the break label and concentration line running before the card note.
  - Settings lists all eight. Patches and adjustments lists the six patches.
- Also: a **"Which riders module?"** table, mirrored in combat's README and `melee.md`
  (combat-riders-17 step 2, **touches WAIT combat**). `CHANGELOG.md`. A routing row in
  `context/foundry/README.md` that replaces the folded "Table-feedback" mention.
- C36: the four rule-name literals (riders-core:62, 74, 86, 97) are rule identity, not UI text.
  Mark them as intentional in the manual list.
- **Test first:** in the `hooks.test` docs case, every manifest path appears in the README API
  section and every root `.mjs` appears under Files.
- **Absorbs:** C44, C45; combat-riders-17 (step 2, riders side), -31 (docs part).

### S10 — Wave 7 restart batch (module.json; once, with the other modules)
- `flags.pentaryn = { tier:"full", namespace:"riders", flagScope:"pentaryn-riders",
  cssPrefix:"pr-", generation:14, afterSync:[…] }`. The flagScope change is **metadata only**:
  the code has always written `flags.pentaryn-riders.*`, and nothing reads the old `"riders"`
  value (combat-riders-13).
- `relationships.recommends`:
  - `enhancedcombathud`: "Ritual Adept's Rituals group, the Longer casts group, shared-uses
    badges and panel collapse live on the Argon HUD".
  - `enhancedcombathud-dnd5e`: "the Cast Spell panel the Rituals and Longer casts groups are
    added to; Metamagic buttons skip its target picker; its spell tooltips get the spell's roll
    data".
- Move `styles: ["styles/riders.css"]` (`git mv riders.css styles/`) and set
  `compatibility.verified: "14.369"`.
- Restart.
- **Absorbs:** C06w, C07, C09, C38, and the `.pr-*` part of C37.

---

## 4. Findings that are NOT structural (standalone fixes)

| Finding / item | Fix | Why standalone | Test |
|---|---|---|---|
| combat-riders-23 (cleanup hook now concentration:74-87) | `isConcentration(effect, status)` in `table-core`. The cleanup hook returns early for non-concentration effects before scanning `game.scenes` × tokens | performance **[declared, edge]**: an effect whose `concentrating` status was stripped before deletion no longer cleans its summons (dnd5e never does that) | `isConcentration({statuses:new Set(["concentrating"])}, "concentrating")` is true; `{statuses:["dodging"]}` and `{}` are false. `summonTokenIds(tokens, "…dodge")` gives `[]` and `"…c1"` gives `["t1"]` |
| C37 Argon `#tooltip.ech-tooltip-container`, `#tooltip .ech-tooltip` (riders.css:53-54, unchanged at `28ccc87`) | CSS on another package's DOM; it has an adjustments row (`argon-tooltip-click-through`) | needs a decision in the Wave 8.6 Argon composition (combat's tooltips depend on transform's CSS today, transform-creatures-14). Moving or scoping it changes click-through **[declared]** | — |
| once-per-casting guard (`usedFromMessages(game.messages, origin)`, riders:145 [142]) | it scans the whole chat log on each damage roll; index it by `origin` | performance; noted in the audit summary, no finding id | equivalence on a 200-message fixture |
| combat-riders-12 (riders half) | legacy actor-taking rows get `withRef(…, "actor", {required:false})`: a name, id or UUID works, and a miss gives `null`. `battleMedic(healer, token)` keeps its Token semantics; resolving an Actor passed as `token` is a separate additive change | API hardening **[declared, failure path]** | resolver table: Actor, Token, UUID, id and exact name each give the actor; a substring gives null |

---

## 5. Declared behaviour changes (live-test workflow)

| # | Change | Step | What to watch |
|---|---|---|---|
| D-r1 | relay error text for a non-GM receiver (`NOT_GM: this client is not a GM`) | S6 | Battle Medic on an unowned target with the GM online still heals. With no GM, the player still gets the `noGM` warning |
| D-r2 | concentration summons are skipped for effects without `concentrating` | §4 | casting Summon Beast, then dropping concentration, removes the summon. Dodge ending removes nothing |
| D-r3 | legacy API refs resolve names, ids and UUIDs; a miss gives `null` | §4 | `game.pentaryn.riders.report("Esren")` works |
| D-r4 | Argon tooltip CSS ownership (if moved) | §4 / Wave 8.6 | Argon tooltips never swallow clicks, with combat on and transform off |

| D-r5 | none new from the re-run code: combat-riders-39 and -40 are pure moves plus debug-only logging | S3, S5 | Place Summons opens ticked; Animate Dead previews a real skeleton image; Careful Spell has no target picker; Scorching Ray's tooltip says 3 rays; a failed concentration save still ends concentration |

Verified as neutral in the steps:
- One `init` listener replaces three. The settings order and query registration are pinned.
- Publishing at `ready` instead of one tick later. The kit keeps the re-alias tick, and
  `module.api` and `pentaryn-riders.ready` are additive.
- The `WRAPPED` marker moves from the prototype to the replacement function. Grep the live tree
  before S5.

---

## 6. Effort

| Step | Size | Agent-days |
|---|---|---|
| S0 re-anchor (includes classifying `cast-flow.mjs`) | S | done (2026-10-11) |
| S1 characterisation (23-entry hooks pin, 8 settings, the patch pins of -39) | M | 1.5 |
| S2–S4 constants, log/i18n, settings | S | 0.75 |
| S5 entry wiring + six patches (cast-flow as a fourth feature) | M | 1.5 |
| S6 API, relay (+ kit `guarded` ctx + `sender:"any"` change, 0.25) | M | 1 |
| S7 kernels | S | 0.5 |
| S8 adjustments batch | S | 0.25 |
| S9 docs | S | 0.5 |
| S10 Wave 7 | S | (shared batch) |
| §4 standalone | S | 0.5 |
| **Total** | | **≈ 6.5 agent-days** (S0 done, the re-run code adds ≈ 0.75), plus two live-test round trips (D-r1/D-r3 together, D-r2). The Argon CSS decision (D-r4) waits for Wave 8.6 |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module riders --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
