// concentration.mjs on a client (the pure half is in the LEGACY suite test/table.mjs):
// 1a the summon stamp (dnd5e.summonToken), 1b the cleanup when the effect is deleted
// (deleteActiveEffect, GM-elected), 2 the Break Concentration label, 3 the auto-break on a failed
// save (createChatMessage) and the DC/result line (dnd5e.renderChatMessage).
//
// combat-riders-23 [declared, edge] (guide §4, D-r2): the cleanup used to run for EVERY deleted
// Actor effect and scan every scene's tokens, so an effect without the concentrating status whose
// uuid a token carried took that token with it. It now returns early for those (flipped pin below).
// combat-riders-40: resultOf's comment-only catch prints nothing today (pinned; S3 makes it debug).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc, makeScene } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const sorc = W.actor(IDS.sorc);
const fireball = sorc.items.get("fireball00000001");
const FX = "Actor.sorcerer00000001.ActiveEffect.conc000000000001";
const conc = { uuid: FX, name: "Concentrating", statuses: new Set(["concentrating"]), flags: { dnd5e: { item: { id: fireball.id } } } };
sorc.effects = [conc];

/* ── 1a. the stamp ────────────────────────────────────────────────────────── */

test("summonToken: the token data is stamped with the cast's concentration effect uuid", async () => {
  const data = {};
  F.fire("dnd5e.summonToken", { actor: sorc, item: fireball }, {}, data);
  assert.deepEqual(data, { flags: { [MODULE]: { concentration: FX } } });
  const viaItem = {};
  F.fire("dnd5e.summonToken", { item: fireball }, {}, viaItem);
  assert.deepEqual(viaItem, { flags: { [MODULE]: { concentration: FX } } }, "no activity.actor: read through item.actor");
  const other = {};
  F.fire("dnd5e.summonToken", { actor: sorc, item: sorc.items.get("scorch0000000001") }, {}, other);
  assert.deepEqual(other, {}, "no concentration for this cast: no stamp");
  F.fire("dnd5e.summonToken", { actor: sorc, item: fireball }, {}, null);
  await F.game.settings.set(MODULE, "concentrationSummons", false);
  const off = {};
  F.fire("dnd5e.summonToken", { actor: sorc, item: fireball }, {}, off);
  assert.deepEqual(off, {});
  await F.game.settings.set(MODULE, "concentrationSummons", true);
  W.take();
  F.fire("dnd5e.summonToken", { get actor() { throw new Error("odd activity"); } }, {}, {});
  assert.deepEqual(W.take(), [["warn", `${MODULE} | concentration summon stamp skipped`, "odd activity"]]);
});

/* ── 1b. the cleanup ──────────────────────────────────────────────────────── */

function world() {
  const deleted = [];
  const scenes = ["One", "Two"].map((name, i) => {
    const s = makeScene({ id: `scene${name.toLowerCase()}000000000`.slice(0, 16), name, tokens: [
      { id: `tok${i}a00000000000`.slice(0, 16), flags: { [MODULE]: { concentration: FX } } },
      { id: `tok${i}b00000000000`.slice(0, 16), flags: {} },
      { id: `tok${i}c00000000000`.slice(0, 16), flags: { [MODULE]: { concentration: FX } }, locked: true },
    ] });
    for (const t of s.tokens) t.canUserModify = (user, action) => action === "delete" && !t.locked;
    s.deleteEmbeddedDocuments = async (type, ids) => { deleted.push([s.name, type, ids]); if (s.fail) throw new Error("server said no"); return ids; };
    return s;
  });
  F.game.scenes.clear();
  for (const s of scenes) F.game.scenes.set(s.id, s);
  return { scenes, deleted };
}
const effect = (o = {}) => ({ ...conc, parent: { documentName: "Actor" }, ...o });

test("deleteActiveEffect on the active GM: every scene's stamped tokens the GM may delete go, with one info line each", async () => {
  const { deleted } = world();
  W.take();
  F.fire("deleteActiveEffect", effect(), {}, IDS.player);
  await drain();
  assert.deepEqual(deleted, [["One", "Token", ["tok0a00000000000"]], ["Two", "Token", ["tok1a00000000000"]]]);
  assert.deepEqual(W.take(), [
    ["info", `${MODULE} | concentration on Concentrating ended: removing 1 summon token(s) from One`],
    ["info", `${MODULE} | concentration on Concentrating ended: removing 1 summon token(s) from Two`],
  ]);
});

test("cleanup election: a player client does nothing while a GM is active; with no GM, the deleting user does it", async () => {
  const { deleted } = world();
  F.become({ userId: IDS.player });
  F.fire("deleteActiveEffect", effect(), {}, IDS.player);
  W.gm.active = false;
  F.fire("deleteActiveEffect", effect(), {}, IDS.gm);
  assert.deepEqual(deleted, []);
  F.fire("deleteActiveEffect", effect(), {}, IDS.player);
  W.gm.active = true;
  F.become({ userId: IDS.gm });
  await drain();
  assert.deepEqual(deleted.map(d => d[0]), ["One", "Two"]);
  W.take();
});

