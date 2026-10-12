/**
 * The GM's Share — telling, not rolling: who knows what (`factStatus`), share and forget, the legacy
 * miss audit, and the GM's hand-thrown inspection.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import {
  attributeIdsOf,
  attributeLore,
  clearKnowledge,
  describeAttribute,
  knowledge,
  setKnowledge
} from "../attributes.mjs";
import { MODULE } from "../ties-core.mjs";
import { rolledMiss } from "../core/rules.mjs";
import {
  ATTR_BELIEFS_SETTING,
  authoredTier,
  BELIEFS_FLAG,
  factKeyOf,
  failedAttribute,
  GRANTED_FLAG,
  GRANTED_TEXT_MAX,
  identifiedKey,
  identifiedState,
  isBlankProse,
  KIND_KEY,
  KNOWN_FLAG,
  knowsAttribute,
  LORE_FLAG,
  MEMBER_FACT,
  parseFactKey,
  readAttrBeliefs,
  readGranted,
  readLore,
  rollableLore,
  shareStatus
} from "../known-core.mjs";
import { applyPlayerWrites, knownListWith, putBelief } from "./apply.mjs";
import { applyInspect, concealmentFor, grantKind, writeIdentification } from "./cascade.mjs";
import { dropRow } from "./claim.mjs";
import { factFrom, pending, reset, rowMissed } from "./gate.mjs";
import { beliefsOf, kindActorOf, reg, resolveFact, studyStateFor, studyTiersOf } from "./resolve.mjs";
import { esc, INSPECT } from "./shared.mjs";
import { readFlag } from "../lib/flags.mjs";
import { setting } from "../settings.mjs";

/* -------------------------------------------- */
/*  The GM's Share — telling, not rolling       */
/* -------------------------------------------- */

/**
 * The grant key a fact renders under on the recipient's Known tab, and where its ledger row is.
 * `spec` is the inspect window's fact descriptor:
 *
 *   `{ ns: "ident", subjectId, attrId }`           that `subject` carries `attrId`
 *   `{ ns: "attr",  subjectId, attrId, factId }`   one lore row of an attribute
 *   `{ ns: "lore",  subjectId, factId }`           one of the subject's own lore rows
 *   `{ ns: "kind",  subjectId }`                   the kind study (shared at tier 25)
 */
function shareKeyOf(spec, subject) {
  // the grammar lives in known-core's `factKeyOf`, shared with the player's Look window, so a
  // share can never land under a key the window does not ask for
  return factKeyOf({ ...spec, subjectId: subject.id }, spec?.ns === "kind" ? kindActorOf(subject)?.id ?? "" : null);
}

/**
 * Where one character stands on one fact, for the GM: `shareStatus` plus the row it came from.
 * → `{ status, key, belief, tier, total, from, dc }` — `status` ∈ passed|told|held|failed|locked|none.
 * Reads only; GM-only because every ledger it reads is GM-plane.
 */
export function factStatus(spec, character) {
  const subject = game.actors?.get(spec?.subjectId);
  const none = { status: "none", key: null, belief: null, tier: null, total: null, from: null, dc: null };
  if (!game.user?.isGM || !subject || !character) return none;
  const key = shareKeyOf(spec, subject);
  if (!key) return none;
  const granted = !!readGranted(readFlag(character, MODULE, GRANTED_FLAG))[key];
  let belief = null;
  let failedKnowledge = false;
  let dc = null;
  if (spec.ns === "ident") {
    belief = beliefsOf(subject)[character.id]?.[key] ?? null;
    failedKnowledge = failedAttribute(knowledge(), character.id, spec.attrId);
    const entry = describeAttribute(spec.attrId);
    if (typeof entry.dc === "number") dc = entry.dc + concealmentFor(subject, spec.attrId);
  } else if (spec.ns === "attr") {
    belief = readAttrBeliefs(setting(ATTR_BELIEFS_SETTING))[`${key}:${character.id}`] ?? null;
    dc = rollableLore(attributeLore(spec.attrId)).find(r => r.id === spec.factId)?.dc ?? null;
  } else if (spec.ns === "lore") {
    belief = beliefsOf(subject)[character.id]?.[key] ?? null;
    dc = rollableLore(readFlag(subject, MODULE, LORE_FLAG)).find(r => r.id === spec.factId)?.dc ?? null;
  } else if (spec.ns === "kind") {
    belief = beliefsOf(kindActorOf(subject))[character.id]?.[KIND_KEY] ?? null;
  }
  /*
   * ⚠ An identification's grant key (`attr:<id>:#id`) belongs to the ATTRIBUTE, not to this
   * creature: every pass on every carrier writes it, and a reset leaves it (decision 22). So it
   * says nothing about whether they have placed THIS creature — only the row on this creature
   * does. Counting it read "told" for a PC who had identified House Vrinn on Nilonim and never on
   * Vesh, and Share then refused them as already knowing while Vesh's ladder stayed locked.
   */
  const status = shareStatus({
    belief,
    granted: spec.ns === "ident" ? false : granted,
    failedKnowledge,
    kind: spec.ns === "kind",
    ident: spec.ns === "ident",
    dc: spec.ns === "lore" || spec.ns === "attr" ? dc : null
  });
  return { status, key, belief, tier: belief?.tier ?? null, total: belief?.total ?? null, from: belief?.from ?? null, dc };
}

