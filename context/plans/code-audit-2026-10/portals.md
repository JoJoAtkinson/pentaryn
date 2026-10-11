---
title: "Code audit 2026-10 — pentaryn-portals"
status: active
last_modified: 2026-10-11
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-portals

**Read this when:** you are about to refactor, harden or document pentaryn-portals and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

> **Re-anchored to `4e64f47` on 2026-10-11.** Every **Where**/**Anchor** below now points at HEAD `4e64f47` (the working tree equals HEAD for this module); snapshot lines (= `ee505c2`) follow in brackets. The usability re-run (`17275c9`; ledger [`../usability-changes-2026-10.md`](../usability-changes-2026-10.md) U-6-13, U-8-4, U-9-6) took portals from 0.4.2 to 0.4.4 and portals.mjs from 850 to 966 lines: `plainQuestion` (101-109), the `drawRun` generation guard in `drawBadges` (234, 262-271, 325, 915), `recordOf` `name`/`handle` (533, 543), `partyRecords` replacing `partyTokens` (553-555), `landingPlaces(…, party)` / `carryTo(…, party)` (561-591), `confirmParty` (597-613), `teleportParty(region, {confirm})` (615-633), `spreadArrival` (663-680, called from `bringFollowers` at 692), `preferTeleport` (927-936), three world settings with plain-English labels (`SETTINGS`/`setting()`/`Hooks.once("init")`, 939-954), `api.spreadArrival` (962), and core `leaderOf`/`assignSpots`/`partyPreview`/`crowded` (portals-core.mjs 65-136, 213-215). Adjustments row `portals-teleport-default-and-spread` (adjustments.yml:884-893) was added.

| Id | Re-anchor status (HEAD `4e64f47`) |
|---|---|
| aoe-movement-portals-24 | **partly resolved by U-9-6 (`17275c9`)** — the generation guard (`drawRun`/`stale()`) landed; the 50 ms debounce of the six region hooks (910-912) is still open |
| aoe-movement-portals-36 | re-anchored — portals.mjs:526-546; record gained `name` and `handle`; still one GM scan per record |
| aoe-movement-portals-26 | re-anchored — portals.mjs:485-491; extended: `plainQuestion` (101-109) parses the dialog id a second way |
| aoe-movement-portals-29 | re-anchored — portals.mjs:187; extended: the re-run added about 15 more English literals (settings, party confirm, plain question) |
| aoe-movement-portals-38 | re-anchored — portals-core.mjs:31-34 |
| aoe-movement-portals-25 | re-anchored — portals.mjs:29-30; the file is now 966 lines and nine concerns |
| aoe-movement-portals-27 | re-anchored — portals.mjs:300; extended: a new bare `catch {}` at 325 and `confirmParty`'s `.catch(() => false)` (612) |
| aoe-movement-portals-28 | re-anchored — portals.mjs:584-591; extended: `spreadArrival` also runs in both GM sessions |
| aoe-movement-portals-32 | re-anchored — portals.mjs:962; extended: `teleportParty` now opens a confirm dialog by default, which blocks an eval-js caller |
| aoe-movement-portals-31 | re-anchored — portals.mjs:57-64; extended: `preferTeleport`/`plainQuestion` read core DialogV2 DOM; the new row names our functions, not those internals, and fails C32 |
| aoe-movement-portals-33 | re-anchored — README.md:3 (39 lines now) |
| aoe-movement-portals-43 | **new** (re-run code) — two hand copies of pentaryn-aoe's handle predicate inside portals that disagree with each other and with aoe |

> **Wave 3 status (2026-10-11, branch `migrate/wave-3`, code phase — nothing synced).** Every
> finding below is applied; the guide's Result section has the details and the live checks.

| Id | Status | Commit(s) |
|---|---|---|
| aoe-movement-portals-24 | change 2 (debounce) landed, **[declared] D-P3** | `0f06790a` |
| aoe-movement-portals-25 | split into entry, core, adapter, three features, the card window, settings | `f6bbd2dc` |
| aoe-movement-portals-26 | core helpers (`dialogIdParts`, `translateShapes`, `cropWindow`, `blockingWallCoords`, `tokenBox`, `occupiedBy`, `samplePoints`, `cardData`) against a verbatim oracle | `a5a52410`, `ff66ad35` |
| aoe-movement-portals-27 | C24 part `38c366fd`; guarded UI listeners + EEXIST-only folder `6d2785e4`; snapshot message **[declared]** `6b892145`; unawaited badge draws `09ec04f9`, GM badge menu guarded `7f50014c` | |
| aoe-movement-portals-28 | **[declared] D-P4** | `0fe9e4b8` |
| aoe-movement-portals-29 | open — Wave 7 (needs `languages` in `module.json`) | — |
| aoe-movement-portals-31 | open — the ADJ batch (rows and file lists handed to the integrator) | — |
| aoe-movement-portals-32 | `describe()` `bf362fd4` + `d132395c`; additions (`inspect`, `destinations`, `link`, `unlink`, `badges`) `fe8938fe`; **[declared] D-P5** `59a1e99b`, `413fed02`. Not done: `spreadArrival → { moved, to }`, `teleportParty(ref, { from })`; existing rows accept refs (`regionOf`): not done — guide S6 keeps today's document params (legacy rows), so `cardFor`, `lookAt`, `teleportParty` and `open` still take documents only and `regionOf` is unpublished | |
| aoe-movement-portals-33 | README in §7 order, CHANGELOG; the README/API guard as a module test (`test/readme.test.mjs`) | `186cdfb1`, `14f86c48` |
| aoe-movement-portals-36 | `recordOf(t, { gmIds })`; README note on the pile probe (unifying: open for Joe) | `477e39e2`, `24cc1b58` |
| aoe-movement-portals-38 | JSDoc `b87d8c15`; the markers.md table handed to the integrator | |
| aoe-movement-portals-43 | `isAoeHandle` `ae936c07`; **[declared] D-P6** `8a060d21` | |

## Summary

### pentaryn-portals

**Purpose.**

Replaces the Teleport Token confirmation dialog's text or select with destination cards stored on the destination region. Also provides:
- GM authoring in the Region config, plus a map-snapshot cropper.
- Interface-layer badges that show once a player has seen them, with hover cards, a GM right-click menu and drag-to-move.
- GM Teleport party.
- Summons that follow a PC through a cross-scene link.
- A PortalCard window for preview and editing, which can link and unlink destinations.

**Health.**

Weakest organisation of the three:
- One 850-line glue file mixes 7 concerns (966 lines at `4e64f47`, plus settings and arrival spreading).
- portals-core.mjs (128 lines, 34 checks) covers only party selection, landing rings and relative UUIDs. Snapshot crop math, shape translation, the wall filter and dialog-id parsing are pure but embedded in the glue.
- No lang file: about 40 hardcoded English strings (about 55 at `4e64f47`).
- CSS `.pp-` prefix is shared with prompts, and four selectors are unscoped.
- drawBadges is async, fires on 6 region/behaviour hooks with no filter, debounce or generation guard, and appends into a shared array, so overlapping rebuilds can leave destroyed badges in the hit-test list. *(2026-10-11: the generation guard landed in U-9-6; the debounce did not.)*
- Six swallowed catches.
- The README (33 lines) is a flat bullet list that mixes use and internals.

**LLM interface.**

Today:
- `game.pentaryn.portals` through eval-js (31 log hits).
- The API takes documents only, except snapshot.
- teleportParty moves from the bridge tab's canvas.scene.
- There is no read of destinations or badges.
- No link/unlink, even though linkRegions exists internally. The log shows LLM evals building teleportToken links by hand-creating behaviours.

Should be:
- `regionOf(ref)` accepting a doc or uuid on every entry point.
- `destinations(ref)`, `link(from, to, {twoWay})`, `unlink(from, to)` and `badges()`.
- `teleportParty(ref, {from})`.
- `describe()`.
- Use-doc remains scene-links.md, which gets a console table.

**How to extend.**

There is nowhere obvious today: everything goes into portals.mjs.

After the proposed split:
- cards.mjs (dialog and config card)
- snapshot.mjs
- badges.mjs
- party.mjs (teleportParty, follow-on-teleport)
- card-app.mjs (PortalCard, linking)
- api.mjs

Pure rules go in portals-core.mjs. New strings go in a new lang/en.json under PENTARYN_PORTALS.*. New CSS is scoped under `.pentaryn-portals`. Any new reliance on core teleport internals gets an adjustments row.

Cross-listed: `aoe-movement-portals-30` (generalise `claimMessage` to `claimDocument`) affects both pentaryn-aoe and pentaryn-portals; it lives in [`aoe.md`](aoe.md).

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| aoe-movement-portals-24 | Performance gains | high | M | Overlapping async badge rebuilds duplicate and corrupt the badge list; every region/behaviour change rebuilds unthrottled |
| aoe-movement-portals-36 | Performance gains | low | S | recordOf recomputes the GM list for every token |
| aoe-movement-portals-26 | Maintainability gains | medium | M | Pure geometry and parsing live in glue with no tests |
| aoe-movement-portals-29 | Maintainability gains | low | M | No lang file: about 40 hardcoded English UI strings |
| aoe-movement-portals-38 | Maintainability gains | low | S | "Is this a Marker or crowd token" is decided differently in portals, prompts and aoe; the contract is undocumented |
| aoe-movement-portals-25 | Defragmentation | medium | L | One 850-line glue file holds seven unrelated features |
| aoe-movement-portals-27 | Logging / auditability gains | medium | S | Swallowed errors including broken card images, plus unhandled rejections in async UI handlers |
| aoe-movement-portals-28 | Hardening | low | S | Two GM sessions on one account both carry followers; the loser logs a false "summons did not follow" |
| aoe-movement-portals-32 | LLM interface | high | M | No link/unlink or destinations API, so callers hand-build teleport behaviours; most entry points take documents only |
| aoe-movement-portals-31 | Documentation / skills | medium | S | Portals depends on core teleport internals with only one adjustments row |
| aoe-movement-portals-33 | Documentation / skills | low | S | Flat README mixing use and internals; portals is not named in the routing row for scene links |
| aoe-movement-portals-43 | Defragmentation | low | S | Two hand copies of pentaryn-aoe's handle predicate in portals disagree with each other and with aoe |

## Performance gains

### aoe-movement-portals-24 — Overlapping async badge rebuilds duplicate and corrupt the badge list; every region/behaviour change rebuilds unthrottled

**Category:** Performance gains · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-portals/portals.mjs:261–330` (snapshot 237-302)

**Anchor:** `async function drawBadges() {`

**Status (2026-10-11): partly resolved by U-9-6 (`17275c9`, portals 0.4.4).** Proposed change 1 (generation guard) landed in a different shape: `let drawRun = 0` (234); each call takes `const run = ++drawRun` (262), nulls `badgeLayer` and builds into a local `layer` (267-270); `stale = () => run !== drawRun || layer.destroyed || !canvas?.ready` (271) is checked before each `layer.addChild(c)` (325), and a stale draw destroys its half-built container and returns; `canvasTearDown` bumps `drawRun` (915). Badges are pushed into the shared `badges` array only by the live run, so the duplicate/destroyed-entry bug below no longer reproduces. **Still open:** change 2, the debounce: lines 910-912 still call `drawBadges()` on every Region/RegionBehavior create/update/delete, each rebuilding every badge (each aborted run also wastes its texture loads). The text below is the snapshot description, kept for history.

**Current (snapshot).**

Lines 829-831 (HEAD 910-912) call drawBadges() on create/update/delete of any Region or RegionBehavior with no throttle; each call destroys badgeLayer and rebuilds every badge. One spell template already causes at least 3 rebuilds per client (createRegion, aoe's ownership update areas.mjs:364 [snap :354], aoe's attachment write areas.mjs:177), and the PortalCard switch loop awaits one update per behaviour (portals.mjs 843-848 [snap ~762-767]). drawBadges is async (awaits foundry.canvas.loadTexture, line 290 [snap 263]) and uses module-level badgeLayer/badges. When call B starts while A is suspended on a texture, B resets badges.length and replaces badgeLayer; A then resumes, adds its container to B's layer (badgeLayer.addChild(c)) and pushes into the shared array: a duplicated visible badge, and badgeAt/refreshBadgeSight work on stale or duplicate entries.

**Proposed.**

*(2026-10-11: change 1 is done by U-9-6 — do not redo it; land only change 2.)* Two changes only. 1) Generation guard: let drawGen = 0; at the top const gen = ++drawGen; build into a local layer and local next[]; after every await: if (gen !== drawGen) { layer.destroy({ children: true }); return; }; at the end destroy the old badgeLayer, then badgeLayer = layer; badges.splice(0, badges.length, ...next); refreshBadgeSight(). 2) const queueDraw = foundry.utils.debounce(() => drawBadges(), 50) used by the six Region/RegionBehavior hooks (line 910-912 [snap 829-831]); setEditing, the canvasReady hook and api.redraw stay immediate. Do NOT add a relevance filter: a badge shows its DESTINATION region's card (cardFor(dests[0].region) reads that region's flags, name and scene thumb), so an update to a region on another scene or to a non-teleport region can legitimately change a badge here and must still redraw.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs (portals.mjs imports in node with globalThis.Hooks = {on(){},once(){}} and foundry = { utils:{debounce:f=>f}, applications:{api:{ApplicationV2:class{}}} }; export drawBadges and badges via an _internals object). Stub PIXI (Container with children/addChild/destroy/position/alpha, chainable Graphics, Sprite, Text), canvas = { ready:true, scene:{ regions:[R1] }, interface:{ addChild(){} }, grid:{size:100} }, a region with a teleportToken behaviour whose destination resolves via fromUuidSync, and foundry.canvas.loadTexture resolving after 10 ms for the first call only. Characterise first: start drawBadges() twice without awaiting; ~~today the count of live (non-destroyed) badge containers added to the final layer is 2 per region (pin as the bug reproduction)~~ — *since U-9-6 this already gives the fixed result, so pin it as plain characterisation:* Promise.all both; badges.length equals the region count (1), badgeLayer.children.length === 1, and no entry has a destroyed container. Also pin U-9-6's teardown case: start drawBadges(), fire the canvasTearDown handler before the texture resolves, resolve it → no addChild on the old layer, no throw, badges.length 0. For the remaining debounce (change 2): with foundry.utils.debounce stubbed as a fake-timer debounce, fire updateRegion three times within 50 ms → drawBadges runs once; canvasReady and api.redraw still run it immediately. A single drawBadges() call yields identical badge x, y, r, alpha to today (x = 150, y = 200 - 36*0.55 = 180.2, r = 36 for bounds {x:100,y:200,width:100,height:100}; hidden region alpha 0.35).

**Risk.** The 50 ms debounce delays hook-driven redraws invisibly; live-check that Edit-mode drag still redraws on release (moveRegion calls drawBadges directly only when nothing moved). The generation guard (now landed) cannot change a single uncontended draw, which the characterisation pins.

**Related:** aoe-movement-portals-25, aoe-movement-portals-26

### aoe-movement-portals-36 — recordOf recomputes the GM list for every token

**Category:** Performance gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals.mjs:526–546` (snapshot 498-515)

**Anchor:** `function recordOf(t) {`

**Current.**

recordOf runs for every token in partyRecords (553-555, was partyTokens; scene.tokens.map(recordOf)) and twice in bringFollowers (689, 697); each call runs game.users.filter(u => u.isGM).map(u => u.id) (528), 60 scans on a 60-token scene. Since the re-run the record also carries `name` (533) and `handle` (543). Its Item Piles test (line 530 [snap 502]) calls isValidItemPile(actor) with no flag fallback while aoe/resolve.mjs:57-62 (snap 56-61) passes the TokenDocument and falls back to flags; the difference is intentional-or-accidental and undocumented.

**Proposed.**

function recordOf(t, gmIds = game.users.filter(u => u.isGM).map(u => u.id)); compute gmIds once in partyRecords and bringFollowers and pass it. Leave the pile test as is, adding a code comment and README note that the two detections differ (aoe excludes creatures and tolerates a false positive; portals must not leave a pile-PC behind). Unifying them is a behaviour decision for Joe, not this refactor.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs; export recordOf as _recordOf. Stubs: let n=0; globalThis.game = { users:{ filter:f=>{ n++; return [{id:'gm',isGM:true},{id:'p1',isGM:false}].filter(f); } }, itempiles: undefined }; token t = { id:'t', actorLink:true, name:'Caven', actor:{ id:'CAV', type:'character', name:'Caven', ownership:{default:0,gm:3,p1:3}, folder:null, getFlag:()=>undefined } }. Pin the record WITHOUT its `doc` field (destructure it out; doc is the token itself; at `4e64f47` give t `flags:{}`): { id:'t', name:'Caven', actorId:'CAV', type:'character', linked:true, pile:false, excluded:false, owners:['p1'], summoner:null, polymorphed:false, handle:false }. After the change identical output with an explicit ['gm'] argument; and n is 1 per partyRecords pass instead of one per token (call partyRecords via _internals with a 3-token scene stub).

**Risk.** Defaulting the parameter keeps direct callers correct; pinned record proves identical output.

**Related:** aoe-movement-portals-2

## Maintainability gains

### aoe-movement-portals-26 — Pure geometry and parsing live in glue with no tests

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M

**Where:** `foundry/module/pentaryn-portals/portals.mjs:485–491` (snapshot 457-463)

**Anchor:** `  const shapes = region.shapes.map(sh => {`

**Current.**

Untested logic needing no Foundry: moveRegion shape translation (485-491 [snap 457-463]), snapshot crop math (130-159 [snap 113-142]), the landing wall filter w.move > 0 && !(w.door > 0 && w.ds === 1) and the occupied test (landingPlaces 565-570 [snap ~531-536]), dialog-id parsing in behaviorOf (57-64), samplePoints reading the global canvas.grid.size (333-340 [snap 305-312]), cardFor's fallback chain (37-46). portals-core.mjs tests cover party selection, rings and UUID helpers, plus (since the re-run) `leaderOf`, `assignSpots`, `partyPreview` and `crowded` — the re-run put its new pure rules in core, as this finding asks. **Extended 2026-10-11:** the re-run's `plainQuestion` (101-109) parses the same dialog id a second way — `(app?.id ?? "").slice(lastIndexOf("-") + 1)` (105) for the token id — next to behaviorOf's own parse; and `spreadArrival`'s box building (671-672) is a third copy of the token-box shape `landingPlaces` builds at 567-568.

**Proposed.**

Move to portals-core.mjs (pure), glue keeps I/O: translateShapes(shapes, sx, sy); cropWindow({ cx, cy, dims:{sceneX,sceneY,sceneWidth,sceneHeight,size}, natural:{w,h}, squaresWide, squaresHigh, outW = 480 }) returning { x, y, w, h, outW, outH, mx, my, markR }; blockingWallCoords(walls); occupiedBy(standing); behaviorUuidFromDialogId(id) — extended to `dialogIdParts(id)` → `{ behaviorUuid, tokenId }` so behaviorOf and plainQuestion share one parse; tokenBox(t, g); samplePoints(b, gridSize); cardData({ flags, sceneNavName, sceneName, sceneThumb, regionName, uuid }). behaviorOf keeps its `behavior?.type === 'teleportToken'` check in the glue.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs; expected values computed by hand from the current code. translateShapes([{type:'rectangle',x:100,y:200,width:100,height:100},{type:'polygon',points:[0,0,10,0,10,10]},{type:'circle',x:null,y:5}], 50, -25): rect x150 y175; polygon [50,-25,60,-25,60,-15]; circle x null kept, y -20; input not mutated. cropWindow({cx:1000,cy:800,dims:{sceneX:200,sceneY:100,sceneWidth:4000,sceneHeight:3000,size:100},natural:{w:2000,h:1500},squaresWide:8,squaresHigh:5}) = { x:200, y:225, w:400, h:250, outW:480, outH:300, mx:240, my:150, markR:27 }; a centre at (200,100) clamps x and y to 0. blockingWallCoords([{move:20,door:0,ds:0,c:[0,0,1,1]},{move:0,c:[9,9,9,9]},{move:20,door:1,ds:1,c:[2,2,3,3]},{move:20,door:1,ds:0,c:[4,4,5,5]},{move:20,door:2,ds:1,c:[6,6,7,7]}]) = [[0,0,1,1],[4,4,5,5]]. behaviorUuidFromDialogId('dialog-Scene.S.Region.R.RegionBehavior.B-tok1') = 'Scene.S.Region.R.RegionBehavior.B'; 'dialog-abc' -> null; 'x-Scene.S.Region.R.RegionBehavior.B-t' -> null. dialogIdParts('dialog-Scene.S.Region.R.RegionBehavior.B-tok1') = { behaviorUuid:'Scene.S.Region.R.RegionBehavior.B', tokenId:'tok1' } (the tokenId equals today's plainQuestion slice for the same id); dialogIdParts('dialog-abc') = null. tokenBox({x:100,y:200,width:2,height:1},100) = {x:100,y:200,w:200,h:100}. samplePoints({x:0,y:0,width:100,height:100},100) = [{50,50},{25,25},{75,25},{25,75},{75,75}]; a 40x200 region with g 100 gives q = 10. cardData({flags:{title:'  '},sceneNavName:'Pit',sceneThumb:'t.webp',regionName:'R',uuid:'U'}) = {uuid:'U',title:'Pit',img:'t.webp',description:''}; with no scene it falls back to the region name and 'icons/svg/door-exit.svg'.

**Risk.** An off-by-one in the crop clamp would shift thumbnails; the pinned numbers cover interior and clamped cases.

**Related:** aoe-movement-portals-25, aoe-movement-portals-24

### aoe-movement-portals-29 — No lang file: about 40 hardcoded English UI strings

**Category:** Maintainability gains · **Impact:** low · **Effort:** M

**Where:** `foundry/module/pentaryn-portals/portals.mjs:187` (snapshot 170)

**Anchor:** `    <legend>Portal card</legend>`

**Current.**

Hardcoded strings across portals.mjs (HEAD lines; snapshot in brackets): notifications (128, 514, 632, 711 [~111, 486, 571, 630], including a hand-rolled plural at 632 [571]), context-menu labels (393-398 [365-370]), the Region-config fieldset (187-195 [170-178]), the unrevealed hover text (375 [347]), PortalCard title/hints/tooltips (755, 776, 783-831, 896 [674, 695, 702-750, 815]). **Extended 2026-10-11 — the re-run added more:** the player-facing question rewrite in plainQuestion (108: `Teleport ${who} to ${card.title}?` / `Teleport to ${card.title}?`), which also *replaces core's localized question* with English; confirmParty's warn (600), title, body with a hand-rolled plural, "lands beside"/"follower" and button labels (603-610); and the three settings' names and hints in `SETTINGS` (939-946), plain English by design ("this module ships no language file", comment at 938). The scorer's C36 count went from 8 to 12 literals. module.json declares no languages, so scripts/foundry/ops i18n gate (modules._check_i18n returns OK when there is no lang dir) checks nothing here and a wording change means editing template literals inside logic.

**Proposed.**

Add foundry/module/pentaryn-portals/lang/en.json nested PENTARYN_PORTALS.{Config,Menu,Notify,Card,Hover}.*, each value the exact current English with {title}/{n}/{names} placeholders; add "languages":[{"lang":"en","name":"English","path":"lang/en.json"}] to module.json; define a local const t in portals.mjs (the jsscan wrapper detector finds a per-file `const t = ... game.i18n...(`PENTARYN_PORTALS.${key}`)` definition) and replace each literal; plural at 632 [snap 571] becomes Notify.PartyMovedOne / Notify.PartyMovedMany; the re-run strings get Dialog.Question / Dialog.QuestionNoToken ({name}, {title}), Party.* (Confirm title/body One/Many, LandsBeside {name}, Follower, Nobody, Teleport, Cancel) and Setting.<key>.Name/Hint for teleportDefault, spreadArrivals, confirmPartyTeleport. module.json is read at startup: add the restart line to the portals after_sync in scripts/foundry/ops/config.py (already says restart on first install).

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs golden-string test: JSON.parse(readFileSync('../lang/en.json')), flatten, assert a pinned key->literal map copied verbatim from the snapshot lines (e.g. Config.Legend = 'Portal card', Hover.Unknown.Title = 'A way onward', Hover.Unknown.Text = "You can't tell where it leads.", Menu.Preview = 'Preview card (player view)'; and from the re-run: Dialog.Question = 'Teleport {name} to {title}?', Party.LandsBeside = 'lands beside {name}', Setting.teleportDefault.Name = 'Teleport is the default answer'). A format stub (k,d)=>en[k].replace(/\{(\w+)\}/g,(_,x)=>d[x]) must reproduce the old template output for sample data. make foundry-portals-check then runs the i18n gate for real and must report no missing keys.

**Risk.** A missed placeholder shows {title} literally (the golden format test catches it); forgetting the restart leaves keys unlocalised.

**Related:** aoe-movement-portals-25

### aoe-movement-portals-38 — "Is this a Marker or crowd token" is decided differently in portals, prompts and aoe; the contract is undocumented

**Category:** Maintainability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals-core.mjs:31–34` (snapshot 30-33)

**Anchor:** `export function isScenery({ name = "", folders = [] } = {}) {`

**Current.**

portals-core.mjs:31-34 isScenery: name containing (crowd) or starting 'Marker' + optional whitespace + middle dot, or a folder starting Crowd, Markers or Temp Markers. pentaryn-prompts/model.mjs:21-30 isScaffold: actor name must start 'Marker · ' (space required), walks the folder chain to Temp Markers/Markers, stops at its own FOLDER_NAME, ignores crowd. aoe core.isCreature excludes by hpMax <= 0. Three valid but different contracts for one convention, none cross-referenced (context/foundry/markers.md has no such table).

**Proposed.**

Do not merge. Add a 'Who checks for Markers and crowd' table to context/foundry/markers.md listing the three predicates with file:line and exact rules, and add a JSDoc line on isScenery pointing to it. Rename only if a larger portals split happens anyway.

**Behaviour test recipe (write first, must pass before and after).**

Existing isScenery checks in foundry/module/pentaryn-portals/test/run.mjs (lines 31-36 [snap 30-35]) pin the current rules. Add edge pins: isScenery({name:'Marker·4'}) === true (no space: portals accepts, prompts would not); isScenery({name:'x',folders:['Scene Props','Markers — Red']}) === true; isScenery({name:'Crowded Hall'}) === false.

**Risk.** Docs and tests only.

**Related:** aoe-movement-portals-36

## Defragmentation

### aoe-movement-portals-25 — One 850-line glue file holds seven unrelated features

**Category:** Defragmentation · **Impact:** medium · **Effort:** L

**Where:** `foundry/module/pentaryn-portals/portals.mjs:29–30` (line 30 now ends `crowded, assignSpots, partyPreview } from "./portals-core.mjs";`)

**Anchor:** `import { summonerActorId, playerOwners, isScenery, partySelection, followersOf, ringSpots, wallBlocker,`

**Current.**

portals.mjs (966 lines at `4e64f47`, was 850) mixes: teleport-dialog card decoration (36-109 incl. plainQuestion [36-92]), snapshot cropper with upload (115-170 [98-153]), Region-config injection (176-207 [159-190]), the badge layer with sight gating, hover tip, GM menu and drag-to-move (213-495 [196-467]), GM lookAt/teleportParty with the party confirm (501-633 [473-572]), summons following through a native teleport plus arrival spreading (639-727 [578-646]), the PortalCard ApplicationV2 with linking (733-906 [652-825]), plus hooks, the dialog focus tweak, the settings block and the api (910-966 [829-850]). Nothing guides where a new portal feature goes (aoe uses a Part-per-file layout).

**Proposed.**

Pure moves, no logic change: cards.mjs (cardFor, cardHTML, esc, behaviorOf, decorate, plainQuestion, preferTeleport, injectConfig), snapshot.mjs (snapshot, SNAP_DIR), badges.mjs (badge state incl. drawRun and drawing, hover tip, menu, bindBoard, drag, moveRegion), party.mjs (folderNames, recordOf, partyRecords, landingPlaces, carryTo, confirmParty, lookAt, teleportParty, cameThroughPortal, spreadArrival, bringFollowers, installFollow() registering the deleteToken hook), settings.mjs (SETTINGS, setting, the init registration), card-app.mjs (linkRegions, PortalCard), portals.mjs entry only (imports, hooks, api). Break the badges -> party/card-app cycle with setMenuActions({...}) called from the entry. Shared mutable state (badges, badgeLayer, drawRun, editing, tip, menu, drag) lives in exactly one module. Add a README file table. Land after aoe-movement-portals-24 and -26, and update adjustments.yml `files` (aoe-movement-portals-31) in the same change.

**Behaviour test recipe (write first, must pass before and after).**

Gates: make foundry-portals-check (parse, imports, i18n, node-test), node --check on each new file; the 34 existing checks in test/run.mjs are unchanged (verified passing in the snapshot). Land the pure extractions of aoe-movement-portals-26 first so moved logic is already pinned. Add an import smoke test with globalThis.Hooks = {on(){},once(){}} and foundry = { applications:{api:{ApplicationV2:class{}}}, utils:{debounce:f=>f, escapeHTML:s=>s} } that imports each new file and asserts the expected named exports, and that the Hooks registration names/count from importing the entry equal a capture taken before the split (13 at the snapshot; **14 at `4e64f47`** — the re-run added `once init` at 950).

**Risk.** Copied `let` state would split it across modules; the smoke test plus a live hover/drag/right-click pass on one scene catch it. Hook registration order across files must match the pre-split capture.

**Related:** aoe-movement-portals-26, aoe-movement-portals-24, aoe-movement-portals-28

## Logging / auditability gains

### aoe-movement-portals-27 — Swallowed errors including broken card images, plus unhandled rejections in async UI handlers

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals.mjs:300` (snapshot 273)

**Anchor:** `      } catch {}`

**Current.**

Line 300 [273] drops a failed loadTexture for a card image, so a broken flags.pentaryn-portals.img path silently loses the badge picture. Bare catches also at 263 [238], 530 [502] (isValidItemPile) and 658 [597]; line 164 [147] swallows every createDirectory error (EEXIST is expected, permission failure is not). Async listeners without a catch (an update failure becomes untagged 'Uncaught (in promise)'): Region-config snapshot button (~198 [~181]), badge drag release (~450 [~422]), PortalCard switches (843-848 [~762-767]), field edits (~858 [~777]), snap (~860 [~779]), clear image (~868 [~787]), unlink (~870 [~789]), add destination (~879 [~798]). snapshot() rejects on image onerror (line 139 [122]) with no message. **Extended 2026-10-11 (re-run code):** U-9-6 added another bare catch, `try { c.destroy({ children: true }); } catch {}` on the stale-draw path (325); confirmParty ends `DialogV2.confirm({...}).catch(() => false)` (612), so a dialog that fails to render reads as "Cancel" with no trace. The re-run's other new catches log (692 `arrival spread skipped`, 921 `dialog focus skipped`). The scorer's C24 now lists 263, 300, 325, 530, 658.

**Proposed.**

Add a local guard(label, fn) (copy of aoe/hooks.mjs:23 with prefix 'pentaryn-portals') and wrap every listed listener. Line 273: catch (err) { warnOnce(`card image ${first.img}`, err); } using the makeWarnOnce helper (aoe-movement-portals-20, copied or vendored). Line 147: .catch(err => /EEXIST|exists/i.test(err?.message ?? '') ? null : console.warn(`${MODULE} | create dir`, err)). Lines 263, 325 and 658 [238, 597]: console.debug with the prefix. Line 612: `.catch(err => { console.warn(`${MODULE} | party confirm failed`, err); return false; })` (same return value). In snapshot, reject with new Error(`portal snapshot: cannot load ${src}`). Do NOT add the `if (!dest) continue` skip in _replaceHTML: it would change click behaviour on a vanished destination.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs: the copied guard gets the same characterisation as aoe-movement-portals-9 (sync value passes through; sync throw returns undefined and logs 'pentaryn-portals | label'; async rejection logs after a microtask). warnOnce: two calls with the same image path give one console.warn. snapshot error: with an Image stub whose onerror fires, snapshot(regionStub) rejects with an Error whose message contains the src. confirmParty: with `foundry.applications.api.DialogV2.confirm` stubbed to reject, confirmParty(party,'Pit') resolves false before and after (pin), and after the change exactly one console.warn starting `pentaryn-portals | party confirm failed`.

**Risk.** Only adds console output and wraps listeners whose return values the browser ignores.

**Related:** aoe-movement-portals-9, aoe-movement-portals-20

## Hardening

### aoe-movement-portals-28 — Two GM sessions on one account both carry followers; the loser logs a false "summons did not follow"

**Category:** Hardening · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals.mjs:584–591` (snapshot 547-554)

**Anchor:** `async function carryTo(toks, dest, cx, cy, party = null) {` (snapshot: `async function carryTo(toks, dest, cx, cy) {`)

**Current.**

The deleteToken follower hook (lines 715-727 [634-646]) gates on game.users.activeGM?.isSelf, so both tabs run bringFollowers and carryTo. carryTo creates with keepId: true, so the server accepts one create; the loser throws 'already exists' before its delete (correct) but the error reaches .catch(err => console.warn(`${MODULE} | summons did not follow`, err)) at line 726 [645], a false alarm during live testing. Same two-session problem aoe documents (README line 100 [87]) and handles in areas.mjs:168-170. teleportParty also uses carryTo but is GM-initiated from one tab. **Extended 2026-10-11:** the re-run's `spreadArrival` (663-680) runs inside bringFollowers (692) before the carry, so both sessions also issue `arrived.update(place, {teleport:true, animate:false})`; both compute the same square, so the result is right but the PC is written twice, and the losing session's update can land after the winner's followers have taken nearby squares (it still moves to the square it computed before they arrived).

**Proposed.**

Leave carryTo and teleportParty untouched (so a real create failure from teleportParty still surfaces). In bringFollowers wrap only its carryTo call (709 at `4e64f47`): try { await carryTo(followers, dest, cx, cy); } catch (err) { if (/already exists/i.test(err?.message ?? '')) { console.debug(`${MODULE} | followers already carried by another session`); continue; } throw err; } and skip the notification on that path. Document the election in the README next to a 'Two sessions' section.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs. Export bringFollowers via _internals. Stubs: globalThis.CONST = { GRID_SNAPPING_MODES:{TOP_LEFT_VERTEX:0} }; globalThis.ui = { notifications:{ info:m=>notes.push(m) } }; dest = { grid:{size:100,getSnappedPoint:p=>p}, walls:[], tokens:[], navName:'Pit', createEmbeddedDocuments: async (t,d,o)=>{ log.push(['create',d.map(x=>x._id),o]); } }; a follower token with toObject, parent scene whose deleteEmbeddedDocuments logs ['del', ids]; leader/arrived/replacements fixtures per bringFollowers' shape (a character token recorded via recordOf, cameThroughPortal satisfied by a region stub with testPoint true and a teleportToken destination in dest). At `4e64f47` also stub `game.settings.get` (or leave it throwing: `setting('spreadArrivals')` then falls back to true) and give `arrived` a `parent` whose `tokens` hold no other token, so spreadArrival returns without an update. Pin today's order and notification: log deep-equals [['create',['s1'],{keepId:true}],['del',['s1']]] and one 'brought' notification. With create throwing new Error('Token s1 already exists'): before the change bringFollowers rejects (pin); after, it resolves, log has no 'del', no notification. Any other error still rejects.

**Risk.** A genuine failure whose message contains 'already exists' would be treated as a lost race; same assumption aoe's createHandle makes.

**Related:** aoe-movement-portals-30

## LLM interface

### aoe-movement-portals-32 — No link/unlink or destinations API, so callers hand-build teleport behaviours; most entry points take documents only

**Category:** LLM interface · **Impact:** high · **Effort:** M

**Where:** `foundry/module/pentaryn-portals/portals.mjs:962` (snapshot 846)

**Anchor:** `  const api = { snapshot, cardFor, teleportParty, lookAt, open: PortalCard.open, redraw: drawBadges, spreadArrival };`

**Current.**

linkRegions(from, to) (portals.mjs:737 [656]) holds the exact defaults the GM UI uses (choice, revealed, fade 1500, placement center, snap) but is not exposed; neither are destinationsOf (252 [228]) or the unlink logic (870-876 [789-795], withoutDestination). cardFor, lookAt and teleportParty take documents only (only snapshot accepts a uuid); cardFor(null) throws a TypeError because region.uuid is read unguarded (line 41); teleportParty moves tokens from canvas.scene (the bridge tab's view) and returns undefined. **Extended 2026-10-11 (U-8-4, U-6-13):** `teleportParty(destRegion, { confirm = true } = {})` (615) now awaits `confirmParty` (597-613), a `DialogV2.confirm` — an LLM calling `game.pentaryn.portals.teleportParty(region)` through eval-js on the MCP bridge tab gets a promise that waits for a click on an unattended tab (or until it times out), and nothing moves; only `{ confirm: false }` restores the old behaviour, and neither the module README nor scene-links.md mentions that option (only the ledger entry U-8-4 does). The new `spreadArrival(tokenDoc)` (663) also takes a document only and returns it unchanged in every branch, so a caller cannot tell whether it moved.

**Proposed.**

Additive entries: regionOf(ref) (document or fromUuidSync of a string); destinations(ref) mapping destinationsOf to { uuid, scene, name, card: cardFor(d.region), revealed, choice }; link(fromRef, toRef, { twoWay = false } = {}) calling linkRegions (GM only) returning { ok:true, from, to, twoWay }; unlink(fromRef, toRef) running the lines 790-793 loop and returning the number removed; badges() returning { region, revealed, visible, cards } per badge; describe(). Existing entries keep their signatures but accept refs through regionOf. teleportParty: document `{ confirm }` in describe() and the README API table, and have teleportParty return `{ moved: n, cancelled: bool }` (declared change from undefined); spreadArrival returns `{ moved: bool, to }`. Add `if (!region) return null;` to cardFor (declared change: null instead of TypeError). Document in scene-links.md section Destination cards as a console table.

**Behaviour test recipe (write first, must pass before and after).**

foundry/module/pentaryn-portals/test/run.mjs; export linkRegions as _linkRegions. Stub globalThis.foundry = { utils:{ parseUuid:(u)=>({ uuid: u.startsWith('..') ? `Scene.S.Region.${u.slice(2)}` : u }) } }. (a) b = { system:{ destinations:new Set(['..R2']) }, type:'teleportToken', disabled:false, update: async u=>log.push(u) }; from = { behaviors:{ filter:f=>[b].filter(f) } }; to = { uuid:'Scene.S.Region.R2' }; await _linkRegions(from,to) leaves log empty. (b) destination 'Scene.T.Region.R9': log deep-equals [{ 'system.destinations': ['..R2','Scene.T.Region.R9'] }]. (c) no behaviour: from.createEmbeddedDocuments captured with ['RegionBehavior',[{ name:'Teleport', type:'teleportToken', system:{ destinations:['Scene.T.Region.R9'], placement:'center', snap:true, choice:true, revealed:true, dialog:{revealed:null,unrevealed:null}, transition:{type:'fade',duration:1500} } }]]. The new link() must produce the same captures. Pin the old cardFor(null) TypeError and accept the change; pin the api key list (7 keys at `4e64f47` — the snapshot's 6 plus spreadArrival — plus the new ones). teleportParty: with `setting('confirmPartyTeleport')` true and a DialogV2.confirm stub that records its call, `teleportParty(region)` calls it once and `teleportParty(region, {confirm:false})` never does (pin both).

**Risk.** Additive; only cardFor(null) changes (null instead of throw), no caller relies on the throw. The `from` default stays canvas.scene so the UI path is unchanged.

**Related:** aoe-movement-portals-10, aoe-movement-portals-33, aoe-movement-portals-25

## Documentation / skills

### aoe-movement-portals-31 — Portals depends on core teleport internals with only one adjustments row

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals.mjs:57–64` (unchanged at HEAD)

**Anchor:** `` /** The core dialog's id is `dialog-<behaviorUuid>-<tokenId>`. */ ``

