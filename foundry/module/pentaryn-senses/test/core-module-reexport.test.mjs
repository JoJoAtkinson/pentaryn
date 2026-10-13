/**
 * senses-M6 [declared] (final review 2026-10-12): MODULE is defined once, in core/ids.mjs, and the
 * barrel imports it from there. core/light, core/chain and core/migrate used to re-export it
 * (`export { MODULE }`) with nothing importing it through them; those dead re-exports are gone.
 * No behaviour change: the barrel's MODULE is the same string.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("senses-M6: core/light, core/chain and core/migrate do not re-export MODULE", () => {
  for (const path of ["core/light.mjs", "core/chain.mjs", "core/migrate.mjs"]) {
    assert.doesNotMatch(read(path), /^export \{[^}]*\bMODULE\b[^}]*\}/m, `${path} re-exports MODULE`);
  }
});

test("senses-M6: the barrel imports MODULE from core/ids.mjs", () => {
  assert.match(read("senses-core.mjs"), /^import \{[^}]*\bMODULE\b[^}]*\} from "\.\/core\/ids\.mjs";/m);
});

test("senses-M6: the barrel's MODULE is still the module id", async () => {
  const core = await import("../senses-core.mjs");
  const ids = await import("../core/ids.mjs");
  assert.equal(core.MODULE, "pentaryn-senses");
  assert.equal(core.MODULE, ids.MODULE);
});
