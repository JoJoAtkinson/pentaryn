/**
 * Finding -11 (standalone): syncAll builds a tokensByActor index once; syncLight(actor, {index})
 * writes exactly what the scan (and the legacy plan oracle) writes, over 100 seeded worlds.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeScene } from "./kit/foundry-stub.mjs";
import { boot, standardWorld, makeActor, makeTok, addEmbedded, settle, since, MODULE, NOW } from "./fixtures/world.mjs";
import { syncPlan } from "./fixtures/legacy-sync-plan.mjs";

const core = await import("../senses-core.mjs");
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

test("tokensByActor: actor → [{scene, tokens}] in scene order, tokens in scene order", () => {
  const t = (id, actorId) => ({ id, actorId });
  const scenes = [{ id: "s1", tokens: [t("a", "A"), t("b", "B"), t("c", "A")] }, { id: "s2", tokens: [t("d", "B")] }, { id: "s3", tokens: [] }];
  const idx = core.tokensByActor(scenes);
  assert.deepEqual([...idx.keys()], ["A", "B"]);
  assert.deepEqual(idx.get("A").map(e => [e.scene.id, e.tokens.map(x => x.id)]), [["s1", ["a", "c"]]]);
  assert.deepEqual(idx.get("B").map(e => [e.scene.id, e.tokens.map(x => x.id)]), [["s1", ["b"]], ["s2", ["d"]]]);
  assert.equal(core.tokensByActor(null).size, 0);
});

test("syncLight with the index == the legacy plan, 100 seeded worlds; a token deleted after indexing is skipped", async () => {
  const saved = F.game.scenes;
  const pick = (r, list) => structuredClone(list[Math.floor(r() * list.length)]);
  const LIGHTS = [{ bright: 0, dim: 0 }, { bright: 5, dim: 10 }, { bright: 20, dim: 40, angle: 360 }];
  const FLAGS = [{}, { itemLight: true }, { itemLight: true, itemLightPrior: { bright: 3, dim: 6 } }, { spellLight: { source: "Actor.x.Item.y" } }];
  const TORCH = { id: "itmIdxTorch00001", name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: true } } };
  const ITEMS = [[], [TORCH], [{ id: "itmIdxShard00001", name: "Shard", flags: { [MODULE]: { light: { bright: 0, dim: 15 } } } }]];
  let writes = 0;
  try {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const actorId = "actIdx0000000001";
      const actor = makeActor({ id: actorId, name: "Idx", items: pick(r, ITEMS), prototypeToken: { light: pick(r, LIGHTS), flags: { [MODULE]: pick(r, FLAGS) } } });
      const scenes = [];
      for (let s = 0, n = 1 + Math.floor(r() * 3); s < n; s++) {
        const toks = [];
        for (let k = 0, m = Math.floor(r() * 5); k < m; k++) {
          const linked = r() < 0.5;
          toks.push(makeTok({
            id: `tokIdx${seed}s${s}k${k}`.padEnd(16, "0"), name: "T", actorId: r() < 0.7 ? actorId : "actOther00000001", actorLink: linked,
            light: pick(r, LIGHTS), flags: { [MODULE]: pick(r, FLAGS) }, ...(linked ? {} : { synthetic: { items: pick(r, ITEMS) } }),
          }));
        }
        scenes.push(addEmbedded(makeScene({ id: `scnIdx${seed}s${s}`.padEnd(16, "0"), tokens: toks })));
      }
      F.game.scenes = new StubCollection(scenes);
      F.game.actors.set(actorId, actor);
      const index = core.tokensByActor(scenes);
      const plan = syncPlan(actor, scenes);
      const mark = F.calls.length;
      await S().syncLight(actor, { index });
      F.game.actors.delete(actorId);
      const calls = since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded");
      const want = [...(plan.proto ? [["proto", F.plain(plan.proto)]] : []), ...plan.scenes.map(s => [s.scene, F.plain(s.updates)])];
      assert.deepEqual(calls.map(c => c.op === "update" ? ["proto", c.changes] : [c.scene, c.updates]), want, `seed ${seed}`);
      writes += calls.length;
    }
    // a token deleted between indexing and the sync is not written
    const actor = makeActor({ id: "actIdxGone000001", name: "Gone", items: [TORCH] });
    const tok = makeTok({ id: "tokIdxGone000001", name: "G", actorId: actor.id, actorLink: true });
    const scene = addEmbedded(makeScene({ id: "scnIdxGone000001", tokens: [tok] }));
    F.game.scenes = new StubCollection([scene]);
    F.game.actors.set(actor.id, actor);
    const index = core.tokensByActor([scene]);
    scene.tokens.delete(tok.id);
    const mark = F.calls.length;
    await S().syncLight(actor, { index });
    F.game.actors.delete(actor.id);
    assert.deepEqual(since(mark).filter(c => c.op === "updateEmbedded"), []);
  } finally {
    F.game.scenes = saved;
  }
  assert.ok(writes > 50, `the seeds exercise writes (${writes})`);
  await settle(mock);
});
