// Glue: the stub world, both entries loaded as Foundry loads them, the lifecycle fired. Pins EFFECTS
// (what the patch does to an operation, what a hook changes, what is published, what is logged).
//
// Checkpoint (wave 4, guide step 1): the patch through the real wrap (the -5 table), the body-swap
// guard, the legacy publish surface, the Escape keybinding, the lookups, chat, the bonus-action mark,
// the runner election and Argon's target-picker cancel.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, sourceScan } from "./kit/harness.mjs";
import { setup, IDS, MODULE } from "./fixtures/world.mjs";
import { legacyUnwrap } from "./fixtures/legacy-transform.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const ROOT = new URL("..", import.meta.url);
const F = await setup();
const T = await import("../transform.mjs");
const H = await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const { Ops } = F;

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT, or PENTARYN_TEST_SHIMS=1");
});

/* ── the core v14 unwrap patch (-5) ───────────────────────────────────────── */

test("patch: a recursive:false update has its scalar ForcedReplacements unwrapped in place; objects keep theirs", () => {
  const F_ = v => new Ops.ForcedReplacement(v);
  const update = { x: F_(100), y: F_(null), texture: F_({ src: "a" }), name: "n", hidden: F_(false) };
  const operation = { recursive: false, updates: [update] };
  const self = { tag: "TokenDocument class" };
  const out = F.TokenDocument._preUpdateOperation.call(self, ["doc"], operation, "user1");
  assert.equal(out, "core-result", "core's return value passes through");
  const seen = F.coreOps.at(-1);
  assert.equal(seen.self, self, "this is preserved");
  assert.deepEqual(seen.documents, ["doc"]);
  assert.equal(seen.user, "user1");
  assert.equal(operation.updates[0], update, "the same update object, mutated");
  assert.equal(update.x, 100);
  assert.equal(update.y, null);
  assert.equal(update.hidden, false);
  assert.equal(update.name, "n");
  assert.ok(update.texture instanceof Ops.ForcedReplacement, "object field still wrapped");
  assert.deepEqual(update.texture.value, { src: "a" });
});

test("patch: recursive true / unset → untouched; equal to the legacy oracle on the same inputs", () => {
  const build = () => [
    { recursive: true, updates: [{ x: new Ops.ForcedReplacement(1) }] },
    { updates: [{ x: new Ops.ForcedReplacement(2) }] },
    { recursive: false, updates: [null, { x: new Ops.ForcedReplacement("s"), flags: new Ops.ForcedReplacement([1]) }] },
    { recursive: false }
  ];
  const live = build();
  for (const op of live) F.TokenDocument._preUpdateOperation(["d"], op, null);
  const oracle = build();
  for (const op of oracle) legacyUnwrap(op, { isForced: v => v instanceof Ops.ForcedReplacement, valueOf: v => Ops.DataFieldOperator.get(v) });
  assert.deepEqual(live, oracle);
  assert.ok(live[0].updates[0].x instanceof Ops.ForcedReplacement);
  assert.ok(live[1].updates[0].x instanceof Ops.ForcedReplacement);
  assert.equal(live[2].updates[1].x, "s");
  assert.ok(live[2].updates[1].flags instanceof Ops.ForcedReplacement, "an array is an object: kept wrapped");
});

/* ── body swaps never animate ─────────────────────────────────────────────── */

test("preUpdateToken: a body swap sets options.animate = false; a plain move does not", () => {
  const doc = { _source: { actorId: "talo" }, actorId: "talo" };
  const swap = {};
  Hooks.call("preUpdateToken", doc, { actorId: "wolf" }, swap, "u");
  assert.equal(swap.animate, false);
  const move = {};
  Hooks.call("preUpdateToken", doc, { x: 100, y: 200 }, move, "u");
  assert.equal("animate" in move, false);
  const same = {};
  Hooks.call("preUpdateToken", doc, { actorId: new Ops.ForcedReplacement("talo") }, same, "u");
  assert.equal("animate" in same, false, "a wrapped unchanged actorId is not a swap");
  const flagged = {};
  Hooks.call("preUpdateToken", { actorId: "x" }, { "flags.dnd5e.previousTokenData": {} }, flagged, "u");
  assert.equal(flagged.animate, false, "doc without _source: actorId read from the doc");
  const nested = {};
  Hooks.call("preUpdateToken", { _source: {} }, { flags: new Ops.ForcedReplacement({ dnd5e: { previousActorData: {} } }) }, nested, "u");
  assert.equal(nested.animate, false, "a wrapped flags object is unwrapped");
  const explicit = { animate: true };
  Hooks.call("preUpdateToken", doc, { actorId: "wolf" }, explicit, "u");
  assert.equal(explicit.animate, false);
});

