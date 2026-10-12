/**
 * Foundry → plain data. Everything combat-core.mjs reads is built here, so the core never sees a
 * Document. Also the turn-flag reader/writer and the combat context (whose turn, which key).
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);


/* ── items ───────────────────────────────────────────────────────────────── */

export function activitiesOf(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  return Array.from(acts.values?.() ?? acts);
}

export function attackActivityOf(item) {
  return activitiesOf(item).find(a => a.type === "attack") ?? null;
}

function props(item) {
  const p = item?.system?.properties;
  return p instanceof Set ? p : new Set(p ?? []);
}

/** The weapon shape combat-core reads. Works for PC weapons, NPC/beast natural weapons and Unarmed Strike. */
export function weaponShape(item) {
  const atk = attackActivityOf(item);
  const p = props(item);
  const sys = item?.system ?? {};
  const attackType = sys.attackType ?? atk?.attack?.type?.value ?? null;
  const natural = sys.type?.value === "natural";
  const unarmed = sys.identifier === "unarmed-strike" || /unarmed strike/i.test(item?.name ?? "");
  const classification = atk?.attack?.type?.classification ?? null;
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    // A weapon, or an NPC's attack feature (2024 MM "monster" feats). Never a spell, a cantrip or a
    // consumable (Torch): those have attack activities too, but the Attack action doesn't swing them.
    isWeapon: item.type === "weapon",
    // A stack (Handaxe x2) is two weapons for the Light / Nick off-hand attack.
    quantity: Number(sys.quantity) || 1,
    weaponLike: item.type === "weapon" || (item.type === "feat" && classification !== "spell"),
    classification,
    equipped: item.type === "weapon" ? !!sys.equipped : true,
    melee: attackType === "melee" || (!attackType && atk?.attack?.type?.value === "melee"),
    ranged: attackType === "ranged",
    light: p.has("lgt"),
    heavy: p.has("hvy"),
    twoHanded: p.has("two"),
    finesse: p.has("fin"),
    reach: p.has("rch"),
    thrown: p.has("thr"),
    loading: p.has("lod"),
    versatile: p.has("ver"),
    mastery: sys.mastery ?? null,
    hasMastery: !!sys.masteryOptions,
    baseItem: sys.type?.baseItem ?? "",
    activation: atk?.activation?.type || "action",
    attackActivity: atk?.id ?? null,
    natural,
    unarmed,
    pactWeapon: !!item.getFlag?.(MODULE, "pactWeapon"),
    ability: atk?.ability || sys._typeAbilityMod || null
  };
}

/** Every item with an attack activity, as weapon shapes. */
export function weaponsOf(actor) {
  return (actor?.items?.contents ?? []).filter(i => attackActivityOf(i)).map(weaponShape);
}

/** The actor's feature identities (identifiers + slugged names). */
export function featuresOf(actor) {
  const feats = (actor?.items?.contents ?? []).filter(i => i.type === "feat" || i.type === "class" || i.type === "subclass")
    .map(i => ({ identifier: i.system?.identifier ?? "", name: i.name }));
  return core.featureSet(feats);
}

export function featureItem(actor, identifier) {
  return (actor?.items?.contents ?? []).find(i => i.type === "feat"
    && (i.system?.identifier === identifier || core.slugify(i.name) === identifier)) ?? null;
}

export function unarmedStrike(actor) {
  return (actor?.items?.contents ?? []).find(i => attackActivityOf(i) && weaponShape(i).unarmed) ?? null;
}

/** Monk Focus left, or null when the actor has no Focus pool. */
export function focusLeft(actor) {
  const item = featureItem(actor, "monks-focus");
  const uses = item?.system?.uses;
  if (!item || !uses || !uses.max) return null;
  return Number(uses.value ?? (uses.max - (uses.spent ?? 0)));
}

/** The Flurry of Blows activity on the Monk's Focus item. */
export function flurryActivity(actor) {
  const item = featureItem(actor, "monks-focus");
  return activitiesOf(item).find(a => /flurry/i.test(a.name ?? "")) ?? null;
}

/**
 * offhandModeReset: put a weapon's remembered attack mode back to main-hand after an off-hand roll.
 * dnd5e remembers the last mode per activity (flags.dnd5e.last.<id>), so one Offhand swing made every
 * later main-hand swing default to Offhand (no ability modifier). dnd5e writes `last` inside
 * rollAttack before dnd5e.postRollAttack fires, so restoring in that hook lands after it. The caller
 * passes the setting (`enabled`): this adapter reads no setting.
 */
