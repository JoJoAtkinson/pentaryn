// Glue characterisation on the active GM's client (guide step 1). The unchanged entry is loaded as
// Foundry would, init/setup/ready are fired, and its effects are pinned: the 17-row hook manifest,
// the four settings.register option objects, the light writer (ready sync, the 200 ms fixed-window queue,
// which changes queue, the GM gate, the failure texts), the publish and the legacy API.
// [declared] C-D2 (guide step 7): the API is published through the kit AT ready (was one tick
// later), frozen, with the kit members, on module.api as well as game.pentaryn.creatures.
// Timers are mocked; nothing waits on a real clock.
//
// Separate processes: glue-player.test.mjs (a player client: owner-sees, the strip, the dock),
// glue-libwrapper*.test.mjs and glue-nogetter.test.mjs (the other patch paths), publish.test.mjs
// (game.pentaryn root shapes).
//
// KNOWN rows (all fixed; each pin is the test named after the row):
//   transform-creatures-26  FIXED [declared]: the queue flushes 200 ms after the first change, never pushed back
//   transform-creatures-27  FIXED [declared]: our light writes carry {pentarynCreatures: true} (argc 3) and
//                           the updateToken hook skips them — no second, no-op pass
//   transform-creatures-31  FIXED [declared]: syncScene(scene, ["id"]) and a bare id narrow the pass
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { ALPHA, BETA, GAMMA, GM, LANG, MODULE, PLAYER, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";
import * as legacy from "./fixtures/legacy-creatures.mjs";
import * as core from "../creatures-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const manifest = manifestOf(new URL("..", import.meta.url));
// lib-wrapper is active but its global is missing: the direct path is taken
const W = await setupWorld({ libWrapperModule: true });
const { F } = W;
registerSelf(F, manifest);

await import("../creatures.mjs");

const FK = `flags.${MODULE}.light`;
const lit = (id, r = 5) => ({ _id: id, "light.bright": r, "light.dim": r, [FK]: { bright: r, dim: r } });
const api = () => F.game.pentaryn.creatures;
const writes = () => W.writes.splice(0);
/** Advance the mocked clock and let the async light flush finish. */
const tick = async ms => {
  mock.timers.tick(ms);
  await drain();
};
/** Put a token back to dark and unflagged, as if the light had never been written. */
const reset = (...ids) => {
  for (const id of ids) {
    const t = W.tok(id);
    t.light = { bright: 0, dim: 0 };
    delete t.flags[MODULE];
  }
};

const ROWS = [
  "on:createToken", "on:updateToken", "on:updateActor", "on:createUser", "on:updateUser", "on:deleteUser",
  "on:canvasReady", "on:createToken", "on:deleteToken", "on:updateToken", "on:updateActor", "on:updateUser",
  "on:controlToken", "once:init", "once:setup", "once:setup", "once:ready", "once:ready",   // [declared] 0.2.0: the 2nd setup wraps Actor5e.fetchExisting
];

test("registration manifest: 18 rows in source order (golden/hooks.json)", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), ROWS);
});

