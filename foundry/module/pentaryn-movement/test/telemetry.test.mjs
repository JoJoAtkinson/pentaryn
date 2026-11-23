// 0.8.0 glue: telemetry on a client (the API rows), the circuit breaker switching the drag help off and telling the GM,
// the "that move was wrong" key filing through pentaryn-feedback, the publish-first handshake only for users that view
// this scene, and the settings migration (groupMovement → groupDrags; smoothCorners and clickToStop folded in).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, SCENE, movementWorld } from "./fixtures/world.mjs";
import { KEYBINDINGS, migrateSettings } from "../settings.mjs";
import { reservations as reserve } from "../reserve-adapter.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-movement";
const F = await movementWorld();
const chats = [];
globalThis.ChatMessage = { create: async data => { chats.push(data); return data; } };
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;

test("telemetry(): this client's ring buffer and its summary; the summary goes to the GMs as a whisper", async () => {
  const t = api.telemetry();
  assert.equal(t.user, PLAYER);
  assert.ok(t.summary.counts && "plan" in t.summary.counts);
  assert.deepEqual(t.tripped, null);
  const r = await api.reportTelemetry();
  assert.equal(r.ok, true);
  assert.deepEqual(chats.at(-1).whisper, [GM]);
  assert.match(chats.at(-1).content, /plans/);
});

test("\"That move was wrong\" (Alt+W): files the last ten seconds as a Bug through pentaryn-feedback; without it, says so", async () => {
  const row = KEYBINDINGS.find(k => k.key === "wrongMove");
  assert.deepEqual(row.editable, [{ key: "KeyW", modifiers: ["Alt"] }]);
  assert.ok(F.calls.some(c => c.op === "keybindings.register" && c.id === `${MOD}.wrongMove`), "registered at init");
  const filed = [];
  game.pentaryn.feedback = { submit: async draft => { filed.push(draft); return { ok: true, id: "abc123", status: "filed" }; } };
  try {
    const r = await api.fileWrongMove();
    assert.equal(r.ok, true);
    assert.equal(filed[0].category, "bug");
    assert.match(filed[0].text, /That move was wrong/);
    assert.ok(filed[0].text.length <= 4000);
    assert.equal(api.telemetry().filed.id, "abc123");
    assert.equal(row.onDown(), true, "the key is consumed");
  } finally {
    delete game.pentaryn.feedback;
  }
  const r2 = await api.fileWrongMove();
  assert.equal(r2.code, "NO_FEEDBACK");
});

test("racers(): only another active user viewing this scene could be planning (the canvas-less bot and other maps never)", () => {
  const forced = F.CONFIG.debug["pentaryn-movement.publishFirst"];
  delete F.CONFIG.debug["pentaryn-movement.publishFirst"];
  const gm = game.users.get(GM);
  const saved = gm.viewedScene;
  try {
    gm.viewedScene = null;                          // the headless bot: no canvas, never views a scene
    assert.equal(reserve.racers({ id: SCENE }), false);
    gm.viewedScene = "otherScene";
    assert.equal(reserve.racers({ id: SCENE }), false, "on another map");
    gm.viewedScene = SCENE;
    assert.equal(reserve.racers({ id: SCENE }), true);
    const st = reserve.status();
    assert.ok(st.alone >= 2 && st.racing >= 1, JSON.stringify(st));
  } finally {
    gm.viewedScene = saved;
    F.CONFIG.debug["pentaryn-movement.publishFirst"] = forced;
  }
});

test("migrateSettings: the active GM carries groupMovement over to groupDrags and deletes the old row; every client drops the folded rows", async () => {
  const me = game.user;
  const wasGM = me.isGM;
  Object.defineProperty(me, "isGM", { value: true, configurable: true, writable: true });
  const gm = game.users.get(GM);
  const gmActive = gm.active;
  gm.active = false;                                 // this client is the active GM
  const deleted = [];
  const old = { value: "false", delete: async () => { deleted.push("groupMovement"); } };
  const savedStorage = game.settings.storage;
  game.settings.storage = new Map([["world", { getSetting: key => (key === `${MOD}.groupMovement` ? old : null) }]]);
  const local = new Map([[`${MOD}.clickToStop`, "false"], [`${MOD}.smoothCorners`, "true"], [`${MOD}.pathfindMine`, "true"]]);
  globalThis.localStorage = { getItem: k => (local.has(k) ? local.get(k) : null), removeItem: k => local.delete(k) };
  try {
    const r = await migrateSettings();
    assert.deepEqual(r.world.groupMovement, { value: false, to: "groupDrags", moved: true });
    assert.equal(game.settings.get(MOD, "groupDrags"), false);
    assert.deepEqual(deleted, ["groupMovement"]);
    assert.deepEqual(Object.keys(r.client).sort(), ["clickToStop", "smoothCorners"]);
    assert.deepEqual([...local.keys()], [`${MOD}.pathfindMine`], "only the folded rows go");
    assert.deepEqual(api.status().migrated, r);
  } finally {
    await game.settings.set(MOD, "groupDrags", true);
    game.settings.storage = savedStorage;
    delete globalThis.localStorage;
    Object.defineProperty(me, "isGM", { value: wasGM, configurable: true, writable: true });
    gm.active = gmActive;
  }
});
