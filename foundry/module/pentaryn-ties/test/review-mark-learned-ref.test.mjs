/**
 * R3 [declared] (final review ties-core, 2026-10-12; defect wave 2): `attributes.markLearned` takes
 * its character as an Actor, an id, a uuid, an exact name or a token — resolved to the world actor
 * through the kit's resolveRef, as the legacy reads do — and refuses `{ ok: false, reason: "invalid" }`
 * when nothing resolves. Before, an id string threw `character.getFlag is not a function`.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzR3Pc0000000001";

await bootWorld({
  settings: { "pentaryn-ties.attributes": [{ id: "guild", title: "Salt Guild", category: "Guild", lore: [{ id: "r", label: "Dues", text: "X", dc: 12, skill: "his" }] }] },
  actors: [{ id: PC, name: "ZZ R3 PC", type: "character", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } }],
});
const T = () => game.pentaryn.ties;
const granted = () => game.actors.get(PC).getFlag("pentaryn-ties", "granted") ?? {};

test("R3: markLearned with an actor id string marks the world actor (before: threw getFlag is not a function)", async () => {
  const res = await T().attributes.markLearned(PC, "guild");
  assert.deepEqual(res, { ok: true, keys: ["attr:guild:r"] });
  assert.ok(granted()["attr:guild:r"], "the grant landed on the actor the id names");
});

test("R3: markLearned with an exact actor name resolves it too", async () => {
  assert.equal((await T().attributes.markLearned("ZZ R3 PC", "guild")).ok, true);
});

test("R3: markLearned refuses invalid when the character resolves to nothing — never a throw", async () => {
  assert.deepEqual(await T().attributes.markLearned("zzR3Nobody000001", "guild"), { ok: false, reason: "invalid" });
  assert.deepEqual(await T().attributes.markLearned("ZZ no such actor", "guild"), { ok: false, reason: "invalid" });
  assert.deepEqual(await T().attributes.markLearned({ not: "an actor" }, "guild"), { ok: false, reason: "invalid" });
});

test("R3: an Actor still passes straight through", async () => {
  assert.equal((await T().attributes.markLearned(game.actors.get(PC), "guild")).ok, true);
});
