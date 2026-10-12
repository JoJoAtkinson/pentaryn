// strip.mjs: the swing strip's keys, the roll windows docked above it while a sequence runs (and
// kept on screen otherwise), focus for Enter, and the weapon picker (guide S1; S6a moves the
// docking into a roll-dock feature installed FIRST — these pins are its oracle).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc } = W;
const lines = captureConsole();
await import("../combat.mjs");                    // the roll-window hooks register with the entry (roll-dock, guide S6a)
const strip = await import("../strip.mjs");
(await import("../settings.mjs")).registerSettings();
F.calls.length = 0;

const ctx = (o = {}) => ({ numbers: { current: 2, total: 3 }, status: "running", weapon: "Longsword", title: "Full Attack", kind: "main", quick: false, target: "Goblin", ...o });
const stripEl = () => doc.getElementById("pentaryn-combat-strip");

/** A dnd5e roll window: `.application.roll-configuration` with a title and a default button. */
function rollWindow({ id = "roll-1", rect = { left: 600, top: 500, width: 400, height: 300 }, autofocus = "normal", cls = "roll-configuration", z = 100 } = {}) {
  const el = doc.createElement("div");
  el.id = id;
  el.className = `application ${cls}`;
  el.style.zIndex = String(z);
  el._rect = rect;
  el.innerHTML = `<header><h1 class="window-title">Longsword: Attack Roll</h1></header><button type="button" data-action="advantage">Adv</button><button type="button" data-action="${autofocus}" autofocus>Go</button><button type="button" data-action="disadvantage">Dis</button><input type="text" class="formula">`;
  doc.body.append(el);
  const app = {
    id, element: el, window: { title: el.querySelector("h1") }, position: { left: rect.left, top: rect.top },
    closed: 0, positions: [],
    setPosition(p) { this.positions.push({ ...p }); Object.assign(this.position, p); el._rect = { ...el._rect, ...p }; },
    close() { this.closed += 1; return Promise.resolve(); },
  };
  F.foundry.applications.instances.set(id, app);
  return app;
}

test("the HUD anchor: the strip's bottom sits 8 px above Argon's action row (120 px with no HUD)", () => {
  strip.show(ctx(), {});
  assert.equal(stripEl().style.bottom, "120px");
  const hud = doc.createElement("div");
  hud.className = "extended-combat-hud";
  const row = doc.createElement("div");
  row.className = "action-hud";
  row._rect = { left: 300, top: 700, width: 900, height: 150 };
  hud.append(row);
  doc.body.append(hud);
  strip.update(ctx());
  assert.equal(stripEl().style.bottom, `${900 - 700 + 8}px`);
  row._rect = { left: 300, top: 895, width: 900, height: 5 };
  strip.update(ctx());
  assert.equal(stripEl().style.bottom, "13px", "never below 8 px");
  hud.remove();
  strip.hide();
});

test("the strip's HTML: running, paused, a kind, several targets, no target (golden/strip-html.json)", () => {
  const out = {};
  strip.show(ctx(), {});
  out.running = stripEl().innerHTML;
  strip.update(ctx({ kind: "nick", target: null, adv: "advantage", quick: true }));
  out.nickNoTargetAdvQuick = stripEl().innerHTML;
  strip.update(ctx({ status: "paused", note: "flurry", weapons: [{ id: "a", name: "Dagger", img: "d.webp", stats: "+5 · 1d4 + 3" }, { id: "b", name: "Sword", img: "s.webp", stats: "" }] }));
  out.pausedTiles = stripEl().innerHTML;
  strip.update(ctx({ status: "paused", weapons: [{ id: "a", name: "Dagger", img: "d.webp" }] }));
  out.pausedOneWeapon = stripEl().innerHTML;
  strip.update(ctx({ title: "<b>x</b>", weapon: "A & B", target: '"Q"' }));
  out.escaped = stripEl().innerHTML;
  pinJSON("strip-html", out, import.meta.url);
  assert.equal(stripEl().className, "pentaryn-combat-strip");
  strip.hide();
});

