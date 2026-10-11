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

test("prompts-lookup-9: one size-word table and one CR parser in core/size.mjs", async () => {
  const { SIZE_WORDS, PC_SIZE_WORDS, parseCr } = await import("../core/size.mjs");
  // replace's old NPC_SIZE, verbatim, as the oracle
  const NPC_SIZE = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg", huge: "huge", gargantuan: "grg", grg: "grg" };
  for (const w of ["tiny", "small", "sm", "medium", "med", "large", "lg", "huge", "gargantuan", "grg", "Huge", "x", ""]) {
    assert.equal(SIZE_WORDS[w.toLowerCase()] ?? null, NPC_SIZE[w.toLowerCase()] ?? null, w);
  }
  assert.equal(PC_SIZE_WORDS.huge, undefined);
  assert.equal(PC_SIZE_WORDS.gargantuan, undefined);
  assert.equal(PC_SIZE_WORDS.small, "sm");
  assert.deepEqual(["1/4", 0.25, "3", 3, "", null, undefined, "x", " 1 / 2 ", "1/8"].map(parseCr),
    [0.25, 0.25, 3, 3, null, null, null, null, 0.5, 0.125]);
  const patch = await import("../actor-patch-adapter.mjs");
  assert.equal(patch.SIZE_WORDS, SIZE_WORDS);
});

test("prompts-lookup-21: LINK_FT and FORMATION_FT name the grouping distances the LEGEND prints", async () => {
  const { LINK_FT, FORMATION_FT } = await import("../core/group.mjs");
  const { LEGEND } = await import("../geometry-core.mjs");
  assert.deepEqual([LINK_FT, FORMATION_FT], [30, 15]);
  const lines = LEGEND.split("\n");
  assert.equal(lines[6], "Encounter E# = linked by <=30 ft with LOS; a hostile built creature in it brings its pack (the hostile built creatures linked the same way).");
  assert.equal(lines[7], "Formation = linked by <=15 ft with LOS, inside an encounter.");
});

test("cropsDecision and specFileUrl live in core/text.mjs; build-core re-exports the same functions", async () => {
  const text = await import("../core/text.mjs");
  const build = await import("../build-core.mjs");
  assert.equal(build.cropsDecision, text.cropsDecision);
  assert.equal(build.specFileUrl, text.specFileUrl);
});

test("prompts-lookup-10: poolIndex keeps the pasted three-step order over the finding's table", async () => {
  const { poolIndex } = await import("../core/pool.mjs");
  const { sameName } = await import("../build-core.mjs");
  const pool = ["Compendium.a.Item.1", "Compendium.a.Item.2"];
  const names = ["Divine Order: Protector", "Divine Order: Thaumaturge"];
  const tail = n => String(n).split(/:\s*/).pop();
  const pasted = w => (pool.indexOf(w) >= 0 ? pool.indexOf(w)
    : names.findIndex(n => sameName(n, w)) >= 0 ? names.findIndex(n => sameName(n, w))
      : names.findIndex(n => sameName(tail(n), w)));
  const table = [["Compendium.a.Item.2", 1], ["Protector", 0], ["thaumaturge", 1], ["Divine Order: Protector", 0], ["Order Divine: Protector", 0], ["Nope", -1]];
  for (const [w, want] of table) {
    assert.equal(poolIndex(w, pool, names), want, w);
    assert.equal(poolIndex(w, pool, names), pasted(w), `${w} (oracle)`);
  }
});
