// Part B: saves and damage off the area, on the ACTIVE GM's client. A damage message from a save
// activity → the creatures inside the area → monster saves rolled, one request card for the
// players → the resolution on the damage message → Apply. Careful Spell, superseding, and the
// player's request handler. Unchanged 0.3.1 code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, out, lines, MODULE, NOW } from "./fixtures/world.mjs";
import { fireball, damage, IDS, GM_ID, PLAYER_ID } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);

/* ── the whole pipeline ──────────────────────────────────────────────────────────────────────── */

test("a Fireball damage message is resolved on the GM: rows, NPC saves, one request card (golden/resolve-fireball.json)", async () => {
  reset();
  const msg = damage(W, ctx, { hook: true });
  await advance(800);                                  // claimMessage's 750 ms settle
  await flush(8);
  const res = resOf(msg.id);
  pinJSON("resolve-fireball", {
    resolution: res,
    calls: ops("rollSavingThrow", "create", "update").map(c => (c.op === "update" ? { op: c.op, uuid: c.uuid, keys: Object.keys(c.changes) } : c)),
  }, import.meta.url);
  assert.deepEqual(res.rows.map(r => [r.id, r.kind, r.apply, r.caster, r.save?.success ?? null, r.multiplier]), [
    [IDS.g1, "auto", true, false, true, 0.5],
    [IDS.g2, "auto", true, false, false, 1],
    [IDS.cv, "manual", true, false, null, null],
    [IDS.mr, "manual", false, true, null, null],
    [IDS.dead, "auto", false, false, false, 1],
    [IDS.hid, "auto", false, false, false, 1],
  ]);
  assert.equal(res.request, ops("create").find(c => c.data.type === "request") && game.messages.contents.find(m => m.type === "request").id);
  assert.equal(msg.flags[MODULE].claims.resolve, game.socket.id);
});

test("NPC saves: threaded under the usage card and flagged npcSave (rollMode gm is in the golden)", () => {
  const saves = game.messages.contents.filter(m => m.type === "save" && m.flags?.[MODULE]?.npcSave);
  assert.equal(saves.length, 4);
  for (const m of saves) assert.equal(m.system.origin, IDS.usage);
});

/* ── player saves ────────────────────────────────────────────────────────────────────────────── */

test("the player's request button: the request handler rolls on the player's client, the GM fills the row", async () => {
  const res = resOf("dmgFireball00001");
  const handler = CONFIG.DND5E.requests[`${MODULE}.save`];
  assert.equal(handler, R.handleSaveRequest);
  ctx.caven._saves.push(16);
  F.become({ userId: PLAYER_ID });
  reset();
  const saveMsg = await handler(ctx.caven, { id: res.request }, { ability: "dex", dc: 15, damageMessage: "dmgFireball00001" }, { event: { shiftKey: true, target: "card", clientX: 4, clientY: 5, type: "click" } });
  F.become({ userId: GM_ID });
  pinJSON("request-roll", ops("rollSavingThrow"), import.meta.url);
  F.fire("createChatMessage", saveMsg, {}, PLAYER_ID);
  await flush(8);
  const row = resOf("dmgFireball00001").rows.find(r => r.id === IDS.cv);
  assert.deepEqual([row.save, row.multiplier], [{ total: 16, success: true, messageId: saveMsg.id }, 0.5]);
});

test("a save rolled from the card's own button (no request) answers by speaker token, ability and time", async () => {
  const msg = damage(W, ctx, { id: "dmgFireball00002", hook: true });
  await advance(800);
  await flush(8);
  const save = W.message({ type: "save", rolls: [{ total: 3, isSuccess: false }], system: { ability: "dex", type: "ability" }, speaker: { token: IDS.cv, actor: IDS.caven }, timestamp: Date.now() + 1 });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await flush(8);
  const row = resOf(msg.id).rows.find(r => r.id === IDS.cv);
  assert.deepEqual(row.save, { total: 3, success: false, messageId: save.id });
  assert.equal(row.multiplier, 1);
});

