// R6 [declared]: monster(name) looks for an exact (case-insensitive) name in every monster pack, in
// pack order, before it falls back to a substring match — so an exact hit in a later pack (the 2024
// SRD) beats a substring hit in an earlier one (the Monster Manual), as describe() promises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
const world = installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const SRD = "dnd5e.actors24";

/** Give the 2024 SRD actors pack a readable "Guardian" for the duration of `fn`. */
async function withSrdGuardian(fn) {
  const pack = world.packs.get(SRD);
  const { getIndex, getDocument } = pack;
  const guardian = {
    documentName: "Actor", id: "srdGuardian", name: "Guardian", type: "npc",
    uuid: `Compendium.${SRD}.Actor.srdGuardian`,
    system: { details: { cr: 3, type: { value: "construct" } }, attributes: { ac: { value: 14 }, hp: { max: 40 } },
              traits: { size: "med", languages: { value: new Set() } } },
    items: [],
  };
  pack.getIndex = async opts => {
    const idx = await getIndex.call(pack, opts);
    return [...idx, { _id: guardian.id, name: guardian.name, type: "npc" }];
  };
  pack.getDocument = async id => (id === guardian.id ? guardian : getDocument.call(pack, id));
  try { return await fn(); } finally { pack.getIndex = getIndex; pack.getDocument = getDocument; }
}

test("R6: an exact name in a later pack beats a substring hit in an earlier one", async () => {
  const out = await withSrdGuardian(() => rules.monster("guardian"));
  assert.equal(out.name, "Guardian", "the SRD's exact Guardian, not the MM's Shield Guardian");
  assert.equal(out.pack, SRD);
});

test("R6: an exact name in an earlier pack still wins over the same name later", async () => {
  const out = await rules.monster("goblin");
  assert.equal(out.name, "Goblin");
  assert.equal(out.pack, "dnd-monster-manual.actors");
});

test("R6: with no exact name anywhere, the substring pass still answers in pack order", async () => {
  const out = await withSrdGuardian(() => rules.monster("shield"));
  assert.equal(out.name, "Shield Guardian");
  assert.equal(out.pack, "dnd-monster-manual.actors");
});
