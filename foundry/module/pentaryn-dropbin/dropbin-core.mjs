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
  DIR, FILE, DEDUPE_MS, MIRROR_DEBOUNCE_MS, ledgerKB, dedupeKey, duplicateOfTail, appendEntry, isEntryShape, isPlausibleSender, makeEntry, normaliseDeltas, listLast, findEntry,
  briefOf, searchLog, shouldCaptureDelete, restoreTarget, pileScene, resolvePile, dropReplacesTail, movedSourceId, takeMoved, rememberTransfer, TRANSFERS_KEPT,
} from "./ledger-core.mjs";
import { pinnedEntryIds } from "./lib/pins.mjs";

// Imported, then exported by name (not `export … from`), so the import-graph tools see both files.
export {
  MODULE, LOOTABLE_TYPES, lootAllState, showEye, eyePlacement,
  DIR, FILE, DEDUPE_MS, MIRROR_DEBOUNCE_MS, ledgerKB, dedupeKey, duplicateOfTail, appendEntry, isEntryShape, isPlausibleSender, makeEntry, normaliseDeltas, listLast, findEntry,
  briefOf, searchLog, shouldCaptureDelete, restoreTarget, pileScene, resolvePile, dropReplacesTail, movedSourceId, takeMoved, rememberTransfer, TRANSFERS_KEPT,
};

export const SHORT = "dropbin";
export const NS = "dropbin";
export const VERSION = "0.3.0";                          // === module.json version (a test pins it)
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

/**
 * The token a locked container's 'Locked' float goes on (dropbin-R9): the hook's own token when it
 * passed a TokenDocument, else a synthetic actor's own token, else the first placeable holding this
 * very actor object — identity, not id, because every unlinked chest of one base actor shares the
 * id. null means no float (the toast is enough).
 */
export function lockFloatToken(target, actor, placeables) {
  if (target?.documentName === "Token") return target.object ?? null;
  if (actor?.token) return actor.token.object ?? null;
  if (!actor) return null;
  for (const t of placeables ?? []) if (t.actor === actor) return t;
  return null;
}

/**
 * Every journal id pinned to a Note on any scene: the kit's null-safe rule (lib/pins.mjs, journal-EXT-9),
 * shared with journal. Re-exported for core.test's tables; itempiles.mjs imports the kit directly. The
 * core → lib edge is a test/graph-allow.json debt.
 */
export { pinnedEntryIds };

/** One of our corpses: a token this module turned into a pile (never revert one we didn't make). */
export const isOurCorpse = doc => !!doc.flags?.[MODULE]?.corpse;

/** Opted out of looting: `noLoot` on the token or on its actor. */
export const hasNoLoot = tokenDoc => !!(tokenDoc.flags?.[MODULE]?.noLoot || tokenDoc.actor?.flags?.[MODULE]?.noLoot);

/**
 * An item the GM marked "Never loot this" (`flags.pentaryn-dropbin.noLoot === true`, A2). The value is
 * boolean on purpose: Item Piles' filter below compares `=== true` after reading "true" from its row.
 */
export const isNoLootItem = item => item?.flags?.[MODULE]?.noLoot === true;

/**
 * The Item Piles filter row that keeps a noLoot item out of a corpse pile (A2). Item Piles reads the
 * item's `flags.pentaryn-dropbin.noLoot` and hides it when it is `true`: the item stays on the actor,
 * never shows in the loot window, and Loot all / isItemPileEmpty skip it. Written per corpse as the
 * pile's `overrideItemFilters` (a per-pile override REPLACES the world list, so the world rows come
 * along: corpseItemFilters).
 */
export const NO_LOOT_FILTER = Object.freeze({ path: `flags.${MODULE}.noLoot`, filters: "true" });

/** Whether a filter list (the world's or a pile override) already carries the noLoot row. */
export const hasNoLootFilter = filters => Array.isArray(filters) && filters.some(f => f?.path === NO_LOOT_FILTER.path);

/**
 * A corpse pile's `overrideItemFilters`: the world's `item-piles.itemFilters` rows as they are (string
 * or array `filters`, Item Piles cleans both), then the noLoot row once. A missing or malformed world
 * list gives the noLoot row alone.
 */
export function corpseItemFilters(worldFilters) {
  const rows = Array.isArray(worldFilters) ? worldFilters.filter(f => f && typeof f.path === "string") : [];
  const copy = rows.filter(f => f.path !== NO_LOOT_FILTER.path).map(f => ({ path: f.path, filters: Array.isArray(f.filters) ? [...f.filters] : f.filters }));
  return [...copy, { ...NO_LOOT_FILTER }];
}

/**
 * A dnd5e summon (E3): any actor dnd5e's summoning stamped (`flags.dnd5e.summon`, written by the
 * summon activity; pentaryn-creatures stamps `.origin` on its linked copies). The 2024 spirits and
 * familiars disappear at 0 HP, so such a token is never a corpse; riders removes it.
 */
export const isSummoned = actor => {
  const stamp = actor?.flags?.dnd5e?.summon;
  return !!stamp && typeof stamp === "object";
};

/* ------------------------------------------------ the world's natural-weapon filter (A1) */

/** dnd5e keeps a weapon's kind here since 3.x; the 2.x preset said `system.weaponType` and matches nothing. */
export const NATURAL_WEAPON_PATH = "system.type.value";
/** itempilesdnd5e 1.1.0's preset for dnd5e ≥ 5 (its `5.0.0` row), the value a stale world setting is reset to. */
export const DND5E_ITEM_FILTERS = Object.freeze([
  Object.freeze({ path: "type", filters: "background,class,facility,feat,race,spell,subclass" }),
  Object.freeze({ path: NATURAL_WEAPON_PATH, filters: "natural" }),
]);

const filterValues = f => (Array.isArray(f?.filters) ? f.filters : String(f?.filters ?? "").split(",")).map(v => String(v).trim());

/**
 * Whether the world's `item-piles.itemFilters` hides natural weapons on the path dnd5e 6 uses (A1).
 * Nothing migrates that setting: a world made on dnd5e 2.x kept `system.weaponType` and every Rend
 * and Bite showed up as loot. `{ ok, path, fix }`: `path` is where the `natural` row sits (null: none),
 * `fix` the one line that resets the setting (never run by this module). `filters` undefined or not
 * an array (Item Piles inactive) is `ok: null`, not applicable.
 */
export function naturalFilterCheck(filters) {
  if (!Array.isArray(filters)) return { ok: null, path: null, fix: null };
  const natural = filters.filter(f => filterValues(f).includes("natural"));
  const path = natural.find(f => f.path === NATURAL_WEAPON_PATH)?.path ?? natural[0]?.path ?? null;
  const ok = path === NATURAL_WEAPON_PATH;
  const fix = ok ? null : `game.settings.set("item-piles", "itemFilters", ${JSON.stringify(DND5E_ITEM_FILTERS)})`;
  return { ok, path, fix };
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
