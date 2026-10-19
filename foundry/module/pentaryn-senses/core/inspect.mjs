/**
 * Pentaryn Senses — what `inspect()` reports (finding -25). PURE: plain inputs in, a plain answer
 * out; nothing is mutated, so deep-frozen inputs work.
 *
 *   token        the token's light and the flags that say who owns it (carried, spell, hand-set)
 *   actor        the carried light: the strongest, every item giving light, the one the token shows
 *   chain        the token's own chain and the tokens chained to it
 *   lightSpells  each Light cantrip the actor knows: where it is cast and what it lights now
 *                (litBy as "Scene.<id>.Token.<id>" / "Scene.<id>.AmbientLight.<id>", so depth stays ≤ 4)
 *
 * token.spellLight.prior sits at depth 3, so its nested objects (a `toObject()` light always carries
 * `animation` and `darkness`) are reported with Foundry-style dotted keys: `"animation.type"`.
 */

import { MODULE } from "./ids.mjs";
import { readChain } from "./chain.mjs";
import { carriedLightOf, isSpellLightData, lightEntries, lightingItemId, litByIn, readSpellCast, readSpellLight } from "./light.mjs";

const copy = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/** One flat level of Foundry-style dotted keys: `{ animation: { type } }` → `{ "animation.type" }`. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

/** The spell flag with its prior light flattened, so the answer stays within depth 4. */
function spellLightOf(token) {
  const s = readSpellLight(token);
  if (!s) return null;
  return { source: s.source, prior: s.prior ? flatten(copy(s.prior)) : null };
}

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
      spellLight: spellLightOf(token),
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
    lightSpells: list.filter(isSpellLightData).map(item => {
      const { cast, litBy } = lightStatus(item, scenes);
      return { item: item.id ?? null, cast, litBy: litBy.map(l => `Scene.${l.scene}.${l.kind === "token" ? "Token" : "AmbientLight"}.${l.id}`) };
    }),
  };
}
