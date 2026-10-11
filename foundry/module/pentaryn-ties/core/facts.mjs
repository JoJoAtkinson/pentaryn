/**
 * The GM's "who knows" tags (`shareStatus`), fact keys and the fact order the inspect window and
 * the Look window share.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { identificationLadder, readRegistry } from "./attributes.mjs";
import { attrFactKey, identifiedKey } from "./ledgers.mjs";
import { loreFactKey, rollableLore } from "./lore.mjs";
import { rolledMiss } from "./rules.mjs";

/* ── the GM's "who knows" tags — the inspect window's player view ─────────── */

/** Every value `shareStatus` can return, in the order the GM's chips explain them. */
export const SHARE_STATUSES = ["passed", "told", "held", "failed", "locked", "none"];

/**
 * Where one character stands on one fact — the GM's coaching tag. Pure, and fixtured.
 *
 *   `belief`          the ledger row for this character and fact (`readBeliefs`/`readAttrBeliefs`
 *                     shape), or null
 *   `granted`         is the fact's key in their `granted` map (a "Mark as learned" grant, or a
 *                     legacy grant with no ledger row behind it)
 *   `failedKnowledge` identification only: a permanent stage-1 failure on the attribute
 *   `kind`            the row is a kind study: a tier under 15 is the empty answer
 *   `dc`              flat lore rows only: the row's DC, used to grade a legacy row that has a
 *                     `total` but no stored `pass` (a pre-2026-10 miss with authored miss text
 *                     has text)
 *   `ident`           the row is an identification: a no-roll positive WITHOUT a `from` is the
 *                     planner's own `auto` grant (help scale or kin-sense), which the character
 *                     worked out on sight — that is a pass, not a GM tell
 *
 * The ledger's convention for "they did not roll; I told them" is `total: null` on a delivered
 * row (`grantKind` shipped it). A share also stamps `from`, which is what separates it from an
 * `auto` identification, the one other writer of a no-roll positive.
 *
 * A row with no text, no total and no delivery is a claim (a roll in flight), not an answer.
 */
export function shareStatus({
  belief = null, granted = false, failedKnowledge = false, kind = false, ident = false, dc = null
} = {}) {
  if (belief && typeof belief === "object") {
    const text = typeof belief.text === "string" ? belief.text.trim() : "";
    const total = typeof belief.total === "number" && Number.isFinite(belief.total) ? belief.total : null;
    const delivered = !!belief.delivered;
    const inFlight = !text && total === null && !delivered;
    if (!inFlight) {
      /*
       * A failed flat roll WITH authored miss text stored the miss line as its text before
       * 2026-10 (it stores "" now), so text alone reads those legacy rows as a pass. The roll's own verdict (`pass`) decides when it was recorded; a row
       * from before that field derives it from its total against the row's DC. A share (`from`)
       * is never a failure, whatever it replaced.
       */
      // `total` is finite-or-null here, so a non-finite stored total grades nothing (as it always did)
      const missed = !kind && !ident && rolledMiss({ ...belief, total }, dc);
      const empty = kind ? !(Number(belief.tier) >= 15) : !text || missed;
      if (empty) return "failed";
      if (!delivered) return "held";
      if (total === null) return ident && !belief.from ? "passed" : "told";
      return "passed";
    }
  }
  if (granted) return "told";
  if (failedKnowledge) return "locked";
  return "none";
}

/* ── one subject's facts, in ladder order — the player view and the Look window ── */

/**
 * The grant/belief key one fact lives under, from the inspect window's fact descriptor:
 *
 *   `{ ns: "ident", attrId }`              → `attr:<attrId>:#id`
 *   `{ ns: "attr",  attrId, factId }`      → `attr:<attrId>:<factId>`
 *   `{ ns: "lore",  subjectId, factId }`   → `lore:<subjectId>:<factId>`
 *   `{ ns: "kind" }` + `kindId`            → `kind:<kindId>`
 *
 * ⚠ **One home for the four grammars.** `study.mjs`'s `shareKeyOf` (what a Share writes) and
 * `factOrder` below (what the player's Look window reads) used to be two hand-built copies of the
 * same switch. A drift between them is silent in the worst direction: a share that lands under a
 * key the window does not ask for is a card the player was told about and can never see. So both
 * call this, and the fixtures pin the four literal strings.
 *
 * The kind id arrives as an argument because resolving `kindOf` needs `game.actors`; this file
 * may not touch a Foundry global. `null` for anything it cannot name — the caller refuses.
 */
