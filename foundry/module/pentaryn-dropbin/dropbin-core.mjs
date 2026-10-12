/**
 * Pentaryn Drop Bin — the pure barrel
 * ===================================
 *
 * The module's constants, the pure halves of loot-core.mjs and ledger-core.mjs (re-exported), and
 * the pile rules the Item Piles patches use: plain flag reads, the pinned-journal set, the eye's
 * redraw test and the two ready-time backfill planners. No Foundry global is touched, so
 * `node test/run.mjs` imports this file bare.
 *
 * `MODULE` is defined once, in loot-core.mjs (the legacy suite imports it from there).
 */

import { MODULE, LOOTABLE_TYPES, lootAllState, showEye, eyePlacement } from "./loot-core.mjs";
import {
  DIR, FILE, DEDUPE_MS, MIRROR_DEBOUNCE_MS, ledgerKB, dedupeKey, duplicateOfTail, appendEntry, makeEntry, normaliseDeltas, listLast, findEntry,
  briefOf, searchLog, shouldCaptureDelete, restoreTarget,
} from "./ledger-core.mjs";

// Imported, then exported by name (not `export … from`), so the import-graph tools see both files.
export {
  MODULE, LOOTABLE_TYPES, lootAllState, showEye, eyePlacement,
  DIR, FILE, DEDUPE_MS, MIRROR_DEBOUNCE_MS, ledgerKB, dedupeKey, duplicateOfTail, appendEntry, makeEntry, normaliseDeltas, listLast, findEntry,
  briefOf, searchLog, shouldCaptureDelete, restoreTarget,
};

export const SHORT = "dropbin";
export const NS = "dropbin";
export const VERSION = "0.2.3";                          // === module.json version (a test pins it)
export const CONTRACT = "pentaryn-dropbin/api@1";
export const I18N = "PENTARYN_DROPBIN";
export const CSS = "pd-";
/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

/** The sound a locked container plays (ships with Foundry core). */
export const LOCK_SOUND = "sounds/lock.wav";

/**
 * Item Piles' flag data on a document, read as plain data. `doc.getFlag("item-piles", "data")`
 * returns the same value but THROWS when Item Piles is not an active package; this never does.
 * The API checks (`isValidItemPile`, `getActorFlagData`) apply Item Piles' own defaults on top and
 * stay where a default matters.
 */
export const pileFlags = doc => doc?.flags?.["item-piles"]?.data ?? null;
export const isPileFlagged = doc => !!pileFlags(doc)?.enabled;

/** A locked container's flag data, or null (piles, open or unlocked containers, non-piles). */
export function lockedContainer(data) {
  return data?.enabled && data.type === "container" && data.locked ? data : null;
}

/** Every journal id pinned to a Note on any scene. Built once per directory render. */
export function pinnedEntryIds(scenes) {
  const s = new Set();
  for (const sc of scenes) for (const n of sc.notes) if (n.entryId) s.add(n.entryId);
  return s;
}

/** The active GM user's own client (every tab of that account, W2-D1). */
export const isActiveGMSelf = users => users?.activeGM?.isSelf === true;

/** The corpse eye's disc is redrawn only when its size changed. */
export const needsRedraw = (prev, size) => prev !== size;

/**
 * Lock sounds for every container (actors and placed tokens) that has none. The plan:
 * `{ actorUpdates: [{_id, ...changes}], embedded: [{sceneId, type, updates}] }`, in walk order.
 */
export function planLockSounds(actors, scenes, sound = LOCK_SOUND) {
  const needs = data => data?.enabled && data.type === "container" && !data.lockedSound;
  const plan = { actorUpdates: [], embedded: [] };
  for (const actor of actors) {
    if (!needs(pileFlags(actor))) continue;
    plan.actorUpdates.push({ _id: actor.id, "flags.item-piles.data.lockedSound": sound,
      "prototypeToken.flags.item-piles.data.lockedSound": sound });
  }
  for (const scene of scenes) {
    const updates = [];
    for (const tok of scene.tokens) {
      if (needs(pileFlags(tok))) updates.push({ _id: tok.id, "flags.item-piles.data.lockedSound": sound });
    }
    if (updates.length) plan.embedded.push({ sceneId: scene.id, type: "Token", updates });
  }
  return plan;
}

/**
 * The in-view rule: piles never see (prototype and placed tokens), and readable pins are never
 * global. Same plan shape as planLockSounds; per scene the Token updates come before the Note ones.
 */
export function planEyesNeedView(actors, scenes) {
  const plan = { actorUpdates: [], embedded: [] };
  for (const actor of actors) {
    if (isPileFlagged(actor) && actor.prototypeToken.sight.enabled) {
      plan.actorUpdates.push({ _id: actor.id, "prototypeToken.sight.enabled": false });
    }
  }
  for (const scene of scenes) {
    const tok = [];
    for (const t of scene.tokens) if (isPileFlagged(t) && t.sight.enabled) tok.push({ _id: t.id, "sight.enabled": false });
    if (tok.length) plan.embedded.push({ sceneId: scene.id, type: "Token", updates: tok });
    const pins = [];
    for (const n of scene.notes) if (n.global && n.entry) pins.push({ _id: n.id, global: false });
    if (pins.length) plan.embedded.push({ sceneId: scene.id, type: "Note", updates: pins });
  }
  return plan;
}
