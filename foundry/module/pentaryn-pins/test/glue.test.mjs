// Glue: the stub world, the entry loaded as Foundry would, and the follow behaviour of a pinned
// PLAYER client (plan context/plans/pin-2026-10.md §3 "Pins tests", glue cases 1–15 and 20).
// Effects are pinned, not returns: the ORIGINAL Scene#view / _onActivate calls the stub recorded
// (F.views, F.activations), toasts, and emitted hooks. Every case also asserts that core's
// "cannot switch Scenes" loading toast never appeared on the pinned path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, flush, pinsWorld } from "./fixtures/actors.mjs";
import { HOOKS, MODULE, NS } from "../pins-core.mjs";

const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);
console.info = () => undefined;

const A = game.scenes.get(IDS.sceneA), B = game.scenes.get(IDS.sceneB), C = game.scenes.get(IDS.sceneC);
const followed = [];
Hooks.on(HOOKS.followed.name, e => followed.push(e));

/**
 * socket.io-client's dispatch order (socket.io-client 4.8 Socket#emitEvent): every `onAny` listener,
 * then the event's own listeners — core's Scenes.#pullToScene (scenes.mjs:111) is one of those, and
 * it is registered at Game#activateSocketListeners, after `setup` (game.mjs:777).
 */
const anyListeners = [];
Object.assign(game.socket, {
  onAny: fn => void anyListeners.push(fn),
  offAny: fn => { const i = anyListeners.indexOf(fn); if (i >= 0) anyListeners.splice(i, 1); },
});
const coreSocket = { pullToScene: (sceneId, viewOptions) => game.scenes.get(sceneId)?.view(viewOptions) };
const socketEmit = (event, ...args) => {
  for (const fn of [...anyListeners]) fn(event, ...args);
  return coreSocket[event]?.(...args);
};

F.become({ userId: IDS.taloUser });
await import("../pins.mjs");
F.fire("init");
F.fire("setup");

const loadingToasts = () => F.calls.filter(c => c.op === "notify" && /cannot switch Scenes/.test(c.message));
const toasts = () => F.calls.filter(c => c.op === "notify").map(c => c.message);
/** Talo's tokens: his own, and the Wolf form's (dnd5e names the original on the form actor). */
const taloTok = () => game.scenes.contents.flatMap(s => s.tokens.contents).filter(t => [IDS.talo, IDS.wolf].includes(t.actorId) || t.flags?.dnd5e?.originalActor === IDS.talo);
const reset = () => {
  F.views.length = 0;
  F.activations.length = 0;
  F.unviews.length = 0;
  F.calls.length = 0;
  followed.length = 0;
  canvas.pans.length = 0;
};
/**
 * The options of a view pins starts itself: the pinned token named, so core controls and pans to it
 * (follow.mjs followOptions; F-follow-ctl). Talo owns his token in the fixture.
 */
const ctl = (level = null) => ({ controlledTokens: [taloTok()[0].id], ...(level ? { level } : {}) });
/** Put this client on a scene and level without a draw. */
const at = (scene, level = null) => Object.assign(canvas, { scene, level: level ? { id: level } : null, loading: false, ready: true });
const row = () => game.settings.settings.get(`${MODULE}.pinning`);
async function setPinning(value) {
  const r = row();
  const onChange = r.onChange;
  r.onChange = undefined;
  await game.settings.set(MODULE, "pinning", value);
  r.onChange = onChange;
}
/** Move Talo's (only) token to `sceneId` the carryTo way: keepId create there, plain delete here. */
function carryTalo(sceneId, data = {}) {
  const [old] = taloTok();
  const created = F.createToken(sceneId, { id: old.id, name: "Talo", actorId: old.actorId, flags: structuredClone(old.flags ?? {}), level: null, ...data });
  F.deleteToken(old);
  return created;
}

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("1 login, active scene A, Talo's token on B: the only draw is B at the token's level", async () => {
  game.ready = false;
  await A.view();               // Game#initializeCanvas → the active scene's view
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]]);
  assert.equal(canvas.scene, B);
  assert.deepEqual(followed, [{ scene: IDS.sceneB, level: IDS.levelB2, reason: "login" }]);
  assert.deepEqual(toasts(), [], "silent at login");
  F.fire("ready");
  await flush();
  assert.deepEqual(F.views.length, 1, "ready: reconcile sees the canvas already on the token");
  const api = game.modules.get(MODULE).api;
  assert.equal(game.pentaryn[NS], api);
  assert.deepEqual(loadingToasts(), []);
});

