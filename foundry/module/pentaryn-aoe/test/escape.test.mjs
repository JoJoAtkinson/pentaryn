// Part E (-40): Escape cancels a region placement on the first press. The registered binding is a
// trampoline into a global slot so a hot-patched copy can take it over; the slot owner decides.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, out, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F } = await boot();
const { escape: E } = await seams();
const SLOT = Symbol.for(`${MODULE}.cancelTemplate`);
let cancels = 0;
F.canvas.regions = { _placementContext: {}, _cancelPlacement() { cancels++; } };

test("SLOT is the global Symbol.for('pentaryn-aoe.cancelTemplate')", () => {
  assert.equal(E.SLOT, SLOT);
});

test("registerEscape() twice registers once; the slot holds onEscape", () => {
  E.registerEscape();
  E.registerEscape();
  const regs = F.calls.filter(c => c.op === "keybindings.register");
  assert.deepEqual(regs.map(c => c.id), [`${MODULE}.cancelTemplate`]);
  const kb = game.keybindings.actions.get(`${MODULE}.cancelTemplate`);
  assert.deepEqual(kb.editable, [{ key: "Escape" }]);
  assert.equal(kb.precedence, CONST.KEYBINDING_PRECEDENCE.PRIORITY);
  assert.equal(kb.onDown, E.trampoline);
  assert.equal(globalThis[SLOT], E.onEscape);
});

test("trampoline during a placement: consumed (true) and core's _cancelPlacement ran once", () => {
  cancels = 0;
  assert.equal(E.trampoline({}), true);
  assert.equal(cancels, 1);
});

test("activePlacement() is the layer's placement context, else null", () => {
  assert.equal(E.activePlacement(), F.canvas.regions._placementContext);
  const ctx = F.canvas.regions._placementContext;
  F.canvas.regions._placementContext = null;
  assert.equal(E.activePlacement(), null);
  F.canvas.regions._placementContext = ctx;
});

test("no placement → not consumed, nothing cancelled", () => {
  cancels = 0;
  const ctx = F.canvas.regions._placementContext;
  F.canvas.regions._placementContext = null;
  assert.equal(E.trampoline({}), false);
  assert.equal(cancels, 0);
  F.canvas.regions._placementContext = ctx;
});

test("_cancelPlacement throws → still consumed, logged as 'pentaryn-aoe | cancel placement'", () => {
  out.length = 0;
  const cancel = F.canvas.regions._cancelPlacement;
  F.canvas.regions._cancelPlacement = () => { throw new Error("core broke"); };
  assert.equal(E.trampoline({}), true);
  assert.deepEqual(out.map(o => [o.level, o.text]), [["error", `${MODULE} | cancel placement`]]);
  F.canvas.regions._cancelPlacement = cancel;
});

test("only a handler returning exactly true consumes", () => {
  const own = globalThis[SLOT];
  globalThis[SLOT] = () => "yes";
  assert.equal(E.trampoline({}), false);
  globalThis[SLOT] = "not a function";
  assert.equal(E.trampoline({}), false);
  globalThis[SLOT] = own;
});

test("disableEscape keeps a foreign slot and deletes its own", () => {
  const foreign = () => true;
  globalThis[SLOT] = foreign;
  E.disableEscape();
  assert.equal(globalThis[SLOT], foreign);
  globalThis[SLOT] = E.onEscape;
  E.disableEscape();
  assert.equal(SLOT in globalThis, false);
  assert.equal(E.trampoline({}), false);
});

test("registering after init (keybindings built) warns and still claims the slot", () => {
  game.keybindings.actions.clear();
  game.keybindings.bindings = new Map();
  out.length = 0;
  E.registerEscape();
  assert.equal(globalThis[SLOT], E.onEscape);
  assert.deepEqual(out.map(o => [o.level, o.text]), [["warn", `${MODULE} | Escape-cancels-placement keybinding not registered (registered after init?)`]]);
});
