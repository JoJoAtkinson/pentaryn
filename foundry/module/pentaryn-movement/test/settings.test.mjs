// Settings wiring: ctx.onSettingChange(key, fn) only fires when the key's SETTINGS row carries a
// forwarding onChange (`onChange: forward(key)`). This guard turns a missing row into a failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld } from "./fixtures/world.mjs";
import { MODULE } from "../movement-core.mjs";
import { SETTINGS, onSettingChange } from "../settings.mjs";

const F = await movementWorld();
await import("../movement.mjs");
const ghost = await import("../ghost.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

test("every key the feature reacts to has a forwarding onChange row", () => {
  game.modules.get(MODULE).api.uninstall();

  const keys = new Set();
  const fakeReg = { on() {}, once() {}, ids: () => [] };
  const noop = () => {};
  const fakeCtx = {
    late: false,
    log: { debug: noop, info: noop, warn: noop, warnOnce: noop, error: noop },
    expose() {},
    onSettingChange(key, fn) { if (fn) keys.add(key); },
  };
  ghost.install(fakeReg, fakeCtx);
  ghost.uninstall();

  assert.ok(keys.size > 0, "the feature reacts to at least one setting");
  for (const key of keys) {
    const row = SETTINGS.find(r => r.key === key);
    assert.ok(row, `${key}: no SETTINGS row`);
    assert.equal(typeof row.onChange, "function", `${key}: row has no onChange`);
    const calls = [];
    onSettingChange(key, value => calls.push(value));
    row.onChange(42);
    assert.deepEqual(calls, [42], `${key}: onChange does not forward to the registered handler`);
    onSettingChange(key, null);
  }
});
