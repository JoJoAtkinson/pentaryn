// Failure path of the ready eye migration (corpses.mjs): a throw outside its per-actor try/catch
// (here the token walk's `t.actor.effects.some`) reaches the kit guard as a rejected promise and is
// logged with the module and label, not as an anonymous "Uncaught (in promise)".
import { test } from "node:test";
import assert from "node:assert/strict";
import { addScene, dropbinWorld } from "./fixtures/world.mjs";

const F = await dropbinWorld();
const broken = { name: "Broken", effects: { some() { throw new Error("effects gone"); }, filter: () => [] } };
addScene(F, { id: "sceneMig00000001", name: "Crypt", tokens: [{ id: "tokMig0000000001", name: "Broken", actor: broken }] });
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

test("a rejected eye migration is logged as `pentaryn-dropbin | corpse eye migration`", async () => {
  const unhandled = [];
  const onUnhandled = err => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  const lines = [];
  const keep = { error: console.error, warn: console.warn, log: console.log };
  const rec = level => (...a) => lines.push([level, ...a.map(x => (x instanceof Error ? `Error: ${x.message}` : String(x)))]);
  Object.assign(console, { error: rec("error"), warn: rec("warn"), log: rec("log") });
  try {
    F.fire("ready");
    await flush();
    await new Promise(r => setImmediate(r));
  } finally {
    Object.assign(console, keep);
    process.off("unhandledRejection", onUnhandled);
  }
  assert.ok(lines.some(l => l[0] === "error" && l[1] === "pentaryn-dropbin | corpse eye migration" && l[2] === "Error: effects gone"),
    JSON.stringify(lines));
  assert.deepEqual(unhandled, [], "no anonymous unhandled rejection");
  assert.equal(F.hookErrors.length, 0);
});
