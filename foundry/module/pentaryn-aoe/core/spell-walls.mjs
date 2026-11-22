/**
 * Pentaryn AoE — B2, real spell walls (behind the core barrel: core.mjs re-exports every name here).
 * Which spells raise Wall documents and what each one blocks, where the walls go along a region's
 * shapes, the deterministic wall ids, the create/update/delete diff, knocking a section out of a
 * panel, putting a broken wall back, and which spell walls clip a spell area. No Foundry globals.
 *
 * Joe's ruling (2026-11-21, feedback 8t6Nn1): walls are for storytelling and behave like the real
 * thing — a party behind its own Wall of Stone does not see what happens on the other side.
 */

import { edgeClipsArea } from "./areas.mjs";

/** CONST.EDGE_SENSE_TYPES / CONST.WALL_MOVEMENT_TYPES values used here (core 14: NONE 0, NORMAL 20). */
export const WALL_NONE = 0;
export const WALL_NORMAL = 20;

/**
 * B2: the spells that raise walls, by dnd5e item identifier, and what their walls block.
 *   Wall of Stone: movement and sight (and light, sound).
 *   Wall of Ice:   movement and sight (Joe 2026-11-21, replacing the 2026-11-20 "see-through" note).
 *   Wall of Force: movement only — the spell is invisible. `clipsAreas`: nothing passes through it,
 *                  so another spell's area stops at it although it does not block sight.
 *   Wall of Fire:  sight only — it is opaque, but creatures walk through it (and take damage).
 * Blade Barrier and Wind Wall raise none (cover and difficult terrain, small flyers: not walls).
 */
export const SPELL_WALLS = Object.freeze({
  "wall-of-stone": Object.freeze({ move: WALL_NORMAL, sight: WALL_NORMAL, light: WALL_NORMAL, sound: WALL_NORMAL, clipsAreas: false }),
  "wall-of-ice": Object.freeze({ move: WALL_NORMAL, sight: WALL_NORMAL, light: WALL_NORMAL, sound: WALL_NORMAL, clipsAreas: false }),
  "wall-of-force": Object.freeze({ move: WALL_NORMAL, sight: WALL_NONE, light: WALL_NONE, sound: WALL_NONE, clipsAreas: true }),
  "wall-of-fire": Object.freeze({ move: WALL_NONE, sight: WALL_NORMAL, light: WALL_NONE, sound: WALL_NONE, clipsAreas: false }),
});

/** One break section, in feet: Wall of Ice's 10-foot sections, a Wall of Stone 10-foot panel, a 60-foot Wall of Fire in six. */
export const WALL_SECTION_FT = 10;

/** The fewest walls around a round wall (a Wall of Force sphere, Wall of Ice's globe, Wall of Fire's ring). */
export const WALL_MIN_RING_SECTIONS = 8;

const slug = s => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * B2: which wall spell this is, from the item's dnd5e identifier, else its name ("Wall of Stone" →
 * wall-of-stone). null for any other spell, Blade Barrier and Wind Wall included.
 * @param {{ identifier?: string|null, name?: string|null }} item
 * @returns {{ id: string, move: number, sight: number, light: number, sound: number, clipsAreas: boolean }|null}
 */
export function spellWallKind({ identifier = null, name = null } = {}) {
  for (const id of [slug(identifier), slug(name)]) {
    if (id && SPELL_WALLS[id]) return { id, ...SPELL_WALLS[id] };
  }
  return null;
}

/**
 * B2: one break section's length in scene pixels: 10 ft on the scene's grid (gridDistance feet per
 * square of gridSize px; 5 ft when unknown).
 */
export function sectionPixels(gridSize, gridDistance = 5) {
  const size = Number(gridSize) || 100;
  const dist = Number(gridDistance) > 0 ? Number(gridDistance) : 5;
  return size * WALL_SECTION_FT / dist;
}

