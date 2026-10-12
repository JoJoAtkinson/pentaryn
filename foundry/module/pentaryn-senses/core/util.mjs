/**
 * Pentaryn Senses — small shared helpers (findings -10, -18). PURE: nothing here touches a Foundry
 * global at load; `unsetPath` reads `globalThis._del` only when called, and only as a default.
 */

/** HTML-escape the five characters. Not idempotent: an entity is escaped again. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * `{path: delete}` in the v14 form (`_del`), falling back to the older "-=" key with `null`.
 * A dotless path keeps the historical leading dot (`".-=a"`); every caller passes a flag path.
 */
export function unsetPath(path, del = globalThis._del) {
  if (del) return { [path]: del };
  const i = path.lastIndexOf(".");
  return { [`${path.slice(0, i)}.-=${path.slice(i + 1)}`]: null };
}