export async function resetOffhandMode(activity, attackMode, { enabled = true } = {}) {
  if (!enabled || !String(attackMode ?? "").endsWith("offhand")) return false;
  // dnd5e hands hooks a clone of the item (Activity#use works on one); write to the real one.
  const item = activity?.item ? (activity.item.actor?.items?.get(activity.item.id) ?? null) : null;
  if (!item?.isOwner) return false;
  const next = core.mainMode(item.system?.attackModes ?? []);
  if (!next) return false;
  await item.setFlag("dnd5e", `last.${activity.id}.attackMode`, next);
  return true;
}

/* ── which weapon Full Attack starts with ─────────────────────────────────── */

/** The active Argon weapon set's primary weapon id, if any. */
export function setPrimaryId(actor) {
  try {
    const sets = actor.getFlag("enhancedcombathud", "weaponSets");
    const active = actor.getFlag("enhancedcombathud", "activeWeaponSet") || "1";
    const uuid = sets?.[active]?.primary;
    return uuid ? uuid.split(".").pop() : null;
  } catch { return null; }
}

/** Remembered weapon, else the active set's primary, else the first equipped melee weapon (HUD and API alike). */
export function chosenWeapon(actor) {
  return core.defaultWeapon({
    weapons: weaponsOf(actor),
    remembered: rememberedWeapon(actor),
    setPrimary: setPrimaryId(actor)
  });
}

/* ── Multiattack ─────────────────────────────────────────────────────────── */

function rollFormula(actor, formula) {
  try {
    const roll = new Roll(formula, actor.getRollData());
    if (!roll.isDeterministic) return null;
    roll.evaluateSync();
    return roll.total;
  } catch {
    return null;
  }
}

/** The actor's parsed Multiattack plan, override first. null when there is none or it won't parse. */
export function multiattackOf(actor) {
  if (!actor) return null;
  const items = actor.items?.contents ?? [];
  const override = core.overridePlan(actor.getFlag?.(MODULE, "multiattack"), items.map(i => i.id));
  if (override) return { plan: override, total: override.reduce((s, r) => s + r.count, 0), groups: override.map(r => ({ count: r.count, choices: [r.itemId] })), source: "flag" };
  const ma = items.find(i => /^multiattack\b/i.test(i.name ?? ""));
  if (!ma) return null;
  const parsed = core.parseMultiattack(ma.system?.description?.value ?? "",
    items.map(i => ({ id: i.id, name: i.name, isAttack: !!attackActivityOf(i) })),
    { evalFormula: f => rollFormula(actor, f) });
  if (!parsed || parsed.total < 1) return null;
  return { ...parsed, plan: core.multiattackPlan(parsed), source: ma.id };
}

/** NPCs and Wild Shape forms swing by Multiattack; characters by Extra Attack. */
export function usesMultiattack(actor) {
  return actor?.type === "npc" || !!actor?.isPolymorphed;
}

/** attackCount for this actor and weapon (weapon id optional). */
export function countFor(actor, weaponId = null) {
  const w = weaponId ? actor.items.get(weaponId) : null;
  const ma = usesMultiattack(actor) ? multiattackOf(actor) : null;
  return core.attackCount({
    features: featuresOf(actor),
    override: actor.getFlag?.(MODULE, "attacks"),
    multiattack: ma
  }, w ? weaponShape(w) : null);
}

/* ── combat context and the turn flag ─────────────────────────────────────── */

function sameActor(a, b) {
  return !!a && !!b && (a === b || a.uuid === b.uuid);
}

/** The started combat this actor is in (not just the one this client views), else the viewed one. */
function combatOf(actor) {
  const viewed = game.combat ?? null;
  if (!actor) return viewed;
  const scene = tokenOf(actor)?.scene?.id ?? canvas?.scene?.id ?? null;
  const list = [];
  for (const c of game.combats ?? []) {
    if (!c.started) continue;
    list.push({ id: c.id, started: true, active: !!c.active, onScene: !!scene && c.scene?.id === scene,
      holds: !!c.combatants?.find?.(cb => sameActor(cb.actor, actor)) });
  }
  const id = core.pickCombat(list, { viewedId: viewed?.id ?? null });
  return id ? game.combats.get(id) : viewed;
}

export function combatContext(actor) {
  const combat = combatOf(actor);
  const combatant = combat?.combatants?.find?.(c => sameActor(c.actor, actor)) ?? null;
  const inCombat = !!combat?.started && !!combatant;
  const isOwnTurn = !inCombat || sameActor(combat.combatant?.actor, actor);
  // The combatant's id, not the turn index: adding a summon to the tracker mid-turn shifts the index
  // and would otherwise read as a new turn (Sneak Attack and the swings back).
  const key = core.turnKey({ combatId: combat?.id, round: combat?.round, turn: combat?.combatant?.id ?? combat?.turn, inCombat });
  return { combat, inCombat, isOwnTurn, key };
}

