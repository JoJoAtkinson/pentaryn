# Defect wave 2 (2026-10-12) — importer

**Read this when** you want the history of defect wave 2 for `pentaryn-importer`: what was
fixed, why, which commits, and how to confirm it live. History only — to operate the importer
read `foundry/module/pentaryn-importer/README.md`.

Branch `fix2/importer-2026-10-12`. Gate: `make foundry-importer-check` (115 node tests,
kit identical, conformance 100 %). All fixes are declared behaviour changes approved by Joe
on 2026-10-12; where Joe gave no ruling the review recommendation was taken.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| importer-R1 | A broken entry later in the file was only found after earlier actors were already written | recommendation | Every actor entry is checked before the first write; one broken entry refuses the whole run and nothing changes | 9d543f13 | glue.test (two-entry fixture, second has no slug: actors untouched, REFUSED, one toast) |
| importer-R3 | Bad options (`only` not a list, bad timeout, empty path) slipped through and the run still said "Import done" | recommendation | A bad option is refused at once, naming the option and the value; `import(null)` behaves like `import({})` | 2ac9992c | api.test (four refusals) |
| importer-AC-2 | Two GM tabs importing the same new NPC could create two copies | recommendation | New actors are created with an id derived from their slug (`keepId`), so only one can exist; the losing tab lists it as "created concurrently by another GM tab — re-run" and carries on | 054a9873 | concurrent-create.test |
| importer-M3 | Selftest only checked the contract flag, so a missing version-gate flag looked healthy while every import was refused | recommendation | Selftest checks contract, targetSystem, targetSystemVersion and generation and names any missing one | 49bdaf54 | api.test |
| importer-M4 | Version mismatch message pointed at the wrong file | recommendation | Message says "module.json and importer-core.mjs are out of step" | ac18da17 | core.test, golden/refusals.json |
| importer-R4 | A blank or non-object actor entry crashed with a cryptic error | recommendation | Refused as one clear REFUSED error before anything changes | fbbc884e | core.test, golden/refusals.json |
| importer-R5 | Asking for activities on loot/containers crashed with a TypeError and listed the actor as failed | recommendation | Run stops on a clear readback assertion naming the item and the missing activity | 168abace | write.test |
| importer-R6 | An actor whose items failed was listed as both updated and failed | recommendation | Counted as created/updated only after its hash is stamped, so it appears only as failed | 14d7022e | per-actor-outcome.test |
| importer-EC5 | Dry run reported a duplicated slug as "would create" twice | recommendation | Dry run says "would create" then "would update" (or "skip" if identical), like the real run | 1f0ee054 | core.test |
| importer-AC-1-half | A download that broke mid-body gave an unexplained internal error | recommendation | Refused as "Network error reading <file>" | 1033a3e3 | api.test |
| importer-EC4 | Two items on one actor with the same action name were not caught | recommendation | Whole run refused before any write; message names the actor and the duplicate action | 6a776e98 | core.test, golden/refusals.json |
| importer-R8 | Failed actors only showed in the console table | recommendation | Each failure is its own "failed <slug>: <error>" warning (and in the debug trace) before the table | 9c10bd70 | per-actor-outcome.test, write.test |
| importer-M2-followup | README implied the counts toast always shows | recommendation | README: counts toast only on a fully clean run; with failures the GM gets a permanent "N actor(s) failed — see the console" warning and no "delete the JSON" toast | 8305684b | docs only |

## Goldens changed

- `test/golden/refusals.json` — new refusals (R3, R4, EC4, AC-1-half) and the M4 wording.
- `test/golden/write-console.json` — new; console lines of every write-path run (R8).
- `test/golden/write-full.json` — counts reflect R6 (failed actors no longer also counted updated) and AC-2 ids.
- `test/golden/prepare.json` — dropped the two cases that pinned the old crash on a string/null entry; R4 refuses those before prepare runs (now in refusals.json).

## Live check after deploy

One GM tab only; ZZ scratch docs only; delete everything ZZ afterwards. Never touch the real PCs.

- **R1 / R4 / EC4** — import a ZZ actors.json with two entries, the second missing `slug`
  (then again with a blank entry, then with two items sharing an action): each refuses with
  one toast and `game.actors` gains no ZZ actor.
