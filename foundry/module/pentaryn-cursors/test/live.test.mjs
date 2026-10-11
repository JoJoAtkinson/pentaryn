// Stub fidelity against the live run (wave-1-baseline.md SF8): with CSS.supports accepting
// image-set() in `cursor` (live Chrome), the five tool switches of scripts/foundry/live-goldens/
// cursors.js, driven through the wrapped tool onChange as ui.controls.activate does live, read back
// exactly what the GM tab read on 2026-10-11 (test/fixtures/live-before.json, copied from
// .state/live-goldens/before/cursors.json). Its own process: useImageSet() caches its answer.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";
import { cursorWorld, flush } from "./fixtures/board.mjs";
import { MODULE, VARS } from "../cursors-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const LIVE = readJSON(new URL("./fixtures/live-before.json", import.meta.url));
const F = await cursorWorld({ imageSet: true });
const { el, setTool } = F;
await import("../cursors.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
await flush();

const tools = {
  tokens: { tools: { select: {}, target: {}, ruler: {} } },
  notes: { tools: { select: {}, journal: {} } },
  drawings: { tools: { select: {}, rect: {} } },
};
F.fire("getSceneControlButtons", tools);
/** ui.controls.activate, as far as the module sees it: the active control/tool change, then onChange. */
function activate(control, tool) {
  setTool(control, tool);
  tools[control].tools[tool].onChange();
}
const read = () => ({
  control: ui.controls.control.name,
  tool: ui.controls.tool.name,
  current: game.pentaryn.cursors.current(),
  dataset: el.dataset.pentarynCursor ?? null,
  styleCursor: el.style.cursor,
  vars: Object.fromEntries(VARS.map(v => [v, el.style.getPropertyValue(v) || null])),
});

test("the environment the live run saw", () => {
  assert.equal(foundry.utils.getRoute(`modules/${MODULE}`), LIVE.env.route);
  assert.equal(el.id, LIVE.env.boardId);
  assert.equal(el.tagName, LIVE.env.boardTag);
  assert.equal(game.settings.get(MODULE, "enabled"), LIVE.env.enabled);
  assert.deepEqual(Object.keys(game.pentaryn.cursors.keys), LIVE.env.keys);
});

test("five tool switches through onChange read back exactly the live golden", () => {
  const got = [];
  for (const { control, tool } of LIVE.tools) {
    activate(control, tool);
    got.push(read());
  }
  assert.deepEqual(got, LIVE.tools);
});

test("image-set support is probed once, with the live probe string, and cached", () => {
  assert.deepEqual(F.cssProbes, [["cursor", 'image-set(url("x.png") 1x) 0 0, auto']]);
});

test("keyFor through the API matches the live keyForTable", () => {
  const api = game.pentaryn.cursors;
  const got = LIVE.tools.map(({ control, tool }) => api.keyFor({ control, tool }))
    .concat(api.keyFor({ control: "tokens", tool: "select", templatesActive: true }));
  assert.deepEqual(got, LIVE.keyForTable);
});
