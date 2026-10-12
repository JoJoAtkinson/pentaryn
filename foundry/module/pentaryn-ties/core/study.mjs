/**
 * Phase 3 — the study ladder (the kind rungs, tiers, the authored ladder, areas of knowledge) and the
 * two ledgers it writes: `studied` on the player's actor and `beliefs` on the subject.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { isBlankProse } from "./prose.mjs";
import { ATTR_TITLE_MAX, clampKnownNotes, fromOf, num, numOrNull, passOf, str, timeOrNull } from "./shared.mjs";
export { SHARE_FROM_MAX } from "./shared.mjs";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Phase 3 — the study ladder, minus Foundry                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ## Why the whole grader lives here
 *
 * The study roll is **blind**: nobody at the table ever sees the number that graded it, so a
 * grader that is quietly off by one is invisible until a player writes down the wrong
 * folklore and keeps it forever. There is no chat card to check it against and no retry to
 * catch it with — the one-roll lock means the first wrong answer is the only answer. That is
 * the strongest argument for fixtures in this whole module, and it is why every decision the
 * conduit makes about *content* is a function in this file, called by `study.mjs` with the
 * world handed in.
 *
 * The same one rule as everything above: **nothing here throws.**
 */

export const STUDIED_FLAG = "studied";
export const BELIEFS_FLAG = "beliefs";
export const KIND_OF_FLAG = "kindOf";
export const STUDY_TIERS_FLAG = "studyTiers";
export const STUDY_HOLD_FLAG = "studyHold";

/**
 * How hard this particular creature is to place — **one knob, three behaviours**.
 *
 *   a number   shifts the whole ladder: `+5` → 20/25/30, `-5` → 10/15/20
 *   `"auto"`   free. Inspecting is enough; no roll, no lock, no way to fail
 *   unset      the default ladder, 15/20/25
 *
 * Deliberately not a rarity vocabulary and deliberately not derived from CR. A band table is
 * something to maintain and argue with, and CR measures **danger, not obscurity** — a dragon is
 * CR 17 and famous, an obscure fey is CR ¼ and unheard of. A GM who wants one monster harder
 * nudges that monster.
 *
 * ⚠ `"auto"` is a genuinely different path, not a DC of zero. Nobody permanently fails to know
 * what a chicken is, so a free kind must never take a lock or record a failure — a DC of 0 would
 * still spend the one attempt and could still, absurdly, be failed on a negative total.
 */
export const STUDY_OFFSET_FLAG = "studyOffset";

/** How far the ladder may be nudged either way, so a typo cannot make a kind unknowable. */
export const STUDY_OFFSET_MIN = -15;
export const STUDY_OFFSET_MAX = 25;

/** `"auto"`, or a clamped number. Anything else means "no opinion" and reads as 0. */
export function studyOffsetOf(raw) {
  if (raw === "auto") return "auto";
  const n = num(raw, 0);
  return Math.max(STUDY_OFFSET_MIN, Math.min(STUDY_OFFSET_MAX, n));
}

/**
 * The rungs for one kind, shifted. `[25,20,15,0]` at offset 0.
 * @deprecated Unused (ties-42); kept one release because the known-core.mjs barrel has always exported it.
 */
export const rungsFor = offset =>
  STUDY_RUNGS.map(r => (r === 0 ? 0 : r + (typeof offset === "number" ? offset : 0)));

/** The rungs, highest first — the order `tierOf` walks and the order an author reads. */
export const STUDY_RUNGS = [25, 20, 15, 0];

/**
 * The base DC handed to dnd5e as `config.target`. It grades nothing above 15 — the 20 and 25
 * rungs are read off the total on the GM's client — but it is what makes `roll.isSuccess`
 * mean "recognised it at all" on the GM's own card.
 */
export const STUDY_BASE_DC = 15;

/** An authored tier message is a paragraph, not a page — and it rides on the kind actor. */
export const TIER_TEXT_MAX = 4000;

/** The one key the kind axis files itself under in `studied` and in a belief record. */
export const KIND_KEY = "kind";

/**
 * What a total buys. `null` in, `null` out — and that is the whole point of this function.
 *
 * ⚠ A cancelled dialog returns no roll, and **no roll is not a failure**. If a cancel ever
 * grades as tier 0 the player spends their one attempt on a mis-click and is handed the
 * sub-15 answer for a roll that never happened. Every caller must treat `null` as "nothing
 * occurred": no lock, no belief, no stub card.
 */
