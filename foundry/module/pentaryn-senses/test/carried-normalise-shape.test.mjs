/**
 * FIX-3 forward fix of senses-edge-4. Foundry's LightData cleans the object it is handed IN PLACE
 * (DataModel#_initializeSource → cleanData fills every default into `data` and keeps it as
 * `_source`). normalise() handed it the item's own light flag, so the shard's 3-key profile grew
 * to all 15 LightData keys in memory; syncLight then wrote those 15 keys, and their
 * `animation: {type: null}` wiped the animation a doused torch had left on the token (the live
 * golden diff that reverted senses from main). normalise() must work on a copy: the flag keeps its
 * stored shape and the write is exactly the keys the profile sets.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, makeActor, settle, since, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

const DEFAULTS = {
  negative: false, priority: 0, alpha: 0.5, angle: 360, bright: 0, color: null, coloration: 1, dim: 0,
  attenuation: 0.5, luminosity: 0.5, saturation: 0, contrast: 0, shadows: 0,
  animation: { type: null, speed: 5, intensity: 5, reverse: false }, darkness: { min: 0, max: 1 },
};
/** Foundry's LightData as it really behaves: the source object is cleaned in place and kept. */
class LightData {
  constructor(data = {}) {
    for (const k of Object.keys(data)) if (!(k in DEFAULTS)) delete data[k];
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (v && typeof v === "object") data[k] = { ...structuredClone(v), ...(data[k] ?? {}) };
      else if (!(k in data)) data[k] = v;
      else if (k === "color") data.color = typeof data.color === "string" ? data.color.toLowerCase() : null;
    }
    this._source = data;
  }
  toObject() { return structuredClone(this._source); }
}
globalThis.foundry.data.LightData = LightData;

const SHARD = Object.freeze({ bright: 0, dim: 15, color: "#8844ff" });
const FLAME = { type: "torch", speed: 2, intensity: 2, reverse: false };

let seq = 0;
function bearer({ torchLit }) {
  return makeActor({
    id: `actShape${String(++seq).padStart(8, "0")}`, name: "Bearer",
    items: [
      { id: `itmShapeShard${String(seq).padStart(3, "0")}`, name: "Shard", flags: { [MODULE]: { light: { ...SHARD } } } },
      { id: `itmShapeTorch${String(seq).padStart(3, "0")}`, name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: torchLit } } },
    ],
  });
}
const shardOf = actor => actor.items.find(i => i.name === "Shard");
const torchOf = actor => actor.items.find(i => i.name === "Torch");
const protoWrites = mark => since(mark).filter(c => c.op === "update" && c.documentName === "Actor");

test("FIX-3 senses-edge-4: syncLight writes the shard's 3 keys, and its flag keeps that shape", async () => {
  const actor = bearer({ torchLit: false });
  const mark = F.calls.length;
  assert.equal(await S().syncLight(actor), 1);
  const [w] = protoWrites(mark);
  assert.deepEqual(w.changes["prototypeToken.light"], { ...SHARD }, "the write is the 3-key profile");
  assert.deepEqual(shardOf(actor).flags[MODULE].light, { ...SHARD }, "the item's flag is not expanded in memory");
  assert.equal(await S().syncLight(actor), 0, "and it converges");
});

test("FIX-3 senses-edge-4: a doused torch keeps its animation on the token", async () => {
  const actor = bearer({ torchLit: true });
  assert.equal(await S().syncLight(actor), 1, "the lit torch lights the token");
  assert.deepEqual(actor.prototypeToken.light.animation, FLAME);
  torchOf(actor).flags[MODULE].lit = false;                  // douse: the shard lights the token again
  const mark = F.calls.length;
  assert.equal(await S().syncLight(actor), 1);
  const [w] = protoWrites(mark);
  assert.deepEqual(Object.keys(w.changes["prototypeToken.light"]).sort(), ["bright", "color", "dim"]);
  assert.deepEqual(actor.prototypeToken.light.animation, FLAME, "the torch's animation is not nulled");
  assert.equal(actor.prototypeToken.light.dim, 15);
});
