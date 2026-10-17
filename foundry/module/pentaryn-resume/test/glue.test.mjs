// Glue: install the Foundry stub, load the entry exactly as Foundry would, fire the lifecycle,
// and pin EFFECTS (hooks registered, calls made, console text) — not return values.
//
// Each login() is one browser load of a player client: game.ready false, the entry imported
// fresh, Foundry's first draw of the active scene (canvasPan before ready, as Canvas#draw does),
// then setup and ready.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, world } from "./fixtures/actors.mjs";
import { HOOKS, MODULE, NS, SAVE_DELAY, VIEW_FLAG } from "../resume-core.mjs";

const F = await installFoundry(world(MODULE, { currentScene: IDS.town }));
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);

F.become({ userId: IDS.player });
const town = game.scenes.get(IDS.town);
const cave = game.scenes.get(IDS.cave);
Object.defineProperty(game.scenes, "active", { get() { return this.contents.find(s => s.active) ?? null; } });
cave.levels = new Map([[IDS.caveLower, { id: IDS.caveLower }]]);

const views = [];
const pans = [];
canvas.pan = position => {
  pans.push(position);
  canvas.scene._viewPosition = position;
  F.fire("canvasPan", canvas, position);
};
for (const scene of [town, cave]) {
  scene.view = async function view(options = {}) {
    views.push([this.id, options]);
    canvas.scene = this;
    canvas.level = options.level ? { id: options.level } : null;
    F.fire("canvasReady", canvas);
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));
const userWrites = () => F.calls.filter(c => c.op === "update" && c.documentName === "User");
const flag = () => game.user.getFlag(MODULE, VIEW_FLAG);
let loads = 0;

/**
 * One browser load. `canvasReady: false` is a client with the canvas disabled; with `initialized`
 * it is a blank draw (no active scene: `canvas.draw(null)`, board.mjs — initialized, never ready).
 */
async function login({ saved, active = IDS.town, canvasReady = true, initialized = canvasReady, drawn = null, drawnLevel = null } = {}) {
  game.modules.get(MODULE).api?.uninstall();
  game.ready = false;
  if (saved === null) delete game.user.flags[MODULE];
  else if (saved) game.user.flags[MODULE] = { [VIEW_FLAG]: structuredClone(saved) };
  for (const s of [town, cave]) s.active = s.id === active;
  // `drawn`: the scene Foundry's first draw showed (the active scene unless a test says otherwise)
  Object.assign(canvas, { ready: canvasReady, initialized, scene: canvasReady ? (drawn ? game.scenes.get(drawn) : game.scenes.active ?? town) : null,
    level: drawnLevel ? { id: drawnLevel } : null });
  views.length = 0;
  pans.length = 0;
  F.calls.length = 0;
  await import(`../resume.mjs?load=${++loads}`);
  F.fire("setup");
  if (canvasReady) canvas.pan({ x: 1000, y: 1000, scale: 1 });   // Foundry's first draw
  F.fire("ready");
  await settle();
}

await login({ saved: null });
const hooksAtReady = F.hooks.slice();
const api = game.modules.get(MODULE).api;

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("published at ready: module.api is canonical, game.pentaryn alias, both ready hooks", () => {
  assert.ok(api, "module.api not set");
  assert.equal(game.pentaryn[NS], api);
  assert.equal(api.contract, `${MODULE}/api@1`);
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
});

test("first login with nothing saved: stays on the active scene and saves it", async () => {
  await login({ saved: null });
  assert.deepEqual(views, []);
  assert.equal(userWrites().length, 1);
  assert.deepEqual(flag(), { scene: IDS.town, level: null, active: IDS.town, x: 1000, y: 1000, scale: 1 });
});

