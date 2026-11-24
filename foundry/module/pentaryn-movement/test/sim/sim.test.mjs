// The simulator in the module's suite (0.9.0, Fable's review 2 §4 step 5): a smoke run of seeds on the real cores
// (file-core planLead / staggerFile, the pathfind-core A*), and one regression per defect it found
// (SIM5-01 ... SIM5-03). Each regression seed holds every hard invariant with the fix, and with the fix switched off in
// the model it still breaks one, so the seed keeps exercising the case (the stop.mjs fixes also have their own unit
// tests: drop.test.mjs "simulator (step 5)"). 0.10 L1: the leader plan gives every seed new slots, so the regression
// seeds were found again on it (the first four of seeds 1-6000 that hold with the fix and break without it); L2 (the
// motion) found them again the same way (seeds 1-8000), and one for its fix (b). 0.10 L3 adds the leader rule's own
// kinds of seed (swarm, hidden, tunnel, crowd, Joe's stations; scenario.mjs KINDS) and keeps 0.9's draws as the
// "legacy" mix: the regression seeds run on it, so each stays the case it was found as. L3's own regressions: the
// order every screen sees (SIM-L3-01, L2's open passThrough seeds), a stop settling the front ones first (SIM-L3-02,
// 0.9's open rest overlaps), a walk on looked at again when a door shut since (SIM-L3-03), a stop that stops this
// screen's walkers heading into it too (SIM-L3-04), a hidden tab's waves kept on their timers (SIM-L3-05), a member
// making room along its own way (SIM-L3-06), a waiting member's slot no stop's spot (SIM-L3-07), a fight's next square
// never onto a walker's own square (SIM-L3-08, 0.9.0's open seed), a brush that is no overlap (SIM-L3-09) and a wave's
// stayer in the way of the whole wave (SIM-L3-10). The L3 fix round: one stop's writes as one update (SIM-L3-11), a
// waiting member's slot a stop's last choice (SIM-L3-12), a stop's tokens settled together (SIM-L3-13, -14), room made
// along a token's way (SIM-L3-15) and a walk on's second look settling again (SIM-L3-16). With all
// of L3 in, earlier regression seeds that no longer break with only their own fix off were found again. The full run is
// `make foundry-movement-sim SEEDS=10000` (scripts/foundry/movement_sim.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSeed } from "./scenario.mjs";

const invs = r => [...new Set(r.failures.map(f => f.inv))];

test("the simulator runs on the real cores: 60 seeds, every kind, map and mode, every hard invariant holds (the two shape rules too)", () => {
  const maps = new Set(), modes = new Set(), kinds = new Set();
  for (let s = 1; s <= 60; s++) {
    const r = runSeed(s);
    maps.add(r.meta.map.replace(/\d$/, ""));
    modes.add(r.meta.combat ? "fight" : "explore");
    kinds.add(r.meta.kind);
    assert.deepEqual(r.failures, [], `seed ${s}: ${JSON.stringify(r.failures[0])}`);
  }
  assert.ok(maps.size >= 8, `maps covered: ${[...maps]}`);
  assert.equal(modes.size, 2, `modes covered: ${[...modes]}`);
  assert.ok(kinds.size >= 5, `kinds covered: ${[...kinds]}`);
});

test("the simulator's legacy mix is 0.9's scenario generator, draw for draw (the regression seeds and the overlap comparison run on it)", () => {
  const r = runSeed(1234, { mix: "legacy", events: true });
  assert.equal(r.meta.kind, "legacy");
  assert.ok(["hard", "tJunction1", "tJunction2", "corridor2", "diagonal", "deadEnd"].includes(r.meta.map), r.meta.map);
});

test("the simulator replays: the same seed gives the same record", () => {
  const a = runSeed(1234, { events: true }), b = runSeed(1234, { events: true });
  assert.deepEqual(a.failures, b.failures);
  assert.deepEqual(a.movers.map(m => [m.depth, m.ms]), b.movers.map(m => [m.depth, m.ms]));
  assert.equal(a.events.length, b.events.length);
});

