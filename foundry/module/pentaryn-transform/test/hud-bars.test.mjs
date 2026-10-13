// HUD composition (hud-panels.mjs): the Bonus, Action and Special bars recomposed in
// renderActionPanelArgonComponent, the Reaction slot's title, the portrait line and HP, the effect
// tooltip, badge refreshes, the Starry rebuild, the Chalice offer and tooltip hygiene. Argon is the
// stand-in in fixtures/argon.mjs; each bar is pinned as the list of buttons it ends with.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { EFFECT_ID } from "../transform-core.mjs";
import { StubCollection } from "./kit/foundry-stub.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses", { id: "pentaryn-combat", active: false }] });
const savedArgon = F.CONFIG.ARGON;
const T = await import("../transform.mjs");
const S = await import("../starry-adapter.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
const A = F.A;
const file = import.meta.url;

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const desc = b => ({ cls: b.constructor.name, label: b.label ?? null, item: b.item?.id ?? null, classes: b.element.className, rendered: b.rendered ?? 0 });
const bar = p => p._buttons.map(desc);
const fire = (p, actor) => Hooks.callAll("renderActionPanelArgonComponent", p, p.element, actor);

function fresh(opts) {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  game.time.worldTime = 0;
  F.become({ userId: IDS.gm });
  ui.ARGON._actor = null;
  ui.ARGON._token = null;
  ui.ARGON.components = { main: [], portrait: null };
  game.combats.clear();
  return F.W.talo(opts);
}
const slot = (item = null) => new A.DND5eItemButton({ item, isWeaponSet: true });
const btn = item => new A.DND5eItemButton({ item, inActionPanel: true });

/* ── before anything is borrowed ──────────────────────────────────────────── */

test("no Argon classes, or no weapon-set slot to borrow Argon's dnd5e button from: the bar is left as it is", () => {
  const { talo } = fresh();
  F.CONFIG.ARGON = undefined;
  const p = A.panel("DND5E.BonusAction", [slot()]);
  fire(p, talo);
  assert.equal(p.visibility, 0);
  F.CONFIG.ARGON = savedArgon;
  const q = A.panel("DND5E.BonusAction", [btn(talo.items.get(IDS.ws))]);
  fire(q, talo);
  assert.equal(q.visibility, 0, "no weapon-set slot seen yet: no button class");
  assert.deepEqual(bar(q).map(b => b.cls), ["DND5eItemButton"]);
});

/* ── the Bonus bar ────────────────────────────────────────────────────────── */

test("Bonus bar, normal form: Wild Shape and Starry Form replace their split pair (golden/bonus-normal.json)", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.BonusAction", [slot(), new A.SplitButton(btn(talo.items.get(IDS.ws)), btn(talo.items.get(IDS.starry))),
    new A.SplitButton(btn(talo.items.get(IDS.companion)), btn(talo.items.get(IDS.spellcasting)))]);
  const old = p._buttons.slice();
  fire(p, talo);
  await flush();
  pinJSON("bonus-normal", bar(p), file);
  assert.equal(old[1].element.parentElement, null, "the replaced split is removed from the DOM");
  assert.equal(p.visibility, 1);
  assert.ok(p._buttons.every(b => b._parent === p && b.element.parentElement === p.element));
});

test("Bonus bar, shifted with no revert item: Return (highlighted) and Change Form right after the weapon set", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const p = A.panel("DND5E.BonusAction", [slot(wolf.items.get("mmBite0000000001")), btn(wolf.items.get(IDS.cure))]);
  fire(p, wolf);
  await flush();
  pinJSON("bonus-shifted", bar(p), file);
});

