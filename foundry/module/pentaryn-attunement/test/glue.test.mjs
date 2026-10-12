// Glue characterisation (guide step 1.5). The unchanged entry is loaded as Foundry would, as a GM; its
// effects are pinned through the lifecycle hooks, the item hooks and the published API. Timers are
// mocked (the ready tick). The sheet-render path (DOM) is not driven here.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { GM, MOD, addItem, attunementWorld, makeActor } from "./fixtures/world.mjs";
import * as oracle from "./fixtures/legacy-attunement.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await attunementWorld();
await import("../attunement.mjs");
const entry = await import("../attunement-core.mjs");   // computeSlots: the entry no longer re-exports it (step 2b)

const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function withConsole(fn) {
  const lines = [];
  const keep = {};
  for (const k of ["log", "table", "warn", "error"]) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => F.plain(x))]); };
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

test("init: the armour map gains exactly the five magic-item categories; one log line", async () => {
  const before = { ...CONFIG.DND5E.armorProficienciesMap };
  const lines = await withConsole(() => F.fire("init"));
  const map = CONFIG.DND5E.armorProficienciesMap;
  assert.deepEqual(Object.keys(map).filter(k => !(k in before)), ["wondrous", "ring", "rod", "wand", "trinket"]);
  for (const k of ["wondrous", "ring", "rod", "wand", "trinket"]) assert.equal(map[k], true);
  assert.deepEqual(lines, [["log", "pentaryn-attunement | proficiency applies to all: wondrous, ring, rod, wand, trinket"]]);
});

test("ready + one tick: the five legacy keys (a floor), one log line, tooltip guard installed", async () => {
  const proto = Object.getPrototypeOf(game.dnd5e.tooltips);
  const original = proto._positionItemTooltip;
  const lines = await withConsole(async () => {
    F.fire("ready");
    assert.equal(typeof game.pentaryn?.attunement?.report, "function", "[declared] D-A1: published at ready, not a tick later");
    mock.timers.tick(0);
    await flush();
  });
  const legacy = ["report", "computeSlots", "stash", "releaseAway", "away"];
  const api = game.pentaryn.attunement;
  assert.deepEqual(Object.keys(api).filter(k => legacy.includes(k)), legacy);
  for (const k of legacy) assert.equal(typeof api[k], "function", k);
  assert.deepEqual(lines, [["log", "pentaryn-attunement | ready"]]);
  assert.notEqual(proto._positionItemTooltip, original);
  assert.equal(proto._positionItemTooltip.pentarynGuarded, true);
});

test("tooltip guard (U-8-5, items-journal-39): passes through with an anchor, skips without one", () => {
  const tips = game.dnd5e.tooltips;
  tips.calls.length = 0;
  assert.equal(tips._positionItemTooltip(1, 2), "positioned");
  assert.deepEqual(tips.calls, [[1, 2]]);
  game.tooltip.element = null;
  assert.equal(tips._positionItemTooltip(3), undefined);
  game.tooltip.element = {};
  tips.tooltip = null;
  assert.equal(tips._positionItemTooltip(4), undefined);
  tips.tooltip = {};
  assert.deepEqual(tips.calls, [[1, 2]], "the original was not called while either anchor was missing");
});

test("preUpdateItem attuning on an actor at cap: one WouldExceed warn; never vetoes", () => {
  const actor = makeActor(F, { id: "actorCap00000001", name: "Ballad Quinn", attunement: { value: 3, max: 3 } });
  const item = addItem(F, actor, { id: "itemRing00000001", name: "Ring of Warmth", system: { attunement: "required", attuned: false } });
  const from = mark();
  assert.equal(F.fireCall("preUpdateItem", item, { system: { attuned: true } }), true);
  assert.deepEqual(since(from, "notify").map(c => [c.level, c.message]), [
    ["warn", "Ballad Quinn is already attuned to 3 items — attuning Ring of Warmth makes 4."],
  ]);
  const quiet = mark();
  F.fireCall("preUpdateItem", item, { system: { equipped: true } });
  const free = addItem(F, actor, { id: "itemFree00000001", name: "Plain Cloak", system: { attunement: "", attuned: false } });
  F.fireCall("preUpdateItem", free, { system: { attuned: true } });
  const already = addItem(F, actor, { id: "itemAlre00000001", name: "Worn Ring", system: { attunement: "required", attuned: true } });
  F.fireCall("preUpdateItem", already, { system: { attuned: true } });
  assert.deepEqual(since(quiet, "notify"), [], "no delta, no attunement, already attuned: silent");
});

