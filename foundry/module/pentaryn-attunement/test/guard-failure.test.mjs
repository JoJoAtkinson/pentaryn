// items-journal-39 (b) [declared], failure path only: when installing the dnd5e tooltip guard throws
// (here `game.dnd5e.tooltips` is a throwing getter), the ready tick still publishes the API and
// warns once "pentaryn-attunement | tooltip guard skipped". Before the fix the throw escaped the
// tick and game.pentaryn.attunement never appeared.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { attunementWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await attunementWorld({ withTooltips: false });
F.game.dnd5e = { get tooltips() { throw new Error("frozen"); } };
await import("../attunement.mjs");

test("a throwing guard install: the API still publishes; one labelled warn", () => {
  const warns = [];
  const keep = { warn: console.warn, log: console.log };
  console.warn = (...a) => warns.push(a);
  console.log = () => {};
  try {
    F.fire("ready");
    mock.timers.tick(0);
  } finally {
    Object.assign(console, keep);
  }
  const legacy = ["report", "computeSlots", "stash", "releaseAway", "away"];
  assert.deepEqual(Object.keys(game.pentaryn.attunement).filter(k => legacy.includes(k)), legacy);
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], "pentaryn-attunement | tooltip guard skipped");
  assert.equal(warns[0][1].message, "frozen");
});

// Same world, after the publish: selftest() reports the guard check as failed instead of throwing,
// so the post-sync smoke check (`selftest().ok`) reads false rather than dying.
test("a throwing tooltips getter: selftest() returns ok:false with the error, does not throw", () => {
  let out;
  assert.doesNotThrow(() => { out = game.pentaryn.attunement.selftest(); });
  assert.equal(out.ok, false);
  const guard = out.checks.find(c => c.label.startsWith("dnd5e item-tooltip guard installed"));
  assert.equal(guard.ok, false);
  assert.equal(guard.detail, "frozen");
});
