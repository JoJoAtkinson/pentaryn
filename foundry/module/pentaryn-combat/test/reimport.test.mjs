// combat.mjs promises a hot re-import after the world is ready (after api.uninstall()) runs the
// phases again and republishes the API. Its own process: wiring.test.mjs keeps its single load.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../combat.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const { ctx } = await import("../context.mjs");
const { MODULE } = await import("../combat-core.mjs");

test("uninstall then a hot re-import republishes the API", async () => {
  const old = F.game.modules.get(MODULE).api;
  assert.ok(old, "published at ready");
  assert.equal(ctx.contributions.length, 3);

  const errors = [];
  const orig = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(" ")); };
  try {
    ctx.uninstall();
    await import("../combat.mjs?reimport");
  } finally {
    console.error = orig;
  }

  assert.deepEqual(errors.filter(e => /manifest drift/.test(e)), [], "no manifest drift");
  assert.equal(ctx.contributions.length, 3, "the re-import's contributions only");
  const api = F.game.modules.get(MODULE).api;
  assert.notEqual(api, old, "a new API is published");
  assert.equal(F.game.pentaryn.combat, api);
});
