/**
 * pentaryn-lookup — FEATURE: the book lookups (search, page, monster, monsters, names, packs,
 * onList, spellList).
 *
 * GLUE, one feature. `install(reg, ctx)` registers no hook: it keeps the module's log and hands
 * the entry the implementations; their rows live in api-manifest.mjs, the one table
 * registerQueries reads. Foundry is read only through packs-adapter.mjs; the rules are in
 * lookup-core.mjs.
 */

import {
  EDITIONS, KNOWN_PACKS, MONSTER_PACKS, findPage, foundFromDoc, nonPageWarning, knownLists, listFor, matchMonster,
  MONSTER_INDEX_FIELDS, missingPackError, monsterDigest, monsterQuery, monsterRow, pageMonsters, pickByName, renderPage, renderTable, resolveBooks,
  searchBooks, sortMonsters, embeddedTableUuids, groupListUuids, spellListRows, NAME_SOURCES, groupNames,
} from "./lookup-core.mjs";
import {
  clearBookCache, featureTexts, findSpell, loadBooks, packSummary, readDocument, readIndex, readPageDoc, readTable, spellRegistry,
  worldInfo,
} from "./packs-adapter.mjs";

/** The entry's log (ctx.log), set by install(). */
let log = null;

export function install(reg, ctx) {
  log = ctx.log;
  return { rows: [], impl: { search, page, monster, monsters, names, packs, onList, spellList } };
}

/** Drop the session's book cache (a hot patch, or a pack changed under a running world). */
export function uninstall() {
  clearBookCache();
}

// ── the API ──────────────────────────────────────────────────────────────────

/** Full-text search across the owned books. */
async function search(query, opts = {}) {
  opts ??= {};
  const { ids, warning } = resolveBooks(opts.books);
  const { books, missing } = await loadBooks(ids, log);
  if (!books.length) return withWarning(missingPackError(missing), warning);
  const result = searchBooks(books, query, opts);
  const skipped = missing.length ? `skipped missing pack(s): ${missing.join(", ")}` : null;
  return withWarning(result, [warning, skipped].filter(Boolean).join("; "));
}

/** One page, by UUID or by name. */
async function page(ref, opts = {}) {
  opts ??= {};
  const raw = String(ref ?? "").trim();
  if (!raw) return { error: "page(ref) needs a UUID or a page name" };

  // UUID path — what search() hands back, so "give me hit #2 in full" is one call.
  if (raw.startsWith("Compendium.")) {
    const read = await readPageDoc(raw, log);
    if (!read) return { error: `no document at ${raw}` };
    const found = foundFromDoc({ ...read, uuid: raw });
    const out = renderPage(found, opts);
    const warning = nonPageWarning(raw, read.documentName);
    return withTables(warning ? { ...out, warning } : out, found, opts);
  }

  const { ids, warning } = resolveBooks(opts.books);
  const { books, missing } = await loadBooks(ids, log);
  if (!books.length) return withWarning(missingPackError(missing), warning);
  const found = findPage(books, raw);
  return withWarning(await withTables(renderPage(found, opts), found, opts), warning);
}

/** `out` with `warning` added when there is one (R5: a misread `books` / `packs` says so). */
function withWarning(out, warning) {
  return warning && out ? { ...out, warning } : out;
}

/** Append the page's embedded roll tables (`tables: false` to skip). */
async function withTables(out, found, opts) {
  if (!out || out.error || out.notFound || opts.tables === false || opts.raw) return out;
  const uuids = embeddedTableUuids(found?.page?.html);
  if (!uuids.length) return out;
  const tables = [];
  for (const u of uuids) {
    const t = await readTable(u, log);
    if (!t) { tables.push({ uuid: u, error: "not found" }); continue; }
    tables.push(renderTable(t));
  }
  return { ...out, tables };
}

// ── spell lists (dnd5e's registry; the "Class Spell Lists" pages are empty shells) ──

const spellListFor = (type, identifier) => listFor(spellRegistry(), type, identifier,
  err => log?.debug("spell-list registry read failed", { type, identifier }, err));
const knownSpellLists = () => knownLists(spellRegistry(), err => log?.debug("spell-list options read failed", err));

/**
 * Is a spell on a class's list (or a subclass's: `{type: "subclass"}`)?
 * → `{spell, uuid, level, list, onList}`; `onList` null when the list is unknown.
 */
async function onList(spell, cls, opts = {}) {
  const { type = "class" } = opts ?? {};
  const doc = await findSpell(spell, log);
  if (!doc) return { notFound: true, spell, hint: "spell names are the book's English names" };
  // a uuid can resolve to any document: only a spell Item has a level and a list (lookup-edge-3)
  if (doc.type !== "spell" || !doc.system) {
    return { notFound: true, spell, hint: `${spell} is a ${doc.documentName}, not a spell Item` };
  }
  const list = spellListFor(type, cls);
  // a spell from a 2014 pack says so, as a 2014 search hit does (EXT-5)
  const ed = EDITIONS[doc.pack] ? { edition: EDITIONS[doc.pack] } : {};
  // the options are read only for the unknown-list hint, never on a found list (LKM-12)
  if (!list) return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, ...ed, list: `${type}:${cls}`, onList: null,
    hint: `no such list; known: ${knownSpellLists().join(", ")}` };
  return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, ...ed, list: `${type}:${cls}`, onList: list.has(doc) };
}

