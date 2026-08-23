/**
 * pentaryn-lookup — the owned books, searchable from one call.
 *
 * This file is the ONLY part that touches Foundry, and it is deliberately thin: turn
 * `game.packs` into plain data, hand it to lookup-core, publish the API. Everything
 * that can be subtly wrong lives in lookup-core.mjs, which `node test/run.mjs` proves.
 *
 * If a Foundry major bump breaks this module, this is the file to re-verify — it is
 * one screenful, and every Foundry API it depends on is named in the README's table.
 */

import {
  LIMITS, searchBooks, findPage, renderPage, monsterDigest, toPlainText,
} from "./lookup-core.mjs";

// ── which packs count as what ────────────────────────────────────────────────
// 2014 SRD is excluded from every default: this table runs D&D 2024, and quoting
// 2014 text at it is the quietest way to be wrong. When it IS asked for, its hits
// carry `edition: "2014"` so a mixed result cannot masquerade as current.
const BOOKSETS = {
  rules: ["dnd-players-handbook.content", "dnd-dungeon-masters-guide.content", "dnd5e.content24"],
  monsters: ["dnd-monster-manual.content"],
  all: ["dnd-players-handbook.content", "dnd-dungeon-masters-guide.content",
        "dnd5e.content24", "dnd-monster-manual.content"],
  "2014": ["dnd5e.rules"],
};
const EDITIONS = { "dnd5e.rules": "2014" };
const MONSTER_PACKS = ["dnd-monster-manual.actors", "dnd5e.actors24",
                       "dnd-players-handbook.actors", "dnd-dungeon-masters-guide.actors"];

// Stripped page text, memoized by page uuid. The book packs are read-only and LevelDB
// locks them while Foundry runs, so invalidation is "never". ~3 MB ceiling across every
// pack; it makes the second search of a session near-instant.
const textCache = new Map();

function resolveBookIds(books) {
  if (!books) return BOOKSETS.rules;
  if (Array.isArray(books)) return books;
  return BOOKSETS[String(books)] ?? BOOKSETS.rules;
}

/**
 * `game.packs` -> the plain shape lookup-core wants.
 *
 * `getDocuments()` rather than `getIndex({fields})`: the index does NOT reliably
 * populate nested fields — measured 2026-08-22 on v14.367, 2 of 47 PHB entries came
 * back populated and the rest as `{}`, unchanged by `pack.clear()`. `getDocuments()`
 * is ~150 ms for the whole PHB and is simply correct.
 *
 * `doc.pages` is an EmbeddedCollection: iterate it, use `.size`, never `.length`.
 */
async function loadBooks(ids) {
  const books = [];
  const missing = [];
  for (const id of ids) {
    const pack = game.packs.get(id);
    if (!pack) { missing.push(id); continue; }
    const docs = [];
    for (const doc of await pack.getDocuments()) {
      const pages = [];
      for (const page of doc.pages) {
        const uuid = `${id}:${doc.id}:${page.id}`;
        let html = page.text?.content ?? "";
        if (textCache.has(uuid)) html = textCache.get(uuid);
        else { textCache.set(uuid, html); }
        pages.push({ id: page.id, name: page.name, html });
      }
      docs.push({ id: doc.id, name: doc.name, pages });
    }
    books.push({ id, label: pack.metadata.label, edition: EDITIONS[id], docs });
  }
  return { books, missing };
}

function missingPackError(missing) {
  return { error: `compendium pack(s) not found: ${missing.join(", ")} — ` +
                  `is the module enabled in Manage Modules?` };
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
    const doc = await fromUuid(raw).catch(() => null);
    if (!doc) return { error: `no document at ${raw}` };
    const parent = doc.parent ?? doc;
    const packId = doc.pack ?? parent.pack;
    const pack = game.packs.get(packId);
    const found = {
      book: { id: packId, label: pack?.metadata?.label ?? packId, edition: EDITIONS[packId] },
      doc: { id: parent.id, name: parent.name },
      page: { id: doc.id, name: doc.name, html: doc.text?.content ?? "" },
    };
    return renderPage(found, opts);
  }

  const { books, missing } = await loadBooks(resolveBookIds(opts.books));
  if (!books.length) return missingPackError(missing);
  return renderPage(findPage(books, raw), opts);
}

