/**
 * The module's own HTML escaper: `& < > " '` → entities, with `'` as `&#39;`. Eight files carried this
 * line byte for byte (ties-15). The three windows that escape with `foundry.utils.escapeHTML` (look,
 * preview, review-ui) keep it: it writes a different entity for `'`, and their markup is pinned.
 *
 * Pure: no Foundry global. NOT on the known-core.mjs barrel — import it by path.
 */

const ENTITY = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {*} s  anything; null and undefined escape to "" */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ENTITY[c]);