// KNOWN: items-journal-12 — the over-cap warning reads system.attributes.attunement.value (dnd5e's count),
// the strip counts prepared-attuned items: they can disagree. Recorded, not fixed (countMismatch is optional).
test("KNOWN items-journal-12: computeSlots counts 2 where the warning's input is 1", () => {
  const actor = makeActor(F, { id: "actorDiv00000001", name: "Div", attunement: { value: 1, max: 3 } });
  addItem(F, actor, { id: "itemDivA00000001", name: "A", system: { attunement: "required", attuned: true } });
  addItem(F, actor, { id: "itemDivB00000001", name: "B", system: { attunement: "required", attuned: true } });
  assert.equal(game.pentaryn.attunement.computeSlots(actor).value, 2);
  assert.deepEqual(oracle.wouldExceed({ value: actor.system.attributes.attunement.value, max: 3, awayCount: 0 }), { exceed: false, after: 2 });
});

test("preCreateItem with a bond, on the bonded actor at home: updateSource with the home changes; options tagged", () => {
  const actor = makeActor(F, { id: "actorTalo0000001", name: "Talo Vesk", flags: { [MOD]: { away: [{ key: "k", name: "Cloak", img: "i" }] } } });
  const bond = { actor: actor.id, key: "k", name: "Cloak", equipped: true, attuned: true, attunement: "required" };
  const item = addItem(F, null, { id: "itemBond00000001", name: "Cloak (Talo)", flags: { [MOD]: { bond } } });
  item.parent = actor;
  const options = {};
  const from = mark();
  F.fireCall("preCreateItem", item, {}, options);
  assert.deepEqual(since(from, "updateSource").map(c => c.changes), [
    { name: "Cloak", "system.attunement": "required", "system.attuned": true, "system.equipped": true },
  ]);
  assert.deepEqual(options[MOD], { bond });
  assert.equal(JSON.stringify(since(from, "updateSource")[0].changes),
    JSON.stringify(oracle.bondChanges(bond, { actorId: actor.id, awayKeys: ["k"], fallbackName: item.name })));
});

test("preCreateItem on an Item Piles pile actor: left tagged (no updateSource)", () => {
  const pile = makeActor(F, { id: "actorPile0000001", name: "Chest" });
  game.itempiles = { API: { isValidItemPile: a => a === pile } };
  const bond = { actor: "actorTalo0000001", key: "k", name: "Cloak", equipped: true, attuned: true, attunement: "required" };
  const item = addItem(F, null, { id: "itemPile00000001", name: "Cloak (Talo)", flags: { [MOD]: { bond } } });
  item.parent = pile;
  const from = mark();
  F.fireCall("preCreateItem", item, {}, {});
  assert.deepEqual(since(from, "updateSource"), []);
  delete game.itempiles;
});

test("preCreateItem of an attuned item (no bond) onto an actor at cap: ArrivedAttuned warn", () => {
  const actor = makeActor(F, { id: "actorFull0000001", name: "Full", attunement: { value: 3, max: 3 } });
  const item = addItem(F, null, { id: "itemArrv00000001", name: "Amulet", system: { attuned: true, attunement: "required" } });
  item.parent = actor;
  const from = mark();
  F.fireCall("preCreateItem", item, {}, {});
  assert.deepEqual(since(from, "notify").map(c => c.message), ["Amulet arrived already attuned; Full is now over the attunement limit."]);
});

