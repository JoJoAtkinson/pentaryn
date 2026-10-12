// Guide step 6: the hooks live in features (bodyswap, wildshape, sweep from transform.mjs; starry,
// hud-panels from hud.mjs), each with install(reg, ctx) / uninstall(), registered through the one
// shared registry (wiring.mjs) in golden/hooks.json's order; ctx.uninstall() leaves nothing behind.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const coreOp = F.TokenDocument._preUpdateOperation;
await import("../transform.mjs");
await import("../hud.mjs");
const W = await import("../wiring.mjs");
const golden = JSON.parse(readFileSync(new URL("./golden/hooks.json", import.meta.url), "utf8"));

test("every feature file exports install and uninstall", async () => {
  for (const f of ["bodyswap", "wildshape", "sweep", "starry", "hud-panels"]) {
    const m = await import(`../${f}.mjs`);
    assert.equal(typeof m.install, "function", f);
    assert.equal(typeof m.uninstall, "function", f);
  }
});

test("the registry recorded golden/hooks.json less the entry's own ready (row 18, a lifecycle Hooks.once), every row labelled", () => {
  const ids = W.reg.ids();
  assert.deepEqual(ids.map(r => ({ kind: r.kind, name: r.name })), golden.filter((_, i) => i !== 17));
  for (const r of ids) assert.ok(r.label && r.label !== r.name, `${r.name} has a label`);
  assert.equal(new Set(ids.map(r => r.label)).size, ids.length, "labels are unique");
});

test("ctx.uninstall(): no hook, no pointermove listener, the patch undone, the sweep timer dropped", () => {
  F.fire("ready");                                                // the lifecycle ready runs (and is gone)
  Hooks.callAll("updateToken", {}, {}, {}, "u");                 // a sweep timer is pending
  assert.ok(F.D.listeners.some(l => l.type === "pointermove"));
  W.ctx.uninstall();
  assert.deepEqual(F.listeners(), {}, JSON.stringify(F.listeners()));
  assert.equal(W.reg.ids().length, 0);
  assert.equal(F.D.listeners.filter(l => l.type === "pointermove").length, 0);
  assert.equal(F.TokenDocument._preUpdateOperation, coreOp);
  mock.timers.tick(10_000);                                       // nothing fires
});
