// Failure path of the kit guard (declared: handlers report through `reg.on`'s guard). A handler
// that throws is logged as `pentaryn-dropbin | <label>` and later listeners still run; a rejected
// async handler is logged with its label instead of surfacing as an anonymous unhandled rejection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER, dropbinWorld } from "./fixtures/world.mjs";

const F = await dropbinWorld();
await import("../dropbin.mjs");
F.fire("init");

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function capture(fn) {
  const lines = [];
  const keep = { error: console.error, warn: console.warn, log: console.log };
  const rec = level => (...a) => lines.push([level, ...a.map(x => (x instanceof Error ? `Error: ${x.message}` : String(x)))]);
  Object.assign(console, { error: rec("error"), warn: rec("warn"), log: rec("log") });
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
  return lines;
}

test("a throwing corpse hp handler is logged with its label; a later listener still runs", async () => {
  let later = 0;
  Hooks.on("updateActor", () => { later++; });
  const actor = { uuid: "Actor.boom", isToken: false, getActiveTokens() { throw new Error("boom"); } };
  const lines = await capture(() => Hooks.callAll("updateActor", actor, { system: { attributes: { hp: { value: 5 } } } }));
  assert.deepEqual(lines, [["error", "pentaryn-dropbin | corpse: hp", "Error: boom"]]);
  assert.equal(F.hookErrors.length, 0, "Foundry's hook-error path saw nothing");
  assert.equal(later, 1);
});

test("a rejected async ready handler (the locks ready) is logged with its label", async () => {
  F.become({ userId: PLAYER });
  F.ui.actors = { render() { throw new Error("sidebar gone"); } };
  const lines = await capture(async () => {
    F.fire("ready");
    await flush();
  });
  assert.ok(lines.some(l => l[0] === "error" && l[1] === "pentaryn-dropbin | locks" && l[2] === "Error: sidebar gone"), JSON.stringify(lines));
  assert.equal(F.hookErrors.length, 0);
});
