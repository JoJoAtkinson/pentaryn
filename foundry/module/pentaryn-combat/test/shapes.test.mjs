// shapes.mjs (Foundry → plain data, the combat context, the turn flag) and offhand.mjs (the weapon-set
// seed) characterised against the synthetic cast (guide S1; S8 moves the raw `last` reads behind
// shapes helpers and S6a moves the seed into the Argon adapter — these pins must hold through both).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeActor, makeCombat, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { barbarian, druid, fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
const shapes = await import("../shapes.mjs");
const off = await import("../offhand.mjs");
const { hookRegistry } = await import("../lib/hooks.mjs");
const { makeLog } = await import("../lib/log.mjs");
const settings = await import("../settings.mjs");
settings.registerSettings();
F.calls.length = 0;

const cast = {
  fighter: fighter(), rogue: rogue(), monk0: monk({ focus: 0 }), monk2: monk({ focus: 2 }), wolf: wolf(), druid: druid(),
  barbarian: barbarian(), slayer: slayer(),
};

test("weaponShape / weaponsOf for the whole cast (golden/weapon-shapes.json)", () => {
  const out = Object.fromEntries(Object.entries(cast).map(([k, a]) => [k, shapes.weaponsOf(a)]));
  pinJSON("weapon-shapes", out, import.meta.url);
  assert.deepEqual(out.fighter.map(w => w.id), ["longsword0000001", "dagger0000000001", "shortbow00000001"]);
  assert.equal(out.slayer.find(w => w.id === "polearmMaster001").weaponLike, true, "a feat with a weapon attack is weapon-like");
});

test("weaponShape edge cases: unarmed by name, natural, a pact weapon, a stack, an unequipped weapon, a spell", () => {
  const a = makeActor({ id: "edgeCases0000001", name: "Edge", items: [
    { id: "punch00000000001", name: "Unarmed Strike (Monk)", type: "weapon", system: { equipped: false }, activities: [{ id: "punchAtk00000001" }] },
    { id: "claws00000000001", name: "Claws", type: "weapon", system: { type: { value: "natural" }, equipped: false }, activities: [{ id: "clawsAtk00000001" }] },
    { id: "pactBlade0000001", name: "Pact Blade", type: "weapon", flags: { [MODULE]: { pactWeapon: true } }, system: { equipped: true, quantity: 2, properties: ["lgt"] }, activities: [{ id: "pactAtk000000001", ability: "cha" }] },
    { id: "torch00000000001", name: "Torch", type: "consumable", system: {}, activities: [{ id: "torchAtk00000001", classification: "improvised" }] },
    { id: "fireBolt00000001", name: "Fire Bolt", type: "spell", system: {}, activities: [{ id: "fireBoltAtk00001", classification: "spell", attackType: "ranged" }] },
    { id: "noAttack00000001", name: "Rope", type: "loot", system: {} },
    { id: "bonusFeat0000001", name: "Tail Swipe", type: "feat", system: { _typeAbilityMod: "str" }, activities: [{ id: "tailAtk000000001", activation: "" }] },
  ] });
  const rows = a.items.contents.map(i => (shapes.attackActivityOf(i) ? shapes.weaponShape(i) : { id: i.id, attack: null }));
  pinJSON("weapon-shapes-edge", rows, import.meta.url);
  assert.deepEqual(shapes.activitiesOf(null), []);
  assert.deepEqual(shapes.activitiesOf({ system: { activities: [{ id: "x" }] } }), [{ id: "x" }], "a plain array works too");
  assert.equal(shapes.attackActivityOf(null), null);
});

