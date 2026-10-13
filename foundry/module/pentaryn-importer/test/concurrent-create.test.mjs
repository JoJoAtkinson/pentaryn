// importer-AC-2: the "already running" guard is per tab, so the MCP bridge tab and a GM browser tab
// importing the same NEW slug used to both create the Actor, orphaning one copy. A new actor is now
// created with a slug-derived `_id` and `keepId`. Foundry 14.369's server does NOT refuse a keepId
// create over a world Actor that already holds the id — it silently replaces it (FIX-3 live probe) —
// so the importer looks first and never sends a create for an id game.actors already holds.
//
// Wave-3 importer item 2 ([declared]): two creates sent in the SAME instant both pass that look, and
// the later one replaced the earlier, so one actor held the later tab's data while both tabs wrote
// Items and stamped. Exactly one tab now creates: the server orders the two creates, so the tab whose
// create lands second has the other tab's create broadcast before its own response and stands down —
// it waits for the winner's content-hash stamp and then takes the update path. Its own create was a
// replace that may have wiped the winner's Items, so it never skips on that stamp: it rewrites the
// actor and its Items. The tab that landed first checks the live actor after its Item write; if the
// other tab's replace swapped the instance, it writes the actor and Items again on the live one before
// its readback. A slug that appears after the run's index (the look-first case) joins without
// sending a create, and skips on an unchanged hash. If no stamp comes within the wait, the joining
// tab updates it itself.
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

const loot = { name: "Trinket", type: "loot", flags: { pentaryn: { action: "trinket" } } };
const npcWithItem = (slug, hash = `sha256:${slug}`) => ({ ...npc(slug), items: [loot], flags: { pentaryn: { slug, contentHash: hash } } });

/** Drive the mocked setTimeout while a run is in flight (the join wait polls on it). */
async function ticking(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 200 && !done; i++) {
    await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(250);
  }
  return promise;
}

async function quietImport() {
  const keep = { log: console.log, warn: console.warn, error: console.error, group: console.group, groupEnd: console.groupEnd, table: console.table, info: console.info };
  for (const k of Object.keys(keep)) console[k] = () => {};
  try {
    return await ticking(game.pentaryn.import());
  } finally {
    Object.assign(console, keep);
    W.K.raceCreate.clear();
    W.K.raceSame.clear();
    W.K.raceAfter.clear();
    W.K.raceWiped.clear();
    W.K.raceAfterItems.clear();
  }
}

test("importer-AC-2 / wave-3 2: a new slug created by another GM tab after the index joins as an update, never re-created", async () => {
  body = manifestOfActors([npc("yan"), npc("zed")]);
  W.K.raceCreate.add("zed");                       // lands when this run sends its first create (yan)
  const from = F.calls.length;
  const result = await quietImport();

  const copies = game.actors.filter(a => a.flags.pentaryn?.slug === "zed");
  assert.equal(copies.length, 1, "one zed in the world, not two");
  assert.equal(copies[0].id, core.idForSlug("zed"));
  assert.equal(copies[0].name, "ZED", "the other tab's actor, never stamped, is updated in place after the wait");
  assert.equal(copies[0].flags.pentaryn.contentHash, "sha256:zed");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.created, ["yan"]);
  assert.deepEqual(result.updated, ["zed"], "the second becomes an update");

  const writes = F.calls.slice(from).filter(c => c.op === "Actor.create" || c.op === "Actor.replace");
  assert.deepEqual(writes.map(c => [c.op, c.data?._id, c.options]), [
    ["Actor.create", core.idForSlug("yan"), { keepId: true, renderSheet: false }],
  ], "no create is sent for an id the world already holds (Foundry 14 would replace it)");
  assert.equal(game.actors.get(core.idForSlug("yan"))?.flags.pentaryn.slug, "yan", "created under the slug id");
});

test("wave-3 importer 2: two creates in the same instant — the tab landing second stands down and joins; one actor, Items once", async () => {
  const id = core.idForSlug("vex");
  W.K.raceSame.set("vex", { hash: "sha256:vex", items: [loot] });   // the other tab, same file
  body = manifestOfActors([npcWithItem("vex")]);
  const from = F.calls.length;
  const result = await quietImport();

  assert.equal(game.actors.filter(a => a.flags.pentaryn?.slug === "vex").length, 1, "exactly one actor");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.created, [], "only the other tab created it");
  assert.deepEqual(result.updated, ["vex"], "joined as an update; a replacing join never skips on the winner's stamp");
  const live = game.actors.get(id);
  assert.equal(live.items.size ?? live.items.length, 1, "the managed Item replaced, not doubled");
  assert.equal(live.flags.pentaryn.contentHash, "sha256:vex");
  const itemWrites = F.calls.slice(from).filter(c => c.op === "createEmbeddedDocuments" || c.op === "deleteEmbeddedDocuments");
  assert.deepEqual(itemWrites.map(c => c.op), ["createEmbeddedDocuments", "deleteEmbeddedDocuments", "createEmbeddedDocuments"],
    "the winner wrote its Items first; this tab rewrote them only after the winner's stamp, never alongside");
});

