// items-journal-27: the {restoring: true} create option is a tag nothing consumes. It appears only where
// restore sets it and where shouldCaptureDelete documents it (a guard a create never reaches), so neither
// keeping nor dropping it is observable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";

test("'restoring' appears only in ledger.mjs (set) and ledger-core.mjs (the dead guard)", () => {
  const hits = sourceScan(new URL("..", import.meta.url), /restoring/);
  assert.deepEqual([...new Set(hits.map(h => h.file))].sort(), ["ledger-core.mjs", "ledger.mjs"]);
  assert.equal(hits.length, 2, JSON.stringify(hits));
});
