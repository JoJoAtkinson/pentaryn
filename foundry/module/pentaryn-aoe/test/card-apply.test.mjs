// Part I (feedback OrwZqP, DnK6lE, OnvqIi; plan clusters B relay, late targets, B5): Apply on dnd5e's own
// damage / healing tray. The rows dnd5e lists are applied: owned rows land here as dnd5e would land them;
// rows the user does not own go to the active GM as one query when the user is the card's author or owns
// its actor (else they are skipped silently, as dnd5e skips them); a card that recorded no targets fills
// with its author's targets; every row has a total the player can type, shown in dnd5e's own number.
// The card is dnd5e's <damage-application>, modelled here with the public members the module reads
// (damages, multiplier, getMergedOptions, targetList) and the row markup it builds (an owned row has the
// `.calculated.damage > .value` number; an unowned row has only its pill and option).
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, lines, MODULE, GM_ID, PLAYER_ID, makeUser } from "./fixtures/world.mjs";
import { fireball, IDS } from "./fixtures/fireball.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const P = S.apply;
const ctx = fireball(W, F);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };
const RELAY = `${MODULE}.applyRelay`;

// a second player who owns nobody here; Marrith's TOKEN is the player's (a token's ownership follows its actor)
const other = makeUser({ id: "plUser0000000002", name: "Other", isGM: false });
game.users.set(other.id, other);
const player = game.users.get(PLAYER_ID);
const tokMr = ctx.s.tokens.get(IDS.mr);
const tokCv = ctx.s.tokens.get(IDS.cv);
const tokG1 = ctx.s.tokens.get(IDS.g1);
tokMr.ownership = { default: 0, [PLAYER_ID]: 3 };
const MR = tokMr.uuid, CV = tokCv.uuid, G1 = tokG1.uuid;
const desc = (tok, actor) => ({ actor: actor.uuid, token: tok.uuid, name: tok.name });

/**
 * A healing card the player posted (Heal, 8), as dnd5e 6 types it: a healing roll's card is type
 * `healing` (HealingMessageData), a damage roll's is `damage` — both carry the <damage-application>.
 * `messageType` overrides the one the roll type implies.
 */
function healCard(id, { targets = [desc(tokMr, ctx.wizard), desc(tokCv, ctx.caven)], author = PLAYER_ID, isAuthor = author === game.user.id, total = 8, type = "healing", messageType = type === "healing" ? "healing" : "damage", at, flags = {} } = {}) {
  return W.message({
    id, type: messageType, author, isAuthor, flags, ...(at !== undefined ? { timestamp: at } : {}),
    system: { targets }, rolls: [{ total, options: { type } }], speaker: { scene: ctx.s.id, actor: ctx.wizard.id },
  });
}

/**
 * dnd5e's card: the <damage-application> with its target rows built, as the module finds it. `bare`
 * rows are tokens the viewer does not own (dnd5e builds them with no number). A click on the ×½
 * button does what dnd5e does: the global multiplier changes and every row's number is rewritten.
 */
function card(message, uuids, { multipliers = {}, multiplier = 1, mode = "targeted", bare = [], rolled = -8 } = {}) {
  const lis = uuids.map(u => `<li><target-pill><label>${u}</label><datalist><option value="${u}" data-checked>${u}</option></datalist>${bare.includes(u) ? "" : `<span class="calculated damage"><span class="value">${rolled}</span></span>`}</target-pill></li>`).join("");
  const host = root(`<div class="message-content"><div class="chat-card">card</div><damage-application><div class="card-tray damage-tray"><recorded-targets><ul class="targets unlist pills">${lis || '<li class="none pill target transparent">No targets</li>'}</ul></recorded-targets><div class="multiplier-row"><button class="multiplier-button" type="button" value="0.5">×½</button></div><button class="apply-button" type="button">Apply</button></div></damage-application></div>`);
  const el = host.querySelector("damage-application");
  el.multiplier = multiplier;
  el.getMergedOptions = uuid => ({ multiplier: multipliers[uuid] ?? el.multiplier, originatingMessage: message });
  el.targetList = host.querySelector("recorded-targets");
  el.targetList.targetingMode = mode;
  const half = host.querySelector(".multiplier-button");
  half.addEventListener("click", () => {   // dnd5e's own handler, bubbling after the module's capture listener
    el.multiplier = 0.5;
    for (const v of host.querySelectorAll(".calculated.damage > .value")) v.textContent = String(Math.round(Number(rolled) * 0.5));
  });
  F.fire("dnd5e.renderChatMessage", message, host);
  const built = () => dispatch(el.targetList, "recorded-targets:build");
  const inputs = () => el.querySelectorAll(".pa-card-amount");
  const values = () => host.querySelectorAll(".calculated.damage > .value").map(v => v.textContent);
  const apply = async () => {
    const ev = dispatch(host.querySelector(".apply-button"), "click");
    await Promise.all(ev.results);
    await flush(8);
    return ev;
  };
  return { host, el, recorded: el.targetList, half, built, inputs, values, apply };
}

