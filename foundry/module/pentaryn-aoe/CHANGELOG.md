# Changelog — Pentaryn AoE (`pentaryn-aoe`)

## Unreleased

- **0.8.5 (2026-11-22). Live play-test round 5.**
  - **[declared] The wall panel hint names the gesture that rotates (R5-7).** A plain mouse wheel zooms the
    canvas during placement; Shift+wheel turns the panel (15° a notch). The counter now reads "Panel n of N:
    Shift+wheel rotates, Esc to finish, right-click skips a panel".
- **0.8.4 (2026-11-22). Live play-test round 4.**
  - **[declared] Wall panels keep their turn (R4-10).** Core starts each shape of a multi-panel placement at
    its own data's rotation, so panels turned one by one came out as a comb. Each new panel now starts, on
    its first move, at the rotation the last placed panel had (a skipped panel is not carried), and the
    counter reads "Panel n of N: mouse wheel rotates, Esc to finish, right-click skips a panel".
- **0.8.3 (2026-11-22). Live play-test round 2.**
  - **[declared] Red "already exists" / "does not exist" toasts at every Wall of Stone cast, break and
    repair (R2-2).** The GM account was open in two sessions; `activeGM.isSelf` is true on both, so both
    wrote the same spell walls (fixed ids) and the server refused the second, which Foundry shows as a red
    toast and a console error even when caught. One GM plus the headless Claude GM was clean (reproduced on
    BOSS). New feature `sessions.mjs`: the sessions of each account elect one lead over the
    `module.pentaryn-aoe` socket (`core.leadSession`: the oldest session heard within 150 s; hello, here
    every 20 s, bye on pagehide; a new tab listens 1.5 s first). Spell walls, handles, concentration cleanup
    and the sweeps run on the active GM's lead session; a session that takes the lead late re-runs the
    startup work and syncs the viewed scene's walls. **`module.json` `socket: true`** (a world relaunch).
    New hooks `ready(sessions)`, `userConnected(sessions)`.
  - **[declared] `wallsFor(regionId).broken` stayed `[]` with overlapping panels (R2-3).** Three 10-foot
    panels placed 100 px apart overlap; a broken panel's stretch was still covered by its neighbour and
    counted as standing. Each current piece is now matched to the cast panel it came from, and only that
    panel's pieces count (`core.brokenLineSections`).
- **0.8.2 (2026-11-22). Live play-test round 1.**
  - **`wallsFor(regionId).broken` stayed `[]` after a section was broken (D-6).** A line panel's break
    cuts its shape; only a round wall's chords were listed. `broken` now also lists every section of
    the wall as cast (`"panel:section"`, from `wallOriginal` moved to where the handle is now) that no
    current panel covers (`core.brokenLineSections`).
- **0.8.1 (2026-11-21). Live play-test fixes for the 0.8.0 wall spells** (core 14.370, dnd5e 6.1.1, a GM
  and a player tab on a test scene).
  - **Clear All on the Walls layer broke every wall spell on the scene.** Core 14's client backend strips
    `deleteAll` from the options its deleteWall hooks get, so 0.8.0's check never fired: every spell wall
    counted as a GM break, every line wall's area was deleted and every ring was left with no walls.
    `core.isClearAll` now also reads an emptied single-level scene (every Wall of the batch is out of the
    collection before the first hook) as Clear All; the active GM raises the walls again. A GM who deletes
    the scene's last walls by hand gets the same answer (break them with the discs instead).
  - **A round wall's break did not show.** Breaking a chord of Wall of Ice's globe (or a Wall of Force or
    Fire ring) writes only flags, and core does not refresh a Region placeable for a flags change: the ring
    kept the broken chord drawn and its break disc until the next redraw (the walls themselves were right).
    `updateRegion` now asks the placeable for one refresh when `wallBroken` or `wallOriginal` changes, on
    every client. Breaking a ring's last standing chord now removes the area (`core.wallStanding`), as the
    last panel of a line wall always did.
  - **A player could not drag their own Wall of Stone.** The handle sat on the first panel's start, on the
    wall line, and a half-square token has one visibility test point, its centre: the spell's own walls
    hid it from every player, the caster included, so it could be neither seen nor dragged. A wall spell's
    handle now sits half a square before the first panel's start (on the line, past the wall's end, so it
    is seen from both sides), or half a square outside a ring to the east (`core.wallHandleCentre`; the
    anchor as before when that spot is off the scene). Handles placed before 0.8.1 stay where they are.

