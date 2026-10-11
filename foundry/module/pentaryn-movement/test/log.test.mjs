// Logging (guide S5, finding -20): the two hot-hook catches that used to be empty now warn once
// per session with the module prefix, and still never let a throw out of the hook.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, token } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");

function captureWarn(fn) {
  const warns = [];
  const saved = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    fn();
  } finally {
    console.warn = saved;
  }
  return warns;
}

test("refreshToken: a throwing token warns once, then stays silent; the hook never throws", () => {
  const bad = token();
  Object.defineProperty(bad, "mesh", { get() { throw new Error("mesh renamed"); } });
  const warns = captureWarn(() => {
    F.fire("refreshToken", bad, { refreshState: true });
    F.fire("refreshToken", bad, { refreshState: true });
  });
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], "pentaryn-movement | refreshToken (further errors suppressed)");
  assert.equal(warns[0][1].message, "mesh renamed");
  assert.equal(F.hookErrors.length, 0);
});

test("renderSceneControls: a throwing element warns once, then stays silent", () => {
  const el = { querySelector: () => { throw new Error("dom gone"); } };
  const warns = captureWarn(() => {
    F.fire("renderSceneControls", null, el);
    F.fire("renderSceneControls", null, el);
  });
  assert.deepEqual(warns.map(w => w[0]), ["pentaryn-movement | renderSceneControls (further errors suppressed)"]);
  assert.equal(F.hookErrors.length, 0);
});

test("a healthy refreshToken logs nothing", () => {
  const warns = captureWarn(() => F.fire("refreshToken", token(), { refreshState: true }));
  assert.deepEqual(warns, []);
});