/** The GM's answer, in place of the kit handler: a stub user.query runs the handler in the sender's own context. */
let relayAnswer = data => ({ ok: true, applied: data.rows.map(r => r.uuid) });
const kitHandler = CONFIG.queries[RELAY];
CONFIG.queries[RELAY] = async (data, ctx) => { F.calls.push({ op: "relay", data: F.plain(data), user: ctx?.user?.id ?? null }); return relayAnswer(data); };

F.become({ userId: PLAYER_ID });

test("the kit registered the relay query on this client at ready (a player's queryGM needs the name)", () => {
  assert.equal(typeof kitHandler, "function");
});

test("B5: every target row gets a small total, pre-filled with the rolled total; dnd5e's own number is left as it is; nothing else is added", () => {
  const msg = healCard("healCard00000001");
  const c = card(msg, [MR, CV]);
  assert.equal(c.inputs().length, 2, "this card's rows are already in the markup; a live card builds them later");
  c.built();
  const inputs = c.inputs();
  assert.deepEqual(inputs.map(i => i.value), ["8", "8"]);
  assert.deepEqual(inputs.map(i => i.getAttribute("type")), ["number", "number"]);
  assert.deepEqual(inputs.map(i => i.dataset.tooltip), [game.i18n.localize("PENTARYN_AOE.Apply.AmountTip"), game.i18n.localize("PENTARYN_AOE.Apply.AmountTip")]);
  assert.deepEqual(c.values(), ["-8", "-8"]);
  assert.equal(c.host.querySelectorAll("li > *").length, 4, "one pill and one field per row, nothing more");
  c.built();
  assert.equal(c.inputs().length, 2, "a rebuild with the rows still there adds nothing");
  assert.equal(c.host.querySelector("li.none"), null);
});

test("B5: a typed total is shown in dnd5e's own per-row number; the rolled total typed back restores dnd5e's text", async () => {
  const msg = healCard("healCard00000002");
  const c = card(msg, [MR, CV]);
  c.built();
  const [mr, cv] = c.inputs();
  mr.value = "12";
  dispatch(mr, "input");
  assert.deepEqual(c.values(), ["-12", "-8"], "Marrith's actor calculates: 12 × 1; Caven's row is untouched");
  assert.deepEqual([...P.amounts.get(msg.id)], [[MR, 12]]);
  mr.value = "8";
  dispatch(mr, "input");
  assert.deepEqual(c.values(), ["-8", "-8"]);
  assert.equal(P.amounts.has(msg.id), false);
  cv.value = "abc";
  dispatch(cv, "input");
  assert.deepEqual(c.values(), ["-8", "-8"]);
  // our field's change is not one of dnd5e's target ticks
  const ev = dispatch(cv, "change");
  assert.equal(ev.stopped, true);
});

test("B5: dnd5e changing the multiplier rewrites its numbers; the typed rows are recomputed a tick later and still clear to dnd5e's latest", async () => {
  const msg = healCard("healCard00000017");
  const c = card(msg, [MR, CV]);
  c.built();
  const [mr] = c.inputs();
  mr.value = "12";
  dispatch(mr, "input");
  assert.deepEqual(c.values(), ["-12", "-8"]);
  const ev = dispatch(c.half, "click");
  assert.equal(ev.defaultPrevented, false, "not the Apply button: dnd5e's own handler runs");
  assert.deepEqual(c.values(), ["-4", "-4"], "dnd5e has just rewritten every row at ×½");
  await advance(0);
  assert.deepEqual(c.values(), ["-6", "-4"], "12 × ½ for the typed row; dnd5e's own for the other");
  mr.value = "";
  dispatch(mr, "input");
  assert.deepEqual(c.values(), ["-4", "-4"], "cleared: dnd5e's latest number, not the one first seen");
});

test("B5: a row for a token the user does not own has no number from dnd5e and gets none; its total still applies", async () => {
  const msg = healCard("healCard00000018");
  const c = card(msg, [MR, CV], { bare: [CV] });
  c.built();
  const [, cv] = c.inputs();
  cv.value = "5";
  dispatch(cv, "input");
  assert.deepEqual(c.values(), ["-8"], "the one number is Marrith's");
  reset();
  await c.apply();
  assert.deepEqual(ops("relay")[0].data.rows, [{ uuid: CV, multiplier: 1, amount: 5 }]);
});

