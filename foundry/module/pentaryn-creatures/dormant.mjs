/**
 * Pentaryn Creatures — FEATURE: dormant until combat. A token armed with `dormant(ref)` looks like
 * a prop (a statue by default) until a combat it is in starts; then it wakes into its real look by
 * itself. What changes and why: creatures-core.mjs "Dormant until combat".
 *
 * Who writes: the active GM user only (isActiveGM, no fallback). Core calls `combatStart` on the
 * client that pressed Begin Combat alone, so the trigger is `updateCombat` (every client sees the
 * round change) and `createCombatant` for one added to a running fight. A wake is deterministic and
 * clears the flag, so a second GM tab on the same account writes the same values or nothing.
 */

import { combatantRelabels, disguiseUpdate, readDormant, wakeUpdate } from "./creatures-core.mjs";
import { fail, ok } from "./lib/errors.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { refOf } from "./lib/resolve.mjs";

/** The module's kit logger (ctx.log). */
let log = null;
/** Token uuids this client is waking right now: a round change and a combatant create in one tick wake once. */
const waking = new Set();

const sourceOf = doc => doc?._source ?? doc;

/** Arm (or re-arm) one token: store its look once, put the disguise on. */
export async function arm(doc, opts = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM disguises tokens");
  let update;
  try {
    update = disguiseUpdate(sourceOf(doc), opts ?? {});
  } catch (err) {
    return fail("BAD_ARGS", err.message);
  }
  const res = { token: refOf(doc), name: update.name, img: update["texture.src"], disposition: update.disposition };
  if (opts?.dryRun) return ok({ dryRun: true, ...res });
  await doc.update(update, { pentarynCreatures: true });
  return ok({ dryRun: false, ...res });
}

/** Wake one token now: its stored look back, the flag cleared, its combatants relabelled. */
export async function wake(doc, opts = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM wakes tokens");
  const flag = readDormant(sourceOf(doc));
  const update = wakeUpdate(sourceOf(doc));
  if (!update) return ok({ dryRun: !!opts?.dryRun, woke: false, token: refOf(doc) });
  if (opts?.dryRun) return ok({ dryRun: true, woke: true, token: refOf(doc), name: update.name });
  await doc.update(update, { pentarynCreatures: true });
  for (const combat of game.combats ?? []) {
    const rows = [...combat.combatants].map(c => ({ id: c.id, tokenId: c.tokenId, name: c._source?.name, img: c._source?.img }));
    const ups = combatantRelabels(rows, doc.id, flag);
    if (ups.length) await combat.updateEmbeddedDocuments("Combatant", ups);
  }
  return ok({ dryRun: false, woke: true, token: refOf(doc), name: update.name });
}

/** Wake every dormant token fighting in a started combat (active GM only). */
function wakeCombat(combat) {
  if (!isActiveGM() || !combat?.started) return;
  for (const c of combat.combatants ?? []) {
    const t = c.token;
    if (!t || !readDormant(sourceOf(t)) || waking.has(t.uuid)) continue;
    waking.add(t.uuid);
    wake(t)
      .catch(err => log.warn(`waking ${t.name} failed`, err))
      .finally(() => waking.delete(t.uuid));
  }
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("updateCombat", (combat, changes) => {
    if (changes && "round" in changes) wakeCombat(combat);
  }, { label: "updateCombat: wake dormant combatants" });
  reg.on("createCombatant", (combatant) => wakeCombat(combatant?.parent), { label: "createCombatant: wake dormant combatants" });
  ctx.expose({ arm, wake });
}

export function uninstall() {
  waking.clear();
}
