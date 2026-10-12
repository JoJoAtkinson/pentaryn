/**
 * W3-SE3 (wave-3 report, Open for Joe; overnight FX item 8): syncAll batches its writes, as
 * resetSight does: every prototype in one Actor.updateDocuments, every token in one
 * updateEmbeddedDocuments per scene. What is written is exactly the union of the per-actor plans
 * (the legacy oracle), over 60 seeded multi-actor worlds; only the number of calls drops.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeScene } from "./kit/foundry-stub.mjs";
import { boot, standardWorld, makeActor, makeTok, addEmbedded, settle, since, MODULE, NOW } from "./fixtures/world.mjs";
import { syncPlan } from "./fixtures/legacy-sync-plan.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld() });
await settle(mock);
const S = () => game.pentaryn.senses;

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

const LIGHTS = [{ bright: 0, dim: 0 }, { bright: 5, dim: 10 }, { bright: 20, dim: 40, angle: 360 }];
const FLAGS = [{}, { itemLight: true }, { itemLight: true, itemLightPrior: { bright: 3, dim: 6 } }, { spellLight: { source: "Actor.x.Item.y" } }];
const TORCH = { id: "itmBatTorch00001", name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: true } } };
const ITEMS = [[], [TORCH], [{ id: "itmBatShard00001", name: "Shard", flags: { [MODULE]: { light: { bright: 0, dim: 15 } } } }]];
const pick = (r, list) => structuredClone(list[Math.floor(r() * list.length)]);

function world(seed) {
  const r = rng(seed);
  const actors = [];
  for (let a = 0, n = 2 + Math.floor(r() * 4); a < n; a++) {
    actors.push(makeActor({ id: `actBat${seed}a${a}`.padEnd(16, "0"), name: `B${a}`, items: pick(r, ITEMS),
      prototypeToken: { light: pick(r, LIGHTS), flags: { [MODULE]: pick(r, FLAGS) } } }));
  }
  const scenes = [];
  for (let s = 0, n = 1 + Math.floor(r() * 3); s < n; s++) {
    const toks = [];
    for (let k = 0, m = Math.floor(r() * 7); k < m; k++) {
      const linked = r() < 0.5;
      toks.push(makeTok({
        id: `tokBat${seed}s${s}k${k}`.padEnd(16, "0"), name: "T", actorId: actors[Math.floor(r() * actors.length)].id, actorLink: linked,
        light: pick(r, LIGHTS), flags: { [MODULE]: pick(r, FLAGS) }, ...(linked ? {} : { synthetic: { items: pick(r, ITEMS) } }),
      }));
    }
    scenes.push(addEmbedded(makeScene({ id: `scnBat${seed}s${s}`.padEnd(16, "0"), tokens: toks })));
  }
  return { actors, scenes };
}

const WRITES = c => c.op === "Actor.updateDocuments" || c.op === "updateEmbedded" || (c.op === "update" && c.documentName === "Actor");

test("syncAll writes the union of the per-actor plans, in one prototype batch and one token batch per scene", async () => {
  const saved = { scenes: F.game.scenes, actors: F.game.actors };
  let multi = 0;
  try {
    for (let seed = 1; seed <= 60; seed++) {
      const { actors, scenes } = world(seed);
      F.game.scenes = new StubCollection(scenes);
      F.game.actors = new StubCollection(actors);
      const plans = actors.map(a => [a.id, syncPlan(a, scenes)]);
      const wantProto = Object.fromEntries(plans.filter(([, p]) => p.proto).map(([id, p]) => [id, F.plain(p.proto)]));
      const wantTokens = {};
      for (const [, p] of plans) for (const { scene, updates } of p.scenes) for (const u of updates) (wantTokens[scene] ??= {})[u._id] = F.plain(u);
      const wantDocs = Object.keys(wantProto).length + Object.values(wantTokens).reduce((n, s) => n + Object.keys(s).length, 0);
      const wantCalls = (Object.keys(wantProto).length ? 1 : 0) + Object.keys(wantTokens).length;

      const mark = F.calls.length;
      const n = await S().syncAll();
      const calls = since(mark).filter(WRITES);

      const gotProto = {};
      const gotTokens = {};
      for (const c of calls) {
        if (c.op === "Actor.updateDocuments") for (const { _id, ...ch } of c.updates) gotProto[_id] = ch;
        else if (c.op === "update") gotProto[c.id ?? c.uuid?.split(".")[1]] = c.changes;
        else for (const u of c.updates) (gotTokens[c.scene] ??= {})[u._id] = u;
      }
      assert.deepEqual(gotProto, wantProto, `seed ${seed}: prototypes`);
      assert.deepEqual(gotTokens, wantTokens, `seed ${seed}: tokens`);
      assert.equal(n, wantDocs, `seed ${seed}: documents written`);
      assert.equal(calls.length, wantCalls, `seed ${seed}: write calls (one prototype batch, one per scene)`);
      if (wantCalls < plans.reduce((k, [, p]) => k + (p.proto ? 1 : 0) + p.scenes.length, 0)) multi++;
      await settle(mock);   // the debounced per-actor re-syncs the updateActor hooks scheduled (converged)
    }
  } finally {
    F.game.scenes = saved.scenes;
    F.game.actors = saved.actors;
  }
  assert.ok(multi > 20, `the seeds exercise batching (${multi})`);
});

test("syncAll converged: no write call at all", async () => {
  const mark = F.calls.length;
  assert.equal(await S().syncAll(), 0);
  assert.deepEqual(since(mark).filter(WRITES), []);
});
