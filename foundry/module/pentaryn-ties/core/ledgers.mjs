/**
 * Phase 8 — world knowledge and identification: the knowledge ledger, identification keys and state,
 * the planner (`planStep`), derived attributes, advantage stacking and attribute-lore beliefs.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { MEMBER_FACT, attrIdOf, helpFor, identificationLadder, indexRegistry } from "./attributes.mjs";
import { clampKnownNotes, fromOf, num, numOrNull, passOf, timeOrNull } from "./shared.mjs";
import { clampSources, priorOf, readBeliefs } from "./study.mjs";

/**
 * World knowledge: which attributes a character knows **exist**, and which they have permanently
 * failed to know.
 *
 * A **world setting**, not a flag on the character — a character actor is owned by its player, so
 * a flag there would be player-writable and the lock would be forgeable. `SETTINGS_MODIFY`
 * requires role 4, which is the module's only real integrity boundary.
 *
 * `failed: true` is the permanent lockout: the character can never again *recognise it on sight*.
 * They can still be told (GM grant), which is the whole of Joe's release valve.
 */
export function readKnowledge(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [characterId, attrs] of Object.entries(raw)) {
    if (!characterId || !attrs || typeof attrs !== "object" || Array.isArray(attrs)) continue;
    const kept = {};
    for (const [attrId, rec] of Object.entries(attrs)) {
      if (!attrId || !rec || typeof rec !== "object") continue;
      kept[attrId] = {
        when: Math.max(0, num(rec.when, 0)),
        failed: rec.failed === true,
        /*
         * Written at roll time because it is the stage-1 lock, but not yet the player's to see
         * when the rung it came from is held. Gating and advantage read it as known (the roll
         * happened); the player-facing list hides it until the GM delivers.
         */
        pending: rec.pending === true,
        // how it arrived, for the GM's own reading of the tree — never shown to a player
        via: ["roll", "grant", "carried", "shared"].includes(rec.via) ? rec.via : "roll",
        /*
         * A Share written over a permanent stage-1 FAILURE remembers it, so forgetting the share
         * restores the failure instead of handing back a roll Joe ruled is gone for good. Spread
         * only when set, so every other row keeps its shape.
         */
        ...(rec.via === "shared" && rec.overFailed === true ? { overFailed: true } : {})
      };
    }
    if (Object.keys(kept).length) out[characterId] = kept;
  }
  return out;
}

/** Does this character know this attribute exists? A failed row is knowledge of nothing. */
export const knowsAttribute = (knowledge, characterId, attrId) =>
  readKnowledge(knowledge)[characterId]?.[attrId]?.failed === false;

/** Has this character permanently lost the chance to recognise it on sight? */
export const failedAttribute = (knowledge, characterId, attrId) =>
  readKnowledge(knowledge)[characterId]?.[attrId]?.failed === true;

/**
 * Has this character settled the question of this attribute at all — either way?
 *
 * The stage-1 lock: one roll ever, and a failure counts. This is what stops a player rolling on
 * "what city are they from" once per stranger until the dice cooperate.
 */
export const settledAttribute = (knowledge, characterId, attrId) =>
  !!readKnowledge(knowledge)[characterId]?.[attrId];

/**
 * Has this character already settled whether **this creature** carries **this attribute**?
 *
 * Identifications ride the shipped `beliefs` flag on the SUBJECT actor, under the reserved fact
 * `attr:<attrId>:#id`. Same plane and same unforgeability as every other belief row: the subject
 * is a document the roller does not own.
 */
export const identifiedKey = attrId => `attr:${String(attrId ?? "")}:${MEMBER_FACT}`;

/**
 * The GRANT key a failed identification's authored failure text (`entry.miss`) is filed under —
 * Joe, 2026-10-08: a written failure line is what the player takes away; an empty one is nothing.
 *
 * ⚠ Not `identifiedKey`. That key's grant renders only where the attribute is identified (the
 * secrecy filter) and is titled with the attribute — on a failure both would announce the very
 * membership they failed to spot. This one is a `lore:` key on the SUBJECT, so it files on that
 * creature's page like a tell, titled with the creature's name. The ident BELIEF row is untouched
 * (it stays `text: ""` on a failure, which every GM ledger reads as "not identified").
 *
 * The attribute id is encoded so the key keeps `parseFactKey`'s grammar (fact = after the LAST
 * colon) and holds no dot (Foundry would expand one into a nested path).
 */
export const IDENT_MISS_FACT_PREFIX = "#idmiss-";
export const identMissKey = (subjectId, attrId) =>
  `lore:${String(subjectId ?? "")}:${IDENT_MISS_FACT_PREFIX}${encodeURIComponent(String(attrId ?? "")).replace(/\./g, "%2E")}`;

