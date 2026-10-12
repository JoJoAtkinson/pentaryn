// Patch path (b), guide step 1: lib-wrapper active with its global — Token#isVisible is registered
// as a WRAPPER by dotted path and the prototype is left alone. A player client, so the override answers.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld({ player: true, libWrapper: "ok" });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("setup registers one WRAPPER on the dotted path; the getter stays core's; patchedWith is libWrapper", async () => {
  F.fire("init");
  F.fire("setup");
  assert.equal(W.wrapped.length, 1);
  const [moduleId, path, fn, type, ...rest] = W.wrapped[0];
  assert.deepEqual([moduleId, path, typeof fn, type, rest], [MODULE, "foundry.canvas.placeables.Token.prototype.isVisible", "function", "WRAPPER", []]);
  assert.equal(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  assert.equal(F.game.pentaryn.creatures.patchedWith(), "libWrapper");
  assert.deepEqual(W.lines(), []);
});

test("the wrapper: wrapped() first (args passed through), then the owner override with `this` = the placeable", () => {
  const fn = W.wrapped[0][2];
  const seen = [];
  assert.equal(fn.call(W.p("tImp"), (...a) => (seen.push(a), false), "x"), true, "owned summon");
  assert.deepEqual(seen, [["x"]]);
  assert.equal(fn.call(W.p("tGob"), () => false), false, "not owned");
  assert.equal(fn.call(W.p("tHid"), () => false), false, "GM-hidden");
  assert.equal(fn.call(W.p("tGob"), () => true), true, "core yes wins");
  assert.equal(fn.call(W.p("tGob"), () => "truthy"), "truthy", "the core value is returned as is");
});
