/**
 * Pentaryn Combat
 * ===============
 *
 * Melee on the Argon HUD with fewer clicks and nothing taken away:
 *   Full Attack     one button runs every swing the Attack action gives (Extra Attack, Nick, an
 *                   NPC's or a Wild Shape form's Multiattack), each through dnd5e's own dialog.
 *   Swing pips      the Action pips count swings (2 → 1 → 0), also for weapons clicked by hand.
 *   Follow-ups      Off-hand / Nick / Flurry of Blows / Martial Arts / Hew as one click each, only
 *                   when the actor qualifies right now.
 *   Riders          "+ Sneak Attack 3d6" (and Frenzy, Colossus Slayer, Divine Strike) offered on
 *                   the attack card once per turn; auto mode per player.
 *   Corrections     off-hand mode reset and pip, TWF/GWM damage, empty weapon sets seeded.
 *
 *   combat-core.mjs  pure rules and state (node-tested)      shapes.mjs   Foundry → plain data, turn flag
 *   sequence.mjs     the swing loop                           strip.mjs    swing strip + weapon picker DOM
 *   hud.mjs          Argon bars                               riders.mjs   once-per-turn riders
 *   offhand.mjs      off-hand mode reset, weapon-set seed     settings.mjs world settings + user flags
 *
 * Design: context/plans/melee-streamlining.md · Use: README.md · Exposes game.pentaryn.combat.
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { registerSettings, setting, setQuickMode, quickMode, setRiderMode, riderMode } from "./settings.mjs";
import {
  weaponShape, weaponsOf, featuresOf, countFor, multiattackOf, combatContext, turnOf, updateTurn, newTurn,
  chosenWeapon
} from "./shapes.mjs";
import { taggedKind, forgetRoll, runSwings, runFollowUp, fullAttackPlan, running, abortFor } from "./sequence.mjs";
import { installRiders, report as riderReport, rollRider, offersFor, isReckless, setReckless } from "./riders.mjs";
import { installOffhand, resetOffhandMode, seedAll, seedWeaponSets } from "./offhand.mjs";


/* ── counting swings (every attack roll, sequence or by hand) ─────────────── */

/**
 * Per activity: the kind our sequence tagged its latest attack roll with (null for a roll made by
 * hand). Written in dnd5e.preRollAttackV2 — before the roll — so a damage roll that follows (aoe's
 * auto-damage fires inside postRollAttack, possibly before our own postRollAttack handler) never
 * reads the previous swing's kind; read by a Damage button clicked later (aoe auto-damage off).
 */
const lastTag = new Map();

/** This client's swings this turn, for kill detection: [{attacker, key, weaponId, targets: [actorUuid]}]. */
let mySwings = [];

function weaponLike(activity) {
  const cls = activity?.attack?.type?.classification;
  if (activity?.type !== "attack" || cls === "spell" || activity.item?.type === "spell") return false;
  return cls === "weapon" || cls === "unarmed" || activity.item?.type === "weapon";
}

/** What kind of swing an attack (or the damage after it) is: the sequence's tag, else the rules. */
function kindOf(activity, attackMode) {
  const actor = activity?.actor;
  const ctx = combatContext(actor);
  const tagged = ctx.isOwnTurn ? (taggedKind(activity.uuid) ?? lastTag.get(activity.uuid) ?? null) : null;
  return { ctx, tagged, kind: core.classifySwing({ tagged, activation: activity.activation?.type, attackMode, isOwnTurn: ctx.isOwnTurn, inCombat: ctx.inCombat }) };
}

function onPreRollAttack(config) {
  const activity = config?.subject;
  if (activity?.type === "attack" && activity.uuid) {
    lastTag.set(activity.uuid, taggedKind(activity.uuid));
    forgetRoll(activity.uuid);            // an expectRoll covers one roll only
  }
}

async function onPostRollAttack(rolls, { subject } = {}) {
  const activity = subject;
  const actor = activity?.actor;
  const roll = rolls?.[0];
  if (!actor || !roll || activity?.type !== "attack") return;
  const attackMode = roll.options?.attackMode ?? null;
  // Classify before the first await: the sequence's tag is only live while its rollAttack runs.
  // A spell attack is the Magic action, not the Attack action: counted once per cast in
  // onPostUseActivity (Scorching Ray's three rays are one action), never per roll here.
  const swing = weaponLike(activity) ? kindOf(activity, attackMode) : null;

  await resetOffhandMode(activity, attackMode).catch(err => console.warn(`${MODULE} | mode reset failed`, err));

  if (!swing || swing.kind === "other") return;
  const { ctx, kind, tagged } = swing;
  const weapon = activity.item;
  const melee = weapon ? weaponShape(weapon).melee && !String(attackMode ?? "").startsWith("thrown") && attackMode !== "ranged" : true;
  await updateTurn(actor, t => core.recordSwing(t, { kind, weaponId: weapon?.id, crit: !!roll.isCritical, melee }));

  if (kind === "offhand") Hooks.callAll("pentarynCombat.offhand", actor, { bySequence: !!tagged });
  if (kind === "offhand" || kind === "bonus") Hooks.callAll("pentarynCombat.bonusSpent", actor, kind);

  const msg = roll.parent ?? null;
  const targets = (msg?.system?.targets ?? []).map(t => t.actor).filter(Boolean);
  if (melee && targets.length) {
    mySwings = mySwings.filter(s => s.key === ctx.key);
    mySwings.push({ attacker: actor.uuid, key: ctx.key, weaponId: weapon?.id ?? null, targets });
  }
}

