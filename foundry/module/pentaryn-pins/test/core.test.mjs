// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
// One fixture table per rule (plan context/plans/pin-2026-10.md §3 "Pure rules"; the 0.2.0 rules:
// context/plans/pin-2026-10-rebuild.md §8.1).
import * as core from "../pins-core.mjs";
import { rootActorId } from "../lib/root-actor.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const TALO = "taloActor0000001";
const WOLF = "wolfForm00000001";
const BEAR = "bearForm00000001";
const MIRA = "miraActor0000001";

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  for (const fn of ["pinOf", "pickToken", "activateDecision", "netDecision", "coreSwitchesLevel", "levelFollow", "replayDecision",
    "tokenNotice", "auditPins", "menuTrigger", "menuAllowed", "menuPlacement", "teleportChoices", "pinnedName", "gatherPlan", "gatherRow", "gatherResult"]) assert.equal(typeof core[fn], "function", fn);
  for (const gone of ["viewDecision", "queueDecision", "followNeeded", "TOAST_EVERY_MS", "SETTLE_MS", "SETTLE_GIVE_UP_MS"]) {
    assert.equal(gone in core, false, `${gone} was deleted in 0.2.0 (core's own pull moves the player)`);
  }
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, manifest.flags.pentaryn.namespace);
  assert.equal(core.CSS, manifest.flags.pentaryn.cssPrefix);
  assert.equal(core.FLAG_SCOPE, manifest.flags.pentaryn.flagScope);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
});

test("every HOOKS row is named pentaryn-<short>.* (or carries a legacyName with an until)", () => {
  for (const [key, row] of Object.entries(core.HOOKS)) {
    assert.ok(row.name.startsWith(`${core.MODULE}.`), key);
    if (row.legacyName) assert.ok(row.until, `${key}: legacyName needs until`);
  }
});

test("pinOf: a 16-char id → it; missing, empty, non-string or malformed → null", () => {
  const f = v => ({ [core.MODULE]: { actor: v } });
  const table = [
    [f(TALO), TALO],
    [undefined, null],
    [{}, null],
    [{ [core.MODULE]: {} }, null],
    [f(""), null],
    [f(42), null],
    [f({ id: TALO }), null],
    [f("short"), null],
    [f(`${TALO}x`), null],
    [f("taloActor00000-1"), null],
  ];
  for (const [input, want] of table) assert.equal(core.pinOf(input), want, JSON.stringify(input));
});

// pins resolves the root actor with the kit's one rule (code review 2026-10-17 #11), the same one
// portals uses; this table is pins' contract with it, and the core keeps no copy of its own.
test("rootActorId (kit lib/root-actor): the token's actor, or the original while transformed", () => {
  assert.equal("rootActorId" in core, false, "pins-core keeps its own rootActorId");
  const table = [
    ["plain token", { actorId: TALO }, TALO],
    ["polymorphed token: the token flag names the original", { actorId: WOLF, tokenOriginal: TALO }, TALO],
    ["token flag missing, the form actor's originalActor set", { actorId: WOLF, actorOriginal: TALO }, TALO],
    ["only previousActorIds", { actorId: WOLF, previousIds: [TALO] }, TALO],
    ["nested transform: two previous ids, one original", { actorId: BEAR, tokenOriginal: TALO, previousIds: [TALO, WOLF] }, TALO],
    ["malformed values fall back to actorId", { actorId: TALO, tokenOriginal: 7, actorOriginal: "", previousIds: "nope" }, TALO],
    ["malformed previous id", { actorId: WOLF, previousIds: [null] }, WOLF],
    ["no ids at all", {}, null],
  ];
  for (const [why, input, want] of table) assert.equal(rootActorId(input), want, why);
});

