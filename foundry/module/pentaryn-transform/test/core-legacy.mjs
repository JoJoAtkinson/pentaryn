#!/usr/bin/env node
/**
 * Fixtures for transform-core.mjs. No dependencies — `node test/core-legacy.mjs` (test/run.mjs runs it as LEGACY).
 *
 * Nothing Foundry is stubbed: importing the core bare is itself the proof that it stays pure.
 * Synthetic fixtures only (test/ is published with the module); their shapes follow a level-12
 * Circle of the Stars druid and the Monster Manual beasts as dnd5e 6.0 stores them (speeds under
 * movement.speeds, condition effects typed "condition" with system.level, structured system.origin).
 */

const core = await import("../transform-core.mjs");
const {
  MODULE, EFFECT_ID, activitiesOf, isWildShapeActivity, findWildShapeItem, stripReason, stripForForm,
  isRevertData, returnLabel, durationSeconds, formatDuration, isExpired, usesLeft, useSyncUpdates,
  carriedConditions, pickRunner, withArticle, formatCR, formSummary, planBonusBar, frontRowItems,
  pruneFavorites, endedInForm, attributeSync, withoutOrigin, grantsFly, shiftBlock, planWithout, CONSTELLATIONS, STARRY_LIGHT,
  STARRY_SECONDS, constellationOfActivity, starryEffectData, starryBlock, coveredPanel, formTempHP, hpText, isBodySwap
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

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const WS = "wsWildShape00001";
const act = (id, type, activation, targets = [], extra = {}) =>
  ({ [id]: { _id: id, type, activation: { type: activation }, consumption: { targets }, ...extra } });
const feat = (_id, name, sub, activities = {}, extra = {}) =>
  ({ _id, name, type: "feat", system: { type: { value: sub }, activities, ...(extra.system ?? {}) }, flags: extra.flags ?? {} });

const wildShape = feat(WS, "Wild Shape", "class",
  act("wsAct", "transform", "bonus", [{ type: "itemUses", target: "" }], { transform: { preset: "wildshape" } }),
  { system: { uses: { max: 3, spent: 1 } } });
const druid = { _id: "clsDruid0000001", name: "Druid", type: "class", system: { hd: { spent: 2 }, activities: {} } };
const TALO = [
  druid,
  wildShape,
  feat("wildCompanion01", "Wild Companion", "class", {
    ...act("wc1", "summon", "action", [{ type: "spellSlots", target: "1" }]),
    ...act("wc2", "summon", "action", [{ type: "itemUses", target: WS }])
  }),
  feat("starryForm00001", "Starry Form", "class", {
    ...act("sf1", "utility", "bonus", [{ type: "itemUses", target: WS }]),
    ...act("sf2", "attack", "bonus")
  }),
  feat("wildResurgence1", "Wild Resurgence", "class", act("wr1", "utility", "special", [{ type: "itemUses", target: "" }, { type: "spellSlots", target: "1" }])),
  feat("largeForm000001", "Large Form", "race", act("lf1", "utility", "bonus", [{ type: "itemUses", target: "" }])),
  feat("stonesEndurance", "Stone's Endurance", "race", act("se1", "heal", "reaction", [{ type: "itemUses", target: "" }])),
  feat("powerfulBuild01", "Powerful Build", "race"),
  feat("cosmicOmen00001", "Cosmic Omen", "class", act("co1", "utility", "reaction", [{ type: "itemUses", target: "" }]),
    { system: { uses: { max: 5, spent: 1 } } }),
  feat("starMap00000001", "Star Map", "class", act("sm1", "utility", "hour")),
  feat("spellcasting001", "Spellcasting", "class", {}, { system: { identifier: "spellcasting" } }),
  feat("returnNormal001", "Return to Normal Form", "class", act("rn1", "utility", "bonus"), { flags: { [MODULE]: { revert: true } } }),
  feat("keptOnPurpose01", "Kept On Purpose", "class", act("kp1", "utility", "bonus", [{ type: "spellSlots", target: "1" }]),
    { flags: { [MODULE]: { keepInForm: true } } })
];

const bite = { _id: "mmBite0000000000", name: "Bite", type: "weapon", system: { type: { value: "natural" },
  activities: act("bt1", "attack", "action") } };
const claw = { _id: "mmClaw0000000000", name: "Claw", type: "weapon", system: { type: { value: "natural" },
  activities: act("cl1", "attack", "action") } };
const multi = feat("mmMultiattack000", "Multiattack", "monster", act("ma1", "utility", "action"));
const pack = feat("mmPackTactics000", "Pack Tactics", "monster");
// A beast feat that would trip the slot rule if beast items were considered — they must not be.
const oddBeast = feat("mmOddBeastFeat00", "Odd Beast Feat", "monster", act("ob1", "utility", "action", [{ type: "spellSlots", target: "1" }]));

/* ── activities ───────────────────────────────────────────────────────────── */

check("1 activitiesOf object", activitiesOf(wildShape).map(a => a._id), ["wsAct"]);
check("2 activitiesOf array", activitiesOf({ system: { activities: [{ _id: "x" }] } }).map(a => a._id), ["x"]);
check("3 activitiesOf Map", activitiesOf({ system: { activities: new Map([["y", { _id: "y" }]]) } }).map(a => a._id), ["y"]);
check("4 activitiesOf none", activitiesOf({ system: {} }), []);
ok("5 wildshape activity", isWildShapeActivity({ type: "transform", transform: { preset: "wildshape" } }));
ok("6 polymorph is not wildshape", !isWildShapeActivity({ type: "transform", transform: { preset: "polymorph" } }));
check("7 findWildShapeItem", findWildShapeItem(TALO)?._id, WS);
check("8 findWildShapeItem none", findWildShapeItem([pack]), null);

/* ── stripping ────────────────────────────────────────────────────────────── */

const ctx = { wildShapeIds: [WS] };
const reason = name => stripReason(TALO.find(i => i.name === name), ctx);
check("10 Wild Shape stripped", reason("Wild Shape"), "wildshape");
check("11 Wild Companion stripped (uses WS on 2nd activity, slots on 1st)", reason("Wild Companion"), "spends-wildshape");
check("12 Starry Form stripped", reason("Starry Form"), "spends-wildshape");
check("13 Wild Resurgence stripped", reason("Wild Resurgence"), "spends-slots");
check("14 Large Form stripped (species, has activity)", reason("Large Form"), "species");
check("15 Stone's Endurance stripped", reason("Stone's Endurance"), "species");
check("16 passive species trait kept", reason("Powerful Build"), null);
check("17 Cosmic Omen kept", reason("Cosmic Omen"), null);
check("18 Star Map kept", reason("Star Map"), null);
check("19 revert item kept", reason("Return to Normal Form"), null);
check("20 keepInForm wins over slots", reason("Kept On Purpose"), null);
check("21 class item kept", stripReason(druid, ctx), null);
check("22 wildshape by activity even without the id", stripReason(wildShape, { wildShapeIds: [] }), "wildshape");
check("22a Spellcasting class feature stripped (can't cast spells)", reason("Spellcasting"), "no-spellcasting");
check("22b a Spellcasting feature with an activity is kept", stripReason(feat("sc2", "Spellcasting", "class",
  act("x1", "utility", "action"), { system: { identifier: "spellcasting" } }), ctx), null);
check("22c a monster's Spellcasting is not a class feature", stripReason(feat("sc3", "Spellcasting", "monster", {},
  { system: { identifier: "spellcasting" } }), ctx), null);

const formItems = [bite, claw, multi, pack, oddBeast, ...TALO];
const hostIds = TALO.map(i => i._id);
const { keep, stripped } = stripForForm(formItems, { wildShapeIds: [WS], hostItemIds: hostIds });
check("23 kept names", keep.map(i => i.name),
  ["Bite", "Claw", "Multiattack", "Pack Tactics", "Odd Beast Feat", "Druid", "Powerful Build", "Cosmic Omen", "Star Map", "Return to Normal Form", "Kept On Purpose"]);
check("24 stripped names", stripped.map(s => s.name),
  ["Wild Shape", "Wild Companion", "Starry Form", "Wild Resurgence", "Large Form", "Stone's Endurance", "Spellcasting"]);
check("25 without hostItemIds the beast's slot feat goes too", stripForForm([oddBeast], ctx).stripped.map(s => s.name), ["Odd Beast Feat"]);
check("26 stripForForm empty", stripForForm(undefined, ctx), { keep: [], stripped: [] });

// An unlinked token's form keeps its own Wild Shape (no world actor holds the druid's uses).
const tokenStrip = stripForForm(formItems, { wildShapeIds: [WS], hostItemIds: hostIds, keepWildShape: true });
check("26a token form keeps Wild Shape, strips the rest", tokenStrip.stripped.map(s => s.name),
  ["Wild Companion", "Starry Form", "Wild Resurgence", "Large Form", "Stone's Endurance", "Spellcasting"]);
ok("26b token form Wild Shape kept", tokenStrip.keep.some(i => i._id === WS));

const favs = [
  { type: "item", id: ".Item.starryForm00001" }, { type: "activity", id: ".Item.wildCompanion01.Activity.wc1" },
  { type: "item", id: ".Item.cosmicOmen00001" }, { type: "skill", id: "nat" }, { type: "slots", id: "spell1" }
];
check("26c favorites pruned", pruneFavorites(favs, ["starryForm00001", "wildCompanion01"]).map(f => f.id),
  [".Item.cosmicOmen00001", "nat", "spell1"]);
ok("26d favorites untouched with nothing stripped", pruneFavorites(favs, []) === favs);
check("26e favorites not an array", pruneFavorites(undefined, ["x"]), undefined);

ok("27 revert data", isRevertData(TALO.find(i => i.name === "Return to Normal Form")));
ok("28 not revert", !isRevertData(wildShape));
check("29 return label", returnLabel("Talo"), "Return to Talo");

/* ── durations ────────────────────────────────────────────────────────────── */

check("30 6 hours", durationSeconds({ value: 6, units: "hour" }), 21600);
check("31 10 minutes", durationSeconds({ value: "10", units: "minute" }), 600);
check("32 1 round", durationSeconds({ value: 1, units: "round" }), 6);
check("33 instantaneous", durationSeconds({ value: null, units: "inst" }), null);
check("34 zero", durationSeconds({ value: 0, units: "hour" }), null);
check("35 format 6h", formatDuration(21600), "6 hours");
check("36 format just under rounds up", formatDuration(21599), "6 hours");
check("37 format h+m", formatDuration(21600 - 60 * 61), "4 hours 59 minutes");
check("38 format 1h 1m", formatDuration(3660), "1 hour 1 minute");
check("39 format minutes", formatDuration(600), "10 minutes");
check("40 format negative", formatDuration(-50), "0 minutes");
ok("41 expired at end", isExpired(21630, 21630));
ok("42 not yet", !isExpired(21630, 21629));
ok("43 no end never expires", !isExpired(null, 1e9));

/* ── uses and use-sync ────────────────────────────────────────────────────── */

check("50 usesLeft", usesLeft({ max: 3, spent: 1 }), 2);
check("51 usesLeft spent > max", usesLeft({ max: 3, spent: 5 }), 0);
check("52 usesLeft unlimited", usesLeft({ max: null, spent: 0 }), null);
check("53 usesLeft missing spent", usesLeft({ max: 2 }), 2);

const form = [
  { _id: "cosmicOmen00001", type: "feat", system: { uses: { max: 5, spent: 3 } } },
  { _id: "clsDruid0000001", type: "class", system: { hd: { spent: 4 } } },
  { _id: "starMap00000001", type: "feat", system: {} },
  { _id: "mmBite0000000000", type: "weapon", system: { uses: { max: 1, spent: 1 } } },
  { _id: "returnNormal001", type: "feat", system: { uses: { max: null, spent: 0 } } }
];
const orig = [
  { _id: "cosmicOmen00001", type: "feat", system: { uses: { max: 5, spent: 1 } } },
  { _id: "clsDruid0000001", type: "class", system: { hd: { spent: 2 } } },
  { _id: "starMap00000001", type: "feat", system: {} },
  { _id: "returnNormal001", type: "feat", system: { uses: { max: null, spent: 0 } } }
];
check("54 useSync copies uses and HD only", useSyncUpdates(form, orig), [
  { _id: "cosmicOmen00001", "system.uses.spent": 3 },
  { _id: "clsDruid0000001", "system.hd.spent": 4 }
]);
check("55 useSync nothing changed", useSyncUpdates(orig, orig), []);
check("56 useSync type mismatch ignored", useSyncUpdates([{ _id: "x", type: "feat", system: { uses: { max: 1, spent: 1 } } }],
  [{ _id: "x", type: "weapon", system: { uses: { max: 1, spent: 0 } } }]), []);

/* ── carried conditions ──────────────────────────────────────────────────── */

// dnd5e 6.0: a status effect is type "condition" (system { type, level }, no system.origin); other
// effects are "base"/"enchantment" with a structured system.origin next to core's origin string.
const cond = (_id, name, statuses, extra = {}) =>
  ({ _id, name, type: "condition", statuses, system: { type: statuses[0], level: null }, origin: null, ...extra });
const FORM_UUID = "Actor.formTalo000000";
const formEffects = [
  { _id: EFFECT_ID, name: "Wild Shape: Ape", type: "base", statuses: [], system: { changes: [] } },
  cond("dnd5eunconscious", "Unconscious", ["unconscious", "incapacitated"]),
  cond("dnd5eprone000000", "Prone", ["prone"]),
  { _id: "beastOwnEffect00", name: "Beast aura", type: "base", statuses: ["invisible"] },
  { _id: "taloBlessing0000", name: "Bless", type: "base", statuses: [] },
  cond("taloPoisoned0000", "Poisoned", ["poisoned"]),
  { _id: "formHexed000000a", name: "Hexed", type: "base", statuses: ["cursed"],
    origin: `${FORM_UUID}.Item.hex0000000000000`,
    system: { changes: [], origin: { item: `${FORM_UUID}.Item.hex0000000000000`, actor: FORM_UUID } } }
];
check("60 carried conditions", carriedConditions(formEffects, {
  originalEffectIds: ["taloBlessing0000", "taloPoisoned0000"], originalStatuses: ["poisoned"], sourceEffectIds: ["beastOwnEffect00"]
}).map(e => e._id), ["dnd5eunconscious", "dnd5eprone000000", "formHexed000000a"]);

// The origin points into the form actor the revert deletes: both the core string and 6.0's system.origin go.
const hexed = formEffects.find(e => e._id === "formHexed000000a");
const hexedBack = withoutOrigin(hexed);
check("60a carried effect: no origin, no system.origin", ["origin" in hexedBack, "origin" in hexedBack.system, hexedBack.statuses],
  [false, false, ["cursed"]]);
ok("60b carried effect: source not mutated", hexed.origin && hexed.system.origin.item);
check("60c condition effect keeps its system", withoutOrigin(formEffects[1]), {
  _id: "dnd5eunconscious", name: "Unconscious", type: "condition", statuses: ["unconscious", "incapacitated"],
  system: { type: "unconscious", level: null }
});
check("60d no system at all", withoutOrigin({ _id: "a", origin: "x", statuses: ["prone"] }), { _id: "a", statuses: ["prone"] });
check("61 already has the status", carriedConditions([{ _id: "a", statuses: ["prone"] }], { originalStatuses: ["prone"] }), []);
check("62 duplicate statuses carried once", carriedConditions([
  { _id: "a", statuses: ["stunned", "incapacitated"] }, { _id: "b", statuses: ["stunned"] }
]).map(e => e._id), ["a"]);

// Exhaustion is a level dnd5e keeps on the actor; it travels back as the attribute, not an effect.
const exhaustion1 = cond("dnd5eexhaustion0", "Exhaustion", ["exhaustion"], { system: { type: "exhaustion", level: 1 } });
check("63 exhaustion not carried as an effect", carriedConditions([
  exhaustion1, cond("dnd5eprone000000", "Prone", ["prone"])
]).map(e => e._id), ["dnd5eprone000000"]);

/* ── effects that ended in the form ──────────────────────────────────────── */

const CONC = "tkRPGSbkEo2Ienig";
const taloEffects = [
  { _id: CONC, statuses: ["concentrating"] }, { _id: "taloBlessing0000", statuses: [] },
  { _id: "dnd5eexhaustion0", statuses: ["exhaustion"] }, { _id: "taloArmorEffect0", statuses: [] }
];
check("64 concentration broken in the form ends on the druid",
  endedInForm([CONC, "taloBlessing0000", "dnd5eexhaustion0"], [{ _id: "taloBlessing0000" }, { _id: EFFECT_ID }], taloEffects),
  [CONC]);
check("65 never carried (armor effect stayed home) → untouched",
  endedInForm([CONC], [{ _id: CONC }], taloEffects), []);
check("66 exhaustion left to the attribute", endedInForm(["dnd5eexhaustion0"], [], taloEffects), []);
check("67 already gone from the druid", endedInForm(["gone000000000000"], [], taloEffects), []);
check("68 no carried list (form made before this)", endedInForm(undefined, [], taloEffects), []);

check("69a attribute sync", attributeSync({ exhaustion: 2, inspiration: false }, { exhaustion: 1, inspiration: true }),
  { "system.attributes.exhaustion": 2, "system.attributes.inspiration": false });
check("69b attribute sync unchanged", attributeSync({ exhaustion: 0, inspiration: true }, { exhaustion: 0, inspiration: true }), {});
check("69c attribute sync missing values", attributeSync({}, { exhaustion: 3 }), {});
// dnd5e 6: the form's prepared exhaustion is its dnd5eexhaustion effect's system.level; the druid has
// none (0). The update writes the attribute, which dnd5e turns into the druid's own effect at level 1.
check("69d exhaustion gained in the form (6.0 effect level)",
  attributeSync({ exhaustion: exhaustion1.system.level, inspiration: false }, { exhaustion: 0, inspiration: false }),
  { "system.attributes.exhaustion": 1 });
check("69e exhaustion removed in the form (Greater Restoration on the beast)",
  attributeSync({ exhaustion: 0 }, { exhaustion: 2 }), { "system.attributes.exhaustion": 0 });

/* ── can the druid shift ──────────────────────────────────────────────────── */

check("75 ready", shiftBlock({ usesLeft: 3 }), null);
check("76 double-click", shiftBlock({ busy: true, usesLeft: 3 }), "busy");
check("77 no permission", shiftBlock({ canTransform: false }), "cannot");
check("78 incapacitated", shiftBlock({ incapacitated: true, hp: 40 }), "incapacitated");
check("79 at 0 HP", shiftBlock({ hp: 0 }), "zeroHP");
check("79a no token on the viewed scene", shiftBlock({ hasToken: false, usesLeft: 2 }), "noToken");
check("79b no uses", shiftBlock({ usesLeft: 0 }), "noUses");
check("79c unlimited uses", shiftBlock({ usesLeft: null }), null);

/* ── runner ───────────────────────────────────────────────────────────────── */

check("70 GM runs", pickRunner({ activeGMId: "gm", ownerIds: ["p2", "p1"] }), "gm");
check("71 first owner by id", pickRunner({ activeGMId: null, ownerIds: ["p2", "p1"] }), "p1");
check("72 nobody", pickRunner({}), null);

/* ── text ─────────────────────────────────────────────────────────────────── */

check("80 a Dire Wolf", withArticle("Dire Wolf"), "a Dire Wolf");
check("81 an Ape", withArticle("Ape"), "an Ape");
check("82 an Octopus", withArticle("Octopus"), "an Octopus");
check("83 CR 1/4", formatCR(0.25), "1/4");
check("84 CR 1/8", formatCR(0.125), "1/8");
check("85 CR 1", formatCR(1), "1");
check("86 CR 0", formatCR(0), "0");

const direWolf = formSummary({
  cr: 1, sizeLabel: "Large", typeLabel: "beast", ac: 14, units: "ft",
  movement: { speeds: { walk: 50, burrow: 0, climb: 0, fly: 0, swim: 0, jump: 8.5 }, hover: false, units: "ft" },
  senses: { darkvision: 60, blindsight: null },
  attacks: [{ name: "Bite", toHit: "+5", damage: "1d10 + 3 Piercing" }],
  traits: ["Pack Tactics"]
});
check("87 dire wolf subtitle", direWolf.subtitle, "CR 1 Large Beast");
check("88 dire wolf details", direWolf.details, [
  { label: "AC", value: "14" }, { label: "Speed", value: "50 ft" }, { label: "Senses", value: "Darkvision 60 ft" },
  { label: "Bite", value: "+5, 1d10 + 3 Piercing" }
]);
check("89 dire wolf traits", direWolf.traits, ["Pack Tactics"]);
const bat = formSummary({ cr: 0.25, sizeLabel: "Large", typeLabel: "beast", ac: 13,
  movement: { speeds: { walk: 10, fly: 60 }, hover: false }, senses: { blindsight: 120 }, attacks: [], traits: [] });
check("90 giant bat speed", bat.details.find(d => d.label === "Speed").value, "10 ft, fly 60 ft");
check("91 giant bat subtitle", bat.subtitle, "CR 1/4 Large Beast");
check("92 hover marked", formSummary({ movement: { fly: 20, hover: true } }).details.find(d => d.label === "Speed").value, "fly 20 ft (hover)");
check("92a flat keys (the pre-6 shape, the shim)", formSummary({ movement: { walk: 30, swim: 30 } }).details.find(d => d.label === "Speed").value, "30 ft, swim 30 ft");
check("92b speeds win over the flat keys", formSummary({ movement: { speeds: { walk: 40 }, walk: 30 } }).details.find(d => d.label === "Speed").value, "40 ft");
check("93 attack with no numbers", formSummary({ attacks: [{ name: "Web" }] }).details.at(-1), { label: "Web", value: "—" });

/* ── Bonus bar plan ───────────────────────────────────────────────────────── */

const RV = "returnNormal001";
const SF = "starryForm00001";
// Normal form as Argon builds it: weapon slot, Cast Spell, Use Power, Use Item, [Wild Shape | Starry Form], Return.
const normalSlots = [
  { kind: "weaponSet" }, { kind: "other" }, { kind: "other" }, { kind: "other" },
  { kind: "split", ids: [WS, SF] }, { kind: "item", id: RV }
];
check("100 normal form", planBonusBar(normalSlots, { wildShapeId: WS, revertIds: [RV], shifted: false, hasWildShape: true }),
  [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { keep: 3 }, { wildshape: true }, { item: SF }]);
check("101 normal, revert paired with WS", planBonusBar([{ kind: "weaponSet" }, { kind: "split", ids: [WS, RV] }, { kind: "item", id: SF }],
  { wildShapeId: WS, revertIds: [RV], shifted: false, hasWildShape: true }),
  [{ keep: 0 }, { wildshape: true }, { keep: 2 }]);
check("102 normal, revert paired with Starry Form", planBonusBar([{ kind: "weaponSet" }, { kind: "split", ids: [SF, RV] }, { kind: "item", id: WS }],
  { wildShapeId: WS, revertIds: [RV], shifted: false, hasWildShape: true }),
  [{ keep: 0 }, { item: SF }, { wildshape: true }]);
check("103 normal, Wild Shape not on the bar (condensing off, other activation) → appended",
  planBonusBar([{ kind: "weaponSet" }, { kind: "other" }], { wildShapeId: WS, revertIds: [], shifted: false, hasWildShape: true }),
  [{ keep: 0 }, { keep: 1 }, { wildshape: true }]);
check("104 no druid, revert hidden", planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: RV }],
  { wildShapeId: null, revertIds: [RV], shifted: false, hasWildShape: false }), [{ keep: 0 }]);
