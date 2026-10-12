// Wild Shape glue: shift(), revert(), the dnd5e use hooks and dnd5e.transformActor, driven through
// the module's own exports and hooks on the stub world (fixtures/world.mjs: dnd5e's use, transform
// and revert as far as the module sees them). Pins effects: documents written, chat lines,
// notifications, console texts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { setup, IDS, MODULE, statusSet } from "./fixtures/world.mjs";
import { EFFECT_ID } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const T = await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(5000);                                   // the ready sweep (nothing to sweep)

const notes = () => F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]);
const lines = () => F.chat.map(c => c.content);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));

function fresh(opts) {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  F.enriched.length = 0;
  F.transformThrows = false;
  F.revertReturns = undefined;
  F.enrichThrows = false;
  F.transformReturnsNothing = false;
  F.lastTransformData = undefined;
  F.can.clear();
  game.settings.set("dnd5e", "allowPolymorphing", true);
  game.time.worldTime = 0;
  F.become({ userId: IDS.gm });
  game.combats.clear();
  F.calls.length = 0;
  return F.W.talo(opts);
}

/* ── shift: the happy path ────────────────────────────────────────────────── */

test("shift(talo, p1): one use spent, transformInto with the preset, the shaped form, one chat line", async () => {
  const { talo, wolfSrc } = fresh({ favorites: [
    { type: "item", id: `.Item.${IDS.ws}` }, { type: "activity", id: `.Item.${IDS.companion}.Activity.wc1` },
    { type: "item", id: `.Item.${IDS.cure}` }, { type: "skill", id: "arc" }
  ], hp: { value: 99, max: 99, temp: 5 } });
  const form = await T.shift(talo, "p1");
  assert.ok(form, "the new form");
  assert.equal(form.name, "Talo (Dire Wolf)");
  assert.equal(game.actors.get(form.id), form);
  assert.deepEqual(ops("activity.use").map(c => [c.item, c.activity, c.usage, c.dialog, c.message]),
    [[IDS.ws, "wsAct", { transform: { profile: "p1" } }, { configure: false }, { create: false }]]);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 2);
  assert.deepEqual(ops("stopAnimation").map(c => [c.token, c.o]), [["taloToken0000001", { reset: true }]], "settleTokens");
  assert.deepEqual(ops("transformInto").map(c => [c.host, c.source, c.settings]), [[IDS.talo, wolfSrc.id, { preset: "wildshape" }]]);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> shifts into a Dire Wolf — Wild Shape 1/3 left, 6 hours.</p>"]);
  assert.equal(F.chat[0].speaker.actor, IDS.talo);
  assert.deepEqual(F.enriched.map(e => e.html), ["<p>Advantage with an ally.</p>"], "passive monster traits only");
  assert.deepEqual(F.enriched[0].opts.secrets, false);
  // [declared] T-D3 (-15, guide step 9): the stripped-items line is a debug line now — nothing on the
  // console unless CONFIG.debug["pentaryn-transform"] (test/logging.test.mjs pins it switched on).
  assert.deepEqual(F.console, []);
  pinJSON("shift-linked-transform-data", F.lastTransformData, import.meta.url);
  assert.deepEqual(form.getFlag(MODULE, "wildshape"), { original: IDS.talo, source: wolfSrc.uuid, profile: "p1", endsAt: 21600, carried: [] });
  assert.equal(form.system.attributes.hp.temp, 12, "max(5, 12)");
  assert.deepEqual(notes(), []);
});

test("shift ends an active Starry Form first (its effect deleted before the transform)", async () => {
  const { talo } = fresh({ effects: [{ id: "pentarynStarry00", name: "Starry Form: Archer", flags: { [MODULE]: { starry: { constellation: "archer" } } } }] });
  await T.shift(talo, "p2");
  const order = F.calls.filter(c => (c.op === "delete" && c.documentName === "ActiveEffect") || c.op === "transformInto").map(c => c.op);
  assert.deepEqual(order, ["delete", "transformInto"]);
  assert.equal(talo.effects.get("pentarynStarry00"), undefined);
});

