// Finding -33's guard: every API row — the manifest's own and the features' contributions — is
// named as a call in the README's API table, so a new method cannot ship undocumented. Pure: the
// manifest is plain data and the README is read from disk; no Foundry stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MANIFEST, BADGE_ROWS, PARTY_ROWS } from "../api-manifest.mjs";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const api = readme.slice(readme.indexOf("## API"), readme.indexOf("\n## ", readme.indexOf("## API") + 1));

test("the README has an API section", () => {
  assert.ok(api.startsWith("## API — game.pentaryn.portals"));
});

for (const row of [...MANIFEST.rows, ...BADGE_ROWS, ...PARTY_ROWS]) {
  test(`README API table names \`${row.path}(\``, () => {
    assert.ok(api.includes(`| \`${row.path}(`), `README.md ## API has no row for ${row.path}`);
  });
}

test("the README names the kit members describe/settings/trace/uninstall/version/contract", () => {
  for (const m of ["describe()", "settings()", "trace()", "uninstall()", "version", "contract"]) assert.ok(api.includes(`\`${m}\``), m);
});
