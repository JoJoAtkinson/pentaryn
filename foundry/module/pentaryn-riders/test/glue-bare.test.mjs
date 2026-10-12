// A world without Argon, without dnd5e's SummonActivity and without a TextEditor class: ready
// installs nothing, says nothing, and still publishes the API.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld({ argon: false, summon: false, textEditor: false });
const { F } = W;
await import("../riders.mjs");

test("no patch targets: ready is silent and the API is still published", () => {
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  assert.deepEqual(W.lines, []);
  assert.deepEqual(F.hookErrors, []);
  assert.equal(F.CONFIG.ARGON, undefined);
  assert.equal(typeof F.game.pentaryn.riders.report, "function");
});

test("with no Argon HUD the argon hooks do nothing", () => {
  F.fire("updateItem", { parent: {} }, { system: { uses: {} } });
  F.fire("dnd5e.preCreateMeasuredTemplate", {}, {});
  F.fire("renderItemButtonArgonComponent", { item: { documentName: "Item" } });
  assert.deepEqual(W.lines, []);
});
