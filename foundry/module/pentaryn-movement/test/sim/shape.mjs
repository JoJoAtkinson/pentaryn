/**
 * The two shape rules of a group drag, judged independently of the planner (0.10; Joe's leader rule R3 / R4; the L1
 * gate in lead.test.mjs and the simulator's `shape` invariant share them):
 *   march  nobody rests beside or ahead of the leader: every square of every follower's slot is nearer B (the square
 *          the leader steps out of on its last step) than the leader's own squares are, by walk round the tokens
 *          standing with the leader's squares shut; a tie only behind the leader's last step; the door plug (0.10.2):
 *          when the plan names a narrow point it came through (`choke`), a square also holds that is on the leader's
 *          side of it within LEAD.beside of walk of the leader, never ahead of it along its last step, the narrow point
 *          a real one (narrowZones) within LEAD.plug of the leader, the leader's own squares not narrow;
 *   swarm  the leader rests touching the target, unless no free touching square was there that it could stand on and
 *          reach (round the tokens standing).
 * Units: centres in squares; a square (i, j) is row i, column j. Each returns a list of breaches (empty: it holds).
 */

import { flood } from "../../group-core.mjs";
import { LEAD, footprintCells, narrowZones } from "../../file-core.mjs";

const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param {object} o
 * @param {{ id, w, h }} o.leader        the leader (its size)
 * @param {{x,y}} o.at                   where the leader rests
 * @param {{x,y}|null} o.behind          B's centre (planLead's `behind`); none: no square behind, every follower stays
 * @param {{x,y}} o.lastStep             the leader's last step, a unit vector (planLead's `lastStep`)
 * @param {{ id, w, h, slot }[]} o.followers  the members that rest somewhere else than where they stand, or that moved
 * @param {{x,y,r}[]} o.standing         the tokens standing outside the group
 * @param {(a, b) => boolean} o.step     one step between neighbouring squares (walls only)
 * @param {{ key, x, y }|null} [o.choke] the narrow point the plan says the leader came through (planLead's `choke`)
 */
export function marchBreaches({ leader, at, behind, lastStep, followers, standing, step, choke = null }) {
  const out = [];
  if (!behind) {
    for (const f of followers) out.push({ rule: "march", id: f.id, why: "no square behind, yet it rests elsewhere" });
    return out;
  }
  const mine = footprintCells(at, leader.w, leader.h);
  const mineK = new Set(mine.map(c => `${c.i},${c.j}`));
  const occ = c => standing.some(s => dist({ x: c.j + 0.5, y: c.i + 0.5 }, s) < s.r + 0.5 - EPS);
  const fromB = flood({ i: Math.floor(behind.y), j: Math.floor(behind.x) }, (a, b) => step(a, b) && !occ(b) && !mineK.has(`${b.i},${b.j}`), 60);
  const fromL = new Map();
  for (const c of mine) for (const [k, d] of flood(c, (a, b) => step(a, b) && !occ(b), 60)) fromL.set(k, Math.min(d, fromL.get(k) ?? Infinity));
  const beside = besideOf({ at, mine, choke, step, occ });
  for (const f of followers) {
    for (const c of footprintCells(f.slot, f.w, f.h)) {
      const k = `${c.i},${c.j}`;
      const dB = fromB.get(k) ?? Infinity, dL = fromL.get(k) ?? Infinity;
      const back = (c.j + 0.5 - at.x) * (lastStep?.x ?? 0) + (c.i + 0.5 - at.y) * (lastStep?.y ?? 0);
      if (beside.has(k) && back <= EPS) continue;
      if (!(dB < dL - EPS || (Math.abs(dB - dL) <= EPS && back < -EPS))) out.push({ rule: "march", id: f.id, square: k, fromB: dB, fromLeader: dL });
    }
  }
  return out;
}

/**
 * The door plug's squares (0.10.2), judged on their own: empty unless `choke` is a real narrow point (narrowZones on
 * `step`) whose box is within LEAD.plug of the leader in a straight line, none of the leader's squares narrow; then the squares
 * within LEAD.beside of walk of the leader's squares (round the tokens standing) without passing through it.
 */
function besideOf({ at, mine, choke, step, occ }) {
  const out = new Set();
  if (!choke?.key) return out;
  const zones = narrowZones(step);
  if (!zones({ x: choke.x, y: choke.y }).some(z => z.key === choke.key)) return out;
  if (mine.some(c => zones({ x: c.j + 0.5, y: c.i + 0.5 }).some(z => z.key[0] === "c"))) return out;
  if (Math.hypot(Math.max(Math.abs(at.x - choke.x) - 0.5, 0), Math.max(Math.abs(at.y - choke.y) - 0.5, 0)) > LEAD.plug + EPS) return out;
  const [p, q] = choke.key.slice(1).split(",").map(Number);
  const through = choke.key[0] === "c" ? (a, b) => b.i === p && b.j === q
    : choke.key[0] === "v" ? (a, b) => Math.min(a.i, b.i) === p && Math.max(a.i, b.i) === p + 1 && (a.j === q || b.j === q)
      : (a, b) => Math.min(a.j, b.j) === q && Math.max(a.j, b.j) === q + 1 && (a.i === p || b.i === p);
  for (const c of mine) {
    for (const [k, d] of flood(c, (a, b) => step(a, b) && !occ(b) && !through(a, b), 4)) if (d <= LEAD.beside + EPS) out.add(k);
  }
  return out;
}

/**
 * @param {object} o
 * @param {{ id, w, h, r, start }} o.leader
 * @param {{x,y}} o.at                   where the leader rests
 * @param {{ x, y, w, h }} o.target      the token dropped on
 * @param {{x,y,r}[]} o.standing         the tokens standing outside the group (the target among them)
 * @param {(m, c) => boolean} o.walkable can m stand with its centre at c?
 * @param {(a, b) => boolean} o.step
 * @param {(m, from, to, avoid) => {x,y}[]|null} o.route  a route round `avoid` circles (their own radius), or null
 */
export function swarmBreaches({ leader, at, target, standing, walkable, step, route }) {
  const T = footprintCells(target, target.w ?? 1, target.h ?? target.w ?? 1);
  const touching = s => footprintCells(s, leader.w, leader.h).some(c => T.some(f => Math.max(Math.abs(f.i - c.i), Math.abs(f.j - c.j)) === 1));
  if (touching(at)) return [];
  const cands = new Map();
  for (const f of T) for (let di = -leader.h; di <= 1; di++) for (let dj = -leader.w; dj <= 1; dj++) {
    const c = { x: f.j + dj + leader.w / 2, y: f.i + di + leader.h / 2 };
    if (touching(c) && footprintCells(c, leader.w, leader.h).every(q => !T.some(t => t.i === q.i && t.j === q.j))) cands.set(`${c.x},${c.y}`, c);
  }
  for (const c of cands.values()) {
    if (!walkable(leader, c) || standing.some(s => dist(c, s) < s.r + leader.r - EPS)) continue;
    const touchOk = footprintCells(c, leader.w, leader.h).some(q => T.some(t => Math.max(Math.abs(t.i - q.i), Math.abs(t.j - q.j)) === 1 && step(t, q)));
    if (!touchOk) continue;
    if (route(leader, leader.start, c, standing)) return [{ rule: "swarm", id: leader.id, free: c, took: at }];
  }
  return [];
}
