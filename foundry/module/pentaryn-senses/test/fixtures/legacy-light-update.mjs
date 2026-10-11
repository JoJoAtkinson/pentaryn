// Verbatim oracle: senses.mjs:44–63 `lightUpdate` (and its SCOPE const, :32) at the senses
// characterisation checkpoint (wave 3, base a5a1a906). Never imported by runtime. Plan step 3
// (finding -12) moves this into core as itemLightUpdate(doc, light, {flatten, clone, del});
// carried.test.mjs proves the live path equals this oracle, row for row.
import { DARK } from "../../senses-core.mjs";

const SCOPE = "pentaryn-senses";

/**
 * The update that brings a token (or the prototype) in line with its carried light, or null.
 * A hand-set light that a carried light covers (Marrith lights a torch over her rune glow) is kept
 * in flags.pentaryn-senses.itemLightPrior and comes back when the carried light goes, not DARK.
 */
export function lightUpdate(doc, light) {
  if (doc.flags?.[SCOPE]?.spellLight) return null; // the Light cantrip owns this token's light until it ends
  const lit = doc.flags?.[SCOPE]?.itemLight === true;
  const PRIOR = `flags.${SCOPE}.itemLightPrior`;
  if (light) {
    const own = doc.light?.toObject?.() ?? doc.light ?? {};
    const current = foundry.utils.flattenObject(own);
    const want = foundry.utils.flattenObject(light);
    const same = Object.entries(want).every(([k, v]) => current[k] === v);
    if (same && lit) return null;
    const u = { light, [`flags.${SCOPE}.itemLight`]: true };
    if (!lit && ((Number(own.bright) || 0) > 0 || (Number(own.dim) || 0) > 0)) u[PRIOR] = foundry.utils.deepClone(own);
    return u;
  }
  if (!lit) return null;
  const prior = doc.flags?.[SCOPE]?.itemLightPrior;
  const u = { light: foundry.utils.deepClone(prior ?? DARK), [`flags.${SCOPE}.itemLight`]: false };
  if (prior !== undefined) u[PRIOR] = globalThis._del ?? null;
  return u;
}