test("Esc: paused → Stop; running with a roll window's button focused → closes that window; else nothing", async () => {
  const choices = [];
  strip.show(ctx({ status: "paused" }), {});
  const wait = strip.waitChoice(ctx({ status: "paused" }));
  let ev = await doc.fire("keydown", { key: "Escape" });
  assert.equal(ev.defaultPrevented, true);
  choices.push(await wait);
  strip.update(ctx({ status: "running" }));
  const app = rollWindow({ id: "roll-esc" });
  const btn = app.element.querySelector("button[autofocus]");
  ev = await doc.fire("keydown", { key: "Escape", target: btn });
  assert.equal(app.closed, 1);
  assert.equal(ev.propagationStopped, true);
  const input = app.element.querySelector("input");
  ev = await doc.fire("keydown", { key: "Escape", target: input });
  assert.equal(app.closed, 1, "a text field keeps its own Esc");
  ev = await doc.fire("keydown", { key: "Enter", target: btn });
  assert.equal(app.closed, 1);
  ev = await doc.fire("keydown", { key: "Escape", target: doc.body });
  assert.equal(app.closed, 1, "nothing focused: not the strip's business (turnflow's Esc handles it when no sequence runs)");
  assert.deepEqual(choices, [{ type: "stop" }]);
  strip.hide();
  ev = await doc.fire("keydown", { key: "Escape", target: btn });
  assert.equal(app.closed, 1, "hidden strip: its listener is gone");
  app.element.remove();
  F.foundry.applications.instances.clear();
});

test("strip buttons: Adv while running goes to onAdv; Stop runs the cancel callbacks, onStop, then choose(stop)", async () => {
  const seen = [];
  strip.show(ctx(), { onAdv: v => seen.push(["adv", v]), onStop: () => seen.push(["stop"]), onQuick: on => seen.push(["quick", on]) });
  strip.onceCancel(() => seen.push(["cancel"]));
  const el = stripEl();
  await el.fire("click", { target: el.querySelector('[data-pc="adv"][data-value="disadvantage"]') });
  const box = el.querySelector('[data-pc="quick"]');
  box.checked = true;
  await el.fire("change", { target: box });
  await el.fire("click", { target: box });
  await el.fire("click", { target: el.querySelector(".pc-head") });
  const wait = strip.waitChoice(ctx());
  await el.fire("click", { target: el.querySelector('[data-pc="stop"]') });
  assert.deepEqual(await wait, { type: "stop" });
  assert.deepEqual(seen, [["adv", "disadvantage"], ["quick", true], ["cancel"], ["stop"]]);
  strip.hide();
});

test("docking while running: every roll window's bottom edge above the strip, titled 'swing i of n' (golden/strip-dock.json)", async () => {
  strip.show(ctx({ numbers: { current: 2, total: 3 }, kind: "nick", weapon: "Dagger" }), {});
  stripEl()._rect = { left: 400, top: 760, width: 800, height: 60 };
  const app = rollWindow({ id: "roll-dock" });
  F.Hooks.callAll("renderRollConfigurationDialog", app);
  const atRender = { positions: [...app.positions], title: app.window.title.textContent, dock: { ...app._pcDock } };
  doc.flushFrames();
  const afterFrame = [...app.positions];
  // focus: the default button, after a frame and again at 150 ms
  assert.equal(doc.activeElement, app.element.querySelector("button[autofocus]"));
  doc.activeElement = doc.body;
  mock.timers.tick(150);
  assert.equal(doc.activeElement, app.element.querySelector("button[autofocus]"));
  // the strip's keys line names the window's default button
  const keys = stripEl().querySelector(".pc-keys").textContent;
  // a second render does not double the title tag
  F.Hooks.callAll("renderRollConfigurationDialog", app);
  doc.flushFrames();
  const title2 = app.window.title.textContent;
  // a drag by the player: kept for this session's later windows
  app.position.left = 100;
  app.position.top = 200;
  F.Hooks.callAll("closeRollConfigurationDialog", app);
  const next = rollWindow({ id: "roll-dock-2" });
  F.Hooks.callAll("renderRollResolver", next);
  doc.flushFrames();
  pinJSON("strip-dock", { atRender, afterFrame, keys, title2, nextPositions: next.positions, nextTitle: next.window.title.textContent }, import.meta.url);
  assert.ok(atRender.title.endsWith("· Dagger · swing 2 of 3 (Nick)") || atRender.title.includes("2"), atRender.title);
  strip.hide();
  for (const a of [app, next]) a.element.remove();
  F.foundry.applications.instances.clear();
});