// Shifted: Wild Shape and Starry Form are stripped; Return arrives alone.
check("105 shifted", planBonusBar([{ kind: "weaponSet" }, { kind: "other" }, { kind: "item", id: RV }],
  { wildShapeId: null, revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true }),
  [{ keep: 0 }, { item: RV, highlight: true }, { wildshape: true }, { keep: 1 }]);
check("106 shifted, old form still carrying WS", planBonusBar([{ kind: "weaponSet" }, { kind: "split", ids: [WS, RV] }],
  { wildShapeId: WS, revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true }),
  [{ keep: 0 }, { item: RV, highlight: true }, { wildshape: true }]);
check("107 shifted, no weapon slot", planBonusBar([{ kind: "item", id: RV }],
  { revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true }),
  [{ item: RV, highlight: true }, { wildshape: true }]);
check("108 polymorphed non-druid", planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: RV }],
  { revertIds: [RV], shifted: true, revertId: RV, hasWildShape: false }),
  [{ keep: 0 }, { item: RV, highlight: true }]);
check("109 untouched split kept", planBonusBar([{ kind: "split", ids: ["a", "b"] }], { wildShapeId: WS, hasWildShape: true }),
  [{ keep: 0 }, { wildshape: true }]);

/* ── Action bar front row ─────────────────────────────────────────────────── */

