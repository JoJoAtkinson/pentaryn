/**
 * The simulator's world (Fable's review §5): one fake clock, a server that applies token updates one at a time and
 * broadcasts them in its order, virtual clients that receive them over jittered links, draw tokens the way core
 * 14.370 animates them, stall (a fog extraction holds the main thread 150-1,400 ms) and go to the background, and core's
 * own movement on the client that started a move (a fight's checkpoint at every square is a separate update, continued
 * from that client as core's #continueMovement does). Synthetic only: no Foundry, no DOM, no Promises (every async step
 * is a callback on the fake clock, so a seed replays exactly).
 *
 * Units: squares. A position is a token's centre ({ x, y }, a 1x1 token on cell (i, j) at (j + 0.5, i + 0.5)).
 */

/** mulberry32: a small seeded PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FRAME_MS = 1000 / 60;
export const SPEED = 6;                       // squares per second (core's default movement speed)
export const AVG_LATENCY = 58;                // game.time.averageLatency (ms) core's continuation subtracts twice
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** A binary heap of events ordered by (t, seq). */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.t < y.t || (x.t === y.t && x.s < y.s); }
  push(e) {
    const a = this.a; a.push(e);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
  peek() { return this.a[0]; }
}

export class Sim {
  constructor(seed) {
    this.seed = seed;
    this.now = 0;
    this.q = new Heap();
    this.s = 0;
    this.rand = rng(seed);
    this.errors = [];
  }
  at(t, fn) {
    const e = { t: Math.max(t, this.now), s: this.s++, fn, dead: false };
    this.q.push(e);
    return e;
  }
  after(ms, fn) { return this.at(this.now + Math.max(ms, 0), fn); }
  cancel(e) { if (e) e.dead = true; }
  run(until) {
    while (this.q.size && this.q.peek().t <= until) {
      const e = this.q.pop();
      if (e.dead) continue;
      this.now = e.t;
      try { e.fn(); } catch (err) { this.errors.push({ t: this.now, err }); }
    }
    this.now = Math.max(this.now, until);
  }
  uniform(a, b) { return a + (b - a) * this.rand(); }
  pick(list) { return list[Math.floor(this.rand() * list.length)]; }
}

/**
 * The links. Each direction of each client is FIFO (a WebSocket over TCP): a message is never delivered before the one
 * sent before it. Latency is jittered per message (11-105 ms, the tunnel's measured spread); "loss" is what TCP makes
 * of it: a lost segment is retransmitted after an RTO, and everything behind it on that link waits (head-of-line).
 * A dropped socket (`offline` windows) loses what the server broadcasts to it meanwhile; what the client emits is
 * buffered and sent on reconnect (socket.io's default); on reconnect the client reloads (engine Client#reload).
 */
export class Net {
  constructor(sim, { latency = [11, 105], loss = 0, rto = [200, 600], knotMs = 250 } = {}) {
    this.sim = sim;
    this.latency = latency;
    this.loss = loss;
    this.rto = rto;
    this.knotMs = knotMs;
    this.links = new Map();
  }
  /**
   * One link's latency at time t: a random function of time (a knot every knotMs, each uniform in the spread, linear
   * between), plus a hair of per-packet jitter. Packets sent together travel together (the same path, the same
   * queue), as on a real connection; across seconds the latency wanders over the whole 11-105 ms spread.
   */
  linkLatency(key, t) {
    let L = this.links.get(key);
    if (!L) { L = new Map(); this.links.set(key, L); }
    const knot = k => { if (!L.has(k)) L.set(k, this.sim.uniform(this.latency[0], this.latency[1])); return L.get(k); };
    const k = Math.floor(t / this.knotMs), f = t / this.knotMs - k;
    return knot(k) * (1 - f) + knot(k + 1) * f + this.sim.uniform(0, 3);
  }
  delay(key = "any") {
    let d = this.linkLatency(key, this.sim.now);
    if (this.loss > 0 && this.sim.rand() < this.loss) {
      const extra = this.sim.uniform(this.rto[0], this.rto[1]);
      d += extra;
      (this.losses ??= []).push({ key, t: this.sim.now, extra });
    }
    return d;
  }
  up(client, msg, server) {
    let t = this.sim.now;
    const w = client.offlineAt(t);
    if (w) t = w.b;
    const at = Math.max(t + this.delay(`up:${client.id}`), client.upLast + 0.01);
    client.upLast = at;
    this.sim.at(at, () => server.receive(client, msg));
  }
  down(client, msg) {
    if (client.offlineAt(this.sim.now)) return;
    const at = Math.max(this.sim.now + this.delay(`down:${client.id}`), client.downLast + 0.01);
    if (client.offlineAt(at)) return;
    client.downLast = at;
    client.exec(at, () => client.onBroadcast(msg));
  }
}

