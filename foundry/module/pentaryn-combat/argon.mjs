/**
 * Argon Combat HUD adapter: the only file outside the vendored lib/argon-kit.mjs that reads or
 * pokes `ui.ARGON` for module-wide jobs. Grows over the migration (guide S6b/S8: mainPanel,
 * releaseTargets, the tooltip helpers, settlePips); today it holds the settings' re-render.
 */

import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/**
 * Re-render the HUD after a setting changed. Only a bound HUD: with no actor Argon's panels throw
 * "reading 'system' of null". A throwing render (the HUD closed meanwhile) is swallowed at debug.
 */
export function renderHud() {
  try {
    if (ui.ARGON?._actor) ui.ARGON.render();
  } catch (err) {
    log.debug("HUD re-render (HUD closed)", err);
  }
}
