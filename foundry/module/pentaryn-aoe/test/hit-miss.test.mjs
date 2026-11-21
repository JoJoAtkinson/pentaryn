// D2 (feedback ORGqVN, hKDbzi; plan feedback-triage-2026-11-19 §H2): with dnd5e's attackRollVisibility at
// hideAC, an attack card says "— Hit" (blue) or "— Miss" (orange) in its title for one target, "Hit" /
// "Miss" on each pill for several, and a rendered "Miss — no damage" line when every target was missed
// (never a new ChatMessage). The damage card after a hit gets a blue title. Nothing while the visibility
// is "none", nothing with no recorded target, and a re-render never doubles a label.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, MODULE } from "./fixtures/world.mjs";
import { root } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";
import { attackOutcome, shouldAutoDamage } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const { attacks: A } = await seams();
game.settings.register("dnd5e", "attackRollVisibility", { scope: "world", type: String, default: "hideAC" });

/* ── the pure rule ───────────────────────────────────────────────────── */

test("attackOutcome: one target in the title; several per pill; total cover is a miss; hidden or no target says nothing", () => {
  const hit = { isMiss: false, ac: 13 }, miss = { isMiss: true, ac: 18 }, cover = { isMiss: false, ac: null };
  const rows = [
    ["one hit", attackOutcome({ targets: [hit], visible: true })],
    ["one miss", attackOutcome({ targets: [miss], visible: true })],
    ["total cover", attackOutcome({ targets: [cover], visible: true })],
    ["two hits", attackOutcome({ targets: [hit, hit], visible: true })],
    ["mixed", attackOutcome({ targets: [hit, miss], visible: true })],
    ["two misses", attackOutcome({ targets: [miss, miss], visible: true })],
    ["no target", attackOutcome({ targets: [], visible: true })],
    ["hidden", attackOutcome({ targets: [hit], visible: false })],
  ];
  pinJSON("hit-miss", rows, import.meta.url);
  assert.deepEqual(rows.map(([, o]) => o?.outcome ?? null), ["hit", "miss", "miss", "hit", "mixed", "miss", null, null]);
  assert.deepEqual(rows.map(([, o]) => o?.title ?? null), ["hit", "miss", "miss", null, null, null, null, null]);
  assert.deepEqual(rows.map(([, o]) => !!o?.missLine), [false, true, true, false, false, true, false, false]);
  assert.deepEqual(rows.map(([, o]) => !!o?.hit), [true, false, false, true, true, false, false, false]);
  // regression: the auto-damage rule is untouched (a hit still rolls damage)
  assert.equal(shouldAutoDamage({ total: 15, target: 15 }), true);
});

/* ── the render ──────────────────────────────────────────────────────── */

const ACT = "Actor.r.Item.sword.Activity.atk";
function attackCard({ targets, pills = targets.map(t => (t.isMiss ? "data-miss" : "data-hit")), at = Date.now(), visible = true } = {}) {
  const msg = W.message({ type: "attack", system: { activity: { uuid: ACT }, evaluatedTargets: targets }, timestamp: at, isContentVisible: visible });
  const lis = pills.map((a, i) => `<li><target-pill ${a}><label>T${i}</label></target-pill></li>`).join("");
  const html = root(`<div class="message-content"><div class="chat-card"><section class="card-header"><div class="name-stacked"><span class="title">Longsword</span><span class="subtitle">Attack</span></div></section></div><section class="icon-row"><ul class="unlist targets pills">${lis}</ul></section></div>`);
  return { msg, html };
}
const render = (msg, html) => { F.fire("dnd5e.renderChatMessage", msg, html); return html; };
const subtitle = html => html.querySelector(".card-header .subtitle");

test("one target hit: \"Attack — Hit\" in blue; a re-render does not double it", () => {
  const { msg, html } = attackCard({ targets: [{ isMiss: false, ac: 12 }] });
  render(msg, html);
  render(msg, html);
  const labels = html.querySelectorAll(".pa-hit-label");
  assert.equal(labels.length, 1);
  assert.match(subtitle(html).outerHTML, /Attack<span class="pa-hit-label pa-hit"> — Hit<\/span>/);
  assert.equal(html.querySelector(".pa-miss-line"), null);
});

