// The summon library glue (0.2.0, feedback Swrl5M / UQSJ0v / dkt5PG; 0.3.0 review fixes): dnd5e's
// Actor5e.fetchExisting wrapped at setup; a player without ACTOR_CREATE gets the active GM's copy through
// the relay query; dnd5e's own imports are filed on dnd5e.postSummon; fileLibrary() sweeps loose copies.
// The dnd5e stub mirrors dnd5e 6.0.6's fetchExisting (reuse an owned auto-imported copy from the same
// source, else throw for a user without ACTOR_CREATE). Synthetic data only.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { GM, MODULE, PLAYER, PLAYER2, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";
import { libraryActorId, libraryFolderId, libraryRootId } from "../creatures-core.mjs";

mock.timers.enable({ apis: ["setInterval"] });

const W = await setupWorld({ player: true });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
const game = F.game;

const CREATE_DENIED = "You must have 'Create New Actors' permission in order to summon directly from a compendium.";
const PACK = "world.summons";
const HAND = `Compendium.${PACK}.Actor.hand000000000000`;
const STEED = `Compendium.${PACK}.Actor.steed00000000000`;
const LIGHT = `Compendium.${PACK}.Actor.light00000000000`;
const OWL = `Compendium.dnd5e.monsters.Actor.owl0000000000000`;
const BEAR = `Compendium.dnd5e.monsters.Actor.bear000000000000`;
const SPY = `Compendium.dnd5e.monsters.Actor.spy0000000000000`;
const WOLF = `Compendium.dnd5e.monsters.Actor.wolf000000000000`;
const LICH = `Compendium.world.gm-secrets.Actor.lich000000000000`;
const FAM_ORIGINAL = "Compendium.dnd5e.spells.Item.findFamiliar0000";
const ORIGIN = "flags.dnd5e.summon.origin";

/* ── who may create actors (Player: no; the GM and a Trusted user: yes) ── */
const mayCreate = new Set([GM]);
for (const u of game.users) u.can = perm => (perm === "ACTOR_CREATE" ? u.isGM || mayCreate.has(u.id) : true);

/* ── compendiums: players observe the summons and monsters packs, never the GM's secrets ── */
const packs = new Map([[PACK, true], ["dnd5e.monsters", true], ["dnd5e.spells", true], ["world.gm-secrets", false]]);
game.packs = new Map([...packs].map(([id, open]) => [id, {
  testUserPermission: (user, level) => (user?.isGM ? true : open && ["LIMITED", "OBSERVER"].includes(level)),
}]));

/* ── compendium sources ── */
const packActor = (uuid, name, o = {}) => {
  const id = uuid.split(".").at(-1);
  const a = { documentName: "Actor", id, name, type: "npc", prototypeToken: { actorLink: false }, system: { details: { cr: 0, type: { value: "beast" } } }, flags: {}, items: [], ...o };
  Object.defineProperty(a, "uuid", { value: uuid, enumerable: false });
  Object.defineProperty(a, "pack", { value: uuid.split(".").slice(1, 3).join("."), enumerable: false });
  return a;
};
const summon = (mode, profiles) => ({ type: "summon", summon: { mode }, profiles, getRollData: () => ({}) });
const SOURCES = new Map([
  [HAND, packActor(HAND, "Mage Hand", { system: { details: { cr: 0, type: { value: "construct" } } } })],
  [STEED, packActor(STEED, "Phantom Steed", { prototypeToken: { actorLink: true } })],
  [LIGHT, packActor(LIGHT, "Light", { system: { details: { cr: 0, type: { value: "construct" } } } })],
  [OWL, packActor(OWL, "Owl")],
  [BEAR, packActor(BEAR, "Brown Bear", { system: { details: { cr: 1, type: { value: "beast" } } } })],
  [SPY, packActor(SPY, "Spy", { system: { details: { cr: 1, type: { value: "humanoid" } } } })],
  [WOLF, packActor(WOLF, "Wolf", { system: { details: { cr: 0.25, type: { value: "beast" } } } })],
  [LICH, packActor(LICH, "Lich", { system: { details: { cr: 21, type: { value: "undead" } } } })],
  // the compendium original of Find Familiar: a CR 0 beast, whatever the world copy says
  [FAM_ORIGINAL, { documentName: "Item", name: "Find Familiar", system: { activities: [summon("cr", [{ uuid: null, cr: 0, types: new Set(["beast"]) }])] } }],
]);
const baseFromUuid = globalThis.fromUuid;
globalThis.fromUuid = async uuid => SOURCES.get(uuid) ?? baseFromUuid(uuid);

