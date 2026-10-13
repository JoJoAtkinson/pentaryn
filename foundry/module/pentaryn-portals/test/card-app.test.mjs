// The Portal card window (PortalCard: preview, edit toggle, every edit control), linkRegions,
// destinationsOf / teleportBehaviors / toAbsolute. Characterisation of 0.4.4: unchanged code.
// Render goldens depend on the scenes in game.scenes: keep the edit render the first test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinJSON } from "./kit/harness.mjs";
import { boot, MODULE, P1, GM } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
await W.tick();
const P = places(W);
const writes = n => W.callsSince(n, ["update", "createEmbedded", "app.render", "app.close", "FilePicker", "FilePicker.render", "scene.view", "animatePan"]);

test("edit mode: passage head, a card per destination, the add-destination list (golden/card-edit.json)", async () => {
  const app = await S.PortalCard.open(P.fork, { edit: true });
  assert.equal(app.id, `pentaryn-portal-card-${P.fork.id}`);
  assert.equal(app.title, "Portal card — Fork");
  assert.equal(S.editing.has(P.fork.uuid), true);
  const frame = app.element;
  pinJSON("card-edit", { content: frame.querySelector(".window-content").innerHTML, toggle: frame.querySelector(".ppt-toggle").outerHTML }, import.meta.url);
  await app.close();
  assert.equal(S.editing.has(P.fork.uuid), false);
});

test("DEFAULT_OPTIONS (classes, window, position)", () => {
  assert.deepEqual(S.PortalCard.DEFAULT_OPTIONS, {
    classes: ["ppt-app", "ppt-dialog"],
    window: { title: "Portal card", icon: "fa-solid fa-door-open", resizable: true },
    position: { width: 600, height: "auto" },
  });
});

test("preview mode: what a player sees; sealed and unrevealed notes (golden/card-preview.json); no edit listeners", async () => {
  const open = await S.PortalCard.open(P.passage);
  const secret = await S.PortalCard.open(P.secret, { edit: false });
  assert.equal(S.editing.size, 0);
  pinJSON("card-preview", {
    open: open.element.querySelector(".window-content").innerHTML,
    sealedUnrevealed: secret.element.querySelector(".window-content").innerHTML,
  }, import.meta.url);
  const content = open.element.querySelector(".window-content");
  assert.equal(content.querySelectorAll("*").some(el => el.listeners.length), false);
});

test("PortalCard.open as a player → null, nothing rendered", () => {
  F.become({ userId: P1 });
  const n = F.calls.length;
  assert.equal(S.PortalCard.open(P.passage, { edit: true }), null);
  F.become({ userId: GM });
  assert.deepEqual(writes(n), []);
});

test("the header toggle flips edit mode, marks the region for dragging, re-renders", async () => {
  const app = await S.PortalCard.open(P.passage);
  const box = app.element.querySelector(".ppt-toggle input");
  box.checked = true;
  const n = F.calls.length;
  await box.fire("change", { target: box });
  await W.flush();
  assert.equal(app.edit, true);
  assert.equal(S.editing.has(P.passage.uuid), true);
  assert.ok(app.element.querySelector(".ppt-passage"));
  assert.deepEqual(writes(n).map(c => c.op), ["app.render"]);
  await app.close();
});

test("edit controls: name, open (sealed), revealed and choice switches write the region / every teleport behavior", async () => {
  const app = await S.PortalCard.open(P.fork, { edit: true });
  const c = app.element.querySelector(".window-content");
  const set = async (key, v) => {
    const el = c.querySelector(`[data-set="${key}"]`);
    if (typeof v === "boolean") el.checked = v; else el.value = v;
    await el.fire("change");
  };
  const n = F.calls.length;
  await set("name", "North fork");
  await set("open", false);
  await set("revealed", false);
  await set("choice", false);
  // [declared] C59: the behaviour switches write one batch through the region (was one update each).
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]).map(x => x.op === "update" ? [x.uuid, x.changes] : [x.parent, x.type, x.updates]), [
    [P.fork.uuid, { name: "North fork" }],
    [P.fork.uuid, { hidden: true }],
    [P.fork.uuid, "RegionBehavior", [{ _id: P.bFork.id, "system.revealed": false }]],
    [P.fork.uuid, "RegionBehavior", [{ _id: P.bFork.id, "system.choice": false }]],
  ]);
  assert.equal(P.bFork.system.revealed, false);
  assert.equal(P.bFork.system.choice, false);
  await app.close();
});