test("Bonus bar, shifted with a revert item: the item's own button, highlighted; the Bonus Action marked used this turn", async () => {
  const { talo } = fresh({ revertItem: true });
  const wolf = await T.shift(talo, "p1");
  const tokenId = talo._tokens[0].id;
  game.combats.set("c1", { id: "c1", started: true, round: 1, turn: 0, combatant: { tokenId } });
  wolf._tokens = talo._tokens;
  T.markBonusUsed(wolf);
  ui.ARGON._token = { id: tokenId };
  const p = A.panel("DND5E.BonusAction", [slot(), new A.SplitButton(btn(wolf.items.get(IDS.revert)), btn(wolf.items.get(IDS.cure)))]);
  fire(p, wolf);
  await flush();
  pinJSON("bonus-shifted-revert-item", bar(p), file);
  assert.equal(p.isActionUsed, true);
  assert.equal(p.actionUse, 1);
});

test("Bonus bar: an actor with neither Wild Shape nor a revert item is left alone; the panel's own actor is the fallback", async () => {
  fresh();
  const bob = F.W.makeActor({ items: [{ id: "x1", name: "Second Wind", type: "feat" }] });
  const p = A.panel("DND5E.BonusAction", [slot(), btn(bob.items.get("x1"))]);
  fire(p, bob);
  assert.equal(p.visibility, 0);
  const { talo } = fresh();
  const q = A.panel("DND5E.BonusAction", [slot()]);
  q.actor = talo;
  Hooks.callAll("renderActionPanelArgonComponent", q, q.element, undefined);
  await flush();
  assert.deepEqual(bar(q).map(b => b.cls), ["DND5eItemButton", "WildShapeButton", "StarryFormButton"]);
});

test("Bonus bar while Starry Form glimmers: the Archer's / Chalice's activity sits beside it; Dragon has none", async () => {
  for (const c of ["archer", "chalice", "dragon"]) {
    const { talo } = fresh();
    await S.assumeStarry(talo, c);
    const p = A.panel("DND5E.BonusAction", [slot(), btn(talo.items.get(IDS.ws)), btn(talo.items.get(IDS.starry))]);
    fire(p, talo);
    await flush();
    pinJSON(`bonus-starry-${c}`, bar(p), file);
  }
});

test("renderActionPanel: a composition error logs 'HUD composition failed'; other bars are ignored", async () => {
  fresh();
  F.console.length = 0;
  const p = A.panel("DND5E.BonusAction", [slot()]);
  Object.defineProperty(p, "_buttons", { get() { throw new Error("argon changed"); } });
  fire(p, F.W.talo().talo);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["error", "pentaryn-transform | HUD composition failed"]]);
  const r = A.panel("DND5E.Reaction", [slot()]);
  fire(r, F.W.talo().talo);
  assert.equal(r.visibility, 0);
});

/* ── the Action bar ───────────────────────────────────────────────────────── */

test("Action bar in a form: the slot hides, the beast's attacks and Multiattack join after it; a panel of covered features goes", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const panelBtn = new A.ButtonPanelButton();
  panelBtn.items = [{ item: wolf.items.get("mmMultiattack001") }];
  const keepPanel = new A.ButtonPanelButton();
  keepPanel.items = [{ item: wolf.items.get("mmMultiattack001") }, { id: "somethingElse" }];
  const emptyPanel = new A.ButtonPanelButton();
  emptyPanel.items = [];
  const p = A.panel("DND5E.Action", [slot(wolf.items.get("mmBite0000000001")), btn(wolf.items.get(IDS.cure)), panelBtn, keepPanel, emptyPanel]);
  fire(p, wolf);
  await flush();
  pinJSON("action-shifted", bar(p), file);
  assert.equal(panelBtn.element.parentElement, null);
});

test("Action bar with no weapon-set slot: the beast's attacks go first", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  fire(A.panel("DND5E.Bonus", [slot()]), wolf);              // any bar: Argon's button class is borrowed once
  const p = A.panel("DND5E.Action", [btn(wolf.items.get(IDS.cure))]);
  fire(p, wolf);
  assert.deepEqual(bar(p).map(b => b.item), ["mmBite0000000001", "mmMultiattack001", IDS.cure]);
});

