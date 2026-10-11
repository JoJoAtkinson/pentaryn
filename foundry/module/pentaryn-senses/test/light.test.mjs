/**
 * Characterisation (senses checkpoint, wave 3): the Light cantrip and lit items (light.mjs) as the
 * ACTIVE GM — the use hooks (glue case h), the prompt, cast/end/onMe/pick, the GM reconcile and
 * every hook that queues it, sweep, the spell card, the inventory row (case l), the Token HUD, and
 * the torch-on-create hook (case k, finding -38). Effects are pinned from `F.calls`, in order.
 * Frozen once committed: during the refactor only import paths may change.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import {
  boot, standardWorld, makeActor, makeItem, makeTok, makeLight, activityOf, flush, settle, since, captureConsole, tokenHUD, el,
  ID, MODULE, NOW, LIGHT_SPELL, TORCH, LANTERN, PLAYER,
} from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

// A second caster (Ilsa, linked, on the Cellar) for "two casters, one token", and a Light the
// Goblin's own (unlinked) actor knows, for "an unlinked caster deleted".
const world = standardWorld();
const ilsa = makeActor({ id: "actIlsa000000001", name: "Ilsa", items: [{ ...LIGHT_SPELL, id: "itmIlsaLight0001" }] });
world.actors.push(ilsa);
const [s1] = world.scenes;
const ilsaTok = makeTok({ id: "tokIlsa000000001", name: "Ilsa", actorId: ilsa.id, actorLink: true, x: 700, y: 100 });
ilsaTok.parent = s1; ilsaTok.collection = s1.tokens; s1.tokens.set(ilsaTok.id, ilsaTok);
const gobLight = makeItem({ ...LIGHT_SPELL, id: "itmGobLight00001" }, s1.tokens.get(ID.tGob).actor);
s1.tokens.get(ID.tGob).actor.items.set(gobLight.id, gobLight);

const F = await boot({ world });
await settle(mock);
const scene = id => game.scenes.get(id);
const tok = id => scene(ID.s1).tokens.get(id) ?? scene(ID.s2).tokens.get(id);
const hero = () => game.actors.get(ID.hero);
const lightItem = () => hero().items.get(ID.light);
const L = () => game.pentaryn.senses.light;
const CAST = `flags.${MODULE}.lightCast`;

/** Effects of `fn` (awaited), then of everything it queued (debounces, reconciles, re-syncs). */
async function effects(fn) {
  const mark = F.calls.length;
  const value = await fn();
  await flush();
  await settle(mock);
  // a refusal returns the notification object: keep its message, not the stub's id
  const shown = value && typeof value === "object" && "message" in value && "id" in value ? { notification: value.message } : value;
  return { value: shown === undefined ? "<undefined>" : F.plain(shown), calls: since(mark) };
}

test("preUseActivity (h): the Light cantrip's summon is switched off and the card still posts", async () => {
  const usage = { create: { summons: true } };
  const act = activityOf(lightItem(), "actLightSummon01");
  const mark = F.calls.length;
  assert.equal(F.fireCall("dnd5e.preUseActivity", act, usage), true);
  assert.deepEqual(usage, { create: { summons: false } });
  assert.equal(F.fireCall("dnd5e.preUseActivity", act, {}), true, "no create block: nothing to switch, still no veto");
  assert.equal(F.fireCall("dnd5e.preUseActivity", act, { create: "yes" }), true);
  assert.equal(F.fireCall("dnd5e.preUseActivity", {}, {}), true, "no item");
  assert.equal(F.fireCall("dnd5e.preUseActivity", { type: "attack", item: makeItem({ name: "Sword", type: "weapon" }) }, {}), true);
  await flush();
  assert.deepEqual(since(mark), []);
});

test("preUseActivity (h): a lamp/lantern/torch toggle activity is vetoed and lights the item instead", async () => {
  const lantern = hero().items.get(ID.lantern);
  const r = await effects(() => F.fireCall("dnd5e.preUseActivity", activityOf(lantern, "actLanternUse001"), { consume: true }));
  assert.equal(r.value, false, "the veto");
  pinJSON("light-use-toggle", r.calls, import.meta.url);
  assert.equal(lantern.flags[MODULE].lit, true);
});

