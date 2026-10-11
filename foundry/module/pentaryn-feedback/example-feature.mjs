/**
 * Pentaryn Feedback — example feature. Copy this file to add a feature; list it in FEATURES in the entry.
 *
 * GLUE, one feature: `install(reg, ctx)` registers hooks through the registry (never Hooks.on
 * directly) and may return an API contribution `{ rows, impl }`; `uninstall()` drops its state.
 * Hooks registered through `reg` are removed by the entry's uninstall, so this file only clears
 * what it owns.
 */

import { MODULE, noteText } from "./feedback-core.mjs";

/** Session state: actorId → { note, at }. Pruned on deleteActor; never persisted. */
const lastSeen = new Map();

export function install(reg, ctx) {
  reg.on("updateActor", (actor, changes) => {
    if (!ctx.setting("enabled")) return;
    const mine = changes?.flags?.[MODULE];
    if (!mine || !("note" in mine || "-=note" in mine)) return;
    const value = noteText(mine.note);
    lastSeen.set(actor.id, { note: value, at: Date.now() });
    ctx.emit("noteChanged", actor, value);
  }, { label: "updateActor: note" });

  reg.on("deleteActor", actor => {
    lastSeen.delete(actor.id);
  }, { label: "deleteActor: prune" });

  ctx.expose({ lastSeen: id => lastSeen.get(id) ?? null });

  return {
    rows: [{
      path: "recent",
      params: [],
      returns: "{ id, note, at }[]",
      gm: false, writes: false,
      doc: "Actors whose note changed this session, newest first.",
    }],
    impl: {
      recent: () => [...lastSeen].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at),
    },
  };
}

export function uninstall() {
  lastSeen.clear();
}
