// Glue: install the Foundry stub (plus the client pieces in fixtures/world.mjs), load the entry
// exactly as Foundry would, fire the lifecycle, and pin EFFECTS — ring entries, toolbar shape,
// files written, flags changed, queries sent, console text. Time is mocked (Date only): the render
// throttle and the error de-dup are driven by mock.timers.tick, never by real waiting.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, WORLD, installClient, memoryStore, queuedReport, settle } from "./fixtures/world.mjs";
import { DIALOG_ID, LIMITS, MODULE, NS } from "../feedback-core.mjs";

const T0 = Date.UTC(2026, 9, 11, 19, 0, 0);
mock.timers.enable({ apis: ["Date"], now: T0 });

const waiting = queuedReport("waitingreport001", { text: "filed while no GM was on" });
const F = await installClient({ queue2: { [waiting.id]: waiting } });
const consoleLines = [];
const original = { error: console.error, warn: console.warn, info: console.info };
console.error = (...args) => consoleLines.push(["error", args.map(String).join(" ")]);
console.warn = (...args) => consoleLines.push(["warn", args.map(String).join(" ")]);
console.info = (...args) => consoleLines.push(["info", args.map(String).join(" ")]);

const { useStore } = await import("../files-adapter.mjs");
const { actionsOf, errorsOf } = await import("../recorder.mjs");
const { ReportDialog } = await import("../dialog.mjs");
const mem = memoryStore();
useStore(mem);