test("shift: druid temp HP above the grant are kept; the druid's carried effects are recorded", async () => {
  const { talo } = fresh({ hp: { value: 50, max: 99, temp: 20 },
    effects: [{ id: IDS.conc, name: "Concentrating", statuses: ["concentrating"] }, { id: IDS.bless, name: "Bless" }] });
  const form = await T.shift(talo, "p1");
  assert.equal(form.system.attributes.hp.temp, 20);
  assert.deepEqual(form.getFlag(MODULE, "wildshape").carried, [IDS.conc, IDS.bless]);
  assert.deepEqual(form.effects.map(e => e.id), [IDS.conc, IDS.bless, EFFECT_ID]);
});

/* ── shift: refusals before any use is spent ──────────────────────────────── */

test("shift refusals: no actor, no Wild Shape, unknown profile", async () => {
  fresh();
  assert.equal(await T.shift(null, "p1"), null);
  const bob = F.W.add(F.W.makeActor({ id: "bobActor00000001", name: "Bob" }));
  assert.equal(await T.shift(bob, "p1"), null);
  const { talo } = F.W.talo();
  assert.equal(await T.shift(talo, "zz"), null);
  assert.deepEqual(notes(), [["warn", "Bob has no Wild Shape."], ["warn", "That form isn't one of the known Wild Shape forms."]]);
  assert.deepEqual(ops("activity.use"), []);
});

test("shift blocks (shiftBlock order): incapacitated, 0 HP, no token, no uses — warned, nothing spent", async () => {
  const cases = [
    [{ statuses: ["incapacitated"] }, "Talo is incapacitated and can't Wild Shape."],
    [{ hp: { value: 0, max: 99, temp: 0 } }, "Talo is at 0 HP and can't Wild Shape."],
    [{ tokens: [] }, "Talo needs a token on the scene you are viewing to Wild Shape."],
    [{ uses: { max: 3, spent: 3 } }, "No Wild Shape uses left."]
  ];
  for (const [opts, text] of cases) {
    const { talo } = fresh(opts);
    assert.equal(await T.shift(talo, "p1"), null);
    assert.deepEqual(notes(), [["warn", text]], text);
    assert.deepEqual(ops("activity.use", "transformInto"), []);
  }
});

test("shift block 'cannot': a player without Allow Polymorphing, or without ACTOR_CREATE; a GM without ACTOR_CREATE too", async () => {
  const { talo } = fresh();
  const cannot = "You can't transform actors here. The GM needs to give you the Trusted role and turn on dnd5e's Allow Polymorphing.";
  F.become({ userId: IDS.player });
  await game.settings.set("dnd5e", "allowPolymorphing", false);
  F.calls.length = 0;
  assert.equal(await T.shift(talo, "p1"), null);
  assert.deepEqual(notes(), [["warn", cannot]]);
  await game.settings.set("dnd5e", "allowPolymorphing", true);
  F.can.set(IDS.player, false);
  F.calls.length = 0;
  assert.equal(await T.shift(talo, "p1"), null);
  assert.deepEqual(notes(), [["warn", cannot]]);
  F.become({ userId: IDS.gm });
  F.can.set(IDS.gm, false);
  F.calls.length = 0;
  assert.equal(await T.shift(talo, "p1"), null, "the GM skips the setting, not ACTOR_CREATE (linked actor)");
  assert.deepEqual(notes(), [["warn", cannot]]);
  F.can.clear();
  await game.settings.set("dnd5e", "allowPolymorphing", false);
  assert.ok(await T.shift(talo, "p1"), "GM: allowed without the setting");
});

test("shift: a second click while the first is shifting returns null and spends nothing more", async () => {
  const { talo } = fresh();
  const first = T.shift(talo, "p1");
  assert.equal(await T.shift(talo, "p1"), null);
  assert.ok(await first);
  assert.equal(ops("activity.use").length, 1);
});

test("busy: using Wild Shape from the sheet while a shift is in flight is refused with 'already shifting'", async () => {
  const { talo } = fresh();
  const first = T.shift(talo, "p1");
  await Promise.resolve();
  await Promise.resolve();
  const r = await T.wildShapeActivity(talo).use({ transform: { profile: "p2" } }, {}, {});
  await first;
  assert.equal(r, undefined, "vetoed");
  assert.ok(notes().some(([, m]) => m === "Talo is already shifting."));
});

/* ── shift: failures after the use is spent refund it ─────────────────────── */

