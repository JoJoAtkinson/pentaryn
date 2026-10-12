/**
 * pentaryn-prompts core — placement on a marker's footprint, side-panel rows, dialog position.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { band } from "./grid.mjs";
import { DND_SIZE_WIDTH, fmtNum } from "./size.mjs";
import { isSeen } from "./sight.mjs";

/* ── Placement (plan §6.2), in squares and pixels ────────────────────────── */

/**
 * Where a replacement goes, given the marker's rect (px) and what is being placed.
 * `what`: `{ type: "token", w, h, snap }` (w/h in squares) | `{ type: "centred" }` (note, light).
 * Same-footprint tokens take the marker's own x/y. Others centre on the marker's centre; `snap`
 * (a function `(x, y) => {x, y}`) is applied for creature tokens of a different footprint.
 */
export function placementFor(marker, what, gridSize) {
  const cx = marker.x + marker.w / 2;
  const cy = marker.y + marker.h / 2;
  if (what.type === "centred") return { x: Math.round(cx), y: Math.round(cy), mode: "centre" };
  const w = what.w * gridSize, h = what.h * gridSize;
  if (Math.abs(w - marker.w) < 0.5 && Math.abs(h - marker.h) < 0.5) return { x: marker.x, y: marker.y, mode: "same" };
  let x = cx - w / 2, y = cy - h / 2;
  if (what.snap) {
    const s = what.snap(x, y);
    return { x: s.x, y: s.y, mode: "snapped" };
  }
  return { x: Math.round(x), y: Math.round(y), mode: "centred" };
}

/** Does a token of width `w` squares need dnd5e's lockSize to keep it? */
export function needsLockSize(w, dndSize) {
  const native = DND_SIZE_WIDTH[dndSize];
  return native === undefined ? true : Math.abs(native - w) > 1e-6;
}

/* ── Side panel rows ─────────────────────────────────────────────────────── */

/**
 * The side panel's relations from one item (`key`) to every other item the relation table reaches:
 * distance, bearing and sight. The door/wall pass (`r.los`) runs only for what the "Out of sight"
 * list can show (within `unseenWithinFt`); everything else further out is "blocked".
 */
export function panelRels(items, rel, key, unseenWithinFt = 60) {
  const rels = [];
  for (const it of items) {
    if (it.key === key) continue;
    const r = rel(key, it.key);
    if (!r) continue;
    const los = isSeen(r) ? "LOS" : r.ft <= unseenWithinFt ? r.los : "blocked";
    rels.push({ ft: r.ft, bearing: r.bearing, los, key: it.key, item: it });
  }
  return rels;
}

/**
 * How many items `key` sees — panelSplit(panelRels(…)).total without the door/wall pass, which the
 * hover tip's count never prints (prompts-lookup-7).
 */
export function seenCount(items, rel, key) {
  let n = 0;
  for (const it of items) {
    if (it.key !== key && isSeen(rel(key, it.key))) n++;
  }
  return n;
}

/**
 * Split relations for the panel: in sight (LOS) nearest first, and the out-of-sight ones within
 * `unseenWithinFt`. `rels`: `[{key, ft, bearing, los, ...}]`.
 */
export function panelSplit(rels, { rows = 12, unseenWithinFt = 60 } = {}) {
  const byNear = (a, b) => (a.ft - b.ft) || String(a.key).localeCompare(String(b.key));
  const seen = rels.filter(r => r.los === "LOS").sort(byNear);
  const unseen = rels.filter(r => r.los !== "LOS" && r.ft <= unseenWithinFt).sort(byNear);
  return { shown: seen.slice(0, rows), more: seen.slice(rows), unseen, total: seen.length };
}

/**
 * The out-of-sight rows blocked only by a door, for a line above the panel's fold (usability Area 9,
 * P-9-b: the door showed only as a tag inside the collapsed "Out of sight" list). Each row needs
 * `name`, `ft`, `bearing`, `los`. Returns null when no door is in the way.
 * @returns {{list: string[], extra: number}|null}
 */
export function behindDoor(unseen, { max = 3 } = {}) {
  const hits = (unseen ?? []).filter(r => r?.los === "door" || r?.los === "secret door");
  if (!hits.length) return null;
  const label = r => `${r.name} (${fmtNum(r.ft)} ft${r.bearing ? ` ${r.bearing}` : ""}${r.los === "secret door" ? ", secret door" : ""})`;
  const list = hits.slice(0, Math.max(1, max)).map(label);
  return { list, extra: hits.length - list.length };
}

/**
 * Normalise gather's `scenes` argument. `"current"` (alone or as a list entry, any case) means the
 * scene being viewed; a single id or name string is a one-scene list; null/"all" is every scene with
 * a prompt. The module API threw `SCENE_UNKNOWN: current` for `["current"]` (usability Area 9, P-9-c).
 * @returns {"all"|Array<string|object|symbol>} with CURRENT_SCENE standing for the viewed scene
 */
export const CURRENT_SCENE = Symbol("current scene");
export function sceneRefs(scenes) {
  if (scenes == null || scenes === "" || (typeof scenes === "string" && scenes.trim().toLowerCase() === "all")) return "all";
  const list = Array.isArray(scenes) ? scenes : [scenes];
  return list.map(r => typeof r === "string" && r.trim().toLowerCase() === "current" ? CURRENT_SCENE : r);
}

/** `20 ft · close · NE` (plus `· hidden`). */
export function distanceLine(r, { hidden = false } = {}) {
  const bits = [`${fmtNum(r.ft)} ft`, band(r.ft)];
  if (r.bearing) bits.push(r.bearing);
  if (hidden) bits.push("hidden");
  return bits.join(" · ");
}

/** Feet from the map's top-left for a canvas point. */
export function atFeet(point, dims) {
  const k = dims.distance / dims.size;
  return [Math.round((point.x - dims.sceneX) * k), Math.round((point.y - dims.sceneY) * k)];
}

/** Clamp a dialog's top-left so a `w × h` window stays on a `vw × vh` screen; flip left of the cursor if it would cover `avoid`. */
export function dialogPosition({ clientX, clientY, w, h, vw, vh, avoid = null, gap = 24 }) {
  let left = clientX + gap;
  let top = clientY - 40;
  const covers = (l, t) => avoid && l < avoid.x + avoid.w && l + w > avoid.x && t < avoid.y + avoid.h && t + h > avoid.y;
  if (left + w > vw - 8 || covers(left, top)) left = clientX - gap - w;
  left = Math.max(8, Math.min(left, vw - w - 8));
  top = Math.max(8, Math.min(top, vh - h - 8));
  if (covers(left, top)) {
    // Neither side works at this height: go below (or above) the marker instead.
    const below = avoid.y + avoid.h + 8;
    top = below + h <= vh - 8 ? below : Math.max(8, avoid.y - h - 8);
  }
  return { left: Math.round(left), top: Math.round(top) };
}
