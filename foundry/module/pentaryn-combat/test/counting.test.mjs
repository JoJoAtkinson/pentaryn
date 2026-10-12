// combat.mjs's setup hooks (guide S6a's counting + weapon-bonus features, characterised on the
// active GM's client, which owns every actor here): what one attack roll, one activity use, one
// damage roll and one creature dropping to 0 HP do to the turn flag and the events. Tables are
// pinned as recorded (golden/counting-*.json); the console texts of each forced failure too.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeActor, makeCombat, makeItem, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { barbarian, fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
const lines = captureConsole();

const fig = fighter({ extraItems: [
  { id: "actionSurge00001", name: "Action Surge", type: "feat", system: { identifier: "action-surge" }, activities: [{ id: "surgeAct00000001", type: "utility", activation: "special" }] },
  { id: "quickened0000001", name: "Quickened Spell", type: "feat", system: { identifier: "quickened-spell" }, activities: [{ id: "quickAct00000001", type: "utility", activation: "special" }] },
  { id: "fireBolt00000001", name: "Fire Bolt", type: "spell", system: { identifier: "fire-bolt" }, activities: [{ id: "fireBoltAtk00001", type: "attack", activation: "action", classification: "spell", attackType: "ranged" }] },
  { id: "shield0000000001", name: "Shield", type: "spell", system: { identifier: "shield" }, activities: [{ id: "shieldAct0000001", type: "utility", activation: "reaction" }] },
  { id: "magicMissile0001", name: "Magic Missile", type: "spell", system: { identifier: "magic-missile" }, activities: [{ id: "mmAct00000000001", type: "damage", activation: "action" }] },
  { id: "fireball00000001", name: "Fireball", type: "spell", system: { identifier: "fireball" }, activities: [{ id: "fireballSave0001", type: "save", activation: "action", target: { template: { type: "sphere" }, affects: { type: "" } } }] },
  { id: "secondWind000001", name: "Second Wind", type: "feat", system: { identifier: "second-wind" }, activities: [{ id: "secondWindAct001", type: "heal", activation: "bonus" }] },
  { id: "unarmedStrike001", name: "Unarmed Strike", type: "weapon", system: { identifier: "unarmed-strike", equipped: false, properties: new Set() },
    activities: [{ id: "unarmedAtk000001", type: "attack", activation: "action" }, { id: "grappleSave00001", type: "save", activation: "action" }] },
  { id: "handaxe000000001", name: "Handaxe", type: "weapon", system: { identifier: "handaxe", equipped: true, properties: new Set(["lgt", "thr"]), attackModes: [{ value: "oneHanded" }, { value: "offhand" }, { value: "thrown" }, { value: "thrown-offhand" }] },
    activities: [{ id: "handaxeAtk000001", type: "attack", activation: "action" }] },
  { id: "bonusBite0000001", name: "Bonus Bite", type: "weapon", system: { identifier: "bonus-bite", equipped: true, properties: new Set() },
    activities: [{ id: "bonusBiteAtk0001", type: "attack", activation: "bonus" }] },
] });
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const ftok = makeToken(fig, { id: "tokFighter000001" });
const gtok = makeToken(gob, { id: "tokGoblin0000001", x: 1, disposition: -1 });
const combat = makeCombat({ id: "c1", entries: [{ id: "cb1", actor: fig, token: ftok }, { id: "cb2", actor: gob, token: gtok }] });

await import("../combat.mjs");
await import("../hud.mjs");
const seq = await import("../sequence.mjs");
F.fire("init");
F.fire("setup");

const act = (actor, itemId, actId) => {
  const item = actor.items.get(itemId);
  return actId ? item.system.activities.get(actId) : [...item.system.activities.values()][0];
};
const compact = t => t && ({
  key: t.key, swings: t.attackAction?.swings, weapons: t.attackAction?.weapons, crit: t.attackAction?.crit, critWeapon: t.attackAction?.critWeapon,
  kill: t.attackAction?.kill, killWeapon: t.attackAction?.killWeapon, nick: t.nick, bonusUsed: t.bonusUsed, followUps: t.followUps,
  otherActions: t.otherActions, surges: t.surges, quickened: t.quickened,
});
const reset = (...actors) => { for (const a of actors) delete a.flags[MODULE]; F.game.user.targets.clear(); };
const events = calls => calls.filter(c => c.op === "Hooks.callAll" && c.name.startsWith("pentarynCombat.")).map(c => c.name.slice(15));

