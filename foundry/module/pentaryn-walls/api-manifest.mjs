/**
 * Wall autocomplete — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every row keeps today's published signature. The legacy shapes stay (use-doc §5.1 "walls
 * throw"): `undo` throws on a missing scene, `makeMacro` is positional, `runEngine`/`backends` are
 * the engine and registry functions themselves.
 */

import { CONTRACT, MODULE, NS, READ_SCOPES, VERSION } from "./walls-core.mjs";

const SCENE_OPTS = {
  name: "opts", optional: true,
  type: "{ sceneId?, backend?, runId?, gridSize?, gapMax?, cornerMax?, extMax?, trim? }",
  doc: "sceneId defaults to the viewed scene; backend overrides the setting; the rest are engine tolerances",
};
const ENGINE_RESULT = "{ creates, updates, refusals, lints, log, report }";
const BUSY = " One at a time: while preview/run/undo is running, another call warns and returns null.";
/** A stamp key under every scope stampOf() reads: the module id first, then the legacy scope. */
const underEveryScope = key => READ_SCOPES.map(scope => `flags.${scope}.${key}`);

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: "wall-autocomplete",
  rows: [
    {
      path: "preview",
      params: [SCENE_OPTS],
      returns: `${ENGINE_RESULT} | null`,
      gm: true, writes: true,
      sideEffects: ["ChatMessage (GM whisper)", "canvas.controls.drawPing (local)", "console.table"],
      throws: ["Error"],
      doc: "Run the engine on a scene and report what it would build, writing no walls. Not a pure read: "
        + "it posts a GM-whispered chat card, pings each refusal on this client only (when the scene is the one being viewed) and prints console tables." + BUSY,
    },
    {
      path: "run",
      params: [SCENE_OPTS],
      returns: `${ENGINE_RESULT} | null`,
      gm: true, writes: true,
      sideEffects: ["Wall update batch", "Wall create batch", "ChatMessage (GM whisper)",
        "flags.wall-autocomplete.{generated,run,rule,moves}"],
      throws: ["Error"],
      doc: "Complete the scene's walls: one update batch (trims/welds), one create batch, then the chat card. "
        + "A created wall is stamped with the run id; a trimmed or welded one gets moves.<run id> = its prior "
        + "coordinates, so undo() can peel runs back one at a time." + BUSY,
    },
    {
      path: "undo",
      params: [{ name: "opts", optional: true, type: "{ sceneId?, all? }", doc: "all: undo every run, not just the latest" }],
      returns: "{ deleted, restored, run } | null",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Wall delete batch", "Wall update batch", "ChatMessage (GM whisper)",
        "flags.pentaryn-walls and flags.wall-autocomplete: the undone run's moves entry deleted on restored walls, "
          + "or the whole stamp once no run is left"],
      throws: ["Error"],
      doc: "Undo the latest run on a scene (or all of them): delete the walls it created and restore those it trimmed. "
        + "A generated wall is deleted only by undoing the run that created it; a wall a later run moved gets that "
        + "run's prior coordinates back. Stamps are read under both scopes." + BUSY,
    },
    {
      path: "makeMacro",
      params: [
        { name: "action", optional: true, type: '"preview" | "run" | "undo"', doc: "default preview" },
        { name: "slot", optional: true, type: "number", doc: "hotbar slot; omitted = first free" },
      ],
      returns: "Macro",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Macro create (once per action)", "hotbar assignment"],
      throws: ["Error"],
      doc: "Create (or reuse) the 'Walls: <action>' script macro and put it on the hotbar.",
    },
    {
      path: "analyze",
      params: [SCENE_OPTS],
      returns: `{ sceneId, sceneName, backend, ms, ...${ENGINE_RESULT} }`,
      gm: true, writes: false,
      throws: ["Error"],
      since: "0.2.0",
      doc: "What preview() computes, with no side effect: no chat card, no pings, no console output, "
        + "no writes. Adds the scene, the backend that ran and its time in ms.",
    },
    {
      path: "runEngine",
      params: [
        { name: "walls", type: "{ _id, c, door, sight, move, light, sound, dir, levels, flags }[]" },
        { name: "opts", optional: true, type: "{ gridSize?, runId?, … }" },
      ],
      returns: ENGINE_RESULT,
      gm: false, writes: false, legacy: true,
      doc: "The pure JS engine (the reference backend) over plain wall data; touches nothing.",
    },
    {
      path: "backends",
      params: [],
      returns: "{ name, run, available }[]",
      gm: false, writes: false, legacy: true,
      doc: "The engine backends available on this client (js, and wasm once its bytes load).",
    },
  ],
  flags: {
    writes: ["flags.wall-autocomplete.generated", "flags.wall-autocomplete.run",
      "flags.wall-autocomplete.rule", "flags.wall-autocomplete.moves"],
    reads: ["keepOpen", "generated", "run", "priorC", "moves"].flatMap(underEveryScope),
  },
  unlisted: [],
});
