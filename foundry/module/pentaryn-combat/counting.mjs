/**
 * Counting swings (feature, installed at setup): every attack roll, by the sequence or by hand,
 * spends one swing of the Attack action on the turn flag; a non-attack Action, a Bonus-action
 * feature, a Reaction or Action Surge is recorded too, and a creature one of my swings targeted
 * dropping to 0 HP earns Hew. Two-Weapon Fighting / Great Weapon Master damage (setting
 * weaponBonuses) is added here as well: it reads the same swing classification (lastTag).
 *
 * Registration order (the hooks golden pins it): preRollAttackV2, postRollAttack, postUseActivity,
 * preRollDamageV2, updateActor.
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { setting } from "./settings.mjs";
import { weaponShape, featuresOf, combatContext, turnOf, updateTurn, resetOffhandMode } from "./shapes.mjs";
import { taggedKind, forgetRoll } from "./sequence.mjs";

const log = makeLog(MODULE);

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

  await resetOffhandMode(activity, attackMode, { enabled: setting("offhandModeReset") }).catch(err => log.warn("mode reset failed", err));

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
    await actor.setFlag(MODULE, "reaction", { combatId: ctx.combat?.id ?? null }).catch(err => { log.debug("Reaction flag", err); return null; });
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

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ guard: false, label });

export function install(reg) {
  reg.on("dnd5e.preRollAttackV2", (config) => { try { onPreRollAttack(config); } catch (err) { log.warn("swing tag skipped", err); } }, opts("swing tag"));
  reg.on("dnd5e.postRollAttack", (rolls, data) => { onPostRollAttack(rolls, data).catch(err => log.warn("swing count failed", err)); }, opts("swing count"));
  reg.on("dnd5e.postUseActivity", (activity, usage, results) => {
    // An area spell whose placement was cancelled was not cast (pentaryn-aoe refunds it): no pip, no Action.
    if (usage?.create?.measuredTemplate && activity?.target?.template?.type && !(results?.templates?.length) && canvas?.scene) return;
    onPostUseActivity(activity).catch(err => log.warn("action count failed", err));
  }, opts("action count"));
  reg.on("dnd5e.preRollDamageV2", (config) => { try { onPreRollDamage(config); } catch (err) { log.warn("weapon bonus skipped", err); } }, opts("weapon bonus"));
  reg.on("updateActor", onUpdateActor, opts("Hew: a target dropped"));
}

/** Session state only; the registry unwinds the hooks. */
export function uninstall() {
  lastTag.clear();
  mySwings = [];
}