**Current.**

Only core-portals-relative-uuid is registered (adjustments.yml:233). Unregistered: the core TeleportToken dialog id format and its .dialog-content / select[name="destination"] (portals.mjs:57-109 [57-92]); options.replacements on deleteToken marking a teleport hop (639-727 [578-646]); RegionConfig appearance-tab selectors (line 180 [163]); canvas.fog.isPointExplored / canvas.visibility.testVisibility (347-348 [319-320]). A core change to any of these breaks portals silently and the Saturday updater cannot flag it. NOTE: adjustments.yml was in flux at snapshot. **Extended 2026-10-11:** the re-run added a second row, `portals-teleport-default-and-spread` (adjustments.yml:884-893, packages [core], markers `["preferTeleport", "spreadArrival"]`). Its markers are this module's own function names, so they never go stale when core changes; the core internals the new code depends on are DialogV2's `button[data-action="yes"]` / `button[data-action="no"]` and their `autofocus` (preferTeleport, 927-936) and the confirm's first `:scope > p` (plainQuestion, 101-109). And because its id starts `portals-` with no `wrapMethod` behind it, the scorer's C32 now fails portals (it passed at the snapshot) — the R1/D2 naming question.

**Proposed.**

Add three rows (fields id, packages [core], modules [pentaryn-portals], files [foundry/module/pentaryn-portals/portals.mjs], markers, what, why, native_when, retire_class, check make foundry-portals-check): core-teleport-dialog-cards (markers ['dialog-','select[name="destination"]'], guarded); core-teleport-replacements-follow (markers ['replacements'], what: active GM carries a PC's followers when core deletes the PC with options.replacements after a cross-scene teleport, guarded); core-region-config-portal-card (markers ['region-appearance'], safe). Rename `portals-teleport-default-and-spread` to `core-teleport-default-and-spread` (per D2's recommended convention) and change its markers to the core strings it depends on: `['data-action="yes"', ':scope > p', 'spreadArrival']`; fold the plainQuestion dependency into core-teleport-dialog-cards' markers. After the file split (aoe-movement-portals-25) update `files`.

