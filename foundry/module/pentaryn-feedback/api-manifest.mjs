/**
 * Pentaryn Feedback — the API manifest. PURE DATA: node imports it without a Foundry stub, describe()
 * reports it, and buildApi() refuses to load when it and api.mjs's implementations drift apart.
 *
 * Add a method: a row here + an impl in api.mjs (or a contribution from a feature's install())
 * + a fixture in test/api.test.mjs. Then GOLDEN_UPDATE=1 node --test test/api.test.mjs, and
 * review the golden diff.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./feedback-core.mjs";

const USER = { name: "ref", kind: "user", type: "User|id|exact name", doc: "never a substring" };
const FILE = "Data/pentaryn-feedback/<worldId>/<id>.json";
const QUEUE = "flags.pentaryn-feedback.queue";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "user", type: "User|id|exact name|uuid|Actor|Token", resolve: false,
          doc: "never a substring; an Actor or Token (what the root game.pentaryn.inspect passes) means its players: "
            + "every non-GM user who owns it or has it as their assigned character. As a string: a user first, then "
            + "an Actor/Token uuid, or an actor id or exact name no user has" },
        { name: "opts", type: "{ as? }", optional: true },
      ],
      returns: "Promise<{ user, pending, reports, actions, errors }> | for an Actor/Token: "
        + "Promise<{ actor, users, pending, reports, actions, errors }>",
      gm: false, writes: false, query: true,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only state for one user, or an Actor's players together; plain JSON, depth ≤ 4: pending = report ids "
        + "waiting on their queues (the GM or that user only); reports = summaries of the reports they filed, oldest "
        + "first, last 20 (a GM client and viewer only, else null); actions/errors = this client's recorder rings, only "
        + "when the calling user is among them. An Actor with no player gives users: [], pending: [], reports: [].",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: published, bug button present, recorder installed, console wrap matches the setting.",
    },
    {
      path: "open",
      params: [{ name: "opts", type: "{ category?: 'bug'|'defect'|'feature', text? }", optional: true }],
      returns: "{ ok: true, open: true }",
      gm: false, writes: false,
      doc: "Open the report dialog on this client, optionally pre-filled (what the bug button and /bug do).",
    },
    {
      path: "submit",
      params: [{ name: "draft", type: "{ category?, text }" }, { name: "opts", type: "{ dryRun? }", optional: true }],
      returns: "{ ok: true, id, status: 'filed'|'queued' } | { ok: false, code, reason }",
      gm: false, writes: true,
      sideEffects: [QUEUE],
      doc: "File a report from this client without the dialog: queues it on the caller's own User flag, then asks the "
        + "active GM to write it to disk. status 'queued' = no GM answered; it is filed when one connects.",
    },
    {
      path: "ingest",
      params: [{ name: "opts", type: "{ userId, ids? }" }],
      returns: "{ ok: true, filed, refused, done } | { ok: false, code, reason }",
      gm: false, writes: true, query: true, relay: true,
      sideEffects: [QUEUE, FILE],
      doc: "Active GM only (any sender may ask): write every report waiting on that user's queue to its file and "
        + "delete it from the flag. Idempotent — a report already on disk is never overwritten.",
    },
    {
      path: "list",
      params: [{ name: "opts", type: "{ status?: 'open'|'triaged'|'resolved'|'wontfix'|'all', limit? }", optional: true }],
      returns: "{ reports: [{ id, t, category, status, user, world, text60 }], count }",
      gm: true, writes: false, query: true,
      throws: ["NOT_GM", "BAD_ARGS"],
      doc: "This world's filed reports, oldest first (default status 'open', limit 50). Reads the files through the server.",
    },
    {
      path: "get",
      params: [{ name: "opts", type: "{ id }", doc: "the full id or a unique prefix" }],
      returns: "the report JSON (schema v1)",
      gm: true, writes: false, query: true,
      throws: ["NOT_GM", "NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "One filed report from this world, by id or unique prefix.",
    },
    {
      path: "resolve",
      params: [{ name: "opts", type: "{ id, status, note?, force?, dryRun? }" }],
      returns: "{ ok: true, id, status, history } | { ok: false, code, reason }",
      gm: true, writes: true, query: true,
      sideEffects: [FILE],
      doc: "Move a report open → triaged → resolved | wontfix and append { t, status, note, by } to its history. "
        + "Reopening (→ open) or resolved → triaged needs force. The usual path is the repo's feedback_resolve MCP tool.",
    },
  ],
  flags: { writes: [QUEUE], reads: [] },
  unlisted: [],
});
