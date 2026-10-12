/**
 * Pentaryn Combat — the API manifest (game.pentaryn.combat). PURE DATA: node imports it without a
 * Foundry stub, describe() reports it, and buildApi() refuses to load when it and the
 * implementations (api.mjs, plus the features' contributions) drift apart.
 *
 * The 22 legacy members keep their signatures and their order (`legacy: true`): their first param is
 * an `actor` (an Actor document), not a resolved `ref`, until S11 (declared D-c2). The runner
 * (sequence.mjs), the riders (turn-riders.mjs) and the weapon-set seed (offhand.mjs) contribute their
 * implementations from install(); the API never imports a feature. `core` is the pure core, published
 * as a frozen copy (`unlisted`). The new reads take a `ref` (Actor, Token, UUID, id or exact name).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./combat-core.mjs";

const ACTOR = { name: "actor", type: "Actor", resolve: false, doc: "an Actor document (legacy rows resolve no ref until S11)" };
const WEAPON = { name: "weaponId", type: "string", optional: true, doc: "an item id; default: the remembered weapon, else the active set's primary, else the first equipped melee weapon" };
const REF = { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" };
const RIDER = { name: "key", type: '"sneak-attack"|"frenzy"|"colossus-slayer"|"divine-strike"' };

const TURN = "flags.pentaryn-combat.turn";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    /* what the HUD shows */
    { path: "count", params: [ACTOR, WEAPON], returns: "number", gm: false, writes: false, legacy: true,
      doc: "How many swings the Attack action gives this actor with that weapon (Extra Attack, a Multiattack's total, a flag override)." },
    { path: "plan", params: [ACTOR, WEAPON], returns: "{ swings: {weaponId, mode, kind}[], count, left, weaponId }", gm: false, writes: false, legacy: true,
      doc: "The swings a Full Attack would make right now (left this turn in combat; the whole action out of combat)." },
    { path: "turn", params: [ACTOR], returns: "{ key, attackAction, riders, followUps, nick, bonusUsed, otherActions, surges, quickened }", gm: false, writes: false, legacy: true,
      doc: "This turn's flag (a fresh one when the stored flag is from another turn)." },
    { path: "newTurn", params: [ACTOR], returns: "Promise<Actor|null>", gm: false, writes: true, legacy: true, sideEffects: [TURN],
      nullWhen: "the caller does not own the actor",
      doc: "Out of combat: a fresh turn flag under the no-combat key (the Special bar's New turn)." },
    { path: "multiattack", params: [ACTOR], returns: "{ plan, total, groups, source } | null", gm: false, writes: false, legacy: true,
      nullWhen: "no Multiattack item (and no flags.pentaryn-combat.multiattack override), or it does not parse",
      doc: "The actor's parsed Multiattack (an NPC's or a Wild Shape form's)." },
    { path: "weapons", params: [ACTOR], returns: "weaponShape[]", gm: false, writes: false, legacy: true,
      doc: "Every item with an attack activity, as the plain weapon shapes the core reads." },
    { path: "offers", params: [{ name: "message", type: "ChatMessage", resolve: false }], returns: "{ actor, offers: {rider, activity, dice, state, offer, auto, checks}[], turn? }", gm: false, writes: false, legacy: true,
      doc: "The once-per-turn riders this attack card's actor has, with their eligibility on that card." },
    /* what a click does */
    { path: "fullAttack", params: [ACTOR, WEAPON, { name: "opts", type: "{ event?, title? }", optional: true }], returns: "Promise<{ rolled, status }>", gm: false, writes: true, legacy: true,
      sideEffects: [TURN, "flags.pentaryn-combat.last", "ChatMessage (usage card per item, one attack card per swing)"],
      doc: "Run the Full Attack plan: every swing through dnd5e's own roll dialog, with the swing strip." },
    { path: "followUp", params: [ACTOR, { name: "followUp", type: "{ kind, weaponId, count? }" }, { name: "opts", type: "{ event? }", optional: true }], returns: "Promise<{ rolled, status }>", gm: false, writes: true, legacy: true,
      sideEffects: [TURN, "ChatMessage"], doc: "One follow-up (Off-hand, Nick, Flurry of Blows, Martial Arts, Hew, Pole Strike) as the HUD button runs it." },
    { path: "rollRider", params: [{ name: "message", type: "ChatMessage", resolve: false }, RIDER], returns: "Promise<Roll[] | null>", gm: false, writes: true, legacy: true,
      sideEffects: [TURN, "ChatMessage (the rider's damage roll)"], nullWhen: "not the owner, an earlier turn's card, already used this turn, no rider activity",
      doc: "Roll one rider for one attack card (crit carried, damage type narrowed, threaded under the usage card)." },
    { path: "reckless", params: [ACTOR], returns: "boolean", gm: false, writes: false, legacy: true, doc: "Whether a Reckless Attack effect is live on the actor." },
    { path: "setReckless", params: [ACTOR, { name: "on", type: "boolean" }], returns: "Promise<boolean>", gm: false, writes: true, legacy: true,
      sideEffects: ["ActiveEffect (Reckless, flags.pentaryn-combat.reckless)"], doc: "Turn Reckless Attack on (the item's own effect plus Advantage on Strength attacks) or off." },
    { path: "running", params: [], returns: "{ actor, state, … } | null", gm: false, writes: false, legacy: true, nullWhen: "no sequence is running on this client",
      doc: "The sequence running on this client (live object; read only)." },
    { path: "abort", params: [{ name: "actor", type: "Actor", optional: true, resolve: false }], returns: "void", gm: false, writes: false, legacy: true,
      doc: "Stop the running sequence (of that actor, or any)." },
    /* per-user choices */
    { path: "quick", params: [], returns: "boolean", gm: false, writes: false, legacy: true, doc: "This user's quick mode (swings after the first skip the dialog)." },
    { path: "setQuick", params: [{ name: "on", type: "boolean" }], returns: "Promise<User>", gm: false, writes: true, legacy: true, sideEffects: ["flags.pentaryn-combat.quick (User)"],
      doc: "Set this user's quick mode." },
    { path: "riderMode", params: [RIDER], returns: '"ask" | "auto"', gm: false, writes: false, legacy: true, doc: "This user's mode for one rider." },
    { path: "setRiderMode", params: [RIDER, { name: "mode", type: '"ask"|"auto"' }], returns: "Promise<User>", gm: false, writes: true, legacy: true,
      sideEffects: ["flags.pentaryn-combat.riders.<key> (User)"], doc: "Set this user's mode for one rider." },
    /* GM */
    { path: "report", params: [{ name: "actorOrName", type: "Actor|string", optional: true, resolve: false }], returns: "{ actor, riders, turn, lastWeapon }[]", gm: true, writes: false, legacy: true,
      doc: "Audit: every character's riders, dice, this user's modes, turn flag and remembered weapon (also console.table)." },
    { path: "fixFeats", params: [ACTOR, { name: "opts", type: "{ apply? }", optional: true }], returns: "{ actor, plan, applied: false, reason, fallback }", gm: true, writes: false, legacy: true,
      doc: "Report what native dnd5e rule effects would replace the weaponBonuses fallback; apply is refused until proved." },
    { path: "seedWeaponSets", params: [ACTOR], returns: "Promise<object|null>", gm: true, writes: true, legacy: true, sideEffects: ["flags.enhancedcombathud.weaponSets"],
      nullWhen: "setting off, Argon inactive, not a character with a class, a flag already written",
      doc: "Fill an empty Argon weapon set 1/2 for one character (never overwrites)." },
    { path: "seedAll", params: [], returns: "Promise<{ actor, seed }[]>", gm: true, writes: true, legacy: true, sideEffects: ["flags.enhancedcombathud.weaponSets"],
      doc: "Active GM: seed every character with no weapon-set flag." },
    /* reads for an LLM caller (combat-riders-11, transform-creatures-13) */
    { path: "inspect", params: [REF, { name: "opts", type: "{ sceneId?, as? }", optional: true }],
      returns: "{ actor, key, inCombat, isOwnTurn, turn, stored, stale, plan, pips, spentPips, reaction, followUps, riders, reckless, running, settings }",
      gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"], since: "0.3.0",
      doc: "Read-only combat state for one actor, plain JSON, depth ≤ 4. followUps is computed without the Argon panel "
        + "(Bonus free = not spent on the turn flag), an approximation of the HUD. opts.as = a user ref: a viewer "
        + "without OBSERVER on the actor gets only actor, key, inCombat, isOwnTurn." },
    { path: "selftest", params: [], returns: "{ ok, checks: [{ label, ok, detail }] }", gm: false, writes: false, since: "0.3.0",
      doc: "Live smoke checks after a sync." },
    { path: "coversMultiattack", params: [REF], returns: "string | null", gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"], since: "0.3.0",
      nullWhen: "fullAttack or multiattack off, no parsed Multiattack item with 2+ swings (a flag override does not count)",
      doc: "The Multiattack item id when Full Attack runs this actor's Multiattack (transform hides that item's own button)." },
  ],
  flags: {
    writes: [
      TURN, "flags.pentaryn-combat.last", "flags.pentaryn-combat.reaction",
      "flags.pentaryn-combat.quick", "flags.pentaryn-combat.riders",
      "flags.pentaryn-combat.until", "flags.pentaryn-combat.special", "flags.pentaryn-combat.reckless",
      "flags.pentaryn-combat.swing", "flags.pentaryn-combat.turnKey", "flags.pentaryn-combat.auto",
      "flags.pentaryn-combat.rider", "flags.pentaryn-combat.attack", "flags.pentaryn-combat.undone",
      "flags.enhancedcombathud.weaponSets", "flags.dnd5e.last",
    ],
    reads: [
      "flags.pentaryn-combat.multiattack", "flags.pentaryn-combat.attacks", "flags.pentaryn-combat.pactWeapon",
      "flags.enhancedcombathud.weaponSets", "flags.enhancedcombathud.activeWeaponSet",
      "flags.dnd5e.enhancedDualWielding", "flags.dnd5e.isPolymorphed", "flags.dnd5e.summon", "flags.dnd5e.last",
      "flags.pentaryn-aoe.handle",
    ],
  },
  unlisted: ["core"],
});