await import("../feedback.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await settle();
const api = game.modules.get(MODULE).api;
const player = game.users.get(IDS.player);
const player2 = game.users.get(IDS.player2);
const queueOf = user => user.flags?.[MODULE]?.queue ?? {};
const lastAction = () => actionsOf().at(-1);
/** Let the reporter's 5 s gap and the GM's filing bucket (5 at once, then one per 5 s) fully refill. */
const refill = () => mock.timers.tick(LIMITS.queueMax * LIMITS.submitGapMs);
const clearRings = () => {
  // the rings are module state; the recorder's uninstall/install is the only reset, so tests read deltas
  return actionsOf().length;
};

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("published at ready: module.api is canonical, game.pentaryn alias, both ready hooks", () => {
  assert.ok(api, "module.api not set");
  assert.equal(game.pentaryn[NS], api);
  assert.equal(api.contract, `${MODULE}/api@1`);
  assert.ok(Object.isFrozen(api));
  const emitted = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(emitted.includes(`${MODULE}.ready`) && emitted.includes("pentaryn.ready"));
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
});

test("ready: the active GM files a queue left by a player who filed with no GM online", () => {
  const path = `pentaryn-feedback/${WORLD}/${waiting.id}.json`;
  assert.ok(mem.files.has(path), "the waiting report was filed at ready");
  const filed = mem.files.get(path);
  assert.deepEqual(filed.user, { id: IDS.player2, name: "Mira's player", role: 1, isGM: false, character: null });
  assert.equal(filed.receivedAt, null, "no per-tab time: two GM tabs write the same bytes");
  assert.deepEqual(queueOf(player2), {}, "the flag key is deleted once filed");
  const audit = consoleLines.filter(([lvl, line]) => lvl === "info" && line.startsWith(`${MODULE} | filed`));
  assert.equal(audit.length, 1, "one audit line per cross-user write");
});

/* ── the toolbar ─────────────────────────────────────────────────────── */

test("getSceneControlButtons adds a bug button to the token tools: every user, a button, order 90", () => {
  const controls = { tokens: { name: "tokens", tools: { select: { name: "select", order: 1 } } }, walls: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const tool = controls.tokens.tools.feedback;
  pinJSON("toolbar", { ...tool, onChange: typeof tool.onChange }, import.meta.url);
  assert.equal("visible" in tool, false, "no visible: players see it too");
  assert.equal(tool.button, true);
  assert.equal(tool.toggle, undefined);
  assert.deepEqual(Object.keys(controls.walls.tools), [], "only the token group");
  F.fire("getSceneControlButtons", {});             // no tokens group: tolerated
  F.fire("getSceneControlButtons", undefined);
});

test("the bug button opens the dialog, Bug selected, with the help text on each category", async () => {
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const before = F.rendered.length;
  controls.tokens.tools.feedback.onChange({}, true);
  await settle();
  assert.equal(F.rendered.length, before + 1);
  const app = F.rendered.at(-1);
  assert.equal(app.id, DIALOG_ID);
  assert.equal(ReportDialog.current, app);
  const html = app.html;
  assert.match(html, /value="bug" checked/);
  assert.doesNotMatch(html, /value="defect" checked|value="feature" checked/);
  assert.ok(html.indexOf('value="bug"') < html.indexOf('value="defect"') && html.indexOf('value="defect"') < html.indexOf('value="feature"'));
  assert.match(html, /data-tooltip="It is just broken\. If you don&#x27;t know which to pick, Bug is a good default\."/);
  assert.match(html, /data-tooltip="It works, just not the way you expect, so it comes across as a bug\. If you don&#x27;t know, pick Bug\."/);
  assert.match(html, /data-tooltip="100% new: it does not exist yet, like a new tab or a new subsystem\."/);
  assert.match(html, /data-action="submit" disabled/, "Send is disabled while the text is empty");
  assert.match(html, /What gets attached/);
  await app.close();
  assert.equal(ReportDialog.current, null);
});

/* ── /bug ────────────────────────────────────────────────────────────── */

test("/bug <text> opens the dialog pre-filled and is not posted; other chat passes", async () => {
  const before = F.rendered.length;
  assert.equal(F.fireCall("chatMessage", {}, "/bug Loot all did <nothing>", {}), false, "the line is swallowed");
  await settle();
  const app = F.rendered.at(-1);
  assert.equal(F.rendered.length, before + 1);
  assert.match(app.html, /<textarea[^>]*>Loot all did &lt;nothing&gt;<\/textarea>/);
  assert.doesNotMatch(app.html, /data-action="submit" disabled/);
  assert.equal(F.fireCall("chatMessage", {}, "/roll 1d20", {}), true);
  assert.equal(F.fireCall("chatMessage", {}, "hello /bug", {}), true);
  await app.close();
});

test("/bug from Foundry 14's chat editor (<p>-wrapped HTML) opens the dialog and is not posted", async () => {
  const before = F.rendered.length;
  assert.equal(F.fireCall("chatMessage", {}, "<p>/bug ZZ live &amp; check</p>", {}), false, "the line is swallowed");
  await settle();
  const app = F.rendered.at(-1);
  assert.equal(F.rendered.length, before + 1);
  assert.match(app.html, /<textarea[^>]*>ZZ live &amp; check<\/textarea>/);
  assert.equal(F.fireCall("chatMessage", {}, "<p>/roll 1d20</p>", {}), true);
  assert.equal(F.fireCall("chatMessage", {}, "<p>hello /bug</p>", {}), true);
  await app.close();
});

test("api.open({ category, text }) pre-fills; an unknown category falls back to Bug", async () => {
  assert.deepEqual(await api.open({ category: "feature", text: "a map tab" }), { ok: true, open: true });
  assert.match(F.rendered.at(-1).html, /value="feature" checked/);
  assert.deepEqual(await api.open({ category: "nonsense" }), { ok: true, open: true });
  assert.match(F.rendered.at(-1).html, /value="bug" checked/);
  assert.equal(F.rendered.at(-1), F.rendered.at(-2), "one dialog at a time: the open one is re-rendered");
  await F.rendered.at(-1).close();
});

test("re-opening the dialog (second bug click, bare /bug) keeps what the player typed and picked; /bug <text> replaces only the text", async () => {
  await api.open({ category: "feature", text: "a loot log tab" });
  const app = F.rendered.at(-1);
  app.draft = { ...app.draft, text: "a loot log tab, sorted by time" };   // what the input listener does as they type
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  controls.tokens.tools.feedback.onChange({}, true);
  await settle();
  assert.equal(F.rendered.at(-1), app, "the same dialog");
  assert.match(app.html, /<textarea[^>]*>a loot log tab, sorted by time<\/textarea>/);
  assert.match(app.html, /value="feature" checked/);
  F.fireCall("chatMessage", {}, "/bug", {});
  await settle();
  assert.match(app.html, />a loot log tab, sorted by time<\/textarea>/, "bare /bug keeps the text");
  assert.match(app.html, /value="feature" checked/);
  F.fireCall("chatMessage", {}, "/bug the map tab", {});
  await settle();
  assert.match(app.html, />the map tab<\/textarea>/);
  assert.match(app.html, /value="feature" checked/, "the category stays");
  await app.close();
  await api.open();
  assert.match(F.rendered.at(-1).html, /value="bug" checked/, "a fresh dialog starts at Bug");
  assert.match(F.rendered.at(-1).html, /<textarea[^>]*><\/textarea>/);
  await F.rendered.at(-1).close();
});

test("two open() calls racing the first render share one dialog and keep both drafts", async () => {
  const before = F.rendered.length;
  await Promise.all([api.open({ category: "feature", text: "one" }), api.open({ text: "two" })]);
  const apps = new Set(F.rendered.slice(before));
  assert.equal(apps.size, 1, "one dialog at a time");
  const app = F.rendered.at(-1);
  assert.match(app.html, />two<\/textarea>/);
  assert.match(app.html, /value="feature" checked/);
  await app.close();
});

/* ── the recorder ────────────────────────────────────────────────────── */

test("recorder: scene, tool (only on change), tab, control, own target", () => {
  const n = clearRings();
  F.fire("canvasReady", { scene: { id: IDS.scene, name: "Underdark Gate" } });
  F.fire("renderSceneControls", { control: { name: "tokens" }, tool: { name: "select" } });
  F.fire("renderSceneControls", { control: { name: "tokens" }, tool: { name: "select" } });
  F.fire("renderSceneControls", { control: { name: "tokens" }, tool: { name: "target" } });
  F.fire("changeSidebarTab", { constructor: { tabName: "chat" } });
  F.fire("controlToken", { name: "Caven", actor: { name: "Caven" } }, true);
  F.fire("targetToken", game.user, { name: "Goblin" }, true);
  F.fire("targetToken", player, { name: "Goblin" }, true);           // someone else's targeting
  const got = actionsOf().slice(n).map(({ t, ...rest }) => rest);
  assert.deepEqual(got, [
    { kind: "scene", id: IDS.scene, name: "Underdark Gate" },
    { kind: "tool", control: "tokens", tool: "select" },
    { kind: "tool", control: "tokens", tool: "target" },
    { kind: "tab", tab: "chat" },
    { kind: "control", token: "Caven", actor: "Caven", on: true },
    { kind: "target", token: "Goblin", on: true },
  ]);
  assert.ok(actionsOf().slice(n).every(a => a.t === Date.now()));
});

test("recorder: windows — render throttled per id for 2 s, close recorded, noise and our own dialog skipped", () => {
  const n = clearRings();
  class ActorSheet5eCharacter {}
  class ChatLog {}
  const sheet = Object.assign(new ActorSheet5eCharacter(), { id: "ActorSheet5eCharacter-Actor-x", title: "Caven" });
  F.fire("renderApplicationV2", sheet);
  F.fire("renderApplicationV2", sheet);                 // hp tick re-render: throttled
  mock.timers.tick(LIMITS.renderThrottleMs);
  F.fire("renderApplicationV2", sheet);
  F.fire("renderApplicationV2", Object.assign(new ChatLog(), { id: "chat" }));
  class CombatTracker {}
  class ActorDirectory {}
  F.fire("renderApplicationV2", Object.assign(new CombatTracker(), { id: "combat" }));     // re-renders every turn
  F.fire("renderApplicationV2", Object.assign(new ActorDirectory(), { id: "actors" }));   // re-renders on every change
  F.fire("renderApplicationV2", Object.assign(new ActorSheet5eCharacter(), { id: DIALOG_ID }));
  F.fire("closeApplicationV2", sheet);
  F.fire("renderApplicationV2", sheet);                 // re-opened right after close: recorded
  F.fire("renderApplication", Object.assign(new (class LegacyApp {})(), { appId: 7, title: "Old window" }));
  const got = actionsOf().slice(n).map(({ t, ...rest }) => rest);
  assert.deepEqual(got, [
    { kind: "app", op: "render", cls: "ActorSheet5eCharacter", id: "ActorSheet5eCharacter-Actor-x", title: "Caven" },
    { kind: "app", op: "render", cls: "ActorSheet5eCharacter", id: "ActorSheet5eCharacter-Actor-x", title: "Caven" },
    { kind: "app", op: "close", cls: "ActorSheet5eCharacter", id: "ActorSheet5eCharacter-Actor-x", title: "Caven" },
    { kind: "app", op: "render", cls: "ActorSheet5eCharacter", id: "ActorSheet5eCharacter-Actor-x", title: "Caven" },
    { kind: "app", op: "render", cls: "LegacyApp", id: "7", title: "Old window" },
  ]);
});

test("recorder: the user's own document changes (keys only), never another user's", async () => {
  const n = clearRings();
  const caven = game.actors.get(IDS.caven);
  await caven.update({ "system.attributes.hp.value": 9 });           // as the GM (this client)
  F.fire("updateActor", caven, { name: "x" }, {}, IDS.player);       // someone else's change
  F.fire("createItem", { id: "item000000000001", name: "Rope" }, {}, game.user.id);
  F.fire("deleteToken", { id: IDS.token, name: "Caven" }, {}, game.user.id);
  F.fire("deleteToken", { id: IDS.token, name: "Caven" }, {}, IDS.player);
  const got = actionsOf().slice(n).map(({ t, ...rest }) => rest);
  assert.deepEqual(got, [
    { kind: "doc", op: "update", type: "Actor", id: IDS.caven, name: "Caven", keys: ["system.attributes"] },
    { kind: "doc", op: "create", type: "Item", id: "item000000000001", name: "Rope" },
    { kind: "doc", op: "delete", type: "Token", id: IDS.token, name: "Caven" },
  ]);
  assert.ok(!JSON.stringify(got).includes("9"), "values are never recorded");
});

test("recorder: own chat (flavor + total, whisper as a boolean, never content), activity use, combat turns", () => {
  const n = clearRings();
  F.fire("createChatMessage", { id: "m1", author: { id: game.user.id }, flavor: "Longsword — Attack", rolls: [{ total: 17 }], whisper: ["x"], content: "SECRET" }, {}, game.user.id);
  F.fire("createChatMessage", { id: "m2", author: { id: IDS.player }, flavor: "theirs", content: "their text" }, {}, IDS.player);
  assert.equal(F.fireCall("dnd5e.postUseActivity", { name: "Attack", item: { name: "Longsword" }, actor: { name: "Caven" } }, {}, {}), true,
    "dnd5e calls this hook with Hooks.call: the recorder never vetoes");
  F.fire("updateCombat", { round: 3, turn: 2, combatant: { name: "Caven" } }, { turn: 2 });
  F.fire("updateCombat", { round: 3, turn: 2, combatant: { name: "Caven" } }, { flags: {} });
  const got = actionsOf().slice(n).map(({ t, ...rest }) => rest);
  assert.deepEqual(got, [
    { kind: "chat", id: "m1", flavor: "Longsword — Attack", total: 17, whisper: true },
    { kind: "use", item: "Longsword", activity: "Attack", actor: "Caven" },
    { kind: "combat", round: 3, turn: 2, combatant: "Caven" },
  ]);
  assert.ok(!JSON.stringify(actionsOf()).includes("SECRET"));
});

test("recorder: notifications are recorded and still shown (wrapMethod on Notifications#notify)", () => {
  const n = clearRings();
  const shown = F.calls.length;
  const out = ui.notifications.warn("The door is locked token=abcdefghijklmnop");
  assert.deepEqual(out, { message: "The door is locked token=abcdefghijklmnop", type: "warning" }, "the original runs and returns");
  assert.ok(F.calls.slice(shown).some(c => c.op === "notify"));
  assert.deepEqual(actionsOf().slice(n).map(({ t, ...rest }) => rest), [{ kind: "notify", level: "warning", text: "The door is locked token=[redacted]" }]);
});

test("feedback-M2: the recorder's own failure is redacted like every other error", () => {
  const level = { toString() { throw new Error("cannot label token=abcdefghijklmnop"); } };
  ui.notifications.notify("hello", level);
  const own = errorsOf().at(-1);
  assert.equal(own.source, "recorder");
  assert.equal(own.message, "cannot label token=[redacted]");
});

test("recorder: a body click on a [data-action] element (capture phase), never an input value; plain clicks ignored", () => {
  assert.equal(F.bodyListeners.filter(l => l.name === "click" && l.capture === true).length, 1);
  const n = clearRings();
  class ItemPileInventoryApp {}
  foundry.applications.instances.set("pile-1", new ItemPileInventoryApp());
  const win = { id: "pile-1" };
  const button = { dataset: { action: "lootAll" }, textContent: "  Loot\n all ", getAttribute: () => null, closest: sel => (sel === ".application, .app" ? win : null) };
  const icon = { closest: sel => (sel === "[data-action]" ? button : null) };
  F.click(icon);
  F.click({ closest: () => null });                                      // no data-action: nothing
  const input = { dataset: { action: "edit" }, value: "my password", textContent: "", getAttribute: k => (k === "aria-label" ? "Edit name" : null), closest: sel => (sel === "[data-action]" ? input : null) };
  F.click(input);
  const own = { dataset: { action: "submit" }, textContent: "Send", getAttribute: () => null, closest: sel => (sel === "[data-action]" ? own : { id: DIALOG_ID }) };
  F.click(own);                                                          // our own dialog: skipped
  const got = actionsOf().slice(n).map(({ t, ...rest }) => rest);
  assert.deepEqual(got, [
    { kind: "click", action: "lootAll", cls: "ItemPileInventoryApp", id: "pile-1", text: "Loot all" },
    { kind: "click", action: "edit", cls: "", id: "", text: "Edit name" },
  ]);
  assert.ok(!JSON.stringify(got).includes("my password"));
});

test("recorder: historySize is read live on every push and clamped", async () => {
  await game.settings.set(MODULE, "historySize", 20);
  for (let i = 0; i < 30; i++) F.fire("changeSidebarTab", { id: `t${i}` });
  assert.equal(actionsOf().length, 20);
  assert.equal(lastAction().tab, "t29");
  await game.settings.set(MODULE, "historySize", 3);               // below the floor → 20
  F.fire("changeSidebarTab", { id: "after" });
  assert.equal(actionsOf().length, 20);
  await game.settings.set(MODULE, "historySize", 200);
});

test("errors: core's error hook, window error, unhandled rejection; console.error/warn recorded AND passed through", () => {
  const before = errorsOf().length;
  mock.timers.tick(5000);
  F.fire("error", "Hooks.#call", new Error("hooked boom"), {});
  F.windowEvent("error", { message: "Script error", error: new TypeError("cannot read x") });
  F.windowEvent("unhandledrejection", { reason: new Error("lost promise") });
  consoleLines.length = 0;
  console.error("pentaryn-dropbin | loot failed", new Error("transferEverything"));
  console.warn("deprecated thing");
  assert.deepEqual(consoleLines, [
    ["error", "pentaryn-dropbin | loot failed Error: transferEverything"],
    ["warn", "deprecated thing"],
  ], "the original console still prints");
  const got = errorsOf().slice(before).map(({ t, stack, ...rest }) => ({ ...rest, stack: typeof stack }));
  assert.deepEqual(got, [
    { source: "hooks", location: "Hooks.#call", message: "hooked boom", stack: "string" },
    { source: "window", message: "cannot read x", stack: "string" },
    { source: "promise", message: "lost promise", stack: "string" },
    { source: "console.error", message: "pentaryn-dropbin | loot failed transferEverything", stack: "string" },
    { source: "console.warn", message: "deprecated thing", stack: "undefined" },
  ]);
  assert.equal(F.windowListeners("error"), 1);
  assert.equal(F.windowListeners("unhandledrejection"), 1);
});

test("errors: the same message twice within 1 s (hook + console) is kept once; the ring caps at 50", () => {
  mock.timers.tick(5000);
  const before = errorsOf().length;
  const err = new Error("twice");
  console.error(err);
  F.fire("error", "Hooks.#call", err, {});
  assert.equal(errorsOf().length, before + 1);
  mock.timers.tick(LIMITS.dupErrorMs + 1);
  F.fire("error", "Hooks.#call", err, {});
  assert.equal(errorsOf().length, before + 2);
  for (let i = 0; i < 80; i++) F.fire("error", "x", new Error(`e${i}`), {});
  assert.equal(errorsOf().length, LIMITS.errorsMax);
  assert.equal(errorsOf().at(-1).message, "e79");
});

/* ── submit, queue, filing ───────────────────────────────────────────── */

test("a player's submit with the GM online: queued on their own flag, relayed, filed as THEM, flag cleared", async () => {
  F.become({ userId: IDS.player });
  const sent = F.calls.length;
  const r = await api.submit({ category: "defect", text: "Loot all did nothing on the second corpse" });
  F.become({ userId: IDS.gm });
  assert.equal(r.ok, true);
  assert.equal(r.status, "filed");
  const path = `pentaryn-feedback/${WORLD}/${r.id}.json`;
  const file = mem.files.get(path);
  assert.ok(file, path);
  assert.equal(file.category, "defect");
  assert.equal(file.user.id, IDS.player);
  assert.equal(file.user.name, "Caven's player");
  assert.deepEqual(file.user.character, { id: IDS.caven, name: "Caven" });
  assert.equal(file.status, "open");
  assert.ok(file.actions.length > 0, "the action ring rides along");
  assert.ok(file.errors.length > 0, "the error ring rides along");
  assert.equal(file.world.id, WORLD);
  assert.deepEqual(queueOf(player), {});
  const q = F.calls.slice(sent).filter(c => c.op === "query");
  assert.deepEqual(q.map(c => [c.name, c.timeout, c.data.userId]), [[`${MODULE}.ingest`, 10000, IDS.player]]);
  const userWrites = F.calls.slice(sent).filter(c => c.op === "update" && c.documentName === "User");
  assert.equal(userWrites.length, 2, "one write to queue, one batched write to clear");
  const toasts = F.calls.slice(sent).filter(c => c.op === "notify").map(c => c.message);
  assert.ok(toasts.some(m => m === `Thanks — report ${r.id.slice(0, 6)} saved.`), toasts.join(" | "));
});

test("the report carries the snapshot: scene, controlled tokens with hp, own chat only, active module versions", async () => {
  canvas.tokens.controlled = [{ document: { id: IDS.token, name: "Caven" }, actor: game.actors.get(IDS.caven) }];
  const r = await api.submit({ text: "snapshot check" });
  canvas.tokens.controlled = [];
  const file = mem.files.get(`pentaryn-feedback/${WORLD}/${r.id}.json`);
  assert.equal(file.category, "bug", "no category → bug");
  assert.deepEqual(file.scene.viewed, { id: IDS.scene, name: "Underdark Gate" });
  assert.deepEqual(file.tokens.controlled[0], { id: IDS.token, name: "Caven", actorId: IDS.caven, actorName: "Caven", actorType: "character", hp: { value: 9, max: 27 } });
  assert.deepEqual(file.chat.map(c => c.id), [IDS.msgMine], "the GM's own message only");
  assert.ok(!JSON.stringify(file).includes("SECRET CONTENT"));
  assert.ok(!JSON.stringify(file).includes("their whisper"));
  assert.deepEqual(file.modules.map(m => m.id), [MODULE, "pentaryn-dropbin"]);
  assert.equal(r.status, "filed");
});

test("submit refuses empty text without writing anything (and says so); dryRun builds without writing", async () => {
  const before = F.calls.length;
  assert.deepEqual(await api.submit({ category: "bug", text: "   " }), { ok: false, code: "BAD_ARGS", reason: "the report text is empty" });
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "notify").map(c => [c.level, c.message]),
    [["error", "Could not save the report: the report text is empty"]], "every failure tells the player");
  const dry = await api.submit({ text: "dry" }, { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.report.text, "dry");
  assert.equal(F.calls.slice(before).filter(c => c.op === "update" || c.op === "query").length, 0);
});

test("feedback-rob-2: submit(null), submit(draft, null) and ingest(null) answer a fail(), never throw", async () => {
  assert.deepEqual(await api.submit(null), { ok: false, code: "BAD_ARGS", reason: "the report text is empty" });
  assert.deepEqual(await api.submit({ text: "   " }, null), { ok: false, code: "BAD_ARGS", reason: "the report text is empty" });
  assert.equal((await api.ingest(null)).code, "NOT_FOUND");
  F.become({ userId: IDS.player });
  assert.deepEqual(await api.ingest(null), { ok: false, code: "NOT_GM", reason: "only the active GM files reports" });
  F.become({ userId: IDS.gm });
});

test("a failed queue write tells the player and leaves nothing half-done", async () => {
  refill();
  F.become({ userId: IDS.player });
  const update = player.update;
  player.update = async () => { throw new Error("socket closed"); };
  const before = F.calls.length;
  try {
    const r = await api.submit({ text: "will not queue" });
    assert.equal(r.ok, false);
  } finally {
    player.update = update;
    F.become({ userId: IDS.gm });
  }
  const toasts = F.calls.slice(before).filter(c => c.op === "notify");
  assert.deepEqual(toasts.map(c => [c.level, c.message]), [["error", "Could not save the report: socket closed"]]);
  assert.equal(F.calls.slice(before).filter(c => c.op === "query").length, 0);
});

test("a failed queue write does not start the reporter's 5 s gap: an immediate retry goes through", async () => {
  refill();
  F.become({ userId: IDS.player });
  const update = player.update;
  try {
    player.update = async () => { throw new Error("socket closed"); };
    assert.equal((await api.submit({ text: "will not queue" })).ok, false);
    player.update = update;
    const retry = await api.submit({ text: "will not queue" });
    assert.equal(retry.ok, true, `the retry was refused: ${retry.reason}`);
    assert.deepEqual(await api.submit({ text: "and again" }), { ok: false, code: "REFUSED", reason: "wait 5 s between reports" },
      "the successful retry does start the gap");
  } finally {
    player.update = update;
    F.become({ userId: IDS.gm });
  }
});

test("two submits in the same tick: the second is refused while the first is still writing", async () => {
  refill();
  F.become({ userId: IDS.player });
  try {
    const [a, b] = await Promise.all([api.submit({ text: "double" }), api.submit({ text: "click" })]);
    assert.equal(a.ok, true);
    assert.deepEqual(b, { ok: false, code: "REFUSED", reason: "wait 5 s between reports" });
  } finally {
    F.become({ userId: IDS.gm });
  }
});

test("no GM online: the report waits on the player's own flag (cap 5, oldest dropped) and is filed when a GM connects", async () => {
  refill();
  F.gm.active = false;
  F.become({ userId: IDS.player });
  const ids = [];
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(LIMITS.submitGapMs);
    const r = await api.submit({ text: `offline ${i}` });
    assert.equal(r.status, "queued");
    ids.push(r.id);
  }
  assert.deepEqual(Object.keys(queueOf(player)).sort(), ids.slice(1).sort(), "the oldest is dropped past 5");
  const toasts = F.calls.filter(c => c.op === "notify").map(c => c.message);
  assert.ok(toasts.includes(`No GM is online; your report ${ids[0].slice(0, 6)} will be sent when one connects.`));
  assert.ok(toasts.some(m => m.startsWith("Your unsent queue was full")));
  // the GM logs in; the player connects (or is already on): the active GM files every waiting queue
  F.become({ userId: IDS.gm });
  F.gm.active = true;
  F.fire("userConnected", player, true);
  await settle(10);
  assert.deepEqual(queueOf(player), {});
  for (const id of ids.slice(1)) assert.ok(mem.files.has(`pentaryn-feedback/${WORLD}/${id}.json`), id);
  assert.equal(mem.files.has(`pentaryn-feedback/${WORLD}/${ids[0]}.json`), false);
});

