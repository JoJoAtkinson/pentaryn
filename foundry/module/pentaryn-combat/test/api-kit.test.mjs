// Guide S7: the kit-built API (game.pentaryn.combat). Rows ↔ implementations, the describe/surface
// goldens, inspect() (plain JSON, depth ≤ 4; plan and turn as the legacy members answer them),
// selftest(), coversMultiattack() (transform-creatures-13), and the kit members.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { MODULE, drain, makeCombat, makeToken, setupWorld } from "./fixtures/world.mjs";
import { druid, fighter, monk, rogue, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
const cast = { fighter: fighter(), rogue: rogue(), monk: monk({ focus: 2 }), wolf: wolf(), druid: druid() };
const toks = Object.fromEntries(Object.values(cast).map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
makeCombat({ id: "c1", entries: Object.values(cast).map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
const api = F.game.pentaryn.combat;
const { surfaceOf } = await import("../lib/api.mjs");
const { MANIFEST } = await import("../api-manifest.mjs");

test("published as module.api and game.pentaryn.combat, frozen; every described method is a function", () => {
  assert.equal(F.game.modules.get(MODULE).api, api);
  assert.equal(Object.isFrozen(api), true);
  for (const path of api.describe().methods.map(m => m.path)) assert.equal(typeof api[path], "function", path);
  assert.equal(api.version, manifestOf(new URL("..", import.meta.url)).version);
  assert.equal(api.contract, "pentaryn-combat/api@1");
});

test("describe() equals golden/describe.json (version, kit, published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("rows: the 22 legacy members are legacy and resolve no ref; the new reads resolve one", () => {
  const rows = Object.fromEntries(MANIFEST.rows.map(r => [r.path, r]));
  assert.equal(MANIFEST.rows.filter(r => r.legacy).length, 22);
  for (const r of MANIFEST.rows.filter(x => x.legacy)) assert.notEqual(r.params[0]?.name, "ref", r.path);
  for (const k of ["inspect", "coversMultiattack"]) assert.equal(rows[k].params[0].name, "ref", k);
  const d = api.describe();
  assert.equal(d.settings.length, 30);
  assert.equal(d.flagScope, MODULE);
  assert.ok(d.hooks.length > 60);
  assert.ok(d.patches.length >= 2 && d.patches.every(p => /^combat-/.test(p.adjustments)), JSON.stringify(d.patches));
});

test("inspect: plain JSON, depth ≤ 4; plan and turn equal the legacy members; resolves an id, a name, a token", () => {
  for (const a of Object.values(cast)) {
    const out = api.inspect(a);
    assert.ok(maxDepth(out) <= 4, `${a.name} depth ${maxDepth(out)}`);
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out, a.name);
    assert.deepEqual(out.plan, JSON.parse(JSON.stringify(api.plan(a))), a.name);
    assert.deepEqual(out.turn, JSON.parse(JSON.stringify(api.turn(a))), a.name);
    assert.equal(out.actor.uuid, a.uuid);
    assert.equal(out.inCombat, true);
  }
  assert.deepEqual(api.inspect(cast.fighter.id), api.inspect(cast.fighter));
  assert.deepEqual(api.inspect("Fighter"), api.inspect(cast.fighter));
  assert.deepEqual(api.inspect(cast.fighter.uuid), api.inspect(cast.fighter));
  assert.throws(() => api.inspect("Figh"), /NOT_FOUND/, "never a substring");
  const fig = api.inspect(cast.fighter);
  assert.equal(fig.pips.max >= 2, true);
  assert.deepEqual(Object.keys(fig.settings).length, 30);
  assert.equal(fig.running, null);
});

test("inspect as a player without OBSERVER: identity only", () => {
  const player = F.game.users.get("player0000000001");
  const w = cast.wolf;
  const was = w.testUserPermission;
  w.testUserPermission = () => false;
  try {
    assert.deepEqual(Object.keys(api.inspect(w, { as: player })), ["actor", "key", "inCombat", "isOwnTurn"]);
  } finally { w.testUserPermission = was; }
});

test("coversMultiattack: the Multiattack item id for a form or NPC with 2+ parsed swings; null otherwise", () => {
  const ma = api.multiattack(cast.wolf);
  assert.equal(api.coversMultiattack(cast.wolf), ma && ma.total >= 2 && ma.source !== "flag" ? ma.source : null);
  assert.equal(api.coversMultiattack(cast.fighter), null);
});

test("selftest, settings, trace, uninstall are members", () => {
  const st = api.selftest();
  assert.equal(st.ok, true, JSON.stringify(st.checks));
  assert.equal(Object.keys(api.settings()).length, 30);
  assert.deepEqual(api.trace(), []);
  assert.equal(typeof api.uninstall, "function");
});
