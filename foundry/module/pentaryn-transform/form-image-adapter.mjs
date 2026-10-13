/**
 * Pentaryn Transform — ADAPTER: what a Wild Shape form reads off the beast besides dnd5e's own copy:
 * its one token image when the beast's token art is a wildcard (wildcard-art, wildcard-art-compendium)
 * and the enriched trait text for the form's duration effect. Split from wildshape-adapter.mjs
 * (EXT-8, the 500-line adapter cap), which imports it; api.mjs serves formImageFor as the
 * `formImage` relay row.
 */

import { MODULE, activitiesOf, isWildcardPath, pickFormImage } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { queryGM } from "./lib/queries.mjs";

const log = makeLog(MODULE);

/* ── the form's token image (wildcard-art) ───────────────────────────────── */

/** True for a beast whose prototype token names a wildcard (dnd5e would pick one of its files at random). */
function hasWildcardToken(source) {
  const proto = source?.prototypeToken;
  return !!proto?.randomImg || isWildcardPath(proto?.texture?.src);
}

/**
 * The files a wildcard token path matches: a FilePicker browse of the path with `{ wildcard: true }`,
 * as core's token config lists them. For world and compendium beasts alike — core's getTokenImages()
 * answers a compendium beast's literal wildcard (wildcard-art-compendium). The server refuses a user
 * without FILES_BROWSE.
 */
async function wildcardFiles(src) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const res = await FP.browse(FP.matchS3URL?.(src) ? "s3" : "data", src, { wildcard: true });
  return Array.isArray(res?.files) ? res.files : [];
}

/**
 * The token image a Wild Shape form of `source` gets, the same every time (pickFormImage). Listing a
 * wildcard's files needs FILES_BROWSE; a player without it asks the active GM (the `formImage` relay
 * row), and with no GM gets the portrait.
 * @returns {Promise<string|null>}
 */
export async function formImage(source) {
  const src = source?.prototypeToken?.texture?.src ?? null;
  const wildcard = hasWildcardToken(source);
  let images = [];
  // A GM or a user who may browse answers it here and never relays: the GM's own query would run this
  // same function again on the same client. No token path (core's Assign Token with the wildcard box
  // drops texture.src) has no files to list, so it is the portrait, without asking anyone.
  const canBrowse = game.user.isGM || !!game.user.can?.("FILES_BROWSE");
  const listable = wildcard && !!src;
  if (listable && canBrowse) {
    images = await wildcardFiles(src).catch(err => {
      log.debug("wildcard token images failed", { source: source.uuid }, err);
      return [];
    });
  } else if (listable && source?.uuid) {
    const img = await queryGM(`${MODULE}.formImage`, { uuid: source.uuid }, { timeout: 5000 }).catch(err => {
      log.debug("asking the GM for the form image failed", { source: source.uuid }, err?.message ?? err);
      return null;
    });
    if (img) images = [img];
  }
  return pickFormImage({ src, wildcard, images, portrait: source?.img ?? null });
}

/** The relay row: `formImage` for an Actor uuid, on the GM's client (null when it is no Actor). */
export async function formImageFor({ uuid } = {}) {
  if (typeof uuid !== "string" || !uuid) return null;
  const source = await fromUuid(uuid).catch(err => {
    log.debug("form image: no such document", { uuid }, err?.message ?? err);
    return null;
  });
  return source?.documentName === "Actor" ? formImage(source) : null;
}

/**
 * For a wildcard beast, the one image its form gets (null otherwise: dnd5e copies a concrete image as
 * it is). wildshape.mjs puts it on dnd5e's transform data and on the token swap (wildcard-art-compendium).
 */
export async function wildcardFormImage(source) {
  if (!hasWildcardToken(source)) return null;
  return formImage(source).catch(err => { log.warn("form token image failed", err); return null; });
}

/**
 * The beast dnd5e is handed. For random token art dnd5e lists the files itself (core's listing: an
 * error toast for a player who may not browse, then a random pick), so it gets a copy with randomImg
 * off and the one image. The image reaches the form through the hooks either way, so a copy that does
 * not take (a compendium Actor) changes nothing else.
 */
export function shiftSource(source, img) {
  if (!source?.prototypeToken?.randomImg) return source;
  try {
    return source.clone({ prototypeToken: { randomImg: false, ...(img ? { texture: { src: img } } : {}) } }, { keepId: true });
  } catch (err) {
    log.warn("form token image not applied", err);
    return source;
  }
}

/* ── the trait text ──────────────────────────────────────────────────────── */

/** Normalised trait text for the form's duration effect, enriched against the beast. */
export async function traitsHtml(source) {
  const TE = foundry.applications.ux.TextEditor.implementation;
  const parts = [];
  for (const item of source.items) {
    if (item.type !== "feat" || item.system.type?.value !== "monster") continue;
    if (activitiesOf(item).length) continue;               // passive traits only
    const html = await TE.enrichHTML(item.system.description?.value ?? "", {
      relativeTo: item, rollData: item.getRollData?.() ?? {}, secrets: false
    });
    parts.push(`<p><strong>${item.name}.</strong> ${html.replace(/^<p>|<\/p>$/g, "")}</p>`);
  }
  return parts.join("");
}
