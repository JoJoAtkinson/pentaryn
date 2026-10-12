/**
 * Pentaryn Combat core — attack count: how many swings the Attack action gives.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

const EXTRA_ATTACK = Object.freeze([
  ["three-extra-attacks", 4],
  ["two-extra-attacks", 3],
  ["extra-attack", 2]
]);

/**
 * How many swings the Attack action gives with this weapon. Highest wins, never summed across
 * classes (the rule is "attack twice", not "+1").
 *
 * @param {object} actor   { features: Set|string[], override?: number, multiattack?: {total} }
 * @param {object} [weapon] { pactWeapon?: bool, ability?: string, loading?: bool }
 */
export function attackCount(actor = {}, weapon = null) {
  const override = Number(actor.override);
  if (Number.isInteger(override) && override >= 1) return override;
  const feats = actor.features instanceof Set ? actor.features : new Set(actor.features ?? []);
  let n = 1;
  for (const [id, count] of EXTRA_ATTACK) if (feats.has(id)) { n = Math.max(n, count); break; }
  if (feats.has("thirsting-blade") && weapon && (weapon.pactWeapon || weapon.ability === "cha")) n = Math.max(n, 2);
  if (actor.multiattack?.total >= 2) n = Math.max(n, actor.multiattack.total);
  // Loading (2024 PHB): one piece of ammunition per action, "regardless of the number of attacks you
  // can normally make" — unless Crossbow Expert ignores Loading. NPC Multiattack text already says.
  if (weapon?.loading && !feats.has("crossbow-expert") && !(actor.multiattack?.total >= 2)) n = 1;
  return n;
}