**Behaviour test recipe (write first, must pass before and after).**

No runtime change. make foundry-adjustments-check must pass (each file exists, at least one marker per row present). Pin with grep -c 'replacements\|select\[name="destination"\]\|region-appearance' foundry/module/pentaryn-portals/portals.mjs >= 3, and grep -c 'data-action="yes"\|:scope > p' >= 2. `conformance.py --module portals` must stop listing the row under C32 after the rename.

**Risk.** None; if the split lands first, `files` must follow it or the check fails loudly, which is the intended guard.

**Related:** aoe-movement-portals-17, aoe-movement-portals-25

### aoe-movement-portals-33 — Flat README mixing use and internals; portals is not named in the routing row for scene links

**Category:** Documentation / skills · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/README.md:3` (unchanged; README is 39 lines at `4e64f47`, was 33)

**Anchor:** `**Read this when:** a teleport region's confirmation shows (or should show) a picture and description.`

**Current.**

The README is one long bullet list mixing data shape, authoring, badges, GM menu, secrecy, version notes (0.3.0, 0.4.0, 0.4.1; since the re-run also 0.4.4 and four U-6-13/U-8-4 bullets naming three world settings and `spreadArrival`, lines 27-30, 37), with the Console listed twice (two bullets), no file map, no settings table and no API table. context/foundry/README.md:59 routes 'Region + teleport scene links' to scene-links.md (which has the Destination cards section at line 205) but never names pentaryn-portals, and the portals README is only reachable from the combined Table-feedback row at line 67.

