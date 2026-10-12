// Guide S8: the behaviour-neutral seams, each pinned against the code it replaced (the S1 legacy
// oracles in fixtures/legacy-combat.mjs, or the old inline expression copied here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCombat, makeMessage, makeToken, setupWorld } from "./fixtures/world.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";
import { fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";

const W = await setupWorld();
const { F, doc } = W;
const core = await import("../combat-core.mjs");
const shapes = await import("../shapes.mjs");
const dialogs = await import("../dialog-adapter.mjs");
const { protoDescriptor } = await import("../argon.mjs");

test("isWeaponAttack (shapes) equals both legacy predicates on the 60-case table plus null (combat-riders-4)", () => {
  let n = 0;
  for (const type of ["attack", "save", "damage"]) {
    for (const classification of ["weapon", "unarmed", "spell", null]) {
      for (const itemType of ["weapon", "spell", "feat", "consumable", undefined]) {
        const a = { type, attack: { type: { classification } }, item: itemType ? { type: itemType } : undefined };
        assert.equal(shapes.isWeaponAttack(a), legacy.weaponLike(a), JSON.stringify(a));
        assert.equal(shapes.isWeaponAttack(a), legacy.isWeaponAttack(a), JSON.stringify(a));
        n++;
      }
    }
  }
  assert.equal(n, 60);
  assert.equal(shapes.isWeaponAttack(null), legacy.weaponLike(null));
  assert.equal(shapes.isWeaponAttack({ type: "attack", attack: { type: { classification: null } }, item: { type: "weapon" } }), true);
  assert.equal(shapes.isWeaponAttack({ type: "attack", attack: { type: { classification: "spell" } }, item: { type: "weapon" } }), false);
});

test("damageLabel equals the weapon tile's and the pause-bar tile's legacy strings", () => {
  const acts = [{ labels: { damage: [{ label: "1d8 + 3 Slashing" }] } }, { labels: { damages: [{ formula: "1d6" }] } }, {}, null,
    { labels: { damage: [{ label: "1d4" }, { formula: "1d6" }, {}] }, toHit: "+5" }];
  for (const a of acts) {
    assert.equal(shapes.damageLabel(a), legacy.weaponTileDamage(a));
    assert.equal([a?.labels?.toHit ?? "", shapes.damageLabel(a)].filter(Boolean).join(" · "), legacy.swapTileStats(a));
  }
});

test("protoDescriptor: the first descriptor up the chain; `accept` skips the rest", () => {
  class A { get x() { return 1; } }
  class B extends A { }
  Object.defineProperty(B.prototype, "y", { value: 2, configurable: true });
  class C extends B { }
  const own = new B();
  Object.defineProperty(own, "x", { value: 9 });
  assert.equal(protoDescriptor(own, "x").get, Object.getOwnPropertyDescriptor(A.prototype, "x").get, "own property ignored");
  assert.equal(protoDescriptor(new C(), "y").value, 2);
  assert.equal(protoDescriptor(new C(), "y", d => !!d.get), null);
  assert.equal(protoDescriptor(new C(), "nope"), null);
});

test("rollDialogOf: buttonOnly refuses anything but a button; otherwise the newest window when nothing is focused", () => {
  const win = doc.createElement("div");
  win.id = "roll-seam";
  win.className = "application roll-configuration";
  doc.body.append(win);
  const app = { id: "roll-seam" };
  F.foundry.applications.instances.set("roll-seam", app);
  const input = doc.createElement("input");
  win.append(input);
  const button = doc.createElement("button");
  win.append(button);
  assert.equal(dialogs.rollDialogOf(input, { buttonOnly: true }), null);
  assert.equal(dialogs.rollDialogOf(button, { buttonOnly: true }), app);
  assert.equal(dialogs.rollDialogOf(input), app);
  assert.equal(dialogs.rollDialogOf(doc.body, { buttonOnly: true }), null);
  assert.equal(dialogs.rollDialogOf(doc.body), app, "nothing focused: the newest roll window");
  assert.equal(dialogs.topRollWindow(), win);
  win.remove();
  F.foundry.applications.instances.delete("roll-seam");
  assert.equal(dialogs.rollDialogOf(doc.body), null);
  assert.equal(dialogs.topRollWindow(), null);
});

test("isOrphanCard equals both legacy tidy decisions (combat-riders-5)", () => {
  const me = F.game.user;
  const cases = [
    makeMessage({ type: "usage", author: me, system: { deltas: {} } }),
    makeMessage({ type: "usage", author: me, system: { deltas: { actor: [{ keyPath: "system.uses.spent", delta: 1 }] } } }),
    makeMessage({ type: "usage", author: { id: "someoneElse00001" }, system: { deltas: {} } }),
    makeMessage({ type: "usage", author: me, system: { deltas: {} }, timestamp: Date.now() - 10 * 60 * 1000 }),
  ];
  const rolledUnder = makeMessage({ type: "attack", author: me, system: { origin: { id: cases[0].id } } });
  for (const msg of cases) {
    for (const running of [null, { actor: {} }]) {
      const want = legacy.tidyOnClose({ msg, messages: F.game.messages.contents, userId: me.id, now: Date.now(), running });
      assert.equal(!(!dialogs.isOrphanCard(msg, { sequence: !!running })), want, `${msg.id} running=${!!running}`);
    }
    assert.equal(dialogs.isOrphanCard(msg, { sequence: false }), legacy.tidyAtSequenceEnd({ msg, messages: F.game.messages.contents, userId: me.id, now: Date.now() }));
  }
  assert.ok(rolledUnder);
});

test("areaPlacementSkipped equals the old inline expression over all 16 combinations (combat-riders-36)", () => {
  const inline = (usage, activity, results, scene) => !!(usage?.create?.measuredTemplate && activity?.target?.template?.type && !(results?.templates?.length) && scene);
  for (const wanted of [false, true]) for (const hasArea of [false, true]) for (const placed of [0, 1]) for (const onScene of [false, true]) {
    const usage = { create: { measuredTemplate: wanted } };
    const activity = { target: { template: { type: hasArea ? "sphere" : "" } } };
    const results = { templates: Array.from({ length: placed }) };
    const scene = onScene ? {} : null;
    assert.equal(core.areaPlacementSkipped({ wanted: usage?.create?.measuredTemplate, hasArea: activity?.target?.template?.type, placed: results?.templates?.length, onScene: scene }),
      inline(usage, activity, results, scene), JSON.stringify({ wanted, hasArea, placed, onScene }));
  }
  assert.equal(core.areaPlacementSkipped(), false);
});

test("fullAttackPlanFrom (core) as recorded; the Multiattack + Action Surge row as fixed (combat-riders-22)", () => {
  const ma = { plan: [{ itemId: "bite", count: 2 }], total: 2, groups: [{ count: 2, choices: ["bite"] }] };
  const key = "c1:1:cb1";
  let turn = core.recordSwing(core.recordSwing(core.freshTurn(key), { kind: "main", weaponId: "bite" }), { kind: "main", weaponId: "bite" });
  turn = core.recordSurge(turn);
  // combat-riders-22 [declared]: two swings made and one Action Surge: the pips show two more, and the plan has them.
  assert.equal(core.fullAttackPlanFrom({ multiattack: ma, turn, inCombat: true, count: 2 }).swings.length, 2);
  assert.deepEqual(core.pipState({ count: 2, turn, inCombat: true }), { max: 4, current: 2 });
  const fresh = core.fullAttackPlanFrom({ multiattack: ma, turn: core.freshTurn(key), inCombat: true, count: 2 });
  assert.equal(fresh.swings.length, 2);
  // the PC branch through the shapes wrapper equals the legacy fullAttackPlan oracle on the cast
  const rog = rogue();
  const pc = shapes.fullAttackPlanOf(rog, { weaponId: "scimitar00000001", turn: core.freshTurn(key), inCombat: true, count: 2 });
  assert.deepEqual(pc, legacy.fullAttackPlan(rog, { weaponId: "scimitar00000001", turn: core.freshTurn(key), inCombat: true, count: 2 }));
  for (const a of [fighter(), rogue({ id: "rogue00000000002" }), wolf()]) {
    for (const opts of [{}, { inCombat: true, count: 2, turn: core.freshTurn(key) }, { multiattack: shapes.multiattackOf(a), inCombat: true, turn: core.freshTurn(key) }]) {
      const w = shapes.weaponsOf(a)[0]?.id ?? null;
      assert.deepEqual(shapes.fullAttackPlanOf(a, { weaponId: w, ...opts }), legacy.fullAttackPlan(a, { weaponId: w, ...opts }), `${a.name} ${JSON.stringify(Object.keys(opts))}`);
    }
  }
  assert.deepEqual(pc.swings.map(x => [x.weaponId, x.kind]), [["scimitar00000001", "main"], ["scimitar00000001", "main"], ["dagger0000000002", "nick"]]);
});

test("followUpsFor(actor, { bonusFree }) equals the legacy followUpsNow oracle with and without a panel (combat-riders-11)", async () => {
  const cast = [fighter({ id: "fuFighter0000001" }), rogue({ id: "fuRogue000000001" }), monk({ focus: 0, id: "fuMonk0000000000" }),
    monk({ focus: 2, id: "fuMonk2000000000" }), slayer({ id: "fuSlayer00000001" })];
  const toks = cast.map((a, i) => makeToken(a, { id: `fuTok${i}`.padEnd(16, "0"), x: i * 2 }));
  const check = (label) => {
    for (const a of cast) {
      for (const panel of [undefined, { currentActions: 1 }, { currentActions: 0 }]) {
        const free = !shapes.combatContext(a).inCombat || !panel || panel.currentActions !== 0;
        assert.deepEqual(shapes.followUpsFor(a, { bonusFree: free }), legacy.followUpsNow(a, panel), `${label} ${a.name} ${JSON.stringify(panel)}`);
      }
    }
  };
  check("out of combat, no swings");
  const c = makeCombat({ id: "fuCombat00000001", entries: cast.map((a, i) => ({ id: `fuCb${i}`.padEnd(16, "0"), actor: a, token: toks[i] })) });
  check("in combat, first combatant's turn");
  for (const [i, a] of cast.entries()) {
    c.turn = i;
    const light = shapes.weaponsOf(a).find(w => w.light)?.id ?? null;
    if (light) await shapes.updateTurn(a, t => core.recordSwing(t, { kind: "main", weaponId: light }));
    check(`${a.name}'s turn after a Light main swing`);
    await shapes.updateTurn(a, t => core.recordSwing(t, { kind: "nick", weaponId: light }));
    check(`${a.name}'s turn after Nick`);
  }
});

test("combat-riders-22: a Multiattack plan follows the Attack actions left (surges, other Actions), capped by the swings left", () => {
  const ma = { plan: [{ itemId: "bite", count: 2 }, { itemId: "claw", count: 1 }], total: 3, groups: [] };
  const t = (swings, surges = 0, otherActions = 0) => ({ ...core.freshTurn("k"), attackAction: { ...core.freshTurn("k").attackAction, swings }, surges, otherActions });
  const plan = (turn, inCombat = true) => core.fullAttackPlanFrom({ multiattack: ma, turn, inCombat, count: 3 }).swings.map(s => s.weaponId);
  assert.deepEqual(plan(t(0)), ["bite", "bite", "claw"]);
  assert.deepEqual(plan(t(1)), ["bite", "claw"], "the rest of the first run (unchanged)");
  assert.deepEqual(plan(t(3)), [], "no surge: nothing left (unchanged)");
  assert.deepEqual(plan(t(3, 1)), ["bite", "bite", "claw"], "a surge: the whole Multiattack again");
  assert.deepEqual(plan(t(4, 1)), ["bite", "claw"]);
  assert.deepEqual(plan(t(6, 1)), []);
  assert.deepEqual(plan(t(0, 0, 1)), [], "the Action went elsewhere");
  assert.deepEqual(plan(t(3, 1, 1)), [], "the surge went elsewhere");
  assert.deepEqual(plan(t(5), false), ["bite", "bite", "claw"], "out of combat: the whole Multiattack");
});