test("Enter's label follows the window's autofocused button (Advantage under Reckless)", () => {
  strip.show(ctx(), {});
  const app = rollWindow({ id: "roll-adv", autofocus: "advantage" });
  F.Hooks.callAll("renderRollConfigurationDialog", app);
  doc.flushFrames();
  const adv = stripEl().querySelector(".pc-keys").textContent;
  const other = rollWindow({ id: "roll-odd", autofocus: "bogus" });
  F.Hooks.callAll("renderRollConfigurationDialog", other);
  doc.flushFrames();
  const normal = stripEl().querySelector(".pc-keys").textContent;
  assert.notEqual(adv, normal);
  assert.ok(adv.includes(F.game.i18n.localize("PENTARYN_COMBAT.Strip.Action.advantage")));
  strip.hide();
  for (const a of [app, other]) a.element.remove();
  F.foundry.applications.instances.clear();
});

test("no docking while paused, picking, with one swing, or with the setting off; outside a sequence a window is kept on screen", async () => {
  const rows = [];
  const look = (label, setup) => {
    const app = rollWindow({ id: `roll-${rows.length}`, rect: { left: 1400, top: 800, width: 400, height: 300 } });
    setup?.();
    F.Hooks.callAll("renderRollConfigurationDialog", app);
    doc.flushFrames();
    rows.push({ label, positions: app.positions, title: app.window.title.textContent });
    app.element.remove();
  };
  look("no strip: clamped into the viewport");
  strip.show(ctx({ status: "paused" }), {});
  look("paused: clamped, not docked");
  strip.update(ctx());
  strip.picking(true);
  look("picking a target");
  strip.picking(false);
  strip.update(ctx({ numbers: { current: 1, total: 1 } }));
  look("a one-swing sequence: docked, no title tag");
  await F.game.settings.set(MODULE, "dockRollDialogs", false);
  look("setting off: left where dnd5e put it");
  await F.game.settings.set(MODULE, "dockRollDialogs", true);
  strip.hide();
  const notConnected = rollWindow({ id: "roll-detached" });
  notConnected.element.remove();
  F.Hooks.callAll("renderRollConfigurationDialog", notConnected);
  doc.flushFrames();
  rows.push({ label: "detached window", positions: notConnected.positions });
  pinJSON("strip-no-dock", rows, import.meta.url);
  F.foundry.applications.instances.clear();
});

test("a throw while docking is warned; a close of a never-docked window is fine", () => {
  strip.show(ctx(), {});
  const app = rollWindow({ id: "roll-bad" });
  app.window = { get title() { throw new Error("no title"); } };
  F.Hooks.callAll("renderRollConfigurationDialog", app);
  assert.deepEqual(lines.splice(0), [{ level: "warn", text: "pentaryn-combat | roll window dock", err: "no title" }]);
  F.Hooks.callAll("closeRollResolver", { position: null });
  F.Hooks.callAll("closeRollConfigurationDialog", null);
  assert.deepEqual(lines, []);
  strip.hide();
  app.element.remove();
  F.foundry.applications.instances.clear();
});

