// The kit's root `game.pentaryn.inspect(ref)` resolves the ref as an Actor (its default kind) and
// passes that Actor to every namespace's inspect. Journal's inspect takes a user ref, so an Actor
// maps to the player whose assigned character it is, and to null when it is nobody's — never a
// BAD_ARGS error under `journal` in every root inspect (the blueprint's live smoke check).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { maxDepth } from "./kit/harness.mjs";
import { P1, P2, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const F = await journalWorld();
const talo = makeDoc("Actor", { id: "actorTalo0000001", name: "Talo Vesk" });
const wolf = makeDoc("Actor", { id: "actorWolf0000001", name: "Dire Wolf" });
F.game.actors.set(talo.id, talo);
F.game.actors.set(wolf.id, wolf);
F.game.users.get(P1).character = talo;
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

test("root inspect of a player's character: journal answers for that player, depth ≤ 4", async () => {
  const out = await game.pentaryn.inspect(talo);
  assert.equal(out.journal?.error, undefined, "no error under journal");
  assert.equal(out.journal.user.id, P1);
  assert.equal(out.journal.journal.id, api.personal(game.users.get(P1)).id);
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(await game.pentaryn.inspect("Talo Vesk"), out, "by name: the same Actor, the same answer");
});

test("root inspect of an actor that is nobody's character: journal is null, not an error", async () => {
  const out = await game.pentaryn.inspect(wolf);
  assert.equal(out.journal, null);
});

test("journal.inspect directly: an Actor or its token maps to the player; a user ref still resolves as a user", () => {
  assert.equal(api.inspect(talo).user.id, P1);
  assert.equal(api.inspect({ documentName: "Token", actor: talo, actorId: talo.id }).user.id, P1);
  assert.equal(api.inspect(wolf), null);
  assert.equal(api.inspect(P2).user.id, P2);
  assert.equal(api.inspect("Pat").user.id, P1);
  assert.throws(() => api.inspect("Nobody"), { code: "NOT_FOUND" });
});
