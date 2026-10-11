/**
 * Pentaryn NPC Ties — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and the implementations drift.
 *
 * One row per published path of game.pentaryn.ties (ties-7). Every row that existed before the kit
 * API is `legacy: true`: its signature and return shape are the ones it always had — documents in,
 * a miss is null / [] / false rather than a coded throw, and writes answer in their own shape
 * (`returns` says which). The implementations live in api.mjs, or come from a feature's install()
 * when they open a window or touch the canvas (overlay, sheet, token-hud, worn; the entry for the
 * key-9 card).
 *
 * Add a method: a row here + an impl in api.mjs (or a feature contribution) + a fixture in
 * test/api-kit.test.mjs, then GOLDEN_UPDATE=1 node --test test/api-kit.test.mjs and review the diff.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./ties-core.mjs";

const p = (name, type, doc, extra = {}) => ({ name, type, ...(doc ? { doc } : {}), ...extra });
const opt = (name, type, doc) => p(name, type, doc, { optional: true });
const ACTOR = "Actor";
const CHAR = p("character", ACTOR, "a player character");
const SUBJ = p("subject", ACTOR, "the creature or person studied");
const ATTR = p("attr", "string", "an attribute id or title (id wins; a miss is refused, never created)");
const SPEC = p("spec", "{ ns, subjectId, factId?, attrId? }", "one fact: ns kind | lore | attr");
const row = (path, params, returns, doc, { gm = false, writes = false, ...rest } = {}) =>
  ({ path, params, returns, gm, writes, legacy: true, ...rest, doc });

const F = `flags.${MODULE}`;

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  unlisted: ["STANCES"],
  flags: {
    writes: [
      `${F}.ties`, `${F}.known`, `${F}.knownCategories`, `${F}.granted`, `${F}.studied`, `${F}.beliefs`,
      `${F}.kindOf`, `${F}.studyTiers`, `${F}.studyHold`, `${F}.studyOffset`, `${F}.lore`, `${F}.attributes`,
      `${F}.attributesOff`, `${F}.conceal`, `${F}.worn`, `${F}.mark`,
    ],
    reads: ["flags.item-piles.data", "flags.dnd5e.isPolymorphed"],
  },
  rows: [
    /* ── the kit's two optional members ── */
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring; a token reads its world actor" },
        { name: "opts", type: "{ as?, sceneId? }", optional: true, doc: "as: a user ref — answer with what that user may see" },
      ],
      returns: "{ actor, kind, ties, inbound, known, granted, knowledge, attributes, beliefs, studyTiers, lore, conceal }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      since: "0.20.0",
      doc: "Everything ties knows about one actor, plain JSON, depth ≤ 4 (ties-3) — the first call to make. "
        + "A GM sees all of it; for a player (or opts.as a player) the GM plane (inbound, beliefs, kind, studyTiers, lore, conceal) "
        + "is null, and ties / known / granted / knowledge only for an actor they own.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false, since: "0.20.0",
      doc: "Live smoke checks after a sync.",
    },

    /* ── the canvas cards (overlay feature) ── */
    row("show", [], "undefined", "Toggle every tie card for the hovered token (key 8)."),
    row("showAll", [], "undefined", "Same as show."),
    row("showOne", [], "undefined", "Selected token → hovered token: that one card (key 7)."),
    row("cards", [], "undefined", "0.3.0 name for show, kept so old macros work."),
    row("clear", [], "undefined", "Close the transient cards and their wires."),
    row("closeAllCards", [], "undefined", "Close every card, pinned ones included."),

    /* ── the ties ── */
    row("edit", [p("actor", ACTOR)], "Promise<Application>", "Open the standalone ties editor for an actor."),
    row("addTie", [opt("token", "Token", "default: hovered, then the first controlled token")], "Promise<TieDialog|null>",
      "Open the add-a-tie dialog for a token (key 6); null when refused."),
    row("read", [p("actor", ACTOR)], "[{ id, name, img, missing, word, notes, stance, strength }]",
      "This actor's ties, sanitised and sorted. Never throws; [] on a miss.", { nullWhen: "never — [] on a miss" }),
    row("inbound", [p("actor", ACTOR)], "[{ id, name, img, word, notes, stance, strength, mutual }]",
      "Who points AT this actor. GM only (a player gets []).", { gm: true }),
    row("set", [p("actor", ACTOR), p("target", ACTOR), opt("tie", "{ word, notes?, stance, strength }"),
      opt("opts", "{ reciprocal = true, reverseWord, reverseStance, reverseNotes }")], "Promise<boolean>",
      "Create or update one edge and, by default, FORCE-mirror its reverse (word and stance overwritten; notes kept unless reverseNotes). True when either side was written.",
      { writes: true, sideEffects: [`${F}.ties`] }),
    row("setTie", [p("actor", ACTOR), p("target", ACTOR), opt("tie", "{ word, notes?, stance, strength }"), opt("opts", "object")],
      "Promise<boolean>", "Same as set.", { writes: true, sideEffects: [`${F}.ties`] }),
    row("setNotes", [p("actor", ACTOR), p("targetId", "string"), opt("notes", "string")], "Promise<boolean>",
      "Set just the notes on an existing edge; false when the edge is not there.", { writes: true, sideEffects: [`${F}.ties`] }),
    row("remove", [p("actor", ACTOR), p("targetId", "string"), opt("opts", "{ bothWays = true }")], "Promise<boolean>",
      "Remove an edge and (by default) its mirror.", { writes: true, sideEffects: [`${F}.ties`] }),
    row("migrate", [], "Promise<{ moved }>", "GM: move pre-module flags.world.ties onto the module scope (runs at ready).",
      { gm: true, writes: true, sideEffects: [`${F}.ties`, "flags.world.ties"] }),

    /* ── the worn mark (worn feature) ── */
    row("worn", [p("token", "Token")], "{ by, note } | null", "The worn mark on a token; never throws."),
    row("setWorn", [p("token", "Token"), opt("mark", "{ by, note }")], "Promise<boolean>", "GM: set a token's worn mark.",
      { gm: true, writes: true, sideEffects: [`${F}.worn`] }),
    row("clearWorn", [p("token", "Token")], "Promise<boolean>", "GM: clear a token's worn mark.",
      { gm: true, writes: true, sideEffects: [`${F}.worn`] }),
    row("wornDialog", [p("token", "Token")], "Promise<*>", "GM: the worn-mark dialog for a token.", { gm: true }),

    /* ── the description card (key 9) ── */
    row("describeCard", [], "Promise<Actor|null>", "GM: toggle the hovered actor's private description card (key 9). Was `describe` (B1).",
      { gm: true, since: "0.20.0" }),
    row("closeDescription", [], "Promise<void>", "Close the description card."),

    /* ── the Known notebook ── */
    row("known.read", [p("actor", ACTOR)], "[{ id, name, category, notes, when, hidden?, imposter? }]", "The Known list. Never throws."),
    row("known.add", [p("actor", ACTOR), p("target", "Actor|{ id, name }"), opt("opts", "{ now }")], "Promise<entry|null>",
      "File someone; null if already filed.", { writes: true, sideEffects: [`${F}.known`] }),
    row("known.set", [p("actor", ACTOR), p("id", "string"), p("field", "string"), p("value", "*")], "Promise<boolean>",
      "Set one field of a Known entry.", { writes: true, sideEffects: [`${F}.known`] }),
    row("known.hide", [p("actor", ACTOR), p("id", "string"), opt("hidden", "boolean")], "Promise<boolean>",
      "Tuck a Known entry away (true) or put it back (false).", { writes: true, sideEffects: [`${F}.known`] }),
    row("known.purge", [p("actor", ACTOR), p("id", "string")], "Promise<boolean>",
      "Destroy a Known row (nothing in the UI does this).", { writes: true, sideEffects: [`${F}.known`] }),
    row("known.remove", [p("actor", ACTOR), p("id", "string")], "Promise<boolean>", "Same as known.purge.",
      { writes: true, sideEffects: [`${F}.known`] }),
    row("known.categories", [p("actor", ACTOR)], "[{ key, label? }]", "The categories this actor files into."),
    row("known.picker", [p("actor", ACTOR), opt("onAdded", "Function")], "Promise<*>", "Open the Known tab's Add… picker."),
    row("known.file", [opt("token", "Token", "default: hovered")], "Promise<*>", "Key 5: file whoever is hovered and open their page."),
    row("known.open", [p("actor", ACTOR), p("id", "string")], "Promise<*>", "Open one Known entry's page."),
    row("known.notebook", [], "Actor|null", "The notebook this client writes into (selected, assigned or owned character)."),

    /* ── the study conduit ── */
    row("study.state", [CHAR, SUBJ], "{ kind, available, spent, content, … }", "The kind study's state as the sheet draws it."),
    row("study.request", [CHAR, SUBJ], "Promise<boolean>", "Player gesture: ask to study what this is (opens the study dialog)."),
    row("study.as", [CHAR, SUBJ, opt("opts", "{ mode, situational, loreId, attrId }")], "Promise<boolean>",
      "GM: throw a study check by hand (same handler, same writes as a player's request).",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.studied`, `${F}.granted`, `${F}.known`] }),
    row("study.kind", [p("actor", ACTOR)], "Promise<*>", "GM: the kind-pointer picker.", { gm: true }),
    row("study.kindOf", [p("actor", ACTOR), p("kindId", "string|null")], "Promise<boolean>", "GM: point an actor at its kind.",
      { gm: true, writes: true, sideEffects: [`${F}.kindOf`] }),
    row("study.kindActor", [p("actor", ACTOR)], "Actor|null", "The actor a kind study reads (the kind pointer, or itself)."),
    row("study.tiers", [p("actor", ACTOR), p("tiers", "[{ min, text }]")], "Promise<boolean>", "GM: author the study ladder.",
      { gm: true, writes: true, sideEffects: [`${F}.studyTiers`] }),
    row("study.difficulty", [p("kind", ACTOR), p("offset", "number|\"auto\"|null")], "Promise<boolean>", "GM: shift the kind's DC ladder.",
      { gm: true, writes: true, sideEffects: [`${F}.studyOffset`] }),
    row("study.readTiers", [p("actor", ACTOR)], "[{ min, text }]", "The authored study ladder."),
    row("study.hold", [p("actor", ACTOR), p("hold", "boolean|null")], "Promise<boolean>",
      "GM: per-kind approval gate; null inherits the holdDefault setting.", { gm: true, writes: true, sideEffects: [`${F}.studyHold`] }),
    row("study.beliefs", [p("actor", ACTOR)], "[{ character, key, text, tier, total, when, delivered, … }]",
      "GM: what each character was told about this actor, and whether it landed (`when`/`delivered` are locale strings).", { gm: true }),
    row("study.pending", [], "[{ … }]", "GM: every undelivered reveal in the world.", { gm: true }),
    row("study.deliver", [CHAR, SUBJ, opt("loreId", "string"), opt("attrId", "string")], "Promise<boolean>", "GM: release one held reveal.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.reset", [CHAR, SUBJ, opt("loreId", "string"), opt("attrId", "string")], "Promise<boolean>",
      "GM: un-spend a study — the honest do-over.", { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.studied`] }),
    row("study.studied", [p("actor", ACTOR)], "{ kind, lore }", "The player-side `studied` hints (a UI hint, not the lock)."),
    row("study.fact", [SPEC], "object|null", "The conduit's resolve seam: one fact's skill, DC, ledger and text."),
    row("study.lore", [CHAR, SUBJ], "[{ id, label, skill, dc, available, … }]", "That actor's lore rows as the character's sheet sees them."),
    row("study.askLore", [CHAR, SUBJ, p("loreId", "string")], "Promise<boolean>", "Player gesture: roll one lore row."),
    row("study.askAttr", [CHAR, SUBJ, p("attrId", "string"), p("loreId", "string")], "Promise<boolean>", "Player gesture: roll one attribute-lore row."),
    row("study.attrOffers", [CHAR, SUBJ], "[{ attrId, rows }]", "The attribute lore this subject offers the character."),
    row("study.examine", [CHAR, SUBJ], "Promise<boolean>",
      "The one gesture that starts an identification roll (key 4, the HUD eye, the look menu). Was `study.inspect` (D1)."),
    row("study.look", [SUBJ, opt("character", ACTOR, "default: the user's character")], "LookWindow|null",
      "The player's read-only Look window on someone (no roll); null for a GM."),
    row("study.scoping", [p("characterId", "string")], "{ … }", "The tempo tell's state for one character."),
    row("study.clearScoping", [opt("characterId", "string")], "boolean|undefined", "End a run of looking (one character, or everyone)."),
    row("study.inspectAs", [CHAR, SUBJ], "Promise<boolean>", "GM: run an inspection for a character by hand.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.deliverHeld", [CHAR, SUBJ], "Promise<boolean>", "GM: release held identifications on this subject.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.releaseHeld", [CHAR, p("attrId", "string")], "Promise<boolean>", "GM: release one held attribute wherever it waits.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.resetIdent", [CHAR, SUBJ, p("attrId", "string")], "Promise<boolean>", "GM: forget one identification.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`] }),
    row("study.release", [CHAR, p("kindOrSubject", ACTOR), opt("tier", "number"), opt("opts", "{ from, quiet, prior }")], "Promise<boolean>",
      "GM: hand a character a kind at a chosen rung, no roll.", { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`, `${F}.known`] }),
    row("study.resetInspection", [CHAR, SUBJ], "Promise<boolean>", "GM: clear an inspection's identifications on this subject.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`] }),
    row("study.preview", [SUBJ], "Promise<InspectPreview|null>", "GM: the inspect window — player view, who-knows tags, simulated rolls.", { gm: true }),
    row("study.share", [SPEC, p("recipients", "Actor[]"), opt("opts", "{ from, notify }")], "Promise<*>",
      "GM: tell characters one fact as if they had passed it (chain-aware).", { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.forget", [SPEC, CHAR], "Promise<*>", "GM: undo a share, and only a share.",
      { gm: true, writes: true, sideEffects: [`${F}.beliefs`, `${F}.granted`] }),
    row("study.whoKnows", [SPEC, CHAR], "\"passed\"|\"told\"|\"held\"|\"failed\"|\"locked\"|\"none\"", "Where one character stands on one fact."),
    row("study.audit.legacyMissCards", [], "[{ character, characterId, subject, factKey, text }]",
      "GM, read-only: cards a FAILURE granted before 2026-10.", { gm: true }),

    /* ── the attribute layer ── */
    row("attributes.list", [], "[entry]", "The clamped attribute registry."),
    row("attributes.of", [p("actor", ACTOR), opt("kindResolver", "Function"), opt("opts", "{ viewer }")], "[record]",
      "What this actor belongs to (derived + authored), without the kind pointer unless a resolver is passed."),
    row("attributes.ids", [p("actor", ACTOR), opt("kindResolver", "Function")], "string[]", "Attribute ids this actor carries (derived ∪ authored − suppressed)."),
    row("attributes.derived", [p("actor", ACTOR), opt("kindResolver", "Function")], "string[]", "The derived ids only (type:, size:, species:, background:, kind:)."),
    row("attributes.resolve", [ATTR, opt("opts", "{ actor }")], "{ ok, id?, reason? }", "Resolve an id or title to one entry."),
    row("attributes.lookup", [ATTR], "record|null", "One attribute's record (authored: 24 keys, derived: 10); null on a miss. Was `attributes.describe` (D1)."),
    row("attributes.ensure", [p("title", "string"), opt("opts", "object")], "Promise<{ ok, reason?, entry? }>", "GM: find or create an entry by title.",
      { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.create", [p("title", "string"), opt("opts", "object")], "Promise<{ ok, reason?, entry? }>",
      "GM: a registry entry; refuses an id or name collision.", { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.update", [ATTR, p("patch", "object")], "Promise<{ ok, reason?, entry?, changed? }>",
      "GM: change an entry (un-reviews it and records what it touched).", { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.remove", [ATTR], "Promise<{ ok, reason? }>", "GM: delete an entry.",
      { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.link", [p("actor", ACTOR), ATTR], "Promise<{ ok, reason?, linked? }>",
      "GM: link an actor to an entry (materialises its ancestors).", { gm: true, writes: true, sideEffects: [`${F}.attributes`, `${F}.attributesOff`] }),
    row("attributes.unlink", [p("actor", ACTOR), ATTR], "Promise<{ ok, reason? }>",
      "GM: unlink (takes descendants; suppresses a derived link).", { gm: true, writes: true, sideEffects: [`${F}.attributes`, `${F}.attributesOff`] }),
    row("attributes.search", [p("query", "string"), opt("kindResolver", "Function")], "[record]", "Search entries by title."),
    row("attributes.knows", [], "{ [characterId]: { [attrId]: row } }", "The world-knowledge ledger."),
    row("attributes.known", [CHAR, opt("opts", "{ forGM, kindResolver }")], "[record]", "What a character has worked out of the world."),
    row("attributes.tell", [CHAR, ATTR, opt("opts", "{ withParents }")], "Promise<{ ok, reason? }>",
      "GM: disclosure, the only non-roll route into world knowledge.", { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributeKnowledge"] }),
    row("attributes.broken", [p("actor", ACTOR), opt("kindResolver", "Function")], "[{ id, missing }]", "Carried entries whose ancestry is broken."),
    row("attributes.repair", [p("actor", ACTOR), ATTR], "Promise<{ ok, reason? }>", "GM: re-link to repair ancestry (= link).",
      { gm: true, writes: true, sideEffects: [`${F}.attributes`] }),
    row("attributes.stale", [ATTR], "[Actor]", "Actors carrying an entry by a stale link."),
    row("attributes.openReview", [], "Promise<AttributeReview>", "GM: the Attribute Review panel.", { gm: true }),
    row("attributes.selected", [], "[{ id, title, category, parent, reviewState }]", "What the GM ticked in the review panel."),
    row("attributes.select", [p("refs", "string[]"), opt("opts", "{ replace }")], "Promise<{ ok, ids?, missed?, reason? }>",
      "GM: tick entries in the review panel.", { gm: true, writes: true, sideEffects: [`user ${F}.attrSelected`] }),
    row("attributes.deselect", [p("refs", "string[]")], "Promise<{ ok, ids?, reason? }>", "GM: untick entries.",
      { gm: true, writes: true, sideEffects: [`user ${F}.attrSelected`] }),
    row("attributes.clearSelection", [], "Promise<{ ok, ids?, reason? }>", "GM: untick everything.",
      { gm: true, writes: true, sideEffects: [`user ${F}.attrSelected`] }),
    row("attributes.review", [ATTR], "Promise<{ ok, reason? }>", "GM: sign an entry off as reviewed.",
      { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.unreview", [ATTR], "Promise<{ ok, reason? }>", "GM: put an entry back in review.",
      { gm: true, writes: true, sideEffects: ["setting pentaryn-ties.attributes"] }),
    row("attributes.unreviewed", [], "[entry]", "Entries awaiting the GM's sign-off."),
  ],
});
