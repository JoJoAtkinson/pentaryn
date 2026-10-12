---
title: "Final review 2026-10-12 — ties-core"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of ties-core found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — ties-core

## Verdict

**NEEDS-JOE**: the kept changes are behaviour-preserving and the gate is green, but several
real defects (dead kind-row authoring, writes that reject despite a "nothing throws" contract,
`setNotes` reporting success on a refused write, untyped DC parsing) can only be fixed by a
behaviour change, which is Joe's call.

## Scope

- Module `pentaryn-ties` (area ties-core): `pentaryn-ties.mjs`, `ties-core.mjs`, `ties-api.mjs`,
  `api.mjs`, `api-manifest.mjs`, `ties-adapter.mjs`, `settings.mjs`, `relay.mjs`,
  `socket-adapter.mjs`, `conduit.mjs`, `core/**`, `attributes.mjs`, `facts.mjs`, `known-core.mjs`,
  `known-data.mjs`, `item-marks.mjs` (all under `foundry/module/pentaryn-ties/`), plus the module's
  `test/**`.
- Base `bb93da9f`, branch `review/ties-core`.
- Triage covered **42 of the 66 findings**. The computed list was cut off inside EC-2, so 24 findings
  were never triaged. Re-send them if they matter.

## Findings by lens

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| EC-1 | attributes.mjs:822 | medium | DO-EDGE (kept) | `attributes.of(null)` threw on a player client; READ_REF promises it never throws |
| R2 | api.mjs:192 | low | DO-EDGE (kept) | `inspect(ref, null)` threw destructuring `as` |
| R4 | attributes.mjs:653, :1124 | low | DO-EDGE (kept) | `selectAttributes` / `grantKnowledge` threw on null opts |
| R1 | core/attributes.mjs:380 | medium | DO-EDGE, reverted to RECORD | a `kind:` id is lowercased, so authored kind rows never match the actor |
| M2 | relay.mjs (header, applyMirror doc) | low | DO-REFACTOR (kept) | comments now state the canReach rule and seedReverse-only mirroring |
| M8 | core/study.mjs (readBeliefs, mayStudy) | low | DO-REFACTOR (kept) | an orphaned JSDoc was moved; a dead `studied[axis]` read was removed |
| M3 | core/attributes.mjs (subtreeOf doc) | low | DO-REFACTOR (kept) | the doc now names `seen` as the cycle guard and the depth cap as a backstop |
| M7 | core/lore.mjs (rollableLore doc) | low | DO-REFACTOR (kept) | the doc says it is the resolve list, not the offer list |
| M5 | core/attributes.mjs:247 | low | DO-REFACTOR (kept) | `attrIdOf` is `attrNameKey` cut at 64, so one fold; the mark regex uses escapes |
| M6 | core/ledgers.mjs (readAttrBeliefs doc) | low | DO-REFACTOR (kept) | the doc now gives the real `attr:<attrId>:<loreId>:<characterId>` key |
| M1 | core/shared.mjs:22 | medium | RECORD | untyped `num`: null/""/[] read as 0, so the DC clamps to 1 instead of 15 |
| R7 | core/study.mjs:175 | low | RECORD | `readStudyTiers` reads min null/""/false/[] as rung 0 instead of dropping it |
| M10 | attributes.mjs:1164 | low | RECORD | `markLearned` breaks the write contract (unwrapped update, `noLore`, `notFound`) |
| R3 | attributes.mjs:1164 | medium | RECORD | `markLearned` with an id string throws `getFlag is not a function` |
| R8 | ties-adapter.mjs:229 | medium | RECORD | `write` / `writeKnown` / `markLearned` let `actor.update` rejections through |
| M11 | ties-adapter.mjs:273 | low | RECORD | `setNotes` returns true when the write was refused |
| R10 | settings.mjs:121 | low | RECORD | keybinding promise rejections surface unprefixed as "Uncaught (in promise)" |
| M15 | attributes.mjs:238 | low | RECORD | the registry `serial` queue differs from the kit's serialStore idiom |
| M16 | core/html.mjs:53 | low | RECORD (note) | DOM helpers live in the pure core layer |
| ext-2 | core/ledgers.mjs:222 | medium | RECORD | derived-namespace meaning is spread over about six hand-kept lists |
| ext-3 | core/facts.mjs:88 | low | RECORD | the fact namespaces are if-ladders; the README Extending line is incomplete |
| ext-5 | api.mjs:72 | low | RECORD | READ_REF resolution is hand-wrapped per path, separately from the manifest |
| ext-7 | core/prose.mjs:165 | low | RECORD | the kind pass rung is a hand-written `>= 15` at about nine sites |
| ext-8 | api-manifest.mjs:214 | low | RECORD | manifest `returns` strings have drifted; `noLore` is missing from the reason table |
| ext-9 | api-manifest.mjs:46 | low | RECORD | `flags.writes` lists flags the module never writes |
| ext-11 | core/roster.mjs:31 | low | RECORD | `tablePCs` drops PCs by the world-specific regex `/marker\|crowd\|hotspot/i` |
| EC-2 | attributes.mjs:372 | medium | RECORD | concurrent `ensureAttribute` calls race: `planEnsure` reads the registry outside the queue |

