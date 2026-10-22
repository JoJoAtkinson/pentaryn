// cast-flow.mjs on a client (pure halves in the LEGACY suite test/table.mjs): 1 the summon sidebar
// keep, 2 the restore-slot default, 3 the self-only stale-target drop and the Place Summons default
// (SummonActivity#_prepareUsageConfig wrap), 4 the usage dialog's first click, 5 the wildcard
// summon preview (SummonActivity#getPlacement wrap), 6 the Arcane Recovery picker.
// The two wraps' cases are combat-riders-39's recipe: S5 moves them into patches.mjs verbatim.
// combat-riders-40: the sidebar restore's comment-only catch prints nothing today (pinned).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { FakeElement } from "./fixtures/dom.mjs";
import { IDS, MODULE, SummonActivity, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

const T0 = 1_800_000_000_000;
mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const wiz = W.actor(IDS.wiz);
const notes = () => F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]);
let seen = 0;
const newNotes = () => { const all = notes(); const out = all.slice(seen); seen = all.length; return out; };

/* ── 1. the sidebar ──────────────────────────────────────────────────────── */

function sidebar({ tab = "chat", expanded = true } = {}) {
  const calls = [];
  F.ui.sidebar = {
    tabGroups: { primary: tab }, expanded,
    changeTab: (t, g) => { calls.push(["changeTab", t, g]); F.ui.sidebar.tabGroups.primary = t; },
    collapse: () => { calls.push(["collapse"]); F.ui.sidebar.expanded = false; },
  };
  return calls;
}

test("a summon that jumps to the Actors tab is put back (and collapsed again); the placement hint is shown", () => {
  const calls = sidebar({ tab: "chat", expanded: false });
  F.fire("dnd5e.preSummon", { item: { name: "Flaming Sphere" }, summon: { prompt: true } }, { name: "Sphere" });
  F.ui.sidebar.expanded = true;               // importFromCompendium opened it
  F.fire("changeSidebarTab", { tabName: "actors" });
  assert.deepEqual(calls, [], "deferred one tick");
  mock.timers.tick(0);
  assert.deepEqual(calls, [["changeTab", "chat", "primary"], ["collapse"]]);
  F.fire("dnd5e.postSummon");
  F.fire("changeSidebarTab", { tabName: "actors" });
  mock.timers.tick(0);
  assert.equal(calls.length, 2, "after postSummon nothing is put back");
  assert.deepEqual(newNotes(), [["info", "Click the map to place Sphere. Right-click or Escape cancels."]]);
});

test("EC-3: the keep is one-shot: with no postSummon, a later deliberate switch to Actors stands", () => {
  const calls = sidebar({ tab: "chat" });
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  F.fire("changeSidebarTab", { tabName: "actors" });   // the import's own jump
  mock.timers.tick(0);
  assert.deepEqual(calls, [["changeTab", "chat", "primary"]]);
  // postSummon never fires (placement cancelled); the GM opens Actors on purpose seconds later.
  F.fire("changeSidebarTab", { tabName: "actors" });
  mock.timers.tick(0);
  assert.equal(calls.length, 1, "the deliberate switch is not reverted");
  F.fire("dnd5e.postSummon");
});

test("sidebar keep: the profile name, then the item name; no hint with prompt off; other tabs, expired, from Actors → nothing", () => {
  sidebar();
  F.fire("dnd5e.preSummon", { item: { name: "Summon Undead" } }, {});
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  const calls = sidebar({ tab: "chat" });
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  F.fire("changeSidebarTab", { tabName: "items" });
  mock.timers.setTime(T0 + 61_000);
  F.fire("changeSidebarTab", { tabName: "actors" });
  mock.timers.setTime(T0);
  sidebar({ tab: "actors" });
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  F.fire("changeSidebarTab", { tabName: "actors" });
  F.fire("changeSidebarTab", null);
  mock.timers.tick(0);
  assert.deepEqual(calls, []);
  assert.deepEqual(newNotes(), [["info", "Click the map to place Summon Undead. Right-click or Escape cancels."]]);
  F.fire("dnd5e.postSummon");
});

