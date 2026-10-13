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

/* ── a Delete in flight counts as the box going away (prompts-U1 repair) ── */

const A = PromptDialog.DEFAULT_OPTIONS.actions;
const markers = () => [...F.s1.tokens.values()].filter(t => t.flags?.[MODULE]?.prompt !== undefined);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
/**
 * A realistic in-flight delete: calls run in order like the server's, the first is held until
 * released, and a delete of a token already gone rejects ("Token does not exist").
 */
function gated(tok) {
  const orig = tok.delete.bind(tok);
  let release; const gate = new Promise(r => { release = r; });
  let gone = false, n = 0, chain = Promise.resolve();
  tok.delete = () => {
    const first = ++n === 1;
    const p = chain.then(async () => {
      if (first) await gate;
      if (gone) throw new Error("Token does not exist");
      gone = true;
      return orig();
    });
    chain = p.catch(() => {});
    return p;
  };
  return { release, calls: () => n };
}

test("prompts-U1: a double click on Delete deletes once, with no false error", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-double", "a cart");
  const app = await PromptDialog.open(tok);
  const g = gated(tok);
  const n0 = notices().length;
  const { out } = await captureConsole(async () => {
    const d1 = del(app);
    await tick();
    const d2 = del(app);
    await tick();
    g.release();
    await Promise.all([d1, d2]);
    await tick();
  });
  assert.equal(g.calls(), 1, "one delete");
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.equal(app.rendered, false);
  assert.deepEqual(notices().slice(n0), [], "no could-not-delete toast");
  assert.deepEqual(out, []);
});

test("prompts-U1: a size chip clicked while Delete is in flight makes no new marker", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const before = markers().length;
  const tok = await fresh("u1-chip", "a cart");
  const app = await PromptDialog.open(tok);
  const g = gated(tok);
  const n0 = F.calls.length;
  const { out } = await captureConsole(async () => {
    const d = del(app);
    await tick();
    const s = A.size.call(app, {}, { dataset: { size: "large" } });
    await tick();
    g.release();
    await Promise.all([d, s]);
    await tick();
  });
  assert.equal(F.calls.slice(n0).filter(c => c.op === "createEmbeddedDocuments").length, 0, "no new marker");
  assert.equal(markers().length, before, "no orphan");
  assert.equal(g.calls(), 1);
  assert.equal(app.rendered, false);
  assert.deepEqual(out, []);
});

test("prompts-U1: Esc during an in-flight Delete of a fresh empty marker issues one delete", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-esc", "");
  const app = await PromptDialog.open(tok, { fresh: true });
  const g = gated(tok);
  const { out } = await captureConsole(async () => {
    const d = del(app);
    await tick();
    const c = app.close();
    await tick();
    g.release();
    await Promise.all([d, c]);
    await tick();
  });
  assert.equal(g.calls(), 1, "one delete");
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.deepEqual(out, [], "no 'closing the prompt dialog' error");
});

test("prompts-U1: Esc during a Delete that then fails still saves the words", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-esc-fail", "a cart");
  const app = await PromptDialog.open(tok);
  let release; const gate = new Promise(r => { release = r; });
  tok.delete = async () => { await gate; throw new Error("locked"); };
  ta(app).value = "a cart, overturned";
  await captureConsole(async () => {
    const d = del(app);
    await tick();
    const c = app.close();
    await tick();
    release();
    await Promise.all([d, c]);
  });
  delete tok.delete;
  assert.equal(F.s1.tokens.get(tok.id).flags[MODULE].prompt, "a cart, overturned");
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});

test("prompts-U1: words typed just before a failed Delete autosave without more typing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-autosave", "a cart");
  const app = await PromptDialog.open(tok);
  ta(app).value = "a cart, overturned";
  ta(app).dispatch("input");
  tok.delete = async () => { throw new Error("locked"); };
  await captureConsole(() => del(app));
  delete tok.delete;
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(F.s1.tokens.get(tok.id).flags[MODULE].prompt, "a cart, overturned", "the autosave was rescheduled");
  await app.close();
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});

test("prompts-U1: our Delete rejects because another tab deleted the marker meanwhile: the box closes quietly", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("u1-elsewhere", "a cart");
  const app = await PromptDialog.open(tok);
  const n0 = notices().length;
  tok.delete = async () => { await F.s1.deleteEmbeddedDocuments("Token", [tok.id]); throw new Error("Token does not exist"); };
  const { out } = await captureConsole(() => del(app));
  await tick();
  assert.equal(app.rendered, false, "the box closed");
  assert.deepEqual(notices().slice(n0), [], "no could-not-delete toast");
  assert.deepEqual(out, []);
});
