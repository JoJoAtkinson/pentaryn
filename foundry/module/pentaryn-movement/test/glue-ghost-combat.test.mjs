// Ghost during a fight (feedback nwhjz2, triage I1) through the glue: the drag wrap, the "fight
// started" auto-clear, the toolbar, status(), the GM's Token HUD toggle, setGhost(ref, { combat }) and
// inspect(ref). Driven only through hooks, settings and the published API, like glue.test.mjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, PLAYER, SCENE, OTHER, actor, combat, movementWorld, token } from "./fixtures/world.mjs";
import { readJSON } from "./kit/harness.mjs";

const HUD_TIPS = readJSON(new URL("../lang/en.json", import.meta.url)).PENTARYN_MOVEMENT.hud.combat;

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-movement";
const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("drawTokenLayer", canvas.tokens);
F.fire("ready");
const api = game.pentaryn.movement;

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function settle() {
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(60);
    await flush();
  }
}
const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const toasts = from => since(from, "notify").map(c => [c.level, c.message, c.opts]);
const asPlayer = () => F.become({ userId: PLAYER });
const asGM = () => F.become({ userId: GM });
async function set(key, value) {
  await game.settings.set(MOD, key, value);
  await settle();
}
/** The viewed scene's token documents (what the button-level rule scans). */
function sceneTokens(...placeables) {
  canvas.scene.tokens = { contents: placeables.map(p => p.document) };
}
/** Back to: player, exploration, ghost off, no combat, no tokens on the scene. */
async function reset() {
  asPlayer();
  game.combats.contents = [];
  sceneTokens();
  await set("ghostPolicy", "exploration");
  await set("ghost", false);
  await settle();
}

const spirit = () => actor({ id: "spirit0000000001", name: "Undead Spirit", feats: ["Incorporeal Passage"] });
const wizard = () => actor({ id: "wizard0000000001", name: "Caven", spells: ["Etherealness"], feats: ["Arcane Recovery"] });
const flagged = () => actor({ id: "flagged000000001", name: "Marked One", flag: true });
const plain = () => actor({ id: "plain00000000001", name: "Guard" });
const drag = t => JSON.stringify(CONFIG.Token.objectClass.prototype._getDragConstrainOptions.call(t));
const BASE = JSON.stringify({ ignoreWalls: false, k: 1 });
const GHOST = JSON.stringify({ ignoreWalls: true, k: 1, ignoreCost: true, ignoreTokens: true });

test("drag wrap in a fight: the spirit (feat) and the flagged token ghost; the wizard (spell) and the plain token stop at walls", async () => {
  await reset();
  await set("ghost", true);
  game.combats.contents = [combat()];
  F.fire("createCombat");
  // the four fixtures: the player owns them all, the fight runs here, the button is on
  sceneTokens(token({ id: "s", owner: true, actor: spirit() }));
  await settle();
  assert.equal(game.settings.get(MOD, "ghost"), true, "the fight did not clear the wish (an exempt token is here)");
  assert.equal(drag(token({ id: "s", owner: true, actor: spirit() })), GHOST, "Undead Spirit with Incorporeal Passage");
  assert.equal(drag(token({ id: "w", owner: true, actor: wizard() })), BASE, "PC with the Etherealness spell");
  assert.equal(drag(token({ id: "f", owner: true, actor: flagged() })), GHOST, "GM-flagged token");
  assert.equal(drag(token({ id: "p", owner: true, actor: plain() })), BASE, "plain token in combat");
  assert.equal(drag(token({ id: "n", owner: true })), BASE, "no actor at all");
  assert.equal(drag(token({ id: "s2", owner: false, actor: spirit() })), BASE, "someone else's spirit");
  assert.equal(api.ghostFor(token({ id: "s", owner: true, actor: spirit() })), true);
  assert.equal(api.ghostFor(token({ id: "p", owner: true, actor: plain() })), false);
  asGM();
  assert.equal(drag(token({ id: "s", owner: true, actor: spirit() })), BASE, "the GM never ghosts through this module");
  asPlayer();
  // out of the fight everyone ghosts again; under "always" the exception is moot
  game.combats.contents = [];
  F.fire("deleteCombat");
  await settle();
  assert.equal(drag(token({ id: "p", owner: true, actor: plain() })), GHOST);
  await reset();
});

