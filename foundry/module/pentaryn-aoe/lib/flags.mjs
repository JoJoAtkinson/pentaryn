// pentaryn kit 1.0.2 · vendored from foundry/lib/flags.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Flag reads that never throw, and the update path for a flag.
 *
 * `doc.getFlag(scope, key)` throws when `scope` is not an active package — so reading another
 * module's flag while that module is disabled breaks a render. `readFlag` reads the data instead.
 *
 * Deleting a flag: `doc.update({ [flagPath(scope, key)]: _del })` at the call site. `_del` is
 * core's client global (a `foundry.data.operators.ForcedDeletion`); the `-=key` syntax is
 * deprecated in v14. `unsetFlag` stays fine for the module's own scope.
 */

/** The value at `flags.<scope>.<key>` (key may be dotted), or undefined. Never throws. */
export function readFlag(doc, scope, key) {
  const root = doc?.flags?.[scope];
  if (root == null) return undefined;
  if (key === undefined || key === null || key === "") return root;
  return String(key).split(".").reduce((o, k) => (o == null ? undefined : o[k]), root);
}

/** `flags.<scope>.<key>` — the update path. */
export function flagPath(scope, key) {
  return `flags.${scope}.${key}`;
}
