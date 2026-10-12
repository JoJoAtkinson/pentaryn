/**
 * pentaryn-prompts core — the 2024 DMG encounter budget.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

/* ── Encounter budget (2024 DMG, restated from dnd5e's CONFIG.DND5E.ENCOUNTER_DIFFICULTY) ── */

/** XP per character by level: [low, moderate, high]. Index = character level. */
export const ENCOUNTER_XP = Object.freeze([
  [0, 0, 0], [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
  [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
  [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
  [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]
]);

/** XP by CR (dnd5e CR_EXP_LEVELS for whole CRs; 1/8, 1/4, 1/2 added). */
export function crXp(cr) {
  const c = Number(cr);
  if (!Number.isFinite(c) || c < 0) return 0;
  if (c === 0) return 10;
  if (c <= 0.125) return 25;
  if (c <= 0.25) return 50;
  if (c <= 0.5) return 100;
  const T = [10, 200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 7200, 8400, 10000, 11500, 13000, 15000,
    18000, 20000, 22000, 25000, 33000, 41000, 50000, 62000, 75000, 90000, 105000, 120000, 135000, 155000];
  return T[Math.min(30, Math.floor(c))];
}

/**
 * Party → per-encounter budget. `party` is `{level, size}`, `"4x5"` (size x level) or an array of
 * levels. Mixed levels sum per character. Returns null when it cannot be read.
 */
export function parseParty(party) {
  if (!party) return null;
  let levels = null;
  const okLen = n => Number.isInteger(n) && n > 0 && n <= 0xFFFFFFFF;
  if (Array.isArray(party)) levels = party.map(Number);
  else if (typeof party === "string") {
    const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(party);
    if (m) { const n = Number(m[1]); if (okLen(n)) levels = Array(n).fill(Number(m[2])); }
  } else if (typeof party === "object") {
    const n = Number(party.size ?? 4), l = Number(party.level);
    if (okLen(n) && l > 0) levels = Array(n).fill(l);
  }
  if (!levels?.length || levels.some(l => !(l >= 1 && l <= 20))) return null;
  return levels.map(l => Math.round(l));
}

export function xpBudget(party) {
  const levels = parseParty(party);
  if (!levels) return null;
  const sum = k => levels.reduce((s, l) => s + ENCOUNTER_XP[l][k], 0);
  const same = levels.every(l => l === levels[0]);
  return { size: levels.length, level: same ? levels[0] : levels.join("/"), low: sum(0), moderate: sum(1), high: sum(2) };
}

/** Where an XP total sits against a budget: "under low" | "low" | "moderate" | "high" | "over high". */
export function difficulty(xp, budget) {
  if (!budget) return null;
  if (xp < budget.low) return "under low";
  if (xp < budget.moderate) return "low";
  if (xp < budget.high) return "moderate";
  if (xp <= budget.high * 1.1) return "high";
  return "over high";
}
