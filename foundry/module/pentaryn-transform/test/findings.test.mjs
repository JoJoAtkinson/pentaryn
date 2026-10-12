// The audit's standalone findings (guide §4), each with its own test, on the glue world.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses"] });
F.CONFIG.DND5E = { actorSizes: {}, creatureTypes: {}, limitedUsePeriods: { lr: { label: "Long Rest" }, sr: { label: "Short Rest" } } };
const T = await import("../transform.mjs");
await import("../hud.mjs");
const { liveButtons } = await import("../form-picker.mjs");
F.fire("init");
F.fire("ready");
const A = F.A;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const fire = (p, actor) => Hooks.callAll("renderActionPanelArgonComponent", p, p.element, actor);
const slot = () => new A.DND5eItemButton({ item: null, isWeaponSet: true });
const btn = item => new A.DND5eItemButton({ item, inActionPanel: true });

function fresh(opts) {
  game.actors.clear();
  F.become({ userId: IDS.gm });
  F.calls.length = 0;
  F.console.length = 0;
  ui.ARGON._actor = null;
  return F.W.talo(opts);
}

/* ── -10 liveButtons pruned when a Bonus bar is composed ──────────────────── */

test("-10 composing a Bonus bar drops the live buttons Argon's last rebuild left behind (rendered ones only)", async () => {
  const { talo } = fresh();
  liveButtons.clear();
  const p1 = A.panel("DND5E.BonusAction", [slot(), btn(talo.items.get(IDS.ws))]);
  fire(p1, talo);
  await flush();
  const first = [...liveButtons];
  assert.equal(first.length, 2, "Wild Shape and Starry Form");
  assert.ok(first.every(b => b.panel), "rendered: each built its picker");
  p1.element.remove();                                          // Argon rebuilt the HUD
  const p2 = A.panel("DND5E.BonusAction", [slot(), btn(talo.items.get(IDS.ws))]);
  fire(p2, talo);
  for (const b of first) assert.equal(liveButtons.has(b), false, "a disconnected, rendered button is dropped");
  assert.equal(liveButtons.size, 2, "the new bar's two (not yet rendered) are kept");
});

test("refreshLive: a disconnected button without a panel stays and is not refreshed; with a panel it is removed", () => {
  const { talo } = fresh();
  const item = talo.items.get(IDS.ws);
  liveButtons.clear();
  const refreshed = [];
  const b = (name, connected, panel) => ({
    name, panel, wildShapeItem: item,
    element: { isConnected: connected },
    refreshCount() { refreshed.push(name); }
  });
  const live = b("live", true, {}), gone = b("gone", false, {}), unrendered = b("unrendered", false, undefined);
  for (const x of [live, gone, unrendered]) liveButtons.add(x);
  Hooks.callAll("updateItem", item, {}, {}, "u");
  assert.deepEqual(refreshed, ["live"], "only the connected button is refreshed");
  assert.deepEqual([...liveButtons], [live, unrendered], "the rendered, disconnected one is dropped");
  liveButtons.clear();
});

/* ── -1 isRunner short-circuits on a connected GM ─────────────────────────── */

test("-1 isRunner: with a GM connected no owner permission is tested; the answers are today's", () => {
  const { talo } = fresh({ ownership: { default: 0, [IDS.player]: 3, [IDS.player2]: 3 } });
  let tests = 0;
  const real = talo.testUserPermission;
  talo.testUserPermission = (...a) => { tests++; return real.apply(talo, a); };
  assert.equal(T.isRunner(talo), true, "the GM's client");
  F.become({ userId: IDS.player });
  assert.equal(T.isRunner(talo), false, "a player's client while a GM is connected");
  assert.equal(tests, 0);
  const gm = game.users.get(IDS.gm);
  gm.active = false;
  assert.equal(T.isRunner(talo), true, "no GM: the first active owner");
  assert.ok(tests > 0, "the owner scan runs only without a GM");
  gm.active = true;
  talo.testUserPermission = real;
  F.become({ userId: IDS.gm });
});

