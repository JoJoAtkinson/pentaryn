/**
 * EC-6 (final review 2026-10-12, prompts-adapters): open() checked PromptDialog.current only before
 * it awaited the same marker's box still saving (Esc, then straight back in). Two opens racing
 * through that await each made a box, so two boxes edited one marker. Now open() re-checks after
 * the await: if a live box for this marker appeared meanwhile, it is brought forward and returned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const NOW = 1760000000000;
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const { PromptDialog } = await import("../dialog.mjs");

const ta = app => app.element.querySelector("textarea[name=prompt]");

test("EC-6: two opens racing past a closing box's save share one box, never two on one marker", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: "a well" } } }], { pentarynPrompts: { test: "ec6" } });
  const first = await PromptDialog.open(tok);
  const update = tok.update;
  let release;
  const gate = new Promise(r => { release = r; });
  tok.update = async function (...args) { await gate; return update.apply(this, args); };
  ta(first).value = "a dry well";
  const closing = first.close();   // Esc: its save is still in flight
  const p1 = PromptDialog.open(tok);
  const p2 = PromptDialog.open(tok);
  release();
  const [a, b] = await Promise.all([p1, p2]);
  await closing;
  tok.update = update;
  assert.ok(a && b, "both opens return a box");
  assert.notEqual(a, first);
  assert.equal(a, b, "the second open is handed the box the first one made");
  assert.equal(PromptDialog.current, a);
  assert.ok(a.rendered, "the shared box is open");
  assert.equal(a.renders.at(-1).context.text, "a dry well", "it reads the text the closing box saved");
  await a.close();
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});
