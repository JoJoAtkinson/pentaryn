import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installFoundry, makeScene, makeToken } from "../test-kit/foundry-stub.mjs";
import { characterise, checkJSON, importGraph, normaliseDescribe, pinJSON, reachable, sourceScan } from "../test-kit/harness.mjs";

const F = await installFoundry({
  actors: [{ id: "aaaaaaaaaaaaaaaa", name: "Aldric Vane" }],
  scenes: [{ id: "scene00000000001", name: "One", tokens: [{ id: "tttttttttttttttt", name: "Aldric", actorId: "aaaaaaaaaaaaaaaa" }] }],
  users: [{ id: "player0000000001", name: "P", isGM: false }],
  modules: [{ id: "pentaryn-x", version: "0.1.0" }],
  lang: { PENTARYN_X: { hello: "Hello {name}" } },
});

test("foundry.utils and CONST come from the installed app (or the run says shim)", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry", "Foundry app not found — set FOUNDRY_APP_ROOT or PENTARYN_TEST_SHIMS=1");
  console.log(`# foundry build ${F.foundryBuild} (${F.utilsSource})`);
  assert.equal(typeof foundry.utils.escapeHTML, "function");
  assert.equal(typeof foundry.utils.Semaphore, "function");
  assert.equal(typeof CONST.COMPATIBILITY_MODES, "object");
});

test("settings: unregistered get throws Foundry's message; set logs and fires onChange", async () => {
  assert.throws(() => game.settings.get("pentaryn-x", "nope"), { message: '"pentaryn-x.nope" is not a registered game setting' });
  const seen = [];
  game.settings.register("pentaryn-x", "on", { default: true, onChange: v => seen.push(v) });
  assert.equal(game.settings.get("pentaryn-x", "on"), true);
  await game.settings.set("pentaryn-x", "on", false);
  assert.deepEqual(seen, [false]);
  assert.deepEqual(F.calls.filter(c => c.op.startsWith("settings")), [
    { op: "settings.register", id: "pentaryn-x.on" }, { op: "settings.set", id: "pentaryn-x.on", value: false },
  ]);
});

test("flags: inactive scope throws Foundry's message; update applies paths and _del", async () => {
  const a = game.actors.get("aaaaaaaaaaaaaaaa");
  assert.throws(() => a.getFlag("pentaryn-off", "k"), { message: 'Flag scope "pentaryn-off" is not valid or not currently active' });
  await a.setFlag("pentaryn-x", "note", "hi");
  assert.equal(a.getFlag("pentaryn-x", "note"), "hi");
  await a.update({ "flags.pentaryn-x.note": _del });
  assert.equal(a.getFlag("pentaryn-x", "note"), undefined);
  assert.equal(F.calls.at(-2).op, "update");
  assert.equal(F.calls.at(-2).changes["flags.pentaryn-x.note"], "<_del>");
});

test("hooks: manifest, veto, once, off", () => {
  const before = F.hooks.length;
  const id = Hooks.on("preX", () => false);
  Hooks.once("y", () => 1);
  assert.equal(Hooks.call("preX"), false);
  F.fire("y");
  assert.equal(F.listeners("y"), 0);
  Hooks.off("preX", id);
  assert.equal(Hooks.call("preX"), true);
  assert.deepEqual(F.hooks.slice(before), [{ kind: "on", name: "preX" }, { kind: "once", name: "y" }]);
});

test("documents, users, uuids, i18n", () => {
  const tok = game.scenes.get("scene00000000001").tokens.get("tttttttttttttttt");
  assert.equal(tok.uuid, "Scene.scene00000000001.Token.tttttttttttttttt");
  assert.equal(tok.actor.name, "Aldric Vane");
  assert.equal(fromUuidSync(tok.uuid), tok);
  assert.equal(fromUuidSync("Actor.aaaaaaaaaaaaaaaa").name, "Aldric Vane");
  assert.equal(game.users.activeGM.isSelf, true);
  F.become({ userId: "player0000000001" });
  assert.equal(game.users.activeGM.isSelf, false);
  F.become({ userId: game.users.activeGM.id, socketId: "socket-gm-2" });
  assert.equal(game.socket.id, "socket-gm-2");
  assert.equal(_loc("PENTARYN_X.hello", { name: "Esren" }), "Hello Esren");
  assert.equal(game.i18n.has("PENTARYN_X.hello"), true);
  const s = makeScene({ name: "Two", tokens: [makeToken({ name: "Bare" })] });
  assert.equal(s.tokens.contents[0].parent, s);
});