/**
 * A non-attack Action spends one Action's worth of swings; Action Surge adds an Action.
 * Multiattack (NPC) is the Attack action itself. A weapon attack is counted on its roll.
 */
async function onPostUseActivity(activity) {
  const actor = activity?.actor;
  if (!actor) return;
  const item = activity.item;
  const ident = item?.system?.identifier || core.slugify(item?.name ?? "");
  if (ident === "action-surge") {
    const ctx = combatContext(actor);
    if (ctx.inCombat && ctx.isOwnTurn) await updateTurn(actor, core.recordSurge);
    return;
  }
  // Quickened Spell (usability Area 5 re-run, S5): the next 1-Action spell this turn is the Bonus Action.
  if (ident === "quickened-spell") {
    const ctx = combatContext(actor);
    if (setting("quickenedSpell") && ctx.inCombat && ctx.isOwnTurn) await updateTurn(actor, core.recordQuickened);
    return;
  }
  // A Reaction (Counterspell, Shield, Hellish Rebuke…) spends the Reaction pip on any turn: Argon's
  // item buttons, which every spell in Cast Spell is, never spent it (usability Area 5 re-run, S14).
  if (activity.activation?.type === "reaction") {
    if (!setting("spellPips") || (activity.type === "attack" && weaponLike(activity))) return;
    const ctx = combatContext(actor);
    if (core.pipFor({ activation: "reaction", inCombat: ctx.inCombat, isOwnTurn: ctx.isOwnTurn }) !== "reaction") return;
    await actor.setFlag(MODULE, "reaction", { combatId: ctx.combat?.id ?? null }).catch(() => null);
    Hooks.callAll("pentarynCombat.reaction", actor, activity);
    return;
  }
  // A 1-Action spell after Quickened Spell: the Bonus Action, not an Action.
  if (activity.activation?.type === "action" && item?.type === "spell" && setting("quickenedSpell")) {
    const ctx = combatContext(actor);
    const pip = core.pipFor({ activation: "action", isSpell: true, quickened: !!turnOf(actor).quickened, inCombat: ctx.inCombat, isOwnTurn: ctx.isOwnTurn });
    if (pip === "bonus") {
      await updateTurn(actor, core.recordQuickenedCast);
      ui.notifications?.info?.(game.i18n.format("PENTARYN_COMBAT.Turn.QuickenedCast", { spell: item.name }));
      Hooks.callAll("pentarynCombat.bonusAction", actor, activity);
      return;
    }
  }
  // A Bonus-action feature or spell (Rage, Steady Aim, Divine Smite, Lay on Hands…) spends the
  // Bonus Action: Argon spends its pip only for buttons bound to an activity, and an item button
  // (most features) never did (usability Area 3). A Bonus-action attack is counted on its roll.
  if (activity.activation?.type === "bonus") {
    if (!setting("bonusPip") || (activity.type === "attack" && weaponLike(activity))) return;
    const ctx = combatContext(actor);
    if (!ctx.inCombat || !ctx.isOwnTurn) return;
    await updateTurn(actor, core.recordBonusAction);
    Hooks.callAll("pentarynCombat.bonusAction", actor, activity);
    return;
  }
  if (activity.activation?.type !== "action") return;
  if (activity.type === "attack" && weaponLike(activity)) return;   // counted on the roll
  if (/^multiattack\b/i.test(item?.name ?? "")) return;
  const ctx = combatContext(actor);
  if (!ctx.inCombat || !ctx.isOwnTurn) return;
  // Unarmed Strike's Grapple / Shove (a save activity) replaces one attack of the Attack action
  // (2024 PHB) — one swing, not a whole other Action.
  if (item?.type === "weapon" && weaponShape(item).unarmed && activity.type !== "attack") {
    await updateTurn(actor, t => core.recordSwing(t, { kind: "main", weaponId: item.id, melee: true }));
    return;
  }
  await updateTurn(actor, core.recordOtherAction);
  // Argon's single Action pip (an actor with one swing): its item buttons never spent it (Area 5 re-run, S5).
  Hooks.callAll("pentarynCombat.otherAction", actor, activity);
}

/** Hew: a creature one of my swings this turn targeted dropped to 0 HP. */
function onUpdateActor(target, changes) {
  const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (hp === undefined || hp > 0 || !mySwings.length) return;
  const hit = [...mySwings].reverse().find(s => s.targets.includes(target.uuid));
  if (!hit) return;
  const attacker = fromUuidSync(hit.attacker);
  if (!attacker || combatContext(attacker).key !== hit.key) return;
  updateTurn(attacker, t => core.recordKill(t, hit.weaponId));
}

