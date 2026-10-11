// Finding -30, runtime half ([declared C-2], console only): after canvasReady, a missing core
// internal (renderer.events.setCursor, canvas.regions._placementContext) is warned ONCE per page
// under the module prefix; with every internal present nothing is logged. Its own process: the
// warning is once per log instance.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { cursorWorld, flush } from "./fixtures/board.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await cursorWorld();
const warns = [];
console.warn = (...args) => warns.push(args);
await import("../cursors.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
await flush();

test("every internal present: canvasReady logs nothing", () => {
  F.fire("canvasReady");
  mock.timers.tick(0);
  assert.deepEqual(warns, []);
});

test("setCursor and _placementContext gone: one warning naming both, never repeated", () => {
  const { setCursor } = F.events;
  delete F.events.setCursor;
  delete canvas.regions._placementContext;
  F.setTool("tokens", "target");
  F.fire("canvasReady");
  mock.timers.tick(0);
  assert.deepEqual(warns, [["pentaryn-cursors | core internals missing: setCursor, _placementContext — see adjustments row core-board-cursor-vars"]]);
  assert.equal(game.pentaryn.cursors.current(), "target", "the glyphs still apply");
  F.fire("canvasReady");
  mock.timers.tick(0);
  assert.equal(warns.length, 1, "once per page");
  F.events.setCursor = setCursor;
  canvas.regions._placementContext = null;
});
