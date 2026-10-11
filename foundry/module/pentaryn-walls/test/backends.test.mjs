// The backend registry and the wasm adapter (standalone findings, guide steps 3 and 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import * as core from "./fixtures/engine.mjs";

const ROOT = new URL("..", import.meta.url);

test("senses-walls-cursors-7: the WASM_STATUS placeholder is gone (module sources and tests)", () => {
  assert.deepEqual(sourceScan(ROOT, /WASM_STATUS/, { exclude: ["lib/", "test/kit/"] }), []);
  assert.equal("WASM_STATUS" in core, false);
});
