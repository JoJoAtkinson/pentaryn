---
title: Migration guide — pentaryn-creatures to the addon blueprint
status: done (offline) — live test pending
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, creatures]
---

# Migrating `pentaryn-creatures` to the blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

**Read this when:** you are about to bring `pentaryn-creatures` up to the addon blueprint (fix
phase of the 2026-10 code audit). **Not this file:** the general procedure and the kit →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the design →
[`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) · the audit text →
[`../code-audit-2026-10/creatures.md`](../code-audit-2026-10/creatures.md) · the module's use →
`foundry/module/pentaryn-creatures/README.md`.

> **WAIT — do not start.** `scripts/foundry/blueprint/wait.json` lists `pentaryn-creatures` ("live-test
> workflow was editing it on 2026-10-10; lift only when Joe confirms"). The live tree has already
> moved past the snapshot (step 0 lists the drift). It is not one of the combat/transform/aoe trio,
> but it reads `pentaryn-aoe`'s handle flags, and aoe **is** in flux: the aoe contract fixture in
> step 2 must be re-anchored against aoe's live `core.mjs` too.

> **Re-anchored to `4e64f47` on 2026-10-11.** The WAIT drift this guide predicted (step 0) is now
> **committed** in `17275c9` (usability re-run, U-6-12): `placeStrip`/`dockTimer`
> (creatures.mjs:233-248), `stripDock` (creatures-core.mjs:126-139), setting `floatOverHud`
> (creatures.mjs:340-344) and adjustments row `creatures-strip-over-argon` (adjustments.yml:873-882).
> Line numbers below are now **HEAD `4e64f47`** line numbers; the snapshot number follows in
> brackets where it differs ("[snap :296]"). creatures.mjs lines 1-232 did not move. The score
> was re-run on the live folder (§1). New audit finding from the re-run code:
> transform-creatures-40 (§4). The `wait.json` entry is unchanged — still WAIT until Joe confirms.

Line numbers were originally **snapshot** line numbers (pentaryn `ee505c2` + the uncommitted tree
of 2026-10-10 20:15 EDT; for this module the snapshot equals `ee505c2`).

| | |
|---|---|
| Tier | **full** (world settings, an API that writes token light, a prototype patch) |
| Kit | full tier + `patch`, `patch-libwrapper` (lib-wrapper is in `relationships.recommends`), `election` (`isActiveGM` = today's `isWriter`) |
| WAIT | **yes** (wait.json); re-anchor creatures **and** aoe's `isHandleTarget` before any edit |
| Findings absorbed | transform-creatures-28, -29, -30, -31 (structural or API-boundary); seams for -25, -26, -27, -40 (the behaviour changes themselves stay standalone, §4) |
| Steps | 11 (step 0 plus 10), one kit prerequisite (K1) |
| Effort | **M**: about 2 days of agent work, one checkpoint, one adjustments-batch item, one Wave 7 item |
| Prerequisites | K1 getter route — **landed** (kit 1.0.1); K5 `buildApi` freezes a copy — **landed** (kit 1.0.1) |
| Scores | **Re-scored 2026-10-11 on the live folder at `4e64f47`: 53.7 % (22/41)** — same score and same failing set as the snapshot; details moved (C21, C26, C35 lines; C32 now also names `creatures-strip-over-argon`; C33 is manual). `conformance.py --module creatures --markdown` |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today

Full tier: **53.7 % (22/41 fail-class rules)** — re-scored on the live module folder at `4e64f47`
(2026-10-11), unchanged from the snapshot. Failing: C07, C09, C14, C18, C20, C21, C22, C26, C27,
C28, C32, C35, C37, C40, C41, C43, C44, C45, C47. Warn: C06w, C10. Manual: C31, C33.

| Score row | Date | Tree | Score |
|---|---|---|---|
| snapshot | 2026-10-10 | `ee505c2` | 53.7 % (22/41) |
| live re-score | 2026-10-11 | `4e64f47` | **53.7 % (22/41)** |

| Rule | Today | Detail (snapshot) | Cleared by |
|---|---|---|---|
| C01-C05 | pass | | |
| C06 / C06w | pass / warn | `creatures.css` at the root | Wave 7 (step 10): → `styles/creatures.css` |
| C07 | **fail** | no tier, namespace, cssPrefix; `flagScope: "creatures"` | step 10. Code already writes `flags.pentaryn-creatures.light` (core.mjs:11-12, 61), so the fix is metadata only — **no data migration** |
| C08 | pass | | |
| C09 relationships | **fail** | code names item-piles (creatures.mjs:30) but relationships do not. The re-run's Argon selector (`.extended-combat-hud`, :239) is not detected by C09; add `enhancedcombathud` to `recommends` with a reason anyway in step 10 | step 10 (`recommends` item-piles **and** enhancedcombathud with reasons) |
| C10 (warn) | warn | `creatures.mjs` 381/150 (scorer count; snapshot 358) | steps 3-6 |
| C11 core | pass | `creatures-core.mjs` pure | stays pure; grows in step 2 |
| C12 | pass | `MODULE` at core.mjs:11 | |
| C13 | pass | | |
| C14 kit | **fail** | | step 1 |
| C15 | pass | `import * as core` is a core import | the entry's `import * as` of features is allowed |
| C16 | pass | | |
| C17 | pass | single runtime file is the entry | stays pass: hooks move into features through `reg` |
| C18 features | **fail** | `creatures-core.mjs: no install, uninstall` (the only `import * as` target) | steps 4-6 |
| C19 | pass | emits none | |
| C20 hooks golden | **fail** | | step 1 |
| C21 | **fail** | creatures.mjs:22, :327, :334, :340, :345 (snapshot :22, :309, :316, :322; :340 is the re-run's `floatOverHud`) | step 3 |
| C22 | **fail** | no `SETTINGS` | step 3 |
| C23 | pass | | |
| C24 | pass | (the bare `catch { return false; }` at :143 has a body, so C24 passes; -29 still fixes it) | step 5 |
| C25 | pass | | keep texts |
| C26 publish timer | **fail** | creatures.mjs:366 [snap :343] `setTimeout(…, 0)` around publish | step 7 |
| C27 / C28 | **fail** | no api-manifest, no describe/surface goldens | step 7 |
| C29 | n/a | scorer: "writes no flags of its own" (it does write `flags.pentaryn-creatures.light` on tokens; see step 7, `inspect`) | |
| C30 | pass | | |
| C31 (manual) | manual | `syncScene`/`syncAll` return counts (legacy) | step 7 |
| C32 patches | **fail** | creatures.mjs:154 `libWrapper.register`; row `creatures-libwrapper` names no `wrapMethod` patch; **live:** row `creatures-strip-over-argon` (adjustments.yml:873) is a non-patch row with the module prefix, which C32 also fails (R1 / D2) | step 5 (needs K1) + rename the Argon row per D2 (e.g. `argon-creatures-strip-float`) in the adjustments batch |
| C33 | manual (live) | scorer now lists it as manual | -29 adds the private reads to the row anyway |
| C34 | pass | nested `PENTARYN_CREATURES` | |
| C35 | **fail** | definite coverage 80 % (8/10) live (snapshot 75 %, 6/8; the two new `floatOverHud` literals count): the `L` prefix wrapper (creatures.mjs:19) hides `label`/`hint` | step 3 |
| C36 | pass | | |
| C37 CSS scope | **fail** | `#pentaryn-creatures` and `#pentaryn-creatures .pcr-*` selectors | step 8 |
| C37w | pass | | |
| C38 | n/a | no cssPrefix | step 10 declares `pcr-` (free on 2026-10-10) |
| C39 | pass | ModuleSpec runs node-test (`config.py:262-271`) | |
| C40 | **fail** | missing core/glue/hooks/api/i18n tests | steps 1, 7 |
| C41 | **fail** | | step 2 |
| C42 (manual) | n/a | | |
| C43 | **fail** | `test/run.mjs` is a self-running suite | step 1 (→ LEGACY) |
| C44 | **fail** | README sections are feature-numbered, not use-doc §7 | step 9 |
| C45 | **fail** | | step 9 |
| C46 | pass | | |
| C47 | **fail** | no adjustments row for item-piles with `modules: [pentaryn-creatures]` (enhancedcombathud is covered by `creatures-strip-over-argon`) | step 5 adjustments batch |
| C48 | pass | | |
| C49 | pass | | (-25 is the real hot-path item; §4) |
| C50-C52 | n/a | | step 7 (C50), step 3 (C51) |

**Expected:** 39/41 after step 9; 41/41 after the Wave 7 batch (C07, C09).

## 2. Target layout

```
foundry/module/pentaryn-creatures/
  module.json          Wave 7: flags.pentaryn {tier: full, namespace: creatures, flagScope: pentaryn-creatures,
                       cssPrefix: pcr-, generation: 14, afterSync}; recommends item-piles (+ reason); styles/creatures.css
  creatures.mjs        ENTRY: file map, FEATURES, phase wiring in golden order, publish            ≈ 100 lines
  creatures-core.mjs   PURE: constants + today's rules + new seams (step 2)                          ≈ 220 lines
  settings.mjs         SETTINGS (lightRadius, ownerSees, floatOverHud, showStrip — live order), setting() ≈ 80 lines
  tokens-adapter.mjs   ADAPTER: summarize(t, user) → plain summary (reads item-piles/aoe flags via core) ≈ 40 lines
  light.mjs            FEATURE: queue/flush/syncScene/syncAll + six hooks                            ≈ 90 lines
  owner-sees.mjs       FEATURE: Token#isVisible wrap (marker literal here), ownerOverride, setup hook ≈ 70 lines
  creature-strip.mjs   FEATURE: strip hooks + scheduleRender                                          ≈ 40 lines
  strip.mjs            UI: mount/render/build/markControlled/click handlers + placeStrip/dockTimer    ≈ 140 lines
  api-manifest.mjs     PURE rows: list, render, syncScene, syncAll, isCreature, ownerSees, patchedWith, status; unlisted core
  api.mjs              impl map over ctx.exposed, status(), buildApiFor(ctx)                          ≈ 80 lines
  lib/                 errors, log, hooks, publish, resolve, settings, api, queries, flags, patch, patch-libwrapper, election
  lang/en.json         unchanged keys
  styles/creatures.css Wave 7 move; selectors rescoped in step 8
  test/run.mjs (fixed; LEGACY = ["test/core-legacy.mjs"]), test/core-legacy.mjs (today's run.mjs, moved)
  test/{core,glue,hooks,api,i18n}.test.mjs, test/fixtures/{world,dom,legacy-creatures}.mjs, test/golden/*.json
  README.md, CHANGELOG.md
```

Old → new (HEAD `4e64f47` `creatures.mjs` unless noted; snapshot lines in brackets):

| HEAD lines [snapshot] | What | Goes to |
|---|---|---|
| 1-14 | header | entry file map + README "What the player sees" |
| 16-18 | `import * as core` + destructure (now also `stripDock`) | entry imports core named exports (D12); features import what they use |
| 19 `L` | two-branch prefix wrapper | deleted; three literal `_loc("PENTARYN_CREATURES.label")`/`.hint` calls (:204, :253, :255 [snap :204, :235, :237]) |
| 21 `isWriter` | `activeGM?.isSelf === true` | `isActiveGM()` from `lib/election.mjs` (identical body) |
| 22 `setting` | try/catch reader | `settings.mjs` `setting = settingReader(MODULE, SETTINGS)` (same catch → per-row default; every call's fallback equals the row default) |
| 28-31 `isPile`, 34-36 `isProp` | flag predicates | core `isItemPile(tokenFlags, actorFlags)`, `isAoeHandle(tokenFlags, actorFlags)` (-30) called from `tokens-adapter.mjs` |
| 39-55 `summarize` | document → plain | `tokens-adapter.mjs` verbatim |
| 61-100 queue/flush/syncScene/syncAll | light writer | `light.mjs` |
| 103-120 six hooks | light triggers | `light.mjs` `install` (`reg.on`, same order) |
| 126-178 ownerOverride/patchVisibility/refreshTokenVisibility | owner-sees | `owner-sees.mjs` |
| 184-310 [184-292] strip DOM, incl. `placeStrip`/`dockTimer` 233-248 | UI | `strip.mjs` |
| 312-320 [294-302] strip hooks | triggers | `creature-strip.mjs` `install` |
| 326-351 [308-328] `Hooks.once("init")` | **four** registers (lightRadius, ownerSees, floatOverHud, showStrip) | `settings.mjs` rows; `onChange` → `ctx` callbacks (`ctx.onLightRadius`, `ctx.onOwnerSees`, `ctx.onShowStrip`) set by the features; `floatOverHud` has no `onChange` today |
| 354-357 [331-334] `Hooks.once("setup")` | read setting + patch | `owner-sees.mjs` `install` → `reg.once("setup", …)` |
| 359-362 [336-339] `Hooks.once("ready")` | GM sync + first render | entry `onReadyStartup` (calls `ctx.exposed.syncAll`, `ctx.exposed.scheduleRender`) |
| 366-380 [343-357] deferred publish | API + frozen-root guard | entry `onReadyPublish`: `buildApiFor(ctx)` + `publishNamespace("creatures", api, {moduleId: MODULE})` |
| `test/run.mjs` (142 lines [136]) | self-running core suite, incl. 4 `stripDock` checks at 135-139 | `test/core-legacy.mjs`, listed in `LEGACY` (unchanged content) |

The entry keeps **two** `ready` registrations (startup, then publish) and registers `init` and
`setup` exactly where today's module body did, so `golden/hooks.json` stays byte-identical across the
whole refactor (§3 step 1 lists the 17 rows).

## 3. Steps

### Step 0 — WAIT lift and re-anchor (no diff)

1. Proceed only after Joe confirms and `wait.json` drops `pentaryn-creatures`.
2. `git diff 4e64f47 -- foundry/module/pentaryn-creatures` plus `git status` (the guide is anchored
   to `4e64f47`; anything that shows here is new drift). The drift recorded on 2026-10-10 22:32, now
   committed in `17275c9` and folded into §2 and the line numbers: core `stripDock(hud, viewH, {gap})` added after `stripSignature`;
   `creatures.mjs` gains `placeStrip()` with a 500 ms `setInterval` (`dockTimer`) that reads
   Argon's DOM (`.extended-combat-hud .action-hud`), and a fourth setting `floatOverHud` (world,
   Boolean, default true, `PENTARYN_CREATURES.settings.floatOverHud.{name,hint}`); README, CSS,
   lang and `test/run.mjs` changed too. Fold all of it into §2 (strip UI, settings row, a golden
   row for nothing — it registers no hook) and into step 1's tests (dock maths in core; interval
   started once, cleared when the strip goes).
