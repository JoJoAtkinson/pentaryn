// Glue characterisation (guide step 1.5). The unchanged entry (with corpses, loot and the i18n shim it
// imports) is loaded as Foundry would on the active GM's client and driven through its lifecycle hooks,
// Item Piles' hooks, socketlib, the directory/HUD/loot render hooks and the published API. Timers and
// Date are mocked.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { el } from "./fixtures/dom.mjs";
import { GM, PLAYER, addScene, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";
import * as oracle from "./fixtures/legacy-dropbin.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();

// the world the ready backfills walk
const ann = makeActor(F, { id: "actorAnn00000001", name: "Ann", ownership: { default: 0, [PLAYER]: 3 } },
  { items: [{ id: "itemSword0000001", name: "Sword", type: "weapon", system: { quantity: 1 } }] });
const chest = makeActor(F, { id: "actorChest000001", name: "Hidden Cache", type: "npc", flags: ip({ enabled: true, type: "container", locked: true }) });
const chestQuiet = makeActor(F, { id: "actorChest000002", name: "Loud Chest", type: "npc", flags: ip({ enabled: true, type: "container", lockedSound: "x.wav" }) });
const eyePile = makeActor(F, { id: "actorEye00000001", name: "Eye Spot", type: "npc", flags: ip({ enabled: true, type: "pile" }),
  prototypeToken: { sight: { enabled: true }, flags: {} } });
const scene = addScene(F, { id: "sceneOne00000001", name: "Crypt",
  tokens: [
    { id: "tokChest00000001", name: "Chest", flags: ip({ enabled: true, type: "container" }), sight: { enabled: true } },
    { id: "tokPlain00000001", name: "Bob", flags: {}, sight: { enabled: true } },
  ],
  notes: [
    { id: "noteGlobal000001", entryId: "journalPinned001", global: true, entry: { id: "journalPinned001" } },
    { id: "noteLocal0000001", entryId: "journalLocal0001", global: false, entry: { id: "journalLocal0001" } },
  ] });
canvas.scene = scene;

await import("../dropbin.mjs");
const hooksAtLoad = F.hooks.slice();

const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function withConsole(fn) {
  const lines = [];
  const keep = {};
  for (const k of ["log", "debug", "warn", "error"]) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => (x instanceof Error ? `Error: ${x.message}` : typeof x === "string" ? x : "<obj>"))]); };
  }
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
  return lines;
}

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("load-time registrations: 30, in today's order (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtLoad, import.meta.url);
  assert.equal(hooksAtLoad.length, 30);
});

test("i18nInit: the Item Piles i18n shim fills the legacy DND5E keys; one console line", async () => {
  const lines = await withConsole(() => F.fire("i18nInit"));
  assert.deepEqual(Object.keys(game.i18n.translations.DND5E), ["ItemRarityCommon", "ItemRarityUncommon", "ItemRarityRare",
    "ItemRarityVeryRare", "ItemRarityLegendary", "ItemRarityArtifact", "Unknown"]);
  assert.deepEqual(lines, [["log", "pentaryn-dropbin | Item Piles i18n shim added DND5E.ItemRarityCommon, DND5E.ItemRarityUncommon, " +
    "DND5E.ItemRarityRare, DND5E.ItemRarityVeryRare, DND5E.ItemRarityLegendary, DND5E.ItemRarityArtifact, DND5E.Unknown"]]);
});

test("init: the two hidden world settings", () => {
  F.fire("init");
  const rows = ["log", "counter"].map(k => game.settings.settings.get(`${MOD}.${k}`)).map(s => ({ key: s.key, scope: s.scope, config: s.config, type: s.type.name, default: s.default }));
  assert.deepEqual(rows, [
    { key: "log", scope: "world", config: false, type: "Array", default: [] },
    { key: "counter", scope: "world", config: false, type: "Number", default: 0 },
  ]);
});

