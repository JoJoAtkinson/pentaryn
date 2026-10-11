import { test } from "node:test";
import assert from "node:assert/strict";
import { claimDocument, claimMessage, isActiveGM, isActiveGMOrLoneGM, isAnyGM, pickRunner } from "../election.mjs";

test("the three GM predicates keep distinct truth tables", () => {
  const rows = [
    // [user.isGM, activeGM]          activeGM  anyGM  activeOrLone
    [{ isGM: true }, { isSelf: true }, true, true, true],
    [{ isGM: true }, { isSelf: false }, false, true, false],
    [{ isGM: true }, null, false, true, true],
    [{ isGM: false }, null, false, false, false],
    [{ isGM: false }, { isSelf: false }, false, false, false],
  ];
  for (const [user, activeGM, a, b, c] of rows) {
    const g = { game: { user, users: { activeGM } } };
    assert.deepEqual([isActiveGM({ g }), isAnyGM({ g }), isActiveGMOrLoneGM({ g })], [a, b, c], JSON.stringify([user, activeGM]));
  }
});

test("pickRunner: the active GM, else the lowest owner id", () => {
  assert.equal(pickRunner({ activeGMId: "gm", ownerIds: ["b", "a"] }), "gm");
  assert.equal(pickRunner({ ownerIds: ["b", "a"] }), "a");
  assert.equal(pickRunner({}), null);
});

function message(store) {
  return {
    id: "m1", flags: {},
    async update(changes) {
      for (const [path, v] of Object.entries(changes)) {
        store.writes.push([path, v]);
        // the server's one order: the last write wins on every client
        store.last = v;
      }
    },
  };
}

test("claimDocument: last writer wins once writes settle; a late arrival stands down", async () => {
  const store = { writes: [], last: null };
  const timers = [];
  const mk = sid => ({ game: { socket: { id: sid } }, setTimeout: fn => timers.push(fn) });
  const doc = message(store);
  const reread = () => ({ flags: { "pentaryn-x": { claims: { resolve: store.last } } } });
  const a = claimDocument(doc, "resolve", { scope: "pentaryn-x", reread, g: mk("A") });
  const b = claimDocument(doc, "resolve", { scope: "pentaryn-x", reread, g: mk("B") });
  await new Promise(r => setImmediate(r));
  for (const t of timers.splice(0)) t();
  assert.deepEqual([await a, await b], [false, true]);
  const held = { id: "m2", flags: { "pentaryn-x": { claims: { resolve: "B" } } } };
  assert.equal(await claimDocument(held, "resolve", { scope: "pentaryn-x", g: mk("C") }), false);
  assert.equal(await claimDocument(held, "resolve", { scope: "pentaryn-x", g: mk("B") }), true);
  assert.equal(await claimDocument(held, "resolve", { scope: "pentaryn-x", g: { game: { socket: {} } } }), true);
});

test("claimMessage re-reads from game.messages (a deleted message never wins)", async () => {
  const store = { writes: [], last: null };
  const msg = message(store);
  const g = { game: { socket: { id: "A" }, messages: { get: () => undefined } }, setTimeout: fn => fn() };
  assert.equal(await claimMessage(msg, "selfApply", { scope: "pentaryn-aoe", g }), false);
  assert.deepEqual(store.writes, [["flags.pentaryn-aoe.claims.selfApply", "A"]]);
});
