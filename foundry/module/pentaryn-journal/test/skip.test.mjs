// items-journal-36 (rest): an add that writes nothing leaves one console.info breadcrumb with its reason
// (core.skipReason); toasts are unchanged and ui.notifications.warn is reached only through `toast`.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";
import * as core from "../journal-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

test("skipReason, in the save's order", () => {
  assert.equal(core.skipReason({ journal: null }), "no-journal");
  assert.equal(core.skipReason({}), "no-journal");
  assert.equal(core.skipReason({ journal: {}, sources: [] }), "nothing-visible");
  assert.equal(core.skipReason({ journal: {}, sources: [1], plan: { tooLarge: true } }), "too-large");
  assert.equal(core.skipReason({ journal: {}, sources: [1], plan: { tooLarge: false } }), null);
});

test("ui.notifications.warn appears only inside the toast helpers", () => {
  for (const f of ["personal.mjs", "bar.mjs", "sources-adapter.mjs", "api.mjs", "journal.mjs"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const lines = src.split("\n").filter(l => l.includes("ui.notifications.warn"));
    for (const l of lines) assert.match(l, /^const toast = msg => ui\.notifications\.warn\(msg\);$/, `${f}: ${l}`);
  }
});

test("a player's add with nothing visible: null, one 'add skipped: nothing-visible' info line, no toast", async () => {
  const F = await journalWorld();
  await import("../journal.mjs");
  F.fire("init");
  F.fire("ready");
  for (let i = 0; i < 30; i++) await Promise.resolve();
  F.become({ userId: P1 });
  const readable = makeDoc("JournalEntry", { id: "readable00000005", name: "Sealed", ownership: { default: 2 } });
  const hidden = makeDoc("JournalEntryPage", { name: "Hidden", type: "text", ownership: { default: 0 }, text: { content: "<p>x</p>" } }, { parent: readable });
  Object.defineProperty(readable, "pages", { value: { contents: [hidden], filter: fn => [hidden].filter(fn) }, enumerable: false });
  const lines = [];
  const keep = console.info;
  console.info = (...a) => lines.push(a.map(x => F.plain(x)));
  const from = F.calls.length;
  try {
    assert.equal(await game.pentaryn.journal.add(readable), null);
  } finally {
    console.info = keep;
  }
  const journalId = game.pentaryn.journal.personal().id;
  assert.deepEqual(lines, [["pentaryn-journal | add skipped: nothing-visible", { target: "entry", journal: journalId }]]);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify"), []);
  F.become({ userId: GM });
});
