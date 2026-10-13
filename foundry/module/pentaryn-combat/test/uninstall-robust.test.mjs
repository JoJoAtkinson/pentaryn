// combat-core-ROB-4 [declared]: one feature whose uninstall throws must not abort ctx.uninstall()
// partway. Every other feature still uninstalls, every recorded hook is removed and the
// contributions are cleared; the throw is one prefixed warning naming the feature.
// Its own process: wiring.test.mjs keeps its single load.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const { ctx, reg, installFeature } = await import("../context.mjs");
const { MODULE } = await import("../combat-core.mjs");

test("combat-core-ROB-4: a throwing feature uninstall leaves no feature installed and no hook live", () => {
  const calls = [];
  installFeature({
    install(r) { r.on("zzEarlier", () => {}, { label: "zz earlier" }); },
    uninstall() { calls.push("earlier"); },
  }, "zz-earlier");
  installFeature({
    install(r) { r.on("zzBad", () => {}, { label: "zz bad" }); },
    uninstall() { throw new Error("boom"); },
  }, "zz-bad");
  assert.ok(ctx.contributions.length > 0);

  const warns = [];
  const w = mock.method(console, "warn", (...args) => { warns.push(args.map(String).join(" ")); });
  try {
    assert.doesNotThrow(() => ctx.uninstall());
  } finally {
    w.mock.restore();
  }

  assert.deepEqual(calls, ["earlier"], "the features installed before the bad one still uninstall");
  assert.deepEqual(reg.ids(), [], "every recorded hook removed");
  assert.equal(Object.values(F.listeners()).reduce((a, b) => a + b, 0), 0, "no live listener");
  assert.equal(ctx.contributions.length, 0, "contributions cleared");
  const named = warns.filter(l => l.startsWith(`${MODULE} | `) && l.includes("zz-bad") && l.includes("boom"));
  assert.equal(named.length, 1, warns.join("\n"));
});
