// journal-EC-4: the relay's claim stamps and judges with the SERVER's clock (game.time.serverTime), not
// this machine's Date.now(). The MCP bridge tab and a GM browser tab can run on different machines; before
// the fix, a tab whose clock ran 2 minutes fast read the other tab's fresh stamp as older than the 60 s
// stale window, ignored it, and created a second journal. Here this tab's Date.now() is 2 minutes ahead
// of the server; the other tab stamped "now" in server time.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { P1, journalWorld } from "./fixtures/world.mjs";

const SERVER_NOW = Date.UTC(2026, 9, 11, 12);
const SKEW = 120_000;                                 // this machine's clock runs 2 minutes fast
mock.timers.enable({ apis: ["setTimeout", "Date"], now: SERVER_NOW + SKEW });
const MOD = "pentaryn-journal";

const F = await journalWorld();
F.game.time = { worldTime: 86_400, get serverTime() { return Date.now() - SKEW; } };
await import("../journal.mjs");
F.fire("init");
const relay = CONFIG.queries[`${MOD}.ensure`];
const journalsOf = id => game.journal.filter(j => j.flags?.[MOD]?.userId === id);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("a fast clock still sees the other tab's fresh stamp: it waits for that journal and does not create (journal-EC-4)", async () => {
  F.become({ socketId: "socket-tab-A" });
  const user = game.users.get(P1);
  await user.update({ [`flags.${MOD}.claims.ensure.socket-other`]: SERVER_NOW });   // the winner, in server time
  const stamps = [];
  const update = user.update.bind(user);
  user.update = async changes => {
    const v = changes[`flags.${MOD}.claims.ensure.socket-tab-A`];
    if (typeof v === "number") stamps.push(v);
    return update(changes);
  };

  let settled = null;
  relay({}, { user }).then(v => { settled = ["ok", v]; }, e => { settled = ["err", e.message]; });
  for (let t = 0; t < 500; t += 50) { await flush(); mock.timers.tick(50); }
  await flush();
  assert.equal(journalsOf(P1).length, 0, "the other tab's stamp is fresh: this tab does not create");
  assert.deepEqual(stamps, [SERVER_NOW], "my stamp is server time, not this machine's clock");
  assert.equal(settled, null, "still waiting for the winner's journal");

  // the winner's journal lands; the waiting tab answers with it and removes its stamp
  const j = await JournalEntry.create({ name: "Pat", flags: { [MOD]: { kind: "personal", userId: P1 } } });
  for (let t = 0; t < 200; t += 50) { await flush(); mock.timers.tick(50); }
  await flush();
  assert.deepEqual(settled, ["ok", { entryId: j.id }]);
  assert.equal(journalsOf(P1).length, 1);
  assert.deepEqual(Object.keys(user.flags[MOD].claims.ensure), ["socket-other"], "only the other tab's stamp is left");
});
