// Glue characterisation on a GM client (guide step 1; behaviour tests of transform-creatures-35, -36, -39).
// The unchanged entry is loaded as Foundry would, init/setup/ready are fired, and the effects are
// pinned: hook manifest, settings registrations, the handlePing wrap, the userActivity listener, the
// 250 ms coalesced write, de-duplication, the cap, the readers and their decoration, clear(), and every
// console text. Timers and Date are mocked; nothing waits on a real clock.
//
// Separate processes (one ready each): glue-player.test.mjs (non-GM client), glue-nopatch.test.mjs (no
// handlePing anywhere), glue-layers.test.mjs (ControlsLayer lookup order), glue-root.test.mjs (frozen
// root, both load orders).
//
// Quirks pinned as they are (not bugs): the readers lag the buffer depending on state (SF3,
// transform-creatures-39), recent(0) returns everything and square-grid `snapped` on a hex scene
// (transform-creatures-36), a ping is recorded even when core will not draw it (SF4).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { ALPHA, BARE, BETA, GM, HEX, MODULE, PLAYER, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const manifest = manifestOf(new URL("..", import.meta.url));
const W = await setupWorld();
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });
W.captureConsole();

// two decoy lookups the entry must NOT patch: foundry.canvas.layers wins (pings.mjs:161-164)
class GlobalLayer { handlePing() {} }
class ConfigLayer { handlePing() {} }
globalThis.ControlsLayer = GlobalLayer;
F.CONFIG.Canvas = { layers: { controls: { layerClass: ConfigLayer } } };
const decoys = [GlobalLayer.prototype.handlePing, ConfigLayer.prototype.handlePing];

await import("../pings.mjs");

const gm = F.game.users.get(GM);
const player = F.game.users.get(PLAYER);
const layer = new W.ControlsLayer();
const api = () => F.game.pentaryn.pings;
const lines = () => W.console.splice(0);
// the live golden's comparable fields (it drops t and age); picked, so a trailing key cannot leak in
const STABLE = ["userId", "userName", "sceneId", "sceneName", "x", "y", "canvas", "image", "gridSquare", "snapped"];
const strip = rec => Object.fromEntries(STABLE.map(k => [k, rec[k]]));

test("registration manifest: once init, once ready (golden/hooks.json)", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), ["once:init", "once:ready"]);
});

test("before init/ready: nothing registered, nothing patched, no namespace", () => {
  assert.equal(F.calls.length, 0);
  assert.equal(W.ControlsLayer.prototype.handlePing, W.original);
  assert.equal(W.socket.length, 0);
  assert.equal(F.game.pentaryn, undefined);
  assert.deepEqual(lines(), []);
});

test("init registers log then max, option objects key by key", () => {
  F.fire("init");
  F.fire("setup");
  assert.deepEqual(F.calls, [
    { op: "settings.register", id: `${MODULE}.log` },
    { op: "settings.register", id: `${MODULE}.max` },
  ]);
  const opts = id => {
    const { namespace, key, ...rest } = F.game.settings.settings.get(id);
    return rest;
  };
  const log = opts(`${MODULE}.log`);
  assert.deepEqual(Object.keys(log), ["scope", "config", "type", "default"]);
  assert.equal(log.type, Array);
  assert.deepEqual(log, { scope: "world", config: false, type: Array, default: [] });
  const max = opts(`${MODULE}.max`);
  assert.deepEqual(Object.keys(max), ["name", "hint", "scope", "config", "type", "default"]);
  assert.equal(max.type, Number);
  assert.deepEqual(max, {
    name: "PENTARYN_PINGS.Setting.max.Name",
    hint: "PENTARYN_PINGS.Setting.max.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 50,
  });
  assert.equal(F.game.pentaryn, undefined, "nothing published at init");
  assert.deepEqual(lines(), []);
});

