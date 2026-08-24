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


/**
 * Known notes get their OWN cap, deliberately larger than a tie's 4000.
 *
 * A tie note is one paragraph about one relationship. A Known entry is a bestiary page that
 * phase 3 will *append* study reveals to — description, then immunities, then attacks — on
 * top of whatever the player already wrote. Sharing `NOTES_MAX` would mean a well-kept entry
 * silently truncating either its own prose or the reveal that was just paid for with a roll.
 * (The plan's own correction, build-and-validate §5.)
 */
export const KNOWN_NOTES_MAX = 8000;

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

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

/**
 * A real number, or `null` — and it is `null` for `null`.
 *
 * ⚠ **`Number(null)` is `0`, and `0` is finite.** So the obvious guard,
 * `Number.isFinite(Number(v)) ? … : null`, silently turns "no value" into "zero". That has now
 * bitten this module three times: a cancelled lore roll graded as a total of 0 and spent the
 * player's one attempt; and a kind the GM *told* a character about appeared in the belief ledger
 * as **"rolled 0"** — which is not a smaller truth than "I told them", it is a different and false
 * one, in the record whose whole job is to tell the GM what actually happened.
 *
 * Check the type FIRST. Every nullable numeric field in this file goes through here.
 */
const numOrNull = v => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** A timestamp, or `null`. `0` is not a time — "never delivered" must not read as the epoch. */
const timeOrNull = v => {
  const n = numOrNull(v);
  return n !== null && n > 0 ? n : null;
};

export const clampKnownNotes = v => str(v, KNOWN_NOTES_MAX);
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
    if (!text.trim()) continue; // an empty grant is not a grant
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
 */
export function visibleAttributesFor({ carried = [], registry = [], beliefs = {}, characterId = "", isGM = false } = {}) {
  const byId = new Map(readRegistry(registry).map(e => [e.id, e]));
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

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Phase 3 — the study ladder, minus Foundry                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ## Why the whole grader lives here
 *
 * The study roll is **blind**: nobody at the table ever sees the number that graded it, so a
 * grader that is quietly off by one is invisible until a player writes down the wrong
 * folklore and keeps it forever. There is no chat card to check it against and no retry to
 * catch it with — the one-roll lock means the first wrong answer is the only answer. That is
 * the strongest argument for fixtures in this whole module, and it is why every decision the
 * conduit makes about *content* is a function in this file, called by `study.mjs` with the
 * world handed in.
 *
 * The same one rule as everything above: **nothing here throws.**
 */

export const STUDIED_FLAG = "studied";
export const BELIEFS_FLAG = "beliefs";
export const KIND_OF_FLAG = "kindOf";
export const STUDY_TIERS_FLAG = "studyTiers";
export const STUDY_HOLD_FLAG = "studyHold";

/**
 * How hard this particular creature is to place — **one knob, three behaviours**.
 *
 *   a number   shifts the whole ladder: `+5` → 20/25/30, `-5` → 10/15/20
 *   `"auto"`   free. Inspecting is enough; no roll, no lock, no way to fail
 *   unset      the default ladder, 15/20/25
 *
 * Deliberately not a rarity vocabulary and deliberately not derived from CR. A band table is
 * something to maintain and argue with, and CR measures **danger, not obscurity** — a dragon is
 * CR 17 and famous, an obscure fey is CR ¼ and unheard of. A GM who wants one monster harder
 * nudges that monster.
 *
 * ⚠ `"auto"` is a genuinely different path, not a DC of zero. Nobody permanently fails to know
 * what a chicken is, so a free kind must never take a lock or record a failure — a DC of 0 would
 * still spend the one attempt and could still, absurdly, be failed on a negative total.
 */
export const STUDY_OFFSET_FLAG = "studyOffset";

/** How far the ladder may be nudged either way, so a typo cannot make a kind unknowable. */
export const STUDY_OFFSET_MIN = -15;
export const STUDY_OFFSET_MAX = 25;

/** `"auto"`, or a clamped number. Anything else means "no opinion" and reads as 0. */
export function studyOffsetOf(raw) {
  if (raw === "auto") return "auto";
  const n = num(raw, 0);
  return Math.max(STUDY_OFFSET_MIN, Math.min(STUDY_OFFSET_MAX, n));
}

/** The rungs for one kind, shifted. `[25,20,15,0]` at offset 0. */
export const rungsFor = offset =>
  STUDY_RUNGS.map(r => (r === 0 ? 0 : r + (typeof offset === "number" ? offset : 0)));

/** The rungs, highest first — the order `tierOf` walks and the order an author reads. */
export const STUDY_RUNGS = [25, 20, 15, 0];

/**
 * The base DC handed to dnd5e as `config.target`. It grades nothing above 15 — the 20 and 25
 * rungs are read off the total on the GM's client — but it is what makes `roll.isSuccess`
 * mean "recognised it at all" on the GM's own card.
 */
export const STUDY_BASE_DC = 15;

/** An authored tier message is a paragraph, not a page — and it rides on the kind actor. */
export const TIER_TEXT_MAX = 4000;

/** The one key the kind axis files itself under in `studied` and in a belief record. */
export const KIND_KEY = "kind";

/**
 * What a total buys. `null` in, `null` out — and that is the whole point of this function.
 *
 * ⚠ A cancelled dialog returns no roll, and **no roll is not a failure**. If a cancel ever
 * grades as tier 0 the player spends their one attempt on a mis-click and is handed the
 * sub-15 answer for a roll that never happened. Every caller must treat `null` as "nothing
 * occurred": no lock, no belief, no stub card.
 */
export function tierOf(total, offset = 0) {
  if (total === null || total === undefined || total === "") return null;
  const n = Number(total);
  if (!Number.isFinite(n)) return null;
  /*
   * The offset shifts what each rung COSTS, never what a rung is called. A `+5` kind needs a 20
   * to reach the rung still known as 15 — so authored tier text, belief records and every
   * fixture keep meaning the same thing whatever a GM nudges. Renaming the rungs instead would
   * have made a stored `tier: 20` ambiguous the moment an offset changed.
   */
  const shift = typeof offset === "number" ? offset : 0;
  for (const rung of STUDY_RUNGS) if (rung > 0 && n >= rung + shift) return rung;
  return 0;
}

/**
 * The skill for a kind, off the PHB's **Areas of Knowledge** table — read out of the owned
 * Player's Handbook (`Appendix C: Rules Glossary → Study`) rather than remembered:
 *
 *   Arcana    Aberrations, Constructs, Elementals, Fey, Monstrosities
 *   History   Giants, Humanoids
 *   Nature    Beasts, Dragons, Oozes, Plants
 *   Religion  Celestials, Fiends, Undead
 *
 * That is all fourteen dnd5e creature types with none left over, so the only fallback case is
 * an actor with **no** creature type — 23 of this world's 136 actors — and it takes History,
 * for the same reason `defaultCategory` files them as Sentient: a name with nothing behind it
 * is more often a person than a wolf, and people are History's column.
 *
 * Investigation is in the book's table and deliberately not here: its areas are "traps,
 * ciphers, riddles, and gadgetry" — no creatures at all.
 */
const AREAS_OF_KNOWLEDGE = {
  arc: ["aberration", "construct", "elemental", "fey", "monstrosity"],
  his: ["giant", "humanoid"],
  nat: ["beast", "dragon", "ooze", "plant"],
  rel: ["celestial", "fiend", "undead"]
};

export function studySkill(creatureType) {
  const type = typeof creatureType === "string" ? creatureType.trim().toLowerCase() : "";
  if (!type) return "his";
  for (const [skill, types] of Object.entries(AREAS_OF_KNOWLEDGE)) if (types.includes(type)) return skill;
  return "his"; // a homebrew creature type nobody's table has heard of is still somebody
}

/**
 * The kind of an actor: an optional GM-set pointer, else itself (decision 4).
 *
 * `exists(id)` is injected — on a client it is `game.actors.has`. A **dangling** pointer
 * resolves to self rather than to nothing, which is the load-bearing case: deleting the world
 * "Goblin" actor must degrade every pointer at it into "this creature is its own kind", not
 * into a study roll that silently targets a document that is not there.
 *
 * A pointer at *itself* is also self — writing one is harmless, and a cycle check would be
 * machinery for a state one dropdown cannot produce.
 */
export function resolveKindId(actorId, pointer, exists = () => false) {
  const self = typeof actorId === "string" && actorId.trim() ? actorId.trim() : null;
  if (!self) return null;
  const aim = typeof pointer === "string" ? pointer.trim() : "";
  if (!aim || aim === self) return self;
  let there = false;
  try {
    there = exists(aim) === true;
  } catch {
    there = false;
  }
  return there ? aim : self;
}

/**
 * Authored tier messages, hardened. Sparse by design — a kind with only a 25 written is the
 * common authoring shape, and every other rung falls through to derived prose.
 *
 * A `min` that is not one of the four rungs is dropped rather than snapped to the nearest:
 * an author who typed 18 meant something, and quietly filing it as 15 would deliver text at a
 * threshold they did not choose. First write of a rung wins, as everywhere else in this file.
 */
export function readStudyTiers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const min = num(e.min, NaN);
    if (!STUDY_RUNGS.includes(min) || seen.has(min)) continue;
    const text = str(e.text, TIER_TEXT_MAX).trim();
    if (!text) continue; // an empty rung is not authored; it is a rung waiting to be written
    seen.add(min);
    out.push({ min, text });
  }
  out.sort((a, b) => b.min - a.min);
  return out;
}

