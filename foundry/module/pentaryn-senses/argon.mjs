/**
 * Pentaryn Senses — ADAPTER for Argon (enhancedcombathud). The only file that touches `ui.ARGON`.
 * Adjustments row: argon-light-pick-collapse-panels. The shared argon-kit (Wave 8.6) replaces this
 * body later.
 */

import { MODULE } from "./senses-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);   // the kit log (senses-R6)
const warn = (label, err) => log.warn(`light ${label}`, err);

/**
 * Close Argon's open panels. An open Combat HUD panel (Cast Spell) covers the map, and a pick click
 * landed on a spell behind it (usability Area 6 re-run, W10), so a pick closes them first, as Argon
 * does for another panel.
 */
export function collapseArgonPanels() {
  try { ui.ARGON?.collapseAllPanels?.(); } catch (e) { warn("collapse HUD panels", e); }
}
