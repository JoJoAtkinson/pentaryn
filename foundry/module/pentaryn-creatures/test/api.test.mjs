// The published API (guide step 7): rows ↔ implementations, the describe/surface goldens, the flag
// contract, the patch record's adjustments row, and the settings view. The active GM's client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
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
    writes: ["flags.pentaryn-creatures.light"],
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
  assert.deepEqual(api.settings(), { lightRadius: 5, ownerSees: true, floatOverHud: true, showStrip: true });
});

test("status() (transform-creatures-31): wrap, the four settings, writer, lit tokens, version", async () => {
  assert.deepEqual(api.status(), {
    patchedWith: "direct", ownerSees: true, lightRadius: 5, showStrip: true, floatOverHud: true,
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

test("the legacy calls answer through the built API", async () => {
  assert.equal(api.patchedWith(), "direct");
  assert.equal(api.isCreature(W.tok("tImp")), true);
  assert.equal(await api.syncScene(W.scene("sceneAlpha000001")), 0, "ready already lit everything");
  assert.deepEqual(api.list(F.game.users.get("plyrUser00000001"), W.scene("sceneAlpha000001")).map(e => e.id), ["tPC", "tEye", "tImp", "tTorch"]);
});