/**
 * The authored message for **exactly** this rung, or "".
 *
 * ⚠ Exact, never "the highest rung at or below". Falling down the ladder would hand a 25 the
 * 15's text whenever only the 15 was written — and under decision 5 the 15 may be
 * *deliberately false*, so the fall-through would silently pay a triumph with a lie. Missing
 * rungs fall back to **derived** prose, which is always true because it is read off the sheet.
 */
export function authoredTier(tiers, tier) {
  /*
   * **Rung 0 is the failure case; 15 and up are the truth ladder. They do not mix.**
   *
   * Joe's framing, and it is the one that makes the whole thing legible: *"I need to put in a lie
   * as a failure — it IS a failure case. You didn't make the lowest DC, so I give you the failure.
   * If there is no failure text you just get a generic you never heard of this beast. This makes
   * it clear even to me what is false and what is flavour world-building true. I can have both on
   * a monster."*
   *
   * So the low rung is **false or nothing**, the high rungs are **true**, and a GM reading their
   * own kind actor can tell which is which at a glance. It is also the same shape the other two
   * axes already use — a lore row's `miss`, an attribute's `miss` — so all three now say "what
   * they get when they fail" in the same place.
   *
   * Two rules fall out, and the second is the one this got wrong:
   *
   *  · a **success rung carries upward** until the next authored success replaces it, so flavour
   *    written at 15 is not lost when someone rolls 25
   *  · **rung 0 never carries.** The failure line must not surface on a success — that would hand
   *    a player the lie *as the reward for rolling well*, which is the precise inversion of what
   *    it is for. An earlier cut of this function did exactly that.
   */
  const list = Array.isArray(tiers) ? tiers : [];
  const rungOf = x => Number(x?.min);

  // the miss: isolated, and only ever reached by a roll that failed
  if (tier <= 0) return list.find(x => rungOf(x) === 0)?.text ?? "";

  // the truth ladder: the highest authored SUCCESS rung at or below this roll
  const reached = list.filter(x => Number.isFinite(rungOf(x)) && rungOf(x) > 0 && rungOf(x) <= tier);
  if (!reached.length) return "";
  return reached.reduce((best, x) => (rungOf(x) > rungOf(best) ? x : best)).text ?? "";
}
/** Does this kind carry anything a roll could buy? "No content, no icon" (decision 5). */
export function kindHasContent({ biography = "", tiers = [], attacks = [] } = {}) {
  if (typeof biography === "string" && biography.trim()) return true;
  if (Array.isArray(tiers) && tiers.length) return true;
  return Array.isArray(attacks) && attacks.length > 0;
}

/** The direct children of an id — the inverse of `ancestorsOf`, and just as computed. */
export const childrenOf = (id, registry) =>
  readRegistry(registry).filter(e => e.parent === (typeof id === "string" ? id.trim() : ""));

/**
 * One attribute and everything beneath it, as a nested tree.
 *
 * `state(id)` is injected so this stays pure: the caller decides what "known", "failed" or
 * "unknown" mean and this only arranges them. Depth is capped because a hand-edited registry can
 * contain a cycle (nothing refuses one — see `ancestorsOf`), and a browser that recurses forever
 * is worse than one that stops.
 */
export function subtreeOf(id, registry, { state = () => null, depth = 0, seen = new Set() } = {}) {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key || depth > 12 || seen.has(key)) return null;
  const entry = readRegistry(registry).find(e => e.id === key);
  if (!entry) return null;
  const next = new Set([...seen, key]);
  return {
    id: key,
    title: entry.title,
    category: entry.category,
    icon: entry.icon,
    secret: entry.secret,
    depth,
    state: state(key),
    children: childrenOf(key, registry)
      .map(c => subtreeOf(c.id, registry, { state, depth: depth + 1, seen: next }))
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title))
  };
}

/** Every root, each with its subtree — the whole world as a forest. */
export const forestOf = (registry, opts = {}) =>
  readRegistry(registry)
    .filter(e => !e.parent || !readRegistry(registry).some(x => x.id === e.parent))
    .map(e => subtreeOf(e.id, registry, opts))
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));

/* ── the two ledgers ──────────────────────────────────────────────────────── */

