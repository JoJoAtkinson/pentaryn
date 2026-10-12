/**
 * Characterisation (prompts checkpoint, wave 3): patch.mjs — "stock monster plus changes". The
 * dry-run checks (checkPatch's notes, defaults and refusals) and applyPatch's writes on a stub
 * actor, in the order it makes them, plus the ring tiers. KNOWN rows pin today's bugs as they are.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addItemPack } from "./fixtures/world.mjs";
import { makeDoc, StubCollection } from "./kit/foundry-stub.mjs";

const F = await installWorld();
// the item packs findItem searches: the 2024 SRD equipment only (the PHB pack is absent → skipped)
addItemPack(F, "dnd5e.equipment24", [
  { _id: "eqRope0000000001", name: "Rope", type: "loot", system: { quantity: 1 } },
  { _id: "eqLongsword00001", name: "Longsword", type: "weapon", system: { quantity: 1, equipped: false } },
  { _id: "eqShield00000001", name: "Shield", type: "equipment", system: { quantity: 1 } }
]);
F.CONFIG.DND5E = {
  creatureTypes: { humanoid: {}, construct: {}, elemental: {} },
  languages: { standard: { label: "Standard", selectable: false, children: { common: "Common", dwarvish: "Dwarvish", goblin: "Goblin" } },
    exotic: { label: "Exotic", children: { primordial: { label: "Primordial", children: { terran: "Terran" } } } } }
};
const P = await import("../actor-patch-adapter.mjs");

test("parseCreatureType, patchSize, SIZE_WORDS, RING_COLOURS, ringData", () => {
  assert.deepEqual(["humanoid (goblinoid)", " Construct ", "x (", "", null, "two words"].map(P.parseCreatureType),
    [{ value: "humanoid", subtype: "goblinoid" }, { value: "construct", subtype: "" }, null, null, null, null]);
  assert.deepEqual([null, {}, { size: "Large" }, { size: "grg" }].map(P.patchSize), [null, null, "lg", "grg"]);
  assert.throws(() => P.patchSize({ size: "colossal" }), { code: "BAD_SPEC", message: "BAD_SPEC: patch.size must be tiny|small|medium|large|huge|gargantuan, got colossal" });
  assert.deepEqual(P.SIZE_WORDS, { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg", huge: "huge", gargantuan: "grg", grg: "grg" });
  assert.deepEqual(P.RING_COLOURS, { pc: "#ffcc4d", foe: "#d8433a", named: "#86c98a", mook: "#9098a0" });
  assert.equal(Object.isFrozen(P.RING_COLOURS), true);
  assert.deepEqual([P.ringData(null, "a"), P.ringData("none", "a"), P.ringData("mook", "a.webp"), P.ringData("pc")],
    [null, { enabled: false }, { enabled: true, colors: { ring: "#9098a0" }, subject: { texture: "a.webp", scale: 1 } }, { enabled: true, colors: { ring: "#ffcc4d" }, subject: { texture: null, scale: 1 } }]);
  assert.throws(() => P.ringData("gold"), { code: "BAD_SPEC", message: "BAD_SPEC: ring must be pc|foe|named|mook|none, got gold" });
});

test("checkPatch: notes and defaults for a full patch (golden patch-check)", async () => {
  const res = await P.checkPatch({
    name: "Stone guard", size: "large", creatureType: "construct", languages: ["Common", "Terran", "Klingon"],
    set: { "system.traits.languages.value": ["goblin"] },
    addItems: [{ name: "rope", quantity: 2 }, { uuid: "Compendium.dnd5e.equipment24.Item.eqShield00000001", rename: "Tower shield" },
      { data: { name: "Amulet", type: "equipment", system: { description: { value: "Requires attunement." } } } },
      { data: { name: "Odd charm", type: "loot", system: { description: { value: "(requires attunement)" } } } }],
    traits: [{ name: "Stony", activation: "passive" }, { name: "Slam", activation: "bonus", recharge: 5 }],
    recharge: { "Rock Throw": 6 }
  });
  pinJSON("patch-check", res, import.meta.url);
  assert.deepEqual(await P.checkPatch({ creatureType: "elemental" }), { notes: ["a changed type clears the inherited languages (pass patch.languages to keep some)"], defaults: [] });
  assert.deepEqual(await P.checkPatch({ set: { "system.details.type.value": "elemental", "system.traits.languages.value": [] } }), { notes: ["languages → none"], defaults: [] });
});

test("checkPatch refusals", async () => {
  const cases = [
    [{ creatureType: "dragon" }, "BAD_SPEC: patch.creatureType: \"dragon\" (humanoid|construct|elemental, optional \"(subtype)\")"],
    [{ creatureType: "x (" }, "BAD_SPEC: patch.creatureType: \"x (\" (humanoid|construct|elemental, optional \"(subtype)\")"],
    [{ languages: "Common" }, "BAD_SPEC: patch.languages: a list of language names or keys ([] for none)"],
    [{ languages: [1] }, "BAD_SPEC: patch.languages: a list of language names or keys ([] for none)"],
    [{ addItems: [{ data: { name: "x" } }] }, "BAD_SPEC: patch.addItems[].data needs name and type"],
    [{ addItems: [{ name: "Grapple" }] }, "BAD_SPEC: patch.addItems: no item \"Grapple\" in dnd-players-handbook.equipment, dnd5e.equipment24; or pass {data: {name, type, system}} for a custom item"],
    [{ addItems: [{}] }, "BAD_SPEC: patch.addItems: no item \"undefined\" in dnd-players-handbook.equipment, dnd5e.equipment24; or pass {data: {name, type, system}} for a custom item"],
    [{ traits: [{}] }, "BAD_SPEC: patch.traits[]: name is required"],
    [{ traits: [{ name: "T", activation: "free" }] }, "BAD_SPEC: patch.traits[T].activation: passive|action|bonus|reaction|special|minute|hour"],
    [{ traits: [{ name: "T", recharge: 7 }] }, "BAD_SPEC: patch.traits[T].recharge: 2-6 (5 means \"Recharge 5-6\")"],
    [{ recharge: { Breath: 1 } }, "BAD_SPEC: patch.recharge[\"Breath\"]: 2-6"],
    [{ size: "big" }, "BAD_SPEC: patch.size must be tiny|small|medium|large|huge|gargantuan, got big"]
  ];
  for (const [patch, msg] of cases) await assert.rejects(P.checkPatch(patch), { code: "BAD_SPEC", message: msg }, JSON.stringify(patch));
  // no creature-type table configured: any word passes the type check
  const saved = F.CONFIG.DND5E.creatureTypes;
  delete F.CONFIG.DND5E.creatureTypes;
  assert.deepEqual((await P.checkPatch({ creatureType: "dragon" })).notes, ["a changed type clears the inherited languages (pass patch.languages to keep some)"]);
  F.CONFIG.DND5E.creatureTypes = saved;
});

test("[declared] R2: checkPatch refuses an unknown disposition word, as the real run does, and only after every earlier check", async () => {
  await assert.rejects(P.checkPatch({ disposition: "angry" }), { code: "BAD_SPEC", message: "BAD_SPEC: patch.disposition: hostile|neutral|friendly|secret" });
  for (const disposition of ["hostile", "neutral", "friendly", "SECRET"]) {
    assert.deepEqual(await P.checkPatch({ disposition }), { notes: [], defaults: [] }, disposition);
  }
  // a second bad field keeps the message it gave before: the disposition check is the last one
  await assert.rejects(P.checkPatch({ size: "big", disposition: "angry" }), { message: "BAD_SPEC: patch.size must be tiny|small|medium|large|huge|gargantuan, got big" });
  await assert.rejects(P.checkPatch({ disposition: "angry", recharge: { Breath: 1 } }), { message: "BAD_SPEC: patch.recharge[\"Breath\"]: 2-6" });
  await assert.rejects(P.checkPatch({ disposition: "angry", traits: [{ name: "T", recharge: 7 }] }), { message: "BAD_SPEC: patch.traits[T].recharge: 2-6 (5 means \"Recharge 5-6\")" });
});

test("[declared] R3: checkPatch shape-checks removeItems, itemUpdates, set and the numeric fields", async () => {
  const LIST = "BAD_SPEC: patch.removeItems: a list of item names or ids, e.g. [\"Scimitar\"]";
  const UPD = "BAD_SPEC: patch.itemUpdates: a list of {item: <name or id>, set: {\"system.x\": value}}";
  const SET = "BAD_SPEC: patch.set: an object of {\"system.path\": value}";
  const HP = "BAD_SPEC: patch.hp: a number, or {max: <number>, formula: \"8d12+24\"}";
  const cases = [
    [{ removeItems: "Scimitar" }, LIST], [{ removeItems: [""] }, LIST], [{ removeItems: [3] }, LIST], [{ removeItems: [null] }, LIST],
    [{ itemUpdates: { item: "Claw" } }, UPD], [{ itemUpdates: ["Claw"] }, UPD], [{ itemUpdates: [{ item: "Claw" }] }, UPD],
    [{ itemUpdates: [{ item: "", set: {} }] }, UPD], [{ itemUpdates: [{ item: "Claw", set: [1] }] }, UPD], [{ itemUpdates: [{ item: 4, set: {} }] }, UPD],
    [{ set: "system.x" }, SET], [{ set: [1, 2] }, SET], [{ set: null }, SET], [{ set: { "": 1 } }, SET],
    [{ hp: "lots" }, HP], [{ hp: { formula: "8d12" } }, HP], [{ hp: { max: "x" } }, HP], [{ hp: { max: 10, formula: 7 } }, HP], [{ hp: null }, HP], [{ hp: true }, HP],
    [{ ac: "plate" }, "BAD_SPEC: patch.ac: a number (flat AC), got plate"],
    [{ ac: "" }, "BAD_SPEC: patch.ac: a number (flat AC), got "],
    [{ cr: "boss" }, "BAD_SPEC: patch.cr: a number or a fraction like \"1/2\", got boss"],
    [{ speed: "fast" }, "BAD_SPEC: patch.speed: a number (walking feet), got fast"],
    [{ speed: [30] }, "BAD_SPEC: patch.speed: a number (walking feet), got 30"]
  ];
  for (const [patch, msg] of cases) await assert.rejects(P.checkPatch(patch), { code: "BAD_SPEC", message: msg }, JSON.stringify(patch));
  // valid shapes still pass, with no new notes
  const ok = { removeItems: ["Scimitar", "itClaw0000000001"], itemUpdates: [{ item: "Claw", set: { "system.damage.base.number": 2 } }],
    set: { "system.attributes.movement.climb": 30 }, hp: 45, ac: "15", cr: "1/2", speed: 30 };
  assert.deepEqual(await P.checkPatch(ok), { notes: [], defaults: [] });
  for (const hp of [{ max: 80, formula: "8d12+24" }, { max: "80" }, "45"]) assert.deepEqual(await P.checkPatch({ hp }), { notes: [], defaults: [] }, JSON.stringify(hp));
  assert.deepEqual(await P.checkPatch({ removeItems: [], itemUpdates: [], set: {}, cr: 0 }), { notes: [], defaults: [] });
});

/** A world actor this run owns, logging its writes. */
function stubActor() {
  const items = new StubCollection([
    makeDoc("Item", { id: "itScimitar000001", name: "Scimitar", type: "weapon" }),
    makeDoc("Item", { id: "itBreath00000001", name: "Fire Breath", type: "feat", system: { activities: [
      { id: "actA", consumption: { targets: [{ type: "itemUses", target: "", value: "1" }, { type: "material", target: "x", value: "2", toObject: () => ({ type: "material", target: "x", value: "2" }) }] } },
      { id: "actB", consumption: {} }] } }),
    makeDoc("Item", { id: "itClaw0000000001", name: "Claw", type: "weapon" })
  ]);
  const actor = makeDoc("Actor", { id: "actorPatched0001", name: "Ogre", type: "npc",
    system: { details: { type: { value: "giant" } }, traits: { languages: { value: ["common", "giant"], custom: "" } } } });
  Object.defineProperty(actor, "items", { value: items, enumerable: false });
  for (const op of ["deleteEmbeddedDocuments", "createEmbeddedDocuments", "updateEmbeddedDocuments"]) {
    Object.defineProperty(actor, op, { enumerable: false, value: async (type, data) => { F.calls.push({ op, type, data: F.plain(data) }); return data; } });
  }
  return actor;
}
const randomIds = v => JSON.parse(JSON.stringify(v).replace(/"[A-Za-z0-9]{16}":\{"_id":"[A-Za-z0-9]{16}"/g, '"<rid>":{"_id":"<rid>"'));

test("applyPatch: the writes in order (golden patch-apply)", async () => {
  const actor = stubActor();
  const n0 = F.calls.length;
  const res = await P.applyPatch(actor, {
    name: "Ogre Chief", size: "huge", img: "ogre.webp", biography: "<p>Big.</p>", hp: { max: 80, formula: "8d12+24" }, ac: 15, cr: 3, speed: 35,
    disposition: "neutral", set: { "system.attributes.movement.climb": 20 }, creatureType: "humanoid (giant kin)", languages: ["Common", "Ogrish"],
    removeItems: ["scimitar", "Glaive", "itClaw0000000001"],
    addItems: [{ name: "Longsword", rename: "Chief's blade", system: { magical: true } }, { name: "Rope", quantity: 3 }, { name: "Nothing here" },
      { data: { _id: "zz", name: "Totem", type: "equipment", system: { description: { value: "requires attunement" } } }, quantity: 2 }],
    traits: [{ name: "Brute", html: "<p>Hits hard.</p>" }, { name: "Roar", activation: "action", recharge: 5 }, { name: "Stomp", activation: "bonus", uses: { max: 2, per: "short" } },
      { name: "Grit", uses: { max: 1, per: "week" } }],
    recharge: { "Fire Breath": 5, "Lightning Breath": 6 },
    itemUpdates: [{ item: "Fire Breath", set: { "system.range.value": 30 } }, { item: "Wing", set: {} }]
  });
  pinJSON("patch-apply", randomIds({ res, calls: F.calls.slice(n0).filter(c => !c.op.startsWith("Hooks")) }), import.meta.url);
});

test("applyPatch: a changed type without languages clears the inherited ones; set languages become keys; nothing to do writes nothing", async () => {
  const a = stubActor();
  const n0 = F.calls.length;
  const r = await P.applyPatch(a, { creatureType: "construct" });
  assert.deepEqual(r.changed, ["type construct", "languages cleared (was common, giant; type giant → construct; pass patch.languages to keep some)"]);
  assert.deepEqual(F.calls.slice(n0).find(c => c.op === "update").changes, { "system.details.type.value": "construct", "system.details.type.subtype": "",
    "system.traits.languages.value": [], "system.traits.languages.custom": "" });
  const b = stubActor();
  const r2 = await P.applyPatch(b, { set: { "system.traits.languages.value": ["Goblin", "Elvish"] } });
  assert.deepEqual(r2.changed, ["system.traits.languages.value"]);
  assert.deepEqual(F.calls.filter(c => c.op === "update").at(-1).changes, { "system.traits.languages.value": ["goblin"], "system.traits.languages.custom": "Elvish" });
  const n1 = F.calls.length;
  assert.deepEqual(await P.applyPatch(stubActor(), {}), { changed: [], warnings: [] });
  assert.deepEqual(await P.applyPatch(stubActor(), null), { changed: [], warnings: [] });
  assert.equal(F.calls.slice(n1).filter(c => !c.op.startsWith("Hooks")).length, 0);
  await assert.rejects(P.applyPatch(stubActor(), { disposition: "angry" }), { code: "BAD_SPEC", message: "BAD_SPEC: patch.disposition: hostile|neutral|friendly|secret" });
});

test("[declared] applyPatch writes a fractional CR string as the number the dry run reads (was Number(\"1/2\") = NaN)", async () => {
  const a = stubActor();
  const r = await P.applyPatch(a, { cr: "1/2" });
  assert.deepEqual(r.changed, ["cr 1/2"]);
  assert.equal(a.system.details.cr, 0.5);
});