test("import alone: no settings, no writes, no patch, no namespace, no DOM", () => {
  assert.deepEqual(F.calls, []);
  assert.deepEqual(W.writes, []);
  assert.equal(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  assert.equal(F.game.pentaryn, undefined);
  assert.equal(W.strip(), null);
  assert.deepEqual(W.lines(), []);
});

test("init registers lightRadius, ownerSees, floatOverHud, showStrip, summonLibrary — option objects key by key", () => {
  F.fire("init");
  // [declared] 0.2.0 (feedback Swrl5M): summonLibrary, the summon library's world switch
  assert.deepEqual(F.calls, ["lightRadius", "ownerSees", "floatOverHud", "showStrip", "summonLibrary"].map(k => ({ op: "settings.register", id: `${MODULE}.${k}` })));
  const opts = key => {
    const { namespace, key: _k, ...rest } = F.game.settings.settings.get(`${MODULE}.${key}`);
    assert.equal(namespace, MODULE);
    return rest;
  };
  const label = key => ({ name: `PENTARYN_CREATURES.settings.${key}.name`, hint: `PENTARYN_CREATURES.settings.${key}.hint` });

  const lightRadius = opts("lightRadius");
  assert.deepEqual(Object.keys(lightRadius), ["name", "hint", "scope", "config", "type", "default", "range", "onChange"]);
  assert.equal(lightRadius.type, Number);
  assert.equal(typeof lightRadius.onChange, "function");
  const { onChange: _a, ...lr } = lightRadius;
  assert.deepEqual(lr, { ...label("lightRadius"), scope: "world", config: true, type: Number, default: 5, range: { min: 0, max: 30, step: 0.5 } });

  const ownerSees = opts("ownerSees");
  assert.deepEqual(Object.keys(ownerSees), ["name", "hint", "scope", "config", "type", "default", "onChange"]);
  assert.equal(ownerSees.type, Boolean);
  const { onChange: _b, ...os } = ownerSees;
  assert.deepEqual(os, { ...label("ownerSees"), scope: "world", config: true, type: Boolean, default: true });

  const floatOverHud = opts("floatOverHud");
  // [declared] C-D8 (transform-creatures-40): floatOverHud gained an onChange (re-place the strip)
  assert.deepEqual(Object.keys(floatOverHud), ["name", "hint", "scope", "config", "type", "default", "onChange"]);
  const { onChange: _d, ...fo } = floatOverHud;
  assert.deepEqual(fo, { ...label("floatOverHud"), scope: "world", config: true, type: Boolean, default: true });

  const showStrip = opts("showStrip");
  assert.deepEqual(Object.keys(showStrip), ["name", "hint", "scope", "config", "type", "default", "onChange"]);
  const { onChange: _c, ...ss } = showStrip;
  assert.deepEqual(ss, { ...label("showStrip"), scope: "client", config: true, type: Boolean, default: true });

  const summonLibrary = opts("summonLibrary");
  assert.deepEqual(Object.keys(summonLibrary), ["name", "hint", "scope", "config", "type", "default", "onChange"]);
  const { onChange: _e, ...sl } = summonLibrary;
  assert.deepEqual(sl, { ...label("summonLibrary"), scope: "world", config: true, type: Boolean, default: true });
  assert.equal(F.game.pentaryn, undefined, "nothing published at init");
});

test("every registered name/hint and the strip's two keys resolve in lang/en.json", () => {
  for (const [id, s] of F.game.settings.settings) {
    if (!id.startsWith(`${MODULE}.`)) continue;
    for (const k of [s.name, s.hint]) assert.ok(F.game.i18n.has(k), k);
  }
  for (const k of ["PENTARYN_CREATURES.label", "PENTARYN_CREATURES.hint"]) assert.ok(F.game.i18n.has(k), k);
  assert.deepEqual(Object.keys(LANG.PENTARYN_CREATURES.settings).sort(), ["floatOverHud", "lightRadius", "ownerSees", "showStrip", "summonLibrary"]);
});

test("setup: lib-wrapper active without its global → Token#isVisible replaced directly; the GM is never overridden", () => {
  F.calls.length = 0;
  F.fire("setup");
  const desc = Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible");
  assert.notEqual(desc.get, W.coreGetter);
  assert.equal(desc.configurable, true);
  assert.equal(desc.enumerable, false);
  assert.equal(W.p("tImp").isVisible, false, "GM: core said no, the override says no");
  W.p("tImp").coreVisible = true;
  assert.equal(W.p("tImp").isVisible, true, "core's yes passes through");
  W.p("tImp").coreVisible = false;
  assert.deepEqual(W.wrapped, []);
  assert.deepEqual(W.lines(), []);
  assert.deepEqual(F.calls, [], "setup only reads ownerSees");
});

test("ready (active GM): one write per scene, summons only, with our options argument (-27); published at ready", async () => {
  W.reads.length = 0;
  F.fire("ready");
  assert.equal(typeof api(), "object", "[declared] C-D2: published synchronously at ready");
  assert.equal(F.game.modules.get(MODULE).api, api(), "[declared] C-D2: module.api is the same API");
  await drain();
  assert.deepEqual(writes(), [
    { scene: ALPHA, type: "Token", updates: [lit("tImp"), lit("tEye"), lit("tHid")], argc: 3 },
    { scene: BETA, type: "Token", updates: [lit("tImpB")], argc: 3 },
  ]);
  assert.equal(W.passes(), 3, "syncAll: one pass per scene (Gamma has no tokens)");
  assert.deepEqual(W.tok("tImp").light, { bright: 5, dim: 5 });
  assert.deepEqual(W.tok("tImp").flags[MODULE], { light: { bright: 5, dim: 5 } });
  assert.deepEqual(W.tok("tTorch").light, { bright: 20, dim: 40 }, "own torch left alone");
});

test("transform-creatures-27 [declared]: our own write carries {pentarynCreatures: true} and is not re-queued", async () => {
  W.reads.length = 0;
  await tick(200);
  assert.equal(W.passes(), 0, "no echo pass at 200 (was: Alpha and Beta re-checked for nothing)");
  await tick(1000);
  assert.equal(W.passes(), 0);
  const seen = [];
  const id = F.Hooks.on("updateToken", (_doc, _changes, options) => seen.push(options?.pentarynCreatures === true));
  reset("tImp");
  F.fire("createToken", W.tok("tImp"), {}, GM);
  await tick(200);
  assert.deepEqual(writes().map(w => w.argc), [3]);
  assert.deepEqual(seen, [true], "the update hook sees our option");
  W.reads.length = 0;
  await tick(1000);
  assert.equal(W.passes(), 0, "and nothing re-queues it");
  F.Hooks.off("updateToken", id);
});

test("GM client: the strip never mounts", async () => {
  await tick(60);
  assert.equal(W.strip(), null);
  api().render();
  assert.equal(W.strip(), null);
});

test("legacy surface ⊇ golden/legacy-surface.json; core is the module namespace", () => {
  const legacyKeys = pinJSON("legacy-surface", ["core", "isCreature", "list", "ownerSees", "patchedWith", "render", "syncAll", "syncScene"], import.meta.url);
  const keys = Object.keys(api());
  for (const k of legacyKeys) assert.ok(keys.includes(k), k);
  const LEGACY = ["list", "render", "syncScene", "syncAll", "isCreature", "ownerSees", "patchedWith", "core"];
  assert.deepEqual(keys.filter(k => LEGACY.includes(k)), LEGACY, "the legacy keys, in their old order");
  // [declared] C-D2: the kit members follow; C-D3 (transform-creatures-31): status() and inspect() are new rows
  // [declared] 0.2.0 (feedback Swrl5M): summonActor and library are new rows
  assert.deepEqual(keys.filter(k => !LEGACY.includes(k)), ["status", "inspect", "summonActor", "library", "version", "contract", "settings", "trace", "uninstall", "describe"]);
  for (const k of LEGACY.filter(k => k !== "core")) assert.equal(typeof api()[k], "function", k);
  assert.equal(api().core.lightUpdate, core.lightUpdate);
  assert.equal(Object.isFrozen(api()), true, "[declared] C-D2: frozen");
  assert.equal(api().patchedWith(), "direct");
});

test("oracle: isCreature and list() agree with the verbatim legacy summarize (fixtures/legacy-creatures.mjs)", () => {
  const rook = F.game.users.get(PLAYER);
  const all = [...F.game.scenes].flatMap(s => [...s.tokens]);
  const got = Object.fromEntries(all.map(t => [t.id, api().isCreature(t)]));
  const want = Object.fromEntries(all.map(t => [t.id, core.isPlayerCreature(legacy.summarize(t, F.game.user))]));
  assert.deepEqual(got, want);
  assert.deepEqual(Object.keys(got).filter(k => got[k]), ["tImp", "tEye", "tTorch", "tHid", "tImpB"]);
  const alpha = W.scene(ALPHA);
  const entries = core.stripEntries([...alpha.tokens].map(t => legacy.summarize(t, rook)), { characterId: "aPC" });
  assert.deepEqual(api().list(rook, alpha), entries);
  assert.deepEqual(entries.map(e => [e.id, e.rank]), [["tPC", 0], ["tEye", 2], ["tImp", 2], ["tTorch", 2]]);
  assert.deepEqual(api().list(F.game.user, W.scene(GAMMA)), [], "GM owns nothing as a character; empty scene");
  assert.deepEqual(api().list(rook, null), api().list(rook), "[declared] creatures-rob-2: null scene = the viewed scene");
});

test("transform-creatures-26 [declared]: a fixed window — queues at 0/50/100/150/190 flush once, at 200; a queue at 250 flushes at 450", async () => {
  W.reads.length = 0;
  const imp = W.tok("tImp");
  for (const step of [0, 50, 50, 50, 40]) {
    await tick(step);
    F.fire("updateToken", imp, { flags: {} }, {}, GM);
  }
  await tick(9);
  assert.equal(W.passes(), 0, "nothing at 199");
  await tick(1);
  assert.equal(W.passes(), 1, "one pass at 200 (was 390), for Alpha only; the queue at 190 rode along");
  await tick(50);
  F.fire("updateToken", imp, { flags: {} }, {}, GM);
  await tick(199);
  assert.equal(W.passes(), 1, "nothing at 449");
  await tick(1);
  assert.equal(W.passes(), 2, "the second window flushes at 450");
  await tick(1000);
  assert.equal(W.passes(), 2);
});

test("updateToken queues only on light, actorId, actorLink, delta, flags", async () => {
  const imp = W.tok("tImp");
  const table = [{ x: 1 }, { y: 2, elevation: 5 }, { name: "n" }, { hidden: true }, { light: {} }, { actorId: "aImp" }, { actorLink: true }, { delta: {} }, { flags: {} }, null, undefined];
  const out = [];
  for (const changes of table) {
    W.reads.length = 0;
    F.fire("updateToken", imp, changes, {}, GM);
    await tick(200);
    out.push(W.passes());
  }
  assert.deepEqual(out, [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual(writes(), []);
});

test("createToken queues that token on its scene; flush writes only the queued ids", async () => {
  reset("tImp", "tEye", "tImpB");
  F.fire("createToken", W.tok("tEye"), {}, GM);
  await tick(200);
  assert.deepEqual(writes(), [{ scene: ALPHA, type: "Token", updates: [lit("tEye")], argc: 3 }]);
  await tick(200);   // let the window close
  F.fire("createToken", W.tok("tImpB"), {}, GM);
  F.fire("createToken", W.tok("tImp"), {}, GM);
  await tick(200);
  assert.deepEqual(writes(), [
    { scene: BETA, type: "Token", updates: [lit("tImpB")], argc: 3 },
    { scene: ALPHA, type: "Token", updates: [lit("tImp")], argc: 3 },
  ], "scenes in queue order");
  await tick(200);
});

test("updateActor: ownership or type → every token of that actor, on every scene; other changes nothing", async () => {
  const imp = F.game.actors.get("aImp");
  reset("tImp", "tHid", "tImpB", "tEye");
  for (const changes of [{ name: "x" }, { img: "y" }, null]) F.fire("updateActor", imp, changes, {}, GM);
  await tick(200);
  assert.deepEqual(writes(), []);
  F.fire("updateActor", imp, { ownership: { [PLAYER]: 3 } }, {}, GM);
  await tick(200);
  assert.deepEqual(writes(), [
    { scene: ALPHA, type: "Token", updates: [lit("tImp"), lit("tHid")], argc: 3 },
    { scene: BETA, type: "Token", updates: [lit("tImpB")], argc: 3 },
  ], "tEye (another actor) is not touched");
  await tick(200);
  reset("tImp");
  F.fire("updateActor", imp, { type: "npc" }, {}, GM);
  await tick(200);
  assert.deepEqual(writes().map(w => w.updates.map(u => u._id)), [["tImp"]]);
  await tick(200);
});

test("updateActor on a synthetic (unlinked) actor queues its own token only", async () => {
  const synthetic = { id: "synth", isToken: true, token: W.tok("tEye") };
  F.fire("updateActor", synthetic, { ownership: {} }, {}, GM);
  await tick(200);
  assert.deepEqual(writes(), [{ scene: ALPHA, type: "Token", updates: [lit("tEye")], argc: 3 }]);
  await tick(200);
});

test("users: createUser, deleteUser and a role change re-check every scene; other user updates do not", async () => {
  const user = F.game.users.get(PLAYER);
  const out = [];
  for (const [hook, changes] of [["updateUser", { name: "n" }], ["updateUser", null], ["updateUser", { role: 2 }], ["createUser", {}], ["deleteUser", {}]]) {
    W.reads.length = 0;
    F.fire(hook, user, changes, {}, GM);
    await tick(200);
    out.push([hook, W.passes()]);
  }
  assert.deepEqual(out, [["updateUser", 0], ["updateUser", 0], ["updateUser", 3], ["createUser", 3], ["deleteUser", 3]]);
  assert.deepEqual(writes(), []);
});

test("lightRadius onChange (active GM): syncAll moves our lights, 0 darkens and unflags, junk reads as 0", async () => {
  await F.game.settings.set(MODULE, "lightRadius", 0.5);
  await drain();
  assert.deepEqual(writes(), [
    { scene: ALPHA, type: "Token", updates: [lit("tImp", 0.5), lit("tEye", 0.5), lit("tHid", 0.5)], argc: 3 },
    { scene: BETA, type: "Token", updates: [lit("tImpB", 0.5)], argc: 3 },
  ]);
  await tick(200);
  const off = id => ({ _id: id, "light.bright": 0, "light.dim": 0, [FK]: null });
  await F.game.settings.set(MODULE, "lightRadius", "x");
  await drain();
  assert.deepEqual(writes(), [
    { scene: ALPHA, type: "Token", updates: [off("tImp"), off("tEye"), off("tHid")], argc: 3 },
    { scene: BETA, type: "Token", updates: [off("tImpB")], argc: 3 },
  ]);
  assert.equal(W.tok("tImp").flags[MODULE].light, null);
  await tick(200);
  await F.game.settings.set(MODULE, "lightRadius", 5);
  await drain();
  assert.equal(writes().flatMap(w => w.updates).length, 4, "relit");
  await tick(200);
});

test("a token whose light was set to 0 by hand is flagged false and never relit", async () => {
  const eye = W.tok("tEye");
  eye.light = { bright: 0, dim: 0 };
  F.fire("updateToken", eye, { light: { bright: 0 } }, {}, GM);
  await tick(200);
  assert.deepEqual(writes(), [{ scene: ALPHA, type: "Token", updates: [{ _id: "tEye", [FK]: false }], argc: 3 }]);
  await tick(200);
  assert.equal(await api().syncScene(W.scene(ALPHA)), 0);
  assert.equal(eye.flags[MODULE].light, false);
});

test("failure texts: a failed queued write names the scene; creatures-rob-3 [declared]: a failed setting-driven sync names it too", async () => {
  reset("tImp");
  W.failWrite.push(new Error("db down"));
  F.fire("createToken", W.tok("tImp"), {}, GM);
  await tick(200);
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed on Alpha`, "Error: db down"]]);
  writes();
  W.failWrite.push(new Error("db down again"));
  await F.game.settings.set(MODULE, "lightRadius", 5);
  await drain();
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed on Alpha`, "Error: db down again"]]);
  writes();
  await tick(200);
  writes();
});