/**
 * The server: the truth of every token, applied one update at a time in arrival order (each broadcast carries its
 * `ord`). Records every write for the invariants (server.log).
 */
export class Server {
  constructor(sim, net) {
    this.sim = sim;
    this.net = net;
    this.clients = [];
    this.tokens = new Map();
    this.doors = new Map();
    this.ord = 0;
    this.log = [];
    this.inCombat = false;
    this.lastWrite = new Map();     // token id → the ord of the last move / displace the server applied
  }
  addToken(t) { this.tokens.set(t.id, { ...t, cost: 0, mv: null }); }
  snapshot() {
    return { tokens: [...this.tokens.values()].map(t => ({ ...t, mv: t.mv ? { ...t.mv } : null })), doors: new Map(this.doors) };
  }
  receive(from, msg) {
    const out = { ...msg, ord: ++this.ord, at: this.sim.now, user: from.id };
    if (msg.type === "update") {
      out.items = [];
      for (const it of msg.items) {
        const tok = this.tokens.get(it.id);
        if (!tok) continue;
        const before = { x: tok.x, y: tok.y };
        if (it.kind === "move" || it.kind === "displace") this.lastWrite.set(it.id, out.ord);
        if (it.kind === "move" && it.waypoints?.length) {
          const end = it.waypoints.at(-1);
          tok.x = end.x; tok.y = end.y;
          let steps = 0;
          if (it.combat) {
            let p = before;
            for (const q of it.waypoints) { steps += Math.round(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))); p = q; }
            tok.cost += steps;
          }
          tok.mv = { mid: it.mid, user: from.id, state: it.pending ? "pending" : "completed", combat: !!it.combat };
          this.log.push({ t: this.sim.now, ord: out.ord, user: from.id, id: it.id, kind: "move", mid: it.mid, from: before, waypoints: it.waypoints.map(p => ({ ...p })), combat: !!it.combat, steps, why: it.why ?? null, gid: it.gid ?? null });
          out.items.push({ ...it, from: before });
        } else if (it.kind === "displace") {
          tok.x = it.to.x; tok.y = it.to.y;
          tok.mv = { mid: it.mid, user: from.id, state: "completed", combat: !!it.combat };
          this.log.push({ t: this.sim.now, ord: out.ord, user: from.id, id: it.id, kind: "displace", mid: it.mid, from: before, to: { ...it.to }, combat: !!it.combat, why: it.why ?? null });
          out.items.push({ ...it, from: before });
        } else {
          out.items.push({ ...it, kind: "none", from: before });
        }
      }
    } else if (msg.type === "stop") {
      const tok = this.tokens.get(msg.id);
      if (tok?.mv && tok.mv.mid === msg.mid) tok.mv.state = "stopped";
      this.log.push({ t: this.sim.now, ord: out.ord, user: from.id, id: msg.id, kind: "stop", mid: msg.mid });
    } else if (msg.type === "door") {
      this.doors.set(msg.door, msg.open);
      this.log.push({ t: this.sim.now, ord: out.ord, user: from.id, kind: "door", door: msg.door, open: msg.open });
    }
    for (const c of this.clients) this.net.down(c, out);
  }
}