const bear = [bite, claw, multi, pack, druid, TALO.find(i => i.name === "Cosmic Omen"),
  { _id: "bonusBite000000", name: "Quick Bite", type: "weapon", system: { activities: act("qb", "attack", "bonus") } }];
check("110 brown bear front row", frontRowItems(bear), ["mmBite0000000000", "mmClaw0000000000", "mmMultiattack000"]);
check("111 already on the bar skipped", frontRowItems(bear, ["mmClaw0000000000"]), ["mmBite0000000000", "mmMultiattack000"]);
check("112 live item ids (id, Map activities)", frontRowItems([{ id: "L", type: "weapon",
  system: { activities: new Map([["a", { activation: { type: "action" } }]]) } }]), ["L"]);
check("113 passive trait not in front row", frontRowItems([pack]), []);
check("114 Use Feature holding only Multiattack is covered", coveredPanel(["mmMultiattack000"], frontRowItems(bear)), true);
check("115 a panel with anything else stays", coveredPanel(["mmMultiattack000", "starMap00000001"], frontRowItems(bear)), false);
check("116 an empty panel is not 'covered'", coveredPanel([], ["a"]), false);

/* ── hit points ───────────────────────────────────────────────────────────── */

check("117 temp HP: grant beats none", formTempHP(0, 12), 12);
check("118 temp HP: keep the better (no stacking)", formTempHP(20, 12), 20);
check("119 temp HP: junk in", formTempHP(undefined, "12"), 12);
check("119a hp text with temp", hpText({ value: 99, temp: 12, max: 99, tempmax: 0 }), { current: "99+12", max: "99", hasTemp: true });
check("119b hp text without temp", hpText({ value: 80, temp: 0, max: 99, tempmax: 5 }), { current: "80", max: "104", hasTemp: false });