/**
 * B2: the wall segments along one region shape, `[x1, y1, x2, y2]` each (unrounded), one per break
 * section. A line (a wall panel) is cut into equal sections of about `secPx` (at least one: a 10-foot
 * panel is one section, a 60-foot Wall of Fire six). A circle (a sphere, a cylinder) is a ring of
 * chords, at least WALL_MIN_RING_SECTIONS. Any other shape raises no wall ([]).
 * @param {{type: string, x?: number, y?: number, length?: number, rotation?: number, radius?: number}} shape
 * @param {number} secPx  sectionPixels()
 * @returns {number[][]}
 */
export function panelSections(shape, secPx) {
  if (!shape || !(secPx > 0)) return [];
  const x = Number(shape.x) || 0, y = Number(shape.y) || 0;
  if (shape.type === "line") {
    const L = Number(shape.length) || 0;
    if (!(L > 0)) return [];
    const n = Math.max(1, Math.round(L / secPx));
    const a = (Number(shape.rotation) || 0) * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const step = L / n;
    return Array.from({ length: n }, (_, i) => [x + ux * step * i, y + uy * step * i, x + ux * step * (i + 1), y + uy * step * (i + 1)]);
  }
  if (shape.type === "circle") {
    const r = Number(shape.radius) || 0;
    if (!(r > 0)) return [];
    const n = Math.max(WALL_MIN_RING_SECTIONS, Math.ceil((2 * Math.PI * r) / secPx));
    const at = i => [x + r * Math.cos((2 * Math.PI * i) / n), y + r * Math.sin((2 * Math.PI * i) / n)];
    return Array.from({ length: n }, (_, i) => [...at(i), ...at(i + 1)]);
  }
  return [];
}

/** 32-bit FNV-1a of a string with a seed. */
function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * B2: a wall's document id, the same on every client for one region, panel and section (16
 * alphanumerics, Foundry's id form). Two GM sessions (the bridge tab and a GM browser tab) both
 * create the walls; with a fixed id and keepId the server refuses the second create, as with handles.
 */
export function wallId(regionId, panel, section) {
  const key = `${regionId}:${panel}:${section}`;
  let out = "";
  for (const seed of [2166136261, 3735928559, 1540483477, 2654435761]) {
    let h = fnv(key, seed);
    for (let i = 0; i < 4; i++) { out += B62[h % 62]; h = Math.floor(h / 62); }
  }
  return out;
}

/** The key of a broken section in flags.pentaryn-aoe.wallBroken (round walls only: a line loses its shape instead). */
export const brokenKey = (panel, section) => `${panel}:${section}`;

/**
 * B2: the Wall documents a wall spell's region should have, as creation data. One wall per break
 * section on its centre line, rounded to whole pixels (Wall `c` is integers); a section listed in
 * `broken` (a round wall's knocked-out chord) and one that rounds to a point are left out.
 * Each is flagged `{ regionId, panel, section, spell, clipsAreas }` under `module`.
 * @param {{ regionId: string, shapes: object[], kind: object, broken?: string[], gridSize?: number,
 *           gridDistance?: number, levels?: string[], module?: string }} o
 * @returns {object[]}
 */
export function wallPlan({ regionId, shapes = [], kind = null, broken = [], gridSize = 100, gridDistance = 5, levels = [], module = "pentaryn-aoe" } = {}) {
  if (!regionId || !kind) return [];
  const secPx = sectionPixels(gridSize, gridDistance);
  const skip = new Set(broken ?? []);
  const out = [];
  [...(shapes ?? [])].forEach((shape, panel) => {
    panelSections(shape, secPx).forEach((seg, section) => {
      if (skip.has(brokenKey(panel, section))) return;
      const c = seg.map(v => Math.round(v));
      if (c[0] === c[2] && c[1] === c[3]) return;
      out.push({
        _id: wallId(regionId, panel, section),
        c,
        move: kind.move, sight: kind.sight, light: kind.light, sound: kind.sound,
        dir: 0, door: 0,
        ...(levels?.length ? { levels: [...levels] } : {}),
        flags: { [module]: { regionId, panel, section, spell: kind.id, clipsAreas: !!kind.clipsAreas } },
      });
    });
  });
  return out;
}

