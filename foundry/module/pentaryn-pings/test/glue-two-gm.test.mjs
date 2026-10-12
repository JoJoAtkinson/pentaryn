// pings-edge-1 [declared]: two GM tabs (the MCP bridge plus a browser tab) share the `log` store. This
// process is one of them; the other tab is simulated by writing the store directly, which reaches this
// tab the way Foundry delivers it — through the log row's onChange.
//
// Before the fix each tab kept its own copy of the whole log and wrote it back, so a clear() in the
// other tab was undone by this tab's next flush, and the other tab's pings were overwritten. Now a flush
// is a read-modify-write of the stored log (kit serialStore) that appends only this tab's pending pings,
// and a clear seen through onChange drops what this tab had not yet written. Its own process: ready
// fires once per page.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { ALPHA, BETA, GM, MODULE, PLAYER, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const manifest = manifestOf(new URL("..", import.meta.url));
const W = await setupWorld();
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true, version: manifest.version, title: manifest.title, flags: manifest.flags });
W.captureConsole();
await import("../pings.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const api = F.game.pentaryn.pings;
const gm = F.game.users.get(GM);
const layer = new W.ControlsLayer();
const xs = () => W.stored().map(r => r.x);
/** The other GM tab's write, as this tab sees it: the store changes and the row's onChange fires. */
const otherTab = list => F.game.settings.set(MODULE, "log", list);
const theirs = (x, t = Date.now()) => ({ t, userId: PLAYER, userName: "Rook", sceneId: BETA, sceneName: "Beta", x, y: 0 });

test("pings-edge-1: a clear() in the other GM tab is not undone by this tab's next flush", async () => {
  W.console.splice(0);
  layer.handlePing(gm, { x: 1, y: 1 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [1]);

  await otherTab([]);                                   // the other tab's clear()
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 2, y: 2 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [2], "the cleared ping stays gone");
});

test("pings-edge-1: the other tab's pings are merged, not overwritten", async () => {
  mock.timers.tick(1000);
  await otherTab([...W.stored(), theirs(50)]);
  layer.handlePing(gm, { x: 3, y: 3 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [2, 50, 3]);
});

test("pings-edge-1: a clear in the other tab drops this tab's pings not yet written", async () => {
  mock.timers.tick(1000);
  const before = W.log().length;
  layer.handlePing(gm, { x: 4, y: 4 }, { scene: ALPHA });
  await otherTab([]);
  mock.timers.tick(250);
  await drain();
  assert.equal(W.log().length, before + 1, "only the other tab's clear was written");
  assert.deepEqual(xs(), []);
});

test("pings-edge-1: the same ping captured by both tabs is stored once", async () => {
  mock.timers.tick(1000);
  // both tabs hear the player's ping; the other tab's write lands first
  await otherTab([theirs(60, Date.now() - 3)]);
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 60, y: 0 }, ping: { scene: BETA } });
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 61, y: 0 }, ping: { scene: BETA } });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [60, 61]);

  // this tab hears it first; the other tab's write lands while this tab's copy is still pending
  mock.timers.tick(1000);
  W.emitSocket("userActivity", PLAYER, { cursor: { x: 70, y: 0 }, ping: { scene: BETA } });
  await otherTab([...W.stored(), theirs(70, Date.now() + 2)]);
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(xs(), [60, 61, 70]);
  assert.deepEqual(W.console, []);
});

test("pings-edge-1: clear() here writes [] once; a flush already due then writes nothing", async () => {
  mock.timers.tick(1000);
  layer.handlePing(gm, { x: 7, y: 7 }, { scene: ALPHA });
  const before = W.log().length;
  assert.equal(await api.clear(), true);
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().slice(before).map(c => c.value), [[]]);
});
