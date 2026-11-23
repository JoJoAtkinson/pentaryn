// The move lifecycle (0.8.0, lifecycle-core): one state machine per move, one deadline that bounds every wait composed
// (Fable's review §2 C3: "one test bounding the composed clocks under 10 s").
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENDS, LIFE, STATES, canStep, capped, composedBound, expired, left, newRun, over, step } from "../lifecycle-core.mjs";
import { GUARD, newYield, stepYield } from "../guard-core.mjs";
import { RESERVE, queueNext } from "../reserve-core.mjs";
import { GROUP_LIMITS } from "../group-core.mjs";

test("a run starts planning with its deadline LIFE.deadlineMs (10 s) after its drop", () => {
  const r = newRun({ id: "g", now: 1000, members: ["a", "b"] });
  assert.equal(r.state, "planning");
  assert.equal(r.deadline, 1000 + LIFE.deadlineMs);
  assert.equal(LIFE.deadlineMs, 10000);
  assert.deepEqual(r.members, ["a", "b"]);
});

test("legal steps move it on and are recorded; an end state takes no further step (a late timer is a no-op)", () => {
  const r = newRun({ now: 0 });
  assert.ok(step(r, "queued", { now: 10, why: "walksInTheWay" }));
  assert.ok(step(r, "planning", { now: 20, why: "replan" }));
  assert.ok(step(r, "walking", { now: 30 }));
  assert.ok(step(r, "yielding", { now: 40 }));
  assert.ok(step(r, "walking", { now: 50 }));
  assert.ok(step(r, "rested", { now: 60 }));
  assert.deepEqual(r.history.map(h => h.state), ["planning", "queued", "planning", "walking", "yielding", "walking", "rested"]);
  for (const s of STATES) assert.equal(step(r, s, { now: 70 }), false, `nothing after rested (${s})`);
  assert.ok(over(r));
});

test("canStep refuses unknown states and steps out of an end state", () => {
  const r = newRun();
  assert.equal(canStep(r, "flying"), false);
  for (const end of ENDS) {
    const x = newRun();
    assert.ok(step(x, end));
    assert.equal(canStep(x, "walking"), false);
  }
  assert.equal(canStep(null, "walking"), false);
});

test("left / capped / expired: every wait is as much as the run has left, never more", () => {
  const r = newRun({ now: 0 });
  assert.equal(left(r, 2500), 7500);
  assert.equal(capped(r, 2500, 3000), 3000);
  assert.equal(capped(r, 9000, 3000), 1000);
  assert.equal(capped(r, 12000, 3000), 0);
  assert.equal(expired(r, 9999), false);
  assert.equal(expired(r, 10000), true);
  step(r, "rested");
  assert.equal(left(r, 0), 0, "an ended run has nothing left");
  assert.equal(expired(r, 20000), false, "an ended run never expires again");
});

test("the composed clocks: plan budget + queue + start delay + a guard yield never keep a move from rest past 10 s", () => {
  // The worst each wait could ask for on its own (0.7: queue 8 s, delay 3 s, guard rest 8 s; they summed past 10 s).
  const worst = { planMs: GROUP_LIMITS.waitMs, queueMs: RESERVE.queueMs, delayMs: RESERVE.singleMs, yieldMs: GUARD.restMs };
  assert.ok(worst.planMs + worst.queueMs + worst.delayMs + worst.yieldMs > LIFE.deadlineMs, "each alone fits, together they would not");
  assert.equal(composedBound(worst), LIFE.deadlineMs);
  // The glue's rule, applied wait by wait: each one capped by what the run has left.
  const r = newRun({ now: 0 });
  let t = 0;
  for (const w of [worst.planMs, worst.queueMs, worst.delayMs]) t += capped(r, t, w);
  assert.ok(t <= LIFE.deadlineMs, `planning, queue and delay end by ${t} ms`);
  // The guard's rest comes at the move's deadline (y.restAt), not 8 s after its first yield.
  const y = { ...newYield(), restAt: r.deadline };
  const t0 = Math.min(t, r.deadline) - 2000;
  assert.equal(stepYield(y, { now: t0, conflict: true }), "pause");
  let act = null;
  for (let now = t0; now <= r.deadline && act !== "rest"; now += 50) {
    act = stepYield(y, { now, clear: false });
    if (act === "reroute") y.phase = "held";
  }
  assert.equal(act, "rest", "rests by the deadline");
  // A queue the run has no room for is no queue.
  assert.equal(queueNext(0, capped(r, 9950, 3000)), null);
});
