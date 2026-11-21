// The sidebar helpers on a synthetic Dice So Nice tab: what is added to each render, and what each
// button does to Dice So Nice's persistent dice (spawn calls, the selection Set, the outline redraw).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installDom } from "./fixtures/dom.mjs";
import { IDS, disabledTabElement, fakeDsn, flush, tabElement, world } from "./fixtures/dsn.mjs";
import { MAX_COUNT, MODULE } from "../dice-core.mjs";

installDom();
const F = await installFoundry(world(MODULE));
let D = fakeDsn();
game.dice3d = D.dice3d;
let renders = 0;
ui["dice-so-nice"] = { rendered: true, render: () => { renders += 1; } };
game.keybindings.get = (ns, key) => game.keybindings.actions.get(`${ns}.${key}`)?.editable ?? [];

await import("../dice.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const fresh = () => {
  D = fakeDsn();
  game.dice3d = D.dice3d;
};
const render = (el = tabElement()) => {
  F.fire("renderDsnSidebarTab", {}, el);
  return el;
};
const rowOf = (el, type) => el.querySelector(`li.dsn-toolbox-dice-row[data-type="${type}"]`);
const spawnCalls = () => D.calls.filter(c => c[0] === "spawn");

test("each die row gets a count box, a '+ ×' button and a select-this-type button; DSN's own buttons stay", () => {
  const el = render();
  const rows = el.querySelectorAll("li.dsn-toolbox-dice-row");
  assert.equal(rows.length, 7);
  for (const row of rows) {
    const box = row.querySelector(".dsn-toolbox-dice-buttons");
    const classes = box.children.map(c => c.className);
    assert.deepEqual(classes, ["pdi-count", "dsn-toolbox-btn", "dsn-toolbox-btn", "pdi-btn pdi-spawn", "pdi-btn pdi-select-type"]);
    const input = box.children[0];
    assert.equal(input.getAttribute("type"), "number");
    assert.equal(input.getAttribute("max"), String(MAX_COUNT));
    assert.equal(input.value, "1");
    for (const b of box.children.slice(3)) {
      assert.equal(b.getAttribute("type"), "button");
      assert.equal(b.dataset.action, undefined, "no data-action: DSN's AppV2 actions never see our buttons");
    }
  }
  const d6 = rowOf(el, "d6");
  assert.equal(d6.querySelector(".pdi-spawn").textContent, "+ ×");
  assert.equal(d6.querySelector(".pdi-spawn").title, "Add that many D6 to the table");
  assert.equal(d6.querySelector(".pdi-select-type").title, "Select all my D6");
});

test("the actions section sits right above 'Clear my dice', with the inline Ctrl+click hint naming the shortcut", () => {
  const el = render();
  const sections = el.children.map(c => c.className);
  assert.deepEqual(sections, [
    "dsn-toolbox-section", "dsn-toolbox-section pdi-actions", "dsn-toolbox-section dsn-toolbox-clear", "dsn-toolbox-section dsn-toolbox-help",
  ]);
  const actions = el.querySelector("section.pdi-actions");
  assert.deepEqual(actions.querySelectorAll("button").map(b => b.textContent), ["Select all mine", "Clear selection"]);
  assert.equal(actions.querySelector(".pdi-hint").textContent,
    "Ctrl+click a die to select it, or press Alt+A to select all of yours. Grab one selected die to move and throw them all; Delete removes them.");
});

test("decorating is idempotent: a second render hook on the same DOM adds nothing", () => {
  const el = render();
  render(el);
  assert.equal(el.querySelectorAll(".pdi-count").length, 7);
  assert.equal(el.querySelectorAll("section.pdi-actions").length, 1);
});

test("persistent dice off (no dice list): nothing is added", () => {
  const el = render(disabledTabElement());
  assert.equal(el.querySelectorAll(".pdi-btn").length, 0);
});

test("'+ ×' with 8 in the box spawns 8 d6 through persistent.spawn, one at a time, no link group", async () => {
  fresh();
  const el = render();
  const row = rowOf(el, "d6");
  const input = row.querySelector(".pdi-count");
  input.value = "8";
  row.querySelector(".pdi-spawn").click();
  await flush();
  assert.deepEqual(spawnCalls(), Array.from({ length: 8 }, () => ["spawn", "d6", {}]));
  assert.equal(D.list.length, 8);
  assert.ok(D.list.every(m => m.userData.ownerUserId === IDS.gm));
  // the next render (DSN re-renders on every spawn) keeps the count
  assert.equal(rowOf(render(), "d6").querySelector(".pdi-count").value, "8");
});