3. Re-anchor aoe's predicate: `pentaryn-aoe/core.mjs` `isHandleTarget` — **at `4e64f47`
   :364-368** (snapshot :310-314), body unchanged (`flag(doc) || flag(doc?.token) ||
   doc.flags[module].handleActor`) — step 2's contract fixture copies its flag paths. Re-check if
   aoe has moved again.
4. `conformance.py --module creatures --markdown`. Done 2026-10-11: 53.7 % (22/41), same set. The
   Argon DOM read already has its row (`creatures-strip-over-argon`, added by U-6-12) — but that row
   now fails C32 (R1/D2: module-prefixed non-patch row); rename it with the adjustments batch. Add
   `enhancedcombathud` to `recommends` in step 10.

### Step 1 — characterise (tests + vendored files; the checkpoint)

- `vendor.py sync creatures --tier full --kit patch,patch-libwrapper,election` (refuses
  `patch-libwrapper` unless `relationships` names lib-wrapper — it does, module.json `recommends`).
- `git mv test/run.mjs test/core-legacy.mjs`; new fixed `test/run.mjs` with
  `LEGACY = ["test/core-legacy.mjs"]` (clears C43; the 136-line suite keeps running unchanged).
- `test/fixtures/legacy-creatures.mjs`: verbatim `isPile`/`isProp`/`summarize` (creatures.mjs:28-55)
  with `game.user` injected — the oracle for step 2's predicates.