/**
 * B2 playtest (0.8.1): does any section of the wall still stand? `broken`: the round walls' knocked-out
 * chords (flags.pentaryn-aoe.wallBroken). A ring whose every chord is broken has no wall left, so the
 * GM's last break removes the area, as it does for a line wall whose last panel is gone.
 * @param {object[]} shapes
 * @param {string[]} broken
 * @param {number} secPx
 */
export function wallStanding(shapes, broken, secPx) {
  const skip = new Set(broken ?? []);
  return [...(shapes ?? [])].some((shape, panel) => panelSections(shape, secPx).some((_, section) => !skip.has(brokenKey(panel, section))));
}

/**
 * B2 playtest (0.8.1): is this deleteWall core's Clear All on the Walls layer? Core 14 sends Clear All
 * as `deleteEmbeddedDocuments("Wall", [], { deleteAll: true })` only on a scene with at most one level,
 * and the client backend strips `deleteAll` from the options its hooks get (client-backend.mjs
 * `_deleteDocuments`), so the hook never sees the flag. Every Wall of the batch is out of the scene's
 * collection before the first deleteWall hook runs, so a single-level scene left with no wall at all is
 * the batch's mark. The flag still counts, should a core version pass it. A GM who deletes the scene's
 * last walls by hand (only spell walls left, all selected) reads the same way: those walls come back,
 * and the break controls are the way to break them.
 * @param {{ deleteAll?: boolean, levels?: number, wallsLeft?: number }} o
 */
export function isClearAll({ deleteAll = false, levels = 1, wallsLeft = 0 } = {}) {
  if (deleteAll) return true;
  return (Number(levels) || 0) <= 1 && Number(wallsLeft) === 0;
}

/** The midpoint of a planned wall, for its break control. */
export function wallMidpoint(c) {
  return { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2 };
}

const SENSES = ["move", "sight", "light", "sound"];

/**
 * B2: what to write so a region's walls match its plan. `existing` are the walls flagged for the
 * region (`{ _id, c, move, sight, light, sound, levels, flags }`). A planned wall with an existing id is
 * updated when its line, senses, levels or panel/section flags differ (a dragged wall moves its walls in
 * place); a missing one is created; an existing one the plan no longer has is deleted.
 * @returns {{ create: object[], update: object[], remove: string[] }}
 */
export function diffWalls(existing = [], planned = [], { module = "pentaryn-aoe" } = {}) {
  const have = new Map([...(existing ?? [])].map(w => [w._id, w]));
  const want = new Set(planned.map(w => w._id));
  const create = [], update = [];
  for (const w of planned) {
    const old = have.get(w._id);
    if (!old) { create.push(w); continue; }
    const change = {};
    if ((old.c ?? []).join() !== w.c.join()) change.c = w.c;
    for (const k of SENSES) if (old[k] !== w[k]) change[k] = w[k];
    // A region moved to another level takes its walls along (a level-less plan leaves them as they are).
    if (w.levels && [...(old.levels ?? [])].sort().join() !== [...w.levels].sort().join()) change.levels = [...w.levels];
    const of = old.flags?.[module] ?? {}, nf = w.flags[module];
    if (of.panel !== nf.panel || of.section !== nf.section) change[`flags.${module}`] = nf;
    if (Object.keys(change).length) update.push({ _id: w._id, ...change });
  }
  const remove = [...have.keys()].filter(id => !want.has(id));
  return { create, update, remove };
}

/**
 * B2: knock one section out of a wall. A line panel loses that stretch: the shape is replaced by the
 * pieces before and after it (none, one or two), so the region itself shows the gap and which
 * creatures it holds follows. A round wall keeps its shape (its area is a disc) and the section is
 * returned as `broken`, to be added to flags.pentaryn-aoe.wallBroken. null when there is no such
 * panel or section. Pure: new shape objects, the input is not changed.
 * @param {object[]} shapes  the region's shapes, as data
 * @returns {{ shapes: object[], broken: string|null }|null}
 */
