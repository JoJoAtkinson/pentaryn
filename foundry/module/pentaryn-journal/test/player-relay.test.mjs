// The player's side of the relay (ensurePersonalJournal), failure paths: no GM online, a query that times
// out, a query the GM's client refuses, an answer whose journal never arrives (journal-rob-2). Each leaves the toast it always did, one console line, and add() null
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

/* journal-rob-2: the relay answers {entryId}, but the journal's broadcast is late or never comes. The player
   waits up to 3 s for its journal (by flag, or by the id the GM answered); if neither arrives it says so —
   one warn and the 'failed' toast — instead of a silent null. */
async function addAsPlayerTicking(ms, onTick = () => {}) {
  let done = null;
  const p = addAsPlayer().then(r => { done = r; });
  for (let t = 0; t <= ms && !done; t += 100) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    onTick(t);
    mock.timers.tick(100);
  }
  await p;
  return done;
}
function withReply(reply, fn) {
  const name = "pentaryn-journal.ensure";
  const keep = CONFIG.queries[name];
  CONFIG.queries[name] = async () => reply;           // the GM answered, but the journal is not here yet
  return fn().finally(() => { CONFIG.queries[name] = keep; for (const j of game.journal.contents) game.journal.delete(j.id); });
}

test("the GM answered but the journal never arrives: a warn and the 'failed' toast, not a silent null (journal-rob-2)", () =>
  withReply({ entryId: "lostEntry0000001" }, async () => {
    const r = await addAsPlayerTicking(4000);
    assert.equal(r.out, null);
    assert.deepEqual(r.warns, ["pentaryn-journal | ensure: the GM answered but the journal did not arrive"]);
    assert.deepEqual(r.toasts, [["warn", "Couldn't add this to your journal — tell the GM."]]);
  }));

test("the journal's broadcast lands 2 s after the reply: the player still gets it (journal-rob-2)", () =>
  withReply({ entryId: "lateEntry0000001" }, async () => {
    const r = await addAsPlayerTicking(4000, t => {
      // found by the id the GM answered (journal-rob-2 keeps the reply), before its flag is readable here
      if (t === 2000) JournalEntry.create({ id: "lateEntry0000001", name: "Pat's Journal", ownership: { default: 0, [P1]: 3 } });
    });
    assert.notEqual(r.out, null);
    assert.equal(r.out.journal.id, "lateEntry0000001", "saved into the journal the GM named");
    assert.deepEqual(r.warns, []);
    assert.deepEqual(r.toasts.filter(([, m]) => /tell the GM|didn't answer/.test(m)), []);
  }));
