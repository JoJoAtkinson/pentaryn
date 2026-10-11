/**
 * Characterisation (senses checkpoint, wave 3): the broken glow (glow.mjs) — the wave maths
 * (finding -21), the init registration and the per-frame animation. Frozen once committed: during
 * the refactor only import paths may change (glow.mjs keeps re-exporting the maths, plan step 3).
 *
 * glow.mjs registers `Hooks.once("init", register)` at import today, so the kit stub goes in first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";

const F = await installFoundry({ modules: ["pentaryn-senses"] });
class TorchIlluminationShader {
  static SHADER_HEADER = "/*header*/";
  static PERCEIVED_BRIGHTNESS = "/*perceived*/";
  static FRAGMENT_BEGIN = "/*begin*/";
  static TRANSITION = "/*transition*/";
  static ADJUSTMENTS = "/*adjust*/";
  static FALLOFF = "/*falloff*/";
  static FRAGMENT_END = "/*end*/";
  static get defaultUniforms() { return { torchBase: 1 }; }
}
class TorchColorationShader {}
F.foundry.canvas.rendering = { shaders: { TorchIlluminationShader, TorchColorationShader } };
F.CONFIG.Canvas = { lightAnimations: {} };

const glow = await import("../glow.mjs");
const { LIMITS, waveLevel, brightnessFor } = glow;
const r9 = n => Math.round(n * 1e9) / 1e9;

test("glow.mjs exports (names)", () => {
  for (const n of ["LIMITS", "waveLevel", "brightnessFor", "register"]) assert.equal(n in glow, true, n);
});

test("LIMITS are frozen and today's values", () => {
  assert.equal(Object.isFrozen(LIMITS), true);
  assert.deepEqual({ ...LIMITS }, { minFeet: 0.5, minBright: 0.3, maxBright: 0.85, minHalf: 700, maxHalf: 2400, epoch: 120000 });
});

test("brightnessFor: floor, ceiling, middle, and it does not clamp", () => {
  assert.equal(brightnessFor(0), 0.3);
  assert.equal(r9(brightnessFor(1)), 0.85); // 0.8500000000000001 in floating point
  assert.equal(r9(brightnessFor(0.5)), 0.575);
  assert.equal(r9(brightnessFor(2)), 1.4);
  assert.equal(r9(brightnessFor(-1)), -0.25);
});

const KEYS = ["tok1", "Scene.s1.Token.t1", "glow", ""];
const TIMES = [0, 350, 1000, 60000, 119999, 120000, 240123, 1e12 + 7, -5000];

test("waveLevel golden: keys × server times (rounded 1e-9)", () => {
  const rows = [];
  for (const key of KEYS) for (const t of TIMES) rows.push({ key, t, level: r9(waveLevel(key, t)) });
  pinJSON("glow", rows, import.meta.url);
});

test("waveLevel invariants: within [0, 1], rest level at every epoch start, continuous across a boundary", () => {
  for (const key of ["tok1", "lamp-7"]) {
    for (let t = 0; t < 600000; t += 997) {
      const v = waveLevel(key, t);
      assert.ok(v >= 0 && v <= 1, `${key}@${t} = ${v}`);
    }
    for (const start of [0, 120000, 240000]) assert.equal(r9(waveLevel(key, start)), 0.12, `rest at ${start}`);
    const before = waveLevel(key, 119999), after = waveLevel(key, 120000);
    assert.ok(Math.abs(before - after) < 0.01, `jump ${before} → ${after}`);
  }
});

test("waveLevel is a pure function of (key, time): interleaving 40 keys never changes a value (-22a)", () => {
  const keys = Array.from({ length: 40 }, (_, i) => `light-${i}`);
  const times = [5, 61000, 119000, 130000, 250000];
  const single = new Map();
  for (const k of keys) for (const t of times) single.set(`${k}@${t}`, waveLevel(k, t));
  for (const t of times) for (const k of keys) assert.equal(waveLevel(k, t), single.get(`${k}@${t}`), `${k}@${t}`);
  // the same key after the 16-entry cache has cycled
  for (const k of keys) for (const t of times) assert.equal(waveLevel(k, t), single.get(`${k}@${t}`));
});