test("postUseActivity: the prompt; On me casts on the caster's token and the GM lights it", async () => {
  F.dialogChoice = "me";
  const r = await effects(() => F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01")));
  pinJSON("light-prompt-me", { dialogs: F.dialogs, calls: r.calls }, import.meta.url);
  assert.deepEqual(tok(ID.tHero).flags[MODULE].spellLight.source, lightItem().uuid);
});

test("postUseActivity: Not now / closed do nothing; another item's use is ignored", async () => {
  F.dialogs.length = 0;
  for (const choice of ["cancel", null]) {
    F.dialogChoice = choice;
    const r = await effects(() => F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01")));
    assert.deepEqual(r.calls, []);
  }
  const r = await effects(() => F.fire("dnd5e.postUseActivity", activityOf(hero().items.get(ID.lantern), "actLanternUse001")));
  assert.deepEqual(r.calls, []);
  assert.equal(F.dialogs.length, 2);
});

test("cast: a square — the token light is restored and an AmbientLight sits on the square", async () => {
  const r = await effects(() => L().cast(lightItem(), { x: 333.4, y: 444.6 }));
  pinJSON("light-cast-square", r, import.meta.url);
  assert.equal(tok(ID.tHero).flags[MODULE].spellLight, undefined);
  assert.equal(scene(ID.s1).lights.size, 1);
});

test("cast: refusals", async () => {
  const r = await effects(async () => [
    await L().cast(null, { x: 1, y: 1 }),
    await L().cast(lightItem(), null),
    await L().cast(lightItem(), {}),
    await L().cast(lightItem(), { token: "  " }),
    await L().cast(lightItem(), { x: "1", y: 2 }),
  ]);
  assert.deepEqual(r, { value: [false, false, false, false, false], calls: [] });
});

test("cast: a token on another scene; the GM can always name it", async () => {
  const r = await effects(() => L().cast(lightItem(), { scene: ID.s2, token: ID.tGob2 }));
  pinJSON("light-cast-other-scene", r, import.meta.url);
});

test("reconcile: a cast token that moved scenes is corrected silently; a gone token ends the light and tells the owners", async () => {
  // move the Road goblin to the Cellar under the same id (a portal crossing)
  const g2 = tok(ID.tGob2);
  scene(ID.s2).tokens.delete(g2.id);
  g2.parent = scene(ID.s1);
  scene(ID.s1).tokens.set(g2.id, g2);
  const moved = await effects(() => L().reconcile(lightItem().uuid));
  // now delete it outright (no hook: the reconcile finds it gone)
  scene(ID.s1).tokens.delete(g2.id);
  const gone = await effects(() => L().reconcile(lightItem().uuid));
  pinJSON("light-reconcile-moved-gone", { moved, gone }, import.meta.url);
  g2.parent = scene(ID.s2);
  scene(ID.s2).tokens.set(g2.id, g2);
});

test("reconcile: a cast whose scene no longer exists is cleared", async () => {
  await lightItem().update({ [CAST]: { scene: "scnGone000000001", token: null, x: 50, y: 50, at: 1 } });
  const r = await effects(() => L().reconcile(lightItem().uuid));
  pinJSON("light-reconcile-scene-gone", r, import.meta.url);
});

test("two casters, one token: the newest wins and the first caster's Light lets go", async () => {
  const ilsaLight = ilsa.items.get("itmIlsaLight0001");
  const first = await effects(() => L().cast(lightItem(), { token: ID.tStake }));
  const second = await effects(() => L().cast(ilsaLight, { token: ID.tStake }));
  pinJSON("light-two-casters", { first, second }, import.meta.url);
  assert.equal(lightItem().flags[MODULE].lightCast, null);
  assert.equal(tok(ID.tStake).flags[MODULE].spellLight.source, ilsaLight.uuid);
  // prior kept from before ANY spell
  assert.deepEqual(tok(ID.tStake).flags[MODULE].spellLight.prior, { dim: 0, bright: 0 });
  await effects(() => L().end(ilsaLight));
});

test("end: puts the light out; nothing lit → a note and false", async () => {
  await effects(() => L().cast(lightItem(), { token: ID.tHero }));
  const ended = await effects(() => L().end(lightItem()));
  const none = await effects(() => L().end(lightItem()));
  const nullItem = await effects(() => L().end(null));
  pinJSON("light-end", { ended, none, nullItem }, import.meta.url);
});

test("onMe: no scene viewed / no token of the caster on it", async () => {
  const sceneNow = F.canvas.scene;
  F.canvas.scene = null;
  const noScene = await effects(() => L().onMe(lightItem()));
  F.canvas.scene = scene(ID.s2);
  const ilsaOnRoad = await effects(() => L().onMe(ilsa.items.get("itmIlsaLight0001")));
  F.canvas.scene = sceneNow;
  // a controlled token is preferred over the linked one
  const extra = makeTok({ id: "tokHero000000003", name: "Marrith (twin)", actorId: ID.hero, actorLink: false });
  extra.parent = scene(ID.s1); extra.collection = scene(ID.s1).tokens; scene(ID.s1).tokens.set(extra.id, extra);
  extra.object = { controlled: true };
  const controlled = await effects(() => L().onMe(lightItem()));
  await effects(() => L().end(lightItem()));
  scene(ID.s1).tokens.delete(extra.id);
  pinJSON("light-onme", { noScene, ilsaOnRoad, controlled }, import.meta.url);
});

/** A placeable under the pointer. */
const placeable = (doc, { x, y, w = 100, h = 100, visible = true } = {}) => ({
  visible, document: doc, bounds: { contains: (px, py) => px >= x && px < x + w && py >= y && py < y + h },
});
const pointer = (target, { button = 0, x = 0, y = 0 } = {}) => ({
  target, button, clientX: x, clientY: y, stopped: 0, prevented: 0,
  stopImmediatePropagation() { this.stopped++; }, preventDefault() { this.prevented++; },
});

test("pick (l): collapses Argon's panels, then a click on a token, a square, right-click, Esc, timeout", async () => {
  const W = globalThis.window, view = F.canvas.app.view;
  const argon = [];
  globalThis.ui.ARGON = { collapseAllPanels: () => argon.push("collapse") };
  F.canvas.tokens.placeables = [
    placeable(tok(ID.tGob), { x: 300, y: 100 }),
    placeable(tok(ID.tStake), { x: 300, y: 100 }),                 // same square, higher sort wins
    placeable(tok(ID.tHulk), { x: 500, y: 500, visible: false }),
  ];
  tok(ID.tStake).sort = 5;
  const rows = {};
  const mark = F.calls.length;

  let p = L().pick();
  rows.picking = { view: view.classList.contains("ps-picking"), body: document.body.classList.contains("ps-picking"), listeners: [W.count("pointerdown"), W.count("keydown")] };
  W.dispatch("pointerdown", pointer(el("div"), { x: 310, y: 110 }));   // not the board: ignored
  const down = pointer(view, { x: 310, y: 110 });
  W.dispatch("pointerdown", down);
  rows.token = await p;
  rows.swallowed = { stopped: down.stopped, prevented: down.prevented, pointerupOnce: W.count("pointerup") };
  W.dispatch("pointerup", pointer(view));
  rows.pointerupAfter = W.count("pointerup");
  rows.cleaned = { view: view.classList.contains("ps-picking"), body: document.body.classList.contains("ps-picking"), listeners: [W.count("pointerdown"), W.count("keydown")] };

  p = L().pick();
  W.dispatch("pointerdown", pointer(view, { x: 520, y: 530 }));      // the hidden Hulk: the square instead
  rows.square = await p;

  p = L().pick();
  W.dispatch("pointerdown", pointer(view, { button: 1, x: 10, y: 10 }));   // middle: ignored
  W.dispatch("pointerdown", pointer(view, { button: 2 }));
  rows.rightClick = await p;
  rows.contextmenuOnce = W.count("contextmenu");
  mock.timers.tick(800);
  rows.swallowExpired = [W.count("contextmenu"), W.count("pointerup")];

  p = L().pick();
  W.dispatch("keydown", { key: "a", stopImmediatePropagation() {}, preventDefault() {} });
  W.dispatch("keydown", { key: "Escape", stopImmediatePropagation() {}, preventDefault() {} });
  rows.escape = await p;

  p = L().pick();
  mock.timers.tick(60_000);
  rows.timeout = await p;

  p = L().pick();
  const p2 = L().pick();
  rows.secondCancelsFirst = await p;
  F.fire("canvasTearDown");
  rows.tearDownCancels = await p2;

  // an aoe area handle is not a creature
  tok(ID.tGob).flags["pentaryn-aoe"] = { handle: true };
  F.canvas.tokens.placeables = [placeable(tok(ID.tGob), { x: 300, y: 100 })];
  p = L().pick();
  W.dispatch("pointerdown", pointer(view, { x: 310, y: 110 }));
  rows.aoeHandle = await p;
  delete tok(ID.tGob).flags["pentaryn-aoe"];

  rows.argon = argon.length;
  rows.calls = since(mark);
  pinJSON("light-pick", rows, import.meta.url);
  delete globalThis.ui.ARGON;
  delete tok(ID.tStake).sort;
});

test("pick: no canvas → a warning and null; a throwing Argon warns and the pick goes on", async t => {
  const out = captureConsole(t);
  F.canvas.ready = false;
  const mark = F.calls.length;
  assert.equal(await L().pick(), null);
  F.canvas.ready = true;
  globalThis.ui.ARGON = { collapseAllPanels() { throw new Error("argon"); } };
  const p = L().pick();
  globalThis.window.dispatch("keydown", { key: "Escape", stopImmediatePropagation() {}, preventDefault() {} });
  assert.equal(await p, null);
  delete globalThis.ui.ARGON;
  assert.deepEqual(since(mark).filter(c => c.op === "notify" && c.level === "warn"), [{ op: "notify", level: "warn", message: "Open a scene first." }]);
  assert.deepEqual(out, [["warn", `${MODULE} | light collapse HUD panels`, "Error: argon"]]);
});

test("pickAndCast (the prompt's Pick a target): a click casts there; Esc casts nothing", async () => {
  F.canvas.tokens.placeables = [];
  // through the prompt's "pick" choice (pickAndCast is not on the API)
  F.dialogChoice = "pick";
  const mark = F.calls.length;
  const used = F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01"));
  await flush();
  globalThis.window.dispatch("pointerdown", pointer(F.canvas.app.view, { x: 1234, y: 567 }));
  await flush();
  await settle(mock);
  const picked = since(mark);
  const mark2 = F.calls.length;
  F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01"));
  await flush();
  globalThis.window.dispatch("keydown", { key: "Escape", stopImmediatePropagation() {}, preventDefault() {} });
  await flush();
  await settle(mock);
  pinJSON("light-pick-cast", { used: used ?? null, picked, cancelled: since(mark2) }, import.meta.url);
  const r = await effects(() => L().end(lightItem()));
  assert.equal(r.value, true);
});

test("toggle / hood (l): one chat line each, under the chat mode; only lights; hood only on a hooded lantern", async () => {
  const torch = hero().items.get(ID.torch), lantern = hero().items.get(ID.lantern);
  const rows = {};
  rows.torchOn = await effects(() => L().toggle(torch));
  rows.torchOff = await effects(() => L().toggle(torch));
  rows.notALight = await effects(() => L().toggle(lightItem()));
  rows.nullItem = await effects(() => L().toggle(null));
  rows.hoodLower = await effects(() => L().hood(lantern));
  rows.hoodRaise = await effects(() => L().hood(lantern));
  rows.hoodTorch = await effects(() => L().hood(torch));
  F.useRollMode();
  rows.rollModeBranch = await effects(() => L().toggle(lantern));
  await effects(() => L().toggle(lantern));
  pinJSON("light-toggle-hood", rows, import.meta.url);
});

test("toggle: names are escaped in the chat line; a failing chat warns and the toggle still lands", async t => {
  const out = captureConsole(t);
  const odd = makeActor({ id: "actOdd0000000001", name: "<b>Bob</b> & 'Co'", items: [{ ...TORCH, id: "itmOddTorch00001", name: "Torch \"big\"" }] });
  game.actors.set(odd.id, odd);
  const torch = odd.items.get("itmOddTorch00001");
  const escaped = await effects(() => L().toggle(torch));
  F.chatThrows = "chat down";
  const failed = await effects(() => L().toggle(torch));
  F.chatThrows = null;
  game.actors.delete(odd.id);
  pinJSON("light-toggle-escape", { escaped: escaped.calls.filter(c => c.op === "ChatMessage.create"), failed: failed.calls.filter(c => c.op === "update"), console: out }, import.meta.url);
});

/** An inventory list as dnd5e 6 draws it: li[data-item-id] > .item-row > .item-name. */
function sheetFor(actor) {
  const root = el("section", { className: "inventory" });
  for (const item of actor.items) {
    const name = el("div", { className: "item-name" });
    const row = el("div", { className: "item-row", children: [name, el("div", { className: "item-controls" })] });
    root.append(el("li", { className: "item", dataset: { itemId: item.id }, children: [row] }));
  }
  return root;
}

test("inventory row (l): a flame per light; the outshone lantern says which item wins; a hood button while lit", async () => {
  const torch = hero().items.get(ID.torch), lantern = hero().items.get(ID.lantern);
  await effects(() => torch.update({ [`flags.${MODULE}.lit`]: true }));
  await effects(() => lantern.update({ [`flags.${MODULE}.lit`]: true, [`flags.${MODULE}.hooded`]: true }));
  const root = sheetFor(hero());
  F.fire("renderBaseActorSheet", { actor: hero() }, root);
  F.fire("renderBaseActorSheet", { document: hero() }, [root]);   // re-render: no duplicates; jQuery-style element
  const rows = root.children.map(li => ({ item: li.dataset.itemId, row: li.children[0].toJSON() }));
  // clicks: the torch's flame douses it; the lantern's hood raises it
  const torchBtn = root.querySelector(`li[data-item-id="${ID.torch}"]`).querySelector(".ps-light-toggle");
  const clickTorch = await effects(() => { torchBtn.click(); });
  const hoodBtn = root.querySelector(`li[data-item-id="${ID.lantern}"]`).querySelector(".ps-light-hood");
  const clickHood = await effects(() => { hoodBtn.click(); });
  pinJSON("light-sheet", { rows, clickTorch, clickHood }, import.meta.url);
  // no actor / no element: nothing
  F.fire("renderBaseActorSheet", {}, root);
  F.fire("renderBaseActorSheet", { actor: hero() }, null);
  await effects(() => lantern.update({ [`flags.${MODULE}.lit`]: false, [`flags.${MODULE}.hooded`]: false }));
});

/** A dnd5e 6 usage card for `uuid`, with the PHB Light's Summon button in the action row. */
function usageCard({ withOther = false } = {}) {
  const summon = el("li", { children: [el("button", { attrs: { "data-action": "placeSummons" } })] });
  const items = withOther ? [summon, el("li", { children: [el("button", { className: "other" })] })] : [summon];
  const list = el("ul", { className: "unlist", children: items });
  const pills = el("ul", { className: "unlist pills" });
  const section = el("section", { className: "icon-row", children: [pills, list] });
  const card = el("div", { className: "chat-card", children: [el("header"), section] });
  return el("div", { className: "message-content", children: [card] });
}

test("spell card: Summon goes; On me / Pick a target / End light sit in the action row", async () => {
  const message = { type: "usage", system: { item: { uuid: lightItem().uuid } } };
  const a = usageCard();
  F.fire("dnd5e.renderChatMessage", message, a);
  F.fire("dnd5e.renderChatMessage", message, a);   // twice: no duplicates
  const b = usageCard({ withOther: true });
  F.fire("dnd5e.renderChatMessage", message, [b]);
  const untouched = {
    notUsage: (() => { const c = usageCard(); F.fire("dnd5e.renderChatMessage", { ...message, type: "base" }, c); return c.querySelectorAll("[data-ps-light]").length; })(),
    noItem: (() => { const c = usageCard(); F.fire("dnd5e.renderChatMessage", { type: "usage", system: {} }, c); return c.querySelectorAll("[data-ps-light]").length; })(),
    notLight: (() => { const c = usageCard(); F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: hero().items.get(ID.torch).uuid } } }, c); return c.querySelectorAll("[data-action]").length; })(),
    noRoot: F.fire("dnd5e.renderChatMessage", message, null) ?? "ok",
  };
  // the buttons work
  F.dialogChoice = null;
  const me = await effects(() => { a.querySelector('[data-ps-light="me"]').click(); });
  const end = await effects(() => { a.querySelector('[data-ps-light="end"]').click(); });
  pinJSON("light-card", { emptyRow: a.toJSON(), otherRow: b.toJSON(), untouched, me, end }, import.meta.url);
});

