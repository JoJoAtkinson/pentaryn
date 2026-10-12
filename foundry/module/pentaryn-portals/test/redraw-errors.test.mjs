// Finding -27 (rest): the badge draws nobody awaits — canvasReady, the Portal card's edit toggle
// (setEditing) and the debounced region-hook redraw — warn `pentaryn-portals | badge redraw failed`
// when the draw rejects, instead of leaving an unattributed "Uncaught (in promise)".
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { boot, console$ } from "./fixtures/world.mjs";

const { F, S, W } = await boot();
await W.tick();

const since = n => console$.slice(n).map(([level, text]) => [level, text]);

const unhandled = [];
process.on("unhandledRejection", err => unhandled.push(err));

/** Run `fn` with a canvas whose interface layer refuses the badge layer (drawBadges rejects). */
async function withFailingDraw(fn) {
  F.canvas.ready = true;
  F.canvas.scene = W.scene({ id: `RedrawErr${Math.random().toString(36).slice(2, 8)}`, name: "Err" });
  const addChild = F.canvas.interface.addChild;
  F.canvas.interface.addChild = () => { throw new Error("interface layer gone"); };
  const n = console$.length;
  const u = unhandled.length;
  try {
    await fn();
    await W.flush();
    await new Promise(r => setImmediate(r));
  } finally {
    F.canvas.interface.addChild = addChild;
    F.canvas.ready = false;
  }
  return { logged: since(n), unhandled: unhandled.slice(u) };
}

test("canvasReady: a failed draw warns 'badge redraw failed' once, nothing unhandled", async () => {
  const out = await withFailingDraw(() => F.fire("canvasReady"));
  assert.deepEqual(out.logged, [["warn", "pentaryn-portals | badge redraw failed"]]);
  assert.ok(console$.at(-1)[2] instanceof Error);
  assert.deepEqual(out.unhandled, []);
});

test("setEditing (the Portal card's edit toggle): a failed draw warns once, nothing unhandled", async () => {
  const region = { uuid: "Scene.RedrawErr.Region.R" };
  const out = await withFailingDraw(() => S.setEditing(region, true));
  S.setEditing(region, false); // canvas is down again: no draw
  assert.deepEqual(out.logged, [["warn", "pentaryn-portals | badge redraw failed"]]);
  assert.deepEqual(out.unhandled, []);
});

test("the debounced region-hook redraw: a failed draw warns once, nothing unhandled", async () => {
  const out = await withFailingDraw(() => { F.fire("updateRegion"); mock.timers.tick(50); });
  assert.deepEqual(out.logged, [["warn", "pentaryn-portals | badge redraw failed"]]);
  assert.deepEqual(out.unhandled, []);
});

test("a draw that succeeds logs nothing (the catch is pass-through)", async () => {
  F.canvas.ready = true;
  F.canvas.scene = W.scene({ id: "RedrawOk0000001", name: "Ok" });
  const n = console$.length;
  F.fire("canvasReady");
  await W.flush();
  assert.deepEqual(since(n), []);
  assert.equal(F.canvas.interface.children.length, 1);
  F.canvas.ready = false;
});
