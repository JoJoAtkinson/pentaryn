/**
 * Characterisation (prompts checkpoint, wave 3; guide step 3): model.mjs and los.mjs against the
 * stub world — the scene items table (prompts, scaffolding, piles, characters, npcs, notes, a
 * hotspot's own light, tiles; prompts-lookup-23's host rules), the token geometry fallback
 * (prompts-lookup-17), scene facts with wall thresholds, doors and levels (prompts-lookup-22), hex
 * grids, the side panel, `@Embed` resolution, and the sight model's core / fallback paths.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addScene, captureConsole, MODULE } from "./fixtures/world.mjs";
import { makeDoc, StubCollection } from "./kit/foundry-stub.mjs";

const F = await installWorld();
const M = await import("../model.mjs");
const L = await import("../los.mjs");

const prov = (markerId, call = "pm-0001", extra = {}) => ({ prompt: `built from ${markerId}`, size: "mid", sceneId: "s2", markerId, call, pid: "p1", at: 1, kind: "npc", note: "", ...extra });

/* actors for the host scene */
const folderTemp = makeDoc("Folder", { id: "folderTemp000001", name: "Temp Markers", type: "Actor", folder: null });
const folderUnder = makeDoc("Folder", { id: "folderUnder00001", name: "Odds", type: "Actor", folder: F.folder });
F.addActor({ id: "actorMarkerRed01", name: "Marker · red", type: "npc" });
F.addActor({ id: "actorTempMark001", name: "Pin", type: "npc", folder: folderTemp });
F.addActor({ id: "actorUnderPM0001", name: "Odd one", type: "npc", folder: folderUnder, system: { details: { type: { value: "beast" } }, traits: { size: "sm" } } });
F.addActor({ id: "actorPile0000001", name: "Chest", type: "npc", flags: { "item-piles": { data: { enabled: true, description: "<p>An iron chest.</p>" } } },
  items: [{ id: "itemGold00000001", name: "Gold", type: "loot", system: { quantity: 30, price: { value: 1, denomination: "gp" } } },
    { id: "itemSword0000001", name: "Sword", type: "weapon", system: { rarity: "" } }] });
F.addActor({ id: "actorHero0000001", name: "Hero", type: "character",
  system: { details: { race: { name: "Elf" }, biography: { value: "A hero." } }, traits: { size: "med" }, attributes: { ac: { value: 15 }, hp: { value: 20, max: 24 } } },
  items: [{ id: "itemClassWiz0001", name: "Wizard", type: "class", system: { levels: 3, identifier: "wizard" } },
    { id: "itemSubclass0001", name: "Evoker", type: "subclass", system: { classIdentifier: "wizard" } },
    { id: "itemPotion000001", name: "Potion of Healing", type: "consumable", system: { rarity: "common" } }] });
F.addActor({ id: "actorOrc00000001", name: "Orc", type: "npc",
  system: { details: { cr: 0.5, type: { value: "humanoid", subtype: "orc" }, biography: { value: "<p>Base orc text.</p>" } }, traits: { size: "lg" },
    attributes: { ac: { value: 13 }, hp: { value: 15, max: 15 } } },
  prototypeToken: { disposition: -1 },
  items: [{ id: "itemAxe000000001", name: "Greataxe", type: "weapon", system: { rarity: "uncommon" }, _source: { system: { rarity: "uncommon" } } },
    { id: "itemRing00000001", name: "Ring", type: "equipment", system: { rarity: "rare", identified: false, attunement: "required", unidentified: { name: "Plain ring" } },
      _source: { name: "Ring of Protection", system: { rarity: "rare", identified: false, attunement: "required", unidentified: { name: "Plain ring" } } } }] });
F.addActor({ id: "actorStock000001", name: "Ogre", type: "npc", system: { details: { cr: 2, type: { value: "custom", custom: "Big Lug" },
  biography: { value: "@Embed[Compendium.dnd-monster-manual.content.JournalEntry.x.JournalEntryPage.y]" } } } });

const entry = makeDoc("JournalEntry", { id: "entryNote0000001", name: "Letter", flags: { [MODULE]: { provenance: prov("mNote", "pm-0001", { kind: "note" }) } } });
Object.defineProperty(entry, "pages", { value: new StubCollection([makeDoc("JournalEntryPage", { id: "pageNote00000001", name: "Letter p1", text: { content: "<p>Dear friend</p>" } })]), enumerable: false });
F.game.journal.set(entry.id, entry);

