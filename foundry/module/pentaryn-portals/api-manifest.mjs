/**
 * Pentaryn Portal Cards — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and the implementations drift.
 *
 * The four own rows keep today's signatures (`legacy: true`): documents in, the old return shapes.
 * Features contribute the rest from install(): badges → open, redraw; party → spreadArrival.
 */

import { CONTRACT, MODULE, NS, VERSION } from "./portals-core.mjs";

const REGION = { name: "region", type: "RegionDocument", doc: "a destination region document" };
const REF = { name: "ref", kind: "region", type: "Region|uuid|id|exact name", doc: "never a substring; opts.sceneId scopes an id or a name" };
const DESTINATION = "{ uuid, scene: { id, uuid, name }, name, card: { uuid, title, img, description }, revealed, choice, behavior }";

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "snapshot",
      params: [
        { name: "regionOrUuid", type: "RegionDocument|uuid" },
        { name: "opts", type: "{ squaresWide = 8, squaresHigh = 5 }", optional: true },
      ],
      returns: "the saved image path | null (not a GM, or the scene has no background)",
      gm: true, writes: true, legacy: true,
      sideEffects: ["flags.pentaryn-portals.img", "Data: assets/tokens/custom/portals/<sceneId>-<regionId>.webp"],
      doc: "Crop the region's scene background around it (in grid squares), upload it and make it the card image.",
    },
    {
      path: "cardFor",
      params: [REGION],
      returns: "{ uuid, title, img, description }",
      gm: false, writes: false, legacy: true,
      doc: "The card a player sees for this destination, with fallbacks (scene nav name, scene thumbnail). "
        + "Throws a TypeError for a missing region.",
    },
    {
      path: "teleportParty",
      params: [
        { name: "destRegion", type: "RegionDocument", doc: "where the party lands (its centre)" },
        { name: "opts", type: "{ confirm = true }", optional: true, doc: "confirm: false skips the GM's confirm dialog" },
      ],
      returns: "undefined",
      gm: true, writes: true, legacy: true,
      sideEffects: ["Token: update (same scene) or create + delete (another scene)", "pulls active players to the destination"],
      doc: "Move the party on canvas.scene (PCs, their summons, player-owned tokens) to the region. Opens a "
        + "confirm dialog first unless the setting confirmPartyTeleport is off — a console or bridge caller passes { confirm: false }.",
    },
    {
      path: "lookAt",
      params: [{ name: "destRegion", type: "RegionDocument" }],
      returns: "undefined",
      gm: true, writes: false, legacy: true,
      doc: "Pan the calling GM's own view to the region (switching scene if needed). Nobody moves; nothing broadcasts.",
    },
    {
      path: "inspect",
      params: [{ ...REF, resolve: false, doc: "a region; an Actor or Token answers null (portals keeps nothing on actors)" },
        { name: "opts", type: "{ sceneId?, as? }", optional: true }],
      returns: "{ region, hidden, card, revealed, destinations: [destination] | null } | null",
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Read-only portal state of one region, plain JSON: its own card (what players see arriving here) and where it "
        + "leads. opts.as = a user ref answers as that user: a player gets no destinations for a sealed or unrevealed passage.",
    },
    {
      path: "destinations",
      params: [REF, { name: "opts", type: "{ sceneId? }", optional: true }],
      returns: `[${DESTINATION}]`,
      gm: false, writes: false,
      throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"],
      doc: "Where a teleport region leads: one entry per destination of each enabled Teleport Token behavior, with its card.",
    },
    {
      path: "link",
      params: [REF, { name: "opts", type: "{ to: region ref, twoWay = false, dryRun = false, sceneId? }" }],
      returns: "{ ok: true, from, to, twoWay } | { ok: false, code, reason }",
      gm: true, writes: true,
      sideEffects: ["RegionBehavior: system.destinations (update), or a new Teleport Token behavior"],
      doc: "Make the region lead to opts.to, exactly as the Portal card's Add a destination does: added to its first "
        + "enabled teleport behavior, or a new one (asks first, revealed, fade 1500 ms). twoWay also links back. Already linked is a no-op.",
    },
    {
      path: "unlink",
      params: [REF, { name: "opts", type: "{ to: region ref, dryRun = false, sceneId? }" }],
      returns: "{ ok: true, from, to, removed } | { ok: false, code, reason }",
      gm: true, writes: true,
      sideEffects: ["RegionBehavior: system.destinations (update)"],
      doc: "The region no longer leads to opts.to: the entry is dropped from every enabled teleport behavior. removed = behaviors changed.",
    },
  ],
  flags: {
    writes: ["flags.pentaryn-portals.title", "flags.pentaryn-portals.img", "flags.pentaryn-portals.description"],
    reads: ["flags.pentaryn.travel.regionId", "flags.pentaryn-aoe.handle", "flags.pentaryn-aoe.handleActor",
      "flags.dnd5e.summon.origin", "flags.dnd5e.isPolymorphed"],
  },
  unlisted: [],
});

/** badges.install's rows. */
export const BADGE_ROWS = Object.freeze([
  {
    path: "open",
    params: [REGION, { name: "opts", type: "{ edit = false }", optional: true }],
    returns: "Promise<PortalCard> | null (not a GM)",
    gm: true, writes: false, legacy: true,
    doc: "Open the Portal card window for a teleport region: the player's view, or the editor with { edit: true }.",
  },
  {
    path: "redraw",
    params: [],
    returns: "Promise<void>",
    gm: false, writes: false, legacy: true,
    doc: "Redraw the travel badges on this client's canvas.",
  },
  {
    path: "badges",
    params: [],
    returns: "[{ region: { documentName, id, uuid, name }, revealed, visible, cards: [card] }]",
    gm: false, writes: false,
    doc: "The travel badges drawn on this client's canvas now, and whether each is visible to this user.",
  },
]);

/** party.install's rows. */
export const PARTY_ROWS = Object.freeze([
  {
    path: "spreadArrival",
    params: [{ name: "tokenDoc", type: "TokenDocument", doc: "a token that just arrived" }],
    returns: "the same TokenDocument",
    gm: true, writes: true, legacy: true,
    sideEffects: ["Token: x, y (teleport, no animation)"],
    doc: "If the token shares a square with someone, move it to the nearest free square (setting spreadArrivals).",
  },
]);
