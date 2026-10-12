// Finding aoe-movement-portals-32's additions: refs on every new entry point, destinations(),
// inspect(), link()/unlink() (GM writes: ok/fail, dryRun, the same documents the Portal card
// writes) and badges(). Additive: no old member changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, P1, GM } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
await W.tick();
const api = () => game.pentaryn.portals;

test("destinations(ref): by document, uuid or exact name in a scene; each with its card, revealed and choice", () => {
  const P = places(W, "D");
  const viaDoc = api().destinations(P.fork);
  assert.deepEqual(viaDoc.map(d => [d.uuid, d.name, d.card.title, d.revealed, d.choice, d.behavior]), [
    [P.pitGate.uuid, "Pit gate", "The Fighting Pit", true, true, P.bFork.id],
    [P.cell.uuid, "Cell", "Drow Prison", true, true, P.bFork.id],
  ]);
  assert.deepEqual(viaDoc[0].scene, { documentName: "Scene", id: P.pit.id, uuid: P.pit.uuid, name: P.pit.name });
  assert.deepEqual(api().destinations(P.fork.uuid), viaDoc);
  assert.deepEqual(api().destinations("Fork", { sceneId: P.prison.id }), viaDoc);
  assert.deepEqual(api().destinations(P.cell), []);
});

test("destinations(ref): a miss throws NOT_FOUND; two regions with one name and no scene throw AMBIGUOUS", () => {
  places(W, "D2");
  assert.throws(() => api().destinations("Nowhere at all"), /NOT_FOUND/);
  assert.throws(() => api().destinations("Fork"), /AMBIGUOUS/);
});

test("inspect(ref): the GM sees the card and every destination; a player gets none for a sealed or unrevealed passage", () => {
  const P = places(W, "I");
  const gm = api().inspect(P.passage);
  assert.deepEqual(gm.region, { documentName: "Region", id: P.passage.id, uuid: P.passage.uuid, name: "Passage → Pit" });
  assert.equal(gm.destinations.length, 1);
  assert.equal(gm.card.title, "Drow Prison");
  const player = api().inspect(P.passage, { as: P1 });
  assert.equal(player.region.name, null, "the passage name is GM-only");
  assert.equal(player.destinations.length, 1);
  const secret = api().inspect(P.secret, { as: P1 });
  assert.deepEqual([secret.hidden, secret.revealed, secret.destinations], [true, false, null]);
  assert.equal(api().inspect(P.secret, { as: GM }).destinations.length, 1);
});

test("inspect: an actor or token (the root game.pentaryn.inspect) answers null; a miss throws NOT_FOUND", () => {
  const P = places(W, "I2");
  assert.equal(api().inspect(P.caven), null);
  assert.equal(api().inspect(W.actor({ id: "InspActor", name: "Insp" })), null);
  assert.throws(() => api().inspect("Scene.None.Region.None"), /NOT_FOUND/);
});

test("link(ref, { to }): the Portal card's link — same writes as linkRegions; dryRun writes nothing; twoWay links back", async () => {
  const P = places(W, "L");
  let n = F.calls.length;
  const dry = await api().link(P.passage, { to: P.stair.uuid, dryRun: true });
  assert.deepEqual([dry.ok, dry.dryRun, dry.to.uuid], [true, true, P.stair.uuid]);
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]), []);
  const out = await api().link(P.passage.uuid, { to: P.stair.uuid, twoWay: true });
  assert.deepEqual([out.ok, out.from.uuid, out.to.uuid, out.twoWay], [true, P.passage.uuid, P.stair.uuid, true]);
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]).map(c => [c.op, c.uuid ?? c.parent]), [
    ["update", P.bPassage.uuid],
    ["createEmbedded", P.stair.uuid],
  ]);
  n = F.calls.length;
  assert.equal((await api().link(P.passage, { to: P.stair })).ok, true, "already linked: ok, no write");
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]), []);
});

test("link: refusals come back as fail(), never a throw (await a write either way)", async () => {
  const P = places(W, "L2");
  const codes = async (ref, opts) => { const r = await api().link(ref, opts); return [r.ok, r.code]; };
  assert.deepEqual(await codes("Scene.None.Region.None", { to: P.stair }), [false, "NOT_FOUND"]);
  assert.deepEqual(await codes(P.passage, { to: "Scene.None.Region.None" }), [false, "NOT_FOUND"]);
  assert.deepEqual(await codes(P.passage, {}), [false, "BAD_ARGS"]);
  assert.deepEqual(await codes(P.passage, { to: P.passage }), [false, "BAD_ARGS"]);
  F.become({ userId: P1 });
  const r = await codes(P.passage, { to: P.stair });
  F.become({ userId: GM });
  assert.deepEqual(r, [false, "NOT_GM"]);
});

