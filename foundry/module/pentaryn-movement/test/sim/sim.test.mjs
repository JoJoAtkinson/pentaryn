// The simulator in the module's suite (0.9.0, Fable's review 2 §4 step 5): a smoke run of seeds on the real cores
// (file-core planFile / staggerFile, sequence-core, the pathfind-core A*), and one regression per defect it found
// (SIM5-01 ... SIM5-03). Each regression seed holds every hard invariant with the fix, and with the fix switched off in
// the model it still breaks one, so the seed keeps exercising the case (the file-core and stop.mjs fixes also have
// their own unit tests: file-core.test.mjs, drop.test.mjs "simulator (step 5)"). The full run is
// `make foundry-movement-sim SEEDS=10000` (scripts/foundry/movement_sim.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSeed } from "./scenario.mjs";

const invs = r => [...new Set(r.failures.map(f => f.inv))];

test("the simulator runs on the real cores: 60 seeds as B1 and as B0, every map and mode, every hard invariant holds", () => {
  const maps = new Set(), modes = new Set();
  for (let s = 1; s <= 60; s++) {
    for (const b0 of [false, true]) {
      const r = runSeed(s, { b0 });
      maps.add(r.meta.map.replace(/\d$/, ""));
      modes.add(r.meta.combat ? "fight" : "explore");
      assert.deepEqual(r.failures, [], `seed ${s} ${b0 ? "B0" : "B1"}: ${JSON.stringify(r.failures[0])}`);
    }
  }
  assert.ok(maps.size >= 5, `maps covered: ${[...maps]}`);
  assert.equal(modes.size, 2, `modes covered: ${[...modes]}`);
});

test("the simulator replays: the same seed gives the same record", () => {
  const a = runSeed(1234, { events: true }), b = runSeed(1234, { events: true });
  assert.deepEqual(a.failures, b.failures);
  assert.deepEqual(a.movers.map(m => [m.depth, m.ms]), b.movers.map(m => [m.depth, m.ms]));
  assert.equal(a.events.length, b.events.length);
});

for (const seed of [382, 764, 1958, 5361]) {
  test(`SIM5-01 (seed ${seed}): a wave cut short at a token come to rest leaves no member resting on a mate, nor walking through one a wave left standing`, () => {
    assert.deepEqual(invs(runSeed(seed)), []);
    const off = invs(runSeed(seed, { noWaveRests: true }));
    assert.ok(off.includes("restOverlap") || off.includes("passThrough"), `without the fix the seed still shows it: ${off}`);
  });
}

for (const seed of [49, 643, 1840, 6156]) {
  test(`SIM5-02 (seed ${seed}): a stop (a click, a door shut) never leaves two tokens at rest inside each other: the later one is carried clear along its way`, () => {
    assert.deepEqual(invs(runSeed(seed)), []);
    assert.ok(invs(runSeed(seed, { noStopClear: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}

test("SIM5-03: members whose formation spot lies behind a wall come along (file-core candidatesFor with the grabbed one): most members dropped now move", () => {
  let dropped = 0, unmoved = 0;
  for (let s = 1; s <= 120; s++) { const r = runSeed(s); dropped += r.stats.dropped; unmoved += r.stats.unmoved; }
  // Before the fix 46 % of the dropped members never moved (named); after it 29 % (2,000 seeds: a stay is named, the
  // rest are a door shut, a click, a turn change, a dead end).
  assert.ok(unmoved / dropped < 0.36, `${unmoved} of ${dropped} never moved`);
});
