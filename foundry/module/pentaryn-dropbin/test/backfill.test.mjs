// items-journal-25 [declared]: the ready backfills run on the active GM only (a second GM tab or a
// non-active GM writes nothing) and write every actor of a plan in one Actor.updateDocuments batch;
// the console lines and counts are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GM, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

const GM2 = "gmUser0000000002";                   // a second GM: active, but not game.users.activeGM
const F = await dropbinWorld();
F.game.users.set(GM2, { id: GM2, name: "Co-GM", isGM: true, active: true, documentName: "User" });
for (let i = 1; i <= 3; i++) {
  makeActor(F, { id: `actorChest00000${i}`, name: `Chest ${i}`, type: "npc", flags: ip({ enabled: true, type: "container" }) });
}
const writes = from => F.calls.slice(from).filter(c => ["update", "Actor.updateDocuments", "updateEmbeddedDocuments"].includes(c.op));
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function logs(fn) {
  const lines = [];
  const keep = console.log;
  console.log = (...a) => lines.push(String(a[0]));
  try {
    await fn();
  } finally {
    console.log = keep;
  }
  return lines;
}

test("a GM that is not the active GM does not backfill", async () => {
  assert.equal(game.users.activeGM.id, GM);
  F.become({ userId: GM2 });
  await import("../dropbin.mjs");
  F.fire("init");
  const from = F.calls.length;
  const lines = await logs(async () => {
    F.fire("ready");
    await flush();
  });
  assert.deepEqual(writes(from), []);
  assert.ok(!lines.some(l => l.includes("lock sound set")), JSON.stringify(lines));
});

test("the active GM writes the three actors in one batch; the log line counts them all", async () => {
  game.pentaryn.dropbin.uninstall();
  F.become({ userId: GM });
  const from = F.calls.length;
  const lines = await logs(async () => {
    await import("../dropbin.mjs?v=2");                 // the world is ready: the backfills run now
    await flush();
  });
  const w = writes(from);
  assert.deepEqual(w.map(c => [c.op, c.data.length]), [["Actor.updateDocuments", 3]]);
  assert.ok(lines.includes("pentaryn-dropbin | lock sound set on 3 container document(s)"), JSON.stringify(lines));
  assert.equal(game.actors.get("actorChest000001").flags["item-piles"].data.lockedSound, "sounds/lock.wav");
});
