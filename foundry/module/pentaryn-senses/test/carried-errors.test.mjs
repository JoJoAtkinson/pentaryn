/**
 * Finding -15 [declared S-7, console-only]: a debounced carried-light sync that fails warns
 * `pentaryn-senses | carried light <name> (<id>)` instead of leaving an unhandled rejection (which
 * would also fail this node:test file).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, flush, captureConsole, standardWorld, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
const F = await boot({ world });
await settle(mock);

test("a failing debounced sync warns with the module and the actor; nothing unhandled", async t => {
  const unhandled = [];
  const onUnhandled = e => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  const out = captureConsole(t);
  const hero = game.actors.get(ID.hero);
  hero.items.get(ID.torch).flags[MODULE] = { lit: true };
  game.scenes.get(ID.s1).throwOnUpdate = "scene down";
  F.fire("updateActor", hero);
  await settle(mock);
  await flush();
  game.scenes.get(ID.s1).throwOnUpdate = null;
  process.off("unhandledRejection", onUnhandled);
  // the prototype write succeeds and its updateActor schedules one more (failing) sync: two lines
  const warns = out.filter(l => l[0] === "warn").map(l => l.slice(0, 3));
  assert.ok(warns.length >= 1);
  for (const w of warns) assert.deepEqual(w, ["warn", `${MODULE} | carried light Marrith (${ID.hero})`, "Error: scene down"]);
  assert.deepEqual(unhandled, []);
});
