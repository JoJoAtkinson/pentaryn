/**
 * ext-9 [declared] (final review ties-core, 2026-10-12; defect wave 2): `flags.writes` lists only the
 * flags the module writes. `knownCategories` (a character's extra notebook categories) and `mark` (an
 * item's `{ icon, tip, color }`) are GM-authored by hand — the module only reads them — so describe()
 * lists them under `flags.reads`. Pinned here against the manifest and the source: no module file
 * outside test/ and lib/ writes either key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { MANIFEST } = await import("../api-manifest.mjs");
const READ_ONLY = ["flags.pentaryn-ties.knownCategories", "flags.pentaryn-ties.mark"];

test("ext-9: knownCategories and mark are reads, not writes", () => {
  for (const key of READ_ONLY) {
    assert.ok(!MANIFEST.flags.writes.includes(key), `${key} is not written`);
    assert.ok(MANIFEST.flags.reads.includes(key), `${key} is read`);
  }
});

test("ext-9: no module source writes knownCategories or mark", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const skip = new Set(["test", "lib", "node_modules"]);
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (!skip.has(name)) walk(path); }
      else if (/\.m?js$/.test(name)) files.push(path);
    }
  };
  walk(root);
  const writer = /setFlag\([^)]*["'`](knownCategories|mark)["'`]|unsetFlag\([^)]*["'`](knownCategories|mark)["'`]|["'`]flags\.pentaryn-ties\.(knownCategories|mark)["'`]\s*:|KNOWN_CATEGORIES_FLAG\s*\]?\s*:/;
  const hits = files.filter(f => writer.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});
