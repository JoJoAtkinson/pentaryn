// importer-AC-2: the "already running" guard is per tab, so the MCP bridge tab and a GM browser tab
// importing the same NEW slug used to both create the Actor, orphaning one copy. A new actor is now
// created with a slug-derived `_id` and `keepId`. Foundry 14.369's server does NOT refuse a keepId
// create over a world Actor that already holds the id — it silently replaces it (FIX-3 live probe) —
// so the importer looks first: an id already in game.actors (the other tab's create broadcast) is
// reported in failed[] and never overwritten. The run goes on; a re-run finds it by slug.
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

const manifestOfActors = actors => ({
  $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
  generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
  actors,
});

async function quietImport() {
  const keep = { log: console.log, warn: console.warn, error: console.error, group: console.group, groupEnd: console.groupEnd, table: console.table, info: console.info };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try {
    return await game.pentaryn.import();
  } finally {
    Object.assign(console, keep);
    W.K.raceCreate.clear();
  }
}

test("importer-AC-2: a new slug created concurrently by another GM tab is refused per slug, not overwritten", async () => {
  body = manifestOfActors([npc("yan"), npc("zed")]);
  W.K.raceCreate.add("zed");                       // lands when this run sends its first create (yan)
  const from = F.calls.length;
  const result = await quietImport();

  const copies = game.actors.filter(a => a.flags.pentaryn?.slug === "zed");
  assert.equal(copies.length, 1, "one zed in the world, not two");
  assert.equal(copies[0].name, "ZED (other tab)", "the other tab's actor is kept, not replaced");
  assert.equal(copies[0].id, core.idForSlug("zed"));
  assert.deepEqual(result.failed, [{ slug: "zed", error: "created concurrently by another GM tab — re-run" }]);
  assert.deepEqual(result.created, ["yan"], "the run continues past the refused slug");

  const writes = F.calls.slice(from).filter(c => c.op === "Actor.create" || c.op === "Actor.replace");
  assert.deepEqual(writes.map(c => [c.op, c.data?._id, c.options]), [
    ["Actor.create", core.idForSlug("yan"), { keepId: true, renderSheet: false }],
  ], "no create is sent for an id the world already holds (Foundry 14 would replace it)");
  assert.equal(game.actors.get(core.idForSlug("yan"))?.flags.pentaryn.slug, "yan", "created under the slug id");
});

test("importer-AC-2: an id already held by an actor without the slug is never overwritten", async () => {
  const id = core.idForSlug("wyn");
  W.makeActor({ name: "ZZ held", type: "npc", system: { details: { biography: { value: "PRE" } } } }, { id });
  body = manifestOfActors([npc("wyn")]);
  const from = F.calls.length;
  const result = await quietImport();

  assert.equal(game.actors.get(id).name, "ZZ held", "the holder is untouched");
  assert.equal(game.actors.get(id).system.details.biography.value, "PRE");
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.failed, [{ slug: "wyn", error: `id ${id} is already held by Actor "ZZ held" — not overwritten` }]);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "Actor.create" || c.op === "Actor.replace"), [], "no create sent");
});
