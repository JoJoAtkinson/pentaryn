/**
 * Verifier repair (ties-ui-perf-10): after `game.pentaryn.ties.uninstall()` a hot re-import once the
 * world is ready runs worn.install with the canvas already up, and canvasReady never fires again. The
 * marked set must be refilled there, or the badges stay gone — even when the marked token steps —
 * until a scene change or reload. No canvasReady is fired after the re-import in this test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const MARKED = "zzTokWorn0000001";
const F = await bootWorld({
  actors: [{ id: "zzNpc00000000001", name: "ZZ Harl" }],
  tokens: [
    { id: MARKED, actorId: "zzNpc00000000001", x: 0, y: 0, flags: { "pentaryn-ties": { worn: { by: "Oz", note: "" } } } },
    { id: "zzTokPlain000001", actorId: "zzNpc00000000001", x: 200, y: 0 },
  ],
});
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const liveLayers = () => canvas.interface.children.filter(c => !c.destroyed);

test("ties-ui-perf-10: a hot re-import without canvasReady brings the worn badge back and keeps it riding its token", async () => {
  await flush();
  F.fire("canvasReady", canvas);
  F.flushFrames();
  const before = liveLayers().length;
  assert.ok(before >= 1, "the badge layer is painted");

  game.pentaryn.ties.uninstall();
  F.flushFrames();
  assert.deepEqual(liveLayers(), [], "uninstall drops the layers");

  await import("../pentaryn-ties.mjs?hot=worn-perf10");
  await flush();
  F.flushFrames();
  assert.equal(liveLayers().length, before, "the layers are back with no canvasReady");

  // the marked token's step still asks for a badge frame — the marked set was refilled
  F.frames.length = 0;
  F.fire("refreshToken", canvas.tokens.get(MARKED));
  assert.ok(F.frames.length >= 1, "a marked token's step schedules a badge frame after the re-import");
  F.flushFrames();
  assert.equal(liveLayers().length, before, "still one of each layer");
});
