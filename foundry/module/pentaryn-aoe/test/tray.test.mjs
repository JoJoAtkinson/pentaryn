// Part B's tray: the GM-only section on a resolved damage message (HTML pinned byte for byte), its
// listeners, and what a player sees instead (one status line; private NPC saves hidden).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, GM_ID, PLAYER_ID } from "./fixtures/fireball.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";
import { protectRows } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const T = S.tray;
const ctx = fireball(W, F);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const CARD = `<div class="message-content"><div class="chat-card">card</div><section class="icon-row">roll</section><damage-application></damage-application></div>`;

const msg = damage(W, ctx, { id: "dmgTray000000001" });
const base = await S.resolve.resolve(msg.id);
const clone = v => JSON.parse(JSON.stringify(v));

test("trayHTML over the resolution states (golden/tray-html.json)", () => {
  const applied = clone(base);
  applied.rows[0].applied = true;
  applied.rows[0].hp = { before: 7, after: 3 };
  const superseded = { ...clone(base), superseded: true };
  const careful = clone(base);
  protectRows(careful.rows, [IDS.cv], "half");
  careful.careful = { names: ["Caven"], ids: [IDS.cv] };
  const picker = { ...clone(base), regions: [{ id: IDS.region, name: "Fireball" }, { id: "regionOther00001", name: "Fireball <2>" }] };
  const pickerLocked = { ...clone(picker), superseded: true };   // aoe-edge-2: the picker is disabled
  const targets = { ...clone(base), region: null, rows: [] };
  const unknownAbility = { ...clone(base), ability: "str", dc: undefined };
  pinJSON("tray-html", {
    fresh: T.trayHTML(base, msg), applied: T.trayHTML(applied, msg), superseded: T.trayHTML(superseded, msg),
    careful: T.trayHTML(careful, msg), picker: T.trayHTML(picker, msg), pickerLocked: T.trayHTML(pickerLocked, msg), targets: T.trayHTML(targets), unknownAbility: T.trayHTML(unknownAbility),
  }, import.meta.url);
});

test("-4 the Apply count is applicableRows(rows).length", () => {
  assert.match(T.trayHTML(base, msg), /Apply \(2\)|data-pa="apply"/);
  const n = base.rows.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined).length;
  assert.equal(n, 2);
});

test("preview: '—' with no multiplier or no calculateDamage; else calculateDamage with the message as originatingMessage", () => {
  F.calls.length = 0;
  assert.equal(T.preview({ multiplier: null }, base), "—");
  assert.equal(T.preview({ multiplier: 1, actor: "Actor.gone" }, base), "—");
  assert.equal(T.preview({ multiplier: 0.5, actor: ctx.g1.uuid }, base, msg), "14");
  const calc = ctx.g1.calculateDamage;
  ctx.g1.calculateDamage = () => null;
  assert.equal(T.preview({ multiplier: 0.5, actor: ctx.g1.uuid }, base), "—");
  ctx.g1.calculateDamage = () => ({ amount: -4.5 });
  assert.equal(T.preview({ multiplier: 0.5, actor: ctx.g1.uuid }, base), "0");
  ctx.g1.calculateDamage = calc;
});

test("the GM's tray goes right after the native <damage-application>; a re-render replaces it (golden/tray-host.json)", () => {
  const host = root(CARD);
  F.fire("dnd5e.renderChatMessage", msg, host);
  F.fire("dnd5e.renderChatMessage", msg, host);
  const content = host.querySelector(".message-content");
  assert.deepEqual(content.children.map(c => c.localName + (c.className ? `.${c.className}` : "")), ["div.chat-card", "section.icon-row", "damage-application", "section.pentaryn-aoe-tray"]);
  pinJSON("tray-host", host.innerHTML, import.meta.url);
  const bare = root(`<div class="message-content"><p>x</p></div>`);
  F.fire("dnd5e.renderChatMessage", msg, bare);
  assert.equal(bare.querySelector(".message-content").children.at(-1).className, "pentaryn-aoe-tray", "no native tray → appended");
  const plain = root(`<p>none</p>`);
  F.fire("dnd5e.renderChatMessage", W.message({ type: "damage" }), plain);
  assert.equal(plain.querySelector(".pentaryn-aoe-tray"), null, "no resolution → no tray");
});

