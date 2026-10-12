// Step 8b (senses-walls-cursors-9): one run at a time for every caller, and chat cards awaited
// with their failures logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wasmReady } from "./fixtures/engine.mjs";
import { houseWalls, makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
F.fire("init");
F.fire("ready");
await wasmReady;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
await flush();
canvas.scene = makeScene(F, { id: "sceneBusy000001", name: "S", walls: houseWalls() });
const api = game.pentaryn.walls;
const since = (from, op) => F.calls.slice(from).filter(c => c.op === op);

test("an API run() while a keybinding run is pending returns null and warns; nothing else runs", async () => {
  let release;
  F.hold.updateEmbeddedDocuments = new Promise(r => { release = r; });
  const from = F.calls.length;
  await withConsole(F, async () => {
    game.keybindings.actions.get("pentaryn-walls.run").onDown();
    await flush();
    assert.equal(api.run(), null);
    assert.equal(api.preview(), null);
    assert.equal(api.undo(), null);
    delete F.hold.updateEmbeddedDocuments;
    release();
    await flush();
  });
  assert.deepEqual(since(from, "notify").map(c => [c.level, c.message]),
    Array(3).fill(["warn", "Wall autocomplete is already running."]));
  assert.equal(since(from, "updateEmbeddedDocuments").length, 1);
  assert.equal(since(from, "ChatMessage.create").length, 1);
});

test("two un-awaited API calls: the second is null, the first resolves to the engine result", async () => {
  const p1 = api.preview({ runId: "a" });
  const p2 = api.preview({ runId: "b" });
  assert.equal(p2, null);
  const r = await withConsole(F, () => p1);
  assert.ok(Array.isArray(r.creates));
  assert.notEqual(await withConsole(F, () => api.preview({ runId: "c" })), null, "released");
});

test("a throwing action releases the lock for the next caller", async () => {
  await assert.rejects(api.preview({ sceneId: "noSuchScene0000" }),
    { message: 'pentaryn-walls: no scene with id "noSuchScene0000".' });
  const next = api.preview();
  assert.notEqual(next, null);
  await withConsole(F, () => next);   // settle it here, so the lock is free for the next test
});

test("the chat card is awaited: preview resolves after ChatMessage.create settles", async () => {
  let settle;
  const create = ChatMessage.create;
  ChatMessage.create = data => { F.calls.push({ op: "ChatMessage.create", data }); return new Promise(r => { settle = r; }); };
  try {
    let done = false;
    const p = withConsole(F, () => api.preview({ runId: "d" })).then(() => { done = true; });
    await flush();
    assert.equal(done, false);
    settle({});
    await p;
    assert.equal(done, true);
  } finally {
    ChatMessage.create = create;
  }
});

// [declared] walls-rob-8 (2026-10-12), flipped from a raw console.error(`pentaryn-walls |`, err):
// the failure goes through the kit log as "chat card failed", and with debug on it lands in
// api.trace() too. The card stays non-fatal.
test("walls-rob-8: a failing chat card is logged through the kit log, traced, and never rejects the action", async () => {
  const create = ChatMessage.create;
  ChatMessage.create = async () => { throw new Error("chat down"); };
  const from = F.calls.length;
  CONFIG.debug ??= {};
  const debug = CONFIG.debug["pentaryn-walls"];
  CONFIG.debug["pentaryn-walls"] = true;
  try {
    const r = await withConsole(F, () => api.preview({ runId: "e" }));
    assert.ok(r.creates);
    ChatMessage.create = () => { throw new Error("sync chat down"); };
    await withConsole(F, () => api.preview({ runId: "f" }));
  } finally {
    ChatMessage.create = create;
    CONFIG.debug["pentaryn-walls"] = debug;
  }
  assert.deepEqual(since(from, "console.error").map(c => c.args),
    [["pentaryn-walls | chat card failed", "Error: chat down"],
     ["pentaryn-walls | chat card failed", "Error: sync chat down"]]);
  assert.deepEqual(api.trace().filter(t => t.op === "chat card failed").map(t => t.data),
    [{ error: "chat down" }, { error: "sync chat down" }]);
});
