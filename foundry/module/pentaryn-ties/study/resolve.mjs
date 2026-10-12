/**
 * Resolution: which actor a kind lives on, the fact seam (`resolveFact`, decision 21 rule 4), the
 * ledgers' readers, the world settings the conduit reads, and the study state a sheet draws.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { attributeLore, describeAttribute } from "../attributes.mjs";
import { MODULE } from "../ties-core.mjs";
import {
  attrFactKey,
  BELIEFS_FLAG,
  holdResolved,
  KIND_KEY,
  KIND_OF_FLAG,
  kindHasContent,
  LORE_FLAG,
  loreFactKey,
  loreOutcome,
  readBeliefs,
  readStudied,
  readStudyTiers,
  REGISTRY_SETTING,
  resolveKindId,
  rollableLore,
  STUDIED_FLAG,
  STUDY_BASE_DC,
  STUDY_HOLD_FLAG,
  STUDY_OFFSET_FLAG,
  STUDY_TIERS_FLAG,
  studyOffsetOf,
  studySkill,
  tierOf
} from "../known-core.mjs";
import { CONCEAL_FLAG, concealFor } from "../core/rules.mjs";
import { attackItems, composeStudyPayload } from "./compose.mjs";
import { readFlag } from "../lib/flags.mjs";
import { setting } from "../settings.mjs";

/* -------------------------------------------- */
/*  Resolution                                  */
/* -------------------------------------------- */

/** The kind actor behind any actor: the GM-set pointer, else itself (decision 4). */
export function kindActorOf(actor) {
  if (!actor) return null;
  const id = resolveKindId(actor.id, readFlag(actor, MODULE, KIND_OF_FLAG), x => !!game.actors?.get(x));
  return game.actors?.get(id) ?? actor;
}

/* -------------------------------------------- */
/*  The fact seam — decision 21, rule 4         */
/* -------------------------------------------- */

/**
 * "What is being studied?", answered in exactly one place.
 *
 * Everything downstream — reach, the lock, the belief row, the grant key, the DC, the skill,
 * how a total becomes prose — reads off this descriptor and never asks what *kind* of thing
 * it is. Today two namespaces answer: `kind:` (the graded ladder, phase 3) and `lore:` (flat
 * pass/fail on an individual, phase 4). The attribute phase adds a third branch here and
 * touches nothing else in the conduit; the disguise plan's `mask:` is the fourth.
 *
 * That is the whole of rule 4, and it is worth the indirection for one reason: the conduit is
 * the security boundary. Every branch that re-implements "which ledger, whose reach, which
 * lock" is a branch that can get one of the three subtly wrong on a path nobody re-audits.
 *
 * The seam is not airtight: `fact.ns` is still tested downstream — apply.mjs (`readBelief`,
 * `putBelief`, `applyPlayerWrites`), claim.mjs (`claimFact`, `releaseFact`), gate.mjs
 * (`promptDeliver`, `deliverFact`, `rowMissed`, and the parsed-key test in `pending`), share.mjs and
 * authoring.mjs's `beliefs` — so a new namespace must visit those too.
 *
 * Returns `null` for anything it cannot fully resolve. A caller that gets `null` must refuse —
 * never fall back to a default subject, because the default would be the wrong document to
 * check reach against.
 */
