/**
 * pentaryn-prompts core — paging a gather by prompt count. PURE.
 */

/**
 * `counts[i]`: prompts on the i-th scene. Always at least one scene; after the first, never past
 * `maxPrompts`. → `{ take, next }`: how many scenes this page takes, and the index the next page
 * starts at (null when all were taken).
 */
export function pageScenes(counts, maxPrompts) {
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    if (i > 0 && total + counts[i] > maxPrompts) return { take: i, next: i };
    total += counts[i];
  }
  return { take: counts.length, next: null };
}
