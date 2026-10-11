/**
 * Pentaryn Token Name Sync — the published API as PURE data (use-doc §5.1a). The kit's buildApi
 * reads it with the implementation map in the entry; a row without an implementation, or an
 * implementation without a row, throws at load.
 *
 * All three rows are legacy: they keep the signatures published before the blueprint.
 */

import { CONTRACT, FLAG_SCOPE, MODULE, NS, VERSION } from "./names-core.mjs";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: FLAG_SCOPE,
  flags: { writes: [], reads: [] },
  rows: [
    {
      path: "sync",
      params: [{ name: "ref", kind: "actor", resolve: false }, { name: "oldName", type: "string" }, { name: "newName", type: "string" }],
      returns: "number",
      gm: false,
      writes: true,
      legacy: true,
      sideEffects: ["Actor.update prototypeToken.name", "Scene.updateEmbeddedDocuments Token", "ui.notifications.info"],
      throws: ["TypeError"],
      doc: "Relabel the prototype token and every placed token of the actor this user can edit, where the "
        + "label was the old name or its part before the first comma. Returns the number of labels changed. "
        + "ref: an Actor, a token or placeable, a UUID, a 16-character id or a whole name (exact, then "
        + "case-insensitive; never a substring). An ambiguous name returns fail(\"AMBIGUOUS\"); a ref that "
        + "matches nothing rejects with a TypeError (legacy). A rename through actor.update already "
        + "relabels on the renaming client — call this only to repair.",
    },
    {
      path: "relabel",
      params: [{ name: "label", type: "string" }, { name: "oldName", type: "string" }, { name: "newName", type: "string" }],
      returns: "string|null",
      gm: false,
      writes: false,
      legacy: true,
      doc: "Pure preview: the label a token would get after a rename, or null when the label is a nickname.",
    },
    {
      path: "shortName",
      params: [{ name: "name", type: "string" }],
      returns: "string",
      gm: false,
      writes: false,
      legacy: true,
      doc: "Pure: the part of a name before the first comma, trimmed (\"Glubbek, Kuo-toa Net-Mender\" → \"Glubbek\").",
    },
  ],
});
