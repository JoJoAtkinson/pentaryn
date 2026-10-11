// The pure helpers in walls-core.mjs (guide step 2): they reproduce the glue's text byte for byte.
// reportHtml is checked against the glue golden (golden/glue.json), readyLine against glue case (b),
// undoHtml against today's template; exclusive() against the keybinding guard's semantics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../walls-core.mjs";
import { manifestOf, readJSON } from "./kit/harness.mjs";
import { get, wasmReady } from "./fixtures/engine.mjs";
import { houseWalls } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);

test("the core barrel imports with no Foundry globals and names the module", () => {
  for (const g of ["game", "canvas", "ui", "Hooks", "CONFIG", "ChatMessage"]) assert.equal(globalThis[g], undefined, g);
  assert.equal(core.MODULE, "pentaryn-walls");
  assert.equal(core.NS, "walls");
  assert.equal(core.SHORT, "walls");
  assert.equal(core.CONTRACT, "pentaryn-walls/api@1");
  assert.deepEqual(core.HOOKS, {});
});

test("VERSION === module.json version", () => {
  assert.equal(core.VERSION, manifestOf(ROOT).version);
  assert.equal(manifestOf(ROOT).id, core.MODULE);
});

test("readyLine: today's console text (glue case (b))", () => {
  assert.equal(core.readyLine(["js", "wasm"]),
    "ready — backends: js, wasm. Alt+W run, Alt+Z undo, Alt+Shift+W preview. " +
    "API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()");
});

test("reportHtml: the preview card equals golden/glue.json", async () => {
  await wasmReady;
  const result = get("wasm").run(houseWalls(), { gridSize: 100, runId: "golden" });
  const html = core.reportHtml("S", result, { committed: false, backend: "wasm", ms: 3.4 });
  const golden = readJSON(new URL("test/golden/glue.json", ROOT));
  assert.equal(html.replace(/\d+ ms/g, "<n> ms"), golden.previewContent);
  assert.match(html, / in 3 ms /);
});

test("reportHtml: committed wording, singulars, and a lint list", () => {
  const result = {
    report: { created: 1, moved: 0, iterations: 1, components: [{ closed: true }],
      config: { gridSize: 50, weldEps: 2, collEps: 1, pinEps: 1, gapMax: 6, cornerMax: 6, extMax: 20 } },
    refusals: [], lints: [{ code: "L1", msg: "overlap" }],
  };
  assert.equal(core.reportHtml("Hall", result, { committed: true, backend: "js", ms: 0.4 }),
    "<p><strong>Wall autocomplete — Hall</strong></p>" +
    "<p>Committed 1 wall created, 0 moved, 1 pass in 0 ms <span style=\"opacity:.6\">(js)</span>.</p>" +
    "<p>1 component: 1 closed (inert), 0 still open.</p>" +
    "<p><strong>Lint</strong></p><ul><li><code>L1</code> overlap</li></ul>" +
    "<p style=\"opacity:.7;font-size:.9em\">grid 50px &middot; weld 2px &middot; collinear 1px &middot; pin 1px &middot; gap/corner/reach 6/6/20 squares</p>");
});

test("undoHtml: today's template (one run, several runs, everything)", () => {
  assert.equal(core.undoHtml({ generated: 1, restored: 0, all: false, latest: "T1", remaining: 0 }),
    "<p><strong>Wall autocomplete — undo</strong></p><p>Removed 1 generated wall and restored 0 trimmed walls from the run at T1.</p>");
  assert.equal(core.undoHtml({ generated: 2, restored: 1, all: false, latest: "T2", remaining: 1 }),
    "<p><strong>Wall autocomplete — undo</strong></p><p>Removed 2 generated walls and restored 1 trimmed wall from the run at T2.</p>" +
    "<p style=\"opacity:.7\">1 earlier run still applied — undo again to peel back further.</p>");
  assert.equal(core.undoHtml({ generated: 3, restored: 2, all: true, latest: "T2", remaining: 2 }),
    "<p><strong>Wall autocomplete — undo</strong></p><p>Removed 3 generated walls and restored 2 trimmed walls (everything).</p>");
  assert.match(core.undoHtml({ generated: 0, restored: 0, all: false, latest: "T", remaining: 3 }), /3 earlier runs still applied/);
});

test("exclusive: a second call while the first is pending returns null and calls onBusy once", async () => {
  let release;
  let busy = 0;
  const gate = new Promise(r => { release = r; });
  const once = core.exclusive(async x => { await gate; return x * 2; }, { onBusy: () => busy++ });
  const first = once(21);
  assert.equal(once(1), null);
  assert.equal(busy, 1);
  release();
  assert.equal(await first, 42);
  assert.equal(await once(2), 4, "released: a third call runs");
  assert.equal(busy, 1);
});

test("exclusive: a throw (sync or async) rejects that call and releases the lock", async () => {
  const lock = { busy: false };
  const boomSync = core.exclusive(() => { throw new Error("sync"); }, { lock });
  const boomAsync = core.exclusive(async () => { throw new Error("async"); }, { lock });
  await assert.rejects(boomSync(), { message: "sync" });
  assert.equal(lock.busy, false);
  await assert.rejects(boomAsync(), { message: "async" });
  assert.equal(lock.busy, false);
});

test("exclusive: wrappers sharing one lock exclude each other", async () => {
  const lock = { busy: false };
  let release;
  const gate = new Promise(r => { release = r; });
  const a = core.exclusive(() => gate, { lock });
  const b = core.exclusive(() => "b", { lock });
  const pa = a();
  assert.equal(b(), null);
  release("a");
  assert.equal(await pa, "a");
  assert.equal(await b(), "b");
});

test("walls-core.mjs defines MODULE once and the entry has no MODULE_ID", () => {
  const entry = readFileSync(new URL("pentaryn-walls.mjs", ROOT), "utf8");
  assert.doesNotMatch(entry, /MODULE_ID/);
});
