/**
 * senses-ac-1: the Light reconcile runs in every tab of the active GM user (the MCP bridge tab and a
 * browser tab). Each case plays the other tab's write landing first, then checks this tab ends with
 * one square, one "Gone" whisper and no error from a summon the other tab already deleted.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { squareId } from "../senses-core.mjs";
import {
  boot, standardWorld, makeActor, makeTok, flush, settle, since, ID, MODULE, NOW,
} from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const F = await boot({ world: standardWorld() });
await settle(mock);
const scene = id => game.scenes.get(id);
const lightItem = () => game.actors.get(ID.hero).items.get(ID.light);
const L = () => game.pentaryn.senses.light;
const CAST = `flags.${MODULE}.lightCast`;
const squaresOf = (s, source) => [...s.lights.values()].filter(l => l.flags?.[MODULE]?.spellLight?.source === source);

async function effects(fn) {
  const mark = F.calls.length;
  const value = await fn();
  await flush();
  await settle(mock);
  return { value, calls: since(mark) };
}

test("senses-ac-1: two GM tabs create one Light square, and a hand delete of it ends the light", async () => {
  const s = scene(ID.s1);
  const real = s.createEmbeddedDocuments;
  // The other tab's create of the same square reaches the server first, with the same data.
  s.createEmbeddedDocuments = async function (type, data, options) {
    s.createEmbeddedDocuments = real;
    await real.call(s, type, structuredClone(data), options);
    return real.call(s, type, data, options);
  };
  await effects(() => L().cast(lightItem(), { x: 900, y: 910 }));
  const squares = squaresOf(s, lightItem().uuid);
  assert.equal(squares.length, 1, "one square, not a twin per tab");
  assert.match(squares[0].id, /^[0-9a-f]{16}$/, "a deterministic 16-character id");
  assert.equal(L().recent().at(-1).created, true, "the refused create counts as created");

  await effects(() => s.deleteEmbeddedDocuments("AmbientLight", [squares[0].id]));
  assert.equal(lightItem().flags[MODULE].lightCast, null, "the hand delete ended the light");
  assert.equal(squaresOf(s, lightItem().uuid).length, 0);
});

test("senses-ac-1: squareId is fixed by the Light and its spot, and differs when either changes", () => {
  const a = squareId("Actor.a.Item.b", "scn1", 100.4, 200);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(squareId("Actor.a.Item.b", "scn1", 100, 200), a, "both tabs send the same id");
  assert.notEqual(squareId("Actor.a.Item.b", "scn1", 150, 200), a, "a recast square never reuses the old id");
  assert.notEqual(squareId("Actor.a.Item.c", "scn1", 100, 200), a);
  assert.notEqual(squareId("Actor.a.Item.b", "scn2", 100, 200), a);
});

test("senses-ac-1: the Gone whisper is sent by the tab that wins this cast's claim, never by both", async () => {
  await lightItem().update({ [CAST]: { scene: ID.s1, token: "tokNotHere000002", x: null, y: null, at: 77 } });
  // The other tab already holds this cast's claim.
  await lightItem().update({ [`flags.${MODULE}.claims.gone.77`]: "socket-gm-2" });
  const lost = await effects(() => L().reconcile(lightItem().uuid));
  assert.equal(lightItem().flags[MODULE].lightCast, null, "the flag is still cleared");
  assert.deepEqual(lost.calls.filter(c => c.op === "ChatMessage.create"), [], "no second whisper");

  // A later cast that goes the same way has its own claim, which this tab wins: one whisper.
  await lightItem().update({ [CAST]: { scene: ID.s1, token: "tokNotHere000003", x: null, y: null, at: 78 } });
  const won = await effects(() => L().reconcile(lightItem().uuid));
  assert.equal(won.calls.filter(c => c.op === "ChatMessage.create").length, 1);
  assert.equal(lightItem().flags[MODULE].claims.gone["78"], game.socket.id);
});

test("senses-ac-1: an old Light summon the other tab already deleted counts as removed, not an error", async () => {
  // a floor token the PHB Light summon left (its actor names the Light spell as its origin)
  const phb = makeActor({ id: "actPhbLight00002", name: "Light", type: "npc", flags: { dnd5e: { summon: { origin: lightItem().uuid } } } });
  game.actors.set(phb.id, phb);
  const s = scene(ID.s2);
  const floor = makeTok({ id: "tokPhbFloor00002", name: "Light", actorId: phb.id, actorLink: true });
  floor.parent = s; floor.collection = s.tokens; s.tokens.set(floor.id, floor);
  const real = s.deleteEmbeddedDocuments;
  // The other tab's delete lands first; the server then refuses this tab's.
  s.deleteEmbeddedDocuments = async function (type, ids, options) {
    s.deleteEmbeddedDocuments = real;
    await real.call(s, type, ids, options);
    throw new Error(`The ${type} "${ids[0]}" does not exist in Scene "${s.id}"`);
  };
  const r = await effects(() => L().sweep());
  assert.equal(r.value.removed, 1);
  assert.equal(s.tokens.has(floor.id), false);
});