const legacy = { mix: "legacy" };
for (const seed of [19, 138, 424, 492]) {
  test(`SIM5-01 (seed ${seed}): a wave never walks a member through a mate at rest off its slot or one a wave left standing (0.10: a wave's member goes its whole way or stays)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    const off = invs(runSeed(seed, { ...legacy, noWaveRests: true }));
    assert.ok(off.includes("restOverlap") || off.includes("passThrough"), `without the fix the seed still shows it: ${off}`);
  });
}

for (const seed of [258, 380, 437, 575]) {
  test(`SIM5-02 (seed ${seed}): a stop (a click, a door shut) never leaves two tokens at rest inside each other: the later one is carried clear along its way`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noStopClear: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}

test("SIM-L2-01 (seed 9736; L1's open seed 1412 now holds with L3's stops too): another user's stop of a member that carries it on names its final spot, and the dragger's screen never rests a mate there (0.10 L2 fix (b))", () => {
  assert.deepEqual(invs(runSeed(9736, legacy)), []);
  assert.ok(invs(runSeed(9736, { ...legacy, noStopAt: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

for (const seed of [315, 954, 1451, 1522]) {
  test(`SIM-L3-01 (seed ${seed}, L2's open passThrough): a drop's waves reach every screen in send order, so one whose route passes a member's slot goes no later than it (file-core staggerFile, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noFifo: true })).includes("passThrough"), "without the fix the seed still shows it");
  });
}

// The L3 fix round's settle (SIM-L3-13) now also covers these seeds, so each still shows its case with the settle off.
for (const seed of [4157, 4881, 5138]) {
  test(`SIM-L3-02 (seed ${seed}, an open rest overlap of L2 / 0.9): one stop of a packed file settles the front ones first, the ones behind carried back along their ways (motion-core stopOrder, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noOrder: true, noSettle: true })).includes("restOverlap"), "without the fix (and the settle) the seed still shows it");
  });
}

test("SIM-L3-03 (seed 9124; L2's open seed 1097 now holds with the fix round too): a stop's walk on that a door shut since would cross takes its spot again along its way, with the doors as they are now (stop.mjs, 0.10 L3)", () => {
  assert.deepEqual(invs(runSeed(9124, legacy)), []);
  assert.ok(invs(runSeed(9124, { ...legacy, noWalkOnCheck: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

for (const seed of [2680, 5072]) {
  test(`SIM-L3-04 (seed ${seed}): a stop also stops this screen's own walkers whose way comes into a spot it rests a token on (stop.mjs stopAlso, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noStopAlso: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}

for (const seed of [607, 756, 1209]) {
  test(`SIM-L3-05 (seed ${seed}, a crowd or a station): a tab going to the background keeps its waves on their own timers, not all at once (file.mjs onVisibility, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed)), []);
    assert.ok(invs(runSeed(seed, { bgFlush: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}

for (const seed of [275, 6341, 6452]) {
  test(`SIM-L3-06 (seed ${seed}): a member of a stop with no spot along its own way, inside only members the same stop rested, rests where drawn when they can be carried on along their own ways (stop.mjs makeRoom, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noMakeRoom: true, noSettle: true })).includes("restOverlap"), "without the fix (and the settle) the seed still shows it");
  });
}

