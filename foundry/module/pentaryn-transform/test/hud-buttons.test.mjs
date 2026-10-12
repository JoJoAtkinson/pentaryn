// The module's Argon buttons (hud.mjs argonClasses): Wild Shape / Change Form and its form tiles,
// the synthesized Return, Starry Form and its constellation tiles — labels, icons, badges, tooltip
// data (goldens), clicks and right-clicks. Reached the way Argon reaches them: a Bonus bar composed
// in renderActionPanelArgonComponent, then each button rendered.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { setup, IDS } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses"] });
F.CONFIG.DND5E = {
  actorSizes: { lg: { label: "Large" }, med: { label: "Medium" } },
  creatureTypes: { beast: { label: "Beast" } },
  limitedUsePeriods: { lr: { label: "Long Rest" }, sr: { label: "Short Rest" } }
};
const T = await import("../transform.mjs");
const S = await import("../starry.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
const A = F.A;
const file = import.meta.url;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const notes = () => F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]);
const ev = () => { const e = { prevented: 0, stopped: 0 }; e.preventDefault = () => { e.prevented++; }; e.stopPropagation = () => { e.stopped++; }; return e; };

function fresh(opts) {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  F.tooltipCalls.length = 0;
  A.collapsed.length = 0;
  game.time.worldTime = 0;
  F.become({ userId: IDS.gm });
  return F.W.talo(opts);
}

/** Compose a Bonus bar for `actor` and return the module's buttons by class name. */
async function bonus(actor) {
  const p = A.panel("DND5E.BonusAction", [new A.DND5eItemButton({ item: null, isWeaponSet: true })]);
  Hooks.callAll("renderActionPanelArgonComponent", p, p.element, actor);
  await flush();
  const by = name => p._buttons.find(b => b.constructor.name === name) ?? null;
  return { p, ws: by("WildShapeButton"), starry: by("StarryFormButton"), ret: by("ReturnButton") };
}
const tiles = b => b.panel._buttons;

/* ── Wild Shape / Change Form ─────────────────────────────────────────────── */

test("WildShapeButton (normal form): label, icon, badge, tooltip (golden/tooltip-wildshape.json)", async () => {
  const { talo } = fresh();
  const { ws } = await bonus(talo);
  assert.equal(ws.label, "PENTARYN_TRANSFORM.Hud.WildShape");
  assert.equal(ws.icon, "ws.webp");
  assert.equal(ws.colorScheme, 1);
  assert.equal(ws.hasTooltip, true);
  assert.equal(ws.shifted, false);
  const badge = ws.element.querySelector(":scope > .quantity-1");
  assert.deepEqual(badge.children.map(c => [c.tagName, c.className, c.textContent]), [["DIV", "border-triangle", ""], ["SPAN", "", "2"]]);
  assert.equal(ws.element.children[0], badge, "prepended");
  pinJSON("tooltip-wildshape", await ws.getTooltipData(), file);
});

test("WildShapeButton picker: one FormTile per known form, a pentaryn-picker panel without an id; re-render drops the old panel", async () => {
  const { talo, wolfSrc } = fresh();
  const { ws } = await bonus(talo);
  const panel = ws.panel;
  assert.equal(panel.id, null);
  assert.ok(panel.element.classList.contains("pentaryn-picker"));
  assert.ok(panel.element.classList.contains("features-container"));
  assert.deepEqual(tiles(ws).map(t => [t.constructor.name, t.label, t.icon, t.element.className]),
    [["FormTile", "Dire Wolf", wolfSrc.img, ""], ["FormTile", "Brown Bear", "brownBearSrc0001.webp", ""], ["FormTile", "Ape", "apeSrc0000000001.webp", ""]]);
  await ws.render();
  assert.equal(panel.element.parentElement, null, "the old panel is removed");
  assert.notEqual(ws.panel, panel);
  assert.equal(ws.element.querySelectorAll(".features-container").length, 1);
});

