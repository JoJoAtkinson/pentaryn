/**
 * The module as the simulator runs it (0.9.0; Fable's review 2 §4 step 5): one instance per virtual client. The
 * decisions are the module's own pure code, called as drop.mjs / file.mjs call it:
 *   - a group drop out of combat: file-core planLead (0.10 L1, the leader rule: the shape from where it lands, every
 *     member's slot and route) and staggerFile (0.10 L2, R5: the leader at once, the pack a wave later, single file at
 *     a narrow point), motion-core waves (the batches), group-core freePrefix (a wave's member goes its whole way, or
 *     stays, named);
 *   - a group drop in a fight: planLead's order (the leader, then least walk left), one member at a time, each one's
 *     square picked at its turn (planLead for that one member: behind where the leader came to rest, or round the
 *     target);
 *   - routes: the real pathfind-core A* (test/fixtures/grid.mjs gridWorld), round the tokens standing as this client
 *     sees them, a fight's on whole squares with motion-core cellChain (a checkpoint every square).
 *   - a stop (0.10 L3 fix round): its writes in one update (stop.mjs stopBatched, the engine's `batched`), its tokens
 *     settled together when one by one they would rest inside each other (motion-core spotsAlong, settleAlong);
 * What is left here is the wiring the glue does with Foundry (each function names the one it stands for): the wave
 * timers, the three handlers (a click stops the group, a door shut stops the walkers it crosses, a hidden tab sends
 * its waves at once), the fight queue's wait and watchdog, onPreMove's per-square test. No Promises: every wait is a
 * callback on the fake clock, so a seed replays exactly.
 */

import { planLead, routeEnters, staggerFile, STAGGER } from "../../file-core.mjs";
import { clearAlong, fightWalk, settleAlong, shutBlocked, spotsAlong, stopOrder, waves as wavesOf, cellChain } from "../../motion-core.mjs";
import { freePrefix, pathLength } from "../../group-core.mjs";
import { dist, SPEED } from "./engine.mjs";
import { crosses } from "./maps.mjs";

const ROUTE_MS = 1.5;                 // the plan's clock: ms per route search (Node measured 8 members in 4 ms)
const FIGHT_WATCH_MS = 3000;          // drop.mjs FIGHT_WATCH_MS
const PAST_DOOR = 1.5;                // stop.mjs PAST_DOOR_SQUARES
const HOLD_MS = 60000;                // file.mjs HOLD_MS

/** Distance from point p to segment a-b. */
export function segDist(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

/** drop.mjs onSquares: every square between two whole-square corners put in (a fight's update is one square). */
export function onSquares(points) {
  const out = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const di = Math.round(b.y - a.y), dj = Math.round(b.x - a.x);
    if (Math.abs(di - (b.y - a.y)) > 1e-6 || Math.abs(dj - (b.x - a.x)) > 1e-6) { out.push(b); continue; }
    for (const c of cellChain([{ i: 0, j: 0 }, { i: di, j: dj }]).slice(1)) out.push({ x: a.x + c.j, y: a.y + c.i });
  }
  return out.filter((p, k) => k === 0 || dist(p, out[k - 1]) > 1e-9);
}

/** group-adapter movementLeft: squares of movement left this turn (speed in ft less what it walked), null: no usable speed. */
export const movementLeft = d => (d?.walk > 0 ? Math.max(0, d.walk / 5 - (d.cost ?? 0)) : null);