export function turnOf(actor) {
  const { key } = combatContext(actor);
  return core.readTurn(actor?.getFlag?.(MODULE, "turn"), key);
}

const writeChains = new Map();

/**
 * Write the whole turn flag, replacing what is stored. A plain setFlag MERGES nested objects: a fresh
 * turn's `riders: {}` merged over last turn's `{"sneak-attack": "used"}` kept Sneak Attack spent into
 * every later turn, and Undo (deleting the key) never landed. v14's `_replace` operator (or the older
 * "==" key) replaces the value instead.
 */
function writeTurn(actor, value) {
  const path = `flags.${MODULE}.turn`;
  const replace = globalThis._replace ?? foundry.data?.operators?.ForcedReplacement?.create;
  return actor.update(replace ? { [path]: replace(value) } : { [`flags.${MODULE}.==turn`]: value });
}

/**
 * Update the turn flag through a pure function. Writes are chained per actor so two quick swings
 * never lose each other's update. Only the actor's owner writes.
 */
export function updateTurn(actor, fn) {
  if (!actor?.isOwner) return Promise.resolve(null);
  const id = actor.uuid;
  const prev = writeChains.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const before = turnOf(actor);
    const after = fn(before);
    if (!after || JSON.stringify(after) === JSON.stringify(before)) return before;
    await writeTurn(actor, after);
    return after;
  }).catch(err => { log.warn("turn flag write failed", err); return null; });
  writeChains.set(id, next);
  // combat-riders-29: a settled chain is forgotten (unless a newer write already replaced it).
  next.finally(() => { if (writeChains.get(id) === next) writeChains.delete(id); });
  return next;
}

/** Resolves once every turn-flag write queued for this actor has landed. */
export function turnSettled(actor) {
  return writeChains.get(actor?.uuid) ?? Promise.resolve();
}

/** Out-of-combat "New turn": a fresh flag under the no-combat key. */
export async function newTurn(actor) {
  if (!actor?.isOwner) return null;
  return writeTurn(actor, core.freshTurn(combatContext(actor).key));
}

/* ── attack roll facts ───────────────────────────────────────────────────── */

export function rollAdvantage(roll) {
  const mode = roll?.options?.advantageMode;
  const ADV = CONFIG.Dice?.D20Roll?.ADV_MODE ?? { ADVANTAGE: 1, DISADVANTAGE: -1 };
  return {
    advantage: roll?.hasAdvantage ?? mode === ADV.ADVANTAGE,
    disadvantage: roll?.hasDisadvantage ?? mode === ADV.DISADVANTAGE
  };
}

const INCAPACITATED = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "dead"];

/**
 * Is an ally of the attacker (not the attacker, not hostile to it, not Incapacitated) within 5 ft
 * of the target? null when it can't be told (no single target, no canvas).
 */
export function allyAdjacent(attackerToken, targetToken) {
  try {
    if (!attackerToken || !targetToken || !canvas?.ready) return null;
    const disp = attackerToken.document?.disposition ?? 0;
    const reach = (canvas.grid?.distance ?? 5) + 0.01;
    for (const t of canvas.tokens.placeables) {
      if (t === attackerToken || t === targetToken || !t.actor) continue;
      if (t.document.hidden) continue;
      if ((t.document.disposition ?? 0) !== disp) continue;
      if (INCAPACITATED.some(s => t.actor.statuses?.has?.(s))) continue;
      const d = canvas.grid.measurePath([t.center, targetToken.center]).distance;
      // Token edges: distance between centres minus the target's and ally's half-sizes in grid units.
      const half = ((t.document.width ?? 1) + (targetToken.document.width ?? 1)) / 2 - 1;
      if (d - half * (canvas.grid?.distance ?? 5) <= reach) return true;
    }
    return false;
  } catch {
    return null;
  }
}

export function tokenOf(actor) {
  return actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;
}

/* ── adapter seams (guide S8: combat-riders-4, -5, -21, -22, -36) ─────────── */

/**
 * A weapon (or unarmed) attack, not a spell attack: counts as a swing, carries the riders. One
 * predicate for counting (was combat.mjs weaponLike) and the riders (was riders.mjs
 * isWeaponAttack); both bodies were the same (combat-riders-4).
 */
export function isWeaponAttack(activity) {
  const cls = activity?.attack?.type?.classification;
  return activity?.type === "attack" && cls !== "spell" && activity.item?.type !== "spell"
    && (cls === "weapon" || cls === "unarmed" || activity.item?.type === "weapon");
}

