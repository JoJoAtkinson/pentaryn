// Step 6 (C24): a failing refusal ping is logged at debug, never swallowed silently, and never
// stops the report: preview still posts exactly one chat card and returns the result. Since
// walls-edge-1 the ping is drawn locally with canvas.controls.drawPing (canvas.ping broadcast).
// walls-rob-3: pings are drawn only when the reported scene is the one this client is viewing.
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
canvas.scene = scene;
canvas.controls.drawPing = () => { throw new Error("no canvas"); };

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

// drawPing is async in Foundry 14 (ControlsLayer `async drawPing(position, options)`): a failure arrives
// as a rejected promise, not a throw. It must reach the same debug line, never an unhandled rejection.
const asyncPing = async fn => {
  const unhandled = [];
  const spy = err => unhandled.push(err);
  process.on("unhandledRejection", spy);
  canvas.controls.drawPing = async () => { throw new Error("no canvas"); };
  try {
    const got = await debugLines(fn);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise(r => setImmediate(r));
    return { ...got, unhandled };
  } finally {
    canvas.controls.drawPing = () => { throw new Error("no canvas"); };
    process.off("unhandledRejection", spy);
  }
};

test("ping rejects (async, as Foundry 14), debug on: one debug line per refusal, no unhandled rejection", async () => {
  CONFIG.debug ??= {};
  CONFIG.debug["pentaryn-walls"] = true;
  try {
    const { out, lines, unhandled } = await asyncPing(() => game.pentaryn.walls.preview({ sceneId: scene.id, runId: "p" }));
    assert.ok(out.refusals.length > 0);
    assert.equal(lines.length, out.refusals.length);
    assert.deepEqual(lines[0], ["pentaryn-walls | ping", "no canvas"]);
    assert.equal(unhandled.length, 0);
  } finally {
    CONFIG.debug["pentaryn-walls"] = false;
  }
});

test("ping rejects (async, as Foundry 14), debug off: one chat card, no debug line, no unhandled rejection", async () => {
  const from = F.calls.length;
  const { out, lines, unhandled } = await asyncPing(() => game.pentaryn.walls.preview({ sceneId: scene.id, runId: "p" }));
  assert.ok(out.refusals.length > 0);
  assert.equal(F.calls.slice(from).filter(c => c.op === "ChatMessage.create").length, 1);
  assert.deepEqual(lines, []);
  assert.equal(unhandled.length, 0);
});

// walls-rob-3: a sceneId that is not the viewed scene has coordinates that mean nothing on this
// canvas. Its refusals stay on the chat card and in the console table; no marker is drawn.
test("walls-rob-3: preview/run of a scene that is not the viewed one draws no ping, the card still lists every refusal", async () => {
  const other = makeScene(F, { id: "scenePingOther1", name: "Elsewhere", walls: houseWalls() });
  const drawn = [];
  const keep = canvas.controls.drawPing;
  canvas.controls.drawPing = at => { drawn.push(at); };
  try {
    for (const action of ["preview", "run"]) {
      const from = F.calls.length;
      const out = await withConsole(F, () => game.pentaryn.walls[action]({ sceneId: other.id, runId: `o-${action}` }));
      assert.ok(out.refusals.length > 0, "the fixture scene has refusals");
      assert.deepEqual(drawn, [], `${action}: no marker on the viewed canvas`);
      const chats = F.calls.slice(from).filter(c => c.op === "ChatMessage.create");
      assert.equal(chats.length, 1);
      assert.match(chats[0].data.content, /Elsewhere/);
      const tables = F.calls.slice(from).filter(c => c.op === "console.table");
      assert.equal(tables.at(-1).args[0].length, out.refusals.length, "the console table lists every refusal");
    }
    // The viewed scene still pings, one per refusal.
    const out = await withConsole(F, () => game.pentaryn.walls.preview({ sceneId: scene.id, runId: "v" }));
    assert.equal(drawn.length, out.refusals.length);
  } finally {
    canvas.controls.drawPing = keep;
  }
});