- `test/fixtures/dom.mjs`: a minimal `document` (createElement, getElementById, `#ui-bottom`,
  `#hotbar`, classList, dataset, replaceChildren, `querySelector` for `.extended-combat-hud
  .action-hud` returning an element with `offsetParent` and `getBoundingClientRect`, `style`,
  `window.innerHeight`) — the stub has no DOM.
- `test/glue.test.mjs` with `installFoundry({ users: [gm, player], scenes })`, tokens: a player-owned
  `npc` (summon), a PC, an Item Piles pile (token flag), an aoe handle (actor flag `handleActor`), a
  GM-only npc; `foundry.canvas.placeables.Token` stub class with an `isVisible` getter returning
  false. Import `creatures.mjs`, fire init → setup → ready.
  - `golden/hooks.json` (17 rows, in order): on createToken, on updateToken, on updateActor, on
    createUser, on updateUser, on deleteUser, on canvasReady, on createToken, on deleteToken, on
    updateToken, on updateActor, on updateUser, on controlToken, once init, once setup, once ready,
    once ready.
  - `settings.register` option pins, in registration order: `lightRadius` (range
    `{min:0,max:30,step:0.5}`), `ownerSees`, `floatOverHud` (world, Boolean, default true, no
    `onChange`), `showStrip` (scope client) — literal keys `PENTARYN_CREATURES.settings.<key>.name/hint`.
  - strip dock (U-6-12, characterise as-is): with a bar rect `{top:700,left:300,width:900,height:120}`
    and `innerHeight` 900 the strip gets class `pcr-floating`, `bottom: 208px`, `left: 300px`; with no
    bar it has neither; the first render arms one 500 ms interval (`t.mock.timers`) and removing the
    strip clears it on the next tick. `// KNOWN:` (-40) with no Argon element the interval still
    runs and queries twice per tick.
  - owner-sees patch, three paths: (a) no libWrapper → descriptor replaced, `patchedWith() ===
    "direct"`, a player's owned summon now `isVisible === true`, a GM-hidden one `false`; (b) libWrapper
    stub active → `libWrapper.register("pentaryn-creatures",
    "foundry.canvas.placeables.Token.prototype.isVisible", fn, "WRAPPER")`, `patchedWith() ===
    "libWrapper"`; (c) libWrapper throws → warn text
    `pentaryn-creatures | libWrapper registration failed, patching directly`, then direct; (d) no getter
    → `pentaryn-creatures | Token#isVisible not found; owners-see-their-own is off`, `patchedWith()
    === null`. `// KNOWN:` (-29) a token whose `_testCulled` throws → `false`, no console line.
  - light (as active GM): ready → one `updateEmbeddedDocuments("Token", [{_id, "light.bright":5,
    "light.dim":5, "flags.pentaryn-creatures.light":{bright:5,dim:5}}])` for the summon only, **no
    options argument** (pin it: -27 adds one later); as a player → no writes.
  - light queue timing with `t.mock.timers` — `// KNOWN:` (-26) queue at t = 0, 50, 100, 150, 190 →
    exactly one flush, at t = 390; `updateToken {x:1}` → no queue; `{flags:{}}` → queued;
    `updateActor {ownership}` → the actor's tokens queued; `updateUser {role}` → all scenes.
  - `// KNOWN:` (-27) our own light write fires `updateToken` with `light`/`flags` keys and queues a
    second, no-op pass (count the flushes: 2, the second writes nothing).
  - strip (player with summon + PC on the viewed scene): `nav#pentaryn-creatures` inserted before
    `#hotbar` with one label and two buttons, PC first (`rank-0` when it is the user's character);
    `// KNOWN:` (-25) `updateToken {x:5}` schedules a render (60 ms) that rebuilds nothing (signature
    equal); GM client: no strip.
  - publish: `game.pentaryn.creatures` appears **one tick after** `ready` (`setTimeout 0`, pinned:
    absent synchronously after `fire("ready")`, present after `await tick()`); its keys ⊇ `list,
    render, syncScene, syncAll, isCreature, ownerSees, patchedWith, core` → `golden/legacy-surface.json`
    (subset assertion); frozen-root case keeps foreign keys.
  - `// KNOWN:` (-31) `api.syncScene(scene, ["a"])` throws `ids.has is not a function`;
    `api.ownerSees(tokenDocument)` → `false` silently.
- Composed light hand-off with pentaryn-senses (**-28**, plain data, no senses import), added to
  `core.test.mjs` as characterisation: s1 = dark summon → lit 5/5 + flag; senses writes 10/20 while
  our flag says 5/5 → `{[FK]: null}`; senses restores the prior 5/5 unflagged → `lightUpdate(…, on)`
  → `null` and `lightUpdate(…, off)` → `null` (`// KNOWN:` the orphan); `{qualifies:true, radius:0}`
  → `null`.
- `GOLDEN_UPDATE=1 node test/run.mjs`, then green. **Checkpoint:** commit the `lib/`, `test/`
  diff (plus the `test/run.mjs` → `core-legacy.mjs` rename).

### Step 2 — pure seams in core (absorbs **transform-creatures-30**, the seam halves of -25/-26/-27/-29/-31; clears C41)

Add to `creatures-core.mjs`, nothing calling them differently yet except where noted:

- `VERSION = "0.1.1"`, `SHORT`, `NS = "creatures"`, `CONTRACT = "pentaryn-creatures/api@1"`,
  `I18N = "PENTARYN_CREATURES"`, `CSS = "pcr-"`, `FLAG_SCOPE = MODULE`, `HOOKS = Object.freeze({})`.
- `isAoeHandle(tokenFlags, actorFlags)` and `isItemPile(tokenFlags, actorFlags)` with a header
  citing `pentaryn-aoe/core.mjs` `isHandleTarget` (:364 at `4e64f47`; snapshot :310) — **without** aoe's `doc.token`
  branch (-30). `tokens-adapter.mjs`/today's `isProp`/`isPile` call them (this is the one caller
  change in this step; the oracle proves equality).
