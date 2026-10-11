import { test } from "node:test";
import assert from "node:assert/strict";
import { apiOf, installRoot, publishNamespace, publishedOf } from "../publish.mjs";

function env() {
  const calls = [];
  const timers = [];
  const mods = new Map([["pentaryn-x", { id: "pentaryn-x" }], ["pentaryn-y", { id: "pentaryn-y" }]]);
  const actor = { documentName: "Actor", id: "aaaaaaaaaaaaaaaa", name: "Aldric" };
  return {
    calls, timers,
    game: { modules: mods, actors: new Map([[actor.id, actor]]) },
    Hooks: { callAll: (...a) => calls.push(a.slice(0, 2)) },
    setTimeout: fn => timers.push(fn),
  };
}
const api = (ns, extra = {}) => Object.freeze({ contract: `pentaryn-${ns}/api@1`, describe: () => ({ module: `pentaryn-${ns}` }), ...extra });

test("module.api is canonical, game.pentaryn.<ns> the alias, both ready hooks fire", () => {
  const g = env();
  const x = api("x");
  publishNamespace("x", x, { moduleId: "pentaryn-x", g });
  assert.equal(g.game.modules.get("pentaryn-x").api, x);
  assert.equal(g.game.pentaryn.x, x);
  assert.equal(apiOf("pentaryn-x", { g }), x);
  assert.equal(apiOf("pentaryn-z", { g }), null);
  assert.deepEqual(g.calls, [["pentaryn-x.ready", x], ["pentaryn.ready", "x"]]);
  assert.equal(publishedOf("x", { g }).when, "ready");
});

test("a frozen root (pentaryn-importer) is rebuilt, and a displaced alias is restored one tick later", () => {
  const g = env();
  g.game.pentaryn = Object.freeze({ importer: { run() {} } });
  const x = api("x");
  publishNamespace("x", x, { moduleId: "pentaryn-x", g, when: "ready:gm:wasm" });
  assert.ok(Object.isExtensible(g.game.pentaryn));
  assert.equal(typeof g.game.pentaryn.importer.run, "function");
  assert.equal(g.game.pentaryn.x, x);
  // the importer loads later and freezes a root without us
  g.game.pentaryn = Object.freeze({ importer: {} });
  for (const t of g.timers.splice(0)) t();
  assert.equal(g.game.pentaryn.x, x);
  assert.equal(g.game.pentaryn.published().x.when, "ready:gm:wasm");
});

test("alias publishes a second name only: no module.api, no hooks", () => {
  const g = env();
  const chain = api("chain");
  publishNamespace("chain", chain, { moduleId: "pentaryn-y", g, alias: true, realiasTick: false });
  assert.equal(g.game.modules.get("pentaryn-y").api, undefined);
  assert.equal(g.game.pentaryn.chain, chain);
  assert.deepEqual(g.calls, []);
});

test("root helpers count only kit-built namespaces and never sink on one failure", async () => {
  const g = env();
  publishNamespace("x", api("x", { inspect: actor => ({ name: actor.name }) }), { moduleId: "pentaryn-x", g, realiasTick: false });
  publishNamespace("y", api("y", { inspect: () => { throw Object.assign(new Error("NOT_FOUND: nope"), { code: "NOT_FOUND" }); } }), { moduleId: "pentaryn-y", g, realiasTick: false });
  g.game.pentaryn.legacy = { describe: () => ({}) };            // has describe, no contract → not counted
  const root = g.game.pentaryn;
  assert.deepEqual(root.namespaces(), ["x", "y"]);
  assert.deepEqual(Object.keys(root), ["x", "y", "legacy"]);   // helpers are non-enumerable
  assert.deepEqual(root.describe(), { modules: ["pentaryn-x", "pentaryn-y"], namespaces: { x: { module: "pentaryn-x" }, y: { module: "pentaryn-y" } } });
  assert.deepEqual(await root.inspect("Aldric"), { x: { name: "Aldric" }, y: { error: "NOT_FOUND: nope", code: "NOT_FOUND" } });
  await assert.rejects(root.inspect("Ald"), { code: "NOT_FOUND" });
  assert.equal(installRoot(Object.freeze({}), { g }).describe, undefined);
});
