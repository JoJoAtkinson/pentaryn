/**
 * One seeded run of the simulator: a generated map, a party and some tokens standing about, a table of virtual
 * clients (the GM, one to three players, the headless bot), the disturbances (jittered latency always; TCP loss, fog
 * stalls on player tabs, a backgrounded initiator, an observer's dropped socket some of the time), the drops (a group
 * drag, sometimes a second client's drag at nearly the same moment), and the events that cut into them (a click-stop,
 * a door shut). Then the invariants (check()), every one judged on the server's record and on every client's drawn
 * view, frame by frame:
 *
 *   passThrough   a mover never comes inside a token standing still (zero tolerance; 0.05 sq of numeric slack)
 *   moverBound    two movers never come more than 0.1 sq inside touching for more than 150 ms, on any client's view
 *   restOverlap   two tokens at rest never overlap (C1)
 *   liveness      every drop is at rest, one way or another, within its 10 s deadline (C3/C9), nothing left walking,
 *                 drawn = server at the end on every client
 *   combatCost    in a fight every committed update is exactly one square on the member's own route (cost = cells),
 *                 never a position write (no undo), never a square it was not sent to
 *   orphans       no client holds a reservation, a group or a held yield after everything has ended
 *   doorCut       a door shut during a move: nothing a client sends after it knows crosses the door's line; in a fight
 *                 every member of that group move stops on the square it holds (no new square after the cut)
 *   errors        nothing threw
 */

import { Sim, Net, Server, Client, FRAME_MS, dist } from "./engine.mjs";
import { MAPS, World, crosses } from "./maps.mjs";
import { Movement } from "./model.mjs";
import { walkersOf } from "../../reserve-core.mjs";
import { over, ENDS } from "../../lifecycle-core.mjs";

const STAND_SLACK = 0.05;
const MOVER_TOL = 0.1;
const MOVER_MS = 150;
const DEADLINE_SLACK = 600;   // ms past a run's deadline its last step may land (a stall holding the deciding timer)

const WEIGHTS = [["hard", 3], ["tJunction", 2], ["corridor2", 2], ["diagonal", 2], ["deadEnd", 1]];
function weighted(sim, list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = sim.rand() * total;
  for (const [k, w] of list) { if ((x -= w) < 0) return k; }
  return list[0][0];
}

/** Place `n` tokens (1x1, one 2x2 sometimes) on free cells of `cells`, clear of `placed`. */
function place(sim, g, cells, n, placed, { big = 0 } = {}) {
  const pool = [...cells];
  const out = [];
  for (let k = 0; k < n * 20 && out.length < n && pool.length; k++) {
    const c = pool.splice(Math.floor(sim.rand() * pool.length), 1)[0];
    const w = out.length === 0 && sim.rand() < big ? 2 : 1;
    const p = w === 2 ? { x: c.j + 1, y: c.i + 1 } : { x: c.j + 0.5, y: c.i + 0.5 };
    const r = w / 2;
    if (!g.walkable({ w, h: w }, p)) continue;
    if ([...placed, ...out].some(q => dist(p, q) < r + q.r + 0.05)) continue;
    out.push({ ...p, w, h: w, r });
  }
  return out;
}

