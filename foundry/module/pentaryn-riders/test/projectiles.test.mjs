// Feedback JbnAbX (Scorching Ray fired one beam) and ixcdvA (Magic Missile fired one dart): the
// usage card of a multi-projectile spell gets one button per ray / dart, counted from the cast level
// (a wand's extra charges are the card's system.scaling), each rolled at the creature targeted on
// click and threaded under the card. Before this feature the card had dnd5e's single Attack /
// Damage button only, so these tests fail on the old code (no .pr-shots, no core helpers).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, makeActor, setupWorld, target } from "./fixtures/world.mjs";

const core = await import("../riders-core.mjs");

/* ── the pure core ───────────────────────────────────────────────────────── */

test("projectileRule: identifier or name (a '(Wand)' suffix ignored), the right activity type, spells only", () => {
  const sr = core.projectileRule({ identifier: "scorching-ray", type: "spell", activityType: "attack" });
  assert.equal(sr?.key, "scorching-ray");
  assert.equal(core.projectileRule({ name: "Magic Missile (Wand of Magic Missiles)", type: "spell", activityType: "damage" })?.key, "magic-missile");
  assert.equal(core.projectileRule({ name: "magic  missile" })?.noun, "dart");
  assert.equal(core.projectileRule({ name: "Scorching Ray", activityType: "damage" }), null, "a ray is an attack");
  assert.equal(core.projectileRule({ name: "Magic Missile", activityType: "attack" }), null, "a dart is a damage roll");
  assert.equal(core.projectileRule({ name: "Magic Missile", type: "equipment" }), null, "the wand itself is not the spell");
  assert.equal(core.projectileRule({ name: "Fireball", type: "spell" }), null);
  assert.equal(core.projectileRule(), null);
  assert.ok(Object.isFrozen(core.PROJECTILES) && core.PROJECTILES.every(Object.isFrozen));
});

test("castLevelOf + projectileCount: 3 rays at 2nd, +1 per level; 3 darts at 1st, +1 per level (wand charges are scaling)", () => {
  const sr = core.projectileRule({ name: "Scorching Ray" });
  const mm = core.projectileRule({ name: "Magic Missile" });
  assert.equal(core.projectileCount(sr, core.castLevelOf({ baseLevel: 2 })), 3);
  assert.equal(core.projectileCount(sr, core.castLevelOf({ baseLevel: 2, scaling: 1 })), 4);
  assert.equal(core.projectileCount(sr, core.castLevelOf({ baseLevel: 2, scaling: 0, level: 4 })), 5, "a stated level above the scaled one wins");
  assert.equal(core.projectileCount(mm, core.castLevelOf({ baseLevel: 1 })), 3, "the 1st-level minimum is 3 darts, not 1");
  assert.equal(core.projectileCount(mm, core.castLevelOf({ baseLevel: 1, scaling: 2 })), 5, "a wand spending 3 charges casts at 3rd: 5 darts");
  assert.equal(core.projectileCount(mm, core.castLevelOf({ baseLevel: "1", scaling: "x", level: null })), 3, "junk reads as no scaling");
  assert.equal(core.projectileCount(null, 9), 0);
  assert.equal(core.projectileCount(mm, NaN), 3);
});

test("projectileSlots: rolled slots first with their targets, the next one, extras beyond the count", () => {
  assert.deepEqual(core.projectileSlots(3, [{ targets: ["Thorgrim"] }]), {
    count: 3, done: 1, extra: 0, next: 2,
    slots: [{ n: 1, done: true, targets: ["Thorgrim"] }, { n: 2, done: false, targets: [] }, { n: 3, done: false, targets: [] }],
  });
  const full = core.projectileSlots(2, [{ targets: ["A"] }, {}, { targets: ["C"] }]);
  assert.deepEqual([full.done, full.extra, full.next], [2, 1, null]);
  assert.deepEqual(full.slots.map(s => s.targets), [["A"], []]);
  assert.deepEqual(core.projectileSlots(0, null), { count: 0, done: 0, extra: 0, next: null, slots: [] });
});

