// transform-creatures-40 [declared] C-D8: the strip's 500 ms dock poll runs only while the strip
// exists, floatOverHud is on and Argon's module (enhancedcombathud) is enabled; the strip's styles
// are written only when the dock changes. A player client; Argon starts disabled.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const W = await setupWorld({ player: true });
const { F, D } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
const api = F.game.modules.get(MODULE).api;
const tick = async ms => {
  mock.timers.tick(ms);
  await drain();
};
const ARGON = ".extended-combat-hud .action-hud";
const BAR = { top: 700, left: 300, width: 900, height: 120 };

/** Count every write to the strip's style and class list from here on. */
function countWrites(el) {
  const n = { style: 0, toggle: 0 };
  const style = { ...el.style };
  el.style = new Proxy(style, { set(o, k, v) { n.style++; o[k] = v; return true; } });
  const toggle = el.classList.toggle.bind(el.classList);
  el.classList.toggle = (...a) => { n.toggle++; return toggle(...a); };
  return n;
}

test("Argon disabled: the strip mounts docked and no poll is ever armed, even with its HUD in the DOM", async () => {
  D.argon(ARGON, BAR);
  await tick(60);
  const el = W.strip();
  assert.ok(el);
  assert.equal(el.classList.contains("pcr-floating"), false);
  assert.deepEqual([el.style.bottom, el.style.left], ["", ""], "docked styles written once, on the new element");
  assert.deepEqual(D.queries, [], "Argon's DOM is never read (was: two queries every 500 ms)");
  D.byId.length = 0;
  await tick(5000);
  assert.deepEqual([D.byId, D.queries], [[], []], "no interval: nothing runs");
});

test("Argon enabled: the next render floats it and arms the poll; floatOverHud off stops it", async () => {
  F.game.modules.set("enhancedcombathud", { id: "enhancedcombathud", active: true });
  api.render();
  const el = W.strip();
  assert.equal(el.classList.contains("pcr-floating"), true);
  assert.deepEqual([el.style.bottom, el.style.left], ["208px", "300px"]);
  D.queries.length = 0;
  await tick(500);
  assert.deepEqual(D.queries, [ARGON], "polling");
  await F.game.settings.set(MODULE, "floatOverHud", false);
  D.queries.length = 0;
  await tick(1500);
  assert.deepEqual(D.queries, []);
  await F.game.settings.set(MODULE, "floatOverHud", true);
  assert.equal(el.classList.contains("pcr-floating"), true);
});

test("styles are written only when the dock changes", async () => {
  const el = W.strip();
  const n = countWrites(el);
  await tick(1500);
  assert.deepEqual(n, { style: 0, toggle: 0 }, "three ticks, same bar: no writes (was: three of each)");
  D.argon(ARGON, { ...BAR, top: 600 });
  await tick(500);
  assert.deepEqual(n, { style: 2, toggle: 1 }, "the bar moved: one write of each");
  assert.deepEqual([el.style.bottom, el.style.left], ["308px", "300px"]);
  D.clearArgon();
  await tick(500);
  assert.deepEqual(n, { style: 4, toggle: 2 }, "HUD closed: docked once");
  assert.equal(el.classList.contains("pcr-floating"), false);
  await tick(1000);
  assert.deepEqual(n, { style: 4, toggle: 2 }, "and nothing after");
});

test("the strip going away stops the poll", async () => {
  await F.game.settings.set(MODULE, "showStrip", false);
  await tick(60);
  assert.equal(W.strip(), null);
  await tick(500);
  D.byId.length = 0;
  D.queries.length = 0;
  await tick(2000);
  assert.deepEqual([D.byId, D.queries], [[], []]);
});
