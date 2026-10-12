---
title: Addon blueprint wave 4 report (riders, aoe, transform, combat)
status: code phase closed
last_modified: 2026-10-12
tags: [foundry, modules, blueprint, migration]
---

# Wave 4 report

**Read this when:** you need what wave 4 did, what is still open, and what waits for Joe.

## Summary (code phase closed, 2026-10-12)

Wave 4 migrated the last four Stage 4 modules to the blueprint: **riders, aoe, transform and
combat**, in that order, with combat's 8.6 `argon-kit` written first and D7's shared tooltip
stylesheet wired in. Following Joe's rule of 2026-10-11, each module's performance,
maintainability, hardening and LLM-read findings were applied in the same wave. Nothing new was
built as a feature. D8 (Starry / Wild Shape expiry on unlinked tokens) is recorded for the live
session only.

This was the **code phase only**. Nothing was synced, built into a deployed path, restarted or run
live, no `module.json` was edited, and nothing was merged into `main`. The live phase is written
down but has not run: [`wave-4-live-plan.md`](wave-4-live-plan.md).

- **Branches.** pentaryn `migrate/wave-4` is `wave-4-base` (`a5a1a906`, origin/main when the wave
  started) plus 182 commits before this report's closing commit `464024ce`. It never merged
  `migrate/wave-3`. The fork's `migrate/wave-4` has **no commits** of its own: it sits at `59ffcf2`,
  where `origin/pentaryn` was when the wave started, and no module guide needed a fork change.
  `origin/pentaryn` has since moved to `2fd6eb0` (the wave-3 bridge lane and the optional fixes,
  merged for the go-live), so the fork branch is now 7 commits behind it. The one fork-side wish (W4-L3, the `pentaryn-read` description) is a
  follow-up.
- **Checkpoints.** riders `67fe16a3`, aoe `7a12ffad`, transform `f06e6b18`, combat `6e802ebb`. None
  of the four had a checkpoint before this wave.
- **No module stopped.** No frozen test went red twice on the same step, and no step was reverted.
  Every edit to a checkpoint test or golden is a `[declared]` commit's named pin, an import path or
  seam shim, a new test beside the old ones, or a flip the guide planned. The integration review
  re-checked each one. **One pin flip carries no `[declared]` tag:** transform `796fdf63` (-23 resolver
  count 4 → 3). Treat it as declared when bisecting.
- **43 `[declared]` behaviour commits** (riders 10, aoe 10, transform 12, combat 11). They are listed
  under "Commit lists" at the end, and each one goes to the live phase.
- **Conformance** (advisory), wave-4-base → checkpoint → lane end → HEAD:
  - riders 47.8 → 54.3 → 89.6 → **91.7 %**
  - aoe 50.0 → 58.7 → 89.6 → **93.8 %**
  - transform 55.6 → 60.0 → 93.6 → **95.7 %**
  - combat 50.0 → 58.7 → 91.7 → **93.8 %**

  What still fails: C07 everywhere and C09 / C37 for riders and aoe, which wait for the Wave 7
  `module.json` batch. Riders also fails C56 (W4-R4, kit gap W2-J2) and keeps two `#tooltip`
  selectors under C37 (W4-R9). Combat fails C21 / C23 on purpose (W4-C3).
- **Gates at the close** (`1d86bd5a`, re-run for this section; all static):
  - `pytest -q`: 1217 passed, 2 skipped, 3 xfailed (baseline 1199 / 2 / 3).
  - `make foundry-modules-check`: all 20 modules pass their gates.
  - `node test/run.mjs`, exit 0 each, 0 fail, 0 todo: riders 175 plus legacy 103 / 22 / 39; aoe 411
    plus legacy 160; transform 248 plus legacy 155; combat 244 plus legacy 326 fixtures.
  - `make foundry-lib-check`: green, 0 todo. `make foundry-adjustments-check`: green.
    `make check-context`: OK, 4 old warnings. `vendor.py check --all`: every vendored kit identical.
  - Fork: unchanged, so nothing to run. Its typecheck is red at baseline for an unbuilt
    `shared/dist`, not a code fault (setup record).
- **Open for Joe:** the consolidated table near the end ("Open for Joe — consolidated") has one row
  per item with a recommended default. Six rows are closed, and W4-C8 is half closed. Only W4-L1 and W4-L2 must be
  answered before the live phase runs.

**How this file reads.** The sections between this summary and "Per module (code-phase close)" are
the lanes' own records, appended in the order they ran (checkpoints, each migration lane, D7, the
integrator, the integration review, the live-phase preparation). The closing sections pull them
together: Per module, Merge notes, Open for Joe (consolidated), What wave 5 starts with, Follow-ups
that need wave-3 code, Live plan, Known red commits, and Commit lists.


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
| W4-C7 | §5.9.4 / C59: `turnflow/boundaries.mjs` sweepOrphanFlags awaits one `actor.update` per actor in a loop (through `dropCombatFlags`, which hides it from the C59 scan); `offhand.mjs` seedAll awaits one `setFlag` per character | **keep one write per actor** (review, 2026-10-11) | seedAll: batching breaks a frozen checkpoint pin. shapes.test "seedAll … a failure is warned per actor" and golden `seed-all.json` require one actor's failed write to leave the others seeded, and a single `Actor.updateDocuments` fails as a whole. sweepOrphanFlags: the guide's -38 chose one write per actor and handed it to the live checks as such. After the first sweep almost no actor carries stale flags, because the end-of-combat cleanup has already cleared them, so a batch saves about nothing. It would also cost a fixture `Actor.updateDocuments`, a flip of golden `ready-calls.json`, and the per-actor isolation. If Joe wants it: one [declared, perf] commit that builds `[{ _id, ["flags." + MODULE]: { k: _del } }]` and calls `Actor.updateDocuments` once, pinning the write count in flag-cleanup.test. The scan blind spot (a per-document write behind a local helper) is a conformance.py note for the integrator, not a combat change |
| W4-C8 | combat-riders-17 steps 3 and 4 are open: (3) one same-named `insertCardNote(html, node)` in combat and riders; (4) the guard test `scripts/tests/test_rider_tables.py` proving TURN_RIDERS and riders' RULES never claim the same feature, and pinning the two `normalizeName` contracts | **step 4: the integrator adds the drafted test below once both lanes have merged; step 3: wait** | Both steps fall outside the combat lane. Step 4 is a new file in `scripts/tests/` that reads `pentaryn-riders/riders-core.mjs`, which the riders lane is still changing on this branch. The draft passes against `migrate/wave-4` today, 3/3: no overlap, TURN_RIDERS keys pinned, combat `'A (x) B'` → `'a (x) b'` and riders → `'a b'`. Step 3 edits riders' `card-note.mjs` (riders lane). Its natural home is a kit helper (`foundry/lib`, a kit minor) rather than two hand copies, and the note bodies differ today: combat builds HTML with an Undo button, riders sets `textContent`. Until step 4 lands, nothing guards against a feature in both tables applying twice |
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
- **`scripts/foundry/blueprint/conformance.py` C59** (integrator, optional): the rule misses a
  per-document write made behind a local helper. combat's `sweepOrphanFlags` loop awaits
  `dropCombatFlags(actor, …)`, which wraps `actor.update`. W4-C7 keeps that loop, so this is a note on what
  the scan can see, not a combat defect. C59 is already `warn+manual`, and the manual checklist (§5.9.4) caught it.
- **New `scripts/tests/test_rider_tables.py`** (integrator, after the riders and combat lanes merge;
  combat-riders-17 step 4, W4-C8). Drafted and run green (3 passed) against this branch at a
  repo-shaped path:

```python
"""combat-riders-17 step 4: pentaryn-combat's TURN_RIDERS and pentaryn-riders' RULES never claim the
same feature (a row in both would apply twice), and the two normalizeName contracts stay pinned."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
COMBAT = ROOT / "foundry/module/pentaryn-combat/combat-core.mjs"
RIDERS = ROOT / "foundry/module/pentaryn-riders/riders-core.mjs"

SCRIPT = """
const combat = await import(process.argv[1]);
const riders = await import(process.argv[2]);
const n = ["Elemental Adept (Fire)", "A (x) B"];
console.log(JSON.stringify({
  turn: combat.TURN_RIDERS.map(r => ({ key: r.key, ids: [...r.identifiers] })),
  rules: riders.RULES.flatMap(r => [r.key, ...(r.match?.identifiers ?? []),
    ...(r.match?.names ?? []).map(combat.slugify)]),
  combatNorm: n.map(combat.normalizeName),
  ridersNorm: n.map(riders.normalizeName),
}));
"""


@pytest.fixture(scope="module")
def tables():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, COMBAT.as_uri(), RIDERS.as_uri()],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_turn_rider_keys_pinned(tables):
    assert [r["key"] for r in tables["turn"]] == ["sneak-attack", "frenzy", "colossus-slayer", "divine-strike"]


def test_no_feature_in_both_tables(tables):
    turn = {i for r in tables["turn"] for i in [r["key"], *r["ids"]]}
    assert turn.isdisjoint(tables["rules"]), sorted(turn & set(tables["rules"]))


def test_normalize_name_contracts(tables):
    # combat strips only a trailing parenthetical; riders strips every one.
    assert tables["combatNorm"] == ["elemental adept", "a (x) b"]
    assert tables["ridersNorm"] == ["elemental adept", "a b"]
```

## transform — migration lane (2026-10-12)

Migrated from the checkpoint `f06e6b18` on `migrate/wave-4` (code phase only, nothing live): guide
steps 2–11 plus the §4 standalone findings, audit 8.6 (argon-kit adoption, the size split) and the
§5.9 / §5.8 review items; 28 commits, listed with their findings in
[`migrate-pentaryn-transform.md`](migrate-pentaryn-transform.md) Result (deviations recorded there).
Conformance 55.6 % (base) → 60.0 % (checkpoint) → **93.6 % (44/47)**; the three left are shared-file
edits below (C32 adjustments, C07 + C37 Wave 7). node:test **246 pass, 0 fail, 0 todo** (checkpoint
186 / 2 todo), legacy core suite 155 pass; every `modules.check_report('transform')` gate green
(parse, imports, i18n, node-test, vendor, conformance); `vendor.py check pentaryn-transform` clean.
Coverage (node:test, module files, lcov merged per file, `lib/` and `test/` excluded): **99.92 /
92.75 / 98.88** L / B / F (checkpoint 99.88 / 91.38 / 98.50); left: the entry's game.ready branch
(exercised by features.test's hot patch under a `?v=2` URL, so lcov files it apart).

Frozen-pin edits, all named in their commits: planned flips (VERSION todo, the T-wrapper list,
the console-text source scan, hooks golden 40 → 39); import paths only (`../starry-adapter.mjs` in
four suites); declared flips (T-D1/W2-K1 publish pins, T-D3 -15 console pins, T-D4 class names,
T-D8 one console line, -13 step 3, -23 resolver count, §5.8 failure stub). No frozen test went red
twice; no step was reverted.

**Known red:** repo pytest `test_the_real_registry_matches_the_code` and C32 report the transform
rows below until the integrator's adjustments edit lands (same as every lane's file moves).

### Open for Joe — transform

