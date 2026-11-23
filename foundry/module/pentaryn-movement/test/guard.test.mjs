// The runtime yield guard's glue (guard.mjs, 0.7.0 stage 3) against a small synthetic board: a 100 px grid, tokens
// with core-shaped movements, a ticker the test runs by hand and the other features' exposed helpers as recorders.
// Pinned: only this client's moves are guarded; out of combat a yield stops the token where it is drawn (a guard
// move) and walks the rest of its way once clear; in a fight it pauses core's continuation (never a displace) and
// resumes it, waiting before a door rather than in it; a mover never yields to a later one, a hidden one yields to a
// player's; 3 s re-routes once, 8 s rests with a quiet notice; a click lets go; a player's guard never sees a hidden
// token; every firing is logged; the ticker runs only while there is something to guard, and a check stays cheap.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = 100;
const clock = { t: 1000 };
Object.defineProperty(globalThis, "performance", { value: { now: () => clock.t }, configurable: true, writable: true });

const infos = [];
const notices = [];
const me = { id: "me", isGM: true, isSelf: true };
const player = { id: "pl", isGM: false, isSelf: false };
const gm2 = { id: "gm2", isGM: true, isSelf: false };
const users = new Map([[me.id, me], [player.id, player], [gm2.id, gm2]]);
const walls = [];
const scene = { id: "S", grid: { size: S }, walls, tokens: new Map(), levels: new Map() };
let listeners = [];

globalThis.game = {
  user: me, users: { get: id => users.get(id), [Symbol.iterator]: () => users.values(), some: f => [...users.values()].some(f) },
  settings: { settings: new Map(), get: () => { throw new Error("unregistered"); } },
  i18n: { format: (k, d) => `${k}:${d?.name ?? ""}`, localize: k => k },
};
globalThis.ui = { notifications: { info: m => notices.push(m), warn: m => notices.push(m) } };
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
globalThis.CONFIG = { Token: { movement: { defaultSpeed: 6, actions: {} } }, debug: {} };
globalThis.PIXI = { UPDATE_PRIORITY: { UTILITY: -50 } };
globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 18) } };
const tokens = new Map();
globalThis.canvas = {
  ready: true, grid: { size: S }, scene,
  dimensions: { rect: { x: 0, y: 0, width: 2000, height: 2000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2000 && y <= 2000 } },
  tokens: { get placeables() { return [...tokens.values()]; }, get: id => tokens.get(id) },
  app: { ticker: { add: fn => listeners.push(fn), remove: fn => { listeners = listeners.filter(f => f !== fn); } } },
};

const { reservations: reserve } = await import("../reserve-adapter.mjs");
const guard = await import("../guard.mjs");
const { GUARD } = await import("../guard-core.mjs");

