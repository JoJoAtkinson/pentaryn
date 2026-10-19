/**
 * Pentaryn Creatures — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every published path from before the migration keeps its signature (`legacy: true`) and takes
 * raw arguments. Only `inspect` (0.1.1) names its first param `ref`, which the kit resolves to a
 * TokenDocument (with `opts.sceneId`; NOT_FOUND / AMBIGUOUS). `core` (the pure module) is
 * published unlisted, as a frozen copy.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./creatures-core.mjs";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "list",
      params: [
        { name: "user", type: "User | uuid | id | exact name", optional: true, doc: "default: this client's user" },
        { name: "scene", type: "Scene | uuid | id | exact name", optional: true, doc: "default: the viewed scene" },
      ],
      returns: "{ id, name, img, rank }[]",
      gm: false, writes: false, legacy: true,
      doc: "What that user's \"Your creatures\" strip shows on a scene: their own tokens, their character "
        + "(or its Wild Shape form) first as rank 0, other characters rank 1, the rest rank 2. GM-hidden tokens, "
        + "Item Piles piles and pentaryn-aoe area handles are left out. [] without a scene.",
    },
    {
      path: "render",
      params: [],
      returns: "void",
      gm: false, writes: false, legacy: true,
      doc: "Redraw this client's strip now (always rebuilds). A GM client never shows a strip.",
    },
    {
      path: "syncScene",
      params: [
        { name: "scene", type: "Scene | uuid | id | exact name" },
        { name: "ids", type: "string[] | Set<string> | string | TokenDocument[]", optional: true,
          doc: "only these tokens (ids or documents; [] means none); default every token" },
      ],
      returns: "Promise<number>",
      gm: true, writes: true, legacy: true, throws: ["NOT_FOUND", "BAD_ARGS"],
      sideEffects: ["token light.bright/light.dim", "flags.pentaryn-creatures.light"],
      doc: "Bring one scene's creature lights in line now; resolves to how many tokens were written. Active GM "
        + "client only (0 elsewhere). A missing or unknown scene rejects NOT_FOUND / BAD_ARGS on every client.",
    },
    {
      path: "syncAll",
      params: [],
      returns: "Promise<number>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["token light.bright/light.dim", "flags.pentaryn-creatures.light"],
      doc: "syncScene over every scene; a scene whose write fails is one console warning naming it and the rest "
        + "still sync. Resolves to how many tokens were written. Active GM client only (0 elsewhere).",
    },
    {
      path: "isCreature",
      params: [{ name: "tokenDoc", type: "TokenDocument | Token placeable", doc: "a placeable answers through its document" }],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Does this token get the creature light: a player-owned npc that is not an Item Piles pile or an "
        + "aoe area handle? Never a PC or its Wild Shape form. null/undefined answer false.",
    },
    {
      path: "ownerSees",
      params: [{ name: "token", type: "Token placeable | TokenDocument", doc: "a document answers for its placeable" }],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Would the owner override draw this token on this client when core says it is not visible? Always "
        + "false on a GM client, and for a document with no placeable on the viewed scene.",
    },
    {
      path: "patchedWith",
      params: [],
      returns: "\"libWrapper\" | \"direct\" | null",
      gm: false, writes: false, legacy: true,
      doc: "How Token#isVisible was wrapped on this client: libWrapper, directly on the prototype, or null when "
        + "the getter was not found (owners-see-their-own is off).",
    },
    {
      path: "status",
      params: [],
      returns: "{ patchedWith, ownerSees, lightRadius, showStrip, floatOverHud, summonLibrary, summonPatched, writer, lit, version }",
      gm: false, writes: false, since: "0.1.1",
      doc: "One read of this client's state: how Token#isVisible is wrapped (patchedWith), the settings as "
        + "this client reads them (showStrip is per client), how dnd5e's Actor5e.fetchExisting is wrapped for the summon "
        + "library (summonPatched: libWrapper, direct or null), whether this client writes the lights (writer: the "
        + "active GM), and how many tokens on every scene carry our light flag (lit).",
    },
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "token", type: "Token | TokenDocument | uuid | id | exact name" },
        { name: "opts", type: "{ sceneId?, as? }", optional: true, doc: "as: a user ref — whose strip `inStrip` answers for (default this client's user)" },
      ],
      returns: "{ token, actorType, qualifies, light: { bright, dim }, ourLight, switchedOff, ownerSees, inStrip }",
      gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"], since: "0.1.1",
      doc: "Read-only plain JSON for one token: does it qualify for the creature light, its current light, the "
        + "light we set (ourLight, null when not ours), whether it was switched off by hand, whether this client's "
        + "owner override would draw it, and whether that user's strip shows it (never for a GM).",
    },
    {
      path: "summonActor",
      params: [{ name: "opts", type: "{ uuid: string, item: string, dryRun?: boolean }",
        doc: "uuid: the actor to summon (a profile's, or a Compendium Browser pick); item: the summoning item's uuid" }],
      returns: "Promise<{ ok: true, actorId, name, created, folderId?, dryRun? } | { ok: false, code, reason }>",
      gm: false, writes: true, query: true, relay: true, since: "0.2.0",
      sideEffects: ["Actor (the library copy)", "Folder (PC Summons & Forms/<First name> — summons & forms)",
        "Actor.ownership (adds the sender to an existing copy)", "flags.pentaryn-creatures.library", "flags.dnd5e.isAutoImported"],
      doc: "The summon library: the active GM makes the world copy dnd5e needs to summon `uuid` from `item` for a player "
        + "without Create New Actors, owned by the sender and the character's owners. Refused (REFUSED) unless the sender "
        + "owns the item's actor and the source is one the item's summon activities can summon (a profile's uuid; for a "
        + "CR summon, a compendium npc within the CR and types). Idempotent: a deterministic id per character and source, "
        + "so a second call (or a second GM tab) returns the same copy. A player's client asks the active GM (NO_GM when "
        + "none is connected). Called by the Actor5e.fetchExisting wrap; dryRun reports the id without writing.",
    },
    {
      path: "library",
      params: [{ name: "ref", kind: "actor", type: "Actor | Token | uuid | id | exact name" }],
      returns: "{ actor: { id, name }, folder: { id, name } | null, summons: { id, name, source }[] }",
      gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"], since: "0.2.0",
      doc: "A character's summon library as this client sees it: the copies made for it (flags.pentaryn-creatures.library) "
        + "and every actor in its `<First name> — summons & forms` folder, by name; source is the compendium or world uuid.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-creatures.light", "flags.pentaryn-creatures.library", "flags.dnd5e.isAutoImported"],
    reads: ["flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.item-piles.data.enabled", "flags.dnd5e.originalActor"],
  },
  unlisted: ["core"],
});
