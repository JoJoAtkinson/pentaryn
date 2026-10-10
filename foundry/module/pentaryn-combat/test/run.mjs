#!/usr/bin/env node
/**
 * Fixtures for combat-core.mjs. No dependencies — `node test/run.mjs`.
 *
 * Nothing Foundry is stubbed: importing the core bare is itself the proof that it stays pure.
 * The Multiattack strings are the shapes this world's stat blocks use (2024 MM links, homebrew
 * "in any combination", the summon-spirit formula), with synthetic ids.
 */

const core = await import("../combat-core.mjs");
const {
  normalizeName, slugify, featureSet, attackCount, canSwing, offhandCapable, nickCapable, extraSwings, defaultWeapon,
  mainMode, planSequence, sequenceReducer, stripNumbers, turnKey, freshTurn, readTurn, classifySwing, recordSwing,
  recordFollowUp, recordKill, recordOtherAction, recordSurge, attackActions, otherActionsOf, setRider, swingsLeft, pipState,
  followUps, poleStrikeOpen,
  TURN_RIDERS, riderByKey, ridersFor, riderEligibility, riderDice, damageBonuses, parseMultiattack, multiattackPlan,
  overridePlan, weaponSetSeed, shouldSeed, hintCodes, pickCombat,
  tidyDiceCount, recklessChanges, isRecklessEffect, RECKLESS_CHANGE
} = core;

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const ok = (name, cond) => check(name, !!cond, true);

/* ── weapons used across the fixtures ─────────────────────────────────────── */

const W = (id, o = {}) => ({ id, name: id, equipped: true, melee: true, ranged: false, light: false, heavy: false,
  twoHanded: false, finesse: false, reach: false, thrown: false, versatile: false, mastery: null, hasMastery: false,
  baseItem: id, activation: "action", attackActivity: `${id}-atk`, natural: false, unarmed: false, uuid: `Actor.x.Item.${id}`, ...o });
const longsword = W("longsword", { versatile: true, mastery: "sap", hasMastery: true });
const shortsword = W("shortsword", { light: true, finesse: true, mastery: "vex", hasMastery: true });
const dagger = W("dagger", { light: true, finesse: true, thrown: true, mastery: "nick", hasMastery: true });
const scimitar = W("scimitar", { light: true, finesse: true, mastery: "nick", hasMastery: true });
const scimitarNoMastery = W("scimitar2", { light: true, finesse: true, mastery: "nick", hasMastery: false });
const greatsword = W("greatsword", { heavy: true, twoHanded: true, mastery: "graze", hasMastery: true });
const glaive = W("glaive", { heavy: true, twoHanded: true, reach: true });
const quarterstaff = W("quarterstaff", { versatile: true });
const rapier = W("rapier", { finesse: true });
const shortbow = W("shortbow", { melee: false, ranged: true, twoHanded: true });
const unarmed = W("unarmed", { unarmed: true, finesse: true, equipped: false, baseItem: "" });
const stowed = W("stowed", { equipped: false });
const bonusWeapon = W("bonusbite", { activation: "bonus" });

/* ── names ────────────────────────────────────────────────────────────────── */

check("1 normalizeName paren", normalizeName("Extra Attack (Fighter)"), "extra attack");
check("2 normalizeName curly", normalizeName("Monk’s  Focus"), "monk's focus");
check("3 slugify", slugify("Great Weapon Master"), "great-weapon-master");
check("4 slugify apostrophe", slugify("Monk's Focus"), "monks-focus");
check("5 featureSet identifier + name", [...featureSet([{ identifier: "extra-attack", name: "Extra Attack" }, { name: "Two-Weapon Fighting" }])],
  ["extra-attack", "two-weapon-fighting"]);

/* ── attack counts by class and level ─────────────────────────────────────── */

check("10 no feature → 1", attackCount({ features: [] }), 1);
check("11 Fighter 5 → 2", attackCount({ features: ["extra-attack"] }), 2);
check("12 Fighter 11 → 3", attackCount({ features: ["extra-attack", "two-extra-attacks"] }), 3);
check("13 Fighter 20 → 4", attackCount({ features: ["extra-attack", "two-extra-attacks", "three-extra-attacks"] }), 4);
check("14 Barbarian 5 + Fighter 5 multiclass → still 2 (not summed)", attackCount({ features: new Set(["extra-attack"]) }), 2);
check("15 override wins", attackCount({ features: ["extra-attack"], override: 5 }), 5);
check("16 override 0 ignored", attackCount({ features: ["extra-attack"], override: 0 }), 2);
check("17 Thirsting Blade, pact weapon", attackCount({ features: ["thirsting-blade"] }, { pactWeapon: true }), 2);
check("18 Thirsting Blade, CHA weapon", attackCount({ features: ["thirsting-blade"] }, { ability: "cha" }), 2);
check("19 Thirsting Blade, other weapon", attackCount({ features: ["thirsting-blade"] }, { ability: "str" }), 1);
check("20 Rogue 5 → 1", attackCount({ features: ["sneak-attack", "uncanny-dodge"] }), 1);
check("21 Monk 5 → 2", attackCount({ features: ["extra-attack", "martial-arts"] }), 2);
check("22 NPC multiattack total", attackCount({ features: [], multiattack: { total: 3 } }), 3);
check("23 Wizard → 1", attackCount({ features: ["arcane-recovery"] }), 1);
check("24 Bladesinger extra attack (by name slug)", attackCount({ features: featureSet([{ name: "Extra Attack" }]) }), 2);
check("25 Loading (Heavy Crossbow): one shot per Attack action even with Extra Attack", attackCount({ features: ["extra-attack"] }, { loading: true }), 1);
check("26 Loading + Crossbow Expert: Extra Attack applies", attackCount({ features: ["extra-attack", "crossbow-expert"] }, { loading: true }), 2);