const s2 = addScene(F, {
  id: "s2", name: "ZZ Hosts", navName: "", navigation: true, navOrder: 2, description: "<p>Host <b>table</b></p>",
  tokens: [
    { id: "p1", name: "Prompt · mid", actorId: "markerActormid00", x: 100, y: 100, flags: { [MODULE]: { marker: "mid", prompt: "a crate", updatedAt: 5 } }, hidden: true },
    { id: "scaf1", name: "Red", actorId: "actorMarkerRed01", x: 0, y: 0 },
    { id: "scaf2", name: "Pin", actorId: "actorTempMark001", x: 0, y: 0 },
    { id: "odd", name: "Odd one", actorId: "actorUnderPM0001", x: 300, y: 100 },
    { id: "pile", name: "Chest", actorId: "actorPile0000001", x: 500, y: 100, flags: { [MODULE]: { provenance: prov("mPile") } } },
    { id: "hero", name: "Hero", actorId: "actorHero0000001", x: 700, y: 100, actorLink: true, disposition: 1 },
    { id: "orc1", name: "Orc", actorId: "actorOrc00000001", x: 100, y: 300, disposition: -1, actor: null },
    { id: "orc2", name: "Orc", actorId: "actorOrc00000001", x: 300, y: 300, disposition: 0 },
    { id: "ogre", name: "Ogre", actorId: "actorStock000001", x: 500, y: 300, flags: { [MODULE]: { provenance: prov("mOgre") } } },
    { id: "ghost", name: "", x: 700, y: 300 }
  ],
  notes: [
    { id: "noteProv00000001", x: 150, y: 550, entryId: "entryNote0000001", pageId: "pageNote00000001", text: "" },
    { id: "noteBare00000001", x: 350, y: 550, text: "A sign", texture: { src: "" } }
  ],
  lights: [
    { id: "lightHost0000001", x: 525, y: 125, config: { dim: 10, color: "#ff0" }, flags: { [MODULE]: { provenance: prov("mPile") } } },
    { id: "lightOwn00000001", x: 900, y: 900, config: { toObject: () => ({ bright: 5 }) }, hidden: true, flags: { [MODULE]: { provenance: prov("mPile", "pm-0002") } } },
    { id: "lightBare0000001", x: 50, y: 50, config: { dim: 5 } }
  ],
  tiles: [
    { id: "tileProv00000001", x: 1000, y: 0, width: 200, height: 100, texture: { src: "maps/rug.webp" }, flags: { [MODULE]: { provenance: prov("mTile") } } },
    { id: "tileBare00000001", x: 1200, y: 0, width: 100, height: 100, texture: { src: "x.webp" } }
  ]
});
// orc1's own (unlinked, delta) actor: same base, its own biography
Object.defineProperty(s2.tokens.get("orc1"), "actor", { value: { ...F.game.actors.get("actorOrc00000001"), items: F.game.actors.get("actorOrc00000001").items,
  system: { ...F.game.actors.get("actorOrc00000001").system, details: { ...F.game.actors.get("actorOrc00000001").system.details, biography: { value: "<p>Orc one's own text.</p>" } } } } });
s2.tokens.get("ghost").actorId = null;
// Foundry's Note#entry getter
Object.defineProperty(s2.notes.get("noteProv00000001"), "entry", { get: () => F.game.journal.get("entryNote0000001"), enumerable: false });

/** Items without the document, for goldens. */
const plainItems = items => items.map(({ doc, ...rest }) => rest);

test("sceneItems: the host table (golden scene-items)", () => {
  const items = M.sceneItems(s2);
  pinJSON("scene-items", plainItems(items), import.meta.url);
  assert.deepEqual(items.map(i => i.key), ["Token.p1", "Token.odd", "Token.pile", "Token.hero", "Token.orc1", "Token.orc2", "Token.ogre", "Token.ghost",
    "Note.noteProv00000001", "Note.noteBare00000001", "AmbientLight.lightOwn00000001", "Tile.tileProv00000001"]);
});

test("sceneItems: builtWithoutProvenance false keeps prompts and the built things this system stamped", () => {
  assert.deepEqual(M.sceneItems(s2, { builtWithoutProvenance: false }).map(i => i.key),
    ["Token.p1", "Token.pile", "Token.ogre", "Note.noteProv00000001", "AmbientLight.lightOwn00000001", "Tile.tileProv00000001"]);
});

