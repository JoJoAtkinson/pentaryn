// ready when the patch targets throw on access: each of today's ready listeners fails on its own,
// warns its own text, and the others (and the publish) still run. The refactor folds them into one
// ready listener (guide §2.2); this pins that one patch's failure must not stop the rest.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");

test("throwing patch targets: three warn texts, and the API is still published", () => {
  F.fire("init");
  Object.defineProperty(F.CONFIG.DND5E, "activityTypes", { get() { throw new Error("no activity types"); } });
  Object.defineProperty(F.foundry.applications, "ux", { get() { throw new Error("no ux"); } });
  Object.defineProperty(F.CONFIG, "ARGON", { get() { throw new Error("no argon"); } });
  F.fire("ready");
  mock.timers.tick(0);
  const ours = W.lines.filter(l => l[1].startsWith(`${MODULE} |`));
  for (const want of [
    ["warn", `${MODULE} | tooltip roll data skipped`, "no ux"],
    ["warn", `${MODULE} | Place Summons default not installed`, "no activity types"],
    ["warn", `${MODULE} | summon wildcard preview skipped`, "no activity types"],
  ]) assert.ok(ours.some(l => JSON.stringify(l) === JSON.stringify(want)), want[1]);
  assert.equal(typeof F.game.pentaryn.riders.report, "function");
});