/** A shallow stat-block digest, plus the uuid so it chains into the typed tools. */
async function monster(name) {
  const wanted = String(name ?? "").trim();
  if (!wanted) return { error: "monster(name) needs a name" };
  const tried = [];
  for (const packId of MONSTER_PACKS) {
    const pack = game.packs.get(packId);
    if (!pack) continue;
    tried.push(packId);
    const idx = await pack.getIndex();
    const entry = idx.find(e => e.name.toLowerCase() === wanted.toLowerCase())
               ?? idx.find(e => e.name.toLowerCase().includes(wanted.toLowerCase()));
    if (!entry) continue;
    const actor = await pack.getDocument(entry._id);
    return monsterDigest({
      name: actor.name, id: actor.id, packId, system: actor.system,
      items: actor.items.map(i => ({ name: i.name, type: i.type })),
    });
  }
  return { notFound: true, name: wanted, searched: tried,
           hint: "try a broader name — matching is exact-then-substring" };
}

/** What is actually installed. Answers the usual session-opening probe in one call. */
async function packs() {
  const known = [...new Set([...BOOKSETS.all, ...BOOKSETS["2014"], ...MONSTER_PACKS])];
  const rows = [];
  for (const id of known) {
    const pack = game.packs.get(id);
    if (!pack) { rows.push({ id, present: false }); continue; }
    const idx = await pack.getIndex();
    rows.push({ id, present: true, label: pack.metadata.label,
                type: pack.documentName, entries: idx.size,
                edition: EDITIONS[id] ?? "2024" });
  }
  return { world: game.world.id, foundry: game.version,
           system: `${game.system.id} ${game.system.version}`, packs: rows };
}

/**
 * Assert this module's assumptions against the live world.
 *
 * Run after every sync, and after every Saturday auto-update — an update is exactly
 * when a premium module restructures its journals or dnd5e moves a data path, and
 * both failures are otherwise silent until someone asks a rules question at the table.
 */
async function selftest() {
  const checks = [];
  const check = (label, ok, detail) => checks.push({ label, ok: !!ok, detail });

  const p = await packs();
  for (const id of BOOKSETS.rules)
    check(`pack present: ${id}`, p.packs.find(r => r.id === id)?.present);

  const s = await search("half cover");
  check("search finds 'half cover'", s.total > 0, `total=${s.total}`);
  check("a hit names a Cover page", s.hits?.some(h => /cover/i.test(h.page)),
        s.hits?.[0]?.page);
  check("hits carry a pasteable uuid",
        s.hits?.[0]?.uuid?.startsWith("Compendium."), s.hits?.[0]?.uuid);
  check("snippets are enricher-free",
        !s.hits?.some(h => /@UUID\[|&Reference\[|\[\[/.test(h.snippet)));

  const pg = await page("Study");
  check("page('Study') resolves", !!pg.text, pg.journal ?? pg.hint);

  const m = await monster("Goblin");
  check("monster('Goblin') has numeric cr/ac/hp",
        typeof m.cr === "number" && typeof m.ac === "number" && typeof m.hp === "number",
        m.warning ?? `cr=${m.cr} ac=${m.ac} hp=${m.hp}`);

  // Documents the bug the adapter routes around. If Foundry ever fixes it, this fails
  // and the fix becomes an informed decision instead of a silent regression.
  const phb = game.packs.get("dnd-players-handbook.content");
  const idx = await phb.getIndex({ fields: ["pages.name"] });
  const populated = [...idx].filter(e => Array.isArray(e.pages)).length;
  check("getIndex({fields}) still unreliable (documents the workaround)",
        populated < idx.size, `${populated}/${idx.size} entries populated`);

  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, passed: checks.length - failed.length,
           failed: failed.length, checks };
}

// ── publish ──────────────────────────────────────────────────────────────────
/**
 * pentaryn-importer creates and FREEZES `game.pentaryn` in its own ready hook, and
 * module ready-hooks fire in alphabetical order of module id — "pentaryn-lookup" sorts
 * after "pentaryn-importer", so a bare assignment throws in strict mode and takes the
 * rest of the hook down with it, leaving no API and no log line. Same guard the walls,
 * ties, pings and dropbin modules carry.
 */
function publishAPI() {
  const api = { search, page, monster, packs, selftest, toPlainText, LIMITS };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, rules: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.rules = api;
  }
}

Hooks.once("ready", () => {
  publishAPI();
  console.log("pentaryn-lookup | game.pentaryn.rules ready — search(), page(), monster(), packs(), selftest()");
});