test("Action bar: not shifted → untouched; nothing to add or drop → only updateVisibility", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.Action", [slot()]);
  fire(p, talo);
  assert.equal(p.visibility, 0);
  const wolf = await T.shift(talo, "p1");
  const q = A.panel("DND5E.Action", [slot(), btn(wolf.items.get("mmBite0000000001")), btn(wolf.items.get("mmMultiattack001"))]);
  fire(q, wolf);
  assert.equal(q.visibility, 1);
  assert.deepEqual(bar(q).map(b => b.item), [null, "mmBite0000000001", "mmMultiattack001"]);
  assert.ok(q._buttons[0].element.classList.contains("ptf-hidden"));
});

test("[declared] -13 Action bar with pentaryn-combat: Multiattack is dropped only when combat's coversMultiattack(actor) names it (U-4-1; no settings read, C23)", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const run = () => { const p = A.panel("DND5E.Action", [slot()]); fire(p, wolf); return bar(p).map(b => b.item); };
  const combat = game.modules.get("pentaryn-combat");
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"], "combat inactive");
  combat.active = true;
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"], "active but not published yet (no module.api)");
  const seen = [];
  combat.api = { coversMultiattack: actor => { seen.push(actor); return "mmMultiattack001"; } };
  assert.deepEqual(run(), [null, "mmBite0000000001"]);
  assert.equal(seen[0], wolf, "asked about the form actor itself");
  combat.api = { coversMultiattack: () => null };                  // a setting off, a flag override, one swing
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"]);
  combat.api = {};                                                  // an older combat without the method
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"]);
  delete combat.api;
  combat.active = false;
});

/* ── the Special bar and the Reaction slot ────────────────────────────────── */

test("Special bar: Starry Form's button goes; in a split, its partner becomes full-size; no Starry Form → untouched", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.Special", [btn(talo.items.get(IDS.starry)), new A.SplitButton(btn(talo.items.get(IDS.starry)), btn(talo.items.get(IDS.companion))), btn(talo.items.get(IDS.spellcasting))]);
  fire(p, talo);
  await flush();
  pinJSON("special-bar", bar(p), file);
  const bob = F.W.makeActor({});
  const q = A.panel("DND5E.Special", [btn(null)]);
  fire(q, bob);
  assert.equal(q.visibility, 0);
  const r = A.panel("DND5E.Special", [btn(talo.items.get(IDS.spellcasting))]);
  fire(r, talo);
  assert.equal(r.visibility, 0, "nothing to drop: planWithout returns null");
});

test("renderItemButton: in a form, the Reaction bar's weapon slot reads 'Opportunity Attack'; elsewhere untouched", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const make = (label, isWeaponSet = true, item = wolf.items.get("mmBite0000000001")) => {
    const b = new A.DND5eItemButton({ item, isWeaponSet });
    b._parent = { label };
    const title = F.D.el("div", "action-element-title", b.element);
    title.textContent = "Bite";
    return { b, title };
  };
  ui.ARGON._actor = wolf;
  const r = make("DND5E.Reaction");
  Hooks.callAll("renderItemButtonArgonComponent", r.b, r.b.element);
  assert.equal(r.title.textContent, "Opportunity Attack");
  const a = make("DND5E.Action");
  Hooks.callAll("renderItemButtonArgonComponent", a.b, a.b.element);
  assert.equal(a.title.textContent, "Bite");
  const n = make("DND5E.Reaction", false);
  Hooks.callAll("renderItemButtonArgonComponent", n.b, n.b.element);
  assert.equal(n.title.textContent, "Bite");
  const e = make("DND5E.Reaction", true, null);
  Hooks.callAll("renderItemButtonArgonComponent", e.b, e.b.element);
  assert.equal(e.title.textContent, "Bite");
  ui.ARGON._actor = talo;
  const d = make("DND5E.Reaction");
  Hooks.callAll("renderItemButtonArgonComponent", d.b, d.b.element);
  assert.equal(d.title.textContent, "Bite", "normal form");
});

