// combat-riders-23 (guide §4): table-core's isConcentration, pure, and its equivalence with the
// cleanup's own token match (summonTokenIds) — the recipe's table.
import { test } from "node:test";
import assert from "node:assert/strict";

const { isConcentration, summonTokenIds, MODULE } = await import("../table-core.mjs");

test("isConcentration: a Set or an array of statuses; no statuses → false", () => {
  assert.equal(isConcentration({ statuses: new Set(["concentrating"]) }, "concentrating"), true);
  assert.equal(isConcentration({ statuses: ["concentrating", "x"] }), true);
  assert.equal(isConcentration({ statuses: ["dodging"] }, "concentrating"), false);
  assert.equal(isConcentration({}, "concentrating"), false);
  assert.equal(isConcentration(null), false);
  assert.equal(isConcentration({ statuses: new Set(["conc2"]) }, "conc2"), true, "CONFIG's own status id");
});

test("summonTokenIds: only the tokens stamped with that effect's uuid", () => {
  const tokens = [{ id: "t1", flags: { [MODULE]: { concentration: "Actor.a.ActiveEffect.c1" } } }, { id: "t2" }];
  assert.deepEqual(summonTokenIds(tokens, "Actor.a.ActiveEffect.dodge"), []);
  assert.deepEqual(summonTokenIds(tokens, "Actor.a.ActiveEffect.c1"), ["t1"]);
});