export function breakSection(shapes, panel, section, secPx) {
  const list = [...(shapes ?? [])];
  const shape = list[panel];
  const segs = panelSections(shape, secPx);
  if (!shape || !Number.isInteger(section) || section < 0 || section >= segs.length) return null;
  if (shape.type === "circle") return { shapes: list.map(s => ({ ...s })), broken: brokenKey(panel, section) };
  const L = Number(shape.length) || 0;
  const step = L / segs.length;
  const a = (Number(shape.rotation) || 0) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const piece = (from, to) => ({ ...shape, x: shape.x + ux * from, y: shape.y + uy * from, length: to - from });
  const pieces = [piece(0, step * section), piece(step * (section + 1), L)].filter(p => p.length > 0.5);
  return { shapes: [...list.slice(0, panel).map(s => ({ ...s })), ...pieces, ...list.slice(panel + 1).map(s => ({ ...s }))], broken: null };
}

/**
 * B2: knock several sections out at once (the GM deleted several of a wall's Wall documents on the
 * Walls layer). Applied from the last panel and section back to the first, so a split panel never
 * shifts the index of a section still to break. Unknown sections are skipped. null when none applied.
 * @param {object[]} shapes
 * @param {{panel: number, section: number}[]} list
 * @returns {{ shapes: object[], broken: string[], applied: number }|null}
 */
export function breakSections(shapes, list, secPx) {
  const order = [...(list ?? [])].filter(Boolean)
    .sort((a, b) => (b.panel - a.panel) || (b.section - a.section))
    .filter((s, i, arr) => i === 0 || s.panel !== arr[i - 1].panel || s.section !== arr[i - 1].section);
  let cur = [...(shapes ?? [])];
  const broken = [];
  let applied = 0;
  for (const { panel, section } of order) {
    const out = breakSection(cur, panel, section, secPx);
    if (!out) continue;
    cur = out.shapes;
    if (out.broken) broken.push(out.broken);
    applied++;
  }
  return applied ? { shapes: cur, broken, applied } : null;
}

/** Where a line piece lies along a cast line panel: `{ from, to }` in pixels from its start, or null when it is not a piece of it. */
function alongPanel(piece, panel) {
  if (piece?.type !== "line" || panel?.type !== "line") return null;
  const rot = v => (((Number(v) || 0) % 360) + 360) % 360;
  const dr = Math.abs(rot(piece.rotation) - rot(panel.rotation));
  if (Math.min(dr, 360 - dr) > 0.01) return null;
  const a = rot(panel.rotation) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const dx = (Number(piece.x) || 0) - (Number(panel.x) || 0), dy = (Number(piece.y) || 0) - (Number(panel.y) || 0);
  if (Math.abs(dy * ux - dx * uy) >= 1) return null;
  const from = dx * ux + dy * uy, to = from + (Number(piece.length) || 0);
  const L = Number(panel.length) || 0;
  return from > -0.5 && to < L + 0.5 ? { from, to } : null;
}

/**
 * Which cast panel each current shape came from. breakSection replaces a panel by its pieces in place,
 * so the shapes keep the cast order: a monotone assignment, each piece inside its own panel, in order
 * along it. null when the shapes cannot be read that way.
 */
function piecesOf(original, current) {
  const n = original.length, m = current.length;
  const owner = new Array(m).fill(-1);
  const fits = (j, i, lastTo) => {
    const p = current[j], o = original[i];
    if (p?.type === "circle" || o?.type === "circle") {
      return p?.type === o?.type && Math.abs((Number(p.x) || 0) - (Number(o.x) || 0)) < 1 && Math.abs((Number(p.y) || 0) - (Number(o.y) || 0)) < 1 && lastTo === -Infinity ? Infinity : null;
    }
    const at = alongPanel(p, o);
    return at && at.from > lastTo - 0.5 ? at.to : null;
  };
  let steps = 0;
  const walk = (j, i, lastTo) => {
    if (++steps > 20000) return false;
    if (j === m) return true;
    if (i >= n) return false;
    const to = fits(j, i, lastTo);
    if (to !== null) {
      owner[j] = i;
      if (walk(j + 1, i, to)) return true;
    }
    owner[j] = -1;
    return walk(j, i + 1, -Infinity);
  };
  return walk(0, 0, -Infinity) ? owner : null;
}

