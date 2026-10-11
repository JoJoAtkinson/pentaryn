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

import {
  LIMITS, rng, hashString, epochBuilds, buildEpoch, waveLevel, brightnessFor,
} from "./senses-core.mjs";

// The maths lives in core/glow.mjs; re-exported so this file's import surface is unchanged.
export { LIMITS, rng, hashString, epochBuilds, buildEpoch, waveLevel, brightnessFor };

const KEY = "pentaryn-brokenglow";

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

/** FEATURE: the animation is added at init (a raw handler, as it always was), or at once on a hot re-import. */
export function install(reg) {
  if (globalThis.game?.ready) register();
  else reg.once("init", register, { guard: false, label: "glow register" });
}

/** Nothing to undo: the CONFIG row stays until reload (a light using it would lose its animation). */
export function uninstall() {}