test("combat-riders-40 pin: a sidebar that refuses the tab change is left as it is, silently", () => {
  F.ui.sidebar = { tabGroups: { primary: "chat" }, expanded: true, changeTab: () => { throw new Error("no tab"); } };
  F.fire("dnd5e.preSummon", { summon: { prompt: false } }, {});
  F.fire("changeSidebarTab", { tabName: "actors" });
  W.take();
  mock.timers.tick(0);
  assert.deepEqual(W.take(), []);
  F.fire("dnd5e.postSummon");
  W.take();
  F.ui.sidebar = { get tabGroups() { throw new Error("no sidebar"); } };
  F.fire("dnd5e.preSummon", {}, {});
  assert.deepEqual(W.take(), [["warn", `${MODULE} | summon sidebar keep skipped`, "no sidebar"]]);
  F.ui.sidebar = undefined;
  F.fire("dnd5e.postSummon");
});

/* ── 2. restore-slot default ─────────────────────────────────────────────── */

const pearl = (o = {}) => ({ actor: wiz, item: { actor: wiz, type: "equipment", name: "Pearl" }, flags: {}, name: "", consumption: { targets: [{ type: "spellSlots", value: "-1", target: "spell1" }], scaling: { allowed: true, max: "3" } }, ...o });

test("restoring a slot opens on the highest spent level at or below the cap", () => {
  const u = {};
  F.fireCall("dnd5e.preUseActivity", pearl(), u, {}, {});
  assert.deepEqual(u, { scaling: 2 }, "level 3 is spent: scaling 2 above level 1");
  const zero = { scaling: 0 };
  F.fireCall("dnd5e.preUseActivity", pearl({ consumption: { targets: [{ type: "spellSlots", value: "-1", target: "spell1" }], scaling: { allowed: true, max: "1" } } }), zero, {}, {});
  assert.deepEqual(zero, { scaling: 0 }, "cap 1 and level 1 spent: scaling 0 is left as dnd5e's");
});

test("restore-slot default leaves: a chosen scaling, a cost that grows, no spell slots, no usage config; a throw is warned", () => {
  const chosen = { scaling: 1 };
  F.fireCall("dnd5e.preUseActivity", pearl(), chosen, {}, {});
  const fixed = { scaling: false };
  F.fireCall("dnd5e.preUseActivity", pearl(), fixed, {}, {});
  const font = {};
  F.fireCall("dnd5e.preUseActivity", pearl({ consumption: { targets: [{ type: "spellSlots", value: "-1", target: "spell1" }, { type: "itemUses", value: "2 + @scaling" }], scaling: { allowed: true } } }), font, {}, {});
  const noSpells = {};
  F.fireCall("dnd5e.preUseActivity", pearl({ actor: W.actor(IDS.npc) }), noSpells, {}, {});
  F.fireCall("dnd5e.preUseActivity", pearl(), null, {}, {});
  assert.deepEqual([chosen, fixed, font, noSpells], [{ scaling: 1 }, { scaling: false }, {}, {}]);
  W.take();
  F.fireCall("dnd5e.preUseActivity", { flags: {}, name: "", get actor() { throw new Error("odd activity"); } }, {}, {}, {});
  assert.deepEqual(W.take()[0], ["warn", `${MODULE} | restore-slot default skipped`, "odd activity"]);
  W.take();
});

/* ── 3. self-only stale targets; Place Summons ticked ────────────────────── */

