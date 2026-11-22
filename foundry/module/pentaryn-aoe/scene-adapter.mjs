/**
 * Scenes, regions, tokens and actors → what the features need (ADAPTER: imports core and lib only).
 *
 * The finders every Part shares: the one handle actor, a region's handle token, the template
 * regions of an activity or a spell, the batched delete, and the Item Piles probe — the only place
 * that touches `game.itempiles` (adjustments row itempiles-aoe-skip-piles).
 */

import { MODULE, aoeFlags, attachedTokenId, isHandle, isTemplateRegion, regionFromSpell, regionOfActivity, spellWallKind } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/** The one shared world actor every handle token points at, found by flag; null when absent. */
export function handleActor() {
  return game.actors.find(a => aoeFlags(a).handleActor) ?? null;
}

/** A template region's handle token: the attached handle, else a token flagged with the region, else null. */
export function handleFor(region) {
  const scene = region?.parent;
  if (!scene) return null;
  const id = attachedTokenId(region);
  const attached = id ? scene.tokens.get(id) : null;
  if (attached && isHandle(attached)) return attached;
  return scene.tokens.find(tk => aoeFlags(tk).region === region.id) ?? null;
}

/** Template regions created by an activity, on one scene (default: every scene). */
export function areasFor(activityUuid, scene = null) {
  if (!activityUuid) return [];
  const scenes = scene ? [scene] : game.scenes.contents;
  return scenes.flatMap(s => s.regions.filter(r => isTemplateRegion(r) && regionOfActivity(r.flags?.dnd5e, activityUuid)));
}

/**
 * Template regions placed by a spell on one scene (default: every scene). Matched by the spell
 * item, so every activity of that spell is covered; the activity uuid is the fallback.
 */
export function spellAreas({ itemUuid = null, activityUuid = null } = {}, scene = null) {
  if (!itemUuid && !activityUuid) return [];
  const scenes = scene ? [scene] : game.scenes.contents;
  return scenes.flatMap(s => s.regions.filter(r => isTemplateRegion(r)
    && regionFromSpell(r.flags?.dnd5e, { itemUuid, activityUuid })));
}

/** Delete regions (and through the cascade their handles). Accepts ids on a scene, or documents. */
export async function removeArea(regions, scene = canvas.scene) {
  const docs = [regions].flat().map(r => (typeof r === "string" ? scene?.regions.get(r) : r)).filter(Boolean)
    .filter(isTemplateRegion);
  const byScene = new Map();
  for (const r of docs) {
    if (!r.canUserModify(game.user, "delete")) continue;
    const list = byScene.get(r.parent) ?? [];
    list.push(r.id);
    byScene.set(r.parent, list);
  }
  let n = 0;
  for (const [s, ids] of byScene) {
    const live = ids.filter(id => s.regions.has(id));
    if (!live.length) continue;
    await s.deleteEmbeddedDocuments("Region", live);
    n += live.length;
  }
  return n;
}

/**
 * Is this token an Item Piles pile (never caught in an area)? Item Piles' own API when it is
 * active; else its flag on the actor or the token. A false positive only drops a chest from the
 * tray, so this is looser than portals' probe on purpose (W3-P1).
 */
export function isPile(token) {
  try {
    if (game.itempiles?.API?.isValidItemPile) return !!game.itempiles.API.isValidItemPile(token);
  } catch (err) {
    log.debug("item piles check", err);   // fall through to the flags
  }
  return !!token.actor?.flags?.["item-piles"]?.data?.enabled || !!token.flags?.["item-piles"]?.data?.enabled;
}

/**
 * B2: the spell item that placed a template region (dnd5e 6: flags.dnd5e.item; else the activity's
 * item), or null when it cannot be read (a deleted item, an unresolvable uuid).
 */
export function regionItem(region) {
  const f = region?.flags?.dnd5e ?? {};
  for (const uuid of [f.item, f.activity]) {
    if (typeof uuid !== "string" || !uuid) continue;
    let doc = null;
    try {
      doc = fromUuidSync(uuid, { strict: false });
    } catch (err) {
      log.debug("region item", err);
      doc = null;
    }
    const item = doc?.documentName === "Item" ? doc : (doc?.item ?? null);
    if (item) return item;
  }
  return null;
}

/** B2: which wall spell a template region is (core.spellWallKind), or null: not a template, not a wall spell. */
export function wallKindOf(region) {
  if (!isTemplateRegion(region)) return null;
  const item = regionItem(region);
  return item ? spellWallKind({ identifier: item.system?.identifier ?? null, name: item.name ?? null }) : null;
}

/** B2: a region's shapes as plain data (core's ClientShapeData does not spread into its fields). */
export function shapesOf(region, shapes = null) {
  return [...(shapes ?? region?.shapes ?? [])].map(s => (typeof s?.toObject === "function" ? s.toObject() : { ...s }));
}

/** B2: the Wall documents a wall spell raised for one region (flags.pentaryn-aoe.regionId). */
export function spellWallsOf(scene, regionId) {
  return [...(scene?.walls ?? [])].filter(w => w?.flags?.[MODULE]?.regionId === regionId);
}
