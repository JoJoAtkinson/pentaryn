/**
 * Final code review (ties-ui-ACC-4): the Attributes tab's ancestry **Fix it** button re-linked each
 * broken membership with its own `actor.update` — one write (and one sheet render) per broken id —
 * and was never disabled, so a double-click queued a second pass over the same rows.
 * Ruling [declared]: `repairAllAncestry(actor, resolver)` in attributes.mjs links every missing
 * ancestor in ONE `actor.update`; the button is disabled while it runs and the tab repaints once.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const NPC = "zzAcc4Npc0000001";
const REGISTRY = [
  { id: "realm", title: "Old Realm", category: "Realm" },
  { id: "city", title: "Vel", category: "City", parent: "realm" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city" },
  { id: "order", title: "Grey Order", category: "Order" },
  { id: "chapter", title: "Ash Chapter", category: "Chapter", parent: "order" },
];

await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  // two broken chains: guild without city/realm, chapter without order
  actors: [{ id: NPC, name: "ZZ Acc4 NPC", flags: { "pentaryn-ties": { attributes: ["guild", "chapter"] } } }],
});
const At = await import("../attributes.mjs");
const AUI = await import("../attributes-ui.mjs");
const npc = () => game.actors.get(NPC);
const missingOf = () => At.brokenAncestry(npc()).filter(b => b.missing);

test("ties-ui-ACC-4 the Fix it button: one update for every missing ancestor, disabled while it runs, one repaint", async () => {
  assert.equal(missingOf().length, 3, "precondition: city, realm and order are missing");
  const section = el("section");
  section.innerHTML = AUI.buildAttributesHTML(npc());
  let repaints = 0;
  AUI.bindAttributes(section.firstElementChild, npc(), () => repaints++);
  const btn = section.querySelector('[data-action="attr-repair"]');
  assert.ok(btn, "the Fix it button is drawn");

  const actor = npc();
  const real = actor.update.bind(actor);
  const during = [];
  const m = mock.method(actor, "update", data => {
    during.push(btn.disabled);
    return real(data);
  });
  try {
    await btn.dispatch("click");
  } finally {
    m.mock.restore();
  }
  assert.equal(m.mock.callCount(), 1, "one actor.update for both broken chains");
  assert.deepEqual(during, [true], "the button is disabled while the write runs");
  assert.equal(btn.disabled, false, "and enabled again after");
  assert.equal(repaints, 1, "the tab repaints once");
  assert.deepEqual(missingOf(), [], "nothing is left broken");
  assert.deepEqual(
    [...npc().flags["pentaryn-ties"].attributes].sort(),
    ["chapter", "city", "guild", "order", "realm"],
    "every missing ancestor is now linked"
  );
});

test("ties-ui-ACC-4 repairAllAncestry: nothing broken writes nothing; a player is refused", async () => {
  assert.equal(typeof At.repairAllAncestry, "function", "attributes.mjs exports repairAllAncestry");
  const actor = npc();
  const m = mock.method(actor, "update", async () => {});
  try {
    const out = await At.repairAllAncestry(actor);
    assert.equal(out.ok, true);
    assert.deepEqual(out.added, []);
    assert.equal(m.mock.callCount(), 0, "no write when nothing is broken");
    const gm = game.user;
    game.user = { ...gm, isGM: false };
    try {
      assert.deepEqual(await At.repairAllAncestry(actor), { ok: false, reason: "notGM" });
    } finally {
      game.user = gm;
    }
  } finally {
    m.mock.restore();
  }
});
