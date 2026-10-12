// Wild Shape ending without a click (0 HP, Incapacitated, the duration effect, world time), rests,
// and the GM sweep of spent forms — the transform.mjs hooks at rows 6-18 of golden/hooks.json.
// Mocked timers and Date: the sweep's timer, its age guard and the Incapacitated setTimeout(0).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { EFFECT_ID } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const T = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");

const lines = () => F.chat.map(c => c.content.replace(/<\/?[^>]+>/g, ""));
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
// An automatic ending claims its write for one tab first (transform-core-async-2): the claim settles in 750 ms.
const settle = async () => { await flush(); mock.timers.tick(750); await flush(); };

async function shifted(opts) {
  game.actors.clear();
  F.become({ userId: IDS.gm });
  game.time.worldTime = 0;
  const { talo } = F.W.talo(opts);
  const wolf = await T.shift(talo, "p1");
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  return { talo, wolf };
}

/* ── 0 HP ─────────────────────────────────────────────────────────────────── */

test("updateActor: a Wild Shape form at 0 HP reverts (zeroHP line) on the runner only", async () => {
  let { wolf } = await shifted();
  Hooks.callAll("updateActor", wolf, { name: "x" }, {}, "u");
  wolf.system.attributes.hp.value = 5;
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 5 } } } }, {}, "u");
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), [], "no hp change, or above 0");
  F.become({ userId: IDS.player });
  wolf.system.attributes.hp.value = 0;
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), [], "a player's client while a GM is connected");
  F.become({ userId: IDS.gm });
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
  await settle();
  assert.deepEqual(lines(), ["Talo drops to 0 HP and returns to normal form."]);
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
  await settle();
  assert.equal(ops("revertOriginalForm").length, 1, "the form is gone: exists() stops a second revert");
});

test("updateActor at 0 HP: a Polymorph form is left to dnd5e", async () => {
  const { wolf } = await shifted();
  wolf.flags.dnd5e.transformOptions = { preset: "polymorph" };
  wolf.system.attributes.hp.value = 0;
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
});

/* ── Incapacitated ────────────────────────────────────────────────────────── */

test("createActiveEffect / updateActiveEffect: Incapacitated on a form reverts after a zero timeout", async () => {
  const { wolf } = await shifted();
  const eff = F.W.makeEffect(wolf, { id: "incapEffect00001", name: "Stunned", statuses: ["stunned", "incapacitated"] }, wolf.effects);
  Hooks.callAll("createActiveEffect", eff, {}, "u");
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), [], "not before the timer");
  mock.timers.tick(0);
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), [], "statuses not updated yet: nothing");
  wolf.statuses.add("incapacitated");
  Hooks.callAll("updateActiveEffect", eff, { name: "x" }, {}, "u");
  mock.timers.tick(0);
  await settle();
  assert.deepEqual(lines(), ["Talo is incapacitated and returns to normal form."]);
});

test("effect hooks ignore effects on items and on actors that are not Wild Shape forms", async () => {
  const { talo, wolf } = await shifted();
  talo.statuses.add("incapacitated");
  const onDruid = F.W.makeEffect(talo, { id: "e1", name: "x" }, talo.effects);
  const onItem = F.W.makeEffect(wolf.items.contents[0], { id: "e2", name: "y" }, null);
  Hooks.callAll("createActiveEffect", onDruid, {}, "u");
  Hooks.callAll("createActiveEffect", onItem, {}, "u");
  mock.timers.tick(0);
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
});

/* ── the duration effect ──────────────────────────────────────────────────── */

test("updateActiveEffect: the duration effect marked expired reverts with the Expired line", async () => {
  const { wolf } = await shifted();
  const eff = wolf.effects.get(EFFECT_ID);
  Hooks.callAll("updateActiveEffect", eff, { duration: { expired: false } }, {}, "u");
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
  Hooks.callAll("updateActiveEffect", eff, { duration: { expired: true } }, {}, "u");
  await settle();
  assert.deepEqual(lines(), ["Talo's Wild Shape ends."]);
});

test("deleteActiveEffect on the duration effect: before its end → manual Return line; at/after → Expired", async () => {
  let { wolf } = await shifted();
  await wolf.effects.get(EFFECT_ID).delete();
  await settle();
  assert.deepEqual(lines(), ["Talo returns to normal form."]);
  ({ wolf } = await shifted());
  game.time.worldTime = 21600;
  await wolf.effects.get(EFFECT_ID).delete();
  await settle();
  assert.deepEqual(lines(), ["Talo's Wild Shape ends."]);
});