export function tierOf(total, offset = 0) {
  if (total === null || total === undefined || total === "") return null;
  const n = Number(total);
  if (!Number.isFinite(n)) return null;
  /*
   * The offset shifts what each rung COSTS, never what a rung is called. A `+5` kind needs a 20
   * to reach the rung still known as 15 — so authored tier text, belief records and every
   * fixture keep meaning the same thing whatever a GM nudges. Renaming the rungs instead would
   * have made a stored `tier: 20` ambiguous the moment an offset changed.
   */
  const shift = typeof offset === "number" ? offset : 0;
  for (const rung of STUDY_RUNGS) if (rung > 0 && n >= rung + shift) return rung;
  return 0;
}

/**
 * The skill for a kind, off the PHB's **Areas of Knowledge** table — read out of the owned
 * Player's Handbook (`Appendix C: Rules Glossary → Study`) rather than remembered:
 *
 *   Arcana    Aberrations, Constructs, Elementals, Fey, Monstrosities
 *   History   Giants, Humanoids
 *   Nature    Beasts, Dragons, Oozes, Plants
 *   Religion  Celestials, Fiends, Undead
 *
 * That is all fourteen dnd5e creature types with none left over, so the only fallback case is
 * an actor with **no** creature type — 23 of this world's 136 actors — and it takes History,
 * for the same reason `defaultCategory` files them as Sentient: a name with nothing behind it
 * is more often a person than a wolf, and people are History's column.
 *
 * Investigation is in the book's table and deliberately not here: its areas are "traps,
 * ciphers, riddles, and gadgetry" — no creatures at all.
 */
const AREAS_OF_KNOWLEDGE = {
  arc: ["aberration", "construct", "elemental", "fey", "monstrosity"],
  his: ["giant", "humanoid"],
  nat: ["beast", "dragon", "ooze", "plant"],
  rel: ["celestial", "fiend", "undead"]
};

export function studySkill(creatureType) {
  const type = typeof creatureType === "string" ? creatureType.trim().toLowerCase() : "";
  if (!type) return "his";
  for (const [skill, types] of Object.entries(AREAS_OF_KNOWLEDGE)) if (types.includes(type)) return skill;
  return "his"; // a homebrew creature type nobody's table has heard of is still somebody
}

/**
 * The kind of an actor: an optional GM-set pointer, else itself (decision 4).
 *
 * `exists(id)` is injected — on a client it is `game.actors.has`. A **dangling** pointer
 * resolves to self rather than to nothing, which is the load-bearing case: deleting the world
 * "Goblin" actor must degrade every pointer at it into "this creature is its own kind", not
 * into a study roll that silently targets a document that is not there.
 *
 * A pointer at *itself* is also self — writing one is harmless, and a cycle check would be
 * machinery for a state one dropdown cannot produce.
 */
export function resolveKindId(actorId, pointer, exists = () => false) {
  const self = typeof actorId === "string" && actorId.trim() ? actorId.trim() : null;
  if (!self) return null;
  const aim = typeof pointer === "string" ? pointer.trim() : "";
  if (!aim || aim === self) return self;
  let there = false;
  try {
    there = exists(aim) === true;
  } catch {
    there = false;
  }
  return there ? aim : self;
}

/**
 * Authored tier messages, hardened. Sparse by design — a kind with only a 25 written is the
 * common authoring shape, and every other rung falls through to derived prose.
 *
 * A `min` that is not one of the four rungs is dropped rather than snapped to the nearest:
 * an author who typed 18 meant something, and quietly filing it as 15 would deliver text at a
 * threshold they did not choose. First write of a rung wins, as everywhere else in this file.
 */
export function readStudyTiers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const min = num(e.min, NaN);
    if (!STUDY_RUNGS.includes(min) || seen.has(min)) continue;
    const text = str(e.text, TIER_TEXT_MAX).trim();
    if (isBlankProse(text)) continue; // an empty rung is not authored; it is a rung waiting to be written
    seen.add(min);
    out.push({ min, text });
  }
  out.sort((a, b) => b.min - a.min);
  return out;
}

