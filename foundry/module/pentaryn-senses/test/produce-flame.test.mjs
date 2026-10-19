/**
 * Produce Flame (feedback DsekWh, JEssbJ, 2026-10-19). Two copies of the spell were in play: the
 * PHB's ("Cast" utility + "Hurl Fire" attack, no light at all) and a D&D Beyond import ("Attack" +
 * "Light Effect", a utility whose ActiveEffect wrote token.light.* keys nothing applied). Neither lit
 * the caster. Now both ride the Light cantrip's flag and reconcile: the non-attack activity lights
 * the caster's token at once (no prompt: the flame is in their hand), with a flame, and the attack
 * leaves the light alone. A double-click on Use opened two "which activity?" dialogs; the second
 * now closes at once.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  boot, standardWorld, activityOf, flush, settle, since, el, ID, MODULE, NOW, TORCH, LANTERN, LIGHT_SPELL,
} from "./fixtures/world.mjs";
import {
  FLAME_LIGHT, SPELL_LIGHT, isProduceFlameData, spellLightKind, isSpellLightData, spellLightData, isSpellLightCast,
  spellLightUpdate,
} from "../senses-core.mjs";
import { oneChoiceDialog } from "../light-ui.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const PF_PHB = {
  id: "itmFlamePHB00001", name: "Produce Flame", type: "spell", system: { identifier: "produce-flame" },
  activities: [{ _id: "MModRd17Oi6hhztj", type: "utility", name: "Cast" }, { _id: "tqKlIEdglRYdqHrp", type: "attack", name: "Hurl Fire" }],
};
const PF_DDB = {
  id: "ddbProduFlame124", name: "Produce Flame", type: "spell", system: { identifier: "" },
  activities: [{ _id: "attackProduFlame", type: "attack", name: "Attack" }, { _id: "addLightEffect1I", type: "utility", name: "Light Effect" }],
};

/* ── pure ─────────────────────────────────────────────────────────────── */

test("core: Produce Flame is a spell light of kind 'flame', by identifier or by name", () => {
  const spell = (name, identifier, type = "spell") => ({ name, type, system: { identifier } });
  assert.equal(isProduceFlameData(spell("Produce Flame", "produce-flame")), true);
  assert.equal(isProduceFlameData(spell("Produce Flame", "")), true, "a D&D Beyond copy by name");
  assert.equal(isProduceFlameData(spell("Produce Flame", "produce-flame", "feat")), false, "not a spell");
  assert.equal(isProduceFlameData(null), false);
  assert.equal(spellLightKind(spell("Produce Flame", "produce-flame")), "flame");
  assert.equal(spellLightKind(spell("Light", "light")), "light");
  assert.equal(spellLightKind(spell("Fire Bolt", "fire-bolt")), null);
  assert.equal(isSpellLightData(spell("Produce Flame", "")), true);
  assert.equal(spellLightData(spell("Produce Flame", "produce-flame")), FLAME_LIGHT);
  assert.equal(spellLightData(spell("Light", "light")), SPELL_LIGHT);
  assert.deepEqual([FLAME_LIGHT.bright, FLAME_LIGHT.dim, FLAME_LIGHT.animation.type], [20, 40, "torch"], "2024 PHB: bright 20, dim 20 more");
  assert.equal(Object.isFrozen(FLAME_LIGHT), true);
});

test("core: the PHB Cast and D&D Beyond Light Effect make the light; Hurl Fire and Attack do not", () => {
  const flame = { name: "Produce Flame", type: "spell", system: { identifier: "produce-flame" } };
  assert.equal(isSpellLightCast({ type: "utility", name: "Cast" }, flame), true);
  assert.equal(isSpellLightCast({ type: "utility", name: "Light Effect" }, flame), true);
  assert.equal(isSpellLightCast({ type: "attack", name: "Hurl Fire" }, flame), false);
  assert.equal(isSpellLightCast({ type: "attack", name: "Attack" }, flame), false);
  assert.equal(isSpellLightCast(null, flame), false);
  assert.equal(isSpellLightCast({ type: "summon" }, { name: "Light", type: "spell", system: { identifier: "light" } }), true);
  assert.equal(isSpellLightCast({ type: "utility" }, { name: "Torch", type: "consumable", system: { identifier: "torch" } }), false);
});

test("core: spellLightUpdate writes the light it is handed (the Light cantrip's by default)", () => {
  const tok = { flags: {} };
  assert.deepEqual(spellLightUpdate(tok, "s", null).light, { ...SPELL_LIGHT, animation: { ...SPELL_LIGHT.animation }, darkness: { ...SPELL_LIGHT.darkness } });
  const u = spellLightUpdate(tok, "s", null, FLAME_LIGHT);
  assert.equal(u.light.color, FLAME_LIGHT.color);
  assert.notEqual(u.light, FLAME_LIGHT, "a copy");
});

