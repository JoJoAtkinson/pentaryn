// Glue characterisation (guide step 1.8, cases a–j). The unchanged entry is loaded as Foundry would,
// as a GM, and driven through init/ready, the published API and the keybindings. Its effects are
// pinned: settings and keybinding registrations, the console line, chat cards, pings, scene writes
// and their order, toasts. The player case (c) lives in hooks.test.mjs (its own process).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { canonical, runEngine, wasmReady } from "./fixtures/engine.mjs";
import { GM, houseWalls, makeScene, wallsWorld, withConsole } from "./fixtures/world.mjs";

const MOD = "pentaryn-walls";
const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
const hooksAtLoad = F.hooks.slice();

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op || (op.endsWith("*") && c.op.startsWith(op.slice(0, -1))));
const scrubMs = s => String(s).replace(/\d+ ms/g, "<n> ms");

const house = makeScene(F, { id: "sceneHouse00001", name: "S", walls: houseWalls() });
const empty = makeScene(F, { id: "sceneEmpty00001", name: "Empty", walls: [] });
canvas.scene = house;

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("hook registration manifest (golden/hooks.json): once init, once ready", () => {
  pinJSON("hooks", hooksAtLoad, import.meta.url);
  assert.deepEqual(hooksAtLoad, [{ kind: "once", name: "init" }, { kind: "once", name: "ready" }]);
});

test("(a) init registers the backend setting and three keybindings, exactly as today", () => {
  F.fire("init");
  const s = game.settings.settings.get(`${MOD}.backend`);
  assert.deepEqual({ ...s, type: s.type.name }, {
    name: "Engine backend",
    hint: "Automatic uses the compiled (WASM) engine when it loads, falling back to JavaScript. " +
          "Both produce identical geometry — verified against the same 44 fixtures — so this " +
          "only affects speed. Compiled is ~12x faster on large scenes.",
    scope: "world", config: true, type: "String", default: "auto",
    choices: { auto: "Automatic (compiled when available)", wasm: "Compiled (WASM)", js: "JavaScript" },
    namespace: MOD, key: "backend",
  });
  const binds = [...game.keybindings.actions.entries()].filter(([id]) => id.startsWith(`${MOD}.`));
  assert.deepEqual(binds.map(([id, b]) => [id, b.name, b.hint, b.editable, b.restricted, typeof b.onDown]), [
    [`${MOD}.run`, "Wall autocomplete: run", "Complete the walls on the current scene. Reversible — undo removes exactly this run.",
      [{ key: "KeyW", modifiers: ["Alt"] }], true, "function"],
    [`${MOD}.undo`, "Wall autocomplete: undo last run",
      "Remove the walls the last run created and restore any it trimmed. Press again to peel back the run before it.",
      [{ key: "KeyZ", modifiers: ["Alt"] }], true, "function"],
    [`${MOD}.preview`, "Wall autocomplete: preview", "Report what would be built without writing anything.",
      [{ key: "KeyW", modifiers: ["Alt", "Shift"] }], true, "function"],
  ]);
});

test("(b)+(d) ready as GM on a frozen root: a new root with x and walls; one console line", async () => {
  game.pentaryn = Object.freeze({ x: 1 });
  const from = mark();
  await withConsole(F, async () => {
    F.fire("ready");
    await wasmReady;
    await flush();
  });
  assert.equal(game.pentaryn.x, 1);
  const api = game.pentaryn.walls;
  const legacy = ["preview", "run", "undo", "makeMacro", "runEngine", "backends"];
  assert.deepEqual(Object.keys(api).filter(k => legacy.includes(k)), legacy, "the legacy keys, in order (later steps may add)");
  for (const k of legacy) assert.equal(typeof api[k], "function", k);
  assert.deepEqual(api.backends().map(b => b.name), ["js", "wasm"]);
  assert.deepEqual(since(from, "console.log").map(c => c.args), [[
    "pentaryn-walls | ready — backends: js, wasm. Alt+W run, Alt+Z undo, Alt+Shift+W preview. " +
    "API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()",
  ]]);
});

