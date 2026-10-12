// items-journal-28 (additive): list(n, {brief}), restoreResult (no toasts, coded reasons), inspect(ref),
// selftest. The legacy list/restore shapes stay pinned by glue.test.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { maxDepth } from "./kit/harness.mjs";
import { GM, PLAYER, addScene, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann" },
  { items: [{ id: "itemSword0000001", name: "Sword", type: "weapon", system: { quantity: 1, description: { value: "long text" } } }] });
const gob = makeActor(F, { id: "actorGob00000001", name: "Goblin", type: "npc", system: { attributes: { hp: { value: 0, max: 7 } } } });
Object.assign(gob, { statuses: new Set() });
const scene = addScene(F, { id: "sceneOne00000001", name: "Crypt", tokens: [
  { id: "tokGob0000000001", name: "Goblin", actorId: gob.id, sight: { enabled: false },
    flags: { [MOD]: { corpse: true, sight: true, ownership: null }, ...ip({ enabled: true, type: "pile" }) } },
  { id: "tokGob0000000002", name: "Goblin Archer", actorId: gob.id, sight: { enabled: true }, flags: {} },
] });
canvas.scene = scene;

await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
await flush();
const api = game.pentaryn.dropbin;
const quiet = async fn => {
  const keep = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = keep; }
};
await quiet(async () => {
  Hooks.callAll("item-piles-dropItem", { actor: ann }, scene.tokens.get("tokGob0000000001"), [{ item: ann.items.get("itemSword0000001"), quantity: -1 }], { x: 1, y: 2 });
  await flush();
});

test("list(n, {brief: true}): the nine keys in order, no item source; list(n) unchanged", () => {
  const [b] = api.list(1, { brief: true });
  assert.deepEqual(Object.keys(b), ["n", "iso", "reason", "itemName", "itemType", "quantity", "fromActorName", "sceneName", "pileUuid"]);
  assert.deepEqual([b.n, b.reason, b.itemName, b.quantity, b.fromActorName, b.sceneName], [1, "drop", "Sword", 1, "Ann", "Crypt"]);
  assert.equal(api.list(1)[0].item.system.description.value, "long text");
  assert.deepEqual(api.list(1, {}), api.list(1));
});

test("restoreResult: coded refusals, no toasts; success returns the item and actor", async () => {
  const from = F.calls.length;
  F.become({ userId: PLAYER });
  assert.deepEqual(await api.restoreResult(1), { ok: false, reason: "not-gm" });
  F.become({ userId: GM });
  assert.deepEqual(await api.restoreResult(99), { ok: false, reason: "no-entry" });
  F.game.actors.delete(ann.id);
  assert.deepEqual(await api.restoreResult(1), { ok: false, reason: "no-actor" });
  F.game.actors.set(ann.id, ann);
  const ok = await api.restoreResult(1);
  assert.equal(ok.ok, true);
  assert.equal(ok.item.name, "Sword");
  assert.equal(ok.actor, ann);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify"), [], "no toasts");
});

test("restore()'s no-actor refusal still toasts and returns that Notification", async () => {
  F.game.actors.delete(ann.id);
  const r = await api.restore(1);
  F.game.actors.set(ann.id, ann);
  assert.equal(r.message, "Drop bin: cannot find an actor to restore #1 onto.");
});

test("inspect(token): our corpse, its saved sight and ownership, Item Piles data; depth ≤ 4", () => {
  const out = api.inspect("tokGob0000000001");
  assert.deepEqual(out, {
    token: { documentName: "Token", id: "tokGob0000000001", uuid: out.token.uuid, name: "Goblin" },
    actor: { documentName: "Actor", id: gob.id, uuid: gob.uuid, name: "Goblin" },
    dead: true, corpse: true, noLoot: false, pile: { enabled: true, type: "pile" },
    saved: { sight: true, ownership: null },
  });
  assert.ok(maxDepth(out) <= 4);
  assert.equal(api.inspect("Goblin Archer").corpse, false);
});

test("inspect(actor): its corpse tokens across scenes; a miss throws NOT_FOUND", () => {
  const out = api.inspect(gob);
  assert.deepEqual([out.actor.id, out.dead, out.noLoot, out.corpses.map(c => c.token.id)], [gob.id, true, false, ["tokGob0000000001"]]);
  assert.throws(() => api.inspect("Nobody At All"), /NOT_FOUND/);
});

