/**
 * Pentaryn Combat — ENTRY #2 = esmodules[1] (D11 keeps two entries). Wiring only: installs the
 * turn-flow features, then the HUD features, synchronously while this file evaluates, in the order
 * their hooks registered before the split (the hooks golden pins it). Shares context.mjs with
 * combat.mjs (one registry, one ctx).
 *
 *   turnflow/  action-buttons, boundaries, helper-token, dialogs, death, portrait, [patches init],
 *              manual-dice, effects, drawers, [patches ready], movement
 *   hud/       tooltips, picker, bars (Full Attack, follow-ups, commands, pips); buttons-ui (ui)
 */

import { installFeature, reg } from "./context.mjs";
// Turn flow (special actions, Opportunity Attack, Esc, death saves, portrait, follow …): features
// installed here, first, in the order turnflow.mjs registered them before the split. Loaded through
// this entry, not listed in module.json, so a world relaunch was not needed to load them.
import * as actionButtons from "./turnflow/action-buttons.mjs";
import * as boundaries from "./turnflow/boundaries.mjs";
import * as helperToken from "./turnflow/helper-token.mjs";
import * as dialogs from "./turnflow/dialogs.mjs";
import * as death from "./turnflow/death.mjs";
import * as portrait from "./turnflow/portrait.mjs";
import * as patches from "./patches.mjs";
import * as manualDice from "./turnflow/manual-dice.mjs";
import * as effects from "./turnflow/effects.mjs";
import * as drawers from "./turnflow/drawers.mjs";
import * as movement from "./turnflow/movement.mjs";

import * as tooltips from "./hud/tooltips.mjs";
import * as picker from "./hud/picker.mjs";
import * as bars from "./hud/bars.mjs";

for (const feature of [actionButtons, boundaries, helperToken, dialogs, death, portrait, patches, manualDice, effects, drawers]) installFeature(feature);
patches.installReady(reg, null);
installFeature(movement);

// Then the HUD's own features, in the order hud.mjs registered them before the split.
for (const feature of [tooltips, picker, bars]) installFeature(feature);
