/**
 * pentaryn-prompts core — marker sizes, dnd5e size widths, footprints.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

/* ── Sizes ────────────────────────────────────────────────────────────────── */

/**
 * The six marker sizes. `w` is the footprint in grid squares; `dnd` the dnd5e size key; `scale`
 * the texture scale (small shares mid's footprint, so its art is drawn smaller to tell them apart).
 */
export const SIZES = Object.freeze([
  { key: "tiny",  dnd: "tiny", w: 0.5, scale: 1,   label: "Tiny" },
  { key: "small", dnd: "sm",   w: 1,   scale: 0.8, label: "Small" },
  { key: "mid",   dnd: "med",  w: 1,   scale: 1,   label: "Medium" },
  { key: "large", dnd: "lg",   w: 2,   scale: 1,   label: "Large" },
  { key: "xl",    dnd: "huge", w: 3,   scale: 1,   label: "Huge" },
  { key: "xxl",   dnd: "grg",  w: 4,   scale: 1,   label: "Gargantuan" }
]);
export const SIZE_KEYS = SIZES.map(s => s.key);
export const SIZE_BY_KEY = Object.freeze(Object.fromEntries(SIZES.map((s, i) => [s.key, { ...s, rank: i }])));

/** dnd5e size key → token width in squares (the system's own table, restated so node can use it). */
export const DND_SIZE_WIDTH = Object.freeze({ tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 });

/** `Medium 5x5 ft` for a marker size on a grid of `gridFt` feet per square. */
export function footprintLabel(sizeKey, gridFt = 5) {
  const s = SIZE_BY_KEY[sizeKey];
  if (!s) return "";
  const ft = fmtNum(s.w * gridFt);
  return `${s.label} ${ft}x${ft} ft`;
}

/** `1x1`, `0.5x0.5` — the provenance footprint, in squares. */
export function footprintSquares(w, h = w) {
  return `${fmtNum(w)}x${fmtNum(h)}`;
}

export function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