/* ── the portrait ─────────────────────────────────────────────────────────── */

function portraitEl(detailText = "Level 12 Druid (null)") {
  const el = F.D.el("div", "portrait");
  const detail = F.D.el("div", "player-detail", el);
  detail.textContent = detailText;
  const name = F.D.el("div", "portrait-stat-block player-details", el);
  for (const t of ["x", "/", "y"]) F.D.el("span", "", name).textContent = t;
  const hp = F.D.el("div", "portrait-stat-block", el);
  for (const t of ["111", "/", "99", "HP"]) F.D.el("span", "", hp).textContent = t;
  return { el, detail, hp };
}

test("portrait: a form shows 'Wild Shape: Dire Wolf · <time> left' and '99+12' HP; back in normal form the line is restored", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  game.time.worldTime = 60;
  const P = portraitEl();
  Hooks.callAll("renderPortraitPanelArgonComponent", { actor: wolf }, P.el, wolf);
  assert.equal(P.detail.textContent, "Wild Shape: Dire Wolf · 5 hours 59 minutes left");
  assert.equal(P.detail.dataset.pentarynOriginal, "Level 12 Druid (null)");
  assert.ok(P.detail.classList.contains("ptf-form-line"));
  assert.equal(P.hp.children[0].textContent, "99+12");
  assert.equal(P.hp.children[0].dataset.tooltip, "99 HP + 12 temporary HP (they last until spent or a Long Rest)");
  assert.ok(P.hp.children[0].classList.contains("ptf-hp-temp"));
  Hooks.callAll("renderPortraitPanelArgonComponent", { actor: talo }, P.el, null);
  assert.equal(P.detail.textContent, "Level 12 Druid (null)", "no actor argument: the panel's actor (Talo, normal form)");
  assert.equal(P.detail.classList.contains("ptf-form-line"), false);
});

test("portrait: a form with no end time shows the effect name; Starry Form shows its time left; no temp HP leaves Argon's figure", async () => {
  let { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  wolf.flags[MODULE].wildshape.endsAt = null;
  wolf.system.attributes.hp.temp = 0;
  let P = portraitEl();
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, P.el, wolf);
  assert.equal(P.detail.textContent, "Wild Shape: Dire Wolf");
  assert.equal(P.hp.children[0].textContent, "111");
  ({ talo } = fresh());
  await S.assumeStarry(talo, "dragon");
  await talo.effects.get(S.STARRY_EFFECT_ID).update({ "flags.pentaryn-transform.starry.left": 510 });   // combat time counted (D8-starry)
  P = portraitEl();
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, P.el, talo);
  assert.equal(P.detail.textContent, "Starry Form: Dragon · 9 minutes left");
  talo.effects.get(S.STARRY_EFFECT_ID).duration = undefined;
  const plain = portraitEl();
  const bob = F.W.makeActor({ effects: [{ id: "x", name: "Starry Form: Archer", flags: { [MODULE]: { starry: { constellation: "archer" } } } }] });
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, plain.el, bob);
  assert.equal(plain.detail.textContent, "Starry Form: Archer", "no time: the name");
  const none = portraitEl();
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, none.el, F.W.makeActor({}));
  assert.equal(none.detail.textContent, "Level 12 Druid (null)");
});

