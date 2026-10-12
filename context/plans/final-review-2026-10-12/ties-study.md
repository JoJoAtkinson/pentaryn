---
title: "Final review 2026-10-12 — ties-study"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of ties-study found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — ties-study

## Verdict

**NEEDS-JOE**: nine behaviour-preserving commits were kept and the gate is green, but several recorded items are real defects. They include the 'Tier null' hold prompt, the claim rows that pending() and Deliver treat as reveals, the held-cascade claim, and the tempo-bubble leak. Fixing any of them changes behaviour, so each one needs Joe's call.

## Scope

- Paths: `foundry/module/pentaryn-ties/study.mjs`, `foundry/module/pentaryn-ties/study/**`, plus new or edited tests under `foundry/module/pentaryn-ties/test/`.
- Base: `bb93da9f` (origin/main). Branch: `review/ties-study`.
- Triage: 52 findings. 10 were DO (1 DO-EDGE: rob-6; 9 DO-REFACTOR: M1, rob-2, M2, M4, M3, M9, M11, perf-2, perf-1), 29 RECORD (7 of them deferred at the cap) and 13 DROP (12 duplicates plus EXT-4).

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| M1 | study/cascade.mjs, authoring.mjs, share.mjs (imports) | low | DO-REFACTOR, kept | Four unused imports dropped, which closes two import cycles |
| rob-2 | study/cascade.mjs (concealmentFor) | low | DO-REFACTOR, kept | concealmentFor now reads the flag through readFlag instead of using try/catch |
| M2 | study/resolve.mjs (concealmentFor) | low | DO-REFACTOR, kept | concealmentFor moved to resolve.mjs, so gate.mjs and authoring.mjs no longer import cascade.mjs |
| M4 | study/resolve.mjs:184, claim.mjs, apply.mjs, shared.mjs, study.mjs | low | DO-REFACTOR, kept | Stale comments now point at the code that actually does the work (folds in EXT-3 step 1) |
| M3 | study/apply.mjs, cascade.mjs, claim.mjs | low | DO-REFACTOR, kept | JSDoc blocks moved above the functions they document |
| M9 | study/shared.mjs, apply.mjs, request.mjs | low | DO-REFACTOR, kept | One shared clampSituational replaces two inline copies |
| M11 | study/gate.mjs, share.mjs | low | DO-REFACTOR, reverted | missedAndLie unifies the kind rung-0 lie rule, but no test pins that rule |
| perf-2 | study/authoring.mjs (beliefs) | low | DO-REFACTOR, kept | beliefs() resolves the kind pointer once instead of once per row |
| perf-1 | study/resolve.mjs (studyStateFor) | low | DO-REFACTOR, kept | studyStateFor skips the item walk when the biography or tiers already decide |
| rob-6 | study/share.mjs:168 | medium | DO-EDGE, kept | shareFact with a character-id string `from` lost the teller and did not mark the share as told |
| M5 | study/tempo.mjs:18 | low | RECORD | The tempo doc says the last rung is the tenth gesture, but SCOPE_STEPS stops at 6 |
| M6 | study/tempo.mjs:98 | low | RECORD (cap) | SCOPE_STEPS stores each i18n key twice |
| M7 | study/resolve.mjs:96 | low | RECORD (cap) | The kind branch reads the offset flag three times |
| M8 | study/resolve.mjs:154 | low | RECORD (cap) | Duplicate grade closures, and the skill-label lookup is pasted six times |
| M10 | study/cascade.mjs:591 | low | RECORD (cap) | The drop-row/unset-flag code appears twice |
| M12 | study/share.mjs:163 | low | RECORD | shareFact and runCascade are each about 140 lines doing several jobs |
| M13 | study/gate.mjs:159 | low | RECORD | Three checks disagree on whether a DC-less identification row was missed |
| EXT-1 | study/gate.mjs:55 | medium | RECORD | The hold prompt prints 'Tier null' for attr facts and 'total of null' for an auto kind |
| EXT-2 | api-manifest.mjs:147 | medium | RECORD | The study.* manifest rows misstate return values and understate side effects |
| EXT-3 | study/resolve.mjs:59 | medium | RECORD | The 'one branch in resolveFact' extension recipe is false (README.md:146) |
| EXT-5 | study/apply.mjs:294 | low | RECORD (cap) | The attr ledger key is built inline at four sites |
| EXT-8 | study/request.mjs:130 | low | RECORD (cap) | The offered-row mapper is copied |
| EXT-9 | study/cascade.mjs:403 | low | RECORD | The effective identification DC is computed at five sites under three policies |
| EXT-10 | study/share.mjs:353 | low | RECORD (cap) | The spec-to-positional and beliefKey mappings are repeated |
| EXT-12 | study/claim.mjs:129 | low | RECORD | Two session-token idioms in one claim protocol |
| rob-1 | study/cascade.mjs:471 | medium | RECORD | deliverHeldIdentifications(null, …) throws instead of returning false |
| rob-5 | study/cascade.mjs:160 | low | RECORD | applyInspect never checks that the inspector is a character |
| ES-1 | study/gate.mjs:147 | medium | RECORD | pending() lists a bare kind or lore claim row as an undelivered reveal |
| ES-2 | study/gate.mjs:77 | medium | RECORD | Deliver on a claim row spends the roll and hands nothing over |
| ES-4 | study/tempo.mjs:168 | low | RECORD | The tempo bubble renders over a token the viewer cannot see |
| ES-5 | study/cascade.mjs:133 | low | RECORD | combatAllows only consults the combat being viewed |
| ES-6 | study/claim.mjs:117 | low | RECORD | Flag deletions use the `-=key` syntax, which is deprecated in v14 |
| ES-7 | study/gate.mjs:235 | low | RECORD | putBelief(null) leaves `beliefs: {}` behind after removing the last row |
| AC-1 | study/cascade.mjs:342 | medium | RECORD | A held cascade keeps its #inspect claim staked while the GM dialog is open |
| AC-2 | study/apply.mjs:325 | medium | RECORD | The whole attr-beliefs setting is rewritten from each tab's local copy |
| AC-3 | study/cascade.mjs:303 | low | RECORD | Grant-only cascade rungs write without taking a claim |
| AC-4 | study/claim.mjs:91 | low | RECORD | A late claim stake overwrites a completed record and the fact is rolled again |
| AC-5 | study/share.mjs:252 | low | RECORD | One awaited write per recipient where a batch write would do (§5.9.4) |
| perf-4 | study/share.mjs:293 | low | RECORD | A kind Share composes the same payload once per recipient |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| dda4c577 | M1: drop four unused study imports, closing two import cycles | full suite; goldens byte-identical |
| 75e987ea | rob-6: shareFact accepts a character-id string `from` | `test/study-share-from.test.mjs`, "shareFact: a character-id string `from` marks the share as told" |
| c231a475 | rob-2: concealmentFor reads the flag through readFlag | `test/study-hardening.test.mjs`, "concealmentFor: never throws, reads the conceal flag" |
| 788d7982 | M2: concealmentFor moves to study/resolve.mjs | `test/study-hardening.test.mjs` (same test, now imports from resolve.mjs) |
| b20ecf7c | M4 (with EXT-3 step 1): comments point at the code that does the work | comment-only; full suite; goldens byte-identical |
| 766aa459 | M3: JSDoc blocks moved above their functions | comment-only; full suite; goldens byte-identical |
| 6b0327f5 | M9: one clampSituational | study-conduit situational cases (3, -500, 999, '7.6'); full suite |
| 8abca3f9 | perf-2: beliefs() resolves the kind pointer once | `test/perf-scans.test.mjs`, "perf-2: beliefs() resolves the kind pointer once, however many kind rows the ledger holds" |
| 9c18b4c6 | perf-1: studyStateFor walks items only when needed | `test/perf-scans.test.mjs`, "perf-1: studyStateFor skips the item walk when the biography decides" |

