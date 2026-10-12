// game.pentaryn root shapes at publish (guide step 1). [declared] C-D2 (guide step 7): the namespace
// is published through the kit's publishNamespace synchronously AT ready (was setTimeout 0). An
// extensible root gains `creatures` in place; no root → created; a frozen root (nothing freezes it
// since the importer's items-journal-1 keystone, kit 1.0.2 J10) is no longer rebuilt: the
// assignment throws inside the ready handler and the root is left as it was.
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
  const before = F.game.pentaryn;
  F.fire("ready");
  await drain();
  const atReady = F.game.pentaryn;
  mock.timers.tick(0);
  await drain();
  return { F, before, atReady, after: F.game.pentaryn };
}

test("no root → { creatures }, at ready", async () => {
  const { before, atReady, after } = await boot("none");
  assert.equal(before, undefined);
  assert.equal(atReady, after, "[declared] C-D2: nothing more happens a tick later");
  assert.deepEqual(Object.keys(after), ["creatures"]);
});

test("extensible root → same object, creatures added", async () => {
  const root = { journal: { a: 1 } };
  const { before, after } = await boot("open", root);
  assert.equal(before, root);
  assert.equal(after, root);
  assert.deepEqual(Object.keys(after), ["journal", "creatures"]);
});

test("[declared] C-D2 / J10: a frozen root is not rebuilt — the publish throws a TypeError in the ready hook", async () => {
  const journal = { a: 1 };
  const root = Object.freeze({ journal, ties: {} });
  const { F, before, after } = await boot("frozen", root);
  assert.equal(before, root);
  assert.equal(after, root, "left as it was");
  assert.deepEqual(Object.keys(after), ["journal", "ties"]);
  assert.deepEqual(F.hookErrors.map(e => [e.hook, e.fn, e.error.name]), [["ready", "onReadyPublish", "TypeError"]]);
});
