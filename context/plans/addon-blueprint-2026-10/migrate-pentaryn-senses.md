---
title: Migration guide — pentaryn-senses to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, senses]
---

# Migrating `pentaryn-senses` to the blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

> **Wave 3 code phase done (2026-10-11):** migrated on `migrate/wave-3`, 91.5 % — see Result.

> **Wave 3 re-anchor and checkpoint (2026-10-11).** `git diff 4e64f47..a5a1a906 -- foundry/module/pentaryn-senses` is empty, so every 4e64f47 anchor below is still a HEAD anchor (0 resolved, 0 obsolete). The scorer has grown since: the base scores **51.1 % (23/45)**; after the checkpoint **55.6 %** (C20 and C43 now pass). Characterisation checkpoint: **`5e76c4a1`** (see Result).

> **Re-anchored to 4e64f47 on 2026-10-11.** The usability re-run (17275c9) is now committed. In this module it touched only `light.mjs`, `light-core.mjs`, `lang/en.json`, `styles/light.css`, `test/light.mjs`, `module.json` (0.4.1) and `README.md`. The working tree equals HEAD. Line numbers below are **4e64f47 lines** where marked, and frozen-snapshot lines otherwise. `senses.mjs`, `chain.mjs`, `chain-core.mjs`, `glow.mjs` and `migrate.mjs` are unchanged, so their snapshot lines are also HEAD lines. Re-anchor results: 0 steps resolved, 0 obsolete. New audit finding **senses-walls-cursors-38** (createItem torch hook) goes into glue case (k) and §4. Score 43.9 % (18/41), unchanged from the 2026-10-10 live run.

**Read this when:** you are about to bring `pentaryn-senses` (carried lights, the Light cantrip, the
broken glow, token chains, the darkvision sight reset) up to the addon blueprint in the fix phase
after the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the audit's finding text →
[`../code-audit-2026-10/senses.md`](../code-audit-2026-10/senses.md) · the Light design →
`LIGHT-DESIGN.md` (moves to `context/plans/senses-light-cantrip.md` in step 9).

> History-tree plan. Snapshot lines are pentaryn `ee505c2` plus the uncommitted changes of
> 2026-10-10 20:15 EDT. The 2026-10-11 re-anchor adds the 4e64f47 line next to every
> `light.mjs` reference (step 0 has the offset table). If HEAD moves again, re-anchor by
> anchor text, and work from `conformance.py --module senses --markdown` run live.