test("Token HUD: End light for the GM on a spell-lit token; an orphan (item gone) is put out by the GM", async () => {
  await effects(() => L().cast(lightItem(), { token: ID.tStake }));
  const h = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", h.app, h.element);
  F.fire("renderTokenHUD", h.app, h.element);
  const button = h.col.children.map(c => c.toJSON());
  const click = await effects(() => { h.col.querySelector(".ps-light-end").click(); });
  // orphan: a light whose source item no longer resolves
  await tok(ID.tStake).update({ [`flags.${MODULE}.spellLight`]: { source: `Actor.${ID.hero}.Item.itmVanished00001`, prior: { dim: 0, bright: 0 } }, light: { dim: 40, bright: 20 } });
  const h2 = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", h2.app, h2.element);
  const orphan = await effects(() => { h2.col.querySelector(".ps-light-end").click(); });
  const unlit = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", unlit.app, unlit.element);
  pinJSON("light-hud", { button, renders: h.app.renders, click, orphan, unlitButtons: unlit.col.children.length }, import.meta.url);
});

test("createItem (k, -38): a new Torch gets the Light activity once, from the active GM", async t => {
  const out = captureConsole(t);
  const rows = {};
  const fresh = (extra = {}) => makeItem({ name: "Torch", system: { identifier: "torch" }, ...extra }, hero());
  rows.noActivities = await effects(() => F.fire("createItem", fresh({ id: "itmNewTorch00001" })));
  rows.withActivities = await effects(() => F.fire("createItem", fresh({ id: "itmNewTorch00002", activities: [{ _id: "actA", type: "utility", sort: 7 }, { _id: "actB", type: "attack" }] })));
  rows.alreadyHas = await effects(() => F.fire("createItem", fresh({ id: "itmNewTorch00003", activities: [{ _id: "psLightToggle000", type: "utility" }] })));
  rows.flagged = await effects(() => F.fire("createItem", fresh({ id: "itmNewTorch00004", activities: [{ _id: "actOther", type: "utility", flags: { [MODULE]: { lightToggle: true } } }] })));
  rows.notATorch = await effects(() => F.fire("createItem", makeItem({ id: "itmNewLamp000001", name: "Lamp", system: { identifier: "lamp" } }, hero())));
  rows.noActivityCollection = await effects(() => F.fire("createItem", { name: "Torch", system: { identifier: "torch" } }));
  // KNOWN (-38, declared later): a compendium torch is given the activity too
  rows.packTorch = await effects(() => F.fire("createItem", Object.assign(makeItem({ id: "itmPackTorch0001", name: "Torch", system: { identifier: "torch" } }), { pack: "world.gear" })));
  const bad = fresh({ id: "itmBadTorch00001" });
  bad.throwOnUpdate = "locked";
  rows.throwingUpdate = await effects(() => F.fire("createItem", bad));
  rows.console = out;
  pinJSON("light-torch-create", rows, import.meta.url);
  assert.equal(rows.packTorch.calls.filter(c => c.op === "update").length, 1, "KNOWN -38: pack torches are written");
});