/* ── -23 the Wild Shape tooltip counts profiles without resolving them ────── */

test("-23 the Wild Shape button's tooltip counts the profiles without resolving any actor", async () => {
  const { talo } = fresh();
  const p = A.panel("DND5E.BonusAction", [slot(), btn(talo.items.get(IDS.ws))]);
  fire(p, talo);
  const ws = p._buttons.find(b => b.constructor.name === "WildShapeButton");
  let n = 0;
  const real = globalThis.fromUuidSync;
  globalThis.fromUuidSync = uuid => { n++; return real(uuid); };
  const tip = await ws.getTooltipData();
  globalThis.fromUuidSync = real;
  assert.equal(n, 0);
  assert.equal(tip.subtitle, "3 known forms");
});

/* ── -11 the pointermove check arms only for a stale tooltip ──────────────── */

test("-11 [declared] T-D7 pointermove arms no timer while no tooltip is up or its anchor is connected", () => {
  mock.timers.tick(1_000);                                        // earlier renders' pending stale checks run first
  const move = F.D.listeners.find(l => l.type === "pointermove").fn;
  let armed = 0;
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { if (ms === 60) armed++; return realSet(fn, ms); };
  try {
    game.tooltip.element = null;
    move();
    const anchor = F.D.el("div", "anchor");
    game.tooltip.element = anchor;
    move();
    assert.equal(armed, 0, "nothing to check");
    F.tooltipCalls.length = 0;
    anchor.remove();                                              // the anchor leaves after the move …
    mock.timers.tick(60);
    assert.deepEqual(F.tooltipCalls, [], "… so no pending check drops it (the declared nuance)");
    move();                                                       // the next move does
    assert.equal(armed, 1);
    mock.timers.tick(60);
    assert.deepEqual(F.tooltipCalls, ["deactivate"]);
  } finally {
    globalThis.setTimeout = realSet;
    game.tooltip.element = null;
  }
});

/* ── -2 world-time scans only where the runner can be ─────────────────────── */

test("-2 [declared] T-D6 updateWorldTime: a player's client skips both scans while a GM is connected; with no GM the owner's still ends the form", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  let scans = 0;
  const realIter = game.actors[Symbol.iterator];
  game.actors[Symbol.iterator] = function () { scans++; return realIter.call(this); };
  // Starry Form scans the started combats' combatants (D8-starry: only combat time counts).
  const realCombats = game.combats[Symbol.iterator];
  game.combats[Symbol.iterator] = function () { scans++; return realCombats.call(this); };
  try {
    F.become({ userId: IDS.player });
    Hooks.callAll("updateWorldTime", 30_000, 30_000);
    assert.equal(scans, 0, "neither the Wild Shape nor the Starry scan ran");
    F.become({ userId: IDS.gm });
    Hooks.callAll("updateWorldTime", 10, 10);
    assert.equal(scans, 2, "the GM's client scans (Wild Shape, Starry)");
    F.calls.length = 0;
    game.users.get(IDS.gm).active = false;
    F.become({ userId: IDS.player });
    Hooks.callAll("updateWorldTime", 30_000, 30_000);
    await flush();
    mock.timers.tick(750);                                // the one-tab claim settles (transform-core-async-2)
    await flush();
    assert.equal(scans, 4, "no GM connected: the owner's client scans");
    assert.deepEqual(F.calls.filter(c => c.op === "revertOriginalForm").map(c => c.actor), [wolf.id], "and ends the expired form");
  } finally {
    game.actors[Symbol.iterator] = realIter;
    game.combats[Symbol.iterator] = realCombats;
    game.users.get(IDS.gm).active = true;
    F.become({ userId: IDS.gm });
  }
});

/* ── C59 the druid's ended effects go in one batch ────────────────────────── */

