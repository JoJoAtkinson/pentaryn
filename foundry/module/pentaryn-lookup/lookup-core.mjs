/**
 * Pure lookup logic — no Foundry, no `game`, no DOM. Everything that can be silently
 * wrong lives here, so it can be tested with `node test/run.mjs`.
 *
 * The adapter (packs-adapter.mjs) turns `game.packs` into the plain shape below, and the
 * feature (books.mjs) calls these. Nothing here knows that Foundry exists.
 *
 *   book = {id, label, edition?, docs: [{id, name, pages: [{id, name, html, text?}]}]}
 *
 * Why the split: the four silent traps of the README's five (`globalThis.duplicate`,
 * gone in v14, at least throws) — `getIndex({fields})` returning empty objects,
 * `EmbeddedCollection` having no `.length` (so sums become NaN and serialize to null),
 * enricher noise surviving a naive tag-strip, and an over-large return being truncated
 * by the transport. None of those throw. A fixture suite is the only thing that notices.
 */

// ── identity ─────────────────────────────────────────────────────────────────
export const MODULE = "pentaryn-lookup";
export const SHORT = "lookup";
export const NS = "rules";                            // game.pentaryn.rules (reserved for this module)
export const VERSION = "0.3.0";                       // === module.json version (core-seams.test pins it)
export const CONTRACT = "pentaryn-lookup/api@1";      // bump the major on a published-shape change
/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

// ── which packs count as what ────────────────────────────────────────────────
// 2014 SRD is excluded from every default: this table runs D&D 2024, and quoting
// 2014 text at it is the quietest way to be wrong. When it IS asked for, its hits
// carry `edition: "2014"` so a mixed result cannot masquerade as current.
// `all` is derived so a book added to rules or monsters cannot drop out of packs().
const RULES_BOOKS = ["dnd-players-handbook.content", "dnd-dungeon-masters-guide.content", "dnd5e.content24"];
const MONSTER_BOOKS = ["dnd-monster-manual.content"];
export const BOOKSETS = {
  rules: RULES_BOOKS,
  monsters: MONSTER_BOOKS,
  all: [...RULES_BOOKS, ...MONSTER_BOOKS],
  "2014": ["dnd5e.rules"],
};
export const EDITIONS = { "dnd5e.rules": "2014", "dnd5e.spells": "2014" };
export const MONSTER_PACKS = ["dnd-monster-manual.actors", "dnd5e.actors24",
                              "dnd-players-handbook.actors", "dnd-dungeon-masters-guide.actors"];

/** Where monsters() lists from when no `packs` is given: the Monster Manual, then the 2024 SRD. */
export const MONSTER_LIST_PACKS = Object.freeze(["dnd-monster-manual.actors", "dnd5e.actors24"]);

/**
 * Where onList() looks a spell up by name: the PHB first, then the 2024 SRD, then the 2014 SRD.
 * The first entry must stay the pack OWNED_SPELL_PREFIX names (core-seams pins it, EXT-6).
 */
export const SPELL_PACKS = ["dnd-players-handbook.spells", "dnd5e.spells24", "dnd5e.spells"];

/**
 * `opts.books` → `{ids, warning?}`: an array as given, a BOOKSETS name its set, any other string with a
 * dot one pack id; anything else is the rules set with a warning, so a typo is not answered silently (R5).
 * An empty array is absent: the rules set (lookup-edge-6).
 */
export function resolveBooks(books) {
  if (!books || (Array.isArray(books) && !books.length)) return { ids: BOOKSETS.rules };
  if (Array.isArray(books)) return { ids: books };
  const s = String(books);
  if (Object.hasOwn(BOOKSETS, s)) return { ids: BOOKSETS[s] };
  if (typeof books === "string" && s.includes(".")) return { ids: [s] };
  return { ids: BOOKSETS.rules,
           warning: `books ignored: expected ${Object.keys(BOOKSETS).map(k => `'${k}'`).join(", ")}, a pack id or an array` };
}

/** `opts.books` → pack ids (resolveBooks without its warning). */
export function resolveBookIds(books) {
  return resolveBooks(books).ids;
}

export function missingPackError(missing) {
  return { error: `compendium pack(s) not found: ${missing.join(", ")} — ` +
                  `is the module enabled in Manage Modules?` };
}

