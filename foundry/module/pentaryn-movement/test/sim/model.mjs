/**
 * The module's distributed logic as the simulator runs it: one instance per virtual client, built on the module's own
 * pure cores (group-core planGroup / settle / freePrefix / restOnPaths, reserve-core's registry and decisions,
 * sequence-core's tier C order, guard-core's look ahead and yield steps, lifecycle-core's one deadline) and a port of
 * the glue's protocol (group.mjs deliver / commit / schedule / fire / flush / commitFight / fightCut / freeCut,
 * stop.mjs stopToken / stopSpot / displace, guard.mjs look / pause / resume / rest) onto the engine's clients.
 *
 * The port keeps the glue's decisions and their order; it drops what needs a canvas the engine does not have (fog,
 * levels, hidden tokens, riders, ghost, the ruler preview) and replaces Promises by callbacks on the fake clock. Each
 * function names the glue function it stands for, so a failure here is read back against the module's source.
 */

import { planGroup, settle, freePrefix, onCell, crowdFor, restOnPaths, walkersMeet, stayPastDeadline, GROUP_LIMITS } from "../../group-core.mjs";
import { MOTION, waves, radiusOf, cellChain } from "../../motion-core.mjs";
import { registry, receive, moved, claim, stopped, walkersOf, restsOf, encode, lostRace, queueUntil, queueNext, singleTiming, singleCut,
  RESERVE, priorityOf } from "../../reserve-core.mjs";
import { sequence, cutsFor } from "../../sequence-core.mjs";
import { GUARD, conflictAhead, yieldsTo, newYield, stepYield, standingOnRoute } from "../../guard-core.mjs";
import { newRun, step as lifeStep, left as lifeLeft, capped, expired, over } from "../../lifecycle-core.mjs";
import { dist, SPEED } from "./engine.mjs";
import { crosses } from "./maps.mjs";

const GROUP_HOLD_MS = 1000;
const FOREIGN_WAIT_MS = 250;
const PAST_DOOR_SQUARES = 1.5;

/** Finish a planGroup generator, counting its route searches (the plan's cost on the fake clock). */
function finish(gen) {
  let routes = 0;
  for (;;) {
    const s = gen.next();
    if (s.done) return { value: s.value, routes };
    if (s.value === "route") routes += 1;
  }
}

/** The points of `pts` cut at the first crossing of any of `lines` (segments): just before it by `r` (null: no crossing). */
function beforeLine(pts, r, lines) {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    for (const ln of lines) {
      if (!crosses(a, b, ln.a, ln.b)) continue;
      // The crossing parameter along a-b.
      const dx = b.x - a.x, dy = b.y - a.y, ex = ln.b.x - ln.a.x, ey = ln.b.y - ln.a.y;
      const den = dx * ey - dy * ex;
      const t = ((ln.a.x - a.x) * ey - (ln.a.y - a.y) * ex) / den;
      const L = Math.hypot(dx, dy);
      const back = Math.max(t - (r + 0.02) / L, 0);
      const head = pts.slice(0, k);
      if (back > 1e-6) head.push({ x: a.x + dx * back, y: a.y + dy * back });
      return head;
    }
  }
  return null;
}

/**
 * group.mjs withCheckpoints / onSquares: a fight's way with every square between two whole-square corners put in, so
 * each update is one square (core charges each as it is committed).
 */
export function onSquares(points) {
  if (!(points?.length >= 2)) return points;
  const out = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const di = Math.round(b.y - a.y), dj = Math.round(b.x - a.x);
    if (Math.abs(di - (b.y - a.y)) > 1e-6 || Math.abs(dj - (b.x - a.x)) > 1e-6) { out.push(b); continue; }
    for (const c of cellChain([{ i: 0, j: 0 }, { i: di, j: dj }]).slice(1)) out.push({ x: a.x + c.j, y: a.y + c.i });
  }
  return out.filter((p, k) => k === 0 || dist(p, out[k - 1]) > 1e-9);
}

/** Smallest distance between segments p1-p2 and q1-q2 (sampled, as group.mjs segSegDist). */
function segSegDist(p1, p2, q1, q2) {
  let best = Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    best = Math.min(best, segDist(p, q1, q2));
  }
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const q = { x: q1.x + (q2.x - q1.x) * t, y: q1.y + (q2.y - q1.y) * t };
    best = Math.min(best, segDist(q, p1, p2));
  }
  return best;
}

