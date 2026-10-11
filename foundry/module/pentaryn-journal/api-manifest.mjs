/**
 * Pentaryn Player Journal — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * The legacy rows keep their signature (`legacy: true`): they take a Document of several kinds or a
 * User, so no first param is resolved as a `ref`, and they run as the CALLING user — add/status
 * answer for game.user, and return null for a GM unless `gmButton` is on. The reads added for an
 * LLM caller (items-journal-35: inspect, entriesOf, statusFor, lastReason) take a user ref instead.
 *
 * `core.<name>` are the pure helpers, published as `unlisted` constants and functions (a frozen copy).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./journal-core.mjs";

/** The 18 core names published as `journal.core` since before the migration (golden/core-keys.json). */
export const CORE_NAMES = Object.freeze([
  "MAX_BODY", "MOD", "SORT_DENSITY", "absolutizeUuids", "dropActive", "embedsToLinks", "escapeHTML", "findSaved",
  "fnv1a", "hashOf", "pageName", "planSave", "provenanceHTML", "sanitize", "snapshotHTML", "status", "stripSecrets",
  "validateEnsure",
]);

const DOC = { name: "doc", type: "JournalEntry|JournalEntryPage|Item", resolve: false, doc: "the readable, one of its pages, or a pile item" };
const USER = { name: "user", type: "User", optional: true, resolve: false, doc: "default: the calling user" };

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "personal",
      params: [USER],
      returns: "JournalEntry | null",
      gm: false, writes: false, legacy: true,
      nullWhen: "the user has no personal journal yet",
      doc: "The user's personal journal (the oldest one flagged {kind: 'personal', userId}).",
    },
    {
      path: "add",
      params: [DOC],
      returns: "Promise<{ journal, pageIds, created, updated } | null>",
      gm: false, writes: true, legacy: true,
      sideEffects: ["JournalEntryPage (created/updated in the caller's journal)", "flags.pentaryn-journal.source"],
      nullWhen: "no bar for that document for the caller, no journal, nothing visible, too large",
      doc: "What the Add button does, as the calling user: copy what they can see (secrets stripped) into their journal and open it.",
    },
    {
      path: "status",
      params: [DOC],
      returns: '"none" | "partial" | "saved" | "changed" | null',
      gm: false, writes: false, legacy: true,
      nullWhen: "no bar for that document for the caller",
      doc: "Where the document stands against the calling user's journal.",
    },
    {
      path: "open",
      params: [{ name: "pageId", type: "string", optional: true, doc: "default: the last page" }],
      returns: "Promise<JournalEntrySheet | null>",
      gm: false, writes: false, legacy: true,
      nullWhen: "the caller has no journal",
      doc: "Open the calling user's journal on a page.",
    },
    {
      path: "shouldShowBar",
      params: [{ name: "entry", type: "JournalEntry", resolve: false }, USER],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Whether that user gets the bar on that journal (observer and not owner; a GM only with gmButton).",
    },
    {
      path: "ensure",
      params: [{ name: "user", type: "User", resolve: false }],
      returns: "Promise<JournalEntry>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["JournalEntry (the user's journal)", "Folder (Player Journals)", "flags.pentaryn-journal.kind", "flags.pentaryn-journal.userId"],
      doc: "GM: find or create that player's journal. Rejects with a plain Error: 'GM only' on a player client, "
        + "'no such user', or 'a GM does not get a journal through the relay'.",
    },
    {
      path: "ensureAll",
      params: [],
      returns: "Promise<report() | null>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["JournalEntry (one per player)", "Folder (Player Journals)", "JournalEntry.folder (strays moved in)"],
      nullWhen: "called by a player",
      doc: "GM: a journal for every player, and journals at the root moved into the folder. Returns report().",
    },
    {
      path: "report",
      params: [],
      returns: "{ folder, users: [{ user, userId, isGM, journalId, pages, duplicates }], atRoot }",
      gm: false, writes: false, legacy: true,
      doc: "Ungated (ids, names and counts only): every user's journal id, page count and duplicates; journals at the root.",
    },
    {
      path: "inspect",
      params: [{ name: "ref", kind: "user", type: "User|id|exact name", doc: "never a substring" }],
      returns: "{ user, journal, duplicates, entries: [{ pageId, name, key, place, savedAt, updatedAt, hash }] }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS"],
      since: "0.1.0",
      doc: "Read-only, plain JSON: that user's personal journal (or null), duplicate journal ids, and one row per page.",
    },
    {
      path: "entriesOf",
      params: [{ name: "ref", kind: "user", type: "User|id|exact name", doc: "never a substring" }],
      returns: "[{ pageId, name, key, place, savedAt, updatedAt, hash }]",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS"],
      since: "0.1.0",
      doc: "One row per page of that user's journal ([] without one). key is the source uuid; null on a page they wrote.",
    },
    {
      path: "statusFor",
      params: [DOC, { name: "opts", type: "{ as? }", optional: true, doc: "as: a user ref (default the caller)" }],
      returns: '"none" | "partial" | "saved" | "changed" | null',
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS"],
      nullWhen: "not a journal, a page, or an item in a pile",
      since: "0.1.0",
      doc: "status() for any user and without the bar's visibility rule: what they would have saved against their journal.",
    },
    {
      path: "lastReason",
      params: [],
      returns: '"no-target" | "no-journal" | "nothing-visible" | "too-large" | null',
      gm: false, writes: false,
      since: "0.1.0",
      doc: "Why this client's last add() or status() returned null (null after a non-null result).",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-journal.kind", "flags.pentaryn-journal.userId", "flags.pentaryn-journal.source",
      "flags.pentaryn-journal.claims.ensure"],
    reads: ["flags.item-piles.data"],
  },
  unlisted: CORE_NAMES.map(n => `core.${n}`),
});
