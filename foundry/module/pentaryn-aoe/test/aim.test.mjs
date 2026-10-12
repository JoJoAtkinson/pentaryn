// Part G (-44): a Self cone or line starts at its caster and points at the pointer. The
// dnd5e.preCreateMeasuredTemplate hook arms one aim; the hand-made wrap of
// RegionLayer.prototype.placeRegions consumes it and passes core an onMove.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, MODULE } from "./fixtures/world.mjs";
import { seams, freshAim } from "./fixtures/seams.mjs";
import { aimFromCaster } from "../core.mjs";

const { F, W } = await boot();
const S = await seams();
const { RegionLayer } = F;
const orig = RegionLayer.prototype.placeRegions;
const WRAPPED = Symbol.for(`${MODULE}.aimWrapped`);
const scene = W.scene({ id: "AimScene00000001" });
const caster = W.token(scene, { id: "casterTok0000001", x: 0, y: 0, width: 1, height: 1 });
F.canvas.scene = scene;

const selfCone = (over = {}) => ({
  range: { units: "self" }, target: { template: { type: "cone" } },
  getUsageToken: () => ({ document: caster }), ...over,
});
const arm = activity => F.fire("dnd5e.preCreateMeasuredTemplate", activity);
const place = (options = {}) => {
  F.lastPlacement = undefined;
  const r = new RegionLayer().placeRegions({}, options);
  return { r, options: F.lastPlacement };
};
const cone = () => {
  const shape = { type: "cone", updates: [], updateSource(u) { this.updates.push(u); } };
  return shape;
};

S.aim.installAim();

test("installAim wraps RegionLayer.prototype.placeRegions once (marker Symbol.for('pentaryn-aoe.aimWrapped'))", () => {
  assert.notEqual(RegionLayer.prototype.placeRegions, orig);
  assert.equal(S.aim.WRAPPED, WRAPPED);
  const wrapped = RegionLayer.prototype.placeRegions;
  S.aim.installAim();
  assert.equal(RegionLayer.prototype.placeRegions, wrapped, "a second install does not re-wrap");
  assert.deepEqual(S.hooks.hookIds().map(h => h.name), ["dnd5e.preCreateMeasuredTemplate", "dnd5e.preCreateMeasuredTemplate"],
    "but registers its hook again (installHooks' installed gate is what prevents this live)");
  S.hooks.offAll();
  S.aim.installAim();
});

test("armed Self cone: core gets an onMove that keeps the origin on the caster's edge and returns false", () => {
  arm(selfCone());
  assert.deepEqual(S.aim.armed(), { tokenId: caster.id, sceneId: scene.id, until: Date.now() + 5000 });
  const { r, options } = place();
  assert.equal(r, "placed");
  assert.equal(typeof options.onMove, "function");
  assert.equal(S.aim.armed(), null, "one placement consumes the aim");
  const shape = cone();
  assert.equal(options.onMove({ shape, position: { x: 300, y: 50 } }), false);
  assert.deepEqual(shape.updates, [aimFromCaster({ x: 50, y: 50 }, 50, 50, { x: 300, y: 50 })]);
  assert.deepEqual(shape.updates, [{ x: 100, y: 50, rotation: 0 }]);
});

test("a line aims too; a circle or a missing token falls back to core's default (undefined)", () => {
  arm(selfCone({ target: { template: { type: "line" } } }));
  const { options } = place();
  const line = { type: "line", updates: [], updateSource(u) { this.updates.push(u); } };
  assert.equal(options.onMove({ shape: line, position: { x: 50, y: 400 } }), false);
  assert.deepEqual(line.updates, [{ x: 50, y: 100, rotation: 90 }]);
  const circle = { type: "circle", updateSource() { throw new Error("no"); } };
  assert.equal(options.onMove({ shape: circle, position: { x: 1, y: 1 } }), undefined);
  scene.tokens.delete(caster.id);
  assert.equal(options.onMove({ shape: cone(), position: { x: 1, y: 1 } }), undefined);
  scene.tokens.set(caster.id, caster);
});

test("their onMove runs first; a literal false from it wins", () => {
  arm(selfCone());
  const seen = [];
  const { options } = place({ onMove: args => { seen.push("theirs"); return false; } });
  const shape = cone();
  assert.equal(options.onMove({ shape, position: { x: 300, y: 50 } }), false);
  assert.deepEqual([seen, shape.updates], [["theirs"], []]);
  arm(selfCone());
  const { options: o2 } = place({ onMove: () => { seen.push("theirs2"); } });
  const s2 = cone();
  assert.equal(o2.onMove({ shape: s2, position: { x: 300, y: 50 } }), false);
  assert.equal(s2.updates.length, 1);
});

test("not armed, a ranged cone, a Self circle, another scene or an expired aim → no onMove", async () => {
  assert.equal(place().options.onMove, undefined, "not armed");
  arm(selfCone({ range: { units: "ft" } }));
  assert.equal(S.aim.armed(), null, "ranged cone does not arm");
  arm(selfCone({ target: { template: { type: "sphere" } } }));
  assert.equal(S.aim.armed(), null, "Self sphere does not arm");
  arm(selfCone({ getUsageToken: () => { throw new Error("no token"); } }));
  assert.equal(S.aim.armed(), null, "a throwing getUsageToken does not arm");
  arm(selfCone({ getUsageToken: () => W.token(W.scene({ id: "OtherScene000001" }), { id: "elsewhere0000001" }) }));
  assert.equal(S.aim.armed(), null, "a caster on another scene does not arm");
  arm(selfCone());
  F.canvas.scene = W.scene({ id: "ViewScene0000001" });
  assert.equal(place().options.onMove, undefined, "the viewed scene changed");
  F.canvas.scene = scene;
  arm(selfCone());
  await advance(5000);
  assert.equal(place().options.onMove, undefined, "expired after 5 s");
});

test("a new preCreate disarms first; aimSelfAreas off arms nothing", async () => {
  arm(selfCone());
  arm(selfCone({ range: { units: "ft" } }));
  assert.equal(S.aim.armed(), null);
  S.settings.registerSettings();
  await game.settings.set(MODULE, "aimSelfAreas", false);
  arm(selfCone());
  assert.equal(S.aim.armed(), null);
  await game.settings.set(MODULE, "aimSelfAreas", true);
  arm(selfCone());
  await game.settings.set(MODULE, "aimSelfAreas", false);
  assert.equal(place().options.onMove, undefined, "the setting is read again at placement");
  await game.settings.set(MODULE, "aimSelfAreas", true);
});

test("[declared] D-A7 -44: after uninstall, a hot-patched copy wraps placeRegions again with its own state → it aims", async () => {
  S.aim.uninstall();
  S.hooks.offAll();
  assert.equal(RegionLayer.prototype.placeRegions, orig, "core's own placeRegions is back");
  const B = await freshAim(2);
  B.installAim();
  arm(selfCone());
  assert.deepEqual(B.armed()?.tokenId, caster.id, "the copy armed its own state");
  assert.equal(typeof place().options.onMove, "function", "Self cones keep aiming after a hot patch");
  B.uninstall();
  S.hooks.offAll();
});

test("-44 a hot-patched copy aims after uninstall (D-A7)", async () => {
  const B = await freshAim(3);
  B.installAim();
  arm(selfCone());
  assert.equal(typeof place().options.onMove, "function");
});
