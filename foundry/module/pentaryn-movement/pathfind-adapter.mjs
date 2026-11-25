/**
 * Pentaryn Movement — the pathfinder's Foundry side: a Token, its waypoints and its drag options →
 * the plain step tests pathfind-core searches with. Reads only; never writes a document.
 *
 * ADAPTER (imports core and lib only). Every test answers the question core's own constrain and
 * measure code would answer, through the same public methods:
 *
 *   wall(a, b)    the token's footprint crosses no move-blocking wall between two lattice nodes:
 *                 one Token#checkCollision ray per occupied square (core casts one ray, from the
 *                 centre, so it never checks that a 2×2 token fits). In preview (a player's drag)
 *                 only collisions the player has explored or can see count, as in core.
 *   blocked(p)    dnd5e's creature blocking on the squares the token would occupy
 *                 (TokenLayer5e#isOccupiedGridSpaceBlocking, gated exactly as Token5e does it).
 *   cost(a, b)    Token#measureMovementPath of the two-waypoint step — the scene's diagonal rule and
 *                 dnd5e's creature difficult terrain; through Token#createTerrainMovementPath when a
 *                 visible region on the scene has a behaviour with terrain effects.
 *
 * Lattice: nodes are whole-square offsets from an anchor (the leg's goal), so node {i, j} is the
 * top-left position anchor + (j, i) squares — the positions a snapped drag lands on.
 *
 * `avoid` (0.4.0, group movement's lateral re-plan): circles { x, y, r } in pixels, centres. A step
 * whose footprint centre comes inside one is blocked, so the route walks round resting group members.
 *
 * Places an auto-route never goes (0.4.0, placesToAvoid): a secret door, open or shut; a region
 * that moves a token on entry (teleportToken, e.g. a pentaryn-portals scene link, or changeLevel)
 * unless the leg starts or ends inside it; and, in a player's preview, ground that player has
 * neither explored nor can see. A straight drag core allows is still core's: these only shape the
 * routes this module invents.
 */

import { SECRET_DOOR, avoidHits, avoidRegion, segmentIndex, segmentsCross } from "./pathfind-core.mjs";
import { narrowField, narrowMore } from "./narrow-core.mjs";

/**
 * The narrow-way field for a token of 1×1 or smaller on its scene (0.10 R9, narrow-core): the walls that block its
 * movement action both ways, in squares (pixels / grid size); a closed or locked door is a wall, an open one is not, a
 * secret door always is (a route never uses one); a one-way wall is crossed only from its open side and costs no
 * clearance. In a player's preview only the walls that player has seen count, a piece at a time (half a square,
 * explored or visible at its middle), as core counts a collision. `cache` (pathfind.mjs's, dropped when a wall or
 * door changes and, for a preview, when this client's fog is explored) keeps one field per scene, wall type, size and
 * preview. null for a bigger token (decision 8: only where its body fits), the unconstrained tool, or no wall test.
 */
