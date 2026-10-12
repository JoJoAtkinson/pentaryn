/**
 * The approval gate: held reveals, deliver, pending, reset.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { attributeLore, describeAttribute } from "../attributes.mjs";
import { MODULE } from "../ties-core.mjs";
import { rolledMiss } from "../core/rules.mjs";
import {
  ATTR_BELIEFS_SETTING,
  attrFactKey,
  authoredTier,
  isBlankProse,
  KIND_KEY,
  LORE_FLAG,
  MEMBER_FACT,
  parseFactKey,
  parseLedgerKey,
  readAttrBeliefs,
  readLore,
  rollableLore,
  STUDIED_FLAG
} from "../known-core.mjs";
import { applyPlayerWrites, putBelief, readBelief } from "./apply.mjs";
import { beliefsOf, concealmentFor, resolveFact, studiedOf, studyTiersOf } from "./resolve.mjs";
import { esc } from "./shared.mjs";
import { readFlag } from "../lib/flags.mjs";
import { setting } from "../settings.mjs";

/* -------------------------------------------- */
/*  The approval gate                           */
/* -------------------------------------------- */

/**
 * Deliver / Later — **and there is no Deny.**
 *
 * Approval is a *timing* control, not a veto: the check passed and denying it would confiscate
 * a success the dice already granted. The honest do-over is `reset`, which un-spends the lock
 * and un-writes the belief in the open, rather than a button that quietly eats a pass.
 *
 * The prompt is a convenience, not the store. "Later" just closes it: the row stays pending in
 * the ledger and is deliverable from the console (and, when phase 4's Beliefs section lands,
 * from the sheet) a week from now.
 */
export async function promptDeliver(character, fact) {
  const rec = readBelief(fact, character.id);
  if (!rec || rec.delivered) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: _loc("PENTARYN_TIES.known.study.holdTitle") },
    content:
      `<p>${esc(_loc("PENTARYN_TIES.known.study.holdWho", { character: character.name, subject: fact.subject?.name ?? fact.name }))}</p>` +
      `<p class="pt-study-hold-meta">${esc(
        fact.ns === "lore"
          ? _loc("PENTARYN_TIES.known.study.holdMetaLore", { fact: fact.name, dc: fact.dc, total: rec.total })
          : _loc("PENTARYN_TIES.known.study.holdMeta", { tier: rec.tier, total: rec.total })
      )}</p>` +
      // a silent outcome has no prose to preview — say so, or the GM reads an empty box as a bug
      `<div class="pt-study-hold-text">${
        !isBlankProse(rec.text) ? esc(rec.text) : `<em>${esc(_loc("PENTARYN_TIES.known.study.holdSilent"))}</em>`
      }</div>`,
    yes: { label: _loc("PENTARYN_TIES.known.study.deliver") },
    no: { label: _loc("PENTARYN_TIES.known.study.later") }
  });
  if (ok) await deliverFact(fact, character);
}

/**
 * Release a pending reveal. Idempotent: an already-delivered row is left alone.
 *
 * ⚠ The parked payload is replayed from the ledger, never recomputed. Re-running `grade` here
 * would re-read the authored text — so a GM who edited a lore row between the roll and the
 * Deliver would hand over prose the dice never bought. The ledger row IS the record of what
 * was said (decision 12), and this is the function that has to believe it.
 */
async function deliverFact(fact, character) {
  const rec = readBelief(fact, character?.id);
  if (!rec) {
    ui.notifications.warn(
      _loc("PENTARYN_TIES.known.study.notify.noPending", { character: character?.name ?? "?", kind: fact.name })
    );
    return false;
  }
  if (rec.delivered) return false;
  const now = Date.now();
  /*
   * Replay the ledger (never recompute). A failed lore/attribute row parked its written failure
   * line as its text, and that is what it hands over (Joe, 2026-10-08) — an empty one hands over
   * nothing. The one exception is a KIND below 15 with no authored rung 0 now: rows held before
   * 2026-10 parked the generic "nothing about it means anything" card, which is no longer said.
   */
  const { missed, lie } = missedAndLie(fact, rec);
  const silent = isBlankProse(String(rec.text ?? "")) || (fact.ns === "kind" && missed && !lie);
  if (!(await applyPlayerWrites(character, fact, { text: rec.text, silent, tier: rec.tier }, now))) return false;
  await putBelief(fact, character.id, { ...rec, delivered: now, claim: null });
  ui.notifications.info(
    _loc(missed ? "PENTARYN_TIES.known.study.notify.missed" : "PENTARYN_TIES.known.study.notify.delivered", { character: character.name, kind: fact.name })
  );
  return true;
}

/**
 * Did this rolled row fail? The roll's stored verdict when there is one; a kind derives it from
 * the tier; a legacy flat row with no `pass` derives it from its total against the row's DC. A
 * share (`from`) or a GM tell (`total: null`) is never a failure.
 */
export function rowMissed(fact, rec) {
  if (!rec || rec.from) return false;
  if (fact.ns === "kind") return rec.total !== null && rec.total !== undefined && !(Number(rec.tier) >= 15);
  return rolledMiss(rec, fact.dc);
}

/**
 * `rowMissed`, plus whether that miss is a kind's authored rung-0 lie — a failed kind row that
 * still counts as a card because the kind has an authored rung 0. One test, so `deliverFact` and
 * `forgetFact` agree on which failures the player holds.
 */
export function missedAndLie(fact, rec) {
  const missed = rowMissed(fact, rec);
  return { missed, lie: fact.ns === "kind" && missed && !!authoredTier(studyTiersOf(fact.ledger), 0) };
}

/**
 * Resolve the three public shapes onto one descriptor:
 *   `(character, subject)`                 → the kind ladder
 *   `(character, subject, loreId)`          → a lore row on that individual
 *   `(character, subject, loreId, attrId)`  → an attribute fact, learned through that subject
 */
