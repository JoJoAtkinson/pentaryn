/**
 * pentaryn-prompts — the pure core.
 *
 * Everything here is a function of plain data: no `game`, no `canvas`, no `foundry`. The dialog's
 * side panel and the gather text both go through it, so what Joe sees beside a marker and what
 * Claude reads about it can never disagree. `node test/run.mjs` proves it.
 *
 * Units: positions are canvas pixels unless a name says `Ft`; a "square" is a grid offset {i, j}
 * (i = row, j = column, as Foundry's GridOffset2D).
 */

export const MODULE = "pentaryn-prompts";

/** The code's own version: `status().version` prints it (game.modules can lag until a rescan). Kept equal to module.json by the suite. */
export const VERSION = "0.4.3";

/** Built kinds that are creatures; the hostile ones make encounters and chain into packs (§13). */
export const CREATURE_KINDS = Object.freeze(["npc", "character", "creature"]);

/* ── Sizes ────────────────────────────────────────────────────────────────── */

/**
 * The six marker sizes. `w` is the footprint in grid squares; `dnd` the dnd5e size key; `scale`
 * the texture scale (small shares mid's footprint, so its art is drawn smaller to tell them apart).
 */
export const SIZES = Object.freeze([
  { key: "tiny",  dnd: "tiny", w: 0.5, scale: 1,   label: "Tiny" },
  { key: "small", dnd: "sm",   w: 1,   scale: 0.8, label: "Small" },
  { key: "mid",   dnd: "med",  w: 1,   scale: 1,   label: "Medium" },
  { key: "large", dnd: "lg",   w: 2,   scale: 1,   label: "Large" },
  { key: "xl",    dnd: "huge", w: 3,   scale: 1,   label: "Huge" },
  { key: "xxl",   dnd: "grg",  w: 4,   scale: 1,   label: "Gargantuan" }
]);
export const SIZE_KEYS = SIZES.map(s => s.key);
export const SIZE_BY_KEY = Object.freeze(Object.fromEntries(SIZES.map((s, i) => [s.key, { ...s, rank: i }])));

/** dnd5e size key → token width in squares (the system's own table, restated so node can use it). */
export const DND_SIZE_WIDTH = Object.freeze({ tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 });

/** `Medium 5x5 ft` for a marker size on a grid of `gridFt` feet per square. */
export function footprintLabel(sizeKey, gridFt = 5) {
  const s = SIZE_BY_KEY[sizeKey];
  if (!s) return "";
  const ft = fmtNum(s.w * gridFt);
  return `${s.label} ${ft}x${ft} ft`;
}