/* ── the card ─────────────────────────────────────────────────────────────── */

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);

const sorc = W.actor(IDS.sorc);
const wiz = W.actor(IDS.wiz);
const thorgrim = makeActor({ id: "thorgrim00000001", name: "Thorgrim", type: "npc" });
const bandit = makeActor({ id: "bandit0000000001", name: "Bandit", type: "npc" });

/** A dnd5e usage card for `activity`, with the rolls already threaded under it. */
function usageCard(activity, { id = "usecard000000001", scaling = 0, rolled = [], type = "usage" } = {}) {
  const calls = [];
  const scaled = { ...activity, scaled: true,
    rollAttack: async config => { calls.push(["rollAttack", "scaled", config.event?.target?.dataset?.prShot]); },
    rollDamage: async config => { calls.push(["rollDamage", "scaled", config.event?.target?.dataset?.prShot]); } };
  Object.defineProperty(scaled, "actor", { get: () => activity.actor });
  activity.rollAttack = async config => { calls.push(["rollAttack", "live", config.event?.target?.dataset?.prShot]); };
  activity.rollDamage = async config => { calls.push(["rollDamage", "live", config.event?.target?.dataset?.prShot]); };
  const message = {
    id, type, isAuthor: true, system: { scaling, level: null },
    _source: { system: {} },
    getAssociatedActivity: ({ scaled: s } = {}) => (s ? scaled : activity),
    getAssociatedItem: () => activity.item,
    getAssociatedRolls: () => rolled.map((names, i) => ({ timestamp: i, system: { targets: names.map(name => ({ name })) } })),
  };
  return { message, calls };
}

const cardEl = id => W.html(`<li class="chat-message" data-message-id="${id}"><div class="message-content"><div class="card-buttons"><button data-action="rollAttack">Attack</button></div></div></li>`);
const buttons = el => el.querySelectorAll("button.pr-shot");

test("Scorching Ray cast at 3rd: four rays, the first (dnd5e's own roll) named, the next highlighted", () => {
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  const { message } = usageCard(ray, { scaling: 1, rolled: [["Thorgrim"]] });
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  F.fire("dnd5e.renderChatMessage", message, el);
  assert.equal(el.querySelectorAll(".pr-shots").length, 1, "rebuilt, not doubled");
  assert.deepEqual(buttons(el).map(b => [b.textContent, b.disabled, b.classList.contains("pr-shot-next")]), [
    ["Ray 1 · Thorgrim", true, false], ["Ray 2", false, true], ["Ray 3", false, false], ["Ray 4", false, false],
  ]);
  assert.match(el.querySelector(".pr-shots-status").textContent, /level 3: 1 of 4 rays/);
  assert.equal(el.querySelector(".card-buttons").parentNode.children[1].className, "pr-shots", "under the card's own buttons");
});

test("clicking a ray rolls that ray's attack (the upcast clone) at the one targeted creature, from the card", async () => {
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  const { message, calls } = usageCard(ray, { scaling: 1, rolled: [["Thorgrim"]] });
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  W.target(target(bandit));
  const { event } = await buttons(el)[1].click();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, [["rollAttack", "scaled", "2"]]);
  assert.ok(event.defaultPrevented && event.propagationStopped, "dnd5e's card handler never sees it");
  assert.equal(event.target.closest("[data-message-id]").dataset.messageId, message.id, "dnd5e threads the roll under this card");
});

test("more than one target: refused with a toast, nothing rolled; no target: rolled with a note", async () => {
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  const { message, calls } = usageCard(ray);
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  F.calls.length = 0;
  W.target(target(bandit), target(thorgrim));
  await buttons(el)[0].click();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, []);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["warn", "Each ray strikes one creature: target just one, then click the ray."]]);
  F.calls.length = 0;
  W.target();
  await buttons(el)[0].click();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, [["rollAttack", "live", "1"]], "no scaling: the live activity");
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => c.level), ["info"]);
  W.take();
});