test("prompts-lookup-17: a token whose core geometry calls throw falls back to its grid rectangle", () => {
  const tok = { x: 0, y: 0, width: 1, height: 1, elevation: 0, getSize() { throw 1; }, getMovementOrigin() { throw 1; } };
  const s = addScene(F, { id: "sGeo", name: "Geo", tokens: [] });
  s.tokens.set("geo", Object.assign(tok, { id: "geo", documentName: "Token", flags: {}, actorId: null, name: "g" }));
  const [it] = M.sceneItems(s);
  assert.deepEqual([it.rect, it.centre, it.origin, it.coreSquares, it.squares], [{ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, elevation: 0 }, { x: 50, y: 50, elevation: 0 }, false, [{ i: 0, j: 0 }]]);
  // core answers win when they work
  Object.assign(tok, { getSize: () => ({ width: 150, height: 120 }), getMovementOrigin: () => ({ x: 1, y: 2, elevation: 3 }),
    getVisibilityTestPoints: () => [{ x: 9, y: 9 }], getOccupiedGridSpaceOffsets: () => [{ i: 0, j: 0 }, { i: 0, j: 1 }, { i: 0, j: 1 }] });
  const [core] = M.sceneItems(s);
  assert.deepEqual([core.rect, core.origin, core.points, core.squares, core.coreSquares], [{ x: 0, y: 0, w: 150, h: 120 }, { x: 1, y: 2, elevation: 3 }, [{ x: 9, y: 9 }], [{ i: 0, j: 0 }, { i: 0, j: 1 }], true]);
  F.game.scenes.delete("sGeo");
});

test("provenanceOf: the placed document, then a token's actor, then a note's entry", () => {
  assert.equal(M.provenanceOf(s2.tokens.get("pile")).markerId, "mPile");
  assert.equal(M.provenanceOf({ documentName: "Note", flags: {}, entry }).kind, "note");
  F.game.actors.get("actorHero0000001").flags[MODULE] = { provenance: { markerId: "mHero" } };
  assert.deepEqual(M.provenanceOf(s2.tokens.get("hero")), { markerId: "mHero" });
  delete F.game.actors.get("actorHero0000001").flags[MODULE];
  assert.equal(M.provenanceOf({ documentName: "Tile", flags: {} }), null);
  assert.equal(M.provenanceOf(null), null);
});

test("itemFacts reads the source (an unidentified item's real name and attunement); actorXp counts hostile npcs only", () => {
  const orc = F.game.actors.get("actorOrc00000001");
  assert.deepEqual(orc.items.contents.map(M.itemFacts), [
    { name: "Greataxe", type: "weapon", rarity: "uncommon", identified: true, unidentifiedName: "", attunement: "", attuned: false, quantity: 1, price: "" },
    { name: "Ring of Protection", type: "equipment", rarity: "rare", identified: false, unidentifiedName: "Plain ring", attunement: "required", attuned: false, quantity: 1, price: "" }
  ]);
  assert.deepEqual(M.itemFacts({ name: "Gold", type: "loot", system: { quantity: 30, price: { value: 2 } } }).price, "2 gp");
  const H = CONST.TOKEN_DISPOSITIONS.HOSTILE;
  assert.deepEqual([
    M.actorXp(orc), M.actorXp(orc, { disposition: H }), M.actorXp(orc, { disposition: 0 }),
    M.actorXp({ ...orc, system: { details: { cr: 0.5, xp: { value: 75 } } } }, { disposition: H }),
    M.actorXp(F.game.actors.get("actorPile0000001")), M.actorXp(F.game.actors.get("actorHero0000001")), M.actorXp(null),
    M.actorXp({ type: "npc", system: { details: {} } })
  ], [100, 100, 0, 75, 0, 0, 0, 0]);
});