test("2 switch off: every call reaches core with the same this and args (stock, byte for byte)", async () => {
  await setPinning(false);
  reset();
  at(B, IDS.levelB2);
  const opts = { level: undefined, controlledTokens: ["x"] };
  await A.view(opts);
  assert.deepEqual(F.views, [[IDS.sceneA, structuredClone(opts)]]);
  C._onActivate(true, { viewOptions: { a: 1 } });
  await flush();
  assert.deepEqual(F.activations, [[IDS.sceneC, true]]);
  // a call while loading: core's own toast, as stock
  canvas.loading = true;
  await B.view();
  assert.equal(loadingToasts().length, 1, "core's guard is reached with the switch off");
  canvas.loading = false;
  // the follow hooks are inert too: a carry, a GM move off-screen, a level change, a pin change
  reset();
  at(B, IDS.levelB2);
  carryTalo(IDS.sceneC);
  const [tok] = taloTok();
  F.updateToken(tok, { x: 9000 }, { userId: IDS.gm });
  F.updateToken(tok, { level: IDS.levelB1 }, { userId: IDS.gm });
  F.fire("updateUser", game.users.get(IDS.taloUser), { flags: { [MODULE]: { actor: IDS.talo } } }, {}, IDS.gm);
  carryTalo(IDS.sceneB, { level: IDS.levelB2, x: 500, y: 500 });
  await flush();
  assert.deepEqual([F.views, canvas.pans, followed], [[], [], []], "switch off: nobody is pulled or panned");
  await setPinning(true);
  at(B, IDS.levelB2);
});

test("3 activation: another scene is skipped; deactivating the viewed token scene is skipped; unview still runs", async () => {
  reset();
  at(B, IDS.levelB2);
  C._onActivate(true, { viewOptions: {} });
  B._onActivate(false, {});
  await flush();
  assert.deepEqual([F.activations, F.views, F.unviews], [[], [], []]);
  assert.deepEqual(followed, [], "a skipped activation emits nothing");
  B.unview();                                       // Scene#_onDelete / level deletion: not patched
  assert.deepEqual(F.unviews, [IDS.sceneB]);
  at(B, IDS.levelB2);
});

test("4 pullToScene C: redirected to the token's scene, one toast per 10 s; a wild-shaped PC's toast names its form", async t => {
  t.mock.timers.enable({ apis: ["Date"] });
  reset();
  at(A);
  await C.view({});
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]]);
  assert.deepEqual(toasts(), ["Your view follows Talo."]);
  assert.deepEqual(followed, [{ scene: IDS.sceneB, level: IDS.levelB2, reason: "pull" }]);
  await C.view({});                                  // a second pull inside 10 s: no second toast
  assert.deepEqual(toasts(), ["Your view follows Talo."]);
  t.mock.timers.tick(10001);
  await C.view({});                                  // past 10 s: the toast comes back
  assert.deepEqual(toasts(), ["Your view follows Talo.", "Your view follows Talo."]);
  // dnd5e's linked transformInto: the token now names the form actor, with NO token flag
  const [tok] = taloTok();
  F.updateToken(tok, { actorId: IDS.wolf, actorLink: true });
  t.mock.timers.tick(10001);
  await C.view({});
  assert.equal(toasts().at(-1), "Your view follows Wolf.");
  F.updateToken(tok, { actorId: IDS.talo });
  await flush();
  assert.deepEqual(loadingToasts(), []);
});

test("5 carryTo move to C, then teleportParty's pullUsers to C while loading: one draw, no toast, no bounce", async () => {
  reset();
  at(B, IDS.levelB2);
  F.autoDraw = false;
  const moved = carryTalo(IDS.sceneC);
  assert.equal(moved.id, IDS.taloTok, "keepId: the same token id on the new scene");
  const pull = C.view({ controlledTokens: [] });       // dest.pullUsers → Scene#view, before core set loading
  await flush();
  assert.equal(canvas.loading, true, "the one draw is under way");
  F.release();
  await pull;
  await flush();
  F.autoDraw = true;
  assert.deepEqual(F.views, [[IDS.sceneC, { controlledTokens: [IDS.taloTok] }]]);
  assert.equal(canvas.scene, C);
  assert.deepEqual(loadingToasts(), []);
  assert.deepEqual(followed.map(f => f.reason), ["move"]);
});

test("6 core move (same id on B, delete with replacements), then TeleportToken's pull while loading: one draw with level and controlledTokens", async () => {
  reset();
  at(C);
  F.autoDraw = false;
  const [old] = taloTok();
  const created = F.createToken(IDS.sceneB, { id: old.id, name: "Talo", actorId: IDS.talo, level: IDS.levelB1 });
  F.deleteToken(old, { replacements: { [old.id]: created.uuid } });
  const pull = B.view({ level: IDS.levelB1, controlledTokens: [created.id], transition: "fade" });
  await flush();
  F.release();
  await pull;
  await flush();
  F.autoDraw = true;
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [IDS.taloTok], level: IDS.levelB1 }]]);
  assert.deepEqual(loadingToasts(), []);
  assert.equal(canvas.scene, B);
});