/**
 * A browser tab (or the headless bot, `canvas: false`). Everything it runs goes through exec(): a stall (its main
 * thread held) defers it to the stall's end; a hidden tab throttles its timers to whole seconds and draws no frames
 * (core's animations do not advance; PIXI's elapsed time is uncapped, so they jump to where they should be at the next
 * frame). Drawing is analytic: a token's legs are core's chained tweens (each starts where the last ended, carrying the
 * overshoot; a fresh one starts when its update is handled, the module's first-frame cap).
 */
export class Client {
  constructor(sim, net, server, { id, isGM = false, canvas = true, name = id } = {}) {
    Object.assign(this, { sim, net, server, id, isGM, canvas, name });
    this.view = new Map();          // token id → { id, x, y, w, h, r, owner, mv }
    this.legs = new Map();          // token id → [{ a, b, t0, t1 }]
    this.pins = new Map();          // token id → where it is held drawn (the module's stopWhereDrawn + pinDrawn)
    this.doors = new Map();
    this.stalls = [];               // [{ a, b }]
    this.hidden = [];               // [{ a, b }]
    this.offline = [];              // [{ a, b }]
    this.upLast = 0; this.downLast = 0;
    this.listeners = [];            // (msg) => void, after the client applied a broadcast
    this.visListeners = [];
    this.moves = new Map();         // core: token id → this client's own live movement { mid, segs, k, stopped, combat, why }
    this.mids = 0;
    this.reloads = 0;
    this.gen = 0;                   // bumped on reload: timers of the old page never fire
    this.seen = new Map();          // token id → the ord of the last write of it this client applied
    this.sent = [];                 // { t, msg }: everything this client emitted (when its code ran)
    this.doorKnown = new Map();     // door id → when this client applied its shutting
  }
  init(snapshot) {
    for (const t of snapshot.tokens) this.view.set(t.id, { ...t, mv: t.mv ? { ...t.mv } : null });
    this.doors = new Map(snapshot.doors);
  }
  stalledAt(t) { return this.stalls.find(s => s.a <= t && t < s.b) ?? null; }
  hiddenAt(t) { return this.hidden.find(s => s.a <= t && t < s.b) ?? null; }
  offlineAt(t) { return this.offline.find(s => s.a <= t && t < s.b) ?? null; }
  /** Run fn on this client's main thread at t (after any stall holding it then). */
  exec(t, fn, gen = this.gen) {
    const self = this;
    const run = () => {
      if (gen !== self.gen) return;
      const st = self.stalledAt(self.sim.now);
      if (st) { self.sim.at(st.b, run); return; }
      fn();
    };
    return this.sim.at(t, run);
  }
  /** setTimeout as the browser runs it (a hidden tab: at the next whole second at the soonest). */
  setTimeout(fn, ms) {
    let t = this.sim.now + Math.max(ms, 0);
    if (this.hiddenAt(t)) t = Math.max(t, Math.ceil(t / 1000) * 1000);
    return this.exec(t, fn);
  }
  clearTimeout(e) { this.sim.cancel(e); }
  /** The first time at or after t at which this tab draws a frame (Infinity: never again). */
  frameAt(t) {
    if (!this.canvas) return Infinity;
    for (let guard = 0; guard < 100; guard++) {
      const st = this.stalledAt(t); if (st) { t = st.b; continue; }
      const h = this.hiddenAt(t); if (h) { if (!Number.isFinite(h.b)) return Infinity; t = h.b; continue; }
      return Math.ceil(t / FRAME_MS - 1e-9) * FRAME_MS;
    }
    return Infinity;
  }
  drawing(t) { return this.canvas && !this.stalledAt(t) && !this.hiddenAt(t); }

