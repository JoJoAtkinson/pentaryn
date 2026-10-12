/**
 * mcp-fork-2, the module half: the fork wraps every `foundry-mcp-bridge.*` query handler in a
 * sender guard (`handlers.ts` guardBridgeQueries) that refuses a ctx whose user is not a GM and lets
 * a call with no ctx through. npc-adapter calls those handlers directly in the GM client, so it must
 * keep calling them with the data only — never a ctx. And the fork leaves `pentaryn-prompts.*`
 * unwrapped (its test asserts identity), which needs them to stay plain functions on CONFIG.queries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";
import { forkSource } from "./kit/harness.mjs";

const F = await installWorld();
F.CONFIG.DND5E = { languages: {} };
const N = await import("../npc-adapter.mjs");

const calls = [];

/** The fork's guard, as its source states it: a ctx from a non-GM is refused; no ctx passes. */
function forkGuard(name, h) {
  const guarded = async (...args) => {
    calls.push([name, args.length]);
    const [data, ctx] = args;
    if (ctx?.user && !ctx.user.isGM) throw new Error("Access denied: bridge queries may only be queried by a GM.");
    return h(data, ctx);
  };
  guarded.__forkGuarded = true;
  return guarded;
}

function bridge() {
  const q = (name, fn) => (F.CONFIG.queries[`foundry-mcp-bridge.${name}`] = forkGuard(name, async data => fn(data)));
  q("createNpcActor", args => ({ success: true, actor: { id: F.addActor({ name: args.name, type: "npc" }).id } }));
  q("addPassiveFeatureToActor", () => ({ success: true }));
  q("addAttackToActor", () => ({ success: true }));
  q("addSpellsToActor", () => ({ success: true }));
}

test("mcp-fork-2: npc-adapter calls each bridge handler with the data only (no ctx), so the fork's sender guard passes it", async () => {
  bridge();
  const checked = await N.checkNpc({ npc: { name: "Ogre", creatureType: "giant", size: "large", cr: "2", hpAverage: 59, hpFormula: "7d10+21",
    acMode: "flat", acValue: 11, abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 } },
    features: [{ featureType: "passive", featureName: "Brute", description: "Hits hard." },
      { featureType: "attack", featureName: "Club", attackType: "melee", damageParts: [{ number: 1, denomination: 6, type: "bludgeoning" }] }] });
  const res = await N.createNpc(checked, () => {});
  assert.equal(res.actor.name, "Ogre");
  assert.deepEqual(calls, [["createNpcActor", 1], ["addPassiveFeatureToActor", 1], ["addAttackToActor", 1]]);
});

test("mcp-fork-2: the module's own queries are plain functions the fork's guard does not mark", async () => {
  await captureConsole(() => import("../prompts.mjs"));
  F.fire("init");
  const own = Object.entries(F.CONFIG.queries).filter(([k]) => k.startsWith(`${MODULE}.`));
  assert.equal(own.length, 5);
  for (const [k, fn] of own) {
    assert.equal(typeof fn, "function", k);
    assert.equal(fn.__forkGuarded, undefined, k);
  }
});

test("mcp-fork-2 (fork side, with FOUNDRY_MCP_FORK): the guard passes a call with no ctx and wraps bridge keys only", t => {
  const src = forkSource("packages/foundry-module/src/fork/handlers.ts");
  if (src.skip) return t.skip(src.skip);
  const at = src.text.indexOf("function guardBridgeQueries(");
  assert.ok(at > 0, "guardBridgeQueries is gone from the fork");
  assert.ok(src.text.includes("if (ctx?.user && !ctx.user.isGM)"), "the sender check no longer lets a missing ctx through");
  assert.ok(src.text.slice(at, at + 600).includes("if (!key.startsWith(`${MODULE_ID}.`)"), "the guard no longer skips other modules' keys");
});
