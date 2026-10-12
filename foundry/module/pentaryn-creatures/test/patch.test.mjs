// The Token#isVisible wrap through the kit (guide step 5): recorded with its adjustments row, the
// marker literal on the new getter, undone by the feature's uninstall. A player client, direct path.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { MODULE, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const W = await setupWorld({ player: true });
const { F } = W;
registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");
const ownerSees = await import("../owner-sees.mjs");
const { patches } = await import("../lib/patch.mjs");

test("setup wraps the getter once, recorded with row creatures-libwrapper and the marker on the getter", () => {
  F.fire("init");
  F.fire("setup");
  assert.deepEqual(patches(), [{
    moduleId: MODULE, label: "Token#isVisible", name: "isVisible", marker: "__pentarynCreaturesVisible",
    via: "direct", adjustments: "creatures-libwrapper",
  }]);
  const get = Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get;
  assert.equal(get.__pentarynCreaturesVisible, true);
  assert.equal(W.p("tImp").isVisible, true, "owned summon");
  assert.equal(W.p("tGob").isVisible, false);
});

test("uninstall restores core's getter and drops the record; installing again wraps again", () => {
  ownerSees.uninstall();
  assert.equal(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  assert.deepEqual(patches(), []);
  assert.equal(W.p("tImp").isVisible, false, "core's answer only");
  ownerSees.uninstall();   // a second call is a no-op
  const ctx = { log: { warn() {} }, onSettingChange() {}, expose() {} };
  const reg = { once: (name, fn) => fn() };
  ownerSees.install(reg, ctx);
  assert.equal(patches().length, 1);
  assert.equal(W.p("tImp").isVisible, true);
});