export function identifiedState(beliefs, characterId, attrId) {
  return identifiedFrom(readBeliefs(beliefs), characterId, attrId);
}

/** identifiedState over an already-read ledger (`readBeliefs` output) — the planner reads it once. */
function identifiedFrom(ledger, characterId, attrId) {
  const rec = ledger[characterId]?.[identifiedKey(attrId)];
  if (!rec) return { settled: false, carries: false, held: false };
  const passed = !!String(rec.text ?? "").trim();
  /*
   * ⚠ `carries` requires **delivered**, not merely passed.
   *
   * Found by playtesting: a rung that passed but is waiting on the GM's approval was reported as
   * a positive identification, so the secrecy filter showed the player a guild membership the GM
   * had not released yet — the roll's own result, leaked by the surface that exists to hide it.
   * The row's comment claimed this check; the code did not make it.
   *
   * It also makes the cascade's hold behaviour explicit rather than incidental: an undelivered
   * rung reads as "not yet identified", so the planner will not climb past it. Delivery flips
   * this and the re-entrant re-run continues the climb.
   */
  return { settled: true, carries: passed && !!rec.delivered, held: passed && !rec.delivered, record: rec };
}

/**
 * **The cascade planner** — the whole of phase 8's control flow, as a pure function.
 *
 * Given who is looking, what they know, what they have already identified on this creature, and
 * what the creature carries, decide the next thing to do. Returns one of:
 *
 *   `{ done: true }`                    nothing left — every ladder is climbed or blocked
 *   `{ roll: <attrId>, … }`             this rung needs a blind roll, with its help resolved
 *   `{ grant: <attrId>, … }`            this rung is automatic — no roll, just deliver
 *
 * Deliberately returns **one step at a time**. The conduit loops it, which is what makes the
 * cascade re-entrant: after a held rung is released the conduit simply asks again, and the planner
 * — reading the ledgers, which have changed — returns the next rung. No suspended state is stored
 * anywhere, because there is none to store.
 */
export function planStep({
  registry = [],
  carried = [],
  knowledge = {},
  beliefs = {},
  characterId = "",
  rollerCarries = []
} = {}) {
  /*
   * Normalise each input ONCE (ties-20): the registry into an index the ladder walk reuses, the
   * knowledge and belief ledgers into their read form. The helpers below used to re-read all
   * three per rung, and this runs up to 24 times per cascade (and 12 × 24 in the GM's simulation).
   */
  const index = indexRegistry(registry);
  const byId = index.byId;
  const know = readKnowledge(knowledge);
  const ledger = readBeliefs(beliefs);
  const knows = attrId => know[characterId]?.[attrId]?.failed === false; // knowsAttribute
  const failed = attrId => know[characterId]?.[attrId]?.failed === true; // failedAttribute
  const mine = new Set(Array.isArray(rollerCarries) ? rollerCarries : []);
  const subjectHas = new Set(Array.isArray(carried) ? carried : []);

  /*
   * PASS 1 — free knowledge first: the kin-sense bypass.
   *
   * ⚠ This has to be a separate pass over every carried attribute, not a check inside the ladder
   * walk below. The walk returns the first actionable rung it finds, and the ladder is climbed
   * root-first — so an assassin looking at a fellow assassin who is also Ardenhaven-born would be
   * handed a roll for the *city* and never reach the mark under the eye at all. Bypasses cost no
   * dice and can make later rungs moot, so they resolve before anything is rolled.
   */
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret || !mine.has(attrId)) continue;
    if (helpFor(entry, { carried: true }) !== "auto") continue;
    if (identifiedFrom(ledger, characterId, attrId).settled) continue;
    return { grant: attrId, entry, backfill: !knows(attrId), bypass: true };
  }

  // PASS 2 — climb each ladder, root first, and return the first rung that needs resolving
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret) continue; // visible: not a question

    for (const rung of identificationLadder(attrId, index)) {
      // only rungs this creature actually carries are askable — Q1 materialises ancestors, so a
      // carrier of the guild carries the district too, and a gap here means an invalid sheet
      if (!subjectHas.has(rung)) break;
      const already = identifiedFrom(ledger, characterId, rung);
      if (already.settled) {
        // already answered. A negative answer blocks everything beneath it.
        if (!already.carries) break;
        continue;
      }

      const rungEntry = byId.get(rung);
      const iCarry = mine.has(rung);
      const help = helpFor(rungEntry, { carried: iCarry });

      // stage 1: do they know this thing exists at all?
      const knowsIt = knows(rung);
      if (!knowsIt && failed(rung)) break; // permanently unrecognisable
      if (help === "auto") return { grant: rung, entry: rungEntry, backfill: !knowsIt, bypass: false };
      return {
        roll: rung,
        entry: rungEntry,
        // the backfill: a first success proves they knew it all along (Joe's rule)
        backfill: !knowsIt,
        advantage: help === "advantage" && (knowsIt || iCarry)
      };
    }
  }
  return { done: true };
}