test("C59 [declared, perf] revert: the druid's effects that ended in the form are deleted in one batch (Concentration through endConcentration first)", async () => {
  const { talo } = fresh({ effects: [{ id: IDS.conc, name: "Concentrating", statuses: ["concentrating"] }, { id: IDS.bless, name: "Bless" },
    { id: "guidanceEff00001", name: "Guidance" }] });
  const wolf = await T.shift(talo, "p1");
  for (const id of [IDS.conc, IDS.bless, "guidanceEff00001"]) wolf.effects.delete(id);   // ended in the form (no hooks)
  F.calls.length = 0;
  await T.revert(wolf, { quiet: true });
  const ops = F.calls.filter(c => ["endConcentration", "deleteEmbedded"].includes(c.op) && c.actor === IDS.talo);
  assert.deepEqual(ops.map(c => [c.op, c.ids ?? c.effect]), [["endConcentration", IDS.conc], ["deleteEmbedded", [IDS.bless, "guidanceEff00001"]]]);
  assert.equal(talo.effects.get(IDS.bless), undefined);
  assert.equal(talo.effects.get("guidanceEff00001"), undefined);
});

test("C59 review: a dependent Concentration's end already deleted (listed before it) is left out of the batch, and revert still resolves", async () => {
  const { talo } = fresh({ effects: [{ id: IDS.bless, name: "Bless" }, { id: IDS.conc, name: "Concentrating", statuses: ["concentrating"] },
    { id: "guidanceEff00001", name: "Guidance" }] });
  // dnd5e on the active GM: ending Concentration deletes its dependents, and the delete waits for it
  talo.endConcentration = async effect => {
    F.calls.push({ op: "endConcentration", actor: talo.id, effect: effect?.id ?? null });
    await effect?.delete();
    await talo.effects.get(IDS.bless)?.delete();
  };
  // Foundry's batch delete looks each id up strictly and throws on one that is gone
  const loose = talo.deleteEmbeddedDocuments;
  talo.deleteEmbeddedDocuments = async (type, ids, options) => {
    const coll = type === "Item" ? talo.items : talo.effects;
    for (const id of ids) if (!coll.has(id)) throw new Error(`${type} "${id}" does not exist`);
    return loose.call(talo, type, ids, options);
  };
  const wolf = await T.shift(talo, "p1");
  for (const id of [IDS.bless, IDS.conc, "guidanceEff00001"]) wolf.effects.delete(id);   // ended in the form (no hooks)
  F.calls.length = 0;
  const back = await T.revert(wolf, { quiet: true });
  assert.equal(back, talo, "revert resolves to the druid");
  const ops = F.calls.filter(c => ["endConcentration", "deleteEmbedded"].includes(c.op) && c.actor === IDS.talo);
  assert.deepEqual(ops.map(c => [c.op, c.ids ?? c.effect]), [["endConcentration", IDS.conc], ["deleteEmbedded", ["guidanceEff00001"]]]);
  for (const id of [IDS.bless, IDS.conc, "guidanceEff00001"]) assert.equal(talo.effects.get(id), undefined, id);
});

/* ── §5.8 the senses light flag is deleted with _del, never unsetFlag ─────── */

test("§5.8 [declared] Starry Form ending removes flags.pentaryn-senses.light with update(_del), never unsetFlag on the foreign scope", async () => {
  const S = await import("../starry-adapter.mjs");
  const { talo } = fresh();
  const item = talo.items.get(IDS.starry);
  await S.assumeStarry(talo, "archer");
  assert.ok(item.flags["pentaryn-senses"]?.light, "the light is on");
  let unset = 0;
  item.unsetFlag = async () => { unset++; };
  F.calls.length = 0;
  await S.endStarry(talo, { quiet: true });
  await flush();
  assert.equal(unset, 0);
  const upd = F.calls.find(c => c.op === "update" && c.uuid === item.uuid);
  assert.ok(upd, JSON.stringify(F.calls.map(c => c.op)));
  assert.equal(item.flags["pentaryn-senses"]?.light, undefined, "gone");
});

