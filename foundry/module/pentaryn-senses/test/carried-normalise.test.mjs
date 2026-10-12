/**
 * Final review (senses, senses-edge-4): a hand-authored shard light (flags.pentaryn-senses.light) that
 * Foundry normalises (an upper-case colour, a key LightData does not know) never converged, so every
 * syncLight / syncAll rewrote the token and counted it again. The "already applied" check now compares
 * the profile as LightData stores it; the write still sends the raw profile.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeActor, settle, since, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

/** Foundry's LightData, near enough: unknown keys dropped, defaults filled, colours lower-cased. */
const DEFAULTS = {
  negative: false, priority: 0, alpha: 0.5, angle: 360, bright: 0, color: null, coloration: 1, dim: 0,
  attenuation: 0.5, luminosity: 0.5, saturation: 0, contrast: 0, shadows: 0,
  animation: { type: null, speed: 5, intensity: 5, reverse: false }, darkness: { min: 0, max: 1 },
};
class LightData {
  constructor(d = {}) {
    const src = structuredClone(DEFAULTS);
    for (const [k, v] of Object.entries(d ?? {})) {
      if (!(k in DEFAULTS)) continue;
      if (DEFAULTS[k] && typeof DEFAULTS[k] === "object") {
        for (const [kk, vv] of Object.entries(v ?? {})) if (kk in DEFAULTS[k]) src[k][kk] = vv;
      } else if (k === "color") src.color = typeof v === "string" ? v.toLowerCase() : null;
      else if (typeof DEFAULTS[k] === "number") src[k] = Number(v);
      else src[k] = v;
    }
    this._source = src;
  }
  toObject() { return structuredClone(this._source); }
}
globalThis.foundry.data.LightData = LightData;

const SHARD = { bright: 0, dim: 15, color: "#8844FF", glimmer: true };

let seq = 0;
function shardBearer(protoLight) {
  return makeActor({
    id: `actNorm${String(++seq).padStart(9, "0")}`, name: "Bearer",
    items: [{ id: `itmNormShard${String(seq).padStart(4, "0")}`, name: "Shard", flags: { [MODULE]: { light: SHARD } } }],
    prototypeToken: { light: protoLight, flags: { [MODULE]: { itemLight: true } } },
  });
}

test("senses-edge-4: a shard light Foundry has normalised counts as already applied", async () => {
  const stored = new LightData(SHARD).toObject();                  // what Foundry keeps after the first write
  const actor = shardBearer(stored);
  const mark = F.calls.length;
  assert.equal(await S().syncLight(actor), 0, "converged: no rewrite, nothing counted");
  assert.equal(await S().syncLight(actor), 0);
  assert.equal(since(mark).filter(c => c.op === "update" && c.documentName === "Actor").length, 0);
});

test("senses-edge-4: a key the profile does not set (a hand-set animation) does not stop convergence", async () => {
  const stored = new LightData({ ...SHARD, animation: { type: "pulse", speed: 3 } }).toObject();
  assert.equal(await S().syncLight(shardBearer(stored)), 0);
});

test("senses-edge-4: a light that differs is still written, and the write is the raw profile", async () => {
  const actor = shardBearer(new LightData({ bright: 0, dim: 10, color: "#8844ff" }).toObject());
  const mark = F.calls.length;
  assert.equal(await S().syncLight(actor), 1);
  const [w] = since(mark).filter(c => c.op === "update" && c.documentName === "Actor");
  assert.deepEqual(w.changes["prototypeToken.light"], SHARD);
});