test("prompts-lookup-22: sceneMeta — sight walls with thresholds in px, doors (any sight), levels and the height warning", () => {
  const s = addScene(F, { id: "sMeta", name: "Meta", tokens: [], walls: [
    { id: "w1", c: [0, 0, 100, 0], sight: 20, dir: 0, door: 0, ds: 0, threshold: { sight: 2 } },
    { id: "w2", c: [0, 100, 100, 100], sight: 0, dir: 0, door: 0, ds: 0 },
    { id: "d1", c: [0, 200, 100, 200], sight: 20, dir: 0, door: 1, ds: 0, levels: new Set(["L2"]) },
    { id: "d2", c: [0, 300, 100, 300], sight: 0, dir: 0, door: 2, ds: 1 }
  ] });
  const meta = M.sceneMeta(s);
  pinJSON("scene-meta", meta, import.meta.url);
  assert.deepEqual(meta.walls.map(w => [w.id, w.threshold]), [["w1", 40], ["d1", 0]]);
  assert.deepEqual(meta.doors.map(d => d.id), ["d1", "d2"]);
  assert.equal(L.heightWarning(s), null);
  s.walls[0].flags = { "wall-height": { top: 10 } };
  assert.equal(L.heightWarning(s), "wall heights present, LOS ignores them");
  delete s.walls[0].flags;
  s.levels = { size: 2, get: id => ({ id }) };
  assert.equal(L.heightWarning(s), "2 levels; sight is tested on each thing's own level only");
  assert.deepEqual(M.sceneMeta(s).warn, ["2 levels; sight is tested on each thing's own level only"]);
  F.game.scenes.delete("sMeta");
});

test("sight without core: the plain wall test on the observer's level (a wall with levels only counts there); classify names the door", () => {
  const s = addScene(F, { id: "sLos", name: "Los", tokens: [], walls: [
    { id: "d1", c: [200, 0, 200, 400], sight: 20, dir: 0, door: 1, ds: 0, levels: new Set(["L2"]) }
  ] });
  s.levels = { size: 2, get: id => ({ id }) };
  const sight = L.makeSight(s);
  const A = { level: "L1", centre: { x: 100, y: 100 } }, B = { centre: { x: 300, y: 100 } };
  assert.equal(sight.visible(A, B), true, "L1: the L2 door is not there");
  assert.equal(sight.visible({ ...A, level: "L2" }, B), false);
  assert.equal(sight.classify({ ...A, level: "L2" }, B), "door");
  F.game.scenes.delete("sLos");
});

test("sight with core: testCollision per target point (light ignored, thresholds on); a throw falls back and warns once", async () => {
  const seen = [];
  const backend = { testCollision: (o, d, opts) => (seen.push([d, opts]), d.x > 150) };
  F.CONFIG.Canvas = { polygonBackends: { sight: backend } };
  const s = addScene(F, { id: "sCore", name: "Core", tokens: [], walls: [] });
  s.firstLevel = { id: "L0" };
  const sight = L.makeSight(s);
  assert.equal(sight.visible({ origin: { x: 0, y: 0, elevation: 5 } }, { points: [{ x: 200, y: 0 }, { x: 100, y: 0 }] }), true);
  assert.deepEqual(seen, [
    [{ x: 200, y: 0, elevation: 5 }, { type: "sight", mode: "any", level: { id: "L0" }, useThreshold: true, edgeTypes: { source: false } }],
    [{ x: 100, y: 0, elevation: 5 }, { type: "sight", mode: "any", level: { id: "L0" }, useThreshold: true, edgeTypes: { source: false } }]
  ]);
  assert.equal(sight.visible({ centre: { x: 0, y: 0 } }, { centre: { x: 300, y: 0 } }), false);
  backend.testCollision = () => { throw new Error("drift"); };
  const { value, out } = await captureConsole(() => [sight.visible({ centre: { x: 0, y: 0 } }, { centre: { x: 300, y: 0 } }), L.makeSight(s).visible({ centre: { x: 0, y: 0 } }, { centre: { x: 300, y: 0 } })]);
  assert.deepEqual(value, [true, true]);
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | core sight test failed, using the plain wall test Error(drift)"]);
  delete F.CONFIG.Canvas;
  F.game.scenes.delete("sCore");
});

test("hex grids: squares become cube coordinates (core offsets for tokens, the centre's hex otherwise)", () => {
  const s = addScene(F, { id: "sHex", name: "Hex", tokens: [{ id: "hx", actorId: "markerActormid00", x: 0, y: 0, flags: { [MODULE]: { marker: "mid", prompt: "h" } } }],
    notes: [{ id: "noteHex000000001", x: 250, y: 250, text: "N", flags: { [MODULE]: { provenance: prov("mHex") } } }] });
  s.grid = { distance: 5, size: 100, isHexagonal: true, offsetToCube: ({ i, j }) => ({ q: j, r: i - j, s: -i }), getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }) };
  s.tokens.get("hx").getOccupiedGridSpaceOffsets = () => [{ i: 1, j: 2 }];
  assert.deepEqual(M.sceneItems(s).map(i => i.squares), [[{ i: 2, j: -1 }], [{ i: 2, j: 0 }]]);
  F.game.scenes.delete("sHex");
});