/* ── weapons, off-hand, Nick ──────────────────────────────────────────────── */

ok("30 longsword swings", canSwing(longsword));
ok("31 stowed can't", !canSwing(stowed));
ok("32 unarmed always can", canSwing(unarmed));
ok("33 bonus-action weapon not in Attack action", !canSwing(bonusWeapon));
ok("34 shortsword off-hand capable", offhandCapable(shortsword));
ok("35 longsword not without Dual Wielder", !offhandCapable(longsword));
ok("36 longsword with Dual Wielder", offhandCapable(longsword, { enhancedDualWielding: true }));
ok("37 greatsword never (two-handed)", !offhandCapable(greatsword, { enhancedDualWielding: true }));
ok("38 scimitar nick capable", nickCapable(scimitar));
ok("39 nick without mastery = no", !nickCapable(scimitarNoMastery));
check("40 extra swing: shortsword main + scimitar nick", extraSwings({ main: shortsword, weapons: [shortsword, scimitar] }),
  [{ weaponId: "scimitar", mode: "offhand", kind: "nick" }]);
check("41 no extra: longsword main isn't Light", extraSwings({ main: longsword, weapons: [longsword, scimitar] }), []);
check("42 no extra: Nick used this turn", extraSwings({ main: shortsword, weapons: [shortsword, scimitar], turn: { nick: true } }), []);
check("43 no extra: same weapon only", extraSwings({ main: scimitar, weapons: [scimitar] }), []);
check("44 default weapon remembered", defaultWeapon({ weapons: [longsword, shortsword], remembered: "shortsword" }), "shortsword");
check("45 default weapon set primary", defaultWeapon({ weapons: [shortbow, longsword], setPrimary: "shortbow" }), "shortbow");
check("46 default weapon first melee", defaultWeapon({ weapons: [shortbow, longsword] }), "longsword");
check("47 default weapon stale memory", defaultWeapon({ weapons: [longsword], remembered: "gone" }), "longsword");
check("48 mainMode skips offhand", mainMode([{ value: "offhand" }, { value: "oneHanded" }]), "oneHanded");
check("49 mainMode string list", mainMode(["oneHanded", "twoHanded", "offhand"]), "oneHanded");

/* ── spells, cantrips and consumables are not weapons (live: Caven, Marrith, Talo) ─ */

const fireBolt = W("firebolt", { melee: false, ranged: true, isWeapon: false, weaponLike: false, equipped: true, baseItem: "" });
const vampTouch = W("vamptouch", { isWeapon: false, weaponLike: false, equipped: true, baseItem: "" });
const torch = W("torch", { isWeapon: false, weaponLike: false, equipped: true, baseItem: "" });
const npcSlam = W("slam", { isWeapon: false, weaponLike: true, equipped: true, baseItem: "" });
const realUnarmed = W("unarmed2", { unarmed: true, isWeapon: true, weaponLike: true, equipped: false, baseItem: "" });
ok("40a spell attack can't be a Full Attack weapon", !canSwing(fireBolt) && !canSwing(vampTouch));
ok("40b Torch (consumable) can't", !canSwing(torch));
ok("40c NPC attack feature (Slam) can", canSwing(npcSlam));
check("40d default weapon skips a melee spell listed first", defaultWeapon({ weapons: [vampTouch, fireBolt, dagger] }), "dagger");
ok("40e Dual Wielder never offers Unarmed Strike as the off-hand weapon", !offhandCapable(realUnarmed, { enhancedDualWielding: true }));
ok("40f Dual Wielder never offers a melee spell", !offhandCapable(vampTouch, { enhancedDualWielding: true }));

/* ── sequence planning ────────────────────────────────────────────────────── */

check("50 plan Fighter 5", planSequence({ weaponId: "longsword", count: 2 }),
  [{ weaponId: "longsword", mode: null, kind: "main" }, { weaponId: "longsword", mode: null, kind: "main" }]);
check("51 plan one already swung (A4)", planSequence({ weaponId: "longsword", count: 2, done: 1 }).length, 1);
check("52 plan Nick appended", planSequence({ weaponId: "shortsword", count: 2, extras: [{ weaponId: "scimitar", mode: "offhand", kind: "nick" }] }).map(s => s.kind),
  ["main", "main", "nick"]);
check("53 plan multiattack Bite+Claw", planSequence({ multiattack: [{ itemId: "bite", count: 1 }, { itemId: "claw", count: 1 }] }).map(s => s.weaponId),
  ["bite", "claw"]);
check("54 plan no weapon", planSequence({ count: 2 }), []);
check("55 plan done ≥ count", planSequence({ weaponId: "x", count: 2, done: 3 }), []);

/* ── the state machine ────────────────────────────────────────────────────── */

