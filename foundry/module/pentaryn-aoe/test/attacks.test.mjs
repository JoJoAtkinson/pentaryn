// Part C: damage rolls straight after a hit (or an attack whose target AC is unknown), on the
// roller's client, threaded under the usage card exactly as the Damage button would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, flush, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const { attacks: A } = await seams();

const arrow = { id: "ammoArrow0000001", name: "Arrow" };
function subject(over = {}) {
  return {
    type: "attack", uuid: "Actor.r.Item.bow.Activity.atk", damage: { parts: [{}] },
    actor: { items: new Map([[arrow.id, arrow]]) },
    rollDamage: async (config, dialog, message) => {
      F.calls.push({ op: "rollDamage", config: { ...config, ammunition: config.ammunition?.id ?? config.ammunition }, dialog, message });
      return ["dmg"];
    },
    ...over,
  };
}
async function roll(rolls, subj = subject()) {
  F.calls.length = 0;
  F.fire("dnd5e.postRollAttack", rolls, { subject: subj });
  await flush();
  return F.calls.filter(c => c.op === "rollDamage");
}

test("hit, miss, crit, fumble, unknown AC (golden/attacks.json)", async () => {
  const rows = [];
  for (const [label, r] of [
    ["hit", { total: 15, options: { target: 15 } }],
    ["miss", { total: 14, options: { target: 15 } }],
    ["crit beats AC", { total: 12, options: { target: 30 }, isCritical: true }],
    ["fumble", { total: 25, options: { target: 10 }, isFumble: true }],
    ["unknown AC", { total: 3, options: {} }],
  ]) rows.push({ label, calls: await roll([r]) });
  pinJSON("attacks", rows, import.meta.url);
  assert.deepEqual(rows.map(r => r.calls.length), [1, 0, 1, 0, 1]);
});

test("the attack message (roll.parent) gives mode, ammunition and the usage card origin", async () => {
  const parent = { type: "attack", system: { mode: "twoHanded", ammunition: arrow.id }, _source: { system: { origin: "usageCard000001" } } };
  const [call] = await roll([{ total: 20, options: { target: 10 }, parent }]);
  assert.deepEqual(call, { op: "rollDamage", config: { attackMode: "twoHanded", ammunition: arrow.id, isCritical: undefined }, dialog: { configure: false }, message: { data: { system: { origin: "usageCard000001" } } } });
});

test("roll options win over the attack message; no origin → an empty message config", async () => {
  const parent = { type: "attack", system: { mode: "oneHanded", ammunition: "x" }, _source: { system: { origin: "u1" } } };
  const [a] = await roll([{ total: 20, options: { attackMode: "offhand", ammunition: arrow.id, originatingMessage: "u2" }, parent }]);
  assert.deepEqual([a.config.attackMode, a.config.ammunition, a.message], ["offhand", arrow.id, { data: { system: { origin: "u2" } } }]);
  const [b] = await roll([{ total: 20, options: {} }]);
  assert.deepEqual([b.config.attackMode, b.config.ammunition, b.message], [undefined, undefined, {}]);
});

test("a roll that lost its parent: the last 10 messages are scanned for this activity's attack card", async () => {
  W.message({ type: "attack", system: { activity: { uuid: "Actor.r.Item.bow.Activity.atk" }, mode: "thrown" }, _src: 1 });
  const [call] = await roll([{ total: 20, options: {} }]);
  assert.equal(call.config.attackMode, "thrown");
});

test("nothing rolls: setting off, not an attack activity, no roll, no damage parts", async () => {
  await game.settings.set(MODULE, "autoDamageOnHit", false);
  assert.deepEqual(await roll([{ total: 20, options: {} }]), []);
  await game.settings.set(MODULE, "autoDamageOnHit", true);
  assert.deepEqual(await roll([{ total: 20, options: {} }], subject({ type: "save" })), []);
  assert.deepEqual(await roll([]), []);
  assert.deepEqual(await roll(null), []);
  assert.deepEqual(await roll([{ total: 20, options: {} }], subject({ damage: { parts: [] } })), []);
  assert.deepEqual(await A.onPostRollAttack([{ total: 20 }]), undefined, "no subject");
});
