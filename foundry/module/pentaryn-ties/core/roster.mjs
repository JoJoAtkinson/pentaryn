/**
 * The inspect window's PC roster (U-7-3): which characters get a Share switch, and their labels.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { firstName } from "./rules.mjs";

/**
 * **The table's player characters** — who the GM's inspect window gives a Share switch (and a
 * Simulate roller row) to. Plain data in, so it is fixture-tested (`test/known.mjs`):
 *
 *   actors  `[{ id, name, type, pile, polymorphed, playerOwnerIds: [userId] }]`
 *   users   `[{ id, isGM, characterId }]`
 *
 * Every non-GM user's assigned character is in. A character no player has picked is in only when
 * one of its player owners has no pick at all (a player who never chose keeps every character
 * they own). Out: item piles, scene markers (a whole word `marker`, `crowd` or `hotspot` in the name —
 * "Marker · 1", "Drow Commoner (crowd) 1", "Hotspot · Look"; a PC named "Crowder" stays, ext-11), and
 * **transformed copies** (dnd5e's
 * `isPolymorphed` — knowledge shared onto "Caven Calderon (Allosaurus)" would vanish with the
 * form, and its "Caven" switch sat beside the real one). The 2026-10 run's share row had 17
 * switches, 13 of them test characters owned by one test user who had picked one.
 *
 * If that leaves nobody (a world with no players set up yet), every eligible character is listed,
 * as before, so the window never loses its switches outright.
 */
export function tablePCs(actors = [], users = []) {
  const players = (Array.isArray(users) ? users : []).filter(u => u && !u.isGM);
  const assigned = new Set(players.map(u => u.characterId).filter(Boolean));
  const hasPick = new Set(players.filter(u => u.characterId).map(u => u.id));
  const eligible = (Array.isArray(actors) ? actors : []).filter(
    a => a && a.type === "character" && !a.pile && !a.polymorphed && !/\b(marker|crowd|hotspot)\b/i.test(String(a.name ?? ""))
  );
  const table = eligible.filter(
    a => assigned.has(a.id) || (Array.isArray(a.playerOwnerIds) && a.playerOwnerIds.some(id => !hasPick.has(id)))
  );
  return table.length ? table : eligible;
}

/**
 * A switch label per name: the first name, or the whole name where two share a first name
 * (two "Caven" switches told the GM nothing about which was which).
 */
export function switchLabels(names = []) {
  const count = new Map();
  for (const n of names) count.set(firstName(n), (count.get(firstName(n)) ?? 0) + 1);
  return names.map(n => (count.get(firstName(n)) > 1 ? String(n ?? "?").trim() || "?" : firstName(n)));
}
