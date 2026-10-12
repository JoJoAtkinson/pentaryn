---
title: "Final review 2026-10-12 — names"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of names found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — names

## Verdict

**NEEDS-JOE.** All six kept changes preserve behaviour and the gate is green, but the review recorded real defects that need a behaviour change to fix: renaming a synthetic (unlinked-token) actor relabels its sibling tokens, and a batch rename gives every renamed actor the last actor's old name.

## Scope

- Paths: `foundry/module/pentaryn-names/**` (module `pentaryn-names`) and this record.
- Base: `9d10880b` (origin/main when the review started).
- Branch: `review/names`, worktree `pentaryn-review-names-wt`.
- Triage: 23 findings, giving 6 DO (1 DO-EDGE, 5 DO-REFACTOR), 8 RECORD and 9 DROP (5 duplicates or merged, 4 no-action notes).

## Findings by lens

Line numbers are at the review HEAD.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| names-ac-1 | rename.mjs:88 | medium | DO-EDGE, kept | updateActor relabelled an actor whose own change had no `name` when a shared batch options object carried another actor's old name |
| names-maint-2 | README.md (sync row) | low | DO-REFACTOR, kept | Documents and pins sync's `BAD_ARGS` answer for a ref of the wrong kind |
| names-maint-3 | README.md:37, test/glue.test.mjs | low | DO-REFACTOR, kept | Name refs are matched exactly first, then case-insensitively; the comment and README said "exact only" |
| names-ac-4 | rename.mjs header, README.md:71 | low | DO-REFACTOR, kept | preUpdateActor runs only on the client that made the rename; the old name reaches other clients through the operation options |
| names-ext-1 | names.mjs (describe extras) | low | DO-REFACTOR, kept | describe() `events` now comes from the frozen `HOOKS` table instead of a literal `{}` |
| names-ext-2 | rename.mjs:49 | low | DO-REFACTOR, kept | One `relabelEmbedded` loop serves both scene tokens and combatants |
| names-edge-1 (+rob-1) | rename.mjs:88 | high | RECORD | Renaming a synthetic actor relabels every sibling token of the base actor and counts a prototype write that Foundry drops |
| names-ac-2 (+edge-2) | rename.mjs:83 | medium | RECORD | In a multi-actor rename batch, `pentarynOldName` is one key where the last write wins |
| names-rob-2 | rename.mjs:20 | medium | RECORD | `api.sync` does not type-check oldName/newName, so `undefined` blanks labels and the toast says "undefined" |
| names-maint-1 | rename.mjs:68 | medium | RECORD | syncRef returns a plain object on a coded failure and a Promise otherwise |
| names-ext-3 | rename.mjs:76 | medium | RECORD | The kit's `resolveRef(..., {base:true})` returns a synthetic Actor unchanged, and names, ties and transform each patch it locally |
| names-edge-3 | rename.mjs:28 | low | RECORD | On a GM client, a rejected combatant write skips the token toast and rejects sync |
| names-ac-3 (+edge-4) | rename.mjs:88 | low | RECORD | Two quick renames of one actor race and can leave labels on the middle name |
| names-maint-4 | CHANGELOG.md:3 | low | RECORD | The Unreleased header says kit 1.0.2, but the lock is 1.1.0; there is no W2-B4 entry |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| f940501e | names-ac-1: the updateActor guard also requires `"name" in changes` | `test/glue.test.mjs`: "updateActor ignores an actor whose own change has no name, even when the batch options carry another actor's old name (README: a nickname is never touched)" (failed before the fix) |
| b378129c | names-maint-2: README sync row documents `BAD_ARGS` for a wrong-kind ref (docs + test) | `test/glue.test.mjs`: "api.sync given a ref of the wrong kind returns fail(\"BAD_ARGS\") and writes nothing" |
| 80ab3077 | names-maint-3: comment and README describe the exact-then-case-insensitive whole-name resolve (docs + test) | `test/glue.test.mjs`: "api.sync resolves a whole name case-insensitively after the exact pass; two case-insensitive matches are AMBIGUOUS" |
| 0b032dc0 | names-ac-4: rename.mjs header comment and README say where the old name is captured (comment/docs only) | n/a (comment only); the glue preUpdate tests still pass |
| ffa9997b | names-ext-1: describe() `events: HOOKS` | `test/publish.test.mjs`: "describe(): the three legacy rows in order, the hooks names listens to, no events or settings" (the new assertion ties events to `Object.keys(HOOKS)`) |
| 21701c29 | names-ext-2: `relabelEmbedded` helper; the prototype write comes first, then tokens, then combatants (GM), and the write order and count are unchanged | glue, combatants, sync-ref and probe tests; the rename golden is byte-identical |

