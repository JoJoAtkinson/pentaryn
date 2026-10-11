// The sheet strip (characterisation added in wave 2, before the step-4 split): the entry is loaded
// as Foundry would and renderBaseActorSheet is fired with a minimal DOM (fixtures/dom.mjs). Pins
// the built strip (golden/strip.json), the counter's over-cap class, and what each strip listener
// does. Timers are not used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { attunementWorld, addItem, makeActor, MOD } from "./fixtures/world.mjs";
import { El, domEvent, installDocument, serialise, sheetElement } from "./fixtures/dom.mjs";
import { makeDoc } from "./kit/foundry-stub.mjs";

const F = await attunementWorld();
installDocument();
await import("../attunement.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A character over cap: three attuned items (one suppressed) and one away item, in stored order. */
function overCapCharacter(id = "actorStrp0000001") {
  const actor = makeActor(F, {
    id, name: "Talo Vesk", attunement: { value: 3, max: 3 },
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff <of> Woods", img: "staff.webp" }], slots: ["away:k1", "itemRing00000001", null, "itemRod000000001"] } },
    items: [
      { id: "itemRing00000001", name: "Ring", img: "ring.webp", system: { attunement: "required", attuned: true } },
      { id: "itemRod000000001", name: "Rod", img: "rod.webp", system: { attunement: "required", attuned: true } },
      { id: "itemRope00000001", name: "Rope", system: {} },
    ],
  });
  const cloak = makeDoc("Item", { id: "itemClk000000001", name: "Cloak", img: "cloak.webp", type: "equipment", system: { attunement: "required", attuned: true } }, { parent: actor, collection: actor.items });
  Object.defineProperty(cloak, "areEffectsSuppressed", { value: true, enumerable: false });
  actor.items.set(cloak.id, cloak);
  actor.isOwner = true;
  return actor;
}

function render(actor, { editable = true } = {}) {
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: editable }, dom.root);
  const strip = dom.sidebar.children.find(c => c.classList.contains("pentaryn-attunement")) ?? null;
  return { ...dom, strip };
}

const slotsOf = strip => strip.children.find(c => c.tagName === "UL").children;
const findIn = (el, pred) => {
  if (pred(el)) return el;
  for (const c of el.children) {
    const hit = findIn(c, pred);
    if (hit) return hit;
  }
  return null;
};

test("a character over cap: the strip after the card (golden/strip.json); the counter carries the over-cap class", () => {
  const { sidebar, strip, counter } = render(overCapCharacter());
  assert.ok(strip, "strip injected");
  assert.equal(sidebar.children.indexOf(strip), 1, "right after the card");
  assert.equal(counter.className, "attunement pentaryn-attunement-over-cap");
  pinJSON("strip", serialise(strip), import.meta.url);
});

test("the away slot's tooltip HTML (escaped name, short actor name)", () => {
  const { strip } = render(overCapCharacter("actorStrp0000002"));
  const away = slotsOf(strip)[0];
  assert.equal(away.dataset.tooltip,
    '<div class="pentaryn-attunement-away-tip"><strong>Staff &lt;of&gt; Woods</strong><p>Still attuned, but not on Talo. Its power is dormant until it is back in hand.</p></div>');
});

test("at cap, not over: no over-cap class on the counter or the strip, no note", () => {
  const actor = makeActor(F, { id: "actorAtCp0000001", name: "At Cap", attunement: { value: 1, max: 3 },
    items: [{ id: "itemOne000000001", name: "One", system: { attunement: "required", attuned: true } }] });
  actor.isOwner = true;
  const { strip, counter } = render(actor);
  assert.equal(counter.className, "attunement");
  assert.equal(strip.className, "pentaryn-attunement");
  assert.equal(strip.children.length, 2, "header and slots only");
});

test("a re-render replaces the strip instead of stacking a second one", () => {
  const actor = overCapCharacter("actorStrp0000003");
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  assert.equal(dom.sidebar.children.filter(c => c.classList.contains("pentaryn-attunement")).length, 1);
});

test("an NPC: counter decorated, no strip; a vehicle (no attunement schema): untouched", () => {
  const npc = makeActor(F, { id: "actorNpc00000001", name: "Bandit", type: "npc", attunement: { value: 0, max: 0 },
    items: [{ id: "itemNpcR00000001", name: "Ring", system: { attunement: "required", attuned: true } }] });
  const a = render(npc);
  assert.equal(a.strip, null);
  assert.equal(a.counter.className, "attunement pentaryn-attunement-over-cap");
  const cart = makeDoc("Actor", { id: "actorCart0000001", name: "Cart", type: "vehicle", system: {} });
  const b = render(cart);
  assert.equal(b.strip, null);
  assert.equal(b.counter.className, "attunement");
});

test("a limited sheet (no sidebar card): counter only", () => {
  const actor = overCapCharacter("actorStrp0000004");
  const dom = sheetElement();
  delete dom.sidebar.queries[":scope > .card"];
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  assert.equal(dom.sidebar.children.length, 1);
  assert.equal(dom.counter.className, "attunement pentaryn-attunement-over-cap");
});

test("not editable: no ✕ buttons, only click and contextmenu listeners", () => {
  const { strip } = render(overCapCharacter("actorStrp0000005"), { editable: false });
  assert.deepEqual(Object.keys(strip.listeners), ["click", "contextmenu"]);
  assert.equal(findIn(strip, el => el.dataset.action !== undefined), null);
});

