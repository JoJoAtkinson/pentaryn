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

import { SECRET_DOOR, avoidDist, avoidRegion, segmentsCross } from "./pathfind-core.mjs";

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


/** Does any visible region on the scene have a behaviour that changes movement cost or blocks it? */
export function sceneHasTerrain(scene) {
  const base = globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType?.prototype?._getTerrainEffects;
  for (const region of scene?.regions ?? []) {
    if (region.hidden) continue;
    for (const behavior of region.behaviors ?? []) {
      if (behavior.disabled) continue;
      const fn = behavior.system?._getTerrainEffects;
      if (typeof fn === "function" && fn !== base) return true;
    }
  }
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
export function fieldFor(token, from, to, { preview = false, constrain = {}, measureOptions = {}, terrainOptions = {}, memo = new Map(), automation = "none", avoid = null, rounded = false } = {}) {
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
  const ray = (o, d) => {
    if (!wallType || constrain.ignoreWalls) return true;
    if (hz.secret.length && hz.crossesSecret(o, d)) return false;
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

  /** Pixel-position wall test (fillets use it directly). */
  const wallPx = (p, q) => {
    const fa = footprint(p), fb = footprint(q);
    for (let k = 0; k < fa.length; k++) if (!ray(fa[k], fb[k])) return false;
    return true;
  };
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
    return circles.some(c => avoidDist(c, a, b) < c.r - 1e-6);
  };
  const blockedPx = p => {
    if (grazes(p, p) || hz.at(p)) return true;
    if (!blocking) return false;
    const k = Math.floor((elevation / grid.distance) + 1e-8);
    const spaces = doc.getOccupiedGridSpaceOffsets({ x: p.x, y: p.y, elevation, width, height, depth, shape });
    return spaces.some(space => token.layer.isOccupiedGridSpaceBlocking({ ...space, k }, token, { preview: look }));
  };

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
        if (!t || t.id === doc.id) continue;
        for (const o of t.getOccupiedGridSpaceOffsets?.() ?? []) occupied.add(`${o.i},${o.j}`);
      }
    } catch { occupied = null; return null; }
    return occupied;
  };
  const freeOfOthers = p => memoGet("o", `${p.x},${p.y}`, () => {
    const occ = othersAt();
    if (!occ) return false;
    try {
      return doc.getOccupiedGridSpaceOffsets({ x: p.x, y: p.y, elevation, width, height, depth, shape }).every(o => !occ.has(`${o.i},${o.j}`));
    } catch { return false; }
  });
  const stepCost = (p, q) => {
    if (terrain || !freeOfOthers(p) || !freeOfOthers(q)) return measure([p, q]);
    return memoGet("u", `${q.x - p.x},${q.y - p.y}`, () => measure([p, q]));
  };

  // Walls, others' squares and step costs do not depend on the avoid circles: a group's re-plans round its
  // resting members share them with every other search (live H2-04).
  const SHARED = new Set(["w", "o", "u"]);
  const memoGet = (kind, k, fn) => {
    const mk = `${kind}|${SHARED.has(kind) ? base : sub}|${k}`;
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

  return {
    s, unit: grid.distance, pos, nodeOf, onLattice, waypoint, start: nodeOf(from), goal: nodeOf(to),
    edge, wall, lineOk, clear, cost: measure, blocked, look, terrain, blocking, avoided: hz,
    lattice: rect ? {
      minI: Math.floor((rect.y - lat.y) / s), maxI: Math.ceil((rect.y + rect.height - lat.y) / s),
      minJ: Math.floor((rect.x - lat.x) / s), maxJ: Math.ceil((rect.x + rect.width - lat.x) / s),
    } : null,
  };
}
