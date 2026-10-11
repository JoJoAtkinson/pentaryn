// Finding -27 (rest): the GM badge menu's actions are async (Look at pans, Teleport party writes).
// A failed action logs `pentaryn-portals | badge menu` at error through the hook registry's
// pass-through guard instead of an unattributed "Uncaught (in promise)"; a good one logs nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, console$ } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
await W.tick();

const since = n => console$.slice(n).map(([level, text]) => [level, text]);
const unhandled = [];
process.on("unhandledRejection", err => unhandled.push(err));

let seq = 0;
async function menuOnCanvas() {
  const P = places(W, `M${++seq}`);
  F.canvas.ready = true;
  F.canvas.scene = P.prison;
  await S.drawBadges();
  S.openMenu(S.badges[0], { clientX: 0, clientY: 0 });
  return { P, menu: S.state().menu };
}

test("a Look at that fails logs 'pentaryn-portals | badge menu' at error; the menu still closes", async () => {
  const { menu } = await menuOnCanvas();
  const pan = F.canvas.animatePan;
  F.canvas.animatePan = async () => { throw new Error("pan refused"); };
  const n = console$.length;
  const u = unhandled.length;
  const listener = menu.listeners.find(l => l.type === "click").fn;
  const out = listener({ target: menu.querySelector('a[data-i="0"]') });
  await assert.rejects(out, /pan refused/, "pass-through: the listener's own promise still rejects");
  await W.flush();
  F.canvas.animatePan = pan;
  assert.deepEqual(since(n), [["error", "pentaryn-portals | badge menu"]]);
  assert.deepEqual(unhandled.slice(u), []);
  assert.equal(S.state().menu, null);
  F.canvas.ready = false;
});

test("a Look at that succeeds logs nothing and pans", async () => {
  const { menu } = await menuOnCanvas();
  const n = console$.length;
  const c = F.calls.length;
  await menu.fire("click", { target: menu.querySelector('a[data-i="0"]') });
  await W.flush();
  assert.deepEqual(since(n).filter(([level]) => level !== "info"), []);
  assert.equal(W.callsSince(c, ["animatePan"]).length, 1);
  F.canvas.ready = false;
});