test("a superseded resolution's tray carries the 'superseded' class", () => {
  const m = W.message({ type: "damage", flags: { [MODULE]: { resolution: { ...clone(base), superseded: true } } } });
  const host = root(CARD);
  F.fire("dnd5e.renderChatMessage", m, host);
  assert.equal(host.querySelector(".pentaryn-aoe-tray").className, "pentaryn-aoe-tray superseded");
});

function trayFor(message) {
  const host = root(CARD);
  F.fire("dnd5e.renderChatMessage", message, host);
  return host.querySelector(".pentaryn-aoe-tray");
}

test("tray changes: tick and multiplier go through setRow; a blank multiplier does nothing; the region picker re-resolves", async () => {
  const tray = trayFor(msg);
  const tick = tray.querySelector(`[data-row="${IDS.g2}"] [data-pa="tick"]`);
  tick.checked = false;
  dispatch(tick, "change");
  await flush();
  assert.equal(resOf(msg.id).rows[1].apply, false);
  const mult = tray.querySelector(`[data-row="${IDS.g2}"] [data-pa="mult"]`);
  mult.value = "2";
  dispatch(mult, "change");
  await flush();
  assert.deepEqual([resOf(msg.id).rows[1].multiplier, resOf(msg.id).rows[1].overridden], [2, true]);
  mult.value = "";
  dispatch(mult, "change");
  await flush();
  assert.equal(resOf(msg.id).rows[1].multiplier, 2);
  const picker = W.message({ id: "dmgTray000000002", type: "damage", system: msg.system, rolls: msg.rolls, speaker: msg.speaker, activity: ctx.activity, flags: { [MODULE]: { resolution: { ...clone(base), regions: [{ id: IDS.region, name: "A" }, { id: "regionOther00001", name: "B" }] } } } });
  const sel = trayFor(picker).querySelector('[data-pa="region"]');
  sel.value = "regionOther00001";
  dispatch(sel, "change");
  await flush(8);
  assert.equal(resOf(picker.id).region, null, "re-resolved against a region that is not on the scene → the targets");
});

test("tray clicks: apply (button disabled), reroll-all, reroll, rollfor, ping; inputs and selects ignored", async () => {
  const fresh = damage(W, ctx, { id: "dmgTray000000003" });
  await S.resolve.resolve(fresh.id);
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;
  const tray = trayFor(fresh);
  const click = async sel => {
    F.calls.length = 0;
    const el = tray.querySelector(sel);
    const ev = dispatch(el.querySelector("i") ?? el, "click");
    await Promise.all(ev.results);
    await flush(8);
    return { el, ev, calls: F.calls.filter(c => ["rollSavingThrow", "applyDamage", "create", "notify"].includes(c.op)).map(c => [c.op, c.actor ?? c.data?.whisper ?? c.level]) };
  };
  const rerollAll = await click('[data-pa="reroll-all"]');
  assert.deepEqual(rerollAll.calls.map(c => c[1]), ["Actor.actGoblin0000001", "Actor.actGoblin0000002", "Actor.actGoblinDead001", "Actor.actGoblinHid0001"]);
  assert.equal(rerollAll.ev.defaultPrevented && rerollAll.ev.stopped, true);
  const reroll = await click(`[data-row="${IDS.g2}"] [data-pa="reroll"]`);
  assert.deepEqual(reroll.calls, [["rollSavingThrow", "Actor.actGoblin0000002"]]);
  const ping = await click('[data-pa="ping"]');
  assert.deepEqual(ping.calls, [["create", [PLAYER_ID]]]);
  const rollfor = await click(`[data-row="${IDS.cv}"] [data-pa="rollfor"]`);
  assert.deepEqual(rollfor.calls, [["rollSavingThrow", "Actor.actCaven00000001"]]);
  await advance(800);                                  // AC-1: the save's matchSave claim settles
  await flush(8);
  const apply = await click('[data-pa="apply"]');
  assert.equal(apply.el.disabled, true);
  assert.deepEqual(apply.calls.map(c => c[1]), ["Actor.actGoblin0000001", "Actor.actGoblin0000002", "Actor.actCaven00000001"], "Caven has a save now (rollfor)");
  F.calls.length = 0;
  const tick = tray.querySelector('[data-pa="tick"]');
  const ev = dispatch(tick, "click");
  assert.equal(ev.defaultPrevented, false, "a click on an input is left to the browser");
  dispatch(tray.querySelector(".pa-name"), "click");
  assert.deepEqual(F.calls.filter(c => c.op === "rollSavingThrow"), []);
});

