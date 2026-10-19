// Code review 2026-10-19 of pentaryn-aoe 0.5.0 (Part H and the instantaneous emanations) — 0.5.1:
//   R1  a cube rotated or resized in an update was clipped from a centre built from its OLD shape:
//       core hands the new shapes to _computeShapeConstraints(changes) while this.shapes is still old
//       (region.mjs _preUpdateOperation; token.mjs rotating the region attached to a handle)
//   R2  every "inst" emanation was detached, also a monster's passive aura (a ghast's Stench)
//   R3  changing areaWalls left every placed area with its old clip
//   R4  a wrap that could not be removed (something wrapped on top) kept acting after uninstall
//   R5  the areaWalls rule was read once per edge, not once per constraint
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { areaClipOrigin, instantSpellArea } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const A = (await seams()).areas;
const H = await import("../walls.mjs");

const WALL = { type: "wall", move: 20, sight: 20 };
const INVISIBLE = { type: "wall", move: 20, sight: 0 };
const TERRAIN = { type: "wall", move: 20, sight: 10 };
const BOUNDS = { type: "outerBounds", move: 20, sight: 20 };
const ACT = "Actor.wiz.Item.web0000000000001.Activity.actWeb0000000001";

/** A region whose constraint methods are the (wrapped) RegionDocument prototype's. */
function regionOf(scene, data) {
  const r = W.region(scene, data);
  const P = F.RegionDocument.prototype;
  Object.setPrototypeOf(r, Object.assign(Object.create(Object.getPrototypeOf(r)), {
    _computeShapeConstraint: P._computeShapeConstraint, _computeShapeConstraints: P._computeShapeConstraints,
  }));
  return r;
}

const scene = W.scene({ id: "ReviewScene00001", grid: { size: 100, distance: 5 } });
// A 20 ft cube (Web) with its corner at (1000, 600): centre (1200, 800).
const CUBE = { type: "rectangle", x: 1000, y: 600, width: 400, height: 400, anchorX: 0, anchorY: 0, rotation: 0 };
const web = () => regionOf(scene, { id: "regionWebRev0001", flags: { dnd5e: { activity: ACT } }, shapes: [{ ...CUBE }] });

/* ── R1: the new shapes during an update ──────────────────────────────────────────────────────── */

test("R1: RegionDocument#_computeShapeConstraints is wrapped too, row aoe-area-walls", () => {
  assert.equal(F.RegionDocument.prototype._computeShapeConstraints[H._internals.SHAPES_WRAPPED], true);
  const rows = game.pentaryn.aoe.describe().patches.filter(p => p.adjustments === "aoe-area-walls").map(p => p.label);
  assert.deepEqual(rows.sort(), ["RegionDocument#_computeShapeConstraint", "RegionDocument#_computeShapeConstraints"]);
});

test("R1: a 20 ft cube rotated 90° (a handle's Shift-scroll) is clipped from its new centre, not the old one", () => {
  F.edges = [WALL];
  const r = web();
  // Before: core's update passes the new shapes; the clip used this.shapes (rotation 0) → (1200, 800).
  const [poly] = r._computeShapeConstraints({ shapes: [{ ...CUBE, rotation: 90 }] });
  assert.deepEqual(poly.origin, { x: 800, y: 800 }, "rotated about its corner, the cube's centre is (800, 800)");
  // The held shapes are let go after the call: the document's own shapes are read again.
  assert.deepEqual(r._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} }).origin, { x: 1200, y: 800 });
  assert.deepEqual(r._computeShapeConstraints().map(p => p.origin), [{ x: 1200, y: 800 }], "no changes: this.shapes");
});

test("R1: a cube resized in the shape config is clipped from its new centre", () => {
  F.edges = [WALL];
  const [poly] = web()._computeShapeConstraints({ shapes: [{ ...CUBE, width: 200, height: 200 }] });
  assert.deepEqual(poly.origin, { x: 1100, y: 700 });
});

test("R1: the held shapes are let go when core throws mid-call", () => {
  const r = web();
  assert.throws(() => H._internals.computeConstraints.call(r, () => { throw new Error("core"); }, { shapes: [{ ...CUBE, rotation: 90 }] }), /core/);
  F.edges = [WALL];
  assert.deepEqual(r._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} }).origin, { x: 1200, y: 800 });
});