test("doShift: a form-mode Wild Shape refunds and warns; a missing source refunds and errors", async () => {
  let { talo } = fresh();
  T.wildShapeActivity(talo).transform.mode = "form";
  assert.equal(await T.shift(talo, "p1"), null);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1, "spent then refunded");
  assert.deepEqual(notes(), [["warn", "Wild Shape is set to dnd5e's \"form\" transform mode, which this module does not shape. Set its transform mode back to Challenge Rating. The use was refunded."]]);
  ({ talo } = fresh());
  T.wildShapeActivity(talo).availableProfiles[0].uuid = "Actor.missing000000001";
  assert.equal(await T.shift(talo, "p1"), null);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1);
  assert.deepEqual(notes(), [["error", "The form's actor is missing. The Wild Shape use was refunded."]]);
  assert.deepEqual(ops("transformInto"), []);
});

test("doShift: transformInto throwing → 'transform failed', refund, ShiftFailed; no form found → refund too", async () => {
  let { talo } = fresh();
  F.transformThrows = true;
  assert.equal(await T.shift(talo, "p1"), null);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["error", "pentaryn-transform | transform failed"]]);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1);
  assert.deepEqual(notes(), [["error", "Talo couldn't shift. The Wild Shape use was refunded; see the console."]]);
  ({ talo } = fresh());
  F.transformReturnsNothing = true;
  assert.equal(await T.shift(talo, "p1"), null);
  F.transformReturnsNothing = false;
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1);
  assert.deepEqual(lines(), []);
});

test("KNOWN (-15): trait enrichment failing is swallowed silently — the effect has no trait text", async () => {
  const { talo } = fresh();
  F.enrichThrows = true;
  const form = await T.shift(talo, "p1");
  const effect = form.effects.get(EFFECT_ID);
  assert.equal(effect.description, "<p>Return to Talo is a Bonus Action. The form ends at 0 HP, when Incapacitated, or after 6 hours.</p>");
  assert.equal(F.console.filter(c => c[0] !== "log").length, 0, "no warning");
});

test("shift: ending Starry Form failing warns and the shift goes on; with no duration the line says '—'", async () => {
  const { talo } = fresh({ effects: [{ id: "pentarynStarry00", name: "Starry Form: Archer", flags: { [MODULE]: { starry: { constellation: "archer" } } } }] });
  talo.effects.get("pentarynStarry00").delete = async () => { throw new Error("locked"); };
  T.wildShapeActivity(talo).duration = { units: "inst" };
  const form = await T.shift(talo, "p1");
  assert.ok(form);
  assert.deepEqual(F.console.filter(c => c[0] === "warn").map(c => c[1]), ["pentaryn-transform | ending Starry Form failed"]);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> shifts into a Dire Wolf — Wild Shape 1/3 left, —.</p>"]);
  assert.equal(form.getFlag(MODULE, "wildshape").endsAt, null);
});

test("a player's shift after a player's revert: the old form actor (not yet swept) is not taken for the new one", async () => {
  const { talo } = fresh();
  F.become({ userId: IDS.player });
  const wolf = await T.shift(talo, "p1");
  await T.revert(wolf);
  assert.equal(game.actors.get(wolf.id), wolf, "a player cannot delete the form; it waits for the GM sweep");
  wolf.isPolymorphed = false;                                  // dnd5e unflags it; originalActor stays
  wolf.flags.dnd5e.isPolymorphed = false;
  const bear = await T.shift(talo, "p2");
  assert.notEqual(bear, wolf);
  assert.equal(bear.name, "Talo (Brown Bear)");
});

/* ── shift from a form: the 2024 "use Wild Shape again" ───────────────────── */

test("shift(form, p2): the form ends quietly, one more use, the new form; the old form is gone (GM)", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.chat.length = 0;
  F.calls.length = 0;
  const bear = await T.shift(wolf, "p2");
  assert.equal(bear.name, "Talo (Brown Bear)");
  assert.equal(game.actors.get(wolf.id), undefined);
  assert.deepEqual(ops("revertOriginalForm").map(c => c.options), [{ renderSheet: false }]);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> shifts into a Brown Bear — Wild Shape 0/3 left, 6 hours.</p>"]);
});

test("shift(druid, p2) with a form already out (a second token): that form is ended first", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.calls.length = 0;
  const bear = await T.shift(talo, "p2");
  assert.ok(bear);
  assert.deepEqual(ops("revertOriginalForm").map(c => c.actor), [wolf.id]);
});

test("shift from a form: a revert that returns nothing → null, no use", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.calls.length = 0;
  F.revertReturns = null;
  assert.equal(await T.shift(wolf, "p2"), null);
  assert.deepEqual(ops("activity.use"), []);
});