test("a request result attached after creation (updateChatMessage) fills the row; other updates are ignored", async () => {
  const msg = damage(W, ctx, { id: "dmgFireball00003", hook: true });
  await advance(800);
  await flush(8);
  const res = resOf(msg.id);
  const save = W.message({ type: "save", rolls: [{ total: 20 }], system: { ability: "dex", type: "ability" }, speaker: {} });
  await save.update({ "flags.other": 1 });
  await flush(4);
  assert.equal(resOf(msg.id).rows.find(r => r.id === IDS.cv).save, null);
  await save.update({ "flags.dnd5e.requestResult": { actorUuid: ctx.caven.uuid, requestId: res.request } });
  await flush(8);
  assert.deepEqual(resOf(msg.id).rows.find(r => r.id === IDS.cv).save, { total: 20, success: true, messageId: save.id });
});

test("concentration and death saves never answer a row; a superseded resolution takes nothing", async () => {
  const before = JSON.stringify(resOf("dmgFireball00003"));
  for (const type of ["concentration", "death"]) {
    const m = W.message({ type: "save", rolls: [{ total: 20 }], system: { ability: "dex", type }, speaker: { token: IDS.cv } });
    F.fire("createChatMessage", m, {}, PLAYER_ID);
  }
  await flush(8);
  assert.equal(JSON.stringify(resOf("dmgFireball00003")), before);
});

test("rollForPlayer: the GM rolls a player's save with the normal dialog, as the request result", async () => {
  reset();
  const res = resOf("dmgFireball00002");
  await R.rollForPlayer("dmgFireball00002", IDS.cv, { event: { altKey: true } });
  pinJSON("roll-for-player", ops("rollSavingThrow"), import.meta.url);
  assert.equal(ops("rollSavingThrow")[0].message.data.flags.dnd5e.requestResult.requestId, res.request);
  assert.equal(await R.rollForPlayer("dmgFireball00002", "noSuchRow0000001"), null);
  assert.equal(await R.rollForPlayer("missingMessage01", IDS.cv), null);
});

test("pingPlayers whispers the active owners of rows still waiting; nobody → an info toast", async () => {
  const msg = damage(W, ctx, { id: "dmgFireball00004", hook: true });
  await advance(800);
  await flush(8);
  reset();
  const ping = await R.pingPlayers(msg.id);
  assert.deepEqual(ops("create").map(c => c.data), [{ whisper: [PLAYER_ID], content: `<p>${game.i18n.format("PENTARYN_AOE.Tray.PingText", { item: "Fireball", ability: "Dexterity" })}</p>` }]);
  assert.ok(ping);
  game.users.get(PLAYER_ID).active = false;
  reset();
  await R.pingPlayers(msg.id);
  game.users.get(PLAYER_ID).active = true;
  assert.deepEqual(ops("notify").map(c => [c.level, c.message]), [["info", game.i18n.localize("PENTARYN_AOE.Tray.NobodyToPing")]]);
  assert.equal(await R.pingPlayers("missingMessage01"), null);
});

/* ── GM edits and Apply ──────────────────────────────────────────────────────────────────────── */

test("setRow: tick and multiplier override; an applied row is not edited", async () => {
  await R.setRow("dmgFireball00004", IDS.g2, { multiplier: "0.25" });
  await R.setRow("dmgFireball00004", IDS.mr, { apply: 1 });
  const rows = resOf("dmgFireball00004").rows;
  assert.deepEqual([rows[1].multiplier, rows[1].overridden, rows[3].apply], [0.25, true, true]);
  await R.setRow("dmgFireball00004", "noSuchRow0000001", { apply: false });
});

test("applyRows: only ticked, resolved, unapplied rows; HP recorded; safe to repeat (golden/apply.json)", async () => {
  reset();
  const out1 = await R.applyRows("dmgFireball00004");
  const calls1 = ops("applyDamage");
  reset();
  const out2 = await R.applyRows("dmgFireball00004");
  pinJSON("apply", { first: calls1, rows: out1.rows.map(r => ({ id: r.id, applied: r.applied, hp: r.hp ?? null })), second: ops("applyDamage") }, import.meta.url);
  assert.deepEqual(calls1.map(c => [c.actor, c.multiplier]), [["Actor.actGoblin0000001", 1], ["Actor.actGoblin0000002", 0.25]]);
  assert.deepEqual(ops("applyDamage"), [], "nothing applicable the second time");
  assert.ok(out2);
});