test("WildShapeButton click: tooltip dropped, target picker cancelled, the picker toggled; with 0 uses a warning instead", async () => {
  const { talo } = fresh();
  const { ws } = await bonus(talo);
  const e = ev();
  await ws._onClick(e);
  assert.deepEqual([e.prevented, e.stopped], [1, 1]);
  assert.deepEqual(F.tooltipCalls, ["deactivate"]);
  assert.ok(ws.panel.element.classList.contains("show"));
  talo.items.get(IDS.ws).system.uses.spent = 3;
  await ws._onClick(ev());
  assert.deepEqual(notes(), [["warn", "No Wild Shape uses left."]]);
  assert.ok(ws.panel.element.classList.contains("show"), "not toggled");
  ws.refreshCount();
  assert.ok(ws.element.classList.contains("pentaryn-empty"));
});

test("WildShapeButton right-click and contextmenu open the Wild Shape item's sheet", async () => {
  const { talo } = fresh();
  const { ws } = await bonus(talo);
  await ws._onRightClick();
  const e = ev();
  ws.element.oncontextmenu(e);
  assert.equal(e.prevented, 1);
  assert.equal(talo.items.get(IDS.ws).sheetRenders, 2);
});

test("Change Form (in a form): label, tooltip (golden/tooltip-changeform.json), the current form's tile marked", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const { ws, ret } = await bonus(wolf);
  assert.equal(ws.label, "PENTARYN_TRANSFORM.Hud.ChangeForm");
  assert.equal(ws.shifted, true);
  assert.equal(ws.wildShapeItem, talo.items.get(IDS.ws), "the original's item");
  pinJSON("tooltip-changeform", await ws.getTooltipData(), file);
  assert.deepEqual(tiles(ws).map(t => t.element.classList.contains("pentaryn-current")), [true, false, false]);
  assert.ok(ret);
});

test("WildShapeButton: no Wild Shape item → no tooltip, no icon, no badge", async () => {
  const { talo } = fresh();
  const { ws } = await bonus(talo);
  talo.items.delete(IDS.ws);
  assert.equal(await ws.getTooltipData(), null);
  assert.equal(ws.icon, "");
  ws.refreshCount();
  assert.equal(ws.element.querySelector(":scope > .quantity-1"), null);
});

/* ── form tiles ───────────────────────────────────────────────────────────── */

test("FormTile tooltip: the beast summarised (golden/tooltip-formtile.json); an unresolvable form → its name only", async () => {
  const { talo } = fresh();
  const { ws } = await bonus(talo);
  pinJSON("tooltip-formtile", await Promise.all(tiles(ws).map(t => t.getTooltipData())), file);
  const lost = tiles(ws)[0];
  lost.form = { id: "p9", name: "Gone", uuid: "Actor.none", actor: null };
  assert.deepEqual(await lost.getTooltipData(), { title: "Gone", description: "" });
  assert.equal(lost.hasTooltip, true);
});

test("FormTile tooltip normalisation: item-level labels, a non-array damage, an unknown size/type, recovery fallbacks", async () => {
  const { talo } = fresh();
  const odd = F.W.beast("oddBeast00000001", "Odd Beast", {
    system: { details: { cr: 0.25, type: { value: "ooze" } }, traits: { size: "tiny" }, attributes: { ac: { value: 8 }, movement: { swim: 30, hover: true, units: "m" }, senses: { ranges: { blindsight: 10, darkvision: 0 } } } },
    items: [
      { id: "oddSlam000000001", name: "Slam", type: "weapon", labels: { toHit: "+2", damages: [{ formula: "1d4" }] }, activities: [{ _id: "s1", type: "utility" }] },
      { id: "oddSpit000000001", name: "Spit", type: "feat", system: { type: { value: "monster" } }, activities: [{ _id: "sp", type: "attack", labels: { damage: "1d6 acid" } }] },
      { id: "oddJunk000000001", name: "Junk", type: "loot" }
    ] });
  const { ws } = await bonus(talo);
  const tile = tiles(ws)[0];
  tile.form = { id: "p1", name: "Odd Beast", uuid: odd.uuid, actor: null };
  pinJSON("tooltip-formtile-odd", await tile.getTooltipData(), file);
  talo.items.get(IDS.ws).system.uses.recovery = [{ period: "dawn", type: "formula", formula: "" }];
  T.wildShapeActivity(talo).duration = {};
  talo.items.get(IDS.ws).system.uses = { recovery: [] };
  const tip = await ws.getTooltipData();
  assert.deepEqual(tip.details.map(d => d.value), ["— / —", "—", "—", "Bonus Action"]);
  F.calls.length = 0;
  await tile._onRightClick({});
  assert.deepEqual(F.calls.filter(c => c.op === "sheet.render").map(c => c.actor), [odd.id], "resolved by uuid when the tile has no actor");
});