/**
 * The authored message for **exactly** this rung, or "".
 *
 * ⚠ Exact, never "the highest rung at or below". Falling down the ladder would hand a 25 the
 * 15's text whenever only the 15 was written — and under decision 5 the 15 may be
 * *deliberately false*, so the fall-through would silently pay a triumph with a lie. Missing
 * rungs fall back to **derived** prose, which is always true because it is read off the sheet.
 */
export function authoredTier(tiers, tier) {
  /*
   * **Rung 0 is the failure case; 15 and up are the truth ladder. They do not mix.**
   *
   * Joe's framing, and it is the one that makes the whole thing legible: *"I need to put in a lie
   * as a failure — it IS a failure case. You didn't make the lowest DC, so I give you the failure.
   * If there is no failure text you just get a generic you never heard of this beast. This makes
   * it clear even to me what is false and what is flavour world-building true. I can have both on
   * a monster."*
   *
   * So the low rung is **false or nothing**, the high rungs are **true**, and a GM reading their
   * own kind actor can tell which is which at a glance.
   *
   * ⚠ **2026-10: an unauthored failure hands over nothing.** A failed roll with no failure text
   * written hands over nothing — no card, no title — and the lock is still written
   * (`context/plans/attribute-silent-failure.md`). A lore row's `miss` and an attribute's `miss`
   * are this rung's siblings: written, they are delivered on a failure; empty, nothing is
   * (2026-10-08 — the 2026-10-07 "GM note, never delivered" rule was reversed). The generic *"Nothing about it means anything to you"* card an
   * unauthored rung 0 used to fall back to is gone too: an unauthored rung 0 delivers nothing.
   * An authored rung 0 survives because it is the one deliberate, un-nagged act — the GM chose
   * to write a lie into the slot labelled as the miss.
   *
   * Two rules fall out, and the second is the one this got wrong:
   *
   *  · a **success rung carries upward** until the next authored success replaces it, so flavour
   *    written at 15 is not lost when someone rolls 25
   *  · **rung 0 never carries.** The failure line must not surface on a success — that would hand
   *    a player the lie *as the reward for rolling well*, which is the precise inversion of what
   *    it is for. An earlier cut of this function did exactly that.
   */
  const list = Array.isArray(tiers) ? tiers : [];
  const rungOf = x => Number(x?.min);

  // the miss: isolated, and only ever reached by a roll that failed
  if (tier <= 0) return list.find(x => rungOf(x) === 0)?.text ?? "";

  // the truth ladder: the highest authored SUCCESS rung at or below this roll
  const reached = list.filter(x => Number.isFinite(rungOf(x)) && rungOf(x) > 0 && rungOf(x) <= tier);
  if (!reached.length) return "";
  return reached.reduce((best, x) => (rungOf(x) > rungOf(best) ? x : best)).text ?? "";
}
/** Does this kind carry anything a roll could buy? "No content, no icon" (decision 5). */
export function kindHasContent({ biography = "", tiers = [], attacks = [] } = {}) {
  if (typeof biography === "string" && biography.trim()) return true;
  if (Array.isArray(tiers) && tiers.length) return true;
  return Array.isArray(attacks) && attacks.length > 0;
}

/* ── the two ledgers ──────────────────────────────────────────────────────── */

/**
 * `studied`, on the **player's own** actor: `when` and nothing else.
 *
 * ⚠ This is a **UI hint, not the lock** (build-and-validate §5). The player owns this actor,
 * so one `unsetFlag` in their own devtools re-arms the affordance — which is why the GM
 * handler's refusal reads the belief ledger on the studied actor instead, where no player can
 * write. Storing a total or a tier here would also park the blind number one glance deep on
 * the sheet of the person it was hidden from.
 */
export function readStudied(raw) {
  const out = { kind: {}, lore: {} };
  if (!raw || typeof raw !== "object") return out;
  for (const axis of ["kind", "lore"]) {
    const src = raw[axis];
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    for (const [key, val] of Object.entries(src)) {
      if (!key || typeof key !== "string") continue;
      const when = Math.max(0, num(val?.when, 0));
      out[axis][key] = { when };
    }
  }
  return out;
}

/**
 * `beliefs`, on the **studied** actor: what each character was actually told.
 *
 * `delivered` unset is the pending state of the approval gate (disguise decision 8) — there is
 * no queue anywhere, because the row of record *is* the queue. `text` is the fully computed
 * payload, parked here at roll time so a held reveal cannot be lost by a reload, a pop, or a
 * GM who closes the prompt.
 */
