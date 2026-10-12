/**
 * dnd5e roll and usage windows → plain answers (adapter). One copy of the lookups that strip.mjs,
 * turnflow/dialogs.mjs, turnflow/manual-dice.mjs and sequence.mjs each had (combat-riders-5).
 */

import * as core from "./combat-core.mjs";

/** The newest (highest z-index) open dnd5e roll window's element, or null. */
export function topRollWindow() {
  const open = [...document.querySelectorAll(".application.roll-configuration")];
  return open.sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0))[0] ?? null;
}

/**
 * The dnd5e roll window a focused element sits in. `buttonOnly` (the strip's Esc): only a focused
 * button counts — text fields and selects keep their native Esc. Otherwise, with nothing focused
 * (the dialog opened under the cursor without taking focus), the newest roll window.
 */
export function rollDialogOf(target, { buttonOnly = false } = {}) {
  if (buttonOnly && !(target instanceof HTMLButtonElement)) return null;
  const host = target?.closest?.(".application.roll-configuration");
  if (host) return foundry.applications.instances.get(host.id) ?? null;
  if (buttonOnly) return null;
  if (target && target !== document.body && target !== document.documentElement) return null;
  const top = topRollWindow();
  return top ? foundry.applications.instances.get(top.id) ?? null : null;
}

/** Every open Roll Resolution (manual dice) application. */
export function openRollResolvers() {
  const R = foundry.applications?.dice?.RollResolver;
  if (!R) return [];
  return [...(foundry.applications.instances?.values?.() ?? [])].filter(app => app instanceof R);
}

/**
 * A usage card left with nothing rolled under it and nothing consumed (a cancelled attack's card,
 * or one a stopped sequence posted): delete it? `sequence`: a Full Attack is still running and may
 * use it yet. The one decision both tidy paths make (combat-riders-5).
 */
export function isOrphanCard(msg, { sequence = false } = {}) {
  const rolled = game.messages.contents.some(m => m.id !== msg.id && ((m.system?.origin?.id ?? m.system?.origin) === msg.id));
  return core.orphanUsage({
    mine: msg.author?.id === game.user.id, ageMs: Date.now() - (msg.timestamp ?? 0), rolled,
    consumed: core.deltasConsumed(msg.system?.deltas), sequence
  });
}
