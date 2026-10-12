# Defect wave 2 (2026-10-12) — riders

**Read this when** you want the history of defect wave 2 for `pentaryn-riders`: which review
findings were fixed, how, and how to check them live. History, not instructions — the use-doc
is `foundry/module/pentaryn-riders/README.md`.

Branch `fix2/riders-2026-10-12`. Gate: `make foundry-riders-check` (196 node tests + riders-core
108 / rituals-core 22 / table-core 39, vendored kit identical, conformance 96.0 % with the
accepted C37/C56 exceptions). Every fix is a declared behaviour change. No item was reverted
(every outcome holds). Deploy: module `pentaryn-riders` only, reload (no `module.json` change;
`lib/election.mjs` is an unchanged vendored copy of `foundry/lib/election.mjs`).

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| riders-async-1 | Two tabs on the roller's account could both end concentration and both mark the save card on a failed save | recommendation | The first tab to claim the save card ends the concentration and marks the card "broken"; the other tab does nothing | e8513b88 | `test/concentration.test.mjs` "riders-async-1: two tabs … concentration ends once", "the later claim wins …" |
| riders-async-3 | Summon cleanup ran in every GM tab (bridge tab + browser), deleting tokens twice and warning | recommendation | One tab claims the summoned tokens of each scene and deletes them once, ~750 ms after concentration ends | 0424437f | `test/concentration.test.mjs` "riders-async-3: … each scene's summons are deleted once", "the later claim wins …" |
| riders-async-4 | Installing Battle Medic deleted the old "Heal dX" activities one save at a time | recommendation | All old Heal dX options go in one item save; the result still names them | 3babc2f7 | `test/api.test.mjs` "installBattleMedic: every 'Heal dX' activity goes in one item update"; golden `install-battle-medic.json` |
| riders-async-5 | Setting an Elemental Adept/Affinity type, or retiring Affinity's click-to-add damage, saved once per feature/activity | recommendation | One write per character for both `setType` and `retireManual` | 31a448fe | `test/api.test.mjs` "setType on an actor and retireManual write once …" |
| riders-maint-02 | Battle Medic's claimed heal released its claim in several places; `waitForResult` duplicated answer handling | recommendation | Code tidy only: one release helper, answers read through `recordedAnswer`. Heals behave exactly as before | d02feb4c | `test/battle-medic-source.test.mjs` two riders-maint-02 tests |
| riders-ext-4 | Selftest "hooks registered" failed unless exactly 23 hooks were live | recommendation | Passes whenever any hooks are live; the row shows the count | 3f9db5a7 | `test/api.test.mjs` "selftest(): 'hooks registered' passes for any non-zero hook count" |
| riders-ext-6 | `isArcaneRecovery`'s comment claimed a PHB source check it never did | recommendation | Comment only: recognised by identifier or name | 21b23e5f | `test/table-core-source.test.mjs` "riders-ext-6 …" |
| EC-3 | After a summon flipped the sidebar to Actors, the "put it back" kept firing; a cancelled placement left it armed, so opening Actors yourself got undone | recommendation | The put-back fires once; a later deliberate click on Actors stays | 2f962fb8 | `test/cast-flow.test.mjs` "EC-3: the keep is one-shot …" |
| rob-3 | `spendHitDie(actor, { faces: "6" })` ignored the string and spent the largest die | recommendation | "6" spends a d6; "d6" or junk still spends the largest die left | 5f526f8a | `test/api.test.mjs` "rob-3 …"; golden `describe.json` (doc text) |
| rob-5 | `setType` accepted any string ("banana", poison on Elemental Adept) | recommendation | A type no targeted feature allows fails with BAD_ARGS listing the allowed types and writes nothing; features that don't list the type, and non-typed items (Healer), are left alone | f7dae51d | `test/api.test.mjs` "rob-5 …"; golden `describe.json` (doc text) |
| rob-1 | `inspect(actor, null)` crashed | recommendation | A null options value reads as no options | d9c09802 | `test/api.test.mjs` "rob-1 …" |
| rob-2 | `spendHitDie(actor, null)` / `installBattleMedic(actor, null)` crashed | recommendation | Same as leaving the options out (largest die; old heal options replaced) | d9c09802 | `test/api.test.mjs` two "rob-2 …" tests |
| riders-maint-01 | The installed-patch list for `describe()` and the selftest had two copies | recommendation | One `patchRecords` in `api.mjs`, re-exported by `patches.mjs`; output identical | f0205f34, 39508c4e | `test/patches.test.mjs` "riders-maint-01 …" |

Other files touched: `foundry/adjustments.yml` (the sidebar-keep row now says one-shot, EC-3),
`README.md`, `api-manifest.mjs`, `lib/kit.lock.json` (lists the vendored `election` file).

**Goldens changed:** `test/golden/describe.json` (setType and spendHitDie doc strings),
`test/golden/install-battle-medic.json` (one `updateItem` with `<_del>` replaces the per-activity
`deleteActivity`).

## Live check after deploy

On the one GM tab, ZZ scratch actors/scene only; delete them after.

- **riders-async-1** — ZZ Caster concentrating on a non-summon spell; roll a concentration
  save that fails. Expect the effect gone once, the card line "DC n · Failed: concentration
  ended", and `game.messages.get(id).flags["pentaryn-riders"].claims.autoBreak === game.socket.id`.
- **riders-async-3** — ZZ Caster casts Flaming Sphere (PHB compendium) onto a ZZ scene, then
  breaks concentration. Sphere token gone within ~1 s, no pentaryn-riders console warn, the log
  line "removing 1 summon token(s)" exactly once.
- **riders-async-4** — ZZ Healer (PHB Healer feat with Heal d6/d8/d10, a Healer's Kit). Count
  `updateItem` hooks, run `game.pentaryn.riders.installBattleMedic("ZZ Healer")`: `removed`
  lists every Heal dX, only Battle Medic is left, counter is 2.
- **riders-async-5** — ZZ Sorcerer with PHB Elemental Affinity and Elemental Adept (Fire).
  Count `updateItem`, run `retireManual("ZZ Sorcerer")` then `setType("ZZ Sorcerer", "cold")`:
  Affinity damage activities gone, both flags set, one batch per call, `report()` shows types.
- **riders-maint-02 / riders-ext-6 / riders-maint-01** — code only (selftest still lists the
  same patches).
- **riders-ext-4** — `game.pentaryn.riders.selftest()`: `ok === true`, hooks row detail is
  the count.
- **EC-3** — ZZ Caster casts a PHB compendium summon on a ZZ scene, right-click cancels, then
  click Actors: it stays. Cast again and let the import flip the sidebar: put back once.
- **rob-3** — ZZ Multi (fighter 1 / wizard 1): `spendHitDie("ZZ Multi", { faces: "6" })`
  returns 6 and the wizard class `hd.spent` is 1; `{ faces: "d6" }` returns 10.
- **rob-5** — `setType("ZZ Sorcerer", "fir")` throws BAD_ARGS listing
  acid/cold/fire/lightning/thunder, flag unset; `setType("ZZ Sorcerer", "fire")` returns the
  item name.
- **rob-1 / rob-2** — `inspect("ZZ Healer", null)` returns the plain inspect shape;
  `spendHitDie("ZZ Multi", null)` returns the largest faces; `installBattleMedic("ZZ Healer",
  null)` returns `{ ok: true, … }`.
