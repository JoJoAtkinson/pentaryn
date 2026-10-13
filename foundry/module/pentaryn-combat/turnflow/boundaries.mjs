/**
 * Turn and combat boundaries (feature; settings specialActions, recklessToggle, hudFollows,
 * clearTargetsAfterTurn, drawerNearButton). At a turn change the active GM (one tab: a claim on the
 * Combat) ends Dodge / Dash / Disengage / Reckless and gives the Reaction back; the drawers of the
 * creatures whose turn ended or began close; a player's stale targets are released and the HUD follows their combatant. A combat
 * deleted mid-turn has its turn and Reaction flags cleared (and orphans swept on load and once,
 * 1.5 s after the last of a burst of deletes). Clicking one token of a selected group binds the HUD
 * to the one left.
 *
 * Registration order (the hooks golden pins it): combatTurnChange, deleteCombat (cleanup),
 * once(ready) orphan sweep, deleteCombat (orphan sweep), controlToken.
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting, argonSetting } from "../settings.mjs";
import { releaseTargets, closeDrawersOf } from "../argon.mjs";
import { claimDocument } from "../lib/election.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);

/* ── turn boundaries: Dodge / Dash / Disengage end; targets; the HUD follows ── */

async function sweep(actor, event) {
  const on = { specialActions: setting("specialActions"), reckless: setting("recklessToggle") };
  if (!actor?.effects || (!on.specialActions && !on.reckless)) return;
  const ids = core.expiringAt(actor.effects.map(e => ({
    id: e.id, statuses: [...(e.statuses ?? [])], until: e.getFlag?.(MODULE, "until") ?? null,
    reckless: !!e.getFlag?.(MODULE, "reckless") || core.isRecklessEffect(e)
  })), event, on);
  await deleteEffects(actor, ids);
}

/**
 * ac-4 [declared]: a delete another GM tab already made is success. The ids are filtered against
 * the actor's effects at call time, and the server's "does not exist" (the other tab's delete
 * landed between our read and our request) is logged at debug, never warned.
 */
async function deleteEffects(actor, ids) {
  const live = ids.filter(id => actor.effects.has(id));
  if (!live.length) return;
  try {
    await actor.deleteEmbeddedDocuments("ActiveEffect", live);
  } catch (err) {
    if (!/does not exist/i.test(String(err?.message ?? err))) throw err;
    log.debug("effect already deleted", err);
  }
}

function argonOn() {
  try { return !!(ui.ARGON?.enabled || argonSetting("alwaysOn")); } catch { return false; }
}

const onTurnChange = (combat, previous, current) => {
  // Combat start (round 0 → 1) keeps the same first combatant, so comparing combatants alone saw no
  // change and the HUD stayed on whoever it showed (usability Area 3). turnBoundary reads the round too.
  const { ended, began } = core.turnBoundary(previous, current);
  if (!ended && !began) return;
  const prior = ended ? combat.combatants.get(ended) ?? null : null;
  const next = began ? combat.combatants.get(began) ?? null : null;
  if (game.users.activeGM?.isSelf) gmBoundary(combat, current, prior, next).catch(err => log.debug("turn boundary claim", err));
  closeDrawersOf([prior?.actor, next?.actor], { enabled: setting("drawerNearButton") });
  if (game.user.isGM) return;
  // Your turn ended: last turn's target is stale (it used to send the next swing at a creature 15 ft away).
  if (setting("clearTargetsAfterTurn") && prior?.actor?.isOwner) releaseTargets();
  // Your creature's turn began: the HUD shows it (a player with a companion, or several tokens).
  const token = next?.token?.object ?? null;
  const plan = core.hudFollowPlan({
    enabled: setting("hudFollows"), owner: !!next?.actor?.isOwner, onScene: !!token && token.scene === canvas.scene,
    argonOn: argonOn(), combatStart: !ended
  });
  if (plan.now) followTo(token);
  // Combat start (Area 10): Argon's own updateCombat handler runs after this hook and binds
  // `controlled[0] ?? _token`. After a deleted combat Argon is still off here, so the look-again
  // must not depend on Argon being on now (U-10-10); it needs Argon on by then, and this
  // combatant's turn still the current one.
  for (const ms of plan.recheck) setTimeout(() => {
    if (combat.combatant?.id === next.id && argonOn() && ui.ARGON?._token !== token && !token.destroyed) followTo(token);
  }, ms);
};

/**
 * ac-4 [declared]: every tab on the GM account is activeGM.isSelf (the MCP bridge tab plus a GM
 * browser tab), so both used to sweep and reset the Reaction. One tab claims the turn on the
 * Combat's flags (`claims.t<round>_<turn>`, gone with the combat) and does the work; the other
 * stands down silently. The claim settles in 750 ms, so the sweep lands that much after the turn.
 */
async function gmBoundary(combat, current, prior, next) {
  if (!(await claimDocument(combat, `t${current?.round}_${current?.turn}`, { scope: MODULE }))) return;
  sweep(prior?.actor, "turnEnd").catch(err => log.warn("turn-end sweep", err));
  sweep(next?.actor, "turnStart").catch(err => log.warn("turn-start sweep", err));
  // The Reaction comes back at the start of your turn (counting.mjs records it; hud/bars.mjs onActorUpdated relights the pip).
  if (next?.actor?.getFlag?.(MODULE, "reaction")) next.actor.setFlag(MODULE, "reaction", null).catch(err => { log.debug("Reaction reset", err); return null; });
}

/**
 * Show this token on the HUD. Selecting it is the normal way (Argon follows the selection). When it
 * can't be selected right now (another layer or tool active, a placement running), releasing the
 * others first left nothing selected and Argon closed the HUD 100 ms later (Area 10: "TWF first, the
 * HUD went down"), so the HUD is bound to it directly and the selection is left alone.
 */
