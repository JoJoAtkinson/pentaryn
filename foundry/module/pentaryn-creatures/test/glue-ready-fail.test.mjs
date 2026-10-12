// The active GM's ready-time syncAll failing (guide step 1): the catch prints the scene-less text
// (the same text the lightRadius onChange uses; the queued flush names the scene instead).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld();
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("ready syncAll rejects → one warn line with the error; publish still happens", async () => {
  F.fire("init");
  F.fire("setup");
  W.failWrite.push(new Error("db down"));
  F.fire("ready");
  await drain();
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed`, "Error: db down"]]);
  assert.equal(W.writes.length, 1, "the first scene's write was tried; syncAll stopped there");
  mock.timers.tick(0);
  await drain();
  assert.equal(typeof F.game.pentaryn.creatures, "object");
});