/* ── glue (active GM) ─────────────────────────────────────────────────── */

const F = await boot({ world: standardWorld({ heroItems: [TORCH, LANTERN, LIGHT_SPELL, PF_PHB, { ...PF_DDB }] }) });
await settle(mock);
const hero = () => game.actors.get(ID.hero);
const heroTok = () => game.scenes.get(ID.s1).tokens.get(ID.tHero);
const phb = () => hero().items.get(PF_PHB.id);
const ddb = () => hero().items.get(PF_DDB.id);

async function run(fn) {
  const mark = F.calls.length;
  await fn();
  await flush();
  await settle(mock);
  return since(mark);
}

test("PHB Cast lights the caster's token with a flame, with no prompt; Hurl Fire changes nothing", async () => {
  F.dialogs.length = 0;
  const calls = await run(() => F.fire("dnd5e.postUseActivity", activityOf(phb(), "MModRd17Oi6hhztj")));
  assert.equal(F.dialogs.length, 0, "no 'Where does the light go?'");
  assert.deepEqual(phb().flags[MODULE].lightCast.token, ID.tHero);
  assert.equal(heroTok().flags[MODULE].spellLight.source, phb().uuid);
  assert.deepEqual([heroTok().light.bright, heroTok().light.dim, heroTok().light.color], [20, 40, FLAME_LIGHT.color]);
  assert.ok(calls.some(c => JSON.stringify(c).includes("Produce Flame: Marrith glows.")), "the notice names the spell");

  const hurl = await run(() => F.fire("dnd5e.postUseActivity", activityOf(phb(), "tqKlIEdglRYdqHrp")));
  assert.deepEqual(hurl, [], "Hurl Fire writes nothing");
  assert.equal(F.dialogs.length, 0);
});

test("preUseActivity never vetoes Produce Flame (the card and the attack go ahead)", () => {
  for (const id of ["MModRd17Oi6hhztj", "tqKlIEdglRYdqHrp"]) {
    assert.equal(F.fireCall("dnd5e.preUseActivity", activityOf(phb(), id), { create: {} }), true);
  }
});

test("the D&D Beyond copy: Light Effect lights the caster (the newest cast wins the token); Attack does not", async () => {
  await run(() => F.fire("dnd5e.postUseActivity", activityOf(ddb(), "attackProduFlame")));
  assert.equal(ddb().flags[MODULE]?.lightCast, undefined, "Attack casts no light");
  await run(() => F.fire("dnd5e.postUseActivity", activityOf(ddb(), "addLightEffect1I")));
  assert.equal(heroTok().flags[MODULE].spellLight.source, ddb().uuid);
  assert.equal(heroTok().light.color, FLAME_LIGHT.color);
});

test("End light puts the flame out and gives the token its own light back", async () => {
  await run(() => game.pentaryn.senses.light.end(ddb()));
  assert.equal(heroTok().flags[MODULE]?.spellLight, undefined);
});

test("the spell card: On me and End light, no Pick a target (the flame is in your hand)", () => {
  const list = el("ul", { className: "unlist" });
  const card = el("div", { className: "message-content", children: [el("div", { className: "chat-card", children: [el("section", { className: "icon-row", children: [list] })] })] });
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: phb().uuid } } }, card);
  assert.deepEqual(card.querySelectorAll("[data-ps-light]").map(b => b.dataset.psLight), ["me", "end"]);
});

test("a double-click: the second 'which activity?' dialog for the same item closes; others are left alone", () => {
  class ActivityChoiceDialog {
    constructor(item) { this.item = item; this.rendered = true; this.closed = false; this.front = false; }
    close() { this.closed = true; return Promise.resolve(); }
    bringToFront() { this.front = true; }
  }
  const instances = new Map();
  foundry.applications.instances = instances;
  const a = new ActivityChoiceDialog(phb());
  instances.set("app-153", a);
  oneChoiceDialog(a, null, {}, { isFirstRender: true });
  assert.equal(a.closed, false, "the first one stays");

  const b = new ActivityChoiceDialog(phb());
  instances.set("app-154", b);
  oneChoiceDialog(b, null, {}, { isFirstRender: true });
  assert.deepEqual([b.closed, a.front], [true, true], "the second closes; the first comes to the front");

  const other = new ActivityChoiceDialog({ uuid: "Actor.x.Item.sword", name: "Longsword", type: "weapon", system: { identifier: "longsword" } });
  const other2 = new ActivityChoiceDialog(other.item);
  instances.set("app-155", other).set("app-156", other2);
  oneChoiceDialog(other2, null, {}, { isFirstRender: true });
  assert.equal(other2.closed, false, "an item senses does not handle is not touched");

  const c = new ActivityChoiceDialog(phb());
  oneChoiceDialog(c, null, {}, { isFirstRender: false });
  assert.equal(c.closed, false, "a re-render is never closed");
  delete foundry.applications.instances;
});