/* ── Starry Form on the bars ──────────────────────────────────────────────── */

check("120 normal form, Starry Form replaced by the module's button",
  planBonusBar(normalSlots, { wildShapeId: WS, revertIds: [RV], shifted: false, hasWildShape: true, starryId: SF }),
  [{ keep: 0 }, { keep: 1 }, { keep: 2 }, { keep: 3 }, { wildshape: true }, { starry: true }]);
check("121 Starry Form as its own button, after Wild Shape",
  planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: SF }, { kind: "other" }, { kind: "item", id: WS }],
    { wildShapeId: WS, shifted: false, hasWildShape: true, starryId: SF }),
  [{ keep: 0 }, { wildshape: true }, { starry: true }, { keep: 2 }]);
check("122 Starry Form paired with something else keeps the partner",
  planBonusBar([{ kind: "weaponSet" }, { kind: "split", ids: [SF, "other0000000001"] }, { kind: "item", id: WS }],
    { wildShapeId: WS, shifted: false, hasWildShape: true, starryId: SF }),
  [{ keep: 0 }, { wildshape: true }, { starry: true }, { item: "other0000000001" }]);
check("123 Starry Form not on the bar → appended after Wild Shape",
  planBonusBar([{ kind: "weaponSet" }], { wildShapeId: WS, shifted: false, hasWildShape: true, starryId: SF }),
  [{ keep: 0 }, { wildshape: true }, { starry: true }]);
