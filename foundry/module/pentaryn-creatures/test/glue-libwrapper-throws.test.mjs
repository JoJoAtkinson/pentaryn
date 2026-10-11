// Patch path (c), guide step 1: libWrapper.register throws → a console warning, then the direct
// path. The text moves in guide step 5 ([declared], C-D1: "…, wrapping by hand").
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld({ player: true, libWrapper: "throws" });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("a failed registration warns with the error and falls back to the direct getter", async () => {
  F.fire("init");
  F.fire("setup");
  assert.equal(W.wrapped.length, 1, "tried once");
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | libWrapper registration failed, patching directly`, "Error: libWrapper says no"]]);
  assert.notEqual(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  assert.equal(W.p("tImp").isVisible, true);
  assert.equal(W.p("tGob").isVisible, false);
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  assert.equal(F.game.pentaryn.creatures.patchedWith(), "direct");
});
