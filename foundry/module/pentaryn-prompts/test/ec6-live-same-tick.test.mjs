/**
 * EC-6 live (FIX-3, 2026-10-13): two PromptDialog.open() calls on one marker in the same tick (a
 * fast double-click, or Shift+P twice) — the second found the first's box before its first render
 * and called bringToFront(), which core answers by reading `element.style` on an element that is
 * not there yet. The second open rejected with a TypeError nobody caught. Now an unrendered box is
 * not brought forward (its own first render puts it on top); both opens get the one box.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const { PromptDialog } = await import("../dialog.mjs");

test("EC-6 live: two opens of one marker in the same tick share one box and neither rejects", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: "a well" } } }], { pentarynPrompts: { test: "ec6-live" } });
  const [a, b] = await Promise.all([PromptDialog.open(tok), PromptDialog.open(tok)]);
  assert.ok(a, "the first open returns a box");
  assert.equal(b, a, "the second open is handed the same box");
  assert.equal(PromptDialog.current, a);
  assert.ok(a.rendered, "the box is open");
  assert.equal(a.renders.length, 1, "one render, one box");
  // once rendered, a third open still brings it forward
  const c = await PromptDialog.open(tok);
  assert.equal(c, a);
  assert.equal(F.calls.at(-1).op, "app.bringToFront");
  await a.close();
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});