/**
 * B2: the sections knocked out of a wall's line panels, as brokenKey strings against the panels it was
 * cast with (0.8.2, live R1 D-6: a cut line panel was listed nowhere). An original section is broken
 * when no piece of that same panel covers its midpoint (0.8.3, live R2-3: overlapping panels, a broken
 * panel's stretch still covered by its neighbour, was listed as standing). A round wall's chords are
 * listed in its flags instead.
 * @param {object[]} original  the shapes before the first break, moved to where the wall is now (restoreShapes)
 * @param {object[]} current   the region's shapes now
 * @param {number} secPx       sectionPixels()
 * @returns {string[]}
 */
export function brokenLineSections(original, current, secPx) {
  const orig = [...(original ?? [])], cur = [...(current ?? [])];
  const owner = piecesOf(orig, cur);
  const piecesFor = panel => cur.filter((sh, j) => (owner ? owner[j] === panel : true) && sh?.type === "line" && Number(sh.length) > 0);
  const out = [];
  orig.forEach((shape, panel) => {
    if (shape?.type !== "line") return;
    const lines = piecesFor(panel);
    const covered = p => lines.some(sh => {
      const a = (Number(sh.rotation) || 0) * Math.PI / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      const dx = p.x - (Number(sh.x) || 0), dy = p.y - (Number(sh.y) || 0);
      const along = dx * ux + dy * uy, across = Math.abs(dy * ux - dx * uy);
      return across < 1 && along > -0.5 && along < Number(sh.length) + 0.5;
    });
    panelSections(shape, secPx).forEach(([x1, y1, x2, y2], section) => {
      if (!covered({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 })) out.push(brokenKey(panel, section));
    });
  });
  return out;
}

/**
 * B2: the shapes a broken wall had before its first break, moved by however far the wall has been
 * dragged since (`at` = the handle's position then, `now` = its position now; no handle → as stored).
 * @param {{ shapes: object[], at?: {x: number, y: number}|null }} original  flags.pentaryn-aoe.wallOriginal
 * @param {{x: number, y: number}|null} now
 * @returns {object[]}
 */
export function restoreShapes(original, now = null) {
  const shapes = [...(original?.shapes ?? [])];
  const at = original?.at ?? null;
  const dx = at && now ? (Number(now.x) || 0) - (Number(at.x) || 0) : 0;
  const dy = at && now ? (Number(now.y) || 0) - (Number(at.y) || 0) : 0;
  return shapes.map(s => (Number.isFinite(s?.x) && Number.isFinite(s?.y) ? { ...s, x: s.x + dx, y: s.y + dy } : { ...s }));
}

/**
 * B2 + Part H: does this edge stop the spell area of region `regionId`? A spell's own walls never clip
 * its own area (a Wall of Stone's region would be cut by the stone it raises). Another spell's Wall of
 * Force does (`clipsAreas`: nothing passes through it), although it blocks no sight. Everything else
 * follows the areaWalls rule (core.edgeClipsArea); with "none" no wall clips.
 * @param {object} edge                      core's edge (type, move, sight)
 * @param {string} rule                      the areaWalls rule
 * @param {string|null} regionId             the region being clipped
 * @param {{ regionId?: string, clipsAreas?: boolean }|null} wallFlags  the edge's wall flags.pentaryn-aoe
 */
export function areaEdgeClips(edge, rule = "cover", regionId = null, wallFlags = null) {
  if (wallFlags?.regionId && wallFlags.regionId === regionId) return false;
  if (rule !== "none" && wallFlags?.regionId && wallFlags.clipsAreas) return true;
  return edgeClipsArea(edge, rule);
}