/** Non-GM users who own this character — the only people a share whisper may reach. */
const ownersOf = character =>
  (game.users?.contents ?? [])
    .filter(u => !u.isGM && character?.testUserPermission?.(u, "OWNER"))
    .map(u => u.id);

/**
 * The recipient's whisper: *that* they learned something and about whom — never what. The stub
 * card's idiom (decision 11): the notebook is where the content lives. Skipped when nobody but a
 * GM owns the character, which is the whole table today.
 */
async function whisperShare(character, subject) {
  const whisper = ownersOf(character);
  if (!whisper.length) return false;
  await ChatMessage.create({
    content: `<p class="pt-study-stub">${esc(_loc("PENTARYN_TIES.known.share.whisper", { name: character.name, subject: subject.name }))}</p>`,
    whisper,
    speaker: { alias: game.user?.name ?? "GM" }
  });
  return true;
}

/**
 * **Share one fact with characters who did not roll it** — the GM's "maybe mention this", made
 * real. Writes exactly what a pass writes, marked as told (`total: null`, `from`), so it lands in
 * the recipient's Known tab like anything they worked out themselves.
 *
 * ## The chain rule
 *
 * A shared **identification** is a delivered positive identification of that rung on that subject
 * AND stage-1 knowledge of the attribute — whatever was there before, failure included. Those are
 * the two rows the planner reads (`identifiedState`, `failedAttribute`), so the recipient's next
 * Inspect climbs to the child rungs and rolls them; no planner change, fixtured in test/known.mjs.
 * Children and parents are never written: a share hands over exactly the one thing named. Knowing
 * the attribute does not identify it on any OTHER carrier — they still roll there (at advantage,
 * if the attribute's help scale says so).
 *
 * A stage-1 row they already hold as KNOWN is left alone (its `via` stays the truth); a FAILED one
 * is overwritten and remembered (`overFailed`) so `forgetFact` can give the failure back.
 *
 * Skips: `held` (use Deliver — it also resumes their cascade, which a share must not do) and
 * `knows` (already passed or told; a kind below tier 25 is not "knows" — the share raises it).
 *
 * → `{ ok, shared: [pcId], skipped: [{pcId, reason}], unseen: [pcId], reason? }` — `unseen`: an
 * attribute-lore share to someone who has not identified that (secret) attribute on this subject;
 * the grant is written, but will not show under this creature until they have.
 */