test("a GM timeout also leaves the report queued (never lost)", async () => {
  refill();
  F.holder.gmOffline = true;
  F.become({ userId: IDS.player });
  const r = await api.submit({ text: "socket hiccup" });
  F.become({ userId: IDS.gm });
  F.holder.gmOffline = false;
  assert.equal(r.status, "queued");
  assert.ok(queueOf(player)[r.id]);
  await api.ingest({ userId: IDS.player });
  assert.deepEqual(queueOf(player), {});
});

test("updateUser on the active GM files a queue entry written by a player (the socket-order safety net)", async () => {
  refill();
  const report = queuedReport("viaupdateuser001", { t: Date.now(), text: "via updateUser" });
  await player.update({ [`flags.${MODULE}.queue.${report.id}`]: report });
  await settle(10);
  assert.ok(mem.files.has(`pentaryn-feedback/${WORLD}/${report.id}.json`));
  assert.deepEqual(queueOf(player), {});
});

test("a resend of a report already on disk never overwrites it (a status Joe set survives)", async () => {
  refill();
  const path = `pentaryn-feedback/${WORLD}/viaupdateuser001.json`;
  mem.files.get(path).status = "resolved";
  const report = queuedReport("viaupdateuser001", { t: Date.now(), text: "resent" });
  await player.update({ [`flags.${MODULE}.queue.${report.id}`]: report });
  await settle(10);
  assert.equal(mem.files.get(path).status, "resolved");
  assert.equal(mem.files.get(path).text, "via updateUser");
  assert.deepEqual(queueOf(player), {}, "still cleared from the flag");
});