test("a self-only activity's card drops the user's leftover targets; with a template or the setting off it keeps them", async () => {
  const shield = (tpl) => ({ actor: wiz, item: { actor: wiz }, flags: {}, name: "", target: { affects: { type: "self" }, template: tpl ? { type: "sphere" } : {} } });
  const m1 = { data: { system: { targets: [{ uuid: "Actor.x" }] } } };
  F.fireCall("dnd5e.preUseActivity", shield(false), {}, {}, m1);
  assert.deepEqual(m1.data.system.targets, []);
  const m2 = { data: { system: { targets: [{ uuid: "Actor.x" }] } } };
  F.fireCall("dnd5e.preUseActivity", shield(true), {}, {}, m2);
  assert.equal(m2.data.system.targets.length, 1);
  await F.game.settings.set(MODULE, "castDefaults", false);
  const m3 = { data: { system: { targets: [{ uuid: "Actor.x" }] } } };
  F.fireCall("dnd5e.preUseActivity", shield(false), {}, {}, m3);
  await F.game.settings.set(MODULE, "castDefaults", true);
  assert.equal(m3.data.system.targets.length, 1);
  W.take();
  F.fireCall("dnd5e.preUseActivity", { flags: {}, name: "", actor: wiz, get target() { throw new Error("odd target"); } }, {}, {}, {});
  assert.deepEqual(W.take().filter(l => l[1].includes("cast defaults")), [["warn", `${MODULE} | cast defaults skipped`, "odd target"]]);
});

