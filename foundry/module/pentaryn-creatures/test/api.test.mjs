// The published API (guide step 7): rows ↔ implementations, the describe/surface goldens, the flag
// contract, the patch record's adjustments row, and the settings view. The active GM's client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const W = await setupWorld();
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
const ready = [];
F.Hooks.on(`${MODULE}.ready`, a => ready.push(a));
await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
const api = F.game.modules.get(MODULE).api;

test("published synchronously at ready: module.api is game.pentaryn.creatures, frozen, ready hook fired", () => {
  assert.equal(F.game.pentaryn.creatures, api);
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(ready, [api]);
  assert.deepEqual(F.game.pentaryn.published().creatures.when, "ready");
});

test("every described method is a function; core is published unlisted (a frozen copy)", () => {
  for (const { path } of api.describe().methods) assert.equal(typeof api[path], "function", path);
  assert.ok(Object.isFrozen(api.core));
  assert.equal(typeof api.core.lightUpdate, "function");
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("flag contract: we write our light flag; we read aoe's handle flags, Item Piles and dnd5e originalActor", () => {
  assert.deepEqual(api.describe().flags, {
    // [declared] 0.2.0: the summon library's copies carry our library flag and dnd5e's isAutoImported
    writes: ["flags.pentaryn-creatures.light", "flags.pentaryn-creatures.library", "flags.dnd5e.isAutoImported",
      "flags.dnd5e.summon.origin"],   // [declared] 0.3.0: a linked library copy carries dnd5e's summon origin
    reads: ["flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.item-piles.data.enabled", "flags.dnd5e.originalActor"],
  });
});

test("the Token#isVisible patch record names its adjustments row", () => {
  assert.deepEqual(api.describe().patches.map(p => [p.label, p.marker, p.adjustments]), [
    ["Token#isVisible", "__pentarynCreaturesVisible", "creatures-libwrapper"],
  ]);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { lightRadius: 5, ownerSees: true, floatOverHud: true, showStrip: true, summonLibrary: true });
});

test("status() (transform-creatures-31): wrap, the settings, the summon wrap, writer, lit tokens, version", async () => {
  assert.deepEqual(api.status(), {
    patchedWith: "direct", ownerSees: true, lightRadius: 5, showStrip: true, floatOverHud: true,
    summonLibrary: true, summonPatched: null,   // [declared] 0.2.0; null: the test world has no dnd5e
    writer: true, lit: 4, version: manifestOf(new URL("..", import.meta.url)).version,
  });
  await F.game.settings.set(MODULE, "floatOverHud", false);
  assert.equal(api.status().floatOverHud, false);
  await F.game.settings.set(MODULE, "floatOverHud", true);
  F.become({ userId: "plyrUser00000001" });
  assert.equal(api.status().writer, false, "a player client does not write");
  F.become({ userId: "gmUser0000000001" });
  assert.equal(api.status().writer, true);
});

test("creatures-ext-9 [declared]: every SETTINGS row is a key of status() and named in the status row's returns", () => {
  const keys = Object.keys(api.status());
  const row = MANIFEST.rows.find(r => r.path === "status");
  const named = row.returns.replace(/^\{\s*|\s*\}$/g, "").split(/\s*,\s*/);
  for (const { key } of SETTINGS) {
    assert.ok(keys.includes(key), `status() hard-codes its settings: ${key} is missing from it`);
    assert.ok(named.includes(key), `the status manifest row's returns does not name ${key}`);
  }
});

test("inspect(ref, { as }): plain JSON, depth ≤ 4; a document, a placeable or a uuid; a miss is coded", () => {
  const imp = W.tok("tImp");
  const out = api.inspect(imp);
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  assert.deepEqual(out, {
    token: { documentName: "Token", id: "tImp", uuid: imp.uuid, name: "Imp <i>&" },
    actorType: "npc", qualifies: true, light: { bright: 5, dim: 5 }, ourLight: { bright: 5, dim: 5 },
    switchedOff: false, ownerSees: false, inStrip: false,
  }, "the GM: the owner override never applies and a GM has no strip");
  assert.equal(api.inspect(imp, { as: "plyrUser00000001" }).inStrip, true, "in Rook's strip");
  assert.equal(api.inspect(W.p("tGob"), { as: "plyrUser00000001" }).inStrip, false);
  assert.deepEqual(api.inspect(imp.uuid).token.id, "tImp");
  const pc = api.inspect(W.tok("tPC"));
  assert.deepEqual([pc.qualifies, pc.ourLight, pc.light], [false, null, { bright: 0, dim: 0 }]);
  assert.throws(() => api.inspect("Nobody"), { code: "NOT_FOUND" });
  assert.throws(() => api.inspect(imp, { as: "Nobody" }), { code: "NOT_FOUND" });
});

test("the legacy calls answer through the built API", async () => {
  assert.equal(api.patchedWith(), "direct");
  assert.equal(api.isCreature(W.tok("tImp")), true);
  assert.equal(await api.syncScene(W.scene("sceneAlpha000001")), 0, "ready already lit everything");
  assert.deepEqual(api.list(F.game.users.get("plyrUser00000001"), W.scene("sceneAlpha000001")).map(e => e.id), ["tPC", "tEye", "tImp", "tTorch"]);
});

test("creatures-rob-1: list(userId, sceneRef) answers as that user, like list(userDoc, sceneDoc)", () => {
  const rook = F.game.users.get("plyrUser00000001");
  const alpha = W.scene("sceneAlpha000001");
  const byDoc = api.list(rook, alpha);
  assert.ok(byDoc.some(e => e.id === "tImp"), "a token only Rook owns");
  assert.deepEqual(api.list("plyrUser00000001", "sceneAlpha000001"), byDoc, "ids, as the bridge sends them");
  assert.deepEqual(api.list("plyrUser00000001", alpha.uuid), byDoc, "a scene uuid");
  assert.deepEqual(api.list(rook.name, "Alpha"), byDoc, "exact names");
  assert.throws(() => api.list("Nobody", alpha), { code: "NOT_FOUND" });
  assert.throws(() => api.list(rook, "Nowhere"), { code: "NOT_FOUND" });
});

test("creatures-rob-2: list(null, scene) / list(user, null) fall to the defaults, like undefined", () => {
  const rook = F.game.users.get("plyrUser00000001");
  const alpha = W.scene("sceneAlpha000001");
  assert.deepEqual(api.list(null, alpha), api.list(undefined, alpha), "null user = this client's user");
  assert.deepEqual(api.list(rook, null), api.list(rook), "null scene = the viewed scene");
});

test("creatures-rob-2: with no viewed scene, list() answers [] for every null/undefined spelling", () => {
  const rook = F.game.users.get("plyrUser00000001");
  const viewed = F.canvas.scene;
  assert.ok(viewed, "fixture: a scene is viewed before the pin");
  assert.ok(api.list(rook).length > 0, "fixture: the viewed scene has entries for Rook");
  F.canvas.scene = null;
  try {
    assert.deepEqual(api.list(rook), [], "no viewed scene, a user");
    assert.deepEqual(api.list(rook, null), []);
    assert.deepEqual(api.list(null, null), []);
    assert.deepEqual(api.list(null), []);
    assert.deepEqual(api.list(), [], "README: [] without a scene");
  } finally {
    F.canvas.scene = viewed;
  }
  assert.ok(api.list(rook).length > 0, "the viewed scene is restored");
});

test("creatures-rob-5 [declared]: isCreature reads a Token placeable through its document; null/undefined answer false", () => {
  for (const id of ["tImp", "tEye", "tPC", "tHandle", "tHandle2", "tPile", "tPile2", "tGob"]) {
    assert.equal(api.isCreature(W.p(id)), api.isCreature(W.tok(id)), `${id}: the placeable answers like its document`);
  }
  assert.equal(api.isCreature(W.p("tHandle2")), false, "the token-level pentaryn-aoe handle flag is read off the placeable's document");
  assert.equal(api.isCreature(W.p("tPile")), false, "the token-level Item Piles flag is read off the placeable's document");
  assert.equal(api.isCreature(null), false, "was: TypeError");
  assert.equal(api.isCreature(undefined), false);
  assert.equal(api.isCreature(), false);
});

test("creatures-rob-4 [declared]: syncScene resolves a scene id, uuid or exact name; a missing one rejects coded on every client", async () => {
  const alpha = W.scene("sceneAlpha000001");
  assert.equal(await api.syncScene("sceneAlpha000001"), 0, "an id (ready already lit everything)");
  assert.equal(await api.syncScene(alpha.uuid), 0, "a uuid");
  assert.equal(await api.syncScene("Alpha", ["tImp"]), 0, "an exact name");
  await assert.rejects(api.syncScene("Nowhere"), { code: "NOT_FOUND" });
  await assert.rejects(api.syncScene(), { code: "BAD_ARGS" });
  await assert.rejects(api.syncScene(null), { code: "BAD_ARGS" });
  F.become({ userId: "plyrUser00000001" });
  try {
    assert.equal(await api.syncScene("Alpha"), 0, "a player client with a valid scene still resolves 0");
    await assert.rejects(api.syncScene("Nowhere"), { code: "NOT_FOUND" }, "was: resolved 0 off the active GM");
    await assert.rejects(api.syncScene(), { code: "BAD_ARGS" });
  } finally {
    F.become({ userId: "gmUser0000000001" });
  }
});
