// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../reactions-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  for (const fn of ["triggerOf", "optionsFor", "suppression", "cardKey", "mergeCard", "cardLines", "closeReason"]) {
    assert.equal(typeof core[fn], "function", fn);
  }
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, manifest.flags.pentaryn.namespace);
  assert.equal(core.CSS, manifest.flags.pentaryn.cssPrefix);
  assert.equal(core.FLAG_SCOPE, manifest.flags.pentaryn.flagScope);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
});

test("every HOOKS row is named pentaryn-<short>.* (or carries a legacyName with an until)", () => {
  for (const [key, row] of Object.entries(core.HOOKS)) {
    assert.ok(row.name.startsWith(`${core.MODULE}.`), key);
    if (row.legacyName) assert.ok(row.until, `${key}: legacyName needs until`);
  }
});

/* ── the hit rule (dnd5e's evaluatedTargets, with "unknown" for no AC) ────────────────────── */

test("hitOutcome: a crit always hits, a natural 1 always misses, else total vs AC; no AC is unknown", () => {
  const table = [
    [{ total: 18, ac: 16 }, "hit"],
    [{ total: 16, ac: 16 }, "hit"],
    [{ total: 15, ac: 16 }, "miss"],
    [{ total: 3, ac: 16, isCritical: true }, "hit"],
    [{ total: 25, ac: 16, isFumble: true }, "miss"],
    [{ total: 18, ac: null }, "unknown"],
    [{ total: 18 }, "unknown"],
    [{ ac: 16 }, "miss"],
    [{}, "unknown"],
  ];
  for (const [input, want] of table) assert.equal(core.hitOutcome(input), want, JSON.stringify(input));
});

/* ── the trigger ──────────────────────────────────────────────────────────────────────────── */

const T = { marrith: { actor: "Actor.m", token: "Scene.s.Token.tm", name: "Marrith", ac: 16 }, caven: { actor: "Actor.c", token: "Scene.s.Token.tc", name: "Caven", ac: 15 } };
const speaker = { actor: "g", token: "tg", alias: "Grick" };
const attackMsg = (over = {}) => ({ id: "msgA", type: "attack", flavor: "Bite - Attack Roll", public: true, speaker, item: { name: "Bite" }, origin: "usage1",
  rolls: [{ total: 18, isCritical: false, isFumble: false }], targets: [T.marrith, T.caven], ...over });
const damageMsg = (over = {}) => ({ id: "msgD", type: "damage", public: true, speaker, item: { name: "Bite" }, origin: "usage1",
  rolls: [{ total: 9, type: "piercing" }], targets: [T.marrith], ...over });

test("triggerOf: an attack card lists only the targets the roll hit", () => {
  const got = core.triggerOf(attackMsg());
  assert.deepEqual(got, {
    kind: "hit", id: "msgA", origin: "usage1", public: true, attack: "Bite",
    attacker: { key: "Token.tg", name: "Grick", actor: "g" }, types: [],
    targets: [
      { actor: "Actor.m", token: "Scene.s.Token.tm", name: "Marrith", ac: 16, total: 18 },
      { actor: "Actor.c", token: "Scene.s.Token.tc", name: "Caven", ac: 15, total: 18 },
    ],
  });
  assert.deepEqual(core.triggerOf(attackMsg({ rolls: [{ total: 15 }] })).targets.map(t => t.name), ["Caven"], "15 misses AC 16, hits AC 15");
  assert.equal(core.triggerOf(attackMsg({ rolls: [{ total: 14 }] })), null, "a miss on everyone is no trigger");
  assert.equal(core.triggerOf(attackMsg({ targets: [{ ...T.marrith, ac: null }] })), null, "an unknown AC is no trigger");
  assert.deepEqual(core.triggerOf(attackMsg({ rolls: [{ total: 2, isCritical: true }] })).targets.length, 2, "a crit hits both");
  assert.equal(core.triggerOf(attackMsg({ rolls: [] })), null, "no roll, no trigger");
  assert.equal(core.triggerOf(attackMsg({ targets: [] })), null, "no target, no trigger");
});

