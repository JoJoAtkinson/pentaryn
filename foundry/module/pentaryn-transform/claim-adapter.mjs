/**
 * Pentaryn Transform — ADAPTER: one tab writes (transform-core-async-2, [declared]). isRunner picks one
 * user, but every tab of that user passes it: the MCP bridge tab and a GM browser tab would both end
 * the same form. claimed() elects one tab per document and job with the kit's claimDocument
 * (flags.pentaryn-transform.claims.<key>) before an automatic write; sweep-adapter.mjs claims its
 * forms the same way.
 */

import { MODULE } from "./transform-core.mjs";
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