Nine more findings were dropped: eight duplicates (ext-6, R9, ext-10, ext-13 among them) and R11.
Six of the 23 RECORD items were deferred by the cap.

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 7072e92d | `attributesOf` null-safe (`actor?.id`, `actor?.getFlag?.()`) | `test/review-ties-core.test.mjs`, "a null ref reads [] for a player too (READ_REF never throws)" |
| 37086a30 | `dossier(actor, opts)` reads `opts?.as` | `test/dossier.test.mjs`, "inspect(ref, null) answers like an omitted opts" |
| c2dc4326 | `selectAttributes` / `grantKnowledge` read `opts ?? {}` | `test/review-ties-core.test.mjs`, "grantKnowledge with null opts…" and "selectAttributes with null opts…" |
| c9da34f8 | relay.mjs trust-boundary comments (M2, also covers ext-10) | full suite (comments only) |
| e28a4550 | study.mjs JSDoc move and dead read removed (M8) | full suite, `test/known.mjs` mayStudy fixtures and study-* goldens |
| 92cf4002 | subtreeOf doc (M3) | full suite (comments only) |
| 881fc30c | rollableLore doc (M7) | full suite (comments only) |
| 047fc6b5 | attrIdOf = attrNameKey cut at 64; mark regex escapes (M5) | `test/known.mjs` (9 added lines) and the full suite |
| e7cfb031 | readAttrBeliefs doc key format (M6) | full suite (comments only) |

## Changes reverted by verification

| commit | verifier's reason |
|---|---|
| c709d66d (reverted by 276b0613) | A GM-visible behaviour change: kind-row authoring went from a failure path to a happy path. It was also wider than case preservation: it dropped the `[a-z0-9]` filter and the 64-char cap for `kind:` slugs, so junk ids (`kind:!!!`, markup, newlines, 80-char slugs) would persist. A case-only fix would be smaller. |

## Recorded for Joe