test("creatures-rob-3 [declared]: syncAll isolates scenes — a rejected write is one warn naming the scene, later scenes still sync, the count covers the rest", async () => {
  W.failWrite.push(new Error("db down"));
  await F.game.settings.set(MODULE, "lightRadius", 2);
  await drain();
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed on Alpha`, "Error: db down"]]);
  assert.deepEqual(writes().map(w => w.scene), [ALPHA, BETA], "Beta still synced after Alpha's write rejected");
  assert.deepEqual(W.tok("tImpB").flags[MODULE].light, { bright: 2, dim: 2 });
  reset("tImpB");
  W.failWrite.push(new Error("db down again"));
  assert.equal(await api().syncAll(), 1, "Alpha's write failed; Beta's one token was written");
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | light sync failed on Alpha`, "Error: db down again"]]);
  assert.deepEqual(writes().map(w => w.scene), [ALPHA, BETA]);
  await F.game.settings.set(MODULE, "lightRadius", 5);
  await drain();
  assert.deepEqual(writes(), [
    { scene: ALPHA, type: "Token", updates: [lit("tImp")], argc: 3 },
    { scene: BETA, type: "Token", updates: [lit("tImpB")], argc: 3 },
  ], "relit at 5 everywhere");
  assert.deepEqual(W.lines(), []);
  await tick(200);
  writes();
});