export async function shareFact(spec, recipients, { from = null, notify = true } = {}) {
  const out = { ok: false, shared: [], skipped: [], unseen: [] };
  if (!game.user?.isGM) return { ...out, reason: "notGM" };
  const subject = game.actors?.get(spec?.subjectId);
  if (!subject || !["ident", "attr", "lore", "kind"].includes(spec?.ns)) return { ...out, reason: "invalid" };
  const fromId = from ? from.id : "gm";
  const fromActor = from && typeof from === "object" ? from : null;
  const sourceBy = source => (fromActor ? _loc("PENTARYN_TIES.known.share.sourceBy", { source, name: fromActor.name }) : source);

  // resolve the fact once; a fact that cannot be said is refused for everyone
  let entry = null;
  let fact = null;
  let text = "";
  if (spec.ns === "ident") {
    if (!attributeIdsOf(subject, kindActorOf).includes(spec.attrId)) return { ...out, reason: "notCarried" };
    entry = describeAttribute(spec.attrId);
    text = String(entry.reveal ?? "");
    // a blank text row reads as NOT carrying, and would block every child beneath it
    if (isBlankProse(text)) return { ...out, reason: "noText" };
  } else if (spec.ns === "attr" || spec.ns === "lore") {
    fact = resolveFact({ ns: spec.ns, subjectId: subject.id, factId: spec.factId, attrId: spec.attrId });
    if (!fact) return { ...out, reason: "invalid" };
    text = String(fact.row.text ?? "");
    if (isBlankProse(text)) return { ...out, reason: "noText" };
  } else {
    const state = studyStateFor(null, subject);
    if (!state.kind || !state.content) return { ...out, reason: "noText" };
  }

  const pcs = [];
  const priorFor = new Map();
  for (const pc of recipients ?? []) {
    if (!pc?.id || pc.type !== "character") continue;
    const st = factStatus(spec, pc);
    if (st.status === "held") out.skipped.push({ pcId: pc.id, reason: "held" });
    else if ((st.status === "passed" || st.status === "told") && !(spec.ns === "kind" && Number(st.tier ?? 0) < 25))
      out.skipped.push({ pcId: pc.id, reason: "knows" });
    else {
      pcs.push(pc);
      /*
       * The row this share replaces — a failed roll, or a kind tier below 25 — kept on the shared
       * row (`priorOf`) so `forgetFact` restores it, lock and all, instead of deleting it into a
       * free re-roll. One level deep: a share over a share keeps the original answer.
       */
      const b = st.belief;
      if (b && (b.text?.trim() || b.total != null || b.delivered || b.tier != null)) {
        const base = b.from && b.prior ? b.prior : b;
        priorFor.set(pc.id, {
          text: base.text ?? "",
          tier: base.tier ?? null,
          total: base.total ?? null,
          when: base.when ?? 0,
          delivered: base.delivered ?? null,
          ...(typeof base.pass === "boolean" ? { pass: base.pass } : {}),
          ...(base.from ? { from: base.from } : {})
        });
      }
    }
  }
  if (!pcs.length) return { ...out, ok: true };
  const now = Date.now();

  if (spec.ns === "ident") {
    const attrId = spec.attrId;
    const know = knowledge();
    const rows = pcs
      .map(pc => {
        const row = know[pc.id]?.[attrId];
        /*
         * A stage-1 row still PENDING (a pass held on another creature) is known to the planner
         * but hidden from the player's world list — so the reveal this share files would show on
         * the Known tab while the attribute itself stayed invisible. Release it, keeping its
         * `via`: it was rolled, and a Forget must not delete it (`clearKnowledge` is shared-only).
         */
        if (row && row.failed === false && row.pending)
          return { characterId: pc.id, attrId, failed: false, via: row.via, when: row.when, pending: false };
        if (knowsAttribute(know, pc.id, attrId)) return null;
        return {
          characterId: pc.id,
          attrId,
          failed: false,
          via: "shared",
          when: now,
          pending: false,
          overFailed: failedAttribute(know, pc.id, attrId)
        };
      })
      .filter(Boolean);
    if (rows.length) await setKnowledge(rows); // one call: the setting is rewritten whole
    for (const pc of pcs) {
      await writeIdentification(subject, pc.id, attrId, {
        text,
        total: null,
        when: now,
        delivered: now,
        from: fromId,
        prior: priorFor.get(pc.id) ?? null
      });
      const granted = readGranted(readFlag(pc, MODULE, GRANTED_FLAG));
      granted[identifiedKey(attrId)] = {
        text: text.slice(0, GRANTED_TEXT_MAX),
        when: now,
        icon: entry.icon,
        source: sourceBy(entry.title)
      };
      await pc.update({
        [`flags.${MODULE}.${KNOWN_FLAG}`]: knownListWith(pc, subject, now),
        [`flags.${MODULE}.${GRANTED_FLAG}`]: granted
      });
      out.shared.push(pc.id);
    }
  } else if (fact) {
    // a SECRET attribute's lore renders under this creature only once they have placed him in it
    // (`visibleAttributesFor`) — written all the same, but the GM is told where it will show
    const secret = spec.ns === "attr" && !!reg().find(e => e.id === spec.attrId)?.secret;
    for (const pc of pcs) {
      if (secret && !identifiedState(readFlag(subject, MODULE, BELIEFS_FLAG) ?? {}, pc.id, spec.attrId).carries) out.unseen.push(pc.id);
      await putBelief(fact, pc.id, {
        text,
        tier: null,
        total: null,
        when: now,
        delivered: now,
        from: fromId,
        prior: priorFor.get(pc.id) ?? null
      });
      await applyPlayerWrites(pc, fact, { text, silent: false, tier: null, source: sourceBy(fact.name) }, now);
      out.shared.push(pc.id);
    }
  } else {
    for (const pc of pcs) {
      if (await grantKind(pc, subject, 25, { from: fromActor ?? "gm", quiet: true, prior: priorFor.get(pc.id) ?? null }))
        out.shared.push(pc.id);
      else out.skipped.push({ pcId: pc.id, reason: "knows" });
    }
  }

  if (notify) for (const id of out.shared) await whisperShare(game.actors.get(id), subject);
  return { ...out, ok: true };
}