export function narrowFor(token, { wallType = "move", look = false, ignoreWalls = false, width = 1, height = 1, cache = null } = {}) {
  if (!wallType || ignoreWalls || width > 1 || height > 1) return null;
  const doc = token?.document;
  const scene = doc?.parent;
  const s = scene?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const pad = Math.max(width, height) / 2;
  const key = `${scene?.id ?? "?"}|${wallType}|${pad}|${look ? `p${game.user?.id}` : "f"}`;
  if (cache?.has(key)) return cache.get(key);
  const seen = c => globalThis.canvas?.fog?.isPointExplored?.(c) || globalThis.canvas?.visibility?.testVisibility?.(c, { tolerance: 1 });
  const walls = [], lines = [];
  for (const w of scene?.walls ?? []) {
    const c = w?.c;
    if (!Array.isArray(c) || c.length < 4) continue;
    if (Number(w[wallType] ?? w.move ?? 1) <= 0) continue;
    const door = Number(w.door) || 0;
    if (door > 0 && door !== SECRET_DOOR && Number(w.ds) === 1) continue;
    const dir = Number(w.dir) || 0;
    // A preview counts a wall only where the player has seen it, half a square at a time.
    const L = Math.hypot(c[2] - c[0], c[3] - c[1]) / s;
    const n = look ? Math.max(1, Math.ceil(L / 0.5)) : 1;
    for (let k = 0; k < n; k++) {
      const a = { x: c[0] + ((c[2] - c[0]) * k) / n, y: c[1] + ((c[3] - c[1]) * k) / n };
      const b = { x: c[0] + ((c[2] - c[0]) * (k + 1)) / n, y: c[1] + ((c[3] - c[1]) * (k + 1)) / n };
      if (look && !seen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) continue;
      const seg = [a.x / s, a.y / s, b.x / s, b.y / s];
      if ((dir === 1 || dir === 2) && door !== SECRET_DOOR) lines.push({ c: seg, dir });
      else walls.push(seg);
    }
  }
  // A one-way wall's piece lies on the wall's own line, so its open side is the wall's.
  const field = narrowField(walls, { pad, lines });
  field.s = s;
  cache?.set(key, field);
  return field;
}

/**
 * Every edge on the token's scene that could stop a move (0.10 live round 1), as a broad phase for core's wall test:
 * the canvas's own edges when it shows that scene, the scene's walls (doors in any state) and the scene's bounds. A
 * superset of what core tests, so a move that comes near none of them is one core passes. One per scene in `cache`
 * (pathfind.mjs's, dropped when a wall or door changes and on canvasReady), rebuilt when the edges differ. null when
 * there is nothing to read.
 */
export function wallIndexFor(scene, s, cache = null) {
  const key = `${scene?.id ?? "?"}|edges`;
  const segs = [];
  try {
    const edges = globalThis.canvas?.scene === scene ? globalThis.canvas?.edges : null;
    if (edges && typeof edges.values === "function") {
      for (const e of edges.values()) if (Number.isFinite(e?.a?.x) && Number.isFinite(e?.b?.y)) segs.push([e.a.x, e.a.y, e.b.x, e.b.y]);
    }
    for (const w of scene?.walls ?? []) { const c = w?.c; if (Array.isArray(c) && c.length >= 4) segs.push([c[0], c[1], c[2], c[3]]); }
    const r = globalThis.canvas?.dimensions?.sceneRect;
    if (r && Number.isFinite(r.width)) segs.push([r.x, r.y, r.x + r.width, r.y], [r.x + r.width, r.y, r.x + r.width, r.y + r.height], [r.x + r.width, r.y + r.height, r.x, r.y + r.height], [r.x, r.y + r.height, r.x, r.y]);
  } catch { return null; }
  // Reading the edges is cheap; bucketing them is the cost a cache saves. Its signature catches a change no hook told
  // the cache about.
  let sum = 0;
  for (const g of segs) sum = (sum * 31 + g[0] * 7 + g[1] * 11 + g[2] * 13 + g[3] * 17) % 1e15;
  const sig = `${segs.length}:${sum}`;
  const had = cache?.get(key);
  if (had?.sig === sig) return had;
  const index = segmentIndex(segs, s);
  index.sig = sig;
  cache?.set(key, index);
  return index;
}

/** Is a token with these dimensions at waypoint `w` inside `region` (core's own test)? */
function insideRegion(doc, region, w) {
  if (typeof doc?.testInsideRegion !== "function") return false;
  const data = {};
  for (const k of ["x", "y", "elevation", "width", "height", "depth", "shape", "level"]) if (w?.[k] !== undefined) data[k] = w[k];
  try { return doc.testInsideRegion(region, data) === true; } catch { return false; }
}