/** One attack roll as dnd5e makes it: preRollAttackV2 (sync), then postRollAttack (async handler). */
async function roll(actor, activity, { attackMode = null, crit = false, tagged = null, targets = [] } = {}) {
  if (tagged) seq.expectRoll(activity.uuid, tagged);
  F.Hooks.call("dnd5e.preRollAttackV2", { subject: activity, attackMode }, {}, { data: {} });
  const msg = { system: { targets: targets.map(t => ({ actor: t.actor.uuid })) } };
  const r = { isCritical: crit, options: { attackMode }, parent: msg };
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postRollAttack", [r], { subject: activity });
  await drain();
  return F.calls.splice(0);
}

test("attack-roll truth table: kind × tagged × attack mode (golden/counting-rolls.json)", async () => {
  const rows = [];
  const cases = [
    ["main, untagged", fig, "longsword0000001", {}],
    ["main, tagged by the sequence", fig, "longsword0000001", { tagged: "main" }],
    ["offhand mode, untagged", fig, "dagger0000000001", { attackMode: "offhand" }],
    ["offhand, tagged (sequence)", fig, "dagger0000000001", { attackMode: "offhand", tagged: "offhand" }],
    ["nick, tagged", fig, "dagger0000000001", { attackMode: "offhand", tagged: "nick" }],
    ["bonus-activation weapon", fig, "bonusBite0000001", {}],
    ["bonus, tagged (Flurry strike)", fig, "longsword0000001", { tagged: "bonus" }],
    ["reaction, tagged (Opportunity Attack)", fig, "longsword0000001", { tagged: "reaction" }],
    ["crit with a melee weapon", fig, "longsword0000001", { crit: true }],
    ["crit with a ranged weapon (no Hew)", fig, "shortbow00000001", { crit: true }],
    ["crit with a thrown attack mode", fig, "handaxe000000001", { crit: true, attackMode: "thrown" }],
    ["spell attack (Fire Bolt): never a swing", fig, "fireBolt00000001", {}],
  ];
  for (const [label, actor, itemId, opts] of cases) {
    reset(actor);
    const calls = await roll(actor, act(actor, itemId), opts);
    rows.push({ label, turn: compact(actor.flags[MODULE]?.turn ?? null), events: events(calls), dnd5eLast: F.plain(actor.items.get(itemId).flags.dnd5e ?? null) });
    delete actor.items.get(itemId).flags.dnd5e;
  }
  pinJSON("counting-rolls", rows, import.meta.url);
  assert.equal(rows[0].turn.swings, 1);
  assert.deepEqual(rows[2].events, ["offhand", "bonusSpent"]);
  assert.equal(rows[11].turn, null);
});

test("off your turn in combat an untagged swing is a reaction: nothing to record, no write, no event", async () => {
  setTurn(combat, { turn: 1 });
  reset(fig);
  try {
    const calls = await roll(fig, act(fig, "longsword0000001"));
    assert.equal(fig.flags[MODULE]?.turn, undefined);
    assert.deepEqual(calls.filter(c => c.op === "update"), []);
    assert.deepEqual(events(calls), []);
  } finally {
    setTurn(combat, { turn: 0 });
  }
});

test("a creature hit this turn dropping to 0 HP is a kill for Hew; a later turn's drop is not", async () => {
  reset(fig);
  await roll(fig, act(fig, "longsword0000001"), { targets: [gtok] });
  F.Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 3 } } } });
  await drain();
  assert.equal(fig.flags[MODULE].turn.attackAction.kill, false, "3 HP is no kill");
  F.Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 0 } } } });
  await drain();
  assert.deepEqual([fig.flags[MODULE].turn.attackAction.kill, fig.flags[MODULE].turn.attackAction.killWeapon], [true, "longsword0000001"]);
  reset(fig);
  await roll(fig, act(fig, "longsword0000001"), { targets: [gtok] });
  setTurn(combat, { round: 2 });
  F.Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 0 } } } });
  await drain();
  assert.equal(fig.flags[MODULE].turn.attackAction.kill, false, "the attacker's turn key moved on");
  setTurn(combat, { round: 3 });
  reset(fig);
  await roll(fig, act(fig, "shortbow00000001"), { targets: [gtok] });
  F.Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 0 } } } });
  await drain();
  assert.equal(fig.flags[MODULE].turn.attackAction.kill, false, "a ranged swing is never remembered (round 1's melee hit is another turn)");
  setTurn(combat, { round: 1 });
  reset(fig);
  await roll(fig, act(fig, "shortbow00000001"), { targets: [gtok] });
  F.Hooks.callAll("updateActor", gob, { system: { attributes: { hp: { value: 0 } } } });
  await drain();
  assert.deepEqual([fig.flags[MODULE].turn.attackAction.kill, fig.flags[MODULE].turn.attackAction.killWeapon], [true, "longsword0000001"],
    "same turn key: the earlier melee hit on that creature still counts (module memory outlives the flag)");
});

