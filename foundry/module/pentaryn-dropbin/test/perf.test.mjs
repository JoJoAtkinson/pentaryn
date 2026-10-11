// Performance counters (no timing): items-journal-24 — one Journal sidebar render walks the scenes' notes
// once, not once per row; the GM's render walks nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { el } from "./fixtures/dom.mjs";
import { GM, PLAYER, addScene, dropbinWorld } from "./fixtures/world.mjs";

const F = await dropbinWorld();
let walks = 0;
for (let s = 0; s < 5; s++) {
  const scene = addScene(F, { id: `scene${String(s).padStart(11, "0")}`, notes: Array.from({ length: 20 }, (_, i) => (
    { id: `note${s}${String(i).padStart(11, "0")}`, entryId: `journal${s}${String(i).padStart(8, "0")}`, global: false, entry: null })) });
  const notes = scene.notes;
  const values = notes.values.bind(notes);
  notes[Symbol.iterator] = () => { walks++; return values(); };
}
await import("../dropbin.mjs");
F.fire("init");

const rows = n => el("ol", { children: Array.from({ length: n }, (_, i) => el("li", { dataset: { entryId: i % 2 ? `journal0${String(i).padStart(8, "0")}` : `handout${String(i).padStart(9, "0")}` } })) });

test("items-journal-24: a player's render of 40 rows reads each scene's notes once (5 walks, not up to 200)", () => {
  F.become({ userId: PLAYER });
  walks = 0;
  const root = rows(40);
  F.fire("renderJournalDirectory", {}, root);
  F.become({ userId: GM });
  assert.equal(walks, 5);
  assert.equal(root.children.length, 30, "the 10 pinned rows (odd i < 20) are gone; handouts and unpinned ids stay");
});

test("items-journal-24: the GM's render builds nothing", () => {
  walks = 0;
  F.fire("renderJournalDirectory", {}, rows(40));
  assert.equal(walks, 0);
});
