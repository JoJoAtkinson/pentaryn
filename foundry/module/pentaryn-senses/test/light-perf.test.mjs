/**
 * Finding -13 (standalone): the deleteToken / deleteActor hooks walk the world's spell lights at
 * most once per burst, and not at all for a linked token. The frozen light-gm-hooks golden proves
 * the same sources are still queued; this file counts the walks.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeTok, flush, settle, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
for (let i = 1; i <= 3; i++) {
  const t = makeTok({ id: `tokBurst00000000${i}`.slice(-16), name: "Bat", actorId: "actGoblin0000001", synthetic: { type: "npc", items: [] } });
  t.parent = world.scenes[0];
  t.collection = world.scenes[0].tokens;
  world.scenes[0].tokens.set(t.id, t);
}
const F = await boot({ world });
await settle(mock);

let walks = 0;
for (const s of game.scenes) {
  const iterate = s.lights[Symbol.iterator].bind(s.lights);
  s.lights[Symbol.iterator] = function () { walks++; return iterate(); };   // one count per walk of a scene's lights
}
const scenes = game.scenes.size;

test("a burst of three unlinked deletions walks the scenes once", async () => {
  walks = 0;
  const s1 = game.scenes.contents[0];
  const bats = s1.tokens.filter(t => t.name === "Bat");
  assert.equal(bats.length, 3);
  for (const b of bats) s1.tokens.delete(b.id);
  for (const b of bats) F.fire("deleteToken", b, {});
  assert.equal(walks, scenes, "one walk for the whole burst");
  await flush();
  walks = 0;
  F.fire("deleteToken", bats[0], {});
  assert.equal(walks, scenes, "the memo is dropped after the burst");
  for (const b of bats) s1.tokens.set(b.id, b);
});

test("a linked token's deletion does not walk at all", () => {
  walks = 0;
  const hero = game.scenes.contents[1].tokens.find(t => t.actorLink);
  F.fire("deleteToken", hero, {});
  assert.equal(walks, 0);
});
