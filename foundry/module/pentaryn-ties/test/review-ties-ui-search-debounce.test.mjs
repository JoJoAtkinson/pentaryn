/**
 * Final code review (ties-ui-perf-6): both GM autocompletes on the Attributes tab — the add-an-
 * attribute search and the per-character grant control — repainted on every keystroke, and every
 * paint called `searchAttributes`, which walks every actor in the world (`allAttributeIds`) to
 * gather the derived ids. A GM typing "salt" walked the world four times.
 * Ruling [declared]: the `input` paint is debounced (foundry.utils.debounce, 120 ms) while focus
 * paints at once, and the world-derived candidate list is gathered once per focus and reused by
 * the keystrokes that follow.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPerf6Pc0000001";
const REGISTRY = [
  { id: "saltguild", title: "Salt Guild", category: "Guild" },
  { id: "greyorder", title: "Grey Order", category: "Order" },
  { id: "ashchapter", title: "Ash Chapter", category: "Chapter" },
];

await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Perf6 PC", type: "character" },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `zzPerf6Npc00000${i}`, name: `ZZ Perf6 NPC ${i}` })),
  ],
});
const AUI = await import("../attributes-ui.mjs");
const pc = () => game.actors.get(PC);

/** Count every world walk made on behalf of the autocomplete's candidate list. */
function countWalks() {
  const counter = { n: 0 };
  Object.defineProperty(game.actors, "contents", {
    configurable: true,
    get() {
      if (new Error().stack.includes("allAttributeIds")) counter.n++;
      return [...this.values()];
    },
  });
  counter.restore = () => delete game.actors.contents;
  return counter;
}

function mount() {
  const section = el("section");
  section.innerHTML = AUI.buildAttributesHTML(pc());
  AUI.bindAttributes(section.firstElementChild, pc(), () => {});
  return section;
}

for (const [label, inputSel, resultsSel] of [
  ["add-attribute search", ".pt-attr-add:not(.pt-grant-control) .pt-attr-search", ".pt-attr-add:not(.pt-grant-control) .pt-attr-results"],
  ["grant control", ".pt-grant-search", ".pt-grant-results"],
]) {
  test(`ties-ui-perf-6 ${label}: focus paints at once, typing paints once after 120 ms, one world walk per focus`, async () => {
    const section = mount();
    const input = section.querySelector(inputSel);
    const results = section.querySelector(resultsSel);
    assert.ok(input && results, "the control is drawn for a GM");
    const walks = countWalks();
    try {
      await input.dispatch("focus");
      assert.equal(walks.n, 1, "focus gathers the candidates once");
      assert.match(results.innerHTML, /Grey Order/, "focus paints immediately");

      for (const v of ["s", "sa", "sal", "salt"]) {
        input.value = v;
        await input.dispatch("input");
      }
      assert.match(results.innerHTML, /Grey Order/, "no paint per keystroke");
      mock.timers.tick(119);
      assert.match(results.innerHTML, /Grey Order/, "still waiting at 119 ms");
      mock.timers.tick(1);
      assert.match(results.innerHTML, /Salt Guild/, "one paint after the typing stops");
      assert.doesNotMatch(results.innerHTML, /Grey Order/, "filtered to what was typed");
      assert.equal(walks.n, 1, "the keystrokes reuse the focus's candidate list");

      await input.dispatch("focus");
      assert.equal(walks.n, 2, "a fresh focus gathers afresh");
    } finally {
      walks.restore();
    }
  });
}
