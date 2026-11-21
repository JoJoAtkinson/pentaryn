// F0 (feedback GDJJdi, plan feedback-triage-2026-11-19 §H2): Empowered Spell rerolls damage dice only
// (PHB 2024), so the save stands. pentaryn-riders posts the empowered card with
// flags.pentaryn-riders.empowered.from = the old card; the GM's resolve carries the old tray's saves,
// area, Careful Spell and request card over (core.carryResolution) instead of rolling new saves and
// posting a second request. The GM tray's Apply passes `origin: message`, so riders' dnd5e.applyDamage
// listener can retire the Empower button.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE, PLAYER_ID } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";
import { carryResolution } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ctx = fireball(W, F, { saves: { g1: [18, 3, 3], g2: [4, 19, 19] } });
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const saveCreates = () => game.messages.contents.filter(m => m.type === "save");
const requests = () => game.messages.contents.filter(m => m.type === "request");
const empowered = (from, extra = {}) => ({ "pentaryn-riders": { empowered: { from, cost: 1, changes: [], ...extra } } });

/* ── the pure rule ───────────────────────────────────────────────────── */

test("carryResolution: the old rows' saves, multipliers, ticks and GM edits; the area, Careful Spell and request; new rows stay as built", () => {
  const oldRes = {
    region: "reg1", request: "req1", careful: { ids: ["a"], names: ["A"] }, superseded: false,
    rows: [
      { id: "a", save: { total: null, success: true, messageId: null, careful: true }, multiplier: 0, apply: true, protected: true, unprotected: { save: { total: 4, success: false, messageId: "s0" }, multiplier: 1 } },
      { id: "b", save: { total: 18, success: true, messageId: "s1" }, multiplier: 1, overridden: true, apply: false },
      { id: "c", save: null, multiplier: null, apply: true },
    ],
  };
  const newRows = [
    { id: "a", save: null, multiplier: null, apply: true, kind: "auto" },
    { id: "b", save: null, multiplier: null, apply: true, kind: "auto" },
    { id: "c", save: null, multiplier: null, apply: true, kind: "manual" },
    { id: "d", save: null, multiplier: null, apply: true, kind: "auto" },
  ];
  const frozen = JSON.stringify({ oldRes, newRows });
  const out = carryResolution(oldRes, newRows);
  assert.equal(JSON.stringify({ oldRes, newRows }), frozen, "inputs are not mutated");
  assert.deepEqual([out.region, out.request, out.careful], ["reg1", "req1", { ids: ["a"], names: ["A"] }]);
  assert.deepEqual(out.rows.map(r => [r.id, r.save?.total ?? null, r.multiplier, r.apply, !!r.protected, !!r.overridden]), [
    ["a", null, 0, true, true, false], ["b", 18, 1, false, false, true], ["c", null, null, true, false, false], ["d", null, null, true, false, false],
  ]);
  assert.deepEqual(out.rows[0].unprotected, { save: { total: 4, success: false, messageId: "s0" }, multiplier: 1 });
  assert.equal(out.rows[3].kind, "auto", "a row the old tray did not have is kept as built");
});

test("carryResolution refuses an areaLocked tray (superseded, or a row applied) and no tray", () => {
  const rows = [{ id: "a", save: null, multiplier: null, apply: true }];
  assert.equal(carryResolution(null, rows), null);
  assert.equal(carryResolution({ superseded: true, rows: [] }, rows), null);
  assert.equal(carryResolution({ superseded: false, rows: [{ id: "a", applied: true }] }, rows), null);
});

/* ── the GM's resolve ────────────────────────────────────────────────── */

