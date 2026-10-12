/**
 * Characterisation (senses checkpoint, wave 3): lights carried by items (senses.mjs) as the active
 * GM — the token/prototype update rule (finding -12) against a verbatim oracle, the scene/token
 * write order (finding -11) against an oracle over 100 seeded worlds, and the debounced hooks
 * (glue case f). Frozen once committed: during the refactor only import paths may change.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { StubCollection } from "./kit/foundry-stub.mjs";
import { boot, standardWorld, makeActor, makeTok, makeItem, addEmbedded, flush, settle, since, ID, MODULE, NOW } from "./fixtures/world.mjs";
import { makeScene } from "./kit/foundry-stub.mjs";
import { lightUpdate } from "./fixtures/legacy-light-update.mjs";
import { syncPlan } from "./fixtures/legacy-sync-plan.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ world: standardWorld({ heroItems: [{ id: ID.torch, name: "Torch", system: { identifier: "torch" } }, { id: ID.shard, name: "Glowstone shard", system: {} }] }) });
await settle(mock);
const S = () => game.pentaryn.senses;
const P = `flags.${MODULE}`;

const TORCH = { id: "itmRowTorch00001", name: "Torch", system: { identifier: "torch" }, flags: { [MODULE]: { lit: true } } };
const torchLight = () => S().carriedLight({ items: [makeItem(TORCH)] });

/** Run the live syncLight on an off-world actor whose prototype is `proto`; return what it wrote. */
let rowSeq = 0;
async function liveProto(proto, items) {
  const actor = makeActor({ id: `actRow${String(++rowSeq).padStart(10, "0")}`, name: "Row", items, prototypeToken: proto });
  const mark = F.calls.length;
  const n = await S().syncLight(actor);
  const writes = since(mark).filter(c => c.op === "update" && c.documentName === "Actor");
  assert.ok(writes.length === n && n <= 1);
  if (!writes.length) return null;
  const out = {};
  for (const [k, v] of Object.entries(writes[0].changes)) out[k.replace(/^prototypeToken\./, "")] = v;
  return out;
}

const plain = v => F.plain(v);

/** Foundry's LightData, near enough: fields on the instance, toObject() a plain copy. */
class LightData {
  constructor(d) { Object.assign(this, d); }
  toObject() { return JSON.parse(JSON.stringify(this)); }
}

test("lightUpdate rule (-12): every row, live == oracle", async () => {
  const lit = [TORCH];
  const rows = [
    ["spellLight owns the token", { light: { dim: 0 }, flags: { [MODULE]: { spellLight: { source: "x" } } } }, lit],
    ["equal light and itemLight true → nothing", { light: torchLight(), flags: { [MODULE]: { itemLight: true } } }, lit],
    ["equal light but itemLight false → write, and the equal light is kept as the prior", { light: torchLight(), flags: {} }, lit],
    ["itemLight false over a hand-set 5/10 → prior kept", { light: { bright: 5, dim: 10, color: "#00ff00" }, flags: {} }, lit],
    ["itemLight false over 0/0 → no prior", { light: { bright: 0, dim: 0 }, flags: {} }, lit],
    ["dim only > 0 → prior", { light: { bright: 0, dim: 3 }, flags: {} }, lit],
    ["string radii count", { light: { bright: "2", dim: "0" }, flags: {} }, lit],
    ["no carried light, itemLight true, prior → prior back, prior deleted", { light: torchLight(), flags: { [MODULE]: { itemLight: true, itemLightPrior: { bright: 5, dim: 10 } } } }, []],
    ["no carried light, itemLight true, no prior → DARK", { light: torchLight(), flags: { [MODULE]: { itemLight: true } } }, []],
    ["no carried light, itemLight false → nothing", { light: { bright: 5, dim: 10 }, flags: {} }, []],
    ["no carried light, itemLight 'true' (string) → nothing", { light: { bright: 5, dim: 10 }, flags: { [MODULE]: { itemLight: "true" } } }, []],
    ["light as a LightData (toObject)", { light: new LightData({ bright: 7, dim: 14 }), flags: {} }, lit],
    ["no flags at all", { light: { bright: 1, dim: 2 } }, lit],
    ["a quantity-0 torch gives nothing", { light: { bright: 1, dim: 2 }, flags: {} }, [{ ...TORCH, id: "itmRowTorch00002", system: { identifier: "torch", quantity: 0 } }]],
    ["a shard's fixed light flag", { light: { bright: 0, dim: 0 }, flags: {} }, [{ id: "itmRowShard00001", name: "Shard", flags: { [MODULE]: { light: { bright: 0, dim: 15, color: "#8844ff" } } } }]],
    ["the brightest of two wins", { light: { bright: 0, dim: 0 }, flags: {} }, [TORCH, { id: "itmRowLamp000001", name: "Lamp", system: { identifier: "lamp" }, flags: { [MODULE]: { lit: true } } }]],
  ];
  const table = [];
  for (const [name, proto, items] of rows) {
    const actorItems = items.map(d => makeItem(d));
    const want = lightUpdate(proto, S().carriedLight({ items: actorItems }));
    const got = await liveProto(proto, items);
    assert.deepEqual(plain(got), plain(want), name);
    table.push({ name, write: plain(got) });
  }
  pinJSON("carried-rule", table, import.meta.url);
});

