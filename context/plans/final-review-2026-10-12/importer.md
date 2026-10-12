---
title: "Final review 2026-10-12 — importer"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of importer found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — importer

## Verdict

**NEEDS-JOE.** The ten kept changes are behaviour-preserving and the gate is green, but real defects are recorded. The worst: a malformed entry after the first one aborts only after earlier actors were written, which breaks the documented "nothing was written" promise.

## Scope

- Paths: `foundry/module/pentaryn-importer/**` (module `pentaryn-importer`) and this record.
- Base: `45488047c`, which was origin/main when the review started.
- Branch: `review/importer`, worktree `pentaryn-review-importer-wt`.
- Triage: 36 findings. 10 DO (1 DO-EDGE, 9 DO-REFACTOR), 13 RECORD, 13 DROP (11 duplicates or no-action notes, 2 not worth a commit).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| AC-1 | documents-adapter.mjs:87 | medium | DO-EDGE, kept | The fetch timeout was cleared once headers arrived, so a body that stalled hung forever and every later call got CONFLICT. The timeout now covers the body read too and ends in the pinned TIMEOUT |
| M2 | README.md:24 | low | DO-REFACTOR, kept | README now says which refusals show a toast and which throw a silent PentarynAbort |
| R7 | README.md:26 | low | DO-REFACTOR, kept | README now says a player who calls `import()` gets the NOT_GM toast, matching golden refusals.json |
| M5 | importer-core.mjs | low | DO-REFACTOR, kept | Fixed a stale comment pointer to `assertActivityIdsSurvived()` and removed a stray divider |
| ext-5 | api.mjs:41, README.md | low | DO-REFACTOR, kept | ImportResult manifest doc now lists all five returned fields |
| ext-6 | README.md | low | DO-REFACTOR, kept | README now says where the dnd5e gate markers live and how to move the target minor version |
| ext-1 | documents-adapter.mjs, api.mjs | low | DO-REFACTOR, kept | Added `actionOf`/`itemByAction` helpers; the item-identity readback loop moved into `assertItemsAddressable` |
| ext-3 | documents-adapter.mjs:400 | low | DO-REFACTOR, kept | The handled item-spec keys are now one constant, `HANDLED_ITEM_SPEC_KEYS` |
| M7 | importer-core.mjs | low | DO-REFACTOR, kept | `toUpdatePayload` now calls `toCreatePayload` instead of repeating its body |
| M6 | documents-adapter.mjs | low | DO-REFACTOR, kept | Removed the unused exports `moduleExpectations`, `assertValue` and `isManagedItem` |
| R1 (+EC1) | api.mjs:137 | high | RECORD | A malformed entry at position >0 aborts after earlier entries were already written and hash-stamped |
| R3 (+EC3) | api.mjs:122 | medium | RECORD | Only `unmanagedItems` is shape-checked. `only:'x'` builds a set of characters, `import(null)` throws a TypeError, and `timeout:null` aborts at once |
| AC-2 | api.mjs:85 | medium | RECORD | The re-entrancy guard only works within one tab. Two GM tabs importing at once can create duplicate Actors |
| M3 (+ext-2) | api.mjs:287 | low | RECORD | selftest is documented as checking the gate flags, but it checks only `contract` |
| M4 | importer-core.mjs:366 | low | RECORD | The gate refusal names pentaryn-importer.mjs, but CONTRACT_ID now lives in importer-core.mjs |
| R4 | importer-core.mjs:445 | low | RECORD | A non-object entry fails with an uncoded TypeError instead of PentarynAbort REFUSED |
| R5 | documents-adapter.mjs:276 | low | RECORD | If `system.activities` is missing, the readback throws a TypeError that goes to failed[] instead of an assertion |
| R6 (+EC6) | api.mjs:174 | low | RECORD | A slug goes into created/updated before the item writes, so a later failure counts the actor twice |
| EC4 | documents-adapter.mjs:304 | low | RECORD | The comment says duplicate action names are caught, but `find()` matches both rows to one item, so nothing fails |
| EC5 | api.mjs:164 | low | RECORD | With a duplicate slug, the dry run's created/updated split differs from what the real run reports |
| ext-4 | api.mjs:210 | low | RECORD | The per-actor catch names the two concrete error classes instead of the PentarynError base |
| R8 | documents-adapter.mjs:569 | low | RECORD | reportSummary's console.group/table goes around the kit logger, so `trace()` does not show it |
| M8 | api.mjs:99 | low | RECORD (cap) | `importOnce` is about 200 lines; parts of it could be extracted |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 7725f9aa | AC-1: in `fetchJsonWithTimeout`, one outer try/finally now covers the fetch, the ok check and the body read. An AbortError during `response.text()` becomes the existing TIMEOUT message | `test/glue.test.mjs`: "a body that stalls after the headers still times out (TIMEOUT) and releases the guard" (failed before the fix) |
| 49e79eae | M2: README lists which refusals toast and which throw silently (doc only) | `test/glue.test.mjs`: "fetch failures are PentarynAbort without a toast: HTTP 404, HTML body, network error" |
| b3295524 | R7: README says NOT_GM shows a permanent error toast (doc only) | `test/glue.test.mjs`: "non-GM → PentarynAbort with the guide's text, one toast, no fetch" |
| 19bc8016 | M5: comment pointer fixed and stray divider removed (comment only) | full suite, 95/95 |
| 0daeaed2 | ext-5: ImportResult JSDoc and README name all five manifest fields (doc only) | full suite; goldens byte-identical |
| 86ff5141 | ext-6: README "Patches and adjustments" section, plus "Extending" step 5 (doc only) | full suite; goldens byte-identical |
| f677c998 | ext-1: `actionOf`/`itemByAction` helpers; `assertItemsAddressable` moved to the adapter; same messages and same order | `test/write.test.mjs`: "assertion sites: messages and write sequences (golden/write-sites.json)"; sites.test counts (7 failAssertion, 3 refuse) still hold |
| 22c5c3e9 | ext-3: `HANDLED_ITEM_SPEC_KEYS` frozen Set | golden/write-console.json, write-full.json |
| 32f562a8 | M7: `toUpdatePayload` builds on `toCreatePayload` | `test/core.test.mjs`: "core: toUpdatePayload / toCreatePayload"; write-full / write-delete-force goldens |
| 57dde0db | M6: three unused exports removed from documents-adapter.mjs | full suite 95/95; conformance unchanged (100 %, warns C10/C36/C59) |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** `api.mjs:137` (R1): a malformed entry (no slug, or null) at position >0 throws only after earlier entries were created or updated and hash-stamped. That breaks "nothing was written" in api-manifest.mjs:42 and README:71/78. Option A: before the write loop, run a pre-pass that calls `preparePayload` on every entry, with the same shout and rethrow. Option B: soften the README. Test: `run([npc('a'), {name:'Nameless'}])` should write nothing.
- **defect** `api.mjs:122` (R3): add unshouted PentarynAbort BAD_ARGS checks for `only` (null or string[]), `timeout` (a positive finite number) and `path` (a non-empty string), and treat `options === null` as `{}`. The manifest already promises BAD_ARGS. Today `only:'skeleton'` selects 0 actors and still toasts "Import done".
- **defect** `api.mjs:85` (AC-2): the `running` guard works only within one tab. If the MCP bridge and a browser tab import a new slug at the same time, both create the Actor, and one copy is orphaned for good. Fix with a deterministic slug-derived `_id` plus keepId, or a claim that works across tabs. At minimum, add a README:133 line naming the risk.
- **defect** `api.mjs:287` (M3): selftest checks only `contract`, so a module.json missing targetSystem, targetSystemVersion or generation passes selftest while every import is refused. Either export `GATE_KEYS` from importer-core and check all of them, or narrow the row doc in a contract-bumping release (describe.json is golden).
- **defect** `api.mjs:174` (R6): push the slug to created/updated only after `stampContentHash`, or remove it in the catch. Today one actor can be reported as "1 updated · 1 failed".
- **defect** `api.mjs:164` (EC5): in a dry run, put a placeholder carrying the incoming hash into bySlug, so a duplicate-slug file gives the same created/updated split as the real run. README:78 tells readers to trust the dry-run split.
- `documents-adapter.mjs:87` (AC-1, recorded half): a body-read error other than AbortError is still rethrown raw. Mapping it to REFUSED would change a failure path.
- `importer-core.mjs:366` (M4): in a declared step, change the gate text to "module.json and importer-core.mjs are out of step" and regenerate golden/refusals.json gateModuleJson.
- `importer-core.mjs:445` (R4): refuse a non-plain-object entry with PentarynAbort REFUSED before the lint. This changes golden refusals.json nullEntry.
- `documents-adapter.mjs:276` (R5): use `item.system.activities?.map(...) ?? []` and guard `.get` at :411/:419, so a missing collection is reported through failAssertion. Live-check which dnd5e item types lack activities first.
- `documents-adapter.mjs:304` (EC4): either detect duplicate payload action names (a new failAssertion site, which changes the sites.test count) or reword the comment so it no longer claims to catch them.
- `api.mjs:210` (ext-4, preference): `if (cause instanceof PentarynError) throw cause;` behaves the same for every throw reachable today. Leave it if the explicit list is preferred.
- `documents-adapter.mjs:569` (R8): add a `log.warn` per failed slug so `trace()` carries the failure table. This changes the console goldens.
- `documents-adapter.mjs` export block (M6 follow-up): `failAssertion` and `assertActivityIdsSurvived` are also exported but nothing imports them, so they are a possible further trim.
- `README.md:24` (M2 follow-up): when any actor fails, the end-of-run toast is a permanent warning, not the info toast with counts, and the README does not say so.
- `api.mjs:99` (M8, deferred by cap): extract `deleteJsonFor()` and `manifestDigest()` from `importOnce`, keeping the reportSummary → log.warn → toast order and the manifest key order.

## Verification

- 7725f9aa: keep
- 49e79eae: keep
- b3295524: keep
- 19bc8016: keep
- 0daeaed2: keep
- 86ff5141: keep
- f677c998: keep
- 22c5c3e9: keep
- 32f562a8: keep
- 57dde0db: keep

## Gates

- Gate (module tests, kit vendoring check, conformance, scope, goldens diff, clean tree). Tests: 95 run, 95 pass, 0 fail. The vendored kit is identical to foundry/lib (9 files). pentaryn-importer conformance is 100.0 % (44/44 fail-class rules; warns C10/C36/C59). Every changed path is in scope. `git status --short` was empty.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
- `make check-context` passes with this record in place.