/**
 * Why the roll had the advantage state it had (decision 19) — GM-only, on the ledger row.
 *
 * Recorded rather than recomputed: the registry can be edited after a roll, and a GM asking
 * "why was that at advantage" three scenes later must get the answer that was true *then*.
 */
export function clampSources(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const shared = (Array.isArray(raw.shared) ? raw.shared : [])
    .map(x => str(x, ATTR_TITLE_MAX).trim())
    .filter(Boolean)
    .slice(0, 20);
  return {
    adv: Math.max(0, num(raw.adv, 0)),
    dis: Math.max(0, num(raw.dis, 0)),
    shared,
    declared: ["advantage", "disadvantage", "normal"].includes(raw.declared) ? raw.declared : "normal",
    rule: raw.rule === "net" ? "net" : "raw",
    resolved: ["advantage", "disadvantage", "normal"].includes(raw.resolved) ? raw.resolved : "normal"
  };
}

/**
 * What a **share** overwrote, so forgetting it gives that back instead of deleting the row.
 *
 * A share laid over a failed roll, or over a kind study held below the top tier, replaces a row
 * the character EARNED (or spent). Forgetting it by deleting the row would hand back a free
 * re-roll, or wipe the tier they rolled — the one-attempt rule `overFailed` protects for stage 1.
 * So the share keeps the row it replaced here, and `forgetFact` writes it back, lock and all.
 *
 * Kept only on a share row (`from` present), one level deep (a prior never carries its own
 * prior), and only when it was an answer, not a claim in flight.
 */
export function priorOf(rec) {
  if (!fromOf(rec).from) return {};
  const p = rec?.prior;
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  const text = clampKnownNotes(p.text);
  const total = numOrNull(p.total);
  const delivered = timeOrNull(p.delivered);
  // typed first: `Number(null)` is 0, a real rung, and would turn "no tier" into a tier-0 failure
  const tier = typeof p.tier === "number" && STUDY_RUNGS.includes(num(p.tier, NaN)) ? num(p.tier, 0) : null;
  if (!text.trim() && total === null && !delivered && tier === null) return {};
  return { prior: { text, tier, total, when: Math.max(0, num(p.when, 0)), delivered, ...fromOf(p), ...passOf(p) } };
}

export function readBeliefs(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [characterId, facts] of Object.entries(raw)) {
    if (!characterId || !facts || typeof facts !== "object" || Array.isArray(facts)) continue;
    const kept = {};
    for (const [key, rec] of Object.entries(facts)) {
      if (!key || !rec || typeof rec !== "object") continue;
      const tier = STUDY_RUNGS.includes(num(rec.tier, NaN)) ? num(rec.tier, 0) : null;
      kept[key] = {
        text: clampKnownNotes(rec.text),
        tier,
        total: numOrNull(rec.total),
        when: Math.max(0, num(rec.when, 0)),
        // absent, not zero: `delivered: 0` and "never delivered" must not be the same value
        delivered: timeOrNull(rec.delivered),
        sources: clampSources(rec.sources),
        // who shared it — present only on a GM share (see `shareStatus`), absent on every roll
        ...fromOf(rec),
        ...passOf(rec),
        ...priorOf(rec)
      };
    }
    if (Object.keys(kept).length) out[characterId] = kept;
  }
  return out;
}

/**
 * May this character still roll this fact? **The belief ledger is the lock of record.**
 *
 * `studied` is consulted only to answer "has this client got a record too" for callers that
 * want it; it can never *re-arm* a roll the ledger says was spent. Pass it or don't — the
 * answer for a spent belief is `false` either way, and that is the fixture that matters.
 */
export function mayStudy({ beliefs = {}, studied = { kind: {}, lore: {} }, characterId = "", key = KIND_KEY } = {}) {
  if (!characterId || !key) return false;
  if (beliefs?.[characterId]?.[key]) return false; // spent, server-side, and unforgeable
  const axis = key === KIND_KEY ? "kind" : "lore";
  // A `studied` record with no belief behind it is a leftover — a GM reset that cleared the
  // ledger, or a hand-written flag. It must NOT block: the ledger is the authority in both
  // directions, or a reset would only half-undo.
  void studied?.[axis];
  return true;
}
