// Starry Form glue (starry.mjs): the lookups, assume/end from the HUD, the sheet route through
// "Consume Wild Shape" and its constellation dialog, the endings without a click, the light written
// through pentaryn-senses' carried-light flag (transform-creatures-21's contract, pinned here from
// transform's side), and the published `starry` rows.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { STARRY_LIGHT } from "../transform-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup({ modules: ["pentaryn-senses"] });
const T = await import("../transform.mjs");
const S = await import("../starry-adapter.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");

const SID = S.STARRY_EFFECT_ID;
const lines = () => F.chat.map(c => c.content.replace(/<\/?[^>]+>/g, ""));
const notes = () => F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const light = talo => talo.items.get(IDS.starry).flags["pentaryn-senses"]?.light ?? null;

function fresh(opts) {
  game.actors.clear();
  F.chat.length = 0;
  F.calls.length = 0;
  F.console.length = 0;
  F.dialogs.length = 0;
  F.dialogAnswer = null;
  game.time.worldTime = 0;
  game.modules.get("pentaryn-senses").active = true;
  F.become({ userId: IDS.gm });
  return F.W.talo(opts);
}

/* ── lookups ──────────────────────────────────────────────────────────────── */

test("STARRY_EFFECT_ID is a static 16-character id", () => {
  assert.equal(SID, "pentarynStarry00");
  assert.equal(SID.length, 16);
});

test("starryItem / wildShapeItemOf / hasTwinkling: by identifier, else by name; null without", () => {
  const { talo } = fresh({ twinkling: true });
  assert.equal(S.starryItem(talo).id, IDS.starry);
  assert.equal(S.wildShapeItemOf(talo).id, IDS.ws);
  assert.equal(S.hasTwinkling(talo), true);
  const byName = F.W.makeActor({ items: [{ id: "sf", name: "Starry Form", type: "feat" }, { id: "tc", name: "Twinkling Constellations", type: "feat" }] });
  assert.equal(S.starryItem(byName).id, "sf");
  assert.equal(S.hasTwinkling(byName), true);
  const none = F.W.makeActor({});
  assert.equal(S.starryItem(none), null);
  assert.equal(S.wildShapeItemOf(none), null);
  assert.equal(S.hasTwinkling(none), false);
  assert.equal(S.starryItem(null), null);
  assert.equal(S.hasTwinkling(fresh().talo), false);
});

test("isStarryConsume: the feature's itemUses activity, matched by item id (a clone counts); never a constellation", () => {
  const { talo } = fresh();
  const item = talo.items.get(IDS.starry);
  const acts = item.system.activities;
  assert.equal(S.isStarryConsume(acts.get("sfConsume")), true);
  assert.equal(S.isStarryConsume(acts.get("sfArcher")), false);
  assert.equal(S.isStarryConsume(acts.get("sfDragon")), false);
  const clone = { name: "Consume", consumption: { targets: [{ type: "itemUses", target: IDS.ws }] }, item: { id: IDS.starry, actor: talo } };
  assert.equal(S.isStarryConsume(clone), true);
  assert.equal(S.isStarryConsume({ ...clone, consumption: { targets: [{ type: "spellSlots" }] } }), false);
  assert.equal(S.isStarryConsume({ ...clone, item: { id: "other", actor: talo } }), false);
  assert.equal(S.isStarryConsume(null), false);
  assert.equal(S.isStarryConsume(T.wildShapeActivity(talo)), false);
});

