/**
 * The double-click patch through the kit's wrapMethod (guide step 6, [declared] DP4): one record
 * naming its adjustments row, and a hot re-import of the entry that re-runs `setup` no longer
 * stacks a second direct wrap (the `__pentarynPromptsClick` marker).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

test("DP4: one wrap with its adjustments row; a second entry import's setup leaves it as it is", async () => {
  const W = await installWorld();
  await captureConsole(() => import("../prompts.mjs?dblclick-a"));
  W.fire("init");
  await captureConsole(() => W.fire("setup"));
  const proto = W.CONFIG.Token.objectClass.prototype;
  const wrapped = proto._onClickLeft2;
  assert.equal(wrapped.__pentarynPromptsClick, true);
  const { patches } = await import("../lib/patch.mjs");
  const mine = patches().filter(p => p.moduleId === MODULE && p.marker === "__pentarynPromptsClick");
  assert.deepEqual(mine.at(-1), { moduleId: MODULE, label: "Token#_onClickLeft2", name: "_onClickLeft2",
    marker: "__pentarynPromptsClick", via: "direct", adjustments: "prompts-token-dblclick" });
  const { out } = await captureConsole(async () => {
    await import("../prompts.mjs?dblclick-b");
    W.fire("setup");
  });
  assert.deepEqual(out, []);
  assert.equal(proto._onClickLeft2, wrapped, "not wrapped a second time");
  const n0 = W.calls.length;
  assert.equal(proto._onClickLeft2.call({ document: W.s1.tokens.get("tokOrdinary00001") }, { type: "dbl" }), "original");
  assert.equal(W.calls.slice(n0).filter(c => c.op === "Token#_onClickLeft2 (original)").length, 1);
});

test("hot patch: uninstall() unwraps and removes every hook; a re-import into the ready world re-wires and republishes", async () => {
  const W = await installWorld();
  await captureConsole(() => import("../prompts.mjs?hot-a"));
  W.fire("init");
  await captureConsole(() => W.fire("setup"));
  await captureConsole(async () => { W.fire("ready"); await new Promise(r => setImmediate(r)); });
  const first = W.game.pentaryn.prompts;
  const proto = W.CONFIG.Token.objectClass.prototype;
  assert.equal(proto._onClickLeft2.__pentarynPromptsClick, true);
  first.uninstall();
  assert.equal(proto._onClickLeft2.name, "original", "unwrapped");
  assert.deepEqual(first.describe().hooks, []);
  const { out } = await captureConsole(async () => { await import("../prompts.mjs?hot-b"); await new Promise(r => setImmediate(r)); });
  assert.deepEqual(out, []);
  const second = W.game.pentaryn.prompts;
  assert.notEqual(second, first);
  assert.equal(proto._onClickLeft2.__pentarynPromptsClick, true, "wrapped again at once");
  assert.equal(second.status().doubleClick, "direct");
  assert.ok(second.describe().hooks.length > 18);
  assert.equal(typeof W.CONFIG.queries[`${MODULE}.gather`], "function");
});
