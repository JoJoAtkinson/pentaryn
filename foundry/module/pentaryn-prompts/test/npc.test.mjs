/**
 * Characterisation (prompts checkpoint, wave 3): npc.mjs — an npc replacement built through the
 * bridge module's own query handlers (stubbed here, recording their arguments): the dry-run check
 * (spec errors, a missing bridge or feature handler, language keys, spell names against packs) and
 * createNpc (temporary name, features, warnings and notes, the rename). Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addItemPack } from "./fixtures/world.mjs";

const F = await installWorld();
addItemPack(F, "dnd5e.spells", [{ _id: "spFireBolt000001", name: "Fire Bolt", type: "spell" }, { _id: "spShield00000001", name: "Shield", type: "spell" }]);
F.game.packs.set("world.actors", { metadata: { type: "Actor" }, getIndex: async () => [] });
F.CONFIG.DND5E = { languages: { standard: { label: "Standard", selectable: false, children: { common: "Common", giant: "Giant" } } } };
const N = await import("../npc-adapter.mjs");

const NPC = { name: "Ogre", creatureType: "giant", size: "large", cr: "2", hpAverage: 59, hpFormula: "7d10+21", acMode: "flat", acValue: 11,
  abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 }, languages: ["Common", "Giant", "Ogrish"], languagesCustom: "grunts" };
const FEATURES = [
  { featureType: "passive", featureName: "Brute", description: "Hits hard." },
  { featureType: "attack", featureName: "Greatclub", attackType: "melee", damageParts: [{ number: 2, denomination: 8, type: "bludgeoning" }], recharge: 5 },
  { featureType: "spells", spellNames: ["fire bolt", "Shield", "Fireball", "Shiel"] },
  { featureType: "spells", spellNames: ["x"], compendiumPacks: ["nope.pack", "world.actors"] }
];

const log = [];
let behave = {};
function bridge() {
  const q = (name, fn) => (F.CONFIG.queries[`foundry-mcp-bridge.${name}`] = async args => (log.push([name, F.plain(args)]), fn(args)));
  q("createNpcActor", args => ("create" in behave) ? behave.create(args) : (() => {
    const a = F.addActor({ name: args.name, type: "npc" });
    return { success: true, actor: { id: a.id }, warnings: ["Unknown damage type \"psychic-ish\"", "Unknown condition \"sad\"", "kept as is"] };
  })());
  q("addPassiveFeatureToActor", () => behave.passive?.() ?? { success: true, warnings: ["description trimmed"] });
  q("addAttackToActor", () => behave.attack?.() ?? { success: false, error: "no such ability" });
  q("addSpellsToActor", () => ({ success: true, notFound: ["Fireball"], failed: [{ name: "Shiel", error: "typo" }] }));
}

test("checkNpc: spec errors as one BAD_SPEC; a missing bridge or feature handler is BAD_SPEC", async () => {
  await assert.rejects(N.checkNpc({ npc: { name: "" } }), err => err.code === "BAD_SPEC" && err.message.startsWith("BAD_SPEC: npc.name"));
  await assert.rejects(N.checkNpc({ npc: NPC }), { code: "BAD_SPEC",
    message: "BAD_SPEC: npc needs the foundry-mcp-bridge module active in this GM client (no createNpcActor handler); or build the actor first and replace with {kind: \"actor\", actorId}" });
  F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"] = async () => ({});
  await assert.rejects(N.checkNpc({ npc: NPC, features: [FEATURES[0]] }), { message: "BAD_SPEC: npc needs the foundry-mcp-bridge module active in this GM client (no addPassiveFeatureToActor handler); or build the actor first and replace with {kind: \"actor\", actorId}" });
  delete F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"];
});

test("checkNpc: languages become keys (unknown kept as custom text), spell names checked against their packs (golden npc-check)", async () => {
  bridge();
  const r = await N.checkNpc({ npc: NPC, features: FEATURES });
  pinJSON("npc-check", r, import.meta.url);
  assert.deepEqual(r.npc.languages, ["common", "giant"]);
  assert.equal(r.npc.languagesCustom, "grunts; Ogrish");
  const plain = await N.checkNpc({ npc: { ...NPC, languages: [] } });
  assert.deepEqual([plain.npc.languages, plain.npc.languagesCustom, plain.warnings], [[], "grunts", []]);
});

test("createNpc: a temporary name, each feature through its handler, warnings and notes, then the rename (golden npc-create)", async () => {
  bridge();
  log.length = 0;
  const checked = await N.checkNpc({ npc: NPC, features: FEATURES.slice(0, 3) });
  const owned = [];
  const n0 = F.calls.length;
  const res = await N.createNpc(checked, d => owned.push(d));
  const temp = log[0][1].name;
  assert.match(temp, /^Ogre \[pp-[A-Za-z0-9]{6}\]$/);
  const scrub = v => JSON.parse(JSON.stringify(v).split(temp).join("<temp>").replace(/\b\d{16}\b/g, "<actor id>"));
  pinJSON("npc-create", scrub({ log, owned, warnings: res.warnings, notes: res.notes, actor: res.actor.name,
    writes: F.calls.slice(n0).filter(c => c.op === "update").map(c => c.changes) }), import.meta.url);
});

test("createNpc: a refused or empty create throws; an actor the bridge did not leave in the world throws", async () => {
  bridge();
  const checked = await N.checkNpc({ npc: NPC });
  behave = { create: () => ({ success: false, error: "not a GM" }) };
  await assert.rejects(N.createNpc(checked, () => {}), { message: "createNpcActor \"Ogre\": not a GM" });
  behave = { create: () => null };
  await assert.rejects(N.createNpc(checked, () => {}), { message: "createNpcActor \"Ogre\": no answer" });
  behave = { create: () => ({ success: true, error: "half" }) };
  await assert.rejects(N.createNpc(checked, () => {}), { message: "createNpcActor \"Ogre\": half" });
  behave = { create: () => ({ success: true, actor: { id: "nowhere" } }) };
  await assert.rejects(N.createNpc(checked, () => {}), { message: "createNpcActor \"Ogre\" returned no actor" });
  behave = {};
});