test("deleteActiveEffect of a carried druid effect in the form ends the druid's copy (Concentration via endConcentration)", async () => {
  const { talo, wolf } = await shifted({ effects: [{ id: IDS.conc, name: "Concentrating", statuses: ["concentrating"] }, { id: IDS.bless, name: "Bless" }] });
  await wolf.effects.get(IDS.conc).delete();
  await wolf.effects.get(IDS.bless).delete();
  await settle();
  assert.deepEqual(ops("endConcentration").map(c => [c.actor, c.effect]), [[IDS.talo, IDS.conc]]);
  assert.equal(talo.effects.get(IDS.conc), undefined);
  assert.equal(talo.effects.get(IDS.bless), undefined);
  assert.deepEqual(ops("revertOriginalForm"), [], "the form goes on");
});

test("carried-effect end: skipped on a non-runner, for a non-carried effect; a failure warns with names", async () => {
  const { talo, wolf } = await shifted({ effects: [{ id: IDS.bless, name: "Bless" }] });
  const beastOwn = F.W.makeEffect(wolf, { id: "beastOwn00000001", name: "Keen" }, wolf.effects);
  wolf.effects.set(beastOwn.id, beastOwn);
  await beastOwn.delete();
  F.become({ userId: IDS.player });
  await wolf.effects.get(IDS.bless).delete();
  F.become({ userId: IDS.gm });
  await settle();
  assert.ok(talo.effects.get(IDS.bless), "the player's client did nothing");
  const again = F.W.makeEffect(wolf, { id: IDS.bless, name: "Bless" }, wolf.effects);
  wolf.effects.set(IDS.bless, again);
  talo.effects.get(IDS.bless).delete = async () => { throw new Error("locked"); };
  await again.delete();
  await settle();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | ending Bless on Talo failed"]]);
});

test("auto-revert failing warns 'auto-revert failed'; a token's form ends its carried effects through the revert, not here", async () => {
  const { wolf } = await shifted();
  wolf.revertOriginalForm = async () => { throw new Error("x"); };
  wolf.system.attributes.hp.value = 0;
  Hooks.callAll("updateActor", wolf, { system: { attributes: { hp: { value: 0 } } } }, {}, "u");
  await settle();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | auto-revert failed"]]);
  const tokForm = F.W.makeActor({ id: "tokenForm0000002", isToken: true, isPolymorphed: true,
    flags: { dnd5e: { transformOptions: { preset: "wildshape" } }, [MODULE]: { wildshape: { carried: ["carriedEff000001"] } } },
    effects: [{ id: "carriedEff000001", name: "Bless" }] });
  tokForm.token = { id: "tf", parent: { tokens: new Map([["tf", {}]]) } };
  F.calls.length = 0;
  await tokForm.effects.get("carriedEff000001").delete();
  await settle();
  assert.deepEqual(ops("endConcentration", "delete").filter(c => c.op !== "delete" || !c.uuid.includes("tokenForm")), []);
});

/* ── world time ───────────────────────────────────────────────────────────── */

test("updateWorldTime: world forms past endsAt revert (Expired); unlinked forms on the viewed scene are checked too", async () => {
  const { wolf } = await shifted();
  const tokForm = F.W.makeActor({ id: "tokenForm0000001", name: "Bandit (Wolf)", isToken: true, isPolymorphed: true,
    flags: { dnd5e: { transformOptions: { preset: "wildshape" } }, [MODULE]: { wildshape: { endsAt: 100 } } } });
  tokForm.token = { id: "tokF", parent: null };
  const scene = F.W.makeScene({ id: "viewedScene00001" });
  const tok = { id: "tokF", actorLink: false, actor: tokForm, parent: scene };
  scene.tokens.set("tokF", tok);
  tokForm.token.parent = scene;
  canvas.scene = scene;
  tokForm.revertOriginalForm = async () => { F.calls.push({ op: "revertOriginalForm", actor: tokForm.id }); return null; };
  Hooks.callAll("updateWorldTime", 50, 50);
  await settle();
  assert.deepEqual(ops("revertOriginalForm"), []);
  Hooks.callAll("updateWorldTime", 21600, 21550);
  await settle();
  canvas.scene = null;
  assert.deepEqual(ops("revertOriginalForm").map(c => c.actor).sort(), [tokForm.id, wolf.id].sort());
  assert.deepEqual(lines(), ["Talo's Wild Shape ends."]);
});

