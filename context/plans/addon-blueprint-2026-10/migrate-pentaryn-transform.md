---
title: Migration guide — pentaryn-transform to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, transform, wild-shape]
---

# Migrating `pentaryn-transform` to the blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

**Read this when:** you are about to bring `pentaryn-transform` (Wild Shape / Starry Form on the
Argon HUD) up to the addon blueprint. **Not this file:** the general procedure and the kit →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the design →
[`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) · the audit text →
[`../code-audit-2026-10/transform.md`](../code-audit-2026-10/transform.md) · the build record →
[`../druid-wild-shape.md`](../druid-wild-shape.md).

> **Re-anchored to 28ccc87 on 2026-10-11.** The usability re-run (17275c9) is committed and the
> working tree equals HEAD for this module. The snapshot already held the re-run's transform code
> (U-4-5 body-swap guard, U-4-10 Chalice, `isBodySwap` + fixture 141), so every `.mjs`, `module.json`,
> `README.md` and `WILDSHAPE-DESIGN.md` is byte-identical to the snapshot: **all snapshot line
> numbers in §1–§3 are also HEAD line numbers**. The only drift is `styles/transform.css` (+1 line,
> `flex-wrap: nowrap` at :42; no step cites a CSS line). Outside couplings re-checked (step 0.3, now
> filled in): combat's `TT` moved to combat/hud.mjs:157, senses' reader to light-core.mjs:127–139,
> and combat's forked `applyButtons` grew a `placeOpenDrawers` tail plus a fourth
> `renderActionPanelArgonComponent` handler (audit -12, extended). Steps: 0 resolved, 0 obsolete,
> 0 new. Re-score at HEAD: **48.8 % (20/41)**, failing set unchanged.

> **WAIT — do not start.** `pentaryn-transform` is on `scripts/foundry/blueprint/wait.json` (melee
> live-test workflow; entry collapse needs the hook-order fixture), and it composes the same Argon
> panels as `pentaryn-combat` (also WAIT) and writes through `pentaryn-senses`' light flag. Every
> step below was written against the frozen snapshot; when the flag lifts, **re-anchor first**
> (step 0) — snapshot line numbers are stale by definition. Steps that read combat
> (`hud.mjs:526-534`, the `pentaryn-tt` tooltip classes) must also be re-checked against combat's
> live tree, and the argon-kit work (transform-creatures-12) stays in Wave 8.6.

Line numbers are **snapshot** line numbers (= HEAD 28ccc87 lines for every file except `styles/transform.css`) (pentaryn `ee505c2` + the uncommitted tree of
2026-10-10 20:15 EDT). On 2026-10-10 the only live drift was one CSS line
(`styles/transform.css`, `flex-wrap: nowrap` after :41).

| | |
|---|---|
| Tier | **full** (actor flags, an API that writes, a core patch, a keybinding) |
| Kit | full tier + `patch` (the `_preUpdateOperation` wrap), `election` (`pickRunner` parity test only; the call site keeps core's copy, §3 step 3) |
| WAIT | **yes** — wait.json, and it touches the Argon composition shared with combat |
| Findings absorbed | transform-creatures-3, -4, -5, -6, -7, -8, -9 (superseded), -13 (part 1), -15, -16, -17, -18, -19, the transform part of -20, -22 (extraction half), -24 (Wave 7) |
| Standalone after | -1, -2, -10, -11, -21, -23 (neutral or declared fixes on the new seams); -12, -13 (parts 2-3), -14 (combat half) wait for combat (Wave 8.6) |
| Steps | 13 (step 0 plus 12) |
| Effort | **L**: about 5-6 days of agent work, one checkpoint, one adjustments-batch item, one Wave 7 item; Wave 8 work extra |
| Prerequisites | none beyond kit 1.0.1 (landed) — re-vendor with `vendor.py sync <short>` if the lock says 1.0.0 |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module transform --markdown`. No status changed on the snapshot. **Re-scored 2026-10-11 at 28ccc87 (live folder): 48.8 % (20/41)** — same 21 failing rules (C07, C12-C14, C16-C18, C20, C21, C23, C24, C27-C29, C35, C37, C40, C41, C43-C45), same warns (C02, C10, C37w, C49), same manuals (C31, C33, C49). |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today

Full tier: **48.8 % (20/41 fail-class rules)**. Warn: C02, C10, C37w, C49. Manual: C31, C33, C49.

| Rule | Today | Detail (snapshot) | Cleared by |
|---|---|---|---|
| C01, C03-C06, C08, C09 | pass | dnd5e declared; Argon + senses in `recommends` with reasons | |
| C02 (warn) | warn | `"minimum": "13"` | step 12 (-24) |
| C07 | **fail** | no tier/namespace/cssPrefix; `flagScope: "transform"` | step 12. Code writes `flags.pentaryn-transform.*` already (`MODULE_ID`), so metadata only |
| C10 (warn) | warn | hud.mjs 761/150, transform-core.mjs 638/600, transform.mjs 788/150 | steps 2, 5-6 |
| C11 | pass | core is pure | keep; barrel in step 2 |
| C12 | **fail** | `MODULE` 0×; transform-core.mjs:23 `MODULE_ID` | step 2 |
| C13 | **fail** | `WILDSHAPE-DESIGN.md` in the module | step 11 (-19) |
| C14 | **fail** | | step 1 |
| C15 | pass | | |
| C16 | **fail** | hud.mjs:17 and starry.mjs:21 import the entry `transform.mjs`; starry.mjs unclassified | steps 5-6 |
| C17 | **fail** | 20 module-scope `Hooks.on/once` in hud.mjs and starry.mjs | step 6 |
| C18 | **fail** | no features | step 6 |
| C19 | pass | emits none | |
| C20 | **fail** | | step 1 |
| C21 | **fail** | hud.mjs:529 (×2), transform.mjs:150 | step 4 |
| C22 | n/a | no settings (a keybinding only) | step 4 adds `KEYBINDINGS` |
| C23 | **fail** | hud.mjs:529 reads `pentaryn-combat` `fullAttack`/`multiattack` | **stays failing** until combat publishes `coversMultiattack(actor)` (-13 part 3, Wave 8.6) |
| C24 | **fail** | hud.mjs:39 empty catch | step 9 |
| C25, C26 | pass | | |
| C27, C28 | **fail** | | step 8 |
| C29 | **fail** | writes `flags.pentaryn-transform.wildshape` etc., no `inspect` | step 8 (-17) |
| C30, C32 | pass | (C32's regex misses the static `TD._preUpdateOperation =` wrap; step 4 routes it through `wrapMethod` anyway) | |
| C31 (manual) | manual | `shift`/`revert` return Actor\|null (legacy) | step 8 |
| C33 (manual) | manual | hud.mjs `ui.ARGON._` ×2, `panel._buttons` ×11, `CONFIG.ARGON` ×3, `_on*` ×2; rows argon-panel-injection, argon-target-picker-cancel, argon-bonus-used-tracking, argon-portrait-hp, argon-tooltip-clear, core-transform-unwrap, core-token-swap-no-animation | step 5 updates `files:` in those rows |
| C34 | pass | nested `PENTARYN_TRANSFORM` | |
| C35 | **fail** | two-branch `T` at hud.mjs:23, starry.mjs:23, transform.mjs:17 | step 7 |
| C36 | pass | | |
| C37 | **fail** | `.extended-combat-hud .pentaryn-*`, `.ech-tooltip.pentaryn-tt*`, `.pentaryn-starry-pick p` | step 10 (own classes → `ptf-*`); `.pentaryn-tt*` **stays failing** until combat stops depending on it (-14, Wave 8.6) |
| C37w (warn) | warn | 3 `!important` | removing them is [declared] (B5); not in this migration |
| C38 | n/a | | step 12 declares `ptf-` (free on 2026-10-10) |
| C39 | pass | ModuleSpec runs node-test | |
| C40, C41 | **fail** | | steps 1, 2, 8 |
| C43 | **fail** | `test/run.mjs` is the self-running suite (138 `check` calls) | step 1 (→ LEGACY) |
| C44, C45 | **fail** | README organised by version notes | step 11 (-18) |
| C46-C48, C52 | pass | | |
| C49 (warn+manual) | warn | `updateWorldTime` world iteration at starry.mjs:314 and transform.mjs:676, no `// hot:` comment | step 6 adds `// hot:` comments; -2 (standalone) removes the iteration on non-runner clients |
| C50, C51 | n/a | | steps 8, 4 |

**Expected after step 12:** 39/41 — C23 and C37 stay failing on the two combat couplings until Wave
8.6. Before Wave 7: 38/41 (C07).

## 2. Target layout

```
foundry/module/pentaryn-transform/
  module.json             Wave 7: flags.pentaryn {tier: full, namespace: transform, flagScope: pentaryn-transform,
                          cssPrefix: ptf-, generation: 14, afterSync}; minimum 14. esmodules UNCHANGED
                          ["transform.mjs", "hud.mjs"] until the Wave 8 collapse (D11)
  transform.mjs           ENTRY 0: file map; patches → bodyswap → wildshape → sweep → Hooks.once("ready", onReady)
                          → starry; publish in onReady                                             ≈ 110
  hud.mjs                 ENTRY 1 (until Wave 8): imports wiring.mjs; hudPanels.install(reg, ctx)     ≈ 25
  wiring.mjs              GLUE: the one log / reg / ctx shared by both entries (ES module cache)     ≈ 50
  transform-core.mjs      PURE barrel: MODULE (+ `export { MODULE as MODULE_ID }` for the legacy suite),
                          SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS ({}), EFFECT_ID; export * from core/* ≈ 60
  core/wildshape.mjs      PURE: snapshot core :26-330 + seams (step 3)                                ≈ 420
  core/hud.mjs            PURE: snapshot core :331-530 + HUD seams (step 3)                            ≈ 340
  core/starry.mjs         PURE: snapshot core :534-623 + Starry seams (step 3)                         ≈ 170
  core/bodyswap.mjs       PURE: snapshot core :624-637 + unwrapForcedScalars (step 3)                  ≈ 50
  settings.mjs            KEYBINDINGS (cancelTargetPicker), dnd5eAllowsPolymorphing(), combatMultiattackSettings() ≈ 50
  patches.mjs             wrapMethod: TokenDocument._preUpdateOperation (marker `pentarynUnwrapped`)    ≈ 40
  wildshape-adapter.mjs   ADAPTER: lookups, bonus mark, say, settleTokens, revert, shift, doShift, isRunner ≈ 470
  starry-adapter.mjs      ADAPTER: Starry lookups, applyStarry, assumeStarry, endStarry, setLight       ≈ 230
  argon.mjs               ADAPTER: dropTooltip, dropStaleTooltip, pickerOpen, cancelTargetPicker,
                          itemButtonClass, applyButtons, describeButton                                ≈ 110
  form-picker.mjs         UI: TT, paintBadge, picker, argonClasses (WildShapeButton, FormTile, StarryFormButton…) ≈ 340
  starry-dialog.mjs       UI: pickConstellation (DialogV2)                                              ≈ 20
  bodyswap.mjs            FEATURE: preUpdateToken animate:false guard                                   ≈ 30
  wildshape.mjs           FEATURE: preUse/postUse/transformActor, auto-revert, effects, world time, rests ≈ 220
  sweep.mjs               FEATURE: sweepSpentForms, scheduleSweep, its hooks                            ≈ 50
  starry.mjs              FEATURE: Starry hooks; contributes the `starry.*` API rows                    ≈ 110
  hud-panels.mjs          FEATURE: HUD hooks, bar composition, portrait, effects, live buttons, Chalice, pointermove ≈ 330
  api-manifest.mjs        PURE rows (legacy 7 + starry 4 contributed + inspect)
  api.mjs                 impl map, inspect() (-17), buildApiFor(ctx)                                  ≈ 120
  lib/                    errors, log, hooks, publish, resolve, settings, api, queries, flags, patch, election
  lang/en.json            unchanged keys
  styles/transform.css    own classes renamed ptf-* (step 10); .pentaryn-tt* kept for combat
  test/run.mjs (fixed; LEGACY = ["test/core-legacy.mjs"]), test/core-legacy.mjs (today's run.mjs, moved)
  test/{core,glue,hooks,api,i18n}.test.mjs, test/fixtures/{legacy-*.mjs, talo.mjs, foundry-extra.mjs}, test/golden/*.json
  test/graph-allow.json   starry-adapter.mjs → wildshape-adapter.mjs (say, isRunner, markBonusUsed)
  README.md, CHANGELOG.md
```

`test/graph-allow.json` holds the one adapter→adapter edge on purpose: the Starry actions spend the
Wild Shape use and post through the same chat helper. Merging both adapters would cross the 500-line
cap; a third "actors" adapter would only move the edge.

### Old → new map (snapshot)

**transform.mjs (787)**

| Lines | What | Goes to |
|---|---|---|
| 1-9 | header (says dnd5e 5.3.3, points at WILDSHAPE-DESIGN.md) | entry file map; README; fixed text (-18, -19) |
| 11-17 | imports, `T` | named imports per file; `T` → `_loc` (step 7) |
| 19-53 | core v14 `_preUpdateOperation` unwrap block | `patches.mjs` (`wrapMethod`, step 4); loop → core `unwrapForcedScalars` (-5) |
| 54-73 | body-swap `preUpdateToken` guard | `bodyswap.mjs` |
| 75-82 `settleTokens` | | `wildshape-adapter.mjs` |
| 84-137 `isRevertItem`, `original`, `wildShapeActivity`, `forms`, `isWildShapeForm`, `exists`, `activeFormOf` | lookups | `wildshape-adapter.mjs` (wildShapeActivity/forms use core `wildShapeActivityOf`/`formEntries` after step 3 proves equality — -3, -23 seam) |
| 139-171 | block messages, `canTransform` (reads `dnd5e.allowPolymorphing` at :150), `blockedShift` | adapter; the setting read → `settings.mjs` `dnd5eAllowsPolymorphing()` |
| 173-191 `say`, `RETURN_LINES` | chat | adapter |
| 193-215 | bonus mark (`markBonusUsed`, `bonusUsedNow`, `tokenOf`) | adapter |
| 217-330 | revert path | adapter |
| 331-530 | shift path (`shift`, `traitsHtml`, `refund`, `metaFor`, `shaping`, `shapeTokenForm`, `doShift`) | adapter; `refund` uses core `refundUpdate` (-4) |
| 533-617 | `dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.transformActor` | `wildshape.mjs` |
| 619-622 `isRunner` | | adapter (core `runnerIs` seam; -1 is standalone) |
| 624-735 | auto-revert, effect hooks, `updateWorldTime` (:676), rest hooks | `wildshape.mjs` (`// hot:` comment on :676) |
| 741-775 | `sweepSpentForms`, `scheduleSweep`, sweep hooks, sweep `once ready` | `sweep.mjs` |
| 777-787 | publish + frozen-root guard | entry `onReady` → `buildApiFor(ctx)` + `publishNamespace` (step 8) |

**starry.mjs (336)**

| Lines | What | Goes to |
|---|---|---|
| 1-15 | header (PHB text) | README "What the player sees"; feature header |
| 17-28 | imports, `T`, `STARRY_EFFECT_ID`, `SENSES` | starry-adapter (constants) |
| 30-128 | lookups, `constellationLabel/Img/Text`, `baseEffect` | starry-adapter; pure parts → core (-7) |
| 132-163 | `sensesActive`, `setLight`, `applyStarry` | starry-adapter |
| 165-239 | `BLOCKS`, `busy`, `assumeStarry`, `endStarry` | starry-adapter (`announceStarryOn`, `starryEndKey` — -4, -7) |
| 241-270 | Starry `preUse`/`postUse` hooks (sheet route, inline refund :257-259) | `starry.mjs` feature (refund → `refundUpdate`) |
| 272-283 `pickConstellation` | DialogV2 (`.catch(() => null)`) | `starry-dialog.mjs` |
| 285-327 | auto-end, effect hooks, world time (:314), rest | `starry.mjs` feature (`// hot:` on :314) |
| 331-336 | `once ready` extends `game.pentaryn.transform` with `starry` | removed in step 8: `starry.install` returns the contribution |

**hud.mjs (760)**

| Lines | What | Goes to |
|---|---|---|
| 1-27 | header, imports, `T`, `DND5eItemButton`, `built`, `liveButtons` | split per file; `liveButtons` → hud-panels |
| 29-75 | tooltip hygiene, pointermove (:48-52), target picker cancel | `argon.mjs` (functions); the pointermove listener is installed by `hud-panels.install` |
| 78-85 | `onTokenBody` + updateToken/deleteToken | `hud-panels.mjs` |
| 86-101 | keybinding at `once init` | `settings.mjs` `KEYBINDINGS` row; `hud-panels.install` does `reg.once("init", () => defineKeybindings(...))` at the same golden position |
| 103-170 | `TT`, `paintBadge`, `summaryInput`, `recoveryText` | `form-picker.mjs` (pure parts → core, -6) |
| 172-438 | `picker`, `argonClasses` | `form-picker.mjs` |
| 439-466 | `itemButtonClass`, `describe`, `applyButtons` | `argon.mjs` (`describe` renamed `describeButton` — file-local, never published) |
| 468-580 | `composeBonusBar`, `multiattackCoveredByFullAttack` (:526-534), `composeActionBar`, `composeSpecialBar` | `hud-panels.mjs`; the combat setting reads → `settings.mjs` `combatMultiattackSettings()` |
| 581-604 | `renderActionPanelArgonComponent`, `renderItemButtonArgonComponent` | `hud-panels.mjs` |
| 606-668 | portrait | `hud-panels.mjs` (`portraitText` → core, -6) |
| 669-717 | effect render, `refreshLive`, `updateItem`, `onStarryChange` | `hud-panels.mjs` |
| 719-760 | Chalice | `hud-panels.mjs` (`earnsChalice` → core, -6) |

**transform-core.mjs (637)**: :1-35 → barrel + `core/wildshape.mjs`; :36-330 → `core/wildshape.mjs`;
:331-530 → `core/hud.mjs`; :534-623 → `core/starry.mjs`; :624-637 → `core/bodyswap.mjs`. All verbatim;
the barrel re-exports every name so `test/core-legacy.mjs` keeps importing `../transform-core.mjs`.

## 3. Steps

The golden that every structural step must keep byte-identical is `golden/hooks.json` (39 rows, step
1). The only planned edit to it is in step 8 (one row removed, reason recorded).

### Step 0 — WAIT lift and re-anchor (no diff)

1. Only after `wait.json` drops `pentaryn-transform` (Joe confirms; the melee workflow is done).
2. `diff -ru <snapshot>/pentaryn/module/pentaryn-transform foundry/module/pentaryn-transform` (or
   `git diff ee505c2 -- foundry/module/pentaryn-transform` + `git status`): re-read every range in §2
   that a hunk touches and fix this file's line numbers before editing.
3. Re-check the outside couplings in their **live** trees: combat's `multiattack(actor)` result
   shape `{source, total}` and settings `fullAttack`/`multiattack`; combat's `TT = ["pentaryn-tt"]`
   (combat/hud.mjs:132 in the snapshot; **:157 at 28ccc87**); senses' carried-light reader of
   `flags.pentaryn-senses.light` (senses/light-core.mjs:130 in the snapshot; **at 28ccc87 the read is
   `lightEntries` :127–139, reached through `carriedLightOf` :145** — same contract). Checked
   2026-10-11: combat still exports `multiattack` (combat.mjs:227) and registers `fullAttack` /
   `multiattack` (settings.mjs); combat.css still has 0 `pentaryn-tt` rules. Re-check again at lift.
4. `conformance.py --module transform --markdown`.

### Step 1 — characterise (tests + vendored files; the checkpoint)

- `vendor.py sync transform --tier full --kit patch,election`.
- `git mv test/run.mjs test/core-legacy.mjs`; fixed `test/run.mjs` with
  `LEGACY = ["test/core-legacy.mjs"]` (the 138-check suite runs unchanged; clears C43).
- `test/fixtures/legacy-*.mjs` — verbatim oracles, Foundry reads injected as parameters (the only
  edit, noted in each header): `legacy-hud.mjs` (hud.mjs:125-163 `summaryInput`/`recoveryText` with
  `CONFIG.DND5E` maps injected; :449-454 `describe`; :526-534 as
  `legacyCovered({fullAttack, multiattack, ma, hasItem})`; :606-620 `portraitLine` data part;
  :690-695 prune predicate; :737-744 `earnsChalice`; the :48-52 decision),
  `legacy-starry.mjs` (starry.mjs:81-87, :98-102, :121-128, the :233 reason map, :257-259 refund
  arithmetic), `legacy-transform.mjs` (transform.mjs:36-46 unwrap loop with `isForced`/`valueOf`
  injected; :102-117 `wildShapeActivity`/`forms` loops with a resolver; :394-398 refund; :619-622;
  :676-683 candidate list).
- `test/hooks.test.mjs` (the -8 harness, made a node:test): stub `Hooks`, `document`
  (`addEventListener`), `foundry` (`documents.TokenDocument` with a static `_preUpdateOperation`,
  `data.operators` with `ForcedReplacement`/`DataFieldOperator` stubs), `CONST`; `await
  import("../transform.mjs")` then `await import("../hud.mjs")`; pin `golden/hooks.json`:

  | # | kind | event | file today |
  |---|---|---|---|
  | 1 | on | preUpdateToken | transform.mjs:66 |
  | 2-4 | on | dnd5e.preUseActivity, dnd5e.postUseActivity, dnd5e.transformActor | :533, :562, :585 |
  | 5 | on | updateActor | :632 |
  | 6-8 | on | createActiveEffect, updateActiveEffect, deleteActiveEffect | :645, :646, :654 |
  | 9 | on | updateWorldTime | :676 |
  | 10-12 | on | dnd5e.longRest, dnd5e.preShortRest, dnd5e.restCompleted | :695, :707, :718 |
  | 13-15 | on | updateToken, deleteToken, updateActor | :770, :771 |
  | 16, 17 | once | ready (sweep), ready (publish) | :775, :779 |
  | 18-24 | on | dnd5e.preUseActivity, dnd5e.postUseActivity, createActiveEffect, updateActiveEffect, deleteActiveEffect, updateWorldTime, dnd5e.restCompleted | starry.mjs:241-323 |
  | 25 | once | ready (extend api with `starry`) | starry.mjs:331 |
  | 26, 27 | on | updateToken, deleteToken | hud.mjs:84-85 |
  | 28 | once | init (keybinding) | hud.mjs:89 |
  | 29-33 | on | renderActionPanelArgonComponent, renderItemButtonArgonComponent, renderPortraitPanelArgonComponent, updateWorldTime, renderEffectArgonComponent | :581, :594, :657, :662, :686 |
  | 34 | on | updateItem | :696 |
  | 35-37 | on | createActiveEffect, updateActiveEffect, deleteActiveEffect | :710 |
  | 38, 39 | on | dnd5e.postUseActivity, deleteActiveEffect | :746, :759 |

  Also pin: one `document.addEventListener("pointermove", …, true)` before row 26; the patch applied
  once to the stub with `pentarynUnwrapped === true`; re-import does not double-wrap.
- `test/glue.test.mjs` with `installFoundry()` + the extra stubs above, a Talo-shaped druid
  (synthetic, from the legacy suite's fixtures), two users:
  - patch: a `recursive:false` update `[{x: F(100), y: F(null), texture: F({src:"a"}), name: "n"}]`
    → `x === 100`, `y === null`, texture still wrapped, same operation object mutated; `recursive`
    true → untouched (the -5 table, through the real wrap).
  - `preUpdateToken`: a body swap sets `options.animate = false`; a plain move does not; a throw
    inside logs `pentaryn-transform | body-swap animation guard skipped`.
  - publish: after `fire("ready")`, `Object.keys(game.pentaryn.transform)` ⊇ `shift, revert, forms,
    wildShapeActivity, original, isRevertItem, sweepSpentForms, starry` and `starry` ⊇ `assume, end,
    active, constellation` → `golden/legacy-surface.json` (subset); frozen root (`Object.freeze({import})`)
    → rebuilt, `starry` still present; `// KNOWN:` (-16) with the importer's freeze registered
    **after** transform's ready, the namespace is lost.
  - keybinding: `F.calls` `keybindings.register` `pentaryn-transform.cancelTargetPicker` with name key
    `PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name`, `editable: [{key:"Escape"}]`, precedence
    PRIORITY.
  - console texts (a fixed list, pinned verbatim): every `console.warn/error` literal in the three
    files (e.g. `pentaryn-transform | chat line failed`, `| revert failed`, `| shift failed`,
    `| transform failed`, `| HUD composition failed`, `| starry form failed`); `// KNOWN:` (-15) the
    `not carried into the form:` `console.log` on every linked shift; `// KNOWN:` silent catches at
    transform.mjs:492 (`""`), starry.mjs:280 (`null` → refund), hud.mjs:39, hud.mjs:533.
  - `dnd5e.allowPolymorphing` read on a non-GM shift check (`canTransform`).
  - `// KNOWN:` (-22) Starry world-time expiry iterates `game.actors` only (an unlinked druid token is
    not ended there); Wild Shape's iterates world actors + unlinked tokens on the viewed scene.
- `GOLDEN_UPDATE=1 node test/run.mjs` against unchanged code, then green. **Checkpoint:** Joe
  approves the `lib/` + `test/` diff (with the `run.mjs` → `core-legacy.mjs` move).

### Step 2 — core barrel (clears C12, C41, the core C10 warn)

- Split `transform-core.mjs` into `core/{wildshape,hud,starry,bodyswap}.mjs` (verbatim ranges in §2);
  `transform-core.mjs` becomes the barrel: constants (`MODULE = "pentaryn-transform"`,
  `export { MODULE as MODULE_ID }`, `SHORT`, `NS = "transform"`, `VERSION = "0.3.2"`, `CONTRACT =
  "pentaryn-transform/api@1"`, `I18N = "PENTARYN_TRANSFORM"`, `CSS = "ptf-"`, `FLAG_SCOPE = MODULE`,
  `HOOKS = Object.freeze({})`, `EFFECT_ID`) and `export * from "./core/<x>.mjs"` per file. The
  `core/` files must not import the barrel (a cycle, and C16 allows core → `core/*` only): the
  constants they need (`MODULE`, `EFFECT_ID`, `UNIT_SECONDS`) live in `core/constants.mjs`, which the
  barrel re-exports.
- `test/core.test.mjs`: barrel imported first and bare; `VERSION === module.json.version`; the
  barrel's export list equals the snapshot core's export list (so nothing was dropped).
- Legacy suite and glue unchanged.

### Step 3 — pure seams (absorbs -5, -6, -7, the pure halves of -3, -4, -17, -22; seams for -1, -2, -10, -11, -13, -23)

Add, each with a table written against the step-1 oracle **before** the function (row-by-row
equality), all pure:

| Seam | File | From | Finding | Table (abridged; full rows in the finding's `behaviourTest`) |
|---|---|---|---|---|
| `unwrapForcedScalars(operation, {isForced, valueOf})` | core/bodyswap | transform.mjs:36-46 | -5 | x→100, y→null, texture stays wrapped, name kept, returns 2, identity kept; updates undefined → 0; null entries skipped |
| `wildShapeActivityOf(items)` | core/wildshape | :102-109 | -3 | Talo → the WS activity (by `_id`); `[]` → null; first item wins when two own one |
| `refundUpdate(uses)` | core/wildshape | :394-398, starry :257-259 | -4 | `{spent:2}` → `{"system.uses.spent":1}`; 1 → 0; 0, -1, `"1"`, undefined → null |
| `runnerIs(selfId, who)`, `canRunAny({activeGMId, selfId})` | core/wildshape | :619-622 | -1, -2 | gm always wins; `('p1', null, ['p2','p1'])` true; non-GM with a GM present → false |
| `worldTimeCandidates(actors, tokens)` | core/wildshape | :677-683 | -22 | `[a1,a2]` + linked A, unlinked B, unlinked null → `[a1,a2,B]` (transform only; Starry keeps `game.actors`) |
| `formEntries(profiles, resolve)` | core/wildshape | :112-117 | -23 | output identical to today's mapping; today's resolver call count pinned (`// KNOWN:` 3 + 1 per empty name) |
| `shapeStatus(input)` | core/wildshape | (new, -17) | -17 | the Talo-as-Dire-Wolf object: `secondsLeft 21540`, `usesLeft 2`, `forms [{id:"p1",name:"Dire Wolf"}]`; not shifted → `form: null`; no Wild Shape → `wildShape: null, forms: []` |
| `earnsChalice`, `summaryFromSource`, `portraitText`, `recoveryLines`, `slotKind` | core/hud | hud.mjs:737-744, :125-154, :606-620, :156-163, :449-454 | -6 | Cure Wounds true; no slot false; cantrip false; healing/temphp parts true, fire false; portrait 21600 @ 60 → "5 hours 59 minutes"; recovery "Long Rest: all · Short Rest: 1" |
| `coveredMultiattackId({...})` | core/hud | :526-534 | -13 | active false / either setting false / ma null / source "flag" / total 1 / no item → null; `{source:"mmMulti", total:2}` + item → `"mmMulti"` |
| `pruneDisconnected(set)` | core/hud | :690-695 predicate | -10 | drops only `!isConnected && panel`; returns 1 on the 3-entry set |
| `shouldQueueStaleCheck({anchor, queued})` | core/hud | :48-52 | -11 | null → false; connected → false; disconnected+unqueued → true; queued → false |
| `pickStarryBase`, `isGenericActivityImg`, `secondsLeft`, `starryEndKey` | core/starry | starry.mjs:121-128, :98-102, :81-87, :233 | -7 | fly Dragon when Twinkling; plain Dragon; "Starry Form" for archer; `[]` → null; mystery-man/activity svg/'' → generic; `secondsLeft({start:100,seconds:600,now:400})` 300, negatives kept; incapacitated/expired/manual keys |

No glue change in this step: the seams are proved, not yet called (step 5 switches callers).

### Step 4 — wiring, settings, patch (clears C21; C22 pass; C51 pass)

- `wiring.mjs`: `log = makeLog(MODULE)`, `reg = hookRegistry(MODULE, log)`, `ctx` (template
  shape: `log, reg, setting, emit, api, contributions, exposed, expose(), features: [], uninstall`).
  Both entries import it; the ES module cache makes it one instance. Nothing else imports it.
- `settings.mjs`: `KEYBINDINGS = [{ key: "cancelTargetPicker", name:
  "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name", hint: "…Hint", editable: [{key: "Escape"}] }]`
  — no `onDown` and no `precedence` in the table: the kit's `defineKeybindings` passes both through
  to `game.keybindings.register` unchanged, so `precedence` must be the number
  `CONST.KEYBINDING_PRECEDENCE.PRIORITY` (a string `"PRIORITY"` would not be a valid precedence), and
  `onDown` is bound by `hud-panels` at install (it calls `pickerOpen`/`cancelTargetPicker` from
  `argon.mjs`, which `settings` may not import). `registerKeybindings({onDown})` maps the rows to
  `{ ...row, onDown, precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY }` at call time (`init`, so
  `CONST` exists) and wraps `defineKeybindings` in today's try/catch with the warn text
  `Escape-cancels-target-picker keybinding not registered` (verbatim). `dnd5eAllowsPolymorphing()` =
  `game.settings.get("dnd5e", "allowPolymorphing")`. `combatMultiattackSettings()` returns
  `{fullAttack, multiattack}` from the two `pentaryn-combat` reads — **C23 still flags it**; that is
  the documented coupling until combat publishes `coversMultiattack` (§4).
- `patches.mjs`: `install()` = today's guard conditions (`TD` has own `_preUpdateOperation`,
  `Ops.ForcedReplacement` exists) then `wrapMethod(MODULE, { target: TD, name: "_preUpdateOperation",
  marker: "pentarynUnwrapped", label: "TokenDocument._preUpdateOperation", adjustments:
  "core-transform-unwrap" }, function (wrapped, documents, operation, user) { if (operation?.recursive
  === false) unwrapForcedScalars(operation, { isForced: v => v instanceof Ops.ForcedReplacement,
  valueOf: v => Ops.DataFieldOperator.get(v) }); return wrapped(documents, operation, user); }, { log
  })`. `this` is preserved by `make.call(this, …)`; the marker literal stays here. Called **first** in
  `transform.mjs`'s body, at module evaluation exactly as the block at :32 runs today.
- Before-tests: glue patch cases and keybinding pin unchanged; hooks golden unchanged (no hook moved
  yet). New: `patches()` record carries `adjustments: "core-transform-unwrap"`.

### Step 5 — adapters and UI files (clears C16's entry imports; absorbs -3, -4 call-site halves)

Moves, verbatim except where a step-3 seam with proven equality replaces an inline copy:

- `wildshape-adapter.mjs` ← transform.mjs:75-530 and :619-622 (lookups use `findWildShapeItem` /
  `wildShapeActivityOf` — -3; `refund` uses `refundUpdate` — -4; `canTransform` calls
  `dnd5eAllowsPolymorphing()`).
- `starry-adapter.mjs` ← starry.mjs:26-239 (`wildShapeItemOf` → `findWildShapeItem`; `announceStarryOn`
  replaces the two StarryOn blocks — -4; `baseEffect`/`constellationImg`/`starrySecondsLeft`/end key
  → the -7 seams). It imports `say`, `isRunner`, `markBonusUsed` from `wildshape-adapter.mjs` (the
  `graph-allow.json` edge).
- `starry-dialog.mjs` ← starry.mjs:272-283.
- `argon.mjs` ← hud.mjs:29-75 (functions only), :439-466.
- `form-picker.mjs` ← hud.mjs:103-438 (pure parts call the -6 seams).
- `transform.mjs`, `starry.mjs`, `hud.mjs` keep their hooks in this step and import from the new
  files; nothing imports `transform.mjs` any more.
- Adjustments batch (file idle): update `files:` of argon-panel-injection, argon-target-picker-cancel,
  argon-bonus-used-tracking, argon-portrait-hp, argon-tooltip-clear, core-transform-unwrap,
  core-token-swap-no-animation to the new call-site files (`form-picker.mjs`, `argon.mjs`,
  `hud-panels.mjs`, `wildshape-adapter.mjs`, `patches.mjs`, `bodyswap.mjs`), markers unchanged —
  the `adjustments` gate greps markers in the listed files, so this must land with the move. Row ids
  keep their names (renaming to `transform-*` is optional and only if nothing references them).
- Before-tests: every glue pin and the 39-row golden unchanged; console texts unchanged.

### Step 6 — features and the two entries (clears C17, C18, C16 fully; C49 `// hot:` comments)

- `bodyswap.mjs`, `wildshape.mjs`, `sweep.mjs`, `starry.mjs`, `hud-panels.mjs` each export
  `install(reg, ctx)` / `uninstall()` with today's handler bodies registered through `reg.on/once` in
  today's order and labels. `starry.mjs` keeps its `reg.once("ready", …)` that extends the published
  API **in this step** (row 25), so the golden stays 39 rows. `hud-panels.install` adds the pointermove
  listener first, then rows 26-39, binding the keybinding's `onDown` and registering it through
  `reg.once("init", …)` at row 28.
- `transform.mjs` (entry 0) body, in this order: `patches.install()`; `bodyswap.install` (row 1);
  `wildshape.install` (rows 2-12); `sweep.install` (rows 13-16); `Hooks.once("ready", onReady)` (row
  17, still today's publish block); `starry.install` (rows 18-25). `hud.mjs` (entry 1):
  `hudPanels.install(reg, ctx)` (rows 26-39). Every `install` runs synchronously at module
  evaluation (use-doc §6, migrating modules) — the same registration moment as today.
- `// hot: <cache>` comments at the two `updateWorldTime` handlers (transform.mjs:676, starry.mjs:314)
  naming what they iterate; the iteration itself stays (-2 is §4).
- `uninstall()` (wired in step 8) calls every feature's `uninstall` in reverse and `reg.offAll()`;
  `hud-panels.uninstall` removes the pointermove listener and clears `liveButtons`, the Chalice timers.
- Before-tests: the 39-row golden, all glue pins, legacy suite.

### Step 7 — i18n literals (clears C35)

- The three `T` wrappers go; every call becomes `_loc("PENTARYN_TRANSFORM.…", data)` with the full
  literal key (v14 `localize` interpolates; `_loc(key)` without data = `localize`). Template-built
  keys stay template-built and are proven by `test/i18n.test.mjs`: `constellationLabel`
  (`PENTARYN_TRANSFORM.Starry.${Archer|Chalice|Dragon}`), `PENTARYN_TRANSFORM.Chat.${starryEndKey}`,
  `RETURN_LINES`/`BLOCK_MESSAGES` maps.
- `i18n.test.mjs`: every `KEYBINDINGS` label key exists; every template-built key exists; no
  two-branch wrapper (`sourceScan`).
- Before-test: a rendered-string table (`_loc` stub + `lang/en.json`) for the chat lines and HUD
  labels equals the step-1 strings.

### Step 8 — API manifest and kit publish (absorbs -16, -17; clears C26-C29, C50) — one **[declared]** golden edit

- `api-manifest.mjs` rows, `legacy: true`, params named as today (none named `ref`, so `bind` passes
  them through): `shift(actor, profileId)` (writes, returns Actor\|null — README lists the null
  reasons from -18), `revert(actor, {quiet, reason})` (writes), `forms(actor)` (returns live Actors,
  legacy), `wildShapeActivity(actor)`, `original(actor)`, `isRevertItem(item)`, `sweepSpentForms()`
  (writes, gm). `starry.mjs` `install` **returns** the contribution `{rows: [starry.assume,
  starry.end, starry.active, starry.constellation], impl}` and drops its `ready` extension.
  `flags: { writes: ["flags.pentaryn-transform.wildshape", "flags.pentaryn-transform.revert",
  "flags.pentaryn-transform.starry", "flags.pentaryn-senses.light"], reads: ["flags.dnd5e.originalActor",
  "flags.dnd5e.isPolymorphed", "flags.dnd5e.transformOptions", "flags.dnd5e.previousTokenData"] }`.
- New row `inspect(ref, opts)` (-17, additive, read-only): `ref` resolved by the kit's exact-match
  `resolveRef` (never substring; scene scope only via `opts.sceneId`), returns `toPlain(shapeStatus({
  …live reads… }))`, depth ≤ 4. The finding's custom resolver is replaced by the kit's.
- `onReady`: `buildApiFor(ctx)` first (drift → one `log.error`, nothing published), then
  `publishNamespace("transform", api, { moduleId: MODULE })`. The guard block (:777-787) goes.
- **[declared]**, its own commit: `golden/hooks.json` loses row 25 (starry's `once ready`), reason
  "api.starry is a contribution built into the one frozen API (-16)". API frozen, kit members,
  `module.api`, ready hooks; `api.starry` no longer depends on hook order.
- Tests: `api.test.mjs` (rows ↔ impl incl. the starry contribution; `golden/describe.json`,
  `golden/surface.json` first writes; `inspect(talo)` depth ≤ 4 and the -17 shape; `resolveRef`
  substring → `NOT_FOUND`); `hooks.test.mjs` asserts the 38-row golden plus `uninstall()` leaves no
  listener; the step-1 legacy-surface subset still holds; the `// KNOWN:` load-order row flips (the
  namespace survives either order).

### Step 9 — logging (absorbs -15 and -13 part 1; clears C24) — **[declared], console-only**

- One `log` from `wiring.mjs`; every `console.warn/error(\`${MODULE_ID} | …\`, err)` → `log.warn/error("…",
  err)` (byte-identical text — the step-1 pins do not move).
- Moves (pins move, own commit): transform.mjs:593 `console.log("… not carried into the form: …")` →
  `log.debug` (shown only with `CONFIG.debug["pentaryn-transform"] = true` — the kit's key, not the
  finding's `pentarynTransform`); transform.mjs:492 `.catch(() => "")` → `.catch(err => { log.debug(
  "traits enrichment failed", {source: source.uuid}, err); return ""; })`; starry.mjs:280 likewise
  returning `null`; hud.mjs:39 → `log.swallow("tooltip hygiene", …)`; hud.mjs:533 → `log.warnOnce(
  "combat-multiattack", "combat multiattack read failed", err)` returning `null`. Return values
  identical (pinned).

### Step 10 — CSS scope (clears C37 except the combat-owned tooltip block)

- Rename transform's own classes to the `ptf-` prefix in `form-picker.mjs`, `hud-panels.mjs`,
  `starry-dialog.mjs` and `styles/transform.css` in one commit: `pentaryn-return`, `-empty`,
  `-starry-on`, `-starry-act`, `-chalice-ready`, `-hidden`, `-picker`, `-current`, `-effect`,
  `-form-line`, `-starry-pick`, keyframes `pentaryn-chalice-pulse` → `ptf-…`. Keep
  `.chat-message .pentaryn-transform-line` (already scoped; the class is in saved chat messages) and
  **keep `.ech-tooltip.pentaryn-tt*`** — combat's `TT = ["pentaryn-tt"]` depends on these rules
  (-14). Test: old→new map is a bijection over the selector set and the class strings in code (-14's
  test); no `pentaryn-<old>` string left except the two kept families.
- Not visible at the table if the bijection holds; a glance in the live smoke.

### Step 11 — docs (absorbs -18, -19, -20; clears C13, C44, C45)

- `git mv WILDSHAPE-DESIGN.md context/plans/wildshape-hud-design.md` with a "superseded by the README
  for use; history only" line; fix the three pointers (README:7, transform.mjs:9 header,
  `context/plans/druid-wild-shape.md:5`; the README Status section points at druid-wild-shape.md, not at the design file); stale-reference grep count 0.
- README in use-doc §7 order: What the player sees (0.2/0.3 sections' player text), Settings (the Escape
  keybinding; `n/a` for world settings), API (method | args | returns | null when | GM-only — the
  -18 list; `inspect` shape), Data written, Flags other modules read (senses `light` flag contract —
  -21; combat multiattack + `pentaryn-tt` coupling — -13/-14), Events `n/a`, Patches and
  adjustments (the seven rows), Two sessions (runner election, `isRunner`), Extending, Pitfalls
  (the open items list from README:204-211, `// KNOWN:` rows, the -22 inconsistency), Files, Tests,
  Sync (restart only for module.json). Real sweep timing (fixed 3 s, 1.5 s quick, 10 s age guard)
  replaces README:167-169. Version notes → `CHANGELOG.md`. `transform.mjs` header says dnd5e 6.
- Route row in `context/foundry/README.md` (Wild Shape / Starry Form / Return / Change Form / a form
  left in the sidebar → this README) — -20.
- Pending-wiring batch: `config.py:170-176` `after_sync` made version-neutral (-18).

### Step 12 — Wave 7 restart batch (C07, C02; -24)

`flags.pentaryn` (`tier: "full"`, `namespace: "transform"`, `flagScope: "pentaryn-transform"`,
`cssPrefix: "ptf-"`, `generation: 14`, `afterSync`), `compatibility.minimum: "14"` (-24). `esmodules`
stays `["transform.mjs", "hud.mjs"]` — **-9 is superseded**: `starry.mjs` is now reachable from entry 0
and installed by it, so listing it is no longer needed. Then add the `NS/CSS/FLAG_SCOPE` assertions to
`core.test.mjs`.

### After this migration (Wave 8, not part of it)

- Collapse `hud.mjs` into entry 0 (`esmodules: ["transform.mjs"]`) once
  `foundry/lib/test/fixtures/hook-order.mjs` proves the cross-module order of
  `renderActionPanelArgonComponent` against combat and riders is unchanged (B3, D11). At 28ccc87 combat
  has three such handlers (combat/hud.mjs:739, :931 `restorePips`, turnflow.mjs:168) besides transform's
  hud.mjs:581 — the fixture must cover all four.
- `argon-kit.mjs` replaces `argon.mjs`'s forked helpers (-12, Wave 8.6, after combat).

## 4. Findings that stay standalone

| Finding | Kind | Lands as | Notes |
|---|---|---|---|
| transform-creatures-1 | perf, neutral | `isRunner` short-circuits on an active GM using `runnerIs` | identical result (fixture: a GM always wins) |
| transform-creatures-2 | perf, **[declared]** | early return in the two world-time handlers via `canRunAny` | non-GM clients stop iterating while a GM is active; no-GM fallback unchanged |
| transform-creatures-10 | hardening | `pruneLive()` at the start of `composeBonusBar` using `pruneDisconnected` | memory only |
| transform-creatures-11 | perf, **[declared]** small | pointermove pre-check via `shouldQueueStaleCheck` | a tooltip whose anchor disconnects within 60 ms after a move is dropped on the next move |
| transform-creatures-21 | test | `scripts/tests/test_module_contracts.py` (node subprocess: transform-core `STARRY_LIGHT` vs senses `carriedLightOf`) | needs senses' live tree (senses is WAIT) |
| transform-creatures-23 | perf, neutral | tooltip count from `availableProfiles.length`; `forms()` via `formEntries` (one resolve per profile) | the resolver-count pin moves (3 + empties → 3) |
| transform-creatures-12 | defrag | argon-kit, Wave 8.6 | combat is WAIT. Extended 2026-10-11: combat's `applyButtons` now also calls `placeOpenDrawers(panel)` — the kit superset takes it as an optional hook |
| transform-creatures-13 parts 2-3 | contract | adjustments row `transform-reads-combat-multiattack` (markers `multiattackCoveredByFullAttack`, `pentaryn-combat`) in the adjustments batch; combat publishes `coversMultiattack(actor)` and transform calls it → C23 clears | part 3 waits for combat |
| transform-creatures-14 combat half | CSS | copy the `.pentaryn-tt` block into combat (or argon-kit) and only then rename it → C37 clears | combat is WAIT |
| transform-creatures-22 behaviour half | live decision | Starry world-time expiry for unlinked druid tokens | live test first |

## 5. Declared behaviour changes — live-test handoff

| # | Step | Change | How to see it | Table time |
|---|---|---|---|---|
| T-D1 | 8 | API frozen; kit members; `module.api`; ready hooks; `api.starry` built in, independent of hook order | `game.pentaryn.transform.describe()`, `.starry.active(talo)` | live smoke |
| T-D2 | 8 | `inspect(ref)` added (read-only) | `game.pentaryn.transform.inspect("Talo")` while shifted | live smoke |
| T-D3 | 9 | stripped-items line only under `CONFIG.debug["pentaryn-transform"]`; silent failures now logged at debug / warn-once | console | no |
| T-D4 | 10 | own CSS classes renamed `ptf-*` | Wild Shape picker, Return/Change Form glow, Starry button, Chalice pulse, portrait line look unchanged | yes, a glance |
| T-D5 | 12 | `minimum: "14"` | install gating only | no |
| T-D6 | §4 -2 | world-time loops skipped on non-GM clients while a GM is active | Wild Shape still ends after 6 h / Starry after 10 min with a GM connected; with **no** GM connected the owner's client still ends it | yes |
| T-D7 | §4 -11 | pointermove pre-check | a stale tooltip after a form swap still disappears on the next mouse move | yes, a glance |
| T-L1 | — | open, not a change: unlinked NPC druid's Starry Form is not ended by the world-time fallback (-22) | unlinked druid token, Starry Form, advance time past 600 s with the expiry action off | decision |

Live smoke after sync: shift Talo into a form and back from the HUD; Starry Form on/off;
`describe().version === "0.3.2"`; `inspect("Talo")` depth ≤ 4; `selftest` n/a.

## 6. Decisions and risks

- **Two entries kept** (D11): the wiring is shared through `wiring.mjs`, an entry-only glue file.
  The collapse is Wave 8 with the order fixture; doing it here would hoist `hud.mjs`'s registrations
  relative to other modules' entries.
- **One adapter→adapter edge** in `graph-allow.json` (starry-adapter → wildshape-adapter).
- **C23 and C37 stay failing** until combat moves; both are documented couplings, not regressions.
- Risk: the core split (step 2) must avoid an import cycle (`core/constants.mjs`); the barrel's
  export list is pinned against the snapshot's.
- Risk: the patch must still run at entry-0 evaluation, before any `preUpdateToken` registration
  (step 4 places `patches.install()` first).
- Risk: features installed from entry 0 must keep today's interleaving with the publish `ready`
  (step 6 order) — the 39-row golden catches any slip.

## 7. Effort

| Step | Effort |
|---|---|
| 0 re-anchor (combat/senses couplings too) | 1-2 h |
| 1 characterise (hook harness, operator stubs, Argon-free glue, console list) | 1 day |
| 2-3 core barrel + 15 seams with oracle tables | 1 day |
| 4-6 wiring, adapters, UI, features | 1.5 days |
| 7-9 i18n, API manifest + inspect, logging | 1 day |
| 10-11 CSS rename, docs, design-doc move | 0.5-1 day |
| 12 Wave 7 | batched |
| **Total** | **L, ≈ 5-6 days** plus checkpoint, adjustments batch, restart item; §4 standalone fixes ≈ 1 day more; Wave 8 collapse and argon-kit separate |

## Known bugs — fixed before migrating

Fixed on `fix/playtest-2026-10-11` (wave-1 play test, `wave-1-playtest.md`), version **0.3.3** —
re-anchor before step 1: the step-2 `VERSION` constant is `"0.3.3"`, and line numbers in §1–§3
drift in `hud.mjs`, `transform.mjs` and `transform-core.mjs`.

| Finding | Fix | Where it lands in the target layout |
|---|---|---|
| PT3-3 no "Return to <druid>" without a revert item | `planBonusBar` emits `{ revert: true, highlight: true }` when shifted with no `revertId`; `hud.mjs` `ReturnButton` (pseudo-item `ItemButton`) calls the new `transform.mjs` `returnToNormal(actor)`, which the revert item's `postUseActivity` also uses | plan → `core/hud.mjs`; `ReturnButton` → `hud-buttons.mjs`; `returnToNormal` → the wildshape adapter beside `revert` |
| PT3-4 Starry Form carried into beast forms | core `isStarryFormData` + `stripReason` reason `"starry-form"` (after the Wild Shape-target rule, so Talo still reads `spends-wildshape`); `composeBonusBar` passes `starryId` while shifted | `core/wildshape.mjs` (strip), `hud-panels.mjs` |
| PT3-6 Esc with the Change Form picker open opens the game menu | the existing `cancelTargetPicker` keybinding (same id) also closes `.pentaryn-picker.show`; hint text updated | step 4 keybinding; the literal-key list in step 7 keeps the same keys |
| PT3-7 no chat line on the sheet's Restore Transformation | `Hooks.on("dnd5e.revertOriginalForm")` in `transform.mjs` posts the manual line for a Wild Shape form not in `reverting` | **new hook row** for the step-1 `golden/hooks.json` table (transform.mjs:330, registered between rows 1 and 2: `preUpdateToken` → **`dnd5e.revertOriginalForm`** → `dnd5e.preUseActivity`) → `wildshape.mjs` |

Tests added: core legacy checks 150–156 in `test/run.mjs`, and `test/playtest.test.mjs` (node:test
on `test/kit/foundry-stub.mjs`, byte-identical to `foundry/lib/test-kit/`). `test/run.mjs` now also
runs `test/*.test.mjs`; step 1's fixed `run.mjs` body supersedes that tail, and its glue test
should absorb `playtest.test.mjs`'s cases. New exports for step 2's barrel/export-list pin:
`isStarryFormData` (core), `returnToNormal` (transform.mjs).

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module transform --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
