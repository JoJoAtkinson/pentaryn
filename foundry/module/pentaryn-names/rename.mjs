/**
 * Pentaryn Token Name Sync — the rename feature: an actor rename carries through to its token
 * labels (prototype token and every placed token of that actor, on every scene).
 *
 * GLUE, one feature: `install(reg, ctx)` registers the two actor hooks through the registry;
 * `uninstall()` has no state to drop. `sync` is also published as the legacy API row.
 * The old name is captured in preUpdateActor on every client; only the client that made the
 * change (`userId === game.user.id`) writes, and only to tokens it may edit.
 */

import { planTokenRelabels, relabel } from "./names-core.mjs";

/** Relabel the prototype token and every placed token of `actor`. Returns how many labels changed. */
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
  if (count) ui.notifications.info(game.i18n.format("PENTARYN_NAMES.Synced", { name: newName, count }));
  return count;
}

export function install(reg, ctx) {
  // Capture the old name before it is overwritten.
  reg.on("preUpdateActor", (actor, changes, options) => {
    if ("name" in changes && changes.name !== actor.name) options.pentarynOldName = actor.name;
  }, { label: "preUpdateActor: remember old name" });

  // Act only on the client that made the change, never on names' own prototype write.
  reg.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options.pentarynNames || !options.pentarynOldName) return;
    sync(actor, options.pentarynOldName, actor.name);
  }, { label: "updateActor: relabel" });
}

export function uninstall() {}
