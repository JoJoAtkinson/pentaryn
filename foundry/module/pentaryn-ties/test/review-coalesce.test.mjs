/**
 * ties-ui-perf-5 (+ ACC-5): the Attribute Review panel watches the registry through LiveHooks. A
 * burst of registry writes (a Claude batch, a cascade) repaints the panel once, 150 ms after the
 * last write — not once per write — and every hook it registered is removed on close.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": [{ id: "city", title: "Vel", category: "City" }] },
});
const { AttributeReview } = await import("../review-ui.mjs");
const { LIVE_MS } = await import("../ties-adapter.mjs");

test("ties-ui-perf-5: a burst of registry writes repaints the Attribute Review once, after 150 ms", () => {
  const before = F.listeners();
  const rv = new AttributeReview();
  let renders = 0;
  Object.defineProperty(rv, "rendered", { get: () => true, configurable: true });
  rv.render = () => renders++;
  rv.attachHooks();
  const key = { key: "pentaryn-ties.attributes" };
  for (let i = 0; i < 4; i++) F.fire("updateSetting", key, {});
  F.fire("createSetting", key, {});
  F.fire("updateSetting", { key: "core.other" }, {});
  assert.equal(renders, 0, "no repaint while the burst is still landing");
  mock.timers.tick(LIVE_MS - 1);
  assert.equal(renders, 0);
  mock.timers.tick(1);
  assert.equal(renders, 1, "one repaint for the whole burst");
  F.fire("updateSetting", { key: "core.other" }, {});
  mock.timers.tick(LIVE_MS);
  assert.equal(renders, 1, "another setting does nothing");
  // a write just before close never repaints a closed window
  F.fire("updateSetting", key, {});
  rv._onClose({});
  mock.timers.tick(LIVE_MS);
  assert.equal(renders, 1, "close drops the pending repaint");
  assert.deepEqual(F.listeners(), before, "every hook removed on close");
});
