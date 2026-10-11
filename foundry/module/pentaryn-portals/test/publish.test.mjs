// Publish (D-P1): built and published at ready in one step — module.api is canonical,
// game.pentaryn.portals the alias, and pentaryn-portals.ready / pentaryn.ready fire once with it.
// A hot re-import (after uninstall) republishes into an existing, extensible game.pentaryn in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE } from "./fixtures/world.mjs";

const { F, W } = await boot();

test("published at ready; the ready events fired once with the API", () => {
  const api = game.modules.get(MODULE).api;
  assert.ok(api);
  assert.equal(game.pentaryn.portals, api);
  const fired = F.calls.filter(c => c.op === "Hooks.callAll" && /\.ready$/.test(c.name)).map(c => c.name);
  assert.deepEqual(fired, ["pentaryn-portals.ready", "pentaryn.ready"]);
  assert.equal(game.pentaryn.published().portals.when, "ready");
});

test("uninstall leaves no hook; a hot re-import re-wires and republishes into the existing root", async () => {
  const before = F.listeners();
  game.pentaryn.portals.uninstall();
  assert.deepEqual(F.listeners(), {});
  const root = { dropbin: { ok: true } };
  game.pentaryn = root;
  await import("../portals.mjs?v=2");
  await W.tick();
  assert.equal(game.pentaryn, root);
  assert.deepEqual(Object.keys(root), ["dropbin", "portals"]);
  assert.equal(game.modules.get(MODULE).api, root.portals);
  assert.deepEqual(F.listeners(), before);
});