test("R1: areaClipOrigin uses the shape whose origin core passes; a ClientShapeData-like instance is read field by field", () => {
  const two = [{ ...CUBE }, { ...CUBE, x: 3000, y: 3000, width: 200, height: 200 }];
  assert.deepEqual(areaClipOrigin(two, { x: 3000, y: 3000 }), { x: 3100, y: 3100 });
  assert.deepEqual(areaClipOrigin(two, { x: 1000, y: 600 }), { x: 1200, y: 800 });
  class Shape { get type() { return "rectangle"; } }
  const inst = Object.create(Shape.prototype, Object.fromEntries(
    Object.entries({ ...CUBE, rotation: 90 }).filter(([k]) => k !== "type").map(([k, v]) => [k, { get: () => v }])));
  assert.deepEqual(areaClipOrigin([inst], { x: 1000, y: 600 }), { x: 800, y: 800 }, "getter fields, which a spread would drop");
});

/* ── R2: a monster's aura keeps following it ──────────────────────────────────────────────────── */

test("R2: only an instantaneous SPELL's area is left where it was cast; a ghast's Stench keeps following", () => {
  const thunderStep = { duration: { units: "inst" }, item: { type: "spell" } };
  const stench = { duration: { units: "inst" }, item: { type: "feat", name: "Stench" } };   // Matron Forgotten, Starved Prisoner
  const breath = { duration: { units: "inst" }, item: { type: "weapon" } };
  assert.equal(instantSpellArea(thunderStep), true);
  assert.equal(instantSpellArea(stench), false);
  assert.equal(instantSpellArea(breath), false);
  assert.equal(instantSpellArea({ duration: { units: "minute" }, item: { type: "spell" } }), false);

  const aura = [{ attachment: { token: "ghastToken000001" } }];
  assert.equal(A.onCreateTemplate(stench, aura), 0);
  assert.equal(aura[0].attachment.token, "ghastToken000001");
  const kept = [{ attachment: { token: "ghastToken000001" } }];
  F.Hooks.call("dnd5e.createMeasuredTemplate", stench, kept);
  assert.equal(kept[0].attachment.token, "ghastToken000001", "through the hook too");
  const ts = [{ attachment: { token: "marwenToken00001" } }];
  F.Hooks.call("dnd5e.createMeasuredTemplate", thunderStep, ts);
  assert.equal(ts[0].attachment.token, null);
});

/* ── R5: the rule once per constraint ─────────────────────────────────────────────────────────── */

test("R5: areaWalls is read once per constraint, not once per edge", () => {
  F.edges = [WALL, INVISIBLE, TERRAIN, BOUNDS, WALL, INVISIBLE];
  const get = game.settings.get;
  let reads = 0;
  game.settings.get = function (ns, key) {
    if (ns === MODULE && key === "areaWalls") reads++;
    return get.call(this, ns, key);
  };
  try {
    const poly = web()._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} });
    assert.deepEqual(poly.edges, [WALL, TERRAIN, BOUNDS, WALL]);
    assert.equal(reads, 1);
  } finally {
    game.settings.get = get;
  }
});

test("R5: the caller's config is not changed by the rule riding along", () => {
  F.edges = [WALL];
  const config = { type: "move", edgeTypes: {} };
  web()._computeShapeConstraint({ x: 1000, y: 600 }, config);
  assert.equal("pentarynAreaWalls" in config, false);
});

/* ── R3: changing areaWalls re-clips the viewed levels ────────────────────────────────────────── */

function levelScene(id, { template = true } = {}) {
  const asked = [];
  const level = (lid, isView) => ({ id: lid, isView, updateRegionShapeConstraints: types => asked.push([lid, [...types]]) });
  const s = W.scene({ id, grid: { size: 100, distance: 5 }, levels: [level("levelGround00001", true), level("levelUpper000001", false)] });
  if (template) W.region(s, { id: `${id.slice(0, 10)}Area01`, flags: { dnd5e: { activity: ACT } } });
  else W.region(s, { id: `${id.slice(0, 10)}Door01`, flags: {} });
  return { s, asked };
}

