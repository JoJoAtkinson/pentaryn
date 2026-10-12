// Guide S9 (C44, C45): the README names every published path in its API section and every root
// .mjs under Files; the CHANGELOG exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const readme = readFileSync(new URL("README.md", ROOT), "utf8");
const section = name => {
  const start = readme.indexOf(`\n## ${name}`);
  assert.ok(start >= 0, name);
  const end = readme.indexOf("\n## ", start + 4);
  return readme.slice(start, end < 0 ? undefined : end);
};

test("every manifest path (and Battle Medic's two contributed rows) is in the README API section", async () => {
  const { MANIFEST } = await import("../api-manifest.mjs");
  const api = section("API");
  for (const p of [...MANIFEST.rows.map(r => r.path), "installBattleMedic", "battleMedic", ...MANIFEST.unlisted]) {
    assert.ok(api.includes(`\`${p}`), p);
  }
});

test("every root .mjs and core/*.mjs is under Files; the CHANGELOG exists", () => {
  const files = section("Files");
  for (const f of readdirSync(ROOT).filter(n => n.endsWith(".mjs"))) assert.ok(files.includes(`\`${f}\``), f);
  for (const f of readdirSync(new URL("core/", ROOT))) assert.ok(files.includes(`\`core/${f}\``), f);
  assert.ok(existsSync(new URL("CHANGELOG.md", ROOT)));
});

test("every setting key is in the Settings section", async () => {
  const { SETTINGS } = await import("../settings.mjs");
  const s = section("Settings");
  for (const r of SETTINGS) assert.ok(s.includes(`\`${r.key}\``), r.key);
});