- Seams only (pure, tested, not yet wired): `STRIP_KEYS` + `stripMayChange(changes)` (-25),
  `shouldQueueLight(changes, options)` (-27), `makeCoalescer(delayMs, run, timers)` written to
  reproduce **today's** debounce first (-26), `overrideFor(view, {enabled, isGM})` + `safely(fn,
  onError)` (-29), `countLit(flagsList)` (-31), `shouldPollDock({stripPresent, floatOverHud,
  argonActive})` + `dockKey(dock)` (-40).
- Tests in `core.test.mjs`: core imported bare first; `VERSION === module.json.version`;
  -30's table (`isAoeHandle({"pentaryn-aoe":{handle:"r1"}},{})` true; `({}, {"pentaryn-aoe":
  {handleActor:true}})` true; `({}, {})` false; `isItemPile({"item-piles":{data:{enabled:true}}},{})`
  true; actor-side true; `enabled:false` false) **and** equality with the step-1 oracle over the
  world fixture; -25's table (`{x:1,y:2}` false, `{elevation:5}` false, `{name}` true, `{texture}` true,
  `{hidden}` true, `{delta}` true, `{flags}` true, `null` false); -27's (`({light:{bright:5}},{})` true,
  `({x:1},{})` false, `({flags:{}},{pentarynCreatures:true})` false, `({actorId:"a"},undefined)`
  true); `makeCoalescer` in debounce mode reproduces 0/50/100/150/190 → one run at 390; `countLit([
  {bright:5,dim:5}, false, undefined])` → 1; the `stripDock` table (4 checks, legacy suite
  test/run.mjs:135-139, ported); -40's `shouldPollDock` / `dockKey` rows.
- Contract fixture (optional pytest, shared with transform-creatures-21's harness): aoe's live
  `isHandleTarget` and `isAoeHandle` agree on the handle shapes.

### Step 3 — settings table and i18n literals (clears C21, C22, C35; C51 pass)

- New `settings.mjs`: `SETTINGS` rows for `lightRadius`, `ownerSees`, `floatOverHud`, `showStrip`
  (live registration order), each with literal `name: "PENTARYN_CREATURES.settings.<key>.name"` and
  `hint: "…hint"` (D4, migrating key shape), options byte-identical to creatures.mjs:327-350 [snap
  :309-327]; `onChange` bodies become `() => ctx.onLightRadius?.()` / `(v) => ctx.onOwnerSees?.(v)` /
  `() => ctx.onShowStrip?.()` so the features keep owning their reaction (the bodies at :332, :338,
  :349 [snap :314, :320, :326] move verbatim into the features in steps 4-6). `floatOverHud` has no
  `onChange` until -40 adds one. `registerSettings(ctx)` =
  `defineSettings(MODULE, SETTINGS, {i18nRoot: I18N, labels: {section: "settings", name: "name",
  hint: "hint"}})`; `setting = settingReader(MODULE, SETTINGS)`.
- `L` deleted; literal `_loc("PENTARYN_CREATURES.label")` / `_loc("PENTARYN_CREATURES.hint")`.
- Tests: step-1 register pins unchanged; new `test/i18n.test.mjs` (every row's literal keys exist in
  `lang/en.json`; no two-branch wrapper via `sourceScan`).

### Step 4 — light feature (clears part of C18; C10 shrinks)

- `light.mjs`: creatures.mjs:61-120 verbatim, hooks through `reg.on` in the same order with labels
  (`"createToken: queue light"`, …); exports `install`, `uninstall` (clears `queued`, the timer);
  `ctx.expose({ syncScene, syncAll })`; `ctx.onLightRadius = () => { if (isActiveGM()) syncAll().catch(err => ctx.log.warn("light sync failed", err)); }`
  — `log.warn` prints `pentaryn-creatures | light sync failed` + err, byte-identical to :332/:360 [snap :314/:337].
- The flush-failure line keeps its interpolation: `ctx.log.warn(\`light sync failed on ${scene.name}\`, err)`.
- Behaviour-neutral: still a debounce (`clearTimeout` + 200 ms) — the -26 change is §4.
- Tests: step-1 glue (light rows, queue timing `// KNOWN:` rows, hooks golden) unchanged.

### Step 5 — owner-sees feature and the kit patch (absorbs **-29** console half [declared]; clears C32 with K1 + rows)

- **Prerequisite K1 (kit change, §4.4 of the use-doc):** `wrapMethod`'s direct path reads
  `target[name]` and only wraps functions; `Token#isVisible` is a **getter**, and reading it on the
  prototype would run the getter against the prototype. Add a getter route to `foundry/lib/patch.mjs`
  (e.g. `spec.kind: "getter"`: the `via` route first; on decline, `Object.getOwnPropertyDescriptor` +
  `defineProperty({...desc, get() { return make.call(this, () => desc.get.call(this)); }})`, marker on
  the new getter, recorded and undoable), kit test, bump, re-vendor. Without K1 the fallback is
  `defineAccessor` for the direct path plus the libWrapper registration kept inline — C32 then still
  fails on `libWrapper.register`; do not ship that.
- `owner-sees.mjs`: `ownerOverride` (:129-146) with `isProp(doc)` → the adapter/core predicate;
  `install(reg, ctx)` registers `reg.once("setup", …)` (body of :354-357 [snap :331-334]) and sets
  `ctx.onOwnerSees = (v) => { ownerSeesOn = v !== false; refreshTokenVisibility(); }`;
  `ctx.expose({ ownerSees: t => ownerOverride(t), patchedWith: () => patchedWith })`. The wrap:
  `wrapMethod(MODULE, { target: foundry.canvas.placeables.Token.prototype, kind: "getter", name:
  "isVisible", path: "foundry.canvas.placeables.Token.prototype.isVisible", type: "WRAPPER",
  marker: "__pentarynCreaturesVisible", label: "Token#isVisible", adjustments:
  "creatures-libwrapper" }, function (wrapped) { return wrapped() || ownerOverride(this); },
  { via: libWrapperRoute({ log }), log })`; `patchedWith = handle.via` ("libWrapper" | "direct" |
  null — the same three values). Keep the "not found" pre-check and its text at the call site.
- **[declared], console-only:** (1) a libWrapper registration failure now prints the kit's text
  `pentaryn-creatures | libWrapper registration failed, wrapping by hand` (was `… patching
  directly`); (2) -29: the catch in `ownerOverride` becomes `ctx.log.warnOnce("owner-sees", "owner
  override failed", err)` — return value still `false`. Both pins move in this step's own commit.
- **Adjustments batch** (file idle, appended together): rewrite `creatures-libwrapper`
  (adjustments.yml:266-275, unchanged at `4e64f47`) per -29 — what "Token#isVisible getter wrapped (libWrapper
  WRAPPER, else defineProperty on the prototype); reads private `_testCulled`,
  `_preview._previewType`, `isFilteredOut`", markers `["isVisible", "_testCulled", "_previewType",
  "__pentarynCreaturesVisible"]` (`libWrapper.register` is no longer in this module's code once the
  route is vendored — it lives in `lib/patch-libwrapper.mjs`; keep it in markers only if the
  exposure grep should still count the vendored file), `native_when: core lets owners always see
  owned tokens`, `retire_class: guarded`; add `creatures-item-piles-flag` (packages `[item-piles]`,
  files `[…/creatures-core.mjs]`, markers `["item-piles"]`, what "reads `flags.item-piles.data.enabled`
  to leave piles out") — clears C47. The Argon DOM read in `placeStrip` already has a row
  (`creatures-strip-over-argon`, adjustments.yml:873-882, added by U-6-12); in this batch rename it
  to a package-prefixed id (e.g. `argon-creatures-strip-float`) per D2 so C32 stops failing it, and
  point `files` at `strip.mjs` + `creatures-core.mjs`.

### Step 6 — strip feature + UI (clears C18 fully)

- `strip.mjs` (UI): :184-310 [snap :184-292] verbatim, including `placeStrip`/`dockTimer`
  (:233-248) with `stripDock` from core; `mount()` additionally adds class `pcr-strip` to the `nav` (step 8 needs it; no rule targets
  it before step 8, so this is visually inert).
- `creature-strip.mjs` (feature): hooks :312-320 [snap :294-302] through `reg.on` (same order, labels),
  `scheduleRender`, `ctx.onShowStrip`, `ctx.expose({ list, render: () => { lastSig = null; render(); },
  scheduleRender })`; `uninstall()` removes the strip element, clears `renderTimer` and
  `dockTimer`.
- Entry `creatures.mjs` now: `light.install`, `creatureStrip.install` (→ rows 1-13 of the golden),
  `Hooks.once("init", onInit)` (row 14), `ownerSees.install` (row 15, `reg.once("setup")`),
  `Hooks.once("ready", onReadyStartup)` (row 16), `Hooks.once("ready", onReadyPublish)` (row 17).
  `onReadyPublish` still uses today's deferred block until step 7.
- Tests: all step-1 glue pins unchanged, including the 17-row golden and the one-tick publish.

### Step 7 — API manifest, kit publish (clears C26, C27, C28, C50; **[declared]** -31)

- `api-manifest.mjs` rows (all `legacy: true` except `status`): `list(user?, scene?)`, `render()`,
  `syncScene(scene, ids?)` (`writes:true`, `gm:true`), `syncAll()` (`writes:true`, `gm:true`),
  `isCreature(tokenDoc)`, `ownerSees(token)`, `patchedWith()`; `unlisted: ["core"]`. No row's first
  param is named `ref`, so `bind` leaves the legacy calls untouched. `flags: { writes:
  ["flags.pentaryn-creatures.light"], reads: ["flags.pentaryn-aoe.handle",
  "flags.pentaryn-aoe.handleActor", "flags.item-piles.data.enabled", "flags.dnd5e.originalActor"] }`.
- `api.mjs` impl from `ctx.exposed`; `core: { ...core }` — **a plain copy**: `buildApi` deep-freezes
  the API and `Object.freeze` throws on a module namespace object.
- Entry `onReadyPublish`: `buildApiFor(ctx)` then `publishNamespace("creatures", api, { moduleId:
  MODULE })` — synchronous at ready; delete the `setTimeout(…, 0)` and the guard (:366-380 [snap :343-357]). The kit's
  one-tick re-alias covers the importer freeze until items-journal-1 lands.
- **[declared]** (pin moves, own commit): the API is present **at** `ready` instead of one tick later,
  frozen, with kit members, on `module.api`, and `pentaryn-creatures.ready` fires. No other module
  reads `game.pentaryn.creatures` (repo grep 2026-10-10; `config.py:269` names `syncAll()` in the
  after-sync text only).
- **[declared]** -31 at the API boundary only: `syncScene: (scene, ids) => syncScene(scene, ids ==
  null ? null : toIdSet(ids))` (kit `toIdSet`: arrays, Sets, single ids and documents → a new Set;
  a Set is copied, not passed by identity — `syncScene` only calls `.has`), `ownerSees: t =>
  ownerOverride(t?.object ?? t)`; new row `status()` (`writes:false`) → `{ patchedWith, ownerSees,
  lightRadius, showStrip, floatOverHud, writer: isActiveGM(), lit: countLit(all token flags), version }`. Optional
  `inspect(tokenRef, opts)` (C29 is n/a, but the module does write a token flag): `{ token: refOf,
  qualifies, ourLight: readOurLight, switchedOff, ownerSees }`, depth ≤ 4.
- Tests: `test/hooks.test.mjs` (golden unchanged; every feature exports install/uninstall;
  `uninstall()` leaves no listener), `test/api.test.mjs` (rows ↔ impl; `golden/describe.json`,
  `golden/surface.json` first writes; the patch record carries `adjustments: "creatures-libwrapper"`;
  setting keys ⊆ `SETTINGS`), and the -31 pins move: `syncScene(scene, ["a"])` → count, a bare
  string id works, `ownerSees(tokenDoc)` → same boolean as for its placeable.

### Step 8 — CSS scope (clears C37)

- Selectors `#pentaryn-creatures` → `#pentaryn-creatures.pcr-strip` (and `#pentaryn-creatures X` →
  `#pentaryn-creatures.pcr-strip X`); every child selector already uses `.pcr-*`. Specificity rises by
  one class, so our rules only win more; review against any foreign rule that targeted the strip
  (none known). Visual check in the live smoke.