test("preUpdateToken: animate already false → untouched; a throw inside logs and the update goes on", () => {
  const off = { animate: false };
  assert.notEqual(Hooks.call("preUpdateToken", null, { actorId: "x" }, off, "u"), false);
  F.console.length = 0;
  const changes = {};
  Object.defineProperty(changes, "actorId", { get() { throw new Error("boom"); }, enumerable: true });
  const opts = {};
  assert.notEqual(Hooks.call("preUpdateToken", { actorId: "a" }, changes, opts, "u"), false, "never vetoes");
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | body-swap animation guard skipped"]]);
  assert.equal(F.console[0][2].message, "boom");
  assert.equal("animate" in opts, false);
});

/* ── publish (legacy, frozen-root guard) ──────────────────────────────────── */

test("published at ready: game.pentaryn.transform, the legacy surface (golden/legacy-surface.json)", () => {
  const api = game.pentaryn.transform;
  assert.ok(api);
  assert.equal(api.shift, T.shift);
  assert.equal(api.revert, T.revert);
  assert.equal(api.forms, T.forms);
  assert.equal(api.wildShapeActivity, T.wildShapeActivity);
  assert.equal(api.original, T.original);
  assert.equal(api.isRevertItem, T.isRevertItem);
  assert.equal(api.sweepSpentForms, T.sweepSpentForms);
  assert.equal(Object.isFrozen(api), false, "legacy: a plain object");
  assert.equal(game.modules.get(MODULE).api, undefined, "no module.api today");
  pinJSON("legacy-surface", {
    transform: Object.keys(api).map(k => [k, typeof api[k]]),
    starry: Object.keys(api.starry).map(k => [k, typeof api.starry[k]])
  }, import.meta.url);
});

test("starry API rows are starry.mjs's own functions", async () => {
  const S = await import("../starry.mjs");
  assert.deepEqual(game.pentaryn.transform.starry,
    { assume: S.assumeStarry, end: S.endStarry, active: S.activeStarry, constellation: S.constellationOf });
});

test("no ready-time hook emitted, no socket, no settings registered (only dnd5e's, by the fixture)", () => {
  assert.deepEqual(F.calls.filter(c => c.op === "Hooks.callAll" && /ready/i.test(c.name)), []);
  assert.deepEqual(F.calls.filter(c => c.op === "socket.emit"), []);
  assert.deepEqual([...game.settings.settings.keys()], ["dnd5e.allowPolymorphing"]);
});

/* ── the Escape keybinding (PT3-6) ────────────────────────────────────────── */

test("keybinding: pentaryn-transform.cancelTargetPicker registered at init with Escape, PRIORITY", () => {
  assert.deepEqual(F.calls.filter(c => c.op === "keybindings.register"),
    [{ op: "keybindings.register", id: `${MODULE}.cancelTargetPicker`, name: "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name" }]);
  const action = game.keybindings.actions.get(`${MODULE}.cancelTargetPicker`);
  assert.ok(action);
  assert.equal(action.namespace, MODULE);
  assert.equal(action.name, "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name");
  assert.equal(action.hint, "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Hint");
  assert.deepEqual(action.editable, [{ key: "Escape" }]);
  assert.equal(action.precedence, CONST.KEYBINDING_PRECEDENCE.PRIORITY);
  assert.equal(typeof action.onDown, "function");
  assert.equal(game.i18n.has(action.name) && game.i18n.has(action.hint), true);
});

test("keybinding onDown: target picker open → cancelled and consumed (true), even when it stays open", () => {
  const action = game.keybindings.actions.get(`${MODULE}.cancelTargetPicker`);
  const picker = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = () => picker.remove();               // Argon's picker closes on the right-button mouseup
  assert.equal(action.onDown(), true);
  assert.equal(picker.isConnected, false);
  const stuck = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = null;
  assert.equal(action.onDown(), true, "consumed whether or not it closed");
  stuck.remove();
  assert.equal(action.onDown(), false, "nothing open: falls through to core");
});

/* ── Argon's target picker ────────────────────────────────────────────────── */

test("cancelTargetPicker: none open → false, no event; open → one right-button mouseup on document", () => {
  F.D.dispatched.length = 0;
  assert.equal(H.cancelTargetPicker(), false);
  assert.equal(F.D.dispatched.length, 0);
  const picker = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = () => picker.remove();
  assert.equal(H.cancelTargetPicker(), true);
  assert.equal(F.D.dispatched.length, 1);
  const e = F.D.dispatched[0];
  assert.deepEqual({ type: e.type, button: e.button, buttons: e.buttons, bubbles: e.bubbles, cancelable: e.cancelable },
    { type: "mouseup", button: 2, buttons: 0, bubbles: true, cancelable: true });
  const stuck = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = null;
  assert.equal(H.cancelTargetPicker(), false, "still open → false");
  F.console.length = 0;
  F.D.onDispatch = () => { throw new Error("no"); };
  assert.equal(H.cancelTargetPicker(), false);
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | cancelling Argon's target picker failed"]]);
  F.D.onDispatch = null;
  stuck.remove();
});