- **0.8.0 (2026-11-21). B2 — wall spells raise real, breakable walls** (feedback 8t6Nn1; plan
  feedback-triage-2026-11-19 §B and §H4, with Joe's final ruling of 2026-11-21 replacing the §H4 table
  where they differ).
  - **[declared] Wall documents per spell** (`spell-walls.mjs`, pure `core/spell-walls.mjs`; setting
    `spellWalls`, default on). Joe: walls are for storytelling and behave like the real thing — a party
    behind its own wall does not know what happens on the other side. `core.SPELL_WALLS` by dnd5e item
    identifier: Wall of Stone and Wall of Ice block movement and sight (Ice was "see-through" on
    2026-11-20; Joe reversed it), Wall of Force movement only (invisible) and still stops other areas,
    Wall of Fire sight only; Blade Barrier and Wind Wall none. One Wall per 10-ft section on each panel's
    centre line (`wallPlan`; a sphere / cylinder: a ring of at least 8 chords), flagged `{ regionId,
    panel, section, spell, clipsAreas }`, with fixed ids (`wallId`, `keepId`) so two GM tabs make one.
    The active GM's client writes them (players cannot create Walls) on createRegion, updateRegion (a
    handle drag moves them in place, `diffWalls`) and deleteRegion (so they go with the area and with
    concentration through Part A's cleanup); canvasReady re-syncs the viewed scene and deletes orphans.
  - **[declared] Breaking a section (GM).** Each section has a small break control (a dark disc with a
    crack) in a container on `canvas.controls`, interactive on every layer like core's door controls.
    Click: the section is knocked out (`breakSection`) — a line panel's shape is cut so the drawn area shows
    the gap, a round wall's chord goes in `flags.pentaryn-aoe.wallBroken` (`wall-spells.mjs` draws round
    walls as their ring of sections, gaps open) — and an info toast names the spell. The first break keeps
    the whole wall in `wallOriginal` with its handle's position; right-click any control repairs it
    (`repairWall`, moved with the handle). The last section deletes the region. Deleting spell walls on
    the Walls layer breaks those sections too (`breakSections`, last first), so a drag does not bring
    them back. API: `wallsFor`, `breakWallSection`, `repairWall`, `syncWalls` (describe golden updated).
  - **Review fixes.** A second break click (or a repair) on the same wall while the first
    `region.update` is still on its server round trip is dropped (`exclusive`): it read the old shapes
    and section numbers, so it put the first break back or knocked out the wrong stretch of a split
    panel. With `spellWalls` off, the GM deleting a leftover spell wall on the Walls layer is just
    cleanup and no longer cuts the area. Clear All on the Walls layer (core's `deleteAll`) breaks no
    wall spell either; the active GM raises their walls again. A region moved to another level takes
    its walls along (`diffWalls` compares `levels`). A drag preview of a wall region (a clone with the
    same id) neither draws break controls nor drops the real region's.
  - **[declared] Part H.** A spell's own walls never clip its own area, and a Wall of Force's walls clip
    other areas although they block no sight (`core.areaEdgeClips`; `walls.mjs` passes the region id in
    the polygon config). Under `areaWalls: move`, core's polygon is used as before unless the scene has
    spell walls.
  - Not built: Wall of Stone made permanent after a full duration of concentration (its walls go with
    concentration, as its region does). B1 (visible thickness) and B3 (panel counter) unchanged; their
    tests pass.
  - **[declared] No target, no auto damage** (Joe 2026-11-21). With nothing targeted a natural 20 still
    auto-rolled damage (`shouldAutoDamage`: a crit, or an unknown AC, rolls), and dnd5e's Apply tray on
    that card then offered the selected token — the attacker, or whatever each viewer had selected.
    `attacks.mjs onPostRollAttack` now rolls only when the attack card's hit targets
    (`core.attackHitTargets`) are not empty (`core.autoDamageHasTarget`); a card that recorded no target,
    or no attack card at all, leaves the card's Damage button for the player. Every auto-rolled card now
    carries its hit targets. Note: a pentaryn-combat Full Attack with no target and aoe's auto damage on
    shows no per-swing Damage button (combat hides it whenever `autoDamageOnHit` is on); the usage card's
    Damage button remains. Tests: `attacks.test.mjs` (no target, no card, crit with a target), the
    `attacks.json` golden (each row now records a target; a "no target, natural 20" row).
  - Adjustment rows `core-region-spell-walls`, `core-controls-layer-wall-breaks`. Tests:
    `spell-walls.test.mjs` (per-spell walls, sections, ids, diff, break geometry, repair, own-wall
    clipping exclusion, the GM sync, the Walls-layer break, the controls); hooks / settings / describe /
    surface goldens regenerated for the new hooks, setting and rows.

- **0.7.1 (2026-11-21). Browser playtest of 0.7.0** (four findings, live on BOSS).
  - **[declared] A relay that timed out is no longer reported as "no GM".** The GM's client was slow
    (over `RELAY_TIMEOUT_MS`, 8 s), the heal landed late, and the player had been told "No GM is
    connected, so Caven did not take this", which invites a second Apply and a double heal.
    - `apply.mjs relayRows`: `NO_GM` keeps `Apply.NoGm`. On `TIMEOUT` the player's client notes the
      card's `flags.pentaryn-aoe.appliedLog` keys before the query and watches the card (a 250 ms poll)
      for up to `RELAY_LATE_WAIT_MS` (15 s, core) for a new entry whose rows name any relayed token
      (`core.relayLanded`, pure). Found: nothing is said (an info log line). Not found: the new
      `Apply.Late` toast, "The GM's client has not confirmed {names} yet. Check their HP before pressing
      Apply again; the GM can apply it from this card." The wait is a test seam (`_internals.lateWait`).
    - Tests: `card-apply.test.mjs` (relayLanded; a late entry → silence; no entry → `Late`, never `NoGm`).
  - **[declared] The auto damage card after a hit lists only the targets the roll hit.** One attack roll
    against two targets, one hit and one missed: the auto-rolled damage card's Apply tray listed both,
    because dnd5e's `rollDamage` records the roller's current targets (`TargetsField.getDescriptors()`).
    - `attacks.mjs onPostRollAttack` passes `message.data.system.targets` = the attack card's targets
      this roll hit (`core.attackHitTargets`: dnd5e's `AttackMessageData#evaluatedTargets` rule; an
      unknown AC counts as hit, total cover and a fumble miss). An attack card whose recorded targets
      were all missed now rolls nothing: a two-target roll has no single AC (`options.target`
      undefined), so `shouldAutoDamage` alone had rolled. A card that recorded no targets keeps dnd5e's
      default. Tests: `attacks.test.mjs`. No golden change (the pinned rolls record no targets).
  - **B3 [declared]. The panel notice shows once.** "Panel n of N" appeared twice per step while placing
    Wall of Stone. Core 14.370 (`RegionLayer#placeRegions`, `#confirmPlacement`, `#skipPlacement`) and
    dnd5e 6.1.1 (`TemplatePlacement#_place`) were read: one `placeRegions` call per cast, one
    `preConfirm` per click, so the duplicate could not be tied to one line without the live client. The
    fix makes a second notice impossible either way: `panelNotice` keeps the notice it shows in module
    state, a new multi-panel placement removes an earlier one still on screen (core cancels the earlier
    placement anyway), a stale placement settling later never removes the live one, `uninstall()`
    removes it, and each shape advances the count once, keyed by core's `regionIndex:shapeIndex`,
    however often its hook runs. Tests: `wall-spells.test.mjs`.
  - **[declared] A wall spell's region gets a handle.** Live, a Wall of Stone region had no
    `pentaryn-aoe` flags and `aoe.handleFor(region)` was null, so players could not drag or delete it.
    Pre-existing since the first Part A (2026-10-10): `createRegion` and the sweep gave handles to
    one-shape regions only. Template detection was fine (`flags.dnd5e.activity`; a Lightning Bolt or a
    one-panel wall always got one), but dnd5e 6 combines a cast's unattached shapes into ONE region
    (`TemplatePlacement.fromActivity`, `combinedShapes`), so a wall of two or more panels is one
    region of several lines.
    - Every template region with a shape gets a handle; a multi-shape region's handle sits at its
      FIRST shape's anchor (a panel's start), not the region's centre, which on a bent wall can lie on
      no panel. Core moves every shape of an attached region with its token
      (`TokenDocument#computeAttachedRegionUpdates`); `wall-spells.mjs` redraws the stone overlay on the
      `refreshRegion` that follows; the delete cascades are the existing ones.
    - Tests: `wall-spells.test.mjs` (create, attach, the overlay after a drag, delete, the sweep);
      `areas.test.mjs` and `findings.test.mjs` updated for the two-shape regions they already used.