/**
 * Undo a share — **and only a share** (`factStatus` must read `told`).
 *
 * What the share REPLACED comes back (`prior`, kept by `shareFact`): a failed roll stays failed
 * and locked, a kind tier they rolled stays theirs, card and all. Forgetting is never a free
 * re-roll and never takes away something earned. With no prior (they had nothing) the row and
 * the lock go, as a reset does.
 *
 * An identification's stage-1 row and its reveal card belong to the ATTRIBUTE, not this creature
 * (`attr:<id>:#id` renders under every carrier they have placed). Both are left alone while ANY
 * other creature is still identified as a carrier for them — rolled or shared — so forgetting
 * House Vrinn on Vesh cannot un-know what Caven rolled on Nilonim. Otherwise the stage-1 row is
 * cleared (`clearKnowledge`: shared rows only; a share over a failed roll restores the failure).
 *
 * The Known entry the share filed is left in their notebook, with any notes they wrote in it.
 * → `{ ok, reason? }`
 */
export async function forgetFact(spec, character) {
  if (!game.user?.isGM) return { ok: false, reason: "notGM" };
  const subject = game.actors?.get(spec?.subjectId);
  if (!subject || !character) return { ok: false, reason: "invalid" };
  const st = factStatus(spec, character);
  if (st.status !== "told") return { ok: false, reason: "notTold" };
  const prior = st.belief?.prior ?? null;
  const dropGrant = async () => {
    if (readGranted(readFlag(character, MODULE, GRANTED_FLAG))[st.key])
      await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}.-=${st.key}`]: null });
  };

  if (spec.ns === "ident") {
    const attrId = spec.attrId;
    const key = identifiedKey(attrId);
    // quietly, not through `resetIdentification`: this is not a do-over, and a flag update would
    // MERGE the prior into the shared row (keeping its `from`) instead of replacing it
    const all = readFlag(subject, MODULE, BELIEFS_FLAG) ?? {};
    if (all[character.id]?.[key])
      await subject.update(dropRow(`flags.${MODULE}.${BELIEFS_FLAG}`, character.id, key, all[character.id]), { render: false });
    if (prior) await writeIdentification(subject, character.id, attrId, prior);
    const elsewhere = (game.actors?.contents ?? []).some(
      a => a.id !== subject.id && identifiedState(readFlag(a, MODULE, BELIEFS_FLAG) ?? {}, character.id, attrId).carries
    );
    if (!elsewhere) {
      await clearKnowledge(character.id, attrId);
      await dropGrant();
    }
    return { ok: true };
  }

  if (!prior) {
    await reset(character, subject, spec.ns === "kind" ? null : spec.factId, spec.ns === "attr" ? spec.attrId : null);
    await dropGrant();
    return { ok: true };
  }

  // give back the row the share replaced; the `studied` lock it implies stays where it is
  const fact = factFrom(subject, spec.ns === "kind" ? null : spec.factId, spec.ns === "attr" ? spec.attrId : null);
  if (!fact) return { ok: false, reason: "invalid" };
  await putBelief(fact, character.id, null);
  await putBelief(fact, character.id, prior);
  /*
   * Was the replaced row a card the player actually holds? Delivered and with text — a failed
   * lore/attribute row's text IS its written failure line, which they were handed (2026-10-08).
   * The same test `deliverFact` applies, so Forget and Deliver agree: a kind's failure comes back
   * only when the kind has an authored rung 0 (a legacy row may hold the retired generic line).
   */
  const missed = rowMissed(fact, prior);
  const lie = spec.ns === "kind" && missed && !!authoredTier(studyTiersOf(fact.ledger), 0);
  const earned = !!prior.delivered && !!String(prior.text ?? "").trim() && (spec.ns !== "kind" || !missed || lie);
  if (earned) {
    const granted = readGranted(readFlag(character, MODULE, GRANTED_FLAG));
    granted[st.key] = {
      text: String(prior.text ?? "").slice(0, GRANTED_TEXT_MAX),
      when: prior.when ?? Date.now(),
      icon: fact.img,
      source: fact.name
    };
    await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}`]: granted });
  } else await dropGrant();
  return { ok: true };
}