test("triggerOf: a damage card lists every target with the damage types; healing alone is none", () => {
  const got = core.triggerOf(damageMsg({ rolls: [{ total: 9, type: "fire" }, { total: 4, type: "piercing" }, { total: -2, type: "fire" }] }));
  assert.equal(got.kind, "damage");
  assert.deepEqual(got.types, ["fire", "piercing"]);
  assert.deepEqual(got.targets, [{ actor: "Actor.m", token: "Scene.s.Token.tm", name: "Marrith", ac: 16, total: 13 }], "negative rolls count 0");
  assert.equal(core.triggerOf(damageMsg({ rolls: [{ total: 9, type: "healing" }] })), null);
  assert.equal(core.triggerOf(damageMsg({ rolls: [{ total: 5, type: "temphp" }, { total: 9, type: "healing" }] })), null);
  assert.deepEqual(core.triggerOf(damageMsg({ rolls: [{ total: 9 }] })).types, ["untyped"]);
  assert.equal(core.triggerOf(damageMsg({ rolls: [{ total: NaN, type: "fire" }] })), null, "no total, no trigger");
});

test("triggerOf: other cards, missing data and privacy", () => {
  assert.equal(core.triggerOf(attackMsg({ type: "usage" })), null);
  assert.equal(core.triggerOf(attackMsg({ type: "save" })), null);
  assert.equal(core.triggerOf(null), null);
  assert.equal(core.triggerOf({}), null);
  assert.equal(core.triggerOf(attackMsg({ targets: [{ actor: null, name: "ghost", ac: 10 }] })), null, "a target without an actor uuid is skipped");
  const t = core.triggerOf(attackMsg({ item: {}, flavor: "Rend - Attack Roll", speaker: { alias: "" }, public: false }));
  assert.equal(t.attack, "Rend", "the flavor's first part names the attack when the item does not");
  assert.deepEqual(t.attacker, { key: "unknown", name: "Someone", actor: null });
  assert.equal(t.public, false);
  assert.equal(core.triggerOf(attackMsg({ item: {}, flavor: "", activity: { name: "Claw" } })).attack, "Claw");
  assert.equal(core.triggerOf(attackMsg({ item: {}, flavor: "" })).attack, "an attack");
  assert.equal(core.triggerOf(attackMsg({ speaker: { actor: "g" } })).attacker.key, "Actor.g");
});

/* ── the options ──────────────────────────────────────────────────────────────────────────── */

const SLOTS = [{ key: "spell1", level: 1, value: 2, max: 3 }, { key: "spell2", level: 2, value: 0, max: 2 }, { key: "spell3", level: 3, value: 0, max: 1 }];
const rec = (name, over = {}) => ({ id: name, uuid: `Actor.m.Item.${name}.Activity.a`, name, img: `icons/${name}.webp`, activation: "reaction", ...over });
const spell = (level, slots = SLOTS) => ({ level, usesSlots: true, slots });

test("ruleFor: dnd5e identifier, then the name's slug, then a loose row; Counterspell, Cosmic Omen and weapons are not on the list", () => {
  assert.equal(core.ruleFor({ identifier: "shield", name: "Shield (Wizard)" })?.trigger, "hit");
  assert.equal(core.ruleFor({ identifier: "shield-of-faith" }), null, "exact, not a prefix");
  assert.equal(core.ruleFor({ name: "Absorb Elements" })?.key, "absorb-elements");
  assert.equal(core.ruleFor({ name: "Maneuver: Parry" })?.key, "parry", "a loose row matches inside the slug");
  assert.equal(core.ruleFor({ identifier: "parry-riposte" })?.key, "parry");
  assert.equal(core.ruleFor({ name: "Counterspell" }), null);
  assert.equal(core.ruleFor({ name: "Cosmic Omen" }), null);
  assert.equal(core.ruleFor({ name: "Longsword" }), null, "an opportunity attack's weapon is no option in this phase");
  assert.equal(core.ruleFor({}), null);
  assert.equal(core.slug("Hellish  Rebuke!"), "hellish-rebuke");
});

