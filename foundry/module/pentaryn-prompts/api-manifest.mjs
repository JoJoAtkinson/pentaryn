/**
 * pentaryn-prompts — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, registerQueries() registers the `pentaryn-prompts.*` queries from it and
 * buildApi() refuses to load when it and the implementations drift apart.
 *
 * Every row that existed before the migration keeps its published signature (`legacy: true`): the
 * reads throw the module's own `CODE: detail` errors (geometry-core CODES) that the MCP fork's
 * prompt-markers tool parses, and replaceMany/replace keep their result shape instead of ok()/fail().
 * The new rows (inspect, markersOn, manifest, selftest) are plain reads.
 *
 * Query rows register in this order — list, gather, crops, replace, show — as they did by hand.
 * `pentaryn-prompts.replace` is the `replaceMany` row (queryName); the `replace` method is the
 * single-spec wrapper and is no query.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./prompts-core.mjs";

/** The bridge turns base64 crops into MCP image blocks; direct API calls get file paths instead. */
const BASE64 = d => ({ cropsAs: "base64", ...d });

const GATHER_OPTS = "{ scenes?: \"all\" | \"current\" | id | name | (…)[], crops?: \"auto\" | \"on\" | \"off\" | boolean, chars?, " +
  "unseenWithinFt?, builtWithoutProvenance?, maxPrompts?, from?, party?, cropsAs?: \"files\" | \"base64\" }";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "list",
      params: [{ name: "opts", optional: true, type: "{}" }],
      returns: "{ scenes: [{ id, name, nav, prompts, empty }] }",
      gm: true, writes: false, query: true, legacy: true,
      doc: "Scenes holding prompt markers, in navigation order, with how many prompts each has and how many are empty.",
    },
    {
      path: "gather",
      params: [{ name: "opts", optional: true, type: GATHER_OPTS }],
      returns: "{ call, text, counts, manifest, crops, next, ms, version, party, partySource, cropsNote }",
      gm: true, writes: false, query: true, legacy: true, wire: BASE64,
      sideEffects: ["world setting pentaryn-prompts.lastCalls (the manifest ring)", "Data/pentaryn-prompts-crops/<call>/ (cropsAs \"files\")"],
      throws: ["SCENE_UNKNOWN"],
      doc: "Every prompt on the chosen scenes with distances, bands, bearings, line of sight, encounters and loners, as text; "
        + "pages by prompt count (next). Stores the call's manifest for replace and crops. The query asks for base64 crops.",
    },
    {
      path: "crops",
      params: [{ name: "opts", type: "{ call, encounters?: string[], cropsAs?: \"files\" | \"base64\" }" }],
      returns: "{ crops: [{ encounter, scene, png | path, mime, mimeType, squares } | { encounter, scene, error }] }",
      gm: true, writes: false, query: true, legacy: true, wire: BASE64,
      sideEffects: ["Data/pentaryn-prompts-crops/<call>/ (cropsAs \"files\")"],
      throws: ["CALL_UNKNOWN", "BAD_SPEC"],
      doc: "Encounter images for a stored gather call (set dressing only: distances and sight come from the text).",
    },
    {
      path: "replaceMany",
      params: [
        { name: "input", type: "{ call?, replacements, dryRun?, force?, skipDryRun?, party?, specFile? } | replacement[]" },
        { name: "opts", optional: true, type: "{ call?, dryRun?, force?, skipDryRun? }" },
      ],
      returns: "{ dryRun, call, text, results: [flat row], remaining: { sceneId: n }, encounters }",
      gm: true, writes: true, query: true, queryName: "replace", legacy: true,
      sideEffects: ["Token/Note/AmbientLight/Tile creates on the marker's scene", "Actor/JournalEntry creates (npc, import, copy, hotspot, note, character)",
        "flags.pentaryn-prompts.provenance", "the replaced markers deleted"],
      throws: ["BAD_SPEC", "CALL_UNKNOWN", "DRY_RUN_REQUIRED"],
      doc: "Replace markers with the real thing on their footprints, provenance stamped, markers deleted only after their "
        + "replacement exists; a readback from the scene. Per-row failures come back in results; more than five need a dry run first.",
    },
    {
      path: "show",
      params: [{ name: "args", type: "{ call, id } | { sceneId, markerId }" }],
      returns: "{ ok, sceneId, x, y }",
      gm: true, writes: false, query: true, legacy: true,
      sideEffects: ["views the marker's scene", "canvas.animatePan", "canvas.ping"],
      throws: ["CALL_UNKNOWN", "BAD_SPEC", "SCENE_UNKNOWN", "MARKER_GONE"],
      doc: "Pan the GM canvas to a marker (or a built thing of a call), viewing its scene first, and ping it.",
    },
    {
      path: "replace",
      params: [{ name: "spec", type: "replacement (may carry dryRun / force / skipDryRun)" }, { name: "opts", optional: true }],
      returns: "the replaceMany result",
      gm: true, writes: true, legacy: true,
      doc: "ONE replacement — use replaceMany for a batch. Run options are read from opts or the spec itself.",
    },
    {
      path: "open",
      params: [{ name: "tokenOrId", type: "Token | TokenDocument | token id (the viewed scene first, then any scene)" }],
      returns: "PromptDialog | null",
      gm: true, writes: false, legacy: true, nullWhen: "not a GM, or not a prompt marker",
      doc: "Open a marker's prompt box.",
    },
    {
      path: "place",
      params: [{ name: "sizeKey", optional: true, type: "tiny | small | mid | large | xl | xxl (else the client's default)" },
        { name: "opts", optional: true, type: "{ ticket? }" }],
      returns: "TokenDocument | null",
      gm: true, writes: true, legacy: true, nullWhen: "not a GM, no canvas or scene, no marker actor of that size, or the create failed",
      sideEffects: ["Token create under the cursor", "arms type-ahead capture on this client for 3.5 s"],
      doc: "Place a marker under the cursor and open its box (the P key).",
    },
    {
      path: "ensureMarkers",
      params: [],
      returns: "{ folder, created, repaired } | { skipped }",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Folder \"Prompt Markers\"", "the six Prompt · <size> actors created or repaired"],
      doc: "Create the marker folder and any missing marker actor; repair drifted fields; never delete. Active GM only.",
    },
    {
      path: "model",
      params: [{ name: "sceneId", optional: true, doc: "default: the viewed scene" }],
      returns: "{ key, name, nav, gridFt, doors, walls, squares, mapFt, regions, levels, warn, notes, dims, items, rel(aKey, bKey) }",
      gm: false, writes: false, legacy: true, throws: ["SCENE_UNKNOWN"],
      doc: "The scene model the panel and the gather share: items and the lazy relation function.",
    },
    {
      path: "manifests",
      params: [],
      returns: "manifest[] (newest first, five kept)",
      gm: false, writes: false, legacy: true,
      doc: "The stored gather manifests (the lastCalls ring).",
    },
    {
      path: "status",
      params: [],
      returns: "{ version, listed, npcBridge, party, specDir, doubleClick, markers }",
      gm: false, writes: false, legacy: true,
      doc: "The running code's version, the bridge's npc handler, the world party, the spec dir, how double-click is patched, the six marker actor ids.",
    },
    {
      path: "inspect",
      params: [{ name: "ref", kind: "token" }, { name: "opts", optional: true, type: "{ sceneId? }" }],
      returns: "{ token: Ref, marker: { size, text } | null, provenance: object | null }",
      gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "One token: its marker size and prompt text when it is a prompt marker, else the provenance of what was built from one.",
    },
    {
      path: "markersOn",
      params: [{ name: "sceneId", type: "Scene id" }],
      returns: "[{ id, size, text }]",
      gm: false, writes: false, throws: ["NOT_FOUND"],
      doc: "The prompt markers on a scene with their size and text, in the scene's token order.",
    },
    {
      path: "manifest",
      params: [{ name: "call", type: "a gather call id (pm-…)" }],
      returns: "manifest | null",
      gm: false, writes: false, nullWhen: "no stored gather has that call id",
      doc: "One stored gather manifest: prompt and built ids, hashes, encounters.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "The six marker actors exist, double-click is patched, the gather query is registered, the code's version is module.json's.",
    },
  ],
  flags: {
    writes: [
      "flags.pentaryn-prompts.marker", "flags.pentaryn-prompts.prompt", "flags.pentaryn-prompts.updatedAt",
      "flags.pentaryn-prompts.swappedFrom", "flags.pentaryn-prompts.provenance",
      "flags.dnd5e.lockSize", "flags.item-piles.data",
    ],
    reads: ["flags.item-piles.data", "flags.wall-height", "flags.dnd5e.lockSize"],
  },
  unlisted: [],
});
