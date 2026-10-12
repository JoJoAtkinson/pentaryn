/**
 * Final code review (ties-ui, 2026-10-12): edge cases against promises the module already makes.
 * Each block is standalone (its own world) and pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

globalThis.CSS ??= { escape: s => String(s) };

const PC = "zzReviewPc000001";
const NPC = "zzReviewNpc00001";

const F = await bootWorld({
  actors: [
    {
      id: PC,
      name: "ZZ Review PC",
      type: "character",
      system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } },
      flags: { "pentaryn-ties": { known: [{ id: NPC, name: "ZZ Hidden", category: "sentient", notes: "", when: 1_700_000_000_000, hidden: true }] } },
    },
    { id: NPC, name: "ZZ Hidden", system: { details: { type: { value: "humanoid" } } } },
  ],
});
const Known = await import("../known-ui.mjs");

/** A sheet whose render paints the Known tab the way the injector does: markup, then bindKnown. */
function paintingSheet(actor) {
  const root = el("div");
  return {
    tabGroups: { primary: "details" },
    element: root,
    async render() {
      root.innerHTML = `<nav class="tabs"><a data-tab="${Known.KNOWN_TAB_ID}"></a></nav><section class="tab active" data-tab="${Known.KNOWN_TAB_ID}">${Known.buildKnownHTML(actor)}</section>`;
      Known.bindKnown(root.querySelector(`[data-tab="${Known.KNOWN_TAB_ID}"].tab`).firstElementChild, actor, () => {});
      return this;
    },
  };
}

test("Known: opening a hidden entry's page shows and expands it, writing nothing", async () => {
  const pc = game.actors.get(PC);
  pc.sheet = paintingSheet(pc);
  const mark = F.calls.length;
  assert.equal(await Known.openKnownEntry(pc, NPC), true);
  const section = pc.sheet.element.querySelector(`[data-tab="${Known.KNOWN_TAB_ID}"].tab`);
  assert.ok(section.querySelector(`.pt-row[data-id="${NPC}"].pt-open`), "the hidden entry's row is on the page and open");
  assert.deepEqual(F.calls.slice(mark).filter(c => c.op === "update"), [], "no document write");
  assert.equal(game.actors.get(PC).getFlag("pentaryn-ties", "known")[0].hidden, true, "the entry stays hidden in the data");
});