test("ready: post-ready registrations in order (golden/hooks-after-ready.json); GM backfills (golden/backfills.json); publish at ready (D2)", async () => {
  // the oracle planners over the same world, before ready's backfills change it
  const lock = await oracle.planLockSounds([ann, chest, chestQuiet, eyePile], [scene]);
  const eyes = await oracle.planEyesNeedView([ann, chest, chestQuiet, eyePile], [scene]);
  const hooksBefore = F.hooks.length;
  const from = mark();
  const lines = await withConsole(async () => {
    F.fire("ready");
    await flush();
  });
  const after = F.hooks.slice(hooksBefore);
  pinJSON("hooks-after-ready", after, import.meta.url);
  assert.deepEqual(after.map(h => h.name), ["item-piles-dropItem", "preDeleteItem", "item-piles-preRenderInterface",
    "item-piles-preRenderActorSheet", "item-piles-preRattleItemPile", "preCreateItem"]);
  // [declared] items-journal-25: the active GM writes each plan's actors in one Actor.updateDocuments batch
  const writes = since(from).filter(c => ["update", "Actor.updateDocuments", "updateEmbeddedDocuments"].includes(c.op))
    .map(c => (c.op === "update" ? { actor: c.uuid, changes: c.changes }
      : c.op === "Actor.updateDocuments" ? { actors: c.data } : { scene: c.on, type: c.type, data: c.data }));
  pinJSON("backfills", writes, import.meta.url);
  // the oracle planners reproduce the payloads, the actors batched
  const fromPlan = plan => [...(plan.actorUpdates.length ? [{ actors: plan.actorUpdates }] : []),
    ...plan.embedded.map(e => ({ scene: e.sceneId, type: e.type, data: e.updates }))];
  assert.deepEqual(writes, [...fromPlan(lock), ...fromPlan(eyes)]);
  // [declared] D-D1 (D2): published at ready on module.api, not a tick later; the ready line comes with it
  assert.equal(game.pentaryn?.dropbin, game.modules.get(MOD).api, "published at ready");
  const tickLines = await withConsole(async () => {
    mock.timers.tick(0);
    await flush();
  });
  pinJSON("ready-console", { lines, tickLines }, import.meta.url);
  assert.deepEqual(tickLines, []);
  // [declared] items-journal-19: the ready line adds the ledger's approximate size
  assert.deepEqual(lines[0], ["log", "pentaryn-dropbin | ready — 0 entries on the ledger (~0 KB)"]);
});

test("published API: the legacy keys (a floor); corpses and loot keys pinned", () => {
  const api = game.pentaryn.dropbin;
  const legacy = ["corpses", "loot", "all", "list", "get", "search", "restore", "export", "clear"];
  assert.deepEqual(Object.keys(api).filter(k => legacy.includes(k)), legacy);
  assert.deepEqual(Object.keys(api.corpses), ["sync", "toCorpse", "fromCorpse", "isDead", "revive", "paintEye", "paintAllEyes", "migrateLegacyEyes"]);
  assert.deepEqual(Object.keys(api.loot), ["install", "refreshAll", "recipientFor"]);
});

const sword = () => ann.items.get("itemSword0000001");

// DB-AC-1 [declared]: Item Piles' drop hook runs on every client; a player's client records no drop (the
// active GM's does), so the player paths below are driven by a delete off the player's own sheet.
test("capture without socketlib as a player: a drop is not this client's to record; a delete is the 'entry dropped' warning, nothing written", async () => {
  F.become({ userId: PLAYER });
  const from = mark();
  const dropLines = await withConsole(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, scene.tokens.get("tokChest00000001"), [{ item: sword(), quantity: -1 }], { x: 5, y: 6 });
    await flush();
  });
  const lines = await withConsole(async () => {
    Hooks.call("preDeleteItem", sword(), {}, PLAYER);
    await flush();
  });
  F.become({ userId: GM });
  assert.deepEqual(dropLines, []);
  assert.deepEqual(lines, [["warn", "pentaryn-dropbin | no socketlib and not a GM — entry dropped", "<obj>"]]);
  assert.deepEqual(since(from, "settings.set"), []);
});

test("socketlib.ready registers the module and the record handler", () => {
  const from = mark();
  F.fire("socketlib.ready");
  assert.deepEqual(since(from).map(c => [c.op, c.id ?? c.name]), [["socketlib.registerModule", MOD], ["socketlib.register", "record"]]);
});

