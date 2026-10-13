/**
 * The Known list, minus Foundry — schema, defaults, and the hardened reader.
 *
 * ## Why this file exists at all
 *
 * `ties-api.mjs` proved it is possible to write a data layer that never throws; it did not
 * prove it, because everything in it reaches for `game.actors` and can only be exercised
 * inside a running client. The parts of the Known list that are *quietly* wrong when they
 * regress — a junk category silently becoming "beasts", a duplicate id doubling a row, a
 * `when` of `"yesterday"` sorting a notebook at random — are exactly the parts that can be
 * fixtured in bare node, so they live here.
 *
 * **Nothing in this file may touch a Foundry global.** No `game`, no `canvas`, no
 * `ui`, no `foundry`, not even `game.i18n`. Everything the reader needs about the world
 * arrives through the injected `resolve(id)` callback, and every label is a key the caller
 * localizes. `node test/known.mjs` imports this file with none of those defined, which is
 * the check that keeps the rule honest.
 *
 * ## The schema (design: context/plans/foundry-encounter-log.md, decision 2)
 *
 *   flags["pentaryn-ties"].known = [
 *     { id: "<actorId>", name: "Goblin",   // cached at filing time, live-resolved when possible
 *       category: "beasts",                 // key into knownCategories
 *       notes: "",                          // their manual entry — prose, KNOWN_NOTES_MAX
 *       when: 1755900000000 }               // first filed — orders the list inside its category
 *   ]
 *   flags["pentaryn-ties"].knownCategories = [ { key, label } ]   // seeded Sentient + Beasts
 *
 * The same one rule as `read()`: **a malformed entry is dropped, a missing field takes a
 * default, and nothing here throws.** A player's notebook must never be able to break the
 * sheet it is drawn on.
 */

import { readRegistry } from "./attributes.mjs";
import { identifiedState } from "./ledgers.mjs";
import { parseFactKey } from "./lore.mjs";
import { isBlankProse } from "./prose.mjs";
import { KNOWN_NOTES_MAX, clampKnownNotes, num, str } from "./shared.mjs";
export { KNOWN_NOTES_MAX, clampKnownNotes } from "./shared.mjs";

/**
 * Does a flattened update key touch a module's flag scope?
 *
 * Hooks see `foundry.utils.flattenObject(changes)`. A write under the scope flattens to
 * `flags.<scope>.<…>`; a whole-scope wipe used to arrive as `flags.-=<scope>`, but core 14.369
 * migrates legacy `-=` keys to a `ForcedDeletion` operator while cleaning, and an operator
 * flattens to the bare `flags.<scope>`. Accept all three; never a sibling scope that merely
 * shares the prefix (`flags.<scope>-extra`).
 */
export function touchesFlagScope(key, scope) {
  const k = String(key ?? "");
  for (const head of [`flags.${scope}`, `flags.-=${scope}`]) {
    if (k === head || k.startsWith(`${head}.`)) return true;
  }
  return false;
}

export const KNOWN_FLAG = "known";
export const KNOWN_CATEGORIES_FLAG = "knownCategories";

/**
 * Knowledge the GM's side handed this character, keyed by the FACT it came from — never
 * stored inside the Known entry it renders under.
 *
 * Three reasons it is a sibling and not a field, and the third is the one that forced it:
 *
 *  1. The notes autosave round-trips every entry through `toStoredKnown`, which maps a fixed
 *     shape and drops what it does not know. Text held outside that shape cannot be erased by
 *     a keystroke **by construction**, rather than by remembering to widen two functions.
 *  2. It lands in the same single `Actor#update` as the `studied` lock, so a reveal is one
 *     write or none.
 *  3. An attribute grant belongs to the *attribute*, not to one page: learn the guild's secret
 *     from one rogue and it must appear under **every** rogue you have filed. Per-entry storage
 *     would either duplicate that text per page or lose it on the pages you had not filed yet.
 *
 * Key namespaces — `attr:` and `mask:` are reserved now so the later phases widen instead of
 * migrating: `kind:<kindActorId>` · `lore:<actorId>:<loreId>` · `attr:<attrId>:<loreId>` ·
 * `mask:<actorId>:<layerId>`.
 */
export const GRANTED_FLAG = "granted";

