/**
 * The module as the simulator runs it (0.9.0; Fable's review 2 §4 step 5): one instance per virtual client. The
 * decisions are the module's own pure code, called as drop.mjs / file.mjs call it:
 *   - a group drop out of combat: file-core planLead (0.10 L1, the leader rule: the shape from where it lands, every
 *     member's slot and route) and staggerFile (B1: the start delays), motion-core waves (the batches), group-core
 *     freePrefix (a wave's member goes its whole way, or stays, named);
 *   - a group drop in a fight: planLead's order (the leader, then least walk left), one member at a time, each one's
 *     square picked at its turn (planLead for that one member: behind where the leader came to rest, or round the
 *     target);
 *   - routes: the real pathfind-core A* (test/fixtures/grid.mjs gridWorld), round the tokens standing as this client
 *     sees them, a fight's on whole squares with motion-core cellChain (a checkpoint every square).
 * What is left here is the wiring the glue does with Foundry (each function names the one it stands for): the wave
 * timers, the three handlers (a click stops the group, a door shut stops the walkers it crosses, a hidden tab sends
 * its waves at once), the fight queue's wait and watchdog, onPreMove's per-square test. No Promises: every wait is a
 * callback on the fake clock, so a seed replays exactly.
 */

import { planLead, staggerFile, STAGGER } from "../../file-core.mjs";
import { clearAlong, waves as wavesOf, cellChain } from "../../motion-core.mjs";
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
  noteDrop(ids, combat) {
    const seq = ++this.seq;
    for (const id of ids) this.latestDrop.set(id, seq);
    const seen = Object.fromEntries(ids.map(id => [id, 0]));
    for (const [id, ord] of this.c.seen) seen[id] = ord;
    this.env.drops.push({ client: this.c.id, ids: [...ids], t0: this.now, combat, seq, seen: new Map(this.c.seen) });
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
    this.cancelQueues("drop");
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
    const d = [...this.c.view.values()].find(o => !skip.has(o.id) && Math.abs(dest.x - o.x) < o.w / 2 && Math.abs(dest.y - o.y) < o.h / 2);
    return d ? { id: d.id, x: d.x, y: d.y, w: d.w, h: d.h } : null;
  }
  /** file.mjs oraclesFor's step: one step between neighbouring squares (walls; a diagonal past a wall corner is shut). */
  stepOf(g) { return (a, b) => g.free(b.i, b.j) && (a.i === b.i || a.j === b.j || (g.free(a.i, b.j) && g.free(b.i, a.j))); }
  dropGroup(ids, anchorId, dest) {
    const combat = this.env.server.inCombat;
    this.cancelQueues("drop");
    const seq = this.noteDrop(ids, combat);
    const members = ids.map(id => { const d = this.doc(id); return { id, w: d.w, h: d.h, r: d.r, speed: SPEED, start: { x: d.x, y: d.y } }; });
    const g = this.grid(combat);
    const target = this.targetOf(ids, dest);
    if (combat) return this.fightFile(members, anchorId, dest, target, seq);
    let clock = 0;
    const route = (m, from, to, avoid) => { clock += ROUTE_MS; return this.route(g, m, from, to, avoid); };
    const plan = planLead({ members, leaderId: anchorId, drop: dest, target, standing: this.othersOf(ids) }, { walkable: g.walkable, step: this.stepOf(g), route, now: () => clock });
    const walks = plan.order.map(id => members.find(m => m.id === id))
      .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
      .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed }));
    const capMs = Math.max(0, Math.floor((STAGGER.capMs - plan.ms) / STAGGER.stepMs) * STAGGER.stepMs);
    const timing = this.env.b0 ? { delays: Object.fromEntries(walks.map(w => [w.id, 0])) } : staggerFile(walks, { capMs });
    this.env.record("plan", { client: this.c.id, seq, ms: plan.ms, shape: plan.shape, leader: plan.leader, target: plan.target, none: plan.none,
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
    // earlier wave are in this wave's way too.
    const others = this.othersOf([...grp.ids]);
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
    for (const id of live) {
      const at = grp.starts.get(id), wps = grp.wps.get(id);
      const whole = this.c.doorCut(at, wps) < 0 && freePrefix([at, ...wps], this.doc(id).r, others).full;
      if (!whole) { shut.push(id); grp.stayed.add(id); if (fix) others.push(circle(id, at)); continue; }
      items.push({ id, waypoints: wps });
    }
    this.named(shut, "wave");
    for (const it of items) this.inFlight.set(it.id, { ...it.waypoints.at(-1), at: this.now });
    if (items.length) this.c.moveMany(items, { options: { gid: grp.gid, seq: grp.seq } });
  }
  /** file.mjs onVisibility: a tab going to the background sends every remaining wave now. */
  onHidden() { for (const g of [...this.groups.values()]) if (g.waves.length) this.fireWaves(g, [...g.waves]); }
  onReload() { this.groups.clear(); this.groupOf.clear(); this.env.record("reload", { client: this.c.id }); }

  /* ---- drop.mjs fightFile / runFight / routeAtTurn / walkOne ---- */
  fightFile(members, leaderId, dest, target, seq) {
    // file.mjs fightPlan: the order (planLead with no search: the leader, then least walk left).
    const g0 = this.grid(true);
    const plan = planLead({ members, leaderId, drop: dest, target, standing: this.othersOf(members.map(m => m.id)) }, { walkable: g0.walkable, step: this.stepOf(g0) });
    const order = plan.order;
    const entries = order.map(id => ({ ...members.find(m => m.id === id), leader: id === leaderId, dest }));
    if (!entries.length) return;
    const grp = this.hold(entries.map(e => e.id), seq);
    const q = { k: 0, done: false, why: null, entries, current: null, grp, shape: plan.shape, target, leaderId, leaderAt: null };
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
    let end = null;
    if (e.leader && q.shape === "march") end = taken(e.dest) || !g.walkable(e, e.dest) ? this.nearestFree(e, e.dest, taken, g) : e.dest;
    else {
      const leader = q.shape === "march" && q.leaderAt ? { ...q.entries.find(x => x.leader), start: { ...q.leaderAt.at } } : null;
      if (q.shape !== "march" || leader) {
        const list = leader ? [leader, { ...e, start: { x: d.x, y: d.y } }] : [{ ...e, start: { x: d.x, y: d.y } }];
        const p = planLead({ members: list, leaderId: leader?.id ?? e.id, target: q.shape === "swarm" ? q.target : null,
          leaderAt: leader ? q.leaderAt : null, standing: others.filter(o => o.id !== leader?.id) }, { walkable: g.walkable, step: this.stepOf(g) });
        const x = p.members[e.id];
        end = x && !x.stay ? x.slot : null;
      }
    }
    let pts = null, why = end ? "fight:noRoute" : "fight:noSpot";
    if (end && dist(end, e.start) <= 1e-6) why = "fight:there";
    else if (end) { pts = this.route(g, e, e.start, end, others); if (!(pts?.length >= 2)) pts = null; }
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
    const wps = onSquares(pts).slice(1);
    this.env.record("slot", { client: this.c.id, id: e.id, slot: { ...pts.at(-1) } });
    q.current = e.id;
    const mv = this.c.move(e.id, wps, { combat: true, options: { gid: q.grp.gid, seq: q.grp.seq } });
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
  /** file.mjs cancelQueues (a new drop, a turn change, the fight's end). */
  cancelQueues(why) { for (const g of this.groups.values()) if (g.queue) this.endQueue(g.queue, why); }

  /** drop.mjs onPreMove, a fight's next square: never into a token standing still on this page. */
  preStep(id, a, b) {
    const me = this.doc(id);
    for (const o of this.c.view.values()) {
      if (o.id === id || this.moving(o.id)) continue;
      const rr = me.r + o.r - 0.02;
      if (dist(a, o) < rr) continue;
      if (segDist(o, a, b) < rr) { this.env.record("cut", { client: this.c.id, why: "step", id, against: o.id }); return false; }
    }
    return true;
  }

  /* ---- stop.mjs stopToken (a click) and file.mjs onGroupTag ---- */
  click(id) {
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
    for (const t of list) {
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
  /** file.mjs stopGroupHere: the dragger's screen stops every member still walking. */
  stopGroupHere(id, why, self = false) {
    const ids = this.cancelGroup(id, why);
    const list = ids.filter(x => (x !== id || self) && this.doc(x)?.mv?.user === this.c.id && this.moving(x));
    const group = { skip: new Set(list.filter(x => this.c.animating(x))), claims: [] };
    for (const x of list) {
      if (this.env.server.inCombat) this.c.stopMovement(x);
      else if (this.c.animating(x)) this.displace(x, {}, group);
    }
  }
  /**
   * stop.mjs displaceIn + stopSpot / pastDoor: where it is drawn; carried on along its own route (1.5 squares ahead,
   * else back the way it came) just clear of a door's line, of a token at rest and of a spot this same stop gave out
   * (`group`: { skip, claims }), never through a shut door.
   */
  displace(id, extra, group = null) {
    const d = this.doc(id);
    const drawn = this.c.drawn(id);
    const skip = group?.skip ?? new Set([id]);
    const claims = group?.claims ?? [];
    const lines = this.env.world.map.doors;
    const across = p => lines.some(l => segDist(p, l.a, l.b) < d.r - 1e-6);
    const rest = [...claims.filter(c => c.id !== id)];
    const walkers = [];
    for (const [oid, f] of this.env.noStopClear ? [] : this.inFlight) {
      if (oid === id || skip.has(oid) || this.now - f.at > 3000) continue;
      rest.push({ x: f.x, y: f.y, r: this.doc(oid).r });
    }
    for (const [oid, o] of this.c.view) {
      if (oid === id || skip.has(oid)) continue;
      rest.push({ x: o.x, y: o.y, r: o.r });
      if (this.c.animating(oid)) walkers.push({ ...this.c.drawn(oid), r: o.r });
    }
    const inside = list => p => list.some(c => dist(p, c) < d.r + c.r - 0.01);
    const onRest = this.env.noStopClear ? () => false : inside(rest);
    const taken = p => onRest(p) || inside(walkers)(p);
    let p = drawn, via = [];
    if (across(drawn) || onRest(drawn)) {
      const legs = this.c.legs.get(id) ?? [];
      const ahead = this.c.wayAhead(id).slice(1);
      const behind = [...legs.filter(l => l.t0 <= this.now).map(l => l.a)].reverse();
      // motion-core clearAlong, as stop.mjs pastDoor calls it.
      const restIn = (c, p) => dist(p, c) < d.r + c.r - 0.01;
      let found = clearAlong(drawn, ahead, behind, {
        enters: this.env.noStopClear ? null : (from, p) => rest.some(c => restIn(c, p) && !restIn(c, from)),
        bad: p => across(p) || onRest(p), taken: this.env.noStopClear ? null : taken,
        wallBetween: (a, b) => this.c.doorCut(a, [b]) >= 0, step: 0.05, aheadMax: PAST_DOOR,
        behindMax: onRest(drawn) ? Infinity : PAST_DOOR,
      });
      // stop.mjs stopSpot's last resort (clearOfWalls): the nearest clear square it reaches without crossing a wall.
      if (!found && onRest(drawn)) {
        const g = this.grid(false), m = { w: d.w, h: d.h };
        const sx = d.w % 2 ? 0.5 : 0, sy = d.h % 2 ? 0.5 : 0;
        const cands = [];
        for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) cands.push({ x: Math.floor(drawn.x - sx) + sx + dx, y: Math.floor(drawn.y - sy) + sy + dy });
        cands.sort((a, b) => dist(a, drawn) - dist(b, drawn));
        const ok = c => g.walkable(m, c) && g.lineFits(drawn, c, d.w, d.h) && this.c.doorCut(drawn, [c]) < 0 && !taken(c);
        const c = cands.find(ok);
        if (c) found = { p: c, via: [] };
      }
      if (found) ({ p, via } = found);
    }
    claims.push({ id, x: p.x, y: p.y, r: d.r });
    this.c.stopMovement(id);
    this.c.stopAnimation(id);
    this.c.move(id, [drawn], { animate: false, options: { stop: true, ...extra }, why: "stop" });
    // stop.mjs displace: the walk on goes once the stop's own write is back (from where it was drawn).
    if (p !== drawn) this.walkOn.set(id, { mid: `${this.c.id}:${this.c.mids}`, wps: [...via, p], extra });
  }
  onBroadcast(msg) {
    if (msg.type === "door") { if (!msg.open) this.cutAcross(this.env.world.doorCell(msg.door)); return; }
    if (msg.type !== "update") return;
    const late = [];
    for (const it of msg.items) {
      this.inFlight.delete(it.id);
      // file.mjs onGroupTag / stopLate: this client's own wave write of a member of a stopped group.
      if (msg.user === this.c.id && it.kind === "move" && !msg.options?.stop && this.lateStops.has(it.id)) {
        if (this.now <= this.lateStops.get(it.id)) late.push(it.id);
        this.lateStops.delete(it.id);
      }
      const w = msg.user === this.c.id ? this.walkOn.get(it.id) : null;
      if (w && it.mid === w.mid && !w.sent) { const mv = this.c.move(it.id, w.wps, { options: { stop: true, ...w.extra }, why: "pastDoor" }); w.sent = mv?.mid ?? "none"; }
      if (it.gid) this.tags.set(it.id, { gid: it.gid, user: msg.user, at: this.now });
      // Another user's stop of a member of a group this client sent stops the whole group (decision 3, 2026-11-24).
      if (msg.options?.stop && msg.user !== this.c.id && this.groupOf.has(it.id)) this.stopGroupHere(it.id, "foreign");
    }
    if (late.length) {
      // setTimeout 0 in file.mjs: one batch, one stop's claims.
      this.c.setTimeout(() => {
        const list = late.filter(id => this.moving(id));
        const group = { skip: new Set(list.filter(id => this.c.animating(id))), claims: [] };
        for (const id of list) {
          if (this.env.server.inCombat) this.c.stopMovement(id);
          else if (this.c.animating(id)) this.displace(id, {}, group);
        }
        this.env.record("lateStop", { client: this.c.id, ids: list });
      }, 0);
    }
  }
  /** drop.mjs cutAcross: out of combat, this client's walkers whose way the shut door crosses stop where drawn. */
  cutAcross(door) {
    if (this.env.server.inCombat) return;
    const cut = [];
    for (const [id, d] of this.c.view) {
      if (d.mv?.user !== this.c.id || !this.c.animating(id)) continue;
      const way = this.c.wayAhead(id);
      for (let k = 1; k < way.length; k++) if (crosses(way[k - 1], way[k], door.a, door.b)) { cut.push(id); break; }
    }
    const group = { skip: new Set(cut), claims: [] };
    for (const id of cut) { this.displace(id, {}, group); this.env.record("cut", { client: this.c.id, why: "door", id }); }
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