### Step 9 — docs (clears C44, C45)

README in use-doc §7 order. Keep today's content, re-homed: the three numbered sections → What the player
sees; settings → Settings; Console → API (with -31 shapes and `status()`); Data written (token
`light.*` and `flags.pentaryn-creatures.light` = `{bright, dim}` | `false` | null); Flags other
modules read (aoe handle flags; Item Piles; dnd5e `originalActor`) and the **-28** hand-off note
"Other writers of token.light → pentaryn-senses (`itemLight`/`itemLightPrior`) and transform's Starry
light through senses"; Two sessions (active GM writes lights; every client patches visibility and
draws its own strip); Pitfalls (the orphan light, `// KNOWN:` rows); Tests (`node test/run.mjs`,
`vendor.py check creatures`, `conformance.py --module creatures`). `CHANGELOG.md` from the README's
version notes.

### Step 10 — Wave 7 restart batch (C07, C09, C06w)

`flags.pentaryn` (`tier: "full"`, `namespace: "creatures"`, `flagScope: "pentaryn-creatures"`,
`cssPrefix: "pcr-"`, `generation: 14`, `afterSync` from `config.py:262-271` (the creatures
`ModuleSpec`)), `recommends` gains `{id: "item-piles", type: "module", reason: "Item Piles piles
are left out of the light and the strip."}` and `{id: "enhancedcombathud", type: "module", reason:
"The strip floats above Argon's Combat HUD while it is open (setting floatOverHud)."}`, `styles: ["styles/creatures.css"]` with the file moved. Then add the `NS/CSS/FLAG_SCOPE`
manifest assertions to `core.test.mjs`. One restart for the batch.

