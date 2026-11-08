// expiry.mjs on a client (the pure rules are in the LEGACY suite test/table.mjs, checks 45–52 and 57–60):
// 1 CONFIG.ActiveEffect.expiryAction = "delete" at init (triage C4, Joe 2026-11-07), restored by
//   uninstall(); 2 the preCreateActiveEffect guard (triage C3, narrowed): a self-cast reaction's
//   plain turnStart becomes dnd5e's sourceStart, with a null duration value, on the CREATING client
//   (a player too; never GM-gated) and only when combat is on and it is not that actor's turn;
// 3 (0.7.2) a sourceStart / sourceEnd effect with no `system.origin.actor` gets the caster recorded
//   there, resolved from the activity, the item, then the plain origin (dnd5e's own shape leaves the
//   COMPENDIUM uuid in `item`, which resolves to no actor: Caven's barrier went at the round turnover).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
F.CONFIG.ActiveEffect = { expiryAction: "update" };          // core's default (foundry.mjs 219365)
await import("../riders.mjs");
const sorc = W.actor(IDS.sorc);
const foe = makeActor({ id: "foe0000000000001", name: "Bazgar", type: "npc" });
F.game.actors.set(foe.id, foe);

/* ── 1. expired effects vanish ────────────────────────────────────────────── */

test("import alone leaves CONFIG.ActiveEffect.expiryAction as it was; init sets it to delete; ready keeps it", () => {
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "update");
  F.fire("init");
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "delete");
  F.fire("ready");
  mock.timers.tick(0);
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "delete");
  assert.deepEqual(W.take(), []);
});

test("selftest reports it: 'expired effects are deleted', detail the live value", () => {
  const check = F.game.pentaryn.riders.selftest().checks.find(c => c.label === "expired effects are deleted");
  assert.deepEqual(check, { label: "expired effects are deleted", ok: true, detail: "delete" });
  F.CONFIG.ActiveEffect.expiryAction = "update";
  assert.deepEqual(F.game.pentaryn.riders.selftest().checks.find(c => c.label === "expired effects are deleted"), { label: "expired effects are deleted", ok: false, detail: "update" });
  F.CONFIG.ActiveEffect.expiryAction = "delete";
});

/* ── 2. the self-cast expiry guard ────────────────────────────────────────── */

/** A pending effect as preCreateActiveEffect sees it: `updateSource` records and applies the rewrite. */
// The default origin names an item the fixture does not have: it resolves to nothing, so these cases
// exercise the expiry rewrite alone (part 3's cases name a real activity).
function pending({ parent = sorc, expiry = "turnStart", value = 6, origin, systemOrigin, name = "Imperceptible Barrier" } = {}) {
  const effect = makeDoc("ActiveEffect", { name, origin: origin === undefined ? `${parent.uuid}.Item.shield0000000001.Activity.act0000000000001` : origin,
    duration: { expiry, value, units: "seconds" }, system: systemOrigin ? { origin: systemOrigin } : {} }, { parent });
  effect.rewrites = [];
  effect.updateSource = changes => { effect.rewrites.push(changes); for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(effect, k, v); };
  return effect;
}
const create = (effect, userId = IDS.gm) => F.fireCall("preCreateActiveEffect", effect, {}, {}, userId);
const combat = (actor, started = true) => { F.game.combat = { started, combatant: actor ? { actor } : null }; };
const REWRITE = [{ "duration.expiry": "sourceStart", "duration.value": null }];

test("Shield cast off-turn (the foe's turn): turnStart → sourceStart, the seconds value nulled (as dnd5e does for every pseudo-expiry)", () => {
  combat(foe);
  const e = pending();
  assert.equal(create(e), true, "never a veto");
  assert.deepEqual(e.rewrites, REWRITE);
  assert.equal(e.duration.expiry, "sourceStart");
  assert.equal(e.duration.value, null);
  assert.deepEqual(W.take(), []);
});

test("Shield on the caster's own turn: untouched", () => {
  combat(sorc);
  const e = pending();
  create(e);
  assert.deepEqual(e.rewrites, []);
  assert.equal(e.duration.expiry, "turnStart");
});

test("a caster-turn effect on a foe (Hold Person: origin the caster, parent the foe): untouched", () => {
  combat(sorc);
  const e = pending({ parent: foe, origin: `${sorc.uuid}.Item.hold000000000001.Activity.act0000000000002`, name: "Hold Person" });
  create(e);
  assert.deepEqual(e.rewrites, []);
  const viaSystem = pending({ parent: foe, origin: null, systemOrigin: { actor: sorc.uuid }, name: "Hold Person" });
  create(viaSystem);
  assert.deepEqual(viaSystem.rewrites, [], "dnd5e's system.origin.actor names the caster: untouched");
});

