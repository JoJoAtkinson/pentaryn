// pentaryn kit 1.1.0 · vendored from foundry/lib/queries.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * `CONFIG.queries` handlers from the API manifest. A row with `query: true` becomes
 * `CONFIG.queries["<module>.<queryName ?? path>"]`, GM-guarded on both ends (or, for a
 * `relay: true` row, any sender and the active GM as receiver). There is no per-module
 * `queries.mjs`: the manifest is the one table.
 */

import { codedError } from "./errors.mjs";
import { toPlain } from "./api.mjs";

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

/** The query name a row registers: `<module>.<row.queryName ?? row.path>`. */
export function queryNameOf(manifest, row) {
  return `${manifest.module}.${row.queryName ?? row.path}`;
}

/**
 * Register a handler for every `query: true` row. `getApi()` returns the published API (null
 * before publish → NOT_READY). Results go through `toPlain` with no depth cap: the socket has no
 * depth limit; the 4-level cap is `inspect()`'s.
 *  - `row.queryName` names the query when it differs from the row path (prompts registers
 *    `pentaryn-prompts.replace` for the `replaceMany` row).
 *  - `row.relay: true` registers through `relayed` (any sender, active GM receiver) instead of `guarded`.
 * @returns {string[]} the query names registered
 */
export function registerQueries(manifest, getApi, { g = globalThis, log = null } = {}) {
  const names = [];
  g.CONFIG.queries ??= {};
  for (const row of manifest.rows ?? []) {
    if (!row.query) continue;
    const name = queryNameOf(manifest, row);
    if (names.includes(name)) throw new Error(`${manifest.module}: query "${name}" is registered twice`);
    const handler = async (data = {}) => {
      const api = getApi();
      if (!api) throw codedError("NOT_READY", manifest.module);
      const fn = row.path.split(".").reduce((o, k) => o?.[k], api);
      if (typeof fn !== "function") throw codedError("INTERNAL", row.path);
      const d = row.wire ? row.wire(data) : data;
      const out = row.legacy && row.args
        ? await fn(...row.args(d))
        : row.params?.[0]?.name === "ref" ? await fn(d.ref, d) : await fn(d);
      return toPlain(out, { maxDepth: Infinity });
    };
    g.CONFIG.queries[name] = row.relay ? relayed(handler, { g }) : guarded(handler, { g });
    names.push(name);
  }
  log?.debug?.("queries", names);
  return names;
}

/**
 * Ask the active GM to run a query. On the GM's own client the handler runs locally.
 * Throws NO_GM when no GM is connected.
 */
export async function queryGM(name, data, { g = globalThis, timeout = 10000 } = {}) {
  const gm = g.game.users?.activeGM;
  if (!gm) throw codedError("NO_GM", name);
  if (gm.isSelf) {
    const handler = g.CONFIG.queries?.[name];
    if (typeof handler !== "function") throw codedError("UNSUPPORTED", name);
    return handler(data, { user: g.game.user });
  }
  return gm.query(name, data, { timeout });
}