test("GM hooks: deleteItem / createToken / deleteToken (with and without a teleport replacement) / deleteActor", async () => {
  // Foundry removes the document from its collection, then fires the hook: so do these rows.
  const rows = {};
  const light = lightItem();
  const clearSpell = d => { delete d.flags[MODULE].spellLight; };
  // deleteItem of a lit Light: its token light is restored
  await effects(() => L().cast(light, { token: ID.tHulk }));
  hero().items.delete(light.id);
  rows.deleteItem = await effects(() => F.fire("deleteItem", light));
  hero().items.set(light.id, light);
  await effects(() => light.update({ [CAST]: null }));
  rows.deleteItemUnlit = await effects(() => F.fire("deleteItem", hero().items.get(ID.torch)));
  // createToken carrying a spell light queues its source (a converged world: the reconcile writes nothing)
  await effects(() => L().cast(light, { token: ID.tHulk }));
  rows.createTokenCopy = await effects(() => F.fire("createToken", { flags: { [MODULE]: { spellLight: { source: light.uuid } } } }));
  // a core teleport replaced the token's id: the cast follows the new token
  const hulk = tok(ID.tHulk);
  scene(ID.s1).tokens.delete(hulk.id);
  rows.deleteTokenReplaced = await effects(() => F.fire("deleteToken", hulk, { replacements: { [ID.tHulk]: `Scene.${ID.s2}.Token.${ID.tGob2}` } }));
  clearSpell(hulk);
  scene(ID.s1).tokens.set(hulk.id, hulk);
  // the lit token deleted with no replacement: the light ends and the owners are told
  const gob2 = tok(ID.tGob2);
  scene(ID.s2).tokens.delete(gob2.id);
  rows.deleteTokenPlain = await effects(() => F.fire("deleteToken", gob2, {}));
  clearSpell(gob2);
  scene(ID.s2).tokens.set(gob2.id, gob2);
  // an unlinked caster's token deleted: its own Light items' lights are reconciled away
  await effects(() => L().cast(gobLight, { token: ID.tStake }));
  const gob = tok(ID.tGob);
  scene(ID.s1).tokens.delete(gob.id);
  rows.deleteUnlinkedCaster = await effects(() => F.fire("deleteToken", gob, {}));
  scene(ID.s1).tokens.set(gob.id, gob);
  await effects(() => gobLight.update({ [CAST]: null }));
  // a caster actor deleted
  await effects(() => L().cast(light, { token: ID.tStake }));
  const h = hero();
  game.actors.delete(h.id);
  rows.deleteActor = await effects(() => F.fire("deleteActor", h));
  game.actors.set(h.id, h);
  await effects(() => light.update({ [CAST]: null }));
  rows.deleteActorNoLights = await effects(() => F.fire("deleteActor", game.actors.get(ID.stake)));
  pinJSON("light-gm-hooks", rows, import.meta.url);
});

