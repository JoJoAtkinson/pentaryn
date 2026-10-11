// The hook manifest (guide step 1.6), pinned in golden/hooks.json: today's registration order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { journalWorld } from "./fixtures/world.mjs";

const F = await journalWorld();
await import("../journal.mjs");

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
  assert.deepEqual(F.hooks.map(h => `${h.kind}:${h.name}`), [
    "once:init", "once:ready", "on:createUser", "on:activateNote", "on:renderJournalEntrySheet", "on:renderImagePopout",
    "on:renderItemSheet5e", "on:closeJournalEntrySheet", "on:createJournalEntryPage", "on:updateJournalEntryPage",
    "on:deleteJournalEntryPage", "on:createJournalEntry", "on:deleteJournalEntry", "on:updateItem", "once:ready",
  ]);
});
