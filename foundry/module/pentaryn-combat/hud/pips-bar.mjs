/**
 * The pips each kind of use spends on Argon's bars (ui, setting spellPips / bonusPip / offhandPip):
 * the Bonus, Action and Reaction pips Argon's item buttons never spent, and the repaint on a re-bound
 * HUD or a new round. Handlers only; hud/bars.mjs registers them in its own order (the hooks golden).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { combatContext, turnOf } from "../shapes.mjs";
import { itemButtonClass, mainPanel } from "../argon.mjs";

const log = makeLog(MODULE);

// The sequence used the item directly, not Argon's button: spend the pip Argon would have.
export const onUsage = (activity, kind) => {
  try {
    if (kind !== "main") return;
    const action = mainPanel("DND5E.Action");
    if (action?._pentarynPips?.()) return;        // our pips count this actor's swings
    itemButtonClass()?.consumeActionEconomy?.(activity);
  } catch (err) { log.warn("action economy", err); }
};

// Out of combat Argon shows no pips and never resets them, so nothing is marked there.
export const onBonusSpent = (actor) => {
  if (!setting("offhandPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const bonus = mainPanel("DND5E.BonusAction");
  if (!bonus) return;
  bonus.isActionUsed = true;
  bonus.updateActionUse();
};

// A Bonus-action feature or spell used on your turn (Rage, Steady Aim, Divine Smite…): Argon's item
// buttons never spent its pip (setting bonusPip; the turn flag was written in counting.mjs).
export const onBonusAction = (actor) => {
  if (!setting("bonusPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const bonus = mainPanel("DND5E.BonusAction");
  if (!bonus) return;
  bonus.isActionUsed = true;
  bonus.updateActionUse();
};

// A spell or feature that is an Action (Fire Bolt, Fireball, Magic): Argon's item buttons never spent its
// single Action pip (usability Area 5 re-run, S5). With 2+ swings our own pips already count it.
export const onOtherAction = (actor) => {
  if (!setting("spellPips") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const action = mainPanel("DND5E.Action");
  if (!action || action._pentarynPips?.()) return;
  action.isActionUsed = true;
  action.updateActionUse();
};

// A Reaction (Counterspell, Shield…), on any turn (S14).
export const onReaction = (actor) => {
  if (!setting("spellPips") || actor !== ui.ARGON?._actor) return;
  const reaction = mainPanel("DND5E.Reaction");
  if (!reaction) return;
  reaction.isActionUsed = true;
  reaction.updateActionUse();
};

/**
 * A re-bound HUD builds new panels with every pip lit, and Argon lights every pip at a new round
 * (S5: "the Bonus pip display reset by itself"). Repaint Argon's own Action / Bonus / Reaction pips
 * from the turn flag and the Reaction flag.
 */
function restorePips(actor) {
  if (!setting("spellPips") || !actor || actor !== ui.ARGON?._actor) return;
  const ctx = combatContext(actor);
  if (!ctx.inCombat) return;
  const reaction = mainPanel("DND5E.Reaction");
  if (reaction && core.reactionSpent(actor.getFlag(MODULE, "reaction"), ctx.combat?.id) && !reaction.isActionUsed) {
    reaction.isActionUsed = true;
    reaction.updateActionUse();
  }
  if (!ctx.isOwnTurn) return;
  const spent = core.spentPips(turnOf(actor));
  const action = mainPanel("DND5E.Action");
  if (action && !action._pentarynPips?.() && spent.action && !action.isActionUsed) { action.isActionUsed = true; action.updateActionUse(); }
  const bonus = mainPanel("DND5E.BonusAction");
  if (bonus && spent.bonus && !bonus.isActionUsed) { bonus.isActionUsed = true; bonus.updateActionUse(); }
}

export const onPanelRenderedPips = (panel) => {
  if (!["DND5E.Action", "DND5E.BonusAction", "DND5E.Reaction"].includes(panel?.label)) return;
  try { restorePips(ui.ARGON?._actor); } catch (err) { log.debug("restore pips", err); }   // never break Argon's render
};
// Argon's own updateCombat handler (registered after ours) relights every pip at a new round.
export const onRoundPips = (combat, changes) => {
  if (!("round" in changes)) return;
  setTimeout(() => { try { restorePips(ui.ARGON?._actor); } catch (err) { log.debug("restore pips (HUD closed)", err); } }, core.DELAYS.afterArgon);
};

// An off-hand swing clicked through Argon's weapon slot made Argon grey the Action pip (the weapon's
// activation is `action`); give it back when no Action was taken. A sequence swing never greyed it.
export const onOffhand = (actor, { bySequence = false } = {}) => {
  if (bySequence || !setting("offhandPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const action = mainPanel("DND5E.Action");
  if (!action || action._pentarynPips?.()) return;
  const turn = turnOf(actor);
  if (turn.attackAction.swings === 0 && core.otherActionsOf(turn) === 0) {
    action.isActionUsed = false;
    action.updateActionUse();
  }
};
