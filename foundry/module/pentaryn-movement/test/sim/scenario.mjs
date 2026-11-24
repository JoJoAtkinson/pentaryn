/**
 * One seeded run of the simulator (0.9.0, Fable's review 2 §4 step 5): a generated map, a party and some tokens
 * standing about, a table of virtual clients (the GM, one to three players, the headless bot), the disturbances
 * (jittered latency always; TCP loss, fog stalls on player tabs, a backgrounded initiator, an observer's dropped socket
 * and reload some of the time), the drops (a group drag, sometimes a second client's drag at nearly the same moment),
 * and what cuts into them (a click, a door shut, a turn change in a fight). `b0: true` runs the same seed with every
 * start delay 0 (B0), for the mover-overlap comparison.
 *
 * The invariants (§2's hard list; each judged on the server's record and on every drawing client's view, frame by
 * frame, on circles):
 *   passThrough   a token drawn moving never comes inside a token standing still: one outside its drop, a mate resting
 *                 at its slot, one named (it stays) (0.05 sq of numeric slack). A mate a stop left short of its slot,
 *                 or one still waiting for its wave, is a mover's business (soft, reported).
 *   wallCross     no committed leg crosses rock; nothing a client sends after it knows a door is shut crosses its line
 *   wrongCharge   in a fight every committed update is one square on from the last, never a position write, and the
 *                 cost recorded is the squares walked
 *   unsent        every member of a drop out of combat is sent or named within 4 s of the drop (the client's main
 *                 thread held by a stall does not count); a fight's every member walks, or is named, or the dragger's own
 *                 click or drop ended its queue; nothing pending or held at the end; drawn = server on every client
 *   restOverlap   two tokens at rest never overlap for more than 150 ms, nor at the end, unless flagged a same-instant
 *                 race (two clients' moves, each planned before it saw the other's write)
 *   errors        nothing threw
 * Reported, never gated: mover overlap (two tokens both in moves in progress) as episodes, each its deepest overlap
 * (squares) and its duration (ms), on every drawing client.
 */

import { Sim, Net, Server, Client, FRAME_MS, dist } from "./engine.mjs";
import { MAPS, World, crosses } from "./maps.mjs";
import { Movement } from "./model.mjs";