let s = sequenceReducer(null, { type: "start", swings: planSequence({ weaponId: "longsword", count: 3 }) });
check("60 start running", [s.status, s.index], ["running", 0]);
check("61 strip numbers", stripNumbers(s), { current: 1, total: 3, left: 3 });
s = sequenceReducer(s, { type: "rolled", crit: true });
check("62 rolled → index 1", [s.status, s.index, s.swings[0].result, s.swings[0].crit], ["running", 1, "rolled", true]);
s = sequenceReducer(s, { type: "cancel" });
check("63 cancel pauses", s.status, "paused");
check("64 rolled ignored while paused", sequenceReducer(s, { type: "rolled" }).index, 1);
s = sequenceReducer(s, { type: "swap", weaponId: "shortsword" });
check("65 swap changes only remaining main swings", s.swings.map(x => x.weaponId), ["longsword", "shortsword", "shortsword"]);
s = sequenceReducer(s, { type: "adv", value: "advantage" });
check("66 adv toggle on", s.adv, "advantage");
check("67 adv toggle same → off", sequenceReducer(s, { type: "adv", value: "advantage" }).adv, null);
check("68 adv garbage → null", sequenceReducer(s, { type: "adv", value: "maybe" }).adv, null);
s = sequenceReducer(s, { type: "resume" });
check("69 resume running", s.status, "running");
s = sequenceReducer(s, { type: "rolled" });
check("70 adv resets after a swing", s.adv, null);
s = sequenceReducer(s, { type: "rolled" });
check("71 last swing → done", [s.status, s.rolled], ["done", 3]);
check("72 stop after done is a no-op", sequenceReducer(s, { type: "stop" }).status, "done");
let s2 = sequenceReducer(null, { type: "start", swings: planSequence({ weaponId: "x", count: 2 }) });
s2 = sequenceReducer(s2, { type: "rolled" });
s2 = sequenceReducer(s2, { type: "stop" });
check("73 stop mid-way keeps rolled count", [s2.status, s2.rolled], ["stopped", 1]);
check("74 start empty → done", sequenceReducer(null, { type: "start", swings: [] }).status, "done");
check("75 swap keeps nick swing", (() => {
  let x = sequenceReducer(null, { type: "start", swings: planSequence({ weaponId: "shortsword", count: 1, extras: [{ weaponId: "scimitar" }] }) });
  x = sequenceReducer(x, { type: "swap", weaponId: "dagger" });
  return x.swings.map(y => y.weaponId);
})(), ["dagger", "scimitar"]);
check("76 unknown action → same state", sequenceReducer(s2, { type: "nope" }) === s2, true);

/* ── turn flag ────────────────────────────────────────────────────────────── */

check("80 turnKey in combat", turnKey({ combatId: "C1", round: 2, turn: 3, inCombat: true }), "C1:2:3");
check("81 turnKey out of combat", turnKey({ combatId: "C1", round: 2, turn: 3, inCombat: false }), "nocombat");
const K = "C1:2:3";
check("82 readTurn stale key → fresh", readTurn({ key: "C1:1:3", attackAction: { swings: 2 } }, K).attackAction.swings, 0);
check("83 readTurn garbled → fresh", readTurn("junk", K).key, K);
check("84 readTurn same key keeps", readTurn({ key: K, attackAction: { swings: 1 } }, K).attackAction.swings, 1);
check("85 classify own-turn action", classifySwing({ activation: "action", inCombat: true }), "main");
check("86 classify off-turn = reaction (opportunity attack)", classifySwing({ activation: "action", inCombat: true, isOwnTurn: false }), "reaction");
check("87 classify offhand mode", classifySwing({ activation: "action", attackMode: "offhand", inCombat: true }), "offhand");
check("88 classify thrown-offhand", classifySwing({ attackMode: "thrown-offhand" }), "offhand");
check("89 classify tagged wins", classifySwing({ tagged: "nick", attackMode: "offhand" }), "nick");
check("90 classify bonus activation (Pole Strike)", classifySwing({ activation: "bonus", inCombat: true }), "bonus");
check("91 classify out of combat", classifySwing({ activation: "action", isOwnTurn: false, inCombat: false }), "main");
let t = freshTurn(K);
t = recordSwing(t, { kind: "main", weaponId: "longsword" });
t = recordSwing(t, { kind: "main", weaponId: "longsword", crit: true });
check("92 two main swings", [t.attackAction.swings, t.attackAction.weapons, t.attackAction.crit, t.attackAction.critWeapon],
  [2, ["longsword"], true, "longsword"]);