export class Movement {
  constructor(c, env) {
    Object.assign(this, { c, env });
    this.groups = new Map();          // file.mjs groups: gid → { ids, waves, queue, seq }
    this.groupOf = new Map();
    this.tags = new Map();            // file.mjs tagOf: id → { gid, user, at }
    this.latestDrop = new Map();
    this.seq = 0;
    this.walkOn = new Map();
    this.inFlight = new Map();        // drop.mjs inFlight: id → where this client just sent it (echo not back)
    this.lateStops = new Map();       // file.mjs lateStops: id → until (a stopped group's member whose wave was in flight)
    this.lastSeen = new Map();        // drop.mjs lastWriteAt: id → when this client last saw it move
    c.listeners.push(msg => this.onBroadcast(msg));
    c.preStep = (id, a, b) => this.preStep(id, a, b);
    c.reloadListeners = [() => this.onReload()];
    for (const h of c.hidden) c.exec(h.a, () => this.onHidden());
  }
  get now() { return this.c.sim.now; }
  doc(id) { return this.c.view.get(id); }
  moving(id) { const d = this.doc(id); return !!d && (this.c.animating(id) || d.mv?.state === "pending"); }
  grid(combat) { return this.env.world.grid(this.c.doors, combat); }
  /** group-adapter othersOf: every token outside `ids` where this client's documents have it (circles, squares). */
  othersOf(ids) {
    const skip = new Set(ids);
    return [...this.c.view.values()].filter(d => !skip.has(d.id)).map(d => ({ x: d.x, y: d.y, r: d.r, id: d.id }));
  }
  named(ids, why) { if (ids.length) this.env.record("named", { client: this.c.id, ids: [...ids], why }); }
  /** The nearest free spot to `p` (whole squares, walking out from it), or null (group-adapter clearOfWalls). */
  nearestFree(m, p, taken, g) {
    const seen = new Set([`${p.x},${p.y}`]);
    const open = [p];
    while (open.length) {
      const q = open.shift();
      if (dist(q, p) > 6) break;
      if (g.walkable(m, q) && !taken(q)) return q;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const n = { x: q.x + dx, y: q.y + dy };
        const key = `${n.x},${n.y}`;
        if (seen.has(key) || !g.lineFits(q, n, m.w, m.h)) continue;
        seen.add(key);
        open.push(n);
      }
    }
    return null;
  }
  route(g, m, from, to, avoid) {
    const live = avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(o => dist(o, from) >= o.r);
    return g.route(m, from, to, { avoid: live })?.points ?? null;
  }
  noteDrop(ids, combat, leader = null) {
    const seq = ++this.seq;
    for (const id of ids) this.latestDrop.set(id, seq);
    const seen = Object.fromEntries(ids.map(id => [id, 0]));
    for (const [id, ord] of this.c.seen) seen[id] = ord;
    this.env.drops.push({ client: this.c.id, ids: [...ids], t0: this.now, combat, seq, leader, seen: new Map(this.c.seen),
      left: Object.fromEntries(ids.map(id => [id, movementLeft(this.doc(id))])) });
    return seq;
  }
  hold(ids, seq) {
    const gid = `${this.c.id}g${seq}`;
    for (const id of ids) this.groupOf.set(id, gid);
    const g = { gid, ids: new Set(ids), waves: [], queue: null, seq };
    this.groups.set(gid, g);
    return g;
  }

  /* ---- drop.mjs singleDrop / aroundOthers (tier A) ---- */
  dropSingle(id, dest) {
    const combat = this.env.server.inCombat;
    const seq = this.noteDrop([id], combat);
    const d = this.doc(id);
    const m = { id, w: d.w, h: d.h, r: d.r };
    const g = this.grid(combat);
    const others = this.othersOf([id]);
    const taken = p => others.some(o => dist(p, o) < o.r + m.r - 0.01);
    let end = dest;
    if (taken(end) || !g.walkable(m, end)) end = this.nearestFree(m, dest, taken, g);
    const pts = end ? this.route(g, m, { x: d.x, y: d.y }, end, others) : null;
    if (!pts || pts.length < 2) { this.named([id], "noRoute"); return; }
    const wps = (combat ? onSquares(pts) : pts).slice(1);
    this.env.record("slot", { client: this.c.id, id, slot: { ...pts.at(-1) }, pts, others: others.map(o => `${o.id}@${o.x},${o.y}`) });
    this.c.move(id, wps, { combat, options: { seq } });
  }

  /* ---- drop.mjs groupDrop + file.mjs planDrop (the leader plan, B1) ---- */
  /** file.mjs targetOf: the token outside the group the drop lands on (every token is visible in the simulator). */
  targetOf(ids, dest) {
    const skip = new Set(ids);
    // Inside its box (its top-left edge in, as file.mjs reads the drop's centre); a hidden token never (R2).
    const d = [...this.c.view.values()].find(o => !skip.has(o.id) && !o.hidden && dest.x >= o.x - o.w / 2 && dest.x < o.x + o.w / 2 && dest.y >= o.y - o.h / 2 && dest.y < o.y + o.h / 2);
    return d ? { id: d.id, x: d.x, y: d.y, w: d.w, h: d.h } : null;
  }
  /** file.mjs oraclesFor's step: one step between neighbouring squares (walls; a diagonal past a wall corner is shut). */
  stepOf(g) { return g.stepOpen ?? ((a, b) => g.free(b.i, b.j) && (a.i === b.i || a.j === b.j || (g.free(a.i, b.j) && g.free(b.i, a.j)))); }
  dropGroup(ids, anchorId, dest) {
    const combat = this.env.server.inCombat;
    // 0.10 L2: a new drop no longer empties this client's fight queues (a member dropped again is skipped there).
    const seq = this.noteDrop(ids, combat, anchorId);
    const members = ids.map(id => { const d = this.doc(id); return { id, w: d.w, h: d.h, r: d.r, speed: SPEED, start: { x: d.x, y: d.y } }; });
    const g = this.grid(combat);
    const target = this.targetOf(ids, dest);
    if (combat) return this.fightFile(members, anchorId, dest, target, seq);
    let clock = 0;
    const route = (m, from, to, avoid) => { clock += ROUTE_MS; return this.route(g, m, from, to, avoid); };
    const plan = planLead({ members, leaderId: anchorId, drop: dest, target, standing: this.othersOf(ids) }, { walkable: g.walkable, step: this.stepOf(g), route, now: () => clock });
    const walks = plan.order.map(id => members.find(m => m.id === id))
      .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
      .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed, left: plan.members[m.id].left }));
    const capMs = Math.max(0, Math.floor((STAGGER.capMs - plan.ms) / STAGGER.stepMs) * STAGGER.stepMs);
    const timing = staggerFile(walks, { capMs, leaderId: plan.leader, step: this.stepOf(g), fifo: !this.env.noFifo });
    this.env.record("plan", { client: this.c.id, seq, ms: plan.ms, shape: plan.shape, leader: plan.leader, target: plan.target, none: plan.none,
      behind: plan.behind, lastStep: plan.lastStep, choke: plan.choke, targetBox: target, standing: this.othersOf(ids), doors: new Map(this.c.doors), combat: false,
      members: members.map(m => ({ id: m.id, w: m.w, h: m.h, r: m.r, start: { ...m.start } })),
      searches: plan.searches, failed: plan.failed, stayed: plan.stayed, delays: timing.delays,
      slots: Object.fromEntries(members.map(m => [m.id, plan.members[m.id]?.slot ?? m.start])),
      why: Object.fromEntries(plan.stayed.map(id => [id, plan.members[id].stay])) });
    // The plan runs inside the drop handler (synchronous); then the drop's own update goes.
    {
      this.named(plan.stayed, plan.none ? "noRoute" : "stayed");
      // A member whose best square is the one it stands on is in place: neither sent nor named (0.10 L1).
      const there = members.filter(m => plan.members[m.id]?.atStart).map(m => m.id);
      if (there.length) this.env.record("there", { client: this.c.id, ids: there });
      if (!walks.length) return;
      const grp = this.hold(walks.map(w => w.id), seq);
      grp.t0 = this.now;
      grp.starts = new Map(members.map(m => [m.id, { ...m.start }]));
      grp.wps = new Map(walks.map(w => [w.id, w.points.slice(1)]));
      grp.ends = new Map(walks.map(w => [w.id, { ...w.points.at(-1) }]));
      grp.stayed = new Set();
      const now0 = walks.filter(w => !(timing.delays[w.id] > 0));
      for (const w of now0) this.inFlight.set(w.id, { ...w.points.at(-1), at: this.now });
      if (now0.length) this.c.moveMany(now0.map(w => ({ id: w.id, waypoints: w.points.slice(1) })), { options: { gid: grp.gid, seq } });
      const later = Object.fromEntries(walks.filter(w => timing.delays[w.id] > 0).map(w => [w.id, timing.delays[w.id]]));
      for (const w of wavesOf(later)) {
        const wave = { at: w.at, ids: w.ids, timer: null };
        wave.timer = this.c.setTimeout(() => this.fireWaves(grp, [wave]), w.at);
        grp.waves.push(wave);
      }
    }
  }
  /** file.mjs fireWaves → drop.mjs sendWave. */
  fireWaves(grp, list) {
    if (this.groups.get(grp.gid) !== grp) return;
    for (const w of list) this.c.clearTimeout(w.timer);
    grp.waves = grp.waves.filter(w => !list.includes(w));
    const ids = list.flatMap(w => w.ids);
    const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
    const circle = (id, p) => ({ x: p.x, y: p.y, r: this.doc(id).r, id });
    const live = ids.filter(id => {
      const d = this.doc(id), at = grp.starts.get(id);
      // stillOurs: not moved since the drop and not dropped again.
      const ok = d && this.latestDrop.get(id) === grp.seq && d.x === at.x && d.y === at.y;
      if (!ok) this.env.record("skipped", { client: this.c.id, id });
      return ok;
    });
    // drop.mjs sendWave (0.9.0 step 5): mates resting off their plan (cut, stopped) or left where they stand by an
    // earlier wave are in this wave's way too; and (0.10 L3) where this client's stops are carrying tokens on to.
    const others = this.othersOf([...grp.ids]);
    for (const [oid, w] of this.env.noPendingEnds ? [] : this.walkOn) if (w.target && !w.sent && this.now - w.at <= 3000) others.push({ x: w.target.x, y: w.target.y, r: this.doc(oid).r, id: oid });
    const fix = !this.env.noWaveRests;
    for (const id of fix ? grp.ids : []) {
      if (live.includes(id)) continue;
      const d = this.doc(id);
      if (!d || this.moving(id)) continue;
      const end = grp.ends.get(id), start = grp.starts.get(id);
      const here = { x: d.x, y: d.y };
      if ((!same(here, end) && !same(here, start)) || grp.stayed.has(id)) others.push(circle(id, here));
    }
    // drop.mjs sendWave (0.10 L1, R12): each member goes its whole way, or stays where it stands, named (a door shut
    // across it since, or a token at rest in it); one that stays is in the way of the ones after it.
    const items = [], shut = [];
    // drop.mjs sendWave (0.10 L3): one that stays is in the way of every other member of the wave, round again.
    const stays = new Set();
    for (let again = true; again;) {
      again = false;
      for (const id of live) {
        if (stays.has(id)) continue;
        const at = grp.starts.get(id), wps = grp.wps.get(id);
        const whole = this.c.doorCut(at, wps) < 0 && freePrefix([at, ...wps], this.doc(id).r, others).full;
        if (!whole) { stays.add(id); shut.push(id); grp.stayed.add(id); if (fix) others.push(circle(id, at)); again = !this.env.noWaveAgain; }
      }
    }
    for (const id of live) if (!stays.has(id)) items.push({ id, waypoints: grp.wps.get(id) });
    this.named(shut, "wave");
    for (const it of items) this.inFlight.set(it.id, { ...it.waypoints.at(-1), at: this.now });
    if (items.length) this.c.moveMany(items, { options: { gid: grp.gid, seq: grp.seq } });
  }
  /** file.mjs onVisibility: a tab going to the background sends every remaining wave now. */
  /**
   * file.mjs onVisibility (0.10 L3): a tab going to the background keeps its waves in order on their own timers (a
   * hidden tab fires them on whole seconds); one due past 3 s after the drop is timed for 3 s, so the last goes by 4 s.
   * (`bgFlush`: 0.8 to L2's flush of every wave at once, for the regression proof.)
   */
  onHidden() {
    if (this.env.bgFlush) { for (const g of [...this.groups.values()]) if (g.waves.length) this.fireWaves(g, [...g.waves]); return; }
    for (const g of [...this.groups.values()]) {
      for (const w of [...g.waves]) {
        const at = g.t0 + w.at;
        if (at <= g.t0 + 3000) continue;
        this.c.clearTimeout(w.timer);
        w.timer = this.c.setTimeout(() => this.fireWaves(g, [w]), Math.max(0, g.t0 + 3000 - this.now));
      }
    }
  }
  onReload() { this.groups.clear(); this.groupOf.clear(); this.env.record("reload", { client: this.c.id }); }

  /* ---- drop.mjs fightFile / runFight / routeAtTurn / walkOne ---- */
  fightFile(members, leaderId, dest, target, seq) {
    // file.mjs fightPlan: the order (planLead with no search: the leader, then least walk left).
    const g0 = this.grid(true);
    const plan = planLead({ members, leaderId, drop: dest, target, standing: this.othersOf(members.map(m => m.id)) }, { walkable: g0.walkable, step: this.stepOf(g0) });
    // file.mjs fightPlan (0.10 L3, R7): the leader, then least walk left.
    const order = plan.byWalk?.length ? plan.byWalk : plan.order;
    const entries = order.map(id => ({ ...members.find(m => m.id === id), leader: id === leaderId, dest }));
    if (!entries.length) return;
    const grp = this.hold(entries.map(e => e.id), seq);
    const q = { k: 0, done: false, why: null, entries, current: null, grp, shape: plan.shape, target, leaderId, leaderAt: null, ids: new Set(entries.map(e => e.id)) };
    grp.queue = q;
    this.env.record("queue", { client: this.c.id, seq, order, shape: plan.shape });
    this.c.exec(this.now, () => this.nextInQueue(q));
  }
  endQueue(q, why) {
    if (q.done) return;
    q.done = true; q.why = why;
    if (q.watch) this.c.clearTimeout(q.watch);
    const left = q.entries.slice(q.k + (q.current ? 1 : 0)).map(e => e.id);
    if (left.length && ["turn", "deleted", "stopped"].includes(why)) this.named(left, `fight:${why}`);
    if (left.length && !["turn", "deleted", "stopped"].includes(why)) this.env.record("excused", { client: this.c.id, ids: left, why });
    if (q.grp.queue === q) q.grp.queue = null;
  }
  nextInQueue(q) {
    if (q.done) return;
    if (q.current) q.k += 1;
    q.current = null;
    if (q.k >= q.entries.length) { q.done = true; q.why = "done"; q.grp.queue = null; return; }
    const e = q.entries[q.k];
    const d = this.doc(e.id);
    if (!d) return this.endQueue(q, "deleted");
    if (this.latestDrop.get(e.id) !== q.grp.seq || d.x !== e.start.x || d.y !== e.start.y) {
      this.env.record("skipped", { client: this.c.id, id: e.id });
      q.k += 1; return this.nextInQueue(q);
    }
    // drop.mjs routeAtTurn: the march leader to its drop square (on a token, or where it cannot stand: the nearest
    // clear one); everyone else to the square file.mjs slotAtTurn picks then (planLead for that one member, every
    // other token standing where it is now); one route round them all.
    const g = this.grid(true);
    const others = this.othersOf([e.id]);
    const taken = p => others.some(o => dist(p, o) < o.r + e.r - 0.01);
    let end = null, judge = null;
    if (e.leader && q.shape === "march") end = taken(e.dest) || !g.walkable(e, e.dest) ? this.nearestFree(e, e.dest, taken, g) : e.dest;
    else {
      const leader = q.shape === "march" && q.leaderAt ? { ...q.entries.find(x => x.leader), start: { ...q.leaderAt.at } } : null;
      if (q.shape !== "march" || leader) {
        const list = leader ? [leader, { ...e, start: { x: d.x, y: d.y } }] : [{ ...e, start: { x: d.x, y: d.y } }];
        const p = planLead({ members: list, leaderId: leader?.id ?? e.id, target: q.shape === "swarm" ? q.target : null,
          leaderAt: leader ? q.leaderAt : null, standing: others.filter(o => o.id !== leader?.id) }, { walkable: g.walkable, step: this.stepOf(g) });
        const x = p.members[e.id];
        end = x && !x.stay ? x.slot : null;
        // What the shape judge needs (scenario.mjs `shape`): the rule as this turn saw it.
        judge = { shape: q.shape, behind: p.behind, lastStep: p.lastStep, leaderAt: leader ? { ...q.leaderAt.at } : null, leader: leader ? { id: leader.id, w: leader.w, h: leader.h, r: leader.r } : null,
          member: { id: e.id, w: e.w, h: e.h, r: e.r, start: { x: d.x, y: d.y } }, standing: others.filter(o => o.id !== leader?.id), targetBox: q.target, doors: new Map(this.c.doors) };
      }
    }
    let pts = null, why = end ? "fight:noRoute" : "fight:noSpot";
    // The leader walks through its own group's members (R6), never through anyone else.
    const avoid = e.leader ? others.filter(o => !q.ids.has(o.id)) : others;
    if (end && dist(end, e.start) <= 1e-6) why = "fight:there";
    else if (end) { pts = this.route(g, e, e.start, end, avoid); if (!(pts?.length >= 2)) pts = null; }
    if (!pts && e.leader && why !== "fight:there") {
      // The leader with no way: nobody moves, "No route there" (R10).
      this.named(q.entries.slice(q.k).map(x => x.id), "fight:noRoute");
      return this.endQueue(q, "noRoute");
    }
    if (!pts) {
      if (why === "fight:there") this.env.record("there", { client: this.c.id, ids: [e.id] });
      else this.named([e.id], why);
      if (e.leader) q.leaderAt = { at: { x: d.x, y: d.y }, from: { x: d.x, y: d.y } };
      q.k += 1; return this.nextInQueue(q);
    }
    // drop.mjs fightSteps (0.10 L3, R6 / R7): a checkpoint on every free square only (the leader inside its members),
    // cut at the last free square its movement this turn pays for (speed in ft less what it walked this turn).
    let wps = onSquares(pts).slice(1);
    const planned = wps.length;
    const left = movementLeft(d);
    const fw = fightWalk(wps.length + 1, { free: k => !others.some(o => dist(wps[k - 1], o) < o.r + e.r - 0.02), costs: [...Array(wps.length + 1).keys()], left });
    wps = wps.slice(0, fw.end).map((p, k) => ({ ...p, checkpoint: fw.checkpoints[k + 1] }));
    if (wps.length) wps[wps.length - 1].checkpoint = true;
    this.env.record("slot", { client: this.c.id, id: e.id, slot: { ...pts.at(-1) }, end: wps.length ? { ...wps.at(-1) } : { x: d.x, y: d.y }, planned, sent: fw.end, left, short: fw.short, lead: e.leader, judge });
    if (fw.short && fw.why === "speed") this.named([e.id], "fight:speed");
    if (!wps.length) {
      if (e.leader) q.leaderAt = { at: { x: d.x, y: d.y }, from: { x: d.x, y: d.y } };
      q.k += 1; return this.nextInQueue(q);
    }
    q.current = e.id;
    const mv = this.c.move(e.id, wps, { combat: true, options: { gid: q.grp.gid, seq: q.grp.seq, ...(e.leader ? { lead: true } : {}) } });
    if (!mv) return this.endQueue(q, "stopped");
    const walkMs = (pathLength(pts) / SPEED) * 1000;
    let settled = false;
    const go = how => {
      if (settled || q.done) return;
      settled = true;
      this.c.clearTimeout(q.watch);
      if (how === "timeout") this.env.record("watchdog", { client: this.c.id, id: e.id });
      if (how === "stopped") return this.endQueue(q, "stopped");
      if (e.leader) {
        // drop.mjs runFight: where the leader came to rest and the square its last step came from.
        const here = this.doc(e.id), path = [e.start, ...wps];
        let k = path.length - 1;
        while (k > 0 && dist(path[k], here) > 1e-6) k -= 1;
        q.leaderAt = { at: { x: here.x, y: here.y }, from: k > 0 ? { ...path[k - 1] } : { ...e.start } };
      }
      this.nextInQueue(q);
    };
    q.watch = this.c.setTimeout(() => go("timeout"), walkMs + FIGHT_WATCH_MS);
    // core's move promise (the last square on the server, or stopped), then movementAnimationPromise.
    const poll = () => {
      if (settled || q.done) return;
      if (this.c.moves.get(e.id) === mv && !mv.stopped) { this.c.setTimeout(poll, 16); return; }
      if (mv.stopped) return go("stopped");
      this.c.whenDrawnAtRest(e.id, () => go("walked"));
    };
    this.c.setTimeout(poll, 16);
  }
  /** stop.mjs stopAll (0.10 L3): one stop's walkers, the front ones first (motion-core stopOrder). */
  stopOrdered(ids) {
    if (this.env.noOrder) return ids;
    const items = ids.map(id => {
      const way = this.c.wayAhead(id);
      const at = way[0] ?? this.c.drawn(id);
      const nx = way.find((q, k) => k > 0 && dist(q, at) > 1e-6);
      const L = nx ? dist(nx, at) : 0;
      return { id, at, r: this.doc(id)?.r ?? 0.5, dir: L > 1e-9 ? { x: (nx.x - at.x) / L, y: (nx.y - at.y) / L } : null };
    });
    return stopOrder(items, { margin: 1.5 });
  }
  /** drop.mjs leadThrough: the group of a fight queue this client runs whose leader `id` is walking now. */
  leadThrough(id) {
    for (const g of this.groups.values()) if (g.queue && g.queue.leaderId === id && g.queue.current === id) return g.queue.ids;
    return null;
  }
  /** file.mjs cancelQueues (a new drop, a turn change, the fight's end). */
  cancelQueues(why) { for (const g of this.groups.values()) if (g.queue) this.endQueue(g.queue, why); }

  /** drop.mjs onPreMove, a fight's next square: never into a token standing still on this page (the leader passes its own members). */
  preStep(id, a, b) {
    const me = this.doc(id);
    const through = this.leadThrough(id);
    if (this.env.debugSteps) this.env.record("pre", { client: this.c.id, id, a, b, view: [...this.c.view.values()].filter(o => o.id !== id && dist(o, b) < 2).map(o => ({ id: o.id, x: o.x, y: o.y, moving: this.moving(o.id), st: o.mv?.state })) });
    for (const o of this.c.view.values()) {
      if (o.id === id || through?.has(o.id)) continue;
      const rr = me.r + o.r - 0.02;
      if (dist(a, o) < rr) continue;
      // 0.10 L3: a walker passing is no block, but its own square (where its document is) is.
      if (this.moving(o.id)) {
        // drop.mjs stepMeetsStanding (0.10 L3): its own square, when it rests there (its last square) or is held up.
        const held = o.mv?.state !== "pending" || this.now - (this.lastSeen.get(o.id) ?? 0) > 500;
        if (!this.env.noOwnSquare && held && dist(b, o) < rr) { this.env.record("cut", { client: this.c.id, why: "step", id, against: o.id }); return false; }
        continue;
      }
      if (segDist(o, a, b) < rr) { this.env.record("cut", { client: this.c.id, why: "step", id, against: o.id }); return false; }
    }
    return true;
  }

  /* ---- stop.mjs stopToken (a click) and file.mjs onGroupTag ---- */
  click(id) { return this.batch(() => this.clickNow(id)); }
  clickNow(id) {
    const d = this.doc(id);
    if (!d || !this.moving(id) || !(this.c.isGM || d.owner === this.c.id)) return null;
    const combat = this.env.server.inCombat;
    const held = this.groupOf.has(id) && this.groups.has(this.groupOf.get(id));
    const tag = this.tags.get(id);
    const members = held ? [...this.groups.get(this.groupOf.get(id)).ids] : tag ? [...this.tags].filter(([, t]) => t.gid === tag.gid).map(([k]) => k) : [id];
    const sender = held ? this.c.id : tag?.user ?? null;
    const senderHere = !!sender && sender !== this.c.id && !this.env.clients.find(x => x.id === sender)?.offlineAt(this.now);
    const owns = x => this.c.isGM || this.doc(x)?.owner === this.c.id;
    const list = senderHere ? [id] : [id, ...members.filter(x => x !== id && owns(x))];
    if (held) this.cancelGroup(id, "click");
    const out = [];
    const group = { skip: new Set(this.env.noStopClear ? list : list.filter(t => this.c.animating(t))), claims: [] };
    for (const t of combat ? list : this.stopOrdered(list)) {
      if (combat) {
        // stop / query: this client's own move stops; another's is asked of whoever started it (400 ms).
        if (this.doc(t)?.mv?.user === this.c.id) { this.c.stopMovement(t); out.push(t); }
        else if (t === id) {
          const starter = this.env.mods.get(this.doc(t)?.mv?.user);
          const lag = this.env.server.net.delay() * 2;
          this.c.sim.after(lag, () => starter?.c.exec(this.c.sim.now, () => starter.stopGroupHere(t, "query", true)));
          out.push(t);
        }
        continue;
      }
      if (!this.c.animating(t)) continue;
      this.displace(t, { gid: tag?.gid ?? this.groupOf.get(t) ?? null }, group);
      out.push(t);
    }
    if (!combat) this.stopAlso(group);
    this.env.record("stop", { client: this.c.id, id, members: out, held, senderHere });
    return out;
  }
  /** file.mjs groupCancel / dropGroup. */
  cancelGroup(id, why) {
    const gid = this.groupOf.get(id);
    const g = gid ? this.groups.get(gid) : null;
    if (!g) return [];
    for (const w of g.waves) this.c.clearTimeout(w.timer);
    // file.mjs markLate: a member this client has just sent and that is not moving yet stops when its write is back.
    for (const x of g.ids) {
      const f = this.inFlight.get(x);
      if (f && this.now - f.at <= 3000 && !this.moving(x)) this.lateStops.set(x, this.now + 3000);
    }
    const unsent = g.waves.flatMap(w => w.ids);
    if (unsent.length) this.env.record("excused", { client: this.c.id, ids: unsent, why });
    g.waves = [];
    if (g.queue) this.endQueue(g.queue, why);
    for (const x of g.ids) if (this.groupOf.get(x) === gid) this.groupOf.delete(x);
    this.groups.delete(gid);
    return [...g.ids];
  }
  /**
   * file.mjs stopGroupHere: the dragger's screen stops every member still walking; never one where the stopped one
   * will rest when its stop carries it on (its write names the spot, `restAt`; 0.10 L2 fix (b)).
   */
  stopGroupHere(id, why, self = false, restAt = null, stopped = []) {
    return this.batch(() => {
      const ids = this.cancelGroup(id, why);
      // The other tokens the same foreign stop wrote (one update) are that user's to stop (0.10 L3 fix round).
      const theirs = new Set(stopped.filter(x => x !== id));
      const list = ids.filter(x => (x !== id || self) && !theirs.has(x) && this.doc(x)?.mv?.user === this.c.id && this.moving(x));
      const group = { skip: new Set(list.filter(x => this.c.animating(x))), claims: [] };
      // Where the foreign stop carries each of its tokens on to (its write names them by id).
      for (const [oid, at] of Object.entries(this.env.noStopAt ? {} : restAt ?? {})) {
        if (at && Number.isFinite(at.x)) group.claims.push({ id: oid, x: at.x, y: at.y, r: this.doc(oid)?.r ?? 0.5 });
      }
      for (const x of this.env.server.inCombat ? list : this.stopOrdered(list)) {
        if (this.env.server.inCombat) this.c.stopMovement(x);
        else if (this.c.animating(x)) this.displace(x, {}, group);
      }
      this.stopAlso(group);
    });
  }
  /**
   * stop.mjs's batch (0.10 L3 fix round): one stop's unanimated writes go as one update, and before they go the stop's
   * tokens are settled together when the one-by-one stop left two inside each other or a walk on through one at rest
   * (settle); a token still inside another after that is named.
   */
  batch(fn) {
    if (this.env.noBatch || this.batching) return fn();
    this.batching = new Set();
    this.later = new Map();
    try {
      return this.c.batched(() => {
        const out = fn();
        for (let round = 0; round < 3; round++) {
          let more = false;
          for (const g of this.batching) {
            this.settle(g);
            if (!this.env.server.inCombat && this.stopAlso(g).length) more = true;
          }
          if (!more) break;
        }
        return out;
      });
    } finally {
      const later = this.later;
      const groups = [...this.batching];
      // stop.mjs: a stop's tokens stay known for a walk on's second look (3 s).
      this.recent = [...(this.recent ?? []).filter(x => this.now - x.at <= 3000), ...groups.map(group => ({ group, at: this.now }))];
      this.batching = null; this.later = null;
      for (const [id, why] of later) {
        const k = groups.flatMap(g => g.claims).find(c => c.id === id);
        const rw = this.restsFor(id, new Set([id]), groups.flatMap(g => g.claims).filter(c => c.id !== id));
        if (!k || rw.rest.some(c => dist(k, c) < k.r + c.r - 0.01)) this.named([id], why);
      }
    }
  }
  /** A stop's notice that waits for the batch's settle (the module's displace names it at the flush). */
  nameLater(id, why) { if (this.later) this.later.set(id, why); else this.named([id], why); }
  /**
   * stop.mjs settle (0.10 L3 fix round): when one stop's tokens, each settled in turn, are left inside each other or
   * inside a token at rest, or one's walk on passes through where another rests, all of them are settled together,
   * each along its own way (motion-core spotsAlong, settleAlong); none found: as they are.
   */
  settle(group, depth = 0) {
    if (this.env.noSettle) return;
    const ks = group.claims.filter(k => k.from && k.way);
    if (!ks.length) return;
    const ids = new Set([...group.skip, ...ks.map(k => k.id)]);
    const lines = this.env.world.map.doors;
    const info = ks.map(k => {
      const d = this.doc(k.id);
      // Not the stop's own tokens; still the spots it gave out to others (another user's stop named, one walking on).
      const rw = this.restsFor(k.id, ids, group.claims.filter(c => !ks.includes(c)));
      const statics = rw.rest.filter(c => !ids.has(c.id) || !ks.some(o => o.id === c.id));
      const own = rw.walkers.filter(w => w.own && !ids.has(w.id));
      return { k, d, rw, statics, own };
    });
    const pathOf = k => [k.from, ...(this.walkOn.get(k.id)?.mid === k.mid ? this.walkOn.get(k.id).wps : [])];
    const near = (a, b, rr) => dist(a, b) < rr - 0.01;
    const crossed = (k, o) => {
      const path = pathOf(k);
      if (path.length < 2 || dist(path[0], o) < k.r + o.r - 0.05 || this.leading(k.id)?.has(o.id)) return false;
      for (let j = 1; j < path.length; j++) if (segDist(o, path[j - 1], path[j]) < k.r + o.r - 0.01) return true;
      return false;
    };
    const wrong = info.some(({ k, statics }) => statics.some(c => near(k, c, k.r + c.r))
      || ks.some(o => o !== k && (near(k, o, k.r + o.r) || crossed(k, o))));
    if (!wrong) return;
    const blockers = new Set();
    const items = info.map(({ k, d, rw, statics, own }) => {
      const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
      const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
      const mates = this.leading(k.id);
      const cands = spotsAlong({ drawn: k.from, ahead: k.way.ahead, behind: k.way.behind,
        free: p => !across(p) && !inside(statics)(p) && !inside(rw.walkers.filter(w => !ids.has(w.id)))(p),
        enters: (from, p) => {
          const c = [...statics, ...own].find(c => !mates?.has(c.id) && dist(p, c) < d.r + c.r - 0.01 && !(dist(from, c) < d.r + c.r - 0.05));
          if (c && own.includes(c)) blockers.add(c.id);
          return !!c;
        },
        wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0, step: 0.05, aheadMax: PAST_DOOR, behindMax: Infinity });
      return { id: k.id, r: d.r, drawn: k.from, mates, cands };
    });
    const out = settleAlong(items);
    this.env.record("settle", { client: this.c.id, ids: ks.map(k => k.id), solved: !!out });
    // Unsettled with one of this screen's own walkers in the way of a token's walk on: the same stop stops it too, and
    // they are settled again together.
    if (!out && blockers.size && depth < 2 && !this.env.noSettleWalkers) {
      for (const id of this.stopOrdered([...blockers])) { group.skip.add(id); this.displace(id, {}, group); }
      return this.settle(group, depth + 1);
    }
    if (!out) return;
    for (const k of ks) {
      const { p, via } = out.get(k.id);
      k.x = p.x; k.y = p.y;
      const moved = dist(p, k.from) > 1e-9;
      if (moved) this.walkOn.set(k.id, { mid: k.mid, wps: [...via, p], extra: k.extra, target: { ...p }, at: this.now, from: { ...k.from }, way: k.way });
      else if (this.walkOn.get(k.id)?.mid === k.mid) this.walkOn.delete(k.id);
      const b = this.c.batch?.find(x => x.item.id === k.id && x.item.mid === k.mid);
      if (b) b.options = { ...b.options, stopAt: moved ? { [k.id]: { x: p.x, y: p.y } } : undefined };
    }
  }
  /** The leader of a drop this client's view has moving (0.10 R6): file.mjs groupMembers + ghost.mjs leading. */
  leading(id) {
    let d = null;
    for (const x of this.env.drops) if (x.ids.includes(id)) d = x;
    return !!d && d.leader === id && d.ids.length > 1 && this.c.animating(id) ? new Set(d.ids.filter(x => x !== id)) : null;
  }
  /**
   * stop.mjs displaceIn + stopSpot / pastDoor: where it is drawn; carried on along its own route (1.5 squares ahead,
   * else back the way it came) just clear of a door's line, of a token at rest and of a spot this same stop gave out
   * (`group`: { skip, claims }), never through a shut door. The leader inside its own members carries on through them
   * to the first free spot, however far (0.10 R6, R7). With no clear spot along its way it stays where drawn, named
   * (0.10 L2 fix (a): the straight-line last resort is gone).
   */
  /** stop.mjs takenAround: the tokens at rest (and spots given out) a stop of `id` must not rest in, and the walkers. */
  restsFor(id, skip, claims, { pending = true } = {}) {
    const rest = [...claims.filter(c => c.id !== id)];
    const walkers = [];
    for (const [oid, f] of this.env.noStopClear ? [] : this.inFlight) {
      if (oid === id || skip.has(oid) || this.now - f.at > 3000) continue;
      rest.push({ x: f.x, y: f.y, r: this.doc(oid).r });
    }
    // stop.mjs walkingOn (0.10 L3): where this client's other stops are carrying tokens on to.
    for (const [oid, w] of this.env.noWalkOnClaims ? [] : this.walkOn) {
      if (oid === id || skip.has(oid) || !w.target || this.now - w.at > 3000 || w.sent) continue;
      rest.push({ x: w.target.x, y: w.target.y, r: this.doc(oid).r, id: oid });
    }
    // file.mjs groupPendingEnds (0.10 L3): where this client's members still waiting for their wave will rest.
    for (const g of this.env.noPendingEnds || !pending ? [] : this.groups.values()) {
      for (const w of g.waves) for (const oid of w.ids) {
        if (oid === id || skip.has(oid) || !g.ends?.has(oid)) continue;
        const e = g.ends.get(oid);
        rest.push({ x: e.x, y: e.y, r: this.doc(oid)?.r ?? 0.5, id: oid });
      }
    }
    for (const [oid, o] of this.c.view) {
      if (oid === id || skip.has(oid)) continue;
      // stop.mjs takenAround (0.10 L3): one of this client's own walkers counts where it is drawn, not where it is
      // going: if its way meets where this stop rests a token, the same stop stops it too (stopAlso).
      const own = !this.env.noStopAlso && o.mv?.user === this.c.id && this.c.animating(oid);
      if (!own) rest.push({ x: o.x, y: o.y, r: o.r, id: oid });
      if (this.c.animating(oid)) walkers.push({ ...this.c.drawn(oid), r: o.r, ...(own ? { id: oid, own: true } : {}) });
    }
    return { rest, walkers };
  }
  /**
   * stop.mjs stopAlso (0.10 L3): this client's own walkers whose way ahead comes into a spot this stop rests a token
   * on (or that are inside one now) are stopped by the same stop, front first, until none is left.
   */
  stopAlso(group) {
    if (this.env.noStopAlso || this.env.server.inCombat) return [];
    const out = [];
    for (let round = 0; round < 6; round++) {
      const add = [];
      for (const [oid, o] of this.c.view) {
        if (group.skip.has(oid) || o.mv?.user !== this.c.id || !this.c.animating(oid)) continue;
        const way = this.c.wayAhead(oid);
        const cs = group.claims.filter(c => c.id !== oid);
        if (cs.some(c => dist(way[0], c) < o.r + c.r - 0.05) || routeEnters(way, o.r, cs, 0.05)) add.push(oid);
      }
      if (!add.length) break;
      for (const a of add) group.skip.add(a);
      for (const a of this.stopOrdered(add)) { this.displace(a, {}, group); out.push(a); }
    }
    if (out.length) this.env.record("stopAlso", { client: this.c.id, ids: out });
    return out;
  }
  /** stop.mjs alongWay: motion-core clearAlong as a stop runs it, from `drawn` along `way` ({ ahead, behind }). */
  alongWay(id, drawn, way, { rest, walkers }) {
    const d = this.doc(id);
    const lines = this.env.world.map.doors;
    const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
    const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
    const onRest = this.env.noStopClear ? () => false : inside(rest);
    const taken = p => onRest(p) || inside(walkers)(p);
    const restIn = (c, p) => dist(p, c) < d.r + c.r - 0.01;
    const mates = this.leading(id);
    return clearAlong(drawn, way.ahead, way.behind, {
      // Into a token at rest it was not inside at `from` (0.10 L3, seed 4491: a brush, within 0.05 square, is not
      // inside: a walk on that set off brushing one went on through it).
      enters: this.env.noStopClear ? null : (from, p) => rest.some(c => !mates?.has(c.id) && restIn(c, p) && !(dist(from, c) < d.r + c.r - (this.env.noDeeper ? 0.01 : 0.05))),
      bad: p => across(p) || onRest(p), taken: this.env.noStopClear ? null : taken,
      wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0, step: 0.05, aheadMax: onRest(drawn) && mates ? Infinity : PAST_DOOR,
      behindMax: onRest(drawn) ? Infinity : PAST_DOOR,
    });
  }
  /**
   * stop.mjs displaceIn + stopSpot / pastDoor: where it is drawn; carried on along its own route (1.5 squares ahead,
   * else back the way it came) just clear of a door's line, of a token at rest and of a spot this same stop gave out
   * (`group`: { skip, claims }), never through a shut door. The leader inside its own members carries on through them
   * to the first free spot, however far (0.10 R6, R7). With no clear spot along its way it stays where drawn, named
   * (0.10 L2 fix (a): the straight-line last resort is gone).
   */
  displace(id, extra, group = null) {
    const d = this.doc(id);
    const drawn = this.c.drawn(id);
    const skip = group?.skip ?? new Set([id]);
    const claims = group?.claims ?? [];
    const lines = this.env.world.map.doors;
    const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
    const rw = this.restsFor(id, skip, claims);
    const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
    const onRest = this.env.noStopClear ? () => false : inside(rw.rest);
    const legs = this.c.legs.get(id) ?? [];
    const way = { ahead: this.c.wayAhead(id).slice(1), behind: [...legs.filter(l => l.t0 <= this.now).map(l => l.a)].reverse() };
    let p = drawn, via = [];
    if (across(drawn) || onRest(drawn)) {
      // motion-core clearAlong, as stop.mjs pastDoor calls it.
      let found = this.alongWay(id, drawn, way, rw);
      // A waiting member's slot is a stop's last choice, not a wall (0.10 L3 fix round): with no spot clear of every
      // slot, one clear of the tokens themselves; that member's wave then finds its slot taken and stays, named.
      if (!found && !this.env.noSlotLast) {
        const rw2 = this.restsFor(id, skip, claims, { pending: false });
        if (rw2.rest.length < rw.rest.length) found = this.alongWay(id, drawn, way, rw2);
      }
      if (this.env.debugStops && !found) this.env.record("stuck", { client: this.c.id, id, drawn, ahead: way.ahead.slice(0, 3), behind: way.behind.slice(0, 3),
        rest: rw.rest.filter(c => dist(c, drawn) < 3).map(c => ({ id: c.id, x: +c.x.toFixed(2), y: +c.y.toFixed(2) })) });
      if (found) ({ p, via } = found);
      else if (onRest(drawn) && !across(drawn) && this.makeRoom(id, drawn, d, group, rw)) {
        // stop.mjs makeRoom (0.10 L3): the members of this same stop it lies in were carried on along their own ways.
      } else if ((found = this.roomAlong(id, drawn, d, way, group, rw))) {
        // stop.mjs roomAlong (0.10 L3 fix round): a spot along its own way clear of all but members of this same stop,
        // and those carried on along their own ways clear of it.
        ({ p, via } = found);
      } else if (onRest(drawn) && !group?.wall && !this.env.noWalkOn && !onRest(d)) {
        // stop.mjs stopOne (0.10 L2 fix (a)): not stopped, it walks on to the end of its own move (named).
        claims.push({ id, x: d.x, y: d.y, r: d.r });
        this.named([id], "walkedOn");
        return;
      } else if (onRest(drawn)) {
        this.nameLater(id, "stopInside");
      }
    }
    this.c.stopMovement(id);
    this.c.stopAnimation(id);
    this.c.move(id, [drawn], { animate: false, options: { stop: true, ...(p !== drawn ? { stopAt: { [id]: { x: p.x, y: p.y } } } : {}), ...extra }, why: "stop" });
    const mid = `${this.c.id}:${this.c.mids}`;
    claims.push({ id, x: p.x, y: p.y, r: d.r, from: { ...drawn }, way, mid, extra, wall: !!group?.wall });
    if (group && this.batching) this.batching.add(group);
    if (this.env.debugStops) this.env.record("displace", { client: this.c.id, id, drawn, p, onRest: onRest(drawn), across: across(drawn) });
    // stop.mjs displace: the walk on goes once the stop's own write is back (from where it was drawn).
    if (p !== drawn) this.walkOn.set(id, { mid, wps: [...via, p], extra, target: { ...p }, at: this.now, from: { ...drawn }, way });
  }
  /**
   * stop.mjs makeRoom (0.10 L3): a token of a stop with no clear spot along its own way, drawn inside members this
   * same stop already rested (and nothing else), may rest where it is drawn when each of those can be carried on
   * along its own way clear of it (one more walk on each, never through a wall or a token at rest). True when done.
   */
  makeRoom(id, drawn, d, group, rw) {
    if (this.env.noMakeRoom || !group) return false;
    const moves = this.roomAt(id, drawn, d, group, rw);
    if (!moves) return false;
    this.commitRoom(id, moves);
    return true;
  }
  /** stop.mjs roomAt: the walks on that clear `at` for token `id` (each member of this stop it overlaps there), or null. */
  roomAt(id, at, d, group, rw) {
    const mine = c => dist(at, c) < d.r + c.r - 0.01;
    const blockers = rw.rest.filter(mine);
    const ys = blockers.map(c => group.claims.find(k => k.id === c.id && k === c));
    if (!blockers.length || ys.some(y => !y?.way)) return null;
    const me = { id, x: at.x, y: at.y, r: d.r };
    const moves = [];
    for (const y of ys) {
      const others = group.claims.filter(k => k !== y);
      const rwy = this.restsFor(y.id, group.skip, [...others, me]);
      const again = this.alongWay(y.id, y.from, y.way, rwy);
      if (!again) return null;
      moves.push({ y, again });
    }
    return moves;
  }
  /**
   * stop.mjs roomAlong (0.10 L3 fix round, the simulator's jams at a door): the first spot along its own way that is
   * clear of every token at rest but members of this same stop, where those it overlaps can each be carried on along
   * their own ways clear of it (roomAt); its walk there enters nothing it did not start inside. { p, via } or null.
   */
  roomAlong(id, drawn, d, way, group, rw) {
    if (this.env.noRoomAlong || this.env.noMakeRoom || !group) return null;
    const lines = this.env.world.map.doors;
    const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
    const claimed = new Set(group.claims);
    const statics = rw.rest.filter(c => !claimed.has(c));
    const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
    const onStatic = inside(statics), onClaim = inside(rw.rest.filter(c => claimed.has(c)));
    const mates = this.leading(id);
    const own = rw.walkers.filter(w => w.own);
    let moves = null;
    const found = clearAlong(drawn, way.ahead, way.behind, {
      enters: (from, p) => [...rw.rest, ...own].some(c => !mates?.has(c.id) && dist(p, c) < d.r + c.r - 0.01 && !(dist(from, c) < d.r + c.r - 0.05)),
      bad: p => across(p) || onStatic(p) || (onClaim(p) && !(moves = this.roomAt(id, p, d, group, rw))),
      taken: p => inside(rw.walkers)(p), wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0, step: 0.05,
      aheadMax: PAST_DOOR, behindMax: Infinity,
    });
    if (!found) return null;
    if (moves && inside(rw.rest.filter(c => claimed.has(c)))(found.p)) this.commitRoom(id, moves);
    return found;
  }
  commitRoom(id, moves) {
    for (const { y, again } of moves) {
      y.x = again.p.x; y.y = again.p.y;
      this.walkOn.set(y.id, { mid: y.mid, wps: [...again.via, again.p], extra: y.extra, target: { ...again.p }, at: this.now, from: { ...y.from }, way: y.way });
    }
    this.env.record("makeRoom", { client: this.c.id, id, moved: moves.map(m => m.y.id) });
  }
  /**
   * stop.mjs displace's walkOn (0.10 L3): the walk on goes from where the stop rested it; when a door shut since crosses
   * it, its spot again along the same way with the doors as this client knows them now; with none it stays, named
   * when that is on another token.
   */
  sendWalkOn(id, w) {
    if (this.c.doorCut(w.from, w.wps) < 0 || this.env.noWalkOnCheck) return this.c.move(id, w.wps, { options: { stop: true, ...w.extra }, why: "pastDoor" });
    w.sent = "none";
    const rw = this.restsFor(id, new Set([id]), []);
    const again = w.way ? this.alongWay(id, w.from, w.way, rw) : null;
    if (!again) {
      if (this.settleAgain(id, w)) return null;
      if (rw.rest.some(c => dist(w.from, c) < this.doc(id).r + c.r - 0.01)) this.named([id], "stopInside");
      return null;
    }
    return this.c.move(id, [...again.via, again.p], { options: { stop: true, ...w.extra }, why: "pastDoor" });
  }
  /**
   * stop.mjs settleAgain (0.10 L3 fix round, seed 9124: a door shut, unknown to this screen when it stopped them, across
   * a walk on): the token with no spot along its way any more, inside members of its own stop resting where they were
   * drawn, is settled again with them, each along its own way with the walls as they are now (motion-core settleAlong);
   * those it moves walk on there. True when done.
   */
  settleAgain(id, w) {
    if (this.env.noSettleAgain || !w.way) return false;
    const grp = (this.recent ?? []).find(x => x.group.claims.some(k => k.id === id && k.mid === w.mid))?.group;
    if (!grp) return false;
    const me = this.doc(id);
    const mates = grp.claims.filter(k => k.id !== id && k.from && k.way && dist(k, k.from) < 1e-6 && !this.c.animating(k.id)
      && dist(this.doc(k.id), k) < 1e-6 && dist(w.from, k) < me.r + k.r - 0.01);
    if (!mates.length) return false;
    const lines = this.env.world.map.doors;
    const ids = new Set([id, ...mates.map(k => k.id)]);
    const item = (oid, from, way) => {
      const d = this.doc(oid);
      const rw = this.restsFor(oid, ids, []);
      const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
      const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
      return { id: oid, r: d.r, drawn: from, cands: spotsAlong({ drawn: from, ahead: way.ahead, behind: way.behind,
        free: p => !across(p) && !inside(rw.rest)(p) && !inside(rw.walkers)(p),
        enters: (f, p) => rw.rest.some(c => dist(p, c) < d.r + c.r - 0.01 && !(dist(f, c) < d.r + c.r - 0.05)),
        wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0, step: 0.05, aheadMax: PAST_DOOR, behindMax: Infinity }) };
    };
    const out = settleAlong([item(id, w.from, w.way), ...mates.map(k => item(k.id, k.from, k.way))]);
    this.env.record("settleAgain", { client: this.c.id, id, mates: mates.map(k => k.id), solved: !!out });
    if (!out) return false;
    for (const [oid, { p, via }] of out) {
      const from = oid === id ? w.from : mates.find(k => k.id === oid).from;
      if (dist(p, from) > 1e-9) this.c.move(oid, [...via, p], { options: { stop: true }, why: "pastDoor" });
    }
    return true;
  }
  onBroadcast(msg) {
    if (msg.type === "door") { if (!msg.open) this.cutAcross(this.env.world.doorCell(msg.door)); return; }
    if (msg.type !== "update") return;
    const late = [];
    for (const it of msg.items) {
      this.inFlight.delete(it.id);
      if (it.kind === "move" || it.kind === "displace") this.lastSeen.set(it.id, this.now);
      // file.mjs onGroupTag / stopLate: this client's own wave write of a member of a stopped group.
      if (msg.user === this.c.id && it.kind === "move" && !msg.options?.stop && this.lateStops.has(it.id)) {
        if (this.now <= this.lateStops.get(it.id)) late.push(it.id);
        this.lateStops.delete(it.id);
      }
      const w = msg.user === this.c.id ? this.walkOn.get(it.id) : null;
      if (w && it.mid === w.mid && !w.sent) { const mv = this.sendWalkOn(it.id, w); w.sent = mv?.mid ?? "none"; }
      if (it.gid) this.tags.set(it.id, { gid: it.gid, user: msg.user, at: this.now });
      // Another user's stop of a member of a group this client sent stops the whole group (decision 3, 2026-11-24).
      if (msg.options?.stop && msg.user !== this.c.id && this.groupOf.has(it.id)) this.stopGroupHere(it.id, "foreign", false, msg.options.stopAt ?? null, msg.items.map(x => x.id));
    }
    if (late.length) {
      // setTimeout 0 in file.mjs: one batch, one stop's claims.
      this.c.setTimeout(() => this.batch(() => {
        const list = late.filter(id => this.moving(id));
        const group = { skip: new Set(list.filter(id => this.c.animating(id))), claims: [] };
        for (const id of this.env.server.inCombat ? list : this.stopOrdered(list)) {
          if (this.env.server.inCombat) this.c.stopMovement(id);
          else if (this.c.animating(id)) this.displace(id, {}, group);
        }
        this.stopAlso(group);
        this.env.record("lateStop", { client: this.c.id, ids: list });
      }), 0);
    }
  }
  /**
   * drop.mjs onPreWall + stop.mjs shutBlocked (the L3 ruling, seed 6142): on the client shutting a door, out of combat,
   * the walkers this screen sees crossing it (any user's) dry-run the door cut's stop: each one's spots along its own
   * way with the door shut (motion-core spotsAlong), settled together (motion-core shutBlocked). The id of one left with
   * no rest spot clear of every token (the shut is refused: the door stays open), or null.
   */
  shutBlocked(doorId) {
    if (this.env.noShutVeto || this.env.server.inCombat) return null;
    const door = this.env.world.doorCell(doorId);
    if (!door) return null;
    const cross = [];
    for (const [id] of this.c.view) {
      if (!this.c.animating(id)) continue;
      const way = this.c.wayAhead(id);
      for (let k = 1; k < way.length; k++) if (crosses(way[k - 1], way[k], door.a, door.b)) { cross.push(id); break; }
    }
    if (!cross.length) return null;
    const ids = new Set(cross);
    const lines = this.env.world.map.doors;
    // A waiting member's slot is a stop's last choice (stopSpot): blocked with them, looked at again without them.
    const blocked = pending => shutBlocked(items(pending));
    const items = pending => cross.map(id => {
      const d = this.doc(id), drawn = this.c.drawn(id);
      const legs = this.c.legs.get(id) ?? [];
      const way = { ahead: this.c.wayAhead(id).slice(1), behind: [...legs.filter(l => l.t0 <= this.now).map(l => l.a)].reverse() };
      const rw = this.restsFor(id, ids, [], { pending });
      const mates = this.leading(id);
      const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
      const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
      const cands = spotsAlong({ drawn, ahead: way.ahead, behind: way.behind,
        free: p => !across(p) && !inside(rw.rest)(p) && !inside(rw.walkers)(p),
        enters: (f, p) => rw.rest.some(c => !mates?.has(c.id) && dist(p, c) < d.r + c.r - 0.01 && !(dist(f, c) < d.r + c.r - 0.05)),
        wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0 || crosses(a, b, door.a, door.b), step: 0.05, aheadMax: PAST_DOOR, behindMax: Infinity });
      return { id, r: d.r, drawn, mates, cands, near: segDist(drawn, door.a, door.b) };
    }).sort((a, b) => a.near - b.near);
    return blocked(true) && blocked(false);
  }
  /** drop.mjs cutAcross: out of combat, this client's walkers whose way the shut door crosses stop where drawn. */
  cutAcross(door) { return this.batch(() => this.cutNow(door)); }
  cutNow(door) {
    if (this.env.server.inCombat) return;
    const cut = [];
    for (const [id, d] of this.c.view) {
      if (d.mv?.user !== this.c.id || !this.c.animating(id)) continue;
      const way = this.c.wayAhead(id);
      for (let k = 1; k < way.length; k++) if (crosses(way[k - 1], way[k], door.a, door.b)) { cut.push(id); break; }
    }
    const group = { skip: new Set(cut), claims: [], wall: true };
    for (const id of this.stopOrdered(cut)) { this.displace(id, {}, group); this.env.record("cut", { client: this.c.id, why: "door", id }); }
    this.stopAlso(group);
  }
  /** A stop of token id that walks on clear (stop.mjs displace's second write) not yet drawn on client c: still moving. */
  stopping(c, id) {
    const w = this.walkOn.get(id);
    if (!w) return false;
    if (!w.sent) return true;
    if (w.sent === "none") return false;
    const e = this.env.server.log.find(x => x.id === id && x.mid === w.sent);
    return !e || (c.seen.get(id) ?? 0) < e.ord;
  }
  /** Anything this client still holds at the end (file.mjs prune: nothing busy). */
  busy() { return [...this.groups.values()].filter(g => g.waves.length || g.queue).map(g => g.gid); }
}
export { HOLD_MS };