/**
 * `studied`, on the **player's own** actor: `when` and nothing else.
 *
 * ⚠ This is a **UI hint, not the lock** (build-and-validate §5). The player owns this actor,
 * so one `unsetFlag` in their own devtools re-arms the affordance — which is why the GM
 * handler's refusal reads the belief ledger on the studied actor instead, where no player can
 * write. Storing a total or a tier here would also park the blind number one glance deep on
 * the sheet of the person it was hidden from.
 */
export function readStudied(raw) {
  const out = { kind: {}, lore: {} };
  if (!raw || typeof raw !== "object") return out;
  for (const axis of ["kind", "lore"]) {
    const src = raw[axis];
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    for (const [key, val] of Object.entries(src)) {
      if (!key || typeof key !== "string") continue;
      const when = Math.max(0, num(val?.when, 0));
      out[axis][key] = { when };
    }
  }
  return out;
}

/**
 * `beliefs`, on the **studied** actor: what each character was actually told.
 *
 * `delivered` unset is the pending state of the approval gate (disguise decision 8) — there is
 * no queue anywhere, because the row of record *is* the queue. `text` is the fully computed
 * payload, parked here at roll time so a held reveal cannot be lost by a reload, a pop, or a
 * GM who closes the prompt.
 */
/**
 * Why the roll had the advantage state it had (decision 19) — GM-only, on the ledger row.
 *
 * Recorded rather than recomputed: the registry can be edited after a roll, and a GM asking
 * "why was that at advantage" three scenes later must get the answer that was true *then*.
 */
export function clampSources(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const shared = (Array.isArray(raw.shared) ? raw.shared : [])
    .map(x => str(x, ATTR_TITLE_MAX).trim())
    .filter(Boolean)
    .slice(0, 20);
  return {
    adv: Math.max(0, num(raw.adv, 0)),
    dis: Math.max(0, num(raw.dis, 0)),
    shared,
    declared: ["advantage", "disadvantage", "normal"].includes(raw.declared) ? raw.declared : "normal",
    rule: raw.rule === "net" ? "net" : "raw",
    resolved: ["advantage", "disadvantage", "normal"].includes(raw.resolved) ? raw.resolved : "normal"
  };
}

export function readBeliefs(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [characterId, facts] of Object.entries(raw)) {
    if (!characterId || !facts || typeof facts !== "object" || Array.isArray(facts)) continue;
    const kept = {};
    for (const [key, rec] of Object.entries(facts)) {
      if (!key || !rec || typeof rec !== "object") continue;
      const tier = STUDY_RUNGS.includes(num(rec.tier, NaN)) ? num(rec.tier, 0) : null;
      kept[key] = {
        text: clampKnownNotes(rec.text),
        tier,
        total: numOrNull(rec.total),
        when: Math.max(0, num(rec.when, 0)),
        // absent, not zero: `delivered: 0` and "never delivered" must not be the same value
        delivered: timeOrNull(rec.delivered),
        sources: clampSources(rec.sources)
      };
    }
    if (Object.keys(kept).length) out[characterId] = kept;
  }
  return out;
}

/**
 * May this character still roll this fact? **The belief ledger is the lock of record.**
 *
 * `studied` is consulted only to answer "has this client got a record too" for callers that
 * want it; it can never *re-arm* a roll the ledger says was spent. Pass it or don't — the
 * answer for a spent belief is `false` either way, and that is the fixture that matters.
 */
export function mayStudy({ beliefs = {}, studied = { kind: {}, lore: {} }, characterId = "", key = KIND_KEY } = {}) {
  if (!characterId || !key) return false;
  if (beliefs?.[characterId]?.[key]) return false; // spent, server-side, and unforgeable
  const axis = key === KIND_KEY ? "kind" : "lore";
  // A `studied` record with no belief behind it is a leftover — a GM reset that cleared the
  // ledger, or a hand-written flag. It must NOT block: the ledger is the authority in both
  // directions, or a reset would only half-undo.
  void studied?.[axis];
  return true;
}

/* -------------------------------------------- */
/*  Phase 4 — the individual axis: lore rows    */
/* -------------------------------------------- */

/**
 * GM-authored facts about **one** individual (decision 8), on the subject actor:
 *
 * ```js
 * flags["pentaryn-ties"].lore = [
 *   { id, dc: 15, skill: "his", label: "Why they left the coast", text: "…", miss: "…", hold: null }
 * ]
 * ```
 *
 * Flat pass/fail at the GM's DC, one attempt per row — deliberately NOT the kind's graded
 * ladder. A ladder's rungs are stat-block facts every goblin shares; a lore row is a single
 * authored fact with a single price. A GM wanting a ladder on an individual writes three rows
 * with rising DCs and gets something *more* expressive than a forced three-tier grade, since
 * each fact is independently rollable.
 *
 * ## Why this shape is not actor-shaped
 *
 * Nothing in a row names an actor. That is decision 21 rule 3 held at the schema level: the
 * phase 6 attribute registry stores the identical row array against a registry entry, and the
 * same editor and the same reader serve both. If a row ever grows an `actorId` field, that
 * rule has been broken and the attribute phase becomes a migration instead of a widening.
 */
export const LORE_FLAG = "lore";

/** A label is a line on a button — the affordance, not the secret. */
export const LORE_LABEL_MAX = 120;

/** A lore row is a paragraph like a tier message, and rides on the same kind of document. */
export const LORE_TEXT_MAX = TIER_TEXT_MAX;

/**
 * The DC band. Wide enough for "trivially known" to "nobody alive knows this" and bounded so
 * a typo cannot author an unrollable row.
 */
export const LORE_DC_MIN = 1;
export const LORE_DC_MAX = 40;

/** The DC a fresh row starts at — the same number the kind ladder calls "recognised it". */
export const LORE_DC_DEFAULT = STUDY_BASE_DC;

/**
 * The namespaced fact key — decision 21 rule 1, and the reason it exists.
 *
 * Never the bare `"<actorId>:<loreId>"` of decision 8's first draft. `attr:` and `mask:` are
 * siblings in the same keyspace (`studied.lore`, belief rows, `granted`), so an unnamespaced
 * key would collide the moment the attribute phase lands and the fix would be a migration of
 * live player data. Costs nothing now; deletes that migration entirely.
 */
export const loreFactKey = (actorId, loreId) => `lore:${String(actorId ?? "")}:${String(loreId ?? "")}`;

/**
 * Split a fact key back into its parts. Returns `null` for anything unrecognised rather than
 * a half-parsed object — a caller that cannot identify a fact must refuse it, not guess.
 */
