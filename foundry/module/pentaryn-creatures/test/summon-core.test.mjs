// The summon library's pure rules (0.2.0, feedback Swrl5M / UQSJ0v / dkt5PG). Pure: no Foundry globals.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_ROOT, SUMMON_ORIGIN_KEY, libraryActorId, libraryFolderId, libraryFolderName, libraryOwnership, libraryRootId,
  isSummonCopy, libraryFiling, pickSummoner, shouldRelaySummon, stableId, summonAllowed, summonAllowedFrom,
  summonSourceRefusal,
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
  const yes = { refused: true, isGM: false, canCreate: false, enabled: true, originKey: SUMMON_ORIGIN_KEY, originValue: "Actor.a.Item.i" };
  assert.equal(shouldRelaySummon(yes), true);
  assert.equal(shouldRelaySummon({ ...yes, enabled: undefined }), true, "unset reads as on");
  assert.equal(shouldRelaySummon({ ...yes, refused: false }), false, "only dnd5e's Create New Actors refusal (finding 5)");
  assert.equal(shouldRelaySummon({ ...yes, refused: undefined }), false);
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

test("summonSourceRefusal (0.3.0, finding 1): never a PC, only a source the sender can already see", () => {
  assert.equal(summonSourceRefusal({ actorType: "npc", visible: true }), null);
  assert.match(summonSourceRefusal({ actorType: "character", visible: true }), /player character/);
  assert.match(summonSourceRefusal({ actorType: "npc", visible: false }), /cannot see/);
  assert.match(summonSourceRefusal({ actorType: "npc" }), /cannot see/, "unknown visibility refuses");
  assert.match(summonSourceRefusal(), /cannot see/);
});

test("summonAllowedFrom (finding 1): the compendium original decides a pack source; the world item only adds world actors", () => {
  const owl = { uuid: "Compendium.dnd5e.monsters.Actor.owl", inPack: true, actorType: "npc", cr: 0, creatureType: "beast" };
  const bear = { ...owl, uuid: "Compendium.dnd5e.monsters.Actor.bear", cr: 1 };
  const original = [{ mode: "cr", profiles: [{ cr: 0, types: ["beast"] }] }];
  const edited = [{ mode: "cr", profiles: [{ cr: 30, types: [] }] }];
  assert.deepEqual(summonAllowedFrom({ original, world: edited }, owl), { ok: true });
  assert.equal(summonAllowedFrom({ original, world: edited }, bear).ok, false, "an edited CR does not count");
  assert.equal(summonAllowedFrom({ original: null, world: edited }, bear).ok, true, "no original: the world item decides");
  assert.equal(summonAllowedFrom({ original: [], world: edited }, bear).ok, true);
  const steed = { uuid: "Actor.steed", inPack: false, actorType: "npc", cr: 0, creatureType: "celestial" };
  const pointer = [{ mode: "", profiles: [{ uuid: "Actor.steed" }] }];
  assert.equal(summonAllowedFrom({ original, world: pointer }, steed).ok, true, "the GM's world pointer still works");
  assert.equal(summonAllowedFrom({ original, world: [] }, steed).ok, false);
  assert.equal(summonAllowedFrom(undefined, owl).ok, false);
});

test("isSummonCopy: auto-imported with a source", () => {
  assert.equal(isSummonCopy({ autoImported: true, source: "Compendium.x.Actor.y" }), true);
  assert.equal(isSummonCopy({ autoImported: false, source: "Compendium.x.Actor.y" }), false);
  assert.equal(isSummonCopy({ autoImported: true, source: null }), false);
  assert.equal(isSummonCopy({ autoImported: true, source: "" }), false);
  assert.equal(isSummonCopy(null), false);
});

test("libraryFiling (finding 2): folder, flag, owners added never removed, a linked copy's origin; null when filed", () => {
  const copy = { folderId: "pcFolder", ownership: { default: 0, p1: 3 }, library: null, linked: false, origin: null };
  const to = { summonerId: "aPC", summonerOwnership: { default: 0, gm: 3, p1: 3, p2: 3, obs: 2 }, folderId: "lib" };
  assert.deepEqual(libraryFiling(copy, to), {
    folder: "lib", "flags.pentaryn-creatures.library": "aPC", "ownership.gm": 3, "ownership.p2": 3,
  });
  const filed = { ...copy, folderId: "lib", library: "aPC", ownership: { default: 0, gm: 3, p1: 3, p2: 3, extra: 3 } };
  assert.equal(libraryFiling(filed, to), null, "already filed: nothing, and an extra owner is kept");
  assert.deepEqual(libraryFiling({ ...filed, linked: true }, { ...to, originUuid: "Actor.aPC.Item.i" }),
    { [SUMMON_ORIGIN_KEY]: "Actor.aPC.Item.i" });
  assert.equal(libraryFiling({ ...filed, linked: true, origin: "Actor.aPC.Item.i" }, { ...to, originUuid: "Actor.aPC.Item.i" }), null);
  assert.equal(libraryFiling(filed, { ...to, originUuid: "Actor.aPC.Item.i" }), null, "an unlinked copy carries no origin");
  assert.equal(libraryFiling({ ...filed, folderId: "x" }, { ...to, folderId: null }), null, "no folder: it stays");
  assert.equal(libraryFiling(null, to), null);
  assert.equal(libraryFiling(copy, {}), null);
});

test("pickSummoner (the sweep): the one character that can summon it and shares an owner", () => {
  const c = (id, owners, canSummon = true) => ({ id, owners, canSummon });
  assert.deepEqual(pickSummoner({ copyOwners: ["p1"], candidates: [c("aPC", ["p1"]), c("aMara", ["p2"])] }), { id: "aPC" });
  assert.deepEqual(pickSummoner({ copyOwners: ["p1"], candidates: [c("aPC", ["p1"], false), c("aAlt", ["p1"])] }), { id: "aAlt" });
  assert.match(pickSummoner({ copyOwners: [], candidates: [c("aPC", ["p1"])] }).reason, /no player owns/);
  assert.match(pickSummoner({ copyOwners: ["p1"], candidates: [c("aMara", ["p2"])] }).reason, /no character/);
  assert.match(pickSummoner({ copyOwners: ["p1"], candidates: [c("b", ["p1"]), c("a", ["p1"])] }).reason, /more than one.*\(a, b\)/);
  assert.match(pickSummoner().reason, /no player owns/);
});
