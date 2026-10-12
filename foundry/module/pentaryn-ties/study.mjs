/**
 * The study conduit — the GM's client throws the roll and hands back one string.
 *
 * ## What this is, in one paragraph
 *
 * A player points at a creature in their notebook and asks "what *is* this?". The answer is
 * graded by a d20 they are never allowed to see, because the answer at low totals may be
 * **deliberately false** (design decision 5) and a player who saw a 9 would know to distrust
 * the confident sentence they were just handed. So the roll does not happen on their client
 * at all: their client sends two declarations over the socket, a GM's client rolls blind,
 * grades, composes, writes, and posts one public stub card that says a check was made and
 * about whom. Nothing else crosses the wire in either direction.
 *
 * ## The trust boundary — the same one `relay.mjs` established
 *
 * Identity comes from the **server** (`senderId`, the socket handler's second argument),
 * never from the payload. Ownership, reach, the kill switch and the lock are all re-derived
 * here from documents this client can see. The payload is trusted for exactly two ids and
 * two bounded declarations (advantage mode, situational bonus) — and those two print on the
 * GM's own card, so lying in them is lying to the GM's face. That is the physical-table trust
 * level, which is the level Joe's threat model (disguise decision 9) actually asks for.
 *
 * ## What is genuinely secret, and what is only presentation
 *
 * Foundry ships every document to every client, so a monster's stat block is on the player's
 * machine before anyone rolls. What this conduit keeps off that machine is what it never
 * sends: **the total, the DC, the tiers they did not buy, and the GM's authored words for
 * rungs they missed.** A secret never sent is the only kind client-side code can keep, and it
 * is a stronger one than the rejected "ask the GM to disclose what you already hold" design.
 *
 * ## The indistinguishability contract (decision 11) — read this before touching the UI
 *
 * The *process* of a completed study roll is identical whatever the outcome: the affordance
 * vanishes on any completed roll, the stub card is the same DOM, no notification fires on the
 * player's client, and the provenance header carries the skill and nothing else. **If any
 * pixel of that differs by outcome, that pixel is the number.** Do not add a success tint, a
 * "you learned a lot!" toast, or a longer delay for the bigger write.
 *
 * What it leaves behind is not identical, by decision (2026-10, "failure is absence",
 * `context/plans/attribute-silent-failure.md`): on a lore tell or a kind study a pass adds a
 * card and a Known-list entry, and a failure adds nothing — no card, no placeholder — while the
 * lock is still written so there is no retry. The player can tell *that* they failed, never
 * *what* they missed. An authored rung 0 on a kind is the one lie, and it lands in the pass's
 * exact shape. The Inspect cascade stays fully indistinguishable: it rolls chat-less, so a
 * failure and a pass with no reveal leave the same nothing on screen.
 */

/*
 * A BARREL since S4b (ties-35): the conduit lives in study/*.mjs, one concern per file —
 *
 *   study/shared.mjs     private plumbing: channel and action names, i18n/escape, the applying-GM test
 *   study/claim.mjs      the two-GM-sessions claim protocol (facts and inspections)
 *   study/resolve.mjs    the fact seam (`resolveFact`), the ledger readers, the settings it reads
 *   study/compose.mjs    deriving the truth off the sheet: description, attacks, traits, the payload
 *   study/request.mjs    the player side: the study dialog and the requests a player sends
 *   study/apply.mjs      the GM side: the blind roll, applying a request, the belief ledger, stub cards
 *   study/gate.mjs       the approval gate: held reveals, deliver, pending, reset
 *   study/authoring.mjs  GM authoring: kind pointer, ladder, offset, hold, the beliefs view
 *   study/cascade.mjs    Phase 8: inspection, the identification cascade, grantKind and the resets
 *   study/tempo.mjs      the tempo tell (scoping bubbles)
 *   study/share.mjs      the GM's Share and Forget, factStatus, the legacy miss audit, inspectAs
 *   study/register.mjs   the socket handler and the GM's hand-thrown study (studyAs)
 *
 * This path is kept because it is documented (context/foundry/attributes.md, console macros import
 * "/modules/pentaryn-ties/study.mjs"). The barrel names each export, so a helper one study/ file shares
 * with another never leaks into this surface (golden/study-exports.json pins it).
 */

export { SITUATIONAL_MAX, SITUATIONAL_MIN } from "./study/shared.mjs";
export {
  beliefsOf,
  kindActorOf,
  resolveFact,
  studiedOf,
  studyHoldFor,
  studySkillFor,
  studyStateFor,
  studyTiersOf
} from "./study/resolve.mjs";
export { composeStudyPayload } from "./study/compose.mjs";
export {
  attrLoreStateFor,
  attrOffersFor,
  loreStateFor,
  requestAttrLore,
  requestLore,
  requestStudy
} from "./study/request.mjs";
export { deliver, pending, reset } from "./study/gate.mjs";
export {
  beliefs,
  concealOf,
  kindDialog,
  loreRowsOf,
  setConceal,
  setKindOf,
  setStudyHold,
  setStudyOffset,
  setStudyTiers,
  writeLoreRows
} from "./study/authoring.mjs";
export {
  deliverHeldIdentifications,
  grantKind,
  heldCarriersFor,
  inspect,
  releaseHeldAttribute,
  resetIdentification,
  resetInspection
} from "./study/cascade.mjs";
export { clearScoping, scopingState } from "./study/tempo.mjs";
export { factStatus, forgetFact, inspectAs, legacyMissCards, shareFact } from "./study/share.mjs";
export { registerStudy, studyAs } from "./study/register.mjs";