test("GM ready: wraps the prototype once, listens on userActivity, publishes four readers, logs the count", () => {
  F.calls.length = 0;
  F.fire("ready");
  const patched = W.ControlsLayer.prototype.handlePing;
  assert.notEqual(patched, W.original);
  assert.equal(patched.__pentarynPatched, true);
  assert.equal(Object.hasOwn(layer, "handlePing"), false, "patched on the prototype, not an instance");
  assert.deepEqual([GlobalLayer.prototype.handlePing, ConfigLayer.prototype.handlePing], decoys, "foundry.canvas.layers wins");
  assert.deepEqual(W.socket.map(([e]) => e), ["userActivity"]);
  assert.equal(typeof W.socket[0][1], "function");

  const keys = Object.keys(F.game.pentaryn.pings);
  const legacy = pinJSON("legacy-surface", ["all", "clear", "last", "recent"], import.meta.url);
  for (const k of legacy) {
    assert.ok(keys.includes(k), `game.pentaryn.pings.${k}`);
    assert.equal(typeof api()[k], "function", k);
  }
  assert.deepEqual(lines(), [["log", "pentaryn-pings | ready — 0 ping(s) on record"]]);
  assert.equal(W.log().length, 0, "ready writes nothing");
});

test("live golden: a GM ping at 1050,850 on the viewed scene, decorated, original still drawn (SF4, SF5)", async () => {
  const position = { x: 1050, y: 850 };
  const options = { scene: ALPHA };
  const out = layer.handlePing(gm, position, options);
  assert.ok(out instanceof Promise, "returns the original's Promise");
  assert.equal(await out, "drawn");
  assert.equal(W.pings.length, 1);
  assert.equal(W.pings[0].self, layer, "this is kept");
  assert.equal(W.pings[0].user, gm);
  assert.equal(W.pings[0].position, position);
  assert.equal(W.pings[0].options, options, "same options object");

  const last = api().last();
  // SF3 case A: buffer is the cached setting array until the first flush, so no lag yet
  assert.deepEqual(strip(last), {
    userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 1050, y: 850,
    canvas: { x: 1050, y: 850 }, image: { x: 50, y: 50 }, gridSquare: { i: 0, j: 0 }, snapped: { x: 1000, y: 800 },
  });
  // leading keys = the live golden's recentShape; a trailing key is core.test's named -39 pin
  assert.deepEqual(Object.keys(last).slice(0, 12), ["t", "userId", "userName", "sceneId", "sceneName", "x", "y", "canvas", "image", "gridSquare", "snapped", "age"]);
  assert.equal(last.t, 1_000_000);
  assert.equal(last.age, "0s ago");
  pinJSON("record", { last: strip(last), keys: Object.keys(last).slice(0, 12) }, import.meta.url);

  assert.equal(W.log().length, 0, "no write before 250 ms");
  mock.timers.tick(249);
  await drain();
  assert.equal(W.log().length, 0);
  mock.timers.tick(1);
  await drain();
  assert.equal(W.log().length, 1);
  assert.deepEqual(W.log()[0].value, [{ t: 1_000_000, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 1050, y: 850 }]);
  assert.deepEqual(Object.keys(W.log()[0].value[0]), ["t", "userId", "userName", "sceneId", "sceneName", "x", "y"]);
  assert.equal(api().last().age, "0s ago");
  mock.timers.tick(12_000);
  assert.equal(api().last().age, "12s ago");
  assert.deepEqual(lines(), []);
});

test("KNOWN transform-creatures-39 (SF3 case B): after a flush the readers lag the buffer until the next flush", async () => {
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 1250, y: 950 }, { scene: ALPHA });
  assert.equal(api().last().x, 1050, "last() still shows the previous ping");
  assert.deepEqual(api().recent(1).map(r => r.x), [1050]);
  assert.equal(api().all().length, 1);
  mock.timers.tick(250);
  await drain();
  assert.equal(api().last().x, 1250);
  assert.deepEqual(api().recent().map(r => r.x), [1250, 1050]);
  assert.deepEqual(api().all().map(r => r.x), [1050, 1250], "all() is oldest first");
});

