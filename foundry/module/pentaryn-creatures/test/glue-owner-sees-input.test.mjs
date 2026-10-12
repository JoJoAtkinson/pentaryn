// transform-creatures-29 × -31 (review fix): api.ownerSees with no token (null / undefined, an
// LLM's bad ref) answers false quietly. It must not spend the once-per-session "owner override
// failed" warning, or a real core rename later in the session would be silent again. A player
// client (the override never runs on a GM client).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const W = await setupWorld({ player: true });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
const api = F.game.modules.get(MODULE).api;

test("ownerSees(null | undefined | no args) is false with no console line", () => {
  W.lines();
  assert.equal(api.ownerSees(null), false);
  assert.equal(api.ownerSees(undefined), false);
  assert.equal(api.ownerSees(), false);
  assert.deepEqual(W.lines(), []);
});

test("a real override failure after that still warns (the once-per-session slot was not spent)", () => {
  const p = W.placeable(W.tok("tImp"), { _testCulled: () => { throw new Error("private API moved"); } });
  assert.equal(p.isVisible, false);
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | owner override failed`, "Error: private API moved"]]);
});
