/**
 * Pure helpers for the token chain (chain.mjs). No Foundry globals, so test/run.mjs proves them
 * in node.
 *
 *   token.flags["pentaryn-senses"].chain = { anchor: "<token id on the same scene>" }
 *
 * The flag lives on the CHAINED token. One chain per chained token; an anchor can hold several.
 */

export const MODULE = "pentaryn-senses";
export const CHAIN_FLAG = "chain";

/** The chain flag on a token document (or plain {flags}), sanitised, or null. Never throws. */
export function readChain(doc) {
  let raw;
  try {
    raw = doc?.flags?.[MODULE]?.[CHAIN_FLAG];
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const anchor = typeof raw.anchor === "string" ? raw.anchor.trim() : "";
  return anchor ? { anchor } : null;
}

/**
 * Every drawable chain among these token documents: [{chained, anchor}] by id.
 * A link whose anchor is missing from the list, or points at itself, is skipped.
 */
export function chainPairs(docs) {
  const list = [...(docs ?? [])].filter(d => d && typeof d.id === "string");
  const ids = new Set(list.map(d => d.id));
  const out = [];
  for (const d of list) {
    const c = readChain(d);
    if (!c || c.anchor === d.id || !ids.has(c.anchor)) continue;
    out.push({ chained: d.id, anchor: c.anchor });
  }
  return out;
}

/** The pairs that involve this token at either end. */
export function linksTouching(pairs, id) {
  return (pairs ?? []).filter(p => p.chained === id || p.anchor === id);
}

/** Start point, length and angle (radians) of the straight line a → b. */
export function chainGeometry(a, b) {
  const ax = Number(a?.x) || 0, ay = Number(a?.y) || 0;
  const dx = (Number(b?.x) || 0) - ax, dy = (Number(b?.y) || 0) - ay;
  return { x: ax, y: ay, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

/** On-map chain thickness in px for a grid size: about a quarter square, never thinner than 12. */
export function chainThickness(gridSize) {
  const g = Number(gridSize) > 0 ? Number(gridSize) : 100;
  return Math.max(12, Math.round(g * 0.28));
}