/** The names on a class list, optionally one spell level: `spellList("cleric", {level: 3})`. */
async function spellList(cls, opts = {}) {
  const { type = "class", level = null } = opts ?? {};
  const list = spellListFor(type, cls);
  if (!list) return { error: `no ${type} list "${cls}"`, known: knownSpellLists() };
  // the registry holds a uuid per contributing pack (PHB and the 2024 SRD both list Aid):
  // read levels from each pack's index, keep one entry per name, the owned book first
  const groups = groupListUuids(list.uuids);
  const indexes = new Map();
  for (const [id] of groups) indexes.set(id, await readIndex(id, ["system.level"], log));
  const out = spellListRows(groups, indexes, level);
  return { list: `${type}:${cls}`, count: out.length, spells: out };
}

/**
 * A shallow stat-block digest, plus the uuid so it chains into the typed tools.
 * `{text: true}` adds each feature's rules text, enriched the way the sheet shows it
 * (`[[lookup @name]]` → the creature's name, `[[/attack]]` → "+4", `[[/damage]]` → "5 (1d6 + 2)"),
 * as plain text — one call instead of a digest and a second read of the items.
 */
async function monster(name, opts = {}) {
  opts ??= {};
  const wanted = String(name ?? "").trim();
  if (!wanted) return { error: "monster(name) needs a name" };
  const indexes = [];
  for (const packId of MONSTER_PACKS) {
    const idx = await readIndex(packId, null, log);
    if (idx) indexes.push([packId, idx]);
  }
  const tried = indexes.map(([packId]) => packId);
  // exact across every pack first, then substring: a later pack's exact name beats an earlier
  // pack's substring hit (R6)
  for (const substring of [false, true]) for (const [packId, idx] of indexes) {
    const entry = pickByName(idx, wanted, { substring });
    if (!entry) continue;
    const actor = await readDocument(packId, entry._id, log);
    if (!actor) continue;
    const out = monsterDigest({
      name: actor.name, id: actor.id, packId, system: actor.system,
      items: actor.items.map(i => ({ name: i.name, type: i.type })),
    });
    if (opts.text) {
      out.features = await featureTexts(actor, log);
      out.languages = [...(actor.system.traits?.languages?.value ?? [])];
      out.speed = actor.system.attributes?.movement?.walk ?? null;
    }
    return out;
  }
  return { notFound: true, name: wanted, searched: tried,
           hint: "try a broader name — matching is exact-then-substring" };
}

/**
 * Monsters by size, type and CR, from the Monster Manual first, then the 2024 SRD (one entry per
 * name, the MM's: a creature the MM has is answered from the MM or not at all; a later pack adds only
 * names the earlier packs lack). `monsters({size: "large", type: "construct", cr: "5-8"})`; `cr` is a value ("1/4", 3) or a
 * range ("1/2-2", "CR 1/2 to 2"), an unreadable one filters nothing and warns; `name` a substring; `limit` (default 40). → `{count, monsters: [{name, cr, size,
 * type, uuid, pack}]}`, lowest CR first. Picks candidates without guessing from memory.
 */
async function monsters(q = {}) {
  const query = monsterQuery(q ?? {});
  // a name an earlier pack has is that pack's, filtered in or out — never a later pack's copy
  const earlier = new Set(), seen = new Set(), out = [];
  for (const id of query.packIds) {
    const idx = await readIndex(id, [...MONSTER_INDEX_FIELDS], log);
    if (!idx) continue;
    for (const e of idx) {
      if (earlier.has(e.name) || !matchMonster(e, query)) continue;
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push(monsterRow(e, id));
    }
    for (const e of idx) earlier.add(e.name);
  }
  return withWarning(pageMonsters(sortMonsters(out), query.limit), query.warning);
}

/**
 * The names the PHB uses, for a character spec: `names()` → `{classes, subclasses: {paladin: […]},
 * species, backgrounds, feats: {origin: […], general: […], fightingStyle: […], epicBoon: […]}}`;
 * `names("subclass")` one part. Species are the PHB's own names (`Elf, High`, `Tiefling, Infernal`).
 */
async function names(kind = null) {
  const indexes = {};
  for (const [key, { pack, fields }] of Object.entries(NAME_SOURCES)) indexes[key] = (await readIndex(pack, [...fields], log)) ?? [];
  return groupNames(indexes, kind);
}

/** What is actually installed. Answers the usual session-opening probe in one call. */
async function packs() {
  const rows = [];
  for (const id of KNOWN_PACKS) {
    const p = await packSummary(id, log);
    if (!p) { rows.push({ id, present: false }); continue; }
    rows.push({ id, present: true, label: p.label,
                type: p.type, entries: p.entries,
                edition: EDITIONS[id] ?? "2024" });
  }
  return { ...worldInfo(), packs: rows };
}
