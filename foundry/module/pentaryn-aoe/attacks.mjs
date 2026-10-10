/**
 * Part C — "the damage isn't being rolled".
 *
 * Nothing in dnd5e was broken: 5.x posts the attack roll as its own message and leaves the
 * Damage button on the usage card above it, so a player who only clicks Attack never rolls
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

  const attackMsg = game.messages.contents.slice(-10).reverse()
    .find(m => m.flags?.dnd5e?.roll?.type === "attack" && m.flags?.dnd5e?.activity?.uuid === subject.uuid);
  const attackMode = roll.options?.attackMode ?? attackMsg?.flags?.dnd5e?.roll?.attackMode;
  const ammoId = roll.options?.ammunition ?? attackMsg?.flags?.dnd5e?.roll?.ammunition;
  const ammunition = ammoId ? subject.actor?.items.get(ammoId) : undefined;
  // Thread the damage roll under the same usage card, as the Damage button would.
  const origin = attackMsg?.flags?.dnd5e?.originatingMessage ?? null;
  const message = origin ? { "data.flags.dnd5e.originatingMessage": origin } : {};
  return subject.rollDamage({ attackMode, ammunition, isCritical: roll.isCritical }, { configure: false }, message);
}

export function installAttacks() {
  on("dnd5e.postRollAttack", guard("postRollAttack", onPostRollAttack));
}
