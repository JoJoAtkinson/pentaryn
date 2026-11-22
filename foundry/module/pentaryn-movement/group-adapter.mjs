/**
 * Pentaryn Movement — group movement's Foundry side (0.4.0): tokens and drag contexts → the plain
 * member records and oracles group-core plans with, and the reads click-to-stop needs. Reads only;
 * never writes a document.
 *
 * ADAPTER (imports core and lib only). Units: group-core works in grid squares with token CENTRES;
 * Foundry waypoints are top-left pixels. `toSquares` / `toTopLeft` convert, given the grid size.
 */

import { MOTION, radiusOf } from "./motion-core.mjs";

/** A token's centre in squares, for a top-left pixel position and its size in squares. */
export const toSquares = (p, w, h, s) => ({ x: (p.x + (w * s) / 2) / s, y: (p.y + (h * s) / 2) / s });
/** Back: a centre in squares → the top-left pixel position, rounded as core rounds waypoints. */
export const toTopLeft = (c, w, h, s) => ({ x: Math.round(c.x * s - (w * s) / 2), y: Math.round(c.y * s - (h * s) / 2) });

/** The grid size of a token's scene. */
export function gridSize(token) {
  return token.document?.parent?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
}

/** Is this token's movement recorded by dnd5e (its combatant in a started combat)? */
export function inCombat(tokenDoc) {
  try { return tokenDoc?._shouldRecordMovementHistory?.() === true; } catch { return false; }
}

/**
 * Animation speed in squares per second, as core's tween will use it: the action's animation
 * options (dnd5e halves it for a movement type the actor has 0 of), else the token's own speed.
 */
export function speedOf(token, action = token.document?.movementAction) {
  const cfg = globalThis.CONFIG?.Token?.movement;
  let speed = null;
  try { speed = cfg?.actions?.[action]?.getAnimationOptions?.(token)?.movementSpeed ?? null; } catch { speed = null; }
  if (!(speed > 0)) {
    try { speed = token._getAnimationMovementSpeed?.({}) ?? null; } catch { speed = null; }
  }
  return speed > 0 && Number.isFinite(speed) ? speed : (cfg?.defaultSpeed ?? MOTION.speed);
}

/**
 * One member record from a drag context: start = the token's source position, formation = the
 * context's destination (core's same-delta, snapped drop point), corePath = core's found path.
 */
export function memberOf(context, s) {
  const token = context.token;
  const src = token.document._source;
  const w = src.width ?? 1, h = src.height ?? 1;
  const dest = context.destination ?? context.foundPath?.at(-1) ?? src;
  const formation = toSquares(dest, w, h, s);
  return {
    id: token.document.id, token, w, h, r: radiusOf(w, h),
    start: toSquares(src, w, h, s), formation, tl: { x: dest.x / s, y: dest.y / s },
    speed: speedOf(token), dest,
    corePath: (context.foundPath ?? []).map(p => toSquares(p, w, h, s)),
  };
}

/** Circles (squares) of the visible tokens on the scene that are not in the group, on the same level. */
export function othersOf(members, s) {
  const ids = new Set(members.map(m => m.id));
  const level = members[0]?.token?.document?._source?.level;
  const out = [];
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const doc = t.document;
    if (!doc || ids.has(doc.id) || t.isPreview || !t.visible) continue;
    if (level !== undefined && doc._source?.level !== undefined && doc._source.level !== level) continue;
    const w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
    out.push({ ...toSquares(doc._source, w, h, s), r: radiusOf(w, h) });
  }
  return out;
}

/** Is the move from → to (pixel points) open to move-blocking walls for this token? */
function open(token, from, to) {
  try { return !token.checkCollision(to, { origin: from, type: "move", mode: "any" }); } catch { return false; }
}

/**
 * Can `member` stand with its centre at `c` (squares)? Inside the scene, and no wall between its
 * centre and eight points on a circle of 0.9 × its radius (its body does not cross a wall).
 */
export function restWalkable(member, c, s) {
  const rect = globalThis.canvas?.dimensions?.rect;
  const p = { x: c.x * s, y: c.y * s };
  if (rect && !rect.contains(p.x, p.y)) return false;
  const rr = member.r * s * 0.9;
  const z = member.token.document?._source?.elevation ?? 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (!open(member.token, { ...p, elevation: z }, { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, elevation: z })) return false;
  }
  return true;
}

/** Ray angles (radians from the direction of travel) the width probe casts on each side. */
const PROBE = [45, 67.5, 90, 112.5, 135].map(d => (d * Math.PI) / 180);

/**
 * The points (squares) where a route is narrower than two group diameters: every quarter square,
 * the free width across it. Each side casts rays fanned from 45° to 135° off the direction of travel
 * and keeps the nearest wall's distance across the route (hit distance × sin angle), up to 4 · rmax:
 * a door in a thin wall is only crossed by the slanted rays (the square one runs along the wall).
 */
