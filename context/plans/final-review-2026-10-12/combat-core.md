---
title: "Final review 2026-10-12 — combat-core"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of combat-core found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — combat-core

## Verdict

**NEEDS-JOE.** Ten behaviour-preserving commits were kept and every gate is green, but two recorded items are real defects against promises the module already makes (EC-6 Multiattack Off, EC-5 Frenzy `0d6`), and fixing them changes behaviour, so Joe has to decide.

## Scope

- Module `pentaryn-combat` (area combat-core, kind module).
- Paths: `combat.mjs`, `combat-core.mjs`, `api.mjs`, `api-manifest.mjs`, `context.mjs`, `core/**`, `counting.mjs`, `sequence.mjs`, `shapes.mjs`, `strip.mjs`, `turn-riders.mjs`, `offhand.mjs`, `patches.mjs`, `settings.mjs`, `dialog-adapter.mjs`, `roll-dock.mjs`, all under `foundry/module/pentaryn-combat/`, plus that module's `test/**`.
- Base `bb93da9f` (origin/main). Branch `review/combat-core`.
- Triage: 42 findings received (M1–M14, ROB-1–6, EXT-1–14, EC-1–7, AC-1). The finding list was cut off partway through AC-1, so any findings after it were never received or triaged. Result: 10 DO (4 DO-EDGE, 6 DO-REFACTOR), 23 RECORD, 9 DROP (6 duplicates merged into their pairs: EC-3 into ROB-1, EXT-10 into M2, and others; M11, M12 and EXT-8 not worth a commit).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| ROB-1 (+EC-3) | sequence.mjs (abortFor) | medium | DO-EDGE | abortFor did not end a run waiting on the fallback Retarget pick; the run hung |
| EC-2 | strip.mjs (onKey) | medium | DO-EDGE | Esc while picking a new target with no pending choice left the run unsettled |
| EC-1 | context.mjs:43 (uninstall) | medium | DO-EDGE | uninstall left `ctx.contributions`, so a hot re-import never republished the API |
| EC-4 | strip.mjs (pickWeapon) | low | DO-EDGE | a replaced weapon picker could close the new one and leave a promise pending |
| EXT-1 | api.mjs (ACTOR_ROWS) | low | DO-REFACTOR | derive the legacy ACTOR rows from MANIFEST instead of a hand-copied list |
| M4 | turn-riders.mjs | low | DO-REFACTOR | build the rider once-key in one helper, `riderOnce` |
| M3 | shapes.mjs (planFor) | low | DO-REFACTOR | planFor picks Multiattack through `multiattackFor` |
| EXT-2 | test/i18n.test.mjs | low | DO-REFACTOR | drift test: the manifest RIDER type lists exactly the TURN_RIDERS keys |
| M1 | core/count.mjs, core/weapons.mjs | low | DO-REFACTOR | move the orphan weapon-shape doc to core/weapons.mjs and name its real builder |
| M13 | strip.mjs:231 | low | DO-REFACTOR | the roll-dock registration comment now sits above the handlers it names |
| M2 (+EXT-10) | core/turn.mjs:7 | low | RECORD | unused `followUps` import creates a turn↔followups cycle that graph.json pins |
| M10 | core/turn.mjs:8 | low | RECORD | turn.mjs↔turnflow.mjs cycle exists only because of actionsLeft |
| M14 | README.md:95 | low | RECORD | duplicated user-flags paragraph; the turn-flag row leaves out `quickened` |
| ROB-2 | sequence.mjs:380 | low | RECORD | api.abort only matches an identical Actor or uuid |
| ROB-3 | turn-riders.mjs:185 | low | RECORD | three DOM listeners drop async promises without a catch |
| ROB-4 | context.mjs:43 | low | RECORD | a throwing feature uninstall aborts ctx.uninstall() partway |
| ROB-5 | counting.mjs:118 | low | RECORD | three document writes swallow failures at debug level |
| ROB-6 | sequence.mjs:396 | low | RECORD | api.followUp(actor) with a missing followUp rejects with a bare TypeError |
| EC-5 | core/turn-riders.mjs:79 | low | RECORD | riderDice(frenzy, null/''/0) returns `0d6` |
| EC-6 | shapes.mjs:184 | low | RECORD | Multiattack setting Off still sizes Full Attack from Multiattack |
| EC-7 | patches.mjs:64 | low | RECORD | PreciseText x/y getter returns 0 even with scrollingTextGuard Off |
| AC-1 | offhand.mjs:56 | low | RECORD | seedAll awaits one setFlag per character inside a loop |
| M5 | sequence.mjs:57 | low | RECORD (cap) | 120000 ms expect-TTL and settle-loop heuristics are bare literals |
| M6 | settings.mjs:9 | low | RECORD (cap) | header says no other file calls game.settings, but turn-riders.mjs does |
| M8 | offhand.mjs:22 | low | RECORD | resetOffhandMode and installOffhand are exported only for tests |
| M9 | sequence.mjs:249 | low | RECORD (cap) | runSwings is about 128 lines doing three jobs |
| EXT-4 | sequence.mjs:396 | low | RECORD (cap) | runFollowUp is an if-ladder with duplicated offhand/nick branches |
| EXT-6 | sequence.mjs:166 | low | RECORD (cap) | the enhancedDualWielding flag read is copy-pasted |
| EXT-7 | counting.mjs:148 | low | RECORD (cap) | the Multiattack-item regex is duplicated |
| EXT-9 | core/turn-riders.mjs:56 | low | RECORD (cap) | a typo in a rider's `needs` silently falls to 'weapon' |
| EXT-11 | core/damage.mjs:18 | low | RECORD | the attack-action kinds and movement keys are written in several core files |
| EXT-12 | shapes.mjs:426 | low | RECORD | the Flurry strike-count rule is duplicated in shapes |
| EXT-13 | offhand.mjs:20 | low | RECORD (cap) | Argon's package id is repeated in three files |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 844b4a62 | ROB-1: strip.mjs exports `cancelWaits()`, which Stop and hide() both use; sequence.mjs `abortFor` calls it after `choose({type:'stop'})` | sequence.test.mjs "abortFor ends a sequence waiting on the fallback Retarget pick" |
| cc6d4ab5 | EC-2: Esc while paused with no pending choice runs the same steps as Stop | sequence.test.mjs "Esc while picking a new target stops the sequence (strip: Esc while paused = Stop)" |
| 4244a290 | EC-1: `uninstall()` clears `ctx.contributions` | reimport.test.mjs "uninstall then a hot re-import republishes the API" |
| 93be74b0 | EC-4: each pickWeapon keeps its own element; done() clears only its own picker | strip.test.mjs "pickWeapon: a replaced picker never closes the new one — a click elsewhere settles both, no listener left" |
| de7be2b6 | EXT-1: ACTOR_ROWS built from MANIFEST.rows | api.test.mjs "every ACTOR-param legacy row answers null for a bad ref" |
| deb8f74d | M4: `riderOnce()` helper in turn-riders.mjs | existing riders.test.mjs, trace-riders.test.mjs |
| 738421c2 | M3: planFor uses `multiattackFor` | existing api/seams/sequence/shapes suites (plans.json, full-attack-plans.json, api-calls.json goldens) |
| 5ef85104 | EXT-2: manifest RIDER drift test (test only) | i18n.test.mjs "the manifest RIDER type lists exactly the TURN_RIDERS keys" |
| 69c57bf1 | M1: weapon-shape doc moved to core/weapons.mjs (comments only) | full suite; comment-only |
| a7a375af | M13: roll-dock registration comment moved (comments only) | full suite; comment-only |

