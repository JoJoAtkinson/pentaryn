// G2 (feedback SvOaxr, plan feedback-triage-2026-11-19 §H2): every Apply is recorded on the card as one
// `flags.pentaryn-aoe.appliedLog` entry (who pressed it; per token, the HP change and whether a player
// owns it), and the card renders "Applied by Talo → Talo (+11)" under its tray. Who reads it is the
// world setting showAppliedBy (gm | owners | all, default owners); a player never reads a monster's row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE, GM_ID, PLAYER_ID } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { root } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";
import { appliedByVisible, appliedByLines, fmtDelta, APPLIED_BY_MODES } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const ctx = fireball(W, F);
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const logOf = id => Object.values(game.messages.get(id)?.flags?.[MODULE]?.appliedLog ?? {});

/* ── the pure rules ──────────────────────────────────────────────────── */

test("appliedByVisible: the GM always; a player never with gm, on their own or owned-row cards with owners, always with all", () => {
  assert.deepEqual(APPLIED_BY_MODES, ["gm", "owners", "all"]);
  assert.equal(appliedByVisible("gm", { isGM: true }), true);
  assert.equal(appliedByVisible("gm", { isAuthor: true, ownsRow: true }), false);
  assert.equal(appliedByVisible("owners", { isAuthor: true }), true);
  assert.equal(appliedByVisible("owners", { ownsRow: true }), true);
  assert.equal(appliedByVisible("owners", {}), false);
  assert.equal(appliedByVisible("all", {}), true);
  assert.equal(appliedByVisible("bogus", {}), false, "an unknown mode reads as owners");
  assert.equal(appliedByVisible("bogus", { isAuthor: true }), true);
});

test("appliedByLines: oldest first; a player never reads a monster's row unless they own its token; empty entries dropped", () => {
  const log = {
    b: { at: 20, by: "gm", byName: "Gamemaster", rows: [{ token: "T.g1", name: "Goblin 1", delta: -14, pc: false }, { token: "T.cv", name: "Caven", delta: -7, pc: true }] },
    a: { at: 10, by: "pl", byName: "Talo", rows: [{ token: "T.talo", name: "Talo", delta: 11, pc: true }] },
    c: { at: 30, by: "gm", byName: "Gamemaster", rows: [{ token: "T.g2", name: "Goblin 2", delta: -3, pc: false }] },
    junk: null,
  };
  assert.deepEqual(appliedByLines(log, { isGM: true }).map(l => [l.by, l.rows.map(r => `${r.name} ${r.delta}`)]), [
    ["Talo", ["Talo 11"]], ["Gamemaster", ["Goblin 1 -14", "Caven -7"]], ["Gamemaster", ["Goblin 2 -3"]],
  ]);
  assert.deepEqual(appliedByLines(log, { isGM: false }).map(l => l.rows.map(r => r.name)), [["Talo"], ["Caven"]]);
  assert.deepEqual(appliedByLines(log, { owns: u => u === "T.g2" }).map(l => l.rows.map(r => r.name)), [["Talo"], ["Caven"], ["Goblin 2"]], "a summon the player owns");
  assert.deepEqual(appliedByLines(null), []);
  assert.deepEqual([fmtDelta(11), fmtDelta(-14), fmtDelta(0)], ["+11", "-14", "0"]);
});

/* ── the writes ──────────────────────────────────────────────────────── */

test("the GM tray's Apply writes one entry: the GM, each row's token, the HP change, pc for player rows", async () => {
  const msg = damage(W, ctx, { id: "dmgAppliedBy0001", total: 6, hook: true });
  await advance(800);
  await flush(8);
  const res = resOf(msg.id);
  const g1 = res.rows.find(r => r.id === IDS.g1);
  await S.resolve.applyRows(msg.id, [IDS.g1]);
  const [entry, ...more] = logOf(msg.id);
  assert.equal(more.length, 0);
  assert.deepEqual([entry.by, entry.byName], [GM_ID, "Gamemaster"]);
  assert.deepEqual(entry.rows, [{ token: ctx.s.tokens.get(IDS.g1).uuid, name: "Goblin 1", delta: -Math.floor(6 * g1.multiplier), pc: false }]);
});

