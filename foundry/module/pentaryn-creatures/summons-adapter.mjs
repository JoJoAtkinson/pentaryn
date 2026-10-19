/**
 * Pentaryn Creatures — ADAPTER: dnd5e summon data → the plain shapes core's summon-library rules
 * take (`summonAllowed`, `libraryFiling`), and the plain create data for a library copy. The only
 * file that reads a dnd5e summon activity (`activity.summon.mode`, `profiles[].uuid/cr/types`), an
 * item's compendium original, dnd5e's copy flags (`isAutoImported`, `summon.origin`), its Create New
 * Actors error text or `utils.simplifyBonus`; the decisions are core's.
 */

import { libraryOwnership } from "./creatures-core.mjs";

/** A profile's CR limit as a number (dnd5e: `simplifyBonus(profile.cr, rollData)`), or null for none. */
function crLimit(profile, activity) {
  const raw = profile?.cr;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  try {
    const simplify = globalThis.dnd5e?.utils?.simplifyBonus;
    const v = simplify ? simplify(raw, activity.getRollData?.({ deterministic: true }) ?? {}) : NaN;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The item's summon activities as `{ mode, profiles: [{ uuid, cr, types }] }`. */
export function summonActivities(item) {
  const out = [];
  for (const a of item?.system?.activities ?? []) {
    if (a?.type !== "summon") continue;
    out.push({
      mode: a.summon?.mode ?? "",
      profiles: (a.profiles ?? []).map(p => ({
        uuid: p?.uuid ?? null,
        cr: crLimit(p, a),
        types: [...(p?.types ?? [])],
      })),
    });
  }
  return out;
}

/** A source actor as `summonAllowed` reads it. */
export function targetSummary(actor) {
  const cr = Number(actor?.system?.details?.cr);
  return {
    uuid: actor?.uuid ?? null,
    inPack: !!actor?.pack,
    actorType: actor?.type ?? null,
    cr: Number.isFinite(cr) ? cr : null,
    creatureType: actor?.system?.details?.type?.value ?? null,
  };
}

/**
 * The world create data for a library copy, built from the request alone (both GM tabs must send
 * the same thing): a compendium source through core's `fromCompendium`, a world source as a clone.
 * Carries what dnd5e's `fetchExisting` looks for before importing again: `flags.dnd5e.isAutoImported`,
 * the source in `_stats.compendiumSource` (compendium) or `_stats.duplicateSource` (world), and for a
 * linked source `flags.dnd5e.summon.origin` = the summoning item's uuid (dnd5e reuses a linked copy
 * only for the item it came from).
 */
export function libraryActorData(source, { _id, folderId, summoner, senderId, originUuid = null }) {
  let data;
  const stats = {};
  if (source.pack) {
    data = game.actors.fromCompendium(source, { keepId: false });
    stats.compendiumSource = source.uuid;
  } else {
    data = source.toObject();
    stats.compendiumSource = source._stats?.compendiumSource ?? null;
    stats.duplicateSource = source.uuid;
  }
  data._id = _id;
  data._stats = stats;
  data.folder = folderId ?? null;
  data.ownership = libraryOwnership(summoner?.ownership, senderId);
  data.flags = { ...(data.flags ?? {}), dnd5e: { ...(data.flags?.dnd5e ?? {}), isAutoImported: true } };
  if (source.prototypeToken?.actorLink === true && originUuid) {
    data.flags.dnd5e.summon = { ...(data.flags.dnd5e.summon ?? {}), origin: originUuid };
  }
  data.flags["pentaryn-creatures"] = { ...(data.flags["pentaryn-creatures"] ?? {}), library: summoner?.id ?? null };
  return data;
}

/** dnd5e 6.0.6's `DND5E.ACTOR.Warning.CreateActor` in English (the table's language). */
const CREATE_REFUSAL_EN = "You must have 'Create New Actors' permission in order to summon directly from a compendium.";

/** Is this `fetchExisting` error dnd5e's Create New Actors refusal, and nothing else? */
export function isCreateRefusal(err) {
  const message = err?.message;
  if (typeof message !== "string") return false;
  const key = "DND5E.ACTOR.Warning.CreateActor";
  const text = globalThis.game?.i18n?.localize?.(key);
  return message === CREATE_REFUSAL_EN || (typeof text === "string" && text !== key && message === text);
}

/**
 * The summoning item's compendium original as `summonActivities` (null: no original, not found, or no
 * summon activity on it). The world item is its owner's to edit; the original is not.
 */
export async function originalActivities(item) {
  const uuid = item?._stats?.compendiumSource;
  if (typeof uuid !== "string" || !uuid.startsWith("Compendium.")) return null;
  try {
    const original = await fromUuid(uuid);
    if (original?.documentName !== "Item") return null;
    const list = summonActivities(original);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/** May `user` see the source in full: a world actor at OBSERVER, or a compendium actor's pack at OBSERVER. */
export function sourceVisible(source, user) {
  if (!source || !user) return false;
  if (source.pack) return game.packs?.get(source.pack)?.testUserPermission?.(user, "OBSERVER") === true;
  return source.testUserPermission?.(user, "OBSERVER") === true;
}

/** A world actor as core's `isSummonCopy`, `libraryFiling` and `summonAllowed` read it. */
export function copySummary(actor) {
  const f = actor?.flags ?? {};
  const cr = Number(actor?.system?.details?.cr);
  return {
    id: actor?.id ?? null,
    autoImported: !!(f.dnd5e?.isAutoImported || f.dnd5e?.summonedCopy),
    source: actor?._stats?.compendiumSource || actor?._stats?.duplicateSource || null,
    // what dnd5e matched it on: compendiumSource, and for its clone of a linked world actor (itself
    // compendium-imported) the world actor it actually fetched, duplicateSource
    sources: [actor?._stats?.compendiumSource, actor?._stats?.duplicateSource]
      .filter((u, i, all) => typeof u === "string" && u && all.indexOf(u) === i),
    fetched: actor?._stats?.duplicateSource || actor?._stats?.compendiumSource || null,
    folderId: actor?.folder?.id ?? null,
    ownership: { ...(actor?.ownership ?? {}) },
    library: f["pentaryn-creatures"]?.library ?? null,
    linked: actor?.prototypeToken?.actorLink === true,
    origin: f.dnd5e?.summon?.origin ?? null,
    actorType: actor?.type ?? null,
    cr: Number.isFinite(cr) && actor?.system?.details?.cr !== null ? cr : null,
    creatureType: actor?.system?.details?.type?.value ?? null,
  };
}

/**
 * A copy's source as `summonAllowed` reads it, from the copy's own data (the sweep fetches nothing).
 * `uuids` carries both sources, so a profile naming either one matches; `inPack` is where dnd5e
 * fetched it from (a clone of a world actor is not a compendium pick, whatever it was imported from).
 */
export function copyTarget(summary) {
  return {
    uuid: summary.source,
    uuids: summary.sources?.length ? [...summary.sources] : [summary.source].filter(Boolean),
    inPack: String(summary.fetched ?? summary.source ?? "").startsWith("Compendium."),
    actorType: summary.actorType,
    cr: summary.cr,
    creatureType: summary.creatureType,
  };
}
