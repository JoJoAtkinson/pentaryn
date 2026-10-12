// Guide S4 (combat-riders-9): the kit log keeps every warn line byte-identical, and the swallowed
// catches that used to be empty now leave a debug line — silent unless CONFIG.debug["pentaryn-combat"].
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, captureConsole, makeMessage, setupWorld } from "./fixtures/world.mjs";
import { makeLog } from "../lib/log.mjs";

const W = await setupWorld();
const { F } = W;
const lines = captureConsole();
const debug = [];
console.debug = (...args) => debug.push(args);
const riders = await import("../riders.mjs");

test("log.warn prints `pentaryn-combat | <text>` once, with the error after it", () => {
  const log = makeLog(MODULE);
  const err = new Error("boom");
  log.warn("swing tag skipped", err);
  assert.deepEqual(lines.splice(0), [{ level: "warn", text: "pentaryn-combat | swing tag skipped", err: "boom" }]);
});

test("swallow: debug flag unset → the fallback and no line; set → the fallback and one debug line", () => {
  const log = makeLog(MODULE);
  const boom = () => { throw new Error("x"); };
  assert.equal(log.swallow("op", boom, 7), 7);
  assert.deepEqual(debug.splice(0), []);
  F.CONFIG.debug[MODULE] = true;
  try {
    assert.equal(log.swallow("op", boom, 7), 7);
    assert.equal(debug.length, 1);
    assert.equal(debug.splice(0)[0][0], "pentaryn-combat | op");
  } finally { delete F.CONFIG.debug[MODULE]; }
});

test("a former empty catch (riders: the message's associated activity) keeps its fallback and logs only at debug", () => {
  const msg = makeMessage({ id: "msgThrow00000001", type: "attack", system: { activity: null } });
  msg.getAssociatedActivity = () => { throw new Error("no activity"); };
  assert.deepEqual(riders.offersFor(msg), { actor: undefined, offers: [] });
  assert.deepEqual(debug.splice(0), []);
  assert.deepEqual(lines.splice(0), []);
  F.CONFIG.debug[MODULE] = true;
  try {
    assert.deepEqual(riders.offersFor(msg), { actor: undefined, offers: [] });
    assert.deepEqual(debug.splice(0).map(a => a[0]), ["pentaryn-combat | associated activity (falls through to the uuid)"]);
  } finally { delete F.CONFIG.debug[MODULE]; }
});
