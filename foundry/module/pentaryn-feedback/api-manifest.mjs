/**
 * Pentaryn Feedback — the API manifest. PURE DATA: node imports it without a Foundry stub, describe()
 * reports it, and buildApi() refuses to load when it and api.mjs's implementations drift apart.
 *
 * Add a method: a row here + an impl in api.mjs (or a contribution from a feature's install())
 * + a fixture in test/api.test.mjs. Then GOLDEN_UPDATE=1 node --test test/api.test.mjs, and
 * review the golden diff.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./feedback-core.mjs";

const REF = { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" };

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "inspect",
      params: [REF, { name: "opts", type: "{ sceneId?, as? }", optional: true }],
      returns: "{ actor, note, lastSeen, hp? }",
      gm: false, writes: false, query: true,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only state for one actor, plain JSON, depth ≤ 4. opts.sceneId scopes a token ref; "
        + "opts.as = a user ref answers with that user's view (note and lastSeen GM-only).",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync.",
    },
    {
      path: "note",
      params: [REF, { name: "opts", type: "{ text, dryRun? }" }],
      returns: "{ ok: true, actor, note } | { ok: false, code, reason }",
      gm: true, writes: true,
      sideEffects: ["flags.pentaryn-feedback.note"],
      doc: "Set (or, with empty text, clear) the actor's GM note. Never throws for a refusal: "
        + "an unknown or ambiguous ref, or a player caller, returns { ok: false, code, reason }.",
    },
  ],
  flags: { writes: ["flags.pentaryn-feedback.note"], reads: [] },
  unlisted: [],
});