test("(e) preview(): one whispered chat card (golden/glue.json), a ping per refusal, console tables, no writes", async () => {
  const from = mark();
  const result = await withConsole(F, () => game.pentaryn.walls.preview({ runId: "golden" }));
  const chats = since(from, "ChatMessage.create");
  assert.equal(chats.length, 1);
  assert.deepEqual(chats[0].data.whisper, [GM]);
  const pings = since(from, "canvas.ping");
  assert.equal(pings.length, result.refusals.length);
  assert.ok(result.refusals.length > 0, "the fixture scene has refusals");
  assert.deepEqual(pings.map(p => p.at), result.refusals.map(r => ({ x: r.at[0], y: r.at[1] })));
  assert.deepEqual(since(from, "console.*").map(c => c.op), ["console.group", "console.table", "console.table", "console.groupEnd"]);
  assert.deepEqual(since(from).filter(c => /EmbeddedDocuments$/.test(c.op)), []);
  const ref = runEngine(house.walls.map(w => {
    const o = w.toObject();
    return { _id: w.id, c: o.c, door: o.door, sight: o.sight, move: o.move, light: o.light, sound: o.sound, dir: o.dir, levels: o.levels ?? [], flags: o.flags ?? {} };
  }), { gridSize: 100, runId: "golden" });
  assert.deepEqual(canonical(result), canonical(ref), "returns the engine result ('auto' ran wasm; it agrees with js here)");
  assert.deepEqual(result.log, [], "the wasm backend ran (it keeps no log)");
  pinJSON("glue", {
    previewContent: scrubMs(chats[0].data.content),
    consoleGroup: since(from, "console.group")[0].args,
    counts: { creates: result.creates.length, updates: result.updates.length, refusals: result.refusals.length },
  }, import.meta.url);
});

test("(j) backends: 'js' setting labels the card (js); an unknown requested backend warns and uses JavaScript", async () => {
  await game.settings.set(MOD, "backend", "js");
  let from = mark();
  await withConsole(F, () => game.pentaryn.walls.preview({ runId: "golden" }));
  assert.match(since(from, "ChatMessage.create")[0].data.content, /\(js\)<\/span>/);
  await game.settings.set(MOD, "backend", "auto");
  from = mark();
  await withConsole(F, () => game.pentaryn.walls.preview({ runId: "golden" }));
  assert.match(since(from, "ChatMessage.create")[0].data.content, /\(wasm\)<\/span>/);
  from = mark();
  await withConsole(F, () => game.pentaryn.walls.preview({ runId: "golden", backend: "nosuch" }));
  assert.deepEqual(since(from, "notify").map(c => [c.level, c.message]), [
    ["warn", 'Wall autocomplete: backend "nosuch" unavailable, using JavaScript.'],
  ]);
  assert.match(since(from, "ChatMessage.create")[0].data.content, /\(js\)<\/span>/);
});

test("(f) run(): updates before creates, then the chat card", async () => {
  const from = mark();
  const result = await withConsole(F, () => game.pentaryn.walls.run({ runId: "golden" }));
  const ops = since(from).filter(c => /EmbeddedDocuments$|ChatMessage/.test(c.op)).map(c => c.op + (c.type ? `:${c.type}` : ""));
  assert.deepEqual(ops, ["updateEmbeddedDocuments:Wall", "createEmbeddedDocuments:Wall", "ChatMessage.create"]);
  assert.equal(since(from, "updateEmbeddedDocuments")[0].data.length, result.updates.length);
  assert.equal(since(from, "createEmbeddedDocuments")[0].data.length, result.creates.length);
  assert.match(since(from, "ChatMessage.create")[0].data.content, /^<p><strong>Wall autocomplete — S<\/strong><\/p><p>Committed /);
});

