// Guide S12: combat-core.mjs is a barrel over core/*.mjs. Each topic file imports bare (pure: no
// Foundry global needed or added) and imports only its siblings; the barrel's surface is the union.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../core/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".mjs")).sort();

test("every core/*.mjs imports bare and only from its siblings", async () => {
  const before = Object.keys(globalThis).sort();
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/from "([^"]+)"/g)) assert.match(m[1], /^\.\/[a-z-]+\.mjs$/, `${f}: ${m[1]}`);
    await import(new URL(f, dir));
  }
  for (const g of ["game", "Hooks", "CONFIG", "ui", "canvas", "foundry", "document"]) assert.equal(globalThis[g], undefined, g);
  assert.deepEqual(Object.keys(globalThis).sort(), before);
});

test("the barrel re-exports every topic export, each from exactly one file", async () => {
  const barrel = await import("../combat-core.mjs");
  const seen = new Map();
  for (const f of files) {
    for (const k of Object.keys(await import(new URL(f, dir)))) {
      assert.equal(seen.has(k), false, `${k} in ${seen.get(k)} and ${f}`);
      seen.set(k, f);
      assert.ok(k in barrel, k);
    }
  }
  assert.equal(files.length, 11);
});
