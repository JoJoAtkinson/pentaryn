/**
 * HP box arithmetic (feature; setting hpMath; feedback triage 2026-11 cluster K, `GaMIoP`): "50-10"
 * typed into the Token HUD's bar box or an actor sheet's HP box gives 40. Core's
 * TokenHUD#_parseAttributeInput and dnd5e's sheet delta parser understand "=40", "+5", "-10" and
 * "50%"; an expression with an operator inside and no leading sign is evaluated with Roll.safeEval
 * and handed on as "=<result>" (rounded down), so every existing form is untouched. The boxes carry
 * a tooltip that says so.
 *
 * dnd5e's parseInputDelta is a module-private function (dnd5e.mjs 6.0.6:530 — the copy on
 * dnd5e.utils is not the one the sheets call), so the sheet side wraps
 * BaseActorSheet#_onChangeInputDelta, the one place every actor sheet's delta box goes through, and
 * rewrites the input's value before dnd5e reads it. Both wraps go through the kit (C32).
 */

import { MODULE, arithmeticAssignment } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { wrapMethod } from "../lib/patch.mjs";
import { htmlRoot } from "../lib/api.mjs";
import { setting } from "../settings.mjs";
import { opts } from "../context.mjs";

const log = makeLog(MODULE);
const handles = [];
const TIP = "PENTARYN_COMBAT.HpMath.Tip";
/** dnd5e's character, NPC and vehicle sheets name the HP box the same way (templates/actors/*). */
const HP_INPUT = 'input[name="system.attributes.hp.value"]';
/** Core's Token HUD: the two attribute-bar boxes (templates/hud/token-hud.hbs). */
const HUD_INPUTS = 'input[name="bar1"], input[name="bar2"]';

/** "50-10" → "=40" (Roll.safeEval, rounded down); anything else exactly as typed. */
export function normaliseDelta(raw) {
  try {
    const R = foundry.dice?.Roll ?? globalThis.Roll;
    return arithmeticAssignment(raw, expression => R.safeEval(expression)) ?? raw;
  } catch (err) {
    log.debug("HP math: not arithmetic after all, left as typed", err);
    return raw;
  }
}

/* ── the two parsers ─────────────────────────────────────────────────────── */

function patchTokenHud() {
  try {
    const proto = foundry.applications?.hud?.TokenHUD?.prototype;
    if (!proto?._parseAttributeInput || proto._parseAttributeInput._pcHpMath) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "_parseAttributeInput", marker: "_pcHpMath", adjustments: "combat-core-token-hud-arithmetic", label: "TokenHUD#_parseAttributeInput" },
      function (wrapped, name, attr, input) {
        if (setting("hpMath") && typeof input === "string") input = normaliseDelta(input);
        return wrapped(name, attr, input);
      }, { log }));
  } catch (err) { log.warn("HP math: Token HUD not patched", err); }
}

function patchActorSheet() {
  try {
    const proto = globalThis.dnd5e?.applications?.actor?.BaseActorSheet?.prototype;
    if (!proto?._onChangeInputDelta || proto._onChangeInputDelta._pcHpMath) return;
    handles.push(wrapMethod(MODULE, { target: proto, name: "_onChangeInputDelta", marker: "_pcHpMath", adjustments: "combat-dnd5e-sheet-arithmetic", label: "BaseActorSheet#_onChangeInputDelta" },
      function (wrapped, event) {
        const input = event?.target;
        if (setting("hpMath") && typeof input?.value === "string") {
          const value = normaliseDelta(input.value);
          if (value !== input.value) input.value = value;
        }
        return wrapped(event);
      }, { log }));
  } catch (err) { log.warn("HP math: actor sheet not patched", err); }
}

/* ── the tooltip ─────────────────────────────────────────────────────────── */

/**
 * Every box `selector` finds gets the tip as plain tooltip text. The sheet's HP box is hidden until
 * its meter is clicked, so with `meter` the enclosing [role="meter"] shows the tip too (unless dnd5e
 * gave it one of its own).
 */
function tipBoxes(root, selector, { meter = false } = {}) {
  const text = _loc(TIP);
  for (const input of root?.querySelectorAll?.(selector) ?? []) {
    input.dataset.tooltipText = text;
    const host = meter ? input.closest?.('[role="meter"]') : null;
    if (host && !host.dataset.tooltip && !host.dataset.tooltipText) host.dataset.tooltipText = text;
  }
}

const onTokenHud = (app, html) => {
  if (!setting("hpMath")) return;
  tipBoxes(htmlRoot(html), HUD_INPUTS);
};

const onActorSheet = (app, html) => {
  if (!setting("hpMath")) return;
  tipBoxes(htmlRoot(html), HP_INPUT, { meter: true });
};

/* ── install ─────────────────────────────────────────────────────────────── */

export function install(reg) {
  reg.once("init", () => { patchTokenHud(); patchActorSheet(); }, opts("patch: HP box arithmetic"));
  reg.on("renderTokenHUD", onTokenHud, opts("HP math tip: Token HUD"));
  reg.on("renderBaseActorSheet", onActorSheet, opts("HP math tip: actor sheet"));
}

/** Undo both wraps (newest first); the registry unwinds the hooks. */
export function uninstall() {
  for (const h of handles.splice(0).reverse()) h.unwrap();
}