test("updateToken/deleteToken: the HUD's token changing body cancels an open pick; other changes do not", () => {
  const picker = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = () => picker.remove();
  const hudDoc = { id: "tok", object: { controlled: false } };
  ui.ARGON._token = { document: hudDoc, id: "tok" };
  F.D.dispatched.length = 0;
  Hooks.callAll("updateToken", hudDoc, { x: 5 }, {}, "u");
  assert.equal(F.D.dispatched.length, 0, "a move is not a body change");
  Hooks.callAll("updateToken", { id: "other", object: { controlled: false } }, { actorId: "z" }, {}, "u");
  assert.equal(F.D.dispatched.length, 0, "another, uncontrolled token");
  Hooks.callAll("updateToken", hudDoc, { name: "Talo (Wolf)" }, {}, "u");
  assert.equal(F.D.dispatched.length, 1);
  const again = F.D.el("div", "ech-target-picker");
  F.D.onDispatch = () => again.remove();
  Hooks.callAll("deleteToken", { id: "other", object: { controlled: true } }, {}, "u");
  assert.equal(F.D.dispatched.length, 2, "a controlled token deleted");
  Hooks.callAll("updateToken", hudDoc, { actorId: "x" }, {}, "u");
  assert.equal(F.D.dispatched.length, 2, "no picker open: nothing sent");
  F.D.onDispatch = null;
  ui.ARGON._token = null;
});

/* ── lookups ──────────────────────────────────────────────────────────────── */

test("isRevertItem: only a strict true flag", () => {
  const { talo } = F.W.talo({ revertItem: true });
  assert.equal(T.isRevertItem(talo.items.get(IDS.revert)), true);
  assert.equal(T.isRevertItem(talo.items.get(IDS.ws)), false);
  assert.equal(T.isRevertItem(null), false);
  assert.equal(T.isRevertItem({ getFlag: () => "true" }), false);
});

test("original(): normal → itself; null → null; a token's form → itself; a linked form → the world original or null", () => {
  const { talo } = F.W.talo();
  assert.equal(T.original(talo), talo);
  assert.equal(T.original(null), null);
  assert.equal(T.original(undefined), null);
  const tokenForm = F.W.makeActor({ isPolymorphed: true, isToken: true, flags: { dnd5e: { originalActor: IDS.talo } } });
  assert.equal(T.original(tokenForm), tokenForm);
  const form = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { originalActor: IDS.talo } } });
  assert.equal(T.original(form), talo);
  const orphan = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { originalActor: "gone" } } });
  assert.equal(T.original(orphan), null);
});

test("wildShapeActivity / forms: the original's activity; profiles resolved (KNOWN -23: 3 + 1 per empty name resolves)", () => {
  const { talo, wolfSrc, apeSrc } = F.W.talo();
  const form = F.W.makeActor({ isPolymorphed: true, flags: { dnd5e: { originalActor: IDS.talo } } });
  assert.equal(T.wildShapeActivity(talo)?.id, "wsAct");
  assert.equal(T.wildShapeActivity(form), T.wildShapeActivity(talo));
  assert.equal(T.wildShapeActivity(F.W.makeActor({})), null);
  assert.equal(T.wildShapeActivity(null), null);
  let n = 0;
  const real = globalThis.fromUuidSync;
  globalThis.fromUuidSync = uuid => { n++; return real(uuid); };
  const list = T.forms(talo);
  globalThis.fromUuidSync = real;
  assert.deepEqual(list.map(f => [f.id, f.name, f.uuid]), [["p1", "Dire Wolf", wolfSrc.uuid], ["p2", "Brown Bear", "Actor.brownBearSrc0001"], ["p3", "Ape", apeSrc.uuid]]);
  assert.equal(list[0].actor, wolfSrc);
  assert.equal(n, 4);
  assert.deepEqual(T.forms(F.W.makeActor({})), []);
});

test("isWildShapeForm: polymorphed with the wildshape preset only", () => {
  const mk = (isPolymorphed, preset) => F.W.makeActor({ isPolymorphed, flags: { dnd5e: { transformOptions: preset ? { preset } : undefined } } });
  assert.equal(T.isWildShapeForm(mk(true, "wildshape")), true);
  assert.equal(T.isWildShapeForm(mk(true, "polymorph")), false);
  assert.equal(T.isWildShapeForm(mk(false, "wildshape")), false);
  assert.equal(T.isWildShapeForm(mk(true, null)), false);
  assert.equal(T.isWildShapeForm(null), false);
});