export function narrowPoints(token, points, rmax, s) {
  const out = [];
  const reach = 4 * rmax * s;
  const z = token.document?._source?.elevation ?? 0;
  // Core computes no polygon from an origin off the canvas: it warns once per ray (live R3-6, 330 warnings
  // in one planGroup near the scene edge). Such a point has no room at all; it is narrow, no ray cast.
  const dims = globalThis.canvas?.dimensions;
  const inside = o => !dims || !(dims.width > 0) || !(dims.height > 0)
    || (o.x >= 0 && o.x <= dims.width && o.y >= 0 && o.y <= dims.height);
  const across = (o, dir, side) => {
    let best = reach;
    for (const a of PROBE) {
      // dir rotated by ±a.
      const c = Math.cos(a), sn = Math.sin(a) * side;
      const d = { x: dir.x * c - dir.y * sn, y: dir.x * sn + dir.y * c };
      const len = reach / Math.sin(a);
      let hit = null;
      try { hit = token.checkCollision({ x: o.x + d.x * len, y: o.y + d.y * len, elevation: z }, { origin: o, type: "move", mode: "closest" }); }
      catch { hit = null; }
      if (hit) best = Math.min(best, Math.hypot(hit.x - o.x, hit.y - o.y) * Math.sin(a));
    }
    return best;
  };
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1], q = points[k];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < 1e-6) continue;
    const dir = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    for (let t = 0; t <= L + 1e-9; t += 0.25) {
      const o = { x: (p.x + dir.x * t) * s, y: (p.y + dir.y * t) * s, elevation: z };
      if (!inside(o) || across(o, dir, 1) + across(o, dir, -1) < reach - 1e-6) out.push({ x: o.x / s, y: o.y / s });
    }
  }
  return out;
}

/**
 * Where a token is drawn now (top-left pixels): during a movement animation core writes the tween's
 * values onto the document's derived x / y, while `_source` already holds the checkpoint ahead.
 * One exception (live R3-3 / R3-4): any re-preparation of a moving token's document (an update that
 * moves nothing, an effect, a delta) puts its derived x / y back on the source, the destination, until
 * the tween's next frame writes them again. In that window the document says "at the destination"
 * while the screen still shows the token where the last frame drew it; a click-stop that read it put
 * the token at its destination (a member "jumped 1456 px into the group"). While a movement tween runs
 * and the derived position equals the source, the placeable's own position (what was last drawn) is
 * the answer.
 */
export function drawnPosition(token) {
  const doc = token.document;
  const src = doc?._source;
  const pos = token.position;
  let x = doc.x, y = doc.y;
  if (src && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && doc.x === src.x && doc.y === src.y
    && movementFacts(token).animating) { x = pos.x; y = pos.y; }
  return { x: Math.round(x), y: Math.round(y), elevation: doc.elevation };
}

/** The movement facts click-to-stop decides on. */
export function movementFacts(token) {
  const doc = token.document;
  const m = doc?.movement;
  let animating = false;
  try { animating = !!token.animationContexts?.has?.(token.movementAnimationName); } catch { animating = false; }
  return { state: m?.state ?? "completed", animating, initiatorSelf: !!m?.user?.isSelf, user: m?.user ?? null };
}

/**
 * A later wave's waypoints, cut where a wall now blocks them (live R2-5: the GM closed a door after the
 * drop, core then cut the member's path at the door and left it straddling the door line). Each segment
 * from `origin` is tested against move-blocking walls as they are now; at the first blocked one the path
 * ends on the furthest whole cell before the wall along that segment that the member's centre reaches
 * without crossing a wall, else on the last waypoint before it. Returns `{ waypoints, cut }`; an empty
 * list means the member cannot move at all. Reads only.
 */
export function cutAtWalls(token, origin, waypoints) {
  const s = gridSize(token);
  const src = token.document?._source ?? {};
  const centre = p => {
    const w = p.width ?? src.width ?? 1, h = p.height ?? src.height ?? 1;
    return { x: p.x + (w * s) / 2, y: p.y + (h * s) / 2, elevation: p.elevation ?? src.elevation ?? 0 };
  };
  const blocked = (a, b) => {
    try { return !!token.checkCollision(centre(b), { origin: centre(a), type: "move", mode: "any" }); } catch { return false; }
  };
  let prev = origin;
  for (let k = 0; k < waypoints.length; k++) {
    const w = waypoints[k];
    if (!blocked(prev, w)) { prev = w; continue; }
    const kept = waypoints.slice(0, k);
    const ww = w.width ?? src.width ?? 1, hh = w.height ?? src.height ?? 1;
    const a = centre(prev), b = centre(w);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(Math.ceil(L / (s / 4)), 1);
    const at = { x: prev.x, y: prev.y };
    for (let q = n; q >= 0; q--) {
      const c = { x: a.x + (b.x - a.x) * (q / n), y: a.y + (b.y - a.y) * (q / n) };
      const cand = { ...w, x: Math.round((c.x - (ww * s) / 2) / s) * s, y: Math.round((c.y - (hh * s) / 2) / s) * s };
      if (cand.x === at.x && cand.y === at.y) break;                  // back where the segment starts
      if (blocked(prev, cand)) continue;
      kept.push({ ...cand, snapped: true, explicit: true, checkpoint: true });
      return { waypoints: kept, cut: true };
    }
    if (kept.length) kept[kept.length - 1] = { ...kept.at(-1), explicit: true, checkpoint: true };
    return { waypoints: kept, cut: true };
  }
  return { waypoints, cut: false };
}