test("featuresOf / featureItem / unarmedStrike / focusLeft / flurryActivity", () => {
  const rows = Object.fromEntries(Object.entries(cast).map(([k, a]) => [k, {
    features: [...shapes.featuresOf(a)],
    reckless: shapes.featureItem(a, "reckless-attack")?.id ?? null,
    pam: shapes.featureItem(a, "polearm-master")?.id ?? null,
    unarmed: shapes.unarmedStrike(a)?.id ?? null,
    focus: shapes.focusLeft(a),
    flurry: shapes.flurryActivity(a)?.id ?? null,
  }]));
  pinJSON("features", rows, import.meta.url);
  assert.equal(rows.monk0.focus, 0);
  assert.equal(rows.monk2.focus, 2);
  assert.equal(rows.fighter.focus, null);
  assert.deepEqual([shapes.featuresOf(null).size, shapes.featureItem(null, "x"), shapes.unarmedStrike(null), shapes.focusLeft(null)], [0, null, null, null]);
  const m = monk({ focus: 1, id: "monkSpentOnly001" });
  m.items.get("monksFocus000001").system.uses = { max: 3, spent: 1 };
  assert.equal(shapes.focusLeft(m), 2, "no value: max − spent");
  m.items.get("monksFocus000001").system.uses = { max: 0 };
  assert.equal(shapes.focusLeft(m), null, "max 0 = no pool");
});

test("setPrimaryId / chosenWeapon: remembered, else the active set's primary, else the first melee", async () => {
  const f = cast.fighter;
  assert.equal(shapes.setPrimaryId(f), null);
  assert.equal(shapes.chosenWeapon(f), "longsword0000001");
  f.flags.enhancedcombathud = { weaponSets: { 1: { primary: "Actor.fighter000000001.Item.dagger0000000001" }, 2: { primary: "Actor.fighter000000001.Item.shortbow00000001" } } };
  assert.equal(shapes.setPrimaryId(f), "dagger0000000001");
  assert.equal(shapes.chosenWeapon(f), "dagger0000000001");
  f.flags.enhancedcombathud.activeWeaponSet = "2";
  assert.equal(shapes.chosenWeapon(f), "shortbow00000001");
  f.flags[MODULE] = { last: { weapon: "longsword0000001" } };
  assert.equal(shapes.chosenWeapon(f), "longsword0000001");
  f.flags[MODULE] = { last: { weapon: "gone" } };
  assert.equal(shapes.chosenWeapon(f), "shortbow00000001", "a remembered weapon that is gone falls through");
  delete f.flags[MODULE];
  delete f.flags.enhancedcombathud;
  assert.equal(shapes.setPrimaryId({ getFlag() { throw new Error("inactive scope"); } }), null);
  assert.equal(shapes.chosenWeapon(cast.monk2), "unarmedStrike001");
});

test("multiattackOf / usesMultiattack / countFor (golden/multiattack.json)", () => {
  const formula = makeActor({ id: "spirit0000000001", name: "Bestial Spirit", type: "npc", system: { attributes: { movement: {} }, details: { level: 5 } }, items: [
    { id: "multiattack00003", name: "Multiattack", type: "feat", system: { description: { value: "The spirit makes a number of [[/item Rend]] attacks equal to half this spell's level (round down) [[floor(@details.level / 2)]]{2}." } } },
    { id: "rend000000000001", name: "Rend", type: "weapon", system: { type: { value: "natural" } }, activities: [{ id: "rendAtk000000001" }] },
  ] });
  formula.getRollData = () => ({ details: { level: 5 } });
  const dice = makeActor({ id: "chaos00000000001", name: "Chaos", type: "npc", items: [
    { id: "multiattack00004", name: "Multiattack", type: "feat", system: { description: { value: "It makes a number of [[/item Slam]] attacks equal to [[1d4]]." } } },
    { id: "slam000000000001", name: "Slam", type: "weapon", system: { type: { value: "natural" } }, activities: [{ id: "slamAtk000000001" }] },
  ] });
  const override = wolf({ id: "wolfOverride0001", flags: { [MODULE]: { multiattack: [{ item: "bite", count: 3 }, { item: "nope", count: 1 }] } } });
  const nothing = makeActor({ id: "plain00000000001", name: "Plain", type: "npc", items: [
    { id: "multiattack00005", name: "Multiattack", type: "feat", system: { description: { value: "It roars." } } },
  ] });
  const rows = {
    wolf: shapes.multiattackOf(cast.wolf), druid: shapes.multiattackOf(cast.druid), spirit: shapes.multiattackOf(formula),
    chaos: shapes.multiattackOf(dice), override: shapes.multiattackOf(override), unparsed: shapes.multiattackOf(nothing),
    fighter: shapes.multiattackOf(cast.fighter), none: shapes.multiattackOf(null),
    uses: Object.fromEntries(Object.entries(cast).map(([k, a]) => [k, shapes.usesMultiattack(a)])),
    count: Object.fromEntries(Object.entries(cast).map(([k, a]) => [k, [shapes.countFor(a), ...shapes.weaponsOf(a).map(w => shapes.countFor(a, w.id))]])),
    attacksFlag: shapes.countFor(fighter({ id: "fighterFlag00001", flags: { [MODULE]: { attacks: 3 } } })),
  };
  pinJSON("multiattack", rows, import.meta.url);
  assert.equal(rows.wolf.total, 2);
  assert.equal(rows.override.source, "flag");
  assert.equal(rows.unparsed, null);
});

