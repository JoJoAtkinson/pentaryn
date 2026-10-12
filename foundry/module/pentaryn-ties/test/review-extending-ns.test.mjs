/**
 * ext-3 [declared] (final review ties-core, 2026-10-12; defect wave 2): a fact namespace is an
 * if-ladder in five places — `factKeyOf` (core/facts.mjs, the key a share writes), `parseFactKey`
 * (core/lore.mjs, the key read back), `factOrder` (core/facts.mjs, what a subject could hand a
 * player), `knowsAbout` (facts.mjs, what the Look window draws) and `resolveFact`
 * (study/resolve.mjs, what the GM's window resolves). The README's Extending bullet named only the
 * last, so a new namespace added there alone shares under a key nothing reads. This guard pins the
 * bullet: it names all five, each beside the file that really exports it. Source text only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const read = rel => readFileSync(new URL(rel, ROOT), "utf8");
const HELPERS = [
  ["factKeyOf", "core/facts.mjs"],
  ["parseFactKey", "core/lore.mjs"],
  ["factOrder", "core/facts.mjs"],
  ["knowsAbout", "facts.mjs"],
  ["resolveFact", "study/resolve.mjs"],
];

test("ext-3: README Extending's study-namespace bullet names every fact-key helper and its file", () => {
  const readme = read("README.md");
  const extending = readme.split(/^## Extending\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const bullet = extending.split(/^- /m).find(b => b.startsWith("**A study namespace:**")) ?? "";
  assert.ok(bullet, "README ## Extending has an '**A study namespace:**' bullet");
  for (const [fn, file] of HELPERS) {
    assert.match(bullet, new RegExp(`\`${fn}\``), `the bullet names \`${fn}\``);
    assert.match(bullet, new RegExp(`\`${fn}\`\\s*\\(\`${file.replace(/[./]/g, "\\$&")}\``), `\`${fn}\` is cited beside (\`${file}\`)`);
    assert.match(read(file), new RegExp(`^export function ${fn}\\(`, "m"), `${file} exports ${fn}`);
  }
});