test("fight started with only plain tokens: cleared as before; with the spirit here: wish kept, no toast, button on", async () => {
  await reset();
  await set("ghost", true);
  sceneTokens(token({ id: "p", owner: true, actor: plain() }), token({ id: "s", owner: false, actor: spirit() }));
  let from = mark();
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.cleared.combat", { localize: true }]], "someone else's spirit does not count");
  assert.equal(game.settings.get(MOD, "ghost"), false);

  await reset();
  await set("ghost", true);
  sceneTokens(token({ id: "p", owner: true, actor: plain() }), token({ id: "s", owner: true, actor: spirit() }));
  from = mark();
  game.combats.contents = [combat()];
  F.fire("createCombat");
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(toasts(from), [], "no 'fight started' toast");
  assert.equal(game.settings.get(MOD, "ghost"), true, "the auto-clear leaves the wish alone");
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const tool = controls.tokens.tools.pentarynGhost;
  assert.equal(tool.active, true);
  assert.equal(tool.title, "PENTARYN_MOVEMENT.tool.on");
  assert.deepEqual(tool.toolclip.items.map(i => i.paragraph), ["PENTARYN_MOVEMENT.tool.clip.what", "PENTARYN_MOVEMENT.tool.clip.on",
    "PENTARYN_MOVEMENT.tool.clip.exempt", "PENTARYN_MOVEMENT.tool.clip.vision"], "the toolclip says only incorporeal tokens pass");
  const el = { querySelector: () => ({ classList: { toggle: (cls, on) => F.calls.push({ op: "badge", cls, on }) } }) };
  from = mark();
  F.fire("renderSceneControls", null, el);
  assert.deepEqual(since(from, "badge"), [{ op: "badge", cls: "pm-blocked", on: false }], "no swords badge");
  // status() names the exempt tokens and answers allowed
  const s = api.status();
  assert.equal(s.combatOnScene, true);
  assert.equal(s.allowed, true);
  assert.equal(s.reason, null);
  assert.equal(s.ghost, true);
  assert.deepEqual(s.combatExempt, ["s"]);
  assert.deepEqual(api.status(OTHER).combatExempt, [], "another scene: no fight there");
  // the spirit leaves (dies): the next refresh clears the wish as a fight does
  sceneTokens(token({ id: "p", owner: true, actor: plain() }));
  from = mark();
  F.fire("deleteToken", { id: "s", parent: { id: SCENE } });
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.cleared.combat", { localize: true }]]);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await reset();
});

test("button off in the fight, the spirit arrives (createToken): the button is ready, the back.exempt toast comes once", async () => {
  await reset();
  await set("ghost", true);
  sceneTokens(token({ id: "p", owner: true, actor: plain() }));
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  assert.equal(game.settings.get(MOD, "ghost"), false, "cleared by the fight");
  let from = mark();
  F.fire("createToken", { id: "x", parent: { id: OTHER } });        // another scene: nothing
  await settle();
  assert.deepEqual(toasts(from), []);
  sceneTokens(token({ id: "p", owner: true, actor: plain() }), token({ id: "s", owner: true, actor: spirit() }));
  from = mark();
  F.fire("createToken", { id: "s", parent: { id: SCENE } });
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.exempt", { localize: true }]]);
  assert.deepEqual(since(from, "controls.render").map(c => c.opts), [{ reset: true }]);
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  assert.equal(controls.tokens.tools.pentarynGhost.title, "PENTARYN_MOVEMENT.tool.ready");
  from = mark();
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(toasts(from), [], "once only");
  // the player presses the button mid-fight: allowed, no warn
  from = mark();
  await controls.tokens.tools.pentarynGhost.onChange(null, true);
  await settle();
  assert.deepEqual(toasts(from), []);
  assert.equal(game.settings.get(MOD, "ghost"), true);
  await reset();
});

