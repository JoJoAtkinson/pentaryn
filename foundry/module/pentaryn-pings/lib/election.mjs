// pentaryn kit 1.0.1 · vendored from foundry/lib/election.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Who acts. Every client sees the same hook; usually exactly one must act on it. The predicates
 * below are DIFFERENT truth tables on purpose — a call site keeps the one it uses today:
 *
 *   isActiveGM()          the active GM's client only (game.users.activeGM?.isSelf)
 *   isAnyGM()             every GM client (game.user.isGM)
 *   isActiveGMOrLoneGM()  the active GM; with no active GM resolved, any GM (pentaryn-senses)
 *   pickRunner()          the active GM, else the first active owner by id (pentaryn-transform)
 *   claimDocument()       one client among several that all pass the test above — two sessions on
 *                         the GM account (the MCP bridge tab plus a GM browser tab) are both
 *                         activeGM.isSelf
 */

export function isActiveGM({ g = globalThis } = {}) {
  return g.game?.users?.activeGM?.isSelf === true;
}

export function isAnyGM({ g = globalThis } = {}) {
  return g.game?.user?.isGM === true;
}

/** pentaryn-senses' `isWriter`: `game.users.activeGM?.isSelf ?? game.user.isGM`. */
export function isActiveGMOrLoneGM({ g = globalThis } = {}) {
  return g.game?.users?.activeGM?.isSelf ?? g.game?.user?.isGM;
}

/**
 * The one user whose client performs an automatic job: the active GM, else the first active
 * owner by id.
 * @param {{ activeGMId: string|null, ownerIds: string[] }} who  ownerIds: active non-GM owners
 * @returns {string|null}
 */
export function pickRunner({ activeGMId = null, ownerIds = [] } = {}) {
  if (activeGMId) return activeGMId;
  return [...ownerIds].sort()[0] ?? null;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Elect exactly one client to act on a broadcast document event. Last writer wins: each candidate
 * stamps its socket id on the document and, once the writes have settled, only the client whose id
 * is still there proceeds. Every client sees the server's one order of writes, so they all agree.
 * A client arriving after a claim exists stands down at once. No socket id → act.
 * (pentaryn-aoe's claimMessage, generalised to any document and flag scope.)
 *
 * @param {object} doc
 * @param {string} key   one claim per job ("resolve", "selfApply")
 * @param {{ scope: string, settleMs?: number, reread?: (doc) => object, g?: object }} opts
 * @returns {Promise<boolean>} true on the one client that should do the work
 */
export async function claimDocument(doc, key, { scope, settleMs = 750, reread, g = globalThis } = {}) {
  const me = g.game?.socket?.id;
  if (!me || !doc?.id) return true;
  const path = `flags.${scope}.claims.${key}`;
  const held = getPath(doc, path);
  if (held) return held === me;
  await doc.update({ [path]: me });
  await new Promise(resolve => g.setTimeout(resolve, settleMs));
  const fresh = reread ? reread(doc) : doc.collection?.get?.(doc.id) ?? doc;
  return getPath(fresh ?? {}, path) === me;
}

/** `claimDocument` for a ChatMessage, re-read from `game.messages` (a deleted message → false). */
export function claimMessage(message, key, { scope, settleMs = 750, g = globalThis } = {}) {
  return claimDocument(message, key, {
    scope, settleMs, g, reread: m => g.game.messages.get(m.id) ?? {},
  });
}
