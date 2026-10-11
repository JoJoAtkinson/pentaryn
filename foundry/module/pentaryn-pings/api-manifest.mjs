/**
 * Pentaryn Ping Log — the published API as pure data (use-doc §5.1a). The implementations are in
 * the entry; buildApi throws at ready on any drift between the two.
 *
 * The four rows are the legacy surface, unchanged in signature. The namespace is published on GM
 * clients only (players never write the store, and have no game.pentaryn.pings).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./pings-core.mjs";

/** The decorated record every reader returns (README "API"). */
export const RECORD =
  "{ t, userId, userName, sceneId, sceneName, x, y, canvas: {x, y}, image: {x, y}, gridSquare: {i, j}, snapped: {x, y}, age, ageMs }";

const READ = "Reads the stored log, which can trail the newest ping until the next write (≤ 250 ms after it). GM clients only.";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "last",
      params: [],
      returns: `${RECORD} | null`,
      gm: false,
      writes: false,
      legacy: true,
      nullWhen: "the log is empty or unreadable",
      doc: `The most recent ping, decorated: x/y are canvas coordinates (token space). ${READ}`,
    },
    {
      path: "recent",
      params: [{ name: "n", type: "number", optional: true, default: 10, doc: "how many; 0 returns all of them (quirk), a negative n drops the oldest" }],
      returns: `${RECORD}[] (newest first)`,
      gm: false,
      writes: false,
      legacy: true,
      doc: `The last n pings, newest first. ${READ}`,
    },
    {
      path: "all",
      params: [],
      returns: `${RECORD}[] (oldest first)`,
      gm: false,
      writes: false,
      legacy: true,
      doc: `The whole log, oldest first. ${READ}`,
    },
    {
      path: "clear",
      params: [],
      returns: "Promise<true>",
      gm: true,
      writes: true,
      legacy: true,
      sideEffects: ["setting pentaryn-pings.log"],
      doc: "Empties the in-memory buffer and writes an empty log. Resolves true; a failed write rejects.",
    },
  ],
  flags: { writes: [], reads: [] },
});
