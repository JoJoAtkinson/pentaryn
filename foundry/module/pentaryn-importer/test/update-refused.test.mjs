// Wave-3 importer item 1 (defect wave 2 "Still open"): on the UPDATE path, an invalid change (a blank
// name) is refused by Foundry's client — an error toast, no request, and `actor.update()` resolves
// undefined instead of throwing (client/data/client-backend.mjs #preUpdateDocumentArray). The importer
// used to carry on: replace the Items, pass the readback (the old values still match), stamp the new
// content hash and report the slug as updated, so the change was never retried. A refused update is
// now a per-actor failure, with no Item writes and no hash stamp. A genuine no-op update (also
// undefined: an empty diff is never sent) still counts as updated.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf } from "./kit/harness.mjs";
import { makeWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const MODULE = "pentaryn-importer";
const manifest = manifestOf(ROOT);

const F = await installFoundry({
  user: { isGM: true },
  modules: [{ id: MODULE, version: manifest.version, flags: manifest.flags }],
  system: { id: "dnd5e", version: "6.0.6" },
});
game.release.generation = 14;
game.world.id = "w";
game.version = "14.369";
const W = makeWorld(F);

let body = null;
globalThis.fetch = async () => ({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) });

await import("../pentaryn-importer.mjs");
{
  const log = console.log;
  console.log = () => {};
  F.fire("ready");
  console.log = log;
}

const loot = { name: "Trinket", type: "loot", flags: { pentaryn: { action: "trinket" } } };
const npc = (slug, name = slug.toUpperCase()) => ({
  name, type: "npc",
  system: { attributes: { hp: { value: 9, max: 9 } } },
  prototypeToken: { name: slug.toUpperCase(), width: 1 },
  items: [loot],
  flags: { pentaryn: { slug, contentHash: `sha256:${slug}-new` } },
});

async function run(actors, options = {}) {
  body = {
    $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
    generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
    actors,
  };
  const keep = { log: console.log, warn: console.warn, error: console.error, group: console.group, groupEnd: console.groupEnd, table: console.table, info: console.info };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try {
    return await game.pentaryn.import(options);
  } finally {
    Object.assign(console, keep);
  }
}

test("wave-3 importer 1: an update Foundry refuses (blank name) is failed, not stamped, and retried next run", async () => {
  const old = W.makeActor(
    { name: "Old", type: "npc", prototypeToken: { name: "OLD", width: 1 }, flags: { pentaryn: { slug: "old", contentHash: "sha256:old-old" } } },
    { items: [loot] },
  );
  const from = F.calls.length;
  const result = await run([npc("old", ""), npc("fine")]);

  assert.equal(result.failed.length, 1, "the refused update is a failure");
  assert.equal(result.failed[0].slug, "old");
  assert.match(result.failed[0].error, /update refused by Foundry/);
  assert.match(result.failed[0].error, /name: may not be a blank string/);
  assert.deepEqual(result.updated, [], "not also counted as updated");
  assert.deepEqual(result.created, ["fine"], "the run goes on");
  const { created, updated, skipped, failed, selected } = result.counts;
  assert.equal(created + updated + skipped + failed, selected, "one outcome per selected actor");

  assert.equal(old.flags.pentaryn.contentHash, "sha256:old-old", "the new hash is not stamped");
  assert.equal(old.name, "Old", "the actor is untouched");
  const touched = F.calls.slice(from).filter(c => c.uuid === old.uuid).map(c => c.op);
  assert.deepEqual(touched, ["update.refused"], "no Item writes and no stamp after the refusal");

  // Next run: the hash still differs, so the actor is retried (and, fixed in the file, updated).
  const again = await run([npc("old", "Old Fixed")]);
  assert.deepEqual(again.updated, ["old"]);
  assert.deepEqual(again.skipped, []);
  assert.equal(old.flags.pentaryn.contentHash, "sha256:old-new");
});

test("wave-3 importer 1: a genuine no-op update (empty diff, nothing sent) still counts as updated and is stamped", async () => {
  const same = W.makeActor({ name: "SAME", type: "npc", prototypeToken: { name: "SAME", width: 1 }, flags: { pentaryn: { slug: "same", contentHash: "sha256:same-old" } } });
  W.K.noopUpdate.add("same");
  let result;
  try {
    result = await run([npc("same")]);
  } finally {
    W.K.noopUpdate.clear();
  }
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.updated, ["same"]);
  assert.equal(same.flags.pentaryn.contentHash, "sha256:same-new");
});
