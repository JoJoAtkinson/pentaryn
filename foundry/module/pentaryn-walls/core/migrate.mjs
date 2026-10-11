/**
 * The flag-scope data migration (blueprint B6, guide step 10), pure half: which walls move from
 * `flags.wall-autocomplete` to `flags.pentaryn-walls` (the module id, blueprint §5.8), and the
 * update that moves each.
 *
 * Designed and tested in wave 2; it runs only once the Wave 7 batch wires migrations.mjs in.
 */

import {READ_SCOPES} from "./engine.mjs";

export const [MODULE_SCOPE, LEGACY_SCOPE] = READ_SCOPES;

/** Bump when a later data migration is added; the store row records the last one applied. */
export const MIGRATION_VERSION = 1;

/**
 * The updates for one scene's walls: every wall with a legacy stamp gets one update that writes
 * the stamp under the module scope (any key already there wins) and deletes the legacy scope.
 * Walls without a legacy stamp are left out, so planning over migrated walls yields [] — the
 * migration is idempotent, and two GM tabs running it at once send identical updates.
 *
 * @param {{_id?: string, id?: string, flags?: object}[]} walls  plain wall data (toObject())
 * @param {{del: *}} opts  del: the deletion operator (Foundry's `_del`), injected to stay pure
 * @returns {object[]} `updateEmbeddedDocuments("Wall", …)` payloads
 */
export function planScopeMigration(walls, {del}) {
  const out = [];
  for (const w of walls) {
    const legacy = w.flags?.[LEGACY_SCOPE];
    if (!legacy || typeof legacy !== "object") continue;
    out.push({
      _id: w._id ?? w.id,
      [`flags.${MODULE_SCOPE}`]: {...legacy, ...(w.flags?.[MODULE_SCOPE] ?? {})},
      [`flags.${LEGACY_SCOPE}`]: del
    });
  }
  return out;
}