test("drop capture as the GM: counter, log, console line, the mirror upload after the debounce; the same drop within 2 s writes nothing", async () => {
  const from = mark();
  const lines = await withConsole(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, scene.tokens.get("tokChest00000001"), [{ item: sword(), quantity: -2 }], { x: 1, y: 2 });
    await flush();
  });
  const ops = () => since(from).filter(c => ["settings.set", "upload"].includes(c.op))
    .map(c => c.op === "upload" ? ["upload", c.source, c.dir, c.name, c.opts] : [c.op, c.id]);
  // [declared] items-journal-19: the mirror upload is trailing-debounced (2 s), not awaited per entry
  assert.deepEqual(ops(), [["settings.set", `${MOD}.counter`], ["settings.set", `${MOD}.log`]]);
  assert.deepEqual(lines, [["log", "pentaryn-dropbin | #1 drop: Sword from Ann"]]);
  pinJSON("ledger-entry", game.pentaryn.dropbin.get(1), import.meta.url);
  const again = mark();
  Hooks.callAll("item-piles-dropItem", { actor: ann }, scene.tokens.get("tokChest00000001"), [{ item: sword(), quantity: -2 }], { x: 1, y: 2 });
  await flush();
  assert.deepEqual(since(again).filter(c => ["settings.set", "upload"].includes(c.op)), []);
  mock.timers.tick(2000);
  await flush();
  assert.deepEqual(ops(), [
    ["settings.set", `${MOD}.counter`], ["settings.set", `${MOD}.log`], ["upload", "data", "assets/drop-bin", "drop-log.json", { notify: false }],
  ]);
});

test("capture as a player with socketlib: a drop relays nothing (DB-AC-1); a delete is one executeAsGM('record', entry)", async () => {
  F.become({ userId: PLAYER });
  const from = mark();
  Hooks.callAll("item-piles-dropItem", ann, "Scene.x.Token.y", { item: sword(), quantity: 3 }, null);
  await flush();
  assert.deepEqual(since(from, "executeAsGM"), []);
  Hooks.call("preDeleteItem", sword(), {}, PLAYER);
  await flush();
  F.become({ userId: GM });
  const relays = since(from, "executeAsGM");
  assert.equal(relays.length, 1);
  assert.equal(relays[0].name, "record");
  assert.deepEqual([relays[0].data.reason, relays[0].data.quantity, relays[0].data.pileUuid, relays[0].data.userId], ["delete", 1, null, PLAYER]);
});

// items-journal-18 — two drops in one call raced the read-modify-write (both got #2). Flipped by guide step 8
// [declared] (serialised appends): numbered consecutively in submission order.
test("items-journal-18: two concurrent drops of different items are numbered #2 and #3", async () => {
  const realSet = game.settings.set.bind(game.settings);
  game.settings.set = (ns, key, value) => new Promise(r => setTimeout(() => r(realSet(ns, key, value)), 0));
  const lines = await withConsole(async () => {
    Hooks.callAll("item-piles-dropItem", { actor: ann }, chest, [
      { item: { name: "Rope", type: "loot", system: { quantity: 1 }, toObject() { return { name: "Rope", type: "loot", system: { quantity: 1 } }; } }, quantity: 1 },
      { item: { name: "Lamp", type: "loot", system: { quantity: 1 }, toObject() { return { name: "Lamp", type: "loot", system: { quantity: 1 } }; } }, quantity: 1 },
    ], {});
    for (let i = 0; i < 20; i++) { mock.timers.tick(0); await flush(); }
  });
  game.settings.set = realSet;
  assert.deepEqual(lines, [["log", "pentaryn-dropbin | #2 drop: Rope from Ann"], ["log", "pentaryn-dropbin | #3 drop: Lamp from Ann"]]);
});