test("portrait: updateWorldTime repaints the HUD's portrait; failures warn ('portrait HP failed', 'portrait line failed')", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const P = portraitEl();
  ui.ARGON._actor = wolf;
  ui.ARGON.components.portrait = { element: P.el };
  game.time.worldTime = 3600;
  Hooks.callAll("updateWorldTime", 3600, 3600);
  assert.equal(P.detail.textContent, "Wild Shape: Dire Wolf · 5 hours left");
  ui.ARGON.components.portrait = null;
  Hooks.callAll("updateWorldTime", 3700, 100);
  F.console.length = 0;
  const badHp = F.W.makeActor({ items: wolf.items.contents.map(i => i.toObject()), isPolymorphed: false });
  Object.defineProperty(badHp.system.attributes, "hp", { get() { return { value: 1, temp: 2, max: 3 }; } });
  const bad = { querySelectorAll() { throw new Error("dom"); }, querySelector: () => null };
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, bad, talo);
  const worse = { querySelectorAll: () => [], querySelector() { throw new Error("dom"); } };
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, worse, talo);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | portrait HP failed"], ["warn", "pentaryn-transform | portrait line failed"]]);
});

test("portrait (R5): a portrait paint that throws on an updateWorldTime tick warns 'portrait line failed', not an error", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  ui.ARGON._actor = wolf;
  ui.ARGON.components.portrait = { element: { querySelectorAll: () => [], querySelector() { throw new Error("dom"); } } };
  F.console.length = 0;
  game.time.worldTime = 60;
  Hooks.callAll("updateWorldTime", 60, 60);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | portrait line failed"]]);
  ui.ARGON.components.portrait = null;
});

/* ── the effect on the portrait ───────────────────────────────────────────── */

test("renderEffect: the Wild Shape and Starry effects get the big class and a live time-left tooltip; others untouched", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  ui.ARGON._actor = wolf;
  const comp = { effect: { uuid: `${wolf.uuid}.ActiveEffect.${EFFECT_ID}`, tooltip: "<p>desc</p>" }, element: F.D.el("div", ""), label: "Wild Shape: Dire Wolf" };
  Hooks.callAll("renderEffectArgonComponent", comp);
  assert.ok(comp.element.classList.contains("ptf-effect"));
  game.time.worldTime = 600;
  assert.deepEqual(await comp.getTooltipData(), { title: "Wild Shape: Dire Wolf", description: "<p><strong>Time left:</strong> 5 hours 50 minutes</p><p>desc</p>", classes: ["pentaryn-tt"] });
  const { talo: t2 } = fresh();
  await S.assumeStarry(t2, "archer");
  ui.ARGON._actor = t2;
  const sc = { effect: { uuid: `${t2.uuid}.ActiveEffect.${S.STARRY_EFFECT_ID}` }, element: F.D.el("div", ""), label: "Starry Form: Archer" };
  Hooks.callAll("renderEffectArgonComponent", sc);
  await t2.effects.get(S.STARRY_EFFECT_ID).update({ "flags.pentaryn-transform.starry.left": 540 });   // combat time counted (D8-starry)
  assert.deepEqual(await sc.getTooltipData(), { title: "Starry Form: Archer", description: "<p><strong>Time left:</strong> 9 minutes</p>", classes: ["pentaryn-tt"] });
  ui.ARGON._actor = null;
  assert.deepEqual(await sc.getTooltipData(), { title: "Starry Form: Archer", description: "", classes: ["pentaryn-tt"] });
  const other = { effect: { uuid: "Actor.x.ActiveEffect.blessEffect00001" }, element: F.D.el("div", "") };
  Hooks.callAll("renderEffectArgonComponent", other);
  assert.equal(other.getTooltipData, undefined);
  Hooks.callAll("renderEffectArgonComponent", {});
});

/* ── badges, the Starry rebuild ───────────────────────────────────────────── */

