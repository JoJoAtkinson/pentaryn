---
title: Migrating pentaryn-dropbin to the addon blueprint
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, dropbin]
---

# Migrate `pentaryn-dropbin` to the blueprint

**Read this when:** you are about to bring `pentaryn-dropbin` up to the addon blueprint (fix phase of
the 2026-10 audit), or you need to know which audit findings the migration absorbs.
**Not this file:** the general procedure → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 ·
the order across modules → [`migration-order.md`](migration-order.md) · the live score →
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module dropbin --markdown`.

Line numbers are **snapshot** line numbers (`audit-snapshot/pentaryn/module/pentaryn-dropbin/`). On
2026-10-10 the snapshot and `foundry/module/pentaryn-dropbin/` were byte-identical and the module is not
on the WAIT list. Before step 1: `git diff ee505c2 -- foundry/module/pentaryn-dropbin` must be empty, or
re-anchor every reference below.

| | |
|---|---|
| Tier | `full` (world-setting ledger store, socketlib relay, API writes) |
| Score today | **53.7 %** (22/41) |
| Projected after this guide | 100 % of fail-class rules except **C07**, **C09** (Wave 7 `module.json` batch) |
| Steps | 11 (1 characterisation, 7 behaviour-neutral, 1 declared store change, 1 adjustments batch, 1 Wave 7 item) |
| WAIT | **No** — touches no file of combat, transform or aoe |
| Effort | ~3 days (L): five concerns in one entry, three Item Piles touch points, a socket relay, 29 load-time hooks |
| Order | migration-order #12 (after attunement — the `preCreateItem` order between them is pinned there first) |
| Prerequisites | K6 multi-key `serialStore` — **landed** (kit 1.0.1); R8 C29 computed flag writes — **landed** |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module dropbin --markdown`. On the snapshot it moved 53.7 % → 50.0 % (R2 fails C26 on `setTimeout(publishAPI, 0)`; R8 makes C29 apply and fail until step 6's `inspect`) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

---

## 1. Conformance today, item by item

| Rule | Today | Detail | Cleared by |
|---|---|---|---|
| C01 | pass | | — |
| C02 (warn) | **warn** | `minimum: "13"` (`transform-creatures-24`) | step 11 |
| C03, C04, C05, C06 | pass | | — |
| C07 | **fail** | missing tier, namespace, cssPrefix; `flagScope: "dropbin"` | step 11. **Metadata only**: corpse flags are already `flags.pentaryn-dropbin.{corpse,sight,noLoot,lootable}` (`MODULE`), so no data migration |
| C08 | pass | `socket: true` (socketlib needs it) | keep |
| C09 | **fail** | code names Item Piles (corpses, dropbin, loot) | step 11 (`recommends` item-piles, itempilesdnd5e) |
| C10 (warn) | **warn** | `dropbin.mjs` 529/150 | step 5 |
| C11 | pass | `loot-core.mjs` | keep; `dropbin-core.mjs` barrel added in step 2 |
| C12 | **fail** | `MODULE` at dropbin.mjs:63 and loot-core.mjs:6 (and a literal in i18n-shim.mjs:82) | step 2 |
| C13 | pass | | — |
| C14 | **fail** | no kit | step 1 |
| C15 | pass | | keep: named imports (features via `import * as`) |
| C16 | pass | corpses, loot, i18n-shim unclassified "glue" | step 5 makes them features |
| C17 | **fail** | 11 module-scope `Hooks.on/once` calls flagged: corpses.mjs :126, :226–229, :231, :267, :283 and loot.mjs :152, :154, :156 (loop-registered hooks at corpses.mjs :140 ×3, :233 ×3 and loot.mjs:156's five events are not listed by the scorer, but all 21 move) | step 5 |
| C18 | **fail** | no feature files | step 5 |
| C19 | pass | emits nothing | — |
| C20 | **fail** | | step 1 |
| C21 | **fail** | `game.settings.get` :78, :116; `register` :257–258 (and `set` :120, :121, :247) | step 3 |
| C22 | **fail** | no `SETTINGS` | step 3 |
| C23 | pass | | — |
| C24 | **fail** | comment-only catch :391 | step 5 |
| C25 | pass | every line carries `${MODULE} \|` | keep texts byte-identical |
| C26 | pass (**scorer false negative**) | `setTimeout(publishAPI, 0)` at :290 *is* a publish timer; the rule looks for `game.pentaryn` inside the `setTimeout(...)` text and misses a named function | step 6 |
| C27, C28 | **fail** | | step 6 |
| C29 | n/a | scorer: "writes no flags of its own" — it does write `flags.pentaryn-dropbin.corpse/sight` on tokens (corpses.mjs:61–76, :94–102) | step 6 adds `inspect(ref)` anyway (see note) |
| C30 | pass | socketlib, not `CONFIG.queries` | — |
| C31 (manual) | manual | `restore` returns a Notification or an Item; `export`/`clear` return `false` for non-GM | legacy rows; additive `restoreResult` (step 6) |
| C32 | pass | no prototype patches | — |
| C33 | n/a (**scorer false negative**) | loot.mjs:32 reads Item Piles' Svelte internals `app.svelte.appShell.$$.ctx` | step 4 moves it into the adapter; step 10 adds the row |
| C34 | pass | nested | — |
| C35 | **fail** | 20 % definite: `t = k => game.i18n.localize(\`PENTARYN_DROPBIN.lootAll.${k}\`)` (loot.mjs:25) hides 4 of 5 keys | step 7 |
| C36 (warn) | **warn** | hard-coded English :217, :219, :224, :243 (and :229, :236, :244, :386, :389, corpses.mjs:299–300) | step 7 |
| C37, C37w | pass | no CSS file | — |
| C38 | n/a | | step 11 (`cssPrefix: "pd-"`) |
| C39 | pass | | — |
| C40 | **fail** | missing core, glue, hooks, api, i18n tests | steps 1, 6 |
| C41 | **fail** | | step 2 |
| C42 | n/a | | step 1 (synthetic fixtures) |
| C43 | **fail** | `test/run.mjs` is self-running | step 1 (`LEGACY`) |
| C44, C45 | **fail** | | step 9 |
| C46 | pass | routed (`context/foundry/README.md:67`) | — |
| C47 | **fail** | no adjustments row for socketlib | step 10 |
| C48, C49 | pass | (C49: `refreshToken` → `paintEye` does no world iteration; it redraws — `items-journal-30`) | keep |
| C50, C51 | n/a | | steps 3, 6 |
| C52 | pass | | — |

---

## 2. Target layout

```
foundry/module/pentaryn-dropbin/
  module.json                unchanged until step 11
  dropbin.mjs                ENTRY (~90): file map; installs features in today's order; Hooks.once("init") between them
  dropbin-core.mjs           PURE barrel: SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS; re-exports loot-core, ledger-core;
                             pileFlags, isPileFlagged, pinnedEntryIds, needsRedraw, planLockSounds, planEyesNeedView
  loot-core.mjs              PURE (exists): MODULE (the one definition), lootAllState, showEye, eyePlacement
  ledger-core.mjs            PURE: dedupeKey, appendEntry, makeEntry, normaliseDeltas, listLast, findEntry, searchLog,
                             shouldCaptureDelete
  settings.mjs               SETTINGS (log, counter as store rows), readLog, the ledger writes
  piles.mjs                  ADAPTER: game.itempiles (API, hooks, isValidItemPile, ACTOR_CLASS_TYPE, transferEverything,
                             getActorFlagData) and the Svelte store lookup (loot.mjs:30–38)
  socketlib-adapter.mjs      ADAPTER: registerModule/register("record"), executeAsGM
  ledger.mjs                 FEATURE: socketlib.ready, ready (capture + publish), capture hooks, recordAsGM, submit,
                             writeMirror, the ledger API (contribution)
  itempiles.mjs              FEATURE: attunement repair, container locks, directory filters, in-view backfills
  corpses.mjs                FEATURE (exists): install() wraps today's module-scope hooks; API contribution `corpses.*`
  loot.mjs                   FEATURE (exists): install() wraps today's hooks; internal install(app) → addButton(app)
  i18n-shim.mjs              FEATURE (exists): install() → i18nInit; fillMissingKeys stays exported (pure)
  api-manifest.mjs, api.mjs  ledger rows, corpses.*, loot.*, inspect, selftest
  lib/, test/, lang/en.json, README.md, CHANGELOG.md
```

| Old (snapshot lines) | New file | Notes |
|---|---|---|
| dropbin.mjs 1–57 header | README (*What the player sees*, *Patches and adjustments*) + one header per feature naming its adjustments row | |
| 59–61 imports, 72 `installI18nShim()` | entry | |
| 63 `MODULE` | removed; imported from `loot-core.mjs` | `items-journal-26`; C12 |
| 64–68 `LOG`, `COUNTER`, `DIR`, `FILE`, `DEDUPE_MS` | `LOG`/`COUNTER` → settings rows; `DIR`, `FILE`, `DEDUPE_MS` → `ledger-core.mjs` | |
| 70 `socket` | `socketlib-adapter.mjs` | |
| 76–84 `readLog` | `settings.mjs` (try/catch and warn text verbatim) | |
| 87–99 `writeMirror` | `ledger.mjs` | |
| 105–126 `recordAsGM` | `ledger.mjs`; dedupe → `ledger-core` `dedupeKey`/`appendEntry`; writes → `settings.mjs` | step 3 neutral, step 8 serialised |
| 129–134 `submit` | `ledger.mjs` (+ `socketlib-adapter.executeAsGM`) | |
| 138–157 `baseEntry` | `ledger-core` `makeEntry(reason, {actor, item, quantity, user, scene, now})` | |
| 161–199 `registerCapture` | `ledger.mjs` (called from its `ready`; hooks through `reg`); delta normalisation (:169) → `normaliseDeltas`; the :188–193 guards → `shouldCaptureDelete` | |
| 203–252 `buildAPI` | rows in `api-manifest.mjs`; impl in `ledger.mjs` (contribution); `list/get/search` → `listLast/findEntry/searchLog` | |
| 256–259 init | `settings.mjs` `registerSettings()` from the entry's `onInit` | |
| 261–264 socketlib.ready | `ledger.mjs` `install` → `reg.once("socketlib.ready", …)` → adapter | |
| 266–291 publish + ready | `ledger.mjs` ready: `registerCapture(reg)` then `ctx.publish()` (entry-provided) | one ready handler, as today |
| 293–347 attunement repair | `itempiles.mjs` | keep `reg.on("preCreateItem", …)` **after** `await loadAttunementIndex()` inside the async ready |
| 349–418 locks, `ensureLockSounds` | `itempiles.mjs` | |
| 420–451 `ensureEyesNeedView` | `itempiles.mjs` (planner → core) | |
| 453–488 directory filters | `itempiles.mjs`; `isNotePinnedJournal` keeps its loop until `items-journal-24` | |
| 490–528 third ready (locks hooks, repaint, backfills) | `itempiles.mjs` — **one** ready handler, same body order | |
| corpses.mjs 57–58 `API`, `isPile` | `piles.mjs` | |
| corpses.mjs 126–145, 226–233, 267, 283–301 module-scope hooks | `corpses.install(reg, ctx)` in the same order | |
| corpses.mjs 303 `corpses` object | API contribution rows `corpses.{sync,toCorpse,fromCorpse,isDead,revive,paintEye,paintAllEyes,migrateLegacyEyes}` | |
| loot.mjs 25 `t` | literal keys (step 7) | |
| loot.mjs 27 `API`, 30–38 `storeOf` | `piles.mjs` | |
| loot.mjs 82–106 `install(app)` | renamed `addButton(app)`; the API path stays `loot.install` | `install` is the feature contract name now |
| loot.mjs 152–156 hooks, 158 `loot` object | `loot.install(reg, ctx)`; contribution rows `loot.{install,refreshAll,recipientFor}` | |
| i18n-shim.mjs 79–84 `installI18nShim` | `install(reg)` → `reg.once("i18nInit", …)`; console line keeps the literal `pentaryn-dropbin \| Item Piles i18n shim added …` | |

**Hook sequence to keep.** Recorded with the test-kit stub on 2026-10-10 — 29 registrations at
load (the audit's "34/25" was never verified; this is the number):

```
corpses: on:updateActor, on:createActiveEffect, on:deleteActiveEffect, on:updateActiveEffect,
         on:drawToken, on:refreshToken, on:canvasReady, on:updateToken, on:updateActor,
         on:createItem, on:updateItem, on:deleteItem, once:ready, on:renderTokenHUD
loot:    on:renderItemPileInventoryApp, on:item-piles-openInterface, on:updateActor, on:createItem,
         on:updateItem, on:deleteItem, on:updateToken
shim:    once:i18nInit
entry:   once:init
ledger:  once:socketlib.ready, once:ready
itempiles: once:ready, on:renderActorDirectory, on:renderJournalDirectory, once:ready
```

plus, after `ready`: `item-piles-dropItem` (`game.itempiles.hooks.ITEM.DROP`), `preDeleteItem`, then
(after the pack indexes load) `preCreateItem`, `item-piles-preRenderInterface`,
`item-piles-preRenderActorSheet`, `item-piles-preRattleItemPile`. The entry reproduces this by
installing `corpses`, `loot`, `shim`, then `Hooks.once("init", onInit)`, then `ledger`, `itempiles` —
synchronously in the entry body, and **without** an entry-level `ready` (publish runs inside the
ledger's ready, where it is today). The directory hooks stay at load: the sidebar paints before `ready`.

---

## 3. Steps

Gate after each step: `make foundry-dropbin-check`, `node test/run.mjs`, `vendor.py check dropbin`,
`conformance.py --module dropbin`. Steps 2–7 and 9 leave `git diff --stat -- test/golden test/*.test.mjs` empty.

### Step 1 — Characterise (tests and goldens only; checkpoint)

Clears C14, C20, C40 (core/glue/hooks/i18n), C43.

1. `vendor.py sync dropbin --tier full`.
2. `git mv test/run.mjs test/legacy-core.mjs`; fixed `test/run.mjs`, `LEGACY = ["test/legacy-core.mjs"]` (`ok 40 checks`).
3. `test/fixtures/legacy-dropbin.mjs` — verbatim oracles with globals injected: `baseEntry` (:138–157),
   the dedupe test (:107–113), `recordAsGM` as `makeRecorder({read, write, getCounter, setCounter, mirror})`
   (:105–126), `submit` as `makeSubmit({isGM, socket, recordAsGM, warn})` (:129–134), the `list/get/search`
   bodies (:208–213), restore target resolution (:221–223), the `preDeleteItem` guards (:188–193),
   `isNotePinnedJournal` (:478–483), and the two backfill loops (:398–418, :434–451) with recording stubs.
4. `test/core.test.mjs`:
   - `makeEntry` (`items-journal-20`), with `t.mock.timers` at 1000 for the oracle: `('drop', {actor:{id:'a',name:'Ann',uuid:'Actor.a'}, item:{name:'Sword',type:'weapon',system:{quantity:2}}, quantity:undefined, user:{id:'u',name:'U'}, scene:{id:'s',name:'S'}, now:1000})`
     → `JSON.stringify` equals `{t:1000,iso:'1970-01-01T00:00:01.000Z',reason:'drop',userId:'u',userName:'U',fromActorId:'a',fromActorName:'Ann',fromActorUuid:'Actor.a',itemName:'Sword',itemType:'weapon',quantity:2,sceneId:'s',sceneName:'S',x:null,y:null,pileUuid:null,item:<the item>}`;
     item `null` → `itemName '(unnamed)'`, `quantity 1`.
   - `normaliseDeltas(undefined)→[]`, `({item:1})→[{item:1}]`, `([a,b])→[a,b]`; `listLast([{n:1},{n:2},{n:3}],2)→[{n:3},{n:2}]`;
     `findEntry(log,'2')→{n:2}`; `searchLog(log, undefined)` matches item names containing `'undefined'` (`// KNOWN:` quirk of `String(text)`).
   - Recorder (`items-journal-18`): async store whose `set` resolves on `setTimeout 0`. Sequential awaited
     appends → `n` 1, 2, 3; identical entry within 2000 ms → returns the tail `n`, log does not grow; at
     +2001 ms → appended; `await Promise.all([rec(e1), rec(e2)])` (different items) → **both n = 1**
     (`// KNOWN:` bug; record the log length for a copy-on-get and a by-reference store).
   - `shouldCaptureDelete` truth table (`items-journal-27` seam): other user, non-Actor parent, non-character,
     pile → false; else true.
   - `pileFlags`/`isPileFlagged` (`items-journal-23`): `{flags:{'item-piles':{data:{enabled:true,type:'container'}}}}`
     → `{enabled:true,type:'container'}`; `{}`→`null`; `null`→`null`; disabled → `isPileFlagged` false; equals
     `doc.getFlag('item-piles','data')` (stub reading `this.flags`) for 4 shapes.
   - `pinnedEntryIds` (`items-journal-24`): scenes `[{notes:[{entryId:'a'},{entryId:null},{entryId:''}]},{notes:[{entryId:'b'}]},{notes:[]}]`
     → `['a','b']`; membership equals the oracle for `'a','b','c'` (`''` differs — documented, unreachable from rows).
   - `needsRedraw(undefined,40)→true`, `(40,40)→false`, `(40,80)→true` (`items-journal-30`).
   - Planners (`items-journal-25`): container without `lockedSound` → `{_id,'flags.item-piles.data.lockedSound':'sounds/lock.wav','prototypeToken.flags.item-piles.data.lockedSound':'sounds/lock.wav'}`;
     with a sound → excluded; non-container → excluded; pile with prototype sight on → `{'prototypeToken.sight.enabled':false}`;
     scene token pile with sight on and a global Note with an entry → token/note updates; each equals the
     oracle's recorded payloads.
5. `test/glue.test.mjs` — `installFoundry` (GM, active); `game.itempiles = {hooks:{ITEM:{DROP:'item-piles-dropItem'}}, API:{isValidItemPile, ACTOR_CLASS_TYPE:'character', getActorFlagData, transferEverything}}`;
   `globalThis.socketlib = {registerModule: () => ({register, executeAsGM})}`; `FilePicker.implementation.upload` stub;
   empty `game.packs`; import the entry:
   - `utilsSource === "foundry"`; `F.hooks` = the 29 above.
   - `fire("i18nInit")` → `DND5E.ItemRarity*`/`Unknown` filled; console line text pinned.
   - `fire("init")` → `register('pentaryn-dropbin','log',{scope:'world',config:false,type:Array,default:[]})`, same for `counter` (Number, 0).
   - `Hooks.callAll("socketlib.ready")` → `registerModule('pentaryn-dropbin')`, `register('record', fn)`.
   - `fire("ready")` and settle → the nested registrations above, in order; one tick → `Object.keys(game.pentaryn.dropbin)`
     = `['corpses','loot','all','list','get','search','restore','export','clear']`, `corpses`/`loot` keys pinned;
     `console.log('pentaryn-dropbin | ready — 0 entries on the ledger')`.
   - Capture as GM: `Hooks.callAll('item-piles-dropItem', {actor}, pile, [{item, quantity:-2}], {x:1,y:2})` →
     `F.calls`: `settings.set(counter, 1)`, `settings.set(log, [...])`, `upload('data','assets/drop-bin', File, {}, {notify:false})`;
     `console.log('pentaryn-dropbin | #1 drop: Sword from Ann')`. Same drop again within 2 s → no writes.
     As a player → `executeAsGM('record', entry)` once; no socket and not GM → the `entry dropped` warning.
   - `restore` (`items-journal-28` premise): as a player returns **the very object** `ui.notifications.warn` returned;
     missing entry → the `error` return value; success → `createEmbeddedDocuments('Item', [obj], {'pentaryn-dropbin':{restoring:true}})`
     and the info text `Restored Sword to Ann (drop bin #1).`.
   - Locks: `Hooks.call('item-piles-preRenderInterface', lockedContainer)` as a player → `false`, warn `'<name> is locked.'`,
     `AudioHelper.play({src:'sounds/lock.wav', volume:0.8}, true)`; as GM → `true`. `preRattleItemPile` → toast, no sound.
   - Directory: `renderActorDirectory` with rows → pile rows removed for a player, untouched for the GM.
   - GM ready backfills: the exact `actor.update` / `updateEmbeddedDocuments` payloads (one per actor today).
   - Corpses: `renderTokenHUD` on our corpse as GM → two buttons with the pinned tooltips; `paintEye` twice
     with a PIXI stub → `Graphics.clear()` count **2** (`// KNOWN:`, `items-journal-30`).
   - Loot: `renderItemPileInventoryApp` with a footer → a `pd-loot-all` button labelled `Loot all` (timers mocked).
6. `test/hooks.test.mjs` → the load and post-ready sequences. Drop the template's lifecycle-only assertion.
7. `test/i18n.test.mjs` → every literal `PENTARYN_DROPBIN.*` key exists; the template-built `lootAll.${k}`
   keys are proven by enumerating `lootAllState` reasons (`noCharacter`, `empty`) plus `label`, `tip`, `failed`.
8. `GOLDEN_UPDATE=1 node test/run.mjs` on unchanged code; green; **checkpoint** (agent commits).

### Step 2 — Cores (behaviour-neutral)

Absorbs `items-journal-20`, the pure halves of `-23`, `-24`, `-25`, `-30`, and the `MODULE` half of `-26`. Clears C12, C41.

- `ledger-core.mjs` with the oracle bodies; `dropbin-core.mjs` barrel (`export * from "./loot-core.mjs"`,
  `export * from "./ledger-core.mjs"`, the constants, and the piles/planner helpers). `MODULE` stays defined
  **once**, in `loot-core.mjs` (the legacy suite pins `check("module id", MODULE, "pentaryn-dropbin")`);
  dropbin.mjs:63 is deleted and imports it; i18n-shim.mjs:82's literal becomes `${MODULE}` with identical output.
- Glue calls the core where the result is identical: `makeEntry` (one `now` for `t` and `iso` — the only
  difference, sub-millisecond), `normaliseDeltas`, `listLast/findEntry/searchLog`, `shouldCaptureDelete`,
  the planners with **per-actor updates kept** (batching is §4). Raw `pileFlags` is **not** switched in yet (§4, declared).
- `core.test` imports the barrel bare first; `VERSION === module.json.version` (`"0.2.1"`).

### Step 3 — `settings.mjs` (behaviour-neutral)

Clears C21, C22, C51.

- `SETTINGS`: `{key:"log", scope:"world", config:false, type:Array, default:[], store:true, doc}`,
  `{key:"counter", …, type:Number, default:0, store:true, doc}` — store rows need no labels (C51 skips them).
- `readLog()` verbatim (:76–84, warn text pinned); `writeLedger({n, log})` = `await set(COUNTER, n); await set(LOG, log)`
  in today's order; `clearLog()` = `set(LOG, [])` (:247). The counter read (:116) via `setting("counter")`.
- Same awaits, same order: the step-1 `F.calls` pins do not move.

### Step 4 — Adapters (behaviour-neutral)

- `piles.mjs`: `api()`, `dropHook()` (`game.itempiles?.hooks?.ITEM?.DROP`), `isValidItemPile`, `actorClassType()`,
  `transferEverything`, `getActorFlagData`, and `storeOf(app)` (loot.mjs:30–38, the Svelte `$$.ctx` read) —
  every `game.itempiles` touch in corpses.mjs, loot.mjs and dropbin.mjs goes through it.
- `socketlib-adapter.mjs`: `registerRecord(fn)` (:262–263) and `executeAsGM(name, entry)`; `null` before `socketlib.ready`
  exactly as `socket` is today.
- `foundry/adjustments.yml` in the **same change set** (the marker check needs each marker in a listed file):
  `itempiles-corpses` `files` += `piles.mjs` (marker `itempiles`). Schedule this step for the window when the file is idle.

### Step 5 — Features and entry wiring (behaviour-neutral)

Absorbs `items-journal-22`. Clears C17, C18, C24, C10.

- `ledger.mjs`, `itempiles.mjs` carved out of dropbin.mjs verbatim per §2; `corpses.mjs`, `loot.mjs`,
  `i18n-shim.mjs` move their module-scope `Hooks.on/once` into `install(reg, ctx)` (same order, `reg.on/once`),
  each exports `uninstall()` (corpses: clear `pending` timers; loot: clear `live`, `queued`; ledger: `socket = null`).
- loot.mjs's internal `install(app)` → `addButton(app)` (API path `loot.install` maps to it in step 6).
- `ledger`'s ready: `registerCapture(reg)` then `ctx.publish()` — in this step `ctx.publish` still defers with
  `setTimeout(…, 0)` and the old guard, so the publish pin does not move (step 6 changes it).
- `itempiles`'s attunement repair keeps `reg.on("preCreateItem", repairAttunement)` **after** the `await` in its
  async ready (cross-module order with attunement's load-time `preCreateItem`, `items-journal-29`). Its third
  ready keeps one handler: register the three `item-piles-*` hooks, repaint, `await ensureLockSounds()`,
  `await ensureEyesNeedView()`.
- `reg.guard` is pass-through, so the lock hooks' `return false` still vetoes (glue pin).
- C24: :391 `catch (err) { /* off-screen … */ }` → `catch (err) { ctx.log.debug("announceLocked: no canvas", err); }` (silent unless debug).
- Entry: install order of §2; `golden/hooks.json` must not change.

### Step 6 — API through the manifest; publish via the kit (D2)

Absorbs `items-journal-28` (additive parts). Clears C26 (really), C27, C28, C40 (api), C50.

- Manifest rows (namespace `dropbin`, `flagScope: "pentaryn-dropbin"`, `flags.writes:["flags.pentaryn-dropbin.corpse","flags.pentaryn-dropbin.sight"]`,
  `flags.reads:["flags.item-piles.data"]`):
  `all()`, `list(n=20, {brief})`, `get(n)`, `search(text)` (reads); `restore(n, target)` (`gm:true`, `writes`, `legacy:true`,
  returns `"Item|Notification"`, params `resolve:false` — today's `target` resolution, :221–223, stays verbatim);
  `export()`, `clear()` (`gm:true`, `writes`, `legacy:true`, `false` for non-GM; `clear` keeps the counter — say so in `doc`);
  contributed `corpses.*` (8) and `loot.install|refreshAll|recipientFor`; new `restoreResult(n, target)` →
  `{ok:true,item}` / `{ok:false, reason:'not-gm'|'no-entry'|'no-actor'}` without toasts (restore stays a wrapper that
  toasts and returns exactly today's values); new `inspect(ref)` → `{corpse, noLoot, pile: pileFlags(token)}` for a token's
  actor (C29 is n/a in the scorer, but the module writes token flags); `selftest`.
- `list(n, {brief:true})` maps entries to `{n,iso,reason,itemName,itemType,quantity,fromActorName,sceneName,pileUuid}`
  (`briefOf` in ledger-core; key order pinned); `brief:false` is the default and unchanged.
- `ctx.publish` = `buildApiFor(ctx)` then `publishNamespace("dropbin", api, {moduleId: MODULE})` synchronously,
  inside the ledger's ready, followed by the `ready — N entries` log line. The publish pin changes only as D2
  allows (API at `ready` not a tick later; frozen; `module.api`); commit `[declared] publish via kit (D2)`.
  socketlib is checked lazily (`executeAsGM` returns `null`-path when absent) — publish does not wait for it.

### Step 7 — i18n (rendered text identical; reload)

Absorbs `items-journal-26` (strings). Clears C35, C36.

- loot.mjs: `t(s.reason)` → a literal map `{noCharacter:"PENTARYN_DROPBIN.lootAll.noCharacter", empty:"PENTARYN_DROPBIN.lootAll.empty"}`;
  `t("label")`, `t("failed")` → literal keys through `_loc` (same `game.i18n.localize` underneath).
- New keys, exact current English: `restore.gmOnly` (:217), `restore.noEntry` (:219, `{n}`), `restore.noActor` (:224),
  `restore.restored` (:229, `{item}`, `{actor}`, `{n}`), `export.ok` (:236, `{path}`), `export.failed`,
  `clear.title`, `clear.body` (:243–244, HTML kept as authored), `lock.toast` (:386, `{name}` with the `"It"` fallback
  kept in code), `lock.float` (:389), `corpse.revive`, `corpse.sheet` (corpses.mjs:299–300).
- Test first: for each, `_loc(key, data)` with `lang/en.json` loaded equals today's literal for a fixture
  (e.g. `'Restored Sword to Ann (drop bin #3).'`). Every call passes every placeholder (Foundry renders a
  missing one as `undefined`).

### Step 8 — The ledger store, serialised (**declared**)

Absorbs `items-journal-18`; the blueprint idiom "world-setting log stores → `serialStore`".

- One `foundry.utils.Semaphore(1)` for both keys: `settings.mjs` exports `appendLedger(entry, dedupeMs)`, which
  queues one task: read counter and log, `appendEntry(log, counter, entry, dedupeMs)` (pure), write counter
  then log (today's order), resolve `n`; `recordAsGM` awaits it, then `writeMirror`. Any GM may write
  (`isGM`, as today and `serialStore`'s `anyGM` default). A failed write rejects that caller only; later appends still run.
- Flip the step-1 `// KNOWN:` row in this commit (`[declared] dropbin ledger appends are serialised`):
  `Promise.all([rec(e1), rec(e2)])` → 2 entries, `n` 1 and 2 in submission order. Sequential, dedupe and
  +2001 ms rows unchanged.

### Step 9 — Docs

Absorbs the README part of `items-journal-29` and `-28` (4). Clears C44, C45.

- README in use-doc §7 order. *Patches and adjustments* gains **"Item Piles touch points"**: drop capture hook,
  `preDeleteItem` API checks, attunement NaN repair, container locks (three `item-piles-pre*` hooks), directory
  hiding, the Svelte store read in loot.mjs, corpse piles; plus the cross-module note that attunement's
  `preCreateItem` runs before dropbin's repair. *API*: `clear()` keeps the counter — numbers are never reused.
  *Two sessions / who writes*: players relay through socketlib to a GM; the corpse runner is the active GM.
- `CHANGELOG.md` (0.2.1 and earlier from git history).

### Step 10 — `foundry/adjustments.yml` rows (metadata, batched)

Absorbs `items-journal-29` (dropbin rows). Clears C47, closes the C33 blind spot by hand.

New rows (ids prefixed `dropbin-`; fields per the file header; `check: make foundry-dropbin-check`):
`dropbin-socketlib-relay` (packages `[socketlib]`, files `[socketlib-adapter.mjs]`, markers `["registerModule", "executeAsGM"]`),
`dropbin-itempiles-nan-attunement` (markers `["ATTUNEMENT_PACKS", "repairAttunement"]`, `native_when: "Item Piles addItems preserves system.attunement"`, `retire_class: guarded`),
`dropbin-itempiles-container-locks` (markers `["item-piles-preRenderInterface", "item-piles-preRenderActorSheet"]`),
`dropbin-itempiles-directory-hiding` (marker `renderActorDirectory`),
`dropbin-itempiles-svelte-store` (files `[piles.mjs]`, marker `appShell`, `retire_class: never`, manual check
"open a pile, Change recipient, Loot all goes to the new recipient"). Keep `itempiles-corpses` and
`itempiles-rarity-i18n` (their `files` updated in step 4). Check the schema fields against existing rows;
run the updater tests in the live tree.

### Step 11 — Wave 7 `module.json` batch item (restart)

- `flags.pentaryn = {flagScope:"pentaryn-dropbin", generation:14, tier:"full", namespace:"dropbin", cssPrefix:"pd-", afterSync:[…]}`
  (`pd-` is already the prefix of `pd-loot-all`, `pd-corpse-*`, `pdLootEye`).
- `relationships.recommends`: `item-piles` (reason: drop capture, corpse piles, Loot all, container locks),
  `itempilesdnd5e` (reason: the rarity i18n shim). `requires: socketlib` stays.
- `compatibility.minimum: "14"`.

---

## 4. Findings that stay standalone

| Finding | Kind | Notes |
|---|---|---|
| `items-journal-19` | **declared** performance | coalesce appends queued during a write into one counter + one log write; trailing ~2 s debounce of `writeMirror` (`export()` still writes at once); ready log adds size. After step 8. Test: 5 entries in one tick → final store equals 5 sequential appends, `n` 1..5, ≤2 writes each; mirror once after the debounce |
| `items-journal-21` | **declared** failure path | `submit` catches a rejected `executeAsGM` → `console.warn('pentaryn-dropbin \| ledger entry not recorded (no GM?)', {reason,item,actor}, err)`, resolves `null`; corpses.mjs:134 `.catch(err => console.warn(\`${MODULE} \| revive: could not clear Dead on ${t.name}\`, err))`. Tests per the finding (`makeSubmit` cases) |
| `items-journal-23` | **declared** hardening | switch :376, :402, :411, :470 (and :436) from `getFlag('item-piles', …)` to `pileFlags` — no throw when Item Piles is inactive; identical when active |
| `items-journal-24` | performance | `renderJournalDirectory` builds `pinnedEntryIds(game.scenes)` once per render |
| `items-journal-25` | **declared** | backfills gated on `game.users.activeGM?.isSelf` (corpses' idiom) and batched with `Actor.implementation.updateDocuments`; log lines and counts identical. A non-active GM tab no longer backfills |
| `items-journal-27` | **declared** (trivial) | delete the dead `restoring` guard (:193) and option (:228); a `sourceScan` test that `restoring` appears nowhere else |
| `items-journal-30` | performance + **declared** (minor) | cache the drawn eye size (`needsRedraw`); `queue()` returns early when not the GM runner. The step-1 `clear()` count row flips 2 → 1 |

## 5. Declared behaviour changes — live test

| # | Change | How to see it |
|---|---|---|
| D-D1 | API published at `ready` (not a tick later), frozen, `module.api` (step 6) | `game.pentaryn.dropbin.list(5)`; `describe().version === "0.2.1"`; `restore(n)` on a test item |
| D-D2 | Serialised ledger (step 8) | as a player, drop three different items onto the canvas in quick succession (one Item Piles drop of several items): three ledger entries numbered consecutively, no repeat |
| D-D3 | (standalone) `-19`, `-21`, `-23`, `-25`, `-27`, `-30` | `-19`: `assets/drop-bin/drop-log.json` updates ~2 s after a drop; `-21`: drop as a player with no GM online → console warning, no "Uncaught (in promise)"; `-25`: two GM tabs, only the active one logs the backfill; `-30`: corpse eye still shows/hides while looting and moving |
| — | Strings (step 7) | open a locked chest as a player (toast + floating "Locked"), restore/export/clear as GM, corpse HUD tooltips: identical text |

## 6. WAIT

No. Dropbin touches no file of combat, transform or aoe. Its cross-module couplings are attunement
(`preCreateItem` order — migrate attunement first) and Item Piles.

## 7. Effort

Step 1 ~1 day (29 + 6 hooks, socketlib, Item Piles and PIXI stubs), steps 2–7 ~1.25 days, step 8 ~0.25 day,
steps 9–11 ~0.5 day. **~3 days.**

## 8. Blueprint gaps found while planning

- **C26 misses a named publish function** (`setTimeout(publishAPI, 0)`): it only matches when
  `game.pentaryn` appears inside the call text.
- **C33 misses Svelte internals** (`$$.ctx`) — add `\$\$\.ctx` to its private-access patterns.
- **C29 says "writes no flags of its own"** although corpses.mjs writes `flags.pentaryn-dropbin.*` on tokens
  through computed keys (`[\`flags.${MODULE}.-=corpse\`]`, `flags: {[MODULE]: …}`); the scorer's flag-write
  detection does not resolve `${MODULE}`.
- **`serialStore` is one key**; a counter + log pair needs one shared semaphore around both writes (step 8).
  A two-key form (`serialStore(MODULE, [COUNTER, LOG])`) would make this idiom reusable (pings' log has the same shape).

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | not migrated yet — **60.9 % (28/46)** today (wave start in [`wave-1-baseline.md`](wave-1-baseline.md)), `conformance.py --module dropbin --markdown`, 2026-10-11 |
| Date | 2026-10-11 (wave 1: checkpoint only (wave 1 Stage 0 lane); the refactor is workflow 2) |
| Commits (Joe-approved) | characterisation: `6c33e7a` (kit), `4b53345` (checkpoint) · refactor: none yet · other: `ed02570` PT3-1 fix (below) |
| Declared changes handed to the live-test workflow | none |
| `module.json` edits appended to `wave7-restart-batch.md` | no (step not reached) |
| Adjustments rows appended to `adjustments-batch.md` | no (step not reached) |
| Still failing, and why | C07 C09 C12 C17 C18 C21 C22 C24 C26 C27 C28 C29 C35 C40 C41 C44 C45 C47 — the guide's steps 2+ have not run. Frozen tests: the checkpoint's assertions and goldens are untouched since the checkpoint (see wave-1-report §Frozen tests). |
| Fixed outside the migration | **PT3-1** (play test, [`wave-1-playtest.md`](wave-1-playtest.md)) fixed on `fix/playtest-2026-10-11`, `ed02570`, 0.2.1 → 0.2.2: a revived corpse kept `delta.ownership {default: OBSERVER}` (the recursive `{}` write in `fromCorpse` was a no-op), so players could open the enemy's sheet. `toCorpse` now saves the delta's own map in a new token flag `flags.pentaryn-dropbin.ownership` (usually `null`) and `fromCorpse` writes it back (`null` for none or a pre-fix corpse), then unsets the flag. For step 5/6: the flag joins `corpse`/`sight` in *Data written* and `inspect(ref)`; the tests are in `test/corpses.test.mjs` (new; the checkpoint's tests and goldens unchanged) and drive `corpses.toCorpse/fromCorpse/revive`, which stay API contribution rows. D-D1's `describe().version` is now `0.2.2`. |