/* ── rests ────────────────────────────────────────────────────────────────── */

test("dnd5e.longRest on the form, or on the druid with a form out: revert (Long Rest line), then the druid rests without a dialog", async () => {
  for (const on of ["form", "druid"]) {
    const { talo, wolf } = await shifted();
    const target = on === "form" ? wolf : talo;
    assert.equal(Hooks.call("dnd5e.longRest", target, { type: "long", dialog: true, newDay: true }), false, on);
    await flush();
    assert.deepEqual(lines(), ["Talo returns to normal form to take a Long Rest."], on);
    assert.deepEqual(ops("longRest").map(c => [c.actor, c.config]), [[IDS.talo, { dialog: false, newDay: true }]], on);
  }
  game.actors.clear();
  const { talo } = F.W.talo();
  assert.equal(Hooks.call("dnd5e.longRest", talo, { type: "long" }), true, "no form: the rest goes on");
});

test("dnd5e.longRest: a failing revert warns 'long rest after revert failed'", async () => {
  const { wolf } = await shifted();
  wolf.revertOriginalForm = async () => { throw new Error("x"); };
  Hooks.call("dnd5e.longRest", wolf, {});
  await flush();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | long rest after revert failed"]]);
});

test("dnd5e.longRest is never dropped silently (transform-core-async-3): in-flight revert, stale form, no original", async () => {
  // A revert already in flight: the rest waits for it, then the druid rests.
  let { talo, wolf } = await shifted();
  const job = T.revert(wolf);
  assert.equal(Hooks.call("dnd5e.longRest", talo, { type: "long", newDay: true }), false, "in flight: vetoed");
  await job;
  await flush();
  assert.equal(ops("revertOriginalForm").length, 1, "one revert, not two");
  assert.deepEqual(ops("longRest").map(c => [c.actor, c.config]), [[IDS.talo, { dialog: false, newDay: true }]], "in flight");

  // The in-flight revert came back empty: the druid rests anyway.
  ({ talo, wolf } = await shifted());
  F.revertReturns = null;
  const empty = T.revert(wolf);
  Hooks.call("dnd5e.longRest", wolf, { type: "long" });
  await empty;
  await flush();
  delete F.revertReturns;
  assert.deepEqual(ops("longRest").map(c => [c.actor, c.config]), [[IDS.talo, { dialog: false, pentarynTransformRestSync: true }]], "in flight, null");

  // A stale form (already deleted by a revert elsewhere): revert() answers null, the druid rests directly.
  ({ talo, wolf } = await shifted());
  game.actors.delete(wolf.id);
  assert.equal(Hooks.call("dnd5e.longRest", wolf, { type: "long" }), false, "stale: vetoed");
  await flush();
  assert.deepEqual(ops("revertOriginalForm"), [], "stale: no revert");
  assert.deepEqual(ops("longRest").map(c => [c.actor, c.config]), [[IDS.talo, { dialog: false, pentarynTransformRestSync: true }]], "stale");
  assert.equal(Hooks.call("dnd5e.longRest", talo, { pentarynTransformRestSync: true }), true, "the module's own rest passes");

  // No original anywhere: warn, and let dnd5e's own rest run.
  ({ talo, wolf } = await shifted());
  game.actors.delete(talo.id);
  assert.equal(Hooks.call("dnd5e.longRest", wolf, { type: "long" }), true, "no original: not vetoed");
  await flush();
  assert.deepEqual(ops("revertOriginalForm", "longRest"), []);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", `pentaryn-transform | long rest: no original for ${wolf.name}, resting the form`]]);
});

test("dnd5e.preShortRest on the druid with a form out: the form rests instead; the module's own sync passes", async () => {
  const { talo, wolf } = await shifted();
  assert.equal(Hooks.call("dnd5e.preShortRest", talo, { type: "short", dialog: true }), false);
  await flush();
  assert.deepEqual(ops("shortRest").map(c => [c.actor, c.config]), [[wolf.id, { dialog: true }]]);
  assert.equal(Hooks.call("dnd5e.preShortRest", talo, { pentarynTransformRestSync: true }), true);
  wolf.isOwner = false;
  assert.equal(Hooks.call("dnd5e.preShortRest", talo, {}), true, "a form this client does not own");
  assert.equal(Hooks.call("dnd5e.preShortRest", wolf, {}), true, "on the form itself: no redirect");
  wolf.isOwner = true;
  wolf.shortRest = async () => { throw new Error("x"); };
  Hooks.call("dnd5e.preShortRest", talo, {});
  await flush();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | short rest on the form failed"]]);
});

