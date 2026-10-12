/**
 * Final review (senses, R4): the optional `opts` of inspect and resetSight is declared
 * `optional: true` in the manifest, and the MCP bridge maps JSON `opts: null` straight onto the
 * parameter. An explicit null must behave exactly like an omitted argument.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, standardWorld, ID, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

test("optional opts: null behaves like omitted", async () => {
  assert.deepEqual(S().inspect(ID.tHulk, null), S().inspect(ID.tHulk));
  const mark = F.calls.length;
  assert.equal(await S().resetSight(), null, "sightReset already done at ready");
  assert.equal(await S().resetSight(null), null);
  await settle(mock);
  assert.deepEqual(F.calls.slice(mark), [], "no writes");
});
