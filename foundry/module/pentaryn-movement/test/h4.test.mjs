// Hard round H-4 (0.4.11): the drawn position held at a click-stop until its displace lands (H4-06), what is left
// of a walk for the plan's timing (H4-03 / H4-04).
import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingFrom } from "../motion-core.mjs";
import { holdPinned, pinDrawn, unpin } from "../group-adapter.mjs";

test("remainingFrom: the drawn point, then the points still ahead", () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
  assert.deepEqual(remainingFrom(pts, { x: 2, y: 0 }), [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
  assert.deepEqual(remainingFrom(pts, { x: 4, y: 3 }), [{ x: 4, y: 3 }, { x: 4, y: 4 }]);
  assert.equal(remainingFrom(pts, { x: 4, y: 4 }), null, "at the end");
  assert.equal(remainingFrom([{ x: 0, y: 0 }], { x: 0, y: 0 }), null, "no segment");
});

/** A token stub: derived x/y (what is drawn), its source, a position, no tween unless `animating`. */
function token(id, { x, y, src, animating = false } = {}) {
  const t = {
    destroyed: false,
    document: { id, x, y, _source: { ...src } },
    position: { x, y, set(a, b) { this.x = a; this.y = b; } },
    movementAnimationName: "move",
    animationContexts: new Map(animating ? [["move", {}]] : []),
    stopped: 0,
    stopAnimation() { this.stopped += 1; this.animationContexts.clear(); },
  };
  return t;
}

test("H4-06: a stopped token re-prepared onto its old destination is drawn back where it stopped until its displace lands", () => {
  // Stopped at (800, 300); the displace to (800, 300)'s square is on its way; its source is still the old destination.
  const t = token("pinA000000000001", { x: 800, y: 300, src: { x: 1500, y: 500 } });
  pinDrawn(t, { x: 800, y: 300 }, { x: 800, y: 300 });
  // Something re-prepares the document: derived back on the source, drawn there.
  t.document.x = 1500; t.document.y = 500; t.position.set(1500, 500);
  assert.equal(holdPinned(t), true);
  assert.deepEqual([t.document.x, t.document.y, t.position.x, t.position.y], [800, 300, 800, 300]);
  // The displace lands: the source is the stop square; the pin lets go and nothing is touched.
  t.document._source.x = 800; t.document._source.y = 300;
  assert.equal(holdPinned(t), false);
  t.document.x = 800; t.document.y = 300;
  assert.equal(holdPinned(t), false, "no pin left");
});

test("H4-06: a pinned token's stray tween is stopped where it stopped; a refused displace lets go at once", async () => {
  const t = token("pinB000000000001", { x: 1500, y: 500, src: { x: 1500, y: 500 }, animating: true });
  pinDrawn(t, { x: 812, y: 312 }, { x: 800, y: 300 });
  assert.equal(holdPinned(t), true);
  await Promise.resolve();
  assert.equal(t.stopped, 1, "the tween is stopped");
  assert.deepEqual([t.document.x, t.document.y], [812, 312]);
  // Refused: the caller unpins, then core's reset draws it at its source.
  unpin(t);
  t.document.x = 1500; t.document.y = 500;
  assert.equal(holdPinned(t), false);
  assert.deepEqual([t.document.x, t.document.y], [1500, 500]);
});

test("H4-06: a pin never outlives its 1.5 s", () => {
  const t = token("pinC000000000001", { x: 800, y: 300, src: { x: 1500, y: 500 } });
  const real = globalThis.performance.now;
  let fake = real.call(globalThis.performance);
  globalThis.performance.now = () => fake;
  try {
    pinDrawn(t, { x: 800, y: 300 }, { x: 800, y: 300 });
    fake += 1600;
    t.document.x = 1500;
    assert.equal(holdPinned(t), false);
    assert.equal(t.document.x, 1500);
  } finally { globalThis.performance.now = real; }
});

test("S3R1-01: remainingFrom puts a token drawn 0.4 square past a corner on the leg it walks, not back on the corner", () => {
  const pts = [{ x: 1, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 9 }];
  assert.deepEqual(remainingFrom(pts, { x: 5, y: 5.4 }), [{ x: 5, y: 5.4 }, { x: 5, y: 9 }]);
  // An arc's chords: drawn on the fourth, it is on the fourth (every earlier chord is within half a square).
  const arc = [{ x: 0, y: 1 }];
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 12; arc.push({ x: Math.cos(a), y: 1 + Math.sin(a) + 1 }); }
  const at = { x: (arc[4].x + arc[5].x) / 2, y: (arc[4].y + arc[5].y) / 2 };
  assert.deepEqual(remainingFrom(arc, at)[1], arc[5]);
  // A route that doubles back on itself: the earlier leg, as before.
  assert.deepEqual(remainingFrom([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 0.02 }], { x: 2, y: 0.01 })[1], { x: 4, y: 0 });
});