for (const seed of [6166, 7154]) {
  test(`SIM-L3-07 (seed ${seed}, an open rest overlap of L2): a stop never carries a token onto a slot a member still waiting for its wave will rest on, and a wave never sends one onto a spot a stop is carrying a token to (stop.mjs, drop.mjs sendWave, 0.10 L3)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noPendingEnds: true })).includes("restOverlap"), "without the fix the seed still shows it");
  });
}

test("SIM-L3-08 (seed 3599, 0.9.0's open rest overlap): in a fight a next square is never sent onto a walker's own square when it rests there or its screen has held it up (drop.mjs stepMeetsStanding, 0.10 L3)", () => {
  assert.deepEqual(invs(runSeed(3599, legacy)), []);
  assert.ok(invs(runSeed(3599, { ...legacy, noOwnSquare: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

test("SIM-L3-09 (seed 4491): a stop's carry that sets off only brushing a token at rest never goes on through it (stop.mjs takenAround enters, 0.10 L3)", () => {
  assert.deepEqual(invs(runSeed(4491, legacy)), []);
  assert.ok(invs(runSeed(4491, { ...legacy, noDeeper: true, noSettle: true })).includes("passThrough"), "without the fix (and the settle) the seed still shows it");
});

test("SIM-L3-10 (seed 5479): a wave member that stays is in the way of every other member of the wave, also of one looked at before it (drop.mjs sendWave, 0.10 L3)", () => {
  assert.deepEqual(invs(runSeed(5479, legacy)), []);
  assert.ok(invs(runSeed(5479, { ...legacy, noWaveAgain: true })).includes("passThrough"), "without the fix the seed still shows it");
});

test("SIM-L3-11 (seed 9191, a tunnel file cut by a door): one stop's writes go as one update, so no screen has one of them stopped while the next still walks on onto it (stop.mjs, file.mjs, drop.mjs cutAcross; 0.10 L3 fix round)", () => {
  assert.deepEqual(invs(runSeed(9191)), []);
  assert.ok(invs(runSeed(9191, { noBatch: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

test("SIM-L3-12 (seed 8249, a crowd cut by a door): a waiting member's slot is a stop's last choice, not a wall: with no spot clear of every slot, one clear of the tokens themselves (stop.mjs stopSpot, 0.10 L3 fix round)", () => {
  assert.deepEqual(invs(runSeed(8249)), []);
  assert.ok(invs(runSeed(8249, { noSlotLast: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

for (const seed of [345, 6572, 6982, 9631]) {
  test(`SIM-L3-13 (seed ${seed}): a stop's tokens are settled together, so no walk on passes through a token the same stop rests on its way (stop.mjs settleTogether, motion-core settleAlong, 0.10 L3 fix round)`, () => {
    assert.deepEqual(invs(runSeed(seed, legacy)), []);
    assert.ok(invs(runSeed(seed, { ...legacy, noSettle: true })).includes("passThrough"), "without the fix the seed still shows it");
  });
}

test("SIM-L3-14 (seed 2357, a two-wide corridor cut by a door): unsettled with this screen's own walker in a token's way, the same stop stops it too and settles them together (stop.mjs settleTogether, 0.10 L3 fix round)", () => {
  assert.deepEqual(invs(runSeed(2357, legacy)), []);
  assert.ok(invs(runSeed(2357, { ...legacy, noSettleWalkers: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

test("SIM-L3-15 (seed 5418, a crowd of 18 at a door): with no spot along its way clear of all, a spot along it the members of its stop it lies in make room for (stop.mjs roomAlong, 0.10 L3 fix round)", () => {
  assert.deepEqual(invs(runSeed(5418)), []);
  assert.ok(invs(runSeed(5418, { noRoomAlong: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

test("SIM-L3-16 (seed 9124, a door shut across a walk on before this screen knew): the walk on's second look settles it again with the members of its stop it lies in (stop.mjs settleAgain, 0.10 L3 fix round)", () => {
  assert.deepEqual(invs(runSeed(9124, legacy)), []);
  assert.ok(invs(runSeed(9124, { ...legacy, noSettleAgain: true })).includes("restOverlap"), "without the fix the seed still shows it");
});

test("SIM5-03: most members dropped move (0.9: one whose formation spot lay behind a wall came along; 0.10: the leader rule has no formation spots, each takes the best square it can reach)", () => {
  let dropped = 0, unmoved = 0;
  for (let s = 1; s <= 120; s++) { const r = runSeed(s, legacy); dropped += r.stats.dropped; unmoved += r.stats.unmoved; }
  // Before the fix 46 % of the dropped members never moved (named); after it 29 % (2,000 seeds: a stay is named, the
  // rest are a door shut, a click, a turn change, a dead end).
  assert.ok(unmoved / dropped < 0.36, `${unmoved} of ${dropped} never moved`);
});