  /* ---- drawing ---- */
  drawn(id, t = this.sim.now) {
    const d = this.view.get(id);
    const pin = this.pins.get(id);
    if (pin) return { ...pin };
    const legs = this.legs.get(id);
    if (!legs?.length) return d ? { x: d.x, y: d.y } : null;
    for (const l of legs) {
      if (t < l.t0) return { ...l.a };
      if (t < l.t1) { const f = (t - l.t0) / (l.t1 - l.t0); return { x: l.a.x + (l.b.x - l.a.x) * f, y: l.a.y + (l.b.y - l.a.y) * f }; }
    }
    return { ...legs.at(-1).b };
  }
  /** Is token id drawn walking here at t (a tween under way)? */
  animating(id, t = this.sim.now) {
    const legs = this.legs.get(id);
    return !!legs?.length && t < legs.at(-1).t1 - 1e-9;
  }
  animEnd(id) { return this.legs.get(id)?.at(-1)?.t1 ?? -Infinity; }
  /** The rest of token id's drawn way from t: [drawn now, ...leg ends ahead]. */
  wayAhead(id, t = this.sim.now) {
    const legs = this.legs.get(id) ?? [];
    const out = [this.drawn(id, t)];
    for (const l of legs) if (l.t1 > t + 1e-9) out.push({ ...l.b });
    return out;
  }
  addLegs(id, from, waypoints, speed = SPEED) {
    const legs = (this.legs.get(id) ?? []).filter(l => l.t1 > this.sim.now - 5000);
    let t = Math.max(this.sim.now, legs.at(-1)?.t1 ?? -Infinity);
    let a = legs.length && legs.at(-1).t1 > this.sim.now ? legs.at(-1).b : this.drawn(id) ?? from;
    for (const b of waypoints) {
      const dur = (dist(a, b) / speed) * 1000;
      if (dur > 1e-6) { legs.push({ a: { ...a }, b: { ...b }, t0: t, t1: t + dur }); t += dur; }
      a = b;
    }
    this.legs.set(id, legs);
  }
  /**
   * The module's stopWhereDrawn + pinDrawn: the tween stops and the token stays drawn where it is until the update
   * that stops it comes back (core's own stopAnimation would jump it to its source).
   */
  stopAnimation(id) {
    const p = this.drawn(id);
    this.legs.set(id, []);
    if (p) this.pins.set(id, { ...p });
    const d = this.view.get(id);
    return p ?? (d ? { x: d.x, y: d.y } : null);
  }
  /** Calls fn once token id's movement animation here has ended and a frame drew it (movementAnimationPromise). */
  whenDrawnAtRest(id, fn) {
    const gen = this.gen;
    const check = () => {
      if (gen !== this.gen) return;
      const end = this.animEnd(id);
      const f = this.frameAt(Math.max(end, this.sim.now));
      if (!Number.isFinite(f)) {
        // Hidden for good: never (as a background tab's animation promise).
        const h = this.hiddenAt(this.sim.now);
        if (h && Number.isFinite(h.b)) this.sim.at(h.b, check);
        return;
      }
      if (f > this.sim.now + 1e-9 || end > this.sim.now + 1e-9) { this.sim.at(Math.max(f, end), check); return; }
      fn();
    };
    this.exec(this.sim.now, check);
  }

