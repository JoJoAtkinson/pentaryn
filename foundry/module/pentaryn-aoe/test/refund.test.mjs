// Part F: a cancelled area placement gives back what it spent. A SYNCHRONOUS, unguarded
// dnd5e.postUseActivity listener decides, returns a literal false (Hooks.call stops), and the
// refund runs after. Registered after resolve's Careful arm on the same hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, out, lines, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const { refund: R } = await seams();
const scene = W.scene({ id: "RefundScene00001" });
F.canvas.scene = scene;

function cast({ consumed = true, placed = 0, wanted = true, effects = [], owner = true, msgDelete, msgUpdate, refundFn } = {}) {
  const caster = W.actor({ name: "Sorcerer", type: "character" });
  const item = W.item({ name: "Fireball", system: { identifier: "fireball" } }, caster);
  const activity = {
    actor: caster, item, target: { template: { type: wanted ? "sphere" : "" } },
    refund: refundFn ?? (async deltas => { F.calls.push({ op: "activity.refund", deltas: F.plain(deltas) }); }),
  };
  const message = W.message({ type: "usage", system: { deltas: consumed ? { actor: [{ keyPath: "system.spells.spell3.value", delta: -1 }], item: {} } : { actor: [], item: {} } } });
  if (!owner) message.ownership = { default: 0 }, F.game.user.isGM = false;
  if (msgDelete) Object.defineProperty(message, "delete", { value: msgDelete });
  if (msgUpdate) Object.defineProperty(message, "update", { value: msgUpdate });
  const conc = effects.map(e => W.effect(caster, { name: "Concentrating", statuses: ["concentrating"], ...e }));
  const usageConfig = { create: { measuredTemplate: true } };
  const results = { message, templates: Array.from({ length: placed }, () => ({})), effects: conc };
  return { caster, item, activity, message, usageConfig, results, conc };
}

test("hasConsumed: actor deltas, created/deleted, or any item delta list", () => {
  assert.deepEqual([
    R.hasConsumed(null), R.hasConsumed({}), R.hasConsumed({ actor: [{}] }), R.hasConsumed({ created: ["x"] }),
    R.hasConsumed({ deleted: ["x"] }), R.hasConsumed({ item: { a: [] } }), R.hasConsumed({ item: { a: [{}] } }),
  ], [false, false, true, true, true, false, true]);
});

test("cancelled after a spend: Hooks.call stops (false), the refund runs, concentration ends, the card goes", async () => {
  const c = cast({ effects: [{}] });
  F.calls.length = 0;
  out.length = 0;
  const ret = F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, c.results);
  assert.equal(ret, false);
  await flush();
  const pinned = F.calls.filter(x => ["activity.refund", "delete", "notify", "update"].includes(x.op));
  assert.deepEqual(pinned, [
    { op: "activity.refund", deltas: { actor: [{ keyPath: "system.spells.spell3.value", delta: -1 }], item: {} } },
    { op: "delete", documentName: "ActiveEffect", uuid: c.conc[0].uuid },
    { op: "delete", documentName: "ChatMessage", uuid: c.message.uuid },
    { op: "notify", level: "info", message: "Fireball: placement cancelled, so nothing was spent. The slot, charge or uses are back." },
  ]);
  assert.equal(game.messages.has(c.message.id), false);
  assert.deepEqual(out, []);
});

test("not cancelled: placed, nothing spent, no area wanted, no message, or the setting off → listener returns undefined", async () => {
  const cases = [cast({ placed: 1 }), cast({ consumed: false }), cast({ wanted: false })];
  for (const c of cases) assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, c.results), true);
  const c = cast();
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, { create: {} }, c.results), true, "no measuredTemplate wanted");
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, { ...c.results, message: {} }), true, "not a ChatMessage");
  await game.settings.set(MODULE, "refundCancelledArea", false);
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, c.results), true);
  await game.settings.set(MODULE, "refundCancelledArea", true);
  const sceneless = cast();
  F.canvas.scene = null;
  assert.equal(F.fireCall("dnd5e.postUseActivity", sceneless.activity, sceneless.usageConfig, sceneless.results), true, "no viewed scene");
  F.canvas.scene = scene;
  await flush();
});

test("nothing spent but concentration began → still vetoed; the refund itself then declines (placementCancelled false)", async () => {
  const c = cast({ consumed: false, effects: [{}] });
  F.calls.length = 0;
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, c.results), false);
  await flush();
  assert.deepEqual(F.calls.filter(x => ["activity.refund", "delete", "notify"].includes(x.op)), []);
});

test("a throw in the synchronous check is logged 'pentaryn-aoe | refund cancelled area' and does not veto", () => {
  out.length = 0;
  const c = cast();
  const bad = { get create() { throw new Error("boom"); } };
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, bad, c.results), true);
  assert.deepEqual(lines(), [`error: ${MODULE} | refund cancelled area`]);
});

test("a rejected refund is logged with the same prefix", async () => {
  out.length = 0;
  const c = cast({ refundFn: async () => { throw new Error("dnd5e refused"); } });
  assert.equal(F.fireCall("dnd5e.postUseActivity", c.activity, c.usageConfig, c.results), false);
  await flush();
  assert.deepEqual(lines(), [`error: ${MODULE} | refund cancelled area`]);
});

test("[declared] -9: both cleanup deletes rejecting → refund() resolves true, one info toast, and two 'pentaryn-aoe | refund …' warnings (was: silent)", async () => {
  const c = cast({
    effects: [{}],
    msgDelete: async () => { throw new Error("gone"); },
    msgUpdate: async () => { throw new Error("nope"); },
  });
  Object.defineProperty(c.conc[0], "delete", { value: async () => { throw new Error("boom"); } });
  out.length = 0;
  F.calls.length = 0;
  assert.equal(await R.refund(c.activity, c.usageConfig, c.results), true);
  assert.equal(F.calls.filter(x => x.op === "notify").length, 1);
  assert.deepEqual(out.map(o => [o.level, o.text]), [["warn", "pentaryn-aoe | refund end concentration"], ["warn", "pentaryn-aoe | refund card cleanup"]]);
});

test("the Careful arm (resolve) runs before refund's veto on the same hook", async () => {
  const c = cast();
  const careful = W.item({ name: "Careful Spell", type: "feat", system: { identifier: "careful-spell" } }, c.caster);
  const order = [];
  const update = c.caster.update.bind(c.caster);
  Object.defineProperty(c.caster, "update", { value: async ch => { order.push("careful"); return update(ch); } });
  const activity = { ...c.activity, item: careful };
  assert.equal(F.fireCall("dnd5e.postUseActivity", activity, c.usageConfig, c.results), false);
  order.push("after-veto");
  await flush();
  assert.equal(order[0], "careful", "resolve's listener ran first (it was reached before refund's false)");
});
