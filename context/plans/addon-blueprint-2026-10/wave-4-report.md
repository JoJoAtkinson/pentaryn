---
title: Addon blueprint wave 4 report (riders, aoe, transform, combat)
status: in-progress
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration]
---

# Wave 4 report

**Read this when:** you need what wave 4 did, what is still open, and what waits for Joe.


## Open for Joe — aoe (checkpoint lane, 2026-10-11)

- **aoe checkpoint approval.** Guide S1.5 says the checkpoint is "committed only with Joe's
  approval". The workflow committed it on `migrate/wave-4` as `7a12ffad` (never main); review the
  goldens under `foundry/module/pentaryn-aoe/test/golden/` before the branch merges.
- **Follow-up (needs migrate/wave-3):** aoe's `isHandleTarget` oracle rows are pinned in
  `pentaryn-aoe/test/core.test.mjs` (`HANDLE_ORACLE`). Pinning portals' and creatures' `isAoeHandle`
  copies against the same rows (aoe-movement-portals-43, transform-creatures-30) needs wave-3 code;
  not built here.

## Open for Joe — combat (checkpoint lane, 2026-10-11)

- **combat checkpoint.** Committed on `migrate/wave-4` as `6e802ebb` (never main), after the runner
  commit `12e86e58`; the guide's Result has the detail. Review the goldens under
  `foundry/module/pentaryn-combat/test/golden/` before the branch merges.