export function factKeyOf(spec, kindId = null) {
  if (spec?.ns === "ident") return identifiedKey(spec.attrId);
  if (spec?.ns === "attr") return attrFactKey(spec.attrId, spec.factId);
  if (spec?.ns === "lore") return loreFactKey(spec.subjectId, spec.factId);
  if (spec?.ns === "kind") return `kind:${kindId ?? ""}`;
  return null;
}

/**
 * **Which facts one subject could hand a player, in what order, under what key** — and nothing
 * else. Pure, fixtured.
 *
 *   `{ group:"ident", ns:"ident", attrId, parentId, key }`     every SECRET rung the subject
 *        carries, each ladder root → leaf (`identificationLadder` filtered to `carried`), ladders
 *        in `carried` order, no duplicates. `parentId` is the rung above it in the first ladder
 *        that reached it (null at a root).
 *   `{ group:"attr", ns:"attr", attrId, factId, secret, key }`   every rollable lore row of every
 *        carried attribute, `carried` order then row order, secret or not
 *   `{ group:"lore", ns:"lore", factId, key }`                   the subject's own rollable rows
 *   `{ group:"kind", ns:"kind", kindId, key }`                   exactly one, last; omitted only
 *        when there is no `kindId` (whether the kind has anything to study is the caller's call)
 *
 * ⚠ **Ids and keys only, by design.** Never `reveal`, `miss`, `text`, `dc`, `skill` or `title`.
 * Two consumers share this list and they are allowed to see very different things: the GM's
 * player view (`preview.mjs`) draws the authored words under every key, and the player's Look
 * window (`look.mjs`) may draw ONLY the `granted` record a key points at. If the ordering helper
 * carried the authored text, the player surface would be one careless `fact.text` away from
 * printing a rung they failed. Each consumer fetches what it is allowed to see.
 */
export function factOrder({ subjectId = "", kindId = null, carried = [], registry = [], lore = [] } = {}) {
  const reg = readRegistry(registry);
  const byId = new Map(reg.map(e => [e.id, e]));
  const have = Array.isArray(carried) ? carried.filter(id => typeof id === "string" && id) : [];
  const out = [];

  // identification rungs: root → leaf, every secret rung this subject actually carries
  const seen = new Set();
  for (const id of have) {
    if (!byId.get(id)?.secret) continue;
    const ladder = identificationLadder(id, reg).filter(r => have.includes(r));
    ladder.forEach((r, i) => {
      if (seen.has(r)) return;
      seen.add(r);
      out.push({ group: "ident", ns: "ident", attrId: r, parentId: ladder[i - 1] ?? null, key: factKeyOf({ ns: "ident", attrId: r }) });
    });
  }

  // attribute lore: carried order, then row order — secret or not (the GM's view notes which)
  for (const id of have) {
    const entry = byId.get(id);
    for (const row of rollableLore(entry?.lore)) {
      out.push({ group: "attr", ns: "attr", attrId: id, factId: row.id, secret: !!entry?.secret, key: factKeyOf({ ns: "attr", attrId: id, factId: row.id }) });
    }
  }

  // the subject's own rows
  for (const row of rollableLore(lore)) {
    out.push({ group: "lore", ns: "lore", factId: row.id, key: factKeyOf({ ns: "lore", subjectId, factId: row.id }) });
  }

  if (kindId) out.push({ group: "kind", ns: "kind", kindId, key: factKeyOf({ ns: "kind" }, kindId) });
  return out;
}
