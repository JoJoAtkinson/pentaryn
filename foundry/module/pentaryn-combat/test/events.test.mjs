// Guide S9 [declared B2]: the module's events are core HOOKS rows. emit fires the new
// pentaryn-combat.* name first, then the legacy pentarynCombat.* name, with the same arguments;
// past `until` the legacy name still fires and the kit warns once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOKS, MODULE } from "../combat-core.mjs";
import { emitter } from "../lib/hooks.mjs";

const fakeHooks = () => {
  const calls = [];
  return { calls, Hooks: { callAll: (name, ...args) => { calls.push([name, ...args]); return true; }, call: () => true } };
};

test("seven rows, each pentaryn-combat.<key> with its legacy name and an until; none vetoable", () => {
  assert.deepEqual(Object.keys(HOOKS), ["usage", "offhand", "bonusSpent", "bonusAction", "reaction", "otherAction", "sequenceEnd"]);
  for (const [key, row] of Object.entries(HOOKS)) {
    assert.equal(row.name, `pentaryn-combat.${key}`);
    assert.equal(row.legacyName, `pentarynCombat.${key}`);
    assert.equal(row.until, "pentaryn-combat 0.4.0");
    assert.equal(row.pre, false);
    assert.ok(Object.isFrozen(row));
  }
});

test("emit('usage', a, 'main') fires the new name, then the legacy name, with the same arguments", () => {
  const { calls, Hooks } = fakeHooks();
  const emit = emitter(MODULE, HOOKS, { g: { Hooks }, version: "0.3.0" });
  const a = { id: "act" };
  assert.equal(emit("usage", a, "main"), true);
  assert.deepEqual(calls, [["pentaryn-combat.usage", a, "main"], ["pentarynCombat.usage", a, "main"]]);
  assert.throws(() => emit("nope"), /BAD_ARGS/);
});

test("past until: both names still fire, one warning per legacy name", () => {
  const { calls, Hooks } = fakeHooks();
  const warned = [];
  const log = { warnOnce: (key, msg) => { if (!warned.some(w => w[0] === key)) warned.push([key, msg]); } };
  const emit = emitter(MODULE, HOOKS, { g: { Hooks }, log, version: "0.4.0" });
  emit("sequenceEnd", 1);
  emit("sequenceEnd", 2);
  assert.equal(calls.length, 4);
  assert.deepEqual(warned.map(w => w[0]), ["legacy:pentarynCombat.sequenceEnd"]);
});
