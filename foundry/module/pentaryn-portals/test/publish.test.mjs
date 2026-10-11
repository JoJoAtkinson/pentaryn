// Publish under the other load orders (glue.test.mjs covers the frozen importer root):
// no game.pentaryn yet → created; an extensible one (another module first) → portals added in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./fixtures/world.mjs";

const { W } = await boot();

test("an extensible game.pentaryn is kept and gains portals one tick after ready", async () => {
  const root = { dropbin: { ok: true } };
  game.pentaryn = root;
  assert.equal(root.portals, undefined);
  await W.tick();
  assert.equal(game.pentaryn, root);
  assert.deepEqual(Object.keys(root), ["dropbin", "portals"]);
  assert.deepEqual(Object.keys(root.portals), ["snapshot", "cardFor", "teleportParty", "lookAt", "open", "redraw", "spreadArrival"]);
});
