// Hard round HX-1 (0.4.12): who counts as standing in the way (HX1-01), a wave that waits for another group walking
// through its way (HX1-02), an excluded member's walk timed after the others (HX1-05).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, walkersMeet } from "../group-core.mjs";
import { trajectory, delayed, positionAt, dist, MOTION } from "../motion-core.mjs";
import { countsForRoutes, othersOf, movingOthers } from "../group-adapter.mjs";

/** A placeable stub: a token at top-left (x, y) px, `visible` as this client's vision has it. */
function placeable(id, x, y, { visible = true, hidden = false, owner = false, disposition = -1 } = {}) {
  return { visible, isPreview: false, destroyed: false, animationContexts: new Map(), movementAnimationName: "move",
    document: { id, hidden, isOwner: owner, disposition, _source: { x, y, width: 1, height: 1, level: undefined }, movement: null } };
}

test("HX1-01: a GM's routes count a token its controlled member cannot see (behind a wall); a player's count its party, never a hidden or unseen hostile", () => {
  const saved = { canvas: globalThis.canvas, game: globalThis.game, CONST: globalThis.CONST };
  globalThis.CONST = { TOKEN_DISPOSITIONS: { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } };
  try {
    const me = placeable("me", 0, 0);
    const behindWall = placeable("wall7", 1400, 400, { visible: false, disposition: 1 });
    const unseenFoe = placeable("foe", 1500, 400, { visible: false, disposition: -1 });
    const hiddenOne = placeable("hid", 1600, 400, { visible: false, hidden: true, disposition: 1 });
    const seen = placeable("seen", 300, 0, { visible: true, disposition: -1 });
    globalThis.canvas = { tokens: { placeables: [me, behindWall, unseenFoe, hiddenOne, seen] } };
    const members = [{ id: "me", token: me }];

    globalThis.game = { user: { isGM: true } };
    assert.equal(countsForRoutes(behindWall), true, "GM: a token out of the controlled member's sight still stands there");
    assert.deepEqual(othersOf(members, 100).length, 4, "GM: every other token");

    globalThis.game = { user: { isGM: false } };
    assert.equal(countsForRoutes(behindWall), true, "player: its own party, seen or not");
    assert.equal(countsForRoutes(unseenFoe), false, "player: never a hostile it cannot see");
    assert.equal(countsForRoutes(hiddenOne), false, "player: never a token the GM hid");
    assert.equal(countsForRoutes(seen), true);
    assert.deepEqual(othersOf(members, 100).map(c => c.x).sort((a, b) => a - b), [3.5, 14.5]);

    // A walker out of sight counts for the timing the same way (two-way traffic, H4-03 / HX1-02).
    globalThis.game = { user: { isGM: true } };
    behindWall.animationContexts.set("move", {});
    behindWall.document.movement = { state: "pending", origin: { x: 1400, y: 400 }, passed: { waypoints: [] }, pending: { waypoints: [{ x: 600, y: 400 }] } };
    behindWall.document.x = 1400; behindWall.document.y = 400;
    behindWall.position = { x: 1400, y: 400 };
    const walkers = movingOthers(members, 100);
    assert.deepEqual(walkers.map(w => w.id), ["wall7"], "the walker behind the wall is in the plan's timing");
  } finally {
    globalThis.canvas = saved.canvas; globalThis.game = saved.game; globalThis.CONST = saved.CONST;
  }
});

test("HX1-02: a wave about to set off down a one-wide corridor meets a group walking the other way; once they are past, it does not", () => {
  // Corridor along y = 5.5: the wave walks east from x 8.5 to 17.5; the other group walks west from 14.5 to 4.5.
  const mine = [{ points: [{ x: 8.5, y: 5.5 }, { x: 17.5, y: 5.5 }], r: 0.5, speed: 6 }];
  const headOn = [{ points: [{ x: 14.5, y: 5.5 }, { x: 4.5, y: 5.5 }], r: 0.5, speed: 6 }];
  assert.equal(walkersMeet(mine, headOn), true);
  // The other one is already west of us, walking away.
  const past = [{ points: [{ x: 7.0, y: 5.5 }, { x: 4.5, y: 5.5 }], r: 0.5, speed: 6 }];
  assert.equal(walkersMeet(mine, past), false);
  // Walking the same way well ahead: no meeting.
  const ahead = [{ points: [{ x: 11.5, y: 5.5 }, { x: 20.5, y: 5.5 }], r: 0.5, speed: 6 }];
  assert.equal(walkersMeet(mine, ahead), false);
  assert.equal(walkersMeet(mine, []), false);
});