export function parseFactKey(key) {
  const raw = typeof key === "string" ? key.trim() : "";
  if (!raw) return null;
  /*
   * ⚠ NEVER `split(":")` here. The **subject** segment can itself contain colons: decision 16
   * advertises authoring a registry entry for a derived id, so `attr:species:human:origin` is a
   * legitimate fact key whose attribute id is `species:human` and whose fact is `origin`.
   * A naive split read the subject as `"species"` and the fact as `"human"`, and the grant then
   * matched no attribute and rendered nowhere — found by review, reproduced, fixtured below.
   *
   * The grammar that actually holds: the namespace is up to the FIRST colon, the fact is after
   * the LAST, and everything between is the subject however many colons it contains. Fact ids
   * are Foundry randomIDs and namespaces are a closed set, so only the middle is variable.
   */
  const first = raw.indexOf(":");
  if (first < 0) return null;
  const ns = raw.slice(0, first);
  const rest = raw.slice(first + 1);
  if (!rest) return null;
  if (ns === "kind") return { ns, subject: rest, fact: KIND_KEY };
  if (ns !== "lore" && ns !== "attr" && ns !== "mask") return null;
  const last = rest.lastIndexOf(":");
  if (last < 0) return null;
  const subject = rest.slice(0, last);
  const fact = rest.slice(last + 1);
  if (!subject || !fact) return null;
  return { ns, subject, fact };
}

/**
 * A ledger key (`<factKey>:<characterId>`) split back into its two halves.
 *
 * Same rule and the same reason: the character id is after the last colon, everything before it
 * is the fact key — which has its own colons and, for an authored derived attribute, one more
 * than the naive count expects.
 */
export function parseLedgerKey(key) {
  const raw = typeof key === "string" ? key.trim() : "";
  const last = raw.lastIndexOf(":");
  if (last < 0) return null;
  const characterId = raw.slice(last + 1);
  const fact = parseFactKey(raw.slice(0, last));
  if (!characterId || !fact) return null;
  return { ...fact, factKey: raw.slice(0, last), characterId };
}

/** One row, sanitised. Never throws; an unusable row is dropped by the reader, not repaired. */
export function clampLoreRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = typeof row.id === "string" ? row.id.trim().slice(0, 64) : "";
  if (!id) return null;
  /*
   * A blank label is kept, not refused. The reader sanitises *storage*, and a row a GM has
   * just added and not yet named is legitimate stored state — dropping it here would delete
   * the row on the way to disk the instant it was created. Whether a row can be *offered* is
   * a different question with a different answer, and it lives in `rollableLore` below.
   */
  const label = str(row.label, LORE_LABEL_MAX).trim();
  const dc = Math.max(LORE_DC_MIN, Math.min(LORE_DC_MAX, num(row.dc, LORE_DC_DEFAULT)));
  return {
    id,
    label,
    dc,
    // the skill is validated against the world's own list by the caller that has one; here it
    // is only shape-checked, because this file is not allowed to know what dnd5e ships
    skill: typeof row.skill === "string" && row.skill.trim() ? row.skill.trim().slice(0, 32) : "his",
    text: str(row.text, LORE_TEXT_MAX),
    /*
     * The miss line, and it is the honesty feature, not a nicety (decision 8's amendment).
     * Under blind rolls a row with no miss text **leaks failure by silence**: a pass hands
     * over prose, a fail hands over nothing, and the player reads the absence. Authoring a
     * miss — vague or confidently false, the GM's choice — is what makes a lore row
     * indistinguishable, the property the whole tier ladder gets for free.
     */
    miss: str(row.miss, LORE_TEXT_MAX),
    // tri-state, like the kind's `studyHold`: null inherits the world's `holdDefault`
    hold: row.hold === true ? true : row.hold === false ? false : null
  };
}

/**
 * Can this row be put in front of a player?
 *
 * Two conditions, and both are about not wasting the one attempt:
 *
 *  · **a label** — it is the affordance itself; an unnamed row is a button with no invitation
 *  · **something to say on at least one side** — a row with neither `text` nor `miss` hands
 *    over nothing whatever the dice do, so offering it spends the attempt on guaranteed
 *    silence. One side authored is fine (that is the leak the editor warns about, and the
 *    GM's call to make); neither side is a draft.
 */
export const loreRollable = row => {
  const clean = clampLoreRow(row);
  return !!clean && !!clean.label && !!(clean.text.trim() || clean.miss.trim());
};

/** Just the rows a player may be offered — the affordance list, never the storage list. */
export const rollableLore = rows => readLore(rows).filter(loreRollable);