/**
 * **Console-only audit:** granted cards a FAILURE put in a player's notebook before 2026-10.
 *
 * ⚠ Since 2026-10-08 a failure with written failure text DELIVERS that text again (Joe reversed
 * the "never shown" rule), so lore/attribute cards this lists may be intended. Read it as "cards
 * that came from a failed roll", not "cards to pull".
 *
 * Until then a failed lore roll delivered the row's miss line as a card, and a failed kind study
 * delivered either its authored rung 0 or a generic "nothing about it means anything to you". Now
 * a failure hands over nothing, but the cards already granted are still on the players' sheets.
 * Pulling one is a visible change mid-campaign, so this only LISTS them; removing any is Joe's
 * call by hand. No UI on purpose — a one-time sweep, and console exposure is fine at this table.
 *
 * Lists a card when the ledger row behind it is a failure: `pass: false`, or a legacy row with no
 * `pass` whose total is under the row's DC. A kind card below tier 15 is listed only when it does
 * not carry the kind's current authored rung 0 — that lie is the one failure text still delivered.
 * Identification cards are never listed: the cascade never delivered a miss.
 *
 * → `[{ character, characterId, subject, factKey, text }]`
 */
export function legacyMissCards() {
  if (!game.user?.isGM) return [];
  const attrLedger = readAttrBeliefs(setting(ATTR_BELIEFS_SETTING));
  const out = [];
  for (const pc of game.actors?.contents ?? []) {
    if (pc.type !== "character") continue;
    for (const [factKey, card] of Object.entries(readGranted(readFlag(pc, MODULE, GRANTED_FLAG)))) {
      const parsed = parseFactKey(factKey);
      if (!parsed) continue;
      let subject = null;
      let missed = false;
      if (parsed.ns === "lore") {
        const actor = game.actors.get(parsed.subject);
        if (!actor) continue;
        subject = actor.name;
        const dc = readLore(readFlag(actor, MODULE, LORE_FLAG)).find(r => r.id === parsed.fact)?.dc;
        missed = rolledMiss(beliefsOf(actor)[pc.id]?.[factKey], dc);
      } else if (parsed.ns === "attr" && parsed.fact !== MEMBER_FACT) {
        subject = describeAttribute(parsed.subject)?.title ?? parsed.subject;
        const dc = readLore(attributeLore(parsed.subject)).find(r => r.id === parsed.fact)?.dc;
        missed = rolledMiss(attrLedger[`${factKey}:${pc.id}`], dc);
      } else if (parsed.ns === "kind") {
        const kind = game.actors.get(parsed.subject);
        if (!kind) continue;
        subject = kind.name;
        const rec = beliefsOf(kind)[pc.id]?.[KIND_KEY];
        const lie = authoredTier(studyTiersOf(kind), 0);
        missed = !!rec && !rec.from && !(Number(rec.tier) >= 15) && !(lie && String(card.text ?? "").includes(lie));
      }
      if (missed) out.push({ character: pc.name, characterId: pc.id, subject, factKey, text: card.text });
    }
  }
  return out;
}

/** GM hand-throw, no socket and no gesture — the same handler, same validation, same writes. */
export async function inspectAs(character, subject) {
  if (!game.user?.isGM) return false;
  // the hand-throw has no gesturing client of its own, so this is the one caller that asks the
  // handler to post — and it runs on exactly one client, so it cannot duplicate
  return applyInspect({ action: INSPECT, characterId: character?.id, subjectId: subject?.id }, game.user.id, {
    postStubCard: true
  });
}
