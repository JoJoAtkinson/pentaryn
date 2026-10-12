// Doc guard (items-journal-17, README half): no hard-coded fixture count, and no "??=" claim the code
// does not make (patchProficiencyMap tests `== null`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README states no fixture count", () => {
  assert.doesNotMatch(README, /\d+ fixtures/);
});

test("README does not claim the proficiency patch uses ??=", () => {
  assert.doesNotMatch(README, /\?\?=/);
});

// items-journal-17 (optional check from the finding): the README's API table has a row for every
// method the manifest publishes, so describe() and the README cannot drift apart silently.
test("README API table names every manifest row", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const api = README.slice(README.indexOf("## API"), README.indexOf("\n## ", README.indexOf("## API") + 1));
  const rows = new Set([...api.matchAll(/^\| `([A-Za-z]+)\(/gm)].map(m => m[1]));
  const paths = MANIFEST.rows.map(r => r.path);
  assert.ok(paths.length >= 7);
  assert.deepEqual(paths.filter(p => !rows.has(p)), []);
});

// [declared] ATT-AC-2-residual: an Item Piles take-all can also move coin; Item Piles writes that
// currency itself with an absolute value, outside the purse chain. The README says so under
// "Two sessions / who writes", and that the purse's 750 ms claim settle orders the payout after it.
test("[declared] ATT-AC-2-residual: README says Item Piles' own currency write is outside the purse chain", () => {
  const start = README.indexOf("## Two sessions / who writes");
  assert.ok(start >= 0, "README has a Two sessions / who writes section");
  const sec = README.slice(start, README.indexOf("\n## ", start + 1));
  assert.match(sec, /Item Piles currency transfer/);
  assert.match(sec, /absolute value/);
  assert.match(sec, /outside this chain/);
  assert.match(sec, /750 ms claim settle/);
});

// [declared] M4: the adapter holds the SHARED writes (stash, releaseAway, writeSlots, the serial
// lane) and the third-party reads, not every document write: sheet.mjs (attune/unattune) and
// bonds.mjs (hand-back, purse) write their own hook-driven updates. README "Extending" and the
// adapter's header both say so.
test("[declared] M4: README and adapter header say the adapter holds the shared writes, not every write", () => {
  const start = README.indexOf("## Extending");
  assert.ok(start >= 0, "README has an Extending section");
  const sec = README.slice(start, README.indexOf("\n## ", start + 1)).replace(/\s+/g, " ");
  assert.doesNotMatch(sec, /Document writes and third-party reads go in/);
  assert.match(sec, /shared writes \(`stash`, `releaseAway`, `writeSlots`, the `serial` lane\) and third-party reads go in `actor-adapter\.mjs`/);
  assert.match(sec, /sheet\.mjs.*attune\/unattune/);
  assert.match(sec, /bonds\.mjs.*hand-back and purse/);
  const src = readFileSync(new URL("../actor-adapter.mjs", import.meta.url), "utf8");
  const header = src.slice(0, src.indexOf("*/")).replace(/\s*\*\s*/g, " ");
  assert.doesNotMatch(header, /the writes to actor and item documents/);
  assert.match(header, /shared writes \(stash, releaseAway, writeSlots, the serial lane\)/);
  assert.match(header, /sheet\.mjs attune\/unattune/);
  assert.match(header, /bonds\.mjs hand-back and purse/);
});
