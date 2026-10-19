// The summon library's pure rules (0.2.0, feedback Swrl5M / UQSJ0v / dkt5PG). Pure: no Foundry globals.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_ROOT, SUMMON_ORIGIN_KEY, libraryActorId, libraryFolderId, libraryFolderName, libraryOwnership, libraryRootId,
  shouldRelaySummon, stableId, summonAllowed,
} from "../creatures-core.mjs";

test("stableId: 16 Foundry id characters, the same for the same seed, different for another", () => {
  const a = stableId("pentaryn-creatures|actor|aPC|Compendium.x.Actor.hand|");
  assert.match(a, /^[A-Za-z0-9]{16}$/);
  assert.equal(stableId("pentaryn-creatures|actor|aPC|Compendium.x.Actor.hand|"), a);
  assert.notEqual(stableId("pentaryn-creatures|actor|aPC|Compendium.x.Actor.hane|"), a);
  assert.match(stableId(""), /^[A-Za-z0-9]{16}$/);
  const many = new Set(Array.from({ length: 2000 }, (_, i) => stableId(`seed-${i}`)));
  assert.equal(many.size, 2000, "no collision over 2000 seeds");
});

test("libraryActorId: per character and source; a linked source also keys on the item", () => {
  const base = { summonerId: "aPC", sourceUuid: "Compendium.x.Actor.hand" };
  assert.equal(libraryActorId(base), libraryActorId({ ...base }));
  assert.notEqual(libraryActorId(base), libraryActorId({ ...base, summonerId: "aMara" }), "each character has its own copy");
  assert.notEqual(libraryActorId(base), libraryActorId({ ...base, originUuid: "Actor.aPC.Item.i1" }));
  assert.equal(libraryActorId(base), libraryActorId({ ...base, originUuid: null }));
  assert.notEqual(libraryFolderId("aPC"), libraryFolderId("aMara"));
  assert.notEqual(libraryRootId(), libraryFolderId("aPC"));
});

test("libraryFolderName: the first name, the table's convention", () => {
  assert.equal(LIBRARY_ROOT, "PC Summons & Forms");
  assert.equal(libraryFolderName("Marwen Ashcroft"), "Marwen — summons & forms");
  assert.equal(libraryFolderName("  Talo "), "Talo — summons & forms");
  assert.equal(libraryFolderName(""), "Summons — summons & forms");
  assert.equal(libraryFolderName(null), "Summons — summons & forms");
});

test("libraryOwnership: default none; the character's owners and the sender own it; keys sorted", () => {
  assert.deepEqual(libraryOwnership({ default: 2, gm: 3, obs: 2, p1: 3 }, "p1"), { default: 0, gm: 3, p1: 3 });
  assert.deepEqual(libraryOwnership({ default: 0, zz: 3 }, "aa"), { default: 0, aa: 3, zz: 3 });
  assert.deepEqual(Object.keys(libraryOwnership({ zz: 3, mm: 3 }, "aa")), ["default", "aa", "mm", "zz"]);
  assert.deepEqual(libraryOwnership(null, "p1"), { default: 0, p1: 3 });
  assert.deepEqual(libraryOwnership(undefined, null), { default: 0 });
});

test("shouldRelaySummon: only a player without Create Actors, setting on, on dnd5e's summon call", () => {
  const yes = { isGM: false, canCreate: false, enabled: true, originKey: SUMMON_ORIGIN_KEY, originValue: "Actor.a.Item.i" };
  assert.equal(shouldRelaySummon(yes), true);
  assert.equal(shouldRelaySummon({ ...yes, enabled: undefined }), true, "unset reads as on");
  assert.equal(shouldRelaySummon({ ...yes, isGM: true }), false);
  assert.equal(shouldRelaySummon({ ...yes, canCreate: true }), false, "Trusted players import themselves (Marrith)");
  assert.equal(shouldRelaySummon({ ...yes, enabled: false }), false);
  assert.equal(shouldRelaySummon({ ...yes, originKey: "flags.other" }), false, "another caller of fetchExisting");
  assert.equal(shouldRelaySummon({ ...yes, originValue: "" }), false);
  assert.equal(shouldRelaySummon({ ...yes, originValue: undefined }), false);
  assert.equal(shouldRelaySummon(), false);
});

test("summonAllowed: a profile's uuid; a CR summon takes a compendium npc within CR and types", () => {
  const hand = "Compendium.world.summons.Actor.hand";
  const profiles = [{ mode: "", profiles: [{ uuid: hand, cr: null, types: [] }] }];
  const t = o => ({ uuid: hand, inPack: true, actorType: "npc", cr: 0, creatureType: "construct", ...o });
  assert.deepEqual(summonAllowed(profiles, t()), { ok: true });
  assert.equal(summonAllowed(profiles, t({ uuid: "Compendium.world.summons.Actor.dragon" })).ok, false);
  assert.equal(summonAllowed([], t()).ok, false, "no summon activity");
  assert.equal(summonAllowed(profiles, null).ok, false);

  const familiar = [{ mode: "cr", profiles: [{ uuid: null, cr: 0, types: ["beast"] }] }];
  const owl = { uuid: "Compendium.dnd5e.monsters.Actor.owl", inPack: true, actorType: "npc", cr: 0, creatureType: "beast" };
  assert.deepEqual(summonAllowed(familiar, owl), { ok: true }, "Find Familiar: a CR 0 beast");
  assert.equal(summonAllowed(familiar, { ...owl, cr: 0.125 }).ok, false, "over the CR");
  assert.equal(summonAllowed(familiar, { ...owl, creatureType: "humanoid" }).ok, false, "wrong type");
  assert.equal(summonAllowed(familiar, { ...owl, inPack: false }).ok, false, "a world actor is never a CR pick");
  assert.equal(summonAllowed(familiar, { ...owl, actorType: "character" }).ok, false);
  assert.equal(summonAllowed(familiar, { ...owl, cr: null }).ok, false, "no CR on the source");
  const anyType = [{ mode: "cr", profiles: [{ cr: 2, types: [] }] }];
  assert.equal(summonAllowed(anyType, { ...owl, cr: 2, creatureType: "fiend" }).ok, true);
  const noLimit = [{ mode: "cr", profiles: [{ cr: null, types: ["beast"] }] }];
  assert.equal(summonAllowed(noLimit, { ...owl, cr: 9 }).ok, true);
  assert.equal(summonAllowed([...profiles, ...familiar], owl).ok, true, "any activity on the item may allow it");
});