test("a malformed queue entry is refused and dropped (it would block the queue forever)", async () => {
  refill();
  const lines = consoleLines.length;
  await player.update({ [`flags.${MODULE}.queue.badbadbadbadbad1`]: { id: "badbadbadbadbad1", text: "no schema" } });
  await settle(10);
  assert.deepEqual(queueOf(player), {});
  assert.equal(mem.files.has(`pentaryn-feedback/${WORLD}/badbadbadbadbad1.json`), false);
  assert.ok(consoleLines.slice(lines).some(([lvl, l]) => lvl === "warn" && l.startsWith(`${MODULE} | refused report badbadbadbadbad1`)));
});

test("rob-1/EC-1: an entry whose t is outside the Date range is refused and dropped; the rest of the queue is filed", async () => {
  refill();
  const lines = consoleLines.length;
  const bad = queuedReport("badtimestamp0001", { t: 1700000000000, text: "bad t" });
  bad.t = 1e20;                             // finite, but no Date can hold it
  const good = queuedReport("goodbehindbad001", { t: Date.now(), text: "queued behind the bad one" });
  await player.update({ [`flags.${MODULE}.queue`]: { [bad.id]: bad, [good.id]: good } });
  await settle(10);
  assert.deepEqual(queueOf(player), {}, "neither entry is left blocking the queue");
  assert.equal(mem.files.has(`pentaryn-feedback/${WORLD}/${bad.id}.json`), false);
  assert.ok(mem.files.has(`pentaryn-feedback/${WORLD}/${good.id}.json`), "the entry behind it is filed");
  assert.ok(consoleLines.slice(lines).some(([lvl, l]) => lvl === "warn" && l.startsWith(`${MODULE} | refused report ${bad.id}`)));
});

