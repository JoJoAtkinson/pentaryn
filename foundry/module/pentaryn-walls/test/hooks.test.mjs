// Case (c) of guide step 1.8, in its own process: on a PLAYER client the ready hook returns early —
// no game.pentaryn.walls, no console line. Keybindings still register at init (restricted: true).
import { test } from "node:test";
import assert from "node:assert/strict";
import { wasmReady } from "./fixtures/engine.mjs";
import { wallsWorld, withConsole } from "./fixtures/world.mjs";

const F = await wallsWorld({ isGM: false });
await import("../pentaryn-walls.mjs");

test("(c) a player: no API, no log line", async () => {
  F.fire("init");
  const from = F.calls.length;
  await withConsole(F, async () => {
    F.fire("ready");
    await wasmReady;
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  assert.equal(game.pentaryn?.walls, undefined);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "console.log"), []);
  assert.equal(game.keybindings.actions.size, 3);
});
