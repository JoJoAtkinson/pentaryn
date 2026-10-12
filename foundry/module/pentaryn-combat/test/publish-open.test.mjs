// Publishing into an extensible game.pentaryn another module made: combat is added in place.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { captureConsole, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const { F } = await setupWorld();
const lines = captureConsole();
await import("../combat.mjs");

test("an open root gains combat in place", async () => {
  const root = { lookup: {} };
  F.game.pentaryn = root;
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  F.game.actors.filter = () => { throw new Error("actors not ready"); };   // the seed after publish fails
  mock.timers.tick(0);
  await drain();
  assert.deepEqual(lines.filter(l => l.text.includes("seed")), [{ level: "warn", text: "pentaryn-combat | weapon-set seed failed", err: "actors not ready" }]);
  assert.equal(F.game.pentaryn, root);
  assert.deepEqual(Object.keys(root), ["lookup", "combat"]);
  assert.equal(typeof root.combat.plan, "function");
});
