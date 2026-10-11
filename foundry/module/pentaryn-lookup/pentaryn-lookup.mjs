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
  LIMITS, searchBooks, findPage, renderPage, monsterDigest, toPlainText, embeddedTableUuids, renderTable,
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
 * populate nested fields. Measured 2026-08-22 on v14.367 (2 of 47 PHB entries filled,
 * the rest `{}`) and again 2026-10-10 on v14.369: the server answers correctly, but
 * core `CompendiumCollection#indexDocument` rebuilds an entry with
 * `getProperty(source, "pages.name")` whenever a document enters the cache, which
 * reads through the `pages` array as undefined and leaves `pages: {}` /
 * `{text: {}}`. So the index is right or wrong depending on who called
 * `getDocuments()` first — 47/47 one call, 0/47 the next. `getDocuments()` is
 * ~150 ms for the whole PHB and is simply correct.
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
    return withTables(renderPage(found, opts), found, opts);
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
    const t = await fromUuid(u).catch(() => null);
    if (!t) { tables.push({ uuid: u, error: "not found" }); continue; }
    tables.push(renderTable({ name: t.name, formula: t.formula, uuid: u,
      results: t.results.contents.map(r => ({ range: r.range, description: r.description, name: r.name, text: r.text })) }));
  }
  return { ...out, tables };
}

// ── spell lists (dnd5e's registry; the "Class Spell Lists" pages are empty shells) ──

/** A spell document by uuid or name: PHB first, then the 2024 SRD. */
async function findSpell(ref) {
  const s = String(ref ?? "").trim();
  if (s.startsWith("Compendium.")) return fromUuid(s).catch(() => null);
  for (const id of ["dnd-players-handbook.spells", "dnd5e.spells24", "dnd5e.spells"]) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    const hit = (await pack.getIndex()).find(e => e.name.toLowerCase() === s.toLowerCase());
    if (hit) return pack.getDocument(hit._id);
  }
  return null;
}

function listFor(type, identifier) {
  try { return dnd5e.registry.spellLists.forType(type, String(identifier).toLowerCase()) ?? null; }
  catch { return null; }
}

/**
 * Is a spell on a class's list (or a subclass's: `{type: "subclass"}`)?
 * → `{spell, uuid, level, list, onList}`; `onList` null when the list is unknown.
 */
async function onList(spell, cls, { type = "class" } = {}) {
  const doc = await findSpell(spell);
  if (!doc) return { notFound: true, spell, hint: "spell names are the book's English names" };
  const list = listFor(type, cls);
  const known = dnd5e.registry.spellLists.options?.map(o => o.value) ?? [];
  if (!list) return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, list: `${type}:${cls}`, onList: null,
    hint: `no such list; known: ${known.join(", ")}` };
  return { spell: doc.name, uuid: doc.uuid, level: doc.system.level, list: `${type}:${cls}`, onList: list.has(doc) };
}

/** The names on a class list, optionally one spell level: `spellList("cleric", {level: 3})`. */
async function spellList(cls, { type = "class", level = null } = {}) {
  const list = listFor(type, cls);
  if (!list) return { error: `no ${type} list "${cls}"`, known: dnd5e.registry.spellLists.options?.map(o => o.value) ?? [] };
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
    const pack = game.packs.get(id);
    const idx = pack ? await pack.getIndex({ fields: ["system.level"] }) : null;
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
    const pack = game.packs.get(packId);
    if (!pack) continue;
    tried.push(packId);
    const idx = await pack.getIndex();
    const entry = idx.find(e => e.name.toLowerCase() === wanted.toLowerCase())
               ?? idx.find(e => e.name.toLowerCase().includes(wanted.toLowerCase()));
    if (!entry) continue;
    const actor = await pack.getDocument(entry._id);
    const out = monsterDigest({
      name: actor.name, id: actor.id, packId, system: actor.system,
      items: actor.items.map(i => ({ name: i.name, type: i.type })),
    });
    if (opts.text) {
      out.features = [];
      for (const i of actor.items) {
        const html = i.system?.description?.value ?? "";
        let enriched = html;
        try {
          enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(html,
            { rollData: i.getRollData?.() ?? actor.getRollData(), relativeTo: i, secrets: true });
        } catch { /* fall back to the raw text; toPlainText still strips the enrichers */ }
        const act = i.system?.activities?.contents?.[0]?.activation?.type ?? i.system?.activation?.type ?? null;
        const rch = i.system?.uses?.recovery?.find?.(r => r.period === "recharge");
        out.features.push({ name: i.name, type: i.type, activation: act || null,
          recharge: rch ? `${rch.formula ?? "6"}-6` : null, text: tidy(toPlainText(enriched)) });
      }
      out.languages = [...(actor.system.traits?.languages?.value ?? [])];
      out.speed = actor.system.attributes?.movement?.walk ?? null;
    }
    return out;
  }
  return { notFound: true, name: wanted, searched: tried,
           hint: "try a broader name — matching is exact-then-substring" };
}

