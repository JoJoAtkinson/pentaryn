/**
 * Pentaryn Transform — UI: the Starry Form constellation dialog (the sheet route). DialogV2 only.
 */

import { MODULE, CONSTELLATIONS } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { constellationLabel, constellationText } from "./starry-adapter.mjs";

const log = makeLog(MODULE);

/** Three buttons, one per constellation. Resolves to the choice, or null when closed. */
export async function pickConstellation(actor) {
  const DialogV2 = foundry.applications.api.DialogV2;
  return DialogV2.wait({
    window: { title: _loc("PENTARYN_TRANSFORM.Starry.Pick") },
    content: `<div class="pentaryn-starry-pick">${CONSTELLATIONS.map(c =>
      `<p><strong>${constellationLabel(c)}.</strong> ${constellationText(actor, c)}</p>`).join("")}</div>`,
    buttons: CONSTELLATIONS.map((c, i) => ({ action: c, label: constellationLabel(c), default: i === 0 })),
    rejectClose: false
  }).catch(err => {
    log.debug("constellation dialog failed", { actor: actor?.uuid ?? null }, err);
    return null;
  });
}
