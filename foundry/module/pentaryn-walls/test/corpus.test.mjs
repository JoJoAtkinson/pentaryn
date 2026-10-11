// The fixture corpus as node:test cases (guide step 1.5): one subtest per fixture per available backend.
// The JS engine is the reference; a compiled backend is correct exactly insofar as it passes the same
// corpus. Fixtures flagged `knownWasm` fail on wasm today and run as todo there (KNOWN, audit id given).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { available, wasmReady } from "./fixtures/engine.mjs";
import { runCorpus } from "./fixtures/runner.mjs";

await wasmReady;
const backends = available().map(b => b.name);

test("both backends are available in node (the .wasm loads through node:fs)", () => {
  assert.deepEqual(backends, ["js", "wasm"]);
});

for (const backend of available()) {
  const rows = runCorpus(backend.run);
  describe(`corpus on ${backend.name}`, () => {
    for (const row of rows) {
      const known = backend.name !== "js" && row.fx.knownWasm;
      const opts = known ? { todo: `KNOWN: wasm ignores levels (${row.fx.knownWasm})` } : {};
      test(row.name, opts, () => {
        assert.equal(row.skipped, null, `skipped: ${row.skipped}`);
        assert.deepEqual(row.problems, []);
      });
    }
  });
}