test("Apply as a player: the owned row lands here with the typed total; the row they do not own goes to the GM as one query; no toast", async () => {
  const msg = healCard("healCard00000003");
  const c = card(msg, [MR, CV], { multipliers: { [CV]: 0.5 } });
  c.built();
  const [mr] = c.inputs();
  mr.value = "12";
  dispatch(mr, "input");
  reset();
  ctx.wizard.system.attributes.hp.value = 25;
  const ev = await c.apply();
  assert.deepEqual([ev.defaultPrevented, ev.stopped], [true, true], "dnd5e's own handler on the button never runs");
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.damages.map(d => d.value), c.multiplier, c.originatingMessage]),
    [[ctx.wizard.uuid, [12], 1, msg.id]]);
  const [relay] = ops("relay");
  assert.equal(relay.user, PLAYER_ID);
  assert.deepEqual(relay.data.rows, [{ uuid: CV, multiplier: 0.5 }], "no typed total, no pill choices: the row carries neither");
  assert.equal(relay.data.messageId, msg.id);
  assert.match(relay.data.requestId, /^[A-Za-z0-9]{16}$/);
  assert.deepEqual(ops("notify"), []);
  // G2: every Apply is stamped, with this client's own rows for the "Applied by" line; a card with
  // recorded targets keeps them (no system.targets write).
  const updates = ops("update");
  assert.equal(updates.length, 1);
  assert.equal("system.targets" in updates[0].changes, false, "a card with recorded targets is not rewritten");
  const entry = Object.entries(updates[0].changes).find(([k]) => k.startsWith(`flags.${MODULE}.appliedLog.`))?.[1];
  assert.deepEqual(entry.rows.map(r => [r.token, r.delta, r.pc]), [[MR, -12, true]], "Marrith's own row; Caven's is the GM's to log");
  assert.equal(P.amounts.has(msg.id), false, "the typed totals are spent");
  assert.equal(ops("query")[0].name, RELAY);
});

test("Apply as a player: the pill menu's ignore / downgrade choices cross to the GM as plain data", async () => {
  const msg = healCard("healCard00000019");
  const c = card(msg, [MR, CV]);
  c.el.getMergedOptions = uuid => (uuid === CV
    ? { multiplier: 2, ignore: { immunity: new Set(["fire"]), resistance: true, vulnerability: new Set() }, downgrade: new Set(["cold"]), originatingMessage: msg }
    : { multiplier: 1, originatingMessage: msg });
  c.built();
  reset();
  await c.apply();
  assert.deepEqual(ops("relay")[0].data.rows, [{ uuid: CV, multiplier: 2, options: { ignore: { immunity: ["fire"], resistance: true }, downgrade: ["cold"] } }]);
});

test("Apply as a player with no GM connected: the owned row still lands, the other gets the one toast (and the tray folds first)", async () => {
  const msg = healCard("healCard00000004");
  const c = card(msg, [MR, CV]);
  c.built();
  reset();
  game.users.get(GM_ID).active = false;
  try {
    await c.apply();
  } finally {
    game.users.get(GM_ID).active = true;
  }
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [ctx.wizard.uuid]);
  assert.deepEqual(ops("notify").map(c => [c.level, c.message]), [["warn", game.i18n.format("PENTARYN_AOE.Apply.NoGm", { names: "Caven" })]]);
  assert.ok(lines().some(l => l.startsWith(`warn: ${MODULE} | apply relay`)));
});

test("F3: the GM's client refusing or failing the relay is logged AND the player gets one toast naming the reason; a ×0 row goes nowhere; a losing tab's claimed:false is not a failure", async () => {
  const msg = healCard("healCard00000005");
  const c = card(msg, [MR, CV, G1], { multipliers: { [G1]: 0 } });
  c.built();
  reset();
  relayAnswer = () => ({ ok: false, code: "REFUSED", reason: "not yours" });
  try {
    await c.apply();
    assert.deepEqual(ops("relay")[0].data.rows.map(r => r.uuid), [CV]);
    assert.deepEqual(ops("notify").map(c => [c.level, c.message]), [["warn", game.i18n.format("PENTARYN_AOE.Apply.RelayFailed", { names: "Caven", reason: "not yours" })]], "silence read as applied at the table: a refusal is said once");
    assert.ok(lines().some(l => l.startsWith(`warn: ${MODULE} | apply relay refused`)));
    reset();
    relayAnswer = () => ({ ok: false, code: "NOT_FOUND" });
    await c.apply();
    assert.deepEqual(ops("notify").map(c => c.message), [game.i18n.format("PENTARYN_AOE.Apply.RelayFailed", { names: "Caven", reason: "NOT_FOUND" })], "no reason text: the code");
    reset();
    relayAnswer = () => { throw new Error("INTERNAL: boom"); };
    await c.apply();
    assert.deepEqual(ops("notify").map(c => c.message), [game.i18n.format("PENTARYN_AOE.Apply.RelayFailed", { names: "Caven", reason: "INTERNAL: boom" })], "a GM handler that threw is not 'no GM', but it is said");
    assert.ok(lines().some(l => l.startsWith(`warn: ${MODULE} | apply relay`)));
    reset();
    relayAnswer = () => ({ ok: true, applied: [], claimed: false });
    await c.apply();
    assert.deepEqual(ops("notify"), [], "the other GM tab lands it: nothing to say");
  } finally {
    relayAnswer = data => ({ ok: true, applied: data.rows.map(r => r.uuid) });
  }
});