test("'+ ×' on d100 spawns linked tens + units pairs, like DSN's own +", async () => {
  fresh();
  const row = rowOf(render(), "d100");
  row.querySelector(".pdi-count").value = "2";
  row.querySelector(".pdi-spawn").click();
  await flush();
  const calls = spawnCalls();
  assert.deepEqual(calls.map(c => [c[1], c[2].digitPlace, !!c[2].linkGroupSecondary]), [
    ["d100", 0, false], ["d10", 1, true], ["d100", 0, false], ["d10", 1, true],
  ]);
  assert.equal(calls[0][2].linkGroupId, calls[1][2].linkGroupId);
  assert.notEqual(calls[0][2].linkGroupId, calls[2][2].linkGroupId);
  assert.equal(calls[0][2].linkGroupId.length, 16);
});

test("a typed count over the cap is clamped; DSN's dice limit stops the run with one warning", async () => {
  fresh();
  D = fakeDsn({ maxDice: 3 });
  game.dice3d = D.dice3d;
  const row = rowOf(render(), "d4");
  const input = row.querySelector(".pdi-count");
  input.value = "999";
  input.dispatch("change");
  assert.equal(input.value, String(MAX_COUNT));
  F.calls.length = 0;
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(String(args[0]));
  row.querySelector(".pdi-spawn").click();
  await flush();
  console.warn = warn;
  assert.deepEqual(warned, [`${MODULE} | Added 3 of 30 D4: Dice So Nice's dice limit was reached.`], "log.notify writes the console line too");
  assert.equal(D.list.length, 3);
  assert.equal(spawnCalls().length, 4, "the fourth call is refused and the run stops");
  const notes = F.calls.filter(c => c.op === "notify");
  assert.deepEqual(notes, [{ op: "notify", level: "warn", message: "Added 3 of 30 D4: Dice So Nice's dice limit was reached." }]);
});

test("a second click while a run is spawning is ignored", async () => {
  fresh();
  const row = rowOf(render(), "d8");
  row.querySelector(".pdi-count").value = "3";
  const btn = row.querySelector(".pdi-spawn");
  btn.click();
  assert.equal(btn.disabled, true);
  btn.click();
  await flush();
  assert.equal(spawnCalls().length, 3);
  assert.equal(btn.disabled, false);
});

test("Select all mine adds only this user's dice (pairs whole, guests never) and redraws the outlines", () => {
  fresh();
  const a = D.make("d6");
  D.make("d6", { ownerUserId: IDS.player });
  const p = D.make("d100", { linkGroupId: "lg00000000000001", digitPlace: 0 });
  const q = D.make("d10", { linkGroupId: "lg00000000000001", linkGroupSecondary: true, digitPlace: 1 });
  D.make("d20", { guest: true });
  render().querySelector(".pdi-select-all").click();
  assert.deepEqual([...D.selected].sort(), [a.id, p.id, q.id].sort());
  assert.deepEqual(D.calls.at(-1), ["outlines", 3]);
});

test("Select all <type> unions into the selection; Clear selection is DSN's own clear", () => {
  fresh();
  const six = [D.make("d6"), D.make("d6")];
  const eight = D.make("d8");
  D.make("d20");
  const el = render();
  rowOf(el, "d6").querySelector(".pdi-select-type").click();
  assert.deepEqual([...D.selected], six.map(m => m.id));
  rowOf(el, "d8").querySelector(".pdi-select-type").click();
  assert.deepEqual([...D.selected], [...six, eight].map(m => m.id));
  el.querySelector(".pdi-clear").click();
  assert.equal(D.selected.size, 0);
  assert.deepEqual(D.calls.at(-1), ["outlines", 0]);
});

test("Select all <type> with none of that type: no redraw, nothing selected", () => {
  fresh();
  D.make("d6");
  rowOf(render(), "d12").querySelector(".pdi-select-type").click();
  assert.equal(D.selected.size, 0);
  assert.deepEqual(D.calls, []);
});

test("the setting off: the render hook adds nothing; turning it back on redraws the tab", async () => {
  const before = renders;
  await game.settings.set(MODULE, "enabled", false);
  assert.equal(renders, before + 1, "onChange re-renders DSN's tab");
  const el = render();
  assert.equal(el.querySelectorAll(".pdi-btn").length, 0);
  D.make("d6");
  assert.equal(game.keybindings.actions.get(`${MODULE}.selectAll`).onDown(), false, "the shortcut is off too");
  await game.settings.set(MODULE, "enabled", true);
  assert.equal(renders, before + 2);
  assert.equal(render().querySelectorAll(".pdi-count").length, 7);
});

test("Dice So Nice inactive: the shortcut passes the key on and the buttons do nothing", async () => {
  game.modules.get("dice-so-nice").active = false;
  try {
    fresh();
    D.make("d6");
    assert.equal(game.keybindings.actions.get(`${MODULE}.selectAll`).onDown(), false);
    const el = render();
    el.querySelector(".pdi-select-all").click();
    rowOf(el, "d6").querySelector(".pdi-spawn").click();
    await flush();
    assert.equal(D.selected.size, 0);
    assert.equal(spawnCalls().length, 0);
  } finally {
    game.modules.get("dice-so-nice").active = true;
  }
});
