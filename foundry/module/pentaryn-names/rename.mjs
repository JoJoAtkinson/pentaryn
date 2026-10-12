/**
 * Pentaryn Token Name Sync — the rename feature: an actor rename carries through to its token
 * labels (prototype token and every placed token of that actor, on every scene). Renaming an
 * unlinked token's synthetic actor relabels only that token (names-edge-1).
 *
 * GLUE, one feature: `install(reg, ctx)` registers the two actor hooks through the registry;
 * `uninstall()` drops the per-actor sync chains. `syncRef` is the legacy API row `sync`.
 * preUpdateActor runs only on the client that made the rename (§5.9.1) and records the old name
 * in the operation options, keyed by actor id; they travel with the update to every client. Only
 * that client (`userId === game.user.id`) writes, and only to tokens it may edit.
 */

import { planTokenRelabels, relabel } from "./names-core.mjs";
import { CODES, errorCode, fail, toFail } from "./lib/errors.mjs";
import { resolveRef } from "./lib/resolve.mjs";

/** The module logger, set by `install` (ctx.log). */
let log = null;

/**
 * names-ac-3: the hook's syncs, chained per actor id. Each starts after the previous one for that
 * actor settles, so its planner reads the labels that one wrote; the entry is dropped when the chain
 * drains. Two quick renames on DIFFERENT clients are not chained (see the README).
 */
const chains = new Map();

/** Run `run` after the chain for `id` settles (resolved or rejected); returns its own promise. */
function chained(id, run) {
  const next = (chains.get(id) ?? Promise.resolve()).then(run);
  const tail = next.catch(() => {});
  chains.set(id, tail);
  tail.then(() => { if (chains.get(id) === tail) chains.delete(id); });
  return next;
}

/**
 * Relabel the prototype token and every placed token of `actor`, then (GM only) its combatants.
 * Returns how many TOKEN labels changed; combatant names are not counted or toasted.
 */
export async function sync(actor, oldName, newName) {
  if (actor.isToken) return syncToken(actor, oldName, newName);
  let count = 0;
  const proto = relabel(actor.prototypeToken.name, oldName, newName);
  if (proto !== null && proto !== actor.prototypeToken.name) {
    await actor.update({ "prototypeToken.name": proto }, { pentarynNames: true });
    count++;
  }
  count += await relabelEmbedded(game.scenes, "tokens", "Token", t => t.canUserModify(game.user, "update"), actor, oldName, newName);
  if (game.user.isGM) await guardCombatants(actor, oldName, newName, () => relabelCombatants(actor, oldName, newName));
  if (count) ui.notifications.info(_loc("PENTARYN_NAMES.Synced", { name: newName, count }));
  return count;
}

/**
 * names-edge-1: a synthetic (unlinked token) actor was renamed, so only its own token follows, and
 * (GM only) that token's combatants. It carries the base actor's id, so the base-actor pass would
 * relabel every sibling token, and its prototype write would go to the ActorDelta, which drops it.
 */
async function syncToken(actor, oldName, newName) {
  const tok = actor.token;
  const scenes = tok?.parent ? [tok.parent] : [];
  const count = await relabelEmbedded(scenes, "tokens", "Token", t => t.id === tok.id && t.canUserModify(game.user, "update"), actor, oldName, newName);
  if (game.user.isGM) await guardCombatants(actor, oldName, newName, () => relabelEmbedded(game.combats, "combatants", "Combatant", c => c.tokenId === tok.id, actor, oldName, newName));
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
  await relabelEmbedded(game.combats, "combatants", "Combatant", () => true, actor, oldName, newName);
}

/**
 * names-edge-3: the GM-only combatant pass is its own write; a refusal is logged once and the
 * rename carries on, so the token toast still shows and sync resolves with the token count.
 */
async function guardCombatants(actor, from, to, pass) {
  try {
    await pass();
  } catch (err) {
    log?.warn("relabel combatants after rename failed", { actor: actor.uuid, from, to }, err);
  }
}

/**
 * The shared loop: for each parent in turn, plan the relabels of its `collection` with the token
 * rule and write them in ONE batch `updateEmbeddedDocuments(embeddedName, …)`; parents with nothing
 * to change are not written. Returns how many documents were relabelled.
 */
async function relabelEmbedded(parents, collection, embeddedName, canEdit, actor, oldName, newName) {
  let n = 0;
  for (const p of parents) {
    const updates = planTokenRelabels([...p[collection]], { actorId: actor.id, oldName, newName, canEdit });
    if (updates.length) {
      await p.updateEmbeddedDocuments(embeddedName, updates);
      n += updates.length;
    }
  }
  return n;
}

/**
 * The API row `sync`: resolve `ref` to the BASE actor, then `sync`. A token, a placeable, a token id
 * or a token's synthetic actor all mean the world actor, because Foundry routes a synthetic actor's
 * update to its ActorDelta, which has no prototypeToken — the prototype relabel would be dropped
 * while still counted. Legacy row: a miss reaches `sync` as null and rejects with a TypeError; a
 * coded resolve error (AMBIGUOUS, BAD_ARGS) comes back as fail(code, reason), writing nothing.
 * names-rob-2: a missing or non-string oldName/newName is refused first with fail("BAD_ARGS"); before,
 * it blanked every matching label and toasted "undefined". names-maint-1: async, so every outcome —
 * count, fail(), the TypeError — comes back through a Promise.
 */
export async function syncRef(ref, oldName, newName) {
  if (typeof oldName !== "string" || typeof newName !== "string") return fail("BAD_ARGS", "oldName and newName must be strings");
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
  log = ctx.log;
  // Capture the old name before it is overwritten, keyed by actor id: one Actor.updateDocuments
  // batch shares its options across every actor in it (names-ac-2).
  reg.on("preUpdateActor", (actor, changes, options) => {
    if ("name" in changes && changes.name !== actor.name) (options.pentarynOldNames ??= {})[actor.id] = actor.name;
  }, { label: "preUpdateActor: remember old name" });

  // Act only on the client that made the change, never on names' own prototype write.
  reg.on("updateActor", (actor, changes, options, userId) => {
    const from = options.pentarynOldNames?.[actor.id];
    if (userId !== game.user.id || options.pentarynNames || !from || !("name" in changes)) return;
    const to = actor.name;
    chained(actor.id, () => sync(actor, from, to)).catch(err => ctx.log.warn("relabel after rename failed", { actor: actor.uuid, from, to }, err));
  }, { label: "updateActor: relabel" });
}

export function uninstall() {
  chains.clear();
}
