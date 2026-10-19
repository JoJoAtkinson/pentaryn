// Feedback 2026-10-19 (pentaryn-aoe spell areas):
//   7v8jPs  Web's cube was hard to drag and "anchored" to objects; some spells stopped at corners, others not
//   RpnWw3  a cone stopped at a rope bridge drawn with invisible walls
//   3arqpV  Hypnotic Pattern was cut by physical obstacles
//   WSMeuV  Thunder Step's emanation stayed on Marwen, followed her, and nothing removed it
// [declared] aoe-area-walls, aoe-drag-snap, aoe-instant-stationary, aoe-token-hud-remove.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, MODULE, GM_ID } from "./fixtures/world.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";
import { edgeClipsArea, areaClipOrigin, handleTopLeft, instantaneous, centreOf, AREA_WALL_RULES } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const A = (await seams()).areas;
const H = await import("../walls.mjs");

// Core's sense levels: NONE 0, LIMITED 10, NORMAL 20. Wall presets as Foundry's walls tool makes them.
const WALL = { type: "wall", move: 20, sight: 20 };
const INVISIBLE = { type: "wall", move: 20, sight: 0 };     // the bridge's sides, the tavern's tables
const TERRAIN = { type: "wall", move: 20, sight: 10 };
const ETHEREAL = { type: "wall", move: 0, sight: 20 };
const BOUNDS = { type: "outerBounds", move: 20, sight: 20 };

/* ── the rule ─────────────────────────────────────────────────────────────────────────────────── */

test("aoe-area-walls cover: only a wall that blocks movement and sight clips an area", () => {
  assert.equal(edgeClipsArea(WALL, "cover"), true);
  assert.equal(edgeClipsArea(TERRAIN, "cover"), true);
  assert.equal(edgeClipsArea(INVISIBLE, "cover"), false, "RpnWw3: the rope bridge's invisible walls are not total cover");
  assert.equal(edgeClipsArea(ETHEREAL, "cover"), false);
  assert.equal(edgeClipsArea(BOUNDS, "cover"), true, "the scene's edge always clips");
  assert.equal(edgeClipsArea(INVISIBLE, "anything else"), false, "an unknown rule reads as cover");
});

test("aoe-area-walls move keeps dnd5e's clip; none clips with no wall", () => {
  assert.deepEqual(AREA_WALL_RULES, ["cover", "move", "none"]);
  assert.equal(edgeClipsArea(INVISIBLE, "move"), true);
  assert.equal(edgeClipsArea(WALL, "none"), false);
  assert.equal(edgeClipsArea(BOUNDS, "none"), true);
});

test("aoe-area-walls: a cube is clipped from its centre; every other shape from core's origin", () => {
  const cube = [{ type: "rectangle", x: 0, y: 0, width: 400, height: 400, anchorX: 0, anchorY: 0, rotation: 0 }];
  assert.deepEqual(areaClipOrigin(cube, { x: 1000, y: 600, elevation: 0 }), { x: 1200, y: 800, elevation: 0 });
  const circle = [{ type: "circle", x: 500, y: 500, radius: 400 }];
  assert.deepEqual(areaClipOrigin(circle, { x: 500, y: 500 }), { x: 500, y: 500 });
  const cone = [{ type: "cone", x: 300, y: 300, radius: 300, angle: 53, rotation: 45 }];
  assert.deepEqual(areaClipOrigin(cone, { x: 300, y: 300 }), { x: 300, y: 300 });
  assert.deepEqual(areaClipOrigin([], { x: 1, y: 2 }), { x: 1, y: 2 });
});

/* ── the wrap (Part H) ────────────────────────────────────────────────────────────────────────── */

const scene = W.scene({ id: "WallsScene000001", grid: { size: 100, distance: 5 } });
const ACT = "Actor.wiz.Item.web0000000000001.Activity.actWeb0000000001";
const webArea = () => {
  const r = W.region(scene, {
    id: "regionWeb0000001", flags: { dnd5e: { activity: ACT } },
    shapes: [{ type: "rectangle", x: 1000, y: 600, width: 400, height: 400, anchorX: 0, anchorY: 0, rotation: 0 }],
  });
  Object.setPrototypeOf(r, Object.assign(Object.create(Object.getPrototypeOf(r)), { _computeShapeConstraint: F.RegionDocument.prototype._computeShapeConstraint }));
  return r;
};
const portal = () => {
  const r = W.region(scene, { id: "regionPortal0001", flags: {}, shapes: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 100 }] });
  Object.setPrototypeOf(r, Object.assign(Object.create(Object.getPrototypeOf(r)), { _computeShapeConstraint: F.RegionDocument.prototype._computeShapeConstraint }));
  return r;
};

