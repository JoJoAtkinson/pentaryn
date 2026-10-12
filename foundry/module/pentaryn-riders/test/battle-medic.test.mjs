// Battle Medic (B3): the dnd5e.preUseActivity veto (battleMedicBlock, combat-riders-26 oracle), the
// dnd5e.postUseActivity runner (owner write or GM relay), and the relay query handler itself
// (combat-riders-27 oracle: its return value and its four thrown messages, verbatim).
//
// KNOWN combat-riders-41: the relay has no claim. The server sends a query to every socket of the
// active GM's account, and the handler's gate (`isGM && activeGM.isSelf`) passes in every one of
// those tabs, so two GM tabs heal twice and spend two Hit Dice. Pinned below; the [declared] claim-
// first commit after the structural refactor flips it (todo at the end).
// Not pinned: the relay's console output — S6 adds the audit lines of combat-riders-27 (todo).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, MODULE, drain, makeActor, setupWorld, target } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const QUERY = `${MODULE}.battleMedic`;
const relay = F.CONFIG.queries[QUERY];
const healer = W.actor(IDS.healer), npc = W.actor(IDS.npc), sorc = W.actor(IDS.sorc), wisp = W.actor(IDS.noHd);
await api.installBattleMedic(healer);
const medic = healer.items.get("healerfeat000001").system.activities.find(a => a.flags?.[MODULE]?.flow === "battle-medic");
const notes = () => F.calls.filter(c => c.op === "notify").splice(0);
let seenNotes = 0;
const newNotes = () => { const all = notes(); const out = all.slice(seenNotes); seenNotes = all.length; return out.map(n => [n.level, n.message]); };
const asPlayer = async fn => { F.become({ userId: IDS.player }); try { return await fn(); } finally { F.become({ userId: IDS.gm }); } };
W.take(); W.takeLog(); newNotes();

/* ── the veto ─────────────────────────────────────────────────────────────── */

test("veto: no sole target, no Hit Dice, all spent → warn and return false (the kit is not spent)", () => {
  W.target();
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false);
  W.target(target(npc), target(sorc));
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false, "two targets is no sole target");
  W.target(target(wisp, "Wisp token"));
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false);
  const spent = makeActor({ name: "Spent", type: "npc", system: { isNPC: true, attributes: { hp: { value: 1, max: 9 }, hd: { denomination: "d6", value: 0, spent: 2 } } } });
  W.target(target(spent, "Spent token"));
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false);
  W.target({ name: "no actor", actor: null });
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false);
  assert.deepEqual(newNotes(), [
    ["warn", "Battle Medic: target the one creature you are tending first."],
    ["warn", "Battle Medic: target the one creature you are tending first."],
    ["warn", "Battle Medic: Wisp token has no Hit Dice left to spend."],
    ["warn", "Battle Medic: Spent token has no Hit Dice left to spend."],
    ["warn", "Battle Medic: target the one creature you are tending first."],
  ]);
});

test("veto: a player on a target they don't own with no GM online → noGM; with a GM → allowed", async () => {
  W.target(target(npc, "Grisk token"));
  await asPlayer(() => {
    W.gm.active = false;
    F.game.user.targets = new Set([target(npc, "Grisk token")]);
    assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), false);
    W.gm.active = true;
    assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), true);
  });
  assert.deepEqual(newNotes(), [["warn", "Battle Medic needs the GM online to heal a creature you don't control."]]);
});

test("veto: not Battle Medic, or the setting off → never vetoed", async () => {
  W.target();
  const named = { name: "Battle Medic", flags: {}, item: healer.items.get("healerfeat000001") };
  assert.equal(F.fireCall("dnd5e.preUseActivity", named, {}, {}, {}), false, "matched by name on the Healer feat");
  const elsewhere = { name: "Battle Medic", flags: {}, item: sorc.items.get("eladept000000001") };
  assert.equal(F.fireCall("dnd5e.preUseActivity", elsewhere, {}, {}, {}), true);
  await F.game.settings.set(MODULE, "enabled", false);
  assert.equal(F.fireCall("dnd5e.preUseActivity", medic, {}, {}, {}), true);
  await F.game.settings.set(MODULE, "enabled", true);
  assert.equal(F.fireCall("dnd5e.preUseActivity", null, {}, {}, {}), true);
  newNotes();
  assert.deepEqual(W.take(), []);
});

