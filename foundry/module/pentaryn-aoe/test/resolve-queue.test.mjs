// AC-6 (final review 2026-10-12, declared fix): resolve() wrote its fresh resolution straight to the
// message, outside the per-message mutate queue. A mutate already running on the old resolution
// (an NPC save landing, a row toggle) then wrote its copy back on top, so a re-resolve to another
// area came back with the old area's rows. The fresh write now queues behind any pending write on
// that message like every other write, so the re-resolve wins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);

test("AC-6 a re-resolve is not undone by a mutate that was already running on the old area", async () => {
  const msg = damage(W, ctx, { id: "dmgQueueAC600001", hook: true });
  await advance(800);
  await flush(8);
  assert.equal(resOf(msg.id).region, IDS.region, "first resolved off the area");

  let release;
  const gate = new Promise(r => { release = r; });
  const slow = R.mutate(msg.id, async r => { await gate; r.rows.forEach(row => { row.touched = true; }); return r; });
  await flush(2);                                     // the slow mutate has read the old resolution

  const again = R.resolve(msg.id, { regionId: null });
  await flush(8);                                     // today: the fresh write lands here, before the gate opens
  release();
  await slow;
  const res = await again;
  await flush(8);

  assert.equal(res.region, null, "resolve() returns the targets resolution");
  assert.equal(resOf(msg.id).region, null, "the message keeps the re-resolve, not the old area");
  assert.ok(resOf(msg.id).rows.every(row => !row.touched), "no row from the old area's copy");
  assert.equal(R.pendingWrites(), 0, "the queue drains");
});