t = recordSwing(t, { kind: "nick", weaponId: "scimitar" });
check("93 nick doesn't spend a swing, marks nick", [t.attackAction.swings, t.nick, t.bonusUsed], [2, true, false]);
t = recordSwing(freshTurn(K), { kind: "offhand", weaponId: "dagger" });
check("94 offhand spends Bonus", [t.bonusUsed, t.followUps, t.attackAction.swings], [true, ["offhand"], 0]);
check("95 reaction crit not counted for Hew", recordSwing(freshTurn(K), { kind: "reaction", crit: true }).attackAction.crit, false);
check("96 ranged crit not counted for Hew", recordSwing(freshTurn(K), { kind: "main", crit: true, melee: false }).attackAction.crit, false);
check("97 recordKill", recordKill(freshTurn(K), "greatsword").attackAction, { weapons: [], swings: 0, crit: false, critWeapon: null, kill: true, killWeapon: "greatsword" });
check("98 recordFollowUp", recordFollowUp(freshTurn(K), "flurry").followUps, ["flurry"]);
check("99 recordFollowUp idempotent", recordFollowUp(recordFollowUp(freshTurn(K), "hew"), "hew").followUps, ["hew"]);
check("100 setRider + undo", setRider(setRider(freshTurn(K), "sneak-attack", "used"), "sneak-attack", null).riders, {});
check("101 rider used", setRider(freshTurn(K), "sneak-attack", "used").riders, { "sneak-attack": "used" });
ok("102 freshTurn objects are independent", freshTurn(K).attackAction !== freshTurn(K).attackAction);

/* ── pips and swings left ─────────────────────────────────────────────────── */

check("110 pips out of combat → none", pipState({ count: 2, inCombat: false }), { max: null, current: null });
check("111 pips fresh turn 2/2", pipState({ count: 2, turn: freshTurn(K), inCombat: true }), { max: 2, current: 2 });
check("112 pips after one swing 1/2", pipState({ count: 2, turn: recordSwing(freshTurn(K), { kind: "main" }), inCombat: true }), { max: 2, current: 1 });
check("113 pips after three of two → 0", pipState({ count: 2, turn: { ...freshTurn(K), attackAction: { swings: 3 } }, inCombat: true }).current, 0);
check("114 other action zeroes the swings", pipState({ count: 3, turn: recordOtherAction(freshTurn(K)), inCombat: true }), { max: 3, current: 0 });
check("115 offhand leaves Action pips alone", pipState({ count: 2, turn: recordSwing(freshTurn(K), { kind: "offhand" }), inCombat: true }).current, 2);
check("116 swingsLeft out of combat never spent", swingsLeft(2, recordSwing(freshTurn("nocombat"), { kind: "main" }), { inCombat: false }), 2);

/* ── Action Surge (2024: one additional action, except Magic) ─────────────── */

const surged = recordSurge(after2(freshTurn(K)));
function after2(t) { return recordSwing(recordSwing(t, { kind: "main", weaponId: "longsword" }), { kind: "main", weaponId: "longsword" }); }
check("117 Fighter 5 after 2 swings: 0 left", swingsLeft(2, after2(freshTurn(K)), { inCombat: true }), 0);
check("118 …Action Surge: 2 more", swingsLeft(2, surged, { inCombat: true }), 2);
check("119 …pips widen to 4, 2 lit", pipState({ count: 2, turn: surged, inCombat: true }), { max: 4, current: 2 });
check("119a Dash (item) then Surge then Attack: a full Attack action", swingsLeft(2, recordSurge(recordOtherAction(freshTurn(K))), { inCombat: true }), 2);
check("119b one swing, Surge, Dash: the first Attack action's last swing stays", swingsLeft(2, recordOtherAction(recordSurge(recordSwing(freshTurn(K), { kind: "main" }))), { inCombat: true }), 1);
check("119c older flag otherAction:true reads as one action", [otherActionsOf({ otherAction: true }), attackActions({ otherAction: true })], [1, 0]);
check("119d two other actions without a surge never go negative", swingsLeft(2, recordOtherAction(recordOtherAction(freshTurn(K))), { inCombat: true }), 0);

/* ── follow-ups (bonus-action tracking) ───────────────────────────────────── */

const after = (...ws) => ws.reduce((x, w) => recordSwing(x, { kind: "main", weaponId: w }), freshTurn(K));
check("120 nothing before the Attack action", followUps({ turn: freshTurn(K), weapons: [shortsword, dagger] }), []);
check("121 off-hand after a Light swing (A7 shape, Light pair)", followUps({ turn: after("shortsword"), weapons: [shortsword, W("hatchet", { light: true })] }),
  [{ kind: "offhand", weaponId: "hatchet" }]);
check("122 Nick weapon → free Nick instead of Bonus off-hand", followUps({ turn: after("shortsword"), weapons: [shortsword, scimitar] }),
  [{ kind: "nick", weaponId: "scimitar", free: true }]);
check("123 longsword main (not Light): no off-hand even with Dual Wielder", followUps({ turn: after("longsword"), weapons: [longsword, scimitar], enhancedDualWielding: true }), []);
check("124 Dual Wielder: Light main, longsword second", followUps({ turn: after("shortsword"), weapons: [shortsword, longsword], enhancedDualWielding: true }),
  [{ kind: "offhand", weaponId: "longsword" }]);
check("125 Bonus already used → off-hand hidden", followUps({ turn: after("shortsword"), weapons: [shortsword, W("hatchet", { light: true })], bonusFree: false }), []);
check("126 Nick is free: shown even with Bonus used", followUps({ turn: after("shortsword"), weapons: [shortsword, scimitar], bonusFree: false }).map(f => f.kind), ["nick"]);
check("127 Nick used → no follow-up", followUps({ turn: recordSwing(after("shortsword"), { kind: "nick", weaponId: "scimitar" }), weapons: [shortsword, scimitar] }), []);
check("128 off-hand used → gone", followUps({ turn: recordSwing(after("shortsword"), { kind: "offhand", weaponId: "hatchet" }), weapons: [shortsword, W("hatchet", { light: true })] }), []);
// Stacks: Handaxe x2 on one item line is two Light weapons (the Barbarian kit).
const handaxes = W("handaxe", { light: true, thrown: true, mastery: "vex", hasMastery: true, quantity: 2 });
check("128s1 stacked Handaxe x2 → off-hand with the same item", followUps({ turn: after("handaxe"), weapons: [W("greataxe", { heavy: true, twoHanded: true }), handaxes] }),
  [{ kind: "offhand", weaponId: "handaxe" }]);
