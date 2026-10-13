/**
 * Characterisation (senses checkpoint, wave 3), glue case d: the entry as a SECOND GM while another
 * GM is the active one. Each call site keeps its own predicate today: the sight reset, the carried
 * path, the torch hook and the Light reconcile are active-GM only; chain and setupLight take any GM.
 * Frozen once committed: during the refactor only import paths may change.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, makeItem, flush, settle, since, tokenHUD, standardWorld, ID, MODULE, NOW, GM, GM2, PLAYER } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld({ heroProto: { sight: { enabled: true, visionMode: "darkvision", range: 60 } } });
world.actors[0].items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
const F = await boot({ user: GM2, others: [GM, PLAYER], world, ready: false });
const hero = () => game.actors.get(ID.hero);

async function effects(fn) {
  const mark = F.calls.length;
  const value = await fn();
  await flush();
  await settle(mock);
  return { value: value === undefined ? "<undefined>" : F.plain(value), calls: since(mark) };
}

test("ready as the second GM: published, but no reset, no carried sync, no sweep", async () => {
  assert.equal(game.users.activeGM.id, GM);
  const r = await effects(() => F.fire("ready"));
  assert.deepEqual(r.calls, []);
  assert.ok(game.pentaryn.senses && game.pentaryn.chain);
  assert.equal(await game.pentaryn.senses.resetSight({ force: true }), null);
  assert.deepEqual(await game.pentaryn.senses.light.sweep(), { sources: 0, removed: 0 });
});

test("second GM: carried hooks, the torch hook and the reconcile hooks write nothing", async () => {
  hero().items.get(ID.torch).flags[MODULE] = { lit: true };
  const r = await effects(async () => {
    F.fire("updateActor", hero());
    F.fire("createItem", makeItem({ id: "itmGm2Torch00001", name: "Torch", system: { identifier: "torch" } }, hero()));
    F.fire("updateItem", hero().items.get(ID.light), { flags: { [MODULE]: { lightCast: null } } });
    F.fire("deleteScene", {});
  });
  hero().items.get(ID.torch).flags[MODULE] = {};
  assert.deepEqual(r.calls, []);
});

test("second GM: chain and setupLight act (any GM); the Break chain button shows", async () => {
  const rows = {};
  rows.link = await effects(() => game.pentaryn.chain.link(ID.tGob, ID.tStake));
  rows.break = await effects(() => game.pentaryn.chain.break(ID.tGob));
  rows.setupLight = await effects(() => game.pentaryn.senses.setupLight());
  const h = tokenHUD(game.scenes.get(ID.s1).tokens.get(ID.tHulk));
  F.fire("renderTokenHUD", h.app, h.element);
  // [declared senses-edge-3] a button's tip is in data-tooltip-text (plain text), not data-tooltip
  rows.hud = h.col.children.map(c => c.dataset.tooltipText);
  pinJSON("second-gm", rows, import.meta.url);
});