test("6b core move with replacements in one batch, nothing else: create + delete before core sets loading → ONE draw, one followed", async () => {
  reset();
  at(B, IDS.levelB1);
  F.autoDraw = false;
  const [old] = taloTok();
  const created = F.createToken(IDS.sceneC, { id: old.id, name: "Talo", actorId: IDS.talo, level: null });
  assert.equal(canvas.loading, false, "core has not set loading yet");
  F.deleteToken(old, { replacements: { [old.id]: created.uuid } });
  await flush();
  F.release();
  await flush();
  F.autoDraw = true;
  assert.equal(F.views.length, 1, JSON.stringify(F.views));
  assert.equal(followed.length, 1);
  assert.equal(canvas.scene, C);
  // and back to B, level B1, for the next case
  const [here] = taloTok();
  const back = F.createToken(IDS.sceneB, { id: here.id, name: "Talo", actorId: IDS.talo, level: IDS.levelB1 });
  F.deleteToken(here, { replacements: { [here.id]: back.uuid } });
  await flush();
  assert.equal(canvas.scene, B);
});

test("7 the player moves its own token through a stock TeleportToken: one draw, no toast", async () => {
  reset();
  at(B, IDS.levelB1);
  F.autoDraw = false;
  const [old] = taloTok();
  const created = F.createToken(IDS.sceneA, { id: "taloTokOnA000001", name: "Talo", actorId: IDS.talo }, { userId: IDS.taloUser });
  F.deleteToken(old, { replacements: { [old.id]: created.uuid } }, { userId: IDS.taloUser });
  const self = A.view({ controlledTokens: [created.id] });  // teleport-token.mjs:158, while loading
  await flush();
  F.release();
  await self;
  await flush();
  F.autoDraw = true;
  assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneA]);
  assert.deepEqual(loadingToasts(), []);
});

test("8 the token is deleted with no replacement: no view; the player stays", async () => {
  reset();
  at(A);
  const [tok] = taloTok();
  F.deleteToken(tok);
  await flush();
  assert.deepEqual(F.views, []);
  assert.equal(canvas.scene, A);
  await C.view({});                                   // no token: stock
  assert.deepEqual(F.views, [[IDS.sceneC, {}]]);
  reset();
  const fresh = F.createToken(IDS.sceneA, { id: "taloFreshA000001", name: "Talo", actorId: IDS.talo });
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneA, { controlledTokens: [fresh.id] }]], "the character's only token, created: followed");
  assert.deepEqual(followed.map(f => f.reason), ["move"]);
  reset();
  F.deleteToken(fresh);
  await flush();
  assert.deepEqual(F.views, [], "deleted again with none left: stay");
});

test("9 two tokens, not mid-move: stock behaviour", async () => {
  await setPinning(false);
  F.createToken(IDS.sceneB, { id: "taloTwoB00000001", name: "Talo", actorId: IDS.talo, level: IDS.levelB2 });
  F.createToken(IDS.sceneA, { id: "taloTwoA00000001", name: "Talo", actorId: IDS.talo });
  await setPinning(true);
  reset();
  at(C);
  await A.view({ x: 1 });
  assert.deepEqual(F.views, [[IDS.sceneA, { x: 1 }]], "ambiguous: core does what it was asked");
  F.deleteToken(game.scenes.get(IDS.sceneA).tokens.get("taloTwoA00000001"));
  reset();
});

test("9b a second token while pinning is ON: not followed (a copy is not a move); deleting the copy the player views sends them to the one left", async () => {
  reset();
  at(B, IDS.levelB2);
  const [orig] = taloTok();
  const copy = F.createToken(IDS.sceneC, { id: "taloCopyC0000001", name: "Talo", actorId: IDS.talo });
  await flush();
  assert.deepEqual(F.views, [], "a GM copy (or a drag from the sidebar) does not pull the player");
  at(A);
  await A.view({ x: 1 });
  assert.deepEqual(F.views, [[IDS.sceneA, { x: 1 }]], "two tokens, neither viewed: stock");
  // the player views the copy's scene (pickToken: the one on the viewed scene); the GM deletes that copy
  reset();
  at(C);
  F.deleteToken(copy);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [orig.id], level: IDS.levelB2 }]], "sent to the token that is left");
  assert.deepEqual(followed.map(f => f.reason), ["reconcile"]);
  assert.equal(taloTok().length, 1);
  assert.equal(taloTok()[0], orig);
  // the copy deleted while the player is on the original's scene: nothing to do
  reset();
  const copy2 = F.createToken(IDS.sceneC, { id: "taloCopyC0000002", name: "Talo", actorId: IDS.talo });
  F.deleteToken(copy2);
  await flush();
  assert.deepEqual(F.views, []);
});

