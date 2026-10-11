// Step 6 (C24): a failing canvas.ping is logged at debug, never swallowed silently, and never
// stops the report: preview still posts exactly one chat card and returns the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wasmReady } from "./fixtures/engine.mjs";
import { houseWalls, makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const scene = makeScene(F, { id: "scenePing000001", name: "S", walls: houseWalls() });
canvas.ping = () => { throw new Error("no canvas"); };

const debugLines = async fn => {
  const lines = [];
  const keep = console.debug;
  console.debug = (...args) => lines.push(args.map(a => (a instanceof Error ? a.message : a)));
  try {
    const out = await withConsole(F, fn);
    return { out, lines };
  } finally {
    console.debug = keep;
  }
};

test("ping throws, debug off: one chat card, the result returned, no debug line", async () => {
  const from = F.calls.length;
  const { out, lines } = await debugLines(() => game.pentaryn.walls.preview({ sceneId: scene.id, runId: "p" }));
  assert.ok(out.refusals.length > 0);
  assert.equal(F.calls.slice(from).filter(c => c.op === "ChatMessage.create").length, 1);
  assert.deepEqual(lines, []);
});

test("ping throws, debug on: one debug line per refusal, labelled with the module", async () => {
  CONFIG.debug ??= {};
  CONFIG.debug["pentaryn-walls"] = true;
  try {
    const { out, lines } = await debugLines(() => game.pentaryn.walls.preview({ sceneId: scene.id, runId: "p" }));
    assert.equal(lines.length, out.refusals.length);
    assert.deepEqual(lines[0], ["pentaryn-walls | ping", "no canvas"]);
  } finally {
    CONFIG.debug["pentaryn-walls"] = false;
  }
});
