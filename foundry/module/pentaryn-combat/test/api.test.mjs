// game.pentaryn.combat, the 23 legacy members as published today (guide S7 turns them into manifest
// rows with legacy: true — their call shapes and results must not move). Each member is called on
// the cast and the result pinned (golden/api-calls.json); api.plan is pinned against its legacy
// oracle with and without an explicit weapon; the failure paths as they are (combat-riders-12 KNOWN).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, feat, makeActor, makeCombat, makeMessage, makeToken, setupWorld } from "./fixtures/world.mjs";
import { barbarian, druid, fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
const cast = { fighter: fighter(), rogue: rogue(), monk: monk({ focus: 2 }), wolf: wolf(), druid: druid(), barbarian: barbarian(), slayer: slayer() };
const toks = Object.fromEntries(Object.values(cast).map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
makeCombat({ id: "c1", entries: Object.values(cast).map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });

await import("../combat.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
for (const a of F.game.actors) delete a.flags.enhancedcombathud;
const api = F.game.pentaryn.combat;
const shapes = await import("../shapes.mjs");
const seq = await import("../sequence.mjs");
const riders = await import("../turn-riders.mjs");
const settings = await import("../settings.mjs");
const off = await import("../offhand.mjs");
F.calls.length = 0;
lines.length = 0;

test("the members are the module's own functions (identity), in this order", () => {
  // W2-K1 [declared]: the kit API adds members (inspect, selftest, coversMultiattack, version, contract,
  // settings, trace, uninstall, describe); the 23 legacy members keep this order among them.
  const LEGACY = [
    "count", "plan", "turn", "newTurn", "multiattack", "weapons", "offers", "fullAttack", "followUp", "rollRider", "reckless",
    "setReckless", "running", "abort", "quick", "setQuick", "riderMode", "setRiderMode", "report", "fixFeats", "seedWeaponSets", "seedAll", "core",
  ];
  assert.deepEqual(Object.keys(api).filter(k => LEGACY.includes(k)), LEGACY);
  const same = { turn: shapes.turnOf, newTurn: shapes.newTurn, multiattack: shapes.multiattackOf, weapons: shapes.weaponsOf, offers: riders.offersFor,
    followUp: seq.runFollowUp, rollRider: riders.rollRider, reckless: riders.isReckless, setReckless: riders.setReckless, running: seq.running,
    abort: seq.abortFor, quick: settings.quickMode, setQuick: settings.setQuickMode, riderMode: settings.riderMode, setRiderMode: settings.setRiderMode,
    report: riders.report, seedWeaponSets: off.seedWeaponSets, seedAll: off.seedAll };
  // D-c2 [declared] (S11, combat-riders-12): the members that take an actor resolve a ref first, so
  // they are wrappers named after the function they call; the rest are still the functions themselves.
  // combat-core-ROB-2 [declared]: abort resolves its (optional) actor ref the same way.
  const resolving = new Set(["turn", "newTurn", "multiattack", "weapons", "followUp", "reckless", "setReckless", "abort", "seedWeaponSets"]);
  for (const [k, fn] of Object.entries(same)) {
    if (resolving.has(k)) assert.equal(api[k].name, fn.name, k);
    else assert.equal(api[k], fn, k);
  }
  for (const k of ["count", "plan", "fullAttack", "fixFeats"]) assert.equal(typeof api[k], "function", k);
});

test("read members on the cast (golden/api-calls.json)", async () => {
  const out = {};
  for (const [k, a] of Object.entries(cast)) {
    const firstWeapon = shapes.weaponsOf(a)[0]?.id ?? null;
    out[k] = {
      count: api.count(a), countWeapon: api.count(a, firstWeapon), plan: api.plan(a), planWeapon: api.plan(a, firstWeapon),
      turn: api.turn(a), multiattack: api.multiattack(a), weapons: api.weapons(a).map(w => w.id), reckless: api.reckless(a),
    };
  }
  out.quick = api.quick();
  out.riderMode = api.riderMode("sneak-attack");
  out.running = api.running();
  pinJSON("api-calls", out, import.meta.url);
});

test("api.plan equals its legacy oracle, with and without an explicit weapon (combat-riders-21)", () => {
  for (const a of Object.values(cast)) {
    assert.deepEqual(api.plan(a), legacy.apiPlan(a), a.name);
    for (const w of shapes.weaponsOf(a)) assert.deepEqual(api.plan(a, w.id), legacy.apiPlan(a, w.id), `${a.name} ${w.id}`);
  }
  cast.wolf.flags[MODULE] = { last: { weapon: "bite" } };
  assert.deepEqual(api.plan(cast.wolf), legacy.apiPlan(cast.wolf), "Multiattack with a remembered pick");
  delete cast.wolf.flags[MODULE];
});

test("api.plan for a Multiattack actor checks its Multiattack before scanning weapons: an item whose properties are not iterable does not throw (wave 3, combat-2)", () => {
  const brute = makeActor({ id: "bruteNpc00000001", name: "Brute", type: "npc", items: [
    { id: "multiattack00010", name: "Multiattack", type: "feat", system: { description: { value: "<p>The brute makes two [[/item .maul]] attacks.</p>" } } },
    { id: "maul", name: "Maul", type: "weapon", system: { equipped: true, type: { value: "martialM" }, properties: 5 }, activities: [{ id: "maulAtk000000001" }] },
  ] });
  const p = api.plan(brute);
  assert.equal(p.count, 2);
  assert.equal(p.weaponId, "maul");
  assert.equal(api.plan(brute, "maul").count, 2, "an explicit weapon is ignored by a Multiattack plan, as before");
});

test("bad refs (D-c2 [declared], was KNOWN combat-riders-12): a miss answers null, an id / UUID / name resolves (golden/api-bad-refs.json)", async () => {
  const bad = [[undefined], [null], ["Fighter"], [cast.fighter.id], [cast.fighter.uuid], [{}]];
  const read = ["count", "plan", "turn", "multiattack", "weapons", "reckless"];
  const out = {};
  for (const k of read) {
    // D-c2: undefined, null and {} answer null; "Fighter", its id and its UUID resolve to the Fighter
    out[k] = await characterise(`api-bad-${k}`, (...args) => api[k](...args), bad, { file: import.meta.url, normalise: v => JSON.parse(JSON.stringify(v ?? null)) });
  }
  pinJSON("api-bad-refs", Object.fromEntries(Object.entries(out).map(([k, rows]) => [k, rows.map(r => ("threw" in r ? { threw: r.threw } : { ok: true }))])), import.meta.url);
});

test("legacy actor members resolve an id / UUID / name and return null on a miss (D-c2)", () => {
  assert.equal(api.plan(undefined), null);
  assert.deepEqual(api.plan(cast.fighter.id), api.plan(cast.fighter));
  assert.deepEqual(api.turn("Fighter"), api.turn(cast.fighter));
});

test("every ACTOR-param legacy row answers null for a bad ref", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const rows = MANIFEST.rows.filter(r => r.legacy && r.params?.[0]?.type === "Actor|Token|uuid|id|exact name" && r.params[0].resolve === false);
  assert.deepEqual(rows.map(r => r.path).sort(),
    ["count", "plan", "turn", "newTurn", "multiattack", "weapons", "fullAttack", "followUp", "reckless", "setReckless", "abort", "fixFeats", "seedWeaponSets"].sort());
  for (const r of rows) {
    // an optional actor (abort, combat-core-ROB-2) omitted means "any": a bad ref is a miss instead
    const v = api[r.path](r.params[0].optional ? "Nobody At All" : undefined);
    assert.equal(r.returns.startsWith("Promise") ? await v : v, null, r.path);
  }
});

test("write members: newTurn, setQuick, setRiderMode, setReckless, abort, offers / rollRider through a card", async () => {
  const f = cast.fighter;
  F.calls.length = 0;
  await api.newTurn(f);
  assert.equal(f.flags[MODULE].turn.key, "c1:1:cb1");
  await api.setQuick(true);
  assert.equal(api.quick(), true);
  await api.setQuick(false);
  await api.setRiderMode("frenzy", "auto");
  assert.equal(api.riderMode("frenzy"), "auto");
  await api.setRiderMode("frenzy", "ask");
  assert.equal(await api.setReckless(cast.barbarian, true), true);
  assert.equal(api.reckless(cast.barbarian), true);
  assert.equal(await api.setReckless(cast.barbarian, false), false);
  api.abort(f);   // nothing running: no-op
  const card = makeMessage({ type: "attack", system: { activity: { uuid: [...cast.rogue.items.get("scimitar00000001").system.activities.values()][0].uuid } }, rolls: [{ hasAdvantage: true, options: {} }] });
  const { offers } = api.offers(card);
  assert.deepEqual(offers.map(o => [o.rider.key, o.offer, o.auto]), [["sneak-attack", true, true]]);
  assert.equal(await api.rollRider(card, "nope"), null);
  pinJSON("api-writes", F.calls.filter(c => c.op === "update" || c.op === "createEmbedded" || c.op === "deleteEmbedded").map(c => [c.op, c.uuid ?? null]), import.meta.url);
  delete f.flags[MODULE];
  F.calls.length = 0;
});

test("fullAttack / followUp through the API run the same loop as the HUD", async () => {
  const f = cast.fighter;
  delete f.flags[MODULE];
  const out = await api.fullAttack(f, "dagger0000000001");
  mock.timers.tick(400);
  await drain();
  assert.deepEqual(out, { rolled: 2, status: "done" });
  assert.deepEqual(f.flags[MODULE].turn.attackAction.weapons, ["dagger0000000001"]);
  assert.equal(f.flags[MODULE].last.weapon, "dagger0000000001");
  const fu = await api.followUp(cast.monk, { kind: "martial-arts", weaponId: "unarmedStrike001" });
  mock.timers.tick(400);
  assert.deepEqual(fu, { rolled: 1, status: "done" });
  delete f.flags[MODULE];
  delete cast.monk.flags[MODULE];
});

test("report, fixFeats, seedWeaponSets, seedAll through the API (golden/api-gm.json)", async () => {
  lines.length = 0;
  const out = {
    report: api.report(),
    fixFeats: api.fixFeats(cast.slayer),
    seedOne: await api.seedWeaponSets(cast.fighter),
    seedAll: await api.seedAll(),
    console: lines.splice(0).map(l => [l.level, l.text]),
  };
  pinJSON("api-gm", out, import.meta.url);
});

test("core: the module namespace, every export reachable through the API", async () => {
  const core = await import("../combat-core.mjs");
  // W2-K1 [declared]: a frozen copy of the namespace (buildApi's unlisted rule), not the namespace itself.
  assert.notEqual(api.core, core);
  assert.equal(Object.isFrozen(api.core), true);
  assert.deepEqual(Object.keys(api.core).sort(), Object.keys(core).sort());
  for (const k of Object.keys(core)) if (typeof core[k] === "function") assert.equal(api.core[k], core[k], k);
  assert.equal(api.core.MOD, "pentaryn-combat");
  assert.equal(Object.keys(api.core).length, 81 + 18, "S1's 81 plus S2's eight blueprint constants, S4's I18N_KEYS, keyFor, S8's fullAttackPlanFrom, areaPlacementSkipped, -29's pruneOlder, -37's DELAYS, combat-core-EXT-11's ATTACK_ACTION_KINDS, MOVEMENT_KEYS combat-core-EXT-13's ARGON and ext-8's turnEffectData");
});

test("EC-6: Multiattack Off sizes Full Attack from class features, not the Multiattack (wolf 1, Extra Attack 2)", async () => {
  const { fullAttackState } = await import("../hud/buttons-ui.mjs");
  const wolf = cast.wolf;
  // An NPC with a Multiattack of three and the Extra Attack class feature: Off → Extra Attack's 2.
  const vet = makeActor({ id: "veteranNpc000001", name: "Veteran", type: "npc", items: [
    { id: "multiattack00009", name: "Multiattack", type: "feat", system: { description: { value: "<p>The veteran makes three [[/item .blade]] attacks.</p>" } } },
    feat("extraAttackNpc01", "Extra Attack"),
    { id: "blade", name: "Blade", type: "weapon", system: { equipped: true, type: { value: "martialM" } }, activities: [{ id: "bladeAtk00000001" }] },
  ] });
  assert.equal(api.count(wolf), 2, "On: the Multiattack's two");
  assert.equal(api.count(vet), 3, "On: the Multiattack's three");
  await F.game.settings.set(MODULE, "multiattack", false);
  try {
    assert.equal(api.count(wolf), 1, "Off: an NPC with no class features gets 1");
    assert.equal(api.plan(wolf).swings.length, 1);
    assert.equal(api.inspect(wolf).pips, null, "Off: one swing, no pips");
    assert.equal(fullAttackState(wolf).pipCount, 1);
    assert.equal(api.count(vet), 2, "Off: Extra Attack's two, not the Multiattack's three");
    assert.equal(api.plan(vet).swings.length, 2);
    assert.equal(fullAttackState(vet).count, 2);
  } finally {
    await F.game.settings.set(MODULE, "multiattack", true);
  }
});