test("rob-1/EC-1: if normalising one entry throws, that entry is dropped with a warning and the rest is filed", async () => {
  refill();
  const lines = consoleLines.length;
  const boom = queuedReport("normalisethrows1", { t: Date.now() + 1, text: "normalise throws" });
  const good = queuedReport("goodbehindboom01", { t: Date.now(), text: "queued behind it" });
  const proto = Date.prototype;
  const iso = proto.toISOString;
  proto.toISOString = function () {
    if (this.getTime() === boom.t) throw new RangeError("Invalid time value");
    return iso.call(this);
  };
  try {
    await player.update({ [`flags.${MODULE}.queue`]: { [boom.id]: boom, [good.id]: good } });
    await settle(10);
  } finally {
    proto.toISOString = iso;
  }
  assert.deepEqual(queueOf(player), {}, "the failing entry is not left to block the queue");
  assert.equal(mem.files.has(`pentaryn-feedback/${WORLD}/${boom.id}.json`), false);
  assert.ok(mem.files.has(`pentaryn-feedback/${WORLD}/${good.id}.json`), "the entry behind it is filed");
  assert.ok(consoleLines.slice(lines).some(([lvl, l]) => lvl === "warn" && l.startsWith(`${MODULE} | refused report ${boom.id}`) && l.includes("Invalid time value")));
});

