/**
 * pentaryn-prompts — the compendium lookup the builders share: which packs each kind searches (owned
 * books first, then the 2024 SRD), a cached index per pack, findItem by uuid or name, the "did you
 * mean" suggestions and the not-found message.
 *
 * ADAPTER (game.packs, fromUuid, Item). character-adapter and actor-patch-adapter build on it (the
 * two adapter → adapter rows in test/graph-allow.json).
 */

import { codedError } from "./geometry-core.mjs";
import { sameName, nearestNames } from "./build-core.mjs";

/** Owned books first, then the 2024 SRD. Missing packs are skipped. */
const PACKS = {
  class: ["dnd-players-handbook.classes", "dnd5e.classes24"],
  subclass: ["dnd-players-handbook.classes", "dnd5e.classes24"],
  race: ["dnd-players-handbook.origins", "dnd5e.origins24"],
  background: ["dnd-players-handbook.origins", "dnd5e.origins24"],
  feat: ["dnd-players-handbook.feats", "dnd-players-handbook.origins", "dnd-players-handbook.classes", "dnd5e.feats24"],
  spell: ["dnd-players-handbook.spells", "dnd5e.spells24"],
  item: ["dnd-players-handbook.equipment", "dnd5e.equipment24"]
};

const indexCache = new Map();
async function indexOf(packId) {
  if (indexCache.has(packId)) return indexCache.get(packId);
  const pack = game.packs.get(packId);
  const idx = pack ? await pack.getIndex({ fields: ["type", "system.identifier"] }) : null;
  indexCache.set(packId, idx);
  return idx;
}

/**
 * The item type `findItem` requires per kind. `feat` is deliberately absent: origin feats live in
 * other item types, so a feat is found whatever its type. `suggest` (TYPE_OF) does filter feats;
 * test/character.test.mjs pins the asymmetry (prompts-lookup-10).
 */
const FIND_TYPE = Object.freeze({ class: "class", subclass: "subclass", race: "race", background: "background", spell: "spell" });

/**
 * A compendium Item by uuid or by name (`kind` picks the packs and the item type).
 * Names match case- and word-order-insensitively ("Infernal Tiefling" finds "Tiefling, Infernal").
 */
export async function findItem(ref, kind) {
  if (!ref) return null;
  if (typeof ref === "object" && ref.documentName === "Item") return ref;
  const s = String(ref).trim();
  if (/^(Compendium|Item)\./.test(s)) {
    const doc = await fromUuid(s);
    if (!(doc instanceof Item)) throw codedError("BAD_SPEC", `${s} is not an item`);
    return doc;
  }
  const type = FIND_TYPE[kind] ?? null;
  for (const id of PACKS[kind] ?? PACKS.item) {
    const idx = await indexOf(id);
    if (!idx) continue;
    const ok = e => !type || e.type === type;
    const hit = idx.find(e => ok(e) && e.name.toLowerCase() === s.toLowerCase()) ?? idx.find(e => ok(e) && sameName(e.name, s));
    if (hit) return game.packs.get(id).getDocument(hit._id);
  }
  return null;
}

const TYPE_OF = { class: "class", subclass: "subclass", race: "race", background: "background", spell: "spell", feat: "feat" };

/** The nearest names in the packs `kind` searches, for a "did you mean" (`Spellbook` → `Book`). */
export async function suggest(ref, kind, n = 3) {
  const type = TYPE_OF[kind] ?? null;
  const names = [];
  for (const id of PACKS[kind] ?? PACKS.item) {
    const idx = await indexOf(id);
    if (!idx) continue;
    for (const e of idx) if (!type || e.type === type) names.push(e.name);
  }
  return nearestNames(ref, names, n);
}

/** `no item "Spellbook" in … — nearest: Book` (plus the inline-data hint for gear). */
export async function notFound(what, ref, kind, hint = "") {
  const near = await suggest(String(ref), kind);
  return `no ${what} "${ref}" in ${(PACKS[kind] ?? PACKS.item).join(", ")}${near.length ? ` — nearest: ${near.map(n => `"${n}"`).join(", ")}` : ""}${hint}`;
}