/* ── always-on weapon damage (Two-Weapon Fighting, Great Weapon Master) ───── */

function onPreRollDamage(config) {
  if (!setting("weaponBonuses")) return;
  const activity = config?.subject;
  const actor = activity?.actor;
  const item = activity?.item;
  if (!actor || item?.type !== "weapon" || activity.type !== "attack" || !config.rolls?.[0]) return;
  const r0 = config.rolls[0];
  // The sequence's tag is live while its rollAttack runs (aoe's auto-damage fires inside it);
  // lastTag covers a Damage button clicked later; otherwise the rules decide (activation, mode, turn).
  const { ctx, kind } = kindOf(activity, config.attackMode ?? null);
  const add = core.damageBonuses({
    features: featuresOf(actor), weapon: weaponShape(item), attackMode: config.attackMode,
    mod: Number(r0.data?.mod ?? 0), isOwnTurn: ctx.isOwnTurn, kind
  });
  for (const a of add) r0.parts.push(a.part);
}

/* ── fixFeats: the native path, once proved ──────────────────────────────── */

/**
 * What native dnd5e 6 rule effects would replace the weaponBonuses fallback. Report-only until the
 * build's live check proves a `damage:bonus` change with a condition on attack mode / Heavy works
 * in 6.0.6 (plan §7.4); `{apply: true}` is refused until then.
 */
function fixFeats(actor, { apply = false } = {}) {
  const feats = featuresOf(actor);
  const plan = [];
  if (feats.has("two-weapon-fighting")) plan.push({ feature: "two-weapon-fighting", change: "damage bonus @mod", when: "attack mode offhand" });
  if (feats.has("great-weapon-master")) plan.push({ feature: "great-weapon-master", change: "damage bonus @prof", when: "Heavy weapon, Attack action, own turn" });
  return { actor: actor?.name, plan, applied: false, reason: apply ? "unverified: native rule conditions not yet proved in 6.0.6 — weaponBonuses fallback is active" : "report only", fallback: setting("weaponBonuses") };
}

/* ── API ─────────────────────────────────────────────────────────────────── */

const api = {
  // what the HUD shows
  count: (actor, weaponId) => countFor(actor, weaponId),
  plan: (actor, weaponId = null) => {
    const ctx = combatContext(actor);
    weaponId ??= chosenWeapon(actor);
    const ma = (actor.type === "npc" || actor.isPolymorphed) && setting("multiattack") ? multiattackOf(actor) : null;
    const pick = ma ? { "*": actor.getFlag(MODULE, "last")?.weapon ?? null } : null;
    return fullAttackPlan(actor, { weaponId, turn: turnOf(actor), inCombat: ctx.inCombat, multiattack: ma, count: ma ? ma.total : countFor(actor, weaponId), pick });
  },
  turn: turnOf,
  newTurn,
  multiattack: multiattackOf,
  weapons: weaponsOf,
  offers: offersFor,
  // what a click does
  fullAttack: async (actor, weaponId, opts = {}) => {
    const p = api.plan(actor, weaponId);
    return runSwings(actor, p.swings, opts);
  },
  followUp: runFollowUp,
  rollRider,
  reckless: isReckless, setReckless,
  running,
  abort: abortFor,
  // per-user choices
  quick: quickMode, setQuick: setQuickMode, riderMode, setRiderMode,
  // GM
  report: riderReport,
  fixFeats,
  seedWeaponSets, seedAll,
  core
};

function publish() {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, combat: api };
  else { game.pentaryn ??= {}; game.pentaryn.combat = api; }
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("setup", () => {
  Hooks.on("dnd5e.preRollAttackV2", (config) => { try { onPreRollAttack(config); } catch (err) { console.warn(`${MODULE} | swing tag skipped`, err); } });
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => { onPostRollAttack(rolls, data).catch(err => console.warn(`${MODULE} | swing count failed`, err)); });
  Hooks.on("dnd5e.postUseActivity", (activity, usage, results) => {
    // An area spell whose placement was cancelled was not cast (pentaryn-aoe refunds it): no pip, no Action.
    if (usage?.create?.measuredTemplate && activity?.target?.template?.type && !(results?.templates?.length) && canvas?.scene) return;
    onPostUseActivity(activity).catch(err => console.warn(`${MODULE} | action count failed`, err));
  });
  Hooks.on("dnd5e.preRollDamageV2", (config) => { try { onPreRollDamage(config); } catch (err) { console.warn(`${MODULE} | weapon bonus skipped`, err); } });
  Hooks.on("updateActor", onUpdateActor);
  installRiders();
  installOffhand();
});

// pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a tick.
Hooks.once("ready", () => setTimeout(() => {
  publish();
  if (game.users?.activeGM?.isSelf) seedAll().catch(err => console.warn(`${MODULE} | weapon-set seed failed`, err));
}, 0));

