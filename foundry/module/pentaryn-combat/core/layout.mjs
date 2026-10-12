/**
 * Pentaryn Combat core — screen layout: roll-window docking, the swing tag, drawer placement, keeping a window on screen.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

/**
 * Where a roll window goes while a Full Attack runs: its bottom edge just above the swing strip, so
 * the strip (Adv / Dis / Quick / Stop) is never under it and the window's buttons sit at the same
 * height for every swing, however tall the window is. A window the player dragged sets `last`
 * (its left and bottom edge) for the next ones. Clamped to the viewport.
 * @returns {{left: number, top: number}}
 */
export function dockRect({ stripTop = null, height = 0, width = 0, viewW = 0, viewH = 0, gap = 8, last = null } = {}) {
  const h = Math.max(0, Number(height) || 0);
  const w = Math.max(0, Number(width) || 0);
  const bottom = Number.isFinite(last?.bottom) ? last.bottom : (Number.isFinite(stripTop) ? stripTop - gap : viewH - gap);
  const left0 = Number.isFinite(last?.left) ? last.left : (viewW - w) / 2;
  const top = Math.max(gap, Math.min(Math.round(bottom - h), Math.round(viewH - h - gap)));
  const left = Math.max(gap, Math.min(Math.round(left0), Math.round(viewW - w - gap)));
  return { left, top };
}

/** The roll window's title tag while a sequence runs: "Longsword · swing 2 of 3" (null when idle). */
export function swingTag({ weapon = null, current = null, total = null, kind = "main", status = null } = {}) {
  if (status !== "running" || !current || !total) return null;
  return { weapon: weapon ?? "", i: current, n: total, kind: kind ?? "main" };
}

/**
 * Where Argon's drawer (Use Feature, Cast Spell, Wild Shape, Starry Form) opens: above its own
 * button, kept inside the HUD's action row. Argon opens every drawer at the row's far left, up to
 * ~370 px from the button and under the portrait.
 *
 * Every input is a SCREEN measurement (getBoundingClientRect). Argon scales the whole HUD with a CSS
 * transform (0.424 on a 1600 px window, less on a narrower one), so a screen distance is divided by
 * `scale` to become the drawer's own `left`. Mixing the two (the drawer's unscaled offsetWidth with
 * the row's scaled width) pinned every wide drawer at 0, under the portrait (Area 4 live run, D1).
 *
 * @param {object} m
 * @param {number} m.buttonLeft  the button's left edge
 * @param {number} m.hudLeft     the left edge of the element `left` is measured from (the drawer's offsetParent)
 * @param {number} m.hudWidth    how far right of hudLeft the drawer may reach
 * @param {number} m.panelWidth  the drawer's width
 * @param {number} [m.minLeft]   the drawer never starts left of this (the action row, right of the portrait)
 * @param {number} [m.scale=1]   the HUD's scale (screen px per CSS px)
 * @returns {number}  the drawer's `left` in its own CSS px
 */
export function drawerLeft({ buttonLeft = 0, hudLeft = 0, hudWidth = 0, panelWidth = 0, minLeft = null, scale = 1 } = {}) {
  const n = (v) => Number(v) || 0;
  const origin = n(hudLeft);
  const lo = Math.max(origin, minLeft === null || minLeft === undefined ? origin : n(minLeft));
  const hi = Math.max(lo, origin + n(hudWidth) - n(panelWidth));
  const x = Math.max(lo, Math.min(n(buttonLeft), hi));
  const k = n(scale) > 0 ? n(scale) : 1;
  return Math.round((x - origin) / k);
}

/**
 * Keep a window on screen. A roll window opened outside a Full Attack (Lay on Hands' Healing roll)
 * was placed partly below the viewport's bottom edge (Area 10). Returns the moved position, or
 * null when it already fits.
 * @returns {{left: number, top: number}|null}
 */
export function clampToView({ left = 0, top = 0, width = 0, height = 0, viewW = 0, viewH = 0, margin = 8 } = {}) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const l0 = Number(left) || 0;
  const t0 = Number(top) || 0;
  if (!viewW || !viewH) return null;
  const l = Math.max(margin, Math.min(l0, viewW - w - margin));
  const t = Math.max(margin, Math.min(t0, viewH - h - margin));
  const L = Math.round(l), Tp = Math.round(t);
  return (L === Math.round(l0) && Tp === Math.round(t0)) ? null : { left: L, top: Tp };
}
