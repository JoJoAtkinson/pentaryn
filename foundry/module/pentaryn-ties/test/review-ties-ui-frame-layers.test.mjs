/**
 * Final code review (ties-ui-EXT-9): the wires (overlay.mjs) and the worn badges (worn.mjs) each
 * carried their own copy of the rAF coalescer (`let queued; requestAnimationFrame(...)`) and their own
 * make-a-layer-on-canvas.interface / destroy-it helpers.
 * Ruling [declared]: drawWires and drawBadges schedule through the vendored `perFrame` (lib/perf.mjs);
 * one `interfaceLayer(state, make)` / `dropLayer(state)` pair in ties-adapter.mjs serves both PIXI
 * layers. Uninstall still cancels a queued frame (ties-ui-M8). Painted output unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const src = f => readFileSync(new URL(f, ROOT), "utf8");

const F = await bootWorld({
  actors: [{ id: "zzNpc00000000001", name: "ZZ Brakka" }],
  tokens: [{ id: "zzTokNpc00000001", actorId: "zzNpc00000000001", x: 0, y: 0 }],
});

test("ties-ui-EXT-9: neither painter hand-rolls requestAnimationFrame or its own layer helpers", () => {
  // the one painter wrapper schedules through the kit's perFrame
  assert.match(src("ties-adapter.mjs"), /import \{[^}]*\bperFrame\b[^}]*\} from "\.\/lib\/perf\.mjs"/);
  assert.match(src("ties-adapter.mjs"), /export function framePainter\([^)]*\)[\s\S]*?perFrame\(/);
  for (const f of ["overlay.mjs", "worn.mjs"]) {
    const s = src(f);
    assert.match(s, /const frame = framePainter\(/, `${f} paints through framePainter (perFrame)`);
    assert.doesNotMatch(s, /requestAnimationFrame\(/, `${f} has no rAF of its own`);
    assert.doesNotMatch(s, /canvas\.interface\.addChild/, `${f} adds no layer itself`);
    assert.doesNotMatch(s, /\.destroy\(\{ children: true \}\);\s*\n\s*\}\s*catch/, `${f} has no teardown try/catch of its own`);
  }
});

test("ties-ui-EXT-9: interfaceLayer makes the layer once on canvas.interface; dropLayer destroys it once", async () => {
  const { interfaceLayer, dropLayer } = await import("../ties-adapter.mjs");
  const state = { layer: null, z: 1234 };
  let made = 0;
  const make = () => (made++, new PIXI.Container());
  const p0 = F.pixi.length;
  const a = interfaceLayer(state, make);
  assert.ok(a, "a layer on a ready canvas");
  assert.equal(interfaceLayer(state, make), a, "the same layer the second time");
  assert.equal(made, 1);
  // the order the canvas-pixi golden pins for the wire layer: new, eventMode, zIndex, addChild
  assert.deepEqual(F.pixi.slice(p0).map(c => [c.id, c.call, ...c.args]), [
    [a.id, "new"],
    [a.id, "set eventMode", "none"],
    [a.id, "set zIndex", 1234],
    [canvas.interface.id, "addChild", `<${a.id}>`],
  ]);
  dropLayer(state);
  assert.equal(state.layer, null);
  assert.equal(a.destroyed, true);
  dropLayer(state); // nothing to drop: no throw
  const ready = canvas.ready;
  canvas.ready = false;
  assert.equal(interfaceLayer(state, make), null, "no canvas, no layer");
  canvas.ready = ready;
});

test("ties-ui-EXT-9: a hundred refreshToken calls are one frame for each painter; the frame paints once", async () => {
  const Worn = await import("../worn.mjs");
  await Worn.setWorn(canvas.tokens.get("zzTokNpc00000001").document, { by: "Oz", note: "" });
  F.flushFrames();
  F.frames.length = 0;
  for (let i = 0; i < 100; i++) Worn.drawBadges();
  assert.equal(F.frames.length, 1, "one queued frame");
  assert.equal(F.flushFrames(), 1);
  Worn.drawBadges();
  assert.equal(F.frames.length, 1, "after the frame runs, the next call queues again");
  F.flushFrames();
});