/* ── players ─────────────────────────────────────────────────────────────────────────────────── */

test("a player: one status line under their own damage card; no tray, no numbers (golden/player-status.json)", () => {
  F.become({ userId: PLAYER_ID });
  const out = {};
  const waiting = W.message({ type: "damage", isAuthor: true, flags: { [MODULE]: { resolution: clone(base) } } });
  const host = root(CARD);
  F.fire("dnd5e.renderChatMessage", waiting, host);
  F.fire("dnd5e.renderChatMessage", waiting, host);
  out.waiting = host.querySelector(".message-content").innerHTML;
  assert.equal(host.querySelectorAll(".pa-status").length, 1);
  assert.equal(host.querySelector(".pentaryn-aoe-tray"), null);
  const done = clone(base);
  for (const r of done.rows) r.applied = r.apply;
  const applied = W.message({ type: "damage", isAuthor: true, flags: { [MODULE]: { resolution: done } } });
  const h2 = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", applied, h2);
  out.applied = h2.innerHTML;
  const sup = W.message({ type: "damage", isAuthor: true, flags: { [MODULE]: { resolution: { ...clone(base), superseded: true } } } });
  const h3 = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", sup, h3);
  out.superseded = h3.innerHTML;
  pinJSON("player-status", out, import.meta.url);
  F.become({ userId: GM_ID });
});

test("a player: not the author, nothing ticked, or playerStatus off → no line", async () => {
  F.become({ userId: PLAYER_ID });
  const cases = [
    W.message({ type: "damage", isAuthor: false, flags: { [MODULE]: { resolution: clone(base) } } }),
    W.message({ type: "damage", isAuthor: true, flags: { [MODULE]: { resolution: { rows: [{ apply: false }] } } } }),
    W.message({ type: "usage", isAuthor: true }),
  ];
  for (const m of cases) {
    const h = root(`<p>x</p>`);
    F.fire("dnd5e.renderChatMessage", m, h);
    assert.equal(h.querySelector(".pa-status"), null);
  }
  await game.settings.set(MODULE, "playerStatus", false);
  const h = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", W.message({ type: "damage", isAuthor: true, flags: { [MODULE]: { resolution: clone(base) } } }), h);
  assert.equal(h.querySelector(".pa-status"), null);
  await game.settings.set(MODULE, "playerStatus", true);
  F.become({ userId: GM_ID });
});

test("a player: the GM's private NPC save is hidden (class pa-hidden-npc-save); a visible one is not", () => {
  F.become({ userId: PLAYER_ID });
  const hiddenSave = W.message({ type: "save", isContentVisible: false, flags: { [MODULE]: { npcSave: true } } });
  const h = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", hiddenSave, h);
  assert.deepEqual([h.hidden, h.className], [true, "pa-hidden-npc-save"]);
  const shown = W.message({ type: "save", isContentVisible: true, flags: { [MODULE]: { npcSave: true } } });
  const h2 = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", shown, h2);
  assert.deepEqual([h2.hidden, h2.className], [false, ""]);
  F.become({ userId: GM_ID });
});

test("the GM never gets the player line or the hidden class", () => {
  const hiddenSave = W.message({ type: "save", isContentVisible: false, flags: { [MODULE]: { npcSave: true } } });
  const h = root(`<p>x</p>`);
  F.fire("dnd5e.renderChatMessage", hiddenSave, h);
  assert.equal(h.hidden, false);
});
