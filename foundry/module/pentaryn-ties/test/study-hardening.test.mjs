/**
 * ties-29: the blind roll's private-API dependency is asked before the claim, and a throw after the
 * claim hands it back. (The declared B4 pin covers the missing-API case end to end.)
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
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const Apply = await import("../study/apply.mjs");
const Study = await import("../study.mjs");
const get = id => game.actors.get(id);

test("rollModeBlind maps BLIND through core's map, and names the missing API when it is gone", () => {
  const keep = foundry.dice.Roll._mapLegacyRollMode;
  foundry.dice.Roll._mapLegacyRollMode = m => `mapped:${m}`;
  assert.equal(Apply.rollModeBlind(), `mapped:${CONST.DICE_ROLL_MODES.BLIND}`);
  delete foundry.dice.Roll._mapLegacyRollMode;
  assert.throws(() => Apply.rollModeBlind(), /_mapLegacyRollMode is missing/);
  foundry.dice.Roll._mapLegacyRollMode = keep;
});

test("a roll that throws after the claim releases it: the error surfaces, the fact is studyable again", async () => {
  const pc = get(PC);
  const roll = pc.rollSkill;
  pc.rollSkill = async () => {
    throw new Error("zz dice tray exploded");
  };
  await assert.rejects(settle(Study.studyAs(pc, get(NPC), { loreId: "l1" })), /dice tray exploded/);
  pc.rollSkill = roll;
  assert.equal(Study.beliefsOf(get(NPC))[PC]?.[`lore:${NPC}:l1`] ?? null, null, "no claim row left");
  F.rolls.push(18);
  assert.equal(await settle(Study.studyAs(pc, get(NPC), { loreId: "l1" })), true);
});

/* ── ties-30: the knowledge and attribute-belief stores are serialised ─────── */

async function withSlowSettings(fn) {
  const set = game.settings.set.bind(game.settings);
  game.settings.set = async (...args) => {
    await new Promise(r => setTimeout(r, 10)); // a server round trip, on the mocked timer
    return set(...args);
  };
  try {
    return await fn();
  } finally {
    game.settings.set = set;
  }
}

test("ties-30: two concurrent setKnowledge calls both land (each reads inside the queue)", async () => {
  const A = await import("../attributes.mjs");
  await withSlowSettings(() =>
    settle(Promise.all([
      A.setKnowledge([{ characterId: "a", attrId: "x", via: "grant", when: 1 }]),
      A.setKnowledge([{ characterId: "b", attrId: "y", via: "grant", when: 2 }]),
    ]))
  );
  const k = A.knowledge();
  assert.ok(k.a?.x && k.b?.y, JSON.stringify(k));
});

test("ties-30: a clearKnowledge racing a setKnowledge loses neither", async () => {
  const A = await import("../attributes.mjs");
  await settle(A.setKnowledge([{ characterId: "c", attrId: "z", via: "shared", when: 3 }]));
  const [, cleared] = await withSlowSettings(() =>
    settle(Promise.all([
      A.setKnowledge([{ characterId: "d", attrId: "w", via: "grant", when: 4 }]),
      A.clearKnowledge("c", "z"),
    ]))
  );
  const k = A.knowledge();
  assert.equal(cleared, true);
  assert.equal(k.c?.z, undefined);
  assert.ok(k.d?.w);
});

test("ties-30: two concurrent attribute-belief writes both land", async () => {
  const Apply = await import("../study/apply.mjs");
  const fact = id => ({ ns: "attr", factKey: `attr:guild:${id}` });
  await withSlowSettings(() =>
    settle(Promise.all([
      Apply.putBelief(fact("r1"), "pc1", { text: "one", total: 15, when: 1, delivered: 1 }),
      Apply.putBelief(fact("r2"), "pc2", { text: "two", total: 16, when: 2, delivered: 2 }),
    ]))
  );
  assert.equal(Apply.readBelief(fact("r1"), "pc1")?.text, "one");
  assert.equal(Apply.readBelief(fact("r2"), "pc2")?.text, "two");
});

/* ── ties-32: escaped art, a checked item-mark icon ───────────────────────── */

test("ties-32: an item mark's icon is one fa- class or the flame", async () => {
  const { decorate } = await import("../item-marks.mjs");
  const { el, serialise } = await import("./fixtures/dom.mjs");
  const row = icon => el("li", { dataset: { itemId: "zzItem0000000001" }, children: [el("div", { className: "name", children: [el("span", { className: "title" })] })] });
  const cases = [["fa-skull", "pt-item-mark fa-solid fa-skull"], ["x\" onmouseover", "pt-item-mark fa-solid fa-fire"], ["fa-a fa-b", "pt-item-mark fa-solid fa-fire"], [undefined, "pt-item-mark fa-solid fa-fire"]];
  for (const [icon, want] of cases) {
    const r = row(icon);
    const actor = { items: { get: () => ({ getFlag: () => ({ icon }) }) } };
    decorate({ actor }, el("ol", { children: [r] }));
    assert.match(JSON.stringify(serialise(r)), new RegExp(want.replace(/ /g, " ")), String(icon));
  }
});

test("concealmentFor: never throws, reads the conceal flag", async () => {
  const { concealmentFor } = await import("../study/resolve.mjs");
  const { makeDoc } = await import("./kit/foundry-stub.mjs");
  assert.equal(concealmentFor(null, "guild"), 0);
  assert.equal(concealmentFor("zzNpc", "guild"), 0);
  const flat = makeDoc("Actor", { id: "zzConceal0000001", flags: { "pentaryn-ties": { conceal: 3 } } });
  assert.equal(concealmentFor(flat, "guild"), 3);
  const keyed = makeDoc("Actor", { id: "zzConceal0000002", flags: { "pentaryn-ties": { conceal: { default: 2, guild: 5 } } } });
  assert.equal(concealmentFor(keyed, "guild"), 5);
  assert.equal(concealmentFor(keyed, "city"), 2);
});
