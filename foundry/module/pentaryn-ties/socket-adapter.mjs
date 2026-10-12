/**
 * Pentaryn NPC Ties — the module socket (`module.pentaryn-ties`) as an action table (ties-38).
 *
 * ADAPTER. A caller hands `listen` a table of actions; each row says whether only the active GM acts
 * on it (`gmOnly`, the default) or every client does (the tempo bubble). A new GM action is a row in
 * its caller's table, never another hand-written `game.socket.on` with its own copy of the GM test.
 *
 * Two callers listen — the reverse-side relay and the study conduit — each registered in its own
 * try/catch by the conduit feature, so a conduit that fails to register cannot cost the relay that
 * has been shipping since 0.9.0. Identity always comes from the server (`senderId`, the handler's
 * second argument), never from the payload.
 */

import { MODULE } from "./ties-core.mjs";
import { isActiveGM } from "./lib/election.mjs";

export const CHANNEL = `module.${MODULE}`;

/**
 * @param {Record<string, { run: (payload, senderId) => *, gmOnly?: boolean, guard?: boolean }>} actions
 * @param {{ failed?: (err) => void }} opts  called with a thrown or rejected run (guarded rows only)
 */
export function listen(actions, { failed = () => {} } = {}) {
  game.socket.on(CHANNEL, async (payload, senderId) => {
    const row = Object.hasOwn(actions, payload?.action ?? "") ? actions[payload.action] : null;
    if (!row) return;
    if (row.gmOnly !== false && !isActiveGM()) return;
    if (row.guard === false) return row.run(payload, senderId);
    try {
      await row.run(payload, senderId);
    } catch (err) {
      failed(err);
    }
  });
}

/** Emit to every other client (the sender never receives its own emit). */
export function send(payload) {
  game.socket.emit(CHANNEL, payload);
}