/* ── chat ─────────────────────────────────────────────────────────────────── */

test("say(): one message, the line class, the actor's speaker; a failure warns and resolves undefined", async () => {
  const { talo } = F.W.talo();
  F.chat.length = 0;
  await T.say(talo, "<strong>x</strong>");
  assert.deepEqual(F.chat, [{ content: `<p class="pentaryn-transform-line"><strong>x</strong></p>`, speaker: { alias: "Talo", actor: IDS.talo } }]);
  F.chatFails = true;
  F.console.length = 0;
  assert.equal(await T.say(talo, "y"), undefined);
  F.chatFails = false;
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | chat line failed"]]);
});

/* ── the bonus-action mark ────────────────────────────────────────────────── */

test("markBonusUsed / bonusUsedNow: per token and turn, in the started combat whose turn it is", () => {
  const { talo } = F.W.talo();
  const tokenId = talo._tokens[0].id;
  T.markBonusUsed(F.W.makeActor({ tokens: [] }));          // no token: nothing
  assert.equal(T.bonusUsedNow(tokenId), false);
  const combat = { id: "cmb1", started: true, round: 2, turn: 1, combatant: { tokenId } };
  const viewed = { id: "cmbV", started: true, round: 1, turn: 0, combatant: { tokenId: "someoneElse" } };
  game.combat = viewed;
  T.markBonusUsed(talo);
  assert.equal(T.bonusUsedNow(tokenId), false, "no combat known by id yet");
  game.combats.set("cmb1", combat);
  game.combats.set("cmbV", viewed);
  T.markBonusUsed(talo);
  assert.equal(T.bonusUsedNow(tokenId), true, "found in game.combats though game.combat is another");
  assert.equal(T.bonusUsedNow("otherToken"), false);
  combat.turn = 2;
  assert.equal(T.bonusUsedNow(tokenId), false, "next turn");
  combat.turn = 1;
  combat.round = 3;
  assert.equal(T.bonusUsedNow(tokenId), false, "next round");
  combat.round = 2;
  combat.started = false;
  assert.equal(T.bonusUsedNow(tokenId), false, "combat ended");
  combat.started = true;
  assert.equal(T.bonusUsedNow(tokenId), true);
  combat.combatant = { tokenId: "x" };
  T.markBonusUsed(talo);
  assert.equal(T.bonusUsedNow(tokenId), true, "no current turn for the token: the old mark stays");
  game.combat = null;
  game.combats.clear();
});

/* ── who runs the automatic endings ───────────────────────────────────────── */

test("isRunner: the active GM; with no GM, the first active non-GM owner by id", () => {
  const { talo } = F.W.talo({ ownership: { default: 0, [IDS.player]: 3, [IDS.player2]: 3 } });
  assert.equal(T.isRunner(talo), true, "this client is the active GM");
  F.become({ userId: IDS.player });
  assert.equal(T.isRunner(talo), false, "a GM is connected");
  const gm = game.users.get(IDS.gm);
  gm.active = false;
  assert.equal(T.isRunner(talo), true, "no GM: the only active owner");
  game.users.get(IDS.player2).active = true;
  assert.equal(T.isRunner(talo), true, "plyUser000000001 sorts first");
  F.become({ userId: IDS.player2 });
  assert.equal(T.isRunner(talo), false);
  game.users.get(IDS.player2).active = false;
  gm.active = true;
  F.become({ userId: IDS.gm });
});

/* ── console texts ────────────────────────────────────────────────────────── */

test("every console text in the three files (golden/console-texts.json; step 9 moves them, [declared])", () => {
  const hits = sourceScan(ROOT, /console\.(log|warn|error)\(/);
  const rows = hits.map(h => {
    const m = /console\.(log|warn|error)\(`\$\{MODULE_ID\} \| ([^`]*)`/.exec(h.text);
    return [h.file, m?.[1] ?? "?", m?.[2] ?? h.text];
  }).sort((a, b) => (a.join("|") < b.join("|") ? -1 : 1));
  pinJSON("console-texts", rows, import.meta.url);
  // KNOWN (-15): silent catches with no text at all — pinned so step 9 can name them.
  const silent = sourceScan(ROOT, /catch\s*(\(\w*\))?\s*\{\s*(return null;\s*)?\}/);
  assert.deepEqual(silent.map(h => [h.file, h.text.replace(/\s+/g, " ")]), [["hud.mjs", "} catch (err) { }"], ["hud.mjs", "} catch { return null; }"]]);
  const swallowed = sourceScan(ROOT, /\.catch\(\(\) =>/);
  assert.deepEqual(swallowed.map(h => [h.file, h.text.includes('"") ') || h.text.includes("=> \"\")") ? "empty-string" : "null"]),
    [["starry.mjs", "null"], ["transform.mjs", "empty-string"]]);
});