test("one target missed: \"— Miss\" in orange and one rendered \"Miss — no damage\" line, no new message", () => {
  const before = game.messages.size;
  const { msg, html } = attackCard({ targets: [{ isMiss: true, ac: 18 }] });
  const n = game.messages.size;
  render(msg, html);
  render(msg, html);
  assert.match(subtitle(html).outerHTML, /pa-hit-label pa-miss"> — Miss/);
  assert.equal(html.querySelectorAll(".pa-miss-line").length, 1);
  assert.match(html.querySelector(".pa-miss-line").outerHTML, /Miss — no damage/);
  assert.equal(game.messages.size, n, "rendered, never posted");
  assert.equal(n, before + 1);
});

test("several targets, mixed: each pill says its own result, no title suffix, no miss line", () => {
  const { msg, html } = attackCard({ targets: [{ isMiss: false, ac: 10 }, { isMiss: true, ac: 20 }] });
  render(msg, html);
  assert.equal(html.querySelector(".pa-hit-label"), null);
  assert.deepEqual(html.querySelectorAll(".pa-pill-result").map(e => e.textContent), ["Hit", "Miss"]);
  assert.equal(html.querySelector(".pa-miss-line"), null);
});

test("nothing while attackRollVisibility is none, with hitMissLabels off, with no recorded target, or a private card", async () => {
  await game.settings.set("dnd5e", "attackRollVisibility", "none");
  try {
    const { msg, html } = attackCard({ targets: [{ isMiss: true, ac: 18 }] });
    render(msg, html);
    assert.equal(html.querySelector(".pa-hit-label"), null);
    assert.equal(html.querySelector(".pa-miss-line"), null);
  } finally { await game.settings.set("dnd5e", "attackRollVisibility", "hideAC"); }
  await game.settings.set(MODULE, "hitMissLabels", false);
  try {
    const { msg, html } = attackCard({ targets: [{ isMiss: false, ac: 12 }] });
    assert.equal(render(msg, html).querySelector(".pa-hit-label"), null);
  } finally { await game.settings.set(MODULE, "hitMissLabels", true); }
  const none = attackCard({ targets: [], pills: [] });
  assert.equal(render(none.msg, none.html).querySelector(".pa-hit-label"), null, "T2's empty pane: no claim");
  const priv = attackCard({ targets: [{ isMiss: false, ac: 12 }], visible: false });
  assert.equal(render(priv.msg, priv.html).querySelector(".pa-hit-label"), null);
});

test("the damage card after a hit gets a blue title; after a miss, or with no attack card, it does not", () => {
  const damageCard = () => {
    const msg = W.message({ type: "damage", system: { activity: { uuid: ACT } }, timestamp: Date.now() + 1 });
    const html = root(`<div class="message-content"><div class="chat-card"><section class="card-header"><div class="name-stacked"><span class="title">Longsword</span><span class="subtitle">Attack • Damage Roll</span></div></section></div><damage-application></damage-application></div>`);
    return { msg, html };
  };
  attackCard({ targets: [{ isMiss: false, ac: 12 }] });
  const hit = damageCard();
  render(hit.msg, hit.html);
  assert.equal(subtitle(hit.html).classList.contains("pa-hit-title"), true);
  attackCard({ targets: [{ isMiss: true, ac: 30 }] });
  const miss = damageCard();
  render(miss.msg, miss.html);
  assert.equal(subtitle(miss.html).classList.contains("pa-hit-title"), false);
  const other = W.message({ type: "damage", system: { activity: { uuid: "Actor.r.Item.x.Activity.y" } } });
  const html = root(`<div class="message-content"><section class="card-header"><span class="subtitle">Damage Roll</span></section></div>`);
  render(other, html);
  assert.equal(subtitle(html).classList.contains("pa-hit-title"), false);
  assert.equal(A.attackBefore(other), null);
});