  /* ---- the socket ---- */
  emit(msg) { this.sent.push({ t: this.sim.now, msg }); this.net.up(this, msg, this.server); }
  onBroadcast(msg) {
    if (msg.type === "update") {
      for (const it of msg.items) {
        const d = this.view.get(it.id);
        if (!d) continue;
        if (it.kind === "move" || it.kind === "displace") this.seen.set(it.id, msg.ord);
        if ((it.kind === "move" || it.kind === "displace") && this.pins.has(it.id)) {
          // A pinned token's own stop came back (or a newer move): drawn from where it is held.
          const pin = this.pins.get(it.id);
          this.pins.delete(it.id);
          if (it.kind === "move") this.legs.set(it.id, [{ a: pin, b: pin, t0: this.sim.now, t1: this.sim.now }]);
        }
        if (it.kind === "move") {
          this.addLegs(it.id, it.from, it.waypoints, it.speed ?? SPEED);
          const end = it.waypoints.at(-1);
          d.x = end.x; d.y = end.y;
          // Every client has the movement's pending waypoints (TokenDocument#movement.pending), not only its square under way.
          d.mv = { mid: it.mid, user: msg.user, state: it.pending ? "pending" : "completed", combat: !!it.combat, chain: it.chain ?? [], rest: it.pending ? (it.rest ?? []) : [] };
        } else if (it.kind === "displace") {
          this.legs.set(it.id, []);
          d.x = it.to.x; d.y = it.to.y;
          d.mv = { mid: it.mid, user: msg.user, state: "completed", combat: !!it.combat };
        }
      }
    } else if (msg.type === "stop") {
      const d = this.view.get(msg.id);
      if (d?.mv && d.mv.mid === msg.mid) { d.mv.state = "stopped"; d.mv.rest = []; }
    } else if (msg.type === "door") {
      this.doors.set(msg.door, msg.open);
      if (!msg.open && !this.doorKnown.has(msg.door)) this.doorKnown.set(msg.door, this.sim.now);
    }
    if (msg.type === "update" && msg.user === this.id) this.coreEcho(msg);
    for (const fn of this.listeners) fn(msg);
  }
  /** A reconnect: the page reloads (every timer of the old page is gone), and reads the world from the server. */
  reload() {
    this.gen += 1;
    this.reloads += 1;
    this.moves.clear();
    this.legs.clear();
    this.pins.clear();
    this.view.clear();
    this.init(this.server.snapshot());
    for (const [id, ord] of this.server.lastWrite) this.seen.set(id, ord);
    for (const fn of this.reloadListeners ?? []) fn();
  }

