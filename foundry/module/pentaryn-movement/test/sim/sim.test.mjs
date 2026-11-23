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
    assert.ok(invs(runSeed(seed, { noVet: true })).includes(inv), "without the fix the seed still shows it");
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