/** A token at centre (cx, cy) squares, drawn there; walking `way` (centres) when given. */
let mids = 0;
function tok(id, cx, cy, { way = null, user = me, combat = false, pending = null, hidden = false, visible = true, state = null } = {}) {
  const tl = c => ({ x: (c.x - 0.5) * S, y: (c.y - 0.5) * S, elevation: 0, action: "walk" });
  const src = way ? tl(combat ? (pending ? way[1] : way.at(-1)) : way.at(-1)) : tl({ x: cx, y: cy });
  const doc = {
    id, name: id, hidden, parent: scene, x: (cx - 0.5) * S, y: (cy - 0.5) * S, elevation: 0, movementAction: "walk",
    _source: { ...src, width: 1, height: 1, elevation: 0 }, disposition: 1, isOwner: true,
    _shouldRecordMovementHistory: () => combat,
    movement: {
      id: `M${++mids}`, chain: [], user, state: state ?? (way ? (pending?.length ? "pending" : "completed") : "completed"),
      origin: way ? tl(way[0]) : tl({ x: cx, y: cy }), constrainOptions: {},
      passed: { waypoints: way ? (combat && pending ? [tl(way[1])] : way.slice(1).map(tl)) : [] },
      pending: { waypoints: (pending ?? []).map(tl) },
    },
    pauseCalls: 0, moves: [],
    pauseMovement() { this.pauseCalls += 1; this.movement = { ...this.movement, state: "paused" }; return () => { resumes.push(id); this.movement = { ...this.movement, state: "pending" }; return Promise.resolve(true); }; },
    move(wps, opts) { this.moves.push({ wps, opts }); return Promise.resolve(true); },
  };
  const t = {
    document: doc, visible, isPreview: false, destroyed: false, movementAnimationName: "anim",
    animationContexts: new Map(way ? [["anim", {}]] : []), position: { x: doc.x, y: doc.y },
    checkCollision: () => false,
  };
  doc.object = t;
  tokens.set(id, t);
  scene.tokens.set(id, doc);
  return t;
}
const resumes = [];
const calls = [];
const hooks = new Map();
const ctx = {
  log: { info: (...a) => infos.push(a), debug: () => {}, warnOnce: (k, m, e) => { throw e ?? new Error(m); } },
  exposed: {
    stopDisplace: (t, at, extra) => { calls.push({ op: "displace", id: t.document.id, at, extra }); t.animationContexts.clear(); t.document._source.x = at.p.x; t.document._source.y = at.p.y; return Promise.resolve(true); },
    groupRepublish: () => ({ pentarynMovementRid: { x: "r" } }),
    stopSafely: doc => { calls.push({ op: "stop", id: doc.id }); doc.movement = { ...doc.movement, state: "stopped" }; return Promise.resolve(true); },
    pathfindOrigin: doc => ({ ...doc._source }),
    pathfindRouteToAsync: (t, origin, dest) => { calls.push({ op: "route", id: t.document.id }); return Promise.resolve(route.next); },
    groupCheckpoints: (t, path) => path.slice(1),
  },
  expose(x) { Object.assign(ctx.exposed, x); },
};
const route = { next: null };
const reg = { on: (name, fn) => { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn); } };
guard.install(reg, ctx);
const fire = (name, ...args) => { for (const fn of hooks.get(name) ?? []) fn(...args); };
const frame = (ms = 50) => { clock.t += ms; for (const fn of [...listeners]) fn(); };
const flush = () => new Promise(r => setTimeout(r, 0));
/** The move of `t` arrives here (and its place in the server's order). */
function arrive(t, operation = {}) {
  reserve.onMove(t.document, t.document.movement, operation);
  fire("moveToken", t.document, t.document.movement, operation);
}
function reset() {
  for (const id of [...tokens.keys()]) ctx.exposed.guardCancel(id);
  tokens.clear(); scene.tokens.clear(); calls.length = 0; infos.length = 0; notices.length = 0; resumes.length = 0; walls.length = 0;
  route.next = null;
  game.user = me;
  frame(GUARD.everyMs);
}

test("out of combat: a standing token ahead → stop where drawn (a guard move), logged; walks the rest of its way once clear", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(a);
  assert.equal(listeners.length, 1, "the ticker runs while a move is guarded");
  frame();
  await flush();
  const d = calls.find(c => c.op === "displace");
  assert.ok(d, "stopped");
  assert.equal(d.extra.pentarynMovementGuard, true);
  assert.equal(d.at.p.x, a.document.x);
  assert.equal(infos.length, 1, "the firing is logged");
  assert.match(infos[0][0], /yield guard: A gives way to S \(standing/);
  const st = ctx.exposed.guardStatus();
  assert.equal(st.fired, 1);
  assert.equal(st.standing, 1);
  assert.equal(st.held.length, 1);
  // Still standing there: it waits.
  frame(); frame();
  assert.equal(a.document.moves.length, 0);
  // Gone: once clear long enough it walks on, from where it stands to its end, as a guard move.
  tokens.delete("S"); scene.tokens.delete("S");
  for (let k = 0; k < 8; k++) frame();
  await flush();
  assert.equal(a.document.moves.length, 1);
  const m = a.document.moves[0];
  assert.equal(m.opts.pentarynMovementGuard, true);
  assert.ok(m.opts.pentarynMovementRid, "re-published");
  assert.deepEqual({ x: m.wps.at(-1).x, y: m.wps.at(-1).y }, { x: 850, y: 450 });
  assert.equal(m.wps.at(-1).explicit, true);
  assert.equal(ctx.exposed.guardStatus().resumed, 1);
});

