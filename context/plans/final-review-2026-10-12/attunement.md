---
title: "Final review 2026-10-12 — attunement"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of attunement found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — attunement

## Verdict

**NEEDS-JOE.** The kept changes are behaviour-preserving and the gate is green, but real defects are still recorded: the two-purse coin loss (the fix was reverted), the cross-tab and overlapping-stash races, unlinked-token bond keys, and cap warnings that are missing or false.

## Scope

- Paths: `foundry/module/pentaryn-attunement/**` (module `pentaryn-attunement`) and this record.
- Base: `94ce018a` (origin/main when the review started).
- Branch: `review/attunement`, worktree `pentaryn-review-attunement-wt`.
- Triage: 41 findings, giving 10 DO (4 DO-EDGE, 6 DO-REFACTOR), 17 RECORD (5 of them deferred by the cap) and 14 DROP (duplicates).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| ATT-AC-1 | bonds.mjs:121 | high | DO-EDGE, kept | Two bonded items coming home in one batch lost an away entry; hand-backs are now serialised per actor |
| ATT-AC-2 | bonds.mjs:85 | medium | DO-EDGE, reverted | Two coin purses in one batch pay only one; the fix shared the hand-back chain and changed write timing |
| EC-8 | strip.mjs:105 | low | DO-EDGE, kept | The away slot aria-label read "undefined — … D&#x27;Arcy"; it is now plain text |
| EC-7 | sheet.mjs:119, 135 | low | DO-EDGE, kept | An away entry with an empty key could not be released by ✕ or right-click |
| M3 | README.md (Data written, slots row) | low | DO-REFACTOR, kept | README slots shape now matches trim-on-drop and padded stash writes |
| M12 | README.md (Tests) | low | DO-REFACTOR, kept | README test list names core-meta, docs and i18n |
| M1 | actor-adapter.mjs (stash) | low | DO-REFACTOR, reverted | Computing `created` once moved it ahead of the shortfall check and changed a failure path |
| M2 | attunement-core.mjs, api.mjs:95 | low | DO-REFACTOR, kept | One frozen PROFICIENCY_CATEGORIES list for the patch and the selftest |
| M9 | attunement-core.mjs (homeSlots) | low | DO-REFACTOR, kept | homeSlots trims through trimSlots |
| M8 | attunement-core.mjs:78 | low | DO-REFACTOR, kept | One shortName rule for the stash tag and the away tooltip |
| M4 | actor-adapter.mjs:2 | low | RECORD | Header and README:132 claim all document writes live in the adapter |
| M6 | strip.mjs:105 | low | RECORD | Unused `index` parameter, dead default, four needless exports |
| M7 | strip.mjs:77 | low | RECORD | ✕ button construction duplicated for filled and away slots |
| M10 (+EXT-4) | actor-adapter.mjs:134 | low | RECORD | dnd5e tooltip prototype lookup and `pentarynGuarded` marker written out twice |
| EXT-3 | bonds.mjs:60 | low | RECORD | Flag paths built by hand beside `flagPath`; `coinBack` is a bare literal |
| M11 (+EXT-7) | bonds.mjs:62 | low | RECORD | `options['pentaryn-attunement'] = { bond }` is read by nothing and undocumented |
| EXT-6 | api-manifest.mjs:98 | medium | RECORD | describe() flags.writes and README omit `claims.coinBack` |
| EXT-8 | api.mjs:95 | low | RECORD | Selftest hook check is a count (>= 4), not names |
| ATT-ROB-2 | bonds.mjs:95 | low | RECORD | Bonds keyed on actor.id restore onto a sibling unlinked token or the base actor |
| ATT-ROB-6 | api.mjs:58 | low | RECORD | Legacy computeSlots/away accept any object; uncoded TypeError vs [] |
| EC-3 | sheet.mjs:35 | medium | RECORD | One-for-one swap at the cap shows a false WouldExceed warning |
| EC-4 | bonds.mjs:121 | medium | RECORD | A batch of attunes passes the cap with no warning |
| EC-5 | attunement-core.mjs:124 | medium | RECORD | planStash merges a later unattuned copy into the bonded attuned copy |
| EC-6 | api.mjs:23 | low | RECORD | report('Misspelt Name') falls through to the controlled token's actor |
| EC-10 | bonds.mjs:121 | low | RECORD | Non-finite attunement.max: strip uses 3, warning says "undefined" |
| ATT-AC-3 | sheet.mjs:39 | low | RECORD | attuneToSlot and stash write whole-array flags across an await; overlapping calls clobber |
| perf-1 | sheet.mjs:43 | low | RECORD | A slot drop is two writes and two re-renders, the first drawing the item in the wrong hole |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| c4907b33 | ATT-AC-1: per-actor `serial()` chain (`tails` Map) for bond hand-backs; uncontended step runs synchronously; `uninstall()` clears it | `test/home-race.test.mjs`: "two bonded items home in one batch: both away entries consumed, each in its own slot" (failed before the fix) |
| cc27bd2a | M3: README slots row wording (docs only) | `test/docs.test.mjs` (existing guards) |
| c5585f97 | EC-8: aria-label built from unescaped AwayBody, name falls back to "" | `test/strip.test.mjs`: "away slot aria-label is plain text: no undefined, no entities" (failed before the fix) |
| a0a968ee | M2: `PROFICIENCY_CATEGORIES` export used by patchProficiencyMap and the selftest | `test/core-meta.test.mjs`: "patchProficiencyMap({}) adds PROFICIENCY_CATEGORIES in order" |
| 895b9591 | M9: homeSlots returns `trimSlots(...)` | existing homeSlots legacy-oracle, slots coming-home and glue tests |
| 8713efb0 | M8: `shortName` in core, used by planStash and buildAwaySlot | `test/core-meta.test.mjs`: "shortName takes the first word before a space or comma" |
| 36c8ccb4 | M12: README Tests prose (docs only) | `test/docs.test.mjs`: "README states no fixture count; README does not claim the proficiency patch uses ??=" |
| d3aa24fd | EC-7: `awayKey !== undefined` in the click and contextmenu handlers | `test/listeners.test.mjs`: "an away entry with an empty key can still be released (✕ and right-click)" (failed before the fix) |

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 61260fa9 | efdecb32 | Behaviour change. The purse payout joined the same per-actor chain as bond hand-backs, so a purse and a hand-back (disjoint fields, never broken) now wait on each other: 2 actor writes in flight became 1. The test was honest (13 !== 18 on the parent). A separate purse chain (`actor.uuid + ":coin"`) would be the smaller fix. |
| 535780c9 | b60accac | Behaviour change on a failure path. Computing `created` before the shortfall check means a malformed createEmbeddedDocuments result now throws with zero writes (was delete + update, then throw) and skips the shortfall console.error. Unlikely in play, but a change to write count and a failure path. |

