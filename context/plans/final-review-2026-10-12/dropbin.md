---
title: "Final review 2026-10-12 — dropbin"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of dropbin found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — dropbin

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving refactors, and the gate is green with byte-identical goldens. But the review recorded real defects: drops are recorded once per client, a relayed entry is lost before `ready`, HUD Revive can run two reverts concurrently, linked NPC corpses never open for players, and a restore onto an unresolved target silently falls back to the original actor.

## Scope

- Paths: `foundry/module/pentaryn-dropbin/**` (module `pentaryn-dropbin`) and this record.
- Base: `6a06664c` (origin/main when the review started).
- Branch: `review/dropbin`, worktree `pentaryn-review-dropbin-wt`.
- Triage: 50 findings gave 10 DO (3 DO-EDGE, 7 DO-REFACTOR), 32 RECORD and 8 DROP. The drops were 7 duplicates merged into R1/R2, R3, R8, R9, M2, M3 and perf-1, plus M14, which needs no action.

## Findings by lens

Line numbers are the ones the triage gave, at the base commit.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| R1 | ledger-core.mjs (listLast) | low | DO-EDGE, reverted | `listLast(log, 0)` / `list(0)` returned the whole ledger |
| R2 | ledger.mjs:144 | low | DO-EDGE, reverted | `list(n, null)` throws a destructuring TypeError |
| M5 | corpses.mjs:49 | low | DO-EDGE, reverted | `corpses.isDead` returns undefined for a missing actor, but the manifest says boolean |
| M1 | settings.mjs:97 | low | DO-REFACTOR, kept | `writeLedger` was exported, but only `drain()` uses it; the entry header named it |
| M7 | ledger.mjs:153 | low | DO-REFACTOR, kept | restoreResult JSDoc did not list the `not-created` reason |
| M9 | corpses.mjs:16 | low | DO-REFACTOR, kept | Header said "the GM" converts, but every tab of the active GM user does |
| M10 | dropbin.mjs (header) | low | DO-REFACTOR, kept | Lifecycle comment did not name the init listener or the ready handlers in order |
| M2 | corpses.mjs:37, itempiles.mjs:134 | low | DO-REFACTOR, kept | The active-GM runner predicate was defined twice |
| M4 | corpses.mjs | low | DO-REFACTOR, kept | The legacy Lootable-effect check was written inline four times |
| M3 | corpses.mjs, api.mjs | low | DO-REFACTOR, kept | `ourCorpse` / `noLoot` were re-derived in api.mjs |
| M6 | itempiles.mjs:219 | low | RECORD (cap) | The two lock-veto handlers have identical bodies |
| M8 | api-manifest.mjs:98 | low | RECORD | The inspect row omits the `opts {sceneId}` param |
| M11 | loot.mjs:59 | low | RECORD (cap) | The native Take-All probe hardcodes `pd-loot-all` instead of `BTN` |
| M12 | ledger.mjs:218 | low | RECORD (cap) | ledger.mjs probes `globalThis.socketlib` outside the adapter |
| M13 | api-manifest.mjs:18 | low | RECORD | `corpseRow` also builds the loot.* rows (better name: `legacyRow`) |
| R3 | ledger-core.mjs:111 | medium | RECORD | An unresolved explicit restore target restores onto the original actor and returns ok:true |
| R4 | ledger.mjs:160 | low | RECORD | Restores of items dropped from unlinked tokens go to the base actor; `fromActorUuid` is unused |
| R5 | ledger.mjs:163 | low | RECORD | restoreResult rejects with raw errors instead of returning a coded `{ok:false}` |
| R6 | corpses.mjs:69 | low | RECORD | Legacy toCorpse/fromCorpse/sync throw raw TypeErrors; toCorpse can half-apply |
| R7 | corpses.mjs:321 | low | RECORD | A HUD Revive rejection is unhandled and unprefixed |
| R8 | corpses.mjs:193 | low | RECORD | A failed eye-texture load is retried on every paintEye |
| R9 | itempiles.mjs:121 | low | RECORD | The 'Locked' float can land on a different unlinked chest of the same base actor |
| R10 | settings.mjs:67 | low | RECORD | A malformed relayed entry rejects its whole coalesced batch |
| EXT-2 | api-manifest.mjs:38 | medium | RECORD | revive/fromCorpse/sync rows under-report their sideEffects |
| EXT-3 | loot.mjs:59 | medium | RECORD (cap) | Item Piles DOM selectors live outside the piles.mjs adapter |
| EXT-5 | loot.mjs:44 | low | RECORD | Loot all's fallback recipient hard-codes `character` |
| EXT-6 | api-manifest.mjs:29 | low | RECORD | The corpse writer rows repeat one seven-element sideEffects literal |
| EXT-7 | i18n-shim.mjs:37 | low | RECORD (cap) | Nothing checks that LEGACY_KEYS and LITERAL have the same keys |
| EXT-8 | corpses.mjs:34 | low | RECORD | The eye texture is world data that the module does not ship |
| EC-2 | ledger-core.mjs:24 | medium | RECORD | The tail dedupe drops a real second loss of a same-named item within 2 s |
| EC-3 | corpses.mjs:78 | medium | RECORD | Linked NPC corpses never grant players OBSERVER |
| EC-4 | corpses.mjs:296 | medium | RECORD | HUD Revive can run fromCorpse twice concurrently and erase the restored ownership |
| EC-5 | corpses.mjs:38 | low | RECORD | sync sees linked tokens only on the GM's viewed scene |
| EC-6 | corpses.mjs:63 | low | RECORD | toCorpse never repairs a lost OBSERVER write |
| EC-9 | api.mjs:59 | low | RECORD | `inspect('<name>')` throws AMBIGUOUS when several tokens share a name |
| DB-AC-1 | ledger.mjs:109 | medium | RECORD | Drop capture runs on every client, so multi-item drops are recorded more than once |
| DB-AC-2 | ledger.mjs:223 | medium | RECORD | A relayed entry that reaches a GM tab before `ready` is lost |
| DB-AC-3 | ledger.mjs:71 | low | RECORD | The relay handler never checks the sender |
| DB-AC-4 | corpses.mjs:130 | low | RECORD | sync makes one Item Piles call per token and toggles Dead once per token |
| perf-1 | corpses.mjs:336 | medium | RECORD | refreshToken runs uncached Item Piles pile queries on every corpse |
| perf-2 | loot.mjs:155 | low | RECORD | Any world change schedules a Loot-all repaint while a button is tracked |
| perf-3 | settings.mjs:97 | low | RECORD | Every ledger batch rewrites a log setting that grows without bound |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| be576a2b | M1: `writeLedger` is module-private; the entry header lists `appendLedger, clearLog` | Existing suite and conformance, unchanged |
| 5dcc8781 | M7: restoreResult JSDoc lists `not-created` | `test/llm-reads.test.mjs` already covers not-created |
| b0fb4bb0 | M9: corpses header says every tab of the active GM user converts | Comment only; hooks/describe goldens byte-identical |
| 8b833b14 | M10: the entry lifecycle comment names the init listener and the ready handlers in order | Comment only; checked against `golden/hooks.json` |
| e71a6c8a | M2: `isActiveGMSelf` in dropbin-core, shared by corpses and itempiles | `test/core-barrel.test.mjs`: "isActiveGMSelf: true only on the active GM user's client" |
| cbdea232 | M4: one `isLegacyEye` predicate in corpses.mjs | eye-migration-guard and eye suites |
| 452e622f | M3: `isOurCorpse` / `hasNoLoot` in dropbin-core, used by corpses and inspect | `test/core-barrel.test.mjs`: "isOurCorpse / hasNoLoot tables" |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| c9697a5b (R1) | e2a8f68b | Changes `list(n)` answers for many inputs that no promise covers (null, NaN, -1, 0.4, "", strings). The bridge can send `n:0` / `n:null`, which now silently return `[]`. It also diverges from the legacy oracle |
| 20299151 (M5) | ffe68315 | The shared live golden `scripts/foundry/live-goldens/dropbin.js:114-115` pins `isDead(null)` as `"undefined"`, so the INT before/after diff would go red |
| 6ed39785 (R2) | aa60ade6 | The `typeof opts === "object"` guard also changes the answer for a non-null input (a function carrying a truthy `brief`). A re-land should use `!!opts?.brief`. The revert was made by hand in the sign-off step, because 5dcc8781 edits the adjacent JSDoc |

