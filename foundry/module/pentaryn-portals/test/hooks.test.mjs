// The hook manifest: what portals registers, pinned against golden/hooks.json.
// Grouped by hook name (kinds in registration order within each name): S3 moves the
// registrations into features installed party → badges → cards, which reorders ACROSS names
// but must not change anything WITHIN one name. 14 at 0.4.4 (13 at the audit snapshot + once init).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot } from "./fixtures/world.mjs";

const { F, S, W } = await boot();
await W.tick();

const grouped = hooks => {
  const out = {};
  for (const { kind, name } of hooks) (out[name] ??= []).push(kind);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", grouped(F.hooks), import.meta.url);
});

test("14 registrations; after init and ready only the 12 `on` listeners stay", () => {
  assert.equal(F.hooks.length, 14);
  assert.deepEqual(F.listeners(), {
    deleteToken: 1, createRegion: 1, updateRegion: 1, deleteRegion: 1, createRegionBehavior: 1, updateRegionBehavior: 1,
    deleteRegionBehavior: 1, canvasReady: 1, sightRefresh: 1, canvasTearDown: 1, renderDialogV2: 1, renderRegionConfig: 1,
  });
});

test("the six region hooks redraw only while the canvas is ready", async () => {
  const names = ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"];
  const runs = () => S.state().drawRun;
  F.canvas.ready = false;
  const idle = runs();
  for (const n of names) F.fire(n);
  mock.timers.tick(50);
  assert.equal(runs(), idle, "no draw while the canvas is down");
  F.canvas.ready = true;
  F.canvas.scene = W.scene({ id: "HookScene000001", name: "Hooks" });
  for (const n of names) F.fire(n);
  assert.equal(runs(), idle, "[declared D-P3] queued, not drawn at once");
  mock.timers.tick(49);
  assert.equal(runs(), idle);
  mock.timers.tick(1);
  await W.flush();
  assert.equal(runs(), idle + 1, "[declared D-P3] a burst of six region hooks draws once, 50 ms after the last (-24)");
  assert.equal(F.canvas.interface.children.length, 1, "each draw replaces the layer");
  F.canvas.ready = false;
});

test("D-P3: a queued redraw is dropped by canvasTearDown; canvasReady and redraw() stay immediate", async () => {
  const runs = () => S.state().drawRun;
  F.canvas.ready = true;
  F.fire("updateRegion");
  F.fire("canvasTearDown");
  const after = runs();
  mock.timers.tick(50);
  assert.equal(runs(), after, "the teardown cancelled it");
  F.fire("canvasReady");
  assert.equal(runs(), after + 1, "canvasReady draws at once");
  await game.pentaryn.portals.redraw();
  assert.equal(runs(), after + 2, "redraw() draws at once");
  F.canvas.ready = false;
});
