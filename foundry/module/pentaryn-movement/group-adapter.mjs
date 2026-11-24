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

/**
 * Is this token in a fight (its combatant in a started combat)? Core's own test (`_shouldRecordMovementHistory`)
 * reads `game.combat`, the combat of the scene this page VIEWS: once the GM views another scene mid-walk, a token on
 * the first scene reads as out of combat there, its next squares are sent as a free walk and core records nothing
 * (live AR2-01: through a door shut mid-move, charged 0 ft). So the scene's own active, started combat counts too.
 */
export function inCombat(tokenDoc) {
  try { if (tokenDoc?._shouldRecordMovementHistory?.() === true) return true; } catch (err) { globalThis.console?.debug?.("pentaryn-movement | core's combat test", err); }
  try {
    const sid = tokenDoc?.parent?.id, tid = tokenDoc?.id;
    if (!sid || !tid) return false;
    const combats = globalThis.game?.combats;
    for (const c of combats?.contents ?? (combats ? [...combats] : [])) {
      if (!c?.active || !c?.started) continue;
      const cs = c.scene?.id ?? c._source?.scene ?? null;
      if (cs && cs !== sid) continue;
      const list = c.combatants?.contents ?? (c.combatants ? [...c.combatants] : []);
      if (list.some(cb => cb?.tokenId === tid && (cb.sceneId ?? cs ?? sid) === sid)) return true;
    }
  } catch (err) { globalThis.console?.debug?.("pentaryn-movement | the scene's combat", err); }
  return false;
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

/**
 * Does a token outside the move count for its routes and spots (HX1-01)? Not `Token#visible`: that is this
 * client's vision now, and a GM controlling a member sees only what that member sees, so a token standing past a
 * wall, or round the corner of a door, was left out and the members were walked through it (-29 to -99 px, every
 * two-way, single-then-group and crowd run on the Mac). A GM counts every token; a player every token the GM has
 * not hidden that it sees, owns or that is friendly (its party: never a hostile it cannot see, which would give
 * that token away).
 */
export function countsForRoutes(t) {
  const doc = t?.document;
  if (!doc) return false;
  if (globalThis.game?.user?.isGM) return true;
  if (doc.hidden) return false;
  if (t.visible) return true;
  const friendly = globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;
  try { return !!(doc.isOwner || doc.disposition === friendly); } catch { return false; }
}

/**
 * Flying or not (0.8.3, AR1-12; Fable's review §3 "a flying token over a crowd: not obstacles, never yielded to"): a
 * token moving by flight passes over the tokens on the ground and they pass under it. Two tokens are in each other's
 * way only on the same layer (core's movement action of each, `fly` or anything else).
 */
export function layerOf(doc) {
  try { return doc?.movementAction === "fly" ? "air" : "ground"; } catch { return "ground"; }
}
export const sameLayer = (a, b) => layerOf(a) === layerOf(b);

/** Circles (squares) of the tokens on the scene that are not in the group (countsForRoutes), on the same level and layer. */
export function othersOf(members, s) {
  const ids = new Set(members.map(m => m.id));
  const level = members[0]?.token?.document?._source?.level;
  const lead = members[0]?.token?.document;
  const out = [];
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const doc = t.document;
    if (!doc || ids.has(doc.id) || t.isPreview || !countsForRoutes(t)) continue;
    if (lead && !sameLayer(lead, doc)) continue;
    if (level !== undefined && doc._source?.level !== undefined && doc._source.level !== level) continue;
    const w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
    out.push({ ...toSquares(doc._source, w, h, s), r: radiusOf(w, h), id: doc.id });
  }
  return out;
}

