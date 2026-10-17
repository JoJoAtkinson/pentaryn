// pentaryn kit 1.2.0 · vendored from foundry/lib/queries.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * `CONFIG.queries` handlers from the API manifest. A row with `query: true` becomes
 * `CONFIG.queries["<module>.<queryName ?? path>"]`, GM-guarded on both ends (or, for a
 * `relay: true` row, any sender and the active GM as receiver). There is no per-module
 * `queries.mjs`: the manifest is the one table.
 */

import { codedError, errorCode } from "./errors.mjs";
import { isRefRow, queryNameOf, toPlain } from "./api.mjs";

/** Re-exported: modules import `queryNameOf` from lib/queries.mjs; the one formula lives in api.mjs (KIT-M1-followup). */
export { queryNameOf };

/**
 * Wrap a handler so it runs only on a GM client. Core's query dispatch passes `{user}` (the sender);
 * the bridge's own socket path calls handlers with no context, from the GM's browser itself.
 * (pentaryn-prompts' `guarded`, verbatim but for the injectable global and the two options.)
 *
 *  - `fn(data, ctx)`: core's context (`ctx.user` = the sender) is passed through as the 2nd argument;
 *    a handler that ignores it behaves as before.
 *  - `sender: "gm"` (default) rejects a non-GM sender with NOT_GM. `sender: "any"` keeps only the
 *    receiver-is-a-GM check: a player-initiated request whose handler checks ownership itself
 *    (riders' Battle Medic relay).
 */
export function guarded(fn, { g = globalThis, sender: who = "gm" } = {}) {
  return async (data, ctx) => {
    const sender = ctx?.user ?? null;
    if (who !== "any" && sender && !sender.isGM) throw codedError("NOT_GM", `${sender.name} is not a GM`);
    if (!g.game.user?.isGM) throw codedError("NOT_GM", "this client is not a GM");
    return fn(data ?? {}, ctx);
  };
}

/**
 * A player relay: any sender, run only on the active GM's client (`activeGM: false` → any GM).
 * Another client answers `NOT_GM: this client is not the active GM`. `fn(data, ctx)` gets the sender
 * as `ctx.user` and does its own ownership check. A manifest row says `relay: true` to get this
 * instead of `guarded` (journal `ensure`, riders' relay).
 */
export function relayed(fn, { g = globalThis, activeGM = true } = {}) {
  return async (data, ctx) => {
    const ok = activeGM ? g.game.users?.activeGM?.isSelf === true : g.game.user?.isGM === true;
    if (!ok) throw codedError("NOT_GM", activeGM ? "this client is not the active GM" : "this client is not a GM");
    return fn(data ?? {}, ctx ?? {});
  };
}

/** AC-5: how long a query waits for the module to publish before NOT_READY, and how often it looks. */
const READY_WAIT_MS = 5000;
const READY_POLL_MS = 250;

/**
 * The published API, waiting for it when the tab has not published yet (AC-5): `getApi()` is polled
 * every READY_POLL_MS up to READY_WAIT_MS (under queryGM's 10 s default); null after that. A tab
 * mid-reload then answers once it publishes instead of beating a ready tab with a NOT_READY (§5.9.1).
 */
async function awaitApi(getApi, g) {
  let api = getApi();
  for (let waited = 0; !api && waited < READY_WAIT_MS; waited += READY_POLL_MS) {
    await new Promise(resolve => (g.setTimeout ?? setTimeout)(resolve, READY_POLL_MS));
    api = getApi();
  }
  return api;
}

/**
 * Register a handler for every `query: true` row. `getApi()` returns the published API (null
 * before publish → NOT_READY, after waiting up to 5 s for the publish, AC-5). Results go through `toPlain` with no depth cap: the socket has no
 * depth limit; the 4-level cap is `inspect()`'s.
 *  - `row.queryName` names the query when it differs from the row path (prompts registers
 *    `pentaryn-prompts.replace` for the `replaceMany` row).
 *  - `row.relay: true` registers through `relayed` (any sender, active GM receiver) instead of `guarded`,
 *    and the API function gets core's ctx as a trailing argument (`fn(d, ctx)` / `fn(d.ref, d, ctx)`) so it
 *    can check ownership against `ctx.user` (§5.9.4). Guarded rows are called exactly as before.
 * @returns {string[]} the query names registered
 */
export function registerQueries(manifest, getApi, { g = globalThis, log = null } = {}) {
  const names = [];
  g.CONFIG.queries ??= {};
  for (const row of manifest.rows ?? []) {
    if (!row.query) continue;
    const name = queryNameOf(manifest, row);
    if (names.includes(name)) throw new Error(`${manifest.module}: query "${name}" is registered twice`);
    const handler = async (data = {}, ctx) => {
      const api = await awaitApi(getApi, g);
      if (!api) throw codedError("NOT_READY", manifest.module);
      const fn = row.path.split(".").reduce((o, k) => o?.[k], api);
      if (typeof fn !== "function") throw codedError("INTERNAL", row.path);
      const d = row.wire ? row.wire(data) : data;
      const tail = row.relay ? [ctx] : [];
      const out = row.legacy && row.args
        ? await fn(...row.args(d), ...tail)
        : isRefRow(row) ? await fn(d.ref, d, ...tail) : await fn(d, ...tail);
      return toPlain(out, { maxDepth: Infinity });
    };
    g.CONFIG.queries[name] = row.relay ? relayed(handler, { g }) : guarded(handler, { g });
    names.push(name);
  }
  log?.debug?.("queries", names);
  return names;
}

/**
 * Ask the active GM to run a query. On the GM's own client the handler runs locally, raced against
 * the same `timeout` (`TIMEOUT: <name>`, AC-4; the handler is not cancelled). Throws NO_GM when no GM is connected. A remote rejection comes back coded (KIT-R7): socket.io's
 * ack timeout ("operation has timed out") is `TIMEOUT: <name>`; the GM handler's own coded error
 * (NOT_GM, NOT_READY, …) crosses the socket as its message and keeps its code; anything else is INTERNAL.
 */
export async function queryGM(name, data, { g = globalThis, timeout = 10000 } = {}) {
  const gm = g.game.users?.activeGM;
  if (!gm) throw codedError("NO_GM", name);
  if (gm.isSelf) {
    const handler = g.CONFIG.queries?.[name];
    if (typeof handler !== "function") throw codedError("UNSUPPORTED", name);
    // AC-4: the same timeout bounds the local path; the handler keeps running, as it does on a remote GM
    let timer;
    const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(codedError("TIMEOUT", name)), timeout); });
    try {
      return await Promise.race([handler(data, { user: g.game.user }), expiry]);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    return await gm.query(name, data, { timeout });
  } catch (err) {
    const message = String(err?.message ?? err);
    const remote = errorCode(err);
    if (!remote && /timed out/i.test(message)) throw codedError("TIMEOUT", name);
    const code = remote ?? "INTERNAL";
    throw codedError(code, message.startsWith(`${code}:`) ? message.slice(code.length + 1).trimStart() : message);
  }
}
