/**
 * Final code review (ties-ui-E4): key 9 is ONE window that toggles (describe-dialog.mjs header). toggle()
 * awaits enrichHTML before it records the window, so a second press inside that await saw "nothing
 * open" and built a second card; and the first card's close then cleared the handle while the second
 * was still up. Ruling: a second press waits for the first build and then acts as a normal toggle (same
 * face closes, another face swaps), and a stale window's close never drops a newer window's handle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const A = "zzDescA000000001";
const B = "zzDescB000000001";

const F = await bootWorld({
  timers: false,
  actors: [
    { id: A, name: "ZZ Desc A", system: { details: { biography: { value: "<p>A's prep</p>" } } } },
    { id: B, name: "ZZ Desc B", system: { details: { biography: { value: "<p>B's prep</p>" } } } },
  ],
  tokens: [
    { id: "zzDescTokA000001", actorId: A },
    { id: "zzDescTokB000001", actorId: B },
  ],
});
const D = await import("../describe-dialog.mjs");
const tok = id => canvas.tokens.placeables.find(p => p.actor?.id === id);
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

/** enrichHTML that holds every call until `release()`, so two presses overlap the first build. */
function gateEnrich() {
  const held = [];
  F.foundry.applications.ux.TextEditor.implementation.enrichHTML = html => new Promise(r => held.push(() => r(html)));
  return async () => {
    for (let i = 0; i < 20; i++) {
      while (held.length) held.shift()();
      await flush(1);
    }
  };
}
/** Every card built, in order, so a test can ask which are still up. */
const cards = [];
const Real = foundry.applications.api.DialogV2;
foundry.applications.api.DialogV2 = class extends Real {
  constructor(opts) {
    super(opts);
    cards.push(this);
  }
};
const openNow = () => cards.filter(c => c.rendered).map(c => c.opts.window.title);
const opened = mark => F.calls.slice(mark).filter(c => c.op === "DialogV2.new").map(c => c.title);

test("ties-ui-E4 two quick presses of 9 over the same face: one card opens, then closes", async () => {
  await D.close();
  const release = gateEnrich();
  canvas.tokens.hover = tok(A);
  const mark = F.calls.length;
  const first = D.toggle();
  const second = D.toggle();
  await release();
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1?.id, A, "the first press shows A");
  assert.equal(r2, null, "the second press is 'put that away'");
  assert.deepEqual(opened(mark), ["ZZ Desc A"], "only one card was ever built");
  assert.deepEqual(openNow(), [], "and it is closed");
  // and the module now believes nothing is open: the next press opens a fresh card
  F.foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => html;
  assert.equal((await D.toggle())?.id, A, "a third press opens A again");
  await D.close();
});

test("ties-ui-E4 two quick presses over different faces: the card swaps to the second face", async () => {
  await D.close();
  const release = gateEnrich();
  const mark = F.calls.length;
  canvas.tokens.hover = tok(A);
  const first = D.toggle();
  canvas.tokens.hover = tok(B);
  const second = D.toggle();
  await release();
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1?.id, A);
  assert.equal(r2?.id, B, "the second press swaps to B");
  assert.deepEqual(opened(mark), ["ZZ Desc A", "ZZ Desc B"]);
  assert.deepEqual(openNow(), ["ZZ Desc B"], "A's card was put away, only B's is up");
  // pressing over B again closes it — the handle is B's, not a dropped one
  F.foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => html;
  assert.equal(await D.toggle(), null, "the press over B closes B");
  await D.close();
});

test("ties-ui-E4 a stale window's close does not drop the newer window's handle", async () => {
  await D.close();
  F.foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => html;
  canvas.tokens.hover = tok(A);
  cards.length = 0;
  try {
    await D.toggle(); // card 1 about A
    await D.toggle(); // closes card 1
    await D.toggle(); // card 2 about A
    assert.equal(cards.length, 2);
    assert.equal(cards[1].rendered, true, "card 2 is open");
    cards[0].opts.close(); // card 1's close callback fires late (Foundry closes asynchronously)
    assert.equal(await D.toggle(), null, "the next press closes card 2 rather than opening a third");
    assert.equal(cards[1].rendered, false, "card 2 was the one put away");
    assert.equal(cards.length, 2, "no third card");
  } finally {
    await D.close();
  }
});
