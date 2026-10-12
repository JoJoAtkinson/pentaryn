// The audit's standalone findings (guide §4), each with its own test, on the glue world.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
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