test("EC-4: a batch of attunes counts the ones before it; the first past the cap and every later one warns", () => {
  // As Foundry does: one options object for the whole batch, every pre-hook before any write.
  const actor = makeActor(F, { id: "actorBtch0000001", name: "Batch", attunement: { value: 2, max: 3 } });
  const items = ["A", "B", "C"].map(n => addItem(F, actor, { id: `itemBtc${n}00000000`, name: `Ring ${n}`, system: { attunement: "required", attuned: false } }));
  const options = {};
  const from = mark();
  for (const it of items) assert.equal(F.fireCall("preUpdateItem", it, { system: { attuned: true } }, options), true);
  assert.deepEqual(since(from, "notify").map(c => c.message), [
    "Batch is already attuned to 3 items — attuning Ring B makes 4.",
    "Batch is already attuned to 3 items — attuning Ring C makes 5.",   // the message names the cap; the count runs on
  ]);

  // Created already attuned, in one batch; a bonded item coming home holds its own away slot and is not counted.
  const full = makeActor(F, { id: "actorBtch0000002", name: "Batch Two", attunement: { value: 2, max: 3 }, flags: { [MOD]: { away: [] } } });
  const bond = { actor: full.uuid, key: "kB", name: "Orb", equipped: true, attuned: true, attunement: "required" };
  const arrivals = [
    addItem(F, null, { id: "itemArrA00000001", name: "Amulet", system: { attuned: true, attunement: "required" } }),
    addItem(F, null, { id: "itemArrB00000001", name: "Orb (Batch)", flags: { [MOD]: { bond } } }),
    addItem(F, null, { id: "itemArrC00000001", name: "Brooch", system: { attuned: true, attunement: "required" } }),
  ];
  const created = {};
  const quiet = mark();
  for (const it of arrivals) { it.parent = full; F.fireCall("preCreateItem", it, {}, created); }
  assert.deepEqual(since(quiet, "notify").map(c => c.message), [
    "Brooch arrived already attuned; Batch Two is now over the attunement limit.",
  ]);
});

test("createItem (own user, bond, home): bond cleared, away/slots written, BackInHand toast — in that order", async () => {
  const actor = makeActor(F, { id: "actorHome0000001", name: "Talo Home",
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff", img: "i" }], slots: ["away:k1", "itemCloak0000001", null] } },
    items: [{ id: "itemCloak0000001", name: "Cloak", system: { attuned: true } }] });
  const bond = { actor: actor.id, key: "k1", name: "Staff", equipped: true, attuned: true, attunement: "required" };
  const staff = addItem(F, actor, { id: "itemStaff0000001", name: "Staff", system: { attuned: true }, flags: { [MOD]: { bond } } });
  const from = mark();
  F.fire("createItem", staff, {}, GM);
  await flush();
  mock.timers.tick(750);                      // [declared] ATT-AC-1-residual: one tab claims the hand-back
  await flush();
  const seq = since(from).filter(c => ["update", "notify"].includes(c.op)).map(c => (c.op === "notify" ? ["notify", c.message] : ["update", c.documentName, c.changes]));
  assert.deepEqual(seq, [
    ["update", "Item", { "flags.pentaryn-attunement.claims.home": "socket-gm-1" }],
    // [declared] v14 hygiene: _del, not -=; ATT-AC-1-residual: the claim is cleared in the same write
    ["update", "Item", { "flags.pentaryn-attunement.bond": "<_del>", "flags.pentaryn-attunement.claims.home": "<_del>" }],
    ["update", "Actor", { "flags.pentaryn-attunement.away": [], "flags.pentaryn-attunement.slots": ["itemStaff0000001", "itemCloak0000001"] }],
    ["notify", "Staff is back with Talo Home — attunement restored."],
  ]);
});

test("createItem: another user's create, or a bond for another actor, does nothing here", async () => {
  const actor = makeActor(F, { id: "actorElse0000001", name: "Else" });
  const bond = { actor: "someoneElse00001", key: "k9", name: "Orb" };
  const orb = addItem(F, actor, { id: "itemOrb000000001", name: "Orb", flags: { [MOD]: { bond } } });
  const from = mark();
  F.fire("createItem", orb, {}, "otherUser0000001");
  F.fire("createItem", orb, {}, GM);
  await flush();
  assert.deepEqual(since(from).filter(c => ["update", "notify", "delete"].includes(c.op)), []);
});