/* ── the PC's summoning items (a Collection iterates its values) ── */
class Collection extends Map {
  *[Symbol.iterator]() {
    yield* this.values();
  }
}
const pc = game.actors.get("aPC");
const item = (id, name, activities, o = {}) => {
  const i = W.makeDoc("Item", { id, name, system: { activities }, ...o }, { parent: pc });
  i.actor = pc;
  return i;
};
pc.items = new Collection([
  ["iHand", item("iHand", "Mage Hand", [summon("", [{ uuid: HAND, types: new Set() }])])],
  ["iSteed", item("iSteed", "Find Steed", [summon("", [{ uuid: STEED, types: new Set() }])])],
  ["iLight", item("iLight", "Light", [summon("", [{ uuid: LIGHT, types: new Set() }])])],
  ["iFam", item("iFam", "Find Familiar", [summon("cr", [{ uuid: null, cr: 0, types: new Set(["beast"]) }])],
    { _stats: { compendiumSource: FAM_ORIGINAL } })],
  // a world item its owner edited: profiles pointing at things the GM never meant to hand out
  ["iEdit", item("iEdit", "Homebrew Summon", [summon("", [
    { uuid: LICH, types: new Set() }, { uuid: "Actor.aMara", types: new Set() }, { uuid: "Actor.aGob", types: new Set() },
  ]), summon("cr", [{ uuid: null, cr: 30, types: new Set() }])])],
]);
const itemUuid = id => pc.items.get(id).uuid;

/* ── world creates: v14.369 refuses a keepId create of an id that exists (the server throws) ── */
const created = [];
const createIn = (documentName, collection) => async (data, options = {}) => {
  created.push({ documentName, id: data._id, keepId: options.keepId === true, by: game.user.id });
  await Promise.resolve();
  if (data._id && game[collection].get(data._id)) throw new Error(`${documentName} ${data._id} already exists`);
  const { _id, ...rest } = structuredClone(data);
  const doc = W.makeDoc(documentName, { id: _id, ...rest }, { collection: game[collection] });
  doc.folder = rest.folder ? game.folders.get(rest.folder) ?? null : null;
  if (documentName === "Folder") doc.depth = (doc.folder?.depth ?? 0) + 1;
  game[collection].set(doc.id, doc);
  return doc;
};
/** Actor.updateDocuments: one batch, each update applied (a folder id becomes the Folder, as Foundry's getter does). */
const batches = [];
const updateDocuments = async updates => {
  batches.push(updates.map(u => ({ ...u })));
  for (const { _id, ...changes } of updates) {
    const doc = game.actors.get(_id);
    const { folder, ...rest } = changes;
    await doc.update(rest);
    if (folder !== undefined) doc.folder = game.folders.get(folder) ?? null;
  }
  return updates;
};
globalThis.Actor = { implementation: { create: createIn("Actor", "actors"), updateDocuments } };
globalThis.Folder = { implementation: { create: createIn("Folder", "folders") } };
game.actors.fromCompendium = (source, { keepId = false } = {}) => {
  const data = structuredClone({ ...source, _id: source.id });
  delete data.id;
  if (!keepId) delete data._id;
  delete data.pack;
  return { ...data, _stats: { compendiumSource: source.uuid } };
};
/** A copy dnd5e imported itself (a Trusted player or the GM): in the PC's folder, owned by the caster only. */
const dnd5eImport = (id, source, owners, o = {}) => {
  const a = W.makeDoc("Actor", {
    id, name: SOURCES.get(source)?.name ?? id, type: "npc", ownership: { default: 0, ...owners },
    prototypeToken: { actorLink: SOURCES.get(source)?.prototypeToken?.actorLink === true },
    system: structuredClone(SOURCES.get(source)?.system ?? {}), flags: { dnd5e: { isAutoImported: true } },
    _stats: { compendiumSource: source }, ...o,
  }, { collection: game.actors });
  a.folder = null;
  game.actors.set(id, a);
  return a;
};