test("Place Summons: ticked when the caller said nothing and placing is possible; explicit choices kept", async () => {
  const s = new SummonActivity();
  assert.deepEqual(s._prepareUsageConfig({}).create, { summons: true });
  assert.deepEqual(s._prepareUsageConfig().create, { summons: true });
  assert.deepEqual(s._prepareUsageConfig({ create: false }).create, false);
  assert.deepEqual(s._prepareUsageConfig({ create: { summons: false } }).create, { summons: false });
  assert.deepEqual(new SummonActivity({ summon: { prompt: true } })._prepareUsageConfig({}).create, { summons: true });
  assert.deepEqual(new SummonActivity({ canSummon: false })._prepareUsageConfig({}).create, { summons: false });
  assert.deepEqual(new SummonActivity({ availableProfiles: [] })._prepareUsageConfig({}).create, { summons: false });
  assert.deepEqual(new SummonActivity({ availableProfiles: undefined })._prepareUsageConfig({}).create, { summons: false });
  const scene = F.canvas.scene;
  F.canvas.scene = null;
  assert.deepEqual(s._prepareUsageConfig({}).create, { summons: false });
  F.canvas.scene = scene;
  await F.game.settings.set(MODULE, "castDefaults", false);
  assert.deepEqual(s._prepareUsageConfig({}).create, { summons: false });
  await F.game.settings.set(MODULE, "castDefaults", true);
  W.take();
  const odd = new SummonActivity();
  Object.defineProperty(odd, "availableProfiles", { get() { throw new Error("no profiles"); } });
  assert.deepEqual(odd._prepareUsageConfig({}).create, { summons: false });
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Place Summons default skipped`, "no profiles"]]);
});

/* ── 4. the usage dialog's first click ───────────────────────────────────── */

function usageDialog() {
  const element = W.html(`<form><input name="scaling" value="1"><select name="x"></select><button data-action="use"><i></i></button><button data-action="other"></button></form>`);
  W.dom.body.append(element);
  const app = { element, rendered: true };
  return { app, element, input: element.querySelector("input"), use: element.querySelector('button[data-action="use"]') };
}

test("mousedown on Use with a field focused: commit it (blur), then press the re-rendered Use once", async () => {
  const { app, element, input, use } = usageDialog();
  F.fire("renderActivityUsageDialog", app, element);
  F.fire("renderActivityUsageDialog", app, element);
  assert.equal(element.dataset.prFirstClick, "1");
  assert.equal(element.listeners.length, 2, "listened once");
  input.focus();
  const { event } = await element.fire("mousedown", { target: use.querySelector("i"), button: 0 });
  assert.equal(event.defaultPrevented, true);
  assert.equal(input.blurred, 1);
  assert.equal(app._prUseAfterRender, T0);
  const clicks = [];
  use.addEventListener("click", () => clicks.push("use"));
  F.fire("renderActivityUsageDialog", app, element);         // dnd5e re-rendered after the change
  assert.equal(app._prUseAfterRender, null);
  W.flushRaf();
  await drain();
  assert.deepEqual(clicks, ["use"]);
  element.remove();
});

test("first click: no focus, a right click, another button, an outside focus → the click goes through untouched", async () => {
  const { app, element, input, use } = usageDialog();
  F.fire("renderActivityUsageDialog", app, element);
  W.dom.activeElement = null;
  for (const init of [{ target: use, button: 0 }, { target: use, button: 2 }, { target: element.querySelector('[data-action="other"]'), button: 0 }]) {
    input.focus();
    if (init.button === 0 && init.target === use) W.dom.activeElement = null;
    const { event } = await element.fire("mousedown", init);
    assert.equal(event.defaultPrevented, false);
  }
  const outside = new FakeElement("input");
  W.dom.activeElement = outside;
  assert.equal((await element.fire("mousedown", { target: use, button: 0 })).event.defaultPrevented, false);
  W.dom.activeElement = use;
  assert.equal((await element.fire("mousedown", { target: use, button: 0 })).event.defaultPrevented, false, "a focused button is not a field");
  assert.equal(input.blurred ?? 0, 0);
  element.remove();
});

test("first click: a real click on Use clears the pending press; a stale or closed dialog presses nothing; app.element fallback; a throw", async () => {
  const { app, element, input, use } = usageDialog();
  F.fire("renderActivityUsageDialog", app, {});                    // not an element: app.element is the root
  input.focus();
  await element.fire("mousedown", { target: use, button: 0 });
  await element.fire("click", { target: use });
  assert.equal(app._prUseAfterRender, null);
  input.focus();
  await element.fire("mousedown", { target: use, button: 0 });
  mock.timers.setTime(T0 + 2_500);
  F.fire("renderActivityUsageDialog", app, element);
  assert.equal(W.raf.length, 0, "stale: nothing scheduled");
  mock.timers.setTime(T0);
  input.focus();
  await element.fire("mousedown", { target: use, button: 0 });
  app.rendered = false;
  const clicks = [];
  use.addEventListener("click", () => clicks.push("use"));
  F.fire("renderActivityUsageDialog", app, element);
  W.flushRaf();
  assert.deepEqual(clicks, [], "closed before the frame: no press");
  F.fire("renderActivityUsageDialog", { element: null }, null);
  W.take();
  F.fire("renderActivityUsageDialog", { get _prUseAfterRender() { throw new Error("odd app"); } }, element);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | usage dialog first click skipped`, "odd app"]]);
  element.remove();
});

/* ── 5. the wildcard summon preview ──────────────────────────────────────── */

const summonToken = (src, actor = wiz) => ({ texture: { src }, parent: actor, clone(data) { return { ...this, texture: { src: data["texture.src"] }, cloned: true }; } });

