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
export function restWalkable(member, c, s, ratio = 0.9, rays = 8) {
  const rect = globalThis.canvas?.dimensions?.rect;
  const p = { x: c.x * s, y: c.y * s };
  if (rect && !rect.contains(p.x, p.y)) return false;
  const rr = member.r * s * ratio;
  const z = member.token.document?._source?.elevation ?? 0;
  for (let k = 0; k < rays; k++) {
    const a = (k * 2 * Math.PI) / rays;
    if (!open(member.token, { ...p, elevation: z }, { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, elevation: z })) return false;
  }
  return true;
}

/** How much of a big token's radius must stay clear of walls along its path (fitPath). */
const FIT_RATIO = 0.75;
/** Where a cut big token comes to rest: its whole circle clear of walls (touching is fine). */
const WHOLE_RATIO = 0.98;

/**
 * A big token's path (top-left waypoints) cut where its body no longer fits between the walls (live H1-04:
 * core tests walls at the centre only, so a 2×2 Large walked a straight line through a one-square door and
 * corridor, its body 55-87 px inside the rock). Every quarter square along it, 16 rays over FIT_RATIO of its
 * circle must be clear of move-blocking walls; at the first point where it is not, the path ends at the last point
 * that fits (unsnapped, explicit). `{ path, cut }`; a 1×1 or smaller token, or a path whose start does not
 * fit (already squeezed in), is returned whole. Reads only.
 */
export function fitPath(token, path) {
  const doc = token?.document;
  const src = doc?._source ?? {};
  const w0 = src.width ?? 1, h0 = src.height ?? 1;
  if (!Array.isArray(path) || path.length < 2 || (w0 <= 1 && h0 <= 1)) return { path, cut: false };
  const s = gridSize(token);
  const sz = p => ({ w: p.width ?? w0, h: p.height ?? h0 });
  const member = { token, r: radiusOf(w0, h0) };
  const centreAt = (x, y, w, h) => ({ x: (x + (w * s) / 2) / s, y: (y + (h * s) / 2) / s });
  const fits = (x, y, w, h) => restWalkable(member, centreAt(x, y, w, h), s, FIT_RATIO, 16);
  // Where it stops, its whole body is clear (live H2-11: a Large cut at a one-square door rested 21-27 px into
  // the door frame, which FIT_RATIO lets it brush while it walks).
  const blocking = blockingSegments(token);
  const whole = (x, y, w, h) => {
    const c = centreAt(x, y, w, h);
    const p = { x: c.x * s, y: c.y * s }, rr = member.r * s * WHOLE_RATIO;
    // Rays alone miss a door frame's corner poking into the circle between two of them.
    return restWalkable(member, c, s, WHOLE_RATIO, 16) && blocking.every(([a, b]) => pointSegment(p, a, b) >= rr);
  };
  const first = path[0], f0 = sz(first);
  if (!fits(first.x, first.y, f0.w, f0.h)) return { path, cut: false };
  const seen = [{ x: first.x, y: first.y, k: 0, w: f0.w, h: f0.h }];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], { w, h } = sz(b);
    const L = Math.hypot(b.x - a.x, b.y - a.y) / s;
    const n = Math.max(1, Math.ceil(L / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (!fits(x, y, w, h)) {
        // Back along what it walked to the last point its whole body fits (the start when none does).
        let q = seen.length - 1;
        while (q > 0 && !whole(seen[q].x, seen[q].y, seen[q].w, seen[q].h)) q -= 1;
        const at = seen[q];
        const kk = Math.max(at.k, 1);
        const out = path.slice(0, kk).map(p => ({ ...p }));
        const end = { ...path[kk], x: Math.round(at.x), y: Math.round(at.y), snapped: false, explicit: true, checkpoint: true };
        if (out.length && Math.round(out.at(-1).x) === end.x && Math.round(out.at(-1).y) === end.y) out[out.length - 1] = { ...out.at(-1), explicit: true, checkpoint: true };
        else out.push(end);
        return { path: out, cut: true };
      }
      seen.push({ x, y, k: i === n ? k + 1 : k, w, h });
    }
  }
  return { path, cut: false };
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

/**
 * Stop a token's tweens where it is drawn now (this client, before a stop's or a cut's unanimated write).
 * Core's stopAnimation({ reset: false }) keeps the document's derived position as the new drawn one; when
 * that was just re-prepared onto the source (drawnPosition's exception: the destination, behind a door
 * that has just shut) the token jumped there first (live H1-02: drawn through the shut door to its slot,
 * then back to its cut square). The drawn point is put back on the derived position first.
 */
