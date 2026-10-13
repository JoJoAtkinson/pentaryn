// aoe-edge-2 (final review 2026-10-12, declared fix): the tray's area picker was never locked, so
// choosing another area on a superseded or partly applied tray rebuilt it — un-superseding it and
// resetting applied rows, so the same damage could be applied twice. Now the picker is disabled once
// the tray is superseded or any row is applied, and resolve(message, { regionId }) on such a tray
// returns null with a warning toast and leaves it as it was. A fresh tray still re-resolves freely.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const T = S.tray;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);
const OTHER = [{ id: IDS.region, name: "Fireball" }, { id: "regionOther00001", name: "Fireball 2" }];

async function tray(id) {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;   // alive, so their rows are ticked
  const msg = damage(W, ctx, { id, hook: true });
  await advance(800);
  await flush(8);
  F.calls.length = 0;
  return msg;
}

test("aoe-edge-2 a fresh tray still re-resolves to another area (or the targets) freely", async () => {
  const msg = await tray("dmgLockFresh0001");
  const res = await R.resolve(msg.id, { regionId: null });
  assert.ok(res, "re-resolved");
  assert.equal(res.region, null);
  assert.deepEqual(ops("notify").filter(c => c.level === "warn"), []);
});

test("aoe-edge-2 a tray with an applied row is not rebuilt: null, a warning toast, the applied row kept", async () => {
  const msg = await tray("dmgLockApplied01");
  await R.applyRows(msg.id, [IDS.g1]);
  const before = JSON.parse(JSON.stringify(resOf(msg.id)));
  assert.equal(before.rows.find(r => r.id === IDS.g1).applied, true);
  F.calls.length = 0;
  assert.equal(await R.resolve(msg.id, { regionId: IDS.region }), null);
  assert.deepEqual(resOf(msg.id), before, "the resolution is untouched");
  assert.deepEqual(ops("applyDamage", "rollSavingThrow"), [], "no damage, no saves");
  const warns = ops("notify").filter(c => c.level === "warn");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].message, game.i18n.localize("PENTARYN_AOE.Tray.AreaLocked"));
});

test("aoe-edge-2 a superseded tray is not revived by a re-resolve", async () => {
  const old = await tray("dmgLockOld000001");
  await tray("dmgLockNew000001");
  assert.equal(resOf(old.id).superseded, true, "the newer roll superseded it");
  F.calls.length = 0;
  assert.equal(await R.resolve(old.id, { regionId: IDS.region }), null);
  assert.equal(resOf(old.id).superseded, true, "still superseded");
  assert.equal(ops("notify").filter(c => c.level === "warn").length, 1);
});

test("aoe-edge-2 the area picker is disabled once the tray is superseded or any row is applied", async () => {
  const msg = await tray("dmgLockPicker001");
  const fresh = { ...JSON.parse(JSON.stringify(resOf(msg.id))), regions: OTHER };
  const pickerOf = res => T.trayHTML(res, msg).match(/<select data-pa="region"[^>]*>/)[0];
  assert.doesNotMatch(pickerOf(fresh), /disabled/);
  assert.match(pickerOf({ ...fresh, superseded: true }), /disabled/);
  const applied = JSON.parse(JSON.stringify(fresh));
  applied.rows[0].applied = true;
  assert.match(pickerOf(applied), /disabled/);
});
