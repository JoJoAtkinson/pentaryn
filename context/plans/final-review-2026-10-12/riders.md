---
title: "Final review 2026-10-12 — riders"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of riders found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — riders

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are recorded: concentration auto-break runs in every tab of the roller's account, Arcane Recovery writes from a pre-dialog slot snapshot, and Potent Spellcasting matches across rules by name.

## Scope

- Paths: `foundry/module/pentaryn-riders/**` (module `pentaryn-riders`) and this record.
- Base: `bb93da9f` (origin/main when the review started).
- Branch: `review/riders`, worktree `pentaryn-review-riders-wt`.
- Triage: 40 findings, giving 10 DO (3 DO-EDGE, 7 DO-REFACTOR), 15 RECORD and 15 DROP (10 duplicates, 3 wrong, 5 not worth a commit). The sceneId finding (three copies) was dropped as wrong, because the kit's bind reads `opts.sceneId` for ref scope.

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EC-4 | patches.mjs:37 | low | DO-EDGE, kept | Overlapping Argon tooltip builds for one item lost the roll-data mark when the first build finished |
| rob-1 | api.mjs:149 | low | DO-EDGE, abandoned | `inspect(actor, null)` throws a destructuring TypeError |
| rob-2 | shapes.mjs:145 | low | DO-EDGE, reverted | `spendHitDie` / `installBattleMedic` with a null opts throw |
| riders-maint-01 | patches.mjs, api.mjs | low | DO-REFACTOR, abandoned | `patchRecords()` duplicated in two files |
| riders-maint-03 | rituals.mjs, cast-flow.mjs | low | DO-REFACTOR, kept | Ritual Adept / Arcane Recovery re-built item info by hand instead of `shapes.itemInfo` |
| riders-maint-06 | shapes.mjs | low | DO-REFACTOR, kept | The relay query name was defined twice |
| riders-maint-04 | table-core.mjs | low | DO-REFACTOR, kept | Set-or-array statuses normalisation lived twice |
| (README rows) | README.md | low | DO-REFACTOR, kept | README Patches and adjustments section missed six adjustments.yml rows |
| (battleMedicBlock) | battle-medic.mjs:37 | low | DO-REFACTOR, reverted | Unused `healer` parameter |
| (stale headers) | riders-core.mjs, table-core.mjs | low | DO-REFACTOR, kept | File headers described the pre-split module |
| riders-async-1 | concentration.mjs:119 | medium | RECORD | Concentration auto-break runs in every tab of the rolling account |
| riders-async-2 | cast-flow.mjs:209 | medium | RECORD | Arcane Recovery writes absolute slot values from a snapshot taken before the dialog |
| riders-async-3 | concentration.mjs:66 | low | RECORD | Summon cleanup elects a user, not a tab |
| riders-async-4 | battle-medic.mjs:155 | low | RECORD | One awaited write per deleted 'Heal dX' activity |
| riders-async-5 | api.mjs:28,48 | low | RECORD | setType / retireManual write once per loop iteration |
| riders-maint-02 | battle-medic.mjs:216 | low | RECORD | claimedHeal repeats its release block, and waitForResult re-implements recordedAnswer |
| riders-ext-4 | api.mjs:139 | low | RECORD | selftest hard-codes 23 hooks |
| riders-ext-6 | table-core.mjs:227 | low | RECORD | isArcaneRecovery doc says "PHB source" but the code never checks the source |
| EC-3 | cast-flow.mjs:237 | low | RECORD | The sidebar keep stays armed for 60 s when postSummon never fires |
| EC-5 | riders-core.mjs:158 | low | RECORD | matchRule's name fallback overrides an identifier that names another rule |
| EC-6 | damage-riders.mjs:83 | low | RECORD | The once-per-casting guard misses rolls configured before the first message exists |
| rob-3 | shapes.mjs:147 | low | RECORD | String `faces` never matches a pool, so the largest die is spent |
| rob-5 | api.mjs:28 | low | RECORD | setType accepts any non-empty type and reports success |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 13924e68 | EC-4: `tooltipItems` is a Map that counts the tooltip builds in flight for each item | `test/argon-tidy.test.mjs`: "overlapping tooltip builds for one item both enrich with its roll data" (failed before the fix) |
| 41ff3457 | riders-maint-03: `hasRitualAdept` and `isArcaneRecovery` read items through `shapes.itemInfo` | `test/rituals-glue.test.mjs`: "Ritual Adept is found by compendiumSource alone and by flags.core.sourceId alone" (passes on old and new source) |
| 9d1d39bf | riders-maint-06: `shapes.RELAY_QUERY` is the single home of the `${MODULE}.battleMedic` query name | Existing battle-medic and describe goldens, byte-identical |
| 1449ea08 | riders-maint-04: `concentrationEffectFor` reads statuses through `isConcentration` | table-core suite (Set and array statuses fixtures) |
| 78567dcf | The README names all six missing adjustments.yml rows the module owns | `test/docs.test.mjs`: "every adjustments.yml row owned by pentaryn-riders is named in the README Patches and adjustments section" |
| afc574b0 | riders-core and table-core headers name their real importers (comment only) | n/a (comment only) |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 3ddd1af7 | 4e71fe97 | A behaviour change. With null opts, `spendHitDie` and `installBattleMedic` used to throw and now write. No promise covered that: the manifest and README give object-typed opts, `inspect` still throws on null, and the bridge never sends null. |
| 00a38206 | be2b44f8 | Not strictly neutral. Dropping the `activity.actor` argument changes the veto's failure path when `.actor` throws on a flow-flagged activity (before, it warned and skipped; after, it vetoes). Cosmetic gain only. |

