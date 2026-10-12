/**
 * Pentaryn Transform — the API manifest. PURE DATA: node imports it without a Foundry stub,
 * describe() reports it, and buildApi() refuses to load when it and the implementations drift.
 *
 * The seven legacy rows keep their old signatures (`legacy: true`, first param an Actor document,
 * never named `ref`, so nothing is resolved for them and the published functions are the module's
 * own). inspect(ref) is the one read that takes a ref (transform-creatures-17). The Starry rows are
 * starry.mjs's contribution (STARRY_ROWS), built into the same frozen API (transform-creatures-16).
 */

import { CONTRACT, MODULE, NS, VERSION } from "./transform-core.mjs";

const ACTOR = { name: "actor", type: "Actor", doc: "the druid or the form they are in — a document, not a ref (legacy)" };
const REF = { name: "ref", kind: "actor", type: "Actor|Token|uuid|id|exact name", doc: "never a substring" };

const WS = "flags.pentaryn-transform.wildshape";
const REVERT = "flags.pentaryn-transform.revert";   // set by hand on an item; read, never written (EXT-1)
const KEEP_IN_FORM = "flags.pentaryn-transform.keepInForm";   // set by hand: a feat that stays in the form
const STARRY = "flags.pentaryn-transform.starry";
const CLAIMS = "flags.pentaryn-transform.claims";   // one tab writes an automatic ending (transform-core-async-2)
const LIGHT = "flags.pentaryn-senses.light";
const HAND_LIGHT = "flags.dnd5e.previousTokenData.light";   // light-roundtrip: the druid token's own light
const SENSES_TOKEN = ["flags.pentaryn-senses.itemLight", "flags.pentaryn-senses.itemLightPrior", "flags.pentaryn-senses.spellLight"];