test("FormTile click: hygiene, panels collapsed, shift(hud actor, form); right-click opens the beast's sheet", async () => {
  const { talo, wolfSrc } = fresh();
  const { ws } = await bonus(talo);
  F.tooltipCalls.length = 0;
  await tiles(ws)[0]._onLeftClick({});
  assert.deepEqual(A.collapsed, [1]);
  assert.deepEqual(F.tooltipCalls, ["deactivate"]);
  assert.ok(game.actors.find(a => a.name === "Talo (Dire Wolf)"));
  F.calls.length = 0;
  await tiles(ws)[0]._onRightClick({});
  assert.deepEqual(F.calls.filter(c => c.op === "sheet.render").map(c => c.actor), [wolfSrc.id]);
});

test("FormTile without a beast portrait shows the mystery man", async () => {
  const { talo, apeSrc } = fresh();
  apeSrc.img = "";
  const { ws } = await bonus(talo);
  assert.equal(tiles(ws)[2].icon, "icons/svg/mystery-man.svg");
});

/* ── Return ───────────────────────────────────────────────────────────────── */

test("ReturnButton: 'Return to Talo' with Talo's portrait, a Bonus Action tooltip; click reverts with the Return line", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const { ret } = await bonus(wolf);
  assert.deepEqual([ret.label, ret.icon, ret.item.id, ret.hasTooltip], ["Return to Talo", "talo.webp", "pentarynReturn00", true]);
  assert.deepEqual(await ret.getTooltipData(), { title: "Return to Talo", subtitle: "Bonus Action", description: "", classes: ["pentaryn-tt"] });
  F.chat.length = 0;
  await ret._onLeftClick({});
  assert.deepEqual(F.chat.map(c => c.content), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> returns to normal form.</p>"]);
  assert.deepEqual(A.collapsed, [1]);
});

test("ReturnButton on an unlinked token's form whose base actor is gone: the form's own name and image", async () => {
  const { talo } = fresh();
  const wsItem = talo.items.get(IDS.ws).toObject();
  const tokenForm = F.W.makeActor({ name: "Stray (Wolf)", img: "stray.webp", isPolymorphed: true, isToken: true,
    flags: { dnd5e: { originalActor: "gone", transformOptions: { preset: "wildshape" } } },
    items: [{ ...wsItem, id: wsItem._id, activities: Object.values(wsItem.system.activities) }] });
  const { ret, ws } = await bonus(tokenForm);
  assert.deepEqual([ret.label, ret.icon], ["Return to Stray (Wolf)", "stray.webp"]);
  assert.equal(ws.label, "PENTARYN_TRANSFORM.Hud.ChangeForm");
});

/* ── Starry Form ──────────────────────────────────────────────────────────── */