test("constellationActivity / label / img / text: Talo's numbers; generic images fall back to fixed art", () => {
  let { talo } = fresh();
  assert.deepEqual(["archer", "chalice", "dragon"].map(c => S.constellationActivity(talo, c)?.id), ["sfArcher", "sfChalice", "sfDragon"]);
  assert.equal(S.constellationActivity(F.W.makeActor({}), "archer"), null);
  assert.deepEqual(["archer", "chalice", "dragon"].map(S.constellationLabel), ["Archer", "Chalice", "Dragon"]);
  assert.deepEqual(["archer", "chalice", "dragon"].map(c => S.constellationImg(talo, c)), [
    "icons/weapons/bows/bow-ornamental-gold-blue.webp", "chalice-custom.webp", "icons/creatures/reptiles/dragon-winged-blue.webp"]);
  pinJSON("starry-texts", {
    plain: ["archer", "chalice", "dragon"].map(c => S.constellationText(talo, c)),
    twinkling: S.constellationText(fresh({ twinkling: true }).talo, "dragon"),
    bare: ["archer", "chalice"].map(c => S.constellationText(F.W.makeActor({}), c))
  }, import.meta.url);
});

test("activeStarry / constellationOf / starrySecondsLeft: by id, else by flag; seconds from start + duration - now", () => {
  const { talo } = fresh({ effects: [{ id: "otherStarry00001", name: "Starry (old id)", flags: { [MODULE]: { starry: { constellation: "chalice" } } },
    start: { time: 100 }, duration: { value: 600 } }] });
  assert.equal(S.activeStarry(talo).id, "otherStarry00001");
  assert.equal(S.constellationOf(talo), "chalice");
  game.time.worldTime = 400;
  assert.equal(S.starrySecondsLeft(talo), 300);
  game.time.worldTime = 900;
  assert.equal(S.starrySecondsLeft(talo), -200, "negative kept");
  assert.equal(S.activeStarry(null), null);
  assert.equal(S.constellationOf(F.W.makeActor({})), null);
  assert.equal(S.starrySecondsLeft(F.W.makeActor({})), null);
  const untimed = fresh({ effects: [{ id: SID, name: "Starry", flags: { [MODULE]: { starry: { constellation: "dragon" } } } }] }).talo;
  assert.equal(S.activeStarry(untimed).id, SID);
  assert.equal(S.starrySecondsLeft(untimed), null);
});

/* ── assumeStarry ─────────────────────────────────────────────────────────── */

test("assumeStarry(talo, 'archer'): one Wild Shape use through Consume Wild Shape, the effect, the light, one line", async () => {
  const { talo } = fresh();
  game.time.worldTime = 50;
  assert.equal(await S.assumeStarry(talo, "archer"), true);
  assert.deepEqual(ops("activity.use").map(c => [c.activity, c.usage, c.dialog, c.message]),
    [["sfConsume", { consume: { resources: true }, pentaryn: { starry: "archer" } }, { configure: false }, { create: false }]]);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 2);
  pinJSON("starry-effect-archer", ops("createEmbedded").map(c => c.data), import.meta.url);
  assert.deepEqual(light(talo), F.plain(STARRY_LIGHT));
  assert.deepEqual(lines(), ["Talo takes on a starry form — the Archer. Wild Shape 1/3 left, 10 minutes."]);
  assert.equal(S.constellationOf(talo), "archer");
  assert.equal(S.starrySecondsLeft(talo), 600);
});

test("assumeStarry: Dragon picks the plain Dragon effect, or the flying one with Twinkling", async () => {
  let { talo } = fresh();
  await S.assumeStarry(talo, "dragon");
  assert.deepEqual(talo.effects.get(SID).changes, [{ key: "flags.dnd5e.floor", value: "10" }]);
  ({ talo } = fresh({ twinkling: true }));
  await S.assumeStarry(talo, "dragon");
  assert.deepEqual(talo.effects.get(SID).changes, [{ key: "system.attributes.movement.speeds.fly", value: "20" }]);
  assert.equal(talo.effects.get(SID).name, "Starry Form: Dragon");
});