test("setGhost(ref, { combat }): GM writes the actor flag (audit line), idempotent; player refused; bad refs are refusal objects; boolean form unchanged", async () => {
  await reset();
  const calls = [];
  const guard = actor({ id: "guard00000000001", name: "Guard", calls });
  const a = api.ghostFor;
  assert.equal(typeof a, "function");
  // player: refused
  const refused = await api.setGhost(guard, { combat: true });
  assert.deepEqual(refused, { ok: false, code: "NOT_GM", reason: "GM only" });
  assert.deepEqual(calls, []);
  asGM();
  const logged = [];
  const savedInfo = console.info;
  console.info = (...args) => logged.push(args.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  let r;
  try {
    r = await api.setGhost(guard, { combat: true });
  } finally {
    console.info = savedInfo;
  }
  assert.deepEqual(r, { ok: true, uuid: "Actor.guard00000000001", name: "Guard", ghostInCombat: true, feat: null });
  assert.deepEqual(calls, [{ op: "setFlag", uuid: "Actor.guard00000000001", scope: MOD, key: "ghostInCombat", value: true }]);
  assert.equal(guard.flags[MOD].ghostInCombat, true);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^pentaryn-movement \| ghostInCombat/);
  assert.match(logged[0], /"by":"gmUser0000000001"/);
  // already on: no second write
  r = await api.setGhost(guard, { combat: true });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  // off: unsetFlag
  r = await api.setGhost(guard, { combat: false });
  assert.deepEqual(r, { ok: true, uuid: "Actor.guard00000000001", name: "Guard", ghostInCombat: false, feat: null });
  assert.deepEqual(calls.at(-1), { op: "unsetFlag", uuid: "Actor.guard00000000001", scope: MOD, key: "ghostInCombat" });
  assert.equal(guard.flags[MOD].ghostInCombat, undefined);
  // a token placeable gives its actor; the feat is reported
  const sp = spirit();
  r = await api.setGhost(token({ id: "s", actor: sp }), { combat: true });
  assert.equal(r.ok, true);
  assert.equal(r.feat, "Incorporeal Passage");
  assert.equal(sp.flags[MOD].ghostInCombat, true);
  // bad arguments
  assert.deepEqual((await api.setGhost(guard, {})).code, "BAD_ARGS");
  assert.deepEqual((await api.setGhost(guard)).code, "BAD_ARGS");
  assert.equal((await api.setGhost("nobodyByThisName", { combat: true })).code, "NOT_FOUND");
  assert.equal((await api.setGhost({ not: "a document" }, { combat: true })).code, "BAD_ARGS");
  // the boolean form is still the GM's own client setting
  await api.setGhost(true);
  assert.equal(game.settings.get(MOD, "ghost"), true);
  await api.setGhost(false);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await reset();
});

test("inspect(ref): flag, feat and ghostInCombat, plain JSON; a miss throws NOT_FOUND", async () => {
  await reset();
  assert.deepEqual(api.inspect(spirit()), { uuid: "Actor.spirit0000000001", name: "Undead Spirit", flag: false, feat: "Incorporeal Passage", ghostInCombat: true });
  assert.deepEqual(api.inspect(wizard()), { uuid: "Actor.wizard0000000001", name: "Caven", flag: false, feat: null, ghostInCombat: false });
  assert.deepEqual(api.inspect(flagged()), { uuid: "Actor.flagged000000001", name: "Marked One", flag: true, feat: null, ghostInCombat: true });
  assert.equal(api.inspect(token({ id: "p", actor: plain() })).ghostInCombat, false, "a token placeable gives its actor");
  assert.throws(() => api.inspect("nobodyByThisName"), /NOT_FOUND/);
  assert.throws(() => api.inspect(), /BAD_ARGS/);
});

/** The kit's htmlRoot needs a HTMLElement global (node has none): every fake element is one. */
class FakeElement {}
globalThis.HTMLElement = FakeElement;

/** A Token HUD as renderTokenHUD hands it over: the app and a right column that records appends. */
function hud(placeable) {
  const col = Object.assign(new FakeElement(), {
    children: [],
    querySelector: sel => col.children.find(b => b.className.split(" ").includes(sel.slice(1))) ?? null,
    appendChild: b => { col.children.push(b); },
    ownerDocument: { createElement: tag => Object.assign(new FakeElement(), {
      tag, className: "", dataset: {}, attrs: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
    }) },
  });
  const element = Object.assign(new FakeElement(), { querySelector: sel => (sel === ".col.right" ? col : null) });
  const app = { object: placeable, render: () => F.calls.push({ op: "hud.render" }) };
  return { app, element, col };
}
const click = btn => btn.listeners.click({ preventDefault() {}, stopPropagation() {} });

