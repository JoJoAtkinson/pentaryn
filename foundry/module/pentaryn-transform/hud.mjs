// Pentaryn Transform — ENTRY 1 (esmodules[1]): Starry Form and the Argon Combat HUD. Wiring only.
//
// Installs, in this order (golden/hooks.json): starry.mjs (Starry Form's hooks), then
// hud-panels.mjs (its pointermove listener, then the HUD's hooks). Shares wiring.mjs's log, hook
// registry and ctx with transform.mjs (esmodules[0]); the Wave 8 collapse folds this file into it
// once the cross-module render-order fixture exists (D11).

import { installFeature } from "./wiring.mjs";
import * as starry from "./starry.mjs";
import * as hudPanels from "./hud-panels.mjs";

export { cancelTargetPicker } from "./argon.mjs";

/** Features this entry installs, in load order. */
const FEATURES = [starry, hudPanels];

for (const feature of FEATURES) installFeature(feature);