test("the GM's card listing two PCs (a breath weapon): the player's own row lands, the ally's row is skipped silently — no rows relayed, no toast", async () => {
  const msg = healCard("healCard00000020", { author: GM_ID, isAuthor: false, type: "fire", total: 8 });   // no associated actor: the dragon is nobody's
  const c = card(msg, [MR, CV], { bare: [CV] });
  c.built();
  reset();
  await c.apply();
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [ctx.wizard.uuid]);
  assert.deepEqual(ops("notify"), []);
  // G2: the player may not write the GM's card, so the one query is log-only: no rows, Marrith's landed row
  const [relayed, ...more] = ops("relay");
  assert.equal(more.length, 0);
  assert.deepEqual(relayed.data.rows, [], "the ally's row is not relayed");
  assert.deepEqual(relayed.data.landed.map(r => [r.token, r.delta]), [[MR, -8]]);
  reset();
  const result = await P.applyCard(msg, c.el);
  assert.deepEqual([result.local, result.relay, result.skipped], [[MR], [], [CV]], "the same press, as the function reports it");
  assert.deepEqual(ops("update"), [], "not the author: the card is not written");
});

test("the rows dnd5e lists are the rows Apply hits: selected rows shown on an untargeted card win over targets the player also holds", async () => {
  const msg = healCard("healCard00000006", { targets: [] });
  const c = card(msg, [G1], { mode: "selected", multiplier: 0.5, bare: [G1] });   // dnd5e lists the selected goblin
  c.built();
  player.targets = new Set([tokMr]);
  reset();
  try {
    await c.apply();
  } finally {
    player.targets = new Set();
  }
  assert.deepEqual(ops("applyDamage"), [], "Marrith is targeted but not listed: nothing lands on her");
  assert.deepEqual(ops("relay")[0].data.rows, [{ uuid: G1, multiplier: 0.5 }], "the listed goblin is the row (the author may relay)");
  assert.deepEqual(msg.system.targets, [], "no late targets were recorded: the card still shows what was applied");
  assert.deepEqual(msg.flags[MODULE].applied.targets, [G1], "an untargeted card is stamped applied, so late targets stop following it");
});

test("late targets at Apply time: dnd5e lists nobody on an untargeted card and the player holds targets → those targets, at the tray's multiplier; the card then records them", async () => {
  const msg = healCard("healCard00000021", { targets: [] });
  const c = card(msg, [], { mode: "selected", multiplier: 0.5 });   // "No targets"
  c.built();
  assert.equal(c.inputs().length, 0);
  player.targets = new Set([tokMr]);
  reset();
  try {
    await c.apply();
  } finally {
    player.targets = new Set();
  }
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.damages.map(d => d.value), c.multiplier]), [[ctx.wizard.uuid, [8], 0.5]]);
  assert.deepEqual(ops("relay"), []);
  assert.deepEqual(msg.system.targets.map(t => [t.token, t.actor, t.name]), [[MR, ctx.wizard.uuid, "Marrith"]]);
  assert.deepEqual(Object.keys(msg.flags[MODULE].applied), ["at", "by", "targets"]);
  assert.deepEqual(msg.flags[MODULE].applied.targets, [MR]);
});

test("late targets at Apply time: a GM with nothing selected but a stale target gets dnd5e's empty list, nothing lands; a card that recorded targets never falls back", async () => {
  F.become({ userId: GM_ID });
  const gmCard = healCard("healCard00000022", { targets: [], author: GM_ID, isAuthor: true });
  const c = card(gmCard, [], { mode: "selected" });
  c.built();
  game.user.targets = new Set([tokCv]);
  reset();
  try {
    await c.apply();
  } finally {
    game.user.targets = new Set();
    F.become({ userId: PLAYER_ID });
  }
  assert.deepEqual([ops("applyDamage"), ops("relay"), ops("update")], [[], [], []], "nothing landed, so the card is not stamped applied either");
  assert.deepEqual(gmCard.system.targets, []);
  const msg = healCard("healCard00000023");   // recorded Marrith and Caven; the user switched to selected and selected nobody
  const c2 = card(msg, [], { mode: "selected" });
  c2.built();
  player.targets = new Set([tokMr]);
  reset();
  try {
    await c2.apply();
  } finally {
    player.targets = new Set();
  }
  assert.deepEqual([ops("applyDamage"), ops("relay"), ops("update")], [[], [], []]);
});

