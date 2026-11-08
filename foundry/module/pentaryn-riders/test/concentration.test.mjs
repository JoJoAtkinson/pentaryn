// concentration.mjs on a client (the pure half is in the LEGACY suite test/table.mjs):
// 1a the summon stamp (dnd5e.summonToken), 1b the cleanup when the effect is deleted
// (deleteActiveEffect, GM-elected), 2 the Break Concentration label, 3 the auto-break on a failed
// save (createChatMessage) and the DC/result line (dnd5e.renderChatMessage).
//
// combat-riders-23 [declared, edge] (guide §4, D-r2): the cleanup used to run for EVERY deleted
// Actor effect and scan every scene's tokens, so an effect without the concentrating status whose
// uuid a token carried took that token with it. It now returns early for those (flipped pin below).
// combat-riders-40: resultOf's comment-only catch prints nothing today (pinned; S3 makes it debug).
// 4 (TwPCoB, triage E1, 0.6.0): a stamped summon at 0 HP ends the concentration that keeps it
// (updateActor, GM-elected, one claim per fallen token, one whispered line), never on deleteToken.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc, makeScene, makeToken } from "./kit/foundry-stub.mjs";
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
// riders-async-3: each scene's cleanup claims its first stamped token (kit claimDocument) and waits 750 ms
const settleCleanup = async () => { await drain(); mock.timers.tick(750); await drain(); };

test("deleteActiveEffect on the active GM: every scene's stamped tokens the GM may delete go, with one info line each", async () => {
  const { deleted } = world();
  W.take();
  F.fire("deleteActiveEffect", effect(), {}, IDS.player);
  await settleCleanup();
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
  await settleCleanup();
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
  await settleCleanup();
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
  await settleCleanup();
  assert.deepEqual(deleted.map(d => d[0]), ["One", "Two"], "a concentration effect (array statuses) still cleans up");
  delete scenes[Symbol.iterator];
  W.take();
});

test("[declared] riders-async-3: two tabs on the active GM's account see one concentration end — each scene's summons are deleted once", async () => {
  const { scenes, deleted } = world();
  W.take();
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("deleteActiveEffect", effect(), {}, IDS.player);     // the MCP bridge tab
    F.become({ socketId: "socket-browser" });
    F.fire("deleteActiveEffect", effect(), {}, IDS.player);     // a GM browser tab, same user
    await settleCleanup();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  assert.deepEqual(deleted, [["One", "Token", ["tok0a00000000000"]], ["Two", "Token", ["tok1a00000000000"]]], "one delete per scene");
  assert.equal(scenes[0].tokens.get("tok0a00000000000").flags[MODULE].claims.summonCleanup, "socket-bridge", "the claim is on the scene's first stamped token");
  assert.equal(W.take().filter(l => l[0] === "info").length, 2, "one info line per scene, from the winning tab");
});

test("[declared] riders-async-3: the later claim wins when both tabs write before either reads back", async () => {
  const { scenes, deleted } = world();
  W.take();
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("deleteActiveEffect", effect(), {}, IDS.player);
    // the browser tab's claims land second on the server; it read no claim before writing
    for (const s of scenes) delete s.tokens.contents[0].flags[MODULE].claims;
    F.become({ socketId: "socket-browser" });
    F.fire("deleteActiveEffect", effect(), {}, IDS.player);
    await settleCleanup();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  assert.equal(scenes[1].tokens.get("tok1a00000000000").flags[MODULE].claims.summonCleanup, "socket-browser");
  assert.deepEqual(deleted, [["One", "Token", ["tok0a00000000000"]], ["Two", "Token", ["tok1a00000000000"]]], "one delete per scene");
  W.take();
});

/* ── 4. a summon at 0 HP ends the concentration that keeps it (TwPCoB) ───── */

/**
 * A summoned Elemental Spirit: an unlinked token on scene One whose synthetic actor is `actor`
 * (actor.isToken, actor.token), stamped with Ilsa's concentration effect FX (or `stamp`).
 */