/* ── an unlinked token's druid ────────────────────────────────────────────── */

function tokenDruid(opts) {
  const { talo, ...rest } = fresh({ revertItem: true, ...opts });
  game.actors.delete(talo.id);
  talo.isToken = true;
  const scene = F.W.makeScene({ id: "sceneA0000000001" });
  const token = { id: "npcToken00000001", name: "Talo", parent: scene, actor: talo, actorId: "baseTalo00000001",
    getFlag: (scope, key) => token.flags?.[scope]?.[key], flags: {} };
  scene.tokens.set(token.id, token);
  talo.token = token;
  talo._tokens = [{ id: token.id, name: "Talo", stopAnimation: () => {} }];
  return { talo, token, scene, ...rest };
}

test("shift on an unlinked token: no transformActor; the form is shaped afterwards (shapeTokenForm)", async () => {
  const { talo, token } = tokenDruid({ favorites: [{ type: "item", id: `.Item.${IDS.companion}` }, { type: "item", id: `.Item.${IDS.cure}` }],
    hp: { value: 99, max: 99, temp: 30 }, effects: [{ id: IDS.bless, name: "Bless" }] });
  const form = await T.shift(talo, "p1");
  assert.equal(form, token.actor);
  assert.equal(form.isToken, true);
  assert.equal(F.lastTransformData, undefined, "dnd5e.transformActor never fired");
  const embedded = ops("deleteEmbedded", "updateEmbedded", "createEmbedded", "update").filter(c => c.actor === form.id || c.uuid === form.uuid);
  pinJSON("shift-token-writes", embedded.map(c => ({ ...c, data: c.data?.map(d => ({ ...d, description: d.description })) })), import.meta.url);
  assert.equal(form.items.get(IDS.ws)?.name, "Wild Shape", "an unlinked form keeps its own Wild Shape");
  assert.equal(form.items.get(IDS.revert).name, "Return to Talo");
  assert.equal(form.system.attributes.hp.temp, 30);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> shifts into a Dire Wolf — Wild Shape 1/3 left, 6 hours.</p>"]);
  assert.equal(F.chat[0].speaker.actor, form.id);
});

test("shapeTokenForm failing after the shift: logged, the use is NOT refunded, the chat line still goes", async () => {
  const { talo, token } = tokenDruid();
  const realTransform = talo.transformInto;
  talo.transformInto = async (...a) => {
    const form = await realTransform(...a);
    form.createEmbeddedDocuments = async () => { throw new Error("no effects"); };
    return form;
  };
  const form = await T.shift(talo, "p1");
  assert.equal(form, token.actor);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["error", "pentaryn-transform | shaping the token form failed"]]);
  assert.equal(form.items.get(IDS.ws).system.uses.spent, 2);
  assert.equal(F.chat.length, 1);
});

/* ── dnd5e.preUseActivity / postUseActivity ───────────────────────────────── */

test("preUseActivity: the revert item's use creates no card; postUse reverts (Return line)", async () => {
  const { talo } = fresh({ revertItem: true });
  const wolf = await T.shift(talo, "p1");
  F.chat.length = 0;
  F.calls.length = 0;
  const item = wolf.items.get(IDS.revert);
  assert.equal(item.name, "Return to Talo", "renamed in transformActor");
  assert.equal(item.img, "talo.webp");
  const results = await item.system.activities.get("rn1").use();
  assert.equal(results.messageConfig.create, false);
  await Promise.resolve();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(ops("revertOriginalForm").map(c => c.actor), [wolf.id]);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> returns to normal form.</p>"]);
});

test("preUseActivity: a non-Wild-Shape transform from a transformed actor is refused; from a normal one it passes", () => {
  const poly = { type: "transform", transform: { preset: "polymorph" }, item: {}, actor: F.W.makeActor({ name: "Wolfy", isPolymorphed: true }) };
  F.calls.length = 0;
  assert.equal(Hooks.call("dnd5e.preUseActivity", poly, {}, {}, { create: true }), false);
  assert.deepEqual(notes(), [["warn", "Wolfy is already transformed. Return to normal form first."]]);
  const ok = { ...poly, actor: F.W.makeActor({ name: "Plain" }) };
  const msg = { create: true };
  assert.equal(Hooks.call("dnd5e.preUseActivity", ok, {}, {}, msg), true);
  assert.equal(msg.create, true);
  const other = { type: "attack", item: {}, actor: null };
  assert.equal(Hooks.call("dnd5e.preUseActivity", other, {}, {}, msg), true);
});