test("createItem with a coin-purse bond: claimed, currency summed, purse deleted, CoinBack toast", async () => {
  const actor = makeActor(F, { id: "actorCoin0000001", name: "Coiner", currency: { gp: 2, sp: 1 } });
  const bond = { actor: actor.id, key: "kc", name: "Coin Purse", currency: { gp: 5, cp: 3 } };
  const purse = addItem(F, actor, { id: "itemPurse0000001", name: "Coin Purse (Coiner)", type: "loot", flags: { [MOD]: { bond } } });
  const from = mark();
  F.fire("createItem", purse, {}, GM);
  await flush();
  mock.timers.tick(750);                      // [declared] W2-A1: the claim settles before paying
  await flush();
  const seq = since(from).filter(c => ["update", "delete", "notify"].includes(c.op)).map(c => [c.op, c.documentName ?? c.message, c.changes ?? null]);
  assert.deepEqual(seq, [
    ["update", "Item", { "flags.pentaryn-attunement.claims.coinBack": "socket-gm-1" }],
    ["update", "Actor", { "system.currency.gp": 7, "system.currency.cp": 3 }],
    ["delete", "Item", null],
    ["notify", "Coiner recovers their coin.", null],
  ]);
});

test("[declared] W2-A1: two GM tabs see one coin-purse createItem — the purse pays once", async () => {
  const actor = makeActor(F, { id: "actorCoin0000002", name: "Twotab", currency: { gp: 2 } });
  const bond = { actor: actor.id, key: "kc2", name: "Coin Purse", currency: { gp: 5 } };
  const purse = addItem(F, actor, { id: "itemPurse0000002", name: "Coin Purse (Twotab)", type: "loot", flags: { [MOD]: { bond } } });
  const from = mark();
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("createItem", purse, {}, GM);         // the MCP bridge tab
    F.become({ socketId: "socket-browser" });
    F.fire("createItem", purse, {}, GM);         // a GM browser tab, same user
    await flush();
    mock.timers.tick(750);
    await flush();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  const pays = since(from).filter(c => c.op === "update" && c.documentName === "Actor");
  assert.deepEqual(pays.map(c => c.changes), [{ "system.currency.gp": 7 }], "paid once");
  assert.equal(since(from, "delete").length, 1, "deleted once");
  assert.equal(since(from, "notify").length, 1, "one toast");
});

test("[declared] W2-A1: the later claim wins when both tabs write before either reads back", async () => {
  const actor = makeActor(F, { id: "actorCoin0000003", name: "Racer", currency: { gp: 0 } });
  const bond = { actor: actor.id, key: "kc3", name: "Coin Purse", currency: { gp: 4 } };
  const purse = addItem(F, actor, { id: "itemPurse0000003", name: "Coin Purse (Racer)", type: "loot", flags: { [MOD]: { bond } } });
  const from = mark();
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("createItem", purse, {}, GM);
    // the browser tab's claim lands second on the server; it read no claim before writing
    purse.flags[MOD].claims = { coinBack: "socket-browser" };
    F.become({ socketId: "socket-browser" });
    F.fire("createItem", purse, {}, GM);
    await flush();
    mock.timers.tick(750);
    await flush();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  const pays = since(from).filter(c => c.op === "update" && c.documentName === "Actor");
  assert.deepEqual(pays.map(c => c.changes), [{ "system.currency.gp": 4 }], "paid once");
  assert.equal(since(from, "delete").length, 1, "deleted once");
});

test("[declared] W2-A1 follow-up: preCreateItem clears a stale claims.coinBack copied with the purse", () => {
  // A purse copied (toObject) inside the chest's 750 ms claim window carries that tab's stamp; left
  // in place, claimDocument reads it as held and every other tab stands down — nobody pays.
  const actor = makeActor(F, { id: "actorStal0000001", name: "Staler", currency: { gp: 1 } });
  const bond = { actor: actor.id, key: "ks", name: "Coin Purse", currency: { gp: 12, sp: 3 } };
  const purse = addItem(F, null, { id: "itemStal00000001", name: "Coin Purse (Staler)", type: "loot",
    flags: { [MOD]: { bond, claims: { coinBack: "socket-gone" } } } });
  purse.parent = actor;
  const from = mark();
  F.fireCall("preCreateItem", purse, {}, {});
  assert.deepEqual(since(from, "updateSource").map(c => c.changes), [
    { name: "Coin Purse", "flags.pentaryn-attunement.claims.coinBack": "<_del>" },
  ]);
});