test("a render that throws is caught and logged as render failed", () => {
  const errors = [];
  const keep = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const actor = overCapCharacter("actorStrp0000006");
    Object.defineProperty(actor, "type", { get() { throw new Error("boom"); } });
    render(actor);
  } finally {
    console.error = keep;
  }
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "pentaryn-attunement | render failed");
  assert.equal(errors[0][1].message, "boom");
});

test("listeners: ✕ unattunes, right-click unattunes, a plain click opens the item sheet", async () => {
  const actor = overCapCharacter("actorStrp0000007");
  const { strip } = render(actor);
  const ring = slotsOf(strip)[1];
  const opened = [];
  actor.items.get("itemRing00000001").sheet = { render: force => opened.push(force) };

  const from = F.calls.length;
  const x = findIn(ring, el => el.dataset.action === "unattune");
  const e1 = domEvent(x);
  strip.listeners.click[0](e1);
  const e2 = domEvent(ring);
  strip.listeners.contextmenu[0](e2);
  const e3 = domEvent(ring);
  strip.listeners.click[0](e3);
  await flush();
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "update").map(c => [c.documentName, c.changes]), [
    ["Item", { "system.attuned": false }],
    ["Item", { "system.attuned": false }],
  ]);
  assert.deepEqual([e1.seen, e2.seen, e3.seen], [["preventDefault", "stopPropagation"], ["preventDefault", "stopPropagation"], []]);
  assert.deepEqual(opened, [true]);
});

test("listeners: releasing an away slot asks first; a yes drops the away entry", async () => {
  const actor = overCapCharacter("actorStrp0000008");
  const { strip } = render(actor);
  const away = slotsOf(strip)[0];
  const asked = [];
  let answer = false;
  foundry.applications.api.DialogV2 = { confirm: async opts => { asked.push(opts); return answer; } };

  const from = F.calls.length;
  strip.listeners.click[0](domEvent(findIn(away, el => el.dataset.action === "release")));
  await flush();
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "update"), [], "a no writes nothing");
  answer = true;
  strip.listeners.contextmenu[0](domEvent(away));
  await flush();
  assert.equal(asked.length, 2);
  assert.deepEqual(asked[0].window, { title: "End Attunement" });
  assert.equal(asked[0].content, "<p>End attunement to <strong>Staff &lt;of&gt; Woods</strong>? It is not on you, so it will come back as an ordinary, unattuned item.</p>");
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "update").map(c => c.changes), [{ "flags.pentaryn-attunement.away": [] }]);
});

test("listeners: drag over marks the slot; a drop attunes into that slot", async () => {
  const actor = overCapCharacter("actorStrp0000009");
  const amulet = addItem(F, actor, { id: "itemAmlt00000001", name: "Amulet", system: { attunement: "required", attuned: false } });
  actor.updateEmbeddedDocuments = async (type, updates) => { F.calls.push({ op: "updateEmbeddedDocuments", type, updates }); };
  const { strip } = render(actor);
  const hole = slotsOf(strip)[2];       // the Cloak's slot (index 2)
  const over = domEvent(hole);
  strip.listeners.dragover[0](over);
  assert.ok(hole.classList.contains("dragover"));
  assert.equal(over.dataTransfer.dropEffect, "link");
  strip.listeners.dragleave[0](domEvent(hole));
  assert.ok(!hole.classList.contains("dragover"));

  foundry.applications.ux = { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item", uuid: amulet.uuid }) } } };
  globalThis.Item = { implementation: { fromDropData: async () => amulet } };
  const from = F.calls.length;
  const drop = domEvent(hole);
  await strip.listeners.drop[0](drop);
  assert.deepEqual(drop.seen, ["preventDefault", "stopPropagation"]);
  const writes = F.calls.slice(from).filter(c => ["updateEmbeddedDocuments", "update"].includes(c.op));
  assert.deepEqual(writes.map(c => c.updates ?? c.changes), [
    [{ _id: "itemClk000000001", "system.attuned": false }, { _id: "itemAmlt00000001", "system.attuned": true }],
    { "flags.pentaryn-attunement.slots": ["away:k1", "itemRing00000001", "itemAmlt00000001", "itemRod000000001"] },
  ]);
});

test("listeners: a drop onto an away slot warns SlotHeld; a foreign or unattunable item warns", async () => {
  const actor = overCapCharacter("actorStrp0000010");
  const other = makeActor(F, { id: "actorOthr0000001", name: "Other" });
  const foreign = addItem(F, other, { id: "itemFrgn00000001", name: "Foreign", system: { attunement: "required" } });
  const plain = addItem(F, actor, { id: "itemPlan00000001", name: "Plain Hat", system: { attunement: "" } });
  const mine = addItem(F, actor, { id: "itemMine00000001", name: "Wand", system: { attunement: "required", attuned: false } });
  const { strip } = render(actor);
  const slots = slotsOf(strip);
  foundry.applications.ux = { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item" }) } } };
  let next;
  globalThis.Item = { implementation: { fromDropData: async () => next } };
  const from = F.calls.length;
  for (const [item, slot] of [[mine, slots[0]], [foreign, slots[1]], [plain, slots[1]]]) {
    next = item;
    await strip.listeners.drop[0](domEvent(slot));
  }
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify").map(c => c.message), [
    "That slot is held by Staff <of> Woods, which is attuned but not on you. End that attunement first.",
    "That item belongs to a different actor.",
    "Plain Hat does not require attunement.",
  ]);
});

test("El stub sanity: closest walks up through classes and data-action", () => {
  const li = new El("li");
  li.className = "attunement-slot";
  const b = new El("button");
  b.dataset.action = "release";
  li.append(b);
  assert.equal(b.closest(".attunement-slot"), li);
  assert.equal(b.closest('[data-action="release"]'), b);
});
