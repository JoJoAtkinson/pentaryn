/**
 * Pentaryn Combat core — names and identity: name normalising and the feature-identity set.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

/** "Extra Attack (Fighter)" → "extra attack"; curly apostrophes straightened, spaces collapsed. */
export function normalizeName(name) {
  return String(name ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "Great Weapon Master" → "great-weapon-master" (dnd5e's identifier slug, for hand-made items). */
export function slugify(name) {
  return normalizeName(name).replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Every identity an actor's features answer to: their identifiers plus their slugged names. */
export function featureSet(features = []) {
  const out = new Set();
  for (const f of features) {
    if (f?.identifier) out.add(f.identifier);
    if (f?.name) out.add(slugify(f.name));
  }
  return out;
}
