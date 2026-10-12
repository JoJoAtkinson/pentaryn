/**
 * R1 (final review 2026-10-12, prompts-adapters): a failed autosave must never cost words. #save
 * reports whether it landed; #finish skips the empty-delete when the last save failed (the fresh
 * marker stays, error toast), and the size chip aborts its swap rather than carry stale text.
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
const notices = () => F.calls.filter(c => c.op === "notify");
async function fresh(id, text = "") {
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: text } } }], { pentarynPrompts: { test: id } });
  return tok;
}

test("R1: a fresh marker whose words failed to save is kept on close, not deleted as empty", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("r1-finish");
  const app = await PromptDialog.open(tok, { fresh: true });
  tok.update = async () => { throw new Error("locked"); };
  ta(app).value = "a sleeping dragon";
  const { out } = await captureConsole(() => app.close());
  delete tok.update;
  assert.ok(F.s1.tokens.get(tok.id), "the marker with unsaved words is still on the scene");
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | saving the prompt failed Error(locked)"]);
  assert.deepEqual(notices().at(-1), { op: "notify", level: "error", message: "The prompt could not be saved; see the console." });
  assert.ok(!notices().some(n => n.message === "Prompt marker removed (empty)."), "no empty-delete notice");
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});

test("R1: a size chip whose save failed does not swap (no new marker, the old one kept)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("r1-size", "a cart");
  const app = await PromptDialog.open(tok);
  const update = tok.update;
  tok.update = async () => { throw new Error("locked"); };
  ta(app).value = "a cart, overturned";
  const n0 = F.calls.length;
  const { out } = await captureConsole(() => PromptDialog.DEFAULT_OPTIONS.actions.size.call(app, {}, { dataset: { size: "large" } }));
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | saving the prompt failed Error(locked)"]);
  assert.equal(F.calls.slice(n0).filter(c => c.op === "createEmbeddedDocuments").length, 0, "no swapped marker created");
  assert.ok(F.s1.tokens.get(tok.id), "the old marker is not deleted");
  assert.equal(app.token, tok);
  tok.update = update;
  await app.close();
  assert.equal(F.s1.tokens.get(tok.id).flags[MODULE].prompt, "a cart, overturned", "the next save lands the words");
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});