test("lightUpdate rule without `_del` (v13): the prior is cleared with a null VALUE, not -=", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "_del");
  delete globalThis._del;
  try {
    const proto = { light: { bright: 20, dim: 40 }, flags: { [MODULE]: { itemLight: true, itemLightPrior: { bright: 5, dim: 10 } } } };
    const want = lightUpdate(proto, null);
    const got = await liveProto(proto, []);
    assert.deepEqual(got, { light: { bright: 5, dim: 10 }, [`${P}.itemLight`]: false, [`${P}.itemLightPrior`]: null });
    assert.deepEqual(got, want);
  } finally {
    Object.defineProperty(globalThis, "_del", saved);
  }
});

test("syncLight(hero): prototype first, then each scene in order; linked tokens take the actor's light", async () => {
  const hero = game.actors.get(ID.hero);
  hero.items.get(ID.torch).flags[MODULE] = { lit: true };
  const plan = syncPlan(hero, game.scenes);
  const mark = F.calls.length;
  const n = await S().syncLight(hero);
  const calls = since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded");
  assert.equal(n, 3);
  assert.deepEqual(calls.map(c => c.op === "update" ? ["proto", c.changes] : [c.scene, c.updates]),
    [["proto", plain(plan.proto)], ...plan.scenes.map(s => [s.scene, plain(s.updates)])]);
  pinJSON("carried-hero", calls, import.meta.url);
  await settle(mock);
});

test("syncLight: the unlinked token reads its OWN items, not the base actor's", async () => {
  const goblin = game.actors.get(ID.goblin);
  const mark = F.calls.length;
  const n = await S().syncLight(goblin);
  assert.equal(n, 0, "converged at ready: the Cellar goblin is lit by its own torch, the Road goblin has none");
  goblin.items.set("itmBaseTorch0001", Object.assign(makeItem({ ...TORCH, id: "itmBaseTorch0001" }, goblin)));
  const n2 = await S().syncLight(goblin);
  const calls = since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded");
  assert.equal(n2, 1, "only the prototype: neither unlinked token reads the base actor's torch");
  assert.deepEqual(calls.map(c => c.op === "update" ? c.uuid : c.scene), [`Actor.${ID.goblin}`]);
  goblin.items.delete("itmBaseTorch0001");
  await S().syncLight(goblin);
  await settle(mock);
});

/** mulberry32 */
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

test("syncLight == the legacy plan over 100 seeded worlds (-11 equivalence base)", async () => {
  const savedScenes = F.game.scenes;
  const pick = (r, list) => structuredClone(list[Math.floor(r() * list.length)]);
  const LIGHTS = [null, { bright: 0, dim: 0 }, { bright: 5, dim: 10 }, { bright: 20, dim: 40, angle: 360 }];
  const FLAGS = [{}, { itemLight: true }, { itemLight: true, itemLightPrior: { bright: 3, dim: 6 } }, { spellLight: { source: "Actor.x.Item.y" } }];
  const ITEMS = [[], [TORCH], [{ ...TORCH, flags: { [MODULE]: { lit: false } } }], [{ id: "itmShardSeed0001", name: "Shard", flags: { [MODULE]: { light: { bright: 0, dim: 15 } } } }]];
  let totalWrites = 0;
  try {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const actorId = "actSeed000000001";
      const actor = makeActor({ id: actorId, name: "Seed", items: pick(r, ITEMS), prototypeToken: { light: pick(r, LIGHTS) ?? { bright: 0, dim: 0 }, flags: { [MODULE]: { ...pick(r, FLAGS) } } } });
      const scenes = [];
      const nScenes = 1 + Math.floor(r() * 3);
      for (let s = 0; s < nScenes; s++) {
        const toks = [];
        const nToks = Math.floor(r() * 5);
        for (let k = 0; k < nToks; k++) {
          const mine = r() < 0.7;
          const linked = r() < 0.5;
          toks.push(makeTok({
            id: `tokSeed${seed}s${s}k${k}`.padEnd(16, "0"), name: "T", actorId: mine ? actorId : "actOther00000001", actorLink: linked,
            light: pick(r, LIGHTS) ?? { bright: 0, dim: 0 }, flags: { [MODULE]: { ...pick(r, FLAGS) } },
            ...(linked ? {} : { synthetic: { items: pick(r, ITEMS) } }),
          }));
        }
        scenes.push(addEmbedded(makeScene({ id: `scnSeed${seed}s${s}`.padEnd(16, "0"), tokens: toks })));
      }
      F.game.scenes = new StubCollection(scenes);
      // a linked token's `actor` getter reads game.actors: register this world's actor for the run
      F.game.actors.set(actorId, actor);
      const plan = syncPlan(actor, scenes);
      const mark = F.calls.length;
      await S().syncLight(actor);
      F.game.actors.delete(actorId);
      const calls = since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded");
      const want = [...(plan.proto ? [["proto", plain(plan.proto)]] : []), ...plan.scenes.map(s => [s.scene, plain(s.updates)])];
      assert.deepEqual(calls.map(c => c.op === "update" ? ["proto", c.changes] : [c.scene, c.updates]), want, `seed ${seed}`);
      totalWrites += calls.length;
    }
  } finally {
    F.game.scenes = savedScenes;
  }
  assert.ok(totalWrites > 50, `the seeds exercise writes (${totalWrites})`);
  await settle(mock); // the last seed actor's debounced re-sync: converged, writes nothing
});

