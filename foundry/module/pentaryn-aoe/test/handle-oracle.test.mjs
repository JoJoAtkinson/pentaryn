// The shared handle oracle (test/fixtures/handle-oracle.json). aoe owns the flags; this pins aoe's
// side of every column. portals' and creatures' isAoeHandle copies pin the `prop` column against the
// same file once migrate/wave-3 merges (follow-up in the wave-4 report). Core imported bare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isHandle, isHandleTarget } from "../core.mjs";

const { rows } = JSON.parse(readFileSync(new URL("./fixtures/handle-oracle.json", import.meta.url), "utf8"));
const doc = flags => (flags === null ? { } : { flags });

test("the oracle has rows for every column and both outcomes", () => {
  assert.ok(rows.length >= 8);
  for (const col of ["handle", "prop", "bind", "bindActor"]) {
    const vals = new Set(rows.map(r => r.want[col]));
    assert.deepEqual([...vals].sort(), [false, true], col);
  }
});

for (const r of rows) {
  test(`oracle: ${r.name}`, () => {
    const token = doc(r.token);
    const actor = doc(r.actor);
    assert.equal(isHandle(token), r.want.handle, "handle");
    assert.equal(isHandleTarget(token) || isHandleTarget(actor), r.want.prop, "prop");
    assert.equal(isHandleTarget({ document: token }), r.want.bind, "bind");
    assert.equal(isHandleTarget({ ...actor, token }), r.want.bindActor, "bindActor");
  });
}