const STAND_SLACK = 0.05;
const REST_MS = 150;
const MOVER_MIN = 0.02;               // overlap below this is touching (numeric slack), not an episode
const SEND_MS = 4000;

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
  server.inCombat = combat;
  for (const dr of map.doors) server.doors.set(dr.id, true);

  const nPlayers = 1 + Math.floor(sim.rand() * 3);
  const gm = new Client(sim, net, server, { id: "GM", isGM: true });
  const players = Array.from({ length: nPlayers }, (_, k) => new Client(sim, net, server, { id: `P${k + 1}` }));
  const bot = new Client(sim, net, server, { id: "Bot", isGM: true, canvas: false });
  const clients = [gm, ...players, bot];
  server.clients = clients;

  const g0 = world.grid(new Map(map.doors.map(d => [d.id, true])), combat);
  const placed = [];
  const party = place(sim, g0, map.rooms.A, 2 + Math.floor(sim.rand() * 5), placed, { big: 0.15 });
  party.forEach((t, k) => { t.id = `H${k + 1}`; t.owner = players[k % nPlayers].id; placed.push(t); });
  const twoGroups = opts.two ?? sim.rand() < 0.3;
  const other = twoGroups ? place(sim, g0, map.rooms.B, 2 + Math.floor(sim.rand() * 3), placed) : [];
  other.forEach((t, k) => { t.id = `O${k + 1}`; t.owner = players[(k + 1) % nPlayers].id; placed.push(t); });
  const standCells = [...map.rooms.B, ...(map.rooms.way ?? []), ...(map.rooms.C ?? []), ...(map.rooms.end ?? [])];
  const stand = place(sim, g0, standCells, Math.floor(sim.rand() * 5), placed);
  stand.forEach((t, k) => { t.id = `S${k + 1}`; t.owner = "GM"; placed.push(t); });
  for (const t of placed) server.addToken({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, r: t.r, owner: t.owner });

  const fog = opts.fog ?? sim.rand() < 0.6;
  const T0 = 500;
  if (fog) for (const p of players) {
    let t = sim.uniform(0, 1500);
    while (t < T0 + 14000) { const len = sim.uniform(150, 1400); p.stalls.push({ a: t, b: t + len }); t += len + sim.uniform(600, 3000); }
  }
  if (fog && sim.rand() < 0.3) { let t = sim.uniform(0, 3000); while (t < T0 + 14000) { const len = sim.uniform(150, 650); gm.stalls.push({ a: t, b: t + len }); t += len + sim.uniform(1500, 5000); } }

  const byPlayer = sim.rand() < 0.35;
  const initiator = byPlayer ? players[0] : gm;
  const mine = byPlayer ? party.filter(t => t.owner === initiator.id) : party;
  const dropIds = mine.map(t => t.id);
  const backgrounded = opts.background ?? sim.rand() < 0.2;
  if (backgrounded) { const a = T0 + sim.uniform(0, 300); initiator.hidden.push({ a, b: sim.rand() < 0.5 ? Infinity : a + sim.uniform(2000, 8000) }); }
  const dropped = sim.rand() < 0.08 ? sim.pick(clients.filter(c => c !== initiator && c.canvas)) : null;
  if (dropped) { const a = T0 + sim.uniform(200, 2000); dropped.offline.push({ a, b: a + 5000 }); }

  // noWaveRests / noStopClear switch off the step-5 fixes in the model (drop.mjs sendWave's mates at rest, stop.mjs's
  // stop clear of a token at rest): a regression seed must still fail with its fix off.
  // `before: true` is all of them, with noFightSpots (drop.mjs routeAtTurn tries only its formation square): the glue
  // as it was at 0802bc85, for a before/after run on that commit's cores.
  const before = !!opts.before;
  const env = { world, server, clients, b0: !!opts.b0, noWaveRests: before || !!opts.noWaveRests, noStopClear: before || !!opts.noStopClear,
    noFightSpots: before || !!opts.noFightSpots, events: [], drops: [], mods: null,
    record: (kind, data) => env.events.push({ t: sim.now, kind, ...data }) };
  for (const c of clients) { c.world = world; c.init(server.snapshot()); }
  // What the sender knew when it sent each walk: every token where its documents had it (passThrough's hard test).
  env.snaps = new Map();
  env.sends = new Map();          // movement id → { t, client, seen }: what its sender had applied when it sent it
  for (const c of clients) {
    const emit = c.emit.bind(c);
    c.emit = msg => {
      if (msg.type === "update") for (const it of msg.items) env.sends.set(it.mid, { t: sim.now, client: c.id, seen: new Map(c.seen) });
      if (msg.type === "update") for (const it of msg.items) if (it.kind === "move") {
        if (!env.snaps.has(it.id)) env.snaps.set(it.id, []);
        env.snaps.get(it.id).push({ t: sim.now, client: c.id, mid: it.mid, combat: !!it.combat, to: { ...it.waypoints.at(-1) }, from: it.sentFrom ? { ...it.sentFrom } : null,
          view: new Map([...c.view].map(([k, d]) => [k, { x: d.x, y: d.y, moving: c.animating(k) || d.mv?.state === "pending", waiting: env.waitingAt?.(c, k, sim.now) ?? false }])) });
      }
      return emit(msg);
    };
  }
  const mods = new Map(clients.map(c => [c.id, new Movement(c, env)]));
  env.mods = mods;
  for (const c of clients) for (const w of c.offline) sim.at(w.b + net.delay(), () => c.reload());

  const targetRoom = sim.pick(["B", ...(map.rooms.C ? ["C"] : []), ...(map.rooms.end ? ["end"] : [])].filter(k => map.rooms[k]?.length));
  const anchorId = sim.pick(dropIds);
  const anchor = party.find(t => t.id === anchorId);
  const dcell = sim.pick(map.rooms[targetRoom]);
  const dest = anchor.w === 2 ? { x: dcell.j + 1, y: dcell.i + 1 } : { x: dcell.j + 0.5, y: dcell.i + 0.5 };
  const actions = [];
  const at = (t, what, fn) => { actions.push({ t: Math.round(t), what }); sim.at(t, fn); };
  const dropBy = (who, ids, aid, dst) => who.exec(sim.now, () => { const m = mods.get(who.id); return ids.length > 1 ? m.dropGroup(ids, aid, dst) : m.dropSingle(aid, dst); });
  at(T0, `drop ${dropIds.join(",")} → ${dest.x},${dest.y} by ${initiator.id}`, () => dropBy(initiator, dropIds, anchorId, dest));
  if (other.length) {
    const who = sim.rand() < 0.5 ? gm : players.at(-1);
    const ids = who === gm ? other.map(t => t.id) : other.filter(t => t.owner === who.id).map(t => t.id);
    if (ids.length) {
      const a = other.find(t => t.id === ids[0]);
      const c = sim.pick(map.rooms.A);
      const dst = a.w === 2 ? { x: c.j + 1, y: c.i + 1 } : { x: c.j + 0.5, y: c.i + 0.5 };
      at(T0 + sim.uniform(0, 600), `drop ${ids.join(",")} → ${dst.x},${dst.y} by ${who.id}`, () => dropBy(who, ids, ids[0], dst));
    }
  }
  const doorShut = (opts.door ?? sim.rand() < 0.3) ? T0 + sim.uniform(300, 2500) : null;
  if (doorShut !== null) at(doorShut, "door d1 shut by GM", () => gm.exec(sim.now, () => gm.emit({ type: "door", door: "d1", open: false })));
  const clickAt = (opts.click ?? sim.rand() < 0.35) ? T0 + sim.uniform(500, 3000) : null;
  if (clickAt !== null) {
    const who = sim.rand() < 0.7 ? initiator : players[sim.rand() * nPlayers | 0];
    at(clickAt, `click by ${who.id}`, () => who.exec(sim.now, () => {
      const m = mods.get(who.id);
      const ids = dropIds.filter(id => who.isGM || server.tokens.get(id).owner === who.id);
      const id = ids.find(x => m.moving(x));
      if (id) env.record("click", { client: who.id, id, did: m.click(id) });
    }));
  }
  // A turn change in a fight: every client's updateCombat empties the fight queues it runs.
  const turnAt = combat && (opts.turn ?? sim.rand() < 0.25) ? T0 + sim.uniform(500, 6000) : null;
  if (turnAt !== null) at(turnAt, "turn change", () => { for (const c of clients) net.down(c, { type: "turn" }); });
  for (const c of clients) c.listeners.push(msg => { if (msg.type === "turn") mods.get(c.id).cancelQueues("turn"); });

  const meta = { seed, map: map.name, combat, b0: env.b0, players: nPlayers, lossy, fog, byPlayer, backgrounded, dropped: dropped?.id ?? null,
    twoGroups: !!other.length, doorShut, clickAt, turnAt, actions };
  return { sim, world, server, clients, mods, env, meta, END: T0 + 14000, T0 };
}