/** `1x1`, `0.5x0.5` — the provenance footprint, in squares. */
export function footprintSquares(w, h = w) {
  return `${fmtNum(w)}x${fmtNum(h)}`;
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/* ── Bands (2024 PHB anchors, see the plan §4.2) ─────────────────────────── */

export const BANDS = Object.freeze([
  [5, "touching"], [10, "reach"], [30, "close"], [60, "near"], [150, "far"], [Infinity, "distant"]
]);

/** The band for a distance in feet. 0 (overlapping squares) is `touching`. */
export function band(ft) {
  const d = Number(ft);
  if (!Number.isFinite(d)) return "distant";
  for (const [max, name] of BANDS) if (d <= max) return name;
  return "distant";
}

/* ── Bearing ─────────────────────────────────────────────────────────────── */

export const COMPASS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

/**
 * 8-point compass bearing from `from` to `to` on the map, north up (canvas y grows downward).
 * Sectors are 45° wide centred on each point; an exact sector edge (22.5°) rounds clockwise.
 * Same point → "".
 */
export function bearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "";
  let deg = Math.atan2(dx, -dy) * 180 / Math.PI;    // 0 = north, clockwise
  if (deg < 0) deg += 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/* ── Grid distance ───────────────────────────────────────────────────────── */

/** `CONST.GRID_DIAGONALS`, restated. */
export const DIAGONALS = Object.freeze({
  EQUIDISTANT: 0, EXACT: 1, APPROXIMATE: 2, RECTILINEAR: 3, ALTERNATING_1: 4, ALTERNATING_2: 5, ILLEGAL: 6
});

/**
 * Not a core diagonal rule: the "squares" are hex cube coordinates `{i: q, j: r}` (model.mjs maps
 * `HexagonalGrid#offsetToCube` into them) and a step is one hex.
 */
export const HEX_RULE = "hex";

/** Cost in squares of a straight move of `di` rows and `dj` columns under a diagonal rule. */
export function stepCost(di, dj, rule = DIAGONALS.EQUIDISTANT) {
  if (rule === HEX_RULE) return (Math.abs(di) + Math.abs(dj) + Math.abs(di + dj)) / 2;   // cube distance
  const a = Math.max(Math.abs(di), Math.abs(dj));
  const b = Math.min(Math.abs(di), Math.abs(dj));
  switch (rule) {
    case DIAGONALS.EXACT: return (a - b) + b * Math.SQRT2;
    case DIAGONALS.APPROXIMATE: return (a - b) + b * 1.5;
    case DIAGONALS.RECTILINEAR:
    case DIAGONALS.ILLEGAL: return a + b;
    case DIAGONALS.ALTERNATING_1: return a + Math.floor(b / 2);   // 5-10-5
    case DIAGONALS.ALTERNATING_2: return a + Math.ceil(b / 2);    // 10-5-10
    default: return a;                                            // 2024 default: every diagonal 5 ft
  }
}

/**
 * The grid squares a rectangle occupies: every square whose centre lies inside it. A footprint
 * smaller than one square (tiny, 0.5) occupies the square under its own centre — the same answer
 * `TokenDocument#getOccupiedGridSpaceOffsets` gives for an unwalled square grid.
 * `rect` is in canvas pixels; the square grid's origin is canvas (0, 0).
 */
export function occupiedSquares(rect, gridSize) {
  const g = gridSize;
  const out = [];
  const i0 = Math.floor(rect.y / g), i1 = Math.ceil((rect.y + rect.h) / g);
  const j0 = Math.floor(rect.x / g), j1 = Math.ceil((rect.x + rect.w) / g);
  for (let i = i0; i < i1; i++) {
    const cy = (i + 0.5) * g;
    if (cy <= rect.y || cy >= rect.y + rect.h) continue;
    for (let j = j0; j < j1; j++) {
      const cx = (j + 0.5) * g;
      if (cx <= rect.x || cx >= rect.x + rect.w) continue;
      out.push({ i, j });
    }
  }
  if (!out.length) {
    out.push({ i: Math.floor((rect.y + rect.h / 2) / g), j: Math.floor((rect.x + rect.w / 2) / g) });
  }
  return out;
}

/** Remove duplicate {i, j} (Foundry's 3D offsets repeat a square per elevation step). */
export function dedupeSquares(squares) {
  const seen = new Set();
  const out = [];
  for (const s of squares ?? []) {
    const k = `${s.i},${s.j}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ i: s.i, j: s.j });
  }
  return out;
}

/**
 * The nearest pair of squares between two footprints and their cost in squares.
 * Overlapping footprints cost 0; adjacent (including diagonally, under the 5e rule) cost 1.
 */
export function nearestPair(squaresA, squaresB, rule = DIAGONALS.EQUIDISTANT) {
  let best = null;
  for (const a of squaresA) {
    for (const b of squaresB) {
      const cost = stepCost(b.i - a.i, b.j - a.j, rule);
      if (!best || cost < best.cost) best = { a, b, cost };
      if (cost === 0) return best;
    }
  }
  return best ?? { a: null, b: null, cost: Infinity };
}

/** Grid distance in feet between two footprints, nearest occupied squares, rounded to 0.1 ft. */
export function squareDistanceFt(squaresA, squaresB, { gridFt = 5, rule = DIAGONALS.EQUIDISTANT } = {}) {
  const { cost } = nearestPair(squaresA, squaresB, rule);
  return Math.round(cost * gridFt * 10) / 10;
}

/**
 * Gridless distance: the gap between two rectangles (0 when they touch or overlap), converted to
 * feet and rounded UP to the next 5 ft, minimum 5 — "adjacent" still reads as touching.
 */
export function gaplessDistanceFt(rectA, rectB, pxPerFt, step = 5) {
  const dx = Math.max(0, rectB.x - (rectA.x + rectA.w), rectA.x - (rectB.x + rectB.w));
  const dy = Math.max(0, rectB.y - (rectA.y + rectA.h), rectA.y - (rectB.y + rectB.h));
  const ft = Math.hypot(dx, dy) / pxPerFt;
  return Math.max(step, Math.ceil(ft / step) * step);
}

/* ── Line of sight against wall segments (pure fallback + the door pass) ─── */

/** CONST.EDGE_SENSE_TYPES / EDGE_DIRECTIONS / WALL_DOOR_*, restated. */
export const SENSE = Object.freeze({ NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 });
export const DIR = Object.freeze({ BOTH: 0, LEFT: 1, RIGHT: 2 });
export const DOOR = Object.freeze({ NONE: 0, DOOR: 1, SECRET: 2 });
export const DOOR_STATE = Object.freeze({ CLOSED: 0, OPEN: 1, LOCKED: 2 });

/** Foundry's orient2dFast. */
export function orient(a, b, c) {
  return (a.y - c.y) * (b.x - c.x) - (a.x - c.x) * (b.y - c.y);
}

/**
 * Where segment p→q crosses segment a→b, as the parameter t along p→q, or null.
 * Touching at the ray's own origin (t = 0) is not a crossing; reaching the far end is.
 */
export function segmentT(p, q, a, b) {
  const rx = q.x - p.x, ry = q.y - p.y;
  const sx = b.x - a.x, sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;                                       // parallel / collinear
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  const eps = 1e-9;
  if (t <= eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return t;
}

/**
 * Normalise a WallDocument-ish object (`c: [x0, y0, x1, y1]`) into a segment record.
 * `threshold` is the sight threshold in PIXELS (the caller converts from grid units).
 */
export function wallSegment(w) {
  const c = w.c ?? [w.a?.x, w.a?.y, w.b?.x, w.b?.y];
  return {
    id: w.id ?? w._id ?? null,
    a: { x: c[0], y: c[1] }, b: { x: c[2], y: c[3] },
    sight: w.sight ?? SENSE.NORMAL,
    dir: w.dir ?? DIR.BOTH,
    door: w.door ?? DOOR.NONE,
    ds: w.ds ?? DOOR_STATE.CLOSED,
    threshold: Number(w.threshold) > 0 ? Number(w.threshold) : 0
  };
}

/**
 * Core's `Edge#applyThreshold` for sight from `origin` (no external radius): true when the wall
 * stops counting — a PROXIMITY wall seen from within its threshold, a DISTANCE wall from beyond it.
 */
export function thresholdApplies(w, origin) {
  if (!w.threshold || w.sight < SENSE.PROXIMITY) return false;
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((origin.x - w.a.x) * dx + (origin.y - w.a.y) * dy) / len2)) : 0;
  const d = Math.hypot(w.a.x + t * dx - origin.x, w.a.y + t * dy - origin.y);
  return w.sight === SENSE.PROXIMITY ? d < w.threshold : d > w.threshold;
}

/**
 * Does a sight ray from `origin` to `dest` pass the walls? Mirrors core's inclusion rules for a
 * sight polygon: sense NONE and open doors pass; a one-way wall seen from its open side passes
 * (`side === dir`); collinear walls pass; LIMITED walls block from the second one crossed;
 * NORMAL blocks; PROXIMITY / DISTANCE block unless their threshold applies from the origin (as
 * core's `useThreshold`). Core's own test is the primary pass; this is the fallback and the door
 * classifier.
 *
 * `ignoreDoors: true` lets every door through, closed or not (the "would a door explain it" pass).
 * Returns `{ clear, doors }` — `doors` are the closed doors on the ray (for the secret tag).
 */
export function rayPasses(origin, dest, walls, { ignoreDoors = false } = {}) {
  let limited = 0;
  const doors = [];
  let blocked = false;
  for (const raw of walls ?? []) {
    const w = raw.a && raw.b && "sight" in raw ? raw : wallSegment(raw);
    if (!w.sight) continue;
    const isDoor = w.door !== DOOR.NONE;
    if (isDoor && w.ds === DOOR_STATE.OPEN) continue;
    const o = orient(w.a, w.b, origin);
    if (o === 0) continue;
    if (w.dir !== DIR.BOTH) {
      const side = o < 0 ? DIR.LEFT : DIR.RIGHT;
      if (side === w.dir) continue;
    }
    if (w.threshold && thresholdApplies(w, origin)) continue;
    if (segmentT(origin, dest, w.a, w.b) === null) continue;
    if (isDoor) {
      doors.push(w);
      if (ignoreDoors) continue;
    }
    if (w.sight === SENSE.LIMITED) {
      if (++limited >= 2) blocked = true;
    } else blocked = true;
  }
  return { clear: !blocked, doors };
}

/**
 * Classify sight from one thing to another over plain wall data: `"LOS"` when any target point is
 * clear, otherwise `"door"` / `"secret door"` when letting doors through would clear it, else
 * `"wall"`. `origins` is usually one point (the observer's centre); `targets` the target's points.
 */
export function classifySight(origins, targets, walls) {
  for (const o of origins) for (const t of targets) if (rayPasses(o, t, walls).clear) return "LOS";
  return classifyBlocked(origins, targets, walls);
}

/** The door pass alone, for a pair the primary test already found blocked. */
export function classifyBlocked(origins, targets, walls) {
  let secretOnly = null;
  for (const o of origins) {
    for (const t of targets) {
      const r = rayPasses(o, t, walls, { ignoreDoors: true });
      if (!r.clear) continue;
      const plain = r.doors.some(d => d.door !== DOOR.SECRET);
      if (plain) return "door";
      if (r.doors.length) secretOnly = "secret door";
    }
  }
  return secretOnly ?? "wall";
}

/* ── Grouping ────────────────────────────────────────────────────────────── */

/**
 * Is a relation a clear sight line? Reads the lazy boolean `seen` when the relation has one
 * (makeRel's do), so asking never triggers the door/wall classification.
 */
export function isSeen(r) {
  if (!r) return false;
  return "seen" in r ? !!r.seen : r.los === "LOS";
}

/**
 * Single-linkage grouping (plan §4.4, §13).
 *
 * `prompts` and `built` are arrays of keys; `rel(a, b)` returns `{ft, los}` for the ordered pair
 * (`los` is "LOS" | "door" | "secret door" | "wall"). Two things link when they are within
 * `linkFt` and either can see the other.
 *
 * Prompts form components among themselves. A built thing then attaches to every component it
 * links to — it may join a pack, but never bridges two packs into one. Built things that link to
 * no component are context only.
 *
 * Built packs (§13): a built FOE that joins a component brings its pack with it — the built foes
 * chained to it at `linkFt` with sight. A foe is a built creature (`creature(k)`) that stands
 * hostile (`disposition(k) === "hostile"`; without a `disposition` callback every creature is a
 * foe). So a minion dropped beside one goblin of a built camp joins the whole camp, not only the
 * goblin it touches. Neutral and friendly creatures never chain: the hostile camp does not pull in
 * the neutral innkeeper across the room, and a street of neutral crowd tokens is not one group
 * (each joins only where it stands within `linkFt` of a prompt itself). Objects (hotspots, notes,
 * lights, tiles) never chain either. A pack reached from two components is listed in both as
 * `shared`: built things still never bridge.
 *
 * Returns `{ groups: [{prompts, built, shared, creatures, foes, formations}], contextOnly }`,
 * unordered; `creatures` are the group's built creatures, `foes` its hostile ones (a single prompt
 * with a foe is an encounter; one beside a neutral villager or a chest is not).
 */
export function groupScene(prompts, built, rel, { linkFt = 30, formationFt = 15, creature = null, disposition = null } = {}) {
  // Distance first: a relation's sight is lazy (see makeRel), so a pair beyond `max` never pays for
  // a sight test, and the reverse direction is only tested when the forward one is blocked.
  const linked = (a, b, max) => {
    const ab = rel(a, b), ba = rel(b, a);
    const ft = Math.min(ab?.ft ?? Infinity, ba?.ft ?? Infinity);
    return ft <= max && (isSeen(ab) || isSeen(ba));
  };
  const isCreature = k => !!creature?.(k);
  const isFoe = k => isCreature(k) && (disposition ? disposition(k) === "hostile" : true);
  const foes = built.filter(isFoe);
  // pack edges are cached: two groups reaching the same pack walk it once
  const packEdge = new Map();
  const packLinked = (a, b) => {
    const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (!packEdge.has(k)) packEdge.set(k, linked(a, b, linkFt));
    return packEdge.get(k);
  };

  const comps = components(prompts, (a, b) => linked(a, b, linkFt));
  const groups = comps.map(c => ({ prompts: c, built: [], shared: [], creatures: [], foes: [], formations: [] }));
  const homes = new Map();
  groups.forEach((g, gi) => {
    const mine = new Set();
    const queue = [];
    for (const t of built) {
      if (!g.prompts.some(p => linked(p, t, linkFt))) continue;
      mine.add(t);
      if (isFoe(t)) queue.push(t);
    }
    // the built pack: breadth-first over hostile creatures, only from the foes that joined directly
    while (queue.length) {
      const a = queue.shift();
      for (const b of foes) {
        if (mine.has(b) || !packLinked(a, b)) continue;
        mine.add(b);
        queue.push(b);
      }
    }
    for (const t of mine) {
      if (!homes.has(t)) homes.set(t, []);
      homes.get(t).push(gi);
    }
  });
  const contextOnly = [];
  for (const t of built) {
    const hits = homes.get(t);
    if (!hits) { contextOnly.push(t); continue; }
    for (const gi of hits) {
      const g = groups[gi];
      g.built.push(t);
      if (isCreature(t)) g.creatures.push(t);
      if (isFoe(t)) g.foes.push(t);
      if (hits.length > 1) g.shared.push(t);
    }
  }

  for (const g of groups) {
    // Formations: the same rule at formationFt, built things joining but not bridging.
    const fComps = components(g.prompts, (a, b) => linked(a, b, formationFt));
    const forms = fComps.map(c => ({ prompts: c, built: [] }));
    for (const t of g.built) {
      const hits = forms.filter(f => f.prompts.some(p => linked(p, t, formationFt)));
      for (const f of hits) f.built.push(t);
    }
    g.formations = forms.filter(f => f.prompts.length + f.built.length >= 2);
  }
  return { groups, contextOnly };
}

/** Connected components of `keys` under `edge(a, b)`. Order of each component follows `keys`. */
export function components(keys, edge) {
  const parent = new Map(keys.map(k => [k, k]));
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (let x = 0; x < keys.length; x++) {
    for (let y = x + 1; y < keys.length; y++) {
      const a = keys[x], b = keys[y];
      if (find(a) === find(b)) continue;
      if (edge(a, b)) parent.set(find(a), find(b));
    }
  }
  const out = new Map();
  for (const k of keys) {
    const r = find(k);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(k);
  }
  return [...out.values()];
}

/* ── Deterministic ids ───────────────────────────────────────────────────── */

/** Reading order: top, then left, then key. `info(k)` gives `{x, y}` (top-left) and optional `rank`. */
function byReading(info) {
  return (a, b) => {
    const A = info(a), B = info(b);
    return (A.y - B.y) || (A.x - B.x) || String(a).localeCompare(String(b));
  };
}

/** Size desc (rank: bigger is larger), then reading order. */
function bySizeThenReading(info) {
  const reading = byReading(info);
  return (a, b) => ((info(b).rank ?? 0) - (info(a).rank ?? 0)) || reading(a, b);
}

/**
 * Assign the gather ids (plan §4.4) across scenes in the order given.
 *
 * `scenes`: `[{ key, groups, contextOnly, info }]` where `groups` come from `groupScene` and
 * `info(k)` returns `{x, y, rank}` for any prompt or built key (top-left px; rank = size order).
 *
 * Groups sort by member count desc (prompts + built), then the reading order of their top-left
 * member. A group of 2+ prompts, or of one prompt with a hostile built creature (`g.foes`), is an
 * encounter (E#). A single prompt with no foe is "alone"; the built things beside it (a chest, the
 * neutral innkeeper) become context only. Prompts number by scene, group, size desc, reading order; built things the same, a
 * shared built thing in the first encounter that holds it, context-only built things last.
 *
 * Returns `{ sceneIds, promptIds, builtIds, scenes: [{ key, id, encounters, alone, contextOnly }] }`
 * where encounters/alone/contextOnly hold keys in output order.
 */
export function assignIds(scenes) {
  const sceneIds = new Map(), promptIds = new Map(), builtIds = new Map();
  let s = 0, e = 0, p = 0, t = 0;
  const out = [];
  for (const sc of scenes) {
    const id = `s${++s}`;
    sceneIds.set(sc.key, id);
    const info = sc.info;
    const topLeft = g => {
      const all = [...g.prompts, ...g.built];
      return all.reduce((m, k) => {
        const i = info(k);
        return (i.y < m.y || (i.y === m.y && i.x < m.x)) ? { x: i.x, y: i.y } : m;
      }, { x: Infinity, y: Infinity });
    };
    const groups = [...sc.groups].map(g => ({
      ...g,
      prompts: [...g.prompts].sort(bySizeThenReading(info)),
      built: [...g.built].sort(bySizeThenReading(info)),
      tl: topLeft(g)
    }));
    groups.sort((a, b) => ((b.prompts.length + b.built.length) - (a.prompts.length + a.built.length))
      || (a.tl.y - b.tl.y) || (a.tl.x - b.tl.x) || String(a.prompts[0]).localeCompare(String(b.prompts[0])));

    // One prompt beside built objects or non-hostile creatures only is "alone": they become context
    // only (unless an encounter holds them), so a chest or a villager is never dressed up as a fight.
    // One prompt beside a hostile built creature is an encounter with its pack (§13): the new minion
    // beside last week's camp.
    const isEncounter = g => g.prompts.length > 1 || (g.foes?.length ?? 0) > 0;
    const encounters = [], alone = [];
    const demoted = new Set();
    for (const g of groups) {
      for (const k of g.prompts) promptIds.set(k, `p${++p}`);
      if (!isEncounter(g)) {
        alone.push(g.prompts[0]);
        for (const k of g.built) demoted.add(k);
        continue;
      }
      for (const k of g.built) if (!builtIds.has(k)) builtIds.set(k, `t${++t}`);
      encounters.push({ ...g, id: `E${++e}`, shared: g.shared.filter(k => groups.some(o => o !== g && isEncounter(o) && o.built.includes(k))) });
    }
    for (const k of demoted) if (builtIds.has(k)) demoted.delete(k);
    const contextOnly = [...sc.contextOnly, ...demoted].sort(bySizeThenReading(info));
    for (const k of contextOnly) if (!builtIds.has(k)) builtIds.set(k, `t${++t}`);
    out.push({ key: sc.key, id, encounters, alone, contextOnly });
  }
  return { sceneIds, promptIds, builtIds, scenes: out };
}

/* ── Hashes ──────────────────────────────────────────────────────────────── */

/** FNV-1a 32-bit over a string's UTF-16 code units. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 8-hex hash of a prompt text, for the manifest's TEXT_CHANGED check. */
export function textHash(text) {
  return fnv1a(normalisePrompt(text)).toString(16).padStart(8, "0");
}

/**
 * `pm-<4 hex>` over scene ids, marker ids, prompt texts and (when given) the `p#` each marker got.
 * Order-independent (entries are sorted). Moving a marker or opening a door changes the call only
 * when it changes the numbering: a call id always names one p# → marker mapping, so a replace
 * written against an older gather text can never land on a renumbered marker.
 */
export function callId(entries) {
  const lines = (entries ?? []).map(e => `${e.sceneId}\u0000${e.markerId}\u0000${normalisePrompt(e.text)}${e.pid ? `\u0000${e.pid}` : ""}`).sort();
  return `pm-${(fnv1a(lines.join("\u0001")) & 0xffff).toString(16).padStart(4, "0")}`;
}

/* ── Text helpers ────────────────────────────────────────────────────────── */

/** Trim, normalise newlines, strip trailing spaces per line. Paragraphs are kept. */
export function normalisePrompt(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").trim();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

/**
 * Foundry enricher markup → readable text. `@Embed[…]` is dropped (gather/panel resolve it to the
 * embedded page's text first; anything left is unresolvable), `@UUID[…]{Label}` and the other
 * `@Type[…]{Label}` links keep their label, `[[/r 2d6]]` keeps its formula, `&Reference[x]` keeps x.
 */
export function stripEnrichers(text) {
  return String(text ?? "")
    .replace(/@Embed\[[^\]]*\](\{[^}]*\})?/g, "")
    .replace(/@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@[A-Za-z]+\[[^\]]*\]/g, "")
    .replace(/\[\[\/?[a-z]*\s*([^\]]*)\]\](\{([^}]*)\})?/gi, (m, f, l, label) => label ?? f.trim())
    .replace(/&Reference\[([^\]\s]*)[^\]]*\](\{([^}]*)\})?/g, (m, k, l, label) => label ?? k);
}

