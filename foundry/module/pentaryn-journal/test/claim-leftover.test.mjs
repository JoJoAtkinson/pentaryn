// items-journal-40 review: what the relay's claim leaves on the sender's User. relayEnsure's finally
// deletes only its own leaf (`claims.ensure.<socketId>`); deleting the parent from code would race another
// tab's stamp. So a correct run leaves `flags.pentaryn-journal.claims.ensure` as an EMPTY object, not an
// absent flag — the live check (guide D-J5) and the README's Data-written row say exactly that.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { P2, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-journal";
const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
const relay = CONFIG.queries[`${MOD}.ensure`];

test("after one relayed ensure the sender keeps claims: { ensure: {} } — no socket-id keys, the parent stays", async () => {
  F.become({ socketId: "socket-tab-A" });
  const sender = game.users.get(P2);
  const out = await relay({}, { user: sender });
  assert.ok(out.entryId, "a journal was made");
  assert.deepEqual(sender.flags?.[MOD]?.claims, { ensure: {} });
  assert.deepEqual(Object.keys(sender.flags[MOD].claims.ensure), []);
});