test("GM hooks: a hand-deleted or hand-moved Light square ends or moves the light", async () => {
  const rows = {};
  await effects(() => L().cast(lightItem(), { x: 250, y: 250 }));
  const sq = () => [...scene(ID.s1).lights].find(l => l.flags?.[MODULE]?.spellLight?.source === lightItem().uuid);
  // moved by hand
  const moved = sq();
  moved.x = 450; moved.y = 450.4;
  rows.moved = await effects(() => F.fire("updateAmbientLight", moved, { x: 450, y: 450.4 }));
  rows.notXY = await effects(() => F.fire("updateAmbientLight", moved, { config: {} }));
  rows.sameSpot = await effects(() => F.fire("updateAmbientLight", moved, { x: 450 }));
  // a twin at the wanted spot: the moved one is not the light any more
  const twin = makeLight({ id: "lgtTwin000000001", x: 450, y: 450, flags: { [MODULE]: { spellLight: { source: lightItem().uuid } } } }, scene(ID.s1));
  moved.x = 10;
  rows.movedWithTwin = await effects(() => F.fire("updateAmbientLight", moved, { x: 10 }));
  // deleted by hand: with the twin standing, nothing; then the twin itself
  scene(ID.s1).lights.delete(moved.id);
  rows.deletedWithTwin = await effects(() => F.fire("deleteAmbientLight", { ...moved, x: 450, y: 450, flags: moved.flags, parent: scene(ID.s1), id: "lgtGhost00000001" }));
  scene(ID.s1).lights.delete(twin.id);
  rows.deletedWanted = await effects(() => F.fire("deleteAmbientLight", twin));
  rows.notSpellLight = await effects(() => F.fire("deleteAmbientLight", makeLight({ id: "lgtPlain00000001" }, scene(ID.s1))));
  pinJSON("light-squares", rows, import.meta.url);
});

