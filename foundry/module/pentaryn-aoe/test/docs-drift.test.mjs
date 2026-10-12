// -11 docs drift: the use-doc (context/foundry/aoe.md) names every setting the menu shows, and the
// README API table names every member game.pentaryn.aoe publishes. Read from the source tables
// (SETTINGS, MANIFEST, FEATURE_ROWS, the published api), not from regexes over the code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boot } from "./fixtures/world.mjs";
import { SETTINGS } from "../settings.mjs";
import { MANIFEST, FEATURE_ROWS } from "../api-manifest.mjs";

const read = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const lang = JSON.parse(read("../lang/en.json"));
const useDoc = read("../../../../context/foundry/aoe.md");
const readme = read("../README.md");
const section = (md, heading) => {
  const at = md.indexOf(`\n## ${heading}`);
  assert.notEqual(at, -1, `no "## ${heading}" section`);
  const end = md.indexOf("\n## ", at + 1);
  return md.slice(at, end === -1 ? undefined : end);
};
const langKey = key => key.split(".").reduce((o, k) => o?.[k], lang);

test("-11 every setting's menu name is in the use-doc's settings table", () => {
  const table = section(useDoc, "Settings");
  const missing = SETTINGS.filter(r => r.config !== false)
    .map(r => ({ key: r.key, name: langKey(r.name) }))
    .filter(({ name }) => typeof name !== "string" || !table.includes(`| ${name} |`));
  assert.deepEqual(missing, []);
});

test("-11 every setting key is in the README settings table", () => {
  const table = section(readme, "Settings");
  assert.deepEqual(SETTINGS.map(r => r.key).filter(k => !table.includes(`| \`${k}\` |`)), []);
});

test("-11 every manifest and feature row has a README API row", () => {
  const table = section(readme, "API");
  const paths = [...MANIFEST.rows, ...Object.values(FEATURE_ROWS).flat()].map(r => r.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths.filter(p => !table.includes(`| \`${p}(`)), []);
});

test("-11 every published member is named in the README API section", async () => {
  await boot({ entry: true });
  const table = section(readme, "API");
  const keys = Object.keys(game.pentaryn.aoe);
  assert.ok(keys.length > 20, "the api is published");
  assert.deepEqual(keys.filter(k => !table.includes(`\`${k}`)), []);
});

test("-11 the use-doc's Console points at the README API table", () => {
  const consoleSection = section(useDoc, "Console");
  assert.match(consoleSection, /foundry\/module\/pentaryn-aoe\/README\.md#api/);
  for (const m of ["summary", "inspect", "describe"]) assert.ok(consoleSection.includes(`game.pentaryn.aoe.${m}(`), m);
});