test("pickToken: one is it; several → the only one on the viewed scene; else ambiguous", () => {
  const a = { id: "tokA000000000001", uuid: "Scene.B.Token.tokA000000000001", scene: "B" };
  const b = { id: "tokB000000000001", uuid: "Scene.C.Token.tokB000000000001", scene: "C" };
  const sameIdOnC = { id: a.id, uuid: `Scene.C.Token.${a.id}`, scene: "C" };
  const form = { id: "tokW000000000001", uuid: "Scene.B.Token.tokW000000000001", scene: "B", form: "Wolf" };
  const table = [
    ["none", [], {}, null],
    ["one", [a], {}, a],
    ["one polymorphed token whose root is the pin", [form], {}, form],
    ["two, one on the viewed scene", [a, b], { viewedSceneId: "C" }, b],
    ["the same token id on two scenes (a keepId carry): the one on the viewed scene", [a, sameIdOnC], { viewedSceneId: "C" }, sameIdOnC],
    ["two, neither viewed", [a, b], { viewedSceneId: "Z" }, null],
    ["two, nothing viewed", [a, b], {}, null],
    ["two on the viewed scene", [a, form], { viewedSceneId: "B" }, null],
    ["latestUuid is no longer an option (0.2.0)", [a, b], { latestUuid: b.uuid }, null],
  ];
  for (const [why, cands, opts, want] of table) assert.equal(core.pickToken(cands, opts), want, why);
});

test("netDecision: none without a target or when there; wait while loading; view another scene or level (R1, R5)", () => {
  const target = { scene: "B", level: "L2" };
  const table = [
    ["no target (off, a GM, no pin, 0 or several tokens)", { target: null, viewed: { scene: "A", level: null }, loading: false }, "none"],
    ["no target while loading", { target: null, viewed: { scene: "A", level: null }, loading: true }, "none"],
    ["loading: wait for the draw to end, then check again", { target, viewed: { scene: "A", level: null }, loading: true }, "wait"],
    ["loading, already there: still wait (viewed may be stale)", { target, viewed: { scene: "B", level: "L2" }, loading: true }, "wait"],
    ["the token is on another scene", { target, viewed: { scene: "A", level: null }, loading: false }, "view"],
    ["nothing viewed (a blank canvas)", { target, viewed: { scene: null, level: null }, loading: false }, "view"],
    ["the viewed scene, another level (a copy-paste onto another floor, A1-3 / R5)", { target, viewed: { scene: "B", level: "L1" }, loading: false }, "view"],
    ["the token's scene and level", { target, viewed: { scene: "B", level: "L2" }, loading: false }, "none"],
    ["a token with no level (or an orphan one): the scene is enough", { target: { scene: "B", level: null }, viewed: { scene: "B", level: "L1" }, loading: false }, "none"],
    ["loading defaults to false", { target, viewed: { scene: "A", level: null } }, "view"],
  ];
  for (const [why, input, want] of table) assert.equal(core.netDecision(input), want, why);
});

// A copy of the per-token test in TokenDocument.#handleMovementOperation, token.mjs:2927-2946 (v14.369)
test("coreSwitchesLevel: one row per clause of core's level switch (token.mjs:2927-2946)", () => {
  const base = { viewedLevel: "L1", origin: "L1", observes: true, ownsOtherSighted: false, selfMove: false, method: "api" };
  const table = [
    ["viewed the origin level, observes, no other owned sighted token there: core switches", base, true],
    ["no viewed level", { ...base, viewedLevel: null }, false],
    [":2934 the client viewed another level than the origin", { ...base, viewedLevel: "L3" }, false],
    [":2937 not observable (hidden, or no OBSERVER)", { ...base, observes: false }, false],
    [":2943 the user owns another non-hidden sighted token on the origin level", { ...base, ownsOtherSighted: true }, false],
    [":2945 …unless they moved it themselves by config", { ...base, ownsOtherSighted: true, selfMove: true, method: "config" }, true],
    [":2945 …by the HUD", { ...base, ownsOtherSighted: true, selfMove: true, method: "hud" }, true],
    [":2945 …by dragging", { ...base, ownsOtherSighted: true, selfMove: true, method: "dragging" }, true],
    [":2945 …by keyboard", { ...base, ownsOtherSighted: true, selfMove: true, method: "keyboard" }, true],
    [":2945 a self move by api is not one of them", { ...base, ownsOtherSighted: true, selfMove: true, method: "api" }, false],
    [":2945 a GM's drag is not a self move", { ...base, ownsOtherSighted: true, selfMove: false, method: "dragging" }, false],
    ["defaults: no self move", { viewedLevel: "L1", origin: "L1", observes: true, ownsOtherSighted: true }, false],
  ];
  for (const [why, input, want] of table) assert.equal(core.coreSwitchesLevel(input), want, why);
});