test("slotCast: dnd5e's requiresSpellSlot wins when the activity has it; else a levelled spell under any method but at-will / innate / ritual", () => {
  const table = [
    [{ level: 1, method: "spell", requiresSpellSlot: true }, true],
    [{ level: 1, method: "spell", requiresSpellSlot: false }, false, "dnd5e says no (no spell table on the actor): no slot"],
    [{ level: 1, method: "innate", requiresSpellSlot: true }, true, "dnd5e says yes: a slot, whatever the method"],
    [{ level: 1, method: "spell" }, true, "no getter: spell casts from slots even with no `slots` key anywhere"],
    [{ level: 1, method: "pact" }, true, "no getter: pact casts from slots"],
    [{ level: 1, method: "innate" }, false],
    [{ level: 1, method: "atwill" }, false],
    [{ level: 1, method: "ritual" }, false],
    [{ level: 0, method: "spell" }, false, "a cantrip"],
    [{ level: 1, method: null }, true, "no method recorded: a levelled spell still needs a slot"],
    [{ level: 1, method: "spell", requiresSpellSlot: "yes" }, true, "a non-boolean getter value is ignored"],
    [{}, false],
  ];
  for (const [input, want, why] of table) assert.equal(core.slotCast(input), want, why ?? JSON.stringify(input));
  assert.deepEqual([...core.SLOTLESS_METHODS], ["atwill", "innate", "ritual"]);
});

test("affordableSlots: the keys that can pay, in table order; none for a cantrip or a slotless spell", () => {
  assert.deepEqual(core.affordableSlots(spell(1)), ["spell1"]);
  assert.deepEqual(core.affordableSlots(spell(2)), []);
  assert.deepEqual(core.affordableSlots(spell(1, [{ key: "spell1", level: 1, value: 1, max: 3 }, { key: "pact", level: 3, value: 1, max: 1 }])), ["spell1", "pact"]);
  assert.deepEqual(core.affordableSlots(spell(1, [{ level: 2, value: 1, max: 1 }])), ["spell2"], "a slot without a key is named by its level");
  assert.deepEqual(core.affordableSlots(spell(1, [{ key: "spell1", level: 1, value: 1, max: 0 }, null])), [], "max 0 or a hole is no slot");
  assert.deepEqual(core.affordableSlots(spell(0)), []);
  assert.deepEqual(core.affordableSlots({ level: 1, usesSlots: false, slots: SLOTS }), []);
  assert.deepEqual(core.affordableSlots({ level: 1, slots: null }), []);
  assert.deepEqual(core.affordableSlots(), []);
});

test("limitedUses: a numeric max > 0 limits, 0 does not; an unresolved formula max falls back to value, never to unlimited", () => {
  const table = [
    [null, null],
    [{ value: 2, max: 3 }, { value: 2 }],
    [{ value: 0, max: 0 }, null, "no uses configured"],
    [{ value: 0, max: "" }, null, "dnd5e's empty formula"],
    [{ value: 0, max: "@abilities.cha.mod" }, { value: 0 }, "a formula not yet resolved: value decides"],
    [{ value: 1, max: "@abilities.cha.mod" }, { value: 1 }],
    [{ value: null, max: "@abilities.cha.mod" }, null, "no value either: unlimited"],
    [{ max: NaN }, null],
    [{ value: "1", max: "2" }, { value: "1" }, "numeric strings"],
    ["3", null],
  ];
  for (const [input, want, why] of table) assert.deepEqual(core.limitedUses(input), want, why ?? JSON.stringify(input));
});

test("affordable: a use left, or a slot of the spell's level or higher with a use left; cantrips and at-will need nothing", () => {
  const table = [
    [{}, true],
    [{ uses: { value: 2 } }, true],
    [{ uses: { value: 0 } }, false],
    [{ uses: { value: "1" } }, true],
    [{ spell: spell(1) }, true],
    [{ spell: spell(2) }, false, "2nd-level slots empty, no 3rd"],
    [{ spell: spell(2, [{ level: 2, value: 0, max: 2 }, { level: 3, value: 1, max: 1 }]) }, true, "a higher slot pays"],
    [{ spell: spell(1, [{ level: 1, value: 1, max: 0 }]) }, false, "max 0 is no slot"],
    [{ spell: spell(0) }, true, "a cantrip"],
    [{ spell: { level: 1, usesSlots: false, slots: [] } }, true, "innate / at-will"],
    [{ spell: { level: 1, usesSlots: true } }, false, "no slot table at all"],
    [{ uses: { value: 1 }, spell: spell(1, []) }, false, "a use left but no slot"],
    [{ uses: { value: 0 }, spell: spell(1) }, false, "a slot but no use left"],
  ];
  for (const [input, want, why] of table) assert.equal(core.affordable(input), want, why ?? JSON.stringify(input));
});