test("a wildcard token image previews as one of the actor's real images, else its portrait; a plain path passes", async () => {
  const s = new SummonActivity();
  wiz.tokenImages = ["t/skeleton-*.webp", "t/skeleton-2.webp"];
  wiz.img = "a/tamsin.webp";
  W.takeLog();
  await s.getPlacement(summonToken("t/skeleton-*.webp"), { id: "p" }, { x: 1 });
  W.perms.delete("FILES_BROWSE");
  await s.getPlacement(summonToken("t/skeleton-?.webp"), null, {});
  W.perms.add("FILES_BROWSE");
  wiz.tokenImagesThrow = true;
  await s.getPlacement(summonToken("t/skeleton-*.webp"), null, {});
  wiz.tokenImagesThrow = false;
  wiz.tokenImages = ["t/a-*.webp"];
  wiz.img = "t/b-*.webp";
  await s.getPlacement(summonToken("t/skeleton-*.webp"), null, {});
  await s.getPlacement(summonToken("t/plain.webp"), null, {});
  await s.getPlacement(null, null, {});
  assert.deepEqual(W.takeLog().filter(l => l.op === "summon.getPlacement").map(l => l.src), [
    "t/skeleton-2.webp", "a/tamsin.webp", "a/tamsin.webp", "t/skeleton-*.webp", "t/plain.webp", null,
  ]);
  W.take();
  await s.getPlacement({ texture: { src: "t/*.webp" }, get parent() { throw new Error("no parent"); } }, null, {});
  assert.deepEqual(W.take(), [["warn", `${MODULE} | summon preview image kept`, "no parent"]]);
  delete wiz.img;
});

/* ── 6. Arcane Recovery ──────────────────────────────────────────────────── */

const recovery = () => ({ item: wiz.items.get("arcanerec0000001"), actor: wiz, flags: {}, name: "" });
async function useRecovery(answer) {
  W.answer = answer;
  F.fire("dnd5e.postUseActivity", recovery());
  mock.timers.tick(0);
  await drain();
  W.answer = () => "cancel";
}

test("Arcane Recovery: the picker lists spent slots 1–5, opens on the highest that fit, and writes the choice", async () => {
  W.takeLog();
  const before = F.calls.length;
  let rendered;
  await useRecovery(d => {
    rendered = { content: d.config.content, total: d.element.querySelector(".pr-ar-total").textContent, okDisabled: d.element.querySelector('button[data-action="ok"]').disabled };
    return { l1: 1, l2: 1, l3: 0 };
  });
  pinJSON("arcane-recovery-dialog", { rendered, log: W.takeLog() }, import.meta.url);
  assert.equal(rendered.total, "3 of 3 levels");
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ "system.spells.spell1.value": 2, "system.spells.spell2.value": 2 }]);
});

test("Arcane Recovery: over the budget or nothing chosen → no write; cancel → no write; the live total marks 'over'", async () => {
  const before = F.calls.length;
  let over;
  await useRecovery(async d => {
    const form = d.form;
    for (const box of form.querySelectorAll('input[name="l3"]')) box.checked = true;
    await form.fire("change");
    over = { total: d.element.querySelector(".pr-ar-total").textContent, cls: d.element.querySelector(".pr-ar-total").className, ok: d.element.querySelector('button[data-action="ok"]').disabled };
    return { l3: 2 };
  });
  assert.deepEqual(over, { total: "6 of 3 levels", cls: "pr-ar-total over", ok: true });
  await useRecovery(() => ({ l1: 0, l2: 0, l3: 0 }));
  await useRecovery(() => "cancel");
  assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 0);
});

/** Tamsin's slots as the fixture builds them: 1st 1/4, 2nd 1/3, 3rd 0/2. */
const resetSlots = () => wiz.update({ "system.spells.spell1.value": 1, "system.spells.spell2.value": 1, "system.spells.spell3.value": 0 });

test("LdPm43: one row per slot level with 'n of m left', a locked ticked box per slot still there and a tickable box per spent slot; the default opens ticked", async () => {
  await resetSlots();
  let seenRows;
  await useRecovery(d => {
    seenRows = d.form.querySelectorAll(".pr-ar-row").map(row => ({
      label: row.querySelector("label").textContent.replace(/\s+/g, " ").trim(),
      locked: row.querySelectorAll("input.pr-ar-have").filter(b => b.checked && b.disabled).length,
      tickable: row.querySelectorAll("input[name^=l]").length,
      ticked: row.querySelectorAll("input[name^=l]").filter(b => b.checked).length,
    }));
    return "cancel";
  });
  // Tamsin: 1st 1/4, 2nd 1/3, 3rd 0/2; 4th and 5th max 0 → no row. Budget 3 → one 3rd ticked.
  assert.deepEqual(seenRows, [
    { label: "DND5E.SpellLevel1 1 of 4 left", locked: 1, tickable: 3, ticked: 0 },
    { label: "DND5E.SpellLevel2 1 of 3 left", locked: 1, tickable: 2, ticked: 0 },
    { label: "DND5E.SpellLevel3 0 of 2 left", locked: 0, tickable: 2, ticked: 1 },
  ]);
});

