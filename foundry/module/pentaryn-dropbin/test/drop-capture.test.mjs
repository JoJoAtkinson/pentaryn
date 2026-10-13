// DB-AC-1 [declared]: Item Piles fires its drop hook on every client (socketlib executeForEveryone), so
// the drop capture runs where isActiveGMSelf(game.users) holds — the same runner rule as the corpses — and
// the entry's scene is the pile token's parent scene, not the recording client's canvas. A player's
// client and a second (non-active) GM record nothing; a two-item drop is two rows, not one per client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeUser } from "./kit/foundry-stub.mjs";
import { GM, PLAYER, addScene, dropbinWorld, makeActor } from "./fixtures/world.mjs";
import * as core from "../dropbin-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 12, 12) });

const GM2 = "gmUser0000000002";                   // a second GM: active, but not game.users.activeGM
const F = await dropbinWorld();
F.game.users.set(GM2, makeUser({ id: GM2, name: "Co-GM", isGM: true }));
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" });
const crypt = addScene(F, { id: "sceneCrypt000001", name: "Crypt" });
const vault = addScene(F, { id: "sceneVault000001", name: "Vault", tokens: [{ id: "tokPile000000001", name: "Pile" }] });
const pile = vault.tokens.get("tokPile000000001");
canvas.scene = crypt;                             // every client is looking at another scene

await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const quiet = async fn => {
  const keep = console.log;
  console.log = () => {};
  try { await fn(); } finally { console.log = keep; }
};
const loot = name => ({ name, type: "loot", system: { quantity: 1 }, toObject() { return { _id: `item${name}`, name, type: "loot", system: { quantity: 1 } }; } });
const mark = () => F.calls.length;

/** Item Piles' callHook: the same drop, delivered to each connected client in turn. */
async function everyClient(target, deltas) {
  for (const userId of [PLAYER, GM2, GM]) {
    F.become({ userId });
    Hooks.callAll("item-piles-dropItem", { actor: ann }, target, deltas, { x: 300, y: 400 });
    await flush();
  }
  F.become({ userId: GM });
}

test("DB-AC-1: a two-item drop seen on three clients is two rows, recorded by the active GM, on the pile's scene", async () => {
  const from = mark();
  await quiet(() => everyClient(pile, [{ item: loot("Rope"), quantity: -1 }, { item: loot("Lamp"), quantity: -1 }]));
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "executeAsGM"), [], "a player's client relays nothing");
  const rows = game.pentaryn.dropbin.all().map(e => [e.n, e.itemName, e.userId, e.sceneId, e.sceneName, e.pileUuid]);
  assert.deepEqual(rows, [
    [1, "Rope", GM, "sceneVault000001", "Vault", pile.uuid],
    [2, "Lamp", GM, "sceneVault000001", "Vault", pile.uuid],
  ]);
});

test("DB-AC-1: a pile given as a token uuid takes that token's scene", async () => {
  await quiet(() => everyClient(pile.uuid, [{ item: loot("Rope"), quantity: -3 }]));
  const last = game.pentaryn.dropbin.list(1)[0];
  assert.deepEqual([last.n, last.quantity, last.sceneId, last.sceneName, last.pileUuid], [3, 3, "sceneVault000001", "Vault", pile.uuid]);
});

test("DB-AC-1 pileScene: a pile token's scene, a synthetic pile actor's token's scene, else null", () => {
  const scene = { documentName: "Scene", id: "s" };
  const token = { documentName: "Token", parent: scene };
  assert.equal(core.pileScene(token), scene);
  assert.equal(core.pileScene({ documentName: "Actor", token }), scene);
  assert.equal(core.pileScene({ documentName: "Actor", token: null }), null, "a world actor is on no one scene");
  assert.equal(core.pileScene({ documentName: "Token", parent: null }), null);
  assert.equal(core.pileScene(null), null);
  assert.equal(core.pileScene("Scene.x.Token.y"), null, "an unresolved uuid");
});