check("128s2 a single Handaxe → no off-hand", followUps({ turn: after("handaxe"), weapons: [{ ...handaxes, quantity: 1 }] }), []);
check("128s3 a different Light weapon is preferred over the stack", followUps({ turn: after("handaxe"), weapons: [handaxes, W("hatchet", { light: true })] }),
  [{ kind: "offhand", weaponId: "hatchet" }]);
check("128s4 stacked Scimitar x2 with Nick → the Full Attack's Nick swing", extraSwings({ main: { ...scimitar, quantity: 2 }, weapons: [{ ...scimitar, quantity: 2 }] }),
  [{ weaponId: "scimitar", mode: "offhand", kind: "nick" }]);
check("128s5 stacked off-hand used → gone", followUps({ turn: recordSwing(after("handaxe"), { kind: "offhand", weaponId: "handaxe" }), weapons: [handaxes] }), []);
check("129 Monk: Flurry + Martial Arts (no Attack action needed in 2024)",
  followUps({ turn: freshTurn(K), weapons: [unarmed], features: ["monks-focus", "martial-arts"], focus: 2, unarmedId: "unarmed" }),
  [{ kind: "flurry", weaponId: "unarmed", count: 2 }, { kind: "martial-arts", weaponId: "unarmed", count: 1 }]);
check("130 Monk 10 Heightened Focus: 3 strikes", followUps({ turn: freshTurn(K), features: ["monks-focus", "heightened-focus"], focus: 1, unarmedId: "unarmed" })[0].count, 3);
check("131 Monk no Focus left: Martial Arts only", followUps({ turn: freshTurn(K), features: ["monks-focus", "martial-arts"], focus: 0, unarmedId: "unarmed" }).map(f => f.kind), ["martial-arts"]);
check("132 Monk after Flurry: nothing", followUps({ turn: recordFollowUp(freshTurn(K), "flurry"), features: ["monks-focus", "martial-arts"], focus: 2, unarmedId: "unarmed" }), []);
check("133 Hew after crit", followUps({ turn: recordSwing(freshTurn(K), { kind: "main", weaponId: "greatsword", crit: true }), weapons: [greatsword], features: ["great-weapon-master"] }),
  [{ kind: "hew", weaponId: "greatsword" }]);
check("134 Hew after kill", followUps({ turn: recordKill(after("greatsword"), "greatsword"), weapons: [greatsword], features: ["great-weapon-master"] }),
  [{ kind: "hew", weaponId: "greatsword" }]);
check("135 no Hew without crit/kill", followUps({ turn: after("greatsword"), weapons: [greatsword], features: ["great-weapon-master"] }), []);
check("136 no Hew without the feat", followUps({ turn: recordKill(after("greatsword"), "greatsword"), weapons: [greatsword] }), []);
check("137 nothing on someone else's turn", followUps({ turn: after("shortsword"), weapons: [shortsword, scimitar], isOwnTurn: false }), []);
ok("138 Pole Strike opens after glaive", poleStrikeOpen({ turn: after("glaive"), weapons: [glaive] }));
ok("139 Pole Strike opens after quarterstaff", poleStrikeOpen({ turn: after("quarterstaff"), weapons: [quarterstaff] }));
ok("140 Pole Strike closed after greatsword (Heavy, no Reach)", !poleStrikeOpen({ turn: after("greatsword"), weapons: [greatsword] }));
ok("141 Pole Strike closed before attacking", !poleStrikeOpen({ turn: freshTurn(K), weapons: [glaive] }));

/* ── riders: Sneak Attack eligibility ─────────────────────────────────────── */

const sneak = riderByKey("sneak-attack");
check("150 rider table keys", TURN_RIDERS.map(r => r.key), ["sneak-attack", "frenzy", "colossus-slayer", "divine-strike"]);
ok("151 table frozen", Object.isFrozen(TURN_RIDERS) && Object.isFrozen(TURN_RIDERS[0]));
check("152 ridersFor rogue", ridersFor(["sneak-attack", "expertise"]).map(r => r.key), ["sneak-attack"]);
check("153 ridersFor none", ridersFor([]), []);
check("154 rapier with advantage → offer + auto",
  riderEligibility({ rider: sneak, weapon: rapier, roll: { advantage: true } }),
  { offer: true, auto: true, checks: [{ key: "advantage", ok: true }, { key: "ally", ok: null }, { key: "noDisadvantage", ok: true }] });
check("155 rapier, ally adjacent → auto", riderEligibility({ rider: sneak, weapon: rapier, allyAdjacent: true }).auto, true);
check("156 rapier, no ally, no adv → still offered (GM arbitrates), not auto",
  [riderEligibility({ rider: sneak, weapon: rapier, allyAdjacent: false }).offer, riderEligibility({ rider: sneak, weapon: rapier, allyAdjacent: false }).auto], [true, false]);