// ── limits ───────────────────────────────────────────────────────────────────
// Tuned against the transport: eval-js truncates large returns, and the reader pays
// tokens per hit. Five hits at ~240 chars is ≈2 KB — legible and cheap. `total` is
// what keeps that honest: it reports every match, not just the ones shown.
export const LIMITS = {
  hits: 5, hitsMax: 20,
  snippet: 240, snippetMax: 600,
  pageChars: 6000,
  payloadBytes: 8192,
};
/** page()'s maxChars ceiling (module-local; not part of the published LIMITS). */
const PAGE_CHARS_MAX = 40000;

// ── enricher + HTML normalization ────────────────────────────────────────────
// Measured on 2026-08-22: 5,052 `@UUID[...]` across PHB/DMG/MM/content24, plus 312
// inline rolls. A naive `replace(/<[^>]+>/g," ")` leaves every one of them intact, so
// a 240-char snippet can spend 80 of those characters on a compendium path.
//
// Order matters: labelled forms first (keep the label), then bare forms, then tags.
// An unknown enricher degrades to its bracketed text rather than vanishing — losing a
// rule's words is worse than leaving a stray token in them.
const ENRICHERS = [
  // @UUID[...]{Label} -> Label      @UUID[...] -> (dropped; the link target is noise)
  [/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1"],
  [/@UUID\[[^\]]*\]/g, ""],
  // &Reference[x]{Label} / &Check[...]{Label} -> Label   (& may arrive HTML-escaped)
  [/&(?:amp;)?[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, "$1"],
  // &Reference[Half Cover] -> Half Cover
  [/&(?:amp;)?[A-Za-z]+\[([^\]]*)\]/g, "$1"],
  // [[/r 4d6kh3]]{Label} / [[2d6]]{Label} -> Label   (the formula is dropped, like a UUID target)
  [/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1"],
  // [[/r 4d6kh3]] -> 4d6kh3   [[/save dex 15]] -> save dex 15   [[3d6]] -> 3d6
  [/\[\[(?:\/(?:r|roll|gmr|gmroll|br|broll|blindroll|sr|selfroll|pr|publicroll)\s+|\/)?([^\]]*)\]\]/g, "$1"],
];

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", times: "×", minus: "−", deg: "°",
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Foundry-flavoured HTML -> readable plain text.
 *
 * Block tags become spaces rather than nothing, so `<p>a</p><p>b</p>` reads "a b" and
 * not "ab" — word-joining across paragraphs corrupts search matches as well as prose.
 */