export function stopWhereDrawn(token, at = drawnPosition(token)) {
  const doc = token?.document;
  if (!doc) return;
  if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) { doc.x = at.x; doc.y = at.y; }
  token.stopAnimation?.({ reset: false });
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
 * Has this client sent the next segment of its own move (core's continuation after a checkpoint) and not
 * yet seen it come back? Core sets `_movementContinuation.continued` before that update goes out and clears
 * it when the update lands. A stopMovement in that window races it (live R7-2): core settles the movement,
 * then files the arriving continuation under an id it already dropped, the token walks on, and the next
 * stop of it throws core's "Cannot destructure property 'resolve' of ... #movementPromisesWithResolvers
 * .get(...)" before it broadcasts. Reads only.
 */
export function continuationInFlight(doc) {
  const m = doc?.movement;
  if (!m?.user?.isSelf || m.state === "stopped" || m.state === "completed") return false;
  return doc?._movementContinuation?.continued === true;
}

/**
 * A later wave's waypoints, cut where a wall now blocks them (live R2-5: the GM closed a door after the
 * drop, core then cut the member's path at the door and left it straddling the door line). Each segment
 * from `origin` is tested against move-blocking walls as they are now; at the first blocked one the path
 * ends on the furthest whole cell before the wall that the member's centre reaches without crossing a
 * wall and that `taken` (top-left pixels → true when another token rests there) leaves free: along the
 * blocked segment first, then back along the earlier ones (live R4-1: every waiting member was sent to
 * the same last square before the door and four ended stacked on it). Back at the origin's cell, or
 * with no free cell at all, the list is empty: the member cannot move and stays where it stands.
 * Returns `{ waypoints, cut }`. Reads only.
 */
export function cutAtWalls(token, origin, waypoints, { taken = null } = {}) {
  const s = gridSize(token);
  const src = token.document?._source ?? {};
  const centre = p => {
    const w = p.width ?? src.width ?? 1, h = p.height ?? src.height ?? 1;
    return { x: p.x + (w * s) / 2, y: p.y + (h * s) / 2, elevation: p.elevation ?? src.elevation ?? 0 };
  };
  // One pixel past the end too: a vertex lying exactly on a door's line (an arc through a door's middle) is not
  // a proper crossing of either leg it joins.
  const blocked = (a, b) => {
    const o = centre(a), d = centre(b);
    const L = Math.hypot(d.x - o.x, d.y - o.y);
    const e = L > 0 ? { ...d, x: d.x + (d.x - o.x) / L, y: d.y + (d.y - o.y) / L } : d;
    try { return !!token.checkCollision(e, { origin: o, type: "move", mode: "any" }); } catch { return false; }
  };
  const isTaken = p => { try { return !!taken?.(p); } catch { return false; } };
  let prev = origin;
  for (let k = 0; k < waypoints.length; k++) {
    const w = waypoints[k];
    if (!blocked(prev, w)) { prev = w; continue; }
    const home = { x: Math.round(origin.x / s) * s, y: Math.round(origin.y / s) * s };
    const seen = new Set();
    // Segment `seg` runs from waypoint seg - 1 (the origin for 0) to waypoint seg; the blocked one is k.
    for (let seg = k; seg >= 0; seg--) {
      const from = seg === 0 ? origin : waypoints[seg - 1];
      const to = waypoints[seg];
      const kept = waypoints.slice(0, seg);
      const ww = to.width ?? src.width ?? 1, hh = to.height ?? src.height ?? 1;
      const a = centre(from), b = centre(to);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(Math.ceil(L / (s / 4)), 1);
      for (let q = n; q >= 0; q--) {
        const c = { x: a.x + (b.x - a.x) * (q / n), y: a.y + (b.y - a.y) * (q / n) };
        const cand = { ...to, x: Math.round((c.x - (ww * s) / 2) / s) * s, y: Math.round((c.y - (hh * s) / 2) / s) * s };
        if (cand.x === home.x && cand.y === home.y) return { waypoints: [], cut: true };   // back where it stands
        const key = `${cand.x},${cand.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (blocked(from, cand) || isTaken(cand)) continue;
        kept.push({ ...cand, snapped: true, explicit: true, checkpoint: true });
        return { waypoints: kept, cut: true };
      }
    }
    return { waypoints: [], cut: true };
  }
  return { waypoints, cut: false };
}

/**
 * Where a token stopped at `p` (top-left pixels) may rest: `p` itself when its body crosses no
 * move-blocking wall (restWalkable), else the nearest whole cell around it that is clear and that its
 * centre reaches from `p` without crossing a wall. Live R4-5: a click-stop in a doorway left the token
 * off the grid with its circle 37–41 px into the solid wall beside the door. A body across a door's line
 * (open or shut) does not fit either (live R5-3). `taken` (top-left → true when another token rests or is
 * going there) rules a spot out too (live H1-07 / H1-09: a door cut left a member on the square another
 * had just stopped on); when every clear spot nearby is taken, the nearest clear one. `p` when nothing
 * nearby fits.
 * Reads only.
 */
export function clearOfWalls(token, p, { taken = null, snap = false } = {}) {
  const s = gridSize(token);
  const src = token.document?._source ?? {};
  const w = src.width ?? 1, h = src.height ?? 1;
  const member = { token, r: radiusOf(w, h) };
  const at = q => toSquares(q, w, h, s);
  // Its body across a door's line, open or shut (live R5-3: stopped in an open doorway, it rested across
  // the door line, and anyone shutting the door then left it inside the wall): not a place to rest either.
  const doors = doorSegments(token);
  // Its box, not 90 % of its circle (live R7-4: a click-stop in an open doorway rested 5 px across the door's
  // line, the body at x 1405-1505 over a line at 1500). Touching the line is fine.
  const rr = member.r * s - 0.5;
  const straddles = q => {
    if (!doors.length) return false;
    const c = { x: q.x + (w * s) / 2, y: q.y + (h * s) / 2 };
    return doors.some(([a, b]) => pointSegment(c, a, b) < rr);
  };
  const fits = q => restWalkable(member, at(q), s) && !straddles(q);
  const free = q => !taken?.(q);
  // snap (a click-stop, Joe's decision 2): only a whole square, the nearest free one.
  const onGrid = q => Math.abs(q.x / s - Math.round(q.x / s)) < 1e-6 && Math.abs(q.y / s - Math.round(q.y / s)) < 1e-6;
  if ((!snap || onGrid(p)) && fits(p) && free(p)) return p;
  const z = p.elevation ?? src.elevation ?? 0;
  const from = { x: p.x + (w * s) / 2, y: p.y + (h * s) / 2, elevation: z };
  const bx = Math.floor(p.x / s), by = Math.floor(p.y / s);
  const cands = [];
  const reach = snap ? 3 : taken ? 2 : 1;
  for (let dy = -reach; dy <= reach + 1; dy++) for (let dx = -reach; dx <= reach + 1; dx++) cands.push({ x: (bx + dx) * s, y: (by + dy) * s });
  cands.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const ok = c => fits(c) && open(token, from, { x: c.x + (w * s) / 2, y: c.y + (h * s) / 2, elevation: z });
  const pick = cands.find(c => free(c) && ok(c));
  if (pick) return { ...p, x: pick.x, y: pick.y };
  if (snap) {
    // Never on another token: a free square that fits even past a corner, else the nearest that fits.
    const any = cands.find(c => free(c) && fits(c)) ?? cands.find(c => ok(c));
    if (any) return { ...p, x: any.x, y: any.y };
  }
  if (fits(p)) return p;
  const near = cands.find(c => Math.hypot(c.x - p.x, c.y - p.y) <= 1.5 * s && ok(c));
  return near ? { ...p, x: near.x, y: near.y } : p;
}

/** The scene's walls that block movement now (shut doors included, open ones not) as point pairs (pixels). */
function blockingSegments(token) {
  const out = [];
  for (const wall of token.document?.parent?.walls ?? []) {
    const c = wall?.c;
    if (!Array.isArray(c) || c.length < 4) continue;
    if (Number(wall.move ?? 1) <= 0) continue;
    if (Number(wall.door) > 0 && Number(wall.ds) === 1) continue;
    out.push([{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }]);
  }
  return out;
}

/** The scene's door segments (any door type, open or shut) as point pairs (pixels). */
function doorSegments(token) {
  const out = [];
  for (const wall of token.document?.parent?.walls ?? []) {
    const c = wall?.c;
    if (!(wall?.door > 0) || !Array.isArray(c) || c.length < 4) continue;
    out.push([{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }]);
  }
  return out;
}

/** Distance from point p to segment a–b (pixels). */
function pointSegment(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}
