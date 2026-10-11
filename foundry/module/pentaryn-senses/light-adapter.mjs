/**
 * Pentaryn Senses — ADAPTER for the Light cantrip: Foundry documents → what light.mjs and
 * light-ui.mjs decide on. Reads only; never writes. The pure halves (collectSources, litByIn) are
 * core/light.mjs.
 */

import { collectSources, litByIn } from "./senses-core.mjs";

/** The live item behind an activity (dnd5e hands hooks a clone of the item). */
export function realItem(item) {
  if (!item) return null;
  return item.actor?.items?.get(item.id) ?? fromUuidSync(item.uuid, { strict: false }) ?? item;
}

export function itemFrom(uuid) {
  try {
    const doc = fromUuidSync(uuid, { strict: false });
    return doc?.documentName === "Item" ? doc : null;
  } catch {
    return null;
  }
}

/** The caster's token on the scene being viewed: a controlled one first. */
export function casterToken(actor) {
  const scene = canvas?.scene;
  if (!actor || !scene) return null;
  if (actor.isToken) return actor.token?.parent === scene ? actor.token : null;
  const mine = scene.tokens.filter(t => t.actorId === actor.id);
  return mine.find(t => t.object?.controlled) ?? mine.find(t => t.actorLink) ?? mine[0] ?? null;
}

/** Every item the GM can reach: world actors', unlinked tokens' synthetic actors', world items. */
export function allItems({ worldItems = false } = {}) {
  const out = [];
  for (const a of game.actors ?? []) out.push(...a.items);
  for (const s of game.scenes ?? []) for (const t of s.tokens) {
    if (!t.actorLink && t.actor) out.push(...t.actor.items);
  }
  if (worldItems) out.push(...(game.items ?? []));
  return out;
}

/** Every Token and AmbientLight on every scene lit by this source. */
export const litBy = source => litByIn(game.scenes ?? [], source);
export const anyLitBy = source => litBy(source).length > 0;

export const allSources = () => collectSources(game.scenes ?? []);

export function findToken(id, hint) {
  const first = game.scenes.get(hint)?.tokens.get(id);
  if (first) return first;
  for (const s of game.scenes) {
    const t = s.tokens.get(id);
    if (t) return t;
  }
  return null;
}
