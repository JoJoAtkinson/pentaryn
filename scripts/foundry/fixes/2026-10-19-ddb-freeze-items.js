// Freeze named items on a D&D Beyond character so a ddb-importer re-sync leaves them alone.
// Body of an async function for the foundry `eval-js` MCP tool (paste the file as `script`), or a GM
// console wrapped in `(async () => { … })()`. GM (or the character's owner).
// DRY RUN by default: it returns the plan and writes nothing. Set APPLY = true to write.
// Idempotent: an item already frozen is reported and not written again. UNFREEZE = true reverses it.
//
// WHEN TO FREEZE, AND WHEN TO WRITE A RULE INSTEAD (context/foundry/importer.md, "Freeze or rule"):
//   - A RULE (pentaryn-importer ddb-core.mjs) when the flaw is a SHAPE ddb-importer produces for any
//     character: apparel typed as consumables, feat 1/day casts as At-Will, a Cast activity pointing at a
//     DDB spell that spends its own uses when a PHB spell of that name exists. The module re-applies it
//     after every sync, for every DDB character (Bazgar, Marwen, Sabriel and whoever comes next).
//   - FREEZE when the item is a ONE-OFF with no generic fix: a homebrew magic item whose Cast spell has
//     no PHB equivalent (Bazgar's "Axe of Resonant Provocation": its Menacing Provocation spends its own
//     uses), or any item fixed by hand that a sync must not overwrite. Fix the item by hand first, then
//     freeze it. The DDB-corrections rules skip a frozen item too.
//
// What freezing does: sets `flags.ddbimporter.ignoreItemImport = true` on the item ("Ignore this item
// when importing the character" in ddb-importer's item flags dialog). ddb-importer 7.5.8's import path
// (mergeExistingItems, clearItemsByUserSelection) honours ONLY this flag: the item is kept as it is,
// neither updated from D&D Beyond nor removed. So a change made on D&D Beyond to a frozen item never
// arrives: when the player changes it there, unfreeze, re-sync, fix by hand again, freeze again.
// NOT `ignoreItemUpdate`: that one only stops ddb-importer pushing the item back to D&D Beyond (its
// dynamic sync); a sync from D&D Beyond still overwrites the item, and the DDB-corrections rules still
// treat it as unfrozen. (`ignoreIcon` keeps only the icon.)

const ACTOR = "Bazgar of the Dakmar'nak";         // id or exact name
const ITEMS = ["Axe of Resonant Provocation"];    // exact item names on that actor
const APPLY = false;                              // false = dry run
const UNFREEZE = false;                           // true = remove the freeze instead

const FLAG = "ignoreItemImport";
const actor = game.actors.get(ACTOR) ?? game.actors.getName?.(ACTOR)
  ?? game.actors.find?.(a => a.name === ACTOR) ?? null;
if (!actor) return JSON.stringify({ error: `no actor ${ACTOR}` });

const out = { actor: { id: actor.id, name: actor.name, ddb: !!actor.flags?.ddbimporter }, apply: APPLY,
  unfreeze: UNFREEZE, change: [], already: [], missing: [], applied: [], errors: [] };
if (!out.actor.ddb) out.errors.push(`${actor.name} has no flags.ddbimporter: not a D&D Beyond character (nothing to freeze against)`);

const updates = [];
for (const name of ITEMS) {
  const matches = actor.items.filter(i => i.name === name);
  if (!matches.length) { out.missing.push(name); continue; }
  for (const it of matches) {
    const frozen = it.flags?.ddbimporter?.[FLAG] === true;
    if (frozen !== UNFREEZE) { out.already.push(`${it.name} (${it.id})`); continue; }
    out.change.push(`${it.name} (${it.id})`);
    updates.push({ _id: it.id, [`flags.ddbimporter.${FLAG}`]: !UNFREEZE });
  }
}

if (APPLY && updates.length && out.actor.ddb) {
  try {
    await actor.updateEmbeddedDocuments("Item", updates);
    out.applied.push(...out.change);
  } catch (e) {
    out.errors.push(e?.message ?? String(e));
  }
}
return JSON.stringify(out);
