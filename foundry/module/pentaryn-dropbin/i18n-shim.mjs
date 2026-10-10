/**
 * Item Piles i18n shim — dnd5e 6.x
 * ================================
 *
 * itempilesdnd5e 1.1.0's dnd5e-5.0.0 config block still names i18n keys that dnd5e 6.0
 * deleted:
 *
 *   ITEM_RARITY            DND5E.ItemRarityCommon … DND5E.ItemRarityArtifact
 *                          (the merchant window's Rarity column)
 *   UNIDENTIFIED_PLACEHOLDER  DND5E.Unknown  (the name of an unidentified item)
 *
 * Without them those cells read the raw key. dnd5e 6 moved the words to
 * DND5E.ITEM.Rarity.* and core's COMMON.Unknown, so at `i18nInit` we copy them back under
 * the old names. A key is only ever ADDED, never overwritten: if dnd5e or a translation
 * module still defines it, theirs wins.
 *
 * Lives in dropbin because dropbin already owns our Item Piles dependency. Registered in
 * foundry/adjustments.yml as `itempiles-rarity-i18n`. Retire it (delete this file and its
 * import) once an itempilesdnd5e release reads DND5E.ITEM.Rarity.* itself.
 *
 * `fillMissingKeys` is pure (no Foundry globals) so `node test/run.mjs` can prove it.
 */

/** old flat key under DND5E  →  where dnd5e 6 / core keeps the word now */
export const LEGACY_KEYS = Object.freeze({
  ItemRarityCommon: "DND5E.ITEM.Rarity.Common",
  ItemRarityUncommon: "DND5E.ITEM.Rarity.Uncommon",
  ItemRarityRare: "DND5E.ITEM.Rarity.Rare",
  ItemRarityVeryRare: "DND5E.ITEM.Rarity.VeryRare",
  ItemRarityLegendary: "DND5E.ITEM.Rarity.Legendary",
  ItemRarityArtifact: "DND5E.ITEM.Rarity.Artifact",
  Unknown: "COMMON.Unknown",
});

/** Last resort when the source key is missing too (should never happen on 6.0.6). */
const LITERAL = Object.freeze({
  ItemRarityCommon: "Common",
  ItemRarityUncommon: "Uncommon",
  ItemRarityRare: "Rare",
  ItemRarityVeryRare: "Very Rare",
  ItemRarityLegendary: "Legendary",
  ItemRarityArtifact: "Artifact",
  Unknown: "Unknown",
});

function lookup(tree, path) {
  let v = tree;
  for (const part of path.split(".")) {
    if (v == null || typeof v !== "object") return undefined;
    v = v[part];
  }
  return typeof v === "string" ? v : undefined;
}

/**
 * Fill the legacy keys into `translations.DND5E` where they are missing.
 * Foundry stores translations expanded (nested), so `DND5E.ItemRarityRare` is
 * `translations.DND5E.ItemRarityRare`.
 *
 * @param {object} translations   game.i18n.translations (mutated in place)
 * @param {object} [fallback]     game.i18n._fallback — searched for the source word second
 * @returns {string[]}            the keys added, e.g. ["DND5E.ItemRarityRare"]
 */
export function fillMissingKeys(translations, fallback = {}) {
  if (!translations || typeof translations !== "object") return [];
  const ns = translations.DND5E && typeof translations.DND5E === "object"
    ? translations.DND5E
    : (translations.DND5E = {});
  const added = [];
  for (const [key, source] of Object.entries(LEGACY_KEYS)) {
    if (typeof ns[key] === "string") continue;              // dnd5e or a translation has it
    ns[key] = lookup(translations, source) ?? lookup(fallback, source) ?? LITERAL[key];
    added.push(`DND5E.${key}`);
  }
  return added;
}

/** Wire the shim. Called once from dropbin.mjs at load (i18nInit fires after init). */
export function installI18nShim() {
  Hooks.once("i18nInit", () => {
    const added = fillMissingKeys(game.i18n.translations, game.i18n._fallback);
    if (added.length) console.log(`pentaryn-dropbin | Item Piles i18n shim added ${added.join(", ")}`);
  });
}
