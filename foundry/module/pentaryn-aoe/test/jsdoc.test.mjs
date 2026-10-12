// LLM-read (audit re-anchor note, aoe.md): a JSDoc block describes the declaration right under it.
// In core.mjs carefulApplies' JSDoc sat above carefulStale's own JSDoc, so carefulApplies read
// undocumented and carefulStale read as having two contradicting docs. Static check, no imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".mjs"));
const read = f => readFileSync(new URL(f, dir), "utf8");
const lineOf = (src, index) => src.slice(0, index).split("\n").length;

test("no JSDoc block is followed directly by another JSDoc block (an orphaned doc; a file header is exempt)", () => {
  const stacked = [];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
      if (!src.slice(0, m.index).trim()) continue;   // the file's header comment
      const rest = src.slice(m.index + m[0].length);
      if (/^\s*\/\*\*/.test(rest)) stacked.push(`${f}:${lineOf(src, m.index)}`);
    }
  }
  assert.deepEqual(stacked, []);
});

test("every exported function in core.mjs has its JSDoc directly above it", () => {
  const src = read("core.mjs");
  const undocumented = [...src.matchAll(/^export function (\w+)/gm)]
    .filter(m => !src.slice(0, m.index).trimEnd().endsWith("*/"))
    .map(m => m[1]);
  assert.deepEqual(undocumented, []);
});