test("panning writes once, after the view has been still for SAVE_DELAY", async () => {
  await login({ saved: null });
  F.calls.length = 0;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    canvas.pan({ x: 1200, y: 1000, scale: 1 });
    mock.timers.tick(SAVE_DELAY - 1);
    canvas.pan({ x: 1400, y: 900, scale: 0.5 });
    mock.timers.tick(SAVE_DELAY - 1);
    assert.equal(userWrites().length, 0, "nothing while the view keeps moving");
    mock.timers.tick(1);
    assert.equal(userWrites().length, 1);
    assert.deepEqual(flag(), { scene: IDS.town, level: null, active: IDS.town, x: 1400, y: 900, scale: 0.5 });
    canvas.pan({ x: 1400.3, y: 900, scale: 0.5 });           // noise: no second write
    mock.timers.tick(SAVE_DELAY);
    assert.equal(userWrites().length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("after the nightly restart: back on the saved scene and level, at the saved spot", async () => {
  const saved = { scene: IDS.cave, level: IDS.caveLower, active: IDS.town, x: 300, y: 400, scale: 0.75 };
  const seen = [];
  const id = Hooks.on(HOOKS.resumed.name, view => seen.push(view));
  await login({ saved });
  Hooks.off(HOOKS.resumed.name, id);
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower }]]);
  assert.deepEqual(pans.at(-1), { x: 300, y: 400, scale: 0.75 });
  assert.equal(canvas.scene.id, IDS.cave);
  assert.deepEqual(seen, [{ scene: IDS.cave, level: IDS.caveLower, position: { x: 300, y: 400, scale: 0.75 } }]);
  assert.equal(userWrites().length, 0, "the first draw of the active scene must not overwrite the saved view");
  assert.deepEqual(flag(), saved);
});

test("saved on the active scene: no redraw, just the pan", async () => {
  await login({ saved: { scene: IDS.town, active: IDS.town, x: 50, y: 60, scale: 2 } });
  assert.deepEqual(views, []);
  assert.deepEqual(pans.at(-1), { x: 50, y: 60, scale: 2 });
  assert.equal(userWrites().length, 0);
});

test("the GM moved the table to another active scene: the player follows it, and that is saved", async () => {
  await login({ saved: { scene: IDS.cave, active: IDS.cave, x: 300, y: 400, scale: 0.75 }, active: IDS.town });
  assert.deepEqual(views, []);
  assert.deepEqual(flag(), { scene: IDS.town, level: null, active: IDS.town, x: 1000, y: 1000, scale: 1 });
});

test("a saved scene that was deleted, or a level that was: falls back cleanly", async () => {
  await login({ saved: { scene: "gone000000000001", active: IDS.town } });
  assert.deepEqual(views, []);
  assert.equal(flag().scene, IDS.town);
  await login({ saved: { scene: IDS.cave, level: "gonelevel0000001", active: IDS.town } });
  assert.deepEqual(views, [[IDS.cave, {}]]);
});

test("canvas disabled: nothing restored, nothing saved", async () => {
  await login({ saved: { scene: IDS.cave, active: IDS.town }, canvasReady: false });
  assert.deepEqual(views, []);
  assert.equal(userWrites().length, 0);
});

/* ── pentaryn-pins (resume 0.1.1, pins plan D7): the pin wins at login ───────────────────── */

const PINS = "pentaryn-pins";
/**
 * A pins stub of the published shape: pinnedToken(user) → { token, actor, scene: id string, level, x, y } | null.
 * A function is the implementation itself (to throw, or to answer whatever the user is).
 */
function pinsPublishing(pinned) {
  const pinnedToken = typeof pinned === "function" ? pinned : () => pinned;
  // pins registers Hooks.once("ready") when its entry evaluates — before resume's setup listener
  Hooks.once("ready", () => game.modules.set(PINS, { id: PINS, active: true, api: { pinnedToken } }));
}
const resumedDuring = async fn => {
  const seen = [];
  const id = Hooks.on(HOOKS.resumed.name, view => seen.push(view));
  try { await fn(); } finally { Hooks.off(HOOKS.resumed.name, id); game.modules.delete(PINS); }
  return seen;
};

test("pins absent: no pentaryn-pins module, the rules above apply unchanged", async () => {
  assert.equal(game.modules.get(PINS), undefined);
  await login({ saved: { scene: IDS.cave, active: IDS.town, x: 1, y: 2, scale: 1 } });
  assert.deepEqual(views, [[IDS.cave, {}]]);
});

const PINNED_CAVE = { token: `Scene.${IDS.cave}.Token.caveTalo0000001`, actor: "Actor.z", scene: IDS.cave, level: IDS.caveLower, x: 0, y: 0 };

test("pinned, saved view of the pinned scene: views it at the token's level with the token controlled, then pans — even after the table moved on", async () => {
  pinsPublishing(PINNED_CAVE);
  const seen = await resumedDuring(() => login({ saved: { scene: IDS.cave, level: null, active: IDS.cave, x: 300, y: 400, scale: 0.75 }, active: IDS.town }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower, controlledTokens: ["caveTalo0000001"] }]]);
  assert.deepEqual(pans.at(-1), { x: 300, y: 400, scale: 0.75 });
  assert.deepEqual(seen, [{ scene: IDS.cave, level: IDS.caveLower, position: { x: 300, y: 400, scale: 0.75 } }]);
});

