// [declared] PT3-9 (wave-1 play test, 2026-10-11): after a base-actor rename the token labels
// followed but the combat tracker kept the old name. The relabel now also renames the COMBATANTS of
// that actor whose name was the old name or its part before the first comma (the token rule); any
// other combatant name is a custom one and is left alone. GM clients only: Foundry lets a player
// update only `initiative`, `flags`, `defeated` and `system` on a combatant
// (common/documents/combatant.mjs:76-85), so a player's rename leaves the tracker as it was.
// Same gate as the token relabel (the client that made the rename, or an api.sync caller), one batch
// write per combat, and the return value / toast still count token labels only.
//
// Own process and own world: the shared glue world has no combats, so golden/rename.json is unmoved.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { IDS, NEW, OLD, effects, equip, flush, reset, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const COMBAT = { a: "combatA000000001", b: "combatB000000001" };
const INITIAL = {
  cbtBob0000000001: "Bob",          // Bob's token tokA1 — follows
  cbtBobNick000001: "Boss Bob",     // a custom combatant name — left alone
  cbtOther00000001: "Bob",          // another actor also named Bob — left alone
  cbtFull000000001: OLD,            // Glubbek, full form — follows in full
  cbtShort00000001: "ZZ Glubbek",   // Glubbek, short form — follows in short form
  cbtBob0000000002: "Bob",          // Bob in a second encounter — follows, in that combat's write
};
const combatant = (id, actorId, tokenId, sceneId) => ({ id, actorId, tokenId, sceneId, name: INITIAL[id] });
const COMBATS = [
  {
    id: COMBAT.a,
    combatants: [
      combatant("cbtBob0000000001", IDS.bob, "tokA1000000000001", IDS.one),
      combatant("cbtBobNick000001", IDS.bob, "tokNick0000000001", IDS.one),
      combatant("cbtOther00000001", IDS.other, "tokOther000000001", IDS.one),
      combatant("cbtFull000000001", IDS.glubbek, "tokFull0000000001", IDS.live),
      combatant("cbtShort00000001", IDS.glubbek, "tokShort000000001", IDS.live),
    ],
  },
  { id: COMBAT.b, combatants: [combatant("cbtBob0000000002", IDS.bob, "tokA2000000000001", IDS.two)] },
];

const F = await installFoundry(world());
equip(F, { combats: COMBATS });
await import("../names.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.names;

const names = () => Object.fromEntries([...game.combats].flatMap(c => [...c.combatants]).map(c => [c.id, c.name]));
function resetAll() {
  reset(F);
  F.become({ userId: IDS.gm });
  for (const c of game.combats) for (const cb of c.combatants) cb.name = INITIAL[cb.id];
}
const combatWrites = () => effects(F.calls).filter(c => c.op === "updateEmbeddedDocuments" && c.embeddedName === "Combatant");

test("PT3-9: a GM rename relabels the actor's combatants that showed the old name, one write per combat", async () => {
  resetAll();
  await game.actors.get(IDS.bob).update({ name: "Rob" });
  await flush();
  assert.deepEqual(combatWrites().map(c => [c.uuid, c.updates]), [
    [`Combat.${COMBAT.a}`, [{ _id: "cbtBob0000000001", name: "Rob" }]],
    [`Combat.${COMBAT.b}`, [{ _id: "cbtBob0000000002", name: "Rob" }]],
  ]);
  assert.deepEqual(names(), { ...INITIAL, cbtBob0000000001: "Rob", cbtBob0000000002: "Rob" });
  const ops = effects(F.calls).map(c => `${c.op}${c.embeddedName ? `:${c.embeddedName}` : ""}`);
  assert.deepEqual(ops, [
    "update", "update", "updateEmbeddedDocuments:Token", "updateEmbeddedDocuments:Token",
    "updateEmbeddedDocuments:Combatant", "updateEmbeddedDocuments:Combatant", "notify",
  ], "tokens first, then combatants, then the one toast");
  assert.equal(effects(F.calls).at(-1).message, 'Token labels updated to "Rob" (3).', "the count is token labels only");
});

test("PT3-9: a full-form and a short-form combatant follow in the same form as tokens", async () => {
  resetAll();
  await game.actors.get(IDS.glubbek).update({ name: NEW });
  await flush();
  assert.deepEqual(combatWrites().map(c => c.updates), [[
    { _id: "cbtFull000000001", name: NEW },
    { _id: "cbtShort00000001", name: "ZZ Brakka" },
  ]]);
});

test("PT3-9: a player's rename writes no combatant (Foundry refuses a player's combatant name)", async () => {
  resetAll();
  F.become({ userId: IDS.player });
  try {
    await game.actors.get(IDS.bob).update({ name: "Rob" });
    await flush();
  } finally {
    F.become({ userId: IDS.gm });
  }
  assert.deepEqual(combatWrites(), []);
  assert.deepEqual(names(), INITIAL);
  assert.equal(effects(F.calls).filter(c => c.op === "updateEmbeddedDocuments").length, 2, "the token relabel still ran");
});

test("PT3-9: another client's rename writes nothing here (same initiator gate as the tokens)", async () => {
  resetAll();
  const actor = game.actors.get(IDS.bob);
  actor.name = "Rob";
  F.fire("updateActor", actor, { name: "Rob" }, { pentarynOldName: "Bob" }, IDS.player);
  await flush();
  assert.deepEqual(effects(F.calls), []);
  assert.deepEqual(names(), INITIAL);
});

test("PT3-9: api.sync repairs combatants too; the count and toast stay token labels only", async () => {
  resetAll();
  const actor = game.actors.get(IDS.bob);
  for (const scene of game.scenes) for (const t of scene.tokens) if (t.actorId === IDS.bob && t.name === "Bob") t.name = "Rob";
  actor.prototypeToken.name = "Rob";
  assert.equal(await api.sync(actor, "Bob", "Rob"), 0, "every token label was already right");
  assert.deepEqual(combatWrites().map(c => c.updates.map(u => u._id)), [["cbtBob0000000001"], ["cbtBob0000000002"]]);
  assert.deepEqual(effects(F.calls).filter(c => c.op === "notify"), [], "no toast: no token label changed");
  F.calls.length = 0;
  assert.equal(await api.sync(actor, "Bob", "Rob"), 0);
  assert.deepEqual(combatWrites(), [], "a second call finds nothing: a combat with no change gets no write");
});
