/**
 * Characterisation (senses checkpoint, wave 3): the entry as a GM while NO user is the active GM
 * (`game.users.activeGM` null). isWriter falls back to "any GM", so the ready chain runs — but
 * resetSight and sweep check the active GM themselves and do nothing; only the carried-light sync
 * writes. The torch hook and the Light reconcile stay silent. Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, makeItem, flush, settle, since, captureConsole, standardWorld, ID, MODULE, NOW, PLAYER } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld({ heroProto: { sight: { enabled: true, visionMode: "darkvision", range: 60 } } });
world.actors[0].items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
const F = await boot({ others: [PLAYER], world, ready: false, selfActive: false });
const hero = () => game.actors.get(ID.hero);

test("ready with no active GM: only the carried-light sync writes", async t => {
  const out = captureConsole(t);
  assert.equal(game.users.activeGM, null);
  assert.equal(game.user.isGM, true);
  const mark = F.calls.length;
  F.fire("ready");
  await flush();
  await settle(mock);
  pinJSON("lone-gm-ready", { calls: since(mark), console: out }, import.meta.url);
});

test("no active GM: carried hooks still sync (any GM); the torch hook and reconcile hooks do not", async () => {
  hero().items.get(ID.torch).flags[MODULE] = { lit: true };
  const mark = F.calls.length;
  F.fire("updateActor", hero());
  F.fire("createItem", makeItem({ id: "itmLoneTorch0001", name: "Torch", system: { identifier: "torch" } }, hero()));
  await flush();
  await settle(mock);
  const calls = since(mark);
  assert.ok(calls.some(c => c.op === "update" && c.documentName === "Actor"), "the carried sync ran");
  assert.equal(calls.some(c => c.op === "update" && c.documentName === "Item"), false, "no torch activity");
  assert.equal(calls.some(c => c.op === "update" && c.documentName === "Token"), false, "no reconcile");
});
