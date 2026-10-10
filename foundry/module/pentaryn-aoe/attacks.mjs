/**
 * Part C — "the damage isn't being rolled".
 *
 * Nothing in dnd5e was broken: 5.x and 6.x post the attack roll as its own message (type "attack")
 * and leave the Damage button on the usage card above it, so a player who only clicks Attack never rolls
 * damage. With autoDamageOnHit on, the roller's own client rolls damage straight after a hit
 * (or after any attack whose target AC it can't know), exactly as clicking Damage would.
 * A known miss or a natural 1 rolls nothing. The manual Damage button stays.
 */

import { shouldAutoDamage } from "./core.mjs";
import { setting } from "./settings.mjs";
import { on, guard } from "./hooks.mjs";

export async function onPostRollAttack(rolls, { subject } = {}) {
  if (!setting("autoDamageOnHit") || subject?.type !== "attack") return;
  const roll = rolls?.[0];
  if (!roll) return;
  const decision = shouldAutoDamage({
    total: roll.total, target: roll.options?.target, isCritical: roll.isCritical, isFumble: roll.isFumble
  });
  if (!decision || !subject.damage?.parts?.length) return;

  // dnd5e 6: the attack message is the roll's parent (BasicRoll.buildPost sets it); the scan is
  // the fallback for a roll that lost it.
  const attackMsg = (roll.parent?.type === "attack" ? roll.parent : null) ?? game.messages.contents.slice(-10).reverse()
    .find(m => m.type === "attack" && m.system?.activity?.uuid === subject.uuid);
  const attackMode = roll.options?.attackMode ?? attackMsg?.system?.mode ?? undefined;
  const ammoId = roll.options?.ammunition ?? attackMsg?.system?.ammunition;
  const ammunition = ammoId ? subject.actor?.items.get(ammoId) : undefined;
  // Thread the damage roll under the same usage card, as the Damage button would. The live
  // system.origin is the resolved message; the source holds its id.
  const origin = roll.options?.originatingMessage ?? attackMsg?._source?.system?.origin ?? null;
  const message = origin ? { data: { system: { origin } } } : {};
  return subject.rollDamage({ attackMode, ammunition, isCritical: roll.isCritical }, { configure: false }, message);
}

export function installAttacks() {
  on("dnd5e.postRollAttack", guard("postRollAttack", onPostRollAttack));
}
