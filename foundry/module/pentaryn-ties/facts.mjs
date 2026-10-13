/**
 * One subject's facts, gathered from the live client — the thin Foundry half of `factOrder`.
 *
 * `known-core.mjs`'s `factOrder` decides **which facts a subject could hand a player, in what
 * order, under what key**, and is fixtured in bare node. It cannot read a world: the registry is
 * a setting, the carried list walks derived attributes and the `kindOf` pointer, the lore rows are
 * a flag. This file reads those four things and nothing more, so the two surfaces that draw a
 * subject's facts agree about the list by construction:
 *
 *   - the GM's inspect window, Player view (`preview-app.mjs`) — every fact, authored words, switches
 *   - the player's Look window (`look-app.mjs`) — only the facts already in their `granted` map
 *
 * ⚠ **Ids and keys only.** Nothing here returns authored hit or miss prose, a row's wording, a DC, a skill or a
 * tier, and nothing here reads a ledger. The Look window imports this file; keeping it blind to
 * outcomes is what lets that window be identical for a success, a failure and a held rung.
 */

import { MODULE } from "./ties-core.mjs";
import { attributeIdsOf, registry } from "./attributes.mjs";
import { kindActorOf } from "./study.mjs";
import { factOrder, LORE_FLAG, BELIEFS_FLAG, GRANTED_FLAG, identMissKey, readGranted, visibleAttributesFor } from "./known-core.mjs";
import { readFlag } from "./lib/flags.mjs";

/**
 * The heading each fact group draws under, per surface (ties-ui-EXT-4): `look` is the player's
 * Look window, `preview` the GM's Player view, and `kindPage` the kind group's heading when a
 * separate kind actor files the study under its own page. Literal keys, so the i18n gate sees
 * every one. A group this table does not know is headed with its own name (`groupLabelKey` →
 * null) — labelled, never dropped, never filed under another group's heading.
 */
export const GROUP_LABEL = Object.freeze({
  ident: Object.freeze({ look: "PENTARYN_TIES.known.look.groupIdent", preview: "PENTARYN_TIES.known.share.groupIdent" }),
  attr: Object.freeze({ look: "PENTARYN_TIES.known.look.groupAttr", preview: "PENTARYN_TIES.known.share.groupAttr" }),
  lore: Object.freeze({ look: "PENTARYN_TIES.known.look.groupLore", preview: "PENTARYN_TIES.known.share.groupLore" }),
  kind: Object.freeze({
    look: "PENTARYN_TIES.known.look.groupKind",
    preview: "PENTARYN_TIES.known.share.groupKind",
    kindPage: Object.freeze({ look: "PENTARYN_TIES.known.look.groupKindPage", preview: "PENTARYN_TIES.known.share.groupKindPage" })
  })
});

/** `group`'s heading key on `surface` ("look" | "preview"), or null for a group GROUP_LABEL does not know. */
export function groupLabelKey(group, surface, { kindPage = false } = {}) {
  const row = Object.hasOwn(GROUP_LABEL, group) ? GROUP_LABEL[group] : null;
  return (kindPage && row?.kindPage?.[surface]) || row?.[surface] || null;
}

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
      ? factOrder({ subjectId: base.id, kindId: kind?.id ?? null, carried, registry: reg, lore: readFlag(base, MODULE, LORE_FLAG) })
      : []
  };
}

/**
 * **What has this character learned about this subject?** (ties-8) — the player-plane answer, as
 * data: every fact in `granted` that passes the secrecy gate, in `factOrder` order, as the Look
 * window draws it.
 *
 *   ident   granted[key] AND the subject is identified (and released) as a carrier of that attribute
 *   attr    granted[key] AND the same gate on that attribute
 *   lore    granted[key]
 *   kind    granted[key]
 *
 * plus a failed identification's written failure line (`identMissKey`, ns "identMiss"), which sits
 * where that rung's card would. The words are the GRANT record's, never the authored source.
 *
 * `gathered` is `subjectFacts(subject)` when the caller already has it (the Look window does).
 *
 * → `[{ group, key, ns, attrId, icon, source, text }]`. A blank grant is still listed (its text is
 * blank); the Look window draws nothing for it.
 */
export function knowsAbout(character, subject, gathered = subjectFacts(subject)) {
  const { base, registry: reg, carried, facts } = gathered;
  const granted = readGranted(readFlag(character, MODULE, GRANTED_FLAG));
  const beliefs = readFlag(base, MODULE, BELIEFS_FLAG) ?? {};
  const visible = new Set(visibleAttributesFor({ carried, registry: reg, beliefs, characterId: character?.id ?? "", isGM: false }));
  const subjectId = base?.id ?? subject?.id ?? "";
  const out = [];
  const card = (x, key, ns, g) => ({ group: x.group, key, ns, attrId: x.attrId ?? null, icon: g.icon, source: g.source, text: g.text });
  for (const x of facts) {
    if (x.ns === "ident") {
      const missKey = identMissKey(subjectId, x.attrId);
      if (granted[missKey]) out.push(card(x, missKey, "identMiss", granted[missKey]));
    }
    const g = granted[x.key];
    if (!g) continue;
    if ((x.ns === "ident" || x.ns === "attr") && !visible.has(x.attrId)) continue;
    out.push(card(x, x.key, x.ns, g));
  }
  return out;
}