test("only this client's moves are guarded; a move another user started is never touched", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }], user: gm2 });
  tok("S", 4.2, 5);
  arrive(a);
  frame();
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(ctx.exposed.guardStatus().watching, 0);
});

test("between two movers the later one yields, never the earlier; the GM's hidden mover yields to a player's", async () => {
  reset();
  // B (another client's) crosses A's way, B's move arrived first: A yields.
  const b = tok("B", 4, 2.5, { way: [{ x: 4, y: 2 }, { x: 4, y: 9 }], user: player });
  arrive(b);
  const a = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
  arrive(a);
  frame();
  await flush();
  assert.equal(calls.filter(c => c.op === "displace" && c.id === "A").length, 1, "A, the later, yields");
  assert.equal(ctx.exposed.guardStatus().movers, 1);

  reset();
  // A's move first, then B's: A goes on (B's own client yields).
  const a2 = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
  arrive(a2);
  const b2 = tok("B", 4, 2.5, { way: [{ x: 4, y: 2 }, { x: 4, y: 9 }], user: player });
  arrive(b2);
  frame();
  await flush();
  assert.equal(calls.length, 0, "never yields to a later mover");

  reset();
  // The same, A hidden: the player's planner cannot see it, so A yields although its move came first.
  const a3 = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }], hidden: true });
  arrive(a3);
  const b3 = tok("B", 4, 2.5, { way: [{ x: 4, y: 2 }, { x: 4, y: 9 }], user: player });
  arrive(b3);
  frame();
  await flush();
  assert.equal(calls.filter(c => c.op === "displace" && c.id === "A").length, 1);
});

test("a player's guard never counts a token hidden from it", async () => {
  reset();
  const pme = { ...player, isSelf: true };
  game.user = pme;
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }], user: pme });
  tok("H", 4.2, 5, { hidden: true, visible: false });
  arrive(a);
  frame();
  await flush();
  assert.equal(calls.length, 0);
  game.user = me;
});

test("in a fight: pauses core's continuation (no displace), resumes it once clear; waits before a door, not in it", async () => {
  reset();
  // Walking (1,5) → (2,5), then (3,5), (4,5). A token stands on (3,5).
  const a = tok("A", 1.5, 5, { way: [{ x: 1, y: 5 }, { x: 2, y: 5 }], pending: [{ x: 3, y: 5 }, { x: 4, y: 5 }], combat: true });
  tok("S", 3, 5);
  arrive(a);
  frame(16);
  await flush();
  assert.equal(a.document.pauseCalls, 1);
  assert.equal(calls.filter(c => c.op === "displace").length, 0, "never a displace in a fight");
  // It finishes its square, then waits: the blocker goes, and core's continuation is resumed.
  a.animationContexts.clear();
  a.document.x = 150; a.document.y = 450;
  tokens.delete("S"); scene.tokens.delete("S");
  for (let k = 0; k < 8; k++) frame();
  await flush();
  assert.deepEqual(resumes, ["A"]);

  reset();
  // The next square (3,5) is a doorway (a door line through it) and the way after it is taken (a token at (5,5)): it
  // waits now, before the door. Without the door it goes on into (3,5): what lies past the next square is not looked
  // at yet.
  walls.push({ c: [300, 400, 300, 500], door: 1 });
  const b = tok("B", 1.6, 5, { way: [{ x: 1, y: 5 }, { x: 2, y: 5 }], pending: [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 6 }], combat: true });
  tok("S", 5, 5);
  arrive(b);
  frame(16);
  assert.equal(b.document.pauseCalls, 1, "waits before the door");
  reset();
  const c = tok("C", 1.6, 5, { way: [{ x: 1, y: 5 }, { x: 2, y: 5 }], pending: [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 6 }], combat: true });
  tok("S", 5, 5);
  arrive(c);
  frame(16);
  assert.equal(c.document.pauseCalls, 0, "no door: it walks into the next square");
});

