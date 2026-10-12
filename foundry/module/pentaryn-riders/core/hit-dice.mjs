/**
 * Pentaryn Feature Riders — PURE: Hit Dice pools, the Battle Medic gate and the report row
 * (combat-riders-26). Re-exported by the riders-core barrel. Plain data in, plain data out: the
 * glue (shapes.mjs, battle-medic.mjs, api.mjs) maps Documents to these inputs and localises.
 */

/** "d8" → 8; anything else → 0. */
const facesOf = denomination => Number(String(denomination ?? "").replace(/^d/, "")) || 0;

/**
 * The Hit Dice pools: an NPC has one (id null, from `attributes.hd`), a PC one per class.
 * @param {{ isNPC?: boolean, hd?: object|null, classes?: { id: string, hd?: object }[] }} p
 *   `hd` is `system.attributes.hd` (no hd → no pools at all, NPC or PC)
 * @returns {{ id: string|null, faces: number, value: number, spent: number }[]}
 */
export function hdPoolsFrom({ isNPC = false, hd = null, classes = [] } = {}) {
  if (!hd) return [];
  if (isNPC) return [{ id: null, faces: facesOf(hd.denomination), value: hd.value ?? 0, spent: hd.spent ?? 0 }];
  return (classes ?? []).map(c => ({
    id: c.id,
    faces: facesOf(c.hd?.denomination),
    value: c.hd?.value ?? 0,
    spent: c.hd?.spent ?? 0
  }));
}

/** `{ value, max }`: dice left, and left + spent. */
export function hdSummaryOf(pools) {
  return { value: (pools ?? []).reduce((a, p) => a + p.value, 0), max: (pools ?? []).reduce((a, p) => a + p.value + p.spent, 0) };
}

/**
 * Why Battle Medic cannot run right now, as an i18n key, or null. Checked in this order before dnd5e
 * spends the kit: a targeted creature, Hit Dice data, one die left, then — for a target the user does
 * not own — a GM online to write it.
 */
export function battleMedicBlockReason({ hasTargetActor = false, hasHd = false, canSpend = false, ownsTarget = false, gmOnline = false } = {}) {
  if (!hasTargetActor) return "PENTARYN_RIDERS.battleMedic.needTarget";
  if (!hasHd || !canSpend) return "PENTARYN_RIDERS.battleMedic.noHitDice";
  if (!ownsTarget && !gmOnline) return "PENTARYN_RIDERS.battleMedic.noGM";
  return null;
}

/**
 * One report row (the console `report()` and `inspect().rows`), from plain inputs.
 * @param {object} p
 * @param {string} p.actor            the actor's name
 * @param {string} p.rule             the rule key
 * @param {string[]} p.items          the matched items' names
 * @param {boolean} [p.typed]         a typed rule (Elemental Adept, Elemental Affinity)
 * @param {string[]|null} [p.types]   its resolved types
 * @param {number} [p.manual]         Elemental Affinity: damage activities still on the item(s)
 * @param {{ ability: string, spells: string[] }|null} [p.hand]  a rule that skips hand-added mods:
 *                                    the ability and the spells that already add it
 * @param {{ installed: boolean, kit: string|null, kitFound: boolean, kitName?: string }|null} [p.battleMedic]
 *                                    Healer: the Battle Medic activity, the kit item id it spends,
 *                                    whether the actor still has that item, and its name
 */
export function reportRow({ actor, rule, items = [], typed = false, types = null, manual = 0, hand = null, battleMedic = null } = {}) {
  const row = { actor, rule, items: items.join(", ") };
  if (typed) {
    row.types = (types ?? []).join(", ");
    row.status = (types ?? []).length ? "active" : "NO TYPE — setType(actor, 'fire')";
  } else row.status = "active";
  if (manual) row.manual = `${manual} +CHA activities left — retireManual(actor)`;
  if (hand?.spells?.length) row.handAdded = `${hand.spells.join(", ")} already add ${hand.ability.toUpperCase()} — rider skips them`;
  if (battleMedic) {
    const { installed, kit, kitFound, kitName } = battleMedic;
    row.battleMedic = !installed ? "not installed — installBattleMedic(actor)"
      : !kit ? "installed, no kit linked"
      : kitFound ? `installed, kit ${kitName}` : `installed, kit ${kit} MISSING`;
  }
  return row;
}
