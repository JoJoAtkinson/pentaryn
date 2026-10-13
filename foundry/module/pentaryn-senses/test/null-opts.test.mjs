/**
 * Final review (senses, R4) — declared: the optional `opts` of inspect and resetSight treats an
 * explicit null as omitted (the MCP bridge maps JSON `opts: null` straight onto the parameter),
 * in step with the kit's KIT-R2 coercion. Both rows say so in describe().
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, standardWorld, ID, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

test("senses-R4: inspect(ref, null) answers like inspect(ref)", () => {
  assert.deepEqual(S().inspect(ID.tHulk, null), S().inspect(ID.tHulk));
});

test("senses-R4: resetSight(null) behaves like resetSight() — no TypeError, no writes", async () => {
  const mark = F.calls.length;
  assert.equal(await S().resetSight(), null, "sightReset already done at ready");
  assert.equal(await S().resetSight(null), null);
  await settle(mock);
  assert.deepEqual(F.calls.slice(mark), [], "no writes");
});

test("senses-R4: describe() declares null = omitted on both opts rows", () => {
  const list = S().describe().methods;
  for (const path of ["inspect", "resetSight"]) {
    const row = list.find(r => r.path === path);
    assert.ok(row, `${path} row`);
    const opts = row.params.find(p => p.name === "opts");
    assert.equal(opts.optional, true);
    assert.match(opts.doc, /null = omitted/, `${path} opts row`);
  }
});