/* ── dnd5e 6.0.6's Actor5e.fetchExisting, reduced to what the summon path does ── */
class Actor5e {
  static async fetchExisting(uuid, options = {}) {
    const { origin } = options;
    const actor = await fromUuid(uuid);
    if (!actor) throw new Error(`no actor ${uuid}`);
    const local = game.actors.find(a => a.flags?.dnd5e?.isAutoImported && a.testUserPermission(game.user, "OWNER")
      && (a._stats?.compendiumSource === uuid || a._stats?.duplicateSource === uuid)
      && (!a.prototypeToken?.actorLink || !origin || a.flags?.dnd5e?.summon?.origin === origin.value));
    if (local) return local;
    if (!game.user.can("ACTOR_CREATE")) throw new Error(CREATE_DENIED);
    return { imported: uuid };
  }
}
const originalFetch = Actor5e.fetchExisting;
globalThis.dnd5e = { documents: { Actor5e }, utils: { simplifyBonus: v => Number(v) } };
const fetch = (uuid, itemId) => dnd5e.documents.Actor5e.fetchExisting(uuid, {
  folderId: null, origin: { key: ORIGIN, value: itemUuid(itemId) },
});

/* ── the GM is online (headless); a query runs its handler as the GM, with the sender in ctx ── */
// the stub's own User#query is fixed; the GM is a shadowing copy with a query that runs as the GM
const gmUser = Object.create(game.users.get(GM));
game.users.set(GM, gmUser);
let gmOnline = true;
Object.defineProperty(gmUser, "active", { get: () => gmOnline, configurable: true });
const queries = [];
Object.defineProperty(gmUser, "query", {
  value: async (name, data, options) => {
    queries.push({ name, data: structuredClone(data), timeout: options?.timeout });
    const sender = game.user;
    F.become({ userId: GM });
    try {
      return await CONFIG.queries[name](data, { user: sender });
    } finally {
      F.become({ userId: sender.id });
    }
  },
  configurable: true,
});

await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
const api = () => game.pentaryn.creatures;
W.lines();

/** dnd5e's postSummon on this client, and the async listener's work (it is never awaited by Hooks). */
const postSummon = async (itemId, actorIds) => {
  Hooks.callAll("dnd5e.postSummon", { item: pc.items.get(itemId) }, {}, actorIds.map(actorId => ({ actorId })), {});
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
};

test("setup wraps Actor5e.fetchExisting directly, recorded with row creatures-summon-library", () => {
  assert.notEqual(Actor5e.fetchExisting, originalFetch);
  assert.equal(Actor5e.fetchExisting.__pentarynCreaturesSummon, true);
  const rows = api().describe().patches.map(p => [p.label, p.marker, p.adjustments, p.via]);
  assert.deepEqual(rows.find(r => r[0] === "Actor5e.fetchExisting"),
    ["Actor5e.fetchExisting", "__pentarynCreaturesSummon", "creatures-summon-library", "direct"]);
  assert.equal(api().status().summonPatched, "direct");
  assert.equal(api().status().summonLibrary, true);
  assert.equal(typeof CONFIG.queries[`${MODULE}.summonActor`], "function", "the relay is registered on the player's client too");
  assert.equal(typeof CONFIG.queries[`${MODULE}.fileLibrary`], "function");
});