test("the folder is always this world's: a report claiming another world is filed here, its world id corrected", async () => {
  refill();
  const report = { ...queuedReport("otherworld000001", { t: Date.now(), text: "wrong world" }), world: { id: "someone-elses", title: "Theirs" } };
  await player.update({ [`flags.${MODULE}.queue.${report.id}`]: report });
  await settle(10);
  assert.equal(mem.files.has(`pentaryn-feedback/someone-elses/${report.id}.json`), false);
  const filed = mem.files.get(`pentaryn-feedback/${WORLD}/${report.id}.json`);
  assert.equal(filed.world.id, WORLD);
  assert.equal(filed.world.title, "Theirs", "the rest of the claim is kept as data");
});

test("two GM tabs: the tab that finds the entry already gone from the queue still answers done", async () => {
  // the other tab filed it and cleared the flag first; its file is not visible to this tab's store yet
  const id = "othertabfiled001";
  const r = await api.ingest({ userId: IDS.player, ids: [id] });
  assert.deepEqual(r, { ok: true, filed: [], refused: [], done: [id] });
});

test("rate limit, reporter side: a second report within 5 s is refused with a toast; dryRun is not limited", async () => {
  refill();
  F.become({ userId: IDS.player });
  try {
    assert.equal((await api.submit({ text: "first" })).ok, true);
    const before = F.calls.length;
    const second = await api.submit({ text: "second" });
    assert.deepEqual(second, { ok: false, code: "REFUSED", reason: "wait 5 s between reports" });
    assert.deepEqual(F.calls.slice(before).filter(c => c.op === "notify").map(c => c.message), ["Could not save the report: wait 5 s between reports"]);
    assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 0, "nothing queued");
    assert.equal((await api.submit({ text: "dry" }, { dryRun: true })).ok, true);
    mock.timers.tick(LIMITS.submitGapMs);
    assert.equal((await api.submit({ text: "third" })).ok, true);
  } finally {
    F.become({ userId: IDS.gm });
  }
});