test("assumeStarry refusals: bad constellation, no actor, no feature, same constellation (true, nothing spent)", async () => {
  let { talo } = fresh();
  assert.equal(await S.assumeStarry(talo, "nebula"), false);
  assert.equal(await S.assumeStarry(null, "archer"), false);
  const bob = F.W.makeActor({ name: "Bob" });
  assert.equal(await S.assumeStarry(bob, "archer"), false);
  assert.deepEqual(notes(), [["warn", "Bob has no Starry Form."]]);
  await S.assumeStarry(talo, "archer");
  F.calls.length = 0;
  assert.equal(await S.assumeStarry(talo, "archer"), true);
  assert.deepEqual(ops("activity.use"), []);
});

test("assumeStarry blocks: in a beast form, incapacitated, no uses", async () => {
  const cases = [
    [t => { t.isPolymorphed = true; }, "Talo is in a Beast form. Starry Form is taken instead of shape-shifting; return to normal form first."],
    [t => t.statuses.add("incapacitated"), "Talo is incapacitated and can't Wild Shape."],
    [t => { t.items.get(IDS.ws).system.uses.spent = 3; }, "No Wild Shape uses left."]
  ];
  for (const [set, text] of cases) {
    const { talo } = fresh();
    set(talo);
    assert.equal(await S.assumeStarry(talo, "archer"), false);
    assert.deepEqual(notes(), [["warn", text]]);
    assert.deepEqual(ops("activity.use"), []);
  }
});

test("assumeStarry: a second call while the first runs returns false", async () => {
  const { talo } = fresh();
  const a = S.assumeStarry(talo, "archer");
  assert.equal(await S.assumeStarry(talo, "chalice"), false);
  assert.equal(await a, true);
});

test("assumeStarry: a vetoed or failed use returns false and applies nothing", async () => {
  const { talo } = fresh();
  talo.items.get(IDS.starry).system.activities.get("sfConsume").useResult = null;
  assert.equal(await S.assumeStarry(talo, "archer"), false);
  assert.equal(S.activeStarry(talo), null);
  assert.deepEqual(lines(), []);
});

test("changing constellation with Twinkling: free, the time left kept, StarrySwap line; without it: another use, a fresh 10 minutes", async () => {
  let { talo } = fresh({ twinkling: true });
  await S.assumeStarry(talo, "archer");
  game.time.worldTime = 120;
  F.calls.length = 0;
  F.chat.length = 0;
  assert.equal(await S.assumeStarry(talo, "chalice"), true);
  assert.deepEqual(ops("activity.use"), []);
  assert.deepEqual(lines(), ["Talo's constellation changes to the Chalice."]);
  const upd = ops("update").filter(c => c.documentName === "ActiveEffect");
  assert.equal(upd.length, 1);
  assert.equal(upd[0].changes["start"]?.time ?? upd[0].changes["start.time"], 0, "start kept");
  assert.equal(S.starrySecondsLeft(talo), 480);
  ({ talo } = fresh());
  await S.assumeStarry(talo, "archer");
  game.time.worldTime = 120;
  F.chat.length = 0;
  F.calls.length = 0;
  assert.equal(await S.assumeStarry(talo, "dragon"), true);
  assert.equal(ops("activity.use").length, 1);
  assert.equal(S.starrySecondsLeft(talo), 600);
  assert.deepEqual(lines(), ["Talo takes on a starry form — the Dragon. Wild Shape 0/3 left, 10 minutes."]);
});

/* ── endStarry and the light ──────────────────────────────────────────────── */

test("endStarry: none → false; the effect deleted, the light off (runner), the line by reason; quiet posts none", async () => {
  const keys = { manual: "Talo's starry form fades.", expired: "Talo's starry form fades after 10 minutes.", incapacitated: "Talo is incapacitated; the starry form fades." };
  for (const [reason, text] of Object.entries(keys)) {
    const { talo } = fresh();
    assert.equal(await S.endStarry(talo), false);
    await S.assumeStarry(talo, "archer");
    F.chat.length = 0;
    assert.equal(await S.endStarry(talo, { reason }), true);
    await flush();
    assert.equal(S.activeStarry(talo), null);
    assert.equal(light(talo), null, "unset by the deleteActiveEffect hook");
    assert.deepEqual(lines(), [text]);
  }
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  await S.endStarry(talo, { quiet: true });
  assert.deepEqual(lines(), []);
});