test("Magic Missile from a wand spending 3 charges: five darts, each a damage roll at the target clicked", async () => {
  const dart = wiz.items.get("magicmissile0001").system.activities.contents[0];
  const { message, calls } = usageCard(dart, { scaling: 2, rolled: [["Thorgrim"], ["Thorgrim"]] });
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  assert.deepEqual(buttons(el).map(b => b.textContent), ["Dart 1 · Thorgrim", "Dart 2 · Thorgrim", "Dart 3", "Dart 4", "Dart 5"]);
  W.target(target(bandit));
  await buttons(el)[2].click();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, [["rollDamage", "scaled", "3"]]);
  await buttons(el)[0].click();
  await new Promise(r => setImmediate(r));
  assert.equal(calls.length, 1, "a rolled slot is disabled");
});

test("no buttons: another spell, a roll card, the setting off, or a viewer who does not own the caster", async () => {
  const fireball = sorc.items.get("fireball00000001").system.activities.contents[0];
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  const check = (message, why) => {
    const el = cardEl(message.id);
    F.fire("dnd5e.renderChatMessage", message, el);
    assert.equal(el.querySelector(".pr-shots"), null, why);
  };
  check(usageCard(fireball).message, "Fireball");
  check(usageCard(ray, { type: "attack" }).message, "an attack roll card");
  await F.game.settings.set(MODULE, "projectiles", false);
  check(usageCard(ray).message, "setting off");
  await F.game.settings.set(MODULE, "projectiles", true);
  const stranger = makeActor({ id: "stranger00000001", name: "Stranger", type: "character", ownership: { default: 0 },
    items: [{ id: "strscorch0000001", name: "Scorching Ray", type: "spell", system: { level: 2 }, activities: [{ id: "stratk0000000001", type: "attack" }] }] });
  F.become({ userId: IDS.player });
  check(usageCard(stranger.items.get("strscorch0000001").system.activities.contents[0]).message, "not the player's caster");
  F.become({ userId: IDS.gm });
  W.take();
});

test("a roll made under (or deleted from) a projectile card re-renders that card; other rolls do nothing", () => {
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  const fireball = sorc.items.get("fireball00000001").system.activities.contents[0];
  const { message: card } = usageCard(ray, { id: "usecard000000009" });
  const { message: other } = usageCard(fireball, { id: "usecard000000010" });
  F.game.messages.set(card.id, card);
  F.game.messages.set(other.id, other);
  const updated = [];
  F.ui.chat = { updateMessage: async m => { updated.push(m.id); } };
  F.fire("createChatMessage", { type: "attack", _source: { system: { origin: card.id } } }, {}, IDS.gm);
  F.fire("deleteChatMessage", { type: "damage", _source: { system: { origin: card.id } } }, {}, IDS.gm);
  F.fire("createChatMessage", { type: "attack", _source: { system: { origin: other.id } } }, {}, IDS.gm);
  F.fire("createChatMessage", { type: "usage", _source: { system: { origin: card.id } } }, {}, IDS.gm);
  F.fire("createChatMessage", { type: "attack", _source: { system: {} } }, {}, IDS.gm);
  assert.deepEqual(updated, [card.id, card.id]);
  F.game.messages.delete(card.id);
  F.game.messages.delete(other.id);
  delete F.ui.chat;
});

test("a broken card root is warned as 'projectile buttons skipped'; non-usage roots are never touched", () => {
  const ray = sorc.items.get("scorch0000000001").system.activities.contents[0];
  W.take();
  F.fire("dnd5e.renderChatMessage", usageCard(ray).message, { querySelector: () => { throw new Error("detached"); } });
  F.fire("dnd5e.renderChatMessage", { type: "damage" }, { querySelector: () => { throw new Error("never read"); } });
  // (the card note's own listener warns about the same broken roots; only ours is pinned here)
  assert.deepEqual(W.take().filter(l => /projectile/.test(l[1])).map(l => l.slice(0, 3)), [["warn", `${MODULE} | projectile buttons skipped`, "detached"]]);
});