test("a burst is one write, 250 ms after the FIRST ping (not reset by later pings)", async () => {
  mock.timers.tick(1000);
  const before = W.log().length;
  for (let i = 0; i < 5; i++) layer.handlePing(gm, { x: 100 + i, y: 200 }, { scene: BETA });
  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().length, before + 1, "five pings, one write");
  assert.deepEqual(W.log().at(-1).value.slice(-5).map(r => [r.x, r.y, r.sceneId, r.sceneName]), [0, 1, 2, 3, 4].map(i => [100 + i, 200, BETA, "Beta"]));

  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 300, y: 300 }, { scene: BETA });
  mock.timers.tick(200);
  layer.handlePing(gm, { x: 301, y: 300 }, { scene: BETA });
  mock.timers.tick(50);
  await drain();
  assert.equal(W.log().length, before + 2, "the second ping rode the first's timer");
  assert.deepEqual(W.log().at(-1).value.slice(-2).map(r => r.x), [300, 301]);
  mock.timers.tick(100);
  layer.handlePing(gm, { x: 302, y: 300 }, { scene: BETA });
  mock.timers.tick(249);
  await drain();
  assert.equal(W.log().length, before + 2);
  mock.timers.tick(1);
  await drain();
  assert.equal(W.log().length, before + 3);
  assert.deepEqual(lines(), []);
});

test("de-duplication across both capture paths: same user, scene and rounded point inside 400 ms", async () => {
  mock.timers.tick(1000);
  const n0 = W.stored().length;
  layer.handlePing(player, { x: 1200, y: 900 }, { scene: ALPHA });
  mock.timers.tick(399);
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 1200.4, y: 899.6 }, ping: { scene: ALPHA } });
  mock.timers.tick(1);
  await drain();
  assert.equal(W.stored().length, n0 + 1, "socket copy of the same ping dropped");

  W.emitSocket("userActivity", PLAYER, { cursor: { x: 1200, y: 900 }, ping: { scene: ALPHA } });   // 400 ms after the first
  mock.timers.tick(250);
  await drain();
  assert.equal(W.stored().length, n0 + 2, "window is t - last.t < 400");

  // only the last record is compared: A, B, A inside the window is three records
  layer.handlePing(player, { x: 10, y: 10 }, { scene: ALPHA });
  layer.handlePing(player, { x: 20, y: 20 }, { scene: ALPHA });
  layer.handlePing(player, { x: 10, y: 10 }, { scene: ALPHA });
  // other user / other scene at the same point are new records
  layer.handlePing(gm, { x: 10, y: 10 }, { scene: ALPHA });
  layer.handlePing(gm, { x: 10, y: 10 }, { scene: BETA });
  layer.handlePing(gm, { x: 10, y: 10 }, { scene: BETA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(-5).map(r => [r.userId, r.sceneId, r.x]), [
    [PLAYER, ALPHA, 10], [PLAYER, ALPHA, 20], [PLAYER, ALPHA, 10], [GM, ALPHA, 10], [GM, BETA, 10],
  ]);
  assert.equal(W.stored().at(-6).userName, "Rook");
});

test("coordinates are Math.round-ed at record time; non-finite points are dropped silently", async () => {
  mock.timers.tick(1000);
  const n0 = W.stored().length;
  layer.handlePing(gm, { x: 1050.5, y: 849.5 }, { scene: ALPHA });
  layer.handlePing(gm, { x: -0.4, y: 10.49 }, { scene: ALPHA });
  for (const position of [{ x: "5", y: "6" }, { x: NaN, y: 1 }, { x: 1, y: Infinity }, {}, null, undefined]) {
    assert.equal(await layer.handlePing(gm, position, { scene: ALPHA }), "drawn", "the original still runs");
  }
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(n0).map(r => [r.x, r.y]), [[1051, 850], [-0, 10]]);
  assert.ok(Object.is(W.stored().at(-1).x, -0));
  assert.deepEqual(lines(), []);
});

