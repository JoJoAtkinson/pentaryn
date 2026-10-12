// EC-1 (final review 2026-10-12, transform-core): useSyncUpdates skipped every item whose uses max
// is a formula. Item source data keeps the formula as a string (`@scale.druid.wild-shape-uses`), so
// `Number(max) > 0` was false and Wild Shape uses spent in the form were never copied back on
// revert. An item has a use limit when its max is a non-empty formula or a positive number; an
// empty, null or zero max is still no limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { useSyncUpdates } from "../transform-core.mjs";

const item = (max, spent) => ({ _id: "wildShape000001", type: "feat", system: { uses: { max, spent } } });

test("EC-1: a formula-max Wild Shape item's spent uses come back on revert", () => {
  assert.deepEqual(
    useSyncUpdates([item("@scale.druid.wild-shape-uses", 0)], [item("@scale.druid.wild-shape-uses", 1)]),
    [{ _id: "wildShape000001", "system.uses.spent": 0 }]
  );
  assert.deepEqual(
    useSyncUpdates([item("@prof", 2)], [item("@prof", 0)]),
    [{ _id: "wildShape000001", "system.uses.spent": 2 }]
  );
});

test("EC-1: a numeric-string max still syncs; an empty, null or zero max is no limit", () => {
  assert.deepEqual(useSyncUpdates([item("3", 2)], [item("3", 1)]), [{ _id: "wildShape000001", "system.uses.spent": 2 }]);
  for (const max of ["", "  ", null, undefined, 0, "0"]) {
    assert.deepEqual(useSyncUpdates([item(max, 1)], [item(max, 0)]), [], `max ${JSON.stringify(max)}`);
  }
});
