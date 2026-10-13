/**
 * Oracles: verbatim copies of pentaryn-combat 0.2.5 code (wave-4 base a5a1a906; the 28ccc87 line
 * numbers in the guide still hold), kept so the refactor's helpers can be pinned against what the
 * code did before it moved. Only the imports and the `export` keywords are added; each body is as
 * it was. Imports point at the live shapes/core/settings, whose own pins live in their tests.
 */

import * as core from "../../combat-core.mjs";
import {
  combatContext, weaponsOf, unarmedStrike, turnOf, featuresOf, focusLeft, featureItem, attackActivityOf, chosenWeapon,
  multiattackOf, countFor, usesMultiattack,
} from "../../shapes.mjs";
import { setting } from "../../settings.mjs";

const MOD = core.MOD;

/* combat.mjs:48-52 */
export function weaponLike(activity) {
  const cls = activity?.attack?.type?.classification;
  if (activity?.type !== "attack" || cls === "spell" || activity.item?.type === "spell") return false;
  return cls === "weapon" || cls === "unarmed" || activity.item?.type === "weapon";
}

/* riders.mjs:45-49 */
export function isWeaponAttack(activity) {
  const cls = activity?.attack?.type?.classification;
  return activity?.type === "attack" && cls !== "spell" && activity.item?.type !== "spell"
    && (cls === "weapon" || cls === "unarmed" || activity.item?.type === "weapon");
}