test("Swrl5M: a Player summons Mage Hand from a compendium — the GM makes an owned copy in the library", async () => {
  const actor = await fetch(HAND, "iHand");
  const id = libraryActorId({ summonerId: "aPC", sourceUuid: HAND });
  assert.equal(actor?.id, id, "dnd5e gets the GM's copy");
  assert.equal(game.actors.get(id), actor);
  assert.deepEqual(queries.map(q => [q.name, q.data, q.timeout]),
    [[`${MODULE}.summonActor`, { uuid: HAND, item: itemUuid("iHand"), dryRun: false }, 15000]]);
  assert.deepEqual(actor.ownership, { default: 0, [PLAYER]: 3 });
  assert.equal(actor.flags.dnd5e.isAutoImported, true);
  assert.equal(actor.flags.dnd5e.summon, undefined, "an unlinked copy carries no origin");
  assert.equal(actor.flags[MODULE].library, "aPC");
  assert.deepEqual(actor._stats, { compendiumSource: HAND });
  assert.equal(actor.name, "Mage Hand");
  const root = game.folders.get(libraryRootId());
  const lib = game.folders.get(libraryFolderId("aPC"));
  assert.equal(root.name, "PC Summons & Forms");
  assert.equal(lib.name, "Talo — summons & forms");
  assert.equal(lib.folder, root);
  assert.equal(actor.folder, lib);
  assert.deepEqual(created.map(c => [c.documentName, c.keepId, c.by]), [["Folder", true, GM], ["Folder", true, GM], ["Actor", true, GM]]);
  assert.equal(game.user.id, PLAYER, "back on the player's client");
});

test("the next summon of the same creature is dnd5e's own reuse: no query, no create", async () => {
  queries.length = 0;
  created.length = 0;
  const again = await fetch(HAND, "iHand");
  assert.equal(again.id, libraryActorId({ summonerId: "aPC", sourceUuid: HAND }));
  assert.deepEqual(queries, []);
  assert.deepEqual(created, []);
});

test("finding 4: a linked source (a steed) keys on the item, carries dnd5e's summon origin, and dnd5e reuses it", async () => {
  created.length = 0;
  queries.length = 0;
  const steed = await fetch(STEED, "iSteed");
  assert.equal(steed.id, libraryActorId({ summonerId: "aPC", sourceUuid: STEED, originUuid: itemUuid("iSteed") }));
  assert.equal(steed.flags.dnd5e.summon.origin, itemUuid("iSteed"));
  assert.deepEqual(created.map(c => c.documentName), ["Actor"], "folders already there");
  const again = await fetch(STEED, "iSteed");
  assert.equal(again, steed, "dnd5e finds the linked copy by its origin");
  assert.equal(queries.length, 1, "the second summon needs no GM");
});

