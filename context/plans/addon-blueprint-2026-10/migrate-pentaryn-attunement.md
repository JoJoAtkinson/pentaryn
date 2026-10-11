---
title: Migrating pentaryn-attunement to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, attunement]
---

# Migrate `pentaryn-attunement` to the blueprint

**Read this when:** you are about to bring `pentaryn-attunement` up to the addon blueprint (fix
phase of the 2026-10 audit), or you need to know which audit findings the migration absorbs.
**Not this file:** the general procedure → [`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 ·
the order across modules → [`migration-order.md`](migration-order.md) · the live score →
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module attunement --markdown`.

> **Re-anchored to 4e64f47 on 2026-10-11.** Line numbers below are now HEAD lines. The usability
> re-run (17275c9, ledger U-8-5, module 0.2.0 → 0.2.1) added one thing: `guardItemTooltipPosition`
> (`attunement.mjs:886–896`), a ready-time wrap of dnd5e's `Tooltips5e#_positionItemTooltip`, called
> first in the ready tick (:867), with adjustments row `dnd5e-item-tooltip-anchor` and a README
> paragraph (README :166–172). Everything above `attunement.mjs:866` kept its snapshot line; the
> ready/render/item-hook/export block moved from 862–900 to 862–921. No step was resolved or made
> obsolete by the re-run; the guard gets a home in steps 1, 3, 5 and 7 and a standalone finding
> (`items-journal-39`). Hook sequence unchanged.

Line numbers were originally **snapshot** line numbers (`audit-snapshot/pentaryn/module/pentaryn-attunement/`);
since the re-anchor they are 4e64f47 lines. The module is not on the WAIT list. Before step 1:
`git diff 4e64f47 -- foundry/module/pentaryn-attunement` must be empty, or re-anchor every reference below.

| | |
|---|---|
| Tier | `full` (writes actor/item flags; API writes `stash`, `releaseAway`) |
| Score today | **56.4 %** (22/39) — re-scored on the live folder at 4e64f47, 2026-10-11 (`conformance.py --module attunement`): same 17 fails (C04, C07, C09, C11, C14, C18, C20, C26–C29, C37, C40, C41, C43–C45), warns C02, C06w, C10; manual C31 |
| Projected after this guide | 100 % of fail-class rules except **C07** and **C04** (both need the Wave 7 `module.json` restart batch) |
| Steps | 9 (1 characterisation, 6 behaviour-neutral, 1 declared i18n switch, 1 Wave 7 item) |
| WAIT | **No** — touches no file of combat, transform or aoe |
| Effort | ~1.5–2 days (M) |
| Order | migration-order #7; after the importer keystone (its publish then needs no re-alias tick) |
| Prerequisites | none beyond kit 1.0.1 (landed) — re-vendor with `vendor.py sync <short>` if the lock says 1.0.0 |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). Re-scored after the R-fixes on the live folder at 4e64f47 (2026-10-11): no status changed; only C10's line count moved (922/150). |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

---

## 1. Conformance today, item by item