const DOOR = `
###############
#.............#
#.............#
#.............#
#######.#######
#.............#
#.............#
#.............#
###############`;

test("HX1-05: a member with no route (a Large that fits no door) sets off only once those whose way it crosses have passed; nobody is walked through while it waits", () => {
  const g = gridWorld(DOOR);
  // a (anchor), b, c and e file through the door (column 7, row 4) to the lower room; the Large L has no route: core
  // walks it east along row 2 toward the door, through where c and e stand waiting their turn (live H7b, -113 px).
  const d = { x: 0, y: 4 };
  const ms = [member("a", { x: 7.5, y: 2.5 }, d), member("b", { x: 6.5, y: 2.5 }, d), member("c", { x: 5.5, y: 2.5 }, d), member("e", { x: 6.5, y: 1.5 }, d)];
  const L = member("L", { x: 2, y: 2.5 }, { x: 4.5, y: -0.5 }, { w: 2 });
  L.corePath = [{ x: 2, y: 2.5 }, { x: 6.5, y: 2 }];
  const route = (m, from, to, opts) => (m.id === "L" ? null : g.route(m, from, to, opts));
  const res = finish(planGroup({ members: [...ms, L], anchorId: "a" },
    { walkable: g.walkable, walkDistance: g.walkDistanceFrom(ms[0].formation), route, narrow: g.narrow, now: () => 0 }));
  assert.equal(res.result, "plan");
  assert.deepEqual(res.excluded, ["L"]);
  const e = res.members;
  assert.equal(e.L.core, true);
  assert.ok(e.L.delay > 0, `the Large waits (${e.L.delay} ms)`);
  // Over all time (standing at its start, walking, at rest), nobody is walked through the Large or it through them.
  const tr = id => delayed(trajectory(e[id].points, { speed: 6 }), e[id].delay);
  const end = Math.max(...Object.keys(e).map(id => tr(id).end)) + 100;
  for (const q of ["a", "b", "c", "e"]) {
    let min = Infinity;
    for (let t = 0; t <= end; t += 10) min = Math.min(min, dist(positionAt(tr("L"), t), positionAt(tr(q), t)));
    assert.ok(min >= 1.5 - MOTION.contact - 1e-6, `L/${q} never overlap: ${min.toFixed(3)}`);
  }
});

test("HX1-08: a door cut's last leg keeps off the squares the members cut before it took (clear)", async () => {
  const { cutAtWalls } = await import("../group-adapter.mjs");
  // A wall along y = 400; the token walks from (400, 0) straight down to (400, 700).
  const token = {
    document: { _source: { x: 400, y: 0, width: 1, height: 1, elevation: 0 }, parent: { grid: { size: 100 } } },
    checkCollision: (d, { origin }) => (origin.y < 400) !== (d.y < 400),
  };
  globalThis.canvas ??= {};
  globalThis.canvas.grid = { size: 100 };
  const wps = [{ x: 400, y: 700 }];
  const plain = cutAtWalls(token, { x: 400, y: 0 }, wps);
  assert.deepEqual([plain.waypoints.at(-1).x, plain.waypoints.at(-1).y], [400, 300], "the last square before the wall");
  // (400, 300) and the way into it are another member's: the leg there is refused, the square before it is taken.
  const clear = (a, b) => !(b.y >= 250);
  const kept = cutAtWalls(token, { x: 400, y: 0 }, wps, { clear });
  assert.deepEqual([kept.waypoints.at(-1).x, kept.waypoints.at(-1).y], [400, 200]);
});