| # | Item | Default | Why |
|---|---|---|---|
| W4-T1 | §5.9.4 / C61, two tabs on the GM account: the automatic endings (0 HP, Incapacitated, expiry, a carried effect ending) and the spent-form sweep run in every tab of the runner user (`isRunner` / `activeGM.isSelf` pick a user). With the bridge tab and a GM browser tab open, both revert the same form; the second finds it gone (its `revert()` returns null or warns `auto-revert failed`), but a doubled "returns to normal form" chat line is possible if both reach dnd5e before the delete lands | **accept, watch in the live phase** (two GM tabs, Talo shifted, drop him to 0 HP) | A claim would fit — the form actor is a one-time document per shift, so `claimDocument(form, "autoRevert")` is a valid fixed key — but it needs `lib/election.mjs`'s claim (vendored already) and adds a ~750 ms settle before every automatic revert: a declared change for a case not yet seen |
| W4-T2 | D8 / -22 behaviour half: Starry Form's world-time expiry checks world actors only, so an unlinked druid token's Starry Form is not ended there while no GM is connected | **live decision** (pinned as today, `starry.test`) | the guide's T-L1; build nothing |
| W4-T3 | Version: module.json stays 0.3.3; the new API rows say `since: 0.4.0` | **bump to 0.4.0 in the Wave 7 batch**, with `transform-core.mjs` `VERSION` in the same commit (core.test pins them equal) | as aoe / riders |
| W4-T4 | D7 loading: `styles/transform.css` `@import`s `../lib/argon-tooltip.css` so today's module.json loads the shared tooltip rules (and pentaryn-combat's `pentaryn-tt` tooltips keep their style) | **keep the @import**; if the Wave 7 batch lists `lib/argon-tooltip.css` in transform's `styles` (combat's W4-C6 does it for combat), delete the @import line in the same commit | identical rules loaded twice are harmless, but one path is cleaner |
| W4-T5 | T-D8 (new, not in the guide): every hook registration guarded — a throwing listener logs `pentaryn-transform \| <label>` | **keep** | §5.9.1, combat's D-c1 precedent; console only |

### Integrator — transform (exact edits)

`foundry/adjustments.yml` (rows today at :46-95, :257-265, :599-607):
- `core-transform-unwrap` → id **`transform-preupdate-unwrap`** (D2: `wrapMethod({adjustments})` names it),
  `files: [foundry/module/pentaryn-transform/patches.mjs]`, `markers: ["_preUpdateOperation", "pentarynUnwrapped"]`.
