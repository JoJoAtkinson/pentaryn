// The hook manifest (guide step 1.6), pinned in golden/hooks.json, plus the ready tick on a world with
// no dnd5e tooltips (game.dnd5e undefined): the API still publishes.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { attunementWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await attunementWorld({ withTooltips: false });
await import("../attunement.mjs");

test("registration manifest equals golden/hooks.json (today's order)", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), [
    "once:init", "once:ready", "on:renderBaseActorSheet", "on:preUpdateItem", "on:preCreateItem", "on:createItem",
  ]);
});

test("game.dnd5e undefined: the ready tick still publishes", () => {
  assert.equal(game.dnd5e, undefined);
  const log = console.log;
  console.log = () => {};
  try {
    F.fire("init");
    F.fire("ready");
    mock.timers.tick(0);
  } finally {
    console.log = log;
  }
  assert.equal(typeof game.pentaryn.attunement.report, "function");
});
