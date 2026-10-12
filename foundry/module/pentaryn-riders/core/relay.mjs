/**
 * Pentaryn Feature Riders — PURE: the Battle Medic relay's claim (combat-riders-41). Re-exported by
 * the riders-core barrel.
 *
 * The server sends a query to EVERY tab of the active GM's account (the MCP bridge tab and a GM
 * browser tab are both activeGM.isSelf), so the relay runs in each. Every tab stamps its socket id
 * under the request id on the patient (`flags.pentaryn-riders.relay.<requestId>.claims`); the
 * server applies the stamps in one order, and a tab receives every earlier stamp before its own
 * reply, so exactly one tab — the first to stamp — sees no other fresh stamp right after its own.
 * That tab heals and records the result; the others wait for it (pentaryn-journal's ensure relay,
 * items-journal-40, does the same). The winner's record drops its own stamp, so a tab stamping after
 * it would see only itself: the caller checks for a recorded result before and after stamping and
 * calls this only while the entry is still open.
 */

/** A request id the relay will claim on: a 16-character Foundry id. Anything else → null. */
export function relayRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9]{16}$/.test(value) ? value : null;
}

/**
 * Did this tab win? `claims` is `{ <socketId>: stampedAt }` as this tab sees it right after its own
 * stamp came back. A stamp older than `staleMs` (a tab that died mid-claim) does not count.
 */
export function relayClaimWinner(claims, me, now, staleMs = 60_000) {
  if (!claims || typeof claims !== "object" || !(me in claims)) return false;
  return Object.entries(claims).every(([id, at]) => id === me || !(now - Number(at) < staleMs));
}

/**
 * The request ids to delete when `keepId` records its result: all but the newest `keep - 1` others
 * (by their `at`), so the patient carries at most `keep` relay entries.
 * @param {Record<string, { at?: number }>} entries  `flags.pentaryn-riders.relay` as read
 */
export function relayPrune(entries, keepId, keep = 5) {
  const others = Object.entries(entries ?? {}).filter(([id]) => id !== keepId);
  others.sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0));
  return others.slice(Math.max(0, keep - 1)).map(([id]) => id);
}