/** One activity use as dnd5e reports it. */
async function use(actor, activity, usage = {}, results = { templates: [] }) {
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postUseActivity", activity, usage, results);
  await drain();
  return F.calls.splice(0);
}

test("activity-use table: surge, quickened, reaction, bonus, other actions (golden/counting-uses.json)", async () => {
  const rows = [];
  const cases = [
    ["Action Surge on your turn", "actionSurge00001"],
    ["Quickened Spell", "quickened0000001"],
    ["Fire Bolt after Quickened Spell: the Bonus Action", "fireBolt00000001", null, { keep: true }],
    ["Magic Missile after Quickened Spell", "magicMissile0001", null, { keep: true, prime: "quickened0000001" }],
    ["Shield (a reaction)", "shield0000000001"],
    ["Second Wind (a bonus feature)", "secondWind000001"],
    ["Magic Missile (another Action)", "magicMissile0001"],
    ["Fire Bolt (a spell attack Action)", "fireBolt00000001"],
    ["Longsword attack activity (counted on the roll)", "longsword0000001"],
    ["Grapple (Unarmed Strike's save): one swing", "unarmedStrike001", "grappleSave00001"],
    ["Multiattack by name", "multiattack00001", null, { actor: gob }],
    ["Fireball whose placement was cancelled (aoe refunds it)", "fireball00000001", null, { usage: { create: { measuredTemplate: true } }, results: { templates: [] } }],
    ["Fireball placed", "fireball00000001", null, { usage: { create: { measuredTemplate: true } }, results: { templates: [{}] } }],
  ];
  for (const [label, itemId, actId, o = {}] of cases) {
    const actor = o.actor ?? fig;
    if (!o.keep) reset(actor);
    if (o.prime) { reset(actor); await use(actor, act(actor, o.prime)); }
    if (label.startsWith("Fire Bolt after")) { reset(actor); await use(actor, act(actor, "quickened0000001")); }
    if (actor === gob) setTurn(combat, { turn: 1 });
    const activity = actId ? act(actor, itemId, actId) : act(actor, itemId);
    const calls = await use(actor, activity, o.usage ?? {}, o.results ?? { templates: [] });
    if (actor === gob) setTurn(combat, { turn: 0 });
    rows.push({
      label, turn: compact(actor.flags[MODULE]?.turn ?? null), reaction: F.plain(actor.flags[MODULE]?.reaction ?? null),
      events: events(calls), notes: calls.filter(c => c.op === "notify").map(c => c.message),
    });
  }
  pinJSON("counting-uses", rows, import.meta.url);
  assert.equal(rows[0].turn.surges, 1);
  assert.deepEqual(rows[4].events, ["reaction"]);
  assert.equal(rows[11].turn, null, "cancelled area: nothing counted");
});

test("activity uses off your turn / out of combat / with the settings off", async () => {
  const rows = [];
  const run = async (label, itemId, before = () => {}, after = () => {}) => {
    reset(fig);
    before();
    const calls = await use(fig, act(fig, itemId));
    after();
    rows.push({ label, turn: compact(fig.flags[MODULE]?.turn ?? null), reaction: F.plain(fig.flags[MODULE]?.reaction ?? null), events: events(calls) });
  };
  const offTurn = [() => setTurn(combat, { turn: 1 }), () => setTurn(combat, { turn: 0 })];
  const noCombat = [() => { combat.started = false; }, () => { combat.started = true; }];
  const setOff = key => [() => F.game.settings.set(MODULE, key, false), () => F.game.settings.set(MODULE, key, true)];
  await run("Shield off your turn: still the Reaction", "shield0000000001", ...offTurn);
  await run("Shield out of combat", "shield0000000001", ...noCombat);
  await run("Shield, spellPips off", "shield0000000001", ...setOff("spellPips"));
  await run("Second Wind off your turn", "secondWind000001", ...offTurn);
  await run("Second Wind, bonusPip off", "secondWind000001", ...setOff("bonusPip"));
  await run("Magic Missile out of combat", "magicMissile0001", ...noCombat);
  await run("Action Surge off your turn", "actionSurge00001", ...offTurn);
  await run("Quickened Spell, setting off", "quickened0000001", ...setOff("quickenedSpell"));
  pinJSON("counting-uses-gated", rows, import.meta.url);
  assert.ok(rows.every(r => r.label.startsWith("Shield off your turn") || r.turn === null));
});

