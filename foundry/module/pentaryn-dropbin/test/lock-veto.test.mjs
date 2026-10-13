// dropbin-M6 [declared]: the two lock vetoes (item-piles-preRenderInterface, item-piles-preRenderActorSheet)
// had identical bodies. They are now one refuseIfLocked(target), registered twice with the same labels in
// the same order (golden/hooks.json, golden/describe.json unchanged); a player is refused the same way by both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER, GM, dropbinWorld, ip, makeActor } from "./fixtures/world.mjs";

const F = await dropbinWorld();
const chest = makeActor(F, { id: "actorChest000001", name: "Hidden Cache", type: "npc", flags: ip({ enabled: true, type: "container", locked: true }) });
const { install, uninstall } = await import("../itempiles.mjs");

test("the two lock vetoes are one handler, registered with the same labels in the same order (dropbin-M6)", async () => {
  const records = [];
  const readies = [];
  const reg = { on: (name, fn, opts = {}) => records.push({ name, fn, label: opts.label ?? name }) };
  install(reg, { log: null, onReady: (fn, label) => readies.push({ fn, label }) });
  try {
    await readies.find(r => r.label === "locks").fn();
    const locks = records.filter(r => r.label.startsWith("lock: "));
    assert.deepEqual(locks.map(r => [r.name, r.label]), [
      ["item-piles-preRenderInterface", "lock: interface"],
      ["item-piles-preRenderActorSheet", "lock: actor sheet"],
      ["item-piles-preRattleItemPile", "lock: rattle"],
    ]);
    const [iface, sheet] = locks;
    assert.equal(iface.fn, sheet.fn, "one refuseIfLocked handler serves both vetoes");
    assert.equal(iface.fn.name, "refuseIfLocked");

    F.become({ userId: PLAYER });
    try {
      assert.equal(iface.fn(chest), false, "a player is refused the locked chest");
      assert.equal(sheet.fn({ actor: chest }), false, "and its sheet");
    } finally { F.become({ userId: GM }); }
    assert.equal(iface.fn(chest), undefined, "the GM is not refused");
  } finally { uninstall(); }
});