test("an empowered card keeps the original saves: no new save message, no second request card, the new damage", async () => {
  const first = damage(W, ctx, { id: "dmgEmpOrig000001", total: 28, hook: true });
  await advance(800);
  await flush(8);
  const old = resOf(first.id);
  assert.equal(old.rows.find(r => r.id === IDS.g1).save.total, 18);
  assert.equal(old.rows.find(r => r.id === IDS.g2).save.total, 4);
  assert.ok(old.request, "Caven was asked once");
  const saves = saveCreates().length;
  const reqs = requests().length;

  const next = damage(W, ctx, { id: "dmgEmpNew0000001", total: 34, hook: true, targets: first.system.targets, flags: empowered(first.id) });
  await advance(800);
  await flush(8);
  const res = resOf(next.id);
  assert.ok(res, "the empowered card got a tray");
  assert.equal(saveCreates().length, saves, "zero new save messages");
  assert.equal(requests().length, reqs, "no second request card");
  assert.equal(res.request, old.request, "the pending request is the new card's too");
  assert.equal(res.region, old.region);
  assert.deepEqual(res.rows.map(r => [r.id, r.save?.total ?? null, r.multiplier]), old.rows.map(r => [r.id, r.save?.total ?? null, r.multiplier]));
  assert.equal(res.damages[0].value, 34, "the new card keeps its own damages");
  assert.equal(resOf(first.id).superseded, true, "the replaced tray greys out");
});

test("a player's save still pending on the request card lands on the empowered card", async () => {
  const first = damage(W, ctx, { id: "dmgEmpOrig000002", total: 20, hook: true });
  await advance(800);
  await flush(8);
  const reqId = resOf(first.id).request;
  const next = damage(W, ctx, { id: "dmgEmpNew0000002", total: 25, hook: true, flags: empowered(first.id) });
  await advance(800);
  await flush(8);
  assert.equal(resOf(next.id).rows.find(r => r.id === IDS.cv).save, null, "still waiting");
  const save = W.message({
    type: "save", author: PLAYER_ID, rolls: [{ total: 5, isSuccess: false }], system: { ability: "dex", type: "ability" },
    flags: { dnd5e: { requestResult: { actorUuid: ctx.caven.uuid, requestId: reqId } } },
    speaker: { scene: ctx.s.id, token: IDS.cv, actor: IDS.caven }, timestamp: Date.now(),
  });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  assert.deepEqual(resOf(next.id).rows.find(r => r.id === IDS.cv).save, { total: 5, success: false, messageId: save.id });
});

test("Apply on the empowered card uses the carried outcomes and passes the card as origin", async () => {
  const first = damage(W, ctx, { id: "dmgEmpOrig000003", total: 10, hook: true });
  await advance(800);
  await flush(8);
  const next = damage(W, ctx, { id: "dmgEmpNew0000003", total: 12, hook: true, flags: empowered(first.id) });
  await advance(800);
  await flush(8);
  const g1 = resOf(next.id).rows.find(r => r.id === IDS.g1);
  const seen = [];
  const actor = fromUuidSync(g1.actor);
  const orig = actor.applyDamage;
  actor.applyDamage = async function (damages, opts) { seen.push({ origin: opts?.origin?.id ?? null, originating: opts?.originatingMessage?.id ?? null, multiplier: opts?.multiplier }); return orig.call(this, damages, opts); };
  try {
    await R.applyRows(next.id, [IDS.g1]);
  } finally { actor.applyDamage = orig; }
  assert.deepEqual(seen, [{ origin: next.id, originating: next.id, multiplier: g1.multiplier }]);
  assert.equal(g1.multiplier, resOf(first.id).rows.find(r => r.id === IDS.g1).multiplier, "the old save's multiplier");
});

test("the replaced tray already applied (or another activity's card): resolved afresh, as before", async () => {
  const first = damage(W, ctx, { id: "dmgEmpOrig000004", total: 10, hook: true });
  await advance(800);
  await flush(8);
  await R.applyRows(first.id, [IDS.g2]);   // Goblin 1 is down from the test above
  assert.equal(resOf(first.id).rows.find(r => r.id === IDS.g2).applied, true);
  const saves = saveCreates().length;
  const next = damage(W, ctx, { id: "dmgEmpNew0000004", total: 12, hook: true, flags: empowered(first.id) });
  await advance(800);
  await flush(8);
  assert.ok(resOf(next.id));
  assert.ok(saveCreates().length > saves, "areaLocked: no carry, the monster saves are rolled");
  assert.equal(R.empoweredSource({ id: "x", flags: empowered("nope") }, ctx.activity), null, "an unknown card carries nothing");
  assert.equal(R.empoweredSource({ id: "x", flags: empowered(first.id) }, { uuid: "Item.other.Activity.zz" }), null, "another activity carries nothing");
  assert.equal(ops("rollSavingThrow").length > 0, true);
});
