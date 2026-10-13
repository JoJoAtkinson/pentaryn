/**
 * prompts-U1 (final review 2026-10-12, prompts-adapters): a failed Delete set `#deleted` before
 * `tok.delete()` ran, so when the delete was rejected the box stayed open but every later save
 * was skipped (`#save` returns early on a deleted box) — words typed after that were lost. Now
 * `#deleted` is set only once the delete lands; a rejection logs, toasts, and leaves the box
 * editable. The deleteToken hook still skips a box whose own delete succeeded.
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
const del = app => PromptDialog.DEFAULT_OPTIONS.actions.deleteMarker.call(app, {}, {});
async function fresh(id, text = "") {
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: text } } }], { pentarynPrompts: { test: id } });
  return tok;
}

test("prompts-U1: a rejected Delete leaves the box open and still saving, with an error toast", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-fail", "a cart");
  const app = await PromptDialog.open(tok);
  tok.delete = async () => { throw new Error("locked"); };
  const { out } = await captureConsole(() => del(app));
  delete tok.delete;
  assert.ok(F.s1.tokens.get(tok.id), "the marker is still on the scene");
  assert.equal(app.rendered, true, "prompts-U1: the box stays open");
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | deleting the prompt marker failed Error(locked)"]);
  assert.deepEqual(notices().at(-1), { op: "notify", level: "error", message: "The prompt marker could not be deleted; see the console." });
  ta(app).value = "a cart, overturned";
  await app.close();
  assert.equal(F.s1.tokens.get(tok.id).flags[MODULE].prompt, "a cart, overturned", "prompts-U1: the box still saves after a failed delete");
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});

test("prompts-U1: a Delete that lands is not closed a second time by the deleteToken hook", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-ok", "a cart");
  const app = await PromptDialog.open(tok);
  let closes = 0;
  const close = app.close.bind(app);
  app.close = opts => { closes++; return close(opts); };
  const n0 = F.calls.length;
  await del(app);
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.equal(app.rendered, false);
  assert.equal(closes, 1, "the hook skipped the box that deleted its own marker");
  assert.equal(F.calls.slice(n0).filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments").length, 0, "no save after the delete");
});