test("a weapon's damage roll: Two-Weapon Fighting and Great Weapon Master parts (golden/counting-damage.json)", async () => {
  const gwm = slayer();
  const stok = makeToken(gwm, { id: "tokSlayer0000001", x: 3 });
  combat.combatants.set("cb3", { id: "cb3", actor: gwm, token: stok.document });
  const rows = [];
  const dmg = (actor, itemId, { attackMode = null, mod = 3, tagged = null } = {}) => {
    const a = act(actor, itemId);
    if (tagged) seq.expectRoll(a.uuid, tagged);
    F.Hooks.call("dnd5e.preRollAttackV2", { subject: a, attackMode }, {}, { data: {} });   // lastTag, as dnd5e's order has it
    const config = { subject: a, attackMode, rolls: [{ parts: ["1d8", "@mod"], data: { mod }, options: {} }] };
    F.Hooks.call("dnd5e.preRollDamageV2", config, {}, { data: {} });
    return config.rolls[0].parts;
  };
  rows.push(["TWF off-hand Dagger", dmg(fig, "dagger0000000001", { attackMode: "offhand" })]);
  rows.push(["TWF off-hand Dagger, mod 0", dmg(fig, "dagger0000000001", { attackMode: "offhand", mod: 0 })]);
  rows.push(["TWF main Longsword", dmg(fig, "longsword0000001")]);
  combat.turn = 2;
  rows.push(["GWM Glaive main, own turn", dmg(gwm, "glaive0000000001")]);
  rows.push(["GWM Glaive tagged bonus (Pole Strike)", dmg(gwm, "glaive0000000001", { tagged: "bonus" })]);
  rows.push(["GWM Glaive tagged nick", dmg(gwm, "glaive0000000001", { tagged: "nick" })]);
  combat.turn = 0;
  rows.push(["GWM Glaive off its turn (reaction)", dmg(gwm, "glaive0000000001")]);
  await F.game.settings.set(MODULE, "weaponBonuses", false);
  rows.push(["weaponBonuses off", dmg(fig, "dagger0000000001", { attackMode: "offhand" })]);
  await F.game.settings.set(MODULE, "weaponBonuses", true);
  const spell = { subject: act(fig, "fireBolt00000001"), rolls: [{ parts: ["1d10"], data: {} }] };
  F.Hooks.call("dnd5e.preRollDamageV2", spell, {}, { data: {} });
  rows.push(["a spell's damage: untouched", spell.rolls[0].parts]);
  pinJSON("counting-damage", rows, import.meta.url);
  assert.deepEqual(rows[0][1], ["1d8", "@mod", "@mod"]);
  assert.deepEqual(rows[3][1], ["1d8", "@mod", "@prof"]);
  combat.combatants.delete("cb3");
  F.calls.length = 0;
});

test("off-hand mode reset: after an off-hand roll the remembered mode goes back to the first main mode", async () => {
  reset(fig);
  const axe = fig.items.get("handaxe000000001");
  const a = act(fig, "handaxe000000001");
  await roll(fig, a, { attackMode: "offhand" });
  assert.equal(axe.flags.dnd5e.last[a.id].attackMode, "oneHanded");
  delete axe.flags.dnd5e;
  await roll(fig, a, { attackMode: "thrown-offhand" });
  assert.equal(axe.flags.dnd5e.last[a.id].attackMode, "oneHanded", "thrown-offhand ends with offhand");
  delete axe.flags.dnd5e;
  await roll(fig, a, { attackMode: "thrown" });
  assert.equal(axe.flags.dnd5e, undefined, "a main mode is left alone");
  const dagger = fig.items.get("dagger0000000001");
  await roll(fig, act(fig, "dagger0000000001"), { attackMode: "offhand" });
  assert.equal(dagger.flags.dnd5e, undefined, "no attackModes on the item: nothing to go back to");
  await F.game.settings.set(MODULE, "offhandModeReset", false);
  await roll(fig, a, { attackMode: "offhand" });
  assert.equal(axe.flags.dnd5e, undefined, "setting off");
  await F.game.settings.set(MODULE, "offhandModeReset", true);
  const off = await import("../offhand.mjs");
  assert.equal(await off.resetOffhandMode(a, null), false);
  assert.equal(await off.resetOffhandMode({ id: "x", item: null }, "offhand"), false, "no item");
  fig.isOwner = false;
  assert.equal(await off.resetOffhandMode(a, "offhand"), false, "not the owner");
  fig.isOwner = true;
  assert.equal(await off.resetOffhandMode(a, "offhand"), true);
  delete axe.flags.dnd5e;
  F.calls.length = 0;
});