check("124 shifted: no Starry Form button", planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: RV }],
  { revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true, starryId: SF }),
  [{ keep: 0 }, { item: RV, highlight: true }, { wildshape: true }]);
check("125 Special bar: Starry Form dropped, partner kept full size",
  planWithout([{ kind: "split", ids: [SF, "wildResurgence1"] }, { kind: "item", id: "x" }], [SF]),
  [{ item: "wildResurgence1" }, { keep: 1 }]);
check("126 Special bar: plain Starry Form button dropped", planWithout([{ kind: "item", id: SF }, { kind: "other" }], [SF]), [{ keep: 1 }]);
check("127 Special bar: nothing to drop", planWithout([{ kind: "item", id: "x" }], [SF]), null);
check("128 no ids", planWithout([{ kind: "item", id: "x" }], [null]), null);

/* ── Starry Form data ─────────────────────────────────────────────────────── */

check("130 constellations", CONSTELLATIONS, ["archer", "chalice", "dragon"]);
check("131 activity names", ["Archer", "Chalice", "Dragon", "Consume Wild Shape", "dragon form"].map(n => constellationOfActivity({ name: n })),
  ["archer", "chalice", "dragon", null, "dragon"]);
check("132 light: bright 10, dim 10 more", [STARRY_LIGHT.bright, STARRY_LIGHT.dim], [10, 20]);
check("133 lasts 10 minutes", STARRY_SECONDS, 600);
const dragonBase = { _id: "FjlMdXqnzWeB34Ls", name: "Dragon Form (Twinkling)", img: "d.webp", transfer: true, disabled: true,
  system: { changes: [{ key: "system.attributes.movement.fly", value: 20, type: "override" }] }, _stats: { x: 1 }, sort: 4,
  duration: { value: 600, units: "seconds", expiry: "turnStart" }, flags: { dnd5e: { riders: {} } } };
