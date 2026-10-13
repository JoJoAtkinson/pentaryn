// The hook manifest (guide step 1.6): the 33 load-time registrations, in today's order, pinned in
// golden/hooks.json (the post-ready sequence is pinned in glue.test as golden/hooks-after-ready.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { dropbinWorld } from "./fixtures/world.mjs";

const F = await dropbinWorld();
await import("../dropbin.mjs");

test("load-time registrations equal golden/hooks.json", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), [
    // corpses
    "on:updateActor", "on:createActiveEffect", "on:deleteActiveEffect", "on:updateActiveEffect", "on:drawToken", "on:refreshToken",
    "on:canvasReady", "on:updateToken", "on:updateActor", "on:createItem", "on:updateItem", "on:deleteItem", "once:ready", "on:renderTokenHUD",
    "on:item-piles-preRenderActorSheet", "on:deleteToken", "on:deleteScene", "once:ready",
    // loot
    "on:renderItemPileInventoryApp", "on:item-piles-openInterface", "on:updateActor", "on:createItem", "on:updateItem", "on:deleteItem", "on:updateToken",
    // shim, entry, ledger, item piles
    "once:i18nInit", "once:init", "once:socketlib.ready", "once:ready", "once:ready", "on:renderActorDirectory", "on:renderJournalDirectory", "once:ready",
  ]);
});
