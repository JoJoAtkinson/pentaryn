/**
 * pentaryn-prompts — FEATURE: every marker token is born hidden, sightless and size-locked, carries
 * its size flag and wears the right nameplate/tint (markers-adapter onPreCreateToken). Registered at
 * load, so nothing created before `ready` slips past the hiding. Synchronous: it is a pre-hook.
 */

import { onPreCreateToken } from "./markers-adapter.mjs";

export function install(reg, ctx) {
  reg.on("preCreateToken", (doc, data) => {
    try { onPreCreateToken(doc, data); } catch (err) { ctx.log.warn("preCreateToken", err); }
  }, { guard: false, label: "preCreateToken: hide and stamp markers" });
}

/** Nothing of its own to undo: the entry's reg.offAll() removes the hook. */
export function uninstall() {}
