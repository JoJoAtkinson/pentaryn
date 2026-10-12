// The published API (guide step 8): rows ↔ implementations (Starry's rows contributed by starry.mjs),
// the describe/surface goldens, inspect's shape (transform-creatures-17) and its refs, selftest.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { MANIFEST, STARRY_ROWS } from "../api-manifest.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses"] });
const T = await import("../transform.mjs");
const S = await import("../starry-adapter.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const code = async fn => { try { await fn(); return "ok"; } catch (e) { return e.code ?? e.message; } };

function fresh(opts) {
  game.actors.clear();
  F.become({ userId: IDS.gm });
  game.time.worldTime = 0;
  return F.W.talo(opts);
}

test("every described method is a function on the API, Starry's contributed rows included", () => {
  const methods = api.describe().methods.map(m => m.path);
  for (const r of STARRY_ROWS) assert.ok(methods.includes(r.path), r.path);
  for (const path of methods) {
    const fn = path.split(".").reduce((o, k) => o?.[k], api);
    assert.equal(typeof fn, "function", path);
  }
  assert.deepEqual(methods.slice(0, 7), ["shift", "revert", "forms", "wildShapeActivity", "original", "isRevertItem", "sweepSpentForms"]);
});

test("drift fails at build: a row without an implementation; legacy rows publish the module's own functions", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
  assert.equal(api.shift, T.shift);
  assert.equal(api.starry.assume, S.assumeStarry);
  assert.ok(Object.isFrozen(api) && Object.isFrozen(api.starry));
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("inspect(Talo) in normal form: plain JSON, depth ≤ 4; refs by name, id, uuid; never a substring", async () => {
  fresh();
  const out = api.inspect("Talo");
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  assert.deepEqual(out, {
    actor: { documentName: "Actor", id: IDS.talo, uuid: `Actor.${IDS.talo}`, name: "Talo" },
    original: null, shifted: false, wildShapeForm: false, form: null,
    wildShape: { itemId: IDS.ws, usesLeft: 2, max: 3 }, starry: null,
    forms: [{ id: "p1", name: "Dire Wolf" }, { id: "p2", name: "Brown Bear" }, { id: "p3", name: "Ape" }]
  });
  assert.deepEqual(api.inspect(IDS.talo), out);
  assert.deepEqual(api.inspect(`Actor.${IDS.talo}`), out);
  assert.equal(api.inspect("talo").actor.id, IDS.talo, "case-insensitive exact name");
  assert.equal(await code(() => api.inspect("Tal")), "NOT_FOUND");
  assert.equal(await code(() => api.inspect(42)), "BAD_ARGS");
});

test("inspect(the Dire Wolf form): shifted, its original, the time left, the druid's Wild Shape uses", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  game.time.worldTime = 60;
  const out = api.inspect(wolf);
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(out.original, { documentName: "Actor", id: IDS.talo, uuid: `Actor.${IDS.talo}`, name: "Talo" });
  assert.equal(out.shifted, true);
  assert.equal(out.wildShapeForm, true);
  assert.deepEqual(out.form, { name: "Talo (Dire Wolf)", profileId: "p1", sourceUuid: "Actor.direWolfSrc00001", endsAt: 21600, secondsLeft: 21540 });
  assert.deepEqual(out.wildShape, { itemId: IDS.ws, usesLeft: 1, max: 3 });
});

test("inspect(the druid) while shifted reads the body that is out: the form, the time left (PT TF-3)", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  game.time.worldTime = 60;
  const out = api.inspect("Talo");
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(out, api.inspect(wolf), "the druid's ref and the form's ref give one answer");
  assert.equal(out.shifted, true);
  assert.equal(out.form.secondsLeft, 21540);
  assert.deepEqual(out.original, { documentName: "Actor", id: IDS.talo, uuid: `Actor.${IDS.talo}`, name: "Talo" });
  assert.deepEqual(Object.keys(api.inspect("Talo", { as: IDS.player2 })), ["actor"]);
});

test("inspect: Starry Form up → constellation and seconds left", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  game.time.worldTime = 60;
  assert.deepEqual(api.inspect(talo).starry, { constellation: "archer", secondsLeft: 540 });
});

test("inspect opts.as: a user without OBSERVER sees the identity only; the owner and a GM see it all", () => {
  fresh();
  assert.deepEqual(Object.keys(api.inspect("Talo", { as: IDS.player2 })), ["actor"]);
  assert.equal(api.inspect("Talo", { as: IDS.player }).wildShape.itemId, IDS.ws);
  assert.equal(api.inspect("Talo", { as: IDS.gm }).wildShape.itemId, IDS.ws);
});

test("every patch record names an adjustments row; no settings; selftest passes on a healthy load", () => {
  const d = api.describe();
  assert.deepEqual(d.patches.map(p => [p.label, p.adjustments]), [["TokenDocument._preUpdateOperation", "transform-preupdate-unwrap"]]);
  assert.deepEqual(d.settings, []);
  assert.deepEqual(api.settings(), {});
  const st = api.selftest();
  assert.equal(st.ok, true, JSON.stringify(st.checks));
});

test("describe() enums match the implementation tables (revert reasons, constellations, starry.end reasons)", async () => {
  const { RETURN_LINES } = await import("../wildshape-adapter.mjs");
  const { CONSTELLATIONS, starryEndKey } = await import("../transform-core.mjs");
  const quoted = type => [...type.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const row = (rows, path) => rows.find(r => r.path === path);
  assert.deepEqual(quoted(row(MANIFEST.rows, "revert").params[1].type).sort(), Object.keys(RETURN_LINES).sort());
  assert.deepEqual(quoted(row(STARRY_ROWS, "starry.assume").params[1].type), [...CONSTELLATIONS]);
  assert.deepEqual(quoted(row(STARRY_ROWS, "starry.constellation").returns), [...CONSTELLATIONS]);
  const endReasons = quoted(row(STARRY_ROWS, "starry.end").params[1].type);
  assert.equal(new Set(endReasons.map(starryEndKey)).size, endReasons.length);
  assert.equal(endReasons.length, 3);
});
