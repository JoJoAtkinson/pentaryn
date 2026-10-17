/**
 * Pentaryn Resume — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 * Past ~600 lines, split into core/<topic>.mjs behind this file as a barrel.
 */

export const MODULE = "pentaryn-resume";
export const SHORT = "resume";
export const NS = "resume";
export const VERSION = "0.2.0";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-resume/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN_RESUME";
export const CSS = "pre-";
export const FLAG_SCOPE = MODULE;

/** The User flag (under FLAG_SCOPE) that holds the user's last view. */
export const VIEW_FLAG = "view";

/** Quiet time after the last pan before the view is written (ms). */
export const SAVE_DELAY = 3000;

/** Events this module emits. New names are `pentaryn-<short>.<camelEvent>`; pre-hooks are vetoable. */
export const HOOKS = Object.freeze({
  resumed: Object.freeze({ name: "pentaryn-resume.resumed", pre: false, args: "(view)" }),
});

const finite = v => typeof v === "number" && Number.isFinite(v);
const idOrNull = v => (typeof v === "string" && v ? v : null);

/**
 * A stored view, normalised: `{ scene, level, x, y, scale, active }`. `active` is the world's
 * active scene when the view was saved. Anything without a scene id → null (no view).
 * A position missing any of x/y/scale (or with scale <= 0) drops all three.
 * @param {*} raw
 * @returns {{scene: string, level: string|null, x?: number, y?: number, scale?: number, active: string|null}|null}
 */
export function viewRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scene = idOrNull(raw.scene);
  if (!scene) return null;
  const view = { scene, level: idOrNull(raw.level), active: idOrNull(raw.active) };
  if (finite(raw.x) && finite(raw.y) && finite(raw.scale) && raw.scale > 0) {
    Object.assign(view, { x: Math.round(raw.x), y: Math.round(raw.y), scale: Math.round(raw.scale * 1000) / 1000 });
  }
  return view;
}

/**
 * Two views the same for saving purposes: same scene, level and active scene, and a position
 * within a pixel and a thousandth of zoom. Either side null → only equal when both are.
 */
export function sameView(a, b) {
  const x = viewRecord(a), y = viewRecord(b);
  if (!x || !y) return !x && !y;
  if (x.scene !== y.scene || x.level !== y.level || x.active !== y.active) return false;
  if (("x" in x) !== ("x" in y)) return false;
  if (!("x" in x)) return true;
  return Math.abs(x.x - y.x) < 1 && Math.abs(x.y - y.y) < 1 && Math.abs(x.scale - y.scale) < 0.001;
}

/**
 * Where a client should go at login, or null to stay where Foundry put it (the active scene).
 *
 *  - no saved view → null;
 *  - the active scene changed since the save (the GM moved the table on) → null;
 *  - the saved scene is gone → null;
 *  - otherwise the saved view: `{ scene, level, position }`, position null when none was stored.
 *    It is returned even when the saved scene is the one already showing, for the position.
 *
 * With pentaryn-pins' pinning on, `pinned` is this user's pinned token `{ scene, level, token }`
 * (pins `pinnedToken`) and resume owns "which scene at login" for it (pins 0.2.0 has no login path;
 * rebuild plan context/plans/pin-2026-10-rebuild.md §3): the token's scene and level whatever was
 * saved and whatever the active scene did — `{ scene, level, token, position }`, position the saved
 * pan/zoom only when the saved view is of that scene, else null; no saved view → still the token's
 * scene; the token's scene gone → null. `pinned` null → the rules above, byte for byte.
 *
 * @param {*} saved              the raw flag value
 * @param {{activeId: string|null, sceneExists: (id: string) => boolean,
 *   pinned?: {scene: string, level?: string|null, token?: string|null}|null}} world
 */
export function resumeTarget(saved, { activeId = null, sceneExists = () => false, pinned = null } = {}) {
  const view = viewRecord(saved);
  const positionOf = v => ("x" in v ? { x: v.x, y: v.y, scale: v.scale } : null);
  if (pinned && typeof pinned.scene === "string" && pinned.scene) {
    if (!sceneExists(pinned.scene)) return null;
    return {
      scene: pinned.scene, level: idOrNull(pinned.level), token: idOrNull(pinned.token),
      position: view && view.scene === pinned.scene ? positionOf(view) : null,
    };
  }
  if (!view) return null;
  if (view.active !== (activeId ?? null)) return null;
  if (!sceneExists(view.scene)) return null;
  return { scene: view.scene, level: view.level, position: positionOf(view) };
}
