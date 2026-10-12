/**
 * inspect() and light.status() (guide step 11, finding -25): read-only, plain JSON, depth ≤ 4. The
 * pure shape (core/inspect.mjs) on deep-frozen inputs, then the live API on the standard world.
 * Added at step 11.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { maxDepth } from "./kit/harness.mjs";
import { boot, settle, standardWorld, ID, MODULE, NOW, PLAYER } from "./fixtures/world.mjs";

const core = await import("../senses-core.mjs");

const deepFreeze = o => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

test("inspectShape (pure): the -25 recipe on deep-frozen inputs", () => {
  const token = { id: "t", light: { bright: 20, dim: 40 }, flags: { [MODULE]: { itemLight: true, itemLightPrior: { bright: 5, dim: 10 }, chain: { anchor: "stake" } } } };
  const lantern = { id: "lan", name: "Lantern, Hooded", system: { identifier: "lantern-hooded" }, flags: { [MODULE]: { lit: true, hooded: true } } };
  const shard = { id: "shd", name: "Shard", flags: { [MODULE]: { light: { bright: 0, dim: 15 } } } };
  const spell = { id: "lgt", uuid: "Actor.a.Item.lgt", name: "Light", type: "spell", system: { identifier: "light" }, flags: { [MODULE]: { lightCast: { scene: "s", token: "t" } } } };
  const lit = { id: "t", flags: { [MODULE]: { spellLight: { source: "Actor.a.Item.lgt" } } } };
  const scenes = [{ id: "s", tokens: [lit], lights: [] }];
  const sceneTokens = [token, { id: "hulk", flags: { [MODULE]: { chain: { anchor: "t" } } } }, { id: "stake", flags: {} }];
  const input = deepFreeze({ token, actor: { id: "a" }, items: [lantern, shard, spell], sceneTokens, scenes });
  const out = core.inspectShape(input);
  assert.deepEqual(out.token, { id: "t", light: { bright: 20, dim: 40 }, itemLight: true, itemLightPrior: { bright: 5, dim: 10 }, spellLight: null });
  assert.deepEqual(out.actor.carried, { bright: 0, dim: 15 }, "the shard outshines the hooded lantern (0 / 5)");
  assert.deepEqual(out.actor.carriers.map(c => c.kind), ["lit", "shard"]);
  assert.equal(out.actor.hooded, true);
  assert.equal(out.actor.lightingItem, "shd");
  assert.deepEqual(out.chain, { anchor: "stake", chainedHere: ["hulk"] });
  assert.deepEqual(out.lightSpells, [{ item: "lgt", cast: { scene: "s", token: "t" }, litBy: ["Scene.s.Token.t"] }]);
  assert.ok(maxDepth(out) <= 4, `depth ${maxDepth(out)}`);
  assert.deepEqual(core.inspectShape({}), { token: null, actor: null, chain: null, lightSpells: [] });
});

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
world.actors[0].items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
const F = await boot({ world });
await settle(mock);
const S = () => game.pentaryn.senses;

test("inspect(token): light, chain, carried and the Light cantrips; plain and shallow", () => {
  const hulk = S().inspect(ID.tHulk);
  assert.deepEqual(hulk.chain, { anchor: ID.tStake, chainedHere: [] });
  assert.equal(hulk.actor.id, ID.hulk);
  const stake = S().inspect("Stake", { sceneId: ID.s1 });
  assert.deepEqual(stake.chain, { anchor: null, chainedHere: [ID.tHulk] });
  assert.equal(stake.token.spellLight.source, `Actor.${ID.hero}.Item.${ID.light}`, "lit by Marrith's Light (the ready sweep)");
  const gob = S().inspect(ID.tGob);
  assert.deepEqual(gob.actor.carriers.map(c => [c.kind, c.item]), [["lit", ID.gobTorch]], "an unlinked token's own items");
  assert.equal(gob.token.itemLight, true);
  const hero = S().inspect(game.actors.get(ID.hero));
  assert.equal(hero.token, null, "an actor ref: no token block");
  assert.deepEqual(hero.lightSpells, [{ item: ID.light, cast: { scene: ID.s1, token: ID.tStake }, litBy: [`Scene.${ID.s1}.Token.${ID.tStake}`] }]);
  for (const r of [hulk, stake, gob, hero]) assert.ok(maxDepth(r) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(gob)), gob, "plain JSON");
});

test("inspect: as a player without OBSERVER, the actor and its Light cantrips are omitted; misses throw coded", () => {
  const asPlayer = S().inspect(ID.tGob, { as: PLAYER });
  assert.equal(asPlayer.actor, null);
  assert.deepEqual(asPlayer.lightSpells, []);
  assert.equal(asPlayer.token.itemLight, true);
  assert.notEqual(S().inspect(ID.tHero, { sceneId: ID.s1, as: PLAYER }).actor, null, "the owner sees their own actor");
  assert.throws(() => S().inspect("nobody"), /NOT_FOUND/);
  assert.throws(() => S().inspect(""), /BAD_ARGS/);
});

test("light.status(item): cast and what it lights; a miss throws NOT_FOUND", () => {
  const item = game.actors.get(ID.hero).items.get(ID.light);
  assert.deepEqual(S().light.status(item), { cast: { scene: ID.s1, token: ID.tStake }, litBy: [{ kind: "token", scene: ID.s1, id: ID.tStake }] });
  assert.deepEqual(S().light.status(item.uuid), S().light.status(item));
  assert.throws(() => S().light.status("Actor.nope000000000000.Item.nope000000000000"), /NOT_FOUND/);
});

// Review fix (S-12): a spell-lit token's prior is a `toObject()` light, which always carries the
// `animation` and `darkness` objects. At token.spellLight.prior that is depth 4, so toPlain would
// cut them to "[max depth]" (and maxDepth counts that string as a leaf). The prior is dotted instead.
const leaves = (v, out = []) => {
  if (v && typeof v === "object") for (const x of Object.values(v)) leaves(x, out);
  else out.push(v);
  return out;
};
const FULL_PRIOR = { dim: 30, bright: 10, animation: { type: "torch", speed: 5, intensity: 5, reverse: false }, darkness: { min: 0, max: 1 } };

test("inspectShape (pure): a spell-lit token's full prior light survives toPlain, dotted, with no [max depth]", async () => {
  const { toPlain } = await import("../lib/api.mjs");
  const token = deepFreeze({ id: "t", light: { bright: 20, dim: 40 }, flags: { [MODULE]: { spellLight: { source: "Actor.a.Item.lgt", prior: FULL_PRIOR } } } });
  const out = toPlain(core.inspectShape({ token }));
  assert.ok(!leaves(out).includes("[max depth]"), JSON.stringify(out));
  assert.deepEqual(out.token.spellLight, {
    source: "Actor.a.Item.lgt",
    prior: {
      dim: 30, bright: 10, "animation.type": "torch", "animation.speed": 5, "animation.intensity": 5, "animation.reverse": false,
      "darkness.min": 0, "darkness.max": 1,
    },
  });
  assert.equal(core.inspectShape({ token: { id: "t", flags: { [MODULE]: { spellLight: { source: "x" } } } } }).token.spellLight.prior, null);
});

test("inspect(token): the live answer for a spell-lit token keeps animation and darkness", () => {
  const stake = game.scenes.get(ID.s1).tokens.get(ID.tStake);
  const flag = stake.flags[MODULE].spellLight;
  const was = flag.prior;
  flag.prior = structuredClone(FULL_PRIOR);
  try {
    const r = S().inspect(ID.tStake, { sceneId: ID.s1 });
    assert.ok(!leaves(r).includes("[max depth]"), JSON.stringify(r.token));
    assert.equal(r.token.spellLight.prior["animation.type"], "torch");
    assert.equal(r.token.spellLight.prior["darkness.max"], 1);
  } finally { flag.prior = was; }
});

test("inspect over the MCP bridge (W3L, wave-3 live plan §7 row 6): the ref row names its string forms", async () => {
  // pentaryn-read refuses a Document-kind param ("needs a live Document — eval-js only") unless its
  // `type` names a string form (uuid / id / name / string): that is how a row says it resolves strings
  // itself. inspect does (an id, a uuid or an exact name), so a uuid must reach it as plain JSON.
  const { MANIFEST } = await import("../api-manifest.mjs");
  const ref = MANIFEST.rows.find(r => r.path === "inspect").params.find(p => p.name === "ref");
  const words = String(ref.type ?? "").toLowerCase().split(/[^a-z0-9_]+/);
  assert.ok(["uuid", "id", "name"].every(w => words.includes(w)), `ref.type names uuid, id and name: ${ref.type}`);
  const stake = game.scenes.get(ID.s1).tokens.get(ID.tStake);
  const byUuid = S().inspect(stake.uuid);
  assert.equal(byUuid.token.id, ID.tStake);
  assert.deepEqual(JSON.parse(JSON.stringify(byUuid)), byUuid, "plain JSON");
});