## Recorded for Joe

- **defect** `concentration.mjs:119`: auto-break is gated only by `userId !== game.user.id`, so every tab of the roller's account (MCP bridge plus GM browser) calls `endConcentration` and updates the outcome. That breaks README:130 "nothing runs twice". Elect one tab with `claimMessage(message, "autoBreak", { scope: MODULE })`, or reword the README. Also note the C61 scanner gap: a userId gate counts as a gate.
- **defect** `cast-flow.mjs:209`: Arcane Recovery snapshots slots at :163 before the non-modal `DialogV2.wait` (:178) and writes `slots[l].value + n`. A cast, edit or rest while the dialog is open is overwritten. Re-read the slots after the await, re-check, and decide what the player sees when the fresh check fails.
- **defect** `riders-core.mjs:158`: the matchRule name fallback lets a druid's "Potent Spellcasting" (identifier `elemental-fury-potent-spellcasting`) also match `potent-spellcasting-cleric`, which gives +WIS on cleric cantrips for a druid/cleric. This is a rules decision. One option is to skip the name fallback when the identifier or source names another RULES row.
- **defect** `damage-riders.mjs:83`: the once-per-casting guard reads only existing messages, so two damage rolls configured from one card before the first message exists can both take Elemental Affinity. That breaks README "once per casting". No action unless it is seen in play.
- `cast-flow.mjs:237`: the sidebar keep, armed on `dnd5e.preSummon`, stays armed for 60 s when dnd5e returns without `postSummon`, so a deliberate switch to the Actors tab is reverted. Make it one-shot, or clear it in a finally around `placeSummons` (that would need a new wrap and adjustments row).
- `concentration.mjs:66`: summon cleanup elects a user (`activeGM.isSelf`), not a tab, so each GM tab sends the same Token delete. Add a one-tab claim, or reword README:137-138.
- `api.mjs:139`: selftest pins `hooks.length === 23`. Either switch to `> 0` like the other modules, or add "bump the count" to the README Extending recipe.
- `api.mjs:28`: setType accepts any non-empty type (typo, disallowed, stringified array) and reports success. Validate it against the rule's `types`.
- `shapes.mjs:147`: `spendHitDie` with string faces ('6' or 'd6') spends the largest die. Decide whether strings are part of the contract, and if so coerce them as battle-medic.mjs does.
- `table-core.mjs:227`: the isArcaneRecovery doc says "PHB source" but only identifier and name are checked. Fix the comment, or add a source branch (a behaviour change).
- `battle-medic.mjs:155`: installBattleMedic deletes each 'Heal dX' activity with its own awaited write. Fold them into one `item.update`. C59 does not see `deleteActivity` in a loop.
- `api.mjs:28,48`: setType / retireManual write once per item (C59 warnings). Batch them.
- `battle-medic.mjs:216`: claimedHeal repeats its claim-release finally block, and waitForResult (:269) re-implements recordedAnswer. Pure refactor, deferred by the 10-item DO cap.
- `api.mjs:149` (rob-1, abandoned apply): `inspect(actor, null)` throws. The planned fix was `opts ?? {}` plus a test in api.test.mjs. Weigh it together with the reverted 3ddd1af7 so that null opts are handled the same way on every row.
- `patches.mjs` / `api.mjs` (riders-maint-01, abandoned apply): dedupe `patchRecords()` by exporting it from api.mjs, re-exporting it from patches.mjs, and narrowing the lib/patch.mjs import to `wrapMethod`. Re-check conformance C16.
- `shapes.mjs:145` (reverted 3ddd1af7): if Joe wants null opts treated as omitted, re-apply it as a declared change on spendHitDie, installBattleMedic and inspect together.
- `battle-medic.mjs:37` (reverted 00a38206): `battleMedicBlock`'s `healer` parameter is unused. Dropping it changes the veto path for a throwing `activity.actor`. Leave it, or drop it as a declared change.
- The relayed triage list was cut off after EC-6. Triage counted 15 RECORD items and this record lists 13 of them, so check the triage output for any others.

## Verification

- 13924e68: keep
- 41ff3457: keep
- 9d1d39bf: keep
- 1449ea08: keep
- 78567dcf: keep
- afc574b0: keep
- 3ddd1af7: revert (4e71fe97)
- 00a38206: revert (be2b44f8)

## Gates

- Module gate (`node test/run.mjs`, kit identity, conformance): ok. 178 tests, 178 pass, 0 fail. riders-core 103, rituals-core 22 and table-core 39 passed. The vendored kit is identical to foundry/lib (11 files). pentaryn-riders conformance is 96.0% (48/50), with only the accepted exceptions C37 and C56 and no new rows. The diff stays inside scope.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
