/**
 * Pentaryn Combat — the pure core (a barrel since guide S12).
 *
 * Nothing here touches Foundry: every function takes plain data (actor/weapon "shapes" built by the
 * adapters) and returns plain data. `node test/run.mjs` imports it, and each core/*.mjs, bare: that
 * is itself the proof that it stays pure. This file holds the blueprint constants, the literal i18n
 * key tables and the event rows; the rules live by topic and are re-exported unchanged:
 *
 *   core/identity.mjs     normalizeName, slugify, featureSet
 *   core/count.mjs        attackCount (Extra Attack and friends)
 *   core/weapons.mjs      canSwing, off-hand / Light / Nick partners, extraSwings, defaultWeapon, mainMode,
 *                         weaponSetSeed / shouldSeed, offhandVia
 *   core/sequence.mjs     planSequence, sequenceReducer, stripNumbers, planSummary, pausedNote,
 *                         replanExtras, fullAttackPlanFrom
 *   core/turn.mjs         the turn flag: turnKey, readTurn, record*, swingsLeft, pipState, pipFor,
 *                         spentPips, reactionSpent, stale / orphan combat flags
 *   core/followups.mjs    followUps, poleStrikeOpen, hideOffhandSlot
 *   core/turn-riders.mjs  TURN_RIDERS, ridersFor, riderEligibility, riderDice, tidyDiceCount, Reckless,
 *                         hintCodes, riderRolled
 *   core/damage.mjs       damageBonuses (TWF / GWM fallback), Steady Aim, damageAtZero
 *   core/multiattack.mjs  parseMultiattack, multiattackPlan, overridePlan
 *   core/turnflow.mjs     Argon's special actions, expiringAt, portraitExtras, orphanUsage, turnBoundary,
 *                         hudFollowPlan, deltasConsumed, areaPlacementSkipped
 *   core/layout.mjs       dockRect, swingTag, drawerLeft, clampToView
 *   core/timing.mjs       DELAYS: every timer delay, named (combat-riders-37)
 */

/* ── identity (blueprint constants; one MODULE for every file) ──────────────── */

export const MODULE = "pentaryn-combat";
export { MODULE as MOD };                  // game.pentaryn.combat.core.MOD stays readable for macros
export const SHORT = "combat";
export const NS = "combat";                // game.pentaryn.combat
export const VERSION = "0.3.0";            // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-combat/api@1";
export const I18N = "PENTARYN_COMBAT";
export const CSS = "pc-";
/**
 * Every i18n key the code used to build from a template (FollowUp + "." + kind), written
 * out literally so each one is a definite reference for the i18n gate (C35, combat-riders-28). Read
 * through `keyFor(family, value)`, which falls back to the old template's string for a value the
 * table lacks, so the rendered text is unchanged either way.
 */
