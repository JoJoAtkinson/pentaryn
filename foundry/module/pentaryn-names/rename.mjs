/**
 * Pentaryn Token Name Sync — the rename feature: an actor rename carries through to its token
 * labels (prototype token and every placed token of that actor, on every scene).
 *
 * GLUE, one feature: `install(reg, ctx)` registers the two actor hooks through the registry;
 * `uninstall()` has no state to drop. `syncRef` is the legacy API row `sync`.
 * The old name is captured in preUpdateActor on every client; only the client that made the
 * change (`userId === game.user.id`) writes, and only to tokens it may edit.
 */

import { planTokenRelabels, relabel } from "./names-core.mjs";
import { CODES, errorCode, toFail } from "./lib/errors.mjs";
import { resolveRef } from "./lib/resolve.mjs";

/**
 * Relabel the prototype token and every placed token of `actor`, then (GM only) its combatants.
 * Returns how many TOKEN labels changed; combatant names are not counted or toasted.
 */
export async function sync(actor, oldName, newName) {
  let count = 0;
  const proto = relabel(actor.prototypeToken.name, oldName, newName);
  if (proto !== null && proto !== actor.prototypeToken.name) {
    await actor.update({ "prototypeToken.name": proto }, { pentarynNames: true });
    count++;
  }
  for (const scene of game.scenes) {
    const updates = planTokenRelabels([...scene.tokens], {
      actorId: actor.id, oldName, newName, canEdit: t => t.canUserModify(game.user, "update"),
    });
    if (updates.length) {
      await scene.updateEmbeddedDocuments("Token", updates);
      count += updates.length;
    }
  }
  if (game.user.isGM) await relabelCombatants(actor, oldName, newName);
  if (count) ui.notifications.info(_loc("PENTARYN_NAMES.Synced", { name: newName, count }));
  return count;
}

/**
 * PT3-9: the combatants of `actor`, in every encounter, whose name was the old name or its part
 * before the first comma — the token rule. Foundry derives an empty combatant name from its token
 * once, at prepare time, and a token rename does not re-prepare it, so the tracker kept the old
 * label; writing the name fixes it on every client. GM only: a player may not update a combatant's
 * name (common/documents/combatant.mjs:76-85). One batch write per combat.
 */
async function relabelCombatants(actor, oldName, newName) {
  for (const combat of game.combats) {
    const updates = planTokenRelabels([...combat.combatants], { actorId: actor.id, oldName, newName, canEdit: () => true });
    if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  }
}

/**
 * The API row `sync`: resolve `ref` to the BASE actor, then `sync`. A token, a placeable, a token id
 * or a token's synthetic actor all mean the world actor, because Foundry routes a synthetic actor's
 * update to its ActorDelta, which has no prototypeToken — the prototype relabel would be dropped
 * while still counted. Legacy row: a miss reaches `sync` as null and rejects with a TypeError; a
 * coded resolve error (AMBIGUOUS, BAD_ARGS) comes back as fail(code, reason), writing nothing.
 */
export function syncRef(ref, oldName, newName) {
  let actor;
  try {
    actor = resolveRef(ref, "actor", { base: true, required: false });
  } catch (err) {
    if (errorCode(err, CODES)) return toFail(err);
    throw err;
  }
  if (actor?.isToken) actor = game.actors.get(actor.token?.actorId) ?? null;
  return sync(actor, oldName, newName);
}

export function install(reg, ctx) {
  // Capture the old name before it is overwritten.
  reg.on("preUpdateActor", (actor, changes, options) => {
    if ("name" in changes && changes.name !== actor.name) options.pentarynOldName = actor.name;
  }, { label: "preUpdateActor: remember old name" });

  // Act only on the client that made the change, never on names' own prototype write.
  reg.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options.pentarynNames || !options.pentarynOldName) return;
    const from = options.pentarynOldName, to = actor.name;
    sync(actor, from, to).catch(err => ctx.log.warn("relabel after rename failed", { actor: actor.uuid, from, to }, err));
  }, { label: "updateActor: relabel" });
}

export function uninstall() {}