test("LdPm43: a D&D Beyond import's ddbmacro Arcane Recovery → the riders picker only (subsequentActions false, so ddb's own picker never opens), and one write", async () => {
  await resetSlots();
  const before = F.calls.length;
  W.takeLog();
  const usage = {};
  const ddb = { ...recovery(), type: "ddbmacro", macro: { function: "ddb.feat.arcaneRecovery", name: "Arcane Recovery" } };
  W.answer = () => ({ l1: 1, l2: 1, l3: 0 });
  F.fire("dnd5e.postUseActivity", ddb, usage, {});
  assert.equal(usage.subsequentActions, false, "set synchronously: dnd5e reads it right after the hook");
  mock.timers.tick(0);
  await drain();
  W.answer = () => "cancel";
  assert.equal(W.takeLog().filter(l => l.op === "DialogV2.wait").length, 1);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ "system.spells.spell1.value": 2, "system.spells.spell2.value": 2 }]);
  await resetSlots();
  // Any other activity keeps its subsequent actions; so does every use with the setting off.
  const plain = {}, otherMacro = {}, off = {};
  F.fire("dnd5e.postUseActivity", { ...recovery(), type: "utility" }, plain, {});
  mock.timers.tick(0);
  await drain();
  F.fire("dnd5e.postUseActivity", { ...recovery(), type: "ddbmacro", macro: { function: "ddb.feat.somethingElse" } }, otherMacro, {});
  mock.timers.tick(0);
  await drain();
  await F.game.settings.set(MODULE, "arcaneRecovery", false);
  F.fire("dnd5e.postUseActivity", ddb, off, {});
  await F.game.settings.set(MODULE, "arcaneRecovery", true);
  mock.timers.tick(0);
  await drain();
  assert.deepEqual([plain, otherMacro, off], [{}, {}, {}]);
  W.takeLog();
});

test("LdPm43: a second use while the picker is open opens no second window (a notice instead) and writes once", async () => {
  await resetSlots();
  newNotes();
  W.takeLog();
  const before = F.calls.length;
  W.answer = async () => {
    await null;                               // out of the outer tick: a nested mock tick re-runs its timer
    F.fire("dnd5e.postUseActivity", recovery(), {}, {});
    mock.timers.tick(0);
    await drain();
    return { l1: 1, l3: 0 };
  };
  F.fire("dnd5e.postUseActivity", recovery(), {}, {});
  mock.timers.tick(0);
  await drain(200);
  W.answer = () => "cancel";
  assert.equal(W.takeLog().filter(l => l.op === "DialogV2.wait").length, 1);
  assert.deepEqual(newNotes(), [["info", "Arcane Recovery: the slot picker is already open."]]);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => c.changes), [{ "system.spells.spell1.value": 2 }]);
  await resetSlots();
});