/** The stored array. Junk rows vanish; duplicate ids keep the first, which is the authored one. */
export function readLore(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const clean = clampLoreRow(row);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/**
 * What a lore row hands over for a given total — the whole grading rule for the individual
 * axis, in one place, so `study.mjs` decides nothing about content.
 *
 * Returns `null` only for "no roll happened", exactly like `tierOf`: a cancelled dialog must
 * never grade as a failure and spend the one attempt.
 */
export function loreOutcome(row, total) {
  const clean = clampLoreRow(row);
  if (!clean) return null;
  /*
   * ⚠ `Number(null)` is 0 and `Number("")` is 0, and both are finite — so a bare
   * `Number.isFinite` check grades a cancelled dialog as a total of zero, fails the row, and
   * spends the player's one attempt on a mis-click. Reject the non-numbers by type FIRST.
   * This is the same trap `tierOf` documents; a fixture caught it here.
   */
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  const pass = Math.round(total) >= clean.dc;
  const text = pass ? clean.text : clean.miss;
  return {
    pass,
    text: text.trim(),
    /*
     * A pass with no authored text, or a miss with no authored miss line, hands over nothing —
     * and the caller must still write the lock and post the stub, or the *absence* of a card
     * becomes the tell. `silent` is how the conduit knows to skip only the grant.
     */
    silent: !text.trim()
  };
}

/** A fresh row, ready for the editor. `id` is injected so this file stays free of randomness. */
export function makeLoreRow(id, { skill = "his", dc = LORE_DC_DEFAULT } = {}) {
  return { id: String(id ?? ""), label: "", dc, skill, text: "", miss: "", hold: null };
}

/* -------------------------------------------- */
/*  Phase 6 — the attribute layer               */
/* -------------------------------------------- */

/**
 * The registry (decision 16): **authored structure only**, in a world setting.
 *
 * A world setting rather than a flag for one reason, and it is not secrecy — everything in a
 * world syncs to every client regardless (decision 8's measurements). It is **writability**:
 * `SETTINGS_MODIFY` requires role 4, so the server refuses a player write. That puts
 * attribute-lore locks in the same player-unwritable category as the beliefs flag on an NPC,
 * which is the only property the lock needs.
 */
export const REGISTRY_SETTING = "attributes";

/** The ledger — a **sibling** setting, never rows inside registry entries (the two-plane rule). */
export const ATTR_BELIEFS_SETTING = "attributeBeliefs";

/** Authored links, on any actor, GM-written. Derived links are computed and never stored. */
export const ATTRIBUTES_FLAG = "attributes";

/** Suppress one derived link on one actor — the only storage derivation ever needs. */
export const ATTRIBUTES_OFF_FLAG = "attributesOff";

export const ATTR_TITLE_MAX = 120;
export const ATTR_CATEGORY_MAX = 60;

/**
 * The namespaces derivation produces. Anything with a `:` is derived; a bare slug is authored.
 *
 * That is what makes decision 18's uniqueness rule free: an authored id is `[a-z0-9]+` with no
 * separator, so it can never collide with `species:human` no matter what a GM types.
 */
export const DERIVED_NAMESPACES = ["type", "species", "background", "size", "kind"];

/**
 * Which derived namespaces may grant advantage even when a GM has authored a registry entry
 * for them (decision 19's degeneracy rule).
 *
 * `type:humanoid` is carried by nearly every PC and most NPCs in a campaign — if sharing it
 * granted advantage, studying almost anyone would be at advantage and the mechanic would mean
 * nothing. Sharing a *guild* is information; sharing a *silhouette* is not. `size:` goes with
 * it for the same reason. `species:`, `background:` and `kind:` are narrow enough to be real
 * information, so an authored entry may switch them on.
 */
const NEVER_ADVANTAGE = new Set(["type", "size"]);

/*
 * The same two namespaces can never be *secret* either, and for the same reason turned around:
 * a medium humanoid cannot conceal being medium or humanoid — those are the silhouette, visible
 * to anyone with eyes. Marking them secret would put a roll in front of a fact the player is
 * already looking at. `species:`, `background:` and `kind:` may be secret if a GM says so; a
 * hidden background is a real story.
 */

/**
 * The help scale — what a relation to an attribute buys you on an identification roll.
 *
 * ⚠ `enables` was called `gate` in an earlier draft, and that was a naming defect: `hold` (the
 * approval gate) is a **separate, orthogonal** field, and one word for two ideas is how the
 * design nearly grew a bug. `enables` says what it does — knowing the thing lets you roll at all,
 * and helps no further.
 *
 * ⚠ `auto` here means **no roll needed**. It does NOT mean "deliver without asking" — that is
 * `hold: false`. Never label a hold control "auto".
 */
export const HELP_SCALE = ["enables", "advantage", "auto"];

/** `whenCarried`'s floor: carrying implies knowing, so it can never be *weaker* than `whenKnown`. */
export const CARRIED_SCALE = ["inherit", "advantage", "auto"];

/**
 * The fact id reserved for "does this creature carry this attribute" — the identification roll,
 * as opposed to a lore row about the attribute.
 *
 * Leading `#` because a lore row id is `foundry.utils.randomID()` (16 alphanumerics), so this can
 * never collide with one no matter how many rows a GM authors.
 */
export const MEMBER_FACT = "#id";

/** Per-character world knowledge — which attributes this character knows *exist*. */
export const KNOWLEDGE_SETTING = "attributeKnowledge";

/** Per-creature identifications ride the shipped `beliefs` flag on the subject actor. */
export const IDENT_FLAG = BELIEFS_FLAG;

/**
 * `attrIdOf(title)` — decision 18, Joe's rule as a function.
 *
 * Lowercase, Unicode-normalise (NFKD, strip combining marks), keep only `[a-z0-9]`. So
 * `"Yellow Stone"`, `"yellowstone"` and `"Yéllowstone"` all produce `yellowstone`, and the
 * second *creation* is refused with the existing entry offered instead — the autocomplete
 * already showed it, so creating past it was not deliberate. `yellowstone2` is how you mean a
 * different one, which is Joe's own convention, unmodified.
 *
 * Titles stay free-form and display-only; this is the only thing that has to be unique.
 */
export function attrIdOf(title) {
  const raw = typeof title === "string" ? title : "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks, so "é" has already become "e" + mark
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 64);
}

/** Is this a derived id, and if so which namespace? `null` for an authored slug. */
export function derivedNamespace(id) {
  const raw = typeof id === "string" ? id.trim() : "";
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const ns = raw.slice(0, i);
  return DERIVED_NAMESPACES.includes(ns) ? ns : null;
}

/** One registry entry, sanitised. Never throws; an entry with no usable id is dropped. */
export function clampAttribute(entry) {
  if (!entry || typeof entry !== "object") return null;
  const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
  // a derived id keeps its namespace verbatim; an authored one is re-normalised, so a
  // hand-edited setting cannot smuggle in an id the autocomplete could never have produced
  const ns = derivedNamespace(rawId);
  const id = ns ? `${ns}:${attrIdOf(rawId.slice(ns.length + 1))}` : attrIdOf(rawId);
  if (!id || (ns && id === `${ns}:`)) return null;
  const title = str(entry.title, ATTR_TITLE_MAX).trim();
  const degenerate = !!ns && NEVER_ADVANTAGE.has(ns);
  return {
    id,
    // a title is display-only, so falling back to the id keeps a hand-written entry usable
    title: title || id,
    category: str(entry.category, ATTR_CATEGORY_MAX).trim(),
    icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon.trim() : null,
    /*
     * Decision 19: authored attributes default ON (the rogue guild is automatic, as Joe
     * asked); `type:`/`size:` are forced OFF whatever the stored value says, because an
     * entry authored for them would otherwise re-open the degeneracy this rule closes.
     */
    /*
     * The help scale, clamped on read so a hand-edited setting cannot reopen decision 19's
     * degeneracy: `type:` and `size:` are carried by nearly everything, and advantage that
     * applies to almost every roll means nothing.
     */
    whenKnown: degenerate ? "enables" : pick(entry.whenKnown, HELP_SCALE, "enables"),
    whenCarried: degenerate ? "inherit" : carriedFloor(entry.whenKnown, entry.whenCarried),
    /*
     * Is membership itself a secret? **Authored attributes default true** — a guild is the sort of
     * thing you have to work out. **Derived ids default false**: a goblin is visibly a goblin, and
     * `type:`/`size:`/`species:`/`kind:` are things you can simply see.
     */
    secret: degenerate ? false : ns ? entry.secret === true : entry.secret !== false,
    // the price of identifying it. `parent` is the tree; a cycle or a dangling ref is resolved by
    // `ancestorsOf`, never here — this function sanitises one entry and knows nothing of the rest
    parent: typeof entry.parent === "string" && entry.parent.trim() ? entry.parent.trim() : null,
    dc: Math.max(LORE_DC_MIN, Math.min(LORE_DC_MAX, num(entry.dc, LORE_DC_DEFAULT))),
    skill: typeof entry.skill === "string" && entry.skill.trim() ? entry.skill.trim().slice(0, 32) : "his",
    reveal: str(entry.reveal, LORE_TEXT_MAX),
    /*
     * The miss line, and the same honesty rule lore rows carry: under a blind roll an attribute
     * with nothing authored on the failing side leaks failure by silence.
     */
    miss: str(entry.miss, LORE_TEXT_MAX),
    // the approval gate, tri-state exactly like a lore row's — and ORTHOGONAL to the scale above
    hold: entry.hold === true ? true : entry.hold === false ? false : null,
    lore: readLore(entry.lore),
    bonuses: [] // decision 20 — reserved, empty in v1, and emptied on read so it stays that way
  };
}

/** One of a fixed vocabulary, or the default — never whatever was stored. */
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/**
 * `whenCarried` may never be weaker than `whenKnown`.
 *
 * Carrying implies knowing (a character knows their own groups), so a carrier already has whatever
 * knowing grants — `whenCarried: enables` could never mean anything, and storing a weaker value
 * would describe a state the engine cannot produce. Clamp up rather than store nonsense.
 */
