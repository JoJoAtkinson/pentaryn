// items-journal-40, failure paths: claimWinner's table; a fresh stamp from another tab makes this tab wait
// (and reject after the bounded wait when no journal arrives); a stale stamp (a tab that died mid-claim)
// does not block; no socket id → the direct path.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeUser } from "./kit/foundry-stub.mjs";
import { P1, P2, journalWorld } from "./fixtures/world.mjs";
import * as core from "../journal-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });
const NOW = Date.UTC(2026, 9, 11, 12);
const MOD = "pentaryn-journal";

test("claimWinner", () => {
  assert.equal(core.claimWinner({ a: NOW }, "a", NOW), true);
  assert.equal(core.claimWinner({ a: NOW, b: NOW - 5 }, "a", NOW), false, "another fresh stamp");
  assert.equal(core.claimWinner({ a: NOW, b: NOW - 60_000 }, "a", NOW), true, "a stale stamp is ignored");
  assert.equal(core.claimWinner({ a: NOW, b: "garbage" }, "a", NOW), true, "an unreadable stamp is ignored");
  assert.equal(core.claimWinner({ b: NOW }, "a", NOW), false, "my stamp is missing");
  assert.equal(core.claimWinner(null, "a", NOW), false);
});

const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
const relay = CONFIG.queries[`${MOD}.ensure`];
const journalsOf = id => game.journal.filter(j => j.flags?.[MOD]?.userId === id);

test("a fresh stamp from another tab: wait, then reject after the bounded wait; my stamp is removed", async () => {
  const user = game.users.get(P1);
  await user.update({ [`flags.${MOD}.claims.ensure.socket-other`]: NOW });
  let settled = null;
  relay({}, { user }).then(v => { settled = ["ok", v]; }, e => { settled = ["err", e.message]; });
  for (let t = 0; t < 6900; t += 50) { for (let i = 0; i < 10; i++) await Promise.resolve(); mock.timers.tick(50); }
  assert.equal(settled, null, "still waiting inside the bound");
  for (let t = 0; t < 400; t += 50) { for (let i = 0; i < 10; i++) await Promise.resolve(); mock.timers.tick(50); }
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(settled, ["err", "another GM tab claimed this journal and did not finish"]);
  assert.equal(journalsOf(P1).length, 0, "the loser never creates");
  assert.deepEqual(Object.keys(user.flags[MOD].claims.ensure), ["socket-other"], "only the other tab's stamp is left");
});

test("a stale stamp does not block: this tab creates", async () => {
  const user = game.users.get(P1);
  user.flags[MOD].claims.ensure["socket-other"] = NOW - 120_000;
  const out = await relay({}, { user });
  assert.equal(journalsOf(P1).length, 1);
  assert.deepEqual(out, { entryId: journalsOf(P1)[0].id });
});

test("no socket id: the direct path (no stamp written)", async () => {
  F.become({ socketId: "" });
  game.socket.id = null;
  const user = game.users.get(P2);
  const from = F.calls.length;
  const out = await relay({}, { user });
  assert.deepEqual(out, { entryId: journalsOf(P2)[0].id });
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "update" && c.documentName === "User"), []);
});

test("the claim stamp cannot be written (no permission): warn once and answer by the direct path", async () => {
  F.become({ socketId: "socket-gm-1" });
  const user = makeUser({ id: "player0000000009", name: "Rae" });
  game.users.set(user.id, user);
  Object.defineProperty(user, "update", { value: async () => { throw new Error("You may not update this User"); } });
  const warns = [];
  const keep = console.warn;
  console.warn = (...a) => warns.push(a[0]);
  try {
    const out = await relay({}, { user });
    assert.deepEqual(out, { entryId: journalsOf(user.id)[0].id });
  } finally {
    console.warn = keep;
  }
  assert.deepEqual(warns, ["pentaryn-journal | ensure (relay): could not stamp the claim — answering without it"]);
});