function summon({ stamp = FX, hp = 0, name = "Elemental Spirit" } = {}) {
  const actor = makeActor({ name, type: "npc", ownership: { default: 0 }, system: { attributes: { hp: { value: hp, max: 40 } } } });
  const scene = makeScene({ id: "sceneone00000000", name: "One", tokens: [] });
  const token = makeToken({ id: `tok${String(++summon.n).padStart(13, "0")}`, name, actor, flags: stamp ? { [MODULE]: { concentration: stamp } } : {} }, scene);
  token.collection = scene.tokens;
  scene.tokens.set(token.id, token);
  F.game.scenes.clear();
  F.game.scenes.set(scene.id, scene);
  actor.isToken = true;
  actor.token = token;
  return { actor, token, scene };
}
summon.n = 0;
const concEffect = () => ({ ...conc, name: "Concentrating", parent: sorc });
/** fromUuid as the stub cannot resolve an ActiveEffect uuid: FX → Ilsa's effect (or whatever `effects` maps). */
function resolving(effects = { [FX]: concEffect() }) {
  const real = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => effects[uuid] ?? null;
  return () => { globalThis.fromUuid = real; };
}
const fall = (actor, { before = 12, after = 0, userId = IDS.gm, options } = {}) =>
  F.fire("updateActor", actor, { system: { attributes: { hp: { value: after } } } }, options ?? { dnd5e: { hp: { value: before } } }, userId);
// the claim on the fallen token waits 750 ms (kit claimDocument), then the end, then the chat line
const settleFall = async () => { await drain(); mock.timers.tick(750); await drain(); };
const ends = () => W.takeLog().filter(l => l.op === "endConcentration" || l.op === "ChatMessage.create");

test("summon fell: on the active GM the effect is resolved, the token claimed, concentration ended once, one whispered line to the owners and GMs", async () => {
  const restore = resolving();
  try {
    const { actor, token } = summon();
    sorc.concEnded = [conc];
    W.take(); W.takeLog();
    const before = F.calls.length;
    fall(actor);
    await settleFall();
    assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => [c.uuid, c.changes]), [[token.uuid, { [`flags.${MODULE}.claims.summonFell`]: "socket-gm-1" }]]);
    assert.deepEqual(ends(), [
      { op: "endConcentration", actor: "Ilsa Vantrel" },
      { op: "ChatMessage.create", data: { speaker: { actor: sorc.id, alias: "Ilsa Vantrel" }, whisper: [IDS.gm, IDS.player], content: "<p>Ilsa Vantrel&#x27;s Elemental Spirit fell; concentration on Fireball ends.</p>" } },   // escapeHTML'd
    ]);
    assert.deepEqual(W.take(), [["info", `${MODULE} | summon fell: concentration ended`]]);
  } finally { restore(); }
});

test("summon fell is idempotent: a second update before the first settles, a second hit at 0, and a fall whose effect is already gone end nothing more", async () => {
  const restore = resolving();
  try {
    const { actor } = summon();
    sorc.concEnded = [conc];
    W.take(); W.takeLog();
    fall(actor, { before: 12, after: 0 });
    fall(actor, { before: 12, after: -3 });        // the same fall, seen again before the claim settled
    await settleFall();
    assert.equal(ends().filter(l => l.op === "endConcentration").length, 1, "one end");
    fall(actor, { before: 0, after: -5 });         // a hit on a summon already at 0: not a fall
    await settleFall();
    assert.deepEqual(ends(), []);
    globalThis.fromUuid = async () => null;        // the effect is gone (ended above)
    fall(actor, { options: {} });                  // no old value known: a fall, but nothing to end
    await settleFall();
    assert.deepEqual(ends(), []);
    assert.deepEqual(W.take(), [["info", `${MODULE} | summon fell: concentration ended`]]);
  } finally { restore(); }
});

test("[declared] riders-async-3 pattern: two tabs on the active GM's account see one fall — concentration ends once, one line", async () => {
  const restore = resolving();
  try {
    const { actor, token } = summon();
    sorc.concEnded = [conc];
    W.take(); W.takeLog();
    try {
      F.become({ socketId: "socket-bridge" });
      fall(actor);                                 // the MCP bridge tab
      F.become({ socketId: "socket-browser" });
      fall(actor);                                 // a GM browser tab, same user: its own in-flight set is empty
      await settleFall();
    } finally {
      F.become({ socketId: "socket-gm-1" });
    }
    // both tabs await fromUuid before claiming, so both read "no claim" and both write: the later write
    // (the browser tab's) wins, as the cleanup's "later claim wins" pin above; one tab ends it either way
    assert.equal(token.flags[MODULE].claims.summonFell, "socket-browser");
    assert.equal(ends().filter(l => l.op === "endConcentration").length, 1);
    assert.equal(W.take().filter(l => l[0] === "info").length, 1);
  } finally { restore(); }
});

