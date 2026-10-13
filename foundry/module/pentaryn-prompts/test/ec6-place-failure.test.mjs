/**
 * prompts-core-EC-6 [declared]: a P key / `api.place` whose token data cannot be built (the size
 * setting unreadable, the actor's token document refused) logs, cancels its type-ahead ticket and
 * returns null — it never rejects with the keys still captured. onPlaceKey also cancels its ticket
 * on any rejection, so a key press can never leave the keyboard swallowed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const NOW = 1760000000000;

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
await captureConsole(() => F.fire("setup"));
await captureConsole(() => F.fire("ready"));
const T = await import("../typeahead-adapter.mjs");
const P = await import("../placement.mjs");

/** game.settings.get throws for the default size while `fn` runs. */
async function withBrokenSize(fn) {
  const get = F.game.settings.get;
  F.game.settings.get = (ns, key) => {
    if (ns === MODULE && key === "defaultSize") throw new Error("stub: setting unreadable");
    return get.call(F.game.settings, ns, key);
  };
  try { return await fn(); } finally { F.game.settings.get = get; }
}

/** The mid marker actor's token document throws while `fn` runs. */
async function withBrokenTokenData(fn) {
  const actor = F.game.actors.get("markerActormid00");
  const proto = actor.prototypeToken;
  actor.prototypeToken = { get texture() { throw new Error("stub: token data refused"); } };
  try { return await fn(); } finally { actor.prototypeToken = proto; }
}

test("prompts-core-EC-6: placeAtCursor — unreadable size setting logs, cancels the ticket, returns null", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const { value, out } = await captureConsole(() => withBrokenSize(() => P.placeAtCursor(null)));
  assert.equal(value, null);
  assert.equal(T.isCapturing(), false, "the type-ahead ticket is cancelled");
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | placing a prompt marker failed Error(stub: setting unreadable)"]);
});

test("prompts-core-EC-6: api.place — token data refused logs, cancels the ticket, returns null", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const { value, out } = await captureConsole(() => withBrokenTokenData(() => F.game.pentaryn.prompts.place("mid")));
  assert.equal(value, null);
  assert.equal(T.isCapturing(), false, "the type-ahead ticket is cancelled");
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | placing a prompt marker failed Error(stub: token data refused)"]);
});

test("prompts-core-EC-6: the P key with a failing placement leaves no keys captured and no rejection", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const place = F.game.keybindings.actions.get("pentaryn-prompts.place");
  F.game.settings.set(MODULE, "defaultSize", "mid");
  const { out } = await captureConsole(() => withBrokenTokenData(async () => {
    assert.equal(place.onDown(), true);
    assert.equal(T.isCapturing(), true, "capturing from the key press on");
    await flush(); await flush();
  }));
  assert.equal(T.isCapturing(), false, "the ticket is cancelled when placement fails");
  assert.equal(out.length, 1);
});

test("prompts-core-EC-6: onPlaceKey cancels its ticket if placeAtCursor ever rejects", () => {
  const src = P.onPlaceKey.toString();
  assert.match(src, /placeAtCursor\([^)]*\)\.catch\(\(\) => cancelTyping\(ticket\)\)/);
});