test("preDeleteItem: a character's own delete is captured; a restore-flagged one is not (the flag is dead today)", async () => {
  const from = mark();
  await withConsole(async () => {
    Hooks.call("preDeleteItem", sword(), {}, GM);
    Hooks.call("preDeleteItem", sword(), {}, PLAYER);                       // another user's: skipped
    Hooks.call("preDeleteItem", sword(), { [MOD]: { restoring: true } }, GM);
    await flush();
  });
  const logs = since(from, "settings.set").filter(c => c.id === `${MOD}.log`);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].value.at(-1).reason, "delete");
});

test("list / get / search / all over the ledger", () => {
  const api = game.pentaryn.dropbin;
  assert.deepEqual(api.list(2).map(e => e.n), api.all().slice(-2).reverse().map(e => e.n));
  assert.equal(api.get("1").itemName, "Sword");
  assert.deepEqual(api.search("ROPE").map(e => e.itemName), ["Rope"]);
});

test("restore (items-journal-28 premise): a player gets the warn's own return value; a missing entry the error's; success creates and toasts", async () => {
  const api = game.pentaryn.dropbin;
  F.become({ userId: PLAYER });
  let from = mark();
  const r1 = await api.restore(1);
  F.become({ userId: GM });
  assert.equal(r1, since(from, "notify")[0].token, "the very object ui.notifications.warn returned");
  assert.equal(r1.message, "Only the GM can restore from the drop bin.");
  from = mark();
  const r2 = await api.restore(999);
  assert.equal(r2, since(from, "notify")[0].token);
  assert.equal(r2.message, "Drop bin: no entry #999.");
  from = mark();
  const made = await api.restore(1);
  const create = since(from, "createEmbeddedDocuments")[0];
  assert.deepEqual([create.on, create.type, create.options], ["Ann", "Item", { [MOD]: { restoring: true } }]);
  assert.equal(create.data[0]._id, undefined);
  assert.equal(made.name, "Sword");
  assert.deepEqual(since(from, "notify").map(c => c.message), ["Restored Sword to Ann (drop bin #1)."]);
});

test("export as the GM: mirror + toast; as a player: false", async () => {
  let from = mark();
  assert.equal(await game.pentaryn.dropbin.export(), true);
  assert.deepEqual(since(from, "notify").map(c => c.message), ["Drop bin written to assets/drop-bin/drop-log.json"]);
  F.become({ userId: PLAYER });
  assert.equal(await game.pentaryn.dropbin.export(), false);
  F.become({ userId: GM });
});

test("locks: a player is refused a locked container (sound + toast); the GM is not; a rattle only toasts", () => {
  F.become({ userId: PLAYER });
  let from = mark();
  assert.equal(Hooks.call("item-piles-preRenderInterface", chest), false);
  assert.deepEqual(since(from).filter(c => ["AudioHelper.play", "notify"].includes(c.op)).map(c => c.op === "notify" ? c.message : c.data), [
    { src: "sounds/lock.wav", volume: 0.8 }, "Hidden Cache is locked.",
  ]);
  assert.equal(since(from, "AudioHelper.play")[0].broadcast, true);
  assert.equal(Hooks.call("item-piles-preRenderInterface", chestQuiet), true, "not locked: opens");
  assert.equal(Hooks.call("item-piles-preRenderActorSheet", { actor: chest }), false);
  from = mark();
  Hooks.call("item-piles-preRattleItemPile", chest);
  assert.deepEqual(since(from).filter(c => ["AudioHelper.play", "notify"].includes(c.op)).map(c => c.op), ["notify"]);
  F.become({ userId: GM });
  assert.equal(Hooks.call("item-piles-preRenderInterface", chest), true);
});

test("directories: pile actors and pinned journals are hidden from a player; the GM sees every row", () => {
  const rows = ids => el("ol", { children: ids.map(id => el("li", { dataset: { entryId: id } })) });
  const actorsRoot = rows([ann.id, chest.id, eyePile.id]);
  F.become({ userId: PLAYER });
  F.fire("renderActorDirectory", {}, actorsRoot);
  const journalRoot = rows(["journalPinned001", "journalLocal0001", "journalHandout01"]);
  F.fire("renderJournalDirectory", {}, journalRoot);
  F.become({ userId: GM });
  assert.deepEqual(actorsRoot.children.map(li => li.dataset.entryId), [ann.id]);
  assert.deepEqual(journalRoot.children.map(li => li.dataset.entryId), ["journalHandout01"]);
  const gmRoot = rows([ann.id, chest.id]);
  F.fire("renderActorDirectory", {}, gmRoot);
  assert.equal(gmRoot.children.length, 2);
});

