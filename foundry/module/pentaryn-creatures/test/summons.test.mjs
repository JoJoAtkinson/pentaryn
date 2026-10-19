// The summon library glue (0.2.0, feedback Swrl5M / UQSJ0v / dkt5PG): dnd5e's Actor5e.fetchExisting
// wrapped at setup; a player without ACTOR_CREATE gets the active GM's copy through the relay query.
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
const OWL = `Compendium.dnd5e.monsters.Actor.owl0000000000000`;
const BEAR = `Compendium.dnd5e.monsters.Actor.bear000000000000`;
const SPY = `Compendium.dnd5e.monsters.Actor.spy0000000000000`;
const ORIGIN = "flags.dnd5e.summon.origin";

/* ── who may create actors (Player: no; the GM and a Trusted user: yes) ── */
const mayCreate = new Set([GM]);
for (const u of game.users) u.can = perm => (perm === "ACTOR_CREATE" ? u.isGM || mayCreate.has(u.id) : true);

/* ── compendium sources ── */
const packActor = (uuid, name, o = {}) => {
  const id = uuid.split(".").at(-1);
  const a = { documentName: "Actor", id, name, type: "npc", prototypeToken: { actorLink: false }, system: { details: { cr: 0, type: { value: "beast" } } }, flags: {}, items: [], ...o };
  Object.defineProperty(a, "uuid", { value: uuid, enumerable: false });
  Object.defineProperty(a, "pack", { value: uuid.split(".").slice(1, 3).join("."), enumerable: false });
  return a;
};
const SOURCES = new Map([
  [HAND, packActor(HAND, "Mage Hand", { system: { details: { cr: 0, type: { value: "construct" } } } })],
  [STEED, packActor(STEED, "Phantom Steed", { prototypeToken: { actorLink: true } })],
  [OWL, packActor(OWL, "Owl")],
  [BEAR, packActor(BEAR, "Brown Bear", { system: { details: { cr: 1, type: { value: "beast" } } } })],
  [SPY, packActor(SPY, "Spy", { system: { details: { cr: 1, type: { value: "humanoid" } } } })],
]);
const baseFromUuid = globalThis.fromUuid;
globalThis.fromUuid = async uuid => SOURCES.get(uuid) ?? baseFromUuid(uuid);

/* ── the PC's summoning items ── */
const pc = game.actors.get("aPC");
const item = (id, name, activities) => {
  const i = W.makeDoc("Item", { id, name, system: { activities } }, { parent: pc });
  i.actor = pc;
  return i;
};
const summon = (mode, profiles) => ({ type: "summon", summon: { mode }, profiles, getRollData: () => ({}) });
pc.items = new Map([
  ["iHand", item("iHand", "Mage Hand", [summon("", [{ uuid: HAND, types: new Set() }])])],
  ["iSteed", item("iSteed", "Find Steed", [summon("", [{ uuid: STEED, types: new Set() }])])],
  ["iFam", item("iFam", "Find Familiar", [summon("cr", [{ uuid: null, cr: 0, types: new Set(["beast"]) }])])],
]);
const itemUuid = id => pc.items.get(id).uuid;

