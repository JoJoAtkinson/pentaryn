/**
 * Pure helpers for the token chain (chain.mjs). No Foundry globals, so test/core.test.mjs proves
 * them in node.
 *
 *   token.flags["pentaryn-senses"].chain = { anchor: "<token id on the same scene>" }
 *
 * The flag lives on the CHAINED token. One chain per chained token; an anchor can hold several.
 */

import { MODULE } from "./ids.mjs";

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

/**
 * A token reference → its TokenDocument, or null: a falsy ref → null; a Token uuid
 * ("Scene.<id>.Token.<id>", any scene) → that token through `fromUuid` (finding -26; another
 * document's uuid → null); any other string → that id on the VIEWED scene (`viewed.tokens.get`);
 * anything else → its `document` (a placeable) or itself (a document).
 */
export function resolveTokenRef(ref, { viewed = null, fromUuid = null } = {}) {
  if (!ref) return null;
  if (typeof ref === "string") {
    if (ref.includes(".") && fromUuid) {
      let doc = null;
      try {
        doc = fromUuid(ref);
      } catch {
        doc = null;   // a malformed uuid is not a token
      }
      return doc?.documentName === "Token" ? doc : null;
    }
    return viewed?.tokens?.get(ref) ?? null;
  }
  return ref.document ?? ref;
}

/**
 * The two tiled sprites that draw one link a → b (finding -20): the chain and its shadow, offset
 * down-right and darkened. Null when the ends are less than a pixel apart (nothing is drawn).
 * `tileH` is the source tile's height; the tile is scaled so it is `thickness` tall.
 */
export function linkSpriteSpecs(a, b, thickness, tileH) {
  const g = chainGeometry(a, b);
  if (g.length < 1) return null;
  const base = { width: g.length, height: thickness, rotation: g.angle, scale: thickness / tileH };
  return {
    shadow: { ...base, x: g.x + thickness * 0.1, y: g.y + thickness * 0.16, tint: 0x000000, alpha: 0.45 },
    link: { ...base, x: g.x, y: g.y },
  };
}