/* sequence.mjs:421-435 */
export function fullAttackPlan(actor, { weaponId = null, turn = null, inCombat = false, multiattack = null, count = 1, pick = null } = {}) {
  if (multiattack) {
    const plan = pick ? core.multiattackPlan(multiattack, { pick }) : multiattack.plan;
    const total = plan.reduce((s, r) => s + r.count, 0);
    const done = inCombat ? (turn?.attackAction?.swings ?? 0) : 0;
    const swings = inCombat && core.attackActions(turn) === 0 ? [] : core.planSequence({ multiattack: plan, done });
    return { swings, count: total, left: swings.length, weaponId: plan[0]?.itemId ?? null };
  }
  const weapons = weaponsOf(actor);
  const main = weapons.find(w => w.id === weaponId) ?? null;
  const left = core.swingsLeft(count, turn, { inCombat });
  const extras = core.extraSwings({ main, weapons, turn, enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") });
  const swings = left > 0 ? core.planSequence({ weaponId, count: left, extras }) : [];
  return { swings, count, left, weaponId };
}

/* combat.mjs:218-224 (api.plan) */
export function apiPlan(actor, weaponId = null) {
  const ctx = combatContext(actor);
  weaponId ??= chosenWeapon(actor);
  const ma = (actor.type === "npc" || actor.isPolymorphed) && setting("multiattack") ? multiattackOf(actor) : null;
  const pick = ma ? { "*": actor.getFlag(MOD, "last")?.weapon ?? null } : null;
  return fullAttackPlan(actor, { weaponId, turn: turnOf(actor), inCombat: ctx.inCombat, multiattack: ma, count: ma ? ma.total : countFor(actor, weaponId), pick });
}

/* hud.mjs:161-163 */
function multiattack(actor) {
  return usesMultiattack(actor) && setting("multiattack") ? multiattackOf(actor) : null;
}

/* hud.mjs:166-183 */
export function fullAttackState(actor) {
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const ma = multiattack(actor);
  const pick = ma ? { "*": actor.getFlag(MOD, "last")?.weapon ?? null } : null;
  const weaponId = ma ? null : chosenWeapon(actor);
  const count = ma ? ma.total : countFor(actor, weaponId);
  const plan = fullAttackPlan(actor, { weaponId, turn, inCombat: ctx.inCombat, multiattack: ma, count, pick });
  const weapons = weaponsOf(actor);
  const nick = !ma && weaponId ? core.extraSwings({ main: weapons.find(w => w.id === weaponId), weapons, turn,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") }).length : 0;
  const pipCount = ma ? ma.total : Math.max(count, countFor(actor, null));
  return { ctx, turn, ma, weaponId, count, pipCount, plan, worth: pipCount >= 2 || nick > 0 };
}

/* hud.mjs:551-579 */
export function followUpsNow(actor, bonusPanel) {
  const ctx = combatContext(actor);
  const weapons = weaponsOf(actor);
  const unarmed = unarmedStrike(actor);
  const bonusFree = !ctx.inCombat || !bonusPanel || bonusPanel.currentActions !== 0;
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
  for (const f of list) {
    if (f.kind === "offhand") f.via = core.offhandVia({ weapon: weapons.find(w => w.id === f.weaponId) ?? null, turn, offered: list });
  }
  // combat-core-EXT-12: the greyed no-Focus Flurry this oracle unshifted here now comes from the live
  // core.followUps it calls above, so the unshift is dropped (keeping it would offer Flurry twice).
  return list;
}

/* hud.mjs:185-194 (weaponTile: the damage label piece) */
export function weaponTileDamage(act) {
  const dmg = act?.labels?.damage ?? act?.labels?.damages ?? [];
  return (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ");
}

/* sequence.mjs:171-181 (swapTile: the stats piece) */
export function swapTileStats(act) {
  let stats = "";
  try {
    const dmg = act?.labels?.damage ?? act?.labels?.damages ?? [];
    const damage = (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ");
    stats = [act?.labels?.toHit ?? "", damage].filter(Boolean).join(" · ");
  } catch { /* the name alone */ }
  return stats;
}

/* riders.mjs:325-345 (renderAutoNote: the per-rider HTML pieces, live and Undone branches) */
export function autoNoteParts({ auto, turn, undone, rolls, isOwner, isGM, T }) {
  return auto.map(a => {
    const live = turn?.riders?.[a.key] === `auto:${a.attack}`;
    const name = T(`PENTARYN_COMBAT.Rider.Name.${a.key}`);
    if (undone.includes(a.key)) {
      const rolled = core.riderRolled(a.dice, rolls?.[0]?.dice?.map(d => ({ number: d.number, faces: d.faces, total: d.total })) ?? []);
      const total = (rolls ?? []).reduce((sum, r) => sum + (Number(r?.total) || 0), 0);
      const text = rolled && rolls?.length
        ? T("PENTARYN_COMBAT.Rider.UndoneCard", { formula: rolled.formula, n: rolled.total, total: total - rolled.total })
        : T("PENTARYN_COMBAT.Rider.UndoneCardPlain");
      return `<s>+ ${name} ${a.dice}</s> <span class="pentaryn-combat-undone-text">${text}</span>`;
    }
    const undo = live && (isOwner || isGM)
      ? ` <button type="button" class="pentaryn-combat-undo" data-undo="${a.key}" data-tooltip="${T("PENTARYN_COMBAT.Rider.UndoHint")}"><i class="fa-solid fa-rotate-left"></i> ${T("PENTARYN_COMBAT.Rider.Undo")}</button>` : "";
    return `+ ${name} ${a.dice}${undo}`;
  });
}

/* turnflow.mjs:392-410 (the close-hook tidy decision, at its 250 ms look) */
export function tidyOnClose({ msg, messages, userId, now, running }) {
  const rolled = messages.some(m => m.id !== msg.id && ((m.system?.origin?.id ?? m.system?.origin) === msg.id));
  const keep = !core.orphanUsage({
    mine: msg.author?.id === userId, ageMs: now - (msg.timestamp ?? 0), rolled,
    consumed: core.deltasConsumed(msg.system?.deltas), sequence: !!running
  });
  return !keep;
}

/* sequence.mjs:211-228 (tidyOrigins: the per-card decision) */
export function tidyAtSequenceEnd({ msg, messages, userId, now }) {
  if (!msg || msg.type !== "usage") return false;
  const rolled = messages.some(m => m.id !== msg.id && ((m.system?.origin?.id ?? m.system?.origin) === msg.id));
  return core.orphanUsage({
    mine: msg.author?.id === userId, ageMs: now - (msg.timestamp ?? 0), rolled,
    consumed: core.deltasConsumed(msg.system?.deltas), sequence: false
  });
}