test("handlePing argument handling: default options, scene and user fallbacks, unviewed scene still recorded (SF4)", async () => {
  mock.timers.tick(1000);
  W.pings.length = 0;
  const n0 = W.stored().length;
  await layer.handlePing(player, { x: 1, y: 1 });
  assert.deepEqual(W.pings[0].options, {}, "options default to {} before the original is called");
  await layer.handlePing(null, { x: 2, y: 2 }, { scene: BETA });
  assert.equal(W.pings[1].user, null, "the original gets the user as passed");
  await layer.handlePing(player, { x: 3, y: 3 }, { scene: HEX });
  await layer.handlePing(player, { x: 4, y: 4 }, { scene: "noSuchScene00001" });
  await layer.handlePing({ id: "ghostUser0000001" }, { x: 5, y: 5 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(n0).map(r => [r.userId, r.userName, r.sceneId, r.sceneName]), [
    [PLAYER, "Rook", ALPHA, "ZZ live-goldens pings"],   // no options.scene → canvas.scene.id
    [GM, "Gamemaster", BETA, "Beta"],                   // no user → game.user.id
    [PLAYER, "Rook", HEX, "Hex"],                       // not the viewed scene: core draws nothing, still recorded
    [PLAYER, "Rook", "noSuchScene00001", null],
    ["ghostUser0000001", "ghostUser0000001", ALPHA, "ZZ live-goldens pings"],
  ]);
});

test("userActivity: ping.scene fallback, malformed payloads ignored without a throw or a warning", async () => {
  mock.timers.tick(1000);
  const n0 = W.stored().length;
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 7, y: 8 }, ping: {} });
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 9, y: 8 }, ping: { scene: BETA } });
  // [declared] PT3-2: the pre-fix shape {sceneId, ping:{x,y}} is not what core sends; it is now ignored
  for (const data of [null, undefined, {}, { ping: null }, { cursor: { x: "a", y: 1 }, ping: {} }, { cursor: { x: 1 }, ping: {} }, { cursor: { x: 1, y: 1 } }, { sceneId: BETA, ping: { x: 1, y: 1 } }]) {
    assert.doesNotThrow(() => W.emitSocket("userActivity", PLAYER, data));
  }
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(n0).map(r => [r.sceneId, r.x, r.y]), [[ALPHA, 7, 8], [BETA, 9, 8]]);
  assert.deepEqual(lines(), []);
});

test("PT3-2: a player's ping on a scene the GM is not viewing is recorded from core's v14 payload (SF6)", async () => {
  mock.timers.tick(1000);
  W.pings.length = 0;
  const n0 = W.stored().length;
  W.corePing(PLAYER, { x: 640.4, y: 480.6 }, BETA);          // GM views ALPHA
  W.corePing(PLAYER, { x: 1500, y: 1100 }, HEX, { pull: true });
  mock.timers.tick(250);
  await drain();
  assert.equal(W.pings.length, 0, "core drew nothing: not the viewed scene");
  assert.deepEqual(W.stored().slice(n0).map(r => [r.userId, r.userName, r.sceneId, r.sceneName, r.x, r.y]), [
    [PLAYER, "Rook", BETA, "Beta", 640, 481],
    [PLAYER, "Rook", HEX, "Hex", 1500, 1100],
  ]);
  assert.deepEqual(lines(), []);
});

test("PT3-2: a player's ping on the scene the GM IS viewing is drawn and recorded once (handlePing + socket dedupe)", async () => {
  mock.timers.tick(1000);
  W.pings.length = 0;
  const n0 = W.stored().length;
  assert.equal(await W.corePing(PLAYER, { x: 1300.2, y: 700.7 }, ALPHA), "drawn");
  assert.equal(W.pings.length, 1, "core drew it through the wrapped handlePing");
  assert.deepEqual(W.pings[0].position, { x: 1300.2, y: 700.7 });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.stored().slice(n0).map(r => [r.userId, r.sceneId, r.x, r.y]), [[PLAYER, ALPHA, 1300, 701]]);
  assert.deepEqual(lines(), []);
});

test("PT3-2: core-shaped payloads without a usable cursor are ignored without a throw or a warning", async () => {
  mock.timers.tick(1000);
  const n0 = W.stored().length;
  for (const data of [
    { ping: { scene: BETA } },
    { cursor: null, ping: { scene: BETA } },
    { cursor: { x: "1", y: 2 }, ping: { scene: BETA } },
    { cursor: { x: 1 }, ping: { scene: BETA } },
  ]) {
    assert.doesNotThrow(() => W.emitSocket("userActivity", PLAYER, data));
  }
  mock.timers.tick(250);
  await drain();
  assert.equal(W.stored().length, n0);
  assert.deepEqual(lines(), []);
});