**Proposed.**

Restructure the README: 'Read this when' for changing code with a pointer to scene-links.md section Destination cards for use; ## Files (after aoe-movement-portals-25); ## Data (flags on the destination region); ## API (game.pentaryn.portals) table of current and new entries with who may call and default scene; ## Hooks and core dependencies linking the adjustments rows (aoe-movement-portals-31); ## Two sessions (aoe-movement-portals-28); ## Changelog holding the version notes. In context/foundry/README.md extend the line-59 row text to mention 'destination cards, travel badges, party teleport (pentaryn-portals)' and link the module README.

**Behaviour test recipe (write first, must pass before and after).**

Docs only. Guard: scripts/tests/test_module_docs.py asserting each key of the api object parsed from portals.mjs (regex 'const api = {...}') appears in foundry/module/pentaryn-portals/README.md; the same helper serves aoe-movement-portals-11.

**Risk.** None.

**Related:** aoe-movement-portals-32, aoe-movement-portals-11

## Defragmentation (added 2026-10-11)

### aoe-movement-portals-43 — Two hand copies of pentaryn-aoe's handle predicate in portals disagree with each other and with aoe

*Added 2026-10-11 at the re-anchor to `4e64f47`; the code is from the usability re-run (`17275c9`, U-8-4 and U-6-13).*