test("[declared] C59: a switch on a region with two teleport behaviours is one write for both", async () => {
  const P = places(W, "C59");
  const second = W.behavior(P.fork, { id: "BhvForkC59b", destinations: [P.stair.uuid] });
  const app = await S.PortalCard.open(P.fork, { edit: true });
  const el = app.element.querySelector('.window-content [data-set="revealed"]');
  el.checked = false;
  const n = F.calls.length;
  await el.fire("change");
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]).map(x => [x.op, x.parent, x.updates]), [
    ["updateEmbedded", P.fork.uuid, [{ _id: P.bFork.id, "system.revealed": false }, { _id: second.id, "system.revealed": false }]],
  ]);
  assert.deepEqual(W.callsSince(n, ["Hooks.callAll"]).map(x => x.name), ["updateRegionBehavior", "updateRegionBehavior"], "hooks still fire per behaviour");
  await app.close();
});

test("edit controls on a card: title, description, pick (FilePicker + callback), snap, clear image, look", async t => {
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  const app = await S.PortalCard.open(P.fork, { edit: true });
  const c = app.element.querySelector(".window-content");
  const card = c.querySelector(`.ppt-editcard[data-uuid="${P.pitGate.uuid}"]`);
  let n = F.calls.length;
  const title = card.querySelector('[data-f="title"]');
  title.value = "Sand Pit";
  await title.fire("change");
  const desc = card.querySelector('[data-f="description"]');
  desc.value = "Hot.";
  await desc.fire("change");
  assert.deepEqual(W.callsSince(n, ["update"]).map(x => x.changes), [{ "flags.pentaryn-portals.title": "Sand Pit" }, { "flags.pentaryn-portals.description": "Hot." }]);

  n = F.calls.length;
  await card.querySelector('[data-act="pick"]').click();
  await card.querySelector(".ppt-thumb").click();
  assert.deepEqual(W.callsSince(n, ["FilePicker", "FilePicker.render"]), [
    { op: "FilePicker", type: "image", current: "cards/pit.webp?v=abc" }, { op: "FilePicker.render", force: true },
    { op: "FilePicker", type: "image", current: "cards/pit.webp?v=abc" }, { op: "FilePicker.render", force: true },
  ]);

  n = F.calls.length;
  await card.querySelector('[data-act="snap"]').click();
  await W.flush();
  const snapped = `assets/tokens/custom/portals/${P.pit.id}-${P.pitGate.id}.webp?v=${(1700000000000).toString(36)}`;
  assert.equal(card.querySelector(".ppt-thumb").src, snapped);
  assert.deepEqual(W.callsSince(n, ["update"]).map(x => x.changes), [{ "flags.pentaryn-portals.img": snapped }]);

  n = F.calls.length;
  await card.querySelector('[data-act="clearimg"]').click();
  // hygiene: flagPath + _del (core's ForcedDeletion), no longer the deprecated `-=img` key
  assert.deepEqual(W.callsSince(n, ["update"]).map(x => x.changes), [{ "flags.pentaryn-portals.img": "<_del>" }]);
  assert.equal(P.pitGate.flags[MODULE].img, undefined);
  assert.equal(W.callsSince(n, ["app.render"]).length, 1);

  n = F.calls.length;
  F.canvas.scene = P.prison;
  await card.querySelector('[data-act="look"]').click();
  await W.flush();
  assert.deepEqual(W.callsSince(n, ["scene.view", "animatePan"]).map(x => x.op), ["scene.view", "animatePan"]);
  await app.close();
});

