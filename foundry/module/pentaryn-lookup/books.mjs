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
  BOOKSETS, EDITIONS, MONSTER_PACKS, findPage, foundFromDoc, nonPageWarning, knownLists, listFor as listForIn, matchMonster,
  missingPackError, monsterDigest, monsterQuery, monsterRow, pageMonsters, renderPage, renderTable, resolveBookIds,
  searchBooks, sortMonsters, embeddedTableUuids,
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
  const ids = resolveBookIds(opts.books);
  const { books, missing } = await loadBooks(ids);
  if (!books.length) return missingPackError(missing);
  const result = searchBooks(books, query, opts);
  if (missing.length) result.warning = `skipped missing pack(s): ${missing.join(", ")}`;
  return result;
}

/** One page, by UUID or by name. */
async function page(ref, opts = {}) {
  const raw = String(ref ?? "").trim();
  if (!raw) return { error: "page(ref) needs a UUID or a page name" };

  // UUID path — what search() hands back, so "give me hit #2 in full" is one call.
  if (raw.startsWith("Compendium.")) {
    const read = await readPageDoc(raw, log);
    if (!read) return { error: `no document at ${raw}` };
    const found = foundFromDoc(read);
    const out = renderPage(found, opts);
    const warning = nonPageWarning(raw, read.documentName);
    return withTables(warning ? { ...out, warning } : out, found, opts);
  }

  const { books, missing } = await loadBooks(resolveBookIds(opts.books));
  if (!books.length) return missingPackError(missing);
  const found = findPage(books, raw);
  return withTables(renderPage(found, opts), found, opts);
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

const listFor = (type, identifier) => listForIn(spellRegistry(), type, identifier,
  err => log?.debug("spell-list registry read failed", { type, identifier }, err));
const known = () => knownLists(spellRegistry(), err => log?.debug("spell-list options read failed", err));

/**
 * Is a spell on a class's list (or a subclass's: `{type: "subclass"}`)?
 * → `{spell, uuid, level, list, onList}`; `onList` null when the list is unknown.
 */
async function onList(spell, cls, { type = "class" } = {}) {
  const doc = await findSpell(spell, log);
  if (!doc) return { notFound: true, spell, hint: "spell names are the book's English names" };
  const list = listFor(type, cls);
  const lists = known();
  if (!list) return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, list: `${type}:${cls}`, onList: null,
    hint: `no such list; known: ${lists.join(", ")}` };
  return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, list: `${type}:${cls}`, onList: list.has(doc) };
}

/** The names on a class list, optionally one spell level: `spellList("cleric", {level: 3})`. */
async function spellList(cls, { type = "class", level = null } = {}) {
  const list = listFor(type, cls);
  if (!list) return { error: `no ${type} list "${cls}"`, known: known() };
  // the registry holds a uuid per contributing pack (PHB and the 2024 SRD both list Aid):
  // read levels from each pack's index, keep one entry per name, the owned book first
  const byPack = new Map();
  for (const u of list.uuids) {
    const m = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(u);
    if (!m) continue;
    if (!byPack.has(m[1])) byPack.set(m[1], []);
    byPack.get(m[1]).push([u, m[2]]);
  }
  const packs = [...byPack.keys()].sort((a, b) => (b.startsWith("dnd-players-handbook") ? 1 : 0) - (a.startsWith("dnd-players-handbook") ? 1 : 0));
  const seen = new Set(), out = [];
  for (const id of packs) {
    const idx = await readIndex(id, ["system.level"]);
    for (const [u, docId] of byPack.get(id)) {
      const e = idx?.get(docId);
      const name = e?.name ?? u, lvl = e?.system?.level ?? null;
      if (seen.has(name)) continue;
      if (level !== null && lvl !== Number(level)) continue;
      seen.add(name);
      out.push({ name, level: lvl, uuid: u });
    }
  }
  out.sort((a, b) => ((a.level ?? 0) - (b.level ?? 0)) || String(a.name).localeCompare(String(b.name)));
  return { list: `${type}:${cls}`, count: out.length, spells: out };
}