export const factFrom = (subject, loreId, attrId) =>
  resolveFact(
    attrId
      ? { ns: "attr", subjectId: subject?.id, factId: loreId, attrId }
      : loreId
        ? { ns: "lore", subjectId: subject?.id, factId: loreId }
        : { ns: "kind", subjectId: subject?.id }
  );

export async function deliver(character, subject, loreId = null, attrId = null) {
  if (!game.user?.isGM) return false;
  const fact = factFrom(subject, loreId, attrId);
  if (!fact) return false;
  return deliverFact(fact, character);
}

/**
 * Every undelivered row in the world — the GM's nag surface.
 *
 * Walks both namespaces off the ledger's own keys rather than a list of things to check, so
 * the attribute phase's rows appear here the moment they can be written, with no edit.
 */
export function pending() {
  if (!game.user?.isGM) return [];
  const out = [];
  for (const ledger of game.actors?.contents ?? []) {
    for (const [characterId, facts] of Object.entries(beliefsOf(ledger))) {
      for (const [beliefKey, rec] of Object.entries(facts)) {
        if (!rec || rec.delivered) continue;
        const parsed = beliefKey === KIND_KEY ? { ns: "kind", fact: KIND_KEY } : parseFactKey(beliefKey);
        if (!parsed) continue; // an unrecognised key is not a pending anything
        /*
         * A held identification with no text and a total under its DC is a failed rung parked by
         * the cascade before 2026-10 (it now stamps a failure delivered at once). It has nothing to
         * hand over, so it is not a nag. An empty row at or over the DC is a legacy empty-reveal
         * PASS whose knowledge row is still pending — that one stays listed, so the GM can free it
         * with `deliverHeld`.
         */
        if (parsed.ns === "attr" && parsed.fact === MEMBER_FACT && !String(rec.text ?? "").trim()
          && typeof rec.total === "number"
          && rec.total < (describeAttribute(parsed.subject)?.dc ?? Infinity) + concealmentFor(ledger, parsed.subject)) continue;
        const label =
          parsed.ns === "lore"
            ? readLore(readFlag(ledger, MODULE, LORE_FLAG)).find(r => r.id === parsed.fact)?.label ?? parsed.fact
            : ledger.name;
        out.push({
          ns: parsed.ns,
          character: game.actors.get(characterId)?.name ?? characterId,
          characterId,
          subject: ledger.name,
          subjectId: ledger.id,
          beliefKey,
          fact: label,
          factId: parsed.fact,
          tier: rec.tier,
          total: rec.total,
          when: new Date(rec.when).toLocaleString(),
          whenMs: rec.when, // numeric sibling (ties-10)
          text: rec.text
        });
      }
    }
  }
  // ── the attribute plane, which is a setting rather than any document ──
  const attrLedger = readAttrBeliefs(setting(ATTR_BELIEFS_SETTING));
  for (const [key, rec] of Object.entries(attrLedger)) {
    if (!rec || rec.delivered || rec.claim) continue; // a bare claim is a roll in flight, not a pending reveal
    /*
     * `attr:<attrId>:<loreId>:<characterId>`, parsed by the shared grammar.
     *
     * ⚠ This was a `split(":")` with a `length !== 4` guard, and the comment above it claimed a
     * right-to-left parse the code did not do. An authored derived-namespace attribute
     * (`species:human`) produces five segments, so every pending reveal on one was silently
     * dropped from the GM's nag surface — a held reveal that can never be found is a stranded
     * roll, which is the failure the claim protocol exists to prevent.
     */
    const parsed = parseLedgerKey(key);
    if (!parsed || parsed.ns !== "attr") continue;
    const { subject: attrId, fact: loreId, characterId } = parsed;
    const entry = describeAttribute(attrId);
    out.push({
      ns: "attr",
      character: game.actors.get(characterId)?.name ?? characterId,
      characterId,
      subject: entry.title,
      subjectId: null,
      attrId,
      beliefKey: attrFactKey(attrId, loreId),
      fact: rollableLore(attributeLore(attrId)).find(r => r.id === loreId)?.label ?? loreId,
      factId: loreId,
      tier: null,
      total: rec.total,
      when: new Date(rec.when).toLocaleString(),
      whenMs: rec.when, // numeric sibling (ties-10)
      text: rec.text
    });
  }

  return out;
}

/**
 * The release valve (decision 5) — un-spend one fact for one character.
 *
 * Both halves, or it is not a reset: the belief row is the lock, and the `studied` hint is
 * what draws the affordance. Clearing one and not the other leaves either a roll nobody can
 * ask for or an affordance whose click is refused — and the second is worse, because the
 * refusal is a message a plain failure would never produce.
 */
export async function reset(character, subject, loreId = null, attrId = null) {
  if (!game.user?.isGM) return false;
  const fact = factFrom(subject, loreId, attrId);
  if (!character || !fact) return false;

  await putBelief(fact, character.id, null);
  if (studiedOf(character)[fact.axis][fact.lockKey]) {
    await character.update({ [`flags.${MODULE}.${STUDIED_FLAG}.${fact.axis}.-=${fact.lockKey}`]: null });
  }
  /*
   * Nothing already in their notebook is removed — not their notes, and not the grant.
   * **Decision 22**, ruled by Joe after the granted-region rework made revoking possible for
   * the first time: notes and discoveries are two separate things now, so a reset has nothing
   * to protect and nothing to take back. A reset means *roll again*; the re-roll replaces the
   * grant under its own key, so nothing duplicates and nothing stale survives.
   */
  ui.notifications.info(_loc("PENTARYN_TIES.known.study.notify.reset", { character: character.name, kind: fact.name }));
  return true;
}