test("preUseActivity: Wild Shape on the druid's sheet while a form is out → quiet revert, then Wild Shape's dialog again", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.calls.length = 0;
  F.chat.length = 0;
  const activity = T.wildShapeActivity(talo);
  const calls = [];
  const realUse = activity.use;
  const msg = { create: true };
  activity.use = (...a) => { calls.push(a); return undefined; };
  assert.equal(Hooks.call("dnd5e.preUseActivity", activity, {}, {}, msg), false, "this use is cancelled");
  await new Promise(r => setImmediate(r));
  activity.use = realUse;
  assert.deepEqual(ops("revertOriginalForm").map(c => c.actor), [wolf.id]);
  assert.deepEqual(calls, [[{}, {}, { create: false }]]);
  assert.deepEqual(lines(), [], "quiet");
});

test("preUseActivity: Wild Shape with no form out creates no card; a blocked one is refused", () => {
  const { talo } = fresh();
  const activity = T.wildShapeActivity(talo);
  const msg = { create: true };
  assert.equal(Hooks.call("dnd5e.preUseActivity", activity, {}, {}, msg), true);
  assert.equal(msg.create, false);
  talo.statuses.add("incapacitated");
  F.calls.length = 0;
  assert.equal(Hooks.call("dnd5e.preUseActivity", activity, {}, {}, { create: true }), false);
  assert.deepEqual(notes(), [["warn", "Talo is incapacitated and can't Wild Shape."]]);
});

test("preUseActivity change-form: a failing revert warns 'change form failed'", async () => {
  const { talo } = fresh();
  await T.shift(talo, "p1");
  F.console.length = 0;
  F.revertReturns = Promise.reject(new Error("nope"));
  F.revertReturns.catch(() => {});
  Hooks.call("dnd5e.preUseActivity", T.wildShapeActivity(talo), {}, {}, { create: true });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | change form failed"]]);
});

test("postUseActivity: a form's Wild Shape use (an unlinked form) does not shift again; the profile uuid comes from the message flag first", async () => {
  const { talo, bearSrc } = fresh();
  const activity = T.wildShapeActivity(talo);
  F.calls.length = 0;
  Hooks.callAll("dnd5e.postUseActivity", activity, { transform: { profile: "p1" } }, { message: { flags: { dnd5e: { transform: { uuid: bearSrc.uuid } } } } });
  for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(ops("transformInto").map(c => c.source), [bearSrc.id], "the message's uuid wins over the profile's");
  const form = game.actors.find(a => a.isPolymorphed);
  F.calls.length = 0;
  const formAct = { ...activity, type: "transform", transform: { preset: "wildshape" }, actor: form, item: activity.item, availableProfiles: [] };
  Hooks.callAll("dnd5e.postUseActivity", formAct, {}, {});
  await new Promise(r => setImmediate(r));
  assert.deepEqual(ops("transformInto"), []);
});

test("postUseActivity: doShift throwing → 'shift failed', the in-flight promise resolves null", async () => {
  const { talo } = fresh();
  const activity = T.wildShapeActivity(talo);
  const bad = { type: "transform", transform: { preset: "wildshape" }, actor: talo, availableProfiles: [],
    item: { getFlag: () => undefined, get id() { throw new Error("no item"); } } };
  Hooks.callAll("dnd5e.postUseActivity", bad, {}, {});
  await new Promise(r => setImmediate(r));
  // [declared] T-D8: the Starry sheet route's listener throws on the same broken item; the registry's
  // guard now logs it with the module and the listener's label (was Foundry's unattributed line).
  assert.deepEqual(F.console.filter(c => c[1].startsWith(MODULE)).map(c => c.slice(0, 2)),
    [["error", "pentaryn-transform | dnd5e.postUseActivity: Starry Form sheet route"], ["error", "pentaryn-transform | shift failed"]]);
  assert.ok(activity);
});

/* ── dnd5e.transformActor ─────────────────────────────────────────────────── */