/** Enriched roll text leaves spaces before punctuation ("+4 , reach 5 ft ."): close them up. */
const tidy = t => t.replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s+/g, "(");

const SIZE_KEYS = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg",
                    huge: "huge", gargantuan: "grg", grg: "grg" };

function crNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(v));
  const n = m ? Number(m[1]) / Number(m[2]) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monsters by size, type and CR, from the Monster Manual first, then the 2024 SRD (one entry per
 * name). `monsters({size: "large", type: "construct", cr: "5-8"})`; `cr` is a value ("1/4", 3) or a
 * range ("1/2-2"); `name` a substring; `limit` (default 40). → `{count, monsters: [{name, cr, size,
 * type, uuid, pack}]}`, lowest CR first. Picks candidates without guessing from memory.
 */
async function monsters(q = {}) {
  const size = q.size ? SIZE_KEYS[String(q.size).toLowerCase()] ?? String(q.size).toLowerCase() : null;
  const type = q.type ? String(q.type).toLowerCase() : null;
  let lo = null, hi = null;
  if (q.cr !== undefined && q.cr !== null && q.cr !== "") {
    const m = /^\s*([\d/.]+)\s*-\s*([\d/.]+)\s*$/.exec(String(q.cr));
    if (m) { lo = crNum(m[1]); hi = crNum(m[2]); } else { lo = hi = crNum(q.cr); }
  }
  if (q.minCr !== undefined) lo = crNum(q.minCr);
  if (q.maxCr !== undefined) hi = crNum(q.maxCr);
  const name = q.name ? String(q.name).toLowerCase() : null;
  const limit = Math.max(1, Math.min(Number(q.limit) || 40, 200));
  const packIds = q.packs ?? ["dnd-monster-manual.actors", "dnd5e.actors24"];
  const seen = new Set(), out = [];
  for (const id of packIds) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    const idx = await pack.getIndex({ fields: ["type", "system.details.cr", "system.traits.size", "system.details.type.value", "system.details.type.subtype"] });
    for (const e of idx) {
      if (e.type !== "npc") continue;
      const cr = e.system?.details?.cr, sz = e.system?.traits?.size, ty = e.system?.details?.type?.value;
      if (size && sz !== size) continue;
      if (type && String(ty ?? "").toLowerCase() !== type) continue;
      if (lo !== null && !(cr >= lo)) continue;
      if (hi !== null && !(cr <= hi)) continue;
      if (name && !e.name.toLowerCase().includes(name)) continue;
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      const sub = e.system?.details?.type?.subtype;
      out.push({ name: e.name, cr, size: sz, type: sub ? `${ty} (${sub})` : ty, uuid: e.uuid ?? `Compendium.${id}.Actor.${e._id}`, pack: id });
    }
  }
  out.sort((a, b) => (a.cr - b.cr) || a.name.localeCompare(b.name));
  return { count: out.length, shown: Math.min(out.length, limit), monsters: out.slice(0, limit),
           ...(out.length > limit ? { hint: `narrow it (size, type, cr) or raise limit; ${out.length - limit} more` } : {}) };
}