| | |
|---|---|
| Tier | **full**: it writes token, item and AmbientLight flags, has a world setting, and its API writes. |
| **WAIT** | **YES.** `pentaryn-senses` is in `scripts/foundry/blueprint/wait.json` ("live-test workflow was editing it on 2026-10-10; lift only when Joe confirms"). `light.mjs` has changed since the snapshot; the change is committed as 17275c9 and re-anchored at 4e64f47. Separately, steps marked **WAIT(x)** touch a contract with transform, creatures, combat/Argon or aoe, and those modules are WAIT too. Each of those steps must re-anchor against the live tree of *both* modules. |
| Score today | **43.9 %** (18/41 fail-class) at **4e64f47** (2026-10-11 re-score, the same as the 2026-10-10 22:45 live run). The snapshot scored **48.8 %** (20/41). The Argon collapse (committed in 17275c9) brings in C09 (enhancedcombathud named, not in `relationships`) and C32 (row `senses-light-pick-collapse-hud` has no `wrapMethod`). |
| Projected after this guide | 100 % of fail-class rules except **C07**, **C37** and the live **C09**. All three wait for the Wave 7 `module.json` batch (step 13). After Wave 7, C29 and C38 become applicable: `inspect` (step 11) satisfies C29, and `ps-` is unique. |
| Effort | **L, about 4–5 days**, plus live-test turnaround. It is the most tangled of the three: 5 features in one module, two namespaces, four cross-module contracts. |
| Findings | senses-walls-cursors-10 … -27, -29, -34 (20), plus **-38** (new at the 2026-10-11 re-anchor: the createItem torch hook). Related, owned elsewhere: transform-creatures-21 (Starry writes `flags.pentaryn-senses.light`), transform-creatures-28 (the token.light hand-off with creatures), aoe-movement-portals-11 (the cross-module flag contract docs). |
| Prerequisites | K7 `guard: "warn"` — **landed** (kit 1.0.1); R1 C32 vs non-patch rows — **blocked on D2**; until then use the package prefix for non-patch rows (use-doc §5.6); R6 C33 private internals — **landed** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module senses --markdown`. No status changed on the snapshot; C33 now lists private internals (R6) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today, item by item

| Rule | Snapshot | 4e64f47 (2026-10-11) | Detail (4e64f47 lines) | Step |
|---|---|---|---|---|
| C01 | pass | pass | | — |
| C02 minimum 14 | warn | warn | `"13"` | 13 (Wave 7) |
| C03 dnd5e | pass | pass | declared, dnd5e 6.0 / 6.0.6 | — |
| C04 languages | pass | pass | | — |
| C05 reachable | pass | pass | | — |
| C06 / C06w | pass / pass | pass / pass | `styles/light.css` | — |
| C07 flags.pentaryn | **fail** | **fail** | no tier/namespace/cssPrefix; `flagScope: "senses"` | 13 (Wave 7). **Metadata only.** The code already writes `flags.pentaryn-senses.*`, so unlike walls there is no data migration. |
| C08 | pass | pass | | — |
| C09 relationships | pass | **fail** | live `light.mjs` calls `ui.ARGON?.collapseAllPanels?.()` | 13 (`recommends` enhancedcombathud + reason), WAIT(combat) |
| C10 size | warn | warn | `light.mjs` 819 → 4e64f47 847 (scorer counts 848)/500 | 6 (split into feature + ui + adapter) |
| C11 pure core | pass | pass | `chain-core.mjs`, `light-core.mjs` | 3 (one barrel `senses-core.mjs` + `core/*`) |
| C12 MODULE once | **fail** | **fail** | `chain-core.mjs:10`, `migrate.mjs:12`, `senses.mjs:32` (`SCOPE`) | 2 (finding -18) |
| C13 extra .md | **fail** | **fail** | `LIGHT-DESIGN.md` | 9 (finding -27) |
| C14 kit | **fail** | **fail** | | 1 |
| C15 | pass | pass | | — |
| C16 | pass | pass | `chain/glow/light/migrate.mjs` unclassified | 3–6 |
| C17 module-scope hooks | **fail** | **fail** | `glow.mjs:162`. In effect also `chain.mjs:308–312` and `light.mjs:843–847` (snapshot `:814–818`), which self-install at import (the scorer sees only the literal call). | 5 (finding -16, -23) |
| C18 features | **fail** | **fail** | none export `install`/`uninstall` as features | 5 |
| C19 | pass | pass | emits none | — |
| C20 hooks golden | **fail** | **fail** | | 1 |
| C21 settings calls | **fail** | **fail** | `light.mjs:277` (`core.rollMode`, now in `announce`; snapshot `:269`), `migrate.mjs:81` (register), `:99` (`dnd5e.senseVisionSync`), `:105` | 4 |
| C22 SETTINGS | **fail** | **fail** | | 4 |
| C23 | pass | pass | | — |
| C24 empty catch | **fail** | **fail** | `light.mjs:510` (snapshot `:495`), `migrate.mjs:36`, `migrate.mjs:100` | 3 (`:36`), 4 (`:100`), 6 (`:510`) |
| C25 | pass | pass | every line has `pentaryn-senses \|` | — |
| C26 | pass | pass | | — |
| C27 api-manifest | **fail** | **fail** | | 7 |
| C28 goldens | **fail** | **fail** | | 1 (surface), 7 (describe) |
| C29 inspect | n/a | n/a | the scorer reads `flagScope "senses"`; the module **does** write `flags.pentaryn-senses.{itemLight,itemLightPrior,spellLight,chain}` on tokens | becomes applicable at 13 → met by 11 (finding -25) |
| C30 | pass | pass | | — |
| C31 | manual | manual | `link`/`break` return booleans/counts; `toggle`/`hood` booleans (`hood` now also posts a chat line); `reconcile` undefined | 7 (documented `legacy:true`) |
| C32 | pass | **fail** | row `senses-light-pick-collapse-hud` (**renamed `argon-light-pick-collapse-panels`**, D2 `df661e0`) has no `wrapMethod` naming it | 12 (row rename or scorer fix) |
| C33 private internals | n/a (scorer miss) | n/a | manually: `Token#_preview` (`chain.mjs:130`), `PrimaryCanvasGroup.SORT_LAYERS` (`:105`), shader chunks (`glow.mjs:131–159`), `usageConfig.create.summons` / `placeSummons` DOM (`light.mjs:706`, `:560`; snapshot `:685`, `:545`), `options.replacements` (`:775`, snapshot `:746`), `ui.ARGON` (`:190`) | 12 (finding -29) |
| C34 nested lang | **fail** | **fail** | flat `PENTARYN_SENSES.Light.*` keys | 8 |
| C35 i18n | **fail** | **fail** | `light.mjs:39` two-branch `L()` wrapper (29 call sites at 4e64f47, up from 28) | 8 (finding -24) |
| C36 English | warn | warn | `chain.mjs:225` (and the `:223`/`:233`/`:234` labels), `glow.mjs:155` | 8 (finding -24) |
| C37 CSS scope | **fail** | **fail** | `styles/light.css` selectors (`.ps-*` is fine once `cssPrefix: "ps-"` is declared) | 13 |
| C37w | warn | warn | 1 `!important` (`light.css:44`, snapshot `:35`, the pick crosshair over PIXI's inline cursor) | stays (removing it is declared B5; it also keeps cursors' glyph off during a pick) |
| C38 | n/a | n/a | | 13 (`ps-` unique: grep shows only senses uses it) |
| C39 | pass | pass | `config.py:188` | — |
| C40 tier tests | **fail** | **fail** | | 1, 10 |
| C41 VERSION | **fail** | **fail** | | 1 |
| C42 | n/a | n/a | | 1 |
| C43 fixed run.mjs | **fail** | **fail** | self-running chain suite + `import("./light.mjs")` + `import("./migrate.mjs")` | 1 |
| C44 README | **fail** | **fail** | per-feature sections, not the fixed order | 9 |
| C45 CHANGELOG | **fail** | **fail** | | 9 |
| C46 | pass | pass | | 9 (its own routing row, finding -27) |
| C47 | pass | pass | | — |
| C48 reserved | **fail** | **fail** | `chain.mjs:261` `uninstall`, `light.mjs:730` `uninstall` (the `api` member; the function is `:721`) | 7 (**declared**) |
| C49 hot hooks | pass (scorer) | pass | manually: `refreshToken` → `links()` → `chainPairs(scene.tokens.contents)` per event when no chain is drawn (`chain.mjs:285–287`) | standalone (finding -19) |
| C50 | n/a | n/a | | 7 |
| C51 | n/a | n/a | | 4 |
| C52 | pass | pass | | — |

## 2. Target layout vs today

```
pentaryn-senses/                  today (snapshot)                         →  target
  module.json                     48                                         + flags.pentaryn (tier full, ns senses, flagScope
                                                                               pentaryn-senses, cssPrefix ps-), minimum 14, recommends
                                                                               enhancedcombathud (Wave 7)
  senses.mjs          ENTRY       131: entry + carried-light feature          ≈ 110: wiring only. FEATURES [glow, chain, light, carried, migrate]
  senses-core.mjs     PURE (new)  —                                          barrel: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS,
                                                                               HOOKS, FLAGS; re-exports core/*
  core/ids.mjs        (new)       —                                          MODULE, FLAGS (finding -18), so core/* need not import the barrel
  core/util.mjs       (new)       —                                          esc, unsetPath (findings -10, -18)
  core/chain.mjs                  ← chain-core.mjs (58)                       + resolveTokenRef, pairsCache, linkSpriteSpecs
  core/light.mjs                  ← light-core.mjs (283; 4e64f47: 299)        + itemLightUpdate, planSyncLight, collectSources,
                                                                               litByIn, summarise, inspectShape
  core/glow.mjs                   ← glow.mjs:19–95                            wave maths (finding -21); shouldReinit (-22b)
  core/migrate.mjs                ← migrate.mjs:1–73                          planSightReset & co.
  settings.mjs        (new)       —                                          SETTINGS [sightReset store row]; system/core setting readers
  api-manifest.mjs, api.mjs (new) —                                          legacy rows for senses.*, light.*, chain.*; inspect
  glow.mjs            FEATURE     162                                         ← glow.mjs:97–160 shader + animation; install → reg.once("init")
  chain.mjs           FEATURE     312                                         install(reg, ctx)/uninstall(); no self-install, no publish
  light.mjs           FEATURE     819 (4e64f47: 847)                          ≲ 480: actions, GM reconcile, hook wiring
  light-ui.mjs        UI (new)    —                                          prompt dialog, pick, card buttons, sheet row, Light HUD
  light-world.mjs     ADAPTER (new) —                                        realItem, itemFrom, allItems, litBy, allSources, findToken, casterToken
  argon.mjs           ADAPTER (new) —                                        collapseArgonPanels() (`light.mjs:190`; argon-kit later, Wave 8.6)
  carried.mjs         FEATURE (new) ← senses.mjs:18–110                       carried light: schedule, syncLight, syncAll
  migrate.mjs         FEATURE     120                                         ← migrate.mjs:89–120 resetSight only
  lib/                (new)       full + election
  lang/en.json                    flat (27 keys at 4e64f47)                   nested PENTARYN_SENSES.{Light,Chain,Glow}
  styles/light.css                36 (4e64f47: 45)                            unchanged
  LIGHT-DESIGN.md                 357                                         → context/plans/senses-light-cantrip.md
  README.md (152; 4e64f47: 158), CHANGELOG.md (new)
  test/run.mjs                    74: chain checks + chained imports          fixed body
  test/light.mjs, test/migrate.mjs                                            → test/light-core.test.mjs, test/migrate.test.mjs
  test/{core,glue,hooks,api,i18n,glow,carried}.test.mjs (new), test/fixtures/legacy-*.mjs, test/golden/*.json
```

**Old → new map.** Snapshot lines, with the 4e64f47 line in brackets where it differs. Only `light.mjs` moved.

| Old | Lines | Anchor | New |
|---|---|---|---|
| `senses.mjs` imports (side-effect) | 8–16 | `import "./glow.mjs";` | entry `import * as glow/chain/light/carried/migrate` + `FEATURES` |
| `pending`, `isWriter` | 18–22 | `function isWriter() {` | `carried.mjs`; `isWriter` → `isActiveGMOrLoneGM()` from `lib/election.mjs` (same truth table; finding -17) |
| `SCOPE` | 32 | `const SCOPE = "pentaryn-senses";` | deleted → `MODULE` from `core/ids.mjs` |
| `carriedLight` | 34–37 | `function carriedLight(actor) {` | `carried.mjs` |
| `lightUpdate` | 44–63 | `function lightUpdate(doc, light) {` | `core/light.mjs` `itemLightUpdate(doc, light, {flatten, clone, del})` + a one-line wrapper in `carried.mjs` (finding -12) |
| `syncLight` | 65–89 | `async function syncLight(actor) {` | `carried.mjs`; planning half → `core/light.mjs` `planSyncLight` (finding -11) |
| `schedule`, `actorOf` | 91–102 | `function schedule(actor) {` | `carried.mjs` (+ `.catch` in finding -15, declared) |
| carried hooks | 104–110 | `Hooks.on("updateActor", (actor) => schedule(actor));` | `carried.mjs` `install(reg)` |
| `Hooks.once("init", registerSightReset)` | 112 | | entry `onInit` → `registerSettings()` |
| ready: api object + publish + GM chain | 114–131 | `const api = { syncLight, carriedLight, resetSight` | rows → `api-manifest.mjs`; publish → entry `publishNamespace("senses")` + `publishNamespace("chain", api.chain, {alias:true})`; GM chain → entry `onReady` (verbatim order) |
| `chain-core.mjs` | 1–58 | `export const MODULE = "pentaryn-senses";` | `core/chain.mjs` (MODULE from `./ids.mjs`) |
| `chain.mjs` state/warn | 25–31 | `const TEX = ` | `chain.mjs` |
| `docOf` | 37–41 | `const docOf = t => {` | pure `resolveTokenRef(ref, {viewed, fromUuid})` in `core/chain.mjs`; first pinned to today's three branches (finding -26) |
| `links`, `link`, `breakChain` | 43–72 | `export function links(scene = canvas?.scene) {` | `chain.mjs`. `:69` `-=` → `unsetPath` (finding -10, declared) |
| drawing | 78–192 | `function texture() {` | `chain.mjs` (geometry → `linkSpriteSpecs` in finding -20, standalone) |
| HUD | 198–237 | `function hudButton(col, cls, icon, tip, onClick) {` | `chain.mjs` (strings → `_loc`, finding -24) |
| `on()` wrapper | 243–252 | `function on(name, fn) {` | deleted → `reg.on(name, warnWrap(name, fn), {guard:false, label:\`chain ${name}\`})` |
| `uninstall` | 254–259 | `export function uninstall() {` | the feature's `uninstall()` (not on the API, C48) |
| `api`, `publish` | 261–271 | `const api = { link, break: breakChain` | rows `chain.*`; publish deleted |
| `install` + self-install | 273–312 | `function install() {` | `install(reg, ctx)`; `globalThis.__pentarynChain` and the `:296–305` ready publish deleted (declared, dev-only) |
| `glow.mjs` maths | 19–95 | `const KEY = "pentaryn-brokenglow";` (KEY stays in glow.mjs) | `core/glow.mjs` (`LIMITS`, `rng`, `hashString`, `nextPeak/Trough/Half`, `buildEpoch`, `waveLevel`, `brightnessFor`); `glow.mjs` re-exports them |
| `glow.mjs` animation + register | 97–160 | `function animateBrokenGlow(dt,` | `glow.mjs` |
| `Hooks.once("init", register)` | 162 | | `glow.mjs` `install(reg)` → `reg.once("init", register, {guard:false, label:"glow register"})` |
| `light.mjs` consts/state/warn | 29–38 | `const CAST = \`flags.${MODULE}.lightCast\`;` | `light.mjs` |
| `L` (two-branch) | 39 | `const L = (key, data) =>` | deleted → `_loc("PENTARYN_SENSES.…", data)` at each site (C35) |
| `esc` | 40 | `const esc = s => ` | `core/util.mjs` (exact body; finding -18) |
| `isGM` | 41 | `const isGM = () => !!game.users?.activeGM?.isSelf;` | `isActiveGM()` (kit; same truth table; finding -17) |
| `unset` | 43–48 | `function unset(path) {` | `core/util.mjs` `unsetPath(path, del = globalThis._del)` (finding -10) |
| `realItem`, `itemFrom` | 50–66 | `function realItem(item) {` | `light-world.mjs` |
| `cast`, `canSeeName`, `end`, `onMe`, `pickAndCast` | 69–138 | `export async function cast(item, target) {` | `light.mjs` (`casterToken` 117–124 → `light-world.mjs`) |
| `prompt` | 140–162 | `export async function prompt(item) {` | `light-ui.mjs` |
| `hitAt`, `pick` | 163–250 [163–253] | `export function pick() {` | `light-ui.mjs`; the Argon line [188–190] → `argon.mjs` `collapseArgonPanels()` |
| `toggle`, `hood`, `setup` (+ `announce`, `ensureTorchActivity` since 17275c9) | 251–314 [254–329] | `export async function toggle(item) {` | `light.mjs`; `:269` [277] rollMode via `settings.mjs`. `ensureTorchActivity` also backs the new `createItem` hook (-38) |
| `allItems`, `litBy`, `anyLitBy`, `allSources`, `findToken` | 320–359 [335–374] | `function allItems({ worldItems = false } = {}) {` | `light-world.mjs` (pure halves `collectSources`/`litByIn` → core, finding -13) |
| `tellOwners`, `reconcile`, `queue`, `run`, `sweep`, `tidyOldSummons` | 361–508 [376–523] | `async function reconcile(source) {` | `light.mjs`; `:446` [461] `game.pentaryn?.senses?.syncLight` → `ctx.exposed.syncLight`; `:495` [510] empty catch → `log.debug` |
| card / sheet / HUD | 510–662 [525–683] | `function cardButton(icon, label, act) {` | `light-ui.mjs`, with actions injected by `light.mjs`'s `install` |
| `on()` wrapper | 668–679 [689–700] | `function on(name, fn) {` | deleted → `reg.on(name, warnWrap(name, fn), {guard:false, label:\`light ${name}\`})` |
| `onUse`, `onUsed` | 681–698 [702–719] | `function onUse(activity, usageConfig) {` | `light.mjs` |
| `uninstall`, `api`, `install`, self-install | 700–818 [721–847] | `export const api = {` | `install(reg, ctx)`/`uninstall()`; rows `light.*`; `globalThis.__pentarynLight` and the hot-republish block `:803–811` [832–840] deleted (declared, dev-only) |
| `migrate.mjs` pure | 1–73 | `export const MODULE = "pentaryn-senses";` | `core/migrate.mjs` (MODULE from `./ids.mjs`; `:36` catch rewritten, step 3) |
| `registerSightReset` | 79–87 | `game.settings.register(MODULE, SIGHT_RESET, {` | `settings.mjs` row `{ key: "sightReset", store: true, type: Number, default: 0 }`, which registers exactly `{scope:"world", config:false, type:Number, default:0}` as today |
| `resetSight` | 89–120 | `export async function resetSight({ force = false } = {}) {` | `migrate.mjs` feature (`install` exposes it) |
| `test/run.mjs` chain block | 8–68 | `const { MODULE, CHAIN_FLAG, readChain` | `test/core.test.mjs` |
| `test/light.mjs`, `test/migrate.mjs` | all | | `test/light-core.test.mjs`, `test/migrate.test.mjs`, imported through `../senses-core.mjs` |

## 3. Ordered steps

**WAIT gate first.** Nothing below starts until Joe lifts `pentaryn-senses` from `wait.json`.
Steps tagged **WAIT(transform)**, **WAIT(creatures)**, **WAIT(combat)**, **WAIT(aoe)** or **WAIT(riders)** also need
that module lifted (or their senses-only half done alone, as stated).

### Step 0 — re-anchor (no edits)

- `git diff ee505c2..HEAD -- foundry/module/pentaryn-senses`. **Re-anchored at 4e64f47 (2026-10-11).**
  Everything the 2026-10-10 22:45 note called "live" is now committed in 17275c9, with more besides.
  `light.mjs` offsets from the snapshot are:

  | Snapshot range | 4e64f47 offset | Why |
  |---|---|---|
  | 1–187 | +0 | |
  | 188–251 | +3 | `pick`: `try { ui.ARGON?.collapseAllPanels?.(); } catch (e) { warn("collapse HUD panels", e); }` at `:190` (U-6 re-run W10) |
  | 252–314 | +3 → +15 | reshaped, so re-anchor by text: `toggle` `:255–266` with its chat line factored into `announce(item, key)` `:268–282`; `hood` `:284–293` now announces too (`HoodLowered`/`HoodRaised`, U-8 L5); `setup` `:299–310` with its loop body factored into `ensureTorchActivity(item)` `:312–329` |
  | 315–606 | +15 | |
  | 607–630 | +15 → +21 | `decorateSheet` `:622–651` dims an "outshone" flame via `lightingItemId` (U-8 L5) |
  | 631–725 | +21 | |
  | 726–818 | +29 | new GM hook `on("createItem", …)` after `canvasTearDown` (`:748–754`, U-6 re-run W11) → finding **-38** |

  Elsewhere: `light-core.mjs` gains `lightEntries` (private) and `lightingItemId` (`:126–158`; `MODULE`
  import still `:12`). `lang/en.json` has 3 new flat keys (27 in all). `styles/light.css` has a hit-box
  and a `.outshone` rule (`!important` now `:44`). `test/light.mjs` has 5 new checks, so `node test/run.mjs`
  gives 31 + 100 + 25 = **156** (was 151). `module.json` is now `0.4.1`. README +6. The adjustments row
  `senses-light-pick-collapse-hud` (**renamed `argon-light-pick-collapse-panels`**, D2 `df661e0`) is at `foundry/adjustments.yml:862`.
- `conformance.py --module senses --markdown`. Run `node test/run.mjs` from the module folder; it must
  be green.
- Re-read the four cross-module contracts on the live tree:
  - `pentaryn-transform/starry.mjs` writes `flags.pentaryn-senses.light` (`SENSES` const, `:28`; still `:28` at 4e64f47).
  - `pentaryn-creatures` leaves alone a token light that senses owns (README `:25`).
  - The `dnd5e-chat-message-types` adjustments row lists `pentaryn-senses/light.mjs`, aoe files and riders files.
  - `dnd5e.preUseActivity` veto order against aoe/riders.

### Step 1 — characterise (tests, vendored kit, additive exports) · C14, C20, C28 (surface), C40, C41, C43

1. `vendor.py sync senses --tier full --kit election`.
2. Additive exports, with no behaviour change:
   - A new **`senses-core.mjs`** barrel. It re-exports everything `chain-core.mjs` and `light-core.mjs`
     export, plus `migrate.mjs`'s pure names (`SIGHT_RESET`, `SIGHT_RESET_DONE`, `RESET_SIGHT`,
     `needsSightReset`, `systemReady`, `planSightReset`). Add `SHORT = NS = "senses"`,
     `VERSION = "0.4.1"` (module.json at 4e64f47; was 0.4.0 at the snapshot), `CONTRACT = "pentaryn-senses/api@1"`, `I18N = "PENTARYN_SENSES"`,
     `CSS = "ps-"`, `HOOKS = Object.freeze({})`.
   - `glow.mjs` additionally exports `rng`, `hashString` and `buildEpoch` (finding -21 needs them).
   - **All new tests import through `senses-core.mjs`, `glow.mjs` or the entry**, so the moves in
     step 3 never touch a test.
3. `test/run.mjs` gets the fixed body with `LEGACY = []`. The three self-running suites become
   node:test files that keep their `check()` semantics through `harness.checkJSON`:
   - `run.mjs:8–68` → `test/core.test.mjs`. It imports `../senses-core.mjs` bare first (purity) and adds `VERSION === module.json.version`.
   - `test/light.mjs` → `test/light-core.test.mjs`.
   - `test/migrate.mjs` → `test/migrate.test.mjs`.
   Delete the old files in the same commit. That makes 156 assertions at 4e64f47, unchanged (151 at the snapshot, plus 5 `lightingItemId` checks).
4. Oracles: verbatim copies, never imported by runtime.
   - `test/fixtures/legacy-light-update.mjs` = `senses.mjs:44–63`, taking `foundry.utils` from the stub.
   - `legacy-sync-plan.mjs` = the selection part of `:65–89`, returning `[{scene, updates}]` instead of writing.
   - `legacy-unset.mjs` = `light.mjs:44–48` (unchanged at 4e64f47), plus chain's `-=` literal at `chain.mjs:69`.
   - `legacy-publish.mjs` = the guard at `senses.mjs:120–125`.
   - `legacy-predicates.mjs` = `isWriter` (`senses.mjs:20–22`), `isGM` (`light.mjs:41`), and `game.user.isGM`.
5. New characterisation files. Each uses the input table from the finding's `behaviourTest`, plus
   hostile rows:
   - **`test/glow.test.mjs`** (-21): set `globalThis.Hooks = { once() {} }`, then
     `import("../glow.mjs")`. Pin `waveLevel("tok1", t)` for t ∈ `[0, 350, 1000, 60000, 119999, 120000, 240123]`
     rounded to 1e-9, `hashString("tok1:0")`, `brightnessFor(0) === 0.3` and
     `brightnessFor(1) === 0.85` → `golden/glow.json`. Invariants: levels in [0, 1]; continuity at
     the epoch boundary (119999 vs 120000 within the cosine slope); the same key gives the same value
     after clearing the cache. Interleave 40 keys × 5 timestamps and compare each with a fresh
     single-key computation (-22a). Count `buildEpoch` calls; it is 200 today and marked `// KNOWN:`.
   - **`test/carried.test.mjs`** (-11, -12):
     - `itemLightUpdate` cases against `legacy-light-update`:
       - `spellLight` → null.
       - Equal light with `itemLight` true → null.
       - `itemLight` false over `{bright:5, dim:10}` → `{light, itemLight:true, itemLightPrior:{5,10}}`.
       - The same over 0/0 → no prior key.
       - Light null, `itemLight` true with a prior → `light = prior`, `itemLight` false, prior deleted (with `del = SENTINEL` → SENTINEL; with no `_del` → `null`).
       - No prior → `DARK`.
       - `itemLight` false and light null → null.
     - The `planSyncLight` scene/token order against `legacy-sync-plan`: s1 holds t1 (actor A, linked) and t2 (actor B); s2 holds t3 (actor A, unlinked, its own items). Then run 100 seeded worlds (mulberry32).
   - **`test/util.test.mjs`** (-10, -17, -18, -34):
     - `unset("flags.pentaryn-senses.chain")` with no `_del` → `{"flags.pentaryn-senses.-=chain": null}`. With a sentinel → `{"flags.pentaryn-senses.chain": SENTINEL}`. Dotless `"a"` → `{".-=a": null}`.
     - `esc('<a href="x">\'&"</a>')` pinned; `esc(null) === ""`.
     - Predicates over four stub games (`activeGM` self+GM, `activeGM` other+GM, `activeGM` null+GM, `activeGM` null+player):
       - `isActiveGM` → `[true, false, false, false]`
       - `isWriter` → `[true, false, true, false]`
       - `isAnyGM` → `[true, true, true, false]`
     - The publish guard's three states (undefined / extensible / frozen root).
   - **`test/glue.test.mjs`**. Start from `installFoundry({ user: makeUser({ isGM: true }), users: [gm], modules: { "pentaryn-senses": {} }, settings: { "dnd5e.senseVisionSync": true } })`. Then set:
     - `game.system = { id: "dnd5e", version: "6.0.6" }`
     - a minimal `PIXI` and `requestAnimationFrame` (driven by `t.mock.timers`)
     - `foundry.canvas.rendering.shaders = { TorchIlluminationShader: class { static get defaultUniforms() { return {}; } }, TorchColorationShader: class {} }`
     - `CONFIG.Canvas = { lightAnimations: {} }`
     - `fromUuidSync` over stub collections

     Then `await import("../senses.mjs")`. Cases:
     - (a) `pinJSON("hooks", F.hooks)`. Today's order is: `once init` (glow); `on canvasTearDown, canvasReady, refreshToken, destroyToken, createToken, deleteToken, updateToken, renderTokenHUD`, `once ready` (chain); `on dnd5e.preUseActivity, dnd5e.postUseActivity, dnd5e.renderChatMessage, renderBaseActorSheet, renderTokenHUD, canvasTearDown, createItem (since 17275c9), updateItem, deleteItem, createToken, deleteToken, deleteActor, deleteAmbientLight, updateAmbientLight, deleteScene` (light); `on updateActor, createItem, createActiveEffect, updateItem, updateActiveEffect, deleteItem, deleteActiveEffect, createToken`, `once init`, `once ready` (senses). Pin this from HEAD (4e64f47 or later), not the snapshot.
     - (b) `fire("init")`: `CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"].label === "Broken glow (wandering)"`. Setting `pentaryn-senses.sightReset` is registered as exactly `{scope:"world", config:false, type:Number, default:0}`.
     - (c) `fire("ready")` as the active GM: `Object.keys(game.pentaryn.senses)` deep-equals `["syncLight","carriedLight","resetSight","light","setupLight","syncAll"]`. `Object.keys(game.pentaryn.chain)` deep-equals `["link","break","links","repaint","uninstall"]`. `Object.keys(game.pentaryn.senses.light)` is pinned too. The ready chain runs `resetSight` → `syncAll` → `sweep` in that order (`F.calls`: the token sight updates and `settings.set sightReset 1` come before any carried-light update, and those come before any reconcile write).
     - (d) the same as a non-active second GM: no reset, no sweep, but the API is still published.
     - (e) frozen root, in both load orders: `game.pentaryn.chain` and `game.pentaryn.senses` both present.
     - (f) carried light: `fire("updateActor", actorWithShard)`, then advance 250 ms. Expect exactly one `actor.update` (`prototypeToken.*`) and one `scene.updateEmbeddedDocuments("Token", [...])` per scene, in scene order. Three hooks within 250 ms coalesce into one sync. A `syncLight` that throws is today an unhandled rejection: `// KNOWN:` (-15).
     - (g) chain HUD (GM): `renderTokenHUD` with a stub element on a chained token adds `.ps-chain-btn` with `data-tooltip="Break chain"`. A click writes `{_id, "flags.pentaryn-senses.-=chain": null}` and shows `The chain on Hulk breaks.`. With exactly one other token targeted, the button reads `Chain to Stake`, and a click writes `flags.pentaryn-senses.chain = {anchor}` and shows `Hulk is chained to Stake.`.
     - (h) Light: `dnd5e.preUseActivity` for a Light spell item sets `usageConfig.create.summons = false` and returns `undefined`. For a torch toggle activity it returns `false` (the veto) and writes `flags.pentaryn-senses.lit = true` plus one chat message.
     - (i) console text: a throwing handler in chain logs `console.warn("pentaryn-senses | chain <name>", err)`, and in light logs `"pentaryn-senses | light <name>"`, both returning `undefined`. A light handler returning `false` still returns `false`.
     - (j) `F.utilsSource === "foundry"`.
     - (k) torch on create (**-38**, new at 4e64f47): as the active GM, `fire("createItem", torch)`
       with no activities gives exactly one `item.update` keyed `system.activities.<TORCH_ACTIVITY_ID>`
       with `sort: 0`. With existing activities it is `max(sort) + CONST.SORT_INTEGER_DENSITY`. Firing
       on an item that already has the activity, or a `lightToggle`-flagged one, gives 0 updates. A
       non-active GM gives 0. A torch with `pack: "world.gear"` gives 1, marked `// KNOWN:` (-38). A
       throwing `update` gives one `console.warn("pentaryn-senses | light setup <uuid>", err)` and no
       rejection.
     - (l) carried-light UI (17275c9): `toggle` writes `lit` and posts `PENTARYN_SENSES.Light.Lights`
       / `Douses`. `hood` posts `HoodLowered` / `HoodRaised` under the same roll-mode rule. With a
       lit torch and a hooded lantern, `renderBaseActorSheet` gives the lantern's `.ps-light-toggle`
       the `outshone` class and the `Light.Outshone` tooltip naming the torch. `pick()` calls a stub
       `ui.ARGON.collapseAllPanels` once before it waits for the click.
   - **`test/api.test.mjs`** (step 1 part): `surfaceOf(game.pentaryn.senses)` and `surfaceOf(game.pentaryn.chain)` → `golden/surface.json` (today's surface, function names included).
6. `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, one file at a time, on **unchanged** runtime.
   **Checkpoint:** the characterisation commit lands (review happens at merge).

### Step 2 — one module id, shared util · absorbs: **-18**, **-10** (light half) · C12

- New `core/ids.mjs`: `MODULE = "pentaryn-senses"`, and
  `FLAGS = { light, lit, hooded, lightItem, lightToggle, itemLight, itemLightPrior, spellLight, lightCast, chain }`
  as path strings. `chain-core.mjs:10` and `migrate.mjs:12` import and **re-export** it, so their
  importers are unaffected. `light-core.mjs:12` imports from `./core/ids.mjs` (a relative path that
  is fixed in step 3). `senses.mjs:32` `SCOPE` is deleted and its uses take `MODULE`.
- New `core/util.mjs`: `esc` (exact body of `light.mjs:40`) and `unsetPath(path, del = globalThis._del)`
  (exact body of `light.mjs:44–48`). `light.mjs` imports both. `senses.mjs:61`'s
  `globalThis._del ?? null` stays a separate, documented variant, because it writes the key with
  `null` and not `-=`.

Tests before: `util.test` (esc, unset), `core.test` (MODULE), glue (a)–(j).

### Step 3 — pure code into `core/` behind the barrel · absorbs: **-12**, **-21**, the pure halves of **-13**, **-26** · C11, C16, C24 (`migrate.mjs:36`)

- `git mv chain-core.mjs core/chain.mjs`, `light-core.mjs → core/light.mjs`, and `migrate.mjs:1–73`
  → `core/migrate.mjs` (the Foundry half stays in `migrate.mjs`, step 5). Move `glow.mjs:19–95`
  → `core/glow.mjs`; `glow.mjs` re-exports it, so `glow.test` keeps its import. Update the barrel.
- **-12:** `itemLightUpdate(doc, light, { flatten, clone, del })` in `core/light.mjs` is
  `senses.mjs:44–63` with `foundry.utils.flattenObject` and `deepClone` and `globalThis._del`
  injected. `carried.mjs` (step 5) keeps a one-line wrapper. Document the ownership order
  (spellLight > itemLight > hand-set) in the `core/light.mjs` header. That is the contract that
  creatures and transform rely on. **WAIT(creatures)/WAIT(transform):** characterise it only; do not
  change it here (see the WAIT summary).
- **-13 (pure half):** `collectSources(scenes)` and `litByIn(scenes, source)` in `core/light.mjs`,
  equivalent to `allSources`/`litBy` over plain scene data. The glue keeps calling the live versions
  until finding -13's standalone change.
- **-26 (pure half):** `resolveTokenRef(ref, { viewed, fromUuid })` in `core/chain.mjs`, which
  reproduces today's three `docOf` branches. The uuid branch is added only in the standalone -26
  change.
- **C24 `migrate.mjs:36`:** `storedSight` uses `tryRead(() => doc?._source?.sight)`, where
  `tryRead = (f, fb = null) => { try { return f(); } catch { return fb; } }`. The catch has a body.
  The result is the same.

Tests before: `core.test`, `light-core.test`, `migrate.test`, `glow.test` (every golden),
`carried.test` (-12 table against the oracle).

### Step 4 — settings · C21, C22, C24 (`migrate.mjs:100`), C51

- `settings.mjs`:
  - `SETTINGS = [{ key: "sightReset", store: true, type: Number, default: 0, doc: "one-shot marker: 1 once the retired 0.3 darkvision sight was reset (dnd5e-sense-vision-reset)" }]`.
    A `store` row registers `{scope:"world", config:false, type, default}`, exactly today's
    `migrate.mjs:81–86`, with no labels. C51 skips store rows, so no lang keys are needed.
  - `setting(key)`, `setSetting(key, value)`.
  - `systemSetting("dnd5e", "senseVisionSync")`, returning `undefined` when absent (today's `try … catch { }` at `:98–100`, now with a body).
  - `coreRollMode()` (`light.mjs:277` in `announce`; snapshot `:269`).
- `migrate.mjs:99–105` and `light.mjs:277` call these. The entry's `onInit` → `registerSettings()`
  replaces `senses.mjs:112`. **Hook order:** the entry registers `Hooks.once("init", onInit)` at the
  position `senses.mjs:112` holds today, after all feature hooks (step 5).

Tests before: glue (b), (c); `migrate.test`.

### Step 5 — features and entry wiring · absorbs: **-16**, **-23**, **-17** (rename) · C17, C18, C10 (entry)

- Every feature file exports `install(reg, ctx)` and `uninstall()`, and **none self-installs**. The
  feature files are `glow.mjs`, `chain.mjs`, `light.mjs`, the new `carried.mjs` (`senses.mjs:18–110`),
  and `migrate.mjs` (exposes `resetSight`, no hooks).
  - Delete `glow.mjs:162`, `chain.mjs:308–312` and `light.mjs:843–847` (snapshot `:814–818`).
  - Delete the `globalThis.__pentarynChain/__pentarynLight` sentinels (`chain.mjs:275–279`, `light.mjs:734–739`, snapshot `:713–718`).
  - Delete light's hot-republish (`:832–840`, snapshot `:803–811`). Re-wiring now goes through the entry's hot-patch
    path. **[declared, dev-only]**
- Hook registration (**-16**): `reg.on(name, warnWrap(label, fn), { guard: false, label })`, where
  `warnWrap` is today's wrapper with its body verbatim:
  - light's version passes the return value through (`light.mjs:691–700`, snapshot `:670–679`);
  - chain's version drops it (`chain.mjs:243–252`). Chain handlers return nothing meaningful, so
    pass-through is safe (finding -16), but the guide keeps chain's own wrapper to stay byte-identical.

  Why `guard:false`: the kit's `reg.guard` logs `console.error("pentaryn-senses | <label>")`, while
  today's lines are `console.warn("pentaryn-senses | light <name>")` and `… | chain <name>`. Using the
  kit guard would be a **[declared, console-only]** level change. Prefer a kit option
  (`guard: "warn"`, a kit 1.1 change) over a per-module wrapper. Raise it with the kit owner and
  keep the local wrapper until then. carried and glow handlers were raw, so they are `guard:false`
  with no wrapper.
- `carried.mjs`: `schedule`, `syncLight`, `syncAll` (from `senses.mjs:115–119`), `actorOf`, and the
  9 hooks of `:104–110` in the same order. `ctx.expose({ syncLight, carriedLight, syncAll })`.
  `light.mjs:461` (snapshot `:446`) reads `ctx.exposed.syncLight` instead of `game.pentaryn?.senses?.syncLight`. Today
  that read is `undefined` until senses publishes at ready. Afterwards it is always present, which
  only matters for a reconcile that runs before `ready`, and none does (reconcile is GM-queued from
  hooks that fire after ready).
- **-17:** `light.mjs:41` `isGM` → `isActiveGM` (this includes the new `createItem` hook's guard, `:752`) (a pure rename to the kit function, same truth table).
  `senses.mjs:20` `isWriter` → `isActiveGMOrLoneGM`. `chain.mjs:53/62/172/214` and `light.mjs:300` (snapshot `:291`; also `:678`)
  keep `game.user.isGM` through `isAnyGM()`. Each site keeps **its own** predicate.
- **Entry** `senses.mjs`:
  - Body: header file map; `FEATURES = [glow, chain, light, carried, migrate]`; `ctx`; `install()`
    **synchronously in the body**; then `Hooks.once("init", onInit)` and `Hooks.once("ready", onReady)`.
  - `onReady` (step 7 finishes it) keeps the GM chain verbatim: `if (isActiveGMOrLoneGM()) ctx.exposed.resetSight().catch(warn("sight reset")).then(() => ctx.exposed.syncAll()).then(() => (isActiveGM() ? ctx.exposed.sweep() : null)).catch(warn("ready sweep"))`.
- **Hook-manifest change [declared, registration-only]:** chain's own `once ready` (golden index 10)
  is gone. The chain alias is published by the entry's single `ready` (step 7), in the same tick,
  now **after** `senses` and not before. Update `golden/hooks.json` in a **separate** commit whose
  message names this change. Every other position in the golden must stay identical. Check that by
  diffing it against the step 1 pin.
- Cross-module registration order is unchanged, because all registrations still happen while this
  module's esmodule evaluates. This preserves the `dnd5e.preUseActivity` veto order against
  aoe/riders. **WAIT(aoe)/WAIT(riders):** if aoe or riders change their registration timing first, re-run the
  order check with `foundry/lib/test/fixtures/hook-order.mjs`.

Tests before: all glue cases; `hooks.json` (with the one declared diff); a new `hooks.test.mjs`
(every feature exports `install`/`uninstall`; after `api.uninstall()`, `F.listeners()` is zero
for every name the module registered).

### Step 6 — split `light.mjs` · C10, C16, C24 (`light.mjs:510`, snapshot `:495`) · WAIT(combat) for the Argon line

- `light-ui.mjs` (UI) takes `prompt` (140–162), `hitAt`/`pick` (163–250; 4e64f47 163–253), card
  (510–588; 4e64f47 525–603), sheet (590–634; 4e64f47 605–655, which now imports `lightingItemId` from core) and HUD (636–662; 4e64f47 657–683). It receives the actions object
  `{ cast, end, onMe, pickAndCast, toggle, hood, run }` from `light.mjs`'s `install`, because ui must
  not import a feature.
- `light-world.mjs` (adapter) takes `realItem`, `itemFrom` (50–66), `casterToken` (117–124),
  `allItems`, `litBy`, `anyLitBy`, `allSources` and `findToken` (320–359; 4e64f47 335–374).
- `argon.mjs` (adapter, live drift) takes `collapseArgonPanels()`, wrapping the `:188–190` lines (4e64f47)
  verbatim, including its `warn("collapse HUD panels", e)`. **WAIT(combat):** the shared `argon-kit`
  (Wave 8.6) replaces this adapter's body later. Do not vendor `argon-kit` now (D7).
- `light.mjs` (feature, ≲ 480 lines) keeps actions (with `announce`), `setup`/`ensureTorchActivity`, reconcile, queue,
  run, sweep, `tidyOldSummons`, `onUse`/`onUsed`, and `install` with the hook list in its current
  order. **C24 `:510` (snapshot `:495`):** `catch (e) { ctx.log.debug("summon origin unresolvable", e); }`. It is
  debug-gated, so silent by default.
- **Adjustments follow-up (in the step 12 batch):** the `dnd5e-chat-message-types` row lists
  `pentaryn-senses/light.mjs`, and its marker `message.type` (`light.mjs:552`, snapshot `:537`) moves to
  `light-ui.mjs`. The row stays valid (its other files carry markers), but its `files` should name
  `light-ui.mjs`. That row also lists aoe and riders files, so edit **only** the senses path
  (**WAIT(aoe)** and **WAIT(riders)**, both in `wait.json`, for anything else in that row).

Tests before: glue (g), (h), (i), (k), (l); `hooks.json` (no change); `light-core.test`.

### Step 7 — API manifest and publish · absorbs: **-34** · C27, C28, C48, C50, C31 (documented)

- `api-manifest.mjs` rows, every one `legacy: true` with today's signature:
  - `syncLight(actor)` → count, gm, writes
  - `carriedLight(actor)` → light|null
  - `resetSight({force})` → `{prototypes, tokens}|null`
  - `syncAll()` → count
  - `setupLight()` → count
  - `light.{cast(item, target), end(item), pick(), toggle(item), hood(item), profileFor(item), sweep(), setup(), onMe(item), prompt(item), reconcile(source)}`
  - `chain.{link(chained, anchor), break(token), links(scene?), repaint()}`

  `light.SPELL_LIGHT` and `light.PHB_LIGHT_ACTOR` are constants, so they go in `unlisted` with
  the impl `{ "light.SPELL_LIGHT": SPELL_LIGHT, … }`.
  `flags: { writes: ["flags.pentaryn-senses.{itemLight,itemLightPrior,spellLight,lightCast,lit,hooded,chain}"], reads: ["flags.pentaryn-senses.{light,lightItem,lightToggle}"] }`.
  The `light` item flag is **written by pentaryn-transform** (Starry form).
- **C48 [declared, console/dev-only]:** `chain.uninstall` (`chain.mjs:261`) and `light.uninstall`
  (`light.mjs:730`, the `api` member; the function is `:721`) are reserved names at any level, so `buildApi` throws on them. They leave the
  surface. `game.pentaryn.senses.uninstall()` (a kit member) uninstalls every feature. Nothing in
  the repo calls the old paths (grep of `foundry/module`, `context`, `scripts`, 2026-10-10; re-checked at 4e64f47, still none outside `context/plans`). A
  `logCompatibilityWarning` shim is impossible, because the old name cannot exist under `buildApi`.
- `api.mjs` `buildApiFor(ctx)` maps rows to `ctx.exposed.*` and the pure functions.
- Entry `onReady`:
  `ctx.api = buildApiFor(ctx); publishNamespace(NS, ctx.api, { moduleId: MODULE }); publishNamespace("chain", ctx.api.chain, { moduleId: MODULE, alias: true });`
  then the GM chain. **-34:** both hand-written guards (`senses.mjs:120–125`, `chain.mjs:263–271`)
  are gone; the kit's `aliasInto` carries the same three-state logic.
  - `game.pentaryn.senses.chain` now exists (**-26** alias, additive).
  - `game.pentaryn.chain === game.pentaryn.senses.chain`.
  - Both are **frozen**. Nothing in the repo mutates them; light's hot-republish was the only writer and step 5 removed it.
- `api.test.mjs`: `normaliseDescribe(describe())` → `golden/describe.json`. Rows ↔ impl must match.
  The `surfaceOf` comparison against step 1's `surface.json` must differ **only** by the kit members
  added and the two `uninstall`s removed (a reviewed golden update in the declared commit).
  `game.modules.get("pentaryn-senses").api` is the same object.

Tests before: glue (c), (d), (e); step 1 `surface.json`.

### Step 8 — i18n · absorbs: **-24** · C34, C35, C36

- `lang/en.json` becomes nested: `{ "PENTARYN_SENSES": { "Light": {…}, "Chain": {…}, "Glow": {…} } }`.
  The existing 27 `Light.*` keys (24 at the snapshot, plus `HoodLowered`, `HoodRaised` and `Outshone` from 17275c9) keep their strings. New keys carry today's English exactly:
  `Chain.Break` "Break chain", `Chain.Breaks` "The chain on {name} breaks.", `Chain.LinkTo`
  "Chain to {anchor}", `Chain.Linked` "{name} is chained to {anchor}.", `Light.SetupGMOnly`
  "pentaryn-senses: setupLight is GM-only.", `Glow.Label` "Broken glow (wandering)". Core localizes
  light-animation labels, so `CONFIG.Canvas.lightAnimations[KEY].label` can take the key.
- Delete `L` (`light.mjs:39`). Each site calls `_loc("PENTARYN_SENSES.…", data)`, full-key literals
  only. That is 29 sites in `light.mjs` at 4e64f47 (28 at the snapshot) (they move to `light-ui.mjs` and `light.mjs`) and 4 in `chain.mjs` (two HUD labels, two toasts).
- New `test/i18n.test.mjs`: every key renders to the glue goldens' strings, using
  `{name:"Hulk", anchor:"Stake"}` and the like. The `sourceScan` finds no two-branch wrapper.
  Reload only, no restart.

Tests before: glue (g), (h) text pins; the step 1 strings.

### Step 9 — docs · absorbs: **-27** (module half) · C13, C44, C45, C46

- `git mv LIGHT-DESIGN.md context/plans/senses-light-cantrip.md`, with frontmatter and a
  `**Read this when:**` line. Code headers (`light.mjs:2`, `light-core.mjs:3`, `senses.mjs:12`)
  point there.
- README in the fixed order. The current per-feature sections (vision `:6`, glow `:34`, carried
  `:50`, chains `:63`, Light `:84`) become *What the player sees* subsections. *Data written* and
  *Flags other modules read* get the flag table, naming Starry (transform) as a writer of `light`
  and creatures as a respecter of `itemLight`/`spellLight`. *Two sessions*: active GM writes;
  `isWriter` falls back to any GM when no GM is active. *Extending*: a new light profile is a
  `LIGHT_PROFILES` row plus a `light-core.test` row; a new feature is a file with
  `install/uninstall` added to `FEATURES`. *Pitfalls*: the `!important` pick crosshair; the
  `preUseActivity` veto. *Files*, *Tests*, *Sync*.
- New `CHANGELOG.md`. Give senses its own routing row in `context/foundry/README.md`; today it is in
  the `:67` bundle. Fix the retired-darkvision clause at `:202`, which is the context half of -27
  and can go in the docs batch.

### Step 10 — test-file completeness · C40

`hooks.test`, `api.test` and `i18n.test` exist after steps 5–8. `core.test` carries `VERSION`. Run
the full suite: `node test/run.mjs`.

### Step 11 — `inspect` (C29 after Wave 7) · absorbs: **-25** (additive)

`api.inspect(ref, opts)` (row `inspect`, ref kind `token`, falling back to actor) returns
`toPlain(inspectShape({ token, actor, items, scenes }))` → `{ token: {light, itemLight, itemLightPrior, spellLight}, actor: {carried, carriers: [{kind, item}], hooded}, chain: {anchor, chainedHere: [...]}, lightSpells: [{item, cast, litBy}] }`.
Also `light.status(itemRef)` → `{cast, litBy}`. The `actor` block also carries `lightingItem` (`lightingItemId(items)`), the item whose light the token shows. `inspectShape` is pure in `core/light.mjs`. It is
additive and read-only, so not declared. Test from the -25 recipe:
- token `itemLight` true with prior `{5, 10}`;
- an actor with a lit hooded lantern and a shard → `carried` is the strongest, carrier kinds `["lit","shard"]`, `hooded` true, `lightingItem` = the shard's id (from `lightingItemId`, added at 17275c9; the -25 extension);
- a Light item cast on `{scene:"s", token:"t"}` → `lightSpells[0].litBy` = `[{kind:"token", scene:"s", id:"t"}]`;
- deep-frozen inputs, which proves there is no mutation;
- `maxDepth ≤ 4`.

### Step 12 — adjustments batch · absorbs: **-29** · C32 (live), C33

Append while `foundry/adjustments.yml` is idle, all in one batch:

- `core-light-animation-shader`: `files [glow.mjs]`, `markers ["TorchIlluminationShader", "lightAnimations"]`.
- `core-token-preview-private`: `[chain.mjs]`, `["_preview"]`.
- `core-primary-sort-layers`: `[chain.mjs]`, `["SORT_LAYERS"]`.
- `dnd5e-light-summon-suppress`: `[light.mjs, light-ui.mjs]`, `["create.summons", "placeSummons"]`.
- `core-teleport-replacements`: `[light.mjs]`, `["replacements"]`.

Every row uses `check: make foundry-senses-check`.

**C32 on the row `senses-light-pick-collapse-hud` (**renamed `argon-light-pick-collapse-panels`**, D2 `df661e0`) (`foundry/adjustments.yml:862`, committed in 17275c9):** conformance C32 (conformance.py:779–783)
fails every `<short>-*` row that no `wrapMethod({adjustments})` names, but this row records an API
call, not a patch. Two options:
- (a, preferred) fix C32 to apply only to rows for prototype or hand wraps, together with use-doc §5.6's
  "prefix every row `<short>-`";
- (b) rename the row to `argon-light-pick-collapse-panels` and point `files` at `argon.mjs`.

Decide once for all modules. The cursors guide (step 10) makes the same call; walls has no adjustments row. **WAIT(combat):** any
Argon row edit is coordinated with the combat/riders rows in the same batch.

### Step 13 — Wave 7 restart batch · C02, C07, C09 (live), C37, C38

`module.json`:
- `minimum: "14"`;
- `relationships.recommends: [{ id: "enhancedcombathud", type: "module", reason: "Light's Pick a target closes open Combat HUD panels first (argon.mjs)" }]`;
- `flags.pentaryn = { tier: "full", namespace: "senses", flagScope: "pentaryn-senses", cssPrefix: "ps-", generation: 14, afterSync: [the five lines from scripts/foundry/ops/config.py:193–197] }`.

The `flagScope` change is **metadata only**: the code already writes `flags.pentaryn-senses.*`, so
there is no data migration. `ps-` is used only by senses (grep). Declaring `ps-` makes C37 pass with
no CSS edit. Restart.

## 4. Findings that stay standalone (not structural)

Each one is its own commit **after** step 10, against the goldens.

| Finding | Change | Gate / test | Declared? |
|---|---|---|---|
| **-11** | `tokensByActor` index built once in `syncAll`; `syncLight(actor, {index})` | `carried.test` index-vs-scan equivalence, 100 seeded worlds | no |
| **-13** | (a) `deleteToken` scan only when `!token.actorLink`; (b) per-burst `sourcesNow()` memo cleared by `queueMicrotask` (kit `perf.memo` is an option, `--kit perf`) | `light-core.test` `collectSources`/`litByIn`/`sourcesUnder` table; glue (h) deletions queue the same sources | no |
| **-14** | `reconcile` returns `{source, desired, restored, removed, lit, created, released, cleared}`; `light.reconcile()` resolves to it; `log.debug` line; `api.recent()` ring (20) | pure `summarise` table; glue: writes identical with debug on and off | **yes** (API return shape `undefined` → object) |
| **-15** | `syncLight(actor).catch(e => console.warn(\`${MODULE} \| carried light ${actor.name} (${actor.id})\`, e))` in `schedule` | glue (f): one warn with that prefix, zero `unhandledRejection` | **yes** (console-only) |
| **-19** | `pairsCache` per scene id, invalidated on create/deleteToken, canvasReady, canvasTearDown, flag updates; `refreshToken` uses the cached length; `// hot: pairsCache` (C49) | `core.test` counting `docsFn`; glue chain repaint counts | no |
| **-20** | `paint()` keeps `Map<pairKey,{shadow, link}>` and updates in place; `linkSpriteSpecs` pure | `core.test` `linkSpriteSpecs({0,0},{300,400},28,96)` → width 500, height 28, rotation `atan2(400,300)`, scale 28/96, shadow offset/alpha 0.45; stub PIXI: second paint constructs 0 sprites | no (visual identical) |
| **-22** | (a) epoch cache keyed per source, LRU 64; (b) `shouldReinit(st, radius, now)` in `core/glow.mjs`; README wording on cadence | `glow.test` goldens unchanged; `buildEpoch` count ≤ 40 (the `// KNOWN:` row flips) | no |
| **-25** | `inspect`, `light.status` | step 11 | no (additive) |
| **-26** | `resolveTokenRef` accepts Token uuids through `fromUuidSync`; `links(sceneId)`; optional `linkInfo()` | `core.test`: `"Scene.s.Token.t"` → doc, an Actor uuid → null, plus today's three branches unchanged | **yes** (`link()` with a uuid or other-scene ref now succeeds instead of returning `false`) |
| **-10** (chain half) | `chain.mjs:69` `-=` → `unsetPath(...)` (`_del` on v14) | glue (g) write becomes `{"flags.pentaryn-senses.chain": _del}`; golden updated in the declared commit | **yes** (same deletion, different operator; live-verify Break chain) |
| **-38** | `createItem` torch hook skips pack documents (`item.pack`); optional pure `torchActivityPlan` | glue (k): pack torch 1 → 0 updates, every other row unchanged; `light-core.test` plan table | **yes** (compendium torches no longer gain the activity on create) |
| **-27** (context half) | `context/foundry/README.md:202` clause and routing row; the `config.py` comment | docs batch | no |

Absorbed by structure: **-12**, **-21** (step 3), **-16**, **-17**, **-23** (step 5), **-18**, the
light half of **-10** (step 2), **-24** (step 8), **-27** (module half, step 9), **-29** (step 12)
and **-34** (step 7).

## 5. Declared behaviour changes (live-test handoff)

| # | Change | Observe |
|---|---|---|
| S-1 | `chain.uninstall` and `light.uninstall` leave the API (C48); `senses.uninstall()` replaces them. | `game.pentaryn.chain.uninstall` is `undefined`; `game.pentaryn.senses.uninstall()` removes every senses hook (Token HUD loses Break chain / End light until reload). |
| S-2 | The APIs are frozen, gain kit members (`describe`, `version`, `contract`, `settings`, `trace`) and `module.api`, `game.pentaryn.senses.chain` exists, and `pentaryn-senses.ready` / `pentaryn.ready` fire. | `game.pentaryn.senses.describe()`; `game.pentaryn.chain === game.pentaryn.senses.chain`. |
| S-3 | The chain alias is published by the entry's ready, **after** `senses` (today: before, by its own listener). The hook manifest loses one `once ready`. | Nothing at the table. `Hooks.events.ready` count −1. |
| S-4 | Hot re-import of `light.mjs` or `chain.mjs` alone no longer re-wires. Use `senses.uninstall()` and then re-import the entry. | Dev only. |
| S-5 | Break chain writes `_del` instead of `-=` (-10 chain half). | GM: Break chain on a chained token; the chain disappears on every client. |
| S-6 | `light.reconcile()` resolves to a summary object (-14). | Console: `await game.pentaryn.senses.light.reconcile(uuid)`. |
| S-7 | A failed debounced carried-light sync warns with the module prefix instead of an anonymous unhandled rejection (-15). | Console only. |
| S-8 | `chain.link()` accepts Token uuids and other-scene refs (-26). | `game.pentaryn.chain.link("Scene.x.Token.y", anchor)` → true. |
| S-9 | (only if the kit gains `guard:"warn"`, or the kit guard is adopted) hook-error log level warn → error. | Console only. |
| S-11 | A Torch created inside a compendium pack no longer gets the Light activity from the `createItem` hook (-38). World, actor and token torches still do. | GM: drag a Torch into an unlocked world pack. It has no Light activity. Drag it onto an actor and the flame button appears. |
| S-10 | Wave 7: `module.json` flags/minimum/recommends. Restart. | The module loads after restart; Configure Settings is unchanged. |

**WAIT summary:** the module is WAIT (`wait.json`). Inside it:
- **WAIT(transform)**: the transform half of the `flags.pentaryn-senses.light` contract test (transform-creatures-21). Senses pins the reader side in `carried.test`; transform's manifest gains `flags.writes` when transform migrates.
- **WAIT(creatures)**: the `itemLightUpdate` ownership rule is characterised only and never changed here (transform-creatures-28 owns the arbitration).
- **WAIT(combat)**: the `argon.mjs` adapter body and the Argon adjustments row (Wave 8.6 `argon-kit`).
- **WAIT(aoe)** and **WAIT(riders)** (both in `wait.json`): the shared `dnd5e-chat-message-types` row, and the `preUseActivity` veto-order check.

## 6. Effort

| Part | Estimate |
|---|---|
| Step 0 re-anchor + step 1 characterisation (largest glue stub of the three; 5 oracles; glow goldens) | 1.5 days |
| Steps 2–7 restructure (5 features, light split, API + alias) | 1.5 days |
| Steps 8–9 i18n and docs | 0.5 day |
| Steps 11–13 (inspect, adjustments, Wave 7 items) | 0.5 day |
| Standalone fixes (-11, -13, -14, -15, -19, -20, -22, -26, -10 chain, -38) | 1 day |
| Live test of S-1 … S-10 (scratch world: carried torch, Light cast/end/pick with Argon open, chain link/break, glow, a portal move) | 0.5 day |
| **Total** | **about 4–5 days (L)** |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **91.5 %** (43/47 fail-class rules) at `4e9cc5bf` — was 55.6 % at the checkpoint, 51.1 % at base |
| Date | 2026-10-11 (code phase only; nothing synced or run live) |
| Commits | characterisation: `5e76c4a1` · refactor (steps 1–11): `0a2d50ad` `0bd574da` `a3388e0b` `13bd7517` `902cde6f` `a1ea3e1a` `a6561663` `92cc591f` `4110d70a` `f76e7f91` `88f85d98` `9e0c3a20` `7b5d79fd` `a269f91d` `c5af5e88` `92d0834c` `4e9cc5bf` · standalone: `c1478be1` `59870f95` `90273143` `2ae44ef8` `282d6c16` `42c4cfb7` `ff544d99` `9fda315e` `6d43eb7e` `cece01a2` `763dda0f` `980958eb` `ab430bed` · review fixes: `41cc0954` (inspect, S-12) `e4a8f0c7` (-13 deleteItem half) |
| Declared changes handed to the live-test workflow | S-1 … S-8, S-11 … S-14, J10, glow label (table below); live session not yet run |
| `module.json` edits appended to `wave7-restart-batch.md` | no — a shared file: returned to the integrator (step 13 rows, unchanged from the guide) |
| Adjustments rows appended to `adjustments-batch.md` | no — a shared file: returned to the integrator (step 12 rows + the two moved-marker rows) |
| Still failing, and why | C07, C09, C37: the Wave 7 `module.json` batch. C32: `argon-light-pick-collapse-panels` still lists `light.mjs` (the marker moved to `argon.mjs` at step 6; the row edit is the integrator's). Warn: C02 (Wave 7), C37w (the pick crosshair's `!important`, kept) |

### Wave 3 code phase (2026-10-11)

Gates at `4e9cc5bf`: `node test/run.mjs` 146 node:test cases, 146 pass, 0 todo (the checkpoint's todo is
fixed, `ab430bed`); `module-check senses` (parse, imports, i18n 33/33, node-test, vendor, conformance)
green; `vendor.py check senses` identical. Coverage over the module's own files: **99.61 / 91.74 /
98.94** (checkpoint 98.96 / 91.46 / 98.64); left: the drift `catch` in the entry's ready and
`tidyOldSummons`' unresolvable-origin `catch` (now a debug line).

Frozen-test changes, each in a named [declared] commit: `hooks.json` index 9 and the listener counts
(S-3 `a6561663`); `glue-hot` (S-4 `92cc591f`); `glue-frozen`, `glue-frozen-late` (S-3, then J10
`f76e7f91`); `surface.json`, `hooks-uninstall.json`, the published-key lists in `glue`/`glue-player`, the
uninstall tests in `hooks`/`chain` (S-1/S-2 `88f85d98`; + `inspect`/`light.status` `c5af5e88`, +
`light.recent` `9fda315e`); the glow label rows (`7b5d79fd`); `setup-light.json` (S-13 `59870f95`); the
reconcile `value`s in four light goldens (S-6 `9fda315e`); chain's link refusals (S-8 `6d43eb7e`); the
`-=` literal in `chain-break`/`chain-hud`/`second-gm` (S-5 `763dda0f`); `light-torch-create` packTorch
(S-11 `980958eb`); `glow-animation` t=9000 bright and the todo (S-14 `ab430bed`). Import paths only:
`0bd574da`. Every other frozen assertion and golden is byte-identical to the checkpoint. Additions
(new test files or appended rows): `core-pure`, `settings`, `adapters`, `i18n`, `inspect`,
`carried-index`, `carried-errors`, `light-perf`, `chain-perf`, `reconcile-summary`, the VERSION and -22a
rows. No stop rule fired.

How it differs from the guide as written:
- **Order.** The declared hook-manifest change (S-3) and the hot-path removal (S-4) are their own
  commits right after step 5's structural commit; J10 (the frozen-root throw, kit 1.0.2) is its own
  commit before step 7. Docs (step 9) closed the wave, after the standalone pass, so the README
  describes the final API.
- **Hook guard.** Kit K7 had landed, so chain/light use `reg.on(…, { guard: "warn", label: "chain
  <hook>" | "light <hook>" })` — the same console text, no level change; S-9 does not apply.
- **Adapter name.** `light-world.mjs` is `light-adapter.mjs`: the scorer's C16 adapter pattern only
  knows `argon|shapes|piles|adapter|*-adapter`.
- **inspect.** `lightSpells[].litBy` is a list of `Scene.<id>.Token|AmbientLight.<id>` uuids, not
  `{kind, scene, id}` objects (those would make the answer 5 deep; cap 4). `light.status` keeps the
  objects. `inspectShape` lives in `core/inspect.mjs` (it needs chain and light).
  `token.spellLight.prior` (a `toObject()` light, with `animation` and `darkness`) is one flat level
  of Foundry-style dotted keys (`"animation.type"`): nested, they sat at depth 4 and `toPlain` cut
  them to `"[max depth]"` (review fix `41cc0954`; `inspect.test` asserts no `"[max depth]"` leaf).
- **Glow on hot import.** The glow feature registers at once when the world is already ready (the
  entry's hot path never fires `init`).
- **Extra, in the spirit of the guide:** `handSquareEdit` (the hand-moved/deleted Light square rule)
  is pure in core, which keeps `light.mjs` under 500 lines; `tokensByActor`, `summarise`,
  `linkSpriteSpecs`, `shouldReinit` likewise.

Review fixes (after `4e9cc5bf`): `41cc0954` inspect's spell prior (above); `e4a8f0c7` finding -13's
deleteItem half — the hook asks the burst memo (`sourcesNow().has(item.uuid)`) instead of
`anyLitBy`, so a batch delete of N items walks the world once (`light-perf` row; the frozen
`light-gm-hooks` golden unchanged). `node test/run.mjs`: 149 cases, 149 pass.

§5.9 async review (what is recorded, not built — rows in `wave-3-report.md` "Open for Joe"):
- two GM tabs both run the Light reconcile (square created twice, whisper posted twice);
- `setupLight()` updates each torch one at a time (C59);
- senses — syncAll writes prototypes one actor at a time (C59); batching per world
  (Actor.updateDocuments) changes the glue ready-chain call order pins, so it would be its own
  declared perf step.

Live-test handoff (gated live phase; walls-style "nothing live" until then):

| # | Observe |
|---|---|
| S-1/S-2 | `game.pentaryn.senses.describe().version === "0.4.1"`; `game.pentaryn.chain === game.pentaryn.senses.chain`; `game.pentaryn.chain.uninstall === undefined`; `Object.isFrozen(game.pentaryn.senses)`; `game.modules.get("pentaryn-senses").api === game.pentaryn.senses` |
| S-3 | `Hooks.events.ready` has one fewer senses listener; both namespaces present after ready |
| S-4 | dev: `game.pentaryn.senses.uninstall()` then `await import("/modules/pentaryn-senses/senses.mjs?v=2")` re-wires (Break chain back on the HUD) |
| S-5 | GM: Break chain on a chained token; the chain disappears on every client |
| S-6 | `await game.pentaryn.senses.light.reconcile(<Light uuid>)` → summary; `light.recent()` |
| S-7 | console only (a failing carried sync warns `pentaryn-senses \| carried light <name> (<id>)`) |
| S-8 | `await game.pentaryn.chain.link("Scene.x.Token.y", "Scene.x.Token.z")` → true on a non-viewed scene |
| S-11 | drag a Torch into an unlocked world pack: no Light activity; drag it onto an actor: the flame button |
| S-12 | `game.pentaryn.senses.inspect(<token>)` (depth ≤ 4); `light.status(<Light item>)` |
| S-13 | give the Goblin's torch its activity (`setupLight()`); no write to the goblin token's actor prototype |
| S-14 | a broken-glow light with a Bright radius brightens on each swell (not only after a token refresh) |
| J10 | nothing at the table (`game.pentaryn` is never frozen) |
| glow label | Token / Ambient Light config: the animation still reads "Broken glow (wandering)" |
| perf | a scene with many tokens: drags with a chain drawn stay smooth; a batch delete of tokens (or of items, `e4a8f0c7`) is one sweep |
| two GM tabs | see wave-3 report: duplicate Light square from two GM tabs (not changed) |

### Checkpoint `5e76c4a1` (wave 3, 2026-10-11)

Base `a5a1a906` (wave-3-base). Only `test/**` changed. `node test/run.mjs`: 104 node:test cases, 103
pass, 1 todo (the three old suites run inside them: chain-core 31, light-core 100, migrate 25 checks).
Coverage over the module's own files (`node --test --experimental-test-coverage`, `test/` excluded):
**91.40 / 90.79 / 95.83** before, over the 3 pure files only (`senses.mjs`, `chain.mjs`, `glow.mjs`,
`light.mjs` were never loaded) → **98.96 / 91.46 / 98.64** over all 7. Left uncovered: the
self-install `catch` branches (`chain.mjs:277,303,311`, `light.mjs:737,838,846`), three pure `catch`
branches in `light-core.mjs`, `migrate.mjs:40`.

How it differs from step 1 as written:
- **Imports.** The tests import today's files (`../chain-core.mjs`, `../light-core.mjs`,
  `../migrate.mjs`, `../glow.mjs`, `../senses.mjs`). The `senses-core.mjs` barrel, glow's extra
  exports (`rng`, `hashString`, `buildEpoch`) and `vendor.py sync` (`lib/`, `kit.lock.json`) are not
  test files, so they open the refactor (step 1.1–1.2 → do them first, then switch the imports — an
  import-path-only change). `test/kit/` is a byte-identical copy of `foundry/lib/test-kit` 1.0.2,
  which is what `vendor.py sync` writes. Waiting on the barrel: the C41 `VERSION` pin; on glow's
  export: the `buildEpoch` call count (-22a `// KNOWN:` row).
- **Files.** `core.test` (purity + the old chain block), `light-core.test` and `migrate.test` (the old
  suites, renamed as-is), `glow.test`, `carried.test` (-11/-12 against the oracles), `util.test`,
  `hooks.test` (a; `hooks.json`), `api.test` (`surface.json`), `chain.test` (g), `light.test` (h, i,
  k, l and every GM hook), and one boot per `ready` scenario: `glue.test` (b, c, i, j, setupLight),
  `glue-second-gm` (d), `glue-lone-gm`, `glue-player`, `glue-frozen` + `glue-frozen-late` (e, both
  orders), `glue-hot` (the dev path S-4 retires), `glue-ready-errors`. Oracles:
  `fixtures/legacy-light-update.mjs`, `legacy-sync-plan.mjs`, `legacy-util.mjs` (esc, unset, the
  chain `-=` literal, the three predicates, the publish guard — one file instead of four).
- **glow.test** calls `register()` directly; registration timing is pinned through the entry.

Todo pins (KNOWN, `{ todo }`):
- `glow.test` "bright follows the wave back up" — new, no audit id. `animateBrokenGlow` writes
  `bright: Math.min(this.data.bright, radius)` and `BaseEffectSource#initialize` merges into
  `this.data`, so the bright radius only shrinks until a token refresh re-initializes the source
  (`glow-animation.json`, t=9000: dim 114, bright 101). The fix reads the document's bright; it is a
  [declared] visual change.

Pinned as today, flipped later by their declared commits: -38 (`light-torch-create.json`
`packTorch` row), -26 (`chain.test` link refusals: a Token uuid and an off-scene id give `false`),
-10 chain half (`chain-break.json`, `-=`), S-1/S-2/S-3 (`surface.json`, `hooks.json`,
`hooks-uninstall.json`, the `glue.test` keys test). **-15 is not pinned**: an unhandled rejection
fails the node:test file, so `glue-ready-errors` lets the scene recover before the debounced
re-sync; -15's own commit adds the warn row.

Observations for the standalone pass (not todo, not changed):
- `syncLight` on an unlinked token's synthetic actor (any item hook on its items, e.g. setupLight
  giving the Goblin's torch its activity) writes `prototypeToken.*` on the synthetic actor
  (`setup-light.json`). Live, an ActorDelta has no prototype, so that is a wasted write per sync —
  fold into -11.
- `onMe` returns the notification object on a refusal, not `false` (`light-onme.json`) — C31 legacy shape.
- A chain toward a **hidden anchor** is drawn for players (`chain.test`); only the chained end is
  checked. Recorded for Joe in `wave-3-report.md`.
- Stub gap: the kit stub fires `update<Type>` hooks on an empty diff; Foundry does not. So `end()` on
  a Light whose `lightCast` is already `null` (left so by a failed reconcile, `light-sweep.json`)
  shows a reconcile here but, live, writes nothing and triggers none. Check live with -14.
