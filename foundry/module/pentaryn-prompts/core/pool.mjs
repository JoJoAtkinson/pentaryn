/**
 * pentaryn-prompts core — matching a caller's word against an advancement's item pool. PURE.
 */

import { sameName } from "../build-core.mjs";

/** "Divine Order: Protector" → "Protector": the part after the last colon. */
export const poolTail = n => String(n).split(/:\s*/).pop();

/**
 * The pool index a word picks, or -1, in this order: the exact uuid, then the item's full name
 * (sameName: any case and word order), then the name after its colon ("Protector" finds
 * "Divine Order: Protector"). `names[i]` is the name of `pool[i]`.
 */
export function poolIndex(word, pool, names) {
  const i = pool.indexOf(word);
  if (i >= 0) return i;
  const j = names.findIndex(n => sameName(n, word));
  if (j >= 0) return j;
  return names.findIndex(n => sameName(poolTail(n), word));
}
