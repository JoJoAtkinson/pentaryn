/**
 * Final review (senses, R1): the carried-light debounce is keyed by actor id. An unlinked token's
 * synthetic actor and a pack actor can share a world actor's id; their schedule must not cancel the
 * world actor's pending sync ("Bursts … coalesce into one sync per actor"; syncLight "Bring the
 * actor's prototype … in line").
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeActor, makeItem, makeTok, settle, since, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;
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

// Final review (senses, R2): syncLight's promise for a synthetic actor is "only its tokens are synced,
// each from its own items". A LINKED token of the base actor shares the base id but is not the
// synthetic's token, so it must not take the synthetic's carried light.
test("syncLight(synthetic) leaves the base actor's linked tokens alone", async () => {
  const s1 = game.scenes.get(ID.s1);
  const linked = makeTok({ id: "tokGobLinked0001", name: "Goblin", actorId: ID.goblin, actorLink: true });
  linked.parent = s1;
  linked.collection = s1.tokens;
  s1.tokens.set(linked.id, linked);
  try {
    const synthetic = s1.tokens.get(ID.tGob).actor;
    assert.ok(synthetic.isToken && synthetic.items.get(ID.gobTorch)?.flags[MODULE]?.lit, "the synthetic goblin carries a lit torch");
    assert.equal(game.actors.get(ID.goblin).items.size, 0, "the base goblin carries nothing");
    const mark = F.calls.length;
    await S().syncLight(synthetic);
    const touched = since(mark).filter(c => c.op === "updateEmbedded" && c.type === "Token").flatMap(c => c.updates.map(u => u._id));
    assert.ok(!touched.includes(linked.id), "the linked goblin token is not written");
    assert.equal(linked.flags?.[MODULE]?.itemLight, undefined);
  } finally {
    s1.tokens.delete(linked.id);
  }
});
