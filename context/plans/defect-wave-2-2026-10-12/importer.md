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
- **AC-2** — pre-create `Actor.create({name:'ZZ race', type:'npc', _id: idForSlug('zz-race')}, {keepId:true})`
  without the slug flag, import a ZZ actors.json with slug `zz-race`: expect
  `failed:[{slug:'zz-race', error contains 'another GM tab'}]` and exactly one Actor with that id.
  Then a plain ZZ import creates its actor with `id === idForSlug(slug)`. Delete the ZZ actors.
- **M3** — `game.pentaryn.importer.selftest()` returns `ok:true` listing the four gate-key checks,
  details equal to module.json `flags.pentaryn`.
- **R5** — `new Item.implementation({name:'ZZ loot', type:'loot'}).system.activities === undefined`
  and a `weapon` has a Collection (confirms the type list; the fix is pinned by the node suite).
- **R8 / R6 / M2-followup** — a ZZ import with one forced failure: console shows
  "failed <slug>: …" before the table, `game.pentaryn.importer.trace()` lists the slug, the slug
  is not in `updated`, and the GM sees the permanent "1 actor(s) failed" warning, no counts toast.
- **M4, EC5, AC-1-half** — code only (node suite).