check("157 longsword (not finesse) → no offer", riderEligibility({ rider: sneak, weapon: longsword, roll: { advantage: true } }).offer, false);
check("158 shortbow (ranged) → offer", riderEligibility({ rider: sneak, weapon: shortbow, roll: { advantage: true } }).offer, true);
check("159 thrown Handaxe is still a Melee weapon → no Sneak Attack (PHB: Finesse or Ranged weapon)",
  riderEligibility({ rider: sneak, weapon: W("handaxe", { light: true, thrown: true }), attackMode: "thrown", roll: { advantage: true } }).offer, false);
check("159b thrown Dagger qualifies by Finesse", riderEligibility({ rider: sneak, weapon: dagger, attackMode: "thrown", roll: { advantage: true } }).offer, true);
check("160 disadvantage → offered, never auto", riderEligibility({ rider: sneak, weapon: rapier, roll: { disadvantage: true }, allyAdjacent: true }).auto, false);
check("161 adv + dis cancel → ally decides", riderEligibility({ rider: sneak, weapon: rapier, roll: { advantage: true, disadvantage: true }, allyAdjacent: true }).auto, true);
check("162 used this turn → nothing", riderEligibility({ rider: sneak, weapon: rapier, roll: { advantage: true }, used: "used" }).offer, false);
check("163 hint codes", hintCodes(riderEligibility({ rider: sneak, weapon: rapier, allyAdjacent: true }).checks),
  ["advantage:no", "ally:yes", "noDisadvantage:yes"]);
const frenzy = riderByKey("frenzy");
check("164 Frenzy needs rage + reckless for auto", riderEligibility({ rider: frenzy, weapon: greatsword, ability: "str", raging: true, reckless: false }),
  { offer: true, auto: false, checks: [{ key: "raging", ok: true }, { key: "reckless", ok: false }] });
check("165 Frenzy on a DEX attack → nothing", riderEligibility({ rider: frenzy, weapon: rapier, ability: "dex", raging: true, reckless: true }).offer, false);
check("166 riderDice scale formula", riderDice(sneak, { formula: "3d6" }), "3d6");
check("167 riderDice scale number/faces", riderDice(sneak, { number: 5, faces: 6 }), "5d6");
check("168 riderDice Frenzy from rage damage", riderDice(frenzy, { value: 3 }), "3d6");
check("169 riderDice fixed", riderDice(riderByKey("colossus-slayer")), "1d8");

/* ── always-on weapon damage riders ───────────────────────────────────────── */

check("180 TWF puts @mod back on off-hand", damageBonuses({ features: ["two-weapon-fighting"], weapon: dagger, attackMode: "offhand", mod: 3 }),
  [{ key: "two-weapon-fighting", part: "@mod" }]);
check("181 TWF nothing on main hand", damageBonuses({ features: ["two-weapon-fighting"], weapon: dagger, attackMode: "oneHanded", mod: 3 }), []);
check("182 TWF negative mod: dnd5e already keeps it", damageBonuses({ features: ["two-weapon-fighting"], weapon: dagger, attackMode: "offhand", mod: -1 }), []);
check("183 no TWF → off-hand flat (A7)", damageBonuses({ features: [], weapon: dagger, attackMode: "offhand", mod: 3 }), []);
check("184 GWM +PB on Heavy, own turn", damageBonuses({ features: ["great-weapon-master"], weapon: greatsword, attackMode: "twoHanded" }),
  [{ key: "great-weapon-master", part: "@prof" }]);
check("185 GWM not on a reaction", damageBonuses({ features: ["great-weapon-master"], weapon: greatsword, isOwnTurn: false }), []);
check("186 GWM not on a Light weapon", damageBonuses({ features: ["great-weapon-master"], weapon: shortsword }), []);
check("187 GWM not on a bonus attack (Pole Strike)", damageBonuses({ features: ["great-weapon-master"], weapon: glaive, kind: "bonus" }), []);

/* ── Multiattack parsing ──────────────────────────────────────────────────── */

const items = [
  { id: "bite", name: "Bite", isAttack: true }, { id: "claw", name: "Claw", isAttack: true },
  { id: "gsword", name: "Greatsword", isAttack: true }, { id: "lbow", name: "Longbow", isAttack: true },
  { id: "constrict", name: "Constrict", isAttack: false }, { id: "slam", name: "Slam", isAttack: true },
  { id: "attach", name: "Attach", isAttack: true }, { id: "tail", name: "Tail", isAttack: true },
  { id: "spellc", name: "Spellcasting", isAttack: false }
];
const LOOK = "The [[lookup @name lowercase]]";
check("200 Brown Bear: one Bite and one Claw",
  parseMultiattack(`<p>${LOOK} makes one [[/item .bite]] attack and one [[/item .claw]] attack.</p>`, items),
  { total: 2, groups: [{ count: 1, choices: ["bite"] }, { count: 1, choices: ["claw"] }] });
check("201 two Claw attacks", parseMultiattack(`${LOOK} makes two [[/item .claw]] attacks.`, items),
  { total: 2, groups: [{ count: 2, choices: ["claw"] }] });