test("8b (review #8) a carry's create keeps the token id on the destination: it is the latest token, so a pull there before the delete is not sent back", async () => {
  reset();
  at(B, IDS.levelB2);
  F.autoDraw = false;
  try {
    const [old] = taloTok();
    const created = F.createToken(IDS.sceneC, { id: old.id, name: "Talo", actorId: IDS.talo, level: null });  // carryTo: keepId create
    assert.equal(game.modules.get(MODULE).api.latestOf?.(IDS.talo) ?? created.uuid, created.uuid);
    const pull = C.view({});                           // a pull to the destination, before the delete
    await flush();
    assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneC], "never a view of the scene the token is leaving");
    F.deleteToken(old);                                // carryTo: the plain delete
    F.release();
    await pull;
    await flush();
  } finally {
    // shared fixture state (R2): a failed assertion above must not leave draws hanging for later cases
    F.autoDraw = true;
    while (F.pendingDraws()) F.release();
    await flush();
  }
  assert.equal(canvas.scene, C);
  assert.equal(F.views.length, 1, JSON.stringify(F.views));
  assert.deepEqual(loadingToasts(), []);
  carryTalo(IDS.sceneB, { level: IDS.levelB2 });
  await flush();
  assert.equal(canvas.scene, B);
  reset();
});

test("7a (review #7) a pin lookup that throws inside the view queue is logged, never uncaught", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(A);
  canvas.loading = true;
  await C.view({});                                  // deferred into the queue
  const me = game.user;
  const desc = Object.getOwnPropertyDescriptor(me, "flags");
  Object.defineProperty(me, "flags", { get() { throw new Error("lookup boom"); }, configurable: true });
  canvas.loading = false;
  consoleLines.length = 0;
  try {
    assert.doesNotThrow(() => t.mock.timers.tick(100));
  } finally {
    if (desc) Object.defineProperty(me, "flags", desc);
    else delete me.flags;
  }
  assert.ok(consoleLines.some(([level, line]) => level === "warn" && /pin lookup failed/.test(line)), JSON.stringify(consoleLines));
  consoleLines.length = 0;
  at(B, IDS.levelB2);
  reset();
});

test("7b (review #7) the queue gives up after SETTLE_GIVE_UP_MS even while it keeps re-deferring, and stops polling", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(A);
  F.autoDraw = false;
  const me = game.users.get(IDS.taloUser);
  F.fire("updateUser", me, { flags: { [MODULE]: { actor: IDS.talo } } }, {}, IDS.gm);   // reconcile → a view of B
  await flush();
  assert.equal(F.pendingDraws(), 1, "the draw of B hangs");
  // a draw that hangs with loading already cleared: the view pins let through never resolves
  let reads = 0, loading = false;
  Object.defineProperty(canvas, "loading", { get() { reads++; return loading; }, set(v) { loading = v; }, configurable: true, enumerable: true });
  const [tok] = taloTok();
  try {
    F.updateToken(tok, { level: IDS.levelB1 }, { userId: IDS.gm });   // another level: deferred behind it
    consoleLines.length = 0;
    for (let i = 0; i < 1300; i++) t.mock.timers.tick(100);   // 130 s
    assert.equal(consoleLines.filter(([level, line]) => level === "warn" && /120 s/.test(line)).length, 1, JSON.stringify(consoleLines.slice(0, 3)));
    const before = reads;
    t.mock.timers.tick(10000);
    assert.equal(reads, before, "after giving up nothing polls");
  } finally {
    // shared fixture state (R2), restored even when an assertion above failed: the property, the
    // hung draw, the token's level
    Object.defineProperty(canvas, "loading", { value: loading, writable: true, configurable: true, enumerable: true });
    F.autoDraw = true;
    while (F.pendingDraws()) F.release();
    await flush();
  }
  F.updateToken(tok, { level: IDS.levelB2 }, { userId: IDS.gm });
  t.mock.timers.tick(100);
  await flush();
  consoleLines.length = 0;
  assert.equal(canvas.scene, B);
  assert.equal(canvas.level?.id, IDS.levelB2);
  reset();
});

test("10 canvasReady while loading: no view inside the hook; one view after loading clears", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  at(A);
  canvas.loading = true;
  assert.equal(F.fireCall("canvasReady", canvas), true, "never vetoes");
  assert.deepEqual(F.views, [], "no view from inside canvasReady");
  t.mock.timers.tick(500);
  assert.deepEqual(F.views, [], "still loading: still waiting");
  canvas.loading = false;
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
  assert.deepEqual(loadingToasts(), []);
});

