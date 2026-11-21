/**
 * Pentaryn Dice — the Dice So Nice adapter. The ONLY file that touches `game.dice3d`.
 *
 * Dice So Nice → plain data (`listDice()`), and the four things the module does to it: spawn,
 * select, clear, probe. Every internal used here is listed in core INTERNALS and checked by
 * selftest(); adjustments row dsn-persistent-dice-select.
 *
 *   spawning   game.dice3d.persistent.spawn(type, null, opts) — the public-facing entry the sidebar's
 *              "+" uses; it broadcasts to other clients and saves the die to the user's flags.
 *              Never box.spawnPersistentDie, which does neither.
 *   selecting  box.persistentDiceManager.selectedPersistentDiceIds (a Set of mesh ids), then
 *              onSelectionChanged?.() so Dice So Nice redraws the outlines.
 */

import { DSN, idsToSelect, probeInternals, spawnGroups } from "./dice-core.mjs";

/** `game.dice3d`, or null when Dice So Nice is inactive or not built yet. */
export function dice3d({ g = globalThis } = {}) {
  if (g.game?.modules?.get?.(DSN)?.active === false) return null;
  return g.game?.dice3d ?? null;
}

/** The persistent-dice manager, or null (persistent dice off, or the box not built). */
export function manager({ g = globalThis } = {}) {
  return dice3d({ g })?.box?.persistentDiceManager ?? null;
}

/** Dice So Nice's persistent dice as plain data. */
export function listDice({ g = globalThis } = {}) {
  const m = manager({ g });
  const list = Array.isArray(m?.persistentDiceList) ? m.persistentDiceList : [];
  return list.map(mesh => ({
    id: mesh.id,
    type: mesh.notation?.type ?? null,
    owner: mesh.userData?.ownerUserId ?? null,
    linkGroupId: mesh.userData?.linkGroupId ?? null,
    secondary: !!mesh.userData?.linkGroupSecondary,
    guest: !!mesh.userData?.guest,
  }));
}

/** The selected mesh ids, in no particular order. */
export function selectedIds({ g = globalThis } = {}) {
  const set = manager({ g })?.selectedPersistentDiceIds;
  return set && typeof set[Symbol.iterator] === "function" ? [...set] : [];
}

/** The internals check, against the live `game.dice3d`. */
export function internals({ g = globalThis } = {}) {
  return probeInternals(dice3d({ g }));
}

/** Whether Dice So Nice is active and its persistent dice can be driven. */
export function ready({ g = globalThis } = {}) {
  return !!manager({ g }) && typeof dice3d({ g })?.persistent?.spawn === "function";
}

/**
 * Add `userId`'s dice (optionally one `type`) to the selection. Union, not replace: "all d6" then
 * "all d8" selects both. @returns {number} how many dice are selected afterwards
 */
export function selectMine({ userId, type = null, g = globalThis } = {}) {
  const m = manager({ g });
  if (!m?.selectedPersistentDiceIds) return 0;
  const ids = idsToSelect(listDice({ g }), { userId, type });
  for (const id of ids) m.selectedPersistentDiceIds.add(id);
  if (ids.length) m.onSelectionChanged?.();
  return m.selectedPersistentDiceIds.size;
}

/** Dice So Nice's own clear. @returns {number} how many were selected before */
export function clearSelection({ g = globalThis } = {}) {
  const m = manager({ g });
  const before = m?.selectedPersistentDiceIds?.size ?? 0;
  m?.clearPersistentSelection?.();
  return before;
}

/**
 * Spawn `count` dice of `type` for this user, one after another so Dice So Nice lays them out
 * in turn. A compound die (d100) spawns as one link group per roll, as the sidebar's "+" does.
 * Stops at the first die Dice So Nice refuses (its maxDiceNumber cap warns on its own).
 * @returns {Promise<{ requested: number, spawned: number, stopped: boolean } | null>} null: not a die type
 */
export async function spawn({ type, count = 1, g = globalThis } = {}) {
  const groups = spawnGroups(type, count);
  if (!groups) return null;
  const persistent = dice3d({ g })?.persistent;
  if (typeof persistent?.spawn !== "function") return { requested: groups.length, spawned: 0, stopped: true };
  let spawned = 0;
  for (const group of groups) {
    const linkGroupId = group.length > 1 ? g.foundry.utils.randomID() : null;
    for (const die of group) {
      const opts = linkGroupId
        ? { linkGroupId, digitPlace: die.digitPlace, ...(die.secondary ? { linkGroupSecondary: true } : {}) }
        : {};
      // one at a time on purpose: Dice So Nice places each die by the count already on the table
      const mesh = await persistent.spawn(die.type, null, opts);
      if (!mesh) return { requested: groups.length, spawned, stopped: true };
    }
    spawned += 1;
  }
  return { requested: groups.length, spawned, stopped: false };
}

/** Re-render Dice So Nice's sidebar tab, when it is open. */
export function rerenderTab({ g = globalThis } = {}) {
  const tab = g.ui?.[DSN];
  if (tab?.rendered) tab.render?.();
}
