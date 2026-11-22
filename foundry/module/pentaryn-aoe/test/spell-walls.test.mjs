// B2 (feedback 8t6Nn1; Joe's ruling 2026-11-21): wall spells raise real Wall documents — Stone and Ice
// block movement and sight, Force movement only (and still stops other areas), Fire sight only, Blade
// Barrier and Wind Wall none — and the GM breaks a section (a 10-ft panel or stretch) with one click.
// A spell's own walls never clip its own area.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import {
  SPELL_WALLS, WALL_NORMAL, WALL_NONE, spellWallKind, sectionPixels, panelSections, wallId, wallPlan, diffWalls,
  breakSection, breakSections, restoreShapes, areaEdgeClips, brokenKey, isClearAll, wallStanding, wallHandleCentre,
} from "../core.mjs";

/* ── just enough PIXI for the break controls ─────────────────────────── */
class FakeContainer {
  constructor() { this.children = []; this.parent = null; this.destroyed = false; this.handlers = {}; this.position = { set: (x, y) => { this.x = x; this.y = y; } }; this.scale = { set: v => { this.s = v; } }; }
  addChild(c) { c.parent = this; this.children.push(c); return c; }
  addChildAt(c, i) { c.parent = this; this.children.splice(i, 0, c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  destroy() { this.destroyed = true; }
}
class FakeGraphics extends FakeContainer {
  constructor() { super(); this.ops = []; }
  clear() { this.ops = []; return this; }
  lineStyle(...a) { this.ops.push(["lineStyle", ...a]); return this; }
  beginFill(...a) { this.ops.push(["beginFill", ...a]); return this; }
  drawCircle(...a) { this.ops.push(["drawCircle", ...a]); return this; }
  drawPolygon(...a) { this.ops.push(["drawPolygon", ...a]); return this; }
  moveTo(...a) { this.ops.push(["moveTo", ...a]); return this; }
  lineTo(...a) { this.ops.push(["lineTo", ...a]); return this; }
  endFill() { return this; }
}
class FakeText extends FakeContainer { constructor(t) { super(); this.text = t; this.anchor = { set() {} }; } }
globalThis.PIXI = { Container: FakeContainer, Graphics: FakeGraphics, Text: FakeText, Circle: class { constructor(...a) { this.a = a; } } };

const { F, W } = await boot({ entry: true });
const S = await seams();
const SW = S.spellWalls;
const H = await import("../walls.mjs");   // as area-walls.test.mjs reaches Part H

/* ── the pure rules ──────────────────────────────────────────────────── */

test("B2: per spell, what its walls block (Joe 2026-11-21); Blade Barrier and Wind Wall raise none", () => {
  const k = id => { const w = spellWallKind({ identifier: id }); return w && [w.move > 0, w.sight > 0, w.clipsAreas]; };
  assert.deepEqual(k("wall-of-stone"), [true, true, false], "Stone: movement and sight");
  assert.deepEqual(k("wall-of-ice"), [true, true, false], "Ice: movement and sight (replaces the 2026-11-20 see-through note)");
  assert.deepEqual(k("wall-of-force"), [true, false, true], "Force: movement only, invisible; stops other areas");
  assert.deepEqual(k("wall-of-fire"), [false, true, false], "Fire: sight only");
  assert.equal(spellWallKind({ identifier: "blade-barrier" }), null);
  assert.equal(spellWallKind({ identifier: "wind-wall" }), null);
  assert.equal(spellWallKind({ identifier: "fireball" }), null);
  assert.equal(spellWallKind({ identifier: "", name: "Wall of Stone" })?.id, "wall-of-stone", "the name when the identifier is blank");
  assert.deepEqual(Object.keys(SPELL_WALLS), ["wall-of-stone", "wall-of-ice", "wall-of-force", "wall-of-fire"]);
  assert.deepEqual([WALL_NONE, WALL_NORMAL], [0, 20], "core 14 EDGE_SENSE_TYPES / WALL_MOVEMENT_TYPES");
});

test("B2: break sections are 10 ft: a 10-ft panel is one, a 20-ft Long Panel two, a 60-ft Wall of Fire six; a ring at least eight chords", () => {
  assert.equal(sectionPixels(50, 5), 100);
  assert.equal(sectionPixels(150, 5), 300);
  assert.equal(sectionPixels(100), 200, "5 ft a square when unknown");
  const px = sectionPixels(100, 5);
  assert.deepEqual(panelSections({ type: "line", x: 0, y: 0, length: 200, rotation: 0 }, px), [[0, 0, 200, 0]]);
  assert.equal(panelSections({ type: "line", x: 0, y: 0, length: 400, rotation: 90 }, px).length, 2);
  const fire = panelSections({ type: "line", x: 0, y: 0, length: 1200, rotation: 0 }, px);
  assert.equal(fire.length, 6);
  assert.deepEqual(fire[2], [400, 0, 600, 0]);
  const ring = panelSections({ type: "circle", x: 500, y: 500, radius: 200 }, px);
  assert.equal(ring.length, 8, "a 10-ft radius ring (63 ft round) is 8 chords");
  assert.deepEqual(ring[0].map(Math.round), [700, 500, 641, 641]);
  assert.equal(panelSections({ type: "circle", x: 0, y: 0, radius: 1000 }, px).length, 32, "a bigger ring, about 10 ft a chord");
  assert.deepEqual(panelSections({ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }, px), [], "no walls for other shapes");
  assert.deepEqual(panelSections({ type: "line", x: 0, y: 0, length: 0 }, px), []);
});

test("B2: wallId is fixed per region, panel and section — 16 alphanumerics, the same on every client, distinct otherwise", () => {
  const a = wallId("regWall000000001", 0, 0);
  assert.match(a, /^[A-Za-z0-9]{16}$/);
  assert.equal(wallId("regWall000000001", 0, 0), a);
  const ids = new Set();
  for (let p = 0; p < 10; p++) for (let s = 0; s < 6; s++) ids.add(wallId("regWall000000001", p, s));
  ids.add(wallId("regWall000000002", 0, 0));
  assert.equal(ids.size, 61);
});

const stone = { type: "line", width: 5, rotation: 0 };
const kind = id => spellWallKind({ identifier: id });

test("B2: wallPlan — one wall per section on the centre line, the spell's senses, its region's level, the flags", () => {
  const shapes = [{ ...stone, x: 100, y: 100, length: 200 }, { ...stone, x: 300, y: 100, length: 400, rotation: 90 }];
  const plan = wallPlan({ regionId: "regWall000000001", shapes, kind: kind("wall-of-stone"), gridSize: 100, gridDistance: 5, levels: ["lvl1"] });
  assert.deepEqual(plan.map(w => w.c), [[100, 100, 300, 100], [300, 100, 300, 300], [300, 300, 300, 500]]);
  assert.deepEqual(plan.map(w => [w.flags[MODULE].panel, w.flags[MODULE].section]), [[0, 0], [1, 0], [1, 1]]);
  assert.deepEqual([plan[0].move, plan[0].sight, plan[0].light, plan[0].sound, plan[0].dir, plan[0].door], [20, 20, 20, 20, 0, 0]);
  assert.deepEqual(plan[0].levels, ["lvl1"]);
  assert.deepEqual(plan[0].flags[MODULE], { regionId: "regWall000000001", panel: 0, section: 0, spell: "wall-of-stone", clipsAreas: false });
  assert.equal(plan[1]._id, wallId("regWall000000001", 1, 0));
  const force = wallPlan({ regionId: "r", shapes: [shapes[0]], kind: kind("wall-of-force") })[0];
  assert.deepEqual([force.move, force.sight, force.light, force.flags[MODULE].clipsAreas], [20, 0, 0, true], "Force: movement only");
  const fire = wallPlan({ regionId: "r", shapes: [{ ...stone, x: 0, y: 0, length: 1200 }], kind: kind("wall-of-fire") });
  assert.equal(fire.length, 6);
  assert.deepEqual([fire[0].move, fire[0].sight], [0, 20], "Fire: sight only");
  assert.equal(wallPlan({ regionId: "r", shapes, kind: null }).length, 0, "no kind, no walls");
  assert.equal(wallPlan({ regionId: "r", shapes, kind: kind("wall-of-stone") })[0].levels, undefined, "no level: none written");
  const ring = wallPlan({ regionId: "r", shapes: [{ type: "circle", x: 500, y: 500, radius: 200 }], kind: kind("wall-of-ice"), broken: [brokenKey(0, 3)] });
  assert.equal(ring.length, 7, "a broken chord of a round wall is left out");
  assert.ok(!ring.some(w => w.flags[MODULE].section === 3));
  assert.ok(ring.every(w => w.c.every(Number.isInteger)), "Wall c is integers");
});

test("B2: diffWalls — create the missing, move the dragged, delete the gone; an unchanged wall is left alone", () => {
  const planned = wallPlan({ regionId: "r", shapes: [{ ...stone, x: 0, y: 0, length: 400 }], kind: kind("wall-of-stone") });
  assert.deepEqual(diffWalls([], planned).create.length, 2);
  const existing = planned.map(w => ({ _id: w._id, c: [...w.c], move: w.move, sight: w.sight, light: w.light, sound: w.sound, flags: w.flags }));
  assert.deepEqual(diffWalls(existing, planned), { create: [], update: [], remove: [] });
  const moved = wallPlan({ regionId: "r", shapes: [{ ...stone, x: 50, y: 0, length: 200 }], kind: kind("wall-of-stone") });
  const d = diffWalls(existing, moved);
  assert.deepEqual(d.update, [{ _id: planned[0]._id, c: [50, 0, 250, 0] }]);
  assert.deepEqual(d.remove, [planned[1]._id]);
  assert.deepEqual(d.create, []);
  const extra = [...existing, { _id: "strayWall0000001", c: [0, 0, 1, 1], flags: {} }];
  assert.deepEqual(diffWalls(extra, planned).remove, ["strayWall0000001"]);
});

test("B2: breakSection — a one-section panel goes, a long panel is cut around the section, a ring lists the chord; nothing for a bad index", () => {
  const px = sectionPixels(100, 5);   // 200 px
  const three = [{ ...stone, x: 0, y: 0, length: 200 }, { ...stone, x: 200, y: 0, length: 200 }, { ...stone, x: 400, y: 0, length: 200 }];
  const mid = breakSection(three, 1, 0, px);
  assert.deepEqual(mid.shapes.map(s => s.x), [0, 400], "the middle Wall of Stone panel is gone: a gap");
  assert.equal(mid.broken, null);
  assert.equal(three.length, 3, "the input is not changed");
  const fire = [{ ...stone, x: 0, y: 0, length: 1200 }];
  const cut = breakSection(fire, 0, 2, px);
  assert.deepEqual(cut.shapes.map(s => [s.x, s.length]), [[0, 400], [600, 600]], "60-ft wall, third 10 ft out: 20 ft + 30 ft");
  const vert = breakSection([{ ...stone, x: 0, y: 0, length: 400, rotation: 90 }], 0, 0, px);
  assert.deepEqual(vert.shapes.map(s => [Math.round(s.x), s.y, s.length]), [[0, 200, 200]], "the first 10 ft of a 20-ft panel: the rest keeps its rotation");
  const ring = breakSection([{ type: "circle", x: 0, y: 0, radius: 200 }], 0, 5, px);
  assert.equal(ring.broken, "0:5");
  assert.equal(ring.shapes.length, 1, "a round wall keeps its disc");
  assert.equal(breakSection(three, 3, 0, px), null);
  assert.equal(breakSection(three, 0, 1, px), null);
  assert.equal(breakSection(three, 0, -1, px), null);
});

test("B2: breakSections — several at once, last first, so splitting one panel never shifts a section still to break", () => {
  const px = sectionPixels(100, 5);
  const shapes = [{ ...stone, x: 0, y: 0, length: 600 }, { ...stone, x: 600, y: 0, length: 200 }];
  const out = breakSections(shapes, [{ panel: 0, section: 0 }, { panel: 0, section: 2 }, { panel: 1, section: 0 }, { panel: 0, section: 2 }], px);
  assert.deepEqual(out.shapes.map(s => [s.x, s.length]), [[200, 200]], "only the middle 10 ft of the first panel stands");
  assert.equal(out.applied, 3, "a repeated section counts once");
  assert.equal(breakSections(shapes, [{ panel: 9, section: 0 }], px), null);
});

test("B2: restoreShapes puts the wall back where its handle is now", () => {
  const original = { shapes: [{ ...stone, x: 0, y: 0, length: 200 }, { type: "circle", x: 50, y: 50, radius: 10 }], at: { x: 10, y: 10 } };
  assert.deepEqual(restoreShapes(original, { x: 110, y: 60 }).map(s => [s.x, s.y]), [[100, 50], [150, 100]]);
  assert.deepEqual(restoreShapes(original, null).map(s => [s.x, s.y]), [[0, 0], [50, 50]], "no handle: as stored");
  assert.deepEqual(restoreShapes({ shapes: original.shapes, at: null }, { x: 5, y: 5 }).map(s => s.x), [0, 50]);
});

test("B2 + Part H: areaEdgeClips — own walls never clip their own area; a Wall of Force clips other areas; the rest follow areaWalls", () => {
  const stoneEdge = { type: "wall", move: 20, sight: 20 };
  const forceEdge = { type: "wall", move: 20, sight: 0 };
  const own = { regionId: "regA", clipsAreas: false };
  assert.equal(areaEdgeClips(stoneEdge, "cover", "regA", own), false, "Wall of Stone does not cut its own region");
  assert.equal(areaEdgeClips(stoneEdge, "move", "regA", own), false, "nor under move");
  assert.equal(areaEdgeClips(stoneEdge, "cover", "regB", own), true, "another area stops at the stone");
  assert.equal(areaEdgeClips(forceEdge, "cover", "regB", { regionId: "regF", clipsAreas: true }), true, "a Fireball stops at a Wall of Force");
  assert.equal(areaEdgeClips(forceEdge, "cover", "regF", { regionId: "regF", clipsAreas: true }), false, "not its own");
  assert.equal(areaEdgeClips(forceEdge, "none", "regB", { regionId: "regF", clipsAreas: true }), false, "none: no wall clips");
  assert.equal(areaEdgeClips(forceEdge, "cover", "regB", null), false, "a map's move-only wall still does not clip");
  assert.equal(areaEdgeClips({ type: "outerBounds" }, "cover", "regA", null), true);
});

test("B2: walls.mjs's narrowed polygon reads the edge's spell-wall flags and the region id from its config", () => {
  const W2 = H._internals;
  class Base { constructor(cfg) { this.config = cfg; } _testEdgeInclusion() { return true; } static create(o, cfg) { return new this(cfg); } }
  const P = W2.areaBackend(Base);
  const edge = flags => ({ type: "wall", move: 20, sight: 20, object: { document: { flags: { [MODULE]: flags } } } });
  const poly = new P({ pentarynAreaWalls: "cover", pentarynRegionId: "regA" });
  assert.equal(poly._testEdgeInclusion(edge({ regionId: "regA" })), false);
  assert.equal(poly._testEdgeInclusion(edge({ regionId: "regB" })), true);
  assert.equal(poly._testEdgeInclusion({ type: "wall", move: 20, sight: 0, object: { flags: { [MODULE]: { regionId: "regF", clipsAreas: true } } } }), true, "a WallDocument as the edge object");
  assert.equal(W2.spellWallFlags({ type: "wall", object: { document: { flags: {} } } }), null);
});

/* ── the sync on the active GM's client ──────────────────────────────── */

/** A scene with a Wall collection: what the sync reads and writes. */
function wallScene(id) {
  const s = W.scene({ id, name: id, grid: { size: 100, distance: 5 } });
  const walls = new Map();
  walls.some = fn => [...walls.values()].some(fn);
  walls[Symbol.iterator] = function* () { yield* this.values(); };
  Object.defineProperty(s, "walls", { value: walls, enumerable: false });
  const base = { create: s.createEmbeddedDocuments, del: s.deleteEmbeddedDocuments, upd: s.updateEmbeddedDocuments };
  s.wallOps = [];
  s.createEmbeddedDocuments = async function (name, list, options = {}) {
    if (name !== "Wall") return base.create.call(this, name, list, options);
    s.wallOps.push(["create", list.map(d => d._id), { ...options }]);
    for (const d of list) {
      if (options.keepId && walls.has(d._id)) throw new Error(`The Wall id [${d._id}] already exists in the embedded collection`);
      walls.set(d._id, { id: d._id, ...structuredClone(d), _source: { c: [...d.c] }, parent: s });
    }
    return list;
  };
  s.deleteEmbeddedDocuments = async function (name, ids, options = {}) {
    if (name !== "Wall") return base.del.call(this, name, ids, options);
    s.wallOps.push(["delete", [...ids], { ...options }]);
    const gone = ids.map(i => walls.get(i));
    for (const i of ids) { if (!walls.has(i)) throw new Error(`Wall id [${i}] does not exist in the EmbeddedCollection`); walls.delete(i); }
    for (const w of gone) F.fire("deleteWall", w, options, game.user.id);
    return gone;
  };
  s.updateEmbeddedDocuments = async function (name, updates, options = {}) {
    if (name !== "Wall") return base.upd.call(this, name, updates, options);
    s.wallOps.push(["update", updates.map(u => u._id), { ...options }]);
    for (const { _id, ...ch } of updates) {
      const w = walls.get(_id);
      Object.assign(w, ch);
      if (ch.c) w._source.c = [...ch.c];
    }
    return updates;
  };
  return s;
}

const stoneItem = W.item({ id: "itemWallStone001", name: "Wall of Stone", system: { identifier: "wall-of-stone", duration: { units: "minute" } } });
const forceItem = W.item({ id: "itemWallForce001", name: "Wall of Force", system: { identifier: "wall-of-force", duration: { units: "minute" } } });
const bladeItem = W.item({ id: "itemBladeBarr001", name: "Blade Barrier", system: { identifier: "blade-barrier", duration: { units: "minute" } } });

function wallRegion(s, id, item, shapes) {
  const r = W.region(s, { id, shapes, ownership: { default: 3 }, levels: ["lvlGround0000001"], flags: { dnd5e: { item: item.uuid, activity: `${item.uuid}.Activity.x` } } });
  r.update = async function (changes) {
    for (const [path, v] of Object.entries(changes)) F.foundry.utils.setProperty(this, path, v);
    F.fire("updateRegion", this, changes, {}, game.user.id);
    return this;
  };
  return r;
}

const square = [{ ...stone, x: 1000, y: 1000, length: 200 }, { ...stone, x: 1200, y: 1000, length: 200 }, { ...stone, x: 1400, y: 1000, length: 200 }];

test("B2: a Wall of Stone region gets three walls (movement + sight) on the GM's client; a drag moves them; deleting the region removes them", async () => {
  const s = wallScene("WallSyncScene001");
  const r = wallRegion(s, "regWallSync00001", stoneItem, square.map(x => ({ ...x })));
  assert.equal(SW.wallKindOf(r)?.id, "wall-of-stone");
  const out = await SW.syncRegion(r);
  assert.deepEqual(out, { created: 3, updated: 0, deleted: 0 });
  const walls = [...s.walls.values()];
  assert.deepEqual(walls.map(w => [w.c, w.move, w.sight]), [[[1000, 1000, 1200, 1000], 20, 20], [[1200, 1000, 1400, 1000], 20, 20], [[1400, 1000, 1600, 1000], 20, 20]]);
  assert.deepEqual(walls[0].levels, ["lvlGround0000001"]);
  assert.equal(s.wallOps[0][2].keepId, true, "fixed ids, keepId");
  assert.deepEqual(await SW.syncRegion(r), { created: 0, updated: 0, deleted: 0 }, "idempotent");

  // a handle drag: core rewrites every shape, updateRegion fires, the walls move in place
  await r.update({ shapes: r.shapes.map(x => ({ ...x, x: x.x + 100 })) });
  await flush();
  assert.deepEqual([...s.walls.values()].map(w => w.c[0]), [1100, 1300, 1500]);
  assert.deepEqual(s.wallOps.at(-1)[0], "update");

  // concentration ends (or anyone deletes the area): deleteRegion → every wall goes, silently (no break)
  s.regions.delete(r.id);
  F.fire("deleteRegion", r, {}, game.user.id);
  await flush();
  assert.equal(s.walls.size, 0);
  assert.equal(s.wallOps.at(-1)[2].pentarynAoeWalls, true, "the sync's own delete is marked, so deleteWall does not read it as a break");
});

test("B2: a second GM session's create is refused per wall ('already exists') and swallowed", async () => {
  const s = wallScene("WallSyncScene002");
  const r = wallRegion(s, "regWallSync00002", stoneItem, square.map(x => ({ ...x })));
  const [first] = wallPlan({ regionId: r.id, shapes: r.shapes, kind: kind("wall-of-stone"), gridSize: 100, gridDistance: 5, levels: ["lvlGround0000001"] });
  await s.createEmbeddedDocuments("Wall", [first], { keepId: true });   // the other GM tab got one in first
  const out = await SW.syncRegion(r);
  assert.equal(out.created, 2, "the two it still needed");
  assert.equal(s.walls.size, 3);
});

test("B2: Blade Barrier and a Fireball get no walls; the setting off removes a wall spell's walls", async () => {
  const s = wallScene("WallSyncScene003");
  const blade = wallRegion(s, "regBlade00000001", bladeItem, [{ ...stone, x: 0, y: 0, length: 2000 }]);
  assert.deepEqual(await SW.syncRegion(blade), { created: 0, updated: 0, deleted: 0 });
  const r = wallRegion(s, "regWallSync00003", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  assert.equal(s.walls.size, 3);
  await game.settings.set(MODULE, "spellWalls", false);
  assert.deepEqual(await SW.syncRegion(r), { created: 0, updated: 0, deleted: 3 });
  await game.settings.set(MODULE, "spellWalls", true);
  await SW.syncRegion(r);
  assert.equal(s.walls.size, 3);
});

test("B2: syncScene deletes spell walls whose region is gone and fills every wall spell", async () => {
  const s = wallScene("WallSyncScene004");
  s.walls.set("orphanWall000001", { id: "orphanWall000001", c: [0, 0, 1, 1], flags: { [MODULE]: { regionId: "regGone000000001" } }, _source: { c: [0, 0, 1, 1] } });
  s.walls.set("mapWall000000001", { id: "mapWall000000001", c: [0, 0, 5, 5], flags: {}, _source: { c: [0, 0, 5, 5] } });
  wallRegion(s, "regWallSync00004", forceItem, square.map(x => ({ ...x })));
  const out = await SW.syncScene(s);
  assert.deepEqual(out, { regions: 1, created: 3, updated: 0, deleted: 0, orphans: 1 });
  assert.ok(s.walls.has("mapWall000000001"), "the map's own walls are never touched");
  assert.ok([...s.walls.values()].filter(w => w.flags?.[MODULE]?.regionId).every(w => w.move === 20 && w.sight === 0), "Wall of Force: movement only");
});

test("B2: breaking a section (GM) cuts the region's shape, its walls follow, a toast says so; right-click repair puts it back where the handle is", async () => {
  const s = wallScene("WallSyncScene005");
  F.canvas.scene = s;
  const r = wallRegion(s, "regWallSync00005", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  F.calls.length = 0;
  const out = await SW.breakWallSection(r, 1, 0);
  await flush();
  assert.deepEqual(out, { regionId: r.id, broken: 1, panels: 2, destroyed: false });
  assert.deepEqual(r.shapes.map(x => x.x), [1000, 1400], "the middle panel is gone from the drawn area");
  assert.deepEqual([...s.walls.values()].map(w => w.c[0]).sort(), [1000, 1400], "and from the walls");
  assert.deepEqual(r.flags[MODULE].wallOriginal.shapes.map(x => x.x), [1000, 1200, 1400], "the whole wall is kept for a repair");
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["info", "Wall of Stone: a section is broken."]], "one toast");
  assert.deepEqual(SW.wallsFor(r.id)?.walls.length, 2);
  assert.equal(SW.wallsFor(r.id)?.repairable, true);
  assert.deepEqual(SW.wallsFor(r.id)?.broken, ["1:0"], "the knocked-out section is listed (live R1 D-6), against the panels as cast");

  await SW.breakWallSection(r, 0, 0);
  await flush();
  assert.deepEqual(r.shapes.map(x => x.x), [1400]);
  assert.deepEqual(SW.wallsFor(r.id)?.broken, ["0:0", "1:0"]);
  const back = await SW.repairWall(r);
  await flush();
  assert.deepEqual(back, { regionId: r.id, panels: 3 });
  assert.deepEqual(r.shapes.map(x => x.x), [1000, 1200, 1400]);
  assert.equal(s.walls.size, 3, "every wall back");
  assert.equal(r.flags[MODULE].wallOriginal, null);
  assert.equal(await SW.repairWall(r), null, "nothing broken: nothing to repair");
});

test("B2: breaking the last section removes the wall and its area; a player cannot break", async () => {
  const s = wallScene("WallSyncScene006");
  const r = wallRegion(s, "regWallSync00006", stoneItem, [{ ...stone, x: 0, y: 0, length: 200 }]);
  await SW.syncRegion(r);
  const out = await SW.breakWallSection(r, 0, 0);
  assert.equal(out.destroyed, true);
  assert.equal(s.regions.has(r.id), false);
  await flush();
  assert.equal(s.walls.size, 0);
  const isGM = game.user.isGM;
  game.user.isGM = false;
  try {
    const r2 = wallRegion(s, "regWallSync00007", stoneItem, square.map(x => ({ ...x })));
    assert.equal(await SW.breakWallSection(r2, 0, 0), null);
    assert.equal(r2.shapes.length, 3);
  } finally { game.user.isGM = isGM; }
});

test("B2: the GM deleting spell walls on the Walls layer breaks those sections (so a drag does not bring them back)", async () => {
  const s = wallScene("WallSyncScene008");
  const r = wallRegion(s, "regWallSync00008", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  const ids = [...s.walls.values()].filter(w => w.flags[MODULE].panel !== 1).map(w => w.id);
  await s.deleteEmbeddedDocuments("Wall", ids, {});   // a GM's own delete: no sync marker
  await flush(); await flush();
  assert.deepEqual(r.shapes.map(x => x.x), [1200], "panels 0 and 2 broken in one go");
  assert.equal(s.walls.size, 1);
});

test("B2 review: a second click on the same wall while the first break is in flight is dropped (it would undo the first, or break the wrong stretch)", async () => {
  const s = wallScene("WallSyncScene010");
  const r = wallRegion(s, "regWallSync00010", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  const apply = r.update;
  let land;
  const roundTrip = new Promise(res => { land = res; });
  r.update = async function (changes) { await roundTrip; return apply.call(this, changes); };   // the server round trip
  const first = SW.breakWallSection(r, 0, 0);
  const second = SW.breakWallSection(r, 2, 0);   // before the first region.update has landed
  land();
  const [a, b] = await Promise.all([first, second]);
  r.update = apply;
  assert.equal(b, null, "dropped");
  assert.equal(a?.broken, 1);
  await flush();
  assert.deepEqual(r.shapes.map(x => x.x), [1200, 1400], "only the first break, and it held");
  assert.equal(SW.busy.size, 0, "nothing left in flight");
  assert.equal((await SW.breakWallSection(r, 1, 0))?.broken, 1, "a later click works");
});

test("B2 review: with spellWalls off, the GM deleting a leftover spell wall on the Walls layer does not break the area", async () => {
  const s = wallScene("WallSyncScene011");
  const r = wallRegion(s, "regWallSync00011", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  await game.settings.set(MODULE, "spellWalls", false);
  try {
    const [one] = [...s.walls.keys()];
    await s.deleteEmbeddedDocuments("Wall", [one], {});
    await flush(); await flush();
    assert.equal(r.shapes.length, 3, "the area is untouched");
  } finally { await game.settings.set(MODULE, "spellWalls", true); }
});

test("B2: the GM gets one break control per section on canvas.controls; click breaks, right-click repairs; a player gets none", async () => {
  const s = wallScene("WallSyncScene009");
  F.canvas.scene = s;
  F.canvas.controls = new FakeContainer();
  F.canvas.dimensions = { uiScale: 1 };
  const r = wallRegion(s, "regWallSync00009", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  const placeable = { document: r, visible: true };
  const g = SW.drawControls(placeable);
  assert.equal(g.children.length, 3);
  assert.deepEqual(g.children.map(c => [c.x, c.y]), [[1100, 1000], [1300, 1000], [1500, 1000]], "at each section's midpoint");
  assert.equal(g.children[0].eventMode, "static");
  assert.deepEqual(g.children[1].pentarynWall, { regionId: r.id, panel: 1, section: 0 });
  let stopped = 0;
  g.children[1].handlers.pointerdown({ button: 0, stopPropagation: () => stopped++ });
  await flush(); await flush();
  assert.equal(stopped, 1);
  assert.deepEqual(r.shapes.map(x => x.x), [1000, 1400]);
  const g2 = SW.drawControls(placeable);
  assert.equal(g2.children.length, 2, "redrawn: the broken section has no control");
  g2.children[0].handlers.rightdown({ stopPropagation() {} });
  await flush(); await flush();
  assert.equal(r.shapes.length, 3, "right-click repaired the wall");
  const isGM = game.user.isGM;
  game.user.isGM = false;
  try {
    assert.equal(SW.drawControls(placeable), undefined);
    assert.equal(F.canvas.controls[SW.ROOT].byRegion.has(r.id), false, "a player sees no controls");
  } finally { game.user.isGM = isGM; }
});

test("B2: a round wall (Wall of Force's sphere) is drawn as its ring of sections on everyone's map, a broken one left open", () => {
  const s = wallScene("WallSyncScene010");
  F.canvas.grid = { size: 100 };
  const r = wallRegion(s, "regWallRing00001", forceItem, [{ type: "circle", x: 500, y: 500, radius: 200 }]);
  r.flags[MODULE] = { wallBroken: ["0:3"] };
  const obj = new FakeContainer();
  obj.document = r;
  obj.visible = true;
  F.fire("refreshRegion", obj, {});
  const g = obj.children[0];
  assert.equal(g.ops.filter(o => o[0] === "moveTo").length, 14, "7 of 8 sections, each stroked twice (edge, fill)");
});

test("B2 review: a region moved to another level takes its walls along (diffWalls compares levels)", () => {
  const planned = wallPlan({ regionId: "r", shapes: [{ ...stone, x: 0, y: 0, length: 200 }], kind: kind("wall-of-stone"), levels: ["lvlUpper00000001"] });
  const existing = planned.map(w => ({ _id: w._id, c: [...w.c], move: w.move, sight: w.sight, light: w.light, sound: w.sound, levels: ["lvlGround0000001"], flags: w.flags }));
  assert.deepEqual(diffWalls(existing, planned).update, [{ _id: planned[0]._id, levels: ["lvlUpper00000001"] }]);
  const same = existing.map(w => ({ ...w, levels: ["lvlUpper00000001"] }));
  assert.deepEqual(diffWalls(same, planned).update, [], "the same levels: no write");
  const levelless = wallPlan({ regionId: "r", shapes: [{ ...stone, x: 0, y: 0, length: 200 }], kind: kind("wall-of-stone") });
  assert.deepEqual(diffWalls(existing, levelless).update, [], "a level-less plan leaves the walls' levels alone");
});

test("B2 review: a drag preview of a wall region (a clone, same id) neither draws nor drops the real region's controls", async () => {
  const s = wallScene("WallSyncScene012");
  F.canvas.scene = s;
  F.canvas.controls = new FakeContainer();
  F.canvas.dimensions = { uiScale: 1 };
  const r = wallRegion(s, "regWallSync00012", stoneItem, square.map(x => ({ ...x })));
  const real = SW.drawControls({ document: r, visible: true });
  assert.equal(real.children.length, 3);
  const preview = { document: r, visible: true, isPreview: true, animationState: { shapes: [square[0]] } };
  assert.equal(SW.drawControls(preview), null);
  F.fire("destroyRegion", preview);
  await flush();
  assert.equal(F.canvas.controls[SW.ROOT].byRegion.get(r.id), real, "the real controls stay");
});

test("B2 review: Clear All on the Walls layer (deleteAll) breaks no wall spell; the active GM raises their walls again", async () => {
  const s = wallScene("WallSyncScene013");
  const r = wallRegion(s, "regWallSync00013", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  await s.deleteEmbeddedDocuments("Wall", [...s.walls.keys()], { deleteAll: true });
  await flush(); await flush(); await flush();
  assert.equal(r.shapes.length, 3, "the area is untouched, not destroyed");
  assert.equal(s.walls.size, 3, "its walls are back");
});

/* ── 0.8.1: the live play-test on core 14.370 ─────────────────────────── */

test("0.8.1: core 14 strips deleteAll from the hook options — an emptied single-level scene is Clear All: no break, the walls come back", async () => {
  assert.equal(isClearAll({ deleteAll: true, levels: 3, wallsLeft: 9 }), true, "the flag, should core pass it");
  assert.equal(isClearAll({ levels: 1, wallsLeft: 0 }), true);
  assert.equal(isClearAll({ levels: 0, wallsLeft: 0 }), true, "a scene with no level list");
  assert.equal(isClearAll({ levels: 1, wallsLeft: 1 }), false, "a wall left: a GM's own delete");
  assert.equal(isClearAll({ levels: 2, wallsLeft: 0 }), false, "several levels: core deletes by id, no Clear All mark");
  const s = wallScene("WallSyncScene081");
  const r = wallRegion(s, "regWallSync00081", stoneItem, square.map(x => ({ ...x })));
  await SW.syncRegion(r);
  await s.deleteEmbeddedDocuments("Wall", [...s.walls.keys()], {});   // what core 14's hooks get: no deleteAll
  await flush(); await flush(); await flush();
  assert.equal(r.shapes.length, 3, "the area is untouched, not destroyed");
  assert.equal(s.walls.size, 3, "its walls are back");
});

test("0.8.1: a round wall's break and repair (flags only) ask its placeable for a refresh, so the gap and the controls redraw", () => {
  const set = [];
  const region = { object: { renderFlags: { set: f => set.push(f) } } };
  SW.onUpdateRegionFlags(region, { flags: { [MODULE]: { wallBroken: ["0:1"] } } });
  SW.onUpdateRegionFlags(region, { flags: { [MODULE]: { wallOriginal: null, wallBroken: [] } } });
  SW.onUpdateRegionFlags(region, { flags: { [MODULE]: { "-=wallOriginal": null } } });
  SW.onUpdateRegionFlags(region, { flags: { [MODULE]: { handle: "x" } } });
  SW.onUpdateRegionFlags(region, { shapes: [] });
  SW.onUpdateRegionFlags({ object: null }, { flags: { [MODULE]: { wallBroken: [] } } });
  assert.deepEqual(set, [{ refreshState: true }, { refreshState: true }, { refreshState: true }]);
});

test("0.8.1: breaking a ring's last standing chord removes the area (no empty ring left behind)", async () => {
  assert.equal(wallStanding([{ type: "circle", x: 0, y: 0, radius: 200 }], ["0:0", "0:1"], 200), true);
  assert.equal(wallStanding([{ type: "circle", x: 0, y: 0, radius: 200 }], [0, 1, 2, 3, 4, 5, 6, 7].map(i => `0:${i}`), 200), false);
  assert.equal(wallStanding([], [], 200), false);
  const s = wallScene("WallSyncScene082");
  F.canvas.scene = s;
  const r = wallRegion(s, "regWallRing00082", forceItem, [{ type: "circle", x: 500, y: 500, radius: 200 }]);
  r.flags[MODULE] = { wallBroken: [0, 1, 2, 3, 4, 5, 6].map(i => `0:${i}`) };
  await SW.syncRegion(r);
  assert.equal(s.walls.size, 1);
  const out = await SW.breakWallSection(r, 0, 7);
  assert.equal(out?.destroyed, true);
  assert.equal(s.regions.has(r.id), false, "the region is gone");
});

test("0.8.1: a wall spell's handle sits just outside its wall (half a square before a panel's start, outside a ring), never on the wall line", () => {
  assert.deepEqual(wallHandleCentre({ type: "line", x: 500, y: 1250, rotation: 0, length: 200 }, { gridSize: 100 }), { x: 450, y: 1250 });
  assert.deepEqual(wallHandleCentre({ type: "line", x: 500, y: 500, rotation: 90, length: 200 }, { gridSize: 100 }), { x: 500, y: 450 });
  assert.deepEqual(wallHandleCentre({ type: "circle", x: 1500, y: 600, radius: 200 }, { gridSize: 100 }), { x: 1750, y: 600 });
  assert.equal(wallHandleCentre({ type: "line", x: 20, y: 500, rotation: 0, length: 200 }, { gridSize: 100, bounds: { width: 3000, height: 2000 } }), null, "off the scene: the caller keeps the anchor");
  assert.equal(wallHandleCentre({ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }), null);
  assert.equal(wallHandleCentre(null), null);
});

test("B2 (live R1 D-6): brokenLineSections lists a section cut out of the middle of a long panel, against the panel as cast", async () => {
  const { brokenLineSections, breakSection } = await import("../core.mjs");
  const panel = { type: "line", x: 100, y: 200, length: 600, rotation: 90, width: 10 };
  const cut = breakSection([panel], 0, 2, 100).shapes;
  assert.equal(cut.length, 2, "split in two");
  assert.deepEqual(brokenLineSections([panel], cut, 100), ["0:2"]);
  assert.deepEqual(brokenLineSections([panel], [panel], 100), [], "nothing cut, nothing listed");
  const again = breakSection(cut, 1, 0, 100).shapes;          // the first section of the far piece: the cast panel's section 3
  assert.deepEqual(brokenLineSections([panel], again, 100), ["0:2", "0:3"]);
});
