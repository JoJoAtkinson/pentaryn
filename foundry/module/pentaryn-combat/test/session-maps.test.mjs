// combat-riders-29: session maps whose stale entries are never read are pruned; the turn-flag write
// chain forgets a settled chain but still serialises two quick writes.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, drain, makeActor, setupWorld } from "./fixtures/world.mjs";
import * as core from "../combat-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F } = W;
const shapes = await import("../shapes.mjs");
const seq = await import("../sequence.mjs");
const riders = await import("../turn-riders.mjs");

test("pruneOlder drops entries at least maxAge old; an accessor reads the time", () => {
  const m = new Map([["a", 1000], ["b", 9000]]);
  assert.equal(core.pruneOlder(m, 10000, 4000), 1);
  assert.deepEqual([...m.keys()], ["b"]);
  const n = new Map([["x", { at: 1 }], ["y", { at: 9999 }]]);
  core.pruneOlder(n, 10000, 4000, v => v.at);
  assert.deepEqual([...n.keys()], ["y"]);
});

test("the runner's announced rolls: kept within two minutes, gone after, taggedKind unchanged either way", () => {
  seq.expectRoll("act-1", "reaction");
  assert.equal(seq.pruneSession(Date.now() + 1000), 0);
  assert.equal(seq.taggedKind("act-1"), "reaction");
  mock.timers.tick(120000);
  assert.equal(seq.taggedKind("act-1"), null, "already ignored at two minutes");
  assert.equal(seq.pruneSession(), 1);
  assert.equal(riders.pruneSession(), 0);
});

test("two quick updateTurn calls apply in order; afterwards no chain is left and turnSettled resolves at once", async () => {
  const a = makeActor({ id: "chainActor000001", name: "Chain" });
  const writes = [];
  const update = a.update.bind(a);
  a.update = async (changes) => { await new Promise(r => setImmediate(r)); writes.push(changes); return update(changes); };
  const p1 = shapes.updateTurn(a, t => core.recordSwing(t, { kind: "main", weaponId: "w" }));
  const p2 = shapes.updateTurn(a, t => core.recordSwing(t, { kind: "main", weaponId: "w" }));
  const [t1, t2] = await Promise.all([p1, p2]);
  assert.equal(t1.attackAction.swings, 1);
  assert.equal(t2.attackAction.swings, 2);
  assert.equal(writes.length, 2);
  await drain();
  assert.notEqual(shapes.turnSettled(a), p2, "the settled chain is forgotten (turnSettled no longer hands it back)");
  let settled = false;
  shapes.turnSettled(a).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, true);
  assert.equal(a.flags[MODULE].turn.attackAction.swings, 2);
});

test("M8 (final review): the runner and the riders own their pruning and aborts under their own labels; bars imports none of it", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  const rows = [];
  const fake = { on: (name, fn, o) => rows.push({ name, fn, label: o?.label }), once: () => {}, off: () => {} };
  const runnerRows = () => rows.filter(r => r.owner === "sequence");
  seq.install(fake, null);
  for (const r of rows) r.owner = "sequence";
  riders.install(fake, null);
  for (const r of rows) r.owner ??= "riders";
  assert.deepEqual(runnerRows().map(r => `${r.name} | ${r.label}`), ["updateCombat | sequence: turn moved", "updateToken | sequence: shape change"]);
  const ridersTurn = rows.filter(r => r.owner === "riders" && r.name === "updateCombat");
  assert.deepEqual(ridersTurn.map(r => r.label), ["rider session: turn moved"]);
  // The turn moving prunes the runner's announced rolls through its own listener; other updates leave them.
  seq.expectRoll("act-m8", "reaction");
  mock.timers.tick(120000);
  const seqTurn = runnerRows().find(r => r.name === "updateCombat").fn;
  seqTurn({}, { active: true });
  seqTurn({}, { turn: 1 });
  assert.equal(seq.pruneSession(), 0, "the turn change already pruned it");
  ridersTurn[0].fn({}, { round: 2 });
  // bars no longer reaches into the runner's or the riders' session state.
  assert.deepEqual(sourceScan(new URL("..", import.meta.url), /pruneSession|abortFor/).filter(h => h.file.startsWith("hud/")).map(h => `${h.file}:${h.line}`), []);
  seq.uninstall();
  riders.uninstall();
});
