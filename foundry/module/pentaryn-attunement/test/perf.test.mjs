// items-journal-13 (performance): one sheet render reconciles the slots once and reads the away
// list once for the strip, however many away slots there are. Counted through the actor's own
// reads (items.filter is computeSlots' item scan; getFlag("away") is every awayOf). The built strip
// is unchanged: golden/strip.json (strip.test) still matches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attunementWorld, makeActor, MOD } from "./fixtures/world.mjs";
import { installDocument, sheetElement } from "./fixtures/dom.mjs";
import { buildStrip } from "../strip.mjs";
import { computeSlots } from "../attunement-core.mjs";

const F = await attunementWorld();
installDocument();
await import("../attunement.mjs");

function counted(actor) {
  const n = { filter: 0, away: 0, slots: 0 };
  const filter = actor.items.filter.bind(actor.items);
  actor.items.filter = fn => { n.filter++; return filter(fn); };
  const getFlag = actor.getFlag.bind(actor);
  actor.getFlag = (scope, key) => { if (key === "away") n.away++; if (key === "slots") n.slots++; return getFlag(scope, key); };
  return n;
}

test("a character render with three away slots: one item scan, two away reads, one slots read", () => {
  const away = [1, 2, 3].map(i => ({ key: `k${i}`, name: `Away ${i}`, img: "i" }));
  const actor = makeActor(F, { id: "actorPerf0000001", name: "Perf", attunement: { value: 1, max: 5 },
    flags: { [MOD]: { away } },
    items: [{ id: "itemPerf00000001", name: "Ring", system: { attunement: "required", attuned: true } }] });
  actor.isOwner = true;
  const n = counted(actor);
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, sheetElement().root);
  // before: 2 item scans (decorateCounter + buildStrip each ran computeSlots), 2 + 3 away reads, 2 slots reads
  assert.deepEqual(n, { filter: 1, away: 2, slots: 1 });
});

test("buildStrip with a passed state equals buildStrip computing its own", async () => {
  const { serialise } = await import("./fixtures/dom.mjs");
  const actor = makeActor(F, { id: "actorPerf0000002", name: "Perf Two", attunement: { value: 2, max: 3 },
    flags: { [MOD]: { away: [{ key: "k", name: "Staff", img: "s" }, { key: "k", name: "Dup", img: "d" }], slots: ["away:k"] } },
    items: [{ id: "itemPerf00000002", name: "Rod", system: { attunement: "required", attuned: true } }] });
  const a = serialise(buildStrip(actor, true));
  const b = serialise(buildStrip(actor, true, computeSlots(actor)));
  assert.deepEqual(a, b);
  assert.equal(a.children[1].children[0].children[0].children[0].alt, "Staff", "a repeated away key: the first entry wins, as find() did");
});