  /* ---- core's movement, on the client that starts it ---- */
  newMid() { return `${this.id}:${++this.mids}`; }
  /** The first waypoint index of `wps` (from `from`) whose leg enters a shut door's cell here, or -1. */
  doorCut(from, wps) {
    const shut = [...this.doors].filter(([, open]) => !open).map(([k]) => this.world.doorCell(k));
    if (!shut.length) return -1;
    let p = from;
    for (let k = 0; k < wps.length; k++) {
      if (shut.some(c => this.world.segEntersCell(p, wps[k], c))) return k;
      p = wps[k];
    }
    return -1;
  }
  /**
   * TokenDocument#move: `waypoints` after the token's place (squares). Out of combat one update (one checkpoint, at
   * the end); in a fight one update per square (the module's checkpoint at every square), each next square sent by
   * this client once the last one's animation here has run (or, a background tab, at once: core's waitPromise). Every
   * update is constrained by the walls this client knows (a shut door cuts the path before it). Returns the move.
   */
  move(id, waypoints, { combat = false, animate = true, options = {}, why = null, onSent = null, speed = SPEED } = {}) {
    const d = this.view.get(id);
    if (!d || !waypoints?.length) return null;
    if (!animate) {
      const mid = this.newMid();
      this.moves.delete(id);
      this.emit({ type: "update", items: [{ id, kind: "displace", mid, to: { ...waypoints.at(-1) }, combat, why }], options });
      return { mid };
    }
    const from = { x: d.x, y: d.y };
    let wps = waypoints.map(p => ({ x: p.x, y: p.y }));
    const cut = this.doorCut(from, wps);
    if (cut === 0) return null;
    if (cut > 0) wps = wps.slice(0, cut);
    const segs = combat ? wps.map(p => [p]) : [wps];
    const mv = { mid: this.newMid(), segs, k: 0, stopped: false, combat, why, speed, chain: [], from };
    this.moves.set(id, mv);
    this.sendSeg(id, mv, options, onSent);
    return mv;
  }
  sendSeg(id, mv, options = {}, onSent = null) {
    const seg = mv.segs[mv.k];
    const pending = mv.k < mv.segs.length - 1;
    mv.sentAt = this.sim.now;
    mv.onSent = onSent;
    const prev = mv.k === 0 ? mv.from : mv.segs[mv.k - 1].at(-1);
    this.emit({ type: "update", items: [{ id, kind: "move", mid: mv.mid, waypoints: seg, pending, rest: mv.segs.slice(mv.k + 1).flat().map(p => ({ ...p })), combat: mv.combat, why: mv.why, speed: mv.speed, k: mv.k, gid: options.gid ?? null, sentFrom: { ...prev } }], options: mv.k === 0 ? options : {} });
  }
  /** Several tokens' moves in one update (scene.updateEmbeddedDocuments): one ord, each token its own movement. */
  moveMany(list, { combat = false, options = {}, why = null } = {}) {
    const items = [];
    const started = [];
    for (const { id, waypoints } of list) {
      const d = this.view.get(id);
      if (!d || !waypoints?.length) continue;
      const from = { x: d.x, y: d.y };
      let wps = waypoints.map(p => ({ x: p.x, y: p.y }));
      const cut = this.doorCut(from, wps);
      if (cut === 0) continue;
      if (cut > 0) wps = wps.slice(0, cut);
      const segs = combat ? wps.map(p => [p]) : [wps];
      const mv = { mid: this.newMid(), segs, k: 0, stopped: false, combat, why, speed: SPEED, chain: [], from };
      this.moves.set(id, mv);
      started.push(id);
      items.push({ id, kind: "move", mid: mv.mid, waypoints: segs[0], pending: segs.length > 1, rest: segs.slice(1).flat().map(p => ({ ...p })), combat, why, speed: SPEED, k: 0, gid: options.gid ?? null, sentFrom: { ...from } });
    }
    if (items.length) this.emit({ type: "update", items, options });
    return started;
  }
  /** A move item of this client's came back: a fight's next square, when the last one has run here. */
  coreEcho(msg) {
    for (const it of msg.items) {
      if (it.kind !== "move") continue;
      const mv = this.moves.get(it.id);
      if (!mv || mv.mid !== it.mid || it.k !== mv.k) continue;
      if (!it.pending) { this.moves.delete(it.id); continue; }
      const segDur = (dist(it.from, it.waypoints.at(-1)) / (mv.speed ?? SPEED)) * 1000;
      const go = () => {
        if (mv.done) return;
        mv.done = true;
        this.continueMove(it.id, mv);
      };
      mv.done = false;
      if (this.hiddenAt(this.sim.now)) { go(); continue; }
      // core: the animation's end, or a timer (duration - 2 x latency - 50 ms), or the tab going to the background.
      this.whenDrawnAtRest(it.id, go);
      this.setTimeout(go, Math.max(segDur - 2 * AVG_LATENCY - 50, 0));
      const h = this.hidden.find(s => s.a > this.sim.now);
      if (h) this.exec(h.a, go);
    }
  }
  continueMove(id, mv) {
    if (this.moves.get(id) !== mv || mv.stopped) return;
    const d = this.view.get(id);
    const doc = this.server.tokens.get(id);
    if (!d || !doc) return;
    mv.k += 1;
    if (mv.k >= mv.segs.length) { this.moves.delete(id); return; }
    // Constrained by the walls as this client knows them now: a shut door ends the move before it.
    const prev = mv.segs[mv.k - 1].at(-1);
    if (this.doorCut(prev, mv.segs[mv.k]) === 0) {
      mv.stopped = true;
      this.moves.delete(id);
      this.emit({ type: "stop", id, mid: mv.mid, why: "coreDoor" });
      return;
    }
    this.sendSeg(id, mv);
  }
  /** TokenDocument#stopMovement: no further square is sent (the one on its way is committed). */
  stopMovement(id) {
    const mv = this.moves.get(id);
    if (!mv || mv.stopped) return false;
    mv.stopped = true;
    this.moves.delete(id);
    this.emit({ type: "stop", id, mid: mv.mid });
    return true;
  }
}