test("the light: nothing written without pentaryn-senses active; a hand-set light is not overwritten; a player's delete leaves it to the runner", async () => {
  let { talo } = fresh();
  game.modules.get("pentaryn-senses").active = false;
  await S.assumeStarry(talo, "archer");
  assert.equal(light(talo), null);
  await S.endStarry(talo);
  await flush();
  assert.deepEqual(ops("update").filter(c => c.documentName === "Item" && JSON.stringify(c.changes).includes("senses")), []);
  ({ talo } = fresh());
  await talo.items.get(IDS.starry).setFlag("pentaryn-senses", "light", { bright: 1 });
  F.calls.length = 0;
  await S.assumeStarry(talo, "archer");
  assert.deepEqual(light(talo), { bright: 1 }, "an existing flag is kept");
  F.become({ userId: IDS.player });
  await S.endStarry(talo, { quiet: true });
  await flush();
  assert.deepEqual(light(talo), { bright: 1 }, "not the runner: the light stays");
});

test("deleteActiveEffect: another Starry effect still up keeps the light; a light-off failure warns", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const second = F.W.makeEffect(talo, { id: "starrySecond0001", name: "s2", flags: { [MODULE]: { starry: { constellation: "dragon" } } } }, talo.effects);
  talo.effects.set(second.id, second);
  await talo.effects.get(SID).delete();
  await flush();
  assert.ok(light(talo));
  talo.items.get(IDS.starry).update = async () => { throw new Error("x"); };   // [declared] §5.8: the light goes by update(_del), not unsetFlag
  await second.delete();
  await flush();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | starry light off failed"]]);
});

/* ── the sheet route ──────────────────────────────────────────────────────── */

test("sheet: Consume Wild Shape opens the constellation dialog (golden/starry-dialog.json); a choice applies it", async () => {
  const { talo } = fresh();
  F.dialogAnswer = "chalice";
  const act = talo.items.get(IDS.starry).system.activities.get("sfConsume");
  const r = await act.use({}, {}, {});
  await flush();
  assert.equal(r.messageConfig.create, false, "no card");
  pinJSON("starry-dialog", F.dialogs, import.meta.url);
  assert.equal(S.constellationOf(talo), "chalice");
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 2);
  assert.deepEqual(lines(), ["Talo takes on a starry form — the Chalice. Wild Shape 1/3 left, 10 minutes."]);
});

test("sheet: closing the dialog refunds the use; a rejecting dialog is treated as closed (KNOWN -15: silently)", async () => {
  for (const answer of [null, new Error("closed oddly")]) {
    const { talo } = fresh();
    F.dialogAnswer = answer;
    await talo.items.get(IDS.starry).system.activities.get("sfConsume").use({}, {}, {});
    await flush();
    assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1, "spent then refunded");
    assert.equal(S.activeStarry(talo), null);
    assert.deepEqual(F.console, []);
  }
});

test("sheet: refused in a beast form or Incapacitated (no use spent); uses are not checked (dnd5e does)", async () => {
  const { talo } = fresh();
  talo.statuses.add("incapacitated");
  assert.equal(await talo.items.get(IDS.starry).system.activities.get("sfConsume").use({}, {}, {}), undefined);
  assert.deepEqual(notes(), [["warn", "Talo is incapacitated and can't Wild Shape."]]);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1);
});

test("sheet: a failure applying the choice logs 'starry form failed'; a refund with nothing spent writes nothing", async () => {
  let { talo } = fresh();
  F.dialogAnswer = "archer";
  talo.createEmbeddedDocuments = async () => { throw new Error("db"); };
  await talo.items.get(IDS.starry).system.activities.get("sfConsume").use({}, {}, {});
  await flush();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["error", "pentaryn-transform | starry form failed"]]);
  ({ talo } = fresh({ uses: { max: 3, spent: 0 } }));
  F.dialogAnswer = null;
  const act = talo.items.get(IDS.starry).system.activities.get("sfConsume");
  act.useResult = undefined;
  Hooks.callAll("dnd5e.postUseActivity", act, {}, {});
  await flush();
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 0);
});