test("combatContext: which combat (viewed, active on scene, any active…), whose turn, which key (golden/combat-context.json)", () => {
  const f = cast.fighter, w = cast.wolf;
  const ftok = makeToken(f, { id: "tokFighter000001" });
  const wtok = makeToken(w, { id: "tokWolf000000001", x: 1, disposition: -1 });
  const rows = [];
  const ctx = (label, a) => {
    const c = shapes.combatContext(a);
    rows.push({ label, combat: c.combat?.id ?? null, inCombat: c.inCombat, isOwnTurn: c.isOwnTurn, key: c.key });
  };
  ctx("no combat at all", f);
  ctx("no actor", null);
  const c1 = makeCombat({ id: "c1", entries: [{ id: "cb1", actor: f, token: ftok }, { id: "cb2", actor: w, token: wtok }] });
  ctx("c1, the fighter's turn", f);
  ctx("c1, the wolf off its turn", w);
  setTurn(c1, { turn: 1, round: 2 });
  ctx("c1 round 2, the wolf's turn", w);
  const c2 = makeCombat({ id: "c2", round: 5, entries: [{ id: "cbX", actor: cast.rogue }], viewed: true });
  ctx("viewing c2 (not holding the fighter): c1 still found", f);
  c1.active = false;
  ctx("c1 inactive and the only one holding him: still c1", f);
  c1.started = false;
  ctx("c1 not started: falls back to the viewed combat (c2), not in it", f);
  ctx("the rogue in c2", cast.rogue);
  c1.started = true;
  c1.active = true;
  F.game.combat = null;
  ctx("nothing viewed", f);
  c1.combatants.get("cb1").actor = makeActor({ id: "fighterClone0001", name: "Fighter (token)" });
  ctx("c1 no longer holds him and nothing is viewed: no combat", f);
  c1.combatants.get("cb1").actor = f;
  F.game.combats.delete("c2");
  pinJSON("combat-context", rows, import.meta.url);
  assert.equal(rows[0].key, "nocombat");
  F.game.combat = c1;
  setTurn(c1, { turn: 0, round: 1 });
});