## 4. Findings that stay standalone (behaviour fixes after the migration)

Each uses a seam from step 2 and lands as its own **[declared]** commit with a live test:

| Finding | Fix | Seam | Pin that moves |
|---|---|---|---|
| transform-creatures-26 | light queue armed once, never pushed back (`if (!flushTimer) …`, drop `clearTimeout`) | `makeCoalescer` switched to fixed-window mode | 0/50/100/150/190 → one run at 200; a queue at 250 → second run at 450 |
| transform-creatures-25 | strip re-renders on `updateToken` only when `stripMayChange(changes)` | `STRIP_KEYS` | the `{x:5}` row stops scheduling a render |
| transform-creatures-27 | own light writes carry `{pentarynCreatures: true}`; the hook skips them | `shouldQueueLight` | `updateEmbeddedDocuments` gains the options arg; the second no-op pass disappears |
| transform-creatures-40 (new 2026-10-11) | `placeStrip` arms its 500 ms poll only while the strip exists, `floatOverHud` is on and Argon is active; styles written only on change; `floatOverHud` gets an `onChange` | `shouldPollDock`, `dockKey` | the `// KNOWN:` "no Argon, still polls" row: no interval armed |

transform-creatures-21 (Starry light ↔ senses contract) is filed under transform; it touches
creatures only through the shared contract-test harness.