test("harness: pinJSON fails on a missing golden, writes under GOLDEN_UPDATE, compares after", () => {
  const dir = mkdtempSync(join(tmpdir(), "pentaryn-harness-"));
  mkdirSync(join(dir, "test"));
  const fileURL = pathToFileURL(join(dir, "test", "x.test.mjs")).href;
  assert.throws(() => pinJSON("thing", { a: 1 }, fileURL), /golden .* is missing/);
  process.env.GOLDEN_UPDATE = "1";
  pinJSON("thing", { a: 1 }, fileURL);
  delete process.env.GOLDEN_UPDATE;
  assert.ok(existsSync(join(dir, "test", "golden", "thing.json")));
  pinJSON("thing", { a: 1 }, fileURL);
  assert.throws(() => pinJSON("thing", { a: 2 }, fileURL), /differs/);
});

test("harness: characterise pins throws too; normaliseDescribe drops volatile fields", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pentaryn-harness-"));
  const fileURL = pathToFileURL(join(dir, "c.test.mjs")).href;
  process.env.GOLDEN_UPDATE = "1";
  const rows = await characterise("half", x => { if (x < 0) throw new Error("neg"); return x / 2; }, [4, [-1]], { file: fileURL });
  delete process.env.GOLDEN_UPDATE;
  assert.deepEqual(rows, [{ input: [4], out: 2 }, { input: [-1], threw: "neg" }]);
  assert.deepEqual(normaliseDescribe({ module: "m", version: "1", kit: "1", published: {}, patches: [{ label: "l", via: "direct" }] }), { module: "m", patches: [{ label: "l" }] });
  const save = process.exitCode;
  assert.equal(checkJSON("same", [1], [1]), true);
  process.exitCode = save;
});

test("harness: importGraph, reachable, sourceScan ignore comments", () => {
  const dir = mkdtempSync(join(tmpdir(), "pentaryn-graph-"));
  mkdirSync(join(dir, "lib"));
  writeFileSync(join(dir, "entry.mjs"), 'import { a } from "./a.mjs";\nimport "./lib/log.mjs";\n// import "./ghost.mjs"\n');
  writeFileSync(join(dir, "a.mjs"), 'export const a = 1; // game.settings.get("x")\n');
  writeFileSync(join(dir, "orphan.mjs"), 'export const o = game.settings.get("m", "k");\n');
  writeFileSync(join(dir, "lib", "log.mjs"), "export const l = 1;\n");
  const graph = importGraph(dir);
  assert.deepEqual(graph["entry.mjs"], ["a.mjs", "lib/log.mjs"]);
  assert.deepEqual([...reachable(graph, ["entry.mjs"])].sort(), ["a.mjs", "entry.mjs", "lib/log.mjs"]);
  assert.deepEqual(sourceScan(dir, /game\.settings\.get/).map(h => h.file), ["orphan.mjs"]);
});