export const MANIFEST = Object.freeze({
  module: MODULE,
  namespace: NS,
  version: VERSION,
  contract: CONTRACT,
  flagScope: MODULE,
  rows: [
    {
      path: "shift", legacy: true,
      params: [ACTOR, { name: "profileId", type: "string", doc: "the transform profile's _id (forms(actor)[].id)" }],
      returns: "Promise<Actor|null> — the new form", gm: false, writes: true,
      sideEffects: [WS, "the Wild Shape item's uses", "a new form actor (linked) or the token's actor (unlinked)",
        `${HAND_LIGHT} (the token's own light, which dnd5e's revert puts back)`],
      nullWhen: "a shift for this actor is already running (double-click); no Wild Shape; an unknown profile; a block "
        + "(busy, no permission, incapacitated, 0 HP, no token on the viewed scene, no uses — each warns); the old "
        + "form's revert failed; the transform did not happen (the use is refunded)",
      doc: "Wild Shape into a known form, spending one use; from a form, the 2024 'use Wild Shape again' (the "
        + "current form ends first). Runs with the caller's permissions, as a HUD click does.",
    },
    {
      path: "revert", legacy: true,
      params: [ACTOR, { name: "opts", type: "{ quiet?: boolean, reason?: 'manual'|'zeroHP'|'incapacitated'|'expired'|'longRest' }", optional: true }],
      returns: "Promise<Actor|null> — the original", gm: false, writes: true,
      sideEffects: ["the original's item uses, Hit Dice, exhaustion, inspiration and carried conditions", "tokens on other scenes"],
      nullWhen: "not transformed (an info toast unless quiet); a stale form; not the owner (a warning); this form is "
        + "already reverting; dnd5e returned nothing",
      doc: "Return a transformed actor to its original form, carrying back what dnd5e does not; one chat line "
        + "for the reason unless quiet.",
    },
    {
      path: "forms", legacy: true, params: [ACTOR],
      returns: "{ id, name, uuid, actor: Actor|null }[]", gm: false, writes: false,
      doc: "The druid's known forms (the Wild Shape activity's profiles), with the source actors resolved. [] without Wild Shape.",
    },
    {
      path: "wildShapeActivity", legacy: true, params: [ACTOR],
      returns: "Activity|null", gm: false, writes: false, nullWhen: "no Wild Shape activity on the actor or its original",
      doc: "The Wild Shape transform activity (on the original when the actor is a form).",
    },
    {
      path: "original", legacy: true, params: [ACTOR],
      returns: "Actor|null", gm: false, writes: false, nullWhen: "a linked form whose original actor is gone; no actor",
      doc: "The actor a form was made from; the actor itself when it is not transformed, or when it is an unlinked token's form.",
    },
    {
      path: "isRevertItem", legacy: true, params: [{ name: "item", type: "Item" }],
      returns: "boolean", gm: false, writes: false,
      doc: "True for an item flagged pentaryn-transform.revert (using it returns its actor to normal form).",
    },
    {
      path: "sweepSpentForms", legacy: true, params: [],
      returns: "Promise<void>", gm: true, writes: true, sideEffects: ["deletes spent form actors", `${CLAIMS}.sweep`],
      doc: "Active GM only: delete transformed copies (flags.dnd5e.originalActor) with no token on any scene and "
        + "older than 10 s; younger ones are checked again when old enough. Each form is claimed first, so with "
        + "two tabs of the GM open only one deletes it. Runs by itself after token traffic.",
    },
    {
      path: "inspect",
      params: [REF, { name: "opts", type: "{ sceneId?, base?, as? }", optional: true }],
      returns: "{ actor, original, shifted, wildShapeForm, form: { name, profileId, sourceUuid, endsAt, secondsLeft }|null, "
        + "wildShape: { itemId, usesLeft, max }|null, starry: { constellation, secondsLeft }|null, forms: { id, name }[] }",
      gm: false, writes: false, throws: ["NOT_FOUND", "AMBIGUOUS", "BAD_ARGS"], since: "0.4.0",
      doc: "Read-only shape state for one actor, plain JSON, depth ≤ 4. opts.sceneId scopes a token ref; opts.as = a "
        + "user ref answers with that user's view (without OBSERVER on the actor: { actor } only).",
    },
    {
      path: "formImage",
      params: [{ name: "opts", type: "{ uuid: string }", doc: "the beast Actor's uuid (a Wild Shape profile's)" }],
      returns: "Promise<string|null> — the token image path", gm: false, writes: false, query: true, relay: true,
      nullWhen: "the uuid is not an Actor; the beast has no image at all",
      doc: "The token image a Wild Shape form of this beast gets, the same every time: its concrete prototype token "
        + "image; for a wildcard, the first matching file in sorted order; else its portrait. Also a relay query "
        + "(active GM answers): a player who may not browse files gets the image a GM would.",
    },
    {
      path: "selftest", params: [],
      returns: "{ ok, checks: [{ label, ok, detail }] }", gm: false, writes: false, since: "0.4.0",
      doc: "Live smoke checks after a sync.",
    },
  ],
  flags: {
    writes: [WS, STARRY, LIGHT, HAND_LIGHT, CLAIMS],
    reads: ["flags.dnd5e.originalActor", "flags.dnd5e.isPolymorphed", "flags.dnd5e.transformOptions",
      "flags.dnd5e.previousTokenData", "flags.dnd5e.previousActorData", LIGHT, ...SENSES_TOKEN,
      REVERT, KEEP_IN_FORM],
  },
  unlisted: [],
});

/** starry.mjs's contribution (its install() returns these with their implementations). */
export const STARRY_ROWS = Object.freeze([
  {
    path: "starry.assume", legacy: true,
    params: [ACTOR, { name: "constellation", type: "'archer'|'chalice'|'dragon'" }],
    returns: "Promise<boolean> — whether the form is now up with that constellation", gm: false, writes: true,
    sideEffects: [STARRY, LIGHT, "the Wild Shape item's uses"],
    doc: "Take on Starry Form with this constellation (one Wild Shape use), or with Twinkling Constellations change "
      + "it for free while the form is up. false (with a warning) when shifted, incapacitated or out of uses, "
      + "or when the druid has no Starry Form feature or consume activity; false (silently) for an unknown "
      + "constellation or no actor, while a call is already in progress for this druid, or when the "
      + "activity's use is refused.",
  },
  {
    path: "starry.end", legacy: true,
    params: [ACTOR, { name: "opts", type: "{ quiet?: boolean, reason?: 'manual'|'incapacitated'|'expired' }", optional: true }],
    returns: "Promise<boolean> — false when no Starry Form was up, or this client is already ending it", gm: false, writes: true, sideEffects: [STARRY, LIGHT],
    doc: "Dismiss Starry Form (no action required); one chat line for the reason unless quiet.",
  },
  {
    path: "starry.active", legacy: true, params: [ACTOR],
    returns: "ActiveEffect|null", gm: false, writes: false,
    doc: "The druid's live Starry Form effect.",
  },
  {
    path: "starry.constellation", legacy: true, params: [ACTOR],
    returns: "'archer'|'chalice'|'dragon'|null", gm: false, writes: false,
    doc: "The constellation glimmering now, or null.",
  },
]);