test("dnd5e.restCompleted (short) on a Wild Shape form: the druid gets a silent short rest of its own", async () => {
  const { talo, wolf } = await shifted();
  Hooks.callAll("dnd5e.restCompleted", wolf, {}, { type: "short", request: "req1" });
  Hooks.callAll("dnd5e.restCompleted", wolf, {}, { type: "long" });
  Hooks.callAll("dnd5e.restCompleted", wolf, {}, { type: "short", pentarynTransformRestSync: true });
  Hooks.callAll("dnd5e.restCompleted", talo, {}, { type: "short" });
  await flush();
  assert.deepEqual(ops("shortRest").map(c => [c.actor, c.config]), [[IDS.talo, {
    dialog: false, chat: false, autoHD: false, advanceTime: false, advanceBastionTurn: false, newDay: false,
    request: "req1", pentarynTransformRestSync: true
  }]]);
  talo.isOwner = false;
  Hooks.callAll("dnd5e.restCompleted", wolf, {}, { type: "short" });
  talo.isOwner = true;
  talo.shortRest = async () => { throw new Error("x"); };
  Hooks.callAll("dnd5e.restCompleted", wolf, {}, { type: "short" });
  await flush();
  assert.equal(ops("shortRest").length, 1);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | short rest on the original failed"]]);
});

/* ── the GM sweep of spent forms ──────────────────────────────────────────── */

test("sweepSpentForms: GM only; deletes unplaced transformed copies older than 10 s; reschedules the young", async () => {
  game.actors.clear();
  game.scenes.clear();
  F.calls.length = 0;
  const now = Date.now();
  const mk = (id, created, extra = {}) => F.W.add(F.W.makeActor({ id, name: id, flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: created }, ...extra }));
  mk("oldSpent00000001", now - 20_000);
  mk("youngForm0000001", now - 4_000);
  mk("placedForm000001", now - 60_000);
  F.W.add(F.W.makeActor({ id: "plainActor000001", name: "plain", _stats: { createdTime: 0 } }));
  game.scenes.set("scn", F.W.makeScene({ id: "scn", tokens: [{ id: "t1", actorId: "placedForm000001" }, { id: "t2" }] }));
  F.become({ userId: IDS.player });
  await T.sweepSpentForms();
  assert.deepEqual(ops("Actor.deleteDocuments"), [], "not the GM");
  F.become({ userId: IDS.gm });
  const job = T.sweepSpentForms();
  await settle();                                          // each spent form is claimed first (transform-core-async-2)
  await job;
  assert.deepEqual(ops("Actor.deleteDocuments").map(c => c.ids), [["oldSpent00000001"]]);
  F.calls.length = 0;
  // Tick in steps: node's mock tick sets Date.now() to the end time before running due timers.
  mock.timers.tick(2_250);                                 // 3 s in (the claim settled for 750 ms of them)
  await flush();
  mock.timers.tick(3_499);
  await flush();
  assert.deepEqual(ops("Actor.deleteDocuments"), [], "young: rechecked at 10 s - age + 500 ms (6.5 s)");
  mock.timers.tick(1);
  await settle();
  assert.deepEqual(ops("Actor.deleteDocuments").map(c => c.ids), [["youngForm0000001"]]);
  game.scenes.clear();
});

test("sweepSpentForms: a world with no transformed copy never walks scene tokens", async () => {
  game.actors.clear();
  game.scenes.clear();
  F.calls.length = 0;
  F.W.add(F.W.makeActor({ id: "plainActor000001", name: "plain", _stats: { createdTime: 0 } }));
  game.scenes.set("scn", { id: "scn", get tokens() { throw new Error("tokens walked"); } });
  F.become({ userId: IDS.gm });
  await T.sweepSpentForms();
  assert.deepEqual(ops("Actor.deleteDocuments"), []);
  mock.timers.tick(60_000);
  await flush();
  assert.deepEqual(ops("Actor.deleteDocuments"), [], "no sweep was scheduled");
  game.scenes.clear();
});