const pct = (list, p) => { if (!list.length) return 0; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export { pct };

/** Run one scenario and judge it. Returns { seed, meta, failures: [{ inv, ... }], stats, movers: [{ depth, ms }] }. */
export function runSeed(seed, opts = {}) {
  const sc = scenario(seed, opts);
  const { sim, server, clients, mods, env, meta, END } = sc;
  const failures = [];
  const fail = (inv, data) => failures.push({ inv, ...data });
  const ids = [...server.tokens.keys()];
  const R = id => server.tokens.get(id).r;

  // Who is in a drop in progress, and where it rests when done.
  const slotOf = new Map();           // `${seq-client}|${id}` → slot
  const dropOf = (id, t) => { let d = null; for (const x of env.drops) if (x.t0 <= t && x.ids.includes(id)) d = x; return d; };
  const namedAt = (d, id) => env.events.find(e => (e.kind === "named" || e.kind === "excused") && e.client === d.client && e.t >= d.t0 && e.ids.includes(id))?.t ?? Infinity;
  /** The server's first write of `id` by drop d's client after it, or null. */
  const firstWrite = (d, id) => server.log.find(e => e.id === id && e.user === d.client && e.t >= d.t0 && (e.kind === "move" || e.kind === "displace")) ?? null;
  /** Waiting for its wave out of combat (sent from the same drop, not applied on client c yet). */
  const waiting = (c, id, t) => {
    const d = dropOf(id, t);
    if (!d || d.combat || d.ids.length < 2 || namedAt(d, id) <= t) return false;
    const w = firstWrite(d, id);
    return !w || (c.seen.get(id) ?? 0) < w.ord;
  };
  env.waitingAt = waiting;
  const slotFor = (d, id) => {
    const key = `${d.client}:${d.seq}|${id}`;
    if (!slotOf.has(key)) {
      const p = env.events.find(e => e.kind === "plan" && e.client === d.client && e.seq === d.seq);
      const s = p?.slots?.[id] ?? [...env.events].reverse().find(e => e.kind === "slot" && e.client === d.client && e.id === id && e.t >= d.t0)?.slot ?? null;
      if (s) slotOf.set(key, s);
      return s;
    }
    return slotOf.get(key);
  };
  /** B at rest on client c is a mate of mover A that a stop or a cut left short of its slot (soft). */
  const shortMate = (c, A, B, t) => {
    const da = dropOf(A, t), db = dropOf(B, t);
    if (!da || da !== db) return false;
    const s = slotFor(db, B);
    return !!s && dist(c.drawn(B, t), s) > 0.05 && namedAt(db, B) > t;
  };

  /** Did the walk M is drawn on know S where S stands now (its sender's documents when it sent it)? */
  const foreseen = (c, M, S, t) => {
    const mv = c.view.get(M)?.mv;
    // The update whose leg is drawn now (a fight's square), else the walk's latest.
    const leg = (c.legs.get(M) ?? []).find(l => l.t0 <= t && t < l.t1);
    const list = [...(env.snaps.get(M) ?? [])].reverse().filter(x => x.t <= t && (!mv?.mid || x.mid === mv.mid));
    const snap = (leg && list.find(x => dist(x.to, leg.b) < 1e-6)) ?? list[0] ?? null;
    if (!snap) return false;            // no walk of its own (a stop's write): not a route that knew anything
    const known = snap.view.get(S), here = c.drawn(S, t);
    // In a fight a token walking when the square was sent was a mover then (its source is only its next square).
    // A walk that sets off from inside S is leaving it (a stop carried clear of a token it was drawn on).
    if (known && snap.from && dist(snap.from, known) < R(M) + R(S) - STAND_SLACK) return false;
    // A mate still waiting for its wave when the walk was sent was a mover then: that it stayed came later.
    return !!known && !!here && dist(known, here) < 0.05 && !(snap.combat && known.moving) && !known.waiting;
  };
  const episodes = new Map();
  const movers = [];
  const stats = { frames: 0, races: [] };
  const sample = () => {
    const t = sim.now;
    for (const c of clients) {
      if (!c.drawing(t)) continue;
      if (c.offline.some(w => w.a <= t && t < w.b + 200)) continue;
      stats.frames += 1;
      const pos = new Map(), mov = new Map();
      for (const id of ids) {
        const d = c.view.get(id);
        if (!d) continue;
        pos.set(id, c.drawn(id, t));
        const inflight = (server.lastWrite.get(id) ?? 0) > (c.seen.get(id) ?? 0);
        mov.set(id, c.animating(id, t) || d.mv?.state === "pending" || inflight || [...mods.values()].some(m => m.stopping(c, id)));
      }
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const A = ids[a], B = ids[b];
        if (!pos.has(A) || !pos.has(B)) continue;
        const depth = R(A) + R(B) - dist(pos.get(A), pos.get(B));
        const pair = `${c.id}|${A}|${B}`;
        let kind = null;
        if (depth > MOVER_MIN) {
          const ma = mov.get(A), mb = mov.get(B);
          if (ma && mb) kind = "mover";
          else if (ma || mb) {
            const [M, S] = ma ? [A, B] : [B, A];
            kind = waiting(c, S, t) ? "waiting" : shortMate(c, M, S, t) ? "shortMate" : depth <= STAND_SLACK ? null : foreseen(c, M, S, t) ? "passThrough" : "unforeseen";
          } else kind = waiting(c, A, t) || waiting(c, B, t) ? null : depth > STAND_SLACK ? "rest" : null;
        }
        // One episode per pair at a time: it ends when the pair leaves its kind.
        let ep = episodes.get(pair);
        if (ep && ep.kind !== kind) { close(pair, ep, t); ep = null; }
        if (!kind) continue;
        if (!ep) episodes.set(pair, { t0: t, depth, kind, client: c.id, A, B, at: [{ ...pos.get(A) }, { ...pos.get(B) }], mover: mov.get(A) ? A : mov.get(B) ? B : null });
        else ep.depth = Math.max(ep.depth, depth);
      }
    }
  };
  const close = (key, ep, t) => {
    episodes.delete(key);
    const ms = t - ep.t0;
    const rec = { client: ep.client, ids: [ep.A, ep.B], t: Math.round(ep.t0), ms: Math.round(ms), depth: +ep.depth.toFixed(3), at: ep.at, kind: ep.kind };
    if (ep.kind === "passThrough") fail("passThrough", { ...rec, mover: ep.mover });
    else if (ep.kind === "rest" && ms > REST_MS) { if (!race(ep.A, ep.B)) fail("restOverlap", rec); else stats.races.push(rec); }
    else movers.push({ depth: ep.depth, ms, kind: ep.kind, rec });
  };
  /**
   * A same-instant race: A's last write and B's last write were sent by two screens, each before it had seen the
   * other's (two stops, or a drop and a stop, chosen within a round trip on what each screen had then).
   */
  const race = (A, B) => {
    const wa = [...server.log].reverse().find(e => e.id === A && (e.kind === "move" || e.kind === "displace"));
    const wb = [...server.log].reverse().find(e => e.id === B && (e.kind === "move" || e.kind === "displace"));
    const sa = wa && env.sends.get(wa.mid), sb = wb && env.sends.get(wb.mid);
    // One screen knew both (it sent the earlier one itself): never a race.
    if (!sa || !sb || sa.client === sb.client) return false;
    return (sa.seen.get(B) ?? 0) < wb.ord && (sb.seen.get(A) ?? 0) < wa.ord;
  };

  for (let t = 0; t <= END + 3000; t += FRAME_MS) sim.at(t, sample);
  sim.run(END + 3000);
  // On until everything is at rest and no client holds a queue or a wave (a fight's file round a long way can take a
  // minute), at most 120 s more: what still moves then is judged as it stands.
  const busy = () => [...server.tokens.values()].some(t => t.mv?.state === "pending") || clients.some(c => c.canvas && ids.some(id => c.animating(id)))
    || [...mods.values()].some(m => m.busy().length);
  for (let k = 0; k < 120 && busy(); k++) {
    const t0 = sim.now;
    for (let t = t0 + FRAME_MS; t <= t0 + 1000; t += FRAME_MS) sim.at(t, sample);
    sim.run(t0 + 1000);
  }
  sim.run(sim.now + 1600);
  for (const [key, ep] of episodes) close(key, ep, sim.now);

  // Rest overlap at the end, on the server.
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const A = server.tokens.get(ids[a]), B = server.tokens.get(ids[b]);
    const depth = A.r + B.r - dist(A, B);
    if (depth <= STAND_SLACK) continue;
    const rec = { what: "atEnd", ids: [A.id, B.id], depth: +depth.toFixed(3), at: [{ x: A.x, y: A.y }, { x: B.x, y: B.y }] };
    if (!race(A.id, B.id)) fail("restOverlap", rec); else stats.races.push(rec);
  }

  for (const e of sim.errors) fail("errors", { t: Math.round(e.t), err: String(e.err?.stack ?? e.err).split("\n").slice(0, 4).join(" | ") });

  // Unsent: every member of a drop sent or named within 4 s (out of combat); a fight's every member walked or named.
  const stalled = (c, a, b) => c.stalls.reduce((s, st) => s + Math.max(0, Math.min(b, st.b) - Math.max(a, st.a)), 0);
  const reloaded = c => env.events.some(e => e.kind === "reload" && e.client === c);
  for (const d of env.drops) {
    const c = clients.find(x => x.id === d.client);
    for (const id of d.ids) {
      const sent = c.sent.find(s => s.t >= d.t0 && s.msg.type === "update" && s.msg.items.some(it => it.id === id))?.t ?? Infinity;
      const told = env.events.find(e => e.kind === "named" && e.client === d.client && e.t >= d.t0 && e.ids.includes(id))?.t ?? Infinity;
      // Excused: the dragger's own click or drop ended its queue, it was no longer at its start, or (0.10 L1) it is in
      // place already (its best square is the one it stands on).
      const excused = env.events.some(e => (e.kind === "excused" || e.kind === "skipped" || e.kind === "there") && e.client === d.client && e.t >= d.t0 && (e.ids?.includes(id) || e.id === id));
      const first = Math.min(sent, told);
      if (first === Infinity) { if (!excused && !reloaded(d.client)) fail("unsent", { what: "never", id, client: d.client, combat: d.combat }); continue; }
      if (!d.combat && d.ids.length > 1 && first - d.t0 - stalled(c, d.t0, first) > SEND_MS) fail("unsent", { what: "late", id, client: d.client, ms: Math.round(first - d.t0) });
    }
  }
  for (const [cid, m] of mods) { const b = m.busy(); if (b.length) fail("unsent", { what: "held", client: cid, gids: b }); }
  for (const [id, t] of server.tokens) if (t.mv?.state === "pending" && !clients.find(c => c.id === t.mv.user)?.reloads) fail("unsent", { what: "pendingAtEnd", id });
  for (const c of clients) {
    if (c.offlineAt(sim.now)) continue;
    for (const [id, t] of server.tokens) {
      const d = c.view.get(id);
      if (!d) continue;
      if (Math.abs(d.x - t.x) > 1e-6 || Math.abs(d.y - t.y) > 1e-6) fail("unsent", { what: "viewStale", client: c.id, id });
      else if (c.canvas && dist(c.drawn(id), t) > 1e-6 && Number.isFinite(c.frameAt(sim.now))) fail("unsent", { what: "drawnOff", client: c.id, id, drawn: c.drawn(id), server: { x: t.x, y: t.y } });
    }
  }

  // Wrong charges: one square per committed update, continuous, cost = squares; never a position write.
  if (meta.combat) {
    const prev = new Map();
    for (const e of server.log) {
      if (!e.id || !e.combat) continue;
      if (e.kind === "displace") { fail("wrongCharge", { what: "positionWrite", id: e.id, t: Math.round(e.t), why: e.why }); continue; }
      if (e.kind !== "move") continue;
      if (e.steps !== 1) fail("wrongCharge", { what: "notOneSquare", id: e.id, t: Math.round(e.t), steps: e.steps });
      const p = prev.get(e.id);
      if (p && dist(p, e.from) > 1e-6) fail("wrongCharge", { what: "discontinuous", id: e.id, t: Math.round(e.t) });
      prev.set(e.id, e.waypoints.at(-1));
    }
    for (const [id, t] of server.tokens) {
      const cells = server.log.filter(e => e.id === id && e.kind === "move" && e.combat).reduce((s, e) => s + e.steps, 0);
      if (cells !== t.cost) fail("wrongCharge", { what: "costMismatch", id, cost: t.cost, cells });
    }
  }

  // Wall crossings: no committed leg through rock; nothing sent after its client knew a door shut crosses the door.
  const open = sc.world.grid(new Map(sc.world.map.doors.map(d => [d.id, true])), false);
  for (const e of server.log) {
    if (e.kind !== "move") continue;
    const t = server.tokens.get(e.id);
    let p = e.from;
    for (const q of e.waypoints) {
      if (!open.lineFits(p, q, t.w, t.h)) { fail("wallCross", { what: "rock", id: e.id, t: Math.round(e.t), from: p, to: q }); break; }
      p = q;
    }
  }
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
            if (crosses(p, q, door.a, door.b)) { fail("wallCross", { what: "door", id: it.id, client: c.id, sentAt: Math.round(s.t), known: Math.round(tk), why: it.why }); break; }
            p = q;
          }
        }
      }
    }
  }
  const dropped = new Set(env.drops.flatMap(d => d.ids));
  stats.dropped = dropped.size;
  stats.unmoved = [...dropped].filter(id => !server.log.some(e => e.id === id && e.kind === "move")).length;
  stats.named = new Set(env.events.filter(e => e.kind === "named").flatMap(e => e.ids)).size;
  return { seed, meta, failures, stats, movers, events: opts.events ? env.events : undefined, sc: opts.keep ? sc : undefined };
}