test("the FilePicker callback writes the chosen image and refreshes the thumbnail", async () => {
  const app = await S.PortalCard.open(P.passage, { edit: true });
  const card = app.element.querySelector(".ppt-editcard");
  let picker = null;
  const real = foundry.applications.apps.FilePicker.implementation;
  foundry.applications.apps.FilePicker.implementation = class extends real { constructor(o) { super(o); picker = this; } };
  await card.querySelector('[data-act="pick"]').click();
  foundry.applications.apps.FilePicker.implementation = real;
  const n = F.calls.length;
  await picker.opts.callback("cards/new.webp");
  assert.deepEqual(W.callsSince(n, ["update"]).map(x => x.changes), [{ "flags.pentaryn-portals.img": "cards/new.webp" }]);
  assert.equal(card.querySelector(".ppt-thumb").src, "cards/new.webp");
  await app.close();
});

test("unlink: removes the destination (relative or absolute entry) from every behavior that has it, re-renders", async () => {
  const Q = places(W, "U");
  const app = await S.PortalCard.open(Q.fork, { edit: true });
  const c = app.element.querySelector(".window-content");
  let n = F.calls.length;
  await c.querySelector(`.ppt-editcard[data-uuid="${Q.cell.uuid}"] [data-act="unlink"]`).click();
  // [declared] C59: one batched write through the region (was one update per behaviour).
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]).map(x => [x.op, x.parent, x.updates]),
    [["updateEmbedded", Q.fork.uuid, [{ _id: Q.bFork.id, "system.destinations": [Q.pitGate.uuid] }]]]);
  assert.equal(W.callsSince(n, ["app.render"]).length, 1);
  await app.close();
});

test("add a destination: one-way links from here; two-way (default) also links back; empty choice → nothing", async () => {
  const Q = places(W, "A");
  const app = await S.PortalCard.open(Q.passage, { edit: true });
  const c = app.element.querySelector(".window-content");
  const sel = c.querySelector('[data-act="addsel"]');
  let n = F.calls.length;
  await sel.fire("change", { target: { value: "" } });
  assert.deepEqual(writes(n), []);
  n = F.calls.length;
  await sel.fire("change", { target: { value: Q.stair.uuid } });
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]).map(x => [x.op, x.uuid ?? x.parent]), [
    ["update", Q.bPassage.uuid],
    ["createEmbedded", Q.stair.uuid],
  ]);
  c.querySelector('[data-act="twoway"]').checked = false;
  n = F.calls.length;
  await sel.fire("change", { target: { value: Q.cell.uuid } });
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]).map(x => [x.op, x.uuid ?? x.parent]), [["update", Q.bPassage.uuid]]);
  await app.close();
});

test("linkRegions: (a) adds to the existing behavior, (b) no-op when already linked (relative entry), (c) creates a revealed asking fading teleport (golden)", async () => {
  const Q = places(W, "L");
  let n = F.calls.length;
  await S.linkRegions(Q.passage, Q.stair);
  assert.deepEqual(W.callsSince(n, ["update"]).map(x => x.changes), [{ "system.destinations": [Q.pitGate.uuid, Q.stair.uuid] }]);
  n = F.calls.length;
  await S.linkRegions(Q.fork, Q.cell);
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]), []);
  n = F.calls.length;
  await S.linkRegions(Q.cell, Q.fork);
  const made = W.callsSince(n, ["createEmbedded"]);
  pinJSON("link-create", made, import.meta.url);
  assert.equal(S.teleportBehaviors(Q.cell).length, 1);
});

test("linkRegions: a disabled teleport behavior does not count → a new one is created", async () => {
  const Q = places(W, "D");
  Q.bPassage.disabled = true;
  const n = F.calls.length;
  await S.linkRegions(Q.passage, Q.cell);
  assert.deepEqual(W.callsSince(n, ["update", "createEmbedded"]).map(x => x.op), ["createEmbedded"]);
});

