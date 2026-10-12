// Standalone audit findings landed after the structural refactor (guide §4), each with the test
// its finding asks for. The S1 pins they must keep are in the frozen files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ctx = fireball(W, F);

/* ── -2: the handle actor is looked up once per resolve, not once per token ─────────────────── */

test("-2 describeToken(token, { handleActorId }) equals the default and scans nothing", () => {
  const handleActor = game.actors.find(a => a.flags?.[MODULE]?.handleActor);
  const toks = [IDS.g1, IDS.cv, IDS.handle, IDS.pile].map(id => ctx.s.tokens.get(id));
  const find = game.actors.find.bind(game.actors);
  let n = 0;
  game.actors.find = fn => { n++; return find(fn); };
  const given = toks.map(t => R.describeToken(t, { handleActorId: handleActor.id }));
  assert.equal(n, 0);
  const none = toks.map(t => R.describeToken(t, { handleActorId: null }));
  assert.equal(n, 0);
  game.actors.find = find;
  assert.deepEqual(given, toks.map(t => R.describeToken(t)));
  assert.deepEqual(none.map(d => d.isHandleActor), [false, false, true, false], "no handle actor: only the flagged actor counts");
});

test("-2 resolve() scans game.actors for the handle actor once for the whole area", async () => {
  const msg = damage(W, ctx, { id: "dmgFinding000002" });
  const find = game.actors.find.bind(game.actors);
  let n = 0;
  game.actors.find = fn => { n++; return find(fn); };
  await R.resolve(msg.id);
  game.actors.find = find;
  assert.equal(n, 1);
  assert.equal(msg.flags[MODULE].resolution.rows.length, 6);
});

/* ── -6: mutate keeps its order and drops each settled tail ─────────────────────────────────── */

test("-6 a write queued behind another keeps the entry until the last settles; then pendingWrites() is 0", async () => {
  const m = W.message({ id: "mutateFind000001", flags: { [MODULE]: { resolution: { rows: [], n: 0 } } } });
  const a = R.mutate(m.id, r => { r.n++; return r; });
  const b = R.mutate(m.id, async r => { await null; r.n *= 10; return r; });
  assert.equal(R.queues.get(m.id), b);
  await a;
  assert.equal(R.queues.has(m.id), true, "a settled while b is queued: the entry stays");
  assert.equal((await b).n, 10);
  await flush();
  assert.equal(R.queues.has(m.id), false);
  assert.equal(R.pendingWrites(), 0);
  assert.equal((await R.mutate(m.id, r => { r.n++; return r; })).n, 11);
});

/* ── -7 (D-A6): one handle actor, whichever GM session creates it ───────────────────────────── */

test("-7 the id is 16 alphanumerics; losing the create race returns the winner's actor; another error is thrown", async () => {
  const A = S.areas;
  const winner = A.handleActor();
  assert.equal(winner.id, "pentarynAoeHndl0");
  assert.match(winner.id, /^[A-Za-z0-9]{16}$/);
  F.game.actors.delete(winner.id);
  const create = Actor.implementation.create;
  Actor.implementation.create = async () => {   // the other session's actor lands first
    F.game.actors.set(winner.id, winner);
    throw new Error(`The Actor ${winner.id} already exists in the world collection`);
  };
  assert.equal(await A.ensureHandleActor(), winner);
  F.game.actors.delete(winner.id);
  Actor.implementation.create = async () => { throw new Error("server down"); };
  await assert.rejects(A.ensureHandleActor(), /server down/);
  Actor.implementation.create = create;
  F.game.actors.set(winner.id, winner);
});

/* ── -8: the resolve pipeline's silent stops leave a trace (debug only) ──────────────────────── */

test("-8 with CONFIG.debug off: the same nulls, no trace, no console line", async () => {
  F.calls.length = 0;
  out.length = 0;
  F.become({ userId: "plUser0000000001" });
  assert.equal(await R.resolve("x"), null);
  assert.equal(await R.applyRows("x"), null);
  F.become({ userId: "gmUser0000000001" });
  assert.deepEqual(game.pentaryn.aoe.trace(), []);
  assert.deepEqual(out, []);
});

test("-8 with CONFIG.debug on: resolve, apply and careful stops are traced (the return values unchanged)", async () => {
  F.CONFIG.debug = { [MODULE]: true };
  out.length = 0;
  F.become({ userId: "plUser0000000001" });
  assert.equal(await R.resolve("x"), null);
  assert.equal(await R.applyRows("x"), null);
  F.become({ userId: "gmUser0000000001" });
  assert.equal(await R.resolve("missingMessage01"), null);
  assert.equal(await R.applyRows("missingMessage01"), null);
  assert.equal(await R.carefulFor(ctx.wizard, [], { casterActorId: ctx.wizard.id, usage: IDS.usage, scene: ctx.s, onSave: "half", rows: [] }), null);
  const traces = game.pentaryn.aoe.trace().map(t => [t.op, t.data.id, t.data.outcome]);
  assert.deepEqual(traces, [
    ["resolve", "x", "not the active GM"],
    ["apply", "x", "not a GM"],
    ["resolve", "missingMessage01", "not a damage message"],
    ["apply", "missingMessage01", "no resolution"],
    ["careful", IDS.usage, "no flag"],
  ]);
  assert.ok(out.every(o => o.level === "debug" && o.text.startsWith(`${MODULE} | `)));
  assert.equal(out.length, 5);
  F.CONFIG.debug = {};
});
