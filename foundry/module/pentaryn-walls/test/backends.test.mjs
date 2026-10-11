// The backend registry and the wasm adapter (standalone findings, guide steps 3 and 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import * as core from "./fixtures/engine.mjs";

const ROOT = new URL("..", import.meta.url);

const STALE = ["WASM", "STATUS"].join("_");

test("senses-walls-cursors-7: the stale wasm placeholder export is gone (module sources and tests)", () => {
  assert.deepEqual(sourceScan(ROOT, new RegExp(STALE), { exclude: ["lib/", "test/kit/"] }), []);
  assert.equal(STALE in core, false);
});
