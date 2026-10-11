/**
 * Characterisation (senses checkpoint, wave 3): the hook manifest the entry registers at import,
 * in order (glow → chain → light → senses), and what each published `uninstall` takes away.
 * Frozen once committed. The plan's step 5 drops chain's own `once ready` (golden index 10) in a
 * separate [declared, registration-only] commit; every other position must stay identical.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot({ init: false, ready: false });

test("hooks: the registration manifest at import, in order", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
});

test("hooks: listener counts before init", () => {
  assert.deepEqual(F.listeners(), {
    // [declared S-3] chain's own `once ready` is gone: the entry's ready publishes the chain alias.
    init: 2, ready: 1,
    canvasTearDown: 2, canvasReady: 1, refreshToken: 1, destroyToken: 1, createToken: 3, deleteToken: 2, updateToken: 1,
    renderTokenHUD: 2, "dnd5e.preUseActivity": 1, "dnd5e.postUseActivity": 1, "dnd5e.renderChatMessage": 1,
    renderBaseActorSheet: 1, createItem: 2, updateItem: 2, deleteItem: 2, deleteActor: 1, deleteAmbientLight: 1,
    updateAmbientLight: 1, deleteScene: 1, updateActor: 1, createActiveEffect: 1, updateActiveEffect: 1, deleteActiveEffect: 1,
  });
});

test("hooks: init and ready are once-hooks and leave nothing behind", async () => {
  F.fire("init");
  F.fire("ready");
  await new Promise(r => setImmediate(r));
  assert.equal(F.listeners("init"), 0);
  assert.equal(F.listeners("ready"), 0);
  assert.equal(F.hooks.length, 34, "nothing registers after import ([declared S-3]: 35 → 34)");
});

test("hooks: chain.uninstall() removes chain's 8 listeners, light.uninstall() light's 15; carried and glow have none", () => {
  const before = F.listeners();
  game.pentaryn.chain.uninstall();
  const afterChain = F.listeners();
  game.pentaryn.senses.light.uninstall();
  const afterLight = F.listeners();
  pinJSON("hooks-uninstall", { before, afterChain, afterLight }, import.meta.url);
  // what remains is the carried-light path (senses.mjs), which has no uninstall
  assert.deepEqual(afterLight, {
    createToken: 1, createItem: 1, updateItem: 1, deleteItem: 1, updateActor: 1,
    createActiveEffect: 1, updateActiveEffect: 1, deleteActiveEffect: 1,
  });
});

// Added at guide step 5 (C18): every feature exports install/uninstall and none self-installs —
// the 35 registrations above all come from the entry's install(), labelled per feature.
test("features: install and uninstall exported; registrations labelled by feature", async () => {
  for (const f of ["glow", "chain", "light", "carried", "migrate"]) {
    const m = await import(`../${f}.mjs`);
    assert.equal(typeof m.install, "function", `${f}.install`);
    assert.equal(typeof m.uninstall, "function", `${f}.uninstall`);
  }
});
