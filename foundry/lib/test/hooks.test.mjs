import { test } from "node:test";
import assert from "node:assert/strict";
import { emitter, hookRegistry } from "../hooks.mjs";
import { moduleA, moduleB, stubHooks } from "./fixtures/hook-order.mjs";

function quiet() {
  const errors = [];
  return { errors, log: { error: (e, err) => errors.push([e, err?.message]), warnOnce: (k, m) => { if (!errors.some(e => e[2] === k)) errors.push(["warnOnce", m, k]); } } };
}

test("on/once record the manifest in order; offAll unwinds it", () => {
  const H = stubHooks();
  const reg = hookRegistry("m", null, { g: { Hooks: H } });
  reg.on("updateActor", () => 1, { label: "sync" });
  reg.once("ready", () => 2);
  assert.deepEqual(reg.ids().map(({ kind, name, label }) => ({ kind, name, label })), [
    { kind: "on", name: "updateActor", label: "sync" },
    { kind: "once", name: "ready", label: "ready" },
  ]);
  reg.offAll();
  assert.deepEqual(reg.ids(), []);
  assert.equal(H.count(), 0);
});

test("guard is pass-through: a veto still vetoes; a throw is logged and becomes undefined", async () => {
  const { errors, log } = quiet();
  const reg = hookRegistry("m", log, { g: {} });
  assert.equal(reg.guard("pre", () => false)(), false);
  assert.equal(reg.guard("boom", () => { throw new Error("x"); })(), undefined);
  const p = reg.guard("async", async () => { throw new Error("y"); })();
  assert.ok(p instanceof Promise);
  await p.catch(() => {});
  await new Promise(r => setImmediate(r));
  assert.deepEqual(errors, [["boom", "x"], ["async", "y"]]);
});

test("guardSwallowAsync keeps pentaryn-aoe's behaviour: a promise reads as undefined", async () => {
  const { errors, log } = quiet();
  const reg = hookRegistry("pentaryn-aoe", log, { g: {} });
  assert.equal(reg.guardSwallowAsync("a", async () => false)(), undefined);
  assert.equal(reg.guardSwallowAsync("b", () => false)(), false);
  reg.guardSwallowAsync("c", async () => { throw new Error("z"); })();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(errors, [["c", "z"]]);
});

test("guard without a log writes `<module> | <label>` to console.error", () => {
  const lines = [];
  const reg = hookRegistry("pentaryn-x", null, { g: { console: { error: (...a) => lines.push(a[0]) } } });
  reg.guard("render", () => { throw new Error("no"); })();
  assert.deepEqual(lines, ["pentaryn-x | render"]);
});

test("emit: plain rows callAll both names; pre rows are vetoable by either name", () => {
  const H = stubHooks();
  const HOOKS = {
    usage: { name: "pentaryn-x.usage", legacyName: "pentarynX.usage", until: "pentaryn-x 9.0", pre: false },
    preMove: { name: "pentaryn-x.preMove", legacyName: "pentarynX.preMove", until: "pentaryn-x 9.0", pre: true },
  };
  const emit = emitter("pentaryn-x", HOOKS, { g: { Hooks: H }, version: "0.1.0" });
  const seen = [];
  H.on("pentaryn-x.usage", a => seen.push(["new", a]));
  H.on("pentarynX.usage", a => seen.push(["old", a]));
  assert.equal(emit("usage", 1), true);
  assert.deepEqual(seen, [["new", 1], ["old", 1]]);
  assert.equal(emit("preMove"), true);
  H.on("pentarynX.preMove", () => false);
  assert.equal(emit("preMove"), false);
  assert.throws(() => emit("nope"), /^PentarynError: BAD_ARGS|BAD_ARGS/);
});

test("emit warns once when a legacy name is past its until", () => {
  const { errors, log } = quiet();
  const H = stubHooks();
  const emit = emitter("m", { x: { name: "m.x", legacyName: "old.x", until: "m 0.8" } }, { g: { Hooks: H }, log, version: "0.8.0" });
  emit("x");
  emit("x");
  assert.deepEqual(errors, [["warnOnce", "legacy hook old.x is past m 0.8; remove it", "legacy:old.x"]]);
});

// kit-ext-2 (defect wave 2, Joe 2026-10-12): the contract says "warns once"; without a log the
// overdue-legacy warning used to reach console.warn on every emit.
test("kit-ext-2: emit without a log warns once per legacy name on the console, per emitter", () => {
  const lines = [];
  const H = stubHooks();
  const g = { Hooks: H, console: { warn: (...a) => lines.push(a) } };
  const HOOKS = {
    x: { name: "m.x", legacyName: "old.x", until: "m 0.8" },
    y: { name: "m.y", legacyName: "old.y", until: "m 0.8", pre: true },
  };
  const emit = emitter("m", HOOKS, { g, version: "0.8.0" });
  emit("x");
  emit("x");
  emit("y");
  emit("y");
  emit("x");
  assert.deepEqual(lines, [
    ["m | legacy hook old.x is past m 0.8; remove it"],
    ["m | legacy hook old.y is past m 0.8; remove it"],
  ]);
  // the Set is closure-local: a second emitter (a hot-patched copy) warns again, once
  const again = emitter("m", HOOKS, { g, version: "0.8.0" });
  again("x");
  again("x");
  assert.equal(lines.length, 3);
});

test("hook-order fixture: moving registration from module scope to setup changes who vetoes first", () => {
  // Module A registers at module scope today; module B already at setup. A veto listener's
  // position decides whether the other ever runs — this is why migrating modules keep a
  // synchronous install() (use-doc §5.2) until the cross-module order is designed.
  const before = stubHooks();
  moduleA(before, "module-scope");
  moduleB(before, "setup");
  before.fire("setup");
  assert.equal(before.call("dnd5e.preUseActivity"), false);
  assert.deepEqual(before.ran, ["A"]);

  const after = stubHooks();
  moduleB(after, "setup");
  moduleA(after, "setup");
  after.fire("setup");
  assert.equal(after.call("dnd5e.preUseActivity"), false);
  assert.deepEqual(after.ran, ["B", "A"]);
});

test("K7 guard level: guard:'warn' logs at warn (log and console); the default stays error", async () => {
  const seen = [];
  const log = { warn: (l, e) => seen.push(["warn", l, e?.message]), error: (l, e) => seen.push(["error", l, e?.message]) };
  const hooks = new Map();
  const g = { Hooks: { on: (n, fn) => { hooks.set(n, fn); return hooks.size; }, once: (n, fn) => { hooks.set(n, fn); return hooks.size; } } };
  const reg = hookRegistry("pentaryn-x", log, { g });
  reg.on("a", () => { throw new Error("x"); }, { guard: "warn", label: "light a" });
  reg.on("b", () => { throw new Error("y"); }, { label: "b" });
  reg.once("c", async () => { throw new Error("z"); }, { guard: "warn", label: "c" });
  hooks.get("a")(); hooks.get("b")(); await hooks.get("c")().catch(() => {});
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(seen, [["warn", "light a", "x"], ["error", "b", "y"], ["warn", "c", "z"]]);
  const lines = [];
  hookRegistry("pentaryn-x", null, { g: { console: { warn: l => lines.push(l) } } }).guard("chain x", () => { throw new Error("no"); }, { level: "warn" })();
  assert.deepEqual(lines, ["pentaryn-x | chain x"]);
});
