// Pentaryn Broken Glow — the wave maths (PURE). The animation that drives a light source with it
// is ../glow.mjs, whose header tells the whole story. Every client computes the same wave from the
// server clock, so all players see the same swell.

/** Floors and ceilings of the wave's output. */
export const LIMITS = Object.freeze({
  minFeet: 0.5,       // beyond the token's edge at the lowest point: just its own square
  minBright: 0.3,     // never cuts out
  maxBright: 0.85,    // never too bright
  minHalf: 700,       // shortest rise or fall, ms
  maxHalf: 2400,      // longest rise or fall, ms
  epoch: 120_000      // the wave is rebuilt from the clock every two minutes (see waveLevel)
});

/** mulberry32: a small seeded generator, identical on every client. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A peak height, weighted toward low values. */
const nextPeak = (r) => 0.18 + 0.82 * r() ** 2;
/** The trough after a peak: somewhere between nothing and half the peak. */
const nextTrough = (r, peak) => peak * 0.5 * r();
const nextHalf = (r) => LIMITS.minHalf + (LIMITS.maxHalf - LIMITS.minHalf) * r();

let builds = 0;
/** How many epochs have been built since load (a test counter; finding -22a). */
export const epochBuilds = () => builds;

/**
 * Build the segments of one epoch. Each segment is half a wave (peak to trough or trough to peak)
 * eased with a cosine. Every epoch starts and ends at the same rest level, so epochs join smoothly.
 */
export function buildEpoch(seedKey, epochStart) {
  builds++;
  const r = rng(hashString(`${seedKey}:${epochStart}`));
  const end = epochStart + LIMITS.epoch;
  const rest = 0.12;
  const segs = [];
  let t = epochStart, level = rest, rising = true, peak = nextPeak(r);
  while (t < end) {
    let to = rising ? peak : nextTrough(r, peak);
    let d = nextHalf(r);
    // Close the epoch on the rest level rather than leaving a stub segment.
    if (end - (t + d) < LIMITS.minHalf) { d = end - t; to = rest; }
    segs.push({ t0: t, t1: t + d, from: level, to });
    t += d; level = to; rising = !rising;
    if (rising) peak = nextPeak(r);   // the height of the next swell; its depth is drawn at the peak
  }
  return segs;
}

const epochs = new Map();

/** The wave's level, 0..1, for one light at server time tMs. */
export function waveLevel(seedKey, tMs) {
  const start = Math.floor(tMs / LIMITS.epoch) * LIMITS.epoch;
  const key = `${seedKey}:${start}`;
  let segs = epochs.get(key);
  if (!segs) {
    segs = buildEpoch(seedKey, start);
    epochs.set(key, segs);
    if (epochs.size > 16) epochs.delete(epochs.keys().next().value);
  }
  const s = segs.find(g => tMs < g.t1) ?? segs.at(-1);
  const p = Math.min(Math.max((tMs - s.t0) / (s.t1 - s.t0), 0), 1);
  return s.from + (s.to - s.from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
}

/** Brightness for a level. */
export const brightnessFor = (level) => LIMITS.minBright + (LIMITS.maxBright - LIMITS.minBright) * level;
