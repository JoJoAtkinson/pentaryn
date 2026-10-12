/**
 * Pentaryn Feature Riders — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * The legacy rows keep today's signatures and shapes (`legacy: true`): their actor argument also
 * takes a name, id, uuid or Token (a miss answers null; combat-riders-12, shapes.withLegacyActor),
 * and the writing ones return their old shapes rather than ok()/fail() (C31, README "API"). Battle Medic's two rows are contributed by
 * battle-medic.mjs. New rows take a `ref` (Actor, Token, uuid, id or exact name; never a substring).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./riders-core.mjs";

const REF = { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" };
const ACTOR = { name: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring; a miss answers null" };

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
      returns: "{ actor, rows, hd: { value, max }, settings, concentrationSummons: [{ scene, token, effect }] }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only riders state for one actor, plain JSON, depth ≤ 4: report()'s rows, the Hit Dice summary, "
        + "all eight settings, and the tokens its concentration effects keep on any scene. opts.as = a user ref "
        + "answers with that user's view (rows and hd need OBSERVER; concentrationSummons is GM-only).",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync: published, settings readable, hooks and the relay registered, patches.",
    },
    {
      path: "arcaneRecovery",
      params: [REF],
      returns: "{ ok: true, actor, recovered: { [level]: count } | null } | { ok: false, code, reason }",
      gm: false, writes: true,
      sideEffects: ["Actor.system.spells.spell1-5.value", "ChatMessage (one line)"],
      doc: "Open the Arcane Recovery picker for an actor this client owns, without spending a use: the chosen "
        + "slots are restored and one chat line posted, as after the feature's own use. recovered is null when "
        + "cancelled or nothing was spent. A non-owner gets { ok: false, code: \"REFUSED\" }.",
    },
    {
      path: "featuresOf",
      params: [ACTOR],
      returns: "{ key, rule, items: Item[], types: string[]|null }[]",
      gm: false, writes: false, legacy: true,
      doc: "Every rule the actor's items switch on, with the damage types it resolved to. items are LIVE Item "
        + "documents (heavy through eval-js; inspect().rows is the plain view).",
    },
    {
      path: "report",
      params: [{ ...ACTOR, optional: true, doc: "omitted: every character actor" }],
      returns: "{ actor, rule, items, types?, status, manual?, handAdded?, battleMedic? }[]",
      gm: false, writes: false, legacy: true,
      doc: "One row per (actor, feature): what is active, which types, and Battle Medic's state; also printed "
        + "with console.table.",
    },
    {
      path: "setType",
      params: [{ name: "target", type: "Item|Actor|Token|uuid|id|exact name", doc: "a string resolves to an actor; a miss answers null" }, { name: "type", type: "string" }, { name: "ruleKey", type: "string", optional: true }],
      returns: "string[] (the names of the items set)",
      gm: false, writes: true, legacy: true,
      sideEffects: ["flags.pentaryn-riders.damageType"],
      doc: "Set the damage type a typed feature (Elemental Adept, Elemental Affinity) stands for: one item, or "
        + "every typed feature item of an actor (one rule's with ruleKey). Throws when type is empty.",
    },
    {
      path: "retireManual",
      params: [ACTOR],
      returns: "string[] (\"<item>: <activity>\" per activity deleted)",
      gm: false, writes: true, legacy: true,
      sideEffects: ["flags.pentaryn-riders.damageType", "Item.system.activities"],
      doc: "Elemental Affinity: pin the resolved type into the item's flag and delete the PHB's manual +CHA "
        + "damage activities (with the rider on, they add CHA twice). Typeless items are left alone.",
    },
    {
      path: "spendHitDie",
      params: [ACTOR, { name: "opts", type: "{ faces? }", optional: true }],
      returns: "number|null (the faces spent)",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Actor.system.attributes.hd.spent (NPC) | Item(class).system.hd.spent"],
      doc: "Spend one Hit Die: the largest left, or of `faces` when the actor has one left of that size.",
    },
    {
      path: "restoreHitDie",
      params: [ACTOR],
      returns: "number|null (the faces restored)",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Actor.system.attributes.hd.spent (NPC) | Item(class).system.hd.spent"],
      doc: "Give back one spent Hit Die (the largest spent).",
    },
    {
      path: "hdPools",
      params: [ACTOR],
      returns: "{ id: string|null, faces, value, spent }[]",
      gm: false, writes: false, legacy: true,
      doc: "The actor's Hit Dice pools: one per class (an NPC: one, id null).",
    },
    {
      path: "preview",
      params: [{ name: "formula", type: "string" }, { name: "opts", type: "{ rollType, types?, modifier?, bonus? }", optional: true }],
      returns: "string (the formula with the riders applied)",
      gm: false, writes: false, legacy: true,
      doc: "What a rider would do to a damage formula string (core.transformFormula with dnd5e's damage types). "
        + "The live riders edit real roll terms, not strings.",
    },
  ],
  flags: {
    writes: [
      "flags.pentaryn-riders.damageType",
      "flags.pentaryn-riders.flow",
      "flags.pentaryn-riders.applied",
      "flags.pentaryn-riders.ignoreResistance",
      "flags.pentaryn-riders.origin",
      "flags.pentaryn-riders.detail",
      "flags.pentaryn-riders.target",
      "flags.pentaryn-riders.faces",
      "flags.pentaryn-riders.concentration",
      "flags.pentaryn-riders.relay",
    ],
    reads: [],
  },
  unlisted: ["rules", "core"],
});