// [declared] EXT-9 (Joe 2026-10-12): api.link() takes the card's landing-spot rule — a target with any
// behavior other than Teleport Token is refused (dryRun says the same), and the card does not list it.
test("link (EXT-9): a target with non-teleport behaviors is not a landing spot — BAD_ARGS, dryRun too, no write; the card omits it", async () => {
  const P = places(W, "L3");
  const trap = W.region(P.pit, { id: "RegTrapL3", name: "Trap", behaviors: [{ id: "BhvTrapL3", type: "executeScript" }] });
  let n = F.calls.length;
  for (const dryRun of [true, false]) {
    const r = await api().link(P.passage, { to: trap.uuid, dryRun });
    assert.deepEqual([r.ok, r.code, r.reason], [false, "BAD_ARGS", "not a landing spot: Trap has non-teleport behaviors"], `dryRun ${dryRun}`);
  }
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded", "updateEmbedded"]), []);
  const app = await S.PortalCard.open(P.passage, { edit: true });
  const values = [...app.element.querySelectorAll('[data-act="addsel"] option')].map(o => o.value ?? o.getAttribute("value"));
  assert.equal(values.includes(trap.uuid), false, "the card does not offer it");
  assert.equal(values.includes(P.stair.uuid), true, "a plain region is offered");
  await app.close();
});

test("unlink(ref, { to }): drops the entry (relative or absolute), counts the behaviors; dryRun counts only", async () => {
  const P = places(W, "U");
  let n = F.calls.length;
  const dry = await api().unlink(P.fork, { to: P.cell.uuid, dryRun: true });
  assert.deepEqual([dry.ok, dry.dryRun, dry.removed], [true, true, 1]);
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]), []);
  const out = await api().unlink(P.fork, { to: P.cell.uuid });
  assert.deepEqual([out.ok, out.removed], [true, 1]);
  // [declared] C59: one batched write through the region (was one update per behaviour).
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]).map(c => [c.op, c.parent, c.updates]),
    [["updateEmbedded", P.fork.uuid, [{ _id: P.bFork.id, "system.destinations": [P.pitGate.uuid] }]]]);
  assert.deepEqual([...P.bFork.system.destinations], [P.pitGate.uuid]);
  n = F.calls.length;
  assert.equal((await api().unlink(P.passage, { to: P.cell })).removed, 0, "does not lead there: nothing to drop");
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]), []);
});

test("badges(): what is drawn on this client, plain JSON", async () => {
  const P = places(W, "B");
  F.canvas.ready = true;
  F.canvas.scene = P.prison;
  await S.drawBadges();
  const list = api().badges();
  assert.deepEqual(list.map(b => [b.region.name, b.revealed, b.visible, b.cards.map(c => c.title)]), [
    ["Passage → Pit", true, true, ["The Fighting Pit"]],
    ["Fork", true, true, ["The Fighting Pit", "Drow Prison"]],
    ["Secret", true, true, ["Fighting Pit"]],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(list)), list);
  F.canvas.ready = false;
});

test("D-P5: teleportParty answers { moved, cancelled }; a cancelled confirm → { moved: 0, cancelled: true }", async () => {
  const s = W.scene({ id: "DP5", name: "Hall", tokens: [{ id: "dp5t", name: "Mover" }] });
  const to = W.region(s, { id: "DP5To", name: "To", bounds: { x: 500, y: 500, width: 100, height: 100 } });
  F.canvas.scene = s;
  W.confirm = false;
  assert.deepEqual(await api().teleportParty(to), { moved: 0, cancelled: true }, "nobody counts as party: the empty-party warn");
  W.confirm = true;
  assert.deepEqual(await api().teleportParty(to, { confirm: false }), { moved: 0, cancelled: true }, "confirm skipped: still the empty-party warn [declared] (portals-edge-4)");
  F.become({ userId: P1 });
  assert.equal(await api().teleportParty(to, { confirm: false }), undefined, "a player: nothing, as before");
  F.become({ userId: GM });
});

test("[declared] C59: unlink from a region with two behaviours leading there is one write for both", async () => {
  const P = places(W, "U59");
  const second = W.behavior(P.fork, { id: "BhvForkU59b", destinations: [P.cell.uuid, P.stair.uuid] });
  const n = F.calls.length;
  const out = await api().unlink(P.fork, { to: P.cell.uuid });
  assert.deepEqual([out.ok, out.removed], [true, 2]);
  const writes = W.callsSince(n, ["update", "updateEmbedded"]);
  assert.deepEqual(writes.map(c => [c.op, c.parent, c.updates.map(u => u._id)]), [["updateEmbedded", P.fork.uuid, [P.bFork.id, second.id]]]);
  assert.deepEqual([...second.system.destinations], [P.stair.uuid]);
  assert.deepEqual(W.callsSince(n, ["Hooks.callAll"]).map(x => x.name), ["updateRegionBehavior", "updateRegionBehavior"], "hooks still fire per behaviour");
});