export function resolveFact(spec) {
  const ns = spec?.ns;
  const subject = game.actors?.get(spec?.subjectId);
  if (!subject) return null;

  if (ns === "kind") {
    const kind = kindActorOf(subject);
    if (!kind) return null;
    const { skill, label } = studySkillFor(kind);
    return {
      ns: "kind",
      axis: "kind",
      subject, // what the player pointed at — the reach test's document
      ledger: kind, // where the belief row lives: the kind, which may not be the subject
      lockKey: kind.id,
      beliefKey: KIND_KEY, // shipped in phase 3 as the bare "kind"; left alone, see below
      factKey: `kind:${kind.id}`,
      name: kind.name,
      img: kind.img ?? null,
      skill,
      skillLabel: label,
      /*
       * The kind's own difficulty (Joe's one knob). A number shifts the whole ladder; `"auto"`
       * means common knowledge — inspecting is enough and no dice are thrown at all.
       */
      offset: studyOffsetOf(readFlag(kind, MODULE, STUDY_OFFSET_FLAG)),
      dc: STUDY_BASE_DC + (typeof studyOffsetOf(readFlag(kind, MODULE, STUDY_OFFSET_FLAG)) === "number"
        ? studyOffsetOf(readFlag(kind, MODULE, STUDY_OFFSET_FLAG)) : 0),
      hold: studyHoldFor(kind),
      /** Grade → prose. `null` means no roll happened and nothing may be spent. */
      grade: async total => {
        const off = studyOffsetOf(readFlag(kind, MODULE, STUDY_OFFSET_FLAG));
        /*
         * `"auto"` hands over the top rung without a roll. Not a DC of zero: a zero would still
         * spend the one attempt and could still be *failed* on a negative total, and nobody
         * permanently fails to recognise a chicken.
         */
        if (off === "auto") {
          const text = await composeStudyPayload(kind, 25, label);
          return { text, silent: !text, tier: 25, pass: true };
        }
        const tier = tierOf(total, off);
        if (tier === null) return null;
        /*
         * A failure (tier 0) composes to "" unless the GM authored rung 0, so it is `silent`: the
         * lock is written and the stub posts, and nothing lands in the notebook (2026-10).
         */
        const text = await composeStudyPayload(kind, tier, label);
        return { text, silent: !text, tier, pass: tier >= 15 };
      }
    };
  }

  if (ns === "lore") {
    // `rollableLore`, not `readLore`: a draft row is stored state, never a rollable fact. A
    // row deleted or blanked mid-gesture stops resolving here, and the caller refuses.
    const row = rollableLore(readFlag(subject, MODULE, LORE_FLAG)).find(r => r.id === spec?.factId);
    if (!row) return null;
    const label = CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill;
    const factKey = loreFactKey(subject.id, row.id);
    return {
      ns: "lore",
      axis: "lore",
      subject,
      ledger: subject, // an individual's facts are recorded on the individual
      lockKey: factKey,
      /*
       * The belief key is the FULL namespaced key, per rule 1 — even though it already sits
       * on the subject's own document, where the actor id is redundant. It costs a few bytes
       * and it means every ledger in the module is keyed the same way, so the attribute phase
       * can file `attr:` rows beside these without a collision or a migration. `kind:` keeps
       * the bare "kind" it shipped with, because that data is live and renaming it would be
       * exactly the migration rule 1 exists to prevent.
       */
      beliefKey: factKey,
      factKey,
      name: row.label,
      img: subject.img ?? null,
      skill: row.skill,
      skillLabel: label,
      dc: row.dc,
      hold: holdResolved(row.hold, holdDefault()),
      row,
      grade: async total => {
        const out = loreOutcome(row, total);
        if (!out) return null;
        return { text: out.text, silent: out.silent, tier: null, pass: out.pass };
      }
    };
  }

  if (ns === "attr") {
    /*
     * The third branch, and the one rule 4 was written for. Everything structural differs from
     * the other two — the ledger is a world SETTING, not a document; the "subject" is a
     * registry entry, not an actor — and yet nothing downstream changes, because downstream
     * only ever reads this descriptor.
     *
     * `subject` stays the actor the player was looking at. It has to: reach is "can this
     * player see the creature they are asking about", and an attribute has no tokens. Studying
     * the guild through a guildsman standing in front of you is the gesture.
     */
    const attrId = String(spec?.attrId ?? "").trim();
    const row = rollableLore(attributeLore(attrId)).find(r => r.id === spec?.factId);
    if (!row) return null;
    const entry = describeAttribute(attrId);
    const label = CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill;
    const factKey = attrFactKey(attrId, row.id);
    return {
      ns: "attr",
      axis: "lore", // it locks in the same axis as a lore row: `studied.lore[factKey]`
      subject,
      ledger: null, // ⚠ a SETTING, not a document — see `putBelief`'s setting branch (apply.mjs)
      attrId,
      lockKey: factKey,
      beliefKey: factKey,
      factKey,
      name: `${entry.title} — ${row.label}`,
      img: entry.icon,
      // provenance is the ATTRIBUTE, not the creature: the whole point is that this fact came
      // from the guild, and reading it under one guildsman's page must say so
      source: entry.title,
      skill: row.skill,
      skillLabel: label,
      dc: row.dc,
      hold: holdResolved(row.hold, holdDefault()),
      row,
      grade: async total => {
        const out = loreOutcome(row, total);
        if (!out) return null;
        return { text: out.text, silent: out.silent, tier: null, pass: out.pass };
      }
    };
  }

  return null;
}

export const studiedOf = actor => readStudied(readFlag(actor, MODULE, STUDIED_FLAG));
export const beliefsOf = actor => readBeliefs(readFlag(actor, MODULE, BELIEFS_FLAG));
/** Concealment: raises the DC without ever appearing in the printed one. */
export const concealmentFor = (subject, attrId) => concealFor(readFlag(subject, MODULE, CONCEAL_FLAG), attrId);
export const studyTiersOf = actor => readStudyTiers(readFlag(actor, MODULE, STUDY_TIERS_FLAG));

/** The registry, read defensively — a setting can be unregistered when a hook fires early. */
export function reg() {
  return setting(REGISTRY_SETTING) ?? [];
}

/**
 * RAW or netting (decision 19). **Default RAW** — a module meant to ship defaults to the 2024
 * PHB, and Joe's netting is the one flip his table makes.
 */
export function stackingRule() {
  return setting("advantageStacking") === "net" ? "net" : "raw";
}

/** The world's fallback for the approval gate, read defensively — settings can be unborn. */
export function holdDefault() {
  return setting("holdDefault") === true;
}

export const studyHoldFor = kind => holdResolved(readFlag(kind, MODULE, STUDY_HOLD_FLAG), holdDefault());

/** Which skill this kind is studied with, and its localized name for the provenance header. */
export function studySkillFor(kind) {
  const skill = studySkill(kind?.system?.details?.type?.value ?? null);
  return { skill, label: CONFIG.DND5E?.skills?.[skill]?.label ?? skill };
}

/**
 * Everything the row needs to decide whether to draw the kind affordance — and the whole of
 * "no content, no icon" (decision 5).
 *
 * ⚠ `spent` reads the **player's own** `studied` flag, which is a UI hint and not the lock:
 * the GM handler refuses off the belief ledger, which sits on an actor no player can write.
 * That split is deliberate — see `mayStudy` in `known-core.mjs`.
 */
export function studyStateFor(character, subject) {
  const kind = kindActorOf(subject);
  if (!kind) return { available: false };
  const spent = !!studiedOf(character).kind[kind.id];
  const content = kindHasContent({
    biography: kind.system?.details?.biography?.value ?? "",
    tiers: studyTiersOf(kind),
    attacks: attackItems(kind)
  });
  const { skill, label } = studySkillFor(kind);
  return {
    kind,
    kindId: kind.id,
    // the cross-reference line decision 7 promises on an individual's row: "Kind: Goblin"
    isOwnKind: kind.id === subject.id,
    spent,
    content,
    skill,
    skillLabel: label,
    gmOnline: !!game.users?.activeGM,
    available: content && !spent
  };
}
