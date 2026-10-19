/**
 * Pentaryn AoE — pure area geometry (behind the core barrel: core.mjs re-exports every name here).
 * Where an area's centre is, where its handle sits so core's drag snapping can return it, and which
 * walls clip an area (Part H). No Foundry globals.
 */

/**
 * Where the handle sits for a region shape, in scene pixels.
 * circle/ellipse: centre · rectangle: centre after rotation about its anchor · polygon: vertex mean ·
 * emanation (dnd5e 6, a stationary one; a moving one is attached to its caster and gets no handle):
 * the middle of its token-shaped base, whose width/height are in grid units, hence gridSize ·
 * cone/line/anything else: the shape origin (the caster's end).
 */
export function centreOf(shape, { gridSize = 100 } = {}) {
  if (!shape) return { x: 0, y: 0 };
  switch (shape.type) {
    case "emanation":
    case "token": {
      const b = shape.type === "token" ? shape : (shape.base ?? {});
      return { x: (b.x ?? 0) + ((b.width ?? 1) * gridSize) / 2, y: (b.y ?? 0) + ((b.height ?? 1) * gridSize) / 2 };
    }
    case "circle":
    case "ellipse":
    case "ring":
      return { x: shape.x, y: shape.y };
    case "rectangle": {
      const w = shape.width ?? 0, h = shape.height ?? 0;
      const ax = shape.anchorX ?? 0, ay = shape.anchorY ?? 0;
      // Offset from the anchor to the centre, rotated by the shape's rotation.
      const dx = (0.5 - ax) * w, dy = (0.5 - ay) * h;
      const r = ((shape.rotation ?? 0) * Math.PI) / 180;
      return {
        x: shape.x + dx * Math.cos(r) - dy * Math.sin(r),
        y: shape.y + dx * Math.sin(r) + dy * Math.cos(r)
      };
    }
    case "polygon": {
      const p = shape.points ?? [];
      if (p.length < 2) return { x: 0, y: 0 };
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i + 1 < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; n++; }
      return { x: sx / n, y: sy / n };
    }
    default:
      return { x: shape.x ?? 0, y: shape.y ?? 0 };
  }
}

/* -------------------------------------------- */
/*  Part A — where a handle sits                */
/* -------------------------------------------- */

/**
 * The handle token's top-left corner (px) for an area centred at `centre`, so that core's drag
 * snapping can bring the area back onto the grid ([declared] aoe-drag-snap, feedback 7v8jPs).
 *
 * Core snaps a half-square token on a square grid in quarter-square steps, and only to spots where
 * the token sits wholly inside one grid square (BaseToken#getSnappedPositionInSquareGrid). A 20 ft
 * cube or a Fireball is centred on a grid VERTEX; a handle centred there straddles four squares, so
 * the first drag snapped it a quarter square sideways and the area never landed on the grid again
 * (Web "is difficult to move"). The handle now sits in the square just below-right of such a vertex:
 * the area keeps a fixed quarter-square offset from its handle, and the handle's snap spots put the
 * area's centre on vertices, edge midpoints and square centres alike. A centre that is already a
 * legal spot (a square centre) keeps the handle centred on it. Gridless and hex grids: centred.
 * @param {{x:number,y:number}} centre
 * @param {{ gridSize?: number, square?: boolean, size?: number }} [opts]  size: the handle's width in squares
 * @returns {{x:number, y:number}}
 */
export function handleTopLeft(centre, { gridSize = 100, square = true, size = 0.5 } = {}) {
  const half = (gridSize * size) / 2;
  if (!square || !gridSize) return { x: Math.round(centre.x - half), y: Math.round(centre.y - half) };
  const axis = v => {
    const t = (v - half) / gridSize;                 // the centred top-left, in squares
    const q = Math.round(t * 4) / 4;                 // core's quarter step
    const frac = ((q % 1) + 1) % 1;
    // Wholly inside one square: frac 0, 0.25 or 0.5. 0.75 straddles a grid line: step onto it.
    return Math.round((frac > 0.5 ? Math.ceil(q) : q) * gridSize);
  };
  return { x: axis(centre.x), y: axis(centre.y) };
}