/**
 * A shallow stat-block digest, plus the uuid so it chains into the typed tools.
 * `{text: true}` adds each feature's rules text, enriched the way the sheet shows it
 * (`[[lookup @name]]` → the creature's name, `[[/attack]]` → "+4", `[[/damage]]` → "5 (1d6 + 2)"),
 * as plain text — one call instead of a digest and a second read of the items.
 */
async function monster(name, opts = {}) {
  const wanted = String(name ?? "").trim();
  if (!wanted) return { error: "monster(name) needs a name" };
  const tried = [];
  for (const packId of MONSTER_PACKS) {
    const idx = await readIndex(packId);
    if (!idx) continue;
    tried.push(packId);
    const entry = idx.find(e => e.name.toLowerCase() === wanted.toLowerCase())
               ?? idx.find(e => e.name.toLowerCase().includes(wanted.toLowerCase()));
    if (!entry) continue;
    const actor = await readDocument(packId, entry._id);
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
 * name). `monsters({size: "large", type: "construct", cr: "5-8"})`; `cr` is a value ("1/4", 3) or a
 * range ("1/2-2"); `name` a substring; `limit` (default 40). → `{count, monsters: [{name, cr, size,
 * type, uuid, pack}]}`, lowest CR first. Picks candidates without guessing from memory.
 */
async function monsters(q = {}) {
  const query = monsterQuery(q);
  const seen = new Set(), out = [];
  for (const id of query.packIds) {
    const idx = await readIndex(id, ["type", "system.details.cr", "system.traits.size", "system.details.type.value", "system.details.type.subtype"]);
    if (!idx) continue;
    for (const e of idx) {
      if (!matchMonster(e, query)) continue;
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push(monsterRow(e, id));
    }
  }
  return pageMonsters(sortMonsters(out), query.limit);
}

/**
 * The names the PHB uses, for a character spec: `names()` → `{classes, subclasses: {paladin: […]},
 * species, backgrounds, feats: {origin: […], general: […], fightingStyle: […], epicBoon: […]}}`;
 * `names("subclass")` one part. Species are the PHB's own names (`Elf, High`, `Tiefling, Infernal`).
 */
async function names(kind = null) {
  const out = { classes: [], subclasses: {}, species: [], backgrounds: [], feats: {} };
  const read = async (id, fields) => (await readIndex(id, fields)) ?? [];
  for (const e of await read("dnd-players-handbook.classes", ["type", "system.identifier", "system.classIdentifier"])) {
    if (e.type === "class") out.classes.push(e.name);
    if (e.type === "subclass") (out.subclasses[e.system?.classIdentifier ?? "?"] ??= []).push(e.name);
  }
  for (const e of await read("dnd-players-handbook.origins", ["type", "system.type.value"])) {
    if (e.type === "race") out.species.push(e.name);
    if (e.type === "background") out.backgrounds.push(e.name);
  }
  for (const e of await read("dnd-players-handbook.feats", ["type", "system.type.value", "system.type.subtype"])) {
    if (e.type !== "feat") continue;
    (out.feats[e.system?.type?.subtype || "other"] ??= []).push(e.name);
  }
  const sort = a => a.sort((x, y) => x.localeCompare(y));
  sort(out.classes); sort(out.species); sort(out.backgrounds);
  for (const k of Object.keys(out.subclasses)) sort(out.subclasses[k]);
  for (const k of Object.keys(out.feats)) sort(out.feats[k]);
  const parts = { class: "classes", classes: "classes", subclass: "subclasses", subclasses: "subclasses",
                  species: "species", race: "species", background: "backgrounds", backgrounds: "backgrounds",
                  feat: "feats", feats: "feats" };
  if (kind && parts[String(kind).toLowerCase()]) return { [parts[String(kind).toLowerCase()]]: out[parts[String(kind).toLowerCase()]] };
  return out;
}

/** What is actually installed. Answers the usual session-opening probe in one call. */
async function packs() {
  const known = [...new Set([...BOOKSETS.all, ...BOOKSETS["2014"], ...MONSTER_PACKS])];
  const rows = [];
  for (const id of known) {
    const p = await packSummary(id);
    if (!p) { rows.push({ id, present: false }); continue; }
    rows.push({ id, present: true, label: p.label,
                type: p.type, entries: p.entries,
                edition: EDITIONS[id] ?? "2024" });
  }
  return { ...worldInfo(), packs: rows };
}