function carriedFloor(whenKnown, whenCarried) {
  const known = pick(whenKnown, HELP_SCALE, "enables");
  const carried = pick(whenCarried, CARRIED_SCALE, "inherit");
  if (carried === "inherit") return "inherit";
  return HELP_SCALE.indexOf(carried) < HELP_SCALE.indexOf(known) ? "inherit" : carried;
}

/** What a relation actually grants, with `inherit` resolved. */
export function helpFor(entry, { carried = false } = {}) {
  const clean = clampAttribute(entry);
  if (!clean) return "enables";
  if (!carried) return clean.whenKnown;
  return clean.whenCarried === "inherit" ? clean.whenKnown : clean.whenCarried;
}

/** The whole registry. Duplicate ids keep the first; junk vanishes. */
export function readRegistry(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const clean = clampAttribute(entry);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/* ── the tree ─────────────────────────────────────────────────────────────── */

/**
 * The ancestor chain of an id, nearest parent first — computed, never stored on the tree itself.
 *
 * Two degradation rules, and both fail toward **available**:
 *
 *  · a **dangling** parent (the entry was deleted) resolves the node to a root rather than to
 *    unreachable. Same principle `resolveKindId` settled for the kind pointer: the failure mode of
 *    "slightly too easy to reach" is a GM noticing, and the failure mode of "unreachable" is
 *    silence — which is this module's worst outcome and the one it has been bitten by.
 *  · a **cycle** (only reachable by hand-editing the setting) stops at the repeat and treats it as
 *    a root, so a malformed registry costs a wrong gate rather than a hung client.
 */
export function ancestorsOf(id, registry) {
  const byId = new Map(readRegistry(registry).map(e => [e.id, e]));
  const out = [];
  const seen = new Set([typeof id === "string" ? id.trim() : ""]);
  let cur = byId.get(typeof id === "string" ? id.trim() : "")?.parent ?? null;
  while (cur) {
    if (seen.has(cur)) break; // a cycle: stop, treat as root
    const entry = byId.get(cur);
    if (!entry) break; // dangling: the chain ends here, so the node is a root
    seen.add(cur);
    out.push(cur);
    cur = entry.parent;
  }
  return out;
}

/** An id plus everything above it — what linking a child must actually write (Joe's Q1). */
export const withAncestors = (id, registry) => [id, ...ancestorsOf(id, registry)];

/**
 * Would setting `parent` on `id` create a cycle? Refused at authoring time, so the resolver's
 * cycle guard above is a backstop for hand-edited settings rather than a load-bearing rule.
 */
export function wouldCycle(id, parent, registry) {
  const target = typeof id === "string" ? id.trim() : "";
  const start = typeof parent === "string" ? parent.trim() : "";
  if (!target || !start) return false;
  if (start === target) return true;
  return ancestorsOf(start, registry).includes(target);
}

/**
 * The rungs an identification must climb for one attribute, root first.
 *
 * Only **secret** rungs are rolled: a visible ancestor (a `type:` or an unmarked species) is not a
 * question, so it is not a roll and not a gate. That keeps a guild under a visible species from
 * costing a pointless rung.
 */
export function identificationLadder(id, registry) {
  const byId = new Map(readRegistry(registry).map(e => [e.id, e]));
  const target = typeof id === "string" ? id.trim() : "";
  /*
   * A visible target is not a question, so it has no ladder at all — not even its ancestors'.
   * Returning the ancestors here would put a roll for the city in front of a fact the player can
   * already see, which is the opposite of what secrecy is for.
   */
  if (!target || !byId.get(target)?.secret) return [];
  return [...ancestorsOf(id, registry).reverse(), target].filter(step => byId.get(step)?.secret);
}

/* ── the two ledgers ──────────────────────────────────────────────────────── */

/**
 * World knowledge: which attributes a character knows **exist**, and which they have permanently
 * failed to know.
 *
 * A **world setting**, not a flag on the character — a character actor is owned by its player, so
 * a flag there would be player-writable and the lock would be forgeable. `SETTINGS_MODIFY`
 * requires role 4, which is the module's only real integrity boundary.
 *
 * `failed: true` is the permanent lockout: the character can never again *recognise it on sight*.
 * They can still be told (GM grant), which is the whole of Joe's release valve.
 */
export function readKnowledge(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [characterId, attrs] of Object.entries(raw)) {
    if (!characterId || !attrs || typeof attrs !== "object" || Array.isArray(attrs)) continue;
    const kept = {};
    for (const [attrId, rec] of Object.entries(attrs)) {
      if (!attrId || !rec || typeof rec !== "object") continue;
      kept[attrId] = {
        when: Math.max(0, num(rec.when, 0)),
        failed: rec.failed === true,
        /*
         * Written at roll time because it is the stage-1 lock, but not yet the player's to see
         * when the rung it came from is held. Gating and advantage read it as known (the roll
         * happened); the player-facing list hides it until the GM delivers.
         */
        pending: rec.pending === true,
        // how it arrived, for the GM's own reading of the tree — never shown to a player
        via: ["roll", "grant", "carried"].includes(rec.via) ? rec.via : "roll"
      };
    }
    if (Object.keys(kept).length) out[characterId] = kept;
  }
  return out;
}

/** Does this character know this attribute exists? A failed row is knowledge of nothing. */
export const knowsAttribute = (knowledge, characterId, attrId) =>
  readKnowledge(knowledge)[characterId]?.[attrId]?.failed === false;

/** Has this character permanently lost the chance to recognise it on sight? */
export const failedAttribute = (knowledge, characterId, attrId) =>
  readKnowledge(knowledge)[characterId]?.[attrId]?.failed === true;

/**
 * Has this character settled the question of this attribute at all — either way?
 *
 * The stage-1 lock: one roll ever, and a failure counts. This is what stops a player rolling on
 * "what city are they from" once per stranger until the dice cooperate.
 */
export const settledAttribute = (knowledge, characterId, attrId) =>
  !!readKnowledge(knowledge)[characterId]?.[attrId];

/**
 * Has this character already settled whether **this creature** carries **this attribute**?
 *
 * Identifications ride the shipped `beliefs` flag on the SUBJECT actor, under the reserved fact
 * `attr:<attrId>:#id`. Same plane and same unforgeability as every other belief row: the subject
 * is a document the roller does not own.
 */
export const identifiedKey = attrId => `attr:${String(attrId ?? "")}:${MEMBER_FACT}`;