test("selftest passes on a healthy load", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
});

test("inspect(uuid): an Actor UUID gives the actor shape, a Token UUID the token shape; another type is BAD_ARGS", () => {
  const out = api.inspect(gob.uuid);
  assert.deepEqual([out.actor.id, out.dead, out.noLoot, out.corpses.map(c => c.token.id)], [gob.id, true, false, ["tokGob0000000001"]]);
  assert.deepEqual(api.inspect(gob.uuid), api.inspect(gob));
  const tok = scene.tokens.get("tokGob0000000001");
  assert.deepEqual(api.inspect(tok.uuid), api.inspect("tokGob0000000001"));
  assert.throws(() => api.inspect(scene.uuid), /BAD_ARGS/);
});

test("restoreResult: a vetoed create ([] from createEmbeddedDocuments) is not-created; restore() toasts an error", async () => {
  const keep = Object.getOwnPropertyDescriptor(ann, "createEmbeddedDocuments");
  ann.createEmbeddedDocuments = async () => [];
  try {
    assert.deepEqual(await api.restoreResult(1), { ok: false, reason: "not-created" });
    const from = F.calls.length;
    const r = await api.restore(1);
    assert.equal(r.message, "Drop bin: #1 was not restored; the item was not created (another module may have refused it).");
    assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify").map(c => c.level), ["error"]);
  } finally {
    if (keep) Object.defineProperty(ann, "createEmbeddedDocuments", keep);
    else delete ann.createEmbeddedDocuments;
  }
});

test("dropbin-R3: an explicit target that does not resolve is no-actor; a TokenDocument or a UUID resolves to its actor", async () => {
  const tok = scene.tokens.get("tokGob0000000001");
  for (const bad of ["nobody", "Actor.nope000000000001", "Scene.sceneOne00000001.Token.nope000000000001", scene.uuid, 7, {}]) {
    assert.deepEqual(await api.restoreResult(1, bad), { ok: false, reason: "no-actor" }, String(bad));
  }
  const from = F.calls.length;
  const r = await api.restore(1, "nobody");
  assert.equal(r.message, "Drop bin: cannot find an actor to restore #1 onto.");
  assert.equal(F.calls.slice(from).filter(c => c.op === "createEmbeddedDocuments").length, 0, "nothing created");
  for (const target of [tok, gob.uuid, tok.uuid, gob, gob.id, "Goblin"]) {
    const ok = await api.restoreResult(1, target);
    assert.equal(ok.ok, true, String(target?.uuid ?? target));
    assert.equal(ok.actor, gob, String(target?.uuid ?? target));
  }
  for (const none of [null, undefined]) assert.equal((await api.restoreResult(1, none)).actor, ann);
});

test("dropbin-R5: a throwing create or an entry with no item source is not-created (one prefixed warning), never a rejection", async () => {
  const warns = [];
  const keepWarn = console.warn;
  console.warn = (...a) => warns.push(a);
  const keep = Object.getOwnPropertyDescriptor(ann, "createEmbeddedDocuments");
  ann.createEmbeddedDocuments = async () => { throw new Error("server refused"); };
  try {
    assert.deepEqual(await api.restoreResult(1), { ok: false, reason: "not-created" });
    assert.equal(warns.length, 1, JSON.stringify(warns));
    assert.match(String(warns[0][0]), /^pentaryn-dropbin \| /);
    const r = await api.restore(1);
    assert.equal(r.message, "Drop bin: #1 was not restored; the item was not created (another module may have refused it).");
  } finally {
    console.warn = keepWarn;
    if (keep) Object.defineProperty(ann, "createEmbeddedDocuments", keep);
    else delete ann.createEmbeddedDocuments;
  }

  const entry = api.get(1);
  const item = entry.item;
  entry.item = null;
  const from = F.calls.length;
  try {
    assert.deepEqual(await api.restoreResult(1), { ok: false, reason: "not-created" });
    assert.equal(F.calls.slice(from).filter(c => c.op === "createEmbeddedDocuments").length, 0, "nothing created");
    const r = await api.restore(1);
    assert.equal(r.message, "Drop bin: #1 was not restored; the item was not created (another module may have refused it).");
  } finally {
    entry.item = item;
  }
  assert.equal((await api.restoreResult(1)).ok, true);
});
