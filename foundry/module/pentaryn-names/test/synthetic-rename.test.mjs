// [declared] names-edge-1 (+rob-1), final review 2026-10-12, Joe's ruling: renaming an unlinked
// token's SYNTHETIC actor (Foundry routes it to the token's ActorDelta) renames only that token, and
// on a GM client only that token's combatants. Before the fix the updateActor hook ran sync() on the
// synthetic actor, which carries the base actor's id: every sibling token of the base actor on every
// scene and their combatants were relabelled, and a `prototypeToken.name` write Foundry drops into the
// ActorDelta was sent, counted and toasted.
//
// Own process and own world: an unlinked token with its synthetic actor on scene one, its siblings
// (the shared world's Bob tokens) and a combat holding the token and a sibling.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, effects, equip, flush, reset, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const TOK = "tokUnlinkedZZ002";
const COMBAT = "combatS000000001";
const data = world();
data.scenes[0].tokens.push({ id: TOK, actorId: IDS.bob, actorLink: false, x: 500, y: 100, name: "Bob", actor: null });

const F = await installFoundry(data);
equip(F, {
  combats: [{
    id: COMBAT,
    combatants: [
      { id: "cbtSynth00000001", actorId: IDS.bob, tokenId: TOK, sceneId: IDS.one, name: "Bob" },
      { id: "cbtSibling000001", actorId: IDS.bob, tokenId: "tokA1000000000001", sceneId: IDS.one, name: "Bob" },
    ],
  }],
});
const scene = game.scenes.get(IDS.one);
const tok = scene.tokens.get(TOK);
// The token's synthetic actor: same id as the base actor, parented by the token; its update is dropped.
const synthetic = makeDoc("Actor", { id: IDS.bob, name: "Bob", type: "npc", prototypeToken: { name: "Bob" } }, { parent: tok });
Object.defineProperty(synthetic, "isToken", { value: true, enumerable: false });
Object.defineProperty(synthetic, "token", { value: tok, enumerable: false });
Object.defineProperty(synthetic, "update", {
  value: async changes => (F.calls.push({ op: "update", documentName: "Actor", uuid: synthetic.uuid, changes: F.plain(changes) }), undefined),
  enumerable: false,
});
tok.actor = synthetic;

await import("../names.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

/** Rename the synthetic actor as Foundry would: preUpdateActor on the renaming client, then updateActor. */
async function renameSynthetic(to, userId = IDS.gm) {
  const changes = { name: to };
  const options = {};
  F.fireCall("preUpdateActor", synthetic, changes, options, userId);
  synthetic.name = to;
  F.fire("updateActor", synthetic, changes, options, userId);
  await flush();
}

test("names-edge-1: renaming an unlinked token's synthetic actor relabels only that token and its combatant; no sibling, no prototype write", async () => {
  reset(F);
  tok.name = "Bob";
  synthetic.name = "Bob";
  for (const c of game.combats.get(COMBAT).combatants) c.name = "Bob";
  await renameSynthetic("Rob");
  const writes = effects(F.calls);
  assert.deepEqual(writes.map(c => `${c.op}${c.embeddedName ? `:${c.embeddedName}` : ""}`), [
    "updateEmbeddedDocuments:Token", "updateEmbeddedDocuments:Combatant", "notify",
  ], "no prototype write; one token write, one combatant write, one toast");
  assert.deepEqual([writes[0].uuid, writes[0].updates], [`Scene.${IDS.one}`, [{ _id: TOK, name: "Rob" }]]);
  assert.deepEqual([writes[1].uuid, writes[1].updates], [`Combat.${COMBAT}`, [{ _id: "cbtSynth00000001", name: "Rob" }]]);
  assert.equal(writes[2].message, 'Token labels updated to "Rob" (1).', "the count is this token only");
  assert.equal(tok.name, "Rob");
  // the siblings of the base actor, its prototype and the sibling's combatant are untouched
  assert.equal(scene.tokens.get("tokA1000000000001").name, "Bob");
  assert.equal(game.scenes.get(IDS.two).tokens.get("tokA2000000000001").name, "Bob");
  assert.equal(game.actors.get(IDS.bob).prototypeToken.name, "Bob");
  assert.equal(game.combats.get(COMBAT).combatants.get("cbtSibling000001").name, "Bob");
});

test("names-edge-1: a nickname on the renamed synthetic actor's token is left alone, and nothing is written", async () => {
  reset(F);
  tok.name = "Fishface";
  synthetic.name = "Bob";
  for (const c of game.combats.get(COMBAT).combatants) c.name = "Fishface";
  await renameSynthetic("Rob");
  assert.deepEqual(effects(F.calls), []);
  assert.equal(scene.tokens.get("tokA1000000000001").name, "Bob");
});

// [declared] names-edge-3: a refused combatant write after a synthetic rename is logged once and the
// token toast still shows (before, the rejection skipped it).
test("names-edge-3: a synthetic rename whose combatant write is refused still toasts and logs once", async () => {
  reset(F);
  tok.name = "Bob";
  synthetic.name = "Bob";
  const combat = game.combats.get(COMBAT);
  for (const c of combat.combatants) c.name = "Bob";
  const keep = combat.updateEmbeddedDocuments;
  const keepWarn = console.warn;
  const warns = [];
  combat.updateEmbeddedDocuments = async () => { throw new Error("ZZ combatant update refused"); };
  console.warn = (...args) => warns.push(args.map(a => (a instanceof Error ? `${a.name}: ${a.message}` : a)));
  try {
    await renameSynthetic("Rob");
  } finally {
    combat.updateEmbeddedDocuments = keep;
    console.warn = keepWarn;
  }
  assert.deepEqual(warns, [[`pentaryn-names | relabel combatants after rename failed`, { actor: synthetic.uuid, from: "Bob", to: "Rob" }, "Error: ZZ combatant update refused"]]);
  assert.deepEqual(effects(F.calls).filter(c => c.op === "notify").map(c => c.message), ['Token labels updated to "Rob" (1).']);
  assert.equal(tok.name, "Rob");
});
