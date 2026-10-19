---
title: "Importing generated NPCs (pentaryn-importer)"
status: active
last_modified: 2026-10-19
tags: [context, foundry, dnd5e, module, importer]
---

# Importing generated NPCs — `pentaryn-importer`

**Read this when:** you are importing (or re-importing) the generated NPC Actors from
`actors.json` into a world, checking a fresh build at the table (Gate 2), or an import refused.
**Not this file:** module internals and the API → [`../../foundry/module/pentaryn-importer/README.md`](../../foundry/module/pentaryn-importer/README.md) ·
the data contract → [`../../foundry/CONTRACT.md`](../../foundry/CONTRACT.md) · why the pipeline
looks like this → [`../plans/foundry-content-pipeline.md`](../plans/foundry-content-pipeline.md) ·
player characters from D&D Beyond → [below](#player-characters-from-dd-beyond-ddb-importer)

## At the table

Players see nothing. Only a GM can import, from the browser console (F12) or through the MCP
bridge's `eval-js`. Imports update NPC Actors in place, so tokens already on scenes keep working.
Hand-curated art, token images and current hit points are never overwritten.

## For the GM

`actors.json` must be under `Data/` to be fetched, and `Data/` is **public over the tunnel**. So the
file is copied in, imported, then deleted. One command does all three steps and proves the delete:

```bash
make foundry-import WORLD=<world>     # build → stage → (you import) → delete → verify 404
```

Always pass `WORLD`: the pipeline's default world may not be the one you are in (ask the live
client, `game.world.id`). While it waits, run the import in the console:

```js
await game.pentaryn.import({ dryRun: true });   // gate + lint + report, writes nothing
await game.pentaryn.import();                   // the real run
```

If you staged by hand (`make foundry-sync WORLD=<world>`), finish with
`make foundry-clean WORLD=<world>`. A permanent "Delete Data/…" toast after an import means the
file is still there.

### Gate 2, step by step (a new generator build)

```js
// 1. one NPC, dry first
await game.pentaryn.import({ only: ["skeleton"], dryRun: true });
await game.pentaryn.import({ only: ["skeleton"] });
//    → readback assertions run automatically; any mismatch throws PentarynAssertionError

// 2. prove abort-on-first-mismatch: hand-edit one `expected` value in the STAGED actors.json
//    (e.g. labels.toHit "+4" → "+9"), then re-import with force
await game.pentaryn.import({ only: ["skeleton"], force: true });
//    → expect PentarynAssertionError naming actor, item, activity, path, expected and actual

// 3. prototype token, by eye as well as by assertion
game.actors.getName("Skeleton").prototypeToken   // vision, bars, size, disposition

// 4. full import, then idempotence
await game.pentaryn.import();
const again = await game.pentaryn.import();
console.assert(again.counts.created === 0 && again.counts.updated === 0, "not idempotent");
```

### Back up before a big import

```bash
make foundry-backup
```

## Settings that matter

None. What gates an import is `module.json` → `flags.pentaryn` (`contract`, `targetSystem`,
`targetSystemVersion`, `generation`): the JSON, these flags and the live game must all agree. After
a dnd5e minor upgrade, rebuild with `make foundry-actors` before importing.

## API quick calls

```js
game.pentaryn.importer.describe()          // methods, params, the two failure channels
game.pentaryn.importer.selftest()          // { ok, checks } — after a sync
await game.pentaryn.import({ only: ["slug"], force: true })   // rewrite one actor
game.pentaryn._internals.lintFormulas(actors)                   // lint a JSON array by hand
```

A thrown `PentarynAbort` means nothing was written (wrong version, `@ref` lint, bad file, not a
GM). Its `code` says which (1.1.1): `NOT_FOUND` (no file at the path — the usual case after an
import, which deletes it), `NOT_GM`, `BAD_ARGS`, `CONFLICT` (already running), `TIMEOUT`, else
`REFUSED`; through `pentaryn-write` that is the result's `code`. A thrown `PentarynAssertionError` means the batch is partial. Per-actor failures come back in
`result.failed` with `ok: false`.

## Known gaps

- A second `import()` while one is running is refused on the same tab only; the bridge tab and a
  browser GM tab can still overlap. Run imports from one place.
- The payloads still use the dnd5e 5.3 shapes (`movement.walk`, `init.bonus`); dnd5e 6 migrates
  them until 7.0. Moving them is the `@2` contract bump.
- The module cannot delete `actors.json` itself (Foundry has no client file-delete API).

## Player characters from D&D Beyond (ddb-importer)

PCs are **not** built by this module or by `build_actors.py`. A PC linked to D&D Beyond (the actor
carries `flags.ddbimporter`) is transferred by the third-party **ddb-importer** module, whose code we
do not own. Never re-import a PC that is in play to fix its data; after a transfer, run the
clean-up script through `eval-js` (dry run by default, idempotent; set `ACTOR`, then `APPLY = true`):

    scripts/foundry/fixes/2026-10-19-ddb-pc-cleanup.js

It fixes what ddb-importer gets wrong for us (feedback tiDvFa, Marwen):

- **Robes, clothes and notebooks as consumables.** Custom D&D Beyond "Adventuring Gear" arrives as a
  consumable trinket; apparel becomes equipment (clothing), notes and journals equipment (trinket).
- **A feat's 1/day free cast listed as At-Will.** Shadow Touched, Magic Initiate and the like arrive
  with spellcasting method `atwill` plus 1 use per long rest; they become `innate` (the "Innate
  Spellcasting" section, with the 1/day uses). Their slot-cast copies stay under their level.
- **"My backpack didn't come across."** It did: ddb-importer keeps container contents, and dnd5e 6
  shows them only inside the container. Open the Backpack or Component Pouch on the Inventory tab.
  The script lists each container's contents and scrolls.