test("updateItem on Wild Shape repaints the uses badge of the live buttons; other items do nothing", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.BonusAction", [slot()]);
  fire(p, talo);
  await flush();
  const ws = p._buttons.find(b => b.constructor.name === "WildShapeButton");
  const badge = () => ws.element.querySelector(":scope > .quantity-1")?.children.find(c => c.tagName === "SPAN")?.textContent ?? null;
  assert.equal(badge(), "2");
  const item = talo.items.get(IDS.ws);
  await item.update({ "system.uses.spent": 3 });
  assert.equal(badge(), "0");
  assert.ok(ws.element.classList.contains("ptf-empty"));
  item.system.uses.spent = 1;
  Hooks.callAll("updateItem", talo.items.get(IDS.cure), {}, {}, "u");
  assert.equal(badge(), "0", "not Wild Shape: no refresh");
  item.system.uses = { max: 0 };
  Hooks.callAll("updateItem", item, {}, {}, "u");
  assert.equal(badge(), null, "no use limit: the badge goes");
});

test("a Starry effect created/changed/deleted on the HUD's actor rebuilds the Bonus bar; on another actor, nothing", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.BonusAction", [slot()]);
  ui.ARGON.components.main = [p];
  ui.ARGON._actor = talo;
  fire(p, talo);
  await flush();
  await S.assumeStarry(talo, "archer");
  assert.equal(p.renders, 1);
  await S.endStarry(talo, { quiet: true });
  assert.equal(p.renders, 2);
  ui.ARGON._actor = F.W.makeActor({});
  await S.assumeStarry(talo, "chalice");
  assert.equal(p.renders, 2);
  ui.ARGON.components.main = [];
  ui.ARGON._actor = talo;
  await S.endStarry(talo, { quiet: true });
  assert.equal(p.renders, 2, "no Bonus panel on the HUD");
  mock.timers.tick(50);
});

test("D8-starry: a combat tick (only the time-left flag changes) does not rebuild the Bonus bar; a constellation change still does", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.BonusAction", [slot()]);
  ui.ARGON.components.main = [p];
  ui.ARGON._actor = talo;
  fire(p, talo);
  await flush();
  await S.assumeStarry(talo, "archer");
  assert.equal(p.renders, 1);
  game.combats.set("cmb", { id: "cmb", started: true, combatants: new StubCollection([{ id: "c1", actor: talo }]) });
  for (let i = 0; i < 3; i++) {
    game.time.worldTime += 6;
    Hooks.callAll("updateWorldTime", game.time.worldTime, 6, {}, IDS.gm);
    await flush();
  }
  assert.equal(S.starrySecondsLeft(talo), 582, "the ticks were counted");
  assert.equal(p.renders, 1, "D8-starry: a time-left write must not rebuild the Bonus bar (or close an open picker)");
  await talo.effects.get(S.STARRY_EFFECT_ID).update({ "flags.pentaryn-transform.starry.constellation": "dragon" });
  assert.equal(p.renders, 2, "any other change to the form still rebuilds");
  game.combats.clear();
  mock.timers.tick(50);
});

/* ── Chalice ──────────────────────────────────────────────────────────────── */

