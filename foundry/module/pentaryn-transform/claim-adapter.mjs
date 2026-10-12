/**
 * Pentaryn Transform — ADAPTER: one tab writes (transform-core-async-2, [declared]). isRunner picks one
 * user, but every tab of that user passes it: the MCP bridge tab and a GM browser tab would both end
 * the same form. claimed() elects one tab per document and job with the kit's claimDocument
 * (flags.pentaryn-transform.claims.<key>) before an automatic write; sweep-adapter.mjs claims its
 * forms the same way. endingListeners() is Wild Shape's and Starry Form's one "ending without a click"
 * (EXT-2): the Incapacitated and expiry listeners, the runner gate and the claim.
 */

import { MODULE, runnerIs } from "./transform-core.mjs";
import { claimDocument } from "./lib/election.mjs";
import { flagPath } from "./lib/flags.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

const held = new Set();   // "<uuid>#<key>" this tab is claiming or writing: a second trigger here stands down

/** Still a live document: a token's actor while its token is on its scene, else one in its collection. */
function live(doc) {
  if (doc?.isToken) return !!doc.token?.parent?.tokens?.has(doc.token.id);
  return doc?.collection?.get?.(doc.id) === doc;
}

/**
 * Run `work` on the one tab that wins `key` on `doc`; null on a loser, on a claim whose update rejects
 * (the document is already gone) and on a second trigger in this tab. The winner clears its claim
 * after the write (a key is otherwise single-use per document), so a stale socket id never blocks a
 * later ending; the callers' own checks (exists, isWildShapeForm, activeStarry) stop a late arrival.
 * A throw from `work` is the caller's.
 * @template T
 * @param {object} doc
 * @param {string} key
 * @param {() => Promise<T>|T} work
 * @returns {Promise<T|null>}
 */
export async function claimed(doc, key, work) {
  const id = `${doc.uuid}#${key}`;
  if (held.has(id)) return null;
  held.add(id);
  try {
    let won;
    try {
      won = await claimDocument(doc, key, { scope: MODULE });
    } catch (err) {
      log.debug(`the ${key} claim on ${doc.name} was refused (already gone)`, err);
      return null;
    }
    if (!won) {
      log.debug(`another session runs ${key} on ${doc.name}`);
      return null;
    }
    try {
      return await work();
    } finally {
      await release(doc, key);
    }
  } finally {
    held.delete(id);
  }
}

/** Clear this tab's claim on a document that outlived the write. */
async function release(doc, key) {
  if (!live(doc) || doc.getFlag(MODULE, `claims.${key}`) !== game.socket?.id) return;
  try {
    await doc.update({ [flagPath(MODULE, `claims.${key}`)]: _del });
  } catch (err) {
    log.debug(`clearing the ${key} claim on ${doc.name} failed`, err);
  }
}

/* ── ending without a click ──────────────────────────────────────────────── */

/** True for exactly one user for this actor (the active GM, else the first active owner), in every tab of that user (README "Two sessions"). */
export function isRunner(actor) {
  const activeGMId = game.users.activeGM?.id ?? null;
  // A connected GM always wins pickRunner: no owner scan (transform-creatures-1).
  if (activeGMId) return runnerIs(game.user.id, { activeGMId, ownerIds: [] });
  const ownerIds = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id);
  return runnerIs(game.user.id, { activeGMId, ownerIds });
}

/**
 * One feature's automatic ending (EXT-2, shared by wildshape.mjs and starry.mjs): `end` runs it on the
 * runner's one claiming tab; `onEffectChange` (createActiveEffect) ends it on Incapacitated, checked
 * after the effect lands on the actor; `onEffectUpdate` (updateActiveEffect) ends it when its own
 * effect is marked expired, else checks Incapacitated the same way. The features register these with
 * their own labels.
 * @param {object} o
 * @param {string} o.effectId                    the feature's duration effect id
 * @param {(actor: Actor) => boolean} o.isActive the feature is up on this actor
 * @param {(actor: Actor, reason: string, ...rest: any[]) => ({doc: object, key: string, work: () => any}|null)} o.ending
 *   what to claim and write, or null when there is nothing to end (checked before the runner gate)
 * @param {(err: Error) => void} o.onError       a failed ending (the feature's own warning)
 */
export function endingListeners({ effectId, isActive, ending, onError }) {
  function end(actor, reason, ...rest) {
    const job = ending(actor, reason, ...rest);
    if (!job || !isRunner(actor)) return;
    claimed(job.doc, job.key, job.work).catch(onError);
  }
  // Incapacitated (or any condition that implies it). Checked after the effect lands on the actor.
  function onEffectChange(effect) {
    const actor = effect?.parent;
    if (!(actor instanceof Actor) || !isActive(actor)) return;
    setTimeout(() => {
      if (actor.statuses?.has("incapacitated")) end(actor, "incapacitated");
    }, 0);
  }
  function onEffectUpdate(effect, changes) {
    // Foundry v14's effect registry marks a lapsed duration expired; that is the feature running out.
    if (effect.id === effectId && foundry.utils.getProperty(changes, "duration.expired") === true) {
      end(effect.parent, "expired");
      return;
    }
    onEffectChange(effect);
  }
  return { end, onEffectChange, onEffectUpdate };
}
