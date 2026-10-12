// Guide §4 "once-per-casting guard": the guard reads the usage card's own messages from dnd5e 6's
// origin index (dnd5e.registry.messages.get(origin)) instead of scanning the whole chat log, and
// falls back to the scan when the registry is absent or throws. rolls.test pins the scan path (its
// world has no dnd5e global); this file pins the registry path and their equivalence.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, roll, setupWorld } from "./fixtures/world.mjs";
import * as core from "../riders-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const sorc = W.actor(IDS.sorc);
const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
await api.setType(sorc.items.get("elaffin000000001"), "fire");

const CARD = "usecard000000001";
const used = (id, origin, applied) => ({ id, _source: { system: { origin } }, flags: { [MODULE]: { applied } } });

/** A registry shaped like dnd5e 6's MessageRegistry: messages tracked by _source.system.origin. */
function registryOf(messages, calls = []) {
  const byOrigin = new Map();
  for (const m of messages) {
    const o = m?._source?.system?.origin;
    if (!o) continue;
    if (!byOrigin.has(o)) byOrigin.set(o, []);
    byOrigin.get(o).push(m);
  }
  return { get(origin) { calls.push(origin); return [...(byOrigin.get(origin) ?? [])]; } };
}

function configure(origin) {
  const rolls = [roll("2d6[fire]", { type: "fire" })];
  const message = { data: { system: { origin } } };
  F.fire("dnd5e.postDamageRollConfiguration", rolls, { subject: ray }, {}, message);
  return rolls.map(r => r.formula);
}

/** game.messages that fails the test if anything iterates it. */
function untouchableLog() {
  const log = new Map();
  log[Symbol.iterator] = () => { throw new Error("the whole chat log was scanned"); };
  log.values = log[Symbol.iterator];
  return log;
}

test("with dnd5e's registry: the card's own messages decide, the chat log is never scanned", () => {
  const saved = F.game.messages;
  const calls = [];
  try {
    F.game.messages = untouchableLog();
    globalThis.dnd5e = { registry: { messages: registryOf([used("dmgmsg0000000001", CARD, ["elemental-affinity"])], calls) } };
    assert.deepEqual(configure(CARD), ["2d6min2[fire]"], "Affinity already taken from this card: no second +CHA");
    assert.deepEqual(configure("freshcard0000001"), ["2d6min2[fire] + 4[Elemental Affinity]"]);
    assert.deepEqual(calls, [CARD, "freshcard0000001"]);
    assert.deepEqual(W.take().filter(([lvl]) => lvl !== "debug"), []);
  } finally {
    F.game.messages = saved;
    delete globalThis.dnd5e;
  }
});

test("registry absent, throwing or answering a non-array: the whole chat log, as before", () => {
  F.game.messages.set("dmgmsg0000000001", used("dmgmsg0000000001", CARD, ["elemental-affinity"]));
  try {
    for (const dnd5e of [undefined, { registry: {} }, { registry: { messages: { get() { throw new Error("boom"); } } } },
      { registry: { messages: { get: () => null } } }]) {
      if (dnd5e) globalThis.dnd5e = dnd5e; else delete globalThis.dnd5e;
      assert.deepEqual(configure(CARD), ["2d6min2[fire]"]);
      assert.deepEqual(configure("freshcard0000001"), ["2d6min2[fire] + 4[Elemental Affinity]"]);
    }
  } finally {
    F.game.messages.delete("dmgmsg0000000001");
    delete globalThis.dnd5e;
  }
});

test("no origin: the registry is not asked and nothing counts as used", () => {
  const calls = [];
  globalThis.dnd5e = { registry: { messages: registryOf([], calls) } };
  try {
    assert.deepEqual(configure(null), ["2d6min2[fire] + 4[Elemental Affinity]"]);
    assert.deepEqual(calls, []);
  } finally { delete globalThis.dnd5e; }
});

test("equivalence over a 200-message log: the registry's messages give the same used keys as the scan", () => {
  const log = [];
  for (let i = 0; i < 200; i++) {
    const origin = `card${String(i % 9).padStart(12, "0")}`;
    const applied = [["elemental-affinity"], [], ["healer", "elemental-adept"], ["healer"], []][(i % 9) % 5];
    log.push({ _source: { system: { origin: i % 11 === 0 ? undefined : origin } }, flags: i % 13 === 0 ? {} : { [MODULE]: { applied } } });
  }
  const registry = registryOf(log);
  for (let n = 0; n < 10; n++) {
    const origin = `card${String(n).padStart(12, "0")}`;
    assert.deepEqual(core.usedFromMessages(registry.get(origin), origin).sort(), core.usedFromMessages(log, origin).sort(), origin);
  }
});