// Registration timing (once init, through the entry) is pinned by glue.test (b) and hooks.json;
// this file calls register() directly so it does not depend on how glow.mjs is installed.
test("register() adds the animation; the illumination shader adds brightnessPulse", () => {
  assert.deepEqual(F.CONFIG.Canvas.lightAnimations, {}, "nothing before register()");
  glow.register();
  const row = F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"];
  assert.deepEqual(Object.keys(F.CONFIG.Canvas.lightAnimations), ["pentaryn-brokenglow"]);
  assert.equal(row.label, "Broken glow (wandering)");
  assert.equal(typeof row.animation, "function");
  assert.equal(row.animation.name, "animateBrokenGlow");
  assert.equal(row.colorationShader, TorchColorationShader);
  assert.equal(Object.getPrototypeOf(row.illuminationShader), TorchIlluminationShader);
  assert.equal(row.illuminationShader.name, "BrokenGlowIlluminationShader");
  assert.deepEqual(row.illuminationShader.defaultUniforms, { torchBase: 1, brightnessPulse: 1 });
  const src = row.illuminationShader._createFragmentShader().replace(/\s+/g, " ").trim();
  assert.equal(src, "/*header*/ /*perceived*/ void main() { /*begin*/ /*transition*/ /*adjust*/ /*falloff*/ depth *= brightnessPulse; /*end*/ }");
  // safe to call again on a live client: replaces the row
  glow.register();
  assert.notEqual(F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"], row);
  assert.equal(Object.keys(F.CONFIG.Canvas.lightAnimations).length, 1);
});

/** A stand-in light source: records animateTime, initialize and the shader uniforms. */
function source({ sourceId = "tok1", objectId, dim = 400, bright = 200, externalRadius = 50 } = {}) {
  const log = [];
  const src = {
    sourceId,
    object: objectId ? { id: objectId } : undefined,
    data: { dim, bright, externalRadius },
    layers: { coloration: { shader: { uniforms: {} } }, illumination: { shader: { uniforms: {} } } },
    animateTime(dt, opts) { log.push({ op: "animateTime", dt, opts }); },
    initialize(d) { log.push({ op: "initialize", d }); Object.assign(this.data, d); },
  };
  return { src, log };
}

test("the animation: brightness every frame; radius between the token's edge and Dim, at most every 50 ms", () => {
  const anim = F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"].animation;
  const perception = [];
  F.canvas.dimensions = { distancePixels: 20 };
  F.canvas.perception = { update: o => perception.push(o) };
  const { src, log } = source();
  const frames = [];
  for (const serverTime of [1000, 1010, 1060, 1500, 2600, 2610, 9000]) {
    F.game.time = { serverTime };
    anim.call(src, 16, { speed: 5, intensity: 5 });
    frames.push({
      serverTime,
      pulse: r9(src.layers.illumination.shader.uniforms.brightnessPulse),
      samePulse: src.layers.coloration.shader.uniforms.brightnessPulse === src.layers.illumination.shader.uniforms.brightnessPulse,
      dim: src.data.dim, bright: src.data.bright,
    });
  }
  // the speed option scales the clock; no sourceId falls back to the object id, then "glow"
  const { src: s2, log: l2 } = source({ sourceId: undefined, objectId: "obj9", dim: 300 });
  F.game.time = { serverTime: 4000 };
  anim.call(s2, 16, { speed: 10, intensity: 2, reverse: true });
  const { src: s3 } = source({ sourceId: undefined, dim: 300 });
  anim.call(s3, 16);
  // a light whose Dim is inside the floor never resizes
  const { src: s4, log: l4 } = source({ dim: 40, externalRadius: 50 });
  anim.call(s4, 16);
  pinJSON("glow-animation", {
    frames,
    log: log.map(e => (e.op === "initialize" ? { op: e.op, d: e.d } : { op: e.op, dt: e.dt, opts: e.opts })),
    perception,
    speed10: { pulse: r9(s2.layers.illumination.shader.uniforms.brightnessPulse), log: l2, expect: r9(brightnessFor(waveLevel("obj9", 8000))) },
    fallbackKey: { pulse: r9(s3.layers.illumination.shader.uniforms.brightnessPulse), expect: r9(brightnessFor(waveLevel("glow", 4000))) },
    insideFloor: { log: l4, dim: s4.data.dim },
  }, import.meta.url);
});

// KNOWN (new at the senses checkpoint, no audit id yet): animateBrokenGlow writes
// `bright: Math.min(this.data.bright, radius)`, and Foundry's BaseEffectSource#initialize MERGES into
// `this.data`, so the bright radius only ever shrinks — after the first trough it stays at the trough
// radius until a token refresh re-initializes the source from the document. The golden above pins
// today's ratchet (t=9000: dim 114, bright 101). The fix reads the document's bright (the ceiling's
// partner) instead of the last applied value; flipping this todo is a [declared] visual change.
test("bright follows the wave back up (KNOWN: it ratchets down)", { todo: "KNOWN: glow bright radius ratchets down between token refreshes" }, () => {
  const anim = F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"].animation;
  F.canvas.dimensions = { distancePixels: 20 };
  F.canvas.perception = { update() {} };
  const { src } = source();
  for (const serverTime of [1000, 2600, 9000]) {
    F.game.time = { serverTime };
    anim.call(src, 16, { speed: 5, intensity: 5 });
  }
  assert.equal(src.data.bright, Math.min(200, src.data.dim));
});

// Added after the checkpoint (guide step 1.5, finding -22a): many lights at once. 40 keys × 5 times
// in one epoch, interleaved, each level equal to a fresh single-key computation; and the number of
// epoch builds that costs. KNOWN (-22a): the shared 16-entry cache thrashes, so every lookup
// rebuilds — 200 builds. The -22 fix (a per-source cache) flips this row to ≤ 40.
test("waveLevel interleaved over 40 keys: values exact; epoch builds counted (KNOWN -22a: 200)", () => {
  const { buildEpoch, epochBuilds } = glow;
  const levelFrom = (segs, t) => {
    const s = segs.find(g => t < g.t1) ?? segs.at(-1);
    const p = Math.min(Math.max((t - s.t0) / (s.t1 - s.t0), 0), 1);
    return s.from + (s.to - s.from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
  };
  const keys = Array.from({ length: 40 }, (_, i) => `src${i}`);
  const times = [480_100, 480_350, 481_000, 530_000, 599_999];
  const got = [];
  const before = epochBuilds();
  for (const t of times) for (const k of keys) got.push([k, t, waveLevel(k, t)]);
  const builds = epochBuilds() - before;
  for (const [k, t, level] of got) assert.equal(level, levelFrom(buildEpoch(k, 480_000), t), `${k}@${t}`);
  assert.equal(builds, 200, "KNOWN (-22a): a rebuild per lookup");
});