test("api.syncScene / syncAll return counts; a Set of ids narrows; transform-creatures-31 [declared]: an array or one id narrows too", async () => {
  reset("tImp", "tEye");
  assert.equal(await api().syncScene(W.scene(ALPHA), new Set(["tImp"])), 1);
  assert.equal(await api().syncScene(W.scene(ALPHA)), 1, "tEye was left for the full pass");
  assert.equal(await api().syncScene(W.scene(ALPHA)), 0);
  reset("tImp", "tEye");
  assert.equal(await api().syncScene(W.scene(ALPHA), ["tImp"]), 1, "an array narrows (was: ids.has is not a function)");
  assert.equal(await api().syncScene(W.scene(ALPHA), []), 0, "an empty list is no token, not every token");
  assert.equal(await api().syncScene(W.scene(ALPHA), "tEye"), 1, "a bare id narrows");
  assert.equal(await api().syncAll(), 0);
  await tick(200);
  writes();
});

test("api.ownerSees on the GM is always false; isCreature reads the GM's view", () => {
  assert.equal(api().ownerSees(W.p("tImp")), false);
  assert.equal(api().ownerSees(W.tok("tImp")), false);
  assert.equal(api().isCreature(W.tok("tImp")), true);
  assert.equal(api().isCreature(W.tok("tPC")), false);
  assert.deepEqual(W.lines(), []);
});

