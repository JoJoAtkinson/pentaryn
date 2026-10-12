/**
 * Pentaryn Transform — the one patch of someone else's code, through the kit's wrapMethod.
 *
 * Foundry v14 core bug (seen v14.367, still present in v14.369): token swaps with operator-wrapped
 * sizes. dnd5e's transformInto and revertOriginalForm swap the token with a non-recursive update
 * ({diff: false, recursive: false}). Core v14 turns every root key of such an update into a
 * ForcedReplacement operator, then TokenDocument._preUpdateOperation hands those raw operators to
 * code that expects numbers: region identification does `point.x.almostEqual(...)` on an operator
 * object and throws ("point.x.almostEqual is not a function"), aborting the update. On a scene with
 * Regions (Drow Prison's passages), a druid whose form stands in one could not return to normal
 * form: the token kept pointing at "Talo (Dire Wolf)". Movement-waypoint inference reads the same
 * raw values. For a scalar field a ForcedReplacement means exactly "set this value", so scalars are
 * unwrapped before core sees them (core unwrapForcedScalars); object fields (texture, sight, ring,
 * flags, delta) keep their operators.
 * Re-checked 2026-10-10 on v14.369: DataModel still wraps every root key of a recursive:false
 * update (common/abstract/data.mjs) and testInsideRegion still reads `data.x ?? _source.x` with no
 * unwrap; a wrapped x/y at a region's centre tests outside. Remove only when that changes.
 *
 * GLUE: only the entry imports this file. installPatches() runs at the entry's evaluation, before
 * any preUpdateToken listener, exactly when the old inline block ran.
 */

import { MODULE, unwrapForcedScalars } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { wrapMethod } from "./lib/patch.mjs";

const log = makeLog(MODULE);

let handle = null;

/**
 * Wrap TokenDocument._preUpdateOperation (marker `pentarynUnwrapped`) when core still owns it and
 * has the v14 operators; a second call (a re-evaluated entry) finds the marker and does nothing.
 * @returns {{ via: string|null, unwrap: () => void }|null}  the patch handle, or null when not applied
 */
export function installPatches() {
  const TD = foundry.documents?.TokenDocument;
  const Ops = foundry.data?.operators;
  const original = TD && Object.hasOwn(TD, "_preUpdateOperation") ? TD._preUpdateOperation : null;
  if (!original || !Ops?.ForcedReplacement || original.pentarynUnwrapped) return null;
  handle = wrapMethod(MODULE, {
    target: TD, name: "_preUpdateOperation", marker: "pentarynUnwrapped",
    label: "TokenDocument._preUpdateOperation", adjustments: "transform-preupdate-unwrap"
  }, function (wrapped, documents, operation, user) {
    if (operation?.recursive === false) {
      unwrapForcedScalars(operation, { isForced: v => v instanceof Ops.ForcedReplacement, valueOf: v => Ops.DataFieldOperator.get(v) });
    }
    return wrapped(documents, operation, user);
  }, { log });
  return handle;
}

/** Undo the patch (the API's uninstall); a later installPatches() wraps again. */
export function removePatches() {
  handle?.unwrap();
  handle = null;
}
