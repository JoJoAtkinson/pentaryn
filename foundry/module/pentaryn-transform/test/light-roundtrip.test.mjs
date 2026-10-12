// light-roundtrip (play-test TF-2, Joe's ruling 2026-10-12): a token light set by hand on the druid's
// token is lost after a Wild Shape round trip — dnd5e rebuilds the token from the prototype on the
// way back, so the prototype's light returns. The druid token's own light is now snapshotted on the
// shift, in dnd5e's own flags.dnd5e.previousTokenData (the same write as the swap), and dnd5e's revert
// merges previousTokenData over the rebuilt token (linked, unlinked, and restoreTokensElsewhere), so
// the hand-set light comes back. A light pentaryn-senses put there (a torch, Starry Form, the Light
// cantrip) is not the token's own: senses' prior is the one carried back.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS } from "./fixtures/world.mjs";
import { handLight } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const T = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(5000);

const HAND = { dim: 30, bright: 15, color: "#ff9329", alpha: 0.4, luminosity: 0.5, angle: 360,
  animation: { type: "torch", speed: 3, intensity: 4, reverse: false } };
const PROTO = { dim: 0, bright: 0, color: null, alpha: 0.5, luminosity: 0.5, angle: 360,
  animation: { type: null, speed: 5, intensity: 5, reverse: false } };
const STARLIGHT = { dim: 20, bright: 10, color: "#c8d8ff", alpha: 0.5, luminosity: 0.5, angle: 360,
  animation: { type: "starlight", speed: 2, intensity: 3, reverse: false } };

function fresh() {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  F.become({ userId: IDS.gm });
  game.combats.clear();
  return F.W.talo();
}

/**
 * dnd5e's transformInto as far as the token goes: the swap update for each of the host's tokens,
 * carrying the prototype light and a fresh previousTokenData without any light (dnd5e 6.0.6 snapshots
 * size, art, bars, name — never light). preUpdateToken fires on this client before the write.
 */
function swapsTokens(host, tokenDoc, { prevLight } = {}) {
  const real = host.transformInto;
  const seen = [];
  host.transformInto = async (...args) => {
    const changes = {
      actorId: "formActor0000001", light: structuredClone(PROTO),
      flags: { dnd5e: { isPolymorphed: true, previousTokenData: { name: tokenDoc.name, width: 1, texture: { src: "talo.webp" } } } }
    };
    if (prevLight) changes.flags.dnd5e.previousTokenData.light = structuredClone(prevLight);
    Hooks.call("preUpdateToken", tokenDoc, changes, {}, game.user.id);
    seen.push(changes);
    return real(...args);
  };
  return seen;
}

test("light-roundtrip: a linked druid's hand-set token light rides previousTokenData, so the revert brings it back", async () => {
  const { talo } = fresh();
  const tokenDoc = { id: "taloToken0000001", name: "Talo", actorId: talo.id, actor: talo,
    _source: { light: structuredClone(HAND), flags: {} }, light: structuredClone(HAND), flags: {} };
  const seen = swapsTokens(talo, tokenDoc);
  const form = await T.shift(talo, "p1");
  assert.ok(form, "the shift happened");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].flags.dnd5e.previousTokenData.light, HAND, "the token's own light is snapshotted for the revert");
  assert.deepEqual(seen[0].light, PROTO, "the form's token itself is dnd5e's business");
  assert.notEqual(seen[0].flags.dnd5e.previousTokenData.light, tokenDoc._source.light, "a copy, not the live source");
});

test("light-roundtrip: an unlinked token druid's hand-set light is snapshotted the same way", async () => {
  const { talo } = fresh();
  game.actors.delete(talo.id);
  talo.isToken = true;
  const tokenDoc = { id: "npcToken00000001", name: "Talo", actorId: "baseTalo00000001", actor: talo,
    _source: { light: structuredClone(HAND), flags: {} }, flags: {} };
  const scene = F.W.makeScene({ id: "sceneA0000000001" });
  tokenDoc.parent = scene;
  tokenDoc.getFlag = (scope, key) => tokenDoc.flags?.[scope]?.[key];
  scene.tokens.set(tokenDoc.id, tokenDoc);
  talo.token = tokenDoc;
  talo._tokens = [{ id: tokenDoc.id, name: "Talo", stopAnimation: () => {} }];
  const seen = swapsTokens(talo, tokenDoc);
  await T.shift(talo, "p1");
  assert.deepEqual(seen[0].flags.dnd5e.previousTokenData.light, HAND);
});

test("light-roundtrip: a senses light (Starry Form's starlight) is not the token's own — its prior comes back", async () => {
  const { talo } = fresh();
  const lit = { light: structuredClone(STARLIGHT), flags: { "pentaryn-senses": { itemLight: true, itemLightPrior: structuredClone(HAND) } } };
  const tokenDoc = { id: "taloToken0000001", name: "Talo", actorId: talo.id, actor: talo, _source: lit, ...structuredClone(lit) };
  const seen = swapsTokens(talo, tokenDoc);
  await T.shift(talo, "p1");
  assert.deepEqual(seen[0].flags.dnd5e.previousTokenData.light, HAND);
});

test("light-roundtrip: not during a Wild Shape shift (a Polymorph, a plain move), or a snapshot already there → untouched", async () => {
  const { talo } = fresh();
  const tokenDoc = { id: "taloToken0000001", name: "Talo", actorId: talo.id, actor: talo, _source: { light: structuredClone(HAND), flags: {} } };
  const poly = { flags: { dnd5e: { previousTokenData: { name: "Talo" } } } };
  Hooks.call("preUpdateToken", tokenDoc, poly, {}, game.user.id);
  assert.deepEqual(poly, { flags: { dnd5e: { previousTokenData: { name: "Talo" } } } }, "no Wild Shape shift in flight");
  const seen = swapsTokens(talo, tokenDoc, { prevLight: PROTO });
  await T.shift(talo, "p1");
  assert.deepEqual(seen[0].flags.dnd5e.previousTokenData.light, PROTO, "a light already in the snapshot is left alone");
  assert.deepEqual(F.console, []);
});

test("light-roundtrip: handLight — own light; senses item light → prior or unlit; Light cantrip → its prior; nothing → null", () => {
  assert.deepEqual(handLight({ light: HAND, flags: {} }), HAND);
  assert.notEqual(handLight({ light: HAND }), HAND, "a copy");
  assert.deepEqual(handLight({ light: STARLIGHT, flags: { "pentaryn-senses": { itemLight: true, itemLightPrior: HAND } } }), HAND);
  const unlit = handLight({ light: STARLIGHT, flags: { "pentaryn-senses": { itemLight: true } } });
  assert.equal(unlit.bright, 0);
  assert.equal(unlit.dim, 0);
  assert.equal(unlit.animation.type, null);
  assert.deepEqual(handLight({ light: STARLIGHT, flags: { "pentaryn-senses": { spellLight: { source: "Actor.x.Item.y", prior: HAND } } } }), HAND);
  assert.equal(handLight({ light: STARLIGHT, flags: { "pentaryn-senses": { spellLight: { source: "Actor.x.Item.y", prior: null } } } }).bright, 0);
  assert.deepEqual(handLight({ light: HAND, flags: { "pentaryn-senses": { itemLight: false, itemLightPrior: STARLIGHT } } }), HAND, "itemLight false: the token's own");
  assert.equal(handLight({}), null);
  assert.equal(handLight(null), null);
});
