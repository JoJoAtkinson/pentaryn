// Finding aoe-movement-portals-26's hand-computed tables (guide S2), pinned on the ORACLE: verbatim
// copies of the glue's pure logic at the checkpoint (fixtures/legacy-geometry.mjs). Bare node, no
// Foundry stub. S2 moved this logic into portals-core.mjs; the second half checks core = oracle.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as oracle from "./fixtures/legacy-geometry.mjs";
import * as core from "../portals-core.mjs";

const SHAPES = () => [
  { type: "rectangle", x: 100, y: 200, width: 100, height: 100 },
  { type: "polygon", points: [0, 0, 10, 0, 10, 10] },
  { type: "circle", x: null, y: 5 },
];
const CROP = { cx: 1000, cy: 800, dims: { sceneX: 200, sceneY: 100, sceneWidth: 4000, sceneHeight: 3000, size: 100 }, natural: { w: 2000, h: 1500 }, squaresWide: 8, squaresHigh: 5 };
const WALLS = [
  { move: 20, door: 0, ds: 0, c: [0, 0, 1, 1] },
  { move: 0, c: [9, 9, 9, 9] },
  { move: 20, door: 1, ds: 1, c: [2, 2, 3, 3] },
  { move: 20, door: 1, ds: 0, c: [4, 4, 5, 5] },
  { move: 20, door: 2, ds: 1, c: [6, 6, 7, 7] },
];
const ID = "dialog-Scene.S.Region.R.RegionBehavior.B-tok1";

test("oracle translateShapes: rect x150 y175; polygon shifted pairwise; a null x stays null; input untouched", () => {
  const input = SHAPES();
  const out = oracle.translateShapes(input, 50, -25);
  assert.deepEqual(out, [
    { type: "rectangle", x: 150, y: 175, width: 100, height: 100 },
    { type: "polygon", points: [50, -25, 60, -25, 60, -15] },
    { type: "circle", x: null, y: -20 },
  ]);
  assert.deepEqual(input, SHAPES());
});

test("oracle cropWindow: the interior case and a centre clamped at the image's top-left", () => {
  assert.deepEqual(oracle.cropWindow(CROP), { x: 200, y: 225, w: 400, h: 250, outW: 480, outH: 300, mx: 240, my: 150, markR: 27 });
  const clamped = oracle.cropWindow({ ...CROP, cx: 200, cy: 100 });
  assert.deepEqual([clamped.x, clamped.y, clamped.mx, clamped.my], [0, 0, 0, 0]);
});

test("oracle blockingWallCoords: moving walls, minus open doors (ds 1)", () => {
  assert.deepEqual(oracle.blockingWallCoords(WALLS), [[0, 0, 1, 1], [4, 4, 5, 5]]);
});

test("oracle dialog id parsing: behaviour uuid and token id", () => {
  assert.equal(oracle.behaviorUuidFromDialogId(ID), "Scene.S.Region.R.RegionBehavior.B");
  assert.equal(oracle.behaviorUuidFromDialogId("dialog-abc"), null);
  assert.equal(oracle.behaviorUuidFromDialogId("x-Scene.S.Region.R.RegionBehavior.B-t"), null);
  assert.equal(oracle.tokenIdFromDialogId(ID), "tok1");
});

test("oracle tokenBox / occupiedBy", () => {
  assert.deepEqual(oracle.tokenBox({ x: 100, y: 200, width: 2, height: 1 }, 100), { x: 100, y: 200, w: 200, h: 100 });
  const occ = oracle.occupiedBy([{ x: 100, y: 200, w: 200, h: 100 }]);
  assert.deepEqual([occ(100, 200), occ(299, 299), occ(300, 200), occ(99, 250)], [true, true, false, false]);
});

test("oracle samplePoints: five points; a 40×200 region gives q = 10", () => {
  assert.deepEqual(oracle.samplePoints({ x: 0, y: 0, width: 100, height: 100 }, 100), [
    { x: 50, y: 50 }, { x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 75 }, { x: 75, y: 75 },
  ]);
  assert.deepEqual(oracle.samplePoints({ x: 0, y: 0, width: 40, height: 200 }, 100)[1], { x: 10, y: 10 });
});