/* ── the runner ───────────────────────────────────────────────────────────── */

test("postUse on the GM (owns the target): roll the patient's largest die + PB, spend it, heal", async () => {
  W.target(target(npc, "Grisk token"));
  W.rolls.push(7);
  W.takeLog();
  const before = F.calls.length;
  F.fire("dnd5e.postUseActivity", medic);
  await drain();
  pinJSON("battle-medic-owner-log", W.takeLog(), import.meta.url);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => [c.uuid, c.changes]), [[`Actor.${IDS.npc}`, { "system.attributes.hd.spent": 2 }]]);
  assert.deepEqual(newNotes(), [["info", "Grisk token spends a d8 Hit Die and regains 7 HP. Hit Dice left: 3/5."]]);
  assert.equal(npc.system.attributes.hp.value, 17);
});

test("postUse on a player's client, target not theirs: the GM relay is queried with the payload", async () => {
  // the stub's user.query runs the handler on THIS client: switch to the GM for the handler, as the server would
  F.CONFIG.queries[QUERY] = async (data, { user }) => {
    F.become({ userId: IDS.gm });
    try { return await relay(data, { user }); } finally { F.become({ userId: IDS.player }); }
  };
  W.rolls.push(30);
  const before = F.calls.length;
  const result = await asPlayer(async () => {
    const r = api.battleMedic(healer, target(npc, "Grisk token"));
    return r;
  });
  F.CONFIG.queries[QUERY] = relay;
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "query"), [
    { op: "query", to: IDS.gm, name: QUERY, data: { healerUuid: `Actor.${IDS.healer}`, targetUuid: `Actor.${IDS.npc}`, faces: 8, amount: 11 } },
  ]);
  assert.deepEqual(result, { faces: 8, healed: 11, hp: 28, value: 3, max: 6 });
  assert.deepEqual(newNotes(), [["info", "Grisk token spends a d8 Hit Die and regains 11 HP."]], "a player who can't see the sheet gets the short text");
});

test("runner failures: no Hit Dice left, no GM, the write throws, the roll throws", async () => {
  assert.equal(await api.battleMedic(healer, target(wisp, "Wisp token")), null);
  assert.equal(await asPlayer(async () => { W.gm.active = false; try { return await api.battleMedic(healer, target(npc, "Grisk token")); } finally { W.gm.active = true; } }), null);
  const RealRoll = globalThis.Roll;
  globalThis.Roll = class { constructor() { throw new Error("roll broke"); } };
  W.target(target(npc, "Grisk token"));
  F.fire("dnd5e.postUseActivity", medic);
  await drain();
  globalThis.Roll = RealRoll;
  assert.deepEqual(newNotes(), [
    ["warn", "Battle Medic: Wisp token has no Hit Dice left to spend."],
    ["warn", "Battle Medic was rolled, but Grisk token's Hit Die and HP couldn't be updated — tell the GM."],
  ]);
  assert.deepEqual(W.take(), [
    ["warn", `${MODULE} | Battle Medic write failed`, "no GM"],
    ["warn", `${MODULE} | Battle Medic failed`, "roll broke"],
  ]);
});

test("KNOWN (audit, LLM interface): battleMedic(healer, ACTOR) is read as a token with no actor → 'no Hit Dice' for the actor's name", async () => {
  assert.equal(await api.battleMedic(healer, npc), null);
  assert.deepEqual(newNotes(), [["warn", "Battle Medic: Grisk has no Hit Dice left to spend."]]);
});