test("readers decorate with each scene's offset; hex scene gets square-grid snapped; recent(0) is everything", async () => {
  await api().clear();
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 1050, y: 850 }, { scene: ALPHA });
  layer.handlePing(gm, { x: 1050, y: 850 }, { scene: BETA });
  layer.handlePing(gm, { x: 1050, y: 850 }, { scene: HEX });
  layer.handlePing(gm, { x: 1050, y: 850 }, { scene: BARE });
  layer.handlePing(gm, { x: 1050, y: 850 }, { scene: "noSuchScene00001" });
  mock.timers.tick(250);
  await drain();
  const view = r => [r.sceneId, r.image, r.gridSquare, r.snapped];
  assert.deepEqual(api().all().map(view), [
    [ALPHA, { x: 50, y: 50 }, { i: 0, j: 0 }, { x: 1000, y: 800 }],
    [BETA, { x: 550, y: 450 }, { i: 5, j: 4 }, { x: 1000, y: 800 }],
    // KNOWN: transform-creatures-36 — snapped is square-grid maths on a hex scene
    [HEX, { x: 250, y: 350 }, { i: 2, j: 3 }, { x: 1000, y: 800 }],
    [BARE, { x: 750, y: 650 }, { i: 7, j: 6 }, { x: 1000, y: 800 }],   // no grid field → 100; 210 / 110 px padding → 300 / 200
    ["noSuchScene00001", { x: 1050, y: 850 }, { i: 10, j: 8 }, { x: 1000, y: 800 }],
  ]);
  assert.deepEqual(api().recent(2).map(r => r.sceneId), ["noSuchScene00001", BARE]);
  // KNOWN: transform-creatures-36 — recent(0) returns the whole log, newest first
  assert.deepEqual(api().recent(0).map(r => r.sceneId), ["noSuchScene00001", BARE, HEX, BETA, ALPHA]);
  // KNOWN: transform-creatures-36 — recent(-1) drops the oldest
  assert.deepEqual(api().recent(-1).map(r => r.sceneId), ["noSuchScene00001", BARE, HEX, BETA]);
  assert.equal(api().last().sceneId, "noSuchScene00001");
});

test("the readers return null / [] on an empty log, and on a stored log that is not an array", async () => {
  await api().clear();
  assert.equal(api().last(), null);
  assert.deepEqual(api().recent(), []);
  assert.deepEqual(api().all(), []);
  for (const junk of [{ 0: { t: 1, x: 1, y: 1 } }, "log", null]) {
    await F.game.settings.set(MODULE, "log", junk);
    assert.equal(api().last(), null);
    assert.deepEqual(api().recent(), []);
    assert.deepEqual(api().all(), []);
  }
  await api().clear();
  assert.deepEqual(lines(), [], "a non-array is not a read failure");
});

