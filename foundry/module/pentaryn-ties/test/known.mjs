#!/usr/bin/env node
/**
 * Fixtures for `known-core.mjs`. No dependencies, no Foundry — `node test/known.mjs`.
 *
 * Everything asserted here fails SILENTLY in a running client if it regresses: a junk
 * category quietly becomes the wrong bucket, a duplicate id doubles a row, a `when` of
 * `"yesterday"` shuffles a notebook, a 40k-character paste rides on every actor update
 * forever. None of it throws, and none of it is visible until a player's list is already
 * wrong. That is the whole reason this file exists — the same reason lookup's runner does.
 *
 * ⚠ The first import is itself the strongest check in the file: this module is loaded with
 * `game`, `canvas`, `ui` and `foundry` undefined. If `known-core.mjs` ever grows a
 * Foundry global at module scope, every case below dies at import time.
 *
 * Composable on purpose: `register({ t, eq, ok })` adds these cases to a shared runner
 * (the module's `test/run.mjs`, when it lands), and running this file directly executes
 * them on a private harness.
 */

import {
  touchesFlagScope,
  KNOWN_NOTES_MAX,
  KNOWN_NAME_MAX,
  SEEDED_CATEGORIES,
  defaultCategory,
  readCategories,
  categoryKeys,
  readKnown,
  toStoredKnown,
  makeKnownEntry,
  pickNotebook,
  STUDY_RUNGS,
  KIND_KEY,
  TIER_TEXT_MAX,
  tierOf,
  studySkill,
  resolveKindId,
  readStudyTiers,
  authoredTier,
  studyDescription,
  kindHasContent,
  readStudied,
  readBeliefs,
  mayStudy,
  holdResolved,
  hasUnresolvedEnricher,
  flattenHTML,
  isBlankProse,
  safeFlatten,
  capProse,
  DERIVED_PROSE_MAX,
  traitsLine,
  composeReveal,
  readGranted,
  grantsForEntry,
  readLore,
  clampLoreRow,
  loreOutcome,
  loreFactKey,
  parseFactKey,
  parseLedgerKey,
  makeLoreRow,
  rollableLore,
  loreRollable,
  loreOfferable,
  LORE_DC_MIN,
  LORE_DC_MAX,
  LORE_TEXT_MAX,
  attrIdOf,
  attrNameKey,
  nameCollision,
  renameCollision,
  resolveAttrRef,
  planEnsure,
  derivedNamespace,
  clampAttribute,
  clampSource,
  readRegistry,
  ATTR_CONTENT_FIELDS,
  clampTouched,
  clampSnapshot,
  snapshotOf,
  SNAPSHOT_MAX,
  ATTR_REVIEW_FIELDS,
  changedFields,
  reviewState,
  needsReview,
  sortForReview,
  readSelection,
  deriveAttributes,
  attributeIdsFor,
  combineAdvantage,
  attrFactKey,
  readAttrBeliefs,
  ancestorsOf,
  withAncestors,
  wouldCycle,
  identificationLadder,
  readKnowledge,
  knowsAttribute,
  failedAttribute,
  settledAttribute,
  identifiedKey,
  identMissKey,
  identifiedState,
  visibleAttributesFor,
  planStep,
  shareStatus,
  SHARE_STATUSES,
  priorOf,
  forestOf,
  subtreeOf,
  contractForest,
  TREE_DEPTH_MAX,
  childrenOf,
  helpFor,
  clampSources,
  factOrder,
  factKeyOf
} from "../known-core.mjs";

/* ── the world, as a plain object ─────────────────────────────────────────── */

const WORLD = {
  goblin: { name: "Goblin", img: "goblin.webp", actorType: "npc", creatureType: "humanoid" },
  wolf: { name: "Dire Wolf", img: "wolf.webp", actorType: "npc", creatureType: "beast" },
  ooze: { name: "Grey Ooze", img: "ooze.webp", actorType: "npc", creatureType: "ooze" },
  ballad: { name: "Ballad Quinn", img: "ballad.webp", actorType: "character", creatureType: "humanoid" }
};
const resolve = id => WORLD[id] ?? null;

