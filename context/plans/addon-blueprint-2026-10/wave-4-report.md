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
   id `pentarynAoeHndl0`. On the existing world the old actor is kept (found by flag).
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