/** HTML → plain text: block tags become newlines, entities decoded, enrichers stripped, whitespace collapsed per line. */
export function stripHtml(html) {
  const s = stripEnrichers(String(html ?? ""))
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (ENTITIES[k] !== undefined) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
      return m;
    });
  return s.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter((l, i, a) => l || (a[i - 1] ?? "") !== "")
    .join("\n").trim();
}

/** One line, at most `n` characters, `...` when cut. */
export function preview(text, n) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!n || flat.length <= n) return flat;
  return flat.slice(0, Math.max(0, n - 3)).replace(/\s+\S*$/, "").trimEnd() + "...";
}

/**
 * Up to `n` characters, cut at the last sentence end that keeps at least half of them (so a
 * description keeps whole rules, not "Tactics Fights from behind his..."), else on a word, `...`
 * when cut. Line breaks become " / " so stat-block-ish lines stay apart.
 */
export function previewSentences(text, n) {
  const flat = String(text ?? "").split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ");
  if (!n || flat.length <= n) return flat;
  const cut = flat.slice(0, n);
  let end = -1;
  for (const m of cut.matchAll(/[.!?]["')\]]?(?=\s|$)|\s\/(?=\s)/g)) end = m.index + m[0].length;
  if (end >= n * 0.5) return `${cut.slice(0, end).replace(/\s*\/$/, "").trimEnd()} [...]`;
  return preview(flat, n);
}

/**
 * The marker's nameplate: `✎ <first 40 chars>`, lines joined with " / ", `…` only when cut;
 * or `Prompt · mid — empty`.
 */
export function nameplate(text, sizeKey) {
  const t = normalisePrompt(text);
  if (!t) return `Prompt · ${sizeKey} — empty`;
  const flat = t.split(/\n+/).map(l => l.trim()).filter(Boolean).join(" / ");
  return flat.length > 40 ? `✎ ${flat.slice(0, 40).trimEnd()}…` : `✎ ${flat}`;
}

/** YYYY-MM-DD for a ms epoch (UTC). */
export function isoDate(ms) {
  const d = new Date(Number(ms));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** One relation as the text shows it: `p2 10 SW reach`, `p6 40 S door`. */
export function relationText(r) {
  const parts = [r.id, fmtNum(r.ft), r.bearing || "here", band(r.ft)];
  if (r.los && r.los !== "LOS") parts.push(r.los);
  return parts.join(" ");
}

/** Sort relations nearest first, then by id (numeric-aware). */
export function sortRelations(rels) {
  return [...rels].sort((a, b) => (a.ft - b.ft) || idCompare(a.id, b.id));
}

/** p2 < p10 < t1 — kind letter, then number. */
export function idCompare(a, b) {
  const A = /^([a-zA-Z]+)(\d+)$/.exec(String(a)), B = /^([a-zA-Z]+)(\d+)$/.exec(String(b));
  if (A && B) return A[1].localeCompare(B[1]) || (Number(A[2]) - Number(B[2]));
  return String(a).localeCompare(String(b));
}

/* ── The gather text (Draft A, plan §5.3) ────────────────────────────────── */

export const LEGEND = [
  "p# = prompt marker to build and replace. t# = already built: context only, never replace, never move.",
  "ft = 5e grid distance between nearest occupied squares (adjacent = 5), scene diagonal rule.",
  "Bands: touching 5 | reach 10 | close 15-30 | near 35-60 | far 65-150 | distant 155+.",
  "LOS = clear sight line through walls with unlimited darkvision (light ignored).",
  "door = blocked only by a closed door (secret doors say \"secret door\"). wall = no sight line.",
  "Bearing = compass on the map, north is up. at = feet from the map's top-left corner.",
  "Encounter E# = linked by <=30 ft with LOS; a hostile built creature in it brings its pack (the hostile built creatures linked the same way).",
  "Formation = linked by <=15 ft with LOS, inside an encounter.",
  "elev = elevation in ft when not 0. Door lines: each door near a prompt, its state, and who can see it from which side.",
  "Images (if any) are set dressing: what the room looks like. Distances and LOS come from this text, never from the picture."
].join("\n");

/** Most `<sees>` entries before the rest are summarised. */
export const SEES_CAP = 25;

function attr(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/\n/g, " ");
}

function ftPair(p) {
  return `${fmtNum(p[0])},${fmtNum(p[1])} ft`;
}

/**
 * Render the gather text from a resolved view (ids assigned, relations computed).
 *
 * view = {
 *   call, counts: {scenes, prompts, built, encounters, alone},
 *   scenes: [{ id, name, nav, mapFt: [w, h], squares: [w, h], gridFt, regions: [..], levels, warn: [..], notes,
 *              encounters: [{ id, centreFt: [x, y], spanFt, members: [ids], formations: [[ids]],
 *                             prompts: [pids], built: [tids], shared: [tids] }],
 *              relations: [{ from: "E2", to: "E1", ft, bearing, los: bool }],
 *              alone: [pids], contextOnly: [tids] }],
 *   prompts: { p1: { id, size, gridFt, atFt: [x, y], regions: [..], text, sees: [rel], unseen: [rel] } },
 *   built:   { t1: { id, kind, name, type, atFt, regions, hidden, prov: {size, at, prompt} | null, description } },
 *   todo: [pids], next: sceneId | null
 * }
 */
export function renderGather(view, { chars = 400 } = {}) {
  const L = [];
  const unseenFt = view.unseenWithinFt ?? 60;
  const c = view.counts;
  L.push(`<prompt_markers call="${attr(view.call)}" scenes="${c.scenes}" prompts="${c.prompts}" built="${c.built}" encounters="${c.encounters}" alone="${c.alone}">`);
  L.push("<legend>", LEGEND, "</legend>");
  L.push(partyLine(view));

  for (const sc of view.scenes) {
    L.push("");
    const sq = `${sc.squares[0]}x${sc.squares[1]} squares of ${fmtNum(sc.gridFt)} ft`;
    L.push(`<scene id="${sc.id}" name="${attr(sc.name)}" nav="${attr(sc.nav)}" map="${fmtNum(sc.mapFt[0])}x${fmtNum(sc.mapFt[1])} ft (${sq})" regions="${attr(sc.regions.length ? sc.regions.join(", ") : "none")}" levels="${sc.levels}">`);
    L.push("<overview>");
    for (const w of sc.warn ?? []) L.push(`WARN ${w}`);
    const budget = view.party ? xpBudget(view.party) : null;
    if (budget) {
      L.push(`Budget per encounter (party ${budget.size} x level ${budget.level}, 2024 DMG): low ${budget.low} | moderate ${budget.moderate} | high ${budget.high} XP.`);
    }
    for (const e of sc.encounters) {
      let line = `${e.id}: ${e.prompts.join(" ")}`;
      if (e.built.length) line += ` + built ${e.built.map(t => (view.built?.[t]?.name ? `${t} "${view.built[t].name}"` : t)).join(", ")}`;
      line += ".";
      if (e.formations.length) line += " " + e.formations.map(f => `Formation ${f.join(" ")}`).join("; ") + ".";
      if (e.shared.length) {
        const homes = t => sc.encounters.filter(x => x !== e && x.built.includes(t)).map(x => x.id);
        const also = [...new Set(e.shared.flatMap(homes))].sort(idCompare);
        line += ` Shared with ${also.join(", ")}: ${e.shared.join(" ")} (built things never merge encounters; decide whether this is one fight).`;
      }
      if (e.builtXp) line += ` Built XP already in it: ${e.builtXp}${e.shared.some(t => view.built?.[t]?.xp) ? " (shared XP counted in each)" : ""}.`;
      L.push(line);
    }
    for (const r of sc.relations ?? []) {
      const block = r.los ? "with LOS between them" : `no LOS between them (${BLOCK_WORDS[r.block] ?? "wall"})`;
      L.push(`${r.from} is ${fmtNum(r.ft)} ft ${r.bearing || "from"} of ${r.to}, ${block}.`);
    }
    const lonely = sc.alone.map(pid => {
      const n = sc.aloneNotes?.[pid];
      if (!n) return pid;
      const bits = [];
      if (n.built) bits.push(`${fmtNum(n.built.ft)} ft ${n.built.bearing || "from"} of ${n.built.of} ${n.built.name}, in sight`);
      if (n.of) bits.push(`${fmtNum(n.ft)} ft ${n.bearing || "from"} of ${n.of}, ${HOW[n.los] ?? "no sight line"}`);
      return bits.length ? `${pid} (${bits.join("; ")})` : pid;
    });
    L.push(`Alone: ${lonely.length ? lonely.join(", ") : "none"}.`);
    for (const d of sc.doorLines ?? []) L.push(d);
    const seen = new Set();
    const builtParts = [];
    for (const e of sc.encounters) {
      for (const t of e.built) {
        if (seen.has(t)) continue;
        seen.add(t);
        const homes = sc.encounters.filter(x => x.built.includes(t)).map(x => x.id);
        builtParts.push(`${t} (in ${homes.join(", ")})`);
      }
    }
    for (const t of sc.contextOnly) builtParts.push(`${t} (context only)`);
    L.push(`Built: ${builtParts.length ? builtParts.join(", ") : "none"}.`);
    if (sc.notes) L.push(`Scene notes: ${preview(sc.notes, 300)}`);
    L.push("</overview>");

    const printed = new Set();
    for (const e of sc.encounters) {
      L.push("");
      const form = e.formations.map(f => f.join(" ")).join("; ");
      L.push(`<encounter id="${e.id}" centre="${ftPair(e.centreFt)}" span="${fmtNum(e.spanFt)} ft" members="${e.members.join(" ")}" formation="${form}">`);
      for (const pid of e.prompts) L.push(...renderPrompt(view.prompts[pid], unseenFt));
      for (const tid of e.built) {
        if (printed.has(tid)) { L.push(`<built id="${tid}" see="above"/>`); continue; }
        printed.add(tid);
        L.push(...renderBuilt(view.built[tid], chars, e.shared.includes(tid)
          ? sc.encounters.filter(x => x.built.includes(tid)).map(x => x.id) : null));
      }
      L.push("</encounter>");
    }
    if (sc.alone.length) {
      L.push("", "<alone>");
      for (const pid of sc.alone) L.push(...renderPrompt(view.prompts[pid], unseenFt));
      L.push("</alone>");
    }
    if (sc.contextOnly.length) {
      L.push("", "<context_only>");
      for (const tid of sc.contextOnly) L.push(...renderBuilt(view.built[tid], chars, null));
      L.push("</context_only>");
    }
    L.push("</scene>");
  }

  L.push("");
  if (view.cropsNote) L.push(`<crops>${view.cropsNote}</crops>`);
  L.push(`<todo>${(view.todo ?? []).join(" ")}</todo>`);
  if (view.next) L.push(`<next scene="${attr(view.next)}">More prompts on later scenes: gather again starting at this scene.</next>`);
  L.push("</prompt_markers>");
  return L.join("\n");
}

/**
 * `<party>` — which party the budgets use and where it came from, or that there is none: the world
 * setting is often blank, and a builder that guesses "4x5" from an example sizes every fight wrong.
 */
export function partyLine(view) {
  const levels = view.party ? parseParty(view.party) : null;
  if (!levels?.length) {
    return "<party>none set (the world setting \"Party for encounter budgets\" is blank and the call gave none): no XP budgets. " +
      "Pass party: \"4x5\" (PCs x level) or [5,5,4,5] if you know the party; otherwise ask Joe — never guess one.</party>";
  }
  const same = levels.every(l => l === levels[0]);
  const desc = same ? `${levels.length} x level ${levels[0]}` : `levels ${levels.join(", ")}`;
  const from = view.partySource === "setting" ? "the world setting" : view.partySource === "call" ? "this call" : "given";
  return `<party>${desc} (from ${from})</party>`;
}

function elevAttr(e) {
  const n = Number(e);
  return Number.isFinite(n) && n !== 0 ? ` elev="${fmtNum(n)} ft"` : "";
}

function renderPrompt(p, unseenFt = 60) {
  const out = [];
  out.push(`<prompt id="${p.id}" size="${p.size}" footprint="${attr(footprintLabel(p.size, p.gridFt ?? 5))}" at="${ftPair(p.atFt)}"${elevAttr(p.elevation)} region="${attr((p.regions ?? []).join(", "))}">`);
  out.push(normalisePrompt(p.text) || "(empty: Joe left no text)");
  const sees = sortRelations(p.sees ?? []);
  const shown = sees.slice(0, SEES_CAP).map(relationText);
  if (sees.length > SEES_CAP) shown.push(`+${sees.length - SEES_CAP} more beyond ${fmtNum(sees[SEES_CAP - 1].ft)} ft`);
  out.push(`<sees>${shown.length ? shown.join(" | ") : "nobody"}</sees>`);
  const unseen = sortRelations(p.unseen ?? []).map(relationText);
  out.push(`<unseen>${unseen.length ? unseen.join(" | ") : `(nothing out of sight within ${fmtNum(unseenFt)} ft)`}</unseen>`);
  out.push("</prompt>");
  return out;
}

function renderBuilt(t, chars, sharedWith) {
  const out = [];
  const bits = [`id="${t.id}"`, `kind="${t.kind}"`, `name="${attr(t.name)}"`];
  const type = t.classes?.length ? classLabel(t.classes, t.species) : t.type;
  if (type) bits.push(`type="${attr(type)}"`);
  const stats = statsText(t.stats);
  if (stats) bits.push(`stats="${attr(stats)}"`);
  if (t.disposition) bits.push(`disposition="${t.disposition}"`);
  bits.push(`at="${ftPair(t.atFt)}"`);
  const ev = elevAttr(t.elevation);
  if (ev) bits.push(ev.trim());
  if (t.regions?.length) bits.push(`region="${attr(t.regions.join(", "))}"`);
  if (t.kind !== "note" && t.kind !== "light") bits.push(`hidden="${t.hidden ? "yes" : "no"}"`);
  if (sharedWith?.length) bits.push(`shared="${sharedWith.join(" ")}"`);
  out.push(`<built ${bits.join(" ")}>`);
  if (t.prov?.prompt) {
    const from = t.prov.pid ? `${t.prov.pid} of ${t.prov.call ?? "?"}, ` : "";
    out.push(`Built from prompt (${from}${t.prov.size ?? "?"}, ${isoDate(t.prov.at)}): "${preview(t.prov.prompt, Math.max(chars, 240))}"`);
  }
  if (t.prov?.note) out.push(`Why: ${preview(t.prov.note, 240)}`);
  if (t.items?.length) out.push(`${t.kind === "hotspot" ? "Items" : "Carries"}: ${itemsText(t.items)}`);
  if (t.light) out.push(`Light: ${t.light}`);
  if (t.description) out.push(`Description: ${previewSentences(t.description, chars)}`);
  out.push("</built>");
  return out;
}

/* ── Built facts → text (model.mjs gathers the facts; these print them) ─── */

/**
 * An AmbientLight config as the gather prints it: `dim 10 ft, bright 5 ft, #9fd3ff, pulse` (empty
 * when nothing is set). A light placed with a hotspot or note is printed on that thing, not as a
 * separate `t#`.
 */
export function lightText(c) {
  if (!c) return "";
  const bits = [];
  if (Number(c.dim)) bits.push(`dim ${fmtNum(Number(c.dim))} ft`);
  if (Number(c.bright)) bits.push(`bright ${fmtNum(Number(c.bright))} ft`);
  if (c.color) bits.push(String(c.color));
  if (c.animation?.type) bits.push(String(c.animation.type));
  return bits.join(", ");
}

/** 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", else the number. */
export function crText(cr) {
  const c = Number(cr);
  if (!Number.isFinite(c)) return "";
  return c === 0.125 ? "1/8" : c === 0.25 ? "1/4" : c === 0.5 ? "1/2" : fmtNum(c);
}

/**
 * `CR 1/4, AC 15, HP 11` — `stats` is `{cr?, ac?, hp?, hpMax?}` (a character has no cr). HP prints
 * `7/11` only when the token is hurt.
 */
export function statsText(stats) {
  if (!stats) return "";
  const out = [];
  if (stats.cr !== undefined && stats.cr !== null && stats.cr !== "") out.push(`CR ${crText(stats.cr)}`);
  if (Number.isFinite(Number(stats.ac)) && stats.ac !== null) out.push(`AC ${fmtNum(Number(stats.ac))}`);
  const max = Number(stats.hpMax), v = Number(stats.hp);
  if (Number.isFinite(max) && max > 0) out.push(`HP ${Number.isFinite(v) && v !== max ? `${fmtNum(v)}/` : ""}${fmtNum(max)}`);
  return out.join(", ");
}

/**
 * A character's type: `Paladin 5, Oath of Devotion (Human)`; multiclass
 * `Fighter 3, Champion / Wizard 2 (Elf, High)`. `classes`: `[{name, levels, subclass}]`.
 */
export function classLabel(classes, species) {
  const cls = (classes ?? []).filter(c => c?.name)
    .map(c => `${c.name} ${c.levels ?? "?"}${c.subclass ? `, ${c.subclass}` : ""}`).join(" / ");
  if (!cls) return species ?? "";
  return species ? `${cls} (${species})` : cls;
}

/**
 * One item as a neighbour's builder needs it: `The Ember Crown (artifact; unidentified, shows as
 * "Soot-Blackened Bronze Circlet"; attunement required)`, `Arrows x20`, `Stolen Chalice (loot, 150 gp)`.
 * `it`: `{name, type, rarity, identified, unidentifiedName, attunement, attuned, quantity, price}`.
 */
export function itemText(it) {
  const q = Number(it.quantity) > 1 ? ` x${fmtNum(Number(it.quantity))}` : "";
  const bits = [];
  const magic = it.rarity && !["", "mundane", "none"].includes(String(it.rarity).toLowerCase());
  if (magic) bits.push(String(it.rarity).toLowerCase());
  else if (it.type === "loot") bits.push("loot");
  if (it.price) bits.push(String(it.price));
  if (it.identified === false) bits.push(`unidentified${it.unidentifiedName ? `, shows as "${it.unidentifiedName}"` : ""}`);
  else if (magic) bits.push("identified");
  if (it.attunement === "required") bits.push(it.attuned ? "attuned" : "attunement required");
  else if (it.attunement === "optional") bits.push("attunement optional");
  return `${it.name}${q}${bits.length ? ` (${bits.join("; ")})` : ""}`;
}

/** Up to `max` items, `+N more` after. */
export function itemsText(items, max = 12) {
  const list = (items ?? []).filter(i => i?.name);
  const shown = list.slice(0, max).map(itemText);
  if (list.length > max) shown.push(`+${list.length - max} more`);
  return shown.join(", ");
}

const HOW = { LOS: "in sight", door: "behind a closed door", "secret door": "behind a secret door" };
const BLOCK_WORDS = { door: "a closed door", "secret door": "a secret door", wall: "wall" };

/* ── Encounter budget (2024 DMG, restated from dnd5e's CONFIG.DND5E.ENCOUNTER_DIFFICULTY) ── */

/** XP per character by level: [low, moderate, high]. Index = character level. */
export const ENCOUNTER_XP = Object.freeze([
  [0, 0, 0], [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
  [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
  [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
  [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]
]);

/** XP by CR (dnd5e CR_EXP_LEVELS for whole CRs; 1/8, 1/4, 1/2 added). */
export function crXp(cr) {
  const c = Number(cr);
  if (!Number.isFinite(c) || c < 0) return 0;
  if (c === 0) return 10;
  if (c <= 0.125) return 25;
  if (c <= 0.25) return 50;
  if (c <= 0.5) return 100;
  const T = [10, 200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 7200, 8400, 10000, 11500, 13000, 15000,
    18000, 20000, 22000, 25000, 33000, 41000, 50000, 62000, 75000, 90000, 105000, 120000, 135000, 155000];
  return T[Math.min(30, Math.floor(c))];
}

/**
 * Party → per-encounter budget. `party` is `{level, size}`, `"4x5"` (size x level) or an array of
 * levels. Mixed levels sum per character. Returns null when it cannot be read.
 */
export function parseParty(party) {
  if (!party) return null;
  let levels = null;
  if (Array.isArray(party)) levels = party.map(Number);
  else if (typeof party === "string") {
    const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(party);
    if (m) levels = Array(Number(m[1])).fill(Number(m[2]));
  } else if (typeof party === "object") {
    const n = Number(party.size ?? 4), l = Number(party.level);
    if (n > 0 && l > 0) levels = Array(n).fill(l);
  }
  if (!levels?.length || levels.some(l => !(l >= 1 && l <= 20))) return null;
  return levels.map(l => Math.round(l));
}

export function xpBudget(party) {
  const levels = parseParty(party);
  if (!levels) return null;
  const sum = k => levels.reduce((s, l) => s + ENCOUNTER_XP[l][k], 0);
  const same = levels.every(l => l === levels[0]);
  return { size: levels.length, level: same ? levels[0] : levels.join("/"), low: sum(0), moderate: sum(1), high: sum(2) };
}

/** Where an XP total sits against a budget: "under low" | "low" | "moderate" | "high" | "over high". */
export function difficulty(xp, budget) {
  if (!budget) return null;
  if (xp < budget.low) return "under low";
  if (xp < budget.moderate) return "low";
  if (xp < budget.high) return "moderate";
  if (xp <= budget.high * 1.1) return "high";
  return "over high";
}

/* ── Doors near prompts ──────────────────────────────────────────────────── */

const DOOR_STATE_WORD = ["closed", "open", "locked"];
/** Context-only built things named per side of a door line; the rest are counted. */
const DOOR_BUILT_CAP = 3;

/**
 * One overview line per door that a prompt group can see from within `withinFt`:
 * `Door at 28,35 ft (closed, E-W wall): N side E1 (p4 at the door); S side p8 (10 ft). No sight line to it: E2 (p6 50 ft, wall).`
 *
 * `groups`: `[{label, prompt, members: [{id, rect, points?}]}]` (encounters, loners, context-only
 * built); `doors`: wall-ish `{c, door, ds}` in px. A group is placed on a side only through a member
 * that can see the doorway from that side: a sight line from any of its points to a spot just off
 * the door on its side, every wall counting except this door (`walls`: the scene's wall data; or
 * `reach(member, point, door)` → "LOS" | "door" | "secret door" | "wall"). Seen only past another
 * closed door → listed `through a door`. A group within range that cannot see the doorway at all
 * (the walled-off room next door) is never put on a side: it is named after the sides, tagged with
 * what blocks it. A door no prompt group can see is not printed. Neither `walls` nor `reach` →
 * every member counts as seeing it. Pure.
 */
export function doorLines(doors, groups, { dims, gridFt = 5, withinFt = 60, walls = null, reach = null } = {}) {
  if (!doors?.length || !dims) return [];
  const pxPerFt = dims.size / gridFt;
  const segs = walls ? walls.map(x => (x.a && x.b && "sight" in x ? x : wallSegment(x))) : null;
  const same = (s, d) => (s.id && d.id ? s.id === d.id
    : s.a.x === d.a.x && s.a.y === d.a.y && s.b.x === d.b.x && s.b.y === d.b.y);
  const out = [];
  const rows = [];
  for (const raw of doors) {
    const w = raw.a && raw.b ? raw : wallSegment(raw);
    if (w.door === DOOR.NONE) continue;
    const M = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const ew = Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y);
    const sides = ew ? ["N", "S"] : ["W", "E"];
    // the spot a fifth of a square off the doorway, on the side the member stands
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const nx = -(w.b.y - w.a.y) / len, ny = (w.b.x - w.a.x) / len;
    const off = dims.size * 0.2;
    const others = segs ? segs.filter(s => !same(s, w)) : null;
    // the member's side of the door's own line (not of its bounding box, which a diagonal door
    // would get wrong), named by where that side's doorway spot lies from the door's middle
    const spot = centre => {
      const sgn = (centre.x - M.x) * nx + (centre.y - M.y) * ny >= 0 ? 1 : -1;
      const P = { x: M.x + sgn * nx * off, y: M.y + sgn * ny * off };
      const side = ew ? (P.y < M.y ? sides[0] : sides[1]) : (P.x < M.x ? sides[0] : sides[1]);
      return { P, side };
    };
    const sight = (m, centre, P) => {
      if (reach) return reach(m, P, w);
      if (!others) return "LOS";
      return classifySight(m.points?.length ? m.points : [centre], [P], others);
    };
    const near = { [sides[0]]: [], [sides[1]]: [] };
    const blind = [];
    const feet = m => {
      const r = m.rect;
      const dx = Math.max(0, r.x - M.x, M.x - (r.x + r.w));
      const dy = Math.max(0, r.y - M.y, M.y - (r.y + r.h));
      const gap = Math.hypot(dx, dy) / pxPerFt;
      return gap < 0.5 ? 0 : Math.ceil(gap / 5) * 5;
    };
    // no prompt group in range: no line, so no sight test for the built things near it either
    if (!groups.some(g => g.prompt && g.members.some(m => feet(m) <= withinFt))) continue;
    for (const g of groups) {
      const cands = [];
      for (const m of g.members) {
        const ft = feet(m);
        if (ft <= withinFt) cands.push({ ft, m });
      }
      if (!cands.length) continue;
      cands.sort((a, b) => (a.ft - b.ft) || idCompare(a.m.id, b.m.id));
      // the nearest member that sees the doorway; failing that, one that sees it past another door
      let seen = null, viaDoor = null, blocked = null, blockedPrompt = null;
      const isPromptId = id => /^p\d+$/.test(String(id ?? ""));
      for (const c of cands) {
        const centre = { x: c.m.rect.x + c.m.rect.w / 2, y: c.m.rect.y + c.m.rect.h / 2 };
        const { P, side } = spot(centre);
        const los = c.ft === 0 ? "LOS" : sight(c.m, centre, P);
        const hit = { ...c, centre, side, los };
        if (los === "LOS") { seen = hit; break; }
        if ((los === "door" || los === "secret door") && !viaDoor) viaDoor = hit;
        if (!blocked) blocked = hit;
        if (!blockedPrompt && isPromptId(c.m.id)) blockedPrompt = hit;
      }
      const label = h => {
        const where = h.ft === 0 ? "at the door" : `${h.ft} ft`;
        return g.label === h.m.id ? `${g.label} (${where}` : `${g.label} (${h.m.id} ${where}`;
      };
      const best = seen ?? viaDoor;
      if (best) {
        const side = best.side;
        const tag = best === viaDoor ? `, through ${best.los === "secret door" ? "a secret door" : "another door"}` : "";
        near[side].push({ ft: best.ft, who: `${label(best)}${tag})`, prompt: !!g.prompt });
      } else if (blocked && g.prompt) {
        // only prompts: a built thing walled off from a door is nothing the builder decides about.
        // Named by a prompt of the group (what the builder designs), not by a built member that
        // happens to stand nearer; a group whose prompts are all out of range says so.
        const h = blockedPrompt ?? blocked;
        const pids = g.members.map(m => m.id).filter(isPromptId);
        const far = !blockedPrompt && pids.length ? `; its prompts ${pids.join(" ")} are farther` : "";
        blind.push({ ft: h.ft, who: `${label(h)}, ${h.los}${far})`, prompt: true });
      }
    }
    if (!near[sides[0]].some(x => x.prompt) && !near[sides[1]].some(x => x.prompt)) continue;
    const state = (w.door === DOOR.SECRET ? "secret, " : "") + (DOOR_STATE_WORD[w.ds] ?? "closed");
    const at = atFeet(M, dims);
    // every prompt group on a side; context-only built things only the nearest DOOR_BUILT_CAP (a
    // street of crowd tokens beside a door is one count, not twenty names)
    const part = s => {
      const all = near[s].sort((a, b) => a.ft - b.ft);
      const extra = all.filter(x => !x.prompt).slice(DOOR_BUILT_CAP);
      const l = all.filter(x => !extra.includes(x)).map(x => x.who);
      if (extra.length) l.push(`+${extra.length} more built`);
      return `${s} side ${l.length ? l.join(", ") : "nobody"}`;
    };
    let text = `Door at ${at[0]},${at[1]} ft (${state}, ${ew ? "E-W" : "N-S"} wall): ${part(sides[0])}; ${part(sides[1])}.`;
    if (blind.length) text += ` No sight line to it: ${blind.sort((a, b) => a.ft - b.ft).map(x => x.who).join(", ")}.`;
    rows.push({ y: M.y, x: M.x, text });
  }
  rows.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const r of rows) out.push(r.text);
  return out;
}

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

/* ── From scene items to the rendered view (pure; model.mjs feeds it) ─────── */

/**
 * Build the gather view (what `renderGather` reads) and the manifest from scene items.
 *
 * `scenes`: in output order, each
 *   { key, name, nav, mapFt, squares, gridFt, regions, levels, warn, notes, dims,
 *     items: [{ key, id, docName, isPrompt, size, rank, rect: {x, y, w, h}, centre, atFt, regions,
 *               text, updatedAt, kind, name, type, hidden, prov, description }],
 *     rel(aKey, bKey) → { ft, bearing, los } }
 *
 * Returns `{ view, manifest }`; `manifest.at` is left for the caller to stamp.
 */
export function buildView(scenes, { unseenWithinFt = 60, linkFt = 30, formationFt = 15, next = null, party = null,
  partySource = null, cropsNote = null } = {}) {
  const prepared = scenes.map(sc => {
    const byKey = new Map(sc.items.map(it => [it.key, it]));
    const prompts = sc.items.filter(it => it.isPrompt).map(it => it.key);
    const built = sc.items.filter(it => !it.isPrompt).map(it => it.key);
    const creature = k => CREATURE_KINDS.includes(byKey.get(k)?.kind);
    const disposition = k => byKey.get(k)?.disposition ?? null;
    const { groups, contextOnly } = groupScene(prompts, built, sc.rel, { linkFt, formationFt, creature, disposition });
    const info = k => { const it = byKey.get(k); return { x: it.rect.x, y: it.rect.y, rank: it.rank ?? 0 }; };
    return { sc, byKey, prompts, built, groups, contextOnly, info };
  });

  const ids = assignIds(prepared.map(p => ({ key: p.sc.key, groups: p.groups, contextOnly: p.contextOnly, info: p.info })));
  const idOf = k => ids.promptIds.get(k) ?? ids.builtIds.get(k);

  const view = { call: null, counts: { scenes: 0, prompts: 0, built: 0, encounters: 0, alone: 0 },
    scenes: [], prompts: {}, built: {}, todo: [], next, unseenWithinFt, party: parseParty(party) ? party : null,
    partySource: parseParty(party) ? partySource : null, cropsNote };
  const manifest = { call: null, at: null, scenes: {}, prompts: {}, built: {}, encounters: {} };
  const callEntries = [];

  prepared.forEach((p, idx) => {
    const sc = p.sc;
    const out = ids.scenes[idx];
    manifest.scenes[out.id] = sc.key;

    for (const k of p.prompts) {
      const it = p.byKey.get(k);
      const pid = ids.promptIds.get(k);
      const sees = [], unseen = [];
      for (const other of sc.items) {
        if (other.key === k) continue;
        const r = sc.rel(k, other.key);
        if (!r) continue;
        const rr = { id: idOf(other.key), ft: r.ft, bearing: r.bearing };
        // the door/wall classification is only paid for where the text prints it
        if (isSeen(r)) sees.push({ ...rr, los: "LOS" });
        else if (r.ft <= unseenWithinFt) unseen.push({ ...rr, los: r.los });
      }
      view.prompts[pid] = { id: pid, size: it.size, gridFt: sc.gridFt, atFt: it.atFt, regions: it.regions ?? [],
        elevation: it.elevation ?? it.centre?.elevation ?? 0, text: it.text, sees, unseen };
      manifest.prompts[pid] = { sceneId: sc.key, markerId: it.id, size: it.size, hash: textHash(it.text),
        x: it.rect.x, y: it.rect.y, w: it.rect.w, h: it.rect.h };
      callEntries.push({ sceneId: sc.key, markerId: it.id, text: it.text, pid });
    }
    for (const k of p.built) {
      const it = p.byKey.get(k);
      const tid = ids.builtIds.get(k);
      view.built[tid] = { id: tid, kind: it.kind, name: it.name, type: it.type, atFt: it.atFt,
        elevation: it.elevation ?? it.centre?.elevation ?? 0,
        regions: it.regions ?? [], hidden: !!it.hidden, prov: it.prov ?? null, description: stripHtml(it.description ?? ""),
        stats: it.stats ?? null, classes: it.classes ?? null, species: it.species ?? null, items: it.items ?? null,
        disposition: CREATURE_KINDS.includes(it.kind) ? (it.disposition ?? null) : null, xp: Number(it.xp) || 0,
        light: it.light ?? null };
      manifest.built[tid] = { sceneId: sc.key, docName: it.docName, id: it.id, xp: Number(it.xp) || 0 };
    }

    const encounters = out.encounters.map(g => {
      const members = [...g.prompts, ...g.built];
      const rects = members.map(k => p.byKey.get(k).rect);
      const box = rects.reduce((b, r) => ({
        x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h)
      }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      let span = 0;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const r = sc.rel(members[a], members[b]) ?? sc.rel(members[b], members[a]);
          if (r && Number.isFinite(r.ft)) span = Math.max(span, r.ft);
        }
      }
      const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const e = {
        id: g.id,
        centreFt: sc.dims ? atFeet(centre, sc.dims) : [0, 0],
        spanFt: span,
        members: members.map(idOf),
        formations: g.formations.map(f => [...f.prompts, ...f.built].map(idOf)
          .sort(idCompare)),
        prompts: g.prompts.map(idOf),
        built: g.built.map(idOf),
        shared: g.shared.map(idOf),
        builtXp: g.built.reduce((n, k) => n + (Number(p.byKey.get(k).xp) || 0), 0),
        _keys: g.prompts, _centre: centre
      };
      manifest.encounters[g.id] = { sceneId: sc.key, members: e.members,
        rect: { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 } };
      return e;
    });

    // Each encounter after the first: where it sits relative to the nearest earlier one.
    const relations = [];
    for (let i = 1; i < encounters.length; i++) {
      let best = null;
      for (let j = 0; j < i; j++) {
        let ft = Infinity, los = false, near = null;
        for (const a of encounters[i]._keys) {
          for (const b of encounters[j]._keys) {
            const r = sc.rel(a, b);
            if (!r) continue;
            if (r.ft < ft) { ft = r.ft; near = r; }
            if (!los && isSeen(r)) los = true;
          }
        }
        if (!best || ft < best.ft) best = { from: encounters[i].id, to: encounters[j].id, ft, los,
          bearing: bearing(encounters[j]._centre, encounters[i]._centre), near };
      }
      if (best && Number.isFinite(best.ft)) {
        const { near, ...rel } = best;
        // what blocks the nearest pair: only classified for a line that prints "no LOS"
        if (!rel.los && near) rel.block = near.los === "LOS" ? "wall" : near.los;
        relations.push(rel);
      }
    }
    for (const e of encounters) { delete e._keys; delete e._centre; }

    // A loner, placed: its nearest other prompt, and whether it can see it.
    const aloneNotes = {};
    for (const k of out.alone) {
      let best = null;
      for (const o of p.prompts) {
        if (o === k) continue;
        const r = sc.rel(o, k), back = sc.rel(k, o);
        if (!r || !back) continue;
        const ft = Math.min(r.ft, back.ft);
        if (!best || ft < best.ft || (ft === best.ft && idCompare(idOf(o), best.of) < 0)) {
          best = { of: idOf(o), ft, bearing: r.bearing, r, back };
        }
      }
      // sight only for the one neighbour the line names
      const note = {};
      if (best) {
        const los = isSeen(best.back) || isSeen(best.r) ? "LOS" : best.back.los;
        Object.assign(note, { of: best.of, ft: best.ft, bearing: best.bearing, los });
      }
      // the nearest built thing it can see (the minion beside a leader built earlier)
      let nb = null;
      for (const o of p.built) {
        const r = sc.rel(o, k), back = sc.rel(k, o);
        if (!r || !back) continue;
        const ft = Math.min(r.ft, back.ft);
        if (ft > unseenWithinFt || (nb && ft > nb.ft)) continue;
        if (!(isSeen(back) || isSeen(r))) continue;
        if (nb && ft === nb.ft && idCompare(idOf(o), nb.of) > 0) continue;
        nb = { of: idOf(o), name: p.byKey.get(o).name ?? "", ft, bearing: r.bearing };
      }
      if (nb) note.built = nb;
      if (note.of || note.built) aloneNotes[idOf(k)] = note;
    }

    // doors within reach of a prompt group: who is on which side
    const keyOfId = new Map(sc.items.map(it => [idOf(it.key), it.key]));
    const member = id => { const it = p.byKey.get(keyOfId.get(id)); return { id, rect: it.rect, points: it.points ?? null }; };
    const groupsForDoors = [
      ...encounters.map(e => ({ label: e.id, prompt: true, members: [...e.prompts, ...e.built].map(member) })),
      ...out.alone.map(k => ({ label: idOf(k), prompt: true, members: [member(idOf(k))] })),
      ...out.contextOnly.map(k => ({ label: idOf(k), prompt: false, members: [member(idOf(k))] }))
    ];
    const doorText = doorLines(sc.doors ?? [], groupsForDoors, { dims: sc.dims, gridFt: sc.gridFt, withinFt: unseenWithinFt,
      walls: sc.walls ?? null, reach: sc.doorReach ?? null });

    view.scenes.push({
      id: out.id, name: sc.name, nav: sc.nav ?? "", mapFt: sc.mapFt, squares: sc.squares, gridFt: sc.gridFt,
      regions: sc.regions ?? [], levels: sc.levels ?? 1, warn: sc.warn ?? [], notes: sc.notes ?? "",
      encounters, relations, aloneNotes, doorLines: doorText,
      alone: out.alone.map(idOf),
      contextOnly: out.contextOnly.map(idOf)
    });
    view.counts.encounters += encounters.length;
    view.counts.alone += out.alone.length;
  });

  view.counts.scenes = view.scenes.length;
  view.counts.prompts = Object.keys(view.prompts).length;
  view.counts.built = Object.keys(view.built).length;
  view.todo = Object.keys(view.prompts).sort(idCompare);
  view.call = manifest.call = callId(callEntries);
  return { view, manifest, ids };
}

/**
 * A `rel(a, b)` over plain data, cached per ordered pair. Distance from occupied squares (or the
 * gridless gap) and bearing centre to centre are computed at once; sight is LAZY — `r.seen`
 * (boolean, the primary test) and `r.los` ("LOS" | "door" | "secret door" | "wall", which adds the
 * door pass for blocked pairs) are getters evaluated on first read. Sight is the expensive part
 * (~0.1 ms per test point on a 1,500-wall map), so a pair nobody asks about costs nothing.
 *
 * `sight`: null → the pure wall test over `walls` from A's origin to B's test points;
 * `{visible(A, B) → bool, classify(A, B) → "door"|"secret door"|"wall"}` (los.mjs);
 * or a plain `(A, B) → los string` function.
 *
 * items: `[{ key, rect, centre, origin?, points?, squares? }]`
 */
export function makeRel(items, { gridSize, gridFt = 5, rule = DIAGONALS.EQUIDISTANT, gridless = false, walls = [], sight = null } = {}) {
  const byKey = new Map(items.map(it => [it.key, it]));
  const squares = new Map();
  const sq = it => {
    if (!squares.has(it.key)) squares.set(it.key, it.squares?.length ? dedupeSquares(it.squares) : occupiedSquares(it.rect, gridSize));
    return squares.get(it.key);
  };
  const segs = walls.map(w => (w.a && w.b && "sight" in w) ? w : wallSegment(w));
  const originOf = A => A.origin ?? A.centre;
  const pointsOf = B => (B.points?.length ? B.points : [B.centre]);
  let visible, classify;
  if (typeof sight === "function") {
    const memo = new Map();
    const full = (A, B) => {
      const k = `${A.key}\u0000${B.key}`;
      if (!memo.has(k)) memo.set(k, sight(A, B));
      return memo.get(k);
    };
    visible = (A, B) => full(A, B) === "LOS";
    classify = full;
  } else if (sight && typeof sight.visible === "function") {
    visible = sight.visible;
    classify = sight.classify;
  } else {
    visible = (A, B) => pointsOf(B).some(t => rayPasses(originOf(A), t, segs).clear);
    classify = (A, B) => classifyBlocked([originOf(A)], pointsOf(B), segs);
  }
  const cache = new Map();
  return function rel(a, b) {
    const k = `${a}\u0000${b}`;
    if (cache.has(k)) return cache.get(k);
    const A = byKey.get(a), B = byKey.get(b);
    if (!A || !B) return null;
    const ft = gridless ? gaplessDistanceFt(A.rect, B.rect, gridSize / gridFt, gridFt)
      : squareDistanceFt(sq(A), sq(B), { gridFt, rule });
    let seen, los;
    const r = { ft, bearing: bearing(A.centre, B.centre) };
    Object.defineProperties(r, {
      seen: { enumerable: true, get: () => (seen ??= !!visible(A, B)) },
      los: { enumerable: true, get: () => (los ??= (r.seen ? "LOS" : classify(A, B))) }
    });
    cache.set(k, r);
    return r;
  };
}

/** Test points for a rect: the centre and four points inset a quarter-square from the corners. */
export function testPoints(rect, gridSize) {
  const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const inset = Math.min(gridSize / 4, rect.w / 4, rect.h / 4);
  return [c,
    { x: rect.x + inset, y: rect.y + inset }, { x: rect.x + rect.w - inset, y: rect.y + inset },
    { x: rect.x + inset, y: rect.y + rect.h - inset }, { x: rect.x + rect.w - inset, y: rect.y + rect.h - inset }];
}

/* ── Error codes (the contract's) ────────────────────────────────────────── */

export const CODES = Object.freeze(["TEXT_CHANGED", "MARKER_GONE", "CALL_UNKNOWN", "SCENE_UNKNOWN", "BAD_SPEC", "NOT_GM", "CREATE_FAILED", "DRY_RUN_REQUIRED"]);

/** `Error("<CODE>: detail")` with `.code` set. */
export function codedError(code, detail = "") {
  const e = new Error(detail ? `${code}: ${detail}` : code);
  e.code = code;
  return e;
}

/** The code at the front of an error message, or null. */
export function errorCode(err) {
  if (err?.code && CODES.includes(err.code)) return err.code;
  const m = /^([A-Z_]+):/.exec(String(err?.message ?? err ?? ""));
  return m && CODES.includes(m[1]) ? m[1] : null;
}