test("pinned token on another level of the active scene: view({ level }) only; already on its level: no view, just the pan", async () => {
  pinsPublishing(PINNED_CAVE);
  await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.cave, x: 30, y: 40, scale: 1 }, active: IDS.cave }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower, controlledTokens: ["caveTalo0000001"] }]], "same scene, the token's level");
  pinsPublishing(PINNED_CAVE);
  await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.cave, x: 30, y: 40, scale: 1 }, active: IDS.cave, drawnLevel: IDS.caveLower }));
  assert.deepEqual(views, []);
  assert.deepEqual(pans.at(-1), { x: 30, y: 40, scale: 1 });
});

test("pinned, saved view of another scene: views the pinned scene, no pan, resumed fires", async () => {
  pinsPublishing(PINNED_CAVE);
  const seen = await resumedDuring(() => login({ saved: { scene: IDS.town, active: IDS.town, x: 50, y: 60, scale: 2 } }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower, controlledTokens: ["caveTalo0000001"] }]]);
  assert.deepEqual(pans, [{ x: 1000, y: 1000, scale: 1 }], "only Foundry's first draw");
  assert.deepEqual(seen, [{ scene: IDS.cave, level: IDS.caveLower, position: null }]);
  assert.equal(canvas.scene.id, IDS.cave);
});

test("pinned token this user does not own (observer only): views its scene and level, no controlledTokens, so core's own fallback pans", async () => {
  pinsPublishing({ ...PINNED_CAVE, token: `Scene.${IDS.cave}.Token.${IDS.caveObserved}` });
  await resumedDuring(() => login({ saved: null }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower }]]);
});

test("pinned token missing from its scene: views its scene and level, no controlledTokens", async () => {
  pinsPublishing({ ...PINNED_CAVE, token: `Scene.${IDS.cave}.Token.goneToken0000001` });
  await resumedDuring(() => login({ saved: null }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower }]]);
});

test("pinned, no saved view: still lands on the token's scene", async () => {
  pinsPublishing(PINNED_CAVE);
  await resumedDuring(() => login({ saved: null }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower, controlledTokens: ["caveTalo0000001"] }]]);
});

test("pinned, no active scene (a blank draw: canvas initialized, not ready): still lands on the token's scene", async () => {
  pinsPublishing(PINNED_CAVE);
  await resumedDuring(() => login({ saved: null, active: null, canvasReady: false, initialized: true }));
  assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower, controlledTokens: ["caveTalo0000001"] }]]);
  assert.equal(canvas.scene.id, IDS.cave);
});

test("pinned, the token's scene is gone: no restore", async () => {
  pinsPublishing({ ...PINNED_CAVE, scene: "gone000000000001" });
  const seen = await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.town, x: 1, y: 2, scale: 1 } }));
  assert.deepEqual([views, seen], [[], []]);
});

test("unpinned with no active scene (canvas not ready): nothing restored, as before", async () => {
  await login({ saved: { scene: IDS.cave, active: null }, active: null, canvasReady: false, initialized: true });
  assert.deepEqual(views, []);
});

test("contract: a pinnedToken whose scene is not an id string reads as no pin, and says so", async () => {
  pinsPublishing({ token: "Scene.x.Token.y", actor: "Actor.z", scene: { id: IDS.town }, level: null, x: 0, y: 0 });
  consoleLines.length = 0;
  await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.town } }));
  assert.deepEqual(views, [[IDS.cave, {}]], "the unpinned rules");
  assert.deepEqual(consoleLines, [["warn", `${MODULE} | pentaryn-pins pinnedToken().scene is not a scene id string; resuming as unpinned`]]);
});

test("pinnedToken throws: logged, the unpinned rules, and resumed still fires", async () => {
  pinsPublishing(() => { const e = new Error("BAD_ARGS: user"); e.code = "BAD_ARGS"; throw e; });
  consoleLines.length = 0;
  const seen = await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.town, x: 7, y: 8, scale: 1 } }));
  assert.deepEqual(views, [[IDS.cave, {}]], "the unpinned rules");
  assert.deepEqual(pans.at(-1), { x: 7, y: 8, scale: 1 });
  assert.deepEqual(seen, [{ scene: IDS.cave, level: null, position: { x: 7, y: 8, scale: 1 } }]);
  assert.deepEqual(consoleLines, [["warn", `${MODULE} | pentaryn-pins pinnedToken() failed; resuming as unpinned`]]);
});

