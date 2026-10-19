/**
 * Pentaryn Creatures — ADAPTER: dnd5e summon data → the plain shapes core's summon-library rules
 * take (`summonAllowed`), and the plain create data for a library copy. The only file that reads a
 * dnd5e summon activity (`activity.summon.mode`, `profiles[].uuid/cr/types`) or dnd5e's
 * `utils.simplifyBonus`; the decisions are core's.
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
 * Carries what dnd5e's `fetchExisting` looks for before importing again: `flags.dnd5e.isAutoImported`
 * and the source in `_stats.compendiumSource` (compendium) or `_stats.duplicateSource` (world).
 */
export function libraryActorData(source, { _id, folderId, summoner, senderId }) {
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
  data.flags["pentaryn-creatures"] = { ...(data.flags["pentaryn-creatures"] ?? {}), library: summoner?.id ?? null };
  return data;
}