test("levelFollow: pins views the new level only where core will not", () => {
  const tok = { uuid: "Scene.B.Token.t1" };
  const base = { target: { scene: "B", level: "L2", token: tok }, tokenUuid: tok.uuid, to: "L2", viewedLevel: "L1", core: false };
  const table = [
    ["the pinned token moved to another level and core will not switch", base, true],
    ["core switches: never both", { ...base, core: true }, false],
    ["no target (off, a GM, ambiguous)", { ...base, target: null }, false],
    ["another token of the same root (not the target)", { ...base, tokenUuid: "Scene.B.Token.other" }, false],
    ["the target's level is not `to` (an orphan level: levelOn gave null)", { ...base, target: { ...base.target, level: null } }, false],
    ["already viewing that level", { ...base, viewedLevel: "L2" }, false],
    ["no destination level", { ...base, to: null }, false],
  ];
  for (const [why, input, want] of table) assert.equal(core.levelFollow(input), want, why);
});

test("replayDecision: only a pinned player whose canvas is loading (core drops that pull)", () => {
  const table = [
    [{ pinned: true, loading: true }, true],
    [{ pinned: true, loading: false }, false],
    [{ pinned: false, loading: true }, false],
    [{ pinned: false, loading: false }, false],
  ];
  for (const [input, want] of table) assert.equal(core.replayDecision(input), want, JSON.stringify(input));
});

test("tokenNotice: 0 → STRANDED, 2+ → PAUSED, 1 → forget; the same count never twice in a row", () => {
  const table = [
    ["one token: nothing, forget", { n: 1, last: null }, { notice: null, last: null }],
    ["one token after a toast: forget", { n: 1, last: 2 }, { notice: null, last: null }],
    ["no token left", { n: 0, last: null }, { notice: "STRANDED", last: 0 }],
    ["still none", { n: 0, last: 0 }, { notice: null, last: 0 }],
    ["a second token", { n: 2, last: null }, { notice: "PAUSED", last: 2 }],
    ["still two", { n: 2, last: 2 }, { notice: null, last: 2 }],
    ["a third", { n: 3, last: 2 }, { notice: "PAUSED", last: 3 }],
    ["from none to two", { n: 2, last: 0 }, { notice: "PAUSED", last: 2 }],
    ["last defaults to null", { n: 0 }, { notice: "STRANDED", last: 0 }],
  ];
  for (const [why, input, want] of table) assert.deepEqual(core.tokenNotice(input), want, why);
});

test("timings: the grace window and the poll", () => {
  assert.equal(core.NET_GRACE_MS, 1500);
  assert.equal(core.NET_POLL_MS, 250);
  assert.equal(core.HOOKS.followed.args, "({ scene, level, reason: cut|level|retry })");
});