test("3 s after the first yield it re-routes once round what stands; 8 s it rests, with a quiet notice", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(a);
  frame();
  await flush();
  route.next = { reached: true, path: [{ x: 150, y: 450 }, { x: 350, y: 250 }, { x: 850, y: 450 }] };
  for (let t = 0; t < GUARD.rerouteMs; t += 100) frame(100);
  await flush();
  assert.equal(calls.filter(c => c.op === "route").length, 1);
  const m = a.document.moves.at(-1);
  assert.equal(m.opts.pentarynMovementGuard, true);
  assert.deepEqual(m.wps.map(p => [p.x, p.y]), [[350, 250], [850, 450]]);
  assert.equal(ctx.exposed.guardStatus().rerouted, 1);

  reset();
  // No way round: it waits on, re-routes no more, and rests at 8 s.
  const b = tok("B", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(b);
  frame();
  await flush();
  route.next = { reached: false };
  for (let t = 0; t < GUARD.restMs + 200; t += 100) { frame(100); await flush(); }
  assert.equal(calls.filter(c => c.op === "route").length, 1, "re-routes once");
  assert.equal(notices.length, 1);
  assert.match(notices[0], /guardRest:B/);
  assert.equal(ctx.exposed.guardStatus().watching, 0, "let go");
  assert.equal(listeners.length, 0, "and the ticker stops");
});

test("in a fight the 8 s rest stops core's move where it is (the squares walked are what it pays)", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 2, y: 5 }], pending: [{ x: 3, y: 5 }], combat: true });
  a.animationContexts.clear();
  a.document.movement = { ...a.document.movement, state: "pending" };
  // Animating its square into (2,5) with (3,5) taken.
  a.animationContexts.set("anim", {});
  a.document.x = 140;
  tok("S", 3, 5);
  arrive(a);
  frame(16);
  assert.equal(a.document.pauseCalls, 1);
  a.animationContexts.clear();
  a.document.x = 150;
  route.next = { reached: false };
  for (let t = 0; t < GUARD.restMs + 200; t += 100) { frame(100); await flush(); }
  assert.ok(calls.some(c => c.op === "stop" && c.id === "A"));
  assert.equal(calls.filter(c => c.op === "displace").length, 0);
});

test("a click (any stop) lets go of a token the guard holds; a stop the guard did not make does too", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(a);
  frame();
  await flush();
  const before = ctx.exposed.guardStatus().cancelled;
  assert.equal(ctx.exposed.guardCancel("A", "click"), true);
  assert.equal(ctx.exposed.guardCancel("A", "click"), false);
  tokens.delete("S"); scene.tokens.delete("S");
  for (let k = 0; k < 10; k++) frame();
  await flush();
  assert.equal(a.document.moves.length, 0, "it stays where it waited");
  assert.equal(ctx.exposed.guardStatus().cancelled, before + 1);
  // A stop made elsewhere (a turn change, the GM) lets go too.
  const b = tok("B", 2, 7, { way: [{ x: 1, y: 7 }, { x: 9, y: 7 }] });
  arrive(b);
  assert.equal(ctx.exposed.guardStatus().watching, 1);
  fire("stopToken", b.document);
  assert.equal(ctx.exposed.guardStatus().watching, 0);
});

test("a check stays cheap: 6 movers among 60 tokens, every tick well under a frame", async () => {
  reset();
  for (let i = 0; i < 60; i++) tok(`s${i}`, 1 + (i % 10) * 1.6, 12 + Math.floor(i / 10) * 1.6);
  for (let i = 0; i < 6; i++) {
    const t = tok(`m${i}`, 1, 1 + i * 1.5, { way: [{ x: 1, y: 1 + i * 1.5 }, { x: 15, y: 1 + i * 1.5 }] });
    arrive(t);
  }
  const real = globalThis.performance;
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 20; k++) frame();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 16, `${ms.toFixed(2)} ms a tick`);
  assert.equal(globalThis.performance, real);
});

// ---- Stage 3 round 1 (0.7.1) -------------------------------------------------------------------------------------

test("S3R1-01: a mover drawn just past a corner is read on the leg it walks, not put back on the corner (no false firing in a file)", async () => {
  reset();
  // L (first) is 0.4 square past the corner at (5,5), walking down; F (later) follows 1.4 squares behind along the same
  // way. Read right, they stay 1.08 or more apart; read the old way, L was put back on the corner and F "caught it".
  const way = [{ x: 1, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 9 }];
  const fired0 = ctx.exposed.guardStatus().fired;
  const l = tok("L", 5, 5.4, { way });
  arrive(l);
  const f = tok("F", 4, 5, { way });
  arrive(f);
  frame();
  await flush();
  assert.equal(ctx.exposed.guardStatus().fired - fired0, 0, JSON.stringify(ctx.exposed.guardStatus().last));
  assert.equal(calls.filter(c => c.op === "displace").length, 0);
});

