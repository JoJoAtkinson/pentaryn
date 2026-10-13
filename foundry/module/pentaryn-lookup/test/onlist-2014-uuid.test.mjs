// lookup-2014-uuid [declared]: dnd5e's spell-list registry holds the 2024 copies (PHB, SRD 5.2), and
// SpellList#has() matches by uuid, so a 2014 SRD spell uuid (`dnd5e.spells`) answered onList:false
// for its own class list. onList() now checks the spell's 2024 counterpart — same
// `system.identifier`, else same name, in the current spell packs — when the 2014 doc itself is not
// on the list. The answer still names the 2014 spell (uuid, edition "2014") and adds `listedAs`, the
// counterpart uuid the list holds. A 2014 spell with no counterpart, or whose counterpart is not on
// the list, still answers false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, StubCollection } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);

const item = (pack, id, name, identifier, level) => ({ documentName: "Item", type: "spell", id, name, pack,
  uuid: `Compendium.${pack}.Item.${id}`, system: { level, ...(identifier ? { identifier } : {}) } });
function pack(id, label, docs) {
  const index = new StubCollection();
  for (const d of docs) index.set(d.id, { _id: d.id, name: d.name, system: { ...d.system } });
  F.game.packs.set(id, { collection: id, metadata: { id, label }, documentName: "Item", locked: true,
    async getDocuments() { return docs; }, async getIndex() { return index; },
    async getDocument(docId) { return docs.find(d => d.id === docId) ?? null; } });
}

const PHB = "dnd-players-handbook.spells", SRD24 = "dnd5e.spells24", OLD = "dnd5e.spells";
const fireball = item(PHB, "spFireball", "Fireball", "fireball", 3);
const acidArrow24 = item(SRD24, "spAcidArrow24", "Acid Arrow", "acid-arrow", 2);
const fireball14 = item(OLD, "spFireball14", "Fireball", "fireball", 3);
const melfs14 = item(OLD, "spMelfs14", "Melf's Acid Arrow", "acid-arrow", 2);
const oldOnly14 = item(OLD, "spOldOnly14", "Old Only", "old-only", 1);
pack(PHB, "PHB Spells", [fireball]);
pack(SRD24, "SRD 5.2 Spells", [acidArrow24]);
pack(OLD, "Spells (SRD)", [fireball14, melfs14, oldOnly14]);

// dnd5e 6.0.6 SpellList#has: an Item by its uuid, or a uuid string — never a name
const list = uuids => ({ uuids: new Set(uuids), has: s => uuids.includes(typeof s === "string" ? s : s.uuid) });
const lists = { "class:wizard": list([fireball.uuid, acidArrow24.uuid]), "class:cleric": list([]) };
globalThis.dnd5e = { registry: { spellLists: { forType: (t, id) => lists[`${t}:${id}`],
  options: [{ value: "class:wizard" }, { value: "class:cleric" }] } } };

await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

test("lookup-2014-uuid: a 2014 uuid whose 2024 copy is on the list answers onList: true", async () => {
  const out = await rules.onList(fireball14.uuid, "wizard");
  assert.equal(out.onList, true);
  assert.equal(out.uuid, fireball14.uuid);
  assert.equal(out.edition, "2014");
  assert.equal(out.listedAs, fireball.uuid);
});

test("lookup-2014-uuid: the counterpart is found by identifier when the 2024 name differs", async () => {
  const out = await rules.onList(melfs14.uuid, "wizard");
  assert.equal(out.onList, true);
  assert.equal(out.spell, "Melf's Acid Arrow");
  assert.equal(out.listedAs, acidArrow24.uuid);
});

test("lookup-2014-uuid: a 2014 uuid off the list still answers false, with no listedAs", async () => {
  const out = await rules.onList(fireball14.uuid, "cleric");
  assert.equal(out.onList, false);
  assert.equal(Object.hasOwn(out, "listedAs"), false);
});

test("lookup-2014-uuid: a 2014 spell with no 2024 counterpart answers false", async () => {
  const out = await rules.onList(oldOnly14.uuid, "wizard");
  assert.equal(out.onList, false);
  assert.equal(Object.hasOwn(out, "listedAs"), false);
});

test("lookup-2014-uuid: a 2024 spell answers as before, with no listedAs", async () => {
  const out = await rules.onList(fireball.uuid, "wizard");
  assert.equal(out.onList, true);
  assert.equal(Object.hasOwn(out, "listedAs"), false);
});
