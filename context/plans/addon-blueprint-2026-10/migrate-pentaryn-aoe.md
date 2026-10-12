---
title: Migrating pentaryn-aoe to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, aoe]
---

# Migrating `pentaryn-aoe` to the blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

**Read this when:** you are about to bring `pentaryn-aoe` up to the addon blueprint, as part of the
fix phase after the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the order across modules
→ [`migration-order.md`](migration-order.md), where aoe is #17 and goes late · the audit findings in
full → `context/plans/code-audit-2026-10/aoe.md` · using aoe →
[`../../foundry/aoe.md`](../../foundry/aoe.md).

> **Re-anchored to 28ccc87 on 2026-10-11.** Line numbers below are now HEAD lines (the working tree
> equals HEAD for this module); snapshot lines are kept in brackets where they help. The only commit
> touching the module since the snapshot is the usability re-run `17275c9` (0.3.0 → 0.3.1): Part F
> `refund.mjs` (U-5-12), Part G `aim.mjs` (U-6-5), Careful Spell in `resolve.mjs` (U-5-11, U-9-8),
> same-usage superseding (U-5-13), the players' status line (U-5-14), untargeted touch spells
> (U-6-3), no same-spell stacking (U-6-4), 6 booleans. `areas.mjs`, `hooks.mjs`, `escape.mjs`,
> `attacks.mjs` are byte-identical to the snapshot. Live score **45.2 % (19/42)** (snapshot 50.0 %;
> C26 now scored, C37 new). No step was resolved or made obsolete; S1, S3, S5, S6, S7, S8 and ADJ
> gained the new code, and finding **aoe-movement-portals-44** (Part G's hand-made prototype wrap)
> is new and lands in S6 with -15. Node suite: 160 checks (snapshot 135).

> **Re-anchored for wave 4 on 2026-10-11 (`migrate/wave-4`, base `a5a1a906`).** `git log 28ccc87..wave-4-base
> -- foundry/module/pentaryn-aoe` is empty, so every HEAD line number below still holds. The checkpoint
> step appended an `_internals` seam (2–3 lines) at the END of `escape`, `effects`, `resolve`, `refund`,
> `settings`, `areas`, `aim` and `tray.mjs`; no anchor above a file's last line moved. `resolve.mjs` is
> now 499 lines (C10 cap 500). Live score at the base: **50.0 % (23/46)** (the scorer's denominator
> grew to 46); warnings C06w, C59 (`areas.mjs:252`, `resolve.mjs:470`: per-document writes in a loop,
> an 8.5 performance item for S4/S5). After the checkpoint: **58.7 % (27/46)** (C14, C20, C41, C43
> clear; C41 passes on the scorer's text match while the VERSION test itself is a todo until S2).

## WAIT — every step re-anchors first

`pentaryn-aoe` is in flux under the live-test (usability/melee) workflow: it is listed in
`scripts/foundry/blueprint/wait.json`. **Do not edit it until that entry is lifted.** When it is,
re-anchor every step:
1. `git diff 28ccc87 -- foundry/module/pentaryn-aoe` (this guide's re-anchor base; the original
   base was `ee505c2` plus the uncommitted tree).
2. `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module aoe --markdown`.
3. Re-locate each quoted anchor. Snapshot line numbers are hints; the anchor text is the authority.

The live tree had **already moved** when this guide was written. Snapshot =
`ee505c2` + the uncommitted tree as of 2026-10-10 20:15. Those changes are now committed in
`17275c9`; the table below is the snapshot → `28ccc87` delta.

| Change since the snapshot (all in `17275c9`) | Size | Effect on this plan |
|---|---|---|
| new `refund.mjs` (Part F, 67 lines, U-5-12, `installRefund`: a **synchronous** `dnd5e.postUseActivity` listener registered with raw `on()` at `refund.mjs:53`, unguarded on purpose) | +67 | a sixth feature. Keep it **unguarded** (`reg.on(…, { guard: false })`): its comment says `Hooks.call` honours a literal `false` only. Two swallowed rejections at `:44`, `:45` (finding -9) |
| new `aim.mjs` (87 lines, U-6-5, `installAim`, `dnd5e.preCreateMeasuredTemplate`, guarded) + a hand-made wrap of `RegionLayer.prototype.placeRegions` (`aim.mjs:62–82`) | +87 | a seventh feature; the wrap goes through `wrapMethod` in S6 (finding **-44**, D-A7) |
| `resolve.mjs` (435 → 496 lines): Careful Spell `carefulKey` / `carefulFor` / `onCarefulUsed` (`:224–261`), two new guarded hooks `dnd5e.postUseActivity(careful)` and `deleteCombat(careful)` (`:464–476`), `npcSave` flag on NPC save messages (`:273`), `supersedes` from core | +61 | the hooks golden (S1) and S7's `flags.writes` grow; `resolve.mjs` is 4 lines under the 500-line feature cap, so S4's adapter extraction is now needed for C10, not just tidy |
| `effects.mjs` (274 → 310): `onPreCreateEffect` + `spellOf` (`:114–143`), a guarded `preCreateActiveEffect` hook (`:309`) | +36 | one more hook in the golden |
| `tray.mjs` (123 → 151): `decoratePlayer` (`:89–110`) for players; imports `setting` | +28 | tray pins (S1) need a player-client case |
| `settings.mjs` (81 → 90): 6 more booleans (`carefulSpell`, `refundCancelledArea`, `playerStatus`, `untargetedSelf`, `noSpellStacking`, `aimSelfAreas`) in `DEFAULTS` and `BOOLS` | 16 booleans + `npcSaveRollMode` | the S3 table has 17 rows. **Registration order = `BOOLS` order, then `npcSaveRollMode`**, not `DEFAULTS` order |
| `core.mjs` (314 → 459): `selfApplyReason` widened, `sameSpellEffect`, `aimFromCaster`, `aimsFromCaster`, `supersedes`, `carefulTargets`, `protectRows`, `carefulStale`, `carefulApplies`, `placementCancelled`, `playerStatus` (all pure); `test/run.mjs` 256 → 337 (160 checks) | | C11 stays green; still under 600 |
| `installHooks()` (`aoe.mjs:60–70`) calls `installRefund()` and `installAim()` after `installEffects()` | | FEATURES order: areas, resolve, tray, attacks, effects, refund, aim, escape |
| `aoe.css` +5 (`.pa-careful`, `.chat-message .pa-status`); `lang/en.json` +22; `module.json` 0.3.0 → 0.3.1; 7 new aoe `adjustments.yml` rows (between `:675` and `:794`, interleaved with other modules' rows) | | C37 fails until W7; ADJ grows; S1's `VERSION` pin is `0.3.1` |

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | K10 hooks.test migration mode / adapter exception — open (the `ctx` sharing line landed in use-doc §4.1); R1 C32 vs non-patch rows — **blocked on D2**; until then use the package prefix for non-patch rows (use-doc §5.6); R2 C26 named publish timer — **landed** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module aoe --markdown`. On the snapshot it moved 50.0 % → 47.6 % (R2: `setTimeout(publish, 0)` now fails C26, as §1 already predicted; C33 now lists private internals). **Live at 28ccc87 (2026-10-11): 45.2 % (19/42)** — the extra failure is C37 (the re-run's `.chat-message .pa-status`, clears at W7) |
| Note-only findings | aoe-movement-portals-39, -40 are gap-fill stubs: `audit-findings.json` holds only id and title (no file or line); the full text is in [`../code-audit-2026-10/aoe.md`](../code-audit-2026-10/aoe.md) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today — 45.2 % live at 28ccc87 (19 / 42 fail-class rules); snapshot 50.0 % (21 / 42)

First scored against the snapshot; the **Today** column and the details are re-scored live at
`28ccc87` on 2026-10-11 (`conformance.py --module aoe --markdown`). Two rules changed state: C26
(now scored, R2) and C37 (new re-run CSS). W7 means the Wave 7 restart batch (`module.json`, synced
once). ADJ means the adjustments batch.

| Rule | Class | Today | Detail (snapshot) | Clears at |
|---|---|---|---|---|
| C01 | fail | pass | — | — |
| C02 | warn | pass | — | — |
| C03 | fail | pass | dnd5e touched and declared | — |
| C04 | fail | pass | — | — |
| C05 | fail | pass | — | — |
| C06 / C06w | fail / warn | pass / **warn** | `aoe.css` at the root | W7 (→ `styles/aoe.css`) |
| C07 | fail | **fail** | missing tier, namespace, cssPrefix; `flagScope: "aoe"` | W7. **No data migration:** the code already writes `flags["pentaryn-aoe"]` (`core.mjs:11 aoeFlags`; `MODULE = "pentaryn-aoe"`), so only the `module.json` value is wrong. Blueprint plan §9.6 (B6) reduces to a manifest correction for aoe |
| C08 | fail | pass | — | — |
| C09 | fail | **fail** | code names enhancedcombathud (`areas.mjs`, `ui.ARGON`) and item-piles (`resolve.mjs`, `game.itempiles`); neither is in `relationships` | W7 (`recommends` both, with a `reason`) |
| C10 | warn | pass | — | `resolve.mjs` is 496 lines at 28ccc87, 4 under the cap; S4 |
| C11 | fail | pass | `core.mjs` is pure | stays green (S2 adds only pure helpers) |
| C12 | fail | pass | `MODULE` once | — |
| C13 | fail | pass | — | — |
| C14 | fail | **fail** | no kit | S1 |
| C15 | fail | pass | — | — |
| C16 | fail | **fail** | `tray.mjs` (ui by name) → `hooks.mjs`, `resolve.mjs` (glue); 8 unclassified files at 28ccc87 (`aim`, `areas`, `attacks`, `effects`, `escape`, `hooks`, `refund`, `resolve`) | S4 + S5 (roles in §2; `tray` gets its actions through `ctx`) |
| C17 | fail | pass | — | — |
| C18 | fail | **fail** | the entry has no `import * as` feature list; the `install*` functions are not named `install` | S5 |
| C19 | fail | pass | emits nothing | — |
| C20 | fail | **fail** | no `golden/hooks.json` | S1 |
| C21 | fail | pass | — | — |
| C22 | fail | **fail** | no `SETTINGS` export | S3 |
| C23 | fail | pass | — | — |
| C24 | fail | **fail** | comment-only catches at `areas.mjs:434` (`/* bind as usual */`) and `resolve.mjs:60` (`/* fall through */`; snapshot :59). The re-run's `catch { … = null; }` in `aim.mjs:30` and `effects.mjs:138` are not comment-only and pass | S6 |
| C25 | fail | pass | the literal `"pentaryn-aoe | …"` prefixes at `hooks.mjs:27,30`, `areas.mjs:361`, `resolve.mjs:48` pass (re-run code uses `${MODULE} | …`) | S6 routes them through `log` (finding -9) |
| C26 | fail | **fail** (was pass) | `aoe.mjs:101 setTimeout(publish, 0)` — the old blind spot, scored since R2 | S7 |
| C27 | fail | **fail** | no manifest | S7 |
| C28 | fail | **fail** | no goldens | S7 |
| C29 | fail | **fail** | writes flags (handle tokens, the handle actor, messages) with no `inspect` | S7 (`inspect(ref)`, finding -10) |
| C30 | fail | pass | — | — |
| C31 | manual | manual | the 20 methods have mixed shapes (finding -10) | S7 records them as `legacy` rows, as they are |
| C32 | fail | **fail** | rows with no `wrapMethod` naming them: `aoe-argon-handle-bind` and `aoe-self-area-aim` (real patches); `aoe-core-region-delete-update-race` (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) plus the re-run's `aoe-careful-spell-protected-rows` (**renamed `dnd5e-careful-spell-protected-rows`**, D2 `df661e0`), `aoe-supersede-same-usage` (**renamed `dnd5e-supersede-same-usage`**, D2 `df661e0`), `aoe-player-status-line` (**renamed `core-private-roll-rows-hidden`**, D2 `df661e0`), `aoe-same-spell-no-stack` (**renamed `dnd5e-same-spell-no-stack`**, D2 `df661e0`) (not patches) | S6 (`wrapMethod` names `aoe-argon-handle-bind` and, finding -44, `aoe-self-area-aim`) + ADJ / decision §6.1 for the five non-patch rows |
| C33 | manual | manual | lists `._placementContext` in `core.mjs` and `escape.mjs` (covered by `core-region-placement-escape`) and 13 rows for this module; still misses `ui.ARGON.bind` and `RegionLayer.prototype.placeRegions` (covered by `aoe-argon-handle-bind`, `aoe-self-area-aim`) | ADJ (finding -39 widens the row) |
| C34 | fail | **fail** | `lang/en.json` is flat dotted keys | S3 (nest it; Foundry `expandObject`s on load, `localization.mjs:368`, so this is runtime-identical and reload-only) |
| C35 | fail | **fail** | definite coverage 9 % (7/74) at 28ccc87 (snapshot 13 %, 7/54): five copies of the `t()` prefix wrapper (`areas.mjs:31`, `resolve.mjs:30`, `tray.mjs:19`, `effects.mjs:30`, `refund.mjs:22`) plus the template keys at `settings.mjs:43-44` | S3 |
| C36 | warn | pass | — | — |
| C37 / C37w | fail / warn | **fail** (was pass) / pass | `aoe.css:68–69` `.chat-message .pa-status` (+ ` i`), the re-run's status line on the caster's card, has no `.pentaryn-aoe` class; every other selector is under `.pentaryn-aoe-tray` or a `pentaryn-aoe-*` class | W7 (`cssPrefix: "pa-"` makes `.pa-status` pass) |
| C38 | fail | n/a | — | W7 (`cssPrefix: "pa-"`, which only aoe uses) |
| C39 | fail | pass | — | — |
| C40 | fail | **fail** | no `*.test.mjs` | S1, S3 (i18n), S7 (api) |
| C41 | fail | **fail** | — | S1 |
| C42 | manual | n/a | — | S1 |
| C43 | fail | **fail** | self-running `test/run.mjs` | S1 |
| C44 | fail | **fail** | the README has no `##` sections | S8 |
| C45 | fail | **fail** | no CHANGELOG | S8 |
| C46 | fail | pass | `context/foundry/aoe.md` | — |
| C47 | fail | **fail** | no adjustments row for item-piles | ADJ |
| C48 | fail | **fail** | `aoe.mjs:46` `uninstall` is a reserved name | S7: it becomes the kit member with the same meaning |
| C49 | warn | pass | — | — |
| C50 | fail | n/a | — | S7 |
| C51 | fail | n/a | — | S3 |
| C52 | fail | pass | — | — |

**Target.** After S1–S8 and the ADJ batch, 44 fail-class rules apply (42 + C50 + C51). 41 / 44 pass
(93.2 %; was 95.5 % before the re-run's C37); C07, C09 and C37 wait for `module.json`. C32 passes
only if decision §6.1 is taken for all five non-patch rows and S6 lands -44. After W7, C38 also
applies and 45 / 45 pass (100 %).

---

## 2. Target layout vs today

Tier: **full**. Each name below is chosen so the scorer classifies its role:
- `-adapter.mjs` / `argon.mjs` → adapter;
- a file that exports `install` → feature.

| Target file | Role | Comes from (snapshot) |
|---|---|---|
| `aoe.mjs` | entry (≲150) | header `aoe.mjs:1-21` (file map updated); `FEATURES`; `ctx`; `onInit` (`93-96`), `onSetup` (`97`, was `installHooks` `60-70`), `onReady` (`98-106`); the exported hot-patch `install({ sweepOnReady })` `76-85` and the `globalThis.__pentarynAoeHot` gate `92` **kept** (README-documented, legacy); `export { api, uninstall, MODULE }` `87` kept, with `api` now `ctx.api` |
| `core.mjs` | core | today `core.mjs:1-459` (snapshot 1-314; the re-run's additions are all pure), plus `SHORT`, `NS`, `VERSION ("0.3.1")`, `CONTRACT`, `I18N`, `CSS`, `HOOKS = {}`; `isHandle` (pure, `areas.mjs:28`); `hydrateDamages` and the `applicableRows` reuse (finding -4); `pushRing` (finding -8). `core.mjs` is 459 lines at 28ccc87, still under 600 |
| `settings.mjs` | settings | `DEFAULTS` `11-31` → derived from `SETTINGS`; `BOOLS` `33-37` + `registerSettings` `39-62` → a `SETTINGS` table (S3); `migrateSettings` `64-81` **stays here** (it touches only this module's settings; a separate `migrations.mjs` would be an unclassified glue file under C16); `setting()` `83-90` → kit `settingReader` |
| `scene-adapter.mjs` | adapter | `handleActor` `areas.mjs:37-39`; `handleFor` `101-108`; `areasFor` `189-194`; `removeArea` `196-214`; `spellAreas` `269-280`; `isPile` `resolve.mjs:57-63` (game.itempiles: only an adapter may touch it) |
| `messages-adapter.mjs` | adapter | `mutate` `resolve.mjs:34-52`; `activityOf` `108-114`; `usageIdOf` `116-124`; `cardEffects` `effects.mjs:52-57`; finding -5's `recordedTarget(tg)`; the re-run's `spellOf` `effects.mjs:133-143` (effect → source spell item via `fromUuidSync`) |
| `argon.mjs` | adapter | `guardArgonBind` `areas.mjs:429-440` through `wrapMethod` (marker `_aoeGuard`, row `aoe-argon-handle-bind`) + `unguardArgonBind` (finding -15) |
| `areas.mjs` | feature (Part A) | handle actor `41-96`, handle tokens `110-183`, `deleteHandlesOf` `216-235`, `sweep` `237-260`, card decoration `282-340`, hooks `344-401`, `concentrationItemUuid` `403-412`, `readyAreas` `414-427`. Contributes `sweep`, `ensureHandleActor`, `createHandle` |
| `resolve.mjs` | feature (Part B) | the rest of `resolve.mjs` (`describeToken`, `tokensForTargets`, `resolve`, Careful Spell `224-261`, saves, request, apply, hooks `461-496`). Contributes `resolve`, `applyRows`, `rollNpcSaves`, `rollForPlayer`, `pingPlayers`, `setRow`, and `ctx.expose`s the same six for the tray. `uninstall()` deletes `CONFIG.DND5E.requests[REQUEST_HANDLER]` (was `aoe.mjs:40`) |
| `tray.mjs` | feature | `tray.mjs:1-151` (incl. the re-run's `decoratePlayer` `89-110`); actions come from `ctx.exposed` (no import of `resolve.mjs`) |
| `attacks.mjs` | feature (Part C) | `attacks.mjs:1-40` |
| `effects.mjs` | feature (Part D) | `effects.mjs` minus `cardEffects` and `spellOf` (incl. the re-run's `onPreCreateEffect` `114-131`). Contributes `selfApply`, `pendingFor` |
| `refund.mjs`, `aim.mjs` | features (Parts F, G) | as they are, with `install(reg, ctx)` / `uninstall()`. `aim.mjs`'s `placeRegions` wrap (`62-82`) goes through `wrapMethod` and `aim.uninstall()` unwraps it (S6, finding -44) |
| `escape.mjs` | feature (Part E) | `escape.mjs:1-74`. `install` registers no hooks and contributes `activePlacement`. `registerEscape` stays exported and is called from the entry's `onInit` (keybindings exist only at `init`, so the trampoline/slot design stays). `uninstall()` = `disableEscape` |
| `api-manifest.mjs`, `api.mjs` | manifest / api | own rows: `areasFor`, `spellAreas`, `handleFor`, `removeArea`, `cardEffects`, `setting`, `hookIds`, `inspect`, + finding -10's reads; `uninstall` and `trace` are kit members |
| ~~`hooks.mjs`~~ | removed | `on/hookIds/offAll` → kit `hookRegistry`; `guard` → `reg.guardSwallowAsync`; `claimMessage` → kit `election.claimMessage(m, key, { scope: MODULE })` (absorbs finding -30) |
| `lib/` | vendored | `vendor.py sync aoe --tier full --kit election,patch` |
| `lang/en.json` | | nested under `PENTARYN_AOE` (S3); keys unchanged |
| `aoe.css` → `styles/aoe.css` | | W7 |

Import graph after S5:
- entry → features, settings, api, core, lib
- features → scene-adapter, messages-adapter, argon, core, settings, lib (never another feature)
- api → adapters, core, settings, api-manifest, lib
- adapters → core, lib

`graph-allow.json` stays empty.

**Feature → feature calls.** `resolve.mjs` today imports `areas.mjs` (`isHandle, isTemplateRegion,
areasFor, removeArea, handleActor`); after S4 every one of those lives in core or `scene-adapter`.
`tray.mjs` imports `resolve.mjs`'s six actions; after S5 it reads them from `ctx.exposed`, set by
`resolve.install`. Resolve is installed before the tray in the same synchronous pass, so the
actions exist before any render.

**Registration timing.** aoe registers its feature hooks at **`setup`** today (`aoe.mjs:97
installHooks`), not at module scope. The migration keeps that moment: `onSetup` runs every
feature's `install(reg, ctx)` in FEATURES order. This is the blueprint's "same registration moment
as today" rule (use-doc §6) applied to aoe's actual moment. The `ready`-time `canvasReady` listener
(`areas.mjs:419`) and the Argon fallback `Hooks.once("canvasReady", guardArgonBind)` (`aoe.mjs:103`)
go through `reg` too, so `uninstall()` removes them as well. The fallback is a raw `Hooks.once`
today: **[declared] D-A4**, hot-patch path only.

---

## 3. Ordered steps

Every step is behaviour-neutral unless marked **[declared]**. Run `node test/run.mjs` after each
step and `make foundry-aoe-check` before handing over. After S1,
`git diff --stat -- test/golden test/*.test.mjs` must be empty.

### S1 — Characterise, vendor, convert the runner (checkpoint)

Absorbs the test parts of **-2, -4, -5, -6, -8, -9, -13, -14, -15, -30, -39, -40, -44**. Clears C14,
C20, C40 (core, glue, hooks), C41, C43.

1. `vendor.py sync aoe --tier full --kit election,patch`.
2. Move `test/run.mjs` to `test/legacy-core.mjs` and list it in `LEGACY`. Give `test/run.mjs` the
   fixed body. The 160 checks (28ccc87; 135 at the snapshot) keep running unchanged; port them to `core.test.mjs` in this
   step or later.
3. Seams. Export these as `_internals` from their current files, re-exported through
   `test/fixtures/seams.mjs`:
   - `escape.mjs`: `onEscape`, `trampoline`, `SLOT` (finding -40);
   - `effects.mjs`: `targetActors`, `targetActorUuid`;
   - `resolve.mjs`: `tokensForTargets` (finding -5), `carefulFor` (finding -8's Careful pins);
   - `refund.mjs`: `refund` (finding -9's re-run swallows);
   - `settings.mjs`: `BOOLS` (finding -13).

   No other change.
4. Tests on **unchanged** code (each list item is a test case; the finding's recipe gives the
   stubs):
   - **`core.test.mjs`**:
     - import `../core.mjs` bare first; `VERSION` vs `module.json` (`0.3.1` at 28ccc87; was `0.3.0`);
     - finding -39's layer shape B: `placementInProgress` → true (A, C and D are already pinned);
     - finding -4's `applicableRows` equivalence on the `live` fixture.
   - **`glue.test.mjs`** (`installFoundry({ user: makeUser({ isGM: true }) })` with dnd5e
     `CONFIG.DND5E` stubs, then import `../aoe.mjs`):
     - `utilsSource === "foundry"`;
     - `F.fire("init")`: settings register capture (key, options) → `golden/settings-register.json`.
       Pin the order `handleTokens … highlightUnapplied, carefulSpell, refundCancelledArea,
       playerStatus, untargetedSelf, noSpellStacking, aimSelfAreas` (16), then
       `npcSaveRollMode`; then the Escape keybinding options (`editable [{key:"Escape"}]`,
       precedence PRIORITY, literal name/hint);
     - finding -13: `BOOLS` deep-equals the literal list (16 names at 28ccc87);
     - finding -9: `guard` from `hooks.mjs`:
       - `guard('x', () => false)() === false`; `guard('x', () => 7)() === 7`;
       - a sync throw → `undefined` and one `console.error` with first argument `pentaryn-aoe | x`;
       - an async rejection → `undefined`, logged after a microtask;
       - `guard('x', async () => 5)()` → `undefined`;
     - finding -30: the existing `claimMessage` block, moved verbatim (two clients one winner, last
       writer wins, a late client stands down, the winner asking again wins, a separate key is a
       separate claim, no socket id acts);
     - finding -2: `describeToken(t1|t2|t3)` JSON pins (each includes `disposition` since
       17275c9), plus `game.actors.find` called once per call;
     - finding -5: `targetActors` → `[Actor.a1, Actor.a2, Actor.a2]`; `targetActorUuid` per
       target → `[Actor.a1, Actor.a2, null, Actor.a2]`; `tokensForTargets` resolves the legacy
       `tg.uuid`;
     - finding -6: two un-awaited `mutate`s on one message give `n === 10`, in order;
     - finding -8: `resolve('x')` as a non-active GM → `null`; `applyRows('x')` as a player →
       `null`; `carefulFor` with no `careful` flag → `null`, with a fresh out-of-combat flag →
       `{ names, max }`;
     - finding -9 (re-run): `refund()` with both cleanup deletes rejecting → `true`, one info
       toast, no console output today;
     - finding -14: `pendingFor(message)` → `['e1']` with one `getEffects`; an old card → `[]`
       with no fetch;
     - finding -15: `guardArgonBind`:
       - with `ui.ARGON` present → true, and `bind._aoeGuard === true`;
       - a handle target resolves to `undefined`;
       - a normal target → `'bound:x'`;
       - a second call returns true without re-wrapping (same function);
       - with `ui = {}` → false;
     - finding -40: `registerEscape()` twice registers once; `trampoline()` → true and `n === 1`;
       with no placement → false; when `_cancelPlacement` throws it is still true and
       `pentaryn-aoe | cancel placement` is logged; a slot returning `"yes"` → false;
       `disableEscape` keeps a foreign slot and deletes its own;
     - finding -44: `installAim()` wraps `RegionLayer.prototype.placeRegions` once; an armed
       Self cone gets an `onMove` that returns `false` and writes `aimFromCaster(...)`; an unarmed
       call gets none; the hot-patch case (a second copy imported with `?copy=2`) pins today's
       **no `onMove`** (the bug S6 fixes);
     - `F.fire("ready")` + one tick: `Object.keys(game.pentaryn.aoe)` **as a sorted set** equals
       the 20 names (finding -10's pin; the order of keys is not behaviour);
     - `hookIds()` returns `[{ name, id }]` in registration order;
     - tray: render a damage message carrying a `resolution` fixture through the
       `dnd5e.renderChatMessage` listener; pin `trayHTML(res)` byte for byte. A click on
       `[data-pa="apply"]` calls `applyRows(message.id)` (spy through `F.calls`); a change on
       `[data-pa="tick"]` calls `setRow(id, row, { apply })`. Re-run cases: a resolution with
       `careful.names` renders the `.pa-careful` line and a `protected` row renders the shield
       badge; as a player (`isGM: false`, `isAuthor: true`) the card gets one `.pa-status-waiting`
       line, and a message with `flags.pentaryn-aoe.npcSave` and `isContentVisible: false` is
       `hidden` with class `pa-hidden-npc-save`;
     - console texts byte for byte: `pentaryn-aoe | settings migration`, `… | ready`,
       `… | backstop handle`, `… | mutate`, `… | npcSaveRollMode gmroll → gm` (`console.info`),
       and the re-run's `… | refund cancelled area`, `… | replace <effect name>` (`console.warn`).
   - **`hooks.test.mjs`**: `F.hooks` after `init` + `setup` + `ready` (as the active GM) →
     `golden/hooks.json`.
     - Snapshot order: `once init, once setup, once ready`; then at setup `preCreateRegion,
       createRegion, deleteRegion, preCreateCombatant, targetToken, dnd5e.renderChatMessage,
       deleteActiveEffect, createChatMessage, updateChatMessage, dnd5e.renderChatMessage,
       dnd5e.postRollAttack, createChatMessage, dnd5e.renderChatMessage`; then at ready
       `canvasReady`.
     - Order at 28ccc87 (re-run hooks in bold): areas `preCreateRegion, createRegion,
       deleteRegion, preCreateCombatant, targetToken, dnd5e.renderChatMessage,
       deleteActiveEffect`; resolve **`dnd5e.postUseActivity`, `deleteCombat`**,
       `createChatMessage, updateChatMessage`; tray `dnd5e.renderChatMessage`; attacks
       `dnd5e.postRollAttack`; effects `createChatMessage, dnd5e.renderChatMessage`,
       **`preCreateActiveEffect`**; refund **`dnd5e.postUseActivity`**; aim
       **`dnd5e.preCreateMeasuredTemplate`**; then at ready `canvasReady`.
     - Order **within** each name is behaviour (three `dnd5e.renderChatMessage`, two
       `createChatMessage`, and two `dnd5e.postUseActivity`: resolve's Careful arm must run
       before refund's, whose literal `false` stops later handlers), so pin the full order.
5. `GOLDEN_UPDATE=1 node test/run.mjs` on unchanged code. **Checkpoint:** reviewed, and committed
   only with Joe's approval.

### S2 — Pure moves into core

Absorbs **-4** (`hydrateDamages`; the tray's Apply count via `applicableRows`; `areas.mjs:392`
written with `spellAreas`).

Characterisation, added before the change:
- `hydrateDamages`: finding -4's cases. Properties become a `Set`, the input is not mutated, and
  `undefined` gives `[]`.
- `spellAreas` equivalence with the old inline filter on finding -4's region fixtures.
- S1's tray HTML pin covers the Apply count.

`isHandle` moves to core as `t => !!aoeFlags(t).handle`, re-exported from `areas.mjs` until S4.

**[declared, failure path only] D-A1.** `hydrateDamages(undefined)` returns `[]` where the old code
threw inside `guard`. This applies only to a resolution with no `damages`, which the module never
writes. List it; it needs no live test.

### S3 — Settings table, nested lang, literal keys

Absorbs **-13**. Clears C22, C34, C35 and C51, and adds `i18n.test.mjs`.

Characterisation: S1's `settings-register.json` and the keybinding pin. Add `i18n.test.mjs` now:
every literal key used in code exists in the **nested** `lang/en.json`.

- `SETTINGS`: one row per setting, in **registration order**: the `BOOLS` order first, then
  `npcSaveRollMode` last. This is not `DEFAULTS` order. The settings-menu order follows
  registration, so the S1 golden is the check. Each row carries a literal
  `name: "PENTARYN_AOE.Setting.<key>.Name"` and `hint`. `npcSaveRollMode` keeps its literal
  `choices` map. `DEFAULTS` = `Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.default])))`
  (kept exported).
- `registerSettings` → `defineSettings(MODULE, SETTINGS)`. The kit skips already-registered keys,
  as `settings.mjs:41,48` does (snapshot :32,39).
- The five `t()` wrappers (`areas.mjs:31`, `resolve.mjs:30`, `tray.mjs:19`, `effects.mjs:30`,
  `refund.mjs:22`) → `_loc("PENTARYN_AOE.<full key>", data)`, 34 call sites at 28ccc87 (28 at the
  snapshot):
  - `areas.mjs` `290, 306, 310`
  - `effects.mjs` `241, 254`
  - `tray.mjs` `35-85` (the template key `Status.${status}` at `108` stays dynamic, so list its
    three literal keys `Status.waiting|applied|superseded` in a comment for C35)
  - `resolve.mjs` `259, 322-412`
  - `refund.mjs` `46`

  In v14, `localize(id, data)` interpolates exactly as `format` does (`localization.mjs:435-449`).
  `_loc` is that function, bound (`game.mjs:74`). Output is byte-identical; S1's tray HTML pin
  proves it.
- `lang/en.json`: re-nest the flat dotted keys under `PENTARYN_AOE`. Foundry `expandObject`s on
  load, so lookups are identical, and the change needs only a reload.

### S4 — Adapters

Absorbs **-5** (resolvers in one place) and moves `isPile` / `handleActor` / the finders out of
the features.

Characterisation: S1's -2, -5 and -6 tests and the tray pins. Add before the move:
- the `areasFor` / `removeArea` / `handleFor` / `spellAreas` / `isPile` table on a synthetic
  scene:
  - `removeArea` with ids and with documents → count;
  - a region the user cannot delete is skipped;
  - `isPile` with no `game.itempiles` → the flag fallback;
- `activityOf` with `getAssociatedActivity` present, and absent with `system.activity.uuid`.

- Move per §2. `resolve.mjs`, `effects.mjs` and `areas.mjs` import from the adapters.
- Finding -5: `recordedTarget(tg)` in `messages-adapter.mjs`. `targetActors` and `targetActorUuid`
  are rewritten on top of it, each keeping **its own** fallbacks: `targetActors` must not gain the
  legacy `tg.uuid`. `tokensForTargets` keeps its scene logic and its `tg.uuid` fallback.
  `areas.mjs:287` calls `activityOf`. `effects.mjs:160` (snapshot :127) stays on `getAssociatedActivity`.

### S5 — Kit hooks, features with `install(reg, ctx)`, entry wiring

Clears C16 and C18; `hooks.mjs` goes away.

Characterisation: S1's `hooks.json`, `guard` texts, `claimMessage` block and tray click pins must
pass **unchanged**.

- The entry builds `log = makeLog(MODULE)`, `reg = hookRegistry(MODULE, log)` and `ctx`.
  `onSetup` runs `for (const f of FEATURES) { const c = f.install(reg, ctx); if (c) ctx.contributions.push(c); }`.
- Each `on(name, guard(label, fn))` becomes
  `reg.on(name, reg.guardSwallowAsync(label, fn), { guard: false, label })`. The kit keeps aoe's
  swallow-async semantics verbatim (use-doc §4.3), and the error text stays
  `pentaryn-aoe | <label>`, pinned in S1.
- The unguarded registrations stay unguarded (`{ guard: false }` with no wrapper):
  - `preCreateCombatant` (`areas.mjs:375`), which returns a `false` veto;
  - `refund`'s synchronous `dnd5e.postUseActivity` (`refund.mjs:53`).
- The re-run's guarded registrations follow the normal rule: `postUseActivity(careful)` and
  `deleteCombat(careful)` (`resolve.mjs:464, 467`), `preCreateActiveEffect(noStacking)`
  (`effects.mjs:309`), `preCreateMeasuredTemplate(aim)` (`aim.mjs:86`).
- `claimMessage(message, key)` → kit `claimMessage(message, key, { scope: MODULE })`. Same path
  (`flags.pentaryn-aoe.claims.<key>`), same re-read through `game.messages.get(id) ?? {}`, same
  750 ms. This absorbs **-30**.
- `tray.install(reg, ctx)` keeps `ctx`. Its listeners call `ctx.exposed.applyRows(...)` and so on.
- `resolve.install` writes `CONFIG.DND5E.requests[REQUEST_HANDLER]`, as `installResolve` did.
- `hookIds` (API) → `reg.ids().map(({ name, id }) => ({ name, id }))`, the legacy shape.
- `uninstall()` (entry) runs every feature's `uninstall()` in reverse, then `reg.offAll()`, then
  `installed = false`. `escape.uninstall` = `disableEscape`; `resolve.uninstall` deletes the
  request handler; `aim.uninstall` clears `armed` here and, from S6, unwraps `placeRegions` (-44).
- Keep `installed` / `__pentarynAoeHot` / the exported `install({ sweepOnReady })` exactly. The
  hot-patch path is the documented one.

### S6 — Logging, the Argon wrap and the placement wrap

Absorbs the structural half of **-9** (literal prefixes → `MODULE` via `log`), **-15** (unwrap
on uninstall) and **-44** (Part G's `placeRegions` wrap, new at 28ccc87). Clears C24 and C32 for
`aoe-argon-handle-bind` and `aoe-self-area-aim`.

Characterisation: S1's `guardArgonBind` pins. Add now:
- `patches()` lists one record `{ marker: "_aoeGuard", adjustments: "aoe-argon-handle-bind" }`;
- after `uninstall()`, `ui.ARGON.bind === orig`. This is the declared part. Write it as a new test
  in this step; S1 pinned that today's uninstall leaves the wrap.
- -44: `patches()` also lists `{ marker: Symbol.for("pentaryn-aoe.aimWrapped"), adjustments:
  "aoe-self-area-aim" }`; after `uninstall()`, `RegionLayer.prototype.placeRegions === orig`; the
  hot-patch case now gets an `onMove` (S1 pinned that it did not).

Then:
- `argon.mjs`: `guardArgonBind()` returns `false` when `!ui.ARGON?.bind`, else
  `wrapMethod(MODULE, { target: ui.ARGON, name: "bind", label: "ui.ARGON#bind", marker: "_aoeGuard", adjustments: "aoe-argon-handle-bind" }, function (wrapped, target, ...rest) { try { if (target && isHandleTarget(target)) return Promise.resolve(); } catch (err) { log.debug("argon bind check", err); } return wrapped(target, ...rest); })`
  and returns `true`. The marker literal `_aoeGuard` stays in `argon.mjs`, the module's own file.
  `unguardArgonBind()` = the handle's `unwrap()`.
- `aim.mjs` (finding -44): `wrapPlacement()` → `wrapMethod(MODULE, { target: RegionLayer.prototype,
  name: "placeRegions", label: "RegionLayer#placeRegions", marker: WRAPPED, adjustments:
  "aoe-self-area-aim" }, function (wrapped, data, options = {}) { …today's body, ending in
  wrapped(data, options)… })`; keep the handle; `aim.uninstall()` calls `handle.unwrap()`.
- `resolve.mjs:60` (`isPile`, now in `scene-adapter.mjs`; snapshot :59):
  `catch (err) { log.debug("item piles check", err); }`.
- The literal `"pentaryn-aoe | …"` strings become `log.error("…", err)` (same text): `hooks.mjs:27,30`
  (now the kit's), `areas.mjs:361` (`backstop handle`), `resolve.mjs:48` (`mutate`). The re-run's
  `${MODULE} | …` sites (`refund.mjs:61, 64`, `effects.mjs:130`) move to `log` the same way.
- **[declared] D-A2** (finding -15): `uninstall()` now restores `ui.ARGON.bind`. This affects the
  hot-patch path only; a normal load never calls `uninstall`.
- **[declared] D-A7** (finding -44): `uninstall()` now restores `RegionLayer.prototype.placeRegions`,
  and a hot-patched copy aims Self cones and lines (today it silently stops). Hot-patch path only.

### S7 — API manifest, `inspect`, publish

Absorbs the structural parts of **-10** (describe, version, reads) and **-11** (the API table comes
from the manifest). Clears C26, C27, C28, C29, C48 and C50, and adds `api.test.mjs`.

Characterisation: S1's key-set pin and the per-method pins. `surfaceOf(game.pentaryn.aoe)` on
unchanged code → `golden/surface.json`, written in S1. `describe.json` is new output, built here.

- Rows. **Every existing method is `legacy: true` with today's parameter names**: `messageOrId`,
  `messageId`, `regions`, `scene`, `region`, … No row's first parameter is named `ref`, so
  `buildApi` never resolves or rewrites arguments. Document each return shape:
  - `resolve` / `applyRows` → `resolution|null`;
  - `pingPlayers` → `ChatMessage|Notification|null`;
  - `removeArea` → `number`;
  - `sweep` → `{ orphansDeleted, ownershipFixed, handlesCreated, sizeLocked }`;
  - `areasFor` / `spellAreas` / `handleFor` default to `canvas.scene` (the bridge tab's view).
- Who supplies what:
  - own rows in `api.mjs`: `areasFor`, `spellAreas`, `handleFor`, `removeArea`, `cardEffects`,
    `setting`, `hookIds`;
  - feature contributions: the areas, resolve, effects and escape rows (§2).
- `uninstall` is no longer a row: it is the kit member `members.uninstall = ctx.uninstall`, with
  the same behaviour (C48). `trace` is `log.traces()`.
- New rows (additive, finding -10):
  - `resolution(messageOrId)` → `deepClone` of the flag, or `null`;
  - `latestResolution({ sceneId })` over the last 60 messages;
  - `summary(messageOrId)` via the pure `core.summariseResolution` (finding -10's fixture; since
    17275c9 it also carries `careful`, each row's `protected`, and `core.playerStatus(res)`);
  - `isHandle(tokenOrDoc)`;
  - `inspect(ref, opts)` → `{ token|actor ref, isHandle, region, handleActor, careful }` for a token or
    actor (`careful` = the actor's Careful Spell flag or `null`), or `{ resolution summary, npcSave }` for a message. Read-only, `toPlain`, depth ≤ 4 (C29).
- `flags: { writes: ["flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.pentaryn-aoe.region", "flags.pentaryn-aoe.resolution", "flags.pentaryn-aoe.claims", "flags.pentaryn-aoe.effectsApplied", "flags.pentaryn-aoe.damageMessage", "flags.pentaryn-aoe.careful", "flags.pentaryn-aoe.npcSave"], reads: ["flags.dnd5e.*", "flags.item-piles.data.enabled"] }` (`careful` on actors and `npcSave` on messages since 17275c9; both module-internal).
  `.handle`, `.handleActor` and `.region` are a **cross-module contract**: creatures reads them at
  `creatures.mjs:35 isProp`, senses at `light.mjs:170`, and live portals in `spreadArrival`. List
  the readers in the README (S8, finding -11).
- `onReady`, in today's order and with today's error handling:
  1. `ctx.api = buildApiFor(ctx)`;
  2. `publishNamespace("aoe", ctx.api, { moduleId: MODULE })`, **synchronously**. Delete
     `setTimeout(publish, 0)` (`aoe.mjs:101`) and `publish()` (`51-58`). The kit's re-alias tick
     covers the importer's frozen-root replacement;
  3. the Argon tick `setTimeout(() => { if (!guardArgonBind()) reg.once("canvasReady", guardArgonBind); }, 0)`.
     **Keep the tick.** Rule use-doc §6 prefers `argonInit` over a tick; that switch is a declared
     timing change, D-A5, deferred to Wave 8.6 with the other Argon composition work;
  4. `migrateSettings().catch(...)`;
  5. `readyAreas().catch(...)`.
- **[declared] D-A3:** the API becomes a frozen object published at `ready` instead of one tick
  later, with kit members and the `pentaryn-aoe.ready` / `pentaryn.ready` events.

### S8 — Docs

Absorbs **-11** and **-12**. Clears C44 and C45.

- README in use-doc §7 order:
  - **What the player sees**: Parts A–G (README.md:44–53 already describes Careful Spell, superseding
    and the status line; fold it in);
  - **Settings**: all rows, generated from `SETTINGS`;
  - **API**: the manifest table with exact returns, null cases, who may call, and default scene;
  - **Data written**;
  - **Flags other modules read**: `.handle`, `.handleActor`, `.region` and their readers;
  - **Events**: n/a, plus `golden/hooks.json`;
  - **Patches and adjustments**: the rows below;
  - **Two sessions**: `claimMessage` on resolve and selfApply, `activeGM.isSelf` elsewhere
    (including the re-run's `deleteCombat` Careful clean-up, idempotent), and the handle-actor gap
    (-7);
  - **Extending**: finding -12's recipe, rewritten for the kit. A `<part>.mjs` exports
    `install(reg, ctx)` and `uninstall()` and is added to `FEATURES`. Its hooks go through
    `reg.on(name, reg.guardSwallowAsync(label, fn), { guard: false, label })`. Pure rules go in
    core with a fixture. A setting is a `SETTINGS` row with literal keys. A broadcast job is gated
    by `isActiveGM()` and then `claimMessage(doc, "<job>", { scope: MODULE })`. API rows are added
    via a contribution. Two exceptions with live examples: a veto listener (refund) registers
    unguarded and returns a literal `false` synchronously; a prototype patch (aim) uses
    `wrapMethod` and unwraps in `uninstall()`;
  - **Pitfalls**;
  - **Files**, **Tests**, **Sync**.
- `context/foundry/aoe.md`: add the 8 missing setting rows (`autoApplySelf`, `highlightUnapplied`,
  and the re-run's `carefulSpell`, `refundCancelledArea`, `playerStatus`, `untargetedSelf`,
  `noSpellStacking`, `aimSelfAreas`) and a short Parts F/G section (aoe.md was not touched by the
  re-run). The Console section points to the README API table.
- `CHANGELOG.md` takes the version notes.

### ADJ — adjustments batch

| Row | Change | Absorbs |
|---|---|---|
| `aoe-argon-handle-bind` | `files` → `foundry/module/pentaryn-aoe/argon.mjs`, `core.mjs`; markers `guardArgonBind`, `isHandleTarget`, + `_aoeGuard` | C32 |
| `aoe-core-region-delete-update-race` (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) | **decision §6.1**. It is a workaround, not a wrap. Either rename it to `core-region-delete-handle-race`, the registry's convention for non-patch rows (like `core-region-placement-escape`), or have C32 skip rows without a patch marker. `files` → `areas.mjs`, `core.mjs` | C32 |
| `core-region-placement-escape` | widen to `modules: [pentaryn-aoe, pentaryn-cursors]`, `files += foundry/module/pentaryn-cursors/cursors.mjs`; add a cross-reference comment at both predicates | -39 |
| `itempiles-aoe-skip-piles` (new) | packages `[item-piles]`, files `scene-adapter.mjs`, markers `isValidItemPile`, `item-piles` | C47 |
| `dnd5e-chat-message-types`, `dnd5e-legacy-roll-modes`, `dnd5e-token-size-lock` | `files` follow the moves: `messages-adapter.mjs`, `scene-adapter.mjs`, `settings.mjs` | keeps `make foundry-adjustments-check` green |
| `aoe-self-area-aim` (existing since 17275c9, `adjustments.yml:785`) | a real patch: S6's `wrapMethod` names it (finding -44); add the marker `aimWrapped`; `files` unchanged (`aim.mjs`, `core.mjs`) | C32 |
| `aoe-careful-spell-protected-rows` (**renamed `dnd5e-careful-spell-protected-rows`**, D2 `df661e0`), `aoe-supersede-same-usage` (**renamed `dnd5e-supersede-same-usage`**, D2 `df661e0`), `aoe-player-status-line` (**renamed `core-private-roll-rows-hidden`**, D2 `df661e0`), `aoe-untargeted-touch-self` (**renamed `dnd5e-untargeted-touch-self`**, D2 `df661e0`), `aoe-same-spell-no-stack` (**renamed `dnd5e-same-spell-no-stack`**, D2 `df661e0`) (existing since 17275c9) | not patches (own tray logic / dnd5e behaviour workarounds): same **decision §6.1** as `aoe-core-region-delete-update-race` (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) — rename to the upstream prefix (`dnd5e-careful-spell-protected-rows`, `dnd5e-supersede-same-usage`, `core-private-roll-rows-hidden`, `dnd5e-untargeted-touch-self`, `dnd5e-same-spell-no-stack`) or relax C32 (D2). `files` unchanged (the features keep their names) | C32 (the scorer flags four of the five today; `aoe-untargeted-touch-self` is listed under C33 only) |
| `dnd5e-cancelled-area-refund` (existing since 17275c9, shared with pentaryn-combat) | already upstream-prefixed; `files` unchanged | — |

### W7 — restart batch

- `flags.pentaryn = { tier: "full", namespace: "aoe", flagScope: "pentaryn-aoe", cssPrefix: "pa-", generation: 14, afterSync: [...] }`.
  `flagScope` is a declaration fix only (see C07).
- `recommends`: `enhancedcombathud` and `item-piles`, each with a `reason`.
- `styles: ["styles/aoe.css"]`; `compatibility.verified: "14.369"`.
- Clears C37 as well since the re-run: `cssPrefix: "pa-"` makes `.chat-message .pa-status`
  (`aoe.css:68–69`) pass. `version` is `0.3.1` at 28ccc87.

---

## 4. Findings that stay standalone (not structural)

Land these after S5. Each has its finding's characterisation written first; those tests are
already in S1.

| Finding | Fix | Behaviour |
|---|---|---|
| **-2** | `describeToken(token, { handleActorId })`, computed once in `resolve()` | neutral (pinned; the only divergence is an `undefined` `actorId`, which is unreachable) |
| **-6** | `next.finally(() => { if (queues.get(id) === next) queues.delete(id); })` + `pendingWrites()` | neutral (ordering pinned); memory only |
| **-7** | Handle actor created with `_id: "pentarynAoeHndl0"`, `keepId: true`; on "already exists", look it up by flag (a fallback only: v14 does not refuse a world document whose id exists, so the later create replaces it with the same data and a second `createActor` fires; one actor results — `test/handle-race.test.mjs`) | **[declared] D-A6**, live test |
| **-8** | `log.trace(...)` at each early return in the resolve pipeline (the kit's ring replaces the finding's `pushRing`/`TRACE`). Keep `trace(...); return null;` in `resolve`/`applyRows`, and in the re-run's `carefulFor` (`resolve.mjs:238–249`, three silent `null`s) | console only under `CONFIG.debug["pentaryn-aoe"]`; the `null` pins guard it |
| **-9** (rest) | Wrap the tray `change`/`click` listeners and the eraser listener (`areas.mjs:300-314`) in `reg.guard`. The backstop delete `.catch` ignores only "does not exist" and otherwise `log.warn("backstop handle delete", err)`. Re-run swallows: `resolve.mjs:246` (Careful usage bind), `refund.mjs:44`, `:45` (refund cleanup) log instead of `() => null` | console only (listeners ignore return values; the swallowed results are discarded today) |
| **-14** | `pendingFor(message, { effects })`; `decorate` fetches `cardEffects` once per render; the 15 s re-check still fetches fresh | neutral (pinned outputs) |
| **-39** | Comments + row widening (ADJ) + the B-case pin (S1) | docs/registry |
| **-40** | Seams + tests only (S1) | none |

The structural steps absorb -4 (S2), -5 (S4), -10 (S7), -11 and -12 (S8), -13 (S3), -15 and -44 (S6), -30
(S5) and the prefix half of -9 (S6).

---

## 5. Declared changes needing a live test

| # | Change | Live check |
|---|---|---|
| D-A3 | Frozen API published synchronously at `ready`, kit members, ready events (S7) | Reload as GM with the importer active: `game.pentaryn.aoe.describe()` lists every method, `game.modules.get("pentaryn-aoe").api === game.pentaryn.aoe`. Then cast Fireball on 3 goblins and a PC: the tray shows, NPC saves roll, the player's request card shows, and Apply works |
| S3 lang | Nested `lang/en.json` + `_loc` (expected identical) | The same Fireball pass: every tray, request-card, Remove-all-templates and Effects-highlight string reads as before. The settings menu shows the same rows in the same order |
| D-A2 | `uninstall()` restores `ui.ARGON.bind` (hot patch only) | `game.pentaryn.aoe.uninstall()`, then the hot-patch import. Drag a handle: the HUD stays on the caster |
| D-A4 | The Argon `canvasReady` fallback is now removed by `uninstall` | the same hot-patch pass, with Argon loading after aoe |
| D-A7 | `uninstall()` restores `RegionLayer.prototype.placeRegions`; a hot-patched copy aims (-44) | the D-A2 hot-patch pass: after the hot-patch import, cast Cone of Cold (or Burning Hands) from a token: the cone's point stays on the caster's edge and turns toward the mouse; Escape still cancels and refunds |
| D-A6 | Deterministic handle-actor id (-7) | On a world with the "Area handle" actor deleted, open the bridge tab and a GM browser tab, then reload both: exactly one handle actor exists. On an existing world the actor is untouched (found by flag) |
| D-A1 | `hydrateDamages(undefined)` → `[]` | failure path only, no live test |

Deferred (not part of this migration): D-A5, the Argon readiness `argonInit` hook instead of a tick
(Wave 8.6).

## 6. Decisions for Joe

1. **Non-patch adjustments rows vs C32.** `aoe-core-region-delete-update-race` (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) describes a
   workaround (poll before deleting), not a wrap, so no `wrapMethod` can name it. Two options:
   - **Recommended:** rename it to the registry's upstream-prefixed convention for non-patch rows
     (`core-…`) and clarify use-doc §5.6 so that `<short>-` means a patch row. Portals has the same
     question. Since 17275c9 the question covers **six** aoe rows, not one (ADJ table).
   - Or keep the id and relax C32.
2. **Lifting WAIT.** Only after the live-test workflow is done with aoe; every step then
   re-anchors (top of this file).
3. **`ctx.exposed` between features.** The blueprint names `ctx.expose()` for feature → api only.
   aoe's tray needs resolve's actions, and this plan uses the same mechanism feature → feature
   rather than a `graph-allow.json` debt. If you prefer, bless it in use-doc §4.1 (one line).

## 7. Effort

| Step | Effort |
|---|---|
| Re-anchor against the live tree (Parts F/G, 6 settings, +370 lines) | done 2026-10-11 at 28ccc87; repeat only if the module moves again |
| S1 characterise (about 36 glue cases at 28ccc87; dnd5e message stubs) | L |
| S2 core moves | S |
| S3 settings / lang / `_loc` (27 sites) | M |
| S4 adapters (-5) | M |
| S5 kit hooks + features | M |
| S6 logging + Argon wrap + placement wrap (-44) | S |
| S7 API + inspect + reads | M |
| S8 docs | S |
| Standalone -2 / -6 / -7 / -8 / -9 / -14 | M in total |
| **Total** | **L: about 4–5 agent-days, plus one live-test pass (D-A2/3/4/6/7 + the S3 lang pass)** |

## Result (fill when done)

### Checkpoint (wave 4, S1) — `7a12ffad`

| | |
|---|---|
| Commits | kit `fb18b3dd` · runner `30378553` · seams `ff202cf0` · **checkpoint `7a12ffad`** (`test(aoe): characterisation checkpoint`) |
| Approval | S1.5 says "committed only with Joe's approval": committed by the wave-4 workflow on `migrate/wave-4` (never main); Joe reviews before merge (wave-4-report, Open for Joe) |
| Tests | 329 node:test (324 pass, 5 todo) in 13 files + LEGACY `test/legacy-core.mjs` 160; 22 goldens; mocked timers only |
| Coverage | before: none (legacy hand-rolled runner only, no node:test). After (lcov merged per file over the 12 module files, `lib/` and `test/` excluded): lines 100 / branches ≈77 / functions 94.0 (uncovered functions are anonymous catch/callback arrows) |
| Seams | `test/fixtures/seams.mjs` groups today's files (`hooks`, `settings`, `areas`, `resolve`, `tray`, `attacks`, `effects`, `escape`, `refund`, `aim`) = public exports + `_internals`; `freshAim(tag)` loads a hot copy of Part G. S2–S6 edit the shim, never the tests |
| KNOWN pins (flip in their own `[declared]` commit) | -44 a hot copy gets no `onMove`; `uninstall` leaves `placeRegions` wrapped (D-A7) · -15 `uninstall` leaves the Argon wrap (D-A2) · -7 handle actor created with a random id, no `keepId` (D-A6) · -6 queue map never shrinks · -9 refund's double swallow and the GM's delayed handle delete are silent · D-A1 `applyRows` throws on a resolution without `damages` · C26 publish one tick after ready (D-A3) · D-A4 raw `Hooks.once("canvasReady")` Argon fallback |
| Todo pins | core `VERSION` (S2) · -44 hot copy aims after uninstall · -15 uninstall restores `ui.ARGON.bind` · -7 two GM sessions make one handle actor · -6 settled queue entry dropped |
| Not built (needs wave-3) | the shared handle oracle is pinned on aoe's side only (`core.test.mjs` `HANDLE_ORACLE`); pinning portals' and creatures' `isAoeHandle` copies against it needs `migrate/wave-3` — follow-up |

### Migration (wave 4, S2–S8 + standalone) — `03322772` … `47bc85c7`

| | |
|---|---|
| Live score after the migration | **89.6 % (43/48)** at `47bc85c7` (`conformance.py --module aoe`); warnings C06w only. Failing: C07, C09, C37 (`module.json`, W7), C32 (`aoe-argon-handle-bind` files still name `areas.mjs`), C47 (no `itempiles-aoe-skip-piles` row) — all shared-file edits below. With the ADJ and W7 batches: 48/48 expected |
| Date | 2026-10-11 |
| Tests | 400 node:test (400 pass, 0 todo) + LEGACY 160; `node test/run.mjs` exit 0; `vendor.py check aoe` identical; module-check gates green |
| Commits — structural | S2 `03322772` · oracle `cfc8effd` · S3 `87959748`, `0d9f1607` · S4 characterisation `51f302c7`, adapters `4bc7d44c` · S5 `41b51b43` · S6 `515776c0` · S7 `4644e577` · 8.6 split `536bbcf3` · docs `0b9b13fd`, S8 `47bc85c7` |
| Commits — declared (each flips its named pin) | D-A4 `3f8dd7f7` · D-A3 + W2-K1 `0cbbab0e` · -6 `f54ba674` · D-A6 (-7) `5009afc4` · -9 refund `097c9e67` · D-A1 `0f83d5fe` · D-A2 (-15) `18addee4` · D-A7 (-44) `0d51383e` · 8.5 sweep batch `fa8f2d46` · 8.5 Careful batch `7f1d4bcf` |
| Commits — standalone, neutral | -2 `c0a75a64` · -8 `130fb3c3` · -9 `84c847df` · -14 `7198fe70` |
| Findings → commit | -2 c0a75a64 · -4 03322772 + 0f83d5fe · -5 4bc7d44c · -6 f54ba674 · -7 5009afc4 · -8 130fb3c3 · -9 515776c0 (prefixes) + 84c847df + 097c9e67 · -10 4644e577 + 0cbbab0e · -11, -12 47bc85c7 · -13 87959748 · -14 7198fe70 · -15 515776c0 + 18addee4 · -30 41b51b43 · -39 0b9b13fd (+ ADJ row) · -40 checkpoint · -44 515776c0 + 0d51383e |
| Declared changes handed to the live-test workflow | D-A2, D-A3 (+ W2-K1), D-A4, D-A6, D-A7, S3 lang, the two 8.5 batches (live checks in §5 and the wave-4 report); D-A1, -6, -9 are failure-path / console only |
| `module.json` edits appended to `wave7-restart-batch.md` | no — returned to the integrator (the aoe row there already lists them; add `afterSync` and the 0.4.0 bump with `core.VERSION`) |
| Adjustments rows appended to `adjustments-batch.md` | no — returned to the integrator (rows 90–97 there; plus `careful.mjs` on `dnd5e-careful-spell-protected-rows`) |
| Still failing, and why | C07, C09, C37 wait for W7; C32, C47 for the ADJ batch. Repo pytest `test_the_real_registry_matches_the_code` lists `aoe-argon-handle-bind` (files) until the ADJ edit lands |

**Deviations from the plan, and why.**
- `mutate` stays in `resolve.mjs`, not `messages-adapter.mjs`: only resolve calls it, and it logs
  through the module log (an adapter has no `ctx`).
- **8.6 split:** Careful Spell (`carefulKey`, `carefulFor`, `onCarefulUsed`, its two hooks) became
  `careful.mjs`, installed between areas and resolve so every hook keeps its place; resolve reaches
  `carefulFor` through `ctx.exposed`. `resolve.mjs` was 516 lines after -8.
- Feature rows live in `api-manifest.mjs` as `FEATURE_ROWS` and are returned by each feature's
  `install()` as its contribution (pure data stays in the manifest; features stay under the cap).
- `onReady` is the one synchronous ready body (C50); the hot-patch `install()` calls it with
  `{ hot: true }` and then does the Argon guard and startup work itself, as before.
- New rows carry `since: "0.4.0"` while `VERSION` stays `0.3.1` until the W7 bump.
- The test world's `Actor.create` honours `keepId` (and refuses an existing id) and gains
  `updateDocuments`; a kept id still advances the stub's id sequence so unrelated goldens keep their
  ids.
- The seams shim maps `hooks.hookIds` to the published API's `hookIds()` when the entry has
  published, else to the shim's own kit registry (`aim.installAim()` installs on it).

**Pins flipped (each in its declared commit):** glue — D-A4 fallback in `hookIds`; published
synchronously at ready (D-A3); the key set (legacy 20 + kit members + reads); `surface-legacy` now on
the 20 legacy keys (golden unchanged); hot patch without the frozen-root rebuild (W2-K1, plus a new
"frozen root rejects" test); -7 create with the fixed id; -44 uninstall restores `placeRegions`.
areas — -15 uninstall restores `ui.ARGON.bind`; -7 todo. aim — the -44 hot copy aims; -44 todo.
resolve — -6 queue map shrinks; -6 todo; D-A1 applies nothing. refund — -9 warns. core — VERSION todo
(S2). Goldens changed only where a declared commit names them: `ready-calls.json` (-7 id, 8.5
sweep batch), `describe-token.json` and `create-handle.json` (the handle actor's id), and the new
`describe.json` / `surface.json`.

**Follow-ups (not built).** Pinning portals' and creatures' `isAoeHandle` copies against
`test/fixtures/handle-oracle.json` needs `migrate/wave-3` (aoe-movement-portals-43,
transform-creatures-30). Flag scope `aoe` → module id in `module.json` is the W7 manifest
correction (no data moves). D-A5 (`argonInit` instead of the Argon tick) stays deferred.
