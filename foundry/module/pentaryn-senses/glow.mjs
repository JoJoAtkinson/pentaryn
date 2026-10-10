// Pentaryn Broken Glow — a light that breathes on a wandering wave, for a broken crystal.
//
// The light follows a sine-like wave, but no two swells match. Each time the wave reaches a peak it
// picks the next one: how deep the coming trough sinks, how high the following peak climbs, and how
// long each half takes. Size and brightness ride the same wave between fixed floors and ceilings:
//
//   size        from the token's own square up to the light's Dim radius (the ceiling, set on the
//               token or on the item that carries the light);
//   brightness  from a faint floor (it never goes out) up to a soft ceiling (it never blazes).
//
// Peaks are drawn from a distribution weighted low, so the light spends most of its time small and
// dim and only now and then swells toward the ceiling. That is what makes it read as broken.
//
// The size change is real, not painted on: the light's radius is re-initialized as it moves, so
// what the token can see (and what other tokens see of its glow) grows and shrinks with it.
//
// Every client computes the same wave from the server clock, so all players see the same swell.

const KEY = "pentaryn-brokenglow";

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
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A peak height, weighted toward low values. */
const nextPeak = (r) => 0.18 + 0.82 * r() ** 2;
/** The trough after a peak: somewhere between nothing and half the peak. */
const nextTrough = (r, peak) => peak * 0.5 * r();
const nextHalf = (r) => LIMITS.minHalf + (LIMITS.maxHalf - LIMITS.minHalf) * r();

/**
 * Build the segments of one epoch. Each segment is half a wave (peak to trough or trough to peak)
 * eased with a cosine. Every epoch starts and ends at the same rest level, so epochs join smoothly.
 */
function buildEpoch(seedKey, epochStart) {
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

// Per-source state: the ceiling radius Foundry gave the source, and the radius we last applied.
const state = new WeakMap();

function animateBrokenGlow(dt, { speed = 5, intensity = 5, reverse = false } = {}) {
  this.animateTime(dt, { speed, intensity, reverse });
  const now = game.time.serverTime * (speed / 5);
  const seedKey = this.sourceId ?? this.object?.id ?? "glow";
  const level = waveLevel(seedKey, now);

  const co = this.layers.coloration.shader;
  const il = this.layers.illumination.shader;
  co.uniforms.brightnessPulse = il.uniforms.brightnessPulse = brightnessFor(level);

  // Size. Foundry re-initializes the source from the document (the ceiling) whenever the token
  // refreshes; anything that isn't our last applied radius is a fresh ceiling.
  let st = state.get(this);
  if (!st || this.data.dim !== st.applied) st = { ceiling: this.data.dim, applied: null, at: 0 };
  state.set(this, st);
  const ext = this.data.externalRadius ?? 0;
  const floor = ext + LIMITS.minFeet * canvas.dimensions.distancePixels;
  if (st.ceiling <= floor) return;
  const radius = Math.round(floor + (st.ceiling - floor) * level);
  const stale = st.applied === null;
  if (!stale && (Math.abs(radius - st.applied) < 3 || (now - st.at) < 50)) return;
  st.applied = radius;
  st.at = now;
  this.initialize({ dim: radius, bright: Math.min(this.data.bright ?? 0, radius) });
  canvas.perception.update({ refreshLighting: true, refreshVision: true });
}

/** Add the animation to CONFIG. Runs at init; safe to call again on a live client. */
export function register() {
  const shaders = foundry.canvas.rendering.shaders;

  class BrokenGlowIlluminationShader extends shaders.TorchIlluminationShader {
    /** @override */
    static _createFragmentShader() {
      return `
      ${this.SHADER_HEADER}
      ${this.PERCEIVED_BRIGHTNESS}

      void main() {
        ${this.FRAGMENT_BEGIN}
        ${this.TRANSITION}
        ${this.ADJUSTMENTS}
        ${this.FALLOFF}
        depth *= brightnessPulse;
        ${this.FRAGMENT_END}
      }`;
    }

    /** @override */
    static get defaultUniforms() {
      return { ...super.defaultUniforms, brightnessPulse: 1 };
    }
  }

  CONFIG.Canvas.lightAnimations[KEY] = {
    label: "Broken glow (wandering)",
    animation: animateBrokenGlow,
    illuminationShader: BrokenGlowIlluminationShader,
    colorationShader: shaders.TorchColorationShader
  };
}

Hooks.once("init", register);
