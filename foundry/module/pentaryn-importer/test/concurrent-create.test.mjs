// importer-AC-2: the "already running" guard is per tab, so the MCP bridge tab and a GM browser tab
// importing the same NEW slug used to both create the Actor, orphaning one copy. A new actor is now
// created with a slug-derived `_id` and `keepId`, so the second create is refused by the server and
// reported in failed[] instead of doubling the actor. The run goes on; a re-run finds it by slug.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf } from "./kit/harness.mjs";
import { makeWorld } from "./fixtures/world.mjs";
import * as core from "../importer-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const MODULE = "pentaryn-importer";
const manifest = manifestOf(ROOT);

test("importer-AC-2: idForSlug is a stable 16-char Foundry id derived from the slug", () => {
  assert.equal(typeof core.idForSlug, "function", "importer-core exports idForSlug");
  const slugs = Array.from({ length: 2000 }, (_, i) => `npc-${i}`).concat(["skeleton", "Skeleton", "skeleton ", "a", "é", "goblin-boss"]);
  const ids = slugs.map(core.idForSlug);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
  assert.equal(new Set(ids).size, slugs.length, "distinct slugs, distinct ids");
  assert.deepEqual(slugs.map(core.idForSlug), ids, "deterministic");
  // Pinned: the id of an imported actor must never move between releases (placed tokens, re-runs).
  assert.deepEqual(["skeleton", "goblin-boss"].map(core.idForSlug), ["FjiGUDYELZqi3DUT", "xUpHSpN0ADJiPH7x"]);
  for (const bad of ["", null, undefined, 3]) assert.throws(() => core.idForSlug(bad), TypeError);
});

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

const npc = slug => ({
  name: slug.toUpperCase(), type: "npc",
  system: { attributes: { hp: { value: 9, max: 9 } } },
  prototypeToken: { name: slug.toUpperCase(), width: 1 },
  flags: { pentaryn: { slug, contentHash: `sha256:${slug}` } },
});

test("importer-AC-2: a new slug created concurrently by another GM tab is refused per slug, not duplicated", async () => {
  body = {
    $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
    generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
    actors: [npc("zed"), npc("yan")],
  };
  W.K.raceCreate.add("zed");
  const from = F.calls.length;
  const keep = { log: console.log, warn: console.warn, error: console.error, group: console.group, groupEnd: console.groupEnd, table: console.table };
  for (const k of Object.keys(keep)) console[k] = () => {};
  let result;
  try {
    result = await game.pentaryn.import();
  } finally {
    Object.assign(console, keep);
    W.K.raceCreate.clear();
  }

  const copies = game.actors.filter(a => a.flags.pentaryn?.slug === "zed");
  assert.equal(copies.length, 1, "one zed in the world, not two");
  assert.deepEqual(result.failed, [{ slug: "zed", error: "created concurrently by another GM tab — re-run" }]);
  assert.deepEqual(result.created, ["yan"], "the run continues past the refused slug");

  const creates = F.calls.slice(from).filter(c => c.op === "Actor.create");
  assert.deepEqual(creates.map(c => [c.data._id, c.options]), [
    [core.idForSlug("zed"), { keepId: true, renderSheet: false }],
    [core.idForSlug("yan"), { keepId: true, renderSheet: false }],
  ]);
  assert.equal(game.actors.get(core.idForSlug("yan"))?.flags.pentaryn.slug, "yan", "created under the slug id");
});
