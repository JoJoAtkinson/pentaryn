// Guide step 9 (transform-creatures-15, -13 part 1) [declared] T-D3: one debug channel,
// CONFIG.debug["pentaryn-transform"] (the kit's key). The stripped-items line, the trait-enrichment
// and constellation-dialog failures and tooltip hygiene log at debug only; a failing read of
// pentaryn-combat's multiattack warns once. Return values unchanged.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS } from "./fixtures/world.mjs";
import { EFFECT_ID } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: [{ id: "pentaryn-combat", active: false }] });
const T = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const debugOn = on => { CONFIG.debug ??= {}; CONFIG.debug["pentaryn-transform"] = on; };

function fresh(opts) {
  game.actors.clear();
  F.console.length = 0;
  F.enrichThrows = false;
  F.dialogAnswer = null;
  F.become({ userId: IDS.gm });
  return F.W.talo(opts);
}

test("stripped-items line: silent with debug off; one debug line with debug on", async () => {
  debugOn(false);
  let { talo } = fresh();
  await T.shift(talo, "p1");
  assert.deepEqual(F.console, []);
  debugOn(true);
  ({ talo } = fresh());
  await T.shift(talo, "p1");
  assert.deepEqual(F.console.map(c => c.slice(0, 3)), [["debug", "pentaryn-transform | not carried into the form:",
    "Wild Shape (wildshape), Starry Form (spends-wildshape), Wild Companion (spends-wildshape), Spellcasting (no-spellcasting)"]]);
  debugOn(false);
});

test("trait enrichment failing: '' as before, and a debug line naming the source when debug is on", async () => {
  debugOn(true);
  const { talo, wolfSrc } = fresh();
  F.enrichThrows = true;
  const form = await T.shift(talo, "p1");
  assert.equal(form.effects.get(EFFECT_ID).description,
    "<p>Return to Talo is a Bonus Action. The form ends at 0 HP, when Incapacitated, or after 6 hours.</p>");
  const row = F.console.find(c => c[1] === "pentaryn-transform | traits enrichment failed");
  assert.ok(row, JSON.stringify(F.console.map(c => c.slice(0, 2))));
  assert.equal(row[0], "debug");
  assert.deepEqual(row[2], { source: wolfSrc.uuid });
  assert.equal(row[3].message, "enrich failed");
  debugOn(false);
});

test("constellation dialog rejecting: treated as closed (the use comes back), one debug line with debug on", async () => {
  debugOn(true);
  const { talo } = fresh();
  F.dialogAnswer = new Error("closed oddly");
  await talo.items.get(IDS.starry).system.activities.get("sfConsume").use({}, {}, {});
  await flush();
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1, "spent then refunded");
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["debug", "pentaryn-transform | constellation dialog failed"]]);
  assert.equal(F.console[0][3].message, "closed oddly");
  debugOn(false);
});

test("tooltip hygiene failing: still swallowed; a debug line with debug on", () => {
  debugOn(true);
  F.console.length = 0;
  const real = game.tooltip.deactivate;
  game.tooltip.deactivate = () => { throw new Error("tooltip"); };
  const anchor = F.D.el("div", "anchor");
  anchor.remove();
  game.tooltip.element = anchor;
  Hooks.callAll("renderPortraitPanelArgonComponent", {}, null, null);
  mock.timers.tick(0);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["debug", "pentaryn-transform | tooltip hygiene"]]);
  game.tooltip.deactivate = real;
  game.tooltip.element = null;
  debugOn(false);
});

test("-13 part 1: a failing read of pentaryn-combat's multiattack warns once (text pinned), the button stays", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  game.modules.get("pentaryn-combat").active = true;      // its settings are not registered: the read throws
  F.console.length = 0;
  const run = () => {
    const p = F.A.panel("DND5E.Action", [new F.A.DND5eItemButton({ item: null, isWeaponSet: true })]);
    Hooks.callAll("renderActionPanelArgonComponent", p, p.element, wolf);
    return p._buttons.map(b => b.item?.id ?? null);
  };
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"]);
  assert.deepEqual(run(), [null, "mmBite0000000001", "mmMultiattack001"]);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | combat multiattack read failed"]], "once");
  game.modules.get("pentaryn-combat").active = false;
});