test("GM hooks: deleteScene sweeps 500 ms later; updateItem without a cast change queues nothing", async () => {
  makeLight({ id: "lgtOrphanScene01", x: 50, y: 50, flags: { [MODULE]: { spellLight: { source: "Scene.scnGone000000001.Token.tokGone000000001.Actor.actGone000000001.Item.itmGone000000001" } } } }, scene(ID.s1));
  const mark = F.calls.length;
  F.fire("deleteScene", {});
  F.fire("deleteScene", {});
  mock.timers.tick(499);
  await flush();
  const before = since(mark).length;
  const r = await effects(() => { mock.timers.tick(1); });
  const noCast = await effects(() => F.fire("updateItem", lightItem(), { name: "x" }));
  assert.equal(before, 0);
  pinJSON("light-delete-scene", { swept: r.calls, noCast }, import.meta.url);
});

test("sweep / reconcile: an orphan spell light is put out; old PHB summons go (by origin or by compendium source); errors warn", async t => {
  const out = captureConsole(t);
  // an orphan square and an orphan token light (their item never existed)
  makeLight({ id: "lgtOrphan0000001", x: 50, y: 50, flags: { [MODULE]: { spellLight: { source: "Actor.actNobody000000.Item.itmNothing000000" } } } }, scene(ID.s2));
  tok(ID.tHero2).flags[MODULE] = { spellLight: { source: "Actor.actNobody000000.Item.itmNothing000000", prior: { dim: 5, bright: 0 } } };
  // a floor summon whose base actor came from the PHB Light compendium actor
  const phb = makeActor({ id: "actPhbLight00001", name: "Light", type: "npc", _stats: { compendiumSource: "Compendium.dnd5e.phb.Actor.phbsplLight00000" } });
  game.actors.set(phb.id, phb);
  const floor = makeTok({ id: "tokPhbFloor00001", name: "Light", actorId: phb.id, actorLink: true });
  floor.parent = scene(ID.s2); floor.collection = scene(ID.s2).tokens; scene(ID.s2).tokens.set(floor.id, floor);
  const swept = await effects(() => L().sweep());
  // a reconcile that throws is caught and warned with its source
  scene(ID.s1).throwOnUpdate = "db down";
  await lightItem().update({ [CAST]: { scene: ID.s1, token: ID.tHero, x: null, y: null, at: 9 } });
  await effects(() => L().reconcile(lightItem().uuid));
  await lightItem().update({ [CAST]: null });
  const failed = await effects(() => L().reconcile(lightItem().uuid));
  scene(ID.s1).throwOnUpdate = null;
  const fixed = await effects(() => L().reconcile(lightItem().uuid));
  pinJSON("light-sweep", { swept, failed, fixed, console: out }, import.meta.url);
});

