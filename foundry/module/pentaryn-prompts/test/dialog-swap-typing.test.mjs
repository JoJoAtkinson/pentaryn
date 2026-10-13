/**
 * EC-4 (final review 2026-10-12, prompts-adapters): keys typed while a size chip swapped the marker
 * were lost. The swap carried `#saved` (the text as of its opening save) into the new marker's flag
 * and the re-render drew the textarea from `#saved` again, so anything typed during the swap's
 * awaits vanished. Now the swap snapshots the textarea at the end, carries that into the new marker
 * and the re-render, and schedules an autosave so later keys land on the new marker.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const NOW = 1760000000000;
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const { PromptDialog } = await import("../dialog.mjs");

const size = PromptDialog.DEFAULT_OPTIONS.actions.size;
const ta = app => app.element.querySelector("textarea[name=prompt]");
async function fresh(id, text) {
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: text } } }], { pentarynPrompts: { test: id } });
  return tok;
}
/** Run a swap to `large`, calling `act` once when the swap reaches `op`. */
async function midSwap(app, op, act) {
  let fired = false;
  const push = F.calls.push;
  F.calls.push = function (c) {
    const r = push.call(this, c);
    if (c?.op === op && !fired) { fired = true; act(); }
    return r;
  };
  try { await size.call(app, {}, { dataset: { size: "large" } }); } finally { F.calls.push = push; }
  return fired;
}

test("EC-4: keys typed while the new marker's data is built are carried onto it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("ec4-data", "a cart");
  const app = await PromptDialog.open(tok);
  const fired = await midSwap(app, "getTokenDocument", () => { ta(app).value = "a cart, overturned"; });
  assert.ok(fired, "typed mid-swap");
  const made = app.token;
  assert.notEqual(made.id, tok.id);
  assert.equal(made.flags[MODULE].prompt, "a cart, overturned", "the new marker is made with the text typed mid-swap");
  assert.equal(app.renders.at(-1).context.text, "a cart, overturned", "the re-render draws the text typed mid-swap");
  await app.close();
  await F.s1.deleteEmbeddedDocuments("Token", [made.id]);
});

test("EC-4: keys typed after the new marker is created survive the re-render and autosave onto it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("ec4-create", "a cart");
  const app = await PromptDialog.open(tok);
  const fired = await midSwap(app, "createEmbeddedDocuments", () => { ta(app).value = "a cart, burning "; });
  assert.ok(fired, "typed mid-create");
  const made = app.token;
  assert.equal(app.renders.at(-1).context.text, "a cart, burning ", "the re-render keeps the keys exactly as typed");
  t.mock.timers.tick(600);   // the autosave the swap scheduled (before close, which saves anyway)
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.equal(made.flags[MODULE].prompt, "a cart, burning", "the keys typed mid-swap autosaved onto the new marker");
  assert.ok(!F.s1.tokens.get(tok.id), "the old marker is gone");
  await app.close();
  await F.s1.deleteEmbeddedDocuments("Token", [made.id]);
});
