/**
 * ties-ui-ACC-3 (final review 2026-10-12): every ties / Known edit reads the actor's whole array,
 * changes one row, and writes the whole array back — and the local copy only changes when the
 * server answers. Two quick edits inside one round trip (a word typed then a strength pip clicked,
 * a field edit then a Remove, a Known category then its notes) each read the OLD array, so the
 * second write silently put back what the first had just changed. Each actor's ties and Known
 * writes now run one at a time, and each read happens inside the queue, after the previous write
 * has landed.
 *
 * The round trip is simulated: `actor.update` waits on a gate the test opens by hand, so the
 * second gesture really does start while the first write is still in flight.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const OTHER = "zzOther000000001";

const F = await bootWorld({
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: {
        "pentaryn-ties": {
          ties: [
            { id: NPC, word: "debtor", notes: "", stance: 0, strength: 2 },
            { id: OTHER, word: "rival", notes: "", stance: 0, strength: 3 }
          ],
          known: [{ id: NPC, name: "ZZ Brakka", category: "sentient", notes: "", when: 1_700_000_000_000 }]
        }
      }
    },
    { id: NPC, name: "ZZ Brakka" },
    { id: OTHER, name: "ZZ Other" }
  ]
});
const get = id => game.actors.get(id);
const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

/** Hold every update on `actor` until `open()` lets the oldest one through — a slow server. */
function slowServer(actor) {
  const real = actor.update;
  const gates = [];
  actor.update = function (changes, options) {
    return new Promise(r => gates.push(r)).then(() => real.call(this, changes, options));
  };
  return {
    pending: () => gates.length,
    async drain() {
      for (let i = 0; i < 20; i++) {
        await flush();
        if (!gates.length) continue;
        gates.shift()();
      }
      await flush();
    },
    restore: () => {
      actor.update = real;
    }
  };
}

const tiesOf = id => get(id).flags["pentaryn-ties"].ties;
const tieOf = (id, target) => tiesOf(id).find(t => t.id === target);

async function mountTies() {
  const Editor = await import("../editor.mjs");
  const section = el("section");
  section.innerHTML = Editor.buildHTML(get(PC));
  Editor.bind(section.firstElementChild, get(PC), () => {});
  return section;
}

test("ties-ui-ACC-3: a word typed then a strength pip clicked before the first save lands keeps both", async () => {
  const section = await mountTies();
  const row = section.querySelector(`.pt-row[data-id="${NPC}"]`);
  const word = row.querySelector('[data-field="word"]');
  const pip = row.querySelector('.pt-pip[data-action="strength"][data-n="5"]');
  assert.ok(word && pip, "the word input and the fifth pip are there");
  const server = slowServer(get(PC));
  try {
    word.value = "old friend";
    const a = word.dispatch("change");
    await flush();
    const b = pip.dispatch("click");
    await server.drain();
    await settle(Promise.all([a, b]));
  } finally {
    server.restore();
  }
  assert.equal(tieOf(PC, NPC).word, "old friend", "the word the first edit saved is still there");
  assert.equal(tieOf(PC, NPC).strength, 5, "the pip the second edit clicked is saved too");
});

test("ties-ui-ACC-3: a field edit then a Remove of another row before the first save lands keeps the edit", async () => {
  const section = await mountTies();
  const row = section.querySelector(`.pt-row[data-id="${NPC}"]`);
  const word = row.querySelector('[data-field="word"]');
  const remove = section.querySelector(`[data-action="remove"][data-id="${OTHER}"]`);
  assert.ok(word && remove, "the word input and the other row's Remove are there");
  const server = slowServer(get(PC));
  try {
    F.dialogs.push(true);
    word.value = "sworn enemy";
    const a = word.dispatch("change");
    await flush();
    const b = remove.dispatch("click");
    await server.drain();
    await settle(Promise.all([a, b]));
  } finally {
    server.restore();
  }
  assert.equal(tieOf(PC, NPC)?.word, "sworn enemy", "the edit survives the removal");
  assert.equal(tieOf(PC, OTHER), undefined, "the other row is removed");
});

test("ties-ui-ACC-3: two Known field saves in one round trip both land (known.set)", async () => {
  const { setKnownField } = await import("../known-data.mjs");
  const server = slowServer(get(PC));
  let a, b;
  try {
    a = setKnownField(get(PC), NPC, "category", "beasts");
    await flush();
    b = setKnownField(get(PC), NPC, "notes", "Smells of salt.");
    await server.drain();
    await settle(Promise.all([a, b]));
  } finally {
    server.restore();
  }
  const entry = get(PC).flags["pentaryn-ties"].known.find(e => e.id === NPC);
  assert.equal(entry.category, "beasts", "the first save is kept");
  assert.equal(entry.notes, "Smells of salt.", "the second save lands too");
});

test("ties-ui-ACC-3: a failed write does not jam the queue for the next edit", async () => {
  const { serial } = await import("../ties-adapter.mjs");
  await assert.rejects(serial(PC, async () => {
    throw new Error("server said no");
  }));
  const ran = await settle(serial(PC, async () => "next"));
  assert.equal(ran, "next");
});
