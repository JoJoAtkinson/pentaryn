// The audit's standalone findings (guide §4), each with its own test, on the glue world.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
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
    assert.equal(scans, 4, "no GM connected: the owner's client scans");
    assert.deepEqual(F.calls.filter(c => c.op === "revertOriginalForm").map(c => c.actor), [wolf.id], "and ends the expired form");
  } finally {
    game.actors[Symbol.iterator] = realIter;
    game.users.get(IDS.gm).active = true;
    F.become({ userId: IDS.gm });
  }
});
