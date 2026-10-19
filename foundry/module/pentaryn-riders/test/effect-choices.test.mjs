// Feedback tNdOEx / tiDvFa (Marwen, the Transmuter's Stone): pick-one passive effects.
// The pure rules (core/choices.mjs), then effect-choices.mjs on a client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, setupWorld } from "./fixtures/world.mjs";

const { choiceOf, choiceLimit, choiceToDisable, CHOICE_FLAG } = await import("../core/choices.mjs");

/* ── pure ─────────────────────────────────────────────────────────────────── */

test("choiceOf: the flag's group and max (default 1); no flag, no group or a blank group → null", () => {
  assert.equal(CHOICE_FLAG, "choice");
  const f = c => ({ flags: { [MODULE]: { choice: c } } });
  assert.deepEqual(choiceOf(f({ group: "stone" }), MODULE), { group: "stone", max: 1 });
  assert.deepEqual(choiceOf(f({ group: " stone ", max: "2" }), MODULE), { group: "stone", max: "2" });
  for (const bad of [{}, { flags: {} }, f(null), f("stone"), f({ group: "" }), f({ group: "  " }), f({ max: 2 }), null]) {
    assert.equal(choiceOf(bad, MODULE), null, JSON.stringify(bad));
  }
});

test("choiceLimit: a number, a numeric string, a formula through the evaluator; anything unusable is 1", () => {
  assert.equal(choiceLimit(2), 2);
  assert.equal(choiceLimit("2"), 2);
  assert.equal(choiceLimit("min(2, 1 + floor(@classes.wizard.levels / 10))", () => 2), 2);
  assert.equal(choiceLimit("@x", () => { throw new Error("bad"); }), 1);
  assert.equal(choiceLimit("@x"), 1, "no evaluator");
  for (const bad of [0, -1, null, undefined, NaN, "", "abc"]) assert.equal(choiceLimit(bad, () => NaN), 1, String(bad));
  assert.equal(choiceLimit(1.9), 1);
});

test("choiceToDisable: limit 1 turns off every other of the group that is on; other groups and off ones stay", () => {
  const effects = [
    { id: "dark", group: "stone", disabled: false, modified: 1 },
    { id: "speed", group: "stone", disabled: false, modified: 3 },   // the one just turned on
    { id: "fire", group: "stone", disabled: true, modified: 2 },
    { id: "armor", group: null, disabled: false, modified: 5 },
    { id: "other", group: "boots", disabled: false, modified: 4 },
  ];
  assert.deepEqual(choiceToDisable("speed", effects, "stone", 1), ["dark"]);
  assert.deepEqual(choiceToDisable("dark", effects, "stone", 2), [], "two may be on");
});

test("choiceToDisable: limit 2 keeps the most recently changed other, turns off the older ones (oldest first)", () => {
  const effects = [
    { id: "a", group: "g", disabled: false, modified: 10 },
    { id: "b", group: "g", disabled: false, modified: 30 },
    { id: "c", group: "g", disabled: false, modified: 20 },
    { id: "new", group: "g", disabled: false, modified: 40 },
  ];
  assert.deepEqual(choiceToDisable("new", effects, "g", 2), ["a", "c"]);
  assert.deepEqual(choiceToDisable("new", [], "g", 1), []);
  assert.deepEqual(choiceToDisable("new", null, "g", 1), []);
});

/* ── on a client ──────────────────────────────────────────────────────────── */

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");

/** A feature item carrying stone effects; `updateEmbeddedDocuments` is logged and applied. */
function stone({ wizardLevels = 6, max = 1 } = {}) {
  const writes = [];
  const actor = { documentName: "Actor", getRollData: () => ({ classes: { wizard: { levels: wizardLevels } } }) };
  const eff = (id, name, disabled, modifiedTime, choice = { group: "transmuters-stone", max }) => ({
    id, name, disabled, _stats: { modifiedTime }, flags: choice ? { [MODULE]: { choice } } : {},
  });
  const item = {
    documentName: "Item", actor,
    effects: [
      eff("bearer", "Transmuter's Stone", false, 1, null),
      eff("dark", "Transmuter's Stone: Darkvision", false, 2),
      eff("speed", "Transmuter's Stone: Speed", true, 3),
      eff("fire", "Transmuter's Stone: Resistance (Fire)", true, 4),
    ],
    async updateEmbeddedDocuments(name, updates, options) {
      writes.push({ name, updates, options });
      for (const u of updates) Object.assign(item.effects.find(e => e.id === u._id), u);
      return updates;
    },
  };
  for (const e of item.effects) e.parent = item;
  return { item, writes, get: id => item.effects.find(e => e.id === id) };
}

const turnOn = (s, id, userId = IDS.gm) => {
  const e = s.get(id);
  e.disabled = false;
  e._stats.modifiedTime = 100;
  return F.fire("updateActiveEffect", e, { disabled: false, _id: id }, {}, userId);
};

test("turning Speed on turns Darkvision off (one write, ids only); the always-on bearer effect is untouched", async () => {
  const s = stone();
  turnOn(s, "speed");
  await Promise.resolve();
  assert.deepEqual(s.writes, [{ name: "ActiveEffect", updates: [{ _id: "dark", disabled: true }], options: { pentarynRidersChoice: true } }]);
  assert.equal(s.get("dark").disabled, true);
  assert.equal(s.get("bearer").disabled, false);
  assert.equal(s.get("speed").disabled, false);
});

test("only the toggling user's client writes; a turn-off, an unflagged effect or another change writes nothing", async () => {
  const s = stone();
  turnOn(s, "speed", IDS.player);                      // the player toggled: the GM's tab stays out
  F.fire("updateActiveEffect", s.get("dark"), { disabled: true }, {}, IDS.gm);
  F.fire("updateActiveEffect", s.get("bearer"), { disabled: false }, {}, IDS.gm);
  F.fire("updateActiveEffect", s.get("fire"), { name: "x" }, {}, IDS.gm);
  await Promise.resolve();
  assert.deepEqual(s.writes, []);
});

test("max as a formula over the actor's roll data: Wizard 10 keeps two benefits, Wizard 6 one", async () => {
  globalThis.dnd5e = { utils: { simplifyBonus: (formula, data) => Math.min(2, 1 + Math.floor(data.classes.wizard.levels / 10)) } };
  try {
    const f = "min(2, 1 + floor(@classes.wizard.levels / 10))";
    const ten = stone({ wizardLevels: 10, max: f });
    turnOn(ten, "fire");
    await Promise.resolve();
    assert.deepEqual(ten.writes, [], "Darkvision + Fire resistance");
    const six = stone({ wizardLevels: 6, max: f });
    turnOn(six, "fire");
    await Promise.resolve();
    assert.deepEqual(six.writes.map(w => w.updates), [[{ _id: "dark", disabled: true }]]);
  } finally { delete globalThis.dnd5e; }
});

test("a failed write warns once and throws nothing into the hook", async () => {
  const s = stone();
  s.item.updateEmbeddedDocuments = async () => { throw new Error("no permission"); };
  W.take();
  turnOn(s, "speed");
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(W.take(), [["warn", `${MODULE} | effect choice: turning the others off failed`, "no permission"]]);
});