test("transformActor: another preset is left alone; called without a pending shift it shapes from live reads", () => {
  const { talo, wolfSrc } = fresh({ revertItem: true, favorites: [{ type: "item", id: `.Item.${IDS.ws}` }] });
  const d = { items: [{ _id: IDS.ws, name: "Wild Shape", type: "feat", system: {} }], effects: [], system: { attributes: { hp: { temp: 12 } } } };
  Hooks.call("dnd5e.transformActor", talo, wolfSrc, d, { preset: "polymorph" });
  assert.equal(d.items.length, 1);
  assert.equal(d.flags, undefined);
  const d2 = {
    items: [talo.items.get(IDS.ws).toObject(), talo.items.get(IDS.revert).toObject(), ...wolfSrc.items.map(i => i.toObject())],
    effects: [{ _id: EFFECT_ID, name: "old" }, { _id: "x" }], system: { attributes: { hp: { temp: 12 } }, favorites: [{ type: "item", id: `.Item.${IDS.ws}` }] }
  };
  game.time.worldTime = 1000;
  Hooks.call("dnd5e.transformActor", talo, wolfSrc, d2, { preset: "wildshape" });
  assert.deepEqual(d2.items.map(i => i.name), ["Return to Talo", "Bite", "Pack Tactics", "Multiattack"]);
  assert.deepEqual(d2.system.favorites, []);
  assert.deepEqual(d2.effects.map(e => e._id), ["x", EFFECT_ID], "an old duration effect is replaced");
  const eff = d2.effects[1];
  assert.equal(eff.description, "<p>Return to Talo is a Bonus Action. The form ends at 0 HP, when Incapacitated, or after 6 hours.</p>", "no trait text without a pending shift");
  assert.deepEqual(eff.start, { time: 1000 });
  assert.deepEqual(d2.flags[MODULE].wildshape, { original: IDS.talo, source: wolfSrc.uuid, profile: null, endsAt: 22600, carried: [] });
});

test("transformActor: no duration → no timed effect, endsAt null; a throw inside never blocks", () => {
  const { talo, wolfSrc } = fresh();
  T.wildShapeActivity(talo).duration = { value: 0, units: "hour" };
  const d = { items: [], effects: [], system: {} };
  assert.equal(Hooks.call("dnd5e.transformActor", talo, wolfSrc, d, { preset: "wildshape" }), true);
  assert.equal(d.effects[0].duration, undefined);
  assert.equal(d.effects[0].description, "<p>Return to Talo is a Bonus Action. The form ends at 0 HP or when Incapacitated.</p>");
  assert.equal(d.flags[MODULE].wildshape.endsAt, null);
  F.console.length = 0;
  const bad = { get items() { throw new Error("x"); }, effects: [] };
  assert.equal(Hooks.call("dnd5e.transformActor", talo, wolfSrc, bad, { preset: "wildshape" }), true);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["error", "pentaryn-transform | shaping the form failed"]]);
});

/* ── revert ───────────────────────────────────────────────────────────────── */

test("revert refusals: not transformed (info unless quiet), stale form, not owner", async () => {
  const { talo } = fresh();
  assert.equal(await T.revert(talo), null);
  assert.equal(await T.revert(talo, { quiet: true }), null);
  assert.equal(await T.revert(null), null);
  assert.deepEqual(notes(), [["info", "Talo is already in their normal form."], ["info", "? is already in their normal form."]]);
  const stale = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { originalActor: IDS.talo } } });
  F.calls.length = 0;
  assert.equal(await T.revert(stale), null, "not in game.actors");
  const staleTok = F.W.makeActor({ isPolymorphed: true, isToken: true });
  staleTok.token = { id: "t", parent: { tokens: new Map() } };
  assert.equal(await T.revert(staleTok), null);
  assert.deepEqual(notes(), []);
  const wolf = await T.shift(talo, "p1");
  wolf.isOwner = false;
  F.calls.length = 0;
  assert.equal(await T.revert(wolf), null);
  assert.deepEqual(notes(), [["warn", "DND5E.TRANSFORM.Warning.NoOwnership"]]);
});

test("revert: a second revert of the same form while the first runs returns null", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.chat.length = 0;
  const a = T.revert(wolf);
  const b = await T.revert(wolf);
  assert.equal(b, null);
  assert.equal(await a, talo);
  assert.equal(F.chat.length, 1);
});

