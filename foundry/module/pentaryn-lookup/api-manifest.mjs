/**
 * pentaryn-lookup — the API manifest. PURE DATA: node imports it without a Foundry stub, describe()
 * reports it, and buildApi() refuses to load when it and the implementations drift apart.
 *
 * Every lookup row is `legacy: true`: its answer is an object that says what went wrong
 * (`{error}`, `{notFound, …, hint}`), never a coded throw. `returns` is the shape an LLM must
 * iterate — read it before treating a result as an array.
 *
 * `query: true` rows are also GM-guarded CONFIG.queries["pentaryn-lookup.<path>"] (registered at init
 * by the kit's registerQueries); `args` maps the query payload onto the legacy positional signature.
 *
 * Add a method: a row here + an impl in books.mjs (or api.mjs) + a case in test/api.test.mjs.
 * Then GOLDEN_UPDATE=1 node --test test/api-kit.test.mjs, and review the golden diff.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./lookup-core.mjs";

const BOOKS = "'rules' (PHB, DMG, 2024 SRD; default) | 'monsters' | 'all' | '2014' | pack id[]";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "search",
      params: [
        { name: "query", type: "string", doc: "plain text, case-insensitive; a regex with opts.regex" },
        { name: "opts", type: `{ books?: ${BOOKS}, limit? (5, max 20), snippet? (240, max 600), regex? }`, optional: true },
      ],
      returns: "{ query, books, total, shown, hits: [{ book, journal, page, uuid, matches, snippet, edition? }], "
        + "note?, truncated?, warning? } | { error }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.query, d],
      doc: "Full-text search of the owned books, one hit per page, most matches first. Returns an object — iterate `.hits`; "
        + "`total` counts every matching page. A 2014 hit carries edition: '2014'.",
    },
    {
      path: "page",
      params: [
        { name: "ref", resolve: false, type: "page UUID | page name", doc: "a hit's uuid from search(), or an exact-then-substring page name" },
        { name: "opts", type: `{ books?: ${BOOKS}, maxChars? (6000), offset?, raw?, tables? (true) }`, optional: true },
      ],
      returns: "{ book, journal, page, uuid, text, edition?, truncated?, totalChars?, nextOffset?, "
        + "tables?: [{ name, formula, uuid, rows } | { uuid, error }] } | { journal, page, uuid, raw } "
        + "| { notFound, name, closest, hint } | { error }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.ref, d],
      doc: "One page as plain text, with its embedded roll tables. Page past maxChars with offset = nextOffset.",
    },
    {
      path: "monster",
      params: [
        { name: "name", type: "string", doc: "exact, then substring, across the Monster Manual, 2024 SRD, PHB and DMG actors" },
        { name: "opts", type: "{ text? }", optional: true, doc: "text: true adds each feature's enriched rules text" },
      ],
      returns: "{ name, pack, uuid, cr, ac, hp, size, type, features: [{ name, type }], warning? } "
        + "(text: features: [{ name, type, activation, recharge, text }], languages, speed) "
        + "| { notFound, name, searched, hint } | { error }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.name ?? d.ref, d],
      doc: "A shallow stat-block digest with the actor uuid; warning names any dnd5e data path that moved.",
    },
    {
      path: "monsters",
      params: [
        { name: "q", type: "{ size?, type?, cr? ('1/4', 3, '1/2-2'), minCr?, maxCr?, name?, limit? (40, max 200), packs? }", optional: true },
      ],
      returns: "{ count, shown, monsters: [{ name, cr, size, type, uuid, pack }], hint? }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d],
      doc: "NPCs by size, type and CR from the Monster Manual then the 2024 SRD, one per name, lowest CR first. "
        + "Returns an object — iterate `.monsters`.",
    },
    {
      path: "names",
      params: [{ name: "kind", type: "'class' | 'subclass' | 'species' | 'background' | 'feat'", optional: true }],
      returns: "{ classes, subclasses: { <class>: [] }, species, backgrounds, feats: { origin, general, fightingStyle, epicBoon, … } } "
        + "| one of those keys",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.kind ?? null],
      doc: "The PHB's own names for a character spec (species as the book spells them: 'Elf, High').",
    },
    {
      path: "packs",
      params: [],
      returns: "{ world, foundry, system, packs: [{ id, present, label?, type?, entries?, edition? }] }",
      gm: false, writes: false, legacy: true, query: true,
      args: () => [],
      doc: "Which book packs are installed — the session-opening probe.",
    },
    {
      path: "onList",
      params: [
        { name: "spell", type: "spell name | Item UUID" },
        { name: "cls", type: "class (or subclass) identifier, e.g. 'wizard'" },
        { name: "opts", type: "{ type?: 'class' | 'subclass' }", optional: true },
      ],
      returns: "{ spell, uuid, level, list, onList: true | false } | { spell, uuid, level, list, onList: null, hint } "
        + "| { notFound, spell, hint }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.spell, d.cls, { type: d.type ?? "class" }],
      doc: "Is a spell on a class's (or subclass's) list, from dnd5e's spell-list registry.",
    },
    {
      path: "spellList",
      params: [
        { name: "cls", type: "class (or subclass) identifier" },
        { name: "opts", type: "{ type?: 'class' | 'subclass', level? }", optional: true },
      ],
      returns: "{ list, count, spells: [{ name, level, uuid }] } | { error, known }",
      gm: false, writes: false, legacy: true, query: true,
      args: d => [d.cls, { type: d.type ?? "class", level: d.level ?? null }],
      doc: "The spells on a list, one per name (the PHB's copy first), by level then name.",
    },
    {
      path: "toPlainText",
      params: [{ name: "html", type: "string" }],
      returns: "string",
      gm: false, writes: false,
      doc: "Foundry HTML to plain text: enrichers reduced to their labels, tags and entities stripped.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, passed, failed, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live checks of every assumption against the installed books; run after a sync or an update.",
    },
  ],
  flags: { writes: [], reads: [] },
  unlisted: ["LIMITS"],
});
