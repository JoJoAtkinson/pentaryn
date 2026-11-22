// B1 / B3 (feedback 8t6Nn1, plan feedback-triage-2026-11-19 §H2): a wall spell's panels are drawn at
// least a fifth of a square thick, in neutral stone, on the Region placeable only — the shape's width
// (which creatures the area holds) never changes. B3: a multi-panel placement shows "Panel n of N:
// Esc to finish, right-click skips a panel" and the notice goes when the placement ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, advance, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { wallThickness, wallPanelOutline, wallSpellRegion, panelCounter, WALL_MIN_FRACTION } from "../core.mjs";

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

test("panelCounter: the panel being placed of the total; nothing for one shape or past the end", () => {
  assert.deepEqual(panelCounter(0, 10), { n: 1, total: 10 });
  assert.deepEqual(panelCounter(9, 10), { n: 10, total: 10 });
  assert.equal(panelCounter(10, 10), null);
  assert.equal(panelCounter(0, 1), null);
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
  assert.equal(F.calls.some(c => c.op === "createEmbedded" && c.documentName === "Wall"), false, "the drawing makes no Wall documents (B2 is spell-walls.mjs, on the GM, for an item it can read)");
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

/* ── 0.7.1: a wall spell's region gets a handle (playtest 2026-11-21) ── */
// dnd5e 6 combines every unattached shape of one cast into ONE region (TemplatePlacement.fromActivity:
// combinedShapes), so Wall of Stone with two or more panels is one region of several line shapes.
// Part A gave handles to one-shape regions only (since 2026-10-10), so the wall had no handle, no
// pentaryn-aoe flags, and players could not drag or delete it from the map.

test("0.7.1: a Wall of Stone region of three panels gets a handle at its first panel's start, attached; core's cascade then deletes the region with it", async () => {
  const ws = W.scene({ id: "WallHandleScene1", grid: { size: 100, distance: 5 } });
  F.canvas.scene = ws;
  const three = [
    { type: "line", x: 1500, y: 1200, length: 200, width: 5, rotation: 0 },
    { type: "line", x: 1700, y: 1200, length: 200, width: 5, rotation: 90 },
    { type: "line", x: 1700, y: 1400, length: 200, width: 5, rotation: 180 },
  ];
  const r = W.region(ws, { id: "regWallHandle001", shapes: three.map(p => ({ ...p })), ownership: { default: 0, [game.user.id]: 3 }, flags: { dnd5e: { activity: wallAct.uuid } } });
  F.calls.length = 0;
  F.fire("createRegion", r, {}, game.user.id);
  await flush(8);
  const handle = ws.tokens.get(r.id);
  assert.ok(handle, "a handle, its id the region's id");
  assert.equal(S.areas.handleFor(r), handle);
  assert.deepEqual([handle.x, handle.y], [1500, 1200], "at the first panel's start (a grid corner: the square below-right of it)");
  assert.deepEqual(r.attachment, { token: r.id }, "attached: dragging the handle moves every panel, deleting it deletes the wall");
  assert.equal(r.flags[MODULE].handle, r.id, "the region carries pentaryn-aoe's flag");
  assert.equal(r.shapes.length, 3, "the panels are untouched");

  // the stone overlay follows a drag: core moves every shape of the attached region, refreshRegion redraws
  const obj = placeable(r);
  F.fire("refreshRegion", obj, { refreshShapes: true });
  const at = () => obj.children[0].ops.filter(o => o[0] === "drawPolygon").map(o => o[1].slice(0, 2));
  assert.deepEqual(at(), [[1500, 1205], [1695, 1200], [1700, 1395]], "each panel 10 px thick (the canvas grid is 50 px here)");
  r.shapes = r.shapes.map(sh => ({ ...sh, x: sh.x + 300, y: sh.y + 100 }));   // the handle dragged 300 right, 100 down
  F.fire("refreshRegion", obj, { refreshShapes: true });
  assert.equal(obj.children.length, 1, "still one overlay");
  assert.deepEqual(at(), [[1800, 1305], [1995, 1300], [2000, 1495]], "every panel drawn where it moved to");

  // the region deleted any other way takes its handle with it (deleteHandlesOf)
  F.calls.length = 0;
  await ws.deleteEmbeddedDocuments("Region", [r.id]);
  await advance(200);
  assert.deepEqual(F.calls.filter(c => c.op === "deleteEmbedded").map(c => [c.documentName, c.ids]), [["Region", [r.id]], ["Token", [r.id]]]);
});

test("0.7.1: the GM's sweep gives an existing multi-panel wall (placed under 0.7.0) its handle", async () => {
  const ws = W.scene({ id: "WallHandleScene2", grid: { size: 100, distance: 5 } });
  const r = W.region(ws, { id: "regWallHandle002", shapes: [{ ...panels[0] }, { ...panels[1] }], ownership: { default: 3 }, flags: { dnd5e: { activity: wallAct.uuid } } });
  const out = await S.areas.sweep(ws);
  assert.equal(out.handlesCreated, 1);
  assert.equal(S.areas.handleFor(r)?.id, r.id);
});

/* ── B3: the panel counter ───────────────────────────────────────────── */

/** A notifications stub that records the notices and their updates. */
function noticesStub() {
  const notes = [];
  const info = ui.notifications.info;
  ui.notifications.info = (message, opts) => {
    const n = { message, opts, removed: false, update(u) { this.message = u.message; }, remove() { this.removed = true; } };
    notes.push(n);
    return n;
  };
  return { notes, restore: () => { ui.notifications.info = info; } };
}

test("B3: panelNotice counts each placed or skipped panel on one permanent notice, and done() removes it", () => {
  const { notes, restore } = noticesStub();
  try {
    const confirmed = [];
    const { options, done } = S.aim.panelNotice(10, { preConfirm: a => { confirmed.push(a); }, onMove: "keep" });
    assert.equal(options.onMove, "keep", "the other options pass through");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].message, "Panel 1 of 10: Shift+wheel rotates, Esc to finish, right-click skips a panel");
    assert.equal(notes[0].opts.permanent, true);
    options.preConfirm({ index: 0 });
    assert.equal(notes[0].message, "Panel 2 of 10: Shift+wheel rotates, Esc to finish, right-click skips a panel");
    options.preSkip({ index: 0 });
    assert.equal(notes[0].message, "Panel 3 of 10: Shift+wheel rotates, Esc to finish, right-click skips a panel", "a skipped panel counts too");
    assert.equal(confirmed.length, 1, "dnd5e's own preConfirm still runs");
    done();
    assert.equal(notes[0].removed, true);
  } finally { restore(); }
});