test("corpses: renderTokenHUD on our corpse as the GM adds two buttons with today's tooltips", () => {
  const corpse = { flags: { [MOD]: { corpse: true } }, actor: { sheet: { render() {} } } };
  const right = el("div", { className: "col right" });
  const root = el("div", { children: [right] });
  F.fire("renderTokenHUD", { object: { document: corpse }, close() {} }, root);
  assert.deepEqual(right.children.map(b => [b.className, b.dataset.tooltip, b.innerHTML]), [
    ["control-icon pd-corpse-sheet", "Open character sheet (GM)", '<i class="fa-solid fa-user"></i>'],
    ["control-icon pd-corpse-revive", "Revive (1 HP): no longer lootable", '<i class="fa-solid fa-heart-pulse"></i>'],
  ]);
  F.fire("renderTokenHUD", { object: { document: corpse }, close() {} }, root);
  assert.equal(right.children.length, 2, "not added twice");
  F.become({ userId: PLAYER });
  const r2 = el("div", { className: "col right" });
  F.fire("renderTokenHUD", { object: { document: corpse } }, el("div", { children: [r2] }));
  F.become({ userId: GM });
  assert.equal(r2.children.length, 0, "players get nothing");
});

// items-journal-30 — the eye's disc was cleared and redrawn on every paint (every refreshToken), even when
// its size had not changed (2). Flipped by the [declared] items-journal-30 fix (needsRedraw): 1.
test("items-journal-30: painting the corpse eye twice clears its disc once", async () => {
  const doc = { name: "Dead Goblin", flags: { [MOD]: { corpse: true } }, isSecret: false, getSize: () => ({ width: 100, height: 100 }) };
  const token = { document: doc, destroyed: false, effects: { zIndex: 3 }, addChild(c) { c.parent = this; return c; } };
  F.piles.add(doc);
  game.pentaryn.dropbin.corpses.paintEye(token);               // starts the texture load; nothing drawn yet
  await flush();
  F.calls.clears = 0;
  game.pentaryn.dropbin.corpses.paintEye(token);
  const first = { x: token.pdLootEye.position.x, y: token.pdLootEye.position.y, z: token.pdLootEye.zIndex, w: token.pdLootEye.children[1].width, visible: token.pdLootEye.visible };
  game.pentaryn.dropbin.corpses.paintEye(token);
  assert.equal(F.calls.clears, 1);
  assert.deepEqual({ x: token.pdLootEye.position.x, y: token.pdLootEye.position.y, z: token.pdLootEye.zIndex, w: token.pdLootEye.children[1].width, visible: token.pdLootEye.visible }, first);
  assert.deepEqual(first, { x: 80, y: 20, z: 4, w: 40, visible: true });
});

test("loot: renderItemPileInventoryApp adds a 'Loot all' button to the footer and it transfers everything", async () => {
  const footer = el("footer", { className: "sheet-footer" });
  const root = el("div", { children: [footer] });
  const pile = makeActor(F, { id: "actorPile0000001", name: "Gear Pile", type: "npc", flags: ip({ enabled: true, type: "pile" }) });
  F.piles.add(pile);
  const app = { actor: pile, element: root, recipient: ann };
  Object.defineProperty(ann, "isOwner", { value: true, configurable: true });
  F.fire("renderItemPileInventoryApp", app);
  const btn = footer.querySelector(".pd-loot-all");
  assert.ok(btn);
  assert.equal(btn.innerHTML, '<i class="fas fa-hand-holding"></i> Loot all');
  assert.equal(btn.hidden, false);
  assert.equal(btn.disabled, false);
  assert.equal(btn.dataset.tooltip, "Take everything into Ann's inventory");
  const from = mark();
  btn.click();
  await flush();
  assert.deepEqual(since(from, "transferEverything").map(c => c.args), [["Gear Pile", "Ann", {}]]);
});