test("activateDecision: skip another scene's activation and the token scene's deactivation", () => {
  const target = { scene: "B" };
  const base = { enabled: true, isGM: false, target, viewedId: "B" };
  const table = [
    ["off", { ...base, enabled: false, active: true, sceneId: "C" }, "call"],
    ["GM", { ...base, isGM: true, active: true, sceneId: "C" }, "call"],
    ["no target", { ...base, target: null, active: true, sceneId: "C" }, "call"],
    ["activating another scene", { ...base, active: true, sceneId: "C" }, "skip"],
    ["activating the token's scene", { ...base, active: true, sceneId: "B" }, "call"],
    ["deactivating the viewed token scene", { ...base, active: false, sceneId: "B" }, "skip"],
    ["deactivating a scene not viewed", { ...base, active: false, sceneId: "C" }, "call"],
    ["deactivating the viewed scene that is not the token's", { ...base, viewedId: "C", active: false, sceneId: "C" }, "call"],
  ];
  for (const [why, input, want] of table) assert.equal(core.activateDecision(input), want, why);
});

test("auditPins: every code; a form-only token is ok", () => {
  const users = { u1: { id: "u1", name: "Talo", isGM: false }, u2: { id: "u2", name: "Mira", isGM: false }, gm: { id: "gm", name: "GM", isGM: true } };
  const actors = { [TALO]: { id: TALO, name: "Talo" }, [MIRA]: { id: MIRA, name: "Mira" } };
  const tok = (id, scene, extra = {}) => ({ id, scene, sceneName: scene.toUpperCase(), linked: true, ...extra });
  const run = (pins, tokensByRoot) => core.auditPins({ pins, users, actors, tokensByRoot });
  const codes = r => r.violations.map(v => v.code);

  const good = run([{ user: "u1", actor: TALO }, { user: "u2", actor: MIRA }], { [TALO]: [tok("t1", "b")], [MIRA]: [tok("t2", "c")] });
  assert.deepEqual([good.ok, good.pins, good.violations], [true, 2, []]);
  const form = run([{ user: "u1", actor: TALO }], { [TALO]: [tok("tw", "b", { form: "Wolf" })] });
  assert.deepEqual([form.ok, codes(form)], [true, []], "a pin whose only token is a polymorphed form");

  assert.deepEqual(codes(run([{ user: "u1", actor: TALO }], {})), ["NO_TOKEN"]);
  const many = run([{ user: "u1", actor: TALO }], { [TALO]: [tok("t1", "b"), tok("t2", "c")] });
  assert.deepEqual([many.ok, codes(many), many.violations[0].detail], [false, ["MANY_TOKENS"], "B, C"]);
  assert.deepEqual(codes(run([{ user: "u1", actor: "deadActor0000001" }], {})), ["NO_ACTOR"]);
  assert.deepEqual(codes(run([{ user: "gm", actor: TALO }], { [TALO]: [tok("t1", "b")] })), ["GM_USER"]);
  const shared = run([{ user: "u1", actor: TALO }, { user: "u2", actor: TALO }], { [TALO]: [tok("t1", "b")] });
  assert.deepEqual(codes(shared), ["SHARED_ACTOR", "SHARED_ACTOR"]);
  assert.equal(shared.violations[0].detail, "Talo, Mira");
  const unlinked = run([{ user: "u1", actor: TALO }], { [TALO]: [tok("t1", "b", { linked: false })] });
  assert.deepEqual([unlinked.ok, codes(unlinked), unlinked.violations[0].level], [true, ["UNLINKED"], "warn"], "a warning; the token still counts");
  const notOwner = run([{ user: "u1", actor: TALO, observes: false }], { [TALO]: [tok("t1", "b")] });
  assert.deepEqual([notOwner.ok, codes(notOwner), notOwner.violations[0].level], [true, ["NOT_OWNER"], "warn"], "the player cannot observe the actor: a warning");
  assert.deepEqual(codes(run([{ user: "u1", actor: TALO, observes: true }], { [TALO]: [tok("t1", "b")] })), []);
  assert.deepEqual(Object.keys(many.violations[0]), ["code", "level", "user", "actor", "tokens", "detail"]);
});