| Rule | Today | Detail | Cleared by |
|---|---|---|---|
| C01 | pass | | — |
| C02 (warn) | **warn** | `minimum: "13"` (`transform-creatures-24`) | step 9 |
| C03 | pass | dnd5e declared | — |
| C04 languages | **fail** | `t()` reads inline `STRINGS` (:834–854); no `languages` | step 9 (lang file + `languages`) then step 8 (`_loc`, **declared**) |
| C05 | pass | | keep |
| C06 | pass; C06w **warn** | `attunement.css` at the root | step 9 (`styles/attunement.css`) |
| C07 | **fail** | missing tier, namespace, cssPrefix; `flagScope: "attunement"` | step 9. **Metadata only**: the code already writes every flag under `pentaryn-attunement` (`MODULE`, :81, used by every `getFlag`/`setFlag`), so this is *not* a data migration, whatever the scorer's note says |
| C08 | pass | | — |
| C09 | **fail** | code names Item Piles (:216, :244), `relationships` do not | step 9 (`recommends` item-piles with `reason`) |
| C10 (warn) | **warn** | `attunement.mjs` 922/150 (901 at the snapshot; +21 U-8-5 guard) | steps 2–4 |
| C11 | **fail** | no core | step 2 |
| C12 | pass | `MODULE` once | keep (it moves to the core) |
| C13 | pass | | — |
| C14 | **fail** | no kit | step 1 |
| C15, C16, C17 | pass | | keep: named imports; hooks only through `reg` in features |
| C18 | **fail** | no feature files | step 4 |
| C19 | pass | emits nothing | — |
| C20 | **fail** | | step 1 |
| C21 | pass; C22 n/a | no settings | — |
| C23, C24, C25 | pass | every console line already carries `${MODULE} \|` | keep: do **not** turn `console.log` into `log.info` (that changes the level — console.info) |
| C26 | **fail** | `setTimeout(…, 0)` around publish (:866) | step 5 |
| C27, C28 | **fail** | | step 5 |
| C29 | **fail** | writes flags, no `inspect(ref)` | step 5 (new read) |
| C30 | pass | no queries | — |
| C31 (manual) | manual | `stash` returns a count, `releaseAway` returns `setFlag`'s promise; both legacy, documented | step 5 |
| C32, C33 | pass, n/a | **Blind spot since U-8-5:** `guardItemTooltipPosition` (:886–896) replaces dnd5e's private `Tooltips5e#_positionItemTooltip` through a local `proto` (`proto._positionItemTooltip = guarded`, :895), which C32's literal `.prototype.x =` regex does not see, and `_positionItemTooltip` is not in `privateInternalPatterns`, so C33 does not list it. Row `dnd5e-item-tooltip-anchor` (adjustments.yml:906) covers it today. `patchProficiencyMap` mutates a CONFIG map (row `dnd5e-armor-proficiencies`) | step 3 (`wrapMethod` + row `files` move); `items-journal-39` |
| C34, C35 | n/a | no lang file yet | step 9 + 8 |
| C36 | pass | | — |
| C37 | **fail** | `.pentaryn-over-cap` (:154, :159) and `.pentaryn-away-tip` (:187–188) are not under `.pentaryn-attunement` | step 6 |
| C37w, C38 | pass, n/a | | step 9 sets the prefix |
| C39 | pass | node-test wired | — |
| C40 | **fail** | missing core, glue, hooks, api, i18n tests | steps 1, 5 |
| C41 | **fail** | | step 2 |
| C42 | n/a | | step 1 (synthetic fixtures only) |
| C43 | **fail** | `test/run.mjs` is a self-running suite | step 1 (moved to `LEGACY`) |
| C44, C45 | **fail** | README order; no CHANGELOG | step 7 |
| C46 | pass | routed (`context/foundry/README.md:66`) | — |
| C47 | pass | rows `itempiles-attunement-repair`, `dnd5e-armor-proficiencies`, `dnd5e-item-tooltip-anchor` (U-8-5) | update their `files` in step 3 (see §2) |
| C48, C49 | pass | | keep: no reserved names |
| C50 | n/a | | step 5 |
| C51 | n/a | no settings | — |
| C52 | pass | | — |

---

## 2. Target layout

```
foundry/module/pentaryn-attunement/
  module.json                  unchanged until the Wave 7 batch (step 9)
  attunement.mjs               ENTRY (~70): file map, Hooks.once("init"), Hooks.once("ready"), install(sheet, bonds)
  attunement-core.mjs          PURE: constants, awayOf, computeSlots, homeSlots, trimSlots, planStash,
                               bondChanges, wouldExceed, patchProficiencyMap, STRINGS/t (until step 8)
  actor-adapter.mjs            ADAPTER: isPileActor (Item Piles), writeSlots, releaseAway, applyProficiencies (CONFIG.DND5E),
                               guardItemTooltipPosition (dnd5e Tooltips5e wrap, U-8-5)
  strip.mjs                    UI: applyTooltip, buildSlot, buildAwaySlot, buildStrip, decorateCounter, mountStrip
  sheet.mjs                    FEATURE: renderBaseActorSheet; slot interaction (attune, unattune, release dialog, drop)
  bonds.mjs                    FEATURE: preUpdateItem, preCreateItem, createItem; stash (contributed API row)
  api-manifest.mjs, api.mjs    report (legacy), computeSlots, away, releaseAway, inspect, selftest
  lib/, test/, lang/en.json (step 9), styles/attunement.css (step 9), README.md, CHANGELOG.md
```