test("turnOf / updateTurn / turnSettled / newTurn: a whole-flag replacement, chained per actor, owner only", async () => {
  const core = await import("../combat-core.mjs");
  const f = cast.fighter;
  delete f.flags[MODULE];
  F.calls.length = 0;
  assert.equal(shapes.turnOf(f).key, "c1:1:cb1");
  const p1 = shapes.updateTurn(f, t => core.recordSwing(t, { kind: "main", weaponId: "longsword0000001" }));
  const p2 = shapes.updateTurn(f, t => core.recordSwing(t, { kind: "main", weaponId: "dagger0000000001" }));
  assert.equal(shapes.turnSettled(f), p2);
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.attackAction.swings, 1);
  assert.equal(b.attackAction.swings, 2, "the second write saw the first");
  const writes = F.calls.filter(c => c.op === "update");
  assert.equal(writes.length, 2);
  assert.deepEqual(Object.keys(writes[0].changes), [`flags.${MODULE}.turn`]);
  assert.ok(writes[0].changes[`flags.${MODULE}.turn`]["<replace>"], "written through _replace (ForcedReplacement)");
  // the replace drops a key a merge would keep (the riders bug the replace fixed)
  f.flags[MODULE].turn.riders = { "sneak-attack": "used" };
  await shapes.updateTurn(f, t => ({ ...t, riders: {} }));
  assert.deepEqual(f.flags[MODULE].turn.riders ?? {}, {});
  F.calls.length = 0;
  assert.equal((await shapes.updateTurn(f, t => t)).attackAction.swings, 2, "no change: no write, the old turn back");
  assert.equal((await shapes.updateTurn(f, () => null)).attackAction.swings, 2, "null: no write");
  assert.deepEqual(F.calls, []);
  f.isOwner = false;
  assert.equal(await shapes.updateTurn(f, t => ({ ...t, nick: true })), null, "not the owner");
  assert.equal(await shapes.newTurn(f), null);
  f.isOwner = true;
  assert.equal(await shapes.updateTurn(null, t => t), null);
  assert.equal(await shapes.turnSettled(null), undefined);
  const thrown = await shapes.updateTurn(f, () => { throw new Error("bad fn"); });
  assert.equal(thrown, null);
  assert.deepEqual(lines.splice(0), [{ level: "warn", text: "pentaryn-combat | turn flag write failed", err: "bad fn" }]);
  // newTurn writes a fresh turn under the current key (in or out of combat)
  F.calls.length = 0;
  await shapes.newTurn(f);
  assert.deepEqual(F.calls.find(c => c.op === "update").changes, { [`flags.${MODULE}.turn`]: { "<replace>": core.freshTurn("c1:1:cb1") } });
  // a flag from another turn reads as fresh
  setTurn(F.game.combat, { round: 2 });
  assert.equal(shapes.turnOf(f).attackAction.swings, 0);
  setTurn(F.game.combat, { round: 1 });
  // without _replace: the older "==" key
  const rep = globalThis._replace;
  delete globalThis._replace;
  const FR = F.foundry.data.operators.ForcedReplacement;
  F.foundry.data.operators.ForcedReplacement = undefined;
  F.calls.length = 0;
  const upd = f.update;
  f.update = async changes => { F.calls.push({ op: "raw.update", changes: F.plain(changes) }); };
  await shapes.newTurn(f);
  assert.deepEqual(F.calls, [{ op: "raw.update", changes: { [`flags.${MODULE}.==turn`]: core.freshTurn("c1:1:cb1") } }]);
  f.update = upd;
  globalThis._replace = rep;
  F.foundry.data.operators.ForcedReplacement = FR;
  delete f.flags[MODULE];
});

test("rollAdvantage: the roll's own flags first, else its advantage mode", () => {
  assert.deepEqual(shapes.rollAdvantage({ hasAdvantage: true, hasDisadvantage: false }), { advantage: true, disadvantage: false });
  assert.deepEqual(shapes.rollAdvantage({ options: { advantageMode: -1 } }), { advantage: false, disadvantage: true });
  assert.deepEqual(shapes.rollAdvantage(null), { advantage: false, disadvantage: false });
  const dice = CONFIG.Dice;
  CONFIG.Dice = undefined;
  assert.deepEqual(shapes.rollAdvantage({ options: { advantageMode: 1 } }), { advantage: true, disadvantage: false }, "fallback modes");
  CONFIG.Dice = dice;
});

test("allyAdjacent: an ally of the attacker within 5 ft of the target; null when it can't tell", () => {
  W.placeables.length = 0;
  const r = cast.rogue, f = cast.fighter, w = cast.wolf, b = cast.barbarian;
  for (const a of [r, f, w, b]) a._tokens.length = 0;
  const rt = makeToken(r, { id: "tokRogue00000001", x: 0 });
  const target = makeToken(w, { id: "tokWolf000000002", x: 5, disposition: -1 });
  assert.equal(shapes.allyAdjacent(rt, target), false, "nobody beside it");
  const ft = makeToken(f, { id: "tokFighter000002", x: 6 });
  assert.equal(shapes.allyAdjacent(rt, target), true);
  f.statuses.add("unconscious");
  assert.equal(shapes.allyAdjacent(rt, target), false, "incapacitated ally");
  f.statuses.delete("unconscious");
  ft.document.hidden = true;
  assert.equal(shapes.allyAdjacent(rt, target), false, "hidden ally");
  ft.document.hidden = false;
  ft.document.disposition = -1;
  assert.equal(shapes.allyAdjacent(rt, target), false, "not the attacker's disposition");
  ft.document.disposition = 1;
  ft.center = { x: 850, y: 50 };
  assert.equal(shapes.allyAdjacent(rt, target), false, "15 ft away");
  ft.document.width = 3;
  assert.equal(shapes.allyAdjacent(rt, target), false, "a Huge ally 15 ft centre to centre: 10 ft edge gap");
  ft.document.width = 5;
  assert.equal(shapes.allyAdjacent(rt, target), true, "a Gargantuan one's edge reaches (half-sizes in grid units)");
  assert.equal(shapes.allyAdjacent(null, target), null);
  F.canvas.ready = false;
  assert.equal(shapes.allyAdjacent(rt, target), null, "no canvas");
  F.canvas.ready = true;
  const measure = F.canvas.grid.measurePath;
  F.canvas.grid.measurePath = () => { throw new Error("no grid"); };
  assert.equal(shapes.allyAdjacent(rt, target), null, "a throw reads as unknown");
  F.canvas.grid.measurePath = measure;
});