test("summon fell: nothing on a player client while a GM is active, with no GM the user who dealt the blow acts; unstamped, still up, not an hp change, the setting off → nothing", async () => {
  const restore = resolving();
  try {
    const { actor } = summon();
    sorc.concEnded = [conc];
    W.take(); W.takeLog();
    F.become({ userId: IDS.player });
    fall(actor, { userId: IDS.player });
    await settleFall();
    assert.deepEqual(ends(), [], "a player client with a GM active");
    W.gm.active = false;
    fall(actor, { userId: IDS.gm });
    await settleFall();
    assert.deepEqual(ends(), [], "no GM: another user's blow");
    fall(actor, { userId: IDS.player });
    await settleFall();
    assert.equal(ends().filter(l => l.op === "endConcentration").length, 1, "no GM: the user who made the change");
    W.gm.active = true;
    F.become({ userId: IDS.gm });
    W.take();
    const up = summon({ hp: 5 });
    fall(up.actor, { before: 12, after: 5 });
    const plain = summon({ stamp: null });
    fall(plain.actor);
    const other = summon();
    F.fire("updateActor", other.actor, { name: "Renamed" }, {}, IDS.gm);
    await F.game.settings.set(MODULE, "concentrationSummons", false);
    fall(other.actor);
    await F.game.settings.set(MODULE, "concentrationSummons", true);
    await settleFall();
    assert.deepEqual(ends(), []);
    assert.deepEqual(W.take(), []);
  } finally { restore(); }
});

test("summon fell: a world (linked) summon actor's dependent tokens are read with getDependentTokens; an effect on no Actor, or one that ended nothing, posts no line", async () => {
  const restore = resolving({ [FX]: concEffect(), "Actor.x.ActiveEffect.y": { ...conc, uuid: "Actor.x.ActiveEffect.y", parent: { documentName: "Item" } } });
  try {
    const { token } = summon();
    const linked = makeActor({ name: "Draconic Spirit", type: "npc", system: { attributes: { hp: { value: 0, max: 50 } } } });
    linked.getDependentTokens = ({ concreteOnly }) => (concreteOnly ? [token] : []);
    sorc.concEnded = [];
    W.take(); W.takeLog();
    fall(linked);
    await settleFall();
    assert.deepEqual(ends(), [{ op: "endConcentration", actor: "Ilsa Vantrel" }], "ended nothing (already gone): no line");
    assert.deepEqual(W.take(), []);
    sorc.concEnded = [conc];
    const odd = summon({ stamp: "Actor.x.ActiveEffect.y" });
    fall(odd.actor);
    await settleFall();
    assert.deepEqual(ends(), []);
  } finally { restore(); }
});

test("summon fell: a failing end is warned once; a throw in the check is warned; deleteToken prunes a stuck in-flight token", async () => {
  const restore = resolving();
  try {
    const { actor, token } = summon();
    const real = sorc.endConcentration;
    sorc.endConcentration = async () => { throw new Error("cannot end"); };
    W.take(); W.takeLog();
    fall(actor);
    await settleFall();
    sorc.endConcentration = real;
    assert.deepEqual(W.take(), [["warn", `${MODULE} | summon fell: concentration not ended`, "cannot end"]]);
    fall({ get isToken() { throw new Error("odd summon"); } });
    assert.deepEqual(W.take(), [["warn", `${MODULE} | summon fell check skipped`, "odd summon"]]);
    // a resolve that never answers leaves the token in flight; deleteToken (the cleanup, a scene move) forgets it
    globalThis.fromUuid = () => new Promise(() => {});
    const stuck = summon();
    fall(stuck.actor);
    globalThis.fromUuid = async () => concEffect();
    sorc.concEnded = [conc];
    fall(stuck.actor);
    await settleFall();
    assert.deepEqual(ends(), [], "still in flight: the second fall is skipped");
    F.fire("deleteToken", stuck.token, {}, IDS.gm);
    fall(stuck.actor);
    await settleFall();
    assert.equal(ends().filter(l => l.op === "endConcentration").length, 1, "pruned: handled again");
    W.take();
    void token;
  } finally { restore(); }
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
  // the same broken root reaches the card note, rest card and Empower listeners after it (riders.mjs): all warn
  assert.deepEqual(W.take(), [["warn", `${MODULE} | break-concentration label skipped`, "detached"], ["warn", `${MODULE} | card note skipped`, "detached"],
    ["warn", `${MODULE} | rest card skipped`, "detached"], ["warn", `${MODULE} | Empower button skipped`, "detached"]]);
});