test("optionsFor: reaction-timed, on the list for this trigger (and damage type), affordable; one per uuid", () => {
  const records = [
    rec("Shield", { identifier: "shield", spell: spell(1) }),
    rec("Absorb Elements", { identifier: "absorb-elements", spell: spell(1) }),
    rec("Counterspell", { identifier: "counterspell", spell: spell(3) }),
    rec("Cosmic Omen", { identifier: "cosmic-omen", uses: { value: 2 } }),
    rec("Longsword", { identifier: "longsword" }),
    rec("Fire Bolt", { identifier: "fire-bolt", activation: "action", spell: spell(0) }),
    rec("Parry", { identifier: "maneuver-parry", uses: { value: 1 } }),
    rec("Hellish Rebuke", { identifier: "hellish-rebuke", spell: spell(1) }),
  ];
  const names = (trigger, list = records) => core.optionsFor(list, trigger).map(o => o.name);
  assert.deepEqual(names({ kind: "hit" }), ["Shield", "Parry"]);
  assert.deepEqual(names({ kind: "damage", types: ["fire"] }), ["Absorb Elements", "Hellish Rebuke"]);
  assert.deepEqual(names({ kind: "damage", types: ["piercing"] }), ["Hellish Rebuke"], "Absorb Elements needs an element");
  assert.deepEqual(names({ kind: "damage", types: ["slashing", "cold"] }), ["Absorb Elements", "Hellish Rebuke"], "one element among several is enough");
  assert.deepEqual(names({ kind: "damage", types: [] }), ["Hellish Rebuke"]);
  assert.deepEqual(names({ kind: "hit" }, [rec("Shield", { identifier: "shield", spell: spell(1, [{ level: 1, value: 0, max: 3 }]) })]), [], "no slot left");
  assert.deepEqual(names({ kind: "hit" }, [rec("Parry", { identifier: "parry", uses: { value: 0 } })]), [], "no use left");
  assert.deepEqual(names({ kind: "hit" }, [rec("Shield", { identifier: "shield" }), rec("Shield", { identifier: "shield" })]), ["Shield"], "one per uuid");
  assert.deepEqual(core.optionsFor(records, null), []);
  assert.deepEqual(core.optionsFor(null, { kind: "hit" }), []);
  assert.deepEqual(core.optionsFor([rec("Shield", { identifier: "shield" })], { kind: "hit" }), [{ id: "Shield", uuid: "Actor.m.Item.Shield.Activity.a", name: "Shield", img: "icons/Shield.webp" }]);
});

/* ── the suppressions ─────────────────────────────────────────────────────────────────────── */

test("reactionSpent: pentaryn-combat's flag names the combat the PC is in", () => {
  assert.equal(core.reactionSpent({ combatId: "c1" }, "c1"), true);
  assert.equal(core.reactionSpent({ combatId: "c0" }, "c1"), false, "a stale flag from another combat");
  assert.equal(core.reactionSpent(null, "c1"), false);
  assert.equal(core.reactionSpent({ combatId: "c1" }, null), false, "out of combat nothing is spent");
});

test("suppression: spent, then down, then offline, then no options; a full state passes", () => {
  const ok = { spent: false, hp: 30, owners: ["p"], options: [{ uuid: "x" }] };
  const table = [
    [ok, null],
    [{ ...ok, spent: true }, "spent"],
    [{ ...ok, hp: 0 }, "down"],
    [{ ...ok, hp: -3 }, "down"],
    [{ ...ok, hp: null }, null, "no hp known is not down"],
    [{ ...ok, owners: [] }, "offline"],
    [{ ...ok, options: [] }, "noOptions"],
    [{ ...ok, spent: true, hp: 0, owners: [], options: [] }, "spent", "the first reason wins"],
    [{ ...ok, hp: 0, owners: [] }, "down"],
    [{ ...ok, owners: [], options: [] }, "offline"],
    [{}, "offline"],
  ];
  for (const [input, want, why] of table) assert.equal(core.suppression(input), want, why ?? JSON.stringify(input));
});

