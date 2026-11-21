// B1 (feedback 8t6Nn1, plan feedback-triage-2026-11-19 §H2): a wall spell's panels are drawn at least a
// fifth of a square thick, in neutral stone, on the Region placeable only — the shape's width (which
// creatures the area holds) never changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { wallThickness, wallPanelOutline, wallSpellRegion, WALL_MIN_FRACTION } from "../core.mjs";

/** Just enough PIXI.Graphics to record what is drawn. */
class FakeGraphics {
  constructor() { this.ops = []; this.destroyed = false; this.parent = null; }
  clear() { this.ops = []; return this; }
  lineStyle(w, c, a) { this.ops.push(["lineStyle", w, c, a]); return this; }
  beginFill(c, a) { this.ops.push(["beginFill", c, a]); return this; }
  drawPolygon(pts) { this.ops.push(["drawPolygon", pts]); return this; }
  endFill() { this.ops.push(["endFill"]); return this; }
  destroy() { this.destroyed = true; }
}
globalThis.PIXI = { Graphics: FakeGraphics };

const { F, W } = await boot({ entry: true });
const S = await seams();
const WS = S.wallSpells;

/* ── the pure rules ──────────────────────────────────────────────────── */

test("wallThickness: the real width, or a fifth of a square when thinner (drawing only)", () => {
  assert.equal(WALL_MIN_FRACTION, 0.2);
  assert.equal(wallThickness(2.5, 50), 10, "Long Panels (0.25 ft) on a 50 px grid: 10 px, not 2.5");
  assert.equal(wallThickness(7.5, 150), 30, "on a 150 px grid: 30 px");
  assert.equal(wallThickness(50, 50), 50, "a 5 ft thick wall keeps its width");
  assert.equal(wallThickness(undefined, 100), 20);
  assert.equal(wallThickness(3, undefined), 3);
});

test("wallPanelOutline: core's line (from x,y along rotation, width centred) as a 4-point polygon at the drawn thickness", () => {
  assert.deepEqual(wallPanelOutline({ x: 100, y: 100, length: 200, width: 2.5, rotation: 0 }, 50), [100, 105, 300, 105, 300, 95, 100, 95]);
  assert.deepEqual(wallPanelOutline({ x: 0, y: 0, length: 100, width: 40, rotation: 90 }, 50), [-20, 0, -20, 100, 20, 100, 20, 0]);
});

test("wallSpellRegion: lines from a `wall` activity; height decides when the activity is unreadable; never another area", () => {
  assert.equal(wallSpellRegion({ template: true, shapeTypes: ["line", "line"], templateType: "wall" }), true);
  assert.equal(wallSpellRegion({ template: true, shapeTypes: ["line"], templateType: "line" }), false, "Lightning Bolt");
  assert.equal(wallSpellRegion({ template: true, shapeTypes: ["line"], height: 10 }), true, "no activity, but a wall's height");
  assert.equal(wallSpellRegion({ template: true, shapeTypes: ["line"] }), false);
  assert.equal(wallSpellRegion({ template: true, shapeTypes: ["line", "circle"], templateType: "wall" }), false);
  assert.equal(wallSpellRegion({ template: false, shapeTypes: ["line"], templateType: "wall" }), false, "a scene region");
  assert.equal(wallSpellRegion({ template: true, shapeTypes: [], templateType: "wall" }), false);
});

/* ── the drawing ─────────────────────────────────────────────────────── */

const s = W.scene({ id: "WallScene0000001", name: "Wall" });
F.canvas.scene = s;
F.canvas.grid = { size: 50 };
const wallAct = { uuid: "Actor.t.Item.wos.Activity.wall", target: { template: { type: "wall" } } };
const boltAct = { uuid: "Actor.t.Item.lb.Activity.bolt", target: { template: { type: "line" } } };
W.register(wallAct.uuid, wallAct);
W.register(boltAct.uuid, boltAct);
const panels = [{ type: "line", x: 100, y: 100, length: 200, width: 2.5, rotation: 0 }, { type: "line", x: 300, y: 100, length: 200, width: 2.5, rotation: 90 }];

function placeable(doc) {
  return {
    document: doc, children: [],
    addChildAt(c, i) { c.parent = this; this.children.splice(i, 0, c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; },
  };
}

test("a Wall of Stone region gets one stone overlay, every panel at 10 px on a 50 px grid; the shapes are unchanged", () => {
  const doc = W.region(s, { id: "regWallStone0001", shapes: panels.map(p => ({ ...p })), flags: { dnd5e: { activity: wallAct.uuid } } });
  const before = JSON.stringify(doc.shapes);
  const obj = placeable(doc);
  F.fire("refreshRegion", obj, { refreshShapes: true });
  F.fire("refreshRegion", obj, { refreshState: true });
  assert.equal(obj.children.length, 1, "one overlay, redrawn in place");
  const g = obj.children[0];
  const polys = g.ops.filter(o => o[0] === "drawPolygon").map(o => o[1]);
  assert.equal(polys.length, 2);
  assert.deepEqual(polys[0], [100, 105, 300, 105, 300, 95, 100, 95]);
  assert.deepEqual(g.ops.find(o => o[0] === "beginFill"), ["beginFill", 0x8f949b, 0.7], "neutral stone, not the user colour");
  assert.equal(JSON.stringify(doc.shapes), before, "the area itself is untouched");
  assert.equal(F.calls.some(c => c.op === "createEmbedded" && c.documentName === "Wall"), false, "no Wall documents (B2 is out)");
});

test("Lightning Bolt, a scene region, and a region whose shapes stop being a wall get no overlay (an old one goes)", () => {
  const bolt = placeable(W.region(s, { id: "regBolt000000001", shapes: [{ ...panels[0] }], flags: { dnd5e: { activity: boltAct.uuid } } }));
  F.fire("refreshRegion", bolt, {});
  assert.equal(bolt.children.length, 0);
  const plain = placeable(W.region(s, { id: "regPlain00000001", shapes: [{ ...panels[0] }], flags: {} }));
  F.fire("refreshRegion", plain, {});
  assert.equal(plain.children.length, 0);
  const doc = W.region(s, { id: "regWallStone0002", shapes: [{ ...panels[0] }], flags: { dnd5e: { activity: wallAct.uuid } } });
  const obj = placeable(doc);
  F.fire("refreshRegion", obj, {});
  const g = obj.children[0];
  doc.shapes = [{ type: "circle", x: 0, y: 0, radius: 10 }];
  F.fire("refreshRegion", obj, {});
  assert.equal(obj.children.length, 0);
  assert.equal(g.destroyed, true);
});

test("a redraw destroyed the overlay: the next refresh adds a fresh one; uninstall removes every overlay", () => {
  const doc = W.region(s, { id: "regWallStone0003", shapes: [{ ...panels[0] }], flags: { dnd5e: { activity: wallAct.uuid } } });
  const obj = placeable(doc);
  F.fire("refreshRegion", obj, {});
  obj.children[0].destroyed = true;
  obj.children = [];
  F.fire("refreshRegion", obj, {});
  assert.equal(obj.children.length, 1);
  F.canvas.regions = { placeables: [obj] };
  WS.uninstall();
  assert.equal(obj.children.length, 0);
  assert.equal(obj[WS.OVERLAY], undefined);
});
