---
title: Migrating pentaryn-portals to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, portals]
---

# Migrating `pentaryn-portals` to the blueprint

> **WAIT lifted 2026-10-11** (D9: live usability work finished; `wait.json` is empty). The WAIT wording below is history; the re-anchor step still applies.

**Read this when:** you are about to bring `pentaryn-portals` up to the addon blueprint, as part of
the fix phase after the 2026-10 code audit. **Not this file:** the general procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8 · the order across modules
→ [`migration-order.md`](migration-order.md) · the audit findings in full →
`context/plans/code-audit-2026-10/portals.md` · using portals →
[`../../foundry/scene-links.md`](../../foundry/scene-links.md) (Destination cards).

> **Re-anchored to `4e64f47` on 2026-10-11.** The live drift this guide listed is now committed
> (`17275c9`, usability re-run U-6-13, U-8-4, U-9-6; portals 0.4.2 → 0.4.4, `portals.mjs` 850 →
> 966 lines). Line numbers below are now **HEAD `4e64f47`** numbers, with the snapshot number in
> brackets where it differs ("[snap :502]"). Score re-run on the live folder: **51.3 % (20/39)**,
> down from 57.9 % (22/38) — the re-run's settings add C21/C22 and its adjustments row fails C32 (§1).
> Audit changes: aoe-movement-portals-24 is **partly resolved by U-9-6** (the generation guard
> landed; only the debounce remains, §4); -26, -27, -28, -29, -31, -32 were extended for re-run
> code; new **aoe-movement-portals-43** (two disagreeing copies of aoe's handle predicate, §4).
> `wait.json` is unchanged — still WAIT until Joe confirms.

## WAIT — re-anchor before any edit

`pentaryn-portals` is on the WAIT list (`scripts/foundry/blueprint/wait.json`). The live-test
workflow was editing it on 2026-10-10, and the list says to lift it only when Joe confirms. The
portals steps do not touch combat, transform or aoe code, but two items depend on aoe. The live
tree reads aoe's `flags["pentaryn-aoe"].handle`. Finding -30 (the election primitive) is shared
with aoe, and the kit already provides it.

Line numbers were originally the **frozen audit snapshot** (pentaryn `ee505c2` plus the uncommitted
tree as of 2026-10-10 20:15; for this module the snapshot equals `ee505c2`). They are now HEAD
`4e64f47` numbers. The changes since the snapshot, all committed in `17275c9`:

| Change since the snapshot (HEAD `4e64f47`) | Where | What it does to this plan |
|---|---|---|
| `spreadArrival(arrived)` (U-6-13) | `portals.mjs:663-680`, called inside `bringFollowers` at `:692` | goes in the `party.mjs` feature. It reads `flags["pentaryn-aoe"].handle`, a cross-module flag read: add it to the manifest's `flags.reads` and to the README table (use-doc §5.8). Its handle test disagrees with `recordOf`'s (aoe-movement-portals-43) |
| `preferTeleport(app, element)` (U-6-13) | `portals.mjs:927-936`, called from the `renderDialogV2` listener at `:919` | goes in the `cards.mjs` feature, inside the **same** listener (same hook, same order) |
| `SETTINGS` (`teleportDefault`, `spreadArrivals`, `confirmPartyTeleport`), local `setting()`, `Hooks.once("init")` registering all three with **plain English** name/hint | `portals.mjs:938-954` | portals now has settings: S5 is required, and C21, C22 and C51 apply (C21/C22 fail live) |
| `plainQuestion(app, behavior, content, card)` (U-8-4) | `portals.mjs:95-109`, called from `decorate` at `:89` | `cards.mjs` with `decorate`; English literal (W7 i18n); parses the dialog id a second time (-26) |
| `confirmParty(party, title)`; `teleportParty(destRegion, { confirm = true })` (U-8-4) | `portals.mjs:597-613`, `:615-633` | both go to `scene-adapter.mjs` (the badge menu calls `teleportParty`); `confirmParty` opens a `DialogV2` and reads a setting, so the adapter imports `settings.mjs`. The API now blocks on a dialog unless `{confirm:false}` (-32) |
| `recordOf` gains `name` and `handle`; `partyRecords` replaces `partyTokens`; `landingPlaces(…, party)`, `carryTo(…, party)` (U-8-4) | `portals.mjs:526-546`, `:553-555`, `:561-580`, `:584-591` | same targets as before (`scene-adapter.mjs`); test pins use the new names and record shape |
| `drawRun` generation guard in `drawBadges`; `canvasTearDown` bumps it (U-9-6) | `portals.mjs:234`, `:262-271`, `:325`, `:915` | `badges.mjs` owns `drawRun`; -24 is half done (§4) |
| core `leaderOf`, `assignSpots`, `partyPreview` (U-8-4), `crowded` (U-6-13) | `portals-core.mjs:65-136`, `:213-215` | pure; already in core, with 16 + 4 fixtures in the legacy suite |
| `.pp-party`, `.pp-follows` | `portals.css:55-57` | S7 rename → `ppt-party`, `ppt-follows` |
| `api.spreadArrival` | publish block `:962` | one more API row (party contribution) |
| adjustments row `portals-teleport-default-and-spread` | `adjustments.yml:884-893` | fails C32 (module prefix, no `wrapMethod`) — ADJ renames it (§3 ADJ) |

Before step 1:
1. Run `git diff 4e64f47 -- foundry/module/pentaryn-portals` (anything it shows is drift after this
   re-anchor).
2. Run `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module portals --markdown`.
3. Re-locate every anchor quoted here. Snapshot line numbers are hints; the quoted anchor text is
   the authority.

---

| Gap-fill (2026-10-10) | |
|---|---|
| Prerequisites | R1 C32 vs non-patch rows — **blocked on D2**; until then use the package prefix for non-patch rows (use-doc §5.6) |
| Scores | **Re-scored 2026-10-11 on the live folder at `4e64f47`: 51.3 % (20/39)** (snapshot 57.9 %, 22/38) — `conformance.py --module portals --markdown` |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

## 1. Conformance today — 51.3 % (20 / 39 fail-class rules), live `4e64f47`

| Score row | Date | Tree | Score | Failing (fail-class) |
|---|---|---|---|---|
| snapshot | 2026-10-10 | `ee505c2` | 57.9 % (22/38) | C07, C09, C14, C18, C20, C24, C26, C27, C28, C37, C40, C41, C43, C44, C45, C47 |
| **live re-score** | 2026-10-11 | `4e64f47` | **51.3 % (20/39)** | the snapshot set **+ C21, C22** (the re-run's settings) **+ C32** (row `portals-teleport-default-and-spread`) |

Warn: C06w, C10, C36. Manual: C31, C36. W7 means the Wave 7 restart batch (`module.json`, synced
once). ADJ means the adjustments batch.

| Rule | Class | Today | Detail (HEAD `4e64f47`; [snapshot]) | Clears at |
|---|---|---|---|---|
| C01 | fail | pass | — | — |
| C02 | warn | pass | — | — |
| C03 | fail | pass | dnd5e is touched (`getFlag("dnd5e", …)` at `:540-541` [:511-512]) and declared | — |
| C04 | fail | pass | no languages and no i18n | still passes after the i18n conversion, **only because** it ships with W7's `languages` (§3 W7) |
| C05 | fail | pass | — | after S3, all new files are reachable from the entry |
| C06 / C06w | fail / warn | pass / **warn** | `portals.css` at the root | W7 |
| C07 | fail | **fail** | no `tier`, `namespace`, `cssPrefix`; `flagScope: "portals"` | W7 |
| C08 | fail | pass | — | — |
| C09 | fail | **fail** | `game.itempiles` named (`:530` [:502]) with no `recommends` entry | W7 (`recommends: [{ id: "item-piles", type: "module", reason: "…a pile-PC is not left behind…" }]`) |
| C10 | warn | **warn** | `portals.mjs` 967 lines by the scorer [851] (entry cap 150) | S3 |
| C11 | fail | pass | `portals-core.mjs` is pure | stays green: the `cardHTML`/`esc` move uses only `foundry.utils.escapeHTML` |
| C12 | fail | pass | `MODULE` once (`:32`) | S2 moves it into core |
| C13 | fail | pass | — | — |
| C14 | fail | **fail** | no kit | S1 |
| C15 | fail | pass | — | — |
| C16 | fail | pass | one glue file | stays green through S3 (role plan in §2) |
| C17 | fail | pass | — | S3 moves the module-scope hooks into features |
| C18 | fail | **fail** | no feature files | S3 |
| C19 | fail | pass | emits nothing | — |
| C20 | fail | **fail** | no `golden/hooks.json` | S1 |
| C21 | fail | pass (snapshot) / **fail** (live) | `game.settings.get` at `:948`, `register` at `:952` | S5 |
| C22 | fail | n/a (snapshot) / **fail** (live) | settings registered, no exported `SETTINGS` | S5 |
| C23 | fail | pass | — | — |
| C24 | fail | **fail** | bare `catch {}` at `:263` [:238] (badge layer destroy), `:300` [:273] (texture load), `:325` (**new**, U-9-6 stale-draw destroy), `:530` [:502] (item piles check), `:658` [:597] (`testPoint`) | S4 |
| C25 | fail | pass | — | stays green (`log.warn` emits the same text) |
| C26 | fail | **fail** | `:961` [:845] `setTimeout(…, 0)` around publish | S6 |
| C27 | fail | **fail** | no manifest | S6 |
| C28 | fail | **fail** | no describe/surface goldens | S6 |
| C29 | fail | n/a | the scorer sees no flag writes. **It misses some:** portals writes `flags.pentaryn-portals.{title,img,description}` on **regions** (`:168, :854, :858, :868` [:151, :773, :777, :787]). C29 counts actor and token writes only, so `inspect` is optional | optional `inspect(regionRef)` in the API additions (§4) |
| C30 | fail | pass | — | — |
| C31 | manual | manual | `snapshot` returns a path or null; `teleportParty` / `lookAt` return undefined | S6 records them as `legacy` rows, as they are |
| C32 | fail | pass (snapshot) / **fail** (live) | no prototype patches; the re-run's row `portals-teleport-default-and-spread` has a `portals-` id and no `wrapMethod` names it (R1 / D2) | ADJ (rename to `core-teleport-default-and-spread`) |
| C33 | manual | n/a | core teleport-dialog internals (`dialog-<uuid>-<token>`, `.dialog-content`, `select[name="destination"]`, and since the re-run `button[data-action="yes"]`/`"no"` + `autofocus`, `:scope > p`) and `options.replacements` are not in the private-token list | ADJ rows (finding -31) |
| C34 / C35 | fail | n/a | no lang file | become applicable in W7. They pass if the conversion uses full-key literals |
| C36 | warn | **warn** | 12 literals live [8]: `:128, :393-398, :514, :600 …` [`:111, :365-370, :486, :674`]; finding -29 counts about 55 strings at `4e64f47` [about 40] | W7 i18n |
| C37 / C37w | fail / warn | **fail** / pass | 49 selectors under `.pp-*` (prompts' prefix) or `.pentaryn-portal-card` / `.pentaryn-portal-dialog`, none under `.pentaryn-portals` | S7 (rename to `ppt-`) + W7 (`cssPrefix: "ppt-"`) |
| C38 | fail | n/a | — | W7. `ppt-` is unused anywhere |
| C39 | fail | pass | — | — |
| C40 | fail | **fail** | no `*.test.mjs` | S1, S5 (i18n), S6 (api) |
| C41 | fail | **fail** | — | S1 |
| C42 | manual | n/a | — | S1 fixtures are synthetic |
| C43 | fail | **fail** | self-running `test/run.mjs` | S1 |
| C44 | fail | **fail** | 33-line flat README | S8 |
| C45 | fail | **fail** | no CHANGELOG | S8 |
| C46 | fail | pass | — | S8 also names the module in the scene-links routing row |
| C47 | fail | **fail** | no adjustments row for item-piles | ADJ |
| C48 | fail | pass | — | — |
| C49 | warn | pass | `sightRefresh` → `refreshBadgeSight` iterates only `badges` | add `// hot: badges` (S4) |
| C50 | fail | n/a | — | S6 |
| C51 | fail | n/a (snapshot) | the three live rows carry **plain English** labels (`:939-946`) | open until W7 adds `lang/en.json` (keys `PENTARYN_PORTALS.Setting.<key>.Name/Hint`, the new-module shape, since portals has no prior shape) |
| C52 | fail | pass | — | — |

**Target.** The live tree has 41 applicable fail-class rules after migration (38 + C22 + C50 + C51).
After S1–S8 and the ADJ batch (which must include the C32 rename), but before W7, 37 / 41 pass (90.2 %). C07, C09, C37 and C51 stay open
because each needs `module.json` or `lang/`. After W7, C34, C35 and C38 also apply, and 44 / 44 pass
(100 %).

---

## 2. Target layout vs today

Tier: **full**. Portals has API writes: `snapshot`, `teleportParty`, region flags and behaviours.

Each new file name is chosen so the scorer classifies its role (C16):
- `-adapter.mjs` → adapter;
- `-app.mjs` → ui;
- a file that exports `install` → feature.

| Target file | Role | Comes from (HEAD `4e64f47` `portals.mjs` unless stated; [snapshot]) |
|---|---|---|
| `portals.mjs` | entry (≲150) | header `1-27` (trimmed); `FEATURES = [party, badges, cards]`; phases; publish (`960-966` [844-850]) |
| `portals-core.mjs` | core | today `1-215` [1-128] (incl. `leaderOf`, `assignSpots`, `partyPreview`, `crowded`), **plus** `MODULE` `:32`, `SNAP_DIR` `:33`, `SHORT/NS/VERSION("0.4.4")/CONTRACT/I18N/CSS/HOOKS`. Also moved in: `esc` `:34` and `cardHTML` `48-56`, which are pure through `foundry.utils.escapeHTML` (allowed by C11), plus finding -26's helpers (S2). |
| `scene-adapter.mjs` | adapter (about 350 lines) | `cardFor` `37-46` (I/O around `core.cardData`); `behaviorOf` `58-64`; `snapshot` `115-170` [98-153] (Image, canvas, FilePicker; maths in `core.cropWindow`); `teleportBehaviors` `245-247` [221-223]; `toAbsolute` `250` [226]; `destinationsOf` `252-259` [228-235]; `moveRegionDocs` `475-495` [447-467] (returns false when nothing moved; the `drawBadges()` fallback stays in badges); `lookAt` `505-515` [477-487]; `folderNames` `520-524` [492-496]; `recordOf` `526-546` [498-515]; `partyRecords` `553-555` [`partyTokens` 522-524]; `landingPlaces` `561-580` [527-543]; `carryTo` `584-591` [547-554]; `confirmParty` `597-613` (new; DialogV2 + setting); `teleportParty` `615-633` [556-572]; `linkRegions` `737-750` [656-669]; `unlinkRegion(from, dest)` from the loop at `870-874` [789-793] |
| `party.mjs` | feature | `pendingOps` `650` [589], `cameThroughPortal` `652-661` [591-600], `spreadArrival` `663-680` (new), `bringFollowers` `682-713` [602-632], `deleteToken` hook `715-727` [634-646]. Contributes the API row `spreadArrival` |
| `badges.mjs` | feature (about 300 lines) | badge state incl. `drawRun`, and `setEditing` `227-243` [210-219]; `drawBadges` `261-330` [237-302]; `refreshBadgeSight` `343-354` [315-326]; `badgeAt` `356-360` [328-332]; tip `363-381` [335-353]; menu `384-409` [356-381]; `bindBoard` `411-467` [383-439]; `drag` `469` [441]; `moveRegion` wrapper; hooks `910-915` [829-834] (the `canvasTearDown` handler now also bumps `drawRun`). Calls `configureCardApp({ setEditing })`. Contributes the API rows `open` (`PortalCard.open`) and `redraw` (`drawBadges`) |
| `cards.mjs` | feature | `decorate` `66-90` [66-92], `plainQuestion` `95-109` (new), `preferTeleport` `922-936` (new), `injectConfig` `176-207` [159-190]; hooks `917-920` and `955-957` [836-841] |
| `card-app.mjs` | ui | `PortalCard` `752-906` [671-826]; `setEditing` arrives through `configureCardApp` (ui may not import a feature); imports `scene-adapter` and core only |
| `settings.mjs` | settings | live `SETTINGS` / `setting()` / `Hooks.once("init")` (`938-954`) → **3** rows (`teleportDefault`, `spreadArrivals`, `confirmPartyTeleport`) |
| `api-manifest.mjs`, `api.mjs` | manifest / api | the rows `snapshot, cardFor, teleportParty, lookAt` (own); `open, redraw` (badges contribution); `spreadArrival` (party contribution) |
| `portals.css` → `styles/portals.css` (W7) | | the `pp-` → `ppt-` rename in S7 (now incl. `.pp-party`, `.pp-follows`, `portals.css:55-57`) |
| `lang/en.json` (W7) | | finding -29 |
| `test/…` | | as for every full module; `test/legacy-core.mjs` = old `test/run.mjs` `1-127` [1-89] |
| `README.md`, `CHANGELOG.md` | | S8 |

Import graph after S3:
- entry → features, settings, api, core, lib
- party → scene-adapter, core, settings, lib
- scene-adapter → core, settings (since the re-run: `confirmParty` reads `confirmPartyTeleport`)
- badges → card-app (ui), scene-adapter, core, lib
- cards → scene-adapter, core, settings, lib
- card-app → scene-adapter, core, lib
- api → scene-adapter, core, settings, api-manifest, lib

Nothing goes feature → feature, so `graph-allow.json` stays empty. This layout also breaks the
badges → party / card-app cycle that finding -25 worried about. The menu's `lookAt` and
`teleportParty` live in the adapter, and only `setEditing` is injected.

Registration timing: today every hook is registered at **module evaluation**. Each feature's
`install(reg, ctx)` therefore runs **synchronously in the entry body**, in the order party →
badges → cards. No hook name is shared between two features, so only the order *within* each name
matters. `golden/hooks.json` pins `F.hooks` grouped by hook name; the live `once init` moves to the
top of the entry, and that move is not a behaviour change. (At `4e64f47` it sits at `:950`, between
the `renderDialogV2` and `renderRegionConfig` registrations.)

---

## 3. Ordered steps

Every step is behaviour-neutral unless marked **[declared]**. Run `node test/run.mjs` after each
step and `make foundry-portals-check` before handing over. After S1,
`git diff --stat -- test/golden test/*.test.mjs` must be empty.

### S1 — Characterise, vendor, convert the runner (checkpoint)

Absorbs the test parts of **-25** (import smoke and hook capture), **-26**, **-27**, **-28** and
**-36**. Clears C14, C20, C40 (core, glue, hooks), C41, C43.

1. `vendor.py sync portals --tier full`.
2. Move `test/run.mjs` to `test/legacy-core.mjs` and list it in `LEGACY`. Give `test/run.mjs` the
   fixed body.
3. Seam: append to `portals.mjs`
   `export const _internals = { cardFor, cardHTML, behaviorOf, decorate, plainQuestion, preferTeleport, injectConfig, snapshot, drawBadges, badges, refreshBadgeSight, samplePoints, moveRegion, recordOf, partyRecords, landingPlaces, carryTo, confirmParty, teleportParty, spreadArrival, bringFollowers, cameThroughPortal, linkRegions, destinationsOf }`
   (`partyRecords` replaced `partyTokens` in U-8-4).
   Tests import it through `test/fixtures/seams.mjs`, so the refactor edits only that shim.
4. Write these tests against **unchanged** code:
   - **`core.test.mjs`**: port the legacy checks (52 at `4e64f47` [34]; incl. `leaderOf`/`assignSpots`/`partyPreview`/`crowded`). Add finding -38's edge pins:
     `isScenery({name:'Marker·4'}) === true`,
     `isScenery({name:'x',folders:['Scene Props','Markers — Red']}) === true`,
     `isScenery({name:'Crowded Hall'}) === false`. Pin the `VERSION` vs `module.json` check.
   - **`glue.test.mjs`**: `installFoundry()` with stubs for PIXI, `foundry.canvas.loadTexture` and
     `foundry.applications.api.ApplicationV2`, as in finding -24's recipe.
     - `F.utilsSource === "foundry"`.
     - `cardFor`: the fallback chain from finding -26's `cardData` cases. Pin
       `cardFor(null)` → **throws TypeError** as `// KNOWN:`; finding -32 changes it later.
     - `cardHTML`: radio and non-radio output byte for byte for one card with a `<script>` in the
       description (it escapes).
     - `behaviorOf`: three dialog ids (finding -26).
     - `decorate`:
       - a revealed single destination appends one `.pp-cards` and adds the class
         `pentaryn-portal-dialog`;
       - a `select[name=destination]` is replaced by radio cards, with the current value checked;
       - an unrevealed destination for a player is untouched;
       - (U-8-4) one revealed destination with no `dialog.revealed` text and dialog id
         `dialog-<behaviorUuid>-tok1` whose scene has token `tok1` named `Caven`: the first `<p>` reads
         `Teleport Caven to <card title>?`; with a GM-written `dialog.revealed` it is untouched.
     - `preferTeleport` (U-6-13): with `teleportDefault` true, `button[data-action="yes"]` gains
       `autofocus` and `"no"` loses it; with the setting false, or for a non-teleport dialog, nothing
       changes.
     - `injectConfig` as GM: the fieldset HTML is pinned. As a player: nothing.
     - `drawBadges`, single call: badge `x = 150`, `y = 180.2`, `r = 36` for bounds
       `{x:100, y:200, width:100, height:100}`, grid 100; a hidden region has alpha 0.35.
       Concurrent double call: since U-9-6 this gives **1** live container per region and
       `badges.length === 1` (pin as plain characterisation, no longer `// KNOWN:`); a
       `canvasTearDown` during the texture wait leaves no badge and no throw.
     - `moveRegion`: finding -26's `translateShapes` case through the glue. The update payload and
       the tile update go to `F.calls`.
     - `recordOf`: finding -36's record, minus `doc` (at `4e64f47` it includes `name` and `handle`).
       `game.users.filter` is called once per record. `// KNOWN:` (-43) a token with only the
       actor-side `handleActor` flag gives `handle: true`.
     - `partyRecords` on a 3-token scene.
     - `confirmParty` (U-8-4): with a `DialogV2.confirm` stub, the content lists one `<li>` per
       record, followers with `lands beside <PC>`; with `confirmPartyTeleport` false it resolves
       `true` without a dialog; an empty party warns `Teleport party: nobody on this scene counts as
       the party.` and resolves `false`.
     - `spreadArrival` (U-6-13): arrived at (600,1000) on an occupied square → one `update` to the
       first free ring square with `{ teleport: true, animate: false }`; not crowded → no update;
       setting off → no update. `// KNOWN:` (-43) an occupant flagged only on its actor still counts.
     - `landingPlaces`: finding -26's wall table and the occupied test through the glue.
     - `bringFollowers`: finding -28's success case gives
       `[['create',['s1'],{keepId:true}],['del',['s1']]]` and one info toast with that exact text.
       The "already exists" case **rejects**, pinned as `// KNOWN:`.
     - `linkRegions`: finding -32's cases (a), (b) and (c), exact captures.
     - `teleportParty` same-scene (call it with `{ confirm: false }`, or stub the confirm to
       resolve true): `updateEmbeddedDocuments` with `{ teleport: true, animate: false }` and the
       toast text `"3 party tokens moved to <title>."` (singular for 1). A cancelled confirm moves
       nothing and shows no toast.
     - Console texts byte for byte: `pentaryn-portals | dialog decoration skipped`,
       `… | dialog focus skipped`, `… | config injection skipped`, `… | arrival spread skipped`,
       `… | summons did not follow`.
     - `F.fire("ready")` + one tick: `game.pentaryn.portals` keys
       `["snapshot","cardFor","teleportParty","lookAt","open","redraw","spreadArrival"]`.
   - **`hooks.test.mjs`**: `F.hooks` grouped by name →
     `golden/hooks.json`. Snapshot: `deleteToken; createRegion, updateRegion, deleteRegion, createRegionBehavior, updateRegionBehavior, deleteRegionBehavior; canvasReady; sightRefresh; canvasTearDown; renderDialogV2; renderRegionConfig; once ready`
     (13 at the snapshot). At `4e64f47` there are **14**: `once init` (`:950`) is added.
5. `GOLDEN_UPDATE=1 node test/run.mjs` on unchanged code. **Checkpoint:** reviewed, and committed
   only with Joe's approval.

### S2 — Pure extraction into core

Absorbs **-26** (all seven helpers) and moves `cardHTML`/`esc` into core.

Characterisation: finding -26's hand-computed tables are added to `core.test.mjs` **before** the
move, against a verbatim oracle copy in `test/fixtures/legacy-geometry.mjs`:
- `translateShapes`: rect → x150 y175; polygon → `[50,-25,60,-25,60,-15]`; circle with `x: null`
  keeps null; the input is not mutated;
- `cropWindow`: `{x:200, y:225, w:400, h:250, outW:480, outH:300, mx:240, my:150, markR:27}`, plus
  the clamped centre case;
- `blockingWallCoords`: `[[0,0,1,1],[4,4,5,5]]`;
- `behaviorUuidFromDialogId`: three cases;
- `samplePoints({x:0,y:0,width:100,height:100}, 100)`: five points; 40×200 gives `q = 10`;
- `cardData`: two cases.

S1's glue pins (`drawBadges` numbers, `moveRegion` payload, the landing table, `cardHTML` bytes)
must stay green unchanged. The glue now calls `core.translateShapes(shapes, sx, sy)` and the other
helpers; `samplePoints` takes `canvas.grid.size` as its argument.

### S3 — Split the file: adapter, three features, ui, entry

Absorbs **-25**. Clears C10 (entry), C17 and C18, and keeps C16 green.

Characterisation: S1's whole suite, unchanged. Add **now** the import-smoke test from finding
-25: each new file imports under `installFoundry()` and exposes its named exports. These are new
assertions on new files, written before the old file is split.

- Move code per §2. Shared mutable state (`badges`, `editing`, `seen`, `tip`, `menu`, `drag`,
  `badgeLayer`) lives **only** in `badges.mjs`. `pendingOps` lives only in `party.mjs`.
- `configureCardApp({ setEditing })` is called by `badges.install`. `PortalCard`'s constructor,
  `close()` and `_renderFrame` toggle call the injected function. Before configuration it is a
  no-op, which cannot happen at runtime: the entry body installs features before any render.
- `reg.on(name, fn, { guard: false })` wherever today's handler has no try/catch, such as the
  region loop, `sightRefresh` and `canvasTearDown`, so throw behaviour is unchanged. The two render
  listeners keep their own try/catch and warn texts.
- Each feature's `uninstall()` covers its own state. `badges` destroys the layer, hides the tip and
  closes the menu, and the bound `#board` listeners stay (as today: `dataset.ppBound`). `party`
  clears nothing (a WeakMap). `cards` has nothing.
- Update `seams.mjs` to re-export from the new files.
- ADJ: `core-portals-relative-uuid.files` → `portals-core.mjs`, `scene-adapter.mjs`, which is where
  the `relative: behavior` marker now lives.

### S4 — Logging, no empty catch

Absorbs the C24 part of **-27**. Clears C24.

Characterisation, new tests added in this step:
- a texture load that rejects for `img: "bad.webp"` gives one `console.warn` whose first argument
  is `pentaryn-portals | card image bad.webp`; the second call stays silent (`warnOnce`);
- `isValidItemPile` throwing makes `recordOf(...).pile === false`, with no console output unless
  `CONFIG.debug["pentaryn-portals"]` is set.

Then:
- one `makeLog(MODULE)` in the entry. Each `console.warn(\`${MODULE} | x\`, err)` becomes
  `log.warn("x", err)`, with byte-identical text pinned in S1;
- `:263`, `:325` and `:658` [:238, —, :597] → `catch (err) { log.debug("…", err); }`;
- `:300` [:273] → `log.warnOnce(\`card image ${first.img}\`, \`card image ${first.img}\`, err)`;
- `:530` [:502] → `log.debug("item piles check", err)`;
- `:612` `confirmParty`'s `.catch(() => false)` → `.catch(err => { log.warn("party confirm failed", err); return false; })` (-27 extension; same return value);
- add `// hot: badges` on the `sightRefresh` listener (C49).

### S5 — Settings table (live tree only)

Clears C21 and C22, and adds `i18n.test.mjs` once W7 lands.

Characterisation: on the live code, capture the three `game.settings.register` calls (key and full
options) into `golden/settings-register.json`. Pin `setting("teleportDefault")` against an
unregistered store: it falls back to `true` (same for the other two).

`settings.mjs` holds three rows in live order: `teleportDefault`, `spreadArrivals`,
`confirmPartyTeleport` (`portals.mjs:939-946`). Each row
carries **the same plain English** `name`/`hint` it has today, until W7. The local `setting()`
becomes the kit's `settingReader`, with the same fallback.

C51 stays red until W7 swaps the literals for `PENTARYN_PORTALS.Setting.<key>.Name/Hint`. That swap
is part of the W7 i18n change, not this step.

### S6 — API manifest, publish, describe

Absorbs the `describe()` part of **-32**. Clears C26, C27, C28 and C50, and adds `api.test.mjs`.

Characterisation: `surfaceOf(game.pentaryn.portals)` on unchanged code → `golden/surface.json`
(S1). Build `describe.json` fresh here; it is new output.

- Own rows, `legacy: true` with today's parameter names:

  | Row | Parameters | Returns | GM | Writes |
  |---|---|---|---|---|
  | `snapshot` | `regionOrUuid, opts` | path or null | yes | yes |
  | `cardFor` | `region` | throws on null today | no | no |
  | `teleportParty` | `destRegion, { confirm = true }` | undefined; **opens a confirm dialog by default** (U-8-4) — API callers pass `{ confirm: false }` | yes | yes |
  | `lookAt` | `destRegion` | undefined | yes | no |

- `badges.install` returns `{ rows: [open, redraw], impl: { open: PortalCard.open, redraw: drawBadges } }`.
- `party.install` returns `{ rows: [spreadArrival], impl }` (`spreadArrival(tokenDoc)` → the doc, GM, writes).
- `flags: { writes: ["flags.pentaryn-portals.title", "flags.pentaryn-portals.img", "flags.pentaryn-portals.description"], reads: ["flags.pentaryn.travel.regionId", "flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.dnd5e.summon.origin", "flags.dnd5e.isPolymorphed"] }` (`handleActor` is read by `recordOf` since U-8-4).
- `onReady`: `buildApiFor(ctx)` first, then
  `publishNamespace("portals", api, { moduleId: MODULE })` synchronously. Delete the `:961` [:845]
  `setTimeout`.
- **[declared] D-P1**: the API is frozen and published at `ready` instead of one tick later, with
  kit members and the `pentaryn-portals.ready` / `pentaryn.ready` events.

### S7 — CSS prefix `pp-` → `ppt-` [declared, visual parity]

Clears C37 once W7 declares `cssPrefix: "ppt-"`.

Characterisation: S1's `cardHTML` / `decorate` / `injectConfig` HTML pins are the only tests that
change. Re-pin them in a separate commit named for this change.

- Rename every `.pp-*` class to `.ppt-*` in `portals.css` and in every HTML string and
  `className` in the code (incl. the re-run's `.pp-party`/`.pp-follows` in `confirmParty`'s HTML,
  `portals.mjs:603-608`, and `portals.css:55-57`).
- Rename the root classes so every selector carries the prefix:
  - `pentaryn-portal-card` → `ppt-app`
  - `pentaryn-portal-dialog` → `ppt-dialog`
  - the hover's `pp-hover pentaryn-portal-dialog` → `ppt-hover ppt-dialog`.
- `.window-content` is then scoped as `.ppt-app .window-content`.
- Leave the PortalCard **id** `pentaryn-portal-card-<regionId>` and `board.dataset.ppBound`
  alone: neither is CSS.
- No bleed exists today. Prompts' only shared class, `.pp-text`, is scoped under
  `.pentaryn-prompts`. So this rename is visually neutral, but it touches what players see, so it
  is **declared**.

### S8 — Docs

Absorbs **-33** and the documentation half of **-32**. Clears C44 and C45.

- README in use-doc §7 order, opening with "Read this when: changing portals code; using it →
  scene-links.md, Destination cards". The sections:
  - **What the player sees**: cards, badges, the hover;
  - **Settings**: the three rows;
  - **API**: the manifest table, with who may call each method, `teleportParty`'s
    `canvas.scene` default and its `{ confirm }` option (a console caller passes `false`);
  - **Data written**: the region flags and the behaviours that `link` creates;
  - **Flags other modules read**: n/a, then **flags it reads**: `flags.pentaryn.travel` on tiles
    and `flags.pentaryn-aoe.handle` / `handleActor`;
  - **Events**: n/a;
  - **Patches and adjustments**: the rows;
  - **Two sessions**: the `deleteToken` follow, gated by `activeGM.isSelf`, with finding -28's
    note;
  - **Extending**: a new feature file, a pure rule in core, a string in lang, CSS under `ppt-`;
  - **Pitfalls**: the core dialog id format, unrevealed destinations;
  - **Files**, **Tests**, **Sync**.
- `CHANGELOG.md` takes the 0.3.0, 0.4.0, 0.4.1 and 0.4.4 notes (and the U-6-13 / U-8-4 bullets,
  README lines 27-30, 37) out of the README.
- `context/foundry/README.md` line 59: extend the row with "destination cards, travel badges,
  party teleport (`pentaryn-portals`)" and link the module README.
- `scene-links.md`: a console table under Destination cards.

### W7 — Restart batch (with every module)

- `flags.pentaryn = { tier: "full", namespace: "portals", flagScope: "pentaryn-portals", cssPrefix: "ppt-", generation: 14, afterSync: [...] }`.
  `flagScope` is a declaration only: the code already writes `flags.pentaryn-portals`, so there is
  **no data migration**.
- `styles: ["styles/portals.css"]`; `recommends` item-piles with a `reason` (C09).
- **i18n (finding -29), shipped in this same sync:**
  - add `"languages"` to `module.json` and `lang/en.json` nested under `PENTARYN_PORTALS`;
  - the keys are the exact current English, with `{title}`, `{n}` and `{names}` placeholders;
  - the plural at `:632` [:571] becomes `Notify.PartyMovedOne` / `Notify.PartyMovedMany`;
  - the re-run's strings: `plainQuestion` (`:108`, `Dialog.Question` / `Dialog.QuestionNoToken`),
    `confirmParty` (`:600-610`, `Party.*`, with its own One/Many plural);
  - the settings get `PENTARYN_PORTALS.Setting.<key>.Name/Hint` (three rows);
  - the code calls `_loc("PENTARYN_PORTALS.…", data)` with full literal keys. The finding's local
    `t()` is not used, because C35 forbids a prefix wrapper.

  **Do not merge the `_loc` conversion before the `languages` entry is live.** Without it every
  string shows as a raw key on players' screens.

  Characterisation: finding -29's golden-string map (key → exact snapshot English). A format stub
  must reproduce the old template output for sample data.
- [declared] D-P2: every on-screen string goes through lang. Check visual parity on the dialog
  cards and the plain question, the hover, the GM menu, the party confirm, the PortalCard (both
  modes), the region config fieldset, the settings window and the notifications.

### ADJ — adjustments batch

Rows that do not wrap anything keep the registry's upstream-prefixed ids (`core-…`,
`itempiles-…`), like the existing `core-portals-relative-uuid`. C32 requires a `wrapMethod` for
every `portals-*` row, and portals has no patches. See the question for Joe in §6.

| Row id | Markers | Files | Absorbs |
|---|---|---|---|
| `core-teleport-dialog-cards` | `dialog-`, `select[name="destination"]` | `cards.mjs`, `scene-adapter.mjs` | -31 |
| `core-teleport-replacements-follow` | `replacements` | `party.mjs` | -31 |
| `core-region-config-portal-card` | `region-appearance` | `cards.mjs` | -31 |
| `itempiles-portals-pile-pc` | `isValidItemPile` | `scene-adapter.mjs` | C47 |
| `core-portals-relative-uuid` (existing) | unchanged | `portals-core.mjs`, `scene-adapter.mjs` | S3 |
| `portals-teleport-default-and-spread` (existing, adjustments.yml:884-893, added by the re-run) → **rename** `core-teleport-default-and-spread` | `data-action="yes"`, `:scope > p`, `spreadArrival` (was `preferTeleport`, `spreadArrival` — own names that never go stale) | `cards.mjs`, `party.mjs`, `portals-core.mjs` | C32 (fails live), -31 extension |

All rows: `modules: [pentaryn-portals]`, `check: make foundry-portals-check`. Add a
`core-canvas-fog-visibility` row (markers `isPointExplored`, `testVisibility`) only if Joe wants
the public-but-volatile canvas calls tracked. Finding -31 lists them; they are public API, so the
row is optional.

---

## 4. Findings that stay standalone (not structural)

Land these after S3 (they target the new files), each with its finding's characterisation written
first.

| Finding | Fix | Behaviour |
|---|---|---|
| **-24** | ~~`drawBadges` generation guard~~ — **landed in U-9-6 (`17275c9`)** as `drawRun`/`stale()`; do not redo it. Remaining: a 50 ms `foundry.utils.debounce` for the six region hooks only (`:910-912`); `setEditing`, `canvasReady` and `redraw` stay immediate. No relevance filter | **[declared] D-P3** (debounce only), needs a live test |
| **-27** (rest) | `confirmParty`'s silent `.catch(() => false)` gets a warn if S4 did not take it. Wrap the async UI listeners (`card-app.mjs` switches, field edits, snap, clear image, unlink, add destination; the Region-config snapshot button; the drag release) in `reg.guard(label, fn)` (pass-through). `createDirectory` gets a `.catch` that ignores only EEXIST. `snapshot` rejects with `portal snapshot: cannot load <src>`. Not the `_replaceHTML` `continue` | console only, no live test |
| **-28** | Inside `bringFollowers`, catch only "already exists" around `carryTo` and log `log.debug("followers already carried by another session")`; `carryTo` and `teleportParty` are untouched. Do **not** switch to `claimDocument` (finding -30): the keepId refusal already elects, and a claim would add a 750 ms wait | **[declared] D-P4**, two-session live test |
| **-32** | API additions as rows plus implementations: `regionOf`, `destinations(ref)`, `link(fromRef, toRef, {twoWay})` (GM, `ok/fail`), `unlink`, `badges()`; optional `inspect(regionRef)` (region flags + destinations). `cardFor(null)` → `null`. Since U-8-4: document `teleportParty`'s `{ confirm }` (an eval-js caller without `{confirm:false}` waits on a dialog in the bridge tab) and return `{ moved, cancelled }` | additions are neutral; `cardFor(null)` and the `teleportParty` return value are **[declared] D-P5** |
| **-36** | `recordOf(t, gmIds = …)`, computed once per `partyRecords` / `bringFollowers` pass | neutral (pinned record) |
| **-43** (new 2026-10-11) | one `isAoeHandle(tokenFlags, actorFlags)` in core, used by `recordOf` (no change) and `spreadArrival` (adds the actor-side branch) | **[declared] D-P6** (spreadArrival only), live check |
| **-38** | `isScenery` JSDoc pointing at a "Who checks for Markers and crowd" table in `context/foundry/markers.md`; no merge. use-doc §5.8 says the three predicates eventually become one export from the owning core; that is a cross-module item for later | docs + tests (pins in S1) |
| hygiene | `card-app.mjs` clear image: `{ [\`flags.${MODULE}.-=img\`]: null }` → `{ [flagPath(MODULE, "img")]: _del }` (use-doc §5.8 flags; `-=` is deprecated) | runtime-equivalent. It changes the `F.calls` payload, so re-pin in its own commit; the live check is the clear-image button |
| -30 | Nothing in portals: the kit's `election.mjs` provides `claimDocument`, the generalised claim | — |

The structural steps absorb -25, -26, -29 (W7), -31 (ADJ), -33, the C24 part of -27 and the
`describe` part of -32.

---

## 5. Declared changes needing a live test

| # | Change | Live check |
|---|---|---|
| D-P1 | Frozen API published synchronously at `ready`; kit members; ready events (S6) | Reload with the importer active: `game.pentaryn.portals.describe()` works, and `game.modules.get("pentaryn-portals").api === game.pentaryn.portals`. `open(region, {edit:true})` and `redraw()` still work |
| S7 | `pp-` → `ppt-` CSS rename | Visual parity, as a player and as GM: the teleport dialog with one and with several destinations, the badge hover, the GM right-click menu, the PortalCard in preview and in edit (switches, image tools, add destination), and the Region config fieldset |
| D-P2 | i18n (W7) | The same screens, plus the notifications (look at, party moved with 1 and with 3 tokens, followers brought, snapshot with no background) |
| D-P3 | 50 ms debounce of the region hooks (-24; the generation guard already shipped in U-9-6) | Cast a spell template: one badge per portal, no duplicates. In edit mode, drag a badge: it redraws on release. Create and delete a teleport behaviour: the badge appears and goes |
| D-P4 | Two-session follower carry (-28) | With the MCP bridge tab and a GM browser tab both open, a player walks a PC with a summon through a cross-scene link. The summon arrives once, with no "summons did not follow" warn and one toast |
| D-P5 | `cardFor(null)` → `null`; `teleportParty` returns `{ moved, cancelled }` (-32) | Console only: `game.pentaryn.portals.cardFor(null) === null`; `teleportParty(region, {confirm:false})` returns a count |
| D-P6 | `spreadArrival` ignores a handle flagged only on its actor (-43) | A PC crosses a portal onto a square holding an area handle: it stays on its square |

## 6. Decision for Joe

1. **Row ids for workarounds that do not wrap anything.** use-doc §5.6 says ids are prefixed
   `<short>-`, but C32 fails any `<short>-*` row that no `wrapMethod` names. The existing registry
   already uses upstream-prefixed ids for non-patch rows (`core-portals-relative-uuid`,
   `core-region-placement-escape`). Two options:
   - **Recommended:** keep that convention and reserve `<short>-` for patch rows. This is a
     one-line clarification in the use-doc §5.6. (Since the re-run this is no longer theoretical:
     `portals-teleport-default-and-spread` fails C32 on the live tree.)
   - Alternatively, relax C32 to the rows whose markers match a patch.
2. **Lifting WAIT** on portals: only Joe can confirm (wait.json).

## 7. Effort

| Step | Effort |
|---|---|
| S1 characterise (PIXI / AppV2 stubs, about 20 glue cases) | M–L |
| S2 pure extraction | M |
| S3 split | L |
| S4 logging, S5 settings, S6 API | S each |
| S7 CSS rename | S |
| S8 docs | S |
| W7 i18n (-29) | M |
| Standalone -24 (debounce only) / -27 / -28 / -32 / -36 / -38 / -43 | M in total |
| **Total** | **L: about 3.5–4 agent-days, plus re-anchoring and one live-test pass (D-P1 to D-P5, S7)** |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module portals --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
