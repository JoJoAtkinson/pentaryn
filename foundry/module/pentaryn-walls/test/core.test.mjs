// Core characterisation (guide step 1.7). The engine is imported first and bare, through the test-side
// barrel: neither the engine nor the backend registry touches a Foundry global (the purity proof).
import * as engine from "./fixtures/engine.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf } from "./fixtures/corpus.mjs";
import { pinJSON } from "./kit/harness.mjs";

test("the engine, registry and wasm adapter load with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas", "ChatMessage"]) assert.equal(globalThis[g], undefined, g);
  for (const name of ["runEngine", "analyze", "lintOnly", "resolveConfig", "snapResolution", "canonical", "compare", "get", "available", "register", "list"]) {
    assert.equal(typeof engine[name], "function", name);
  }
  assert.equal(engine.FLAG_SCOPE, "wall-autocomplete");
  assert.deepEqual({ ...engine.SOLID }, { light: 20, move: 20, sight: 20, sound: 20, door: 0, ds: 0, dir: 0 });
});

test("snapResolution: Foundry's walls-layer snap per grid size", () => {
  const sizes = [1, 50, 63, 64, 100, 127, 128, 200];
  assert.deepEqual(sizes.map(engine.snapResolution), [2, 2, 2, 4, 4, 4, 8, 8]);
});

test("resolveConfig over grid sizes and overrides (golden/resolve-config.json)", () => {
  const rows = [{}, { gridSize: 50 }, { gridSize: 64 }, { gridSize: 140 }, { gridSize: 100, gapMax: 2, trim: false }, { gridSize: 100, weldEps: 9 }]
    .map(input => ({ input, cfg: engine.resolveConfig(input) }));
  pinJSON("resolve-config", rows, import.meta.url);
  assert.equal(engine.resolveConfig().gapMaxPx, 600);
});

// senses-walls-cursors-4: the wall-category rule exists three times (engine `category`, backends'
// canonical `kind`, the corpus `kindOf`). This table is the oracle all three must agree on.
const KINDS = [
  [{}, "solid"],
  [{ light: 0, sight: 0, sound: 0, move: 0 }, "blank"],
  [{ sight: 0 }, "invisible"],
  [{ sight: 10 }, "terrain"],
  [{ sight: 30 }, "window"],
  [{ sight: 40 }, "window"],
  [{ move: 0 }, "ethereal"],
  [{ sight: 20, move: 0 }, "ethereal"],
  [{ sight: 0, move: 0 }, "invisible"],
];
const canonicalKind = props => engine.canonical({ creates: [{ c: [0, 0, 100, 0], ...props }], updates: [], refusals: [] }).creates[0].split(":")[1];

test("senses-walls-cursors-4: kindOf (corpus) and canonical()'s kind agree over the category table", () => {
  for (const [props, want] of KINDS) {
    assert.equal(kindOf(props), want, `kindOf ${JSON.stringify(props)}`);
    assert.equal(canonicalKind(props), want, `canonical ${JSON.stringify(props)}`);
  }
});

test("canonical(): endpoints normalised, order-independent", () => {
  const r = { creates: [{ c: [100, 0, 0, 0] }, { c: [0, 0, 0, 100], sight: 30 }], updates: [{ _id: "b", c: [5, 5, 1, 1] }, { _id: "a", c: [1, 1, 2, 2] }], refusals: [{ at: [3, 4] }, { at: [1, 2] }] };
  assert.deepEqual(engine.canonical(r), {
    creates: ["0,0,0,100:window", "0,0,100,0:solid"],
    updates: ["a:1,1,2,2", "b:1,1,5,5"],
    refusals: ["1,2", "3,4"],
  });
});

test("undo oracle (legacyPlan, for step 8a) reproduces finding -1's expected selection", async () => {
  const { legacyPlan, UNDO_WALLS } = await import("./fixtures/legacy-undo.mjs");
  assert.deepEqual(legacyPlan(UNDO_WALLS, { all: false }), {
    stamped: 3, latest: "2026-01-02T00:00:00Z", generated: ["b"],
    restores: [{ _id: "c", c: [0, 0, 80, 0], "flags.-=wall-autocomplete": null }], remaining: 1,
  });
  assert.deepEqual(legacyPlan(UNDO_WALLS, { all: true }).generated, ["a", "b"]);
  assert.equal(legacyPlan([]).stamped, 0);
});