test("menuTrigger: open once both contextmenu and the right up arrived, either order", () => {
  const down = { type: "down", button: 2, x: 10, y: 10 };
  const up = { type: "up", button: 2, x: 11, y: 12 };
  const cm = { type: "contextmenu", onBoard: true };
  const table = [
    ["Windows: down, up, contextmenu", [down, up, cm], { action: "open", release: { x: 11, y: 12 } }],
    ["macOS: down, contextmenu, up", [down, cm, up], { action: "open", release: { x: 11, y: 12 } }],
    ["only the up", [down, up], { action: "wait" }],
    ["only the contextmenu", [down, cm], { action: "wait" }],
    ["a left press after the right down", [down, { type: "down", button: 0 }], { action: "reset" }],
    ["nothing", [], { action: "wait" }],
  ];
  for (const [why, seq, want] of table) assert.deepEqual(core.menuTrigger(seq), want, why);
});

test("menuAllowed: every gate", () => {
  const ok = { isGM: true, enabled: true, ready: true, tokensLayer: true, onBoard: true,
    down: { x: 100, y: 100, buttons: 2, dragging: false }, release: { x: 102, y: 103 }, hit: false };
  assert.equal(core.menuAllowed(ok), true);
  for (const gate of ["isGM", "enabled", "ready", "tokensLayer", "onBoard"]) assert.equal(core.menuAllowed({ ...ok, [gate]: false }), false, gate);
  assert.equal(core.menuAllowed({ ...ok, down: null }), false, "no recorded right down");
  assert.equal(core.menuAllowed({ ...ok, down: { ...ok.down, buttons: 3 } }), false, "a right press chorded into a left drag");
  assert.equal(core.menuAllowed({ ...ok, down: { ...ok.down, dragging: true } }), false, "a drag live at the down");
  assert.equal(core.MENU_SLOP, 10, "core's DEFAULT_DRAG_RESISTANCE_PX: no dead zone between a click and a pan");
  assert.equal(core.menuAllowed({ ...ok, release: { x: 107, y: 105 } }), true, "a 9 px drift core does not pan still opens it");
  assert.equal(core.menuAllowed({ ...ok, release: { x: 110, y: 100 } }), false, "10 px: core pans");
  assert.equal(core.menuAllowed({ ...ok, release: { x: 130, y: 100 } }), false, "a right-drag pan");
  assert.equal(core.menuAllowed({ ...ok, down: { ...ok.down, travel: 300 }, release: { x: 101, y: 100 } }), false, "a pan that came back to its start");
  assert.equal(core.menuAllowed({ ...ok, down: { ...ok.down, travel: 6 } }), true, "a small wobble on the way");
  assert.equal(core.menuAllowed({ ...ok, down: { ...ok.down, placing: true } }), false, "core's token placement (a right click skips a preview)");
  assert.equal(core.menuAllowed({ ...ok, hit: true }), false, "a token or door under the point");
});

test("teleportChoices: logged-in players by name; no pin, no token, a wild-shaped PC", () => {
  const users = [
    { id: "u3", name: "Zed", active: true, isGM: false },
    { id: "u1", name: "Ana", active: true, isGM: false },
    { id: "u2", name: "Bo", active: false, isGM: false },
    { id: "gm", name: "GM", active: true, isGM: true },
    { id: "u4", name: "Cy", active: true, isGM: false },
    { id: "u5", name: "Dee", active: true, isGM: false },
  ];
  const pinsByUser = { u1: TALO, u2: MIRA, u3: null, u4: MIRA, u5: "otherActor000001" };
  const tokenInfo = { [TALO]: { name: "Talo", token: true }, [MIRA]: { name: "Mira", token: false }, otherActor000001: { name: "Wolf's druid", token: true } };
  assert.deepEqual(core.teleportChoices(users, pinsByUser, tokenInfo), [
    { user: "u1", label: "Ana — Talo", enabled: true, reason: null },
    { user: "u4", label: "Cy — Mira", enabled: false, reason: "NO_TOKEN" },
    { user: "u5", label: "Dee — Wolf's druid", enabled: true, reason: null },
    { user: "u3", label: "Zed", enabled: false, reason: "NO_PIN" },
  ]);
  assert.deepEqual(core.teleportChoices([], {}, {}), []);
});

