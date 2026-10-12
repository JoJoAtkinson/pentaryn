/**
 * mcp-fork-10, the parity half: "Recharge n-6" is built twice — by this module's patch
 * (`actor-patch-adapter.mjs` rechargeData, private) and by the fork's dnd5e-add-feature
 * (`packages/foundry-module/src/fork/recharge.ts` rechargeUpdate). Not merged (different
 * packages); this pins that both write the same row. The module side is read through its public
 * path, `applyPatch(actor, {recharge})`, so rechargeData stays unexported. Reads $FOUNDRY_MCP_FORK
 * (node strips the TypeScript types); without it the test skips.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { forkSource } from "./kit/harness.mjs";
import { installWorld } from "./fixtures/world.mjs";

await installWorld();
const P = await import("../actor-patch-adapter.mjs");

const RECHARGE = "packages/foundry-module/src/fork/recharge.ts";

/** A feature as dnd5e holds it: two activities, one already consuming uses, one a material cost (a DataModel). */
function breath() {
  const material = { type: "material", target: "x", value: "2", toObject() { return { type: "material", target: "x", value: "2" }; } };
  return {
    id: "itBreath00000001", name: "Breath",
    system: { activities: [
      { id: "a1", consumption: { targets: [{ type: "itemUses", target: "", value: "1" }, material] } },
      { id: "a2", consumption: { targets: [] } },
      { id: "a3" }
    ] }
  };
}

/** The `updateEmbeddedDocuments("Item", rows)` applyPatch makes for `{recharge: {Breath: n}}`. */
async function moduleRow(n) {
  const item = breath();
  const writes = [];
  const actor = {
    name: "Dragon", system: {},
    items: { get: id => (id === item.id ? item : undefined), find: fn => [item].find(fn) },
    updateEmbeddedDocuments: async (type, rows) => { writes.push([type, rows]); return rows; },
    createEmbeddedDocuments: async () => [], update: async () => {}
  };
  const res = await P.applyPatch(actor, { recharge: { Breath: n } });
  assert.deepEqual(res.changed, [`Breath recharge ${n}-6`]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "Item");
  return writes[0][1][0];
}

test("mcp-fork-10: the patch's recharge row equals the fork's rechargeUpdate row", async t => {
  const src = forkSource(RECHARGE);
  if (src.skip) return t.skip(src.skip);
  const { rechargeUpdate } = await import(pathToFileURL(join(process.env.FOUNDRY_MCP_FORK, RECHARGE)).href);
  for (const n of [5, 6, 2]) assert.deepEqual(await moduleRow(n), rechargeUpdate(breath(), n), `Recharge ${n}`);
});

test("mcp-fork-10: the module side of the parity, pinned without the fork", async () => {
  assert.deepEqual(await moduleRow(5), {
    _id: "itBreath00000001",
    "system.uses": { max: "1", spent: 0, recovery: [{ period: "recharge", formula: "5", type: "recoverAll" }] },
    "system.activities.a1.consumption.targets": [{ type: "material", target: "x", value: "2" }, { type: "itemUses", target: "", value: "1" }],
    "system.activities.a2.consumption.targets": [{ type: "itemUses", target: "", value: "1" }],
    "system.activities.a3.consumption.targets": [{ type: "itemUses", target: "", value: "1" }]
  });
});