## Changes reverted by verification

| commit | verifier's reason |
|---|---|
| f1d5b6ed (reverted by e2a81ea6) | M11 missedAndLie. A 107-row differential harness found behaviour identical, but the committed suite does not pin the kind rung-0 lie rule: forcing `lie: false` left all 253 tests green. DO-REFACTOR requires proof from existing tests, so the commit was reverted. |

## Recorded for Joe

- **defect** EXT-1, `study/gate.mjs:55`: the hold prompt picks its meta line with `ns === 'lore'`, so attr facts print 'Tier null on a total of 15' and a held auto kind prints 'total of null'. Fix with `fact.ns === "kind" ? holdMeta : holdMetaLore`, render a null total as '—', and regenerate study-attr.json.
- **defect** EXT-2, `api-manifest.mjs:147`: the study.* manifest rows misstate return values (tiers/difficulty, attrOffers, beliefs, factStatus/whoKnows) and understate side effects. Correct the rows and regenerate the describe golden.
- **defect** ES-1, `study/gate.mjs:147`: pending() lists a bare kind or lore claim row as an undelivered reveal. Skip raw claim rows, or surface a stranded claim as 'reset me'.
- **defect** ES-2, `study/gate.mjs:77`: Deliver on a stranded or in-flight claim row spends the roll and hands nothing over. Refuse claim rows (noPending), or have the UI offer Reset instead.
- **defect** AC-1, `study/cascade.mjs:342`: a held cascade keeps its #inspect claim while the GM dialog is open, which contradicts the comment at cascade.mjs:184-185. Release the claim in finally, then prompt.
- **defect** AC-2, `study/apply.mjs:325`: two GM tabs on one account can revert each other's finished attr rows. Move to merge semantics or a single writer, then correct the comment at 314-321.
- **defect** AC-4, `study/claim.mjs:91`: a late claim stake overwrites a completed record and the fact is rolled a second time. readBack should refuse a row that already carries a completed record.
- **defect** rob-1, `study/cascade.mjs:471`: deliverHeldIdentifications(null, subject) throws a TypeError instead of returning false. Add `!character || !subject` to the guard.
- **defect** rob-5, `study/cascade.mjs:160`: applyInspect accepts a non-character inspector. Add applyStudy's `character.type !== "character"` refusal.
- **defect** ES-4, `study/tempo.mjs:168`: the tempo bubble shows over a token the viewer cannot see, which reveals another PC's position on screen. Return early when `!token.isVisible`.
- M13 / EXT-9, `study/gate.mjs:159` and `study/cascade.mjs:403`: decide what a DC-less identification row means, then add one identRowMissed/identDcOf helper for gate.mjs:161, authoring.mjs:145 and cascade.mjs:403.
- M5, `study/tempo.mjs:18`: should the last tempo rung be 6 (the code) or 10 (the doc)? Note the answer under :43, or change the threshold.
- EXT-3, `README.md:146`: the 'one branch in resolveFact' recipe is false. Fix the README and consider a module-private namespace table (step 2).
- EXT-12, `study/claim.mjs:129`: the blueprint's claim-protocol section should name one session-token idiom (lazy, user-prefixed).
- ES-5, `study/cascade.mjs:133`: combatAllows only sees game.combat. To make it airtight, search every started combat.
- ES-6, `study/claim.mjs:117`: switch `-=key` deletions to `_del` during the kit-migration pass, and re-pin the goldens.
- ES-7, `study/gate.mjs:235`: putBelief(null) leaves `beliefs: {}` behind. Unset the whole flag on the last row (together with M10).
- AC-3, `study/cascade.mjs:303`: grant-only cascade rungs write without a claim, so every GM tab performs them. Take the claim before any write.
- AC-5, `study/share.mjs:252`: batch the per-recipient and per-attribute writes in shareFact and resetInspection (§5.9.4).
- perf-4, `study/share.mjs:293`: compose the kind payload once per Share instead of once per recipient. This needs a decision on per-recipient inline rolls.
- M12, `study/share.mjs:163`: split shareFact and runCascade in a dedicated pass, together with AC-1.
- M11 (reverted f1d5b6ed), `study/gate.mjs` / `study/share.mjs`: re-land missedAndLie after adding a test that pins the kind rung-0 lie on both deliver and forget.
- Deferred at the cap (pure refactors for later): M6 `study/tempo.mjs:98`, M7 `study/resolve.mjs:96`, M8 `study/resolve.mjs:154`, M10 `study/cascade.mjs:591`, EXT-5 `study/apply.mjs:294`, EXT-8 `study/request.mjs:130`, EXT-10 `study/share.mjs:353`.

## Verification

- dda4c577: keep
- 75e987ea: keep
- c231a475: keep
- 788d7982: keep
- b20ecf7c: keep
- 766aa459: keep
- 6b0327f5: keep
- f1d5b6ed: revert (e2a81ea6)
- 8abca3f9: keep
- 9c18b4c6: keep

## Gates

- `make foundry-ties-check`: 255 tests passed, 0 failed. Known-core: 183 passed. Look+known tab: 9 passed. Vendored kit identical (11 files). Conformance 96.1% (49/51), with only the accepted exceptions C05 and C37 and no new rows.
- `make check-context`: passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