test("pinnedName: the user pinned to that root, else null", () => {
  const users = [{ id: "u1", name: "Talo's player", pin: TALO }, { id: "u2", name: "Other", pin: null }];
  assert.equal(core.pinnedName(users, TALO), "Talo's player");
  assert.equal(core.pinnedName(users, MIRA), null);
  assert.equal(core.pinnedName(users, null), null);
  assert.equal(core.pinnedName([{ id: "gm", name: "Gamemaster", pin: TALO, isGM: true }], TALO), null, "a GM with a pin flag is not a pinned player");
});

test("menuPlacement: inside the window; the submenu flips left / up near an edge", () => {
  const base = { w: 220, h: 60, subW: 220, subH: 120, subTop: 30, vw: 1920, vh: 1080 };
  assert.deepEqual(core.menuPlacement({ ...base, x: 400, y: 300 }), { left: 400, top: 300, flipX: false, flipY: false });
  assert.deepEqual(core.menuPlacement({ ...base, x: 1800, y: 1050 }), { left: 1696, top: 1016, flipX: true, flipY: true }, "corner: shifted in, both flips");
  assert.deepEqual(core.menuPlacement({ ...base, x: 1600, y: 300 }), { left: 1600, top: 300, flipX: true, flipY: false }, "the submenu would cross the right edge");
  assert.deepEqual(core.menuPlacement({ ...base, x: 300, y: 950 }), { left: 300, top: 950, flipX: false, flipY: true }, "the submenu would cross the bottom");
  assert.equal(core.menuPlacement({ ...base, x: 0, y: 0 }).left, 4, "never off the left edge");
});

