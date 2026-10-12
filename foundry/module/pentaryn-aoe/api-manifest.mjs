/**
 * Pentaryn AoE — the API manifest. PURE DATA: node imports it without a Foundry stub, describe()
 * reports it, and buildApi() refuses to load when it and the implementations drift apart.
 *
 * Every method published before the migration keeps its signature and return shape (`legacy:
 * true`, today's parameter names, every param `resolve: false`), so buildApi never resolves or
 * rewrites an argument. The new reads (finding -10) are plain JSON and never write.
 *
 * Who implements what: MANIFEST.rows in api.mjs; the FEATURE_ROWS tables are contributed by the
 * feature that owns the code (`install()` returns `{ rows, impl }`), so api.mjs never imports a
 * feature.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./core.mjs";

const p = (name, type, extra = {}) => ({ name, type, resolve: false, ...extra });
const MESSAGE = p("messageOrId", "ChatMessage|id");
const MESSAGE_ID = p("messageId", "string", { doc: "the damage message's id" });
const SCENE = p("scene", "Scene", { optional: true });
const legacy = (path, params, returns, doc, extra = {}) => ({ path, params, returns, gm: false, writes: false, legacy: true, doc, ...extra });

const WRITES_RESOLUTION = ["flags.pentaryn-aoe.resolution"];

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    legacy("areasFor", [p("activityUuid", "string"), { ...SCENE, doc: "default: every scene" }], "RegionDocument[]",
      "Template regions created by one activity, on one scene or every scene; [] without an activity uuid."),
    legacy("spellAreas", [p("spell", "{ itemUuid?, activityUuid? }"), { ...SCENE, doc: "default: every scene" }], "RegionDocument[]",
      "Template regions placed by a spell (every activity of the item; the activity uuid is the fallback); [] with neither uuid."),
    legacy("handleFor", [p("region", "RegionDocument")], "TokenDocument|null",
      "A template region's handle token: the attached handle, else a token flagged with the region.", { nullWhen: "no handle, or the region has no scene" }),
    legacy("removeArea", [p("regions", "RegionDocument|id|Array"), { ...SCENE, doc: "default: canvas.scene (the viewing client's scene), for ids" }], "Promise<number>",
      "Delete template regions (their handles go by cascade). Skips non-templates, ones this user may not delete and ones already gone; returns how many went.",
      { writes: true, sideEffects: ["Region (deleted)", "Token (handle, deleted by cascade)"] }),
    legacy("cardEffects", [MESSAGE], "Promise<ActiveEffect[]>",
      "A usage card's applicable effects (enchantments dropped); [] for anything else."),
    legacy("setting", [p("key", "string")], "*",
      "A pentaryn-aoe setting's live value; the default when unregistered; undefined for an unknown key."),
    legacy("hookIds", [], "{ name, id }[]",
      "The hooks this module registered, in registration order."),
    {
      path: "resolution", params: [MESSAGE], returns: "object|null", gm: false, writes: false, since: "0.4.0",
      nullWhen: "no such message, or it has no resolution",
      doc: "A copy of a damage message's tray state (flags.pentaryn-aoe.resolution): rows, saves, multipliers, what was applied. GM data.",
    },
    {
      path: "latestResolution", params: [p("opts", "{ sceneId? }", { optional: true, doc: "sceneId: a scene id, or \"current\" for the viewing client's scene" })],
      returns: "{ messageId, resolution }|null", gm: false, writes: false, since: "0.4.0",
      nullWhen: "none of the last 60 messages carries a live (not superseded) resolution on that scene",
      doc: "The newest live tray among the last 60 chat messages, optionally on one scene.",
    },
    {
      path: "summary", params: [MESSAGE], returns: "{ item, ability, dc, onSave, region, superseded, applicable, rows[], careful, playerStatus }|null",
      gm: false, writes: false, since: "0.4.0", nullWhen: "no such message, or it has no resolution",
      doc: "A damage message's tray as plain data (core.summariseResolution): who is in the area, each save and multiplier, how many rows Apply would act on.",
    },
    {
      path: "isHandle", params: [p("tokenOrDoc", "Token|TokenDocument|Actor")], returns: "boolean", gm: false, writes: false, since: "0.4.0",
      doc: "Is this an area handle (a handle token or placeable, the handle actor, or a synthetic actor of a handle)? core.isHandleTarget.",
    },
    {
      path: "inspect", params: [{ name: "ref", kind: "any", type: "Token|TokenDocument|Actor|ChatMessage|uuid|id|exact actor name", resolve: false, doc: "never a substring" },
        p("opts", "{ sceneId?, as? }", { optional: true })],
      returns: "{ token?, actor?, isHandle, region, handleActor, careful } | { message, resolution, npcSave, effectsApplied }",
      gm: false, writes: false, since: "0.4.0", throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only aoe state for a token, an actor or a chat message, plain JSON, depth ≤ 4. opts.as = a user ref answers with that user's view (the tray summary and Careful Spell are GM or owner only).",
    },
  ],
  flags: {
    writes: [
      "flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.pentaryn-aoe.region",
      "flags.pentaryn-aoe.resolution", "flags.pentaryn-aoe.claims", "flags.pentaryn-aoe.effectsApplied",
      "flags.pentaryn-aoe.damageMessage", "flags.pentaryn-aoe.careful", "flags.pentaryn-aoe.npcSave",
      "flags.dnd5e.lockSize", "flags.dnd5e.requestResult",
    ],
    reads: ["flags.dnd5e.*", "flags.core.MeasuredTemplate", "flags.item-piles.data.enabled"],
  },
  unlisted: [],
});

/** Rows a feature contributes with its implementations (install() returns { rows, impl }). */
export const FEATURE_ROWS = Object.freeze({
  areas: [
    legacy("sweep", [{ ...SCENE, doc: "default: canvas.scene" }], "Promise<{ orphansDeleted, ownershipFixed, handlesCreated, sizeLocked }>",
      "GM: repair one scene — delete orphan handles, size-lock old ones, give template regions shared ownership and a handle. All zeros for a player or no scene.",
      { gm: true, writes: true, sideEffects: ["Token (handle, created/deleted/updated)", "Region (ownership, attachment)"] }),
    legacy("ensureHandleActor", [], "Promise<Actor|null>",
      "The one shared 'Area handle' actor: found by flag (and repaired by a GM), else created by a GM; null for a player when there is none.",
      { writes: true, sideEffects: ["Actor (Area handle, created/updated)", "flags.pentaryn-aoe.handleActor"] }),
    legacy("createHandle", [p("region", "RegionDocument")], "Promise<TokenDocument|null>",
      "Create a template region's handle token and attach the region to it; null when it is not a template, already has a handle, is attached elsewhere, or another client won.",
      { writes: true, sideEffects: ["Token (handle)", "flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.region", "Region attachment"] }),
  ],
  resolve: [
    legacy("resolve", [MESSAGE, p("opts", "{ regionId? }", { optional: true, doc: "regionId: another candidate area; null = the roller's targets" })], "Promise<object|null>",
      "Active GM: build (or rebuild) the tray on a damage message from a save activity, roll the NPC saves and post the players' request card. Returns the resolution.",
      { gm: true, writes: true, nullWhen: "not the active GM, not a damage message, its activity has no save, or its tray is superseded or has an applied row (warning toast)", sideEffects: [...WRITES_RESOLUTION, "ChatMessage (NPC saves, request card)"] }),
    legacy("applyRows", [MESSAGE_ID, p("rowIds", "string[]|null", { optional: true, doc: "default: every applicable row" })], "Promise<object|null>",
      "GM: apply damage to the ticked, resolved, unapplied rows (safe to repeat). Returns the updated resolution.",
      { gm: true, writes: true, nullWhen: "not a GM, no resolution, or superseded (a warning toast)", sideEffects: [...WRITES_RESOLUTION, "Actor hp (applyDamage)", "Region (instantaneous area, deleted)"] }),
    legacy("rollNpcSaves", [MESSAGE_ID, p("opts", "{ rowIds?, force? }", { optional: true })], "Promise<object|null>",
      "Roll (or with force re-roll) the monsters' saves for a tray. Returns the updated resolution.",
      { gm: true, writes: true, nullWhen: "no resolution", sideEffects: [...WRITES_RESOLUTION, "ChatMessage (save rolls)"] }),
    legacy("rollForPlayer", [MESSAGE_ID, p("rowId", "string"), p("opts", "{ event? }", { optional: true })], "Promise<Roll[]|null>",
      "Roll a waiting player's save for them (the normal dialog), threaded under the usage card.",
      { gm: true, writes: true, nullWhen: "no such row or actor", sideEffects: ["ChatMessage (save roll)"] }),
    legacy("pingPlayers", [MESSAGE_ID], "Promise<ChatMessage|Notification|null>",
      "Whisper the owners of rows still waiting for a save; an info toast (returned) when nobody is.",
      { gm: true, writes: true, nullWhen: "no resolution", sideEffects: ["ChatMessage (whisper)"] }),
    legacy("setRow", [MESSAGE_ID, p("rowId", "string"), p("changes", "{ apply?, multiplier?, protected? }")], "Promise<object|null>",
      "GM edit of one unapplied row (tick, multiplier, Careful Spell protection; unprotected, a row gets back its own save, a monster row with none is rolled). Returns the updated resolution.",
      { gm: true, writes: true, nullWhen: "no resolution", sideEffects: [...WRITES_RESOLUTION, "ChatMessage (save roll, unprotected monster row)"] }),
  ],
  effects: [
    legacy("selfApply", [MESSAGE, p("opts", "{ force? }", { optional: true, doc: "force: ignore the autoApplySelf setting and the claim" })], "Promise<{ reason, actor, effects }|null>",
      "Put a usage card's one effect on its caster when the card is meant for them; null when it is not, or it was already applied.",
      { writes: true, sideEffects: ["ActiveEffect (on the caster)", "flags.pentaryn-aoe.effectsApplied", "flags.pentaryn-aoe.claims"] }),
    legacy("pendingFor", [MESSAGE, p("opts", "{ effects? }", { optional: true, doc: "effects: the card's effects, when the caller already fetched them (-14)" })], "Promise<string[]>",
      "Effect ids on a usage card nobody has applied yet ([] once one is applied, or for a card over an hour old)."),
  ],
  escape: [
    legacy("activePlacement", [], "object|null",
      "The region placement following the mouse right now (core's placement context), or null."),
  ],
});
