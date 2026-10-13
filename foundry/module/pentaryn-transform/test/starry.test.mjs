// Starry Form glue (starry.mjs): the lookups, assume/end from the HUD, the sheet route through
// "Consume Wild Shape" and its constellation dialog, the endings without a click, the light written
// through pentaryn-senses' carried-light flag (transform-creatures-21's contract, pinned here from
// transform's side), and the published `starry` rows.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { StubCollection } from "./kit/foundry-stub.mjs";
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
// An automatic ending claims its write for one tab first (transform-core-async-2): the claim settles in 750 ms.
const settle = async () => { await flush(); mock.timers.tick(750); await flush(); };
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

function hedgeDruid(left = 600) {
  return F.W.makeActor({ id: "npcDruid00000001", name: "Hedge Druid", isToken: true,
    effects: [{ id: SID, name: "Starry Form: Archer", flags: { [MODULE]: { starry: { constellation: "archer", left } }, dnd5e: { isTemporary: true } },
      start: { time: 0 }, duration: { value: null, units: "seconds", expiry: null } }] });
}
function startCombat(...actors) {
  const combatants = new StubCollection(actors.map((actor, i) => ({ id: `combatant0000000${i}`, actor })));
  game.combats.set("combat0000000001", { id: "combat0000000001", started: true, combatants });
}
const tick = async (dt) => { game.time.worldTime += dt; Hooks.callAll("updateWorldTime", game.time.worldTime, dt, {}, IDS.gm); await flush(); };

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

test("R2-refund: the use is spent but the form fails to go up → the use comes back, the error still surfaces", async () => {
  // A fresh form whose effect write fails, and a constellation change without Twinkling whose update fails.
  let { talo } = fresh();
  talo.createEmbeddedDocuments = async () => { throw new Error("db"); };
  await assert.rejects(S.assumeStarry(talo, "archer"), /db/);
  assert.equal(ops("activity.use").length, 1, "the use was spent");
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 1, "spent then refunded");
  assert.equal(S.activeStarry(talo), null);
  assert.deepEqual(lines(), []);
  ({ talo } = fresh());
  await S.assumeStarry(talo, "archer");
  S.activeStarry(talo).update = async () => { throw new Error("db"); };
  await assert.rejects(S.assumeStarry(talo, "chalice"), /db/);
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 2, "the second use refunded; the first stands");
  assert.equal(S.constellationOf(talo), "archer");
});

test("R2-refund: the form is up and only the light fails → no refund (the form happened)", async () => {
  const { talo } = fresh();
  talo.items.get(IDS.starry).setFlag = async () => { throw new Error("light"); };
  await assert.rejects(S.assumeStarry(talo, "archer"), /light/);
  assert.equal(S.constellationOf(talo), "archer");
  assert.equal(talo.items.get(IDS.ws).system.uses.spent, 2);
});

test("changing constellation with Twinkling: free, the time left kept, StarrySwap line; without it: another use, a fresh 10 minutes", async () => {
  let { talo } = fresh({ twinkling: true });
  await S.assumeStarry(talo, "archer");
  startCombat(talo);
  await tick(120);                                    // 20 rounds of combat (D8: only combat time counts)
  game.combats.clear();
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

test("starry-double-end: two overlapping endings delete once and post one line; the second answers false", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  F.chat.length = 0;
  F.calls.length = 0;
  // A real delete is a server round trip: the effect stays on the actor until the reply comes back.
  const eff = talo.effects.get(SID);
  const realDelete = eff.delete.bind(eff);
  eff.delete = async (...args) => { await new Promise(r => setImmediate(r)); return realDelete(...args); };
  const deletes = () => ops("delete").length;
  const [a, b] = await Promise.all([S.endStarry(talo, { reason: "expired" }), S.endStarry(talo, { reason: "expired" })]);
  await flush();
  assert.deepEqual([a, b], [true, false], "starry-double-end: the second ending is a no-op while the first is in flight");
  assert.equal(deletes(), 1, "starry-double-end: one expiry deletes the effect once");
  assert.deepEqual(lines(), ["Talo's starry form fades after 10 minutes."]);
  assert.equal(S.activeStarry(talo), null);
  await S.assumeStarry(talo, "archer");
  assert.equal(await S.endStarry(talo), true, "starry-double-end: the guard is released after the ending settles");
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
  await settle();
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
  await settle();
  assert.deepEqual(lines(), ["Talo's starry form fades after 10 minutes."]);
});

// D8 (Joe's ruling): out of combat there are no turns to track, so Starry Form stays on and world time
// does not count; in combat it counts down by combat time to its 10 minutes. Linked and unlinked alike.
test("D8-starry: the effect is not on Foundry's world clock (no duration value, dnd5e isTemporary), 10 minutes of combat left", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const e = talo.effects.get(SID);
  assert.equal(e.duration.value, null, "D8-starry: Foundry's registry must not expire it by world time");
  assert.equal(e.flags.dnd5e?.isTemporary, true, "D8-starry: still a temporary effect (token icon), not expiry-tracked");
  assert.equal(e.flags[MODULE].starry.left, 600);
  assert.equal(S.starrySecondsLeft(talo), 600);
});