check("202 Watch-Captain: three attacks in any combination",
  parseMultiattack(`${LOOK} makes three attacks, using [[/item .gsword]] or [[/item .lbow]] in any combination.`, items),
  { total: 3, groups: [{ count: 3, choices: ["gsword", "lbow"] }] });
check("203 'and' in any combination", parseMultiattack(`${LOOK} makes two attacks, using [[/item .gsword]] and [[/item .lbow]] in any combination.`, items).total, 2);
check("204 two A or B attacks", parseMultiattack(`${LOOK} makes two [[/item .gsword]] or [[/item .lbow]] attacks.`, items),
  { total: 2, groups: [{ count: 2, choices: ["gsword", "lbow"] }] });
check("205 by name link", parseMultiattack(`${LOOK} makes two [[/item Claw]] attacks.`, items).groups[0].choices, ["claw"]);
check("206 one Bite and uses Constrict → 1 swing", parseMultiattack(`${LOOK} makes one [[/item .bite]] attack and uses [[/item .constrict]].`, items),
  { total: 1, groups: [{ count: 1, choices: ["bite"] }] });
check("207 one Attach and two Tail", parseMultiattack(`${LOOK} makes one [[/item Attach]] attack and two [[/item Tail]] attacks.`, items).total, 3);
check("208 bare name 'one Slam attack'", parseMultiattack(`${LOOK} makes one Slam attack and uses Pacifying Spores.`, items),
  { total: 1, groups: [{ count: 1, choices: ["slam"] }] });
check("209 'It can replace one attack' ignored",
  parseMultiattack(`${LOOK} makes three [[/item .claw]] attacks. It can replace one attack with a use of [[/item .constrict]].`, items).total, 3);
check("210 spirit formula evaluated",
  parseMultiattack("The spirit makes a number of [[/item Slam]] attacks equal to half this spell’s level (round down).[[floor(@flags.dnd5e.summon.level / 2)]]{Number of attacks}",
    items, { evalFormula: f => (f === "floor(@flags.dnd5e.summon.level / 2)" ? 2 : null) }),
  { total: 2, groups: [{ count: 2, choices: ["slam"] }], formula: "floor(@flags.dnd5e.summon.level / 2)" });
check("211 spirit formula, no link, one attack item",
  parseMultiattack("The spirit makes a number of attacks equal to half this spell’s level (round down).[[floor(@flags.dnd5e.summon.level / 2)]]{Number}",
    [{ id: "touch", name: "Deathly Touch", isAttack: true }], { evalFormula: () => 3 }).total, 3);
check("212 spirit formula unevaluable → total 0", parseMultiattack("makes a number of [[/item Slam]] attacks equal to x [[floor(@a/2)]]{n}", items).total, 0);
check("213 spell activity link ignored",
  parseMultiattack(`${LOOK} makes two [[/item .claw]] attacks, and it can use Spellcasting to cast [[/item .spellc.Activity.abc]] if available.`, items).total, 2);
check("214 unresolvable link → null", parseMultiattack(`${LOOK} makes two [[/item .nothere]] attacks.`, items), null);
check("215 no 'makes' → null", parseMultiattack("Some text without the verb.", items), null);
check("216 empty → null", parseMultiattack("", items), null);
check("217 'makes two attacks' with one attack item", parseMultiattack(`${LOOK} makes two attacks.`, [{ id: "x", name: "X", isAttack: true }]).total, 2);
check("218 'makes two attacks' ambiguous → null", parseMultiattack(`${LOOK} makes two attacks.`, items), null);
check("219 missing trailing period", parseMultiattack(`${LOOK} makes three [[/item .claw]] attacks`, items).total, 3);
check("220 label after link", parseMultiattack(`${LOOK} makes two [[/item .claw]]{Claws} attacks.`, items).total, 2);
check("221 default plan", multiattackPlan(parseMultiattack(`${LOOK} makes three attacks, using [[/item .gsword]] or [[/item .lbow]] in any combination.`, items)),
  [{ itemId: "gsword", count: 3 }]);
check("222 plan with a pick", multiattackPlan({ groups: [{ count: 2, choices: ["gsword", "lbow"] }] }, { pick: { 0: "lbow" } }), [{ itemId: "lbow", count: 2 }]);
check("222a remembered pick applies to the group that offers it (not only group 0)",
  multiattackPlan({ groups: [{ count: 1, choices: ["bite"] }, { count: 2, choices: ["claw", "tail"] }] }, { pick: { "*": "tail" } }),
  [{ itemId: "bite", count: 1 }, { itemId: "tail", count: 2 }]);
check("223 override plan", overridePlan([{ item: "bite", count: 1 }, { item: "gone", count: 2 }, { item: "claw", count: "2" }], ["bite", "claw"]),
  [{ itemId: "bite", count: 1 }, { itemId: "claw", count: 2 }]);
check("224 override garbage → null", overridePlan("x", ["bite"]), null);
check("225 'two [A] attacks or two [B] attacks' = 2 swings, a choice", parseMultiattack(`${LOOK} makes two [[/item .gsword]] attacks or two [[/item .lbow]] attacks.`, items),
  { total: 2, groups: [{ count: 2, choices: ["gsword", "lbow"] }] });
