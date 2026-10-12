// ROB-6 [declared]: the legacy document rows (cardFor, lookAt, teleportParty, open, spreadArrival)
// take the document or its uuid string, the way snapshot already does. A uuid that names nothing
// (or the wrong kind of document) answers null (cardFor) / undefined (the GM actions) with a log
// warning — never junk and never a TypeError.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, console$, P1 } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, W } = await boot();
await W.tick();
const api = () => game.pentaryn.portals;
const ops = n => W.callsSince(n, ["scene.view", "animatePan", "updateEmbedded", "createEmbedded", "deleteEmbedded", "update", "app.render", "pullUsers"]);
const warnedSince = i => console$.slice(i).filter(([level]) => level === "warn").map(([, text]) => text);

test("cardFor / lookAt / open take a region uuid string as well as the document (ROB-6)", async () => {
  const P = places(W, "U1");
  assert.deepEqual(api().cardFor(P.pitGate.uuid), api().cardFor(P.pitGate));
  F.canvas.scene = P.prison;
  let n = F.calls.length;
  await api().lookAt(P.pitGate.uuid);
  assert.deepEqual(ops(n).map(c => c.op), ["scene.view", "animatePan"]);
  n = F.calls.length;
  const app = await api().open(P.passage.uuid);
  assert.equal(app.region, P.passage);
  assert.deepEqual(ops(n).map(c => c.op), ["app.render"]);
});

test("teleportParty takes a region uuid string (ROB-6)", async () => {
  const P = places(W, "U2");
  W.actor({ id: "PCU2", name: "Ana's PC", type: "character", ownership: { default: 0, [P1]: 3 } });
  W.token(P.prison, { id: "tPCU2", name: "Ana's PC", actorId: "PCU2", actorLink: true, x: 300, y: 300 });
  F.canvas.scene = P.prison;
  const out = await api().teleportParty(P.pitGate.uuid, { confirm: false });
  assert.deepEqual(out, { moved: 1, cancelled: false });
  assert.ok(P.pit.tokens.find(t => t.actorId === "PCU2"));
});

test("spreadArrival takes a token uuid string (ROB-6)", async () => {
  const s = W.scene({ id: "ArrU3", name: "Arrival", tokens: [{ id: "arrU3", name: "Caven", x: 600, y: 1000 }, { id: "occU3", name: "Guard", x: 600, y: 1000 }] });
  const arrived = s.tokens.get("arrU3");
  assert.equal(await api().spreadArrival(arrived.uuid), arrived);
  assert.deepEqual([arrived.x, arrived.y], [500, 900]);
});

test("a uuid that names nothing, or the wrong kind of document: null / undefined with a warning, no TypeError (ROB-6)", async () => {
  const P = places(W, "U4");
  F.canvas.scene = P.prison;
  const bad = ["Scene.nope.Region.nope", P.caven.uuid];   // a miss, and a Token where a Region belongs
  for (const u of bad) {
    const i = console$.length;
    const n = F.calls.length;
    assert.equal(api().cardFor(u), null, u);
    assert.equal(await api().lookAt(u), undefined, u);
    assert.equal(await api().teleportParty(u, { confirm: false }), undefined, u);
    assert.equal(await api().open(u), undefined, u);
    assert.deepEqual(ops(n), [], u);
    assert.equal(warnedSince(i).length, 4, u);
    assert.ok(warnedSince(i).every(t => t.includes(u)), u);
  }
  const i = console$.length;
  assert.equal(await api().spreadArrival(P.passage.uuid), undefined);   // a Region where a Token belongs
  assert.equal(await api().spreadArrival("Scene.nope.Token.nope"), undefined);
  assert.equal(warnedSince(i).length, 2);
});