test("aoe-area-walls: RegionDocument#_computeShapeConstraint is wrapped once, row aoe-area-walls", () => {
  const fn = F.RegionDocument.prototype._computeShapeConstraint;
  assert.equal(fn[H._internals.WRAPPED], true);
  assert.ok(game.pentaryn.aoe.describe().patches.some(p => p.adjustments === "aoe-area-walls" && p.label === "RegionDocument#_computeShapeConstraint"));
});

test("7v8jPs/RpnWw3: a template area drops invisible walls (cover), from the cube's centre", async () => {
  F.edges = [WALL, INVISIBLE, TERRAIN, BOUNDS];
  F.calls.length = 0;
  const poly = webArea()._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} });
  assert.deepEqual(poly.edges, [WALL, TERRAIN, BOUNDS]);
  assert.deepEqual(poly.origin, { x: 1200, y: 800 }, "the cube's centre, not its corner");
  assert.equal(F.calls.filter(c => c.op === "coreConstraint").length, 0, "built from core's move backend directly");
});

test("aoe-area-walls: setting move is core's own constraint; a region that is not a template is never touched", async () => {
  F.edges = [WALL, INVISIBLE];
  await game.settings.set(MODULE, "areaWalls", "move");
  F.calls.length = 0;
  const poly = webArea()._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} });
  assert.deepEqual(poly.edges, [WALL, INVISIBLE]);
  assert.deepEqual(poly.origin, { x: 1000, y: 600 });
  assert.equal(F.calls.filter(c => c.op === "coreConstraint").length, 1);
  await game.settings.set(MODULE, "areaWalls", "cover");
  F.calls.length = 0;
  const other = portal()._computeShapeConstraint({ x: 0, y: 0 }, { type: "move", edgeTypes: {} });
  assert.deepEqual(other.edges, [WALL, INVISIBLE], "a portal's own move restriction is core's");
  assert.equal(F.calls.filter(c => c.op === "coreConstraint").length, 1);
  await game.settings.set(MODULE, "areaWalls", "none");
  assert.deepEqual(webArea()._computeShapeConstraint({ x: 1000, y: 600 }, { type: "move", edgeTypes: {} }).edges, []);
  await game.settings.set(MODULE, "areaWalls", "cover");
});

test("aoe-area-walls: uninstall() puts core's method back", async () => {
  const before = F.RegionDocument.prototype._computeShapeConstraint;
  H.uninstall();
  assert.notEqual(F.RegionDocument.prototype._computeShapeConstraint, before);
  assert.equal(F.RegionDocument.prototype._computeShapeConstraint[H._internals.WRAPPED], undefined);
  H._internals.wrapConstraint();
  assert.equal(F.RegionDocument.prototype._computeShapeConstraint[H._internals.WRAPPED], true);
});

/* ── the handle's spot (aoe-drag-snap) ────────────────────────────────────────────────────────── */

/** Core's square-grid snap for a half-square token (BaseToken#getSnappedPositionInSquareGrid), x only. */
function coreSnapX(px, g = 100) {
  let x = Math.floor((px / g) * 8);
  const k = ((x % 8) + 8) % 8;
  if (k >= 6) x = Math.ceil(x / 8);
  else if (k === 5) x = Math.floor(x / 8) + 0.5;
  else x = Math.round(x / 2) / 4;
  return x * g;
}

test("7v8jPs: a handle centred on a grid corner was knocked off by core's snap; the new spot is a snap spot", () => {
  const corner = { x: 1500, y: 1200 };                                  // a 20 ft cube's / Fireball's centre
  const old = { x: corner.x - 25, y: corner.y - 25 };
  assert.notEqual(coreSnapX(old.x), old.x, "before: the first drag moved the area a quarter square");
  const tl = handleTopLeft(corner, { gridSize: 100 });
  assert.deepEqual(tl, { x: 1500, y: 1200 });
  assert.equal(coreSnapX(tl.x), tl.x, "after: the handle's own spot survives a snap");
  // Every snap spot the handle can reach puts the area's centre on a corner, an edge or a square centre.
  const offset = corner.x - (tl.x + 25);
  const centres = [1500, 1525, 1550, 1575, 1600].map(px => coreSnapX(px) + 25 + offset).map(c => (c % 100) / 100);
  assert.ok(centres.includes(0) && centres.includes(0.5), `corner and square-centre reachable: ${centres}`);
});

test("aoe-drag-snap: a square-centred area keeps a centred handle; gridless is centred", () => {
  assert.deepEqual(handleTopLeft({ x: 550, y: 450 }, { gridSize: 100 }), { x: 525, y: 425 });
  assert.deepEqual(handleTopLeft({ x: 1500, y: 1200 }, { gridSize: 100, square: false }), { x: 1475, y: 1175 });
  assert.deepEqual(handleTopLeft({ x: 1550, y: 1200 }, { gridSize: 100 }), { x: 1525, y: 1200 }, "an edge midpoint");
});