| Old (4e64f47 lines; = snapshot above :866) | New file | Notes |
|---|---|---|
| 1–79 header | README *What the player sees* / *Data written*; entry keeps a file map | design prose leaves the code |
| 81–85 `MODULE`, `SLOTS`, `AWAY_FLAG`, `BOND`, `AWAY` | `attunement-core.mjs` | + `SHORT`, `NS="attunement"`, `VERSION="0.2.1"` (0.2.0 at the snapshot), `CONTRACT="pentaryn-attunement/api@1"`, `I18N`, `CSS`, `HOOKS={}` |
| 86–121 bond doc + `awayOf` | `attunement-core.mjs` | `awayOf` calls `actor.getFlag` on its argument — duck-typed, no global, C11-clean |
| 122–192 `stash` | core `planStash(owner, itemIds, {tag, currency, randomID, setProperty})` ← :135–185 (returns `{creates, away, slots}`); glue `stash` (writes :186–191) → `bonds.mjs` | `items-journal-10` extraction (the count check is separate, §4) |
| 194–202 `releaseAway` | `actor-adapter.mjs` | shared by `sheet.mjs` (release dialog) and the API; features may not import each other |
| 204–230 `restoreBond` | core `bondChanges(bond, {actorId, awayKeys, fallbackName})` ← :218–227; glue keeps guards → `bonds.mjs` | `items-journal-9`; `game.itempiles…isValidItemPile` (:216, :244) → `isPileActor` in the adapter |
| 232–267 `onCreateItemBond` | `bonds.mjs` | keeps the `flags.pentaryn-attunement.-=bond` write byte-identical (the `_del` swap is separate, §4) |
| 269–343 `computeSlots`, `homeSlots` | `attunement-core.mjs` | verbatim |
| 345–355 `writeSlots` | adapter `writeSlots`; trailing-null trim (:352–353) → core `trimSlots` | |
| 357–536 rendering | `strip.mjs` | `decorateCounter` included |
| 538–626 `attuneToSlot`, `unattune`, `confirmRelease`, `onDrop` | `sheet.mjs` | |
| 628–680 `activate` | `sheet.mjs` | binds the DOM listeners |
| 682–707 `injectStrip` | DOM part → `strip.mjs` `mountStrip(app, root, editable)`; `activate` call stays in `sheet.mjs` | |
| 709–741 enforcement | `warnOverCap`, `onPreUpdateItem`, `onPreCreateItem` → `bonds.mjs`; threshold → core `wouldExceed({value, max, awayCount})` | `items-journal-12` |
| 743–778 `report` | `api.mjs` | legacy row |
| 780–827 `patchProficiencyMap` + doc | core (pure, already exported); the `CONFIG.DND5E` call (:857–858) → adapter `applyProficiencies({log})` | the console line `pentaryn-attunement \| proficiency applies to all: …` stays `console.log` |
| 829–854 `STRINGS`, `t` | core until step 8; `lang/en.json` in step 9 | |
| 856–860 init | entry `onInit` → `applyProficiencies` | |
| 862–876 ready + guard (snapshot 862–875; :867 now calls `guardItemTooltipPosition()` first) | entry `onReady` → `applyTooltipGuard` (in try/catch), then `buildApiFor`, `publishNamespace("attunement", api, {moduleId: MODULE})` | step 5 |
| 878–896 `guardItemTooltipPosition` + doc (new, U-8-5) | `actor-adapter.mjs`, through the kit's `wrapMethod` (`adjustments: "dnd5e-item-tooltip-anchor"`); the skip test → core `tooltipAnchorMissing({element, tooltip})` | step 3; `items-journal-39` |
| 898–911 render hook (snapshot 877–890) | `sheet.mjs` `install`: `reg.on("renderBaseActorSheet", …)` keeping the inner try/catch and its `console.error` text | |
| 913–916 item hooks (snapshot 892–895) | `bonds.mjs` `install` | |
| 918–921 export line (snapshot 897–900) | entry re-exports `computeSlots, homeSlots, patchProficiencyMap` from the core **until** the legacy suite is converted (step 2b) | |

**Hook sequence to keep** (recorded with the test-kit stub on 2026-10-10; `golden/hooks.json`):
`once:init, once:ready, on:renderBaseActorSheet, on:preUpdateItem, on:preCreateItem, on:createItem`.
The entry registers `init` and `ready` first, then installs `sheet` then `bonds` synchronously in the
entry body (use-doc §6, migrating modules). Moving installs to `setup` would put attunement's
`preCreateItem` after modules that load later — dropbin's attunement repair depends on attunement's
listener running first (see `items-journal-29`), so that is a declared change and not part of this plan.

---

## 3. Steps

Gate after each step: `make foundry-attunement-check`, `node test/run.mjs` (module folder),
`vendor.py check attunement`, `conformance.py --module attunement`. Steps 2–7 leave
`git diff --stat -- test/golden test/*.test.mjs` empty.

### Step 1 — Characterise (tests and goldens only; checkpoint)

Clears C14, C20, C40 (core/glue/hooks/i18n), C43.

1. `vendor.py sync attunement --tier full`.
2. `git mv test/run.mjs test/legacy-slots.mjs` (it still imports `../attunement.mjs` with a `Hooks`
   stub); new `test/run.mjs` = fixed body with `LEGACY = ["test/legacy-slots.mjs"]`. It must still
   print `✓ 35 fixtures passed`.
3. `test/fixtures/legacy-attunement.mjs` — verbatim oracles: `awayOf` (:118–121), the bond decision
   (:218–227 wrapped as a function of `(bond, actorId, awayKeys, fallbackName)` returning `changes`),
   the stash planning loop (:135–185 with `randomID`/`setProperty` injected), the over-cap test
   (:721–723 as `({value,max,awayCount}) => …`), `t` + `STRINGS` (:834–854), the tooltip skip test
   (:891 as `({element, tooltip}) => !element || !tooltip`).