/**
 * What an auto-route from waypoint `from` to waypoint `to` keeps out of, for this token and user:
 *   secret   secret-door segments [{x,y},{x,y}] (any state: a route never uses one)
 *   traps    regions with a move-on-enter behaviour, except those `from` or `to` is inside
 *   look     a player's preview: only explored or visible ground counts as open
 *   at(p)    is the token, top-left at p (pixels, `to`'s dimensions), in a trap or unseen ground?
 *   line(p, q, { fog })   does the straight move p→q (top-lefts) stay out of both (sampled; `fog: false`
 *                tests the traps only — a one-square step, whose end node is tested)?
 *   key      for the step cache
 */
export function placesToAvoid(token, from, to, { preview = false } = {}) {
  const doc = token.document;
  const scene = doc?.parent;
  const s = scene?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const isGM = !!game.user?.isGM;
  const look = preview && !isGM && !!globalThis.canvas?.visibility?.tokenVision;
  const secret = [];
  for (const w of scene?.walls ?? []) {
    const c = w?.c;
    if (w?.door !== SECRET_DOOR || !c || c.length < 4) continue;
    secret.push([{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }]);
  }
  const traps = [];
  for (const region of scene?.regions ?? []) {
    if (!avoidRegion(region, { isGM })) continue;
    if (insideRegion(doc, region, from) || insideRegion(doc, region, to)) continue;
    traps.push(region);
  }
  const { width = 1, height = 1, depth = 1, shape, level, elevation = 0 } = to ?? {};
  const seen = c => globalThis.canvas?.fog?.isPointExplored?.(c) || globalThis.canvas?.visibility?.testVisibility?.(c, { tolerance: 1 });
  const at = (p, { fog = true } = {}) => {
    if (traps.length) {
      const w = { x: p.x, y: p.y, elevation, width, height, depth, shape, level };
      if (traps.some(r => insideRegion(doc, r, w))) return true;
    }
    if (look && fog) {
      let c = null;
      try { c = doc.getMovementOrigin({ x: p.x, y: p.y, elevation, width, height, depth, shape }); } catch { c = null; }
      if (!c) c = { x: p.x + (width * s) / 2, y: p.y + (height * s) / 2 };
      if (!seen(c)) return true;
    }
    return false;
  };
  const line = (p, q, { fog = true } = {}) => {
    if (!traps.length && !(look && fog)) return true;
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    // Traps every eighth of a square (a corner clipped by a long string-pulled line still counts);
    // fog alone every half square (it is coarse, and the line's nodes are tested anyway).
    const n = Math.max(1, Math.ceil(L / (traps.length ? s / 8 : s / 2)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (at({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, { fog })) return false;
    }
    return true;
  };
  const crossesSecret = (o, d) => secret.some(([a, b]) => segmentsCross(o, d, a, b));
  return { secret, traps, look, at, line, crossesSecret, key: `z${traps.map(r => r.id).join(",")}|s${secret.length}` };
}


/** Does this visible region have a behaviour that changes movement cost or blocks it? */
function terrainRegion(region) {
  if (!region || region.hidden) return false;
  const base = globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType?.prototype?._getTerrainEffects;
  for (const behavior of region.behaviors ?? []) {
    if (behavior.disabled) continue;
    const fn = behavior.system?._getTerrainEffects;
    if (typeof fn === "function" && fn !== base) return true;
  }
  return false;
}

/** Does any visible region on the scene have a behaviour that changes movement cost or blocks it? */
export function sceneHasTerrain(scene) {
  for (const region of scene?.regions ?? []) if (terrainRegion(region)) return true;
  return false;
}

/**
 * The boxes (pixels, { x0, y0, x1, y1 }) of the scene's terrain regions (sceneHasTerrain's), or null when one has no
 * box to read (then every step is measured, as before). A step whose footprints keep out of every box costs what the
 * same step costs anywhere off terrain (0.10 live round 2: with one Difficult Terrain region anywhere on the scene,
 * every step of every search was measured: 1,083 of a twelve-member plan's 1,493 ms on the page).
 */
export function terrainBoxes(scene) {
  const out = [];
  for (const region of scene?.regions ?? []) {
    if (!terrainRegion(region)) continue;
    let b = null;
    try { b = region.bounds; } catch { b = null; }
    if (![b?.x, b?.y, b?.width, b?.height].every(Number.isFinite)) return null;
    out.push({ x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height });
  }
  return out;
}

/**
 * Does dnd5e leave token document `t` out of its creature difficult terrain for mover `doc`
 * (TokenLayer5e#isOccupiedGridSpaceDifficult and #getRelevantOccupyingTokens)? Hidden, secret, moving together (the
 * dragger's own controlled tokens), not a creature; under the 2024 rules also a token of the mover's own disposition
 * or a Tiny one. Its squares then cost what free squares cost (0.10 live round 2: a group's own squares were measured
 * step by step). Only what dnd5e leaves out before its hook: a token kept is measured, as before.
 */
function ignoredForCost(t, doc) {
  try {
    if (t.hidden) return true;
    if (t.disposition === (globalThis.CONST?.TOKEN_DISPOSITIONS?.SECRET ?? -2)) return true;
    if (t.object?.controlled === true) return true;
    if (!t.actor?.system?.isCreature) return true;
    if (globalThis.dnd5e?.settings?.rulesVersion === "modern") {
      if (t.disposition === doc.disposition) return true;
      if (globalThis.CONFIG?.DND5E?.actorSizes?.[t.actor.system.traits?.size]?.numerical === 0) return true;
    }
  } catch { return false; }
  return false;
}

/** Does dnd5e block this token on creatures (Token5e#constrainMovementPath's own gate)? */
function creatureBlocking(token, constrain, automation) {
  if (constrain?.ignoreTokens) return false;
  if (automation !== "full") return false;
  const actor = token.document?.actor;
  if (!actor?.system?.isCreature) return false;
  const never = CONFIG.DND5E?.neverBlockStatuses;
  if (never && actor.statuses?.intersects?.(never)) return false;
  return typeof token.layer?.isOccupiedGridSpaceBlocking === "function";
}

/**
 * Build the step tests for one leg. `from` / `to` are full waypoints (the drag's explicit ones);
 * the lattice is anchored on `to`. `automation` is dnd5e's movementAutomation (read in
 * settings.mjs). Results are memoised in `memo` (a Map the feature keeps and clears when walls,
 * regions, doors or tokens change).
 */
export function fieldFor(token, from, to, { preview = false, constrain = {}, measureOptions = {}, terrainOptions = {}, memo = new Map(), automation = "none", avoid = null, rounded = false, narrowCache = null } = {}) {
  const doc = token.document;
  const grid = doc.parent?.grid ?? canvas.grid;
  const s = grid.size;
  const { width = 1, height = 1, depth = 1, shape, level, action = doc.movementAction, elevation = 0 } = to;
  const isGM = !!game.user?.isGM;
  // Core and dnd5e drop preview for a GM and without token vision; so do we.
  const look = preview && !isGM && !!canvas.visibility?.tokenVision;
  // The action's wall type; null (displace) means no wall test, as in core.
  const actionConfig = CONFIG.Token?.movement?.actions?.[action];
  const wallType = actionConfig ? actionConfig.walls : "move";
  const terrain = sceneHasTerrain(doc.parent);
  const blocking = creatureBlocking(token, constrain, automation);
  const rect = canvas.dimensions?.rect;
  const hz = placesToAvoid(token, from, to, { preview });
  // The mover is in the key: creature blocking and dnd5e's creature difficult terrain depend on who
  // moves (its disposition, and its own squares are never in its way).
  const circles = avoid?.length ? avoid : null;
  const base = `${doc.id}|${width}x${height}|${action}|${level}|${elevation}|${look ? "p" : "f"}|${terrain ? "t" : ""}|${blocking ? "b" : ""}|${hz.key}|${rounded ? "r" : ""}`;
  // The wall answers and a position's squares depend only on the body (0.10 live round 2): every token of this size,
  // action and level shares them (a group's members walk the same ways; each asked core again).
  const geo = `${width}x${height}|${depth}|${shape ?? ""}|${action}|${level}|${elevation}|${look ? "p" : "f"}|${constrain.ignoreWalls ? "i" : ""}`;
  const sub = base + (circles ? `|a${circles.map(c => `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.r)}${c.box ? "b" : ""}`).join(";")}` : "");

  // The lattice: whole squares from the goal, or, for a goal off the grid (a group slot, a spot beside a stopped
  // token), from the grid position nearest it, the goal then one short hop from its node (live H2-01, H2-06,
  // H2-14: a lattice anchored on an off-grid slot ran every route 30-45 px off the middle of doors and corridors,
  // so a Large no longer fitted a 2-wide double door, members brushed door frames and the crowd beside a
  // corridor's mouth, and a route round that crowd was refused).
  const lat = (() => {
    if (to.snapped || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return { x: to.x, y: to.y };
    const snapC = (c, n) => (Number.isInteger(n) && n % 2 === 0 ? Math.round(c / s) * s : (Math.floor(c / s) + 0.5) * s);
    return { x: snapC(to.x + (width * s) / 2, width) - (width * s) / 2, y: snapC(to.y + (height * s) / 2, height) - (height * s) / 2 };
  })();
  const pos = n => ({ x: lat.x + n.j * s, y: lat.y + n.i * s });
  const nodeOf = p => ({ i: Math.round((p.y - lat.y) / s), j: Math.round((p.x - lat.x) / s) });
  const onLattice = p => Number.isInteger((p.x - lat.x) / s) && Number.isInteger((p.y - lat.y) / s);
  const waypoint = (p, extra = {}) => ({
    x: Math.round(p.x), y: Math.round(p.y), elevation, width, height, depth, shape, level, action,
    snapped: false, explicit: false, checkpoint: false, ...extra,
  });

  /** Centres of the squares the token covers at top-left p (one centre for a fractional size). */
  const footprint = p => {
    // The movement origin's elevation (core casts its wall ray at it, which matters for walls with heights).
    const origin = doc.getMovementOrigin({ x: p.x, y: p.y, elevation, width, height, depth, shape });
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return [origin];
    const out = [];
    for (let a = 0; a < height; a++) for (let b = 0; b < width; b++) {
      out.push({ x: p.x + (b + 0.5) * s, y: p.y + (a + 0.5) * s, elevation: origin.elevation ?? elevation });
    }
    return out;
  };

  const seen = c => canvas.fog?.isPointExplored?.(c) || canvas.visibility?.testVisibility?.(c, { tolerance: 1 });
  // Core's wall test only for a move that comes near an edge (0.10 live round 1: it was most of a plan's time).
  const edges = wallType && !constrain.ignoreWalls ? wallIndexFor(doc.parent, s, narrowCache) : null;
  const ray = (o, d) => {
    if (!wallType || constrain.ignoreWalls) return true;
    if (hz.secret.length && hz.crossesSecret(o, d)) return false;
    if (edges && !edges.near(o, d)) return true;
    if (!look) return !token.checkCollision(d, { origin: o, type: wallType, mode: "any" });
    const hits = token.checkCollision(d, { origin: o, type: wallType, mode: "all" }) ?? [];
    return !hits.some(seen);
  };

  // Wall ends (door frames, room corners) a smoothed line keeps its body clear of (live H2-14: string pulling and
  // arcs ran the centre past a door frame's corner, the circle 22-49 px in the rock).
  const corners = [];
  if (wallType && !constrain.ignoreWalls) {
    const seenEnd = new Set();
    for (const w of doc.parent?.walls ?? []) {
      const c = w?.c;
      if (!Array.isArray(c) || c.length < 4) continue;
      if (Number(w[wallType] ?? w.move ?? 1) <= 0) continue;
      if (Number(w.door) > 0 && Number(w.ds) === 1 && Number(w.door) !== SECRET_DOOR) continue;
      for (const [x, y] of [[c[0], c[1]], [c[2], c[3]]]) {
        const k = `${x},${y}`;
        if (!seenEnd.has(k)) { seenEnd.add(k); corners.push({ x, y }); }
      }
    }
  }
  const clearance = Math.max(Math.min(width, height) * s / 2 - 2, 0);
  const segPoint = (c, a, b) => {
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
    return Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.y - (a.y + (b.y - a.y) * t));
  };
  /** Does the centre's straight move p→q (top-lefts) keep its body clear of every wall end? */
  const roundCorners = (p, q) => {
    if (!corners.length || !clearance) return true;
    const a = { x: p.x + (width * s) / 2, y: p.y + (height * s) / 2 }, b = { x: q.x + (width * s) / 2, y: q.y + (height * s) / 2 };
    const x0 = Math.min(a.x, b.x) - clearance, x1 = Math.max(a.x, b.x) + clearance, y0 = Math.min(a.y, b.y) - clearance, y1 = Math.max(a.y, b.y) + clearance;
    for (const c of corners) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      // A wall end the move starts or ends beside (a token resting by a door frame) does not count.
      if (Math.hypot(c.x - a.x, c.y - a.y) < clearance || Math.hypot(c.x - b.x, c.y - b.y) < clearance) continue;
      if (segPoint(c, a, b) < clearance - 1e-6) return false;
    }
    return true;
  };

  /** Pixel-position wall test (fillets use it directly), once per move and body (memoGet "r"). */
  const wallPx = (p, q) => memoGet("r", `${p.x},${p.y}>${q.x},${q.y}`, () => {
    const fa = footprint(p), fb = footprint(q);
    for (let k = 0; k < fa.length; k++) if (!ray(fa[k], fb[k])) return false;
    return true;
  });
  const inside = p => {
    if (!rect) return true;
    const c = doc.getMovementOrigin({ x: p.x, y: p.y, elevation, width, height, depth, shape });
    return rect.contains(c.x, c.y);
  };

  /** The footprint centre at top-left p (pixels). */
  const centreOf = p => ({ x: p.x + (width * s) / 2, y: p.y + (height * s) / 2 });
  /** Does the centre's straight move p→q come inside an avoid circle? */
  const grazes = (p, q) => {
    if (!circles) return false;
    const a = centreOf(p), b = centreOf(q);
    return circles.some(c => avoidHits(c, a, b));
  };
  /** A square the token may not enter whatever the avoid circles: traps, unseen ground, dnd5e's creature blocking. */
  /** The squares the body covers at top-left p (core's answer, once per position and size). */
  const offsetsAt = p => memoGet("g", `${p.x},${p.y}`, () => doc.getOccupiedGridSpaceOffsets({ x: p.x, y: p.y, elevation, width, height, depth, shape }));
  const shutPx = p => memoGet("s", `${p.x},${p.y}`, () => {
    if (hz.at(p)) return true;
    if (!blocking) return false;
    const k = Math.floor((elevation / grid.distance) + 1e-8);
    return offsetsAt(p).some(space => token.layer.isOccupiedGridSpaceBlocking({ ...space, k }, token, { preview: look }));
  });
  const blockedPx = p => grazes(p, p) || shutPx(p);

  const measure = pts => {
    const wps = pts.map(p => waypoint(p));
    const path = terrain ? token.createTerrainMovementPath(wps, { ...terrainOptions, preview }) : wps;
    const r = token.measureMovementPath(path, { ...measureOptions, preview });
    return Number.isFinite(r?.cost) ? r.cost : null;
  };

  // A step's cost on a scene with no terrain regions depends only on its direction, unless an end is on
  // another token's squares (dnd5e's creature difficult terrain): such steps share one answer per direction
  // (live H2-04: measuring every step was 500 of a six-member funnel plan's 830 ms on a slow tab).
  let occupied = null;
  const othersAt = () => {
    if (occupied) return occupied;
    occupied = new Set();
    try {
      for (const t of doc.parent?.tokens ?? []) {
        if (!t || t.id === doc.id || ignoredForCost(t, doc)) continue;
        for (const o of t.getOccupiedGridSpaceOffsets?.() ?? []) occupied.add(`${o.i},${o.j}`);
      }
    } catch { occupied = null; return null; }
    return occupied;
  };
  const freeOfOthers = p => memoGet("o", `${p.x},${p.y}`, () => {
    const occ = othersAt();
    if (!occ) return false;
    try {
      return offsetsAt(p).every(o => !occ.has(`${o.i},${o.j}`));
    } catch { return false; }
  });
  // A step near a terrain region is measured; one whose footprints keep a pixel clear of every region's box is not.
  const boxes = terrain ? terrainBoxes(doc.parent) : [];
  const nearTerrain = (p, q) => {
    if (!terrain) return false;
    if (!boxes) return true;
    const x0 = Math.min(p.x, q.x) - 1, y0 = Math.min(p.y, q.y) - 1, x1 = Math.max(p.x, q.x) + width * s + 1, y1 = Math.max(p.y, q.y) + height * s + 1;
    return boxes.some(b => x0 <= b.x1 && b.x0 <= x1 && y0 <= b.y1 && b.y0 <= y1);
  };
  const stepCost = (p, q) => {
    if (nearTerrain(p, q) || !freeOfOthers(p) || !freeOfOthers(q)) return measure([p, q]);
    return memoGet("u", `${q.x - p.x},${q.y - p.y}`, () => measure([p, q]));
  };

  // Walls, others' squares and step costs do not depend on the avoid circles: a group's re-plans round its
  // resting members share them with every other search (live H2-04).
  const SHARED = new Set(["o", "u", "s"]), GEO = new Set(["w", "g", "r"]);
  const memoGet = (kind, k, fn) => {
    const mk = `${kind}|${GEO.has(kind) ? geo : SHARED.has(kind) ? base : sub}|${k}`;
    if (memo.has(mk)) return memo.get(mk);
    const v = fn();
    memo.set(mk, v);
    return v;
  };

  // Memo keys are absolute positions, so legs anchored on different goals share them.
  const at = n => { const p = pos(n); return `${p.x},${p.y}`; };
  const pair = (a, b) => `${at(a)}>${at(b)}`;
  const blocked = n => memoGet("b", at(n), () => blockedPx(pos(n)));
  const wall = (a, b) => memoGet("w", pair(a, b), () => inside(pos(b)) && wallPx(pos(a), pos(b)));
  const edge = (a, b) => memoGet("e", pair(a, b), () => {
    if (blocked(b) || !wall(a, b) || grazes(pos(a), pos(b)) || !hz.line(pos(a), pos(b), { fog: false })) return null;
    // Out of combat a step never takes its body over a wall end (a diagonal past a door frame or round a bend;
    // H2-14). In a fight the grid's own diagonal stays (the movement costs are the grid's).
    if (rounded && a.i !== b.i && a.j !== b.j && !roundCorners(pos(a), pos(b))) return null;
    return stepCost(pos(a), pos(b));
  });
  /** The whole straight line a→b (string pulling): the real footprint rays of that one move. */
  const lineOk = (a, b) => memoGet("l", pair(a, b), () => wallPx(pos(a), pos(b)) && !grazes(pos(a), pos(b)) && hz.line(pos(a), pos(b)) && roundCorners(pos(a), pos(b)));

  /** Fillet tests, in pixels: the straight move p→q is open (walls on the footprint, creatures on the squares crossed). */
  const clear = (p, q) => {
    if (!inside(q) || !wallPx(p, q) || grazes(p, q) || !hz.line(p, q) || !roundCorners(p, q)) return false;
    if (!blocking) return true;
    const steps = doc.getCompleteMovementPath([waypoint(p), waypoint(q)]);
    return !steps.slice(1).some(w => blockedPx(w));
  };

  // Narrow ways (0.10 R9): a token of 1×1 or smaller whose lattice nodes are whole squares (node (i, j) the square
  // its centre is in) also steps through the parts of tight squares, the narrow field's.
  let narrow = null;
  try {
    const cx = lat.x + (width * s) / 2, cy = lat.y + (height * s) / 2;
    const aligned = Math.abs(cx / s - Math.floor(cx / s) - 0.5) < 1e-6 && Math.abs(cy / s - Math.floor(cy / s) - 0.5) < 1e-6;
    const nf = aligned ? narrowFor(token, { wallType, look, ignoreWalls: !!constrain.ignoreWalls, width, height, cache: narrowCache }) : null;
    if (nf) {
      const oj = Math.floor(cx / s), oi = Math.floor(cy / s);
      const toAbs = n => ({ I: n.i + oi, J: n.j + oj });
      const fromAbs = (I, J, c) => (c ? { i: I - oi, j: J - oj, c } : { i: I - oi, j: J - oj });
      const tl = p => ({ x: p.x * s - (width * s) / 2, y: p.y * s - (height * s) / 2 });
      /** The band's own test of a straight move (centres in squares): tokens standing, traps, unseen ground, creatures. */
      const okSeg = (p, q) => {
        if (circles) {
          const a = { x: p.x * s, y: p.y * s }, b = { x: q.x * s, y: q.y * s };
          if (circles.some(c => avoidHits(c, a, b))) return false;
        }
        if (!hz.line(tl(p), tl(q))) return false;
        if (!blocking) return true;
        const L = Math.hypot(q.x - p.x, q.y - p.y);
        const n = Math.max(1, Math.ceil(L / 0.25));
        for (let k = 0; k <= n; k++) {
          const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n;
          if (blocked(fromAbs(Math.floor(y), Math.floor(x), 0))) return false;
        }
        return true;
      };
      const covered = n => {
        if (!circles) return false;
        const A = toAbs(n), c = nf.cells(A.I, A.J);
        for (let k = 0; k < c.comp.length; k++) {
          if (c.comp[k] !== n.c) continue;
          const p = { x: c.x[k] * s, y: c.y[k] * s };
          if (!circles.some(o => avoidHits(o, p, p))) return false;
        }
        return true;
      };
      narrow = {
        field: nf, toAbs, fromAbs, okSeg,
        /** A top-left position's centre in squares, and back. */
        centre: p => ({ x: (p.x + (width * s) / 2) / s, y: (p.y + (height * s) / 2) / s }),
        topLeft: tl,
        more: narrowMore(nf, {
          toAbs, fromAbs,
          cost: (a, b) => stepCost(pos(a), pos(b)),
          // A part of a tight square: the avoid circles shut it only when every passable point of it lies inside one
          // (0.10 F1 B2: a slot on the centre line shut its neighbours' parts by their squares' centres); okSeg tests
          // the walk itself.
          blocked: n => (n.c ? memoGet("pb", `${at(n)}#${n.c}`, () => shutPx(pos(n)) || covered(n)) : blocked(n)) || !inside(pos(n)),
        }),
        tight: n => { const A = toAbs(n); return nf.tight(A.I, A.J); },
      };
    }
  } catch { narrow = null; }

  return {
    s, unit: grid.distance, pos, nodeOf, onLattice, waypoint, start: nodeOf(from), goal: nodeOf(to),
    edge, wall, lineOk, clear, cost: measure, blocked, look, terrain, blocking, avoided: hz, narrow,
    lattice: rect ? {
      minI: Math.floor((rect.y - lat.y) / s), maxI: Math.ceil((rect.y + rect.height - lat.y) / s),
      minJ: Math.floor((rect.x - lat.x) / s), maxJ: Math.ceil((rect.x + rect.width - lat.x) / s),
    } : null,
  };
}