test("postUse ignores: no sole target, no activity actor, the setting off; a throw is warned", async () => {
  W.takeLog();
  W.target();
  F.fire("dnd5e.postUseActivity", medic);
  W.target(target(npc));
  F.fire("dnd5e.postUseActivity", { ...medic, flags: medic.flags, name: medic.name, item: { name: "Healer", type: "feat", system: { identifier: "healer" } } });
  await F.game.settings.set(MODULE, "enabled", false);
  F.fire("dnd5e.postUseActivity", medic);
  await F.game.settings.set(MODULE, "enabled", true);
  F.fire("dnd5e.postUseActivity", { get flags() { throw new Error("bad activity"); } });
  await drain();
  assert.deepEqual(W.takeLog(), []);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Battle Medic skipped`, "bad activity"]]);
});

/* ── the relay handler (GM side) ─────────────────────────────────────────── */

const payload = (o = {}) => ({ healerUuid: `Actor.${IDS.healer}`, targetUuid: `Actor.${IDS.npc}`, faces: 8, amount: 99, ...o });

test("relay oracle: clamps to the die + the healer's PB, spends that die, returns the result", async () => {
  npc.system.attributes.hp.value = 10;
  const out = await relay(payload(), { user: W.player });
  assert.deepEqual(out, { faces: 8, healed: 11, hp: 21, value: 3, max: 7 });
  const zero = await relay(payload({ amount: -5, faces: "junk" }), { user: W.player });
  assert.deepEqual(zero, { faces: 8, healed: 0, hp: 21, value: 3, max: 8 }, "junk faces → the largest; negative → 0");
});

test("relay oracle: the four refusals, verbatim, and the no-Hit-Dice throw", async () => {
  // D-r1 [declared, failure path]: a non-GM receiver is refused by the kit's guarded wrapper first
  await asPlayer(() => assert.rejects(relay(payload(), { user: W.player }), { message: "NOT_GM: this client is not a GM" }));
  await assert.rejects(relay(payload({ healerUuid: "Actor.nobody0000000001" }), { user: W.player }), { message: "unknown actor" });
  await assert.rejects(relay(payload({ targetUuid: `Actor.${IDS.npc}.Item.x` }), { user: W.player }), { message: "unknown actor" });
  await assert.rejects(relay(null, { user: W.player }), { message: "unknown actor" });
  await assert.rejects(relay(payload(), {}), { message: "sender does not own the healer" });
  await assert.rejects(relay(payload(), undefined), { message: "sender does not own the healer" });
  const stranger = { id: "stranger00000001", isGM: false };
  await assert.rejects(relay(payload(), { user: stranger }), { message: "sender does not own the healer" });
  await assert.rejects(relay(payload({ healerUuid: `Actor.${IDS.sorc}` }), { user: W.player }), { message: "healer has no Healer feat" });
  await assert.rejects(relay(payload({ targetUuid: `Actor.${IDS.noHd}` }), { user: W.player }), { message: "Wisp has no Hit Dice left" });
});

test("relay: a second, non-active GM refuses with 'not the active GM'", async () => {
  // gm2 sorts before gmUser0000000001 → it is the active GM; this client (gmUser…01) is not
  const { makeUser } = await import("./kit/foundry-stub.mjs");
  const gm0 = makeUser({ id: "gmUser0000000000", name: "Other GM", isGM: true, active: true });
  F.game.users.set(gm0.id, gm0);
  await assert.rejects(relay(payload(), { user: W.player }), { message: "not the active GM" });
  F.game.users.delete(gm0.id);
});

test("KNOWN combat-riders-41: the same payload reaching two GM tabs heals twice and spends two Hit Dice", async () => {
  npc.system.attributes.hp.value = 10;
  const spentBefore = npc.system.attributes.hd.spent;
  W.takeLog();
  const [a, b] = await Promise.all([relay(payload({ amount: 6 }), { user: W.player }), relay(payload({ amount: 6 }), { user: W.player })]);
  assert.equal(a.faces, 8);
  assert.equal(b.faces, 8);
  assert.equal(npc.system.attributes.hp.value, 22);
  assert.equal(npc.system.attributes.hd.spent, spentBefore + 2);
  assert.equal(W.takeLog().filter(l => l.op === "applyDamage").length, 2);
});

test.todo("combat-riders-41 [declared]: two GM tabs, one payload → one heal, one Hit Die, both tabs resolve to the same result");
test.todo("combat-riders-27 (S6): the relay logs one info line on success and one warn before each refusal; runBattleMedic's warn names the uuids");