4. `test/core.test.mjs`, one table per function run against the oracle now and the core from step 2:
   - `awayOf({getFlag:()=>[{key:'k'},null,'x',{name:'n'}]})` → `[{key:'k'}]`; `awayOf({getFlag:()=>'corrupt'})` → `[]`;
     `awayOf(undefined)` → `[]`; `awayOf({})` → `[]` (`items-journal-8`).
   - bond decision with `B={actor:'A',key:'k',name:'Cloak',equipped:true,attuned:true,attunement:'required'}`
     (`items-journal-9`): (1) `actorId:'A', awayKeys:['k']` → `{name:'Cloak','system.attunement':'required','system.attuned':true,'system.equipped':true}`;
     (2) `awayKeys:[]` → `{name:'Cloak','system.attunement':'required','system.equipped':true}`;
     (3) `actorId:'Z'` → `{name:'Cloak'}`; (4) `{...B,name:undefined}`, `'Z'`, fallback `'Cloak (Talo)'` →
     `{name:'Cloak (Talo)'}`; (5) `{...B,attunement:null,equipped:false}` home → `{name:'Cloak','system.attuned':true}`;
     (6) `null` bond → `null`. Compare with `JSON.stringify` (key order is pinned).
   - over-cap (`items-journal-12`): `{value:2,max:3,awayCount:0}` → `{exceed:false,after:3}`;
     `{3,3,0}` → `{exceed:true,after:4}`; `{2,3,1}` → `{exceed:true,after:4}`; `{0,0,0}` → `{exceed:true,after:1}`.
     Divergence row (`// KNOWN:`, recorded not fixed): actor with `system.attributes.attunement {value:1,max:3}`
     and two prepared-attuned items → `computeSlots(...).value === 2` while the warning's input is 1.
   - stash planning (`items-journal-10`): counter `randomID` (`'r1','r2',…`); owner
     `{name:'Talo Vesk', id:'A', system:{currency:{gp:5,sp:0}}, items:<Map subclass with get/has/filter>, getFlag:(m,k)=>k==='slots'?['c']:[]}`
     holding Cloak `{id:'c', name:'Cloak', img:'i', type:'equipment', system:{attuned:true}, _source:{name:'Cloak',system:{attuned:true,equipped:true,attunement:'required'}}, toObject(){…container:'x',quantity:1}}`
     and two loot Torches (qty 2 and 3). Assert `creates[0].name === 'Cloak (Talo)'`, `system.attuned/equipped` false,
     `system.container` undefined, `flags['pentaryn-attunement'].bond` deep-equals
     `{actor:'A',key:'r1',name:'Cloak',equipped:true,attuned:true,attunement:'required'}`, torches merged
     to one create with quantity 5, `slots` deep-equals `['away:r1',null,null]`, `away` deep-equals
     `[{key:'r1',name:'Cloak',img:'i'}]`; with `currency:true` the last create is `'Coin Purse (Talo)'` with `bond.currency {gp:5}`.
   - `t` (`items-journal-14`): `t('OverBy',{n:2})` → `'2 over the limit'`;
     `t('WouldExceed',{actor:'A',max:3,name:'N',value:4})` → `'A is already attuned to 3 items — attuning N makes 4.'`;
     `t('Missing')` → `'Missing'`; `t('OverBy',{})` → `'{n} over the limit'`.
   - `computeSlots` idempotence per legacy fixture actor (`items-journal-13` seam):
     `computeSlots(a)` deep-equals `computeSlots(a)`.
5. `test/glue.test.mjs` — `installFoundry` with a GM user, `CONFIG.DND5E = {armorProficienciesMap:{natural:…}}`,
   an `Actor` class stub so `instanceof Actor` works, then import the entry:
   - `utilsSource === "foundry"`.
   - `fire("init")` → map gains exactly `wondrous, ring, rod, wand, trinket`; one `console.log`
     `'pentaryn-attunement | proficiency applies to all: wondrous, ring, rod, wand, trinket'`.
   - `fire("ready")` then one tick → `Object.keys(game.pentaryn.attunement)` is
     `['report','computeSlots','stash','releaseAway','away']`; one `console.log('pentaryn-attunement | ready')`.
   - Tooltip guard (U-8-5, `items-journal-39`): with `game.dnd5e.tooltips` an instance of a stub class
     whose `_positionItemTooltip` records calls, after the ready tick the prototype method carries
     `pentarynGuarded === true`; it passes through (args and return) when `game.tooltip.element` and
     `this.tooltip` are set, returns `undefined` without calling the original when either is null, and
     a second install keeps the same reference. With `game.dnd5e` undefined the tick still publishes.
   - `Hooks.call("preUpdateItem", item, {system:{attuned:true}})` on an actor at cap → one
     `ui.notifications.warn` with the `WouldExceed` text pinned; returns `true` (never vetoes).
   - `preCreateItem` with a bonded item on the bonded actor → `item.updateSource` called once with
     the case-1 object; `options['pentaryn-attunement']` set. On a pile actor (`game.itempiles.API.isValidItemPile → true`) → no call.
   - `createItem` (own user, bond, home) → `F.calls` order: `item.update({'flags.pentaryn-attunement.-=bond': null})`,
     `actor.update({…away, …slots})`, `ui.notifications.info` with the `BackInHand` text. Coin purse
     bond → `actor.update` currency sums, `item.delete`, `CoinBack` toast.
   - `game.pentaryn.attunement.stash(owner, container, ['c','t1','t2'])` →
     `container.createEmbeddedDocuments('Item', creates)`, `owner.deleteEmbeddedDocuments('Item', ['c','t1','t2'])`,
     `owner.update({...away, ...slots})` in that order; resolves `creates.length`.
   - `report('Talo Vesk')` → `console.log` header text and `console.table(rows)` pinned; return object
     pinned. `report('nope')` with no controlled token → `undefined` and one
     `console.warn('pentaryn-attunement | no actor')`.