test("cleanup: not an Actor's effect, the setting off → nothing; a failed delete is warned; a throw is warned", async () => {
  const { scenes, deleted } = world();
  F.fire("deleteActiveEffect", effect({ parent: { documentName: "Item" } }), {}, IDS.gm);
  F.fire("deleteActiveEffect", effect({ parent: null }), {}, IDS.gm);
  await F.game.settings.set(MODULE, "concentrationSummons", false);
  F.fire("deleteActiveEffect", effect(), {}, IDS.gm);
  await F.game.settings.set(MODULE, "concentrationSummons", true);
  assert.deepEqual(deleted, []);
  scenes[0].fail = true;
  W.take();
  F.fire("deleteActiveEffect", effect({ uuid: FX }), {}, IDS.gm);
  await drain();
  assert.deepEqual(W.take().filter(l => l[0] === "warn"), [["warn", `${MODULE} | summon cleanup failed`, "server said no"]]);
  F.fire("deleteActiveEffect", { parent: { documentName: "Actor" }, get uuid() { throw new Error("odd effect"); } }, {}, IDS.gm);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | concentration summon cleanup skipped`, "odd effect"]]);
});

test("combat-riders-23 [declared, edge]: a deleted effect without the concentrating status returns before scanning scenes (nothing deleted)", async () => {
  const { deleted } = world();
  let scanned = 0;
  const scenes = F.game.scenes;
  const realIter = scenes[Symbol.iterator].bind(scenes);
  scenes[Symbol.iterator] = () => { scanned += 1; return realIter(); };
  F.fire("deleteActiveEffect", effect({ statuses: new Set(["dodging"]), name: "Dodge" }), {}, IDS.gm);
  F.fire("deleteActiveEffect", effect({ statuses: undefined, name: "No statuses" }), {}, IDS.gm);
  await drain();
  assert.deepEqual(deleted, []);
  assert.equal(scanned, 0, "no scene was scanned");
  F.fire("deleteActiveEffect", effect({ statuses: ["concentrating"] }), {}, IDS.gm);
  await drain();
  assert.deepEqual(deleted.map(d => d[0]), ["One", "Two"], "a concentration effect (array statuses) still cleans up");
  delete scenes[Symbol.iterator];
  W.take();
});

/* ── 2. the break button's label ─────────────────────────────────────────── */

test("Break Concentration buttons get their text once; a jQuery-like wrapper works", () => {
  const el = W.html(`<div class="message-content"><button data-action="breakConcentration"><i class="fa-solid fa-ban"></i></button><button data-action="other"></button></div>`);
  F.fire("dnd5e.renderChatMessage", { type: "base", flags: {}, system: {} }, el);
  F.fire("dnd5e.renderChatMessage", { type: "base", flags: {}, system: {} }, [el]);
  assert.equal(el.innerHTML, `<button data-action="breakConcentration" class="pr-labelled"><i class="fa-solid fa-ban"></i><span class="pr-btn-label">DND5E.CONCENTRATION.Action.Break</span></button><button data-action="other"></button>`);
  W.take();
  const broken = W.html(`<div></div>`);
  broken.querySelectorAll = () => { throw new Error("detached"); };
  F.fire("dnd5e.renderChatMessage", { type: "base", flags: {}, system: {} }, broken);
  // the same broken root reaches the card note listener after it (riders.mjs): both warn
  assert.deepEqual(W.take(), [["warn", `${MODULE} | break-concentration label skipped`, "detached"], ["warn", `${MODULE} | card note skipped`, "detached"]]);
});

/* ── 3. auto-break and the result line ───────────────────────────────────── */

function saveMessage({ total = 7, dc = 10, canBreak = true, canResist = false, actor = sorc, outcome, visible = true, user } = {}) {
  const msg = makeDoc("ChatMessage", { id: `save${String(++saveMessage.n).padStart(12, "0")}`, type: "save", isContentVisible: visible, system: { type: "concentration", canBreakConcentration: canBreak, canResist, outcome }, rolls: [{ total, options: { target: dc } }], user });
  msg.getAssociatedActor = () => actor;
  return msg;
}
saveMessage.n = 0;
const created = async (msg, userId = IDS.gm) => { await F.fire("createChatMessage", msg, {}, userId); await drain(); };

test("auto-break: a failed save the owner rolled ends concentration and marks the card broken", async () => {
  sorc.concEnded = [conc];
  W.takeLog();
  const msg = saveMessage();
  const before = F.calls.length;
  await created(msg);
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration"), [{ op: "endConcentration", actor: "Ilsa Vantrel" }]);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ "system.outcome": "broken" }]);
});

test("auto-break: kept as a button — Legendary Resistance, Indomitable, an effect, dnd5e says no, the setting off, not the roller, not a concentration save, nothing ended", async () => {
  const indomitable = makeActor({ name: "Fighter", ownership: { default: 3 }, items: [{ name: "Indomitable", type: "feat", system: { identifier: "indomitable" } }] });
  const inspired = makeActor({ name: "Bard", ownership: { default: 3 }, appliedEffects: [{ name: "Bardic Inspiration" }] });
  W.takeLog();
  await created(saveMessage({ canResist: true }));
  await created(saveMessage({ actor: indomitable }));
  await created(saveMessage({ actor: inspired }));
  await created(saveMessage({ canBreak: false }));
  await created(saveMessage(), IDS.player);
  const other = saveMessage();
  other.system.type = "dex";
  await created(other);
  await F.game.settings.set(MODULE, "concentrationAutoBreak", false);
  await created(saveMessage());
  await F.game.settings.set(MODULE, "concentrationAutoBreak", true);
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration"), []);
  sorc.concEnded = [];
  const before = F.calls.length;
  await created(saveMessage());
  assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 0, "nothing ended: the card is not marked");
  const notMine = makeActor({ name: "Theirs", ownership: { default: 0 } });
  F.become({ userId: IDS.player });
  await created(saveMessage({ actor: notMine }), IDS.player);
  F.become({ userId: IDS.gm });
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration").length, 1);
  assert.deepEqual(W.take(), []);
});

test("combat-riders-40 pin: an old card whose system getters throw reads as 'cannot break', silently", async () => {
  const msg = saveMessage();
  Object.defineProperty(msg.system, "canBreakConcentration", { get() { throw new Error("old card"); } });
  W.takeLog();
  await created(msg);
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration"), []);
  assert.deepEqual(W.take(), []);
});

test("auto-break: a throw is warned", async () => {
  const msg = saveMessage();
  const real = sorc.endConcentration;
  sorc.concEnded = [conc];
  sorc.endConcentration = async () => { throw new Error("cannot end"); };
  await created(msg);
  sorc.endConcentration = real;
  assert.deepEqual(W.take(), [["warn", `${MODULE} | concentration auto-break skipped`, "cannot end"]]);
});

test("result line: DC and Failed / Failed: concentration ended / Success, after the dice; once; only on visible concentration saves", () => {
  const card = () => W.html(`<div class="message-content"><div class="dice-roll"></div><footer></footer></div>`);
  const a = card();
  F.fire("dnd5e.renderChatMessage", saveMessage(), a);
  F.fire("dnd5e.renderChatMessage", saveMessage(), a);
  assert.equal(a.innerHTML, `<div class="dice-roll"></div><p class="pr-conc-result failure">DC 10 · Failed</p><footer></footer>`);
  const b = card();
  F.fire("dnd5e.renderChatMessage", saveMessage({ outcome: "broken" }), b);
  assert.match(b.innerHTML, /<p class="pr-conc-result failure">DC 10 · Failed: concentration ended<\/p>/);
  const c = W.html(`<li><div class="message-content"></div></li>`);
  F.fire("dnd5e.renderChatMessage", saveMessage({ total: 10, dc: "10" }), c);
  assert.equal(c.innerHTML, `<div class="message-content"><p class="pr-conc-result success">DC 10 · Success: still concentrating</p></div>`);
  const d = W.html(`<li></li>`);
  F.fire("dnd5e.renderChatMessage", saveMessage({ total: 15, dc: 12 }), [d]);
  assert.equal(d.innerHTML, `<p class="pr-conc-result success">DC 12 · Success: still concentrating</p>`);
  const noTarget = saveMessage();
  noTarget.rolls[0].options = {};
  for (const m of [saveMessage({ dc: null }), noTarget, saveMessage({ dc: "x" }), saveMessage({ visible: false })]) {
    const e = card();
    F.fire("dnd5e.renderChatMessage", m, e);
    assert.equal(e.querySelector(".pr-conc-result"), null);
  }
  W.take();
  const broken = W.html(`<div></div>`);
  broken.querySelector = () => { throw new Error("detached"); };
  F.fire("dnd5e.renderChatMessage", saveMessage(), broken);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | concentration result line skipped`, "detached"], ["warn", `${MODULE} | card note skipped`, "detached"]]);
});

test("result line: a save message without a root renders nothing", () => {
  F.fire("dnd5e.renderChatMessage", saveMessage(), null);
  F.fire("dnd5e.renderChatMessage", saveMessage(), []);
  assert.deepEqual(W.take(), []);
});
