/**
 * Pentaryn Senses — the module id and every flag path it uses, defined ONCE (finding -18, C12).
 * PURE. The other core files import from here rather than the barrel, so the barrel can re-export
 * them without a cycle.
 *
 *   Item     light (a shard's fixed light; also written by pentaryn-transform's Starry form),
 *            lit, hooded, lightItem (profile override), lightCast (the Light cantrip's target)
 *   Activity lightToggle (an item activity that lights / douses it)
 *   Token    itemLight, itemLightPrior (carried light), spellLight (the Light cantrip), chain
 */

export const MODULE = "pentaryn-senses";

const path = key => `flags.${MODULE}.${key}`;

export const FLAGS = Object.freeze({
  light: path("light"),
  lit: path("lit"),
  hooded: path("hooded"),
  lightItem: path("lightItem"),
  lightToggle: path("lightToggle"),
  itemLight: path("itemLight"),
  itemLightPrior: path("itemLightPrior"),
  spellLight: path("spellLight"),
  lightCast: path("lightCast"),
  chain: path("chain"),
});
