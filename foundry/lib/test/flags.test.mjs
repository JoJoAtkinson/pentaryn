import { test } from "node:test";
import assert from "node:assert/strict";
import { flagPath, readFlag } from "../flags.mjs";

test("readFlag reads data and never throws for an inactive or missing scope", () => {
  const doc = { flags: { "pentaryn-aoe": { handle: { id: "h1" } } }, getFlag() { throw new Error("Flag scope is not valid or not currently active"); } };
  assert.deepEqual(readFlag(doc, "pentaryn-aoe", "handle"), { id: "h1" });
  assert.equal(readFlag(doc, "pentaryn-aoe", "handle.id"), "h1");
  assert.equal(readFlag(doc, "pentaryn-aoe", "nope.deeper"), undefined);
  assert.equal(readFlag(doc, "pentaryn-ties", "x"), undefined);
  assert.equal(readFlag(null, "a", "b"), undefined);
  assert.deepEqual(readFlag(doc, "pentaryn-aoe"), { handle: { id: "h1" } });
});

test("flagPath", () => {
  assert.equal(flagPath("pentaryn-x", "turn"), "flags.pentaryn-x.turn");
});
