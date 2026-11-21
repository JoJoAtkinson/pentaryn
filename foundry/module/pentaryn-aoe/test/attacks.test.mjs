// Part C: damage rolls straight after a hit (or an attack whose target AC is unknown), on the
// roller's client, threaded under the usage card exactly as the Damage button would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, flush, MODULE } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { attackHitTargets } from "../core.mjs";

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

/* ── 0.7.1 (playtest 2026-11-21): one roll, two targets, one hit — the miss is not in the damage tray ── */

const gob = (id, ac) => ({ actor: `Actor.gob${id}`, token: `Scene.s.Token.gob${id}`, name: `Goblin ${id}`, ac });

test("attackHitTargets: dnd5e's own rule — under the AC or a fumble misses, a crit hits, total cover (ac null) misses, an unknown AC hits", () => {
  const ts = [gob(1, 12), gob(2, 18), gob(3, null), gob(4, undefined)];
  assert.deepEqual(attackHitTargets(ts, { total: 15 }).map(t => t.name), ["Goblin 1", "Goblin 4"]);
  assert.deepEqual(attackHitTargets(ts, { total: 5, isCritical: true }).map(t => t.name), ["Goblin 1", "Goblin 2", "Goblin 4"], "a crit hits, never through total cover");
  assert.deepEqual(attackHitTargets(ts, { total: 25, isFumble: true }), [], "a fumble misses everyone, as dnd5e reads it");
  assert.deepEqual(attackHitTargets([gob(1, 20)], { total: 3 }), [], "every target missed");
  assert.equal(attackHitTargets([], { total: 3 }), null, "no recorded target: dnd5e's default stands");
  assert.equal(attackHitTargets(undefined, {}), null);
  const src = [gob(1, 10)];
  const [copy] = attackHitTargets(src, { total: 15 });
  assert.notEqual(copy, src[0], "descriptors are copied");
});

test("one attack roll against two targets, one hit: the auto damage card's targets are only the hit one", async () => {
  // dnd5e gives a two-target roll no single AC (options.target undefined), so the decision is "roll"
  const parent = { type: "attack", system: { targets: [gob(1, 12), gob(2, 18)] }, _source: { system: { origin: "usageCard000002" } } };
  const [call] = await roll([{ total: 15, options: {}, parent }]);
  assert.deepEqual(call.message, { data: { system: { origin: "usageCard000002", targets: [gob(1, 12)] } } }, "Goblin 2 (AC 18) was missed: not listed");
});

test("one attack roll against two targets, both missed: nothing rolls; both hit: both listed", async () => {
  const both = { type: "attack", system: { targets: [gob(1, 16), gob(2, 18)] }, _source: { system: { origin: "u3" } } };
  assert.deepEqual(await roll([{ total: 15, options: {}, parent: both }]), [], "every recorded target missed");
  const [call] = await roll([{ total: 19, options: {}, parent: both }]);
  assert.deepEqual(call.message.data.system.targets.map(t => t.name), ["Goblin 1", "Goblin 2"]);
  const [noOrigin] = await roll([{ total: 19, options: {}, parent: { type: "attack", system: { targets: [gob(1, 10)] }, _source: { system: {} } } }]);
  assert.deepEqual(noOrigin.message, { data: { system: { targets: [gob(1, 10)] } } }, "targets without an origin");
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

/* ── J1 (feedback fs7q6K): a save activity used at a target rolls its damage at once ─────────── */

function saveSubject(over = {}) {
  return {
    type: "save", uuid: "Actor.r.Item.lash.Activity.sv", damage: { parts: [{}] }, target: { template: { type: "" } },
    rollDamage: async (config, dialog, message) => { F.calls.push({ op: "rollDamage", config: F.plain(config), dialog, message: F.plain(message) }); return ["dmg"]; },
    ...over,
  };
}
const targets = [{ actor: "Actor.actCaven00000001", token: "Scene.s.Token.cv", name: "Caven" }];
async function use(subj, results, usageConfig = { event: null }) {
  F.calls.length = 0;
  F.fire("dnd5e.postUseActivity", subj, usageConfig, results);
  await flush();
  return F.calls.filter(c => c.op === "rollDamage");
}

test("J1: Use with a recorded target rolls damage with no dialog, threaded under the usage card with its targets", async () => {
  const [call] = await use(saveSubject(), { message: { id: "usageLash0000001", system: { targets } } });
  assert.deepEqual(call, { op: "rollDamage", config: { event: null }, dialog: { configure: false }, message: { data: { system: { origin: "usageLash0000001", targets } } } });
});

test("J1: the usage message's data form (create: false) carries the targets too; no message → no origin", async () => {
  const [a] = await use(saveSubject(), { message: { data: { system: { targets } } } });
  assert.deepEqual(a.message, { data: { system: { targets } } });
});

test("J1: no target, no damage parts, an area spell, another activity type, or the setting off → nothing", async () => {
  assert.deepEqual(await use(saveSubject(), { message: { id: "u", system: { targets: [] } } }), []);
  assert.deepEqual(await use(saveSubject(), { message: { id: "u", system: {} } }), []);
  assert.deepEqual(await use(saveSubject({ damage: { parts: [] } }), { message: { id: "u", system: { targets } } }), []);
  assert.deepEqual(await use(saveSubject({ target: { template: { type: "sphere" } } }), { message: { id: "u", system: { targets } } }), []);
  assert.deepEqual(await use(saveSubject({ type: "attack" }), { message: { id: "u", system: { targets } } }), []);
  await game.settings.set(MODULE, "autoDamageOnSave", false);
  assert.deepEqual(await use(saveSubject(), { message: { id: "u", system: { targets } } }), []);
  await game.settings.set(MODULE, "autoDamageOnSave", true);
  assert.equal(await A.onPostUseActivity(null, {}, {}), undefined, "no activity");
});

test("J1: the listener never vetoes (returns nothing), so refund's own veto is the only one on the hook", async () => {
  const out = F.fireCall("dnd5e.postUseActivity", saveSubject(), { event: null }, { message: { id: "u2", system: { targets } } });
  assert.equal(out, true);
  await flush();
});