test("Token HUD: the GM gets a ghost toggle on the right; a click flips the flag and re-renders; feat-granted is pressed and inert; players see nothing", async () => {
  await reset();
  const calls = [];
  const guard = actor({ id: "guard00000000002", name: "Guard", calls });
  let h = hud(token({ id: "g", actor: guard }));
  F.fire("renderTokenHUD", h.app, h.element);
  assert.equal(h.col.children.length, 0, "a player's HUD gets no toggle");

  asGM();
  h = hud(token({ id: "g", actor: guard }));
  F.fire("renderTokenHUD", h.app, h.element);
  F.fire("renderTokenHUD", h.app, h.element);           // a re-render adds nothing twice
  assert.equal(h.col.children.length, 1);
  const btn = h.col.children[0];
  assert.equal(btn.className, "control-icon pm-ghost-combat");
  assert.equal(btn.dataset.tooltipText, HUD_TIPS.off);
  assert.equal(btn.attrs["aria-label"], HUD_TIPS.off);
  assert.equal(btn.dataset.tooltip, undefined, "plain text tip, never data-tooltip");
  let from = mark();
  click(btn);
  await flush();
  assert.deepEqual(calls, [{ op: "setFlag", uuid: "Actor.guard00000000002", scope: MOD, key: "ghostInCombat", value: true }]);
  assert.equal(since(from, "hud.render").length, 1);
  // drawn again: pressed, with the "on" tip; a click clears it
  h = hud(token({ id: "g", actor: guard }));
  F.fire("renderTokenHUD", h.app, h.element);
  assert.equal(h.col.children[0].className, "control-icon pm-ghost-combat active");
  assert.equal(h.col.children[0].dataset.tooltipText, HUD_TIPS.on);
  click(h.col.children[0]);
  await flush();
  assert.deepEqual(calls.at(-1), { op: "unsetFlag", uuid: "Actor.guard00000000002", scope: MOD, key: "ghostInCombat" });
  // a creature whose feat grants it: pressed, named in the tip, the click writes nothing
  const spCalls = [];
  const sp = actor({ id: "spirit0000000002", name: "Undead Spirit", feats: ["Incorporeal Passage"], calls: spCalls });
  h = hud(token({ id: "s", actor: sp }));
  F.fire("renderTokenHUD", h.app, h.element);
  assert.equal(h.col.children[0].className, "control-icon pm-ghost-combat active");
  assert.equal(h.col.children[0].dataset.tooltipText, HUD_TIPS.feat.replace("{feat}", "Incorporeal Passage"), "the tip names the feat");
  from = mark();
  click(h.col.children[0]);
  await flush();
  assert.deepEqual(spCalls, []);
  assert.equal(since(from, "hud.render").length, 0);
  // no actor, no right column, a jQuery-wrapped element: nothing, no throw
  F.fire("renderTokenHUD", { object: token({ id: "n" }) }, hud(token({ id: "n" })).element);
  F.fire("renderTokenHUD", hud(token({ id: "g", actor: guard })).app, { querySelector: () => null });
  const jq = hud(token({ id: "g", actor: guard }));
  F.fire("renderTokenHUD", jq.app, { jquery: "3.7", 0: jq.element });
  assert.equal(jq.col.children.length, 1, "a jQuery wrapper is unwrapped");
  F.fire("renderTokenHUD", hud(token({ id: "g", actor: guard })).app, [jq.element]);   // a bare array is not one: nothing, no throw
  await reset();
});

test("our flag arriving on an actor or a token delta queues a refresh; other changes do not", async () => {
  await reset();
  await settle();
  let from = mark();
  F.fire("updateActor", { getActiveTokens: () => [] }, { name: "x" });
  F.fire("updateToken", {}, { x: 5 });
  await settle();
  assert.deepEqual(since(from, "controls.render"), []);
  // a fight runs; the GM flags the player's plain token: the button comes back
  await set("ghost", true);
  const guard = actor({ id: "guard00000000003", name: "Guard" });
  sceneTokens(token({ id: "g", owner: true, actor: guard }));
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  assert.equal(game.settings.get(MOD, "ghost"), false, "cleared: the guard is plain");
  guard.flags[MOD] = { ghostInCombat: true };
  from = mark();
  F.fire("updateToken", {}, { delta: { flags: { [MOD]: { ghostInCombat: true } } } });
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.exempt", { localize: true }]]);
  assert.deepEqual(since(from, "controls.render").map(c => c.opts), [{ reset: true }]);
  delete guard.flags[MOD];
  from = mark();
  F.fire("updateActor", { getActiveTokens: () => [] }, { flags: { [MOD]: { "-=ghostInCombat": null } } });
  await settle();
  assert.deepEqual(since(from, "controls.render").map(c => c.opts), [{ reset: true }], "back to the dimmed combat state");
  await reset();
});
