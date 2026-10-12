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
  tidyDiceCount, recklessChanges, isRecklessEffect, RECKLESS_CHANGE,
  SPECIAL_ACTIONS, specialActionOf, actionsLeft, recordSpecialAction, dashChanges, expiringAt, damageAtZero,
  portraitExtras, orphanUsage, planSummary, dockRect, swingTag,
  recordBonusAction, turnBoundary, pausedNote, steadyAimChanges, steadyAimAfterAttack, hideOffhandSlot, drawerLeft,
  pipFor, recordQuickened, recordQuickenedCast, spentPips, reactionSpent
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

/* ── Area 1 re-run: turn flow (turnflow.mjs) ──────────────────────────────── */

const NAMES = { dash: "Dash", disengage: "Disengage", dodge: "Dodge", hide: "Hide", ready: "Ready", shove: "Shove" };
check("256 special action by label", ["Dash", "dodge", "Hide ", "Ready", "Shove", "Disengage"].map(l => specialActionOf(l, NAMES)),
  ["dash", "dodge", "hide", "ready", "shove", "disengage"]);
check("257 not a special action / empty", [specialActionOf("Longsword", NAMES), specialActionOf("", NAMES), specialActionOf(null, NAMES)], [null, null, null]);
check("258 localized names are used", specialActionOf("Spurt", { ...NAMES, dash: "Spurt" }), "dash");
check("259 six actions", SPECIAL_ACTIONS.length, 6);
const tFresh = freshTurn("k");
check("260 fresh turn: one Action left", actionsLeft(tFresh, 2), 1);
check("261 one swing of two: the Attack action is begun", actionsLeft(recordSwing(tFresh, { kind: "main" }), 2), 0);
check("262 Action Surge after two swings: one Action left", actionsLeft(recordSurge(recordSwing(recordSwing(tFresh, { kind: "main" }), { kind: "main" })), 2), 1);
check("263 Dodge taken: none left", actionsLeft(recordOtherAction(tFresh), 2), 0);
check("264 off-hand swing does not use the Action", actionsLeft(recordSwing(tFresh, { kind: "offhand" }), 2), 1);
check("265 garbage turn reads as fresh", actionsLeft(null, 0), 1);
check("266 Dash/Dodge/Ready record another Action", ["dash", "dodge", "ready", "disengage", "hide"].map(k => otherActionsOf(recordSpecialAction(tFresh, k))), [1, 1, 1, 1, 1]);
check("267 Shove is one swing of the Attack action", [recordSpecialAction(tFresh, "shove").attackAction.swings, otherActionsOf(recordSpecialAction(tFresh, "shove"))], [1, 0]);
check("268 Dash adds every speed above 0", dashChanges({ walk: 30, fly: 0, swim: 15, climb: null, burrow: "x", units: "ft" }),
  [{ key: "system.attributes.movement.walk", type: "add", value: 30 }, { key: "system.attributes.movement.swim", type: "add", value: 15 }]);
check("269 Dash with no movement data", dashChanges(undefined), []);
const fx = [
  { id: "d", statuses: ["dodging"] }, { id: "dash", statuses: [], until: "turnEnd" }, { id: "dis", until: "turnEnd" },
  { id: "prone", statuses: ["prone"] }, { id: "rage", statuses: [], until: null }
];
check("270 turn start ends Dodge only", expiringAt(fx, "turnStart"), ["d"]);
check("271 turn end ends Dash and Disengage", expiringAt(fx, "turnEnd"), ["dash", "dis"]);
check("272 nothing / garbage", [expiringAt([], "turnEnd"), expiringAt(null, "turnStart"), expiringAt([null], "turnEnd")], [[], [], []]);
check("273 damage at 0 HP: one failure", damageAtZero({ hp: 0, max: 44, amount: 7, failures: 0 }), { failures: 1, massive: false });
check("274 crit at 0 HP: two failures", damageAtZero({ hp: 0, max: 44, amount: 7, failures: 0, critical: true }), { failures: 2, massive: false });
check("275 capped at 3", damageAtZero({ hp: 0, max: 44, amount: 7, failures: 2, critical: true }), { failures: 3, massive: false });
check("276 already dead: no change", damageAtZero({ hp: 0, max: 44, amount: 7, failures: 3 }), { failures: null, massive: false });
check("277 temp HP absorbs it all: no failure", damageAtZero({ hp: 0, temp: 10, max: 44, amount: 7, failures: 0 }), { failures: null, massive: false });
check("278 temp HP absorbs part: failure", damageAtZero({ hp: 0, temp: 5, max: 44, amount: 7, failures: 1 }), { failures: 2, massive: false });
check("279 at 0 HP and damage ≥ max: massive flagged, failure still counted", damageAtZero({ hp: 0, max: 20, amount: 20, failures: 0 }), { failures: 1, massive: true });
check("280 above 0: never a failure; remainder ≥ max is massive (PHB example 6 HP, max 12, 18 dmg)",
  [damageAtZero({ hp: 6, max: 12, amount: 18 }), damageAtZero({ hp: 6, max: 12, amount: 17 })], [{ failures: null, massive: true }, { failures: null, massive: false }]);