test("rate limit, GM side: a flag written directly with 7 reports files 5, holds 2 on the queue, and files them once the bucket refills", async () => {
  refill();
  const lines = consoleLines.length;
  const update = {};
  const ids = Array.from({ length: 7 }, (_, i) => `burst00000000${String(i).padStart(3, "0")}`);
  for (const id of ids) update[`flags.${MODULE}.queue.${id}`] = queuedReport(id, { t: Date.now(), text: `burst ${id}` });
  await player.update(update);                    // what a script skipping api.submit can do
  await settle(10);
  const onDisk = ids.filter(id => mem.files.has(`pentaryn-feedback/${WORLD}/${id}.json`));
  assert.equal(onDisk.length, LIMITS.queueMax);
  assert.equal(Object.keys(queueOf(player)).length, 2, "the rest wait on the flag, never dropped");
  assert.ok(consoleLines.slice(lines).some(([lvl, l]) => lvl === "warn" && l.includes("holding 2 report(s) from Caven's player")));
  mock.timers.tick(2 * LIMITS.submitGapMs);
  await api.ingest({ userId: IDS.player });
  assert.deepEqual(queueOf(player), {});
  assert.ok(ids.every(id => mem.files.has(`pentaryn-feedback/${WORLD}/${id}.json`)));
});

