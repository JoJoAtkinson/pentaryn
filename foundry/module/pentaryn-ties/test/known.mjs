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
  kindHasContent,
  readStudied,
  readBeliefs,
  mayStudy,
  holdResolved,
  hasUnresolvedEnricher,
  flattenHTML,
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
  LORE_DC_MIN,
  LORE_DC_MAX,
  LORE_TEXT_MAX,
  attrIdOf,
  derivedNamespace,
  clampAttribute,
  clampSource,
  readRegistry,
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
  identifiedState,
  visibleAttributesFor,
  planStep,
  forestOf,
  subtreeOf,
  contractForest,
  TREE_DEPTH_MAX,
  childrenOf,
  helpFor,
  clampSources
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
    eq(composeReveal({ tier: 25, header: "— Studied (Nature) —", description: "", traits: "", attacks: [] }), "— Studied (Nature) —");
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
    eq(loreOutcome(row, 14), { pass: false, text: "a rumour", silent: false });
    // null total = no roll evaluated. Grading this as a failure would spend the one attempt
    // on a mis-click — the same trap `tierOf` refuses.
    eq(loreOutcome(row, null), null);
    eq(loreOutcome(row, undefined), null);
    eq(loreOutcome(row, "nope"), null);
    eq(loreOutcome(null, 20), null);
  });

  t("lore: an unauthored side is SILENT, and silence is flagged rather than hidden", () => {
    // decision 8's amendment: under blind rolls a row with no miss text leaks failure by
    // silence. The conduit still writes the lock and posts the stub; `silent` tells it to
    // skip only the grant, so the observable difference is prose, never a missing card.
    const noMiss = { id: "x", label: "L", dc: 15, text: "the truth" };
    eq(loreOutcome(noMiss, 10), { pass: false, text: "", silent: true });
    eq(loreOutcome(noMiss, 20).silent, false);
    const noText = { id: "x", label: "L", dc: 15, miss: "a rumour" };
    eq(loreOutcome(noText, 20), { pass: true, text: "", silent: true });
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
     * This fixture pins the composer's half; the conduit's half is the `tier >= 15` gate there.
     */
    const parts = { header: "— Studied (Religion) —", description: "It is a shadow.", traits: "Immune: Necrotic.", attacks: ["Claw: +4"] };
    eq(composeReveal({ ...parts, tier: 0 }), "— Studied (Religion) —\nIt is a shadow.");
    eq(composeReveal({ ...parts, tier: 15 }), "— Studied (Religion) —\nIt is a shadow.");
    eq(composeReveal({ ...parts, tier: 20 }), "— Studied (Religion) —\nIt is a shadow.\nImmune: Necrotic.");
    eq(composeReveal({ ...parts, tier: 25 }), "— Studied (Religion) —\nIt is a shadow.\nImmune: Necrotic.\nClaw: +4");
    // a tier-0 caller passes NO description, which is what makes the bottom rung mean anything
    eq(composeReveal({ ...parts, tier: 0, description: "Nothing about it means anything to you." }),
       "— Studied (Religion) —\nNothing about it means anything to you.");
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

  t("source: a well-formed record round-trips, and junk becomes null", () => {
    const good = { path: "world/factions/ardenhaven/gray-district.md", blob: "9f3c1a2b", commit: "d9fb63b" };
    eq(clampSource(good), good);
    eq(clampSource({ path: "world/a.md" }), { path: "world/a.md", blob: null, commit: null });
    eq(clampSource(null), null);
    eq(clampSource("world/a.md"), null, "a bare string is not a source record");
    eq(clampSource({ path: "   " }), null);
    eq(clampSource({ path: "world\\factions\\a.md" }).path, "world/factions/a.md", "separators normalise");
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
    eq(clampSource({ path: "world/a.md", commit: 42 }), null);
    eq(clampSource({ path: "world/a.md", blob: null, commit: null }).path, "world/a.md", "absent is fine");
  });

  t("source: survives a patch to an unrelated field — the regression `advantage` never had", () => {
    /*
     * `clampAttribute` returns an explicit literal and every write is routed back through it, so a
     * field missing from that literal is erased on the next edit of ANY field on ANY entry. That is
     * exactly how `advantage` became a corpse: written by two call sites, read by the summary to
     * draw an icon, and silently dropped in between.
     */
    const src = { path: "world/factions/ardenhaven/gray-district.md", blob: "9f3c1a2b", commit: null };
    const entry = clampAttribute({ id: "graydistrict", title: "The Gray District", source: src });
    eq(entry.source, src, "it survives the clamp at all");

    // now the thing that actually broke: edit something else and read it back
    const edited = clampAttribute({ ...entry, dc: 18 });
    eq(edited.source, src, "and survives an unrelated edit");
    eq(edited.dc, 18);

    // and a round trip through the registry reader, which every save goes through
    const [stored] = readRegistry([edited]);
    eq(stored.source, src, "and a whole-registry round trip");
  });

  t("source: a patch replaces the object whole rather than merging into it", () => {
    // a changed path is a different file; a hash carried across would assert provenance nothing
    // checked. `updateAttribute`'s shallow spread makes this the behaviour — the test pins it.
    const entry = clampAttribute({ id: "a", title: "A", source: { path: "world/old.md", blob: "aaaa" } });
    const moved = clampAttribute({ ...entry, source: { path: "world/new.md" } });
    eq(moved.source, { path: "world/new.md", blob: null, commit: null }, "the old hash does not ride along");
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
