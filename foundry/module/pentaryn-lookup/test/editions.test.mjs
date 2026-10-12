// EXT-5 [declared]: EDITIONS stamps the 2014 spell pack too. onList's answer for a spell found in
// `dnd5e.spells` carries `edition: "2014"`, spellList rows from a pack in EDITIONS carry it, and
// packs() reports that pack as 2014 — a 2014 spell answer cannot masquerade as current. Rows and
// answers from 2024 packs have no `edition` key, as search hits do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, StubCollection } from "./kit/foundry-stub.mjs";
import { installLookupWorld, spellRegistry } from "./fixtures/packs.mjs";
import { EDITIONS } from "../lookup-core.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);

// the 2014 SRD spell pack: Bless is only there, so a name lookup falls through to it
const OLD = "dnd5e.spells";
const bless = { documentName: "Item", type: "spell", id: "spBless14", name: "Bless", pack: OLD,
                uuid: `Compendium.${OLD}.Item.spBless14`, system: { level: 1 } };
const oldIndex = new StubCollection();
oldIndex.set(bless.id, { _id: bless.id, name: bless.name, system: { level: 1 } });
F.game.packs.set(OLD, {
  collection: OLD, metadata: { id: OLD, label: "Spells (SRD)" }, documentName: "Item", locked: true,
  async getDocuments() { return [bless]; },
  async getIndex() { return oldIndex; },
  async getDocument(id) { return id === bless.id ? bless : null; },
});
const base = spellRegistry();
const wizard = base.spellLists.forType("class", "wizard");
const wizard14 = { has: doc => doc.name === "Fireball" || doc.name === "Bless",
                   uuids: new Set([...wizard.uuids, bless.uuid]) };
globalThis.dnd5e = { registry: { spellLists: { ...base.spellLists,
  forType: (type, id) => (type === "class" && id === "wizard" ? wizard14 : base.spellLists.forType(type, id)) } } };

await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

test("EXT-5: EDITIONS marks the 2014 spell pack", () => {
  assert.equal(EDITIONS[OLD], "2014");
});

test("EXT-5: onList of a spell found in the 2014 pack carries edition: '2014'", async () => {
  const out = await rules.onList("Bless", "wizard");
  assert.equal(out.uuid, bless.uuid);
  assert.equal(out.edition, "2014");
  assert.equal(out.onList, true);
});

test("EXT-5: onList of a 2024 spell has no edition key", async () => {
  const out = await rules.onList("Fireball", "wizard");
  assert.equal(Object.hasOwn(out, "edition"), false);
});

test("EXT-5: spellList rows from the 2014 pack carry edition; 2024 rows do not", async () => {
  const { spells } = await rules.spellList("wizard");
  const row = spells.find(r => r.name === "Bless");
  assert.deepEqual(row, { name: "Bless", level: 1, uuid: bless.uuid, edition: "2014" });
  for (const r of spells.filter(r => r.name !== "Bless")) assert.equal(Object.hasOwn(r, "edition"), false, r.name);
});

test("EXT-5: packs() reports the 2014 spell pack as 2014", async () => {
  const row = (await rules.packs()).packs.find(p => p.id === OLD);
  assert.equal(row.present, true);
  assert.equal(row.edition, "2014");
});