test("W2-A1 follow-up: a stale claim cleared before create — the purse is claimed afresh and pays once", async () => {
  const actor = makeActor(F, { id: "actorStal0000002", name: "Restaler", currency: { gp: 1 } });
  const bond = { actor: actor.id, key: "ks2", name: "Coin Purse", currency: { gp: 12 } };
  const purse = addItem(F, null, { id: "itemStal00000002", name: "Coin Purse (Restaler)", type: "loot",
    flags: { [MOD]: { bond, claims: { coinBack: "socket-gone" } } } });
  purse.parent = actor;
  F.fireCall("preCreateItem", purse, {}, {});
  const cleared = since(0, "updateSource").at(-1).changes;
  if (cleared["flags.pentaryn-attunement.claims.coinBack"] === "<_del>") delete purse.flags[MOD].claims.coinBack;
  actor.items.set?.(purse.id, purse);
  const from = mark();
  F.fire("createItem", purse, {}, GM);
  await flush();
  mock.timers.tick(750);
  await flush();
  const pays = since(from).filter(c => c.op === "update" && c.documentName === "Actor");
  assert.deepEqual(pays.map(c => c.changes), [{ "system.currency.gp": 13 }], "paid once");
  assert.equal(since(from, "delete").length, 1, "the purse deletes itself");
});

test("preCreateItem: a purse with a claim arriving in a pile keeps its stamp (no updateSource)", () => {
  const pile = makeActor(F, { id: "actorPile0000002", name: "Chest" });
  game.itempiles = { API: { isValidItemPile: a => a === pile } };
  const bond = { actor: "actorStal0000001", key: "ks", name: "Coin Purse", currency: { gp: 1 } };
  const purse = addItem(F, null, { id: "itemStal00000003", name: "Coin Purse (Staler)", type: "loot",
    flags: { [MOD]: { bond, claims: { coinBack: "socket-gone" } } } });
  purse.parent = pile;
  const from = mark();
  F.fireCall("preCreateItem", purse, {}, {});
  assert.deepEqual(since(from, "updateSource"), []);
  delete game.itempiles;
});

test("stash(): container creates, owner deletes, owner update — in that order; resolves the create count (golden/stash.json)", async () => {
  F.resetIds();
  const owner = makeActor(F, { id: "actorOwnr0000001", name: "Talo Vesk", currency: { gp: 5, sp: 0 },
    flags: { [MOD]: { slots: ["c"] } },
    items: [
      { id: "c", name: "Cloak", system: { attuned: true }, source: { name: "Cloak", system: { attuned: true, equipped: true, attunement: "required", container: "bag" } } },
      { id: "t1", name: "Torch", type: "loot", system: { quantity: 2 } },
      { id: "t2", name: "Torch", type: "loot", system: { quantity: 3 } },
    ] });
  const box = makeActor(F, { id: "actorBox00000001", name: "Box" });
  const from = mark();
  const n = await game.pentaryn.attunement.stash(owner, box, ["c", "t1", "t2"], { currency: true });
  const writes = since(from).filter(c => /EmbeddedDocuments$/.test(c.op) || (c.op === "update" && c.documentName === "Actor"));
  assert.deepEqual(writes.map(c => [c.op, c.on ?? c.documentName]), [
    ["createEmbeddedDocuments", "Box"], ["deleteEmbeddedDocuments", "Talo Vesk"], ["update", "Actor"],
  ]);
  assert.deepEqual(writes[1].data, ["c", "t1", "t2"]);
  assert.equal(n, writes[0].data.length);
  pinJSON("stash", { creates: writes[0].data, ownerUpdate: writes[2].changes }, import.meta.url);
});

test("releaseAway(actor, key): setFlag with the entry removed", async () => {
  const actor = makeActor(F, { id: "actorRel00000001", name: "Rel", flags: { [MOD]: { away: [{ key: "a", name: "A" }, { key: "b", name: "B" }] } } });
  const from = mark();
  await game.pentaryn.attunement.releaseAway(actor, "a");
  assert.deepEqual(since(from, "update").map(c => c.changes), [{ "flags.pentaryn-attunement.away": [{ key: "b", name: "B" }] }]);
  assert.deepEqual(game.pentaryn.attunement.away(actor), [{ key: "b", name: "B" }]);
});

