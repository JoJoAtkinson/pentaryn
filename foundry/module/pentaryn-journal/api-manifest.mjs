/**
 * Pentaryn Player Journal — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every row is the legacy surface, unchanged in signature (`legacy: true`): the methods take a
 * Document of several kinds or a User, so no first param is resolved as a `ref`. Methods run as the
 * CALLING user: add/status answer for game.user, and return null for a GM unless `gmButton` is on.
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
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-journal.kind", "flags.pentaryn-journal.userId", "flags.pentaryn-journal.source"],
    reads: ["flags.item-piles.data"],
  },
  unlisted: CORE_NAMES.map(n => `core.${n}`),
});
