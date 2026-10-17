/**
 * `place(sizeKey, { at })` (0.4.6, pins plan §2): the pins GM menu's "Prompt note" captures the
 * clicked canvas point before its item is picked, and passes it as `at`. The marker is centred on
 * `at`, not under the cursor; the P key passes no `at` and still places under the cursor
 * (glue.test's `place-token-data` golden is that pin).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const NOW = 1760000000000;

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
await captureConsole(() => F.fire("setup"));
await captureConsole(() => F.fire("ready"));
const { PromptDialog } = await import("../dialog.mjs");

const lastCreate = () => F.calls.filter(c => c.op === "createEmbeddedDocuments").at(-1);

test("place(null, { at }) centres the marker on at while canvas.mousePosition is elsewhere", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  assert.deepEqual(F.canvas.mousePosition, { x: 550, y: 350 }, "the cursor is somewhere else");
  const tok = await F.game.pentaryn.prompts.place(null, { at: { x: 1250, y: 750 } });
  assert.ok(tok, "a token was created");
  const [data] = lastCreate().data;
  assert.deepEqual([data.x, data.y, data.width], [1200, 700, 1], "a mid marker's centre is at");
  await PromptDialog.current?.close();
  t.mock.timers.tick(4000);
});

test("place(null) without at still centres under the cursor", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await F.game.pentaryn.prompts.place(null);
  assert.ok(tok);
  const [data] = lastCreate().data;
  assert.deepEqual([data.x, data.y], [500, 300]);
  await PromptDialog.current?.close();
  t.mock.timers.tick(4000);
});