/**
 * Derive an actor's attribute ids from plain data — **never stored** (decision 16).
 *
 * That is the whole backfill answer: 115 NPCs arrive populated with nothing to write, a
 * species edit propagates instantly, and "derived vs authored" needs no marker because derived
 * ids carry a namespace and authored ones cannot.
 *
 * Takes a plain description rather than an actor so this file stays free of Foundry; the
 * client half reads the paths in decision 16's verified table and hands them in.
 */
export function deriveAttributes({ type = null, size = null, species = null, background = null, kindId = null } = {}) {
  const out = [];
  const push = (ns, value) => {
    const slug = ns === "kind" ? String(value ?? "").trim() : attrIdOf(value);
    if (slug) out.push(`${ns}:${slug}`);
  };
  push("type", type);
  push("size", size);
  push("species", species);
  push("background", background);
  // the kind pointer is an ACTOR id, not a slug — it is not lowercased or stripped, or it
  // would stop matching the document it names
  if (kindId) push("kind", kindId);
  return [...new Set(out)];
}

/**
 * An actor's effective attribute set: derived ∪ authored, minus suppressed.
 *
 * Suppression applies to **both** — a GM who wants one orc not to count as `type:humanoid`,
 * or one guild link removed without editing the flag, uses the same list either way.
 */
export function attributeIdsFor({ derived = [], authored = [], off = [] } = {}) {
  const suppressed = new Set((Array.isArray(off) ? off : []).map(x => String(x ?? "").trim()).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const id of [...(Array.isArray(derived) ? derived : []), ...(Array.isArray(authored) ? authored : [])]) {
    const clean = typeof id === "string" ? id.trim() : "";
    if (!clean || suppressed.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * `combineAdvantage(adv, dis, rule)` — the last-moment decision, so nothing is stored.
 *
 * **RAW is the default**, and deliberately: the 2024 PHB cancels outright when both are
 * present *regardless of how many sit on each side*, and a module meant to ship defaults to
 * the book rather than to one table's house rule (the same posture decision 13a takes). Joe
 * wants netting — each advantage +1, each disadvantage −1, sign decides — and that is the
 * `advantageStacking` world setting, one flip.
 *
 * The two rules disagree on exactly the interesting case: 2 advantage + 1 disadvantage is
 * `"normal"` under RAW and `"advantage"` under netting.
 */
export function combineAdvantage(adv = 0, dis = 0, rule = "raw") {
  const a = Math.max(0, num(adv, 0));
  const d = Math.max(0, num(dis, 0));
  if (rule === "net") {
    if (a > d) return "advantage";
    if (d > a) return "disadvantage";
    return "normal";
  }
  if (a > 0 && d > 0) return "normal"; // RAW: both present cancels, however many
  if (a > 0) return "advantage";
  if (d > 0) return "disadvantage";
  return "normal";
}

/** The attribute ledger's key — one row per character per attribute fact. */
export const attrFactKey = (attrId, loreId) => `attr:${String(attrId ?? "")}:${String(loreId ?? "")}`;

/**
 * The ledger setting, sanitised. Keyed `<attrFactKey>:<characterId>` —
 * `attr:<attrId>:<loreId>:<characterId>` (split it with `parseLedgerKey`, never `split(":")`) — a flat map rather
 * than a nested one, because a setting is rewritten whole on every write and a flat map keeps
 * that rewrite a single small object.
 */
export function readAttrBeliefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, rec] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim() || !rec || typeof rec !== "object") continue;
    out[key.trim()] = {
      text: clampKnownNotes(rec.text),
      tier: null, // attribute lore is flat pass/fail; a tier here would be a lie
      total: numOrNull(rec.total),
      when: Math.max(0, num(rec.when, 0)),
      delivered: timeOrNull(rec.delivered),
      claim: typeof rec.claim === "string" && rec.claim ? rec.claim : null,
      sources: clampSources(rec.sources),
      ...fromOf(rec),
      ...passOf(rec),
      ...priorOf(rec)
    };
  }
  return out;
}

/**
 * The approval gate's tri-state (disguise decision 8): the thing's own `hold` wins when it is
 * a real boolean; `undefined`/anything else inherits the world's `holdDefault`.
 */
export function holdResolved(itemHold, holdDefault = false) {
  if (itemHold === true) return true;
  if (itemHold === false) return false;
  return holdDefault === true;
}
