#!/usr/bin/env node
/**
 * Fixtures for loot-core.mjs and i18n-shim.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 * The imports themselves are a check: both must load with `game`, `canvas`, `PIXI` and `Hooks` undefined.
 */

const { MODULE, lootAllState, showEye, eyePlacement } = await import("../loot-core.mjs");
const { fillMissingKeys, LEGACY_KEYS } = await import("../i18n-shim.mjs");

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

/* ── i18n shim (dnd5e 6 removed the keys itempilesdnd5e 1.1.0 reads) ──── */
{
  // dnd5e 6.0.6 shape: rarity words under DND5E.ITEM.Rarity, "Unknown" only in core COMMON
  const six = () => ({
    COMMON: { Unknown: "Unknown" },
    DND5E: { ITEM: { Rarity: { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", VeryRare: "Very Rare", Legendary: "Legendary", Artifact: "Artifact", Mundane: "Mundane" } } },
  });
  const t = six();
  const added = fillMissingKeys(t);
  check("6.x: all seven keys added", added.length, 7);
  check("6.x: rarity copied from ITEM.Rarity", [t.DND5E.ItemRarityUncommon, t.DND5E.ItemRarityRare, t.DND5E.ItemRarityVeryRare], ["Uncommon", "Rare", "Very Rare"]);
  check("6.x: Unknown copied from COMMON", t.DND5E.Unknown, "Unknown");
  check("6.x: nested tree untouched", t.DND5E.ITEM.Rarity.Rare, "Rare");
  check("second run adds nothing", fillMissingKeys(t), []);

  // 5.3.3 shape (keys still present, lowercase words) — never overwritten
  const five = six();
  Object.assign(five.DND5E, { ItemRarityCommon: "common", ItemRarityUncommon: "uncommon", ItemRarityRare: "rare", ItemRarityVeryRare: "very rare", ItemRarityLegendary: "legendary", ItemRarityArtifact: "artifact", Unknown: "Unknown" });
  check("5.x: nothing added", fillMissingKeys(five), []);
  check("5.x: existing words kept", five.DND5E.ItemRarityVeryRare, "very rare");

  // a translation module defined one key: only the others are filled
  const partial = six();
  partial.DND5E.ItemRarityRare = "Selten";
  const got = fillMissingKeys(partial);
  check("partial: six added", got.length, 6);
  check("partial: Rare not in the added list", got.includes("DND5E.ItemRarityRare"), false);
  check("partial: translation kept", partial.DND5E.ItemRarityRare, "Selten");

  // non-English client: source word from the English fallback when the language lacks it
  const fr = { DND5E: {} };
  fillMissingKeys(fr, six());
  check("fallback dictionary used", [fr.DND5E.ItemRarityLegendary, fr.DND5E.Unknown], ["Legendary", "Unknown"]);

  // nothing to copy from at all: literal English, never the raw key
  const bare = {};
  fillMissingKeys(bare);
  check("no DND5E namespace → created and filled", [bare.DND5E.ItemRarityArtifact, bare.DND5E.Unknown], ["Artifact", "Unknown"]);
  check("bad input → no-op", fillMissingKeys(null), []);
  check("the six rarity keys + Unknown that itempilesdnd5e names", Object.keys(LEGACY_KEYS).sort(),
    ["ItemRarityArtifact", "ItemRarityCommon", "ItemRarityLegendary", "ItemRarityRare", "ItemRarityUncommon", "ItemRarityVeryRare", "Unknown"]);
}

if (failures.length) {
  console.error(`FAIL ${failures.length} / ${pass + failures.length}\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`ok ${pass} checks`);
