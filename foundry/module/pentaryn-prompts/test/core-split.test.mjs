/**
 * The core split (guide step 9, prompts-lookup-20, C11): every core/*.mjs loads bare — no game,
 * canvas, foundry, CONFIG or ui — and geometry-core.mjs stays a barrel of exactly the public names
 * (golden/core-exports.json, pinned by surface.test), never a core file's private helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const CORE = new URL("../core/", import.meta.url);

test("every core/*.mjs imports with no Foundry global", async () => {
  for (const g of ["game", "canvas", "foundry", "CONFIG", "ui"]) assert.equal(globalThis[g], undefined, g);
  const files = readdirSync(CORE).filter(f => f.endsWith(".mjs")).sort();
  assert.ok(files.length >= 12, files.join(" "));
  for (const f of files) {
    const m = await import(new URL(f, CORE));
    assert.ok(Object.keys(m).length > 0, f);
  }
});

test("the barrel re-exports public names only: a core helper (fmtNum) stays inside core/", async () => {
  const geo = await import("../geometry-core.mjs");
  const size = await import("../core/size.mjs");
  assert.equal(typeof size.fmtNum, "function");
  assert.equal("fmtNum" in geo, false);
  assert.equal(geo.footprintLabel, size.footprintLabel);
});
