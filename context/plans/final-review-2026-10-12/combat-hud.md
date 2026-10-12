---
title: "Final review 2026-10-12 — combat-hud"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of combat-hud found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — combat-hud

## Verdict

**NEEDS-JOE.** The nine kept changes preserve behaviour and the gate is green, but real defects are recorded: an Opportunity Attack made through the Reaction slot never writes the reaction flag, any token's actorId change anywhere aborts this client's running sequence, and two documented error handlers (`renderHud`, the picker-guide warn) never catch the async rejection they describe.

## Scope

- Paths: `foundry/module/pentaryn-combat/hud.mjs`, `hud/**`, `turnflow/**`, `argon.mjs`, `styles/combat.css` (module `pentaryn-combat`, area combat-hud), plus this module's `test/**` and this record.
- Base: `4b75feeb` (origin/main when the review started).
- Branch: `review/combat-hud`, worktree `pentaryn-review-combat-hud-wt`.
- Triage: 39 findings. 9 were dropped as duplicates, which left 30 distinct items: 1 DO-EDGE, 8 DO-REFACTOR and 21 RECORD.

## Findings by lens

Line numbers are at the review HEAD where the code moved, otherwise as triaged.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| rob-1 | turnflow/action-buttons.mjs:126 | low | DO-EDGE, kept | A Reaction-slot click that throws left the "reaction" roll tag set |
| M5 | turnflow/*, hud/* (comments) | low | DO-REFACTOR, kept | Comment pointers named pre-split files (hud.mjs/combat.mjs) |
| M4 | argon.mjs:38, hud/buttons-ui.mjs:36 | low | DO-REFACTOR, kept | `ownTooltip` and `multiattack` were exported but never imported |
| ext-4 | turnflow/boundaries.mjs:107 | low | DO-REFACTOR, kept | The {turn, reaction} flag read was duplicated in clearCombatFlags and sweepOrphanFlags |
| M1 | hud/bars.mjs | low | DO-REFACTOR, kept | The "turn touched" rule was written twice (specialSig, composeSpecialBar) |
| M6 | hud/bars.mjs | low | DO-REFACTOR, kept | Six inline Bonus/Special follow-up filters |
| M3 | hud/buttons-ui.mjs:88 | low | DO-REFACTOR, kept | Three copies of the `ranges` getter body |
| ext-1 | hud/pips-bar.mjs | low | DO-REFACTOR, kept | Four pip handlers repeated the same guard ladder |
| ext-2 | hud/bars.mjs:91 | low | DO-REFACTOR, kept | SIGS plus an if/else ladder in onPanelRendered became one BARS table |
| edge-1 | turnflow/action-buttons.mjs:157 | medium | RECORD (defect) | An OA through the Reaction slot paints the pip but never writes `flags.pentaryn-combat.reaction` |
| edge-2 | hud/bars.mjs:427 | medium | RECORD (defect) | onTokenUpdated aborts the running sequence when any token changes actorId |
| ext-3 | turnflow/action-buttons.mjs:81 | medium | RECORD | afterSpecial is an if-ladder on kinds; the Shove rule is in three places |
| perf-1 | hud/bars.mjs:39 | medium | RECORD | Swing-pip getters recompute fullAttackState about 10–18 times per flag write |
| perf-2 | hud/bars.mjs:89 | low | RECORD | followUpsNow runs three times per HUD-actor flag write |
| perf-3 | hud/buttons-ui.mjs:49 | low | RECORD | fullAttackState always scans weapons, even for Multiattack actors |
| perf-4 | turnflow/boundaries.mjs:136 | low | RECORD | Each deleteCombat schedules its own uncoalesced orphan sweep |
| ac-1 | hud/picker.mjs:52 | low | RECORD (defect) | The try/catch around async setArgonSetting never catches; its warn never fires |
| ac-2 | argon.mjs:96 | low | RECORD (defect) | renderHud's doc promises a swallowed render error, but the async rejection escapes |
| ac-3 | hud/bars.mjs:388 | low | RECORD | onSequenceEnd drops its promise; the deleteCombat timer body has no try |
| ac-4 | turnflow/boundaries.mjs:44 | low | RECORD | Two tabs on the GM account both send effect deletes; README says "idempotent" |
| ac-5 | turnflow/boundaries.mjs:123 | low | RECORD | sweepOrphanFlags awaits one update per actor in a loop (C59 scanner misses it) |
| ac-6 | turnflow/death.mjs:27 | low | RECORD | Death-save and massive-damage cards post in preApplyDamage, before damage lands |
| ac-7 | hud/bars.mjs:337 | low | RECORD | rerender is a fixed batching window, not a debounce (doc word fixed under M5) |
| rob-5 | turnflow/boundaries.mjs:141 | low | RECORD | bindLeft calls ui.ARGON.bind from a timer with no try/catch |
| ext-7 | hud/buttons-ui.mjs:117 | low | RECORD | Full Attack falls back to grid distance; follow-ups and the probe fall back to 5 |
| ext-8 | turnflow/action-buttons.mjs:50 | low | RECORD | The "until turn end" effect payload is built in two files |
| ext-11 | hud/buttons-ui.mjs:218 | low | RECORD | README's "add a follow-up kind" recipe misses two HUD branches |
| M7 | turnflow/action-buttons.mjs:20 | low | RECORD | The temp-hook shim and `opts` helper are copied across feature files |
| M8 | hud/bars.mjs:382 | low | RECORD | bars owns session-map pruning and sequence aborts under "bars:" labels |
| M9 | README.md:98 | low | RECORD | README repeats the "Per player (user flags, not settings)" paragraph |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 920ac09d | rob-1: wrapReactionSlot forgets the roll tag in `finally` when the click was not used, so a throwing click no longer leaves "reaction" set | `test/turnflow.test.mjs`: "the Reaction slot's click that throws (no use) still forgets the tag" (failed before the fix) |
| 74ee332e | M5: comment pointers name counting.mjs, hud/bars.mjs and "batched"; comments only | Full suite; goldens byte-identical |
| 14116124 | M4: `ownTooltip` and `multiattack` are file-private | `test/hooks.test.mjs`: "dead exports gone (final review): ownTooltip and multiattack are file-private" |
| c1bdc333 | ext-4: file-private `combatFlagsOf(actor)` shared by clearCombatFlags and sweepOrphanFlags | Existing flag-cleanup tests; goldens byte-identical |
| b6f04dea | M1: file-private `turnTouched(turn)` shared by specialSig and composeSpecialBar | argon-bars, argon-rerender goldens byte-identical |
| cada46e3 | M6: `bonusFollowUps` / `freeFollowUps` replace six inline filters | argon-bars, follow-ups-now, picker-cue, failure-hud goldens byte-identical |
| edaa9d72 | M3: one `rangesOf(a, fallback)`; each class keeps its own fallback | `test/hud.test.mjs`: "PickerProbe.ranges: range, reach, then 5" (characterization, passes before and after) |
| 9f3479f8 | ext-1: private `spendPip` behind the four pip handlers, same guard order | `test/hud.test.mjs`: "events spend Argon's own pips…" |
| 260fb681 | ext-2: one BARS table (label → sig, compose), same order, `Object.hasOwn` match | argon-bars, argon-rerender, hooks goldens byte-identical |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** edge-1 — `turnflow/action-buttons.mjs:157`: an Opportunity Attack through the wrapped Reaction slot never writes `flags.pentaryn-combat.reaction`, so the turn-start relight, restorePips and `inspect().reaction` miss it. Write the flag after `used` in combat, or have counting.mjs record it for a swing tagged "reaction".
- **defect** edge-2 — `hud/bars.mjs:427`: onTokenUpdated aborts the running Full Attack / follow-up when any token changes actorId. Compare `doc.id` with the running creature's token id.
- **defect** ac-2 — `argon.mjs:96`: renderHud's doc says a throwing render is swallowed at debug, but the async rejection escapes. Use `Promise.resolve(ui.ARGON.render()).catch(err => log.debug("HUD re-render (HUD closed)", err))`.
- **defect** ac-1 — `hud/picker.mjs:52`: the "marking Argon's picker tutorial seen failed" warn never fires, because `game.settings.set` rejects asynchronously. Add `.catch(err => log.warn(...))` on `Promise.resolve(setArgonSetting(...))`.
- ac-3 — `hud/bars.mjs:388`: `return turnSettled(actor).then(...)` from onSequenceEnd, and wrap the deleteCombat timer body in try/catch with a debug log like pips-bar.mjs:93.
- rob-5 — `turnflow/boundaries.mjs:141`: wrap `ui.ARGON?.bind?.(left[0])` in bindLeft with `try … catch (err) { log.warn("HUD follow", err) }`, as followTo does.
- ext-3 — `turnflow/action-buttons.mjs:81`: turn afterSpecial into an AFTER table keyed by kind, after adding off-turn Dodge/Hide rows to golden/turnflow-specials. The Shove rule's core twin (recordSpecialAction) is out of scope.
- perf-1 — `hud/bars.mjs:39`: decide on memoising fullAttackState (input-fingerprint memo, or a burst-scoped state set by refreshAll in try/finally). A microtask memo is unsafe: hud.test.mjs:184-186 flips combat.started between reads.
- perf-2 — `hud/bars.mjs:89`: share one lazily cached followUpsNow thunk between checkBars and recheckSlots (3 calls → 1), re-throwing a cached error so each debug line still logs. Decide together with perf-1.
- perf-3 — `hud/buttons-ui.mjs:49`: scan weapons only inside the `!ma && weaponId` branch. This changes what an NPC with Multiattack and a malformed attack item shows, so it needs a declared difference.
- perf-4 — `turnflow/boundaries.mjs:136`: coalesce the deleteCombat orphan sweep (a debounce cancelled in uninstall, or an in-flight guard). Changes sweep count and the timing golden.
- ac-4 — `turnflow/boundaries.mjs:44`: two tabs on the active GM account both send the same effect deletes, and the loser warns and stops before clearCombatFlags. Claim per round:turn, treat "does not exist" as success, or reword README's "each write is idempotent".
- ac-5 — `turnflow/boundaries.mjs:123`: sweepOrphanFlags does one awaited actor.update per actor. Batching changes the write count that flag-cleanup.test pins. Separately, conformance.py C59 misses an await made through a same-file helper.
- ac-6 — `turnflow/death.mjs:27`: post the death-save-failure and massive-damage cards from `dnd5e.applyDamage` rather than from the pre hook, so a later veto leaves no card. Latent: nothing in the repo vetoes preApplyDamage.
- ac-7 — `hud/bars.mjs:337`: rerender is a fixed batching window. A leftover timer can flush a later batch early. Harmless (renders are idempotent); note only.
- ext-7 — `hud/buttons-ui.mjs:117`: decide one range fallback. Full Attack uses the scene grid distance, while follow-ups and PickerProbe use 5. This is a rule call and players would see it.
- ext-8 — `turnflow/action-buttons.mjs:50`: move the "until turn end" ActiveEffect payload into a pure builder in core/turnflow.mjs, shared with effects.mjs.
- M7 — `turnflow/action-buttons.mjs:20`: one tempHooks(getReg) factory and one `opts` helper (context.mjs, the reg, or the kit), with graph.json re-pinned.
- M8 — `hud/bars.mjs:382`: move session-map pruning and sequence aborts into sequence.mjs / turn-riders.mjs listeners the next time the hooks golden is re-pinned on purpose.
- M9 — `foundry/module/pentaryn-combat/README.md:98`: delete the duplicated "Per player (user flags, not settings)" paragraph.
- ext-11 — `hud/buttons-ui.mjs:218`: add the via-specific tooltip key in FollowUpButton and the off-hand duplicate-slot hiding to README's "add a follow-up kind" recipe.
- styles/combat.css:40 — a stale comment on Argon's DOM was left alone (CSS on another package's DOM is untouchable); fix it when that file is next edited.

## Verification

- 920ac09d — keep
- 74ee332e — keep
- 14116124 — keep
- c1bdc333 — keep
- b6f04dea — keep
- cada46e3 — keep
- edaa9d72 — keep
- 9f3479f8 — keep
- 260fb681 — keep

## Gates

- `node test/run.mjs` in `foundry/module/pentaryn-combat`: 247 tests pass, 0 fail; 326 core fixtures pass.
- Vendored kit identical (14 files); conformance 96.0% (48/50), accepted exceptions C21 and C23 only (pre-existing, no new rows).
- Every diff path is in scope or in the module's `test/**`; the untouchables are clean.
- `make check-context`: passes with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
