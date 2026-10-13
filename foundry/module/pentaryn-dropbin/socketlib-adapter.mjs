/**
 * Pentaryn Drop Bin — the socketlib adapter. The only file that touches `socketlib`.
 *
 * World settings and file uploads are GM-only, so a player's ledger entry is relayed to a GM:
 * `registerRecord(fn)` runs at `socketlib.ready` and registers the "record" handler;
 * `executeAsGM("record", entry)` sends one. Before `socketlib.ready` (or without socketlib) there
 * is no socket and `hasSocket()` is false.
 */

import { MODULE } from "./dropbin-core.mjs";

let socket = null;

/** Register this module with socketlib and its "record" handler (GM side runs `fn(entry)`). */
export function registerRecord(fn) {
  socket = globalThis.socketlib.registerModule(MODULE);
  socket.register("record", fn);
}

export const hasSocket = () => !!socket;

/** Is socketlib loaded at all (a hot re-import after ready registers at once)? */
export const socketlibPresent = () => !!globalThis.socketlib;

/** Run `name` on a GM's client through socketlib; its promise rejects when no GM is connected. */
export function executeAsGM(name, data) {
  return socket.executeAsGM(name, data);
}

/** Forget the socket (uninstall). */
export function resetSocket() {
  socket = null;
}
