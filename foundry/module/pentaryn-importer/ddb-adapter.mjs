/**
 * pentaryn-importer — ADAPTER for the DDB corrections: a live Actor → the plain snapshot ddb-core.mjs
 * plans on, the lookups a rule needs (Cast activities' spells, the PHB spell index), and the writes
 * that carry out a plan. The rules themselves are in ddb-core.mjs; who runs them, and when, is
 * ddb-corrections.mjs.
 *
 * Reads only `_source` data (never derived data, which dnd5e and active effects change). Writes are
 * batched: one `updateEmbeddedDocuments("Item")` for every plain item update, one Item update per type
 * change (a type change cannot be batched with others), one effect create per item, one
 * `deleteEmbeddedDocuments("Item")` for every stale cached spell copy, one actor update that carries
 * the base-data resets and the correction stamp together.
 */

import { PHB_SPELLS, STAMP_KEY, STAMP_PATH, spellUuidsNeeded } from "./ddb-core.mjs";
import { MODULE } from "./importer-core.mjs";

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const sourceOf = doc => doc?._source ?? (typeof doc?.toObject === "function" ? doc.toObject() : doc);
const listOf = coll => (coll ? (Array.isArray(coll) ? coll : (coll.contents ?? [...coll])) : []);

/**
 * A uuid as core compares it: Foundry's parseUuid form (a legacy compendium uuid gains its document
 * type, a redirected pack its new name), else the uuid as written.
 */
export function uuidKey(uuid, { g = globalThis } = {}) {
  if (typeof uuid !== "string" || !uuid) return null;
  try {
    return g.foundry?.utils?.parseUuid?.(uuid)?.uuid ?? uuid;
  } catch {
    return uuid;
  }
}

/** Each Cast activity's spell uuid, normalised, by activity id (core's stale-cast-cache). */
function castKeysOf(activities) {
  const out = {};
  for (const [id, a] of Object.entries(activities ?? {})) {
    if (a?.type === "cast" && a.spell?.uuid) out[id] = uuidKey(a.spell.uuid);
  }
  return out;
}

/** True when the actor came from D&D Beyond through ddb-importer. */
export function isDdbActor(actor) {
  return !!actor?.flags?.ddbimporter;
}

/**
 * The plain snapshot of a live Actor (ddb-core.mjs header).
 * @param {Actor} actor
 */
export function snapshotOf(actor) {
  const src = sourceOf(actor) ?? {};
  return {
    id: actor.id,
    name: actor.name,
    ddb: isDdbActor(actor),
    importId: actor.flags?.ddbimporter?.importId ?? null,
    stamp: clone(actor.flags?.[MODULE]?.[STAMP_KEY] ?? null),
    system: clone(src.system ?? {}),
    items: listOf(actor.items).map(item => {
      const s = sourceOf(item) ?? {};
      return {
        _id: item.id,
        name: item.name,
        type: item.type,
        system: clone(s.system ?? {}),
        flags: clone(s.flags ?? {}),
        source: s._stats?.compendiumSource ?? null,
        sourceKey: uuidKey(s._stats?.compendiumSource),
        castKeys: castKeysOf(s.system?.activities),
        effects: listOf(item.effects).map(e => {
          const es = sourceOf(e) ?? {};
          const keys = (es.system?.changes ?? es.changes ?? []).map(c => c?.key).filter(Boolean);
          return { _id: e.id, name: e.name, disabled: !!e.disabled, flags: clone(es.flags ?? {}), keys };
        }),
      };
    }),
  };
}

/** A spell document → the plain fields the rules read. */
function spellData(doc) {
  const s = sourceOf(doc) ?? {};
  return { name: doc.name, system: { level: s.system?.level ?? null, uses: clone(s.system?.uses ?? {}), activities: clone(s.system?.activities ?? {}) } };
}

/**
 * Resolve what the rules need for this snapshot: each foreign Cast activity's spell, and the PHB
 * spell index (only when there is a spell to match).
 * @param {object} snap
 * @param {{ g?: object }} [opts]
 */
export async function lookupsFor(snap, { g = globalThis } = {}) {
  const spells = {};
  for (const uuid of spellUuidsNeeded(snap)) {
    let doc = null;
    try {
      doc = await g.fromUuid(uuid);
    } catch {
      doc = null;
    }
    spells[uuid] = doc ? spellData(doc) : null;
  }
  let phbSpells = null;
  if (Object.keys(spells).length) {
    const pack = g.game?.packs?.get?.(PHB_SPELLS);
    if (pack) {
      const index = await pack.getIndex();
      phbSpells = listOf(index).map(e => ({ _id: e._id, name: e.name }));
    }
  }
  return { spells, phbSpells };
}

