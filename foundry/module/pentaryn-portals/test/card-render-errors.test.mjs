// portals-async-2 [declared]: the Portal card's add-destination, clear-image and unlink listeners
// await their re-render, and the header edit toggle goes through the guard. A re-render that fails
// logs `pentaryn-portals | <label>` at error instead of an unattributed "Uncaught (in promise)".
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, console$ } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { S, W } = await boot();
await W.tick();

const since = n => console$.slice(n).map(([level, text]) => [level, text]).filter(([level]) => level !== "info");
const unhandled = [];
process.on("unhandledRejection", err => unhandled.push(err));

let seq = 0;
/** Open a card, make every later render fail, run `act`, report what was logged and left unhandled. */
async function withFailingRender(region, edit, act) {
  const app = await S.PortalCard.open(region, { edit });
  app._renderHTML = async () => { throw new Error("render refused"); };
  const n = console$.length;
  const u = unhandled.length;
  let rejected = null;
  await act(app).catch(err => { rejected = err; });
  await W.flush();
  await new Promise(r => setImmediate(r));
  return { logged: since(n), unhandled: unhandled.slice(u), rejected };
}

test("portals-async-2: add destination awaits its re-render; a failed one logs 'card add destination'", async () => {
  const Q = places(W, `RE${++seq}`);
  const out = await withFailingRender(Q.passage, true, app =>
    app.element.querySelector('[data-act="addsel"]').fire("change", { target: { value: Q.stair.uuid } }));
  assert.deepEqual(out.logged, [["error", "pentaryn-portals | card add destination"]]);
  assert.deepEqual(out.unhandled, []);
  assert.match(String(out.rejected), /render refused/, "the listener's own promise waits for the render");
});

test("portals-async-2: clear image awaits its re-render; a failed one logs 'card clear image'", async () => {
  const Q = places(W, `RE${++seq}`);
  const out = await withFailingRender(Q.fork, true, app =>
    app.element.querySelector(`.ppt-editcard[data-uuid="${Q.pitGate.uuid}"] [data-act="clearimg"]`).click());
  assert.deepEqual(out.logged, [["error", "pentaryn-portals | card clear image"]]);
  assert.deepEqual(out.unhandled, []);
  assert.match(String(out.rejected), /render refused/);
});

test("portals-async-2: unlink awaits its re-render; a failed one logs 'card unlink'", async () => {
  const Q = places(W, `RE${++seq}`);
  const out = await withFailingRender(Q.fork, true, app =>
    app.element.querySelector(`.ppt-editcard[data-uuid="${Q.cell.uuid}"] [data-act="unlink"]`).click());
  assert.deepEqual(out.logged, [["error", "pentaryn-portals | card unlink"]]);
  assert.deepEqual(out.unhandled, []);
  assert.match(String(out.rejected), /render refused/);
});

test("portals-async-2: the header edit toggle is guarded; a failed re-render logs 'card edit toggle'", async () => {
  const Q = places(W, `RE${++seq}`);
  const out = await withFailingRender(Q.passage, false, app => {
    const box = app.element.querySelector(".ppt-toggle input");
    box.checked = true;
    return box.fire("change", { target: box });
  });
  assert.deepEqual(out.logged, [["error", "pentaryn-portals | card edit toggle"]]);
  assert.deepEqual(out.unhandled, []);
  assert.match(String(out.rejected), /render refused/);
  assert.equal(S.editing.has(Q.passage.uuid), true, "edit mode still turned on before the render");
});