/** Is the move from → to (pixel points) open to move-blocking walls for this token? */
export function open(token, from, to) {
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
  /** The straight step p → g (top-lefts) with its body fitting all the way and its centre crossing no wall. */
  const stepFits = (p, g, w, h) => {
    const L = Math.hypot(g.x - p.x, g.y - p.y) / s;
    const n = Math.max(1, Math.ceil(L / 0.1));
    for (let i = 1; i <= n; i++) if (!fits(p.x + (g.x - p.x) * (i / n), p.y + (g.y - p.y) * (i / n), w, h)) return false;
    const a = centreAt(p.x, p.y, w, h), b = centreAt(g.x, g.y, w, h);
    try { return !token.checkCollision({ x: b.x * s, y: b.y * s, elevation: src.elevation ?? 0 }, { origin: { x: a.x * s, y: a.y * s }, type: "move", mode: "any" }); }
    catch { return false; }
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
        // A whole square first (S1R1-07: a Large cut at a one-square door rested off the grid, 12 px across the
        // door's line); else the last point its body fits, as before.
        const onGrid = p => Math.abs(p.x / s - Math.round(p.x / s)) < 1e-6 && Math.abs(p.y / s - Math.round(p.y / s)) < 1e-6;
        let q = seen.length - 1;
        while (q > 0 && !(onGrid(seen[q]) && whole(seen[q].x, seen[q].y, seen[q].w, seen[q].h))) q -= 1;
        // No whole square on the way walked (S1R2-03: a Large dragged alone along a slanted line toward a one-wide
        // door rested at (8.91, 4.36)): the whole square nearest a point its body fits near the end, one short straight
        // step on from there, its body clear all the way; else the last point its body fits, as before.
        let snap = null;
        if (q === 0) {
          for (let j = seen.length - 1; j > 0 && !snap; j--) {
            const p = seen[j];
            if (!whole(p.x, p.y, p.w, p.h)) continue;
            const g = { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
            if (Math.hypot(g.x - p.x, g.y - p.y) > 0.75 * s || !whole(g.x, g.y, p.w, p.h) || !stepFits(p, g, p.w, p.h)) continue;
            snap = g; q = j;
          }
        }
        if (q === 0 && !snap) {
          q = seen.length - 1;
          while (q > 0 && !whole(seen[q].x, seen[q].y, seen[q].w, seen[q].h)) q -= 1;
        }
        const at = seen[q];
        const kk = Math.max(at.k, 1);
        const out = path.slice(0, kk).map(p => ({ ...p }));
        if (snap) {
          const via = { ...path[kk], x: Math.round(at.x), y: Math.round(at.y), snapped: false, explicit: false, checkpoint: false };
          if (!(out.length && Math.round(out.at(-1).x) === via.x && Math.round(out.at(-1).y) === via.y) && !(via.x === snap.x && via.y === snap.y)) out.push(via);
          out.push({ ...path[kk], x: snap.x, y: snap.y, snapped: true, explicit: true, checkpoint: true });
          return { path: out, cut: true };
        }
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
/**
 * The placeable's drawn position, or null. A destroyed PIXI object's `position` getter throws (its transform is null):
 * live AR2-14, "Cannot read properties of null (reading 'position')" on a player's page when the GM activated another
 * scene during a group walk (the old scene's tokens destroyed under a timer that read them).
 */
export function positionOf(token) {
  if (!token || token.destroyed) return null;
  try { return token.position ?? null; } catch { return null; }
}

export function drawnPosition(token) {
  const doc = token.document;
  const src = doc?._source;
  const pos = positionOf(token);
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

/**
 * Tokens this client has just stopped where they are drawn and sent an unanimated displace for (stop.mjs, the
 * group cut and stop-one): until the server has the displace (the source reaches `target`), at most PIN_MS, the
 * token is kept drawn where it was stopped. Anything that re-prepares its document meanwhile (another update of
 * it, a late segment of the walk landing) would draw it at the old destination for that round trip and back
 * (live H4-06: a click-stop drew five members 780-1402 px away for ~120 ms; a door cut drew one through the wall).
 * id → { x, y, tx, ty, until }.
 */
const pins = new Map();
const PIN_MS = 1500;
const pinClock = () => globalThis.performance?.now?.() ?? Date.now();

/** Keep `token` drawn at `at` until its source reaches `target` (top-left pixels) or PIN_MS pass. */
export function pinDrawn(token, at, target) {
  const id = token?.document?.id;
  if (!id || !Number.isFinite(at?.x) || !Number.isFinite(at?.y) || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return;
  const src = token.document._source ?? {};
  pins.set(id, { x: Math.round(at.x), y: Math.round(at.y), tx: Math.round(target.x), ty: Math.round(target.y), until: pinClock() + PIN_MS,
    sx: Math.round(src.x), sy: Math.round(src.y) });
}

/**
 * A pin let go of while the token is drawn on it, nothing walking it on: drawn where the server has it (HX1-01 (c): a
 * pin that ran out, or another user's stop that moved the token elsewhere, left it drawn 25 px off its square for
 * good, its derived position and the board both on the pin).
 */
function letGo(token, pin) {
  const doc = token.document;
  pins.delete(doc.id);
  if (movementFacts(token).animating) return;
  const src = doc._source ?? {};
  if (doc.x === pin.x && doc.y === pin.y && (src.x !== pin.x || src.y !== pin.y)) { doc.x = src.x; doc.y = src.y; }
  const pos = positionOf(token);
  if (pos && (pos.x !== doc.x || pos.y !== doc.y)) pos.set?.(doc.x, doc.y);
}

/** Let go of a pinned token (its displace landed, was refused, or failed). */
export function unpin(token) {
  const id = token?.document?.id ?? token;
  if (id) pins.delete(id);
}

/**
 * refreshToken, this client: a pinned token drawn anywhere but its pin is put back on it (a tween that started
 * meanwhile is stopped there). Returns true when it put it back.
 */
export function holdPinned(token) {
  const doc = token?.document;
  const pin = doc?.id ? pins.get(doc.id) : null;
  if (!pin) return false;
  const src = doc._source ?? {};
  if (token.destroyed || (Math.round(src.x) === pin.tx && Math.round(src.y) === pin.ty)) { pins.delete(doc.id); return false; }
  // Ran out, or the server has it somewhere else than before and than its target (another user moved it): let go.
  const moved = Number.isFinite(pin.sx) && (Math.round(src.x) !== pin.sx || Math.round(src.y) !== pin.sy);
  if (pinClock() > pin.until || moved) { letGo(token, pin); return false; }
  const pos = positionOf(token);
  if (doc.x === pin.x && doc.y === pin.y && pos?.x === pin.x && pos?.y === pin.y) return false;
  if (movementFacts(token).animating) {
    queueMicrotask(() => {
      try { if (pins.get(doc.id) === pin && !token.destroyed) stopWhereDrawn(token, pin); }
      catch (err) { globalThis.console?.debug?.("pentaryn-movement | hold a stopped token (the next refresh tries again)", err); }
    });
    return true;
  }
  doc.x = pin.x; doc.y = pin.y;
  pos?.set?.(pin.x, pin.y);
  return true;
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
 * Where a token stopped at `p` (top-left pixels) may rest: `p` itself when its body crosses no
 * move-blocking wall (restWalkable), else the nearest whole cell around it that is clear and that its
 * centre reaches from `p` without crossing a wall. Live R4-5: a click-stop in a doorway left the token
 * off the grid with its circle 37–41 px into the solid wall beside the door. A body across a door's line
 * (open or shut) does not fit either (live R5-3). `taken` (top-left → true when another token rests or is
 * going there) rules a spot out too (a door cut left a member on the square another had just stopped on); when every clear spot nearby is taken, the nearest clear one. `p` when nothing
 * nearby fits.
 * Reads only.
 */
export function clearOfWalls(token, p, { taken = null, snap = false, prefer = null } = {}) {
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
  if ((!snap || onGrid(p)) && fits(p) && free(p) && (!prefer || prefer(p))) return p;
  const z = p.elevation ?? src.elevation ?? 0;
  const from = { x: p.x + (w * s) / 2, y: p.y + (h * s) / 2, elevation: z };
  const bx = Math.floor(p.x / s), by = Math.floor(p.y / s);
  const cands = [];
  const reach = snap ? 3 : taken ? 2 : 1;
  for (let dy = -reach; dy <= reach + 1; dy++) for (let dx = -reach; dx <= reach + 1; dx++) cands.push({ x: (bx + dx) * s, y: (by + dy) * s });
  cands.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const ok = c => fits(c) && open(token, from, { x: c.x + (w * s) / 2, y: c.y + (h * s) / 2, elevation: z });
  // `prefer` (a stop that leaves others walking: not in a one-wide corridor they must pass): the nearest
  // square it also likes, when there is one in reach; else the nearest, as before.
  const liked = prefer ? cands.find(c => free(c) && ok(c) && prefer(c)) : null;
  if (liked) return { ...p, x: liked.x, y: liked.y };
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

/**
 * Is a token's body, its centre at `c` (pixels), across a door's line (open or shut)? A fight's mover must not stop in
 * a doorway (the runtime guard, 0.7.0): it waits before the door. Touching the line is fine. Reads only.
 */
export function doorwayAt(token, c) {
  const s = gridSize(token);
  const src = token.document?._source ?? {};
  const rr = radiusOf(src.width ?? 1, src.height ?? 1) * s - 0.5;
  return doorSegments(token).some(([a, b]) => pointSegment(c, a, b) < rr);
}

/** Distance from point p to segment a–b (pixels). */
function pointSegment(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}