test("everything applied on an instantaneous spell → its area is removed (instantCleanup)", async () => {
  const msg = damage(W, ctx, { id: "dmgFireball00005", hook: true });
  await advance(800);
  await flush(8);
  await R.setRow(msg.id, IDS.cv, { multiplier: 1 });
  reset();
  await R.applyRows(msg.id);
  assert.deepEqual(ops("deleteEmbedded").filter(c => c.documentName === "Region").map(c => c.ids), [[IDS.region]]);
  W.region(ctx.s, { id: IDS.region, name: "Fireball", inside: ctx.inside, flags: { dnd5e: { activity: ctx.activity.uuid, item: ctx.item.uuid } }, ownership: { default: 3 } });
});

test("applyRows returns null as a player, for no resolution, and (with a toast) for a superseded one", async () => {
  F.become({ userId: PLAYER_ID });
  assert.equal(await R.applyRows("dmgFireball00004"), null);
  F.become({ userId: GM_ID });
  assert.equal(await R.applyRows("missingMessage01"), null);
  assert.equal(resOf("dmgFireball00001").superseded, true, "a later Damage click on the same area superseded it");
  reset();
  assert.equal(await R.applyRows("dmgFireball00001"), null);
  assert.deepEqual(ops("notify").map(c => c.level), ["warn"]);
});

test("superseding: each newer resolution on the same activity and area greys the older ones out", () => {
  const ids = ["dmgFireball00001", "dmgFireball00002", "dmgFireball00003", "dmgFireball00004", "dmgFireball00005"];
  assert.deepEqual(ids.map(id => resOf(id).superseded), [true, true, true, true, false]);
});

test("rollNpcSaves: force re-rolls auto rows; rowIds limits; applied and protected rows are skipped", async () => {
  const msg = damage(W, ctx, { id: "dmgFireball00006", hook: true });
  await advance(800);
  await flush(8);
  ctx.g1._saves.push(2);
  reset();
  await R.rollNpcSaves(msg.id, { rowIds: [IDS.g1], force: true });
  assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), ["Actor.actGoblin0000001"]);
  assert.equal(resOf(msg.id).rows[0].multiplier, 1);
  reset();
  await R.rollNpcSaves(msg.id);
  assert.deepEqual(ops("rollSavingThrow"), [], "without force a row with a save is kept");
  reset();
  await R.rollNpcSaves(msg.id, { force: true });
  assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), ["Actor.actGoblin0000001", "Actor.actGoblin0000002", "Actor.actGoblinDead001", "Actor.actGoblinHid0001"]);
  assert.equal(await R.rollNpcSaves("missingMessage01"), null);
});

test("autoApplyNpc: the auto rows are applied straight after the saves", async () => {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;   // earlier Applies took them to 0 (a 0 HP row starts unticked)
  await game.settings.set(MODULE, "autoApplyNpc", true);
  reset();
  const msg = damage(W, ctx, { id: "dmgFireball00007", hook: true });
  await advance(800);
  await flush(8);
  await game.settings.set(MODULE, "autoApplyNpc", false);
  assert.deepEqual(ops("applyDamage").map(c => c.actor), ["Actor.actGoblin0000001", "Actor.actGoblin0000002"]);
  assert.deepEqual(resOf(msg.id).rows.filter(r => r.applied).map(r => r.id), [IDS.g1, IDS.g2]);
});

test("promptPlayers off: no request card", async () => {
  await game.settings.set(MODULE, "promptPlayers", false);
  reset();
  const msg = damage(W, ctx, { id: "dmgFireball00008", hook: true });
  await advance(800);
  await flush(8);
  await game.settings.set(MODULE, "promptPlayers", true);
  assert.equal(resOf(msg.id).request, null);
  assert.deepEqual(ops("create").filter(c => c.data.type === "request"), []);
});

/* ── when nothing happens (-8: the return values a trace must not change) ──────────────────────── */