test("review finding 3: a second Arcane Recovery use while the picker is open is vetoed in preUseActivity, before dnd5e spends the use", async () => {
  await resetSlots();
  newNotes();
  W.takeLog();
  const seen = [];
  W.answer = async () => {
    await null;
    seen.push(F.fireCall("dnd5e.preUseActivity", recovery(), {}, {}, {}));                          // the second use
    seen.push(F.fireCall("dnd5e.preUseActivity", { item: wiz.items.get("ritualadept00001"), flags: {}, name: "" }, {}, {}, {}));   // another feature
    return "cancel";
  };
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", recovery(), {}, {}, {}), false, "no picker open: the first use goes ahead");
  F.fire("dnd5e.postUseActivity", recovery(), {}, {});
  mock.timers.tick(0);
  await drain(200);
  W.answer = () => "cancel";
  assert.equal(seen[0], false, "vetoed: dnd5e never reaches consumption");
  assert.notEqual(seen[1], false, "another feature of the same wizard is not stopped");
  assert.deepEqual(newNotes(), [["info", "Arcane Recovery: the slot picker is already open."]]);
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", recovery(), {}, {}, {}), false, "picker closed: a use goes ahead again");
  await F.game.settings.set(MODULE, "arcaneRecovery", false);
  W.answer = async () => { await null; seen.push(F.fireCall("dnd5e.preUseActivity", recovery(), {}, {}, {})); return "cancel"; };
  const { arcaneRecoveryDialog } = await import("../cast-flow.mjs");
  await arcaneRecoveryDialog(wiz);
  await F.game.settings.set(MODULE, "arcaneRecovery", true);
  W.answer = () => "cancel";
  assert.notEqual(seen[2], false, "setting off: never vetoed");
  await resetSlots();
});

test("Arcane Recovery: an Arcane Grimoire (attuned when it needs it) adds 1 to the budget", async () => {
  const { arcaneRecoveryDialog } = await import("../cast-flow.mjs");
  const mage = grimoire => makeActor({ name: "Grim", ownership: { default: 3 }, system: { spells: { spell1: { level: 1, value: 0, max: 4 }, spell2: { level: 2, value: 0, max: 3 } } }, items: [
    { id: "grimclass0000001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 4 } },
    ...(grimoire ? [{ id: "grimoire00000001", name: "+1 Arcane Grimoire", type: "equipment", system: grimoire }] : []),
  ] });
  const totals = [];
  W.answer = d => { totals.push(d.element.querySelector(".pr-ar-total").textContent); return "cancel"; };
  await arcaneRecoveryDialog(mage(null));
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: true, equipped: true }));
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: false, equipped: true }));
  // Review finding 4: held only. Unequipped, or packed in a container, it adds nothing.
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: true, equipped: false }));
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: true, equipped: true, container: "backpack00000001" }));
  // Second review: a grimoire typed loot has no equipped field — held unless it is in a container.
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: true }));
  await arcaneRecoveryDialog(mage({ attunement: "required", attuned: true, container: "backpack00000001" }));
  W.answer = () => "cancel";
  assert.deepEqual(totals, ["2 of 2 levels", "3 of 3 levels", "2 of 2 levels", "2 of 2 levels", "2 of 2 levels", "3 of 3 levels", "2 of 2 levels"]);
});

