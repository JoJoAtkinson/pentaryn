// lookup-edge-7 [declared]: monsters() deduped AFTER filtering, so when the Monster Manual's copy of
// a creature failed the filter the 2024 SRD's same-named copy took its place. Now a name an earlier
// pack has is answered from that pack or not at all; a later pack adds only names the earlier lack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);
// the SRD gains its own Shield Guardian at CR 5 (the MM's is CR 7)
const srd = F.game.packs.get("dnd5e.actors24");
const srdIndex = await srd.getIndex();
srdIndex.set("srdGuard", { _id: "srdGuard", name: "Shield Guardian", type: "npc",
  uuid: "Compendium.dnd5e.actors24.Actor.srdGuard",
  system: { details: { cr: 5, type: { value: "construct" } }, traits: { size: "lg" } } });
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

test("lookup-edge-7: an MM creature filtered out is not replaced by the SRD's copy", async () => {
  const out = await rules.monsters({ cr: 5 });
  assert.deepEqual(out.monsters.map(m => m.name), []);
  assert.equal(out.count, 0);
});

test("lookup-edge-7: the MM copy answers when it passes the filter", async () => {
  const out = await rules.monsters({ type: "construct" });
  assert.deepEqual(out.monsters.map(m => [m.name, m.cr, m.pack]), [["Shield Guardian", 7, "dnd-monster-manual.actors"]]);
});

test("lookup-edge-7: a name only the SRD has still comes from the SRD", async () => {
  const out = await rules.monsters({ cr: 2 });
  assert.deepEqual(out.monsters.map(m => [m.name, m.pack]), [["Ogre", "dnd5e.actors24"]]);
});

test("lookup-edge-7: with the SRD listed first, the SRD's copy is the one answered", async () => {
  const out = await rules.monsters({ cr: 5, packs: ["dnd5e.actors24", "dnd-monster-manual.actors"] });
  assert.deepEqual(out.monsters.map(m => [m.name, m.pack]), [["Shield Guardian", "dnd5e.actors24"]]);
  const seven = await rules.monsters({ cr: 7, packs: ["dnd5e.actors24", "dnd-monster-manual.actors"] });
  assert.deepEqual(seven.monsters, []);
});