/* ── endings without a click ──────────────────────────────────────────────── */

test("Incapacitated while starry: ends after a zero timeout (runner), the Incapacitated line", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  talo.statuses.add("incapacitated");
  const eff = F.W.makeEffect(talo, { id: "stun0000000000001", name: "Stunned", statuses: ["incapacitated"] }, talo.effects);
  Hooks.callAll("createActiveEffect", eff, {}, "u");
  mock.timers.tick(0);
  await flush();
  assert.deepEqual(lines(), ["Talo is incapacitated; the starry form fades."]);
});

test("updateActiveEffect: the Starry effect marked expired ends it (Expired line); other updates only re-check", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  Hooks.callAll("updateActiveEffect", talo.effects.get(SID), { name: "x" }, {}, "u");
  mock.timers.tick(0);
  await flush();
  assert.deepEqual(lines(), []);
  Hooks.callAll("updateActiveEffect", talo.effects.get(SID), { duration: { expired: true } }, {}, "u");
  await flush();
  assert.deepEqual(lines(), ["Talo's starry form fades after 10 minutes."]);
});

test("updateWorldTime: world actors past 10 minutes end (runner); KNOWN -22: an unlinked token druid is not checked", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const npc = F.W.makeActor({ id: "npcDruid00000001", name: "Hedge Druid", isToken: true,
    effects: [{ id: SID, name: "Starry Form: Archer", flags: { [MODULE]: { starry: { constellation: "archer" } } }, start: { time: 0 }, duration: { value: 600 } }] });
  const scene = F.W.makeScene({ id: "viewedScene00001" });
  scene.tokens.set("t", { id: "t", actorLink: false, actor: npc });
  canvas.scene = scene;
  F.chat.length = 0;
  game.time.worldTime = 599;
  Hooks.callAll("updateWorldTime", 599, 1);
  await flush();
  assert.deepEqual(lines(), []);
  game.time.worldTime = 600;
  F.become({ userId: IDS.player });
  Hooks.callAll("updateWorldTime", 600, 1);
  await flush();
  assert.deepEqual(lines(), [], "not the runner");
  F.become({ userId: IDS.gm });
  Hooks.callAll("updateWorldTime", 600, 1);
  await flush();
  canvas.scene = null;
  assert.deepEqual(lines(), ["Talo's starry form fades after 10 minutes."]);
  assert.ok(S.activeStarry(npc), "KNOWN -22 (D8, a live decision): the unlinked druid's form is left on");
});

test("dnd5e.restCompleted (long): the form ends quietly for an owner; a short rest leaves it; a failure warns", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  Hooks.callAll("dnd5e.restCompleted", talo, {}, { type: "short" });
  await flush();
  assert.ok(S.activeStarry(talo));
  Hooks.callAll("dnd5e.restCompleted", talo, {}, { type: "long" });
  await flush();
  assert.equal(S.activeStarry(talo), null);
  assert.deepEqual(lines(), []);
  await S.assumeStarry(talo, "archer");
  talo.effects.get(SID).delete = async () => { throw new Error("x"); };
  Hooks.callAll("dnd5e.restCompleted", talo, {}, { type: "long" });
  Hooks.callAll("updateActiveEffect", talo.effects.get(SID), { duration: { expired: true } }, {}, "u");
  await flush();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | ending starry form failed"], ["warn", "pentaryn-transform | ending starry form failed"]]);
});

test("a beast shift ends Starry Form; Starry Form is never carried into the form (PT3-4)", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const wolf = await T.shift(talo, "p1");
  assert.equal(S.activeStarry(talo), null);
  assert.equal(S.starryItem(wolf), null);
  await flush();
  assert.equal(light(talo), null);
});
