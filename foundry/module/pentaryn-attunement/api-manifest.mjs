/**
 * Pentaryn Attunement Slots — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and api.mjs's implementations drift.
 *
 * Row order is the published key order; the five legacy methods keep theirs
 * (report, computeSlots, stash, releaseAway, away — test/glue.test.mjs pins it).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./attunement-core.mjs";

const ACTOR = { name: "actor", kind: "actor", type: "Actor|uuid|id|exact name", resolve: false,
  doc: "an Actor passes through unchanged; a string resolves exactly (never a substring)" };
const FLAGS = [`flags.${MODULE}.slots`, `flags.${MODULE}.away`, `flags.${MODULE}.bond`];
/** Item claim flags claimDocument stamps so one GM tab acts; gone with the paid purse / cleared on the hand-back. */
const CLAIMS = [`flags.${MODULE}.claims.coinBack`, `flags.${MODULE}.claims.home`];

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "report",
      params: [
        { name: "target", type: "Actor|id|name", optional: true, resolve: false, doc: "defaults to the first controlled token's actor" },
        { name: "opts", type: "{ quiet? }", optional: true, doc: "quiet: no console output" },
      ],
      returns: "{ actor, value, max, over, slots, rows } | undefined",
      gm: false, writes: false, legacy: true,
      sideEffects: ["console.log", "console.table"],
      nullWhen: "no actor → undefined (console.warn)",
      doc: "Console audit of one actor: what is attuned, its slot, and source-vs-prepared data issues. "
        + "Looks a string up by id, then by game.actors.getName (first match).",
    },
    {
      path: "computeSlots",
      params: [ACTOR],
      returns: "{ slots: (itemId|'away:<key>'|null)[], max, value, over } | null",
      gm: false, writes: false, legacy: true,
      throws: ["AMBIGUOUS"],
      nullWhen: "a string that names no actor",
      doc: "The reconciled slot order the strip draws (stored order, holes kept, newcomers in the first hole).",
    },
    {
      path: "stash",
      params: [
        { name: "owner", kind: "actor", type: "Actor", resolve: false },
        { name: "container", kind: "actor", type: "Actor", resolve: false, doc: "usually an Item Piles container" },
        { name: "itemIds", type: "string[]" },
        { name: "opts", type: "{ tag?, currency?, detail? }", optional: true,
          doc: "tag defaults to the owner's first name; currency also moves the coin as a purse; "
            + "detail resolves { count, created, away } instead of the count" },
      ],
      returns: "Promise<number | { count, created: string[], away: string[] }>",
      gm: false, writes: true, legacy: true,
      sideEffects: [...FLAGS, "container Items (created)", "owner Items (deleted)", "owner system.currency (with currency)"],
      doc: "Confiscation: move items into a container, tagged and bonded so they come home attuned; "
        + "attuned items keep their slot as away entries. Resolves the number of items created. "
        + "owner and container are live Actor documents (eval-js only).",
    },
    {
      path: "releaseAway",
      params: [{ name: "actor", kind: "actor", type: "Actor", resolve: false }, { name: "key", type: "string" }],
      returns: "Promise<Actor> (setFlag's)",
      gm: false, writes: true, legacy: true,
      sideEffects: [`flags.${MODULE}.away`],
      doc: "End attunement to an away item: drop its away entry (the item comes back unattuned). "
        + "actor is a live Actor document (eval-js only).",
    },
    {
      path: "away",
      params: [ACTOR],
      returns: "{ key, name, img }[]",
      gm: false, writes: false, legacy: true,
      throws: ["AMBIGUOUS"],
      doc: "The actor's away entries (attuned items not on the actor); [] when there are none or no actor.",
    },
    {
      path: "inspect",
      params: [
        { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" },
        { name: "opts", type: "{ sceneId?, base? }", optional: true },
      ],
      returns: "{ actor, slots, max, value, over, away, bonds: [{ item, ...bond }], counts: { dnd5e, away, strip, mismatch } }",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only attunement state for one actor, plain JSON, depth ≤ 4. counts compares dnd5e's "
        + "attunement.value (+ away) with the strip's count; mismatch is true when they differ.",
    },
    {
      path: "selftest",
      params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }",
      gm: false, writes: false,
      doc: "Live smoke checks after a sync.",
    },
  ],
  flags: { writes: [...FLAGS, ...CLAIMS], reads: [] },
  unlisted: [],
});
