// Live H1-01 / H1-02: on a slow page a chained movement tween can complete inside its own first frame
// and start the next link before core registers it under its name; core then overwrites the running
// link's registration with the completed one. A stop (terminateAnimation by name) missed the running
// link: the token walked on through a door that had just shut, and when that link ended with links
// queued core threw "reading 'chain'" and left the token frozen off its server position.
// stop.mjs wraps CanvasAnimation.animate so the name points at the animation that is still running.
import { test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld } from "./fixtures/world.mjs";

const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const CA = F.foundry.canvas.animation.CanvasAnimation;

test("H1-01: a link started inside its parent's first frame stays registered, so a stop terminates it", () => {
  const name = "Token.a.animateMovement";
  let inner = null, innermost = null;
  CA.animate([], { name, first: outer => {
    outer.resolve(true);                                  // the first frame completes the segment
    CA.animate([], { name, first: mid => {              // ... and starts the next link
      mid.resolve(true);                                  // which also completes at once
      CA.animate([], { name, first: a => { innermost = a; } });
      inner = mid;
    } });
  } });
  assert.equal(inner.state, 2);
  assert.equal(CA.animations[name], innermost, "the running link is the one registered");
  CA.terminateAnimation(name);                          // what stopAnimation / the next movement does
  assert.equal(innermost.state, -1, "the stop reaches the running link");
});

test("an animation that does not complete in its first frame is registered as before", () => {
  const name = "Token.b.animateMovement";
  CA.animate([], { name });
  const a = CA.animations[name];
  assert.equal(a.state, 1);
  CA.animate([], { name, first: () => {} });
  assert.equal(a.state, -1, "a new animation of that name terminates the old one");
  assert.notEqual(CA.animations[name], a);
  const other = CA.animate([], {});                     // unnamed: untouched
  assert.ok(other instanceof Promise);
});

test("the patch is recorded with its adjustments row", () => {
  const rows = game.pentaryn.movement.describe?.().patches ?? [];
  assert.ok(rows.some(p => p.adjustments === "movement-canvas-animation-registration"), JSON.stringify(rows.map(p => p.adjustments)));
});

// S2R3-02: core adds a movement tween's ticker listener between frames, and the first frame it gets is the whole
// interval since the frame before, time from before the tween existed. On a stalling page (415-684 ms frames) a
// member whose move arrived just after a stalled frame jumped ahead by up to that much, onto the one before it in
// the file (-51 px for 2.3 s). The first frame of a fresh movement tween is credited no more than the time since it began.
test("S2R3-02: a fresh movement tween's first frame never counts time from before it began", () => {
  const perfNow = performance.now;
  let t = 1000;
  performance.now = () => t;
  try {
    const token = { movementAnimationName: "Token.c.animateMovement" };
    CA.animate([], { name: token.movementAnimationName, context: token });
    const a = CA.animations[token.movementAnimationName];
    t += 20;                                              // its first frame comes 20 ms after it began ...
    a.fn(700 * 0.06);                                     // ... and the frame interval was a 700 ms stall
    assert.ok(Math.abs(a.time - 20) < 1, `credited ${a.time} ms`);
    t += 700;
    a.fn(700 * 0.06);                                     // later frames: all of their time
    assert.ok(Math.abs(a.time - 720) < 1, `credited ${a.time} ms`);
    // A chained link (time carried from the one before) and any other animation are left as core runs them.
    CA.animate([], { name: token.movementAnimationName, context: token, time: 30 });
    const b = CA.animations[token.movementAnimationName];
    b.fn(700 * 0.06);
    assert.ok(Math.abs(b.time - 700) < 1, `chained: ${b.time}`);
    CA.animate([], { name: "Token.c.other", context: token });
    const c = CA.animations["Token.c.other"];
    c.fn(700 * 0.06);
    assert.ok(Math.abs(c.time - 700) < 1, `other: ${c.time}`);
  } finally { performance.now = perfNow; }
});