export const I18N_KEYS = Object.freeze({
  FollowUp: Object.freeze({
    offhand: "PENTARYN_COMBAT.FollowUp.offhand",
    nick: "PENTARYN_COMBAT.FollowUp.nick",
    flurry: "PENTARYN_COMBAT.FollowUp.flurry",
    "martial-arts": "PENTARYN_COMBAT.FollowUp.martial-arts",
    hew: "PENTARYN_COMBAT.FollowUp.hew",
    "pole-strike": "PENTARYN_COMBAT.FollowUp.pole-strike",
  }),
  FollowUpText: Object.freeze({
    offhand: "PENTARYN_COMBAT.FollowUpText.offhand",
    "offhand-dual-wielder": "PENTARYN_COMBAT.FollowUpText.offhand-dual-wielder",
    nick: "PENTARYN_COMBAT.FollowUpText.nick",
    flurry: "PENTARYN_COMBAT.FollowUpText.flurry",
    "martial-arts": "PENTARYN_COMBAT.FollowUpText.martial-arts",
    hew: "PENTARYN_COMBAT.FollowUpText.hew",
    "pole-strike": "PENTARYN_COMBAT.FollowUpText.pole-strike",
  }),
  Kind: Object.freeze({
    nick: "PENTARYN_COMBAT.Kind.nick",
    offhand: "PENTARYN_COMBAT.Kind.offhand",
    bonus: "PENTARYN_COMBAT.Kind.bonus",
    main: "PENTARYN_COMBAT.Kind.main",
    "pole-strike": "PENTARYN_COMBAT.Kind.pole-strike",
  }),
  "Rider.Name": Object.freeze({
    "sneak-attack": "PENTARYN_COMBAT.Rider.Name.sneak-attack",
    frenzy: "PENTARYN_COMBAT.Rider.Name.frenzy",
    "colossus-slayer": "PENTARYN_COMBAT.Rider.Name.colossus-slayer",
    "divine-strike": "PENTARYN_COMBAT.Rider.Name.divine-strike",
  }),
  "Rider.Rule": Object.freeze({
    "sneak-attack": "PENTARYN_COMBAT.Rider.Rule.sneak-attack",
    frenzy: "PENTARYN_COMBAT.Rider.Rule.frenzy",
    "colossus-slayer": "PENTARYN_COMBAT.Rider.Rule.colossus-slayer",
    "divine-strike": "PENTARYN_COMBAT.Rider.Rule.divine-strike",
  }),
  "Rider.Check": Object.freeze({
    advantage: "PENTARYN_COMBAT.Rider.Check.advantage",
    ally: "PENTARYN_COMBAT.Rider.Check.ally",
    noDisadvantage: "PENTARYN_COMBAT.Rider.Check.noDisadvantage",
    raging: "PENTARYN_COMBAT.Rider.Check.raging",
    reckless: "PENTARYN_COMBAT.Rider.Check.reckless",
  }),
  "Rider.Mode": Object.freeze({
    ask: "PENTARYN_COMBAT.Rider.Mode.ask",
    auto: "PENTARYN_COMBAT.Rider.Mode.auto",
  }),
  "Rider.ToggleHint": Object.freeze({
    ask: "PENTARYN_COMBAT.Rider.ToggleHint.ask",
    auto: "PENTARYN_COMBAT.Rider.ToggleHint.auto",
  }),
  "Reckless.State": Object.freeze({
    on: "PENTARYN_COMBAT.Reckless.State.on",
    off: "PENTARYN_COMBAT.Reckless.State.off",
  }),
  "Reckless.Hint": Object.freeze({
    on: "PENTARYN_COMBAT.Reckless.Hint.on",
    off: "PENTARYN_COMBAT.Reckless.Hint.off",
  }),
  "Strip.Action": Object.freeze({
    normal: "PENTARYN_COMBAT.Strip.Action.normal",
    advantage: "PENTARYN_COMBAT.Strip.Action.advantage",
    disadvantage: "PENTARYN_COMBAT.Strip.Action.disadvantage",
    critical: "PENTARYN_COMBAT.Strip.Action.critical",
  }),
  "Strip.PausedNote": Object.freeze({
    main: "PENTARYN_COMBAT.Strip.PausedNote.main",
    flurry: "PENTARYN_COMBAT.Strip.PausedNote.flurry",
    bonus: "PENTARYN_COMBAT.Strip.PausedNote.bonus",
  }),
  "Turn.Effect": Object.freeze({
    dash: "PENTARYN_COMBAT.Turn.Effect.dash",
    disengage: "PENTARYN_COMBAT.Turn.Effect.disengage",
  }),
  "Turn.EffectText": Object.freeze({
    dash: "PENTARYN_COMBAT.Turn.EffectText.dash",
    disengage: "PENTARYN_COMBAT.Turn.EffectText.disengage",
  }),
});

/** `I18N_KEYS[family][value]`, else the key the template used to build (same string, so the same text). */
export function keyFor(family, value) {
  return I18N_KEYS[family]?.[value] ?? `${I18N}.${family}.${value}`;
}

/**
 * The module's own events, fired by ctx.emit (guide S9, combat-riders-14). Each also fires under its
 * pre-blueprint name (`legacyName`, new name first) until `until`; after that the kit warns once.
 * None is vetoable. hud/bars.mjs listens on the legacy names until then (they fire exactly once too).
 */
const UNTIL = "pentaryn-combat 0.4.0";
export const HOOKS = Object.freeze({
  usage: Object.freeze({ name: "pentaryn-combat.usage", legacyName: "pentarynCombat.usage", until: UNTIL, pre: false, args: "(activity, kind) — the runner used the item (one usage card per item per sequence)" }),
  offhand: Object.freeze({ name: "pentaryn-combat.offhand", legacyName: "pentarynCombat.offhand", until: UNTIL, pre: false, args: "(actor, { bySequence }) — an off-hand swing was rolled" }),
  bonusSpent: Object.freeze({ name: "pentaryn-combat.bonusSpent", legacyName: "pentarynCombat.bonusSpent", until: UNTIL, pre: false, args: "(actor, kind) — a swing or follow-up spent the Bonus Action" }),
  bonusAction: Object.freeze({ name: "pentaryn-combat.bonusAction", legacyName: "pentarynCombat.bonusAction", until: UNTIL, pre: false, args: "(actor, activity) — a Bonus-action feature or spell was used on your turn" }),
  reaction: Object.freeze({ name: "pentaryn-combat.reaction", legacyName: "pentarynCombat.reaction", until: UNTIL, pre: false, args: "(actor, activity) — a Reaction was used (any turn)" }),
  otherAction: Object.freeze({ name: "pentaryn-combat.otherAction", legacyName: "pentarynCombat.otherAction", until: UNTIL, pre: false, args: "(actor, activity) — a non-attack Action was taken on your turn" }),
  sequenceEnd: Object.freeze({ name: "pentaryn-combat.sequenceEnd", legacyName: "pentarynCombat.sequenceEnd", until: UNTIL, pre: false, args: "(actor) — a Full Attack or follow-up sequence ended" }),
});