test("D8-starry: out of combat world time never ends Starry Form, linked or unlinked, and nothing is written", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const npc = hedgeDruid();
  F.chat.length = 0;
  F.calls.length = 0;
  await tick(599);
  await tick(3600);
  assert.deepEqual(lines(), [], "D8-starry: out of combat the form stays on");
  assert.ok(S.activeStarry(talo), "D8-starry: the linked druid's form stays on out of combat");
  assert.ok(S.activeStarry(npc), "D8-starry: the unlinked druid's form stays on out of combat");
  assert.equal(S.starrySecondsLeft(talo), 600, "D8-starry: out-of-combat time does not count");
  assert.deepEqual(ops("update", "delete"), []);
});

test("D8-starry: in combat it counts down by combat time and ends at 10 minutes, linked and unlinked (runner only)", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const npc = hedgeDruid();
  F.chat.length = 0;
  await tick(1800);                                   // out of combat first: not counted
  startCombat(talo, npc, talo);                       // a linked druid with two combatants counts once
  try {
    await tick(6);
    assert.equal(S.starrySecondsLeft(talo), 594);
    assert.equal(S.starrySecondsLeft(npc), 594);
    await tick(588);
    assert.equal(S.starrySecondsLeft(talo), 6);
    assert.deepEqual(lines(), []);
    F.become({ userId: IDS.player });
    await tick(6);
    assert.deepEqual(lines(), [], "not the runner");
    assert.equal(S.starrySecondsLeft(talo), 6);
    F.become({ userId: IDS.gm });
    await tick(6);
    await settle();                                   // the ending is claimed; the tick is not
    assert.deepEqual(lines().sort(), ["Hedge Druid's starry form fades after 10 minutes.", "Talo's starry form fades after 10 minutes."]);
    assert.equal(S.activeStarry(talo), null);
    assert.equal(S.activeStarry(npc), null, "D8-starry: the unlinked druid's form ends in combat too");
  } finally {
    game.combats.clear();
  }
});

// perf-2: onWorldTime looks the form up once per druid per tick and hands it to the tick and the ending.
test("perf-2: one Starry Form lookup per druid per tick, on a counting tick and on the expiring one", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const npc = hedgeDruid(12);
  F.chat.length = 0;
  // Counted: lookups on the tick's own path. The updateActiveEffect listener (onEffectChange) that the
  // time-left write fires does its own, as any effect update does; that is not the tick's.
  const lookups = new Map();
  const count = a => { if (!new Error().stack.includes("onEffectChange")) lookups.set(a.name, (lookups.get(a.name) ?? 0) + 1); };
  for (const a of [talo, npc]) {
    const get = a.effects.get.bind(a.effects), find = a.effects.find.bind(a.effects);
    a.effects.get = id => { if (id === SID) count(a); return get(id); };
    a.effects.find = fn => { count(a); return find(fn); };
  }
  startCombat(talo, npc);
  try {
    await tick(6);
    assert.deepEqual(Object.fromEntries(lookups), { "Talo": 1, "Hedge Druid": 1 }, "perf-2: a counting tick looks each form up once");
    assert.equal(S.starrySecondsLeft(npc), 6);
    lookups.clear();
    await tick(6);                                    // the Hedge Druid's form runs out on this one
    assert.deepEqual(Object.fromEntries(lookups), { "Talo": 1, "Hedge Druid": 1 }, "perf-2: the expiring tick looks each form up once");
    await settle();
    assert.deepEqual(lines(), ["Hedge Druid's starry form fades after 10 minutes."]);
    assert.equal(S.activeStarry(npc), null);
    assert.ok(S.activeStarry(talo));
  } finally {
    game.combats.clear();
  }
});

test("transform-ui/lens-rerun [declared]: two clock advances before the first time-left write lands both count", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const effect = talo.effects.get(SID);
  const write = effect.update.bind(effect);
  const held = [];
  effect.update = changes => new Promise(r => held.push(r)).then(() => write(changes));   // the server round trip
  startCombat(talo);
  try {
    const before = () => { game.time.worldTime += 6; Hooks.callAll("updateWorldTime", game.time.worldTime, 6, {}, IDS.gm); };
    before();
    before();                                         // the GM clicks Next Round twice
    await flush();
    while (held.length) { held.shift()(); await flush(); }
    assert.equal(S.starrySecondsLeft(talo), 588, "transform-ui/lens-rerun: the second round must not be lost to a stale time-left read");
  } finally {
    game.combats.clear();
    effect.update = write;
  }
});

test("D8-starry: a failed combat-time write warns 'starry form timing failed'; a form from before D8 is left to the world clock", async () => {
  const { talo } = fresh();
  await S.assumeStarry(talo, "archer");
  const old = hedgeDruid();
  delete old.effects.get(SID).flags[MODULE].starry.left;
  startCombat(talo, old);
  try {
    F.calls.length = 0;
    talo.effects.get(SID).update = async () => { throw new Error("x"); };
    await tick(6);
    assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | starry form timing failed"]]);
    assert.deepEqual(ops("update", "delete"), [], "the pre-D8 form is not written");
    assert.ok(S.activeStarry(old));
  } finally {
    game.combats.clear();
  }
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
  Hooks.callAll("dnd5e.restCompleted", talo, {}, { type: "long" });
  await flush();
  // starry-double-end: the two endings overlap, so only the first sends a delete and warns.
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | ending starry form failed"]]);
  F.console.length = 0;
  Hooks.callAll("updateActiveEffect", talo.effects.get(SID), { duration: { expired: true } }, {}, "u");
  await settle();
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | ending starry form failed"]],
    "starry-double-end: a failed ending releases the guard, so the next one tries again");
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
