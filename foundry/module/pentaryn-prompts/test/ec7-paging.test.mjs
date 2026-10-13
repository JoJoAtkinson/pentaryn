/**
 * prompts-core-EC-7 [declared]: paging `scenes: "all"` with a `from` that dropped out of the
 * filtered list (the scene named as `next` lost its prompts between pages) carries on from the first
 * listed scene after it in navigation order — an empty page when none is left — instead of refusing
 * SCENE_UNKNOWN. An explicit scene list still refuses a `from` it does not hold, and a `from` that is
 * no scene at all still refuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, addScene, captureConsole, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const G = await import("../gather.mjs");

const marker = id => ({ id, name: "Prompt · mid", actorId: "markerActormid00", x: 300, y: 300,
  texture: { src: "modules/pentaryn-prompts/assets/marker-mid.webp" }, flags: { [MODULE]: { marker: "mid", prompt: "a bandit" } } });
// navigation order: s1 (1, prompts) · sEmpty (2, none) · sNext (3, one prompt) · sTail (4, none)
addScene(F, { id: "sEmpty", name: "ZZ EC7 emptied", navigation: true, navOrder: 2 });
addScene(F, { id: "sNext", name: "ZZ EC7 next", navigation: true, navOrder: 3, tokens: [marker("ec7m1")] });
addScene(F, { id: "sTail", name: "ZZ EC7 tail", navigation: true, navOrder: 4 });

const g = opts => captureConsole(() => G.gather({ crops: "off", ...opts })).then(r => r.value);

test("gather (prompts-core-EC-7): 'all' resumes after a from that lost its prompts; an explicit list still refuses", async () => {
  assert.deepEqual(G.scenesInNavOrder().map(s => s.id), ["s1", "sEmpty", "sNext", "sTail"]);
  // the next page was to start at sEmpty, which has no prompts now: carry on at sNext
  const resumed = await g({ from: "sEmpty" });
  assert.deepEqual([resumed.counts.scenes, resumed.counts.prompts, resumed.next], [1, 1, null]);
  assert.match(resumed.text, /ZZ EC7 next/);
  assert.doesNotMatch(resumed.text, /ZZ Characterisation/);
  // nothing listed after the emptied scene: an empty page, not a refusal
  const empty = await g({ from: "sTail" });
  assert.deepEqual([empty.counts.scenes, empty.counts.prompts, empty.next], [0, 0, null]);
  // an explicit list keeps refusing a from it does not hold
  await assert.rejects(G.gather({ scenes: ["s1"], crops: "off", from: "sEmpty" }),
    { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: next scene sEmpty is not in this gather" });
  // a from that is no scene at all still refuses under "all"
  await assert.rejects(G.gather({ crops: "off", from: "nope" }),
    { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: next scene nope is not in this gather" });
});