test("scheduleSweep: token traffic schedules one 3 s sweep that is never pushed back; a form losing isPolymorphed sweeps at 1.5 s", async () => {
  game.actors.clear();
  F.calls.length = 0;
  F.W.add(F.W.makeActor({ id: "spent00000000001", flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: Date.now() - 60_000 } }));
  Hooks.callAll("updateToken", {}, { actorId: "x" }, {}, "u");
  mock.timers.tick(2_000);
  Hooks.callAll("deleteToken", {}, {}, "u");                // must not push the sweep back
  mock.timers.tick(1_000);
  await settle();
  assert.equal(ops("Actor.deleteDocuments").length, 1, "swept 3 s after the first update (and its claim)");
  F.W.add(F.W.makeActor({ id: "spent00000000002", flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: Date.now() - 60_000 } }));
  const form = F.W.add(F.W.makeActor({ id: "revertedForm0001", flags: { dnd5e: { originalActor: IDS.talo, isPolymorphed: false } }, _stats: { createdTime: Date.now() - 60_000 } }));
  Hooks.callAll("updateToken", {}, { actorId: "x" }, {}, "u");   // 3 s pending
  Hooks.callAll("updateActor", form, { flags: { dnd5e: { isPolymorphed: false } } }, {}, "u");   // earlier: 1.5 s
  Hooks.callAll("updateActor", form, { name: "x" }, {}, "u"); // no dnd5e flags: ignored
  mock.timers.tick(1_500);
  await settle();
  assert.equal(ops("Actor.deleteDocuments").length, 2);
  assert.deepEqual(ops("Actor.deleteDocuments")[1].ids, ["spent00000000002", "revertedForm0001"]);
  mock.timers.tick(5_000);
  await flush();
  assert.equal(ops("Actor.deleteDocuments").length, 2, "the replaced 3 s timer was cleared");
});

test("[declared] perf-1 updateToken schedules a sweep only for an actor, link, delta or dnd5e flag change; a drag, light, hidden or elevation change schedules nothing", async () => {
  game.actors.clear();
  F.calls.length = 0;
  F.W.add(F.W.makeActor({ id: "spent00000000003", flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: Date.now() - 60_000 } }));
  for (const changes of [{ x: 100, y: 200 }, { light: { dim: 10 } }, { hidden: true }, { elevation: 5 }, { flags: { other: { a: 1 } } }]) {
    Hooks.callAll("updateToken", {}, changes, {}, "u");
  }
  mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(ops("Actor.deleteDocuments"), [], "no sweep for irrelevant token changes");
  for (const changes of [{ actorId: "x" }, { actorLink: false }, { delta: { name: "y" } }, { flags: { dnd5e: { z: 1 } } }]) {
    F.calls.length = 0;
    F.W.add(F.W.makeActor({ id: "spent00000000003", flags: { dnd5e: { originalActor: IDS.talo } }, _stats: { createdTime: Date.now() - 60_000 } }));
    Hooks.callAll("updateToken", {}, changes, {}, "u");
    mock.timers.tick(3_000);
    await settle();
    assert.equal(ops("Actor.deleteDocuments").length, 1, `swept after ${JSON.stringify(changes)}`);
  }
});

test("scheduleSweep: a polymorphed form update, or a player's client, schedules nothing; a failing sweep warns", async () => {
  game.actors.clear();
  F.calls.length = 0;
  const live = F.W.add(F.W.makeActor({ id: "liveForm00000001", flags: { dnd5e: { originalActor: IDS.talo, isPolymorphed: true } }, _stats: { createdTime: -60_000 } }));
  Hooks.callAll("updateActor", live, { flags: { dnd5e: { x: 1 } } }, {}, "u");
  F.become({ userId: IDS.player });
  Hooks.callAll("updateToken", {}, { actorId: "x" }, {}, "u");
  F.become({ userId: IDS.gm });
  mock.timers.tick(10_000);
  await flush();
  assert.deepEqual(ops("Actor.deleteDocuments"), []);
  const real = Actor.implementation.deleteDocuments;
  Actor.implementation.deleteDocuments = async () => { throw new Error("db"); };
  game.scenes.clear();
  Hooks.callAll("updateToken", {}, { actorId: "x" }, {}, "u");
  mock.timers.tick(3_000);
  await settle();
  Actor.implementation.deleteDocuments = real;
  assert.deepEqual(F.console.filter(c => c[1].includes("sweep")).map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | sweep failed"]]);
});