test("no combat (none, or not started): untouched", () => {
  F.game.combat = null;
  const none = pending();
  create(none);
  assert.deepEqual(none.rewrites, []);
  combat(foe, false);
  const notStarted = pending();
  create(notStarted);
  assert.deepEqual(notStarted.rewrites, []);
});

test("other shapes are left alone: sourceStart already, turnEnd, no expiry, an enchantment on an item, a foreign origin, no origin", () => {
  combat(foe);
  const item = sorc.items.get("longsword0000001");
  for (const e of [pending({ expiry: "sourceStart" }), pending({ expiry: "turnEnd" }), pending({ expiry: null }), pending({ parent: item }),
    pending({ origin: `${foe.uuid}.Item.x` }), pending({ origin: null })]) {
    create(e);
    assert.deepEqual(e.rewrites, [], JSON.stringify({ expiry: e.duration.expiry, parent: e.parent?.documentName, origin: e.origin }));
  }
});

test("the rewrite is the creating client's, GM or player (pre* runs on the initiator only); dnd5e's system.origin.actor on oneself counts", () => {
  combat(foe);
  F.become({ userId: IDS.player });
  try {
    const e = pending();
    create(e, IDS.player);
    assert.deepEqual(e.rewrites, REWRITE);
    const self = pending({ origin: null, systemOrigin: { actor: sorc.uuid } });
    create(self, IDS.player);
    assert.deepEqual(self.rewrites, REWRITE);
  } finally {
    F.become({ userId: IDS.gm });
  }
});

test("a throw is warned, never propagated", () => {
  combat(foe);
  W.take();
  create({ get parent() { throw new Error("odd effect"); } });
  assert.deepEqual(W.take(), [["warn", `${MODULE} | self-cast expiry guard skipped`, "odd effect"]]);
  create(null);
  assert.deepEqual(W.take(), []);
});

/* ── 3. the source actor recorded (0.7.2) ─────────────────────────────────── */

// dnd5e's own shape on an effect its activity applied: `item` the spell's COMPENDIUM uuid (an index
// entry live, nothing here), `activity` the caster's embedded activity, `actor` null. The stub's
// fromUuidSync knows no Activity kind; this wrapper resolves `.Activity.<id>` through the item's
// activities, as Foundry does (strict: false is accepted and ignored, as the stub does).
const SPELL = "Compendium.dnd-players-handbook.spells.Item.phbsplShield0000";
const activityOf = actor => `${actor.uuid}.Item.fireball00000001.Activity.fbsave0000000001`;
const dndOrigin = (actor, extra = {}) => ({ activity: activityOf(actor), item: SPELL, actor: null, ...extra });
const baseFromUuidSync = globalThis.fromUuidSync;
globalThis.fromUuidSync = (uuid, opts) => {
  const m = /^(.*)\.Activity\.([^.]+)$/.exec(String(uuid ?? ""));
  if (!m) return baseFromUuidSync(uuid, opts);
  return baseFromUuidSync(m[1], opts)?.system?.activities?.get?.(m[2]) ?? null;
};
const RECORDED = actor => ({ "system.origin.actor": actor.uuid });