export function scenario(seed, opts = {}) {
  const sim = new Sim(seed);
  const mapName = opts.map ?? weighted(sim, WEIGHTS);
  const map = MAPS[mapName](sim.rand);
  const world = new World(map);
  const lossy = opts.loss ?? sim.rand() < 0.5;
  const net = new Net(sim, { loss: lossy ? 0.02 : 0 });
  const server = new Server(sim, net);
  const combat = opts.combat ?? sim.rand() < 0.4;
  const tierC = combat && (opts.tierC ?? sim.rand() < 0.5);
  server.inCombat = combat;
  for (const dr of map.doors) server.doors.set(dr.id, true);

  // The table.
  const nPlayers = 1 + Math.floor(sim.rand() * 3);
  const gm = new Client(sim, net, server, { id: "GM", isGM: true });
  const players = Array.from({ length: nPlayers }, (_, k) => new Client(sim, net, server, { id: `P${k + 1}` }));
  const bot = new Client(sim, net, server, { id: "Bot", isGM: true, canvas: false });
  const clients = [gm, ...players, bot];
  server.clients = clients;

  // The tokens: a party in room A, a few standing about (in the rooms and in the way), maybe a second party in B.
  const g0 = world.grid(new Map(map.doors.map(d => [d.id, true])), combat);
  const placed = [];
  const partyN = 2 + Math.floor(sim.rand() * 5);
  const party = place(sim, g0, map.rooms.A, partyN, placed, { big: 0.15 });
  party.forEach((t, k) => { t.id = `H${k + 1}`; t.owner = players[k % nPlayers].id; placed.push(t); });
  const twoGroups = opts.two ?? sim.rand() < 0.3;
  const other = twoGroups ? place(sim, g0, map.rooms.B, 2 + Math.floor(sim.rand() * 3), placed) : [];
  other.forEach((t, k) => { t.id = `O${k + 1}`; t.owner = players[(k + 1) % nPlayers].id; placed.push(t); });
  const standN = Math.floor(sim.rand() * 5);
  const standCells = [...map.rooms.B, ...(map.rooms.way ?? []), ...(map.rooms.C ?? []), ...(map.rooms.end ?? [])];
  const stand = place(sim, g0, standCells, standN, placed);
  stand.forEach((t, k) => { t.id = `S${k + 1}`; t.owner = "GM"; placed.push(t); });
  for (const t of placed) server.addToken({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, r: t.r, owner: t.owner });

  // Disturbances.
  const fog = opts.fog ?? sim.rand() < 0.6;
  const T0 = 500;                                   // the first drop
  if (fog) for (const p of players) {
    let t = sim.uniform(0, 1500);
    while (t < T0 + 14000) { const len = sim.uniform(150, 1400); p.stalls.push({ a: t, b: t + len }); t += len + sim.uniform(600, 3000); }
  }
  if (fog && sim.rand() < 0.3) { let t = sim.uniform(0, 3000); while (t < T0 + 14000) { const len = sim.uniform(150, 650); gm.stalls.push({ a: t, b: t + len }); t += len + sim.uniform(1500, 5000); } }

  // Who drops the party: the GM (all of it) or a player (their own tokens only, when they own two or more).
  const byPlayer = sim.rand() < 0.35;
  const initiator = byPlayer ? players[0] : gm;
  const mine = byPlayer ? party.filter(t => t.owner === initiator.id) : party;
  const dropIds = mine.map(t => t.id);
  const backgrounded = opts.background ?? sim.rand() < 0.2;
  if (backgrounded) { const a = T0 + sim.uniform(0, 300); initiator.hidden.push({ a, b: sim.rand() < 0.5 ? Infinity : a + sim.uniform(2000, 8000) }); }
  const dropped = sim.rand() < 0.08 ? sim.pick(clients.filter(c => c !== initiator && c.canvas)) : null;
  if (dropped) { const a = T0 + sim.uniform(200, 2000); dropped.offline.push({ a, b: a + 5000 }); }

  const env = { world, server, clients, tierC, noVet: !!opts.noVet, noStay: !!opts.noStay, noFlushFix: !!opts.noFlushFix, noSequenced: !!opts.noSequenced, noFollow: !!opts.noFollow, followGap: opts.followGap, noStep: !!opts.noStep, runs: [], events: [], planned: new Map(), record: (kind, data) => env.events.push({ t: sim.now, kind, ...data }) };
  for (const c of clients) { c.world = world; c.init(server.snapshot()); }
  const mods = new Map(clients.map(c => [c.id, new Movement(c, env)]));
  for (const c of clients) for (const w of c.offline) sim.at(w.b + net.delay(), () => c.reload());

  // The drops.
  const targetRoom = sim.pick(["B", ...(map.rooms.C ? ["C"] : []), ...(map.rooms.end ? ["end"] : [])].filter(k => map.rooms[k]?.length));
  const anchorId = sim.pick(dropIds);
  const anchor = party.find(t => t.id === anchorId);
  const dcell = sim.pick(map.rooms[targetRoom]);
  const dest = anchor.w === 2 ? { x: dcell.j + 1, y: dcell.i + 1 } : { x: dcell.j + 0.5, y: dcell.i + 0.5 };
  const actions = [];
  const at = (t, what, fn) => { actions.push({ t, what }); initiatorAt(t, fn); };
  const initiatorAt = (t, fn) => sim.at(t, fn);
  at(T0, `drop ${dropIds.join(",")} → ${dest.x},${dest.y} by ${initiator.id}`, () => {
    const m = mods.get(initiator.id);
    initiator.exec(sim.now, () => (dropIds.length > 1 ? m.dropGroup(dropIds, anchorId, dest) : m.dropSingle(anchorId, dest)));
  });
  if (other.length) {
    const who = sim.rand() < 0.5 ? gm : players.at(-1);
    const ids = who === gm ? other.map(t => t.id) : other.filter(t => t.owner === who.id).map(t => t.id);
    if (ids.length) {
      const a = other.find(t => t.id === ids[0]);
      const c = sim.pick(map.rooms.A);
      const dst = a.w === 2 ? { x: c.j + 1, y: c.i + 1 } : { x: c.j + 0.5, y: c.i + 0.5 };
      const t1 = T0 + sim.uniform(0, 600);
      at(t1, `drop ${ids.join(",")} → ${dst.x},${dst.y} by ${who.id}`, () => {
        const m = mods.get(who.id);
        who.exec(sim.now, () => (ids.length > 1 ? m.dropGroup(ids, ids[0], dst) : m.dropSingle(ids[0], dst)));
      });
    }
  }
  const doorShut = (opts.door ?? sim.rand() < 0.3) ? T0 + sim.uniform(300, 2500) : null;
  if (doorShut !== null) at(doorShut, "door d1 shut by GM", () => gm.exec(sim.now, () => gm.emit({ type: "door", door: "d1", open: false })));
  const clickAt = (opts.click ?? sim.rand() < 0.35) ? T0 + sim.uniform(500, 3000) : null;
  if (clickAt !== null) {
    const who = sim.rand() < 0.7 ? initiator : players[sim.rand() * nPlayers | 0];
    at(clickAt, `click by ${who.id}`, () => who.exec(sim.now, () => {
      const m = mods.get(who.id);
      const ids = [...dropIds].filter(id => who.isGM || server.tokens.get(id).owner === who.id);
      const id = ids.find(x => m.moving(x)) ?? ids[0];
      if (id) env.record("click", { client: who.id, id, did: m.click(id) });
    }));
  }

  const meta = { seed, map: map.name, combat, tierC, players: nPlayers, lossy, fog, byPlayer, backgrounded, dropped: dropped?.id ?? null,
    twoGroups: !!other.length, doorShut, clickAt, actions };
  return { sim, world, server, clients, mods, env, meta, END: T0 + 14000, T0 };
}

