/**
 * Final code review (ties-ui-M9): study.preview(null) returned the warning notification object instead
 * of null — the manifest promises Promise<InspectPreview|null>, so a caller testing the result for a
 * window saw a truthy notification.
 * Ruling: warn "Hover or select a token to preview." and return null on a missing subject.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ actors: [] });
const { InspectPreview, openPreview } = await import("../preview-app.mjs");

test("ties-ui-M9: a missing subject warns and returns null", async () => {
  for (const open of [s => InspectPreview.open(s), openPreview]) {
    for (const subject of [null, undefined]) {
      const mark = F.calls.length;
      const out = await open(subject);
      assert.equal(out, null, "the result is null, not the notification");
      const warns = F.calls.slice(mark).filter(c => c.op === "notify" && c.level === "warn");
      assert.deepEqual(warns.map(c => c.message), ["Hover or select a token to preview."]);
    }
  }
});
