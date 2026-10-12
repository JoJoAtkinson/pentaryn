/**
 * ties-ui-M1 (final review 2026-10-12): the Known tab's notes autosave waits 700 ms after the last
 * keystroke, and blur used to CANCEL that wait — so whatever was typed in the last 700 ms before
 * focus left the textarea (clicking elsewhere, or the sheet's close button, which takes focus first)
 * was never saved. Blur now flushes the pending save at once instead of dropping it; a blur with
 * nothing pending writes nothing, and the flushed save does not run a second time when its timer
 * would have fired.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", flags: { "pentaryn-ties": { known: [{ id: NPC, name: "ZZ Brakka", category: "sentient", notes: "Smells of salt.", when: 1_700_000_000_000 }] } } },
    { id: NPC, name: "ZZ Brakka" },
  ],
});
const get = id => game.actors.get(id);
const notesOf = () => get(PC).flags["pentaryn-ties"].known.find(e => e.id === NPC).notes;
const updates = mark => F.calls.slice(mark).filter(c => c.op === "update");
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

async function mount() {
  const Known = await import("../known-ui.mjs");
  const section = el("section");
  section.innerHTML = Known.buildKnownHTML(get(PC));
  Known.bindKnown(section.firstElementChild, get(PC), () => {});
  const notes = section.querySelector('[data-field="notes"]');
  assert.ok(notes, "the notes textarea is there");
  return notes;
}

test("ties-ui-M1: blur inside the 700 ms autosave wait saves the last typing instead of dropping it", async () => {
  const notes = await mount();
  const mark = F.calls.length;
  notes.value = "Smells of salt. Owes the guild";
  await notes.dispatch("input");
  // focus leaves (a click elsewhere, or the sheet's close button) before the 700 ms are up
  await settle(notes.dispatch("blur"));
  await settle(flush());
  assert.equal(notesOf(), "Smells of salt. Owes the guild", "the last keystrokes are saved on blur");
  assert.equal(updates(mark).length, 1, "one write");
  mock.timers.tick(2000);
  await settle(flush());
  assert.equal(updates(mark).length, 1, "the flushed save does not run again when its timer would have fired");
});

test("ties-ui-M1: a blur with nothing typed writes nothing", async () => {
  const notes = await mount();
  const mark = F.calls.length;
  await settle(notes.dispatch("blur"));
  mock.timers.tick(2000);
  await settle(flush());
  assert.equal(updates(mark).length, 0);
});
