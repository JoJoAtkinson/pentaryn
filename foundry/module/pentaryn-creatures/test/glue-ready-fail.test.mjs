// The active GM's ready-time syncAll failing (guide step 1). creatures-rob-3 [declared]: syncAll
// isolates each scene like the queued flush — the warn names the scene and later scenes still sync.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld();
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("creatures-rob-3: ready syncAll's first write rejects → one warn naming the scene, later scenes still sync; publish still happens", async () => {
  F.fire("init");
  F.fire("setup");
  W.failWrite.push(new Error("db down"));
  F.fire("ready");
  await drain();
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed on Alpha`, "Error: db down"]]);
  assert.equal(W.writes.length, 2, "the first scene's write failed; syncAll carried on to the next");
  mock.timers.tick(0);
  await drain();
  assert.equal(typeof F.game.pentaryn.creatures, "object");
});
