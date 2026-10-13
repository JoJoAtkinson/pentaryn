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

// DB-AC-1 live (FIX-3) [declared]: Item Piles 3.3.4 `_dropItems` onto empty ground hands the hook the new
// pile as `_createItemPile`'s return value, `{tokenUuid, actorUuid}` — an object, which its callHook
// does not resolve (it resolves only uuid strings). The row still takes the pile token's scene and uuid.
test("DB-AC-1 live: a new pile given as Item Piles' {tokenUuid, actorUuid} takes that token's scene and uuid", async () => {
  await quiet(() => everyClient({ tokenUuid: pile.uuid, actorUuid: "Actor.defaultPile00001" }, [{ item: loot("Rope"), quantity: -2 }]));
  const last = game.pentaryn.dropbin.list(1)[0];
  assert.deepEqual([last.quantity, last.sceneId, last.sceneName, last.pileUuid], [2, "sceneVault000001", "Vault", pile.uuid]);
});

test("DB-AC-1 live: a pile that is only {actorUuid} (a linked pile actor) records that uuid and no scene", async () => {
  await quiet(() => everyClient({ actorUuid: "Actor.defaultPile00001" }, [{ item: loot("Lamp"), quantity: -1 }]));
  const last = game.pentaryn.dropbin.list(1)[0];
  assert.deepEqual([last.itemName, last.sceneId, last.sceneName, last.pileUuid], ["Lamp", null, null, "Actor.defaultPile00001"]);
});

test("DB-AC-1 live: a vetoed pile (target false) records no scene and no pile", async () => {
  await quiet(() => everyClient(false, [{ item: loot("Torch"), quantity: -1 }]));
  const last = game.pentaryn.dropbin.list(1)[0];
  assert.deepEqual([last.itemName, last.sceneId, last.pileUuid], ["Torch", null, null]);
});

test("DB-AC-1 resolvePile: a uuid string, Item Piles' {tokenUuid, actorUuid}, a document, else nothing", () => {
  const scene = { documentName: "Scene", id: "s" };
  const token = { documentName: "Token", parent: scene, uuid: "Scene.s.Token.t" };
  const docs = { "Scene.s.Token.t": token };
  const from = u => docs[u] ?? null;
  assert.deepEqual(core.resolvePile("Scene.s.Token.t", from), { doc: token, uuid: "Scene.s.Token.t" });
  assert.deepEqual(core.resolvePile({ tokenUuid: "Scene.s.Token.t", actorUuid: "Actor.a" }, from), { doc: token, uuid: "Scene.s.Token.t" });
  assert.deepEqual(core.resolvePile({ actorUuid: "Actor.a" }, from), { doc: null, uuid: "Actor.a" });
  assert.deepEqual(core.resolvePile(token, from), { doc: token, uuid: "Scene.s.Token.t" });
  assert.deepEqual(core.resolvePile(false, from), { doc: null, uuid: null });
  assert.deepEqual(core.resolvePile("Scene.x.Token.gone", () => { throw new Error("bad"); }), { doc: null, uuid: "Scene.x.Token.gone" });
});
