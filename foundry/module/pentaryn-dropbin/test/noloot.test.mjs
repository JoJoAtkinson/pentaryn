// 0.3.0 — A2 "Never loot this" (the pile menu, the item sheet header, the API) and A1 (the stale
// natural-weapon filter check). This world's item-piles.itemFilters starts as the dnd5e 2.x preset the
// live world held until 2026-11-07, so ready's GM warning and selftest's check are seen first.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { el } from "./fixtures/dom.mjs";
import { GM, PLAYER, addScene, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 10, 7, 12) });

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
const API = F.game.itempiles.API;
const V5 = API.ITEM_FILTERS;
const V2 = [{ path: "type", filters: "spell,feat,class,subclass,background,race" }, { path: "system.weaponType", filters: "natural" }];
API.ITEM_FILTERS = V2;

// a core ContextMenu stand-in: records what the module builds (the real one is foundry.applications.ux.ContextMenu)
const menus = [];
class FakeContextMenu {
  constructor(container, selector, menuItems, options) { menus.push({ container, selector, menuItems, options }); }
}
F.foundry.applications.ux = { ContextMenu: FakeContextMenu };

const ancient = makeActor(F, { id: "actorAncient0001", name: "Unbound Ancient", type: "npc", system: { attributes: { hp: { value: 0, max: 100 } } } },
  { items: [
    { id: "itemDreadBlade01", name: "Dread Blade", type: "weapon", system: { type: { value: "martialM" }, weight: { value: 0 }, price: { value: 0 } } },
    { id: "itemRend00000001", name: "Rend", type: "weapon", system: { type: { value: "natural" } } },
  ] });
Object.assign(ancient, { statuses: new Set(), toggleStatusEffect: async () => {}, updateEmbeddedDocuments: async () => [], deleteEmbeddedDocuments: async () => [] });
const pc = makeActor(F, { id: "actorCaven000001", name: "Caven", type: "character" }, { items: [{ id: "itemStaff0000001", name: "Staff", type: "weapon" }] });
const blade = () => ancient.items.get("itemDreadBlade01");
const rend = () => ancient.items.get("itemRend00000001");

await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
async function withConsole(fn) {
  const lines = [];
  const keep = {};
  for (const k of ["log", "debug", "info", "warn", "error"]) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => (typeof x === "string" ? x : "<obj>"))]); };
  }
  try { await fn(); } finally { Object.assign(console, keep); }
  return lines;
}
const readyLines = await withConsole(async () => { F.fire("ready"); await flush(); });
const api = game.pentaryn.dropbin;
const quiet = fn => withConsole(fn);

/* ── A1 ─────────────────────────────────────────────────────────────────────────────────────────── */

