// The simulator in the module's suite (Fable's review §5): a smoke run of seeds, and one regression per defect it
// found (SIM-01 ... SIM-05, 0.8.1). Each regression runs its seed twice: with the module's fix (as the model ports
// it) every invariant holds; with the fix switched off in the model the same seed still breaks the invariant, so the
// seed keeps exercising the case. The night's run is `make foundry-movement-sim SEEDS=10000` (scripts/foundry/movement_sim.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSeed } from "./scenario.mjs";

const invs = r => [...new Set(r.failures.map(f => f.inv))];
const BACKGROUND = { combat: false, loss: false, fog: false, background: true, door: false, click: false, two: false };

test("the simulator runs: 40 seeds, every map and mode, nothing throws and every run ends", () => {
  const maps = new Set(), modes = new Set();
  for (let s = 1; s <= 40; s++) {
    const r = runSeed(s);
    maps.add(r.meta.map.replace(/\d$/, ""));
    modes.add(r.meta.combat ? (r.meta.tierC ? "fightC" : "fightCore") : "explore");
    assert.deepEqual(r.failures.filter(f => f.inv === "errors"), [], `seed ${s} threw`);
    assert.ok(r.runs.every(x => ["rested", "stopped", "fallback", "cancelled"].includes(x.state)), `seed ${s}: a run never ended ${JSON.stringify(r.runs)}`);
  }
  assert.ok(maps.size >= 5, `maps covered: ${[...maps]}`);
  assert.equal(modes.size, 3, `modes covered: ${[...modes]}`);
});

test("the simulator replays: the same seed gives the same record", () => {
  const a = runSeed(1234), b = runSeed(1234);
  assert.deepEqual(a.failures, b.failures);
  assert.deepEqual(a.runs, b.runs);
});

for (const seed of [23, 299]) {
  test(`SIM-01 (seed ${seed}): a member planned to set off after the deadline stays where it stands; the run ends, no reservation is left`, () => {
    assert.deepEqual(invs(runSeed(seed)).filter(i => i === "liveness" || i === "orphans"), []);
    assert.ok(invs(runSeed(seed, { noStay: true })).includes("liveness"), "without the fix the seed still shows it");
  });
}

for (const [seed, inv] of [[14, "passThrough"], [156, "moverBound"]]) {
  test(`SIM-02 / SIM-03 (seed ${seed}): a fight's tier C member is vetted when it sets off (a walk outside the group in its way holds it; a token come to rest in it cuts it)`, () => {
    const r = runSeed(seed);
    assert.equal(r.meta.tierC, true);
    assert.deepEqual(invs(r), []);
    assert.ok(invs(runSeed(seed, { noVet: true, noStays: true })).includes(inv), "without the fix (nor 0.8.4's step test, which now also catches it) the seed still shows it");
  });
}

for (const seed of [6, 7, 15]) {
  test(`SIM-04 / SIM-05 (seed ${seed}): a group dropped on a page that goes to the background before its group exists is flushed, clear of the first wave`, () => {
    const r = runSeed(seed, BACKGROUND);
    assert.equal(r.meta.backgrounded, true);
    assert.deepEqual(invs(r), []);
    assert.ok(invs(runSeed(seed, { ...BACKGROUND, noFlushFix: true })).includes("passThrough"), "without the fix the seed still shows it");
  });
}

// AR1-02 (0.8.3): tier C walked a file one member at a time, each on the arrival of the one before, and the timing
// pass's settle left members standing for conflicts the sequence answers by order; the run's deadline then kept most
// of them where they stood (live C-1: 6 of 8 never moved). A member now follows one before it once that one is far
// enough ahead, and tier C's plan keeps every member's route.
const CALM = { combat: true, tierC: true, loss: false, fog: false, background: false, two: false };
function movedShare(opts, seeds = 60) {
  let members = 0, moved = 0, failed = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = runSeed(s, { ...CALM, keep: true, ...opts });
    if (r.failures.length) failed += 1;
    const first = r.runs.find(x => x.ids?.length > 1);
    for (const id of first?.ids ?? []) { members += 1; if (r.sc.server.log.some(e => e.id === id && e.kind === "move")) moved += 1; }
  }
  return { share: moved / Math.max(members, 1), failed };
}
test("AR1-02: tier C moves the members of a file, not one at a time until the deadline (60 undisturbed fights)", () => {
  const now = movedShare({});
  assert.equal(now.failed, 0, "every invariant holds");
  assert.ok(now.share >= 0.85, `share of members that moved: ${now.share.toFixed(3)}`);
  const before = movedShare({ noFollow: true, noSequenced: true });
  assert.ok(before.share < now.share - 0.1, `0.8.2's way moved fewer: ${before.share.toFixed(3)}`);
});

// AR2-02 (0.8.4): tier C off (core's move, every member at once, a square at a time) read every token between two
// squares as about to leave; the one behind stepped into the square of one ahead that its own next square then
// stopped, two continuations sent in one moment took one square, and head-on members traded squares through each
// other: both rested on one square (live C-11, C-2 off). A fight step is now never sent into a token that will stay,
// onto the square another is about to step to, or into a trade.
const OFF = { combat: true, tierC: false };
for (const seed of [132, 266]) {
  test(`AR2-02 (seed ${seed}): tier C off leaves no two members on one square`, () => {
    const r = runSeed(seed, OFF);
    assert.equal(r.meta.tierC, false);
    assert.deepEqual(invs(r).filter(i => i === "restOverlap"), []);
    assert.ok(invs(runSeed(seed, { ...OFF, noStays: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}
test("AR2-02: tier C off over 200 seeds: at most 2 rest overlaps (0.8.3: 6), mover-vs-mover far fewer", () => {
  const count = extra => { const t = { rest: 0, mm: 0 }; for (let s = 1; s <= 200; s++) { const v = invs(runSeed(s, { ...OFF, ...extra })); if (v.includes("restOverlap")) t.rest++; if (v.includes("moverBound")) t.mm++; } return t; };
  const now = count({}), before = count({ noStays: true });
  assert.ok(now.rest <= 2, `rest overlaps: ${now.rest}`);
  assert.ok(now.rest < before.rest && now.mm < before.mm / 2, `now ${JSON.stringify(now)} vs 0.8.3 ${JSON.stringify(before)}`);
});