test("revert carries back uses, Hit Dice, exhaustion, inspiration, ended effects and gained conditions", async () => {
  const { talo, wolfSrc } = fresh({ effects: [
    { id: IDS.conc, name: "Concentrating", statuses: ["concentrating"] }, { id: IDS.bless, name: "Bless" },
    { id: "keptEffect000001", name: "Kept" }
  ] });
  wolfSrc.effects.set("beastOwn00000001", F.W.makeEffect(wolfSrc, { id: "beastOwn00000001", name: "Keen Smell", statuses: ["keen"] }, wolfSrc.effects));
  const wolf = await T.shift(talo, "p1");
  // in the form: Hit Dice spent, exhaustion, inspiration, Concentration and Bless ended, Stunned gained
  wolf.items.get("clsDruid0000001").system.hd.spent = 4;
  wolf.system.attributes.exhaustion = 2;
  wolf.system.attributes.inspiration = true;
  wolf.effects.delete(IDS.conc);
  wolf.effects.delete(IDS.bless);
  const stun = F.W.makeEffect(wolf, { id: "stunEffect000001", name: "Stunned", statuses: ["stunned"], origin: "Actor.x", system: { origin: { actor: "x" }, a: 1 } }, wolf.effects);
  wolf.effects.set(stun.id, stun);
  const exh = F.W.makeEffect(wolf, { id: "exhEffect0000001", name: "Exhaustion", statuses: ["exhaustion"] }, wolf.effects);
  wolf.effects.set(exh.id, exh);
  F.calls.length = 0;
  F.chat.length = 0;
  const back = await T.revert(wolf);
  assert.equal(back, talo);
  const writes = F.calls.filter(c => ["updateEmbedded", "update", "createEmbedded", "endConcentration", "delete"].includes(c.op) && (c.actor === IDS.talo || String(c.uuid).startsWith(`Actor.${IDS.talo}`)));
  pinJSON("revert-writes", writes, import.meta.url);
  assert.deepEqual(writes.map(c => c.op), ["updateEmbedded", "update", "endConcentration", "delete", "delete", "createEmbedded"]);
  assert.deepEqual(lines(), ["<p class=\"pentaryn-transform-line\"><strong>Talo</strong> returns to normal form.</p>"]);
  assert.equal(talo.effects.get("stunEffect000001").origin, undefined);
});

test("revert reasons choose the chat line; an unknown reason reads as manual; quiet posts none", async () => {
  const reasons = { zeroHP: "drops to 0 HP and returns to normal form.", incapacitated: "is incapacitated and returns to normal form.",
    expired: "'s Wild Shape ends.", longRest: "returns to normal form to take a Long Rest.", nonsense: "returns to normal form." };
  for (const [reason, tail] of Object.entries(reasons)) {
    const { talo } = fresh();
    const wolf = await T.shift(talo, "p1");
    F.chat.length = 0;
    await T.revert(wolf, { reason });
    assert.deepEqual(lines(), [`<p class="pentaryn-transform-line"><strong>Talo</strong>${tail.startsWith("'") ? "" : " "}${tail}</p>`], reason);
  }
});

test("revert of a Polymorph form (no wildshape flag): uses synced, no effect work", async () => {
  const { talo } = fresh();
  const poly = F.W.add(F.W.makeActor({ id: "polyForm00000001", name: "Talo (Toad)", isPolymorphed: true,
    flags: { dnd5e: { originalActor: IDS.talo, transformOptions: { preset: "polymorph" } } },
    effects: [{ id: "toadThing0000001", name: "Toad skin", statuses: ["slimy"] }],
    items: [{ id: IDS.ws, name: "Wild Shape", type: "feat", system: { uses: { max: 3, spent: 3 } } }] }));
  F.calls.length = 0;
  F.chat.length = 0;
  assert.equal(await T.revert(poly), talo);
  assert.deepEqual(ops("updateEmbedded").map(c => c.updates), [[{ _id: IDS.ws, "system.uses.spent": 3 }]]);
  assert.deepEqual(ops("createEmbedded"), [], "a Polymorph form's effects never land on the original");
  assert.equal(F.chat.length, 1);
});

test("revert: a token form returning `{ actor }` is unwrapped; returning nothing → null and no line", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  F.revertReturns = { actor: talo };
  F.chat.length = 0;
  assert.equal(await T.revert(wolf), talo);
  const w2 = await T.shift(talo, "p2");
  F.revertReturns = null;
  F.chat.length = 0;
  assert.equal(await T.revert(w2), null);
  assert.deepEqual(lines(), []);
});

