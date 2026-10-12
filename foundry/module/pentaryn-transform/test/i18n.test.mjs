// i18n at the checkpoint: every literal PENTARYN_TRANSFORM.* key in the sources exists in
// lang/en.json, and so does every template-built key (constellation labels, Starry chat endings).
// The two-branch `T` wrappers (C35) are pinned as they are; guide step 7 replaces them with _loc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceScan } from "./kit/harness.mjs";
import { CONSTELLATIONS } from "../transform-core.mjs";

const ROOT = new URL("..", import.meta.url);
const flat = (node, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out); else out.add(key);
  }
  return out;
};
const keys = flat(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));

test("every literal PENTARYN_TRANSFORM key in the sources exists in lang/en.json", () => {
  const used = new Set();
  for (const h of sourceScan(ROOT, /PENTARYN_TRANSFORM\.[A-Za-z]/)) {
    for (const m of h.text.matchAll(/"(PENTARYN_TRANSFORM\.[A-Za-z.]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 60, `found ${used.size}`);
  assert.deepEqual([...used].filter(k => !keys.has(k)), []);
});

test("template-built keys exist: constellation labels and the Starry chat endings", () => {
  for (const c of CONSTELLATIONS) assert.ok(keys.has(`PENTARYN_TRANSFORM.Starry.${c[0].toUpperCase()}${c.slice(1)}`), c);
  for (const k of ["StarryIncapacitated", "StarryExpired", "StarryEnd"]) assert.ok(keys.has(`PENTARYN_TRANSFORM.Chat.${k}`), k);
});

test("no two-branch T wrapper is left: every string goes through _loc (C35; guide step 7 removed the three)", () => {
  const hits = sourceScan(ROOT, /const T = \(key, data\) => \(data \? game\.i18n\.format\(key, data\) : game\.i18n\.localize\(key\)\);/);
  assert.deepEqual(hits.map(h => h.file), []);
  assert.deepEqual(sourceScan(ROOT, /(?<![\w$.])T\(/).map(h => `${h.file}:${h.line}`), []);
});

test("every lang key is used (as a literal, or template-built)", () => {
  const src = sourceScan(ROOT, /PENTARYN_TRANSFORM/).map(h => h.text).join("\n");
  const unused = [...keys].filter(k => !src.includes(`"${k}"`) && !/Starry\.(Archer|Chalice|Dragon)$|Chat\.Starry(Incapacitated|Expired|End)$/.test(k));
  assert.deepEqual(unused, []);
});