export function identifiedState(beliefs, characterId, attrId) {
  const rec = readBeliefs(beliefs)[characterId]?.[identifiedKey(attrId)];
  if (!rec) return { settled: false, carries: false, held: false };
  const passed = !!String(rec.text ?? "").trim();
  /*
   * ⚠ `carries` requires **delivered**, not merely passed.
   *
   * Found by playtesting: a rung that passed but is waiting on the GM's approval was reported as
   * a positive identification, so the secrecy filter showed the player a guild membership the GM
   * had not released yet — the roll's own result, leaked by the surface that exists to hide it.
   * The row's comment claimed this check; the code did not make it.
   *
   * It also makes the cascade's hold behaviour explicit rather than incidental: an undelivered
   * rung reads as "not yet identified", so the planner will not climb past it. Delivery flips
   * this and the re-entrant re-run continues the climb.
   */
  return { settled: true, carries: passed && !!rec.delivered, held: passed && !rec.delivered, record: rec };
}

/**
 * **The cascade planner** — the whole of phase 8's control flow, as a pure function.
 *
 * Given who is looking, what they know, what they have already identified on this creature, and
 * what the creature carries, decide the next thing to do. Returns one of:
 *
 *   `{ done: true }`                    nothing left — every ladder is climbed or blocked
 *   `{ roll: <attrId>, … }`             this rung needs a blind roll, with its help resolved
 *   `{ grant: <attrId>, … }`            this rung is automatic — no roll, just deliver
 *
 * Deliberately returns **one step at a time**. The conduit loops it, which is what makes the
 * cascade re-entrant: after a held rung is released the conduit simply asks again, and the planner
 * — reading the ledgers, which have changed — returns the next rung. No suspended state is stored
 * anywhere, because there is none to store.
 */
export function planStep({
  registry = [],
  carried = [],
  knowledge = {},
  beliefs = {},
  characterId = "",
  rollerCarries = []
} = {}) {
  const byId = new Map(readRegistry(registry).map(e => [e.id, e]));
  const mine = new Set(Array.isArray(rollerCarries) ? rollerCarries : []);
  const subjectHas = new Set(Array.isArray(carried) ? carried : []);

  /*
   * PASS 1 — free knowledge first: the kin-sense bypass.
   *
   * ⚠ This has to be a separate pass over every carried attribute, not a check inside the ladder
   * walk below. The walk returns the first actionable rung it finds, and the ladder is climbed
   * root-first — so an assassin looking at a fellow assassin who is also Ardenhaven-born would be
   * handed a roll for the *city* and never reach the mark under the eye at all. Bypasses cost no
   * dice and can make later rungs moot, so they resolve before anything is rolled.
   */
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret || !mine.has(attrId)) continue;
    if (helpFor(entry, { carried: true }) !== "auto") continue;
    if (identifiedState(beliefs, characterId, attrId).settled) continue;
    return { grant: attrId, entry, backfill: !knowsAttribute(knowledge, characterId, attrId), bypass: true };
  }

  // PASS 2 — climb each ladder, root first, and return the first rung that needs resolving
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret) continue; // visible: not a question

    for (const rung of identificationLadder(attrId, registry)) {
      // only rungs this creature actually carries are askable — Q1 materialises ancestors, so a
      // carrier of the guild carries the district too, and a gap here means an invalid sheet
      if (!subjectHas.has(rung)) break;
      const already = identifiedState(beliefs, characterId, rung);
      if (already.settled) {
        // already answered. A negative answer blocks everything beneath it.
        if (!already.carries) break;
        continue;
      }

      const rungEntry = byId.get(rung);
      const iCarry = mine.has(rung);
      const help = helpFor(rungEntry, { carried: iCarry });

      // stage 1: do they know this thing exists at all?
      const knows = knowsAttribute(knowledge, characterId, rung);
      if (!knows && failedAttribute(knowledge, characterId, rung)) break; // permanently unrecognisable
      if (help === "auto") return { grant: rung, entry: rungEntry, backfill: !knows, bypass: false };
      return {
        roll: rung,
        entry: rungEntry,
        // the backfill: a first success proves they knew it all along (Joe's rule)
        backfill: !knows,
        advantage: help === "advantage" && (knows || iCarry)
      };
    }
  }
  return { done: true };
}

/**
 * Derive an actor's attribute ids from plain data — **never stored** (decision 16).
 *
 * That is the whole backfill answer: 115 NPCs arrive populated with nothing to write, a
 * species edit propagates instantly, and "derived vs authored" needs no marker because derived
 * ids carry a namespace and authored ones cannot.
 *
 * Takes a plain description rather than an actor so this file stays free of Foundry; the
 * client half reads the paths in decision 16's verified table and hands them in.
 */
export function deriveAttributes({ type = null, size = null, species = null, background = null, kindId = null } = {}) {
  const out = [];
  const push = (ns, value) => {
    const slug = ns === "kind" ? String(value ?? "").trim() : attrIdOf(value);
    if (slug) out.push(`${ns}:${slug}`);
  };
  push("type", type);
  push("size", size);
  push("species", species);
  push("background", background);
  // the kind pointer is an ACTOR id, not a slug — it is not lowercased or stripped, or it
  // would stop matching the document it names
  if (kindId) push("kind", kindId);
  return [...new Set(out)];
}

/**
 * An actor's effective attribute set: derived ∪ authored, minus suppressed.
 *
 * Suppression applies to **both** — a GM who wants one orc not to count as `type:humanoid`,
 * or one guild link removed without editing the flag, uses the same list either way.
 */
export function attributeIdsFor({ derived = [], authored = [], off = [] } = {}) {
  const suppressed = new Set((Array.isArray(off) ? off : []).map(x => String(x ?? "").trim()).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const id of [...(Array.isArray(derived) ? derived : []), ...(Array.isArray(authored) ? authored : [])]) {
    const clean = typeof id === "string" ? id.trim() : "";
    if (!clean || suppressed.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}


/**
 * `combineAdvantage(adv, dis, rule)` — the last-moment decision, so nothing is stored.
 *
 * **RAW is the default**, and deliberately: the 2024 PHB cancels outright when both are
 * present *regardless of how many sit on each side*, and a module meant to ship defaults to
 * the book rather than to one table's house rule (the same posture decision 13a takes). Joe
 * wants netting — each advantage +1, each disadvantage −1, sign decides — and that is the
 * `advantageStacking` world setting, one flip.
 *
 * The two rules disagree on exactly the interesting case: 2 advantage + 1 disadvantage is
 * `"normal"` under RAW and `"advantage"` under netting.
 */
export function combineAdvantage(adv = 0, dis = 0, rule = "raw") {
  const a = Math.max(0, num(adv, 0));
  const d = Math.max(0, num(dis, 0));
  if (rule === "net") {
    if (a > d) return "advantage";
    if (d > a) return "disadvantage";
    return "normal";
  }
  if (a > 0 && d > 0) return "normal"; // RAW: both present cancels, however many
  if (a > 0) return "advantage";
  if (d > 0) return "disadvantage";
  return "normal";
}

/** The attribute ledger's key — one row per character per attribute fact. */
export const attrFactKey = (attrId, loreId) => `attr:${String(attrId ?? "")}:${String(loreId ?? "")}`;

/**
 * The ledger setting, sanitised. Keyed `<attrId>:<loreId>:<characterId>` — a flat map rather
 * than a nested one, because a setting is rewritten whole on every write and a flat map keeps
 * that rewrite a single small object.
 */
export function readAttrBeliefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, rec] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim() || !rec || typeof rec !== "object") continue;
    out[key.trim()] = {
      text: clampKnownNotes(rec.text),
      tier: null, // attribute lore is flat pass/fail; a tier here would be a lie
      total: numOrNull(rec.total),
      when: Math.max(0, num(rec.when, 0)),
      delivered: timeOrNull(rec.delivered),
      claim: typeof rec.claim === "string" && rec.claim ? rec.claim : null,
      sources: clampSources(rec.sources)
    };
  }
  return out;
}