Side effects worth knowing (both within the existing promises): with Argon's picker active, Esc during a pause now stops the sequence as the Stop button does (cc6d4ab5); when two weapon pickers are open at once, a click inside the new one settles the old one with null instead of leaving it pending forever (93be74b0).

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** EC-6 `foundry/module/pentaryn-combat/shapes.mjs:184`: with the multiattack setting Off, countFor still reads the Multiattack total, so api.plan, inspect and the HUD Full Attack keep a Multiattack-sized attack, against README "Off restores: Multiattack card only". Fix: pass `{ multiattackOn }` into countFor from api.plan/inspect and hud/buttons-ui, and skip multiattackOf when it is false. Test: with multiattack false, `api.count(wolf) === 1` and `api.plan(wolf).swings.length === 1` (both 2 today).
- **defect** EC-5 `foundry/module/pentaryn-combat/core/turn-riders.mjs:79`: `riderDice(frenzy, null | undefined | '' | 0)` returns `'0d6'`, so the card shows "+ Frenzy 0d6" and Auto mode spends Frenzy for no damage. Fix: require a positive count. Test: those inputs give `''`; `3` and `{value:3}` give `'3d6'`.
- ROB-2 `foundry/module/pentaryn-combat/sequence.mjs:380`: api.abort matches only an identical Actor or uuid; a Token, name or id does nothing. Decide whether the README's "legacy members that take an actor accept …" covers abort (manifest says `Actor`); if so add a resolving wrapper in api.mjs, not an ACTOR_ROWS entry.
- ROB-3 `foundry/module/pentaryn-combat/turn-riders.mjs:185`: add `.catch(err => log.warn(...))` to the rollRider and onQuick calls and a try/catch around the swing-damage listener so failures are prefixed, not "Uncaught (in promise)".
- ROB-4 `foundry/module/pentaryn-combat/context.mjs:43`: wrap each feature's `uninstall?.()` in try/catch with a warn, and run `reg.offAll()` in a finally.
- ROB-5 `foundry/module/pentaryn-combat/counting.mjs:118`: raise the swallowed write failures (Reaction flag; also `sequence.mjs:367` rememberWeapon and `offhand.mjs:80` seedWeaponSets cross-user write) from debug to `log.warn`; re-pin failure-paths "both swallowed".
- ROB-6 `foundry/module/pentaryn-combat/sequence.mjs:396`: guard runFollowUp with `if (!f || typeof f !== 'object') return { rolled: 0, status: 'unknown' };`.
- EC-7 `foundry/module/pentaryn-combat/patches.mjs:64`: only if exact Off-parity is wanted, make the PreciseText getter honour `setting('scrollingTextGuard')`.
- AC-1 `foundry/module/pentaryn-combat/offhand.mjs:56`: batch seedAll's per-character setFlag calls into one `Actor.updateDocuments` and re-pin seed-all.json (§5.9.4). The finding text was truncated; triaged from the code.
- M2 `foundry/module/pentaryn-combat/core/turn.mjs:7`: delete the unused `followUps` import; re-pin test/golden/graph.json (edge at :74-75, DFS order at :266-267). The finding's "no golden changes" claim is wrong.
- M10 `foundry/module/pentaryn-combat/core/turn.mjs:8`: move actionsLeft into core/turn.mjs with M2, in the same graph.json re-pin.
- M14 `foundry/module/pentaryn-combat/README.md:95`: delete the duplicate paragraph at 98-99 and add `quickened` to the turn-flag shape at :138.
- M8 `foundry/module/pentaryn-combat/offhand.mjs:22`: decide whether to drop the test-only exports resetOffhandMode and installOffhand and repoint counting.test:263-268 and shapes.test:318.
- EXT-11 `foundry/module/pentaryn-combat/core/damage.mjs:18`: share ATTACK_ACTION_KINDS / MOVEMENT_KEYS in a window that re-pins core-exports.json and graph.json, or add cross-reference comments.
- EXT-12 `foundry/module/pentaryn-combat/shapes.mjs:426`: a core `flurryCount(features)` export, or have core.followUps emit the disabled Flurry entry (re-pins core-exports.json or follow-ups-now.json).
- EXT-2 follow-up `foundry/module/pentaryn-combat/api-manifest.mjs:20`: build RIDER.type from TURN_RIDERS, and note in README "Extending → A turn rider" that describe()'s rider param comes from the manifest.
- M5 `foundry/module/pentaryn-combat/sequence.mjs:57` (deferred, cap): name EXPECT_TTL_MS, DAMAGE_WAIT_MS, IDLE_POLLS, IDLE_MIN_MS.
- M6 `foundry/module/pentaryn-combat/settings.mjs:9` (deferred, cap): move the aoe setting read into settings.mjs or name the C23 exception in the header.
- M9 `foundry/module/pentaryn-combat/sequence.mjs:249` (deferred, cap): extract onPaused and swingRollArgs from runSwings, keeping await order.
- EXT-4 `foundry/module/pentaryn-combat/sequence.mjs:396` (deferred, cap): a frozen SINGLE_SWING table for runFollowUp.
- EXT-6 `foundry/module/pentaryn-combat/sequence.mjs:166` (deferred, cap): one `enhancedDualWieldingOf(actor)` helper in shapes.mjs.
- EXT-7 `foundry/module/pentaryn-combat/counting.mjs:148` (deferred, cap): one `isMultiattackItem(item)` helper in shapes.mjs.
- EXT-9 `foundry/module/pentaryn-combat/core/turn-riders.mjs:56` (deferred, cap): a test that every TURN_RIDERS `needs` is a known value.
- EXT-13 `foundry/module/pentaryn-combat/offhand.mjs:20` (deferred, cap): export ARGON from settings.mjs.
- Triage gap: the finding list was cut off partway through AC-1, so any findings after it were never received. Re-run that lens if it matters.

## Verification

- 844b4a62: keep
- cc6d4ab5: keep
- 4244a290: keep
- 93be74b0: keep
- de7be2b6: keep
- deb8f74d: keep
- 738421c2: keep
- 5ef85104: keep
- 69c57bf1: keep
- a7a375af: keep

## Gates

- `node test/run.mjs` in `foundry/module/pentaryn-combat`: 250 tests pass, 0 fail; core: 326 fixtures pass.
- Vendored kit identical to foundry/lib (14 files); conformance 96.0% (48/50), accepted exceptions C21 and C23 only (existing rows).
- `git diff --quiet origin/main -- '**/golden/**'`: clean. Goldens byte-identical: yes.
- Untouchables clean; every diff path is in scope or in the module's test/.
- `make check-context` with this record in place: pass.