test("-8 resolve() → null: not the active GM, not a damage message, no save activity, unknown id", async () => {
  F.become({ userId: PLAYER_ID });
  assert.equal(await R.resolve("dmgFireball00001"), null);
  F.become({ userId: GM_ID });
  assert.equal(await R.resolve("missingMessage01"), null);
  assert.equal(await R.resolve(ctx.usage), null);
  const attack = W.message({ type: "damage", activity: { uuid: "x", item: ctx.item } });
  assert.equal(await R.resolve(attack), null);
});

test("createChatMessage does nothing: as a player, setting off, already resolved, no save, lost claim", async () => {
  const count = () => ops("rollSavingThrow").length + ops("create").length;
  reset();
  F.become({ userId: PLAYER_ID });
  damage(W, ctx, { id: "dmgSkip000000001", hook: true });
  F.become({ userId: GM_ID });
  await game.settings.set(MODULE, "resolveSaves", false);
  damage(W, ctx, { id: "dmgSkip000000002", hook: true });
  await game.settings.set(MODULE, "resolveSaves", true);
  const pre = damage(W, ctx, { id: "dmgSkip000000003" });
  pre.flags[MODULE] = { resolution: { rows: [] } };
  F.fire("createChatMessage", pre, {}, PLAYER_ID);
  W.message({ id: "dmgSkip000000004", type: "damage", activity: { uuid: "y" } }, { hook: true });
  const lost = damage(W, ctx, { id: "dmgSkip000000005", hook: true });
  await flush();
  lost.flags[MODULE].claims.resolve = "another-socket";
  await advance(800);
  await flush(8);
  assert.equal(count(), 0);
  for (const id of ["dmgSkip000000001", "dmgSkip000000002", "dmgSkip000000004", "dmgSkip000000005"]) assert.equal(resOf(id), null, id);
});

test("resolve(id, { regionId: null }) uses the recorded targets instead of the area", async () => {
  const targets = [{ token: `${ctx.s.uuid}.Token.${IDS.g1}`, actor: ctx.g1.uuid }, { actor: ctx.caven.uuid }];
  const msg = damage(W, ctx, { id: "dmgTargets000001", targets });
  const res = await R.resolve(msg.id, { regionId: null });
  assert.deepEqual([res.region, res.rows.map(r => r.id)], [null, [IDS.g1, IDS.cv]]);
  const res2 = await R.resolve(msg.id, { regionId: "noSuchRegion0001" });
  assert.equal(res2.region, null);
  const res3 = await R.resolve(msg.id, { regionId: IDS.region });
  assert.equal(res3.region, IDS.region);
});

/* ── Careful Spell ───────────────────────────────────────────────────────────────────────────── */

test("Careful Spell used (postUseActivity on the caster's client): armed for the next save spell, toast with the CHA count", async () => {
  const careful = W.item({ name: "Careful Spell", type: "feat", system: { identifier: "careful-spell" } }, ctx.wizard);
  reset();
  const at = Date.now();
  assert.ok(at >= NOW, "mocked clock");
  F.fire("dnd5e.postUseActivity", { item: careful, actor: ctx.wizard }, {}, {});
  await flush();
  assert.deepEqual(ctx.wizard.flags[MODULE].careful, { at, key: null, usage: null });
  assert.deepEqual(ops("notify").map(c => [c.level, c.message]), [["info", game.i18n.format("PENTARYN_AOE.Careful.Armed", { n: 3 })]]);
  reset();
  F.fire("dnd5e.postUseActivity", { item: ctx.item, actor: ctx.wizard }, {}, {});
  F.fire("dnd5e.postUseActivity", { item: careful, actor: { ...ctx.wizard, isOwner: false } }, {}, {});
  await flush();
  assert.deepEqual(ops("update", "notify"), []);
});

