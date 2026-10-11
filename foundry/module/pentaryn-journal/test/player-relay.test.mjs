// The player's side of the relay (ensurePersonalJournal), failure paths: no GM online, a query that times
// out, a query the GM's client refuses. Each leaves the toast it always did, one console line, and add() null
// with lastReason "no-journal".
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
F.fire("ready");                                      // as the GM: publishes; ensureAll pre-creates journals
for (let i = 0; i < 30; i++) await Promise.resolve();
for (const j of game.journal.contents) game.journal.delete(j.id);   // a player without a journal yet

const readable = makeDoc("JournalEntry", { id: "readable00000031", name: "Plaque", ownership: { default: 2 } });
const page = makeDoc("JournalEntryPage", { name: "P", type: "text", ownership: { default: 2 }, text: { content: "<p>x</p>" } }, { parent: readable });
Object.defineProperty(readable, "pages", { value: { contents: [page], filter: fn => [page].filter(fn) }, enumerable: false });

async function addAsPlayer() {
  F.become({ userId: P1 });
  const warns = [];
  const keep = { warn: console.warn, info: console.info };
  console.warn = (...a) => warns.push(a[0]);
  console.info = () => {};
  const from = F.calls.length;
  try {
    const out = await game.pentaryn.journal.add(readable);
    return { out, warns, toasts: F.calls.slice(from).filter(c => c.op === "notify").map(c => [c.level, c.message]) };
  } finally {
    Object.assign(console, keep);
    F.become({ userId: "gmUser0000000001" });
  }
}

test("the GM's client refuses (not the active GM): 'failed' toast, one warn, null", async () => {
  const r = await addAsPlayer();                      // the stub's query runs the handler on the player's client
  assert.equal(r.out, null);
  assert.deepEqual(r.warns, ["pentaryn-journal | ensure query failed"]);
  assert.deepEqual(r.toasts, [["warn", "Couldn't add this to your journal — tell the GM."]]);
  assert.equal(game.pentaryn.journal.lastReason(), "no-journal");
});

test("the query times out: the 'timeout' toast", async () => {
  const name = "pentaryn-journal.ensure";
  const keep = CONFIG.queries[name];
  CONFIG.queries[name] = async () => { throw new Error("The query timed out"); };   // what the server answers at 8 s
  try {
    const r = await addAsPlayer();
    assert.equal(r.out, null);
    assert.deepEqual(r.toasts, [["warn", "The GM's client didn't answer. Try again in a moment."]]);
  } finally {
    CONFIG.queries[name] = keep;
  }
});

test("no GM online: the 'noGM' toast and no query", async () => {
  const gms = game.users.contents.filter(u => u.isGM);
  for (const u of gms) u.active = false;
  try {
    const from = F.calls.length;
    const r = await addAsPlayer();
    assert.equal(r.out, null);
    assert.deepEqual(r.toasts, [["warn", "Your journal needs the GM online to set it up the first time — ask them."]]);
    assert.deepEqual(F.calls.slice(from).filter(c => c.op === "query"), []);
  } finally {
    for (const u of gms) u.active = true;
  }
});