6. `test/hooks.test.mjs` → `golden/hooks.json` = the sequence in §2. Drop the template's
   "only lifecycle hooks at module scope" assertion (wrong for migrating modules).
7. `test/i18n.test.mjs` (tier full): every `t(` key literal in the source exists in `STRINGS`
   (and, from step 9, in `lang/en.json` with an identical value — the parity check of `items-journal-14`).
8. `GOLDEN_UPDATE=1 node test/run.mjs` on unchanged code; green; **checkpoint** (agent commits).

### Step 2 — `attunement-core.mjs` (behaviour-neutral)

Absorbs `items-journal-8`, the extraction halves of `-9`, `-10`, `-12`, and `-14` step 1 (rewrite the
:833 comment to "Strings live here; `t()` reads them directly"; drop the blank line at :859). Clears C11, C41.

- Move the core rows of §2 verbatim; add `planStash`, `bondChanges`, `wouldExceed`, `trimSlots`
  (the oracles' bodies, now exported). Glue calls them: `restoreBond` → `item.updateSource(bondChanges(…))`;
  `warnOverCap` → `const {exceed, after} = wouldExceed({value: att.value, max: att.max, awayCount: awayOf(actor).length}); if (!exceed) return;`
  with `value: after` in the toast data.
- `core.test` switches its import to `../attunement-core.mjs` (the table rows do not change — that is
  the proof); add `VERSION === module.json.version`; the core is imported bare first.
- 2b (test-only commit, before step 4): convert `test/legacy-slots.mjs` into `core.test` cases importing the core;
  remove it from `LEGACY`; then the entry's re-export line can go. Same 35 assertions, same expectations.

### Step 3 — `actor-adapter.mjs` (behaviour-neutral)

- `isPileActor = a => !!game.itempiles?.API?.isValidItemPile?.(a)` replaces :216 and :244;
  `writeSlots`, `releaseAway`, `applyProficiencies({log})` move here verbatim.
- `foundry/adjustments.yml`: row `itempiles-attunement-repair` `files` → `actor-adapter.mjs` (the
  marker `isValidItemPile` lives there now); `dnd5e-armor-proficiencies` `files` →
  `attunement-core.mjs` + `actor-adapter.mjs` (marker `armorProficienciesMap`). The updater's check
  needs each marker in a listed file, so this row edit must land **in the same change set** as this
  step. Same for `dnd5e-item-tooltip-anchor` (U-8-5): `files` → `actor-adapter.mjs` (marker
  `_positionItemTooltip`), and the guard moves there through `wrapMethod({target: proto, name:
  "_positionItemTooltip", marker: "pentarynGuarded", adjustments: "dnd5e-item-tooltip-anchor"}, …)` —
  keep the marker literal so the row's grep and today's idempotence check both hold — schedule step 3 for the window when `adjustments.yml` is idle (the use-doc's one-batch rule).
- Glue test unchanged and green.

### Step 4 — UI + features + entry wiring (behaviour-neutral except console-only error text)

Absorbs the hook half of `items-journal-11`. Clears C18, C10.

- `strip.mjs`, `sheet.mjs`, `bonds.mjs` per §2. `sheet.install(reg, ctx)` →
  `reg.on("renderBaseActorSheet", handler, {label: "renderBaseActorSheet: strip"})`; `bonds.install`
  → `preUpdateItem`, `preCreateItem`, `createItem` in that order; `bonds.install` returns the
  contribution `{rows:[stash], impl:{stash}}`. Both export `uninstall()` (no session state today: empty).
- Entry: `Hooks.once("init", onInit); Hooks.once("ready", onReady); install();` — `golden/hooks.json` must not change.
- `reg.guard` is pass-through: `preCreateItem`'s `updateSource`/`options` mutation and return values
  are untouched; the render handler keeps its own try/catch so `pentaryn-attunement | render failed` stays.
- **Console-only change:** a rejection in `onCreateItemBond` was an anonymous "Uncaught (in promise)";
  it is now `pentaryn-attunement | createItem: bond return` + the error. A sync throw inside a pre-hook
  was Foundry's "Error thrown in hooked function"; it is now the module-prefixed line. Pin both in
  `glue.test` with handlers forced to throw (the stub mimics Foundry's catch), in this commit, with the
  message `[declared] console-only: hook errors carry the module prefix`.

### Step 5 — API through the manifest, `publishNamespace` (additive)

Absorbs `items-journal-16`. Clears C26, C27, C28, C29, C40 (api), C50.

- `api-manifest.mjs` rows (namespace `attunement`, `flagScope: "pentaryn-attunement"`, `flags.writes`
  `["flags.pentaryn-attunement.slots","flags.pentaryn-attunement.away","flags.pentaryn-attunement.bond"]`):
  - `report` — `params:[{name:"target", resolve:false}]`, `legacy:true`, returns
    `"{actor,value,max,over,slots,rows}|undefined"`, `sideEffects:["console.log","console.table"]`,
    `nullWhen:"no actor → undefined (console.warn)"`. Keep the canvas-controlled fallback; **do not**
    resolve through `resolveRef` (it would throw `AMBIGUOUS` where `getName` returns the first match).
  - `computeSlots`, `away` — `params:[{name:"ref", kind:"actor"}]`, `legacy:true`: a Document passes
    through unchanged (same reference), an id/uuid/exact name now resolves (additive, `items-journal-16` (1)).
  - `releaseAway` — `params:[{name:"actor", resolve:false},{name:"key"}]`, `writes:true`, `legacy:true`
    (returns `setFlag`'s promise).
  - `stash` (contributed by `bonds`) — `params:[{name:"owner", resolve:false},{name:"container", resolve:false},{name:"itemIds"},{name:"opts"}]`,
    `writes:true`, `legacy:true`, returns `number`.
  - `inspect` (new, read) — `(ref, opts)` → `toPlain({actor: refOf(a), ...computeSlots(a), away: awayOf(a), bonds: a.items.filter(bonded).map(i => ({item: refOf(i), bond}))})`, depth ≤ 4.
  - `selftest`.
- Entry `onReady`: the tooltip guard first, inside `try/catch` with a `pentaryn-attunement | tooltip guard skipped`
  warn (`items-journal-39` (b); today a throw there would skip the publish), then `buildApiFor(ctx)` (drift → `log.error`, return), then
  `publishNamespace("attunement", api, {moduleId: MODULE})` synchronously — no `setTimeout`. The kit's
  re-alias tick covers a still-freezing importer; after the importer's step 7 it is a no-op.
- `api.test`: rows ↔ impl (incl. the contribution); `golden/describe.json`, `golden/surface.json`;
  `inspect(fixtureActor)` depth ≤ 4; for each legacy fixture actor `api.computeSlots(doc)` deep-equals the
  core's; `await api.stash(...)` with no options resolves the count. The glue publish pin changes in
  this commit only in the documented way (API present at `ready` instead of one tick later; frozen;
  plus `module.api`) — commit message `[declared] publish via kit (D2)`.
- Optional additive extras from `items-journal-16` (2)–(3): `report(target, {quiet})`, `stash(…, {detail:true})`.
  Keep `report`'s miss returning `undefined`.

### Step 6 — CSS class names under the module prefix (visual-neutral)

Clears C37.

- `.pentaryn-over-cap` → `.pentaryn-attunement-over-cap` (CSS :154, :159; JS `decorateCounter` :535);
  `.pentaryn-away-tip` → `.pentaryn-attunement-away-tip` (CSS :187–188; JS tooltip :481). Grep on
  2026-10-10: no other module uses either class.
- Test first: `glue.test` pins the class toggled on the counter and the tooltip HTML with the **old**
  names; this commit updates exactly those two pins (message names C37). Live glance: §5 D-A3.

### Step 7 — Docs

Absorbs `items-journal-17` and the README part of `items-journal-29` (cross-module hook-order note).
Clears C44, C45.

- README in the use-doc §7 order. Map: *What it does / Reading the display / Away bonds / Collapsed sidebar*
  (:17–76) → *What the player sees*; *Warnings* (:77–95) → *Two sessions / who writes* + *Pitfalls*;
  *Not Proficient* (:96–119) → *Patches and adjustments*; *Slot order* (:120–131) → *Data written*
  (with the three flag shapes `slots`, `away`, `bond`); *Checking an actor* (:132–143) → *API*
  (table: method | args | returns | writes? | GM?); *Tests* (:144–155) → *Tests* without the stale
  "31 fixtures" count; *dnd5e 6* (:156–173, incl. the U-8-5 tooltip-guard paragraph :166–172) → *Patches and adjustments*; *Install* (:174–182; :166–174 at the snapshot) → *Sync*. `??=` wording (:107 README, :806 code comment)
  → "only when unset (`== null`)".
- *Pitfalls*: attunement's `preCreateItem` registers at load; dropbin's attunement repair registers
  inside an async `ready` — restoreBond runs first, and moving attunement's install to `setup` would
  break that order.
- `CHANGELOG.md` (0.2.1 — U-8-5 tooltip guard — and earlier from git history).
- *Patches and adjustments* names all three rows, including `dnd5e-item-tooltip-anchor` (README :166–172 today).

### Step 8 — i18n through `_loc` (**declared**, after step 9 is live)

Absorbs `items-journal-14` step 2. Clears C04 (with step 9), C34, C35.

- The `languages` entry and `lang/en.json` (`PENTARYN_ATTUNEMENT.{OverBy, NotOnActor, NotAttunable, WouldExceed, ArrivedAttuned, AwayBody, Release, ReleaseConfirm, SlotHeld, BackInHand, CoinBack}`,
  values byte-identical to `STRINGS`) ship in step 9's restart. This step replaces the 11 `t(…)`
  call sites (:251, :266, :473, :480, :517, :554, :590, :591, :617, :621, :723) with full-key literals
  `_loc("PENTARYN_ATTUNEMENT.X", data)` and deletes `STRINGS`/`t`. :723 takes a variable key
  (`warnOverCap(…, "WouldExceed")` at :732, `"ArrivedAttuned"` at :740): pass the full key from those two callers.
- Why declared: the :849–851 comment records that merging into `game.i18n.translations` at `init`
  did not survive to render time in v14. A shipped lang file is a different path, but it must be seen
  working live. One known difference, from Foundry's `Localization#localize` (client/helpers/localization.mjs:435–444):
  a placeholder missing from `data` renders `undefined` where `t()` kept `{n}`. No call site omits
  data today (pin with a `sourceScan` that every `_loc` with a `{…}` value passes an object with those keys).
- `i18n.test`: parity (every former `STRINGS` value equals `lang/en.json`), every literal key exists.

### Step 9 — Wave 7 `module.json` batch item (restart)

- `flags.pentaryn = {flagScope:"pentaryn-attunement", generation:14, tier:"full", namespace:"attunement", cssPrefix:"pentaryn-attunement-", afterSync:[…]}`
  (metadata fix only — see C07).
- `relationships.recommends: [{id:"item-piles", type:"module", reason:"away bonds skip pile actors; confiscation stashes into Item Piles containers"}]` (C09).
- `compatibility.minimum: "14"` (`transform-creatures-24`); `styles: ["styles/attunement.css"]` + move the file (C06w);
  `languages` + `lang/en.json` (C04, inert until step 8).

---

## 4. Findings that stay standalone

| Finding | Kind | Notes |
|---|---|---|
| `items-journal-10` (count check) | **declared** hardening | after step 3: `const made = await container.createEmbeddedDocuments('Item', plan.creates); if (made.length !== plan.creates.length) { console.error(\`${MODULE} \| stash: container accepted …; originals NOT deleted\`, …); throw … }`. Glue fixture: container returns one fewer → `deleteEmbeddedDocuments` never called, `stash` rejects; all created → unchanged pins |
| `items-journal-13` | performance | compute `computeSlots` once per render and pass it to `decorateCounter`/`buildStrip`; `awayByKey` map. Optional DOM-equivalence fixture |
| `items-journal-11` (DOM listeners) | console-only | the five listener paths in `activate` (:641, :647, :657, :662, :679) wrapped with a `safe(label, fn)` that logs `pentaryn-attunement \| <label> failed`. The hook half is absorbed in step 4 |
| `items-journal-12` (`countMismatch`) | additive diagnostic | `report()` adds `countMismatch`; optional |
| `items-journal-39` (new, U-8-5) | hardening, failure path only | if step 5 has not landed yet: wrap :867 `guardItemTooltipPosition()` in `try/catch` so a throw cannot skip the publish; export the guard (or `tooltipAnchorMissing`) for the five-case stub test in the finding. Add `_positionItemTooltip` to `privateInternalPatterns` in `scripts/foundry/blueprint/packages.json` so C33 lists it |
| `-=` → `_del` (not an audit finding) | v14 hygiene | :258 `[\`flags.${MODULE}.-=${BOND}\`]: null` → `{[flagPath(MODULE, BOND)]: _del}`; same effect, no deprecation warning. Pin the update payload shape change in its own commit |

## 5. Declared behaviour changes — live test

| # | Change | How to see it |
|---|---|---|
| D-A1 | API published at `ready` (not one tick later), frozen, also at `game.modules.get("pentaryn-attunement").api` | `game.pentaryn.attunement.describe().version === "0.2.1"`; hovering an inventory row that re-renders (take/attune) leaves the console clean (U-8-5 still guarded); `report('<a PC>')` prints as before; `inspect('<a PC>')` returns slots/away |
| D-A2 | Strings through `lang/en.json` + `_loc` (step 8) | Open a character sheet with an away item: tooltip body, Release dialog title/body, over-cap note; attune past the cap (WouldExceed toast); drop a non-attunable item (NotAttunable); return a stashed item (BackInHand); coin purse (CoinBack). No raw `PENTARYN_ATTUNEMENT.*` key, no `undefined` |
| D-A3 | CSS class rename (step 6) | Over-cap counter turns red as before; away-slot tooltip keeps its 220 px width and paragraph spacing |
| D-A4 | (standalone `items-journal-10`) stash refuses to delete when the container drops an item | node fixture only; at the table a normal confiscation is unchanged |
| — | Console-only: hook errors module-prefixed (step 4) | no table check |

## 6. WAIT

No. Attunement touches no file of combat, transform or aoe. Its only cross-module coupling is the
`preCreateItem` order with dropbin (kept by synchronous install) and Item Piles.

## 7. Effort

Step 1 ~0.5 day (good existing fixtures help), steps 2–7 ~1 day, step 8 ~0.25 day + live check.
**~1.5–2 days.**

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | **90.9 % (40/44)** in the worktree (`conformance.py --module attunement`, 2026-10-11): fail C04, C07, C09, C32; warn C02, C06w. With the integrator's adjustments edits below (checked with `--snapshot`): **93.2 %**, fail C04, C07, C09 only |
| Date | 2026-10-11 (workflow 2, branch `migrate/wave-2`) |
| Commits | step 2 `b1ff1cde` (core; -8, -9, -10, -12, -14 step 1) · 2b `676a98de` (legacy suite → `slots.test`, re-export gone) · 3 `5f3bf2d5` (adapter; -39 c, `wrapMethod`, kit `patch` vendored) · strip characterisation `59185ac9` · 4 `963acfac` (strip/sheet/bonds, `reg` with `guard: false`) · 4 [declared] `07920a8f` (kit guard; -11 hook half) · -11 listener half [declared] `0d0c2199` (+ C25 fix `7db966e4`) · -13 `03f417f0` · -39 b [declared] `e1adc21c` · 5 [declared] `d7a8ae2f` (D-A1; -16, -12 `countMismatch` → `inspect().counts`) · `api.test` + goldens `a230bf69` · 6 [declared] `a3941fb6` (D-A3) · -10 KNOWN pin `a7963405`, fix [declared] `7e18a834` (D-A4) · `_del` [declared] `b54556d1` · 7 `10459870` (-17, README/CHANGELOG) |
| Not applied | step 8 (`_loc`, needs step 9 live) and step 9 (Wave 7 `module.json`); `-14` step 2 rides on them. `-12`'s `countMismatch` on `report()` (its return is frozen in `golden/report.json`; the diagnostic is `inspect().counts.mismatch`). The success-path log line of `-10` (listed here before as `-16`'s and skipped) landed in the standalone pass as `console.info` [declared] `7cf1a4f1`; the -17 README/API parity check `6402b3fb` |
| Deviations | `stash` lives in `actor-adapter.mjs` and is a manifest row, not a `bonds` contribution: the frozen ready pin orders the legacy keys `report, computeSlots, stash, releaseAway, away`, and contributions publish last. `computeSlots`/`away` take `{name: "actor", resolve: false}` and resolve strings themselves, so any object (not only a Document) still passes through. The tooltip row is named `attunement-item-tooltip-anchor` (a `wrapMethod` row takes the module prefix, D2). `safe()` calls `fn` synchronously (the audit's `Promise.resolve().then(fn)` would move `onDrop`'s `preventDefault` out of the event) |
| Declared changes handed to the live-test workflow | D-A1 `d7a8ae2f`, D-A3 `a3941fb6`, D-A4 `7e18a834` (node only), `_del` `b54556d1`, -39 b `e1adc21c` (failure path), console-only `07920a8f`, `0d0c2199`, `7cf1a4f1` (a stash logs one `pentaryn-attunement | stash: <n> moved to <container>` info line) |
| `module.json` edits for `wave7-restart-batch.md` | step 9 as written (returned to the integrator) |
| Adjustments rows | `itempiles-attunement-repair` files → `actor-adapter.mjs`; `dnd5e-armor-proficiencies` files → `attunement-core.mjs`, `actor-adapter.mjs`; `dnd5e-item-tooltip-anchor` → id `attunement-item-tooltip-anchor`, files → `actor-adapter.mjs` (returned to the integrator; C32 and `foundry-adjustments-check` are red until they land) |
| Still failing, and why | C04, C07, C09 (Wave 7 `module.json`); C32 until the adjustments edits land |
| Frozen tests | `git diff 88f935e..HEAD -- test/` touches only: `fixtures/impls.mjs` (core appended, as its comment plans), `glue.test` (the entry import → core for `computeSlots`; the D-A1 pin; the `_del` pin), `legacy-slots.mjs` (converted, step 2b), `run.mjs` (`LEGACY` emptied, step 2b, 676a98de), and `test/kit/*` (`foundry-stub.mjs`, `harness.mjs`: the vendored kit 1.0.2 from 79977983, just before the lane's range; `foundry.utils.logCompatibilityWarning` now goes to a recording `globalThis.logger`, read as `F.logged`, instead of `console.warn`). Neither `run.mjs` nor `test/kit/*` changed an assertion. Every other file under `test/` is new in the lane; the review follow-up only appended cases to two of them (`guard-failure.test`, `stash-safety.test`). Suite: 113 tests green at the result, 116 after the review follow-up |
| Open for Joe | W2-A1 (wave-2 report): the coin-purse `createItem` pays from every tab of the initiating user |