test("11 a login with no active scene (canvas.draw(null), no canvasReady): ready: reconcile views the token's scene", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  Object.assign(canvas, { scene: null, level: null, loading: false });
  F.fire("ready");
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
});

test("12 a request while another scene loads is deferred, then the FRESH target is viewed once", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(A);
  canvas.loading = true;                             // core is drawing A (an activation)
  await C.view({});                                  // an activation-time pull: deferred
  assert.deepEqual(F.views, []);
  carryTalo(IDS.sceneC);                             // the token moves again meanwhile
  assert.deepEqual(F.views, []);
  canvas.loading = false;
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneC, ctl()]], "one view, of where the token is now");
  assert.deepEqual(loadingToasts(), []);
  carryTalo(IDS.sceneB, { level: IDS.levelB2 });
  await flush();
});

test("13 level: core's level follow already drawing → no second draw; with nothing in flight → one view({ level })", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  canvas.loading = true;                             // token.mjs:2968 started the draw of B
  F.updateToken(tok, { level: IDS.levelB1 });
  assert.deepEqual(F.views, []);
  canvas.loading = false;
  at(B, IDS.levelB1);                                // that draw landed on B1
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [], "rechecked after the draw: already there, no second draw");
  F.updateToken(tok, { level: IDS.levelB2 });
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
});

test("13d (review #2) the token changes level while a draw pins did not start is loading: retried once loading clears", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  canvas.loading = true;                             // a redraw of B at B2 (canvas.draw), not pins'
  F.updateToken(tok, { level: IDS.levelB1 }, { userId: IDS.gm });
  assert.deepEqual(F.views, [], "nothing reaches core while it loads");
  canvas.loading = false;
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB1)]], "the level change is not dropped");
  // core sets canvas.loading BEFORE it assigns the scene: a draw of C under way still names A
  reset();
  at(A);
  canvas.loading = true;
  F.updateToken(tok, { level: IDS.levelB2 }, { userId: IDS.gm });
  carryTalo(IDS.sceneA, { id: "taloStaleA000001" });  // the token arrives on the stale-named scene
  canvas.scene = C;                                  // the draw assigns C
  canvas.loading = false;
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneA], "the token's scene is viewed after the draw of C");
  carryTalo(IDS.sceneB, { id: IDS.taloTok, level: IDS.levelB2 });
  await flush();
  assert.equal(canvas.scene, B);
});

test("13b another level of the token's scene, asked: passed, and canvasReady leaves it alone", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);                                // the token is on B2
  await B.view({ level: IDS.levelB1 });              // a nav click on B1 (a familiar's level)
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB1 }]], "passed as asked");
  reset();
  at(B, IDS.levelB1);
  canvas.loading = true;
  F.fireCall("canvasReady", canvas);
  canvas.loading = false;
  t.mock.timers.tick(5000);
  await flush();
  assert.deepEqual(F.views, [], "the scene is the binding rule: no snap back to B2");
  at(B, IDS.levelB2);
});

test("13c (review #1) a pull or an activation to another level of the token's scene views the token's level; a redraw onto it is undone", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);                                // the token is on B2
  socketEmit("pullToScene", IDS.sceneB, { level: IDS.levelB1 });   // scene-nav "Pull everyone" on B1 (scene-navigation.mjs:249)
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]], "the pin beats the pulled level");
  assert.equal(canvas.level?.id, IDS.levelB2);
  reset();
  at(A);
  socketEmit("pullToScene", IDS.sceneB, { level: IDS.levelB1 });   // pulled from another scene
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]]);
  reset();
  B._onActivate(true, { viewOptions: { level: IDS.levelB1 } });   // the GM activates B at B1
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]], "an activation at a level: the token's level");
  // a draw that lands on B1 by a path pins does not see (canvas.draw after a level deletion)
  reset();
  at(B, IDS.levelB1);
  canvas.loading = true;
  F.fireCall("canvasReady", canvas);
  canvas.loading = false;
  t.mock.timers.tick(100);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]], "nobody chose B1: back to the token's level");
  // the player's own choice (13b) still holds, and a later pull ends it
  reset();
  await B.view({ level: IDS.levelB1 });
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB1 }]], "the player's own click passes as asked");
  socketEmit("pullToScene", IDS.sceneB, {});
  await flush();
  assert.deepEqual(F.views.at(-1), [IDS.sceneB, { level: IDS.levelB2 }], "a pull with no level: the token's level");
  assert.equal(canvas.level?.id, IDS.levelB2);
  assert.deepEqual(loadingToasts(), []);
});

