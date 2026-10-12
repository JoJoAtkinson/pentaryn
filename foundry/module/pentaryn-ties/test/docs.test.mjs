/**
 * ties-43: the docs name only API paths that exist. Every `game.pentaryn.ties.<path>` and every
 * `A.<fn>(` / `S.<fn>(` call (the attributes / study handles the docs use) in README.md and the two
 * use-docs must be a described method, a kit member or a namespace — this is the check that would have
 * caught `study.setTiers`. And CHANGELOG.md's version headings run newest first, the newest being
 * module.json's version.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { manifestOf, readJSON } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const describe = readJSON(new URL("./golden/describe.json", import.meta.url));
const METHODS = new Set(describe.methods.map(m => m.path));
const KIT = new Set(["describe", "version", "contract", "settings", "trace", "uninstall", "STANCES"]);
const known = path => METHODS.has(path) || KIT.has(path) || [...METHODS].some(m => m.startsWith(`${path}.`));
const DOCS = ["README.md", "../../../context/foundry/attributes.md", "../../../context/foundry/attribute-review.md"]
  .map(rel => new URL(rel, ROOT))
  .filter(url => existsSync(url));

test("every game.pentaryn.ties path the docs name exists", () => {
  const bad = [];
  for (const url of DOCS) {
    const text = readFileSync(url, "utf8");
    for (const m of text.matchAll(/game\.pentaryn\.ties\.([A-Za-z][\w.]*[\w])/g)) if (!known(m[1])) bad.push(`${url.pathname.split("/").pop()}: ties.${m[1]}`);
    for (const m of text.matchAll(/(?<![\w.$])([AS])\.([a-z]\w*)\s*\(/g)) {
      const path = `${m[1] === "A" ? "attributes" : "study"}.${m[2]}`;
      if (!known(path)) bad.push(`${url.pathname.split("/").pop()}: ${m[1]}.${m[2]}(`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
  assert.ok(DOCS.length >= 1);
});

test("CHANGELOG.md: version headings newest first; the newest is module.json's version", () => {
  const text = readFileSync(new URL("CHANGELOG.md", ROOT), "utf8");
  const versions = [...text.matchAll(/^## (\d+\.\d+(?:\.\d+)?)/gm)].map(m => m[1].split(".").map(Number));
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || ((a[2] ?? 0) - (b[2] ?? 0));
  for (let i = 1; i < versions.length; i++) assert.ok(cmp(versions[i - 1], versions[i]) > 0, `${versions[i - 1]} before ${versions[i]}`);
  assert.equal(versions[0].join("."), manifestOf(ROOT).version);
});