check("281 monsters, healing and zero ignored", [damageAtZero({ isCharacter: false, hp: 0, amount: 5 }), damageAtZero({ hp: 0, amount: -5 }), damageAtZero({ hp: 0, amount: 0 })],
  [{ failures: null, massive: false }, { failures: null, massive: false }, { failures: null, massive: false }]);
const pe = [
  { uuid: "prone", active: true, temporary: false, statuses: ["prone"] },
  { uuid: "bless", active: true, temporary: true, statuses: [] },
  { uuid: "dodging", active: true, temporary: false, statuses: ["dodging"] },
  { uuid: "off", active: false, temporary: false, statuses: ["poisoned"] },
  { uuid: "hidden", active: true, temporary: false, concealed: true, statuses: ["x"] },
  { uuid: "passive", active: true, temporary: false, statuses: [] }
];
check("282 portrait adds active status-only effects", portraitExtras(pe), ["prone", "dodging"]);
check("283 portrait extras on nothing", [portraitExtras([]), portraitExtras(null)], [[], []]);
check("284 orphan usage card: mine, fresh, nothing rolled or spent", orphanUsage({ mine: true, ageMs: 2000, rolled: false, consumed: false }), true);
check("285 kept: someone else's / rolled / consumed / sequence / old",
  [orphanUsage({ mine: false, ageMs: 1, rolled: false, consumed: false }), orphanUsage({ mine: true, ageMs: 1, rolled: true, consumed: false }),
   orphanUsage({ mine: true, ageMs: 1, rolled: false, consumed: true }), orphanUsage({ mine: true, ageMs: 1, rolled: false, consumed: false, sequence: true }),
   orphanUsage({ mine: true, ageMs: 10 * 60 * 1000, rolled: false, consumed: false }), orphanUsage({})], [false, false, false, false, false, false]);

/* ── usability Area 2, fixer pass 2: Nick partner, plan summary, dialog dock ─ */

// A5 shape: Fighter 5 (Dual Wielder) with Longsword, Shortsword and Dagger all equipped.
const a5 = [longsword, shortsword, dagger];
check("290 Nick partner preferred over a Dual-Wielder longsword (matches the Full Attack plan)",
  followUps({ turn: after("shortsword", "shortsword"), weapons: a5, enhancedDualWielding: true }),
  [{ kind: "nick", weaponId: "dagger", free: true }, { kind: "offhand", weaponId: "longsword" }]);
check("291 …and it is the same weapon extraSwings plans", extraSwings({ main: shortsword, weapons: a5, enhancedDualWielding: true }),
  [{ weaponId: "dagger", mode: "offhand", kind: "nick" }]);
check("292 Dual Wielder after Nick: the Bonus-action attack stays (a separate extra attack)",
  followUps({ turn: recordSwing(after("shortsword"), { kind: "nick", weaponId: "dagger" }), weapons: a5, enhancedDualWielding: true }),
  [{ kind: "offhand", weaponId: "longsword" }]);
check("293 Dual Wielder after the Bonus off-hand: Nick still free",
  followUps({ turn: recordSwing(after("shortsword"), { kind: "offhand", weaponId: "longsword" }), weapons: a5, enhancedDualWielding: true }),
  [{ kind: "nick", weaponId: "dagger", free: true }]);
check("294 no Dual Wielder: Nick partner preferred over another Light weapon, one Light attack only",
  followUps({ turn: after("shortsword"), weapons: [shortsword, W("hatchet", { light: true }), dagger] }),
  [{ kind: "nick", weaponId: "dagger", free: true }]);