test("S3R1-05: a mover stopped across a door's line steps off it, on its own side, never resting in the doorway", async () => {
  reset();
  // A door line at x = 4 (y 4-6). A walks east, drawn with its centre at x 3.9 (its body across the line); S stands ahead.
  walls.push({ c: [400, 400, 400, 600], door: 1 });
  const a = tok("A", 3.9, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 5, 5);
  const off0 = ctx.exposed.guardStatus().offDoor;
  arrive(a);
  frame();
  await flush(); await flush();
  assert.ok(calls.some(c => c.op === "displace" && c.id === "A"), "stopped");
  const step = a.document.moves.find(m => m.opts?.pentarynMovementGuard);
  assert.ok(step, "then a step off the door's line");
  const cx = step.wps[0].x + S / 2;
  assert.ok(cx <= 400 - 49.5, `its centre at ${cx}: off the line, on the side it was on`);
  assert.equal(ctx.exposed.guardStatus().offDoor - off0, 1);
});

test("S3R1-02: a step aside never crosses a door's line, and never lands on a token walking there now", async () => {
  // B (first) walks north through where A (later) is drawn; A backs out of B's way. West of A is taken, east of it is a
  // door's line (x = 4.2).
  const setup = ({ wMoving }) => {
    reset();
    walls.push({ c: [420, 300, 420, 700], door: 1 });
    const b = tok("B", 3.6, 6, { way: [{ x: 3.6, y: 8 }, { x: 3.6, y: 1 }], user: player });
    arrive(b);
    const w = wMoving ? tok("W", 2.2, 5, { way: [{ x: 2.3, y: 5 }, { x: 0.5, y: 5 }], user: gm2 }) : tok("W", 2.2, 5);
    if (wMoving) arrive(w);
    const a = tok("A", 3.6, 5, { way: [{ x: 3.6, y: 5 }, { x: 9, y: 5 }] });
    arrive(a);
    return a;
  };
  // W standing west of A: the nearest spot off B's way is east, across the door. Not taken.
  let a = setup({ wMoving: false });
  frame();
  await flush(); await flush();
  assert.ok(calls.some(c => c.op === "displace" && c.id === "A"), "A gives way");
  for (const m of a.document.moves) assert.ok(m.wps[0].x + S / 2 < 420, `never across the door: ${JSON.stringify(m.wps)}`);
  // W walking (away) west of A: no step onto where W is now.
  a = setup({ wMoving: true });
  frame();
  await flush(); await flush();
  assert.ok(calls.some(c => c.op === "displace" && c.id === "A"), "A gives way");
  for (const m of a.document.moves) {
    const c = { x: (m.wps[0].x + S / 2) / S, y: (m.wps[0].y + S / 2) / S };
    assert.ok(Math.hypot(c.x - 2.2, c.y - 5) >= 1 - 1e-6, `not onto W: ${JSON.stringify(c)}`);
    assert.ok(c.x < 4.2, `never across the door: ${JSON.stringify(c)}`);
  }
});

test("S3R1-06: another user's move of a token the guard holds lets go of it; a re-route searching meanwhile never moves it", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(a);
  frame();
  await flush();
  let found;
  route.next = new Promise(res => { found = res; });
  for (let t = 0; t < GUARD.rerouteMs; t += 100) frame(100);
  await flush();
  assert.equal(calls.filter(c => c.op === "route").length, 1, "the re-route is searching");
  const over0 = ctx.exposed.guardStatus().overridden;
  // The player stops its own token (its click-stop's displace): a move this client did not make.
  a.document.movement = { ...a.document.movement, id: "Mplayer", user: player, state: "completed" };
  fire("moveToken", a.document, a.document.movement, { animate: false });
  assert.equal(ctx.exposed.guardStatus().watching, 0, "let go");
  assert.equal(ctx.exposed.guardStatus().overridden - over0, 1);
  const before = a.document.moves.length;
  found({ reached: true, path: [{ x: 150, y: 450 }, { x: 350, y: 250 }, { x: 850, y: 450 }] });
  await flush(); await flush();
  assert.equal(a.document.moves.length, before, "the player's stop stands");
});

