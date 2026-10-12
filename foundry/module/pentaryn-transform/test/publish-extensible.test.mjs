// An extensible game.pentaryn gains `transform` in place (same object); no root at all → created.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const root = { other: 1 };
game.pentaryn = root;
await import("../transform.mjs");
await import("../hud.mjs");
F.fire("ready");

test("an extensible root gains transform in place", () => {
  assert.equal(game.pentaryn, root);
  assert.deepEqual(Object.keys(root), ["other", "transform"]);
  assert.ok(root.transform.starry);
});

test("starry does not extend a frozen transform namespace (Object.isExtensible guard)", async () => {
  const frozen = Object.freeze({ shift() {} });
  game.pentaryn = { transform: frozen };
  await import("../starry.mjs?second");                  // registers another once('ready')
  F.fire("ready");
  assert.equal(game.pentaryn.transform, frozen);
  assert.equal("starry" in frozen, false);
});