**Category:** Defragmentation · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-portals/portals.mjs:543` and `:673`

**Anchor:** `    handle: !!(t.flags?.["pentaryn-aoe"]?.handle || a?.flags?.["pentaryn-aoe"]?.handleActor),`

**Current.**

The re-run taught portals about pentaryn-aoe's area handles twice, differently. recordOf (543) treats a token as a handle when the token has `flags.pentaryn-aoe.handle` **or** its actor has `flags.pentaryn-aoe.handleActor` (so it is never party and never follows; core `carriable` at portals-core.mjs:44). spreadArrival (673) skips only tokens with the token-side `handle` flag when deciding whether an arrival is crowded, so a handle token that carries only the actor-side flag counts as someone standing there and pushes the arriving PC off its square. Neither matches the owner: pentaryn-aoe/core.mjs:364-368 `isHandleTarget` = token `handle` **or** `doc.token`'s `handle` **or** actor-side `handleActor`, and aoe/resolve.mjs:79 adds "the token's actor is the shared handle actor". The same predicate is also hand-copied in pentaryn-creatures (creatures.mjs:34-36, transform-creatures-30). A change to aoe's handle flags must be found by grep in three modules.

**Proposed.**

Module isolation forces a copy, so make it one explicit, tested copy: `isAoeHandle(tokenFlags, actorFlags)` in portals-core.mjs (the same signature transform-creatures-30 gives creatures), with a header comment citing pentaryn-aoe/core.mjs `isHandleTarget`. recordOf calls it (no behaviour change). spreadArrival calls it too — **[declared]**: a handle known only by its actor flag stops counting as an occupant (today it does). Name the flags in the manifest's `flags.reads` (`flags.pentaryn-aoe.handle`, `flags.pentaryn-aoe.handleActor`). Do not add aoe's `doc.token` branch (a TokenDocument has no `.token`; that branch serves aoe's placeable/actor inputs).

**Behaviour test recipe (write first, must pass before and after).**

portals test/run.mjs (core): `isAoeHandle({'pentaryn-aoe':{handle:'r1'}},{})` true; `isAoeHandle({},{'pentaryn-aoe':{handleActor:true}})` true; `isAoeHandle({},{})` false; `isAoeHandle(undefined, undefined)` false. Glue characterisation against today's code (export recordOf/spreadArrival through `_internals`): recordOf on a token `{flags:{}, actor:{flags:{'pentaryn-aoe':{handleActor:true}}, …}}` gives `handle:true` before and after. spreadArrival with `setting('spreadArrivals')` true, grid 100, arrived at (600,1000) 1×1 and one other token at (600,1000) whose only handle flag is on its actor: today it calls `arrived.update` once (pin as `// KNOWN:` -43); after the change it does not. With the other token flagged on the token side, no update before and after. Optional pytest contract test (the transform-creatures-21 harness): aoe `isHandleTarget` and portals/creatures `isAoeHandle` agree on the token-flag and actor-flag shapes.

**Risk.** The spreadArrival half is a deliberate behaviour change (an arriving PC may now share a square with a handle that is flagged only on its actor — handles are invisible scaffolding, so this is what U-6-13 intended). recordOf is unchanged.

**Related:** transform-creatures-30, aoe-movement-portals-38, aoe-movement-portals-36

## Categories checked with no finding

- **Extendability:** checked. The extension points are the split by feature (aoe-movement-portals-25) and the published link/destinations API (aoe-movement-portals-32), and new pure geometry goes in `portals-core.mjs` (aoe-movement-portals-26). Nothing separate.
