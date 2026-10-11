// game.pentaryn root shapes at publish (guide step 1): the namespace is assigned one tick after
// ready (setTimeout 0). A frozen root (pentaryn-importer freezes it in its own ready) is rebuilt with
// its foreign keys kept; an extensible root gains `creatures` in place; no root → created.
// Each case imports its own module instance (?case) into its own stub.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

async function boot(tag, root) {
  const W = await setupWorld();
  const { F } = W;
  await import(`../creatures.mjs?${tag}`);
  if (root !== undefined) F.game.pentaryn = root;
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  await drain();
  const before = F.game.pentaryn;
  mock.timers.tick(0);
  await drain();
  return { F, before, after: F.game.pentaryn };
}

test("no root → { creatures }", async () => {
  const { before, after } = await boot("none");
  assert.equal(before, undefined);
  assert.deepEqual(Object.keys(after), ["creatures"]);
});

test("extensible root → same object, creatures added", async () => {
  const root = { journal: { a: 1 } };
  const { before, after } = await boot("open", root);
  assert.equal(before, root);
  assert.equal(after, root);
  assert.deepEqual(Object.keys(after), ["journal", "creatures"]);
});

test("frozen root → a new plain object with the foreign keys kept (same references)", async () => {
  const journal = { a: 1 };
  const root = Object.freeze({ journal, ties: {} });
  const { before, after } = await boot("frozen", root);
  assert.equal(before, root);
  assert.notEqual(after, root);
  assert.deepEqual(Object.keys(after), ["journal", "ties", "creatures"]);
  assert.equal(after.journal, journal);
  assert.equal(Object.isFrozen(after), false);
  assert.equal(Object.isFrozen(after.creatures), false);
});