const se = starryEffectData({ base: dragonBase, constellation: "dragon", label: "Dragon", now: 30, origin: "Actor.a.Item.b", id: "pentarynStarry00", description: "<p>x</p>" });
// The PHB item's stored effect keeps the pre-6 key (dnd5e redirects it on apply); one written fresh
// under 6.0 uses movement.speeds.fly. Both are the Twinkling one; the plain Dragon has neither.
const dragon6 = { name: "Dragon Form (Twinkling)", system: { changes: [{ key: "system.attributes.movement.speeds.fly", value: "20", type: "override" }] } };
const dragonPlain = { name: "Dragon Form", system: { changes: [{ key: "flags.dnd5e.minimumRoll", value: 10 }] } };
check("133a fly: old key, new key, none, hover only, legacy top-level changes", [
  grantsFly(dragonBase), grantsFly(dragon6), grantsFly(dragonPlain),
  grantsFly({ system: { changes: [{ key: "system.attributes.movement.hover", value: true }] } }),
  grantsFly({ changes: [{ key: "system.attributes.movement.speeds.fly", value: 20 }] }), grantsFly(null)
], [true, true, false, false, true, false]);
check("133b the Twinkling dragon is picked from either key", [dragonPlain, dragon6].find(grantsFly)?.name, "Dragon Form (Twinkling)");
check("134 effect: id, name, enabled, not transferred", [se._id, se.name, se.disabled, se.transfer], ["pentarynStarry00", "Starry Form: Dragon", false, false]);
check("135 effect: started now, off the world clock (D8-starry: no duration value)", [se.duration, se.start], [{ value: null, units: "seconds", expiry: null }, { time: 30 }]);
check("136 effect: keeps the Dragon's changes", se.system.changes.length, 1);
check("137 effect: flag (10 minutes of combat left) + origin, no _stats/sort, dnd5e flags kept + isTemporary (D8-starry)",
  [se.flags[MODULE], se.origin, "_stats" in se, "sort" in se, se.flags.dnd5e],
  [{ starry: { constellation: "dragon", left: 600 } }, "Actor.a.Item.b", false, false, { riders: {}, isTemporary: true }]);
