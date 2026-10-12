/**
 * Pentaryn Feature Riders — the API: the console members behind game.pentaryn.riders.
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Feature functions reach
 * this file through `ctx.exposed` (Battle Medic's `runBattleMedic` and `installBattleMedic`).
 */

import * as core from "./riders-core.mjs";
import { MODULE } from "./riders-core.mjs";
import { carriedBy, featuresOf, hdPools, isBattleMedic, isType, restoreHitDie, spendHitDie } from "./shapes.mjs";

/**
 * Set the damage type a typed feature (Elemental Adept, Elemental Affinity) stands for.
 * `target` is that item, or an actor: then every typed feature item on it is set (only the one
 * rule's items when `ruleKey` is given). Returns the names of the items set.
 */
async function setType(target, type, ruleKey = null) {
  const t = String(type ?? "").toLowerCase().trim();
  if (!t) throw new Error("setType(item | actor, type, ruleKey?): type required");
  const items = target instanceof Actor
    ? featuresOf(target).filter(f => f.rule.types && (!ruleKey || f.key === ruleKey)).flatMap(f => f.items)
    : [target];
  const done = [];
  for (const item of items) {
    if (!item?.setFlag) continue;
    await item.setFlag(MODULE, "damageType", t);
    done.push(item.name);
  }
  return done;
}

/**
 * The PHB models Elemental Affinity as damage activities the player clicks to add +CHA. With the
 * rider on, clicking one adds it twice. This pins the resolved type into the item's flag (the
 * activities were one way to resolve it) and deletes those activities. Typeless → left alone.
 */
async function retireManual(actor) {
  const out = [];
  for (const f of featuresOf(actor)) {
    if (f.key !== "elemental-affinity" || !f.types?.length) continue;
    for (const item of f.items) {
      if (!item.isOwner) continue;
      if (!item.getFlag(MODULE, "damageType")) await item.setFlag(MODULE, "damageType", f.types.length === 1 ? f.types[0] : f.types);
      for (const a of item.system.activities?.contents ?? []) {
        if (a.type !== "damage") continue;
        await item.deleteActivity(a.id);
        out.push(`${item.name}: ${a.name || a.id}`);
      }
    }
  }
  return out;
}

/** One row per (actor, feature): what is active, which types, and Battle Medic's state. */
function report(actor) {
  const actors = actor ? [actor] : game.actors.filter(a => a.type === "character");
  const rows = [];
  for (const a of actors) {
    for (const f of featuresOf(a)) {
      const row = { actor: a.name, rule: f.key, items: f.items.map(i => i.name).join(", ") };
      if (f.rule.types) {
        row.types = f.types.join(", ");
        row.status = f.types.length ? "active" : "NO TYPE — setType(actor, 'fire')";
      } else row.status = "active";
      if (f.key === "elemental-affinity") {
        const manual = f.items.flatMap(i => i.system.activities?.contents ?? []).filter(x => x.type === "damage").length;
        if (manual) row.manual = `${manual} +CHA activities left — retireManual(actor)`;
      }
      if (f.rule.effect?.unlessCarried) {
        // Spells that already add this ability by hand: the rider skips them (no double count).
        const ab = f.rule.effect.bonus;
        const hand = a.items.filter(i => i.type === "spell" && (i.system.activities?.contents ?? []).some(x => carriedBy(x).includes(ab)));
        if (hand.length) row.handAdded = `${hand.map(i => i.name).join(", ")} already add ${ab.toUpperCase()} — rider skips them`;
      }
      if (f.key === "healer") {
        const bm = f.items.flatMap(i => i.system.activities?.contents ?? []).find(x => isBattleMedic(x));
        const tgt = bm?.consumption?.targets?.find(t => t.type === "itemUses")?.target;
        row.battleMedic = !bm ? "not installed — installBattleMedic(actor)"
          : !tgt ? "installed, no kit linked"
          : a.items.has(tgt) ? `installed, kit ${a.items.get(tgt).name}` : `installed, kit ${tgt} MISSING`;
      }
      rows.push(row);
    }
  }
  console.table(rows);
  return rows;
}

/**
 * The namespace as published today (one tick after `ready`, entry): the same keys and functions.
 * `battleMedic` and `installBattleMedic` are Battle Medic's (battle-medic.mjs, via ctx.exposed).
 */
export function legacyApi(ctx) {
  return {
    rules: core.RULES, featuresOf, report, setType, retireManual,
    installBattleMedic: ctx.exposed.installBattleMedic,
    battleMedic: ctx.exposed.runBattleMedic,
    spendHitDie, restoreHitDie, hdPools,
    preview: (formula, opts) => core.transformFormula(formula, { isType, ...opts }),
    core
  };
}
