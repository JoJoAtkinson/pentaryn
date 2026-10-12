/**
 * Part B, Careful Spell (usability Area 5 re-run, U-5-11; U-9-8) — a feature of its own.
 *
 * PHB 2024: "choose a number of those creatures up to your Charisma modifier (minimum of one
 * creature). A chosen creature automatically succeeds on its saving throw against the spell, and
 * it takes no damage if it would normally take half damage on a successful save."
 *
 *  - On the caster's client, using Careful Spell (`dnd5e.postUseActivity`) writes
 *    flags.pentaryn-aoe.careful = { at, key, usage } on the caster (key = the combat turn, else a
 *    10-minute window) and toasts how many it protects.
 *  - The next save spell's resolution (resolve.mjs, through ctx.exposed.carefulFor) marks up to CHA
 *    mod of the caster's side as protected (core.carefulTargets / protectRows) and binds the use
 *    to that usage card, so a re-roll of the card keeps it and another spell does not get it.
 *  - The active GM clears a use bound to a turn of a combat that has been deleted.
 *
 * Its two hooks register right after Part A's and before resolve's, as they did inside
 * resolve.mjs: the Careful arm must run before refund's synchronous `false` on the same hook.
 * Setting carefulSpell (world, default on).
 */

import { MODULE, aoeFlags, carefulTargets, protectRows, carefulApplies, carefulStale } from "./core.mjs";
import { setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";

let log = makeLog(MODULE);   // the entry's ctx.log once installed

/** -8: a silent stop, traced (ring + debug line) only while CONFIG.debug["pentaryn-aoe"] is on. */
function why(job, id, outcome, extra = {}) {
  log.trace(job, { id: id ?? null, outcome, ...extra });
  log.debug(`${job}: ${outcome}`, id ?? "");
}

/** The combat turn an actor's Careful Spell belongs to ("combatId:round:combatantId"), or null out of combat. */
export function carefulKey(actor) {
  const combat = game.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor === actor || cb.actorId === actor?.id));
  return combat ? `${combat.id}:${combat.round}:${combat.combatant?.id ?? combat.turn}` : null;
}

/**
 * The caster used Careful Spell for this cast: mark their side's rows (up to the CHA mod) as an
 * automatic success with no damage on a half-on-save spell, and bind the use to this usage card.
 * @returns {Promise<{names: string[], max: number}|null>}
 */
async function carefulFor(caster, described, { casterActorId, usage, scene, onSave, rows }) {
  if (!caster || !setting("carefulSpell")) { why("careful", usage, caster ? "off" : "no caster"); return null; }
  const flag = aoeFlags(caster).careful;
  const combatKey = carefulKey(caster);
  if (!flag) { why("careful", usage, "no flag"); return null; }
  if (!carefulApplies(flag, { now: Date.now(), combatKey, usage })) { why("careful", usage, "not applicable", { combatKey, flag }); return null; }
  const own = caster.token ?? caster.getActiveTokens?.(false, true)?.find(tk => tk.parent === scene) ?? null;
  const max = Math.max(1, Number(caster.system?.abilities?.cha?.mod) || 1);
  const ids = carefulTargets(described, { casterActorId, casterDisposition: own?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY, max });
  protectRows(rows, ids, onSave);
  // -9: if binding fails, a later different spell could still take the protection — say so.
  if (usage && !flag.usage) await caster.update({ [`flags.${MODULE}.careful.usage`]: usage }).catch(err => log.warn("careful bind usage", err));
  return { names: rows.filter(r => r.protected).map(r => r.name), max };
}

/** On the caster's client: Careful Spell was used, the next save spell's area protects their side. */
async function onCarefulUsed(activity) {
  if (!setting("carefulSpell")) return;
  const item = activity?.item;
  if ((item?.system?.identifier || "") !== "careful-spell") return;
  const actor = activity.actor;
  if (!actor?.isOwner) return why("careful", null, "used, but this client does not own the caster");
  await actor.update({ [`flags.${MODULE}.careful`]: { at: Date.now(), key: carefulKey(actor), usage: null } });
  const max = Math.max(1, Number(actor.system?.abilities?.cha?.mod) || 1);
  ui.notifications?.info?.(_loc("PENTARYN_AOE.Careful.Armed", { n: max }));
}

export function install(reg, ctx) {
  log = ctx.log;
  // resolve.mjs (another feature) calls this through ctx.exposed, never by importing this file.
  ctx.expose({ carefulFor });

  reg.on("dnd5e.postUseActivity", reg.guardSwallowAsync("postUseActivity(careful)", (activity) => onCarefulUsed(activity)), { guard: false, label: "postUseActivity(careful)" });

  // A Careful Spell armed for a turn of a combat that is now gone can never apply: clear it.
  reg.on("deleteCombat", reg.guardSwallowAsync("deleteCombat(careful)", async (combat) => {
    if (!game.users.activeGM?.isSelf) return;
    const done = new Set();
    for (const c of combat.combatants ?? []) {
      const actor = c.actor;
      if (!actor || done.has(actor.uuid)) continue;
      done.add(actor.uuid);
      if (carefulStale(aoeFlags(actor).careful, combat.id)) await actor.unsetFlag(MODULE, "careful");
    }
  }), { guard: false, label: "deleteCombat(careful)" });
}

export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { carefulFor, onCarefulUsed };
