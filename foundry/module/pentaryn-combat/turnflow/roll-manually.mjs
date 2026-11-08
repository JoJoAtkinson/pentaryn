/**
 * Roll manually (feature; no setting, no toggle, no remembered state — Joe, 2026-11-07; feedback
 * triage 2026-11 cluster L6, `M4D2Im`): dnd5e's d20 roll window (attack, check, save) gets a fourth,
 * quieter button beside Advantage / Normal / Disadvantage. It rolls in Normal mode and opens core's
 * Roll Resolution box for the d20, so the player rolls at the table and types the face they kept
 * (advantage is the table's business: roll two, keep the one the rule says, type that). A box left
 * blank is rolled by the computer (core RollResolver#_onSubmitForm). Quick rolls, damage rolls and
 * blind rolls stay digital; totals go through the aoe tray. Normal mode means the advantage-based
 * Sneak Attack offer (turn-riders.mjs) does not fire for such a roll.
 *
 * How one roll goes manual without touching the player's Dice Configuration: the button's
 * data-action "manual" reaches D20RollConfigurationDialog#_finalizeConfig (dnd5e 6.0.6:19468),
 * which marks each roll config (options.pentarynManual). Core has no per-roll switch —
 * Roll.identifyFulfillableTerms (foundry.mjs 14.369:34985) and RollResolver's own identification
 * both read the client setting core.diceConfiguration — so while a marked roll's _evaluate (:34512)
 * runs its synchronous prefix (resolverImplementation, the resolver's constructor and
 * awaitFulfillment's term identification: every read of that setting before the first await)
 * ClientSettings#get answers with the d20 as Manual. The flag is the roll instance and is down again
 * before _evaluate's promise is returned, so another roll evaluating on this client (aoe's
 * auto-damage, a second swing) reads the real setting. A reroll inside such a roll (Lucky) is read
 * after the first await and is rolled by the computer. MANUAL_ROLLS is on roles 2–4 in this world; a
 * user without it sees no button and is never flipped. Every wrap goes through the kit (C32).
 */

import { CSS, MODULE, manualDiceConfig } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { wrapMethod } from "../lib/patch.mjs";
import { htmlRoot } from "../lib/api.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);
const handles = [];
/** The button's data-action: dnd5e passes it to _finalizeConfig; it is also core's fulfillment method name. */
export const ACTION = "manual";
/** `roll.options[OPTION] === true`: this roll is rolled at the table. */
export const OPTION = "pentarynManual";
const BUTTON = `${CSS}roll-manually`;
const LABEL = "PENTARYN_COMBAT.RollManually.Label";
const HINT = "PENTARYN_COMBAT.RollManually.Hint";
/** The marked roll whose fulfillment is being identified right now — set and cleared synchronously. */
let manualRoll = null;

const allowed = () => !!game.user?.hasPermission?.("MANUAL_ROLLS");
const diceKey = () => foundry.dice?.Roll?.DICE_CONFIGURATION_SETTING ?? "diceConfiguration";

/* ── the button ──────────────────────────────────────────────────────────── */
// dnd5e renders its buttons once (roll-buttons.hbs); a change re-renders only the formulas part, so
// the button is added once per window and found again on later renders.

const onD20Dialog = (app, html) => {
  try {
    if (!allowed()) return;
    const nav = htmlRoot(html)?.querySelector?.("nav.dialog-buttons");
    if (!nav || nav.querySelector(`.${BUTTON}`)) return;
    const button = document.createElement("button");
    button.type = "submit";
    button.className = BUTTON;
    button.dataset.action = ACTION;
    button.dataset.tooltipText = _loc(HINT);
    button.innerHTML = `<i class="fa-solid fa-keyboard" inert></i> ${foundry.utils.escapeHTML(_loc(LABEL))}`;
    nav.append(button);
  } catch (err) { log.warn("Roll manually: button not added", err); }
};

/* ── the three wraps ─────────────────────────────────────────────────────── */

function patchDialog() {
  try {
    const proto = globalThis.dnd5e?.applications?.dice?.D20RollConfigurationDialog?.prototype;
    if (!proto?._finalizeConfig || proto._finalizeConfig._pcRollManually) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "_finalizeConfig", marker: "_pcRollManually", adjustments: "combat-dnd5e-roll-manually-action", label: "D20RollConfigurationDialog#_finalizeConfig" },
      function (wrapped, config, action) {
        const out = wrapped(config, action);   // dnd5e: an action that is not advantage / disadvantage is Normal mode
        if (action === ACTION && allowed()) {
          for (const roll of config?.rolls ?? []) {
            roll.options ??= {};
            roll.options[OPTION] = true;
          }
        }
        return out;
      }, { log }));
  } catch (err) { log.warn("Roll manually: roll window not patched", err); }
}

function patchEvaluate() {
  try {
    const proto = foundry.dice?.Roll?.prototype;
    if (!proto?._evaluate || proto._evaluate._pcRollManually) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "_evaluate", marker: "_pcRollManually", adjustments: "combat-core-roll-manually-evaluate", label: "Roll#_evaluate" },
      function (wrapped, options = {}) {
        if (!this.options?.[OPTION] || options?.allowInteractive === false || !allowed()) return wrapped(options);
        manualRoll = this;
        try {
          return wrapped(options);   // the async body runs to its first await before this returns: the setting reads are behind us
        } finally {
          manualRoll = null;
        }
      }, { log }));
  } catch (err) { log.warn("Roll manually: Roll#_evaluate not patched", err); }
}

function patchSettings() {
  try {
    const proto = foundry.helpers?.ClientSettings?.prototype;
    if (!proto?.get || proto.get._pcRollManually) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "get", marker: "_pcRollManually", adjustments: "combat-core-roll-manually-dice-config", label: "ClientSettings#get" },
      function (wrapped, namespace, key, ...rest) {
        const value = wrapped(namespace, key, ...rest);
        if (manualRoll !== null && namespace === "core" && key === diceKey() && !rest[0]?.document) return manualDiceConfig(value);
        return value;
      }, { log }));
  } catch (err) { log.warn("Roll manually: ClientSettings#get not patched", err); }
}

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  reg.once("init", () => { patchDialog(); patchEvaluate(); patchSettings(); }, opts("patch: Roll manually"));
  reg.on("renderD20RollConfigurationDialog", onD20Dialog, opts("Roll manually button"));
}

/** Undo the wraps (newest first); the registry unwinds the hook. */
export function uninstall() {
  manualRoll = null;
  for (const h of handles.splice(0).reverse()) h.unwrap();
}