/* ── the card ─────────────────────────────────────────────────────────────────────────────── */

test("turnKey and cardKey: one card per attacker turn per PC; out of combat the usage card stands in", () => {
  assert.equal(core.turnKey({ id: "c1", round: 2, turn: 0 }), "c1:2:0");
  assert.equal(core.turnKey({ id: "c1", round: 2, turn: 0, started: false }), "nocombat");
  assert.equal(core.turnKey(null), "nocombat");
  assert.equal(core.turnKey({ id: "c1" }), "c1:0:0");
  const trigger = core.triggerOf(attackMsg());
  assert.equal(core.cardKey(trigger, "c1:2:0", "Actor.m"), "Token.tg|c1:2:0|Actor.m");
  assert.equal(core.cardKey(core.triggerOf(damageMsg()), "c1:2:0", "Actor.m"), "Token.tg|c1:2:0|Actor.m", "the damage roll of the same turn shares the key");
  assert.equal(core.cardKey(trigger, "c1:2:1", "Actor.m"), "Token.tg|c1:2:1|Actor.m", "the next turn is a new card");
  assert.equal(core.cardKey(trigger, "nocombat", "Actor.m"), "Token.tg|nocombat:usage1|Actor.m");
  assert.equal(core.cardKey(core.triggerOf(attackMsg({ origin: null })), "nocombat", "Actor.m"), "Token.tg|nocombat:msgA|Actor.m");
});

test("swingOf: one line's worth of a trigger for one target", () => {
  const t = core.triggerOf(attackMsg());
  assert.deepEqual(core.swingOf(t, t.targets[0]), { message: "msgA", kind: "hit", attack: "Bite", public: true, total: 18, ac: 16, types: [] });
  const d = core.triggerOf(damageMsg({ rolls: [{ total: 9, type: "fire" }] }));
  assert.deepEqual(core.swingOf(d, d.targets[0]), { message: "msgD", kind: "damage", attack: "Bite", public: true, total: 9, ac: 16, types: ["fire"] });
});

const incoming = (swing, options, over = {}) => ({
  key: "Token.tg|c1:2:0|Actor.m", combatId: "c1", attacker: { key: "Token.tg", name: "Grick", actor: "g" },
  pc: { uuid: "Scene.s.Token.tm", actorUuid: "Actor.m", name: "Marrith" }, swing, options, ...over,
});
const SHIELD = { id: "s", uuid: "Actor.m.Item.s.Activity.a", name: "Shield", img: null };
const ABSORB = { id: "ab", uuid: "Actor.m.Item.ab.Activity.a", name: "Absorb Elements", img: null };
const hitSwing = { message: "msgA", kind: "hit", attack: "Bite", public: true, total: 18, ac: 16, types: [] };
const fireSwing = { message: "msgD", kind: "damage", attack: "Bite", public: true, total: 9, ac: 16, types: ["fire"] };

test("mergeCard: a new card; a second swing appends and unions the options; a replay or a closed card changes nothing", () => {
  const first = core.mergeCard(null, incoming(hitSwing, [SHIELD]));
  assert.deepEqual(first, {
    key: "Token.tg|c1:2:0|Actor.m", combatId: "c1", attacker: { key: "Token.tg", name: "Grick", actor: "g" },
    pc: { uuid: "Scene.s.Token.tm", actorUuid: "Actor.m", name: "Marrith" }, swings: [hitSwing], options: [SHIELD], closed: null,
  });
  const second = core.mergeCard(first, incoming(fireSwing, [ABSORB]));
  assert.notEqual(second, first);
  assert.deepEqual(second.swings, [hitSwing, fireSwing]);
  assert.deepEqual(second.options, [SHIELD, ABSORB]);
  const third = core.mergeCard(second, incoming({ ...hitSwing, message: "msgA2", total: 20 }, [SHIELD]));
  assert.deepEqual(third.swings.map(s => s.message), ["msgA", "msgD", "msgA2"], "a second hit this turn: another line, the same option");
  assert.deepEqual(third.options, [SHIELD, ABSORB]);
  assert.equal(core.mergeCard(third, incoming(hitSwing, [SHIELD])), third, "the same message again changes nothing (===)");
  const closed = { ...third, closed: "turn" };
  assert.equal(core.mergeCard(closed, incoming({ ...hitSwing, message: "msgA3" }, [SHIELD])), closed, "a closed card never changes");
  assert.deepEqual(core.mergeCard(null, incoming(hitSwing, [SHIELD], { combatId: undefined })).combatId, null);
});

