// Fix: a magic item's Cast activity that cannot cast (feedback ixcdvA, 2026-10-19).
// ===================================================================================
//
// Run as the GM, as the BODY of an async function: paste into mcp__foundry__eval-js (or the GM
// console wrapped in `(async () => { ... })()`). DRY RUN by default: it changes nothing and returns
// what it would do. Set APPLY = true to write. Idempotent: a fixed Cast activity no longer matches.
//
// What was wrong (Marwen Ashcroft's "Wand of Magic Missiles", item WXWKkyAPhT7Gj2Dx, activity
// castMaMiWaOfMaMi): the Cast activity points at
//   Compendium.world.ddb-pentaryn-ddb-spells.Item.ddbMagicMissil24
// a DDB-imported copy of Magic Missile whose damage activity has `consumption.spellSlot: false` and
// one `itemUses` target on ITSELF (target ""), while the spell has no uses (max ""). dnd5e copies that
// spell onto the actor as the wand's cached spell, and casting it
//   - spends the cached SPELL's uses, which do not exist: "No uses on Magic Missile available to
//     spend, 1 required." — so it never casts, from the wand or from the spellbook; and
//   - ignores the wand's own charges: dnd5e skips a linked activity's consumption when the spell's
//     activity is a spell with `spellSlot: false` (`ignoreLinkedConsumption` in
//     Activity#_prepareUsageConfig), so even a cast that went through never spent a charge.
//
// The fix, exactly what the DMG module's own Wand of Magic Missiles does
// (dnd-dungeon-masters-guide.equipment dmgWandOfMagicMi): point the Cast activity at the PHB spell
// (Compendium.dnd-players-handbook.spells.Item.phbsplMagicMissi, whose damage activity spends a
// slot and nothing else), with `spell.level` = the spell's level and `consumption.spellSlot: true`.
// The wand keeps its 7 charges, its "1 charge, +1 per level, at most 3" scaling and its dawn
// recovery. dnd5e then deletes the old cached spell and caches the PHB one on the next update
// (Item#onUpdateActivities runs on the client that made the update — this one).
//
// Scope: every Cast activity on every world actor (owned items only; compendium items untouched)
// whose spell has an activity spending its own uses with the slot off while the spell has no uses.
// The replacement is the PHB spell of the same name; an actor/item with no PHB match is reported,
// not changed. The world compendium entries (ddbMagicMissil24 …) themselves are NOT edited (Joe's call).
//
// Dry run on 2026-10-19 (pentaryn world) matched three Cast activities:
//   Marwen Ashcroft · Wand of Magic Missiles · castMaMiWaOfMaMi → PHB Magic Missile   (this report)
//   Marwen Ashcroft · Prism-Silt Lens        · castDeMaWaOfMaDe → PHB Detect Magic    (same flaw: a
//                                              3-charge wand of Detect Magic that could not cast either)
//   Bazgar of the Dakmar'nak · Axe of Resonant Provocation · Menacing Provocation (homebrew, no PHB
//                                              spell): reported only — needs a hand fix of the source.
// ONLY_ITEM_IDS narrows APPLY to those items (null = every match with a PHB spell).

const APPLY = false;
const ONLY_ITEM_IDS = null;   // e.g. ["WXWKkyAPhT7Gj2Dx"] for the wand alone
const PHB_PACK = "dnd-players-handbook.spells";

const phb = game.packs.get(PHB_PACK);
const phbIndex = phb ? await phb.getIndex() : null;
const norm = s => String(s ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** The spell's activities that spend the spell's own (absent) uses with the slot off. */
function selfSpendingActivities(spell) {
  const max = String(spell.system?._source?.uses?.max ?? spell.system?.uses?.max ?? "").trim();
  if (max && max !== "0") return [];
  return Object.values(spell.system?._source?.activities ?? {}).filter(a =>
    a?.consumption?.spellSlot === false
    && (a.consumption.targets ?? []).some(t => t?.type === "itemUses" && !t.target));
}

const found = [];
for (const actor of game.actors) {
  for (const item of actor.items) {
    for (const act of Object.values(item.system?._source?.activities ?? {})) {
      if (act?.type !== "cast" || !act.spell?.uuid) continue;
      if (act.spell.uuid.startsWith(`Compendium.${PHB_PACK}.`)) continue;
      const spell = await fromUuid(act.spell.uuid).catch(() => null);
      if (!spell) { found.push({ actor: actor.name, item: item.name, activity: act._id, problem: "spell not found", spell: act.spell.uuid }); continue; }
      const bad = selfSpendingActivities(spell);
      if (!bad.length) continue;
      const match = phbIndex?.find(e => norm(e.name) === norm(spell.name)) ?? null;
      const row = {
        actor: actor.name, actorId: actor.id, item: item.name, itemId: item.id, activity: act._id,
        from: act.spell.uuid, spell: spell.name, badActivities: bad.map(a => a._id),
        to: match ? `Compendium.${PHB_PACK}.Item.${match._id}` : null,
        cachedSpell: item.system.activities.get(act._id)?.cachedSpell?.id ?? null,
      };
      if (!match) { row.problem = "no PHB spell of that name: fix by hand"; found.push(row); continue; }
      const level = act.spell.level ?? spell.system?.level ?? null;
      row.update = {
        [`system.activities.${act._id}.spell.uuid`]: row.to,
        [`system.activities.${act._id}.spell.level`]: level,
        [`system.activities.${act._id}.consumption.spellSlot`]: true,
      };
      if (APPLY && (!ONLY_ITEM_IDS || ONLY_ITEM_IDS.includes(item.id))) {
        await item.update(row.update);
        const after = item.system.activities.get(act._id)?.cachedSpell ?? null;
        row.applied = true;
        row.newCachedSpell = after ? { id: after.id, source: after._stats?.compendiumSource ?? null } : null;
      }
      found.push(row);
    }
  }
}

return { apply: APPLY, phbPack: !!phb, count: found.length, rows: found };
