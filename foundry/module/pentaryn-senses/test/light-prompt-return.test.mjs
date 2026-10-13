/**
 * senses-EXT-11 (final review 2026-10-12): `light.prompt` resolves boolean | undefined, as its
 * describe row says. Choosing "On me" with no scene viewed, or with no token of the caster on the
 * viewed scene, warns and resolves false; it no longer resolves to the notification object
 * ui.notifications.warn returns. onMe itself returns false in the same two cases.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, settle, ID, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const F = await boot({ world: standardWorld() });
await settle(mock);
const L = () => game.pentaryn.senses.light;
const lightItem = () => game.actors.get(ID.hero).items.get(ID.light);

/** Run `fn` with the canvas viewing `scene`, then restore it. → [value, warnings] */
async function withScene(scene, fn) {
  const before = F.canvas.scene;
  const mark = F.calls.length;
  F.canvas.scene = scene;
  try {
    const value = await fn();
    const warns = F.calls.slice(mark).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
    return [value, warns];
  } finally { F.canvas.scene = before; }
}

test("senses-EXT-11: onMe with no scene viewed warns and returns false", async () => {
  const [value, warns] = await withScene(null, () => L().onMe(lightItem()));
  assert.equal(value, false);
  assert.deepEqual(warns, [_loc("PENTARYN_SENSES.Light.NoScene")]);
});

test("senses-EXT-11: onMe with no caster token on the viewed scene warns and returns false", async () => {
  const empty = { id: "scnEmpty00000001", tokens: [] };   // a viewed scene with no token of Marrith's
  const [value, warns] = await withScene(empty, () => L().onMe(lightItem()));
  assert.equal(value, false);
  assert.deepEqual(warns, [_loc("PENTARYN_SENSES.Light.NoToken")]);
});

test("senses-EXT-11: prompt → On me with no scene resolves false, never the notification", async () => {
  F.dialogChoice = "me";
  try {
    const [value, warns] = await withScene(null, () => L().prompt(lightItem()));
    assert.equal(value, false);
    assert.deepEqual(warns, [_loc("PENTARYN_SENSES.Light.NoScene")]);
  } finally { F.dialogChoice = null; }
});
