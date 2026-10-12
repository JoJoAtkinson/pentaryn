// combat-riders-37: every timer delay is a named DELAYS entry (values as they were inline).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import { DELAYS, hudFollowPlan } from "../combat-core.mjs";

test("DELAYS is frozen; the tidy order holds; the HUD-follow rechecks are the old literals", () => {
  assert.ok(Object.isFrozen(DELAYS));
  assert.ok(Object.isFrozen(DELAYS.hudFollowRecheck));
  assert.ok(DELAYS.tidyAfterSequence > DELAYS.tidyLook, "the stopped run's tidy comes after the close hook's own look");
  assert.deepEqual(hudFollowPlan({ enabled: true, owner: true, onScene: true, argonOn: false, combatStart: true }).recheck, [300, 1200]);
  assert.deepEqual({ ...DELAYS, hudFollowRecheck: [...DELAYS.hudFollowRecheck] }, {
    seedAfterReady: 0, seedAfterCreate: 500, focusRetry: 150, pickerArm: 0, damagePoll: 150, tidyAfterSequence: 400,
    tidyLook: 250, useFallback: 400, pulse: 12000, rerender: 60, afterArgon: 0, cardRerender: 50,
    hudFollowRecheck: [300, 1200], orphanSweep: 1500, followLeft: 150, helperReselect: 0, movementRedraw: 50,
  });
});

test("no numeric literal as a setTimeout / debounce delay outside core/timing.mjs", () => {
  const hits = sourceScan(new URL("..", import.meta.url), /(?:setTimeout\([^;]*,\s*\d+\s*\)|debounce\([^,]+,\s*\d+\s*\)|^\s*\},\s*\d+\);)/)
    .filter(h => h.file !== "core/timing.mjs").map(h => `${h.file}:${h.line}`);
  assert.deepEqual(hits, []);
});