check("226 2024 MM Warrior Veteran: two [A] or [B] attacks", parseMultiattack(`${LOOK} makes two [[/item .gsword]] or [[/item .lbow]] attacks.`, items).total, 2);
check("227 Matron: 'It can replace one attack with a [B] attack' ignored", parseMultiattack(`${LOOK} makes two [[/item .claw]] attacks. It can replace one attack with a [[/item .bite]] attack.`, items).total, 2);

/* ── weapon sets ──────────────────────────────────────────────────────────── */

check("230 seed: longsword + shortsword, shortbow", weaponSetSeed([longsword, shortsword, shortbow]), {
  1: { primary: longsword.uuid, secondary: shortsword.uuid }, 2: { primary: shortbow.uuid, secondary: null }, 3: { primary: null, secondary: null }
});
check("231 seed: greatsword gets no off-hand", weaponSetSeed([greatsword, dagger])[1], { primary: greatsword.uuid, secondary: null });
check("232 seed: caster with a dagger only", weaponSetSeed([dagger])[1], { primary: dagger.uuid, secondary: null });
check("233 seed: nothing equipped → null", weaponSetSeed([stowed, unarmed]), null);
check("234 seed: ranged only", weaponSetSeed([shortbow])[1], { primary: null, secondary: null });
ok("235 shouldSeed null/undefined", shouldSeed(null) && shouldSeed(undefined));
ok("236 never overwrite a drag", !shouldSeed({}) && !shouldSeed({ 1: { primary: null } }));
check("237 seed: Caven's shape (Fire Bolt, Vampiric Touch before the Daggers) → Daggers, no spell",
  weaponSetSeed([fireBolt, vampTouch, dagger, W("dagger2", { light: true, finesse: true, thrown: true })]), {
    1: { primary: dagger.uuid, secondary: "Actor.x.Item.dagger2" }, 2: { primary: null, secondary: null }, 3: { primary: null, secondary: null }
  });
check("238 seed: a Torch is never the main weapon", weaponSetSeed([torch, W("quarterstaff2", { versatile: true })])[1].primary, "Actor.x.Item.quarterstaff2");
check("239 seed: spells only → nothing", weaponSetSeed([fireBolt, vampTouch]), null);


/* ── which combat the actor is in (not just the viewed one) — Area 4 D2 fix ─── */

const cA = { id: "A", started: true, holds: true, active: false, onScene: true };
const cB = { id: "B", started: true, holds: false, active: true, onScene: false };
check("240 viewed combat without the actor → the started one that holds it", pickCombat([cA, cB], { viewedId: "B" }), "A");
check("241 viewed combat holds it → viewed wins", pickCombat([cA, { ...cB, holds: true }], { viewedId: "B" }), "B");
check("242 not started never counts", pickCombat([{ ...cA, started: false }], { viewedId: "A" }), null);
check("243 in no combat → null", pickCombat([cB], { viewedId: "B" }), null);
check("244 two holding, none viewed → active on scene first",
  pickCombat([{ ...cA, active: false }, { id: "C", started: true, holds: true, active: true, onScene: true }], {}), "C");
check("245 two holding, none active → on scene first",
  pickCombat([{ id: "D", started: true, holds: true, onScene: false }, { ...cA, active: false }], {}), "A");
check("246 empty / garbage input", pickCombat(null), null);


/* ── Area 3 fixes: Frenzy's "(2)d6", Reckless Attack's effect ──────────────── */

const scale = (ref) => ({ "@scale.barbarian.rage-damage": 2, "@scale.x.bad": "1d4", "@scale.x.zero": 0 })[ref];
check("247 Frenzy (@scale)d6 → 2d6", tidyDiceCount("(@scale.barbarian.rage-damage)d6", scale), "2d6");
check("248 a non-integer count stays as it was", tidyDiceCount("(@scale.x.bad)d6", scale), "(@scale.x.bad)d6");
check("249 zero / missing stays", [tidyDiceCount("(@scale.x.zero)d6", scale), tidyDiceCount("(@nope)d8", scale)], ["(@scale.x.zero)d6", "(@nope)d8"]);
check("250 plain parts untouched", [tidyDiceCount("3d6", scale), tidyDiceCount("@mod", scale), tidyDiceCount(null, scale)], ["3d6", "@mod", null]);
check("251 resolver that throws leaves the part", tidyDiceCount("(@a)d6", () => { throw new Error("x"); }), "(@a)d6");
check("252 Reckless: empty stock effect gets the Strength-attack Advantage", recklessChanges([]), [RECKLESS_CHANGE]);
check("253 Reckless: an effect that already has it is not doubled",
  recklessChanges([{ key: RECKLESS_CHANGE.key, type: "add", value: 1 }]).length, 1);
check("254 Reckless: other changes kept", recklessChanges([{ key: "system.x", value: 2 }]).map(c => c.key), ["system.x", RECKLESS_CHANGE.key]);
check("255 Reckless effect test", [isRecklessEffect({ name: "Reckless" }), isRecklessEffect({ name: "Reckless Attack" }),
  isRecklessEffect({ name: "Reckless", disabled: true }), isRecklessEffect({ name: "Rage" }), isRecklessEffect(null)], [true, true, false, false, false]);

/* ── report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.log(`✗ pentaryn-combat core: ${failures.length} failed, ${pass} passed`);
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log(`✓ pentaryn-combat core: ${pass} fixtures pass`);
