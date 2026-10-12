// rituals.mjs on a client (the pure half is the LEGACY suite test/rituals.mjs): the
// dnd5e.preUseActivity slot default, and the Argon `ButtonPanelButton#_renderInner` wrap that adds
// the "Rituals (no slot)" and "Longer casts" groups (adjustments rows riders-argon-ritual-adept-list,
// argon-riders-long-casts). The wrap is installed at ready; addRituals runs before the original.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { ButtonPanelButton, IDS, MODULE, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const wiz = W.actor(IDS.wiz);
const spell = id => wiz.items.get(id);
const use = (item, usage) => F.fireCall("dnd5e.preUseActivity", { item, actor: item.actor, flags: {}, name: "" }, usage, {}, {});

test("slot default: an unprepared ritual of a Ritual Adept wizard starts unticked; nothing else changes", async () => {
  const u1 = { consume: { spellSlot: true } };
  use(spell("detectmagic00001"), u1);
  assert.deepEqual(u1, { consume: { spellSlot: false } });
  const u2 = { consume: { spellSlot: true } };
  use(spell("magicmissile0001"), u2);
  assert.deepEqual(u2, { consume: { spellSlot: true } }, "prepared, not a ritual");
  const u3 = { consume: true };
  use(spell("detectmagic00001"), u3);
  assert.deepEqual(u3, { consume: true }, "consume not an object");
  const u4 = { consume: { spellSlot: "maybe" } };
  use(spell("detectmagic00001"), u4);
  assert.deepEqual(u4, { consume: { spellSlot: "maybe" } });
  const noAdept = makeActor({ name: "NoAdept", items: [{ id: "naritual00000001", name: "Alarm", type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: new Set(["ritual"]) } }] });
  const u5 = { consume: { spellSlot: true } };
  use(noAdept.items.get("naritual00000001"), u5);
  assert.deepEqual(u5, { consume: { spellSlot: true } });
  await F.game.settings.set(MODULE, "rituals", false);
  const u6 = { consume: { spellSlot: true } };
  use(spell("detectmagic00001"), u6);
  assert.deepEqual(u6, { consume: { spellSlot: true } });
  await F.game.settings.set(MODULE, "rituals", true);
  F.fireCall("dnd5e.preUseActivity", null, null);
  W.take();
  F.fireCall("dnd5e.preUseActivity", { get item() { throw new Error("bad activity"); } }, {});
  assert.deepEqual(W.take()[0], ["warn", `${MODULE} | ritual slot default skipped`, "bad activity"]);
});

/* ── the Argon groups ─────────────────────────────────────────────────────── */

class SpellButton {
  constructor({ item }) { this.item = item; }
}
const spellButton = (o = {}) => new ButtonPanelButton({
  type: "spell", actor: wiz, showPreparedOnly: true, _parent: { label: "DND5E.Action" },
  _spells: [{ label: "DND5E.SpellLevel1", buttons: [new SpellButton({ item: spell("magicmissile0001") })], uses: { max: 4, value: 1 } }],
  ...o,
});
const groups = b => b._spells.map(c => ({ label: c.label, items: c.buttons.map(x => x.item.name), ctor: c.buttons.every(x => x instanceof SpellButton), uses: [c.uses.max, c.uses.value] }));

test("Action-bar spell button: Rituals and Longer casts groups appended once, before the original renders", async () => {
  const b = spellButton();
  W.takeLog();
  assert.equal(await b._renderInner(), "inner");
  await b._renderInner();
  assert.deepEqual(groups(b), [
    { label: "DND5E.SpellLevel1", items: ["Magic Missile"], ctor: true, uses: [4, 1] },
    { label: "Rituals (no slot)", items: ["Alarm", "Detect Magic"], ctor: true, uses: [Infinity, Infinity] },
    { label: "Longer casts (1 min+)", items: ["Animate Dead"], ctor: true, uses: [Infinity, Infinity] },
  ]);
  assert.deepEqual(W.takeLog().map(l => [l.op, l.groups]), [
    ["argon._renderInner", ["DND5E.SpellLevel1", "Rituals (no slot)", "Longer casts (1 min+)"]],
    ["argon._renderInner", ["DND5E.SpellLevel1", "Rituals (no slot)", "Longer casts (1 min+)"]],
  ]);
});

test("'show all' (showPreparedOnly false): no Rituals group; Longer casts lists every long cast", async () => {
  const b = spellButton({ showPreparedOnly: false });
  await b._renderInner();
  assert.deepEqual(groups(b).map(g => [g.label, g.items]), [
    ["DND5E.SpellLevel1", ["Magic Missile"]],
    ["Longer casts (1 min+)", ["Animate Dead"]],
  ]);
});

test("settings: rituals off keeps Longer casts; longCasts off keeps Rituals", async () => {
  await F.game.settings.set(MODULE, "rituals", false);
  const a = spellButton();
  await a._renderInner();
  await F.game.settings.set(MODULE, "rituals", true);
  await F.game.settings.set(MODULE, "longCasts", false);
  const b = spellButton();
  await b._renderInner();
  await F.game.settings.set(MODULE, "longCasts", true);
  assert.deepEqual(groups(a).map(g => g.label), ["DND5E.SpellLevel1", "Longer casts (1 min+)"]);
  assert.deepEqual(groups(b).map(g => g.label), ["DND5E.SpellLevel1", "Rituals (no slot)"]);
});

test("left alone: not a spell button, not the Action bar, not a character, no button class to copy", async () => {
  const cases = [
    spellButton({ type: "feature" }),
    spellButton({ _spells: null }),
    spellButton({ _parent: { label: "DND5E.BonusAction" } }),
    spellButton({ actor: makeActor({ name: "Npc", type: "npc" }) }),
    spellButton({ _spells: [{ label: "x", buttons: [] }] }),
  ];
  for (const b of cases) await b._renderInner();
  assert.deepEqual(cases.map(b => (Array.isArray(b._spells) ? b._spells.length : null)), [1, null, 1, 1, 1]);
});

test("a throw in addRituals is warned and the original still renders", async () => {
  const b = new ButtonPanelButton();
  Object.defineProperty(b, "type", { get() { throw new Error("odd button"); } });
  W.take();
  W.takeLog();
  assert.equal(await b._renderInner(), "inner");
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Rituals group skipped`, "odd button"]]);
  assert.deepEqual(W.takeLog().map(l => l.op), ["argon._renderInner"]);
});