test("oracle cardFor: a blank title falls back to the nav name; no scene → region name and the door icon", () => {
  assert.deepEqual(oracle.cardFor({ uuid: "U", name: "R", flags: { "pentaryn-portals": { title: "  " } }, parent: { navName: "Pit", thumb: "t.webp" } }),
    { uuid: "U", title: "Pit", img: "t.webp", description: "" });
  assert.deepEqual(oracle.cardFor({ uuid: "U", name: "R" }), { uuid: "U", title: "R", img: "icons/svg/door-exit.svg", description: "" });
});

/* ── S2: the core agrees with the oracle ─────────────────────────────── */

test("core translateShapes = oracle (tables and a toObject-shaped copy); input untouched", () => {
  for (const [sx, sy] of [[50, -25], [0, 0], [-100, 300], [0.5, 1e6]]) {
    const input = SHAPES();
    assert.deepEqual(core.translateShapes(input, sx, sy), oracle.translateShapes(SHAPES(), sx, sy));
    assert.deepEqual(input, SHAPES());
  }
  assert.deepEqual(core.translateShapes([], 1, 1), []);
});

test("core cropWindow = oracle on interior, clamped and odd-size windows", () => {
  const cases = [CROP, { ...CROP, cx: 200, cy: 100 }, { ...CROP, cx: 4200, cy: 3100 }, { ...CROP, squaresWide: 6, squaresHigh: 6 },
    { ...CROP, natural: { w: 4000, h: 2000 }, dims: { ...CROP.dims, sceneWidth: 2000, sceneHeight: 1000, size: 140 } }];
  for (const c of cases) assert.deepEqual(core.cropWindow(c), oracle.cropWindow(c));
  assert.equal(core.cropWindow({ ...CROP, outW: 240 }).outH, 150, "outW is a parameter (default 480)");
});

test("core blockingWallCoords / tokenBox / occupiedBy = oracle", () => {
  assert.deepEqual(core.blockingWallCoords(WALLS), oracle.blockingWallCoords(WALLS));
  assert.deepEqual(core.blockingWallCoords([]), []);
  const t = { x: 100, y: 200, width: 2, height: 1 };
  assert.deepEqual(core.tokenBox(t, 100), oracle.tokenBox(t, 100));
  const boxes = [{ x: 100, y: 200, w: 200, h: 100 }, { x: 0, y: 0, w: 50, h: 50 }];
  const a = core.occupiedBy(boxes), b = oracle.occupiedBy(boxes);
  for (const [x, y] of [[100, 200], [299, 299], [300, 200], [0, 0], [49, 49], [50, 0], [-1, 0]]) assert.equal(a(x, y), b(x, y), `${x},${y}`);
});

test("core dialogIdParts: one parse for the behaviour uuid and the token id (= both old parses)", () => {
  for (const id of [ID, "dialog-Scene.S.Region.R.RegionBehavior.B-", "dialog-Scene.A.Region.B.RegionBehavior.C-tok-9"]) {
    assert.deepEqual(core.dialogIdParts(id), { behaviorUuid: oracle.behaviorUuidFromDialogId(id), tokenId: oracle.tokenIdFromDialogId(id) });
  }
  for (const id of ["dialog-abc", "x-Scene.S.Region.R.RegionBehavior.B-t", "", undefined]) {
    assert.equal(core.dialogIdParts(id), null, String(id));
  }
});

test("core samplePoints = oracle, grid size passed in", () => {
  for (const b of [{ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 40, height: 200 }, { x: 37, y: -5, width: 300, height: 70 }]) {
    for (const g of [100, 50, 140]) assert.deepEqual(core.samplePoints(b, g), oracle.samplePoints(b, g));
  }
});

test("core cardData = oracle cardFor over the same region", () => {
  const regions = [
    { uuid: "U", name: "R", flags: { "pentaryn-portals": { title: "  " } }, parent: { navName: "Pit", thumb: "t.webp" } },
    { uuid: "U", name: "R" },
    { uuid: "U", name: "R", flags: { "pentaryn-portals": { title: " T ", img: " i.webp ", description: " d\n " } }, parent: { name: "S" } },
    { uuid: "U", name: "R", parent: { navName: "", name: "Scene name", thumb: null } },
  ];
  for (const r of regions) {
    assert.deepEqual(core.cardData({ flags: r.flags?.["pentaryn-portals"], uuid: r.uuid, sceneNavName: r.parent?.navName,
      sceneName: r.parent?.name, sceneThumb: r.parent?.thumb, regionName: r.name }), oracle.cardFor(r));
  }
});