test("tokenOf: the synthetic token's placeable, else the first active token", () => {
  const r = cast.rogue;
  assert.equal(shapes.tokenOf(r).id, "tokRogue00000001");
  r.token = { object: { id: "synthetic" } };
  assert.equal(shapes.tokenOf(r).id, "synthetic");
  r.token = null;
  assert.equal(shapes.tokenOf(null), null);
  assert.equal(shapes.tokenOf({}), null);
});

test("legacy oracles: api.plan and fullAttackState as the live code computes them", async () => {
  const sequence = await import("../sequence.mjs");
  for (const a of Object.values(cast)) {
    const st = legacy.fullAttackState(a);
    assert.deepEqual(sequence.fullAttackPlan(a, { weaponId: st.weaponId, turn: st.turn, inCombat: st.ctx.inCombat, multiattack: st.ma, count: st.count, pick: st.ma ? { "*": null } : null }), st.plan, a.name);
  }
  const rows = Object.fromEntries(Object.entries(cast).map(([k, a]) => {
    const st = legacy.fullAttackState(a);
    return [k, { plan: legacy.apiPlan(a), withWeapon: legacy.apiPlan(a, shapes.weaponsOf(a)[0]?.id ?? null), state: { weaponId: st.weaponId, count: st.count, pipCount: st.pipCount, worth: st.worth, plan: st.plan, ma: st.ma } }];
  }));
  pinJSON("plans", rows, import.meta.url);
});

test("seedWeaponSets: once per character with a class, never over a written flag, never a form or a pile", async () => {
  lines.length = 0;
  const rows = [];
  const seed = async (label, a) => rows.push({ label, seed: await off.seedWeaponSets(a) });
  await seed("fighter", fighter({ id: "seedFighter00001" }));
  const written = fighter({ id: "seedFighter00002", flags: { enhancedcombathud: { weaponSets: { 1: { primary: null } } } } });
  await seed("already written (even empty)", written);
  await seed("rogue: scimitar + dagger", rogue({ id: "seedRogue0000001" }));
  await seed("npc", wolf({ id: "seedWolf00000001" }));
  await seed("Wild Shape form", druid({ id: "seedDruid0000001" }));
  await seed("dnd5e isPolymorphed flag", fighter({ id: "seedPoly00000001", flags: { dnd5e: { isPolymorphed: true } } }));
  await seed("no class (a pile or template)", makeActor({ id: "seedPile00000001", name: "Pile", items: [{ id: "x", name: "Dagger", type: "weapon", system: { equipped: true, properties: ["lgt"] }, activities: [{ id: "xa" }] }] }));
  await seed("nothing worth seeding", monk({ focus: 2, id: "seedMonk00000001" }));
  await seed("null", null);
  await F.game.settings.set(MODULE, "seedWeaponSets", false);
  await seed("setting off", fighter({ id: "seedFighter00003" }));
  await F.game.settings.set(MODULE, "seedWeaponSets", true);
  F.game.modules.get("enhancedcombathud").active = false;
  await seed("Argon off", fighter({ id: "seedFighter00004" }));
  F.game.modules.get("enhancedcombathud").active = true;
  pinJSON("seed", { rows, console: lines.splice(0) }, import.meta.url);
  assert.ok(rows[0].seed);
  assert.equal(rows.filter(r => r.seed).length, 2);
});

