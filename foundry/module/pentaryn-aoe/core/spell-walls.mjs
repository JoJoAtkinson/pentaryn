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

/** The midpoint of a planned wall, for its break control. */
export function wallMidpoint(c) {
  return { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2 };
}

const SENSES = ["move", "sight", "light", "sound"];

/**
 * B2: what to write so a region's walls match its plan. `existing` are the walls flagged for the
 * region (`{ _id, c, move, sight, light, sound, flags }`). A planned wall with an existing id is
 * updated when its line, senses or panel/section flags differ (a dragged wall moves its walls in
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
