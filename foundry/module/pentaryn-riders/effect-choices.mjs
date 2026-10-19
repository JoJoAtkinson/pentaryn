/**
 * Pick-one passive effects (feedback tNdOEx, tiDvFa: the Transmuter's Stone).
 * ===========================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). Pure rules in core/choices.mjs.
 *
 * A feature whose holder picks one benefit and may change it (the Transmuter's Stone: Darkvision,
 * +10 ft Speed, or Resistance to one damage type) is authored as one passive effect per benefit
 * on the feature item, each flagged `flags.pentaryn-riders.choice = { group, max }`. The player
 * toggles them in the sheet's Effects tab (Passive); turning one on turns off the others of its
 * group beyond `max` (the longest-unchanged first), so the stone never grants two benefits at
 * Wizard 6 and no hand edit of senses, speed or resistances is needed. Effects without the flag are
 * never touched: the data is the switch, so there is no setting.
 *
 * Who writes: only the clients of the user who made the toggle (`userId === game.user.id`); the
 * GM's two tabs (browser + bridge) may both write, the same idempotent `disabled: true`. Row dnd5e-riders-effect-choices.
 */

import { MODULE } from "./riders-core.mjs";
import { choiceLimit, choiceOf, choiceToDisable } from "./core/choices.mjs";

let log = null;

/** The limit for one effect's group: a number, or a formula over its actor's roll data. */
function limitFor(choice, effect) {
  return choiceLimit(choice.max, formula => {
    const parent = effect.parent;
    const actor = parent?.documentName === "Actor" ? parent : parent?.actor;
    const data = actor?.getRollData?.() ?? {};
    const simplify = globalThis.dnd5e?.utils?.simplifyBonus;
    if (simplify) return simplify(formula, data, { strict: true });
    return NaN;   // no evaluator: choiceLimit falls back to 1
  });
}

function modifiedAt(e) {
  return Number(e?._stats?.modifiedTime ?? e?.system?._stats?.modifiedTime) || 0;
}

function onUpdate(effect, changes, options, userId) {
  try {
    if (userId !== game.user?.id) return;
    if (!changes || changes.disabled !== false) return;      // only a turn-on
    const choice = choiceOf(effect, MODULE);
    if (!choice) return;
    const parent = effect.parent;
    const siblings = [...(parent?.effects ?? [])].map(e => ({
      id: e.id, group: choiceOf(e, MODULE)?.group ?? null, disabled: !!e.disabled, modified: modifiedAt(e),
    }));
    const off = choiceToDisable(effect.id, siblings, choice.group, limitFor(choice, effect));
    if (!off.length) return;
    // Async work leaves the listener (blueprint §5.9). Idempotent: a second tab on the same
    // account (the GM's bridge tab) writes the same `disabled: true`.
    void parent.updateEmbeddedDocuments("ActiveEffect", off.map(_id => ({ _id, disabled: true })), { pentarynRidersChoice: true })
      .then(() => log.debug?.(`choice ${choice.group}: ${effect.name} on, ${off.length} off`),
        err => log.warn("effect choice: turning the others off failed", err));
  } catch (err) { log.warn("effect choice skipped", err); }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("updateActiveEffect", onUpdate, { guard: false, label: "effect choices" });
}

export function uninstall() {}
