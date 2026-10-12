// Guide S14 (combat-riders-15): the README's API section names every manifest row, and its Files
// section names every top-level .mjs (both entries' load order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { MANIFEST } from "../api-manifest.mjs";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const section = (title) => {
  const i = readme.indexOf(`## ${title}`);
  const j = readme.indexOf("\n## ", i + 3);
  return readme.slice(i, j < 0 ? undefined : j);
};

test("every manifest row path is in the API section", () => {
  const api = section("API");
  for (const r of MANIFEST.rows) assert.ok(api.includes(`\`${r.path}(`), r.path);
  assert.ok(api.includes("`core`"));
});

test("every top-level .mjs and both entries are under Files; at most 250 lines; no fixture counts", () => {
  const files = section("Files");
  for (const f of readdirSync(new URL("..", import.meta.url)).filter(x => x.endsWith(".mjs"))) assert.ok(files.includes(`\`${f}\``), f);
  assert.ok(files.includes("esmodules[0]") && files.includes("esmodules[1]"));
  assert.ok(readme.trimEnd().split("\n").length <= 250, String(readme.trimEnd().split("\n").length));
  assert.equal(/\b\d+\s+(fixtures|cases|checks|assertions)\b/.test(readme), false);
});
