// Guide step 4: the _preUpdateOperation unwrap goes through the kit's wrapMethod — recorded with its
// adjustments row (D2: a patch row carries the module prefix), marker pentarynUnwrapped kept, and
// removable. The glue suite pins what the wrap does to an operation (the -5 table).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";
import { patches } from "../lib/patch.mjs";

const F = await setup();
const TD = F.TokenDocument;
const core = TD._preUpdateOperation;
const { installPatches, removePatches } = await import("../patches.mjs");

test("installPatches: one wrap, recorded for describe().patches with the adjustments row", () => {
  const h = installPatches();
  assert.ok(h);
  assert.notEqual(TD._preUpdateOperation, core);
  assert.equal(TD._preUpdateOperation.pentarynUnwrapped, true);
  assert.deepEqual(patches(), [{ moduleId: "pentaryn-transform", label: "TokenDocument._preUpdateOperation", name: "_preUpdateOperation",
    marker: "pentarynUnwrapped", via: "direct", adjustments: "transform-preupdate-unwrap" }]);
  assert.equal(installPatches(), null, "a second call finds the marker");
  assert.equal(patches().length, 1);
});

test("removePatches restores core's own method and drops the record; installing again wraps again", () => {
  removePatches();
  assert.equal(TD._preUpdateOperation, core);
  assert.deepEqual(patches(), []);
  installPatches();
  assert.equal(TD._preUpdateOperation.pentarynUnwrapped, true);
  removePatches();
  assert.equal(TD._preUpdateOperation, core);
});