test("14 wild shape: the token rewritten to the form keeps the pin; activation skipped; a move followed; revert", async () => {
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  F.updateToken(tok, { actorId: IDS.wolf, flags: { dnd5e: { originalActor: IDS.talo } } });
  await flush();
  assert.deepEqual(F.views, [], "the transform makes no view");
  C._onActivate(true, { viewOptions: {} });
  assert.deepEqual(F.activations, [], "a wild-shaped Talo still ignores activation");
  carryTalo(IDS.sceneC);
  await flush();
  assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneC], "the form token's move is followed");
  const [form] = taloTok();
  F.updateToken(form, { actorId: IDS.talo, flags: {} });
  reset();
  A._onActivate(true, { viewOptions: {} });
  assert.deepEqual(F.activations, [], "reverted: still pinned");
  carryTalo(IDS.sceneB, { level: IDS.levelB2 });
  await flush();
});

test("14b wild shape the dnd5e 6.0.6 linked way: token → form actor (actorLink), NO token flag; the pin holds through the form actor's flags", async () => {
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  F.updateToken(tok, { actorId: IDS.wolf, actorLink: true });
  assert.equal(tok.flags?.dnd5e?.originalActor, undefined, "no token flag: the root comes from the form actor");
  await flush();
  assert.deepEqual(F.views, []);
  C._onActivate(true, { viewOptions: {} });
  assert.deepEqual(F.activations, [], "a wild-shaped Talo still ignores activation");
  carryTalo(IDS.sceneC);
  await flush();
  assert.deepEqual(F.views.map(v => v[0]), [IDS.sceneC], "the form token's move is followed");
  const [form] = taloTok();
  F.updateToken(form, { actorId: IDS.talo });
  carryTalo(IDS.sceneB, { level: IDS.levelB2 });
  await flush();
});

test("15 a GM and an unpinned player are unaffected", async () => {
  for (const userId of [IDS.miraUser, IDS.gm]) {
    F.become({ userId });
    reset();
    at(B, IDS.levelB2);
    await A.view({ y: 2 });
    C._onActivate(true, { viewOptions: {} });
    await flush();
    assert.deepEqual(F.views[0], [IDS.sceneA, { y: 2 }], userId);
    assert.deepEqual(F.activations, [[IDS.sceneC, true]], userId);
  }
  F.become({ userId: IDS.taloUser });
});

test("updateUser: a pin set on this player's user while it views another scene → view the token's scene (reconcile); others and other flags → nothing", async () => {
  reset();
  at(A);
  const me = game.users.get(IDS.taloUser);
  F.fire("updateUser", game.users.get(IDS.miraUser), { flags: { [MODULE]: { actor: IDS.mira } } }, {}, IDS.gm);
  F.fire("updateUser", me, { flags: { other: {} } }, {}, IDS.gm);
  F.fire("updateUser", me, { name: "x" }, {}, IDS.gm);
  await flush();
  assert.deepEqual(F.views, [], "another user, another flag scope, no flags");
  F.fire("updateUser", me, { flags: { [MODULE]: { actor: IDS.talo } } }, {}, IDS.gm);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
  assert.deepEqual(followed.map(f => f.reason), ["reconcile"]);
  reset();
  at(A);
  F.fire("updateUser", me, { flags: { [MODULE]: { "-=actor": null } } }, {}, IDS.gm);   // still pinned in the world: reconciles
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]], "the -=actor diff shape is read too");
});

test("20 switching on: only the GM client whose user made the change audits and toasts; players follow", async () => {
  const audited = [];
  const id = Hooks.on(HOOKS.audited.name, r => audited.push(r));
  F.become({ userId: IDS.gm });
  reset();
  row().onChange(true, {}, IDS.bot);                 // the bot flipped it: Joe's tab stays quiet
  assert.deepEqual([toasts(), audited], [[], []]);
  row().onChange(true, {}, IDS.gm);
  assert.deepEqual(toasts(), ["Pinning on: all 1 pins have one token."]);
  assert.equal(audited.length, 1);
  assert.equal(audited[0].ok, true);
  // a problem: Talo has a second token on C → a warn toast naming it, ok false, NOTHING deleted
  const extra = F.createToken(IDS.sceneC, { id: "taloAuditC000001", name: "Talo", actorId: IDS.talo });
  reset();
  audited.length = 0;
  row().onChange(true, {}, IDS.gm);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]),
    [["warn", "Pinning on: 1 problem(s) — Talo (Talo's player) has several tokens: Lighthouse, Cave"]]);
  assert.equal(audited.length, 1);
  assert.equal(audited[0].ok, false);
  assert.equal(audited[0].violations[0].code, "MANY_TOKENS");
  assert.deepEqual(F.calls.filter(c => /delete/i.test(c.op ?? "")), [], "the switch-on audit deletes nothing");
  assert.equal(C.tokens.has(extra.id), true);
  C.tokens.delete(extra.id);
  F.become({ userId: IDS.taloUser });
  reset();
  at(A);
  row().onChange(true, {}, IDS.gm);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, ctl(IDS.levelB2)]]);
  assert.deepEqual(followed.map(f => f.reason), ["switch"]);
  assert.deepEqual(toasts(), [], "a player does not audit");
  reset();
  row().onChange(false, {}, IDS.gm);                 // off: nobody moves
  assert.deepEqual(F.views, []);
  Hooks.off(HOOKS.audited.name, id);
});