// KNOWN: senses-walls-cursors-1 — undo() reads run stamps with getFlag("wall-autocomplete", …), a scope
// that is no active package, so Foundry 14 throws. Flipped by guide step 8a [declared] (planUndo).
test("KNOWN senses-walls-cursors-1: (g) undo() on a scene with walls rejects with the inactive-scope error", async () => {
  const stamped = makeScene(F, { id: "sceneStamp00001", name: "Stamped", walls: [
    { _id: "a", c: [0, 0, 100, 0], flags: { "wall-autocomplete": { run: "2026-01-01T00:00:00Z", generated: true } } },
  ] });
  await assert.rejects(game.pentaryn.walls.undo({ sceneId: stamped.id }),
    { message: 'Flag scope "wall-autocomplete" is not valid or not currently active' });
});

test("(g) undo() on a scene with no walls: the empty answer and the info toast", async () => {
  const from = mark();
  assert.deepEqual(await game.pentaryn.walls.undo({ sceneId: empty.id }), { deleted: 0, restored: 0, run: null });
  assert.deepEqual(since(from, "notify").map(c => [c.level, c.message]), [
    ["info", "Wall autocomplete: nothing of mine on this scene to undo."],
  ]);
});

test("no scene: the API throws the documented message", async () => {
  canvas.scene = null;
  await assert.rejects(game.pentaryn.walls.preview(), { message: "pentaryn-walls: no scene — open one, or pass a sceneId." });
  canvas.scene = house;
});

test("(h) keybinding guard: a second press while running warns; a rejection logs and toasts; then a third press runs", async () => {
  const onDown = game.keybindings.actions.get(`${MOD}.run`).onDown;
  let release;
  F.hold.updateEmbeddedDocuments = new Promise(r => { release = r; });
  let from = mark();
  await withConsole(F, async () => {
    assert.equal(onDown(), true);
    await flush();
    assert.equal(onDown(), true);
    assert.deepEqual(since(from, "notify").map(c => [c.level, c.message]), [["warn", "Wall autocomplete is already running."]]);
    delete F.hold.updateEmbeddedDocuments;
    release();
    await flush();
  });
  // a rejecting action
  F.hold.createEmbeddedDocuments = Promise.reject(new Error("db locked"));
  F.hold.createEmbeddedDocuments.catch(() => {});
  from = mark();
  await withConsole(F, async () => {
    assert.equal(onDown(), true);
    await flush();
  });
  delete F.hold.createEmbeddedDocuments;
  assert.deepEqual(since(from, "console.error").map(c => c.args), [["pentaryn-walls |", "Error: db locked"]]);
  assert.deepEqual(since(from, "notify").map(c => [c.level, c.message, c.opts]), [
    ["error", "Wall autocomplete: db locked", { permanent: true }],
  ]);
  from = mark();
  await withConsole(F, async () => {
    assert.equal(onDown(), true);
    await flush();
  });
  assert.equal(since(from, "ChatMessage.create").length, 1, "released: the third press ran");
});

test("(i) makeMacro: unknown action throws; 'run' creates once, reuses, assigns the hotbar, toasts", async () => {
  await assert.rejects(game.pentaryn.walls.makeMacro("bogus"), { message: 'unknown action "bogus"' });
  const from = mark();
  const m1 = await game.pentaryn.walls.makeMacro("run");
  const m2 = await game.pentaryn.walls.makeMacro("run", 7);
  assert.equal(m1, m2);
  assert.deepEqual(since(from, "Macro.create").map(c => c.data), [{
    name: "Walls: run", type: "script", scope: "global", command: "await game.pentaryn.walls.run();",
    img: "icons/environment/settlement/wall-tower.webp",
  }]);
  assert.deepEqual(since(from, "assignHotbarMacro").map(c => [c.name, c.slot]), [["Walls: run", null], ["Walls: run", 7]]);
  assert.deepEqual(since(from, "notify").map(c => c.message), ['Macro "Walls: run" ready on the hotbar.', 'Macro "Walls: run" ready on the hotbar.']);
  const pre = await game.pentaryn.walls.makeMacro();
  assert.equal(pre.name, "Walls: preview");
});
