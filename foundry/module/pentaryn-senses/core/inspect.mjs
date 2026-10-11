/**
 * Pentaryn Senses — what `inspect()` reports (finding -25). PURE: plain inputs in, a plain answer
 * out; nothing is mutated, so deep-frozen inputs work.
 *
 *   token        the token's light and the flags that say who owns it (carried, spell, hand-set)
 *   actor        the carried light: the strongest, every item giving light, the one the token shows
 *   chain        the token's own chain and the tokens chained to it
 *   lightSpells  each Light cantrip the actor knows: where it is cast and what it lights now
 *                (litBy as "Scene.<id>.Token.<id>" / "Scene.<id>.AmbientLight.<id>", so depth stays ≤ 4)
 */

import { MODULE } from "./ids.mjs";
import { readChain } from "./chain.mjs";
import { carriedLightOf, isLightSpellData, lightEntries, lightingItemId, litByIn, readSpellCast, readSpellLight } from "./light.mjs";

const copy = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function lightOf(token) {
  const l = token?.light?.toObject?.() ?? token?.light;
  return l && typeof l === "object" ? copy(l) : null;
}

/** `{ cast, litBy }` for one Light cantrip item over these scenes. */
export function lightStatus(item, scenes) {
  return {
    cast: readSpellCast(item),
    litBy: litByIn(scenes, item?.uuid).map(({ kind, scene, id }) => ({ kind, scene, id })),
  };
}

/**
 * @param {{ token?: object|null, actor?: object|null, items?: Iterable, sceneTokens?: Iterable, scenes?: Iterable }} input
 *   items: the actor's items (an unlinked token's own); sceneTokens: the token's scene's tokens
 */
export function inspectShape({ token = null, actor = null, items = [], sceneTokens = [], scenes = [] } = {}) {
  const f = token?.flags?.[MODULE] ?? {};
  const list = [...(items ?? [])];
  const carriers = lightEntries(list);
  return {
    token: token ? {
      id: token.id ?? null,
      light: lightOf(token),
      itemLight: f.itemLight === true,
      itemLightPrior: copy(f.itemLightPrior ?? null),
      spellLight: copy(readSpellLight(token)),
    } : null,
    actor: actor ? {
      id: actor.id ?? null,
      carried: copy(carriedLightOf(list)),
      carriers: carriers.map(({ kind, id, name }) => ({ kind, item: id, name })),
      hooded: carriers.some(c => c.hooded),
      lightingItem: lightingItemId(list),
    } : null,
    chain: token ? {
      anchor: readChain(token)?.anchor ?? null,
      chainedHere: [...(sceneTokens ?? [])].filter(t => t && t.id !== token.id && readChain(t)?.anchor === token.id).map(t => t.id),
    } : null,
    // litBy as uuids, not {kind, scene, id} objects: an object there would make the answer 5 deep (cap 4)
    lightSpells: list.filter(isLightSpellData).map(item => {
      const { cast, litBy } = lightStatus(item, scenes);
      return { item: item.id ?? null, cast, litBy: litBy.map(l => `Scene.${l.scene}.${l.kind === "token" ? "Token" : "AmbientLight"}.${l.id}`) };
    }),
  };
}
