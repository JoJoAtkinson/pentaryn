// Patch path (d), guide step 1: Token#isVisible is not an own getter on the placeable prototype →
// a console warning, nothing patched, patchedWith() null. The strip and the API still work.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld({ player: true, getter: false });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("no getter: warns, defines nothing, patchedWith() null", async () => {
  F.fire("init");
  F.fire("setup");
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | Token#isVisible not found; owners-see-their-own is off`]]);
  assert.equal(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible"), undefined);
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  assert.equal(F.game.pentaryn.creatures.patchedWith(), null);
  mock.timers.tick(60);
  assert.ok(W.strip(), "the strip does not depend on the patch");
});

test("unpatched, api.ownerSees still answers from the override", () => {
  assert.equal(W.p("tImp").isVisible, undefined, "no getter anywhere");
  assert.equal(F.game.pentaryn.creatures.ownerSees(W.p("tImp")), true);
  assert.equal(F.game.pentaryn.creatures.ownerSees(W.p("tGob")), false);
});
