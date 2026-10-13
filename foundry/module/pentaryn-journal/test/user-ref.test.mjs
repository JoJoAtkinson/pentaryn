// journal-rob-3: the legacy User-taking rows — personal(user?), shouldShowBar(entry, user?) and
// ensure(user) — resolve their user as a user ref (a User, an id or an exact name, never a substring),
// the way inspect and statusFor's `as` do. Before, a string from the bridge reached the feature raw:
// personal("Pat") said null, shouldShowBar read a string's permissions, ensure("Quinn") said
// "no such user". A ref that matches nobody throws NOT_FOUND; two matches throw AMBIGUOUS.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeUser } from "./kit/foundry-stub.mjs";
import { GM, P1, P2, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

test("journal-rob-3: personal() takes a User, an id or an exact name; the default is still the caller", () => {
  const mine = api.personal(game.users.get(P1));
  assert.ok(mine, "ready made Pat's journal");
  assert.equal(api.personal(P1), mine);
  assert.equal(api.personal("Pat"), mine);
  assert.equal(api.personal(game.users.get(GM)), null);
  assert.equal(api.personal(), null, "the calling GM has no journal");
  assert.throws(() => api.personal("Nobody"), { code: "NOT_FOUND" });
  assert.throws(() => api.personal("Pa"), { code: "NOT_FOUND" }, "never a substring");
});

test("journal-rob-3: shouldShowBar(entry, userRef) answers for the named user", () => {
  const entry = { documentName: "JournalEntry", flags: {},
    testUserPermission: (u, level) => u?.id === P1 && level === "OBSERVER" };
  assert.equal(api.shouldShowBar(entry, "Pat"), true);
  assert.equal(api.shouldShowBar(entry, P1), true);
  assert.equal(api.shouldShowBar(entry, "Gamemaster"), false, "a GM, gmButton off");
  assert.equal(api.shouldShowBar(entry), false, "the calling GM");
  assert.throws(() => api.shouldShowBar(entry, "Nobody"), { code: "NOT_FOUND" });
});

test("journal-rob-3: ensure(userRef) finds or creates the named player's journal; a bad ref rejects NOT_FOUND", async () => {
  const quinns = api.personal(game.users.get(P2));
  assert.ok(quinns);
  assert.equal(await api.ensure("Quinn"), quinns);
  assert.equal(await api.ensure(P2), quinns);
  await assert.rejects(api.ensure("Nobody"), { code: "NOT_FOUND" });
  await assert.rejects(api.ensure(game.users.get(GM)), { message: "a GM does not get a journal through the relay" });
  await assert.rejects(api.ensure(undefined), { message: "no such user" });
});

test("journal-rob-3: two users matching one name → AMBIGUOUS on every row", async () => {
  game.users.set("player0000000009", makeUser({ id: "player0000000009", name: "QUINN", isGM: false }));
  game.users.set("player0000000010", makeUser({ id: "player0000000010", name: "quinn", isGM: false }));
  const entry = { documentName: "JournalEntry", flags: {}, testUserPermission: () => true };
  assert.throws(() => api.personal("Quinn "), { code: "NOT_FOUND" });
  assert.throws(() => api.personal("QuInN"), { code: "AMBIGUOUS" });
  assert.throws(() => api.shouldShowBar(entry, "QuInN"), { code: "AMBIGUOUS" });
  await assert.rejects(api.ensure("QuInN"), { code: "AMBIGUOUS" });
});