test("wave-3 importer 2 (FIX-W3): same instant, the winner's create AND Items land before our replace, its stamp after — the actor keeps its Items", async () => {
  const id = core.idForSlug("zog");
  W.K.raceWiped.set("zog", { hash: "sha256:zog", items: [loot] });  // our replace wipes them; the stamp lands on ours
  body = manifestOfActors([npcWithItem("zog")]);
  const result = await quietImport();

  assert.equal(game.actors.filter(a => a.flags.pentaryn?.slug === "zog").length, 1, "exactly one actor");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.skipped, [], "never skipped on a stamp that says nothing about the live Items");
  assert.deepEqual(result.updated, ["zog"]);
  const live = game.actors.get(id);
  assert.equal(live.items.size ?? live.items.length, 1, "the Items our replace wiped are written again, once");
  assert.equal(live.flags.pentaryn.contentHash, "sha256:zog");
});

test("wave-3 importer 2 (FIX-W3): this tab lands first, the other tab's replace is handled after our Items — no abort, Items rewritten, the run goes on", async () => {
  const id = core.idForSlug("yok");
  W.K.raceAfterItems.add("yok");
  body = manifestOfActors([npcWithItem("yok"), npcWithItem("after-yok")]);
  const result = await quietImport();

  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.created, ["yok", "after-yok"], "the actor after it is still imported");
  assert.equal(game.actors.filter(a => a.flags.pentaryn?.slug === "yok").length, 1, "exactly one actor");
  const live = game.actors.get(id);
  assert.equal(live.items.size ?? live.items.length, 1, "Items on the live (replacing) actor, once");
  assert.equal(live.name, "YOK", "the actor itself written again on the live instance");
  assert.equal(live.flags.pentaryn.contentHash, "sha256:yok", "stamped on the live actor");
});

test("wave-3 importer 2 (FIX-W3): the create watch is registered only for the create's round trip — removed after a create and after a create that throws", async () => {
  const before = F.listeners("createActor");
  const during = [];
  const Base = getDocumentClass("Actor");
  const keep = globalThis.getDocumentClass;
  class Probe extends Base {
    static async create(...args) {
      during.push(F.listeners("createActor"));
      return super.create(...args);
    }
  }
  globalThis.getDocumentClass = name => (name === "Actor" ? Probe : null);
  try {
    W.K.failCreate.add("hooky-bad");
    body = manifestOfActors([npc("hooky"), npc("hooky-bad")]);
    const result = await quietImport();
    assert.deepEqual(result.created, ["hooky"]);
    assert.equal(result.failed.length, 1);
  } finally {
    globalThis.getDocumentClass = keep;
    W.K.failCreate.delete("hooky-bad");
  }
  assert.deepEqual(during, [before + 1, before + 1], "one watch while each create is in flight");
  assert.equal(F.listeners("createActor"), before, "no watch left behind, the throwing create included");
});

test("wave-3 importer 2: same instant, the winner's file differs — the joining tab updates the winner's actor", async () => {
  const id = core.idForSlug("vox");
  W.K.raceSame.set("vox", { hash: "sha256:vox-older", items: [loot] });
  body = manifestOfActors([npcWithItem("vox", "sha256:vox-newer")]);
  const result = await quietImport();

  assert.equal(game.actors.filter(a => a.flags.pentaryn?.slug === "vox").length, 1, "exactly one actor");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.updated, ["vox"], "the second becomes an update");
  const live = game.actors.get(id);
  assert.equal(live.items.size ?? live.items.length, 1, "the winner's managed Item replaced, not doubled");
  assert.equal(live.flags.pentaryn.contentHash, "sha256:vox-newer");
});

test("wave-3 importer 2: same instant, this tab lands first — the other tab's replace does not break the readback; created once", async () => {
  const id = core.idForSlug("wim");
  W.K.raceAfter.add("wim");                        // the other tab's create lands second and stands down
  body = manifestOfActors([npcWithItem("wim")]);
  const result = await quietImport();

  assert.equal(game.actors.filter(a => a.flags.pentaryn?.slug === "wim").length, 1, "exactly one actor");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.created, ["wim"]);
  const live = game.actors.get(id);
  assert.equal(live.items.size ?? live.items.length, 1, "Items on the live actor");
  assert.equal(live.flags.pentaryn.contentHash, "sha256:wim", "stamped on the live actor");
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
