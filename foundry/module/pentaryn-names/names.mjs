// Pentaryn Token Name Sync — an actor rename carries through to its token labels.
//
// A label follows the rename only if it was derived from the old name: the full name, or the
// part before the first comma. Anything else is a nickname the GM chose and is left alone.
// The rules live in names-core.mjs.

import { planTokenRelabels, relabel, shortName } from "./names-core.mjs";

async function sync(actor, oldName, newName) {
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

// Capture the old name before it is overwritten; act only on the client that made the change.
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if ("name" in changes && changes.name !== actor.name) options.pentarynOldName = actor.name;
});

Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id || options.pentarynNames || !options.pentarynOldName) return;
  sync(actor, options.pentarynOldName, actor.name);
});

// pentaryn-importer creates and FREEZES game.pentaryn, so rebuild it rather than assign into it.
Hooks.once("ready", () => {
  const api = { sync, relabel, shortName };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, names: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.names = api;
  }
});