ok("138 base not mutated", dragonBase.disabled === true && dragonBase._stats);
check("139 bare effect", starryEffectData({ constellation: "archer", label: "Archer", now: 0, id: "pentarynStarry00" }).img,
  "icons/magic/symbols/star-solid-gold.webp");
check("140 blocks", [
  starryBlock({ shifted: true }), starryBlock({ incapacitated: true }), starryBlock({ usesLeft: 0 }),
  starryBlock({ usesLeft: 0, spends: false }), starryBlock({ usesLeft: 2 }), starryBlock({ usesLeft: null })
], ["shifted", "incapacitated", "noUses", null, null, null]);

check("141 body swap: a new actor, dnd5e's swap flags, wrapped values; not a move or the same actor", [
  isBodySwap({ actorId: "form1", width: 2 }, { actorId: "talo" }),
  isBodySwap({ actorId: "talo" }, { actorId: "talo" }),
  isBodySwap({ x: 100, y: 200 }, { actorId: "talo" }),
  isBodySwap({ "flags.dnd5e.previousTokenData": { texture: {} } }, { actorId: "talo" }),
  isBodySwap({ flags: { dnd5e: { previousActorData: {} } } }, { actorId: "talo" }),
  isBodySwap({ actorId: { op: "talo" } }, { actorId: "form1", unwrap: v => (v && typeof v === "object" && "op" in v ? v.op : v) }),
  isBodySwap({ flags: { "pentaryn-senses": {} } }, { actorId: "talo" }),
  isBodySwap(null)
], [true, false, false, true, true, true, false, false]);