/**
 * The approval gate's tri-state (disguise decision 8): the thing's own `hold` wins when it is
 * a real boolean; `undefined`/anything else inherits the world's `holdDefault`.
 */
export function holdResolved(itemHold, holdDefault = false) {
  if (itemHold === true) return true;
  if (itemHold === false) return false;
  return holdDefault === true;
}

/* ── enricher flattening: the guard, not a convenience ────────────────────── */

const UNRESOLVED = /\[\[|@UUID\[|&(?:amp;)?[A-Za-z]+\[/;

/**
 * Did enrichment actually resolve this, or is it still source code?
 *
 * **Probed live on 2026-08-23** against the installed Monster Manual, which is what makes
 * this a guard rather than a worry. `enrichHTML(desc, {relativeTo: item, rollData:
 * item.getRollData()})` on a real MM Goblin Warrior turns
 *
 *     <p>[[/attack extended]]. [[/damage average extended]], plus …</p>
 *
 * into "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, …" — real
 * numbers, no brackets. Enriching the **same string without `relativeTo`** leaves
 * `[[/attack extended]]` completely intact, because the enricher has no activity to resolve
 * against. That is the failure this guard exists for, and it is nastier than it looks: a
 * generic tag-stripper (pentaryn-lookup's `toPlainText`, whose job is search snippets)
 * degrades the survivor to the words "attack extended" — plausible-looking gibberish in a
 * player's notebook, with nothing left to detect it by.
 *
 * So this module does NOT reuse that flattener, and the plan's instruction to do so does not
 * survive contact: the two want opposite policies on an unresolved enricher. Lookup keeps the
 * words; the notebook must **refuse the string**.
 */
export function hasUnresolvedEnricher(html) {
  return typeof html === "string" && UNRESOLVED.test(html);
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", times: "×", minus: "−", deg: "°"
};

/**
 * Enriched HTML → the prose that lands in a notebook.
 *
 * Block tags become spaces so `<p>a</p><p>b</p>` reads "a b" — but dnd5e's enrichers wrap
 * *inline* spans around every number, so a naive strip yields "Melee Attack Roll : +4 , reach
 * 5 ft ." (observed, in the probe above). The punctuation pass is therefore not cosmetic
 * either: this text is pasted into a player-owned textarea and never enriched again.
 */
export function flattenHTML(html) {
  if (typeof html !== "string" || !html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?%)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

/** Flatten, or refuse. `null` means "this string is not fit to hand a player". */
export function safeFlatten(html) {
  if (hasUnresolvedEnricher(html)) return null;
  return flattenHTML(html);
}

/**
 * How much *derived* description a reveal will paste. Authored tier messages are not capped
 * here — they have their own `TIER_TEXT_MAX` and a GM who writes 900 words meant them.
 */
export const DERIVED_PROSE_MAX = 700;

/**
 * ⚠ **A Monster Manual biography is not a description — it is the creature's whole lore page.**
 *
 * Measured on the installed MM, not guessed: the Goblin Warrior's
 * `system.details.biography.value` flattens to well over 3,000 characters and opens with a
 * gear list and two image captions ("Gear: Leather Armor, Scimitar…", "A goblin boss, a goblin
 * hexer, and a goblin warrior prepare to strike…") before it reaches a sentence anybody would
 * write in a notebook. The plan's "biography flattened to prose" assumed a paragraph. Pasting
 * the real thing would bury the player's own page under a page of the publisher's.
 *
 * So the derived rung is capped, cut on a word boundary, and marked with an ellipsis so the
 * truncation reads as deliberate. This is also the honest argument for the feature the plan
 * actually cares about: **the authored tier message is the description**, and the derived text
 * is only what keeps a kind rollable before anyone has written one.
 */
export function capProse(text, max = DERIVED_PROSE_MAX) {
  const s = String(text ?? "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, "")}…`;
}

/* ── composing the reveal ─────────────────────────────────────────────────── */

/**
 * One line of resistances, from already-localized label arrays.
 *
 * The caller resolves `di`/`dr`/`dv`/`ci` off the sheet and localizes them; this only decides
 * what a *line* is. A kind with none of them returns "" and the tier-20 rung then buys the
 * honest truth that there is nothing to be immune to — the sentence is the caller's
 * (`nothingNotable`), because it is prose.
 */
export function traitsLine({ immune = [], resist = [], vulnerable = [], conditionImmune = [] } = {}, labels = {}) {
  const parts = [];
  const push = (key, list) => {
    const clean = (Array.isArray(list) ? list : []).map(x => String(x ?? "").trim()).filter(Boolean);
    if (clean.length) parts.push(`${labels[key] ?? key}: ${clean.join(", ")}.`);
  };
  push("immune", immune);
  push("resist", resist);
  push("vulnerable", vulnerable);
  push("conditionImmune", conditionImmune);
  return parts.join(" ");
}

/**
 * The reveal, exactly as it lands in the notes (decision 7's shape).
 *
 *     — Studied (Nature) —
 *     A small, black-hearted humanoid…
 *     Immune: poison. Resists: cold.
 *     Scimitar: Melee Attack Roll +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage
 *
 * ⚠ The header carries the **skill and nothing else**. The first cut of the plan wrote
 * "Nature 22 vs DC 15" into it — the exact number and DC the blind roll exists to hide,
 * printed into a field the player can read at leisure. If a maintainer is ever tempted to put
 * the total back "so the player can see how well they did": that is the number, and the whole
 * feature is built to not have it here.
 *
 * `description` is the authored tier message when one exists and the derived biography when it
 * does not — the caller decides, because only the caller knows whether the author wrote one.
 * Everything below the description is gated by tier and is always derived, always true.
 */
export function composeReveal({
  tier = 0,
  header = "",
  description = "",
  traits = "",
  attacks = [],
  separator = " · "
} = {}) {
  const lines = [];
  if (header) lines.push(header);
  const desc = String(description ?? "").trim();
  if (desc) lines.push(desc);
  if (tier >= 20 && String(traits ?? "").trim()) lines.push(String(traits).trim());
  if (tier >= 25) {
    const clean = (Array.isArray(attacks) ? attacks : []).map(a => String(a ?? "").trim()).filter(Boolean);
    if (clean.length) lines.push(clean.join(separator));
  }
  return lines.join("\n");
}

