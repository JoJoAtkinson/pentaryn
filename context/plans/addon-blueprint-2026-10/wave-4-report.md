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