/**
 * Carry out a plan on the live actor. Never throws for one failed write: each failure lands in
 * `errors` and the rest still run. The stamp goes on only when nothing failed, so the next GM-ready
 * sweep retries a partial run.
 * @param {Actor} actor
 * @param {object} plan     planCorrections' result
 * @param {object|null} stamp  stampFor's value, or null to write no stamp
 * @returns {Promise<{ applied: string[], errors: string[], stamped: boolean }>}
 */
export async function applyPlan(actor, plan, stamp) {
  const applied = [];
  const errors = [];
  const say = c => c.summary;

  const updates = new Map();
  for (const c of plan.changes.filter(c => c.op === "updateItem")) {
    updates.set(c.itemId, { ...(updates.get(c.itemId) ?? { _id: c.itemId }), ...c.data });
  }
  if (updates.size) {
    const batch = plan.changes.filter(c => c.op === "updateItem");
    try {
      await actor.updateEmbeddedDocuments("Item", [...updates.values()]);
      applied.push(...batch.map(say));
    } catch (err) {
      errors.push(`item updates: ${err?.message ?? err}`);
    }
  }

  for (const c of plan.changes.filter(c => c.op === "retype")) {
    try {
      await retype(actor, c);
      applied.push(say(c));
    } catch (err) {
      errors.push(`${c.item}: ${err?.message ?? err}`);
    }
  }

  for (const c of plan.changes.filter(c => c.op === "createEffects")) {
    const item = actor.items.get(c.itemId);
    try {
      if (!item) throw new Error("item is gone");
      await item.createEmbeddedDocuments("ActiveEffect", clone(c.data), { keepId: true });
      applied.push(say(c));
    } catch (err) {
      errors.push(`${c.item}: effects: ${err?.message ?? err}`);
    }
  }

  const deletes = plan.changes.filter(c => c.op === "deleteItem" && actor.items.get(c.itemId));
  if (deletes.length) {
    try {
      await deleteItems(actor, [...new Set(deletes.map(c => c.itemId))]);
      applied.push(...deletes.map(say));
    } catch (err) {
      errors.push(`item deletes: ${err?.message ?? err}`);
    }
  }

  const actorChanges = plan.changes.filter(c => c.op === "updateActor");
  const data = Object.assign({}, ...actorChanges.map(c => c.data));
  const stamped = !!stamp && !errors.length;
  if (stamped) data[STAMP_PATH] = stamp;
  if (Object.keys(data).length) {
    try {
      await actor.update(data);
      applied.push(...actorChanges.map(say));
    } catch (err) {
      errors.push(`actor: ${err?.message ?? err}`);
      return { applied, errors, stamped: false };
    }
  }
  return { applied, errors, stamped };
}

const isMissing = err => /does not exist/i.test(String(err?.message ?? err));

/**
 * Delete items that may already be gone: dnd5e removes a Cast activity's cached spell copy itself, and
 * another tab may run the same plan. Each id is re-checked just before the call, and a "does not
 * exist" refusal (the item went between the check and the server) counts as done: what is left is
 * tried once more, and a second "does not exist" is success too. Any other error is thrown.
 */
async function deleteItems(actor, ids) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const live = ids.filter(id => actor.items.get(id));
    if (!live.length) return;
    try {
      await actor.deleteEmbeddedDocuments("Item", live);
      return;
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }
}

/**
 * The update fields that replace an Item's whole `system`: core's ForcedReplacement operator (v14:
 * `foundry.data.operators.ForcedReplacement`; core refuses a type change without it), or the
 * deprecated `==system` key on a core that has no operator.
 */
export function replacedSystem(system, { g = globalThis } = {}) {
  const FR = g.foundry?.data?.operators?.ForcedReplacement;
  if (typeof FR?.create === "function") return { system: FR.create(system) };
  if (typeof FR === "function") return { system: new FR(system) };
  return { "==system": system };
}

/**
 * A type change replaces the whole system (a ForcedReplacement). When Foundry refuses that, the item
 * is recreated under the same id (deleted first so keepId is free); a refused create puts the original
 * back. Throws with both reasons when nothing worked.
 */
async function retype(actor, change) {
  const item = actor.items.get(change.itemId);
  if (!item) throw new Error("item is gone");
  try {
    await item.update({ type: change.data.type, ...replacedSystem(clone(change.data.system)) });
    return;
  } catch (first) {
    const original = item.toObject();
    const data = { ...clone(original), type: change.data.type, system: clone(change.data.system) };
    let deleted = false;
    try {
      await actor.deleteEmbeddedDocuments("Item", [change.itemId]);
      deleted = true;
      await actor.createEmbeddedDocuments("Item", [data], { keepId: true });
    } catch (second) {
      let restored = "";
      if (deleted) {
        try {
          await actor.createEmbeddedDocuments("Item", [original], { keepId: true });
          restored = " (original restored)";
        } catch (third) {
          restored = ` (NOT restored: ${third?.message ?? third})`;
        }
      }
      throw new Error(`${first?.message ?? first} / ${second?.message ?? second}${restored}`);
    }
  }
}