test("0.6.4 area targets: a save spell's card the GM resolved off an area flips dnd5e's 'selected' memory to the recorded rows, once per message; a card the module did not fill stays as dnd5e left it", async () => {
  const stamped = healCard("healCard00000031", { author: GM_ID, isAuthor: false, type: "fire", targets: [desc(tokG1, ctx.g1), desc(tokCv, ctx.caven)], flags: { [MODULE]: { areaTargets: true, resolution: { rows: [] } } } });
  const c = card(stamped, [G1, CV], { mode: "selected", bare: [G1, CV] });
  c.built();
  assert.equal(c.recorded.targetingMode, "targeted", "the area's creatures, not the GM's selection");
  c.recorded.targetingMode = "selected";
  c.built();
  assert.equal(c.recorded.targetingMode, "selected", "the user's own switch back is respected on this element");
  // the card re-renders on the next write (a save, a tick, an apply): a fresh element that dnd5e brings up
  // "selected" again from the message's _targetState — the user's switch back is kept, not flipped again
  const again = card(stamped, [G1, CV], { mode: "selected", bare: [G1, CV] });
  again.built();
  assert.equal(again.recorded.targetingMode, "selected", "once per message, not once per rendered element");
  // a different stamped message still gets its one flip
  const second = healCard("healCard00000038", { author: GM_ID, isAuthor: false, type: "fire", targets: [desc(tokG1, ctx.g1), desc(tokCv, ctx.caven)], flags: { [MODULE]: { areaTargets: true, resolution: { rows: [] } } } });
  const c4 = card(second, [G1, CV], { mode: "selected", bare: [G1, CV] });
  c4.built();
  assert.equal(c4.recorded.targetingMode, "targeted");
  const plain = healCard("healCard00000032", { author: GM_ID, isAuthor: false, type: "fire", targets: [desc(tokG1, ctx.g1), desc(tokCv, ctx.caven)], flags: { [MODULE]: { resolution: { rows: [] } } } });
  const c2 = card(plain, [G1, CV], { mode: "selected", bare: [G1, CV] });
  c2.built();
  assert.equal(c2.recorded.targetingMode, "selected", "a resolution alone is not a stamp");
  const bare = healCard("healCard00000033", { targets: [desc(tokG1, ctx.g1), desc(tokCv, ctx.caven)] });
  const c3 = card(bare, [G1, CV], { mode: "selected", bare: [G1, CV] });
  c3.built();
  assert.equal(c3.recorded.targetingMode, "selected");
});

test("late targets as they are targeted: the player's newest own card with no targets is filled, once per burst; the card is left alone once applied", async () => {
  const older = healCard("healCard00000007", { targets: [], at: Date.now() - 11 * 60_000 });   // outside the window
  const msg = healCard("healCard00000008", { targets: [], at: Date.now() - 1000 });
  reset();
  player.targets = new Set([tokCv]);
  F.fire("targetToken", player, tokCv, true);
  F.fire("targetToken", player, tokCv, true);
  await advance(200);
  assert.deepEqual(ops("update").map(c => c.uuid), [msg.uuid], "one write for the burst, the newest card only");
  assert.deepEqual(msg.system.targets.map(t => [t.token, t.name]), [[CV, "Caven"]]);
  assert.equal(msg.flags[MODULE].lateTargets, true);
  assert.deepEqual(older.system.targets, []);
  assert.ok(lines().some(l => l.startsWith(`info: ${MODULE} | late targets`)));
  // the same targets again: nothing to write
  reset();
  F.fire("targetToken", player, tokCv, true);
  await advance(200);
  assert.deepEqual(ops("update"), []);
  // retargeting still follows the same card (it is the late-targets card) until it is applied
  player.targets = new Set([tokMr]);
  F.fire("targetToken", player, tokMr, true);
  await advance(200);
  assert.deepEqual(msg.system.targets.map(t => t.token), [MR]);
  // dnd5e remembered "selected" for this card: the first build flips it to the recorded targets, once
  const c = card(msg, [MR], { mode: "selected" });
  c.built();
  assert.equal(c.recorded.targetingMode, "targeted");
  c.recorded.targetingMode = "selected";
  c.built();
  assert.equal(c.recorded.targetingMode, "selected", "the user's own switch back is respected");
  reset();
  await c.apply();
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [ctx.wizard.uuid]);
  assert.equal(typeof msg.flags[MODULE].applied?.at, "number", "a late-targets card is stamped applied");
  reset();
  player.targets = new Set([tokCv]);
  F.fire("targetToken", player, tokCv, true);
  await advance(200);
  player.targets = new Set();
  assert.deepEqual(ops("update"), [], "applied: it no longer follows (and the older card is past the window)");
  assert.deepEqual(msg.system.targets.map(t => t.token), [MR]);
});

test("0.6.4 review: once the GM's resolve has stamped the area into the player's card, their retargeting no longer rewrites system.targets — even on a card late targets had filled first", async () => {
  // the player targeted a goblin before the stamp landed (lateTargets), then the GM's resolve wrote the area
  const stamped = healCard("healCard00000035", { type: "fire", targets: [desc(tokG1, ctx.g1), desc(tokCv, ctx.caven)], at: Date.now() - 1000,
    flags: { [MODULE]: { lateTargets: false, areaTargets: true, resolution: { rows: [] } } } });
  const lateThenStamped = healCard("healCard00000036", { type: "fire", targets: [desc(tokG1, ctx.g1)], at: Date.now() - 500,
    flags: { [MODULE]: { lateTargets: true, areaTargets: true, resolution: { rows: [] } } } });
  reset();
  player.targets = new Set([tokMr]);
  F.fire("targetToken", player, tokMr, true);
  await advance(200);
  assert.deepEqual(ops("update"), [], "neither card follows: the area's creatures are its rows");
  assert.deepEqual(stamped.system.targets.map(t => t.token), [G1, CV]);
  assert.deepEqual(lateThenStamped.system.targets.map(t => t.token), [G1]);
  // the same player's fresh untargeted card is still followed, so late targets as such are intact
  const open = healCard("healCard00000037", { targets: [], at: Date.now() - 100 });
  F.fire("targetToken", player, tokMr, true);
  await advance(200);
  assert.deepEqual(ops("update").map(c => c.uuid), [open.uuid]);
  assert.deepEqual(open.system.targets.map(t => t.token), [MR]);
  player.targets = new Set();
});