test("R4-10: each new panel starts at the rotation the last placed panel had; the caller's onMove still runs", () => {
  const { restore } = noticesStub();
  try {
    const moved = [];
    const { options, done } = S.aim.panelNotice(3, { onMove: a => { moved.push(a.shapeIndex ?? a.regionIndex); } });
    const shape = rotation => ({ rotation, rotate(d) { this.rotation += d; } });
    const p1 = shape(0);
    options.onMove({ regionIndex: 0, shapeIndex: 0, shape: p1 });
    assert.equal(p1.rotation, 0, "the first panel keeps its own rotation");
    p1.rotate(90);                                      // the GM turns it with the wheel
    options.preConfirm({ regionIndex: 0, shapeIndex: 0, shape: p1 });
    const p2 = shape(0);
    options.onMove({ regionIndex: 1, shapeIndex: 0, shape: p2 });
    assert.equal(p2.rotation, 90, "the next panel starts turned as the last one was placed");
    p2.rotate(-45);
    options.onMove({ regionIndex: 1, shapeIndex: 0, shape: p2 });
    assert.equal(p2.rotation, 45, "seeded once: a turn while placing it is kept");
    options.preSkip({ regionIndex: 1, shapeIndex: 0, shape: p2 });
    const p3 = shape(0);
    options.onMove({ regionIndex: 2, shapeIndex: 0, shape: p3 });
    assert.equal(p3.rotation, 90, "a skipped panel's rotation is not carried");
    assert.equal(moved.length, 4, "the caller's onMove runs every time");
    done();
  } finally { restore(); }
});