## Recorded for Joe

- **defect** DB-AC-1 `ledger.mjs:109`: the drop capture runs on every client, so multi-item drops are recorded once per extra client, with that client's user and scene. Capture on the active GM only and take the scene from the pile token, or dedupe over a window.
- **defect** DB-AC-2 `ledger.mjs:223`: the record relay is registered at socketlib.ready, so an entry relayed to a GM tab before `ready` hits settings.set and is lost. Await ready in recordAsGM, or register the relay at ready.
- **defect** EC-4 `corpses.mjs:296`: HUD Revive runs its own sync while the 150 ms debounced sync also runs, and the second ForcedDeletion can erase the restored ownership map. Cancel the pending timer in revive, and/or add a per-token in-flight map.
- **defect** EC-3 `corpses.mjs:78`: a linked NPC becomes a pile with the eye, but players never get OBSERVER, because delta.ownership is ignored for linked tokens. Make linked NPCs ineligible or adopt a base-actor rule, and document it in the README meanwhile.
- **defect** R3 `ledger-core.mjs:111`: restore/restoreResult with an explicit target that does not resolve (a typo, a UUID or a TokenDocument) restores onto the original actor with ok:true. Return no-actor, and accept a UUID or a TokenDocument.
- **defect** R9 `itempiles.mjs:121`: the 'Locked' float targets the first token with a matching actor id, so it can land on another unlinked chest. Prefer `actor.token?.object`, or pass the hook's token through.
- EC-2 `ledger-core.mjs:24`: the tail dedupe drops a real second loss of a distinct same-named item within 2 s. Consider adding `item._id` to dedupeKey (this changes stored data, and the rule is pinned).
- R4 `ledger.mjs:160`: restore the item onto `fromUuidSync(entry.fromActorUuid)` first, so an item dropped from an unlinked token returns to the synthetic actor.
- R5 `ledger.mjs:163`: guard a null `entry.item` and catch a throwing create, returning `{ok:false, reason:'not-created'}`.
- R6 `corpses.mjs:69`: give toCorpse/fromCorpse/sync an Item Piles check and a documentName guard, so they no longer throw raw TypeErrors or half-apply.
- R7 `corpses.mjs:321`: `revive(tokenDoc).then(close, prefixed warn)`, so a Revive rejection is not left unhandled.
- R8 `corpses.mjs:193`: remember a failed eye-texture load until canvasReady instead of retrying it on every paint.
- R10 `settings.mjs:67`: add a shape check in recordAsGM, or a per-item catch in drain, so one bad entry cannot reject the whole batch.
- DB-AC-3 `ledger.mjs:71`: stamp the user from `socketdata.userId` and check that the sender owns fromActor (today any player can append forged entries).
- DB-AC-4 `corpses.mjs:130`: batch tokens per Item Piles call and dedupe actors before toggling Dead.
- EC-5 `corpses.mjs:38`: use getDependentTokens() or a canvasReady sync, so linked tokens on other scenes convert.
- EC-6 `corpses.mjs:63`: when it is our corpse and the default is not OBSERVER, re-write delta.ownership instead of returning early.
- EC-9 `api.mjs:59`: document "by name, a token wins; use the actor id/uuid", or decide on a fallback to the actor.
- EXT-2 `api-manifest.mjs:38`: add the missing revive/fromCorpse/sync sideEffects and `flags.core.overlay`, then regenerate describe.json.
- EXT-5 `loot.mjs:44`: use `actorClassType()` for Loot all's fallback recipient.
- EXT-6 `api-manifest.mjs:29`: factor CORPSE_FLAGS/TO_CORPSE_WRITES constants together with EXT-2.
- EXT-8 `corpses.mjs:34`: add a README Pitfalls line about the eye texture's world-data path, or ship the asset.
- M8 `api-manifest.mjs:98`: add the optional `opts {sceneId}` param row to inspect and regenerate describe.json.
- M13 `api-manifest.mjs:18`: rename `corpseRow` to `legacyRow` the next time the manifest is edited.
- M6 `itempiles.mjs:219` (cap): extract `refuseIfLocked(target)` and register it twice with the same names and order.
- M11 `loot.mjs:59` (cap): build the probe as `button:not(.${BTN}) i.fa-fist-raised`, or fold it into EXT-3.
- M12 `ledger.mjs:218` (cap): add `socketlibPresent()` to socketlib-adapter.mjs.
- EXT-3 `loot.mjs:59` (cap): move the Item Piles DOM selectors into a frozen table in piles.mjs.
- EXT-7 `i18n-shim.mjs:37` (cap): add a key-set equality test for LEGACY_KEYS and LITERAL.
- perf-1 `corpses.mjs:336`: memoise wantsEye per Token, or skip it on visibility-only refresh flags.
- perf-2 `loot.mjs:155`: informational; any relevance filter changes repaint timing.
- perf-3 `settings.mjs:97`: informational; the log setting grows without bound, and a cap or split store changes stored data.
- Reverted R1 `ledger-core.mjs` listLast: if wanted, re-land as `n === 0` → `[]` only, and pin the oracle divergence as KNOWN.
- Reverted M5 `corpses.mjs:49`: either leave `isDead(null)` as undefined, or update `live-goldens/dropbin.js` and declare the change.
- Reverted R2 `ledger.mjs:144`: re-land as `const brief = !!opts?.brief;`, which changes only the null case.

## Verification

- be576a2b: keep
- 5dcc8781: keep
- b0fb4bb0: keep
- 8b833b14: keep
- e71a6c8a: keep
- cbdea232: keep
- 452e622f: keep
- c9697a5b: revert (e2a8f68b)
- 20299151: revert (ffe68315)
- 6ed39785: revert (aa60ade6)

## Gates

- `make foundry-dropbin-check` (`python3 -m scripts.foundry.ops module-check dropbin`): exit 0. 122 tests pass and 0 fail, 40 legacy checks pass, the vendored kit matches foundry/lib (9 files), and conformance is 100.0 % (50/50 fail-class rules).
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
- `make check-context`: passes with this record in place.
