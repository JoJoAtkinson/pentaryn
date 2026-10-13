// dropbin-R9 [declared]: the 'Locked' float went on the first token whose actor had the locked
// chest's id, so with two unlinked chests of one base actor it could land on the other chest. It now
// goes on the hook's own token, else a synthetic actor's token, else the first placeable holding the
// same actor object (identity); no match is no float, the toast still shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../dropbin-core.mjs";
import { PLAYER, GM, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

const F = await dropbinWorld();
const base = makeActor(F, { id: "actorChest000001", name: "Hidden Cache", type: "npc", flags: ip({ enabled: true, type: "container", locked: true }) });

// Two unlinked chests of the one base actor: same id, distinct synthetic actor objects.
function unlinked(tokId, x) {
  const tokenDoc = { documentName: "Token", id: tokId };
  const synth = { id: base.id, name: base.name, flags: base.flags, isToken: true, token: tokenDoc };
  const placeable = { id: tokId, actor: synth, document: tokenDoc, center: { x, y: x } };
  tokenDoc.actor = synth;
  tokenDoc.object = placeable;
  return { tokenDoc, synth, placeable };
}
const A = unlinked("tokChestA0000001", 100);
const B = unlinked("tokChestB0000001", 500);
const linkedTok = { id: "tokLinked0000001", actor: base, center: { x: 900, y: 900 } };

test("lockFloatToken: the hook's token, a synthetic actor's token, the same actor object, else none (dropbin-R9)", () => {
  const placeables = [A.placeable, B.placeable, linkedTok];
  assert.equal(typeof core.lockFloatToken, "function");
  assert.equal(core.lockFloatToken(B.tokenDoc, B.synth, placeables), B.placeable, "a TokenDocument target: its own placeable");
  assert.equal(core.lockFloatToken(B.synth, B.synth, placeables), B.placeable, "a synthetic actor: its own token");
  assert.equal(core.lockFloatToken(base, base, placeables), linkedTok, "a world actor: the placeable holding that very object");
  assert.equal(core.lockFloatToken(base, base, [A.placeable, B.placeable]), null, "a base actor with only unlinked chests: no float");
  assert.equal(core.lockFloatToken({ documentName: "Token", actor: B.synth, object: null }, B.synth, placeables), null, "a token not drawn: no float");
  assert.equal(core.lockFloatToken(null, null, placeables), null);
});

await import("../dropbin.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 50; i++) await Promise.resolve();

test("the 'Locked' float lands on the chest the player tried, not another unlinked chest of the same base actor (dropbin-R9)", () => {
  const floats = [];
  const keep = canvas.interface.createScrollingText;
  canvas.interface.createScrollingText = (at, text) => floats.push({ at, text });
  canvas.tokens.placeables = [A.placeable, B.placeable];
  F.become({ userId: PLAYER });
  try {
    assert.equal(Hooks.call("item-piles-preRenderInterface", B.tokenDoc), false, "still refused");
    Hooks.call("item-piles-preRattleItemPile", B.tokenDoc);
    assert.equal(Hooks.call("item-piles-preRenderActorSheet", B.synth), false);
    Hooks.call("item-piles-preRattleItemPile", base);
  } finally {
    F.become({ userId: GM });
    canvas.interface.createScrollingText = keep;
    canvas.tokens.placeables = [];
  }
  assert.deepEqual(floats, [
    { at: { x: 500, y: 500 }, text: "Locked" },
    { at: { x: 500, y: 500 }, text: "Locked" },
    { at: { x: 500, y: 500 }, text: "Locked" },
  ], "three floats on chest B; the base actor matches no placeable, so the last rattle is toast-only");
});
