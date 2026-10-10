#!/usr/bin/env node
/**
 * Fixtures for loot-core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 * The import itself is a check: loot-core.mjs must load with `game`, `canvas` and `PIXI` undefined.
 */

const { MODULE, lootAllState, showEye, eyePlacement } = await import("../loot-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

check("module id", MODULE, "pentaryn-dropbin");

/* ── lootAllState ───────────────────────────────────────────────────────── */
const pile = { enabled: true, type: "pile", shareItemsEnabled: true, shareCurrenciesEnabled: true };
const ok = { show: true, disabled: false, reason: "" };
const hide = { show: false, disabled: true, reason: "" };
check("pile with loot and a character", lootAllState({ pileData: pile, hasRecipient: true }), ok);
check("container, open and unlocked", lootAllState({ pileData: { enabled: true, type: "container" }, hasRecipient: true }), ok);
check("empty pile → greyed", lootAllState({ pileData: pile, hasRecipient: true, empty: true }), { show: true, disabled: true, reason: "empty" });
check("player without character → greyed with reason", lootAllState({ pileData: pile }), { show: true, disabled: true, reason: "noCharacter" });
check("GM without character → hidden", lootAllState({ pileData: pile, isGM: true }), hide);
check("GM with recipient → shown", lootAllState({ pileData: pile, isGM: true, hasRecipient: true }), ok);
check("native Take All present → hidden", lootAllState({ pileData: pile, hasRecipient: true, nativeTakeAll: true }), hide);
check("merchant → hidden", lootAllState({ pileData: { enabled: true, type: "merchant" }, hasRecipient: true }), hide);
check("vault → hidden", lootAllState({ pileData: { enabled: true, type: "vault" }, hasRecipient: true }), hide);
check("not a pile → hidden", lootAllState({ pileData: { enabled: false, type: "pile" }, hasRecipient: true }), hide);
check("locked container → hidden", lootAllState({ pileData: { enabled: true, type: "container", locked: true }, hasRecipient: true }), hide);
check("closed container → hidden", lootAllState({ pileData: { enabled: true, type: "container", closed: true }, hasRecipient: true }), hide);
check("locked flag on a plain pile is ignored", lootAllState({ pileData: { ...pile, locked: true }, hasRecipient: true }), ok);
check("no args → hidden", lootAllState(), hide);
check("null pileData → hidden", lootAllState({ pileData: null, hasRecipient: true }), hide);

/* ── showEye ────────────────────────────────────────────────────────────── */
check("corpse pile with loot", showEye({ corpse: true, pile: true, empty: false }), true);
check("emptied corpse", showEye({ corpse: true, pile: true, empty: true }), false);
check("revived (no longer a pile)", showEye({ corpse: true, pile: false, empty: false }), false);
check("someone else's pile", showEye({ corpse: false, pile: true, empty: false }), false);
check("defaults", showEye(), false);

/* ── eyePlacement ───────────────────────────────────────────────────────── */
check("1x1 at 100px", eyePlacement(100, 100), { size: 40, x: 80, y: 20 });
check("2x2 at 100px", eyePlacement(200, 200), { size: 80, x: 160, y: 40 });
check("wide token uses short side", eyePlacement(300, 100), { size: 40, x: 280, y: 20 });
check("bad input → zero", eyePlacement(undefined, -5), { size: 0, x: 0, y: 0 });
{
  // the badge sits inside the token and overlaps the core overlay's corner (60% centred)
  const p = eyePlacement(100, 100);
  check("inside token", p.x + p.size / 2 <= 100 && p.y - p.size / 2 >= 0, true);
}

if (failures.length) {
  console.error(`FAIL ${failures.length} / ${pass + failures.length}\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`ok ${pass} checks`);