/* ── Thunder Step (WSMeuV) ────────────────────────────────────────────────────────────────────── */

test("WSMeuV: an instantaneous emanation is created unattached; a lasting one still follows its caster", () => {
  const inst = { duration: { units: "inst" } };
  const aura = { duration: { units: "minute" } };
  assert.equal(instantaneous(inst), true);
  assert.equal(instantaneous({ item: { system: { duration: { units: "inst" } } } }), true);
  assert.equal(instantaneous(aura), false);
  const ts = [{ attachment: { token: "marwenToken00001" }, shapes: [{ type: "emanation" }] }];
  assert.equal(A.onCreateTemplate(inst, ts), 1);
  assert.equal(ts[0].attachment.token, null);
  const sg = [{ attachment: { token: "clericToken00001" } }];
  assert.equal(A.onCreateTemplate(aura, sg), 0);
  assert.equal(sg[0].attachment.token, "clericToken00001");
  const fireball = [{ attachment: { token: undefined } }];
  assert.equal(A.onCreateTemplate(inst, fireball), 0);
});

test("WSMeuV: the hook runs on dnd5e.createMeasuredTemplate and never vetoes; the setting turns it off", async () => {
  const data = [{ attachment: { token: "marwenToken00001" } }];
  const vetoed = F.Hooks.call("dnd5e.createMeasuredTemplate", { duration: { units: "inst" } }, data);
  assert.notEqual(vetoed, false);
  assert.equal(data[0].attachment.token, null);
  await game.settings.set(MODULE, "stationaryInstantAreas", false);
  const kept = [{ attachment: { token: "marwenToken00001" } }];
  F.Hooks.call("dnd5e.createMeasuredTemplate", { duration: { units: "inst" } }, kept);
  assert.equal(kept[0].attachment.token, "marwenToken00001");
  await game.settings.set(MODULE, "stationaryInstantAreas", true);
});

test("WSMeuV: an unattached emanation gets a handle at its centre", async () => {
  const s = W.scene({ id: "ThunderScene0001", grid: { size: 100, distance: 5 } });
  const r = W.region(s, {
    id: "regionThunder001", flags: { dnd5e: { activity: ACT } }, ownership: { default: 3, [GM_ID]: 3 },
    shapes: [{ type: "emanation", radius: 300, base: { type: "token", x: 4350, y: 2550, width: 1, height: 1, shape: 4 } }],
  });
  const handle = await A.createHandle(r);
  assert.ok(handle);
  assert.deepEqual(centreOf(r.shapes[0], { gridSize: 100 }), { x: 4400, y: 2600 });
  assert.deepEqual([handle.x, handle.y], [4400, 2600]);
});

test("WSMeuV: the Token HUD of a token carrying an area gets an eraser that removes it", async () => {
  const s = W.scene({ id: "HudScene00000001", grid: { size: 100, distance: 5 } });
  F.canvas.scene = s;
  const marwen = W.token(s, { id: "marwenToken00001", name: "Marwen Ashcroft" });
  W.token(s, { id: "otherToken000001", name: "Bystander" });
  W.region(s, { id: "regionAura000001", flags: { dnd5e: { activity: ACT } }, ownership: { default: 3 }, attachment: { token: "marwenToken00001" } });
  assert.deepEqual(A.areasOnToken(marwen).map(r => r.id), ["regionAura000001"]);
  assert.deepEqual(A.areasOnToken(s.tokens.get("otherToken000001")), []);

  const hud = root('<div><div class="col right"></div></div>');
  A.decorateTokenHUD({ object: { document: s.tokens.get("otherToken000001") } }, hud);
  assert.equal(hud.querySelector("[data-pentaryn-aoe-action]"), null, "no area, no button");

  const rendered = [];
  A.decorateTokenHUD({ object: { document: marwen }, render: () => rendered.push(true) }, hud);
  const btn = hud.querySelector('[data-pentaryn-aoe-action="remove-token-areas"]');
  assert.ok(btn, "the eraser is on Marwen's HUD");
  A.decorateTokenHUD({ object: { document: marwen } }, hud);
  assert.equal(hud.querySelectorAll("[data-pentaryn-aoe-action]").length, 1, "never twice");
  F.calls.length = 0;
  dispatch(btn, "click");
  await flush();
  assert.deepEqual(F.calls.filter(c => c.op === "deleteEmbedded").map(c => [c.documentName, c.ids]), [["Region", ["regionAura000001"]]]);
  assert.equal(s.regions.has("regionAura000001"), false);
  assert.equal(rendered.length, 1, "the HUD re-renders without the button");
});