test("destinationsOf / teleportBehaviors / toAbsolute", () => {
  const Q = places(W, "T");
  assert.deepEqual(S.destinationsOf(Q.fork).map(d => [d.region.uuid, d.behavior.id]), [[Q.pitGate.uuid, Q.bFork.id], [Q.cell.uuid, Q.bFork.id]]);
  W.behavior(Q.cell, { id: "BhvCellOff", disabled: true, destinations: [Q.pitGate.uuid] });
  W.behavior(Q.cell, { id: "BhvCellScript", type: "executeScript" });
  W.behavior(Q.cell, { id: "BhvCellGhost", destinations: ["Scene.Gone.Region.Gone", Q.stair.uuid] });
  assert.deepEqual(S.teleportBehaviors(Q.cell).map(b => b.id), ["BhvCellGhost"]);
  assert.deepEqual(S.destinationsOf(Q.cell).map(d => d.region.uuid), [Q.stair.uuid]);
  const abs = S.toAbsolute(Q.bFork);
  assert.equal(abs(`..${Q.cell.id}`), Q.cell.uuid);
  assert.equal(abs(Q.pitGate.uuid), Q.pitGate.uuid);
  assert.equal(abs(42), null);
});

test("gaps: edit mode with no destinations says so", async () => {
  const Q = places(W, "E");
  const app = await S.PortalCard.open(Q.cell, { edit: true });
  assert.match(app.element.querySelector(".window-content").innerHTML, /<div class="ppt-cards"><p class="hint">No destinations yet.<\/p><\/div>/);
  await app.close();
});

test("[declared] EXT-6: one frozen SWITCHES table drives both the passage switches' render and their change handler", async () => {
  const { SWITCHES } = await import("../card-app.mjs");
  assert.ok(Array.isArray(SWITCHES) && Object.isFrozen(SWITCHES), "SWITCHES is a frozen array");
  assert.deepEqual(SWITCHES.map(s => s.key), ["open", "revealed", "choice"]);
  for (const s of SWITCHES) {
    assert.ok(Object.isFrozen(s), `${s.key} row frozen`);
    assert.deepEqual(Object.keys(s), ["key", "label", "hint", "read", "write"]);
    assert.match(s.label, /^PENTARYN_PORTALS\.Card\./);
    assert.equal(s.hint, `${s.label}Hint`);
  }
  // no second list: the handler has no per-key branches, the render no per-key sw() calls
  const src = readFileSync(new URL("../card-app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /k === "(open|revealed|choice)"/);
  assert.doesNotMatch(src, /sw\("(open|revealed|choice)"/);

  const Q = places(W, "X6");
  const app = await S.PortalCard.open(Q.fork, { edit: true });
  const c = app.element.querySelector(".window-content");
  const behaviors = () => S.teleportBehaviors(Q.fork);
  // render: the switch row is exactly the table, in order, each checked from its own read()
  assert.deepEqual(c.querySelectorAll(".ppt-switches [data-set]").map(el => [el.dataset.set, el.hasAttribute("checked")]),
    SWITCHES.map(s => [s.key, s.read(Q.fork, behaviors())]));
  // handler: a change writes through the row's write(region, behaviors, on)
  const el = c.querySelector('[data-set="choice"]');
  el.checked = false;
  const n = F.calls.length;
  await el.fire("change");
  assert.deepEqual(W.callsSince(n, ["update", "updateEmbedded"]).map(x => [x.parent, x.updates]), [[Q.fork.uuid, [{ _id: Q.bFork.id, "system.choice": false }]]]);
  assert.equal(SWITCHES[2].read(Q.fork, behaviors()), false);
  // read/write straight off the table
  const open = SWITCHES[0];
  assert.equal(open.read(Q.fork, behaviors()), true);
  await open.write(Q.fork, behaviors(), false);
  assert.equal(Q.fork.hidden, true);
  assert.equal(open.read(Q.fork, behaviors()), false);
  await app.close();
});