## Recorded for Joe

- **defect** ATT-AC-2 — bonds.mjs:85: two coin purses arriving in one batch pay only one (gp 13 instead of 18). Redo the reverted 61260fa9 with a purse-only chain keyed `actor.uuid + ":coin"` so hand-back timing is untouched; the home-race test from 61260fa9 is ready to reuse.
- **defect** ATT-AC-1 residual — bonds.mjs:121 and README.md:124: two tabs of the same user (MCP bridge tab plus a GM browser tab) each keep their own `tails` chain, so a two-item batch can still interleave actor writes. "Writes the same values from either tab" holds only per item; elect one tab or reword the README.
- ATT-AC-2 residual — bonds.mjs:85: on a take-all, Item Piles writes currency itself with an absolute value; no chain here can order against it. Decide whether to accept or claim the currency write.
- **defect** ATT-AC-3 — sheet.mjs:39 and actor-adapter.mjs (stash): attuneToSlot and stash build whole-array flag payloads before an await, so two overlapping stash calls on one owner leave one away entry instead of two. Extend the per-actor chain to these paths (changes drop timing) or document "never overlap stash on one owner".
- **defect** ATT-ROB-2 — bonds.mjs:95: bonds keyed on `actor.id`; unlinked tokens share the base id, so an item stashed from token A is restored and debonded on the base actor or token B. Key on uuid (accept the legacy id form) or skip the bond-clear when no away entry matches.
- **defect** EC-4 — bonds.mjs:121: a batch that attunes or creates several attuned items passes the cap with no warning, against README:16-17. Count pending attunes on the shared options object and add them to awayCount.
- **defect** EC-3 — sheet.mjs:35: dropping an unattuned item onto a filled slot at the cap is a swap but warns WouldExceed ("makes 4"). Pass a `swapFrom` option and subtract it in onPreUpdateItem.
- **defect** EC-5 — attunement-core.mjs:124: planStash registers attuned copies as merge targets, so a later same-named unattuned item is folded into the bonded copy. Only `merged.set` for non-attuned data; the legacy oracle test changes with it.
- **defect** EC-6 — api.mjs:23: `report('Misspelt Name')` or a non-Actor object returns the controlled token's report because `??` binds inside the else branch. Fall back only when target == null.
- **defect** EXT-6 — api-manifest.mjs:98: describe() flags.writes and the README Data written table omit `flags.pentaryn-attunement.claims.coinBack`, which bonds.mjs:85 writes. Add the manifest row and README row, regenerate golden/describe.json, add a source-scan test.
- EXT-8 — api.mjs:95: selftest checks `ids().length >= 4`; have features export hook names and check membership.
- ATT-ROB-6 — api.mjs:58: legacy computeSlots/away accept any object (TypeError vs []). Route through resolveRef or document "Actor documents only".
- EC-10 — bonds.mjs:121: non-finite `attunement.max` gives strip cap 3 but warns with "undefined". Align only if wanted (message change).
- M11 (+EXT-7) — bonds.mjs:62: retire the unread `options['pentaryn-attunement'] = { bond }` tag (glue.test:108 pins it) or document it as informal; drop restoreBond's unused `data` parameter.
- perf-1 — sheet.mjs:43: a slot drop writes items then the slot flag (two re-renders, first one draws the item in the first hole). Write the flag first or merge the writes; strip.test:195-199 pins today's order.
- M1 — actor-adapter.mjs (stash): the reverted 535780c9 dedup is safe only if the failure path for a malformed createEmbeddedDocuments result may change; Joe's call.
- M4 — actor-adapter.mjs:2 and README.md:132: reword to "shared writes and third-party reads" (sheet.mjs and bonds.mjs write too). Deferred by cap.
- M6 — strip.mjs:105: drop the unused `index`, the dead `awayByKey` default, and un-export applyTooltip/buildSlot/buildAwaySlot/awayIndex after a conformance import-graph check. Deferred by cap.
- M7 — strip.mjs:77: a private `removeButton(action, label)` keeping attribute order. Deferred by cap.
- M10 (+EXT-4) — actor-adapter.mjs:134: a private uncached `itemTooltipProto()` and a `GUARD_MARKER` constant. Deferred by cap.
- EXT-3 — bonds.mjs:60: `COIN_CLAIM` constant and `flagPath` at actor-adapter.mjs:92 and bonds.mjs:60. Deferred by cap.
- Docs nit — README.md Tests section does not list home-race.test, and bonds.mjs:171 uninstall comment is accurate again only because 61260fa9 was reverted.

## Verification

- c4907b33 (ATT-AC-1): keep
- 61260fa9 (ATT-AC-2): revert (efdecb32)
- cc27bd2a (M3): keep
- c5585f97 (EC-8): keep
- 535780c9 (M1): revert (b60accac)
- a0a968ee (M2): keep
- 895b9591 (M9): keep
- 8713efb0 (M8): keep
- 36c8ccb4 (M12): keep
- d3aa24fd (EC-7): keep

## Gates

- Gate: the module gate (`node test/run.mjs`, vendored-kit identity, blueprint conformance, scope and golden diff). Result: ok, 131 tests, 131 pass, 0 fail; kit identical to foundry/lib (11 files); conformance 97.9% with only the accepted C35 exception; all changed paths in scope; untouchables clean.
- `make check-context`: pass with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