/** "1d8 + 3 Slashing" from an attack activity's damage labels (weapon tile and pause-bar tile). */
export function damageLabel(activity) {
  const dmg = activity?.labels?.damage ?? activity?.labels?.damages ?? [];
  return (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ");
}

/** The weapon Full Attack last started with (flags.pentaryn-combat.last.weapon), else null. */
export function rememberedWeapon(actor) {
  return actor?.getFlag?.(MODULE, "last")?.weapon ?? null;
}

/** Remember the weapon Full Attack starts with next time. */
export function rememberWeapon(actor, weaponId) {
  return actor.setFlag(MODULE, "last.weapon", weaponId);
}

/** The actor's Multiattack when it swings by one (NPC, Wild Shape form) and `enabled` (setting multiattack). */
export function multiattackFor(actor, { enabled = true } = {}) {
  return usesMultiattack(actor) && enabled ? multiattackOf(actor) : null;
}

/** core.fullAttackPlanFrom with this actor's weapon shapes and Enhanced Dual Wielding flag. */
export function fullAttackPlanOf(actor, { weaponId = null, turn = null, inCombat = false, multiattack = null, count = 1, pick = null } = {}) {
  if (multiattack) return core.fullAttackPlanFrom({ weaponId, turn, inCombat, multiattack, count, pick });
  const weapons = weaponsOf(actor);
  return core.fullAttackPlanFrom({ weapons, weaponId, turn, inCombat, count, pick,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") });
}

/**
 * What api.plan answers: the Full Attack plan for this actor and weapon (the remembered or default
 * one when none is given). `multiattackOn` is setting multiattack.
 */
export function planFor(actor, weaponId = null, { multiattackOn = true } = {}) {
  const ctx = combatContext(actor);
  weaponId ??= chosenWeapon(actor);
  const ma = multiattackFor(actor, { enabled: multiattackOn });
  const pick = ma ? { "*": rememberedWeapon(actor) } : null;
  return fullAttackPlanOf(actor, { weaponId, turn: turnOf(actor), inCombat: ctx.inCombat, multiattack: ma, count: ma ? ma.total : countFor(actor, weaponId), pick });
}

/** An area handle pentaryn-aoe placed (its token flag); combat reselects your token when one goes. */
export function isAoeHandle(flags) {
  return !!flags?.["pentaryn-aoe"]?.handle;
}

/* ── rider reads (pure: no write, no DOM) ─────────────────────────────────── */

export function isReckless(actor) {
  return !!actor?.effects?.some(e => core.isRecklessEffect(e));
}

/** The rider's damage activity on its feature item. */
export function riderActivity(actor, rider) {
  for (const id of rider.identifiers) {
    const item = featureItem(actor, id);
    const act = activitiesOf(item).find(a => a.type === "damage");
    if (act) return act;
  }
  return null;
}

/** "3d6" for the button label. */
export function riderDiceFor(actor, rider) {
  const scale = rider.scale ? actor?.system?.scale?.[rider.scale[0]]?.[rider.scale[1]] : null;
  return core.riderDice(rider, scale);
}

/**
 * The follow-ups (Off-hand, Nick, Flurry, Martial Arts, Hew, Pole Strike) this actor qualifies for
 * right now, as the Bonus and Special bars offer them (combat-riders-11). `bonusFree`: the Bonus
 * Action is not spent — the HUD reads Argon's Bonus pip, inspect() the turn flag.
 */
export function followUpsFor(actor, { bonusFree = true } = {}) {
  const ctx = combatContext(actor);
  const weapons = weaponsOf(actor);
  const unarmed = unarmedStrike(actor);
  const turn = turnOf(actor);
  const features = featuresOf(actor);
  const focus = focusLeft(actor);
  const pam = features.has("polearm-master") ? featureItem(actor, "polearm-master") : null;
  const list = core.followUps({
    turn, weapons, features,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding"),
    bonusFree, focus, unarmedId: unarmed?.id ?? null, isOwnTurn: ctx.isOwnTurn,
    poleStrikeId: pam && attackActivityOf(pam) ? pam.id : null
  });
  // Which rule each Off-hand is (Light property or Dual Wielder), for its tooltip (U-10-12).
  for (const f of list) {
    if (f.kind === "offhand") f.via = core.offhandVia({ weapon: weapons.find(w => w.id === f.weaponId) ?? null, turn, offered: list });
  }
  // Usability (area 3, C3): Flurry with no Focus left stays on the bar, greyed with its reason, instead of
  // vanishing — a player who sees Martial Arts but no Flurry wonders whether the feature broke.
  if (ctx.isOwnTurn && unarmed && features.has("monks-focus") && (focus ?? 0) < 1 && bonusFree && !turn.bonusUsed
    && !turn.followUps.includes("flurry") && !turn.followUps.includes("martial-arts")) {
    list.unshift({ kind: "flurry", weaponId: unarmed.id, count: features.has("heightened-focus") ? 3 : 2, disabled: "focus" });
  }
  return list;
}