/** Run one scenario and judge it. Returns { seed, meta, failures: [{ inv, ... }], stats }. */
export function runSeed(seed, opts = {}) {
  const sc = scenario(seed, opts);
  const { sim, server, clients, mods, env, meta, END } = sc;
  const failures = [];
  const fail = (inv, data) => failures.push({ inv, ...data });

  // Frame-by-frame judgement on every drawing client.
  const episodes = new Map();      // key → { t0, depth, kind }
  const stats = { frames: 0, maxMover: 0, maxStand: 0 };
  const ids = [...server.tokens.keys()];
  const sample = () => {
    const t = sim.now;
    for (const c of clients) {
      if (!c.drawing(t)) continue;
      // A dropped socket shows a stale world (Foundry's "disconnected" banner) until the page reloads on reconnect.
      if (c.offline.some(w => w.a <= t && t < w.b + 200)) continue;
      stats.frames += 1;
      const pos = new Map(), mov = new Map();
      for (const id of ids) {
        const d = c.view.get(id);
        if (!d) continue;
        pos.set(id, c.drawn(id, t));
        const inflight = (server.lastWrite.get(id) ?? 0) > (c.seen.get(id) ?? 0);
        mov.set(id, c.animating(id, t) || d.mv?.state === "pending" || inflight);
      }
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const A = ids[a], B = ids[b];
        if (!pos.has(A) || !pos.has(B)) continue;
        const ra = server.tokens.get(A).r, rb = server.tokens.get(B).r;
        const depth = ra + rb - dist(pos.get(A), pos.get(B));
        const ma = mov.get(A), mb = mov.get(B);
        const kind = ma && mb ? "moverBound" : ma || mb ? "passThrough" : "restOverlap";
        const key = `${c.id}|${A}|${B}`;
        const lim = kind === "moverBound" ? MOVER_TOL : STAND_SLACK;
        const ep = episodes.get(key);
        if (depth > lim) {
          if (kind === "moverBound") stats.maxMover = Math.max(stats.maxMover, depth);
          else stats.maxStand = Math.max(stats.maxStand, depth);
          if (!ep) episodes.set(key, { t0: t, depth, kinds: new Set([kind]), client: c.id, A, B, mover: ma ? A : B, at: [{ ...pos.get(A) }, { ...pos.get(B) }] });
          else { ep.depth = Math.max(ep.depth, depth); ep.kinds.add(kind); }
        } else if (ep) {
          close(key, ep, t);
        }
      }
    }
  };
  const close = (key, ep, t) => {
    episodes.delete(key);
    const ms = t - ep.t0;
    const kinds = [...ep.kinds];
    // Was the drawing client's main thread held (a fog stall) just before or during it? Then its later tweens started
    // late on that client (a fresh tween starts when its update is handled, after the stall).
    const cl = clients.find(x => x.id === ep.client);
    const stall = cl.stalls.filter(st => st.a <= t && st.b >= ep.t0 - 1500).at(-1);
    const lost = (sc.server.net.losses ?? []).filter(l => l.t <= t && l.t + l.extra >= ep.t0 - 700);
    ep.at.push(stall ? { stall: Math.round(stall.b - stall.a), endedBefore: Math.round(ep.t0 - stall.b) } : { stall: 0 });
    if (lost.length) ep.at.at(-1).loss = lost.map(l => l.key).join(",");
    if (kinds.includes("passThrough")) fail("passThrough", { client: ep.client, ids: [ep.A, ep.B], mover: ep.mover, t: Math.round(ep.t0), ms: Math.round(ms), depth: +ep.depth.toFixed(3), at: ep.at });
    else if (kinds.includes("restOverlap") && ms > MOVER_MS) fail("restOverlap", { client: ep.client, ids: [ep.A, ep.B], t: Math.round(ep.t0), ms: Math.round(ms), depth: +ep.depth.toFixed(3), at: ep.at });
    else if (kinds.includes("moverBound") && ms > MOVER_MS) fail("moverBound", { client: ep.client, ids: [ep.A, ep.B], t: Math.round(ep.t0), ms: Math.round(ms), depth: +ep.depth.toFixed(3), at: ep.at });
  };
  // Frames to the end, then on until everything is at rest (a long way round legitimately walks past the window), at
  // most 30 s more: what still moves then is judged as it stands.
  for (let t = 0; t <= END + 3000; t += FRAME_MS) sim.at(t, sample);
  sim.run(END + 3000);
  const busy = () => [...server.tokens.values()].some(t => t.mv?.state === "pending") || clients.some(c => c.canvas && [...server.tokens.keys()].some(id => c.animating(id)));
  for (let k = 0; k < 30 && busy(); k++) {
    const t0 = sim.now;
    for (let t = t0 + FRAME_MS; t <= t0 + 1000; t += FRAME_MS) sim.at(t, sample);
    sim.run(t0 + 1000);
  }
  sim.run(sim.now + 1600);
  for (const [key, ep] of episodes) close(key, ep, sim.now + 1000);

  // How many tokens of the drops never moved (a stay is no failure, but it is the price of one).
  const dropped = new Set(env.runs.flatMap(r => r.ids));
  stats.unmoved = [...dropped].filter(id => !server.log.some(e => e.id === id && e.kind === "move")).length;
  stats.dropped = dropped.size;

  // Errors.
  for (const e of sim.errors) fail("errors", { t: Math.round(e.t), err: String(e.err?.stack ?? e.err).split("\n").slice(0, 4).join(" | ") });
  for (const e of env.events) if (e.kind === "error") fail("errors", { t: Math.round(e.t), client: e.client, where: e.where, err: e.err.split("\n").slice(0, 3).join(" | ") });

  // Liveness: every run ended within its deadline; nothing walking at the end; drawn = server.
  // A walk longer than the deadline is not a wait (decision 8: the longer way round is taken, however long): its run
  // may end once its last member's last walk is over (plus the group's hold).
  const walkEnd = id => {
    let end = -Infinity;
    for (const e of server.log) if (e.id === id && e.kind === "move") {
      let L = 0, p = e.from;
      for (const q of e.waypoints) { L += dist(p, q); p = q; }
      end = Math.max(end, e.t + (L / 6) * 1000);
    }
    return end;
  };
  for (const r of env.runs) {
    const last = r.run.history.at(-1);
    const allowed = Math.max(r.run.deadline, ...r.ids.map(id => walkEnd(id) + 1000 + 105)) + DEADLINE_SLACK;
    if (!ENDS.has(r.run.state)) fail("liveness", { what: "runNotEnded", client: r.client, kind: r.kind, state: r.run.state, ids: r.ids, history: r.run.history.map(h => `${h.state}@${Math.round(h.at)}`).join(" ") });
    else if (last.at > allowed) fail("liveness", { what: "pastDeadline", client: r.client, kind: r.kind, state: r.run.state, ms: Math.round(last.at - r.run.t0), ids: r.ids });
  }
  // A fight walk whose page reloaded mid-walk is resumed by the module from sessionStorage (resumeFights, FR2-09),
  // which the simulator does not run: such a walk is left pending by design here.
  for (const [id, t] of server.tokens) {
    if (t.mv?.state !== "pending") continue;
    const owner = clients.find(c => c.id === t.mv.user);
    if (owner?.reloads) continue;
    fail("liveness", { what: "pendingAtEnd", id });
  }
  for (const c of clients) {
    if (c.offlineAt(sim.now)) continue;
    for (const [id, t] of server.tokens) {
      const d = c.view.get(id);
      if (!d) continue;
      if (Math.abs(d.x - t.x) > 1e-6 || Math.abs(d.y - t.y) > 1e-6) fail("liveness", { what: "viewStale", client: c.id, id, view: { x: d.x, y: d.y }, server: { x: t.x, y: t.y } });
      else if (c.canvas && dist(c.drawn(id), t) > 1e-6 && Number.isFinite(c.frameAt(sim.now))) fail("liveness", { what: "drawnOff", client: c.id, id, drawn: c.drawn(id), server: { x: t.x, y: t.y } });
    }
  }

  // Orphans.
  for (const [cid, m] of mods) {
    const live = walkersOf(m.reg, { now: sim.now });
    if (live.length) fail("orphans", { what: "reservation", client: cid, ids: live.map(w => w.id) });
    if (m.groups.size) fail("orphans", { what: "group", client: cid, gids: [...m.groups.keys()] });
    // A yield held since less than the guard's rest time is still waiting by design (a long walk met a token late).
    const held = [...m.yields.values()].filter(y => y.phase === "held" && sim.now - (y.firstAt ?? 0) > 8500);
    if (held.length) fail("orphans", { what: "heldYield", client: cid, ids: held.map(y => y.id) });
  }

  // Combat cost = cells: every committed square is one king step from the last, on the token's own route.
  if (meta.combat) {
    const routes = new Map();
    for (const c of clients) for (const s of c.sent) {
      if (s.msg.type !== "update") continue;
      for (const it of s.msg.items) if (it.kind === "move") {
        if (!routes.has(it.id)) routes.set(it.id, []);
        routes.get(it.id).push(it.waypoints.at(-1));
      }
    }
    const prev = new Map();
    for (const e of server.log) {
      if (!e.id || !e.combat) continue;
      if (e.kind === "displace") { fail("combatCost", { what: "positionWrite", id: e.id, t: Math.round(e.t), why: e.why }); continue; }
      if (e.kind !== "move") continue;
      if (e.steps !== 1) fail("combatCost", { what: "notOneSquare", id: e.id, t: Math.round(e.t), steps: e.steps, from: e.from, to: e.waypoints.at(-1) });
      const p = prev.get(e.id);
      if (p && dist(p, e.from) > 1e-6) fail("combatCost", { what: "discontinuous", id: e.id, t: Math.round(e.t) });
      prev.set(e.id, e.waypoints.at(-1));
    }
    for (const [id, t] of server.tokens) {
      const segs = server.log.filter(e => e.id === id && e.kind === "move" && e.combat);
      const cells = segs.reduce((s, e) => s + e.steps, 0);
      if (cells !== t.cost) fail("combatCost", { what: "costMismatch", id, cost: t.cost, cells });
    }
  }

  // Door cuts: nothing a client sends after it knows the door is shut crosses its line; in a fight, the members of a
  // group move the door cut send no square after the cut (each stops on the square it holds).
  const shut = server.log.find(e => e.kind === "door" && e.open === false);
  if (shut) {
    const door = sc.world.doorCell(shut.door);
    for (const c of clients) {
      const tk = c.doorKnown.get(shut.door);
      if (tk === undefined) continue;
      for (const s of c.sent) {
        if (s.t <= tk || s.msg.type !== "update") continue;
        for (const it of s.msg.items) {
          if (it.kind !== "move" || !it.sentFrom) continue;
          let p = it.sentFrom;
          for (const q of it.waypoints) {
            if (crosses(p, q, door.a, door.b)) { fail("doorCut", { what: "crossedAfterShut", id: it.id, client: c.id, sentAt: Math.round(s.t), known: Math.round(tk), why: it.why }); break; }
            p = q;
          }
        }
      }
    }
    for (const ev of env.events.filter(e => e.kind === "cut" && e.why === "wall" && e.fight?.length)) {
      const c = clients.find(x => x.id === ev.client);
      const cut = new Set(ev.fight);
      for (const s of c.sent) {
        if (s.t <= ev.t || s.msg.type !== "update") continue;
        for (const it of s.msg.items) if (it.kind === "move" && cut.has(it.id)) fail("doorCut", { what: "squareAfterCut", id: it.id, client: c.id, t: Math.round(s.t), cutAt: Math.round(ev.t) });
      }
    }
  }
  return { seed, meta, failures, stats, events: env.events, sc: opts.keep ? sc : undefined, runs: env.runs.map(r => ({ client: r.client, kind: r.kind, ids: r.ids, state: r.run.state, history: r.run.history.map(h => `${h.state}@${Math.round(h.at)}${h.why ? `(${h.why})` : ""}`) })) };
}