test("hooks: a throwing listener is caught like Foundry's Hooks.#call — warned, logged, the next listener still runs", () => {
  const warn = console.warn, error = console.error;
  const lines = [];
  console.warn = (...a) => lines.push(["warn", String(a[0])]);
  console.error = (...a) => lines.push(["error", a[0] instanceof Error ? a[0].message : String(a[0])]);
  const seen = [];
  const errorHook = [];
  const ids = [
    Hooks.on("stubBoom", function breaks() { throw new Error("boom"); }),
    Hooks.on("stubBoom", () => seen.push("after")),
    Hooks.on("error", (where, err) => errorHook.push([where, err.message])),
  ];
  try {
    const before = F.hookErrors.length;
    assert.equal(Hooks.callAll("stubBoom", 1), undefined);           // Foundry's callAll returns nothing
    assert.equal(Hooks.call("stubBoom", 1), true);                    // a throw is not a veto
    F.fire("stubBoom");
    assert.deepEqual(seen, ["after", "after", "after"]);
    assert.equal(F.hookErrors.length - before, 3);
    assert.deepEqual(lines.slice(0, 2), [
      ["warn", "Foundry VTT | Error thrown in hooked function 'breaks' for hook 'stubBoom'"],
      ["error", "Error thrown in hooked function 'breaks' for hook 'stubBoom'. boom"],
    ]);
    assert.deepEqual(errorHook[0], ["Hooks.#call", "Error thrown in hooked function 'breaks' for hook 'stubBoom'. boom"]);
  } finally {
    Hooks.off("stubBoom", ids[0]);
    Hooks.off("stubBoom", ids[1]);
    Hooks.off("error", ids[2]);
    console.warn = warn;
    console.error = error;
  }
});

test("keybindings: register works until setup has fired, then throws Foundry's message", () => {
  assert.equal(game.keybindings.bindings, undefined);
  game.keybindings.register("pentaryn-x", "early", { name: "PENTARYN_X.Keybind.early.Name", editable: [] });
  assert.ok(game.keybindings.actions.has("pentaryn-x.early"));
  F.fire("setup");
  assert.ok(game.keybindings.bindings instanceof Map);
  assert.throws(() => game.keybindings.register("pentaryn-x", "late", { editable: [] }),
    { message: "You cannot register a Keybinding after the init hook" });
  assert.equal(game.keybindings.actions.has("pentaryn-x.late"), false);
});

test("harness: forkQueries reads FOUNDRY_MCP_FORK, skips with a note when absent; contractDrift", async () => {
  const { contractDrift, forkQueries, forkSource } = await import("../test-kit/harness.mjs");
  assert.match(forkQueries("pentaryn-p", "x.ts", { env: {} }).skip, /FOUNDRY_MCP_FORK is not set/);
  const root = mkdtempSync(join(tmpdir(), "fork-"));
  assert.match(forkQueries("pentaryn-p", "tools/p.ts", { env: { FOUNDRY_MCP_FORK: root } }).skip, /tools\/p\.ts is not in FOUNDRY_MCP_FORK/);
  mkdirSync(join(root, "tools"));
  writeFileSync(join(root, "tools/p.ts"), "export const QUERIES = { list: 'pentaryn-p.list', replace: \"pentaryn-p.replace\", x: 'pentaryn-other.y' };\n// 'pentaryn-p.list'\n");
  const fork = forkQueries("pentaryn-p", "tools/p.ts", { env: { FOUNDRY_MCP_FORK: root } });
  assert.deepEqual(fork.names, ["pentaryn-p.list", "pentaryn-p.replace"]);
  assert.deepEqual(contractDrift({ queries: ["pentaryn-p.list", "pentaryn-p.show"] }, fork), { missing: ["pentaryn-p.replace"], unused: ["pentaryn-p.show"] });
  assert.match(forkSource("tools/p.ts", { env: { FOUNDRY_MCP_FORK: root } }).text, /QUERIES/);
  assert.ok(forkSource("tools/p.ts", { env: {} }).skip);
});

test("logger (J6): Foundry's console alias records on F.logged, so logCompatibilityWarning works", () => {
  const before = F.logged.length;
  assert.equal(F.logger, globalThis.logger);
  foundry.utils.logCompatibilityWarning("pentaryn-x | old name", { since: 1, until: 2, once: false });
  const added = F.logged.slice(before);
  assert.equal(added.length, 1);
  assert.equal(added[0].level, "warn");
  assert.match(String(added[0].args[0]?.message ?? added[0].args[0]), /^pentaryn-x \| old name/);
  globalThis.logger.info("plain", 1);
  assert.deepEqual(F.logged.at(-1), { level: "info", args: ["plain", 1] });
});