test("report('Talo Vesk'): header line, table rows and the return object (golden/report.json)", async () => {
  const actor = makeActor(F, { id: "actorRep00000001", name: "Report Me", attunement: { value: 2, max: 3 },
    flags: { [MOD]: { slots: ["r2", "r1"] } },
    items: [
      { id: "r1", name: "Ring", system: { attunement: "required", attuned: true, equipped: true } },
      { id: "r2", name: "Rod", system: { attunement: "required", attuned: true } },
      { id: "r3", name: "Cloak", system: { attunement: "required", attuned: false }, source: { name: "Cloak", system: { attunement: "required", attuned: true } } },
      { id: "r5", name: "Boots", system: { attunement: "", attuned: false, magical: false }, source: { name: "Boots", system: { attunement: "required" } } },
      { id: "r4", name: "Rope", system: {} },
    ] });
  let out;
  const lines = await withConsole(() => { out = game.pentaryn.attunement.report("Report Me"); });
  assert.equal(lines[0][1], "pentaryn-attunement | Report Me — 2/3");
  assert.deepEqual(game.pentaryn.attunement.report(actor.id), out);
  pinJSON("report", { lines, out }, import.meta.url);
});

test("report('nope') with no controlled token: undefined and one console.warn", async () => {
  let out = "unset";
  const lines = await withConsole(() => { out = game.pentaryn.attunement.report("nope"); });
  assert.equal(out, undefined);
  assert.deepEqual(lines, [["warn", 'pentaryn-attunement | no actor "nope"']]);   // [declared] EC-6: names the string
});

test("[declared] EC-6: a misspelt name or a non-Actor object never falls back to the controlled token", async () => {
  const held = makeActor(F, { id: "actorHeld0000001", name: "Held Token", attunement: { value: 0, max: 3 } });
  const keep = canvas.tokens.controlled;
  canvas.tokens.controlled = [{ actor: held }];
  try {
    const api = game.pentaryn.attunement;
    let miss = "unset", obj = "unset", none = "unset";
    const lines = await withConsole(() => {
      miss = api.report("Misspelt Name");
      obj = api.report({ name: "Held Token" });
    });
    assert.equal(miss, undefined, "a string that names no actor is a miss, not the controlled token");
    assert.equal(obj, undefined, "a non-Actor object is a miss");
    assert.deepEqual(lines, [["warn", 'pentaryn-attunement | no actor "Misspelt Name"'], ["warn", "pentaryn-attunement | no actor"]]);
    await withConsole(() => { none = api.report(undefined, { quiet: true }); });
    assert.equal(none?.actor, "Held Token", "no target still defaults to the controlled token");
    assert.equal(api.report(null, { quiet: true })?.actor, "Held Token");
  } finally {
    canvas.tokens.controlled = keep;
  }
});

test("computeSlots is idempotent over the legacy fixture shapes (items-journal-13 seam)", () => {
  const actor = (attuned, slots, max = 3, away = []) => ({
    system: { attributes: { attunement: { max } } },
    items: attuned.map(id => ({ id, system: { attuned: true } })),
    getFlag: (_m, k) => (k === "away" ? away : slots),
  });
  for (const a of [actor([], undefined), actor(["a", "b", "c"], ["c", "a", "b"]), actor(["a"], ["gone", "a"]), actor(["a"], "corrupt"),
    actor(["a", "b", "c", "d"], undefined), actor(["a"], [], 0), actor(["a"], ["away:k"], 3, [{ key: "k" }])]) {
    assert.deepEqual(entry.computeSlots(a), entry.computeSlots(a));
    assert.deepEqual(entry.computeSlots(a), oracle.computeSlots(a), "the oracle copy is verbatim");
  }
});

// Keep LAST: a second import runs a second ready tick; the guard must not wrap itself.
test("a second install keeps the same guarded reference", async () => {
  const proto = Object.getPrototypeOf(game.dnd5e.tooltips);
  const guarded = proto._positionItemTooltip;
  await import("../attunement.mjs?second");
  await withConsole(async () => {
    F.fire("ready");
    mock.timers.tick(0);
    await flush();
  });
  assert.equal(proto._positionItemTooltip, guarded);
});
