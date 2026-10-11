/**
 * ties-33: the silent refusals speak at debug, and only at debug. CONFIG.debug["pentaryn-ties"] off →
 * no console.debug line at all; on → one `pentaryn-ties | <event>` line with its fields. The returns
 * themselves are unchanged (the conduit and socket suites pin them).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>" }] } } },
  ],
  tokens: [{ id: "zzTokNpc00000001", actorId: NPC }],
});
const T = () => game.pentaryn.ties;
const Relay = await import("../relay.mjs");
const debug = [];
console.debug = (...a) => debug.push({ text: String(a[0]), fields: a[1] ?? null });
const on = v => {
  CONFIG.debug ??= {};
  if (v) CONFIG.debug["pentaryn-ties"] = true;
  else delete CONFIG.debug["pentaryn-ties"];
};
const get = id => game.actors.get(id);

async function refusals() {
  debug.length = 0;
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  const gm = game.user;
  game.user = { id: "zzPlayerUser0001", isGM: false };
  try {
    return {
      lore: await settle(T().study.askLore(get(PC), get(NPC), "l1")),
      inspect: await settle(T().study.examine(get(PC), get(NPC))),
      mirror: Relay.requestMirror({ source: get(PC), target: get(PC) }),
    };
  } finally {
    game.user = gm;
    await game.settings.set("pentaryn-ties", "playerAccess", true);
  }
}

test("debug off: the refusals return what they always did and print nothing", async () => {
  on(false);
  assert.deepEqual(await refusals(), { lore: false, inspect: false, mirror: false });
  assert.deepEqual(debug, []);
});

test("debug on: one line per refusal, naming why", async () => {
  on(true);
  try {
    assert.deepEqual(await refusals(), { lore: false, inspect: false, mirror: false });
  } finally {
    on(false);
  }
  assert.deepEqual(debug.map(d => d.text), [
    "pentaryn-ties | request refused",
    "pentaryn-ties | inspect refused",
    "pentaryn-ties | mirror not requested",
  ]);
  assert.deepEqual(debug[0].fields, { reason: "playerAccess", characterId: PC, subjectId: NPC, ns: "lore" });
  assert.equal(debug[1].fields.reason, "playerAccess");
  assert.equal(debug[2].fields.reason, "no pair");
});
