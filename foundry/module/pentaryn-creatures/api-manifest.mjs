/**
 * Pentaryn Creatures — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every published path from before the migration keeps its signature (`legacy: true`); no row's
 * first param is named `ref`, so none is resolved by the kit. `core` (the pure module) is published
 * unlisted, as a frozen copy.
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
        { name: "user", type: "User", optional: true, doc: "default: this client's user" },
        { name: "scene", type: "Scene", optional: true, doc: "default: the viewed scene" },
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
        { name: "scene", type: "Scene" },
        { name: "ids", type: "string[] | Set<string> | string | TokenDocument[]", optional: true,
          doc: "only these tokens (ids or documents; [] means none); default every token" },
      ],
      returns: "Promise<number>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["token light.bright/light.dim", "flags.pentaryn-creatures.light"],
      doc: "Bring one scene's creature lights in line now; resolves to how many tokens were written. Active GM "
        + "client only (0 elsewhere).",
    },
    {
      path: "syncAll",
      params: [],
      returns: "Promise<number>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["token light.bright/light.dim", "flags.pentaryn-creatures.light"],
      doc: "syncScene over every scene; resolves to how many tokens were written. Active GM client only (0 elsewhere).",
    },
    {
      path: "isCreature",
      params: [{ name: "tokenDoc", type: "TokenDocument" }],
      returns: "boolean",
      gm: false, writes: false, legacy: true,
      doc: "Does this token get the creature light: a player-owned npc that is not an Item Piles pile or an "
        + "aoe area handle? Never a PC or its Wild Shape form.",
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
      returns: "{ patchedWith, ownerSees, lightRadius, showStrip, floatOverHud, writer, lit, version }",
      gm: false, writes: false, since: "0.1.1",
      doc: "One read of this client's state: how Token#isVisible is wrapped (patchedWith), the four settings as "
        + "this client reads them (showStrip is per client), whether this client writes the lights (writer: the "
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
  ],
  flags: {
    writes: ["flags.pentaryn-creatures.light"],
    reads: ["flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor", "flags.item-piles.data.enabled", "flags.dnd5e.originalActor"],
  },
  unlisted: ["core"],
});
