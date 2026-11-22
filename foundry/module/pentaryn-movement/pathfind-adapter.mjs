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
 */


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
export function fieldFor(token, from, to, { preview = false, constrain = {}, measureOptions = {}, terrainOptions = {}, memo = new Map(), automation = "none" } = {}) {
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
  // The mover is in the key: creature blocking and dnd5e's creature difficult terrain depend on who
  // moves (its disposition, and its own squares are never in its way).
  const sub = `${doc.id}|${width}x${height}|${action}|${level}|${elevation}|${look ? "p" : "f"}|${terrain ? "t" : ""}|${blocking ? "b" : ""}`;

  const pos = n => ({ x: to.x + n.j * s, y: to.y + n.i * s });
  const nodeOf = p => ({ i: Math.round((p.y - to.y) / s), j: Math.round((p.x - to.x) / s) });
  const onLattice = p => Number.isInteger((p.x - to.x) / s) && Number.isInteger((p.y - to.y) / s);
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
    if (!look) return !token.checkCollision(d, { origin: o, type: wallType, mode: "any" });
    const hits = token.checkCollision(d, { origin: o, type: wallType, mode: "all" }) ?? [];
    return !hits.some(seen);
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

  const blockedPx = p => {
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

  const memoGet = (kind, k, fn) => {
    const mk = `${kind}|${sub}|${k}`;
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
    if (blocked(b) || !wall(a, b)) return null;
    return measure([pos(a), pos(b)]);
  });
  /** The whole straight line a→b (string pulling): the real footprint rays of that one move. */
  const lineOk = (a, b) => memoGet("l", pair(a, b), () => wallPx(pos(a), pos(b)));

  /** Fillet tests, in pixels: the straight move p→q is open (walls on the footprint, creatures on the squares crossed). */
  const clear = (p, q) => {
    if (!inside(q) || !wallPx(p, q)) return false;
    if (!blocking) return true;
    const steps = doc.getCompleteMovementPath([waypoint(p), waypoint(q)]);
    return !steps.slice(1).some(w => blockedPx(w));
  };

  return {
    s, unit: grid.distance, pos, nodeOf, onLattice, waypoint, start: nodeOf(from), goal: { i: 0, j: 0 },
    edge, wall, lineOk, clear, cost: measure, blocked, look, terrain, blocking,
    lattice: rect ? {
      minI: Math.floor((rect.y - to.y) / s), maxI: Math.ceil((rect.y + rect.height - to.y) / s),
      minJ: Math.floor((rect.x - to.x) / s), maxJ: Math.ceil((rect.x + rect.width - to.x) / s),
    } : null,
  };
}