/** Distance from point p to segment a-b. */
function segDist(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

export class Movement {
  /**
   * @param {Client} c      the engine client
   * @param {object} env    { world, tierC, record(kind, data), runs: [] }
   */
  constructor(c, env) {
    this.c = c;
    this.env = env;
    this.reg = registry();
    this.groups = new Map();
    this.groupOf = new Map();
    this.latestDrop = new Map();
    this.dropSeq = 0;
    this.yields = new Map();
    this.arrivalWaits = new Map();
    this.pubWaits = new Map();
    this.tags = new Map();
    this.notices = [];
    c.listeners.push(msg => this.onBroadcast(msg));
    c.reloadListeners = [() => this.onReload()];
    if (c.canvas) this.startGuard();
    for (const h of c.hidden) c.exec(h.a, () => this.onHidden());
  }

  get now() { return this.c.sim.now; }
  tell(kind, why) { this.notices.push({ t: this.now, kind, why }); this.env.record?.("notice", { client: this.c.id, kind, why }); }
  grid() { return this.env.world.grid(this.c.doors, this.env.server.inCombat); }
  shutLines() { return [...this.c.doors].filter(([, open]) => !open).map(([id]) => this.env.world.doorCell(id)); }
  doc(id) { return this.c.view.get(id); }
  moving(id) { const d = this.doc(id); return this.c.animating(id) || d?.mv?.state === "pending"; }
  /** Tokens standing outside `ids` (circles at their source; a token drawn walking is a walker instead). */
  standingOutside(ids) {
    const out = [];
    for (const [id, d] of this.c.view) {
      if (ids.has(id) || this.moving(id)) continue;
      out.push({ id, x: d.x, y: d.y, r: d.r });
    }
    return out;
  }
  /** Tokens outside `ids` drawn walking now: the rest of their walk from where they are drawn. */
  walkingOutside(ids) {
    const out = [];
    for (const [id, d] of this.c.view) {
      if (ids.has(id) || !this.moving(id)) continue;
      const pts = this.c.wayAhead(id);
      if (d.mv?.state === "pending" && dist(pts.at(-1), d) > 1e-6) pts.push({ x: d.x, y: d.y });
      // movingOthers: the rest of its movement, the pending waypoints too (a fight's squares still to come).
      if (d.mv?.state === "pending") pts.push(...(d.mv.rest ?? []));
      if (pts.length < 2) continue;
      out.push({ id, r: d.r, points: pts, speed: SPEED, delay: 0 });
    }
    return out;
  }
  liveFor(ids, { skip = null, after, before } = {}) {
    const opts = { now: this.now, scene: null, exclude: ids, skip, after, before };
    return { walkers: walkersOf(this.reg, opts), rests: restsOf(this.reg, opts) };
  }
  /** reserve-adapter racers(): another active user viewing this scene (a client with a canvas). */
  racers() {
    if (this.env.forcePublish !== undefined) return this.env.forcePublish;
    return this.env.clients.some(o => o !== this.c && o.canvas);
  }
  /** group.mjs stillOurs: the members not moved since the drop and not dropped again by this client. */
  stillOurs(ids, starts, seq) {
    return ids.filter(id => {
      const d = this.doc(id), at = starts.get(id);
      return d && at && this.latestDrop.get(id) === seq && Math.abs(d.x - at.x) < 1e-9 && Math.abs(d.y - at.y) < 1e-9;
    });
  }

  /* ---------------- the socket ---------------- */

  onBroadcast(msg) {
    const now = this.now;
    if (msg.type === "update") {
      const o = msg.options ?? {};
      if (o.plan) receive(this.reg, o.plan, { now });
      if (o.gid) for (const it of msg.items) if (it.kind === "move") this.tags.set(it.id, { gid: o.gid, at: now });
      for (const it of msg.items) {
        if (it.kind !== "move" && it.kind !== "displace") continue;
        const r = moved(this.reg, it.id, { rid: o.rids?.[it.id] ?? null, movementId: it.mid, chain: [], now });
        claim(this.reg, it.id, r, { movementId: it.mid, chain: [], keep: !!(o.keep || o.guard) });
        // onForeignStop: another user stopped a member of a group this client sent (an unanimated write).
        if (it.kind === "displace" && msg.user !== this.c.id && this.groupOf.has(it.id) && o.stopAt !== undefined) this.groupStopOne(it.id, o.stopAt ?? it.to);
      }
      if (msg.user === this.c.id && o.pub) this.pubWaits.get(o.pub)?.(this.reg.recs.get(o.plan?.rid)?.seq ?? null);
      if (msg.user === this.c.id) for (const it of msg.items) this.arrivalWaits.get(`${it.id}:${it.mid}`)?.();
    } else if (msg.type === "stop") {
      stopped(this.reg, msg.id);
    } else if (msg.type === "door") {
      if (!msg.open) this.cutAcross(this.env.world.doorCell(msg.door));
    } else if (msg.type === "relayStop" && msg.to === this.c.id) {
      this.fightStopGroup(msg.id, "relay");
    }
  }
  onReload() {
    for (const g of this.groups.values()) for (const t of g.timers) this.c.clearTimeout(t);
    this.groups.clear(); this.groupOf.clear(); this.yields.clear(); this.arrivalWaits.clear(); this.pubWaits.clear();
    this.reg = registry();
    for (const r of this.env.runs) if (r.client === this.c.id && !over(r.run)) lifeStep(r.run, "cancelled", { now: this.now, why: "reload" });
    if (this.c.canvas) this.startGuard();
  }

  /* ---------------- a single drop (group.mjs singleOut / singleFlow) ---------------- */

  dropSingle(id, dest) {
    const d = this.doc(id);
    if (!d) return null;
    const combat = this.env.server.inCombat;
    const seq = ++this.dropSeq;
    this.latestDrop.set(id, seq);
    const g = this.grid();
    const from = { x: d.x, y: d.y };
    const m = { id, w: d.w, h: d.h, r: d.r };
    const ids = new Set([id]);
    const others = this.standingOutside(ids);
    const run = newRun({ id: `s${this.c.id}${seq}`, now: this.now, members: [id] });
    const rec = { client: this.c.id, kind: "single", t0: this.now, run, ids: [id], combat };
    this.env.runs.push(rec);
    // pathfind (the ruler routes round standing tokens, 0.5.2); with no way round them, the way through as far as free.
    let route = g.route(m, from, dest, { avoid: crowdFor(m, from, dest, others) });
    if (!route) {
      const through = g.route(m, from, dest);
      if (!through) { this.tell("noRoute", "single"); lifeStep(run, "rested", { now: this.now, why: "noRoute" }); return rec; }
      const p = freePrefix(through.points, d.r, others, { allowed: combat ? c => onCell(c, d.w, d.h) : null });
      if (p.points.length < 2 || dist(p.points.at(-1), from) < 1e-6) { this.tell("noRoute", "standing"); lifeStep(run, "rested", { now: this.now, why: "noRoute" }); return rec; }
      this.tell("short", "standingInTheWay");
      route = { points: p.points };
    }
    const starts = new Map([[id, from]]);
    const ctx = { id, d, run, rec, seq, starts, combat, points: combat ? onSquares(route.points) : route.points, waited: 0, races: 0, replaces: null };
    this.singleStep(ctx);
    return rec;
  }
  singleStep(ctx) {
    const { id, d, run, combat } = ctx;
    if (!this.stillOurs([id], ctx.starts, ctx.seq).length) { lifeStep(run, "cancelled", { now: this.now, why: "superseded" }); return; }
    const member = { id, r: d.r, w: d.w, h: d.h, speed: SPEED, points: ctx.points, delay: 0 };
    const ids = new Set([id]);
    const walking = this.walkingOutside(ids);
    const walkers = [...walking, ...this.liveFor(ids, { skip: new Set(walking.map(w => w.id)) }).walkers];
    const snap = this.reg.seq;
    let { delay, until } = singleTiming(member, walkers, { combat });
    if (delay !== null && delay > lifeLeft(run, this.now)) delay = null;
    if (delay === null) {
      let q = queueNext(ctx.waited, until);
      if (q !== null) q = capped(run, this.now, q);
      if (q !== null && q >= MOTION.delayStep) {
        ctx.waited += q;
        lifeStep(run, "queued", { now: this.now });
        this.c.setTimeout(() => this.singleStep(ctx), q);
        return;
      }
      const cut = singleCut(member, walkers, { combat });
      if (cut.still) { this.tell("short", "yieldedStay"); lifeStep(run, "rested", { now: this.now, why: "yielded" }); return; }
      ctx.points = combat ? onSquares(cut.points) : cut.points;
      this.tell("short", "yielded");
      delay = 0;
    }
    const go = inline => {
      const extra = wire ? { rids: { [id]: wire.rid }, ...(inline ? { plan: wire } : {}) } : {};
      const send = () => {
        if (over(run)) return;
        if (!this.stillOurs([id], ctx.starts, ctx.seq).length) { lifeStep(run, "cancelled", { now: this.now }); return; }
        lifeStep(run, "walking", { now: this.now });
        this.c.move(id, ctx.points.slice(1), { combat, options: extra, why: "single" });
        this.watchRest(run, [id]);
      };
      if (delay > 0) this.c.setTimeout(send, delay); else send();
    };
    const racing = this.racers();
    const wire = encode({ rid: `r${this.c.id}${this.c.sim.s}`, user: this.c.id, scene: null, combat, replaces: ctx.replaces,
      members: [{ ...member, delay: racing ? delay : 0 }] });
    if (!racing) { go(true); return; }
    this.publish(id, wire, echo => {
      const theirs = this.liveFor(ids, { after: snap, before: echo ?? Infinity }).walkers.filter(w => w.rid !== wire.rid);
      if (theirs.length && ctx.races < RESERVE.replans && lostRace([{ ...member, delay }], theirs, { combat })) {
        ctx.races += 1;
        ctx.replaces = wire.rid;
        this.env.record?.("lostRace", { client: this.c.id, single: true });
        this.singleStep(ctx);
        return;
      }
      go(!echo);
    });
  }
  /** A run with no group record ends when its tokens rest here (a single's walk; its deadline bounds the wait). */
  watchRest(run, ids) {
    const sentOrd = this.c.sent.length;
    const check = () => {
      if (over(run)) return;
      // Its own updates back first (an update still on its way is not at rest).
      const echoed = ids.every(id => !this.c.moves.has(id) && (this.env.server.lastWrite.get(id) ?? 0) <= (this.c.seen.get(id) ?? 0));
      void sentOrd;
      if (echoed && ids.every(id => !this.moving(id))) { lifeStep(run, "rested", { now: this.now }); return; }
      if (expired(run, this.now)) { lifeStep(run, "rested", { now: this.now, why: "deadline" }); return; }
      this.c.setTimeout(check, 100);
    };
    this.c.setTimeout(check, 100);
  }

  /** reserve publish(): an empty update carrying the wire; `done(seq | null)` at its echo (null: no echo in time). */
  publish(id, wire, done) {
    const key = `p${this.c.id}${this.c.sim.s}`;
    let settled = false;
    const finishOnce = seq => { if (settled) return; settled = true; this.pubWaits.delete(key); done(seq); };
    this.pubWaits.set(key, seq => finishOnce(seq));
    this.c.emit({ type: "update", items: [{ id, kind: "none" }], options: { plan: wire, pub: key } });
    this.c.setTimeout(() => { if (!settled) this.c.setTimeout(() => finishOnce(null), RESERVE.commitMs); }, RESERVE.echoMs);
  }

  /* ---------------- a group drop (group.mjs onDrop / prepare / deliver / commit) ---------------- */

  dropGroup(ids, anchorId, dest) {
    const combat = this.env.server.inCombat;
    const seq = ++this.dropSeq;
    for (const id of ids) this.latestDrop.set(id, seq);
    const gid = `g${this.c.id}${seq}`;
    const run = newRun({ id: gid, now: this.now, members: [...ids] });
    const rec = { client: this.c.id, kind: combat ? (this.env.tierC ? "fightC" : "fightCore") : "group", t0: this.now, run, ids: [...ids], combat, gid };
    this.env.runs.push(rec);
    const starts = new Map(ids.map(id => [id, { x: this.doc(id).x, y: this.doc(id).y }]));
    const d = { ids, anchorId, dest, combat, seq, gid, run, rec, starts, waited: 0, attempt: 0, rid: null };
    if (combat && !this.env.tierC) { this.coreGroup(d); return rec; }
    this.plan(d);
    return rec;
  }

  /** prepare() + planGroup + the plan's time on this client's clock (its slices), then deliver. */
  plan(d) {
    if (!this.stillOurs(d.ids, d.starts, d.seq).length) { lifeStep(d.run, "cancelled", { now: this.now, why: "superseded" }); return; }
    const g = this.grid();
    const a0 = this.doc(d.anchorId);
    const delta = { x: d.dest.x - a0.x, y: d.dest.y - a0.y };
    const idset = new Set(d.ids);
    const members = d.ids.map(id => {
      const t = this.doc(id);
      const start = { x: t.x, y: t.y };
      const formation = { x: start.x + delta.x, y: start.y + delta.y };
      return { id, w: t.w, h: t.h, r: t.r, start, formation, speed: SPEED, tl: { x: formation.x - t.w / 2, y: formation.y - t.h / 2 } };
    });
    const walking = this.walkingOutside(idset);
    const live = this.liveFor(idset, { skip: new Set(walking.map(w => w.id)) });
    d.snap = this.reg.seq;
    d.members = members;
    const anchor = members.find(m => m.id === d.anchorId);
    const spec = { members, anchorId: d.anchorId, combat: d.combat, mode: "plan", others: this.standingOutside(idset), moving: [...walking, ...live.walkers], reserved: live.rests };
    const oracles = { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route, toward: (m, f, t) => g.route(m, f, t),
      narrow: g.narrow, cramped: g.cramped, now: () => 0 };
    let plan;
    let routes = 0;
    try { ({ value: plan, routes } = finish(planGroup(spec, oracles))); }
    catch (err) { this.env.record?.("error", { client: this.c.id, where: "plan", err: String(err?.stack ?? err) }); this.failOpen(d, "throw"); return; }
    d.plan = plan;
    const ms = Math.min(4 + 3 * routes, GROUP_LIMITS.totalMs);
    this.c.setTimeout(() => this.deliver(d, plan), ms);
  }

  /** group.mjs deliver(). */
  deliver(d, plan) {
    if (!this.stillOurs(d.ids, d.starts, d.seq).length) { lifeStep(d.run, "cancelled", { now: this.now, why: "superseded" }); return; }
    if (plan?.result !== "plan") {
      if (plan?.reason === "anchorNoRoute") { this.tell("noRoute", "group"); lifeStep(d.run, "rested", { now: this.now, why: "noRoute" }); return; }
      this.failOpen(d, plan?.reason ?? "noPlan");
      return;
    }
    if (lifeLeft(d.run, this.now) >= MOTION.delayStep) {
      let until = this.queueFor(d, plan);
      until = queueNext(d.waited, until);
      if (until !== null) until = capped(d.run, this.now, until);
      if (until !== null && until >= MOTION.delayStep) {
        d.waited += until;
        lifeStep(d.run, "queued", { now: this.now, why: "walksInTheWay" });
        this.c.setTimeout(() => this.replan(d), until);
        return;
      }
    }
    const late = this.env.noStay ? { late: [] } : stayPastDeadline(plan, lifeLeft(d.run, this.now));
    if (late.late.length) { plan = late.plan; d.plan = plan; this.tell("short", "pastDeadline"); }
    const b = this.batches(d, plan);
    this.env.record?.("plan", { client: this.c.id, gid: d.gid, members: Object.fromEntries(Object.values(plan.members ?? {}).map(e => [e.id, { delay: e.delay, level: e.level, n: e.points?.length }])), waves: [b.first.ids, ...b.later.map(w => `${w.at}:${w.ids}`)] });
    const walks = this.walksOf(d, plan);
    const wire = walks.length ? encode({ rid: `r${d.gid}.${d.attempt}.${this.c.sim.s}`, user: this.c.id, scene: null, combat: d.combat, replaces: d.rid, members: walks }) : null;
    if (!wire) { this.commit(d, b, {}); return; }
    d.rid = wire.rid;
    const rids = Object.fromEntries(wire.members.map(m => [m.id, wire.rid]));
    if (!this.racers()) { this.commit(d, b, { rids, plan: wire }); return; }
    this.publish(d.anchorId, wire, echo => {
      if (!this.stillOurs(d.ids, d.starts, d.seq).length) { lifeStep(d.run, "cancelled", { now: this.now, why: "superseded" }); return; }
      const theirs = this.liveFor(new Set(d.ids), { after: d.snap, before: echo ?? Infinity }).walkers.filter(w => w.rid !== wire.rid);
      if (theirs.length && d.attempt < RESERVE.replans && lostRace(walks, theirs, { combat: d.combat })) {
        d.attempt += 1;
        this.env.record?.("lostRace", { client: this.c.id, single: false });
        this.replan(d);
        return;
      }
      this.commit(d, b, echo ? { rids } : { rids, plan: wire });
    });
  }
  replan(d) {
    if (!this.stillOurs(d.ids, d.starts, d.seq).length) { lifeStep(d.run, "cancelled", { now: this.now, why: "superseded" }); return; }
    lifeStep(d.run, "planning", { now: this.now, why: "replan" });
    this.plan(d);
  }
  /** group.mjs queueFor(). */
  queueFor(d, plan) {
    const ids = new Set([...(plan.cut ?? []), ...(plan.stayed ?? []), ...Object.values(plan.members ?? {}).filter(e => e.short).map(e => e.id)]);
    if (!ids.size) return null;
    const blamed = new Set(Object.values(plan.members ?? {}).filter(e => ids.has(e.id)).flatMap(e => e.walks ?? []));
    const full = [];
    for (const m of d.members) {
      const e = plan.members?.[m.id];
      if (!ids.has(m.id) || !e?.data) continue;
      const pts = e.data.points ?? e.data.path ?? null;
      if (pts?.length >= 2) full.push({ points: pts, r: m.r, speed: m.speed, delay: e.delay ?? 0 });
    }
    // The grid fixture's routes carry no `data`: the member's full way is its route before any cut (e.points as planned).
    for (const m of d.members) {
      const e = plan.members?.[m.id];
      if (!ids.has(m.id) || !e || full.length) continue;
      if (e.points?.length >= 2) full.push({ points: e.points, r: m.r, speed: m.speed, delay: e.delay ?? 0 });
    }
    if (!full.length && !blamed.size) return null;
    const idset = new Set(d.ids);
    const walking = this.walkingOutside(idset);
    const walkers = [...walking, ...this.liveFor(idset, { skip: new Set(walking.map(w => w.id)) }).walkers];
    return queueUntil(full, walkers, { combat: d.combat, blamed });
  }
  walksOf(d, plan) {
    const out = [];
    const order = [...Object.keys(plan.members ?? {}), ...d.ids.filter(id => !(id in (plan.members ?? {})))];
    for (const id of order) {
      const m = d.members.find(x => x.id === id);
      const e = plan.members?.[id];
      if (!m || !e || e.core || !(e.points?.length >= 2)) continue;
      out.push({ id, r: m.r, w: m.w, h: m.h, speed: m.speed, delay: e.delay ?? 0, points: e.points });
    }
    return out;
  }
  /** group.mjs batches(): { first: { ids, movement }, later: [{ at, ids, movement }], endMs }. */
  batches(d, plan) {
    const movement = {};
    const delays = {};
    let endMs = 0;
    for (const m of d.members) {
      const e = plan.members[m.id];
      if (!e || e.core || !(e.points?.length >= 2)) continue;
      if (dist(e.points[0], e.points.at(-1)) < 1e-9 && e.points.length === 2) continue;
      movement[m.id] = (d.combat ? onSquares(e.points) : e.points).slice(1);
      delays[m.id] = e.delay ?? 0;
      let L = 0;
      for (let k = 1; k < e.points.length; k++) L += dist(e.points[k - 1], e.points[k]);
      endMs = Math.max(endMs, (e.delay ?? 0) + (L / m.speed) * 1000);
    }
    const byWave = waves(delays);
    const cut = ids => ({ ids, movement: Object.fromEntries(ids.map(id => [id, movement[id]])) });
    const first = byWave[0]?.at === 0 ? cut(byWave[0].ids) : { ids: [], movement: {} };
    const later = byWave.filter(w => w.at > 0).map(w => ({ at: w.at, ...cut(w.ids) }));
    return { first, later, endMs, movement, delays };
  }

  /** group.mjs commit(). */
  commit(d, b, extra) {
    if (d.combat) { this.commitFight(d, b, extra); return; }
    const g = this.schedule(d, b.later, { endMs: b.endMs, extra });
    if (b.first.ids.length) this.send(d, b.first.ids, b.first.movement, { ...extra, gid: d.gid }, g);
    // group.mjs flushIfHidden (SIM-04 / SIM-05).
    if (g && !this.env.noFlushFix) {
      if (b.first.ids.length) g.sent.push({ at: this.now, ids: b.first.ids, movement: b.first.movement });
      if (this.c.hiddenAt(this.now)) this.flush(g);
    }
    if (!g) {
      lifeStep(d.run, "walking", { now: this.now });
      this.watchRest(d.run, d.ids);
    }
  }

  /**
   * group.mjs send(): only the members still ours; each walk cut before a door shut since the plan (walkableNow) and
   * short behind the members clicked to a stop since (roundStopped); the rest go in one update.
   */
  send(d, ids, movement, options, g = null) {
    const ours = this.stillOurs(ids, d.starts, d.seq);
    const list = [];
    const rids = options.rids ? { ...options.rids } : null;
    const lines = this.shutLines();
    for (const id of ours) {
      void lines;
      const t = this.doc(id);
      let pts = [{ x: t.x, y: t.y }, ...movement[id]];
      let changed = false;
      if (lines.length && !d.combat) {
        const cut = this.cutAtWalls(id, pts[0], pts.slice(1), { taken: this.takenFor(id, g?.claims ?? []) });
        if (cut.cut) {
          pts = [pts[0], ...cut.waypoints];
          changed = true;
          if (cut.waypoints.length) (g?.claims ?? []).push({ id, ...cut.waypoints.at(-1), r: t.r });
        }
      }
      if (g?.avoid?.length && !d.combat) {
        const circles = g.avoid.filter(a => dist(pts[0], a) >= a.r + t.r - 1e-6);
        const p = freePrefix(pts, t.r, circles);
        if (!p.full) { pts = p.points; changed = true; }
      }
      if (changed && rids) delete rids[id];
      if (pts.length < 2 || dist(pts[0], pts.at(-1)) < 1e-9) continue;
      list.push({ id, waypoints: pts.slice(1) });
    }
    if (!list.length) return [];
    const started = this.c.moveMany(list, { combat: d.combat, options: { ...options, ...(rids ? { rids } : {}) }, why: "group" });
    // send().then(): stopped while this batch was on its way to the server (live H3-05): they stop as soon as they move.
    if (started.length && g) {
      const mv = this.c.moves.get(started[0]);
      if (mv) {
        const key = `${started[0]}:${mv.mid}`;
        this.arrivalWaits.set(key, () => { this.arrivalWaits.delete(key); if (g.stopped) this.lateStop(started); });
      }
    }
    return started;
  }
  /** group.mjs lateStop(): each member stopped as a click would, as soon as this client sees it moving (10 tries, 50 ms). */
  lateStop(ids, tries = 10) {
    const left = [];
    for (const id of ids) {
      if (!this.moving(id)) { left.push(id); continue; }
      if (this.env.server.inCombat) { this.c.stopMovement(id); continue; }
      if (!this.c.animating(id)) continue;
      this.displace(id, this.stopSpot(id, new Set([id]), []));
      this.env.record?.("stop", { client: this.c.id, id, members: 1, via: "late" });
    }
    if (left.length && tries > 0) this.c.setTimeout(() => this.lateStop(left, tries - 1), 50);
  }

  /** group.mjs schedule(): the later waves on timers; the group stoppable as one until its end. */
  schedule(d, later, { endMs = 0, extra = {} } = {}) {
    if (d.ids.length < 2) return null;
    const c = this.c;
    const g = { d, ids: new Set(d.ids), timers: [], stopped: false, claims: [], avoid: [], pending: new Set(later), sent: [], extra, gid: d.gid, run: d.run,
      t0: this.now, shift: 0, held: 0, waiting: 0 };
    this.groups.set(d.gid, g);
    for (const id of g.ids) this.groupOf.set(id, d.gid);
    if (!over(d.run)) lifeStep(d.run, "walking", { now: this.now });
    const lastWave = later.at(-1)?.at ?? 0;
    const end = () => {
      if ((g.held > 0 || g.waiting > 0) && !expired(g.run, this.now)) {
        const more = capped(g.run, this.now, Math.max(g.held, FOREIGN_WAIT_MS));
        g.held = 0;
        g.timers.push(c.setTimeout(end, Math.max(more, 1)));
        return;
      }
      if (!over(g.run)) lifeStep(g.run, g.stopped ? "stopped" : "rested", { now: this.now });
      this.forget(d.gid);
    };
    g.timers.push(c.setTimeout(end, Math.max(endMs, lastWave) + GROUP_HOLD_MS));
    const waitOn = (wave, ms) => { g.waiting += 1; g.timers.push(c.setTimeout(() => { g.waiting -= 1; fire(wave); }, Math.max(ms, 1))); };
    const fire = wave => {
      if (g.stopped || !g.pending.has(wave)) return;
      const t = this.now;
      if (expired(g.run, t)) { g.pending.delete(wave); this.tell("short", "deadline"); return; }
      const due = g.t0 + wave.at + g.shift;
      if (t < due - 50) { waitOn(wave, due - t); return; }
      if (t - due > 50) { g.held += t - due; g.shift += t - due; }
      const ids = wave.ids.filter(id => g.ids.has(id));
      if (!ids.length) { g.pending.delete(wave); return; }
      if (this.foreignInWay(g, ids, wave.movement)) { g.held += FOREIGN_WAIT_MS; waitOn(wave, capped(g.run, t, FOREIGN_WAIT_MS)); return; }
      this.sendWave(g, wave, ids, wave.movement);
    };
    g.fire = fire;
    for (const wave of later) g.timers.push(c.setTimeout(() => fire(wave), wave.at));
    return g;
  }
  sendWave(g, wave, ids, movement) {
    g.pending.delete(wave);
    g.sent.push({ at: this.now, ids, movement });
    this.send(g.d, ids, movement, { ...g.extra, plan: undefined, gid: g.gid }, g);
  }
  /** group.mjs foreignInWay(): a token outside the group walking now where this wave would walk. */
  foreignInWay(g, ids, movement) {
    const walkers = this.walkingOutside(g.ids);
    if (!walkers.length) return false;
    const mine = ids.map(id => { const t = this.doc(id); return { points: [{ x: t.x, y: t.y }, ...movement[id]], r: t.r, speed: SPEED, delay: 0 }; });
    return walkersMeet(mine, walkers, { combat: false });
  }
  forget(gid) {
    const g = this.groups.get(gid);
    if (!g) return;
    for (const t of g.timers) this.c.clearTimeout(t);
    for (const id of g.ids) if (this.groupOf.get(id) === gid) this.groupOf.delete(id);
    this.groups.delete(gid);
  }
  groupCancel(id) {
    const gid = this.groupOf.get(id);
    const g = gid ? this.groups.get(gid) : null;
    if (!g) return [];
    g.stopped = true;
    const ids = [...g.ids];
    if (!over(g.run)) lifeStep(g.run, "stopped", { now: this.now, why: "click" });
    this.forget(gid);
    return ids;
  }

  /** group.mjs failOpen() / a drop left to core: every member's own way cut before the first token standing in it. */
  failOpen(d, why) {
    this.env.record?.("fallback", { client: this.c.id, why });
    lifeStep(d.run, "fallback", { now: this.now, why });
    this.coreGroup(d, { held: false });
  }
  /**
   * A group drop as core's (tier C off in a fight, or a fallback): each member's own pathfinding to its spot (round the
   * walls and the tokens standing outside the drop where it can), then unstack (restOnPaths, hard obstacles), every
   * member in one update; in a fight square by square. holdCore keeps it one group (a click or a door cut stops all).
   */
  coreGroup(d, { held = true } = {}) {
    const g = this.grid();
    const a0 = this.doc(d.anchorId);
    const delta = { x: d.dest.x - a0.x, y: d.dest.y - a0.y };
    const idset = new Set(d.ids);
    const around = this.standingOutside(idset);
    const recs = around.map((c, i) => ({ id: `__still${i}`, r: c.r, path: [{ x: c.x, y: c.y }] }));
    for (const id of d.ids) {
      const t = this.doc(id);
      const from = { x: t.x, y: t.y }, to = { x: t.x + delta.x, y: t.y + delta.y };
      const m = { id, w: t.w, h: t.h, r: t.r };
      let route = g.walkable(m, to) ? (g.route(m, from, to, { avoid: crowdFor(m, from, to, around) }) ?? g.route(m, from, to)) : null;
      recs.push({ id, r: t.r, w: t.w, h: t.h, path: route?.points ?? [from] });
    }
    recs.sort((a, b) => (a.id === d.anchorId ? -1 : b.id === d.anchorId ? 1 : 0));
    const rest = restOnPaths(recs, { allowed: d.combat ? (c, m) => onCell(c, m.w, m.h) : null, hard: around });
    const list = [];
    let endMs = 0;
    for (const rec of recs) {
      if (rec.id.startsWith("__still") || rec.path.length < 2) continue;
      const pick = rest[rec.id];
      let pts = rec.path;
      if (pick && !pick.end) {
        if (pick.k === 0 && pick.t <= 1e-6) continue;
        pts = pick.t >= 1 - 1e-6 ? rec.path.slice(0, pick.k + 2) : [...rec.path.slice(0, pick.k + 1), { x: pick.x, y: pick.y }];
      }
      if (pts.length < 2) continue;
      if (d.combat) pts = onSquares(pts);
      let L = 0;
      for (let k = 1; k < pts.length; k++) L += dist(pts[k - 1], pts[k]);
      endMs = Math.max(endMs, (L / SPEED) * 1000);
      list.push({ id: rec.id, waypoints: pts.slice(1) });
    }
    if (!over(d.run) && held) lifeStep(d.run, "walking", { now: this.now });
    if (held && d.ids.length > 1) {
      const gg = this.schedule(d, [], { endMs: d.combat ? Math.min(Math.max(2 * endMs, 1000), 10000) : endMs });
      gg.core = true;
    }
    if (list.length) this.c.moveMany(list, { combat: d.combat, options: { gid: d.gid }, why: held ? "core" : "fallback" });
    if (!held) this.watchRest({ ...d.run, state: "walking" }, d.ids);
  }

  /** group.mjs commitFight(): tier C, space not time. */
  commitFight(d, b, extra) {
    const movement = { ...b.movement };
    const byId = new Map(d.members.map(m => [m.id, m]));
    const order = [...Object.keys(d.plan.members ?? {}), ...d.ids.filter(id => !(id in (d.plan.members ?? {})))];
    const walks = [];
    for (const id of order) {
      const m = byId.get(id);
      if (!m || !movement[id]?.length) continue;
      walks.push({ id, r: m.r, points: [d.starts.get(id), ...movement[id]] });
    }
    const seqr = sequence(walks);
    cutsFor(walks, seqr, (points, r, circles, id) => {
      const m = byId.get(id);
      const p = freePrefix(points, r, circles, { allowed: c => onCell(c, m?.w ?? 1, m?.h ?? 1) });
      if (!p.full) { if (p.points.length < 2) delete movement[id]; else movement[id] = p.points.slice(1); this.env.record?.("cut", { why: "noSafeOrder", id }); }
      return p.points;
    });
    const g = { d, ids: new Set(d.ids), timers: [], stopped: false, claims: [], avoid: [], pending: new Set(), sent: [], extra, gid: d.gid, run: d.run, fight: seqr };
    this.groups.set(d.gid, g);
    for (const id of g.ids) this.groupOf.set(id, d.gid);
    lifeStep(d.run, "walking", { now: this.now });
    const arrived = new Set(), sentIds = new Set();
    const finishUp = () => {
      if (this.groups.get(d.gid) !== g) return;
      if (seqr.order.every(id => arrived.has(id) || !movement[id])) { if (!over(d.run)) lifeStep(d.run, g.stopped ? "stopped" : "rested", { now: this.now }); this.forget(d.gid); }
    };
    const watchArrival = id => this.arrivalOf(id, () => { arrived.add(id); pump(); });
    const go = ids => {
      for (const id of ids) sentIds.add(id);
      const list = ids.filter(id => movement[id]);
      if (!list.length) { for (const id of ids) arrived.add(id); pump(); return; }
      const before = new Map(list.map(id => [id, this.c.moves.get(id)]));
      const started = this.send(d, list, movement, { ...extra, gid: d.gid }, null);
      for (const id of list) if (!started.includes(id)) arrived.add(id);
      for (const id of started) {
        const mv = this.c.moves.get(id);
        if (!mv || mv === before.get(id)) { arrived.add(id); continue; }
        // send().then(): once the server has the batch, watch its arrival (an echo of this client's own update).
        const key = `${id}:${mv.mid}`;
        this.arrivalWaits.set(key, () => { this.arrivalWaits.delete(key); if (g.stopped) { this.c.stopMovement(id); } watchArrival(id); });
      }
      pump();
    };
    // group.mjs commitFight vet() (0.8.1, SIM-02 / SIM-03): a member's start is read when it sets off.
    const vet = id => {
      const t = this.doc(id);
      if (!t || !movement[id]?.length) return "go";
      const pts = [{ x: t.x, y: t.y }, ...movement[id]];
      const walking = this.walkingOutside(g.ids);
      const walkers = [...walking, ...this.liveFor(g.ids, { skip: new Set(walking.map(w => w.id)) }).walkers];
      if (walkers.length && walkersMeet([{ points: pts, r: t.r, speed: SPEED, delay: 0 }], walkers, { combat: true })) return "wait";
      const others = [...this.c.view.values()].filter(o => o.id !== id).map(o => ({ x: o.x, y: o.y, r: o.r }));
      const p = freePrefix(pts, t.r, others, { allowed: c => onCell(c, t.w, t.h) });
      if (p.full) return "go";
      this.env.record?.("cut", { why: "fightStanding", id });
      if (p.points.length < 2) { delete movement[id]; return "stay"; }
      movement[id] = p.points.slice(1);
      return "go";
    };
    const pump = () => {
      if (g.stopped || this.groups.get(d.gid) !== g) return;
      const ready = seqr.order.filter(id => !sentIds.has(id) && movement[id] && (seqr.after[id] ?? []).every(x => arrived.has(x)));
      const going = [];
      let held = false;
      for (const id of ready) {
        const v = this.env.noVet ? "go" : vet(id);
        if (v === "wait") { held = true; continue; }
        if (v === "stay") { sentIds.add(id); arrived.add(id); continue; }
        going.push(id);
      }
      if (going.length) go(going);
      if (held && !g.retry && !expired(d.run, this.now)) {
        g.retry = this.c.setTimeout(() => { g.retry = null; pump(); }, Math.max(capped(d.run, this.now, FOREIGN_WAIT_MS), 1));
        g.timers.push(g.retry);
      }
      finishUp();
    };
    g.timers.push(this.c.setTimeout(() => {
      if (this.groups.get(d.gid) !== g) return;
      const left = seqr.order.filter(id => !sentIds.has(id) && movement[id]);
      if (left.length) this.tell("short", "fightDeadline");
      if (!over(d.run)) lifeStep(d.run, "rested", { now: this.now, why: "deadline" });
      this.forget(d.gid);
    }, Math.max(lifeLeft(d.run, this.now), 1)));
    pump();
  }
  /** group.mjs arrivalOf(): this client's own move ended (core's movement promise) and drawn at rest here. */
  arrivalOf(id, fn) {
    const check = () => {
      if (this.c.moves.has(id) || this.doc(id)?.mv?.state === "pending") { this.c.setTimeout(check, 20); return; }
      this.c.whenDrawnAtRest(id, fn);
    };
    check();
  }

  /* ---------------- the background tab (group.mjs flushGroups / flush) ---------------- */

  onHidden() {
    for (const g of [...this.groups.values()]) {
      try { this.flush(g); } catch (err) { this.env.record?.("error", { client: this.c.id, where: "flush", err: String(err?.stack ?? err) }); }
    }
  }
  flush(g) {
    if (g.stopped || !g.pending?.size || g.d.combat) return 0;
    const wavesLeft = [...g.pending].sort((a, b) => a.at - b.at);
    const movementOf = id => wavesLeft.find(w => w.movement?.[id])?.movement?.[id] ?? null;
    const ids = [...new Set(wavesLeft.flatMap(w => w.ids))].filter(id => g.ids.has(id));
    const list = ids.map(id => {
      const t = this.doc(id);
      const m = movementOf(id);
      return { id, r: t.r, w: t.w, h: t.h, speed: SPEED, delay: 0, cut: null, m, points: [{ x: t.x, y: t.y }, ...(m ?? [])] };
    }).filter(e => e.m && e.points.length >= 2);
    const walkers = [];
    for (const s of g.sent) for (const id of s.ids) {
      const st = g.d.starts.get(id);
      const m = s.movement?.[id];
      if (!st || !m?.length) continue;
      walkers.push({ id, r: this.doc(id).r, speed: SPEED, delay: s.at - this.now, points: [st, ...m] });
    }
    const statics = this.standingOutside(g.ids);
    const gen = settle(list, { statics, walkers, combat: false, allowedFor: e => ((e.w ?? 1) > 1 || (e.h ?? 1) > 1 ? c => onCell(c, e.w, e.h) : null) });
    let v = gen.next();
    while (!v.done) v = gen.next();
    const movement = {};
    const send = [];
    for (const e of list) {
      const r = v.value.get(e.id);
      if (r?.still) continue;
      const pts = r?.points ?? e.points;
      if (pts.length < 2) continue;
      movement[e.id] = pts.slice(1);
      send.push(e.id);
    }
    for (const w of wavesLeft) g.pending.delete(w);
    this.env.record?.("flush", { client: this.c.id, members: send.length, of: list.length });
    if (!send.length) return 0;
    this.sendWave(g, { at: wavesLeft[0].at, ids: send, movement }, send, movement);
    return send.length;
  }

  /* ---------------- click to stop (stop.mjs stopToken) ---------------- */

  /** A click on token `id` here. Returns what it did, or null (not armed, not moving, not this user's to stop). */
  click(id) {
    const d = this.doc(id);
    if (!d || !this.moving(id)) return null;
    const combat = this.env.server.inCombat;
    const owner = this.c.isGM || d.owner === this.c.id;
    if (!owner) return null;
    if (combat) return this.fightClick(id);
    const tag = this.tags.get(id);
    const held = this.groupOf.has(id);
    let ids = [id];
    if (held) ids = [...this.groups.get(this.groupOf.get(id)).ids];
    else if (tag && this.now - tag.at < 60000) ids = [...this.tags].filter(([, t]) => t.gid === tag.gid).map(([k]) => k);
    const owns = x => this.c.isGM || this.doc(x)?.owner === this.c.id;
    const others = ids.filter(x => x !== id);
    const whole = others.every(owns);
    const list = [id, ...others.filter(owns)];
    if (held && whole) this.groupCancel(id);
    const claims = [];
    const skip = new Set(list);
    const out = [];
    for (const t of list) {
      this.guardCancel(t);
      if (!this.c.animating(t)) continue;
      const at = this.stopSpot(t, skip, claims);
      claims.push({ id: t, x: at.p.x, y: at.p.y, r: this.doc(t).r });
      this.displace(t, at);
      out.push(t);
      if (!(held && whole)) this.groupStopOne(t, at.p);
    }
    this.env.record?.("stop", { client: this.c.id, id, members: out.length, whole: held && whole });
    return out;
  }
  /** stop.mjs stopSpot / pastDoor: where it is drawn, or just past a door's line along its own route. */
  stopSpot(id, skip, claims) {
    const drawn = this.c.drawn(id);
    const t = this.doc(id);
    const lines = this.env.world.map.doors;
    const across = p => lines.some(l => segDist(p, l.a, l.b) < t.r - 1e-6);
    if (!across(drawn)) return { drawn, p: drawn, near: null, via: [] };
    const taken = p => {
      for (const [oid, o] of this.c.view) {
        if (oid === id || skip.has(oid)) continue;
        if (dist(p, o) < t.r + o.r - 1e-6) return true;
        if (this.c.animating(oid) && dist(p, this.c.drawn(oid)) < t.r + o.r - 1e-6) return true;
      }
      return claims.some(c => c.id !== id && dist(p, c) < t.r + c.r - 1e-6);
    };
    const ahead = this.c.wayAhead(id).slice(1);
    const legs = this.c.legs.get(id) ?? [];
    const behind = [...legs.filter(l => l.t1 <= this.now).map(l => l.a)].reverse();
    const along = list => {
      const via = [];
      let prev = drawn, walked = 0;
      for (const q of list) {
        const L = dist(prev, q);
        const n = Math.max(1, Math.ceil(L / 0.05));
        for (let i = 1; i <= n; i++) {
          walked += L / n;
          if (walked > PAST_DOOR_SQUARES) return null;
          const p = { x: prev.x + ((q.x - prev.x) * i) / n, y: prev.y + ((q.y - prev.y) * i) / n };
          if (!across(p)) return taken(p) ? null : { p, via };
        }
        via.push(q);
        prev = q;
      }
      return null;
    };
    const past = along(ahead) ?? along(behind);
    if (!past) return { drawn, p: drawn, near: null, via: [] };
    return { drawn, p: past.p, near: drawn, via: past.via };
  }
  /** stop.mjs displace(): unanimated to where it is drawn (keeping its place in the order); past a door, a walk on. */
  displace(id, at) {
    this.c.stopMovement(id);
    this.c.stopAnimation(id);
    const first = at.near ?? at.p;
    this.c.move(id, [first], { animate: false, options: { keep: true, stopAt: at.p }, why: "stop" });
    if (at.near) {
      const wps = [...at.via, at.p];
      this.afterEcho(id, () => this.c.move(id, wps, { options: { keep: true, ...this.republish(id, first, wps) }, why: "stopWalk" }));
    }
  }
  /** Run fn once this client's last update of token id has come back. */
  afterEcho(id, fn) {
    const mid = `${this.c.id}:${this.c.mids}`;
    const key = `${id}:${mid}`;
    this.arrivalWaits.set(key, () => { this.arrivalWaits.delete(key); fn(); });
  }
  republish(id, from, wps) {
    const t = this.doc(id);
    const wire = encode({ rid: `rp${this.c.id}${this.c.sim.s}`, user: this.c.id, scene: null, combat: false, members: [{ id, r: t.r, speed: SPEED, delay: 0, points: [from, ...wps] }] });
    return wire ? { plan: wire, rids: { [id]: wire.rid } } : {};
  }
  /** group.mjs groupStopOne(): a member stopped; the group's other walks stop short behind it. */
  groupStopOne(id, spot) {
    const gid = this.groupOf.get(id);
    const g = gid ? this.groups.get(gid) : null;
    if (!g) return [];
    g.ids.delete(id); this.groupOf.delete(id);
    if (!spot || g.d.combat) return [];
    const r = this.doc(id).r;
    g.avoid.push({ x: spot.x, y: spot.y, r });
    const out = [];
    for (const oid of g.ids) {
      if (!this.c.animating(oid)) continue;
      const d = this.doc(oid);
      if (d?.mv?.user !== this.c.id) continue;
      const way = this.c.wayAhead(oid);
      if (way.length < 2) continue;
      const circles = g.avoid.filter(a => dist(way[0], a) >= a.r + d.r - 1e-6);
      const p = freePrefix(way, d.r, circles);
      if (p.full) continue;
      out.push(oid);
      this.c.stopAnimation(oid);
      this.c.move(oid, [way[0]], { animate: false, options: { keep: true }, why: "stopOne" });
      const wps = p.points.slice(1);
      if (wps.length) this.afterEcho(oid, () => this.c.move(oid, wps, { options: { keep: true, ...this.republish(oid, way[0], wps) }, why: "behindStopped" }));
    }
    return out;
  }
  /** A fight: the clicked one and its group finish the square they are in (stopMovement), or a relay to the starter. */
  fightClick(id) {
    const d = this.doc(id);
    if (d?.mv?.user === this.c.id) return this.fightStopGroup(id, "click");
    // stop.mjs act("query"): the starter stops it (a relay through the server).
    this.c.emit({ type: "relayStop", id, to: d?.mv?.user });
    return [id];
  }
  fightStopGroup(id, why) {
    const ids = new Set([id, ...this.groupCancel(id)]);
    const out = [];
    for (const x of ids) if (this.c.stopMovement(x)) out.push(x);
    this.env.record?.("stop", { client: this.c.id, id, members: out.length, fight: true, why });
    return out;
  }

  /* ---------------- door cuts (group.mjs cutAcross / fightCut / freeCut) ---------------- */

  cutAcross(door) {
    if (!door) return [];
    const fight = new Set();
    const movers = [];
    for (const [id, d] of this.c.view) {
      if (d.mv?.user !== this.c.id) continue;
      const live = this.c.animating(id) || d.mv.state === "pending";
      if (!live) continue;
      if (d.mv.combat) {
        const mv = this.c.moves.get(id);
        const way = [this.c.drawn(id), { x: d.x, y: d.y }, ...(mv ? mv.segs.slice(mv.k + 1).flat() : [])];
        for (let k = 1; k < way.length; k++) if (crosses(way[k - 1], way[k], door.a, door.b)) { fight.add(id); break; }
        continue;
      }
      const way = this.c.wayAhead(id);
      // How far along it is to the wall (to the end of the leg that crosses it): the nearer chooses its square first.
      let along = 0, hit = false;
      for (let k = 1; k < way.length; k++) {
        along += dist(way[k - 1], way[k]);
        if (crosses(way[k - 1], way[k], door.a, door.b)) { hit = true; break; }
      }
      if (hit) movers.push({ id, d, way, along });
    }
    const out = [];
    if (fight.size) out.push(...this.fightCut(fight));
    if (movers.length) out.push(...this.freeCut(movers, door));
    if (out.length) this.env.record?.("cut", { client: this.c.id, why: "wall", members: out.length, fight: out.filter(o => o.combat).map(o => o.id) });
    return out;
  }
  fightCut(ids) {
    const all = new Set(ids);
    for (const id of ids) {
      const gid = this.groupOf.get(id);
      const g = gid ? this.groups.get(gid) : null;
      if (!g) continue;
      for (const m of g.ids) all.add(m);
      this.groupCancel(id);
    }
    const out = [];
    for (const id of all) if (this.c.stopMovement(id)) out.push(id);
    return out.map(id => ({ id, combat: true }));
  }
  /**
   * group.mjs freeCut() with group-adapter cutAtWalls(): each mover (the nearest to the wall first) cut on a whole
   * square before the wall along its own way, not one another token holds or a member cut before it took, its last leg
   * clear of those (HX1-08); with none (already in the doorway), the nearest clear whole square round it. A displace to
   * where it is drawn, then the walk to that square.
   */
  freeCut(movers, door) {
    movers.sort((a, b) => a.along - b.along);
    const ids = new Set(movers.map(m => m.id));
    const claims = [];
    const out = [];
    const g = this.grid();
    const lines = this.shutLines();
    for (const mv of movers) {
      const { id, d, way } = mv;
      const taken = this.takenFor(id, claims, ids);
      const clear = (p, q) => claims.every(c => c.id === id || segDist(c, p, q) >= c.r + d.r - 0.15);
      const here = way[0];
      let kept = this.cutAtWalls(id, here, way.slice(1), { taken, clear }).waypoints;
      if (!kept.length) {
        // clearOfWalls(snap, prefer apart): the nearest free whole square (3 round), its body clear of every door's
        // line, reached from where it is drawn without a wall, and when one is in reach its walk apart from the other
        // cut members' walks; else any free square that fits.
        const others = movers.filter(o => o !== mv).map(o => { const c = claims.find(q => q.id === o.id); return { a: o.way[0], b: c ?? o.way[0], r: o.d.r }; });
        const apart = c => others.every(o => segSegDist(here, c, o.a, o.b) >= d.r + o.r - 0.15);
        const cands = [];
        const bx = Math.floor(here.x), by = Math.floor(here.y);
        for (let di = -3; di <= 4; di++) for (let dj = -3; dj <= 4; dj++) cands.push(this.snapFor(d, { x: bx + dj + 0.5, y: by + di + 0.5 }));
        cands.sort((a, b) => dist(a, here) - dist(b, here));
        const doorsAll = this.env.world.map.doors;
        const fits = c => g.walkable(d, c) && !doorsAll.some(l => segDist(c, l.a, l.b) < d.r - 0.005);
        const ok = c => fits(c) && !this.blocked(d, here, c);
        const onGrid = dist(this.snapFor(d, here), here) < 1e-9;
        let spot = onGrid && fits(here) && !taken(here) && apart(here) ? here : null;
        spot ??= cands.find(c => !taken(c) && ok(c) && apart(c)) ?? cands.find(c => !taken(c) && ok(c)) ?? cands.find(c => !taken(c) && fits(c)) ?? null;
        if (spot && dist(spot, here) > 1e-6) kept = [spot];
      }
      const end = kept.at(-1) ?? here;
      claims.push({ id, x: end.x, y: end.y, r: d.r });
      this.c.stopMovement(id);
      this.c.stopAnimation(id);
      this.c.move(id, [here], { animate: false, options: { keep: true }, why: "cutDisplace" });
      if (kept.length) this.afterEcho(id, () => this.c.move(id, kept, { options: { keep: true, ...this.republish(id, here, kept) }, why: "cutWalk" }));
      out.push({ id, combat: false });
    }
    for (const gg of this.groups.values()) gg.claims.push(...claims);
    return out;
  }
  snapFor(d, c) { return { x: d.w % 2 ? Math.floor(c.x) + 0.5 : Math.round(c.x), y: d.h % 2 ? Math.floor(c.y) + 0.5 : Math.round(c.y) }; }
  /** checkCollision: a leg (one hair past its end) through a shut door's line or rock. */
  blocked(d, a, b) {
    const L = dist(a, b);
    const e = L > 0 ? { x: b.x + ((b.x - a.x) / L) * 0.01, y: b.y + ((b.y - a.y) / L) * 0.01 } : b;
    return this.shutLines().some(l => crosses(a, e, l.a, l.b)) || !this.grid().lineFits(a, b, d.w, d.h);
  }
  /**
   * group.mjs takenFor / takenForCut: would token `id` at p come inside another token at rest where the server has it
   * (a mover's source: where it stops), a reserved walk's end, or a spot `claims` holds? `skip`: tokens counted by their
   * claims instead.
   */
  takenFor(id, claims, skip = null) {
    const d = this.doc(id);
    return p => {
      for (const [oid, o] of this.c.view) if (oid !== id && !skip?.has(oid) && dist(p, o) < d.r + o.r - 1e-6) return true;
      for (const w of walkersOf(this.reg, { now: this.now, exclude: new Set([id]) })) if (dist(p, w.points.at(-1)) < d.r + w.r - 1e-6) return true;
      return (claims ?? []).some(c => c.id !== id && dist(p, c) < d.r + c.r - 1e-6);
    };
  }
  /** group-adapter cutAtWalls(): the way cut on a whole square before the first leg a wall blocks now. */
  cutAtWalls(id, here, wps, { taken = null, clear = null } = {}) {
    const d = this.doc(id);
    const home = this.snapFor(d, here);
    let prev = here;
    for (let k = 0; k < wps.length; k++) {
      if (!this.blocked(d, prev, wps[k])) { prev = wps[k]; continue; }
      const seen = new Set();
      for (let seg = k; seg >= 0; seg--) {
        const from = seg === 0 ? here : wps[seg - 1];
        const to = wps[seg];
        const n = Math.max(Math.ceil(dist(from, to) / 0.25), 1);
        for (let q = n; q >= 0; q--) {
          const cand = this.snapFor(d, { x: from.x + (to.x - from.x) * (q / n), y: from.y + (to.y - from.y) * (q / n) });
          if (dist(cand, home) < 1e-9) return { waypoints: [], cut: true };
          const key = `${cand.x},${cand.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (this.blocked(d, from, cand) || taken?.(cand) || (clear && !clear(from, cand))) continue;
          return { waypoints: [...wps.slice(0, seg), cand], cut: true };
        }
      }
      return { waypoints: [], cut: true };
    }
    return { waypoints: wps, cut: false };
  }

  /* ---------------- the runtime yield guard (guard.mjs), out of combat ---------------- */

  startGuard() {
    const tick = () => {
      try { this.guardTick(); } catch (err) { this.env.record?.("error", { client: this.c.id, where: "guard", err: String(err?.stack ?? err) }); }
      this.c.setTimeout(tick, GUARD.everyMs);
    };
    this.c.setTimeout(tick, GUARD.everyMs);
  }
  guardCancel(id) { this.yields.delete(id); }
  entry(id) {
    const d = this.doc(id);
    const moving = this.moving(id);
    const pts = moving ? [...this.c.wayAhead(id), ...(d.mv?.state === "pending" ? d.mv.rest ?? [] : [])] : null;
    return { id, c: this.c.drawn(id), r: d.r, w: d.w, h: d.h, points: pts?.length >= 2 ? pts : null, speed: SPEED, moving, prio: priorityOf(this.reg, id) };
  }
  othersFor(me, { resuming = false } = {}) {
    const out = [];
    for (const [id] of this.c.view) {
      if (id === me.id) continue;
      const e = this.entry(id);
      const o = { id, c: e.c, r: e.r, points: e.points, speed: SPEED, delay: 0, standing: !e.moving, prio: e.prio };
      o.yieldTo = yieldsTo(me, o) || (resuming && e.moving);
      o.samePlan = Number.isFinite(me.prio?.ord) && me.prio.ord === e.prio?.ord;
      out.push(o);
      if (e.moving && !o.yieldTo && !o.samePlan && e.points?.length >= 2) {
        let L = 0;
        for (let k = 1; k < e.points.length; k++) L += dist(e.points[k - 1], e.points[k]);
        if ((L / SPEED) * 1000 <= GUARD.horizonMs) out.push({ ...o, c: e.points.at(-1), points: null, standing: true, yieldTo: true, restsSoon: true });
      }
    }
    const drawnMoving = new Set([...this.c.view.keys()].filter(id => this.moving(id)));
    for (const wk of walkersOf(this.reg, { now: this.now, exclude: new Set([me.id]) })) {
      if (!(wk.delay > 0) || drawnMoving.has(wk.id) || wk.delay > GUARD.horizonMs) continue;
      const o = { id: wk.id, c: wk.points[0], r: wk.r, points: wk.points, speed: wk.speed, delay: wk.delay, standing: false, prio: { ord: wk.ord, k: wk.k, id: wk.id } };
      o.yieldTo = yieldsTo(me, o);
      out.push(o);
    }
    return out;
  }
  guardTick() {
    const now = this.now;
    for (const [id, d] of this.c.view) {
      if (d.mv?.user !== this.c.id || d.mv.combat || !this.c.animating(id)) continue;
      let y = this.yields.get(id);
      if (!y) { y = newYield(); y.id = id; this.yields.set(id, y); }
      if (y.busy || y.phase !== "walk") continue;
      const me = this.entry(id);
      if (!me.points) continue;
      const hit = conflictAhead(me, this.othersFor(me), { horizonMs: GUARD.horizonMs });
      if (!hit) continue;
      const gid = this.groupOf.get(id);
      const run = gid ? this.groups.get(gid)?.run : null;
      if (run) y.restAt = run.deadline;
      const act = stepYield(y, { now, conflict: true });
      this.env.record?.("fire", { client: this.c.id, id, against: hit.id, standing: !!hit.standing });
      if (act === "pause") this.pause(y, id);
      else if (act === "rest") this.yields.delete(id);
    }
    for (const [id, y] of [...this.yields]) {
      if (y.phase === "walk" && !this.c.animating(id) && !y.busy) { this.yields.delete(id); continue; }
      if (y.phase !== "held" || y.busy) continue;
      const me = this.entry(id);
      const pts = [me.c, ...(y.route ?? [])];
      const mine = { ...me, points: pts.length >= 2 ? pts : null };
      const hit = mine.points ? conflictAhead(mine, this.othersFor(mine, { resuming: true }), { horizonMs: GUARD.horizonMs }) : null;
      const standing = [...this.c.view.keys()].filter(o => o !== id && !this.moving(o)).map(o => { const e = this.doc(o); return { id: o, x: e.x, y: e.y, r: e.r }; });
      const blocked = mine.points ? standingOnRoute(mine.points, me.r, standing, { tol: GUARD.standTol }) : null;
      const act = stepYield(y, { now, clear: !hit && !blocked });
      if (act === "resume") this.resume(y, id);
      else if (act === "reroute") y.phase = "held";
      else if (act === "rest") { this.yields.delete(id); this.env.record?.("guardRest", { client: this.c.id, id }); }
    }
  }
  pause(y, id) {
    const drawn = this.c.drawn(id);
    y.route = this.c.wayAhead(id).slice(1);
    y.pauseAt = drawn;
    y.busy = true;
    this.c.stopAnimation(id);
    this.c.move(id, [drawn], { animate: false, options: { guard: true }, why: "guardPause" });
    this.afterEcho(id, () => { y.busy = false; });
  }
  resume(y, id) {
    if (!y.route?.length) { this.yields.delete(id); return; }
    const from = { ...this.doc(id) };
    let wps = y.route;
    const lines = this.shutLines();
    if (lines.length) {
      const cut = beforeLine([from, ...wps], this.doc(id).r, lines);
      if (cut) { if (cut.length < 2) { this.yields.delete(id); return; } wps = cut.slice(1); }
    }
    y.busy = true;
    this.c.move(id, wps, { options: { guard: true, ...this.republish(id, from, wps) }, why: "guardResume" });
    this.afterEcho(id, () => { y.busy = false; });
  }
}