test("gatherPlan (gather plan §5.1): who is gathered, who is skipped, who is offline, in what order", () => {
  const DEST = "sceneD000000000d", SRC = "sceneS000000000s";
  const BEAR_A = "bearActor0000001", GONE = "goneActor0000001", SHARED = "sharedActor00001", NPC = "npcActor00000001";
  const U = (id, name, extra = {}) => ({ id, name, active: true, isGM: false, ...extra });
  const users = [
    U("uOff", "Offline Olga", { active: false }),
    U("uNoPin", "Nopin Ned"),
    U("gm1", "Gamemaster", { isGM: true }),
    U("gm2", "Promoted GM", { isGM: true }),
    U("uZero", "Zero Zed"),
    U("uMany", "Many Mo"),
    U("uGone", "Gone Gus"),
    U("uSh1", "Share One"),
    U("uSh2", "Share Two"),
    U("uUnl", "Unlinked Ula"),
    U("uObs", "Npc Nia"),
    U("uWolf", "Wolf Wes"),
    U("uFar", "Far Fay"),
    U("uNear", "Near Nan"),
    U("uMid", "Mid Max"),
  ];
  const tok = (id, scene, x, y, extra = {}) => ({ id, scene, sceneName: scene === DEST ? "Dest" : "Src", level: null, x, y, linked: true, form: null, ...extra });
  const A = id => ({ id, name: id.slice(0, 4) });
  const roots = { uOff: "offActor00000001", uZero: "zeroActor0000001", uMany: "manyActor0000001", uGone: GONE, uSh1: SHARED, uSh2: SHARED,
    uUnl: "unlActor00000001", uObs: NPC, uWolf: TALO, uFar: "farActor00000001", uNear: "nearActor0000001", uMid: "midActor00000001" };
  const pinsByUser = { uNoPin: null, ...roots };
  const pins = Object.entries(roots).map(([user, actor]) => ({ user, actor, observes: user !== "uObs" }));
  const actors = Object.fromEntries(Object.values(roots).filter(r => r !== GONE).map(r => [r, A(r)]));
  // the GM's pin on Mira is never in `pins` (gatherInputs leaves GM pins out): Mira's player stays a member
  const tokensByRoot = {
    offActor00000001: [tok("tOff", SRC, 0, 0)],
    zeroActor0000001: [],
    manyActor0000001: [tok("tMany1", SRC, 0, 0), tok("tMany2", DEST, 0, 0)],
    [SHARED]: [tok("tShared", SRC, 0, 0)],
    unlActor00000001: [tok("tUnl", SRC, 0, 0, { linked: false })],
    [NPC]: [tok("tNpc", SRC, 0, 0)],
    [TALO]: [tok("tWolf", SRC, 0, 0, { form: "Wolf" })],
    farActor00000001: [tok("tFar", DEST, 900, 900)],
    nearActor0000001: [tok("tNear", DEST, 450, 450, { level: "lvlUpper00000001" })],
    midActor00000001: [tok("tMid", DEST, 100, 600)],
  };
  const plan = core.gatherPlan({ users, pins, pinsByUser, actors, tokensByRoot }, { destSceneId: DEST, point: { x: 500, y: 500 }, grid: 100 });
  // 11. order: destination-scene members nearest the click first (token centre), then the rest by user name
  assert.deepEqual(plan.members.map(m => m.user.name), ["Near Nan", "Mid Max", "Far Fay", "Npc Nia", "Unlinked Ula", "Wolf Wes"]);
  assert.deepEqual(plan.members.map(m => m.sameScene), [true, true, true, false, false, false]);
  const near = plan.members[0];
  assert.deepEqual(near, { user: { id: "uNear", name: "Near Nan" }, actor: { id: "nearActor0000001", name: actors.nearActor0000001.name },
    root: "nearActor0000001", token: { id: "tNear", scene: DEST, sceneName: "Dest", level: "lvlUpper00000001", x: 450, y: 450, form: null },
    sameScene: true, warnings: [] });
  const by = name => plan.members.find(m => m.user.name === name);
  assert.deepEqual(by("Unlinked Ula").warnings, ["UNLINKED"], "8. unlinked: a member, with a warning");
  assert.deepEqual(by("Npc Nia").warnings, ["NOT_OWNER"], "9. not observing: a member, with a warning");
  assert.equal(by("Wolf Wes").token.form, "Wolf", "10. a wild-shaped form token: a member");
  assert.equal(by("Wolf Wes").token.id, "tWolf");
  // 2, 5, 6, 7: skipped with a code, in user order
  assert.deepEqual(plan.skipped.map(s => [s.user.name, s.code]), [
    ["Nopin Ned", "NO_PIN"], ["Zero Zed", "NO_TOKEN"], ["Many Mo", "MANY_TOKENS"], ["Gone Gus", "NO_ACTOR"],
    ["Share One", "SHARED_ACTOR"], ["Share Two", "SHARED_ACTOR"],
  ]);
  assert.deepEqual(plan.skipped[0], { user: { id: "uNoPin", name: "Nopin Ned" }, actor: null, code: "NO_PIN", detail: null });
  // code review G2: each skip carries the audit violation's own detail
  assert.deepEqual(plan.skipped.map(s => s.detail), [null, null, "Src, Dest", null, "Share One, Share Two", "Share One, Share Two"]);
  assert.equal(plan.skipped.find(s => s.code === "NO_ACTOR").actor, null, "a deleted actor: no actor ref");
  assert.deepEqual(plan.skipped.find(s => s.code === "MANY_TOKENS").actor, { id: "manyActor0000001", name: actors.manyActor0000001.name });
  // 1. offline pinned → offline; 3. GMs (with or without a flag) absent everywhere
  assert.deepEqual(plan.offline, [{ user: { id: "uOff", name: "Offline Olga" }, actor: { id: "offActor00000001", name: actors.offActor00000001.name } }]);
  const everyone = [...plan.members, ...plan.skipped, ...plan.offline].map(r => r.user.id);
  assert.equal(everyone.includes("gm1") || everyone.includes("gm2"), false);
  // an offline UNPINNED player is nobody's business
  const off2 = core.gatherPlan({ users: [U("u9", "Gone", { active: false })], pins: [], pinsByUser: { u9: null }, actors: {}, tokensByRoot: {} },
    { destSceneId: DEST, point: { x: 0, y: 0 }, grid: 100 });
  assert.deepEqual([off2.members, off2.skipped, off2.offline], [[], [], []]);
});

