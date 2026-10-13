// [declared] names-ac-3 (+edge-4), final review 2026-10-12, ruling: two renames of one actor less than
// a write round trip apart (Bob → Rob → Robert) both relabel its tokens. The updateActor hook chains
// syncs per actor id: each starts after the previous one for that actor settles, so its planner reads
// the labels the first one wrote. Before the fix the second sync planned against labels still on
// "Bob" (the first write not yet back), matched nothing, and the first write then landed "Rob": the
// tokens stayed on the middle name while the prototype moved on.
//
// Own process and own world: a scene token write here lands only after a round trip (some
// microtasks), as it does live; the kit stub's own write applies at once and would hide the race.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { IDS, effects, equip, flush, reset, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const F = await installFoundry(world());
equip(F);
/** Delay each scene's token write by a round trip: recorded at once, applied a few microtasks later. */
let refuseNext = false;
for (const scene of game.scenes) {
  const apply = scene.updateEmbeddedDocuments;
  Object.defineProperty(scene, "updateEmbeddedDocuments", {
    configurable: true,
    writable: true,
    enumerable: false,
    value: async (...args) => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
      if (refuseNext) {
        refuseNext = false;
        throw new Error("ZZ token update refused");
      }
      return apply(...args);
    },
  });
}

await import("../names.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const bob = game.actors.get(IDS.bob);
const label = id => [...game.scenes].flatMap(s => [...s.tokens]).find(t => t.id === id).name;

/** Rename as Foundry would on the renaming client: preUpdateActor, then updateActor. No waiting. */
function rename(actor, to) {
  const changes = { name: to };
  const options = {};
  F.fireCall("preUpdateActor", actor, changes, options, IDS.gm);
  actor.name = to;
  F.fire("updateActor", actor, changes, options, IDS.gm);
}

async function settle() {
  for (let i = 0; i < 10; i++) await flush();
}

test("names-ac-3: two renames of one actor inside a round trip leave its labels on the final name", async () => {
  reset(F);
  rename(bob, "Rob");
  rename(bob, "Robert");
  await settle();
  assert.equal(bob.prototypeToken.name, "Robert");
  assert.equal(label("tokA1000000000001"), "Robert", "scene one token");
  assert.equal(label("tokA2000000000001"), "Robert", "scene two token");
  assert.equal(label("tokLocked00000001"), "Bob", "a token this user cannot edit is left alone");
  assert.equal(label("tokNick0000000001"), "Fishface", "a nickname is left alone");
  assert.deepEqual(effects(F.calls).filter(c => c.op === "notify").map(c => c.message), [
    'Token labels updated to "Rob" (3).',
    'Token labels updated to "Robert" (3).',
  ]);
});

test("names-ac-3: a failed first sync does not stop the next rename of that actor", async () => {
  reset(F);
  const keepWarn = console.warn;
  const warns = [];
  console.warn = (...args) => warns.push(args[0]);
  refuseNext = true;
  try {
    rename(bob, "Rob");
    rename(bob, "Robert");
    await settle();
  } finally {
    console.warn = keepWarn;
    refuseNext = false;
  }
  assert.deepEqual(warns, ["pentaryn-names | relabel after rename failed"]);
  // the first sync moved the prototype, then its scene-one write was refused; the second runs after it
  assert.equal(bob.prototypeToken.name, "Robert");
  assert.equal(label("tokA1000000000001"), "Bob", "the refused write's token stays; a later sync(actor, \"Bob\", \"Robert\") repairs it");
});

test("names-ac-3: renames of different actors are not held behind each other", async () => {
  reset(F);
  const other = game.actors.get(IDS.other);
  rename(bob, "Rob");
  rename(other, "Bert");
  await settle();
  assert.equal(label("tokA1000000000001"), "Rob");
  assert.equal(label("tokOther000000001"), "Bert");
  assert.equal(label("tokA2000000000001"), "Rob");
});

test("names-ac-3: once a chain drains, a later rename of that actor runs at once", async () => {
  reset(F);
  rename(bob, "Rob");
  await settle();
  rename(bob, "Robert");
  await settle();
  assert.equal(label("tokA1000000000001"), "Robert");
  assert.equal(label("tokA2000000000001"), "Robert");
});