- **R3** — `game.pentaryn.import({dryRun:true, only:'skeleton'})` rejects with BAD_ARGS naming
  `only`, and no "Import done" toast.
- **AC-2** — (as revised by the FIX-3 forward fix) pre-create `Actor.create({name:'ZZ race', type:'npc', _id: idForSlug('zz-race')}, {keepId:true})`
  without the slug flag, import a ZZ actors.json with slug `zz-race`: expect
  `failed:[{slug:'zz-race', error contains 'already held by Actor "ZZ race"'}]`, the pre-created actor
  untouched (name, biography, createdTime). Then simulate the other tab: a two-entry import
  (`zz-a`, `zz-race2`) with a one-shot `createActor` hook that, on `zz-a`, creates `ZZ other tab` at
  `idForSlug('zz-race2')` with the slug flag: expect `failed:[{slug:'zz-race2', error contains
  'another GM tab'}]` and that actor untouched, exactly one Actor with that id.
  Then a plain ZZ import creates its actor with `id === idForSlug(slug)`. Delete the ZZ actors.
- **M3** — `game.pentaryn.importer.selftest()` returns `ok:true` listing the four gate-key checks,
  details equal to module.json `flags.pentaryn`.
- **R5** — `new Item.implementation({name:'ZZ loot', type:'loot'}).system.activities === undefined`
  and a `weapon` has a Collection (confirms the type list; the fix is pinned by the node suite).
- **R8 / R6 / M2-followup** — a ZZ import with one forced failure: console shows
  "failed <slug>: …" before the table, `game.pentaryn.importer.trace()` lists the slug, the slug
  is not in `updated`, and the GM sees the permanent "1 actor(s) failed" warning, no counts toast.
- **M4, EC5, AC-1-half** — code only (node suite).

## Live check (FIX-3, 2026-10-13)

Run in the one GM tab against a staged `Data/worlds/pentaryn/zz-importer-actors.json` (deleted
afterwards, 404 confirmed); every "ZZ importer …" actor deleted. Deployed code matched main.

| item | result | evidence |
|---|---|---|
| R1 | pass | entry 2 without slug → `PentarynAbort` REFUSED, one permanent toast, no ZZ actor |
| R4 | pass | `null` entry → REFUSED "An actor entry is not an object (got null)", one toast, no ZZ actor |
| EC4 | pass | two items with action `claw` → REFUSED naming `zz-ec4` and `claw`, one toast, no ZZ actor |
| R3 | pass | `only:'skeleton'` → BAD_ARGS naming `only`, no toast; `timeout:-5` and `path:''` also BAD_ARGS |
| AC-2 | **fail** | Foundry 14.369 does not refuse a `keepId` create over an existing *world* Actor id: it silently replaces it (no error, no `deleteActor`, new `createdTime`, the pre-created actor's biography wiped). The core server only checks duplicate ids for embedded collections (`m?.has(r._id)` in `server-backend.mjs`). So the import reported `created:['zz-race']`, `failed:[]`; the "created concurrently by another GM tab" branch never runs live. No duplicate results (one actor per id), but the second tab overwrites the first instead of losing. The second half passes: a plain import created `zz-plain` at `idForSlug('zz-plain')`. |
| M3 | pass | `selftest()` ok:true with the four `flags.pentaryn` gate keys, details = module.json |
| R5 | pass | loot and container `system.activities === undefined`; weapon has an `ActivityCollection` |
| R8 / M2-followup | pass | forced create failure (`zz-bad`, blank name): `warn failed zz-bad: …` before `console.table`; `trace()` has `import.failed {slug:'zz-bad'}`; permanent "1 actor(s) failed" warning; no counts toast, no delete toast, `deleteJson.required:false` |
| R6 | pass (create path) | `zz-bad` only in `failed`, not in created/updated. The item-write-after-update case cannot be forced live (an invalid Item is dropped → readback assertion, whole run) — pinned by the node suite |
| M4, EC5, AC-1-half | not-run | code only (node suite) |

Also seen (outside this wave): on the **update** path an invalid change (blank name) does not
throw in Foundry 14 — the client toasts a validation error and the update is dropped — so the
importer counted the actor `updated` and stamped its new `contentHash`; a re-run would skip it.