test("R3: changing areaWalls asks core to recompute the move constraints on the viewed level only", async () => {
  const { s, asked } = levelScene("LevelScene000001");
  const prior = F.canvas.scene;
  F.canvas.scene = s;
  try {
    await game.settings.set(MODULE, "areaWalls", "move");
    assert.deepEqual(asked, [["levelGround00001", ["move"]]], "the viewed level; a level nobody views would come back unclipped");
    await game.settings.set(MODULE, "areaWalls", "cover");
    assert.equal(asked.length, 2);
  } finally {
    F.canvas.scene = prior;
  }
});

test("R3: a scene with no spell area is not asked; nor is anything after uninstall", async () => {
  const none = levelScene("LevelScene000002", { template: false });
  const prior = F.canvas.scene;
  F.canvas.scene = none.s;
  try {
    await game.settings.set(MODULE, "areaWalls", "none");
    assert.deepEqual(none.asked, []);
    const some = levelScene("LevelScene000003");
    F.canvas.scene = some.s;
    H.uninstall();
    await game.settings.set(MODULE, "areaWalls", "cover");
    assert.deepEqual(some.asked, [], "the handler went with uninstall()");
  } finally {
    H.install({}, { log: { error() {}, warn() {}, info() {}, debug() {} } });
    F.canvas.scene = prior;
  }
});

/* ── R4: a wrap that cannot be removed stops acting ───────────────────────────────────────────── */

test("R4: uninstalled while something else wraps on top: the left-over wrapper is core's own constraint", () => {
  const P = F.RegionDocument.prototype;
  const ours = P._computeShapeConstraint;
  const other = function (...args) { return ours.apply(this, args); };   // another module wrapped after aoe
  P._computeShapeConstraint = other;
  try {
    H.uninstall();
    assert.equal(P._computeShapeConstraint, other, "unwrap could not restore core's method");
    F.edges = [WALL, INVISIBLE];
    F.calls.length = 0;
    const poly = regionOf(scene, { id: "regionWebRev0002", flags: { dnd5e: { activity: ACT } }, shapes: [{ ...CUBE }] })
      ._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} });
    assert.deepEqual(poly.edges, [WALL, INVISIBLE], "dnd5e's clip: aoe no longer narrows the walls");
    assert.deepEqual(poly.origin, { x: 1000, y: 600 }, "nor moves the origin");
    assert.equal(F.calls.filter(c => c.op === "coreConstraint").length, 1);
  } finally {
    P._computeShapeConstraint = ours;
    H._internals.wrapConstraint();
  }
  F.edges = [WALL, INVISIBLE];
  assert.deepEqual(web()._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} }).edges, [WALL], "re-installed: acting again");
});

/* ── Second review (0.5.1) ────────────────────────────────────────────────────────────────────── */

test("review 2: the held shapes belong to their region; another region's constraint meanwhile reads its own", () => {
  F.edges = [WALL];
  const a = web();
  const b = regionOf(scene, { id: "regionWebRev0003", flags: { dnd5e: { activity: ACT } },
    shapes: [{ ...CUBE, x: 3000, y: 3000, width: 200, height: 200 }] });
  let inner = null;
  H._internals.computeConstraints.call(a, () => {
    inner = b._computeShapeConstraint({ x: 3000, y: 3000 }, { type: "move", edgeTypes: {} }).origin;
    return [];
  }, { shapes: [{ ...CUBE, rotation: 90 }] });
  assert.deepEqual(inner, { x: 3100, y: 3100 }, "b's own 10 ft cube centre, not a's held rotated shape");
});

test("review 2: a hot-patched settings copy's handler still receives the change (shared handler table)", async () => {
  const table = globalThis[Symbol.for("pentaryn-aoe.settingHandlers")];
  assert.equal(typeof table, "object", "the handler table is on a shared global");
  const prior = table.areaWalls ?? null;
  const copy = await import("../settings.mjs?hot-patch=2");
  const seen = [];
  copy.onSettingChange("areaWalls", v => seen.push(v));
  try {
    // the row registered first (the original copy's onChange) is the one Foundry keeps calling
    const row = (await import("../settings.mjs")).SETTINGS.find(r => r.key === "areaWalls");
    row.onChange("none");
    assert.deepEqual(seen, ["none"]);
  } finally {
    copy.onSettingChange("areaWalls", prior);
  }
});