test("reconcile: a restored token re-applies the caster's carried torch (syncLight on the base actor)", async () => {
  const torch = hero().items.get(ID.torch);
  await effects(() => L().toggle(torch));
  const cast = await effects(() => L().cast(lightItem(), { token: ID.tHero }));
  const ended = await effects(() => L().end(lightItem()));
  await effects(() => L().toggle(torch));
  pinJSON("light-restore-carried", { cast, ended }, import.meta.url);
});

test("reconcile / sweep off the active GM do nothing", async () => {
  F.become({ userId: PLAYER });
  const r = await effects(async () => [await L().sweep(), await L().reconcile(lightItem().uuid)]);
  F.become({ userId: "gmUser0000000001" });
  assert.deepEqual(r.value, [{ sources: 0, removed: 0 }, null]);
  assert.deepEqual(r.calls, []);
});

test("hostile paths: v13 restore without `_del`, an unresolvable uuid, a failing whisper, a card with no action row", async t => {
  const out = captureConsole(t);
  const rows = {};
  // v13: the restore writes the '-=' key
  await effects(() => L().cast(lightItem(), { token: ID.tHulk }));
  await lightItem().update({ [CAST]: null });
  const saved = Object.getOwnPropertyDescriptor(globalThis, "_del");
  delete globalThis._del;
  rows.restoreV13 = await effects(() => L().reconcile(lightItem().uuid));
  Object.defineProperty(globalThis, "_del", saved);
  // fromUuidSync throwing: the item is treated as gone
  const fus = globalThis.fromUuidSync;
  globalThis.fromUuidSync = uuid => { if (String(uuid).includes("Boom")) throw new Error("bad uuid"); return fus(uuid); };
  rows.throwingUuid = await effects(() => L().reconcile("Actor.Boom.Item.Boom"));
  globalThis.fromUuidSync = fus;
  // the "gone" whisper fails: warned, the flag is still cleared
  await lightItem().update({ [CAST]: { scene: ID.s1, token: "tokNotHere000001", x: null, y: null, at: 3 } });
  F.chatThrows = "chat down";
  rows.whisperFails = await effects(() => L().reconcile(lightItem().uuid));
  F.chatThrows = null;
  // a usage card with no action row at all gets one
  const bare = el("div", { className: "message-content", children: [el("div", { className: "chat-card" })] });
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: lightItem().uuid } } }, bare);
  rows.bareCard = bare.toJSON();
  const noContent = el("div");
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: lightItem().uuid } } }, noContent);
  rows.noContent = noContent.children.length;
  rows.console = out;
  pinJSON("light-hostile", rows, import.meta.url);
});