test("revert points the form's tokens on other scenes back first (not the viewed scene)", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const viewed = F.W.makeScene({ id: "sceneViewed00001", tokens: [{ id: "tokViewed0000001", actorId: wolf.id }] });
  const other = F.W.makeScene({ id: "sceneOther000001", tokens: [
    { id: "tokOther00000001", actorId: wolf.id, elevation: 10, hidden: true, rotation: 90, level: "lvl2", flags: { dnd5e: { previousTokenData: { name: "Talo (before)", width: 2 } } } },
    { id: "tokNotHim0000001", actorId: "someoneElse" }
  ] });
  const empty = F.W.makeScene({ id: "sceneEmpty000001" });
  for (const s of [viewed, other, empty]) {
    s.updateEmbeddedDocuments = async (type, updates, options) => { F.calls.push({ op: "scene.updateEmbedded", scene: s.id, type, updates: F.plain(updates), options }); };
    game.scenes.set(s.id, s);
  }
  canvas.ready = true;
  canvas.scene = viewed;
  F.calls.length = 0;
  await T.revert(wolf);
  canvas.ready = false;
  canvas.scene = null;
  for (const s of [viewed, other, empty]) game.scenes.delete(s.id);
  pinJSON("revert-tokens-elsewhere", ops("scene.updateEmbedded"), import.meta.url);
  assert.deepEqual(ops("scene.updateEmbedded").map(c => c.scene), ["sceneOther000001"]);
});

/* ── dnd5e.revertOriginalForm (PT3-7) ─────────────────────────────────────── */

test("revertOriginalForm hook: a token form's line names previousActorData; no host → nothing; a throw warns", () => {
  fresh();
  const base = F.W.add(F.W.makeActor({ id: "baseDruid0000001", name: "Base Druid" }));
  const form = F.W.makeActor({ isPolymorphed: true, isToken: true, flags: { dnd5e: { transformOptions: { preset: "wildshape" } } } });
  form.token = { actorId: base.id, getFlag: (s, k) => (k === "previousActorData" ? { name: "Talo the Unlinked" } : undefined) };
  Hooks.callAll("dnd5e.revertOriginalForm", form, {});
  assert.deepEqual(F.chat.map(c => [c.content, c.speaker.actor]),
    [["<p class=\"pentaryn-transform-line\"><strong>Talo the Unlinked</strong> returns to normal form.</p>", base.id]]);
  F.chat.length = 0;
  const lost = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { originalActor: "gone", transformOptions: { preset: "wildshape" } } } });
  Hooks.callAll("dnd5e.revertOriginalForm", lost, {});
  assert.deepEqual(F.chat, []);
  const boom = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { transformOptions: { preset: "wildshape" } } } });
  boom.getFlag = () => { throw new Error("x"); };
  Hooks.callAll("dnd5e.revertOriginalForm", boom, {});
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | chat line failed"]]);
});

test("returnToNormal: marks the bonus action and reverts; a throwing revert warns 'revert failed' and resolves null", async () => {
  const { talo } = fresh();
  const wolf = await T.shift(talo, "p1");
  const tokenId = talo._tokens[0].id;
  wolf._tokens = talo._tokens;
  const combat = { id: "cmbR", started: true, round: 1, turn: 0, combatant: { tokenId } };
  game.combats.set(combat.id, combat);
  assert.equal(await T.returnToNormal(wolf), talo);
  assert.equal(T.bonusUsedNow(tokenId), true);
  game.combats.clear();
  const w2 = await T.shift(talo, "p2");
  F.console.length = 0;
  w2.revertOriginalForm = async () => { throw new Error("denied"); };
  assert.equal(await T.returnToNormal(w2), null);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | revert failed"]]);
});

test("settleTokens: a token whose stopAnimation throws warns 'settling <name> failed' and the shift goes on", async () => {
  const { talo } = fresh();
  talo._tokens[0].stopAnimation = () => { throw new Error("canvas"); };
  assert.ok(await T.shift(talo, "p1"));
  assert.deepEqual(F.console.filter(c => c[0] === "warn").map(c => c[1]), ["pentaryn-transform | settling Talo failed"]);
});

test("statusSet fixture keeps toObject statuses as arrays (fixture self-check)", () => {
  assert.deepEqual(JSON.parse(JSON.stringify({ s: statusSet(["a"]) })), { s: ["a"] });
});