test("an armed Careful Spell protects the caster's side in the area (golden/careful.json) and binds to the usage card", async () => {
  reset();
  const msg = damage(W, ctx, { id: "dmgCareful000001", hook: true });
  await advance(800);
  await flush(8);
  const res = resOf(msg.id);
  pinJSON("careful", { careful: res.careful, rows: res.rows.map(r => ({ id: r.id, protected: !!r.protected, save: r.save, multiplier: r.multiplier })) }, import.meta.url);
  assert.deepEqual(res.careful, { names: ["Caven"], max: 3 });
  assert.equal(ctx.wizard.flags[MODULE].careful.usage, IDS.usage);
  assert.equal(ops("create").filter(c => c.data.type === "request").length, 0, "the protected PC gets no request card");
});

test("carefulFor → null: setting off, no flag, another usage card, too old", async () => {
  const flag = ctx.wizard.flags[MODULE].careful;
  const args = (usage = IDS.usage) => [ctx.wizard, [], { casterActorId: ctx.wizard.id, usage, scene: ctx.s, onSave: "half", rows: [] }];
  assert.deepEqual(await R.carefulFor(...args()), { names: [], max: 3 });
  assert.equal(await R.carefulFor(...args("otherUsage000001")), null);
  await game.settings.set(MODULE, "carefulSpell", false);
  assert.equal(await R.carefulFor(...args()), null);
  await game.settings.set(MODULE, "carefulSpell", true);
  ctx.wizard.flags[MODULE].careful = { at: Date.now() - 11 * 60 * 1000, key: null, usage: null };
  assert.equal(await R.carefulFor(...args()), null);
  delete ctx.wizard.flags[MODULE].careful;
  assert.equal(await R.carefulFor(...args()), null);
  assert.equal(await R.carefulFor(null, [], {}), null);
  ctx.wizard.flags[MODULE].careful = flag;
});

test("carefulKey: the started combat's turn the actor is in, else null", () => {
  assert.equal(R.carefulKey(ctx.wizard), null);
  const combat = { id: "combat0000000001", started: true, round: 2, combatant: { id: "cbt1" }, turn: 0, combatants: [{ actor: ctx.wizard, actorId: ctx.wizard.id }] };
  game.combats.set(combat.id, combat);
  assert.equal(R.carefulKey(ctx.wizard), "combat0000000001:2:cbt1");
  combat.combatant = null;
  assert.equal(R.carefulKey(ctx.wizard), "combat0000000001:2:0");
  combat.started = false;
  assert.equal(R.carefulKey(ctx.wizard), null);
  game.combats.delete(combat.id);
});

test("deleteCombat (active GM): a Careful Spell armed for that combat's turn is cleared; others stay", async () => {
  ctx.wizard.flags[MODULE].careful = { at: 1, key: "combat0000000002:1:x", usage: null };
  ctx.caven.flags[MODULE] = { careful: { at: 1, key: "combat0000000003:1:x" } };
  reset();
  F.fire("deleteCombat", { id: "combat0000000002", combatants: [{ actor: ctx.wizard }, { actor: ctx.wizard }, { actor: ctx.caven }, { actor: null }] });
  await flush();
  assert.equal(ctx.wizard.flags[MODULE].careful, undefined);
  assert.deepEqual(ctx.caven.flags[MODULE].careful, { at: 1, key: "combat0000000003:1:x" });
  assert.equal(ops("update").length, 1, "each actor once");
  F.become({ userId: PLAYER_ID });
  ctx.caven.flags[MODULE].careful.key = "combat0000000004:1:x";
  F.fire("deleteCombat", { id: "combat0000000004", combatants: [{ actor: ctx.caven }] });
  await flush();
  F.become({ userId: GM_ID });
  assert.ok(ctx.caven.flags[MODULE].careful, "not the active GM: untouched");
});

/* ── the pieces (-2, -5, -6) ─────────────────────────────────────────────────────────────────── */