test("late targets: another user's targets, a GM, a card with targets, a card outside the window, or the setting off → nothing", async () => {
  const msg = healCard("healCard00000009", { targets: [], at: Date.now() - 1000 });
  reset();
  player.targets = new Set([tokCv]);
  F.fire("targetToken", other, tokCv, true);
  await advance(200);
  assert.deepEqual(ops("update"), [], "not this user's change");
  await game.settings.set(MODULE, "applyFromCard", false);
  reset();
  F.fire("targetToken", player, tokCv, true);
  await advance(200);
  assert.deepEqual(ops("update"), []);
  await game.settings.set(MODULE, "applyFromCard", true);
  F.become({ userId: GM_ID });
  const gmCard = healCard("healCard00000010", { targets: [], author: GM_ID, isAuthor: true, at: Date.now() - 1000 });
  game.user.targets = new Set([tokCv]);
  reset();
  F.fire("targetToken", game.user, tokCv, true);
  await advance(200);
  game.user.targets = new Set();
  F.become({ userId: PLAYER_ID });
  assert.deepEqual(ops("update"), [], "a GM's untargeted card keeps dnd5e's selected-tokens fallback");
  assert.deepEqual(gmCard.system.targets, []);
  assert.equal(msg.flags[MODULE]?.lateTargets, undefined);
  player.targets = new Set();
});

test("setting off: the card is not wired; a card decorated twice is wired once; a deleted card drops its typed totals", async () => {
  await game.settings.set(MODULE, "applyFromCard", false);
  const off = card(healCard("healCard00000011"), [MR]);
  off.built();
  assert.equal(off.inputs().length, 0);
  assert.equal(off.el.listeners.length, 0);
  await game.settings.set(MODULE, "applyFromCard", true);
  const msg = healCard("healCard00000012");
  const c = card(msg, [MR]);
  F.fire("dnd5e.renderChatMessage", msg, c.host);
  assert.equal(c.el.listeners.length, 3);
  c.built();
  const [mr] = c.inputs();
  mr.value = "3";
  dispatch(mr, "input");
  assert.equal(P.amounts.has(msg.id), true);
  F.fire("deleteChatMessage", msg, {}, PLAYER_ID);
  assert.equal(P.amounts.has(msg.id), false);
  const usage = W.message({ type: "usage", author: PLAYER_ID });
  const plain = root(`<div class="message-content"><p>x</p></div>`);
  F.fire("dnd5e.renderChatMessage", usage, plain);
  assert.equal(plain.querySelector(".pa-card-amount"), null);
});

/* ── 0.6.2: the healing card (playtest 2026-11-07: Heal, Healing Word on Caven, a healing-type message) ── */

test("F2: a healing roll's card is dnd5e type `healing`, and is wired like a damage card: every row gets a total, the row the player does not own included; a usage card is not", () => {
  const msg = healCard("healCard00000030", { targets: [desc(tokCv, ctx.caven)] });   // Healing Word at Caven, whom this player does not own
  assert.equal(msg.type, "healing");
  const c = card(msg, [CV], { bare: [CV] });
  assert.equal(c.el.listeners.length, 3, "the card is wired on render");
  c.built();
  assert.equal(c.inputs().length, 1, "the unowned heal row carries a total");
  assert.equal(c.inputs()[0].value, "8");
  assert.deepEqual(c.values(), [], "dnd5e gives an unowned row no number, and none is added");
  const dmg = healCard("healCard00000031", { type: "fire" });
  assert.equal(dmg.type, "damage");
  const d = card(dmg, [MR, CV], { bare: [CV] });
  d.built();
  assert.equal(d.inputs().length, 2, "a damage card, as before");
  const usage = W.message({ id: "healCard00000032", type: "usage", author: PLAYER_ID });
  const u = card(usage, [CV]);
  assert.equal(u.el.listeners.length, 0, "not a damage or healing card: untouched");
});

test("F3: Apply on a healing card: the unowned row is relayed to the GM, who applies it as healing; the owned row heals here", async () => {
  const msg = healCard("healCard00000033", { targets: [desc(tokMr, ctx.wizard), desc(tokCv, ctx.caven)] });
  const c = card(msg, [MR, CV], { bare: [CV] });
  c.built();
  reset();
  const ev = await c.apply();
  assert.deepEqual([ev.defaultPrevented, ev.stopped], [true, true], "the press is the module's, not dnd5e's silent skip of the unowned row");
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.damages.map(d => [d.value, d.type])]), [[ctx.wizard.uuid, [[8, "healing"]]]]);
  assert.deepEqual(ops("relay")[0].data.rows, [{ uuid: CV, multiplier: 1 }]);
  assert.deepEqual(ops("notify"), []);
  // the GM side of the same press, on a healing-type card
  F.become({ userId: GM_ID });
  reset();
  ctx.caven.system.attributes.hp.value = 20;
  const pending = P.applyRelay({ messageId: msg.id, requestId: "req0000000000030", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player });
  await advance(800);
  assert.deepEqual(await pending, { ok: true, applied: [CV] }, "a healing message is a card the relay accepts (0.6.1 answered NOT_FOUND)");
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.damages.map(d => [d.value, d.type]), c.multiplier, c.originatingMessage]), [[ctx.caven.uuid, [[8, "healing"]], 1, msg.id]]);
  F.become({ userId: PLAYER_ID });
});