test("applyRelay (the GM's side) logs the rows it landed, named for the sender", async () => {
  const card = W.message({
    id: "healAppliedBy001", type: "healing", author: PLAYER_ID, rolls: [{ total: 9, options: { type: "healing" } }],
    system: { targets: [] }, speaker: { scene: ctx.s.id, actor: ctx.wizard.id },
  });
  ctx.caven.system.attributes.hp.value = 10;
  const pending = S.apply.applyRelay({ messageId: card.id, requestId: "reqAppliedBy0001", rows: [{ uuid: ctx.s.tokens.get(IDS.cv).uuid, multiplier: 1 }] }, { user: game.users.get(PLAYER_ID) });
  await advance(800);                                  // the request claim settles
  const out = await pending;
  assert.equal(out.ok, true);
  const [entry] = logOf(card.id);
  assert.equal(entry.by, PLAYER_ID);
  assert.equal(entry.rows[0].name, "Caven");
  assert.equal(entry.rows[0].pc, true);
});

test("a non-author's Apply on their own token: their client cannot write the card, so the GM writes the entry, named for them", async () => {
  // Caven's player presses Apply on another player's Cure Wounds card and lands it on Caven
  const card = W.message({
    id: "healAppliedBy005", type: "healing", author: "plUser0000000009", isAuthor: false, rolls: [{ total: 11, options: { type: "healing" } }],
    system: { targets: [] }, speaker: { scene: ctx.s.id, actor: ctx.wizard.id },
  });
  const cv = ctx.s.tokens.get(IDS.cv);
  const ownership = cv.ownership;
  cv.ownership = { default: 0, [PLAYER_ID]: 3 };       // the token's ownership follows its actor (the player's)
  ctx.caven.system.attributes.hp.value = 10;
  const sent = [];
  const handler = CONFIG.queries[`${MODULE}.applyRelay`];
  CONFIG.queries[`${MODULE}.applyRelay`] = async data => {
    sent.push(JSON.parse(JSON.stringify(data)));
    F.become({ userId: GM_ID });                       // the active GM's client answers
    try { return await handler(data, { user: game.users.get(PLAYER_ID) }); } finally { F.become({ userId: PLAYER_ID }); }
  };
  const host = root(`<div class="message-content"><damage-application><div class="card-tray damage-tray"><recorded-targets><ul class="targets unlist pills"><li><target-pill><label>${cv.uuid}</label><datalist><option value="${cv.uuid}" data-checked>${cv.uuid}</option></datalist></target-pill></li></ul></recorded-targets><button class="apply-button" type="button">Apply</button></div></damage-application></div>`);
  const el = host.querySelector("damage-application");
  el.multiplier = 1;
  el.getMergedOptions = () => ({ multiplier: 1, originatingMessage: card });
  F.become({ userId: PLAYER_ID });
  try {
    const pending = S.apply.applyCard(card, el);
    await advance(800);                                // the request claim settles
    const result = await pending;
    assert.deepEqual([result.local, result.relay], [[cv.uuid], []], "Caven is the player's: applied on their own client, nothing to relay");
  } finally {
    CONFIG.queries[`${MODULE}.applyRelay`] = handler;
    cv.ownership = ownership;
    F.become({ userId: GM_ID });
  }
  assert.equal(sent.length, 1, "one log-only query");
  assert.deepEqual(sent[0].rows, []);
  const [entry, ...more] = logOf(card.id);
  assert.equal(more.length, 0);
  assert.deepEqual([entry.by, entry.byName], [PLAYER_ID, game.users.get(PLAYER_ID).name]);
  assert.deepEqual(entry.rows.map(r => [r.token, r.name, r.pc]), [[cv.uuid, "Caven", true]]);
  assert.equal(entry.rows[0].delta, ctx.caven.system.attributes.hp.value - 10, "the HP change the player's client saw");
});