check("295 no Dual Wielder: Bonus off-hand used → no Nick either",
  followUps({ turn: recordSwing(after("shortsword"), { kind: "offhand", weaponId: "hatchet" }), weapons: [shortsword, W("hatchet", { light: true }), dagger] }), []);
check("296 Dual Wielder, Nick dagger only: Nick and Off-hand both with the dagger",
  followUps({ turn: after("shortsword"), weapons: [shortsword, dagger], enhancedDualWielding: true }),
  [{ kind: "nick", weaponId: "dagger", free: true }, { kind: "offhand", weaponId: "dagger" }]);
check("297 Dual Wielder, Bonus used: Nick only", followUps({ turn: after("shortsword"), weapons: a5, enhancedDualWielding: true, bonusFree: false }),
  [{ kind: "nick", weaponId: "dagger", free: true }]);

const nickPlan = planSequence({ weaponId: "shortsword", count: 2, extras: [{ weaponId: "dagger", mode: "offhand", kind: "nick" }] });
check("298 plan summary for a Nick pair: 2 of 2 + Nick dagger (never 3 of 2)", planSummary(nickPlan, 2),
  { left: 2, total: 2, mainIds: ["shortsword"], extras: [{ kind: "nick", weaponId: "dagger" }] });
check("299 plan summary after one hand swing", planSummary(planSequence({ weaponId: "longsword", count: 2, done: 1 }), 2),
  { left: 1, total: 2, mainIds: ["longsword"], extras: [] });
check("300 plan summary: Rogue 1 swing + Nick", planSummary(planSequence({ weaponId: "shortsword", count: 1, extras: [{ weaponId: "scimitar", kind: "nick" }] }), 1),
  { left: 1, total: 1, mainIds: ["shortsword"], extras: [{ kind: "nick", weaponId: "scimitar" }] });
check("301 plan summary of nothing", [planSummary([], 2), planSummary(null, 0)],
  [{ left: 0, total: 2, mainIds: [], extras: [] }, { left: 0, total: 0, mainIds: [], extras: [] }]);

check("302 dock: bottom edge just above the strip, centred", dockRect({ stripTop: 700, height: 300, width: 400, viewW: 1400, viewH: 900 }), { left: 500, top: 392 });
check("303 dock: a taller window keeps the same bottom edge", dockRect({ stripTop: 700, height: 520, width: 400, viewW: 1400, viewH: 900 }).top + 520, 692);
check("304 dock: never above the screen top", dockRect({ stripTop: 300, height: 600, width: 400, viewW: 1400, viewH: 900 }).top, 8);
check("305 dock: a dragged window's left/bottom is reused", dockRect({ stripTop: 700, height: 300, width: 400, viewW: 1400, viewH: 900, last: { left: 100, bottom: 500 } }),
  { left: 100, top: 200 });
check("306 dock: clamped inside the viewport", dockRect({ stripTop: 700, height: 300, width: 400, viewW: 1400, viewH: 900, last: { left: 1300, bottom: 2000 } }),
  { left: 992, top: 592 });
check("307 dock: no strip measured → above the bottom edge", dockRect({ height: 100, width: 100, viewW: 1000, viewH: 800 }), { left: 450, top: 692 });
check("308 swing tag only while running", [swingTag({ weapon: "Longsword", current: 2, total: 3, status: "running" }), swingTag({ current: 1, total: 2, status: "paused" })],
  [{ weapon: "Longsword", i: 2, n: 3, kind: "main" }, null]);

/* ── usability Area 3 re-run, fixer pass 2 ─────────────────────────────────── */

check("309 a Bonus-action feature (Rage) spends the Bonus Action", recordBonusAction(freshTurn(K)).bonusUsed, true);
check("310 …and nothing else", { ...recordBonusAction(after("glaive")), bonusUsed: false }, after("glaive"));
check("311 after Rage: no Off-hand, no Hew, no Flurry", followUps({ turn: recordBonusAction(after("shortsword")), weapons: [shortsword, W("hatchet", { light: true })],
  features: ["monks-focus", "martial-arts"], focus: 3, unarmedId: "unarmed" }), []);
check("312 Pole Strike button after a glaive swing", followUps({ turn: after("glaive"), weapons: [glaive], poleStrikeId: "pam" }),
  [{ kind: "pole-strike", weaponId: "pam" }]);