test("pinned player: a token moved by someone else pans through core's Token#panCanvas, once (R2-double-pan)", async () => {
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  const panned = [];
  // the drawn placeable: core's panCanvas does the off-screen test (sidebar padding, hex centre)
  tok.object = { controlled: false, panCanvas: opts => void panned.push(opts ?? {}) };
  try {
    F.updateToken(tok, { x: 5000, y: 600 }, { userId: IDS.gm });
    assert.deepEqual(panned, [{}], "an uncontrolled token: core's own off-screen test and pan");
    tok.object.controlled = true;
    F.updateToken(tok, { x: 5200, y: 600 }, { userId: IDS.gm });
    assert.equal(panned.length, 1, "a controlled token: core pans it already (Token#_onUpdate); never a second animatePan");
    tok.object.controlled = false;
    F.updateToken(tok, { x: 9000, y: 600 }, { userId: IDS.taloUser });
    assert.equal(panned.length, 1, "the player's own move never pans");
    delete tok.object;
    F.updateToken(tok, { x: 600, y: 600 }, { userId: IDS.gm });
    assert.deepEqual(canvas.pans, [], "no placeable drawn: nothing to pan to, and never pins' own animatePan");
  } finally {
    delete tok.object;
  }
});

test("E2/B4 a redirected or re-levelled view controls the pinned token, never ids from the asked view; an observer-only pin leaves core's fallback", async () => {
  reset();
  at(A);
  const [tok] = taloTok();
  const home = tok.parent;
  const away = [A, B, C].find(s => s !== home && s !== canvas.scene);
  // a familiar teleported elsewhere: core's TeleportToken view controls the familiar (teleport-token.mjs:144)
  await away.view({ controlledTokens: ["familiarOnAway01"], transition: { type: "fade" } });
  await flush();
  const want = { controlledTokens: [tok.id], transition: { type: "fade" } };
  if (tok.level) want.level = tok.level;
  assert.deepEqual(F.views, [[home.id, want]], "redirected: the pinned token is the controlled one");
  // an observer-only pin: no controlledTokens at all, so core controls the character or pans to an observed token
  const actor = game.actors.get(IDS.talo);
  const before = actor.ownership[IDS.taloUser];
  actor.ownership[IDS.taloUser] = 2;
  try {
    reset();
    at(A);
    await away.view({ controlledTokens: ["familiarOnAway01"] });
    await flush();
    assert.equal(F.views.length, 1, JSON.stringify(F.views));
    assert.equal(F.views[0][0], home.id);
    assert.equal("controlledTokens" in F.views[0][1], false, "never [] (core then skips its fallback, board.mjs:1575)");
    reset();
    at(home, tok.level ?? null);
    const moved = carryTalo(home === C ? IDS.sceneB : IDS.sceneC, { level: home === C ? IDS.levelB2 : null });
    await flush();
    const last = F.views.at(-1);
    assert.equal(last?.[0], moved.parent.id, JSON.stringify(F.views));
    assert.equal("controlledTokens" in last[1], false, "a followed move of an observed token: no empty controlledTokens");
  } finally {
    actor.ownership[IDS.taloUser] = before;
  }
  // back to B, level B2, for the cases after this one
  if (taloTok()[0].parent.id !== IDS.sceneB) carryTalo(IDS.sceneB, { level: IDS.levelB2 });
  await flush();
  reset();
});

test("E2 a pull to another level of the token's scene views the token's level with the token controlled, not the pulled ids", async () => {
  reset();
  at(B, IDS.levelB1);
  const [tok] = taloTok();
  assert.equal(tok.level, IDS.levelB2);
  socketEmit("pullToScene", IDS.sceneB, { level: IDS.levelB1, controlledTokens: ["someoneOnB100001"] });
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2, controlledTokens: [tok.id] }]]);
  reset();
});