/* ── R1 tile left-clicks: Argon does not await them ───────────────────────── */

test("R1 [declared] a rejecting shift()/assumeStarry() under a FormTile/ConstellationTile click resolves (no unhandled rejection), warns, and still drops the stale tooltip", async () => {
  const W = await import("../wildshape-adapter.mjs");
  const S = await import("../starry-adapter.mjs");
  const { talo } = fresh();
  ui.ARGON._actor = talo;
  const p = A.panel("DND5E.BonusAction", [slot()]);
  fire(p, talo);
  await flush();
  const by = name => p._buttons.find(b => b.constructor.name === name);
  const ws = by("WildShapeButton"), starry = by("StarryFormButton");
  await ws.render();
  await starry.render();
  W.wildShapeActivity(talo).use = async () => { throw new Error("boom"); };
  const consume = [...talo.items.get(IDS.starry).system.activities.values()].find(S.isStarryConsume);
  consume.use = async () => { throw new Error("boom"); };
  for (const [tile, text] of [[ws.panel._buttons[0], "form tile click failed"], [starry.panel._buttons[0], "constellation tile click failed"]]) {
    F.console.length = 0;
    F.tooltipCalls.length = 0;
    game.tooltip.element = { isConnected: false };            // the HUD rebuild took the anchor
    // Argon's itemButton.js calls _onLeftClick without await: its promise must never reject.
    await assert.doesNotReject(tile._onLeftClick({}), text);
    assert.deepEqual(F.tooltipCalls, ["deactivate", "deactivate"], `${text}: the stale tooltip is dropped after the failure`);
    assert.deepEqual(F.console.map(c => [c[0], c[1]]), [["warn", `pentaryn-transform | ${text}`]]);
  }
  game.tooltip.element = null;
  liveButtons.clear();
});

test("R1 [declared] ReturnButton's click, for symmetry: a throw resolves, warns, and still drops the stale tooltip", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const p = A.panel("DND5E.BonusAction", [slot()]);
  fire(p, wolf);
  await flush();
  const ret = p._buttons.find(b => b.constructor.name === "ReturnButton");
  Object.defineProperty(ret, "hudActor", { get() { throw new Error("boom"); } });
  F.console.length = 0;
  F.tooltipCalls.length = 0;
  game.tooltip.element = { isConnected: false };
  await assert.doesNotReject(ret._onLeftClick({}));
  assert.deepEqual(F.tooltipCalls, ["deactivate", "deactivate"]);
  assert.deepEqual(F.console.map(c => [c[0], c[1]]), [["warn", "pentaryn-transform | return button click failed"]]);
  game.tooltip.element = null;
  liveButtons.clear();
});

/* ── M7 one refund: the Starry routes call wildshape-adapter's refund() ───── */

test("M7 [declared] wildshape-adapter exports refund(actor, item | id); starry.mjs and starry-adapter.mjs refund through it, never inline", async () => {
  const { readFileSync } = await import("node:fs");
  const W = await import("../wildshape-adapter.mjs");
  assert.equal(typeof W.refund, "function", "refund is exported");
  const { talo } = fresh();
  const ws = talo.items.get(IDS.ws);
  await ws.update({ "system.uses.spent": 2 });
  await W.refund(talo, ws);
  assert.equal(ws.system.uses.spent, 1, "by the item");
  await W.refund(talo, IDS.ws);
  assert.equal(ws.system.uses.spent, 0, "by its id");
  F.calls.length = 0;
  await W.refund(talo, ws);
  assert.equal(F.calls.filter(c => c.op === "update").length, 0, "nothing spent: nothing written");
  await assert.doesNotReject(W.refund(talo, null), "no item: nothing to do");
  for (const f of ["starry.mjs", "starry-adapter.mjs"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /refundUpdate/, `${f} computes no refund update of its own`);
    assert.match(src, /\brefund\(/, `${f} calls the shared refund()`);
  }
});