test("pick hostile paths: a throwing hit test finishes with null; a failing note removal warns", async t => {
  const out = captureConsole(t);
  const W = globalThis.window, view = F.canvas.app.view;
  const ccfc = F.canvas.canvasCoordinatesFromClient;
  F.canvas.canvasCoordinatesFromClient = () => { throw new Error("no coords"); };
  const remove = F.ui.notifications.remove;
  F.ui.notifications.remove = () => { throw new Error("no note"); };
  const p = L().pick();
  W.dispatch("pointerdown", pointer(view, { x: 1, y: 1 }));
  const got = await p;
  F.canvas.canvasCoordinatesFromClient = ccfc;
  F.ui.notifications.remove = remove;
  mock.timers.tick(800);
  assert.equal(got, null);
  assert.deepEqual(out, [
    ["warn", `${MODULE} | light pick`, "Error: no coords"],
    ["warn", `${MODULE} | light pick note`, "Error: no note"],
  ]);
});

test("console text (i): every async failure in light warns 'pentaryn-senses | light <label>' and rejects nothing", async t => {
  const out = captureConsole(t);
  const torch = hero().items.get(ID.torch);
  // toggle from the use hook
  torch.throwOnUpdate = "toggle down";
  F.fireCall("dnd5e.preUseActivity", { type: "utility", item: torch }, {});
  await flush();
  // the inventory flame
  const root = sheetFor(hero());
  F.fire("renderBaseActorSheet", { actor: hero() }, root);
  root.querySelector(`li[data-item-id="${ID.torch}"]`).querySelector(".ps-light-toggle").click();
  await flush();
  torch.throwOnUpdate = null;
  // the prompt
  const wait = F.foundry.applications.api.DialogV2.wait;
  F.foundry.applications.api.DialogV2.wait = async () => { throw new Error("dialog down"); };
  F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01"));
  await flush();
  F.foundry.applications.api.DialogV2.wait = wait;
  // the card's buttons and the HUD's End light
  const card = usageCard();
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: lightItem().uuid } } }, card);
  lightItem().flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
  lightItem().throwOnUpdate = "item down";
  card.querySelector('[data-ps-light="end"]').click();
  await flush();
  await lightItem().update({}).catch(() => {});
  tok(ID.tStake).flags[MODULE] = { spellLight: { source: lightItem().uuid, prior: null } };
  lightItem().flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
  const h = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", h.app, h.element);
  h.col.querySelector(".ps-light-end").click();
  await flush();
  // hand-moved / hand-deleted squares and a teleport retarget whose item write fails
  lightItem().flags[MODULE] = { lightCast: { scene: ID.s1, token: null, x: 50, y: 50 } };
  const sq = makeLight({ id: "lgtHostile000001", x: 50, y: 50, flags: { [MODULE]: { spellLight: { source: lightItem().uuid } } } }, scene(ID.s1));
  sq.x = 70;
  F.fire("updateAmbientLight", sq, { x: 70 });
  sq.x = 50;
  scene(ID.s1).lights.delete(sq.id);
  F.fire("deleteAmbientLight", sq);
  lightItem().flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
  F.fire("deleteToken", tok(ID.tStake), { replacements: { [ID.tStake]: `Scene.${ID.s2}.Token.${ID.tGob2}` } });
  await flush();
  lightItem().throwOnUpdate = null;
  lightItem().flags[MODULE] = {};
  delete tok(ID.tStake).flags[MODULE].spellLight;
  // the deleteScene sweep
  const sweepScenes = F.game.scenes;
  F.game.scenes = { [Symbol.iterator]() { throw new Error("scenes down"); } };
  F.fire("deleteScene", {});
  mock.timers.tick(500);
  await flush();
  F.game.scenes = sweepScenes;
  await settle(mock);
  pinJSON("light-console", out, import.meta.url);
});
