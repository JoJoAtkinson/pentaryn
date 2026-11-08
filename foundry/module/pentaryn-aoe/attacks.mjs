/**
 * Part C — "the damage isn't being rolled".
 *
 * Nothing in dnd5e was broken: 5.x and 6.x post the attack roll as its own message (type "attack")
 * and leave the Damage button on the usage card above it, so a player who only clicks Attack never rolls
 * damage. With autoDamageOnHit on, the roller's own client rolls damage straight after a hit
 * (or after any attack whose target AC it can't know), exactly as clicking Damage would.
 * A known miss or a natural 1 rolls nothing. The manual Damage button stays.
 *
 * J1 (feedback fs7q6K, Psionic Lash): a save activity has the same gap — Use posts the card, and the
 * damage waits for a Damage click. With autoDamageOnSave on, using a save activity that has damage
 * and at least one recorded target rolls its damage at once on the user's own client, threaded under
 * the usage card with the card's targets, exactly as the card's Damage button would. Part B then
 * builds the GM tray from those targets. A save spell that places an area is left alone (its damage
 * is rolled once the area is down), and a use with no target posts nothing extra.
 */

import { shouldAutoDamage, shouldAutoDamageOnUse } from "./core.mjs";
import { setting } from "./settings.mjs";

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

/** The targets the usage card recorded (dnd5e 6 `system.targets`; the data form when the card was not created). */
const usageTargets = results => results?.message?.system?.targets ?? results?.message?.data?.system?.targets ?? [];

/**
 * J1: dnd5e.postUseActivity on the using client. Returns nothing (never a veto); refund's own
 * listener (Part F) is the one that may return false for a cancelled area, and an area activity is
 * skipped here anyway.
 */
export async function onPostUseActivity(activity, usageConfig, results) {
  if (!setting("autoDamageOnSave") || !activity) return;
  const targets = usageTargets(results);
  const go = shouldAutoDamageOnUse({
    type: activity.type, damageParts: activity.damage?.parts?.length ?? 0, targets: targets.length,
    template: activity.target?.template?.type ?? null
  });
  if (!go) return;
  // The usage card's id threads the damage under it, as the card's Damage button does (SaveActivity
  // #rollDamage passes the card's targets the same way), so Part B and dnd5e's outcomes agree.
  const origin = results?.message?.id ?? null;
  const message = { data: { system: { ...(origin ? { origin } : {}), targets } } };
  return activity.rollDamage({ event: usageConfig?.event }, { configure: false }, message);
}

export function install(reg) {
  reg.on("dnd5e.postRollAttack", reg.guardSwallowAsync("postRollAttack", onPostRollAttack), { guard: false, label: "postRollAttack" });
  reg.on("dnd5e.postUseActivity", reg.guardSwallowAsync("postUseActivity(save)", onPostUseActivity), { guard: false, label: "postUseActivity(save)" });
}

export function uninstall() {}