/* ── 3. auto-break and the result line ───────────────────────────────────── */

function saveMessage({ total = 7, dc = 10, canBreak = true, canResist = false, actor = sorc, outcome, visible = true, user } = {}) {
  const msg = makeDoc("ChatMessage", { id: `save${String(++saveMessage.n).padStart(12, "0")}`, type: "save", isContentVisible: visible, system: { type: "concentration", canBreakConcentration: canBreak, canResist, outcome }, rolls: [{ total, options: { target: dc } }], user }, { collection: F.game.messages });
  msg.getAssociatedActor = () => actor;
  F.game.messages.set(msg.id, msg);   // the claim re-reads the card from game.messages
  return msg;
}
saveMessage.n = 0;
// riders-async-1: the auto-break claims the card (kit claimMessage) and waits 750 ms before acting
const settle = async () => { await drain(); mock.timers.tick(750); await drain(); };
const created = async (msg, userId = IDS.gm) => { await F.fire("createChatMessage", msg, {}, userId); await settle(); };
const CLAIM = `flags.${MODULE}.claims.autoBreak`;
const notClaim = c => !(CLAIM in (c.changes ?? {}));

test("auto-break: a failed save the owner rolled ends concentration and marks the card broken", async () => {
  sorc.concEnded = [conc];
  W.takeLog();
  const msg = saveMessage();
  const before = F.calls.length;
  await created(msg);
  assert.deepEqual(W.takeLog().filter(l => l.op === "endConcentration"), [{ op: "endConcentration", actor: "Ilsa Vantrel" }]);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ [CLAIM]: "socket-gm-1" }, { "system.outcome": "broken" }]);
});

test("[declared] riders-async-1: two tabs on the roller's account see one failed save — concentration ends once, the card is marked once", async () => {
  sorc.concEnded = [conc];
  W.takeLog();
  const msg = saveMessage();
  const before = F.calls.length;
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("createChatMessage", msg, {}, IDS.gm);     // the MCP bridge tab
    F.become({ socketId: "socket-browser" });
    F.fire("createChatMessage", msg, {}, IDS.gm);     // a GM browser tab, same user
    await settle();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  assert.equal(W.takeLog().filter(l => l.op === "endConcentration").length, 1, "concentration ended once");
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update" && notClaim(c)).map(c => c.changes), [{ "system.outcome": "broken" }], "the card is marked once");
});

test("[declared] riders-async-1: the later claim wins when both tabs write before either reads back", async () => {
  sorc.concEnded = [conc];
  W.takeLog();
  const msg = saveMessage();
  const before = F.calls.length;
  try {
    F.become({ socketId: "socket-bridge" });
    F.fire("createChatMessage", msg, {}, IDS.gm);
    // the browser tab's claim lands second on the server; it read no claim before writing
    delete msg.flags[MODULE]?.claims;
    F.become({ socketId: "socket-browser" });
    F.fire("createChatMessage", msg, {}, IDS.gm);
    await settle();
  } finally {
    F.become({ socketId: "socket-gm-1" });
  }
  assert.equal(msg.flags[MODULE]?.claims?.autoBreak, "socket-browser");
  assert.equal(W.takeLog().filter(l => l.op === "endConcentration").length, 1, "concentration ended once");
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update" && notClaim(c)).map(c => c.changes), [{ "system.outcome": "broken" }]);
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
  assert.equal(F.calls.slice(before).filter(c => c.op === "update" && notClaim(c)).length, 0, "nothing ended: the card is not marked");
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
  assert.deepEqual(W.take(), [["warn", `${MODULE} | concentration result line skipped`, "detached"], ["warn", `${MODULE} | card note skipped`, "detached"],
    ["warn", `${MODULE} | rest card skipped`, "detached"], ["warn", `${MODULE} | Empower button skipped`, "detached"]]);
});

test("result line: a save message without a root renders nothing", () => {
  F.fire("dnd5e.renderChatMessage", saveMessage(), null);
  F.fire("dnd5e.renderChatMessage", saveMessage(), []);
  assert.deepEqual(W.take(), []);
});
