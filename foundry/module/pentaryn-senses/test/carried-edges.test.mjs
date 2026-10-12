/**
 * Final review (senses, R1): the carried-light debounce is keyed by actor id. An unlinked token's
 * synthetic actor and a pack actor can share a world actor's id; their schedule must not cancel the
 * world actor's pending sync ("Bursts … coalesce into one sync per actor"; syncLight "Bring the
 * actor's prototype … in line").
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeActor, makeItem, settle, since, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const KEY = `prototypeToken.flags.${MODULE}.itemLight`;
const protoWrites = (mark, id) => since(mark).filter(c => c.op === "update" && c.documentName === "Actor" && c.uuid === `Actor.${id}`);

test("schedule: a synthetic actor's schedule does not cancel its base actor's prototype sync", async () => {
  const goblin = game.actors.get(ID.goblin);
  const baseTorch = makeItem({ id: "itmBaseTorch0001", name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: true } } }, goblin);
  baseTorch.parent = goblin;
  goblin.items.set(baseTorch.id, baseTorch);
  const synthetic = game.scenes.get(ID.s1).tokens.get(ID.tGob).actor;
  assert.ok(synthetic.isToken && synthetic.id === goblin.id);
  const mark = F.calls.length;
  F.fire("updateItem", baseTorch, {});
  F.fire("updateItem", synthetic.items.get(ID.gobTorch), {});
  await settle(mock);
  const writes = protoWrites(mark, ID.goblin);
  assert.equal(writes.length, 1, "the base goblin's prototype is synced once");
  assert.equal(writes[0].changes[KEY], true);
  goblin.items.delete(baseTorch.id);
  F.fire("deleteItem", baseTorch);
  await settle(mock);
});

test("schedule: a pack actor sharing a world id does not cancel the world sync", async () => {
  const hero = game.actors.get(ID.hero);
  const torch = hero.items.get(ID.torch);
  torch.flags[MODULE] = { lit: !torch.flags[MODULE]?.lit };
  const mark = F.calls.length;
  F.fire("updateItem", torch, {});
  F.fire("updateActor", makeActor({ id: ID.hero, name: "Marrith (pack)", pack: "world.heroes", items: [] }), {});
  await settle(mock);
  assert.equal(protoWrites(mark, ID.hero).length, 1, "the world hero's prototype is synced");
});