test("gatherPlan (code review G2): SHARED_ACTOR's detail names every co-pinned player, an OFFLINE one too", () => {
  const users = [{ id: "u1", name: "Ana", active: true, isGM: false }, { id: "u2", name: "Bo", active: false, isGM: false }];
  const plan = core.gatherPlan({ users, pins: [{ user: "u1", actor: TALO, observes: true }, { user: "u2", actor: TALO, observes: true }],
    pinsByUser: { u1: TALO, u2: TALO }, actors: { [TALO]: { id: TALO, name: "Talo" } },
    tokensByRoot: { [TALO]: [{ id: "t", scene: "s", sceneName: "S", level: null, x: 0, y: 0, linked: true, form: null }] } },
  { destSceneId: "s", point: { x: 0, y: 0 } });
  assert.deepEqual(plan.skipped, [{ user: { id: "u1", name: "Ana" }, actor: { id: TALO, name: "Talo" }, code: "SHARED_ACTOR", detail: "Ana, Bo" }]);
  assert.deepEqual(plan.offline.map(o => o.user.name), ["Bo"]);
});

test("gatherPlan: a GM flag on a player's actor never makes the player SHARED_ACTOR (the GM pin is not an input)", () => {
  const users = [{ id: "gm", name: "GM", active: true, isGM: true }, { id: "u1", name: "Talo's player", active: true, isGM: false }];
  // gatherInputs passes non-GM pins only; pinsByUser holds non-GM users only
  const plan = core.gatherPlan({ users, pins: [{ user: "u1", actor: TALO, observes: true }], pinsByUser: { u1: TALO },
    actors: { [TALO]: { id: TALO, name: "Talo" } }, tokensByRoot: { [TALO]: [{ id: "t1", scene: "S", sceneName: "S", level: null, x: 0, y: 0, linked: true, form: null }] } },
  { destSceneId: "D", point: { x: 0, y: 0 }, grid: 100 });
  assert.deepEqual([plan.members.map(m => m.user.id), plan.skipped], [["u1"], []]);
  // with the GM's pin in `pins`, auditPins would count it and mark the player SHARED_ACTOR: the adapter filters it out
});

test("gatherPlan: nobody → empty lists; ties on distance break by user name; a grid object works too", () => {
  const empty = core.gatherPlan({}, { destSceneId: "D", point: { x: 0, y: 0 }, grid: 100 });
  assert.deepEqual(empty, { members: [], skipped: [], offline: [] });
  const users = [{ id: "u2", name: "Bea", active: true, isGM: false }, { id: "u1", name: "Abe", active: true, isGM: false }];
  const tk = (id, x) => ({ id, scene: "D", sceneName: "D", level: null, x, y: 0, linked: true, form: null });
  const plan = core.gatherPlan({ users, pins: [{ user: "u1", actor: TALO }, { user: "u2", actor: MIRA }], pinsByUser: { u1: TALO, u2: MIRA },
    actors: { [TALO]: { id: TALO, name: "Talo" }, [MIRA]: { id: MIRA, name: "Mira" } },
    tokensByRoot: { [TALO]: [tk("t1", 400)], [MIRA]: [tk("t2", 0)] } }, { destSceneId: "D", point: { x: 250, y: 50 }, grid: { size: 100 } });
  assert.deepEqual(plan.members.map(m => m.user.name), ["Abe", "Bea"], "both centres 200 px from the click: by name");
});
