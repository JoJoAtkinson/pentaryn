/**
 * EC-2 (final review 2026-10-12, prompts-adapters): a double click on a size chip left an orphan
 * duplicate marker. #onSize now holds a #swapping promise: a second click while one runs returns at
 * once (the chips are greyed by a `pp-swapping` class meanwhile), and close() waits for the swap
 * before it saves and tears the window down. One swap → exactly one new marker and one delete.
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
const markers = () => [...F.s1.tokens.values()].filter(t => t.flags?.[MODULE]?.prompt !== undefined);
async function fresh(id, text) {
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: text } } }], { pentarynPrompts: { test: id } });
  return tok;
}

test("EC-2: a double click on a size chip makes exactly one new marker and one delete", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("ec2-double", "a cart");
  const before = markers().length;
  const app = await PromptDialog.open(tok);
  const n0 = F.calls.length;
  const first = size.call(app, {}, { dataset: { size: "large" } });
  const greyed = app.element.classList.contains("pp-swapping");
  const second = size.call(app, {}, { dataset: { size: "large" } });
  await Promise.all([first, second]);
  const calls = F.calls.slice(n0);
  assert.equal(calls.filter(c => c.op === "createEmbeddedDocuments").length, 1, "one new marker");
  assert.equal(calls.filter(c => c.op === "delete" && c.documentName === "Token").length, 1, "one delete");
  assert.equal(markers().length, before, "no orphan duplicate");
  assert.ok(greyed, "the chips are greyed while the swap runs");
  assert.ok(!app.element.classList.contains("pp-swapping"), "the chips come back after the swap");
  assert.notEqual(app.token.id, tok.id);
  const made = app.token;
  await app.close();
  await F.s1.deleteEmbeddedDocuments("Token", [made.id]);
});

test("EC-2: close() during a swap waits for it, then saves onto the new marker", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("ec2-close", "a cart");
  const app = await PromptDialog.open(tok);
  const swap = size.call(app, {}, { dataset: { size: "large" } });
  ta(app).value = "a cart, overturned";
  const n0 = F.calls.length;
  const closing = app.close();
  await Promise.all([swap, closing]);
  const calls = F.calls.slice(n0).map(c => c.op === "delete" ? `delete ${c.uuid}` : c.op);
  const made = [...F.s1.tokens.values()].find(t => t.flags?.[MODULE]?.swappedFrom === tok.id);
  assert.ok(made, "the swapped marker exists");
  assert.ok(!F.s1.tokens.get(tok.id), "the old marker is gone");
  assert.equal(made.flags[MODULE].prompt, "a cart, overturned", "the closing save lands on the new marker");
  assert.ok(calls.indexOf(`delete ${tok.uuid}`) >= 0 && calls.indexOf("app.close") > calls.indexOf(`delete ${tok.uuid}`), "the window closes only after the swap's delete");
  await F.s1.deleteEmbeddedDocuments("Token", [made.id]);
});

test("EC-2: Delete during a swap removes the marker the swap made (no orphan)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("ec2-delete", "a cart");
  const before = markers().length;
  const app = await PromptDialog.open(tok);
  // Delete lands mid-swap: after the save, while the new marker's data is being built
  let del = null;
  const push = F.calls.push;
  F.calls.push = function (c) {
    if (c?.op === "getTokenDocument" && !del) del = PromptDialog.DEFAULT_OPTIONS.actions.deleteMarker.call(app, {}, {});
    return push.call(this, c);
  };
  try { await size.call(app, {}, { dataset: { size: "large" } }); } finally { F.calls.push = push; }
  assert.ok(del, "Delete was clicked mid-swap");
  await del;
  assert.equal(markers().length, before - 1, "both the old and the swapped marker are gone");
  assert.ok(![...F.s1.tokens.values()].some(t => t.flags?.[MODULE]?.swappedFrom === tok.id));
});

/**
 * R4 (final review 2026-10-12, prompts-adapters): #onSize did not re-check the marker after its
 * awaits. A marker deleted elsewhere while the swap built the new marker's data still got a new
 * marker made (an orphan, the dialog already closed); one deleted while the new marker was being
 * created was deleted a second time. Now the swap stops when the marker it started from is gone,
 * and once the new marker exists it is left in place with no second delete and no re-render.
 */
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

test("R4: a marker deleted elsewhere while the swap builds its data gets no new marker", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("r4-data", "a cart");
  const before = markers().length;
  const app = await PromptDialog.open(tok);
  const n0 = F.calls.length;
  const fired = await midSwap(app, "getTokenDocument", () => { F.s1.deleteEmbeddedDocuments("Token", [tok.id]); });
  assert.ok(fired, "the marker was deleted mid-swap");
  await app.close();
  const calls = F.calls.slice(n0);
  assert.equal(calls.filter(c => c.op === "createEmbeddedDocuments").length, 0, "no new marker for a gone marker");
  assert.ok(![...F.s1.tokens.values()].some(t => t.flags?.[MODULE]?.swappedFrom === tok.id), "no orphan");
  assert.equal(markers().length, before - 1);
});

test("R4: a marker deleted elsewhere while the new one is created is not deleted twice", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("r4-create", "a cart");
  const app = await PromptDialog.open(tok);
  const n0 = F.calls.length;
  const fired = await midSwap(app, "createEmbeddedDocuments", () => { F.s1.deleteEmbeddedDocuments("Token", [tok.id]); });
  assert.ok(fired, "the marker was deleted mid-create");
  await app.close();
  const calls = F.calls.slice(n0);
  assert.equal(calls.filter(c => c.op === "delete" && c.uuid === tok.uuid).length, 0, "the gone marker is not deleted again");
  assert.equal(calls.filter(c => c.op === "app.render").length, 0, "no re-render of a closing window");
  const made = [...F.s1.tokens.values()].find(t => t.flags?.[MODULE]?.swappedFrom === tok.id);
  assert.ok(made, "the new marker stays in place");
  assert.equal(made.flags[MODULE].prompt, "a cart", "with the text carried");
  await F.s1.deleteEmbeddedDocuments("Token", [made.id]);
});
