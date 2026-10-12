// Standalone audit findings landed after the structural refactor (guide §4), each with the test
// its finding asks for. The S1 pins they must keep are in the frozen files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";

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

/* ── -9: swallowed and unattributed errors are logged with the module prefix ─────────────────── */

const lines = () => out.map(o => `${o.level}: ${o.text}`);

test("-9 the GM's delayed handle delete: 'does not exist' stays quiet, another error warns", async () => {
  const s = W.scene({ id: "FindingScene0009" });
  const tmpl = id => W.region(s, { id, flags: { dnd5e: { activity: "Item.x.Activity.y" } }, ownership: { default: 3 } });
  const r = tmpl("regionFind900001");
  W.token(s, { id: "regionFind900001", flags: { [MODULE]: { handle: true, region: r.id } } });
  Object.defineProperty(s, "deleteEmbeddedDocuments", { value: async () => { throw new Error("server down"); }, configurable: true });
  out.length = 0;
  F.fire("deleteRegion", r, {}, "plUser0000000001");
  await advance(1600);
  assert.deepEqual(lines(), [`warn: ${MODULE} | backstop handle delete`]);
});

test("-9 a rejected Apply from the tray is logged 'pentaryn-aoe | tray click'", async () => {
  const msg = damage(W, ctx, { id: "dmgFinding000009" });
  await R.resolve(msg.id);
  const host = root(`<div class="message-content"><damage-application></damage-application></div>`);
  F.fire("dnd5e.renderChatMessage", game.messages.get(msg.id), host);
  const apply = Object.getOwnPropertyDescriptor(ctx.g2, "applyDamage");
  Object.defineProperty(ctx.g2, "applyDamage", { value: async () => { throw new Error("hp locked"); }, configurable: true, writable: true });
  out.length = 0;
  const ev = dispatch(host.querySelector('[data-pa="apply"]'), "click");
  await Promise.allSettled(ev.results);
  await flush();
  Object.defineProperty(ctx.g2, "applyDamage", apply);
  assert.deepEqual(lines(), [`error: ${MODULE} | tray click`]);
});

test("-9 a rejected Remove all templates is logged 'pentaryn-aoe | remove all templates'", async () => {
  const s = W.scene({ id: "FindingScene0010" });
  F.canvas.scene = s;
  const ITEM = ctx.item.uuid;
  W.region(s, { id: "regionFind900002", flags: { dnd5e: { activity: ctx.activity.uuid, item: ITEM } }, ownership: { default: 3 } });
  Object.defineProperty(s, "deleteEmbeddedDocuments", { value: async () => { throw new Error("locked"); }, configurable: true });
  const usage = W.message({ type: "usage", system: { activity: { uuid: ctx.activity.uuid }, item: { uuid: ITEM } }, activity: { target: { template: { type: "sphere" } }, item: ctx.item } });
  const host = root(`<div class="chat-card"><section class="icon-row"><ul class="unlist"><li><button data-action="placeTemplate">P</button></li></ul></section></div>`);
  F.fire("dnd5e.renderChatMessage", usage, host);
  out.length = 0;
  const btn = host.querySelector("[data-pentaryn-aoe-action]");
  const ev = dispatch(btn, "click");
  await Promise.allSettled(ev.results);
  await flush();
  assert.deepEqual(lines(), [`error: ${MODULE} | remove all templates`]);
  assert.equal(btn.disabled, false);
  F.canvas.scene = ctx.s;
});

test("-9 a failed Careful Spell usage bind warns 'pentaryn-aoe | careful bind usage'; the protection still applies", async () => {
  await ctx.wizard.update({ [`flags.${MODULE}.careful`]: { at: Date.now(), key: null, usage: null } });
  const update = Object.getOwnPropertyDescriptor(ctx.wizard, "update");
  Object.defineProperty(ctx.wizard, "update", { value: async () => { throw new Error("no write"); }, configurable: true, writable: true });
  out.length = 0;
  const out1 = await R.carefulFor(ctx.wizard, [], { casterActorId: ctx.wizard.id, usage: IDS.usage, scene: ctx.s, onSave: "half", rows: [] });
  if (update) Object.defineProperty(ctx.wizard, "update", update); else delete ctx.wizard.update;
  assert.deepEqual(out1, { names: [], max: 3 });
  assert.deepEqual(lines(), [`warn: ${MODULE} | careful bind usage`]);
});

/* ── 8.5 performance: the sweep shares template regions in one batched write ──────────────── */

test("8.5 sweep: every unshared template region in ONE Region update (was one write per region)", async () => {
  const s = W.scene({ id: "FindingScene0085" });
  for (const id of ["regionBatch00001", "regionBatch00002", "regionBatch00003"]) {
    W.region(s, { id, flags: { dnd5e: { activity: "Item.x.Activity.y" } }, ownership: { default: 0 }, shapes: [{}, {}] });
  }
  W.region(s, { id: "regionBatchPort1", ownership: { default: 0 } });
  F.calls.length = 0;
  const outcome = await S.areas.sweep(s);
  assert.equal(outcome.ownershipFixed, 3);
  const writes = F.calls.filter(c => c.documentName === "Region" && ["update", "updateEmbedded"].includes(c.op));
  assert.deepEqual(writes.map(c => [c.op, c.updates?.map(u => u._id)]), [["updateEmbedded", ["regionBatch00001", "regionBatch00002", "regionBatch00003"]]]);
  assert.equal(s.regions.get("regionBatchPort1").ownership.default, 0, "a portal region is never touched");
});