test("F1: late targets follow a healing card that recorded none (Heal cast with nobody targeted, then Caven targeted): the card is filled, its tray flips to the recorded targets, the new row carries a total, and Apply relays it", async () => {
  const msg = healCard("healCard00000034", { targets: [], at: Date.now() - 2000 });
  assert.equal(msg.type, "healing");
  reset();
  player.targets = new Set([tokCv]);
  F.fire("targetToken", player, tokCv, true);
  await advance(200);
  assert.deepEqual(ops("update").map(c => c.uuid), [msg.uuid], "the healing card is the one filled");
  assert.deepEqual(msg.system.targets.map(t => [t.token, t.name]), [[CV, "Caven"]]);
  assert.equal(msg.flags[MODULE].lateTargets, true);
  // dnd5e re-renders the card remembering "selected" (it listed the selected caster); the build flips it once
  const c = card(msg, [CV], { mode: "selected", bare: [CV] });
  c.built();
  assert.equal(c.recorded.targetingMode, "targeted");
  assert.equal(c.inputs().length, 1, "Caven's row carries a total");
  reset();
  await c.apply();
  player.targets = new Set();
  assert.deepEqual(ops("applyDamage"), [], "Caven is not the player's: nothing lands here");
  assert.deepEqual(ops("relay")[0].data.rows, [{ uuid: CV, multiplier: 1 }]);
  assert.equal(typeof msg.flags[MODULE].applied?.at, "number", "stamped applied: late targets stop following it");
});

/* ── the GM side ─────────────────────────────────────────────────────────────────────────────── */

test("the GM owns everything: every row lands locally, nothing is relayed; a save spell's card (Part B resolution) gets no totals on dnd5e's tray for the GM", async () => {
  F.become({ userId: GM_ID });
  const msg = healCard("healCard00000013", { author: GM_ID, isAuthor: true });
  tokCv.ownership = { default: 0, [GM_ID]: 3 };
  const c = card(msg, [MR, CV]);
  c.built();
  assert.equal(c.inputs().length, 2, "a plain card: the GM types totals too");
  reset();
  await c.apply();
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [ctx.wizard.uuid, ctx.caven.uuid]);
  assert.deepEqual(ops("relay"), []);
  const saveCard = healCard("healCard00000024", { author: GM_ID, isAuthor: true, type: "fire", flags: { [MODULE]: { resolution: { rows: [] } } } });
  const c2 = card(saveCard, [MR, CV]);
  c2.built();
  assert.equal(c2.inputs().length, 0, "the module's own tray under this card is the one the GM applies from");
  delete tokCv.ownership;
  F.become({ userId: PLAYER_ID });
  const c3 = card(saveCard, [MR, CV]);
  c3.built();
  assert.equal(c3.inputs().length, 2, "a player sees the totals on the same card");
});

test("0.6.4: a player's Apply on a save spell's card relays nothing — the GM's tray applies it; the owned row still lands here; one info toast names the rest", async () => {
  F.become({ userId: PLAYER_ID });
  const saveCard = game.messages.get("healCard00000024");   // the GM's card, a Part B resolution; the player owns its actor (Marrith)
  const c = card(saveCard, [MR, CV], { bare: [CV] });
  c.built();
  reset();
  ctx.wizard.system.attributes.hp.value = 25;
  const ev = await c.apply();
  assert.deepEqual([ev.defaultPrevented, ev.stopped], [true, true]);
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [ctx.wizard.uuid], "Marrith is the player's own: lands locally, as today");
  assert.deepEqual(ops("relay"), [], "Caven is not relayed: the GM's Apply N would land the damage twice");
  assert.deepEqual(ops("notify").map(n => [n.level, n.message]), [["info", game.i18n.format("PENTARYN_AOE.Apply.GmTray", { names: "Caven" })]]);
  // a plain card (no resolution) still relays
  const plain = healCard("healCard00000034");
  const c2 = card(plain, [MR, CV]);
  c2.built();
  reset();
  await c2.apply();
  assert.deepEqual(ops("relay").map(r => r.data.rows.map(x => x.uuid)), [[CV]]);
  assert.deepEqual(ops("notify"), []);
});