test("dkt5PG: Find Familiar's Compendium Browser pick — a CR 0 beast is copied; a CR 1 or a humanoid is refused", async () => {
  queries.length = 0;
  const owl = await fetch(OWL, "iFam");
  assert.equal(owl.name, "Owl");
  await assert.rejects(fetch(BEAR, "iFam"), /Could not summon: Brown Bear: that actor is not one this item's compendium original can summon \(Find Familiar\)/);
  await assert.rejects(fetch(SPY, "iFam"), /Could not summon: Spy/);
  assert.equal(game.actors.getName("Brown Bear"), undefined);
  assert.equal(queries.length, 3);
});

test("finding 1: an edited Find Familiar (CR 30) still copies only what its compendium original allows", async () => {
  const fam = pc.items.get("iFam").system.activities[0].profiles[0];
  fam.cr = 30;
  fam.types = new Set();
  try {
    await assert.rejects(fetch(BEAR, "iFam"), /compendium original can summon/);
  } finally {
    fam.cr = 0;
    fam.types = new Set(["beast"]);
  }
  assert.equal(game.actors.getName("Brown Bear"), undefined);
});

test("finding 1: an edited item never reaches a hidden pack, a player character or a world actor the sender cannot see", async () => {
  const lich = await api().summonActor({ uuid: LICH, item: itemUuid("iEdit") });
  assert.deepEqual([lich.ok, lich.code], [false, "REFUSED"]);
  assert.match(lich.reason, /gm-secrets.*cannot see that actor/);
  assert.doesNotMatch(lich.reason, /Lich/, "a refused source's name is not read back");
  const mara = await api().summonActor({ uuid: "Actor.aMara", item: itemUuid("iEdit") });
  assert.deepEqual([mara.ok, mara.code], [false, "REFUSED"]);
  assert.match(mara.reason, /a player character is never copied/);
  const gob = await api().summonActor({ uuid: "Actor.aGob", item: itemUuid("iEdit") });
  assert.deepEqual([gob.ok, gob.code], [false, "REFUSED"]);
  assert.match(gob.reason, /cannot see that actor/);
  const cr30 = await api().summonActor({ uuid: WOLF, item: itemUuid("iEdit") });
  assert.equal(cr30.ok, true, "a visible pack's CR 1/4 beast is what a player who may create actors could import anyway");
  assert.equal(game.actors.getName("Lich"), undefined);
  assert.equal(game.actors.filter(a => a.name === "Mara").length, 1);
});

test("refused: a source the item cannot summon, an item the sender does not own", async () => {
  await assert.rejects(fetch(SPY, "iHand"), /not one this item can summon \(Mage Hand\)/);
  const r = await api().summonActor({ uuid: HAND, item: itemUuid("iHand") });
  assert.equal(r.ok, true, "the owner may call the API directly");
  F.become({ userId: PLAYER2 });
  const other = await api().summonActor({ uuid: HAND, item: itemUuid("iHand") });
  F.become({ userId: PLAYER });
  assert.deepEqual([other.ok, other.code], [false, "REFUSED"]);
  assert.match(other.reason, /Wren does not own Talo/);
  const bad = await api().summonActor({ uuid: HAND });
  assert.deepEqual([bad.ok, bad.code], [false, "BAD_ARGS"]);
});

test("Trusted (may create actors): dnd5e's own import, never the relay", async () => {
  queries.length = 0;
  mayCreate.add(PLAYER);
  try {
    assert.deepEqual(await fetch(BEAR, "iFam"), { imported: BEAR });
  } finally {
    mayCreate.delete(PLAYER);
  }
  assert.deepEqual(queries, []);
});

test("another caller of fetchExisting (no summon origin) keeps dnd5e's error", async () => {
  queries.length = 0;
  await assert.rejects(dnd5e.documents.Actor5e.fetchExisting(BEAR, {}), { message: CREATE_DENIED });
  assert.deepEqual(queries, []);
});

test("finding 5: a summon's other dnd5e error is rethrown as it is, never relayed", async () => {
  queries.length = 0;
  const missing = `Compendium.${PACK}.Actor.missing000000000`;
  await assert.rejects(fetch(missing, "iHand"), err => {
    assert.equal(err.message, `no actor ${missing}`);
    assert.equal(err.code, undefined);
    return true;
  });
  assert.deepEqual(queries, []);
});

test("no GM online: the player is told a GM must be logged in, once per new creature", async () => {
  W.lines();
  gmOnline = false;
  try {
    await assert.rejects(fetch(SPY, "iSteed"), { code: "NO_GM", message: /^Could not summon: a GM must be logged in/ });
  } finally {
    gmOnline = true;
  }
  assert.deepEqual(W.lines().map(l => l.slice(0, 2)), [["warn", `${MODULE} | summon library: the GM did not make the copy`]]);
});

test("setting off: dnd5e's refusal as before", async () => {
  queries.length = 0;
  await F.game.settings.set(MODULE, "summonLibrary", false);
  try {
    await assert.rejects(fetch(SPY, "iFam"), { message: CREATE_DENIED });
  } finally {
    await F.game.settings.set(MODULE, "summonLibrary", true);
  }
  assert.deepEqual(queries, []);
});

test("finding 3: two GM tabs answer one relay — the second create is refused, that tab answers with the first's copy", async () => {
  F.become({ userId: GM });
  created.length = 0;
  W.lines();
  const mara = game.actors.get("aMara");
  mara.items = new Collection([["iH2", Object.assign(W.makeDoc("Item", { id: "iH2", name: "Mage Hand", system: { activities: [summon("", [{ uuid: HAND, types: new Set() }])] } }, { parent: mara }), { actor: mara })]]);
  const wren = game.users.get(PLAYER2);
  const q = { uuid: HAND, item: mara.items.get("iH2").uuid };
  const handler = CONFIG.queries[`${MODULE}.summonActor`];
  const [a, b] = await Promise.all([handler(q, { user: wren }), handler(q, { user: wren })]);
  assert.deepEqual([a.ok, b.ok], [true, true], "neither tab answers with the refused create");
  assert.equal(a.actorId, b.actorId);
  assert.deepEqual([a.created, b.created].sort(), [false, true]);
  const actors = created.filter(c => c.documentName === "Actor").map(c => c.id);
  assert.equal(actors.length, 2, "both tabs looked before either created");
  assert.ok(actors.every(id => id === a.actorId), "every create uses the one id");
  const folders = created.filter(c => c.documentName === "Folder").map(c => c.id);
  assert.deepEqual(folders, [libraryFolderId("aMara"), libraryFolderId("aMara")], "the folder race too: one refused, found");
  assert.equal(game.actors.filter(x => x.id === a.actorId).length, 1);
  assert.deepEqual(game.actors.get(a.actorId).ownership, { default: 0, [PLAYER2]: 3 });
  assert.equal(game.folders.get(libraryFolderId("aMara")).name, "Mara — summons & forms");
  assert.equal(W.lines().filter(l => l[0] === "warn").length, 0, "no folder warning: the refused tab found it");
  const rook = game.users.get(PLAYER);
  const dry = await api().summonActor({ uuid: BEAR, item: itemUuid("iSteed"), dryRun: true }, { user: rook });
  assert.deepEqual([dry.ok, dry.code], [false, "REFUSED"], "the steed item cannot summon a bear, dry run or not");
  F.become({ userId: PLAYER });
});

test("finding 2: a Trusted player's own dnd5e import is filed after the summon (through the GM)", async () => {
  queries.length = 0;
  const copy = dnd5eImport("impLight0000001", LIGHT, { [PLAYER]: 3 });
  game.actors.get("aPC").ownership[PLAYER2] = 3;   // a co-owner of the character
  try {
    await postSummon("iLight", [copy.id, copy.id]);
  } finally {
    delete game.actors.get("aPC").ownership[PLAYER2];
  }
  assert.deepEqual(queries.map(q => [q.name, q.data]),
    [[`${MODULE}.fileLibrary`, { actor: copy.id, item: itemUuid("iLight"), dryRun: false }]], "one query per copy");
  assert.equal(copy.folder, game.folders.get(libraryFolderId("aPC")));
  assert.equal(copy.flags[MODULE].library, "aPC");
  assert.deepEqual(copy.ownership, { default: 0, [PLAYER]: 3, [PLAYER2]: 3 });
  queries.length = 0;
  await postSummon("iLight", [copy.id]);
  assert.deepEqual(queries, [], "a filed copy asks nothing");
});

test("finding 2: the GM's own dnd5e import for a player's character is filed on the GM's client, with a linked copy's origin", async () => {
  F.become({ userId: GM });
  queries.length = 0;
  batches.length = 0;
  const copy = dnd5eImport("impSteed0000001", STEED, {});
  await postSummon("iSteed", [copy.id]);
  F.become({ userId: PLAYER });
  assert.deepEqual(queries, []);
  assert.equal(batches.length, 1);
  assert.equal(copy.folder?.id, libraryFolderId("aPC"));
  assert.equal(copy.flags.dnd5e.summon.origin, itemUuid("iSteed"), "dnd5e can now reuse the linked copy");
  assert.deepEqual(copy.ownership, { default: 0, [PLAYER]: 3 });
});

test("finding 2: a player may file only a copy they own, for an item they own", async () => {
  const theirs = dnd5eImport("impHandWren0001", HAND, { [PLAYER2]: 3 });
  const r = await api().fileLibrary({ actor: theirs.id, item: itemUuid("iHand") });
  assert.deepEqual([r.ok, r.code], [false, "REFUSED"]);
  assert.match(r.reason, /Rook does not own Mage Hand/);
  const sweep = await api().fileLibrary();
  assert.deepEqual([sweep.ok, sweep.code], [false, "BAD_ARGS"], "a player never sweeps");
  game.actors.delete(theirs.id);
});

test("finding 2: fileLibrary() — the GM's sweep files loose copies (dry run first, one batch, idempotent)", async () => {
  dnd5eImport("looseHand000001", HAND, { [PLAYER]: 3 });                        // Rook's Talo: Mage Hand
  dnd5eImport("looseOwl0000001", OWL, { [PLAYER]: 3 }, { folder: null });       // Talo's Find Familiar (CR 0 beast)
  dnd5eImport("orphanSpirit001", BEAR, { deletedUser00001: 3 });                // its owner is gone
  dnd5eImport("encounterSpy001", SPY, {});                                       // a GM encounter copy
  F.become({ userId: GM });
  try {
    batches.length = 0;
    const calls = F.calls.length;
    const dry = await api().fileLibrary({ dryRun: true });
    assert.equal(dry.ok, true);
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.filed.map(f => [f.id, f.summoner, f.folder]),
      [["looseHand000001", "Talo", "Talo — summons & forms"], ["looseOwl0000001", "Talo", "Talo — summons & forms"]]);
    assert.deepEqual(dry.filed[0].changes, ["folder", `flags.${MODULE}.library`]);
    assert.deepEqual(dry.unresolved.map(u => [u.id, u.reason]),
      [["orphanSpirit001", "no player owns the copy"], ["encounterSpy001", "no player owns the copy"]]);
    assert.equal(batches.length, 0);
    assert.equal(F.calls.length, calls, "a dry run writes nothing");

    const real = await api().fileLibrary();
    assert.deepEqual(real.filed.map(f => f.id), ["looseHand000001", "looseOwl0000001"]);
    assert.equal(batches.length, 1, "one batch");
    assert.deepEqual(batches[0].map(u => u._id), ["looseHand000001", "looseOwl0000001"]);
    assert.equal(game.actors.get("looseOwl0000001").folder?.id, libraryFolderId("aPC"));

    const again = await api().fileLibrary();
    assert.deepEqual(again.filed, [], "a second sweep writes nothing");
    assert.equal(batches.length, 1);
    assert.ok(again.already >= 4);

    const byHand = await api().fileLibrary({ actor: "encounterSpy001", summoner: "Mara", dryRun: true });
    assert.deepEqual(byHand.filed.map(f => [f.summoner, f.folder]), [["Mara", "Mara — summons & forms"]], "the GM names the summoner");
  } finally {
    F.become({ userId: PLAYER });
  }
});

test("library(ref): the character's copies, by name", () => {
  const lib = api().library("Talo");
  assert.deepEqual(lib.actor, { id: "aPC", name: "Talo" });
  assert.equal(lib.folder.name, "Talo — summons & forms");
  assert.deepEqual(lib.summons.map(s => [s.name, s.source]), [
    ["Light", LIGHT], ["Mage Hand", HAND], ["Mage Hand", HAND], ["Owl", OWL], ["Owl", OWL],
    ["Phantom Steed", STEED], ["Phantom Steed", STEED],
    ["Wolf", WOLF],
  ]);
});

test("uninstall restores dnd5e's fetchExisting", () => {
  api().uninstall();
  assert.equal(Actor5e.fetchExisting, originalFetch);
});
