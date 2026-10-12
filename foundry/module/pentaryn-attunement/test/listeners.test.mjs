// items-journal-11, listener half: the strip's five async listener paths (release ×2, unattune ×2,
// drop) run through the core's safe(label, fn), so a failure is logged as
// "pentaryn-attunement | <label> failed" instead of an anonymous unhandled rejection. Before this
// change a rejection here was unhandled (node would fail the file), so the pins are new.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safe } from "../attunement-core.mjs";
import { attunementWorld, makeActor, MOD } from "./fixtures/world.mjs";
import { domEvent, installDocument, sheetElement } from "./fixtures/dom.mjs";

test("safe: a rejection is logged with the label and swallowed; a value resolves undefined", async () => {
  const spy = [];
  const log = (...a) => spy.push(a);
  assert.equal(await safe("x", async () => { throw new Error("boom"); }, log)(), undefined);
  assert.equal(spy.length, 1);
  assert.equal(spy[0][0], "pentaryn-attunement | x failed");
  assert.equal(spy[0][1].message, "boom");
  assert.equal(await safe("x", async a => a * 2, log)(21), undefined);
  assert.equal(await safe("y", () => { throw new Error("sync"); }, log)(), undefined);
  assert.equal(spy[1][0], "pentaryn-attunement | y failed");
});

test("safe: calls fn synchronously with the same arguments (a drop's preventDefault stays inside the event)", () => {
  const seen = [];
  safe("z", (...a) => { seen.push(a); })(1, "two");
  assert.deepEqual(seen, [[1, "two"]]);
});

const F = await attunementWorld();
installDocument();
await import("../attunement.mjs");
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function mounted() {
  const actor = makeActor(F, { id: "actorLstn0000001", name: "Listener Vesk", attunement: { value: 1, max: 3 },
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff", img: "s" }] } },
    items: [{ id: "itemRing00000001", name: "Ring", system: { attunement: "required", attuned: true } }] });
  actor.isOwner = true;
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  const strip = dom.sidebar.children[1];
  const [ring, away] = strip.children[1].children;   // computeSlots: items first, then away entries
  return { actor, strip, away, ring };
}

async function errorsOf(fn) {
  const lines = [];
  const keep = console.error;
  console.error = (...a) => lines.push([a[0], a[1]?.message]);
  try {
    await fn();
    await flush();
  } finally {
    console.error = keep;
  }
  return lines;
}

test("release (click ✕ and right-click), unattune (✕ and right-click) and drop: each failure is labelled", async () => {
  const { actor, strip, away, ring } = mounted();
  foundry.applications.api.DialogV2 = { confirm: async () => { throw new Error("dialog closed"); } };
  actor.items.get("itemRing00000001").update = async () => { throw new Error("not owner"); };
  foundry.applications.ux = { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item" }) } } };
  globalThis.Item = { implementation: { fromDropData: async () => { throw new Error("bad drop"); } } };
  const releaseBtn = away.children[0].children.find(c => c.dataset.action === "release");
  const unattuneBtn = ring.children[0].children.find(c => c.dataset.action === "unattune");
  let drop;
  const lines = await errorsOf(() => {
    strip.listeners.click[0](domEvent(releaseBtn));
    strip.listeners.contextmenu[0](domEvent(away));
    strip.listeners.click[0](domEvent(unattuneBtn));
    strip.listeners.contextmenu[0](domEvent(ring));
    drop = domEvent(ring);
    strip.listeners.drop[0](drop);
    assert.deepEqual(drop.seen, ["preventDefault", "stopPropagation"], "the drop is claimed synchronously");
  });
  assert.deepEqual(lines, [
    ["pentaryn-attunement | release failed", "dialog closed"],
    ["pentaryn-attunement | release failed", "dialog closed"],
    ["pentaryn-attunement | unattune failed", "not owner"],
    ["pentaryn-attunement | unattune failed", "not owner"],
    ["pentaryn-attunement | drop failed", "bad drop"],
  ]);
});

test("a successful path still writes (the wrapper only adds the catch)", async () => {
  const { strip, ring, actor } = mounted();
  actor.items.get("itemRing00000001").update = async changes => { F.calls.push({ op: "itemUpdate", changes }); };
  const from = F.calls.length;
  strip.listeners.contextmenu[0](domEvent(ring));
  await flush();
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "itemUpdate").map(c => c.changes), [{ "system.attuned": false }]);
});

test("an away entry with an empty key can still be released (✕ and right-click)", async () => {
  const actor = makeActor(F, { id: "actorLstn0000002", name: "Keyless Vesk", attunement: { value: 0, max: 3 },
    flags: { [MOD]: { away: [{ key: "", name: "X", img: "x" }], slots: ["away:"] } } });
  actor.isOwner = true;
  const writes = [];
  actor.setFlag = async (scope, key, value) => { writes.push([scope, key, value]); };
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  const strip = dom.sidebar.children[1];
  const [away] = strip.children[1].children;
  assert.equal(away.dataset.awayKey, "", "the slot renders as the empty-key away entry");
  const releaseBtn = away.children[0].children.find(c => c.dataset.action === "release");
  strip.listeners.click[0](domEvent(releaseBtn));
  await flush();
  strip.listeners.contextmenu[0](domEvent(away));
  await flush();
  assert.deepEqual(writes, [[MOD, "away", []], [MOD, "away", []]]);
});