test("Chalice: a leveled heal with a slot lights the Chalice button for a minute; using it, ending the form, or time puts it out", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "chalice");
  ui.ARGON._actor = talo;
  const p = A.panel("DND5E.BonusAction", [slot()]);
  fire(p, talo);
  await flush();
  const chalice = () => p._buttons.find(b => b.element.classList.contains("ptf-starry-chalice"));
  const lit = () => chalice().element.classList.contains("ptf-chalice-ready");
  assert.equal(lit(), false);
  const cure = talo.items.get(IDS.cure).system.activities.get("cw1");
  Hooks.callAll("dnd5e.postUseActivity", cure, {}, {});
  assert.equal(lit(), true);
  const q = A.panel("DND5E.BonusAction", [slot()]);
  fire(q, talo);
  await flush();
  assert.ok(q._buttons.some(b => b.element.classList.contains("ptf-chalice-ready")), "a rebuilt bar starts lit");
  Hooks.callAll("dnd5e.postUseActivity", talo.items.get(IDS.starry).system.activities.get("sfChalice"), {}, {});
  assert.equal(lit(), false, "used");
  Hooks.callAll("dnd5e.postUseActivity", cure, { consume: { spellSlot: false } }, {});
  assert.equal(lit(), false, "no slot");
  Hooks.callAll("dnd5e.postUseActivity", talo.items.get(IDS.fireBolt).system.activities.get("fb1"), {}, {});
  assert.equal(lit(), false, "a cantrip");
  const spell = { type: "spell", system: { level: 2 } };
  Hooks.callAll("dnd5e.postUseActivity", { type: "damage", item: spell, actor: talo, damage: { parts: [{ types: ["fire"] }, { types: new Set(["temphp"]) }] } }, {}, {});
  assert.equal(lit(), true, "a temp-HP part on a leveled spell");
  Hooks.callAll("dnd5e.postUseActivity", talo.items.get(IDS.starry).system.activities.get("sfChalice"), {}, {});
  Hooks.callAll("dnd5e.postUseActivity", cure, {}, {});
  mock.timers.tick(59_999);
  assert.equal(lit(), true);
  mock.timers.tick(1);
  assert.equal(lit(), false, "a minute passed");
  Hooks.callAll("dnd5e.postUseActivity", cure, {}, {});
  assert.equal(lit(), true);
  await S.endStarry(talo, { quiet: true });
  assert.equal(lit(), false, "Starry Form ended");
});

test("Chalice: not in the Chalice constellation → nothing; another actor's offer is not painted on this HUD; a failure warns", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const cure = talo.items.get(IDS.cure).system.activities.get("cw1");
  Hooks.callAll("dnd5e.postUseActivity", cure, {}, {});
  F.console.length = 0;
  Hooks.callAll("dnd5e.postUseActivity", { get actor() { throw new Error("x"); } }, {}, {});
  assert.deepEqual(F.console.filter(c => c[1].startsWith(MODULE)).map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | Chalice offer skipped"]]);
  Hooks.callAll("dnd5e.postUseActivity", { actor: null }, {}, {});
});

/* ── tooltip hygiene ──────────────────────────────────────────────────────── */

test("pointermove: one check per 60 ms; a tooltip whose anchor left the DOM is dropped (and Argon's reference cleared)", () => {
  const move = F.D.listeners.find(l => l.type === "pointermove").fn;
  const anchor = F.D.el("div", "anchor");
  game.tooltip.element = anchor;
  ui.ARGON._tooltip = { x: 1 };
  F.tooltipCalls.length = 0;
  move();
  mock.timers.tick(60);
  assert.deepEqual(F.tooltipCalls, [], "anchor connected");
  anchor.remove();
  move();
  move();
  mock.timers.tick(59);
  assert.deepEqual(F.tooltipCalls, []);
  mock.timers.tick(1);
  assert.deepEqual(F.tooltipCalls, ["deactivate"], "one check for two moves");
  assert.equal(ui.ARGON._tooltip, null);
  game.tooltip.element = null;
  move();
  mock.timers.tick(60);
  assert.deepEqual(F.tooltipCalls, ["deactivate"]);
});

test("KNOWN (-15, hud.mjs:39): a throwing tooltip manager is swallowed without a word; renders also drop stale tooltips", async () => {
  const { talo } = fresh();
  const anchor = F.D.el("div", "anchor");
  anchor.remove();
  game.tooltip.element = anchor;
  const real = game.tooltip.deactivate;
  game.tooltip.deactivate = () => { throw new Error("tooltip"); };
  F.console.length = 0;
  const P = portraitEl();
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, P.el, talo);
  mock.timers.tick(0);
  assert.deepEqual(F.console, []);
  game.tooltip.deactivate = real;
  F.tooltipCalls.length = 0;
  fire(A.panel("DND5E.Reaction", []), talo);
  mock.timers.tick(0);
  assert.deepEqual(F.tooltipCalls, ["deactivate"]);
  game.tooltip.element = null;
});