test("S3R1-04: a re-route far longer than the way it replaces is not taken; it waits on and rests at 8 s", async () => {
  reset();
  const a = tok("A", 2, 5, { way: [{ x: 1, y: 5 }, { x: 9, y: 5 }] });
  tok("S", 4.2, 5);
  arrive(a);
  frame();
  await flush();
  const det0 = ctx.exposed.guardStatus().detour;
  // Round the whole map: about 57 squares for a way of 7.
  route.next = { reached: true, path: [{ x: 150, y: 450 }, { x: 150, y: 1900 }, { x: 1900, y: 1900 }, { x: 1900, y: 450 }, { x: 850, y: 450 }] };
  for (let t = 0; t < GUARD.rerouteMs + 200; t += 100) { frame(100); await flush(); }
  assert.equal(calls.filter(c => c.op === "route").length, 1);
  assert.equal(a.document.moves.length, 0, "no walk round the map");
  assert.equal(ctx.exposed.guardStatus().detour - det0, 1);
  for (let t = 0; t < GUARD.restMs; t += 100) { frame(100); await flush(); }
  assert.equal(ctx.exposed.guardStatus().watching, 0, "rested");
});

test("FR2-05: a mover it does not give way to that comes to rest in its way within the look ahead counts as standing there", async () => {
  reset();
  // A's move first (the higher), then B's: B walks into A's way and stops there in ~130 ms.
  const a = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
  arrive(a);
  const b = tok("B", 3.6, 4.2, { way: [{ x: 3.6, y: 4.2 }, { x: 3.6, y: 5 }], user: player });
  arrive(b);
  frame();
  await flush();
  assert.equal(calls.filter(c => c.op === "displace" && c.id === "A").length, 1, "A gives way to where B comes to rest (0.7.4: neither did, FR2-05, -97 px)");
  // B's end beyond the look ahead (a long walk): A does not give way to the later mover.
  reset();
  const a2 = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
  arrive(a2);
  const b2 = tok("B", 3.6, -6, { way: [{ x: 3.6, y: -6 }, { x: 3.6, y: 5 }], user: player });
  arrive(b2);
  frame();
  await flush();
  assert.equal(calls.filter(c => c.op === "displace" && c.id === "A").length, 0, "a later mover still walking: never yielded to");
});

test("FR2-04: the wall watch cuts a guarded move that nears a wall shut since it set off (once per wall per move)", async () => {
  reset();
  const cuts = [];
  ctx.exposed.groupCutAcross = w => { cuts.push(w.id); return []; };
  walls.get = id => walls.find(w => w.id === id);
  try {
    const a = tok("A", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
    a.checkCollision = (dest, { origin }) => (origin.x < 300 && dest.x > 300) || (origin.x > 300 && dest.x < 300);
    arrive(a);
    frame();
    assert.equal(cuts.length, 0, "no wall shut: nothing");
    const door = { id: "door1", _source: { c: [300, 400, 300, 600], move: 20, door: 1, ds: 0 } };
    walls.push(door);
    fire("updateWall", door, { ds: 0 });
    frame();
    assert.deepEqual(cuts, ["door1"], "cut as it nears the shut door");
    frame(); frame();
    assert.deepEqual(cuts, ["door1"], "once per wall per move");
    assert.ok(ctx.exposed.guardStatus().wallCut >= 1);
    // A door opened again: not a wall in its way.
    reset();
    const b = tok("B", 2, 5, { way: [{ x: 1.5, y: 5 }, { x: 9, y: 5 }] });
    b.checkCollision = () => false;
    const open = { id: "door2", _source: { c: [300, 400, 300, 600], move: 20, door: 1, ds: 1 } };
    walls.push(open);
    fire("updateWall", open, { ds: 1 });
    arrive(b);
    frame();
    assert.deepEqual(cuts, ["door1"], "an open door cuts nothing");
  } finally {
    delete ctx.exposed.groupCutAcross;
    delete walls.get;
  }
});
