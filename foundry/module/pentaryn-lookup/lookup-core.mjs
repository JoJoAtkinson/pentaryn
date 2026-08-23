/**
 * Pure lookup logic — no Foundry, no `game`, no DOM. Everything that can be silently
 * wrong lives here, so it can be tested with `node test/run.mjs`.
 *
 * The adapter (pentaryn-lookup.mjs) turns `game.packs` into the plain shape below and
 * calls these. Nothing here knows that Foundry exists.
 *
 *   book = {id, label, edition?, docs: [{id, name, pages: [{id, name, html}]}]}
 *
 * Why the split: every one of the five known traps in this workflow fails *silently* —
 * `getIndex({fields})` returning empty objects, `EmbeddedCollection` having no
 * `.length` (so sums become NaN and serialize to null), enricher noise surviving a
 * naive tag-strip, and an over-large return being truncated by the transport. None of
 * those throw. A fixture suite is the only thing that notices.
 */

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
  // [[/save dex 15]] -> save dex 15   [[3d6]] -> 3d6
  [/\[\[\/?([^\]]*)\]\]/g, "$1"],
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
        const text = toPlainText(page.html);
        if (!text) continue;
        re.lastIndex = 0;
        const found = text.match(re);
        if (!found) continue;
        total += 1;
        re.lastIndex = 0;
        const at = text.search(new RegExp(re.source, "i"));
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
  const uuid = pageUuid(book.id, doc.id, page.id);
  if (opts.raw) return { journal: doc.name, page: page.name, uuid, raw: page.html ?? "" };

  const full = toPlainText(page.html);
  const max = clamp(opts.maxChars, LIMITS.pageChars, 40000);
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