- **defect** `core/attributes.mjs:380` (R1). `clampAttribute` lowercases `kind:` slugs, so "Write an entry for this" on a kind row stores a dead id. A second click gives "collision" on a row that still reads unauthored. Fix it to keep case but still sanitise (`[A-Za-z0-9]`, cap 64), and clean up the dead lowercased entries already stored, which would otherwise block a new entry through the title collision rule. The reverted attempt was c709d66d.
- **defect** `core/shared.mjs:22` (M1). Switch `num` to the typed form that ties-core.mjs:52-62 uses. Today a null or "" DC clamps to 1 instead of LORE_DC_DEFAULT 15, and attributes-ui writes `Number(el.value)` for a cleared field. Test: `clampLoreRow({id:'a',label:'x',dc:null}).dc === LORE_DC_DEFAULT`.
- `core/study.mjs:175` (R7). `readStudyTiers` should type-check `min` before `num()`; null/""/false/[] read as rung 0 today. Decide this with M1. A live flag holding `min:null` would stop rendering.
- **defect** `ties-adapter.mjs:229` (R8). `write`, `writeKnown` and `markLearned` should catch `actor.update` rejections and return false. Today `setTie` can write the forward side and then reject on the mirror, and `migrateLegacy` aborts on the first rejection, contrary to the adapter's "nothing in here throws" header.
- **defect** `ties-adapter.mjs:273` (M11). `setNotes` should `return write(actor, list)`. Today a non-owner gets true and nothing is written.
- `attributes.mjs:1164` (M10). `markLearned` should wrap its update as `fail('writeFailed')`. Also add `noLore` to the closed reason table, and choose between `notFound` and `invalid` for a missing character.
- **defect** `attributes.mjs:1164` (R3). `markLearned('<actorId>', …)` throws `character.getFlag is not a function`. Guard with `typeof character?.getFlag !== 'function'`, or resolve the id.
- `attributes.mjs:372` (EC-2). Concurrent `ensureAttribute` calls plan outside the serial queue, so the second can get "collision" instead of `existed:true`. Fix by moving the plan inside the queue (a timing change).
- `settings.mjs:121` (R10). Attach `.catch(err => keyLog?.error(...))` to thenable keybinding results.
- `attributes.mjs:238` (M15). Decide whether new modules copy the registry `serial` queue or the kit's serialStore; migrating changes queue timing and refusal shape.
- `core/html.mjs:53` (M16). Blueprint note: `bindRowToggle` and `makeOpenState` belong in a ui-shared file (this changes graph-allow.json).
- `core/ledgers.mjs:222` (ext-2). Add a guard test that every DERIVED_NAMESPACES entry has an icon, a label and a derive slot; later, one DERIVED table (this needs a known-core-exports golden change).
- `core/facts.mjs:88` (ext-3). The README Extending line should list factKeyOf, parseFactKey, factOrder and knowsAbout; consider a `kindFactKey` builder.
- `api.mjs:72` (ext-5). Derive the READ_REF wraps from MANIFEST, or add a guard test (name vs document) per READ_REF row.
- `core/prose.mjs:165` (ext-7). Add a `kindPassed` helper in core/rules.mjs and use it at all about nine `>= 15` sites, including the ones outside scope.
- `api-manifest.mjs:214` (ext-8). Run a manifest pass with GOLDEN_UPDATE: fix the `returns` text for attributes.search, stale, tell, unreviewed and known.categories, and add `noLore`.
- `api-manifest.mjs:46` (ext-9). `flags.writes` lists `knownCategories` and `mark`, which only the GM authors. Move them to an authored list.
- `core/roster.mjs:31` (ext-11). `tablePCs` should match a marker flag or a word boundary, not `/marker|crowd|hotspot/i`, because "Crowder" loses its Share switch.
- Triage coverage. 24 of the 66 findings were never triaged because the computed list was truncated at EC-2. Re-run triage on them if they matter.

## Verification

- 7072e92d: keep
- 37086a30: keep
- c2dc4326: keep
- c709d66d: revert (276b0613)
- c9da34f8: keep
- e28a4550: keep
- 92cf4002: keep
- 881fc30c: keep
- 047fc6b5: keep
- e7cfb031: keep

## Gates

- `make foundry-ties-check`: exit 0. Node tests pass 255, fail 0; known-core 184 passed; look and known tab 9 passed; the vendored kit is identical to foundry/lib; conformance 96.1% (49/51) with only the accepted exceptions C05 and C37, and no new rows.
- `make check-context`: passes with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'`).