- `argon-panel-injection`: `files: [foundry/module/pentaryn-transform/hud-panels.mjs, foundry/module/pentaryn-transform/form-picker.mjs]` (markers unchanged).
- `argon-target-picker-cancel`: `files: [foundry/module/pentaryn-transform/argon.mjs]` (markers unchanged).
- `argon-bonus-used-tracking`: `files: [foundry/module/pentaryn-transform/wildshape-adapter.mjs, foundry/module/pentaryn-transform/hud-panels.mjs]`.
- `argon-portrait-hp`: `files: [foundry/module/pentaryn-transform/hud-panels.mjs, foundry/module/pentaryn-transform/core/hud.mjs]`.
- `argon-tooltip-clear`: `files: [foundry/module/pentaryn-transform/argon.mjs]`, `markers: ["dropTooltip"]`
  (the `ui.ARGON._tooltip` write is the kit's `lib/argon-kit.mjs` now; rows never name lib/).
- `core-token-swap-no-animation`: `files: [foundry/module/pentaryn-transform/bodyswap.mjs, foundry/module/pentaryn-transform/wildshape-adapter.mjs, foundry/module/pentaryn-transform/core/bodyswap.mjs]` (markers unchanged).
- No `transform-reads-combat-multiattack` row (guide §4 -13 step 2): superseded — transform reads
  combat's published `coversMultiattack`, not its settings.

Wave 7 restart batch (`wave7-restart-batch.md` transform row; `foundry/module/pentaryn-transform/module.json`):
`flags.pentaryn = { tier: "full", namespace: "transform", flagScope: "pentaryn-transform", cssPrefix: "ptf-",
generation: 14, afterSync: ["After a sync: reload every client (a module.json change needs a Foundry restart).",
"  game.pentaryn.transform.describe()   game.pentaryn.transform.selftest()   game.pentaryn.transform.inspect(\"Talo\")"] }`;
`compatibility.minimum: "14"` (-24); `version: "0.4.0"` with `transform-core.mjs` `VERSION = "0.4.0"`
(W4-T3); `esmodules` stays `["transform.mjs", "hud.mjs"]`. Then flip transform's own
`core.test` "manifest today" pin (it asserts 0.3.3, minimum 13, flagScope `transform`) in the
same commit. Optional (W4-T4): `styles: ["styles/transform.css", "lib/argon-tooltip.css"]` and drop
the `@import` line.

`scripts/foundry/ops/config.py` transform `after_sync` (:240-247, -18): version-neutral text, e.g.
`("A module.json change needs a Foundry restart (make vtt-down && make vtt-up); otherwise reload every client.",
"Wild Shape and Starry Form live on the Argon Bonus bar:", "  game.pentaryn.transform.inspect(\"Talo\")",
"  await game.pentaryn.transform.shift(actor, game.pentaryn.transform.forms(actor)[0].id)",
"  await game.pentaryn.transform.revert(actor)")` (or read it from module.json `afterSync` once W7 lands).

`context/foundry/README.md`: re-run `make foundry-module-index` (transform: full tier, its methods,
the describe golden now exists); add a routing row (-20): *Wild Shape / Starry Form / Return / Change
Form / a form left in the sidebar* → `foundry/module/pentaryn-transform/README.md` (landed by the integrator).

`context/plans/druid-wild-shape.md:5`: `Design detail: foundry/module/pentaryn-transform/WILDSHAPE-DESIGN.md`
→ a "Design detail (history)" link to `wildshape-hud-design.md`.
`context/plans/README.md` (index): add a row for `wildshape-hud-design.md`: `| The 0.2
design for Wild Shape on the HUD (moved out of the module, transform-creatures-19) | superseded; history only |`.
`context/pentaryn.md:613` (optional): the module is past 0.3.1; `starry.mjs` is no longer imported by hud.mjs.

`foundry/module/pentaryn-combat/README.md:158-159` ("Flags other modules read", made wrong by
eb5d576b, -13 step 3) — replace the two lines starting "None directly. pentaryn-transform reads…" with
the text below (or the combat lane lands it):

> None directly. pentaryn-transform asks this module's published `coversMultiattack(ref)` to hide a covered
> Multiattack button (transform-creatures-13); it reads no combat setting.

New `scripts/tests/test_module_contracts.py` (-21; drafted, 4 passed against this branch at a
repo-shaped path): transform-core's `STARRY_LIGHT` pinned, and pentaryn-senses'
`carriedLightOf` / `lightingItemId` turn exactly that `flags.pentaryn-senses.light` into the token's
light (a quantity-less feature counts, quantity 0 and no flag give none, Starry outshines a torch).
The draft is at the session scratchpad `repo/scripts/tests/test_module_contracts.py`; text:

```python
"""transform-creatures-21: pentaryn-transform writes flags.pentaryn-senses.light (STARRY_LIGHT) on the
Starry Form item; pentaryn-senses' carried-light reader (light-core.mjs carriedLightOf) must keep
turning exactly that flag into the token's light. Both cores are pure, so node imports them bare."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TRANSFORM = ROOT / "foundry/module/pentaryn-transform/transform-core.mjs"
SENSES = ROOT / "foundry/module/pentaryn-senses/light-core.mjs"

SCRIPT = """
const t = await import(process.argv[1]);
const s = await import(process.argv[2]);
const flag = light => ({ "pentaryn-senses": { light } });
console.log(JSON.stringify({
  starry: t.STARRY_LIGHT,
  one: s.carriedLightOf([{ id: "sf", system: { quantity: 1 }, flags: flag(t.STARRY_LIGHT) }]),
  feature: s.carriedLightOf([{ id: "sf", system: {}, flags: flag(t.STARRY_LIGHT) }]),
  none: s.carriedLightOf([{ id: "sf", system: { quantity: 1 }, flags: {} }]),
  empty: s.carriedLightOf([{ id: "sf", system: { quantity: 0 }, flags: flag(t.STARRY_LIGHT) }]),
  which: s.lightingItemId([{ id: "torch", system: { quantity: 1 }, flags: flag({ bright: 5, dim: 10 }) },
                           { id: "sf", system: {}, flags: flag(t.STARRY_LIGHT) }]),
}));
"""


@pytest.fixture(scope="module")
def contract():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, TRANSFORM.as_uri(), SENSES.as_uri()],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_starry_light_shape_pinned(contract):
    assert contract["starry"] == {"bright": 10, "dim": 20, "color": "#cfe0ff", "alpha": 0.35, "luminosity": 0.5,
                                  "coloration": 1, "animation": {"type": "starlight", "speed": 2, "intensity": 3,
                                                                 "reverse": False}}


def test_senses_lights_the_starry_flag_as_written(contract):
    assert contract["one"] == contract["starry"]
    assert contract["feature"] == contract["starry"], "a feature item has no quantity: it still counts"


def test_no_flag_or_no_quantity_gives_no_light(contract):
    assert contract["none"] is None
    assert contract["empty"] is None


def test_starry_outshines_a_torch(contract):
    assert contract["which"] == "sf"
```

Seen, not mine: the old live eval scripts in `foundry/logs/` imported
`/modules/pentaryn-transform/starry.mjs` for `assumeStarry` / `constellationActivity`; that file is a
feature now (`install` only). Use `game.pentaryn.transform.starry.*` (README Pitfalls says so).

### Live checks for the gated live phase (transform)

After the sync (+ the Wave 7 restart for module.json) and a reload, as GM with Talo:
1. T-D1: `game.pentaryn.transform.describe().version` equals module.json; `selftest().ok`;
   `game.modules.get("pentaryn-transform").api === game.pentaryn.transform`; `Object.isFrozen(...)`.
2. T-D2: `game.pentaryn.transform.inspect("Talo")` in normal form, then shifted into a Dire Wolf:
   `form.secondsLeft`, `wildShape.usesLeft`, depth ≤ 4; `.starry.active(talo)` works at ready.
3. The core flow from the HUD as a player: Wild Shape → Dire Wolf (one use, one chat line), Change
   Form, Return to Talo; a revert from the sheet's Restore Transformation posts its line (PT3-7).
4. T-D4: nothing looks different — the picker, the Return / Change Form glow, the Starry button,
   the Chalice pulse after Cure Wounds under the Chalice, the portrait line and its `99+12` HP, the
   compact tooltips (also pentaryn-combat's Full Attack tooltip, D7).
5. -13 step 3: a Dire Wolf form under combat's Full Attack shows no second Multiattack; with combat's
   Multiattack setting off it does.
6. T-D6: advance world time 6 h with a GM connected — the form ends (Expired line), once; repeat with
   no GM connected (the owner's client ends it). Starry Form after 10 min likewise.
7. T-D7: after a shift, a tooltip left behind disappears on the next mouse move.
8. C59: a druid concentrating with Bless up shifts, the beast takes damage and fails Concentration —
   the druid comes back without Bless and not concentrating (one batched delete in the console).
9. §5.8: Starry Form on → the token's starlight; off → the light is gone (and a hand-set torch
   light comes back).
10. W4-T1: two GM tabs (bridge + browser), Talo shifted, drop him to 0 HP — count the "drops to 0
    HP" chat lines (expected one; record if two).
11. T-L1 / D8: an unlinked druid token with Starry Form, expiry action off, advance past 600 s with no
    GM connected — the form stays (decision for Joe).
12. Escape with the Change Form picker open closes it (PT3-6); `CONFIG.debug["pentaryn-transform"] =
    true` then a shift prints the stripped-items debug line (T-D3).

## D7 wiring stage (2026-10-12)

One shared Argon tooltip stylesheet, `foundry/lib/argon-tooltip.css` (kit 1.0.2; no kit file changed,
no kit bump). Code phase only, nothing live, no `module.json` touched.

| Module | Vendored (vendor.py, byte-identical) | Loaded | Commit |
|---|---|---|---|
| transform | yes (`4af2a9c2`) | `styles/transform.css` `@import "../lib/argon-tooltip.css"` (`45733d25`, transform lane) | pin `f6c668c8` |
| combat | yes (`eaff3e00`) | `styles/combat.css` `@import "../lib/argon-tooltip.css"` — **[declared]** `24e961a0` | `24e961a0` |
| riders | **no** — `vendor.py sync pentaryn-riders --kit argon-tooltip` refuses until `module.json` `relationships` names `enhancedcombathud` (W7 batch, not this lane's file) | — | — |

- **Visual output.** `test/css-rules.mjs` (one copy each in combat and transform) inlines `@import`s
  and lists every selector's declarations in cascade order. `golden/tooltip-rules.json` (the same
  file in both modules) was computed from **origin/main's** `pentaryn-transform/styles/transform.css`
  :70-113, not from the code under test. Both modules' `.pentaryn-tt` rules match it: the same 11
  selectors with the same values in the same order. Transform's own rules don't touch any tooltip
  property, so moving the block to the top of transform.css changes nothing.
- **The declared change (combat, `24e961a0`).** With pentaryn-transform **off**, combat's Full
  Attack, follow-up and command tooltips now get the compact layout: a 340 px width cap,
  click-through, and the two-column details grid. Before, they fell back to Argon's default. With
  transform on, the same rules load twice and nothing changes. This is transform-creatures-14 step 2
  and W4-C6, done without a hand copy.
- **C37.** Combat still passes. Transform's C37 is only its `ptf-*` selectors now, and clears once W7
  declares `cssPrefix: "ptf-"`. Riders' `.pr-*` selectors clear the same way with `cssPrefix: "pr-"`.
  Its two `#tooltip` selectors stay failing by default (W4-R9).
- **Gates.** combat node:test 244 pass / 0 fail / 0 todo (+3), transform 248 (+1), riders unchanged.
  Every `modules.check_report` gate is green for combat, transform and riders, and `vendor.py check`
  is clean for all three. Conformance is unchanged: combat 91.7 %, transform 93.6 %, riders 89.6 %.

### Open for Joe — D7

| # | Item | Default | Why |
|---|---|---|---|
| W4-D7a | Riders' `#tooltip.ech-tooltip-container`, `#tooltip .ech-tooltip { pointer-events: none }` cannot be expressed with the shared file without a rework: the kit's rule only covers tooltips with the `pentaryn-tt` class, while riders' rule covers every Argon hover tooltip | **keep it in riders.css** (same as W4-R9) | Moving it into the kit file would make every Argon tooltip click-through whenever combat or transform is on, even with riders off. That is a kit-wide behaviour change, so per Joe's D7 rule this lane pauses and records it |

### Integrator — D7

- W7 batch, riders: once `relationships.recommends` names `enhancedcombathud`, run
  `vendor.py sync pentaryn-riders --kit argon-tooltip` and either list `lib/argon-tooltip.css` in
  `styles` or `@import` it from `riders.css`. It is inert for riders alone, since riders renders no
  `.pentaryn-tt` tooltip.
- W7 batch, combat + transform (optional, W4-C6 / W4-T4): if `module.json` `styles` lists
  `lib/argon-tooltip.css`, drop the matching `@import` line **and** flip the D7 import pin in that
  module's `test/css.test.mjs` in the same commit. The `tooltip-rules.json` pins then need a
  `styles`-aware loader, or should be retired with a note.
- Docs outside this lane's ownership:
  - `pentaryn-transform/README.md:99-100` ("combat's tooltips use the `pentaryn-tt` classes, styled
    by … `styles/transform.css` imports") is no longer a coupling and could be dropped.
  - Combat's CHANGELOG could note the [declared] `24e961a0`.


## Integrator (2026-10-12)

Applied every lane's shared-file list on `migrate/wave-4` (code phase only, nothing live, no
`module.json` touched, fork not touched — no lane changed prompts or the bridge).

| Commit | What |
|---|---|
| `e1a9aade` | `foundry/adjustments.yml`: riders, aoe, transform and combat rows follow their moves; D2 renames (riders' four patch rows `riders-*`, `dnd5e-riders-arcane-recovery-picker`, `argon-riders-long-casts`, `transform-preupdate-unwrap`, 29 combat rows to the package prefix); `core-region-placement-escape` widened to cursors (-39); `dnd5e-chat-message-types` widened (combat, aoe `messages-adapter.mjs`, riders' four files + marker `registry.messages`); `dnd5e-cancelled-area-refund` `what` corrected (combat-riders-36); seven new rows (`dnd5e-riders-damage-tray-preset`, `dnd5e-riders-roll-term-riders`, `dnd5e-riders-sheet-hit-dice`, `core-riders-query-battle-medic`, `itempiles-aoe-skip-piles`, `core-combat-flag-forced-replacement`, `core-combat-reads-aoe-placement`). `transform-reads-combat-multiattack` not added (superseded by eb5d576b). A misspelled marker fails the check |
| `4cab245c` | riders file-header comments name the renamed rows |
| `fb3361b9` | `config.py` `after_sync`: transform version-neutral (-18); combat → "README → Settings" |
| `4dcb6cfd` | `vendor.py` refusal names `argon-tooltip.css` (riders lane); new test, red before |
| `cd63f263` | aoe README:128 + handle-oracle `about` (combat review); combat README "Flags other modules read" (transform); transform README D7 coupling dropped; combat CHANGELOG D7 line |
| `0b414108` | `scripts/tests/test_rider_tables.py` (combat-riders-17 step 4, W4-C8 draft) |
| `d73acb65` | `scripts/tests/test_module_contracts.py` (transform-creatures-21 draft) |
| `4ecec06b` | `context/foundry/melee.md`: `turnflow/*.mjs`, stacked weapons (-15), "Which riders module?" table (-17 step 2) |
| `7ca2026b` | `druid-wild-shape.md` and plans index route `wildshape-hud-design.md` (transform-creatures-19); `pentaryn.md` transform line |
| `b4c324b7` | `context/foundry/README.md`: module index regenerated; riders and transform routing rows (-20) |
| `4e3e69e9` | this report: two example links made plain text (check-context was red on them) |
| `d0d8e771` | `wave7-restart-batch.md` rows for riders, aoe, transform, combat; `adjustments-batch.md` marks the wave-4 rows landed |
| `762c9113` | riders CHANGELOG names `794e1ed9` (-41 prune follow-up) |
| `73b6c672` | cursors `board.mjs` -39 cross-reference (aoe's half is `0b9b13fd`) |

**Gates at the end** (all static): `./.venv/bin/pytest -q` 1208 pass, 2 skipped, 3 xfailed (the
registry check is green again); `make foundry-modules-check` all 20 modules pass their gates (walls'
docs.test warns on its known W7 description pin); `make foundry-lib-check` green, 0 todo; `make
check-context` OK (4 warnings, pre-existing); `make foundry-adjustments-check` 106 rows green;
`vendor.py check --all` identical for every migrated module. node:test: riders 175 (+ legacy 103 /
22 / 39), aoe 411 (+ legacy 160), transform 248 (+ legacy 155), combat 244; 0 fail, 0 todo each.

**Conformance** (origin/main → lanes done `a202a6f1` → integrated HEAD):

| Module | origin/main | after lanes | after integration | Still failing |
|---|---|---|---|---|
| riders | 47.8 % | 89.6 % | **91.7 %** | C07, C09, C37 (W7), C56 (W2-J2) |
| aoe | 50.0 % | 89.6 % | **93.8 %** | C07, C09, C37 (W7) |
| transform | 55.6 % | 93.6 % | **95.7 %** | C07, C37 (W7) |
| combat | 50.0 % | 91.7 % | **93.8 %** | C07 (W7), C21, C23 (W4-C3) |

(The lanes quoted aoe's base as 58.7 %, its checkpoint; origin/main scores 50.0 % with today's
scorer.) Other modules are unchanged by this pass.

**Not done here (recorded):**
- Every `module.json` edit → Wave 7 batch rows (`d0d8e771`), incl. the version bumps, riders' D7
  vendor sync, combat's description sentence and the transform `core.test` manifest pin flip.
- `context/foundry/argon.md` (combat-riders-18 phase 1, every Argon hook and prototype touch by
  module and order) — not written; needs a read of all four modules' Argon registrations in order.
  Follow-up.
- Combat README: kept its two-line "Which riders module?" prose (the README is 249/250 lines);
  the full table is in `melee.md` and riders' README.
- `conformance.py` C59 blind spot (a per-document write behind a local helper, W4-C7): a scorer
  note, not built.
- isAoeHandle oracle pin for portals / creatures copies: needs `migrate/wave-3`; follow-up.
- Riders sr follow-ups (not fixed): the 60 s claim staleness compares clocks across machines; a
  winner slower than 7 s lets the loser's timeout reach the player before the heal.

## Integration review (2026-10-12)

Whole-branch review of `wave-4-base..HEAD` (173 commits reviewed, plus this review's 3 fixes). The fork worktree has no commits past
`origin/pentaryn`, so the fork was not touched. **Verdict: pass, with three small fixes.**

| Check | Result |
|---|---|
| `foundry/logs/**`, secrets, the lane-locked scripts (`cloud`, `storage`, `bundles`, `boot`, `bootstate`, `uploadq`), `module.json` | none touched by any commit |
| Each commit's paths vs its subject | every `foundry/module/pentaryn-<m>/` path sits in a commit scoped to `<m>`; shared files (kit, adjustments, scripts, context) only in `lib`/`plans`/`chore`/integrator commits |
| Base | `wave-4-base` = `a5a1a906`; no merge commits; `origin/migrate/wave-3` is not an ancestor |
| Frozen tests (from checkpoints riders `67fe16a3`, aoe `7a12ffad`, transform `f06e6b18`, combat `6e802ebb`) | every removed non-import line is either in a `[declared]` commit or a structural re-anchor: seam shims, `ADDED_S*` export deltas, emit/graph location goldens, todo→test, or the guide-planned flips (transform S7 T-wrappers, combat S3 dead exports). One process nit: `796fdf63` (perf -23) flips the `KNOWN -23` resolve-count pin 4→3 without `[declared]` in its subject. The test name says `[perf]`. Left as is |
| Kit copies | `vendor.py check --all` identical; `argon-kit.mjs` and `argon-tooltip.css` byte-identical in combat and transform (riders: W4-D7a / W7, as recorded) |
| D7 | combat.css and transform.css `@import "../lib/argon-tooltip.css"` as their first rule; no JS anywhere still uses transform's pre-`ptf-` class names |
| combat↔transform | transform asks `apiOf("pentaryn-combat")?.coversMultiattack?.(actor)`; combat's manifest row, `api.mjs`, the describe golden and both READMEs agree. combat and transform keep only thin wrappers over `lib/argon-kit.mjs` |
| riders↔combat | `test_rider_tables.py` green; no module outside combat listens to `pentarynCombat.*` / `pentaryn-combat.*` |
| aoe handle contract | combat's `shapes.isAoeHandle` was not read against the oracle anywhere. **Fixed:** `09585ef7`, see below |
| describe() goldens | `test/golden/describe.json` is present and pinned by the API test in riders (13), aoe (24), transform (13) and combat (25). Every `game.pentaryn.<ns>.<member>` named in `config.py` and `context/foundry/aoe.md` exists in them |
| Index | `module-index --check` current |
| Adjustments ids | outside `context/plans/`, no stale pre-rename id remains, except two riders test comments. **Fixed:** `18fd2633` |
| Gates | all green (below) |

**Fixes (this review)**

| Commit | What |
|---|---|
| `d54efe2c` | `foundry/lib/README.md` and `context/foundry/addon-blueprint.md` §5.7 now say that combat and transform vendor `argon-tooltip.css` and `@import` it. The old text said "no module vendors it yet" |
| `09585ef7` | new `scripts/tests/test_aoe_handle_contract.py` pins combat's `shapes.isAoeHandle` against aoe's `handle-oracle.json` column `handle`. A mutant fails it. This corrects the W4-C8 table's last row ("pinned only against its old inline expression"). portals' and creatures' copies still need wave-3 |
| `18fd2633` | riders `test/glue.test.mjs` and `test/rituals-glue.test.mjs` comments now name the renamed D2 rows. Comments only; no assertion changed |

**Superseded rows, for whoever reads them later:** W4-C6's "until then combat's `pentaryn-tt` class
is still styled only by transform.css" no longer holds, because `24e961a0` makes combat.css import
the kit file.

**Merge note (for the wave-4 → main merge, not done here):** `origin/main` has moved since
`wave-4-base`. It now holds wave 3 (`880de701`) and a newer `conformance.py`.
- A dry-run `git merge-tree` against it conflicts in `context/foundry/README.md` (the module index:
  regenerate it with `module-index` after resolving) and `foundry/adjustments.yml` (keep both sides'
  rows).
- main's newer scorer gives the four modules the same scores as this branch's scorer.
- Once merged, the portals/creatures `isAoeHandle` oracle pin is no longer blocked. It goes into
  `test_aoe_handle_contract.py`, column `prop`.

**Gates after the review (`18fd2633`), all static:** `pytest -q` 1210 passed (+2 new), 2 skipped, 3
xfailed; `make foundry-modules-check` all 20 pass (riders node:test 175, 0 fail, 0 todo); `make
foundry-lib-check` green; `make check-context` OK (4 pre-existing warnings); `make
foundry-adjustments-check` green; `vendor.py check --all` identical.

## Live phase — prepared, not run (2026-10-12)

The gated live sequence is [`wave-4-live-plan.md`](wave-4-live-plan.md). New live goldens
`scripts/foundry/live-goldens/{riders,aoe,combat,transform}.js` (shared/declared split; they run on
the deployed riders 0.2.0 / aoe 0.3.1 / transform 0.3.3 / combat 0.2.5 and on this branch), proven
offline by `scripts/tests/test_live_goldens_wave4.py`. No `module.json` edit, so the deploy needs one
GM tab reload, no restart; the fork is unchanged, so no build or backend kill.

### Open for Joe — live phase

| # | Item | Default |
|---|---|---|
| W4-L1 | `migrate/wave-4` lacks wave 3 (now on main): sync only the four wave-4 folders from the branch, or merge main into it first | sync the four as they are; merge after a green live phase |
| W4-L2 | the two-GM-tab checks (riders -41 / W4-R7 / W4-R8, transform W4-T1, aoe D-A6) | skip; aoe D-A6 only if Joe wants the handle actor's id fixed now |
| W4-L3 | the deployed `pentaryn-read` description still calls combat, riders, transform and aoe "eval-js only"; a description-only fork commit (like wave 3's `a5ce74c`) fixes it | follow-up fork commit, deployed with this session's reload or the next fork build; not built in the code phase (no module guide asked for a fork change) |
| W4-L4 | the Wave 7 restart batch (version bumps, `flags.pentaryn`, riders' `recommends` + D7 vendor, `styles`) | its own session |
| D8 / T-L1 | Starry Form / Wild Shape world-time expiry for an unlinked druid token with no GM connected (transform live check 11) | record what happens live; build nothing |

## Per module (code-phase close, 2026-10-12)

How each column was measured:
- **Frozen-test diff:** `git diff --shortstat <checkpoint>..HEAD -- foundry/module/pentaryn-<m>/test/`,
  with files counted as A (new) or M (existed at the checkpoint). Every commit that touches an M file
  is listed per module below.
- **Conformance:** `conformance.py --module pentaryn-<m>`, read at wave-4-base → checkpoint → lane
  end → HEAD (after the integrator's adjustments rows).
- **Coverage:** lines / branches / functions over the module's own files (`lib/` and `test/`
  excluded), `node --test --experimental-test-coverage` over every `*.test.mjs` (node:test only), lcov
  merged per file. Checkpoint and lane-end figures are the lanes'. HEAD **lines** were re-measured for
  this section the same way and match the lanes' figures. Branch and function figures were not
  re-measured, because a per-process merge does not reproduce them reliably; the lane-end figures stand.

| Module | Checkpoint | Frozen-test diff | Conformance | Coverage L / B / F | node:test (checkpoint → HEAD) |
|---|---|---|---|---|---|
| riders | `67fe16a3` | 20 files (13 A, 7 M), +1557 −55 | 47.8 → 54.3 → 89.6 → **91.7 %**; fails C07, C09, C37, C56 | before: 3 of 8 files loaded (828 of 2197 lines) · checkpoint 99.00 / 86.64 / 97.72 · lane end 99.62 / 88.58 / 98.00 · HEAD lines **99.62** (21 files) | 121 + 8 todo → **175** (0 todo); legacy 103 / 22 / 39 both |
| aoe | `7a12ffad` | 27 files (15 A, 12 M), +1909 −67 | 50.0 → 58.7 → 89.6 → **93.8 %**; fails C07, C09, C37 | before: none (hand-rolled runner) · checkpoint 100 / ≈77 / 94.0 (12 files) · HEAD lines **99.90** (17 files) | 324 + 5 todo → **411** (0 todo); legacy 160 both |
| transform | `f06e6b18` | 35 files (15 A, 20 M), +1833 −152 | 55.6 → 60.0 → 93.6 → **95.7 %**; fails C07, C37 | before 51.48 / 50.67 / 23.48 · checkpoint 99.88 / 91.38 / 98.50 · lane end 99.92 / 92.75 / 98.88 · HEAD lines **99.92** (24 files) | 184 + 2 todo → **248** (0 todo); legacy 155 both |
| combat | `6e802ebb` | 55 files (25 A, 30 M), +3462 −253 | 50.0 → 58.7 → 91.7 → **93.8 %**; fails C07, C21, C23 | before: no node:test (legacy loaded `combat-core.mjs` only, 99.76 / 89.21 / 99.32) · checkpoint 99.78 / 87.01 / 98.92 · lane end 99.71 / 87.83 / 98.45 · HEAD lines **99.71** (44 files) | 175 + 4 todo → **244** (0 todo); legacy 326 fixtures both |

The file counts grow because each refactor split its module into more files. Each module's full
record is in its guide's **Result** and its audit's **Status**.

### riders — combat-riders-12/-13/-16/-17/-23/-25/-26/-27/-31/-32/-39/-40/-41

- **Frozen tests.** Commits touching a checkpoint file: the nine `[declared]` commits `6c159d58`,
  `62d4eda1`, `50d4f655`, `32a0a8e6`, `6516b872`, `3cc5fd7f`, `c8ce8381`, `8f525b11`, `794e1ed9` (each
  flips its named pin), `d3a12e5b` (the S2/S6 todos become tests), and `18fd2633` (comments only).
- **Findings → commit.**
  - -25 `111ac454`, `d70ed29b`, `b81fa95d` · -26 `d6dbb324` · -39 `b81fa95d` (+ rows `e1a9aade`,
    headers `4cab245c`) · -40 `0f1c1822` · -32 `3dacbbe1` · -13 (riders half) `3dacbbe1` · -31
    `b81fa95d` + `d42a1164`
  - -27 `50d4f655` [declared] · -23 `6516b872` [declared] · -12 (riders half) `32a0a8e6` [declared]
  - -41 `c8ce8381`, `8f525b11`, `794e1ed9` [declared], three commits for the claim-first relay, the
    late tab and the prune
  - -16 (riders half) `e1a9aade` (integrator) · -17: README table `d42a1164`, melee.md `4ecec06b`,
    step 4 guard test `0b414108`; step 3 open (W4-C8)
  - W2-K1 `6c159d58` · D-r1 `62d4eda1` · once-per-casting guard (guide §4, no id) `79e29f8d`
  - **Skipped, with reason:** -12's additive half (`battleMedic(healer, Actor)` resolving the
    Actor's token: new behaviour, a feature) · C59 batching of `setType` / `retireManual` /
    `installBattleMedic` (W4-R3: one-off GM commands, frozen per-item write pins) · C56 (W4-R4, kit
    gap W2-J2) · D7 `#tooltip` selectors (W4-R5 / W4-R9 / W4-D7a, waits on the W7 `recommends` edit).
- **Known bugs fixed.** Two GM tabs healing twice and spending two Hit Dice (-41), plus the two
  edge cases the reviews found in that fix (a late tab, `8f525b11`; a prune deleting a request still
  being claimed, `794e1ed9`). Summon cleanup on non-concentration effects (-23). Name / id / UUID
  refs ignored by the legacy API (-12). New in this wave: `preview("1d8x@mod=8", {modifier:"min2"})`
  split the `@` argument (`3cc5fd7f`, preview only).
- **Async (§5.9).** Vetoes are synchronous and return a literal `false`. Cleanup is gated to the
  active GM with an early return. The query passes `timeout: 8000`. The relay is claimed by request
  id, and the losing tab returns the winner's result. Two document-hook writers run in every tab of the
  GM account (W4-R7 `cleanupSummons`, W4-R8 `autoBreak`), accepted with no claim. Two relay timing
  edge cases are open (W4-R10, W4-R11).

### aoe — aoe-movement-portals-2/-4…-15/-30/-39/-40/-44

- **Frozen tests.** Commits touching a checkpoint file: its `[declared]` commits; the
  structural steps `03322772` (S2), `4bc7d44c` (S4), `41b51b43` (S5) and `536bbcf3` (8.6 split), which
  edit only the seams shim and import paths (`03322772` also turns the planned VERSION todo into a
  test); and `fb931b3d`, which changes the test world's
  `Actor.create` to model v14 (a keepId create of an existing world actor replaces it rather than
  being refused). That is a fixture correction from the review, not a module behaviour change.
- **Findings → commit** (also in the audit's Status):
  - -2 `c0a75a64` · -4 `03322772` + `0f83d5fe` · -5 `4bc7d44c` · -8 `130fb3c3` · -10 `4644e577` +
    `0cbbab0e` · -12 `47bc85c7` · -13 `87959748` · -14 `7198fe70` · -30 `41b51b43` · -40 checkpoint
    `7a12ffad`
  - -6 `f54ba674` · -7 `5009afc4` + `fb931b3d` · -9 `515776c0`, `84c847df`, `097c9e67` · -15
    `515776c0` + `18addee4` · -44 `515776c0` + `0d51383e`
  - -11 `47bc85c7` + `a6038b1d` (use-doc rows, Parts F/G, Console, `test/docs-drift.test.mjs`)
  - -39 `0b9b13fd` + cursors `73b6c672` + the widened row in `e1a9aade`
  - Not a finding: the orphaned `carefulApplies` JSDoc, `b0ae5dc9` (+ `test/jsdoc.test.mjs`)
  - D-A1…D-A4, D-A6, D-A7 as listed. **D-A5** (`argonInit` instead of the Argon tick) stays deferred
    by the guide.
- **Known bugs fixed.** `applyRows` throwing on a resolution without damages (D-A1). A hot-patched
  copy no longer aiming Self cones (D-A7 / -44). `uninstall` leaving Argon's bind wrapped (D-A2 /
  -15). Two GM sessions each creating a handle actor (D-A6 / -7). The per-message queue map never
  shrinking (-6). Silent refund clean-up failures (-9).
- **Async (§5.9).** Veto listeners are synchronous with a literal `false`. No `pre<Doc>` listener is
  gated on the active GM. Broadcast jobs claim through the kit's `claimMessage`. The sweep and the
  Careful clean-up are batched (8.5, declared). The -6 `finally` cannot reject unhandled. D-A6's
  dedupe relies on the fixed id. v14 replaces rather than refuses a second world-actor create, so the
  outcome is one actor, possibly with a second `createActor` event; live check 5 watches for it.

### transform — transform-creatures-1…24

- **Frozen tests.** Commits touching a checkpoint file: its `[declared]` commits; the
  structural steps `a5481159` (S2), `a7d52ce3` (S3), `0f995af9` (S9 part 1), `702e85a1` (S7, the
  planned T-wrapper flip), `6d436550` (S6) and `a5151861` (8.6), which change import paths and the
  planned flips only; `c2d4a524` (the console-texts source scan re-anchored on the kit's log calls,
  review follow-up); and `796fdf63`, the untagged -23 flip above.
- **Findings → commit** (also in the audit's Status):
  - -1 `59d560ba` · -3, -4 `a7d52ce3` + `395d6573` (T part `702e85a1`; last lookup `198688df`) · -5
    `a7d52ce3` + `9d4b0af9` · -6, -7 `a7d52ce3` + `395d6573` · -8 `6d436550` · -10 `89fd21a0` · -12
    `d7fa35f2` · -17 `a7d52ce3` + `e24730aa` · -23 `796fdf63`
  - -2 `c25e6a9b` [declared] · -11 `0e113e81` [declared] · -15 `0f995af9` + `01583116` · -16
    `e24730aa` + `89c3b57c`
  - -13: step 1 `01583116`, step 3 `eb5d576b` [declared], step 2 superseded
  - -14: transform half `45733d25`, combat half `24e961a0` (D7)
  - -18 `977e430d` + config.py `fb3361b9` · -19 `977e430d` + `7ca2026b` · -20 `977e430d` + routing
    row `b4c324b7` · -21 contract test `d73acb65` · -22 extraction `2aa03f5e`
  - **Skipped, with reason:** -9 superseded (starry installed by entry 1; the Wave 8 collapse makes
    one entry) · -22's behaviour half is D8, a live decision (W4-T2) · -24 `minimum: "14"` is a
    `module.json` edit (Wave 7 row).
- **Known bugs fixed.** The play-test fixes on main (0.3.3: PT3-3/4/6/7) are kept and pinned. The
  namespace no longer depends on running after pentaryn-importer's ready (-16). The Starry light flag
  on senses' scope is removed with `update(_del)`, not `unsetFlag` on a foreign scope (`0dfff3de`,
  `3ceee0e0`). The new C59 batch delete would have failed a revert when a dependent effect was listed
  first; the review caught it (`4ee9928a`).
- **Async (§5.9).** Every hook registration is guarded (T-D8 `d0882eac`). The druid's ended
  effects are deleted in one batch (`08b9d901`, `4ee9928a`). The runner gates short-circuit on a
  connected GM (-1) and scan only where the runner can be (-2). The automatic endings run in every tab
  of the runner's account (W4-T1), accepted and watched live.

### combat — combat-riders-1…38 (combat halves)

- **Frozen tests.** Commits touching a checkpoint file: its `[declared]` commits; the structural steps `49750dbc` (S2), `796b1bc1` (S3, the planned
  dead-export pins), `e45b8484` (S4), `33faf80b` (S5), `91dd98db` / `8a29ed7f` / `3a29eb4f` /
  `bb0d66fd` (S6a–d), `7d386862` (S8) and `1514cd22` (S12), which change import / file paths, additive
  core-surface deltas and layout goldens (emits, graph, module-scope hooks, i18n templates); and
  `87366619` (-37 DELAYS, an additive surface and graph delta), `3fc1643c` (-29, one export added) and
  `e723fb44` (graph golden rows for the new file).
- **Findings → commit** (also in the audit's Status):
  - Structure: -6 `3a29eb4f` + `e723fb44` · -7 `8a29ed7f` · -20 `1514cd22` · -34 `796b1bc1` +
    `ea181b22` · -5 `e45b8484`, `8a29ed7f`, `3a29eb4f`, `7d386862` · -21 `7d386862` · -3 `3a29eb4f` ·
    -4 `7d386862` · -8 `8a29ed7f` · -9 `e45b8484` · -28 `e45b8484`, `1514cd22`, `b936d9f6` · -31
    `91dd98db`, `3a29eb4f`, `b936d9f6`
  - Reads and events: -10 `d54ad23d`, `1ba641d2`, `6acb2e0e` · -11 `d54ad23d` + `7c3dbf90` · -13
    `33faf80b` + `d54ad23d` (flagScope half: Wave 7) · -14 `cac1b85b` [declared B2]
  - Hardening and performance: -2 `c69a5e22` + `1992dadb` · -12 `26cdb801` [declared D-c2] · -22
    `7d386862` + `f709a285` [declared] · -29 `3fc1643c` · -30 `0fea9208` [declared D-c1] · -33
    `de84b8a5` + `51912021` [declared D-c3] · -35 `9448deea` [declared D-c4] · -37 `87366619` · -38
    `06755b88` [declared]
  - Docs and cross-module: -15 `b936d9f6` + melee.md `4ecec06b` (description: Wave 7) · -16 (combat
    half) `e1a9aade` · -17 `91dd98db`, `b936d9f6`, `4ecec06b`, step 4 `0b414108` · -18 phase 1
    `87be8cd4` + `3a29eb4f` · -36 move `7d386862` + oracle pin `09585ef7`
  - **Skipped or open, with reason:** -1 tried and reverted, because two frozen hud.test pins read
    stale values (W4-C2) · -17 step 3, the shared `insertCardNote`, waits for a kit helper (W4-C8) ·
    -18's `context/foundry/argon.md` was not written (W4-I1) · -36's refund read waits for an aoe
    event (W4-C4) · C21 / C23 kept (W4-C3).
- **Known bugs fixed.** Multiattack plus Action Surge planned no swings (-22). Adv / Dis pressed on
  the strip while a roll window was open was lost (W4-C1, found by the checkpoint, `affd3273`). Rider
  dice, keys and names were written raw into chat-card HTML (-33). PT1-6 (0.2.5) is kept and pinned.
- **Async (§5.9).** Every module-scope hook is guarded (D-c1). Every timer delay is named and
  ordered (-37), and the tests use mocked timers only (`e7cb12b1`). The per-actor writes in
  `sweepOrphanFlags` / `seedAll` are kept on purpose (W4-C7). The C59 scanner cannot see a write
  behind a local helper (W4-I2). Reading aoe's settings through its published API would be wrong
  before `ready` (W4-C3).

### Shared (kit, tooling, docs)

- Kit: `87be8cd4` adds `foundry/lib/argon-kit.mjs` (kit 1.0.2, no version bump). D7's
  `argon-tooltip.css` is vendored byte-identical in combat and transform and `@import`ed by both (`24e961a0`,
  `45733d25`).
- Tooling: `4dcb6cfd` (`vendor.py` names `.css`), `fb3361b9` (config.py `after_sync`).
- New repo tests: `test_rider_tables.py` `0b414108`, `test_module_contracts.py` `d73acb65`,
  `test_aoe_handle_contract.py` `09585ef7`, `test_live_goldens_wave4.py` `1a96406d`.

## Merge notes (for Joe; nothing merged)

Checked with `git merge-tree --write-tree` on 2026-10-12 against the branches as fetched then.

1. **`migrate/wave-4` into `main`:** two conflicts. `main` (`6969aa91`) is 385 commits past
   `wave-4-base`. It now contains **migrate/wave-3** (`880de701`) and **feature/module-bundles**
   (both are ancestors of origin/main). It changed **none** of the four module folders and none of
   `foundry/lib/` since the base, so the module code merges cleanly. The conflicts:
   - `context/foundry/README.md` (the module index): take either side, then run
     `make foundry-module-index` and commit the regenerated table.
   - `foundry/adjustments.yml`, three hunks:
     1. The `dnd5e-chat-message-types` row: take wave 4's `modules`, `markers` and aoe / riders /
        combat files, **but** the senses file is main's `foundry/module/pentaryn-senses/light-ui.mjs`
        (wave 3 moved it), not `light.mjs`.
     2. Main's new `itempiles-ties-pile-check` row next to wave 4's rename of `core-transform-unwrap`
        → `transform-preupdate-unwrap`: keep both, with the renamed id.
     3. Wave 4's seven new rows against wave 3's new prompts / senses / portals rows: keep both
        blocks.

     Then `make foundry-adjustments-check` and `pytest -q` (`test_the_real_registry_matches_the_code`).
   - Auto-merged without conflict: `addon-blueprint.md`, `pentaryn.md`, `context/plans/README.md`,
     `adjustments-batch.md`, `wave7-restart-batch.md`, `scripts/foundry/ops/config.py`.
     `wave7-restart-batch.md` takes both waves' appended rows. Re-read it after the merge.
2. **Against `origin/migrate/wave-3` alone** (`768b8645`): the same two files conflict, the same way.
   It is already in main, so merging main covers it.
3. **Against `feature/module-bundles`** (`098e18de`): clean, with no conflict. It is in main already.
   Wave 4 touches none of `cloud.py`, `storage.py`, `bundles.py`, `boot.py`, `bootstate.py` or
   `uploadq.py`.
4. **Scorer:** main's newer `conformance.py` gives the four modules the same scores as this branch's
   (integration review).
5. **Order** (W4-L1): sync the four modules from the branch as it is for the live phase. Merge main
   in (or merge the branch into main) only after a green live phase. Never sync any other module
   from this branch: it would roll wave 3 back.
6. **Fork:** nothing to merge. The fork's `migrate/wave-4` (`59ffcf2`) has no commits of its own and
   is an ancestor of today's `origin/pentaryn` (`2fd6eb0`).
7. **Not in this branch:** every `module.json` edit (the Wave 7 batch rows, `d0d8e771`), and the
   version bumps. riders 0.3.0, aoe 0.4.0, transform 0.4.0 and combat 0.3.0 are in "Unreleased"
   CHANGELOG sections until the batch moves `module.json` and each core `VERSION` together.

## Open for Joe — consolidated (code-phase close, 2026-10-12)

One row per item, with its recommended default. If Joe says nothing, the default applies.
"Closed" means it was resolved during the wave. The detail stays in the lane sections above.

| # | Item | Default | Status |
|---|---|---|---|
| W4-CK | The four checkpoints were committed by the workflow, not after Joe's approval (aoe's S1.5 asks for it) | **approve** after a look at each `test/golden/` before the merge | open |
| W4-L1 | Live: sync the four modules from the branch as it is, or merge main first | **as it is**; merge after a green live phase | open, **before live** |
| W4-L2 | Live: skip the two-GM-tab checks (riders -41 / R7 / R8, transform T1, aoe D-A6) | **skip**; run D-A6 only if the fixed handle id matters now | open, **before live** |
| W4-L3 | Fork: `pentaryn-read` still calls these four namespaces "eval-js only" | **follow-up fork commit** (description only) | open |
| W4-L4 | The Wave 7 restart batch | **its own session** (wave 5) | open |
| D8 / W4-T2 | Starry / Wild Shape world-time expiry for an unlinked druid with no GM connected | **record live, build nothing** | open (live) |
| W4-R1 | Riders' D2 row renames | take them | **closed** `e1a9aade` |
| W4-R2 | Once-per-casting index | — | **closed** `79e29f8d` (dnd5e's registry, no hook) |
| W4-R3 | Riders C59 in one-off GM commands | **leave** | open |
| W4-R4 | Riders C56 hand `CONFIG.queries` | **keep** until the kit forwards the sender (W2-J2) | open |
| W4-R5 / W4-D7a / W4-R9 | Riders and D7: vendor `argon-tooltip.css` in the W7 batch; where the `#tooltip` click-through rule lives | **vendor in W7; keep the rule in riders.css** | open |
| W4-R6, aoe 0.4.0, W4-T3 | Version bumps: riders 0.3.0, aoe 0.4.0, transform 0.4.0, combat 0.3.0 | **in the W7 batch**, each with its core `VERSION` | open |
| W4-R7, W4-R8 | Riders' two document-hook writers run in every GM tab | **accept, no claim** | open |
| W4-R10 | Riders relay (new here, from the standalone review): a stamp counts as stale after 60 s by comparing two tabs' clocks. Machines more than 60 s apart could both win | **accept**. The bridge tab and Joe's GM browser run on the same Mac; revisit if the bridge moves to another machine | open |
| W4-R11 | Riders relay (new here): a winner slower than 7 s lets the losing tab's timeout reach the player first. The heal still happens, but the player sees "failed" | **accept**; live check -41 records it if it happens. The fix would be a [declared] loser wait longer than the query's 8 s | open |
| W4-A1 | aoe declared changes (D-A1…D-A4, D-A6, D-A7, -6, -9, the two 8.5 batches) | **approve each after its live check** | open (live) |
| W4-P1 | W3-P1 revisited: aoe's Item Piles probe (API, else the flag) vs portals' (API only) | **keep them different**; both rows say so (`itempiles-aoe-skip-piles`, `itempiles-portals-pile-pc`) | open |
| W4-C1 | Strip Adv / Dis lost while a roll window is open | fix | **closed** `affd3273` |
| W4-C2 | combat-riders-1 per-task memo | **leave** | open |
| W4-C3 | Combat reads aoe's `autoDamageOnHit` directly (C21 / C23) | **keep** | open |
| W4-C4 | Combat reading aoe's own refund decision | **wait for an aoe event** (a feature; not built) | open |
| W4-C5 | hud's listeners on the legacy `pentarynCombat.*` names | **keep** until combat 0.4.0 | open |
| W4-C6 | Combat's tooltips styled only through transform.css | — | **closed** `24e961a0` (combat imports the kit file) |
| W4-C7 | Per-actor writes in `sweepOrphanFlags` / `seedAll` | **keep** | open |
| W4-C8 | combat-riders-17: step 4 guard test; step 3 shared `insertCardNote` | step 4 landed; **step 3 waits** for a kit helper | step 4 **closed** `0b414108`; step 3 open |
| W4-T1 | Transform's automatic endings run in every tab of the runner's account | **accept, watch live** | open (live) |
| W4-T4 | Transform `@import` vs a `styles` entry for the kit CSS | **keep the @import** | open |
| W4-T5 | T-D8 guarded hooks | **keep** | **closed** `d0882eac` |
| W4-I1 | `context/foundry/argon.md` (combat-riders-18 phase 1: every Argon hook and prototype touch, by module and order) not written | **write it** as a docs commit in wave 5, before the restart's live smoke (it is what to read when the Argon bar misbehaves) | open |
| W4-I2 | `conformance.py` C59 cannot see a per-document write behind a local helper | **leave**: C59 is `warn+manual`, and the §5.9.4 checklist caught both cases | open |
| W4-I3 | `796fdf63` flips a pin without `[declared]` | **treat as declared** when bisecting; no change | **closed** (recorded) |

Six rows are closed, and W4-C8 is half closed (step 4 landed). W4-L1 and W4-L2 must be answered before the live phase runs. The rest have
defaults that can stand.

## What wave 5 starts with

Wave 5 is the **Wave 7 restart batch** ([`wave7-restart-batch.md`](wave7-restart-batch.md)) under
strict gates. All `wait.json` entries were lifted on 2026-10-11, so batch 1 (Stage 3) and batch 2
(Wave 7b) fold into **one** sync and **one** Foundry restart (README §3 Stage 3).

1. **Preconditions.**
   - Wave 3 is merged (it is in main).
   - Wave 4's live phase is green and the branch is merged, with the conflicts resolved as in the
     Merge notes.
   - Each module's live checks have passed, or are recorded as decided.
   - The batch edits `module.json` of modules from both waves, so it runs on main, not on a wave
     branch.
2. **Rows for the four wave-4 modules** (appended in `d0d8e771`): `flags.pentaryn` (with
   `afterSync` moved out of `config.py` in the same commit), `relationships.recommends`, CSS into
   `styles/`, and `compatibility`. The version bumps go in with each core `VERSION` in the same
   commit. Two frozen pins flip as **[declared]** in those commits: transform's `core.test` "manifest
   today" pin, and combat's literal "0.2.5" pin. Combat also gets its `description` sentence
   (combat-riders-15).
3. **Riders D7 first step:** after the `recommends` edit, `vendor.py sync pentaryn-riders --kit
   argon-tooltip`, then list or `@import` it (W4-R5). The `#tooltip` rule stays in `riders.css`
   unless Joe decides otherwise (W4-R9).
4. **Strict gates** (batch checklist step 2, then README Stage 5 step 2): apply every row to a scratch
   copy and score each module. Expected after the batch, as the lanes estimated (to be confirmed on the
   copy):
   - aoe 48/48 and transform 100 %.
   - riders still fails C37 on two `#tooltip` selectors (W4-R9) and C56 (W4-R4).
   - combat still fails C21 / C23 (W4-C3).

   Those three are the documented exceptions when the conformance gate turns from advisory to
   failing.
5. **Also queued for that session:**
   - W4-I1, `argon.md` (docs).
   - Stage 5 step 1: remove `publish.mjs`'s frozen-root guard and its re-alias tick now that every
     module publishes through `publishNamespace`. That needs a kit bump and `vendor.py sync --all`.
   - The wave-3 carry-overs below.
6. **Live smoke per module** (batch checklist step 3): `describe().version`, every described path a
   function, and `inspect` / `selftest` for the full tier. For these four, the expected
   `describe()` method counts are 13 / 24 / 13 / 25.

## Follow-ups that need wave-3 code (not built here)

This branch never merged `migrate/wave-3`, so these wait for the merge with main:

- **isAoeHandle oracle pin.** Combat's `shapes.isAoeHandle` is pinned against aoe's
  `test/fixtures/handle-oracle.json` (column `handle`) in `scripts/tests/test_aoe_handle_contract.py`
  (`09585ef7`). After the merge, add the portals copy (aoe-movement-portals-43) and the creatures copy
  (`isAoeHandle` / `isItemPile`, transform-creatures-30) to the same test, against column `prop`.
- **W3-T5:** ties Share's per-PC writes batched as one `[declared]` perf commit; `migrateLegacy`
  left as it is.
- **W3-SE1:** the senses two-GM-tab Light reconcile through a deterministic square `_id` with
  `keepId`. aoe's review (`fb931b3d`) read the v14 server's create path: a duplicate id is refused
  only for **embedded** documents. A world document with an existing id is replaced. The Light
  square is embedded, so keepId should dedupe there, but the live probe (W3-L2's DP11) still decides.
- **W3-SE3:** senses `syncAll` batched per world (`[declared]` perf). W3-SE2 stays as it is.
- **W3-PR4:** the fork halves of mcp-fork-15 and prompts-lookup-11/-12. This goes in a fork lane,
  together with W4-L3's description fix.
- The cursors aoe-shared adjustments row (wave 3's carry-over) is **done** here:
  `core-region-placement-escape` was widened to cursors in `e1a9aade`, with the cross-reference in
  `73b6c672`.

## Live plan

[`wave-4-live-plan.md`](wave-4-live-plan.md) (`488c7e24`), with goldens
`scripts/foundry/live-goldens/{riders,aoe,combat,transform}.js` (`1a96406d`, `3c37a9eb`), proven
offline by `scripts/tests/test_live_goldens_wave4.py`. It has not run. The "Live phase — prepared,
not run" section above summarises it. Per-module live checks are in each lane section and guide.

## Known red commits and ranges (bisecting)

- **Adjustments registry:** from each lane's first file move (riders `b81fa95d`, aoe `4bc7d44c`,
  combat `91dd98db`, transform `9d4b0af9`) until `e1a9aade`, `pytest`'s
  `test_the_real_registry_matches_the_code` and `make foundry-adjustments-check` are red for that
  module's rows. node:test is green throughout.
- **Combat i18n gate:** `e45b8484` … `1514cd22`. The gate (which scans tests) failed on two not-a-key
  strings. node:test stayed green.
- **Combat** `c69a5e22`: its own new test was red until `1992dadb`.
- **check-context:** red for two links in this file until `4e3e69e9`.
- **Untagged pin flip:** transform `796fdf63` (W4-I3). **Fixture correction without a tag:** aoe
  `fb931b3d` (the test world models v14's world-actor replace).

## Critic pass (2026-10-12)

Every claim above was checked against git and the files at `464024ce`, all static.

- **Confirmed.** Every cited hash exists, on this branch or (wave 3, bundles, main, the fork) where
  the text says. The commit list matches `git log`. There are 43 `[declared]` subjects, split
  10 / 10 / 12 / 11. The frozen-test shortstats and A / M counts are right, and every commit that
  touches an M file is named. Conformance at base, at each checkpoint, at the lanes' end
  (`a202a6f1`) and at HEAD equals `conformance.py --json`, and main's scorer gives the same HEAD
  scores. node:test counts at the checkpoints, the lane ends and HEAD are right, and so are the
  legacy suites. pytest is 1199 at the base, 1208 at the integrator, 1210 at the review and 1217 at
  HEAD (2 skipped, 3 xfailed). The make gates are green, the adjustments check has 106 rows, and
  vendor is identical. The known-red ranges are right: the registry turns red at `b81fa95d`,
  `4bc7d44c`, `91dd98db` and `9d4b0af9`, then green at `e1a9aade`; the i18n gate and `c69a5e22` are
  red as stated. The `merge-tree` conflicts are right, and finding ids trace to their commits or to
  the audit Status rows.
- **Corrected.**
  - The commit count was 181 and is now 182: `da11e0e3` came after `1d86bd5a`.
  - The fork base was `origin/pentaryn` (`59ffcf2`). `origin/pentaryn` is now `2fd6eb0`, and the
    fork branch is an ancestor of it.
  - Combat's HEAD line coverage was 99.68 and is now 99.71. It was re-measured twice and is the
    same as the lane end.
  - `03322772` also flips aoe's VERSION todo.

## Commit lists

`git log --oneline wave-4-base..HEAD` (182 commits before this report's closing commit `464024ce`,
newest first). The fork's `migrate/wave-4` has none.

**`[declared]` commits (43)**, each a behaviour change for the live phase:

- riders (10): `3dacbbe1` S6 API (additive) · `6c159d58` W2-K1 · `62d4eda1` D-r1 · `50d4f655` -27 ·
  `32a0a8e6` -12 · `6516b872` -23 · `3cc5fd7f` parseFormula `@` · `c8ce8381` -41 claim-first ·
  `8f525b11` -41 late tab · `794e1ed9` -41 prune
- aoe (10): `3f8dd7f7` D-A4 · `0cbbab0e` D-A3 + W2-K1 · `f54ba674` -6 · `5009afc4` D-A6 · `097c9e67`
  -9 · `0f83d5fe` D-A1 · `18addee4` D-A2 · `0d51383e` D-A7 · `fa8f2d46` 8.5 sweep · `7f1d4bcf` 8.5
  Careful
- transform (12): `01583116` T-D3 · `e24730aa` T-D1 T-D2 W2-K1 · `89c3b57c` -16 hooks golden ·
  `d0882eac` T-D8 · `45733d25` T-D4 + D7 · `0e113e81` T-D7 -11 · `c25e6a9b` T-D6 -2 · `08b9d901` C59 ·
  `0dfff3de` §5.8 · `eb5d576b` -13 step 3 · `4ee9928a` C59 review · `3ceee0e0` §5.8 manifest
- combat (11): `d54ad23d` S7 W2-K1 · `cac1b85b` B2 · `0fea9208` D-c1 · `26cdb801` D-c2 · `f709a285`
  -22 · `affd3273` W4-C1 · `de84b8a5` D-c3 · `9448deea` D-c4 · `06755b88` -38 · `51912021` D-c3
  follow-up · `24e961a0` D7

<details><summary>All 182 commits</summary>

```
da11e0e3 docs(plans): wave-4 guides — Result gains the code-phase close (HEAD score, tests, later commits, frozen-test diff); status done (code phase)
1d86bd5a docs(plans): wave-4 report — live phase prepared (plan, goldens) and its Open for Joe rows W4-L1..L4, D8
488c7e24 docs(plans): wave-4 live plan — the gated live sequence for riders, aoe, transform, combat
3c37a9eb test(foundry): riders live golden reads api.core's frozenness and Sets, not a METAMAGIC key neither build exposes there
1a96406d test(foundry): wave-4 live goldens for riders, aoe, combat and transform (shared/declared split, run before and after)
2b3dce3c docs(plans): wave-4 report — integration review (verdict pass; kit-doc, aoe-oracle and riders-comment fixes; merge note for main's wave 3)
18fd2633 docs(riders): two test comments name the D2-renamed adjustments rows (comment only, no assertion touched)
09585ef7 test(combat,aoe): combat's shapes.isAoeHandle pinned against aoe's handle oracle (column handle; combat-riders-36, the aoe guide's combat half)
d54efe2c docs(lib,blueprint): argon-tooltip.css adoption — combat and transform vendor it and @import it (wave 4); 'no module vendors it yet' was stale
46cefb04 docs(plans): wave-4 report — integrator section (shared-file commits, gates, conformance before/after, what waits)
73b6c672 docs(cursors): -39 cross-reference at previewActive — aoe reads the same _placementContext for a different question; one adjustments row covers both
762c9113 docs(riders): CHANGELOG names the -41 relay-prune follow-up (794e1ed9)
d0d8e771 docs(plans): wave-4 module.json edits appended to the Wave 7 restart batch; adjustments batch records the wave-4 rows as landed (e1a9aade)
4e3e69e9 docs(plans): wave-4 report — two example links in the transform integrator list made plain text (check-context red on broken links)
b4c324b7 docs(foundry): module index regenerated (riders, aoe, transform, combat full tier) and routing rows for riders and transform (-20)
7ca2026b docs(plans): transform design doc routed from the plans index and druid-wild-shape.md (transform-creatures-19); pentaryn.md transform line past 0.3.1
4ecec06b docs(melee): use-doc follows combat's split — turnflow/*.mjs, stacked weapons count as two (combat-riders-15), 'Which riders module?' table (combat-riders-17 step 2)
d73acb65 test(transform,senses): transform-creatures-21 — STARRY_LIGHT pinned, and senses' carriedLightOf turns exactly that flag into the token's light
0b414108 test(combat,riders): combat-riders-17 step 4 — TURN_RIDERS and riders' RULES never claim one feature; both normalizeName contracts pinned
cd63f263 docs(aoe,combat,transform): cross-module notes follow the wave-4 splits
4dcb6cfd fix(blueprint): vendor.py's package refusal names the kit file with its ext (argon-tooltip.css, not .mjs)
fb3361b9 chore(ops): after_sync texts follow the wave-4 READMEs — transform version-neutral (-18), combat points to README → Settings
4cab245c docs(riders): file-header row ids follow the adjustments renames (D2)
e1a9aade chore(adjustments): wave-4 batch — riders, aoe, transform and combat rows follow their moves and D2 renames; seven new rows
a202a6f1 docs(plans): D7 wiring stage — README D7 row and wave-4 report (combat imports the kit tooltip CSS, riders waits on W7, W4-D7a open)
24e961a0 style(combat): [declared] D7 combat.css imports the kit's lib/argon-tooltip.css — pentaryn-tt no longer depends on transform.css
f6c668c8 test(transform): D7 pin — the .pentaryn-tt rules transform.css applies (kit import inlined) equal the pre-D7 block, in order
e02d2006 docs(transform): entry file map — settings.mjs keeps one outside settings read since eb5d576b (-13 step 3)
3ceee0e0 fix(transform): [declared] §5.8 the manifest lists flags.pentaryn-senses.light under flags.reads (review of 0dfff3de)
e4ed58fe fix(transform): C59 review — wildshape-adapter back to its 500-line cap (C10), comment shortened
5c63073a docs(plans): wave-4 report — integrator edit for combat README's 'Flags other modules read' (transform reads only coversMultiattack since eb5d576b)
c2d4a524 test(transform): console-texts pin re-anchored on the kit log calls (review follow-up to S9)
198688df refactor(transform): -3 the HUD's own Wild Shape item comes from core findWildShapeItem (last hand-written lookup)
4ee9928a fix(transform): [declared] C59 review — the batch delete skips effects ending Concentration already deleted, so revert survives a dependent listed first
09c308a1 docs(plans): transform migration — guide Result and deviations, audit status, wave-4 report (Open for Joe W4-T1…T5, integrator edits, -21 contract test draft, live checks)
b22643fc test(transform): the hot patch after ready — uninstall(), re-import both entries, every hook back once, the API republished with starry
a5151861 refactor(transform): 8.6 wildshape-adapter under its 500-line cap — core shapingPlan, maybeAutoRevert to the feature (C10)
eb5d576b fix(transform): [declared] -13 step 3 the Multiattack button asks pentaryn-combat's published coversMultiattack(actor) — no combat setting read (C23)
0dfff3de fix(transform): [declared] §5.8 the Starry light flag on pentaryn-senses' scope is read with readFlag and removed with update(_del), never unsetFlag
08b9d901 perf(transform): [declared, perf] C59 the druid's effects that ended in the form are deleted in one batch (§5.9.1)
c25e6a9b perf(transform): [declared] T-D6 -2 the world-time fallbacks scan only where the runner can be
2aa03f5e refactor(transform): -22 extraction half — the Wild Shape world-time candidates are core worldTimeCandidates
0e113e81 perf(transform): [declared] T-D7 -11 the pointermove check arms only for a stale tooltip
796fdf63 perf(transform): -23 forms() resolves each profile once; the Wild Shape tooltip counts without resolving
59d560ba perf(transform): -1 isRunner short-circuits on a connected GM (neutral)
89fd21a0 fix(transform): -10 the live-button set is pruned when a Bonus bar is composed (hardening, memory only)
d7fa35f2 refactor(transform): 8.6 the Argon helpers are the kit's lib/argon-kit.mjs (transform-creatures-12)
977e430d docs(transform): S11 README in the blueprint order, CHANGELOG, the design doc moved to context/plans (transform-creatures-18, -19, -20 part; C13, C44, C45)
45733d25 style(transform): [declared] T-D4 S10 own classes renamed ptf-*; D7 the tooltip rules come from the kit's lib/argon-tooltip.css (C37 once W7 declares cssPrefix; transform-creatures-14 transform half)
d0882eac fix(transform): [declared] T-D8 every hook registration is guarded (§5.9.1; combat D-c1 precedent)
89c3b57c fix(transform): [declared] -16 golden/hooks.json loses starry's ready row — api.starry is a contribution built into the one frozen API
e24730aa feat(transform): [declared] T-D1 T-D2 W2-K1 S8 the kit API — manifest, buildApi, inspect(ref), publishNamespace at ready (transform-creatures-16, -17; C27, C28, C29, C40, C50)
6d436550 refactor(transform): S6 features and the two entries; one shared registry (C16, C17, C18; C49 // hot: comments)
395d6573 refactor(transform): S5 adapters and UI files; seams called at their sites (transform-creatures-3, -4 call-site halves, -6, -7, -13 seam; C16 entry imports)
9d4b0af9 refactor(transform): S4 settings.mjs and patches.mjs (C21; C22, C51 pass; the patch through wrapMethod)
702e85a1 refactor(transform): S7 _loc with full literal keys; the three two-branch T wrappers go (C35; transform-creatures-4 T part)
01583116 fix(transform): [declared] T-D3 S9 (part 2) one debug channel; no silent catch (transform-creatures-15, -13 part 1; C24)
0f995af9 refactor(transform): S9 (part 1) the kit log for every warn/error line, byte-identical output
a7d52ce3 refactor(transform): S3 pure seams, each proved equal to its checkpoint oracle (transform-creatures-5, -6, -7; pure halves of -3, -4, -17, -22; seams for -1, -2, -10, -11, -13, -23)
a5481159 refactor(transform): S2 core barrel — transform-core.mjs over core/{constants,wildshape,hud,starry,bodyswap}.mjs; blueprint constants (C12, C41)
4af2a9c2 chore(transform): vendor kit 1.0.2 — full tier + patch, election, argon-kit, argon-tooltip (C14)
5750434c test(combat): pin the live Undo button's escaped data-undo and the forgotten write chain (review)
6acb2e0e fix(combat): trace the auto rider the 4 s guard skips (combat-riders-10 review)
843acca4 docs(plans): combat guide Result lists the review commits
a495c0c4 docs(plans): combat review — combat-riders-17 steps 3 and 4 recorded as open (W4-C8); the rider-tables guard test drafted for the integrator
9a873c05 docs(plans): combat review — the per-actor writes in sweepOrphanFlags and seedAll (§5.9.4, C59) kept on purpose, recorded as Open for Joe W4-C7
caae2696 docs(plans): combat review — module.json description sentence (combat-riders-15) and aoe's two stale turnflow.mjs references go to the integrator
e7cb12b1 test(combat): wiring, guards, picker-cue and patches run on mocked setTimeout/Date (no real timers; review)
51912021 fix(combat): [declared D-c3] escape the rider name in the auto note — an unknown flag key fell through keyFor/_loc as raw HTML (review)
052e9695 docs(plans): combat migration — guide Result, audit status notes, wave-4 report (combat lane, Open for Joe W4-C2…C6, live checks)
794e1ed9 fix(riders): [declared, edge] combat-riders-41 — a record's pruning never deletes another request still being claimed
df18b89f docs(combat): README one line shorter (the scorer counts 251 with the trailing line; C10 cap 250)
e723fb44 refactor(combat): the pip handlers move to hud/pips-bar.mjs (C10: hud/bars.mjs 545 → 455)
b936d9f6 docs(combat): S14 README in the blueprint section order, CHANGELOG (C44, C45; combat-riders-15, -17 step 2, -28 README part, -31 docs part)
e63dacef test(aoe): review — pin the -8 traces for the resolveSaves-off gate, Careful Spell off and a Careful use bound to another card, and -9 refund's quiet cases
1ba641d2 feat(combat): decision trace at the classification and rider points (combat-riders-10, the rest)
06755b88 perf(combat): [declared] one write per actor for the end-of-combat flag cleanup and the orphan sweep (combat-riders-38; C59)
fb3213f1 docs(plans): riders standalone findings — once-per-casting guard applied, W4-R9 click-through placement for Joe
79e29f8d perf(riders): once-per-casting guard reads dnd5e's message registry, not the whole chat log (guide §4)
87366619 refactor(combat): name every timer delay — core DELAYS (combat-riders-37)
6a6146fe docs(plans): aoe audit status names the carefulApplies JSDoc fix
b0ae5dc9 docs(aoe): carefulApplies' JSDoc sits on carefulApplies, not above carefulStale's (audit re-anchor LLM-read note); a static test guards orphaned JSDoc
1992dadb test(combat): rider-offer-order's non-owner case authors its card as the GM (fix for c69a5e22)
c69a5e22 perf(combat): check the turn stamp and permission before computing rider offers (combat-riders-2)
4905649e docs(plans): aoe records name the -7 and -11 review-fix commits
3fc1643c fix(combat): prune the session maps whose stale entries are never read (combat-riders-29)
a6038b1d docs(aoe): -11 the use-doc gets the 8 missing settings, Parts F/G and a Console pointer to the README API table; a docs-drift test guards both
9448deea perf(combat): [declared D-c4] the picker cue's pointer listeners and observer only while skipPickerGuide is on (combat-riders-35)
fb931b3d fix(aoe): -7 v14 does not refuse a world actor whose id exists — the fixture models the replace, comments and docs say so
de84b8a5 fix(combat): [declared D-c3] escape rider dice and keys in chat-card HTML (combat-riders-33)
b192e714 docs(plans): riders guide Result lists the combat-riders-41 late-tab follow-up
e00705e0 docs(plans): wave-4 report — riders' two document-hook writers recorded under §5.9.4 (W4-R7 summon cleanup, W4-R8 auto-break: accept, no claim)
affd3273 fix(combat): [declared] W4-C1 Adv / Dis pressed while a swing's roll window is open applies to the next swing
f709a285 fix(combat): [declared] Multiattack + Action Surge plans the surge's Multiattack (combat-riders-22 bug half)
8f525b11 fix(riders): [declared] combat-riders-41 — a GM tab arriving after the winner recorded answers with its result, never heals
1514cd22 refactor(combat): S12 core split — combat-core.mjs a barrel over core/{identity,count,weapons,sequence,turn,followups,turn-riders,damage,multiattack,turnflow,layout}.mjs (C10 core; combat-riders-20)
26cdb801 fix(combat): [declared D-c2] S11 the legacy members that take an actor resolve a ref; a miss answers null (combat-riders-12)
0fea9208 fix(combat): [declared D-c1] S11 every hook registration is guarded (combat-riders-30)
ea181b22 refactor(combat): S10 the dead .pentaryn-combat-hidden rule (combat-riders-34 CSS part)
cac1b85b feat(combat): [declared B2] S9 events table — pentaryn-combat.* rows in core HOOKS, legacy pentarynCombat.* double-fire until 0.4.0 (C19, C52; combat-riders-14)
d54ad23d feat(combat): [declared] S7 the kit API — manifest, buildApi, publishNamespace at ready (W2-K1; C27, C28, C29, C50; combat-riders-11, -13 describe half, -10 trace member)
69cc638a docs(plans): wave-4 report — riders migration: open for Joe, integrator edits, live checks
dffcf366 docs(plans): riders migration result and audit status (wave 4, code phase)
7c3dbf90 refactor(combat): followUpsFor(actor, { bonusFree }) in shapes; the bars read it (combat-riders-11 seam)
ddea4c23 docs(plans): aoe migration recorded — guide Result, audit status, wave-4 report (Open for Joe, live plan)
d3a12e5b test(riders): the S2 and S6 todos in core.test become tests
c8ce8381 fix(riders): [declared] combat-riders-41 — Battle Medic relay claims first, one GM tab heals
7d386862 refactor(combat): S8 seams inside the module (combat-riders-3, -4, -5, -21, -22 move, -36 move)
47bc85c7 docs(aoe): S8 README in the blueprint section order, CHANGELOG (-11, -12)
0b9b13fd docs(aoe): -39 cross-reference at placementInProgress; entry header trimmed under the C10 cap
7f1d4bcf perf(aoe): [declared] 8.5 the deleteCombat Careful Spell clean-up batches its writes (C59)
3cc5fd7f fix(riders): [declared, preview only] parseFormula leaves a die with an @reference modifier argument alone
fa8f2d46 perf(aoe): [declared] 8.5 the sweep shares template regions in one batched write (C59)
6516b872 perf(riders): [declared, edge] combat-riders-23 — summon cleanup skips non-concentration effects
0d51383e fix(aoe): [declared] D-A7 (-44) uninstall() restores RegionLayer#placeRegions; a hot-patched copy aims again
32a0a8e6 fix(riders): [declared] combat-riders-12 — legacy API rows resolve a name, id, uuid or Token
18addee4 fix(aoe): [declared] D-A2 (-15) uninstall() restores Argon's own ui.ARGON.bind
0f83d5fe fix(aoe): [declared] D-A1 (-4) applyRows and the tray preview hydrate damages through core.hydrateDamages
7198fe70 perf(aoe): -14 a fresh usage card resolves its effects once per render
bb0d66fd refactor(combat): S6d the runner as a feature; temporary hooks through the registry; graph-allow (C16, C18)
d42a1164 docs(riders): README in the blueprint's section order, CHANGELOG (guide S9)
097c9e67 fix(aoe): [declared] -9 refund's clean-up failures warn instead of vanishing
84c847df fix(aoe): -9 log the errors aoe swallowed or left unattributed (console only)
3a29eb4f refactor(combat): S6b hud.mjs entry wiring; hud/{tooltips, picker, bars} features, hud/buttons-ui, argon-kit adopted (C17; combat-riders-6, -18 phase 1)
065d0d22 refactor(riders): lifecycle through Hooks.once in the entry; the core barrel re-exports by name
536bbcf3 refactor(aoe): 8.6 split — Careful Spell becomes its own feature, careful.mjs
d6dbb324 refactor(riders): pure Hit Dice, Battle Medic gate and report-row kernels; one slot builder (guide S7)
130fb3c3 feat(aoe): -8 trace why the resolve pipeline stopped (debug only)
5009afc4 fix(aoe): [declared] D-A6 (-7) the handle actor is created with the fixed id pentarynAoeHndl0 and keepId
8a29ed7f refactor(combat): S6c turnflow.mjs → turnflow/* features + patches.mjs through the kit (C17 turnflow, C26, C32 code; combat-riders-7, -8)
f54ba674 fix(aoe): [declared] -6 mutate drops a message's queue entry once its writes settle
50d4f655 feat(riders): [declared, console only] combat-riders-27 — audit lines for the Battle Medic relay
c0a75a64 perf(aoe): -2 describeToken takes the handle actor id; resolve() looks it up once
0cbbab0e feat(aoe): [declared] D-A3 + W2-K1 — kit-built API published synchronously at ready through publishNamespace
62d4eda1 fix(riders): [declared, failure path] D-r1 — the Battle Medic relay goes through the kit's guarded
6c159d58 fix(riders): [declared] W2-K1 — publish with publishNamespace, synchronously at ready
3dacbbe1 feat(riders): [declared, additive] the API built from a manifest; inspect, selftest, arcaneRecovery (guide S6)
4644e577 refactor(aoe): S7 API manifest, api.mjs and the -10 reads (built, not yet published)
91dd98db refactor(combat): S6a combat.mjs entry wiring; counting, roll-dock, turn-riders, offhand features
0f1c1822 fix(riders): the three comment-only catches log at debug (guide S3, combat-riders-40)
3f8dd7f7 fix(aoe): [declared] D-A4 — the late-Argon canvasReady fallback registers through the registry
b81fa95d refactor(riders): entry wiring, nine features, patches through wrapMethod (guide S5)
515776c0 refactor(aoe): S6 one log, kit wrapMethod for the Argon guard and the placement wrap (-9, -15, -44)
41b51b43 refactor(aoe): S5 kit hook registry, features install(reg, ctx), entry FEATURES (-30)
33faf80b refactor(combat): S5 settings rows (C21 3/4, C22, C51; combat-riders-13 settings half)
4bc7d44c refactor(aoe): S4 adapters — scene-adapter, messages-adapter, argon.mjs (-5)
e45b8484 refactor(combat): S4 kit log and literal i18n keys (combat-riders-9, -5 T() part, -28)
51f302c7 test(aoe): S4 characterisation — activityOf, isPile fallback, removeArea, template-only finders
0d9f1607 refactor(aoe): S3 nested lang/en.json, full-key _loc literals, i18n.test
5a536025 refactor(riders): full-key _loc literals instead of prefix wrappers (guide S3, i18n half)
87959748 refactor(aoe): S3 settings as one SETTINGS table (-13)
cfc8effd test(aoe): shared handle oracle rows (fixtures/handle-oracle.json) for the isAoeHandle copies
d70ed29b refactor(riders): settings table and readers in settings.mjs (guide S4)
03322772 refactor(aoe): S2 pure moves into core — blueprint constants, isHandle, hydrateDamages (-4)
796b1bc1 refactor(combat): S3 one MODULE, named strip imports, dead exports removed (combat-riders-34)
49750dbc refactor(combat): S2 core constants — MODULE (MOD kept as an alias), SHORT, NS, VERSION, CONTRACT, I18N, CSS, HOOKS
111ac454 refactor(riders): one MODULE in riders-core, blueprint constants (guide S2)
a972ccdf chore(riders): vendor kit 1.0.2 (full tier + patch) — guide S1 remainder
eaff3e00 chore(combat): vendor kit 1.0.2 (full + election, patch, perf, argon-kit, argon-tooltip)
87be8cd4 feat(lib): argon-kit — the shared Argon HUD helpers (audit Wave 8.6, D7)
7d8d96f6 docs(plans): wave-4 report — combat checkpoint 6e802ebb; W4-C1 (strip Adv lost while a window is open) open for Joe
eff0554a docs(plans): combat guide re-anchored to wave-4 base; S1 checkpoint 6e802ebb recorded
6e802ebb test(combat): characterisation checkpoint
0d6c034f docs(plans): transform checkpoint f06e6b18 recorded — re-anchor to a5a1a906, KNOWN and todo pins, coverage
f06e6b18 test(transform): characterisation checkpoint
cc61feb6 docs(plans): aoe checkpoint 7a12ffad recorded — re-anchor, KNOWN and todo pins, coverage
94991024 test(transform): fixed run.mjs; legacy suite moved to core-legacy.mjs; vendor test-kit harness
7a12ffad test(aoe): characterisation checkpoint
cedc2e7e docs(plans): riders checkpoint notes — blank lines around the KNOWN table
30284cbf docs(plans): riders wave-4 characterisation checkpoint 67fe16a3, re-anchor, KNOWN pins and coverage
67fe16a3 test(riders): characterisation checkpoint
5434e6a4 test(riders): argon-tidy and cast-flow glue characterisation (combat-riders-39 recipe)
64262b49 test(riders): rituals and concentration glue characterisation
4a1f63aa test(riders): damage/healing riders, card note, tray preset and the Hit Dice sheet controls
a5621427 test(riders): legacy API oracles and Battle Medic veto, runner and relay characterisation
12e86e58 test(combat): node:test runner, test kit 1.0.2, legacy suite kept as core-fixtures.mjs
9f3d37b5 test(riders): world and DOM fixtures; hook manifest, lifecycle glue and publish characterisation
d7bb2a9d test(riders): test kit 1.0.2 in test/kit, fixed run.mjs, the three self-running suites in LEGACY
ff202cf0 test(aoe): export _internals seams from the feature files (no behaviour change)
30378553 test(aoe): the self-running suite moves to test/legacy-core.mjs; run.mjs is the fixed body
fb18b3dd chore(aoe): vendor kit 1.0.2 (full + election, patch) for the characterisation checkpoint
27509086 docs(plans): wave 4 baseline - riders, aoe, transform, combat
```

</details>