test("sceneModel / panelFor / seesCount / promptTokens on s1", () => {
  const model = M.sceneModel(F.s1);
  assert.deepEqual(Object.keys(model).sort(), ["dims", "doors", "gridFt", "items", "key", "levels", "mapFt", "name", "nav", "notes", "regions", "rel", "squares", "walls", "warn"]);
  const r = model.rel("Token.m1", "Token.m2");
  pinJSON("s1-rel-m1-m2", { ft: r.ft, bearing: r.bearing, los: r.los }, import.meta.url);
  const panel = M.panelFor(F.s1.tokens.get("m1"), { rows: 1, unseenWithinFt: 60 });
  pinJSON("s1-panel-m1", { shown: panel.shown.map(x => [x.key, x.ft, x.bearing, x.los]), more: panel.more.map(x => [x.key, x.ft, x.los]),
    unseen: panel.unseen.map(x => [x.key, x.ft, x.los]), total: panel.total, mapFt: panel.mapFt, warn: panel.warn }, import.meta.url);
  assert.equal(M.seesCount(F.s1.tokens.get("m1")), panel.total);
  assert.equal(M.seesCount({ parent: null, id: "x" }), null);
  assert.deepEqual(M.promptTokens(F.s1).map(t => t.id), ["m1", "m2"]);
});

test("resolveEmbeds: an @Embed is replaced by the page's text (one level, cached); resolveItemEmbeds rewrites descriptions in place", async () => {
  const docs = {
    "Compendium.p.JournalEntryPage.a": { text: { content: "<p>Page A</p>" } },
    "Compendium.p.Item.b": { system: { description: { value: "<p>Item B @Embed[Compendium.p.JournalEntryPage.a]</p>" } } },
    "Compendium.p.Actor.c": { system: { details: { biography: { value: "<p>Actor C</p>" } } } },
    "Compendium.p.JournalEntry.d": { pages: { contents: [{ text: { content: "<p>Entry D</p>" } }] } }
  };
  const asked = [];
  globalThis.fromUuid = async u => { asked.push(u); if (u === "boom") throw new Error("x"); return docs[u] ?? null; };
  assert.equal(await M.resolveEmbeds("no embeds"), "no embeds");
  assert.equal(await M.resolveEmbeds(null), "");
  assert.equal(await M.resolveEmbeds("<p>x</p>@Embed[Compendium.p.JournalEntryPage.a inline]{Caption} and @Embed[Compendium.p.Item.b]"),
    "<p>x</p><p>Page A</p> and <p>Item B </p>");
  assert.equal(await M.resolveEmbeds("@Embed[Compendium.p.Actor.c]|@Embed[Compendium.p.JournalEntry.d]|@Embed[boom]|@Embed[missing]"),
    "<p>Actor C</p>|<p>Entry D</p>||");
  await M.resolveEmbeds("@Embed[Compendium.p.JournalEntryPage.a]");
  assert.equal(asked.filter(u => u === "Compendium.p.JournalEntryPage.a").length, 1, "cached per uuid");
  const items = [{ description: "@Embed[Compendium.p.Actor.c]" }, { description: "plain" }, { description: 3 }];
  assert.equal(await M.resolveItemEmbeds(items), items);
  assert.deepEqual(items.map(i => i.description), ["<p>Actor C</p>", "plain", 3]);
});

test("regions: an item lists the regions its centre is in; a region that cannot test the point is left out", () => {
  const regions = [
    { id: "regHall000000001", name: "Hall", testPoint: p => p.x < 500 },
    { id: "regYard000000001", name: "Yard", testPoint: p => p.x >= 500 },
    { id: "regBroken0000001", name: "Broken", testPoint() { throw new Error("no shapes"); } },
    { id: "regNameless00001", name: "", testPoint: () => true }
  ];
  const s = addScene(F, { id: "sReg", name: "Reg", regions, tokens: [{ id: "rp", name: "P", actorId: "markerActormid00", x: 100, y: 100, flags: { [MODULE]: { marker: "mid", prompt: "x" } } }] });
  assert.deepEqual(M.sceneItems(s)[0].regions, ["Hall", ""]);
  assert.deepEqual(M.sceneMeta(s).regions, ["Hall", "Yard", "Broken"]);
  F.game.scenes.delete("sReg");
});