test("applyRelay log-only: rows the sender does not own are dropped; nothing to log and nothing to apply is BAD_ARGS", async () => {
  const card = W.message({
    id: "healAppliedBy006", type: "healing", author: GM_ID, rolls: [{ total: 5, options: { type: "healing" } }],
    system: { targets: [] }, speaker: { scene: ctx.s.id },
  });
  const g1 = ctx.s.tokens.get(IDS.g1);
  const cv = ctx.s.tokens.get(IDS.cv);
  const pending = S.apply.applyRelay({
    messageId: card.id, requestId: "reqAppliedBy0006", rows: [],
    landed: [{ token: g1.uuid, name: "Goblin 1", delta: 5 }, { token: cv.uuid, name: "Forged", delta: 4, pc: false }, { token: cv.uuid, delta: "x" }],
  }, { user: game.users.get(PLAYER_ID) });
  await advance(800);
  const out = await pending;
  assert.equal(out.ok, true, "a log-only request needs no author check: it applies nothing");
  assert.deepEqual(out.applied, []);
  const [entry] = logOf(card.id);
  assert.deepEqual(entry.rows, [{ token: cv.uuid, name: "Caven", delta: 4, pc: true }], "the goblin is not the sender's; name and pc are read here");
  const bad = await S.apply.applyRelay({ messageId: card.id, requestId: "reqAppliedBy0007", rows: [] }, { user: game.users.get(PLAYER_ID) });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "BAD_ARGS");
});

/* ── the line ────────────────────────────────────────────────────────── */

function rendered(message) {
  const host = root(`<div class="message-content"><div class="chat-card">card</div><damage-application></damage-application></div>`);
  S.apply.renderAppliedBy(message, host);
  return host;
}
const logged = (id, author, rows) => W.message({
  id, type: "healing", author, isAuthor: author === game.user.id, system: { targets: [] },
  flags: { [MODULE]: { appliedLog: { k1: { at: 1, by: PLAYER_ID, byName: "Talo", rows } } } },
});

test("the line sits after dnd5e's tray, names who pressed and who took it; a re-render does not double it", () => {
  const talo = ctx.s.tokens.get(IDS.mr);
  const msg = logged("healAppliedBy002", PLAYER_ID, [{ token: talo.uuid, name: "Talo", delta: 11, pc: true }]);
  const host = rendered(msg);
  S.apply.renderAppliedBy(msg, host);
  const lines = host.querySelectorAll(".pa-applied-by");
  assert.equal(lines.length, 1);
  assert.match(lines[0].outerHTML, /Applied by Talo → Talo \(\+11\)/);
  assert.equal(host.querySelector("damage-application").parent === lines[0].parent, true);
});

test("as a player: owners shows their own card, hides a stranger's card, never shows a monster row; gm hides it; all shows it", async () => {
  const goblin = ctx.s.tokens.get(IDS.g1);
  const caven = ctx.s.tokens.get(IDS.cv);
  const mine = logged("healAppliedBy003", PLAYER_ID, [{ token: goblin.uuid, name: "Goblin 1", delta: -5, pc: false }, { token: caven.uuid, name: "Caven", delta: 4, pc: true }]);
  const theirs = logged("healAppliedBy004", GM_ID, [{ token: caven.uuid, name: "Caven", delta: 4, pc: true }]);
  F.become({ userId: PLAYER_ID });
  try {
    mine.isAuthor = true;
    theirs.isAuthor = false;
    const a = rendered(mine).querySelector(".pa-applied-by");
    assert.ok(a);
    assert.doesNotMatch(a.outerHTML, /Goblin/, "a monster's row is GM data");
    assert.match(a.outerHTML, /Caven \(\+4\)/);
    assert.equal(rendered(theirs).querySelector(".pa-applied-by"), null, "not the player's card, and they own no row on it");
    await game.settings.set(MODULE, "showAppliedBy", "all");
    assert.ok(rendered(theirs).querySelector(".pa-applied-by"));
    await game.settings.set(MODULE, "showAppliedBy", "gm");
    assert.equal(rendered(mine).querySelector(".pa-applied-by"), null);
  } finally {
    F.become({ userId: GM_ID });
    await game.settings.set(MODULE, "showAppliedBy", "owners");
  }
  assert.ok(rendered(theirs).querySelector(".pa-applied-by"), "the GM always");
  assert.match(rendered(mine).querySelector(".pa-applied-by").outerHTML, /Goblin 1 \(-5\)/);
});