/** Prose the GM's side handed over. Same cap as a note; it is the same kind of text. */
export const GRANTED_TEXT_MAX = KNOWN_NOTES_MAX;

/** The cached display name rides on every actor update; a pasted essay must not. */
export const KNOWN_NAME_MAX = 200;

/** Category keys are ours or the GM's; either way they are keys, not prose. */
export const CATEGORY_KEY_MAX = 40;
export const CATEGORY_LABEL_MAX = 60;

/**
 * The two seeded categories. Keys only — the *labels* are i18n
 * (`PENTARYN_TIES.known.category.<key>`) until someone renames one, at which point the
 * rename is stored on the actor as `label` and wins. Renaming and adding are phase-1 cuts;
 * the schema already carries them, so neither costs a migration when it lands.
 */
export const SEEDED_CATEGORIES = [{ key: "sentient" }, { key: "beasts" }];

export const clampKnownName = v => str(v, KNOWN_NAME_MAX).trim();
export const clampCategoryKey = v => str(v, CATEGORY_KEY_MAX).trim();

/**
 * Which bucket a newly filed creature lands in.
 *
 * `character`-type actors and anything whose creature type is `humanoid` are people;
 * everything else is a beast. The path is `system.details.type.value` (verified: it is what
 * drives the dnd5e NPC sheet), read by the caller and handed in here as a plain string so
 * this stays testable.
 *
 * ⚠ The third case is the one to argue about: an actor that no longer resolves — a deleted
 * NPC, or a row read on a client that has not received the document — has no creature type
 * to read, and guessing "beasts" would file a dead friend under monsters. Unknown means
 * **sentient**: the notebook grew out of an address book, and a name with nothing behind it
 * is far more often a person than a wolf.
 */
export function defaultCategory({ actorType = null, creatureType = null } = {}) {
  if (actorType === "character") return "sentient";
  const type = typeof creatureType === "string" ? creatureType.trim().toLowerCase() : "";
  if (!type) return "sentient";
  return type === "humanoid" ? "sentient" : "beasts";
}

/**
 * The category list for an actor: the two seeded keys, always, plus anything stored.
 *
 * Seeded keys come first and cannot be removed by a malformed flag — the list is what the
 * `<select>` renders and what entries are filed into, so an actor whose `knownCategories`
 * flag is `null`, `7`, or an array of junk must still get a working notebook. A stored entry
 * for a seeded key contributes only its `label` (the rename); anything else is appended.
 */
export function readCategories(raw) {
  const out = SEEDED_CATEGORIES.map(c => ({ key: c.key, label: null, seeded: true }));
  const index = new Map(out.map(c => [c.key, c]));
  if (!Array.isArray(raw)) return out;
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const key = clampCategoryKey(c.key);
    if (!key) continue;
    const label = str(c.label, CATEGORY_LABEL_MAX).trim() || null;
    const existing = index.get(key);
    if (existing) {
      // First label for a key wins — the same rule the entry reader uses for duplicate ids.
      // A seeded key arrives with `label: null`, so a rename still lands; a key listed twice
      // does not get to change its mind halfway down the array.
      if (label && !existing.label) existing.label = label;
      continue;
    }
    const entry = { key, label, seeded: false };
    index.set(key, entry);
    out.push(entry);
  }
  return out;
}

export const categoryKeys = categories => (categories ?? []).map(c => c.key);

/**
 * Sanitised, resolved Known entries. Never throws. Never returns a non-array.
 *
 * `resolve(id)` is the world lookup, injected: it returns `{ name, img, actorType,
 * creatureType }` for an actor that exists, or null/undefined for one that does not. Both
 * names are kept — `name` is what the row renders (live, so a portrait or a rename follows
 * the actor) and `cachedName` is what was true when the entry was filed. Keeping both costs
 * one field and is what the disguise question (plan §7, still Joe's to rule on) will need if
 * player-facing rows ever switch to the cached face.
 *
 * Order: by category, then by `when` ascending — the order they filed them, *inside their
 * own grouping*, which is the part of "the order they think of them" that survives a
 * `<select>` (decision 3). Ties on `when` break by name so a list can't shuffle between
 * paints.
 */
