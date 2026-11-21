// Unit N, the libWrapper route: with lib-wrapper active, ActiveEffect5e#isConcealed is registered as
// a WRAPPER on its dotted CONFIG path and the prototype is left alone; the wrapper calls wrapped()
// first and combines with the table. A player client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld({ player: true, libWrapper: "ok" });
const { F } = W;

globalThis.dnd5e = { settings: { bloodied: "player" } };
class ActiveEffect5e {
  static ID = { BLOODIED: "dnd5ebloodied000" };
  get isConcealed() {
    return false;
  }
}
const dnd5eGetter = Object.getOwnPropertyDescriptor(ActiveEffect5e.prototype, "isConcealed").get;
F.CONFIG.ActiveEffect = { documentClass: ActiveEffect5e };
F.CONFIG.statusEffects = { prone: { id: "prone" }, charmed: { id: "charmed" }, bloodied: { id: "bloodied" } };
const gob = F.game.actors.get("aGob");
gob.getActiveTokens = () => [W.tok("tGob")];
W.tok("tGob").disposition = -1;

registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");

test("setup registers a WRAPPER on CONFIG.ActiveEffect.documentClass.prototype.isConcealed; the getter stays dnd5e's", async () => {
  F.fire("init");
  F.fire("setup");
  const row = W.wrapped.find(w => w[1] === "CONFIG.ActiveEffect.documentClass.prototype.isConcealed");
  assert.ok(row, "registered");
  assert.deepEqual([row[0], typeof row[2], row[3]], [MODULE, "function", "WRAPPER"]);
  assert.equal(Object.getOwnPropertyDescriptor(ActiveEffect5e.prototype, "isConcealed").get, dnd5eGetter);
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  assert.equal(F.game.pentaryn.creatures.status().markersPatched, "libWrapper");
});

test("the wrapper: wrapped() first, then the table, `this` = the effect", () => {
  const fn = W.wrapped.find(w => w[1].endsWith("isConcealed"))[2];
  const fx = (statuses, o = {}) => Object.assign(Object.create(ActiveEffect5e.prototype), { id: "fx", target: gob, statuses: new Set(statuses), system: {}, ...o });
  let calls = 0;
  const wrapped = v => () => (calls++, v);
  assert.equal(fn.call(fx(["prone"]), wrapped(false)), false, "Prone: public");
  assert.equal(fn.call(fx(["charmed"]), wrapped(false)), true, "Charmed: GM only");
  assert.equal(fn.call(fx(["prone"]), wrapped(true)), true, "dnd5e's own yes stands");
  assert.equal(fn.call(fx(["bloodied"], { id: "dnd5ebloodied000" }), wrapped(true)), false, "dnd5e's Bloodied rule is replaced");
  assert.equal(calls, 4, "wrapped() runs every time");
});