check("313 no Pole Strike button before attacking / without the feat / once used / Bonus spent",
  [followUps({ turn: freshTurn(K), weapons: [glaive], poleStrikeId: "pam" }), followUps({ turn: after("glaive"), weapons: [glaive] }),
   followUps({ turn: recordFollowUp(after("glaive"), "pole-strike"), weapons: [glaive], poleStrikeId: "pam" }),
   followUps({ turn: after("glaive"), weapons: [glaive], poleStrikeId: "pam", bonusFree: false })], [[], [], [], []]);
check("314 combat start: round 0 → 1 on the same combatant begins its turn",
  turnBoundary({ round: 0, turn: 0, combatantId: "a" }, { round: 1, turn: 0, combatantId: "a" }), { ended: null, began: "a" });
check("315 next turn", turnBoundary({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" }), { ended: "a", began: "b" });
check("316 a lone combatant's next round ends and begins its turn", turnBoundary({ round: 1, turn: 0, combatantId: "a" }, { round: 2, turn: 0, combatantId: "a" }),
  { ended: "a", began: "a" });
check("317 nothing moved", turnBoundary({ round: 2, turn: 1, combatantId: "b" }, { round: 2, turn: 1, combatantId: "b" }), { ended: null, began: null });
check("318 pause note: Full Attack / Flurry (Focus paid) / one Bonus follow-up",
  [pausedNote({ kinds: ["main", "main", "nick"] }), pausedNote({ kinds: ["bonus", "bonus"], paid: true }), pausedNote({ kinds: ["offhand"] }), pausedNote({})],
  ["main", "flurry", "bonus", "main"]);
check("319 Steady Aim: advantage for every ability, every Speed 0", [steadyAimChanges().length, steadyAimChanges()[1], steadyAimChanges()[6]],
  [11, { key: "system.abilities.dex.attack.roll.mode", type: "add", value: 1 }, { key: "system.attributes.movement.walk", type: "override", value: 0 }]);
check("320 Argon's off-hand slot: shown before, hidden as a duplicate, hidden after Nick or the off-hand attack",
  [hideOffhandSlot({ turn: after("shortsword"), slotId: "dagger" }), hideOffhandSlot({ turn: after("shortsword"), slotId: "dagger", offered: ["dagger"] }),
   hideOffhandSlot({ turn: recordSwing(after("shortsword"), { kind: "nick", weaponId: "dagger" }), slotId: "dagger" }),
   hideOffhandSlot({ turn: recordSwing(after("shortsword"), { kind: "offhand", weaponId: "dagger" }), slotId: "dagger" }),
   hideOffhandSlot({ turn: null, slotId: null })], [false, true, true, true, false]);
check("321 drawer above its button, kept inside the row", [drawerLeft({ buttonLeft: 700, hudLeft: 300, hudWidth: 900, panelWidth: 300 }),
  drawerLeft({ buttonLeft: 1100, hudLeft: 300, hudWidth: 900, panelWidth: 300 }), drawerLeft({ buttonLeft: 100, hudLeft: 300, hudWidth: 900, panelWidth: 300 }),
  drawerLeft({ buttonLeft: 700, hudLeft: 300, hudWidth: 500, panelWidth: 800 })], [400, 600, 0, 0]);

check("323 drawer on a scaled HUD (Argon at 0.424): above the button, never under the portrait",
  [drawerLeft({ buttonLeft: 600, hudLeft: 15, hudWidth: 1333, panelWidth: 570, minLeft: 223, scale: 0.424 }),
   drawerLeft({ buttonLeft: 1300, hudLeft: 15, hudWidth: 1333, panelWidth: 570, minLeft: 223, scale: 0.424 }),
   drawerLeft({ buttonLeft: 100, hudLeft: 15, hudWidth: 1333, panelWidth: 570, minLeft: 223, scale: 0.424 }),
   drawerLeft({ buttonLeft: 886, hudLeft: 15, hudWidth: 900, panelWidth: 1200, minLeft: 223, scale: 0.424 }),
   drawerLeft({ buttonLeft: 886, hudLeft: 15, hudWidth: 1333, panelWidth: 570, minLeft: 223, scale: 0 })],
  [1380, 1800, 491, 491, 763]);

check("322 Steady Aim after its attack: Speed 0 stays in combat, all gone out of combat",
  [steadyAimAfterAttack(steadyAimChanges(), { inCombat: true }).map(c => c.key.split(".").pop()), steadyAimAfterAttack(steadyAimChanges())],
  [["walk", "fly", "swim", "climb", "burrow"], null]);

/* ── usability Area 5 re-run: spells spend their pip; Quickened Spell ─────── */

check("341 which pip: an Action spell, a Bonus spell, a Reaction, a special/none",
  [pipFor({ activation: "action", isSpell: true, inCombat: true }), pipFor({ activation: "bonus", isSpell: true, inCombat: true }),
   pipFor({ activation: "reaction", isSpell: true, inCombat: true }), pipFor({ activation: "special", inCombat: true }), pipFor({ activation: null, inCombat: true })],
  ["action", "bonus", "reaction", null, null]);
check("342 out of combat no pip; off your turn only a Reaction counts",
  [pipFor({ activation: "action", isSpell: true }), pipFor({ activation: "action", isSpell: true, inCombat: true, isOwnTurn: false }),
   pipFor({ activation: "reaction", inCombat: true, isOwnTurn: false })], [null, null, "reaction"]);
check("343 Quickened: the next 1-Action spell is the Bonus Action; a non-spell Action is not",
  [pipFor({ activation: "action", isSpell: true, quickened: true, inCombat: true }), pipFor({ activation: "action", isSpell: false, quickened: true, inCombat: true })],
  ["bonus", "action"]);
check("344 Quickened is waiting, then the cast spends the Bonus Action and clears it",
  [recordQuickened(freshTurn(K)).quickened, recordQuickenedCast(recordQuickened(freshTurn(K))).quickened,
   recordQuickenedCast(recordQuickened(freshTurn(K))).bonusUsed, otherActionsOf(recordQuickenedCast(recordQuickened(freshTurn(K))))],
  [true, false, true, 0]);
check("345 a fresh turn and an old flag read as not quickened", [freshTurn(K).quickened, readTurn({ key: K }, K).quickened], [false, false]);
check("346 spent pips after a rebind: none / an Action spell / a Bonus spell / Action Surge left one Action",
  [spentPips(freshTurn(K)), spentPips(recordOtherAction(freshTurn(K))), spentPips(recordBonusAction(freshTurn(K))),
   spentPips(recordOtherAction(recordSurge(freshTurn(K)))), spentPips(after("glaive"))],
  [{ action: false, bonus: false }, { action: true, bonus: false }, { action: false, bonus: true }, { action: false, bonus: false }, { action: true, bonus: false }]);
check("347 the Reaction stays spent in the combat it was taken in, until cleared",
  [reactionSpent({ combatId: "c1" }, "c1"), reactionSpent({ combatId: "c1" }, "c2"), reactionSpent(null, "c1"), reactionSpent({ combatId: "c1" }, null)],
  [true, false, false, false]);
check("348 a deleted combat's turn and Reaction flags are stale; another combat's and the out-of-combat turn are not",
  [core.staleCombatFlags({ turn: { key: "c1:3:cb2" }, reaction: { combatId: "c1" } }, "c1"),
   core.staleCombatFlags({ turn: { key: "c2:1:cb1" }, reaction: { combatId: "c2" } }, "c1"),
   core.staleCombatFlags({ turn: { key: "nocombat" }, reaction: null }, "c1"),
   core.staleCombatFlags({ turn: { key: "c10:1:x" } }, "c1"),
   core.staleCombatFlags({}, "c1"), core.staleCombatFlags(null, "c1"), core.staleCombatFlags({ turn: { key: "c1:1:x" } }, null)],
  [["turn", "reaction"], [], [], [], [], [], []]);

/* ── usability Area 10 fixer pass ─────────────────────────────────────────── */

check("349 orphan turn / Reaction flags: a combat that no longer exists; live, out-of-combat and garbled flags stay",
  [core.orphanCombatFlags({ turn: { key: "gone:3:cb" }, reaction: { combatId: "gone" } }, ["live"]),
   core.orphanCombatFlags({ turn: { key: "live:1:cb" }, reaction: { combatId: "live" } }, ["live"]),
   core.orphanCombatFlags({ turn: { key: "nocombat" }, reaction: null }, []),
   core.orphanCombatFlags({ turn: { key: "live:1:cb" }, reaction: { combatId: "gone" } }, new Set(["live"])),
   core.orphanCombatFlags({ turn: { key: "junk" } }, []), core.orphanCombatFlags(null, []), core.orphanCombatFlags({}, null)],
  [["turn", "reaction"], [], [], ["reaction"], [], [], []]);
{
  const plan = planSequence({ weaponId: "shortsword", count: 2, extras: [{ weaponId: "dagger" }] });
  let x = sequenceReducer(null, { type: "start", swings: plan });
  x = sequenceReducer(x, { type: "cancel" });
  const toDagger = sequenceReducer(x, { type: "swap", weaponId: "dagger", extras: [] });
  check("350 swap onto the Nick weapon drops its planned Nick swing (no Dagger x3)", toDagger.swings.map(y => [y.weaponId, y.kind]),
    [["dagger", "main"], ["dagger", "main"]]);
  const toScim = sequenceReducer(x, { type: "swap", weaponId: "scimitar", extras: [{ weaponId: "dagger", mode: "offhand", kind: "nick" }] });
  check("351 swap to another Light weapon keeps a Nick swing with the partner it earns", toScim.swings.map(y => [y.weaponId, y.kind]),
    [["scimitar", "main"], ["scimitar", "main"], ["dagger", "nick"]]);
  check("352 swap without extras keeps the old plan (follow-ups, callers that don't replan)",
    sequenceReducer(x, { type: "swap", weaponId: "dagger" }).swings.map(y => y.weaponId), ["dagger", "dagger", "dagger"]);
  let y = sequenceReducer(null, { type: "start", swings: plan });
  y = sequenceReducer(sequenceReducer(y, { type: "rolled" }), { type: "rolled" });
  check("353 paused on the Nick swing itself: a swap changes nothing", sequenceReducer(y, { type: "swap", weaponId: "scimitar", extras: [] }).swings.map(z => z.weaponId),
    ["shortsword", "shortsword", "dagger"]);
  const rolledNick = { index: 2, swings: [{ weaponId: "a", kind: "nick" }, { weaponId: "b", kind: "main" }, { weaponId: "b", kind: "main" }] };
  check("354 a Nick swing already rolled: no second one is planned", core.replanExtras(rolledNick, [{ weaponId: "c" }]).map(z => z.weaponId), ["a", "b", "b"]);
}
check("355 clampToView: a window below the bottom edge moves up; one that fits stays",
  [core.clampToView({ left: 1500, top: 900, width: 400, height: 300, viewW: 1600, viewH: 1000 }),
   core.clampToView({ left: 100, top: 100, width: 400, height: 300, viewW: 1600, viewH: 1000 }),
   core.clampToView({ left: -20, top: -5, width: 400, height: 300, viewW: 1600, viewH: 1000 }),
   core.clampToView({ left: 0, top: 0, width: 400, height: 300, viewW: 0, viewH: 0 })],
  [{ left: 1192, top: 692 }, null, { left: 8, top: 8 }, null]);

/* ── Area 10 re-run follow-up: HUD follow at combat start, Off-hand source, Stop tidy ─ */

check("356 combat start with Argon still off (a deleted combat before): no follow now, but look again",
  core.hudFollowPlan({ enabled: true, owner: true, onScene: true, argonOn: false, combatStart: true }), { now: false, recheck: [300, 1200] });
check("357 combat start with Argon on: follow now and look again",
  core.hudFollowPlan({ enabled: true, owner: true, onScene: true, argonOn: true, combatStart: true }), { now: true, recheck: [300, 1200] });
check("358 a later turn: follow now only while Argon is on, never a recheck",
  [core.hudFollowPlan({ enabled: true, owner: true, onScene: true, argonOn: true, combatStart: false }),
   core.hudFollowPlan({ enabled: true, owner: true, onScene: true, argonOn: false, combatStart: false })],
  [{ now: true, recheck: [] }, { now: false, recheck: [] }]);
check("359 setting off, not your creature, or its token on another scene: nothing",
  [core.hudFollowPlan({ enabled: false, owner: true, onScene: true, argonOn: true, combatStart: true }),
   core.hudFollowPlan({ enabled: true, owner: false, onScene: true, argonOn: true, combatStart: true }),
   core.hudFollowPlan({ enabled: true, owner: true, onScene: false, argonOn: true, combatStart: true }),
   core.hudFollowPlan()],
  [{ now: false, recheck: [] }, { now: false, recheck: [] }, { now: false, recheck: [] }, { now: false, recheck: [] }]);
{
  // TWF Fighter retest shape: Shortsword x2 + Nick Dagger, Longsword equipped, Dual Wielder.
  const nickDone = recordSwing(after("shortsword", "shortsword"), { kind: "nick", weaponId: "dagger" });
  const list = followUps({ turn: nickDone, weapons: a5, enhancedDualWielding: true });
  check("360 after Nick with Dual Wielder the Longsword Off-hand stays (PHB: a second, separate extra attack)", list,
    [{ kind: "offhand", weaponId: "longsword" }]);
  check("361 …and it is Dual Wielder's attack, not the Light property's", core.offhandVia({ weapon: longsword, turn: nickDone, offered: list }), "dual-wielder");
  const before = after("shortsword");
  const beside = followUps({ turn: before, weapons: [shortsword, dagger], enhancedDualWielding: true });
  check("362 a Light Off-hand offered beside Nick is Dual Wielder's too (Nick takes the Light one)",
    core.offhandVia({ weapon: dagger, turn: before, offered: beside }), "dual-wielder");
  const hatchet = W("hatchet", { light: true });
  const plain = followUps({ turn: before, weapons: [shortsword, hatchet] });
  check("363 no Nick anywhere, a Light partner: the Light property's attack", [plain, core.offhandVia({ weapon: hatchet, turn: before, offered: plain })],
    [[{ kind: "offhand", weaponId: "hatchet" }], "light"]);
  check("364 a non-Light Off-hand weapon is always Dual Wielder's; no weapon reads as Dual Wielder", [
    core.offhandVia({ weapon: longsword, turn: before, offered: [] }), core.offhandVia({})], ["dual-wielder", "dual-wielder"]);
  check("365 no Dual Wielder after Nick: no Off-hand at all (one Light extra attack per turn)",
    followUps({ turn: nickDone, weapons: a5, enhancedDualWielding: false }), []);
}
check("366 deltasConsumed: an actor or item delta counts; empty or missing deltas don't",
  [core.deltasConsumed({ actor: [{ keyPath: "x" }] }), core.deltasConsumed({ item: { a: [{ keyPath: "y" }] } }),
   core.deltasConsumed({ actor: [], item: { a: [] } }), core.deltasConsumed(null), core.deltasConsumed("x")],
  [true, true, false, false, false]);
check("367 a stopped sequence's card with nothing rolled and nothing consumed is an orphan; a rolled one is kept",
  [orphanUsage({ mine: true, ageMs: 1000, rolled: false, consumed: core.deltasConsumed({ actor: [], item: {} }), sequence: false }),
   orphanUsage({ mine: true, ageMs: 1000, rolled: true, consumed: false, sequence: false })], [true, false]);
{
  // A11: Stop is dispatched while swing 2's window is open; the closed window's cancel changes nothing.
  let s = sequenceReducer(null, { type: "start", swings: planSequence({ weaponId: "longsword", count: 2 }) });
  s = sequenceReducer(s, { type: "rolled" });
  s = sequenceReducer(s, { type: "stop" });
  const closed = sequenceReducer(s, { type: "cancel" });
  check("368 Stop then the closed window: stopped after 1 rolled, swing 2 not rolled", [closed.status, closed.rolled, closed.swings.map(x => x.result ?? null)],
    ["stopped", 1, ["rolled", null]]);
  check("369 …and one main swing stays on the pips", swingsLeft(2, recordSwing(freshTurn("c:1:a"), { kind: "main", weaponId: "longsword" }), { inCombat: true }), 1);
}

{
  // Area 3 re-run (D1): the Reckless effect stayed on the Barbarian at 0 rounds into the next turn.
  const fx2 = [{ id: "r", reckless: true }, { id: "d", statuses: ["dodging"] }, { id: "dash", until: "turnEnd" }, { id: "r2", reckless: true, until: "turnStart" }];
  check("370 turn start ends Reckless (with or without our `until` flag) and Dodge", expiringAt(fx2, "turnStart"), ["r", "d", "r2"]);
  check("371 turn end leaves Reckless on", expiringAt(fx2, "turnEnd"), ["dash"]);
  check("372 recklessToggle off: Reckless is left alone, Dodge still ends",
    expiringAt(fx2, "turnStart", { specialActions: true, reckless: false }), ["d"]);
  check("373 specialActions off: only Reckless ends", expiringAt(fx2, "turnStart", { specialActions: false, reckless: true }), ["r", "r2"]);
}
{
  // Area 3 re-run (B4): what an Undone auto Sneak Attack came to on its card.
  const d = (number, faces, total) => ({ number, faces, total });
  check("374 riderRolled: the last die of the rider's size and count (Rapier 1d8 + 3d6)", core.riderRolled("3d6", [d(1, 8, 5), d(3, 6, 11)]), { formula: "3d6", total: 11 });
  check("375 …a Shortsword's own d6 is not mistaken for it", core.riderRolled("3d6", [d(1, 6, 4), d(3, 6, 9)]), { formula: "3d6", total: 9 });
  check("376 …a Critical Hit doubles the rider's dice", core.riderRolled("3d6", [d(2, 8, 9), d(6, 6, 21)]), { formula: "6d6", total: 21 });
  check("377 …no match, odd dice or nothing: null",
    [core.riderRolled("3d6", [d(1, 8, 5)]), core.riderRolled("@scale", [d(3, 6, 9)]), core.riderRolled("3d6"), core.riderRolled(null, null)],
    [null, null, null, null]);
}
{
  // PT1-6: Argon draws the tooltip subtitle as a one-line pill (absolute, centred, `text-wrap: nowrap`)
  // inside a tooltip that clips its overflow, so "2 of 2 swings left this turn, + Nick: Scimitar" was
  // cut at both edges. combat.css must let its own tooltips' subtitle wrap within the tooltip width,
  // scoped to a class only combat's tooltips carry (transform's .pentaryn-tt tooltips are not ours; C37).
  const { readFileSync } = await import("node:fs");
  const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const css = read("styles/combat.css");
  const rule = css.match(/\.ech-tooltip\.pentaryn-combat-tt\s+\.ech-tooltip-subtitle\s*\{([^}]*)\}/)?.[1] ?? "";
  const decl = prop => rule.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? null;
  ok("378 PT1-6 combat.css has a rule for its own tooltip's subtitle (.ech-tooltip.pentaryn-combat-tt .ech-tooltip-subtitle)", rule);
  ok("379 …that lets it wrap (white-space: normal and text-wrap other than nowrap)",
    decl("white-space") === "normal" && !/nowrap/.test(decl("text-wrap") ?? "nowrap"));
  ok("380 …bounded by the tooltip's width, not its own text", /%/.test(decl("max-width") ?? ""));
  ok("381 …without !important (it outranks Argon's rule by specificity)", rule && !/!important/.test(rule));
  // An absolute box at left:50% shrinks to the half of the tooltip right of centre unless its width is
  // set, so without max-content it would wrap at half width; and translate(-50%, …) keeps it centred.
  ok("383 …sized to its text (width: max-content, not the half-width shrink-to-fit) and centred (translate(-50%, …))",
    decl("width") === "max-content" && /^translate\(\s*-50%\s*,/.test(decl("transform") ?? ""));
  const tt = read("hud/buttons-ui.mjs").match(/const TT = \[([^\]]*)\]/)?.[1] ?? "";
  ok("382 …and hud.mjs puts that class on its tooltips, beside the shared pentaryn-tt",
    /"pentaryn-tt"/.test(tt) && /"pentaryn-combat-tt"/.test(tt));
}

{
  // ext-8: Dash / Disengage (turnflow/action-buttons.mjs) and Steady Aim (turnflow/effects.mjs) built
  // the same "until turn end" ActiveEffect payload by hand. One pure builder now owns its shape.
  const build = typeof core.turnEffectData === "function" ? core.turnEffectData : () => null;
  const ch = [{ key: "system.attributes.movement.walk", type: "add", value: 30 }];
  check("384 ext-8 turnEffectData: the until-turn-end payload (key order as written to the actor)",
    build({ module: core.MODULE, kind: "dash", name: "Dash", img: "dash.webp", description: "Extra movement.", changes: ch, origin: "Actor.a" }),
    { name: "Dash", img: "dash.webp", description: "<p>Extra movement.</p>", transfer: false, origin: "Actor.a",
      system: { changes: ch }, flags: { [core.MODULE]: { until: "turnEnd", special: "dash" }, dnd5e: { isTemporary: true } } });
}

/* ── report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.log(`✗ pentaryn-combat core: ${failures.length} failed, ${pass} passed`);
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log(`✓ pentaryn-combat core: ${pass} fixtures pass`);