export function register({ t, eq, ok }) {
  /* ── hook keys: which flattened update keys wake the live windows ─────────── */

  t("touchesFlagScope: a write under the scope, a legacy wipe, and the 14.369 operator wipe", () => {
    eq(touchesFlagScope("flags.pentaryn-ties.granted.x", "pentaryn-ties"), true);
    eq(touchesFlagScope("flags.pentaryn-ties.granted.-=x", "pentaryn-ties"), true);
    eq(touchesFlagScope("flags.-=pentaryn-ties", "pentaryn-ties"), true);    // pre-14.369 diff
    eq(touchesFlagScope("flags.pentaryn-ties", "pentaryn-ties"), true);      // ForcedDeletion, flattened
  });

  t("touchesFlagScope: never a sibling scope, another field, or junk", () => {
    eq(touchesFlagScope("flags.pentaryn-ties-extra.x", "pentaryn-ties"), false);
    eq(touchesFlagScope("flags.-=pentaryn-tiesx", "pentaryn-ties"), false);
    eq(touchesFlagScope("flags.dnd5e.x", "pentaryn-ties"), false);
    eq(touchesFlagScope("name", "pentaryn-ties"), false);
    eq(touchesFlagScope(undefined, "pentaryn-ties"), false);
  });

  /* ── defaulting: the two buckets, and the one that has no answer ───────── */

  t("category: a character-type actor is sentient whatever its creature type says", () => {
    eq(defaultCategory({ actorType: "character", creatureType: "dragon" }), "sentient");
  });

  t("category: humanoid NPCs are sentient, every other creature type is a beast", () => {
    eq(defaultCategory({ actorType: "npc", creatureType: "humanoid" }), "sentient");
    eq(defaultCategory({ actorType: "npc", creatureType: "Beast" }), "beasts"); // case-folded
    eq(defaultCategory({ actorType: "npc", creatureType: "ooze" }), "beasts");
    eq(defaultCategory({ actorType: "npc", creatureType: "  fiend  " }), "beasts"); // trimmed
  });

  t("category: an actor with nothing readable behind it files as sentient, not beasts", () => {
    eq(defaultCategory({}), "sentient");
    eq(defaultCategory(), "sentient");
    eq(defaultCategory({ actorType: "npc", creatureType: null }), "sentient");
    eq(defaultCategory({ actorType: "npc", creatureType: 7 }), "sentient");
  });

  /* ── categories: the seeded pair survives any flag at all ──────────────── */

  t("categories: junk in the flag still yields the two seeded keys", () => {
    for (const junk of [null, undefined, 7, "beasts", {}, [null, 3, "x"], [{ nokey: 1 }], [{ key: "   " }]]) {
      eq(categoryKeys(readCategories(junk)), ["sentient", "beasts"], `for ${JSON.stringify(junk)}: `);
    }
  });

  t("categories: a stored rename attaches to the seeded key instead of duplicating it", () => {
    const cats = readCategories([{ key: "beasts", label: "Things that bite" }]);
    eq(categoryKeys(cats), ["sentient", "beasts"]);
    eq(cats.find(c => c.key === "beasts").label, "Things that bite");
    eq(cats.find(c => c.key === "sentient").label, null); // unrenamed → the renderer localizes
  });

  t("categories: a custom key is appended after the seeded pair, once", () => {
    const cats = readCategories([
      { key: "ships", label: "Ships" },
      { key: "ships", label: "Ships again" },
      { key: "ships" }
    ]);
    eq(categoryKeys(cats), ["sentient", "beasts", "ships"]);
    eq(cats[2].label, "Ships");
    eq(cats[2].seeded, false);
  });

  t("categories: an over-long key or label is capped, not rejected", () => {
    const cats = readCategories([{ key: "k".repeat(200), label: "l".repeat(200) }]);
    ok(cats[2].key.length <= 40, "key capped");
    ok(cats[2].label.length <= 60, "label capped");
  });

  /* ── the hardened reader: the read() contract, restated for this schema ── */

  t("reader: anything that is not an array reads as an empty list", () => {
    for (const junk of [null, undefined, 0, "", "known", {}, { 0: { id: "goblin" } }, true]) {
      eq(readKnown(junk, { resolve }), [], `for ${JSON.stringify(junk)}: `);
    }
  });

  t("reader: entries that are not objects, or carry no usable id, are dropped", () => {
    const rows = readKnown([null, 7, "goblin", [], {}, { id: "" }, { id: "   " }, { id: 42 }, { id: "goblin" }], {
      resolve
    });
    eq(rows.length, 1);
    eq(rows[0].id, "goblin");
  });

  t("reader: a duplicate id keeps the first write and drops the rest", () => {
    const rows = readKnown(
      [
        { id: "goblin", notes: "first", when: 10 },
        { id: "goblin", notes: "second", when: 20 }
      ],
      { resolve }
    );
    eq(rows.length, 1);
    eq(rows[0].notes, "first");
  });

  t("reader: an unresolvable id survives as a missing row with its cached name", () => {
    const rows = readKnown([{ id: "deleted", name: "Someone Gone", category: "beasts" }], { resolve });
    eq(rows.length, 1);
    eq(rows[0].missing, true);
    eq(rows[0].name, "Someone Gone");
    eq(rows[0].cachedName, "Someone Gone");
    eq(rows[0].img, null);
    eq(rows[0].category, "beasts"); // a valid stored category is never second-guessed
  });

  t("reader: the live name wins over the cached one, and both are kept", () => {
    const rows = readKnown([{ id: "goblin", name: "Gobbo (stale)" }], { resolve });
    eq(rows[0].name, "Goblin");
    eq(rows[0].cachedName, "Gobbo (stale)");
    eq(rows[0].img, "goblin.webp");
    eq(rows[0].missing, false);
  });

  t("reader: an unknown or junk category falls back to the type default, never to junk", () => {
    const rows = readKnown(
      [
        { id: "goblin", category: "vegetables" },
        { id: "wolf", category: 7 },
        { id: "ballad", category: null },
        { id: "ooze", category: "  " }
      ],
      { resolve }
    );
    // sorted pairs, not an object: the reader orders rows, so an object literal here would
    // compare key order and fail for the wrong reason
    eq(rows.map(r => [r.id, r.category]).sort(), [
      ["ballad", "sentient"],
      ["goblin", "sentient"],
      ["ooze", "beasts"],
      ["wolf", "beasts"]
    ]);
  });

  t("reader: a custom category the actor actually has is honoured", () => {
    const categories = readCategories([{ key: "ships", label: "Ships" }]);
    const rows = readKnown([{ id: "goblin", category: "ships" }], { resolve, categories });
    eq(rows[0].category, "ships");
  });

  t("reader: junk in notes and when takes a default rather than poisoning the row", () => {
    const rows = readKnown([{ id: "goblin", notes: { a: 1 }, when: "yesterday" }], { resolve });
    eq(rows[0].notes, "");
    eq(rows[0].when, 0);
    eq(readKnown([{ id: "wolf", when: -5 }], { resolve })[0].when, 0); // never negative
    eq(readKnown([{ id: "wolf", when: "1755900000000" }], { resolve })[0].when, 1755900000000);
  });

  t("reader: prose and cached names are capped at their own limits", () => {
    const rows = readKnown([{ id: "goblin", name: "n".repeat(500), notes: "x".repeat(KNOWN_NOTES_MAX + 500) }], {
      resolve: () => null
    });
    eq(rows[0].notes.length, KNOWN_NOTES_MAX);
    eq(rows[0].name.length, KNOWN_NAME_MAX);
  });

  t("reader: a resolver that throws degrades to a missing row instead of taking the sheet down", () => {
    const rows = readKnown([{ id: "goblin", name: "Goblin" }], {
      resolve: () => {
        throw new Error("world not ready");
      }
    });
    eq(rows[0].missing, true);
    eq(rows[0].name, "Goblin");
  });

  /* ── order: category first, then the order they were filed ─────────────── */

  t("order: category first, then when ascending inside it", () => {
    const rows = readKnown(
      [
        { id: "wolf", category: "beasts", when: 30 },
        { id: "ballad", category: "sentient", when: 20 },
        { id: "ooze", category: "beasts", when: 10 },
        { id: "goblin", category: "sentient", when: 5 }
      ],
      { resolve }
    );
    eq(
      rows.map(r => r.id),
      ["goblin", "ballad", "ooze", "wolf"]
    );
  });

  t("order: two entries filed in the same millisecond still paint in a stable order", () => {
    const a = readKnown([{ id: "wolf", category: "beasts", when: 1 }, { id: "ooze", category: "beasts", when: 1 }], {
      resolve
    });
    const b = readKnown([{ id: "ooze", category: "beasts", when: 1 }, { id: "wolf", category: "beasts", when: 1 }], {
      resolve
    });
    eq(a.map(r => r.id), b.map(r => r.id));
    eq(a.map(r => r.id), ["wolf", "ooze"]); // "Dire Wolf" before "Grey Ooze"
  });

  t("order: a row in a category nobody has any more sinks to the bottom, never disappears", () => {
    // stored key is unknown → the reader re-files it by type; the sort must still place it
    const rows = readKnown([{ id: "goblin", category: "gone", when: 99 }, { id: "wolf", when: 1 }], { resolve });
    eq(rows.length, 2);
  });

  /* ── the write side ────────────────────────────────────────────────────── */

  t("stored shape: ONLY the named fields survive a round trip — nothing else is carried", () => {
    /*
     * This assertion is the tripwire, not a description. `toStoredKnown` maps a fixed shape,
     * so any field a future phase adds to an entry is silently destroyed by the next notes
     * autosave unless it is added HERE too — which is why the reveal lives in the sibling
     * grant map instead, and why `imposter` had to land in the reader and the writer in the
     * same commit. If this fixture fails after you widen the entry, that is the gate working.
     */
    const rows = readKnown(
      [{ id: "goblin", name: "Gobbo", category: "beasts", notes: "hits hard", when: 12, smuggled: "payload" }],
      { resolve }
    );
    eq(toStoredKnown(rows), [
      { id: "goblin", name: "Gobbo", category: "beasts", notes: "hits hard", imposter: null, hidden: false, when: 12 }
    ]);
  });

  t("stored shape: the LIVE name is never written back over the cached one", () => {
    // the row rendered "Goblin" off the world; the flag must keep what was filed
    const rows = readKnown([{ id: "goblin", name: "Hooded Figure", when: 1 }], { resolve });
    eq(rows[0].name, "Goblin");
    eq(toStoredKnown(rows)[0].name, "Hooded Figure");
  });

  t("stored shape: junk rows are dropped rather than written", () => {
    eq(toStoredKnown([null, 7, { id: "" }, { id: "   " }, { notes: "orphan" }]), []);
    eq(toStoredKnown(null), []);
    eq(toStoredKnown("known"), []);
  });

  t("stored shape: an entry with no category is stored in one, never as empty", () => {
    eq(toStoredKnown([{ id: "x", category: "" }])[0].category, "sentient");
  });

  t("new entry: files by type, starts blank, and stamps the injected clock", () => {
    const e = makeKnownEntry({ id: "wolf", name: "Dire Wolf", actorType: "npc", creatureType: "beast", now: 1234 });
    eq(e, { id: "wolf", cachedName: "Dire Wolf", category: "beasts", notes: "", when: 1234 });
  });

  t("new entry: an explicit category overrides the type default", () => {
    eq(makeKnownEntry({ id: "wolf", creatureType: "beast", category: "sentient", now: 1 }).category, "sentient");
  });

  t("new entry: a junk clock lands at 0 rather than NaN — NaN would break every sort", () => {
    eq(makeKnownEntry({ id: "wolf", now: undefined }).when, 0);
    eq(makeKnownEntry({ id: "wolf", now: "soon" }).when, 0);
  });

  t("the seeded pair is exactly Sentient and Beasts, in that order", () => {
    eq(SEEDED_CATEGORIES.map(c => c.key), ["sentient", "beasts"]);
  });

  /* ── phase 2: whose notebook the canvas key writes in ───────────────────── */

  const pc = (id, over = {}) => ({ id, isCharacter: true, isOwner: true, ...over });

  t("notebook: a selected owned character beats everything else", () => {
    eq(pickNotebook({ controlled: [pc("ballad")], assigned: pc("pip"), owned: [pc("pip")] }), "ballad");
  });

  t("notebook: a selection that is not yours, or not a character, does not win", () => {
    // the GM has a goblin selected and one PC on the map: the goblin is not a notebook
    eq(pickNotebook({ controlled: [pc("goblin", { isCharacter: false })], owned: [pc("ballad")] }), "ballad");
    eq(pickNotebook({ controlled: [pc("wat", { isOwner: false })], assigned: pc("ballad") }), "ballad");
  });

  t("notebook: the assigned character answers for a player who selected nothing", () => {
    eq(pickNotebook({ assigned: pc("ballad"), owned: [pc("pip"), pc("wat")] }), "ballad");
    eq(pickNotebook({ assigned: pc("ballad", { isOwner: false }) }), null);
  });

  t("notebook: one owned character on the scene is unambiguous — even standing there twice", () => {
    // ⚠ the trap overlay.mjs's soleOwnedToken falls into: it counts TOKENS, so a summoned
    // double of your own PC reads as two candidates. Two tokens, one person, one notebook.
    eq(pickNotebook({ owned: [pc("ballad"), pc("ballad")] }), "ballad");
    eq(pickNotebook({ owned: [pc("ballad"), pc("pip")] }), null);
  });

  t("notebook: a GM owning every token on the scene gets no guess", () => {
    eq(pickNotebook({ owned: [pc("ballad"), pc("pip"), pc("goblin", { isCharacter: false })] }), null);
  });

  t("notebook: nothing to go on returns null rather than throwing", () => {
    eq(pickNotebook(), null);
    eq(pickNotebook({ controlled: null, assigned: 7, owned: "tokens" }), null);
    eq(pickNotebook({ owned: [pc("")] }), null);
  });

  /* ══ phase 3: the study ladder ═════════════════════════════════════════ */

  /* ── the grader, where an off-by-one is invisible forever ──────────────── */

  t("grader: the four rungs land exactly on their thresholds", () => {
    eq(tierOf(25), 25);
    eq(tierOf(24), 20);
    eq(tierOf(20), 20);
    eq(tierOf(19), 15);
    eq(tierOf(15), 15);
    eq(tierOf(14), 0);
    eq(tierOf(0), 0);
    eq(tierOf(-3), 0); // situational -100 in the indistinguishability run gets here
    eq(tierOf(97), 25);
  });

  t("grader: a cancelled dialog is NOT a sub-15 — no roll happened", () => {
    // the whole one-roll lock rests on this: null must never grade
    eq(tierOf(null), null);
    eq(tierOf(undefined), null);
    eq(tierOf(""), null);
    eq(tierOf(NaN), null);
    eq(tierOf("nonsense"), null);
    eq(tierOf({}), null);
  });

  t("grader: a numeric string still grades — roll.total is a number, but flags are not", () => {
    eq(tierOf("22"), 20);
    eq(tierOf("25"), 25);
  });

  /* ── the skill, straight off the PHB Areas of Knowledge table ──────────── */

  t("skill: every dnd5e creature type maps the way the book's table says", () => {
    for (const type of ["aberration", "construct", "elemental", "fey", "monstrosity"]) eq(studySkill(type), "arc", `${type}: `);
    for (const type of ["giant", "humanoid"]) eq(studySkill(type), "his", `${type}: `);
    for (const type of ["beast", "dragon", "ooze", "plant"]) eq(studySkill(type), "nat", `${type}: `);
    for (const type of ["celestial", "fiend", "undead"]) eq(studySkill(type), "rel", `${type}: `);
  });

  t("skill: no creature type at all takes History — 23 of this world's actors are that", () => {
    eq(studySkill(""), "his");
    eq(studySkill(null), "his");
    eq(studySkill(7), "his");
    eq(studySkill("  Humanoid "), "his"); // trimmed and case-folded
    eq(studySkill("HOMEBREW-THING"), "his");
  });

  /* ── the kind pointer ──────────────────────────────────────────────────── */

  t("kind: a pointer resolves to the kind, and a dangling one falls back to self", () => {
    const exists = id => id === "goblin";
    eq(resolveKindId("grix", "goblin", exists), "goblin");
    eq(resolveKindId("grix", "deleted-kind", exists), "grix"); // NOT null, and NOT the ghost
    eq(resolveKindId("grix", "", exists), "grix");
    eq(resolveKindId("grix", null, exists), "grix");
    eq(resolveKindId("goblin", "goblin", exists), "goblin"); // pointing at yourself is self
  });

  t("kind: a throwing lookup and a junk id degrade rather than explode", () => {
    eq(resolveKindId("grix", "goblin", () => { throw new Error("no world yet"); }), "grix");
    eq(resolveKindId("", "goblin", () => true), null);
    eq(resolveKindId(null, null), null);
    eq(resolveKindId("grix", "goblin"), "grix"); // no lookup injected: nothing exists
  });

  /* ── authored tiers ────────────────────────────────────────────────────── */

  t("tiers: only the four real rungs survive, sorted high to low, first write winning", () => {
    const tiers = readStudyTiers([
      { min: 15, text: "A confident lie." },
      { min: 18, text: "Not a rung" },
      { min: 25, text: "The truth." },
      { min: 15, text: "second attempt at 15" },
      { min: 0, text: "You have no idea." },
      { min: "20", text: "numeric string" },
      null, 7, { min: 20 }, { min: 20, text: "   " }
    ]);
    eq(tiers.map(x => x.min), [25, 20, 15, 0]);
    eq(tiers.find(x => x.min === 15).text, "A confident lie.");
    eq(tiers.find(x => x.min === 20).text, "numeric string");
  });

  t("tiers: junk in the flag reads as no authoring at all", () => {
    for (const junk of [null, undefined, 7, "text", {}, [{}], [{ min: 30, text: "x" }]]) {
      eq(readStudyTiers(junk), [], `for ${JSON.stringify(junk)}: `);
    }
  });

  t("tiers: an over-long authored message is capped, not dropped", () => {
    const tiers = readStudyTiers([{ min: 25, text: "x".repeat(TIER_TEXT_MAX + 500) }]);
    eq(tiers[0].text.length, TIER_TEXT_MAX);
  });

  t("tiers: an authored rung CARRIES upward — and a lie is seen through by authoring the truth", () => {
    /*
     * ⚠ This REVERSES the original exact-match rule, whose fixture read "a 25 never falls through
     * to the 15's lie". That rule relied on the fall-through landing on *derived truth* — but the
     * derived text is the **sourcebook description**, which the GM did not write, may not
     * contradict the lie, and may not exist at all for a homebrew creature. Seeing through a lie
     * was therefore accidental rather than designed, and it cost the common case: flavour authored
     * at 15 silently vanished on a good roll, so the better a player rolled the less of the GM's
     * world they saw.
     *
     * A lie is still fully expressible, and now deliberately: author the falsehood low and the
     * truth high. One more field, entirely under the GM's control, and it reveals what they chose
     * rather than whatever the book happened to say.
     */
    const tiers = readStudyTiers([{ min: 15, text: "It is a harmless bird." }]);
    eq(authoredTier(tiers, 15), "It is a harmless bird.");
    eq(authoredTier(tiers, 20), "It is a harmless bird.", "the authored voice survives a better roll");
    eq(authoredTier(tiers, 25), "It is a harmless bird.");
    eq(authoredTier(tiers, 0), "", "nothing authored at the miss rung");

    // the lie, done on purpose: low says bird, high says otherwise
    const seenThrough = readStudyTiers([
      { min: 15, text: "It is a harmless bird." },
      { min: 25, text: "It is not a bird at all." }
    ]);
    eq(authoredTier(seenThrough, 15), "It is a harmless bird.");
    eq(authoredTier(seenThrough, 20), "It is a harmless bird.");
    eq(authoredTier(seenThrough, 25), "It is not a bird at all.");
    eq(authoredTier(null, 15), "");
  });

  t("content: no biography, no tiers and no attacks means no icon", () => {
    eq(kindHasContent({}), false);
    eq(kindHasContent({ biography: "   " }), false);
    eq(kindHasContent({ biography: "<p>A goblin.</p>" }), true);
    eq(kindHasContent({ tiers: [{ min: 25, text: "t" }] }), true);
    eq(kindHasContent({ attacks: ["Scimitar"] }), true);
    eq(kindHasContent(), false);
  });

  /* ── the two ledgers ───────────────────────────────────────────────────── */

  t("studied: reads WHEN and nothing else — a planted total never survives the reader", () => {
    const s = readStudied({
      kind: { goblin: { when: 1755900000000, total: 27, tier: 25 } },
      lore: { "grix:coast": { when: 5 } },
      junk: { x: { when: 1 } }
    });
    eq(s.kind.goblin, { when: 1755900000000 });
    eq(s.lore["grix:coast"], { when: 5 });
    eq(s.junk, undefined);
  });

  t("studied: any junk still reads as the empty two-map shape", () => {
    for (const junk of [null, undefined, 7, "kind", [], { kind: 7, lore: [] }]) {
      eq(readStudied(junk), { kind: {}, lore: {} }, `for ${JSON.stringify(junk)}: `);
    }
    eq(readStudied({ kind: { goblin: null } }), { kind: { goblin: { when: 0 } }, lore: {} });
  });

  t("beliefs: a record keeps the payload, the tier and the total — on the STUDIED actor", () => {
    const b = readBeliefs({
      ballad: { kind: { text: "It is a goblin.", tier: 25, total: 27, when: 10, delivered: 11, sources: null } },
      pip: { kind: { text: "A bird.", tier: 15, total: 16, when: 12 } }
    });
    eq(b.ballad.kind, { text: "It is a goblin.", tier: 25, total: 27, when: 10, delivered: 11, sources: null });
    eq(b.pip.kind.delivered, null); // pending: absent is not zero
  });

  t("beliefs: a bogus tier reads as null rather than becoming a rung it never was", () => {
    const b = readBeliefs({ ballad: { kind: { text: "x", tier: 18, total: "nope" } } });
    eq(b.ballad.kind.tier, null);
    eq(b.ballad.kind.total, null);
    eq(b.ballad.kind.when, 0);
  });

  t("beliefs: junk reads as no beliefs, and an empty character is dropped", () => {
    for (const junk of [null, undefined, 7, "beliefs", []]) eq(readBeliefs(junk), {}, `for ${JSON.stringify(junk)}: `);
    eq(readBeliefs({ ballad: {} }), {});
    eq(readBeliefs({ ballad: { kind: 7 } }), {});
    eq(readBeliefs({ "": { kind: { text: "x" } } }), {});
  });

  t("beliefs: delivered:0 is pending, not delivered", () => {
    const b = readBeliefs({ ballad: { kind: { text: "x", delivered: 0 } } });
    eq(b.ballad.kind.delivered, null);
  });

  /* ── the lock, and WHICH ledger is the lock ────────────────────────────── */

  t("lock: the belief ledger spends the roll, and unsetting `studied` cannot re-arm it", () => {
    const beliefs = { ballad: { [KIND_KEY]: { text: "x", tier: 25, total: 27, when: 1 } } };
    // the player's own flag wiped in their own devtools — the exact §5 correction
    eq(mayStudy({ beliefs, studied: { kind: {}, lore: {} }, characterId: "ballad", key: KIND_KEY }), false);
    eq(mayStudy({ beliefs, characterId: "ballad", key: KIND_KEY }), false);
    // another character has not spent it
    eq(mayStudy({ beliefs, characterId: "pip", key: KIND_KEY }), true);
    // another fact on the same character has not been spent either
    eq(mayStudy({ beliefs, characterId: "ballad", key: "grix:coast" }), true);
  });

  t("lock: a leftover `studied` with no belief behind it does NOT block — a reset must be whole", () => {
    eq(mayStudy({ beliefs: {}, studied: { kind: { goblin: { when: 1 } }, lore: {} }, characterId: "ballad", key: KIND_KEY }), true);
  });

  t("lock: no character and no key is never a licence to roll", () => {
    eq(mayStudy({ beliefs: {}, characterId: "", key: KIND_KEY }), false);
    eq(mayStudy({ beliefs: {}, characterId: "ballad", key: "" }), false);
    eq(mayStudy(), false);
  });

  /* ── the approval gate's tri-state ─────────────────────────────────────── */

  t("hold: the thing's own boolean wins; anything else inherits the world default", () => {
    eq(holdResolved(true, false), true);
    eq(holdResolved(false, true), false);
    eq(holdResolved(undefined, true), true);
    eq(holdResolved(undefined, false), false);
    eq(holdResolved(null, true), true);
    eq(holdResolved("true", false), false); // a string is not an override
    eq(holdResolved(), false);
  });

  /* ── the enricher guard: the reason tier 25 is not a play report ───────── */

  t("enricher: an UNRESOLVED enricher is refused outright, never degraded to its words", () => {
    // probed live 2026-08-23: enrichHTML WITHOUT relativeTo leaves this exactly as written,
    // and a search-snippet flattener turns it into the plausible gibberish "attack extended"
    const raw = "<p>[[/attack extended]]. [[/damage average extended]].</p>";
    eq(hasUnresolvedEnricher(raw), true);
    eq(safeFlatten(raw), null);
    eq(hasUnresolvedEnricher("<p>@UUID[Compendium.x.Item.y]{Scimitar}</p>"), true);
    eq(hasUnresolvedEnricher("<p>&Reference[Disengage]</p>"), true);
    eq(hasUnresolvedEnricher("<p>&amp;Reference[Hide]</p>"), true);
  });

  t("enricher: resolved MM output flattens to the prose the probe actually produced", () => {
    // the real enriched HTML from Goblin Warrior's Scimitar, trimmed to its shape
    const enriched =
      '<p><enriched-content enricher="dnd5e-enricher"><span class="attack-extended">' +
      '<em>Melee Attack Roll</em>: <span class="roll-link-group"><a class="roll-link">' +
      '<i class="fa-solid fa-dice-d20" inert=""></i>+4</a></span>, reach 5 ft</span></enriched-content>. ' +
      '<enriched-content enricher="dnd5e-enricher"><span class="damage-extended"><em>Hit:</em> ' +
      '5 ( <span>1d6 + 2</span> ) Slashing damage</span></enriched-content>.</p>';
    eq(hasUnresolvedEnricher(enriched), false);
    eq(
      safeFlatten(enriched),
      "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage."
    );
  });

  t("enricher: the punctuation pass is load-bearing — inline spans leave gaps before commas", () => {
    eq(flattenHTML("<p>a</p><p>b</p>"), "a b"); // block tags must not word-join
    eq(flattenHTML("<span>x</span> , <span>y</span> ."), "x, y.");
    eq(flattenHTML("5 ( 1d6 + 2 )"), "5 (1d6 + 2)");
    eq(flattenHTML("a<br>b"), "a b");
    eq(flattenHTML("&amp;nbsp;"), "&nbsp;"); // decoded once, not recursively
    eq(flattenHTML("The&nbsp;goblin&mdash;loudly"), "The goblin—loudly");
    eq(flattenHTML("<script>alert(1)</script>hello"), "hello");
    eq(flattenHTML(null), "");
    eq(flattenHTML(7), "");
  });

  /* ── composing what the player is handed ───────────────────────────────── */

  t("traits: one line, only for what is actually there", () => {
    const labels = { immune: "Immune", resist: "Resists", vulnerable: "Vulnerable", conditionImmune: "Condition-immune" };
    eq(
      traitsLine({ immune: ["poison"], resist: ["cold"], vulnerable: ["fire"], conditionImmune: ["charmed"] }, labels),
      "Immune: poison. Resists: cold. Vulnerable: fire. Condition-immune: charmed."
    );
    eq(traitsLine({ resist: ["cold", "fire"] }, labels), "Resists: cold, fire.");
    eq(traitsLine({}, labels), "");
    eq(traitsLine({ immune: [null, "  ", "poison"] }, labels), "Immune: poison.");
    eq(traitsLine(), "");
  });

  t("reveal: each rung buys exactly what the ladder says and not one line more", () => {
    const parts = {
      header: "— Studied (Nature) —",
      description: "A small, black-hearted humanoid.",
      traits: "Immune: poison.",
      attacks: ["Scimitar: +4, 1d6+2", "Shortbow: +4, 1d6+2"]
    };
    eq(composeReveal({ ...parts, tier: 0 }), "— Studied (Nature) —\nA small, black-hearted humanoid.");
    eq(composeReveal({ ...parts, tier: 15 }), "— Studied (Nature) —\nA small, black-hearted humanoid.");
    eq(composeReveal({ ...parts, tier: 20 }), "— Studied (Nature) —\nA small, black-hearted humanoid.\nImmune: poison.");
    eq(
      composeReveal({ ...parts, tier: 25 }),
      "— Studied (Nature) —\nA small, black-hearted humanoid.\nImmune: poison.\nScimitar: +4, 1d6+2 · Shortbow: +4, 1d6+2"
    );
  });

  t("reveal: the header carries the skill and NOTHING else — no total, no DC", () => {
    const out = composeReveal({ tier: 25, header: "— Studied (Nature) —", description: "d", traits: "t", attacks: ["a"] });
    ok(!/\d\d/.test(out.split("\n")[0]), "a two-digit number in the provenance header IS the blind total");
    ok(!/DC/i.test(out), "no DC anywhere in a reveal");
  });

  t("reveal: missing pieces collapse rather than leaving blank lines", () => {
    // a header over nothing is no reveal at all — empty means no trace, not a hollow card
    eq(composeReveal({ tier: 25, header: "— Studied (Nature) —", description: "", traits: "", attacks: [] }), "");
    eq(composeReveal({ tier: 25, description: "d", attacks: [null, "  "] }), "d");
    eq(composeReveal(), "");
  });

  t("granted: the reader survives a junk table and drops what it cannot use", () => {
    eq(readGranted(null), {});
    eq(readGranted("nope"), {});
    eq(readGranted([1, 2]), {}); // an array is not a map
    eq(readGranted({ "": { text: "x" } }), {}); // no key
    eq(readGranted({ "kind:a": null }), {});
    eq(readGranted({ "kind:a": "just a string" }), {});
    eq(readGranted({ "kind:a": { text: "   " } }), {}); // an empty grant is not a grant
    eq(readGranted({ "kind:a": { text: "it is a goblin", when: -5 } }), {
      "kind:a": { text: "it is a goblin", when: 0, icon: null, source: "" }
    });
    eq(readGranted({ " kind:a ": { text: "t", when: 7, icon: " i.webp ", source: "Goblin" } }), {
      "kind:a": { text: "t", when: 7, icon: "i.webp", source: "Goblin" }
    });
    eq(readGranted({ "kind:a": { text: "x".repeat(KNOWN_NOTES_MAX + 500) } })["kind:a"].text.length, KNOWN_NOTES_MAX);
  });

  t("granted: the join returns only the grants that belong to the entry asked for", () => {
    const map = {
      "kind:goblin": { text: "small and mean", when: 2 },
      "kind:ogre": { text: "large and mean", when: 1 },
      "lore:goblin:tribe": { text: "they raid at dusk", when: 3 },
      "mask:goblin:layer1": { text: "someone wore this face", when: 4 },
      "attr:north-tribe:secret": { text: "they answer to the Cairn", when: 5 }
    };
    eq(grantsForEntry(map, "goblin").map(g => g.key), ["kind:goblin", "lore:goblin:tribe", "mask:goblin:layer1"]);
    eq(grantsForEntry(map, "ogre").map(g => g.key), ["kind:ogre"]);
    eq(grantsForEntry(map, "nobody"), []);
    eq(grantsForEntry(map, ""), []);
    eq(grantsForEntry(null, "goblin"), []);
  });

  t("granted: an attribute grant reaches every entry carrying the attribute, and no others", () => {
    // the reason grants are a sibling map and not a field on the entry: learn the guild's
    // secret from one rogue and it must render under every rogue already filed
    const map = { "attr:north-tribe:secret": { text: "they answer to the Cairn", when: 1 } };
    eq(grantsForEntry(map, "goblin-a", { attributeIds: ["north-tribe"] }).map(g => g.key), ["attr:north-tribe:secret"]);
    eq(grantsForEntry(map, "goblin-b", { attributeIds: ["north-tribe"] }).map(g => g.key), ["attr:north-tribe:secret"]);
    eq(grantsForEntry(map, "ogre", { attributeIds: ["south-tribe"] }), []);
    eq(grantsForEntry(map, "ogre"), []); // no attributes at all
    eq(grantsForEntry({ "attr:north-tribe:": { text: "t" } }, "x", { attributeIds: ["north-tribe"] }), []);
  });

  t("granted: sorted by when, then key — a stable order across paints", () => {
    const map = {
      "kind:a": { text: "third", when: 9 },
      "lore:a:z": { text: "second", when: 1 },
      "lore:a:b": { text: "first", when: 1 }
    };
    // equal `when` falls back to the key, so two grants filed in the same update still
    // paint in the same order every time rather than in object-key order
    eq(grantsForEntry(map, "a").map(g => g.text), ["first", "second", "third"]);
  });

  t("granted: THE ERASURE DISPROOF — a notes edit cannot touch a populated grant map", () => {
    /*
     * This is the fixture the whole schema exists for. The notes autosave round-trips the
     * WHOLE list through `toStoredKnown` on a 700ms timer. When the reveal lived in
     * `entry.notes`, a player selecting all and typing over it destroyed text they had
     * rolled for — and `toStoredKnown` silently dropped any field added to carry it.
     *
     * The grant map is a sibling flag, so the notes path cannot name it, let alone rewrite
     * it. Assert that directly: run the exact round-trip the autosave runs and prove the
     * map is byte-identical afterwards.
     */
    const granted = {
      "kind:goblin": { text: "— Studied —\nSmall, wiry, and it fights dirty.", when: 100, icon: "g.webp", source: "Goblin" }
    };
    const before = JSON.stringify(granted);

    const list = [{ id: "goblin", cachedName: "Goblin", category: "sentient", notes: "my own prose", when: 5 }];
    let stored = toStoredKnown(list);
    // the player selects all and types over it, twice
    stored = toStoredKnown(stored.map(e => ({ ...e, notes: "" })));
    stored = toStoredKnown(stored.map(e => ({ ...e, notes: "different prose entirely" })));

    eq(stored[0].notes, "different prose entirely");
    eq(JSON.stringify(granted), before, "the grant map is not reachable from the notes path");
    eq(grantsForEntry(granted, "goblin").length, 1);
  });

  t("granted: a re-roll REPLACES under the same key rather than filing a second copy", () => {
    const granted = readGranted({ "kind:goblin": { text: "first reveal", when: 1 } });
    granted["kind:goblin"] = { text: "better reveal", when: 2 };
    const grants = grantsForEntry(granted, "goblin");
    eq(grants.length, 1);
    eq(grants[0].text, "better reveal");
  });

  t("imposter: the mark survives the round-trip in BOTH directions", () => {
    // it must live in the reader AND the writer or the next keystroke erases it — the same
    // silent field-drop that forced the grant map out of the entry in the first place
    eq(toStoredKnown([{ id: "a", cachedName: "A", imposter: 900 }])[0].imposter, 900);
    eq(toStoredKnown(toStoredKnown([{ id: "a", cachedName: "A", imposter: 900 }]))[0].imposter, 900);
    eq(toStoredKnown([{ id: "a", cachedName: "A" }])[0].imposter, null);
    eq(toStoredKnown([{ id: "a", cachedName: "A", imposter: -3 }])[0].imposter, null);
    eq(toStoredKnown([{ id: "a", cachedName: "A", imposter: "nope" }])[0].imposter, null);
    const read = readKnown([{ id: "a", name: "A", imposter: 900 }], { resolve: () => null });
    eq(read[0].imposter, 900);
    eq(readKnown([{ id: "a", name: "A" }], { resolve: () => null })[0].imposter, null);
  });

  t("lore: the reader drops what cannot be rolled and keeps the order authored", () => {
    eq(readLore(null), []);
    eq(readLore("nope"), []);
    eq(readLore([null, 3, "x"]), []);
    eq(readLore([{ label: "no id" }]), []);          // no id — nothing to key a lock on
    // a labelless row IS kept: it is a draft a GM just added, and dropping it here would
    // delete the row on its way to disk. Rollability is a separate question — see below.
    eq(readLore([{ id: "a" }]).length, 1);
    eq(readLore([{ id: "a" }])[0].label, "");
    const rows = readLore([
      { id: "b", label: "Second", dc: 20 },
      { id: "a", label: "First", dc: 10 },
      { id: "b", label: "Duplicate id", dc: 30 }
    ]);
    eq(rows.map(r => r.id), ["b", "a"]);              // authored order, not sorted
    eq(rows.map(r => r.dc), [20, 10]);
    eq(rows.length, 2, "the duplicate id keeps the first, which is the authored one");
  });

  t("lore: a row is clamped into rollable shape rather than repaired ad hoc", () => {
    const r = clampLoreRow({ id: "  x  ", label: "  Why they left  ", dc: 999, skill: "  nat  " });
    eq(r.id, "x");
    eq(r.label, "Why they left");
    eq(r.dc, LORE_DC_MAX);
    eq(r.skill, "nat");
    eq(clampLoreRow({ id: "x", label: "L", dc: -5 }).dc, LORE_DC_MIN);
    eq(clampLoreRow({ id: "x", label: "L" }).dc, 15);   // the ladder's "recognised it" number
    eq(clampLoreRow({ id: "x", label: "L" }).skill, "his");
    eq(clampLoreRow({ id: "x", label: "L", text: "y".repeat(LORE_TEXT_MAX + 50) }).text.length, LORE_TEXT_MAX);
    // hold is tri-state: only a real boolean overrides the world default
    eq(clampLoreRow({ id: "x", label: "L" }).hold, null);
    eq(clampLoreRow({ id: "x", label: "L", hold: true }).hold, true);
    eq(clampLoreRow({ id: "x", label: "L", hold: false }).hold, false);
    eq(clampLoreRow({ id: "x", label: "L", hold: "yes" }).hold, null);
  });

  t("lore: a row NEVER names an actor — decision 21 rule 3, held at the schema", () => {
    // if this fails, the phase 6 attribute registry cannot mount the same editor and the
    // widening has quietly become a migration
    const r = clampLoreRow({ id: "x", label: "L", actorId: "smuggled", targetId: "also smuggled" });
    eq(Object.keys(r).sort(), ["dc", "hold", "id", "label", "miss", "skill", "text"]);
  });

  t("lore: fact keys are namespaced, and round-trip through the parser", () => {
    eq(loreFactKey("actor1", "row1"), "lore:actor1:row1");
    eq(parseFactKey("lore:actor1:row1"), { ns: "lore", subject: "actor1", fact: "row1" });
    eq(parseFactKey("kind:goblin"), { ns: "kind", subject: "goblin", fact: "kind" });
    eq(parseFactKey("attr:north-tribe:secret"), { ns: "attr", subject: "north-tribe", fact: "secret" });
    eq(parseFactKey("mask:actor1:layer1"), { ns: "mask", subject: "actor1", fact: "layer1" });
    // unrecognised keys refuse rather than half-parse — a caller that cannot identify a fact
    // must not guess which ledger it belongs to
    eq(parseFactKey("actor1:row1"), null);   // decision 8's first draft, now unparseable
    eq(parseFactKey("lore:actor1"), null);
    eq(parseFactKey(""), null);
    eq(parseFactKey(null), null);
    eq(parseFactKey("whatever:a:b"), null);
  });

  t("lore: flat pass/fail at the row's DC — and a cancel is not a failure", () => {
    const row = { id: "x", label: "L", dc: 15, text: "the truth", miss: "a rumour" };
    eq(loreOutcome(row, 15), { pass: true, text: "the truth", silent: false });
    eq(loreOutcome(row, 40), { pass: true, text: "the truth", silent: false });
    // a failure hands over the WRITTEN failure line (Joe, 2026-10-08) — never the pass text
    eq(loreOutcome(row, 14), { pass: false, text: "a rumour", silent: false });
    // null total = no roll evaluated. Grading this as a failure would spend the one attempt
    // on a mis-click — the same trap `tierOf` refuses.
    eq(loreOutcome(row, null), null);
    eq(loreOutcome(row, undefined), null);
    eq(loreOutcome(row, "nope"), null);
    eq(loreOutcome(null, 20), null);
  });

  t("lore: an unauthored side is SILENT, and silence is flagged rather than hidden", () => {
    // a failure with no miss written is silent, and so is a pass with nothing authored. The
    // conduit still writes the lock and posts the stub; `silent` tells it to skip only the grant,
    // so there is no card and no retry. A WRITTEN miss is delivered on a failure (2026-10-08).
    const noMiss = { id: "x", label: "L", dc: 15, text: "the truth" };
    eq(loreOutcome(noMiss, 10), { pass: false, text: "", silent: true });
    eq(loreOutcome(noMiss, 20).silent, false);
    const noText = { id: "x", label: "L", dc: 15, miss: "a rumour" };
    eq(loreOutcome(noText, 20), { pass: true, text: "", silent: true });
    eq(loreOutcome(noText, 10), { pass: false, text: "a rumour", silent: false }, "its failure side is written: ");
    eq(loreOutcome({ id: "x", label: "L", dc: 15, text: "   " }, 20).silent, true);
  });

  t("lore: a fresh row is STORED but not yet offered — storage and affordance are separate", () => {
    const row = makeLoreRow("newid");
    eq(row.id, "newid");
    eq(row.dc, 15);
    eq(row.hold, null);
    // it survives the round trip, so the GM can name it later...
    eq(readLore([row]).length, 1);
    // ...but it is never put in front of a player
    eq(rollableLore([row]), []);
  });

  t("lore: loreOfferable — only a row whose PASS says something is put in front of a player", () => {
    const base = { id: "x", dc: 15 };
    eq(loreOfferable({ ...base, label: "L", text: "the truth" }), true, "text only: ");
    eq(loreOfferable({ ...base, label: "L", text: "t", miss: "m" }), true);
    // a failure hands over nothing, so a miss-only row buys nothing whatever the dice do
    eq(loreOfferable({ ...base, label: "L", miss: "a rumour" }), false, "miss only: ");
    eq(loreOfferable({ ...base, label: "L" }), false, "neither: ");
    eq(loreOfferable({ ...base, label: "L", text: "   " }), false);
    eq(loreOfferable({ ...base, text: "the truth" }), false, "no label: ");
    eq(loreOfferable(null), false);
    // ...and it stays ROLLABLE (resolvable), so Share/Forget and the Look window still find it
    eq(loreRollable({ ...base, label: "L", miss: "a rumour" }), true);
  });

  t("lore: the outcome boundary — dc-1 hands over the failure line, dc passes", () => {
    const row = { id: "x", label: "L", dc: 12, text: "the truth", miss: "a fair guess" };
    eq(loreOutcome(row, 11), { pass: false, text: "a fair guess", silent: false });
    eq(loreOutcome({ ...row, miss: "" }, 11), { pass: false, text: "", silent: true }, "empty miss → nothing: ");
    eq(loreOutcome(row, 12), { pass: true, text: "the truth", silent: false });
    eq(loreOutcome(row, 11.6), { pass: true, text: "the truth", silent: false }, "rounded like the DC test: ");
  });

  t("lore: rollable needs a label AND something to say on at least one side", () => {
    const base = { id: "x", dc: 15 };
    eq(loreRollable({ ...base, label: "L", text: "the truth" }), true);
    eq(loreRollable({ ...base, label: "L", miss: "a rumour" }), true, "miss-only is a real row");
    eq(loreRollable({ ...base, label: "L", text: "t", miss: "m" }), true);
    // no label: the affordance has no invitation to show
    eq(loreRollable({ ...base, text: "the truth" }), false);
    // nothing authored on EITHER side: offering it spends the one attempt on guaranteed
    // silence whatever the dice do
    eq(loreRollable({ ...base, label: "L" }), false);
    eq(loreRollable({ ...base, label: "L", text: "  ", miss: "\n" }), false);
    eq(loreRollable(null), false);
    eq(rollableLore([{ ...base, label: "L", text: "t" }, { id: "y", label: "", text: "t" }]).map(r => r.id), ["x"]);
  });

  t("attrIdOf: Joe's collision pair, the diacritic, and the degenerate strings", () => {
    // decision 18's own examples — all three must land on one id, so the second creation is
    // refused and the existing entry offered instead
    eq(attrIdOf("Yellow Stone"), "yellowstone");
    eq(attrIdOf("yellowstone"), "yellowstone");
    eq(attrIdOf("Yéllowstone"), "yellowstone");
    eq(attrIdOf("YELLOW-STONE"), "yellowstone");
    eq(attrIdOf("  Yellow   Stone  "), "yellowstone");
    // yellowstone2 is how you mean a different one — Joe's convention, so digits survive
    eq(attrIdOf("Yellowstone 2"), "yellowstone2");
    eq(attrIdOf(""), "");
    eq(attrIdOf("!!! ---- ???"), "");
    eq(attrIdOf(null), "");
    eq(attrIdOf(42), "");
    eq(attrIdOf("x".repeat(200)).length, 64);
  });

  t("names are unique: case-only and accent/whitespace differences collide", () => {
    // Joe's rule — an attribute is one truth shared by every carrier, so one name, one entry
    const reg = [{ id: "goblinguild", title: "Goblin Guild" }];
    eq(nameCollision("goblin guild", reg)?.id, "goblinguild", "case only: ");
    eq(nameCollision("GOBLIN GUILD", reg)?.id, "goblinguild", "case only: ");
    eq(nameCollision("  Göblin   Guild ", reg)?.id, "goblinguild", "accent + whitespace: ");
    eq(nameCollision("Goblin-Guild", reg)?.id, "goblinguild", "punctuation: ");
    eq(nameCollision("Goblin Guild 2", reg), null, "a digit is how you mean a different one: ");
    eq(nameCollision("!!!", reg), null, "a name that folds to nothing never collides: ");
    eq(attrNameKey("Göblin Guild"), "goblinguild");
    // no 64-character cut: two long names differing past it are different names
    eq(attrNameKey("x".repeat(70) + "a") === attrNameKey("x".repeat(70) + "b"), false);
  });

  t("resolveAttrRef: an id, a name, or an entry — one rule everywhere", () => {
    const reg = [
      { id: "ashfallcompany", title: "Ashfall Company" },
      { id: "greyharbour", title: "Greyharbour" }
    ];
    eq(resolveAttrRef("ashfallcompany", reg), { id: "ashfallcompany" }, "exact id: ");
    eq(resolveAttrRef("Ashfall Company", reg), { id: "ashfallcompany" }, "the name the table sees: ");
    eq(resolveAttrRef("  áshfall-COMPANY! ", reg), { id: "ashfallcompany" }, "accent/case/punctuation: ");
    eq(resolveAttrRef({ id: "greyharbour", title: "whatever" }, reg), { id: "greyharbour" }, "an entry object: ");
  });

  t("resolveAttrRef: a miss is refused, never invented", () => {
    const reg = [{ id: "ashfallcompany", title: "Ashfall Company" }];
    // the old bug: link(actor, "Ashfal Company") wrote the literal string as a link
    eq(resolveAttrRef("Ashfal Company", reg), { id: null, reason: "notFound" }, "typo: ");
    eq(resolveAttrRef("", reg), { id: null, reason: "empty" });
    eq(resolveAttrRef("   ", reg), { id: null, reason: "empty" });
    eq(resolveAttrRef(null, reg), { id: null, reason: "empty" });
    eq(resolveAttrRef("!!!", reg), { id: null, reason: "notFound" }, "folds to nothing: ");
    eq(resolveAttrRef("ashfallcompany", []), { id: null, reason: "notFound" }, "empty registry: ");
  });

  t("resolveAttrRef: id beats name after crossed renames", () => {
    // x renamed "Y", y renamed "X" — the id is the deterministic answer
    const reg = [
      { id: "x", title: "Y" },
      { id: "y", title: "X" }
    ];
    eq(resolveAttrRef("x", reg).id, "x");
    eq(resolveAttrRef("y", reg).id, "y");
    // a renamed entry is still reachable by its new title when that is not someone's id
    eq(resolveAttrRef("Redrock", [{ id: "yellowstone", title: "Redrock" }]).id, "yellowstone");
  });

  t("resolveAttrRef: legacy duplicate names are ambiguous, not first-match", () => {
    const reg = [
      { id: "goblinguild", title: "Goblin Guild" },
      { id: "goblinguild2", title: "goblin guild" }
    ];
    eq(resolveAttrRef("Goblin Guild", reg), { id: null, reason: "ambiguous", candidates: ["goblinguild", "goblinguild2"] });
    // the id still picks one exactly
    eq(resolveAttrRef("goblinguild2", reg).id, "goblinguild2");
  });

  t("resolveAttrRef: derived ids resolve without an entry, normalised", () => {
    eq(resolveAttrRef("species:High Elf", []).id, "species:highelf");
    eq(resolveAttrRef("type:humanoid", []).id, "type:humanoid");
    // kind: is an actor id — never lowercased, or it stops naming the document
    eq(resolveAttrRef("kind:AbC123xyz", []).id, "kind:AbC123xyz");
    eq(resolveAttrRef("species:", []), { id: null, reason: "notFound" });
    // an unknown namespace is just a name, and a name that matches nothing
    eq(resolveAttrRef("guild:thieves", []), { id: null, reason: "notFound" });
  });

  t("resolveAttrRef: a dangling id the actor carries can still be named (to unlink it)", () => {
    const reg = [{ id: "ashfallcompany", title: "Ashfall Company" }];
    eq(resolveAttrRef("deletedguild", reg), { id: null, reason: "notFound" }, "without carried: ");
    eq(resolveAttrRef("deletedguild", reg, { carried: ["deletedguild"] }).id, "deletedguild", "with carried: ");
    // a registry id still wins over a carried literal
    eq(resolveAttrRef("ashfallcompany", reg, { carried: ["ashfallcompany"] }).id, "ashfallcompany");
  });

  t("planEnsure: returns the existing entry untouched, or plans a create", () => {
    const reg = [
      { id: "ashfallcompany", title: "Ashfall Company", dc: 14 },
      { id: "yellowstone", title: "Redrock" }
    ];
    const hit = planEnsure("ashfall company", reg);
    eq(hit.action, "existing");
    eq(hit.entry.id, "ashfallcompany");
    eq(hit.entry.dc, 14, "untouched: ");
    eq(planEnsure("Redrock", reg).entry.id, "yellowstone", "found by its new title: ");
    eq(planEnsure("Forge Lung", reg), { action: "create", id: "forgelung" });
    eq(planEnsure("", reg), { action: "refuse", reason: "empty" });
    eq(planEnsure("!!!", reg), { action: "refuse", reason: "empty" });
    // renamed away from "Yellow Stone": the id is taken, the name is not — neither return nor create
    const away = planEnsure("Yellow Stone", reg);
    eq([away.action, away.reason, away.existing?.id], ["refuse", "collision", "yellowstone"]);
    // a derived id has no entry to ensure
    eq(planEnsure("species:elf", reg), { action: "refuse", reason: "invalid" });
    eq(planEnsure("Dup", [{ id: "dup", title: "Dup" }, { id: "dup2", title: "dup" }]).reason, "ambiguous");
  });

  t("names are unique: a renamed entry is found by its title, not its stale id", () => {
    // the gap this closes — id `yellowstone`, renamed Redrock; creating "Redrock" derives
    // `redrock`, which the id check alone would let through
    const reg = [{ id: "yellowstone", title: "Redrock" }];
    eq(nameCollision("redrock", reg)?.id, "yellowstone");
    eq(nameCollision("Yellowstone", reg), null, "the old name is free once renamed away: ");
  });

  t("names are unique: a rename into another entry's name is refused", () => {
    const reg = [
      { id: "goblinguild", title: "Goblin Guild" },
      { id: "thievesguild", title: "Thieves' Guild" }
    ];
    eq(renameCollision("thievesguild", "goblin guild", reg)?.id, "goblinguild");
    eq(renameCollision("thievesguild", "GÖBLIN  GUILD", reg)?.id, "goblinguild");
    eq(renameCollision("thievesguild", "Night Market", reg), null, "a fresh name is fine: ");
  });

  t("names are unique: renaming to your own name in a different case is allowed", () => {
    const reg = [
      { id: "goblinguild", title: "Goblin Guild" },
      { id: "thievesguild", title: "Thieves' Guild" }
    ];
    eq(renameCollision("goblinguild", "GOBLIN GUILD", reg), null);
    eq(renameCollision("goblinguild", "goblin  guild", reg), null);
    eq(renameCollision("thievesguild", "thieves guild", reg), null, "punctuation-only change: ");
    // a legacy duplicate from before the rule: recasing your own name makes nothing worse
    const legacy = [
      { id: "goblin", title: "Goblin" },
      { id: "goblin2", title: "goblin" }
    ];
    eq(renameCollision("goblin2", "GOBLIN", legacy), null);
    eq(renameCollision("goblin2", "Hobgoblin", legacy), null);
  });

  t("attrIdOf: an authored id can never collide with a derived one", () => {
    // the whole reason uniqueness is free: `:` is stripped, so no typed title can produce a
    // namespaced id, whatever a GM enters
    eq(attrIdOf("species:human"), "specieshuman");
    eq(attrIdOf("type:humanoid"), "typehumanoid");
    eq(derivedNamespace("species:human"), "species");
    eq(derivedNamespace("northgoblin"), null);
    eq(derivedNamespace("nonsense:x"), null, "an unknown namespace is not derived");
    eq(derivedNamespace(""), null);
  });

  t("registry: entries are sanitised, duplicates keep the first, junk vanishes", () => {
    eq(readRegistry(null), []);
    eq(readRegistry([null, "x", 3]), []);
    eq(readRegistry([{ title: "no id" }]), []);
    eq(readRegistry([{ id: "!!!" }]), []);
    const reg = readRegistry([
      { id: "North Goblin", title: "North Goblin", category: "faction", advantage: true },
      { id: "northgoblin", title: "A duplicate by normalisation" }
    ]);
    eq(reg.length, 1);
    eq(reg[0].id, "northgoblin");
    eq(reg[0].title, "North Goblin");
    // a title is display-only, so a hand-written entry with none stays usable
    eq(readRegistry([{ id: "guild" }])[0].title, "guild");
    // decision 20: bonuses are reserved and emptied on read, so v1 cannot grow one by accident
    eq(readRegistry([{ id: "guild", bonuses: [{ skill: "his", value: 5 }] }])[0].bonuses, []);
  });

  /* ── review bookkeeping (the Attribute Review panel) ────────────────────── */

  t("review: timestamps and touched survive clampAttribute and a readRegistry round-trip", () => {
    const e = clampAttribute({ id: "guild", createdAt: 1000, modifiedAt: 2000, reviewedAt: 1500, touched: ["reveal", "lore"] });
    eq([e.createdAt, e.modifiedAt, e.reviewedAt, e.touched], [1000, 2000, 1500, ["reveal", "lore"]]);
    const again = readRegistry(readRegistry([e]))[0];
    eq([again.createdAt, again.modifiedAt, again.reviewedAt, again.touched], [1000, 2000, 1500, ["reveal", "lore"]]);
  });

  t("review: entries from before timestamps backfill to null/[] at read, never throw", () => {
    const old = readRegistry([{ id: "merrowgate", title: "Merrowgate", reveal: "x" }])[0];
    eq([old.createdAt, old.modifiedAt, old.reviewedAt, old.touched], [null, null, null, []]);
    eq(reviewState(old), "unreviewed");
  });

  t("review: garbage timestamps become null — 0, strings, NaN and null are not times", () => {
    const e = clampAttribute({ id: "g", createdAt: 0, modifiedAt: "2026-10-06", reviewedAt: NaN, touched: "reveal" });
    eq([e.createdAt, e.modifiedAt, e.reviewedAt, e.touched], [null, null, null, []]);
    eq(clampAttribute({ id: "g", createdAt: null }).createdAt, null);
    eq(clampAttribute({ id: "g", createdAt: 12.7 }).createdAt, 13);
  });

  t("review: reviewedSnapshot — taken from content, survives the clamp, stripped of junk", () => {
    const e = clampAttribute({ id: "guild", title: "Guild", reveal: "old", dc: 14, lore: [{ id: "r1", label: "x", text: "t" }], source: { path: "world/a.md" } });
    const snap = snapshotOf(e);
    eq([snap.title, snap.reveal, snap.dc, snap.lore[0].id, snap.lore[0].text], ["Guild", "old", 14, "r1", "t"]);
    ok(!("source" in snap) && !("icon" in snap) && !("reviewedAt" in snap), "content only, no source/icon/bookkeeping");
    const stored = clampAttribute({ ...e, reviewedAt: 5, reviewedSnapshot: snap, dc: 18 });
    eq(stored.reviewedSnapshot, snap, "survives an unrelated edit");
    eq(readRegistry([stored])[0].reviewedSnapshot, snap, "and a registry round trip");
    eq(clampAttribute({ id: "old" }).reviewedSnapshot, null, "entries before snapshots read null");
    eq(clampSnapshot({ title: 3, bogus: "x", secret: "yes", hold: "no", dc: "12", parent: " p " }), { title: "", secret: false, parent: "p", dc: null, hold: null });
    eq([clampSnapshot("x"), clampSnapshot([]), clampSnapshot({ bogus: 1 })], [null, null, null]);
    const big = clampSnapshot({ reveal: "a".repeat(SNAPSHOT_MAX + 10), miss: "b".repeat(SNAPSHOT_MAX + 10), lore: Array.from({ length: 200 }, (_, n) => ({ id: `r${n}`, text: "c".repeat(5000) })) });
    ok(big === null || JSON.stringify(big).length <= SNAPSHOT_MAX, "size capped");
    eq(changedFields(e, { ...e, reviewedSnapshot: snap }), [], "a snapshot is bookkeeping, not content");
    ok(ATTR_REVIEW_FIELDS.includes("reviewedSnapshot"), "a patch cannot forge a snapshot");
  });

  t("review: touched keeps content field names only, deduped, in order", () => {
    eq(clampTouched(["reveal", "bogus", "reveal", 3, "lore", "reviewedAt", "bonuses"]), ["reveal", "lore"]);
    eq(clampTouched(null), []);
    ok(ATTR_CONTENT_FIELDS.includes("lore") && !ATTR_CONTENT_FIELDS.includes("modifiedAt"), "bookkeeping is not content");
  });

  t("review: changedFields names content changes and ignores bookkeeping", () => {
    const a = { id: "g", title: "Guild", reveal: "a", lore: [{ id: "r1", label: "x" }] };
    eq(changedFields(a, { ...a }), []);
    eq(changedFields(a, { ...a, reveal: "b" }), ["reveal"]);
    eq(changedFields(a, { ...a, lore: [{ id: "r1", label: "y" }] }), ["lore"]);
    eq(changedFields(a, { ...a, modifiedAt: 5, reviewedAt: 9, touched: ["reveal"], createdAt: 1, bonuses: [1] }), []);
    eq(changedFields(a, { ...a, title: "Guild2", dc: 22 }), ["title", "dc"]);
    // clamped on both sides: a no-op that only differs by sanitising is not a change
    eq(changedFields(a, { ...a, dc: "15" }), []);
  });

  t("review: reviewState — unreviewed, changed after sign-off, reviewed", () => {
    eq(reviewState({ id: "g" }), "unreviewed");
    eq(reviewState({ id: "g", modifiedAt: 100, reviewedAt: null }), "unreviewed");
    eq(reviewState({ id: "g", modifiedAt: 100, reviewedAt: 200 }), "reviewed");
    eq(reviewState({ id: "g", modifiedAt: 300, reviewedAt: 200 }), "changed");
    eq(reviewState({ id: "g", modifiedAt: 200, reviewedAt: 200, touched: ["reveal"] }), "changed", "same-ms edit still shows: ");
    eq(reviewState({ id: "g", modifiedAt: null, reviewedAt: 200 }), "reviewed", "a pre-timestamp entry signed off is reviewed: ");
    eq([needsReview({ id: "g" }), needsReview({ id: "g", reviewedAt: 5 })], [true, false]);
  });

  t("review: sortForReview — needs-review first (unreviewed, changed; newest first, nulls last), then reviewed by title", () => {
    const list = [
      { id: "b", title: "Bravo", reviewedAt: 10, modifiedAt: 5 },
      { id: "a", title: "Alpha", reviewedAt: 10, modifiedAt: 5 },
      { id: "c", title: "Charlie", reviewedAt: 10, modifiedAt: 50 },
      { id: "u1", title: "Untimed" },
      { id: "u2", title: "Newer", modifiedAt: 900 },
      { id: "u3", title: "Older", modifiedAt: 100 }
    ];
    eq(sortForReview(list).map(e => e.id), ["u2", "u3", "u1", "c", "a", "b"]);
    eq(sortForReview(list, "title").map(e => e.id), ["a", "b", "c", "u2", "u3", "u1"]);
    eq(sortForReview(list, "modified").map(e => e.id), ["u2", "u3", "c", "a", "b", "u1"]);
    eq(sortForReview(list, "nonsense").map(e => e.id), sortForReview(list).map(e => e.id), "unknown mode → review: ");
    eq(list[0].id, "b", "input not mutated");
    eq(sortForReview(null), []);
  });

  t("review: sortForReview by category groups, then title", () => {
    const list = [
      { id: "x", title: "Zed", category: "house" },
      { id: "y", title: "Amber", category: "city" },
      { id: "z", title: "Able", category: "house" }
    ];
    eq(sortForReview(list, "category").map(e => e.id), ["y", "z", "x"]);
  });

  t("review: readSelection prunes to live ids, dedupes, keeps order", () => {
    const reg = [{ id: "merrowgate" }, { id: "houseilphrin" }];
    eq(readSelection(["houseilphrin", "gone", "merrowgate", "houseilphrin", 7, null], reg), ["houseilphrin", "merrowgate"]);
    eq(readSelection("merrowgate", reg), []);
    eq(readSelection(undefined, reg), []);
    eq(readSelection([" merrowgate "], reg), ["merrowgate"]);
  });

  t("registry: the help scale is clamped on read — type/size can never grant or hide", () => {
    /*
     * Decision 19's `advantage: boolean` is RETIRED (Joe: "that is too broad") and replaced by
     * the two-axis scale. The degeneracy it closed still has to stay closed: `type:humanoid` is
     * carried by nearly every creature, so advantage from sharing it would apply to almost every
     * roll and mean nothing. Enforced in the READER, so a hand-edited setting cannot reopen it.
     */
    eq(clampAttribute({ id: "northgoblin" }).whenKnown, "enables", "conservative default; the GM opts up");
    eq(clampAttribute({ id: "northgoblin", whenKnown: "auto" }).whenKnown, "auto");
    eq(clampAttribute({ id: "northgoblin", whenKnown: "nonsense" }).whenKnown, "enables");
    eq(clampAttribute({ id: "type:humanoid", whenKnown: "auto", whenCarried: "auto" }).whenKnown, "enables");
    eq(clampAttribute({ id: "size:med", whenCarried: "advantage" }).whenCarried, "inherit");
    // ...and the same two can never be SECRET either: a medium humanoid cannot conceal its
    // silhouette, so putting a roll in front of it would gate a fact already on screen
    eq(clampAttribute({ id: "type:humanoid", secret: true }).secret, false);
    eq(clampAttribute({ id: "size:med", secret: true }).secret, false);
    // narrow enough to be real information, so these may be marked secret by hand
    eq(clampAttribute({ id: "background:spy", secret: true }).secret, true);
    eq(clampAttribute({ id: "species:human" }).secret, false, "derived defaults visible");
    eq(clampAttribute({ id: "northgoblin" }).secret, true, "authored defaults secret");
  });

  t("derive: the verified paths, and nothing is stored", () => {
    eq(deriveAttributes({ type: "humanoid", size: "med", species: "Human", background: "Entertainer" }),
       ["type:humanoid", "size:med", "species:human", "background:entertainer"]);
    eq(deriveAttributes({ type: "humanoid" }), ["type:humanoid"]);
    eq(deriveAttributes({}), []);
    eq(deriveAttributes(), []);
    // a kind pointer is an ACTOR id, not a slug — lowercasing it would stop it matching
    eq(deriveAttributes({ kindId: "aBcD1234EfGh5678" }), ["kind:aBcD1234EfGh5678"]);
    // Joe's live example: a goblin kind that also belongs to the north tribe (decision 17)
    eq(deriveAttributes({ type: "humanoid", kindId: "GOBLIN01" }), ["type:humanoid", "kind:GOBLIN01"]);
  });

  t("attributes: derived ∪ authored, minus suppressed — and suppression reaches both", () => {
    eq(attributeIdsFor({ derived: ["type:humanoid"], authored: ["northgoblin"] }),
       ["type:humanoid", "northgoblin"]);
    // the GM removes ONE derived link from ONE actor — the only storage derivation needs
    eq(attributeIdsFor({ derived: ["type:humanoid", "size:med"], authored: [], off: ["type:humanoid"] }),
       ["size:med"]);
    // and the same list suppresses an authored link, without editing the flag
    eq(attributeIdsFor({ derived: [], authored: ["northgoblin"], off: ["northgoblin"] }), []);
    eq(attributeIdsFor({ derived: ["a"], authored: ["a"] }), ["a"], "no duplicates across the union");
    eq(attributeIdsFor({}), []);
    eq(attributeIdsFor(), []);
  });

  t("combineAdvantage: RAW is the book, net is Joe's setting, and they disagree on purpose", () => {
    // the case decision 19 names: RAW cancels regardless of counts
    eq(combineAdvantage(2, 1, "raw"), "normal");
    eq(combineAdvantage(2, 1, "net"), "advantage");
    eq(combineAdvantage(1, 3, "raw"), "normal");
    eq(combineAdvantage(1, 3, "net"), "disadvantage");
    // where they agree
    eq(combineAdvantage(1, 0, "raw"), "advantage");
    eq(combineAdvantage(1, 0, "net"), "advantage");
    eq(combineAdvantage(0, 1, "raw"), "disadvantage");
    eq(combineAdvantage(0, 0, "raw"), "normal");
    eq(combineAdvantage(2, 2, "net"), "normal");
    // the default is RAW — a shipped module defaults to the book, not to one table's rule
    eq(combineAdvantage(2, 1), "normal");
    eq(combineAdvantage(-5, -5), "normal");
  });

  t("attr ledger: flat keys, no tier, and pending is absent rather than zero", () => {
    eq(attrFactKey("northgoblin", "row1"), "attr:northgoblin:row1");
    eq(readAttrBeliefs(null), {});
    eq(readAttrBeliefs([1, 2]), {});
    eq(readAttrBeliefs({ "a:b:c": { text: "told", total: 18, when: 5, delivered: 9 } }), {
      "a:b:c": { text: "told", tier: null, total: 18, when: 5, delivered: 9, claim: null, sources: null }
    });
    // attribute lore is flat pass/fail — a tier here would be a lie, so it is forced null
    eq(readAttrBeliefs({ "a:b:c": { text: "t", tier: 25 } })["a:b:c"].tier, null);
    // undelivered must be null, not 0: `delivered: 0` and "never delivered" cannot be the same
    eq(readAttrBeliefs({ "a:b:c": { text: "t", delivered: 0 } })["a:b:c"].delivered, null);
    eq(readAttrBeliefs({ "": { text: "t" } }), {});
  });

  t("sources: why a roll had its advantage state, recorded rather than recomputed", () => {
    // the registry can be edited after a roll, so a GM asking "why was that at advantage"
    // three scenes later must get the answer that was true THEN
    eq(clampSources(null), null);
    eq(clampSources("nope"), null);
    eq(clampSources([]), null);
    eq(clampSources({ adv: 2, dis: 1, shared: ["North Goblin", "Coast Guild"], declared: "advantage", rule: "raw", resolved: "normal" }), {
      adv: 2, dis: 1, shared: ["North Goblin", "Coast Guild"], declared: "advantage", rule: "raw", resolved: "normal"
    });
    eq(clampSources({}), { adv: 0, dis: 0, shared: [], declared: "normal", rule: "raw", resolved: "normal" });
    eq(clampSources({ adv: -3, dis: "x" }).adv, 0);
    eq(clampSources({ declared: "wishful" }).declared, "normal");
    eq(clampSources({ rule: "net" }).rule, "net");
    eq(clampSources({ shared: [1, null, "Guild", "  "] }).shared, ["Guild"]);
    eq(clampSources({ shared: Array.from({ length: 50 }, (_, i) => `g${i}`) }).shared.length, 20);
  });

  t("fact keys: a SUBJECT may contain colons — the derived-id grammar, found by review", () => {
    /*
     * Decision 16 advertises authoring a registry entry for a derived id ("authoring lore for
     * every human is creating the species:human entry"), so `attr:species:human:origin` is a
     * legitimate key whose attribute is `species:human` and whose fact is `origin`.
     *
     * Three shipped call sites used `split(":")` and read the subject as `"species"`. The grant
     * rendered nowhere and the pending reveal was silently dropped. Namespace is up to the
     * FIRST colon, fact is after the LAST, subject is everything between.
     */
    eq(parseFactKey("attr:species:human:origin"), { ns: "attr", subject: "species:human", fact: "origin" });
    eq(parseFactKey("attr:background:entertainer:row1"),
       { ns: "attr", subject: "background:entertainer", fact: "row1" });
    eq(parseFactKey("attr:kind:AbC123:row1"), { ns: "attr", subject: "kind:AbC123", fact: "row1" });
    // the simple cases must not have moved
    eq(parseFactKey("attr:northgoblin:oath"), { ns: "attr", subject: "northgoblin", fact: "oath" });
    eq(parseFactKey("lore:actor1:row1"), { ns: "lore", subject: "actor1", fact: "row1" });
    eq(parseFactKey("kind:goblin1"), { ns: "kind", subject: "goblin1", fact: "kind" });
    eq(parseFactKey("mask:actor1:layer1"), { ns: "mask", subject: "actor1", fact: "layer1" });
    eq(parseFactKey("actor1:row1"), null);
    eq(parseFactKey("lore:actor1"), null);
    eq(parseFactKey("lore:"), null);
  });

  t("ledger keys: the character id is after the LAST colon, not the fourth", () => {
    eq(parseLedgerKey("attr:species:human:origin:charAbc"), {
      ns: "attr", subject: "species:human", fact: "origin",
      factKey: "attr:species:human:origin", characterId: "charAbc"
    });
    eq(parseLedgerKey("attr:northgoblin:oath:charAbc").characterId, "charAbc");
    eq(parseLedgerKey("attr:northgoblin:oath:charAbc").subject, "northgoblin");
    eq(parseLedgerKey("nonsense"), null);
    eq(parseLedgerKey("attr:northgoblin:oath"), null, "no character id — not a ledger key");
    eq(parseLedgerKey(""), null);
  });

  t("granted: a grant on an AUTHORED DERIVED attribute actually renders", () => {
    // the live reproduction: this returned [] before the grammar fix
    const granted = {
      "attr:species:human:origin": { text: "what every human here knows", when: 1 },
      "attr:northgoblin:oath": { text: "the tribe oath", when: 2 }
    };
    eq(grantsForEntry(granted, "x", { attributeIds: ["species:human"] }).map(g => g.key),
       ["attr:species:human:origin"]);
    eq(grantsForEntry(granted, "x", { attributeIds: ["northgoblin"] }).map(g => g.key),
       ["attr:northgoblin:oath"]);
    // and the truncated id must NOT match — the old bug matched on "species"
    eq(grantsForEntry(granted, "x", { attributeIds: ["species"] }), []);
    eq(grantsForEntry(granted, "x", { attributeIds: ["species:human", "northgoblin"] }).length, 2);
  });

  /* ── phase 8: the tree ─────────────────────────────────────────────── */

  const TREE = [
    { id: "ardenhaven", secret: true, whenKnown: "advantage" },
    { id: "undercity", parent: "ardenhaven", secret: true, whenKnown: "advantage" },
    { id: "assassins", parent: "undercity", secret: true, whenKnown: "enables", whenCarried: "auto" },
    { id: "visiblething", parent: "ardenhaven", secret: false },
    { id: "orphan", parent: "deletedentry", secret: true }
  ];
  const CARRIER = ["ardenhaven", "undercity", "assassins"]; // Q1 materialises ancestors

  t("tree: ancestors resolve, dangling degrades to ROOT, cycles refuse", () => {
    eq(ancestorsOf("assassins", TREE), ["undercity", "ardenhaven"]);
    eq(withAncestors("assassins", TREE), ["assassins", "undercity", "ardenhaven"]);
    eq(ancestorsOf("ardenhaven", TREE), []);
    // a deleted parent must NOT make the node unreachable — degrade toward available, the
    // `resolveKindId` precedent. Unreachable is silence, and silence is this module's worst failure.
    eq(ancestorsOf("orphan", TREE), []);
    eq(wouldCycle("ardenhaven", "assassins", TREE), true);
    eq(wouldCycle("x", "x", TREE), true);
    eq(wouldCycle("assassins", "ardenhaven", TREE), false);
    // a hand-edited cyclic setting costs a wrong gate, never a hung client
    const cyclic = [{ id: "a", parent: "b" }, { id: "b", parent: "a" }];
    eq(ancestorsOf("a", cyclic), ["b"]);
  });

  t("tree: the ladder is SECRET rungs only, and a visible target has none", () => {
    eq(identificationLadder("assassins", TREE), ["ardenhaven", "undercity", "assassins"]);
    // visible: you can see it, so it is not a question and needs no ancestors either
    eq(identificationLadder("visiblething", TREE), []);
    eq(identificationLadder("nosuchthing", TREE), []);
    // a visible rung mid-chain drops out without breaking the chain
    const mixed = [
      { id: "city", secret: true },
      { id: "open", parent: "city", secret: false },
      { id: "guild", parent: "open", secret: true }
    ];
    eq(identificationLadder("guild", mixed), ["city", "guild"]);
  });

  /* ── phase 8: the knowledge ledger ─────────────────────────────────── */

  t("knowledge: a FAILURE is recorded and is not knowledge — the stage-1 lock", () => {
    const k = { char1: { ardenhaven: { when: 5, via: "roll" }, undercity: { when: 6, failed: true } } };
    eq(knowsAttribute(k, "char1", "ardenhaven"), true);
    eq(knowsAttribute(k, "char1", "undercity"), false, "a failed row is knowledge of nothing");
    eq(failedAttribute(k, "char1", "undercity"), true);
    eq(failedAttribute(k, "char1", "ardenhaven"), false);
    // settled either way — this is what stops one roll per stranger until the dice cooperate
    eq(settledAttribute(k, "char1", "ardenhaven"), true);
    eq(settledAttribute(k, "char1", "undercity"), true);
    eq(settledAttribute(k, "char1", "assassins"), false);
    eq(settledAttribute(k, "nobody", "ardenhaven"), false);
    eq(readKnowledge(null), {});
    eq(readKnowledge([1]), {});
    eq(readKnowledge({ c: { a: { via: "nonsense" } } }).c.a.via, "roll");
  });

  /* ── phase 8: the cascade planner ──────────────────────────────────── */

  const plan = over => planStep({ registry: TREE, carried: CARRIER, characterId: "char1", ...over });

  t("planner: a stranger starts at the ROOT of the ladder, not the leaf", () => {
    // knowing something that precise by chance must be hard — Joe's whole point
    const step = plan({});
    eq(step.roll, "ardenhaven");
    eq(step.backfill, true, "first success proves they knew the city all along");
    eq(step.advantage, false);
  });

  t("planner: knowing a rung advances the climb and grants its help", () => {
    const knowledge = { char1: { ardenhaven: { when: 1 } } };
    // the city is known, but not yet identified ON THIS CREATURE, so it is still the next rung —
    // knowing a place is not the same as placing a person
    let step = plan({ knowledge });
    eq(step.roll, "ardenhaven");
    eq(step.backfill, false);
    eq(step.advantage, true, "whenKnown: advantage, and they know it");
  });

  t("planner: an identified rung is skipped; a NEGATIVE one blocks everything beneath", () => {
    const know = { char1: { ardenhaven: { when: 1 }, undercity: { when: 1 } } };
    const yes = { char1: { [identifiedKey("ardenhaven")]: { text: "they are Ardenhaven-born", when: 1, delivered: 1 } } };
    eq(plan({ knowledge: know, beliefs: yes }).roll, "undercity", "climbs to the next rung");

    const no = { char1: { [identifiedKey("ardenhaven")]: { text: "", when: 1 } } };
    eq(plan({ knowledge: know, beliefs: no }), { done: true }, "cannot place the city, so cannot place anything under it");
  });

  t("planner: a permanent stage-1 failure blocks the rung and everything below it", () => {
    const knowledge = { char1: { ardenhaven: { when: 1, failed: true } } };
    eq(plan({ knowledge }), { done: true }, "never recognisable on sight again");
  });

  t("planner: whenCarried AUTO bypasses ancestor gating — Joe's mark under the eye", () => {
    /*
     * The flagship case, and it is unreachable any other way: an assassin recognises another
     * assassin directly, without first placing their home district. `whenKnown: auto` must NOT
     * do this — outsider knowledge climbs the tree; kin-sense is direct.
     */
    const step = plan({ rollerCarries: ["assassins"] });
    eq(step.grant, "assassins");
    eq(step.bypass, true);
    // an outsider on the same tree still starts at the root
    eq(plan({ rollerCarries: [] }).roll, "ardenhaven");
  });

  t("planner: an AUTO rung is granted, never rolled", () => {
    const reg = [{ id: "goblintattoo", secret: true, whenKnown: "auto" }];
    const step = planStep({ registry: reg, carried: ["goblintattoo"], characterId: "char1",
      knowledge: { char1: { goblintattoo: { when: 1 } } } });
    eq(step.grant, "goblintattoo");
    eq(step.roll, undefined);
    eq(step.backfill, false);
  });

  t("planner: a visible attribute is never a step, and nothing is left to do", () => {
    eq(planStep({ registry: TREE, carried: ["visiblething"], characterId: "char1" }), { done: true });
    eq(planStep({ registry: TREE, carried: [], characterId: "char1" }), { done: true });
    eq(planStep({}), { done: true });
    eq(planStep(), { done: true });
  });

  t("planner: a carrier missing an ancestor stops rather than rolling a false fact", () => {
    // Q1 makes this an invalid sheet; the planner must not roll "are they from the undercity"
    // against someone the data says is not, because no roll can pass a false fact
    const broken = ["assassins"]; // no ardenhaven, no undercity
    eq(planStep({ registry: TREE, carried: broken, characterId: "char1" }), { done: true });
  });

  /* ── the GM's Share: chain unlock and the who-knows tags ──────────── */

  t("share: a shared identification reopens a FAILED parent and the child rolls next", () => {
    const know = { char1: { ardenhaven: { when: 1, failed: true, via: "roll" } } };
    const bel = { char1: { [identifiedKey("ardenhaven")]: { text: "", total: 7, when: 1 } } };
    eq(plan({ knowledge: know, beliefs: bel }), { done: true }, "blocked twice over");
    // exactly the two rows shareFact writes — nothing for the child
    know.char1.ardenhaven = { when: 2, failed: false, via: "shared", pending: false };
    bel.char1[identifiedKey("ardenhaven")] = { text: "Ardenhaven-born", total: null, when: 2, delivered: 2, from: "char2" };
    const step = plan({ knowledge: know, beliefs: bel });
    eq(step.roll, "undercity");
    eq(step.backfill, true);
    ok(!bel.char1[identifiedKey("undercity")], "children are not granted");
    eq(visibleAttributesFor({ carried: CARRIER, registry: TREE, beliefs: bel, characterId: "char1" }).includes("ardenhaven"), true);
    eq(readKnowledge(know).char1.ardenhaven.via, "shared");
    eq(readBeliefs(bel).char1[identifiedKey("ardenhaven")].from, "char2");
  });

  t("share: only ONE of the two rows is not enough — both locks must be lifted", () => {
    // the knowledge row alone: the failed identification row on this creature still blocks
    const know = { char1: { ardenhaven: { when: 2, failed: false, via: "shared" } } };
    const bel = { char1: { [identifiedKey("ardenhaven")]: { text: "", total: 7, when: 1, delivered: 1 } } };
    eq(plan({ knowledge: know, beliefs: bel }), { done: true });
    // the identification row alone over a stage-1 failure: the planner skips the settled rung and
    // climbs — the per-creature answer is what gates the child, stage 1 only gates unsettled rungs
    const know2 = { char1: { ardenhaven: { when: 1, failed: true } } };
    const bel2 = { char1: { [identifiedKey("ardenhaven")]: { text: "told", total: null, when: 2, delivered: 2, from: "gm" } } };
    eq(plan({ knowledge: know2, beliefs: bel2 }).roll, "undercity");
  });

  t("share: sharing a CHILD identification writes no parent and does not skip the climb", () => {
    // the child's row on this creature, with the root untouched: the planner still asks the root
    // first (it is unsettled), and the child is skipped once the climb reaches it
    const bel = { char1: { [identifiedKey("undercity")]: { text: "undercity", total: null, when: 2, delivered: 2, from: "gm" } } };
    eq(plan({ beliefs: bel }).roll, "ardenhaven");
    eq(visibleAttributesFor({ carried: CARRIER, registry: TREE, beliefs: bel, characterId: "char1" }).includes("undercity"), true,
      "the shared child's own grant still renders under this creature");
  });

  t("share: provenance round-trips, junk is dropped, rolled rows keep their old shape", () => {
    eq(readKnowledge({ c: { a: { via: "shared" } } }).c.a.via, "shared");
    eq(readKnowledge({ c: { a: { via: "nonsense" } } }).c.a.via, "roll");
    // a share over a failure remembers it (so forgetting restores the failure); nothing else does
    eq(readKnowledge({ c: { a: { via: "shared", overFailed: true } } }).c.a.overFailed, true);
    eq("overFailed" in readKnowledge({ c: { a: { via: "roll", overFailed: true } } }).c.a, false);
    eq("overFailed" in readKnowledge({ c: { a: { via: "shared" } } }).c.a, false);
    eq(readBeliefs({ c: { k: { text: "x", from: "gm" } } }).c.k.from, "gm");
    eq("from" in readBeliefs({ c: { k: { text: "x", from: 7 } } }).c.k, false, "a non-string from is dropped");
    eq("from" in readBeliefs({ c: { k: { text: "x", from: "  " } } }).c.k, false);
    eq(readBeliefs({ c: { k: { text: "x", from: "y".repeat(99) } } }).c.k.from.length, 40);
    eq(readAttrBeliefs({ "a:b:c": { text: "x", from: "char2" } })["a:b:c"].from, "char2");
    eq("from" in readAttrBeliefs({ "a:b:c": { text: "x", from: { id: 1 } } })["a:b:c"], false);
  });

  t("share: a failure that handed over nothing reads failed, and survives as a share's prior", () => {
    // what a failed lore roll writes since 2026-10: no text, a real total, the verdict
    const miss = { text: "", tier: null, total: 7, when: 5, delivered: 5, pass: false };
    eq(shareStatus({ belief: miss }), "failed");
    eq(shareStatus({ belief: miss, dc: 12 }), "failed");
    eq(shareStatus({ belief: readBeliefs({ c: { k: miss } }).c.k }), "failed", "after the reader: ");
    // a share over it keeps it — no text, but a total is an answer, so Forget gives the lock back
    const kept = priorOf({ from: "gm", prior: miss });
    eq(kept.prior.total, 7);
    eq(kept.prior.pass, false);
    eq(kept.prior.text, "");
  });

  t("share: the row a share replaced (prior) round-trips — only on a share, one level deep", () => {
    const failed = { text: "", tier: null, total: 6, when: 3, delivered: 3 };
    const shared = { text: "told", total: null, when: 9, delivered: 9, from: "gm", prior: failed };
    eq(readBeliefs({ c: { k: shared } }).c.k.prior, { text: "", tier: null, total: 6, when: 3, delivered: 3 });
    eq(readAttrBeliefs({ "a:b:c": shared })["a:b:c"].prior.total, 6);
    // a rolled row never carries one — a re-roll must not inherit what a share kept
    eq("prior" in readBeliefs({ c: { k: { text: "x", total: 12, prior: failed } } }).c.k, false);
    // kind: a rolled tier survives, and its prose
    const tier20 = { text: "a goblin, wary", tier: 20, total: 21, when: 4, delivered: 4 };
    eq(readBeliefs({ c: { k: { text: "all of it", tier: 25, total: null, delivered: 9, from: "x", prior: tier20 } } }).c.k.prior.tier, 20);
    // a prior is an ANSWER: a bare claim or junk is no prior at all
    eq(priorOf({ from: "gm", prior: { text: "", total: null, delivered: null } }), {});
    eq(priorOf({ from: "gm", prior: "nope" }), {});
    // one level: a prior's own prior is not kept, its provenance is
    const deep = priorOf({ from: "gm", prior: { text: "t", total: null, delivered: 2, from: "char2", prior: failed } });
    eq(deep.prior.from, "char2");
    eq("prior" in deep.prior, false);
  });

  t("share: forgetting a share over a failure gives the failure back — no free re-roll", () => {
    // identification: the restored rolled failure blocks this creature's ladder again
    const know = { char1: { ardenhaven: { when: 1, failed: true, via: "roll" } } };
    const restored = { char1: { [identifiedKey("ardenhaven")]: { text: "", total: 7, when: 1, delivered: 1 } } };
    eq(plan({ knowledge: know, beliefs: restored }), { done: true });
    eq(shareStatus({ ident: true, belief: restored.char1[identifiedKey("ardenhaven")], failedKnowledge: true }), "failed");
    // lore / kind: the restored row is the lock of record, so the study stays spent
    eq(mayStudy({ beliefs: { char1: { [KIND_KEY]: { text: "", tier: 0, total: 4 } } }, characterId: "char1" }), false);
    eq(shareStatus({ kind: true, belief: { text: "a goblin", tier: 20, total: 21, delivered: 4 } }), "passed",
      "a forgotten raise leaves the rolled tier 20, not nothing");
  });

  t("share: an identification is 'told' by THIS creature's row, never the attribute-wide grant", () => {
    // factStatus passes granted:false for ident — the grant key is per attribute and written by a
    // pass on ANY carrier, so it must not read as knowing this one
    eq(shareStatus({ ident: true, granted: false }), "none");
    eq(shareStatus({ ident: true, granted: false, failedKnowledge: true }), "locked");
  });

  t("share: shareStatus — every tag, and the edges between them", () => {
    eq(shareStatus(), "none");
    eq(shareStatus({ belief: { text: "yes", total: 17, delivered: 5 } }), "passed");
    eq(shareStatus({ belief: { text: "yes", total: null, delivered: 5, from: "gm" } }), "told");
    eq(shareStatus({ belief: { text: "yes", total: null, delivered: 5 } }), "told", "grantKind's legacy release has no from");
    eq(shareStatus({ belief: { text: "yes", total: 17, delivered: null } }), "held");
    eq(shareStatus({ belief: { text: "", total: 4, delivered: 5 } }), "failed");
    eq(shareStatus({ belief: { text: "  ", total: 4, delivered: null } }), "failed", "a held miss is still a miss");
    eq(shareStatus({ failedKnowledge: true }), "locked");
    eq(shareStatus({ granted: true }), "told", "Mark as learned: a grant with no ledger row");
    eq(shareStatus({ granted: true, failedKnowledge: true }), "told", "a grant outranks the lock");
    // a failed row outranks the grant: the ledger is the record of what happened on this creature
    eq(shareStatus({ belief: { text: "", total: 3, delivered: 1 }, granted: true }), "failed");
    // a bare claim (roll in flight) is not an answer
    eq(shareStatus({ belief: { text: "", total: null, delivered: null } }), "none");
    eq(shareStatus({ belief: { text: "", total: null, delivered: null }, failedKnowledge: true }), "locked");
    // identification: the planner's own auto grant is a no-roll positive WITHOUT a from — a pass
    eq(shareStatus({ ident: true, belief: { text: "kin", total: null, delivered: 1 } }), "passed");
    eq(shareStatus({ ident: true, belief: { text: "kin", total: null, delivered: 1, from: "gm" } }), "told");
    // kind: the tier, not the text, decides — tier 0 has authored (wrong) prose and is a failure
    eq(shareStatus({ kind: true, belief: { text: "a bird", tier: 0, total: 9, delivered: 1 } }), "failed");
    eq(shareStatus({ kind: true, belief: { text: "a goblin", tier: 15, total: 15, delivered: 1 } }), "passed");
    eq(shareStatus({ kind: true, belief: { text: "a goblin", tier: 25, total: null, delivered: 1 } }), "told");
    eq(shareStatus({ kind: true, belief: { text: "a goblin", tier: 20, total: 21, delivered: null } }), "held");
    eq(SHARE_STATUSES.length, 6);
  });

  t("share: a failed lore roll WITH authored miss text reads failed, not passed", () => {
    // the bug: before 2026-10 the miss line was stored as the belief's text, so text alone said
    // "passed". A failure now stores "" — but those legacy rows are still in the world.
    const row = { id: "r1", label: "The whistle", dc: 18, skill: "ins", text: "He signals the watch.", miss: "Just a tune." };
    const out = loreOutcome(row, 11);
    eq(out.pass, false);
    eq(out.text, "Just a tune.", "a failure hands over its written line (2026-10-08): ");
    // a legacy row, as the roll handler wrote it before 2026-10: the miss line AND the verdict
    const written = { text: "Just a tune.", tier: null, total: 11, when: 5, delivered: 5, pass: out.pass };
    const lore = readBeliefs({ c1: { "lore:vesh:r1": written } }).c1["lore:vesh:r1"];
    eq(lore.pass, false, "readBeliefs keeps a boolean pass: ");
    eq(shareStatus({ belief: lore, dc: 18 }), "failed");
    eq(shareStatus({ belief: lore }), "failed", "the stored verdict needs no DC: ");
    eq(shareStatus({ belief: { ...lore, delivered: null } }), "failed", "a held miss is still a miss: ");
    // the attribute-lore ledger (a world setting) carries it the same way
    const attr = readAttrBeliefs({ "attr:vrinn:r1:c1": written })["attr:vrinn:r1:c1"];
    eq(attr.pass, false);
    eq(shareStatus({ belief: attr, dc: 18 }), "failed");
    // a pass records pass: true and still reads passed
    eq(shareStatus({ belief: { ...lore, text: row.text, total: 19, pass: true }, dc: 18 }), "passed");
    // legacy rows (no pass field): graded from total against the row's DC
    const legacy = readBeliefs({ c1: { k: { text: "Just a tune.", total: 11, when: 1, delivered: 1 } } }).c1.k;
    eq("pass" in legacy, false, "absent, not null: ");
    eq(shareStatus({ belief: legacy, dc: 18 }), "failed");
    eq(shareStatus({ belief: { ...legacy, total: 18 }, dc: 18 }), "passed");
    eq(shareStatus({ belief: legacy }), "passed", "no DC known: the old reading, unchanged: ");
    // junk pass values are dropped, not coerced
    eq("pass" in readBeliefs({ c: { k: { text: "x", pass: "false" } } }).c.k, false);
    eq("pass" in readBeliefs({ c: { k: { text: "x", pass: null } } }).c.k, false);
    // a SHARE over the failure is told, even if a stale pass:false survived a merge
    eq(shareStatus({ belief: { text: row.text, total: null, delivered: 6, from: "gm", pass: false }, dc: 18 }), "told");
    // the share keeps the failure as its prior, verdict and all, so Forget gives it back
    const shared = readBeliefs({ c1: { k: { text: row.text, total: null, when: 6, delivered: 6, from: "gm", prior: written } } }).c1.k;
    eq(shared.prior.pass, false);
    eq(shareStatus({ belief: shared.prior, dc: 18 }), "failed");
    // kind and identification are untouched: tier / empty text decide them
    eq(shareStatus({ kind: true, belief: { text: "a goblin", tier: 20, total: 21, delivered: 1, pass: false }, dc: 99 }), "passed");
    eq(shareStatus({ ident: true, belief: { text: "kin", total: 4, delivered: 1 }, dc: 99 }), "passed");
  });

  t("help: whenCarried inherits, and clamps up rather than storing a weaker value", () => {
    eq(helpFor({ id: "x", whenKnown: "advantage" }, { carried: false }), "advantage");
    eq(helpFor({ id: "x", whenKnown: "advantage" }, { carried: true }), "advantage", "inherit");
    eq(helpFor({ id: "x", whenKnown: "enables", whenCarried: "auto" }, { carried: true }), "auto");
    eq(helpFor({ id: "x", whenKnown: "auto", whenCarried: "advantage" }, { carried: true }), "auto",
       "a weaker whenCarried is clamped to inherit, not stored");
    eq(helpFor(null), "enables");
  });

  t("secrecy: an unidentified SECRET membership is never listed — the phase 6 inversion", () => {
    /*
     * Phase 6's proudest result was a guild fact rendering under EVERY carrier already filed.
     * Once membership is itself secret that inverts into a leak: the grant's placement announces
     * the second creature is in the guild, with no roll and no gesture. So a secret attribute is
     * shown only where this viewer has actually identified that creature as a carrier.
     */
    const reg = [
      { id: "assassins", secret: true },
      { id: "ardenhaven", secret: true },
      { id: "type:humanoid" } // derived, never secret
    ];
    const carried = ["assassins", "ardenhaven", "type:humanoid"];
    const identified = { char1: { [identifiedKey("ardenhaven")]: { text: "Ardenhaven-born", when: 1, delivered: 1 } } };

    eq(visibleAttributesFor({ carried, registry: reg, beliefs: identified, characterId: "char1" }),
       ["ardenhaven", "type:humanoid"], "the unidentified guild is absent");
    // knowing nothing shows only what was never hidden
    eq(visibleAttributesFor({ carried, registry: reg, beliefs: {}, characterId: "char1" }), ["type:humanoid"]);
    // a NEGATIVE identification is not a positive one
    const failed = { char1: { [identifiedKey("assassins")]: { text: "", when: 1 } } };
    eq(visibleAttributesFor({ carried, registry: reg, beliefs: failed, characterId: "char1" }), ["type:humanoid"]);
    // the GM authored the secret; hiding it from them helps nobody
    eq(visibleAttributesFor({ carried, registry: reg, beliefs: {}, characterId: "char1", isGM: true }), carried);
    eq(visibleAttributesFor({}), []);
  });

  t("secrecy: a NON-secret attribute is never filtered", () => {
    // hiding a visible attribute's lore would put a roll in front of a fact already on screen
    const reg = [{ id: "guild", secret: false }];
    eq(visibleAttributesFor({ carried: ["guild"], registry: reg, beliefs: {}, characterId: "c" }), ["guild"]);
  });

  t("identification: settled vs carries, and an empty reveal is a NEGATIVE answer", () => {
    const yes = { c1: { [identifiedKey("guild")]: { text: "they wear the mark", when: 1, delivered: 1 } } };
    const no = { c1: { [identifiedKey("guild")]: { text: "", when: 1 } } };
    const heldRow = { c1: { [identifiedKey("guild")]: { text: "they wear the mark", when: 1, delivered: null } } };
    eq(identifiedState(yes, "c1", "guild").settled, true);
    eq(identifiedState(yes, "c1", "guild").carries, true);
    eq(identifiedState(no, "c1", "guild").settled, true);
    eq(identifiedState(no, "c1", "guild").carries, false, "settled but negative — and it blocks the ladder");
    eq(identifiedState({}, "c1", "guild"), { settled: false, carries: false, held: false });
    /*
     * ⚠ The leak this fixture now guards, found by playtesting: a rung that PASSED but is still
     * waiting on the GM reported as a positive identification, so the secrecy filter showed the
     * player a guild membership the GM had not released. Passed is not the same as delivered.
     */
    eq(identifiedState(heldRow, "c1", "guild").carries, false, "held is not yet identified");
    eq(identifiedState(heldRow, "c1", "guild").held, true);
    eq(identifiedState(heldRow, "c1", "guild").settled, true, "but it IS settled — no second roll");
    eq(identifiedKey("northgoblin"), "attr:northgoblin:#id");
    // the reserved fact id cannot collide with a randomID-generated lore row
    ok(!/^[a-zA-Z0-9]{16}$/.test("#id"), "reserved marker is not a possible randomID");
  });

  t("reveal: the composer gates ONLY what its tier allows — the description is the caller's job", () => {
    /*
     * `composeReveal` gates traits at 20 and attacks at 25 and passes the description through
     * whatever the tier. That is correct *here* — the caller decides whether a description
     * exists — but `composeStudyPayload` was handing it the derived biography at every tier,
     * so a sub-15 roll returned the creature's whole Monster Manual entry. Found by running two
     * real imports through every rung: tier 0 and tier 15 came back byte-identical.
     *
     * This fixture pins the composer's half; the conduit's half is `studyDescription` (fixtured
     * below), which since 2026-10 also returns "" for an unauthored failure so nothing is composed.
     */
    const parts = { header: "— Studied (Religion) —", description: "It is a shadow.", traits: "Immune: Necrotic.", attacks: ["Claw: +4"] };
    eq(composeReveal({ ...parts, tier: 0 }), "— Studied (Religion) —\nIt is a shadow.");
    eq(composeReveal({ ...parts, tier: 15 }), "— Studied (Religion) —\nIt is a shadow.");
    eq(composeReveal({ ...parts, tier: 20 }), "— Studied (Religion) —\nIt is a shadow.\nImmune: Necrotic.");
    eq(composeReveal({ ...parts, tier: 25 }), "— Studied (Religion) —\nIt is a shadow.\nImmune: Necrotic.\nClaw: +4");
    // a tier-0 caller with an authored rung 0 passes it as the description: the lie wears the
    // pass shape byte for byte (header + description), so the card cannot say "this was a miss"
    eq(composeReveal({ ...parts, tier: 0, description: "Probably a lost child." }),
       "— Studied (Religion) —\nProbably a lost child.");
  });

  t("ledger: TOLD is not ROLLED — Number(null) must never become 0", () => {
    /*
     * The third sighting of this trap, and the reason it is now one guard for the whole file.
     * `Number(null)` is 0 and 0 is finite, so `Number.isFinite(Number(v)) ? … : null` turns "no
     * value" into "zero". In the belief ledger that made a kind the GM *told* a character about
     * read as **"rolled 0"** — a false statement in the record whose only job is telling the GM
     * what actually happened.
     */
    const told = readBeliefs({ c1: { kind: { text: "it is a shadow", tier: 25, total: null, when: 5, delivered: 5 } } });
    eq(told.c1.kind.total, null, "told, not rolled");
    const rolled = readBeliefs({ c1: { kind: { text: "x", tier: 25, total: 0, when: 5 } } });
    eq(rolled.c1.kind.total, 0, "an actual zero survives — it is a real total");
    eq(readBeliefs({ c1: { kind: { text: "x", total: "17" } } }).c1.kind.total, null, "a string is not a total");
    eq(readBeliefs({ c1: { kind: { text: "x", total: 17 } } }).c1.kind.total, 17);
    // and the same guard on the attribute plane
    eq(readAttrBeliefs({ "a:b:c": { text: "x", total: null } })["a:b:c"].total, null);
    eq(readAttrBeliefs({ "a:b:c": { text: "x", total: 0 } })["a:b:c"].total, 0);
    // "never delivered" must not read as the epoch
    eq(readBeliefs({ c1: { kind: { text: "x", delivered: 0 } } }).c1.kind.delivered, null);
    eq(readBeliefs({ c1: { kind: { text: "x", delivered: null } } }).c1.kind.delivered, null);
  });

  t("authored tiers: one rung covers everything above it — rolling well must not lose the GM's voice", () => {
    /*
     * Exact matching meant a tier-15 line authored for a Red Dragon vanished on a 25, dropping the
     * player back to the derived sourcebook prose: the better they rolled, the less of the GM's
     * world they saw. Higher rungs ADD traits and attacks on top of the authored voice; they never
     * replace it.
     */
    const only15 = [{ min: 15, text: "Ashfall line." }];
    eq(authoredTier(only15, 0), "", "a miss is still a miss — nothing is authored below 15 here");
    eq(authoredTier(only15, 15), "Ashfall line.");
    eq(authoredTier(only15, 20), "Ashfall line.", "a better roll keeps the authored text");
    eq(authoredTier(only15, 25), "Ashfall line.");

    const both = [{ min: 15, text: "Ashfall line." }, { min: 25, text: "…and you know its name." }];
    eq(authoredTier(both, 20), "Ashfall line.", "the highest rung AT OR BELOW the roll");
    eq(authoredTier(both, 25), "…and you know its name.");

    eq(authoredTier([], 25), "");
    eq(authoredTier(null, 25), "");
  });

  t("tiers: rung 0 is the FAILURE case and never carries into a success", () => {
    /*
     * Joe's framing, and the one that makes the ladder legible: the low rung is **false or
     * nothing**, the high rungs are **true**. Same shape as a lore row's `miss` and an attribute's
     * `miss`, so all three axes say "what they get when they fail" in the same place.
     *
     * ⚠ This corrects the carry-upward rule written one step earlier, which let a tier-0 line bleed
     * into tier 15 — handing the player the **lie as the reward for rolling well**, the precise
     * inversion of what it is for.
     */
    const both = [
      { min: 0, text: "A carrion bird. Nothing worth the walk." },
      { min: 15, text: "The Ashfall dead, and they remember the fire." }
    ];
    eq(authoredTier(both, 0), "A carrion bird. Nothing worth the walk.");
    eq(authoredTier(both, 15), "The Ashfall dead, and they remember the fire.");
    eq(authoredTier(both, 20), "The Ashfall dead, and they remember the fire.");
    eq(authoredTier(both, 25), "The Ashfall dead, and they remember the fire.");

    // a lie with no authored truth: the miss lies, every success falls through to the book
    const lieOnly = [{ min: 0, text: "A carrion bird." }];
    eq(authoredTier(lieOnly, 0), "A carrion bird.");
    eq(authoredTier(lieOnly, 15), "", "the failure line must not surface on a success");
    eq(authoredTier(lieOnly, 25), "");

    // truth with no lie: the miss is the generic "you have never heard of this"
    const truthOnly = [{ min: 15, text: "The Ashfall dead." }];
    eq(authoredTier(truthOnly, 0), "");
    eq(authoredTier(truthOnly, 15), "The Ashfall dead.");

    // a 20 authored alone still does not reach down to 15
    eq(authoredTier([{ min: 20, text: "A dragon." }], 15), "");
    eq(authoredTier([{ min: 20, text: "A dragon." }], 20), "A dragon.");
  });

  t("hidden: an entry is tucked away, never destroyed — and it survives the notes round trip", () => {
    /*
     * Joe's rule, replacing deletion outright: *"they are welcome to hide, there's a show hidden
     * button so they can restore if they must. Never deleted so I'm never asked to recover a
     * link."* Which makes `hidden` exactly the kind of field the `toStoredKnown` trap eats — so
     * it goes through the reader AND the writer in one commit, like `imposter` before it.
     */
    eq(toStoredKnown([{ id: "a", cachedName: "A", hidden: true }])[0].hidden, true);
    eq(toStoredKnown([{ id: "a", cachedName: "A" }])[0].hidden, false);
    eq(toStoredKnown([{ id: "a", cachedName: "A", hidden: "yes" }])[0].hidden, false, "only a real boolean hides");
    eq(readKnown([{ id: "a", name: "A", hidden: true }], { resolve: () => null })[0].hidden, true);

    // THE ERASURE CHECK for this field: editing notes must not un-hide anything
    let rows = toStoredKnown([
      { id: "a", cachedName: "A", hidden: true, notes: "" },
      { id: "b", cachedName: "B", notes: "" }
    ]);
    rows = toStoredKnown(rows.map(e => ({ ...e, notes: "typed something" })));
    eq(rows.map(e => `${e.id}:${e.hidden}`), ["a:true", "b:false"]);
    // and a hidden entry keeps everything else it had
    const kept = toStoredKnown([{ id: "a", cachedName: "A", hidden: true, notes: "mine", imposter: 9, when: 3 }])[0];
    eq(kept, { id: "a", name: "A", category: "sentient", notes: "mine", imposter: 9, hidden: true, when: 3 });
  });

  const WORLD = [
    { id: "city", title: "Greyharbour", secret: true },
    { id: "under", title: "The Undercity", parent: "city", secret: true },
    { id: "docks", title: "The Docks", parent: "city", secret: true },
    { id: "guild", title: "The Quiet Hand", parent: "under", secret: true },
    { id: "lung", title: "Forge Lung", secret: true }
  ];

  t("tree: children, subtrees and a forest of roots", () => {
    eq(childrenOf("city", WORLD).map(c => c.id).sort(), ["docks", "under"]);
    eq(childrenOf("guild", WORLD), []);
    eq(childrenOf("nosuch", WORLD), []);

    const city = subtreeOf("city", WORLD);
    eq(city.title, "Greyharbour");
    eq(city.children.map(c => c.title), ["The Docks", "The Undercity"], "sorted by title");
    eq(city.children.find(c => c.id === "under").children.map(c => c.id), ["guild"]);
    eq(city.depth, 0);
    eq(city.children[0].depth, 1);

    // roots only, and an orphan whose parent was deleted counts as one
    eq(forestOf(WORLD).map(n => n.id), ["lung", "city"].sort((a, b) =>
      WORLD.find(x => x.id === a).title.localeCompare(WORLD.find(x => x.id === b).title)));
    eq(forestOf([{ id: "orphan", title: "O", parent: "deleted" }]).map(n => n.id), ["orphan"]);
    eq(subtreeOf("nosuch", WORLD), null);
  });

  t("tree: a hand-written cycle terminates instead of hanging the browser", () => {
    /*
     * Nothing refuses a cycle at write time (see `ancestorsOf`), so the browser has to survive
     * one. A view that recurses forever is worse than one that stops early.
     */
    const cyclic = [{ id: "a", title: "A", parent: "b" }, { id: "b", title: "B", parent: "a" }];
    const node = subtreeOf("a", cyclic);
    ok(!!node, "still returns something");
    let depth = 0, cur = node;
    while (cur?.children?.length) { cur = cur.children[0]; depth++; }
    ok(depth <= 13, `walk terminated at depth ${depth}`);
  });

  t("tree: art is injected too, so the pure layer holds no VTT paths", () => {
    // an entry may legitimately carry no icon; the client half fills it from the category
    const bare = [{ id: "x", title: "X", category: "guild" }, { id: "y", title: "Y", parent: "x", icon: "mine.webp" }];
    const node = subtreeOf("x", bare, { icon: e => e.icon || `art/${e.category}.webp` });
    eq(node.icon, "art/guild.webp", "filled from the category");
    eq(node.children[0].icon, "mine.webp", "a chosen icon is never overwritten");
    eq(subtreeOf("x", bare).icon, null, "no resolver means the entry's own value, untouched");
  });

  t("tree: state is injected, so the pure layer never decides who knows what", () => {
    const known = new Set(["city", "guild"]);
    const node = subtreeOf("city", WORLD, { state: id => (known.has(id) ? "known" : "unknown") });
    eq(node.state, "known");
    eq(node.children.find(c => c.id === "docks").state, "unknown");
    eq(node.children.find(c => c.id === "under").children[0].state, "known");
    eq(subtreeOf("city", WORLD).state, null, "no state function means no state");
  });

  t("tree: a node kept without its parent is re-rooted, never propped on a placeholder", () => {
    /*
     * The GM told them about the guild and nothing else. Their map must not draw the city or the
     * district above it — those names ARE the knowledge they were not given. The guild rises to
     * stand beside whatever else they do know.
     */
    const known = new Set(["guild", "lung"]);
    const forest = forestOf(WORLD, { state: id => (known.has(id) ? "known" : "unknown") });
    const mine = contractForest(forest, n => n.state === "known");
    eq(mine.map(n => n.id), ["lung", "guild"], "both roots, sorted by title");
    eq(mine.every(n => n.children.length === 0), true, "nothing unknown came along");
    eq(mine.every(n => n.depth === 0), true, "depth is re-stamped for the tree actually drawn");
    // and the city and district appear nowhere in the payload at all, not even hidden
    ok(!JSON.stringify(mine).includes("Undercity"), "the district name never reaches the render payload");
    ok(!JSON.stringify(mine).includes("Greyharbour"), "nor the city name (see the console caveat in attributes.md)");
  });

  t("tree: a gap in the middle unparents the child — it does NOT re-home under the grandparent", () => {
    /*
     * They were told about Greyharbour and about the Quiet Hand, but never about the Undercity
     * between them. Drawing the guild inside the city would assert a containment nobody granted —
     * and assert it wrongly, since it is two levels down. It stands on its own instead.
     */
    const known = new Set(["city", "guild"]);
    const forest = forestOf(WORLD, { state: id => (known.has(id) ? "known" : "unknown") });
    const mine = contractForest(forest, n => n.state === "known");
    eq(mine.map(n => n.id), ["city", "guild"], "two roots, not one nesting the other");
    eq(mine.every(n => n.children.length === 0), true, "and no invented edge between them");
    eq(mine.every(n => n.depth === 0), true);
  });

  t("tree: an edge survives only when BOTH ends and the link between them are known", () => {
    const known = new Set(["city", "under", "guild"]); // the whole chain
    const forest = forestOf(WORLD, { state: id => (known.has(id) ? "known" : "unknown") });
    const mine = contractForest(forest, n => n.state === "known");
    eq(mine.map(n => n.id), ["city"], "one root");
    eq(mine[0].children.map(n => n.id), ["under"]);
    eq(mine[0].children[0].children.map(n => n.id), ["guild"], "nested the way the world is");
    eq(mine[0].children[0].children[0].depth, 2, "depth re-stamped for the tree drawn");
  });

  t("source: the blob is the identity and the path is a label", () => {
    const good = { blob: "41bcd52af97a0a9bcdee302cda9e2c165df7ef0d", path: "world/factions/a/gray-district.md" };
    eq(clampSource(good), good);
    eq(clampSource({ path: "world/a.md" }), { blob: null, path: "world/a.md" }, "no version yet is legal");
    eq(clampSource(null), null);
    eq(clampSource("world/a.md"), null, "a bare string is not a source record");
    eq(clampSource({ path: "   " }), null);
    eq(clampSource({ blob: "41bcd52a" }), null, "a hash with nowhere to point is not a record");
    eq(clampSource({ path: "world\\factions\\a.md" }).path, "world/factions/a.md", "separators normalise");
    // `commit` was dropped: a committed blob reconstructs it via `git log --find-object`
    ok(!("commit" in clampSource(good)), "no commit field");
  });

  t("source: a path that could escape the repo is refused outright", () => {
    /*
     * ⚠ Not pedantry: a generator turns this string into a WRITE TARGET, so an absolute path or a
     * `..` segment out of a hand-edited setting is a write outside the vault.
     */
    eq(clampSource({ path: "/etc/passwd" }), null, "absolute");
    eq(clampSource({ path: "C:/windows/system32" }), null, "windows absolute");
    eq(clampSource({ path: "../../.ssh/id_rsa" }), null, "climbing out");
    eq(clampSource({ path: "world/../../secrets.md" }), null, "climbing out mid-path");
    eq(clampSource({ path: "world//a.md" }), null, "empty segment");
  });

  t("source: a malformed hash invalidates the whole record, never just itself", () => {
    // a half-record must not survive claiming provenance it has lost
    eq(clampSource({ path: "world/a.md", blob: "zzzz" }), null);
    eq(clampSource({ path: "world/a.md", blob: 42 }), null);
    eq(clampSource({ path: "world/a.md", blob: "abc" }), null, "too short to be a git hash");
    eq(clampSource({ path: "world/a.md", blob: null }).path, "world/a.md", "absent is fine");
  });

  t("source: survives a patch to an unrelated field — the regression `advantage` never had", () => {
    /*
     * `clampAttribute` returns an explicit literal and every write is routed back through it, so a
     * field missing from that literal is erased on the next edit of ANY field on ANY entry. That is
     * exactly how `advantage` became a corpse: written by two call sites, read by the summary to
     * draw an icon, and silently dropped in between.
     */
    const src = { blob: "41bcd52af97a0a9bcdee302cda9e2c165df7ef0d", path: "world/factions/a/gray-district.md" };
    const entry = clampAttribute({ id: "graydistrict", title: "The Gray District", source: src });
    eq(entry.source, src, "it survives the clamp at all");

    const edited = clampAttribute({ ...entry, dc: 18 });
    eq(edited.source, src, "and survives an unrelated edit");
    eq(edited.dc, 18);

    const [stored] = readRegistry([edited]);
    eq(stored.source, src, "and a whole-registry round trip");
  });

  t("source: a patch replaces the object whole rather than merging into it", () => {
    // a changed path is a different file; a hash carried across would assert provenance nothing
    // checked. `updateAttribute`'s shallow spread makes this the behaviour — the test pins it.
    const entry = clampAttribute({ id: "a", title: "A", source: { path: "world/old.md", blob: "aaaaaaa" } });
    const moved = clampAttribute({ ...entry, source: { path: "world/new.md" } });
    eq(moved.source, { blob: null, path: "world/new.md" }, "the old hash does not ride along");
    eq(clampAttribute({ ...entry, source: null }).source, null, "and it can be cleared");
  });

  t("tree: a cycle in the registry is promoted to a root, never silently vanished", () => {
    /*
     * A root used to mean "no parent, or a parent that is not in the registry" — but every member
     * of a loop HAS a parent that is in the registry, so the loop and everything under it dropped
     * out of the browser entirely while search and the ledger went on believing in them. Silence
     * is the failure mode this module has been bitten by most.
     */
    const looped = [
      { id: "a", title: "A", parent: "b" },
      { id: "b", title: "B", parent: "a" },
      { id: "c", title: "C", parent: "a" },
      { id: "free", title: "Free" }
    ];
    const ids = forestOf(looped).map(n => n.id);
    ok(ids.includes("free"), "the honest root is still a root");
    ok(ids.includes("a") || ids.includes("b"), "the loop surfaces instead of disappearing");
    const flat = new Set();
    const walk = n => { flat.add(n.id); n.children.forEach(walk); };
    forestOf(looped).forEach(walk);
    eq([...flat].sort(), ["a", "b", "c", "free"], "every entry is reachable somewhere in the forest");
  });

  t("tree: a world far deeper than three levels is drawn whole", () => {
    /*
     * Joe: "can be much deeper than 3 in some cases." Realm → kingdom → region → city → quarter →
     * district → street → house → household → order → cell is eleven before anyone is being
     * unreasonable, and an earlier cap of 12 amputated the next level in silence.
     */
    const deep = Array.from({ length: 24 }, (_, i) => ({
      id: `n${i}`, title: `Level ${String(i).padStart(2, "0")}`, secret: true, parent: i ? `n${i - 1}` : ""
    }));
    let node = forestOf(deep)[0];
    let seen = 0;
    while (node) { seen++; node = node.children[0]; }
    eq(seen, 24, "every level survives the walk");

    // and the contracted view keeps the chain, re-stamping depth as it goes
    const known = new Set(deep.map(e => e.id));
    const mine = contractForest(forestOf(deep, { state: id => (known.has(id) ? "known" : "unknown") }), n => n.state === "known");
    let cur = mine[0];
    let depth = 0;
    while (cur.children.length) { cur = cur.children[0]; depth++; }
    eq(depth, 23);
    eq(cur.depth, 23, "depth is the drawn depth, not the registry's");
    ok(TREE_DEPTH_MAX >= 64, `runaway backstop is well clear of real worlds (got ${TREE_DEPTH_MAX})`);
  });

  t("tree: past the runaway backstop a branch stops, and a cycle stops on its own", () => {
    const tooDeep = Array.from({ length: TREE_DEPTH_MAX + 4 }, (_, i) => ({
      id: `d${i}`, title: `D${i}`, parent: i ? `d${i - 1}` : ""
    }));
    let node = forestOf(tooDeep)[0];
    let seen = 0;
    while (node) { seen++; node = node.children[0]; }
    eq(seen, TREE_DEPTH_MAX + 1, "stops at the cap rather than running away");

    // the seen-set, not the cap, is what makes a loop terminate — it must hold at any cap
    const loop = [{ id: "a", title: "A", parent: "b" }, { id: "b", title: "B", parent: "a" }];
    let cur = subtreeOf("a", loop);
    let n = 0;
    while (cur) { n++; cur = cur.children[0]; }
    eq(n, 2, "a two-node cycle draws each node once");
  });

  t("tree: contracting everything away leaves an empty forest, not a shell", () => {
    const forest = forestOf(WORLD, { state: () => "unknown" });
    eq(contractForest(forest, n => n.state === "known"), []);
    eq(contractForest(undefined, () => true), []);
    eq(contractForest(forest).length, 2, "no predicate keeps the forest whole");
  });

  t("cap: a Monster Manual lore page is cut on a word boundary and marked as cut", () => {
    eq(capProse("short enough"), "short enough");
    const long = "word ".repeat(400).trim();
    const cut = capProse(long);
    ok(cut.length <= DERIVED_PROSE_MAX + 1, `got ${cut.length}`);
    ok(cut.endsWith("…"), "a truncation must read as deliberate");
    ok(!/ …$/.test(cut), "no dangling space before the ellipsis");
    eq(capProse("aaaa bbbb cccc dddd", 12), "aaaa bbbb…"); // cut back to the word boundary
    eq(capProse("aaaa bbbb, cccc", 11), "aaaa bbbb…"); // the comma left dangling goes with it
    eq(capProse("abcdefghij", 5), "abcde…"); // no boundary worth having: cut mid-word rather than lose the line
    eq(capProse(null), "");
    eq(capProse(undefined), "");
  });

  t("rungs: the ladder is 25/20/15/0, high to low — the order authors and grader share", () => {
    eq(STUDY_RUNGS, [25, 20, 15, 0]);
  });

  /* ── the Look window's list: factOrder / factKeyOf ─────────────────── */

  const LOOK_REG = [
    { id: "a", title: "A", secret: true, reveal: "in A", lore: [{ id: "la1", label: "A one", text: "a1" }, { id: "la2", label: "A two", text: "a2" }] },
    { id: "b", parent: "a", secret: true, reveal: "in B" },
    { id: "c", parent: "b", secret: true, reveal: "in C", lore: [{ id: "lc1", label: "C one", text: "c1" }] },
    { id: "open", title: "Open", secret: false, lore: [{ id: "lo1", label: "Open one", text: "o1" }] },
    { id: "species:human", title: "Human", secret: true, reveal: "human", lore: [{ id: "lh1", label: "Origin", text: "h" }] }
  ];
  const OWN = [{ id: "own1", label: "Mine", text: "m1" }, { id: "draft", label: "Draft" }, { id: "own2", label: "Mine 2", miss: "x" }];

  t("factOrder: a secret ladder A→B→C carried as A and C only gives rungs [A, C], C's parent A", () => {
    const ids = factOrder({ subjectId: "npc", carried: ["c", "a"], registry: LOOK_REG }).filter(x => x.group === "ident");
    eq(ids.map(x => x.attrId), ["a", "c"]);
    eq(ids.map(x => x.parentId), [null, "a"]);
    eq(ids.map(x => x.key), ["attr:a:#id", "attr:c:#id"]);
  });

  t("factOrder: a visible attribute is no rung, but its lore rows are listed", () => {
    const f = factOrder({ subjectId: "npc", carried: ["open"], registry: LOOK_REG });
    eq(f.filter(x => x.group === "ident"), []);
    eq(f.filter(x => x.group === "attr").map(x => [x.attrId, x.factId, x.secret]), [["open", "lo1", false]]);
  });

  t("factOrder: groups in ladder order — ident, attr (carried then row), own lore, kind last once", () => {
    const f = factOrder({ subjectId: "npc", kindId: "goblin", carried: ["c", "open", "a"], registry: LOOK_REG, lore: OWN });
    eq(f.map(x => x.group), ["ident", "ident", "attr", "attr", "attr", "attr", "lore", "lore", "kind"]);
    eq(f.filter(x => x.group === "attr").map(x => x.factId), ["lc1", "lo1", "la1", "la2"]);
    eq(f.filter(x => x.group === "lore").map(x => x.key), ["lore:npc:own1", "lore:npc:own2"], "the draft row is excluded");
    eq(f.filter(x => x.group === "kind").map(x => x.key), ["kind:goblin"]);
    eq(factOrder({ subjectId: "npc", kindId: null, carried: ["a"], registry: LOOK_REG }).some(x => x.group === "kind"), false);
  });

  t("factOrder: ids and keys only — no authored words, DCs or skills ride along", () => {
    const f = factOrder({ subjectId: "npc", kindId: "k", carried: ["a", "c", "open"], registry: LOOK_REG, lore: OWN });
    for (const x of f) for (const bad of ["reveal", "miss", "text", "dc", "skill", "title"]) ok(!(bad in x), `${x.key} carries ${bad}`);
  });

  t("factOrder: a derived id with a colon round-trips through parseFactKey", () => {
    const f = factOrder({ subjectId: "npc", carried: ["species:human"], registry: LOOK_REG });
    eq(f.map(x => x.key), ["attr:species:human:#id", "attr:species:human:lh1"]);
    eq(f.map(x => parseFactKey(x.key)?.subject), ["species:human", "species:human"]);
    eq(parseFactKey(f[1].key).fact, "lh1");
  });

  t("factOrder: junk input is an empty list, never a throw", () => {
    eq(factOrder(), []);
    eq(factOrder({ carried: null, registry: "x", lore: 3 }), []);
  });

  t("factKeyOf: the four literal keys shareKeyOf wrote before the refactor", () => {
    eq(factKeyOf({ ns: "ident", attrId: "guild" }), "attr:guild:#id");
    eq(factKeyOf({ ns: "attr", attrId: "guild", factId: "f1" }), "attr:guild:f1");
    eq(factKeyOf({ ns: "lore", subjectId: "npc", factId: "f2" }), "lore:npc:f2");
    eq(factKeyOf({ ns: "kind" }, "goblin"), "kind:goblin");
    eq(factKeyOf({ ns: "kind" }, ""), "kind:");
    eq(factKeyOf({ ns: "mask" }), null);
  });

  t("study: studyDescription — a failure says NOTHING unless rung 0 is authored", () => {
    const none = "You place it, but nothing you could set down in words.";
    // tier 0, nothing authored: no card at all (the generic "means nothing to you" card is gone)
    eq(studyDescription({ authored: "", derived: "A goblin.", tier: 0, none }), "");
    eq(studyDescription({ tier: 0 }), "");
    // the derived truth never leaks below 15, and neither does `none`
    eq(studyDescription({ derived: "A goblin.", tier: 0, none }), "");
    // rung 0 authored: the one lie still delivered
    const tiers = [{ min: 0, text: "Probably a lost child." }, { min: 15, text: "A goblin scout." }];
    eq(studyDescription({ authored: authoredTier(tiers, 0), derived: "A goblin.", tier: 0, none }), "Probably a lost child.");
    // 15+: authored wins, then derived, then `none` — a pass always says something
    eq(studyDescription({ authored: authoredTier(tiers, 15), derived: "A goblin.", tier: 15, none }), "A goblin scout.");
    eq(studyDescription({ authored: "", derived: "A goblin.", tier: 20, none }), "A goblin.");
    eq(studyDescription({ authored: "", derived: "  ", tier: 25, none }), none);
    // rung 0 never carries upward: a 15 with only rung 0 authored gets the truth, not the lie
    const onlyLie = [{ min: 0, text: "Probably a lost child." }];
    eq(studyDescription({ authored: authoredTier(onlyLie, 15), derived: "A goblin.", tier: 15, none }), "A goblin.");
    eq(studyDescription({ authored: authoredTier(onlyLie, 25), derived: "", tier: 25, none }), none);
  });

  /* ── empty tiers leave no trace (Joe, 2026-10) ────────────────────────────── */

  t("blank: whitespace, nbsp, zero-width and empty markup are all blank", () => {
    for (const v of [undefined, null, 0, "", "   ", "\n\t", "&nbsp;", " &nbsp; ", "\u00a0", "\u200b", "<p></p>", "<p><br></p>",
      "<p>&nbsp;</p>", "<div> </div>", "<p><strong></strong></p>", "<P class=\"x\"> </P>", "<!-- todo -->", "<br/><br />", "<ul><li></li></ul>"])
      ok(isBlankProse(v), `expected blank: ${JSON.stringify(v)}`);
  });

  t("blank: any visible character is content — including text in angle brackets", () => {
    for (const v of ["a", " x ", "<p>Starved.</p>", "<em>.</em>", "<the name is scratched out>", "1 < 2", "&amp;", "—"])
      ok(!isBlankProse(v), `expected content: ${JSON.stringify(v)}`);
  });

  t("blank: an empty-HTML grant is not a grant, so no card and no section header renders", () => {
    const g = readGranted({
      "lore:a:x": { text: "<p></p>", when: 1, source: "Starved" },
      "lore:a:y": { text: "<p>&nbsp;</p>", when: 1, source: "The veins" },
      "lore:a:z": { text: "Still counting guards.", when: 1, source: "Still thinking" }
    });
    eq(Object.keys(g), ["lore:a:z"]);
    // nothing but blanks → the join is empty, which is what every `if (!grants.length) return ""` guards on
    eq(grantsForEntry({ "lore:a:x": { text: "<p><br></p>", when: 1 } }, "a").length, 0);
  });

  t("blank: a lore row whose pass text is empty HTML is silent on a pass, and never offered", () => {
    const row = { id: "s", label: "Starved", skill: "med", dc: 10, text: "<p></p>", miss: "Weeks at most." };
    eq(loreOutcome(row, 20), { pass: true, text: "", silent: true });
    eq(loreOutcome(row, 5), { pass: false, text: "Weeks at most.", silent: false }, "the failure side is written: ");
    eq(loreOutcome({ ...row, miss: "<p> </p>" }, 5), { pass: false, text: "", silent: true }, "blank failure HTML → nothing: ");
    eq(loreOfferable(row), false, "a pass would buy an empty box: ");
    eq(loreRollable(row), true, "still resolvable for Share/Forget off its GM note: ");
    eq(loreRollable({ ...row, miss: "<p> </p>" }), false, "nothing on either side: ");
  });

  t("blank: the Starved shape — a failed check hands over the failure line, a pass the text", () => {
    const row = { id: "s", label: "Starved", skill: "med", dc: 10, hold: false,
      text: "Collarbones, wrists, cracked lips.", miss: "Weeks at most. He was thin before." };
    eq(loreOutcome(row, 8), { pass: false, text: "Weeks at most. He was thin before.", silent: false }, "total 8 vs DC 10: ");
    eq(loreOutcome(row, 10), { pass: true, text: "Collarbones, wrists, cracked lips.", silent: false });
    // the failure line never carries the pass text, and the pass never carries the failure line
    ok(!loreOutcome(row, 8).text.includes("Collarbones"), "fail shows no pass text");
    ok(!loreOutcome(row, 10).text.includes("Weeks"), "pass shows no failure text");
    // empty failure line → the old silent failure, untouched
    eq(loreOutcome({ ...row, miss: "" }, 8), { pass: false, text: "", silent: true }, "empty miss: ");
  });

  t("identMissKey: a lore-namespace key on the subject, parseable, dot- and colon-safe", () => {
    eq(identMissKey("IxcfWOvpcKID6bdn", "vrinn"), "lore:IxcfWOvpcKID6bdn:#idmiss-vrinn");
    const k = identMissKey("a1", "species:human.elf");
    ok(!k.slice("lore:a1:".length).includes(":"), "no colon in the fact segment");
    ok(!k.includes("."), "no dot anywhere — Foundry would nest it");
    eq(parseFactKey(k), { ns: "lore", subject: "a1", fact: "#idmiss-species%3Ahuman%2Eelf" });
    ok(k !== identifiedKey("species:human.elf"), "never the ident key");
    // it joins on the SUBJECT's Known page, not through the attribute (which a failure never identified)
    const g = grantsForEntry({ [k]: { text: "Seems a pilgrim.", when: 1, source: "Brother Aldo" } }, "a1");
    eq(g.map(x => x.text), ["Seems a pilgrim."]);
    eq(grantsForEntry({ [k]: { text: "Seems a pilgrim.", when: 1 } }, "", { attributeIds: ["species:human.elf"] }), [], "not under the attribute: ");
  });

  t("blank: an empty-HTML authored rung is not authored — the truth falls through, a failure stays silent", () => {
    const tiers = readStudyTiers([{ min: 0, text: "<p></p>" }, { min: 15, text: "<p>&nbsp;</p>" }, { min: 25, text: "Real." }]);
    eq(tiers, [{ min: 25, text: "Real." }]);
    const none = "You place it.";
    eq(studyDescription({ authored: "<p></p>", derived: "A goblin.", tier: 15, none }), "A goblin.");
    eq(studyDescription({ authored: "<p></p>", derived: "A goblin.", tier: 0, none }), "");
    eq(studyDescription({ authored: "", derived: "<p></p>", tier: 15, none }), none);
  });

  t("blank: a reveal with no body is \"\" — the header never renders over nothing", () => {
    const header = "— Studied (Nature) —";
    eq(composeReveal({ tier: 0, header, description: "<p></p>" }), "");
    eq(composeReveal({ tier: 15, header, description: "   ", traits: "Immune: fire." }), "", "traits are gated at 20: ");
    eq(composeReveal({ tier: 20, header, description: "", traits: "Immune: fire." }), `${header}\nImmune: fire.`);
    eq(composeReveal({ tier: 25, header, description: "", traits: "", attacks: ["<p></p>", "Bite"] }), `${header}\nBite`);
  });
}

/* ── standalone harness ───────────────────────────────────────────────────── */

export function main() {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const verbose = process.argv.includes("-v");

  const t = (name, fn) => {
    try {
      fn();
      pass++;
      if (verbose) console.log(`  ✓ ${name}`);
    } catch (err) {
      fail++;
      failures.push({ name, message: err.message });
      console.log(`  ✗ ${name}\n      ${err.message}`);
    }
  };
  const eq = (actual, expected, what = "") => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${what}expected ${e}, got ${a}`);
  };
  const ok = (cond, what) => {
    if (!cond) throw new Error(what || "expected truthy");
  };

  register({ t, eq, ok });
  console.log(`\nknown-core: ${pass} passed, ${fail} failed`);
  if (fail) for (const f of failures) console.log(`  · ${f.name}: ${f.message}`);
  return fail;
}

// run when invoked directly; stay silent when a shared runner imports `register`
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(main());