test("cardLines: one line per swing with the numbers only when the roll was public; the title follows closed", () => {
  const card = core.mergeCard(core.mergeCard(null, incoming(hitSwing, [SHIELD])), incoming(fireSwing, [ABSORB]));
  assert.deepEqual(core.cardLines(card), {
    title: "Reaction",
    lines: ["Grick hits Marrith with Bite (18 vs AC 16).", "Grick deals 9 fire damage to Marrith with Bite."],
    buttons: [{ uuid: SHIELD.uuid, name: "Shield", img: null }, { uuid: ABSORB.uuid, name: "Absorb Elements", img: null }],
    closed: null,
  });
  const quiet = core.mergeCard(null, incoming({ ...hitSwing, public: false }, [SHIELD]));
  assert.deepEqual(core.cardLines(quiet).lines, ["Grick hits Marrith with Bite."], "a whispered or blind roll shows no numbers");
  const quietDamage = core.mergeCard(null, incoming({ ...fireSwing, public: false, types: ["fire", "cold"] }, [ABSORB]));
  assert.deepEqual(core.cardLines(quietDamage).lines, ["Grick deals fire/cold damage to Marrith with Bite."]);
  assert.deepEqual(core.cardLines(core.mergeCard(null, incoming({ ...fireSwing, types: [] }, [ABSORB]))).lines, ["Grick deals 9 untyped damage to Marrith with Bite."]);
  assert.equal(core.cardLines({ ...card, closed: "turn" }).title, "Reaction window passed");
  assert.equal(core.cardLines({ ...card, closed: "ended" }).title, "Reaction window passed");
  assert.equal(core.cardLines({ ...card, closed: "spent" }).title, "Reaction spent");
  assert.deepEqual(core.cardLines(null), { title: "Reaction", lines: [], buttons: [], closed: null });
});

test("closeReason: the PC's own turn in the card's combat, the PC's Reaction spent, or the combat ended", () => {
  const card = core.mergeCard(null, incoming(hitSwing, [SHIELD]));
  const table = [
    [{ reason: "turn", actorUuid: "Actor.m", combatId: "c1" }, "turn"],
    [{ reason: "turn", actorUuid: "Actor.c", combatId: "c1" }, null, "another PC's turn"],
    [{ reason: "turn", actorUuid: "Actor.m", combatId: "c2" }, null, "another combat"],
    [{ reason: "turn", actorUuid: null, combatId: "c1" }, null],
    [{ reason: "spent", actorUuid: "Actor.m" }, "spent"],
    [{ reason: "spent", actorUuid: "Actor.c" }, null],
    [{ reason: "ended", combatId: "c1" }, "ended"],
    [{ reason: "ended", combatId: "c2" }, null],
    [{ reason: "other", actorUuid: "Actor.m", combatId: "c1" }, null],
  ];
  for (const [event, want, why] of table) assert.equal(core.closeReason(card, event), want, why ?? JSON.stringify(event));
  assert.equal(core.closeReason({ ...card, closed: "turn" }, { reason: "spent", actorUuid: "Actor.m" }), null, "already closed");
  assert.equal(core.closeReason(null, { reason: "ended", combatId: "c1" }), null);
  const outOfCombat = core.mergeCard(null, incoming(hitSwing, [SHIELD], { combatId: null }));
  assert.equal(core.closeReason(outOfCombat, { reason: "turn", actorUuid: "Actor.m", combatId: "c1" }), null, "an out-of-combat card has no turn");
  assert.equal(core.closeReason(outOfCombat, { reason: "spent", actorUuid: "Actor.m" }), "spent");
});
