---
title: "Importing generated NPCs (pentaryn-importer)"
status: active
last_modified: 2026-10-19
tags: [context, foundry, dnd5e, module, importer]
---

# Importing generated NPCs — `pentaryn-importer`

**Read this when:** you are importing (or re-importing) the generated NPC Actors from
`actors.json` into a world, checking a fresh build at the table (Gate 2), or an import refused; or a
D&D Beyond character came in wrong, or lost a fix on a re-sync (DDB corrections, freezing an item).
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

`ddbCorrections` (world, default on): the automatic DDB corrections, below. Nothing else: what gates
an NPC import is `module.json` → `flags.pentaryn` (`contract`, `targetSystem`,
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
do not own. Never re-import a PC that is in play to fix its data. ddb-importer gets a few shapes wrong
for us, and **every re-sync from D&D Beyond puts them back** — so the fixes live in this module as
**DDB corrections** (1.2.0) and re-apply themselves.

### How the corrections run

- **After every sync**, on the client that ran it: ddb-importer fires
  `ddb-importer.characterProcessDataComplete` once the import is written (it cannot be changed in
  flight; we correct right after). That client applies the corrections if it owns the actor (the
  player, or the GM); otherwise it relays to the active GM, which applies them only when the sender
  owns the actor (else `REFUSED`). A sync and the GM-login sweep that meet on one actor: the second
  skips with a console warning, and the next sweep picks up anything it missed.
- **At GM login**, the active GM sweeps every DDB character synced since its last correction: each
  import gets a fresh `flags.ddbimporter.importId` (ddb-importer stores no timestamp), and a clean run
  stamps `flags.pentaryn-importer.ddbCorrections.importId`. A mismatch means "synced since". So a sync
  made while nobody had the module running is caught at the next GM login. A stamp written by another
  module version is due as well, so **the first GM login after any importer release corrects every DDB
  character once** (that is how a new rule reaches characters already corrected).
- The GMs get **one whispered chat line** per run that changed something ("DDB corrections — <name>: N
  change(s) — …"), and one console line. Nothing when nothing changed.
- **Off switch:** world setting *Correct D&D Beyond characters after a sync* (`ddbCorrections`,
  default on). It stops the automatic runs; `apply` by hand still works.

```js
await game.pentaryn.importer.ddbCorrections.plan("Marwen Ashcroft")    // dry run: changes, notes, frozen
await game.pentaryn.importer.ddbCorrections.apply("Marwen Ashcroft")   // write now
game.pentaryn.importer.inspect("Marwen Ashcroft")                       // stamp, needsCorrection, frozen items
game.pentaryn.importer.ddbCorrections.rules()                           // what the rules are
```

### The rules (feedback tiDvFa, ixcdvA, tNdOEx)

| Rule | Fixes |
|---|---|
| `apparel-as-equipment` | Custom D&D Beyond "Adventuring Gear" arrives as a consumable trinket: robes, clothes, cloaks become equipment (clothing), notes and journals equipment (trinket) — the word must end the name, so "Cloak Clasp" and "Dress Sword" are not apparel. Quantity, weight, description, container, equipped state, properties, attunement, identifier and magical bonus are kept, and the item id; the consumable's default single use and its "use" activity are dropped. An item that is magical, needs attunement, or has real uses or other activities is only reported in `notes` (since 1.2.1). |
| `freecast-innate` | A feat's 1/day free cast (Shadow Touched, Magic Initiate) arrives as method `atwill` with 1 use per long rest, so dnd5e lists it under At-Will. It becomes `innate` (Innate Spellcasting, 1/day kept). Its slot-cast copy stays under its level. |
| `cast-self-uses` | A wand's Cast activity points at a DDB copy of the spell that spends its *own* (absent) uses: "No uses on Magic Missile available", and the wand's charges are never spent. It is repointed at the PHB spell of the same name, slot on — what the DMG's own wands do. No PHB spell of that name → reported in `notes`, not changed: freeze it (below). |
| `stale-cast-cache` | dnd5e caches a Cast activity's spell on the actor (`flags.dnd5e.cachedFor`); after a repoint the copy of the old DDB spell stays, and the spellbook shows the spell twice (Marwen's *Detect Magic* from the Prism-Silt Lens). A repoint in the same run is left to dnd5e, which deletes the old copy itself; a copy whose compendium source (compared normalised) is not the spell its activity now casts is deleted; dnd5e caches the right one on the next cast (1.2.1). |
| `transmuters-stone` | The Transmuter's Stone feat arrives with no effects and its benefit baked into base data (darkvision 60, CON save). The feat gets an always-on CON-save effect and one pick-one effect per benefit (`flags.pentaryn-riders.choice`, one at a time below Wizard 10); the baked base values are reset: darkvision at the species' range + 60 goes back to the species' range (unless another feature, subclass or item evidently grants darkvision: left as is, with a note), and the CON save goes unless the starting class or a Resilient (Constitution) feat grants it (no `originalClass` on a multiclass: every class counts, with a note). The baked benefit starts on. |

**"My backpack didn't come across."** It did: ddb-importer keeps container contents, and dnd5e 6
shows them only inside the container. Open the Backpack or Component Pouch on the Inventory tab. The
old clean-up script lists each container's contents (`scripts/foundry/fixes/2026-10-19-ddb-pc-cleanup.js`,
dry run).

### Freeze or rule

- **A rule** when the flaw is a *shape* ddb-importer produces for any character. Rules match by item
  type, name, identifier and data shape — never by an actor or item id — so Bazgar's and Sabriel's
  syncs get the same treatment as Marwen's.
- **Freeze** when the item is a *one-off*: a homebrew magic item with no generic fix (Bazgar's *Axe
  of Resonant Provocation* — its Menacing Provocation spends its own uses and has no PHB spell), or
  any item fixed by hand that a sync must not overwrite. Fix it by hand, then freeze it with
  `scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js` (eval-js body, dry run by default; set
  `ACTOR`, `ITEMS`, then `APPLY = true`). It sets `flags.ddbimporter.ignoreItemImport` (ddb-importer's
  item flag "Ignore this item when importing the character"), the **only** flag ddb-importer 7.5.8's
  import honours: the item is neither updated nor removed by a sync. The rules skip a frozen item too.
  **Not `ignoreItemUpdate`:** that one only stops the push back to D&D Beyond; a sync still overwrites
  the item, and the rules still correct it (Chris's Premades items carry it). Cost: later changes to
  that item on D&D Beyond never arrive — unfreeze (`UNFREEZE = true`), re-sync, fix, freeze again.

### Adding a rule

1. A row in `foundry/module/pentaryn-importer/ddb-core.mjs` `RULES`: `{ id, label, doc, match(actor,
   item), plan(actor, item, lookups) → { changes, notes } }`. Pure, generic, idempotent: an item that
   is already correct must not match or must plan nothing. Ops: `retype`, `updateItem`,
   `createEffects` (deterministic `_id`s via `stableId`), `deleteItem`, `updateActor`. A rule that needs a document
   lookup adds it in `ddb-adapter.mjs` `lookupsFor`.
2. A fixture in `test/fixtures/ddb.mjs` and a table in `test/ddb-core.test.mjs`, including the
   idempotence case (the corrected snapshot plans nothing). Then `make foundry-importer-check`.
3. A row in the table above, a CHANGELOG line, the module's version bump.

The 2026-10-19 fix scripts (`2026-10-19-ddb-pc-cleanup.js`, `-wand-cast-spell.mjs`,
`-transmuters-stone.js`) are superseded by the rules and kept as a fallback while the module is not
live; they are dry run by default.