## Changes reverted by verification

None.

## Recorded for Joe

- **defect** `rename.mjs:88` (names-edge-1 + rob-1, high): renaming an unlinked token's synthetic actor runs sync() on it. It relabels every sibling token of the base actor on every scene, and their combatants (GM). It also counts and toasts a `prototypeToken.name` write that Foundry drops into the ActorDelta. Option A: when `actor.isToken`, relabel only `actor.token` (and its combatant) and skip the prototype write. Option B: keep the sibling relabel and skip the prototype write and its count, and add a README Pitfalls line. Either option is a declared change, and transform-creatures-34 is still undecided.
- **defect** `rename.mjs:83` (names-ac-2 + edge-2, medium): when two or more actors are renamed in one `Actor.updateDocuments` batch, every one of them gets the last actor's old name. Key the capture by id (`options.pentarynOldNames[actor.id]`) and read it in updateActor. This changes the options shape pinned at glue.test.mjs:150-172/:229 and the broadcast key.
- `rename.mjs:20` (names-rob-2, medium): `api.sync(actor, "Bob")` blanks every matching label and toasts "undefined". Return `fail("BAD_ARGS")` in syncRef when oldName/newName is not a string. This is a new failure path.
- `rename.mjs:68` (names-maint-1, medium): make syncRef `async` so every outcome is a Promise. Today AMBIGUOUS/BAD_ARGS come back synchronously and a `.then()` caller breaks. This changes the failure-path shape and needs a CHANGELOG line.
- `rename.mjs:28` (names-edge-3, low): on a GM client, a rejected combatant write skips the "Token labels updated" toast and rejects sync. Either toast before the combatant pass, or catch and log that pass on its own and still return the token count.
- `rename.mjs:88` (names-ac-3 + edge-4, low): two renames of one actor less than a write round trip apart can leave labels on the middle name. Either chain syncs per actor id, or add the README Pitfalls line "run sync(actor, middle, final) to repair".
- `foundry/lib/resolve.mjs` adapt() / `rename.mjs:76` (names-ext-3, medium, kit owner): map a `doc.isToken` Actor to its world actor when `kind==='actor' && base`, vendor the kit, then retire rename.mjs:76 and the hand-rolled copies in ties and transform.
- `CHANGELOG.md:3` (names-maint-4, low): bump the Unreleased header to kit 1.1.0 and add the W2-B4 describe() `resolve:"self"` entry.
- `api-manifest.mjs` (from names-maint-2, low): the sync row's ref documents only AMBIGUOUS and TypeError. Add BAD_ARGS and regenerate the describe golden.
- `README.md:72` (from names-ac-4, cosmetic): the reworded line runs past the paragraph's wrap width.

## Verification

- f940501e: keep
- b378129c: keep
- 80ab3077: keep
- 0b032dc0: keep
- ffa9997b: keep
- 21701c29: keep

## Gates

- `make` module gate for pentaryn-names: tests 54, pass 54, fail 0; the vendored kit is identical to foundry/lib (6 files); conformance is 100.0 % (44/44 fail-class rules); make exit 0.
- `git diff --quiet origin/main -- '**/golden/**'`: clean. Goldens byte-identical: yes.
- Untouchables clean (module.json, lang, lib, CHANGELOG, api-manifest, golden untouched).
- `make check-context` with this record in place: OK (5 pre-existing warnings, none in this file).