test("A1-3 a move within the scene to another level (copy on B1, original on B2 deleted): the view follows the level", async () => {
  reset();
  at(B, IDS.levelB2);
  const [orig] = taloTok();
  assert.equal(orig.level, IDS.levelB2);
  const copy = F.createToken(IDS.sceneB, { id: "taloMoveB1000001", name: "Talo", actorId: IDS.talo, level: IDS.levelB1 });
  await flush();
  assert.deepEqual(F.views, [], "two tokens on the viewed scene: ambiguous, nothing yet");
  F.deleteToken(orig);
  await flush();
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [copy.id], level: IDS.levelB1 }]], "same scene, other level: followed");
  assert.equal(canvas.level?.id, IDS.levelB1);
  // and back: the level update is followed as before, naming the token so core controls and pans to
  // it on the new level (else its fallback picks game.user.character or any owned token: F-follow-ctl)
  reset();
  F.updateToken(copy, { level: IDS.levelB2 }, { userId: IDS.gm });
  await flush();
  assert.equal(canvas.level?.id, IDS.levelB2);
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [copy.id], level: IDS.levelB2 }]]);
  reset();
});

test("B1 a token on an orphan level (an id its scene no longer has) is followed by scene only: no endless redraw", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);
  const [tok] = taloTok();
  const keep = tok.level;
  try {
    F.updateToken(tok, { level: "orphanLevel00001" }, { userId: IDS.gm });
    await flush();
    assert.deepEqual(F.views, [], "the orphan level is never asked for");
    Hooks.call("canvasReady", canvas);
    for (let i = 0; i < 50; i++) t.mock.timers.tick(100);
    await flush();
    assert.deepEqual(F.views, [], "canvasReady: on the token's scene is enough");
    // viewed from another scene: one view of B with no level (core picks its initial level), then quiet
    at(A);
    await C.view({});
    await flush();
    assert.equal(F.views.length, 1, JSON.stringify(F.views));
    assert.equal(F.views[0][0], IDS.sceneB);
    assert.equal("level" in F.views[0][1], false);
    canvas.level = { id: IDS.levelB1 };              // core drew the initial level
    Hooks.call("canvasReady", canvas);
    for (let i = 0; i < 50; i++) t.mock.timers.tick(100);
    await flush();
    assert.equal(F.views.length, 1, "no redraw loop");
  } finally {
    Object.assign(tok, { level: keep });
  }
  at(B, IDS.levelB2);
  reset();
});

test("L4 the viewed level is deleted: core's fallback view of the initial level is not the player's choice", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  reset();
  at(B, IDS.levelB2);                                // the token is on B2
  const B3 = "levelB3000000001";
  const keep = new Map(B.levels);
  try {
    B.levels.set(B3, { id: B3 });
    await B.view({ level: IDS.levelB1 });            // the player picks B1 (13b)
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB1 }]], "the player's click passes as asked");
    assert.equal(canvas.level?.id, IDS.levelB1);
    // the GM deletes B1: core fires deleteLevel, then Level._onDeleteOperation views the initial level
    // (level.mjs `scene.view({ level: initialLevel.id })`), here B3
    reset();
    B.levels.delete(IDS.levelB1);
    F.fire("deleteLevel", { id: IDS.levelB1, parent: B }, {}, IDS.gm);
    await B.view({ level: B3 });
    await flush();
    for (let i = 0; i < 10; i++) t.mock.timers.tick(100);
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]], "core's fallback goes to the token's level, not B3");
    assert.equal(canvas.level?.id, IDS.levelB2);
    // the mark is used once: the player's own click on B3 afterwards passes as asked
    reset();
    await B.view({ level: B3 });
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, { level: B3 }]], "a later click is the player's choice again");
    // deleting a level the player does not view marks nothing
    reset();
    at(B, IDS.levelB2);
    F.fire("deleteLevel", { id: "otherLevel000001", parent: B }, {}, IDS.gm);
    await B.view({ level: B3 });
    await flush();
    assert.deepEqual(F.views, [[IDS.sceneB, { level: B3 }]], "no mark: the click passes as asked");
    assert.deepEqual(loadingToasts(), []);
  } finally {
    B.levels = keep;
    at(B, IDS.levelB2);
    reset();
  }
});

test("no hook errors, no console errors on the way", () => {
  assert.deepEqual(F.hookErrors, []);
  assert.deepEqual(consoleLines.filter(([level]) => level === "error"), []);
});

// Keep this test LAST: it replaces the published API.
test("hot patch: uninstall() unwraps both patches and drops every hook; re-import wires again", async () => {
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("createToken"), 0);
  assert.equal(anyListeners.length, 0, "the socket listener is dropped");
  assert.equal(B.view.__pentarynPinsView, undefined, "Scene#view is core's again");
  assert.equal(B._onActivate.__pentarynPinsActivate, undefined);
  consoleLines.length = 0;
  await import(`../pins.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, []);
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(B.view.__pentarynPinsView, true);
  assert.equal(anyListeners.length, 1, "one socket listener again");
  assert.deepEqual(fresh.describe().patches.map(p => p.adjustments), ["pins-scene-view", "pins-scene-activate"]);
});
