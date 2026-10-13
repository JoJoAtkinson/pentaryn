/**
 * ties-ui-EXT-3 (final review 2026-10-12): the Ties and Known tabs each carried their own copy of the
 * notes autosave and the summary swap — and the copies drifted (the Known copy lost the last 700 ms of
 * typing on blur, ties-ui-M1, and once read the swapped node after moving it). Both now live once in
 * core/html.mjs: `bindNotesAutosave(textarea, save, { ms })` (blur flushes a pending save, never
 * cancels it) and `replaceSummary(row, html, rebind)`. The Ties tab's `change` listener on notes is
 * dropped — the autosave already covers it, so a blur no longer saves the same text twice.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

const F = await bootWorld({
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: {
        "pentaryn-ties": {
          ties: [{ id: NPC, word: "debtor", notes: "Owes us forty crowns.", stance: -1, strength: 4 }],
          known: [{ id: NPC, name: "ZZ Brakka", category: "sentient", notes: "Smells of salt.", when: 1_700_000_000_000 }],
        },
      },
    },
    { id: NPC, name: "ZZ Brakka" },
  ],
});
const get = id => game.actors.get(id);
const updates = mark => F.calls.slice(mark).filter(c => c.op === "update");
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const Html = await import("../core/html.mjs");

test("ties-ui-EXT-3: core/html.mjs exports bindNotesAutosave and replaceSummary", () => {
  assert.equal(typeof Html.bindNotesAutosave, "function");
  assert.equal(typeof Html.replaceSummary, "function");
});

test("ties-ui-EXT-3: bindNotesAutosave debounces typing, flushes on blur, never saves twice", async () => {
  const area = el("textarea");
  const saved = [];
  Html.bindNotesAutosave(area, v => saved.push(v), { ms: 700 });
  area.value = "a";
  await area.dispatch("input");
  area.value = "ab";
  await area.dispatch("input");
  mock.timers.tick(699);
  assert.deepEqual(saved, [], "nothing before the wait is up");
  mock.timers.tick(1);
  assert.deepEqual(saved, ["ab"], "one save of the last value");
  await area.dispatch("blur");
  assert.deepEqual(saved, ["ab"], "a blur with nothing pending saves nothing");
  area.value = "abc";
  await area.dispatch("input");
  await area.dispatch("blur");
  assert.deepEqual(saved, ["ab", "abc"], "blur flushes the pending save");
  mock.timers.tick(2000);
  assert.deepEqual(saved, ["ab", "abc"], "the flushed save does not fire again");
});

test("ties-ui-EXT-3: replaceSummary swaps the row's summary and rebinds the new node", () => {
  const row = el("div", { className: "pt-row" });
  row.innerHTML = `<div class="pt-summary">old</div><div class="pt-detail-wrap"></div>`;
  const seen = [];
  const next = Html.replaceSummary(row, `<div class="pt-summary" data-v="new">new</div>`, n => seen.push(n));
  assert.ok(next, "the new summary comes back");
  assert.equal(next.dataset.v, "new");
  assert.equal(row.querySelector(".pt-summary")?.dataset.v, "new", "the row now holds the new summary");
  assert.deepEqual(seen, [next], "rebind gets the node that went in");
  assert.equal(Html.replaceSummary(el("div"), "<div class='pt-summary'></div>", () => seen.push("x")), null, "no summary, no swap");
  assert.equal(seen.length, 1);
});

test("ties-ui-EXT-3: the Ties tab's notes flush on blur and save once (no extra change listener)", async () => {
  const Editor = await import("../editor.mjs");
  const section = el("section");
  section.innerHTML = Editor.buildHTML(get(PC));
  Editor.bind(section.firstElementChild, get(PC), () => {});
  const notes = section.querySelector('.pt-row:not([data-inbound]) [data-field="notes"]');
  assert.ok(notes, "the notes textarea is there");
  assert.equal((notes.listeners.change ?? []).length, 0, "notes have no change listener");
  const mark = F.calls.length;
  notes.value = "Owes us forty crowns. And a horse.";
  await notes.dispatch("input");
  await settle(notes.dispatch("blur"));
  await settle(notes.dispatch("change"));
  await settle(flush());
  mock.timers.tick(2000);
  await settle(flush());
  assert.equal(get(PC).flags["pentaryn-ties"].ties.find(t => t.id === NPC).notes, "Owes us forty crowns. And a horse.");
  assert.equal(updates(mark).length, 1, "one write");
});

test("ties-ui-EXT-3: both tabs use the shared helpers, not their own copies", () => {
  for (const f of ["editor.mjs", "known-ui.mjs"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(src.includes("bindNotesAutosave("), `${f} uses bindNotesAutosave`);
    assert.ok(src.includes("replaceSummary("), `${f} uses replaceSummary`);
    assert.ok(!src.includes("setTimeout("), `${f} keeps no autosave timer of its own`);
    assert.ok(!src.includes(".replaceWith("), `${f} does no summary swap of its own`);
  }
});
