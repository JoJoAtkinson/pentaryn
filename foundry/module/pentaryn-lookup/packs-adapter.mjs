/**
 * pentaryn-lookup — ADAPTER. The only file that reads Foundry: `game.packs`, `fromUuid`,
 * `dnd5e.registry` and `TextEditor.enrichHTML` in, plain data out. Every rule that can be subtly
 * wrong lives in lookup-core.mjs; this file only fetches.
 *
 * May import core and lib (C16). Each function reads its globals at call time. A read that fails is
 * answered as "nothing there" (the shapes callers already handle) and traced through the caller's
 * `log` at debug level: `CONFIG.debug["pentaryn-lookup"] = true` shows it (prompts-lookup-34).
 */

import { EDITIONS, SPELL_PACKS, tidy, toBook, toPlainText } from "./lookup-core.mjs";

/**
 * The plain books, one load per pack per session: pack id → Promise<book> (the promise, so two
 * calls on a cold cache share one getDocuments()). The book packs are read-only and LevelDB locks
 * them while Foundry runs, so nothing invalidates an entry but clearBookCache() (books.uninstall).
 * A missing pack is never cached (checked on every call); a failed load is dropped, so the next
 * call retries. Memory: the books' HTML plus their plain text.
 */
const bookCache = new Map();

export function clearBookCache() {
  bookCache.clear();
}

function cachedBook(id, pack) {
  let p = bookCache.get(id);
  if (!p) {
    p = pack.getDocuments().then(docs => toBook(id, pack.metadata.label, EDITIONS[id], docs));
    bookCache.set(id, p);
    p.catch(() => { if (bookCache.get(id) === p) bookCache.delete(id); });
  }
  return p;
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
export async function loadBooks(ids) {
  const books = [];
  const missing = [];
  for (const id of ids) {
    const pack = game.packs.get(id);
    if (!pack) { missing.push(id); continue; }
    books.push(await cachedBook(id, pack));
  }
  return { books, missing };
}

/**
 * A `Compendium.…` UUID → foundFromDoc's input, or null when nothing is there (a rejected read is
 * null too). A document with no parent (a JournalEntry UUID) stands as its own parent.
 */
export async function readPageDoc(raw, log = null) {
  const doc = await fromUuid(raw).catch(err => (log?.debug("fromUuid failed", { uuid: raw }, err), null));
  if (!doc) return null;
  const parent = doc.parent ?? doc;
  const packId = doc.pack ?? parent.pack;
  const pack = game.packs.get(packId);
  return {
    documentName: doc.documentName, id: doc.id, name: doc.name, html: doc.text?.content ?? "",
    pack: packId, parent: { id: parent.id, name: parent.name }, packLabel: pack?.metadata?.label ?? packId,
  };
}

/** A RollTable by UUID → renderTable's input, or null when it cannot be read. */
export async function readTable(uuid, log = null) {
  const t = await fromUuid(uuid).catch(err => (log?.debug("fromUuid failed", { uuid }, err), null));
  if (!t) return null;
  return { name: t.name, formula: t.formula, uuid,
    results: t.results.contents.map(r => ({ range: r.range, description: r.description, name: r.name, text: r.text })) };
}

/** A spell document by uuid or name: PHB first, then the 2024 SRD (SPELL_PACKS order). */
export async function findSpell(ref, log = null) {
  const s = String(ref ?? "").trim();
  if (s.startsWith("Compendium.")) return fromUuid(s).catch(err => (log?.debug("fromUuid failed", { uuid: s }, err), null));
  for (const id of SPELL_PACKS) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    const hit = (await pack.getIndex()).find(e => e.name.toLowerCase() === s.toLowerCase());
    if (hit) return pack.getDocument(hit._id);
  }
  return null;
}

/** dnd5e's spell-list registry, read at call time. */
export function spellRegistry() {
  return dnd5e.registry;
}

/** A pack's index (`fields` for the nested values a filter needs), or null when the pack is absent. */
export async function readIndex(id, fields = null) {
  const pack = game.packs.get(id);
  if (!pack) return null;
  return fields ? pack.getIndex({ fields }) : pack.getIndex();
}

/** One document from a pack by id. */
export async function readDocument(id, docId) {
  return game.packs.get(id).getDocument(docId);
}

/** `{ label, type, entries }` for an installed pack, or null. */
export async function packSummary(id) {
  const pack = game.packs.get(id);
  if (!pack) return null;
  const idx = await pack.getIndex();
  return { label: pack.metadata.label, type: pack.documentName, entries: idx.size };
}

/** World, core and system versions, for packs(). */
export function worldInfo() {
  return { world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}` };
}

/**
 * Each feature's rules text, enriched the way the sheet shows it (`[[lookup @name]]` → the
 * creature's name, `[[/attack]]` → "+4", `[[/damage]]` → "5 (1d6 + 2)"), as plain text.
 */
export async function featureTexts(actor, log = null) {
  const features = [];
  for (const i of actor.items) {
    const html = i.system?.description?.value ?? "";
    let enriched = html;
    try {
      enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(html,
        { rollData: i.getRollData?.() ?? actor.getRollData(), relativeTo: i, secrets: true });
    } catch (err) {
      // fall back to the raw text; toPlainText still strips the enrichers
      log?.debug("enrichHTML failed", { item: i.uuid }, err);
    }
    const act = i.system?.activities?.contents?.[0]?.activation?.type ?? i.system?.activation?.type ?? null;
    const rch = i.system?.uses?.recovery?.find?.(r => r.period === "recharge");
    features.push({ name: i.name, type: i.type, activation: act || null,
      recharge: rch ? `${rch.formula ?? "6"}-6` : null, text: tidy(toPlainText(enriched)) });
  }
  return features;
}

/**
 * selftest's probe of the bug loadBooks routes around: replay core `indexDocument`'s projection of
 * `pages.name` on a literal, and read whether its SOURCE still projects through getProperty. A read
 * of core source text, not a patch (README "Patches and adjustments"). Side-effect free.
 */
export function indexDocumentProbe() {
  const CC = foundry.documents.collections.CompendiumCollection;
  const projected = {};
  foundry.utils.setProperty(projected, "pages.name",
    foundry.utils.getProperty({ pages: [{ name: "x" }] }, "pages.name"));
  const viaGetProperty = /getProperty\(\s*data\s*,\s*field\s*\)/
    .test(CC?.prototype?.indexDocument?.toString?.() ?? "");
  return { viaGetProperty, projected };
}