## 5. Declared behaviour changes — live-test handoff

| # | Step | Change | How to see it | Table time |
|---|---|---|---|---|
| C-D1 | 5 | libWrapper-failure text; owner-override failure now warns once | console only | no |
| C-D2 | 7 | API present at `ready` (not +1 tick), frozen, kit members, `module.api`, ready hooks | `game.pentaryn.creatures.describe()` | live smoke |
| C-D3 | 7 | `syncScene` accepts arrays/ids; `ownerSees` accepts a TokenDocument; `status()` | console | live smoke |
| C-D4 | 8 | strip selectors rescoped | strip looks the same, docked and (*live*) floating over the HUD | yes, a glance |
| C-D5 | §4 -26 | summon light appears ≤ 200 ms after the first change during heavy token traffic | summon during combat with flags churning | yes |
| C-D6 | §4 -25 | dragging tokens no longer re-runs the strip | drag a summon; strip still updates on name/img/ownership | yes |
| C-D7 | §4 -27 | no second light pass after our own write | light still correct; console quiet | yes |
| C-D8 | §4 -40 | no strip polling without Argon or with `floatOverHud` off; floating unchanged with Argon | strip still floats over the open HUD and drops back when it closes (U-6-12 retest) | yes, a glance |
| C-L1 | — | open, not a change: the orphan 5/5 light after a senses restore (-28) | Starry Form on a druid with a summon nearby | decision only |

Live smoke after sync: as a player with two owned tokens the strip shows; an Invisible owned token
stays drawn; `game.pentaryn.creatures.status().patchedWith` is `"libWrapper"` or `"direct"`.

## 6. Decisions and risks

- **K1** (kit getter route) is a prerequisite and a kit bump (`vendor.py sync --all` afterwards).
- Risk: settings `onChange` now goes through `ctx` callbacks; a feature that installs after
  `init` would miss nothing (callbacks are read at change time), but test a change of each setting in
  glue.
- Risk: `{ ...core }` must be a copy; a direct namespace reference throws at publish.
- WAIT drift (now committed, U-6-12 in `17275c9`): `placeStrip`'s 500 ms interval is code from the
  live-test workflow; treat its behaviour as already-declared there, characterise it as-is in step 1.
  Its cost is transform-creatures-40 (§4).

## 7. Effort

| Step | Effort |
|---|---|
| 0 re-anchor (drift fold-in) | 1 h |
| 1 characterise (DOM, Token getter, libWrapper stubs, timers) | 4 h |
| 2 core seams | 2 h |
| 3-6 settings, features, patch | 4 h (+ K1 ≈ 1.5 h in the kit) |
| 7 manifest + API | 2 h |
| 8-9 CSS, docs | 1.5 h |
| 10 Wave 7 | batched |
| **Total** | **M, ≈ 2 days** plus checkpoint, K1, adjustments batch, restart item; §4 fixes ≈ 0.5 day more |

## Checkpoint (wave 3, 2026-10-11)

- **Re-anchor (step 0):** `git diff 4e64f47..wave-3-base -- foundry/module/pentaryn-creatures` is
  empty, so every line number in this guide still holds. aoe's `isHandleTarget` is unchanged at
  `pentaryn-aoe/core.mjs:364-368`. `wait.json` is empty (D9). The scorer has grown to 45 fail-class
  rules: at `wave-3-base` it gives **57.8 % (26/45)**, failing C07 C09 C14 C18 C20 C21 C22 C26 C27
  C28 C32 C35 C37 C40 C41 C43 C44 C45 C47 (warn C06w C10).
- **Kit:** `6d36df2` vendors kit 1.0.2 (full + patch, patch-libwrapper, election) and adds the fixed
  `test/run.mjs`. It renames `test/run.mjs` to `test/core-legacy.mjs` with the content unchanged
  (73 checks) and lists it in `LEGACY`.
- **Checkpoint: `6e4c7d7`** (`test(creatures): characterisation checkpoint`). Files:
  `test/{core,glue,glue-player,glue-libwrapper,glue-libwrapper-throws,glue-nogetter,glue-ready-fail,publish}.test.mjs`,
  `test/fixtures/{world,dom,legacy-creatures}.mjs`, and
  `test/golden/{hooks,legacy-surface,strip,senses-handoff}.json`. Step 1's list is covered in full.
  Deviations from step 1:
  - `golden/strip.json` does not pin the nav's own class list, because step 6 adds the inert `pcr-strip` class.
  - The KNOWN -25 render is counted by `showStrip` reads.
  - The interval is counted by `document.querySelector` and `getElementById` calls.
- **Coverage:**
  - Before: core 100 / 97.00 / 100 (line / branch / funcs); `creatures.mjs` was not loaded.
  - After, every file except `publish.test`: `creatures.mjs` 100 / 98.36 / 100 and core 100 / 98.06 / 100.
  - Node does not merge `publish.test`'s `?query` instances into the report. Its frozen-root branch (:378) is still pinned by assertion.
  - Branches left uncovered:
    - `L`'s `format` branch (:19). Nothing calls it with data, and step 3 deletes it.
    - Core :111 and :123. These were already uncovered at baseline.