test("dnd5e's shape with sourceStart (compendium item, embedded activity, no actor): the caster is recorded from the activity; the compendium item stays; sourceEnd on a foe (Hold Person) names the caster, not the foe; out of combat too", () => {
  combat(foe);
  const e = pending({ expiry: "sourceStart", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
  assert.equal(create(e), true, "never a veto");
  assert.deepEqual(e.rewrites, [RECORDED(sorc)]);
  assert.equal(e.system.origin.actor, sorc.uuid);
  assert.equal(e.system.origin.item, SPELL);
  assert.equal(e.duration.expiry, "sourceStart", "the expiry is not touched");
  const hold = pending({ parent: foe, expiry: "sourceEnd", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc), name: "Hold Person" });
  create(hold);
  assert.deepEqual(hold.rewrites, [RECORDED(sorc)]);
  F.game.combat = null;
  const quiet = pending({ expiry: "sourceStart", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
  create(quiet);
  assert.deepEqual(quiet.rewrites, [RECORDED(sorc)], "the record is about the expiry, not the fight");
  assert.deepEqual(W.take(), []);
});

test("the turnStart → sourceStart rewrite records the actor in the same pass: the expiry first, then the actor", () => {
  combat(foe);
  const e = pending({ origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
  create(e);
  assert.deepEqual(e.rewrites, [...REWRITE, RECORDED(sorc)]);
  assert.equal(e.duration.expiry, "sourceStart");
  assert.equal(e.system.origin.actor, sorc.uuid);
  F.become({ userId: IDS.player });
  try {
    const mine = pending({ origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
    create(mine, IDS.player);
    assert.deepEqual(mine.rewrites, [...REWRITE, RECORDED(sorc)], "the creating client, a player too");
  } finally { F.become({ userId: IDS.gm }); }
});

test("the caster is resolved from the activity, else the item, else the plain origin; an Actor uuid as origin is the actor itself", () => {
  combat(foe);
  const viaItem = pending({ expiry: "sourceStart", origin: null, systemOrigin: { activity: null, item: `${sorc.uuid}.Item.fireball00000001`, actor: null } });
  create(viaItem);
  assert.deepEqual(viaItem.rewrites, [RECORDED(sorc)]);
  const viaOrigin = pending({ expiry: "sourceStart", origin: `${sorc.uuid}.Item.fireball00000001` });
  create(viaOrigin);
  assert.deepEqual(viaOrigin.rewrites, [RECORDED(sorc)]);
  const actorOrigin = pending({ expiry: "sourceStart", origin: foe.uuid, systemOrigin: { activity: null, item: SPELL, actor: null } });
  create(actorOrigin);
  assert.deepEqual(actorOrigin.rewrites, [RECORDED(foe)]);
});

test("system.origin.actor already recorded: untouched", () => {
  combat(foe);
  for (const e of [pending({ expiry: "sourceStart", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc, { actor: sorc.uuid }) }),
    pending({ expiry: "sourceEnd", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc, { actor: foe.uuid }) })]) {
    create(e);
    assert.deepEqual(e.rewrites, []);
  }
});

test("a non-source expiry is untouched: turnStart on the caster's own turn (no rewrite either), turnEnd, targetStart, none", () => {
  combat(sorc);
  for (const expiry of ["turnStart", "turnEnd", "targetStart", null]) {
    const e = pending({ expiry, origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
    create(e);
    assert.deepEqual(e.rewrites, [], String(expiry));
    assert.equal(e.system.origin.actor, null);
  }
});

test("nothing resolvable: the compendium item alone, an activity that is gone, an unknown origin, no origin → untouched, no warning", () => {
  combat(foe);
  for (const e of [pending({ expiry: "sourceStart", origin: SPELL, systemOrigin: { activity: null, item: SPELL, actor: null } }),
    pending({ expiry: "sourceStart", origin: null, systemOrigin: { activity: `${sorc.uuid}.Item.nothere000000001.Activity.x`, item: SPELL, actor: null } }),
    pending({ expiry: "sourceStart", origin: "Actor.nobody0000000001.Item.x" }),
    pending({ expiry: "sourceStart", origin: null })]) {
    create(e);
    assert.deepEqual(e.rewrites, [], JSON.stringify(e.system.origin ?? e.origin));
  }
  assert.deepEqual(W.take(), []);
});

test("a throw while resolving skips that candidate (nothing written, nothing warned); a throw from the write is warned, never propagated", () => {
  combat(foe);
  const wrapped = globalThis.fromUuidSync;
  globalThis.fromUuidSync = () => { throw new Error("broken index"); };
  try {
    const e = pending({ expiry: "sourceStart", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
    assert.equal(create(e), true);
    assert.deepEqual(e.rewrites, []);
    assert.deepEqual(W.take(), []);
  } finally { globalThis.fromUuidSync = wrapped; }
  const bad = pending({ expiry: "sourceStart", origin: activityOf(sorc), systemOrigin: dndOrigin(sorc) });
  bad.updateSource = () => { throw new Error("no such field"); };
  assert.equal(create(bad), true);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | self-cast expiry guard skipped`, "no such field"]]);
});

/* ── uninstall / hot patch ────────────────────────────────────────────────── */

test("uninstall() puts core's expiry action back; a hot re-run of configure() sets delete again; a world without the key gets it and loses it", async () => {
  const { configure, uninstall } = await import("../expiry.mjs");
  F.game.pentaryn.riders.uninstall();
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "update");
  assert.equal(F.listeners("preCreateActiveEffect"), 0, "the guard is gone with the other hooks");
  configure();
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "delete");
  configure();
  uninstall();
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "update", "the value before the FIRST configure");
  delete F.CONFIG.ActiveEffect.expiryAction;
  configure();
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "delete");
  uninstall();
  assert.equal("expiryAction" in F.CONFIG.ActiveEffect, false);
  uninstall();   // idempotent
  delete F.CONFIG.ActiveEffect;
  configure();
  assert.equal(F.CONFIG.ActiveEffect.expiryAction, "delete", "no CONFIG.ActiveEffect at all: created");
  uninstall();
});