export function toPlainText(html) {
  if (typeof html !== "string" || !html) return "";
  let s = html;
  for (const [re, rep] of ENRICHERS) s = s.replace(re, rep);
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

// ── uuids ────────────────────────────────────────────────────────────────────
// Pure string building, and the easiest thing in the module to get subtly wrong.
// This is the value a rules answer is actually pasted into Foundry chat as.
export function pageUuid(packId, docId, pageId) {
  return `Compendium.${packId}.JournalEntry.${docId}.JournalEntryPage.${pageId}`;
}
export function actorUuid(packId, actorId) {
  return `Compendium.${packId}.Actor.${actorId}`;
}

// ── search ───────────────────────────────────────────────────────────────────
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(v, fallback, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** A window of text centred on `at`, nudged to word boundaries. */
export function snippetAround(text, at, width) {
  if (text.length <= width) return text;
  let start = Math.max(0, at - Math.floor(width / 3));
  let end = Math.min(text.length, start + width);
  start = Math.max(0, end - width);
  if (start > 0) { const sp = text.indexOf(" ", start); if (sp > -1 && sp < start + 24) start = sp + 1; }
  if (end < text.length) { const sp = text.lastIndexOf(" ", end); if (sp > start + width - 24) end = sp; }
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

/**
 * Full-text search across already-loaded books.
 *
 * One hit per page — the first match — with `matches` recording how many times the
 * page matched. A page that says "cover" nine times must not consume nine of five
 * slots.
 */
export function searchBooks(books, query, opts = {}) {
  const q = String(query ?? "").trim();
  if (!q) return { error: "search(query) needs a non-empty query" };

  const limit = clamp(opts.limit, LIMITS.hits, LIMITS.hitsMax);
  const width = clamp(opts.snippet, LIMITS.snippet, LIMITS.snippetMax);
  const re = opts.regex ? safeRegExp(q) : new RegExp(escapeRegExp(q), "gi");
  if (re instanceof Error) return { error: `bad regex: ${re.message}` };

  const hits = [];
  let total = 0;
  for (const book of books ?? []) {
    for (const doc of book.docs ?? []) {
      for (const page of doc.pages ?? []) {
        const text = page.text ?? toPlainText(page.html);
        if (!text) continue;
        const found = text.match(re);
        if (!found) continue;
        total += 1;
        const at = text.search(re);
        const hit = {
          book: book.label ?? book.id,
          journal: doc.name,
          page: page.name,
          uuid: pageUuid(book.id, doc.id, page.id),
          matches: found.length,
          snippet: snippetAround(text, Math.max(0, at), width),
        };
        if (book.edition) hit.edition = book.edition;   // 2014 hits must not masquerade
        hits.push(hit);
      }
    }
  }

  hits.sort((a, b) => b.matches - a.matches);
  const shown = hits.slice(0, limit);
  const result = {
    query: q,
    books: (books ?? []).map(b => b.label ?? b.id),
    total,
    shown: shown.length,
    hits: shown,
  };
  if (total > shown.length) result.note = `${total} pages matched; showing ${shown.length}. Narrow the query or raise limit (max ${LIMITS.hitsMax}).`;
  return capPayload(result);
}

function safeRegExp(source) {
  try { return new RegExp(source, "gi"); } catch (err) { return err; }
}

/**
 * Last line of defence against the transport truncating mid-object. Drops whole hits,
 * and says so — a short honest answer beats a long one cut off at a random byte.
 */
export function capPayload(result, maxBytes = LIMITS.payloadBytes) {
  const size = (o) => JSON.stringify(o).length;
  if (size(result) <= maxBytes) return result;

  // The flags go on FIRST. Adding them after the loop was a real bug: the loop trimmed
  // to fit, then `note` and `truncated` pushed it back over the cap it had just
  // enforced — a capper that does not cap, failing silently, which is exactly the
  // class of bug this module exists to stop.
  const out = { ...result, hits: [...result.hits], truncated: true, note: "" };
  const setNote = () => {
    out.shown = out.hits.length;
    out.note = `payload capped at ${maxBytes} bytes; showing ${out.hits.length} of ${result.total} matching pages.`;
  };
  setNote();
  while (out.hits.length > 1 && size(out) > maxBytes) { out.hits.pop(); setNote(); }
  return out;
}

// ── plain books (the adapter feeds Foundry documents through these) ──────────
/**
 * A compendium's journal entries → the plain book every search reads, each page's plain `text`
 * stripped once here (searchBooks and renderPage use it; a page without `text` is stripped per
 * call, as fixtures are). `docs` and each `pages` are iterated with for…of (a live `doc.pages` is
 * an EmbeddedCollection: `.size`, never `.length`).
 */
export function toBook(id, label, edition, docs) {
  const out = [];
  for (const doc of docs ?? []) {
    const pages = [];
    for (const page of doc.pages ?? []) {
      const html = page.text?.content ?? "";
      pages.push({ id: page.id, name: page.name, html, text: toPlainText(html) });
    }
    out.push({ id: doc.id, name: doc.name, pages });
  }
  return { id, label, edition, docs: out };
}

/**
 * One document read by UUID → the `{ book, doc, page }` renderPage takes. `parent` is the page's
 * journal entry; a document with no parent (a JournalEntry, Actor, Item UUID) stands as its own.
 */
export function foundFromDoc({ documentName, uuid, id, name, html, pack, parent, packLabel, edition = EDITIONS[pack] }) {
  const p = parent ?? { id, name };
  const found = {
    book: { id: pack, label: packLabel ?? pack, edition },
    doc: { id: p.id, name: p.name },
    page: { id, name, html: html ?? "" },
  };
  // Not a page: answer the caller's uuid, never a fabricated `…JournalEntryPage.<id>` (LKM-11).
  if (uuid && documentName !== "JournalEntryPage") found.uuid = uuid;
  return found;
}

/**
 * page(<uuid>) of a document that is not a page (a JournalEntry, Actor, Item UUID) still renders —
 * as an empty page — so the answer says why (prompts-lookup-5). null for a page.
 */
export function nonPageWarning(uuid, documentName) {
  if (documentName === "JournalEntryPage") return null;
  return `${uuid} is a ${documentName}, not a JournalEntryPage — pass a page UUID from search()`;
}

/**
 * The first entry whose name equals `wanted` (case-insensitive), else — unless `substring` is off —
 * the first whose name contains it. `entries.find` only, so a Foundry index Collection works as-is.
 */
export function pickByName(entries, wanted, { substring = true } = {}) {
  const w = String(wanted).toLowerCase();
  return entries.find(e => e.name.toLowerCase() === w)
      ?? (substring ? entries.find(e => e.name.toLowerCase().includes(w)) : undefined);
}

// ── one page ─────────────────────────────────────────────────────────────────
/** Find a page by exact-then-loose name across books. Never returns undefined. */
export function findPage(books, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return { error: "page(name) needs a non-empty name" };
  const all = [];
  for (const book of books ?? [])
    for (const doc of book.docs ?? [])
      for (const page of doc.pages ?? [])
        all.push({ book, doc, page });

  let match = all.find(x => x.page.name.toLowerCase() === wanted)
           ?? all.find(x => x.page.name.toLowerCase().includes(wanted));
  if (match) return match;

  // A miss must be loud and useful, not `undefined`.
  const closest = all
    .map(x => x.page.name)
    .filter(n => { const l = n.toLowerCase(); return l.startsWith(wanted.slice(0, 3)) || wanted.startsWith(l.slice(0, 3)); })
    .slice(0, 8);
  return { notFound: true, name, closest,
           hint: closest.length ? "did you mean one of `closest`?" : "try rules.search() instead — page() matches page names, not text" };
}

export function renderPage(found, opts = {}) {
  if (!found || found.error || found.notFound) return found;
  const { book, doc, page } = found;
  const uuid = found.uuid ?? pageUuid(book.id, doc.id, page.id);
  if (opts.raw) return { journal: doc.name, page: page.name, uuid, raw: page.html ?? "" };

  const full = page.text ?? toPlainText(page.html);
  const max = clamp(opts.maxChars, LIMITS.pageChars, PAGE_CHARS_MAX);
  const offset = Math.max(0, Number(opts.offset) || 0);
  const slice = full.slice(offset, offset + max);
  const out = { book: book.label ?? book.id, journal: doc.name, page: page.name, uuid, text: slice };
  if (book.edition) out.edition = book.edition;
  if (full.length > offset + slice.length) {
    out.truncated = true;
    out.totalChars = full.length;
    out.nextOffset = offset + slice.length;
  }
  return out;
}

// ── embedded roll tables ─────────────────────────────────────────────────────
/**
 * The RollTable uuids a page embeds (`@Embed[Compendium.<pack>.RollTable.<id> rollable]`).
 * toPlainText drops embeds, so without this a page like the DMG's "Artifacts" loses the four
 * property tables that are the whole point of it.
 */
export function embeddedTableUuids(html) {
  const out = [];
  for (const m of String(html ?? "").matchAll(/@Embed\[([^\]\s]+)[^\]]*\]/g)) {
    if (/\.RollTable\./.test(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** A RollTable as plain rows: `{name, formula, uuid, rows: ["01-20 text", ...]}`. */
export function renderTable(t) {
  const rows = (t.results ?? []).map(r => {
    const [lo, hi] = r.range ?? [];
    const span = lo === hi ? `${lo}` : `${lo}-${hi}`;
    // v14 document results keep their label in `name` with `description` "" (lookup-edge-1)
    const text = toPlainText(r.description || r.name || r.text || "");
    return `${span} ${text}`.trim();
  });
  return { name: t.name, formula: t.formula ?? "", uuid: t.uuid, rows };
}

// ── monsters ─────────────────────────────────────────────────────────────────
/**
 * Deliberately shallow. dnd5e's system data model churns faster than core, so the
 * digest names only fields worth the coupling; anything deeper belongs in a raw
 * eval-js call where a breakage is visible rather than baked into a helper.
 * A missing field reports itself instead of leaving a null hole.
 */
export function monsterDigest(raw) {
  if (!raw) return { notFound: true };
  const sys = raw.system ?? {};
  const cr = sys.details?.cr;
  const ac = sys.attributes?.ac?.value ?? sys.attributes?.ac?.flat;
  const hp = sys.attributes?.hp?.max;
  const missing = [];
  if (typeof cr !== "number") missing.push("system.details.cr");
  if (typeof ac !== "number") missing.push("system.attributes.ac.value");
  if (typeof hp !== "number") missing.push("system.attributes.hp.max");

  const out = {
    name: raw.name,
    pack: raw.packId,
    uuid: actorUuid(raw.packId, raw.id),
    cr, ac, hp,
    size: sys.traits?.size,
    type: sys.details?.type?.value,
    features: (raw.items ?? []).map(i => ({ name: i.name, type: i.type })),
  };
  if (missing.length) {
    out.warning = `dnd5e data paths missing: ${missing.join(", ")} — the system data model may have moved. ` +
                  `Verify with a raw eval-js read before trusting this digest.`;
  }
  return out;
}

/** Enriched roll text leaves spaces before punctuation ("+4 , reach 5 ft ."): close them up. */
export const tidy = t => t.replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s+/g, "(");

/**
 * One featureTexts() row from an item and its enriched description HTML: the first activity's
 * activation (else the legacy system.activation; "" reads as null), a recharge recovery as "n-6"
 * (no formula reads "6-6"), and the text as tidy plain text. Key order is the published shape.
 */
export function featureRow({ name, type, system }, enriched) {
  const act = system?.activities?.contents?.[0]?.activation?.type ?? system?.activation?.type ?? null;
  const rch = system?.uses?.recovery?.find?.(r => r.period === "recharge");
  return { name, type, activation: act || null,
    recharge: rch ? `${rch.formula ?? "6"}-6` : null, text: tidy(toPlainText(enriched)) };
}

// ── monsters(): the query grammar, filter, order and page ────────────────────
// TWIN: pentaryn-prompts keeps its own copies — SIZE_WORDS and parseCr (core/size.mjs; used by
// actor-patch-adapter.mjs). Modules never import each other (prompts-lookup-9), so a
// change to either side is made on both, deliberately.
export const SIZE_KEYS = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg",
                           huge: "huge", gargantuan: "grg", grg: "grg" };

/** "1/4" → 0.25, "3" → 3; empty, null and non-numbers → null. */
export function crNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(v));
  const n = m ? Number(m[1]) / Number(m[2]) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A CR range: "-", en-dash, em-dash or " to " between two values, each with an optional "CR". */
const CR_RANGE = /^\s*(?:cr\s*)?([\d/.]+)(?:\s*[-\u2013\u2014]\s*|\s+to\s+)(?:cr\s*)?([\d/.]+)\s*$/i;

/**
 * `monsters(q)`'s options → `{ size, type, lo, hi, name, limit, packIds, warning? }`. `cr` is a value
 * ("1/4", 3, "CR 3") or a range ("1/2-2", "1/2 to 2"); a `cr` that names no bound filters nothing and
 * warns (lookup-edge-5). `minCr`/`maxCr` override either end; `limit` defaults to 40, max 200.
 */
export function monsterQuery(q = {}) {
  const size = q.size ? SIZE_KEYS[String(q.size).toLowerCase()] ?? String(q.size).toLowerCase() : null;
  const type = q.type ? String(q.type).toLowerCase() : null;
  let lo = null, hi = null, crWarning = null;
  if (q.cr !== undefined && q.cr !== null && q.cr !== "") {
    const m = CR_RANGE.exec(String(q.cr));
    if (m) { lo = crNum(m[1]); hi = crNum(m[2]); } else { lo = hi = crNum(String(q.cr).replace(/^\s*cr\s*/i, "")); }
    if (lo === null && hi === null) crWarning = `cr not understood: ${q.cr} — use '3', '1/4' or '1/2-2'`;
  }
  if (q.minCr !== undefined) lo = crNum(q.minCr);
  if (q.maxCr !== undefined) hi = crNum(q.maxCr);
  const name = q.name ? String(q.name).toLowerCase() : null;
  const limit = Math.max(1, Math.min(Number(q.limit) || 40, 200));
  // R5: a string is one pack id (not its characters); a number or object is ignored, with a warning.
  // lookup-edge-6: an empty array is absent — the default list, not 0.
  const packs = Array.isArray(q.packs) && !q.packs.length ? null : q.packs ?? null;
  const usable = packs === null || typeof packs === "string" || Array.isArray(packs);
  const packIds = typeof packs === "string" ? [packs] : Array.isArray(packs) ? packs : [...MONSTER_LIST_PACKS];
  const warning = [usable ? null : "packs ignored: expected a pack id or an array", crWarning].filter(Boolean).join("; ");
  return { size, type, lo, hi, name, limit, packIds, ...(warning ? { warning } : {}) };
}

/** The index fields matchMonster and monsterRow read (getIndex({fields})). */
export const MONSTER_INDEX_FIELDS = Object.freeze(["type", "system.details.cr", "system.traits.size", "system.details.type.value", "system.details.type.subtype"]);

/** One compendium index entry against a parsed query: NPCs only; size, type, CR range, name substring. */
export function matchMonster(e, { size, type, lo, hi, name }) {
  if (e.type !== "npc") return false;
  const cr = e.system?.details?.cr, sz = e.system?.traits?.size, ty = e.system?.details?.type?.value;
  if (size && sz !== size) return false;
  if (type && String(ty ?? "").toLowerCase() !== type) return false;
  if (lo !== null && !(cr >= lo)) return false;
  if (hi !== null && !(cr <= hi)) return false;
  if (name && !e.name.toLowerCase().includes(name)) return false;
  return true;
}

/** A matched index entry → the published row. */
export function monsterRow(e, packId) {
  const ty = e.system?.details?.type?.value, sub = e.system?.details?.type?.subtype;
  return { name: e.name, cr: e.system?.details?.cr, size: e.system?.traits?.size, type: sub ? `${ty} (${sub})` : ty,
           uuid: e.uuid ?? actorUuid(packId, e._id), pack: packId };
}

/**
 * Lowest CR first, then name — in place. A row with no CR makes the first term NaN (falsy), so it
 * falls through to the name order: kept as shipped, do not "fix" it.
 */
export function sortMonsters(rows) {
  rows.sort((a, b) => (a.cr - b.cr) || a.name.localeCompare(b.name));
  return rows;
}

export function pageMonsters(rows, limit) {
  return { count: rows.length, shown: Math.min(rows.length, limit), monsters: rows.slice(0, limit),
           ...(rows.length > limit ? { hint: `narrow it (size, type, cr) or raise limit; ${rows.length - limit} more` } : {}) };
}

// ── spell lists (dnd5e's registry, injected) ─────────────────────────────────
/**
 * The registry's list for `type:identifier` (identifier lower-cased), or null. A throw inside the
 * registry is also null; `onError(err)` lets the caller trace it (core stays pure).
 */
export function listFor(registry, type, identifier, onError = null) {
  try { return registry.spellLists.forType(type, String(identifier).toLowerCase()) ?? null; }
  catch (err) { onError?.(err); return null; }
}

/**
 * Every list the registry knows, as `type:identifier` values; [] when the registry (or its
 * `spellLists`) is missing or throws — the documented "no such list" answer, never a TypeError
 * (prompts-lookup-4). `onError(err)` lets the caller trace it.
 */
export function knownLists(registry, onError = null) {
  try { return registry.spellLists.options?.map(o => o.value) ?? []; }
  catch (err) { onError?.(err); return []; }
}

/**
 * The owned book's spell packs sort before any other contributor (the 2024 SRD lists Aid too).
 * Must name the pack SPELL_PACKS[0] is (core-seams pins it, EXT-6).
 */
export const OWNED_SPELL_PREFIX = "dnd-players-handbook";

/**
 * A spell list's uuids → `[[packId, [[uuid, docId], …]], …]`, one group per contributing pack, the
 * owned book's pack first (the rest keep the registry's order). A uuid that is not a
 * `Compendium.<pack>.Item.<id>` is skipped.
 */
export function groupListUuids(uuids) {
  const byPack = new Map();
  for (const u of uuids) {
    const m = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(u);
    if (!m) continue;
    if (!byPack.has(m[1])) byPack.set(m[1], []);
    byPack.get(m[1]).push([u, m[2]]);
  }
  const owned = id => (id.startsWith(OWNED_SPELL_PREFIX) ? 1 : 0);
  return [...byPack.keys()].sort((a, b) => owned(b) - owned(a)).map(id => [id, byPack.get(id)]);
}

/**
 * groupListUuids' groups plus each pack's index (`packId → index with .get(docId)`, or null when the
 * pack is absent) → `[{name, level, uuid}]`: one row per name, the first pack's wins; `level` (when
 * not null) keeps that spell level only; ordered by level, then name. A uuid the index lacks keeps
 * the uuid as its name and a null level. A row from a pack in EDITIONS carries its `edition` (EXT-5).
 */
export function spellListRows(groups, indexes, level = null) {
  const seen = new Set(), out = [];
  for (const [id, entries] of groups) {
    const idx = indexes.get(id);
    for (const [u, docId] of entries) {
      const e = idx?.get(docId);
      const name = e?.name ?? u, lvl = e?.system?.level ?? null;
      if (seen.has(name)) continue;
      if (level !== null && lvl !== Number(level)) continue;
      seen.add(name);
      out.push(EDITIONS[id] ? { name, level: lvl, uuid: u, edition: EDITIONS[id] } : { name, level: lvl, uuid: u });
    }
  }
  out.sort((a, b) => ((a.level ?? 0) - (b.level ?? 0)) || String(a.name).localeCompare(String(b.name)));
  return out;
}

// ── names(): the PHB's names for a character spec ────────────────────────────
/** Where each group of names lives, and the index fields its grouping reads (getIndex({fields})). */
export const NAME_SOURCES = Object.freeze({
  classes: { pack: "dnd-players-handbook.classes", fields: ["type", "system.identifier", "system.classIdentifier"] },
  origins: { pack: "dnd-players-handbook.origins", fields: ["type", "system.type.value"] },
  feats: { pack: "dnd-players-handbook.feats", fields: ["type", "system.type.value", "system.type.subtype"] },
});

/**
 * Every pack a lookup reads, for packs(): the books, the 2014 SRD, the monster packs, the spell
 * packs onList/spellList read, then the PHB name packs names() reads — unique, in that order (EXT-3).
 * Derived, so a pack added to any of those tables cannot drop out of the session-opening probe.
 */
export const KNOWN_PACKS = Object.freeze([...new Set([
  ...BOOKSETS.all, ...BOOKSETS["2014"], ...MONSTER_PACKS, ...SPELL_PACKS,
  ...Object.values(NAME_SOURCES).map(s => s.pack),
])]);

/** `names(kind)` words → the part of the answer they pick (case-insensitive). */
export const NAME_PARTS = Object.freeze({
  class: "classes", classes: "classes", subclass: "subclasses", subclasses: "subclasses",
  species: "species", race: "species", background: "backgrounds", backgrounds: "backgrounds",
  feat: "feats", feats: "feats",
});

/**
 * The three NAME_SOURCES indexes (`{classes, origins, feats}`, each an iterable of entries; [] for a
 * missing pack) → `{classes, subclasses: {<classIdentifier | "?">: […]}, species, backgrounds,
 * feats: {<subtype | "other">: […]}}`, every list sorted. A `kind` NAME_PARTS knows answers that one
 * part alone; any other kind answers everything.
 */
export function groupNames({ classes = [], origins = [], feats = [] } = {}, kind = null) {
  const out = { classes: [], subclasses: {}, species: [], backgrounds: [], feats: {} };
  for (const e of classes) {
    if (e.type === "class") out.classes.push(e.name);
    if (e.type === "subclass") (out.subclasses[e.system?.classIdentifier ?? "?"] ??= []).push(e.name);
  }
  for (const e of origins) {
    if (e.type === "race") out.species.push(e.name);
    if (e.type === "background") out.backgrounds.push(e.name);
  }
  for (const e of feats) {
    if (e.type !== "feat") continue;
    (out.feats[e.system?.type?.subtype || "other"] ??= []).push(e.name);
  }
  const sort = a => a.sort((x, y) => x.localeCompare(y));
  sort(out.classes); sort(out.species); sort(out.backgrounds);
  for (const k of Object.keys(out.subclasses)) sort(out.subclasses[k]);
  for (const k of Object.keys(out.feats)) sort(out.feats[k]);
  const word = kind ? String(kind).toLowerCase() : null;
  const part = word && Object.hasOwn(NAME_PARTS, word) ? NAME_PARTS[word] : null;
  return part ? { [part]: out[part] } : out;
}