export function readKnown(raw, { resolve = () => null, categories = readCategories(null) } = {}) {
  if (!Array.isArray(raw)) return [];
  const keys = categoryKeys(categories);
  const rank = new Map(keys.map((k, i) => [k, i]));
  const out = [];
  const seen = new Set();

  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    if (!id || seen.has(id)) continue; // first write of an id wins, as read() does
    seen.add(id);

    let target = null;
    try {
      target = resolve(id) ?? null;
    } catch {
      target = null; // a throwing resolver is the caller's bug, not this list's problem
    }

    const cachedName = clampKnownName(e.name);
    const stored = clampCategoryKey(e.category);
    const category = rank.has(stored)
      ? stored
      : defaultCategory({ actorType: target?.actorType ?? null, creatureType: target?.creatureType ?? null });

    out.push({
      id,
      name: clampKnownName(target?.name) || cachedName,
      cachedName,
      img: typeof target?.img === "string" ? target.img : null,
      missing: !target,
      category,
      notes: clampKnownNotes(e.notes),
      // someone was wearing this face — set when a mask over it is pierced or dropped. It
      // claims only what is true whether the face was invented or borrowed (disguise plan,
      // decision 5a); it never tries to say which notes were whose.
      imposter: Math.max(0, num(e.imposter, 0)) || null,
      /*
       * Tucked away, never destroyed. Joe's rule for the whole notebook: *"they are welcome to
       * hide, there's a show hidden button so they can restore if they must. Never deleted so
       * I'm never asked to recover a link."*
       */
      hidden: e.hidden === true,
      when: Math.max(0, num(e.when, 0))
    });
  }

  out.sort(
    (a, b) =>
      (rank.get(a.category) ?? keys.length) - (rank.get(b.category) ?? keys.length) ||
      a.when - b.when ||
      a.name.localeCompare(b.name)
  );
  return out;
}

/**
 * Sanitised granted map. Never throws, never returns a non-object — same contract as
 * `readKnown`, because it is read on every sheet paint and a bad flag must not cost a tab.
 */
export function readGranted(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const text = str(value.text, GRANTED_TEXT_MAX);
    if (isBlankProse(text)) continue; // an empty grant is not a grant — `<p></p>` included
    out[key.trim()] = {
      text,
      when: Math.max(0, num(value.when, 0)),
      icon: typeof value.icon === "string" && value.icon.trim() ? value.icon.trim() : null,
      source: clampKnownName(value.source)
    };
  }
  return out;
}

/**
 * The grants that render under one entry — the render-time join.
 *
 * Today a `kind:` grant shows under the kind's own page and a `lore:` grant under its actor's.
 * When attributes land, an `attr:` grant resolves through the subject's attribute list, which
 * is why the join is a function of the whole map rather than a slice stored per entry.
 */
export function grantsForEntry(granted, entryId, { attributeIds = [] } = {}) {
  const map = readGranted(granted);
  const id = typeof entryId === "string" ? entryId.trim() : "";
  const attrs = new Set(Array.isArray(attributeIds) ? attributeIds : []);
  /*
   * An empty `entryId` with attributes given is a legitimate call: the Attributes tab asks
   * "what have I been told about THIS GROUP", with no entry in the question at all. Only a
   * call with neither has nothing to match on.
   */
  if (!id && !attrs.size) return [];
  const hits = [];
  for (const [key, grant] of Object.entries(map)) {
    // one grammar, one parser — this loop had its own `split(":")` and disagreed with
    // `parseFactKey` about where an attribute id ends
    const parsed = parseFactKey(key);
    if (!parsed) continue;
    const mine =
      parsed.ns === "attr" ? attrs.has(parsed.subject) : parsed.subject === id;
    if (mine) hits.push({ key, ...grant });
  }
  return hits.sort((x, y) => x.when - y.when || x.key.localeCompare(y.key));
}

/**
 * Which of a creature's attributes may be shown to this viewer — the secrecy filter.
 *
 * ⚠ **This closes a leak that phase 6 shipped as a feature.** Phase 6's proudest live result was a
 * guild fact learned through one carrier rendering under *every* carrier already filed. Once
 * membership is itself a secret that inverts: the *placement* of the grant announces that the
 * second creature is in the guild, with no roll and no gesture. So an `attr:` grant may render
 * under a creature only where the viewer has actually identified that creature as a carrier.
 *
 * A **non-secret** attribute is unfiltered — it was never hidden, so hiding its lore would put a
 * roll in front of a fact already on screen.
 *
 * Pass `index` in place of `registry` when calling it in a loop: the list form clamps the whole
 * registry on every call.
 */