/* ── the rules, by topic (guide S12: contents moved unchanged) ─────────────── */

import {
  featureSet, normalizeName, slugify
} from "./core/identity.mjs";
import {
  attackCount
} from "./core/count.mjs";
import {
  canSwing, defaultWeapon, extraSwings, lightTrigger, mainMode, nickCapable, offhandCapable,
  offhandVia, partnerWeapon, shouldSeed, weaponSetSeed
} from "./core/weapons.mjs";
import {
  fullAttackPlanFrom, pausedNote, planSequence, planSummary, replanExtras, sequenceReducer,
  stripNumbers
} from "./core/sequence.mjs";
import {
  ATTACK_ACTION_KINDS, actionsLeft, attackActions, classifySwing, freshTurn, orphanCombatFlags,
  otherActionsOf, pickCombat, pipFor, pipState, reactionSpent, readTurn, recordBonusAction,
  recordFollowUp, recordKill, recordOtherAction, recordQuickened, recordQuickenedCast, recordSurge,
  recordSwing, setRider, spentPips, staleCombatFlags, swingsLeft, turnKey, pruneOlder
} from "./core/turn.mjs";
import {
  followUps, hideOffhandSlot, poleStrikeOpen
} from "./core/followups.mjs";
import {
  RECKLESS_CHANGE, TURN_RIDERS, hintCodes, isRecklessEffect, recklessChanges, riderByKey,
  riderDice, riderEligibility, riderRolled, ridersFor, tidyDiceCount
} from "./core/turn-riders.mjs";
import {
  damageAtZero, damageBonuses, steadyAimAfterAttack, steadyAimChanges
} from "./core/damage.mjs";
import {
  multiattackPlan, overridePlan, parseMultiattack
} from "./core/multiattack.mjs";
import {
  MOVEMENT_KEYS, SPECIAL_ACTIONS, areaPlacementSkipped, dashChanges, deltasConsumed, expiringAt,
  hudFollowPlan, orphanUsage, portraitExtras, recordSpecialAction, specialActionOf, turnBoundary
} from "./core/turnflow.mjs";
import {
  clampToView, dockRect, drawerLeft, swingTag
} from "./core/layout.mjs";
import {
  DELAYS
} from "./core/timing.mjs";

export {
  featureSet, normalizeName, slugify, attackCount, canSwing, defaultWeapon, extraSwings,
  lightTrigger, mainMode, nickCapable, offhandCapable, offhandVia, partnerWeapon, shouldSeed,
  weaponSetSeed, fullAttackPlanFrom, pausedNote, planSequence, planSummary, replanExtras,
  sequenceReducer, stripNumbers, attackActions, classifySwing, freshTurn, orphanCombatFlags,
  otherActionsOf, pickCombat, pipFor, pipState, reactionSpent, readTurn, recordBonusAction,
  recordFollowUp, recordKill, recordOtherAction, recordQuickened, recordQuickenedCast, recordSurge,
  recordSwing, setRider, spentPips, staleCombatFlags, swingsLeft, turnKey, followUps,
  hideOffhandSlot, poleStrikeOpen, RECKLESS_CHANGE, TURN_RIDERS, hintCodes, isRecklessEffect,
  recklessChanges, riderByKey, riderDice, riderEligibility, riderRolled, ridersFor, tidyDiceCount,
  damageAtZero, damageBonuses, steadyAimAfterAttack, steadyAimChanges, multiattackPlan,
  overridePlan, parseMultiattack, SPECIAL_ACTIONS, actionsLeft, areaPlacementSkipped, dashChanges,
  deltasConsumed, expiringAt, hudFollowPlan, orphanUsage, portraitExtras, recordSpecialAction,
  specialActionOf, turnBoundary, clampToView, dockRect, drawerLeft, swingTag, pruneOlder, DELAYS,
  ATTACK_ACTION_KINDS, MOVEMENT_KEYS
};