test("ownerSees onChange on the GM: refreshes every placeable when the canvas is ready, never when it is not", async () => {
  W.flags = [];
  F.canvas.ready = true;
  await F.game.settings.set(MODULE, "ownerSees", false);
  assert.equal(W.flags.length, F.canvas.tokens.placeables.length);
  assert.deepEqual(W.flags[0], ["tPC", { refreshVisibility: true }]);
  F.canvas.ready = false;
  W.flags = [];
  await F.game.settings.set(MODULE, "ownerSees", true);
  assert.deepEqual(W.flags, []);
  F.canvas.ready = true;
});

test("a setting read that throws falls back to the default: lightRadius → 5", async () => {
  reset("tImp");
  await F.game.settings.set(MODULE, "lightRadius", 2);
  await drain();
  writes();
  await tick(200);
  reset("tImp");
  W.failRead.add("lightRadius");
  assert.equal(await api().syncScene(W.scene(ALPHA), new Set(["tImp"])), 1);
  assert.deepEqual(writes(), [{ scene: ALPHA, type: "Token", updates: [lit("tImp", 5)], argc: 3 }]);
  W.failRead.delete("lightRadius");
  await tick(200);
  writes();
});

test("controlToken with no strip on the page does nothing", () => {
  assert.equal(W.strip(), null);
  F.fire("controlToken", W.p("tImp"), true);
  assert.equal(W.strip(), null);
});

test("creatures-edge-1 [declared]: after uninstall() a lightRadius change writes no token; a re-import re-registers it", async () => {
  await tick(200);
  writes();
  const live = api();
  live.uninstall();
  W.reads.length = 0;
  await F.game.settings.set(MODULE, "lightRadius", 0);
  await drain();
  await F.game.settings.set(MODULE, "lightRadius", 7);
  await drain();
  await tick(2000);
  assert.deepEqual(writes(), [], "no syncAll after uninstall");
  assert.equal(W.passes(), 0);

  await import("../creatures.mjs?v=2");
  assert.notEqual(api(), live);
  await tick(200);
  writes();
  await F.game.settings.set(MODULE, "lightRadius", 5);
  await drain();
  assert.ok(writes().length > 0, "the re-imported entry's handler runs syncAll");
  await tick(200);
  api().uninstall();
});