test("B3: a caller's preConfirm that refuses (false) does not advance the counter; one shape shows nothing", () => {
  const { notes, restore } = noticesStub();
  try {
    const one = S.aim.panelNotice(1, {});
    assert.equal(notes.length, 0, "one shape: no counter");
    assert.equal(one.options.preConfirm, undefined, "and the options are untouched");
    const { options } = S.aim.panelNotice(2, { preConfirm: () => false });
    assert.equal(options.preConfirm({}), false);
    assert.equal(notes[0].message, "Panel 1 of 2: Shift+wheel rotates, Esc to finish, right-click skips a panel");
  } finally { restore(); }
});

test("B3: an async preConfirm: a Promise of false counts nothing, a Promise of anything else advances once it settles", async () => {
  const { notes, restore } = noticesStub();
  try {
    let answer = false;
    const { options } = S.aim.panelNotice(3, { preConfirm: async () => answer });
    const refused = options.preConfirm({});
    assert.equal(typeof refused?.then, "function", "the caller's promise is handed back");
    assert.equal(await refused, false);
    assert.equal(notes[0].message, "Panel 1 of 3: Shift+wheel rotates, Esc to finish, right-click skips a panel", "the refusal counts nothing");
    answer = undefined;
    const kept = options.preConfirm({});
    assert.equal(notes[0].message, "Panel 1 of 3: Shift+wheel rotates, Esc to finish, right-click skips a panel", "not before it settles");
    assert.equal(await kept, undefined);
    assert.equal(notes[0].message, "Panel 2 of 3: Shift+wheel rotates, Esc to finish, right-click skips a panel");
  } finally { restore(); }
});

test("0.7.1: the same shape's hook called twice (core's regionIndex / shapeIndex) counts once: one step, one count", () => {
  const { notes, restore } = noticesStub();
  try {
    const { options, done } = S.aim.panelNotice(3, {});
    options.preConfirm({ regionIndex: 0, regionCount: 3, shapeIndex: 0, shapeCount: 1 });
    options.preConfirm({ regionIndex: 0, regionCount: 3, shapeIndex: 0, shapeCount: 1 });
    assert.equal(notes.length, 1, "never a second notice");
    assert.equal(notes[0].message, "Panel 2 of 3: Shift+wheel rotates, Esc to finish, right-click skips a panel", "panel 1 counted once");
    options.preSkip({ regionIndex: 1, regionCount: 3, shapeIndex: 0, shapeCount: 1 });
    assert.equal(notes[0].message, "Panel 3 of 3: Shift+wheel rotates, Esc to finish, right-click skips a panel", "the next region's shape counts");
    done();
  } finally { restore(); }
});

test("0.7.1: one panel notice on screen at a time — a new multi-panel placement removes the earlier one still showing; uninstall removes it too", () => {
  const { notes, restore } = noticesStub();
  try {
    const first = S.aim.panelNotice(10, {});
    const second = S.aim.panelNotice(10, {});
    assert.equal(notes.length, 2);
    assert.deepEqual(notes.map(n => n.removed), [true, false], "the earlier notice is gone the moment the next placement starts");
    first.done();
    assert.equal(notes[1].removed, false, "the stale placement settling later does not remove the live notice");
    second.done();
    assert.equal(notes[1].removed, true);
    S.aim.panelNotice(4, {});
    S.aim.uninstall();
    assert.equal(notes[2].removed, true, "uninstall takes the notice with it");
    S.aim.wrapPlacement();
  } finally { restore(); }
});

test("B3: through the placeRegions wrap — the counter is shown for Wall of Stone's ten regions, core gets the same list, the notice goes when placement returns", () => {
  const { notes, restore } = noticesStub();
  try {
    const data = Array.from({ length: 10 }, () => ({ shapes: [{ type: "line" }] }));
    const r = new F.RegionLayer().placeRegions(data, {});
    assert.equal(r, "placed");
    assert.equal(notes.length, 1);
    assert.match(notes[0].message, /^Panel 1 of 10/);
    assert.equal(notes[0].removed, true, "the stub's placement returned at once");
    assert.equal(typeof F.lastPlacement.preSkip, "function");
    assert.equal(S.aim.shapeCount([{ shapes: [{}, {}] }, {}]), 3, "a region's shapes each count; a shapeless one is one");
  } finally { restore(); }
});