test("applyRelay (active GM): the card's damage, the sender's multiplier, typed total and pill choices; a token that is not there or ×0 is skipped; one audit line", async () => {
  F.become({ userId: GM_ID });
  const msg = healCard("healCard00000014");
  reset();
  ctx.caven.system.attributes.hp.value = 30;
  const pending = P.applyRelay({ messageId: msg.id, requestId: "req0000000000001", rows: [
    { uuid: CV, multiplier: 0.5, amount: 10, options: { ignore: { immunity: ["fire"], resistance: true, junk: 3 }, downgrade: ["cold", 7] } },
    { uuid: "Scene.FireScene0000001.Token.missingToken0001", multiplier: 1 }, { uuid: MR, multiplier: 0 },
  ] }, { user: player });
  await advance(800);                                  // the request claim settles
  const out = await pending;
  assert.deepEqual(out, { ok: true, applied: [CV] });
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.damages.map(d => [d.value, d.type]), c.multiplier, c.originatingMessage]), [[ctx.caven.uuid, [[10, "healing"]], 0.5, msg.id]]);
  assert.equal(msg.flags[MODULE].claims["relay-req0000000000001"], game.socket.id);
  assert.ok(lines().some(l => l.startsWith(`info: ${MODULE} | apply relay`)));
  F.become({ userId: PLAYER_ID });
});

test("applyRelay: the other GM tab loses the claim and applies nothing", async () => {
  F.become({ userId: GM_ID, socketId: "socket-gm-2" });
  const msg = game.messages.get("healCard00000014");
  reset();
  const out = await P.applyRelay({ messageId: msg.id, requestId: "req0000000000001", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player });
  assert.deepEqual(out, { ok: true, applied: [], claimed: false });
  assert.deepEqual(ops("applyDamage"), []);
  F.become({ userId: PLAYER_ID, socketId: "socket-gm-1" });
});

test("applyRelay refuses: a sender who is neither the card's author nor its actor's owner; not a damage card; no rows; no requestId; the setting off; not a GM client", async () => {
  F.become({ userId: GM_ID });
  const msg = healCard("healCard00000015");
  reset();
  const refused = await P.applyRelay({ messageId: msg.id, requestId: "req0000000000002", rows: [{ uuid: CV, multiplier: 1 }] }, { user: other });
  assert.deepEqual([refused.ok, refused.code], [false, "REFUSED"]);
  assert.deepEqual(ops("applyDamage"), []);
  assert.ok(lines().some(l => l.startsWith(`warn: ${MODULE} | apply relay refused`)));
  // the owner of the card's actor may, whoever posted it (the GM's card for the player's summon)
  const gmCard = W.message({ id: "healCard00000016", type: "damage", author: GM_ID, actor: ctx.wizard, system: { targets: [] }, rolls: [{ total: 5, options: { type: "healing" } }] });
  const pending = P.applyRelay({ messageId: gmCard.id, requestId: "req0000000000003", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player });
  await advance(800);
  assert.deepEqual(await pending, { ok: true, applied: [CV] });
  assert.equal((await P.applyRelay({ messageId: ctx.usage.id, requestId: "req0000000000004", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player })).code, "NOT_FOUND");
  assert.equal((await P.applyRelay({ messageId: msg.id, requestId: "req0000000000005", rows: [] }, { user: player })).code, "BAD_ARGS");
  // §5.4 idempotency across GM tabs needs the per-press id: without one nothing is applied
  reset();
  const noId = await P.applyRelay({ messageId: msg.id, rows: [{ uuid: CV, multiplier: 1 }] }, { user: player });
  assert.deepEqual([noId.ok, noId.code], [false, "BAD_ARGS"]);
  assert.equal((await P.applyRelay({ messageId: msg.id, requestId: "not an id!", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player })).code, "BAD_ARGS");
  assert.deepEqual(ops("applyDamage"), []);
  await game.settings.set(MODULE, "applyFromCard", false);
  assert.equal((await P.applyRelay({ messageId: msg.id, requestId: "req0000000000006", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player })).code, "REFUSED");
  await game.settings.set(MODULE, "applyFromCard", true);
  // no sender (the GM's own console) is the GM acting
  const own = P.applyRelay({ messageId: msg.id, requestId: "req0000000000007", rows: [{ uuid: CV, multiplier: 1 }] });
  await advance(800);
  assert.equal((await own).ok, true);
  F.become({ userId: PLAYER_ID });
  assert.equal((await P.applyRelay({ messageId: msg.id, requestId: "req0000000000008", rows: [{ uuid: CV, multiplier: 1 }] }, { user: player })).code, "NOT_GM");
});

test("the kit's registered handler answers NOT_GM on a client that is not the active GM, and runs applyRelay on the active GM", async () => {
  F.become({ userId: PLAYER_ID });
  await assert.rejects(kitHandler({ messageId: "x", rows: [] }, { user: player }), /NOT_GM/);
  F.become({ userId: GM_ID });
  const out = await kitHandler({ messageId: "healCard00000015", rows: [] }, { user: player });
  assert.deepEqual([out.ok, out.code], [false, "BAD_ARGS"]);
  F.become({ userId: PLAYER_ID });
});

test("uninstall clears the session state", () => {
  P.amounts.set("x", new Map());
  game.pentaryn.aoe.uninstall();
  assert.equal(P.amounts.size, 0);
});