function followTo(token) {
  if (ui.ARGON?._token === token) return;
  let canSelect = false;
  try { canSelect = !!(token.layer?.active && token.isInteractable && token._canControl?.(game.user)); } catch { canSelect = false; }
  if (canSelect && token.control({ releaseOthers: true })) return;
  try { ui.ARGON?.bind?.(token); } catch (err) { log.warn("HUD follow", err); }
}

// A combat that ends mid-turn leaves nobody's turn to end it on. Its turn and Reaction flags go too:
// they mean nothing without the combat and used to stay on the PCs for good.
const onCombatDeleted = (combat) => {
  if (!game.users.activeGM?.isSelf) return;
  const done = new Set();
  for (const c of combat.combatants ?? []) {
    const actor = c.actor;
    if (!actor || done.has(actor.uuid)) continue;
    done.add(actor.uuid);
    sweep(actor, "turnEnd").then(() => sweep(actor, "turnStart"))
      .then(() => clearCombatFlags(actor, combat.id))
      .catch(err => log.warn("end-of-combat cleanup", err));
  }
};

// Every combat-scoped flag key, read in one place so the cleanup and the orphan sweep agree.
const combatFlagsOf = (actor) => ({ turn: actor.getFlag?.(MODULE, "turn"), reaction: actor.getFlag?.(MODULE, "reaction") });

/**
 * combat-riders-38 [declared, perf]: an actor's stale combat flags go in ONE write, with the deletion
 * form v14's Document#unsetFlag uses ({flags: {scope: {key: _del}}}), instead of one write per key.
 * @returns {Promise<number>} keys dropped
 */
const unsetKeys = keys => ({ [MODULE]: Object.fromEntries(keys.map(k => [k, _del])) });

async function dropCombatFlags(actor, keys) {
  if (!keys.length) return 0;
  await actor.update({ flags: unsetKeys(keys) });
  return keys.length;
}

async function clearCombatFlags(actor, combatId) {
  const stale = core.staleCombatFlags(combatFlagsOf(actor), combatId);
  await dropCombatFlags(actor, stale);
}

/**
 * Area 10: a turn flag from a combat deleted before the cleanup above existed (or while no GM was
 * connected) stayed on a PC for good. The active GM removes every world actor's turn and Reaction
 * flags whose combat no longer exists, on load and a moment after any combat is deleted.
 * ac-5 [declared, perf]: every actor's orphan keys go in ONE Actor.updateDocuments batch, not one
 * awaited write per actor.
 * @returns {Promise<number>} keys dropped
 */
async function sweepOrphanFlags() {
  if (!game.users.activeGM?.isSelf) return 0;
  const live = game.combats.map(c => c.id);
  const rows = [];
  let n = 0;
  for (const actor of game.actors) {
    const keys = core.orphanCombatFlags(combatFlagsOf(actor), live);
    if (!keys.length) continue;
    rows.push({ _id: actor.id, flags: unsetKeys(keys) });
    n += keys.length;
  }
  if (rows.length) await Actor.implementation.updateDocuments(rows);
  return n;
}

/**
 * perf-4 [declared]: one sweep at a time, and one per burst of deletes. Deleting several combats at
 * once used to schedule a sweep per delete; the debounce runs one 1.5 s after the last. A sweep
 * still running is never re-entered: the request is put back on the debounce for another look.
 */
let sweeping = false;
let sweepSoon = null;

async function sweepOnce() {
  if (sweeping) { sweepSoon?.(); return; }
  sweeping = true;
  try { await sweepOrphanFlags(); } catch (err) { log.warn("orphan flag sweep", err); } finally { sweeping = false; }
}

const onReadySweep = () => { void sweepOnce(); };
const onCombatDeletedSweep = () => {
  sweepSoon ??= foundry.utils.debounce(sweepOnce, core.DELAYS.orphanSweep);
  sweepSoon();
};

// Clicking one token of a selected group releases the others but never "controls" the clicked one
// again, so Argon kept showing whichever token it had. Bind to the one left.
function bindLeft() {
  const left = canvas.tokens?.controlled ?? [];
  if (left.length !== 1 || !argonOn() || ui.ARGON?._token === left[0]) return;
  if (!left[0].actor?.isOwner) return;
  // rob-5: runs from a timer, so a bind that throws (token destroyed since the release) is warned here
  try { ui.ARGON.bind(left[0]); } catch (err) { log.warn("HUD follow", err); }
}

/**
 * C26: one debounced look 150 ms after the last release, not one timer per release. The end state
 * is the same: every look re-reads canvas.tokens.controlled; the first that passes binds, and any
 * later one saw ui.ARGON._token === left[0] and returned.
 */
let followLeft = null;

const onControlToken = (token, controlled) => {
  if (controlled || !setting("hudFollows")) return;
  followLeft ??= foundry.utils.debounce(bindLeft, core.DELAYS.followLeft);
  followLeft();
};

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  reg.on("combatTurnChange", onTurnChange, opts("turn boundary"));
  reg.on("deleteCombat", onCombatDeleted, opts("end-of-combat cleanup"));
  reg.once("ready", onReadySweep, opts("orphan flag sweep (load)"));
  reg.on("deleteCombat", onCombatDeletedSweep, opts("orphan flag sweep (after a delete)"));
  reg.on("controlToken", onControlToken, opts("HUD follows the token left selected"));
}

export function uninstall() {
  followLeft?.cancel?.();
  followLeft = null;
  sweepSoon?.cancel?.();
  sweepSoon = null;
}