- **0.7.0 (2026-11-21). Feedback triage 2026-11-19** (F0, G1, G2, D2, B1, B3; plan feedback-triage-2026-11-19 §H2).
  - **F0 [declared]. Empowered Spell keeps the saves** (feedback GDJJdi; plan feedback-triage-2026-11-19 §H2).
    Browser test T4: one Empower click rolled the target's Dexterity save a second time, because the GM's
    `createChatMessage` hook resolved pentaryn-riders' new damage card as a fresh tray. PHB 2024 rerolls
    "a number of the damage dice" only, so the save stands.
    - `resolve()` reads `flags.pentaryn-riders.empowered.from` (declared in `MANIFEST.flags.reads`); when
      that card carries a resolution for the same activity, the new tray takes over its rows' saves,
      multipliers, ticks and GM edits, its area, Careful Spell and request card (`core.carryResolution`,
      pure), keeps its own damages, rolls no saves it already has, skips `fillEarlierSaves` and
      `carefulFor`, and posts no request card. A pending player save answers the new card (`matchSave`
      on `request`). Refused when the replaced tray is `areaLocked` (superseded, or a row applied).
    - The GM tray's Apply passes `origin: message` to `actor.applyDamage` (as the relay and dnd5e's tray
      do), so pentaryn-riders' `dnd5e.applyDamage` listener marks the card applied and the Empower button
      goes: a GM Apply followed by Empower could otherwise land the damage twice.
    - Tests: `test/empower-carry.test.mjs`. Golden: `describe.json` (`flags.reads`).
  - **G1 [declared]. A self-only healing card targets its caster** (feedback SvOaxr). dnd5e
    records the roller's current targets on every roll card, so Stone's Endurance with an enemy targeted
    offered to heal the enemy (browser test T3), and with nothing targeted each viewer's tray listed
    their own selection ("Caven +11").
    - `apply.mjs` adds `preCreateChatMessage` (roller's client, never a veto): a `healing`
      card from an activity that affects only `self`, or has Self range and no other affects type
      (`core.selfTargetCard`, pure), gets `system.targets` = the caster's token (`targetDescriptors`),
      whatever was targeted. Never an area (a Self cone, line or emanation), a save or an attack
      activity, and never a damage card (a Self-range damage activity such as Armor of Agathys hurts the
      attacker); `areaTargets` / `recordedTargets` are never written. Gated by `applyFromCard`.
    - Tests: `test/self-target.test.mjs`. Goldens: `hooks.json`, `describe.json` (the new hook).
  - **G2 [declared]. "Applied by Talo → Talo (+11)" under a damage or healing card** (feedback SvOaxr).
    The plan's "the data is already there" was wrong: `stampApplied` stored `{ at, by, targets }`, no
    amount, and only for untargeted or late-target cards; the GM tray and the relay wrote nothing.
    - Every Apply now records one entry under its own random key of `flags.pentaryn-aoe.appliedLog`
      (`{ at, by, byName, rows: [{ token, name, delta, pc }] }`, `delta` the HP change): the player's own
      rows in the applied stamp (which now runs on every Apply from dnd5e's tray; targets are still
      recorded only on a card that had none or followed late targets), the relayed rows by the GM's
      `applyRelay` (`messages-adapter.logApplied`, the sender named), and the GM tray's `applyRows`.
    - The card renders one line per entry under its tray (`renderAppliedBy` in `decorate`, render-only).
      New world setting `showAppliedBy` = `gm` | `owners` (default) | `all` (`core.appliedByVisible`); a
      player never reads a row for a creature no player owns (`core.appliedByLines`).
    - Tests: `test/applied-by.test.mjs`; `card-apply.test.mjs` now expects the stamp on a card with
      recorded targets (no `system.targets` rewrite). Goldens: `settings-register.json`, `describe.json`.
    - A player who did not roll the card (Caven pressing Apply on Talo's Cure Wounds and landing it on
      Caven) cannot write the card, so their client hands the rows it landed to the active GM: on the
      relay query when it also relays rows, else on a log-only `applyRelay` (`rows: []`, new `landed`
      field). The GM writes the entry named for the sender, keeping only tokens the sender owns and
      reading name and `pc` itself; a log-only request applies nothing, so it needs no author check. A
      failed log-only query is a log line, never a toast (the HP already changed). Tests:
      `applied-by.test.mjs` (non-author Apply, log-only validation); `card-apply.test.mjs` (the GM's
      breath-weapon card now sends one log-only query). Golden: `describe.json` (`applyRelay` params).
  - **D2 [declared]. Hit / Miss on attack cards** (feedback ORGqVN, hKDbzi). `attackRollVisibility` has
    been `hideAC` since 2026-11-20, but a miss still read as nothing happening (browser test T2).
    - `attacks.mjs` adds `dnd5e.renderChatMessage`: one target → "— Hit" (blue) / "— Miss" (orange) in the
      card's title; several → "Hit" / "Miss" on each target pill, no title suffix; every target missed →
      a rendered "Miss — no damage" line (no posted message). The damage card after a hit gets a blue
      title. Pure `core.attackOutcome` (total cover is a miss; no target, a private card or visibility
      `none` → nothing). Idempotent on a re-render.
    - New world setting `hitMissLabels` (default on); `settings.dnd5eAttackVisibility()` reads dnd5e's.
    - Tests: `test/hit-miss.test.mjs` (golden `hit-miss.json`). Goldens: `hooks.json`, `describe.json`,
      `settings-register.json`.
  - **B1 [declared]. Wall spells are drawn thick enough to see** (feedback 8t6Nn1). Wall of Stone's Long
    Panels are a 0.25 ft line, 2.5 px on a 50 px grid, in the caster's user colour; Talo's dark green wall
    on a dark map "disappeared".
    - New feature file `wall-spells.mjs` (after `walls.mjs` in `FEATURES`): on `refreshRegion`, a wall
      spell's region (`core.wallSpellRegion`) gets one `PIXI.Graphics` child on the Region placeable, each
      line shape drawn `core.wallThickness` = `max(width, grid / 5)` thick (`core.wallPanelOutline`) in a
      neutral stone fill and dark stroke. The shape's width is never changed (which creatures the area
      holds stays exact); no Wall documents (B2 is out of this run). Uninstall removes every overlay.
    - Tests: `test/wall-spells.test.mjs`. Goldens: `hooks.json`, `describe.json` (the new hook).
  - **B3 [declared]. A panel counter while placing a multi-panel wall** (feedback 8t6Nn1; browser test T5:
    right-click did not end placement, Escape did). The `placeRegions` wrap in `aim.mjs` shows one
    permanent notice for a placement of two or more shapes, "Panel n of N: Esc to finish, right-click
    skips a panel" (`core.panelCounter`), counted by each confirmed or skipped shape after the caller's
    own `preConfirm` / `preSkip` (a refusal counts nothing), removed when the placement settles. The
    wrap passes core the same data list. `aim.mjs`'s header no longer says right-click cancels: it skips a
    shape (core's `#skipPlacement`), and Escape finishes, keeping the panels already placed. An async
    `preConfirm` / `preSkip` is awaited before counting: a Promise of `false` counts nothing.
    - Tests: `test/wall-spells.test.mjs` (panelCounter, panelNotice incl. an async refusal, the wrap). No golden changes.

- **0.6.4 (2026-11-20). dnd5e's own tray lists the area.** Live (BOSS, dnd5e 6.1.1): a Fireball damage
  card's native `<damage-application>` said "No Targets" and, with a PC selected, listed that PC — a GM
  who applied from it (the module's tray sits right under it) hit the selected character, not the
  goblins. The save activity records no targets at use time, so dnd5e fell back to the GM's selection.
  - **The area is stamped as the card's targets** (`resolve.mjs`): the same write that stores the
    resolution writes the ticked rows' tokens into `system.targets` (dnd5e's own descriptors,
    `targetDescriptors`) and sets `flags.pentaryn-aoe.areaTargets`. Which rows (`core.areaTargetRows`):
    the rows buildRows ticks — not the caster, not a hidden token (its name must not reach the
    players' card), nobody at 0 HP — minus a Careful-protected row already at ×0. dnd5e's native Apply
    hits every listed token the user owns and the GM owns everything, so an unticked row listed there
    would have taken damage. No area (recorded targets, `regionId: null`): nothing about targets is written.
  - **The tray's "selected" memory flips once per message** for area targets as it does for late targets
    (`core.moduleFilledTargets` gates `onRowsBuilt`). The flip is keyed by message id, not by the
    rendered `<recorded-targets>` element (code review): a card re-renders on every save, tick and apply
    write, and each fresh element comes up in whatever mode dnd5e's `_targetState` holds — so a user's
    own switch back to "selected" is kept across re-renders instead of being flipped again.
  - **`regionId: null` still means the roller's targets** (code review): the first stamp of a card also
    writes `flags.pentaryn-aoe.recordedTargets` — its `system.targets` as they were, a plain array, `[]`
    when the roller targeted nobody — and the no-area path builds its rows from that, not from the area
    the stamp wrote over them. Written once; a re-resolve with another area leaves it.
  - **Late targets stop at the stamp** (code review): a player who targeted something before the GM's
    resolve landed (`lateTargets: true`) kept rewriting `system.targets` on every later target change,
    replacing the area with their pick while `areaTargets` stayed true — dnd5e's tray then listed the
    player's target, the very bug this release fixes. `core.lateTargetCard` now skips a card flagged
    `areaTargets` (`describeRecent` carries it) and the stamp writes `lateTargets: false` when it was set.
  - **A player's Apply on a save spell's card relays nothing** (`apply.mjs`): the stamp lands on the
    player's card too, so without this their Apply would have relayed the monsters and the GM's Apply N
    would have landed the damage twice. Unowned rows are skipped with one info toast
    (`PENTARYN_AOE.Apply.GmTray`); the player's own rows still land locally, as before.
  - Not changed: a superseded card keeps its stamp and dnd5e's tray on it is not greyed (only the Part B
    tray is), so a GM pressing that native tray applies the area by hand; the docs now say so. Clearing
    `system.targets` in `supersedeOlder` is left for later.
  - Goldens: `resolve-fireball.json` (the stamp and the four-key update) and `describe.json`
    (`flags.writes` gains `areaTargets` and `recordedTargets`; the `regionId` doc). Docs: README Part B /
    Part I / API / Data written / Pitfalls, `tray.mjs` header, `context/foundry/aoe.md`.
- **0.6.3 (2026-11-20). dnd5e 6.1.1.** The Apply relay carries the two option shapes 6.1's damage tray
  can hand `calculateDamage`: `ignore: true` and `downgrade: true` ("every type", which
  `DamageMessageData#getDamageApplicationOptions` now produces when the card's own
  `applicationOptions` — set by the new `dnd5e.damage.ignore.*` / `dnd5e.damage.downgrade` effect
  changes — hold `ALL`), plus resistance downgrades. Until now `packApplyOptions` kept `true` only
  under `ignore.<change>` and dropped a `true` downgrade, so a GM-relayed Apply for an unowned
  target would have lost what the player's tray showed. Core `packApplyOptions` /
  `unpackApplyOptions`; tests. No other 6.1 change touches this module: `getTargetOptions` /
  `getMergedOptions`, `DamageApplicationOptions`, the chat message types and `placeRegions` are
  unchanged (release-6.1.1 tag read 2026-11-20).
- **0.6.2 (2026-11-07). Live playtest of Part I** (ZZ Talo: Heal, Healing Word on Caven; Marrith's Fire
  Bolt relayed fine). One root cause under all three findings: dnd5e 6 types a healing roll's card
  `healing` (`HealingMessageData`, the same damage-card template), and every Part I check asked for
  `type === "damage"`, so a healing card was never wired, never followed and refused by the relay.
  - **Healing cards are damage cards to Part I** (`core.isApplyCard`, `APPLY_CARD_TYPES = ["damage",
    "healing"]`): the card is decorated (typed totals on every row, the unowned row included — finding
    2), late targets fill an untargeted healing card and its tray flips to the recorded targets (finding
    1: Heal cast with nobody targeted, then Caven targeted, changed nothing), and `applyRelay` accepts
    it (finding 3: the GM answered `NOT_FOUND` — in fact the card was not even wired, so the Apply press
    was dnd5e's own, which skips the unowned row silently; Caven stayed at 40).
  - **A refused or failed relay is said, once** (`PENTARYN_AOE.Apply.RelayFailed`, back with the reason
    in it): a GM client that refused or threw used to be logged only, and at the table silence read as a
    heal that had landed. `NoGm` stays for no GM / no answer in time; a losing GM tab's `claimed: false`
    is not a failure. The player's own card and rows are otherwise unchanged.
  - Tests: `card-apply.test.mjs` — the healing card is now typed `healing` as dnd5e types it (the 0.6.1
    helper typed it `damage`, which is why nothing caught this); F1 late targets on a healing card, F2
    the healing row's total, F3 the heal relay on both sides and the one toast per refusal / failure.
    `core.test.mjs` — `isApplyCard`, `lateTargetCard` on a healing card. No golden changed.

- **0.6.1 (2026-11-07). Review of 0.6.0's Part I** (second builder pass on the feedback-triage review).
  - **Apply hits the rows dnd5e lists.** The Apply-time fallback to the user's current targets ran for
    every user, so the tray showed the SELECTED tokens while Apply hit the TARGETED ones whenever both
    were held (a GM's stale target under an environmental card; a player's goblin instead of their own
    PC). Now the listed rows are always the rows (`core.applyTargets`); the one fallback — dnd5e lists
    nobody on a card that recorded no targets — is for players only, and a GM's untargeted card keeps
    dnd5e's selected habit.
  - **Unauthorised rows are skipped silently, as dnd5e skips them.** The sender now applies the GM's own
    rule first (the card's author, or the owner of its actor): on the GM's breath-weapon card listing two
    PCs a player's Apply lands their own row and relays nothing, with no toast. The toast is kept for
    `NO_GM` and `TIMEOUT` only (the relay could not run); a GM client that refused or failed is logged.
    `PENTARYN_AOE.Apply.RelayFailed` is gone, and `NoGm` no longer says to press Apply again (a second
    press re-applies the owned rows): the GM can apply it from the card.
  - **Fewer things on the row:** a typed total's result is written into dnd5e's own per-row number
    (`.calculated.damage > .value`) instead of a second number beside it; dnd5e's text comes back when
    the total is cleared, and the typed rows are recomputed a tick after a multiplier or pill change. On
    a save spell's card (a Part B resolution) the GM gets no totals on dnd5e's tray: the module's tray
    under it is the one to apply from, and the docs say so.
  - **The relay carries the pill menu's choices** (`options`: ignore / downgrade as arrays,
    `core.packApplyOptions` / `unpackApplyOptions`), so the GM applies with the sender's resistances
    ignored or immunities downgraded as the sender set them.
  - **`applyRelay` needs a `requestId`** (`BAD_ARGS` without one): the per-press claim is what keeps
    two GM tabs from landing it twice (§5.4 idempotency), so an unclaimed request is not applied by
    every tab any more. The tray folds before the relay is awaited (no wait on the claim's settle).
  - `AmountTip` says a typed total lasts until Apply or a page reload. Golden: `describe`
    (`applyRelay`'s params and doc). Tests: `card-apply.test.mjs` rewritten for the rules above,
    `core.test.mjs` for `applyTargets` and the options pack / unpack.

- **0.6.0 (2026-11-07). Fewer steps on a damage or healing card** (feedback triage 2026-11, clusters
  J1, J2, B relay + late targets, B5; feedback fs7q6K, OrwZqP, DnK6lE, OnvqIi).
  - **J1 — a save spell used at a target rolls its damage at once** (`attacks.mjs`, setting
    `autoDamageOnSave`, default on, the sibling of `autoDamageOnHit`). `dnd5e.postUseActivity` for a
    `save` activity with damage parts and at least one recorded target rolls the damage with no dialog,
    threaded under the usage card with the card's targets, so Psionic Lash is Use → the target saves →
    Apply. A save spell that places an area waits for the area (Part B lists who is inside); a use
    with no target posts nothing extra. `core.shouldAutoDamageOnUse`.
  - **J2 — a save rolled before Damage counts** (`resolve.mjs`, `core.matchSave`). A save rolled from
    the usage card's own Saving Throw button before the damage (threaded under the usage card) fills
    that target's row when the tray is built (`fillEarlierSaves`: not a request-card result, not a
    monster save this module rolled, not one already counted on another tray), and no request card is
    posted for a row that already has its save. `matchSave` takes `info.usageId`: a save under the
    spell's usage card answers whenever it was rolled; any other save must still be newer than the
    damage.
  - **B relay — a player's Apply reaches the allies they do not own** (new Part I, `apply.mjs`, setting
    `applyFromCard`, default on). With dnd5e's `allowPlayerDamageTray` on, dnd5e's Apply silently skips
    a target the player does not own (Talo heals Caven: nobody owns another PC here). The Apply press on
    a damage or healing card now goes through the module: owned rows land on the player's client as
    dnd5e lands them; the rest go to the active GM as one query, `pentaryn-aoe.applyRelay` (a manifest
    `relay` row, registered on every client at ready), which applies them with the same multiplier. The
    click is the decision; the player sees one toast only when no GM is connected (or the GM's client
    refused). The GM side reads the damage from the card, checks the sender is the card's author or owns
    its actor, and claims a per-press `requestId` so two GM tabs land it once. Audit line
    `pentaryn-aoe | apply relay`.
  - **Late targets** (replaces the plan's B4 prompt). A card that recorded no targets at use time
    (Heal cast, then Caven targeted) is filled with its author's targets as they target (`targetToken`,
    debounced 150 ms, players only, the newest own untargeted card under 10 minutes old, until
    applied: `system.targets` + `flags.pentaryn-aoe.lateTargets`), so dnd5e's own rows list them; a
    card dnd5e remembered as "selected" is switched to its recorded targets once. An Apply on a card
    with no recorded targets goes to the targets the user holds (the tray's multiplier), else to
    dnd5e's rows; the card then records those targets and is stamped `flags.pentaryn-aoe.applied`.
  - **B5 — type the total** (`apply.mjs` on dnd5e's tray, `tray.mjs` on the GM save tray). Every target
    row gets one small total, pre-filled with the rolled total; a typed number replaces it for that
    row's Apply, each damage type keeping its share (`core.scaleDamages`, whole numbers that add up),
    the multiplier still applies on top, and the number that would land shows beside it only while it
    differs. On the GM tray the row's total is `row.amount` (`setRow(…, { amount })`, cleared by the
    rolled total, a blank or null; the `.pa-amount` cell shows the result). Players report totals, not
    die faces, so this is how a real roll gets in.
  - Goldens: `hooks` (J1's `dnd5e.postUseActivity`, Part I's `dnd5e.renderChatMessage`, `targetToken`,
    `deleteChatMessage`), `describe` / `surface` (`applyRelay`, the two settings, `setRow`'s `amount`,
    the two flags), `settings-register`, `tray-html` / `tray-host` (the row's total). New tests:
    `card-apply.test.mjs`, `early-saves.test.mjs`; J1 cases in `attacks.test.mjs`, B5 in
    `tray.test.mjs`, the pure rules in `core.test.mjs`.

- **0.5.1. Code review of 0.5.0's Part H and instantaneous areas** (declared, aoe-area-walls,
  dnd5e-instant-area-stationary; pinned by `test/area-walls-review.test.mjs`).
  - **A rotated or resized cube is clipped from its new centre.** During an update core passes the
    NEW shapes to `RegionDocument#_computeShapeConstraints(changes)` (a ShapeConfig resize; a handle
    Shift/Ctrl-scrolled, where `TokenDocument#rotateMany` rotates the attached region), while
    `this.shapes` is still the old data, and Part H built the cube's centre from `this.shapes`. A second
    wrap, of `_computeShapeConstraints`, holds `changes.shapes` for the length of the call (restored in
    `finally`); `core.areaClipOrigin` uses the shape whose origin core passes and reads its fields one
    by one. Adjustments row `aoe-area-walls` gains the marker `wallsShapesWrapped`. Golden `describe`
    gains the patch and the setting's new doc line.
  - **A monster's aura keeps following it.** `dnd5e.createMeasuredTemplate` detached every "inst"
    emanation, also a passive monster aura such as a ghast's Stench (Matron Forgotten, the Starved
    Prisoner). Only a spell item's area is left where it was cast now (`core.instantSpellArea`).
  - **Changing *Walls that stop a spell area* re-clips placed areas.** The setting's `onChange` (every
    client) asks core's `Level#updateRegionShapeConstraints(["move"])` for each level that client
    views, on a scene with a template area; core's designated user writes, as when a wall changes. Not
    the active GM alone: a constraint computed for a level nobody views comes back `null` (unclipped),
    and core prefers a user who views the level. An area is re-clipped only when a user who may edit
    it is viewing its level; any other keeps its old outline (docs say so now, second review).
  - **An uninstalled copy stops acting** even when its wrapper cannot be removed because another module
    wrapped on top: both Part H wrappers pass straight through to core once `patch` is null.
  - **The rule is read once per constraint**, then handed to the polygon in its config, not read per
    edge.
  - **Second review.** The held shapes are keyed to their region (`{ doc, shapes }`, read only by that
    region's constraint), so another region's constraint computed meanwhile reads its own shapes. The
    settings' `onChange` handler table lives on a shared global
    (`globalThis[Symbol.for("pentaryn-aoe.settingHandlers")]`): Foundry keeps the onChange of the copy
    that registered the row, so a hot-patched copy's handler now receives the change. aoe.md documents
    that a non-spell "inst" aura (a ghast's Stench) follows its creature and is removed with the Token
    HUD eraser.

- **0.5.0. Only total cover stops a spell area** (declared, aoe-area-walls, feedback 7v8jPs, RpnWw3,
  3arqpV). dnd5e 6 clips every template region with the core `move` restriction, so every wall
  that stops a token clipped every area. That included the invisible (move-only) walls that drew the camp-site's
  rope bridge (64 of them) and the Common Room's furniture (150). Burning Hands and Cone of Cinders stopped at the
  bridge, Web "anchored" to the tables, and Hypnotic Pattern was cut by both. A cube was also clipped from
  its corner (a rectangle's origin) while a sphere was clipped from its centre, so one spell was
  "blocked by a corner" and the next was not. New Part H (`walls.mjs`) wraps
  `RegionDocument#_computeShapeConstraint` for template regions only: with the new setting
  `areaWalls` = `cover` (default), a wall clips an area only if it blocks movement **and** sight,
  and a cube is clipped from its centre. `move` restores dnd5e's clip and `none` turns clipping off. The same rule
  applies to every spell; a wall that is total cover also hides a visual effect. Areas placed before
  0.5.0 keep their old outline until moved. Adjustments row `aoe-area-walls`. Pinned by
  `test/area-walls.test.mjs`.
- **A handle can be dragged back onto the grid** (declared, aoe-drag-snap, feedback 7v8jPs). Core
  snaps a half-square token only to quarter-square spots wholly inside one square. A handle centred
  on a grid corner (a 20 ft cube, a Fireball) straddled four squares, so the first drag shifted the
  area a quarter square and it could never land on the grid again. On a square grid the handle now
  sits in the square below-right of such a corner (`core.handleTopLeft`). Goldens `create-handle`,
  `handle-cases` and `ready-calls` change only in the handle's x/y.
- **An instantaneous emanation stays where it was cast** (declared, aoe-instant-stationary,
  feedback WSMeuV). dnd5e 6 attached Thunder Step's 10 ft emanation to Marwen. It followed her after
  the teleport and for the rest of the session. It had no handle, no Active Effect, and with no
  damage rolled `instantCleanup` never ran. On `dnd5e.createMeasuredTemplate` an instantaneous
  activity's region data loses its `attachment.token`, so the area stays put and gets a handle.
  Lasting auras (Spirit Guardians) still follow their caster. New setting `stationaryInstantAreas`
  (default on). Adjustments row `dnd5e-instant-area-stationary`.
- **A Token HUD eraser for areas that follow a token** (declared, aoe-token-hud-remove, WSMeuV).
  A token that carries a template region the user may delete gets "Remove the spell areas on this
  token" on its HUD. Two hooks are new (`dnd5e.createMeasuredTemplate`, `renderTokenHUD`): goldens
  `hooks` and `describe` change by them, by the two settings, and by the Part H patch.
  The stuck Thunder Step area already in the world is removed by
  `scripts/foundry/fixes/2026-10-19-aoe-areas.js` (eval-js body, dry run by default).

- **A damage card deleted mid-resolve is a clean cancel** (declared, aoe-vanish-1): deleting the
  card after the 750 ms resolve claim had settled but while `resolve()` was still running (for
  example while Careful Spell's flag was being cleared) logged one swallowed console error
  (`pentaryn-aoe | createChatMessage`, the bare-state write refused because the card was gone),
  and a card deleted while the monster saves were rolling still rolled the rest and posted the
  players' request card. Now `resolve()` stops quietly once the card is gone (a `resolve: card
  deleted` trace), rolls no more saves, posts no request card, supersedes no older tray and applies
  nothing; a queued resolution write to a card deleted in flight returns null without logging. A
  write refused while the card still exists is still an error. A delete this client has asked for
  counts as gone at once (`preDeleteChatMessage`), not when the server confirms it: the FIX-W3 live
  check deleted the card from the first goblin save's `createChatMessage` hook and the next
  goblin's save was still rolled during that round trip. Two hooks are new
  (`preDeleteChatMessage`, `deleteChatMessage`): goldens hooks and describe change only by them.
  Pinned by `test/vanished-card.test.mjs`.
- **A placed area shows in the dark, and its handle is named after the caster's token**
  (declared, AO-3-handle-dark): a handle had no light and no sight, so in darkness the caster
  could not see the area they had just placed, and the handle (the name dnd5e's chip shows) was
  "<Spell> (<user name>)". A new handle now gives a faint dim light of half a square (the scene's
  grid distance ÷ 2, no bright), so the handle and the area's outline show to anyone who can see
  that spot, and is named "<Spell> (<caster's token name>)" (dnd5e 6: the origin token; 5.3.3:
  the activity's actor's token on the scene), falling back to the author's user name, never an
  actor name. Handles placed before this keep no light. Goldens create-handle and ready-calls
  change only in the handle's `light.dim`. Pinned by `test/handle-dark.test.mjs`.
- **The handle actor's invariants are written once** (declared, aoe-mnt-10): the "Area handle"
  name sat in both the actor and its prototype token, and its tiny size and hover were spelled
  out in the new actor's data and again in the repair table. One `HANDLE_NAME` and one
  `HANDLE_SYSTEM` now feed `handlePrototype`, `handleActorData` and `handleActorRepairs`; the
  created actor is byte-identical (create-handle/ready-calls goldens unchanged). Pinned by
  `test/areas.test.mjs`.
- **A handle is found however its attachment is stored** (declared, aoe-mnt-7): `handleFor` read
  the region's attached token by hand and missed a bare token id on the live region, falling back
  to the region flag. It now reads it through `core.attachedTokenId`, which handles the live
  document and the source string alike; the flag fallback stays. Pinned by
  `test/areas.test.mjs`.
- **No-stacking looks up fewer spells** (declared, aoe-perf-2): with `noSpellStacking` on, every
  new effect looked up the source spell of every effect already on the actor before discarding
  the ones with another name or switched off. It now drops those first and looks up only enabled
  effects of the same name; what gets replaced is unchanged. Pinned by
  `test/stacking-filter.test.mjs`.
- **The settings migration logs through the kit log** (declared, R8): its one line was a raw
  `console.info`, the only console call in `settings.mjs`. It now goes through
  `makeLog(MODULE).info`; the console line is byte-identical (`pentaryn-aoe | npcSaveRollMode
  gmroll → gm`, still pinned by `test/glue.test.mjs`). Pinned by `test/settings-log.test.mjs`.
- **The tray's multiplier labels live beside the multipliers** (declared, EXT-3): the ×0 ×¼ ×½ ×1
  ×2 labels were a separate table in `tray.mjs`, so a multiplier added to `core.MULTIPLIERS` would
  have rendered an "undefined" option. They are now `core.MULTIPLIER_LABELS` (frozen, keyed by
  `MULTIPLIERS`) and the tray imports them. The tray's HTML is unchanged. Pinned by
  `test/multiplier-labels.test.mjs`, which checks every multiplier has a label.
- **The sweep makes a scene's missing handles in one go** (declared, AC-7): it created each
  missing area handle with its own Token create and its own Region update — two round trips per
  template region. It now creates every missing handle in one Token create (keepId) and attaches
  them all in one Region update. If another GM tab made one of them first, the rest are created one
  by one (that "already exists" refusal swallowed per id) and every handle is still attached.
  `golden/ready-calls.json`'s attachment write is now one `updateEmbedded`. Pinned by
  `test/sweep-batch.test.mjs`.
- **Changing the area is no longer undone by a save landing at the same moment** (declared,
  AC-6): `resolve()` wrote the new area's resolution straight to the damage message, outside the
  per-message write queue, so a write already running on the old area (an NPC save, a row change)
  could land after it and bring the old area's rows back. The fresh write now waits its turn in the
  same queue. Pinned by `test/resolve-queue.test.mjs`.
- **The area picker says why it does nothing on a second GM tab** (declared, aoe-edge-8): on a GM
  tab that is not the active GM, picking another area on the tray did nothing, yet the select kept
  showing the new choice. That tab now gets a warning toast (new string
  `PENTARYN_AOE.Tray.NotActiveGm`, "Only the active GM can change the area.") and the select goes
  back to the area the tray still uses. The tray keeps rendering on every GM tab. README API row
  says so.
- **A bad multiplier no longer lands on a tray row** (declared, aoe-edge-7): `setRow` turned a
  null or blank multiplier into ×0 and `'abc'` into NaN. A multiplier that is not one of the
  tray's (0, 0.25, 0.5, 1, 2) now leaves the row unchanged (tick included), logs
  `pentaryn-aoe | setRow multiplier` at warn and returns null. The tray's select only sends valid
  values, so nothing changes at the table. README API row and the manifest's `nullWhen` say so.
- **Two GM tabs no longer log or abort on each other's deletes** (declared, aoe-edge-4): with the
  MCP bridge tab and a GM browser tab both open, the losing tab's delete of a handle, of a
  concentration spell's areas or of a sweep's orphan handles was refused "does not exist", logged
  at error level, and stopped the job (the next scene's areas, the rest of the sweep). That
  refusal now counts as done: nothing is logged and the job carries on. The sweep's
  `orphansDeleted` counts only what this tab deleted. README "Two sessions" says so.
- **Careful Spell is always a declaration; the picker names only creatures the player can see**
  (declared, MM-1; Joe's metamagic ruling 2026-10-12): skipping the pick (Skip, or closing the
  picker) or having nobody to pick used to store and post nothing, so the use left no card and an
  older choice stayed armed. Now the public card posts with nobody chosen (new string
  `PENTARYN_AOE.Careful.CardNobody`), the empty choice replaces the earlier one, and the next save
  tray uses it up with nobody protected (the GM shields rows by hand). A player's picker leaves out
  tokens out of their sight on their canvas, as well as hidden ones. `Careful.PickCancel` became
  `Careful.PickSkip`; `Careful.Nobody` is gone.
- **A publish throw at ready no longer skips the rest of ready** (declared, R7): on the normal
  ready path a `publishNamespace` throw (e.g. a frozen `game.pentaryn`) is caught and logged
  `pentaryn-aoe | publish`; the Argon guard, the settings migration and the startup sweep still
  run. The hot-patch `install()` still rejects with it (glue.test W2-K1).
- **A save with no DC is neither a pass nor a fail** (declared, R5): with a null DC a monster save
  came out a success (`total >= null`) and a player save a failure (`!!null`). One
  `Number.isFinite(res.dc)` guard (`saveSuccess`) now serves `rollOne` and `onSaveMessage`; the
  save is recorded with `success: null`, `fillSave` keeps that null and the multiplier '?', so
  Apply skips the row until the GM sets it. The tray shows the total with a '?' (new string
  `PENTARYN_AOE.Tray.NoDcTip`); `summary()` reports `success: null`. README Part B says so.
- **One monster save that fails to roll no longer throws away the rest** (declared, R4): a
  rejecting `rollSavingThrow` threw out of `rollNpcSaves`, discarding every save already rolled in
  that pass, and `resolve()` then skipped the player request card and `autoApplyNpc`. Each row is
  now caught on its own (`log.warn("npcSave", row name, err)`), the saves that landed are written,
  the request card and auto-apply still run, and the failed row stays '—' for a re-roll. README
  API row says so.
- **`selfApply` accepts a message id** (declared, R2-selfApply): the manifest and describe already
  said `ChatMessage|id`, but an id string was used as the card itself and nothing was applied.
  It now looks the id up first, as `cardEffects` and `pendingFor` do; an unknown id returns null.
  README API row says so.
- **`latestResolution({ sceneId: "current" })` answers null when this client views no scene**
  (declared, R3): it dropped the scene filter and returned the newest tray from any scene.
  "current" means the viewing client's scene; with none there is none. A caller that wants any
  scene passes no `sceneId`. Manifest `nullWhen` and README say so.
- **Two GM tabs no longer fight over player saves or double-apply a tray** (declared, AC-1): with
  the MCP bridge tab and a GM browser tab both active, each matched a player's save into the tray
  from its own copy (a stale tab could undo an Apply or a GM edit), and Apply in both tabs damaged
  the same rows twice. A save that answers a waiting row is now claimed
  (`claimMessage(save, "matchSave")`) and only the winning tab fills the row (the row fills about
  0.75 s after the roll); `applyRows` re-reads the live resolution before each row's damage, skips
  a row another tab already applied, and marks each landed row applied at once. README "Two
  sessions" says so. Live check: two GM tabs, a player answers the Fireball request, the row fills
  once; press Apply in both tabs, each goblin takes damage once.
- **A newly viewed scene is swept even after a failed startup or a GM handover** (declared,
  aoe-edge-3): the `canvasReady` sweep (orphan handles deleted, missing handles made, ownership
  fixed) was registered only after `readyAreas`' awaits succeeded, and only on the GM active at
  ready. `areas.install()` now registers it at setup on every client, gated inside on
  `activeGM.isSelf`; `readyAreas` keeps the handle actor and the first sweep. A hot
  `install({ sweepOnReady: false })` now wires the scene sweep too (it still skips the startup
  sweep). Live check: with a second GM tab active first, close it, switch scenes in the remaining
  GM tab, and a stray handle token on the new scene is removed.
- **A superseded or partly applied tray keeps its area** (declared, aoe-edge-2): the tray's area
  picker re-resolved any tray, so picking another area on a superseded tray revived it, and on a
  tray with applied rows reset them — the same damage could then be applied twice. The picker is
  now disabled (tooltip `PENTARYN_AOE.Tray.AreaLocked`) once the tray is superseded or any row is
  applied, and `resolve(message, { regionId })` on such a tray returns null with that warning toast
  and leaves it untouched. A fresh tray still switches areas freely. Live check: Fireball with two
  areas on the scene, Apply one goblin, the picker is greyed out; a newer Fireball roll greys out
  the older tray's picker too.
- **The API's flags contract names everything aoe touches outside its own scope** (declared,
  EXT-1): `describe().flags.writes` adds `flags.dnd5e.lockSize` (handle tokens) and
  `flags.dnd5e.requestResult` (save rolls threaded under the request card); `flags.reads` adds
  `flags.core.MeasuredTemplate` (5.3.3 template regions). README "Data written" has the two rows.
  Metadata only — no in-game behaviour changes.
- **A cancelled cast that spent nothing but began concentration is cleaned up** (declared,
  aoe-mnt-1): the refund's veto and the refund itself disagreed — the veto stopped dnd5e's
  follow-ups, then the refund did nothing, leaving the concentration and the card. Both now share
  one predicate (spent something OR began concentration); dnd5e's `Activity#refund` runs only when
  something was spent, and the concentration this cast began and its usage card always go (toast
  `PENTARYN_AOE.Refund.Ended`). A no-spend cast with only a non-concentration effect is no longer
  vetoed. Live check: an at-will concentration area spell (no slot or charge), Escape while placing —
  concentration ends and the card disappears.
- **Careful Spell: the player picks who it protects** (declared, aoe-careful-select; Joe's
  metamagic ruling 2026-10-12, supersedes metamagic-disarm): using Careful Spell opens a picker of
  the creatures on the caster's scene (token names, current targets ticked, up to CHA mod, min 1)
  and posts a public card `<caster token> uses Careful Spell: <token names>`. The caster's next save tray
  protects exactly those rows and the declaration ends; a non-save spell leaves it armed, no time
  window, a second use replaces it. Gone: the "caster's side" inference (`carefulTargets`), the bind
  to the next cast, and the `deleteCombat` clean-up. New: a per-row shield toggle on the GM tray
  (`setRow(…, { protected })`; unprotected, a row gets its own save back, or a monster rolls one).
  Live check: a sorcerer uses Careful Spell, picks one goblin and one ally, casts Shield, then
  Fireball — the card names both, the tray shows both protected, the next Fireball protects nobody.
- **The tray's buttons fit the chat sidebar** (declared, play test AO-1 / tray-overflow,
  2026-10-12): Re-roll NPC saves, Ping and Apply were squeezed into one row at a fixed 24 px, so at
  the default sidebar width a label broke onto a second line and spilled out of its button. The
  row now wraps a whole button onto the next line and a button grows with its label (`aoe.css`,
  own `.pentaryn-aoe-tray` rules only). Live check: GM tab, default sidebar width, a Fireball
  tray — every label sits inside its button, on one line; widen the sidebar and the three share
  one row again.
- **Careful Spell ends after the next spell** (declared, play test AO-1 / metamagic-disarm,
  2026-10-12; Joe's ruling: metamagic ends after use): out of combat a used Careful Spell stayed
  armed for 10 minutes and protected whichever save spell came next. The caster's next spell cast
  now takes it (bound to that usage card, `postUseActivity`), in or out of combat, with no time
  window; a non-save spell spends it, a placement cancelled before it lands does not.

- **A handle drag keeps the area's direction** (declared, play test AO-3, 2026-10-12): handle moves
  are made with `autoRotate: false` (`preMoveToken`). Core's `tokenAutoRotate` turned the dragged
  handle to face its path, and the attached region turned with it (a cone aimed south-east swung
  north). Row `core-token-auto-rotate-handle`.
- **Two quick Apply clicks damage each row once** (declared, review aoe-edge-1, 2026-10-12):
  `applyRows` calls for one tray are serialised in the tab, so the second skips the rows the first
  applied (each row used to take the damage twice). A rejection still reaches its caller; an Apply
  stuck for 10 s (`APPLY_WAIT_MS`) no longer holds later ones back.
- **A failed row no longer re-damages the others on retry** (declared, review R1, 2026-10-12): when
  one row's `applyDamage` rejected, the rows already damaged in that Apply were never marked applied,
  so the next Apply damaged them again. Each row is now caught on its own: the rest still land and
  are marked applied, a warning toast names the rows that failed, and the first error still rejects.

## 0.4.0 — 2026-10-12 (migrated to the addon blueprint, wave 4; released by the Wave 7 restart batch)

The Wave 7 batch bumped `module.json` and `core.VERSION` to 0.4.0 together and added the
`flags.pentaryn` blueprint keys (`flagScope` `aoe` → `pentaryn-aoe`, a declaration fix),
`recommends` enhancedcombathud and item-piles, `styles/aoe.css` (moved) and `verified: "14.369"`.

Code, tests and the API changed; the table behaviour did not, except the declared
items below (each its own commit; live checks in the migration guide §5).

- **Blueprint layout.** Kit 1.0.2 vendored (full tier + election, patch). Features export
  `install(reg, ctx)` / `uninstall()` and are wired from `FEATURES` in the entry; hooks go through
  the kit registry (aoe's guard kept verbatim as `guardSwallowAsync`); `claimMessage` is the kit's.
  Adapters `scene-adapter.mjs`, `messages-adapter.mjs`, `argon.mjs`; Careful Spell is its own
  feature, `careful.mjs`. Settings are one `SETTINGS` table; `lang/en.json` is nested and every key
  is a full `_loc` literal. One kit log for every console line (same text).
- **API** (declared D-A3, W2-K1): built from `api-manifest.mjs`, frozen, published synchronously at
  `ready` through `publishNamespace` (module.api canonical, `game.pentaryn.aoe` the alias, the
  `pentaryn-aoe.ready` / `pentaryn.ready` events). Every 0.3.1 method keeps its name, parameters
  and return shape; new reads `resolution`, `latestResolution`, `summary`, `isHandle`, `inspect`;
  kit members `describe`, `settings`, `trace`, `version`, `contract`. `pendingFor` takes an optional
  `{ effects }`.
- **Hot patch** (declared D-A2, D-A4, D-A7): `uninstall()` now restores `ui.ARGON.bind` and
  `RegionLayer#placeRegions` and removes the late-Argon `canvasReady` fallback, so a hot-patched
  copy aims Self cones again.
- **Two GM sessions** (declared D-A6, -7): the "Area handle" actor is created with the fixed id
  `pentarynAoeHndl0` and `keepId`. v14 does not refuse a world actor whose id exists: the later
  create replaces it with the same data (a second `createActor`), so one actor results.
- **Performance**: one `game.actors` scan per resolve instead of one per token (-2); one effects
  fetch per fresh card render (-14); the sweep shares template regions in one batched write and the
  Careful clean-up batches its actor writes (declared, C59); mutate's queue map drops settled
  entries (declared, -6).
- **Logging**: `CONFIG.debug["pentaryn-aoe"]` traces why the save pipeline stopped (-8); the tray
  and eraser listeners, the delete backstop, the Careful bind and refund's clean-up log instead of
  swallowing (-9; the refund one declared).
- **Failure path** (declared D-A1): a resolution without damages applies nothing instead of
  throwing.

## 0.3.1 — 2026-10-11 (usability re-run)

Part F refund, Part G aim, Careful Spell, same-usage superseding, the players' status line,
untargeted touch spells on the caster, no same-spell stacking, Careful clean-up on `deleteCombat`.

## 0.3.0 — dnd5e 6

Typed chat messages, region templates, the PRIORITY Escape binding, two-session claims.