/**
 * The names the PHB uses, for a character spec: `names()` → `{classes, subclasses: {paladin: […]},
 * species, backgrounds, feats: {origin: […], general: […], fightingStyle: […], epicBoon: […]}}`;
 * `names("subclass")` one part. Species are the PHB's own names (`Elf, High`, `Tiefling, Infernal`).
 */
async function names(kind = null) {
  const out = { classes: [], subclasses: {}, species: [], backgrounds: [], feats: {} };
  const read = async (id, fields) => { const p = game.packs.get(id); return p ? p.getIndex({ fields }) : []; };
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
  // It tests the MECHANISM, not a live index: counting filled entries in
  // `getIndex({fields})` depends on whether something already called getDocuments()
  // this session, so it flipped between pass and fail on v14.369 with the bug intact.
  // Side-effect free: replays indexDocument's projection on a literal, reads source.
  const CC = foundry.documents.collections.CompendiumCollection;
  const projected = {};
  foundry.utils.setProperty(projected, "pages.name",
    foundry.utils.getProperty({ pages: [{ name: "x" }] }, "pages.name"));
  const viaGetProperty = /getProperty\(\s*data\s*,\s*field\s*\)/
    .test(CC?.prototype?.indexDocument?.toString?.() ?? "");
  check("core indexDocument still drops nested page fields (documents the workaround)",
        viaGetProperty && !Array.isArray(projected.pages),
        `indexDocument via getProperty=${viaGetProperty}, ` +
        `projected pages=${JSON.stringify(projected.pages)}`);

  const ol = await onList("Fireball", "wizard");
  check("onList('Fireball', 'wizard') is true", ol.onList === true, JSON.stringify(ol));
  const ol2 = await onList("Fireball", "cleric");
  check("onList('Fireball', 'cleric') is false", ol2.onList === false, JSON.stringify(ol2));
  const art = await page("Artifacts", { books: ["dnd-dungeon-masters-guide.content"] });
  check("page('Artifacts') carries its embedded roll tables", (art.tables?.length ?? 0) >= 4 && art.tables[0].rows?.length > 0,
        `${art.tables?.length ?? 0} table(s)`);

  const ms = await monsters({ size: "large", type: "construct", cr: "5-8" });
  check("monsters({large construct, CR 5-8}) finds the Shield Guardian", ms.monsters?.some(m => m.name === "Shield Guardian"),
        `${ms.count} hit(s)`);
  const nm = await names();
  check("names() lists PHB classes, subclasses, species, feats",
        nm.classes.includes("Paladin") && (nm.subclasses.cleric ?? []).length > 0 && nm.species.includes("Elf, High") && (nm.feats.origin ?? []).length > 0,
        `${nm.classes.length} classes, ${nm.species.length} species`);
  const gt = await monster("Goblin Boss", { text: true });
  const txt = (gt.features ?? []).map(f => f.text).join(" ");
  check("monster(…, {text}) resolves enrichers", txt.length > 0 && !/\[\[|lookup @/.test(txt), txt.slice(0, 80));

  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, passed: checks.length - failed.length,
           failed: failed.length, checks };
}

// ── publish ──────────────────────────────────────────────────────────────────
/**
 * `game.pentaryn` is a plain object every module assigns into: the importer merges into it and
 * nothing freezes it since its keystone (items-journal-1), so the old frozen-root guard is gone
 * (kit 1.0.2, J10). A frozen root now throws here and the ready hook stops before its log line.
 */
function publishAPI() {
  const api = { search, page, monster, monsters, names, packs, selftest, onList, spellList, toPlainText, LIMITS };
  game.pentaryn ??= {};
  game.pentaryn.rules = api;
}

Hooks.once("ready", () => {
  publishAPI();
  console.log("pentaryn-lookup | game.pentaryn.rules ready — search(), page(), monster(), packs(), selftest()");
});