test("Arcane Recovery: no spent slot 1–5 → a notice and no dialog; the setting off, another feature, not owner → nothing", async () => {
  const full = makeActor({ name: "Full", ownership: { default: 3 }, system: { spells: { spell1: { level: 1, value: 2, max: 2 }, spell6: { level: 6, value: 0, max: 1 } } }, items: [
    { id: "fullclass0000001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 11 } },
    { id: "fullrec000000001", name: "Arcane Recovery", type: "feat", system: {} },
  ] });
  W.takeLog();
  F.fire("dnd5e.postUseActivity", { item: full.items.get("fullrec000000001"), flags: {}, name: "" });
  mock.timers.tick(0);
  await drain();
  assert.deepEqual(newNotes().filter(n => n[1].startsWith("Arcane")), [["info", "Arcane Recovery: no spent slots of level 1 to 5 to recover."]]);
  await F.game.settings.set(MODULE, "arcaneRecovery", false);
  await useRecovery(() => ({ l1: 1 }));
  await F.game.settings.set(MODULE, "arcaneRecovery", true);
  F.fire("dnd5e.postUseActivity", { item: wiz.items.get("ritualadept00001"), flags: {}, name: "" });
  F.become({ userId: IDS.player });
  const theirs = makeActor({ name: "Theirs", ownership: { default: 0 }, items: [{ id: "theirrec00000001", name: "Arcane Recovery", type: "feat", system: {} }] });
  F.fire("dnd5e.postUseActivity", { item: theirs.items.get("theirrec00000001"), flags: {}, name: "" });
  F.become({ userId: IDS.gm });
  mock.timers.tick(0);
  await drain();
  assert.deepEqual(W.takeLog().filter(l => l.op === "DialogV2.wait"), []);
});

test("arcaneRecoveryDialog (cast-flow's export) called directly: same dialog, returns the choice", async () => {
  const { arcaneRecoveryDialog } = await import("../cast-flow.mjs");
  const lvl1 = makeActor({ name: "Novice", ownership: { default: 3 }, system: { spells: { spell1: { level: 1, value: 0, max: 2 } } }, items: [
    { id: "noviceclass00001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 1 } },
  ] });
  W.answer = d => ({ total: d.element.querySelector(".pr-ar-total").textContent, l1: 1 });
  const out = await arcaneRecoveryDialog(lvl1);
  W.answer = () => "cancel";
  assert.deepEqual(out, { 1: 1 });
  assert.equal(lvl1.system.spells.spell1.value, 1);
  assert.equal(await arcaneRecoveryDialog(makeActor({ name: "Nobody" })), null);
});

test("riders-async-2: slots that change while the picker is open — the choice adds to the fresh values; a choice no longer valid recovers nothing and warns", async () => {
  const { arcaneRecoveryDialog } = await import("../cast-flow.mjs");
  const mage = () => makeActor({ name: "Mage", ownership: { default: 3 }, system: { spells: { spell1: { level: 1, value: 2, max: 4 }, spell2: { level: 2, value: 1, max: 3 } } }, items: [
    { id: "mageclass0000001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 5 } },
  ] });
  // A 1st-level cast while the window is open: one 1st recovered on top of the fresh 1, not the old 2.
  const caster = mage();
  W.answer = async () => { await caster.update({ "system.spells.spell1.value": 1 }); return { l1: 1, l2: 0 }; };
  assert.deepEqual(await arcaneRecoveryDialog(caster), { 1: 1, 2: 0 });
  assert.equal(caster.system.spells.spell1.value, 2);
  assert.equal(caster.system.spells.spell2.value, 1);
  // A long rest while the window is open: the 1st is no longer spent, so nothing is written.
  const rester = mage();
  newNotes();
  W.takeLog();
  const before = F.calls.length;
  W.answer = async () => { await rester.update({ "system.spells.spell1.value": 4, "system.spells.spell2.value": 3 }); return { l1: 1, l2: 0 }; };
  assert.equal(await arcaneRecoveryDialog(rester), null);
  W.answer = () => "cancel";
  assert.equal(rester.system.spells.spell1.value, 4);
  assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 1, "only the rest's own update");
  assert.deepEqual(W.takeLog().filter(l => l.op === "ChatMessage.create"), []);
  assert.deepEqual(newNotes(), [["warn", "Arcane Recovery: the spell slots changed while the window was open, so nothing was recovered."]]);
});

test("Arcane Recovery: a failing dialog and a throw are warned", async () => {
  W.take();
  await useRecovery(() => { throw new Error("dialog broke"); });
  F.fire("dnd5e.postUseActivity", { flags: {}, name: "", get item() { throw new Error("odd item"); } });
  assert.deepEqual(W.take().filter(l => !l[1].includes("Battle Medic")), [
    ["warn", `${MODULE} | Arcane Recovery dialog`, "dialog broke"],
    ["warn", `${MODULE} | Arcane Recovery picker skipped`, "odd item"],
    ["warn", `${MODULE} | projectile cast: dnd5e's automatic roll left on`, "odd item"],   // projectiles' listener (0.5.2) reads the item too
  ]);
});
