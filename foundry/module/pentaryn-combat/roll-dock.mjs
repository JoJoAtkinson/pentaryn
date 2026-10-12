/**
 * Roll windows docked above the swing strip (feature; setting dockRollDialogs, usability Area 2).
 *
 * While a Full Attack runs, every dnd5e roll window and the manual-dice Roll Resolution window sits
 * with its bottom edge just above the strip and says which swing it is; outside a sequence a roll
 * window is only kept on screen. The docking state lives with the strip it docks to (strip.mjs);
 * this feature owns the four registrations. combat.mjs installs it FIRST, while its import graph
 * evaluates — where strip.mjs registered these hooks before the migration — so they keep their
 * place ahead of every other listener on these hooks.
 */

import { onRollWindow, onRollWindowClose } from "./strip.mjs";

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  reg.on("renderRollConfigurationDialog", (app) => onRollWindow(app, { weapon: true }), opts("dock roll window"));
  reg.on("renderRollResolver", (app) => onRollWindow(app, { weapon: true }), opts("dock roll resolver"));
  reg.on("closeRollConfigurationDialog", onRollWindowClose, opts("roll window closed"));
  reg.on("closeRollResolver", onRollWindowClose, opts("roll resolver closed"));
}

/** No state of its own (strip.hide() clears the docking); the registry unwinds the hooks. */
export function uninstall() {}
