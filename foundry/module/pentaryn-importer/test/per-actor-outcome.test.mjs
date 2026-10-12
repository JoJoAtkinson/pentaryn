// importer-R6: a slug used to be pushed to created[]/updated[] as soon as the Actor was written, before
// its Items and the content-hash stamp. A per-actor failure after that point (an Item write throwing)
// then reported the same actor twice — "1 updated · 1 failed". The slug now lands in created[] or
// updated[] only once stampContentHash succeeds, so every selected actor has exactly one outcome.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const npc = slug => ({
  name: slug.toUpperCase(), type: "npc",
  system: { attributes: { hp: { value: 9, max: 9 } } },
  prototypeToken: { name: slug.toUpperCase(), width: 1 },
  items: [loot],
  flags: { pentaryn: { slug, contentHash: `sha256:${slug}-new` } },
});

async function run(actors) {
  body = {
    $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
    generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
    actors,
  };
  const keep = { log: console.log, warn: console.warn, error: console.error, group: console.group, groupEnd: console.groupEnd, table: console.table };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try {
    return await game.pentaryn.import();
  } finally {
    Object.assign(console, keep);
  }
}

test("importer-R6: an actor whose Item write fails after the Actor write is reported once, as failed", async () => {
  W.makeActor({ name: "Old", type: "npc", flags: { pentaryn: { slug: "old", contentHash: "sha256:old-old" } } });
  W.K.failItems.add("old");
  W.K.failItems.add("fresh");
  let result;
  try {
    result = await run([npc("old"), npc("fresh"), npc("fine")]);
  } finally {
    W.K.failItems.clear();
  }
  assert.deepEqual(result.failed, [
    { slug: "old", error: "Item validation errors: old" },
    { slug: "fresh", error: "Item validation errors: fresh" },
  ]);
  assert.deepEqual(result.updated, [], "old is failed, not also updated");
  assert.deepEqual(result.created, ["fine"], "fresh is failed, not also created");
  const { created, updated, skipped, failed, selected } = result.counts;
  assert.equal(created + updated + skipped + failed, selected, "one outcome per selected actor");
  assert.equal(game.actors.find(a => a.flags.pentaryn?.slug === "old").flags.pentaryn.contentHash, "sha256:old-old", "not stamped");
  assert.equal(game.actors.find(a => a.flags.pentaryn?.slug === "fresh").flags.pentaryn.contentHash, undefined, "not stamped");
});

// importer-M2-followup: when any actor fails, the end-of-run toast is a permanent warning pointing
// at the console — not the info toast with counts — and the delete-the-JSON toast is not shown.
// The README's "What the player sees" must say so.
test("importer-M2-followup: a run with a failed actor shows only a permanent warning, and the README says so", async () => {
  const toasts = [];
  const keep = ui.notifications;
  ui.notifications = Object.fromEntries(["info", "warn", "error", "success"]
    .map(level => [level, (message, opts) => { toasts.push([level, String(message), opts ?? null]); }]));
  W.K.failItems.add("broken");
  let result;
  try {
    result = await run([npc("broken"), npc("ok")]);
  } finally {
    W.K.failItems.clear();
    ui.notifications = keep;
  }
  assert.equal(result.counts.failed, 1);
  assert.equal(result.deleteJson.required, false);
  assert.deepEqual(toasts, [[
    "warn", "[pentaryn-importer] 1 actor(s) failed — see the console for the per-slug report.", { permanent: true },
  ]]);

  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const section = readme.split("## What the player sees")[1].split("\n## ")[0].replace(/\s+/g, " ");
  assert.match(section, /info toast with the counts[^.]*only when no actor failed/i);
  assert.match(section, /any actor fails[^.]*permanent warning toast[^.]*console/i);
  assert.match(section, /delete[^.]*toast is not shown[^.]*deleteJson\.required[^.]*false/i);
});
