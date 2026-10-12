/**
 * Pentaryn Senses — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs drift apart.
 *
 * Every row keeps today's published signature (`legacy: true`): positional documents, not refs;
 * booleans, counts, null or a notification for a refusal. `chain.*` is also published as
 * `game.pentaryn.chain` (an alias; the same frozen object).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./senses-core.mjs";

const ITEM = { name: "item", type: "Item", doc: "the Item (a clone from a use hook is resolved to the live one)" };
const TOKEN = (name, doc) => ({ name, type: "Token | TokenDocument | Token uuid | id on the viewed scene", doc });

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "syncLight",
      params: [{ name: "actor", type: "Actor" }],
      returns: "Promise<number> documents written",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Actor update (prototypeToken.light, flags.pentaryn-senses.{itemLight,itemLightPrior})",
        "Token update batch per scene (light, flags.pentaryn-senses.{itemLight,itemLightPrior})"],
      doc: "Bring the actor's prototype and every token of it in line with the light its carried items give "
        + "(a shard always, a torch, lamp or lantern while lit). A token lit by the Light cantrip is left alone. "
        + "The carried-light hooks call it on the active GM's client; any caller writes.",
    },
    {
      path: "carriedLight",
      params: [{ name: "actor", type: "Actor" }],
      returns: "token light data | null",
      gm: false, writes: false, legacy: true,
      doc: "The light the actor's carried items give now (the strongest), or null.",
    },
    {
      path: "resetSight",
      params: [{ name: "opts", optional: true, type: "{ force?: boolean }", doc: "force: run again although sightReset is 1" }],
      returns: "Promise<{ prototypes, tokens } | null>",
      gm: true, writes: true, legacy: true,
      nullWhen: "not the active GM, not dnd5e 6+, dnd5e senseVisionSync off, or already done without force",
      sideEffects: ["Actor batch (prototypeToken.sight)", "Token batch per scene (sight)", "setting pentaryn-senses.sightReset"],
      doc: "The one-shot reset of the darkvision sight the retired 0.3 sync stored on tokens and prototypes "
        + "(basic / range 0), so dnd5e's senseVisionSync derives vision from the sheet. Runs at ready on its own.",
    },
    {
      path: "light.cast",
      params: [ITEM, { name: "target", type: "{ token } | { x, y } (+ scene?)", doc: "scene defaults to the viewed scene" }],
      returns: "Promise<boolean>",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Item update (flags.pentaryn-senses.lightCast)"],
      doc: "Point a Light cantrip at a token or a square. The owner writes the item flag; the active GM then lights "
        + "the token (its old light kept) or places an AmbientLight. Casting again moves the light.",
    },
    {
      path: "light.end",
      params: [ITEM],
      returns: "Promise<boolean>",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Item update (flags.pentaryn-senses.lightCast = null)"],
      doc: "Put a Light cantrip out (owner or GM); the active GM restores the token or removes the square.",
    },
    {
      path: "light.pick",
      params: [],
      returns: "Promise<{ scene, token } | { scene, x, y } | null>",
      gm: false, writes: false, legacy: true,
      doc: "Wait for a click on a token or a square of the viewed scene. Right-click, Esc, 60 s or a scene change → null. "
        + "Closes Argon's open panels first.",
    },
    {
      path: "light.toggle",
      params: [ITEM],
      returns: "Promise<boolean> lit now",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Item update (flags.pentaryn-senses.{lit,hooded})", "ChatMessage"],
      doc: "Light or douse a torch, lamp, lantern or candle (owner only); one chat line; nothing consumed.",
    },
    {
      path: "light.hood",
      params: [ITEM],
      returns: "Promise<boolean> hooded now",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Item update (flags.pentaryn-senses.hooded)", "ChatMessage"],
      doc: "Lower or raise a hooded lantern's hood (bright 0 / dim 5 while lowered); one chat line.",
    },
    {
      path: "light.profileFor",
      params: [ITEM],
      returns: "light profile | null",
      gm: false, writes: false, legacy: true,
      doc: "The light an item gives when lit: its flags.pentaryn-senses.lightItem override, else the profile by "
        + "identifier or name (torch, candle, lamp, lantern-hooded, lantern-bullseye).",
    },
    {
      path: "light.sweep",
      params: [],
      returns: "Promise<{ sources, removed }>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Token, AmbientLight and Item writes of every reconcile", "Token delete (old PHB Light summons)"],
      doc: "Active GM: reconcile every Light cantrip and every spell light in the world, then remove the old PHB "
        + "floor-token summons. Runs at ready on its own. Idempotent.",
    },
    {
      path: "light.setup",
      params: [],
      returns: "Promise<number> torches changed",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Item update (system.activities.psLightToggle000)"],
      doc: "Give every Torch the GM can reach a 'Light' activity that toggles it. Idempotent. Also published as setupLight.",
    },
    {
      path: "light.onMe",
      params: [ITEM],
      returns: "Promise<boolean> | notification",
      gm: false, writes: true, legacy: true,
      sideEffects: ["Item update (flags.pentaryn-senses.lightCast)"],
      doc: "Cast the Light on the caster's own token on the viewed scene (a controlled one first).",
    },
    {
      path: "light.prompt",
      params: [ITEM],
      returns: "Promise<boolean | undefined>",
      gm: false, writes: true, legacy: true,
      doc: "The 'Where does the light go?' dialog: On me · Pick a target · Not now.",
    },
    {
      path: "light.reconcile",
      params: [{ name: "source", type: "string", doc: "a Light item uuid" }],
      returns: "Promise<{ source, desired, restored, removed, lit, created, released, cleared } | null | undefined>",
      gm: true, writes: true, legacy: true,
      doc: "Active GM: bring the world in line with one Light item's flag now (queued behind any running reconcile). "
        + "Resolves to what it did (restored / removed counts, the token lit, a square created, another Light released, "
        + "this cast cleared); null off the active GM; undefined when it failed (warned).",
    },
    {
      path: "light.status",
      params: [{ name: "ref", kind: "item", doc: "a Light cantrip item (document, uuid, or a world item's id or name)" }],
      returns: "{ cast: { scene, token } | { scene, x, y } | null, litBy: { kind, scene, id }[] }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Where a Light cantrip is cast (its item flag) and what it lights now (tokens and AmbientLights on every scene). Read-only.",
    },
    {
      path: "light.recent",
      params: [],
      returns: "{ source, desired, restored, removed, lit, created, released, cleared }[]",
      gm: false, writes: false,
      doc: "The last 20 Light reconcile summaries on this client (the active GM's is the one that writes), oldest first.",
    },
    {
      path: "setupLight",
      params: [],
      returns: "Promise<number> torches changed",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Item update (system.activities.psLightToggle000)"],
      doc: "The same function as light.setup.",
    },
    {
      path: "syncAll",
      params: [],
      returns: "Promise<number> documents written",
      gm: false, writes: true, legacy: true,
      doc: "syncLight for every world actor, one after another. Runs at ready on the writer's client.",
    },
    {
      path: "chain.link",
      params: [TOKEN("chained", "the chained token"), TOKEN("anchor", "on the same scene as the chained token")],
      returns: "Promise<boolean>",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Token update (flags.pentaryn-senses.chain = { anchor })"],
      doc: "Chain a token to an anchor token on the same scene: a drawn chain, no movement limit. GM only. Also game.pentaryn.chain.link.",
    },
    {
      path: "chain.break",
      params: [TOKEN("token", "either end")],
      returns: "Promise<number> chains removed",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Token update batch (flags.pentaryn-senses.chain deleted)"],
      doc: "Remove every chain touching this token, as the chained end or the anchor. GM only.",
    },
    {
      path: "chain.links",
      params: [{ name: "scene", optional: true, type: "Scene | scene id", doc: "default: the viewed scene" }],
      returns: "{ chained, anchor }[]",
      gm: false, writes: false, legacy: true,
      doc: "Every drawable chain on a scene, by token id.",
    },
    {
      path: "chain.repaint",
      params: [],
      returns: "void",
      gm: false, writes: false, legacy: true,
      doc: "Redraw the chains on this client next frame.",
    },
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "token", resolve: false, doc: "a token (id, uuid, exact name, document, placeable), else an actor" },
        { name: "opts", optional: true, type: "{ sceneId?, base?, as? }", doc: "scene scope; base: the world actor; as: answer as that user" },
      ],
      returns: "{ token: { id, light, itemLight, itemLightPrior, spellLight: { source, prior (dotted keys) } | null } | null, "
        + "actor: { id, carried, carriers, hooded, lightingItem } | null, "
        + "chain: { anchor, chainedHere } | null, lightSpells: { item, cast, litBy: uuid[] }[] }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Why a token is lit the way it is: its light and the flag that owns it (carried / spell / hand-set), the actor's "
        + "carried light and every item giving one, its chain, and each Light cantrip's target. Read-only, plain JSON. "
        + "As a player without OBSERVER on the actor, actor and lightSpells are omitted.",
    },
  ],
  /** Constants published as frozen copies, without a row. */
  unlisted: ["light.SPELL_LIGHT", "light.PHB_LIGHT_ACTOR"],
  flags: {
    writes: [
      `flags.${MODULE}.itemLight`, `flags.${MODULE}.itemLightPrior`, `flags.${MODULE}.spellLight`,
      `flags.${MODULE}.lightCast`, `flags.${MODULE}.lit`, `flags.${MODULE}.hooded`, `flags.${MODULE}.chain`,
    ],
    // `light` on an item is also written by pentaryn-transform (the Starry form).
    reads: [`flags.${MODULE}.light`, `flags.${MODULE}.lightItem`, `flags.${MODULE}.lightToggle`],
  },
});