test("-2 describeToken: the plain shape buildRows reads (golden/describe-token.json); game.actors.find once per call", () => {
  const s = ctx.s;
  const handleActor = game.actors.find(a => a.flags?.[MODULE]?.handleActor);
  const t1 = W.token(null, { id: "t1", actorId: handleActor.id, actor: { type: "npc", flags: {} }, texture: {} });
  const t2 = W.token(null, { id: "t2", actorId: "gob", disposition: -1, actor: { uuid: "Actor.gob", type: "npc", system: { attributes: { hp: { max: 7, value: 7 } } }, flags: {} }, texture: { src: "g.webp" } });
  const t3 = W.token(null, { id: "t3", actorId: null, actor: null, texture: {} });
  const find = game.actors.find.bind(game.actors);
  let n = 0;
  game.actors.find = fn => { n++; return find(fn); };
  const handle = W.token(null, { id: "t4", actorId: handleActor.id, actor: handleActor, flags: { [MODULE]: { handle: true } }, texture: {} });
  const shapes = [t1, t2, t3, s.tokens.get(IDS.pile), handle].map(t => R.describeToken(t));
  game.actors.find = find;
  pinJSON("describe-token", shapes, import.meta.url);
  assert.equal(n, 4, "the handle actor itself short-circuits; every other token scans game.actors");
  assert.deepEqual(shapes.map(d => [d.isHandleActor, d.handle, d.isPile]), [[true, false, false], [false, false, false], [false, false, false], [false, false, true], [true, true, false]]);
});

test("isPile: Item Piles' API when present (a throw falls through to the flags), else the flags", () => {
  const tk = ctx.s.tokens.get(IDS.g1);
  assert.equal(R.isPile(tk), false);
  game.itempiles = { API: { isValidItemPile: t => t.id === IDS.g1 } };
  assert.equal(R.isPile(tk), true);
  game.itempiles = { API: { isValidItemPile: () => { throw new Error("piles broke"); } } };
  assert.equal(R.isPile(ctx.s.tokens.get(IDS.pile)), true);
  assert.equal(R.isPile({ actor: null, flags: { "item-piles": { data: { enabled: true } } } }), true);
  game.itempiles = undefined;
});

test("-5 tokensForTargets: the token when it is on the scene, else the actor's token there; the legacy { uuid } too", () => {
  const s = ctx.s;
  const other = W.scene({ id: "OtherScene000009" });
  const offScene = W.token(other, { id: "tokOffScene00001", actorId: ctx.g2.id });
  const targets = [
    { token: `${s.uuid}.Token.${IDS.g1}`, actor: "Actor.x" },
    { actor: ctx.caven.uuid },
    { uuid: ctx.g2.uuid },
    { token: offScene.uuid, actor: ctx.g2.uuid },
    { token: "Scene.gone.Token.gone", actor: "Actor.gone" },
    null,
  ];
  assert.deepEqual(R.tokensForTargets(targets, s).map(t => t.id), [IDS.g1, IDS.cv, IDS.g2, IDS.g2]);
  assert.deepEqual(R.tokensForTargets(targets, null).map(t => t.id), [IDS.g1, IDS.g2, offScene.id], "no scene: a linked PC's token is not found");
  assert.deepEqual(R.tokensForTargets(undefined, s), []);
});

test("-6 mutate serialises writes per message, in call order", async () => {
  const m = W.message({ id: "mutateMsg0000001", flags: { [MODULE]: { resolution: { rows: [], n: 0 } } } });
  const a = R.mutate(m.id, r => { r.n++; return r; });
  const b = R.mutate(m.id, async r => { await null; r.n *= 10; return r; });
  const c = R.mutate(m.id, r => { r.n += 1; });
  assert.equal((await b).n, 10);
  assert.equal((await c).n, 11);
  assert.equal((await a).n, 1);
  assert.equal(resOf(m.id).n, 11);
  assert.equal(await R.mutate("missingMessage01", r => r), null);
});

test("mutate: a throwing fn is logged 'pentaryn-aoe | mutate' and resolves null; the queue keeps going", async () => {
  const m = W.message({ id: "mutateMsg0000002", flags: { [MODULE]: { resolution: { n: 0 } } } });
  out.length = 0;
  assert.equal(await R.mutate(m.id, () => { throw new Error("bad"); }), null);
  assert.deepEqual(lines(), [`error: ${MODULE} | mutate`]);
  assert.equal((await R.mutate(m.id, r => { r.n = 5; return r; })).n, 5);
});

test("KNOWN -6: the per-message queue map never shrinks", async () => {
  const size = R.queues.size;
  assert.ok(size >= 2);
  assert.ok(R.queues.has("mutateMsg0000001"));
});

