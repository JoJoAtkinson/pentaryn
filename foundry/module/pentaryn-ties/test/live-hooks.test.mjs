/**
 * ties-40: the Look window and the GM's inspect window share one live-refresh kit (LiveHooks in
 * ties-adapter.mjs). Their hook lists are what they always were, every hook is removed on close, and
 * a burst of queued refreshes renders once after 150 ms.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PLAYER = "zzPlayerUser0001";
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [{ id: PC, name: "ZZ Caven", type: "character" }, { id: NPC, name: "ZZ Brakka" }],
});
const { LiveHooks, LIVE_MS } = await import("../ties-adapter.mjs");
const { InspectPreview } = await import("../preview-app.mjs");
const { LookWindow } = await import("../look-app.mjs");

test("LiveHooks: start registers once, stop removes all; a burst debounces to one call", () => {
  const live = new LiveHooks();
  const before = F.listeners();
  assert.equal(live.start([["updateActor", () => {}], ["updateToken", () => {}]]), true);
  assert.equal(live.start([["updateActor", () => {}]]), false, "already watching");
  assert.equal(F.listeners("updateActor"), (before.updateActor ?? 0) + 1);
  let n = 0;
  for (let i = 0; i < 5; i++) live.debounce(() => n++);
  mock.timers.tick(LIVE_MS - 1);
  assert.equal(n, 0);
  mock.timers.tick(1);
  assert.equal(n, 1);
  live.stop();
  assert.deepEqual(F.listeners(), before);
  assert.equal(LIVE_MS, 150);
});

test("the inspect preview's live hooks: today's list, all removed on close", () => {
  const before = F.listeners();
  const pv = new InspectPreview(game.actors.get(NPC));
  const mark = F.hooks.length;
  pv._onFirstRender({}, {});
  const added = F.hooks.slice(mark).map(h => h.name);
  pv._onClose({});
  assert.deepEqual(F.listeners(), before);
  assert.ok(added.includes("updateActor") && added.includes("updateToken") && added.includes("createActor"));
});

test("the Look window's live hooks: today's list, all removed on close", () => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  const before = F.listeners();
  const w = new LookWindow(game.actors.get(PC), game.actors.get(NPC));
  const mark = F.hooks.length;
  w._onFirstRender({}, {});
  const added = F.hooks.slice(mark).map(h => h.name);
  w._onClose({});
  game.user = gm;
  assert.deepEqual(added, ["updateActor", "createSetting", "updateSetting", "deleteSetting", "updateToken", "deleteActor"]);
  assert.deepEqual(F.listeners(), before);
});

test("ties-46: the preview refreshes its roster when a player picks a character, or ownership changes", async () => {
  const pv = new InspectPreview(game.actors.get(NPC));
  let renders = 0;
  pv.mode = "player";
  Object.defineProperty(pv, "rendered", { get: () => true, configurable: true });
  pv.refreshSwitches = () => false;
  pv.liveRender = () => renders++;
  pv._onFirstRender({}, {});
  const tick = () => mock.timers.tick(150);
  F.fire("updateUser", game.users.get(PLAYER), { character: PC });
  tick();
  assert.equal(renders, 1, "a character pick");
  F.fire("updateUser", game.users.get(PLAYER), { avatar: "x.webp" });
  tick();
  assert.equal(renders, 1, "an avatar change does nothing");
  F.fire("updateActor", game.actors.get(PC), { ownership: { [PLAYER]: 3 } });
  tick();
  assert.equal(renders, 2, "an ownership change on a character");
  F.fire("updateActor", game.actors.get(PC), { system: { attributes: { hp: { value: 3 } } } });
  tick();
  assert.equal(renders, 2, "an hp change does nothing");
  pv._onClose({});
});

test("ties-ui-perf-9: the Look window ignores an unrelated actor's update before flattening its changes", () => {
  const OTHER = "zzOther000000001";
  const other = { id: OTHER, name: "ZZ Bystander" };
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  const w = new LookWindow(game.actors.get(PC), game.actors.get(NPC));
  let queued = 0;
  w.queueLive = () => queued++;
  w._onFirstRender({}, {});
  const real = foundry.utils.flattenObject;
  let flattened = 0;
  foundry.utils.flattenObject = o => {
    flattened++;
    return real ? real(o) : o;
  };
  try {
    F.fire("updateActor", other, { flags: { "pentaryn-ties": { granted: { x: 1 } } }, name: "Renamed" });
    assert.equal(flattened, 0, "an actor that is neither the character, the subject nor its kind is never flattened");
    assert.equal(queued, 0);
    F.fire("updateActor", game.actors.get(NPC), { name: "ZZ Brakka II" });
    assert.equal(queued, 1, "the subject's rename still refreshes");
    F.fire("updateActor", game.actors.get(PC), { flags: { "pentaryn-ties": { granted: { x: 1 } } } });
    assert.equal(queued, 2, "the character's grant still refreshes");
    F.fire("updateActor", game.actors.get(PC), { system: { attributes: { hp: { value: 3 } } } });
    assert.equal(queued, 2, "the character's hp change does nothing");
  } finally {
    foundry.utils.flattenObject = real;
    w._onClose({});
    game.user = gm;
  }
});
