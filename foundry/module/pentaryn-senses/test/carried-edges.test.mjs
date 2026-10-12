/**
 * Final review (senses): edge cases of the carried-light sync.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeTok, settle, since, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

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