- **W4-C1 (new, found by the checkpoint): Adv / Dis pressed on the swing strip while a swing's roll
  window is open is lost.** `sequenceReducer`'s `rolled` resets `adv`, so the swing that was already
  open clears it and the next swing rolls without it, although the strip's hint says "for the next
  swing only". Pinned as KNOWN in `pentaryn-combat/test/sequence.test.mjs`, with a todo test for the
  fix. **Default: fix it** as one `[declared]` standalone commit after the refactor (keep `adv` when
  it was set after the rolled swing's config was built). Live check: start a Full Attack, press Dis
  while swing 1's window is open, roll swing 1; swing 2's window opens on Disadvantage.
- **Seen, not a decision unless Joe wants one:** a Martial Arts, Hew or Pole Strike follow-up emits
  `pentarynCombat.bonusSpent` twice (the roll's counting and `runFollowUp` both emit). hud's listener
  only marks the Bonus pip used, so nothing shows. Default: keep, and S9 (events table) states the
  count.
- **Follow-up (S8, not the checkpoint):** combat's helper-token check reads
  `flags["pentaryn-aoe"].handle` directly (`turnflow.mjs:315`, pinned in `turnflow.test.mjs`). Pinning
  it against aoe's `HANDLE_ORACLE` rows is guide S8's `isAoeHandle` step (combat-riders-36).

## aoe — migration lane (2026-10-11)

Migrated from the checkpoint `7a12ffad` to `47bc85c7` on `migrate/wave-4` (26 commits; record in
[`migrate-pentaryn-aoe.md`](migrate-pentaryn-aoe.md) Result). Score 58.7 % → **89.6 % (43/48)**;
the five left (C07, C09, C37 → W7; C32, C47 → adjustments batch) are shared-file edits handed to the
integrator. 400 node:test pass, 0 todo; legacy 160 pass. Every KNOWN / todo pin from the checkpoint
was flipped in its own `[declared]` commit (D-A1, D-A2, D-A3 + W2-K1, D-A4, D-A6, D-A7, -6, -9) or
resolved by S2 (VERSION). 8.5: the sweep's region writes and the Careful clean-up are batched
(declared); 8.6: Careful Spell split into `careful.mjs`.

**Red until the integrator lands the adjustments edit:** repo pytest
`test_the_real_registry_matches_the_code` reports `aoe-argon-handle-bind: no file still contains
'guardArgonBind'` (the guard moved to `argon.mjs`); the other entries in that test are other lanes'.

### Open for Joe — aoe (migration lane)

- **Review the declared items before merge** (each its own commit, live checks in the guide §5):
  D-A3 + W2-K1 (API published synchronously at ready via `publishNamespace`; a frozen
  `game.pentaryn` now makes the hot patch reject), D-A2 / D-A4 / D-A7 (hot-patch uninstall now
  restores Argon's bind and `placeRegions` and removes the late-Argon fallback), D-A6 (fixed handle
  actor id `pentarynAoeHndl0`), the two 8.5 batches, D-A1, -6, -9 (refund warns).
- **Version.** `module.json` stays 0.3.1 (W7 owns it); the new API rows say `since: 0.4.0`.
  Default: bump to 0.4.0 in the W7 batch, with `core.mjs` `VERSION` in the same commit (core.test
  pins them equal).
- **Follow-up (needs migrate/wave-3):** pin portals' and creatures' `isAoeHandle` copies against
  `foundry/module/pentaryn-aoe/test/fixtures/handle-oracle.json` (column `prop`); combat's
  `turnflow.mjs` helper check against column `handle` (combat S8).
- **Seen, not changed:** pentaryn-combat reads aoe's `autoDamageOnHit` with `game.settings.get`
  (its C23). aoe now publishes `settings()`; combat can read `apiOf("pentaryn-aoe")?.settings().autoDamageOnHit`
  in its own migration.

### Live phase — aoe (planned, not run)

1. Reload as GM with the importer active: `game.pentaryn.aoe.describe()` lists 24 methods;
   `game.modules.get("pentaryn-aoe").api === game.pentaryn.aoe`; `describe().version` = module.json.
2. Fireball on 3 goblins and a PC: tray, NPC saves (GM-only), the player's request card, Apply;
   every tray, request-card, eraser and Effects-highlight string reads as before (S3 lang); the
   settings menu shows the same 17 rows in the same order.
3. `game.pentaryn.aoe.summary(<damage message id>)` and `inspect(<that id>)` read the tray.
4. Hot patch (README recipe): `uninstall()` → `ui.ARGON.bind` and `RegionLayer.prototype.placeRegions`
   are core's/Argon's own again; after the import, drag a handle (HUD stays on the caster, D-A2),
   cast Cone of Cold from a token (the point stays on the caster's edge, D-A7), Escape still cancels
   and refunds. Repeat with Argon loading after aoe (D-A4).
5. D-A6: delete "Area handle", open the bridge tab and a GM browser tab, reload both: one actor,
   id `pentarynAoeHndl0`. On the existing world the old actor is kept (found by flag). Also watch
   for a duplicate `createActor` (`Hooks.on("createActor", a => console.log(a.id))` in both tabs
   before the reload): v14 lets the later keepId create replace the world record, so two events
   for `pentarynAoeHndl0` are expected and harmless; record whether it happened.
6. 8.5: on a scene with several pre-module template regions, `sweep(canvas.scene)` shares them in
   one Region update.

## Open for Joe — riders (migration lane, 2026-10-11)

Migrated offline (guide S2–S9 + the declared fixes); 47.8 % → **89.6 % (43/48)**; the guide's
Result has the commit list. Defaults apply if Joe says nothing.

| # | Item | Default | Why |
|---|---|---|---|
| W4-R1 | Riders' patch rows renamed to the D2 shape (`riders-summon-place-default`, `riders-summon-wildcard-preview`, `riders-argon-tooltip-item-rolldata`, `riders-argon-metamagic-no-picker`) and the two non-patch `riders-` rows to `dnd5e-riders-arcane-recovery-picker` / `argon-riders-long-casts` | **take the renames** (integrator edits below) | D2 was decided after the guide; the attunement precedent dropped the package prefix the same way |
| W4-R2 | Once-per-casting guard index (guide §4, no finding id) | **not built** | An index needs a chat-message hook (flips the frozen `golden/hooks.json`) or goes stale on delete-plus-create; the scan runs only on attack damage rolls |
| W4-R3 | C59: `setType`, `retireManual`, `installBattleMedic` write one item / activity at a time | **leave** | One-off GM setup commands; batching moves frozen per-item write pins (W3-SE2 precedent) |
| W4-R4 | C56: the Battle Medic relay is a hand `CONFIG.queries` assignment (through `guarded`) | **keep until the kit forwards the sender** | Same kit gap as journal (W2-J2) |
| W4-R5 | D7 for riders (`#tooltip` selectors → `lib/argon-tooltip.css`) | **after combat's argon-kit lands** | combat's 8.6 is in progress on this branch |
| W4-R6 | Version bump 0.2.0 → 0.3.0 for the CHANGELOG's "Unreleased" | **bump in the Wave 7 batch**, with `riders-core.mjs` `VERSION` in the same commit | `VERSION === module.json` is pinned (constants.test) |
| W4-R7 | §5.9.4 / C61, two tabs on the GM account: `concentration.mjs` `cleanupSummons` (`deleteActiveEffect`, gated on `activeGM.isSelf`) runs in every tab of the active GM's account (the MCP bridge tab and a GM browser tab), so both tabs call `scene.deleteEmbeddedDocuments("Token", ids)` for the same summons | **accept, no claim** | The second delete finds the tokens gone and fails inside its `.catch`. The only visible result is a second `removing N summon token(s)` info line and a `summon cleanup failed` warning in that tab's console. No document ends up wrong. A claim needs `lib/election.mjs`, which riders does not vendor yet, and a flag write on the effect's actor that the frozen concentration pins don't allow. If Joe wants it, it would be a `claimDocument` keyed on the effect's id, never a fixed key on the actor (§5.9.2: a key is single-use per document) |
| W4-R8 | §5.9.4 / C61, two tabs on the GM account: `concentration.mjs` `autoBreak` (`createChatMessage`, initiator gate `userId === game.user.id`). When the GM's account rolls the concentration save (the bridge, or the GM rolling an NPC's save), the listener runs in every tab of that account, so `actor.endConcentration()` and `message.update({ "system.outcome": "broken" })` each run twice | **accept, no claim** | The setting is off by default (`concentrationAutoBreak`). The second `endConcentration` finds no effect left: it answers `[]`, or its delete fails and is caught as a `concentration auto-break skipped` warning. The message update writes the same value. Nothing is ended twice. The fix if wanted is `claimMessage(message, "autoBreak")`, since the chat message is the one-time event. It needs `lib/election.mjs` vendored, and it adds a settle of about 750 ms before the break: a [declared] change after the checkpoint |

### Integrator: riders shared-file edits (exact)

`foundry/adjustments.yml` (rows today at :145-154, :421-470, :719-739, :796-861):
- `argon-tooltip-item-rolldata` → id `riders-argon-tooltip-item-rolldata`, `files: [foundry/module/pentaryn-riders/patches.mjs]`, `markers: ["_prItemRollData", "tooltipItems", "_prTooltip"]`.
- `argon-metamagic-no-picker` → id `riders-argon-metamagic-no-picker`, `files: [foundry/module/pentaryn-riders/patches.mjs, foundry/module/pentaryn-riders/table-core.mjs]`, `markers: ["skipsTargetPicker", "METAMAGIC", "_prTargets"]`.
- `dnd5e-summon-place-default` → id `riders-summon-place-default`, `files: [foundry/module/pentaryn-riders/patches.mjs, foundry/module/pentaryn-riders/table-core.mjs]` (markers unchanged).
- `dnd5e-summon-wildcard-preview` → id `riders-summon-wildcard-preview`, `files: [foundry/module/pentaryn-riders/patches.mjs]` (markers unchanged).
- `riders-argon-ritual-adept-list`: `files: [foundry/module/pentaryn-riders/rituals.mjs, foundry/module/pentaryn-riders/patches.mjs]`.
- `argon-shared-uses-badge`: `files: [foundry/module/pentaryn-riders/argon.mjs]`.
- `argon-collapse-on-area-placement`: `files: [foundry/module/pentaryn-riders/argon-tidy.mjs, foundry/module/pentaryn-riders/argon.mjs]`.
- `riders-arcane-recovery-picker` → id `dnd5e-riders-arcane-recovery-picker`; `riders-argon-long-casts` → id `argon-riders-long-casts` (files, markers unchanged).
- `dnd5e-chat-message-types`: replace `foundry/module/pentaryn-riders/riders.mjs` in `files` with `damage-riders.mjs`, `card-note.mjs`, `concentration.mjs` (same folder).
- New (combat-riders-16 riders half; not patches, so package prefixes): `dnd5e-riders-damage-tray-preset` (`tray-preset.mjs`; `getTargetOptions`, `dnd5e.preCalculateDamage`), `dnd5e-riders-roll-term-riders` (`damage-riders.mjs`; `postDamageRollConfiguration`, `resetFormula`), `dnd5e-riders-sheet-hit-dice` (`hd-sheet.mjs`; `meter.hit-dice`, `renderCharacterActorSheet`), `core-riders-query-battle-medic` (`battle-medic.mjs`; `CONFIG.queries`). Each: `modules: [pentaryn-riders]`, `check: make foundry-riders-check`, `retire_class: safe`, what/why/native_when from guide S8.
- Until these land, `test_the_real_registry_matches_the_code` and `make foundry-adjustments-check` are red for the four riders rows above (plus the aoe/combat lanes' own moves).

Wave 7 restart batch (`wave7-restart-batch.md` riders row; `module.json`):
`flags.pentaryn = { tier: "full", namespace: "riders", flagScope: "pentaryn-riders", cssPrefix: "pr-", generation: 14 }`;
`relationships.recommends` enhancedcombathud + enhancedcombathud-dnd5e with the guide S10 reasons;
`styles: ["styles/riders.css"]` + `git mv riders.css styles/riders.css`; `compatibility.verified: "14.369"`;
`version: "0.3.0"` together with `riders-core.mjs` `VERSION = "0.3.0"` (W4-R6).

`context/foundry/README.md`: re-run `make foundry-module-index` (riders' row: full tier, its methods);
replace the "Table-feedback modules" mention of riders with a routing row to the riders README.
Combat README and `context/foundry/melee.md`: mirror riders' "Which riders module?" table
(combat-riders-17 step 2).

### Live checks for the gated live phase (riders)

1. Reload; `game.pentaryn.riders.selftest().ok`; `game.modules.get("pentaryn-riders").api === game.pentaryn.riders`;
   `describe().patches` lists four, six after an Argon item button renders.
2. Fireball as Marrith: `min2` and `+CHA`, the card note, a fire-resistant target's tray starts ignored.
3. D-r1: Battle Medic on an unowned target, GM online, heals; no GM → the noGM warning.
4. -41: Battle Medic from a player with the bridge tab and a GM browser tab open → one heal, one Hit Die;
   the patient's `flags.pentaryn-riders.relay.<id>.claims` is empty afterwards.
5. -12: `game.pentaryn.riders.report("Esren")` returns her rows; `report("Nobody")` → `null`.
6. -23: Summon Beast, drop concentration → the beast goes; Dodge ending removes nothing.
7. D-r5: Place Summons opens ticked; Animate Dead previews a real skeleton image; Careful Spell has no
   target picker; Scorching Ray's tooltip says 3 rays; a failed concentration save still ends concentration.

## riders — standalone findings lane (2026-10-11)

Guide §4 and every finding in `code-audit-2026-10/riders.md`, checked against the branch:

| Item | Result |
|---|---|
| combat-riders-23 | already applied `6516b872` |
| combat-riders-12 (riders half) | already applied `32a0a8e6`; the additive half (`battleMedic(healer, Actor)` resolving the Actor's token) is new behaviour, not built |
| Once-per-casting guard (W4-R2) | **applied `79e29f8d`**, superseding W4-R2's "not built": dnd5e 6 keeps the index itself (`dnd5e.registry.messages.get(origin)`), so no hook and no `golden/hooks.json` flip. Fallback to the whole-log scan when the registry is missing, answers a non-array, or throws (debug line) |
| C59 batching (W4-R3) | still **leave**: `api.test` pins one `update` per item for `setType` (the last-four-writes oracle) and `deleteActivity` per activity for `retireManual` |
| C37 `#tooltip` selectors / D7 (W4-R5) | **blocked, not Joe's**: combat's argon-kit has landed (`87be8cd4`, `3a29eb4f`), but `vendor.py sync pentaryn-riders --kit argon-tooltip` refuses until `module.json` `relationships` names `enhancedcombathud` (the W7 `recommends` edit). The rule placement is W4-R9 below |
| All other audit ids (-25, -26, -27, -32, -39, -40, -41, -16) | already applied (audit status table) |

Gates after `79e29f8d`: `node test/run.mjs` 173 pass, 0 todo, LEGACY 103 / 22 / 39; conformance
89.6 % (unchanged); `vendor.py check pentaryn-riders` clean.

### Open for Joe — riders (standalone lane)

| # | Item | Default | Why |
|---|---|---|---|
| W4-R9 | Where riders' Argon click-through rule (`#tooltip.ech-tooltip-container`, `#tooltip .ech-tooltip { pointer-events: none }`, adjustments row `argon-tooltip-click-through`) lives under D7 | **keep it in riders.css** (C37 stays failing on those two selectors) | Moving it into `foundry/lib/argon-tooltip.css` makes every Argon hover tooltip click-through whenever combat or transform is on, even with riders off: a kit-wide behaviour change (guide D-r4). If Joe wants it moved: one canonical edit, re-vendor combat/transform/riders, and the adjustments row's `files` gains `foundry/lib/argon-tooltip.css` |

### Integrator — riders (standalone lane)

- After the W7 `module.json` edit (`relationships.recommends` enhancedcombathud, already in the
  riders W7 list above): run `vendor.py sync pentaryn-riders --kit argon-tooltip` and add
  `"lib/argon-tooltip.css"` to riders' `styles` beside `styles/riders.css` (D7: byte-identical copy
  in combat, transform and riders). Riders renders no `.pentaryn-tt` tooltip today, so this is inert
  for riders alone.
- Seen, not mine: `vendor.py`'s refusal for a CSS kit file names it `argon-tooltip.mjs`
  ("argon-tooltip.mjs names enhancedcombathud — add it to module.json relationships first"); it
  should print `kit_file(n)` (`argon-tooltip.css`).
- Optional: `foundry/adjustments.yml` `dnd5e-chat-message-types` could add the marker
  `registry.messages` with `foundry/module/pentaryn-riders/shapes.mjs` in `files` (riders now reads
  dnd5e's message registry); the fallback keeps riders working if dnd5e drops it.

## combat — migration lane (2026-10-11)

Guide S2–S14 plus the §4 standalone fixes, on `migrate/wave-4` from checkpoint `6e802ebb`; code phase
only, nothing live. **argon-kit** (8.6) was written first: `87be8cd4` (`foundry/lib/argon-kit.mjs`,
its test, kit.json no longer defers it); combat vendors and uses it (`eaff3e00`, `3a29eb4f`); riders and
transform can adopt it from that commit. Conformance 50.0 % (base) → 58.7 % (checkpoint) → **91.7 %
(44/48)**, 93.8 % once the S13 adjustments edits land. node:test 237 pass / 0 fail / 0 todo (179 at the
checkpoint, 4 todo), the legacy core suite's fixtures pass, every `modules.check_report('combat')`
gate green. Coverage (node:test, module files): 99.71 / 87.83 / 98.45 L / B / F (checkpoint 99.78 /
87.01 / 98.92). The commit list and deviations are in the guide's Result.

**Known red commits.** `e45b8484`…`1514cd22`: the i18n gate (it scans tests) failed on two not-a-key
strings in the S4 key-table test; node:test was green throughout; fixed in `1514cd22` (the test moved
to its own file, strings built at run time). `c69a5e22`: its own new test was red (the card's author);
fixed in `1992dadb`. `91dd98db`…: `foundry/adjustments.yml` rows still name the moved files until the
integrator's S13 batch lands (as for every lane's files moves).

## Open for Joe — combat (migration lane, 2026-10-11)

| # | Item | Default | Why |
|---|---|---|---|
| W4-C2 | combat-riders-1 (memoise the HUD's per-actor reads per task) | **leave it** for now | Tried and reverted: two frozen hud.test pins mutate the actor and read again in the same task, and a per-task memo returns the stale value. A cache keyed on the actor's data version is a design change, not a mechanical one |
| W4-C3 | C23 / C21: combat still reads `pentaryn-aoe.autoDamageOnHit` with `game.settings.get` | **keep the direct read** | aoe now publishes a kit `settings()` member, but only at `ready`; Foundry renders the chat log before `ready`, so the C23-clean `apiOf("pentaryn-aoe").settings()` read would show a per-swing Damage button on every swing card rendered at load. An aoe event or an earlier publish would let combat switch |
| W4-C4 | combat-riders-36 rest (read aoe's own refund decision) | **wait for aoe** | aoe publishes no refund event or member yet (its `HOOKS` is empty); add `pentaryn-aoe.refunded` (or a `placementCancelled` member) in aoe first |
| W4-C5 | hud's listeners on the events stay on the legacy `pentarynCombat.*` names until `pentaryn-combat 0.4.0` | **keep** | emit fires both names, so each runs once; moving them now flips hud.test's 15 legacy-name simulations; move them in the release that drops the legacy names |
| W4-C6 | D7 tooltip CSS: `lib/argon-tooltip.css` is vendored but not loaded | **load it in the Wave 7 batch** (module.json `styles`) | then transform-creatures-14 step 2 needs no hand copy; until then combat's `pentaryn-tt` class is still styled only by transform.css |
| — | isAoeHandle oracle pin (portals / creatures copies) | follow-up | needs migrate/wave-3 code (overnight plan §2); combat's own `shapes.isAoeHandle` is pinned only against its old inline expression |

**Live checks for the gated live phase (combat).** After `make foundry-combat-sync` + reload:
`game.pentaryn.combat.describe().version` equals module.json; `selftest().ok`; `inspect("<a PC>")` depth
≤ 4. W2-K1: `game.modules.get("pentaryn-combat").api === game.pentaryn.combat` right at ready. B2: a
Full Attack, the Off-hand pip, the Bonus pip and a sequence's end each act once; a macro on
`pentarynCombat.usage` still fires once per swing. D-c2: `plan("<name>")` works, `plan()` returns null.
D-c3: the Sneak Attack auto note and offer button look as before. D-c4: the target-picker label sits at
the pointer. -22: an NPC with Multiattack that uses Action Surge gets its second set of swings. W4-C1:
press Dis while swing 1's window is open, roll it — swing 2 opens on Disadvantage. -38: deleting a
combat clears every combatant's turn / Reaction flags (one update per actor in the console). D-c1:
console only. Argon render order (four listeners across combat and transform) unchanged: watch the
Action bar after a Wild Shape.

### Integrator — combat (review, 2026-10-11)

Shared or other-lane files. Each item is an exact edit for the integrator.

- **`foundry/module/pentaryn-combat/module.json` `description`** (Wave 7 module.json batch, with
  flags.pentaryn, version 0.3.0, compatibility.verified and styles; combat-riders-15). Insert before
  ` Every change is a setting.`:
  ` On the turn: Dash, Disengage, Dodge, Hide, Ready and Shove spend the Action; the Reaction slot is an
  Opportunity Attack; Action and Reaction spells grey their pips; after Quickened Spell the next spell
  spends the Bonus pip; the HUD follows your creature at turn start, and goes back to your caster when
  an area handle or summon you had selected is deleted.` (one line in the JSON string).
- **`foundry/module/pentaryn-aoe/README.md:128`** (aoe lane or integrator): `` (no turn for a helper
  token, `turnflow.mjs`) `` → `` (no turn for a helper token, `turnflow/helper-token.mjs` through
  `shapes.isAoeHandle`) ``. combat's `turnflow.mjs` was split in S6c (`8a29ed7f`).
- **`foundry/module/pentaryn-aoe/test/fixtures/handle-oracle.json` `about`** (aoe lane or
  integrator): `combat's turnflow` → `combat's turnflow/helper-token.mjs (shapes.isAoeHandle)`. Only
  the `about` string changes, no row or column.
