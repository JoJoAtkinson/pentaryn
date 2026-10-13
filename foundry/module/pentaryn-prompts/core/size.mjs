/**
 * pentaryn-prompts core — marker sizes, dnd5e size widths, footprint labels, the size words a spec
 * may use, and CR parsing.
 * PURE: no Foundry global. Split out of geometry-core.mjs, which re-exports the marker-size,
 * dnd5e-width and footprint names. The rest are not on that barrel: fmtNum is core-only (core/text,
 * placement, gather-text); SIZE_WORDS and parseCr are imported from here by replace.mjs and
 * actor-patch-adapter.mjs (which re-exports SIZE_WORDS); PC_SIZE_WORDS by character-adapter.mjs.
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

/** dnd5e size key → token width in squares (the system's own table, read off SIZES so node can use it). */
export const DND_SIZE_WIDTH = Object.freeze(Object.fromEntries(SIZES.map(s => [s.dnd, s.w])));

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

/** Size words a spec may use → the dnd5e size key (replace's npc size, patch.size). */
export const SIZE_WORDS = Object.freeze({ tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg",
  huge: "huge", gargantuan: "grg", grg: "grg" });

/** The player-character subset (2024 species are tiny to large): SIZE_WORDS without huge or gargantuan. */
const PC_DND = SIZES.slice(0, SIZES.findIndex(s => s.dnd === "lg") + 1).map(s => s.dnd);
export const PC_SIZE_WORDS = Object.freeze(Object.fromEntries(Object.entries(SIZE_WORDS).filter(([, dnd]) => PC_DND.includes(dnd))));

/** "1/4" | 0.25 | "3" → a number, or null. */
export function parseCr(cr) {
  if (cr === null || cr === undefined || cr === "") return null;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(cr));
  const n = m ? Number(m[1]) / Number(m[2]) : Number(cr);
  return Number.isFinite(n) ? n : null;
}