test("ingest on a client that is not the active GM is refused", async () => {
  F.become({ userId: IDS.player });
  assert.deepEqual(await api.ingest({ userId: IDS.player }), { ok: false, code: "NOT_GM", reason: "only the active GM files reports" });
  F.become({ userId: IDS.gm });
  assert.equal((await api.ingest({ userId: "nobody0000000001" })).code, "NOT_FOUND");
});

test("filed and queued events fire with the report", async () => {
  refill();
  const seen = [];
  const a = Hooks.on(`${MODULE}.queued`, r => seen.push(["queued", r.id]));
  const b = Hooks.on(`${MODULE}.filed`, r => seen.push(["filed", r.id]));
  const r = await api.submit({ text: "events" });
  Hooks.off(`${MODULE}.queued`, a);
  Hooks.off(`${MODULE}.filed`, b);
  assert.deepEqual(seen.map(([k]) => k).sort(), ["filed", "queued"]);
  assert.ok(seen.every(([, id]) => id === r.id));
});

test("describe() has the use-doc §5.1a key set every namespace shares", () => {
  assert.deepEqual(Object.keys(api.describe()), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(api.describe().patches.map(p => p.adjustments).sort(),
    ["feedback-console-error", "feedback-console-warn", "feedback-notifications-notify"]);
});

// Keep this test LAST: it replaces the published API.
// A hot patch re-runs the WIRING only: the entry's static imports are the instances already loaded.
test("hot patch: uninstall() removes listeners and stops recording; re-import re-wires", async () => {
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("getSceneControlButtons"), 0);
  assert.equal(F.windowListeners("error"), 0);
  assert.equal(F.bodyListeners.length, 0);
  assert.equal(actionsOf().length, 0);
  console.error("while uninstalled");
  assert.equal(errorsOf().length, 0, "the console wrap stays but records nothing while uninstalled");
  consoleLines.length = 0;
  await import(`../feedback.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines.filter(([lvl]) => lvl !== "info"), [], "the re-run must not throw or warn");
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(F.listeners("getSceneControlButtons"), 1);
  F.fire("changeSidebarTab", { id: "back" });
  assert.equal(lastAction().tab, "back");
  console.error("recording again");
  assert.equal(errorsOf().at(-1).message, "recording again");
  Object.assign(console, original);
});
