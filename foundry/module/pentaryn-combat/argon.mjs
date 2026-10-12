/**
 * Argon Combat HUD adapter: Foundry/Argon → plain calls for the features. The shared helpers come
 * from the vendored kit (lib/argon-kit.mjs: dropTooltip, paintBadge, applyButtons,
 * itemButtonClass, mainPanel, settlePips); this file adds combat's own. An adapter imports only
 * core and lib, so a setting a helper depends on is passed in by the caller.
 */

import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { applyButtons as kitApplyButtons, dropTooltip as kitDropTooltip, itemButtonClass, mainPanel, paintBadge as kitPaintBadge, settlePips } from "./lib/argon-kit.mjs";

const log = makeLog(MODULE);

export { itemButtonClass, mainPanel, settlePips };

/** Close core's tooltip and forget Argon's hover tooltip (never throws). */
export function dropTooltip() {
  kitDropTooltip({ log });
}

/** The uses badge on one of our buttons; `pentaryn-combat-empty` at 0. */
export function paintBadge(button, left) {
  kitPaintBadge(button, left, "pentaryn-combat-empty");
}

/**
 * Replace a bar's buttons (argon-kit's superset): Argon never attaches a panel that had no buttons
 * when the HUD was built (a Rogue or Barbarian has no Special-activation item), so our Sneak Attack
 * / Reckless toggles sat in a detached panel (usability re-run, U-3-7) — `attachDetached` puts it
 * in. `after` (turnflow/drawers.mjs placeOpenDrawers): a button added in front (Pole Strike,
 * Off-hand) moves the others, and an open drawer follows its own.
 */
export function applyButtons(panel, next, fresh, after) {
  kitApplyButtons(panel, next, fresh, { attachDetached: true, after });
}

/** Argon's hover tooltip, when it belongs to this button. */
function ownTooltip(button) {
  const t = ui.ARGON?._tooltip;
  return t && t._triggerElement === button?.element ? t : null;
}

/**
 * Area 2 (A0/A4): a tooltip open while the turn flag changed (a swing by hand, a swing of the
 * sequence) kept its old numbers ("2 of 2" after a hand swing) until the next hover. Re-render it
 * in place with fresh data. `enabled` is setting fullAttack.
 */
export function refreshOwnTooltip(button, { enabled = true } = {}) {
  const t = ownTooltip(button);
  if (!t || !enabled) return;
  Promise.resolve(button.getTooltipData()).then(data => {
    if (!data || ui.ARGON?._tooltip !== t) return;
    t._tooltipData = data;
    return t.render();
  }).catch(err => { log.debug("tooltip refresh", err); return null; });
}

/**
 * Argon commented out its own mouseleave (core's TooltipManager closes an un-annotated trigger's
 * tooltip only once the pointer enters another element), so ours closed late or not at all and
 * lingered over the roll window. Our buttons close their own tooltip on leave.
 */
export function bindTooltipLeave(button) {
  const el = button?.element;
  if (!el || el._pcLeave) return;
  el._pcLeave = true;
  el.addEventListener("mouseleave", () => { if (ownTooltip(button)) dropTooltip(); });
}

/**
 * Area 10: Argon's own buttons (Action Surge, a weapon slot) never close their hover tooltip (Argon
 * commented its mouseleave out), so it stayed on screen after a click, a bar re-render or a turn
 * change. Any Argon tooltip closes once the pointer is over something that is neither its button nor
 * the tooltip itself, or once its button has left the page. A locked (pinned) tooltip stays.
 * Pure bug fix, no setting.
 */
export function dropStrayTooltip(target = null) {
  try {
    const t = ui.ARGON?._tooltip;
    if (!t || t._locked) return;
    const trigger = t._triggerElement;
    const gone = !trigger?.isConnected;
    const away = target instanceof Node && !trigger?.contains?.(target) && !game.tooltip?.tooltip?.contains?.(target)
      && !t.element?.contains?.(target);
    if (!gone && !away) return;
    t._destroy?.(true);
    if (ui.ARGON._tooltip === t) ui.ARGON._tooltip = null;
    if (game.tooltip?.element === trigger || gone) game.tooltip?.deactivate?.();
  } catch (err) { log.debug("stray tooltip", err); }   // never let tooltip hygiene break anything
}

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

/** Release this user's targets (a pick that is then cancelled restores them; a turn end leaves them gone). */
export function releaseTargets() {
  if (!game.user.targets.size) return;
  if (canvas.tokens?.setTargets) canvas.tokens.setTargets([], { mode: "replace" });
  else for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
}

/** Argon's hover tooltip for a button inside a drawer that just closed stayed on screen (Area 4, D5). */
export function dropDrawerTooltip(panel) {
  try {
    const t = ui.ARGON?._tooltip;
    const trigger = t?._triggerElement;
    if (!t || !trigger || !panel?.element?.contains?.(trigger)) return;
    game.tooltip?.deactivate?.();
    t._destroy?.(true);
    if (ui.ARGON._tooltip === t) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("drawer tooltip", err); }   // never let tooltip hygiene break a click
}

/**
 * A turn boundary closes the drawers (Cast Spell, Use Feature…) left open on the HUD of the creature
 * whose turn ended or began, and forgets that they were open: Argon restores a drawer from its saved
 * panel state on every render, so the Paladin's Bonus-bar Cast Spell drawer from F1 was open again at
 * the start of the next turn (Area 3 re-run). `enabled` is setting drawerNearButton.
 */
export function closeDrawersOf(actors, { enabled = true } = {}) {
  try {
    if (!enabled) return;
    const hud = ui.ARGON;
    const states = hud?._hudState;
    let shown = false;
    for (const actor of actors) {
      if (!actor) continue;
      const state = states?.get?.(actor);
      if (state && typeof state === "object") {
        for (const v of Object.values(state)) if (v && typeof v === "object" && "visible" in v) v.visible = false;
      }
      if (hud?._actor === actor) shown = true;
    }
    if (shown) hud.collapseAllPanels?.();
  } catch (err) { log.debug("close drawers", err); }   // never break a turn change
}

/**
 * The first own property descriptor of `name` up `obj`'s prototype chain (not `obj` itself) that
 * `accept` takes, else null: an Argon getter to wrap per instance (the pips, the Reaction slot's
 * label) or a PIXI accessor (PreciseText x/y).
 */
export function protoDescriptor(obj, name, accept = () => true) {
  for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d && accept(d)) return d;
  }
  return null;
}
