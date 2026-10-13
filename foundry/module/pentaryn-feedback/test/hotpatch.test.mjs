// A hot patch (uninstall, then re-import the entry) while the active GM is part-way through filing a
// report. Own process (node --test runs each file alone): the re-import replaces the published API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, WORLD, installClient, memoryStore, queuedReport, settle } from "./fixtures/world.mjs";
import { MODULE } from "../feedback-core.mjs";

const F = await installClient();
const { useStore } = await import("../files-adapter.mjs");
const mem = memoryStore();
/** put() waits on a gate the test opens, so an ingest can be held mid-write. */
let open = () => {};
const gate = new Promise(r => { open = r; });
const puts = [];
useStore({
  ...mem,
  async put(path, value) {
    puts.push(path);
    await gate;
    return mem.put(path, value);
  },
});

await import("../feedback.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await settle();

test("feedback-async-4: a hot re-install while a report is mid-filing files it exactly once", async () => {
  const player = game.users.get(IDS.player);
  const report = queuedReport("hotpatchfiling01", { t: Date.now(), text: "filed across a hot patch" });
  await player.update({ [`flags.${MODULE}.queue.${report.id}`]: report });   // updateUser → ingest
  await settle(10);
  const path = `pentaryn-feedback/${WORLD}/${report.id}.json`;
  assert.deepEqual(puts, [path], "the first ingest is held inside put()");

  game.modules.get(MODULE).api.uninstall();
  await import(`../feedback.mjs?hot=${Date.now()}`);  // re-install: ready → ingestAll
  await settle(10);
  open();
  await settle(20);

  assert.deepEqual(puts, [path], "one put per report id: the re-install's ingest waits for the one in flight");
  assert.ok(mem.files.has(path));
  assert.deepEqual(player.flags?.[MODULE]?.queue ?? {}, {}, "the queue entry is cleared");
});