test("a GM carrying a pin flag (a promoted player) resumes as stock: pins is never asked for a GM", async () => {
  let asked = 0;
  // a pins that would still answer for a GM: resume must not take the pinned branch anyway
  pinsPublishing(() => { asked++; return { token: "Scene.x.Token.y", actor: "Actor.z", scene: IDS.town, level: null, x: 0, y: 0 }; });
  game.user.isGM = true;
  try {
    const seen = await resumedDuring(() => login({ saved: { scene: IDS.cave, level: IDS.caveLower, active: IDS.town, x: 3, y: 4, scale: 1 } }));
    assert.deepEqual(views, [[IDS.cave, { level: IDS.caveLower }]], "stock restore, with its level");
    assert.deepEqual(seen, [{ scene: IDS.cave, level: IDS.caveLower, position: { x: 3, y: 4, scale: 1 } }]);
    assert.equal(asked, 0);
  } finally {
    game.user.isGM = false;
  }
});

test("pinning off or unpinned (pinnedToken null): the unpinned rules", async () => {
  pinsPublishing(null);
  await resumedDuring(() => login({ saved: { scene: IDS.cave, active: IDS.town } }));
  assert.deepEqual(views, [[IDS.cave, {}]]);
});

test("describe().flags.reads declares the pins API read", () => {
  assert.deepEqual(game.modules.get(MODULE).api.describe().flags, { writes: [], reads: ["api:pentaryn-pins.pinnedToken"] });
});

test("a throw inside our own handler is logged with the module prefix and never reaches Foundry", () => {
  consoleLines.length = 0;
  const caught = F.hookErrors.length;
  F.fire("canvasPan", { get scene() { throw new Error("boom"); } }, {});
  assert.deepEqual(consoleLines, [["error", `${MODULE} | canvasPan: remember`]]);
  assert.equal(F.hookErrors.length, caught, "the guard must catch it before Foundry's Hooks.#call does");
});

test("a throw in someone else's listener is Foundry's to report, not ours", async () => {
  const id = Hooks.on(HOOKS.resumed.name, function downstream() { throw new Error("listener broke"); });
  consoleLines.length = 0;
  await login({ saved: { scene: IDS.cave, active: IDS.town } });
  Hooks.off(HOOKS.resumed.name, id);
  const msg = `Error thrown in hooked function 'downstream' for hook '${HOOKS.resumed.name}'`;
  assert.deepEqual(consoleLines, [["warn", `Foundry VTT | ${msg}`], ["error", `Error: ${msg}. listener broke`]]);
  assert.equal(canvas.scene.id, IDS.cave, "the restore itself still happened");
});

const LABELS = ["canvasPan: remember", "canvasReady: remember", "updateScene: active", "ready: resume"];

test("hook registration manifest (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtReady, import.meta.url);
  // the live API: each login() re-imported the entry and unwound the one before
  assert.deepEqual(game.modules.get(MODULE).api.describe().hooks.map(h => h.label), LABELS);
});

test("describe() has the use-doc §5.1a key set every namespace shares (small and full alike)", () => {
  assert.deepEqual(Object.keys(api.describe()), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(Object.keys(game.pentaryn.describe().namespaces), [NS]);
});


// Keep this test LAST: it replaces the published API.
// A hot patch re-runs the WIRING only: the entry's static imports (features, api, settings, core,
// lib/) are the instances already loaded, so this proves re-registration and republish of the same
// code — never that edited feature code is picked up (that needs a reload).
test("hot patch: uninstall(), re-import the entry, and the wiring runs again", async () => {
  await login({ saved: null });
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("canvasPan"), 0);
  assert.equal(game.ready, true);
  consoleLines.length = 0;
  F.calls.length = 0;
  await import(`../resume.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, [], "the re-run must not throw");
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(F.listeners("canvasPan"), 1);
  assert.deepEqual(fresh.describe().hooks.map(h => h.label), LABELS);
  // no login to restore after a hot patch: saving is live at once
  F.fire("canvasReady", canvas);
  canvas.pan({ x: 10, y: 20, scale: 1 });
  await new Promise(resolve => setTimeout(resolve, SAVE_DELAY + 50));
  assert.equal(flag().x, 10);
});