test("StarryFormButton (off): label, icon, badge, tooltip (golden/tooltip-starry-off.json); click opens the constellations", async () => {
  const { talo } = fresh();
  const { starry } = await bonus(talo);
  assert.deepEqual([starry.label, starry.icon, starry.colorScheme, starry.constellation, starry.item.id], ["Starry Form", "starry.webp", 1, null, IDS.starry]);
  pinJSON("tooltip-starry-off", await starry.getTooltipData(), file);
  assert.deepEqual(tiles(starry).map(t => [t.constructor.name, t.label, t.icon, t.item.id]), [
    ["ConstellationTile", "Archer", "icons/weapons/bows/bow-ornamental-gold-blue.webp", "pentaryn-starry-archer"],
    ["ConstellationTile", "Chalice", "chalice-custom.webp", "pentaryn-starry-chalice"],
    ["ConstellationTile", "Dragon", "icons/creatures/reptiles/dragon-winged-blue.webp", "pentaryn-starry-dragon"]]);
  await starry._onClick(ev());
  assert.ok(starry.panel.element.classList.contains("show"));
  talo.items.get(IDS.ws).system.uses.spent = 3;
  await starry._onClick(ev());
  assert.deepEqual(notes(), [["warn", "No Wild Shape uses left."]]);
  await starry._onRightClick();
  const e = ev();
  starry.element.oncontextmenu(e);
  assert.equal(talo.items.get(IDS.starry).sheetRenders, 2);
});

test("StarryFormButton (on): 'Starry Form: Archer', constellation icon, tooltip (golden/tooltip-starry-on.json), an End tile; clickable when spent out", async () => {
  const { talo } = fresh({ twinkling: true, uses: { max: 3, spent: 2 } });
  await S.assumeStarry(talo, "archer");
  game.time.worldTime = 120;
  const { starry } = await bonus(talo);
  assert.equal(starry.label, "Starry Form: Archer");
  assert.equal(starry.icon, "icons/weapons/bows/bow-ornamental-gold-blue.webp");
  assert.ok(starry.element.classList.contains("pentaryn-starry-on"));
  assert.equal(starry.element.classList.contains("pentaryn-empty"), false, "0 uses, but the form is up");
  pinJSON("tooltip-starry-on", await starry.getTooltipData(), file);
  assert.deepEqual(tiles(starry).map(t => [t.label, t.element.classList.contains("pentaryn-current")]),
    [["Archer", true], ["Chalice", false], ["Dragon", false], ["End", false]]);
  assert.equal(tiles(starry)[3].icon, "icons/svg/cancel.svg");
  await starry._onClick(ev());
  assert.deepEqual(notes(), []);
  pinJSON("tooltip-constellations", await Promise.all(tiles(starry).map(t => t.getTooltipData())), file);
});

test("StarryFormButton (on, no Twinkling): the hint says another use; the constellation tiles cost a use", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "chalice");
  const { starry } = await bonus(talo);
  const tip = await starry.getTooltipData();
  assert.equal(tip.footerText, "Click to end it or start a new form with another constellation (one more use).");
  assert.deepEqual((await Promise.all(tiles(starry).slice(0, 3).map(t => t.getTooltipData()))).map(d => d.details[0].value),
    ["Bonus Action, 1 Wild Shape use", "Glimmering now", "Bonus Action, 1 Wild Shape use"]);
});

test("ConstellationTile clicks: assume, or End; right-click opens the feature", async () => {
  const { talo } = fresh();
  const { starry } = await bonus(talo);
  await tiles(starry)[2]._onLeftClick();
  assert.equal(S.constellationOf(talo), "dragon");
  assert.deepEqual(A.collapsed, [1]);
  const again = await bonus(talo);
  await tiles(again.starry)[3]._onLeftClick();
  assert.equal(S.activeStarry(talo), null);
  await tiles(again.starry)[0]._onRightClick();
  assert.equal(talo.items.get(IDS.starry).sheetRenders, 1);
});

test("StarryFormButton re-render drops its old panel; updateItem on Wild Shape repaints its badge too", async () => {
  const { talo } = fresh();
  const { starry } = await bonus(talo);
  const old = starry.panel;
  await starry.render();
  assert.equal(old.element.parentElement, null);
  const span = () => starry.element.querySelector(":scope > .quantity-1").children[1].textContent;
  assert.equal(span(), "2");
  await talo.items.get(IDS.ws).update({ "system.uses.spent": 2 });
  assert.equal(span(), "1");
});