test("hooks (glue f): a burst of three within 250 ms is one sync; nothing before 250 ms", async () => {
  const hero = game.actors.get(ID.hero);
  const torch = hero.items.get(ID.torch);
  torch.flags[MODULE] = { lit: false };
  const mark = F.calls.length;
  F.fire("updateActor", hero);
  F.fire("updateItem", torch, {});
  F.fire("createActiveEffect", { documentName: "ActiveEffect", parent: hero });
  mock.timers.tick(249);
  await flush();
  assert.deepEqual(since(mark), [], "debounced");
  mock.timers.tick(1);
  await flush();
  const first = since(mark);
  await settle(mock);
  const all = since(mark);
  pinJSON("carried-burst", { first, all }, import.meta.url);
  assert.equal(first.filter(c => c.op === "update" && c.documentName === "Actor").length, 1);
  assert.deepEqual(first.filter(c => c.op === "updateEmbedded").map(c => c.scene), [ID.s1, ID.s2], "scene order");
});

test("hooks: what schedules a sync and what does not", async () => {
  const hero = game.actors.get(ID.hero);
  const torch = hero.items.get(ID.torch);
  const run = async (name, ...args) => {
    torch.flags[MODULE] = { lit: !torch.flags[MODULE]?.lit };
    const mark = F.calls.length;
    F.fire(name, ...args);
    await settle(mock);
    return since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded").length > 0;
  };
  const effectOnItem = { documentName: "ActiveEffect", parent: torch };
  const rows = {
    updateActor: await run("updateActor", hero),
    createItem: await run("createItem", torch),
    deleteItem: await run("deleteItem", torch),
    updateActiveEffect_onItem: await run("updateActiveEffect", effectOnItem),
    deleteActiveEffect: await run("deleteActiveEffect", { documentName: "ActiveEffect", parent: hero }),
    createToken_withActor: await run("createToken", { actor: hero }),
    createToken_noActor: await run("createToken", { actor: null }),
    updateActor_notAnActor: await run("updateActor", { documentName: "Item", id: "x" }),
    worldItem: await run("updateItem", makeItem({ id: "itmLoose00000001", name: "Torch" })),
    packActor: await run("updateActor", Object.assign(makeActor({ id: ID.hero, name: "Marrith (pack)", pack: "world.heroes", items: [] }))),
  };
  assert.deepEqual(rows, {
    updateActor: true, createItem: true, deleteItem: true, updateActiveEffect_onItem: true, deleteActiveEffect: true,
    createToken_withActor: true, createToken_noActor: false, updateActor_notAnActor: false, worldItem: false, packActor: false,
  });
});

// [declared PT TF-2] A token that changes actor (dnd5e's Wild Shape / polymorph swap, either way) takes
// its new actor's carried lights: before, the swapped token was never synced, so a druid's starlight
// (or a lit torch) stayed on the beast form after Starry Form ended or the torch stayed behind.
test("hooks: a token that changes actor schedules its new actor's sync; other token updates do not", async () => {
  const hero = game.actors.get(ID.hero);
  const torch = hero.items.get(ID.torch);
  const run = async (...args) => {
    torch.flags[MODULE] = { lit: !torch.flags[MODULE]?.lit };
    const mark = F.calls.length;
    F.fire("updateToken", ...args);
    await settle(mock);
    return since(mark).filter(c => c.op === "update" || c.op === "updateEmbedded").length > 0;
  };
  assert.deepEqual({
    actorSwap: await run({ actor: hero }, { actorId: hero.id }),
    moved: await run({ actor: hero }, { x: 100 }),
    swapNoActor: await run({ actor: null }, { actorId: "gone000000000000" }),
  }, { actorSwap: true, moved: false, swapNoActor: false });
});