test("the cap: max 3 keeps the newest three; a non-numeric max falls back to 50; 900 is held to 500", async () => {
  await api().clear();
  await F.game.settings.set(MODULE, "max", 3);
  mock.timers.tick(1000);
  for (let i = 0; i < 5; i++) layer.handlePing(gm, { x: i, y: 0 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().at(-1).value.map(r => r.x), [2, 3, 4]);
  assert.deepEqual(api().all().map(r => r.x), [2, 3, 4]);

  await F.game.settings.set(MODULE, "max", "x");
  for (let i = 5; i < 60; i++) layer.handlePing(gm, { x: i, y: 0 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().at(-1).value.length, 50);
  assert.deepEqual([W.log().at(-1).value[0].x, W.log().at(-1).value.at(-1).x], [10, 59]);

  await F.game.settings.set(MODULE, "max", 900);
  for (let i = 60; i < 620; i++) layer.handlePing(gm, { x: i, y: 0 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().at(-1).value.length, 500, "ceiling 500");
  assert.deepEqual([W.log().at(-1).value[0].x, W.log().at(-1).value.at(-1).x], [120, 619]);
  await F.game.settings.set(MODULE, "max", 50);
});

test("clear(): writes [] and resolves true; a pending flush then writes the emptied buffer", async () => {
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 77, y: 77 }, { scene: ALPHA });
  const before = W.log().length;
  assert.equal(await api().clear(), true);
  assert.deepEqual(W.log().slice(before).map(c => c.value), [[]]);
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().slice(before).map(c => c.value), [[], []], "the ping before clear() is gone");
  layer.handlePing(gm, { x: 78, y: 78 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().at(-1).value.map(r => r.x), [78], "buffer started empty");
});

test("GM gate: no record while the client user is not a GM, and a flush due then writes nothing", async () => {
  mock.timers.tick(1000);
  await api().clear();
  W.pings.length = 0;
  const before = W.log().length;
  layer.handlePing(gm, { x: 1, y: 1 }, { scene: ALPHA });
  F.become({ userId: PLAYER });
  layer.handlePing(gm, { x: 2, y: 2 }, { scene: ALPHA });
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 3, y: 3 }, ping: { scene: ALPHA } });
  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().length, before, "flush skipped on a non-GM client");
  assert.equal(W.pings.length, 2, "the original ran both times");
  F.become({ userId: GM });
  layer.handlePing(gm, { x: 4, y: 4 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().at(-1).value.map(r => r.x), [1, 4], "the GM-time record survived in the buffer");
  assert.deepEqual(lines(), []);
});

test("failure texts: capture throw in the wrap, capture throw on the socket, write rejected, read thrown", async () => {
  mock.timers.tick(1000);
  W.pings.length = 0;
  const boom = new Error("users exploded");
  const get = F.game.users.get;
  F.game.users.get = () => {
    throw boom;
  };
  try {
    assert.equal(await layer.handlePing(gm, { x: 5, y: 5 }, { scene: BETA }), "drawn");
    assert.equal(W.pings.length, 1, "the original still runs after a capture throw");
    assert.doesNotThrow(() => W.emitSocket("userActivity", GM, { cursor: { x: 6, y: 6 }, ping: { scene: BETA } }));
  } finally {
    F.game.users.get = get;
  }
  assert.deepEqual(lines(), [
    ["warn", "pentaryn-pings | ping capture failed", boom],
    ["warn", "pentaryn-pings | socket ping capture failed", boom],
  ]);

  const rejected = new Error("write refused");
  W.failSet.push(rejected);
  layer.handlePing(gm, { x: 8, y: 8 }, { scene: BETA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(lines(), [["warn", "pentaryn-pings | could not persist the log", rejected]]);
  // the buffer kept the ping; the next flush carries it
  layer.handlePing(gm, { x: 9, y: 9 }, { scene: BETA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().at(-1).value.slice(-2).map(r => r.x), [8, 9]);

  const read = F.game.settings.get;
  const thrown = new Error("read refused");
  F.game.settings.get = (ns, key) => {
    if (ns === MODULE && key === "log") throw thrown;
    return read(ns, key);
  };
  try {
    assert.equal(api().last(), null);
    assert.deepEqual(api().recent(), []);
    assert.deepEqual(api().all(), []);
  } finally {
    F.game.settings.get = read;
  }
  assert.deepEqual(lines(), [
    ["warn", "pentaryn-pings | could not read the log", thrown],
    ["warn", "pentaryn-pings | could not read the log", thrown],
    ["warn", "pentaryn-pings | could not read the log", thrown],
  ]);
});

test("a second module instance's ready does not wrap twice", async () => {
  const patched = W.ControlsLayer.prototype.handlePing;
  await import("../pings.mjs?second-instance");
  F.fire("ready");
  assert.equal(W.ControlsLayer.prototype.handlePing, patched);
  W.pings.length = 0;
  await layer.handlePing(gm, { x: 1, y: 1 }, { scene: ALPHA });
  assert.equal(W.pings.length, 1, "the original runs once per ping");
  assert.ok(lines().some(l => l[0] === "log" && /^pentaryn-pings \| ready — \d+ ping\(s\) on record$/.test(l[1])));
});