export function visibleAttributesFor({ carried = [], registry = [], index = null, beliefs = {}, characterId = "", isGM = false } = {}) {
  // `index` (an `indexRegistry()` result or its `byId` Map) skips the clamp — a paint that asks
  // once per Known entry builds it once and passes it; a `registry` list still works (ties-ui-perf-7)
  const byId =
    index?.byId instanceof Map ? index.byId
    : index instanceof Map ? index
    : new Map(readRegistry(registry).map(e => [e.id, e]));
  return (Array.isArray(carried) ? carried : []).filter(id => {
    if (isGM) return true; // the GM authored the secret; hiding it from them helps nobody
    if (!byId.get(id)?.secret) return true;
    return identifiedState(beliefs, characterId, id).carries === true;
  });
}

/** Storage shape — drops everything the reader resolves rather than stores. */
export function toStoredKnown(list) {
  return (Array.isArray(list) ? list : [])
    .filter(e => e && typeof e === "object" && typeof e.id === "string" && e.id.trim())
    .map(e => ({
      id: e.id.trim(),
      // the cached name is the one that persists; `name` is live and must never be written
      // back, or a disguise or a rename would freeze itself into the flag
      name: clampKnownName(e.cachedName ?? e.name),
      category: clampCategoryKey(e.category) || "sentient",
      notes: clampKnownNotes(e.notes),
      // must live in BOTH the reader and this writer or the next keystroke erases it —
      // this function maps a fixed shape and silently drops anything it does not name
      imposter: Math.max(0, num(e.imposter, 0)) || null,
      // must live in BOTH the reader and this writer, or hiding one entry un-hides every other
      hidden: e.hidden === true,
      when: Math.max(0, num(e.when, 0))
    }));
}

/**
 * Whose notebook a canvas gesture writes in — the precedence, with the canvas taken out.
 *
 * Phase 2's key has to answer "your character" on a client where that phrase means four
 * different things: a player driving one PC, a player who owns two, a GM who owns everything
 * and means whichever token they have selected, and anyone standing on a scene with no PC
 * token at all. Candidates arrive as `{ id, isCharacter, isOwner }` — the caller does the
 * `baseActorOf` walk — and the order is:
 *
 *   1. **a selected token** whose actor is an owned character. Selecting is the strongest
 *      statement anyone makes about who they are speaking as (overlay.mjs's key 7 rests on
 *      the same rule), and it is the only thing that lets a GM file for a specific PC.
 *   2. **the user's assigned character**, which is what a player who never clicks their own
 *      token still obviously means.
 *   3. **the only owned character with a token here**, if there is exactly one.
 *   4. otherwise nothing — and the caller says so, rather than guessing.
 *
 * ⚠ Rule 3 counts **actors, not tokens**. `overlay.mjs`'s `soleOwnedToken` counts placeables,
 * so a PC standing on the map twice (a summon, a duplicate placement) reads as ambiguous
 * there. It is not: both tokens are the same person, and the notebook is the person's.
 * Non-characters never win any rule — the Known tab renders on `type === "character"` only,
 * so filing onto an NPC would write a flag nothing displays.
 */
export function pickNotebook({ controlled = [], assigned = null, owned = [] } = {}) {
  const usable = c => !!c && typeof c.id === "string" && !!c.id && c.isCharacter === true && c.isOwner === true;
  const picked = (Array.isArray(controlled) ? controlled : []).find(usable);
  if (picked) return picked.id;
  if (usable(assigned)) return assigned.id;
  const mine = new Set();
  for (const c of Array.isArray(owned) ? owned : []) if (usable(c)) mine.add(c.id);
  return mine.size === 1 ? [...mine][0] : null;
}

/**
 * A fresh entry. `now` is injected rather than read from `Date.now()` so the fixture for
 * "the list orders by when" is not a race.
 */
export function makeKnownEntry({ id, name = "", actorType = null, creatureType = null, category = null, now = 0 }) {
  const key = clampCategoryKey(category);
  return {
    id,
    cachedName: clampKnownName(name),
    category: key || defaultCategory({ actorType, creatureType }),
    notes: "",
    when: Math.max(0, num(now, 0))
  };
}
