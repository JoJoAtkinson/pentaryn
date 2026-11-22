// Patch records (guide S2, finding -17): every patch movement applies goes through the kit, names
// its adjustments row and keeps the `__pentarynMovement` marker; the layer sort keeps one record
// however many times the canvas is drawn.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld } from "./fixtures/world.mjs";
import { patches } from "../lib/patch.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");

const ROWS = {
  "Token#_getDragConstrainOptions": "movement-drag-constrain-ghost",
  "TokenLayer#_prepareKeyboardMovementUpdates": "movement-keyboard-constrain-ghost",
  "TokenLayer.objects#sortChildren": "movement-layer-sort-owned",
  "Token#findMovementPath": "movement-pathfind-find-path",
  "Token#_prepareDragLeftDropUpdates": "movement-group-drop",
  "Token#_onClickLeft": "movement-click-stop",
};
const MARKERS = {
  "Token#findMovementPath": "__pentarynMovementPath",
  "Token#_prepareDragLeftDropUpdates": "__pentarynMovementGroup",
  "Token#_onClickLeft": "__pentarynMovementStop",
};
const markerOf = label => MARKERS[label] ?? "__pentarynMovement";

test("setup records the five prototype wraps, each with its adjustments row and the marker", () => {
  const mine = patches().filter(p => p.moduleId === "pentaryn-movement");
  assert.deepEqual(mine.map(p => [p.label, p.adjustments, p.marker, p.via]), [
    ["Token#_getDragConstrainOptions", ROWS["Token#_getDragConstrainOptions"], "__pentarynMovement", "direct"],
    ["TokenLayer#_prepareKeyboardMovementUpdates", ROWS["TokenLayer#_prepareKeyboardMovementUpdates"], "__pentarynMovement", "direct"],
    ["Token#findMovementPath", ROWS["Token#findMovementPath"], "__pentarynMovementPath", "direct"],
    ["Token#_prepareDragLeftDropUpdates", ROWS["Token#_prepareDragLeftDropUpdates"], "__pentarynMovementGroup", "direct"],
    ["Token#_onClickLeft", ROWS["Token#_onClickLeft"], "__pentarynMovementStop", "direct"],
  ]);
});

test("a second setup does not wrap again (marker)", () => {
  const drag = CONFIG.Token.objectClass.prototype._getDragConstrainOptions;
  F.fire("setup");                                  // once-listener already consumed: nothing runs
  assert.equal(CONFIG.Token.objectClass.prototype._getDragConstrainOptions, drag);
  assert.equal(patches().length, 5);
});

test("the layer sort is recorded once per live container; a new draw drops the old record", () => {
  const a = { objects: { sortDirty: false, children: [] } };
  const b = { objects: { sortDirty: false, children: [] } };
  F.fire("drawTokenLayer", a);
  assert.equal(patches().length, 6);
  F.fire("drawTokenLayer", a);
  assert.equal(patches().length, 6, "same container: no second record");
  F.fire("drawTokenLayer", b);
  assert.equal(patches().length, 6, "new container: the old record is dropped");
  assert.equal(b.objects.sortChildren.__pentarynMovement, true);
  assert.equal(Object.hasOwn(a.objects, "sortChildren"), false, "the dead container is restored");
  for (const p of patches()) {
    assert.ok(p.adjustments, p.label);
    assert.equal(p.marker, markerOf(p.label), p.label);
    assert.equal(ROWS[p.label], p.adjustments, p.label);
  }
});

test("a sort someone else put over ours is replaced on the next draw (as before)", () => {
  const c = { objects: { sortDirty: false, children: [] } };
  F.fire("drawTokenLayer", c);
  const other = () => "other";
  c.objects.sortChildren = other;
  F.fire("drawTokenLayer", c);
  assert.equal(c.objects.sortChildren.__pentarynMovement, true);
  assert.equal(patches().length, 6);
});
