/**
 * R10 [declared] (final review ties-core, 2026-10-12; defect wave 2): a keybinding body that
 * rejects is logged through the module's log as `key <key> failed`, not left to surface as an
 * unprefixed "Uncaught (in promise)". The press stays synchronous and still swallows the key.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

await bootWorld({ importEntry: false });
const S = await import("../settings.mjs");

const errors = [];
const log = { error: (event, ...rest) => errors.push([event, ...rest]), warn() {}, info() {}, debug() {} };
S.registerSettings({ log });

test("R10: a rejected key body is logged as 'key <key> failed' (before: unhandled rejection)", async () => {
  const boom = new Error("ZZ R10 body failed");
  const unhandled = [];
  const onUnhandled = err => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    S.onKeys({ inspect: () => Promise.reject(boom) });
    const out = S.KEYBINDINGS.find(k => k.key === "inspect").onDown();
    assert.equal(out, true, "the press is still swallowed synchronously");
    await new Promise(r => setImmediate(r)); // setTimeout is mocked by the fixture
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, [], "nothing escapes as Uncaught (in promise)");
  assert.deepEqual(errors, [["key inspect failed", boom]]);
});

test("R10: a synchronous body that returns nothing logs nothing", () => {
  errors.length = 0;
  S.onKeys({ showOneTie: () => undefined });
  assert.equal(S.KEYBINDINGS.find(k => k.key === "showOneTie").onDown(), true);
  assert.deepEqual(errors, []);
});