test("A1: the GM's ready sees the dnd5e 2.x natural-weapon path once, with the one-line fix; nothing is written", () => {
  const warns = readyLines.filter(l => l[0] === "warn" && l[1].includes("itemFilters"));
  assert.equal(warns.length, 1, JSON.stringify(readyLines));
  assert.match(warns[0][1], /^pentaryn-dropbin \| item-piles\.itemFilters hides natural weapons by "system\.weaponType", not "system\.type\.value" \(dnd5e 6\)/);
  assert.match(warns[0][1], /Fix \(GM console\): game\.settings\.set\("item-piles", "itemFilters", \[.*"system\.type\.value","filters":"natural"/);
  assert.deepEqual(F.calls.filter(c => c.op === "settings.set" && c.id.startsWith("item-piles")), [], "the setting is never written from the module");
});

test("A1: selftest reports the stale path with the fix in its detail; the dnd5e ≥ 5 preset passes it", () => {
  const check = () => api.selftest().checks.find(c => c.label.includes("itemFilters"));
  const stale = check();
  assert.equal(stale.ok, false);
  assert.equal(stale.detail.path, "system.weaponType");
  assert.match(stale.detail.fix, /^game\.settings\.set\("item-piles", "itemFilters", /);
  assert.equal(api.selftest().ok, false, "the stale filter fails the whole selftest");
  API.ITEM_FILTERS = V5;
  assert.deepEqual(check(), { label: stale.label, ok: true, detail: { path: "system.type.value", fix: null } });
  assert.equal(api.selftest().ok, true);
});

test("A1: a player's ready says nothing about the filter", async () => {
  API.ITEM_FILTERS = V2;
  F.become({ userId: PLAYER });
  let lines;
  try { lines = await withConsole(async () => { F.fire("ready"); await flush(); }); } finally { F.become({ userId: GM }); API.ITEM_FILTERS = V5; }
  assert.deepEqual(lines.filter(l => l[0] === "warn" && l[1].includes("itemFilters")), []);
});

/* ── A2: the API ────────────────────────────────────────────────────────────────────────────────── */

test("A2: noLoot(item) flips the boolean item flag on; { on: false } deletes it; a no-change call writes nothing", async () => {
  const item = blade();
  const writes = () => F.calls.filter(c => c.op === "update" && c.uuid === item.uuid).length;
  let r, lines;
  lines = await quiet(async () => { r = await api.noLoot(item); });
  assert.deepEqual(r, { ok: true, uuid: item.uuid, noLoot: true, filterWritten: false }, "no `on`: flipped on");
  assert.strictEqual(item.flags[MOD].noLoot, true, "boolean true: Item Piles' filter compares === true");
  assert.equal(lines.filter(l => l[0] === "info").length, 1, "one audit line per call");
  await quiet(async () => { r = await api.noLoot(item); });
  assert.deepEqual(r, { ok: true, uuid: item.uuid, noLoot: false, filterWritten: false }, "flipped back off");
  assert.equal(item.flags[MOD]?.noLoot, undefined, "unmarked: the key is gone, not false");
  await quiet(async () => { r = await api.noLoot(item.uuid, { on: true }); });
  assert.deepEqual([r.ok, r.noLoot], [true, true], "by uuid");
  const n = writes();
  await quiet(() => api.noLoot(item.uuid, { on: true }));
  assert.equal(writes(), n, "already on: no write");
  await quiet(() => api.noLoot(item, { on: false }));
  assert.equal(item.flags[MOD]?.noLoot, undefined);
});

test("A2: a player is refused (NOT_GM); a ref that is not an item is a coded fail, never a throw", async () => {
  F.become({ userId: PLAYER });
  let r;
  try { r = await api.noLoot(blade()); } finally { F.become({ userId: GM }); }
  assert.deepEqual([r.ok, r.code], [false, "NOT_GM"]);
  assert.equal(blade().flags[MOD]?.noLoot, undefined);
  const miss = await api.noLoot("Nobody's Blade");
  assert.deepEqual([miss.ok, miss.code], [false, "NOT_FOUND"]);
  const wrong = await api.noLoot(ancient);
  assert.deepEqual([wrong.ok, wrong.code], [false, "BAD_ARGS"]);
});

test("A2: marking an item on a corpse pile made before 0.3.0 writes the pile's filters once, so the row hides at once", async () => {
  // an unlinked corpse of ours whose Item Piles data has no overrideItemFilters (the pre-0.3.0 shape)
  const scene = addScene(F, { id: "sceneTemple00001", name: "Umbral Temple", tokens: [
    { id: "tokAncient000001", name: "Unbound Ancient", actorId: ancient.id, actor: null, sight: { enabled: false },
      flags: { [MOD]: { corpse: true, sight: true, ownership: null }, ...ip({ enabled: true, type: "pile" }) } },
  ] });
  const tok = scene.tokens.get("tokAncient000001");
  const synthetic = Object.create(ancient);                 // the token's actor: isToken, its token, the same items
  Object.defineProperties(synthetic, { isToken: { value: true }, token: { value: tok }, items: { value: ancient.items } });
  tok.actor = synthetic;
  const item = Object.create(blade());
  Object.defineProperty(item, "parent", { value: synthetic });
  Object.defineProperty(item, "uuid", { value: `${tok.uuid}.Actor.${ancient.id}.Item.${blade().id}` });
  let r;
  await quiet(async () => { r = await api.noLoot(item, { on: true }); });
  assert.deepEqual([r.ok, r.noLoot, r.filterWritten], [true, true, true]);
  assert.deepEqual(tok.flags["item-piles"].data.overrideItemFilters, [...V5, { path: "flags.pentaryn-dropbin.noLoot", filters: "true" }]);
  assert.strictEqual(blade().flags[MOD].noLoot, true, "the flag landed on the item the synthetic actor shares");
  await quiet(async () => { r = await api.noLoot(item, { on: false }); });
  assert.equal(r.filterWritten, false, "the row is there now");
  assert.equal(API.isValidItemPile(tok), true, "the pile is untouched otherwise");
});

/* ── A2: the pile inventory's context menu ──────────────────────────────────────────────────────── */

const row = item => {
  const r = el("div", { className: "item-piles-flexrow item-piles-item-row" });
  F.fire("item-piles-renderPileItem", r, item);
  return r;
};

test("A2: item-piles-renderPileItem stamps the GM's rows with the item uuid; a player's rows stay bare", () => {
  const r = row(blade());
  assert.equal(r.dataset.pdItemUuid, blade().uuid);
  assert.equal(r.matches(".item-piles-item-row[data-pd-item-uuid]"), true, "the menu's selector finds it");
  F.become({ userId: PLAYER });
  let p;
  try { p = row(blade()); } finally { F.become({ userId: GM }); }
  assert.deepEqual(p.dataset, {});
});

test("A2: renderItemPileInventoryApp gives the GM one context menu per window, on the rows; a player gets none", () => {
  const root = el("div", { className: "item-pile-inventory" });
  root.root = true;
  const app = { actor: ancient, element: root };
  F.fire("renderItemPileInventoryApp", app);
  F.fire("renderItemPileInventoryApp", app);                 // a re-render keeps the Svelte root: still one menu
  assert.equal(menus.length, 1);
  const [m] = menus;
  assert.equal(m.container, root);
  assert.equal(m.selector, ".item-piles-item-row[data-pd-item-uuid]");
  assert.deepEqual(m.options, { jQuery: false, fixed: true });
  assert.deepEqual(m.menuItems.map(e => [e.label, e.icon]), [["Never loot this", "fa-solid fa-ban"], ["Lootable again", "fa-solid fa-hand-holding"]]);
  F.become({ userId: PLAYER });
  try { F.fire("renderItemPileInventoryApp", { actor: ancient, element: el("div") }); } finally { F.become({ userId: GM }); }
  assert.equal(menus.length, 1, "players never get the menu");
});

test("A2: one entry shows per row by the item's state, and clicking it flips the flag (no toast, no dialog)", async () => {
  const [never, again] = menus[0].menuItems;
  const r = row(blade());
  assert.deepEqual([never.visible(r), again.visible(r)], [true, false], "unmarked: Never loot this");
  assert.deepEqual([never.visible(el("div")), again.visible(el("div"))], [false, false], "an unstamped row offers nothing");
  const from = F.calls.length;
  await quiet(async () => { never.onClick({}, r); await flush(); });
  assert.strictEqual(blade().flags[MOD].noLoot, true);
  assert.deepEqual([never.visible(r), again.visible(r)], [false, true], "marked: Lootable again");
  await quiet(async () => { again.onClick({}, r); await flush(); });
  assert.equal(blade().flags[MOD]?.noLoot, undefined);
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify"), [], "nothing on screen but the row");
});

/* ── A2: the item sheet header ──────────────────────────────────────────────────────────────────── */

const controlsFor = (item, user = GM) => {
  const controls = [];
  F.become({ userId: user });
  try { F.fire("getHeaderControlsItemSheet5e", { document: item }, controls); } finally { F.become({ userId: GM }); }
  return controls;
};

test("A2: the GM's item sheet gets the control on an NPC's item and a world item, never on a character's; players get none", async () => {
  const [c] = controlsFor(blade());
  assert.deepEqual([c.action, c.icon, c.label, c.visible, typeof c.onClick], ["pdNoLoot", "fa-solid fa-ban", "PENTARYN_DROPBIN.noLoot.never", true, "function"]);
  const world = { documentName: "Item", id: "itemWorld0000001", name: "Pact Blade", flags: {}, parent: null, uuid: "Item.itemWorld0000001", update: async () => {} };
  assert.equal(controlsFor(world).length, 1, "a world item: its copies inherit the flag");
  assert.equal(controlsFor(pc.items.get("itemStaff0000001")).length, 0, "a PC's gear is never a corpse's");
  assert.equal(controlsFor(blade(), PLAYER).length, 0, "players never see it");
  assert.equal(controlsFor(ancient).length, 0, "not an item: nothing");
  await quiet(async () => { c.onClick({}); await flush(); });
  assert.strictEqual(blade().flags[MOD].noLoot, true);
  const [again] = controlsFor(blade());
  assert.deepEqual([again.icon, again.label], ["fa-solid fa-hand-holding", "PENTARYN_DROPBIN.noLoot.again"], "the label follows the state on the next render");
  await quiet(async () => { again.onClick({}); await flush(); });
  assert.equal(blade().flags[MOD]?.noLoot, undefined);
});

test("A2: the lang keys the surfaces use exist and read as the plan's words", () => {
  assert.equal(game.i18n.localize("PENTARYN_DROPBIN.noLoot.never"), "Never loot this");
  assert.equal(game.i18n.localize("PENTARYN_DROPBIN.noLoot.again"), "Lootable again");
});

test("uninstall leaves no hook of the noLoot surfaces", () => {
  api.uninstall();
  assert.deepEqual(F.listeners(), {});
});