test("-6 the queue entry is dropped once settled", { todo: "standalone -6: next.finally deletes the settled tail; pendingWrites()" }, async () => {
  await flush();
  assert.equal(R.queues.has("mutateMsg0000001"), false);
});

/* ── small helpers ───────────────────────────────────────────────────────────────────────────── */

test("usageIdOf: the usage card a roll threads under, else null", () => {
  assert.equal(R.usageIdOf(game.messages.get("dmgFireball00001")), IDS.usage);
  assert.equal(R.usageIdOf({ system: { origin: { id: IDS.usage } } }), IDS.usage);
  assert.equal(R.usageIdOf({ system: { origin: "dmgFireball00001" }, _source: { system: { origin: "dmgFireball00001" } } }), null);
  assert.equal(R.usageIdOf(null), null);
});

test("keysOnly keeps the modifier keys and pointer, drops the target; saveSystem threads under the usage card", () => {
  assert.equal(R.keysOnly(undefined), undefined);
  assert.deepEqual(R.keysOnly({ shiftKey: 1, target: "x", clientX: 3, type: "click" }), { altKey: false, ctrlKey: false, metaKey: false, shiftKey: true, clientX: 3, clientY: undefined, type: "click" });
  assert.deepEqual(R.saveSystem({ activity: ctx.activity.uuid, usage: IDS.usage }), { activity: { uuid: ctx.activity.uuid }, origin: IDS.usage });
  assert.deepEqual(R.saveSystem({ activity: "gone", usage: "notAMessage00001" }), {});
  assert.deepEqual(R.saveSystem(null), {});
});

test("handleSaveRequest without a resolution passes the raw event and no system", async () => {
  reset();
  await R.handleSaveRequest(ctx.caven, { id: "req" }, { ability: "con", dc: 12, damageMessage: "missingMessage01" }, { event: { shiftKey: true } });
  const [c] = ops("rollSavingThrow");
  assert.equal(c.config.event, "<event>");
  assert.equal(c.message.data.system, undefined);
  assert.deepEqual(c.message.data.flags.dnd5e.requestResult, { actorUuid: ctx.caven.uuid, requestId: "req" });
});

test("rollOne: a missing actor or a cancelled roll gives no result", async () => {
  assert.equal(await R.rollOne({ actor: "Actor.gone" }, { ability: "dex", dc: 10 }, ctx.s), null);
  ctx.g1._saves.push(null);
  assert.equal(await R.rollOne({ actor: ctx.g1.uuid, id: IDS.g1 }, { ability: "dex", dc: 10, activity: ctx.activity.uuid }, ctx.s), null);
});

test("npcSaveRollMode: a stored legacy name is mapped at the roll (gmroll → gm)", async () => {
  await game.settings.set(MODULE, "npcSaveRollMode", "blindroll");
  reset();
  await R.rollOne({ actor: ctx.g1.uuid, id: IDS.g1 }, { ability: "dex", dc: 10 }, ctx.s);
  await game.settings.set(MODULE, "npcSaveRollMode", "gm");
  assert.equal(ops("rollSavingThrow")[0].message.rollMode, "blind");
});

test("multiplierFor is re-exported from resolve.mjs", () => {
  assert.equal(R.multiplierFor(false, "half"), 1);
});

test("damagesOf aggregates through dnd5e (respectProperties) and keeps properties as an array", () => {
  reset();
  const d = R.damagesOf({ rolls: [{ total: -3, options: { type: "cold", properties: new Set(["mgc"]) } }] });
  assert.deepEqual(d, [{ value: 0, type: "cold", properties: ["mgc"] }]);
  assert.deepEqual(ops("aggregateDamageRolls"), [{ op: "aggregateDamageRolls", n: 1, opts: { respectProperties: true } }]);
});

test("D-A1 KNOWN: a resolution without damages makes applyRows throw (S2's hydrateDamages returns [])", async () => {
  const m = W.message({ id: "noDamages0000001", flags: { [MODULE]: { resolution: { rows: [] } } } });
  await assert.rejects(R.applyRows(m.id), TypeError);
});