test("seedAll: active GM only, every character without the flag in ONE Actor.updateDocuments; a compute failure is warned per actor (combat-core-AC-1)", async () => {
  for (const a of [...F.game.actors]) if (a.type === "character") delete a.flags.enhancedcombathud;
  const bad = fighter({ id: "seedBad000000001", name: "Broken" });
  Object.defineProperty(bad, "items", { get() { throw new Error("locked"); }, configurable: true });
  lines.length = 0;
  F.calls.length = 0;
  const out = await off.seedAll();
  const batches = F.calls.filter(c => c.op === "Actor.updateDocuments");
  assert.equal(batches.length, 1, "combat-core-AC-1: one batch write, not one setFlag per character");
  assert.deepEqual(F.calls.filter(c => c.op === "update"), [], "combat-core-AC-1: no per-actor update");
  const { updates } = batches[0];
  for (const u of updates) assert.deepEqual(Object.keys(u), ["_id", "flags.enhancedcombathud.weaponSets"]);
  assert.deepEqual(updates.map(u => u["flags.enhancedcombathud.weaponSets"]), out.map(r => r.seed));
  pinJSON("seed-all", { out, updates: updates.map(u => u._id), console: lines.splice(0) }, import.meta.url);
  assert.ok(out.length >= 5);
  for (const u of updates) assert.deepEqual(F.game.actors.get(u._id).flags.enhancedcombathud.weaponSets, u["flags.enhancedcombathud.weaponSets"]);
  bad.delete();
  F.become({ userId: "player0000000001" });
  assert.deepEqual(await off.seedAll(), []);
  F.become({ userId: "gmUser0000000001" });
  F.calls.length = 0;
  assert.deepEqual(await off.seedAll(), [], "everyone already seeded");
  assert.deepEqual(F.calls, [], "nothing to write: no batch");
});

test("seedAll: a failed batch warns once naming the actors, returns [] and seeds nobody (combat-core-AC-1)", async () => {
  const fresh = [fighter({ id: "seedBatchFail001", name: "Ash" }), rogue({ id: "seedBatchFail002", name: "Birch" })];
  const m = mock.method(globalThis.Actor, "updateDocuments", async () => { throw new Error("locked"); });
  lines.length = 0;
  try {
    assert.deepEqual(await off.seedAll(), []);
  } finally { m.mock.restore(); }
  assert.equal(m.mock.callCount(), 1, "combat-core-AC-1: one batch");
  const console_ = lines.splice(0);
  assert.deepEqual(console_.map(l => l.level), ["warn"]);
  assert.equal(console_[0].text, "pentaryn-combat | weapon-set seed failed for Ash, Birch");
  for (const a of fresh) assert.equal(a.flags.enhancedcombathud, undefined, "nothing partially seeded");
  for (const a of fresh) a.delete();
});

test("offhand install: createActor seeds a new character 500 ms later, on the active GM only", async () => {
  off.install(hookRegistry(MODULE, makeLog(MODULE)));
  const fresh = fighter({ id: "seedNew000000001", name: "Newcomer" });
  F.Hooks.callAll("createActor", fresh);
  F.Hooks.callAll("createActor", wolf({ id: "seedNewWolf00001" }));
  mock.timers.tick(499);
  await drain();
  assert.equal(fresh.flags.enhancedcombathud, undefined);
  mock.timers.tick(1);
  await drain();
  assert.ok(fresh.flags.enhancedcombathud.weaponSets);
  const other = fighter({ id: "seedNew000000002" });
  F.become({ userId: "player0000000001" });
  F.Hooks.callAll("createActor", other);
  F.become({ userId: "gmUser0000000001" });
  mock.timers.tick(500);
  await drain();
  assert.equal(other.flags.enhancedcombathud, undefined, "a player's client never seeds");
  const failing = fighter({ id: "seedNew000000003" });
  failing.setFlag = async () => { throw new Error("locked"); };
  lines.length = 0;
  F.Hooks.callAll("createActor", failing);
  mock.timers.tick(500);
  await drain();
  assert.deepEqual(lines.filter(l => l.level === "warn"), [{ level: "warn", text: "pentaryn-combat | weapon-set seed (new character)", err: "locked" }], "combat-core-ROB-5: the createActor seed warns its failure, never throws");
});