- **Score after the checkpoint:** 64.4 % (29/45). This clears C14, C20 and C43.
- **Todo pins** (`test.todo`, the target of each KNOWN row):
  - -25 `stripMayChange`
  - -26 fixed window
  - -27 options flag
  - -29 `warnOnce`
  - -31 syncScene array/id
  - -31 ownerSees(TokenDocument)
  - -40 no poll without Argon or with `floatOverHud` off

## Result (wave 3, 2026-10-11)

| | |
|---|---|
| Live score after the migration | **89.6 % (43/48)** at `cb77746` — `conformance.py --module creatures`. Against a snapshot with the integrator's adjustments rows: 93.8 % (45/48); plus the Wave 7 `module.json`: **100 % (48/48)** (both verified with `--snapshot`) |
| Date | 2026-10-11 |
| Commits | characterisation: `6d36df2` (kit) + `6e4c7d7` (checkpoint) · refactor: `fdab0bf` (step 2, -30) · `f3085ab` (3) · `b461208` (4) · `90ea129` (5, structural) · `9c57142` (5, wrapMethod, **[declared] C-D1** text) · `a019151` (6) · `ef2578d` (7, **[declared] C-D2**) · `349ee86` (8, **[declared] C-D4**) · `5489890` (9) · `84d52ee` (10, self-activating manifest pins) · `cb77746` (hot-patch test) · standalone, one pin each: `cdb694e` (-29, C-D1) · `008647a` (-31 syncScene, C-D3) · `54f2d1b` (-31 ownerSees, C-D3) · `a8d5ead` (-31 `status()`, C-D3) · `4b0ebf7` (-26, C-D5) · `2f844f6` (-25, C-D6) · `a6a0d54` (-27, C-D7) · `23fa387` (-40, C-D8) · `61216f3` (`inspect()`, C-D3; C29) |
| Tests | `node test/run.mjs`: 101 pass, 2 skipped (the step-10 manifest pins, until Wave 7), 0 todo; legacy core suite 73/73. `vendor.py check creatures` ✓. `module-check creatures` (parse, imports, i18n, node-test, vendor, conformance) ✓ |
| Declared changes handed to the live-test workflow | C-D1 … C-D8 (§5) plus `inspect()` (C-D3); not yet run |
| `module.json` edits appended to `wave7-restart-batch.md` | no — the creatures row there already holds them; returned to the integrator with the exact `module.json` (`afterSync` = the ModuleSpec tuple verbatim, which the same commit deletes from `config.py`) and the `git mv creatures.css styles/creatures.css` · **done by the wave-3 integrator** (`d83d0b11`): the batch row carries the full edit; `module.json` itself waits for the Wave 7 restart |
| Adjustments rows appended to `adjustments-batch.md` | no — returned to the integrator (rewrite `creatures-libwrapper`; rename `creatures-strip-over-argon` → `argon-creatures-strip-float` pointing at `strip.mjs`; add `itempiles-creatures-pile-flag`). Until they land, `test_the_real_registry_matches_the_code` reports the two creatures rows (their markers left `creatures.mjs`) · **landed by the wave-3 integrator** in `foundry/adjustments.yml` (`f8e50927`), marked in `adjustments-batch.md` (`b631badf`) |
| Still failing, and why | C07, C09, C37 (+ C06w): Wave 7 `module.json`. C32, C47: the adjustments rows above |

**Deviations from the guide.**

- Steps 5 and 7's known-bug halves (-29 warn-once, -31) landed after the structural refactor with
  the other standalone fixes, one [declared] commit per pin, as the wave-3 rule asks; step 5's
  wrapMethod swap is its own [declared] commit (C-D1's text half).
- `overrideFor` (a -29 seam) was not built: building the view object up front would read
  `_testCulled()` and the other private fields for every unseen token, including ones the player
  does not own, on a hot getter. `ownerOverride` keeps its lazy reads and uses core `safely`.
- The missing-getter check runs before libWrapper is tried (it used to run after). Only different
  with lib-wrapper active and no own `isVisible` getter on `Token.prototype`, which v14 never lacks.
- `inspect(ref, { as })` was optional in step 7; C29 now requires it (the manifest declares the
  token flag we write), so it landed as its own [declared] commit. No `selftest()` (not in this
  guide); `status()` is the live smoke's one call.
- `-40`'s floatOverHud test world: glue-player now enables `enhancedcombathud` (the dock only polls
  with Argon enabled); the disabled cases live in the new `test/glue-dock.test.mjs`.
- Light writes now pass `{ pentarynCreatures: true }` (-27), so every recorded write's `argc` pin
  moved 2 → 3 in that commit.

**Live check (gated live phase).** After the sync (reload; the Wave 7 batch needs a restart):

1. `game.pentaryn.creatures.describe().version === "0.1.1"`, `Object.isFrozen(game.pentaryn.creatures)`,
   `game.modules.get("pentaryn-creatures").api === game.pentaryn.creatures` (C-D2).
2. `game.pentaryn.creatures.status()` → `patchedWith` `"libWrapper"` (lib-wrapper is enabled) and
   `writer: true` in the GM tab; `lit` equals the count of summons/familiars with our flag.
3. As a player with two owned tokens: the strip shows, looks the same docked (C-D4); an Invisible
   owned token in the dark stays drawn.
4. Open Argon's Combat HUD: the strip floats above the action bar and drops back when it closes
   (U-6-12 retest); toggle `floatOverHud` off/on: docks/floats at once (C-D8).
5. Drag a summon: the strip does not flicker or rebuild; rename or hide it: the strip updates (C-D6).
6. Summon a creature during combat with flags churning: its light appears within ~200 ms (C-D5);
   the console stays quiet, no second pass (C-D7).
7. `game.pentaryn.creatures.syncScene(canvas.scene, [tokenId])` returns a count;
   `ownerSees(token.document)` matches `ownerSees(token)`; `inspect(token)` is plain JSON (C-D3).
8. C-L1 stays a decision (Open for Joe in the wave-3 report).