/* -------------------------------------------- */
/*  Part H — which walls stop a spell area      */
/* -------------------------------------------- */

/** The wall rules a spell area can follow (setting areaWalls). */
export const AREA_WALL_RULES = Object.freeze(["cover", "move", "none"]);

/**
 * Does this edge stop a spell area? ([declared] aoe-area-walls, feedback 7v8jPs, RpnWw3, 3arqpV.)
 *
 * PHB 2024 (Areas of Effect): an area spreads in straight lines from its point of origin, and only
 * an obstruction that gives Total Cover blocks those lines. dnd5e 6 clips every template region with
 * the core "move" restriction, so EVERY wall that stops a token clipped it: the invisible walls a
 * map uses for a bridge's sides, a ledge or the tables in a tavern cut Burning Hands short at the
 * bridge and pinned Web to the furniture, while a sight-only wall never clipped anything.
 *   "cover" (default): a wall clips an area only when it blocks movement AND sight, a wall you can
 *           neither walk nor see through (total cover). Invisible (move-only) and ethereal
 *           (sight-only) walls never clip. Normal walls, closed doors, terrain walls and windows do.
 *   "move":  core/dnd5e as shipped: every wall that blocks movement.
 *   "none":  no wall clips an area (the scene's outer edge still does).
 * Edges that are not walls (the scene's bounds) keep core's answer. Only asked about an edge core
 * already accepted for the "move" polygon.
 * @param {{ type?: string, move?: number, sight?: number }} edge
 * @param {string} rule  one of AREA_WALL_RULES; anything else counts as "cover"
 */
export function edgeClipsArea(edge, rule = "cover") {
  if (!edge || edge.type !== "wall") return true;
  if (rule === "move") return true;
  if (rule === "none") return false;
  return (edge.move ?? 0) !== 0 && (edge.sight ?? 0) !== 0;
}

/**
 * The point an area is clipped from. Core uses each shape's origin, and a rectangle's origin is its
 * corner, so a cube was clipped as seen from one corner (it "anchored" to whatever stood there) while
 * a sphere was clipped from its centre. A cube is clipped from its centre instead; every other
 * shape keeps core's origin (a cone's or line's point, a sphere's or emanation's centre).
 *
 * The shapes must be the ones core is constraining: during an update (a drag, a rotation, a resize
 * in the shape config) that is the NEW shape data, not the document's current shapes (walls.mjs
 * hands the pending shapes in). The shape whose (rounded) origin is `origin` is used, else the first.
 * @param {object[]} shapes   the region's shape data or ClientShapeData (type, size, anchor, rotation are read)
 * @param {{x:number,y:number}} origin  the origin core passes (the rectangle's x, y, rounded)
 * @param {{ gridSize?: number }} [opts]
 * @returns {{x:number,y:number}}
 */
export function areaClipOrigin(shapes, origin, { gridSize = 100 } = {}) {
  const list = [...(shapes ?? [])].filter(Boolean);
  if (!origin || !list.length || !list.every(s => s.type === "rectangle")) return origin;
  const s = list.find(r => Math.round(r.x) === origin.x && Math.round(r.y) === origin.y) ?? list[0];
  // Read the fields one by one: a ClientShapeData instance does not spread into its data.
  const rect = { type: "rectangle", x: origin.x, y: origin.y, width: s.width, height: s.height,
    anchorX: s.anchorX, anchorY: s.anchorY, rotation: s.rotation };
  const c = centreOf(rect, { gridSize });
  return { ...origin, x: Math.round(c.x), y: Math.round(c.y) };
}

/** Is this activity's area over at once (an instantaneous spell)? dnd5e 6: duration.units "inst". */
export function instantaneous(activity) {
  return (activity?.duration?.units ?? activity?.item?.system?.duration?.units ?? null) === "inst";
}

/**
 * Should this area be left where it was cast instead of following its caster? Only an
 * instantaneous SPELL (Thunder Step). A monster feature that dnd5e also marks "inst" is often a
 * passive aura (a ghast's Stench: Matron Forgotten, the Starved Prisoner) and must keep following
 * its creature, so an area from anything that is not a spell item is never detached.
 */
export function instantSpellArea(activity) {
  return instantaneous(activity) && activity?.item?.type === "spell";
}
