// argon-tidy.mjs on a client: 1 shared-uses badge refresh (updateItem), 2 panel collapse before an
// area or summon placement, 3 + 4 the per-button wraps made from renderItemButtonArgonComponent
// (Metamagic `targets` → null; getTooltipData marks the item so the global enrichHTML wrap passes
// the item's roll data). The behaviour recipe is combat-riders-39's; S5 moves these wraps into
// patches.mjs with bodies verbatim, so every case here must still hold after the move.
// combat-riders-40: the enrichHTML wrap's comment-only catch prints nothing today (pinned).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, makeItem, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const sorc = W.actor(IDS.sorc);
const TE = () => F.foundry.applications.ux.TextEditor.implementation;

/* ── 1. shared-uses badges ───────────────────────────────────────────────── */

const font = makeItem({ id: "fontofmagic00001", name: "Font of Magic", type: "feat", system: { uses: { value: 5, max: 5 } } }, sorc);
const meta = (id, target) => makeItem({ id, name: id, type: "feat", system: { identifier: "careful-spell" }, activities: [{ id: `${id}a`.slice(0, 16), type: "utility", consumption: { targets: [{ type: "itemUses", target }] } }] }, sorc);
const careful = meta("careful000000001", "fontofmagic00001");
const quick = meta("quicken000000001", "fontofmagic00001");
const other = meta("otherspend000001", "somethingelse001");

function hud(o = {}) {
  const rendered = [];
  const button = item => ({ item, render: () => rendered.push(item?.name ?? null) });
  F.ui.ARGON = { rendered: true, _actor: sorc, itemButtons: [button(careful), button(font), button(quick), button(other), button(null), { item: careful }], ...o };
  return rendered;
}

test("a uses change on the HUD actor's item re-renders every other button that spends it", () => {
  const rendered = hud();
  F.fire("updateItem", font, { system: { uses: { spent: 1 } } });
  assert.deepEqual(rendered, ["careful000000001", "quicken000000001"]);
});

test("badge refresh skips: no HUD / not rendered, another actor's item, no uses change", () => {
  F.ui.ARGON = undefined;
  F.fire("updateItem", font, { system: { uses: { spent: 1 } } });
  let rendered = hud({ rendered: false });
  F.fire("updateItem", font, { system: { uses: { spent: 1 } } });
  assert.deepEqual(rendered, []);
  rendered = hud({ _actor: W.actor(IDS.druid) });
  F.fire("updateItem", font, { system: { uses: { spent: 1 } } });
  F.fire("updateItem", makeItem({ name: "loose" }), { system: { uses: {} } });
  assert.deepEqual(rendered, []);
  rendered = hud();
  F.fire("updateItem", font, { name: "Font" });
  F.fire("updateItem", font, null);
  assert.deepEqual(rendered, []);
  W.take();
  F.ui.ARGON = { rendered: true, _actor: sorc, get itemButtons() { throw new Error("hud gone"); } };
  F.fire("updateItem", font, { system: { uses: {} } });
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Argon shared-uses badge refresh skipped`, "hud gone"]]);
  F.ui.ARGON = undefined;
});

/* ── 2. collapse before placement ────────────────────────────────────────── */

test("preCreateMeasuredTemplate and preSummon collapse Argon's panels; no HUD is fine; a throw is warned", () => {
  let n = 0;
  F.ui.ARGON = { collapseAllPanels: () => { n += 1; } };
  F.ui.sidebar = undefined;
  F.fire("dnd5e.preCreateMeasuredTemplate", {}, {});
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  assert.equal(n, 2);
  F.ui.ARGON = {};
  F.fire("dnd5e.preCreateMeasuredTemplate", {}, {});
  F.ui.ARGON = undefined;
  F.fire("dnd5e.preCreateMeasuredTemplate", {}, {});
  W.take();
  F.ui.ARGON = { collapseAllPanels: () => { throw new Error("no panels"); } };
  F.fire("dnd5e.preCreateMeasuredTemplate", {}, {});
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Argon panel collapse skipped`, "no panels"]]);
  F.ui.ARGON = undefined;
});

/* ── 3 + 4. the item-button wraps ────────────────────────────────────────── */

function buttonClasses() {
  class Base {
    constructor(item) { this.item = item; }
    get targets() { return 5; }
    async getTooltipData() {
      return { description: await TE().enrichHTML("tip", { relativeTo: this.item }) };
    }
  }
  class Sub extends Base {}
  return { Base, Sub };
}
const spellItem = (identifier, name = identifier) => makeItem({ name, type: "spell", system: { identifier, level: 2 } }, sorc);
const render = b => F.fire("renderItemButtonArgonComponent", b);
const enrichLog = () => W.takeLog().filter(l => l.op === "enrichHTML");