test("forced failures: the console texts (golden/counting-console.json)", async () => {
  lines.length = 0;
  const boom = () => { throw new Error("boom"); };
  // preRollAttackV2: combat's tag and riders' turn stamp both read config.subject
  F.Hooks.call("dnd5e.preRollAttackV2", { get subject() { return boom(); } }, {}, { data: {} });
  // postRollAttack: a rejection inside the async counter
  const a = act(fig, "longsword0000001");
  F.Hooks.callAll("dnd5e.postRollAttack", [{ get options() { return boom(); }, isCritical: false }], { subject: a });
  // postUseActivity: the item getter throws inside the async counter
  F.Hooks.callAll("dnd5e.postUseActivity", { actor: fig, get item() { return boom(); }, activation: { type: "action" } }, {}, {});
  // preRollDamageV2: combat's weapon bonus and riders' auto rider read config.subject
  F.Hooks.call("dnd5e.preRollDamageV2", { get subject() { return boom(); }, rolls: [] }, {}, { data: {} });
  // the off-hand mode reset rejects (the item's setFlag fails)
  const axe = fig.items.get("handaxe000000001");
  const setFlag = axe.setFlag;
  axe.setFlag = async () => { throw new Error("no permission"); };
  F.Hooks.callAll("dnd5e.postRollAttack", [{ isCritical: false, options: { attackMode: "offhand" }, parent: null }], { subject: act(fig, "handaxe000000001") });
  await drain();
  axe.setFlag = setFlag;
  // the turn flag write fails
  const update = fig.update;
  fig.update = async () => { throw new Error("write refused"); };
  reset(fig);
  await roll(fig, a);
  fig.update = update;
  pinJSON("counting-console", lines.splice(0), import.meta.url);
});

test("fixFeats: report only; apply is refused with the reason", async () => {
  const api = await import("../combat.mjs");
  assert.equal(api.attackActivityOf(fig.items.get("longsword0000001")).id, "longsword0000001", "the dead re-export still answers");
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  const { fixFeats } = F.game.pentaryn.combat;
  const rows = [fixFeats(fig), fixFeats(fig, { apply: true }), fixFeats(slayer({ id: "slayer0000000002" })), fixFeats(rogue()), fixFeats(null)];
  pinJSON("fix-feats", rows, import.meta.url);
  assert.equal(rows[1].applied, false);
});

test("legacy oracle: weaponLike (combat.mjs) and isWeaponAttack (riders.mjs) agree on the 60-case table", () => {
  const rows = [];
  for (const type of ["attack", "save", "damage"]) {
    for (const classification of ["weapon", "unarmed", "spell", null]) {
      for (const itemType of ["weapon", "spell", "feat", "consumable", undefined]) {
        const a = { type, attack: { type: { classification } }, item: itemType ? { type: itemType } : undefined };
        rows.push({ type, classification, itemType: itemType ?? null, weaponLike: legacy.weaponLike(a), isWeaponAttack: legacy.isWeaponAttack(a) });
      }
    }
  }
  rows.push({ type: null, weaponLike: legacy.weaponLike(null), isWeaponAttack: legacy.isWeaponAttack(null) });
  assert.equal(rows.length, 61);
  for (const r of rows) assert.equal(r.weaponLike, r.isWeaponAttack, JSON.stringify(r));
  pinJSON("weapon-like", rows, import.meta.url);
  assert.equal(legacy.weaponLike({ type: "attack", attack: { type: { classification: null } }, item: { type: "weapon" } }), true);
  assert.equal(legacy.weaponLike({ type: "attack", attack: { type: { classification: "spell" } }, item: { type: "weapon" } }), false);
});