test("focusRollWindow: the top window's default button; never from a text field elsewhere; force", async () => {
  assert.equal(strip.focusRollWindow(), false, "no window");
  const low = rollWindow({ id: "roll-low", z: 50 });
  const top = rollWindow({ id: "roll-top", z: 200 });
  assert.equal(strip.focusRollWindow(), true);
  assert.equal(doc.activeElement, top.element.querySelector("button[autofocus]"));
  doc.activeElement = top.element.querySelector("[data-action='advantage']");
  assert.equal(strip.focusRollWindow(), true, "focus already inside: left alone");
  assert.equal(doc.activeElement.dataset.action, "advantage");
  assert.equal(strip.focusRollWindow({ force: true }), true);
  assert.equal(doc.activeElement.dataset.action, "normal");
  const chat = doc.createElement("textarea");
  doc.body.append(chat);
  doc.activeElement = chat;
  assert.equal(strip.focusRollWindow({ force: true }), false, "typing in chat");
  top.element.querySelector("button[autofocus]").removeAttribute("autofocus");
  doc.activeElement = doc.body;
  assert.equal(strip.focusRollWindow(), true, "no autofocus: the Normal button");
  await F.game.settings.set(MODULE, "dockRollDialogs", false);
  assert.equal(strip.focusRollWindow(), false, "setting off");
  await F.game.settings.set(MODULE, "dockRollDialogs", true);
  for (const a of [low, top]) a.element.remove();
  chat.remove();
  F.foundry.applications.instances.clear();
});

test("pickWeapon: tiles (golden/picker-html.json), a click picks, Esc or a click outside closes with null", async () => {
  const tiles = [
    { id: "longsword", name: "Longsword", img: "l.webp", toHit: "+5", damage: "1d8 + 3 Slashing", swings: 2 },
    { id: "dagger", name: "Dagger", img: "d.webp", toHit: "+5", damage: "", swings: 2 },
  ];
  let p = strip.pickWeapon(tiles, { title: "Full Attack with…" });
  const el = doc.body.querySelector(".pentaryn-combat-picker");
  pinJSON("picker-html", { html: el.innerHTML, bottom: el.style.bottom }, import.meta.url);
  assert.deepEqual(doc.listeners.filter(l => l.type === "pointerdown").length, 0, "outside-click listener only after a tick");
  mock.timers.tick(0);
  await el.fire("click", { target: el.querySelector('button[data-id="dagger"] .pc-name') });
  assert.equal(await p, "dagger");
  assert.equal(doc.body.querySelector(".pentaryn-combat-picker"), null);
  assert.equal(doc.listeners.filter(l => ["pointerdown"].includes(l.type)).length, 0);
  p = strip.pickWeapon(tiles);
  mock.timers.tick(0);
  const ev = await doc.fire("keydown", { key: "Escape" });
  assert.equal(await p, null);
  assert.equal(ev.defaultPrevented, true);
  p = strip.pickWeapon(tiles);
  mock.timers.tick(0);
  const inside = doc.body.querySelector(".pentaryn-combat-picker button");
  await doc.fire("pointerdown", { target: inside });
  await doc.fire("pointerdown", { target: doc.body });
  assert.equal(await p, null);
  p = strip.pickWeapon(tiles);
  const p2 = strip.pickWeapon(tiles);
  assert.equal(doc.body.querySelectorAll(".pentaryn-combat-picker").length, 1, "a second picker replaces the first");
  mock.timers.tick(0);
  await doc.fire("keydown", { key: "Escape" });
  assert.equal(await p2, null);
  assert.equal(await p, null, "the replaced picker settles null on that same Esc");
});

test("pickWeapon: a replaced picker never closes the new one — a click elsewhere settles both, no listener left", async () => {
  const tiles = [
    { id: "longsword", name: "Longsword", img: "l.webp", toHit: "+5", damage: "", swings: 2 },
    { id: "dagger", name: "Dagger", img: "d.webp", toHit: "+5", damage: "", swings: 2 },
  ];
  const count = type => doc.listeners.filter(l => l.type === type).length;
  const keys = count("keydown");
  const p = strip.pickWeapon(tiles);
  const p2 = strip.pickWeapon(tiles);
  mock.timers.tick(0);
  await doc.fire("pointerdown", { target: doc.body });
  const pending = Symbol("pending");
  const race = q => Promise.race([q, new Promise(r => setImmediate(() => r(pending)))]);
  assert.equal(await race(p2), null, "the new picker settles null on a click elsewhere");
  assert.equal(await race(p), null);
  assert.equal(doc.body.querySelector(".pentaryn-combat-picker"), null);
  assert.equal(count("pointerdown"), 0);
  assert.equal(count("keydown"), keys);
  const ev = await doc.fire("keydown", { key: "Escape" });
  assert.equal(ev.defaultPrevented, false, "no leaked picker listener eats a later Esc");
});
