// Two tabs on one player account (movement-edge-3, also movement-async-2): a client setting written
// in one tab reaches the other only as a window "storage" event (Foundry keeps client settings in
// localStorage, and the other tab's onChange never runs). The feature listens for the two client
// keys it caches and drops the ghost context there too; nothing is written, and uninstall removes it.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, token } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });
globalThis.window = new EventTarget();
const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const MODULE = "pentaryn-movement";

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(60);
    for (let j = 0; j < 20; j++) await Promise.resolve();
  }
};
/** The other tab's write: the shared localStorage value changes, this tab's onChange does not run. */
async function otherTabWrites(key, value) {
  const row = game.settings.settings.get(`${MODULE}.${key}`);
  const onChange = row.onChange;
  row.onChange = null;
  try { await game.settings.set(MODULE, key, value); } finally { row.onChange = onChange; }
}
const storageEvent = key => Object.assign(new Event("storage"), { key });
const meshOf = () => {
  const t = token({ owner: true, sort: 1 });
  F.fire("refreshToken", t, { refreshState: true });
  return t.mesh;
};

test("movement-edge-3: the other tab's ghost toggle drops this tab's cached ghost context", async () => {
  await game.settings.set(MODULE, "ghost", true);
  await settle();
  assert.equal(meshOf().alpha, 0.55, "ghost on here");

  await otherTabWrites("ghost", false);
  assert.equal(meshOf().alpha, 0.55, "no event yet: the cache still says on");
  window.dispatchEvent(storageEvent(`${MODULE}.ghost`));
  assert.equal(meshOf().alpha, 1, "the storage event re-reads: ghost off in this tab too");
  const from = F.calls.length;
  await settle();
  assert.ok(F.calls.slice(from).some(c => c.op === "controls.render"), "the button redraws (queued refresh)");
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "settings.set"), [], "nothing is written");
});

test("movement-edge-3: the other tab's owned-on-top toggle redraws this tab's tokens", async () => {
  assert.notEqual(meshOf().sort, 1, "owned token lifted");
  await otherTabWrites("ownedOnTop", false);
  const from = F.calls.length;
  window.dispatchEvent(storageEvent(`${MODULE}.ownedOnTop`));
  assert.equal(meshOf().sort, 1, "no lift after the event");
  assert.ok(F.calls.slice(from).some(c => c.op === "setAllRenderFlags"), "tokens redrawn");
  await otherTabWrites("ownedOnTop", true);
  window.dispatchEvent(storageEvent(`${MODULE}.ownedOnTop`));
  await settle();
});

test("movement-edge-3: other keys are ignored, and uninstall removes the listener", async () => {
  assert.equal(meshOf().alpha, 1, "cache primed: ghost off");
  await otherTabWrites("ghost", true);
  window.dispatchEvent(storageEvent("some-other-module.ghost"));
  window.dispatchEvent(storageEvent("constructor"));
  window.dispatchEvent(storageEvent(null));
  assert.equal(meshOf().alpha, 1, "an unrelated key leaves the cache alone");
  window.dispatchEvent(storageEvent(`${MODULE}.ghost`));
  assert.equal(meshOf().alpha, 0.55);
  await settle();

  game.modules.get(MODULE).api.uninstall();
  const from = F.calls.length;
  window.dispatchEvent(storageEvent(`${MODULE}.ownedOnTop`));
  window.dispatchEvent(storageEvent(`${MODULE}.ghost`));
  await settle();
  assert.deepEqual(F.calls.slice(from), [], "no handler runs after uninstall");
});