test("subclass rendered first, then the base: Metamagic targets read null on both, other spells keep theirs", () => {
  const { Base, Sub } = buttonClasses();
  const carefulSpell = spellItem("careful-spell"), bolt = spellItem("fire-bolt");
  render(new Sub(carefulSpell));
  render(new Base(carefulSpell));
  assert.equal(new Sub(carefulSpell).targets, null);
  assert.equal(new Base(carefulSpell).targets, null);
  assert.equal(new Sub(bolt).targets, 5);
  assert.equal(new Base(bolt).targets, 5);
});

test("the tooltip's enrich gets the item's roll data; one enrich per tooltip; none outside a tooltip", async () => {
  const { Base, Sub } = buttonClasses();
  const ray = spellItem("scorching-ray", "Scorching Ray");
  render(new Sub(ray));
  render(new Base(ray));
  W.takeLog();
  await new Sub(ray).getTooltipData();
  await new Base(ray).getTooltipData();
  TE().enrichHTML("plain", { relativeTo: ray });
  TE().enrichHTML("given", { relativeTo: ray, rollData: { mine: 1 } });
  assert.deepEqual(enrichLog(), [
    { op: "enrichHTML", content: "tip", rollData: { item: { level: 2, name: "Scorching Ray" } }, relativeTo: "Scorching Ray" },
    { op: "enrichHTML", content: "tip", rollData: { item: { level: 2, name: "Scorching Ray" } }, relativeTo: "Scorching Ray" },
    { op: "enrichHTML", content: "plain", rollData: null, relativeTo: "Scorching Ray" },
    { op: "enrichHTML", content: "given", rollData: { mine: 1 }, relativeTo: "Scorching Ray" },
  ]);
});

test("base rendered first, then the subclass: still one enrich per tooltip, targets null", async () => {
  const { Base, Sub } = buttonClasses();
  const carefulSpell = spellItem("careful-spell");
  render(new Base(carefulSpell));
  render(new Sub(carefulSpell));
  assert.equal(new Sub(carefulSpell).targets, null);
  W.takeLog();
  await new Sub(carefulSpell).getTooltipData();
  assert.equal(enrichLog().length, 1);
});

test("overlapping tooltip builds for one item both enrich with its roll data", async () => {
  class Slow {
    constructor(item, gate) { this.item = item; this.gate = gate; }
    async getTooltipData() {
      await this.gate;
      return { description: await TE().enrichHTML("tip", { relativeTo: this.item }) };
    }
  }
  const ray = spellItem("scorching-ray", "Scorching Ray");
  render(new Slow(ray, null));
  let openA, openB;
  const a = new Slow(ray, new Promise(r => { openA = r; })).getTooltipData();
  const b = new Slow(ray, new Promise(r => { openB = r; })).getTooltipData();
  W.takeLog();
  openA();
  await a;
  openB();
  await b;
  const want = { item: { level: 2, name: "Scorching Ray" } };
  assert.deepEqual(enrichLog().map(l => l.rollData), [want, want]);
});

test("a tooltip that throws still unmarks the item; a non-Item button passes straight through", async () => {
  class Boom { constructor(item) { this.item = item; } async getTooltipData() { throw new Error("tooltip broke"); } }
  const it = spellItem("fire-bolt", "Bolt");
  render(new Boom(it));
  await assert.rejects(new Boom(it).getTooltipData(), { message: "tooltip broke" });
  W.takeLog();
  TE().enrichHTML("after", { relativeTo: it });
  assert.deepEqual(enrichLog()[0].rollData, null);
  const { Base } = buttonClasses();
  render(new Base(it));
  const notItem = new Base({ documentName: "Activity", name: "act" });
  W.takeLog();
  await notItem.getTooltipData();
  assert.deepEqual(enrichLog()[0].rollData, null);
});

test("only Item buttons are wrapped; a class without targets/getTooltipData gains neither; a throw is warned", () => {
  class Plain { constructor(item) { this.item = item; } }
  render(new Plain({ documentName: "Activity" }));
  assert.deepEqual(Object.getOwnPropertyNames(Plain.prototype), ["constructor"]);
  render(new Plain(spellItem("x")));
  assert.equal(new Plain(spellItem("careful-spell")).targets, undefined);
  assert.equal(new Plain(spellItem("x")).getTooltipData, undefined);
  render(null);
  W.take();
  render({ get item() { throw new Error("odd button"); } });
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Argon button tidy skipped`, "odd button"]]);
});

test("combat-riders-40 pin: an enrich option that throws is enriched as asked, silently", () => {
  W.take();
  W.takeLog();
  const opts = {};
  Object.defineProperty(opts, "relativeTo", { get() { throw new Error("odd options"); }, enumerable: true });
  assert.equal(TE().enrichHTML("c", opts), "<p>c</p>");
  assert.deepEqual(W.take(), []);
});
