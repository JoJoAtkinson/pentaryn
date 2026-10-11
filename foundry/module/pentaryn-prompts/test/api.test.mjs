/**
 * Characterisation (prompts checkpoint, wave 3; guide step 2): the five `pentaryn-prompts.*`
 * queries the MCP fork calls, through `CONFIG.queries[name](data, { user })` as core dispatches
 * them, against the stub world. The GM guard pins message and `.code` only, never the class.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise } from "./kit/harness.mjs";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const NOW = 1760000000000;

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
F.fire("setup");
{
  const { mock } = await import("node:test");
  mock.timers.enable({ apis: ["setTimeout"] });
  await captureConsole(async () => { F.fire("ready"); await flush(); });
  mock.timers.tick(0);
  mock.timers.reset();
}
const gm = F.game.user;
const q = name => (data, ctx = { user: gm }) => F.CONFIG.queries[`${MODULE}.${name}`](data, ctx);

/** `ms` is wall-clock; everything else is pinned. */
const normalise = v => {
  if (!v || typeof v !== "object") return v;
  const out = structuredClone(v);
  if ("ms" in out) out.ms = "<ms>";
  if (typeof out.text === "string") out.text = out.text.split("\n");
  return out;
};

test("queries: list, gather, crops, replace, show as the fork calls them", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
  const run = async ([name, data]) => {
    const { value } = await captureConsole(() => q(name)(data));
    return value;
  };
  await characterise("queries", run, [
    [["list", {}]],
    [["gather", { crops: "off" }]],
    [["crops", { call: "nope" }]],
    [["replace", { replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "light", config: { dim: 10 } } }], dryRun: true }]],
    [["replace", { replacements: [] }]],
    [["show", { sceneId: "s1", markerId: "m1" }]]
  ], { file: import.meta.url, normalise });
  // show pinged the marker's centre after panning there
  assert.deepEqual(F.calls.filter(c => c.op === "canvas.ping").at(-1), { op: "canvas.ping", x: 250, y: 250 });
  assert.deepEqual(F.calls.filter(c => c.op === "canvas.animatePan").at(-1), { op: "canvas.animatePan", x: 250, y: 250, scale: 1, duration: 400 });
});

test("gather through the query asks for base64 crops; the stored manifest records no cropsAs", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: NOW });
  const { value } = await captureConsole(() => q("gather")({ crops: "off" }));
  assert.equal("cropsAs" in value.manifest, false);
  assert.equal("cropsAs" in value.manifest.opts, false);
  assert.deepEqual(value.crops, []);
  const ring = F.game.settings.get(MODULE, "lastCalls");
  assert.equal(ring[0].call, value.call);
});

test("the GM guard: a player sender and a player client are refused NOT_GM; the bridge's no-context call runs", async () => {
  const sender = { user: { isGM: false, name: "P" } };
  for (const name of ["list", "gather", "crops", "replace", "show"]) {
    await assert.rejects(q(name)({}, sender), err => err.code === "NOT_GM" && err.message === "NOT_GM: P is not a GM");
  }
  assert.deepEqual(await q("list")({}, undefined), await q("list")({}));
  assert.deepEqual(await q("list")(undefined, {}), await q("list")({}));
  F.game.user = { id: "player0000000001", isGM: false };
  try {
    for (const name of ["list", "gather", "crops", "replace", "show"]) {
      await assert.rejects(q(name)({}, {}), err => err.code === "NOT_GM" && err.message === "NOT_GM: this client is not a GM");
    }
  } finally {
    F.game.user = gm;
  }
});