/* ── world creates: an Actor / Folder create with keepId and an existing _id replaces it (v14.369) ── */
const created = [];
const createIn = (documentName, collection) => async (data, options = {}) => {
  created.push({ documentName, id: data._id, keepId: options.keepId === true, by: game.user.id });
  const { _id, ...rest } = structuredClone(data);
  const doc = W.makeDoc(documentName, { id: _id, ...rest }, { collection: game[collection] });
  if (documentName === "Folder") {
    doc.folder = rest.folder ? game.folders.get(rest.folder) ?? null : null;
    doc.depth = (doc.folder?.depth ?? 0) + 1;
  } else {
    doc.folder = rest.folder ? game.folders.get(rest.folder) ?? null : null;
  }
  game[collection].set(doc.id, doc);
  return doc;
};
globalThis.Actor = { implementation: { create: createIn("Actor", "actors") } };
globalThis.Folder = { implementation: { create: createIn("Folder", "folders") } };
game.actors.fromCompendium = (source, { keepId = false } = {}) => {
  const data = structuredClone({ ...source, _id: source.id });
  delete data.id;
  if (!keepId) delete data._id;
  delete data.pack;
  return { ...data, _stats: { compendiumSource: source.uuid } };
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

test("setup wraps Actor5e.fetchExisting directly, recorded with row creatures-summon-library", () => {
  assert.notEqual(Actor5e.fetchExisting, originalFetch);
  assert.equal(Actor5e.fetchExisting.__pentarynCreaturesSummon, true);
  const rows = api().describe().patches.map(p => [p.label, p.marker, p.adjustments, p.via]);
  assert.deepEqual(rows.find(r => r[0] === "Actor5e.fetchExisting"),
    ["Actor5e.fetchExisting", "__pentarynCreaturesSummon", "creatures-summon-library", "direct"]);
  assert.equal(api().status().summonPatched, "direct");
  assert.equal(api().status().summonLibrary, true);
  assert.equal(typeof CONFIG.queries[`${MODULE}.summonActor`], "function", "the relay is registered on the player's client too");
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

test("a linked source (a steed) keys on the item too; the library folder is reused", async () => {
  created.length = 0;
  const steed = await fetch(STEED, "iSteed");
  assert.equal(steed.id, libraryActorId({ summonerId: "aPC", sourceUuid: STEED, originUuid: itemUuid("iSteed") }));
  assert.deepEqual(created.map(c => c.documentName), ["Actor"], "folders already there");
});

test("dkt5PG: Find Familiar's Compendium Browser pick — a CR 0 beast is copied; a CR 1 or a humanoid is refused", async () => {
  queries.length = 0;
  const owl = await fetch(OWL, "iFam");
  assert.equal(owl.name, "Owl");
  await assert.rejects(fetch(BEAR, "iFam"), /Could not summon: Brown Bear: that actor is not one this item can summon \(Find Familiar\)/);
  await assert.rejects(fetch(SPY, "iFam"), /Could not summon: Spy/);
  assert.equal(game.actors.getName("Brown Bear"), undefined);
  assert.equal(queries.length, 3);
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

test("no GM online: the player is told a GM must be logged in, once per new creature", async () => {
  W.lines();
  gmOnline = false;
  try {
    await assert.rejects(fetch(BEAR, "iSteed"), { code: "NO_GM", message: /^Could not summon: a GM must be logged in/ });
  } finally {
    gmOnline = true;
  }
  assert.deepEqual(W.lines().map(l => l.slice(0, 2)), [["warn", `${MODULE} | summon library: the GM did not make the copy`]]);
});

test("setting off: dnd5e's refusal as before", async () => {
  queries.length = 0;
  await F.game.settings.set(MODULE, "summonLibrary", false);
  try {
    await assert.rejects(fetch(BEAR, "iFam"), { message: CREATE_DENIED });
  } finally {
    await F.game.settings.set(MODULE, "summonLibrary", true);
  }
  assert.deepEqual(queries, []);
});

test("two GM tabs answer one relay: both create the same _id, one actor remains (deterministic id)", async () => {
  F.become({ userId: GM });
  created.length = 0;
  const rook = game.users.get(PLAYER);
  const opts = { uuid: BEAR, item: itemUuid("iSteed") };
  // Find Steed's activity cannot summon a bear: use Mage Hand's source on a fresh character instead
  const mara = game.actors.get("aMara");
  mara.items = new Map([["iH2", Object.assign(W.makeDoc("Item", { id: "iH2", name: "Mage Hand", system: { activities: [summon("", [{ uuid: HAND, types: new Set() }])] } }, { parent: mara }), { actor: mara })]]);
  const wren = game.users.get(PLAYER2);
  const q = { uuid: HAND, item: mara.items.get("iH2").uuid };
  const handler = CONFIG.queries[`${MODULE}.summonActor`];
  const [a, b] = await Promise.all([handler(q, { user: wren }), handler(q, { user: wren })]);
  assert.equal(a.actorId, b.actorId);
  const actors = created.filter(c => c.documentName === "Actor").map(c => c.id);
  assert.equal(actors.length, 2, "both tabs looked before either created");
  assert.ok(actors.every(id => id === a.actorId), "every create uses the one id");
  assert.equal(game.actors.filter(x => x.id === a.actorId).length, 1);
  assert.deepEqual(game.actors.get(a.actorId).ownership, { default: 0, [PLAYER2]: 3 });
  assert.equal(game.folders.get(libraryFolderId("aMara")).name, "Mara — summons & forms");
  const dry = await api().summonActor({ ...opts, dryRun: true }, { user: rook });
  assert.deepEqual([dry.ok, dry.code], [false, "REFUSED"], "the steed item cannot summon a bear, dry run or not");
  F.become({ userId: PLAYER });
});

test("library(ref): the character's copies, by name", () => {
  const lib = api().library("Talo");
  assert.deepEqual(lib.actor, { id: "aPC", name: "Talo" });
  assert.equal(lib.folder.name, "Talo — summons & forms");
  assert.deepEqual(lib.summons.map(s => [s.name, s.source]), [["Mage Hand", HAND], ["Owl", OWL], ["Phantom Steed", STEED]]);
});

test("uninstall restores dnd5e's fetchExisting", () => {
  api().uninstall();
  assert.equal(Actor5e.fetchExisting, originalFetch);
});