/* ── play-test fixes (fix/playtest-2026-10-11) ────────────────────────────── */

// PT3-3: a druid with no hand-made revert item still gets "Return to <name>" while shifted.
check("150 shifted, no revert item → a synthesized Return, highlighted, before Change Form",
  planBonusBar([{ kind: "weaponSet" }, { kind: "other" }], { revertIds: [], shifted: true, revertId: null, hasWildShape: true }),
  [{ keep: 0 }, { revert: true, highlight: true }, { wildshape: true }, { keep: 1 }]);
check("151 shifted with Talo's revert item → that item, no synthesized duplicate",
  planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: RV }], { revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true })
    .filter(p => p.revert || p.item === RV).length, 1);
check("152 normal form never synthesizes a Return",
  planBonusBar([{ kind: "weaponSet" }], { revertIds: [], shifted: false, hasWildShape: true }).some(p => p.revert), false);
check("157 a Polymorph form (ownReturn false) gets no synthesized Return; a revert item still shows",
  [planBonusBar([{ kind: "weaponSet" }], { revertIds: [], shifted: true, revertId: null, hasWildShape: true, ownReturn: false }).some(p => p.revert),
   planBonusBar([{ kind: "weaponSet" }, { kind: "item", id: RV }], { revertIds: [RV], shifted: true, revertId: RV, hasWildShape: true, ownReturn: false })
     .some(p => p.item === RV)], [false, true]);

// PT3-4: Starry Form never goes into a beast form, even when its "Consume Wild Shape" target is not
// the druid's Wild Shape id (a compendium id, a stale id): the PHB takes it "rather than shape-shifting".
const starryOddTarget = feat("starryOddTgt001", "Starry Form", "class", {
  ...act("so1", "utility", "bonus", [{ type: "itemUses", target: "compendiumWSid01" }]),
  ...act("so2", "attack", "bonus")
}, { system: { identifier: "starry-form" } });
check("153 Starry Form stripped by identity when its target is not this druid's Wild Shape", stripReason(starryOddTarget, ctx), "starry-form");
check("154 Starry Form stripped by name without an identifier",
  stripReason(feat("starryNoIdent01", "Starry Form", "class", act("sn1", "utility", "bonus")), ctx), "starry-form");
check("155 keepInForm still wins over Starry Form", stripReason(feat("starryKept00001", "Starry Form", "class",
  act("sk1", "utility", "bonus"), { flags: { [MODULE]: { keepInForm: true } }, system: { identifier: "starry-form" } }), ctx), null);
check("156 a beast feature named like it is not stripped (not the host's)",
  stripForForm([starryOddTarget], { wildShapeIds: [WS], hostItemIds: [] }).stripped, []);

/* ── report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.log(`✗ pentaryn-transform core: ${failures.length} failed, ${pass} passed`);
  console.log(failures.join("\n"));
} else {
  console.log(`✓ pentaryn-transform core: ${pass} passed`);
}
if (failures.length) process.exit(1);
