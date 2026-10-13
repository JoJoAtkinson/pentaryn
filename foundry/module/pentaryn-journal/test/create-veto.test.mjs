// journal-rob-5: a create another module vetoes (a preCreate hook returning false) resolves to undefined, not
// a document. Before the fix ensureAll read `folder.id` and the relay read `j.uuid` off that undefined, so the
// GM got a bare TypeError and the player's query rejected with "Cannot read properties of undefined". Now:
//  - ensureAll with the folder vetoed leaves the root journals where they are (no update) and still reports;
//  - the relay with the journal vetoed rejects `NOT_CREATED: the journal could not be created`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { P1, journalWorld } from "./fixtures/world.mjs";
import { errorCode } from "../lib/errors.mjs";

const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
F.fire("ready");                                      // as the active GM: ensureAll pre-creates journals
for (let i = 0; i < 30; i++) await Promise.resolve();

function reset() {
  for (const j of game.journal.contents) game.journal.delete(j.id);
  for (const f of game.folders.contents) game.folders.delete(f.id);
}
/** Run fn with `Klass.create` answering undefined, as Foundry does when a preCreate hook vetoes. */
async function vetoed(Klass, fn) {
  const keep = Klass.create;
  Klass.create = async data => { F.calls.push({ op: "vetoed", data: F.plain(data) }); return undefined; };
  try { return await fn(); } finally { Klass.create = keep; }
}
function quiet(fn) {
  const keep = { warn: console.warn, info: console.info, debug: console.debug };
  const warns = [];
  console.warn = (...a) => warns.push(a[0]);
  console.info = console.debug = () => {};
  return fn().then(out => ({ out, warns }), err => ({ err, warns })).finally(() => Object.assign(console, keep));
}

test("ensureAll with the folder create vetoed: journals stay at the root, no stray move, still reports (journal-rob-5)", async () => {
  reset();
  const from = F.calls.length;
  const r = await vetoed(Folder, () => quiet(() => game.pentaryn.journal.ensureAll()));
  assert.equal(r.err, undefined, `ensureAll rejected: ${r.err?.message}`);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "JournalEntry.updateDocuments"), [], "no move without a folder");
  assert.equal(r.out.folder, null);
  assert.equal(r.out.atRoot.length, 2, "both players' journals are reported at the root");
});

test("the relay with the journal create vetoed: the query rejects NOT_CREATED, not a TypeError (journal-rob-5)", async () => {
  reset();
  const sender = game.users.get(P1);
  const r = await vetoed(JournalEntry, () => quiet(() => CONFIG.queries["pentaryn-journal.ensure"]({}, { user: sender })));
  assert.ok(r.err, "the query rejects");
  assert.equal(errorCode(r.err), "NOT_CREATED");
  assert.equal(r.err.message, "NOT_CREATED: the journal could not be created");
  assert.deepEqual(Object.keys(sender.flags?.["pentaryn-journal"]?.claims?.ensure ?? {}), [], "the claim is released");
});
