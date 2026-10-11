/**
 * Pentaryn Tool Cursors — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * The first three rows are the API of 0.2.0 (game.pentaryn.cursors), unchanged; `keys` is a frozen
 * table, not a function, so it is `unlisted`. status() is additive (finding -32).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./cursors-core.mjs";

const KEY = "string|null";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "refresh",
      params: [],
      returns: KEY,
      gm: false, writes: false,
      doc: "Recompute the map cursor for the active control, tool and spell-area placement, and "
        + "apply it to #board (this browser only). Returns the cursor key, or null for the system arrow.",
    },
    {
      path: "current",
      params: [],
      returns: KEY,
      gm: false, writes: false,
      doc: "The cursor key on #board now, or null (system arrow, setting off, or no canvas).",
    },
    {
      path: "keyFor",
      params: [{ name: "state", type: "{ control?, tool?, templatesActive? }", optional: true,
        doc: "templatesActive: a spell-area placement is following the mouse" }],
      returns: KEY,
      gm: false, writes: false,
      doc: "Pure: the cursor key for a control/tool state, ignoring the setting.",
    },
    {
      path: "status",
      params: [],
      returns: "{ enabled, key, control, tool, placementActive, boardCursor, dataset, imageSet, expected }",
      gm: false, writes: false,
      doc: "Read-only diagnosis of a wrong cursor in one call: the setting, the active control/tool, "
        + "whether a placement is live, #board's style.cursor and data-pentaryn-cursor, image-set "
        + "support, and the key expected (key is null while the setting is off). Writes nothing.",
    },
  ],
  flags: { writes: [], reads: [] },
  unlisted: ["keys"],
});
