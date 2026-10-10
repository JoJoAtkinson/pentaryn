/**
 * One subject's facts, gathered from the live client — the thin Foundry half of `factOrder`.
 *
 * `known-core.mjs`'s `factOrder` decides **which facts a subject could hand a player, in what
 * order, under what key**, and is fixtured in bare node. It cannot read a world: the registry is
 * a setting, the carried list walks derived attributes and the `kindOf` pointer, the lore rows are
 * a flag. This file reads those four things and nothing more, so the two surfaces that draw a
 * subject's facts agree about the list by construction:
 *
 *   - the GM's inspect window, Player view (`preview.mjs`) — every fact, authored words, switches
 *   - the player's Look window (`look.mjs`) — only the facts already in their `granted` map
 *
 * ⚠ **Ids and keys only.** Nothing here returns authored hit or miss prose, a row's wording, a DC, a skill or a
 * tier, and nothing here reads a ledger. The Look window imports this file; keeping it blind to
 * outcomes is what lets that window be identical for a success, a failure and a held rung.
 */

import { MODULE } from "./ties-api.mjs";
import { attributeIdsOf, registry } from "./attributes.mjs";
import { kindActorOf } from "./study.mjs";
import { factOrder, LORE_FLAG } from "./known-core.mjs";

const flagOf = (doc, key) => {
  try { return doc?.getFlag(MODULE, key); } catch { return undefined; }
};

/**
 * → `{ base, kind, registry, carried, facts }`.
 *
 * `onBase` (default) reads the **world actor** behind an unlinked token: grants are keyed and
 * belief rows are written on `game.actors.get(id)` (`writeIdentification`, `resolveFact`), so
 * three goblins share one page, exactly as the Known tab files them. The GM's preview passes
 * `onBase: false` to keep reading the document it was opened on, as it always has — the
 * refactor that introduced this file must not change one byte of that window.
 */
export function subjectFacts(subject, { onBase = true } = {}) {
  const base = onBase ? game.actors?.get(subject?.id) ?? subject : subject;
  const kind = base ? kindActorOf(base) : null;
  const reg = registry();
  const carried = base ? attributeIdsOf(base, kindActorOf) : [];
  return {
    base,
    kind,
    registry: reg,
    carried,
    facts: base
      ? factOrder({ subjectId: base.id, kindId: kind?.id ?? null, carried, registry: reg, lore: flagOf(base, LORE_FLAG) })
      : []
  };
}
