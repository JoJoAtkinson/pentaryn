# Changelog — pentaryn-portals

## 0.6.0 — 2026-10-17 (pins plan, `context/plans/pin-2026-10.md` §1)

Needs a Foundry restart (`module.json` version).

- New API row **`teleportToken(ref, { x, y, scene, level, dryRun })`** (GM, write, dryRun): moves
  one token so its centre lands on a point, on its own scene or another, and — when it is a PC
  (character or polymorphed) — its company with it: its summons and the tokens only its players
  own, the same rule as portal travel, without the portal check. Runs on the calling GM tab; no
  confirm, no pull, no view change. For pentaryn-pins' GM canvas menu and the bridge.
- Same scene: one update with displace waypoints that carry the level (`displaceOptions`, which
  now copies a move's own level / elevation into its waypoint; see R3 below). Another scene: `carryTo` with a new optional trailing `{ level }`; the
  level always resolves (the token's own, else the destination's initial level), so a source
  level id never crosses scenes. A lost keepId race returns `fail("CONFLICT")`.
- Onto another floor (another level of the scene, or another scene) each mover's `elevation` is
  mapped onto the new floor — the same height above its base, clamped into it (core's paste rule) —
  in the update, in every displace waypoint, and in carryTo's created data; on its own floor the
  elevation is left alone. Landing (`landingPlaces` with a new optional `{ level }`) counts only
  that floor's standers and walls (a wall with no levels is on every floor).
- A wild-shaped or polymorphed PC brings its summons, on every path — teleportToken, portal-hop
  follow and Teleport party (code review 2026-10-17 #4: before, only teleportToken's lead knew its
  original, so a wild-shaped druid walking through a portal left its familiar behind, and Teleport
  party left an unowned one). `recordOf` adds `rootActorId` to a record while the token is
  transformed (`flags.dnd5e.originalActor` on the token or the form actor, else
  `previousActorIds[0]`); `followersOf`, `leaderOf` and `partySelection` match a summon's origin
  against it. An untransformed token's record keeps its shape (`golden/records.json` unchanged).
- The root-actor rule is the kit's `rootActorId` (`lib/root-actor.mjs`, kit 1.2.0, additive),
  shared with pentaryn-pins so the two cannot disagree (code review 2026-10-17 #11). **[declared]**
  Only a 16-character document id counts: a transform flag holding anything else is skipped (core's
  old `originalActorId` took any non-empty string, and is gone).
- The plain carry path (portal-hop follow, Teleport party to another scene) maps a token's
  elevation onto its new floor whenever its level changes — the same height above the floor's base,
  clamped into it, as teleportToken does — and, when the party arrives on one floor, lands counting
  only that floor's standers and walls (code review 2026-10-17 #3: a summon at 15 ft stayed at 15
  over a 0–10 ft ground, and a guard on the ground floor pushed arrivals off an upper-floor gate).
  (A token whose level id is kept across scenes is mapped too since A2-5 below.) A party split
  across floors lands counting every floor, as before.
- teleportToken's lead groups its company beside it in `assignSpots` even when it is not a linked
  character (a polymorphed NPC, an unlinked character token): a record's `leader: true` counts as
  a PC there (code review 2026-10-17 #5). A dnd5e 6.0.6 wild-shaped PC was already grouped (its form
  keeps the `character` type and the token its `actorLink`).
- A mover whose token id is already on the destination scene (a duplicated scene keeps token ids)
  returns `fail("REFUSED")` naming the tokens, before anything is written and on a dryRun too;
  `CONFLICT` is left for a create another session lands first.
- Fix (pins-live S12-S18): Teleport party and the portal-hop follow (summons follow) created their
  tokens on another scene with the SOURCE scene's level id. On a destination without that level
  (any scene with its own levels) the token stood on no floor, and core refused every later move
  of it with "level must exist". `carryTo`'s plain path now always picks a level the destination
  has (pure `carriedLevel`): a new optional `preferLevel` (the arrived PC's floor for the follow,
  the destination region's one floor for Teleport party), else the token's own id when the
  destination shares it (single-level scenes share `defaultLevel0000`), else the destination's
  initial level.
- Unchanged: `displaceOptions` for a move with no level or elevation, `landingPlaces` without `{ level }`, and the rest of `carryTo`'s
  data for its existing callers (Teleport party, summons follow) apart from the level and the
  elevation that goes with it — pinned by
  `test/teleport-token.test.mjs`'s guards and the untouched `party.test.mjs` goldens. `party.mjs`
  changes only to pass the PC's floor. `CONTRACT` stays `api@1` (additive row).

- Code review 2026-10-17 (max), same 0.6.0:
  - **A2-1 / L2** Teleport party to a region on another floor of the SAME scene put nobody on that
    floor (x/y only) and landed counting every floor; a token on a deleted level made core refuse the
    whole update ("level must exist"). The same-scene path now uses the cross-scene rule: the
    region's one floor, else the token's own level, else the initial one, with the elevation mapped
    and landing on that floor.
  - **A2-4** teleportToken on its own scene with no `level`, from a level the scene no longer has,
    sent the stale id (dryRun ok, the real move INTERNAL): it now defaults to the initial level.
  - **A2-5** (`[declared]`, flips the "same level id keeps its elevation" guard) the plain carry path
    maps elevation whenever the scene changes, not only the level id: two scenes' `defaultLevel0000`
    share an id but not a range (top = 4 grid units). Identical ranges change nothing.
  - **T1** (A2-5 follow-up) a token outside its own floor's range — a familiar flying at 30 ft over a
    default 0-20 level, a burrower at -10, a head through the ceiling — was clamped on every scene or
    floor change (to 15 / 0) although the PC it follows keeps its height. It now keeps its height above
    the base, unclamped (`elevationOnLevel`'s new optional source-floor clamp); a token inside its
    floor is mapped and clamped as before.
  - **L3** Teleport party to a scene that already holds a mover's token id (a duplicated scene) now
    warns the GM (`Notify.IdClash`) and returns `{ moved: 0, cancelled: true }` instead of rejecting
    raw; portal-hop follow leaves such a follower behind with that warning (ids read in the delete
    hook, `heldIds`, so another GM tab's carry stays the keepId election) and brings the rest.
  - **R1** teleportToken's `opts.scene` goes through the kit's `resolveRef` (adds an exact name; a
    token uuid is `BAD_ARGS`, not `NOT_FOUND`); `sceneOf` is gone.
  - **R3** one arrival rule (`arrivals`) for carryTo's two branches, moveCompany and Teleport party;
    `displaceToLevel` folded into `displaceOptions` (a move's own level / elevation go in its waypoint;
    a move with neither is unchanged).
  - **R8** `wallOnLevel` removed: landing reads core's `CanvasDocument#includedInLevel`.
  - Test: `leaderOf`'s rootActorId branch alone (an unowned familiar naming the original druid).
  - **C6** teleportToken's `ref` is resolved by the module (`resolve: false`): a bare token id held by
    more than one scene (a duplicated scene keeps ids) is `AMBIGUOUS` unless `opts.sceneId` names one;
    before, the first scene's token moved. A uuid or a document is never ambiguous.
  - **C7** `flags.reads` lists `flags.dnd5e.originalActor` and `flags.dnd5e.previousActorIds` (read
    through the vendored `root-actor.mjs`), and `adjustments.yml` `dnd5e-pins-transform-root` names
    portals too, so a dnd5e update escalates `make foundry-portals-check` as well.

## 0.5.0 — 2026-10-12 (Wave 7 restart batch, wave 5)

Releases the wave-3 blueprint migration (next section) together with the batch. `module.json`: `flags.pentaryn` blueprint keys
(`flagScope` `portals` → `pentaryn-portals`, manifest-only; the code already wrote
`flags.pentaryn-portals`), `recommends` item-piles, `verified: "14.369"`, `styles/portals.css`
(moved), `languages`.

- **[declared] D-P2** — every on-screen string comes from `lang/en.json` through
  `_loc("PENTARYN_PORTALS.…")` (finding -29): the teleport question, the dialog cards' hover, the GM
  menu, the party confirm, the Portal card window, the Region config fieldset, the notifications and
  the three settings. The English is unchanged; the party plurals are now two keys each.

### Addon-blueprint migration (wave 3)

Code layout follows the blueprint (entry, core, settings, scene adapter, the `party`, `badges` and
`cards` features, the card window, API manifest); the kit is vendored. What a player or GM can
notice:

- **[declared] D-P1** — `game.pentaryn.portals` is a frozen, kit-built API published at `ready`
  (not one tick later), also as `game.modules.get("pentaryn-portals").api`, with `describe()`,
  `version`, `contract`, `settings()`, `trace()`, `uninstall()`; it fires `pentaryn-portals.ready`
  and `pentaryn.ready`. The old members keep their signatures.
- New API members (additive): `inspect`, `destinations`, `link`, `unlink`, `badges`.
- **[declared] S7** — every class portals puts in the DOM starts `ppt-` (was `pp-`, prompts'
  prefix); the root classes are `ppt-app` and `ppt-dialog`. No visual change intended.
- **[declared] D-P3** — the six region/behavior hooks redraw the badges once, 50 ms after a burst,
  instead of once per write.
- **[declared] D-P4** — with two GM tabs open, the tab that loses the follower carry stays quiet
  (no false "summons did not follow").
- **[declared] D-P5** — `cardFor(null)` returns `null` (it threw); `teleportParty` returns
  `{ moved, cancelled }` (it returned `undefined`).
- **[declared] D-P6** — an arriving PC no longer steps off a square held only by an aoe handle
  flagged on its actor.
- **[declared]** a snapshot whose image cannot load rejects `portal snapshot: cannot load <src>`.
- **[declared] C59** — the card window's *Show where it leads* / *Ask before moving* switches and
  *Remove this destination* write every teleport behaviour of the region in one batch
  (`updateEmbeddedDocuments`) instead of one update each; hooks still fire per behaviour.
- Console only: a broken card image warns once per path; failed card-window writes log with a
  label; the other expected failures log at debug (`CONFIG.debug["pentaryn-portals"] = true`). A
  failed badge draw on `canvasReady` or the edit toggle warns `badge redraw failed`, and a failed
  GM badge-menu action (Look at, Teleport party) logs `badge menu`.
- The card window's clear-image button deletes the flag with `_del` (the `-=img` key is deprecated).

## 0.4.4 — 2026-10-11

- Badge redraw race: the badges wait for each destination's thumbnail; a scene activation or a
  second redraw during that wait left the first draw adding to a torn-down layer (`TypeError …
  reading 'addChild'` on a player client). Each draw carries a run number; canvas teardown and any
  newer draw retire it (usability U-9-6).
- Teleport is the default answer: the core question opens with Teleport focused (setting
  `teleportDefault`, U-6-13).
- Arrivals step off an occupied square (setting `spreadArrivals`; `spreadArrival(tokenDoc)`, U-6-13).
- Teleport party asks first, lands each follower by its PC and leaves aoe area handles behind
  (setting `confirmPartyTeleport`, U-8-4).
- A plain teleport question: "Teleport X to <card title>?" (U-8-4).

## 0.4.2

- dnd5e 6: declares dnd5e 6.0 (verified 6.0.6); `flags.dnd5e.summon.origin` and
  `flags.dnd5e.isPolymorphed` are unchanged.

## 0.4.1

- Same-scene links: core 14.368+ stores a same-scene destination relative to its behavior
  (`..<regionId>`); every entry is resolved against its behavior and compared by absolute uuid, so
  cards, badges, Look and Unlink work for same-scene links.

## 0.4.0

- Teleport party carries summons, familiars, steeds and transformed forms; never piles, Markers or
  crowd. Summons follow their PC through a link to another scene.

## 0.3.0

- Players see a badge only once its square has been in sight or explored; then it stays.
