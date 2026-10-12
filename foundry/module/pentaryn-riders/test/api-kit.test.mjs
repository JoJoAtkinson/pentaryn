// Guide S6 (C27, C28, C29, C48; combat-riders-13 riders half, -32): the API is built from the
// manifest by the kit. The legacy surface is a subset (golden/surface-legacy.json, glue.test), the
// legacy members answer as before (api.test), and the new members are pinned here:
// describe()/surface goldens, inspect(ref, { as }), settings(), selftest(), arcaneRecovery(ref).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { maxDepth, normaliseDescribe, pinJSON, readJSON } from "./kit/harness.mjs";
import { makeScene } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
const { MANIFEST } = await import("../api-manifest.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const sorc = W.actor(IDS.sorc), wiz = W.actor(IDS.wiz), npc = W.actor(IDS.npc);
const code = async fn => { try { await fn(); return "ok"; } catch (e) { return e.code ?? e.message; } };

test("every described method is a function on the API (Battle Medic's two contributed rows included)", () => {
  const methods = api.describe().methods.map(m => m.path);
  for (const p of ["installBattleMedic", "battleMedic", "inspect", "selftest", "arcaneRecovery"]) assert.ok(methods.includes(p), p);
  for (const path of methods) assert.equal(typeof api[path], "function", path);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("the legacy surface is a subset of the kit-built one (same kinds)", () => {
  const legacy = readJSON(new URL("./golden/surface-legacy.json", import.meta.url));
  for (const [k, kind] of Object.entries(legacy)) assert.equal(typeof api[k], kind, k);
  assert.ok(Object.isFrozen(api));
  assert.equal(api.version, "0.3.0");   // [declared] W4-R6 (Joe 2026-10-12): the Wave 7 batch bumps 0.2.0 -> 0.3.0
  assert.equal(api.contract, "pentaryn-riders/api@1");
});

test("nothing mutable is reachable from api.core or api.rules (S6; METAMAGIC is table-core's, not in core)", () => {
  const walk = (v, path) => {
    if (!v || typeof v !== "object") return;
    assert.ok(Object.isFrozen(v), path);
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(api.core, "core");
  walk(api.rules, "rules");
  assert.equal("METAMAGIC" in api.core, false);
  assert.equal(api.core.MOD, MODULE);
  assert.equal(api.core.MODULE, MODULE);
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  const d = api.describe();
  assert.deepEqual(d.queries, [`${MODULE}.battleMedic`]);
  assert.deepEqual(d.settings.map(s => s.key), ["rituals", "longCasts", "concentrationSummons", "concentrationAutoBreak", "castDefaults", "arcaneRecovery", "enabled", "hdControls"]);
  assert.deepEqual(d.events, []);
  assert.equal(d.hooks.filter(h => !["init", "ready"].includes(h.name)).length, 23);
  pinJSON("describe", normaliseDescribe(d), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("settings(): all eight keys with their live values", async () => {
  await F.game.settings.set(MODULE, "longCasts", false);
  assert.deepEqual(api.settings(), {
    rituals: true, longCasts: false, concentrationSummons: true, concentrationAutoBreak: true,
    castDefaults: true, arcaneRecovery: true, enabled: true, hdControls: true,
  });
  await F.game.settings.set(MODULE, "longCasts", true);
});

test("inspect(ref): report()'s rows, the Hit Dice summary, settings, plain JSON, depth ≤ 4", () => {
  W.take();
  const rows = api.report(sorc);
  W.take();
  for (const ref of [sorc, IDS.sorc, "Ilsa Vantrel", "ilsa vantrel", `Actor.${IDS.sorc}`]) {
    const out = api.inspect(ref);
    assert.deepEqual(out.rows, rows);
    assert.deepEqual(out.actor, { documentName: "Actor", id: IDS.sorc, uuid: `Actor.${IDS.sorc}`, name: "Ilsa Vantrel" });
    assert.deepEqual(out.hd, { value: 0, max: 0 }, "a PC with no attributes.hd has no pools (hdPools)");
    assert.equal(Object.keys(out.settings).length, 8);
    assert.deepEqual(out.concentrationSummons, []);
    assert.ok(maxDepth(out) <= 4);
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  }
  assert.deepEqual(W.take(), [], "inspect prints no console.table");
  assert.deepEqual(api.inspect(wiz).hd, { value: 3, max: 6 });
});

test("inspect: a miss, an ambiguity and a substring are coded; opts.as = a player sees no rows, hd or summons", async () => {
  assert.equal(await code(() => api.inspect("Ilsa")), "NOT_FOUND");
  assert.equal(await code(() => api.inspect(42)), "BAD_ARGS");
  const twin = makeActor({ id: "twin000000000001", name: "Grisk", type: "npc" });
  F.game.actors.set(twin.id, twin);
  assert.equal(await code(() => api.inspect("Grisk")), "AMBIGUOUS");
  F.game.actors.delete(twin.id);
  const asPlayer = api.inspect(npc, { as: IDS.player });
  assert.deepEqual([asPlayer.rows, asPlayer.hd, asPlayer.concentrationSummons], [null, null, null]);
  assert.equal(Object.keys(asPlayer.settings).length, 8);
  const own = api.inspect(sorc, { as: IDS.player });
  assert.ok(Array.isArray(own.rows) && own.hd, "the player owns Ilsa");
  assert.equal(own.concentrationSummons, null, "GM-only");
});

test("inspect: the tokens the actor's concentration effects keep, on every scene", () => {
  const fx = `Actor.${IDS.sorc}.ActiveEffect.conc000000000001`;
  const scene = makeScene({ id: "sceneinspect0001", name: "Inspect", tokens: [
    { id: "tokinspect000001", flags: { [MODULE]: { concentration: fx } } },
    { id: "tokinspect000002", flags: { [MODULE]: { concentration: `Actor.${IDS.wiz}.ActiveEffect.x` } } },
    { id: "tokinspect000003", flags: {} },
  ] });
  F.game.scenes.set(scene.id, scene);
  assert.deepEqual(api.inspect(sorc).concentrationSummons, [{ scene: "sceneinspect0001", token: "tokinspect000001", effect: fx }]);
  F.game.scenes.delete(scene.id);
});

test("selftest(): every check passes after ready", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks.filter(c => !c.ok)));
  assert.deepEqual(out.checks.map(c => c.label), [
    "published as module.api", "game.pentaryn.riders is this API", "settings readable", "hooks registered",
    "Battle Medic relay registered", "patches installed",
  ]);
});

test("arcaneRecovery(ref): the picker for an owned wizard writes the chosen slots; a non-owner is refused; a miss is a refusal", async () => {
  const w4 = makeActor({ id: "wizardfour000001", name: "Wren", ownership: { default: 3 }, system: { spells: { spell1: { level: 1, value: 2, max: 4 }, spell2: { level: 2, value: 0, max: 2 } } }, items: [
    { id: "wrenclass0000001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 4 } },
  ] });
  F.game.actors.set(w4.id, w4);
  W.answer = () => ({ l2: 1 });
  const before = F.calls.length;
  const out = await api.arcaneRecovery("Wren");
  W.answer = () => "cancel";
  assert.deepEqual(out, { ok: true, actor: { documentName: "Actor", id: w4.id, uuid: `Actor.${w4.id}`, name: "Wren" }, recovered: { 1: 0, 2: 1 } });
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ "system.spells.spell2.value": 1 }]);
  assert.deepEqual((await api.arcaneRecovery(w4)).recovered, null, "cancelled");
  F.become({ userId: IDS.player });
  try {
    assert.equal((await api.arcaneRecovery(npc)).code, "REFUSED");
  } finally { F.become({ userId: IDS.gm }); }
  assert.equal((await api.arcaneRecovery("Nobody")).code, "NOT_FOUND");
  F.game.actors.delete(w4.id);
});

test("uninstall(): every hook and patch is removed; the namespace stays until the next publish", () => {
  const live = F.hooks.length;
  assert.ok(live > 0);
  api.uninstall();
  const { init: _i, ready: _r, ...left } = F.listeners();
  assert.deepEqual(left, {});
  assert.equal(api.describe().patches.length, 0);
});
